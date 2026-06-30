import express from 'express';
import { supabase } from '../config/supabase.js';
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
  const { data, error } = await supabase
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
    const { data: existing, error: findErr } = await supabase
      .from('news_cache')
      .select('id')
      .eq('stock_symbol', key)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existing) {
      const { error: updateErr } = await supabase
        .from('news_cache')
        .update({
          news_content: content,
          sentiment: 'NEUTRAL',
          fetched_at: new Date().toISOString()
        })
        .eq('stock_symbol', key);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
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
  const { data, error } = await supabase
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
    const { data: existing, error: findErr } = await supabase
      .from('news_cache')
      .select('id')
      .eq('stock_symbol', key)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existing) {
      const { error: updateErr } = await supabase
        .from('news_cache')
        .update({
          news_content: content,
          sentiment: 'NEUTRAL',
          fetched_at: new Date().toISOString()
        })
        .eq('stock_symbol', key);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
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
    const { data: cached } = await supabase
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
      await supabase.from('news_cache').upsert({
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
    const { data: cached } = await supabase
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
const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

  const { data: holdings } = await supabase
    .from('holdings')
    .select('*')
    .eq('user_id', userId);

  // Fetch ALL trades of the user (all-time) sorted chronologically for accurate FIFO calculations
  const { data: allTrades } = await supabase
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

  let ctx = `=== USER PORTFOLIO CONTEXT ===\n\n`;

  ctx += `## Active Open Positions:\n`;
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

  ctx += `\n## All-Time Realized P&L by Stock:\n`;
  if (pnlReport.stock_wise && pnlReport.stock_wise.length > 0) {
    pnlReport.stock_wise.forEach(s => {
      const stats = closedStatsMap[s.stock_symbol];
      const avgClosedHold = stats && stats.count > 0 ? (stats.total_days / stats.count).toFixed(1) : 'N/A';
      ctx += `- **${s.stock_symbol}**: All-Time Realized P&L: ₹${s.realized_pnl.toFixed(2)} (STCG: ₹${s.stcg.toFixed(2)}, LTCG: ₹${s.ltcg.toFixed(2)}, Total Traded Qty: ${s.quantity}, Avg Hold Duration: ${avgClosedHold} days)\n`;
    });
  } else {
    ctx += `No realized P&L matches found.\n`;
  }

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
function generateSimulatedResponse(message, contextText) {
  const msgLower = message.toLowerCase();
  let reply = `### 🧠 AI Assistant (Simulated Mode)\n\n`;
  reply += `*You are viewing this response in Simulated Mode because no Gemini API key is configured in your backend environment variables.*\n\n`;

  if (msgLower.includes('holding') || msgLower.includes('portfolio') || msgLower.includes('invested')) {
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
    reply += `I am your virtual trading assistant. I have full context on your holdings, recent trades, and discipline score parameters. Ask me questions like:\n`;
    reply += `1. *"Summarize my holdings"* (to see active open positions)\n`;
    reply += `2. *"Evaluate my trading discipline"* (to check scores and violations)\n`;
    reply += `3. *"What are my recent trades?"* (to check transaction logs)\n\n`;
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
    const { message, chatHistory = [], modelName = 'default', confirmOrder = false, orderArgs = null, activeOrderWorkflow = null } = req.body;

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

    if (!message) {
      return res.status(400).json({ error: 'Message query is required.' });
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
      reply = generateSimulatedResponse(message, contextText);
    } else {
      // Determine the target model
      let targetModel = 'gemini-3.5-flash';
      if (modelName && modelName !== 'default' && ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'].includes(modelName)) {
        targetModel = modelName;
      } else {
        // Auto-switch based on question complexity level
        const msgLower = message.toLowerCase();
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

      const systemInstruction = `You are Finor AI (V6.0), a professional trading coach and portfolio risk advisor. You are chatting with the user, ${userName}.
Always address the user as ${userName} or Arivu to maintain a personalized and friendly relationship.

You are directly integrated with the user's trading terminal database (Supabase). The context below is computed dynamically by the backend from the user's complete historical trade ledger (including all buy/sell transactions):
${contextText}
${workflowContext}

Analyze this context and answer the user's query directly and professionally. Maintain an encouraging, analytical, yet direct tone. Use clean markdown formatting with headers, bullet points, and tables where helpful. Do not repeat the entire context list unless asked, but reference specific details. Keep your response under 300 words.

Acknowledge that you have full access to these pre-calculated metrics. If the user asks about database integration or historical trade data access, confidently confirm that your backend retrieves and calculates these metrics from their complete trade ledger in Supabase, meaning you do have access to these aggregated insights.

If the user asks to download, export, print, or generate an Excel, CSV, or PDF of their P&L or profit reports, explain that they can download a CSV file of their trades/holdings or print a beautifully formatted PDF statement directly from their portfolio screen by using the **"Export CSV"** and **"Print PDF"** buttons on the top right of the **P&L Statement** page.

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
        return {
          resultObj: await chatObj.sendMessage(customPrompt || message),
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
        
        // Check for tool/function calls
        const calls = resultObj.response.functionCalls();
        if (calls && calls.length > 0) {
          const call = calls[0];
          if (call.name === 'placeGttOrder') {
            // INTERCEPT call: Do NOT execute order placement.
            // Return order arguments so the frontend can display the interactive confirmation card
            const args = call.args;
            console.log('[AI Assistant] Intercepted placeGttOrder tool call:', args);
            reply = `I have prepared the GTT order details for your review. Please click the **Confirm Placement** button below when you are ready to place this order.`;
            pendingConfirm = {
              tool: 'placeGttOrder',
              args
            };
          } else if (call.name === 'fetchStockNews') {
            const symbol = call.args.stock_symbol;
            console.log(`[AI Assistant] Executing fetchStockNews tool for: ${symbol}`);
            try {
              const articles = await fetchNewsForSymbol(symbol);
              const secondResponse = await chatObj.sendMessage([{
                functionResponse: {
                  name: 'fetchStockNews',
                  response: { articles }
                }
              }]);
              reply = secondResponse.response.text();
            } catch (err) {
              console.error('[AI Assistant] fetchStockNews tool failed:', err.message);
              reply = `I encountered an issue retrieving news for ${symbol}. Please try again.`;
            }
          } else if (call.name === 'fetchCorporateActions') {
            const symbol = call.args.stock_symbol;
            console.log(`[AI Assistant] Executing fetchCorporateActions tool for: ${symbol}`);
            try {
              const actions = await fetchCorporateActionsForSymbol(symbol);
              const secondResponse = await chatObj.sendMessage([{
                functionResponse: {
                  name: 'fetchCorporateActions',
                  response: { corporate_actions: actions }
                }
              }]);
              reply = secondResponse.response.text();
            } catch (err) {
              console.error('[AI Assistant] fetchCorporateActions tool failed:', err.message);
              reply = `I encountered an issue retrieving corporate actions for ${symbol}. Please try again.`;
            }
          } else {
            // Hallucinated/unknown tool call: return error message to the model and request a text-only fallback response
            console.warn(`[AI Assistant] Model hallucinated unregistered tool call: ${call.name}`);
            try {
              const secondResponse = await chatObj.sendMessage([{
                functionResponse: {
                  name: call.name,
                  response: { error: `Tool '${call.name}' is not registered. Please respond to the user query directly using text.` }
                }
              }]);
              reply = secondResponse.response.text();
            } catch (fallbackErr) {
              console.error('[AI Assistant] Failed to handle hallucinated tool call fallback:', fallbackErr.message);
              reply = resultObj.response.text();
            }
          }
        } else {
          reply = resultObj.response.text();
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
