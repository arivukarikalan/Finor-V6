import { supabase } from '../config/supabase.js';

// Local dictionary for Nifty 100 and popular stocks to guarantee zero-latency resolution
const LOCAL_SECTOR_MAP = {
  // Financial Services
  'HDFCBANK': 'Financial Services',
  'ICICIBANK': 'Financial Services',
  'SBIN': 'Financial Services',
  'KOTAKBANK': 'Financial Services',
  'AXISBANK': 'Financial Services',
  'BAJFINANCE': 'Financial Services',
  'BAJAJFINSV': 'Financial Services',
  'LICHSGFIN': 'Financial Services',
  'MUTHOOTFIN': 'Financial Services',
  'CHOLAFIN': 'Financial Services',
  'PFC': 'Financial Services',
  'RECLTD': 'Financial Services',
  'IRFC': 'Financial Services',
  'HDFC': 'Financial Services',
  'HUDCO': 'Financial Services',
  'J&KBANK': 'Financial Services',
  'IDFCFIRSTB': 'Financial Services',
  'PNB': 'Financial Services',
  'CANBK': 'Financial Services',
  'UNIONBANK': 'Financial Services',
  'BOB': 'Financial Services',
  'FEDERALBNK': 'Financial Services',
  
  // Technology
  'TCS': 'Technology',
  'INFY': 'Technology',
  'WIPRO': 'Technology',
  'HCLTECH': 'Technology',
  'TECHM': 'Technology',
  'LTIM': 'Technology',
  'COFORGE': 'Technology',
  'MPHASIS': 'Technology',
  'PERSISTENT': 'Technology',
  'KPITTECH': 'Technology',
  'TATAELXSI': 'Technology',
  
  // Energy
  'RELIANCE': 'Energy',
  'ONGC': 'Energy',
  'BPCL': 'Energy',
  'IOC': 'Energy',
  'HPCL': 'Energy',
  'POWERGRID': 'Energy',
  'NTPC': 'Energy',
  'ADANIGREEN': 'Energy',
  'ADANITRANS': 'Energy',
  'SJVN': 'Energy',
  'NHPC': 'Energy',
  'COALINDIA': 'Energy',
  'GAIL': 'Energy',
  'TATAPOWER': 'Energy',
  'IREDA': 'Energy',
  
  // Consumer Defensive (FMCG)
  'ITC': 'Consumer Defensive',
  'HINDUNILVR': 'Consumer Defensive',
  'NESTLEIND': 'Consumer Defensive',
  'BRITANNIA': 'Consumer Defensive',
  'COLPAL': 'Consumer Defensive',
  'DABUR': 'Consumer Defensive',
  'MARICO': 'Consumer Defensive',
  'TATACONSUM': 'Consumer Defensive',
  'PGHH': 'Consumer Defensive',
  'GODREJCP': 'Consumer Defensive',
  'VBL': 'Consumer Defensive',
  
  // Automobile
  'TATAMOTORS': 'Consumer Cyclical',
  'MARUTI': 'Consumer Cyclical',
  'M&M': 'Consumer Cyclical',
  'BAJAJ-AUTO': 'Consumer Cyclical',
  'HEROMOTOCO': 'Consumer Cyclical',
  'TVSMOTOR': 'Consumer Cyclical',
  'EICHERMOT': 'Consumer Cyclical',
  'ASHOKLEY': 'Consumer Cyclical',
  'BALKRISIND': 'Consumer Cyclical',
  
  // Healthcare / Pharma
  'SUNPHARMA': 'Healthcare',
  'CIPLA': 'Healthcare',
  'DRREDDY': 'Healthcare',
  'DIVISLAB': 'Healthcare',
  'APOLLOHOSP': 'Healthcare',
  'AUROPHARMA': 'Healthcare',
  'LUPIN': 'Healthcare',
  'BIOCON': 'Healthcare',
  'TORNTPHARM': 'Healthcare',
  'IPCALAB': 'Healthcare',
  'MAXHEALTH': 'Healthcare',
  
  // Materials / Mining / Cement
  'TATASTEEL': 'Basic Materials',
  'JSWSTEEL': 'Basic Materials',
  'HINDALCO': 'Basic Materials',
  'VEDL': 'Basic Materials',
  'GRASIM': 'Basic Materials',
  'ULTRACEMCO': 'Basic Materials',
  'SHREECEM': 'Basic Materials',
  'AMBUJACEM': 'Basic Materials',
  'ACC': 'Basic Materials',
  'NMDC': 'Basic Materials',
  'SAIL': 'Basic Materials',
  'NATIONALUM': 'Basic Materials',
  
  // Industrials / Infrastructure / Defense
  'LT': 'Industrials',
  'ADANIENT': 'Industrials',
  'ADANIPORTS': 'Industrials',
  'BEL': 'Industrials',
  'HAL': 'Industrials',
  'BHEL': 'Industrials',
  'ABB': 'Industrials',
  'SIEMENS': 'Industrials',
  'CONCOR': 'Industrials',
  'GMRINFRA': 'Industrials',
  'TATACOMM': 'Industrials',
  'RVNL': 'Industrials',
  'IRCON': 'Industrials',
  
  // Consumer Cyclical / Retail
  'TITAN': 'Consumer Cyclical',
  'TRENT': 'Consumer Cyclical',
  'DMART': 'Consumer Cyclical',
  'AVENUE': 'Consumer Cyclical',
  'ABFRL': 'Consumer Cyclical',
  'JUBILANT': 'Consumer Cyclical',
  'NYKAA': 'Consumer Cyclical',
  'ZOMATO': 'Consumer Cyclical',
  'PAGEIND': 'Consumer Cyclical',
  'BATAINDIA': 'Consumer Cyclical',
  
  // Telecommunication
  'BHARTIARTL': 'Communication Services',
  'IDEA': 'Communication Services',
  'INDUSTOWER': 'Communication Services'
};

export async function getStockSector(symbol) {
  if (!symbol) return 'Other';
  
  const cleanSymbol = symbol.split('.')[0].toUpperCase().trim();
  
  // 1. Check local static dictionary
  if (LOCAL_SECTOR_MAP[cleanSymbol]) {
    return LOCAL_SECTOR_MAP[cleanSymbol];
  }
  
  // 2. Check Supabase cache table (price_cache with period='SECTOR')
  try {
    const { data: cached } = await supabase
      .from('price_cache')
      .select('price_data')
      .eq('stock_symbol', cleanSymbol)
      .eq('period', 'SECTOR')
      .maybeSingle();
      
    if (cached && cached.price_data && cached.price_data.sector) {
      return cached.price_data.sector;
    }
  } catch (err) {
    // If table doesn't support cache or fails, bypass
  }
  
  // 3. Fallback: Fetch from Yahoo Finance modules API
  const ticker = symbol.includes('.') ? symbol : `${cleanSymbol}.NS`;
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (response.ok) {
      const json = await response.json();
      const profile = json?.quoteSummary?.result?.[0]?.assetProfile;
      if (profile && profile.sector) {
        const sector = profile.sector;
        
        // Cache the result in DB
        try {
          await supabase
            .from('price_cache')
            .upsert({
              stock_symbol: cleanSymbol,
              period: 'SECTOR',
              price_data: { sector },
              updated_at: new Date().toISOString()
            });
        } catch (cacheErr) {
          console.error('[SectorService] Cache save failed:', cacheErr.message);
        }
        
        return sector;
      }
    }
  } catch (err) {
    console.error(`[SectorService] Live fetch failed for ${ticker}:`, err.message);
  }
  
  return 'Other';
}
