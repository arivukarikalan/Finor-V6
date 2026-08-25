import { supabase } from '../config/supabase.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GICS_SECTORS = [
  'Communication Services',
  'Consumer Discretionary',
  'Consumer Staples',
  'Energy',
  'Financials',
  'Health Care',
  'Industrials',
  'Information Technology',
  'Materials',
  'Real Estate',
  'Utilities'
];

// Local dictionary mapped to GICS 11 standard sectors
const LOCAL_SECTOR_MAP = {
  // Financials
  'HDFCBANK': 'Financials',
  'ICICIBANK': 'Financials',
  'SBIN': 'Financials',
  'KOTAKBANK': 'Financials',
  'AXISBANK': 'Financials',
  'BAJFINANCE': 'Financials',
  'BAJAJFINSV': 'Financials',
  'LICHSGFIN': 'Financials',
  'MUTHOOTFIN': 'Financials',
  'CHOLAFIN': 'Financials',
  'PFC': 'Financials',
  'RECLTD': 'Financials',
  'IRFC': 'Financials',
  'HDFC': 'Financials',
  'HUDCO': 'Financials',
  'J&KBANK': 'Financials',
  'IDFCFIRSTB': 'Financials',
  'PNB': 'Financials',
  'CANBK': 'Financials',
  'UNIONBANK': 'Financials',
  'BOB': 'Financials',
  'FEDERALBNK': 'Financials',
  'BSE': 'Financials',
  'CDSL': 'Financials',
  'MCX': 'Financials',
  'IEX': 'Financials',
  'PAYTM': 'Financials',
  'IREDA': 'Financials',
  
  // Information Technology
  'TCS': 'Information Technology',
  'INFY': 'Information Technology',
  'WIPRO': 'Information Technology',
  'HCLTECH': 'Information Technology',
  'TECHM': 'Information Technology',
  'LTIM': 'Information Technology',
  'COFORGE': 'Information Technology',
  'MPHASIS': 'Information Technology',
  'PERSISTENT': 'Information Technology',
  'KPITTECH': 'Information Technology',
  'TATAELXSI': 'Information Technology',
  'CYIENT': 'Information Technology',
  'OFSS': 'Information Technology',
  'BSOFT': 'Information Technology',
  
  // Energy
  'RELIANCE': 'Energy',
  'ONGC': 'Energy',
  'BPCL': 'Energy',
  'IOC': 'Energy',
  'HPCL': 'Energy',
  'COALINDIA': 'Energy',
  'GAIL': 'Energy',
  
  // Utilities
  'POWERGRID': 'Utilities',
  'NTPC': 'Utilities',
  'ADANIGREEN': 'Utilities',
  'SJVN': 'Utilities',
  'NHPC': 'Utilities',
  'TATAPOWER': 'Utilities',
  'ADANIPOWER': 'Utilities',
  'JSWENERGY': 'Utilities',
  'TORNTPOWER': 'Utilities',
  'WAAREEINDO': 'Utilities',
  'VIKRAMSOLR': 'Utilities',
  
  // Consumer Staples
  'ITC': 'Consumer Staples',
  'HINDUNILVR': 'Consumer Staples',
  'NESTLEIND': 'Consumer Staples',
  'BRITANNIA': 'Consumer Staples',
  'COLPAL': 'Consumer Staples',
  'DABUR': 'Consumer Staples',
  'MARICO': 'Consumer Staples',
  'TATACONSUM': 'Consumer Staples',
  'PGHH': 'Consumer Staples',
  'GODREJCP': 'Consumer Staples',
  'VBL': 'Consumer Staples',
  'EMAMILTD': 'Consumer Staples',
  'GILLETTE': 'Consumer Staples',
  'AVANTIFEED': 'Consumer Staples',
  'SKMEGGPROD': 'Consumer Staples',
  
  // Consumer Discretionary
  'TATAMOTORS': 'Consumer Discretionary',
  'MARUTI': 'Consumer Discretionary',
  'M&M': 'Consumer Discretionary',
  'BAJAJ-AUTO': 'Consumer Discretionary',
  'HEROMOTOCO': 'Consumer Discretionary',
  'TVSMOTOR': 'Consumer Discretionary',
  'EICHERMOT': 'Consumer Discretionary',
  'ASHOKLEY': 'Consumer Discretionary',
  'BALKRISIND': 'Consumer Discretionary',
  'TITAN': 'Consumer Discretionary',
  'TRENT': 'Consumer Discretionary',
  'DMART': 'Consumer Discretionary',
  'ZOMATO': 'Consumer Discretionary',
  'IRCTC': 'Consumer Discretionary',
  'EIHOTEL': 'Consumer Discretionary',
  'LEMONTREE': 'Consumer Discretionary',
  'INDHOTEL': 'Consumer Discretionary',
  'REDTAPE': 'Consumer Discretionary',
  'SULA': 'Consumer Discretionary',
  
  // Health Care
  'SUNPHARMA': 'Health Care',
  'CIPLA': 'Health Care',
  'DRREDDY': 'Health Care',
  'DIVISLAB': 'Health Care',
  'APOLLOHOSP': 'Health Care',
  'AUROPHARMA': 'Health Care',
  'LUPIN': 'Health Care',
  'BIOCON': 'Health Care',
  'TORNTPHARM': 'Health Care',
  'IPCALAB': 'Health Care',
  'MAXHEALTH': 'Health Care',
  
  // Materials
  'TATASTEEL': 'Materials',
  'JSWSTEEL': 'Materials',
  'HINDALCO': 'Materials',
  'VEDL': 'Materials',
  'GRASIM': 'Materials',
  'ULTRACEMCO': 'Materials',
  'SHREECEM': 'Materials',
  'AMBUJACEM': 'Materials',
  'ACC': 'Materials',
  'NMDC': 'Materials',
  'SAIL': 'Materials',
  'NATIONALUM': 'Materials',
  'SRF': 'Materials',
  'TATACHEM': 'Materials',
  
  // Industrials
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
  'RVNL': 'Industrials',
  'IRCON': 'Industrials',
  
  // Communication Services
  'BHARTIARTL': 'Communication Services',
  'IDEA': 'Communication Services',
  'INDUSTOWER': 'Communication Services',
  'SUNTV': 'Communication Services',
  'ZEEL': 'Communication Services'
};

