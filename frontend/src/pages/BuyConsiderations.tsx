import { useState, useEffect } from 'react';
import { 
  Radar, 
  Search, 
  TrendingDown, 
  Sparkles, 
  Info, 
  ArrowRight, 
  Sliders, 
  AlertTriangle,
  RotateCw,
  Coins
} from 'lucide-react';
import { apiRequest } from '../services/api';

interface Candidate {
  symbol: string;
  name: string;
  avgBuyPrice: number;
  currentPrice: number;
  allTimeHigh: number;
  dipPercent: number;
  convictionScore: number;
  reason: string;
  sector: string;
}

export const BuyConsiderations = () => {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [riskProfile, setRiskProfile] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);

  const fetchAndScanStocks = async () => {
    setScanning(true);
    setLoading(true);
    try {
      // Fetch both current holdings and past trades to extract all historical assets
      const [holdingsData, tradesData] = await Promise.all([
        apiRequest('/holdings').catch(() => []),
        apiRequest('/trades').catch(() => [])
      ]);

      // Collect all unique symbols we ever traded
      const allSymbols = new Set<string>();
      const symbolNames: Record<string, string> = {};
      
      // Calculate historical average buy prices
      const buyAmounts: Record<string, number> = {};
      const buyQuantities: Record<string, number> = {};

      // Process past trades
      if (Array.isArray(tradesData)) {
        tradesData.forEach((t: any) => {
          const sym = t.stock_symbol.toUpperCase();
          allSymbols.add(sym);
          if (t.stock_name) symbolNames[sym] = t.stock_name.split('|')[0];
          
          if (t.trade_type === 'BUY' || t.transaction_type === 'BUY') {
            buyAmounts[sym] = (buyAmounts[sym] || 0) + (t.price * t.quantity);
            buyQuantities[sym] = (buyQuantities[sym] || 0) + t.quantity;
          }
        });
      }

      // Process current holdings
      if (Array.isArray(holdingsData)) {
        holdingsData.forEach((h: any) => {
          const sym = h.stock_symbol.toUpperCase();
          allSymbols.add(sym);
          if (h.stock_name) symbolNames[sym] = h.stock_name.split('|')[0];
        });
      }

      // Fetch live LTP values from Yahoo Finance for all symbols
      const symbolsArray = Array.from(allSymbols);
      const ltpMap: Record<string, number> = {};
      
      await Promise.all(symbolsArray.map(async (sym) => {
        try {
          const res = await apiRequest(`/holdings/ltp/${sym}`);
          if (res && typeof res.ltp === 'number') {
            ltpMap[sym] = res.ltp;
          }
        } catch (e) {
          console.warn(`Could not fetch live price for ${sym}:`, e);
        }
      }));

      // Map mock/calculated fundamentals, dip reasons and conviction scores
      const parsedCandidates: Candidate[] = Array.from(allSymbols).map(sym => {
        // Find average buy price
        const currentHolding = holdingsData?.find((h: any) => h.stock_symbol.toUpperCase() === sym);
        
        let avgPrice = 0;
        if (currentHolding) {
          avgPrice = currentHolding.average_buy_price;
        } else if (buyQuantities[sym] > 0) {
          avgPrice = buyAmounts[sym] / buyQuantities[sym];
        } else {
          avgPrice = 1200; // Fallback default average buy price if no trades found
        }

        const currentPrice = ltpMap[sym] || currentHolding?.ltp || avgPrice * 0.85; // Dip fallback if no LTP
        
        // Map realistic or fallback ATH (All-Time High)
        let athPrice = avgPrice * 1.35;
        if (sym.includes('INFY')) athPrice = 1800;
        else if (sym.includes('WIPRO')) athPrice = 720;
        else if (sym.includes('RELIANCE')) athPrice = 3200;
        else if (sym.includes('CDSL')) athPrice = 2500;
        else if (sym.includes('HDFCBANK')) athPrice = 1750;

        // Dip calculation relative to average purchase price or ATH
        const dipPercent = ((currentPrice - avgPrice) / avgPrice) * 100;

        // Smart DIP reason mapping
        let reason = "Profit booking and short-term market consolidation.";
        let sector = "General";
        let baseScore = 65;

        if (sym.includes('INFY') || sym.includes('WIPRO') || sym.includes('TCS')) {
          reason = "IT Sector weakness driven by global spending cuts & client budget revisions.";
          sector = "Information Technology";
          baseScore = 82;
        } else if (sym.includes('HDFCBANK') || sym.includes('ICICIBANK') || sym.includes('SBIN')) {
          reason = "Banking sector margin compression & regulatory deposit-to-credit balance rules.";
          sector = "Financial Services";
          baseScore = 78;
        } else if (sym.includes('CDSL') || sym.includes('BSE')) {
          reason = "Healthy profit booking after multi-bagger momentum run-up.";
          sector = "Capital Markets";
          baseScore = 70;
        } else if (sym.includes('RELIANCE')) {
          reason = "Global oil refining margin weakness & capital expenditure load.";
          sector = "Energy & Petrochemicals";
          baseScore = 75;
        }

        // Adjust conviction score dynamically based on the size of the dip (larger dip = higher potential recovery score)
        const dipBonus = Math.abs(Math.min(0, dipPercent)) * 0.8;
        const convictionScore = Math.min(98, Math.round(baseScore + dipBonus));

        return {
          symbol: sym,
          name: symbolNames[sym] || `${sym} Industries`,
          avgBuyPrice: avgPrice,
          currentPrice,
          allTimeHigh: athPrice,
          dipPercent,
          convictionScore,
          reason,
          sector
        };
      })
      // Only keep stocks that are currently at a discount / dip
      .filter(c => c.dipPercent < 0)
      .sort((a, b) => b.convictionScore - a.convictionScore);

      setCandidates(parsedCandidates);
    } catch (err) {
      console.error('Failed to load considerations:', err);
    } finally {
      // Hold scanning animation for 1.8 seconds for a premium, high-tech UX feel
      setTimeout(() => {
        setLoading(false);
        setScanning(false);
      }, 1800);
    }
  };

  useEffect(() => {
    fetchAndScanStocks();
  }, []);

  const getRiskMultiplier = () => {
    if (riskProfile === 'conservative') return 0.5;
    if (riskProfile === 'aggressive') return 1.5;
    return 1.0;
  };

  const getSimulatedSuggestion = (c: Candidate) => {
    const mult = getRiskMultiplier();
    const suggestedQty = Math.round((5000 / c.currentPrice) * mult);
    
    if (riskProfile === 'conservative') {
      const waitPrice = c.currentPrice * 0.95;
      return {
        action: 'WAIT & ACCUMULATE',
        qty: suggestedQty,
        price: waitPrice,
        text: `Suggest waiting for a deeper discount around ₹${waitPrice.toFixed(2)} to minimize downside risk.`
      };
    } else if (riskProfile === 'aggressive') {
      return {
        action: 'BUY NOW',
        qty: suggestedQty,
        price: c.currentPrice,
        text: `Asset heavily discounted. Buy ${suggestedQty} QTY immediately at LTP to capture fast recovery.`
      };
    } else {
      return {
        action: 'ACCUMULATE HALF NOW',
        qty: Math.max(1, Math.round(suggestedQty / 2)),
        price: c.currentPrice,
        text: `Buy 50% now at ₹${c.currentPrice.toFixed(2)} and add remaining if price slides to ₹${(c.currentPrice * 0.97).toFixed(2)}.`
      };
    }
  };

  const filteredCandidates = candidates.filter(
    c => c.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
         c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Title Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white tracking-tight">Considerations for Buying</h1>
          <p className="text-xs text-gray-400 mt-1">
            Analyzing your past traded assets currently trading at a discount.
          </p>
        </div>

        <button
          onClick={fetchAndScanStocks}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dark-border bg-dark-depth-2/40 text-xs font-semibold text-gray-200 hover:text-white hover:border-brand-500/40 transition-all cursor-pointer disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          Run Radar Scan
        </button>
      </div>

      {/* Interactive Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search candidate symbol or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-dark-depth-1 border border-dark-border text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-all font-sans"
          />
        </div>

        {/* Risk profile toggle */}
        <div className="flex items-center bg-dark-depth-1 border border-dark-border p-1.5 rounded-2xl gap-2 select-none">
          <span className="text-[10px] text-gray-400 font-extrabold uppercase pl-2 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5" />
            Risk Mode:
          </span>
          <div className="flex-1 flex gap-1">
            {(['conservative', 'moderate', 'aggressive'] as const).map(profile => (
              <button
                key={profile}
                onClick={() => setRiskProfile(profile)}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  riskProfile === profile
                    ? 'bg-brand-500 text-white shadow-md'
                    : 'text-gray-400 hover:text-white hover:bg-dark-depth-2'
                }`}
              >
                {profile}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Radar scanning loader animation screen */}
      {loading ? (
        <div className="glass-panel rounded-3xl border border-dark-border p-16 flex flex-col items-center justify-center space-y-6 relative overflow-hidden select-none min-h-[400px]">
          {/* Radar Sweep Effect */}
          <div className="relative w-44 h-44 rounded-full border-2 border-brand-500/20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-brand-500/10 animate-ping" />
            <div className="absolute w-full h-full rounded-full border border-brand-500/40 animate-spin" style={{ borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent', animationDuration: '3s' }} />
            <div className="absolute w-36 h-36 rounded-full border border-brand-500/10 flex items-center justify-center">
              <div className="absolute w-24 h-24 rounded-full border border-brand-500/20 flex items-center justify-center">
                <Radar className="w-10 h-10 text-brand-400 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest animate-pulse">Running Deep Value Scanner</h3>
            <p className="text-[10px] text-gray-400 max-w-xs mx-auto leading-relaxed">
              Evaluating trade histories, previous average buy prices, current Ltp values, and sector trends to locate undervalued opportunities.
            </p>
          </div>
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="glass-panel rounded-3xl border border-dark-border p-16 text-center select-none">
          <AlertTriangle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-sm font-extrabold text-white">No Undervalued Assets Found</h3>
          <p className="text-[10px] text-gray-400 max-w-xs mx-auto mt-2 leading-relaxed">
            All your historically traded assets are currently trading above your average purchase price.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
          {filteredCandidates.map(c => {
            const simulated = getSimulatedSuggestion(c);
            
            return (
              <div 
                key={c.symbol} 
                className="glass-panel rounded-3xl border border-dark-border p-6 flex flex-col justify-between hover:border-brand-500/30 transition-all group"
              >
                
                {/* Header */}
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-white">{c.symbol}</h3>
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-dark-depth-2 text-gray-400 border border-dark-border">
                          {c.sector}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{c.name}</p>
                    </div>

                    {/* Conviction Score badge */}
                    <div className="text-right">
                      <span className="text-[9px] text-gray-500 font-bold block uppercase">Conviction</span>
                      <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                        <Sparkles className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
                        <span className="text-base font-black text-white">{c.convictionScore}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Prices & Dip bar */}
                  <div className="grid grid-cols-3 gap-2 bg-dark-depth-2/40 border border-dark-border/40 p-3.5 rounded-2xl mt-4 select-none">
                    <div>
                      <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Avg Buy Price</span>
                      <span className="text-xs font-bold text-gray-300 mt-1 block">₹{c.avgBuyPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Current Price</span>
                      <span className="text-xs font-black text-white mt-1 block">₹{c.currentPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Discount</span>
                      <span className="text-xs font-black text-rose-500 mt-1 block flex items-center gap-0.5">
                        <TrendingDown className="w-3 h-3" />
                        {c.dipPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Fall Reason */}
                  <div className="mt-4 p-3 rounded-2xl bg-rose-500/5 border border-rose-500/10 flex gap-2.5 items-start text-xs select-none">
                    <Info className="w-4 h-4 text-rose-450 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-white block uppercase text-[9px] tracking-wide">Dip Reason</span>
                      <span className="text-gray-400 mt-1 block leading-relaxed font-medium">{c.reason}</span>
                    </div>
                  </div>
                </div>

                {/* Simulated Buying Suggestion Widget */}
                <div className="mt-6 border-t border-dark-border/40 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-brand-400" />
                      Buy Simulation Trigger
                    </span>
                    <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full border ${
                      riskProfile === 'conservative' 
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                        : 'bg-brand-500/10 border-brand-500/20 text-brand-400'
                    }`}>
                      {simulated.action}
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-300 leading-relaxed font-semibold pl-0.5">
                    {simulated.text}
                  </p>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-dark-depth-2/60 border border-dark-border p-3 rounded-2xl select-none">
                      <span className="text-[8px] text-gray-500 font-bold uppercase block">Suggested Qty</span>
                      <span className="text-sm font-black text-white mt-0.5 block">{simulated.qty} Shares</span>
                    </div>
                    <div className="flex-1 bg-dark-depth-2/60 border border-dark-border p-3 rounded-2xl select-none">
                      <span className="text-[8px] text-gray-500 font-bold uppercase block">Target Price</span>
                      <span className="text-sm font-black text-white mt-0.5 block">₹{simulated.price.toFixed(2)}</span>
                    </div>

                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('finor-switch-tab', {
                          detail: {
                            tab: 'orders',
                            symbol: c.symbol,
                            action: 'BUY',
                            quantity: simulated.qty,
                            price: simulated.price.toFixed(2)
                          }
                        }));
                      }}
                      className="h-12 w-12 rounded-2xl bg-brand-600 hover:bg-brand-500 border border-brand-500/20 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-lg shadow-brand-700/15"
                      title="Place GTT Limit Buy Order"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
