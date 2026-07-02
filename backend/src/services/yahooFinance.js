// Native global fetch is supported in Node.js v18+
import { supabase } from '../config/supabase.js';

/**
 * Helper to perform fetch with a timeout using AbortController.
 * This prevents rate-limited API requests from hanging indefinitely.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Fallback live price fetch from Yahoo Finance
 */
export async function fetchLTPYahoo(symbol) {
  const ticker = symbol.includes('.') ? symbol : `${symbol}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`;
  
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 8000);
    
    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }
    
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      throw new Error(`No market data found for ticker ${ticker}`);
    }
    
    const ltp = result.meta?.regularMarketPrice;
    const previousClose = result.meta?.chartPreviousClose || result.meta?.previousClose;
    
    if (ltp === undefined || ltp === null) {
      throw new Error(`LTP is undefined for ${ticker}`);
    }
    
    return {
      symbol,
      ticker,
      ltp: parseFloat(ltp),
      previousClose: previousClose ? parseFloat(previousClose) : null
    };
  } catch (error) {
    console.error(`[YahooFinance Fallback] Error fetching price for ${symbol}:`, error.message);
    throw error;
  }
}

/**
 * Fetches the Last Traded Price (LTP) and other market info for a given stock symbol from Google Finance.
 * Automatically falls back to Yahoo Finance if Google Finance fails.
 * 
 * @param {string} symbol - e.g. "RELIANCE" or "INFY"
 * @returns {Promise<{symbol: string, ticker: string, ltp: number, previousClose: number}>}
 */
export async function fetchLTP(symbol) {
  let googleTicker = symbol.toUpperCase();
  if (googleTicker === '^NSEI' || googleTicker === 'NIFTY') {
    googleTicker = 'NIFTY_50:INDEXNSE';
  } else {
    if (googleTicker.endsWith('.NS')) {
      googleTicker = googleTicker.substring(0, googleTicker.length - 3);
    }
    googleTicker = `${googleTicker}:NSE`;
  }

  const url = `https://www.google.com/finance/quote/${googleTicker}`;
  
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, 8000);
    
    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }
    
    const html = await response.text();
    
    const priceMatch = html.match(/class="N6SYTe"[^>]*><span jsname="Pdsbrc"[^>]*><span>₹?([^<]+)</);
    if (!priceMatch) {
      throw new Error(`Price element class N6SYTe not found for ${googleTicker}`);
    }
    
    const priceStr = priceMatch[1].replace(/,/g, '');
    const ltp = parseFloat(priceStr);
    
    const changeMatch = html.match(/jsname="xnruHf"[^>]*><span>₹?([-+0-9,.]+)</);
    let changeVal = 0;
    if (changeMatch) {
      changeVal = parseFloat(changeMatch[1].replace(/,/g, ''));
    }
    
    const previousClose = ltp - changeVal;
    
    return {
      symbol,
      ticker: googleTicker,
      ltp,
      previousClose
    };
  } catch (error) {
    console.warn(`[GoogleFinance] Live price fetch failed for ${symbol}: ${error.message}. Falling back to Yahoo Finance...`);
    return await fetchLTPYahoo(symbol);
  }
}

/**
 * Fetches prices for multiple symbols concurrently.
 * 
 * @param {string[]} symbols - e.g. ["RELIANCE", "TCS", "INFY"]
 * @returns {Promise<Record<string, {ltp: number, previousClose: number}>>}
 */
export async function fetchMultipleLTPs(symbols) {
  const results = {};
  const promises = symbols.map(async (symbol) => {
    try {
      const data = await fetchLTP(symbol);
      results[symbol] = {
        ltp: data.ltp,
        previousClose: data.previousClose
      };
    } catch (err) {
      results[symbol] = {
        ltp: null,
        previousClose: null,
        error: err.message
      };
    }
  });
  
  await Promise.all(promises);
  return results;
}

/**
 * Fetches historical price quotes for a stock symbol for the given period.
 * Checks the database price_cache first to avoid API throttling and speed up loading.
 * 
 * @param {string} symbol - e.g. "RELIANCE"
 * @param {string} period - "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL"
 * @returns {Promise<Array<{date: string, year: number, month: number, close: number}>>}
 */
