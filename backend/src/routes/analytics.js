import express from 'express';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { calculateRealizedPnL } from '../services/fifoCalculator.js';
import { fetchHistoricalPrices } from '../services/yahooFinance.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

/**
 * GET /api/analytics/realized-pnl
 * Returns FIFO realized P&L analysis, STCG/LTCG splits, stock-wise breakdowns, and closed trades list.
 */
router.get('/realized-pnl', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all trades
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true });

    if (error) throw error;

    const pnlData = calculateRealizedPnL(trades || []);
    res.json(pnlData);
  } catch (err) {
    console.error('[AnalyticsRoute] Realized P&L error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analytics/portfolio-history
 * Computes monthly portfolio valuation (Value vs Cost) over the past 12 months for line charting.
 */
/**
 * Helper to generate milestones based on period.
 */
function generateMilestones(period, earliestTradeDate) {
  const milestones = [];
  const now = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  if (period === '1W') {
    // 7 daily milestones (last 7 days)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(23, 59, 59, 999);
      const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
      milestones.push({ date: d, label, isCurrent: i === 0 });
    }
  } else if (period === '1M') {
    // 30 daily milestones
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(23, 59, 59, 999);
      const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      milestones.push({ date: d, label, isCurrent: i === 0 });
    }
  } else if (period === '3M') {
    // Weekly milestones (last 12 weeks)
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 7);
      d.setHours(23, 59, 59, 999);
      const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      milestones.push({ date: d, label, isCurrent: i === 0 });
    }
  } else if (period === '6M') {
    // Bi-weekly milestones (last 26 weeks, but 13 points to look good on charts)
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 14);
      d.setHours(23, 59, 59, 999);
      const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      milestones.push({ date: d, label, isCurrent: i === 0 });
    }
  } else if (period === '1Y') {
    // Monthly milestones (12 months)
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // Last day of month
      d.setHours(23, 59, 59, 999);
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
      const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      milestones.push({ date: isCurrent ? new Date(now) : d, label, isCurrent });
    }
  } else if (period === 'ALL') {
    // Monthly milestones since earliestTradeDate
    const start = new Date(Math.max(earliestTradeDate.getTime(), now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000));
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= now) {
      const d = new Date(current.getFullYear(), current.getMonth() + 1, 0); // Last day of this month
      d.setHours(23, 59, 59, 999);
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
      const isCurrent = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      milestones.push({ date: isCurrent ? new Date(now) : d, label, isCurrent });
      current.setMonth(current.getMonth() + 1);
    }
    
    // If milestones is too short, generate weekly milestones since earliest trade date
    if (milestones.length < 4) {
      milestones.length = 0;
      const diffMs = now.getTime() - start.getTime();
      const diffWeeks = Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
      for (let i = diffWeeks; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i * 7);
        d.setHours(23, 59, 59, 999);
        const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        milestones.push({ date: d, label, isCurrent: i === 0 });
      }
    }
  }
  
  return milestones;
}

/**
 * GET /api/analytics/portfolio-history
 * Computes monthly portfolio valuation (Value vs Cost) over the past 12 months for line charting.
 */
