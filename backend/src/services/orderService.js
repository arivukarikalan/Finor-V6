import { supabase } from '../config/supabase.js';
import pkg from 'kiteconnect';
import { fetchMultipleLTPs } from './yahooFinance.js';
import { decryptText } from '../utils/encryption.js';

const { KiteConnect } = pkg;

/**
 * Helper to retrieve user-specific Zerodha API configuration keys from their profile.
 * Falls back to global env variables if profile parameters are not configured.
 */
export async function getUserZerodhaCredentials(userId) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('zerodha_api_key, zerodha_api_secret, zerodha_pdf_password')
      .eq('id', userId)
      .maybeSingle();

    const apiKey = decryptText(profile?.zerodha_api_key) || process.env.ZERODHA_API_KEY;
    const apiSecret = decryptText(profile?.zerodha_api_secret) || process.env.ZERODHA_API_SECRET;
    const pdfPassword = decryptText(profile?.zerodha_pdf_password) || process.env.ZERODHA_PDF_PASSWORD || '';

    return {
      apiKey: apiKey && apiKey !== 'your_zerodha_api_key_here' ? apiKey : null,
      apiSecret: apiSecret && apiSecret !== 'your_zerodha_api_secret_here' ? apiSecret : null,
      pdfPassword
    };
  } catch (err) {
    console.error('[OrderService] Error fetching Zerodha credentials:', err.message);
    return {
      apiKey: process.env.ZERODHA_API_KEY || null,
      apiSecret: process.env.ZERODHA_API_SECRET || null,
      pdfPassword: process.env.ZERODHA_PDF_PASSWORD || ''
    };
  }
}

/**
 * Helper to retrieve active Zerodha session for a user.
 * Validates that the session was created today after 6:00 AM (Zerodha session lifetime).
 */
