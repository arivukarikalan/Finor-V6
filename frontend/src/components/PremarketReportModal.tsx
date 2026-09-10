import React, { useState, useEffect } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Globe2, 
  Sparkles, 
  Compass, 
  Clock, 
  Briefcase, 
  Layers, 
  Calendar, 
  ShieldCheck,
  Zap,
  ArrowUpRight,
  ArrowLeft
} from 'lucide-react';

export interface PremarketReport {
  report_title: string;
  report_subtitle: string;
  date: string;
  generated_at: string;
  market_bias: string;
  opening_estimate: string;
  headline: string;
  global_cues: Array<{
    key: string;
    ticker: string;
    name: string;
    region: string;
    data: {
      symbol: string;
      price: number;
      prevClose: number;
      change: number;
      changePct: number;
      high: number;
      low: number;
    };
  }>;
  nifty_levels: {
    current: number;
    change_pct: number;
    pivots: {
      pivot: number;
      r1: number;
      r2: number;
      s1: number;
      s2: number;
    };
  };
  holdings_count: number;
  holdings_radar: Array<{
    symbol: string;
    quantity: number;
    avg_price: number;
    current_price: number;
    unrealized_pnl: number;
    headline: string;
    headline_source: string;
    headline_url: string | null;
    sentiment: string;
    upcoming_event: string | null;
  }>;
  in_focus_holdings: Array<{
    symbol: string;
    quantity: number;
    avg_price: number;
    current_price: number;
    unrealized_pnl: number;
    headline: string;
    headline_source: string;
    headline_url: string | null;
    sentiment: string;
    upcoming_event: string | null;
  }>;
  sector_watch: Array<{
    sector: string;
    outlook: string;
    note: string;
  }>;
  tactical_gameplan: string[];
}

interface PremarketReportModalProps {
  isOpen: boolean;
  report: PremarketReport | null;
  onClose: () => void;
  setActiveTab?: (tab: any) => void;
}

