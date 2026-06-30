/**
 * Calculates realized P&L and classifies capital gains (STCG/LTCG) using the FIFO method.
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

  let totalSTCG = 0;
  let totalLTCG = 0;
  let totalRealized = 0;

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

        if (isShortTerm) {
          totalSTCG += realizedGain;
        } else {
          totalLTCG += realizedGain;
        }
        totalRealized += realizedGain;

        closedTrades.push({
          stock_symbol: symbol,
          buy_date: earliestBuy.date.toISOString(),
          sell_date: date.toISOString(),
          quantity: matchedQty,
          buy_price: earliestBuy.price,
          sell_price: price,
          realized_pnl: parseFloat(realizedGain.toFixed(2)),
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

  // Stock-wise P&L calculations
  const stockWisePnL = {};
  for (const trade of closedTrades) {
    const symbol = trade.stock_symbol;
    if (!stockWisePnL[symbol]) {
      stockWisePnL[symbol] = {
        stock_symbol: symbol,
        realized_pnl: 0,
        stcg: 0,
        ltcg: 0,
        quantity: 0
      };
    }
    const current = stockWisePnL[symbol];
    current.realized_pnl += trade.realized_pnl;
    current.quantity += trade.quantity;
    if (trade.gains_type === 'STCG') {
      current.stcg += trade.realized_pnl;
    } else {
      current.ltcg += trade.realized_pnl;
    }
  }

  // Round values
  return {
    summary: {
      total_realized_pnl: parseFloat(totalRealized.toFixed(2)),
      stcg: parseFloat(totalSTCG.toFixed(2)),
      ltcg: parseFloat(totalLTCG.toFixed(2))
    },
    stock_wise: Object.values(stockWisePnL).map(s => ({
      ...s,
      realized_pnl: parseFloat(s.realized_pnl.toFixed(2)),
      stcg: parseFloat(s.stcg.toFixed(2)),
      ltcg: parseFloat(s.ltcg.toFixed(2))
    })),
    closed_trades: closedTrades.sort((a, b) => new Date(b.sell_date).getTime() - new Date(a.sell_date).getTime())
  };
}
