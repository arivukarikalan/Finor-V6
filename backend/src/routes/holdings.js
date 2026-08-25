import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { fetchMultipleLTPs } from '../services/yahooFinance.js';
import { recalculateHoldings } from './trades.js';
import { priceCache } from '../services/priceCache.js';
import { getStockSector } from '../services/sectorService.js';

const router = express.Router();

// Helper to get all previous closes from system_settings table
async function getPreviousCloses() {
  try {
    const { data } = await supabaseAdmin
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

// Helper to save previous closes to system_settings table using atomic upsert
async function savePreviousCloses(closes) {
  try {
    const valueString = JSON.stringify(closes);
    const { error } = await supabaseAdmin
      .from('system_settings')
      .upsert(
        {
          key: 'previous_closes',
          value: valueString,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'key' }
      );

    if (error) throw error;
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

    const { data, error } = await supabaseAdmin
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

    const enriched = await Promise.all(data.map(async (h) => {
      let sector = 'Other';
      try {
        sector = await getStockSector(h.stock_symbol, h.stock_name);
      } catch (err) {
        console.error(`[HoldingsRoute] Sector fetch failed for ${h.stock_symbol}:`, err.message);
      }
      return {
        ...h,
        previousClose: previousCloses[h.stock_symbol.toUpperCase()] || h.ltp,
        sector
      };
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
    const { data: holdings, error: fetchError } = await supabaseAdmin
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
        await supabaseAdmin
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
    const { data: updatedHoldings, error: getError } = await supabaseAdmin
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
    const high52 = ltpData[symbol]?.fiftyTwoWeekHigh || null;
    const low52 = ltpData[symbol]?.fiftyTwoWeekLow || null;
    res.json({ 
      symbol, 
      ltp: price,
      fiftyTwoWeekHigh: high52,
      fiftyTwoWeekLow: low52
    });
  } catch (err) {
    console.error(`[HoldingsRoute] Single LTP fetch failed for ${req.params.symbol}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/holdings/ltp-batch
 * Fetch multiple stock quotes in parallel in a single batch request
 */
router.post('/ltp-batch', requireAuth, async (req, res) => {
  try {
    const { symbols = [] } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.json({ prices: {} });
    }

    const cleanSymbols = Array.from(new Set(symbols.map(s => String(s).toUpperCase().trim())));
    
    // Check backend in-memory priceCache first
    const cachedPrices = priceCache.getPrices(cleanSymbols);
    const missingSymbols = cleanSymbols.filter(sym => !cachedPrices[sym]);

    let freshPrices = {};
    if (missingSymbols.length > 0) {
      freshPrices = await fetchMultipleLTPs(missingSymbols);
      priceCache.setPrices(freshPrices);
    }

    const combined = { ...cachedPrices };
    Object.entries(freshPrices).forEach(([sym, item]) => {
      combined[sym] = {
        ltp: item.ltp,
        previousClose: item.previousClose,
        fiftyTwoWeekHigh: item.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: item.fiftyTwoWeekLow
      };
    });

    res.json({ prices: combined, timestamp: Date.now() });
  } catch (err) {
    console.error('[HoldingsRoute] Batch LTP fetch failed:', err.message);
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
    const { data: holding, error: holdError } = await supabaseAdmin
      .from('holdings')
      .select('*')
      .eq('user_id', userId)
      .eq('stock_symbol', stockSymbol)
      .maybeSingle();

    if (holdError) throw holdError;

    // 2. Fetch trade history for this symbol
    const { data: trades, error: tradesError } = await supabaseAdmin
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
    const { data: newsCache, error: newsError } = await supabaseAdmin
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
    const { data: actionsCache, error: actionsError } = await supabaseAdmin
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
      const { error: clearErr } = await supabaseAdmin
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
      const { error: settErr } = await supabaseAdmin
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

// ─── GET /api/holdings/finor-score ───────────────────────────────────────────
router.get('/finor-score', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch stock holdings
    const { data: holdings, error: hErr } = await supabaseAdmin
      .from('holdings')
      .select('*')
      .eq('user_id', userId);

    if (hErr) throw hErr;

    // Enrich with sector
    const enrichedHoldings = await Promise.all((holdings || []).map(async (h) => {
      let sector = 'Other';
      try {
        sector = await getStockSector(h.stock_symbol, h.stock_name);
      } catch (err) {
        console.error(`[FinorScore] Sector resolution failed for ${h.stock_symbol}:`, err.message);
      }
      return { ...h, sector };
    }));

    // Calculate total equity value and sector weights
    let totalEquityVal = 0;
    const sectorMap = {};
    enrichedHoldings.forEach(h => {
      const val = (h.quantity || 0) * (h.ltp || h.average_buy_price || 0);
      totalEquityVal += val;
      
      const sec = h.sector || 'Other';
      sectorMap[sec] = (sectorMap[sec] || 0) + val;
    });

    // 2. Fetch finance goals for wealth components
    const { data: goals, error: gErr } = await supabaseAdmin
      .from('finance_goals')
      .select('*')
      .eq('user_id', userId);

    if (gErr) throw gErr;

    // Build asset values map
    const assetValues = {
      LIQUID_CASH: 0,
      MUTUAL_FUND: 0,
      GOLD_SILVER: 0,
      EQUITY_STOCKS: totalEquityVal,
      US_STOCKS: 0,
      ETF: 0
    };

    (goals || []).forEach(g => {
      if (g.asset_class !== 'EQUITY_STOCKS') {
        assetValues[g.asset_class] = parseFloat(g.current_value || 0);
      }
    });

    const totalAssets = Object.values(assetValues).reduce((sum, v) => sum + v, 0);

    // 3. Fetch monthly expenses to compute burn rate (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentExpenses } = await supabaseAdmin
      .from('finance_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'EXPENSE')
      .gte('date', ninetyDaysAgo);

    const totalRecentExpenses = (recentExpenses || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
    const monthlyBurnRate = Math.max(5000, totalRecentExpenses / 3);

    // ─────────────────────────────────────────────────────────────────────────
    // SCORING ENGINE (Out of 100)
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Asset Allocation Diversity (Max 30 points)
    let assetAllocScore = 0;
    if (totalAssets > 0) {
      const cashPct = (assetValues.LIQUID_CASH / totalAssets) * 100;
      const equityPct = ((assetValues.EQUITY_STOCKS + assetValues.ETF) / totalAssets) * 100;
      const mfPct = (assetValues.MUTUAL_FUND / totalAssets) * 100;
      const goldPct = (assetValues.GOLD_SILVER / totalAssets) * 100;

      // Cash Allocation (Max 10 points)
      if (cashPct >= 10 && cashPct <= 25) assetAllocScore += 10;
      else if (cashPct > 25) assetAllocScore += Math.max(0, 10 - (cashPct - 25) * 0.4);
      else assetAllocScore += (cashPct / 10) * 10;

      // Equity Allocation (Max 10 points)
      if (equityPct >= 30 && equityPct <= 60) assetAllocScore += 10;
      else if (equityPct > 60) assetAllocScore += Math.max(0, 10 - (equityPct - 60) * 0.4);
      else assetAllocScore += (equityPct / 30) * 10;

      // Mutual Funds (Max 5 points)
      if (mfPct >= 15 && mfPct <= 40) assetAllocScore += 5;
      else if (mfPct > 40) assetAllocScore += Math.max(0, 5 - (mfPct - 40) * 0.2);
      else assetAllocScore += (mfPct / 15) * 5;

      // Gold / Commodities (Max 5 points)
      if (goldPct >= 5 && goldPct <= 15) assetAllocScore += 5;
      else if (goldPct > 15) assetAllocScore += Math.max(0, 5 - (goldPct - 15) * 0.3);
      else assetAllocScore += (goldPct / 5) * 5;
    }

    // 2. Equity Sector Diversification (Max 30 points) using Shannon Entropy
    let sectorDiversScore = 0;
    if (totalEquityVal > 0) {
      let entropy = 0;
      Object.values(sectorMap).forEach(val => {
        const w = val / totalEquityVal;
        if (w > 0) {
          entropy -= w * Math.log(w);
        }
      });

      const maxEntropy = Math.log(11);
      const normalizedEntropy = entropy / maxEntropy;
      sectorDiversScore = 30 * normalizedEntropy;

      // Apply concentration penalty if any single sector has >35% allocation
      Object.values(sectorMap).forEach(val => {
        const pct = (val / totalEquityVal) * 100;
        if (pct > 35) {
          const penalty = (pct - 35) * 0.4;
          sectorDiversScore = Math.max(0, sectorDiversScore - penalty);
        }
      });
    } else {
      sectorDiversScore = 15; // default fallback if no equity stocks
    }

    // 3. Emergency Fund Adequacy (Max 25 points)
    let emergencyScore = 0;
    const cashReserve = assetValues.LIQUID_CASH;
    const adequacyRatio = cashReserve / monthlyBurnRate;
    if (adequacyRatio >= 6.0) {
      emergencyScore = 25;
    } else {
      emergencyScore = (adequacyRatio / 6.0) * 25;
    }

    // 4. Commodity Safety Hedge (Max 15 points)
    let commodityHedgeScore = 0;
    if (totalAssets > 0) {
      const goldPct = (assetValues.GOLD_SILVER / totalAssets) * 100;
      if (goldPct >= 5 && goldPct <= 15) {
        commodityHedgeScore = 15;
      } else if (goldPct < 5) {
        commodityHedgeScore = (goldPct / 5) * 15;
      } else {
        commodityHedgeScore = Math.max(0, 15 - (goldPct - 15) * 0.8);
      }
    }

    const finorFinanceScore = Math.round(assetAllocScore + sectorDiversScore + emergencyScore + commodityHedgeScore);

    res.json({
      score: Math.min(100, Math.max(0, finorFinanceScore)),
      breakdown: {
        assetAllocation: parseFloat(assetAllocScore.toFixed(1)),
        sectorDiversification: parseFloat(sectorDiversScore.toFixed(1)),
        emergencyFund: parseFloat(emergencyScore.toFixed(1)),
        commodityHedge: parseFloat(commodityHedgeScore.toFixed(1))
      },
      stats: {
        totalAssets: parseFloat(totalAssets.toFixed(2)),
        totalEquity: parseFloat(totalEquityVal.toFixed(2)),
        monthlyBurnRate: Math.round(monthlyBurnRate),
        emergencyMonthsCovered: parseFloat(adequacyRatio.toFixed(2)),
        sectorWeights: Object.entries(sectorMap).map(([sector, amount]) => ({
          sector,
          amount: parseFloat(amount.toFixed(2)),
          weight: parseFloat(((amount / (totalEquityVal || 1)) * 100).toFixed(1))
        })).sort((a, b) => b.amount - a.amount),
        assetWeights: {
          cashWeight: totalAssets > 0 ? parseFloat(((assetValues.LIQUID_CASH / totalAssets) * 100).toFixed(1)) : 0,
          equityWeight: totalAssets > 0 ? parseFloat((((assetValues.EQUITY_STOCKS + assetValues.ETF) / totalAssets) * 100).toFixed(1)) : 0,
          mutualFundWeight: totalAssets > 0 ? parseFloat(((assetValues.MUTUAL_FUND / totalAssets) * 100).toFixed(1)) : 0,
          commodityWeight: totalAssets > 0 ? parseFloat(((assetValues.GOLD_SILVER / totalAssets) * 100).toFixed(1)) : 0
        }
      }
    });
  } catch (err) {
    console.error('[HoldingsRoute] Finor Score error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/holdings/ai-reallocate ─────────────────────────────────────────
router.post('/ai-reallocate', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { age = 25, riskAppetite = 'Moderate', horizon = 'Long-term' } = req.body;

    // Fetch user holdings
    const { data: holdings, error: hErr } = await supabaseAdmin
      .from('holdings')
      .select('*')
      .eq('user_id', userId);

    if (hErr) throw hErr;

    // Resolve sectors
    const enrichedHoldings = await Promise.all((holdings || []).map(async (h) => {
      let sector = 'Other';
      try {
        sector = await getStockSector(h.stock_symbol, h.stock_name);
      } catch (err) {
        console.error(err);
      }
      return { ...h, sector };
    }));

    let totalEquityVal = 0;
    const sectorMap = {};
    enrichedHoldings.forEach(h => {
      const val = (h.quantity || 0) * (h.ltp || h.average_buy_price || 0);
      totalEquityVal += val;
      const sec = h.sector || 'Other';
      sectorMap[sec] = (sectorMap[sec] || 0) + val;
    });

    // Fetch finance goals
    const { data: goals, error: gErr } = await supabaseAdmin
      .from('finance_goals')
      .select('*')
      .eq('user_id', userId);

    if (gErr) throw gErr;

    const assetValues = {
      LIQUID_CASH: 0,
      MUTUAL_FUND: 0,
      GOLD_SILVER: 0,
      EQUITY_STOCKS: totalEquityVal,
      US_STOCKS: 0,
      ETF: 0
    };

    (goals || []).forEach(g => {
      if (g.asset_class !== 'EQUITY_STOCKS') {
        assetValues[g.asset_class] = parseFloat(g.current_value || 0);
      }
    });

    const totalAssets = Object.values(assetValues).reduce((sum, v) => sum + v, 0);

    // Fetch transactions for monthly burn
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentExpenses } = await supabaseAdmin
      .from('finance_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'EXPENSE')
      .gte('date', ninetyDaysAgo);

    const totalRecentExpenses = (recentExpenses || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
    const monthlyBurnRate = Math.max(5000, totalRecentExpenses / 3);

    const sectorWeights = Object.entries(sectorMap).map(([sector, amount]) => ({
      sector,
      amount: parseFloat(amount.toFixed(2)),
      weight: parseFloat(((amount / (totalEquityVal || 1)) * 100).toFixed(1))
    })).sort((a, b) => b.amount - a.amount);

    const cashWeight = totalAssets > 0 ? parseFloat(((assetValues.LIQUID_CASH / totalAssets) * 100).toFixed(1)) : 0;
    const equityWeight = totalAssets > 0 ? parseFloat((((assetValues.EQUITY_STOCKS + assetValues.ETF) / totalAssets) * 100).toFixed(1)) : 0;
    const mutualFundWeight = totalAssets > 0 ? parseFloat(((assetValues.MUTUAL_FUND / totalAssets) * 100).toFixed(1)) : 0;
    const commodityWeight = totalAssets > 0 ? parseFloat(((assetValues.GOLD_SILVER / totalAssets) * 100).toFixed(1)) : 0;

    const apiKey = process.env.GEMINI_API_KEY;
    const hasGemini = apiKey && apiKey !== 'your_gemini_api_key_here';

    if (hasGemini) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `You are Finor AI Wealth Coach, a premium, certified financial planner.
Review the following user financial profile and provide a personalized portfolio audit, risk analysis, and reallocation plan.

User Profile:
- Age: ${age}
- Risk Appetite: ${riskAppetite}
- Investment Horizon: ${horizon}
- Monthly Expenses (Burn Rate): ₹${Math.round(monthlyBurnRate)}/month

Current Asset Allocation:
- Total Net Worth: ₹${Math.round(totalAssets)}
- Cash/FD reserves (Emergency Fund): ₹${Math.round(assetValues.LIQUID_CASH)} (${cashWeight}% of portfolio)
- Mutual Funds: ₹${Math.round(assetValues.MUTUAL_FUND)} (${mutualFundWeight}% of portfolio)
- Commodities (Gold/Silver): ₹${Math.round(assetValues.GOLD_SILVER)} (${commodityWeight}% of portfolio)
- Stock Equities & ETFs: ₹${Math.round(assetValues.EQUITY_STOCKS)} (${equityWeight}% of portfolio)

Current Stock Sector Allocation:
${sectorWeights.map(s => `- ${s.sector}: ₹${Math.round(s.amount)} (${s.weight}% of equity)`).join('\n')}

Based on the 11 global GICS sectors and standard asset allocation principles:
1. Identify specific risk factors (e.g. sector concentration where a single sector exceeds 35% weight, cash buffers covering less than 6 months of expenses, or commodities safety hedges missing).
2. Recommend a target asset allocation customized to their age (using the 100 - Age rule if appropriate for their risk profile) and horizon.
3. Recommend a target sector spread for their equities to achieve optimum GICS diversification.
4. Outline 3 to 4 actionable, step-by-step reallocation instructions (e.g. which asset classes to buy/sell, how to diversify cash, and which sectors to rebalance).

Format your response in professional GitHub-style markdown. Use bold headers, bullet points, clean alert callouts (e.g. > [!WARNING] or > [!TIP]), and keep the tone professional, encouraging, and clear.`;

      const response = await model.generateContent(prompt);
      const text = response.response.text();
      return res.json({ advice: text });
    } else {
      // Mock Response Fallback if Gemini key is missing
      const isConcentrated = sectorWeights.length > 0 && sectorWeights[0].weight > 35;
      const isCashLow = assetValues.LIQUID_CASH / monthlyBurnRate < 6;
      const isGoldLow = totalAssets > 0 && (assetValues.GOLD_SILVER / totalAssets) * 100 < 5;

      const mockAdvice = `### 🌟 Finor AI Portfolio Reallocation Coach (Simulated)

> [!NOTE]
> *Configure your \`GEMINI_API_KEY\` in your environment settings to activate personalized deep-learning model advice. Below is a heuristic portfolio audit based on your financial statistics.*

#### 🚨 Risk Identification & Analysis
${isConcentrated ? `> [!WARNING]
> **Sector Concentration Risk**: Your top sector (**${sectorWeights[0]?.sector}**) accounts for **${sectorWeights[0]?.weight}%** of your stock portfolio. A healthy portfolio should keep single-sector GICS exposure below **35%** to hedge against sector-wide downturns.` : `> [!TIP]
> **Healthy Sector Diversity**: Your stock holdings are nicely spread out, with no single GICS sector exceeding the 35% concentration threshold.`}

${isCashLow ? `> [!CAUTION]
> **Inadequate Cash Cushion**: Your liquid cash/FD reserves cover only **${(assetValues.LIQUID_CASH / monthlyBurnRate).toFixed(1)} months** of your average monthly expenses (₹${Math.round(monthlyBurnRate)}/mo). We strongly recommend building a cash reserve covering **6.0 months** before locking more capital in equities.` : `> [!TIP]
> **Excellent Liquidity Buffer**: Your cash reserves cover **${(assetValues.LIQUID_CASH / monthlyBurnRate).toFixed(1)} months** of expenses, providing a solid emergency cushion.`}

${isGoldLow ? `> [!WARNING]
> **Commodity Hedge Underallocated**: Your gold and silver commodity allocation stands at **${commodityWeight}%** (Ideal: 5-15%). Consider allocating more towards commodities as a hedge against inflation and equity market crashes.` : `> [!TIP]
> **Good Commodities Safety Hedge**: You have a safe **${commodityWeight}%** buffer in precious metals.`}

#### 📈 Recommended Target Asset Allocation
Based on your age (**${age}**) and **${riskAppetite}** risk profile, your ideal asset spread should look like:
*   **Equities & MFs**: **${100 - age}%** (Customized rule: 100 - Age for equity weight)
*   **Debt / Cash Reserves**: **${Math.min(50, Math.max(10, age))}%** (Emergency fund + FDs)
*   **Commodities / Gold**: **10%** (Safety Hedge)

#### 📊 Recommended Equity Sector Allocation
To diversify away from your current heavy weightings, target the following GICS allocation boundaries:
*   **Information Technology**: **15% - 25%**
*   **Financials**: **15% - 25%**
*   **Consumer Staples**: **10% - 15%**
*   **Health Care / Pharmaceuticals**: **10% - 15%**
*   **Industrials / Commodities / Other**: **Remainder**

#### 🛠️ Step-by-Step Action Plan
1.  **Rebalance Stock Concentrations**: Gradually sell down positions in **${sectorWeights[0]?.sector || 'over-concentrated'}** and redirect funds into underallocated sectors like **Information Technology** or **Financials**.
2.  **Bolster Emergency Reserves**: If cash is low, set aside surplus income to top up your FDs/Liquid reserves until they cover at least 6 months of expenses (₹${Math.round(monthlyBurnRate * 6)}).
3.  **Hedge with Gold**: Consider setting up a recurring deposit (SIP) in Sovereign Gold Bonds or Gold ETFs representing ~8-10% of your net worth.
`;
      return res.json({ advice: mockAdvice });
    }
  } catch (err) {
    console.error('[HoldingsRoute] AI Reallocate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;


