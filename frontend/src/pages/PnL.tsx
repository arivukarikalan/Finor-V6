import { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../services/api';
import { marked } from 'marked';
import { CustomAlertModal } from '../components/CustomAlertModal';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  CartesianGrid
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Clock, 
  AlertCircle,
  Search,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  X,
  Sparkles,
  Flame,
  Percent,
  PieChart,
  CircleDollarSign,
  Activity,
  Download,
  Printer,
  MoreVertical
} from 'lucide-react';

interface TradeCharges {
  brokerage: number;
  stt: number;
  exchange_charges: number;
  sebi_charges: number;
  stamp_duty: number;
  gst: number;
  dp_charges: number;
  total_charges: number;
}

interface ClosedTrade {
  stock_symbol: string;
  buy_date: string;
  sell_date: string;
  quantity: number;
  buy_price: number;
  sell_price: number;
  realized_pnl: number;
  charges?: TradeCharges;
  net_realized_pnl?: number;
  is_fno?: boolean;
  contract_type?: 'OPTION_CE' | 'OPTION_PE' | 'FUTURES' | 'EQUITY';
  holding_days: number;
  gains_type: 'STCG' | 'LTCG';
  buy_date_display?: string;
  sell_date_display?: string;
}

interface ChargesBreakdown {
  brokerage: number;
  stt: number;
  exchange_charges: number;
  sebi_charges: number;
  stamp_duty: number;
  gst: number;
  dp_charges: number;
}

interface PnLSummary {
  total_realized_pnl: number;
  net_realized_pnl?: number;
  total_charges?: number;
  stcg: number;
  ltcg: number;
  trades_count?: number;
  charges_breakdown?: ChargesBreakdown;
}

const CustomPnLTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isProfit = data.pnl >= 0;
    return (
      <div className="glass-panel p-3.5 border border-dark-border rounded-xl shadow-2xl bg-dark-depth-3/95 text-xs backdrop-blur-md">
        <p className="font-extrabold text-white border-b border-dark-border/40 pb-1 mb-1.5">{data.month}</p>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 font-medium">Realized P&L:</span>
          <span className={`font-extrabold ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isProfit ? '+' : ''}₹{data.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

// ─── Portfolio Time Machine Viewer Component ─────────────────────────────
interface TimeMachineViewProps {
  snapshots: any[];
  loading: boolean;
  selectedSnapshot: any;
  setSelectedSnapshot: (snapshot: any) => void;
  handleSaveSnapshot: () => void;
  saving: boolean;
  handleInitializeHistory: () => void;
  initializingHistory: boolean;
}

const TimeMachineView: React.FC<TimeMachineViewProps> = ({
  snapshots,
  loading,
  selectedSnapshot,
  setSelectedSnapshot,
  handleSaveSnapshot,
  saving,
  handleInitializeHistory,
  initializingHistory
}) => {
  if (loading) {
    return (
      <div className="glass-panel rounded-3xl p-16 text-center border border-dark-border">
        <Activity className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-3" />
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider animate-pulse">
          Opening Time Portals...
        </p>
      </div>
    );
  }

  const [avgPriceMode, setAvgPriceMode] = useState<'FIFO' | 'WEIGHTED'>(() => (sessionStorage.getItem('finor_pnl_avg_price_mode') as any) || 'FIFO');

  useEffect(() => {
    sessionStorage.setItem('finor_pnl_avg_price_mode', avgPriceMode);
  }, [avgPriceMode]);

  const getHoldingActiveAvgPrice = (h: any) => {
    if (avgPriceMode === 'WEIGHTED') {
      const parts = h.stock_name.split('|');
      if (parts[1]) {
        return parseFloat(parts[1]);
      }
    }
    return h.average_buy_price;
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-98 duration-200">
      
      {/* Description & Action */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-dark-depth-1 border border-dark-border/40 p-5 rounded-2xl">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-brand-400" />
            Snapshot Ledger
          </h3>
          <p className="text-[10px] text-gray-400 max-w-lg leading-relaxed">
            Snapshots capture your entire portfolio holding metrics. Save a snapshot every week to build a historical timeline, or reconstruct your timeline from your past trades history.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleInitializeHistory}
            disabled={initializingHistory}
            className="px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/25 hover:border-indigo-500/35 text-xs font-black uppercase text-indigo-400 transition-colors cursor-pointer select-none disabled:opacity-50 shrink-0 flex items-center justify-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5" />
            {initializingHistory ? 'Syncing History...' : 'Sync History Timeline'}
          </button>
          
          <button
            onClick={handleSaveSnapshot}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs font-black uppercase text-white transition-colors cursor-pointer select-none disabled:opacity-50 shrink-0 flex items-center justify-center gap-1.5 shadow-lg shadow-brand-700/10"
          >
            <Clock className="w-3.5 h-3.5" />
            {saving ? 'Saving Snapshot...' : 'Capture Snapshot'}
          </button>
        </div>
      </div>

      {snapshots.length === 0 ? (
        <div className="glass-panel rounded-3xl p-16 text-center border border-dark-border">
          <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-white mb-2">No Snapshots Found</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed mb-6">
            You haven't saved any portfolio snapshots yet. Click the button below to capture your first weekly snapshot point!
          </p>
          <button
            onClick={handleSaveSnapshot}
            disabled={saving}
            className="px-6 py-3 rounded-2xl bg-brand-500 hover:bg-brand-600 text-xs text-white font-extrabold transition-all cursor-pointer shadow-lg shadow-brand-700/15"
          >
            Capture First Snapshot
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Horizontal Timeline Slider Dial */}
          <div className="glass-panel rounded-2xl p-5 border border-dark-border space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Select Snapshot Date</h4>
              <span className="text-[9px] font-black text-amber-500 uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                Time Machine Active
              </span>
            </div>
            
            <div className="relative pt-2 pb-1">
              {/* Horizontal Connecting Timeline Line */}
              <div className="absolute left-4 right-4 top-[55%] h-[1px] bg-dark-border/40 dark:bg-white/5 pointer-events-none" />
              
              <div className="flex items-center gap-4 overflow-x-auto pb-3 thin-scrollbar relative z-10">
                {snapshots.map((snap) => {
                  const isActive = selectedSnapshot?.id === snap.id;
                  const snapDate = new Date(snap.snapshot_date);
                  const dayLabel = snapDate.getDate();
                  const monthLabel = snapDate.toLocaleDateString('en-IN', { month: 'short' });
                  const yearLabel = snapDate.getFullYear();
                  
                  return (
                    <button
                      key={snap.id}
                      onClick={() => setSelectedSnapshot(snap)}
                      className={`flex-shrink-0 flex flex-col items-center justify-between p-3.5 rounded-2xl border min-w-[105px] transition-all duration-300 cursor-pointer ${
                        isActive 
                          ? 'bg-gradient-to-b from-amber-500/15 to-amber-600/5 border-amber-500/65 text-amber-500 dark:text-amber-400 shadow-lg shadow-amber-500/5 scale-102 ring-1 ring-amber-500/25' 
                          : 'bg-dark-depth-2 border-dark-border/60 text-gray-400 hover:bg-dark-depth-3 hover:border-dark-border hover:text-white'
                      }`}
                    >
                      <span className="text-[8px] font-extrabold uppercase opacity-85 tracking-wider mb-1">{monthLabel} {yearLabel}</span>
                      <span className="text-xl font-black block my-0.5 leading-none">{dayLabel}</span>
                      <span className="text-[8px] font-bold mt-1 opacity-90">₹{(snap.total_value / 100000).toFixed(2)}L</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected Snapshot Viewer */}
          {selectedSnapshot && (() => {
            const activeValue = selectedSnapshot.holdings_state.reduce((sum: number, h: any) => sum + (h.ltp * h.quantity), 0);
            const activeInvested = selectedSnapshot.holdings_state.reduce((sum: number, h: any) => sum + (getHoldingActiveAvgPrice(h) * h.quantity), 0);
            const activePL = activeValue - activeInvested;

            return (
              <div className="border border-amber-500/20 bg-amber-500/[0.02] rounded-3xl p-6 relative overflow-hidden space-y-6">
              {/* Gold light effect */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
              
              {/* Badge Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-dark-border/45 pb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider">TIME MACHINE ACTIVE</span>
                  
                  {/* Mode Toggle */}
                  <div className="flex rounded-lg bg-dark-depth-2 border border-dark-border/60 p-0.5 ml-1">
                    {(['FIFO', 'WEIGHTED'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setAvgPriceMode(mode)}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          avgPriceMode === mode
                            ? 'bg-amber-500 text-black'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {mode === 'FIFO' ? 'FIFO' : 'Weighted'}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-400">
                  Snapshot Date: {new Date(selectedSnapshot.snapshot_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>

              {/* KPI metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-dark-depth-2 border border-dark-border/40 p-4 rounded-2xl">
                  <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-wider block mb-1">Portfolio Value</span>
                  <span className="text-lg font-black text-white">{formatCurrency(activeValue)}</span>
                </div>
                <div className="bg-dark-depth-2 border border-dark-border/40 p-4 rounded-2xl">
                  <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-wider block mb-1">Invested Capital</span>
                  <span className="text-lg font-black text-gray-300">{formatCurrency(activeInvested)}</span>
                </div>
                <div className="bg-dark-depth-2 border border-dark-border/40 p-4 rounded-2xl">
                  <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-wider block mb-1">Snapshot Returns</span>
                  <span className={`text-lg font-black ${activePL >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    {activePL >= 0 ? '+' : ''}{formatCurrency(activePL)}
                  </span>
                </div>
              </div>

              {/* Holdings State Table */}
              <div className="bg-dark-depth-2/40 border border-dark-border/40 rounded-2xl p-5">
                <h4 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-3.5">Holdings Ledger at Snapshot</h4>
                
                {(!selectedSnapshot.holdings_state || selectedSnapshot.holdings_state.length === 0) ? (
                  <p className="text-xs text-gray-400 italic">No holdings were active at this snapshot point.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-dark-border/30 pb-2">
                          <th className="pb-2 font-bold">Company</th>
                          <th className="pb-2 font-bold">Quantity</th>
                          <th className="pb-2 font-bold">Avg Price & Return %</th>
                          <th className="pb-2 font-bold">Snapshot LTP</th>
                          <th className="pb-2 font-bold text-right">Current Value & P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-border/20">
                        {selectedSnapshot.holdings_state.map((h: any, idx: number) => {
                          const value = h.quantity * h.ltp;
                          const parts = h.stock_name.split('|');
                          const wtdPrice = parts[1] ? parseFloat(parts[1]) : h.average_buy_price;
                          
                          const fifoPL = value - (h.average_buy_price * h.quantity);
                          const fifoROI = h.average_buy_price > 0 ? (fifoPL / (h.average_buy_price * h.quantity)) * 100 : 0;
                          
                          const wtdPL = value - (wtdPrice * h.quantity);
                          const wtdROI = wtdPrice > 0 ? (wtdPL / (wtdPrice * h.quantity)) * 100 : 0;

                          return (
                            <tr key={idx} className="hover:bg-dark-depth-2/30 transition-colors">
                              <td className="py-2.5">
                                <span className="font-extrabold text-white block">{h.stock_symbol}</span>
                                <span className="text-[9px] text-gray-500 block mt-0.5">{parts[0]}</span>
                              </td>
                              <td className="py-2.5 text-white font-semibold">{h.quantity}</td>
                              <td className="py-2.5">
                                <div className="space-y-0.5 text-[10px]">
                                  <div>
                                    <span className="text-gray-500">FIFO:</span> <span className="text-gray-300">₹{h.average_buy_price.toFixed(2)}</span>
                                    <span className={`ml-1 font-bold ${fifoPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      ({fifoROI.toFixed(1)}%)
                                    </span>
                                  </div>
                                  {parts[1] && (
                                    <div>
                                      <span className="text-gray-500">Wtd:</span> <span className="text-gray-300">₹{wtdPrice.toFixed(2)}</span>
                                      <span className={`ml-1 font-bold ${wtdPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        ({wtdROI.toFixed(1)}%)
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 text-gray-300">₹{h.ltp.toFixed(2)}</td>
                              <td className="py-2.5 text-right">
                                <span className="font-bold text-white block">₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <div className="text-[10px] mt-0.5">
                                  {avgPriceMode === 'FIFO' ? (
                                    <span className={`font-bold ${fifoPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {fifoPL >= 0 ? '+' : ''}₹{fifoPL.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className={`font-bold ${wtdPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {wtdPL >= 0 ? '+' : ''}₹{wtdPL.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
            );
          })()}

        </div>
      )}

    </div>
  );
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PnL = () => {
  const [_summary, setSummary] = useState<PnLSummary>({ total_realized_pnl: 0, stcg: 0, ltcg: 0 });
  const [equitySummary, setEquitySummary] = useState<PnLSummary>({ total_realized_pnl: 0, stcg: 0, ltcg: 0 });
  const [fnoSummary, setFnoSummary] = useState<PnLSummary>({ total_realized_pnl: 0, stcg: 0, ltcg: 0 });

  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [equityClosedTrades, setEquityClosedTrades] = useState<ClosedTrade[]>([]);
  const [fnoClosedTrades, setFnoClosedTrades] = useState<ClosedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subtab State: 'equity' | 'fno' | 'time-machine'
  const [pnlSubTab, setPnlSubTab] = useState<'equity' | 'fno' | 'time-machine'>('equity');
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [initializingHistory, setInitializingHistory] = useState(false);

  // Active ledger data partitioned by active view
  const activeClosedTrades = pnlSubTab === 'fno' ? fnoClosedTrades : equityClosedTrades;
  const activeSummary = pnlSubTab === 'fno' ? fnoSummary : equitySummary;

  // Custom Alert Popups State
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertType, setAlertType] = useState<'success' | 'error' | 'info'>('success');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const triggerAlert = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    setAlertType(type);
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertOpen(true);
  };

  const handleInitializeHistory = async () => {
    if (initializingHistory) return;
    setInitializingHistory(true);
    try {
      const res = await apiRequest('/snapshots/initialize-history', { method: 'POST' });
      await fetchSnapshots();
      triggerAlert(
        'success',
        'Timeline Synchronized',
        `Reconstructed ${res.created} historical snapshots successfully. ${res.updated} snapshots updated.`
      );
    } catch (err: any) {
      triggerAlert('error', 'Sync Failed', err.message || 'Failed to initialize historical snapshots.');
    } finally {
      setInitializingHistory(false);
    }
  };

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');

  // AI Insights Drawer State
  const [showInsights, setShowInsights] = useState(false);
  const [isInsightsMounted, setIsInsightsMounted] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  // Actions Dropdown State
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenInsights = () => {
    setIsInsightsMounted(true);
    setTimeout(() => setShowInsights(true), 25);
  };

  const handleCloseInsights = () => {
    setShowInsights(false);
    setTimeout(() => setIsInsightsMounted(false), 300);
  };

  const handleExportCSV = () => {
    try {
      let csvContent = "";
      let filename = "pnl_report.csv";

      if (pnlSubTab === 'equity' || pnlSubTab === 'fno') {
        const tradesToExport = activeClosedTrades;
        if (viewMode === 'all_time') {
          // Stock-wise summary
          csvContent = "Stock/Contract,Type,Quantity,Buy Cost (\u20B9),Sell Value (\u20B9),Gross Realized P&L (\u20B9),Approx Charges (\u20B9),Net Realized P&L (\u20B9),STCG (\u20B9),LTCG (\u20B9)\n";
          const summaryEntries = Object.entries(
            tradesToExport.reduce((acc, trade) => {
              const sym = trade.stock_symbol;
              if (!acc[sym]) acc[sym] = { 
                sym, 
                type: trade.contract_type || (trade.is_fno ? 'F&O' : 'EQUITY'),
                qty: 0, 
                cost: 0, 
                val: 0, 
                pnl: 0, 
                charges: 0,
                netPnl: 0,
                stcg: 0, 
                ltcg: 0 
              };
              acc[sym].qty += trade.quantity;
              acc[sym].cost += trade.quantity * trade.buy_price;
              acc[sym].val += trade.quantity * trade.sell_price;
              acc[sym].pnl += trade.realized_pnl;
              const c = trade.charges ? trade.charges.total_charges : 0;
              acc[sym].charges += c;
              acc[sym].netPnl += (trade.net_realized_pnl ?? (trade.realized_pnl - c));
              acc[sym].stcg += (trade.gains_type === 'STCG' ? trade.realized_pnl : 0);
              acc[sym].ltcg += (trade.gains_type === 'LTCG' ? trade.realized_pnl : 0);
              return acc;
            }, {} as Record<string, any>)
          );

          summaryEntries.forEach(([symbol, s]) => {
            csvContent += `${symbol},${s.type},${s.qty},${s.cost.toFixed(2)},${s.val.toFixed(2)},${s.pnl.toFixed(2)},${s.charges.toFixed(2)},${s.netPnl.toFixed(2)},${s.stcg.toFixed(2)},${s.ltcg.toFixed(2)}\n`;
          });
          filename = pnlSubTab === 'fno' ? "finor_fno_contracts_summary.csv" : "finor_equity_stock_summary.csv";
        } else {
          // Trade-by-trade ledger
          csvContent = "Stock/Contract,Type,Quantity,Buy Date,Sell Date,Avg Buy Price (\u20B9),Avg Sell Price (\u20B9),Gross Realized P&L (\u20B9),Approx Charges (\u20B9),Net Realized P&L (\u20B9),Holding Days,Classification\n";
          tradesToExport.forEach((trade) => {
            const buyDateStr = new Date(trade.buy_date).toLocaleDateString('en-IN');
            const sellDateStr = new Date(trade.sell_date).toLocaleDateString('en-IN');
            const c = trade.charges ? trade.charges.total_charges : 0;
            const netPnl = trade.net_realized_pnl ?? (trade.realized_pnl - c);
            const classification = trade.is_fno 
              ? (trade.contract_type || 'F&O')
              : (trade.holding_days > 365 ? "LTCG" : "STCG");
            csvContent += `${trade.stock_symbol},${trade.contract_type || 'EQUITY'},${trade.quantity},${buyDateStr},${sellDateStr},${trade.buy_price.toFixed(2)},${trade.sell_price.toFixed(2)},${trade.realized_pnl.toFixed(2)},${c.toFixed(2)},${netPnl.toFixed(2)},${trade.holding_days},${classification}\n`;
          });
          filename = pnlSubTab === 'fno' ? "finor_detailed_fno_ledger.csv" : "finor_detailed_equity_ledger.csv";
        }
      } else {
        // Time machine snapshot summary
        csvContent = "Snapshot Date,Portfolio Value (\u20B9),Invested Capital (\u20B9),Returns (\u20B9)\n";
        snapshots.forEach((s) => {
          const dateStr = new Date(s.snapshot_date).toLocaleDateString('en-IN');
          csvContent += `${dateStr},${s.portfolio_value.toFixed(2)},${s.invested_capital.toFixed(2)},${s.returns.toFixed(2)}\n`;
        });
        filename = "finor_time_machine_snapshots.csv";
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("CSV Export failed:", err.message);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const [taxFilter, setTaxFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'profit' | 'loss'>('all');
  const [viewMode, setViewMode] = useState<'expand' | 'collapse_cycle' | 'all_time'>('all_time');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  
  // Sort State
  const [sortBy, setSortBy] = useState<string>('sell_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const resetFilters = () => {
    setSearchQuery('');
    setTaxFilter('all');
    setOutcomeFilter('all');
    setStartDateFilter('');
    setEndDateFilter('');
    setSelectedMonth(null);
  };

  const fetchSnapshots = async () => {
    setLoadingSnapshots(true);
    try {
      const res = await apiRequest('/snapshots');
      setSnapshots(res || []);
      if (res && res.length > 0) {
        setSelectedSnapshot(res[res.length - 1]); // default to latest snapshot
      }
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const handleSaveSnapshot = async () => {
    if (savingSnapshot) return;
    setSavingSnapshot(true);
    try {
      const res = await apiRequest('/snapshots', { method: 'POST' });
      await fetchSnapshots();
      triggerAlert(
        'success',
        'Snapshot Captured',
        `Weekly snapshot captured successfully for date: ${res.snapshot?.snapshot_date}`
      );
    } catch (err: any) {
      triggerAlert('error', 'Snapshot Failed', err.message || 'Failed to capture weekly snapshot.');
    } finally {
      setSavingSnapshot(false);
    }
  };

  const fetchPnLData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest('/analytics/realized-pnl');
      setSummary(data.summary || { total_realized_pnl: 0, stcg: 0, ltcg: 0 });
      setEquitySummary(data.equity_summary || { total_realized_pnl: 0, stcg: 0, ltcg: 0 });
      setFnoSummary(data.fno_summary || { total_realized_pnl: 0, stcg: 0, ltcg: 0 });
      
      const allTrades: ClosedTrade[] = data.closed_trades || [];
      setClosedTrades(allTrades);
      setEquityClosedTrades(data.equity_closed_trades || allTrades.filter((t: any) => !t.is_fno));
      setFnoClosedTrades(data.fno_closed_trades || allTrades.filter((t: any) => t.is_fno));
    } catch (err: any) {
      setError(err.message || 'Failed to load P&L analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPnLData();
    fetchSnapshots();

    const handleSyncComplete = () => {
      fetchPnLData();
      fetchSnapshots();
    };

    window.addEventListener('portfolio-sync-complete', handleSyncComplete);
    return () => {
      window.removeEventListener('portfolio-sync-complete', handleSyncComplete);
    };
  }, []);

  // Format closed trades for monthly bar chart
  const getMonthlyChartData = () => {
    const monthsMap: Record<string, { month: string; pnl: number; netPnl: number; timestamp: number }> = {};

    activeClosedTrades.forEach(trade => {
      const date = new Date(trade.sell_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MONTH_NAMES[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;

      if (!monthsMap[key]) {
        monthsMap[key] = {
          month: label,
          pnl: 0,
          netPnl: 0,
          timestamp: new Date(date.getFullYear(), date.getMonth(), 1).getTime()
        };
      }
      monthsMap[key].pnl += trade.realized_pnl;
      const c = trade.charges ? trade.charges.total_charges : 0;
      monthsMap[key].netPnl += (trade.net_realized_pnl ?? (trade.realized_pnl - c));
    });

    // Sort chronologically
    return Object.values(monthsMap)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(item => ({
        month: item.month,
        pnl: parseFloat(item.pnl.toFixed(2)),
        netPnl: parseFloat(item.netPnl.toFixed(2))
      }));
  };

  const monthlyChartData = getMonthlyChartData();

  // Consolidated group helper
  const getProcessedTrades = () => {
    let sourceTrades = activeClosedTrades;
    if (selectedMonth) {
      sourceTrades = activeClosedTrades.filter(t => {
        const date = new Date(t.sell_date);
        const label = `${MONTH_NAMES[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
        return label === selectedMonth;
      });
    }

    if (viewMode === 'expand') {
      return sourceTrades.map(t => ({
        ...t,
        charges: t.charges || { total_charges: 0, brokerage: 0, stt: 0, exchange_charges: 0, sebi_charges: 0, stamp_duty: 0, gst: 0, dp_charges: 0 },
        net_realized_pnl: t.net_realized_pnl ?? (t.realized_pnl - (t.charges ? t.charges.total_charges : 0)),
        buy_date_display: new Date(t.buy_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        sell_date_display: new Date(t.sell_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      }));
    }

    if (viewMode === 'collapse_cycle') {
      const groups: Record<string, {
        stock_symbol: string;
        is_fno?: boolean;
        contract_type?: string;
        sell_date: string;
        buy_dates: Date[];
        quantity: number;
        total_buy_cost: number;
        total_sell_value: number;
        realized_pnl: number;
        charges: TradeCharges;
        net_realized_pnl: number;
        total_holding_days_qty: number;
      }> = {};

      sourceTrades.forEach(t => {
        const key = `${t.stock_symbol}_${t.sell_date.substring(0, 10)}`;
        if (!groups[key]) {
          groups[key] = {
            stock_symbol: t.stock_symbol,
            is_fno: t.is_fno,
            contract_type: t.contract_type,
            sell_date: t.sell_date,
            buy_dates: [],
            quantity: 0,
            total_buy_cost: 0,
            total_sell_value: 0,
            realized_pnl: 0,
            charges: { total_charges: 0, brokerage: 0, stt: 0, exchange_charges: 0, sebi_charges: 0, stamp_duty: 0, gst: 0, dp_charges: 0 },
            net_realized_pnl: 0,
            total_holding_days_qty: 0
          };
        }
        const g = groups[key];
        g.buy_dates.push(new Date(t.buy_date));
        g.quantity += t.quantity;
        g.total_buy_cost += t.buy_price * t.quantity;
        g.total_sell_value += t.sell_price * t.quantity;
        g.realized_pnl += t.realized_pnl;
        const c = t.charges || { total_charges: 0, brokerage: 0, stt: 0, exchange_charges: 0, sebi_charges: 0, stamp_duty: 0, gst: 0, dp_charges: 0 };
        g.charges.total_charges += c.total_charges;
        g.charges.brokerage += c.brokerage;
        g.charges.stt += c.stt;
        g.charges.exchange_charges += c.exchange_charges;
        g.charges.sebi_charges += c.sebi_charges;
        g.charges.stamp_duty += c.stamp_duty;
        g.charges.gst += c.gst;
        g.charges.dp_charges += c.dp_charges;
        g.net_realized_pnl += (t.net_realized_pnl ?? (t.realized_pnl - c.total_charges));
        g.total_holding_days_qty += t.holding_days * t.quantity;
      });

      return Object.values(groups).map(g => {
        const avgBuy = g.quantity > 0 ? g.total_buy_cost / g.quantity : 0;
        const avgSell = g.quantity > 0 ? g.total_sell_value / g.quantity : 0;
        const avgHoldingDays = g.quantity > 0 ? Math.round(g.total_holding_days_qty / g.quantity) : 0;
        
        g.buy_dates.sort((a, b) => a.getTime() - b.getTime());
        const minBuyStr = g.buy_dates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const maxBuyStr = g.buy_dates[g.buy_dates.length - 1].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const buyDateDisplay = g.buy_dates[0].getTime() === g.buy_dates[g.buy_dates.length - 1].getTime()
          ? minBuyStr
          : `${minBuyStr} - ${maxBuyStr}`;

        return {
          stock_symbol: g.stock_symbol,
          is_fno: g.is_fno,
          contract_type: g.contract_type as any,
          buy_date: g.buy_dates[0].toISOString(),
          sell_date: g.sell_date,
          buy_date_display: buyDateDisplay,
          sell_date_display: new Date(g.sell_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          quantity: g.quantity,
          buy_price: avgBuy,
          sell_price: avgSell,
          realized_pnl: g.realized_pnl,
          charges: g.charges,
          net_realized_pnl: g.net_realized_pnl,
          holding_days: avgHoldingDays,
          gains_type: (avgHoldingDays > 365 ? 'LTCG' : 'STCG') as 'STCG' | 'LTCG'
        };
      });
    }

    if (viewMode === 'all_time') {
      const groups: Record<string, {
        stock_symbol: string;
        is_fno?: boolean;
        contract_type?: string;
        buy_dates: Date[];
        sell_dates: Date[];
        quantity: number;
        total_buy_cost: number;
        total_sell_value: number;
        realized_pnl: number;
        charges: TradeCharges;
        net_realized_pnl: number;
        total_holding_days_qty: number;
      }> = {};

      sourceTrades.forEach(t => {
        const key = t.stock_symbol;
        if (!groups[key]) {
          groups[key] = {
            stock_symbol: t.stock_symbol,
            is_fno: t.is_fno,
            contract_type: t.contract_type,
            buy_dates: [],
            sell_dates: [],
            quantity: 0,
            total_buy_cost: 0,
            total_sell_value: 0,
            realized_pnl: 0,
            charges: { total_charges: 0, brokerage: 0, stt: 0, exchange_charges: 0, sebi_charges: 0, stamp_duty: 0, gst: 0, dp_charges: 0 },
            net_realized_pnl: 0,
            total_holding_days_qty: 0
          };
        }
        const g = groups[key];
        g.buy_dates.push(new Date(t.buy_date));
        g.sell_dates.push(new Date(t.sell_date));
        g.quantity += t.quantity;
        g.total_buy_cost += t.buy_price * t.quantity;
        g.total_sell_value += t.sell_price * t.quantity;
        g.realized_pnl += t.realized_pnl;
        const c = t.charges || { total_charges: 0, brokerage: 0, stt: 0, exchange_charges: 0, sebi_charges: 0, stamp_duty: 0, gst: 0, dp_charges: 0 };
        g.charges.total_charges += c.total_charges;
        g.charges.brokerage += c.brokerage;
        g.charges.stt += c.stt;
        g.charges.exchange_charges += c.exchange_charges;
        g.charges.sebi_charges += c.sebi_charges;
        g.charges.stamp_duty += c.stamp_duty;
        g.charges.gst += c.gst;
        g.charges.dp_charges += c.dp_charges;
        g.net_realized_pnl += (t.net_realized_pnl ?? (t.realized_pnl - c.total_charges));
        g.total_holding_days_qty += t.holding_days * t.quantity;
      });

      return Object.values(groups).map(g => {
        const avgBuy = g.quantity > 0 ? g.total_buy_cost / g.quantity : 0;
        const avgSell = g.quantity > 0 ? g.total_sell_value / g.quantity : 0;
        const avgHoldingDays = g.quantity > 0 ? Math.round(g.total_holding_days_qty / g.quantity) : 0;
        
        g.buy_dates.sort((a, b) => a.getTime() - b.getTime());
        g.sell_dates.sort((a, b) => a.getTime() - b.getTime());
        
        const minBuyStr = g.buy_dates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const maxBuyStr = g.buy_dates[g.buy_dates.length - 1].toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const buyDateDisplay = g.buy_dates[0].getTime() === g.buy_dates[g.buy_dates.length - 1].getTime()
          ? g.buy_dates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : `${minBuyStr} - ${maxBuyStr}`;

        const minSellStr = g.sell_dates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const maxSellStr = g.sell_dates[g.sell_dates.length - 1].toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const sellDateDisplay = g.sell_dates[0].getTime() === g.sell_dates[g.sell_dates.length - 1].getTime()
          ? g.sell_dates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : `${minSellStr} - ${maxSellStr}`;

        return {
          stock_symbol: g.stock_symbol,
          is_fno: g.is_fno,
          contract_type: g.contract_type as any,
          buy_date: g.buy_dates[0].toISOString(),
          sell_date: g.sell_dates[g.sell_dates.length - 1].toISOString(),
          buy_date_display: buyDateDisplay,
          sell_date_display: sellDateDisplay,
          quantity: g.quantity,
          buy_price: avgBuy,
          sell_price: avgSell,
          realized_pnl: g.realized_pnl,
          charges: g.charges,
          net_realized_pnl: g.net_realized_pnl,
          holding_days: avgHoldingDays,
          gains_type: (avgHoldingDays > 365 ? 'LTCG' : 'STCG') as 'STCG' | 'LTCG'
        };
      });
    }

    return [];
  };

  const processedTrades = getProcessedTrades();

  const getBestAndWorstTrades = () => {
    let sourceTrades = activeClosedTrades;
    if (selectedMonth) {
      sourceTrades = activeClosedTrades.filter(t => {
        const date = new Date(t.sell_date);
        const label = `${MONTH_NAMES[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
        return label === selectedMonth;
      });
    }

    if (sourceTrades.length === 0) return { best: null, worst: null };

    const sorted = [...sourceTrades].sort((a, b) => b.realized_pnl - a.realized_pnl);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    return {
      best: best && best.realized_pnl > 0 ? best : null,
      worst: worst && worst.realized_pnl < 0 ? worst : null
    };
  };

  const { best: bestTrade, worst: worstTrade } = getBestAndWorstTrades();

  // Filters & sorts closed trades list
  const filteredTrades = processedTrades
    .filter(t => {
      const matchesSearch = t.stock_symbol.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesTax = true;
      if (pnlSubTab === 'fno') {
        if (taxFilter === 'ce') matchesTax = t.contract_type === 'OPTION_CE' || t.stock_symbol.endsWith('CE');
        else if (taxFilter === 'pe') matchesTax = t.contract_type === 'OPTION_PE' || t.stock_symbol.endsWith('PE');
        else if (taxFilter === 'fut') matchesTax = t.contract_type === 'FUTURES' || t.stock_symbol.endsWith('FUT');
      } else {
        matchesTax = taxFilter === 'all' || t.gains_type.toLowerCase() === taxFilter;
      }

      const matchesOutcome = 
        outcomeFilter === 'all' || 
        (outcomeFilter === 'profit' && t.realized_pnl >= 0) || 
        (outcomeFilter === 'loss' && t.realized_pnl < 0);

      // Date Range Filter
      const sellTime = new Date(t.sell_date).getTime();
      const matchesStartDate = !startDateFilter || sellTime >= new Date(startDateFilter).getTime();
      const matchesEndDate = !endDateFilter || sellTime <= (new Date(endDateFilter).getTime() + 24 * 60 * 60 * 1000 - 1);

      return matchesSearch && matchesTax && matchesOutcome && matchesStartDate && matchesEndDate;
    })
    .sort((a, b) => {
      let valA: any = a[sortBy as keyof typeof a];
      let valB: any = b[sortBy as keyof typeof b];

      if (sortBy === 'sell_date' || sortBy === 'buy_date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (sortBy === 'charges') {
        valA = a.charges ? a.charges.total_charges : 0;
        valB = b.charges ? b.charges.total_charges : 0;
      }

      if (sortBy === 'net_realized_pnl') {
        valA = a.net_realized_pnl ?? (a.realized_pnl - (a.charges ? a.charges.total_charges : 0));
        valB = b.net_realized_pnl ?? (b.realized_pnl - (b.charges ? b.charges.total_charges : 0));
      }

      if (typeof valA === 'string') {
        return sortDirection === 'asc' 
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return sortDirection === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  // ─── Behavioral Bias & Tax Diagnostics calculations ───
  const totalClosed = activeClosedTrades.length;
  const wins = activeClosedTrades.filter(t => t.realized_pnl > 0);
  const losses = activeClosedTrades.filter(t => t.realized_pnl < 0);
  const winRate = totalClosed > 0 ? (wins.length / totalClosed) * 100 : 0;
  
  const avgWinnerHold = wins.length > 0 ? Math.round(wins.reduce((sum, t) => sum + t.holding_days, 0) / wins.length) : 0;
  const avgLoserHold = losses.length > 0 ? Math.round(losses.reduce((sum, t) => sum + t.holding_days, 0) / losses.length) : 0;
  
  const stcgTax = Math.max(0, activeSummary.stcg * 0.15);
  const ltcgTax = Math.max(0, activeSummary.ltcg * 0.10);
  const totalTaxEstimate = stcgTax + ltcgTax;

  let dispositionFeedback = "Good balance between holding winning and losing trades. Maintain discipline.";
  let dispositionType: 'success' | 'warn' | 'error' = 'success';
  
  if (avgWinnerHold > 0 && avgLoserHold > 0) {
    const ratio = avgLoserHold / avgWinnerHold;
    if (ratio >= 2) {
      dispositionFeedback = "Critical: You hold losing trades more than double the time of winning trades. You are letting losses run while cutting profits short.";
      dispositionType = 'error';
    } else if (ratio >= 1.3) {
      dispositionFeedback = "Warning: You tend to hold losers longer than winners. Try to enforce your stop-losses early to prevent drag.";
      dispositionType = 'warn';
    } else if (ratio <= 0.8) {
      dispositionFeedback = "Excellent: You are letting winners run and cutting losses quickly. This is disciplined execution.";
      dispositionType = 'success';
    }
  }

  // Peak Win Streak
  let maxWinStreak = 0;
  let currentStreak = 0;
  const sortedByDate = [...activeClosedTrades].sort((a, b) => new Date(a.sell_date).getTime() - new Date(b.sell_date).getTime());
  sortedByDate.forEach(t => {
    if (t.realized_pnl > 0) {
      currentStreak++;
      if (currentStreak > maxWinStreak) maxWinStreak = currentStreak;
    } else if (t.realized_pnl < 0) {
      currentStreak = 0;
    }
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 select-none">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white tracking-tight">Realized P&L Terminal</h1>
          <p className="text-xs text-gray-400 mt-1">
            Audit closed positions, capital gains tax liabilities (FIFO method), and trading execution metrics.
          </p>
        </div>
        
        {closedTrades.length > 0 && (
          <div className="flex items-center gap-2 relative">
            {/* Primary Action Button */}
            <button
              onClick={handleOpenInsights}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-brand-300 bg-brand-500/10 border border-brand-500/30 hover:bg-brand-500/20 hover:border-brand-500/40 transition-all cursor-pointer shadow-lg shadow-brand-500/10 select-none"
            >
              <Sparkles className="w-4 h-4 text-brand-400 animate-pulse" />
              <span>AI Insights Engine</span>
            </button>

            {/* Actions Dropdown Button */}
            <div className="relative" ref={actionsMenuRef}>
              <button
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-300 bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border hover:border-dark-border/80 transition-all cursor-pointer select-none"
                title="More P&L Actions"
              >
                <MoreVertical className="w-4 h-4 text-gray-400" />
                <span className="hidden sm:inline">Actions</span>
              </button>

              {showActionsMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-dark-depth-2 border border-dark-border/80 shadow-2xl z-50 p-1.5 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-xl">
                  <button
                    onClick={() => {
                      setShowActionsMenu(false);
                      setIsComparisonOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-200 hover:text-white hover:bg-dark-depth-3 rounded-xl transition-all text-left cursor-pointer"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
                    <span>AI Profit Comparison</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowActionsMenu(false);
                      handleExportCSV();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-200 hover:text-white hover:bg-dark-depth-3 rounded-xl transition-all text-left cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Export Ledger CSV</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowActionsMenu(false);
                      handlePrint();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-200 hover:text-white hover:bg-dark-depth-3 rounded-xl transition-all text-left cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-amber-400" />
                    <span>Print PDF Statement</span>
                  </button>
                  <div className="border-t border-dark-border/40 my-1" />
                  <button
                    onClick={() => {
                      setShowActionsMenu(false);
                      fetchPnLData();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white hover:bg-dark-depth-3 rounded-xl transition-all text-left cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 text-gray-400" />
                    <span>Refresh Ledger</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modern Sub Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-dark-border/40 pb-2 select-none overflow-x-auto scrollbar-none">
        <button
          onClick={() => {
            setPnlSubTab('equity');
            setTaxFilter('all');
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-2 shrink-0 ${
            pnlSubTab === 'equity'
              ? 'bg-brand-500/15 border border-brand-500/30 text-brand-400 shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-dark-depth-2/40'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>📈 Equity Ledger ({equityClosedTrades.length})</span>
        </button>
        <button
          onClick={() => {
            setPnlSubTab('fno');
            setTaxFilter('all');
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-2 shrink-0 ${
            pnlSubTab === 'fno'
              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-dark-depth-2/40'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>⚡ F&O Derivatives ({fnoClosedTrades.length})</span>
        </button>
        <button
          onClick={() => setPnlSubTab('time-machine')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-2 shrink-0 ${
            pnlSubTab === 'time-machine'
              ? 'bg-brand-500/15 border border-brand-500/30 text-brand-400 shadow-sm'
              : 'text-gray-400 hover:text-white hover:bg-dark-depth-2/40'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>⏳ Time Machine Portfolio ({snapshots.length})</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm font-medium flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {pnlSubTab !== 'time-machine' ? (
        <>
          {/* Executive Headline KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Gross Realized P&L */}
            <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden flex flex-col justify-between group hover:border-dark-border/80 transition-all">
              <div className={`absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl pointer-events-none ${
                activeSummary.total_realized_pnl >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'
              }`} />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Gross Realized P&L</span>
                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                  activeSummary.total_realized_pnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                  {winRate.toFixed(1)}% Win Rate
                </span>
              </div>
              <h3 className={`text-2xl font-black mt-2 flex items-center gap-1.5 ${activeSummary.total_realized_pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {activeSummary.total_realized_pnl >= 0 ? <TrendingUp className="w-5 h-5 shrink-0" /> : <TrendingDown className="w-5 h-5 shrink-0" />}
                {activeSummary.total_realized_pnl >= 0 ? '+' : ''}
                ₹{activeSummary.total_realized_pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-border/30 text-[10px] text-gray-500 font-medium">
                <span>{wins.length}W / {losses.length}L closed</span>
                <span className="text-gray-400 font-bold">{activeClosedTrades.length} Trades</span>
              </div>
            </div>

            {/* Card 2: Approx Statutory Charges & Taxes */}
            <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden flex flex-col justify-between group hover:border-dark-border/80 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Approx Charges & Taxes</span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  {pnlSubTab === 'fno' ? 'Flat ₹20/Order + STT' : 'Standard Rates'}
                </span>
              </div>
              <h3 className="text-2xl font-black mt-2 text-amber-400">
                -₹{(activeSummary.total_charges || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-border/30 text-[10px] text-gray-500 font-medium">
                <span>Brokerage, STT, Exch, GST</span>
                <span className="text-amber-400/90 font-bold">
                  {pnlSubTab === 'fno' ? `STT: ₹${(activeSummary.charges_breakdown?.stt || 0).toFixed(0)}` : `DP: ₹${(activeSummary.charges_breakdown?.dp_charges || 0).toFixed(0)}`}
                </span>
              </div>
            </div>

            {/* Card 3: Net Realized P&L */}
            {(() => {
              const netPnlVal = activeSummary.net_realized_pnl ?? (activeSummary.total_realized_pnl - (activeSummary.total_charges || 0));
              const isNetProfit = netPnlVal >= 0;
              return (
                <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden flex flex-col justify-between group hover:border-dark-border/80 transition-all">
                  <div className={`absolute top-0 right-0 w-28 h-28 rounded-full blur-2xl pointer-events-none ${
                    isNetProfit ? 'bg-emerald-500/15' : 'bg-rose-500/15'
                  }`} />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Net Realized P&L</span>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                      isNetProfit ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}>
                      Take-Home
                    </span>
                  </div>
                  <h3 className={`text-2xl font-black mt-2 flex items-center gap-1.5 ${isNetProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isNetProfit ? <TrendingUp className="w-5 h-5 shrink-0" /> : <TrendingDown className="w-5 h-5 shrink-0" />}
                    {isNetProfit ? '+' : ''}
                    ₹{netPnlVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-border/30 text-[10px] text-gray-500 font-medium">
                    <span>After all statutory deductions</span>
                    <span className={isNetProfit ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {activeSummary.total_realized_pnl !== 0 
                        ? `${((netPnlVal / Math.abs(activeSummary.total_realized_pnl)) * 100).toFixed(1)}% retained` 
                        : '0%'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Card 4: Classification / Tax info */}
            {pnlSubTab === 'equity' ? (
              <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden flex flex-col justify-between group hover:border-dark-border/80 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Capital Gains Split</span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    FIFO Classification
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-semibold">STCG (≤365d)</span>
                    <span className="text-sm font-black text-white">₹{activeSummary.stcg.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block font-semibold">LTCG (&gt;365d)</span>
                    <span className="text-sm font-black text-white">₹{activeSummary.ltcg.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-border/30 text-[10px] text-gray-500 font-medium">
                  <span>Est Tax (15% STCG / 10% LTCG)</span>
                  <span className="text-indigo-400/90 font-bold">Est: ₹{totalTaxEstimate.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                </div>
              </div>
            ) : (
              <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden flex flex-col justify-between group hover:border-dark-border/80 transition-all">
                <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">F&O Charges Split</span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400">
                    Business Income
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-semibold">Brokerage</span>
                    <span className="text-sm font-black text-white">₹{(activeSummary.charges_breakdown?.brokerage || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block font-semibold">STT</span>
                    <span className="text-sm font-black text-white">₹{(activeSummary.charges_breakdown?.stt || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-border/30 text-[10px] text-gray-500 font-medium">
                  <span>GST (18%) + Exch</span>
                  <span className="text-brand-400/90 font-bold">₹{(((activeSummary.charges_breakdown?.gst || 0) + (activeSummary.charges_breakdown?.exchange_charges || 0))).toFixed(0)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Transparent Statutory Charges Pill Bar */}
          {activeSummary.charges_breakdown && (
            <div className="glass-panel rounded-2xl p-3 border border-dark-border/60 bg-dark-depth-2/40 text-[11px] flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 text-gray-400 font-bold uppercase text-[9px] tracking-wider">
                <CircleDollarSign className="w-3.5 h-3.5 text-amber-400" />
                <span>Statutory Breakdown:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-lg bg-dark-depth-3 border border-dark-border/50 text-gray-300">
                  Brokerage: <strong className="text-white">₹{activeSummary.charges_breakdown.brokerage.toFixed(2)}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-dark-depth-3 border border-dark-border/50 text-gray-300">
                  STT: <strong className="text-white">₹{activeSummary.charges_breakdown.stt.toFixed(2)}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-dark-depth-3 border border-dark-border/50 text-gray-300">
                  Exchange Txn: <strong className="text-white">₹{activeSummary.charges_breakdown.exchange_charges.toFixed(2)}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-dark-depth-3 border border-dark-border/50 text-gray-300">
                  GST (18%): <strong className="text-white">₹{activeSummary.charges_breakdown.gst.toFixed(2)}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-dark-depth-3 border border-dark-border/50 text-gray-300">
                  Stamp Duty: <strong className="text-white">₹{activeSummary.charges_breakdown.stamp_duty.toFixed(2)}</strong>
                </span>
                {activeSummary.charges_breakdown.dp_charges > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-dark-depth-3 border border-dark-border/50 text-gray-300">
                    DP Charges: <strong className="text-white">₹{activeSummary.charges_breakdown.dp_charges.toFixed(2)}</strong>
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-lg bg-dark-depth-3 border border-dark-border/50 text-gray-300">
                  SEBI: <strong className="text-white">₹{activeSummary.charges_breakdown.sebi_charges.toFixed(2)}</strong>
                </span>
              </div>
            </div>
          )}

      {loading ? (
        <div className="text-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-3" />
          <p className="text-xs text-gray-400">Loading realized ledger...</p>
        </div>
      ) : activeClosedTrades.length === 0 ? (
        <div className="glass-panel rounded-3xl p-16 text-center border border-dark-border">
          <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">
            {pnlSubTab === 'fno' ? 'No Closed F&O Transactions' : 'No Realized Transactions'}
          </h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            {pnlSubTab === 'fno'
              ? 'Realized F&O P&L is calculated from your options and futures trades. Any options (CE/PE) or futures (FUT) trades imported into your tradebook will appear here with automatic statutory charges & net P&L calculations.'
              : 'Realized P&L is calculated when you sell a stock that you hold. Upload your trade history on the Holdings page to see your analytics.'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Monthly P&L Chart Card */}
          <div className="glass-panel rounded-3xl p-6 border border-dark-border">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-6">Realized P&L by Month</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="99%" height={256} minWidth={0} minHeight={0}>
                <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                    tickFormatter={(val) => {
                      const num = Number(val);
                      if (isNaN(num)) return val;
                      const absNum = Math.abs(num);
                      let displayVal = absNum;
                      let suffix = '';
                      
                      if (absNum >= 1000) {
                        displayVal = parseFloat((absNum / 1000).toFixed(1));
                        suffix = 'k';
                      }
                      
                      return num < 0 ? `-₹${displayVal}${suffix}` : `₹${displayVal}${suffix}`;
                    }}
                  />
                  <Tooltip 
                    content={<CustomPnLTooltip />} 
                    cursor={{ fill: 'rgba(255, 255, 255, 0.04)', radius: 6 }} 
                  />
                  <Bar dataKey="pnl" radius={0}>
                    {monthlyChartData.map((entry, index) => {
                      const isSelected = selectedMonth === entry.month;
                      return (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.pnl >= 0 ? '#10b981' : '#f43f5e'} 
                          fillOpacity={selectedMonth ? (isSelected ? 1.0 : 0.35) : 0.85}
                          onClick={() => {
                            setSelectedMonth(selectedMonth === entry.month ? null : entry.month);
                          }}
                          className="transition-all duration-200 cursor-pointer pnl-bar-cell"
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Behavioral Bias Diagnostic Card */}
          <div className="glass-panel rounded-3xl p-6 border border-dark-border select-none animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dark-border/40 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">Disposition Bias Audit</h3>
                  <p className="text-[10px] text-gray-400 font-medium">Behavioral trade discipline & winner vs loser holding duration</p>
                </div>
              </div>
              <span className={`self-start sm:self-auto text-[10px] font-extrabold uppercase px-3 py-1 rounded-full border ${
                dispositionType === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                dispositionType === 'warn' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}>
                {dispositionType === 'success' ? 'Disciplined' : dispositionType === 'warn' ? 'Biased' : 'High Risk'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-dark-depth-2/70 border border-dark-border/40 p-4 rounded-2xl flex items-center justify-between md:flex-col md:items-start">
                <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-wider">Avg Hold (Winners)</span>
                <span className="text-xl font-black text-emerald-400 mt-1">{avgWinnerHold} <span className="text-xs font-bold text-gray-400">days</span></span>
              </div>
              <div className="bg-dark-depth-2/70 border border-dark-border/40 p-4 rounded-2xl flex items-center justify-between md:flex-col md:items-start">
                <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-wider">Avg Hold (Losers)</span>
                <span className="text-xl font-black text-rose-400 mt-1">{avgLoserHold} <span className="text-xs font-bold text-gray-400">days</span></span>
              </div>
              <div className={`p-4 rounded-2xl border text-xs font-medium leading-relaxed flex items-center ${
                dispositionType === 'success' ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300' :
                dispositionType === 'warn' ? 'bg-amber-500/5 border-amber-500/10 text-amber-300' :
                'bg-rose-500/5 border-rose-500/10 text-rose-300'
              }`}>
                {dispositionFeedback}
              </div>
            </div>
          </div>

          {/* Trade History Ledger Section */}
          <div className="space-y-4">

            {/* Active Month filter banner & Best/Worst performing trades */}
            {selectedMonth && (
              <div className="glass-panel border border-dark-border rounded-3xl p-5 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-brand-500 animate-ping" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">
                      Showing performance for {selectedMonth}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedMonth(null)}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-rose-400 hover:text-rose-350 bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/40 rounded-xl px-3 py-1.5 transition-all cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    Reset Month Filter
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Best trade card */}
                  <div className="bg-dark-depth-2 border border-dark-border/40 p-4 rounded-2xl flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[8px] text-gray-500 font-extrabold uppercase tracking-wider block">Best Trade in {selectedMonth}</span>
                      {bestTrade ? (
                        <>
                          <span className="text-sm font-black text-white">{bestTrade.stock_symbol}</span>
                          <span className="text-[10px] text-gray-400 block font-medium">Qty: {bestTrade.quantity} • Buy: ₹{bestTrade.buy_price.toFixed(2)}</span>
                        </>
                      ) : (
                        <span className="text-xs font-bold text-gray-400 block">No profitable trades</span>
                      )}
                    </div>
                    {bestTrade && (
                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-500 block">+₹{bestTrade.realized_pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        <span className="text-[9px] text-gray-500 font-bold uppercase">{bestTrade.holding_days} Days Hold</span>
                      </div>
                    )}
                  </div>

                  {/* Worst trade card */}
                  <div className="bg-dark-depth-2 border border-dark-border/40 p-4 rounded-2xl flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[8px] text-gray-500 font-extrabold uppercase tracking-wider block">Worst Trade in {selectedMonth}</span>
                      {worstTrade ? (
                        <>
                          <span className="text-sm font-black text-white">{worstTrade.stock_symbol}</span>
                          <span className="text-[10px] text-gray-400 block font-medium">Qty: {worstTrade.quantity} • Buy: ₹{worstTrade.buy_price.toFixed(2)}</span>
                        </>
                      ) : (
                        <span className="text-xs font-bold text-gray-400 block">No loss-making trades</span>
                      )}
                    </div>
                    {worstTrade && (
                      <div className="text-right">
                        <span className="text-xs font-bold text-rose-500 block">₹{worstTrade.realized_pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        <span className="text-[9px] text-gray-500 font-bold uppercase">{worstTrade.holding_days} Days Hold</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Unified Controls & Filter Toolbar */}
            <div className="glass-panel rounded-2xl p-3 border border-dark-border flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
              {/* Left: View Mode Segmented Controls */}
              <div className="flex items-center gap-1 bg-dark-depth-2/70 p-1 rounded-xl border border-dark-border/50 shrink-0">
                <button
                  onClick={() => setViewMode('expand')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-150 cursor-pointer ${
                    viewMode === 'expand'
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Expand
                </button>
                <button
                  onClick={() => setViewMode('collapse_cycle')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-150 cursor-pointer ${
                    viewMode === 'collapse_cycle'
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Cycle Merge
                </button>
                <button
                  onClick={() => setViewMode('all_time')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-150 cursor-pointer ${
                    viewMode === 'all_time'
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Stock Summary
                </button>
              </div>

              {/* Right: Search + Filter Group */}
              <div className="flex flex-wrap items-center gap-2 flex-1 justify-start xl:justify-end">
                {/* Search */}
                <div className="relative min-w-[160px] flex-1 sm:flex-initial">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search symbol..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 transition-all placeholder:text-gray-500"
                  />
                </div>

                {/* Tax Split */}
                <div className="flex items-center gap-1 bg-dark-depth-2 border border-dark-border rounded-xl px-2.5 py-1.5">
                  <SlidersHorizontal className="w-3 h-3 text-gray-500" />
                  <select
                    value={taxFilter}
                    onChange={(e) => setTaxFilter(e.target.value as any)}
                    className="bg-transparent text-[10px] font-bold text-gray-300 focus:outline-none border-none pr-4 pl-1 cursor-pointer"
                  >
                    {pnlSubTab === 'fno' ? (
                      <>
                        <option value="all">Contract: All Types</option>
                        <option value="ce">CE Calls Only</option>
                        <option value="pe">PE Puts Only</option>
                        <option value="fut">Futures Only</option>
                      </>
                    ) : (
                      <>
                        <option value="all">Tax: All Gains</option>
                        <option value="stcg">STCG Only</option>
                        <option value="ltcg">LTCG Only</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Outcome */}
                <div className="flex items-center bg-dark-depth-2 border border-dark-border rounded-xl px-2.5 py-1.5">
                  <select
                    value={outcomeFilter}
                    onChange={(e) => setOutcomeFilter(e.target.value as any)}
                    className="bg-transparent text-[10px] font-bold text-gray-300 focus:outline-none border-none pr-4 pl-1 cursor-pointer"
                  >
                    <option value="all">All Outcomes</option>
                    <option value="profit">Profits Only</option>
                    <option value="loss">Losses Only</option>
                  </select>
                </div>

                {/* Date Range Filters */}
                <div className="flex items-center gap-1.5 bg-dark-depth-2 border border-dark-border rounded-xl px-2.5 py-1.5">
                  <span className="text-[9px] text-gray-500 font-bold uppercase">From:</span>
                  <input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                    className="bg-transparent text-[10px] font-bold text-gray-300 focus:outline-none border-none cursor-pointer"
                  />
                  <span className="text-[9px] text-gray-500 font-bold uppercase">To:</span>
                  <input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                    className="bg-transparent text-[10px] font-bold text-gray-300 focus:outline-none border-none cursor-pointer"
                  />
                </div>

                {/* Reset button */}
                {(searchQuery || taxFilter !== 'all' || outcomeFilter !== 'all' || startDateFilter || endDateFilter || selectedMonth) && (
                  <button
                    onClick={resetFilters}
                    className="flex items-center gap-1 text-[10px] font-bold text-rose-400 hover:text-rose-350 bg-rose-500/10 border border-rose-500/20 rounded-xl px-2.5 py-1.5 transition-all cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Closed Trades List */}
            {filteredTrades.length === 0 ? (
              <div className="glass-panel rounded-3xl p-10 text-center border border-dark-border text-xs text-gray-500">
                No closed trades match your filters or search query.
              </div>
            ) : (
              <>
                {/* Desktop Closed Trades List Table */}
                <div className="hidden md:block glass-panel rounded-3xl border border-dark-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-dark-border bg-dark-depth-1/40 text-[10px] text-gray-400 uppercase font-bold tracking-wider select-none">
                          <th onClick={() => handleSort('stock_symbol')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors">
                            <div className="flex items-center gap-1">
                              Symbol
                              {sortBy === 'stock_symbol' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => handleSort('buy_date')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors">
                            <div className="flex items-center gap-1">
                              Buy Date
                              {sortBy === 'buy_date' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => handleSort('sell_date')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors">
                            <div className="flex items-center gap-1">
                              Sell Date
                              {sortBy === 'sell_date' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => handleSort('holding_days')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors">
                            <div className="flex items-center gap-1">
                              Duration
                              {sortBy === 'holding_days' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => handleSort('quantity')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors text-right">
                            <div className="flex items-center justify-end gap-1">
                              Qty
                              {sortBy === 'quantity' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => handleSort('buy_price')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors text-right">
                            <div className="flex items-center justify-end gap-1">
                              Avg Buy
                              {sortBy === 'buy_price' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => handleSort('sell_price')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors text-right">
                            <div className="flex items-center justify-end gap-1">
                              Avg Sell
                              {sortBy === 'sell_price' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => handleSort('realized_pnl')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors text-right">
                            <div className="flex items-center justify-end gap-1">
                              Gross P&L
                              {sortBy === 'realized_pnl' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => handleSort('charges')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors text-right">
                            <div className="flex items-center justify-end gap-1">
                              Charges
                              {sortBy === 'charges' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th onClick={() => handleSort('net_realized_pnl')} className="px-6 py-4 cursor-pointer hover:text-white transition-colors text-right">
                            <div className="flex items-center justify-end gap-1">
                              Net P&L
                              {sortBy === 'net_realized_pnl' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </div>
                          </th>
                          <th className="px-6 py-4 text-right">Return %</th>
                          <th className="px-6 py-4 text-center">{pnlSubTab === 'fno' ? 'Contract' : 'Tax Class'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-border/40 text-xs text-gray-300 font-medium">
                        {filteredTrades.map((t, idx) => {
                          const isProfit = t.realized_pnl >= 0;
                          const roiPct = t.buy_price > 0 ? ((t.sell_price - t.buy_price) / t.buy_price) * 100 : 0;
                          const totalCharges = t.charges?.total_charges || 0;
                          const netPnl = t.net_realized_pnl ?? (t.realized_pnl - totalCharges);
                          const isNetProfit = netPnl >= 0;
                          return (
                            <tr key={idx} className="hover:bg-dark-depth-2/20 transition-all">
                              <td className="px-6 py-3.5 font-bold text-white">{t.stock_symbol}</td>
                              <td className="px-6 py-3.5 text-gray-400">
                                {t.buy_date_display}
                              </td>
                              <td className="px-6 py-3.5 text-gray-400">
                                {t.sell_date_display}
                              </td>
                              <td className="px-6 py-3.5 text-gray-400">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                                  {t.holding_days} Days
                                </span>
                              </td>
                              <td className="px-6 py-3.5 text-right font-semibold text-white">{t.quantity}</td>
                              <td className="px-6 py-3.5 text-right text-gray-300">₹{t.buy_price.toFixed(2)}</td>
                              <td className="px-6 py-3.5 text-right text-gray-300">₹{t.sell_price.toFixed(2)}</td>
                              <td className={`px-6 py-3.5 text-right font-bold ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {isProfit ? '+' : ''}₹{t.realized_pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-6 py-3.5 text-right font-semibold text-amber-400 text-[11px]" title={`Brokerage: ₹${t.charges?.brokerage?.toFixed(2) || 0} | STT: ₹${t.charges?.stt?.toFixed(2) || 0} | Exch: ₹${t.charges?.exchange_charges?.toFixed(2) || 0} | GST: ₹${t.charges?.gst?.toFixed(2) || 0}${t.charges?.dp_charges ? ` | DP: ₹${t.charges.dp_charges.toFixed(2)}` : ''}`}>
                                -₹{totalCharges.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className={`px-6 py-3.5 text-right font-black ${isNetProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isNetProfit ? '+' : ''}₹{netPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className={`px-6 py-3.5 text-right font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isProfit ? '+' : ''}{roiPct.toFixed(2)}%
                              </td>
                              <td className="px-6 py-3.5 text-center">
                                {pnlSubTab === 'fno' ? (
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                    t.contract_type === 'OPTION_CE' || t.stock_symbol.endsWith('CE')
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                      : t.contract_type === 'OPTION_PE' || t.stock_symbol.endsWith('PE')
                                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                      : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                                  }`}>
                                    {t.contract_type === 'OPTION_CE' || t.stock_symbol.endsWith('CE') ? 'CALL CE' :
                                     t.contract_type === 'OPTION_PE' || t.stock_symbol.endsWith('PE') ? 'PUT PE' : 'FUTURES'}
                                  </span>
                                ) : (
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                    t.gains_type === 'STCG' 
                                      ? 'bg-amber-500/10 border-amber-500/10 text-amber-500' 
                                      : 'bg-brand-500/10 border-brand-500/10 text-brand-400'
                                  }`}>
                                    {t.gains_type}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Closed Trades Card List */}
                <div className="md:hidden space-y-3">
                  {filteredTrades.map((t, idx) => {
                    const isProfit = t.realized_pnl >= 0;
                    const roiPct = t.buy_price > 0 ? ((t.sell_price - t.buy_price) / t.buy_price) * 100 : 0;
                    const totalCharges = t.charges?.total_charges || 0;
                    const netPnl = t.net_realized_pnl ?? (t.realized_pnl - totalCharges);
                    const isNetProfit = netPnl >= 0;
                    return (
                      <div key={idx} className="glass-panel rounded-2xl p-4 border border-dark-border flex flex-col gap-3">
                        {/* Header: Symbol, Contract/Tax tag, & Net P&L */}
                        <div className="flex items-center justify-between border-b border-dark-border/40 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-white text-sm tracking-tight">{t.stock_symbol}</span>
                            {pnlSubTab === 'fno' ? (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                t.contract_type === 'OPTION_CE' || t.stock_symbol.endsWith('CE')
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                  : t.contract_type === 'OPTION_PE' || t.stock_symbol.endsWith('PE')
                                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                  : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                              }`}>
                                {t.contract_type === 'OPTION_CE' || t.stock_symbol.endsWith('CE') ? 'CALL CE' :
                                 t.contract_type === 'OPTION_PE' || t.stock_symbol.endsWith('PE') ? 'PUT PE' : 'FUT'}
                              </span>
                            ) : (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                t.gains_type === 'STCG' 
                                  ? 'bg-amber-500/10 border-amber-500/10 text-amber-500' 
                                  : 'bg-brand-500/10 border-brand-500/10 text-brand-400'
                              }`}>
                                {t.gains_type}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className={`font-extrabold text-xs block ${isNetProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isNetProfit ? '+' : ''}₹{netPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[9px] text-gray-500 block font-medium">Net Realized</span>
                          </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-y-2.5 gap-x-2 text-[10px] text-gray-400">
                          <div>
                            <span className="text-gray-500 block text-[9px] uppercase tracking-wider font-semibold">Gross P&L</span>
                            <span className={`font-bold ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {isProfit ? '+' : ''}₹{t.realized_pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({isProfit ? '+' : ''}{roiPct.toFixed(2)}%)
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[9px] uppercase tracking-wider font-semibold">Approx Charges</span>
                            <span className="font-semibold text-amber-400">-₹{totalCharges.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[9px] uppercase tracking-wider font-semibold">Buy Date</span>
                            <span className="font-semibold text-gray-300">{t.buy_date_display}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[9px] uppercase tracking-wider font-semibold">Sell Date</span>
                            <span className="font-semibold text-gray-300">{t.sell_date_display}</span>
                          </div>
                          <div className="pt-0.5">
                            <span className="text-gray-500 block text-[9px] uppercase tracking-wider font-semibold">Qty & Duration</span>
                            <span className="font-semibold text-white">{t.quantity} <span className="text-gray-600">•</span> {t.holding_days} Days</span>
                          </div>
                          <div className="pt-0.5">
                            <span className="text-gray-500 block text-[9px] uppercase tracking-wider font-semibold">Avg. Buy / Sell</span>
                            <span className="font-semibold text-gray-300">₹{t.buy_price.toFixed(2)} / ₹{t.sell_price.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

          </div>
        </div>
      )}
      </>
    ) : (
        <TimeMachineView 
          snapshots={snapshots}
          loading={loadingSnapshots}
          selectedSnapshot={selectedSnapshot}
          setSelectedSnapshot={setSelectedSnapshot}
          handleSaveSnapshot={handleSaveSnapshot}
          saving={savingSnapshot}
          handleInitializeHistory={handleInitializeHistory}
          initializingHistory={initializingHistory}
        />
      )}

      {/* Custom Alert Dialog Popup */}
      <CustomAlertModal
        isOpen={alertOpen}
        type={alertType}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertOpen(false)}
      />

      {/* AI Insights Side-Drawer Panel */}
      {isInsightsMounted && (
        <PnLInsightsDrawer
          isOpen={showInsights}
          onClose={handleCloseInsights}
          trades={closedTrades}
        />
      )}

      {/* AI Comparative Profit & Behavior Modal */}
      {isComparisonOpen && (
        <PnLComparisonModal
          onClose={() => setIsComparisonOpen(false)}
          startDate={startDateFilter}
          endDate={endDateFilter}
          trades={closedTrades}
        />
      )}

    </div>
  );
};

// Simple Refresh spinner replacement helper
const RefreshCw = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M16 3h5v5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 21H3v-5" />
  </svg>
);

// ==========================================
// AI Insights Engine Side-Drawer Sub-component
// ==========================================

interface PnLInsightsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  trades: ClosedTrade[];
}

interface InsightFlash {
  id: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  value: string;
  description: string;
  icon: string;
}

function generateDynamicFlashes(trades: ClosedTrade[]): InsightFlash[] {
  if (!trades || trades.length === 0) return [];
  
  const flashes: InsightFlash[] = [];
  
  // 1. Win Rate & Streak
  let consecutiveWins = 0;
  let maxWinStreak = 0;
  let winCount = 0;
  let totalPnL = 0;
  let grossProfits = 0;
  
  const sorted = [...trades].sort((a, b) => new Date(a.sell_date).getTime() - new Date(b.sell_date).getTime());
  
  sorted.forEach(t => {
    totalPnL += t.realized_pnl;
    if (t.realized_pnl > 0) {
      winCount++;
      grossProfits += t.realized_pnl;
      consecutiveWins++;
      if (consecutiveWins > maxWinStreak) {
        maxWinStreak = consecutiveWins;
      }
    } else {
      consecutiveWins = 0;
    }
  });
  
  const winRate = (winCount / trades.length) * 100;
  
  flashes.push({
    id: 'win_streak',
    type: maxWinStreak >= 3 ? 'success' : 'info',
    title: 'Peak Win Streak',
    value: `${maxWinStreak} Trades`,
    description: maxWinStreak >= 3 
      ? `You executed ${maxWinStreak} consecutive profitable trades. Positive execution discipline!`
      : `Your longest consecutive winning streak is ${maxWinStreak} trades. Focus on entry validation.`,
    icon: 'Flame'
  });
  
  flashes.push({
    id: 'win_rate',
    type: winRate >= 50 ? 'success' : 'warning',
    title: 'Realized Win Rate',
    value: `${winRate.toFixed(1)}%`,
    description: winRate >= 50
      ? `Over half of your exited positions resolved in a profit. Good selective validation.`
      : `Win rate is below 50%. Ensure you aren't over-trading or chasing volatile assets.`,
    icon: 'Percent'
  });

  // 2. Average Holding Period (Winners vs Losers)
  let winHoldDays = 0;
  let winHoldCount = 0;
  let lossHoldDays = 0;
  let lossHoldCount = 0;
  
  trades.forEach(t => {
    if (t.realized_pnl > 0) {
      winHoldDays += t.holding_days;
      winHoldCount++;
    } else {
      lossHoldDays += t.holding_days;
      lossHoldCount++;
    }
  });
  
  const avgWinHold = winHoldCount > 0 ? winHoldDays / winHoldCount : 0;
  const avgLossHold = lossHoldCount > 0 ? lossHoldDays / lossHoldCount : 0;
  
  if (avgLossHold > 0 || avgWinHold > 0) {
    const holdingRatio = avgLossHold / (avgWinHold || 1);
    let type: 'success' | 'warning' | 'info' = 'info';
    let desc = '';
    
    if (holdingRatio > 1.5) {
      type = 'warning';
      desc = `You hold losing stocks ${holdingRatio.toFixed(1)}x longer than winners (${Math.round(avgLossHold)} vs ${Math.round(avgWinHold)} days). Avoid the "Get-Even" behavioral trap.`;
    } else if (holdingRatio < 1.0 && avgWinHold > 0) {
      type = 'success';
      desc = `Excellent! You let your winners run (${Math.round(avgWinHold)} days avg) and cut your losses quickly (${Math.round(avgLossHold)} days avg).`;
    } else {
      desc = `Average hold times: Winners: ${Math.round(avgWinHold)} days, Losers: ${Math.round(avgLossHold)} days. Balanced trade lifecycle.`;
    }
    
    flashes.push({
      id: 'holding_bias',
      type,
      title: 'Holding Period Bias',
      value: `${Math.round(avgLossHold)} vs ${Math.round(avgWinHold)} Days`,
      description: desc,
      icon: 'Clock'
    });
  }

  // 3. 80/20 Profit Drivers
  if (grossProfits > 0) {
    const profitByStock: Record<string, number> = {};
    trades.forEach(t => {
      if (t.realized_pnl > 0) {
        profitByStock[t.stock_symbol] = (profitByStock[t.stock_symbol] || 0) + t.realized_pnl;
      }
    });
    
    const sortedProfits = Object.entries(profitByStock).sort((a, b) => b[1] - a[1]);
    let accumulatedProfit = 0;
    const topDrivers: string[] = [];
    
    for (const [sym, pnl] of sortedProfits) {
      accumulatedProfit += pnl;
      topDrivers.push(sym);
      if (accumulatedProfit >= grossProfits * 0.8) {
        break;
      }
    }
    
    const pctDrivers = (topDrivers.length / Object.keys(profitByStock).length) * 100;
    
    flashes.push({
      id: 'profit_drivers',
      type: pctDrivers <= 30 ? 'success' : 'info',
      title: 'Profit Drivers (80/20)',
      value: `${topDrivers.slice(0, 3).join(', ')}`,
      description: `Just ${topDrivers.length} stock(s) drive 80% of your gross realized gains. Double-down on your best-performing setups.`,
      icon: 'PieChart'
    });
  }

  // 4. Friction Cost Drag
  const totalVolume = trades.reduce((acc, t) => acc + (t.buy_price * t.quantity) + (t.sell_price * t.quantity), 0);
  const estimatedCharges = totalVolume * 0.0006;
  
  if (totalPnL !== 0) {
    const dragPct = (estimatedCharges / Math.abs(totalPnL)) * 100;
    flashes.push({
      id: 'transaction_costs',
      type: dragPct > 10 ? 'warning' : 'success',
      title: 'Friction Cost Drag',
      value: `₹${Math.round(estimatedCharges)}`,
      description: `Brokerages and STT consumed ~${dragPct.toFixed(1)}% of your net P&L volume. ${dragPct > 10 ? 'Reduce high-frequency trades to cut friction.' : 'Low friction drag indicates high transaction efficiency.'}`,
      icon: 'CircleDollarSign'
    });
  }
  
  return flashes;
}

const PnLInsightsDrawer = ({ isOpen, onClose, trades }: PnLInsightsDrawerProps) => {
  const flashes = generateDynamicFlashes(trades);

  const getIcon = (name: string) => {
    switch (name) {
      case 'Flame': return <Flame className="w-4 h-4 text-amber-500" />;
      case 'Percent': return <Percent className="w-4 h-4 text-brand-500" />;
      case 'Clock': return <Clock className="w-4 h-4 text-emerald-500" />;
      case 'PieChart': return <PieChart className="w-4 h-4 text-indigo-500" />;
      case 'CircleDollarSign': return <CircleDollarSign className="w-4 h-4 text-rose-500" />;
      default: return <Sparkles className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end items-end md:items-stretch overflow-hidden select-none">
      {/* Backdrop overlay */}
      <div 
        className={`absolute inset-0 bg-dark-depth-0/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Drawer Panel content container */}
      <div className={`relative w-full md:max-w-md bg-dark-depth-1 border-t md:border-t-0 md:border-l border-dark-border h-[80vh] md:h-full shadow-2xl flex flex-col justify-between transition-all duration-300 ease-out rounded-t-3xl md:rounded-t-none ${
        isOpen 
          ? 'translate-y-0 md:translate-x-0' 
          : 'translate-y-full md:translate-y-0 md:translate-x-full'
      }`}>
        
        {/* Header */}
        <div className="p-5 border-b border-dark-border/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-500 animate-pulse" />
            <div>
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider font-display">Behavioral Insights</h3>
              <p className="text-[10px] text-gray-500 font-semibold mt-0.5">AI Ledger Audit & Highlights</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-dark-depth-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable insights list content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {flashes.length === 0 ? (
            <div className="text-center py-20 text-gray-500 text-xs font-semibold">
              Not enough trade data to compute insights.
            </div>
          ) : (
            flashes.map((f, idx) => {
              let typeClass = 'border-dark-border/50 bg-dark-depth-2/40';
              let badgeColor = 'text-gray-400 bg-gray-400/5';
              if (f.type === 'success') {
                typeClass = 'border-emerald-500/20 bg-emerald-500/5';
                badgeColor = 'text-emerald-500 bg-emerald-500/10';
              } else if (f.type === 'warning') {
                typeClass = 'border-rose-500/20 bg-rose-500/5';
                badgeColor = 'text-rose-500 bg-rose-500/10';
              }

              return (
                <div 
                  key={f.id} 
                  className={`p-4 rounded-2xl border text-xs space-y-2.5 transition-all animate-slide-up-fade ${typeClass}`}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-dark-depth-2 border border-dark-border/60">
                        {getIcon(f.icon)}
                      </div>
                      <span className="font-extrabold text-white text-[11px] uppercase tracking-wider">{f.title}</span>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${badgeColor}`}>
                      {f.value}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed font-medium pl-0.5">
                    {f.description}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-dark-border/40 bg-dark-depth-2/30 shrink-0 text-center">
          <p className="text-[9px] text-gray-500 font-extrabold uppercase tracking-widest leading-relaxed">
            Finor V6.0 Insights Engine • Supabase Analytics
          </p>
        </div>

      </div>
    </div>
  );
};

// ==========================================
// Sub-component: AI P&L Comparison Modal
// ==========================================

interface PnLComparisonModalProps {
  onClose: () => void;
  startDate?: string;
  endDate?: string;
  trades: any[];
}

const PnLComparisonModal = ({ onClose, startDate, endDate, trades }: PnLComparisonModalProps) => {
  const [report, setReport] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Selector States
  const [stockA, setStockA] = useState<string>('ALL');
  const [stockB, setStockB] = useState<string>('ALL');
  const [localStartDate, setLocalStartDate] = useState<string>(startDate || '');
  const [localEndDate, setLocalEndDate] = useState<string>(endDate || '');

  // Extract unique traded symbols
  const uniqueSymbols = [...new Set(trades.map(t => t.stock_symbol.toUpperCase()))].sort();

  const fetchComparison = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('/analytics/pnl-comparison/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          startDate: localStartDate, 
          endDate: localEndDate,
          stockA,
          stockB
        })
      });
      setReport(response.report);
    } catch (err: any) {
      console.error('Failed to load P&L comparison:', err);
      setError(err.message || 'Failed to generate behavioral comparison.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsAnimating(true);
    fetchComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 250);
  };

  const parsedHtml = report ? (marked.parse(report) as string) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-depth-0/80 backdrop-blur-md transition-opacity duration-300">
      <div className="absolute inset-0 bg-transparent" onClick={handleClose} />
      
      <div className={`glass-panel w-full max-w-2xl max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl border border-dark-border flex flex-col transition-all duration-300 transform ${
        isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      }`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-500 animate-pulse" />
            <div>
              <h3 className="text-base font-extrabold text-white uppercase tracking-wider font-display">AI Comparative Profit & Behavior Audit</h3>
              <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Gemini AI behavioral comparison report</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-dark-depth-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls Panel */}
        <div className="p-5 bg-dark-depth-2/40 border-b border-dark-border/40 space-y-4 shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Stock A Selector */}
            <div className="space-y-1">
              <label className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Compare Stock A</label>
              <select
                value={stockA}
                onChange={(e) => setStockA(e.target.value)}
                className="w-full text-xs bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-white font-semibold outline-none focus:border-brand-500 transition-colors"
              >
                <option value="ALL">Overall Portfolio</option>
                {uniqueSymbols.map(sym => (
                  <option key={`a-${sym}`} value={sym}>{sym}</option>
                ))}
              </select>
            </div>

            {/* Stock B Selector */}
            <div className="space-y-1">
              <label className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Compare Stock B</label>
              <select
                value={stockB}
                onChange={(e) => setStockB(e.target.value)}
                className="w-full text-xs bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-white font-semibold outline-none focus:border-brand-500 transition-colors"
              >
                <option value="ALL">Overall Portfolio</option>
                {uniqueSymbols.map(sym => (
                  <option key={`b-${sym}`} value={sym}>{sym}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div className="space-y-1">
              <label className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Start Date</label>
              <input
                type="date"
                value={localStartDate}
                onChange={(e) => setLocalStartDate(e.target.value)}
                className="w-full text-xs bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-white font-semibold outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            {/* End Date */}
            <div className="space-y-1">
              <label className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">End Date</label>
              <input
                type="date"
                value={localEndDate}
                onChange={(e) => setLocalEndDate(e.target.value)}
                className="w-full text-xs bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-white font-semibold outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <p className="text-[10px] text-gray-500 font-semibold leading-relaxed">
              {stockA !== 'ALL' && stockB !== 'ALL' && stockA !== stockB 
                ? `Auditing head-to-head performance: ${stockA} vs ${stockB}.`
                : `Auditing overall portfolio behavioral performance.`
              }
            </p>
            <button
              onClick={fetchComparison}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs font-black uppercase tracking-wider text-white transition-colors cursor-pointer select-none disabled:opacity-50 shrink-0 flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {loading ? 'Analyzing...' : 'Run AI Audit'}
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 scrollbar-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest animate-pulse">Analyzing Ledger Trajectories...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 flex gap-3 text-xs text-rose-500 items-start">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <span className="font-extrabold block uppercase tracking-wider">Audit Failed</span>
                <span className="font-medium mt-1 block">{error}</span>
              </div>
            </div>
          ) : (
            <div 
              className="markdown-body text-gray-300 text-xs pl-0.5" 
              dangerouslySetInnerHTML={{ __html: parsedHtml }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-dark-border/40 bg-dark-depth-2/30 flex justify-end shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-xs font-extrabold uppercase tracking-wider text-gray-300 hover:text-white transition-colors cursor-pointer select-none"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
};