export const PremarketReportModal: React.FC<PremarketReportModalProps> = ({
  isOpen,
  report,
  onClose,
  setActiveTab
}) => {
  const [activeTab, setActiveModalTab] = useState<'overview' | 'holdings' | 'global' | 'strategy'>('overview');
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('light') || localStorage.getItem('finor_theme') === 'light';
  });

  // Automatically reset to Overview whenever modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setActiveModalTab('overview');
    }
  }, [isOpen]);

  // Sync theme changes dynamically
  useEffect(() => {
    const checkTheme = () => {
      setIsLightMode(document.documentElement.classList.contains('light') || localStorage.getItem('finor_theme') === 'light');
    };
    window.addEventListener('storage', checkTheme);
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      window.removeEventListener('storage', checkTheme);
      observer.disconnect();
    };
  }, []);

  const handleClose = () => {
    setActiveModalTab('overview');
    onClose();
  };

  const formatPnl = (val: number) => {
    const sign = val < 0 ? '-' : val > 0 ? '+' : '';
    const abs = Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return `${sign}₹${abs}`;
  };

  if (!isOpen || !report) return null;

  const isBullish = report.market_bias.includes('BULLISH');
  const isBearish = report.market_bias.includes('BEARISH');

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[150] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className={`w-full max-w-4xl max-h-[92vh] rounded-3xl border flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${
        isLightMode 
          ? 'bg-white text-slate-900 border-slate-200 shadow-slate-900/10' 
          : 'glass-panel bg-dark-depth-1/95 text-white border-dark-border'
      }`}>
        
        {/* Header Banner - High contrast & Theme Aware */}
        <div className={`p-5 sm:p-6 border-b relative overflow-hidden transition-colors ${
          isLightMode 
            ? 'bg-gradient-to-br from-indigo-50/70 via-slate-50 to-white border-slate-200' 
            : 'bg-dark-depth-2/95 border-dark-border/60'
        }`}>
          <div className="flex items-start justify-between relative z-10 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                  isLightMode
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                }`}>
                  <Clock className="w-3 h-3" /> 8:00 AM Morning Bell
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                  isBullish
                    ? (isLightMode ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400')
                    : isBearish
                    ? (isLightMode ? 'bg-rose-100 border-rose-300 text-rose-800' : 'bg-rose-500/10 border-rose-500/30 text-rose-400')
                    : (isLightMode ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-amber-500/10 border-amber-500/30 text-amber-400')
                }`}>
                  {isBullish ? <TrendingUp className="w-3 h-3" /> : isBearish ? <TrendingDown className="w-3 h-3" /> : <Compass className="w-3 h-3" />}
                  {report.market_bias} Handover
                </span>
              </div>
              <h2 className={`text-lg sm:text-xl font-black tracking-tight ${
                isLightMode ? 'text-slate-900 font-display' : 'text-white font-display'
              }`}>
                {report.report_title}
              </h2>
              <p className={`text-xs mt-0.5 font-medium ${
                isLightMode ? 'text-slate-500' : 'text-gray-400'
              }`}>
                {report.opening_estimate} • Published at {report.generated_at} IST
              </p>
            </div>

            <button
              onClick={handleClose}
              className={`p-2 rounded-xl transition-all cursor-pointer shrink-0 ${
                isLightMode 
                  ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-200/80' 
                  : 'text-gray-400 hover:text-white hover:bg-dark-depth-3'
              }`}
              title="Close Report"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dedicated Sticky Sub-Navigation Tabs Bar */}
        <div className={`px-4 sm:px-6 py-2.5 border-b flex items-center gap-2 overflow-x-auto scrollbar-none select-none shrink-0 ${
          isLightMode 
            ? 'bg-slate-50/90 border-slate-200' 
            : 'bg-dark-depth-2/80 border-dark-border/60'
        }`}>
          {[
            { id: 'overview', label: 'Executive Overview', icon: Sparkles },
            { id: 'holdings', label: `Holdings Radar (${report.holdings_radar?.length || 0})`, icon: Briefcase },
            { id: 'global', label: `Global Cues (${report.global_cues?.length || 0})`, icon: Globe2 },
            { id: 'strategy', label: 'Tactical Playbook', icon: Zap }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveModalTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                    : isLightMode
                    ? 'text-slate-600 bg-white border border-slate-200/90 hover:bg-slate-100 hover:text-slate-900'
                    : 'text-gray-400 hover:text-white hover:bg-dark-depth-3/60 border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : isLightMode ? 'text-slate-500' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Report Body */}
        <div className={`flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-xs scrollbar-thin ${
          isLightMode ? 'text-slate-700 bg-slate-50/40' : 'text-gray-300'
        }`}>

          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Executive Headline Banner */}
              <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                isLightMode 
                  ? 'bg-white border-slate-200 shadow-sm' 
                  : 'bg-dark-depth-2/80 border-dark-border/80'
              }`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
                  isLightMode
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                    : 'bg-brand-500/20 border-brand-500/30 text-brand-400'
                }`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className={`text-sm font-extrabold leading-snug ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}>
                    {report.headline}
                  </h4>
                  <p className={`text-[11px] mt-1 leading-relaxed ${
                    isLightMode ? 'text-slate-600 font-medium' : 'text-gray-400'
                  }`}>
                    Overnight international markets delivered a {report.market_bias.toLowerCase()} handover. Dalal Street is expected to see a {report.opening_estimate.toLowerCase()}.
                  </p>
                </div>
              </div>

              {/* Nifty 50 Pivot Matrix Card */}
              <div className={`p-4 rounded-2xl border space-y-3 ${
                isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'glass-panel border-dark-border'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className={`w-4 h-4 ${isLightMode ? 'text-indigo-600' : 'text-indigo-400'}`} />
                    <span className={`font-extrabold text-xs uppercase tracking-wider ${
                      isLightMode ? 'text-slate-900' : 'text-white'
                    }`}>
                      Nifty 50 Technical Pivots
                    </span>
                  </div>
                  <span className={`text-[10px] font-semibold ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>
                    Last Close: ₹{report.nifty_levels.current.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2 text-center text-[10px]">
                  <div className={`p-2.5 rounded-xl border ${
                    isLightMode ? 'bg-rose-50/70 border-rose-200' : 'bg-rose-500/10 border-rose-500/20'
                  }`}>
                    <span className={`block font-bold text-[9px] uppercase ${isLightMode ? 'text-rose-700' : 'text-rose-400'}`}>Support 2</span>
                    <span className={`font-black text-xs mt-0.5 block ${isLightMode ? 'text-rose-900' : 'text-white'}`}>{report.nifty_levels.pivots.s2}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${
                    isLightMode ? 'bg-rose-50/40 border-rose-100' : 'bg-rose-500/5 border-rose-500/15'
                  }`}>
                    <span className={`block font-bold text-[9px] uppercase ${isLightMode ? 'text-rose-600' : 'text-rose-400/90'}`}>Support 1</span>
                    <span className={`font-black text-xs mt-0.5 block ${isLightMode ? 'text-rose-900' : 'text-white'}`}>{report.nifty_levels.pivots.s1}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${
                    isLightMode ? 'bg-indigo-50 border-indigo-200' : 'bg-indigo-500/15 border-indigo-500/30'
                  }`}>
                    <span className={`block font-bold text-[9px] uppercase ${isLightMode ? 'text-indigo-700' : 'text-indigo-300'}`}>Pivot Point</span>
                    <span className={`font-black text-xs mt-0.5 block ${isLightMode ? 'text-indigo-900' : 'text-indigo-200'}`}>{report.nifty_levels.pivots.pivot}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${
                    isLightMode ? 'bg-emerald-50/40 border-emerald-100' : 'bg-emerald-500/5 border-emerald-500/15'
                  }`}>
                    <span className={`block font-bold text-[9px] uppercase ${isLightMode ? 'text-emerald-600' : 'text-emerald-400/90'}`}>Resist 1</span>
                    <span className={`font-black text-xs mt-0.5 block ${isLightMode ? 'text-emerald-900' : 'text-white'}`}>{report.nifty_levels.pivots.r1}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${
                    isLightMode ? 'bg-emerald-50/70 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'
                  }`}>
                    <span className={`block font-bold text-[9px] uppercase ${isLightMode ? 'text-emerald-700' : 'text-emerald-400'}`}>Resist 2</span>
                    <span className={`font-black text-xs mt-0.5 block ${isLightMode ? 'text-emerald-900' : 'text-white'}`}>{report.nifty_levels.pivots.r2}</span>
                  </div>
                </div>
              </div>

              {/* Holdings in Focus Today Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className={`font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}>
                    <Briefcase className="w-3.5 h-3.5 text-brand-500" />
                    Holdings in Focus Today ({report.in_focus_holdings.length})
                  </h4>
                  <button
                    onClick={() => setActiveModalTab('holdings')}
                    className="text-[11px] font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    View All Holdings <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.in_focus_holdings.map((h, i) => (
                    <div 
                      key={i} 
                      className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-2 transition-all ${
                        isLightMode 
                          ? 'bg-white border-slate-200 shadow-sm hover:border-slate-300' 
                          : 'bg-dark-depth-2 border-dark-border/70 hover:border-dark-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`font-black text-sm ${isLightMode ? 'text-slate-900' : 'text-white'}`}>{h.symbol}</span>
                          <span className={`text-[10px] font-medium ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>Qty: {h.quantity}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                          h.sentiment === 'POSITIVE'
                            ? (isLightMode ? 'bg-emerald-100 border-emerald-200 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400')
                            : h.sentiment === 'NEGATIVE'
                            ? (isLightMode ? 'bg-rose-100 border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/20 text-rose-400')
                            : (isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300')
                        }`}>
                          {h.sentiment}
                        </span>
                      </div>

                      <p className={`text-[11px] line-clamp-2 leading-relaxed font-medium ${
                        isLightMode ? 'text-slate-700' : 'text-gray-300'
                      }`}>
                        {h.headline}
                      </p>

                      {h.upcoming_event && (
                        <div className={`mt-1 pt-1.5 border-t text-[10px] flex items-center gap-1 font-semibold ${
                          isLightMode ? 'border-slate-100 text-amber-700' : 'border-dark-border/40 text-amber-400'
                        }`}>
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span className="truncate">{h.upcoming_event}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sector Highlights */}
              <div className="space-y-3">
                <h4 className={`font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 ${
                  isLightMode ? 'text-slate-900' : 'text-white'
                }`}>
                  <Globe2 className="w-3.5 h-3.5 text-indigo-500" />
                  Sectoral Radar for Today
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {report.sector_watch.map((s, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-xl border text-[11px] space-y-1 ${
                        isLightMode 
                          ? 'bg-white border-slate-200 shadow-sm' 
                          : 'bg-dark-depth-2 border-dark-border/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-bold text-xs ${isLightMode ? 'text-slate-900' : 'text-white'}`}>{s.sector}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          s.outlook === 'Bullish' || s.outlook === 'Positive'
                            ? (isLightMode ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/10 text-emerald-400')
                            : (isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-gray-500/10 text-gray-400')
                        }`}>
                          {s.outlook}
                        </span>
                      </div>
                      <p className={`text-[10px] leading-snug ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>{s.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PERSONALIZED HOLDINGS RADAR */}
          {activeTab === 'holdings' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-dark-border/20">
                <div>
                  <h3 className={`font-extrabold text-sm ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    Personalized Portfolio News & Cues
                  </h3>
                  <p className={`text-[11px] ${isLightMode ? 'text-slate-500 font-medium' : 'text-gray-400'}`}>
                    Tracking news, ex-dates, and corporate actions across your {report.holdings_radar.length} portfolio positions.
                  </p>
                </div>
                <button
                  onClick={() => setActiveModalTab('overview')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 self-start sm:self-auto ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      : 'bg-dark-depth-2 hover:bg-dark-depth-3 text-gray-300 border border-dark-border/60'
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
                </button>
              </div>

              <div className="space-y-3">
                {report.holdings_radar.map((h, idx) => (
                  <div 
                    key={idx} 
                    className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                      isLightMode 
                        ? 'bg-white border-slate-200 shadow-sm hover:border-slate-300' 
                        : 'bg-dark-depth-2 border-dark-border flex-1 hover:border-dark-border/80'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className={`font-black text-sm tracking-tight ${isLightMode ? 'text-slate-900' : 'text-white'}`}>{h.symbol}</span>
                        <span className={`text-[10px] font-semibold ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>Qty: {h.quantity} • Buy: ₹{h.avg_price.toFixed(2)}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                          h.sentiment === 'POSITIVE'
                            ? (isLightMode ? 'bg-emerald-100 border-emerald-200 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400')
                            : h.sentiment === 'NEGATIVE'
                            ? (isLightMode ? 'bg-rose-100 border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/20 text-rose-400')
                            : (isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300')
                        }`}>
                          {h.sentiment}
                        </span>
                      </div>

                      <p className={`text-xs font-medium leading-relaxed ${isLightMode ? 'text-slate-700' : 'text-gray-200'}`}>
                        {h.headline}
                      </p>

                      <div className={`flex flex-wrap items-center gap-3 text-[10px] pt-0.5 ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>
                        <span className={`font-semibold ${isLightMode ? 'text-slate-400' : 'text-gray-500'}`}>Source: {h.headline_source}</span>
                        {h.upcoming_event && (
                          <span className={`font-bold flex items-center gap-1 ${isLightMode ? 'text-amber-700' : 'text-amber-400'}`}>
                            <Calendar className="w-3 h-3" />
                            {h.upcoming_event}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={`flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-2 md:pt-0 shrink-0 gap-1 text-right ${
                      isLightMode ? 'border-slate-100' : 'border-dark-border/40'
                    }`}>
                      <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>₹{h.current_price.toFixed(2)}</span>
                      <span className={`text-[10px] font-black ${
                        h.unrealized_pnl >= 0 
                          ? (isLightMode ? 'text-emerald-600' : 'text-emerald-400') 
                          : (isLightMode ? 'text-rose-600' : 'text-rose-400')
                      }`}>
                        {formatPnl(h.unrealized_pnl)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: GLOBAL MARKET SCORECARD */}
          {activeTab === 'global' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-dark-border/20">
                <div>
                  <h3 className={`font-extrabold text-sm ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    International Indices & Macro Dashboard
                  </h3>
                  <p className={`text-[11px] ${isLightMode ? 'text-slate-500 font-medium' : 'text-gray-400'}`}>
                    Live Asian, European, and US market handovers shaping morning sentiment.
                  </p>
                </div>
                <button
                  onClick={() => setActiveModalTab('overview')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 self-start sm:self-auto ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      : 'bg-dark-depth-2 hover:bg-dark-depth-3 text-gray-300 border border-dark-border/60'
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {report.global_cues.map((c, i) => {
                  const isUp = c.data.changePct >= 0;
                  return (
                    <div 
                      key={i} 
                      className={`p-4 rounded-2xl border flex flex-col justify-between gap-2 ${
                        isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-dark-depth-2 border-dark-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`font-black text-sm block ${isLightMode ? 'text-slate-900' : 'text-white'}`}>{c.name}</span>
                          <span className={`text-[9px] uppercase tracking-wider font-semibold ${isLightMode ? 'text-slate-400' : 'text-gray-500'}`}>{c.region}</span>
                        </div>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          isUp 
                            ? (isLightMode ? 'bg-emerald-100 border-emerald-200 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400')
                            : (isLightMode ? 'bg-rose-100 border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/20 text-rose-400')
                        }`}>
                          {isUp ? '+' : ''}{c.data.changePct.toFixed(2)}%
                        </span>
                      </div>

                      <div className={`flex items-baseline justify-between pt-2 border-t ${
                        isLightMode ? 'border-slate-100' : 'border-dark-border/30'
                      }`}>
                        <span className={`text-xs font-black ${isLightMode ? 'text-slate-800' : 'text-gray-200'}`}>
                          {c.key === 'crude' || c.key === 'gold' ? '$' : c.key === 'usdinr' ? '₹' : ''}
                          {c.data.price.toLocaleString('en-IN')}
                        </span>
                        <span className={`text-[10px] font-bold ${
                          isUp 
                            ? (isLightMode ? 'text-emerald-600' : 'text-emerald-500') 
                            : (isLightMode ? 'text-rose-600' : 'text-rose-500')
                        }`}>
                          {isUp ? '+' : ''}{c.data.change.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: TACTICAL PLAYBOOK */}
          {activeTab === 'strategy' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-dark-border/20">
                <div className="space-y-0.5">
                  <h3 className={`font-extrabold text-sm ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    Tactical Execution Playbook
                  </h3>
                  <p className={`text-[11px] ${isLightMode ? 'text-slate-500 font-medium' : 'text-gray-400'}`}>
                    Day trading rules and bias execution strategy for today's market session.
                  </p>
                </div>
                <button
                  onClick={() => setActiveModalTab('overview')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 self-start sm:self-auto ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      : 'bg-dark-depth-2 hover:bg-dark-depth-3 text-gray-300 border border-dark-border/60'
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
                </button>
              </div>

              <div className={`p-4 rounded-2xl border space-y-1 ${
                isLightMode 
                  ? 'bg-indigo-50/70 border-indigo-200' 
                  : 'bg-brand-500/10 border-brand-500/20'
              }`}>
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${
                  isLightMode ? 'text-indigo-700' : 'text-brand-400'
                }`}>
                  Morning Trading Stance
                </span>
                <h3 className={`text-base font-black ${isLightMode ? 'text-slate-900' : 'text-white'}`}>{report.opening_estimate}</h3>
              </div>

              <div className="space-y-3">
                <h4 className={`font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 ${
                  isLightMode ? 'text-slate-900' : 'text-white'
                }`}>
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Tactical Execution Rules for Today
                </h4>
                <div className="space-y-2">
                  {report.tactical_gameplan.map((rule, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
                        isLightMode 
                          ? 'bg-white border-slate-200 text-slate-800 shadow-sm' 
                          : 'bg-dark-depth-2 border-dark-border text-gray-200'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full font-bold flex items-center justify-center shrink-0 text-[10px] border ${
                        isLightMode 
                          ? 'bg-indigo-100 border-indigo-200 text-indigo-700' 
                          : 'bg-dark-depth-3 border-dark-border text-brand-400'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="font-medium">{rule}</span>
                    </div>
                  ))}
                </div>
              </div>

              {setActiveTab && (
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => {
                      handleClose();
                      setActiveTab('orders');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-extrabold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-brand-600/20"
                  >
                    Go to Orders Terminal <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      handleClose();
                      setActiveTab('ai-chat');
                    }}
                    className={`px-4 py-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                      isLightMode 
                        ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-sm' 
                        : 'bg-dark-depth-2 hover:bg-dark-depth-3 border-dark-border text-gray-200'
                    }`}
                  >
                    Discuss with Finor AI Coach
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex items-center justify-between text-[10px] shrink-0 ${
          isLightMode 
            ? 'bg-slate-50 border-slate-200 text-slate-500' 
            : 'bg-dark-depth-2/60 border-dark-border/60 text-gray-500'
        }`}>
          <span>Finor Morning Bell Intelligence • Automated at 8:00 AM IST</span>
          <button
            onClick={handleClose}
            className={`px-4 py-1.5 rounded-xl border font-bold cursor-pointer transition-colors ${
              isLightMode 
                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-sm' 
                : 'bg-dark-depth-3 hover:bg-dark-depth-2 border-dark-border text-gray-300'
            }`}
          >
            Dismiss
          </button>
        </div>

      </div>
    </div>
  );
};
