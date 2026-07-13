import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { useAuthStore } from '../context/authStore';
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
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Layers,
  Info,
  X
} from 'lucide-react';

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
  const { profile } = useAuthStore();
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
  const [trades, setTrades] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('finor_cached_trades') || '[]');
    } catch {
      return [];
    }
  });
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

  const fetchTradesData = async () => {
    try {
      const tradesData = await apiRequest('/trades');
      setTrades(tradesData || []);
      localStorage.setItem('finor_cached_trades', JSON.stringify(tradesData || []));
    } catch (err) {
      console.error('Failed to load trades:', err);
    }
  };

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

  // Fetch holdings, events and trades once on mount
  useEffect(() => {
    fetchHoldingsData();
    fetchEventsData();
    fetchTradesData();

    const handleCacheUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const endpoint = customEvent.detail?.endpoint;
      if (endpoint === '/holdings') {
        fetchHoldingsData();
      } else if (endpoint === '/trades') {
        fetchTradesData();
      } else if (endpoint === '/holdings/events') {
        fetchEventsData();
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
      fetchTradesData();
    };

    window.addEventListener('portfolio-sync-complete', handleSyncComplete);
    return () => {
      window.removeEventListener('portfolio-sync-complete', handleSyncComplete);
    };
  }, [period]);

  // Financial Calculations
  const totalInvested = holdings.reduce((sum, h) => sum + (h.average_buy_price * h.quantity), 0);
  const totalValue = holdings.reduce((sum, h) => sum + ((h.ltp || h.average_buy_price) * h.quantity), 0);
  const totalPL = totalValue - totalInvested;
  const totalROI = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  // Day's Gain/Loss (LTP vs Previous Close)
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
  // ─── Swing Trading Switch Opportunity Calculations ──────────────────────
  const exitCandidates = holdings
    .map(h => {
      const avg = h.average_buy_price || 0;
      const current = h.ltp || avg;
      const roi = avg > 0 ? ((current - avg) / avg) * 100 : 0;
      return { ...h, roi };
    })
    .filter(h => h.roi >= 10.0)
    .sort((a, b) => b.roi - a.roi);

  // Dip accumulation candidates (Active holdings currently down by 5% or more)
  const dipCandidates = holdings
    .map(h => {
      const avg = h.average_buy_price || 0;
      const current = h.ltp || avg;
      const roi = avg > 0 ? ((current - avg) / avg) * 100 : 0;
      return { ...h, roi };
    })
    .filter(h => h.roi <= -5.0)
    .sort((a, b) => a.roi - b.roi);

  // Historically traded symbols that are NOT in active holdings (fully closed)
  const activeSymbolsSet = new Set(holdings.map(h => h.stock_symbol.toUpperCase()));
  const closedCandidates = Array.isArray(trades) ? [...new Set(trades.map(t => t.stock_symbol.toUpperCase()))]
    .filter(symbol => !activeSymbolsSet.has(symbol))
    .slice(0, 5) : [];

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold font-display text-white">Dashboard</h1>
        <p className="text-xs text-gray-400 mt-1">
          Welcome back. Here is your portfolio performance snapshot at a glance.
        </p>
      </div>

      {/* Configuration Checklist / Welcome Guide Banner for New Users */}
      {profile && (!profile.zerodha_api_key || !profile.gmail_connected_email) && (
        <div className="glass-panel rounded-3xl border border-brand-500/25 p-6 relative overflow-hidden shadow-xl bg-gradient-to-r from-brand-950/15 via-dark-depth-1 to-indigo-950/10 backdrop-blur-md">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-405 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500"></span>
                </span>
                <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-550/20">Setup Guide Checklist</span>
              </div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">Complete your Account Integration Setup</h2>
              <p className="text-xs text-gray-305 max-w-xl leading-relaxed">
                Unlock automated trades ingestion, real-time portfolio tracking, and AI-driven coaching insights by linking your broker API keys or Gmail sync.
              </p>
              
              {/* Checklist list */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <div className={`w-3.5 h-3.5 rounded-full border ${profile.zerodha_api_key ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-gray-500 text-gray-550'} flex items-center justify-center text-[9px]`}>
                    {profile.zerodha_api_key ? '✓' : '1'}
                  </div>
                  <span className={profile.zerodha_api_key ? 'text-emerald-400 line-through' : ''}>Broker API Credentials</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-3.5 h-3.5 rounded-full border ${profile.gmail_connected_email ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-gray-500 text-gray-555'} flex items-center justify-center text-[9px]`}>
                    {profile.gmail_connected_email ? '✓' : '2'}
                  </div>
                  <span className={profile.gmail_connected_email ? 'text-emerald-400 line-through' : ''}>Gmail Sync Authorization</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => setActiveTab('profile')}
              className="py-3 px-5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-extrabold text-xs uppercase tracking-wider active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-brand-600/25 self-start md:self-center shrink-0 border border-brand-500/30"
            >
              Configure Now <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm font-medium flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Indicator Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Current Value */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-xl pointer-events-none" />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Portfolio Value</span>
          <h3 className="text-2xl font-extrabold text-white mt-1.5">
            <LtpPriceText value={totalValue} />
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500 font-medium">Invested:</span>
            <span className="text-xs text-gray-300 font-semibold">
              ₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Absolute Returns */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-xl pointer-events-none ${totalPL >= 0 ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`} />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Returns</span>
          <h3 className={`text-2xl font-extrabold mt-1.5 flex items-center gap-1.5 ${totalPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {totalPL >= 0 ? '+' : ''}
            ₹{totalPL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
              totalPL >= 0 
                ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-500' 
                : 'bg-rose-500/10 border-rose-500/10 text-rose-500'
            }`}>
              {totalPL >= 0 ? '+' : ''}{totalROI.toFixed(2)}% ROI
            </span>
          </div>
        </div>

        {/* Day's Change */}
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
        </div>

        {/* Assets Count */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Active Assets</span>
          <h3 className="text-2xl font-extrabold text-white mt-1.5">
            {holdings.length} Positions
          </h3>
          <p className="text-[10px] text-gray-500 mt-2 font-medium">Equities / ETFs active list</p>
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
              <ResponsiveContainer width="99%" height={288}>
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

      {/* Dynamic Swing Trade & Corporate Events Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Upcoming Corporate Events */}
        <div className="glass-panel rounded-3xl p-6 border border-dark-border flex flex-col h-full">
          <div className="flex items-center justify-between border-b border-dark-border/40 pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Corporate Events Calendar</h3>
                <p className="text-[10px] text-gray-400">Upcoming dividends, results & board meetings</p>
              </div>
            </div>
          </div>

          {loadingEvents ? (
            <div className="flex-grow flex flex-col items-center justify-center py-8">
              <Activity className="w-5 h-5 animate-spin text-indigo-400 mb-2" />
              <p className="text-[10px] text-gray-400">Fetching corporate actions...</p>
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="flex-grow flex items-center justify-center py-8 text-center bg-dark-depth-2/30 rounded-2xl border border-dashed border-dark-border/40">
              <div>
                <Calendar className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-[10px] text-gray-400">No upcoming events scheduled for your holdings.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto flex-grow">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-gray-400 uppercase tracking-wider border-b border-dark-border/30 pb-2">
                    <th className="pb-2 font-bold">Company</th>
                    <th className="pb-2 font-bold">Event Type</th>
                    <th className="pb-2 font-bold">Details</th>
                    <th className="pb-2 font-bold text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border/20">
                  {upcomingEvents.slice(0, 5).map((event: any, idx: number) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 font-extrabold text-white">{event.stock_symbol}</td>
                      <td className="py-2.5">
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                          event.type === 'DIVIDEND' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : event.type === 'RESULTS' 
                              ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                        }`}>
                          {event.type}
                        </span>
                      </td>
                      <td className="py-2.5 text-gray-300 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[120px] block">{event.details || 'View details'}</span>
                          <button
                            onClick={() => setSelectedEventDetails(event)}
                            className="p-1 rounded-lg text-brand-400 hover:text-white hover:bg-brand-500/10 transition-all cursor-pointer flex-shrink-0"
                            title="View Event Details"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-gray-400 font-semibold">
                        {event.date ? new Date(event.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Swing Trading Switch Opportunities */}
        <div className="glass-panel rounded-3xl p-6 border border-dark-border flex flex-col h-full">
          <div className="flex items-center justify-between border-b border-dark-border/40 pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <ArrowUpDown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Swing Trading Scanner</h3>
                <p className="text-[10px] text-gray-400">Intelligent exit (book profit) & entry suggestions</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 flex-grow flex flex-col justify-between">
            
            {/* Suggestions list */}
            {exitCandidates.length === 0 ? (
              <div className="flex-grow flex items-center justify-center py-8 text-center bg-dark-depth-2/30 rounded-2xl border border-dashed border-dark-border/40">
                <div>
                  <TrendingUp className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-[10px] text-gray-400 flex flex-col gap-1 items-center">
                    <span>No positions with returns &gt; 10% found.</span>
                    <span className="text-[9px] text-gray-500">Holdings returns are evaluated in real-time.</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 flex-grow">
                {exitCandidates.slice(0, 2).map((exit: any, idx: number) => {
                  // Pair with a dip candidate or a past favorite closed candidate
                  const bestDip = dipCandidates[idx] || dipCandidates[0];
                  const bestClosed = closedCandidates[idx] || closedCandidates[0];
                  
                  return (
                    <div key={idx} className="bg-dark-depth-2/40 border border-dark-border/40 p-4 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">Opportunity #{idx + 1}</span>
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-extrabold">BOOK PROFIT SIGNAL</span>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2 border-b border-dark-border/20 pb-2">
                        <div>
                          <span className="text-xs font-black text-white">{exit.stock_symbol}</span>
                          <span className="text-[10px] text-gray-500 block">Current holding</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-emerald-400">+{exit.roi.toFixed(1)}% Return</span>
                          <span className="text-[10px] text-gray-500 block">Target hit</span>
                        </div>
                      </div>

                      {/* Recommend entry */}
                      {bestDip ? (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-2">
                            <div className="p-1 rounded bg-rose-500/10 text-rose-400">
                              <TrendingDown className="w-3 h-3" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-gray-200">Re-allocate to {bestDip.stock_symbol}</span>
                              <span className="text-[9px] text-gray-500 block">Currently down by {bestDip.roi.toFixed(1)}% (discount accumulation)</span>
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                      ) : bestClosed ? (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-2">
                            <div className="p-1 rounded bg-brand-500/10 text-brand-400">
                              <Layers className="w-3 h-3" />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-gray-200">Re-enter past favorite {bestClosed}</span>
                              <span className="text-[9px] text-gray-500 block">Currently fully sold (re-entry watchlist)</span>
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-400 italic">
                          Book profits on {exit.stock_symbol} and wait for dip entry signals on your watchlisted positions.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Quick Swing Stats Footer */}
            <div className="flex items-center justify-between text-[9px] text-gray-500 border-t border-dark-border/20 pt-3 mt-2">
              <span>Exit candidates (ROI &gt; 10%): <strong>{exitCandidates.length}</strong></span>
              <span>Dip candidates (&lt; -5%): <strong>{dipCandidates.length}</strong></span>
              <span>Past closed assets: <strong>{closedCandidates.length}</strong></span>
            </div>

          </div>
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

    </div>
  );
};
