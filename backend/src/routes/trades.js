import express from 'express';
import pkg from 'kiteconnect';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { getActiveSession } from '../services/orderService.js';

const { KiteConnect } = pkg;
const router = express.Router();

/**
 * Helper: Parses Zerodha CSV text into an array of trade objects.
 */
function parseZerodhaCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header columns
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
  
  const symbolIdx = headers.indexOf('symbol');
  const tradeDateIdx = headers.indexOf('trade_date');
  const tradeTypeIdx = headers.indexOf('trade_type');
  const quantityIdx = headers.indexOf('quantity');
  const priceIdx = headers.indexOf('price');
  const tradeIdIdx = headers.indexOf('trade_id');
  const orderIdIdx = headers.indexOf('order_id');
  const execTimeIdx = headers.indexOf('order_execution_time');

  if (symbolIdx === -1 || tradeTypeIdx === -1 || quantityIdx === -1 || priceIdx === -1) {
    throw new Error('CSV is missing required headers: symbol, trade_type, quantity, price');
  }

  const trades = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < headers.length) continue;

    const symbol = cols[symbolIdx].toUpperCase();
    const tradeType = cols[tradeTypeIdx].toUpperCase(); // BUY or SELL
    const quantity = parseInt(cols[quantityIdx], 10);
    
    // Round to 2 decimal places to match database numeric(12,2) representation
    const price = parseFloat(parseFloat(cols[priceIdx]).toFixed(2));
    
    const tradeId = tradeIdIdx !== -1 ? cols[tradeIdIdx] : null;
    const orderId = orderIdIdx !== -1 ? cols[orderIdIdx] : null;
    
    // Use unique execution trade_id, fallback to order_id if missing
    const dbOrderId = tradeId || orderId;

    if (isNaN(quantity) || isNaN(price) || !symbol) continue;

    // Parse Date: supports MM-DD-YYYY or order_execution_time
    let tradeDate;
    if (execTimeIdx !== -1 && cols[execTimeIdx]) {
      tradeDate = new Date(cols[execTimeIdx]);
    } else if (tradeDateIdx !== -1 && cols[tradeDateIdx]) {
      const parts = cols[tradeDateIdx].split('-');
      if (parts.length === 3) {
        // parts[0] = MM, parts[1] = DD, parts[2] = YYYY
        const month = parseInt(parts[0], 10) - 1;
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        tradeDate = new Date(Date.UTC(year, month, day, 10, 0, 0));
      } else {
        tradeDate = new Date(cols[tradeDateIdx]);
      }
    } else {
      tradeDate = new Date();
    }

    trades.push({
      stock_symbol: symbol,
      stock_name: symbol,
      trade_type: tradeType,
      quantity,
      price,
      trade_date: tradeDate.toISOString(),
      order_id: dbOrderId
    });
  }

  return trades;
}

/**
 * Helper: Recalculates holdings dynamically based on entire trade history.
 */