router.get('/portfolio-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const period = req.query.period || '1Y';

    // 1. Fetch trades
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true });

    if (error) throw error;
    if (!trades || trades.length === 0) {
      return res.json([]);
    }

    const earliestTradeDate = new Date(trades[0].trade_date);

    // 2. Extract unique symbols
    const symbols = [...new Set(trades.map(t => t.stock_symbol))];

    // 3. Fetch historical prices for all symbols concurrently based on period
    const historyMap = {};
    
    const fetchPromises = symbols.map(async (symbol) => {
      try {
        const hist = await fetchHistoricalPrices(symbol, period);
        historyMap[symbol] = hist;
      } catch (err) {
        historyMap[symbol] = [];
      }
    });

    await Promise.all(fetchPromises);

    // 4. Build milestone dates based on selected period
    const milestones = generateMilestones(period, earliestTradeDate);

    // 5. Reconstruct portfolio states at each milestone
    const chartData = milestones.map((m) => {
      const milestoneDate = m.date;
      
      // Filter trades up to this milestone and sort them chronologically (BUY before SELL)
      const tradesUpToMilestone = trades
        .filter(t => new Date(t.trade_date) <= milestoneDate)
        .sort((a, b) => {
          const timeA = new Date(a.trade_date).getTime();
          const timeB = new Date(b.trade_date).getTime();
          if (timeA !== timeB) return timeA - timeB;
          const typeA = a.trade_type.toUpperCase();
          const typeB = b.trade_type.toUpperCase();
          if (typeA === 'BUY' && typeB === 'SELL') return -1;
          if (typeA === 'SELL' && typeB === 'BUY') return 1;
          return 0;
        });
      
      // Trace quantity & average buy price
      const holdingsMap = {};
      for (const t of tradesUpToMilestone) {
        const symbol = t.stock_symbol;
        const type = t.trade_type.toUpperCase();
        const qty = t.quantity;
        const price = parseFloat(t.price);

        if (!holdingsMap[symbol]) {
          holdingsMap[symbol] = { quantity: 0, average_buy_price: 0 };
        }

        const h = holdingsMap[symbol];
        if (type === 'BUY') {
          const newQty = h.quantity + qty;
          const newAvg = ((h.quantity * h.average_buy_price) + (qty * price)) / newQty;
          h.quantity = newQty;
          h.average_buy_price = newAvg;
        } else if (type === 'SELL') {
          h.quantity = Math.max(0, h.quantity - qty);
        }
      }

      // Calculate total valuation at this milestone
      let totalCostBasis = 0;
      let totalMarketValue = 0;

      for (const [symbol, h] of Object.entries(holdingsMap)) {
        if (h.quantity <= 0) continue;

        totalCostBasis += h.quantity * h.average_buy_price;

        // Find stock price at this milestone
        let historicalPrice = null;
        const history = historyMap[symbol] || [];
        
        // Find closest preceding date quote
        const preceding = history
          .filter(pt => new Date(pt.date) <= milestoneDate)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
        if (preceding.length > 0) {
          historicalPrice = preceding[0].close;
        }

        // Fallback: if no historical price found, use average buy price
        const finalPrice = historicalPrice !== null ? historicalPrice : h.average_buy_price;
        totalMarketValue += h.quantity * finalPrice;
      }

      const pnl = totalMarketValue - totalCostBasis;
      const roi = totalCostBasis > 0 ? (pnl / totalCostBasis) * 100 : 0;

      return {
        month: m.label,
        invested: parseFloat(totalCostBasis.toFixed(2)),
        value: parseFloat(totalMarketValue.toFixed(2)),
        pnl: parseFloat(pnl.toFixed(2)),
        roi: parseFloat(roi.toFixed(2))
      };
    });

    res.json(chartData);
  } catch (err) {
    console.error('[AnalyticsRoute] Portfolio history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper: Queries the Google Gemini API to generate narrative trade behavioral coach audits.
 */
async function generateAIInsights(apiKey, report) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
  
  const prompt = `You are a professional trading coach and portfolio risk auditor. Analyze the following trading behavior statistics of a retail investor:
- Discipline Score: ${report.disciplineScore}/100 (Grade: ${report.grade} - ${report.gradeMeaning})
- Category Scores (out of 20): Averaging: ${report.categoryScores.averaging}, Exit: ${report.categoryScores.exit}, Profit Booking: ${report.categoryScores.booking}, Behavioural Patterns: ${report.categoryScores.patterns}, Long-term Planning: ${report.categoryScores.planning}
- Win Rate: ${report.winRate.toFixed(1)}%
- Average Annualized Return: ${report.avgAnnualizedReturn.toFixed(1)}%
- Average Holding Days (Winners): ${report.avgWinnerHold} days
- Average Holding Days (Losers): ${report.avgLoserHold} days
- Revenge Buys Count: ${report.revengeBuysCount}
- FOMO Entries Count: ${report.fomoEntriesCount}
- Panic Sells Count: ${report.panicSellsCount}
- Early Profit Exits Count: ${report.earlyExitsCount}
- Weak Stocks Held Beyond Threshold (Consider Exit): ${report.considerExits.length}

Provide a concise, direct audit of their trading habits. Do NOT repeat the statistics themselves in list format, but analyze them. Identify 2 key psychological trading patterns they are falling victim to based on these metrics, and give 3 highly actionable recommendations to improve their discipline. Format your response in clean markdown with headers, bullet points, and tables. Keep the tone professional, encouraging, yet analytical.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text) {
    throw new Error('Invalid response structure from Gemini API');
  }

  return text;
}

/**
 * GET /api/analytics/insights
 * Returns programmatic trading insights, mistakes audits, and a discipline score.
 */
router.get('/insights', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewMode, startDate, endDate, symbol } = req.query;

    const { computeInsightsReport } = await import('../services/insightsEngine.js');
    const report = await computeInsightsReport(userId, { viewMode, startDate, endDate, symbol });

    res.json(report);
  } catch (err) {
    console.error('[AnalyticsRoute] Insights error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/analytics/insights/ai
 * Requests the Google Gemini API to generate a narrative trading habits coach review.
 * Falls back to a tailored programmatic narrative if the API key is not configured.
 */
router.post('/insights/ai', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { viewMode, startDate, endDate, symbol } = req.body;

    const { computeInsightsReport } = await import('../services/insightsEngine.js');
    const report = await computeInsightsReport(userId, { viewMode, startDate, endDate, symbol });

    if (report.emptyState) {
      return res.json({
        coach_narrative: "Welcome to **Finor AI Coach**! No trading data was found in your ledger yet. Once you upload your Zerodha Tradebook CSV in the **Holdings** page or place trades, this AI agent will audit your patterns, identify discipline red flags, and provide actionable tips. Ready when you are!"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const isMockAI = !apiKey || apiKey === 'your_gemini_api_key_here';

    if (isMockAI) {
      let narrative = `### 🧠 AI Trading Coach Review (Simulated Mode)\n\n`;
      narrative += `Based on your trading history and a calculated **Discipline Score of ${report.disciplineScore}/100 (Grade ${report.grade})**, here is your personalized behavioral audit:\n\n`;
      
      narrative += `#### 📊 Category Performance Breakdown\n\n`;
      narrative += `| Discipline Area | Score (Max 20) | Status |\n`;
      narrative += `| :--- | :---: | :---: |\n`;
      narrative += `| Averaging Discipline | **${report.categoryScores.averaging}/20** | ${report.categoryScores.averaging >= 15 ? '🟢 Compliant' : '🔴 Violations'} |\n`;
      narrative += `| Exit Discipline | **${report.categoryScores.exit}/20** | ${report.categoryScores.exit >= 15 ? '🟢 Good' : '🟡 Warning'} |\n`;
      narrative += `| Profit Booking | **${report.categoryScores.booking}/20** | ${report.categoryScores.booking >= 15 ? '🟢 Target Met' : '🔴 Sell Too Early'} |\n`;
      narrative += `| Behavioural Patterns | **${report.categoryScores.patterns}/20** | ${report.categoryScores.patterns >= 15 ? '🟢 Disciplined' : '🔴 Emotional'} |\n`;
      narrative += `| Long-Term Planning | **${report.categoryScores.planning}/20** | ${report.categoryScores.planning >= 15 ? '🟢 Plans Set' : '🟡 No Plan'} |\n\n`;

      narrative += `#### ⚠️ Behavioral Red Flags & Insights\n`;
      let flagged = false;
      if (report.revengeBuysCount > 0) {
        narrative += `- **Revenge Buying Detected:** You re-bought stocks recently sold at a loss **${report.revengeBuysCount} times** within 7 days. This shows emotional attachment. Let a stock settle before re-entering.\n`;
        flagged = true;
      }
      if (report.fomoEntriesCount > 0) {
        narrative += `- **Possible FOMO Entries:** You entered a running stock **${report.fomoEntriesCount} times** after it ran up 10%+ in 5 days. Patiently wait for a pullback instead of chasing momentum.\n`;
        flagged = true;
      }
      if (report.panicSellsCount > 0) {
        narrative += `- **Panic Sells on Red Days:** You sold stocks in panic on a major down day **${report.panicSellsCount} times** before your stop-loss was hit. Enforce your plan or wait for the close.\n`;
        flagged = true;
      }
      if (report.earlyExitsCount > 0) {
        narrative += `- **Booking Profits Too Early:** You sold **${report.earlyExitsCount} trades** early, only to watch them rise 5%+ within 10 days of exit. Let your winning positions run to reach their full targets.\n`;
        flagged = true;
      }
      if (report.considerExits.length > 0) {
        narrative += `- **Weak Stocks Held Too Long:** You have **${report.considerExits.length} stocks** (like ${report.considerExits.map(c => c.symbol).join(', ')}) down 30%+ for over 90 days with negative fundamentals. Cut your losses to free up capital.\n`;
        flagged = true;
      }
      
      if (!flagged) {
        narrative += `- **Strong Rule Adherence:** You followed your tranche entry, exit targets, and did not execute emotional revenge trades this period. Outstanding discipline!\n`;
      }

      narrative += `\n#### 🛠️ Recommended Actions\n`;
      narrative += `1. **Always Follow the 3-Tranche Rule:** Never buy a stock a 4th time. Maintain 7-10% and 10-15% gaps between buy orders.\n`;
      narrative += `2. **Book 80% on Core Holdings:** Tag fundamentally strong stocks as Core Hold and follow the profit-harvesting suggestion to maintain long-term exposure while securing returns.\n`;
      narrative += `3. **Patience over FOMO:** If a stock is up 10%+ in a week, add it to your watchlist but do not buy immediately. Wait for a -5% cooling period.\n\n`;
      narrative += `*Configure your \`GEMINI_API_KEY\` in your env settings to activate personalized, deep-learning trading narrative coach audits.*`;

      return res.json({ coach_narrative: narrative });
    }

    try {
      const narrative = await generateAIInsights(apiKey, report);
      res.json({ coach_narrative: narrative });
    } catch (geminiErr) {
      console.error('[AnalyticsRoute] Gemini call failed, returning fallback:', geminiErr.message);
      res.json({ coach_narrative: `### 🧠 AI Trading Coach Review (API Fallback)\n\nFailed to reach Gemini servers (${geminiErr.message}). Fallback stats show a **Discipline Score of ${report.disciplineScore}/100** with a **Win Rate of ${report.winRate.toFixed(1)}%**. Try checking your internet or Gemini API key.` });
    }
  } catch (err) {
    console.error('[AnalyticsRoute] AI Insights error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/analytics/pnl-comparison/ai
 * Generates an advanced P&L behavior comparison report across stocks and periods.
 * Compares profit-concentration (80/20), winners vs losers holding duration, fee drag, and MoM trends.
 * Calls Gemini AI (with a custom programmatic fallback if Gemini is offline).
 */
router.post('/pnl-comparison/ai', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, stockA, stockB } = req.body;

    // 1. Fetch all trades
    const { data: trades, error: tradesErr } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true });

    if (tradesErr) throw tradesErr;

    if (!trades || trades.length === 0) {
      return res.json({
        report: "No trade data found in your ledger yet to compute advanced comparisons. Upload a Zerodha Tradebook CSV to begin!"
      });
    }

    // 2. Run FIFO P&L calculations
    const { calculateRealizedPnL } = await import('../services/fifoCalculator.js');
    const pnlStats = calculateRealizedPnL(trades);
    const closed = pnlStats.closed_trades;

    if (closed.length === 0) {
      return res.json({
        report: "Not enough closed trades found. You need at least 1 completed buy-and-sell cycle to compute P&L comparisons."
      });
    }

    // Apply date filters to closed trades if specified
    let filteredClosed = closed;
    if (startDate) {
      const start = new Date(startDate);
      filteredClosed = filteredClosed.filter(t => new Date(t.sell_date) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      filteredClosed = filteredClosed.filter(t => new Date(t.sell_date) <= end);
    }

    // Check if head-to-head stock comparison is requested
    const isHeadToHead = stockA && stockB && stockA !== 'ALL' && stockB !== 'ALL' && stockA !== stockB;

    if (isHeadToHead) {
      const symA = stockA.toUpperCase().trim();
      const symB = stockB.toUpperCase().trim();

      // Stats for Stock A
      const tradesA = filteredClosed.filter(t => t.stock_symbol.toUpperCase() === symA);
      const pnlA = tradesA.reduce((sum, t) => sum + t.realized_pnl, 0);
      const countA = tradesA.length;
      const winsA = tradesA.filter(t => t.realized_pnl > 0).length;
      const winRateA = countA > 0 ? (winsA / countA) * 100 : 0;
      const totalHoldDaysA = tradesA.reduce((sum, t) => sum + t.holding_days, 0);
      const avgHoldDaysA = countA > 0 ? (totalHoldDaysA / countA) : 0;

      const totalInvestedA = tradesA.reduce((sum, t) => sum + (t.quantity * t.buy_price), 0);
      const totalQtyA = tradesA.reduce((sum, t) => sum + t.quantity, 0);
      const avgBuyPriceA = totalQtyA > 0 ? (totalInvestedA / totalQtyA) : 0;
      const totalRevenueA = tradesA.reduce((sum, t) => sum + (t.quantity * t.sell_price), 0);
      const avgSellPriceA = totalQtyA > 0 ? (totalRevenueA / totalQtyA) : 0;
      const returnPercentA = totalInvestedA > 0 ? (pnlA / totalInvestedA) * 100 : 0;

      // Stats for Stock B
      const tradesB = filteredClosed.filter(t => t.stock_symbol.toUpperCase() === symB);
      const pnlB = tradesB.reduce((sum, t) => sum + t.realized_pnl, 0);
      const countB = tradesB.length;
      const winsB = tradesB.filter(t => t.realized_pnl > 0).length;
      const winRateB = countB > 0 ? (winsB / countB) * 100 : 0;
      const totalHoldDaysB = tradesB.reduce((sum, t) => sum + t.holding_days, 0);
      const avgHoldDaysB = countB > 0 ? (totalHoldDaysB / countB) : 0;

      const totalInvestedB = tradesB.reduce((sum, t) => sum + (t.quantity * t.buy_price), 0);
      const totalQtyB = tradesB.reduce((sum, t) => sum + t.quantity, 0);
      const avgBuyPriceB = totalQtyB > 0 ? (totalInvestedB / totalQtyB) : 0;
      const totalRevenueB = tradesB.reduce((sum, t) => sum + (t.quantity * t.sell_price), 0);
      const avgSellPriceB = totalQtyB > 0 ? (totalRevenueB / totalQtyB) : 0;
      const returnPercentB = totalInvestedB > 0 ? (pnlB / totalInvestedB) * 100 : 0;

      // Query Gemini for Head-to-Head stock analysis
      const apiKey = process.env.GEMINI_API_KEY;
      const isMockAI = !apiKey || apiKey === 'your_gemini_api_key_here';

      let coachReport = "";

      if (!isMockAI) {
        try {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

          const prompt = `You are a premium trading psychologist and portfolio risk coach. Provide an advanced head-to-head behavioral and profit comparison between stock "${symA}" and stock "${symB}" based on these metrics:

### Stock A (${symA}):
- Total Invested Amount: ₹${totalInvestedA.toFixed(2)}
- Average Buy Price: ₹${avgBuyPriceA.toFixed(2)}
- Average Sell Price: ₹${avgSellPriceA.toFixed(2)}
- Net Realized P&L: ₹${pnlA.toFixed(2)}
- Return Percentage (ROI %): ${returnPercentA.toFixed(2)}%
- Total Trades Closed: ${countA}
- Win Rate: ${winRateA.toFixed(1)}% (${winsA} wins, ${countA - winsA} losses)
- Average Holding Days: ${avgHoldDaysA.toFixed(1)} days

### Stock B (${symB}):
- Total Invested Amount: ₹${totalInvestedB.toFixed(2)}
- Average Buy Price: ₹${avgBuyPriceB.toFixed(2)}
- Average Sell Price: ₹${avgSellPriceB.toFixed(2)}
- Net Realized P&L: ₹${pnlB.toFixed(2)}
- Return Percentage (ROI %): ${returnPercentB.toFixed(2)}%
- Total Trades Closed: ${countB}
- Win Rate: ${winRateB.toFixed(1)}% (${winsB} wins, ${countB - winsB} losses)
- Average Holding Days: ${avgHoldDaysB.toFixed(1)} days

Write a detailed, analytical comparative report in markdown. Detail the analysis under these specific headers:
1. ### 📊 Comparative Metrics Table
   Start the report with a clean markdown table summarizing all these metrics side-by-side for ${symA} and ${symB}.
2. ### ⚔️ Profitability & Win Rate Comparison
   Compare the net realized profit/loss, return percentage (ROI), and winning percentages of both stocks.
3. ### ⏳ Holding Period Efficiency
   Analyze the difference in average holding times and capital turnaround. Check if the user is holding their losers too long in one stock compared to the other.
4. ### 📈 Execution Discipline & Capital Efficiency
   Evaluate which stock had better capital efficiency (more gains with lower invested capital, better average buy-to-sell margins, or fewer trades).
5. ### 🧠 Psychological Takeaways & Action Rules
   Detail 2 trading psychology rules customized to these stocks (e.g. "Ride wins on ${pnlA > pnlB ? symA : symB} longer", "Cut losses earlier on ${pnlA > pnlB ? symB : symA}").

Keep the markdown clean, professional, and directly actionable. Use bullet points and warning callouts if relevant.`;

          const result = await model.generateContent(prompt);
          coachReport = result.response.text();
        } catch (err) {
          console.error('[AnalyticsRoute] Head-to-Head Gemini call failed:', err.message);
        }
      }

      if (!coachReport) {
        coachReport = `### 📊 Comparative Metrics Table

| Performance Metric | Stock A (${symA}) | Stock B (${symB}) |
| :--- | :---: | :---: |
| **Total Invested** | ₹${totalInvestedA.toLocaleString('en-IN', { maximumFractionDigits: 2 })} | ₹${totalInvestedB.toLocaleString('en-IN', { maximumFractionDigits: 2 })} |
| **Realized P&L** | **${pnlA >= 0 ? '+' : ''}₹${pnlA.toLocaleString('en-IN', { maximumFractionDigits: 2 })}** | **${pnlB >= 0 ? '+' : ''}₹${pnlB.toLocaleString('en-IN', { maximumFractionDigits: 2 })}** |
| **Return (ROI %)** | **${returnPercentA.toFixed(2)}%** | **${returnPercentB.toFixed(2)}%** |
| **Average Buy Price** | ₹${avgBuyPriceA.toFixed(2)} | ₹${avgBuyPriceB.toFixed(2)} |
| **Average Sell Price** | ₹${avgSellPriceA.toFixed(2)} | ₹${avgSellPriceB.toFixed(2)} |
| **Closed Trades** | ${countA} | ${countB} |
| **Win Rate** | ${winRateA.toFixed(0)}% | ${winRateB.toFixed(0)}% |
| **Avg Hold Duration** | ${avgHoldDaysA.toFixed(1)} days | ${avgHoldDaysB.toFixed(1)} days |

### ⚔️ Profitability & Win Rate Comparison
* **${symA}** realized a net P&L of **${pnlA >= 0 ? '+' : ''}₹${pnlA.toLocaleString('en-IN')}** with an ROI of **${returnPercentA.toFixed(2)}%** across **${countA} trades**.
* **${symB}** realized a net P&L of **${pnlB >= 0 ? '+' : ''}₹${pnlB.toLocaleString('en-IN')}** with an ROI of **${returnPercentB.toFixed(2)}%** across **${countB} trades**.
* **P&L Difference:** **₹${Math.abs(pnlA - pnlB).toLocaleString('en-IN')}** in favor of **${pnlA > pnlB ? symA : symB}**.

### ⏳ Holding Period Efficiency
* Average holding days for **${symA}**: **${avgHoldDaysA.toFixed(1)} days**.
* Average holding days for **${symB}**: **${avgHoldDaysB.toFixed(1)} days**.
* **Hold Time Variance:** You held **${avgHoldDaysA > avgHoldDaysB ? symA : symB}** on average **${Math.abs(avgHoldDaysA - avgHoldDaysB).toFixed(1)} days longer** per trade than **${avgHoldDaysA > avgHoldDaysB ? symB : symA}**.

### 📈 Execution Discipline & Capital Efficiency
* **Capital Velocity:** ${pnlA > pnlB && avgHoldDaysA < avgHoldDaysB
  ? `**${symA}** is significantly more capital efficient. It produced higher returns (ROI of ${returnPercentA.toFixed(1)}%) while holding capital for less time on average.`
  : pnlB > pnlA && avgHoldDaysB < avgHoldDaysA
  ? `**${symB}** is significantly more capital efficient. It produced higher returns (ROI of ${returnPercentB.toFixed(1)}%) while holding capital for less time on average.`
  : `Both stocks present different trading velocities. Evaluate if the longer hold duration on **${avgHoldDaysA > avgHoldDaysB ? symA : symB}** is justified by its P&L contributions.`
}

### 🧠 Psychological Takeaways & Action Rules
1. **Optimize size scaling:** Allocate higher size triggers to **${pnlA > pnlB ? symA : symB}** which is showing stronger win rates and returns.
2. **Apply exit timers:** Trim down holding times on **${pnlA > pnlB ? symB : symA}** to prevent dead capital buildup.`;
      }

      return res.json({ report: coachReport });
    }

    // 3. Compile comparative metrics
    // Stock-wise P&L aggregation
    const stockStats = {};
    let winnerDays = 0, winnerCount = 0;
    let loserDays = 0, loserCount = 0;

    filteredClosed.forEach(t => {
      const sym = t.stock_symbol;
      if (!stockStats[sym]) {
        stockStats[sym] = {
          symbol: sym,
          pnl: 0,
          trades: 0,
          wins: 0,
          losses: 0,
          holdDays: 0,
        };
      }
      const stat = stockStats[sym];
      stat.pnl += t.realized_pnl;
      stat.trades += 1;
      stat.holdDays += t.holding_days;
      
      if (t.realized_pnl > 0) {
        stat.wins += 1;
        winnerDays += t.holding_days;
        winnerCount += 1;
      } else {
        stat.losses += 1;
        loserDays += t.holding_days;
        loserCount += 1;
      }
    });

    const stockList = Object.values(stockStats);
    stockList.sort((a, b) => b.pnl - a.pnl);

    const winners = stockList.filter(s => s.pnl > 0);
    const losers = stockList.filter(s => s.pnl < 0);

    const topWinners = winners.slice(0, 3);
    const topLosers = losers.slice(-3).reverse(); // highest losses

    const avgWinnerHold = winnerCount > 0 ? (winnerDays / winnerCount) : 0;
    const avgLoserHold = loserCount > 0 ? (loserDays / loserCount) : 0;

    // MoM realized P&L
    const momPnL = {};
    filteredClosed.forEach(t => {
      const date = new Date(t.sell_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      momPnL[key] = (momPnL[key] || 0) + t.realized_pnl;
    });
    const momList = Object.entries(momPnL).map(([month, pnl]) => ({ month, pnl })).sort((a, b) => a.month.localeCompare(b.month));

    // 80/20 driver check
    const totalProfits = winners.reduce((sum, w) => sum + w.pnl, 0);
    const totalLosses = losers.reduce((sum, l) => sum + l.pnl, 0);
    const netPnL = totalProfits + totalLosses;

    // Check concentration
    let accumulatedProfit = 0;
    let driverCount = 0;
    for (const w of winners) {
      accumulatedProfit += w.pnl;
      driverCount++;
      if (accumulatedProfit >= totalProfits * 0.8) break;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const isMockAI = !apiKey || apiKey === 'your_gemini_api_key_here';

    let coachReport = "";

    if (!isMockAI) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const prompt = `You are a premium trading psychologist and risk manager. Analyze the following behavioral trade ledger audit comparison for a retail user:

## Overall Metrics:
- Net Realized P&L: ₹${netPnL.toFixed(2)} (Total Profits: ₹${totalProfits.toFixed(2)} | Total Losses: ₹${totalLosses.toFixed(2)})
- Total Closed Trades: ${filteredClosed.length}
- Average Winner Hold Duration: ${avgWinnerHold.toFixed(1)} days
- Average Loser Hold Duration: ${avgLoserHold.toFixed(1)} days

## Concentration Metrics (80/20 Driver):
- ${driverCount} out of ${winners.length} profitable stocks contribute 80%+ of total profits (₹${accumulatedProfit.toFixed(2)} out of ₹${totalProfits.toFixed(2)}).

## Top 3 Profitable Stocks:
${topWinners.map(w => `- **${w.symbol}**: Net P&L: ₹${w.pnl.toFixed(2)}, Trades: ${w.trades}, Win Rate: ${((w.wins / w.trades) * 100).toFixed(0)}%, Avg Hold: ${(w.holdDays / w.trades).toFixed(1)} days`).join('\n')}

## Top 3 Loss-Making Stocks:
${topLosers.map(l => `- **${l.symbol}**: Net P&L: ₹${l.pnl.toFixed(2)}, Trades: ${l.trades}, Loss Rate: ${((l.losses / l.trades) * 100).toFixed(0)}%, Avg Hold: ${(l.holdDays / l.trades).toFixed(1)} days`).join('\n')}

## Month-on-Month Trends:
${momList.map(m => `- **${m.month}**: Realized P&L: ₹${m.pnl.toFixed(2)}`).join('\n')}

Write a detailed, advanced behavioral comparison report in markdown. Detail the analysis under these specific headers:
1. ### 📊 Profit Concentration (80/20 Rule Analysis)
   Analyze if their profits are highly concentrated in a few stocks or distributed, and the implications.
2. ### ⏳ Holding Period Bias (Winners vs. Losers)
   Compare the winner vs loser holding times. Identify if they cut winners early and hold losers too long (Disposition Effect).
3. ### 📈 Period-Wise Performance Trends
   Analyze the Month-on-Month realized P&L trajectory. Highlight whether consistency is improving.
4. ### 🧠 Psychological Profile & Coach Recommendations
   Provide a brief diagnostic summary and 3 advanced behavioral rules to enforce.

Keep the markdown extremely clean, professional, and analytical. Use formatting like bullet points, tables, or alerts where appropriate.`;

        const result = await model.generateContent(prompt);
        coachReport = result.response.text();
      } catch (err) {
        console.error('[AnalyticsRoute] PnL Comparison Gemini call failed:', err.message);
      }
    }

    if (!coachReport) {
      // Programmatic fallbacks
      coachReport = `### 📊 Profit Concentration (80/20 Rule Analysis)
Your profits are highly concentrated. **${driverCount} stock(s)** contributed to 80% of your total profitable trades. This concentration highlights your core profit drivers (specifically ${topWinners.map(w => w.symbol).join(', ') || 'N/A'}). While concentration amplifies gains, it also increases dependency. Ensure these drivers are backed by long-term fundamental business conviction.

### ⏳ Holding Period Bias (Winners vs. Losers)
* **Average Win Hold Time:** ${avgWinnerHold.toFixed(1)} days
* **Average Loss Hold Time:** ${avgLoserHold.toFixed(1)} days
${avgLoserHold > avgWinnerHold 
  ? `> [!WARNING]
  > **Disposition Effect Detected:** You hold losing positions on average **${(avgLoserHold - avgWinnerHold).toFixed(1)} days longer** than winning positions. This shows a tendency to ride losers hoping they recover while cutting winners short to secure quick gains. Enforce strict exit timers.`
  : `> [!NOTE]
  > **Disciplined Exits:** Your average loss holding time is shorter than or equal to wins. You are successfully cutting losses quickly. Excellent discipline!`
}

### 📈 Period-Wise Performance Trends
Looking at your Month-on-Month trajectory:
${momList.map(m => `- **${m.month}**: Realized P&L of **${m.pnl >= 0 ? '+' : ''}₹${m.pnl.toLocaleString('en-IN')}**`).join('\n')}

Your most successful period was **${momList.reduce((max, cur) => cur.pnl > max.pnl ? cur : max, { month: 'N/A', pnl: -Infinity }).month}**, which indicates high market alignment.

### 🧠 Psychological Profile & Coach Recommendations
1. **Enforce standard position trailing stop-losses:** Never allow a single trade's losses to wipe out gains from 3 winners.
2. **Standardize hold rules:** When a winner hits your trigger, take partial profit (e.g. 50%) and set the remainder's stop-loss to cost basis to let wins ride risk-free.
3. **Audit turnover:** Focus on increasing the win rate of your top traded stocks instead of over-diversifying.`;
    }

    res.json({ report: coachReport });
  } catch (err) {
    console.error('[AnalyticsRoute] PnL Comparison error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;

