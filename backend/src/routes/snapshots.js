import express from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { getStockDailyPrices } from '../services/yahooFinance.js';

const router = express.Router();

// GET /api/snapshots - Retrieve all historical portfolio snapshots
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Failed to fetch snapshots:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/snapshots - Capture a new snapshot of current holdings state (with duplicate prevention)
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 1. Fetch active holdings
    const { data: holdings, error: holdError } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId);

    if (holdError) throw holdError;

    // 2. Calculate values
    const totalInvested = holdings.reduce((sum, h) => sum + (h.average_buy_price * h.quantity), 0);
    const totalValue = holdings.reduce((sum, h) => sum + ((h.ltp || h.average_buy_price) * h.quantity), 0);
    const weeklyPL = totalValue - totalInvested;

    // 3. Format holdings state
    const holdingsState = holdings.map(h => ({
      stock_symbol: h.stock_symbol,
      stock_name: h.stock_name,
      quantity: h.quantity,
      average_buy_price: h.average_buy_price,
      ltp: h.ltp || h.average_buy_price
    }));

    const snapshotDate = new Date().toISOString().split('T')[0];

    // 4. Duplicate Check: Check if snapshot already exists for today
    const { data: existing, error: checkError } = await supabase
      .from('portfolio_snapshots')
      .select('id')
      .eq('user_id', userId)
      .eq('snapshot_date', snapshotDate)
      .maybeSingle();

    if (checkError) throw checkError;

    let savedData;
    if (existing) {
      // Update existing snapshot
      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .update({
          holdings_state: holdingsState,
          total_invested: totalInvested,
          total_value: totalValue,
          weekly_pnl: weeklyPL
        })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (error) throw error;
      savedData = data;
    } else {
      // Insert new snapshot
      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .insert({
          user_id: userId,
          snapshot_date: snapshotDate,
          holdings_state: holdingsState,
          total_invested: totalInvested,
          total_value: totalValue,
          weekly_pnl: weeklyPL
        })
        .select()
        .single();

      if (error) throw error;
      savedData = data;
    }

    res.json({ message: 'Snapshot successfully saved', snapshot: savedData });
  } catch (err) {
    console.error('Failed to create snapshot:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/snapshots/initialize-history - Generate snapshots chronologically from trade history
router.post('/initialize-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch all user trades in ascending date order
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true });

    if (tradesError) throw tradesError;
    if (!trades || trades.length === 0) {
      return res.json({ message: 'No trades found to reconstruct history.', count: 0 });
    }

    // 2. Fetch daily prices for all unique symbols in trades
    const uniqueSymbols = [...new Set(trades.map(t => t.stock_symbol.toUpperCase()))];
    const dailyPricesMap = {};
    await Promise.all(
      uniqueSymbols.map(async (symbol) => {
        try {
          const prices = await getStockDailyPrices(symbol);
          dailyPricesMap[symbol] = prices || {};
        } catch (err) {
          console.error(`[SnapshotsHistory] Failed to pre-fetch daily prices for ${symbol}:`, err.message);
          dailyPricesMap[symbol] = {};
        }
      })
    );

    // Helper to get closest available historical closing price
    const getPriceForDate = (symbol, dateStr) => {
      const symbolPrices = dailyPricesMap[symbol];
      if (!symbolPrices) return null;
      if (symbolPrices[dateStr] !== undefined) return symbolPrices[dateStr];
      
      // Look back up to 10 days (for weekends or holidays)
      const date = new Date(dateStr);
      for (let i = 1; i <= 10; i++) {
        const prevDate = new Date(date);
        prevDate.setDate(prevDate.getDate() - i);
        const prevDateStr = prevDate.toISOString().split('T')[0];
        if (symbolPrices[prevDateStr] !== undefined) {
          return symbolPrices[prevDateStr];
        }
      }
      return null;
    };

    // 3. Determine start date and loop week-by-week
    const firstTradeDate = new Date(trades[0].trade_date);
    const today = new Date();
    let currentDate = new Date(firstTradeDate);

    let createdCount = 0;
    let updatedCount = 0;

    // We step weekly (every 7 days) from the first trade to today
    while (currentDate <= today) {
      const snapDateStr = currentDate.toISOString().split('T')[0];

      // Reconstruct holdings state *as of* snapDateStr
      const positions = {};

      trades.forEach(t => {
        const tradeDate = new Date(t.trade_date);
        if (tradeDate > currentDate) return; // skip future trades

        const sym = t.stock_symbol.toUpperCase();
        const qty = Number(t.quantity);
        const price = Number(t.price);
        const type = t.trade_type.toUpperCase();

        if (type === 'BUY' || type === 'B') {
          if (!positions[sym]) {
            positions[sym] = {
              stock_symbol: sym,
              stock_name: t.stock_name || sym,
              quantity: 0,
              average_buy_price: 0,
              buyQueue: []
            };
          }
          positions[sym].quantity += qty;
          positions[sym].buyQueue.push({ quantity: qty, price: price });
        } else if (type === 'SELL' || type === 'S') {
          if (positions[sym]) {
            positions[sym].quantity = Math.max(0, positions[sym].quantity - qty);
            
            // Consume from FIFO queue
            let sellQtyRemaining = qty;
            while (sellQtyRemaining > 0 && positions[sym].buyQueue.length > 0) {
              const earliestBuy = positions[sym].buyQueue[0];
              const matchedQty = Math.min(sellQtyRemaining, earliestBuy.quantity);
              earliestBuy.quantity -= matchedQty;
              sellQtyRemaining -= matchedQty;
              if (earliestBuy.quantity === 0) {
                positions[sym].buyQueue.shift();
              }
            }
          }
        }
      });

      // Filter to keep only active holdings
      const holdingsState = Object.values(positions)
        .filter((h) => h.quantity > 0)
        .map((h) => {
          const historicalLtp = getPriceForDate(h.stock_symbol, snapDateStr);
          
          const totalQty = h.buyQueue.reduce((acc, b) => acc + b.quantity, 0);
          const totalCost = h.buyQueue.reduce((acc, b) => acc + (b.quantity * b.price), 0);
          const fifoAveragePrice = totalQty > 0 ? totalCost / totalQty : h.average_buy_price;

          return {
            stock_symbol: h.stock_symbol,
            stock_name: h.stock_name,
            quantity: h.quantity,
            average_buy_price: fifoAveragePrice,
            ltp: historicalLtp !== null ? historicalLtp : fifoAveragePrice
          };
        });

      // Calculate totals
      const totalInvested = holdingsState.reduce((sum, h) => sum + (h.average_buy_price * h.quantity), 0);
      const totalValue = holdingsState.reduce((sum, h) => sum + (h.ltp * h.quantity), 0);
      const weeklyPL = totalValue - totalInvested;

      // Duplicate Check: Check if snapshot already exists for this date
      const { data: existing, error: checkError } = await supabase
        .from('portfolio_snapshots')
        .select('id')
        .eq('user_id', userId)
        .eq('snapshot_date', snapDateStr)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        // Update existing snapshot
        const { error } = await supabase
          .from('portfolio_snapshots')
          .update({
            holdings_state: holdingsState,
            total_invested: totalInvested,
            total_value: totalValue,
            weekly_pnl: weeklyPL
          })
          .eq('id', existing.id);
        
        if (error) throw error;
        updatedCount++;
      } else {
        // Insert new snapshot
        const { error } = await supabase
          .from('portfolio_snapshots')
          .insert({
            user_id: userId,
            snapshot_date: snapDateStr,
            holdings_state: holdingsState,
            total_invested: totalInvested,
            total_value: totalValue,
            weekly_pnl: weeklyPL
          });

        if (error) throw error;
        createdCount++;
      }

      // Step forward by 7 days
      currentDate.setDate(currentDate.getDate() + 7);
    }

    res.json({
      message: 'Historical snapshots successfully reconstructed.',
      created: createdCount,
      updated: updatedCount
    });
  } catch (err) {
    console.error('Failed to initialize snapshots history:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
