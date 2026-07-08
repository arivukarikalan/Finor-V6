import express from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/admin/settings
 * Retrieves app settings for the authenticated user, creating a default entry if missing.
 */
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    let { data: settings, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    // Create default settings if not found
    if (!settings) {
      const { data: newSettings, error: insertError } = await supabase
        .from('app_settings')
        .insert({
          user_id: userId,
          price_refresh_interval: 10,
          ai_daily_limit: 10
        })
        .select()
        .single();

      if (insertError) throw insertError;
      settings = newSettings;
    }

    res.json(settings);
  } catch (err) {
    console.error('[AdminRoute] Get settings failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/settings
 * Updates the user's customizable settings.
 */
router.post('/settings', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { price_refresh_interval, ai_daily_limit } = req.body;

    const updateData = {};
    if (price_refresh_interval !== undefined) {
      updateData.price_refresh_interval = parseInt(price_refresh_interval, 10);
    }
    if (ai_daily_limit !== undefined) {
      updateData.ai_daily_limit = parseInt(ai_daily_limit, 10);
    }
    updateData.updated_at = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('app_settings')
      .update(updateData)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      status: 'SUCCESS',
      message: 'App settings updated successfully.',
      settings: updated
    });
  } catch (err) {
    console.error('[AdminRoute] Update settings failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/clear-cache
 * Clears news cache and historical price cache from the database.
 */
router.post('/clear-cache', requireAuth, async (req, res) => {
  try {
    // Since it's a single-user system, delete all cached symbols except settings keys
    const { error: newsError } = await supabase
      .from('news_cache')
      .delete()
      .not('stock_symbol', 'like', 'SETTINGS_%');

    if (newsError) throw newsError;

    const { error: priceError } = await supabase
      .from('price_cache')
      .delete()
      .neq('stock_symbol', '');

    if (priceError) throw priceError;

    res.json({
      status: 'SUCCESS',
      message: 'Successfully cleared historical price and stock news caches.'
    });
  } catch (err) {
    console.error('[AdminRoute] Clear cache failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/admin/reconcile ────────────────────────────────────────────────
router.post('/reconcile', async (req, res) => {
  try {
    const cronSecret = req.headers['x-cron-secret'];
    const expectedSecret = process.env.CRON_SECRET_KEY;

    if (!expectedSecret) {
      console.warn('[AdminRoute] CRON_SECRET_KEY is not defined in server environment variables.');
    }

    if (!cronSecret || cronSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing x-cron-secret header.' });
    }

    // Call PostgreSQL RPC reconcile functions
    const { data: txResult, error: txError } = await supabase.rpc('reconcile_staging_transactions');
    if (txError) throw txError;

    const { data: tradeResult, error: tradeError } = await supabase.rpc('reconcile_staging_trades');
    if (tradeError) throw tradeError;

    res.json({
      success: true,
      message: 'Reconciliation executed successfully.',
      transactions: txResult || { processed: 0, duplicates: 0, failed: 0 },
      trades: tradeResult || { processed: 0, duplicates: 0, failed: 0 }
    });

  } catch (err) {
    console.error('[AdminRoute] Staging reconciliation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
