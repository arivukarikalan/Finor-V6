import express from 'express';
import pkg from 'kiteconnect';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { fetchMultipleLTPs } from '../services/yahooFinance.js';
import { getActiveSession, placeGttOrderInternal, getUserZerodhaCredentials } from '../services/orderService.js';

const { KiteConnect } = pkg;
const router = express.Router();

/**
 * GET /api/orders/config
 * Check if Zerodha keys are configured and returns connection status.
 */
router.get('/config', requireAuth, async (req, res) => {
  try {
    const credentials = await getUserZerodhaCredentials(req.user.id);
    const apiKey = credentials.apiKey;
    const apiSecret = credentials.apiSecret;
    
    const isConfigured = !!(apiKey && apiSecret);

    if (!isConfigured) {
      return res.json({
        status: 'MOCK_MODE',
        broker: 'zerodha',
        message: 'No Zerodha API keys configured. Running in Paper Trading / Mock Mode.'
      });
    }

    const session = await getActiveSession(req.user.id);
    if (session) {
      return res.json({
        status: 'CONNECTED',
        broker: 'zerodha',
        message: 'Connected to Zerodha Kite.'
      });
    } else {
      const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3`;
      return res.json({
        status: 'DISCONNECTED',
        broker: 'zerodha',
        login_url: loginUrl,
        message: 'Zerodha credentials configured but session is disconnected or expired.'
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/kite/session
 * Generate Zerodha Kite access token from redirect callback request_token.
 */
router.post('/kite/session', requireAuth, async (req, res) => {
  try {
    const { request_token } = req.body;
    if (!request_token) {
      return res.status(400).json({ error: 'Missing request_token.' });
    }

    const credentials = await getUserZerodhaCredentials(req.user.id);
    const apiKey = credentials.apiKey;
    const apiSecret = credentials.apiSecret;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'Kite Connect credentials are not configured in your Profile Settings.' });
    }

    const kc = new KiteConnect({ api_key: apiKey });
    
    // Generate session from Zerodha API
    const session = await kc.generateSession(request_token, apiSecret);
    
    // Save to database broker_sessions
    const { error: upsertError } = await supabase
      .from('broker_sessions')
      .upsert({
        user_id: req.user.id,
        broker_name: 'zerodha',
        access_token: session.access_token,
        public_token: session.public_token,
        login_time: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (upsertError) throw upsertError;

    res.json({
      status: 'CONNECTED',
      message: 'Logged in to Zerodha successfully.',
      user_type: session.user_type,
      user_name: session.user_name
    });
  } catch (err) {
    console.error('[KiteSession] Session generation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/orders/live
 * Retrieve active order book.
 */
router.get('/live', requireAuth, async (req, res) => {
  try {
    const session = await getActiveSession(req.user.id);
    
    if (session) {
      // Real mode
      const credentials = await getUserZerodhaCredentials(req.user.id);
      const kc = new KiteConnect({
        api_key: credentials.apiKey || process.env.ZERODHA_API_KEY,
        access_token: session.access_token
      });
      const kiteOrders = await kc.getOrders();
      
      const userId = req.user.id;
      let newTradesAdded = 0;

      for (const o of (Array.isArray(kiteOrders) ? kiteOrders : [])) {
        if (o.status && o.status.toUpperCase() === 'COMPLETE') {
          const symbol = o.tradingsymbol || '';
          const tradeType = o.transaction_type === 'BUY' ? 'BUY' : 'SELL';
          const qty = o.quantity || 0;
          const price = o.average_price || o.price || 0;
          const orderId = o.order_id || '';
          const rawDate = o.order_timestamp || new Date();
          const txDateStr = (rawDate instanceof Date)
            ? rawDate.toISOString().split('T')[0]
            : String(rawDate).split('T')[0];

          // Stable md5 hash to avoid duplicate trade imports
          const amountStr = parseFloat(price).toFixed(2);
          const defaultHash = crypto
            .createHash('md5')
            .update(`${userId}_${symbol}_${txDateStr}_${tradeType}_${qty}_${amountStr}`)
            .digest('hex');

          const stagingPayload = {
            user_id: userId,
            raw_data: {
              stock_symbol: symbol,
              stock_name: symbol,
              trade_date: txDateStr,
              trade_type: tradeType,
              quantity: qty,
              price: price,
              order_id: `KITE_${orderId}`
            },
            raw_data_hash: defaultHash,
            status: 'PENDING'
          };

          const { error: insertError } = await supabase
            .from('staging_trades')
            .insert(stagingPayload);

          if (!insertError) {
            newTradesAdded++;
          }
        }
      }

      if (newTradesAdded > 0) {
        // Run database reconciliation to move pending staged orders to public.trades
        const { error: rErr } = await supabase.rpc('reconcile_staging_trades');
        if (rErr) console.error('[KiteSync] Staging reconciliation failed:', rErr.message);

        // Standardized recalculation of user active positions
        const { recalculateHoldings } = await import('./trades.js');
        await recalculateHoldings(userId);
      }

      const mappedOrders = (Array.isArray(kiteOrders) ? kiteOrders : []).map(o => {
        let mappedStatus = 'OPEN';
        const uStatus = o.status ? o.status.toUpperCase() : '';
        if (uStatus === 'COMPLETE') {
          mappedStatus = 'COMPLETE';
        } else if (uStatus === 'CANCELLED') {
          mappedStatus = 'CANCELLED';
        } else if (uStatus === 'REJECTED') {
          mappedStatus = 'REJECTED';
        } else if (uStatus === 'OPEN') {
          mappedStatus = 'OPEN';
        } else {
          if (['OPEN', 'PUT ORDER REQUEST RECEIVED', 'VALIDATION PENDING'].includes(uStatus)) {
            mappedStatus = 'OPEN';
          } else {
            mappedStatus = 'REJECTED';
          }
        }

        return {
          id: String(o.order_id || ''),
          stock_symbol: o.tradingsymbol || '',
          transaction_type: o.transaction_type === 'BUY' ? 'BUY' : 'SELL',
          order_type: o.order_type === 'LIMIT' ? 'LIMIT' : 'MARKET',
          quantity: o.quantity || 0,
          price: o.price || o.average_price || 0,
          status: mappedStatus,
          broker_order_id: o.order_id || '',
          created_at: o.order_timestamp || new Date().toISOString()
        };
      });
      return res.json({ mode: 'REAL', orders: mappedOrders });
    } else {
      // Mock mode: only fetch orders from today (since midnight) to match Zerodha's daily clear behavior
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: mockOrders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', req.user.id)
        .gte('created_at', startOfToday.toISOString())
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return res.json({ mode: 'MOCK', orders: mockOrders });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/orders/gtt/live
 * Fetch active GTT triggers.
 */
router.get('/gtt/live', requireAuth, async (req, res) => {
  try {
    const session = await getActiveSession(req.user.id);
    
    if (session) {
      // Real Mode
      const credentials = await getUserZerodhaCredentials(req.user.id);
      const kc = new KiteConnect({
        api_key: credentials.apiKey || process.env.ZERODHA_API_KEY,
        access_token: session.access_token
      });
      const kiteGTTs = await kc.getGTTs();
      const mappedGtts = (Array.isArray(kiteGTTs) ? kiteGTTs : []).map(g => {
        const firstOrder = g.orders?.[0] || {};
        const triggerValues = g.condition?.trigger_values || [];
        
        let mappedStatus = 'CANCELLED';
        const uStatus = g.status ? g.status.toUpperCase() : '';
        if (uStatus === 'ACTIVE') {
          mappedStatus = 'ACTIVE';
        } else if (uStatus === 'TRIGGERED') {
          mappedStatus = 'TRIGGERED';
        } else if (['CANCELLED', 'REJECTED', 'DELETED', 'DISABLED', 'EXPIRED'].includes(uStatus)) {
          mappedStatus = 'CANCELLED';
        }

        return {
          id: String(g.id || g.trigger_id || ''),
          gtt_id: String(g.id || g.trigger_id || ''),
          stock_symbol: g.condition?.tradingsymbol || firstOrder.tradingsymbol || '',
          trigger_type: g.type === 'two-leg' ? 'OCO' : 'SINGLE',
          trigger_price_1: triggerValues[0] || 0,
          trigger_price_2: triggerValues[1] || null,
          quantity: firstOrder.quantity || 0,
          status: mappedStatus,
          created_at: g.created_at || new Date().toISOString()
        };
      });

      // Synchronize database 'gtts' table with Zerodha Kite Connect state
      try {
        await supabase
          .from('gtts')
          .delete()
          .eq('user_id', req.user.id);

        const activeGtts = mappedGtts.filter(g => g.status === 'ACTIVE');
        if (activeGtts.length > 0) {
          const rowsToInsert = activeGtts.map(g => ({
            user_id: req.user.id,
            gtt_id: g.gtt_id,
            stock_symbol: g.stock_symbol,
            trigger_type: g.trigger_type,
            trigger_price_1: g.trigger_price_1,
            trigger_price_2: g.trigger_price_2,
            quantity: g.quantity,
            status: 'ACTIVE'
          }));
          await supabase.from('gtts').insert(rowsToInsert);
        }
      } catch (dbErr) {
        console.error('[OrdersRoute] Failed to sync local GTT database table with Zerodha:', dbErr.message);
      }

      return res.json({ mode: 'REAL', gtts: mappedGtts });
    } else {
      // Mock Mode: pull from database gtts table
      const { data: mockGTTs, error } = await supabase
        .from('gtts')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.json({ mode: 'MOCK', gtts: mockGTTs });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/place
 * Place a BUY or SELL order (Market/Limit).
 */
router.post('/place', requireAuth, async (req, res) => {
  try {
    const { stock_symbol, transaction_type, order_type, quantity, price } = req.body;

    if (!stock_symbol || !transaction_type || !order_type || !quantity) {
      return res.status(400).json({ error: 'Missing required order parameters.' });
    }

    const session = await getActiveSession(req.user.id);

    if (session) {
      // REAL ORDER PLACEMENT
      const credentials = await getUserZerodhaCredentials(req.user.id);
      const kc = new KiteConnect({
        api_key: credentials.apiKey || process.env.ZERODHA_API_KEY,
        access_token: session.access_token
      });

      const orderParams = {
        exchange: 'NSE',
        tradingsymbol: stock_symbol.toUpperCase(),
        transaction_type: transaction_type.toUpperCase(),
        quantity: parseInt(quantity),
        product: 'CNC',
        order_type: order_type.toUpperCase(),
        price: order_type.toUpperCase() === 'LIMIT' ? parseFloat(price) : 0,
        validity: 'DAY'
      };

      const result = await kc.placeOrder('regular', orderParams);
      
      // Save order to tracking table
      const { error: dbError } = await supabase.from('orders').insert({
        user_id: req.user.id,
        stock_symbol: stock_symbol.toUpperCase(),
        transaction_type: transaction_type.toUpperCase(),
        order_type: order_type.toUpperCase(),
        quantity: parseInt(quantity),
        price: order_type.toUpperCase() === 'LIMIT' ? parseFloat(price) : 0,
        status: order_type.toUpperCase() === 'MARKET' ? 'COMPLETE' : 'OPEN',
        broker_order_id: result.order_id
      });

      if (dbError) {
        console.error('[OrdersRoute] Saved real order to orders table failed:', dbError.message);
      }

      return res.json({
        status: 'SUCCESS',
        mode: 'REAL',
        order_id: result.order_id,
        message: `Order submitted successfully to Zerodha. Order ID: ${result.order_id}`
      });

    } else {
      // PAPER TRADING / MOCK ORDER PLACEMENT
      const qtyVal = parseInt(quantity);
      const symbolUpper = stock_symbol.toUpperCase();
      const actionUpper = transaction_type.toUpperCase();
      const typeUpper = order_type.toUpperCase();
      const priceVal = parseFloat(price) || 0;

      // Lookup LTP for market execution
      const ltpData = await fetchMultipleLTPs([symbolUpper]);
      const currentLTP = ltpData[symbolUpper]?.ltp || priceVal || 100;

      const mockOrderId = `mock_ord_${Date.now()}`;
      
      if (typeUpper === 'MARKET') {
        // Market orders execute immediately. Update trades & holdings.
        
        // 1. Fetch current holdings
        const { data: holding, error: holdError } = await supabase
          .from('holdings')
          .select('*')
          .eq('user_id', req.user.id)
          .eq('stock_symbol', symbolUpper)
          .maybeSingle();

        if (holdError) throw holdError;

        if (actionUpper === 'BUY') {
          // Add/increase holding
          if (holding) {
            const newQty = holding.quantity + qtyVal;
            const newAvgPrice = parseFloat((((holding.average_buy_price * holding.quantity) + (currentLTP * qtyVal)) / newQty).toFixed(2));
            
            const { error: updErr } = await supabase
              .from('holdings')
              .update({
                quantity: newQty,
                average_buy_price: newAvgPrice,
                ltp: currentLTP,
                last_updated: new Date().toISOString()
              })
              .eq('id', holding.id);
            if (updErr) throw updErr;
          } else {
            const { error: insErr } = await supabase
              .from('holdings')
              .insert({
                user_id: req.user.id,
                stock_symbol: symbolUpper,
                stock_name: symbolUpper,
                average_buy_price: currentLTP,
                quantity: qtyVal,
                ltp: currentLTP,
                last_updated: new Date().toISOString()
              });
            if (insErr) throw insErr;
          }
        } else {
          // Sell: Decrease/delete holding
          if (!holding) {
            return res.status(400).json({ error: `Cannot place SELL order. You do not hold any shares of ${symbolUpper}.` });
          }
          if (holding.quantity < qtyVal) {
            return res.status(400).json({ error: `Insufficient quantity. You hold ${holding.quantity} shares but tried to sell ${qtyVal}.` });
          }

          if (holding.quantity === qtyVal) {
            // Delete holding
            const { error: delErr } = await supabase.from('holdings').delete().eq('id', holding.id);
            if (delErr) throw delErr;
          } else {
            // Update quantity
            const { error: updErr } = await supabase
              .from('holdings')
              .update({
                quantity: holding.quantity - qtyVal,
                ltp: currentLTP,
                last_updated: new Date().toISOString()
              })
              .eq('id', holding.id);
            if (updErr) throw updErr;
          }
        }

        // 2. Insert Completed Trade
        const { error: tradeErr } = await supabase.from('trades').insert({
          user_id: req.user.id,
          stock_symbol: symbolUpper,
          stock_name: symbolUpper,
          trade_type: actionUpper,
          quantity: qtyVal,
          price: currentLTP,
          trade_date: new Date().toISOString(),
          order_id: mockOrderId
        });
        if (tradeErr) throw tradeErr;

        // 3. Save to orders log table
        const { error: ordErr } = await supabase.from('orders').insert({
          user_id: req.user.id,
          stock_symbol: symbolUpper,
          transaction_type: actionUpper,
          order_type: typeUpper,
          quantity: qtyVal,
          price: currentLTP,
          status: 'COMPLETE',
          broker_order_id: mockOrderId
        });
        if (ordErr) throw ordErr;

        return res.json({
          status: 'SUCCESS',
          mode: 'MOCK',
          order_id: mockOrderId,
          price: currentLTP,
          message: `Paper Trade Buy filled successfully at ₹${currentLTP.toFixed(2)}.`
        });

      } else {
        // LIMIT order: insert as OPEN and wait for price triggers
        const { error: ordErr } = await supabase.from('orders').insert({
          user_id: req.user.id,
          stock_symbol: symbolUpper,
          transaction_type: actionUpper,
          order_type: typeUpper,
          quantity: qtyVal,
          price: priceVal,
          status: 'OPEN',
          broker_order_id: mockOrderId
        });
        if (ordErr) throw ordErr;

        return res.json({
          status: 'SUCCESS',
          mode: 'MOCK',
          order_id: mockOrderId,
          price: priceVal,
          message: `Paper Limit Order placed at ₹${priceVal.toFixed(2)}. Status: OPEN.`
        });
      }
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/cancel
 * Cancel an open limit order.
 */
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Missing order_id.' });

    const session = await getActiveSession(req.user.id);

    if (session) {
      // Real Mode
      const credentials = await getUserZerodhaCredentials(req.user.id);
      const kc = new KiteConnect({
        api_key: credentials.apiKey || process.env.ZERODHA_API_KEY,
        access_token: session.access_token
      });
      await kc.cancelOrder('regular', order_id);
      
      await supabase
        .from('orders')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('broker_order_id', order_id);

      return res.json({ status: 'SUCCESS', message: `Order ${order_id} cancelled.` });
    } else {
      // Mock Mode: update status
      const { error } = await supabase
        .from('orders')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('user_id', req.user.id)
        .eq('broker_order_id', order_id);

      if (error) throw error;
      return res.json({ status: 'SUCCESS', message: `Mock Order ${order_id} cancelled.` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/gtt/place
 * Place a Good-Till-Triggered order trigger.
 */
router.post('/gtt/place', requireAuth, async (req, res) => {
  try {
    const { stock_symbol, trigger_type, quantity, trigger_price_1, trigger_price_2, transaction_type } = req.body;

    if (!stock_symbol || !trigger_type || !quantity || !trigger_price_1) {
      return res.status(400).json({ error: 'Missing trigger parameters.' });
    }

    const result = await placeGttOrderInternal({
      userId: req.user.id,
      stock_symbol,
      trigger_type,
      quantity,
      trigger_price_1,
      trigger_price_2,
      transaction_type
    });

    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/gtt/cancel
 * Cancel a GTT trigger.
 */
router.post('/gtt/cancel', requireAuth, async (req, res) => {
  try {
    const { gtt_id } = req.body;
    if (!gtt_id) return res.status(400).json({ error: 'Missing gtt_id.' });

    const session = await getActiveSession(req.user.id);

    if (session) {
      // Real Mode
      const credentials = await getUserZerodhaCredentials(req.user.id);
      const kc = new KiteConnect({
        api_key: credentials.apiKey || process.env.ZERODHA_API_KEY,
        access_token: session.access_token
      });
      await kc.deleteGTT(gtt_id);
      
      await supabase.from('gtts').delete().eq('gtt_id', gtt_id);
      return res.json({ status: 'SUCCESS', message: `GTT trigger ${gtt_id} cancelled.` });
    } else {
      // Mock Mode: update status
      const { error } = await supabase
        .from('gtts')
        .update({ status: 'CANCELLED' })
        .eq('user_id', req.user.id)
        .eq('gtt_id', gtt_id);

      if (error) throw error;
      return res.json({ status: 'SUCCESS', message: `Mock GTT trigger ${gtt_id} cancelled.` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/sync-mock
 * Query LTP quotes for all active mock Limit and GTT orders and trigger execution if prices have crossed boundaries.
 */
router.post('/sync-mock', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch open limit orders
    const { data: openOrders, error: errOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'OPEN');
      
    if (errOrders) throw errOrders;

    // 2. Fetch active GTT triggers
    const { data: activeGTTs, error: errGtts } = await supabase
      .from('gtts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');

    if (errGtts) throw errGtts;

    if (openOrders.length === 0 && activeGTTs.length === 0) {
      return res.json({ message: 'No active mock limit orders or GTT triggers to sync.', executedCount: 0 });
    }

    // 3. Aggregate unique symbols
    const symbols = [...new Set([
      ...openOrders.map(o => o.stock_symbol),
      ...activeGTTs.map(g => g.stock_symbol)
    ])];

    // 4. Fetch quotes from Yahoo Finance
    const ltpData = await fetchMultipleLTPs(symbols);

    let executedCount = 0;

    // 5. Process Limit Orders
    for (const order of openOrders) {
      const currentLTP = ltpData[order.stock_symbol]?.ltp;
      if (!currentLTP) continue;

      let shouldExecute = false;
      if (order.transaction_type === 'BUY' && currentLTP <= order.price) {
        shouldExecute = true;
      } else if (order.transaction_type === 'SELL' && currentLTP >= order.price) {
        shouldExecute = true;
      }

      if (shouldExecute) {
        // Execute Order
        const { data: holding } = await supabase
          .from('holdings')
          .select('*')
          .eq('user_id', userId)
          .eq('stock_symbol', order.stock_symbol)
          .maybeSingle();

        if (order.transaction_type === 'BUY') {
          if (holding) {
            const newQty = holding.quantity + order.quantity;
            const newAvgPrice = parseFloat((((holding.average_buy_price * holding.quantity) + (order.price * order.quantity)) / newQty).toFixed(2));
            await supabase.from('holdings').update({ quantity: newQty, average_buy_price: newAvgPrice, ltp: currentLTP, last_updated: new Date().toISOString() }).eq('id', holding.id);
          } else {
            await supabase.from('holdings').insert({ user_id: userId, stock_symbol: order.stock_symbol, stock_name: order.stock_symbol, average_buy_price: order.price, quantity: order.quantity, ltp: currentLTP, last_updated: new Date().toISOString() });
          }
        } else {
          // SELL
          if (holding && holding.quantity >= order.quantity) {
            if (holding.quantity === order.quantity) {
              await supabase.from('holdings').delete().eq('id', holding.id);
            } else {
              await supabase.from('holdings').update({ quantity: holding.quantity - order.quantity, ltp: currentLTP, last_updated: new Date().toISOString() }).eq('id', holding.id);
            }
          } else {
            // Insufficient quantity to fill: skip execution
            continue;
          }
        }

        // Insert Trade
        await supabase.from('trades').insert({
          user_id: userId,
          stock_symbol: order.stock_symbol,
          stock_name: order.stock_symbol,
          trade_type: order.transaction_type,
          quantity: order.quantity,
          price: order.price, // fills at limit price
          trade_date: new Date().toISOString(),
          order_id: order.broker_order_id
        });

        // Update Order Status to COMPLETE
        await supabase
          .from('orders')
          .update({ status: 'COMPLETE', updated_at: new Date().toISOString() })
          .eq('id', order.id);

        executedCount++;
      }
    }

    // 6. Process GTT triggers
    for (const gtt of activeGTTs) {
      const currentLTP = ltpData[gtt.stock_symbol]?.ltp;
      if (!currentLTP) continue;

      let isTriggered = false;
      let executionPrice = currentLTP;

      if (gtt.trigger_type === 'SINGLE') {
        // GTT Single trigger: check if LTP hits trigger_price_1.
        // Heuristic: If trigger is below current price, it is a BUY trigger (buy limit).
        // If trigger is above, it is a target SELL trigger.
        // Let's check boundary crossing:
        // We trigger it if the price has crossed the threshold.
        const { data: holding } = await supabase.from('holdings').select('*').eq('user_id', userId).eq('stock_symbol', gtt.stock_symbol).maybeSingle();
        const isSell = !!holding; // Heuristic: if they own it, they are GTT-selling it.
        
        if (isSell && currentLTP >= gtt.trigger_price_1) {
          isTriggered = true;
          executionPrice = gtt.trigger_price_1;
        } else if (!isSell && currentLTP <= gtt.trigger_price_1) {
          isTriggered = true;
          executionPrice = gtt.trigger_price_1;
        }
      } else if (gtt.trigger_type === 'OCO') {
        // OCO: check if LTP hits trigger_price_1 (Target Profit) or trigger_price_2 (Stoploss).
        // OCO GTT is typically for exiting (SELL).
        if (currentLTP >= gtt.trigger_price_1) {
          isTriggered = true;
          executionPrice = gtt.trigger_price_1; // Target hit
        } else if (gtt.trigger_price_2 && currentLTP <= gtt.trigger_price_2) {
          isTriggered = true;
          executionPrice = gtt.trigger_price_2; // Stoploss hit
        }
      }

      if (isTriggered) {
        // Execute the triggered GTT Order
        const { data: holding } = await supabase
          .from('holdings')
          .select('*')
          .eq('user_id', userId)
          .eq('stock_symbol', gtt.stock_symbol)
          .maybeSingle();

        const isSell = !!holding; // Heuristic: Sell if they have holdings, Buy otherwise

        if (isSell) {
          // Sell execution
          const sellQty = Math.min(holding.quantity, gtt.quantity);
          if (holding.quantity === sellQty) {
            await supabase.from('holdings').delete().eq('id', holding.id);
          } else {
            await supabase.from('holdings').update({ quantity: holding.quantity - sellQty, ltp: currentLTP, last_updated: new Date().toISOString() }).eq('id', holding.id);
          }

          // Insert Completed Trade
          const mockOrderId = `mock_ord_${Date.now()}`;
          await supabase.from('trades').insert({
            user_id: userId,
            stock_symbol: gtt.stock_symbol,
            stock_name: gtt.stock_symbol,
            trade_type: 'SELL',
            quantity: sellQty,
            price: executionPrice,
            trade_date: new Date().toISOString(),
            order_id: mockOrderId
          });

          // Insert Completed Order record
          await supabase.from('orders').insert({
            user_id: userId,
            stock_symbol: gtt.stock_symbol,
            transaction_type: 'SELL',
            order_type: 'MARKET',
            quantity: sellQty,
            price: executionPrice,
            status: 'COMPLETE',
            broker_order_id: mockOrderId
          });
        } else {
          // Buy execution
          const mockOrderId = `mock_ord_${Date.now()}`;
          await supabase.from('holdings').insert({
            user_id: userId,
            stock_symbol: gtt.stock_symbol,
            stock_name: gtt.stock_symbol,
            average_buy_price: executionPrice,
            quantity: gtt.quantity,
            ltp: currentLTP,
            last_updated: new Date().toISOString()
          });

          // Insert Completed Trade
          await supabase.from('trades').insert({
            user_id: userId,
            stock_symbol: gtt.stock_symbol,
            stock_name: gtt.stock_symbol,
            trade_type: 'BUY',
            quantity: gtt.quantity,
            price: executionPrice,
            trade_date: new Date().toISOString(),
            order_id: mockOrderId
          });

          // Insert Completed Order record
          await supabase.from('orders').insert({
            user_id: userId,
            stock_symbol: gtt.stock_symbol,
            transaction_type: 'BUY',
            order_type: 'MARKET',
            quantity: gtt.quantity,
            price: executionPrice,
            status: 'COMPLETE',
            broker_order_id: mockOrderId
          });
        }

        // Update GTT status to TRIGGERED
        await supabase
          .from('gtts')
          .update({ status: 'TRIGGERED' })
          .eq('id', gtt.id);

        executedCount++;
      }
    }

    res.json({
      message: `Mock Sync executed successfully. Triggers filled: ${executedCount}.`,
      executedCount: executedCount
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/clear-history
 * Clear mock order history (completed/cancelled/rejected orders).
 */
router.post('/clear-history', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('user_id', req.user.id)
      .in('status', ['COMPLETE', 'CANCELLED', 'REJECTED']);

    if (error) throw error;

    res.json({
      status: 'SUCCESS',
      message: 'Completed and cancelled mock order history cleared successfully.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
