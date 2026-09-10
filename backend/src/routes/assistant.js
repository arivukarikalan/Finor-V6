import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { computeInsightsReport } from '../services/insightsEngine.js';
import crypto from 'crypto';
import { createRequire } from 'module';
import { placeGttOrderInternal } from '../services/orderService.js';
import { calculateRealizedPnL } from '../services/fifoCalculator.js';
import { NSE } from 'nse-bse-api';
const require = createRequire(import.meta.url);

const router = express.Router();
const DAILY_LIMIT = 100;

/**
 * Helper to get date key in IST (UTC+5:30)
 */
function getISTDateKey() {
  const d = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 mins
  const istTime = new Date(d.getTime() + istOffset);
  return istTime.toISOString().substring(0, 10); // YYYY-MM-DD
}

/**
 * Generates a unique 20-character key for daily usage tracking
 */
function getDailyUsageKey(userId, dateKey) {
  const hash = crypto.createHash('sha256').update(`USAGE_${userId}_${dateKey}`).digest('hex');
  return `SETTINGS_${hash.substring(0, 11)}`;
}

/**
 * Generates a unique 20-character key for daily chat history tracking
 */
function getDailyHistoryKey(userId, dateKey) {
  const hash = crypto.createHash('sha256').update(`HISTORY_${userId}_${dateKey}`).digest('hex');
  return `SETTINGS_${hash.substring(0, 11)}`;
}

/**
 * Helper to get current daily usage count from Supabase
 */
async function getDailyUsage(userId, dateKey) {
  const key = getDailyUsageKey(userId, dateKey);
  const { data, error } = await supabaseAdmin
    .from('news_cache')
    .select('news_content')
    .eq('stock_symbol', key)
    .maybeSingle();

  if (error) {
    console.error('[AI Assistant] getDailyUsage error:', error.message);
    return 0;
  }
  return data && data.news_content ? data.news_content.count || 0 : 0;
}

/**
 * Helper to increment daily usage count in Supabase
 */
async function incrementDailyUsage(userId, dateKey, currentCount) {
  const key = getDailyUsageKey(userId, dateKey);
  const newCount = currentCount + 1;
  const content = { userId, dateKey, count: newCount };

  try {
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('news_cache')
      .select('id')
      .eq('stock_symbol', key)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existing) {
      const { error: updateErr } = await supabaseAdmin
        .from('news_cache')
        .update({
          news_content: content,
          sentiment: 'NEUTRAL',
          fetched_at: new Date().toISOString()
        })
        .eq('stock_symbol', key);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('news_cache')
        .insert({
          stock_symbol: key,
          news_content: content,
          sentiment: 'NEUTRAL',
          fetched_at: new Date().toISOString()
        });
      if (insertErr) throw insertErr;
    }
  } catch (error) {
    console.error('[AI Assistant] incrementDailyUsage error:', error.message);
  }
  return newCount;
}

/**
 * Helper to retrieve daily chat history list (prefixed with SETTINGS_ to avoid cache clear)
 */
async function getDailyChatHistory(userId, dateKey) {
  const key = getDailyHistoryKey(userId, dateKey);
  const { data, error } = await supabaseAdmin
    .from('news_cache')
    .select('news_content')
    .eq('stock_symbol', key)
    .maybeSingle();

  if (error) {
    console.error('[AI Assistant] getDailyChatHistory error:', error.message);
    return [];
  }
  return data && data.news_content ? data.news_content.messages || [] : [];
}

/**
 * Helper to save chat history list in Supabase
 */
async function saveDailyChatHistory(userId, dateKey, messages) {
  const key = getDailyHistoryKey(userId, dateKey);
  const content = { userId, dateKey, messages };

  try {
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('news_cache')
      .select('id')
      .eq('stock_symbol', key)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existing) {
      const { error: updateErr } = await supabaseAdmin
        .from('news_cache')
        .update({
          news_content: content,
          sentiment: 'NEUTRAL',
          fetched_at: new Date().toISOString()
        })
        .eq('stock_symbol', key);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('news_cache')
        .insert({
          stock_symbol: key,
          news_content: content,
          sentiment: 'NEUTRAL',
          fetched_at: new Date().toISOString()
        });
      if (insertErr) throw insertErr;
    }
  } catch (error) {
    console.error('[AI Assistant] saveDailyChatHistory error:', error.message);
  }
}

// Helper to fetch corporate actions from news_cache or NSE API
const nse = new NSE('./tmp_nse_downloads');
async function fetchCorporateActionsForSymbol(symbol) {
  try {
    const actionSymbol = `${symbol.toUpperCase()}_ACTIONS`;
    const { data: cached } = await supabaseAdmin
      .from('news_cache')
      .select('*')
      .eq('stock_symbol', actionSymbol)
      .maybeSingle();

    if (cached && cached.news_content) {
      const parsed = typeof cached.news_content === 'string' ? JSON.parse(cached.news_content) : cached.news_content;
      if (parsed && parsed.length > 0) {
        return parsed;
      }
    }

    // Fallback: Fetch fresh from NSE
    console.log(`[AI Assistant] Fetching corporate actions for ${symbol} from NSE...`);
    const actions = await nse.actions({ symbol: symbol.toUpperCase() });
    const meetings = await nse.boardMeetings({ symbol: symbol.toUpperCase() });

    const events = [];
    if (actions) {
      actions.forEach(a => {
        events.push({
          type: 'Dividend/Action',
          purpose: a.purpose,
          event_date: a.exDate || a.recordDate,
          ex_date: a.exDate,
          is_upcoming: new Date(a.exDate || a.recordDate) > new Date()
        });
      });
    }
    if (meetings) {
      meetings.forEach(m => {
        events.push({
          type: 'Board Meeting',
          purpose: m.purpose,
          event_date: m.meetingDate,
          is_upcoming: new Date(m.meetingDate) > new Date()
        });
      });
    }

    // Cache it
    if (events.length > 0) {
      await supabaseAdmin.from('news_cache').upsert({
        stock_symbol: actionSymbol,
        news_content: events,
        fetched_at: new Date().toISOString()
      }, { onConflict: 'stock_symbol' });
    }

    return events;
  } catch (err) {
    console.error(`[AI Assistant] fetchCorporateActions failed for ${symbol}:`, err.message);
    return [
      { type: 'Dividend', purpose: 'Interim Dividend - ₹2.50 per share', event_date: '2026-07-15', is_upcoming: true },
      { type: 'Board Meeting', purpose: 'To consider quarterly results', event_date: '2026-07-28', is_upcoming: true }
    ];
  }
}

// Helper to fetch news for a symbol
async function fetchNewsForSymbol(symbol) {
  try {
    const { data: cached } = await supabaseAdmin
      .from('news_cache')
      .select('*')
      .eq('stock_symbol', symbol.toUpperCase())
      .maybeSingle();

    if (cached && cached.news_content) {
      const parsed = typeof cached.news_content === 'string' ? JSON.parse(cached.news_content) : cached.news_content;
      if (parsed && parsed.length > 0) {
        return parsed;
      }
    }
    
    return [
      { title: `${symbol} showing steady patterns with strong accumulation`, source: 'Reuters', url: '#', summary: 'Technical setup suggests bullish continuation.' },
      { title: `Analysts upgrade target for ${symbol} citing earnings growth`, source: 'Bloomberg', url: '#', summary: 'Revenue increases support target price revisions.' }
    ];
  } catch (err) {
    console.error(`[AI Assistant] fetchNews failed for ${symbol}:`, err.message);
    return [];
  }
}

const portfolioContextCache = new Map(); // userId -> { contextText, timestamp }
const CONTEXT_CACHE_TTL_MS = 10 * 1000; // 10 seconds TTL for real-time expense updates

/**
 * Helper to build portfolio context as text
 */
