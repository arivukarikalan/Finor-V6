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
  Coins,
  X,
  Newspaper,
  Calendar,
  Briefcase
} from 'lucide-react';
import { apiRequest } from '../services/api';

interface Candidate {
  symbol: string;
  name: string;
  avgBuyPrice: number;
  currentPrice: number;
  allTimeHigh: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  dipPercent: number;
  convictionScore: number;
  reason: string;
  sector: string;
  // Holding & 10% Portfolio Weight fields
  heldQuantity: number;
  heldAvgPrice: number;
  heldCurrentValue: number;
  portfolioWeightPct: number;
  maxAllowedAmount10Pct: number;
  remainingCapacity10Pct: number;
  maxAccumulateQty10Pct: number;
  isMaxAllocationReached: boolean;
}

interface Article {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  category: string;
  stock_symbol: string;
}

interface CorporateAction {
  stock_symbol: string;
  type: string;
  description: string;
  date: string;
  date_type: string;
  is_upcoming: boolean;
}

export const BuyConsiderations = () => {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [riskProfile, setRiskProfile] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [searchQuery, setSearchQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [totalPortfolioValue, setTotalPortfolioValue] = useState<number>(0);
  
  // News and Corporate Actions Cache for Modal display
  const [newsFeed, setNewsFeed] = useState<Article[]>([]);
  const [corporateActions, setCorporateActions] = useState<{ upcoming: CorporateAction[]; past: CorporateAction[] }>({ upcoming: [], past: [] });
  
  // Selected Stock for Details Modal
  const [selectedStock, setSelectedStock] = useState<Candidate | null>(null);
  const [modalTab, setModalTab] = useState<'news' | 'actions'>('news');

  const fetchAndScanStocks = async () => {
    setScanning(true);
    setLoading(true);
    try {
      // Fetch current holdings, trades, news feed, and corporate actions concurrently
      const [holdingsData, tradesData, newsData, actionsData] = await Promise.all([
        apiRequest('/holdings').catch(() => []),
        apiRequest('/trades').catch(() => []),
        apiRequest('/news').catch(() => []),
        apiRequest('/news/corporate-actions').catch(() => ({ upcoming: [], past: [] }))
      ]);

      setNewsFeed(newsData || []);
      setCorporateActions(actionsData || { upcoming: [], past: [] });

      // Calculate Total Active Portfolio Value
      let totalPortfolioVal = 0;
      if (Array.isArray(holdingsData)) {
        holdingsData.forEach((h: any) => {
          const qty = h.quantity || 0;
          const price = h.ltp || h.average_buy_price || 0;
          totalPortfolioVal += qty * price;
        });
      }
      setTotalPortfolioValue(totalPortfolioVal);

      // Collect all unique symbols we ever traded or currently hold
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

      // Fetch live LTP, 52W High & Low values from Yahoo Finance for all symbols
      const symbolsArray = Array.from(allSymbols);
      const ltpMap: Record<string, { ltp: number; high52: number | null; low52: number | null }> = {};
      
      await Promise.all(symbolsArray.map(async (sym) => {
        try {
          const res = await apiRequest(`/holdings/ltp/${sym}`);
          if (res) {
            ltpMap[sym] = {
              ltp: typeof res.ltp === 'number' ? res.ltp : 0,
              high52: typeof res.fiftyTwoWeekHigh === 'number' ? res.fiftyTwoWeekHigh : null,
              low52: typeof res.fiftyTwoWeekLow === 'number' ? res.fiftyTwoWeekLow : null
            };
          }
        } catch (e) {
          console.warn(`Could not fetch live price info for ${sym}:`, e);
        }
      }));

      // Map fundamentals, dip reasons, conviction scores & 10% portfolio weighting limit
      const parsedCandidates: Candidate[] = Array.from(allSymbols).map(sym => {
        const currentHolding = holdingsData?.find((h: any) => h.stock_symbol.toUpperCase() === sym);
        
        let avgPrice = 0;
        if (currentHolding) {
          avgPrice = currentHolding.average_buy_price;
        } else if (buyQuantities[sym] > 0) {
          avgPrice = buyAmounts[sym] / buyQuantities[sym];
        } else {
          avgPrice = 1200;
        }

        const quote = ltpMap[sym];
        const currentPrice = quote?.ltp || currentHolding?.ltp || avgPrice;
        
        // Exact 52-Week High & Low (null if unavailable, no fake multipliers)
        const fiftyTwoWeekHigh = quote?.high52 ?? currentHolding?.fiftyTwoWeekHigh ?? null;
        const fiftyTwoWeekLow = quote?.low52 ?? currentHolding?.fiftyTwoWeekLow ?? null;
        const athPrice = fiftyTwoWeekHigh;

        // Existing holdings details
        const heldQuantity = currentHolding ? (currentHolding.quantity || 0) : 0;
        const heldAvgPrice = currentHolding ? (currentHolding.average_buy_price || avgPrice) : avgPrice;
        const heldCurrentValue = heldQuantity * currentPrice;
        
        // Portfolio weight percentage
        const portfolioWeightPct = totalPortfolioVal > 0 ? (heldCurrentValue / totalPortfolioVal) * 100 : 0;
        
        // 10% Portfolio Weighting Limit Rules
        const maxAllowedAmount10Pct = totalPortfolioVal > 0 ? totalPortfolioVal * 0.10 : 50000;
        const remainingCapacity10Pct = Math.max(0, maxAllowedAmount10Pct - heldCurrentValue);
        const maxAccumulateQty10Pct = currentPrice > 0 ? Math.floor(remainingCapacity10Pct / currentPrice) : 0;
        const isMaxAllocationReached = heldQuantity > 0 && portfolioWeightPct >= 10.0;

        // Dip calculation relative to average purchase price
        const dipPercent = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;

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

        const dipBonus = Math.abs(Math.min(0, dipPercent)) * 0.8;
        const convictionScore = Math.min(98, Math.round(baseScore + dipBonus));

        return {
          symbol: sym,
          name: symbolNames[sym] || `${sym} Industries`,
          avgBuyPrice: avgPrice,
          currentPrice,
          allTimeHigh: athPrice,
          fiftyTwoWeekHigh,
          fiftyTwoWeekLow,
          dipPercent,
          convictionScore,
          reason,
          sector,
          heldQuantity,
          heldAvgPrice,
          heldCurrentValue,
          portfolioWeightPct,
          maxAllowedAmount10Pct,
          remainingCapacity10Pct,
          maxAccumulateQty10Pct,
          isMaxAllocationReached
        };
      })
      .filter(c => c.dipPercent < 0)
      .sort((a, b) => b.convictionScore - a.convictionScore);

      setCandidates(parsedCandidates);
    } catch (err) {
      console.error('Failed to load considerations:', err);
    } finally {
      setTimeout(() => {
        setLoading(false);
        setScanning(false);
      }, 1200);
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
    let baseQty = Math.max(1, Math.round((5000 / c.currentPrice) * mult));

    if (c.isMaxAllocationReached) {
      return {
        action: 'MAX ALLOCATION (10% CAP)',
        qty: 0,
        price: c.currentPrice,
        isCapReached: true,
        text: `⚠️ Max 10% portfolio allocation cap reached (Weight: ${c.portfolioWeightPct.toFixed(1)}%). Do not add more shares to maintain risk diversification.`
      };
    }

    const safeQty = c.maxAccumulateQty10Pct > 0 ? Math.min(baseQty, c.maxAccumulateQty10Pct) : baseQty;

    if (c.heldQuantity > 0) {
      return {
        action: 'ACCUMULATE MORE',
        qty: safeQty,
        price: c.currentPrice,
        isCapReached: false,
        text: `⚡ Existing Position: ${c.heldQuantity} QTY (Weight: ${c.portfolioWeightPct.toFixed(1)}%). Accumulate up to +${c.maxAccumulateQty10Pct} additional shares (Max ₹${c.remainingCapacity10Pct.toFixed(0)}) before reaching 10% portfolio limit.`
      };
    }

    return {
      action: 'BUY FRESH POSITION',
      qty: safeQty,
      price: c.currentPrice,
      isCapReached: false,
      text: `Fresh position opportunity. Recommended initial entry of ${safeQty} shares at ₹${c.currentPrice.toFixed(2)} (Limit: ${c.maxAccumulateQty10Pct} shares for 10% portfolio cap).`
    };
  };

  const filteredCandidates = candidates.filter(
    c => c.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
         c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter News & Corporate Actions for Selected Stock Modal
  const selectedNews = selectedStock 
    ? newsFeed.filter(art => art.stock_symbol.toUpperCase() === selectedStock.symbol)
    : [];

  const selectedUpcomingEvents = selectedStock
    ? corporateActions.upcoming.filter(ca => ca.stock_symbol.toUpperCase() === selectedStock.symbol)
    : [];

  const selectedPastEvents = selectedStock
    ? corporateActions.past.filter(ca => ca.stock_symbol.toUpperCase() === selectedStock.symbol)
    : [];

  return (
    <div className="space-y-6">
      
      {/* Title Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white tracking-tight">Considerations for Buying</h1>
          <p className="text-xs text-gray-400 mt-1">
            Analyzing active holdings {totalPortfolioValue > 0 ? `(Portfolio Value: ₹${totalPortfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })})` : ''} trading at a discount with a 10% max single-stock cap.
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
            <h3 className="text-sm font-bold text-white uppercase tracking-widest animate-pulse">Running Deep Value & Allocation Scanner</h3>
            <p className="text-[10px] text-gray-400 max-w-xs mx-auto leading-relaxed">
              Evaluating live quotes, 52W High/Low metrics, existing holdings weight, and 10% portfolio caps.
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
                    <div 
                      onClick={() => { setSelectedStock(c); setModalTab('news'); }}
                      className="cursor-pointer group-hover:text-brand-400 transition-colors"
                      title="Tap to see news and events history"
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-white group-hover:text-brand-400 transition-colors">{c.symbol}</h3>
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

                  {/* Existing Holding Status & 10% Allocation Progress Bar */}
                  <div className="mt-4 bg-dark-depth-2/60 border border-dark-border/60 p-3 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-extrabold">
                      <span className="text-gray-300 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-brand-400" />
                        {c.heldQuantity > 0 ? (
                          <span>In Portfolio: <strong>{c.heldQuantity} Qty</strong> (₹{c.heldCurrentValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })})</span>
                        ) : (
                          <span className="text-gray-400">Not currently in portfolio (Fresh Buy)</span>
                        )}
                      </span>

                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                        c.isMaxAllocationReached
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          : c.heldQuantity > 0
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                      }`}>
                        {c.isMaxAllocationReached ? '10% Cap Reached' : c.heldQuantity > 0 ? 'Accumulate Available' : 'Fresh Entry'}
                      </span>
                    </div>

                    {/* 10% Allocation Weight Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-gray-400 font-bold">
                        <span>Portfolio Weight: {c.portfolioWeightPct.toFixed(1)}%</span>
                        <span>Max Cap: 10.0%</span>
                      </div>
                      <div className="w-full h-2 bg-dark-depth-1 rounded-full overflow-hidden border border-dark-border/40">
                        <div 
                          className={`h-full transition-all duration-500 ${
                            c.portfolioWeightPct >= 10.0 
                              ? 'bg-rose-500' 
                              : c.portfolioWeightPct >= 7.5 
                              ? 'bg-amber-500' 
                              : 'bg-brand-500'
                          }`}
                          style={{ width: `${Math.min(100, (c.portfolioWeightPct / 10.0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Prices & Dip bar */}
                  <div className="grid grid-cols-3 gap-2 bg-dark-depth-2/40 border border-dark-border/40 p-3.5 rounded-2xl mt-3 select-none">
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

                  {/* Real 52-Week High & Low Section */}
                  <div className="grid grid-cols-2 gap-2 mt-2 bg-dark-depth-2/20 border border-dark-border/20 px-3.5 py-2 rounded-xl text-[10px] text-gray-400 select-none">
                    <div className="flex justify-between border-r border-dark-border/30 pr-2">
                      <span>52W Low</span>
                      <strong className="text-white">
                        {c.fiftyTwoWeekLow !== null ? `₹${c.fiftyTwoWeekLow.toFixed(2)}` : 'N/A'}
                      </strong>
                    </div>
                    <div className="flex justify-between pl-2">
                      <span>52W High</span>
                      <strong className="text-white">
                        {c.fiftyTwoWeekHigh !== null ? `₹${c.fiftyTwoWeekHigh.toFixed(2)}` : 'N/A'}
                      </strong>
                    </div>
                  </div>

                  {/* Fall Reason */}
                  <div className="mt-3 p-3 rounded-2xl bg-rose-500/5 border border-rose-500/10 flex gap-2.5 items-start text-xs select-none">
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
                      Accumulation Strategy Trigger
                    </span>
                    <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full border ${
                      c.isMaxAllocationReached
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
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
                      <span className="text-[8px] text-gray-500 font-bold uppercase block">Suggested Accumulate</span>
                      <span className="text-sm font-black text-white mt-0.5 block">
                        {simulated.qty > 0 ? `${simulated.qty} Shares` : '0 Shares (Cap)'}
                      </span>
                    </div>
                    <div className="flex-1 bg-dark-depth-2/60 border border-dark-border p-3 rounded-2xl select-none">
                      <span className="text-[8px] text-gray-500 font-bold uppercase block">Target Price</span>
                      <span className="text-sm font-black text-white mt-0.5 block">₹{simulated.price.toFixed(2)}</span>
                    </div>

                    <button
                      disabled={simulated.qty === 0}
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
                      className="h-12 w-12 rounded-2xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 border border-brand-500/20 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-lg shadow-brand-700/15"
                      title={simulated.qty > 0 ? "Place Accumulation GTT Order" : "10% Allocation Cap Reached"}
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

      {/* ─── News and Corporate actions Modal details panel ─── */}
      {selectedStock && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setSelectedStock(null)}
        >
          <div
            className="relative w-full max-w-xl rounded-3xl border border-dark-border bg-dark-depth-1 p-6 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-dark-border/60 pb-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  {selectedStock.symbol}
                  <span className="text-xs font-semibold text-gray-400 font-sans">({selectedStock.name})</span>
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Live events, fundamental news & corporate action schedule</p>
              </div>

              <button
                onClick={() => setSelectedStock(null)}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-dark-depth-2 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-dark-border/40 my-3 gap-4 text-xs font-extrabold uppercase">
              <button
                onClick={() => setModalTab('news')}
                className={`py-2 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                  modalTab === 'news' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Newspaper className="w-3.5 h-3.5" />
                Latest News ({selectedNews.length})
              </button>
              <button
                onClick={() => setModalTab('actions')}
                className={`py-2 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                  modalTab === 'actions' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Corporate Actions ({selectedUpcomingEvents.length + selectedPastEvents.length})
              </button>
            </div>

            {/* Tab 1: News Articles */}
            {modalTab === 'news' && (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                {selectedNews.length > 0 ? (
                  selectedNews.map((article, idx) => (
                    <a
                      key={idx}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3.5 rounded-2xl bg-dark-depth-2/40 border border-dark-border/40 hover:border-brand-500/40 transition-all space-y-1.5 group"
                    >
                      <div className="flex items-center justify-between text-[9px] text-gray-400">
                        <span className="font-bold text-brand-400">{article.source}</span>
                        <span>{new Date(article.publishedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                      </div>
                      <h4 className="font-bold text-white group-hover:text-brand-300 transition-colors line-clamp-2">{article.title}</h4>
                      <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">{article.description}</p>
                    </a>
                  ))
                ) : (
                  <div className="p-8 text-center text-gray-500 text-xs font-semibold">
                    No recent news articles logged for {selectedStock.symbol}.
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Corporate Actions */}
            {modalTab === 'actions' && (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                {selectedUpcomingEvents.length > 0 || selectedPastEvents.length > 0 ? (
                  <>
                    {selectedUpcomingEvents.map((ca, idx) => (
                      <div key={`up-${idx}`} className="p-3.5 rounded-2xl bg-brand-500/10 border border-brand-500/20 space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-bold text-brand-400">
                          <span>UPCOMING: {ca.type}</span>
                          <span>{ca.date}</span>
                        </div>
                        <p className="text-white font-semibold text-xs">{ca.description}</p>
                      </div>
                    ))}
                    {selectedPastEvents.map((ca, idx) => (
                      <div key={`past-${idx}`} className="p-3.5 rounded-2xl bg-dark-depth-2/40 border border-dark-border/40 space-y-1">
                        <div className="flex items-center justify-between text-[9px] font-bold text-gray-400">
                          <span>{ca.type}</span>
                          <span>{ca.date}</span>
                        </div>
                        <p className="text-gray-300 font-semibold text-xs">{ca.description}</p>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="p-8 text-center text-gray-500 text-xs font-semibold">
                    No corporate actions listed for {selectedStock.symbol}.
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