export async function getActiveSession(userId) {
  try {
    const { data: sessions, error } = await supabase
      .from('broker_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('broker_name', 'zerodha')
      .order('login_time', { ascending: false })
      .limit(1);

    if (error || !sessions || sessions.length === 0) return null;

    const session = sessions[0];
    const loginTime = new Date(session.login_time);
    
    // Check if session was created today after 6 AM
    const now = new Date();
    const sixAM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
    if (now < sixAM) {
      sixAM.setDate(sixAM.getDate() - 1);
    }

    if (loginTime >= sixAM) {
      return session;
    }
    return null;
  } catch (err) {
    console.error('[OrderService] Error checking active session:', err.message);
    return null;
  }
}

/**
 * Automatically detects the appropriate Exchange and Product for an Indian market instrument.
 * Supports NSE/BSE Equities, NFO/BFO Futures & Options, MCX Commodities, and CDS Currencies.
 */
export function detectInstrumentMeta(symbol, customExchange = null, customProduct = null) {
  let sym = String(symbol || '').toUpperCase().trim();
  let explicitExchange = null;

  // Explicit exchange prefix like "NFO:SYMBOL" or "BSE:SYMBOL"
  if (sym.includes(':')) {
    const parts = sym.split(':');
    explicitExchange = parts[0].toUpperCase();
    sym = parts[1].toUpperCase();
  }

  // 1. Options: ends with strike + CE/PE (e.g., NATIONALUM26SEP410CE, NIFTY24SEP25000PE, BANKNIFTY2491252000CE)
  const isOption = /\d+(?:CE|PE)$/i.test(sym);

  // 2. Futures: ends with FUT or FUTURES (e.g., NATIONALUM26SEPFUT, NIFTY24SEPFUT)
  const isFuture = /(?:FUT|FUTURES)$/i.test(sym);

  // 3. MCX Commodities (e.g. CRUDEOIL24OCTFUT, GOLD24OCTFUT)
  const isCommodity = /^(?:CRUDEOIL|GOLD|SILVER|COPPER|NATURALGAS|ZINC|NICKEL|ALUMINIUM|LEAD)/i.test(sym) && (isOption || isFuture || /\d{2}[A-Z]{3}/.test(sym));

  // 4. Currency Derivatives (e.g. USDINR24SEPFUT)
  const isCurrency = /^(?:USDINR|EURINR|GBPINR|JPYINR)/i.test(sym) && (isOption || isFuture || /\d{2}[A-Z]{3}/.test(sym));

  // 5. BSE Index derivatives (e.g. SENSEX24SEP... or BANKEX...)
  const isBseDeriv = /^(?:SENSEX|BANKEX)/i.test(sym) && (isOption || isFuture);

  let exchange = customExchange || explicitExchange;
  if (!exchange) {
    if (isBseDeriv) {
      exchange = 'BFO';
    } else if (isCommodity) {
      exchange = 'MCX';
    } else if (isCurrency) {
      exchange = 'CDS';
    } else if (isOption || isFuture) {
      exchange = 'NFO';
    } else if (/^\d{6}$/.test(sym) || sym.endsWith('.BO')) {
      exchange = 'BSE';
    } else {
      exchange = 'NSE';
    }
  }

  const isDerivative = ['NFO', 'BFO', 'MCX', 'CDS'].includes(exchange);
  let product = customProduct;
  if (!product) {
    product = isDerivative ? 'NRML' : 'CNC';
  }

  return {
    exchange,
    symbol: sym,
    product,
    isDerivative
  };
}

/**
 * Internal business logic to place a Good-Till-Triggered order.
 * Works for both REAL (Zerodha Kite) and MOCK (Paper trading) configurations.
 * Supports Equity (NSE/BSE) and Derivatives (NFO/BFO/MCX/CDS).
 */
export async function placeGttOrderInternal({
  userId,
  stock_symbol,
  trigger_type,
  quantity,
  trigger_price_1,
  trigger_price_2,
  transaction_type,
  exchange: customExchange,
  product: customProduct
}) {
  const qtyVal = parseInt(quantity);
  const typeUpper = trigger_type.toUpperCase(); // SINGLE or OCO
  const price1 = parseFloat(trigger_price_1);
  const price2 = trigger_price_2 ? parseFloat(trigger_price_2) : null;
  const actionUpper = (transaction_type || 'SELL').toUpperCase();

  let { exchange: resolvedExchange, product: resolvedProduct, symbol: symbolUpper } = detectInstrumentMeta(stock_symbol, customExchange, customProduct);

  const session = await getActiveSession(userId);

  if (session) {
    // REAL GTT PLACEMENT VIA ZERODHA
    const credentials = await getUserZerodhaCredentials(userId);
    const kc = new KiteConnect({
      api_key: credentials.apiKey || process.env.ZERODHA_API_KEY,
      access_token: session.access_token
    });

    // Fetch current LTP for base price comparison directly from Zerodha
    let currentLTP = price1;
    let ltpResolved = false;

    // 1. Try primary resolved exchange
    try {
      const ltpKey = `${resolvedExchange}:${symbolUpper}`;
      const ltpRes = await kc.getLTP([ltpKey]);
      if (ltpRes && ltpRes[ltpKey] && ltpRes[ltpKey].last_price) {
        currentLTP = ltpRes[ltpKey].last_price;
        ltpResolved = true;
      }
    } catch (ltpErr) {
      console.warn(`[OrderService GTT] Primary LTP check failed for ${resolvedExchange}:${symbolUpper}:`, ltpErr.message);
    }

    // 2. If not resolved, probe alternate exchanges to find exact instrument exchange
    if (!ltpResolved) {
      const candidateExchanges = ['NFO', 'NSE', 'BSE', 'MCX', 'BFO', 'CDS'].filter(e => e !== resolvedExchange);
      for (const altEx of candidateExchanges) {
        try {
          const altKey = `${altEx}:${symbolUpper}`;
          const altRes = await kc.getLTP([altKey]);
          if (altRes && altRes[altKey] && altRes[altKey].last_price) {
            currentLTP = altRes[altKey].last_price;
            resolvedExchange = altEx;
            resolvedProduct = ['NFO', 'BFO', 'MCX', 'CDS'].includes(altEx) ? 'NRML' : 'CNC';
            ltpResolved = true;
            console.log(`[OrderService GTT] Dynamically identified instrument on ${altEx}:${symbolUpper} (LTP: ₹${currentLTP})`);
            break;
          }
        } catch (_) {}
      }
    }

    // 3. Fallback to Yahoo Finance if still not resolved (equity only)
    if (!ltpResolved) {
      try {
        const ltpData = await fetchMultipleLTPs([symbolUpper]);
        currentLTP = ltpData[symbolUpper]?.ltp || price1;
      } catch (yfErr) {
        console.warn('[OrderService GTT] Fallback LTP error from Yahoo Finance:', yfErr.message);
      }
    }

    const gttOrders = [];
    if (typeUpper === 'OCO' && price2 !== null) {
      // Stoploss order first (Index 0)
      gttOrders.push({
        exchange: resolvedExchange,
        tradingsymbol: symbolUpper,
        transaction_type: actionUpper,
        quantity: qtyVal,
        product: resolvedProduct,
        order_type: 'LIMIT',
        price: price2 // Stoploss limit price
      });
      // Target order second (Index 1)
      gttOrders.push({
        exchange: resolvedExchange,
        tradingsymbol: symbolUpper,
        transaction_type: actionUpper,
        quantity: qtyVal,
        product: resolvedProduct,
        order_type: 'LIMIT',
        price: price1 // Target limit price
      });
    } else {
      // Single trigger GTT order
      gttOrders.push({
        exchange: resolvedExchange,
        tradingsymbol: symbolUpper,
        transaction_type: actionUpper,
        quantity: qtyVal,
        product: resolvedProduct,
        order_type: 'LIMIT',
        price: price1
      });
    }

    // Construct GTT parameters
    const gttParams = {
      trigger_type: typeUpper === 'OCO' ? kc.GTT_TYPE_OCO : kc.GTT_TYPE_SINGLE,
      tradingsymbol: symbolUpper,
      exchange: resolvedExchange,
      trigger_values: typeUpper === 'OCO' ? [price2, price1] : [price1],
      orders: gttOrders,
      last_price: currentLTP
    };

    const result = await kc.placeGTT(gttParams);

    const { error: dbError } = await supabase.from('gtts').insert({
      user_id: userId,
      gtt_id: result.trigger_id,
      stock_symbol: symbolUpper,
      trigger_type: typeUpper,
      trigger_price_1: price1,
      trigger_price_2: price2,
      quantity: qtyVal,
      status: 'ACTIVE'
    });

    if (dbError) {
      console.error('[OrderService GTT] Save error to local database gtts table:', dbError.message);
    }

    return {
      status: 'SUCCESS',
      mode: 'REAL',
      gtt_id: result.trigger_id,
      exchange: resolvedExchange,
      product: resolvedProduct,
      message: `GTT trigger registered on Zerodha (${resolvedExchange} - ${resolvedProduct}) successfully. ID: ${result.trigger_id}`
    };

  } else {
    // MOCK GTT PLACEMENT (PAPER TRADING)
    const mockGttId = `mock_gtt_${Date.now()}`;
    
    const { error: dbError } = await supabase.from('gtts').insert({
      user_id: userId,
      gtt_id: mockGttId,
      stock_symbol: symbolUpper,
      trigger_type: typeUpper,
      trigger_price_1: price1,
      trigger_price_2: price2,
      quantity: qtyVal,
      status: 'ACTIVE'
    });

    if (dbError) throw dbError;

    return {
      status: 'SUCCESS',
      mode: 'MOCK',
      gtt_id: mockGttId,
      exchange: resolvedExchange,
      product: resolvedProduct,
      message: `Mock GTT Trigger placed successfully (${resolvedExchange} - ${resolvedProduct}).`
    };
  }
}
