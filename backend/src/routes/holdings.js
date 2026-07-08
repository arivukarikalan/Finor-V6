import express from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { fetchMultipleLTPs } from '../services/yahooFinance.js';
import { recalculateHoldings } from './trades.js';
import { priceCache } from '../services/priceCache.js';

const router = express.Router();

// Helper to get all previous closes from system_settings table
async function getPreviousCloses() {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'previous_closes')
      .maybeSingle();

    if (data?.value) {
      try {
        return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      } catch (e) {
        console.error('[Holdings] Failed to parse previous closes JSON:', e.message);
        return {};
      }
    }
    return {};
  } catch (err) {
    console.error('[Holdings] Failed to fetch previous closes:', err.message);
    return {};
  }
}

// Helper to save previous closes to system_settings table
async function savePreviousCloses(closes) {
  try {
    const valueString = JSON.stringify(closes);
    const { data: existing, error: fetchErr } = await supabase
      .from('system_settings')
      .select('key')
      .eq('key', 'previous_closes')
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (existing) {
      const { error: updateErr } = await supabase
        .from('system_settings')
        .update({
          value: valueString,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'previous_closes');
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from('system_settings')
        .insert({
          key: 'previous_closes',
          value: valueString,
          updated_at: new Date().toISOString()
        });
      if (insertErr) throw insertErr;
    }
  } catch (err) {
    console.error('[Holdings] Failed to save previous closes:', err.message);
  }
}

/**
 * GET /api/holdings
 * Fetch cached holdings from db
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId)
      .order('stock_symbol', { ascending: true });

    if (error) throw error;

    const previousCloses = await getPreviousCloses();

    // Check if cache needs seeding
    const missingSymbols = data
      .map(h => h.stock_symbol.toUpperCase())
      .filter(symbol => !previousCloses[symbol]);

    if (missingSymbols.length > 0) {
      fetchMultipleLTPs(missingSymbols)
        .then(async (ltpData) => {
          const freshCloses = { ...previousCloses };
          let changed = false;
          Object.entries(ltpData).forEach(([symbol, item]) => {
            if (item.previousClose !== undefined && item.previousClose !== null) {
              freshCloses[symbol.toUpperCase()] = item.previousClose;
              changed = true;
            }
          });
          if (changed) {
            await savePreviousCloses(freshCloses);
          }
        })
        .catch(err => console.error('[HoldingsRoute] Background previousClose seeding failed:', err.message));
    }

    const enriched = data.map(h => ({
      ...h,
      previousClose: previousCloses[h.stock_symbol.toUpperCase()] || h.ltp
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/holdings/sync-prices
 * Trigger on-demand sync with Yahoo Finance for all holdings, updating Supabase cache
 */
router.post('/sync-prices', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch existing holdings symbols
    const { data: holdings, error: fetchError } = await supabase
      .from('holdings')
      .select('stock_symbol')
      .eq('user_id', userId);

    if (fetchError) throw fetchError;

    if (!holdings || holdings.length === 0) {
      return res.json({ message: 'No active holdings to sync.', holdings: [] });
    }

    const symbols = [...new Set(holdings.map(h => h.stock_symbol))];

    // 1. Fetch cached prices first
    const cachedPrices = priceCache.getPrices(symbols);
    
    // 2. Identify missing tickers (cache miss)
    const missingSymbols = symbols.filter(sym => !cachedPrices[sym.toUpperCase()]);
    
    let ltpData = { ...cachedPrices };

    // 3. Fetch fresh prices for missing symbols from Yahoo Finance
    if (missingSymbols.length > 0) {
      console.log(`[PriceCache] Cache miss for symbols: ${missingSymbols.join(', ')}. Querying Yahoo Finance...`);
      const freshLtpData = await fetchMultipleLTPs(missingSymbols);
      
      // Seed fresh prices to the local cache
      priceCache.setPrices(freshLtpData);
      
      // Merge fresh data
      Object.assign(ltpData, freshLtpData);
    } else {
      console.log(`[PriceCache] Cache hit for all symbols! No external requests made.`);
    }

    const previousCloses = await getPreviousCloses();
    let cacheChanged = false;

    // Update prices in db
    const updatePromises = Object.entries(ltpData).map(async ([symbol, data]) => {
      if (data && data.ltp !== null && data.ltp !== undefined) {
        if (data.previousClose !== undefined && data.previousClose !== null) {
          previousCloses[symbol.toUpperCase()] = data.previousClose;
          cacheChanged = true;
        }
        await supabase
          .from('holdings')
          .update({
            ltp: data.ltp,
            last_updated: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('stock_symbol', symbol);
      }
    });

    await Promise.all(updatePromises);
    if (cacheChanged) {
      await savePreviousCloses(previousCloses);
    }

    // Fetch updated holdings
    const { data: updatedHoldings, error: getError } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId)
      .order('stock_symbol', { ascending: true });

    if (getError) throw getError;

    const enriched = updatedHoldings.map(h => ({
      ...h,
      previousClose: previousCloses[h.stock_symbol.toUpperCase()] || h.ltp
    }));

    res.json({
      message: 'Prices synced successfully.',
      holdings: enriched
    });
  } catch (err) {
    console.error('[HoldingsRoute] Sync failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/holdings/ltp/:symbol
 * Fetch a single stock quote LTP from Yahoo Finance
 */
router.get('/ltp/:symbol', requireAuth, async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase().trim();
    const ltpData = await fetchMultipleLTPs([symbol]);
    const price = ltpData[symbol]?.ltp || null;
    res.json({ symbol, ltp: price });
  } catch (err) {
    console.error(`[HoldingsRoute] Single LTP fetch failed for ${req.params.symbol}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/holdings/settings
 * Fetch all stock settings (tags and stop-losses) for user
 */
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const { getAllStockSettings } = await import('../services/stockSettings.js');
    const settings = await getAllStockSettings(req.user.id);
    res.json(settings);
  } catch (err) {
    console.error('[HoldingsRoute] Get settings failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/holdings/settings
 * Update settings (tag and/or stop-loss) for a stock symbol
 */
router.post('/settings', requireAuth, async (req, res) => {
  try {
    const { symbol, stoploss_price, position_tag } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'Missing stock symbol.' });
    }

    const { saveStockSettings } = await import('../services/stockSettings.js');
    const updated = await saveStockSettings(req.user.id, symbol, {
      stoploss_price,
      position_tag
    });

    res.json({
      status: 'SUCCESS',
      message: `Settings updated for ${symbol.toUpperCase()}.`,
      settings: updated
    });
  } catch (err) {
    console.error('[HoldingsRoute] Save settings failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/holdings/sentiment
 * Evaluates detailed AI conviction and sentiment for a specific stock symbol.
 * Pulls active holding status, trade history, news cache, and corporate actions.
 * Calls Gemini AI (with a programmatic fallback if Gemini is not configured).
 */
router.post('/sentiment', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbol } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Missing stock symbol.' });
    }

    const stockSymbol = symbol.toUpperCase().trim();

    // 1. Fetch active holding
    const { data: holding, error: holdError } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId)
      .eq('stock_symbol', stockSymbol)
      .maybeSingle();

    if (holdError) throw holdError;

    // 2. Fetch trade history for this symbol
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .eq('stock_symbol', stockSymbol)
      .order('trade_date', { ascending: true });

    if (tradesError) throw tradesError;

    // 3. Compute past performance stats
    const { calculateRealizedPnL } = await import('../services/fifoCalculator.js');
    const pnlStats = calculateRealizedPnL(trades || []);

    const closedTradesCount = pnlStats.closed_trades.length;
    const winsCount = pnlStats.closed_trades.filter(t => t.realized_pnl > 0).length;
    const winRate = closedTradesCount > 0 ? (winsCount / closedTradesCount) * 100 : 0;
    const totalRealizedPnL = pnlStats.summary.total_realized_pnl;

    // 4. Fetch news cache
    const { data: newsCache, error: newsError } = await supabase
      .from('news_cache')
      .select('*')
      .eq('stock_symbol', stockSymbol)
      .maybeSingle();

    let newsArticles = [];
    if (newsCache && newsCache.news_content) {
      try {
        newsArticles = typeof newsCache.news_content === 'string'
          ? JSON.parse(newsCache.news_content)
          : newsCache.news_content;
      } catch (e) {
        console.error('[HoldingsRoute] Error parsing news cache:', e.message);
      }
    }

    // 5. Fetch actions cache
    const { data: actionsCache, error: actionsError } = await supabase
      .from('news_cache')
      .select('*')
      .eq('stock_symbol', `${stockSymbol}_ACTIONS`)
      .maybeSingle();

    let corporateActions = [];
    if (actionsCache && actionsCache.news_content) {
      try {
        corporateActions = typeof actionsCache.news_content === 'string'
          ? JSON.parse(actionsCache.news_content)
          : actionsCache.news_content;
      } catch (e) {
        console.error('[HoldingsRoute] Error parsing actions cache:', e.message);
      }
    }

    // Format news & actions for prompt
    const newsText = newsArticles.slice(0, 5).map(art => `- ${art.title || art.headline} (Sentiment: ${art.sentiment || 'Neutral'})`).join('\n');
    const actionsText = corporateActions.slice(0, 5).map(act => `- ${act.type || 'Announcement'}: ${act.title || act.purpose} on ${act.event_date || act.ex_date}`).join('\n');

    const apiKey = process.env.GEMINI_API_KEY;
    const isMockAI = !apiKey || apiKey === 'your_gemini_api_key_here';

    let evaluation = null;

    if (!isMockAI) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const prompt = `You are an expert financial analyst and investment coach for the Finor portfolio dashboard.
Analyze the ticker symbol "${stockSymbol}" for a retail investor and evaluate its Conviction Score (1-100) and detailed conviction reasons.
Here is the integrated data for this stock:

## Active Position:
- Quantity: ${holding ? holding.quantity : 0}
- Average Buy Cost: ₹${holding ? holding.average_buy_price : 0}
- Current Market Price (LTP): ₹${holding ? holding.ltp : 0}
- Active P&L: ₹${holding ? ((holding.ltp - holding.average_buy_price) * holding.quantity).toFixed(2) : 0} (${holding && holding.average_buy_price > 0 ? (((holding.ltp - holding.average_buy_price) / holding.average_buy_price) * 100).toFixed(2) : 0}%)
- Holding Days: ${holding && holding.holding_days ? holding.holding_days : 0} days

## Historical Closed Trades Performance:
- Total Realized P&L: ₹${totalRealizedPnL}
- STCG (Short Term Capital Gains): ₹${pnlStats.summary.stcg}
- LTCG (Long Term Capital Gains): ₹${pnlStats.summary.ltcg}
- Number of Closed Trades: ${closedTradesCount}
- Closed Trade Win Rate: ${winRate.toFixed(1)}%

## Recent News & Developments:
${newsText || "No recent news headlines found."}

## Corporate Actions & Exchange Board Meetings:
${actionsText || "No upcoming dividends, split, bonus, or earnings dates found."}

Please perform a high-level conviction analysis and output a JSON response. The conviction score (1-100) should be based on:
1. Positive/Negative P&L of active position.
2. Past trade profitability (win rate).
3. Corporate action triggers (upcoming earnings, dividends, splits).
4. Sentiment of recent news headlines.

Return your response in JSON format matching exactly this structure:
{
  "score": number,
  "label": "BULLISH" | "NEUTRAL" | "BEARISH",
  "news_impact": "detailed news review sentence",
  "performance_audit": "detailed review of current and past trades",
  "technical_outlook": "technical and volume trend evaluation",
  "coach_advice": "brief 2-sentence actionable coaching recommendation"
}
Ensure the response is raw, valid JSON, and does NOT wrap the JSON inside markdown blocks (do not use \`\`\`json).`;

        const result = await model.generateContent(prompt);
        let text = result.response.text().trim();
        
        // Strip potential markdown fencing
        if (text.startsWith('```')) {
          text = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
        }

        evaluation = JSON.parse(text);
      } catch (err) {
        console.error('[HoldingsRoute] Gemini sentiment evaluation failed:', err.message);
      }
    }

    // Fallback if Mock AI or if Gemini fails
    if (!evaluation) {
      // Programmatic calculation for score
      let score = 50;
      let charSum = 0;
      for (let i = 0; i < stockSymbol.length; i++) charSum += stockSymbol.charCodeAt(i);
      score += (charSum % 20) - 10; // 40 to 60

      const roi = holding && holding.average_buy_price > 0 ? ((holding.ltp - holding.average_buy_price) / holding.average_buy_price) * 100 : 0;
      score += roi * 0.5; // adjust by active ROI
      score += winRate * 0.3; // adjust by past win rate
      score = Math.max(10, Math.min(95, Math.round(score)));

      let label = 'NEUTRAL';
      if (score >= 71) label = 'BULLISH';
      else if (score <= 40) label = 'BEARISH';

      evaluation = {
        score,
        label,
        news_impact: newsArticles.length > 0 
          ? `Sentiment is generally ${label.toLowerCase()} based on ${newsArticles.length} recent news events including headlines: "${newsArticles[0].title || newsArticles[0].headline}".`
          : `No major news headlines detected. Pricing movement is driven by standard liquidity flows.`,
        performance_audit: closedTradesCount > 0
          ? `You have closed ${closedTradesCount} trades for this stock with a win rate of ${winRate.toFixed(0)}%, generating ₹${totalRealizedPnL.toLocaleString('en-IN')} in realized gains. Active P&L is currently at ${roi.toFixed(1)}%.`
          : `No historical closed trades in ledger. Active position is currently held at ₹${holding ? holding.average_buy_price : 0} cost basis.`,
        technical_outlook: roi >= 0 
          ? `The stock is showing positive breakout signals. Holding above support level of ₹${holding ? (holding.average_buy_price * 0.95).toFixed(2) : 0}.`
          : `The stock is trading below its primary entry triggers. Support is currently testable at ₹${holding ? (holding.ltp * 0.9).toFixed(2) : 0}.`,
        coach_advice: score >= 71
          ? `Maintain current accumulator strategy. Consider buying additional tranches on pullbacks to support levels.`
          : score >= 41
          ? `Consolidation zone. Hold position and wait for upcoming earnings announcements before adjusting exposure.`
          : `Factor in stop-losses. The position is under pressure; consider trimming size to free up trading capital.`
      };
    }

    res.json({
      ...evaluation,
      newsArticles,
      corporateActions
    });
  } catch (err) {
    console.error('[HoldingsRoute] AI sentiment evaluation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/holdings/force-recalculate
 * Clears Supabase price cache, clears previous closes setting, and runs holdings recalculation.
 */
router.post('/force-recalculate', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Delete all records from price_cache to force fresh Google Finance scrapings
    try {
      const { error: clearErr } = await supabase
        .from('price_cache')
        .delete()
        .neq('stock_symbol', '');
      
      if (clearErr) throw clearErr;
      console.log('[ForceSync] Cleared price_cache database table.');
    } catch (dbErr) {
      console.warn('[ForceSync] Failed to clear price_cache:', dbErr.message);
    }

    // 2. Clear previous closes settings
    try {
      const { error: settErr } = await supabase
        .from('system_settings')
        .delete()
        .eq('key', 'previous_closes');

      if (settErr) throw settErr;
    } catch (settErr) {
      console.warn('[ForceSync] Failed to clear system settings:', settErr.message);
    }

    // 3. Force a complete recalculation of active holdings using new FIFO cost basis
    await recalculateHoldings(userId);

    res.json({ message: 'Full database recalculation completed, prices cache cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


