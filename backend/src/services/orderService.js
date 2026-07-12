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
 * Internal business logic to place a Good-Till-Triggered order.
 * Works for both REAL (Zerodha Kite) and MOCK (Paper trading) configurations.
 */
export async function placeGttOrderInternal({
  userId,
  stock_symbol,
  trigger_type,
  quantity,
  trigger_price_1,
  trigger_price_2,
  transaction_type
}) {
  const qtyVal = parseInt(quantity);
  const symbolUpper = stock_symbol.toUpperCase();
  const typeUpper = trigger_type.toUpperCase(); // SINGLE or OCO
  const price1 = parseFloat(trigger_price_1);
  const price2 = trigger_price_2 ? parseFloat(trigger_price_2) : null;
  const actionUpper = (transaction_type || 'SELL').toUpperCase();

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
    try {
      const ltpRes = await kc.getLTP([`NSE:${symbolUpper}`]);
      if (ltpRes && ltpRes[`NSE:${symbolUpper}`]) {
        currentLTP = ltpRes[`NSE:${symbolUpper}`].last_price;
      }
    } catch (ltpErr) {
      console.error('[OrderService GTT] Error fetching LTP from Zerodha:', ltpErr.message);
      // Fallback to Yahoo Finance
      try {
        const ltpData = await fetchMultipleLTPs([symbolUpper]);
        currentLTP = ltpData[symbolUpper]?.ltp || price1;
      } catch (yfErr) {
        console.error('[OrderService GTT] Error fetching LTP from Yahoo Finance:', yfErr.message);
      }
    }

    const gttOrders = [];
    if (typeUpper === 'OCO' && price2 !== null) {
      // Stoploss order first (Index 0)
      gttOrders.push({
        exchange: 'NSE',
        tradingsymbol: symbolUpper,
        transaction_type: actionUpper,
        quantity: qtyVal,
        product: 'CNC',
        order_type: 'LIMIT',
        price: price2 // Stoploss limit price
      });
      // Target order second (Index 1)
      gttOrders.push({
        exchange: 'NSE',
        tradingsymbol: symbolUpper,
        transaction_type: actionUpper,
        quantity: qtyVal,
        product: 'CNC',
        order_type: 'LIMIT',
        price: price1 // Target limit price
      });
    } else {
      // Single trigger GTT order
      gttOrders.push({
        exchange: 'NSE',
        tradingsymbol: symbolUpper,
        transaction_type: actionUpper,
        quantity: qtyVal,
        product: 'CNC',
        order_type: 'LIMIT',
        price: price1
      });
    }

    // Construct GTT parameters
    const gttParams = {
      trigger_type: typeUpper === 'OCO' ? kc.GTT_TYPE_OCO : kc.GTT_TYPE_SINGLE,
      tradingsymbol: symbolUpper,
      exchange: 'NSE',
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
      message: `GTT trigger registered on Zerodha successfully. ID: ${result.trigger_id}`
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
      message: `Mock GTT Trigger placed successfully.`
    };
  }
}