export async function recalculateHoldings(userId) {
  // Fetch all trades sorted by date ascending
  const { data: trades, error: fetchError } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('trade_date', { ascending: true });

  if (fetchError) throw fetchError;

  // Sort trades chronologically in memory, prioritizing BUY over SELL if timestamps are identical
  const sortedTrades = [...trades].sort((a, b) => {
    const timeA = new Date(a.trade_date).getTime();
    const timeB = new Date(b.trade_date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const typeA = a.trade_type.toUpperCase();
    const typeB = b.trade_type.toUpperCase();
    if (typeA === 'BUY' && typeB === 'SELL') return -1;
    if (typeA === 'SELL' && typeB === 'BUY') return 1;
    return 0;
  });

  const holdingsMap = {};

  for (const trade of sortedTrades) {
    const symbol = trade.stock_symbol;
    const type = trade.trade_type.toUpperCase();
    const qty = trade.quantity;
    const price = parseFloat(trade.price);

    if (!holdingsMap[symbol]) {
      holdingsMap[symbol] = {
        stock_symbol: symbol,
        stock_name: trade.stock_name || symbol,
        quantity: 0,
        average_buy_price: 0,
      };
    }

    const current = holdingsMap[symbol];
    if (type === 'BUY') {
      const newQty = current.quantity + qty;
      const newAvg = ((current.quantity * current.average_buy_price) + (qty * price)) / newQty;
      current.quantity = newQty;
      current.average_buy_price = newAvg;
    } else if (type === 'SELL') {
      current.quantity = Math.max(0, current.quantity - qty);
    }
  }

  // Filter out symbols with no remaining quantity
  const activeHoldings = Object.values(holdingsMap).filter(h => h.quantity > 0);

  // Fetch existing holdings to preserve their LTP values
  const { data: existingHoldings } = await supabase
    .from('holdings')
    .select('stock_symbol, ltp')
    .eq('user_id', userId);

  const ltpMap = {};
  if (existingHoldings) {
    existingHoldings.forEach(h => {
      ltpMap[h.stock_symbol.toUpperCase()] = h.ltp;
    });
  }

  // Delete existing holdings
  const { error: deleteError } = await supabase
    .from('holdings')
    .delete()
    .eq('user_id', userId);

  if (deleteError) throw deleteError;

  // Insert active holdings
  if (activeHoldings.length > 0) {
    const holdingsToInsert = activeHoldings.map(h => ({
      user_id: userId,
      stock_symbol: h.stock_symbol,
      stock_name: h.stock_name,
      average_buy_price: parseFloat(h.average_buy_price.toFixed(2)),
      quantity: h.quantity,
      ltp: ltpMap[h.stock_symbol.toUpperCase()] || null,
      last_updated: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from('holdings')
      .insert(holdingsToInsert);

    if (insertError) throw insertError;
  }
}

// --- Routes ---

/**
 * POST /api/trades/upload
 * Expects raw CSV text in req.body
 */
router.post('/upload', requireAuth, express.text({ type: 'text/csv', limit: '2mb' }), async (req, res) => {
  try {
    const csvContent = req.body;
    if (!csvContent) {
      return res.status(400).json({ error: 'Empty request body. Please send CSV text.' });
    }

    const parsedTrades = parseZerodhaCSV(csvContent);
    if (parsedTrades.length === 0) {
      return res.status(400).json({ error: 'No valid trades found in the CSV.' });
    }

    // Fetch all existing trades to check for duplicates using a composite key
    const { data: existingTrades, error: checkError } = await supabase
      .from('trades')
      .select('stock_symbol, trade_date, trade_type, quantity, price, order_id')
      .eq('user_id', req.user.id);

    if (checkError) throw checkError;

    // Build a unique key helper based on Indian Standard Time (IST) calendar day
    const getTradeKey = (t) => {
      const d = new Date(t.trade_date);
      const tzOffset = 5.5 * 60 * 60 * 1000; // 5.5h in ms
      const localTime = d.getTime() + (d.getTimezoneOffset() * 60 * 1000) + tzOffset;
      const localDate = new Date(localTime);
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const priceStr = parseFloat(t.price).toFixed(2);
      return `${t.stock_symbol}_${dateStr}_${t.trade_type}_${t.quantity}_${priceStr}`;
    };

    const existingKeys = new Set(existingTrades.map(getTradeKey));
    const processedKeys = new Set();
    const newTrades = [];

    // Filter out duplicates (both database-level duplicates and same-batch CSV duplicates)
    for (const t of parsedTrades) {
      const key = getTradeKey(t);
      if (!existingKeys.has(key) && !processedKeys.has(key)) {
        processedKeys.add(key);
        newTrades.push({
          ...t,
          user_id: req.user.id
        });
      }
    }

    if (newTrades.length === 0) {
      return res.json({ message: 'All trades in the CSV have already been imported.', count: 0 });
    }

    // Bulk insert new trades
    const { error: insertError } = await supabase
      .from('trades')
      .insert(newTrades);

    if (insertError) throw insertError;

    // Recalculate holdings
    await recalculateHoldings(req.user.id);

    res.json({
      message: `Successfully imported ${newTrades.length} new trades and updated holdings.`,
      count: newTrades.length
    });
  } catch (err) {
    console.error('[TradesRoute] Upload failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/trades
 * Returns all trades for user
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', req.user.id)
      .order('trade_date', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/trades
 * Clears all trades and holdings
 */
router.delete('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Delete trades
    const { error: tradesError } = await supabase
      .from('trades')
      .delete()
      .eq('user_id', userId);

    if (tradesError) throw tradesError;

    // Delete holdings
    const { error: holdingsError } = await supabase
      .from('holdings')
      .delete()
      .eq('user_id', userId);

    if (holdingsError) throw holdingsError;

    res.json({ message: 'Cleared all trades and holdings successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/trades/:id
 * Deletes a specific trade by ID and recalculates holdings dynamically
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const tradeId = req.params.id;

    const { error: deleteError } = await supabase
      .from('trades')
      .delete()
      .eq('id', tradeId)
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    // Recalculate holdings automatically
    await recalculateHoldings(userId);

    res.json({ message: 'Trade deleted successfully and holdings updated.' });
  } catch (err) {
    console.error('[TradesRoute] Specific trade delete failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/trades/sync-kite
 * Syncs today's Zerodha executed trades to the database and updates holdings.
 */
router.post('/sync-kite', requireAuth, async (req, res) => {
  try {
    const session = await getActiveSession(req.user.id);
    if (!session) {
      return res.json({
        status: 'MOCK_MODE',
        message: 'No active broker session. Running in Mock Mode.',
        count: 0
      });
    }

    const kc = new KiteConnect({
      api_key: process.env.ZERODHA_API_KEY,
      access_token: session.access_token
    });

    // Fetch today's trades from Zerodha
    const kiteTrades = await kc.getTrades();
    const tradesArray = Array.isArray(kiteTrades) ? kiteTrades : [];

    if (tradesArray.length === 0) {
      return res.json({
        status: 'SUCCESS',
        message: 'No trades executed today on Zerodha Kite.',
        count: 0
      });
    }

    // Fetch existing trades for this user that were executed today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data: existingTrades, error: checkError } = await supabase
      .from('trades')
      .select('order_id, stock_symbol, trade_date, trade_type, quantity, price')
      .eq('user_id', req.user.id)
      .gte('trade_date', startOfToday.toISOString());

    if (checkError) throw checkError;

    // We identify a unique trade from Zerodha using its trade_id.
    // In our database, we store the Zerodha trade_id in the order_id column.
    const existingOrderIds = new Set(existingTrades.map(t => t.order_id).filter(Boolean));

    const newTrades = [];
    for (const t of tradesArray) {
      const tradeId = String(t.trade_id || '');
      // If we already have this trade, skip it
      if (existingOrderIds.has(tradeId)) {
        continue;
      }

      // Format timestamp: Zerodha exchange_timestamp is typically 'YYYY-MM-DD HH:mm:ss'
      let tradeDateStr = t.exchange_timestamp || t.fill_timestamp || new Date().toISOString();
      const tradeDate = new Date(tradeDateStr);

      newTrades.push({
        user_id: req.user.id,
        stock_symbol: (t.tradingsymbol || '').toUpperCase(),
        stock_name: (t.tradingsymbol || '').toUpperCase(),
        trade_type: (t.transaction_type || 'BUY').toUpperCase(),
        quantity: parseInt(t.quantity || 0, 10),
        price: parseFloat(parseFloat(t.average_price || t.price || 0).toFixed(2)),
        trade_date: tradeDate.toISOString(),
        order_id: tradeId
      });
    }

    if (newTrades.length === 0) {
      return res.json({
        status: 'SUCCESS',
        message: 'All of today\'s Zerodha trades are already synchronized.',
        count: 0
      });
    }

    // Insert new trades
    const { error: insertError } = await supabase
      .from('trades')
      .insert(newTrades);

    if (insertError) throw insertError;

    // Recalculate holdings
    await recalculateHoldings(req.user.id);

    return res.json({
      status: 'SUCCESS',
      message: `Successfully synchronized ${newTrades.length} new trades from Zerodha.`,
      count: newTrades.length
    });

  } catch (err) {
    console.error('[TradesRoute] sync-kite failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/trades/postback
 * Webhook endpoint for Zerodha Kite Connect order execution postbacks.
 * Registered in Kite Developer Console as:
 * https://your-domain.com/api/trades/postback?user_id=YOUR_USER_ID
 */
router.post('/postback', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      console.warn('[Postback] Missing user_id in query parameters.');
      return res.status(400).json({ error: 'Missing user_id parameter.' });
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload.' });
    }

    console.log('[Postback] Received order update:', payload);

    const status = (payload.status || '').toUpperCase();
    if (status !== 'COMPLETE') {
      return res.json({ status: 'IGNORED', message: `Order status is ${status}. Only COMPLETE orders are processed.` });
    }

    // In a trade execution postback, the order is complete.
    // We check trade_id if available, otherwise order_id.
    const orderId = String(payload.order_id || '');
    if (!orderId) {
      return res.status(400).json({ error: 'Missing order_id in postback payload.' });
    }

    // Check if a trade with this order_id already exists in the database
    const { data: existing, error: checkError } = await supabase
      .from('trades')
      .select('id')
      .eq('user_id', user_id)
      .eq('order_id', orderId)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
      return res.json({ status: 'DUPLICATE', message: `Trade with order_id ${orderId} already exists.` });
    }

    // Map fields
    const symbol = (payload.tradingsymbol || '').toUpperCase();
    const tradeType = (payload.transaction_type || 'BUY').toUpperCase();
    const quantity = parseInt(payload.filled_quantity || payload.quantity || 0, 10);
    const price = parseFloat(parseFloat(payload.average_price || payload.price || 0).toFixed(2));
    const tradeDateStr = payload.order_timestamp || new Date().toISOString();
    const tradeDate = new Date(tradeDateStr);

    if (!symbol || !quantity || !price) {
      return res.status(400).json({ error: 'Invalid order parameters in payload.' });
    }

    // Insert trade
    const { error: insertError } = await supabase
      .from('trades')
      .insert({
        user_id: user_id,
        stock_symbol: symbol,
        stock_name: symbol,
        trade_type: tradeType,
        quantity: quantity,
        price: price,
        trade_date: tradeDate.toISOString(),
        order_id: orderId
      });

    if (insertError) throw insertError;

    // Recalculate holdings
    await recalculateHoldings(user_id);

    console.log(`[Postback] Successfully synced trade for user ${user_id}: ${symbol} ${tradeType} ${quantity} @ ₹${price}`);

    return res.json({
      status: 'SUCCESS',
      message: `Successfully processed trade execution for ${symbol}.`
    });

  } catch (err) {
    console.error('[TradesRoute] postback handling failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
