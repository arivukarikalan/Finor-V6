import express from 'express';
import crypto from 'crypto';
import pkg from 'kiteconnect';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { getActiveSession, getUserZerodhaCredentials } from '../services/orderService.js';
import { recalculateHoldings } from './trades.js';
import { fetchMultipleLTPs } from '../services/yahooFinance.js';
import { priceCache } from '../services/priceCache.js';
import { getStoredMFHoldings, saveStoredMFHoldings, computeSummary as computeMfSummary } from './mutualFunds.js';

const { KiteConnect } = pkg;
const router = express.Router();

/**
 * Helper to compute equity holdings summary
 */
async function getEquitySummary(userId) {
  try {
    const { data: holdings, error } = await supabaseAdmin
      .from('holdings')
      .select('*')
      .eq('user_id', userId);

    if (error || !holdings) return { value: 0, invested: 0, pnl: 0, pnlPercentage: 0, count: 0, holdings: [] };

    let totalValue = 0;
    let totalInvested = 0;

    holdings.forEach(h => {
      const price = h.ltp !== null && h.ltp !== undefined ? parseFloat(h.ltp) : parseFloat(h.average_buy_price);
      const qty = parseFloat(h.quantity) || 0;
      const buyPrice = parseFloat(h.average_buy_price) || 0;
      totalValue += price * qty;
      totalInvested += buyPrice * qty;
    });

    const totalPnl = totalValue - totalInvested;
    const totalPnlPercentage = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    return {
      value: parseFloat(totalValue.toFixed(2)),
      invested: parseFloat(totalInvested.toFixed(2)),
      pnl: parseFloat(totalPnl.toFixed(2)),
      pnlPercentage: parseFloat(totalPnlPercentage.toFixed(2)),
      count: holdings.length,
      holdings
    };
  } catch (err) {
    console.error('[Portfolio] Error computing equity summary:', err.message);
    return { value: 0, invested: 0, pnl: 0, pnlPercentage: 0, count: 0, holdings: [] };
  }
}

/**
 * GET /api/portfolio/summary
 * Returns aggregated portfolio snapshot: Equities + Mutual Funds + Overall Total
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const session = await getActiveSession(userId);

    const equity = await getEquitySummary(userId);
    const mfHoldings = await getStoredMFHoldings(userId);
    const mfSummary = computeMfSummary(mfHoldings);

    const totalPortfolioValue = parseFloat((equity.value + mfSummary.totalCurrentValue).toFixed(2));
    const totalInvested = parseFloat((equity.invested + mfSummary.totalInvested).toFixed(2));
    const totalPnl = parseFloat((equity.pnl + mfSummary.totalPnl).toFixed(2));
    const totalPnlPercentage = totalInvested > 0 ? parseFloat(((totalPnl / totalInvested) * 100).toFixed(2)) : 0;

    res.json({
      hasActiveSession: !!session,
      equity: {
        value: equity.value,
        invested: equity.invested,
        pnl: equity.pnl,
        pnlPercentage: equity.pnlPercentage,
        count: equity.count
      },
      mutualFunds: {
        value: mfSummary.totalCurrentValue,
        invested: mfSummary.totalInvested,
        pnl: mfSummary.totalPnl,
        pnlPercentage: mfSummary.totalPnlPercentage,
        count: mfSummary.schemesCount
      },
      totalPortfolioValue,
      totalInvested,
      totalPnl,
      totalPnlPercentage,
      positionsCount: equity.count + mfSummary.schemesCount
    });
  } catch (err) {
    console.error('[Portfolio] Error in /summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/portfolio/sync-all
 * One-Click Unified Broker Sync:
 * 1. Synchronizes Zerodha Kite Completed Orders -> Trades
 * 2. Recalculates & updates Equity Holdings positions
 * 3. Pulls & updates Zerodha Coin Mutual Fund holdings
 * 4. Refreshes live prices (LTPs and NAVs)
 * 5. Returns integrated portfolio summary
 */
