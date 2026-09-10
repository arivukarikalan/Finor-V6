import { supabaseAdmin } from '../config/supabase.js';

/**
 * Cache for premarket reports keyed by `${userId}_${dateKey}`
 */
const reportCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

/**
 * Fetches chart quote data from Yahoo Finance for a given ticker
 */
async function fetchYahooQuote(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.indicators?.quote?.[0]) return null;

    const meta = result.meta;
    const quotes = result.indicators.quote[0];
    const closes = quotes.close?.filter(c => c !== null) || [];
    const highs = quotes.high?.filter(h => h !== null) || [];
    const lows = quotes.low?.filter(l => l !== null) || [];

    const currentPrice = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2] ?? currentPrice;
    const change = currentPrice - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const lastHigh = highs[highs.length - 1] || currentPrice;
    const lastLow = lows[lows.length - 1] || currentPrice;

    return {
      symbol: ticker,
      price: parseFloat(currentPrice.toFixed(2)),
      prevClose: parseFloat(prevClose.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePct: parseFloat(changePct.toFixed(2)),
      high: parseFloat(lastHigh.toFixed(2)),
      low: parseFloat(lastLow.toFixed(2))
    };
  } catch (err) {
    console.error(`[PremarketService] Yahoo quote fetch failed for ${ticker}:`, err.message);
    return null;
  }
}

/**
 * Gathers global macro market indicators
 */
