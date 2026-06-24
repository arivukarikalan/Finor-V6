import { supabase } from '../config/supabase.js';
import { calculateRealizedPnL } from './fifoCalculator.js';
import { getNiftyDailyChanges, getStockDailyPrices, getISTDateKey } from './yahooFinance.js';
import { getAllStockSettings } from './stockSettings.js';

/**
 * Main orchestrator for calculating all trading insights.
 */
export async function computeInsightsReport(userId, filters = {}) {
  const { 
    viewMode = 'ALL_TIME', 
    startDate, 
    endDate, 
    coreHoldSplitRatio = 80, 
    reentryDipPct = -10,
    symbol
  } = filters;

  const splitRatio = parseFloat(coreHoldSplitRatio) / 100;
  const dipRatio = 1 + (parseFloat(reentryDipPct) / 100);

  // 1. Fetch trades, holdings, and settings
  const { data: fetchedTrades, error: tradesErr } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('trade_date', { ascending: true });

  if (tradesErr) throw tradesErr;

  const { data: fetchedHoldings, error: holdingsErr } = await supabase
    .from('holdings')
    .select('*')
    .eq('user_id', userId);

  if (holdingsErr) throw holdingsErr;

  const stockSettings = await getAllStockSettings(userId);

  if (!fetchedTrades || fetchedTrades.length === 0) {
    return {
      emptyState: true,
      message: 'Not enough trade history yet. Insights will appear once you have 5 or more completed trades.',
      disciplineScore: 100,
      grade: 'A',
      gradeMeaning: 'Strong discipline. Very few rule violations.',
      winRate: 0,
      avgWinnerHold: 0,
      avgLoserHold: 0,
      bestMonth: null,
      worstMonth: null,
      targetHitRate: 0,
      realizedPnL: 0,
      closedTradesCount: 0,
      averagingScore: 100,
      violationsCount: 0,
      monthlyPatterns: []
    };
  }

  // Calculate total closed trades across all stocks to check eligibility
  const totalPnlData = calculateRealizedPnL(fetchedTrades);
  const totalClosedTradesCount = totalPnlData.closed_trades.length;

  if (totalClosedTradesCount < 5) {
    return {
      emptyState: true,
      message: 'Not enough trade history yet. Insights will appear once you have 5 or more completed trades.',
      disciplineScore: 100,
      grade: 'A',
      gradeMeaning: 'Strong discipline. Very few rule violations.',
      winRate: 0,
      avgWinnerHold: 0,
      avgLoserHold: 0,
      bestMonth: null,
      worstMonth: null,
      targetHitRate: 0,
      realizedPnL: 0,
      closedTradesCount: 0,
      averagingScore: 100,
      violationsCount: 0,
      monthlyPatterns: []
    };
  }

  // Filter trades and holdings by symbol if a specific one is selected
  let trades = fetchedTrades;
  let holdings = fetchedHoldings || [];
  if (symbol && symbol !== 'ALL' && symbol.trim() !== '') {
    const symUpper = symbol.toUpperCase().trim();
    trades = trades.filter(t => t.stock_symbol.toUpperCase() === symUpper);
    holdings = holdings.filter(h => h.stock_symbol.toUpperCase() === symUpper);
  }

  // 2. Extract unique symbols
  const symbols = [...new Set(trades.map(t => t.stock_symbol))];

  // 3. Fetch Nifty changes and daily prices for all symbols in parallel
  const [niftyChanges, ...stockPricesList] = await Promise.all([
    getNiftyDailyChanges(),
    ...symbols.map(sym => getStockDailyPrices(sym).then(prices => ({ sym, prices })))
  ]);

  const stockPricesMap = {};
  for (const item of stockPricesList) {
    stockPricesMap[item.sym] = item.prices;
  }

  // 4. Calculate FIFO Realized P&L
  const pnlData = calculateRealizedPnL(trades);
  const allClosedTrades = pnlData.closed_trades; // Sorted descending by sell_date

  // 5. Apply time filters to closed trades
  let filteredClosedTrades = [...allClosedTrades];
  const now = new Date();

  // Helper to check if a date fits the filter
  const isDateInFilter = (dateStr) => {
    const d = new Date(dateStr);
    if (viewMode === 'THIS_YEAR') {
      return d.getFullYear() === now.getFullYear();
    } else if (viewMode === 'LAST_90_DAYS') {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(now.getDate() - 90);
      return d >= ninetyDaysAgo;
    } else if (viewMode === 'THIS_MONTH') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    } else if (viewMode === 'CUSTOM') {
      if (startDate && endDate) {
        return d >= new Date(startDate) && d <= new Date(endDate);
      }
    }
    return true; // ALL_TIME
  };

  filteredClosedTrades = allClosedTrades.filter(t => isDateInFilter(t.sell_date));

  // 6. Calculate tranches and averaging discipline for active holdings
  const averagingDetails = [];
  let compliantCount = 0;
  let totalWithTwoPlusBuys = 0;
  
  // Trace current active buy lots queue by symbol
  const activeQueues = {}; // symbol -> array of active buy lots
  for (const t of trades) {
    const sym = t.stock_symbol;
    if (t.trade_type === 'BUY') {
      if (!activeQueues[sym]) activeQueues[sym] = [];
      activeQueues[sym].push({
        quantity: t.quantity,
        price: parseFloat(t.price),
        date: new Date(t.trade_date)
      });
    } else if (t.trade_type === 'SELL') {
      let sellQty = t.quantity;
      const q = activeQueues[sym] || [];
      while (sellQty > 0 && q.length > 0) {
        const earliest = q[0];
        const match = Math.min(sellQty, earliest.quantity);
        earliest.quantity -= match;
        sellQty -= match;
        if (earliest.quantity === 0) {
          q.shift();
        }
      }
    }
  }

  // Check compliance for each holding stock
  for (const hold of holdings) {
    const sym = hold.stock_symbol;
    const activeLots = activeQueues[sym] || [];
    const settings = stockSettings[sym] || { stoploss_price: null, position_tag: 'TRADING' };

    let badge = 'Compliant';
    let timeline = [];
    let avgScore = 20; // local categories points
    let gapViolations = 0;
    let overAveraged = false;
    let avgDownTooDeep = false;

    if (activeLots.length > 0) {
      const firstBuyPrice = activeLots[0].price;

      for (let i = 0; i < activeLots.length; i++) {
        const current = activeLots[i];
        let reqGap = '-';
        let actGap = '-';
        let lotStatus = 'Compliant';

        if (i === 1) {
          reqGap = '7% to 10%';
          const drop = ((firstBuyPrice - current.price) / firstBuyPrice) * 100;
          actGap = drop.toFixed(1) + '%';
          if (drop < 7) {
            lotStatus = 'Gap too small';
            gapViolations++;
          }
          if (drop >= 30) {
            lotStatus = 'Averaging after -30%';
            avgDownTooDeep = true;
          }
        } else if (i === 2) {
          reqGap = '10% to 15%';
          // average price of 1 and 2
          const avg12 = (activeLots[0].quantity * activeLots[0].price + activeLots[1].quantity * activeLots[1].price) / (activeLots[0].quantity + activeLots[1].quantity);
          const drop = ((avg12 - current.price) / avg12) * 100;
          actGap = drop.toFixed(1) + '%';
          if (drop < 10) {
            lotStatus = 'Gap too small';
            gapViolations++;
          }
          if (((firstBuyPrice - current.price) / firstBuyPrice) * 100 >= 30) {
            lotStatus = 'Averaging after -30%';
            avgDownTooDeep = true;
          }
        } else if (i >= 3) {
          lotStatus = 'Violation (4th+ buy)';
          overAveraged = true;
        }

        timeline.push({
          tranche: i + 1,
          date: current.date.toISOString(),
          qty: current.quantity,
          price: current.price,
          requiredGap: reqGap,
          actualGap: actGap,
          status: lotStatus
        });
      }

      if (overAveraged || avgDownTooDeep) {
        badge = 'Violation';
      } else if (gapViolations > 0) {
        badge = 'Warning';
      }

      if (activeLots.length >= 2) {
        totalWithTwoPlusBuys++;
        if (badge === 'Compliant') {
          compliantCount++;
        }
      }
    }

    averagingDetails.push({
      symbol: sym,
      name: hold.stock_name || sym,
      badge,
      timeline,
      average_buy_price: hold.average_buy_price,
      quantity: hold.quantity,
      ltp: hold.ltp,
      settings
    });
  }

  const averagingScore = totalWithTwoPlusBuys > 0 ? Math.round((compliantCount / totalWithTwoPlusBuys) * 100) : 100;

  // 7. Exit Discipline Audit
  const considerExits = [];
  let weakStocksHeldCount = 0;
  for (const hold of holdings) {
    const sym = hold.stock_symbol;
    const activeLots = activeQueues[sym] || [];
    if (activeLots.length === 0) continue;

    const firstBuyDate = activeLots[0].date;
    const holdingDays = Math.max(0, Math.ceil((now.getTime() - firstBuyDate.getTime()) / (1000 * 60 * 60 * 24)));
    const priceDropPct = ((hold.average_buy_price - hold.ltp) / hold.average_buy_price) * 100;

    // Check news api results for negative words
    const newsArticles = stockPricesMap[sym]?.news_content || []; // actually from cache
    let hasNegativeNews = false;
    const negativeKeywords = ['weak', 'decline', 'fall', 'drop', 'loss', 'poor', 'miss', 'negative', 'down', 'disappoint', 'slump'];
    
    // We can also fetch the news articles cached for this symbol
    const { data: cachedNews } = await supabase
      .from('news_cache')
      .select('news_content')
      .eq('stock_symbol', sym)
      .maybeSingle();

    if (cachedNews && cachedNews.news_content) {
      const articles = Array.isArray(cachedNews.news_content) ? cachedNews.news_content : [];
      for (const art of articles) {
        const text = ((art.title || '') + ' ' + (art.description || '')).toLowerCase();
        if (negativeKeywords.some(kw => text.includes(kw))) {
          hasNegativeNews = true;
          break;
        }
      }
    }

    const isWeakPrice = priceDropPct >= 30;
    const isWeakDuration = holdingDays >= 90;

    if (isWeakPrice && isWeakDuration && hasNegativeNews) {
      weakStocksHeldCount++;
      considerExits.push({
        symbol: sym,
        name: hold.stock_name || sym,
        avgPrice: hold.average_buy_price,
        ltp: hold.ltp,
        drop: priceDropPct.toFixed(1) + '%',
        days: holdingDays,
        reason: `Down ${priceDropPct.toFixed(1)}% over ${holdingDays} days with weak fundamental news signals.`
      });
    }
  }

  // Panic Sell Detection inside closed trades
  let panicSellsCount = 0;
  const processedClosedTrades = filteredClosedTrades.map(trade => {
    const sym = trade.stock_symbol;
    const settings = stockSettings[sym] || { stoploss_price: null, position_tag: 'TRADING' };
    const sellDateKey = getISTDateKey(trade.sell_date);
    const niftyChg = niftyChanges[sellDateKey] !== undefined ? niftyChanges[sellDateKey] : 0;
    const isMarketRed = niftyChg <= -1.5;

    // Check if exit price is above stoploss price
    const hasStoploss = settings.stoploss_price !== null;
    const exitedAboveStoploss = hasStoploss && trade.sell_price > settings.stoploss_price;
    const isLoss = trade.realized_pnl < 0;

    const isPanicSell = isMarketRed && exitedAboveStoploss && isLoss;
    if (isPanicSell) {
      panicSellsCount++;
    }

    // Check target hit confirmation
    // Classification
    const holdingDays = trade.holding_days;
    let classification = 'Slow / Steady';
    let targetMin = 8;
    let targetMax = 9;

    if (settings.position_tag === 'CORE_HOLD') {
      classification = 'Core Hold';
      targetMin = 0; // no fixed target
      targetMax = 999;
    } else {
      // check if it ran 10%+ in buy week or held < 30 days
      const isShort = holdingDays < 30;
      if (isShort) {
        classification = 'Bounce / Momentum';
        targetMin = 15;
        targetMax = 999;
      }
    }

    const returnPct = ((trade.sell_price - trade.buy_price) / trade.buy_price) * 100;
    let isTargetHit = false;
    if (classification === 'Bounce / Momentum') {
      isTargetHit = returnPct >= 15;
    } else if (classification === 'Slow / Steady') {
      isTargetHit = returnPct >= 8; // returns within target range (8-9% or above)
    } else if (classification === 'Core Hold') {
      isTargetHit = returnPct >= 10; // arbitrary target for core hold
    }

    // Check Sold Too Early (10 days post exit)
    let postPrice = null;
    let postDiffPct = 0;
    let isEarlyExit = false;

    const dailyPrices = stockPricesMap[sym] || {};
    const sellMs = new Date(trade.sell_date).getTime();
    const tenDaysLater = new Date(sellMs + 10 * 24 * 60 * 60 * 1000);
    
    // Look for price between 10 and 15 days later
    for (let offset = 0; offset <= 5; offset++) {
      const checkDate = new Date(tenDaysLater.getTime() + offset * 24 * 60 * 60 * 1000);
      const checkKey = getISTDateKey(checkDate);
      if (dailyPrices[checkKey]) {
        postPrice = dailyPrices[checkKey];
        postDiffPct = ((postPrice - trade.sell_price) / trade.sell_price) * 100;
        break;
      }
    }

    if (postPrice && postDiffPct > 5) {
      isEarlyExit = true;
    }

    // Calculate annualized return
    // Annualised Return = ((1 + Return%) ^ (365 / Holding Days) - 1) * 100
    let annualizedReturn = 0;
    if (holdingDays > 0 && returnPct > -99) {
      annualizedReturn = (Math.pow(1 + (returnPct / 100), 365 / holdingDays) - 1) * 100;
      // Cap extremes
      if (annualizedReturn > 5000) annualizedReturn = 5000;
      if (annualizedReturn < -100) annualizedReturn = -100;
    }

    return {
      ...trade,
      return_pct: parseFloat(returnPct.toFixed(2)),
      annualized_return: parseFloat(annualizedReturn.toFixed(2)),
      nifty_change: niftyChg,
      is_panic_sell: isPanicSell,
      is_target_hit: isTargetHit,
      is_early_exit: isEarlyExit,
      post_exit_price: postPrice,
      post_exit_change: postPrice ? parseFloat(postDiffPct.toFixed(2)) : null,
      classification
    };
  });

  // 8. Profit Booking Metrics
  const targetHitTrades = processedClosedTrades.filter(t => t.is_target_hit);
  const targetHitRate = processedClosedTrades.length > 0 ? Math.round((targetHitTrades.length / processedClosedTrades.length) * 100) : 0;

  const earlyExitsCount = processedClosedTrades.filter(t => t.is_early_exit).length;
  
  // Calculate average annualized return across closed trades
  const avgAnnualizedReturn = processedClosedTrades.length > 0 
    ? processedClosedTrades.reduce((a, b) => a + b.annualized_return, 0) / processedClosedTrades.length 
    : 0;

  // 9. Long-Term planner Recommendations
  const longTermPlanner = [];
  for (const hold of holdings) {
    const sym = hold.stock_symbol;
    const settings = stockSettings[sym];
    if (settings && settings.position_tag === 'CORE_HOLD') {
      const returnPct = ((hold.ltp - hold.average_buy_price) / hold.average_buy_price) * 100;
      // Plan: book profit (sell splitRatio), hold core, set re-entry alert at dipRatio from current price
      const sellQty = Math.round(hold.quantity * splitRatio);
      const holdQty = hold.quantity - sellQty;
      const reentryLevel = parseFloat((hold.ltp * dipRatio).toFixed(2)); // alert level
      longTermPlanner.push({
        symbol: sym,
        name: hold.stock_name || sym,
        qty: hold.quantity,
        ltp: hold.ltp,
        return: parseFloat(returnPct.toFixed(1)),
        sellQty,
        holdQty,
        reentryLevel
      });
    }
  }

  // 10. Behavioural Pattern Detection
  let revengeBuysCount = 0;
  let fomoEntriesCount = 0;

  // Scan all BUY trades in the filtered period
  const filteredTrades = trades.filter(t => isDateInFilter(t.trade_date));
  
  // Map to store loss exit dates for revenge buy check
  // symbol -> array of { date: Date, loss: number }
  const lossExits = {};
  allClosedTrades.forEach(ct => {
    if (ct.realized_pnl < 0) {
      if (!lossExits[ct.stock_symbol]) lossExits[ct.stock_symbol] = [];
      lossExits[ct.stock_symbol].push(new Date(ct.sell_date));
    }
  });

  const auditedBuys = filteredTrades.filter(t => t.trade_type === 'BUY').map(buy => {
    const sym = buy.stock_symbol;
    const buyDate = new Date(buy.trade_date);
    
    // Revenge Buy: Re-bought same stock within 7 days of a loss-exit
    let isRevenge = false;
    const exits = lossExits[sym] || [];
    for (const exitDate of exits) {
      const diffDays = (buyDate.getTime() - exitDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays <= 7) {
        isRevenge = true;
        revengeBuysCount++;
        break;
      }
    }

    // FOMO Entry: stock run up >= 10% in preceding 5 days
    let isFOMO = false;
    const dailyPrices = stockPricesMap[sym] || {};
    
    // Get price on buy day vs 5 days before
    const buyKey = getISTDateKey(buyDate);
    const fiveDaysBefore = new Date(buyDate.getTime() - 5 * 24 * 60 * 60 * 1000);
    let startPrice = null;
    let endPrice = dailyPrices[buyKey] || buy.price;

    for (let offset = 0; offset <= 3; offset++) {
      const checkDate = new Date(fiveDaysBefore.getTime() + offset * 24 * 60 * 60 * 1000);
      const checkKey = getISTDateKey(checkDate);
      if (dailyPrices[checkKey]) {
        startPrice = dailyPrices[checkKey];
        break;
      }
    }

    if (startPrice && endPrice) {
      const preRunPct = ((endPrice - startPrice) / startPrice) * 100;
      if (preRunPct >= 10) {
        isFOMO = true;
        fomoEntriesCount++;
      }
    }

    return {
      ...buy,
      is_revenge: isRevenge,
      is_fomo: isFOMO
    };
  });

  // Over-averaging counts (4th or more buy)
  let overAveragingCount = 0;
  averagingDetails.forEach(ad => {
    if (ad.timeline.length >= 4) {
      overAveragingCount++;
    }
  });

  // Calculate monthly patterns aggregate
  const patternsByMonth = {}; // monthKey -> { revenge, fomo, overAvg, panic, early }
  
  // Initialize with last 6 months to make chart look good
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(now.getMonth() - i);
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    patternsByMonth[label] = { revenge: 0, fomo: 0, overAvg: 0, panic: 0, early: 0 };
  }

  // Populate counts from historical evaluations
  // Closed trades patterns (Panic sell & Early exit)
  processedClosedTrades.forEach(t => {
    const d = new Date(t.sell_date);
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    if (!patternsByMonth[label]) {
      patternsByMonth[label] = { revenge: 0, fomo: 0, overAvg: 0, panic: 0, early: 0 };
    }
    if (t.is_panic_sell) patternsByMonth[label].panic++;
    if (t.is_early_exit) patternsByMonth[label].early++;
  });

  // Buy trades patterns (Revenge, FOMO)
  auditedBuys.forEach(b => {
    const d = new Date(b.trade_date);
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    if (!patternsByMonth[label]) {
      patternsByMonth[label] = { revenge: 0, fomo: 0, overAvg: 0, panic: 0, early: 0 };
    }
    if (b.is_revenge) patternsByMonth[label].revenge++;
    if (b.is_fomo) patternsByMonth[label].fomo++;
  });

  // Over averaging patterns
  // We can attribute over-averaging to the month of the 4th buy
  holdings.forEach(hold => {
    const sym = hold.stock_symbol;
    const activeLots = activeQueues[sym] || [];
    if (activeLots.length >= 4) {
      const fourthBuy = activeLots[3];
      const d = new Date(fourthBuy.date);
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
      if (!patternsByMonth[label]) {
        patternsByMonth[label] = { revenge: 0, fomo: 0, overAvg: 0, panic: 0, early: 0 };
      }
      patternsByMonth[label].overAvg++;
    }
  });

  const monthlyPatterns = Object.entries(patternsByMonth).map(([month, data]) => ({
    month,
    ...data
  }));

  // Calculate Monthly P&L Trend (for chart)
  const monthlyPnL = {};
  // Initialize last 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(now.getMonth() - i);
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    monthlyPnL[label] = 0;
  }

  allClosedTrades.forEach(t => {
    const d = new Date(t.sell_date);
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    if (monthlyPnL[label] !== undefined) {
      monthlyPnL[label] += t.realized_pnl;
    } else {
      monthlyPnL[label] = t.realized_pnl;
    }
  });

  const monthlyPnLTrend = Object.entries(monthlyPnL).map(([month, pnl]) => ({
    month,
    pnl: parseFloat(pnl.toFixed(2))
  }));

  // Best/Worst Months
  const sortedMonths = Object.entries(monthlyPnL).map(([month, pnl]) => ({
    month,
    pnl: parseFloat(pnl.toFixed(2))
  })).sort((a, b) => b.pnl - a.pnl);

  const bestMonth = sortedMonths[0] && sortedMonths[0].pnl > 0 ? sortedMonths[0] : null;
  const worstMonth = sortedMonths[sortedMonths.length - 1] && sortedMonths[sortedMonths.length - 1].pnl < 0 ? sortedMonths[sortedMonths.length - 1] : null;

  // 11. Performance Key Metrics
  const winningTrades = processedClosedTrades.filter(t => t.realized_pnl > 0);
  const losingTrades = processedClosedTrades.filter(t => t.realized_pnl < 0);
  const winRate = processedClosedTrades.length > 0 ? (winningTrades.length / processedClosedTrades.length) * 100 : 0;

  const winningHolds = winningTrades.map(t => t.holding_days);
  const losingHolds = losingTrades.map(t => t.holding_days);
  const avgWinnerHold = winningHolds.length > 0 ? Math.round(winningHolds.reduce((a, b) => a + b, 0) / winningHolds.length) : 0;
  const avgLoserHold = losingHolds.length > 0 ? Math.round(losingHolds.reduce((a, b) => a + b, 0) / losingHolds.length) : 0;

  // Best and worst trades
  const sortedTradesByReturn = [...processedClosedTrades].sort((a, b) => b.return_pct - a.return_pct);
  const bestTrade = sortedTradesByReturn[0] ? {
    symbol: sortedTradesByReturn[0].stock_symbol,
    return: sortedTradesByReturn[0].return_pct
  } : null;
  const worstTrade = sortedTradesByReturn[sortedTradesByReturn.length - 1] ? {
    symbol: sortedTradesByReturn[sortedTradesByReturn.length - 1].stock_symbol,
    return: sortedTradesByReturn[sortedTradesByReturn.length - 1].return_pct
  } : null;

  // 12. COMPOSITE DISCIPLINE SCORE CALCULATION
  // Category scores (each out of 20)
  let avgScore = 20;
  // Ded: -5 per violation (4th buy, gap too small, averaging at -30%)
  let avgViolationsCount = 0;
  averagingDetails.forEach(ad => {
    ad.timeline.forEach(lot => {
      if (lot.status !== 'Compliant') {
        avgViolationsCount++;
      }
    });
  });
  avgScore = Math.max(0, 20 - avgViolationsCount * 5);

  let exitScore = 20;
  // Ded: -5 per weak stock held, -3 per panic sell
  exitScore = Math.max(0, 20 - (weakStocksHeldCount * 5 + panicSellsCount * 3));

  let bookingScore = 20;
  // Ded: -3 per early exit, +2 per target achieved
  // Let's calculate: base 20. subtract early exits.
  // Wait! "−3 per early exit below 5%, +2 per target achieved"
  // Let's implement exactly:
  const earlyExitsBelow5 = processedClosedTrades.filter(t => t.is_early_exit && t.return_pct < 5).length;
  bookingScore = Math.min(20, Math.max(0, 20 - (earlyExitsBelow5 * 3) + (targetHitTrades.length * 2)));

  let patternScore = 20;
  // Ded: -4 per revenge buy, -3 per FOMO entry
  patternScore = Math.max(0, 20 - (revengeBuysCount * 4 + fomoEntriesCount * 3));

  let planningScore = 20;
  // Ded: -5 per core hold stock with no plan set
  // We can count core hold stocks where stoploss_price is not set
  let coreHoldsNoPlan = 0;
  for (const hold of holdings) {
    const sym = hold.stock_symbol;
    const settings = stockSettings[sym];
    if (settings && settings.position_tag === 'CORE_HOLD' && settings.stoploss_price === null) {
      coreHoldsNoPlan++;
    }
  }
  planningScore = Math.max(0, 20 - (coreHoldsNoPlan * 5));

  const disciplineScore = avgScore + exitScore + bookingScore + patternScore + planningScore;

  // Grade Scale
  let grade = 'F';
  let gradeMeaning = 'Discipline is breaking down. Review all trades carefully.';
  if (disciplineScore >= 90) {
    grade = 'A';
    gradeMeaning = 'Excellent discipline. Very few rule violations.';
  } else if (disciplineScore >= 75) {
    grade = 'B';
    gradeMeaning = 'Good discipline with minor lapses.';
  } else if (disciplineScore >= 60) {
    grade = 'C';
    gradeMeaning = 'Several violations. Review and improve.';
  } else if (disciplineScore >= 45) {
    grade = 'D';
    gradeMeaning = 'Frequent violations. Significant improvement needed.';
  }

  const totalViolations = avgViolationsCount + weakStocksHeldCount + panicSellsCount + earlyExitsBelow5 + revengeBuysCount + fomoEntriesCount + coreHoldsNoPlan;

  return {
    emptyState: false,
    allSymbols: [...new Set(fetchedTrades.map(t => t.stock_symbol))].sort(),
    disciplineScore,
    grade,
    gradeMeaning,
    winRate,
    avgWinnerHold,
    avgLoserHold,
    bestMonth,
    worstMonth,
    bestTrade,
    worstTrade,
    targetHitRate,
    avgAnnualizedReturn: parseFloat(avgAnnualizedReturn.toFixed(2)),
    realizedPnL: pnlData.summary.total_realized_pnl,
    closedTradesCount: processedClosedTrades.length,
    averagingScore,
    violationsCount: totalViolations,
    averagingDetails,
    considerExits,
    panicSellsCount,
    earlyExitsCount,
    revengeBuysCount,
    fomoEntriesCount,
    longTermPlanner,
    monthlyPatterns,
    monthlyPnLTrend,
    closedTrades: processedClosedTrades.slice(0, 50), // Send top 50 recent trades
    categoryScores: {
      averaging: avgScore,
      exit: exitScore,
      booking: bookingScore,
      patterns: patternScore,
      planning: planningScore
    }
  };
}
