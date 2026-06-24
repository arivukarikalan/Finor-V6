import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { 
  Lightbulb, 
  Loader2, 
  Brain, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  LineChart,
  Percent,
  Award,
  Target,
  ShieldCheck,
  Zap,
  Activity,
  HeartCrack
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend 
} from 'recharts';

interface InsightsData {
  emptyState: boolean;
  message?: string;
  allSymbols?: string[];
  disciplineScore: number;
  grade: string;
  gradeMeaning: string;
  winRate: number;
  avgWinnerHold: number;
  avgLoserHold: number;
  bestMonth: { month: string; pnl: number } | null;
  worstMonth: { month: string; pnl: number } | null;
  bestTrade: { symbol: string; return: number } | null;
  worstTrade: { symbol: string; return: number } | null;
  targetHitRate: number;
  avgAnnualizedReturn: number;
  realizedPnL: number;
  closedTradesCount: number;
  averagingScore: number;
  violationsCount: number;
  averagingDetails: Array<{
    symbol: string;
    name: string;
    badge: 'Compliant' | 'Warning' | 'Violation';
    timeline: Array<{
      tranche: number;
      date: string;
      qty: number;
      price: number;
      requiredGap: string;
      actualGap: string;
      status: string;
    }>;
    average_buy_price: number;
    quantity: number;
    ltp: number | null;
    settings: {
      stoploss_price: number | null;
      position_tag: 'TRADING' | 'CORE_HOLD';
    };
  }>;
  considerExits: Array<{
    symbol: string;
    name: string;
    avgPrice: number;
    ltp: number | null;
    drop: string;
    days: number;
    reason: string;
  }>;
  panicSellsCount: number;
  earlyExitsCount: number;
  revengeBuysCount: number;
  fomoEntriesCount: number;
  longTermPlanner: Array<{
    symbol: string;
    name: string;
    qty: number;
    ltp: number | null;
    return: number;
    sellQty: number;
    holdQty: number;
    reentryLevel: number;
  }>;
  monthlyPatterns: Array<{
    month: string;
    revenge: number;
    fomo: number;
    overAvg: number;
    panic: number;
    early: number;
  }>;
  monthlyPnLTrend: Array<{
    month: string;
    pnl: number;
  }>;
  closedTrades: Array<{
    stock_symbol: string;
    buy_date: string;
    sell_date: string;
    quantity: number;
    buy_price: number;
    sell_price: number;
    realized_pnl: number;
    holding_days: number;
    gains_type: string;
    return_pct: number;
    annualized_return: number;
    is_panic_sell: boolean;
    is_target_hit: boolean;
    is_early_exit: boolean;
    post_exit_price: number | null;
    post_exit_change: number | null;
    classification: string;
  }>;
  categoryScores: {
    averaging: number;
    exit: number;
    booking: number;
    patterns: number;
    planning: number;
  };
}

/**
 * A simple, lightweight Markdown parser to render AI Coach feedback.
 */
const MarkdownView = ({ text }: { text: string }) => {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  const flushList = (key: string) => {
    if (currentList.length > 0) {
      elements.push(<ul key={key} className="list-disc pl-5 space-y-1.5 text-[11px] text-gray-300 my-3">{...currentList}</ul>);
      currentList = [];
    }
  };

  const flushTable = (key: string) => {
    if (inTable) {
      elements.push(
        <div key={key} className="overflow-x-auto my-4 rounded-xl border border-dark-border/60">
          <table className="w-full text-[11px] text-left text-gray-300">
            <thead className="bg-dark-depth-3/60 text-gray-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                {tableHeaders.map((h, i) => (
                  <th key={i} className="px-4 py-2.5 border-b border-dark-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border/30">
              {tableRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-dark-depth-2/40 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-4 py-2.5 font-medium">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableHeaders = [];
      tableRows = [];
      inTable = false;
    }
  };

  const parseInlineStyles = (lineStr: string) => {
    const parts = lineStr.split('**');
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="font-extrabold text-white">{part}</strong>;
      }
      return part;
    });
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('|')) {
      flushList(`list-${idx}`);
      const cells = trimmed.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
      
      if (cells.every(c => c.startsWith(':') || c.startsWith('-') || c.endsWith(':'))) {
        return;
      }

      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      return;
    } else {
      flushTable(`table-${idx}`);
    }

    if (trimmed.startsWith('### ')) {
      flushList(`list-${idx}`);
      elements.push(
        <h3 key={idx} className="text-xs font-bold text-white uppercase tracking-wider mt-5 mb-2 border-b border-dark-border/40 pb-1 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-brand-400" />
          {parseInlineStyles(trimmed.slice(4))}
        </h3>
      );
    } else if (trimmed.startsWith('#### ')) {
      flushList(`list-${idx}`);
      elements.push(
        <h4 key={idx} className="text-[11px] font-bold text-brand-400 mt-4 mb-1.5">
          {parseInlineStyles(trimmed.slice(5))}
        </h4>
      );
    } else if (trimmed.startsWith('- ')) {
      currentList.push(<li key={idx} className="leading-relaxed">{parseInlineStyles(trimmed.slice(2))}</li>);
    } else if (trimmed.length > 0) {
      flushList(`list-${idx}`);
      elements.push(
        <p key={idx} className="text-xs text-gray-300 leading-relaxed my-2">
          {parseInlineStyles(trimmed)}
        </p>
      );
    } else {
      flushList(`list-${idx}`);
    }
  });

  flushList('list-end');
  flushTable('table-end');

  return <div className="space-y-1 select-text">{elements}</div>;
};

