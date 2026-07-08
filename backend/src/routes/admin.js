import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Middleware to verify if the authenticated user has the SUPER_ADMIN role
async function requireSuperAdmin(req, res, next) {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (error || !profile || profile.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Super Admin access required.' });
    }

    next();
  } catch (err) {
    console.error('[AdminMiddleware] Role validation failed:', err.message);
    return res.status(500).json({ error: 'Internal role validation error.' });
  }
}

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

/**
 * GET /api/admin/tickets
 * Returns a list of all support tickets with user email profiles (SUPER_ADMIN only)
 */
router.get('/tickets', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { data: tickets, error } = await supabaseAdmin
      .from('support_tickets')
      .select('*, profiles:user_id(email)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(tickets);
  } catch (err) {
    console.error('[AdminRoute] Fetch support tickets failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/users-count
 * Returns the total users metric (SUPER_ADMIN only)
 */
router.get('/users-count', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { count, error } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    res.json({ totalUsers: count || 0 });
  } catch (err) {
    console.error('[AdminRoute] Fetch users count failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/tickets/:id/resolve
 * Responds to and resolves a ticket (SUPER_ADMIN only)
 */
router.patch('/tickets/:id/resolve', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_response } = req.body;

    if (!admin_response) {
      return res.status(400).json({ error: 'Admin response is required.' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('support_tickets')
      .update({
        admin_response,
        status: 'RESOLVED'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      status: 'SUCCESS',
      message: 'Support ticket resolved successfully.',
      ticket: updated
    });
  } catch (err) {
    console.error('[AdminRoute] Resolve support ticket failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
