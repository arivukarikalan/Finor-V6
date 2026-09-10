import React, { useState } from 'react';
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
  ArrowUpRight
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

  if (!isOpen || !report) return null;

  const isBullish = report.market_bias.includes('BULLISH');
  const isBearish = report.market_bias.includes('BEARISH');

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[150] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-4xl max-h-[92vh] rounded-3xl border border-dark-border bg-dark-depth-1/95 text-white flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header Banner */}
        <div className="p-5 sm:p-6 border-b border-dark-border/60 relative overflow-hidden bg-gradient-to-r from-dark-depth-2 via-dark-depth-2/80 to-dark-depth-3/60">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-20 bg-brand-500" />
          
          <div className="flex items-start justify-between relative z-10 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> 8:00 AM Morning Bell
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                  isBullish
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : isBearish
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  {isBullish ? <TrendingUp className="w-3 h-3" /> : isBearish ? <TrendingDown className="w-3 h-3" /> : <Compass className="w-3 h-3" />}
                  {report.market_bias} Handover
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black font-display text-white tracking-tight">
                {report.report_title}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {report.opening_estimate} • Published at {report.generated_at} IST
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-dark-depth-3 transition-all cursor-pointer shrink-0"
              title="Close Report"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-2 mt-5 overflow-x-auto scrollbar-none select-none">
            {[
              { id: 'overview', label: '📰 Executive Overview', icon: Sparkles },
              { id: 'holdings', label: `🎯 Holdings Radar (${report.holdings_radar.length})`, icon: Briefcase },
              { id: 'global', label: '🌍 Global Cues', icon: Globe2 },
              { id: 'strategy', label: '⚡ Tactical Playbook', icon: Zap }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveModalTab(tab.id as any)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                      : 'text-gray-400 hover:text-white hover:bg-dark-depth-3/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Report Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-xs text-gray-300 scrollbar-thin">

          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Executive Headline Banner */}
              <div className="p-4 rounded-2xl bg-dark-depth-2/80 border border-dark-border/80 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white leading-snug">
                    {report.headline}
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                    Overnight international markets delivered a {report.market_bias.toLowerCase()} handover. Dalal Street is expected to see a {report.opening_estimate.toLowerCase()}.
                  </p>
                </div>
              </div>

              {/* Nifty 50 Pivot Matrix Card */}
              <div className="glass-panel p-4 rounded-2xl border border-dark-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span className="font-extrabold text-white text-xs uppercase tracking-wider">
                      Nifty 50 Technical Pivots
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">
                    Last Close: ₹{report.nifty_levels.current.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2 text-center text-[10px]">
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <span className="text-rose-400 block font-bold text-[9px] uppercase">Support 2</span>
                    <span className="font-black text-white text-xs mt-0.5 block">{report.nifty_levels.pivots.s2}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/15">
                    <span className="text-rose-400/90 block font-bold text-[9px] uppercase">Support 1</span>
                    <span className="font-black text-white text-xs mt-0.5 block">{report.nifty_levels.pivots.s1}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30">
                    <span className="text-indigo-300 block font-bold text-[9px] uppercase">Pivot Point</span>
                    <span className="font-black text-indigo-200 text-xs mt-0.5 block">{report.nifty_levels.pivots.pivot}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                    <span className="text-emerald-400/90 block font-bold text-[9px] uppercase">Resist 1</span>
                    <span className="font-black text-white text-xs mt-0.5 block">{report.nifty_levels.pivots.r1}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-emerald-400 block font-bold text-[9px] uppercase">Resist 2</span>
                    <span className="font-black text-white text-xs mt-0.5 block">{report.nifty_levels.pivots.r2}</span>
                  </div>
                </div>
              </div>

              {/* Holdings in Focus Today Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-brand-400" />
                    Holdings in Focus Today ({report.in_focus_holdings.length})
                  </h4>
                  <button
                    onClick={() => setActiveModalTab('holdings')}
                    className="text-[10px] font-bold text-brand-400 hover:text-brand-300 flex items-center gap-1 cursor-pointer"
                  >
                    View All Holdings <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.in_focus_holdings.map((h, i) => (
                    <div key={i} className="p-3.5 rounded-2xl bg-dark-depth-2 border border-dark-border/70 flex flex-col justify-between gap-2 hover:border-dark-border transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-sm">{h.symbol}</span>
                          <span className="text-[10px] text-gray-400 font-medium">Qty: {h.quantity}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                          h.sentiment === 'POSITIVE'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : h.sentiment === 'NEGATIVE'
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
                        }`}>
                          {h.sentiment}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed font-medium">
                        {h.headline}
                      </p>

                      {h.upcoming_event && (
                        <div className="mt-1 pt-1.5 border-t border-dark-border/40 text-[10px] text-amber-400 flex items-center gap-1 font-semibold">
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
                <h4 className="font-extrabold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 text-indigo-400" />
                  Sectoral Radar for Today
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {report.sector_watch.map((s, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-dark-depth-2 border border-dark-border/50 text-[11px] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-xs">{s.sector}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          s.outlook === 'Bullish'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : s.outlook === 'Positive'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-gray-500/10 text-gray-400'
                        }`}>
                          {s.outlook}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 leading-snug">{s.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PERSONALIZED HOLDINGS RADAR */}
          {activeTab === 'holdings' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-white text-sm">Personalized Portfolio News & Cues</h3>
                  <p className="text-[11px] text-gray-400">Tracking news, ex-dates, and corporate actions across your {report.holdings_radar.length} portfolio positions.</p>
                </div>
              </div>

              <div className="space-y-3">
                {report.holdings_radar.map((h, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-dark-depth-2 border border-dark-border flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-dark-border/80 transition-all">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="font-black text-white text-sm tracking-tight">{h.symbol}</span>
                        <span className="text-[10px] text-gray-400 font-semibold">Qty: {h.quantity} • Buy: ₹{h.avg_price.toFixed(2)}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                          h.sentiment === 'POSITIVE'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : h.sentiment === 'NEGATIVE'
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
                        }`}>
                          {h.sentiment}
                        </span>
                      </div>

                      <p className="text-xs text-gray-200 font-medium leading-relaxed">
                        {h.headline}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400 pt-0.5">
                        <span className="text-gray-500 font-semibold">Source: {h.headline_source}</span>
                        {h.upcoming_event && (
                          <span className="text-amber-400 font-bold flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {h.upcoming_event}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-2 md:pt-0 border-dark-border/40 shrink-0 gap-1 text-right">
                      <span className="text-xs font-bold text-white">₹{h.current_price.toFixed(2)}</span>
                      <span className={`text-[10px] font-bold ${h.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {h.unrealized_pnl >= 0 ? '+' : ''}₹{h.unrealized_pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
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
              <h3 className="font-extrabold text-white text-sm">International Indices & Macro Dashboard</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {report.global_cues.map((c, i) => {
                  const isUp = c.data.changePct >= 0;
                  return (
                    <div key={i} className="p-4 rounded-2xl bg-dark-depth-2 border border-dark-border flex flex-col justify-between gap-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-black text-white text-sm block">{c.name}</span>
                          <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">{c.region}</span>
                        </div>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          isUp ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                          {isUp ? '+' : ''}{c.data.changePct.toFixed(2)}%
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between pt-2 border-t border-dark-border/30">
                        <span className="text-xs font-black text-gray-200">
                          {c.key === 'crude' || c.key === 'gold' ? '$' : c.key === 'usdinr' ? '₹' : ''}
                          {c.data.price.toLocaleString('en-IN')}
                        </span>
                        <span className={`text-[10px] font-bold ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
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
              <div className="p-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 space-y-1">
                <span className="text-[10px] text-brand-400 font-extrabold uppercase tracking-wider">Morning Trading Stance</span>
                <h3 className="text-base font-black text-white">{report.opening_estimate}</h3>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Tactical Execution Rules for Today
                </h4>
                <div className="space-y-2">
                  {report.tactical_gameplan.map((rule, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-dark-depth-2 border border-dark-border flex items-start gap-3 text-xs leading-relaxed">
                      <span className="w-5 h-5 rounded-full bg-dark-depth-3 border border-dark-border text-brand-400 font-bold flex items-center justify-center shrink-0 text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="text-gray-200 font-medium">{rule}</span>
                    </div>
                  ))}
                </div>
              </div>

              {setActiveTab && (
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={() => {
                      onClose();
                      setActiveTab('orders');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-extrabold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-brand-500/20"
                  >
                    Go to Orders Terminal <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      setActiveTab('ai-chat');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-gray-200 font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    Discuss with Finor AI Coach
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-dark-border/60 bg-dark-depth-2/60 flex items-center justify-between text-[10px] text-gray-500">
          <span>Finor Morning Bell Intelligence • Automated at 8:00 AM IST</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-dark-depth-3 hover:bg-dark-depth-2 border border-dark-border text-gray-300 font-bold cursor-pointer transition-colors"
          >
            Dismiss
          </button>
        </div>

      </div>
    </div>
  );
};