export async function fetchHistoricalPrices(symbol, period = '1Y') {
  // Check Supabase cache first
  try {
    const { data: cached, error: cacheErr } = await supabase
      .from('price_cache')
      .select('price_data, updated_at')
      .eq('stock_symbol', symbol)
      .eq('period', period)
      .maybeSingle();

    if (!cacheErr && cached) {
      const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
      // Cache valid for 24 hours
      if (cacheAge < 24 * 60 * 60 * 1000) {
        return cached.price_data;
      }
    }
  } catch (err) {
    // If the cache table doesn't exist yet, we just bypass it
  }

  let interval = '1mo';
  let range = '1y';
  
  if (period === '1W') {
    interval = '1d';
    range = '7d';
  } else if (period === '1M') {
    interval = '1d';
    range = '1mo';
  } else if (period === '3M') {
    interval = '1d';
    range = '3mo';
  } else if (period === '6M') {
    interval = '1wk';
    range = '6mo';
  } else if (period === '1Y') {
    interval = '1mo';
    range = '1y';
  } else if (period === 'ALL') {
    interval = '1mo';
    range = '5y';
  }

  const ticker = symbol.includes('.') ? symbol : `${symbol}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`;
  
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 8000);
    
    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }
    
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.timestamp) {
      throw new Error(`No historical data found for ${ticker}`);
    }
    
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    
    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        const date = new Date(timestamps[i] * 1000);
        history.push({
          date: date.toISOString(),
          year: date.getUTCFullYear(),
          month: date.getUTCMonth(), // 0-11
          close: parseFloat(closes[i])
        });
      }
    }
    
    // Save to cache
    try {
      await supabase
        .from('price_cache')
        .upsert({
          stock_symbol: symbol,
          period: period,
          price_data: history,
          updated_at: new Date().toISOString()
        });
    } catch (err) {
      // Ignore cache save errors
      console.error('[YahooFinance] Failed to save cache:', err.message);
    }
    
    return history;
  } catch (error) {
    console.error(`[YahooFinance] Failed to fetch history for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Normalizes a date to Indian Standard Time (IST) date string: YYYY-MM-DD
 */
export function getISTDateKey(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  // Convert UTC/local to IST (UTC +5.5 hours)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(d.getTime() + istOffset);
  return istDate.toISOString().split('T')[0];
}

/**
 * Fetch and cache Nifty daily price changes for panic sell checks (range: 2y)
 */
export async function getNiftyDailyChanges() {
  const symbol = '^NSEI';
  const period = '2Y_DAILY';
  
  try {
    const { data: cached } = await supabase
      .from('price_cache')
      .select('price_data, updated_at')
      .eq('stock_symbol', symbol)
      .eq('period', period)
      .maybeSingle();

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
      // Cache valid for 12 hours
      if (cacheAge < 12 * 60 * 60 * 1000) {
        return cached.price_data;
      }
    }
  } catch (err) {
    // bypass cache fetch errors
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=2y`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 8000);
    
    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
    
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.timestamp) throw new Error('No Nifty data');
    
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    
    const dailyChanges = {};
    for (let i = 1; i < timestamps.length; i++) {
      const prevClose = closes[i - 1];
      const close = closes[i];
      if (prevClose !== null && close !== null && prevClose !== undefined && close !== undefined) {
        const dateKey = getISTDateKey(timestamps[i] * 1000);
        const changePct = ((close - prevClose) / prevClose) * 100;
        dailyChanges[dateKey] = parseFloat(changePct.toFixed(3));
      }
    }
    
    // Save to cache
    try {
      await supabase
        .from('price_cache')
        .upsert({
          stock_symbol: symbol,
          period: period,
          price_data: dailyChanges,
          updated_at: new Date().toISOString()
        });
    } catch (err) {
      console.error('[YahooFinance] Failed to cache Nifty daily changes:', err.message);
    }
    
    return dailyChanges;
  } catch (error) {
    console.error('[YahooFinance] Failed to fetch Nifty history:', error.message);
    return {};
  }
}

/**
 * Fetch and cache stock daily prices (close price map by IST date key) for post-exit and FOMO checks (range: 2y)
 */
export async function getStockDailyPrices(symbol) {
  const period = '2Y_DAILY';
  
  try {
    const { data: cached } = await supabase
      .from('price_cache')
      .select('price_data, updated_at')
      .eq('stock_symbol', symbol)
      .eq('period', period)
      .maybeSingle();

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
      // Cache valid for 24 hours
      if (cacheAge < 24 * 60 * 60 * 1000) {
        return cached.price_data;
      }
    }
  } catch (err) {
    // bypass cache fetch errors
  }

  const ticker = symbol.includes('.') ? symbol : `${symbol}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2y`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 8000);
    
    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
    
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.timestamp) throw new Error(`No historical daily data found for ${ticker}`);
    
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    
    const dailyPrices = {};
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close !== null && close !== undefined) {
        const dateKey = getISTDateKey(timestamps[i] * 1000);
        dailyPrices[dateKey] = parseFloat(close.toFixed(2));
      }
    }
    
    // Save to cache
    try {
      await supabase
        .from('price_cache')
        .upsert({
          stock_symbol: symbol,
          period: period,
          price_data: dailyPrices,
          updated_at: new Date().toISOString()
        });
    } catch (err) {
      console.error(`[YahooFinance] Failed to cache stock daily prices for ${symbol}:`, err.message);
    }
    
    return dailyPrices;
  } catch (error) {
    console.error(`[YahooFinance] Failed to fetch stock daily prices for ${symbol}:`, error.message);
    return {};
  }
}

