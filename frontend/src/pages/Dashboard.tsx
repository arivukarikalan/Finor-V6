import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { LtpPriceText } from '../components/LtpPriceText';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';
import { 
  Briefcase, 
  BarChart3, 
  FileText,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  Activity,
  Calendar,
  Info,
  X,
  TrendingUp,
  TrendingDown,
  Coins,
  Sun,
  Compass,
  Zap,
  ChevronRight
} from 'lucide-react';
import { PremarketReportModal, type PremarketReport } from '../components/PremarketReportModal';

interface HistoryPoint {
  month: string;
  invested: number;
  value: number;
  pnl: number;
  roi: number;
}

interface Holding {
  id: string;
  stock_symbol: string;
  quantity: number;
  average_buy_price: number;
  ltp: number | null;
  previousClose?: number | null;
}

interface DashboardProps {
  setActiveTab: (tab: any) => void;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isProfit = data.pnl >= 0;
    return (
      <div className="glass-panel p-4 border border-dark-border rounded-2xl shadow-2xl bg-dark-depth-3/95 text-xs space-y-2.5 backdrop-blur-md">
        <p className="font-extrabold text-white border-b border-dark-border/40 pb-1.5">{data.month}</p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-8">
            <span className="text-gray-400 font-medium">Market Value:</span>
            <span className="font-bold text-white">₹{data.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between gap-8">
            <span className="text-gray-400 font-medium">Invested Cost:</span>
            <span className="font-bold text-gray-300">₹{data.invested.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between gap-8 pt-1.5 border-t border-dark-border/20">
            <span className="text-gray-400 font-medium">Net Return:</span>
            <span className={`font-extrabold ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
              {isProfit ? '+' : ''}₹{data.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({isProfit ? '+' : ''}{data.roi.toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const periodTitles = {
  '1W': 'Portfolio Growth (1 Week)',
  '1M': 'Portfolio Growth (1 Month)',
  '3M': 'Portfolio Growth (3 Months)',
  '6M': 'Portfolio Growth (6 Months)',
  '1Y': 'Portfolio Growth (12 Months)',
  'ALL': 'Portfolio Growth (Lifetime)'
};

export const Dashboard = ({ setActiveTab }: DashboardProps) => {
  const [period, setPeriod] = useState<'1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'>('1Y');
  const [history, setHistory] = useState<HistoryPoint[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('finor_cached_dashboard_history') || '[]');
    } catch {
      return [];
    }
  });
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('finor_cached_holdings') || '[]');
    } catch {
      return [];
    }
  });
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('finor_cached_upcoming_events') || '[]');
    } catch {
      return [];
    }
  });
  // trades state removed
  const [loading, setLoading] = useState(() => {
    return !localStorage.getItem('finor_cached_holdings');
  });
  const [loadingHistory, setLoadingHistory] = useState(() => {
    return !localStorage.getItem('finor_cached_dashboard_history');
  });
  const [loadingEvents, setLoadingEvents] = useState(() => {
    return !localStorage.getItem('finor_cached_upcoming_events');
  });
  const [error, setError] = useState<string | null>(null);
  const [selectedEventDetails, setSelectedEventDetails] = useState<any | null>(null);

  const [mfSummary, setMfSummary] = useState<{ totalInvested: number; totalCurrentValue: number; totalPnl: number; schemesCount: number } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('finor_cached_mf_summary') || 'null');
    } catch {
      return null;
    }
  });

  const [premarketReport, setPremarketReport] = useState<PremarketReport | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('finor_cached_premarket_report') || 'null');
    } catch {
      return null;
    }
  });
  const [showPremarketModal, setShowPremarketModal] = useState(false);

  const fetchPremarketData = async () => {
    try {
      const res = await apiRequest('/premarket/today');
      const r = res?.report || (res?.report_title ? res : null);
      if (r) {
        setPremarketReport(r);
        localStorage.setItem('finor_cached_premarket_report', JSON.stringify(r));
      }
    } catch (err) {
      console.error('Failed to load premarket report:', err);
    }
  };

  const fetchMutualFundsData = async () => {
    try {
      const res = await apiRequest('/mutual-funds');
      if (res && res.summary) {
        setMfSummary(res.summary);
        localStorage.setItem('finor_cached_mf_summary', JSON.stringify(res.summary));
      }
    } catch (err) {
      console.error('Failed to load mutual funds summary:', err);
    }
  };

  const fetchHoldingsData = async () => {
    try {
      const holdingsData = await apiRequest('/holdings');
      setHoldings(holdingsData || []);
      localStorage.setItem('finor_cached_holdings', JSON.stringify(holdingsData || []));
    } catch (err: any) {
      console.error('Failed to load holdings:', err);
    }
  };

  const fetchEventsData = async () => {
    const hasCache = localStorage.getItem('finor_cached_upcoming_events');
    if (!hasCache) {
      setLoadingEvents(true);
    }
    try {
      const res = await apiRequest('/news/corporate-actions');
      setUpcomingEvents(res.upcoming || []);
      localStorage.setItem('finor_cached_upcoming_events', JSON.stringify(res.upcoming || []));
    } catch (err) {
      console.error('Failed to load corporate actions:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  // fetchTradesData removed

  const fetchHistoryData = async () => {
    const hasCache = localStorage.getItem('finor_cached_dashboard_history');
    if (!hasCache) {
      setLoadingHistory(true);
    }
    try {
      const histData = await apiRequest(`/analytics/portfolio-history?period=${period}`);
      setHistory(histData || []);
      localStorage.setItem('finor_cached_dashboard_history', JSON.stringify(histData || []));
      setError(null);
    } catch (err: any) {
      console.error(err);
      if (history.length === 0) {
        setError(err.message || 'Failed to fetch dashboard history.');
      }
    } finally {
      setLoadingHistory(false);
      setLoading(false);
    }
  };

  // Fetch holdings, events, mutual funds, and premarket report once on mount
  useEffect(() => {
    fetchHoldingsData();
    fetchEventsData();
    fetchMutualFundsData();
    fetchPremarketData();

    const handleCacheUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const endpoint = customEvent.detail?.endpoint;
      if (endpoint === '/holdings') {
        fetchHoldingsData();
      } else if (endpoint === '/holdings/events') {
        fetchEventsData();
      } else if (endpoint === '/mutual-funds' || endpoint === '/portfolio/summary') {
        fetchMutualFundsData();
      } else if (endpoint === '/premarket/today') {
        const r = customEvent.detail?.data?.report || (customEvent.detail?.data?.report_title ? customEvent.detail.data : null);
        if (r) setPremarketReport(r);
      }
    };
    window.addEventListener('finor-cache-updated', handleCacheUpdate);
    return () => {
      window.removeEventListener('finor-cache-updated', handleCacheUpdate);
    };
  }, []);

  // Background price synchronization if stale (cooldown 5 mins)
  useEffect(() => {
    const triggerBackgroundSync = async () => {
      try {
        const lastSyncStr = localStorage.getItem('finor_last_price_sync');
        const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
        
        if (Date.now() - lastSync > 5 * 60 * 1000) {
          localStorage.setItem('finor_last_price_sync', Date.now().toString());
          console.log('[Dashboard] Stale prices detected. Running background price sync...');
          const syncResult = await apiRequest('/holdings/sync-prices', { method: 'POST' });
          if (syncResult && syncResult.holdings) {
            setHoldings(syncResult.holdings);
            // Broadcast sync complete to other pages/tabs
            window.dispatchEvent(new Event('portfolio-sync-complete'));
          }
        }
      } catch (err) {
        console.error('[Dashboard] Background price sync failed:', err);
      }
    };

    // Delay background sync slightly to prioritize initial mount rendering speed
    const timer = setTimeout(triggerBackgroundSync, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch history when period changes
  useEffect(() => {
    fetchHistoryData();

    const handleCacheUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const endpoint = customEvent.detail?.endpoint;
      if (endpoint === '/holdings/history') {
        fetchHistoryData();
      }
    };
    window.addEventListener('finor-cache-updated', handleCacheUpdate);
    return () => {
      window.removeEventListener('finor-cache-updated', handleCacheUpdate);
    };
  }, [period]);

  // Sync complete event listener (reactive to period)
  useEffect(() => {
    const handleSyncComplete = () => {
      fetchHoldingsData();
      fetchHistoryData();
      fetchEventsData();
      fetchPremarketData();
    };

    window.addEventListener('portfolio-sync-complete', handleSyncComplete);
    return () => {
      window.removeEventListener('portfolio-sync-complete', handleSyncComplete);
    };
  }, [period]);

  // Financial Calculations (Equities + Mutual Funds Combined)
  const equityInvested = holdings.reduce((sum, h) => sum + (h.average_buy_price * h.quantity), 0);
  const equityValue = holdings.reduce((sum, h) => sum + ((h.ltp || h.average_buy_price) * h.quantity), 0);
  const equityPL = equityValue - equityInvested;

  const mfValue = mfSummary?.totalCurrentValue || 0;
  const mfInvested = mfSummary?.totalInvested || 0;
  const mfPL = mfSummary?.totalPnl || (mfValue - mfInvested);

  // Total Portfolio Totals
  const totalValue = equityValue + mfValue;
  const totalInvested = equityInvested + mfInvested;
  const totalPL = equityPL + mfPL;
  const totalROI = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const totalPositionsCount = holdings.length + (mfSummary?.schemesCount || 0);

  // Day's Gain/Loss (LTP vs Previous Close for Equities)
  const daysGain = holdings.reduce((sum, h) => {
    const currentPrice = h.ltp || h.average_buy_price;
    const prevClose = h.previousClose !== undefined && h.previousClose !== null ? h.previousClose : currentPrice;
    const change = currentPrice - prevClose;
    return sum + (change * h.quantity);
  }, 0);

  const totalPrevCloseValue = holdings.reduce((sum, h) => {
    const currentPrice = h.ltp || h.average_buy_price;
    const prevClose = h.previousClose !== undefined && h.previousClose !== null ? h.previousClose : currentPrice;
    return sum + (prevClose * h.quantity);
  }, 0);

  const daysGainPercent = totalPrevCloseValue > 0 ? (daysGain / totalPrevCloseValue) * 100 : 0;
  // Calculations completed

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display text-white">Dashboard</h1>
        <p className="text-xs text-gray-400 mt-1">
          Welcome back. Here is your portfolio performance snapshot at a glance.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm font-medium flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── 🌅 8:00 AM Pre-Market Intelligence Pulse Card ─── */}
      {premarketReport && (
        <div className="relative overflow-hidden glass-panel border border-brand-500/25 bg-gradient-to-r from-brand-950/40 via-dark-depth-2/80 to-dark-depth-1/90 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-brand-950/30">
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none -mr-28 -mt-28" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            {/* Left Content */}
            <div className="space-y-2.5 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-extrabold uppercase tracking-wider shadow-sm">
                  <Sun className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                  8:00 AM Market Pulse
                </span>
                <span className="text-[11px] text-gray-400 font-medium">
                  {premarketReport.date || 'Today'}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  premarketReport.market_bias?.includes('BULLISH')
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : premarketReport.market_bias?.includes('BEARISH')
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                }`}>
                  {premarketReport.market_bias?.includes('BULLISH') ? (
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                  ) : premarketReport.market_bias?.includes('BEARISH') ? (
                    <TrendingDown className="w-3 h-3 text-rose-400" />
                  ) : (
                    <Compass className="w-3 h-3 text-indigo-400" />
                  )}
                  {premarketReport.market_bias}
                </span>
              </div>

              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white leading-snug">
                  {premarketReport.headline}
                </h2>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                  {premarketReport.opening_estimate}
                </p>
              </div>

              {/* Global indices & Holdings Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {premarketReport.global_cues?.slice(0, 4).map((cue) => {
                  const isUp = cue.data.change >= 0;
                  return (
                    <span 
                      key={cue.key} 
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-dark-depth-3/80 border border-dark-border/60 text-[11px] font-medium text-gray-300"
                    >
                      <span className="text-gray-400 font-bold">{cue.name}:</span>
                      <span className={isUp ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {isUp ? '+' : ''}{cue.data.changePct.toFixed(2)}%
                      </span>
                    </span>
                  );
                })}
                {premarketReport.holdings_radar && premarketReport.holdings_radar.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-brand-500/15 border border-brand-500/30 text-[11px] font-bold text-brand-300">
                    <Zap className="w-3 h-3 text-brand-400" />
                    {premarketReport.holdings_radar.length} Holdings in Radar
                  </span>
                )}
              </div>
            </div>

            {/* Right Action CTA */}
            <div className="flex-shrink-0 flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-2.5 pt-3 lg:pt-0 border-t lg:border-t-0 border-dark-border/40">
              <button
                onClick={() => setShowPremarketModal(true)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 text-white font-bold text-xs shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer group hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Read Full 8:00 AM Briefing</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <span className="text-[10px] text-gray-500 font-medium hidden sm:inline-block">
                Daily news, levels & holdings plan
              </span>
            </div>
          </div>
        </div>
      )}

      {/* KPI Indicator Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Portfolio Value Card */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Portfolio Value</span>
            <Coins className="w-4 h-4 text-brand-400" />
          </div>
          <h3 className="text-2xl font-extrabold text-white mt-1.5">
            ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[10px] bg-brand-500/10 border border-brand-500/20 text-brand-400 px-2 py-0.5 rounded-md font-semibold">
              Stocks: ₹{equityValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
            {mfValue > 0 && (
              <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-md font-semibold">
                MF: ₹{mfValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 pt-1 border-t border-dark-border/40">
            <span className="text-xs text-gray-500 font-medium">Invested:</span>
            <span className="text-xs text-gray-300 font-semibold">
              ₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Absolute Returns Card */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-xl pointer-events-none ${totalPL >= 0 ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`} />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Returns</span>
            {totalPL >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
          </div>
          <h3 className={`text-2xl font-extrabold mt-1.5 flex items-center gap-1.5 ${totalPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {totalPL >= 0 ? '+' : ''}
            ₹{Math.abs(totalPL).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
              totalPL >= 0 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {totalPL >= 0 ? '+' : ''}{totalROI.toFixed(2)}% Blended ROI
            </span>
          </div>
          <div className="text-[10px] text-gray-500 mt-2 pt-1 border-t border-dark-border/40 truncate">
            Stocks: {equityPL >= 0 ? '+' : ''}₹{equityPL.toLocaleString('en-IN', { maximumFractionDigits: 0 })} | MFs: {mfPL >= 0 ? '+' : ''}₹{mfPL.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        </div>

        {/* Day's Change Card */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-xl pointer-events-none ${daysGain >= 0 ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`} />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Day's Gain / Loss</span>
          <h3 className={`text-2xl font-extrabold mt-1.5 flex items-center gap-1.5 ${daysGain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {daysGain >= 0 ? '+' : ''}
            <LtpPriceText value={daysGain} />
          </h3>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
              daysGain >= 0 
                ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-500' 
                : 'bg-rose-500/10 border-rose-500/10 text-rose-500'
            }`}>
              {daysGain >= 0 ? '+' : ''}{daysGainPercent.toFixed(2)}% Today
            </span>
          </div>
          <div className="text-[10px] text-gray-500 mt-2 pt-1 border-t border-dark-border/40">
            Equities intraday movement
          </div>
        </div>

        {/* Active Assets Card */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Active Portfolio Assets</span>
          <h3 className="text-2xl font-extrabold text-white mt-1.5">
            {totalPositionsCount} <span className="text-sm font-semibold text-gray-400">Positions</span>
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-400 font-medium">
              {holdings.length} Equities · {mfSummary?.schemesCount || 0} Mutual Funds
            </span>
          </div>
          <div className="text-[10px] text-brand-400 mt-2 pt-1 border-t border-dark-border/40 font-medium">
            Auto-linked to Wealth Goals
          </div>
        </div>

      </div>

      {/* Line Chart Panel */}
      {loading ? (
        <div className="glass-panel rounded-3xl p-16 text-center border border-dark-border">
          <Activity className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-3" />
          <p className="text-xs text-gray-400">Loading portfolio timeline...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="glass-panel rounded-3xl p-16 text-center border border-dark-border">
          <HelpCircle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">No Performance History</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            Please import your trade CSV file inside the **Holdings** module first to calculate your monthly performance curve over time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          
          {/* Main Chart */}
          <div className="glass-panel rounded-3xl p-6 border border-dark-border relative">
            {loadingHistory && (
              <div className="absolute inset-0 bg-dark-depth-1/45 backdrop-blur-[1px] rounded-3xl flex items-center justify-center z-10">
                <Activity className="w-6 h-6 animate-spin text-brand-500" />
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 border-b border-dark-border/40 pb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">{periodTitles[period]}</h3>
                <p className="text-xs text-gray-400 mt-1">Comparison of invested capital cost vs market valuation.</p>
              </div>
              
              {/* Period Chips */}
              <div className="flex items-center gap-1.5 bg-dark-depth-2/65 p-1 rounded-xl border border-dark-border/60 self-start sm:self-auto">
                {(['1W', '1M', '3M', '6M', '1Y', 'ALL'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all duration-200 cursor-pointer ${
                      period === p
                        ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                        : 'text-gray-400 hover:text-white hover:bg-dark-depth-3/50'
                    }`}
                  >
                    {p === 'ALL' ? 'Lifetime' : p}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-72 w-full">
              <ResponsiveContainer width="99%" height={288} minWidth={0} minHeight={0}>
                <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="valGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-dark-border)" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                    axisLine={{ stroke: 'var(--color-dark-border)' }}
                    tickLine={{ stroke: 'var(--color-dark-border)' }}
                  />
                  <YAxis 
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--color-dark-border)' }}
                    tickLine={{ stroke: 'var(--color-dark-border)' }}
                    tickFormatter={(val) => `₹${val}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', color: '#94a3b8', paddingBottom: '10px' }}
                  />
                  
                  {/* Cost Area */}
                  <Area 
                    type="monotone" 
                    dataKey="invested" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#costGradient)" 
                    name="Invested Cost"
                  />
                  
                  {/* Valuation Area */}
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#valGradient)" 
                    name="Market Value"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Corporate Events Calendar Grid */}
      <div className="grid grid-cols-1 gap-6">
        
        {/* Full-width Upcoming Corporate Events */}
        <div className="glass-panel rounded-3xl p-6 border border-dark-border flex flex-col h-full">
          <div className="flex items-center justify-between border-b border-dark-border/40 pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Corporate Events Calendar</h3>
                <p className="text-[10px] text-gray-400">Upcoming dividends, results & board meetings for your holdings</p>
              </div>
            </div>
          </div>

          {loadingEvents ? (
            <div className="flex-grow flex flex-col items-center justify-center py-12">
              <Activity className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
              <p className="text-xs text-gray-400">Fetching corporate actions...</p>
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="flex-grow flex items-center justify-center py-12 text-center bg-dark-depth-2/30 rounded-2xl border border-dashed border-dark-border/40">
              <div>
                <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-400">No upcoming events scheduled for your holdings.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto flex-grow">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-gray-400 uppercase tracking-wider border-b border-dark-border/30 pb-2 text-[10px] font-bold">
                    <th className="pb-3">Company</th>
                    <th className="pb-3">Event Type</th>
                    <th className="pb-3">Details</th>
                    <th className="pb-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border/20">
                  {upcomingEvents.slice(0, 10).map((event: any, idx: number) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="py-3.5 font-extrabold text-white">{event.stock_symbol}</td>
                      <td className="py-3.5">
                        <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                          event.type === 'DIVIDEND' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : event.type === 'RESULTS' 
                              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                        }`}>
                          {event.type}
                        </span>
                      </td>
                      <td className="py-3.5 text-gray-300 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[280px] block">{event.details || 'View details'}</span>
                          <button
                            onClick={() => setSelectedEventDetails(event)}
                            className="p-1 rounded-lg text-brand-400 hover:text-white hover:bg-brand-500/10 transition-all cursor-pointer flex-shrink-0"
                            title="View Event Details"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 text-right text-gray-400 font-semibold">
                        {event.date ? new Date(event.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Module Shortcuts Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <button
          onClick={() => setActiveTab('holdings')}
          className="glass-panel glass-panel-hover rounded-2xl p-5 border border-dark-border text-left flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">View Holdings</span>
              <span className="text-[10px] text-gray-500 mt-0.5 block">Analyze active positions</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
        </button>

        <button
          onClick={() => setActiveTab('pnl')}
          className="glass-panel glass-panel-hover rounded-2xl p-5 border border-dark-border text-left flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Closed P&L</span>
              <span className="text-[10px] text-gray-500 mt-0.5 block">Review realized gains & taxes</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className="glass-panel glass-panel-hover rounded-2xl p-5 border border-dark-border text-left flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Kite Orders</span>
              <span className="text-[10px] text-gray-500 mt-0.5 block">Place GTT limit triggers</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
        </button>

      </div>

      {/* ─── Corporate Action Event Details Modal ─── */}
      {selectedEventDetails && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setSelectedEventDetails(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl border border-dark-border bg-dark-depth-1 p-6 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top design accent */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-2xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-dark-border/40 pb-4 mb-4 select-none">
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-2">
                  {selectedEventDetails.stock_symbol}
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                    selectedEventDetails.type === 'DIVIDEND' 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : selectedEventDetails.type === 'RESULTS' 
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                        : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                  }`}>
                    {selectedEventDetails.type}
                  </span>
                </h3>
                <span className="text-[10px] text-gray-500 mt-1 block font-semibold uppercase tracking-wider">
                  Corporate Action Details
                </span>
              </div>
              <button
                onClick={() => setSelectedEventDetails(null)}
                className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-dark-depth-2/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details Content */}
            <div className="space-y-4">
              <div className="bg-dark-depth-2/40 border border-dark-border/40 p-4 rounded-2xl">
                <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-wider block mb-1">Description</span>
                <p className="text-xs text-gray-300 leading-relaxed font-semibold">
                  {selectedEventDetails.details || 'No additional details are currently available for this event.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-wider block mb-0.5">Record Date</span>
                  <span className="font-bold text-white">
                    {selectedEventDetails.date ? new Date(selectedEventDetails.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Not Set'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-wider block mb-0.5">Status</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Upcoming
                  </span>
                </div>
              </div>
            </div>

            {/* Action button */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setSelectedEventDetails(null)}
                className="w-full py-2.5 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-xs font-bold text-gray-300 hover:text-white transition-colors cursor-pointer select-none"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 8:00 AM Daily Pre-Market Report Modal ─── */}
      <PremarketReportModal
        isOpen={showPremarketModal}
        report={premarketReport}
        onClose={() => setShowPremarketModal(false)}
        setActiveTab={setActiveTab}
      />

    </div>
  );
};