export const Insights = () => {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingAi, setFetchingAi] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [viewMode, setViewMode] = useState<'ALL_TIME' | 'THIS_YEAR' | 'LAST_90_DAYS' | 'THIS_MONTH' | 'CUSTOM'>('LAST_90_DAYS');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [localStartDate, setLocalStartDate] = useState<string>('');
  const [localEndDate, setLocalEndDate] = useState<string>('');
  const [drilldownSymbol, setDrilldownSymbol] = useState<string>('ALL');

  // Collapsible cards state (default collapsed: true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    averaging: true,
    exit: true,
    booking: true,
    planning: true,
    patterns: true,
    analytics: true
  });

  const toggleCollapsed = (key: string) => {
    setCollapsed(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const splitRatio = localStorage.getItem('coreHoldSplitRatio') || '80';
      const reentryDip = localStorage.getItem('reentryDipPct') || '-10';
      
      let url = `/analytics/insights?viewMode=${viewMode}&coreHoldSplitRatio=${splitRatio}&reentryDipPct=${reentryDip}&symbol=${drilldownSymbol}`;
      if (viewMode === 'CUSTOM' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }
      
      const res = await apiRequest(url);
      setData(res);
    } catch (err: any) {
      console.error('Insights fetch failed:', err);
      setError(err.message || 'Failed to load trading insights.');
    } finally {
      setLoading(false);
    }
  };

  const requestAiAnalysis = async () => {
    setFetchingAi(true);
    setAiResponse('');
    try {
      const splitRatio = localStorage.getItem('coreHoldSplitRatio') || '80';
      const reentryDip = localStorage.getItem('reentryDipPct') || '-10';
      
      const res = await apiRequest('/analytics/insights/ai', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          viewMode,
          startDate,
          endDate,
          coreHoldSplitRatio: splitRatio,
          reentryDipPct: reentryDip,
          symbol: drilldownSymbol
        })
      });
      setAiResponse(res.coach_narrative || '');
    } catch (err: any) {
      console.error('AI Coach call failed:', err);
      setAiResponse(`### ❌ Error\nFailed to load coach feedback narrative. ${err.message || 'Check connection settings.'}`);
    } finally {
      setFetchingAi(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'CUSTOM' && (!startDate || !endDate)) {
      return;
    }
    setAiResponse(''); // Clear out-of-date AI suggestions
    fetchInsights();
  }, [viewMode, startDate, endDate, drilldownSymbol]);

  const getGradeColor = (g: string) => {
    if (g === 'A') return '#10B981'; // Emerald Green
    if (g === 'B') return '#84CC16'; // Lime Green
    if (g === 'C') return '#F59E0B'; // Amber
    if (g === 'D') return '#F97316'; // Orange
    return '#EF4444'; // Red
  };

  const getBadgeStyle = (status: string) => {
    if (status === 'Compliant' || status === 'Target Hit' || status === 'Planned exit' || status === 'Target achieved') {
      return { color: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.2)' };
    }
    if (status === 'Warning' || status === 'Gap too small' || status === 'Possible panic sell' || status === 'Panic sell?') {
      return { color: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.2)' };
    }
    if (status === 'Violation' || status === 'Averaging after -30%' || status === 'Violation (4th+ buy)' || status === 'Revenge buy') {
      return { color: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.2)' };
    }
    // Blue neutral/info badge
    return { color: '#3B82F6', backgroundColor: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.2)' };
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
        <p className="text-xs text-gray-400">Auditing tradebook ledger and compiling behavioral scoring parameters...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel p-8 text-center border border-dark-border/80 max-w-md mx-auto my-12 space-y-4">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Failed to load Insights</h3>
        <p className="text-xs text-gray-400">{error || 'Unknown error occurred.'}</p>
        <button onClick={fetchInsights} className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-xs font-bold text-white rounded-xl transition-all cursor-pointer">
          Try Again
        </button>
      </div>
    );
  }

  if (data.emptyState) {
    return (
      <div className="glass-panel p-16 text-center border border-dark-border max-w-xl mx-auto my-12 space-y-5 select-none">
        <Brain className="w-12 h-12 text-gray-600 mx-auto" />
        <h3 className="text-lg font-bold text-white">Not Enough Trade History Yet</h3>
        <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
          Insights will appear once you have at least 5 completed trades in your ledger. Upload your Zerodha tradebook CSV in the holdings tab to begin.
        </p>
      </div>
    );
  }

  // Get active symbols lists for drill-down select
  const holdingSymbols = data.allSymbols || data.averagingDetails.map(ad => ad.symbol);

  // Drilldown filter logic
  const displayedAveragingDetails = drilldownSymbol === 'ALL'
    ? data.averagingDetails
    : data.averagingDetails.filter(ad => ad.symbol === drilldownSymbol);

  const displayedLongTermPlanner = drilldownSymbol === 'ALL'
    ? data.longTermPlanner
    : data.longTermPlanner.filter(lp => lp.symbol === drilldownSymbol);

  const displayedConsiderExits = drilldownSymbol === 'ALL'
    ? data.considerExits
    : data.considerExits.filter(ce => ce.symbol === drilldownSymbol);

  const displayedClosedTrades = drilldownSymbol === 'ALL'
    ? data.closedTrades
    : data.closedTrades.filter(t => t.stock_symbol === drilldownSymbol);

  return (
    <div className="space-y-6">
      
      {/* Header and Filter Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white">Insights & Habits Audit</h1>
          <p className="text-xs text-gray-400 mt-1">
            Analyzing buy tranche intervals, exits, and psychological pitfalls.
          </p>
        </div>

        {/* View Mode Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-dark-depth-2 border border-dark-border p-1">
            {(['ALL_TIME', 'THIS_YEAR', 'LAST_90_DAYS', 'THIS_MONTH', 'CUSTOM'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  viewMode === mode
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {mode.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Drilldown Symbol Selector */}
          <div className="flex items-center gap-1.5 bg-dark-depth-2 border border-dark-border rounded-xl px-2 py-1">
            <Percent className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={drilldownSymbol}
              onChange={(e) => setDrilldownSymbol(e.target.value)}
              className="bg-transparent text-[10px] font-bold text-gray-300 focus:outline-none border-none pr-6 pl-1 py-1 cursor-pointer"
            >
              <option value="ALL">All Stocks</option>
              {holdingSymbols.map(sym => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Custom Dates Picker (only shows if CUSTOM selected) */}
      {viewMode === 'CUSTOM' && (
        <div className="glass-panel p-4 border border-dark-border rounded-2xl flex flex-wrap gap-4 items-center max-w-md animate-fadeIn">
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">Start Date</span>
            <input
              type="date"
              value={localStartDate}
              onChange={(e) => setLocalStartDate(e.target.value)}
              className="bg-dark-depth-2 border border-dark-border text-white text-xs rounded-lg p-1.5 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">End Date</span>
            <input
              type="date"
              value={localEndDate}
              onChange={(e) => setLocalEndDate(e.target.value)}
              className="bg-dark-depth-2 border border-dark-border text-white text-xs rounded-lg p-1.5 focus:outline-none"
            />
          </div>
          <div className="flex items-end h-[38px] mt-1">
            <button
              onClick={() => {
                if (localStartDate && localEndDate) {
                  setStartDate(localStartDate);
                  setEndDate(localEndDate);
                }
              }}
              disabled={!localStartDate || !localEndDate}
              className="px-3.5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-[10px] font-extrabold uppercase rounded-lg text-white transition-all cursor-pointer"
            >
              Apply Range
            </button>
          </div>
        </div>
      )}

      {/* Score and AI Coach Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Rolling Discipline Score Radial Ring */}
        <div className="glass-panel rounded-3xl border border-dark-border p-6 flex flex-col items-center justify-between text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-xl pointer-events-none" />
          
          <div className="space-y-1 w-full">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Discipline score</span>
            <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">Grade {data.grade}</h2>
            <p className="text-[10px] text-gray-500 font-semibold">{data.gradeMeaning}</p>
          </div>

          {/* Radial Bar Gauge Container */}
          <div className="relative w-full h-44 flex items-center justify-center my-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Discipline', value: data.disciplineScore, fill: getGradeColor(data.grade) },
                    { name: 'Remaining', value: 100 - data.disciplineScore, fill: '#161922' }
                  ]}
                  dataKey="value"
                  innerRadius={55}
                  outerRadius={75}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Centered label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-white leading-none">{data.disciplineScore}</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-extrabold mt-1">/ 100</span>
            </div>
          </div>

          <div className="w-full grid grid-cols-5 gap-1 text-[10px] border-t border-dark-border/40 pt-4 text-gray-400">
            <div>
              <span className="block font-bold">AVG</span>
              <span className="block mt-0.5 text-white font-extrabold">{data.categoryScores.averaging}</span>
            </div>
            <div>
              <span className="block font-bold">EXIT</span>
              <span className="block mt-0.5 text-white font-extrabold">{data.categoryScores.exit}</span>
            </div>
            <div>
              <span className="block font-bold">PROF</span>
              <span className="block mt-0.5 text-white font-extrabold">{data.categoryScores.booking}</span>
            </div>
            <div>
              <span className="block font-bold">BEHV</span>
              <span className="block mt-0.5 text-white font-extrabold">{data.categoryScores.patterns}</span>
            </div>
            <div>
              <span className="block font-bold">PLAN</span>
              <span className="block mt-0.5 text-white font-extrabold">{data.categoryScores.planning}</span>
            </div>
          </div>
        </div>

        {/* AI Behavioral Coach Narrative Panel */}
        <div className="glass-panel lg:col-span-2 rounded-3xl border border-dark-border p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-brand-400 animate-pulse" />
              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">AI Behavioral Coach</h3>
            </div>
            {!aiResponse && (
              <button
                onClick={requestAiAnalysis}
                disabled={fetchingAi}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-[10px] font-extrabold uppercase rounded-lg text-white transition-all cursor-pointer"
              >
                {fetchingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Analyze Habits
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[16rem] pr-2 my-4 select-text">
            {fetchingAi ? (
              <div className="flex flex-col items-center justify-center h-full space-y-3 py-10">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                <p className="text-[10px] text-gray-400">Gemini AI is auditing your trade log patterns...</p>
              </div>
            ) : aiResponse ? (
              <MarkdownView text={aiResponse} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-6 text-gray-400 space-y-2 select-none">
                <Lightbulb className="w-10 h-10 text-gray-600" />
                <p className="text-xs font-semibold text-gray-300">Tap "Analyze Habits" for a deep AI audit</p>
                <p className="text-[10px] max-w-sm leading-relaxed text-gray-500">
                  Injects your exact tranches data, exit price history, panic sales, and discipline score to give tailored feedback.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* The 6 Collapsible Cards Section */}
      <div className="space-y-4">
        
        {/* Card 1: Averaging Discipline */}
        <div className="glass-panel rounded-2xl border border-dark-border overflow-hidden">
          <div 
            onClick={() => toggleCollapsed('averaging')}
            className="p-5 flex items-center justify-between cursor-pointer hover:bg-dark-depth-2/20 transition-all select-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/10 text-brand-400 rounded-xl border border-brand-500/20">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">1. Averaging Discipline</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Enforces the 3-tranche rule, gap percentages, and stops averaging down losers.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                data.averagingScore >= 80 
                  ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-500' 
                  : 'bg-rose-500/10 border-rose-500/10 text-rose-500'
              }`}>
                Averaging Score: {data.averagingScore}%
              </span>
              {collapsed.averaging ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
            </div>
          </div>

          {!collapsed.averaging && (
            <div className="p-5 border-t border-dark-border/40 bg-dark-depth-2/10 space-y-6">
              
              {/* Overall Ring chart + info */}
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-32 h-32 relative flex-shrink-0 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Compliant', value: data.averagingScore, fill: '#10B981' },
                          { name: 'Violations', value: 100 - data.averagingScore, fill: '#1E293B' }
                        ]}
                        dataKey="value"
                        innerRadius={40}
                        outerRadius={55}
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-extrabold text-white leading-none">{data.averagingScore}%</span>
                  </div>
                </div>

                <div className="text-xs text-gray-400 leading-relaxed space-y-1.5">
                  <p className="font-semibold text-white">Guidelines for Tranche Averaging:</p>
                  <ul className="list-disc pl-4 space-y-1 text-[11px]">
                    <li><strong>Buy 1 (Initial):</strong> Any price entry. First buy lot.</li>
                    <li><strong>Buy 2 (First Avg):</strong> Must be at <span className="text-amber-400">7% to 10% drop</span> below Buy 1 average.</li>
                    <li><strong>Buy 3 (Final Avg):</strong> Must be at <span className="text-amber-400">10% to 15% drop</span> below Buy 2 average.</li>
                    <li><strong>Buy 4+ (Violation):</strong> Adding capital a 4th time is strictly banned. Do not average further; hold and wait.</li>
                  </ul>
                </div>
              </div>

              {/* Drilldown details */}
              <div className="space-y-4 pt-4 border-t border-dark-border/20">
                <h5 className="text-[10px] font-bold text-white uppercase tracking-wider">Tranche timeline per holding stock</h5>
                
                {displayedAveragingDetails.length === 0 ? (
                  <p className="text-[11px] text-gray-500">No holdings detected for this view.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {displayedAveragingDetails.map((ad) => (
                      <div key={ad.symbol} className="p-4 rounded-xl border border-dark-border bg-dark-depth-3/30 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-white">{ad.symbol}</span>
                            <span className="text-[9px] text-gray-500 ml-1.5 font-medium">{ad.name}</span>
                          </div>
                          <span 
                            className="text-[9px] font-bold px-2 py-0.5 rounded-full border"
                            style={getBadgeStyle(ad.badge)}
                          >
                            {ad.badge}
                          </span>
                        </div>

                        {/* Timeline */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[10px] text-gray-400 min-w-[500px]">
                            <thead>
                              <tr className="border-b border-dark-border/40 text-gray-500">
                                <th className="pb-1.5">Lot / Tranche</th>
                                <th className="pb-1.5">Date</th>
                                <th className="pb-1.5">Qty</th>
                                <th className="pb-1.5">Buy Price</th>
                                <th className="pb-1.5">Req. Drop</th>
                                <th className="pb-1.5">Act. Drop</th>
                                <th className="pb-1.5">Tranche Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ad.timeline.map((lot) => (
                                <tr key={lot.tranche} className="border-b border-dark-border/20 hover:bg-dark-depth-2/40">
                                  <td className="py-2 font-bold text-white">Buy {lot.tranche}</td>
                                  <td className="py-2">{new Date(lot.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                  <td className="py-2">{lot.qty}</td>
                                  <td className="py-2 font-semibold">₹{lot.price.toFixed(2)}</td>
                                  <td className="py-2">{lot.requiredGap}</td>
                                  <td className="py-2 font-bold text-gray-300">{lot.actualGap}</td>
                                  <td className="py-2">
                                    <span 
                                      className="px-1.5 py-0.5 rounded-full border text-[8px] font-bold"
                                      style={getBadgeStyle(lot.status)}
                                    >
                                      {lot.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Card 2: Exit Discipline */}
        <div className="glass-panel rounded-2xl border border-dark-border overflow-hidden">
          <div 
            onClick={() => toggleCollapsed('exit')}
            className="p-5 flex items-center justify-between cursor-pointer hover:bg-dark-depth-2/20 transition-all select-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/10 text-brand-400 rounded-xl border border-brand-500/20">
                <HeartCrack className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">2. Exit Discipline</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Identifies weak holdings held too long, and flags panic exits on broad market down days.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-500">
                Consider Exit: {displayedConsiderExits.length} | Panic Sells: {data.panicSellsCount}
              </span>
              {collapsed.exit ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
            </div>
          </div>

          {!collapsed.exit && (
            <div className="p-5 border-t border-dark-border/40 bg-dark-depth-2/10 space-y-6">
              
              {/* Weak stocks exit card */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-bold text-white uppercase tracking-wider">🚨 Stocks flagged: "Consider Exit"</h5>
                {displayedConsiderExits.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dark-border bg-emerald-500/5 text-emerald-500 text-[11px] font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4.5 h-4.5" />
                    <span>No active holdings currently meet the 3-criteria weak stock definition. Great discipline!</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {displayedConsiderExits.map((ce) => (
                      <div key={ce.symbol} className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 text-rose-500 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{ce.symbol}</span>
                          <span className="text-[8px] font-extrabold bg-rose-500/15 text-rose-500 border border-rose-500/20 px-2 py-0.5 rounded-full">CRITICAL WARNING</span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed">{ce.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Panic sell explanation */}
              <div className="space-y-4 pt-4 border-t border-dark-border/20">
                <h5 className="text-[10px] font-bold text-white uppercase tracking-wider">Panic sells summary (this month / all time)</h5>
                
                <div className="grid grid-cols-2 gap-4 text-center max-w-sm">
                  <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border">
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Panic Sells This Period</span>
                    <span className="text-2xl font-extrabold text-white block mt-1">{data.panicSellsCount}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border">
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Early Exits Count</span>
                    <span className="text-xl font-extrabold text-white block mt-1">{data.earlyExitsCount} trades</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border text-xs text-gray-400 leading-relaxed">
                  <p className="font-bold text-white flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    How Panic Selling is Detected:
                  </p>
                  <p className="text-[11px]">
                    Selling a stock at a loss on a day when the market (Nifty 50) closed <strong>down 1.5% or more</strong>, without the stock having hit your predefined stop-loss level. This reflects panic/emotional herd-selling.
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Card 3: Profit Booking Discipline */}
        <div className="glass-panel rounded-2xl border border-dark-border overflow-hidden">
          <div 
            onClick={() => toggleCollapsed('booking')}
            className="p-5 flex items-center justify-between cursor-pointer hover:bg-dark-depth-2/20 transition-all select-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/10 text-brand-400 rounded-xl border border-brand-500/20">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">3. Profit Booking Discipline</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Monitors if targets are met, and audits annualized returns and "sold too early" trends.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                Target Hit Rate: {data.targetHitRate}%
              </span>
              {collapsed.booking ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
            </div>
          </div>

          {!collapsed.booking && (
            <div className="p-5 border-t border-dark-border/40 bg-dark-depth-2/10 space-y-6">
              
              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border">
                  <span className="text-[9px] text-gray-500 uppercase font-bold block">Avg Annualised Return</span>
                  <span className="text-xl font-extrabold text-white block mt-1">{data.avgAnnualizedReturn}%</span>
                </div>
                <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border">
                  <span className="text-[9px] text-gray-500 uppercase font-bold block">Target Hit Rate</span>
                  <span className="text-xl font-extrabold text-white block mt-1">{data.targetHitRate}%</span>
                </div>
                <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border">
                  <span className="text-[9px] text-gray-500 uppercase font-bold block">Sold Early (10-Day post rise)</span>
                  <span className="text-xl font-extrabold text-white block mt-1">{data.earlyExitsCount} trades</span>
                </div>
              </div>

              {/* Profit Targets info */}
              <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border text-xs text-gray-400 leading-relaxed">
                <p className="font-bold text-white flex items-center gap-1.5 mb-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Profit Target Guidelines:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li><strong>Bounce / Momentum (Hold &lt; 30 Days):</strong> Exit at <strong>15% return</strong> target.</li>
                  <li><strong>Slow / Steady (Hold &gt; 30 Days):</strong> Exit at <strong>8% to 9% return</strong> target.</li>
                  <li><strong>Core Hold:</strong> Book 80% at any significant high, keep 20% core long-term.</li>
                </ul>
              </div>

              {/* Closed Trades Audit Timeline */}
              <div className="space-y-4 pt-4 border-t border-dark-border/20">
                <h5 className="text-[10px] font-bold text-white uppercase tracking-wider">Closed Trades Audit Log (Filtered Period)</h5>
                
                {displayedClosedTrades.length === 0 ? (
                  <p className="text-[11px] text-gray-500">No closed trades found for this view.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[10px] text-gray-400 min-w-[700px]">
                      <thead>
                        <tr className="border-b border-dark-border/40 text-gray-500">
                          <th className="pb-2">Stock</th>
                          <th className="pb-2">Exited On</th>
                          <th className="pb-2">Hold Days</th>
                          <th className="pb-2">Exit Price</th>
                          <th className="pb-2">Return %</th>
                          <th className="pb-2">Annualised ROI</th>
                          <th className="pb-2">Audit Tag</th>
                          <th className="pb-2">10-Day Post Exit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedClosedTrades.map((t, idx) => (
                          <tr key={idx} className="border-b border-dark-border/20 hover:bg-dark-depth-2/40">
                            <td className="py-2 font-bold text-white">{t.stock_symbol}</td>
                            <td className="py-2">{new Date(t.sell_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                            <td className="py-2">{t.holding_days} Days</td>
                            <td className="py-2 font-semibold">₹{t.sell_price.toFixed(2)}</td>
                            <td className={`py-2 font-bold ${t.realized_pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {t.return_pct > 0 ? '+' : ''}{t.return_pct}%
                            </td>
                            <td className="py-2">{t.annualized_return}%</td>
                            <td className="py-2">
                              <span 
                                className="px-1.5 py-0.5 rounded-full border text-[8px] font-bold"
                                style={
                                  t.is_panic_sell
                                    ? getBadgeStyle('Warning')
                                    : t.is_target_hit
                                    ? getBadgeStyle('Compliant')
                                    : getBadgeStyle('Neutral')
                                }
                              >
                                {t.is_panic_sell ? 'Panic Sell' : t.is_target_hit ? 'Target Hit' : 'Planned exit'}
                              </span>
                            </td>
                            <td className="py-2 text-[9px]">
                              {t.is_early_exit ? (
                                <span className="text-amber-500 font-medium">
                                  Reached ₹{t.post_exit_price} (+{t.post_exit_change}%)
                                </span>
                              ) : (
                                <span className="text-gray-500">Normal</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Card 4: Long-Term Planner */}
        <div className="glass-panel rounded-2xl border border-dark-border overflow-hidden">
          <div 
            onClick={() => toggleCollapsed('planning')}
            className="p-5 flex items-center justify-between cursor-pointer hover:bg-dark-depth-2/20 transition-all select-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/10 text-brand-400 rounded-xl border border-brand-500/20">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">4. Long-Term Position Planner</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Applies profit-harvesting rules, suggests partial exits, and re-entry dip levels.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-500">
                Core Holds Tagged: {data.longTermPlanner.length}
              </span>
              {collapsed.planning ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
            </div>
          </div>

          {!collapsed.planning && (
            <div className="p-5 border-t border-dark-border/40 bg-dark-depth-2/10 space-y-4">
              
              {displayedLongTermPlanner.length === 0 ? (
                <div className="p-6 text-center text-gray-400 space-y-2 select-none border border-dark-border rounded-xl">
                  <AlertTriangle className="w-8 h-8 text-gray-600 mx-auto" />
                  <p className="text-xs font-semibold text-gray-300">No Core Hold stocks tagged</p>
                  <p className="text-[10px] max-w-sm mx-auto leading-relaxed text-gray-500">
                    Go to the <strong>Holdings</strong> page and tag your long-term fundamentally strong stocks (e.g. Dabur, Asian Paints) as "Core Hold" to unlock harvesting split proposals.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {displayedLongTermPlanner.map((plan) => (
                    <div key={plan.symbol} className="p-4 rounded-xl border border-dark-border bg-dark-depth-3/30 space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-lg" />
                      
                      <div className="flex items-center justify-between border-b border-dark-border/30 pb-2">
                        <div>
                          <span className="text-xs font-bold text-white">{plan.symbol}</span>
                          <span className="text-[9px] text-gray-500 ml-1.5">{plan.name}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${plan.return >= 0 ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 border-rose-500/10 text-rose-500'}`}>
                          {plan.return >= 0 ? '+' : ''}{plan.return}% Return
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-400">
                        <div>
                          <span>Total Shares</span>
                          <span className="block font-bold text-white mt-0.5">{plan.qty} qty</span>
                        </div>
                        <div>
                          <span>Current LTP</span>
                          <span className="block font-bold text-white mt-0.5">₹{plan.ltp?.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-dark-depth-2/60 border border-dark-border/40 text-[10px] space-y-2 leading-relaxed">
                        <span className="font-bold text-amber-500 flex items-center gap-1 uppercase tracking-wider text-[9px]">
                          <Zap className="w-3 h-3 text-amber-500" />
                          Suggested Planner split:
                        </span>
                        
                        <div className="flex justify-between">
                          <span>Book Profit (Sell Qty):</span>
                          <strong className="text-white">{plan.sellQty} qty</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Keep Core (Hold Qty):</span>
                          <strong className="text-white">{plan.holdQty} qty</strong>
                        </div>
                        <div className="flex justify-between border-t border-dark-border/30 pt-1.5 mt-1">
                          <span className="text-amber-400 font-bold">Suggested Re-Entry Level:</span>
                          <strong className="text-white">₹{plan.reentryLevel}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>

        {/* Card 5: Behavioural Patterns */}
        <div className="glass-panel rounded-2xl border border-dark-border overflow-hidden">
          <div 
            onClick={() => toggleCollapsed('patterns')}
            className="p-5 flex items-center justify-between cursor-pointer hover:bg-dark-depth-2/20 transition-all select-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/10 text-brand-400 rounded-xl border border-brand-500/20">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">5. Behavioral Pattern Detection</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Flags revenge buying, FOMO entries, over-averaging, and panic sells.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-500">
                Violations Count: {data.violationsCount}
              </span>
              {collapsed.patterns ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
            </div>
          </div>

          {!collapsed.patterns && (
            <div className="p-5 border-t border-dark-border/40 bg-dark-depth-2/10 space-y-6">
              
              {/* MoM Chart */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-bold text-white uppercase tracking-wider">Monthly Behaviour summary (MoM Violations count)</h5>
                
                <div className="w-full h-56 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.monthlyPatterns}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    >
                      <XAxis type="number" stroke="#5F768E" fontSize={10} />
                      <YAxis dataKey="month" type="category" stroke="#5F768E" fontSize={10} width={60} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#090B10', border: '1px solid #1C2434', borderRadius: '12px' }}
                        itemStyle={{ fontSize: '10px' }}
                        labelStyle={{ fontSize: '10px', color: '#fff', fontWeight: 'bold' }}
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '9px' }} />
                      <Bar dataKey="revenge" name="Revenge Buying" fill="#EF4444" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="fomo" name="FOMO Entry" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="overAvg" name="Over-Averaging" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="panic" name="Panic Selling" fill="#F97316" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="early" name="Early Exit" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Explanation grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-dark-border bg-dark-depth-3/40">
                  <strong className="text-white block font-bold mb-1 uppercase tracking-wider text-[9px]">Revenge Buying</strong>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Buying back the same stock within 7 days of selling it at a loss. Often driven by frustration and a desire to "make the money back" immediately.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-dark-border bg-dark-depth-3/40">
                  <strong className="text-white block font-bold mb-1 uppercase tracking-wider text-[9px]">FOMO Entry</strong>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Chasing a stock that has already run up 10%+ in the preceding 5 calendar days. Driven by "Fear of Missing Out" on price action.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-dark-border bg-dark-depth-3/40">
                  <strong className="text-white block font-bold mb-1 uppercase tracking-wider text-[9px]">Over-Averaging</strong>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Exceeding the 3-tranche averaging rule. Throwing good money after bad in a deteriorating stock instead of executing an exit decision.
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Card 6: Performance Analytics */}
        <div className="glass-panel rounded-2xl border border-dark-border overflow-hidden">
          <div 
            onClick={() => toggleCollapsed('analytics')}
            className="p-5 flex items-center justify-between cursor-pointer hover:bg-dark-depth-2/20 transition-all select-none"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/10 text-brand-400 rounded-xl border border-brand-500/20">
                <LineChart className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">6. Performance Analytics</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Win rates, average holding times for winners vs losers, best/worst months, and realized P&L trends.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-brand-500/20 bg-brand-500/10 text-brand-400">
                Realised P&L: ₹{data.realizedPnL.toLocaleString('en-IN')}
              </span>
              {collapsed.analytics ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
            </div>
          </div>

          {!collapsed.analytics && (
            <div className="p-5 border-t border-dark-border/40 bg-dark-depth-2/10 space-y-6">
              
              {/* Analytics widgets grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. Win Rate Gauge */}
                <div className="p-4 rounded-xl border border-dark-border bg-dark-depth-3/30 flex flex-col items-center justify-between text-center relative">
                  <span className="text-[9px] text-gray-500 uppercase font-bold block mb-1">Win Rate %</span>
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Wins', value: data.winRate, fill: '#10B981' },
                            { name: 'Losses', value: 100 - data.winRate, fill: '#1E293B' }
                          ]}
                          dataKey="value"
                          innerRadius={35}
                          outerRadius={45}
                          startAngle={90}
                          endAngle={-270}
                          stroke="none"
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-extrabold text-white leading-none">{data.winRate.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                {/* 2. Avg Hold Days Winners vs Losers */}
                <div className="p-4 rounded-xl border border-dark-border bg-dark-depth-3/30 flex flex-col justify-between">
                  <span className="text-[9px] text-gray-500 uppercase font-bold block mb-3 text-center">Avg Holding Days (Winners vs Losers)</span>
                  <div className="w-full h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: 'Hold Period', Winners: data.avgWinnerHold, Losers: data.avgLoserHold }
                        ]}
                        margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                      >
                        <XAxis dataKey="name" stroke="#5F768E" fontSize={10} tick={false} />
                        <YAxis stroke="#5F768E" fontSize={10} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#090B10', border: '1px solid #1C2434', borderRadius: '12px' }}
                        />
                        <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: '9px' }} />
                        <Bar dataKey="Winners" fill="#10B981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Losers" fill="#EF4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. Monthly P&L Trend (Green/Red bars) */}
                <div className="p-4 rounded-xl border border-dark-border bg-dark-depth-3/30 flex flex-col justify-between md:col-span-2">
                  <span className="text-[9px] text-gray-500 uppercase font-bold block mb-3 text-center">Monthly realized P&L trend</span>
                  <div className="w-full h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.monthlyPnLTrend}>
                        <XAxis dataKey="month" stroke="#5F768E" fontSize={10} />
                        <YAxis stroke="#5F768E" fontSize={10} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#090B10', border: '1px solid #1C2434', borderRadius: '12px' }}
                          labelStyle={{ fontSize: '10px', color: '#fff', fontWeight: 'bold' }}
                          itemStyle={{ fontSize: '10px' }}
                        />
                        <Bar dataKey="pnl">
                          {data.monthlyPnLTrend.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10B981' : '#EF4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Best/Worst Trades & Months */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:col-span-2">
                  <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border text-center">
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Best Trade</span>
                    <span className="text-xs font-bold text-white block mt-1">
                      {data.bestTrade ? `${data.bestTrade.symbol} (+${data.bestTrade.return.toFixed(1)}%)` : 'N/A'}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border text-center">
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Worst Trade</span>
                    <span className="text-xs font-bold text-white block mt-1 border-rose-500/10">
                      {data.worstTrade ? `${data.worstTrade.symbol} (${data.worstTrade.return.toFixed(1)}%)` : 'N/A'}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border text-center">
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Best Month</span>
                    <span className="text-xs font-bold text-emerald-500 block mt-1">
                      {data.bestMonth ? `${data.bestMonth.month} (₹${data.bestMonth.pnl.toLocaleString('en-IN')})` : 'N/A'}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-dark-depth-3/40 border border-dark-border text-center">
                    <span className="text-[9px] text-gray-500 uppercase font-bold block">Worst Month</span>
                    <span className="text-xs font-bold text-rose-500 block mt-1">
                      {data.worstMonth ? `${data.worstMonth.month} (₹${Math.abs(data.worstMonth.pnl).toLocaleString('en-IN')})` : 'N/A'}
                    </span>
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>

      </div>

    </div>
  );
};