router.post('/sync-all', requireAuth, async (req, res) => {
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

    let newTradesCount = 0;
    let mfCount = 0;
    const nowIso = new Date().toISOString();

    // 1. Ingest Completed Orders from Zerodha Kite
    try {
      const kiteOrders = await kc.getOrders();
      if (Array.isArray(kiteOrders)) {
        for (const o of kiteOrders) {
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

            const amountStr = parseFloat(price).toFixed(2);
            const defaultHash = crypto
              .createHash('md5')
              .update(`${userId}_${symbol}_${txDateStr}_${tradeType}_${qty}_${amountStr}`)
              .digest('hex');

            let existingTrade = null;
            if (orderId) {
              const { data: byOrder } = await supabaseAdmin
                .from('trades')
                .select('id')
                .eq('user_id', userId)
                .eq('order_id', orderId)
                .maybeSingle();
              existingTrade = byOrder;
            }
            if (!existingTrade) {
              const { data: byHash } = await supabaseAdmin
                .from('trades')
                .select('id')
                .eq('user_id', userId)
                .eq('trade_hash', defaultHash)
                .maybeSingle();
              existingTrade = byHash;
            }

            if (!existingTrade) {
              await supabaseAdmin
                .from('trades')
                .insert({
                  user_id: userId,
                  stock_symbol: symbol,
                  trade_type: tradeType,
                  quantity: qty,
                  price: parseFloat(price.toFixed(2)),
                  trade_date: txDateStr,
                  order_id: orderId || null,
                  trade_hash: defaultHash,
                  source: 'ZERODHA'
                });
              newTradesCount++;
            }
          }
        }
      }
    } catch (orderErr) {
      console.warn('[Portfolio] Non-critical orders sync warning:', orderErr.message);
    }

    // 2. Recalculate Equity Holdings
    await recalculateHoldings(userId);

    // 3. Update Equity LTPs
    try {
      const { data: holdings } = await supabaseAdmin
        .from('holdings')
        .select('stock_symbol')
        .eq('user_id', userId);

      if (holdings && holdings.length > 0) {
        const symbols = holdings.map(h => h.stock_symbol);
        const ltpMap = await fetchMultipleLTPs(symbols);

        for (const [sym, quote] of Object.entries(ltpMap)) {
          if (quote && quote.ltp) {
            priceCache.set(sym, quote.ltp);
            await supabaseAdmin
              .from('holdings')
              .update({
                ltp: quote.ltp,
                last_updated: nowIso
              })
              .eq('user_id', userId)
              .eq('stock_symbol', sym);
          }
        }
      }
    } catch (ltpErr) {
      console.warn('[Portfolio] LTP price refresh warning:', ltpErr.message);
    }

    // 4. Sync Mutual Fund Holdings from Zerodha Coin
    try {
      const kiteMf = await kc.getMFHoldings();
      const mfArray = Array.isArray(kiteMf) ? kiteMf : [];
      mfCount = mfArray.length;

      const mappedMf = mfArray.map((h, idx) => {
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

      await saveStoredMFHoldings(userId, mappedMf);
    } catch (mfErr) {
      console.warn('[Portfolio] Coin MF sync warning:', mfErr.message);
    }

    // 5. Gather Final Portfolio Aggregation
    const equity = await getEquitySummary(userId);
    const mfHoldings = await getStoredMFHoldings(userId);
    const mfSummary = computeMfSummary(mfHoldings);

    const totalPortfolioValue = parseFloat((equity.value + mfSummary.totalCurrentValue).toFixed(2));
    const totalInvested = parseFloat((equity.invested + mfSummary.totalInvested).toFixed(2));
    const totalPnl = parseFloat((equity.pnl + mfSummary.totalPnl).toFixed(2));
    const totalPnlPercentage = totalInvested > 0 ? parseFloat(((totalPnl / totalInvested) * 100).toFixed(2)) : 0;

    res.json({
      status: 'SUCCESS',
      message: `Portfolio synchronized: ${newTradesCount} new order(s), ${mfCount} mutual fund scheme(s).`,
      newTradesCount,
      mfCount,
      summary: {
        equity: {
          value: equity.value,
          invested: equity.invested,
          pnl: equity.pnl,
          pnlPercentage: equity.pnlPercentage,
          count: equity.count
        },
        mutualFunds: {
          value: mfSummary.totalCurrentValue,
          invested: mfSummary.totalInvested,
          pnl: mfSummary.totalPnl,
          pnlPercentage: mfSummary.totalPnlPercentage,
          count: mfSummary.schemesCount
        },
        totalPortfolioValue,
        totalInvested,
        totalPnl,
        totalPnlPercentage,
        positionsCount: equity.count + mfSummary.schemesCount
      },
      syncedAt: nowIso
    });
  } catch (err) {
    console.error('[Portfolio] Unified sync failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
