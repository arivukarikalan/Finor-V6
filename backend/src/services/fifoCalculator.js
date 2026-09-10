/**
 * Determines whether a given trading symbol represents a Futures or Options contract.
 * Accurately detects:
 * - Options: ITC26SEP270CE, DABUR26SEP385CE, NIFTY26MAR24000PE
 * - Futures: NIFTY26SEPFUT, TCS24NOVFUT
 * - Avoids false positives on equities like RELIANCE, REDTAPE, FORCE, LICI.
 * 
 * @param {string} symbol
 * @returns {boolean}
 */
export function isFnOSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  const s = symbol.trim().toUpperCase();
  // Options: ending with strike price digits followed by CE or PE (or index option symbols)
  if (/\d+(?:CE|PE)$/i.test(s)) return true;
  // Futures: ending with expiry month + FUT or general FUT
  if (/(?:FUT|\d{2}[A-Z]{3}FUT)$/i.test(s)) return true;
  // Index derivatives prefix with CE/PE/FUT
  if (/^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX).*(?:CE|PE|FUT)$/i.test(s)) return true;
  return false;
}

/**
 * Returns the derivative contract type or 'EQUITY'.
 * 
 * @param {string} symbol 
 * @returns {'OPTION_CE' | 'OPTION_PE' | 'FUTURES' | 'EQUITY'}
 */
export function getContractType(symbol) {
  if (!symbol || typeof symbol !== 'string') return 'EQUITY';
  const s = symbol.trim().toUpperCase();
  if (/\d+CE$/i.test(s) || (s.endsWith('CE') && isFnOSymbol(s))) return 'OPTION_CE';
  if (/\d+PE$/i.test(s) || (s.endsWith('PE') && isFnOSymbol(s))) return 'OPTION_PE';
  if (/(?:FUT|\d{2}[A-Z]{3}FUT)$/i.test(s) || (s.endsWith('FUT') && isFnOSymbol(s))) return 'FUTURES';
  return 'EQUITY';
}

/**
 * Computes approximate Indian statutory trading charges & taxes for a closed trade.
 * Standard Zerodha / NSE statutory fee structure:
 * - Equity Delivery:
 *   - Brokerage: ₹0
 *   - STT: 0.1% on buy turnover + 0.1% on sell turnover (0.1% of total turnover)
 *   - Exchange Txn Charge: 0.00297% on total turnover
 *   - SEBI Charges: 0.0001% (₹10 per crore) on total turnover
 *   - Stamp Duty: 0.015% on buy turnover
 *   - GST: 18% on (Brokerage + Exchange Txn + SEBI)
 *   - DP Charges: ₹15.34 (₹13 + 18% GST) per sell transaction
 * 
 * - Equity Intraday (same calendar day buy & sell):
 *   - Brokerage: min(₹20, 0.03% * buyTurnover) + min(₹20, 0.03% * sellTurnover)
 *   - STT: 0.025% on sell turnover
 *   - Exchange Txn Charge: 0.00297% on total turnover
 *   - SEBI: 0.0001% on total turnover
 *   - Stamp Duty: 0.003% on buy turnover
 *   - GST: 18% on (Brokerage + Exchange Txn + SEBI)
 *   - DP Charges: ₹0
 * 
 * - F&O Options (CE / PE):
 *   - Brokerage: ₹20 buy leg + ₹20 sell leg = ₹40 flat round trip (capped at 2.5% of premium if turnover is very low)
 *   - STT: 0.1% on sell premium turnover
 *   - Exchange Txn Charge: 0.03503% on total premium turnover
 *   - SEBI: 0.0001% on total turnover
 *   - Stamp Duty: 0.003% on buy premium turnover
 *   - GST: 18% on (Brokerage + Exchange Txn + SEBI)
 *   - DP Charges: ₹0
 * 
 * - F&O Futures (FUT):
 *   - Brokerage: min(₹20, 0.03% * buyTurnover) + min(₹20, 0.03% * sellTurnover)
 *   - STT: 0.02% on sell turnover
 *   - Exchange Txn Charge: 0.00173% on total turnover
 *   - SEBI: 0.0001% on total turnover
 *   - Stamp Duty: 0.002% on buy turnover
 *   - GST: 18% on (Brokerage + Exchange Txn + SEBI)
 *   - DP Charges: ₹0
 */