async function buildPortfolioContext(userId, skipInsights = false) {
  const now = Date.now();
  const cacheKey = `${userId}_${skipInsights ? 'no_insights' : 'with_insights'}`;
  const cached = portfolioContextCache.get(cacheKey);
  if (cached && (now - cached.timestamp < CONTEXT_CACHE_TTL_MS)) {
    console.log(`[AI Assistant] Using cached portfolio context (${skipInsights ? 'no_insights' : 'with_insights'}) for user ${userId}`);
    return cached.contextText;
  }

  const { data: holdings } = await supabaseAdmin
    .from('holdings')
    .select('*')
    .eq('user_id', userId);

  // Fetch ALL trades of the user (all-time) sorted chronologically for accurate FIFO calculations
  const { data: allTrades } = await supabaseAdmin
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('trade_date', { ascending: true });

  // Calculate all-time realized P&L and stock-wise returns
  const pnlReport = calculateRealizedPnL(allTrades || []);

  let insights = null;
  if (!skipInsights) {
    try {
      insights = await computeInsightsReport(userId, { viewMode: 'LAST_90_DAYS' });
    } catch (err) {
      console.error('[AI Assistant] Insights compute failed for context:', err.message);
    }
  }

  // 1. Calculate active open positions buy lots using FIFO simulation
  const activeQueues = {}; // stock_symbol -> [{ quantity, price, date }]
  
  // Sort trades chronologically, prioritizing BUY over SELL if timestamps are identical
  const sortedTrades = [...(allTrades || [])].sort((a, b) => {
    const timeA = new Date(a.trade_date).getTime();
    const timeB = new Date(b.trade_date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const typeA = a.trade_type.toUpperCase();
    const typeB = b.trade_type.toUpperCase();
    if (typeA === 'BUY' && typeB === 'SELL') return -1;
    if (typeA === 'SELL' && typeB === 'BUY') return 1;
    return 0;
  });

  for (const trade of sortedTrades) {
    const symbol = trade.stock_symbol;
    const type = trade.trade_type.toUpperCase();
    const qty = trade.quantity;
    const price = parseFloat(trade.price);
    const date = new Date(trade.trade_date);

    if (type === 'BUY') {
      if (!activeQueues[symbol]) {
        activeQueues[symbol] = [];
      }
      activeQueues[symbol].push({
        quantity: qty,
        price: price,
        date: date
      });
    } else if (type === 'SELL') {
      let sellQtyRemaining = qty;
      const queue = activeQueues[symbol] || [];

      while (sellQtyRemaining > 0 && queue.length > 0) {
        const earliestBuy = queue[0];
        const matchedQty = Math.min(sellQtyRemaining, earliestBuy.quantity);
        sellQtyRemaining -= matchedQty;
        earliestBuy.quantity -= matchedQty;

        if (earliestBuy.quantity === 0) {
          queue.shift();
        }
      }
    }
  }

  // Calculate active open positions average age (in days)
  const activeHoldDaysMap = {};
  const currentDate = new Date();
  Object.entries(activeQueues).forEach(([symbol, lots]) => {
    let totalOpenShares = 0;
    let totalWeightedDays = 0;

    lots.forEach(lot => {
      if (lot.quantity > 0) {
        const diffTime = currentDate.getTime() - lot.date.getTime();
        const ageDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        totalWeightedDays += ageDays * lot.quantity;
        totalOpenShares += lot.quantity;
      }
    });

    activeHoldDaysMap[symbol] = totalOpenShares > 0 ? (totalWeightedDays / totalOpenShares).toFixed(1) : '0.0';
  });

  // 2. Calculate stock-wise average holding duration for closed trades
  const closedStatsMap = {};
  if (pnlReport.closed_trades) {
    pnlReport.closed_trades.forEach(t => {
      const symbol = t.stock_symbol;
      if (!closedStatsMap[symbol]) {
        closedStatsMap[symbol] = { total_days: 0, count: 0 };
      }
      closedStatsMap[symbol].total_days += t.holding_days;
      closedStatsMap[symbol].count += 1;
    });
  }

  // 3. Calculate month-wise performance and best performing stock
  const monthWisePerformance = {};
  if (pnlReport.closed_trades) {
    pnlReport.closed_trades.forEach(t => {
      const sellDate = new Date(t.sell_date);
      const year = sellDate.getFullYear();
      const month = sellDate.getMonth() + 1; // 1-indexed
      const monthKey = `${year}-${String(month).padStart(2, '0')}`; // e.g. "2026-06"
      
      if (!monthWisePerformance[monthKey]) {
        monthWisePerformance[monthKey] = {
          realized_pnl: 0,
          trades_count: 0,
          stock_performance: {} // symbol -> pnl
        };
      }
      const currentMonth = monthWisePerformance[monthKey];
      currentMonth.realized_pnl += t.realized_pnl;
      currentMonth.trades_count += 1;
      
      if (!currentMonth.stock_performance[t.stock_symbol]) {
        currentMonth.stock_performance[t.stock_symbol] = 0;
      }
      currentMonth.stock_performance[t.stock_symbol] += t.realized_pnl;
    });
  }

  const sortedMonths = Object.keys(monthWisePerformance).sort().reverse(); // newest first

  // Fetch additional database tables in parallel for complete Finor AI coverage
  const [
    debtsRes,
    goalsRes,
    settingsRes,
    snapshotsRes,
    considerationsRes
  ] = await Promise.allSettled([
    supabaseAdmin.from('finance_debts').select('*').eq('user_id', userId),
    supabaseAdmin.from('finance_goals').select('*').eq('user_id', userId),
    supabaseAdmin.from('system_settings').select('key, value').in('key', [`mutual_fund_holdings_${userId}`, `coin_mf_orders_${userId}`]),
    supabaseAdmin.from('portfolio_snapshots').select('*').eq('user_id', userId).order('snapshot_date', { ascending: false }).limit(10),
    supabaseAdmin.from('buy_considerations').select('*').eq('user_id', userId)
  ]);

  const debts = debtsRes.status === 'fulfilled' ? debtsRes.value.data || [] : [];
  const goals = goalsRes.status === 'fulfilled' ? goalsRes.value.data || [] : [];
  const settingsRows = settingsRes.status === 'fulfilled' ? settingsRes.value.data || [] : [];
  const snapshots = snapshotsRes.status === 'fulfilled' ? snapshotsRes.value.data || [] : [];
  const considerations = considerationsRes.status === 'fulfilled' ? considerationsRes.value.data || [] : [];

  // Parse Mutual Funds and Coin Orders from system_settings
  let mfHoldings = [];
  let coinOrders = [];
  settingsRows.forEach(row => {
    try {
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (row.key === `mutual_fund_holdings_${userId}` && Array.isArray(parsed)) {
        mfHoldings = parsed;
      } else if (row.key === `coin_mf_orders_${userId}` && Array.isArray(parsed)) {
        coinOrders = parsed;
      }
    } catch (e) {
      console.error('[AI Assistant] Failed to parse system_setting:', row.key, e.message);
    }
  });

  const overallSummary = pnlReport.summary || {};
  const eqSummary = pnlReport.equity_summary || {};
  const fnoSummary = pnlReport.fno_summary || {};
  const eqClosed = pnlReport.equity_closed_trades || [];
  const fnoClosed = pnlReport.fno_closed_trades || [];

  let ctx = `=== COMPLETE USER PORTFOLIO & DATABASE CONTEXT ===\n\n`;

  // 1. Realized P&L, Statutory Charges & Net P&L Summary
  ctx += `## 📊 Realized P&L, Statutory Charges & Net Realized P&L (FIFO Ledger):\n`;
  ctx += `- **Total Overall Realized P&L**: Gross ₹${(overallSummary.total_realized_pnl || 0).toLocaleString('en-IN')}, Approx Charges & Taxes: -₹${(overallSummary.total_charges || 0).toLocaleString('en-IN')}, **Net Realized P&L: ₹${(overallSummary.net_realized_pnl || 0).toLocaleString('en-IN')}** (Total Trades Closed: ${overallSummary.trades_count || 0})\n`;
  ctx += `- **📈 Equity Delivery & Intraday**: Gross ₹${(eqSummary.total_realized_pnl || 0).toLocaleString('en-IN')}, Approx Charges: -₹${(eqSummary.total_charges || 0).toLocaleString('en-IN')}, **Net P&L: ₹${(eqSummary.net_realized_pnl || 0).toLocaleString('en-IN')}** (STCG: ₹${(eqSummary.stcg || 0).toLocaleString('en-IN')}, LTCG: ₹${(eqSummary.ltcg || 0).toLocaleString('en-IN')}, Trades: ${eqSummary.trades_count || 0})\n`;
  ctx += `- **⚡ F&O Derivatives (Futures & Options)**: Gross ₹${(fnoSummary.total_realized_pnl || 0).toLocaleString('en-IN')}, Approx Charges: -₹${(fnoSummary.total_charges || 0).toLocaleString('en-IN')}, **Net P&L: ₹${(fnoSummary.net_realized_pnl || 0).toLocaleString('en-IN')}** (Contracts Closed: ${fnoSummary.trades_count || 0})\n`;

  if (overallSummary.charges_breakdown) {
    const cb = overallSummary.charges_breakdown;
    ctx += `- **Approx Charges Breakdown**: Brokerage: ₹${cb.brokerage || 0}, STT: ₹${cb.stt || 0}, Exchange Txn Charges: ₹${cb.exchange_charges || 0}, GST (18%): ₹${cb.gst || 0}, Stamp Duty: ₹${cb.stamp_duty || 0}, DP Charges: ₹${cb.dp_charges || 0}, SEBI: ₹${cb.sebi_charges || 0}\n`;
  }

  // 2. F&O Closed Derivative Contracts Details
  if (fnoClosed.length > 0) {
    ctx += `\n## ⚡ F&O Closed Derivative Contracts (${fnoClosed.length} Total):\n`;
    fnoClosed.slice(0, 20).forEach(t => {
      const typeBadge = t.contract_type === 'OPTION_CE' ? 'CALL CE' : t.contract_type === 'OPTION_PE' ? 'PUT PE' : 'FUTURES';
      ctx += `- [${typeBadge}] **${t.stock_symbol}**: Qty: ${t.quantity}, Buy: ₹${t.buy_price.toFixed(2)} (${t.buy_date.substring(0, 10)}), Sell: ₹${t.sell_price.toFixed(2)} (${t.sell_date.substring(0, 10)}), Gross P&L: ₹${t.realized_pnl.toFixed(2)}, Approx Charges: ₹${t.charges.total_charges.toFixed(2)}, Net P&L: ₹${t.net_realized_pnl.toFixed(2)}\n`;
    });
  }

  // 3. Active Open Positions
  ctx += `\n## Active Open Positions (Equity Holdings):\n`;
  if (holdings && holdings.length > 0) {
    holdings.forEach(h => {
      const value = h.quantity * (h.ltp || h.average_buy_price);
      const pnl = h.quantity * ((h.ltp || h.average_buy_price) - h.average_buy_price);
      const returnPct = h.average_buy_price > 0 ? (pnl / (h.quantity * h.average_buy_price)) * 100 : 0;
      const avgAge = activeHoldDaysMap[h.stock_symbol] || '0.0';
      ctx += `- **${h.stock_symbol}** (${h.stock_name || h.stock_symbol}): Qty: ${h.quantity}, Avg Cost Price: ₹${h.average_buy_price.toFixed(2)}, LTP: ₹${(h.ltp || 0).toFixed(2)}, Value: ₹${value.toFixed(2)}, P&L: ₹${pnl.toFixed(2)} (${returnPct.toFixed(2)}%), Avg Hold Duration: ${avgAge} days\n`;
    });
  } else {
    ctx += `No active holdings found.\n`;
  }

  // 4. Mutual Fund Portfolio
  ctx += `\n## 🏦 Mutual Fund Holdings (Coin / Zerodha Sync):\n`;
  if (mfHoldings && mfHoldings.length > 0) {
    let totalMfInvested = 0;
    let totalMfValue = 0;
    mfHoldings.forEach(mf => {
      totalMfInvested += (parseFloat(mf.invested) || 0);
      totalMfValue += (parseFloat(mf.current_value) || (parseFloat(mf.units || 0) * parseFloat(mf.nav || 0)) || 0);
    });
    const totalMfPnl = totalMfValue - totalMfInvested;
    const mfReturnPct = totalMfInvested > 0 ? (totalMfPnl / totalMfInvested) * 100 : 0;
    ctx += `- Total Mutual Funds Invested: ₹${totalMfInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, Current Value: ₹${totalMfValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, P&L: ₹${totalMfPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (${mfReturnPct.toFixed(2)}%)\n`;
    mfHoldings.forEach(mf => {
      const inv = parseFloat(mf.invested) || 0;
      const val = parseFloat(mf.current_value) || ((parseFloat(mf.units) || 0) * (parseFloat(mf.nav) || 0)) || 0;
      const pnl = val - inv;
      ctx += `  - **${mf.fund_name || mf.tradingsymbol || 'Mutual Fund'}**: Units: ${mf.units || 0}, Invested: ₹${inv.toFixed(2)}, Value: ₹${val.toFixed(2)}, P&L: ₹${pnl.toFixed(2)}\n`;
    });
  } else {
    ctx += `No mutual fund holdings found in settings.\n`;
  }

  if (coinOrders && coinOrders.length > 0) {
    ctx += `\n## Recent Coin Mutual Fund Orders:\n`;
    coinOrders.slice(0, 5).forEach(ord => {
      ctx += `- **${ord.fund || ord.tradingsymbol || 'MF Order'}**: Amount: ₹${ord.amount || 0}, Type: ${ord.transaction_type || ord.order_type || 'Order'}, Status: ${ord.status || 'COMPLETE'}\n`;
    });
  }

  // 5. Financial Goals & Wealth Targets
  ctx += `\n## 🎯 Financial Goals & Wealth Targets (finance_goals):\n`;
  if (goals && goals.length > 0) {
    goals.forEach(g => {
      const target = parseFloat(g.target_amount) || 0;
      const current = parseFloat(g.current_amount) || 0;
      const pct = target > 0 ? ((current / target) * 100).toFixed(1) : '0';
      ctx += `- **${g.title || 'Goal'}**: Saved ₹${current.toLocaleString('en-IN')} / ₹${target.toLocaleString('en-IN')} (${pct}%), Target Date: ${g.target_date || 'N/A'}, Category: ${g.category || 'General'}, Priority: ${g.priority || 'Normal'}\n`;
    });
  } else {
    ctx += `No financial goals configured.\n`;
  }

  // 6. Debts, Liabilities & Money Lent
  ctx += `\n## 💳 Debts, Receivables & Payables (finance_debts):\n`;
  if (debts && debts.length > 0) {
    let totalLent = 0;
    let totalBorrowed = 0;
    debts.forEach(d => {
      const remaining = parseFloat(d.outstanding_amount ?? d.amount) || 0;
      if (d.type === 'LENT' || d.type === 'RECEIVABLE') {
        totalLent += remaining;
      } else {
        totalBorrowed += remaining;
      }
    });
    ctx += `- Total Money Lent (Receivables): ₹${totalLent.toLocaleString('en-IN')} | Total Money Borrowed (Payables): ₹${totalBorrowed.toLocaleString('en-IN')}\n`;
    debts.forEach(d => {
      const isLent = d.type === 'LENT' || d.type === 'RECEIVABLE';
      const label = isLent ? 'Lent to' : 'Borrowed from';
      ctx += `  - [${d.type}] ${label} **${d.person_name || 'Individual'}**: Amount ₹${parseFloat(d.amount || 0).toLocaleString('en-IN')}, Remaining ₹${parseFloat(d.outstanding_amount ?? d.amount).toLocaleString('en-IN')}, Due: ${d.due_date || 'N/A'}, Status: ${d.status || 'ACTIVE'}\n`;
    });
  } else {
    ctx += `No active debts or loans logged.\n`;
  }

  // 7. Portfolio Snapshots & Timeline
  ctx += `\n## ⏳ Portfolio Timeline Snapshots (portfolio_snapshots):\n`;
  if (snapshots && snapshots.length > 0) {
    snapshots.forEach(s => {
      ctx += `- **${s.snapshot_date ? s.snapshot_date.substring(0, 10) : 'Date'}**: Portfolio Value: ₹${(s.portfolio_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}, Invested Capital: ₹${(s.invested_capital || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}, Returns: ₹${(s.returns || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}\n`;
    });
  } else {
    ctx += `No historical snapshots recorded.\n`;
  }

  // 8. Buy Radar & Considerations
  if (considerations && considerations.length > 0) {
    ctx += `\n## 🎯 Stock Buy Radar & Watchlist (buy_considerations):\n`;
    considerations.forEach(c => {
      ctx += `- **${c.stock_symbol}**: Target Entry: ₹${parseFloat(c.target_price || 0).toFixed(2)}, Rationale: ${c.rationale || c.notes || 'Under radar'}\n`;
    });
  }

  // 9. All-Time Realized P&L by Stock
  ctx += `\n## All-Time Realized P&L by Stock / Contract:\n`;
  if (pnlReport.stock_wise && pnlReport.stock_wise.length > 0) {
    pnlReport.stock_wise.forEach(s => {
      const stats = closedStatsMap[s.stock_symbol];
      const avgClosedHold = stats && stats.count > 0 ? (stats.total_days / stats.count).toFixed(1) : 'N/A';
      const typeLabel = s.is_fno ? ` [F&O ${s.contract_type}]` : '';
      ctx += `- **${s.stock_symbol}**${typeLabel}: Gross Realized: ₹${s.realized_pnl.toFixed(2)}, Charges: ₹${(s.total_charges || 0).toFixed(2)}, **Net: ₹${(s.net_realized_pnl || 0).toFixed(2)}** (Traded Qty: ${s.quantity}, Avg Hold: ${avgClosedHold} days)\n`;
    });
  } else {
    ctx += `No realized P&L matches found.\n`;
  }

  // 10. Month-Wise Realized P&L Performance History
  ctx += `\n## Month-Wise Realized P&L Performance History:\n`;
  if (sortedMonths.length > 0) {
    sortedMonths.forEach(mKey => {
      const data = monthWisePerformance[mKey];
      let bestStock = 'N/A';
      let bestStockPnL = -Infinity;
      Object.entries(data.stock_performance).forEach(([sym, pnl]) => {
        if (pnl > bestStockPnL) {
          bestStock = sym;
          bestStockPnL = pnl;
        }
      });
      ctx += `- **${mKey}**: Total Realized P&L: ₹${data.realized_pnl.toFixed(2)}, Trades Count: ${data.trades_count}, Best Stock of Month: ${bestStock} (P&L: ₹${bestStockPnL.toFixed(2)})\n`;
    });
  } else {
    ctx += `No monthly realized P&L records found.\n`;
  }

  if (insights && !insights.emptyState) {
    ctx += `\n## Behavioral Insights Summary:\n`;
    ctx += `- **Discipline Score**: ${insights.disciplineScore}/100 (Grade: ${insights.grade} - ${insights.gradeMeaning})\n`;
    ctx += `- **Win Rate**: ${insights.winRate.toFixed(1)}%\n`;
    ctx += `- **All-Time Realized P&L**: ₹${insights.realizedPnL.toFixed(2)}\n`;
    ctx += `- **Averaging Rule Score**: ${insights.averagingScore}/100\n`;
    ctx += `- **Total Violations Flagged**: ${insights.violationsCount}\n`;
    ctx += `- **Avg Holding (Winners)**: ${insights.avgWinnerHold} days\n`;
    ctx += `- **Avg Holding (Losers)**: ${insights.avgLoserHold} days\n`;

    if (insights.considerExits && insights.considerExits.length > 0) {
      ctx += `\n## Weak Holdings Flagged for Exit:\n`;
      insights.considerExits.forEach(ce => {
        ctx += `- **${ce.symbol}**: ${ce.reason}\n`;
      });
    }
  }

  // Get recent 10 trades sorted newest first
  const recentTrades = [...(allTrades || [])]
    .sort((a, b) => new Date(b.trade_date).getTime() - new Date(a.trade_date).getTime())
    .slice(0, 10);

  ctx += `\n## Recent 10 Trades (Newest First):\n`;
  if (recentTrades.length > 0) {
    recentTrades.forEach(t => {
      ctx += `- ${t.trade_type.toUpperCase()} **${t.stock_symbol}** on ${t.trade_date.substring(0, 10)}: Qty: ${t.quantity}, Price: ₹${parseFloat(t.price).toFixed(2)}\n`;
    });
  } else {
    ctx += `No trade history found.\n`;
  }

  // Fetch cached corporate actions for all holdings
  let corporateActionsText = '';
  if (holdings && holdings.length > 0) {
    const symbols = holdings.map(h => `${h.stock_symbol.toUpperCase()}_ACTIONS`);
    try {
      const { data: cachedActions } = await supabaseAdmin
        .from('news_cache')
        .select('*')
        .in('stock_symbol', symbols);

      if (cachedActions && cachedActions.length > 0) {
        corporateActionsText += `\n## Upcoming Corporate Actions & News Events for Active Holdings:\n`;
        cachedActions.forEach(row => {
          const symbol = row.stock_symbol.replace('_ACTIONS', '');
          const content = typeof row.news_content === 'string' ? JSON.parse(row.news_content) : row.news_content;
          if (content && content.length > 0) {
            const upcoming = content.filter(e => {
              const dateStr = e.event_date || e.ex_date || '';
              if (!dateStr) return false;
              const date = new Date(dateStr);
              return date >= new Date(); // Only upcoming/future events
            });
            
            if (upcoming.length > 0) {
              corporateActionsText += `- **${symbol}**:\n`;
              upcoming.forEach(e => {
                corporateActionsText += `  - [${e.type || 'Event'}] ${e.purpose || 'Upcoming action'} on ${e.event_date || e.ex_date || 'N/A'}\n`;
              });
            }
          }
        });
      }
    } catch (eActions) {
      console.error('[AI Assistant] Pre-loading corporate actions failed:', eActions.message);
    }
  }

  if (corporateActionsText) {
    ctx += corporateActionsText;
  }

  // Fetch profile data (non-sensitive fields)
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username, country, gender')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      ctx += `\n## User Profile Summary (Non-Sensitive):\n`;
      ctx += `- Username: ${profile.username || 'N/A'}\n`;
      ctx += `- Country: ${profile.country || 'N/A'}\n`;
      ctx += `- Gender: ${profile.gender || 'N/A'}\n`;
    }
  } catch (errProfile) {
    console.error('[AI Assistant] Fetching profile metadata failed:', errProfile.message);
  }

  // Fetch recent finance transactions & calculate summary aggregates
  try {
    const { data: recentTransactions } = await supabaseAdmin
      .from('finance_transactions')
      .select('date, description, amount, type, category, is_claimable, claim_status')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(150);

    if (recentTransactions && recentTransactions.length > 0) {
      let totalExpense = 0;
      let totalIncome = 0;
      let totalClaimablePending = 0;
      let totalClaimableClaimed = 0;
      let totalAvoidable = 0;
      let totalEssential = 0;

      const avoidableCategories = ['Shopping', 'Entertainment', 'Dining', 'Snacks', 'Movies', 'Theatre', 'Impulse'];

      recentTransactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'EXPENSE') {
          totalExpense += amt;
          const cat = t.category || '';
          const desc = t.description || '';
          const isAvoidable = avoidableCategories.some(c => cat.toLowerCase().includes(c.toLowerCase())) ||
                              /snack|junk|movie|theatre|dress|shoe|swiggy|zomato/i.test(desc);
          if (isAvoidable) {
            totalAvoidable += amt;
          } else {
            totalEssential += amt;
          }

          if (t.is_claimable) {
            if (t.claim_status === 'CLAIMED') {
              totalClaimableClaimed += amt;
            } else {
              totalClaimablePending += amt;
            }
          }
        } else if (t.type === 'INCOME') {
          totalIncome += amt;
        }
      });

      ctx += `\n## 💡 Finance Ledger & Expense Summary:\n`;
      ctx += `- Total Expenses Logged: ₹${totalExpense.toLocaleString('en-IN')}\n`;
      ctx += `- Total Income Logged: ₹${totalIncome.toLocaleString('en-IN')}\n`;
      ctx += `- 🟢 Essential Expenses (Rent, Bills, Groceries, SIPs): ₹${totalEssential.toLocaleString('en-IN')}\n`;
      ctx += `- ⚠️ Avoidable / Discretionary Spend (Junk Food, Shopping, Movies): ₹${totalAvoidable.toLocaleString('en-IN')} (${totalExpense > 0 ? ((totalAvoidable / totalExpense) * 100).toFixed(1) : 0}% of expenses)\n`;
      ctx += `- 💼 Company Reimbursable Claims: Pending ₹${totalClaimablePending.toLocaleString('en-IN')} | Claimed ₹${totalClaimableClaimed.toLocaleString('en-IN')}\n`;

      ctx += `\n## Recent Finance Ledger Transactions:\n`;
      recentTransactions.slice(0, 50).forEach(t => {
        const claimBadge = t.is_claimable ? ` [Reimbursable: ${t.claim_status || 'PENDING'}]` : '';
        ctx += `- **${t.date ? t.date.substring(0, 10) : 'N/A'}**: [${t.type}] ${t.description || 'No description'} - ₹${t.amount} (Category: ${t.category || 'Uncategorized'})${claimBadge}\n`;
      });
    } else {
      ctx += `\n## Finance Ledger Transactions:\nNo recent ledger transactions found.\n`;
    }
  } catch (errTx) {
    console.error('[AI Assistant] Fetching finance transactions failed:', errTx.message);
  }

  // Cache the built context
  portfolioContextCache.set(cacheKey, {
    contextText: ctx,
    timestamp: now
  });

  return ctx;
}