// Heuristic backup classifier using symbol name keywords
function heuristicClassify(symbol, stockName = '') {
  const cleanSymbol = symbol.split('.')[0].toUpperCase().trim();
  const name = (stockName || '').toUpperCase();
  const combined = `${cleanSymbol} ${name}`;

  if (/\b(SOLAR|RENEWABLE|WIND|GREEN POWER|POWER|ELECTRIC|CESC)\b/i.test(combined)) {
    return 'Utilities';
  }
  if (/\b(PETRO|OIL|GAS|HPCL|BPCL|IOC|RELIANCE|COAL)\b/i.test(combined)) {
    return 'Energy';
  }
  if (/\b(FOOD|FEED|FEEDS|DAIRY|EGG|EGGS|POULTRY|SUGAR|BEVERAGE|BREWERY|AGRO|STAPLE|KIRANA|MILK|SPICE|STAPLES)\b/i.test(combined)) {
    return 'Consumer Staples';
  }
  if (/\b(HOTEL|HOTELS|RESORT|RESORTS|RETAIL|APPAREL|FOOTWEAR|SHOE|SHOES|CLOTH|CLOTHES|FASHION|GARMENT|TRAVEL|TOURISM|CATERING|AUTOMOBILE|MOTOR|MOTORS|CYCLE|TYRE|TYRES|CAR|CARS|JEWELLERY|GOLD)\b/i.test(combined)) {
    return 'Consumer Discretionary';
  }
  if (/\b(BANK|BANKS|FINANCE|FINANCIAL|MUTUAL|INSURANCE|CAPITAL|INVESTMENT|INVESTMENTS|HOLDINGS|SECURITIES|EXCHANGE|BROKER)\b/i.test(combined)) {
    return 'Financials';
  }
  if (/\b(PHARMA|PHARMACEUTICAL|PHARMACEUTICALS|LABS|LABORATORIES|HEALTH|HEALTHCARE|CLINIC|HOSPITAL|HOSPITALS|BIOTECH|MEDICINE|DRUG|DRUGS)\b/i.test(combined)) {
    return 'Health Care';
  }
  if (/\b(SOFTWARE|TECH|TECHNOLOGY|TECHNOLOGIES|INFOSYS|COMPUTERS|SYSTEMS|DIGITAL|CHIP|SEMICONDUCTOR)\b/i.test(combined)) {
    return 'Information Technology';
  }
  if (/\b(STEEL|METAL|METALS|IRON|COPPER|ALUMINIUM|ZINC|MINING|CEMENT|CHEMICAL|CHEMICALS|PAPER|WOOD|CLAY)\b/i.test(combined)) {
    return 'Materials';
  }
  if (/\b(REALTY|ESTATE|REIT|REITS|INFRASTRUCTURE|CONSTRUCTION|MACHINERY|AIRLINE|SHIPPING|PORT|PORTS|CARGO|LOGISTICS|DEFENSE|AEROSPACE)\b/i.test(combined)) {
    return 'Industrials';
  }

  return 'Other';
}

