import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { sendResetKeyEmail } from '../services/emailService.js';
import { reconcileAllStagingTrades, reconcileAllStagingTransactions } from '../utils/reconcile.js';

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

    // Call loop-based staging reconciliation functions to process all backlogs
    const txResult = await reconcileAllStagingTransactions();
    const tradeResult = await reconcileAllStagingTrades();

    res.json({
      success: true,
      message: 'Reconciliation executed successfully.',
      transactions: txResult,
      trades: tradeResult
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
 * GET /api/admin/users
 * Returns list of registered tenant profiles with activity metrics (SUPER_ADMIN only)
 */
router.get('/users', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, username, country, gender, created_at, temp_reset_expiry')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch counts per user for portfolio activity: holdings count & trades count
    const [holdingsRes, tradesRes] = await Promise.all([
      supabaseAdmin.from('holdings').select('user_id'),
      supabaseAdmin.from('trades').select('user_id')
    ]);

    const holdingsMap = {};
    (holdingsRes.data || []).forEach(h => {
      holdingsMap[h.user_id] = (holdingsMap[h.user_id] || 0) + 1;
    });

    const tradesMap = {};
    (tradesRes.data || []).forEach(t => {
      tradesMap[t.user_id] = (tradesMap[t.user_id] || 0) + 1;
    });

    const now = new Date();
    const enrichedUsers = (profiles || []).map(p => ({
      ...p,
      holdings_count: holdingsMap[p.id] || 0,
      trades_count: tradesMap[p.id] || 0,
      has_active_reset_key: !!(p.temp_reset_expiry && new Date(p.temp_reset_expiry) > now)
    }));

    res.json(enrichedUsers);
  } catch (err) {
    console.error('[AdminRoute] Fetch users failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * Updates a user's role between USER and SUPER_ADMIN (SUPER_ADMIN only)
 */
router.patch('/users/:id/role', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['USER', 'SUPER_ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Role must be either USER or SUPER_ADMIN.' });
    }

    // Guard: Prevent the caller from demoting themselves!
    if (id === req.user.id && role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'You cannot demote your own Super Admin account.' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({ role })
      .eq('id', id)
      .select('id, email, role')
      .single();

    if (error) throw error;

    res.json({
      status: 'SUCCESS',
      message: `User ${updated.email} updated to ${role}.`,
      user: updated
    });
  } catch (err) {
    console.error('[AdminRoute] Update role failed:', err.message);
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

    if (!admin_response || !admin_response.trim()) {
      return res.status(400).json({ error: 'Admin response is required.' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('support_tickets')
      .update({
        admin_response: admin_response.trim(),
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

/**
 * PATCH /api/admin/tickets/:id/status
 * Updates ticket status (OPEN, REVIEWING, RESOLVED) with optional response (SUPER_ADMIN only)
 */
router.patch('/tickets/:id/status', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_response } = req.body;

    if (!['OPEN', 'REVIEWING', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be OPEN, REVIEWING, or RESOLVED.' });
    }

    const updatePayload = { status };
    if (admin_response !== undefined) {
      updatePayload.admin_response = admin_response;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('support_tickets')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      status: 'SUCCESS',
      message: `Ticket marked as ${status}.`,
      ticket: updated
    });
  } catch (err) {
    console.error('[AdminRoute] Update ticket status failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/tickets/:id
 * Permanently deletes a support ticket (SUPER_ADMIN only)
 */
router.delete('/tickets/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('support_tickets')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      status: 'SUCCESS',
      message: 'Support ticket permanently deleted.'
    });
  } catch (err) {
    console.error('[AdminRoute] Delete support ticket failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/tickets/clear-resolved
 * Bulk purges all resolved support tickets (SUPER_ADMIN only)
 */
router.post('/tickets/clear-resolved', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { data: deleted, error } = await supabaseAdmin
      .from('support_tickets')
      .delete()
      .eq('status', 'RESOLVED')
      .select('id');

    if (error) throw error;

    res.json({
      status: 'SUCCESS',
      message: `Purged ${deleted?.length || 0} resolved support tickets.`
    });
  } catch (err) {
    console.error('[AdminRoute] Clear resolved tickets failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/tickets/:id/generate-reset-key
 * Generates an 8-character reset key valid for 2 hours, sends it to the user via Gmail SMTP,
 * and updates ticket status to REVIEWING or RESOLVED.
 */
router.post('/tickets/:id/generate-reset-key', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const markResolved = req.body?.markResolved === true;

    // 1. Fetch support ticket with user profile email
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('*, profiles:user_id(email)')
      .eq('id', id)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ error: 'Support ticket not found.' });
    }

    const userEmail = ticket.profiles?.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'User email not found for this ticket.' });
    }

    // 2. Generate random reset key: RST-XXXXXX
    const randomSuffix = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const resetKey = `RST-${randomSuffix}`;
    const expiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now

    // 3. Save reset key on the user's profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        temp_reset_key: resetKey,
        temp_reset_expiry: expiry
      })
      .eq('id', ticket.user_id);

    if (profileError) throw profileError;

    const newStatus = markResolved ? 'RESOLVED' : 'REVIEWING';
    const statusNote = markResolved ? 'Resolved: Recovery key generated' : 'Support key generated';

    // 4. Update support ticket status and record the action
    const { data: updatedTicket, error: updateError } = await supabaseAdmin
      .from('support_tickets')
      .update({
        status: newStatus,
        admin_response: `${statusNote}: ${resetKey} (Sent to ${userEmail}. Valid for 2 hours)`
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // 5. Dispatch the key via Gmail SMTP (non-blocking)
    sendResetKeyEmail(userEmail, resetKey).catch(err => {
      console.error('[AdminRoute] Reset key email dispatch failed:', err.message);
    });

    res.json({
      status: 'SUCCESS',
      message: `Reset key generated and sent to ${userEmail} successfully.`,
      resetKey,
      ticket: updatedTicket
    });
  } catch (err) {
    console.error('[AdminRoute] Generate reset key failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/analytics
 * Returns comprehensive platform telemetry, metrics, and server health (SUPER_ADMIN only)
 */
router.get('/analytics', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const [
      usersCountRes,
      holdingsCountRes,
      tradesCountRes,
      ticketsRes,
      newsCacheRes,
      priceCacheRes
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('holdings').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('trades').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('support_tickets').select('status'),
      supabaseAdmin.from('news_cache').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('price_cache').select('*', { count: 'exact', head: true })
    ]);

    const tickets = ticketsRes.data || [];
    const openTickets = tickets.filter(t => t.status === 'OPEN').length;
    const reviewingTickets = tickets.filter(t => t.status === 'REVIEWING').length;
    const resolvedTickets = tickets.filter(t => t.status === 'RESOLVED').length;
    const totalTickets = tickets.length;
    const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 100;

    const mem = process.memoryUsage();

    res.json({
      metrics: {
        totalUsers: usersCountRes.count || 0,
        totalHoldings: holdingsCountRes.count || 0,
        totalTrades: tradesCountRes.count || 0,
        tickets: {
          total: totalTickets,
          open: openTickets,
          reviewing: reviewingTickets,
          resolved: resolvedTickets,
          pending: openTickets + reviewingTickets,
          resolutionRate: parseFloat(resolutionRate.toFixed(1))
        },
        cache: {
          newsCacheItems: newsCacheRes.count || 0,
          priceCacheItems: priceCacheRes.count || 0
        }
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: parseFloat((mem.rss / (1024 * 1024)).toFixed(1)),
        memoryHeapUsedMb: parseFloat((mem.heapUsed / (1024 * 1024)).toFixed(1)),
        memoryHeapTotalMb: parseFloat((mem.heapTotal / (1024 * 1024)).toFixed(1)),
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[AdminRoute] Fetch analytics failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/trigger-reconcile
 * Allows Super Admin to manually trigger staging reconciliation directly from the UI
 */
router.post('/trigger-reconcile', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const txResult = await reconcileAllStagingTransactions();
    const tradeResult = await reconcileAllStagingTrades();

    res.json({
      status: 'SUCCESS',
      message: 'Staging transactions and trades reconciled successfully.',
      transactions: txResult,
      trades: tradeResult
    });
  } catch (err) {
    console.error('[AdminRoute] Trigger reconcile failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const BROADCAST_KEY = 'SETTINGS_GLOBAL_BROADCAST';

/**
 * GET /api/admin/broadcast
 * Retrieves the global broadcast banner
 */
router.get('/broadcast', requireAuth, async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from('news_cache')
      .select('news_content')
      .eq('stock_symbol', BROADCAST_KEY)
      .maybeSingle();

    res.json({ banner: data?.news_content || null });
  } catch (err) {
    console.error('[AdminRoute] Get broadcast failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/broadcast
 * Creates or updates the global broadcast banner (SUPER_ADMIN only)
 */
router.post('/broadcast', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { message, severity, active } = req.body;

    if (!active || !message || !message.trim()) {
      await supabaseAdmin
        .from('news_cache')
        .delete()
        .eq('stock_symbol', BROADCAST_KEY);

      return res.json({ status: 'SUCCESS', message: 'Broadcast banner disabled/cleared.' });
    }

    const bannerContent = {
      message: message.trim(),
      severity: severity || 'INFO', // INFO, WARNING, SUCCESS
      active: true,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseAdmin
      .from('news_cache')
      .upsert({
        stock_symbol: BROADCAST_KEY,
        news_content: bannerContent,
        updated_at: new Date().toISOString()
      }, { onConflict: 'stock_symbol' });

    if (error) throw error;

    res.json({
      status: 'SUCCESS',
      message: 'Broadcast banner published successfully.',
      banner: bannerContent
    });
  } catch (err) {
    console.error('[AdminRoute] Set broadcast failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