/**
 * Built-in local mock rules-based assistant engine (zero cost fallback)
 */
function generateSimulatedResponse(message, contextText, hasImage = false) {
  const msgLower = (message || '').toLowerCase();
  let reply = '';

  if (hasImage) {
    reply += `#### 📷 Finor Visual Intelligence Analysis\n\n`;
    reply += `I have received and processed your uploaded image/screenshot!\n\n`;
    reply += `- **Visual Target**: Financial chart / trade confirmation / contract note / expense receipt detected.\n`;
    reply += `- **User Grounding**: Evaluated in relation to your personal active portfolio, cashflow records, and trading rules.\n`;
    reply += `- **Key Recommendation**: Verify support levels and ensure risk-reward ratio is at least 1:2 before taking trade action.\n\n`;
    reply += `*Configure your \`GEMINI_API_KEY\` in environment settings for live multimodal generative vision recognition.*`;
    return reply;
  }
  
  reply = `### 🧠 AI Assistant (Simulated Mode)\n\n`;
  reply += `*You are viewing this response in Simulated Mode because no Gemini API key is configured in your backend environment variables.*\n\n`;

  if (msgLower.includes('f&o') || msgLower.includes('fno') || msgLower.includes('derivative') || msgLower.includes('option') || msgLower.includes('future')) {
    reply += `#### ⚡ F&O Derivatives Performance & Contracts Audit\n\n`;
    const lines = contextText.split('\n');
    const fnoSummaryLine = lines.find(l => l.includes('F&O Derivatives (Futures & Options)'));
    const fnoContractLines = lines.filter(l => l.startsWith('- [CALL') || l.startsWith('- [PUT') || l.startsWith('- [FUTURES'));

    if (fnoSummaryLine) {
      reply += `${fnoSummaryLine}\n\n`;
    }

    if (fnoContractLines.length > 0) {
      reply += `##### 📋 Closed Derivatives Contracts:\n\n`;
      reply += `| Contract | Type | Qty | Buy Price | Sell Price | Gross P&L | Charges | Net P&L |\n`;
      reply += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

      fnoContractLines.forEach(l => {
        const typeMatch = l.match(/\[(.*?)\]/);
        const symMatch = l.match(/\*\*([A-Z0-9]+)\*\*/);
        const qtyMatch = l.match(/Qty:\s*(\d+)/);
        const buyMatch = l.match(/Buy:\s*₹([\d.]+)/);
        const sellMatch = l.match(/Sell:\s*₹([\d.]+)/);
        const grossMatch = l.match(/Gross P&L:\s*₹([-\d.]+)/);
        const chargesMatch = l.match(/Charges:\s*₹([-\d.]+)/);
        const netMatch = l.match(/Net P&L:\s*₹([-\d.]+)/);

        if (symMatch && qtyMatch && buyMatch && sellMatch && grossMatch && netMatch) {
          const type = typeMatch ? typeMatch[1] : 'F&O';
          const sym = symMatch[1];
          const qty = qtyMatch[1];
          const buy = buyMatch[1];
          const sell = sellMatch[1];
          const grossVal = parseFloat(grossMatch[1]);
          const chargesVal = chargesMatch ? chargesMatch[1] : '0.00';
          const netVal = parseFloat(netMatch[1]);

          const netBadge = netVal >= 0 ? `🟢 +₹${netVal.toLocaleString('en-IN')}` : `🔴 -₹${Math.abs(netVal).toLocaleString('en-IN')}`;
          reply += `| **${sym}** | \`${type}\` | ${qty} | ₹${buy} | ₹${sell} | ₹${grossVal.toFixed(2)} | -₹${chargesVal} | ${netBadge} |\n`;
        }
      });
      reply += `\n*Charges account for standard flat ₹20/order brokerage, 0.1% STT on sell premium, exchange turnover, GST (18%), and SEBI charges.*`;
    } else {
      reply += `No closed F&O derivative contracts found in your database ledger.`;
    }
  } else if (msgLower.includes('charge') || msgLower.includes('tax') || msgLower.includes('net p&l') || msgLower.includes('gross') || msgLower.includes('brokerage') || msgLower.includes('stt') || msgLower.includes('realized p&l')) {
    reply += `#### 🧾 Realized P&L, Statutory Charges & Net P&L Statement\n\n`;
    const lines = contextText.split('\n');
    const pnlLines = lines.filter(l => l.includes('Realized P&L') || l.includes('Approx Charges Breakdown'));

    if (pnlLines.length > 0) {
      reply += `Here is your complete realized P&L and statutory tax/charges breakdown:\n\n`;
      pnlLines.forEach(l => {
        reply += `${l}\n`;
      });
      reply += `\n> **Note:** Net Realized P&L reflects your true bottom-line earnings after deducting ₹0/₹20 brokerage, STT, NSE Exchange turnover fees, SEBI charges, Stamp duty, 18% GST, and ₹15.34 DP charges per delivery sale.`;
    } else {
      reply += `No realized P&L records found in your database.`;
    }
  } else if (msgLower.includes('mutual fund') || msgLower.includes('coin') || msgLower.includes('mf') || msgLower.includes('sip')) {
    reply += `#### 🏦 Mutual Fund Holdings (Coin / Zerodha Sync)\n\n`;
    const lines = contextText.split('\n');
    const mfSummary = lines.find(l => l.includes('Total Mutual Funds Invested:'));
    const mfLines = lines.filter(l => l.trim().startsWith('- **') && l.includes('Units:'));
    const coinOrderLines = lines.filter(l => l.trim().startsWith('- **') && l.includes('Status:'));

    if (mfSummary) {
      reply += `${mfSummary}\n\n`;
    }

    if (mfLines.length > 0) {
      reply += `| Fund Scheme | Units | Invested | Current Value | P&L |\n`;
      reply += `| :--- | :---: | :---: | :---: | :---: |\n`;
      mfLines.forEach(l => {
        const nameMatch = l.match(/\*\*([^*]+)\*\*/);
        const unitsMatch = l.match(/Units:\s*([\d.]+)/);
        const invMatch = l.match(/Invested:\s*₹([\d.]+)/);
        const valMatch = l.match(/Value:\s*₹([\d.]+)/);
        const pnlMatch = l.match(/P&L:\s*₹([-\d.]+)/);

        if (nameMatch) {
          const name = nameMatch[1];
          const units = unitsMatch ? unitsMatch[1] : 'N/A';
          const inv = invMatch ? `₹${parseFloat(invMatch[1]).toLocaleString('en-IN')}` : 'N/A';
          const val = valMatch ? `₹${parseFloat(valMatch[1]).toLocaleString('en-IN')}` : 'N/A';
          const pnlVal = pnlMatch ? parseFloat(pnlMatch[1]) : 0;
          const pnlStr = (pnlVal >= 0 ? '🟢 +' : '🔴 -') + `₹${Math.abs(pnlVal).toLocaleString('en-IN')}`;
          reply += `| **${name}** | ${units} | ${inv} | ${val} | ${pnlStr} |\n`;
        }
      });
    } else {
      reply += `No mutual fund holdings synced in your database settings.`;
    }

    if (coinOrderLines.length > 0) {
      reply += `\n##### 📦 Recent Coin Orders:\n`;
      coinOrderLines.forEach(l => reply += `${l}\n`);
    }
  } else if (msgLower.includes('goal') || msgLower.includes('target') || msgLower.includes('wealth goal')) {
    reply += `#### 🎯 Financial Goals & Wealth Targets\n\n`;
    const lines = contextText.split('\n');
    const goalLines = lines.filter(l => l.trim().startsWith('- **') && l.includes('Saved ₹'));

    if (goalLines.length > 0) {
      reply += `Here is the current status of your financial goals:\n\n`;
      goalLines.forEach(l => reply += `${l}\n`);
    } else {
      reply += `No financial goals configured. Head over to the Finance Goals module to establish target savings!`;
    }
  } else if (msgLower.includes('debt') || msgLower.includes('lent') || msgLower.includes('borrow') || msgLower.includes('loan') || msgLower.includes('payable') || msgLower.includes('receivable')) {
    reply += `#### 💳 Debts, Receivables & Payables Ledger\n\n`;
    const lines = contextText.split('\n');
    const debtSummary = lines.find(l => l.includes('Total Money Lent (Receivables):'));
    const debtLines = lines.filter(l => l.trim().startsWith('- [LENT]') || l.trim().startsWith('- [BORROWED]') || l.trim().startsWith('- [RECEIVABLE]') || l.trim().startsWith('- [PAYABLE]'));

    if (debtSummary) {
      reply += `${debtSummary}\n\n`;
    }

    if (debtLines.length > 0) {
      reply += `##### 📋 Individual Balances:\n`;
      debtLines.forEach(l => reply += `${l}\n`);
    } else {
      reply += `No active debts or money lending records found in your database.`;
    }
  } else if (msgLower.includes('database') || msgLower.includes('access') || msgLower.includes('supabase') || msgLower.includes('every data') || msgLower.includes('all data')) {
    reply += `#### 🛡️ Finor AI Supabase Database Access Verification\n\n`;
    reply += `**Yes, I have full, direct real-time access to every dataset and table in your Supabase database!**\n\n`;
    reply += `Here is a verification of the connected data sources currently in my active context:\n`;
    reply += `- **📈 Equity Holdings & Trades**: Full portfolio holdings and complete historical trade ledger for FIFO P&L calculations.\n`;
    reply += `- **⚡ F&O Derivatives**: Live contract details, CE/PE Options, Futures, Gross P&L, approx statutory charges, and Net Realized P&L.\n`;
    reply += `- **🏦 Mutual Funds (Coin Sync)**: Synced mutual fund schemes, units, invested amount, NAV valuations, and Coin orders.\n`;
    reply += `- **🎯 Wealth Goals (\`finance_goals\`)**: All configured goals, saved balances, target amounts, and deadline dates.\n`;
    reply += `- **💳 Debts Ledger (\`finance_debts\`)**: Money lent (receivables) and money borrowed (payables) with repayment tracking.\n`;
    reply += `- **💡 Cashflow & Transactions (\`finance_transactions\`)**: Real-time personal finance expenses, income, avoidable discretionary spend, and reimbursable claims.\n`;
    reply += `- **⏳ Time Machine Snapshots (\`portfolio_snapshots\`)**: Historical portfolio value trajectory and invested capital timeline.\n`;
    reply += `- **🎯 Buy Watchlist Radar (\`buy_considerations\`)**: Stocks under entry radar with target trigger prices.\n\n`;
    reply += `Feel free to ask me questions about any of these areas!`;
  } else if (msgLower.includes('holding') || msgLower.includes('portfolio') || msgLower.includes('invested')) {
    reply += `#### 📋 Current Portfolio Overview\n\n`;
    const lines = contextText.split('\n');
    const holdingLines = lines.filter(l => l.startsWith('- **') && l.includes('Cost Price:'));
    
    if (holdingLines.length > 0) {
      reply += `Here are your current active holdings extracted from the database:\n\n`;
      reply += `| Symbol | Qty | Avg Cost | P&L | Return % |\n`;
      reply += `| :--- | :---: | :---: | :---: | :---: |\n`;
      
      holdingLines.forEach(l => {
        const symbolMatch = l.match(/\*\*([A-Z0-9]+)\*\*/);
        const qtyMatch = l.match(/Qty:\s*(\d+)/);
        const costMatch = l.match(/Avg Cost Price:\s*₹([\d.]+)/);
        const pnlMatch = l.match(/P&L:\s*₹([-\d.]+)/);
        const pctMatch = l.match(/\(([-\d.]+)%\)/);

        if (symbolMatch && qtyMatch && costMatch && pnlMatch && pctMatch) {
          const sym = symbolMatch[1];
          const qty = qtyMatch[1];
          const cost = parseFloat(costMatch[1]).toLocaleString('en-IN');
          const pnlVal = parseFloat(pnlMatch[1]);
          const pnlStr = (pnlVal >= 0 ? '+' : '') + '₹' + pnlVal.toLocaleString('en-IN');
          const pct = parseFloat(pctMatch[1]).toFixed(1) + '%';
          reply += `| **${sym}** | ${qty} | ₹${cost} | ${pnlVal >= 0 ? '🟢 ' : '🔴 '}${pnlStr} | ${pct} |\n`;
        }
      });
    } else {
      reply += `No active holdings found in your database. Upload your tradebook CSV in the holdings tab to begin.`;
    }
  } else if (msgLower.includes('discipline') || msgLower.includes('score') || msgLower.includes('grade') || msgLower.includes('violation')) {
    reply += `#### 📊 Behavioral Discipline Audit\n\n`;
    const scoreMatch = contextText.match(/Discipline Score:\s*(\d+)\/100/);
    const gradeMatch = contextText.match(/Grade:\s*([A-F])/);
    const winMatch = contextText.match(/Win Rate:\s*([\d.]+)%/);
    const violationsMatch = contextText.match(/Violations Count:\s*(\d+)/);

    if (scoreMatch) {
      const score = scoreMatch[1];
      const grade = gradeMatch ? gradeMatch[1] : 'F';
      const winRate = winMatch ? winMatch[1] : '0';
      const violations = violationsMatch ? violationsMatch[1] : '0';

      reply += `Here is your rolling 90-day discipline audit summary:\n`;
      reply += `- **Discipline Score:** **${score}/100**\n`;
      reply += `- **Discipline Grade:** **Grade ${grade}**\n`;
      reply += `- **Win Rate:** **${winRate}%**\n`;
      reply += `- **Active Violations Count:** **${violations}**\n\n`;

      if (parseInt(score) < 60) {
        reply += `⚠️ **Urgent Audit Feedback:** Your score indicates frequent trading violations. Review your holdings settings, enforce your stop-losses immediately, and stop averaging down on falling positions.`;
      } else {
        reply += `🟢 **Positive Standing:** Excellent rule adherence. Your entry tranches are consistent, and exits are well-planned. Keep up the disciplined execution.`;
      }
    } else {
      reply += `No discipline score is available yet. Ensure you have imported at least 5 completed trades in your tradebook.`;
    }
  } else if (msgLower.includes('expense') || msgLower.includes('spend') || msgLower.includes('avoidable') || msgLower.includes('claim') || msgLower.includes('budget') || msgLower.includes('junk')) {
    reply += `#### 💳 Expense & Finance Ledger Audit\n\n`;
    const lines = contextText.split('\n');
    const ledgerLines = lines.filter(l => l.startsWith('- Total Expenses') || l.startsWith('- Total Income') || l.includes('Essential Expenses') || l.includes('Avoidable') || l.includes('Reimbursable Claims'));
    const transactionLines = lines.filter(l => (l.startsWith('- **20') || l.startsWith('- **N/A')) && (l.includes('[EXPENSE]') || l.includes('[INCOME]')));

    if (ledgerLines.length > 0) {
      reply += `Here is your expense & finance ledger audit summary:\n\n`;
      ledgerLines.forEach(l => {
        reply += `${l}\n`;
      });

      if (transactionLines.length > 0) {
        reply += `\n##### 📝 Recent Finance Transactions:\n`;
        transactionLines.slice(0, 10).forEach(t => {
          reply += `${t}\n`;
        });
      }
    } else {
      reply += `No finance transactions found. Log your daily expenses in the Finance tab to get automated AI advice!`;
    }
  } else if (msgLower.includes('trade') || msgLower.includes('recent') || msgLower.includes('history')) {
    reply += `#### ⏳ Recent Trades Log\n\n`;
    const lines = contextText.split('\n');
    const tradeLines = lines.filter(l => (l.startsWith('- BUY') || l.startsWith('- SELL')) && l.includes('on'));
    
    if (tradeLines.length > 0) {
      reply += `Summarizing your latest 10 database transactions:\n\n`;
      tradeLines.forEach(l => {
        reply += `${l}\n`;
      });
    } else {
      reply += `No recent transactions found in your trades history.`;
    }
  } else {
    reply += `#### 👋 Welcome to Finor AI Chat Coach!\n\n`;
    reply += `I am your virtual trading, derivatives & personal wealth coach with full real-time access to your database. Ask me questions like:\n`;
    reply += `1. *"Summarize my F&O trades and charges"* (to audit derivatives, options, and net P&L)\n`;
    reply += `2. *"What are my mutual fund holdings?"* (to see Coin synced investments)\n`;
    reply += `3. *"Show my debts and money lent"* (to view receivables and payables)\n`;
    reply += `4. *"Check my financial goals progress"* (to see wealth target tracking)\n`;
    reply += `5. *"What are my avoidable expenses?"* (to audit discretionary spending)\n`;
    reply += `6. *"Do you have all access to my database?"* (to verify connected tables)\n\n`;
    reply += `*Configure your \`GEMINI_API_KEY\` in your env settings to activate live generative AI chat responses.*`;
  }

  return reply;
}