export async function getStockSector(symbol, stockName = '') {
  if (!symbol) return 'Other';
  
  const cleanSymbol = symbol.split('.')[0].toUpperCase().trim();
  
  // 1. Check local static GICS dictionary
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
    // bypass cache fetch errors
  }
  
  // 3. Fallback: Query Gemini AI for official GICS sector mapping if configured
  const apiKey = process.env.GEMINI_API_KEY;
  const hasGemini = apiKey && apiKey !== 'your_gemini_api_key_here';
  
  if (hasGemini) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `Classify the stock ticker symbol "${cleanSymbol}" (Company Name: "${stockName || cleanSymbol}") into exactly one of these 11 global GICS sectors:
- Communication Services
- Consumer Discretionary
- Consumer Staples
- Energy
- Financials
- Health Care
- Industrials
- Information Technology
- Materials
- Real Estate
- Utilities

Respond with ONLY the name of the sector in plain text. Do not include markdown, explanations, or punctuation.`;
      
      const response = await model.generateContent(prompt);
      const text = response.response.text().trim();
      
      // Match against GICS sectors to ensure validity
      const matchedSector = GICS_SECTORS.find(s => text.toLowerCase().includes(s.toLowerCase()));
      if (matchedSector) {
        // Cache result in DB
        try {
          await supabase
            .from('price_cache')
            .upsert({
              stock_symbol: cleanSymbol,
              period: 'SECTOR',
              price_data: { sector: matchedSector },
              updated_at: new Date().toISOString()
            });
        } catch (cacheErr) {
          console.error('[SectorService] Cache save failed:', cacheErr.message);
        }
        return matchedSector;
      }
    } catch (aiErr) {
      console.error(`[SectorService] Gemini classification failed for ${cleanSymbol}:`, aiErr.message);
    }
  }
  
  // 4. Heuristic classifier backup
  const backupSector = heuristicClassify(cleanSymbol, stockName);
  if (backupSector !== 'Other') {
    // Cache the heuristic result
    try {
      await supabase
        .from('price_cache')
        .upsert({
          stock_symbol: cleanSymbol,
          period: 'SECTOR',
          price_data: { sector: backupSector },
          updated_at: new Date().toISOString()
            });
    } catch (cacheErr) {
      // Ignore
    }
    return backupSector;
  }
  
  return 'Other';
}
