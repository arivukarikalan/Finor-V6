import express from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

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

// POST /api/snapshots - Capture a new snapshot of current holdings state
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

    // 4. Save to DB
    const snapshotDate = new Date().toISOString().split('T')[0];
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

    res.json({ message: 'Snapshot successfully saved', snapshot: data });
  } catch (err) {
    console.error('Failed to create snapshot:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