export function calculateTradeCharges({
  stock_symbol,
  quantity,
  buy_price,
  sell_price,
  buy_date,
  sell_date
}) {
  const contractType = getContractType(stock_symbol);
  const buyTurnover = quantity * buy_price;
  const sellTurnover = quantity * sell_price;
  const totalTurnover = buyTurnover + sellTurnover;

  const buyDay = new Date(buy_date).toISOString().substring(0, 10);
  const sellDay = new Date(sell_date).toISOString().substring(0, 10);
  const isIntraday = buyDay === sellDay;

  let brokerage = 0;
  let stt = 0;
  let exchangeCharges = 0;
  let sebiCharges = 0;
  let stampDuty = 0;
  let dpCharges = 0;

  if (contractType === 'OPTION_CE' || contractType === 'OPTION_PE') {
    const buyBrok = Math.min(20, buyTurnover * 0.025);
    const sellBrok = Math.min(20, sellTurnover * 0.025);
    brokerage = buyBrok + sellBrok;
    stt = sellTurnover * 0.001; // 0.1% on sell side premium
    exchangeCharges = totalTurnover * 0.0003503; // 0.03503% on premium turnover
    sebiCharges = totalTurnover * 0.000001;
    stampDuty = buyTurnover * 0.00003; // 0.003% on buy premium
    dpCharges = 0;
  } else if (contractType === 'FUTURES') {
    brokerage = Math.min(20, buyTurnover * 0.0003) + Math.min(20, sellTurnover * 0.0003);
    stt = sellTurnover * 0.0002; // 0.02% on sell side
    exchangeCharges = totalTurnover * 0.0000173; // 0.00173% on turnover
    sebiCharges = totalTurnover * 0.000001;
    stampDuty = buyTurnover * 0.00002; // 0.002% on buy side
    dpCharges = 0;
  } else if (isIntraday) {
    brokerage = Math.min(20, buyTurnover * 0.0003) + Math.min(20, sellTurnover * 0.0003);
    stt = sellTurnover * 0.00025; // 0.025% on sell side
    exchangeCharges = totalTurnover * 0.0000297; // 0.00297%
    sebiCharges = totalTurnover * 0.000001;
    stampDuty = buyTurnover * 0.00003; // 0.003% on buy side
    dpCharges = 0;
  } else {
    brokerage = 0; // Zero delivery brokerage
    stt = totalTurnover * 0.001; // 0.1% on buy & sell turnover
    exchangeCharges = totalTurnover * 0.0000297; // 0.00297%
    sebiCharges = totalTurnover * 0.000001;
    stampDuty = buyTurnover * 0.00015; // 0.015% on buy turnover
    dpCharges = 15.34; // ₹13 + 18% GST per sell scrip
  }

  const gst = (brokerage + exchangeCharges + sebiCharges) * 0.18;
  const totalCharges = brokerage + stt + exchangeCharges + sebiCharges + stampDuty + gst + dpCharges;

  return {
    brokerage: parseFloat(brokerage.toFixed(2)),
    stt: parseFloat(stt.toFixed(2)),
    exchange_charges: parseFloat(exchangeCharges.toFixed(2)),
    sebi_charges: parseFloat(sebiCharges.toFixed(2)),
    stamp_duty: parseFloat(stampDuty.toFixed(2)),
    gst: parseFloat(gst.toFixed(2)),
    dp_charges: parseFloat(dpCharges.toFixed(2)),
    total_charges: parseFloat(totalCharges.toFixed(2))
  };
}

/**
 * Calculates realized P&L, statutory charges/taxes, net realized P&L,
 * and classifies capital gains (STCG/LTCG / F&O Business Income) using the FIFO method.
 * 
 * @param {Array} trades - List of trades sorted chronologically.
 * @returns {Object} Realized P&L statistics and closed trade records.
 */
