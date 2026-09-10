import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import pkg from 'kiteconnect';
import { getActiveSession, getUserZerodhaCredentials } from '../services/orderService.js';

const { KiteConnect } = pkg;
const router = express.Router();

/**
 * Helper to fetch stored MF holdings for a user.
 * Supports mutual_fund_holdings table with transparent fallback to system_settings.
 */
export async function getStoredMFHoldings(userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('mutual_fund_holdings')
      .select('*')
      .eq('user_id', userId)
      .order('current_value', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (err) {
    // Fall back to system_settings if table not created or error
  }

  try {
    const { data: fallbackData } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', `mutual_funds_${userId}`)
      .maybeSingle();

    if (fallbackData?.value) {
      return typeof fallbackData.value === 'string' 
        ? JSON.parse(fallbackData.value) 
        : fallbackData.value;
    }
  } catch (err) {
    console.error('[MutualFunds] Error fetching fallback holdings:', err.message);
  }

  return [];
}

/**
 * Helper to save MF holdings for a user.
 */
export async function saveStoredMFHoldings(userId, holdings) {
  let savedToTable = false;
  try {
    const { error } = await supabaseAdmin
      .from('mutual_fund_holdings')
      .upsert(holdings, { onConflict: 'user_id, folio, tradingsymbol' });

    if (!error) {
      savedToTable = true;
    }
  } catch (err) {
    // If table doesn't exist, proceed to fallback
  }

  // Always save to system_settings as a resilient cache backup
  try {
    await supabaseAdmin
      .from('system_settings')
      .upsert({
        key: `mutual_funds_${userId}`,
        value: JSON.stringify(holdings),
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });
  } catch (err) {
    console.error('[MutualFunds] Error saving fallback holdings:', err.message);
  }

  return savedToTable;
}

/**
 * Computes portfolio summary statistics
 */
export function computeSummary(holdings) {
  const totalInvested = holdings.reduce((acc, h) => acc + (parseFloat(h.invested_value) || 0), 0);
  const totalCurrentValue = holdings.reduce((acc, h) => acc + (parseFloat(h.current_value) || 0), 0);
  const totalPnl = holdings.reduce((acc, h) => acc + (parseFloat(h.pnl) || 0), 0);
  const totalPnlPercentage = totalInvested > 0 
    ? parseFloat(((totalPnl / totalInvested) * 100).toFixed(2)) 
    : 0;

  return {
    totalInvested: parseFloat(totalInvested.toFixed(2)),
    totalCurrentValue: parseFloat(totalCurrentValue.toFixed(2)),
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    totalPnlPercentage,
    schemesCount: holdings.length
  };
}

/**
 * GET /api/mutual-funds
 * Fetches user's active mutual fund holdings & summary
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const holdings = await getStoredMFHoldings(userId);
    const summary = computeSummary(holdings);

    res.json({
      holdings,
      summary,
      lastSyncedAt: holdings[0]?.last_synced_at || null
    });
  } catch (err) {
    console.error('[MutualFunds] Error fetching holdings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mutual-funds/sync-coin
 * Synchronizes mutual fund holdings directly from Zerodha Coin
 */
router.post('/sync-coin', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const session = await getActiveSession(userId);

    if (!session) {
      return res.status(400).json({
        status: 'NO_SESSION',
        message: 'No active Zerodha Kite session found for today. Please sign in via Orders page to authenticate your broker session.'
      });
    }

    const credentials = await getUserZerodhaCredentials(userId);
    const apiKey = credentials.apiKey || process.env.ZERODHA_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        status: 'NO_CREDENTIALS',
        message: 'Zerodha API key not configured in Profile Settings.'
      });
    }

    const kc = new KiteConnect({
      api_key: apiKey,
      access_token: session.access_token
    });

    // Fetch mutual fund holdings from Zerodha Coin
    const kiteHoldings = await kc.getMFHoldings();
    const holdingsArray = Array.isArray(kiteHoldings) ? kiteHoldings : [];

    const nowIso = new Date().toISOString();
    const mappedHoldings = holdingsArray.map((h, idx) => {
      const qty = parseFloat(h.quantity || 0);
      const avgPrice = parseFloat(h.average_price || 0);
      const lastPrice = parseFloat(h.last_price || avgPrice);
      const invested = parseFloat((qty * avgPrice).toFixed(2));
      const current = parseFloat((qty * lastPrice).toFixed(2));
      const pnl = h.pnl !== undefined ? parseFloat(h.pnl) : parseFloat((current - invested).toFixed(2));
      const pnlPct = invested > 0 ? parseFloat(((pnl / invested) * 100).toFixed(2)) : 0;

      return {
        id: h.id || `mf_${userId}_${idx}`,
        user_id: userId,
        folio: h.folio || 'DEFAULT',
        scheme_name: h.fund || h.tradingsymbol || 'Mutual Fund Scheme',
        tradingsymbol: h.tradingsymbol || '',
        quantity: qty,
        average_price: avgPrice,
        last_price: lastPrice,
        last_price_date: h.last_price_date || nowIso.substring(0, 10),
        pnl: pnl,
        pnl_percentage: pnlPct,
        invested_value: invested,
        current_value: current,
        last_synced_at: nowIso
      };
    });

    await saveStoredMFHoldings(userId, mappedHoldings);
    const summary = computeSummary(mappedHoldings);

    res.json({
      status: 'SUCCESS',
      message: `Successfully synchronized ${mappedHoldings.length} mutual fund holdings from Zerodha Coin.`,
      count: mappedHoldings.length,
      holdings: mappedHoldings,
      summary
    });
  } catch (err) {
    console.error('[MutualFunds] sync-coin failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mutual-funds/refresh-nav
 * Daily NAV price refresh endpoint
 */
router.post('/refresh-nav', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const session = await getActiveSession(userId);

    // If an active session exists, sync directly from Zerodha Coin
    if (session) {
      const credentials = await getUserZerodhaCredentials(userId);
      const apiKey = credentials.apiKey || process.env.ZERODHA_API_KEY;

      if (apiKey) {
        const kc = new KiteConnect({
          api_key: apiKey,
          access_token: session.access_token
        });

        const kiteHoldings = await kc.getMFHoldings();
        if (Array.isArray(kiteHoldings)) {
          const nowIso = new Date().toISOString();
          const mapped = kiteHoldings.map((h, idx) => {
            const qty = parseFloat(h.quantity || 0);
            const avgPrice = parseFloat(h.average_price || 0);
            const lastPrice = parseFloat(h.last_price || avgPrice);
            const invested = parseFloat((qty * avgPrice).toFixed(2));
            const current = parseFloat((qty * lastPrice).toFixed(2));
            const pnl = h.pnl !== undefined ? parseFloat(h.pnl) : parseFloat((current - invested).toFixed(2));
            const pnlPct = invested > 0 ? parseFloat(((pnl / invested) * 100).toFixed(2)) : 0;

            return {
              id: h.id || `mf_${userId}_${idx}`,
              user_id: userId,
              folio: h.folio || 'DEFAULT',
              scheme_name: h.fund || h.tradingsymbol || 'Mutual Fund Scheme',
              tradingsymbol: h.tradingsymbol || '',
              quantity: qty,
              average_price: avgPrice,
              last_price: lastPrice,
              last_price_date: h.last_price_date || nowIso.substring(0, 10),
              pnl: pnl,
              pnl_percentage: pnlPct,
              invested_value: invested,
              current_value: current,
              last_synced_at: nowIso
            };
          });

          await saveStoredMFHoldings(userId, mapped);
          const summary = computeSummary(mapped);

          return res.json({
            status: 'SUCCESS',
            source: 'ZERODHA_COIN',
            message: 'NAV prices refreshed via Zerodha Coin.',
            holdings: mapped,
            summary
          });
        }
      }
    }

    // If session is expired, return cached holdings with summary
    const cached = await getStoredMFHoldings(userId);
    const summary = computeSummary(cached);

    res.json({
      status: 'CACHED',
      source: 'LOCAL_CACHE',
      message: 'Broker session offline. Returned last recorded NAV valuations.',
      holdings: cached,
      summary
    });
  } catch (err) {
    console.error('[MutualFunds] refresh-nav failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