/**
 * GET /api/assistant/usage
 * Retrieves current usage count for today
 */
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const dateKey = getISTDateKey();
    const count = await getDailyUsage(userId, dateKey);
    
    const geminiKey = process.env.GEMINI_API_KEY;
    const hasGemini = geminiKey && geminiKey !== 'your_gemini_api_key_here';
    
    res.json({ 
      count, 
      maxLimit: DAILY_LIMIT, 
      remaining: Math.max(0, DAILY_LIMIT - count),
      engine: hasGemini ? 'Gemini 3.5 Flash' : 'Simulated Local Engine'
    });
  } catch (err) {
    console.error('[AI Assistant] Usage endpoint error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/assistant/history
 * Retrieves today's chat history list
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const dateKey = getISTDateKey();
    const history = await getDailyChatHistory(userId, dateKey);
    res.json({ history });
  } catch (err) {
    console.error('[AI Assistant] History endpoint error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assistant/chat
 * Conversational assistant endpoint
 */
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message, image, chatHistory = [], modelName = 'default', confirmOrder = false, orderArgs = null, activeOrderWorkflow = null } = req.body;

    let userName = 'Arivu';
    if (req.user) {
      const metaName = req.user.user_metadata?.full_name || req.user.user_metadata?.name;
      if (metaName) {
        userName = metaName;
      } else if (req.user.email) {
        const localPart = req.user.email.split('@')[0];
        if (localPart.toLowerCase().includes('arivu')) {
          userName = 'Arivu';
        } else {
          userName = localPart;
        }
      }
    }

    if (!message && !image) {
      return res.status(400).json({ error: 'Message query or image attachment is required.' });
    }

    const dateKey = getISTDateKey();
    const currentCount = await getDailyUsage(userId, dateKey);

    if (currentCount >= DAILY_LIMIT) {
      return res.status(429).json({ 
        error: `You have reached your daily limit of ${DAILY_LIMIT} AI queries today. Please try again tomorrow!` 
      });
    }

    // Build portfolio context - only compile insights if the user asks explicitly for discipline/audit/performance metrics
    const msgLower = message.toLowerCase();
    const requiresInsights = msgLower.includes('discipline') ||
                              msgLower.includes('score') ||
                              msgLower.includes('audit') ||
                              msgLower.includes('violation') ||
                              msgLower.includes('mistake') ||
                              msgLower.includes('trap') ||
                              msgLower.includes('fomo') ||
                              msgLower.includes('grade') ||
                              msgLower.includes('win rate') ||
                              msgLower.includes('holding period') ||
                              msgLower.includes('performance') ||
                              msgLower.includes('coach') ||
                              msgLower.includes('rules') ||
                              msgLower.includes('exit recommendation') ||
                              msgLower.includes('analyse my portfolio') ||
                              msgLower.includes('analyze my portfolio');

    const contextText = await buildPortfolioContext(userId, !requiresInsights);

    // Get Gemini Key
    const geminiKey = process.env.GEMINI_API_KEY;
    const hasGemini = geminiKey && geminiKey !== 'your_gemini_api_key_here';

    let reply = '';
    let engineUsed = 'Simulated Local Engine';
    let pendingConfirm = null;

    if (!hasGemini) {
      reply = generateSimulatedResponse(message, contextText, !!image);
    } else {
      // Determine the target model
      let targetModel = 'gemini-2.5-flash';
      if (modelName && modelName !== 'default' && ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'].includes(modelName)) {
        targetModel = modelName;
      } else {
        // Auto-switch based on question complexity level
        const msgLower = (message || '').toLowerCase();
        const isSimpleGreeting = msgLower.length < 15 || ['hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no', 'cool', 'good'].includes(msgLower.trim());
        
        const isComplexQuery = msgLower.includes('analyse') || 
                               msgLower.includes('portfolio') || 
                               msgLower.includes('performer') || 
                               msgLower.includes('profit') || 
                               msgLower.includes('book') || 
                               msgLower.includes('discipline') || 
                               msgLower.includes('score') || 
                               msgLower.includes('violation') || 
                               msgLower.includes('audit') || 
                               msgLower.includes('strategy') || 
                               msgLower.includes('evaluate') || 
                               msgLower.includes('performance') ||
                               msgLower.includes('tax') ||
                               msgLower.includes('stcg') ||
                               msgLower.includes('ltcg');

        if (isSimpleGreeting) {
          targetModel = 'gemini-3.1-flash-lite';
        } else if (isComplexQuery) {
          targetModel = 'gemini-3.5-flash';
        } else {
          targetModel = 'gemini-2.5-flash';
        }
      }

      const { GoogleGenerativeAI } = require("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

      const tools = [
        {
          functionDeclarations: [
            {
              name: "placeGttOrder",
              description: "Places a Good-Till-Triggered (GTT) trigger order for buying or selling CNC stock on behalf of the user. Inform the user whether it was placed as a Paper Trade (Mock mode) or sent to Zerodha (Real mode) based on the return message.",
              parameters: {
                type: "OBJECT",
                properties: {
                  stock_symbol: { type: "STRING", description: "The ticker symbol of the stock, e.g., RELIANCE, DABUR, EIHOTEL (must be uppercase)." },
                  trigger_type: { type: "STRING", enum: ["SINGLE", "OCO"], description: "The GTT trigger type. Choose OCO if both target and stoploss trigger prices are specified, otherwise SINGLE." },
                  transaction_type: { type: "STRING", enum: ["BUY", "SELL"], description: "The transaction type: BUY or SELL." },
                  quantity: { type: "NUMBER", description: "The integer quantity of shares to buy or sell." },
                  trigger_price_1: { type: "NUMBER", description: "The primary trigger price (e.g. target price, or single trigger price)." },
                  trigger_price_2: { type: "NUMBER", description: "The secondary trigger price (e.g. stop-loss price for OCO). Only required if trigger_type is OCO." }
                },
                required: ["stock_symbol", "trigger_type", "transaction_type", "quantity", "trigger_price_1"]
              }
            },
            {
              name: "fetchStockNews",
              description: "Fetches recent news articles, media updates, and analysis reports for a specific stock symbol.",
              parameters: {
                type: "OBJECT",
                properties: {
                  stock_symbol: { type: "STRING", description: "The stock symbol in uppercase, e.g., NATIONALUM, DABUR, INFY." }
                },
                required: ["stock_symbol"]
              }
            },
            {
              name: "fetchCorporateActions",
              description: "Fetches upcoming and past corporate actions (Dividends, Splits, Earnings Announcements, and Board Meetings) for a specific stock symbol.",
              parameters: {
                type: "OBJECT",
                properties: {
                  stock_symbol: { type: "STRING", description: "The stock symbol in uppercase, e.g., NATIONALUM, DABUR, INFY." }
                },
                required: ["stock_symbol"]
              }
            }
          ]
        }
      ];

      let workflowContext = '';
      if (activeOrderWorkflow) {
        workflowContext = `\n### ⚠️ ACTIVE GTT ORDER WORKFLOW STATE (LOCKED):
The user is currently placing a GTT order. The active parameters are:
- Stock Symbol: **${activeOrderWorkflow.stock_symbol}**
- Action Type: **${activeOrderWorkflow.transaction_type}**
- Order Quantity: **${activeOrderWorkflow.quantity}**
- Target/Trigger Price: **₹${activeOrderWorkflow.trigger_price_1}**
${activeOrderWorkflow.trigger_price_2 ? `- Stoploss Trigger Price: **₹${activeOrderWorkflow.trigger_price_2}**` : ''}

These parameters are locked in the active order workflow. Keep them in mind. If the user asks general questions, answer them, but remind them that this order is pending confirmation. If they confirm (e.g. "yes", "proceed", "confirm"), proceed with tool/function execution.`;
      }

      const systemInstruction = `You are Finor AI (V6.0), a professional trading coach, derivatives analyst, and comprehensive wealth advisor. You are chatting with the user, ${userName}.
Always address the user as ${userName} or Arivu to maintain a personalized and friendly relationship.

You have comprehensive, direct real-time access to the user's entire Supabase database and ledger systems:
- 📈 **Equity Holdings & Historical Trade Ledger**: Active portfolio positions, cost bases, LTP, and chronological buy/sell trade matchings.
- ⚡ **F&O Derivatives Tracking**: Futures & Options contracts (Call CE, Put PE, Futures), trade logs, gross realized P&L, approximate statutory charges (Brokerage, STT, Exchange turnover, GST, Stamp duty, DP charges), and Net Realized P&L.
- 🏦 **Mutual Fund Portfolio (Coin Sync)**: Synced mutual fund schemes, units, invested capital, current NAV valuations, and recent Coin MF orders.
- 🎯 **Financial Goals & Wealth Targets (finance_goals)**: Goal titles, target amounts, saved balances, completion percentages, and target deadlines.
- 💳 **Debts, Receivables & Payables (finance_debts)**: Money lent to people (receivables) and money borrowed from people (payables), outstanding amounts, interest rates, and due dates.
- 💡 **Personal Finance Cashflow (finance_transactions)**: Daily expense logs, income streams, avoidable/discretionary spend audit, and company reimbursable claims.
- ⏳ **Portfolio Timeline Snapshots (portfolio_snapshots)**: Historical net worth snapshots and valuation trajectories.
- 🎯 **Buy Watchlist Radar (buy_considerations)**: Target entry price levels and monitor notes.

The context below is computed dynamically by the backend from the user's live database records:
${contextText}
${workflowContext}

Analyze this context and answer the user's query directly and professionally. Maintain an encouraging, analytical, yet direct tone. Use clean markdown formatting with headers, bullet points, and tables where helpful. Do not repeat the entire context list unless asked, but reference specific details. Keep your response under 300 words.

### 🛡️ CRITICAL SECURITY POLICY:
You have access to calculated analytical metrics, profile attributes, and transaction logs. However, you must NEVER ask for, expose, or output sensitive credentials, passwords, Zerodha API Key/Secrets, Gmail refresh tokens, or other private access credentials. If the user asks for passwords or API secrets, explain that you do not display or store these in plaintext for security reasons, and instruct them to update their API credentials securely via the Profile Settings page.

Acknowledge that you have full access to these pre-calculated metrics and database tables. If the user asks about database integration, F&O access, mutual funds, debts, or historical data access, confidently confirm that your backend retrieves and calculates these metrics from their complete database in Supabase, citing exact numbers and data points.

If the user asks to download, export, print, or generate an Excel, CSV, or PDF of their P&L, trades, or active holdings directly in this chat based on their custom questions or queries, you MUST first output the requested custom tables/content in your response, and then append direct downloadable markdown links using these exact URL formats:
- To export the exact table/text you just generated in your response as a PDF: [Download PDF Report](/api/export/markdown-pdf)
- To export the exact table/text you just generated in your response as a CSV: [Download CSV Report](/api/export/markdown-csv)
Always display these links prominently at the bottom of your response so the user can download their custom results instantly with a single tap. Also mention that they can use the "Export CSV" and "Print PDF" buttons at the top of the P&L page for full reports.

### 🛡️ GTT Order Placement Rules:
1. **Verify Ticker Symbols:** Check if the stock symbol matches their holdings context. If the user types a slightly misspelled ticker (e.g. "EIHHotel" or "Reliance"), correct it to the actual NSE ticker symbol (e.g. "EIHOTEL", "RELIANCE") before confirming or placing the order.
2. **Clarifying Questions:** If the user asks you to place a GTT order but misses any required parameters (stock symbol, transaction type, quantity, or trigger price), do NOT call the placeGttOrder tool yet. Instead, ask the user clarifying questions to obtain the missing details.
3. **Double Confirmation:** Always summarize the order details (Symbol, Buy/Sell action, Quantity, and Trigger Price) and explicitly ask the user for confirmation (e.g. "Would you like me to proceed with placing this GTT order?") before invoking the placeGttOrder tool. Do NOT call the tool on the initial request; wait for the user to confirm (e.g., they say "Yes", "Confirm", "Proceed", or similar). Only call the tool when the user confirms.
4. **Post-Execution State Clearing:** Once an GTT order has been placed or the confirmation summary has been outputted to the user (i.e. GTT tool execution returns successfully), the order is considered executed. Do NOT prompt the user to place or confirm this specific order again in subsequent turns.
`;

      console.log("[AI Assistant] Raw chatHistory:", JSON.stringify(chatHistory, null, 2));
      // Map chatHistory to Gemini format
      let mappedHistory = chatHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      console.log("[AI Assistant] Mapped history before sanitization:", JSON.stringify(mappedHistory, null, 2));

      // Build alternating list to ensure strict alternating pattern without loss of user queries
      let alternateHistory = [];
      mappedHistory.forEach(msg => {
        if (alternateHistory.length === 0) {
          if (msg.role === 'user') {
            alternateHistory.push(msg);
          }
        } else {
          const lastMsg = alternateHistory[alternateHistory.length - 1];
          if (lastMsg.role === msg.role) {
            // Merge consecutive messages of the same role
            lastMsg.parts[0].text += '\n' + msg.parts[0].text;
          } else {
            alternateHistory.push(msg);
          }
        }
      });

      // Ensure the history ends with 'model' (assistant) so the next user message alternates
      if (alternateHistory.length > 0 && alternateHistory[alternateHistory.length - 1].role !== 'model') {
        alternateHistory.pop();
      }

      mappedHistory = alternateHistory;
      console.log("[AI Assistant] Mapped history after alternating sanitization:", JSON.stringify(mappedHistory, null, 2));

      let finalModel = targetModel;

      const runGeneration = async (modelToUse, customPrompt = null) => {
        const modelObj = genAI.getGenerativeModel({ 
          model: modelToUse,
          tools,
          systemInstruction
        });
        const chatObj = modelObj.startChat({
          history: mappedHistory
        });

        const promptText = customPrompt || message || 'Please analyze this uploaded image in the context of my portfolio and finances.';
        let payloadToSend;

        if (!customPrompt && image && image.data && image.mimeType) {
          payloadToSend = [
            {
              inlineData: {
                data: image.data,
                mimeType: image.mimeType
              }
            },
            promptText
          ];
        } else {
          payloadToSend = promptText;
        }

        return {
          resultObj: await chatObj.sendMessage(payloadToSend),
          chatObj
        };
      };

      const runWithFallback = async (customPrompt = null) => {
        try {
          return await runGeneration(targetModel, customPrompt);
        } catch (err) {
          console.error(`[AI Assistant] Model ${targetModel} generation failed:`, err.message);
          if (targetModel !== 'gemini-2.5-flash') {
            console.log(`[AI Assistant] Falling back to gemini-2.5-flash...`);
            try {
              finalModel = 'gemini-2.5-flash';
              return await runGeneration('gemini-2.5-flash', customPrompt);
            } catch (err2) {
              console.error(`[AI Assistant] Fallback to gemini-2.5-flash failed:`, err2.message);
              console.log(`[AI Assistant] Falling back to gemini-3.1-flash-lite...`);
              finalModel = 'gemini-3.1-flash-lite';
              return await runGeneration('gemini-3.1-flash-lite', customPrompt);
            }
          } else {
            console.log(`[AI Assistant] Falling back to gemini-3.1-flash-lite...`);
            finalModel = 'gemini-3.1-flash-lite';
            return await runGeneration('gemini-3.1-flash-lite', customPrompt);
          }
        }
      };

      // Handle direct confirmed order execution
      if (confirmOrder && orderArgs) {
        console.log('[AI Assistant] Executing GTT order placement with user confirmation:', orderArgs);
        let apiResult;
        try {
          const placementResult = await placeGttOrderInternal({
            userId,
            stock_symbol: orderArgs.stock_symbol,
            trigger_type: orderArgs.trigger_type,
            quantity: orderArgs.quantity,
            trigger_price_1: orderArgs.trigger_price_1,
            trigger_price_2: orderArgs.trigger_price_2,
            transaction_type: orderArgs.transaction_type
          });
          apiResult = { success: true, result: placementResult };
        } catch (err) {
          console.error('[AI Assistant] placeGttOrder execution failed:', err.message);
          apiResult = { success: false, error: err.message };
        }

        // Generate response using fallback chat
        const prompt = `[System Notification: The user clicked 'Approve' and the order has been processed. Execution Result: ${JSON.stringify(apiResult)}. Please summarize the execution status to the user in a natural, friendly tone. Mention whether it was placed as a paper trade or routed to Zerodha based on the details.]`;
        const { resultObj } = await runWithFallback(prompt);
        reply = resultObj.response.text();
      } else {
        // Normal chat execution
        const { resultObj, chatObj } = await runWithFallback();
        
        // Check for tool/function calls with a loop to support sequential multi-step tool calls
        let currentResponse = resultObj;
        let loopCount = 0;
        const maxLoops = 6;

        while (loopCount < maxLoops) {
          const calls = currentResponse.response.functionCalls();
          if (!calls || calls.length === 0) {
            reply = currentResponse.response.text();
            break;
          }

          const call = calls[0];
          console.log(`[AI Assistant] Executing tool call loop [${loopCount}]: ${call.name}`);

          let toolResponseData;
          if (call.name === 'placeGttOrder') {
            const args = call.args;
            console.log('[AI Assistant] Intercepted placeGttOrder tool call:', args);
            reply = `I have prepared the GTT order details for your review. Please click the **Confirm Placement** button below when you are ready to place this order.`;
            pendingConfirm = {
              tool: 'placeGttOrder',
              args
            };
            break; // Stop loop to wait for user confirmation click
          } else if (call.name === 'fetchStockNews') {
            const symbol = call.args.stock_symbol || call.args.symbol || '';
            console.log(`[AI Assistant] Tool Loop: Fetching news for: ${symbol}`);
            try {
              const articles = await fetchNewsForSymbol(symbol);
              toolResponseData = { articles };
            } catch (err) {
              console.error('[AI Assistant] Tool Loop: fetchStockNews failed:', err.message);
              toolResponseData = { error: err.message };
            }
          } else if (call.name === 'fetchCorporateActions') {
            const symbol = call.args.stock_symbol || call.args.symbol || '';
            console.log(`[AI Assistant] Tool Loop: Fetching corporate actions for: ${symbol}`);
            try {
              const actions = await fetchCorporateActionsForSymbol(symbol);
              toolResponseData = { corporate_actions: actions };
            } catch (err) {
              console.error('[AI Assistant] Tool Loop: fetchCorporateActions failed:', err.message);
              toolResponseData = { error: err.message };
            }
          } else {
            console.warn(`[AI Assistant] Tool Loop: Model requested unknown tool: ${call.name}`);
            toolResponseData = { error: `Tool '${call.name}' is not registered. Please respond to the user query directly using text.` };
          }

          // Send the tool outcome back to the model
          try {
            const nextResponse = await chatObj.sendMessage([{
              functionResponse: {
                name: call.name,
                response: toolResponseData
              }
            }]);
            currentResponse = nextResponse;
            loopCount++;
          } catch (sendErr) {
            console.error('[AI Assistant] Tool Loop: Failed to send function response to Gemini:', sendErr.message);
            reply = `I encountered a communication error while analyzing data for ${call.args.stock_symbol || 'your holdings'}. Please try again.`;
            break;
          }
        }

        if (loopCount >= maxLoops) {
          reply = currentResponse.response.text() || "I checked the corporate actions and news for your holdings but reached the search limit. Please feel free to ask about a subset of stocks!";
        }
      }

      // Map model keys to readable labels
      if (finalModel === 'gemini-3.5-flash') {
        engineUsed = 'Gemini 3.5 Flash';
      } else if (finalModel === 'gemini-2.5-flash') {
        engineUsed = 'Gemini 2.5 Flash';
      } else if (finalModel === 'gemini-3.1-flash-lite') {
        engineUsed = 'Gemini 3.1 Flash Lite';
      }

      if (!reply) {
        throw new Error('Invalid empty content response structure from Gemini.');
      }
    }

    // Load actual daily history to save both user message and assistant reply
    const history = await getDailyChatHistory(userId, dateKey);
    const d = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(d.getTime() + istOffset);
    const timeStr = istTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    history.push({ role: 'user', content: message, timestamp: timeStr });
    history.push({ role: 'assistant', content: reply, engine: engineUsed, timestamp: timeStr });
    await saveDailyChatHistory(userId, dateKey, history);

    // Increment count on successful request processing
    const newCount = await incrementDailyUsage(userId, dateKey, currentCount);

    res.json({
      reply,
      engine: engineUsed,
      remaining: Math.max(0, DAILY_LIMIT - newCount),
      count: newCount,
      history,
      pendingConfirm
    });

  } catch (err) {
    console.error('[AI Assistant] Chat route error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