export function calculateRealizedPnL(trades) {
  // Sort trades chronologically in memory, prioritizing BUY over SELL if timestamps are identical
  const sortedTrades = [...trades].sort((a, b) => {
    const timeA = new Date(a.trade_date).getTime();
    const timeB = new Date(b.trade_date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    const typeA = a.trade_type.toUpperCase();
    const typeB = b.trade_type.toUpperCase();
    if (typeA === 'BUY' && typeB === 'SELL') return -1;
    if (typeA === 'SELL' && typeB === 'BUY') return 1;
    return 0;
  });

  const buyQueues = {}; // key: symbol, value: Array of buy trades
  const closedTrades = []; // List of realized matchings

  for (const trade of sortedTrades) {
    const symbol = trade.stock_symbol;
    const type = trade.trade_type.toUpperCase();
    const qty = trade.quantity;
    const price = parseFloat(trade.price);
    const date = new Date(trade.trade_date);

    if (type === 'BUY') {
      if (!buyQueues[symbol]) {
        buyQueues[symbol] = [];
      }
      buyQueues[symbol].push({
        quantity: qty,
        price: price,
        date: date
      });
    } else if (type === 'SELL') {
      let sellQtyRemaining = qty;
      const queue = buyQueues[symbol] || [];

      while (sellQtyRemaining > 0 && queue.length > 0) {
        const earliestBuy = queue[0];
        const matchedQty = Math.min(sellQtyRemaining, earliestBuy.quantity);

        const buyCost = matchedQty * earliestBuy.price;
        const sellValue = matchedQty * price;
        const realizedGain = sellValue - buyCost;

        // Calculate holding duration
        const diffTime = date.getTime() - earliestBuy.date.getTime();
        const holdingDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        
        // Indian tax law: holding period <= 365 days is Short Term (STCG), > 365 is Long Term (LTCG)
        const isShortTerm = holdingDays <= 365;

        // Calculate estimated statutory charges & taxes for this closed trade
        const charges = calculateTradeCharges({
          stock_symbol: symbol,
          quantity: matchedQty,
          buy_price: earliestBuy.price,
          sell_price: price,
          buy_date: earliestBuy.date,
          sell_date: date
        });

        const isFnO = isFnOSymbol(symbol);
        const contractType = getContractType(symbol);
        const netRealized = parseFloat((realizedGain - charges.total_charges).toFixed(2));

        closedTrades.push({
          stock_symbol: symbol,
          buy_date: earliestBuy.date.toISOString(),
          sell_date: date.toISOString(),
          quantity: matchedQty,
          buy_price: earliestBuy.price,
          sell_price: price,
          realized_pnl: parseFloat(realizedGain.toFixed(2)),
          charges: charges,
          net_realized_pnl: netRealized,
          is_fno: isFnO,
          contract_type: contractType,
          holding_days: holdingDays,
          gains_type: isShortTerm ? 'STCG' : 'LTCG'
        });

        // Deduct quantity
        sellQtyRemaining -= matchedQty;
        earliestBuy.quantity -= matchedQty;

        if (earliestBuy.quantity === 0) {
          queue.shift(); // Remove fully matched buy from queue
        }
      }
    }
  }

  // Summary builder helper
  const createEmptySummary = () => ({
    total_realized_pnl: 0,
    net_realized_pnl: 0,
    total_charges: 0,
    stcg: 0,
    ltcg: 0,
    trades_count: 0,
    charges_breakdown: {
      brokerage: 0,
      stt: 0,
      exchange_charges: 0,
      sebi_charges: 0,
      stamp_duty: 0,
      gst: 0,
      dp_charges: 0
    }
  });

  const addToSummary = (sum, t) => {
    sum.total_realized_pnl += t.realized_pnl;
    sum.net_realized_pnl += t.net_realized_pnl;
    sum.total_charges += t.charges.total_charges;
    sum.trades_count += 1;
    if (t.gains_type === 'STCG') {
      sum.stcg += t.realized_pnl;
    } else {
      sum.ltcg += t.realized_pnl;
    }
    sum.charges_breakdown.brokerage += t.charges.brokerage;
    sum.charges_breakdown.stt += t.charges.stt;
    sum.charges_breakdown.exchange_charges += t.charges.exchange_charges;
    sum.charges_breakdown.sebi_charges += t.charges.sebi_charges;
    sum.charges_breakdown.stamp_duty += t.charges.stamp_duty;
    sum.charges_breakdown.gst += t.charges.gst;
    sum.charges_breakdown.dp_charges += t.charges.dp_charges;
  };

  const roundSummary = (sum) => ({
    total_realized_pnl: parseFloat(sum.total_realized_pnl.toFixed(2)),
    net_realized_pnl: parseFloat(sum.net_realized_pnl.toFixed(2)),
    total_charges: parseFloat(sum.total_charges.toFixed(2)),
    stcg: parseFloat(sum.stcg.toFixed(2)),
    ltcg: parseFloat(sum.ltcg.toFixed(2)),
    trades_count: sum.trades_count,
    charges_breakdown: {
      brokerage: parseFloat(sum.charges_breakdown.brokerage.toFixed(2)),
      stt: parseFloat(sum.charges_breakdown.stt.toFixed(2)),
      exchange_charges: parseFloat(sum.charges_breakdown.exchange_charges.toFixed(2)),
      sebi_charges: parseFloat(sum.charges_breakdown.sebi_charges.toFixed(2)),
      stamp_duty: parseFloat(sum.charges_breakdown.stamp_duty.toFixed(2)),
      gst: parseFloat(sum.charges_breakdown.gst.toFixed(2)),
      dp_charges: parseFloat(sum.charges_breakdown.dp_charges.toFixed(2))
    }
  });

  const overallSummary = createEmptySummary();
  const equitySummary = createEmptySummary();
  const fnoSummary = createEmptySummary();

  const stockWisePnL = {};

  for (const trade of closedTrades) {
    addToSummary(overallSummary, trade);
    if (trade.is_fno) {
      addToSummary(fnoSummary, trade);
    } else {
      addToSummary(equitySummary, trade);
    }

    const symbol = trade.stock_symbol;
    if (!stockWisePnL[symbol]) {
      stockWisePnL[symbol] = {
        stock_symbol: symbol,
        is_fno: trade.is_fno,
        contract_type: trade.contract_type,
        realized_pnl: 0,
        net_realized_pnl: 0,
        total_charges: 0,
        stcg: 0,
        ltcg: 0,
        quantity: 0
      };
    }
    const current = stockWisePnL[symbol];
    current.realized_pnl += trade.realized_pnl;
    current.net_realized_pnl += trade.net_realized_pnl;
    current.total_charges += trade.charges.total_charges;
    current.quantity += trade.quantity;
    if (trade.gains_type === 'STCG') {
      current.stcg += trade.realized_pnl;
    } else {
      current.ltcg += trade.realized_pnl;
    }
  }

  const sortedClosedTrades = closedTrades.sort((a, b) => new Date(b.sell_date).getTime() - new Date(a.sell_date).getTime());
  const equityClosedTrades = sortedClosedTrades.filter(t => !t.is_fno);
  const fnoClosedTrades = sortedClosedTrades.filter(t => t.is_fno);

  return {
    summary: roundSummary(overallSummary),
    equity_summary: roundSummary(equitySummary),
    fno_summary: roundSummary(fnoSummary),
    stock_wise: Object.values(stockWisePnL).map(s => ({
      ...s,
      realized_pnl: parseFloat(s.realized_pnl.toFixed(2)),
      net_realized_pnl: parseFloat(s.net_realized_pnl.toFixed(2)),
      total_charges: parseFloat(s.total_charges.toFixed(2)),
      stcg: parseFloat(s.stcg.toFixed(2)),
      ltcg: parseFloat(s.ltcg.toFixed(2))
    })),
    closed_trades: sortedClosedTrades,
    equity_closed_trades: equityClosedTrades,
    fno_closed_trades: fnoClosedTrades
  };
}