export async function getGlobalMarketCues() {
  const tickers = [
    { key: 'nifty', ticker: '^NSEI', name: 'Nifty 50', region: 'India' },
    { key: 'sensex', ticker: '^BSESN', name: 'BSE Sensex', region: 'India' },
    { key: 'sp500', ticker: '^GSPC', name: 'S&P 500', region: 'USA' },
    { key: 'nasdaq', ticker: '^IXIC', name: 'Nasdaq Comp', region: 'USA' },
    { key: 'dow', ticker: '^DJI', name: 'Dow Jones', region: 'USA' },
    { key: 'nikkei', ticker: '^N225', name: 'Nikkei 225', region: 'Japan' },
    { key: 'crude', ticker: 'BZ=F', name: 'Brent Crude ($/bbl)', region: 'Commodities' },
    { key: 'gold', ticker: 'GC=F', name: 'Gold ($/oz)', region: 'Commodities' },
    { key: 'usdinr', ticker: 'USDINR=X', name: 'USD / INR', region: 'Forex' }
  ];

  const results = await Promise.allSettled(tickers.map(async t => {
    const quote = await fetchYahooQuote(t.ticker);
    return {
      ...t,
      data: quote || {
        symbol: t.ticker,
        price: 0,
        prevClose: 0,
        change: 0,
        changePct: 0,
        high: 0,
        low: 0
      }
    };
  }));

  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

/**
 * Calculates standard Pivot Levels for an index from high, low, close
 */
function calculatePivotLevels(high, low, close) {
  if (!high || !low || !close) {
    return { pivot: 0, r1: 0, r2: 0, s1: 0, s2: 0 };
  }
  const pivot = (high + low + close) / 3;
  const r1 = (2 * pivot) - low;
  const s1 = (2 * pivot) - high;
  const r2 = pivot + (high - low);
  const s2 = pivot - (high - low);

  return {
    pivot: parseFloat(pivot.toFixed(0)),
    r1: parseFloat(r1.toFixed(0)),
    r2: parseFloat(r2.toFixed(0)),
    s1: parseFloat(s1.toFixed(0)),
    s2: parseFloat(s2.toFixed(0))
  };
}

/**
 * Generates the complete, personalized 8:00 AM Pre-Market News Report
 */
export async function generatePremarketReport(userId) {
  const dateKey = new Date().toISOString().substring(0, 10);
  const cacheKey = `${userId}_${dateKey}`;

  const cached = reportCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.report;
  }

  // 1. Fetch Global Cues and user holdings in parallel
  const [globalCues, holdingsRes] = await Promise.all([
    getGlobalMarketCues(),
    supabaseAdmin.from('holdings').select('*').eq('user_id', userId)
  ]);

  const userHoldings = holdingsRes.data || [];
  const holdingSymbols = userHoldings.map(h => h.stock_symbol.toUpperCase());

  // 2. Fetch cached news & corporate actions for user's holdings
  let holdingsNewsMap = {};
  let corporateActionsMap = {};

  if (holdingSymbols.length > 0) {
    try {
      const actionSymbols = holdingSymbols.map(s => `${s}_ACTIONS`);
      const allQuerySymbols = [...holdingSymbols, ...actionSymbols];

      const { data: cachedNewsRows } = await supabaseAdmin
        .from('news_cache')
        .select('*')
        .in('stock_symbol', allQuerySymbols);

      if (cachedNewsRows) {
        cachedNewsRows.forEach(row => {
          if (row.stock_symbol.endsWith('_ACTIONS')) {
            const baseSym = row.stock_symbol.replace('_ACTIONS', '');
            try {
              corporateActionsMap[baseSym] = typeof row.news_content === 'string'
                ? JSON.parse(row.news_content)
                : row.news_content;
            } catch {}
          } else {
            try {
              holdingsNewsMap[row.stock_symbol] = typeof row.news_content === 'string'
                ? JSON.parse(row.news_content)
                : row.news_content;
            } catch {}
          }
        });
      }
    } catch (newsErr) {
      console.error('[PremarketService] Failed to load holdings news cache:', newsErr.message);
    }
  }

  // 3. Process indicators
  const niftyData = globalCues.find(c => c.key === 'nifty')?.data;
  const sp500Data = globalCues.find(c => c.key === 'sp500')?.data;
  const nasdaqData = globalCues.find(c => c.key === 'nasdaq')?.data;
  const nikkeiData = globalCues.find(c => c.key === 'nikkei')?.data;
  const crudeData = globalCues.find(c => c.key === 'crude')?.data;

  // Calculate Nifty Pivots
  const niftyPivots = niftyData 
    ? calculatePivotLevels(niftyData.high, niftyData.low, niftyData.price)
    : { pivot: 24850, r1: 25000, r2: 25150, s1: 24700, s2: 24550 };

  // Determine market opening bias
  let bias = 'NEUTRAL';
  let biasScore = 0;

  if (sp500Data && sp500Data.changePct > 0.3) biasScore += 1;
  else if (sp500Data && sp500Data.changePct < -0.3) biasScore -= 1;

  if (nasdaqData && nasdaqData.changePct > 0.5) biasScore += 1;
  else if (nasdaqData && nasdaqData.changePct < -0.5) biasScore -= 1;

  if (nikkeiData && nikkeiData.changePct > 0.4) biasScore += 1;
  else if (nikkeiData && nikkeiData.changePct < -0.4) biasScore -= 1;

  if (crudeData && crudeData.changePct > 2.0) biasScore -= 1;
  else if (crudeData && crudeData.changePct < -1.5) biasScore += 1;

  if (biasScore >= 2) bias = 'BULLISH';
  else if (biasScore === 1) bias = 'MILDLY BULLISH';
  else if (biasScore <= -2) bias = 'BEARISH';
  else if (biasScore === -1) bias = 'MILDLY BEARISH';

  // Expected opening call
  let openingEstimate = 'Flat open expected';
  if (bias.includes('BULLISH')) {
    openingEstimate = 'Favorable gap-up open (+40 to +80 pts) expected on positive global handover';
  } else if (bias.includes('BEARISH')) {
    openingEstimate = 'Gap-down open (-50 to -90 pts) expected tracking overnight global weakness';
  }

  // 4. Synthesize Personalized Holdings Radar
  const holdingsRadar = userHoldings.map(h => {
    const sym = h.stock_symbol.toUpperCase();
    const articles = holdingsNewsMap[sym] || [];
    const actions = corporateActionsMap[sym] || [];

    const topArticle = articles[0] || null;
    const upcomingAction = actions.find(a => a.is_upcoming) || null;

    let sentiment = 'NEUTRAL';
    if (topArticle?.sentiment) sentiment = topArticle.sentiment;

    return {
      symbol: sym,
      quantity: h.quantity,
      avg_price: h.average_buy_price,
      current_price: h.ltp || h.average_buy_price,
      unrealized_pnl: (h.quantity * (h.ltp || h.average_buy_price)) - (h.quantity * h.average_buy_price),
      headline: topArticle ? topArticle.title : `No breaking headlines for ${sym}. Operating in normal range.`,
      headline_source: topArticle?.source || 'Finor Intelligence',
      headline_url: topArticle?.url || null,
      sentiment,
      upcoming_event: upcomingAction 
        ? `${upcomingAction.type}: ${upcomingAction.description} (${upcomingAction.date ? upcomingAction.date.substring(0, 10) : 'Upcoming'})`
        : null
    };
  });

  // Top stocks in focus today
  const inFocusHoldings = holdingsRadar.filter(h => h.upcoming_event || h.sentiment !== 'NEUTRAL').slice(0, 4);

  // Sectoral highlights
  const sectorWatch = [
    {
      sector: 'IT & Tech',
      outlook: (nasdaqData?.changePct || 0) >= 0 ? 'Bullish' : 'Neutral',
      note: (nasdaqData?.changePct || 0) >= 0 ? 'US Nasdaq tech rebound provides tailwinds' : 'Consolidation mode'
    },
    {
      sector: 'Banking & Financials',
      outlook: bias.includes('BULLISH') ? 'Bullish' : 'Rangebound',
      note: 'Crucial support test near 51,200 level for Bank Nifty'
    },
    {
      sector: 'Auto & Consumer',
      outlook: (crudeData?.changePct || 0) <= 0 ? 'Positive' : 'Neutral',
      note: 'Cooling crude and festive demand boost margins'
    },
    {
      sector: 'Metals & Commodities',
      outlook: 'Neutral',
      note: 'Global commodity volatility requires stoploss discipline'
    }
  ];

  // Tactical trading gameplan
  const tacticalGameplan = [
    bias.includes('BULLISH') 
      ? 'Avoid chasing gap-ups in the first 15 minutes; wait for morning pullback towards Nifty support 24,800 to initiate fresh longs.'
      : 'Maintain strict stop-losses on high-beta positions and look for defensive sectors like Pharma and FMCG.',
    'Review scheduled corporate actions on active holdings before 09:15 AM market opening.',
    'Derivatives players should monitor 25,000 Call open interest for signs of resistance.'
  ];

  const report = {
    report_title: 'Finor 8:00 AM Daily Morning Bell',
    report_subtitle: 'Pre-Market Intelligence, Global Cues & Personalized Holdings Briefing',
    date: dateKey,
    generated_at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    market_bias: bias,
    opening_estimate: openingEstimate,
    headline: `${bias.includes('BULLISH') ? '🚀' : bias.includes('BEARISH') ? '⚠️' : '⚖️'} ${bias} Handover: ${openingEstimate}.`,
    global_cues: globalCues,
    nifty_levels: {
      current: niftyData?.price || 24850,
      change_pct: niftyData?.changePct || 0,
      pivots: niftyPivots
    },
    holdings_count: userHoldings.length,
    holdings_radar: holdingsRadar,
    in_focus_holdings: inFocusHoldings.length > 0 ? inFocusHoldings : holdingsRadar.slice(0, 3),
    sector_watch: sectorWatch,
    tactical_gameplan: tacticalGameplan
  };

  reportCache.set(cacheKey, {
    report,
    timestamp: Date.now()
  });

  return report;
}
