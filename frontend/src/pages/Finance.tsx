import React, { useState, useEffect } from 'react';
import { 
  Landmark, ArrowDownRight, RefreshCw, CheckCircle2, AlertCircle, Plus, Trash2, 
  Edit2, UserMinus, UserPlus, Users, Sparkles, X, Copy
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  method: string;
  description: string;
  source: 'MANUAL' | 'GMAIL';
}

interface Debt {
  id: string;
  person_name: string;
  type: 'LENT' | 'BORROWED';
  amount: number;
  remaining_amount: number;
  date: string;
  notes: string;
  status: 'ACTIVE' | 'SETTLED';
}

interface Goal {
  id: string;
  asset_class: 'LIQUID_CASH' | 'MUTUAL_FUND' | 'GOLD_SILVER' | 'EQUITY_STOCKS' | 'US_STOCKS' | 'ETF';
  current_value: number;
  target_value: number;
  gold_grams: number;
  silver_grams: number;
}

interface AutoValuations {
  equity: number;
  etf: number;
  goldPricePerGram: number;
  silverPricePerGram: number;
}

const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Investments', 'Bills/Utilities', 'Rent', 'Salary/Income', 'Debt Repayment', 'Uncategorized'];
const METHODS = ['UPI', 'Cash', 'Credit Card', 'Bank Transfer', 'Debit Card'];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

export const Finance: React.FC = () => {
  const [subTab, setSubTab] = useState<'wealth' | 'expenses' | 'debts'>('wealth');
  
  // Dashboard states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [smsWebhook, setSmsWebhook] = useState<{ url: string; secret: string } | null>(null);
  const [autoValuations, setAutoValuations] = useState<AutoValuations>({
    equity: 0,
    etf: 0,
    goldPricePerGram: 0,
    silverPricePerGram: 0
  });

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Forms
  const [showTxModal, setShowTxModal] = useState(false);
  const [txForm, setTxForm] = useState<{
    id?: string;
    date: string;
    amount: string;
    type: 'INCOME' | 'EXPENSE';
    category: string;
    method: string;
    description: string;
  }>({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    type: 'EXPENSE',
    category: 'Food',
    method: 'UPI',
    description: ''
  });

  const [showDebtModal, setShowDebtModal] = useState(false);
  const [debtForm, setDebtForm] = useState({
    id: '',
    person_name: '',
    type: 'LENT' as 'LENT' | 'BORROWED',
    amount: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [showRepayModal, setShowRepayModal] = useState<Debt | null>(null);
  const [repayForm, setRepayForm] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'UPI',
    description: ''
  });

  const [showGoalModal, setShowGoalModal] = useState<Goal | null>(null);
  const [goalForm, setGoalForm] = useState({
    asset_class: 'LIQUID_CASH',
    current_value: '',
    target_value: '',
    gold_grams: '0',
    silver_grams: '0'
  });

  const triggerToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiRequest('/finance/dashboard');
      setTransactions(data.transactions);
      setDebts(data.debts);
      setGoals(data.goals);
      setSmsWebhook(data.smsWebhook);
      setAutoValuations(data.autoValuations);
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to fetch financial data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Compute values
  const getGoalValue = (goal: Goal) => {
    if (goal.asset_class === 'EQUITY_STOCKS') return autoValuations.equity;
    if (goal.asset_class === 'ETF') return autoValuations.etf;
    if (goal.asset_class === 'GOLD_SILVER') {
      const goldVal = (goal.gold_grams || 0) * autoValuations.goldPricePerGram;
      const silverVal = (goal.silver_grams || 0) * autoValuations.silverPricePerGram;
      return goldVal + silverVal;
    }
    return goal.current_value;
  };

  const netLentDebts = debts
    .filter(d => d.status === 'ACTIVE' && d.type === 'LENT')
    .reduce((sum, d) => sum + d.remaining_amount, 0);

  const netBorrowedDebts = debts
    .filter(d => d.status === 'ACTIVE' && d.type === 'BORROWED')
    .reduce((sum, d) => sum + d.remaining_amount, 0);

  // Asset allocation values
  const assetValues = {
    LIQUID_CASH: 0,
    MUTUAL_FUND: 0,
    GOLD_SILVER: 0,
    EQUITY_STOCKS: autoValuations.equity,
    US_STOCKS: 0,
    ETF: autoValuations.etf
  };

  goals.forEach(g => {
    if (g.asset_class !== 'EQUITY_STOCKS' && g.asset_class !== 'ETF') {
      assetValues[g.asset_class] = getGoalValue(g);
    }
  });

  const totalAssets = Object.values(assetValues).reduce((sum, v) => sum + v, 0) + netLentDebts;
  const netWorth = totalAssets - netBorrowedDebts;

  // Monthly metrics
  const thisMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const monthlyExpenses = transactions
    .filter(t => t.type === 'EXPENSE' && t.date.startsWith(thisMonth))
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlyIncome = transactions
    .filter(t => t.type === 'INCOME' && t.date.startsWith(thisMonth))
    .reduce((sum, t) => sum + t.amount, 0);

  // Sync Gmail
  const handleGmailSync = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest('/finance/sync-gmail', { method: 'POST' });
      triggerToast('success', res.message || 'Sync completed successfully.');
      fetchDashboardData(true);
    } catch (err: any) {
      triggerToast('error', err.message || 'Gmail sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  // Transaction Actions
  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/finance/transaction', {
        method: 'POST',
        body: JSON.stringify(txForm)
      });
      triggerToast('success', 'Transaction saved successfully.');
      setShowTxModal(false);
      fetchDashboardData(true);
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to save transaction.');
    }
  };

  const handleDeleteTx = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      await apiRequest(`/finance/transaction/${id}`, { method: 'DELETE' });
      triggerToast('success', 'Transaction deleted.');
      fetchDashboardData(true);
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to delete.');
    }
  };

  // Debt Actions
  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/finance/debt', {
        method: 'POST',
        body: JSON.stringify(debtForm)
      });
      triggerToast('success', 'Debt ledger entry saved.');
      setShowDebtModal(false);
      fetchDashboardData(true);
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to save debt.');
    }
  };

  const handleRepay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRepayModal) return;
    try {
      await apiRequest(`/finance/debt/${showRepayModal.id}/repay`, {
        method: 'POST',
        body: JSON.stringify(repayForm)
      });
      triggerToast('success', 'Repayment logged.');
      setShowRepayModal(null);
      fetchDashboardData(true);
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to record repayment.');
    }
  };

  const handleDeleteDebt = async (id: string) => {
    if (!confirm('Delete this debt record?')) return;
    try {
      await apiRequest(`/finance/debt/${id}`, { method: 'DELETE' });
      triggerToast('success', 'Debt record deleted.');
      fetchDashboardData(true);
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to delete.');
    }
  };

  // Goal Actions
  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/finance/goals', {
        method: 'POST',
        body: JSON.stringify(goalForm)
      });
      triggerToast('success', 'Wealth goal updated.');
      setShowGoalModal(null);
      fetchDashboardData(true);
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to update goal.');
    }
  };

  // Format currency
  const fmt = (num: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // Chart data
  const chartData = [
    { name: 'Cash', value: assetValues.LIQUID_CASH },
    { name: 'Mutual Funds', value: assetValues.MUTUAL_FUND },
    { name: 'Metals', value: assetValues.GOLD_SILVER },
    { name: 'Equities', value: assetValues.EQUITY_STOCKS },
    { name: 'US Stocks', value: assetValues.US_STOCKS },
    { name: 'ETFs', value: assetValues.ETF }
  ].filter(d => d.value > 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400 font-semibold tracking-wider uppercase select-none">Loading Finance Hub...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-6 md:pt-0 pb-16">
      
      {/* Top Banner Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white">Finance Hub</h1>
          <p className="text-xs text-gray-400 mt-1">Complete control over your expenses, wealth goals, net worth, and debt ledgers.</p>
        </div>
        
        {/* Sync Toast Notification */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold border shadow-xl animate-in slide-in-from-top-4 duration-300 ${
            toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
            toast.type === 'error'   ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
            'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.message}
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Estimated Net Worth</span>
          <span className="text-2xl font-black text-white mt-1.5 block">{fmt(netWorth)}</span>
          <span className="text-[9px] text-emerald-400 mt-1 block">Assets: {fmt(totalAssets)} | Liab: {fmt(netBorrowedDebts)}</span>
          <Landmark className="absolute top-4 right-4 w-5 h-5 text-brand-500/20" />
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Month Burn Rate ({new Date().toLocaleString('default', { month: 'short' })})</span>
          <span className="text-2xl font-black text-rose-500 mt-1.5 block">{fmt(monthlyExpenses)}</span>
          <span className="text-[9px] text-gray-400 mt-1 block">Income: {fmt(monthlyIncome)}</span>
          <ArrowDownRight className="absolute top-4 right-4 w-5 h-5 text-rose-500/20" />
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Total Lent to Friends</span>
          <span className="text-2xl font-black text-emerald-400 mt-1.5 block">{fmt(netLentDebts)}</span>
          <span className="text-[9px] text-gray-400 mt-1 block">Receivable Asset value</span>
          <UserPlus className="absolute top-4 right-4 w-5 h-5 text-emerald-500/20" />
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Total Borrowed</span>
          <span className="text-2xl font-black text-amber-500 mt-1.5 block">{fmt(netBorrowedDebts)}</span>
          <span className="text-[9px] text-gray-400 mt-1 block">Payable Liability value</span>
          <UserMinus className="absolute top-4 right-4 w-5 h-5 text-amber-500/20" />
        </div>
      </div>

      {/* Subtab Bar */}
      <div className="flex border-b border-dark-border/60">
        <button
          onClick={() => setSubTab('wealth')}
          className={`px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            subTab === 'wealth' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Wealth & Goals
        </button>
        <button
          onClick={() => setSubTab('expenses')}
          className={`px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            subTab === 'expenses' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Expenses & Sync
        </button>
        <button
          onClick={() => setSubTab('debts')}
          className={`px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            subTab === 'debts' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Debt Ledger
        </button>
      </div>

      {/* ─── TAB 1: WEALTH & GOALS ─── */}
      {subTab === 'wealth' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Allocation Donut Chart */}
          <div className="glass-panel rounded-3xl p-6 border border-dark-border flex flex-col justify-between">
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Asset Allocation</h3>
            
            {chartData.length > 0 ? (
              <div className="h-[200px] my-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f141f', borderColor: '#1e293b', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                      formatter={(val: any) => fmt(Number(val))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-xs text-gray-500">
                No asset data available. Setup your goals below to begin mapping wealth.
              </div>
            )}

            {/* Chart Legend */}
            <div className="space-y-1.5 mt-2">
              {chartData.map((d, index) => (
                <div key={d.name} className="flex items-center justify-between text-[10px] font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-gray-400">{d.name}</span>
                  </div>
                  <span className="text-white">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Goal Targets and Progress */}
          <div className="lg:col-span-2 glass-panel rounded-3xl p-6 border border-dark-border space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Financial Wealth Goals</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase block">Dynamic Gold: {fmt(autoValuations.goldPricePerGram)}/g</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { class: 'LIQUID_CASH', label: 'Liquid Cash', desc: 'Savings & Bank balances' },
                { class: 'MUTUAL_FUND', label: 'Mutual Funds', desc: 'P2P & MF Allocations' },
                { class: 'GOLD_SILVER', label: 'Gold & Silver', desc: 'Precious metal holdings' },
                { class: 'EQUITY_STOCKS', label: 'Equity Stocks', desc: 'Auto-linked to active positions' },
                { class: 'US_STOCKS', label: 'US Stocks', desc: 'Overseas investments' },
                { class: 'ETF', label: 'ETFs', desc: 'Indices tracker index funds' },
              ].map(item => {
                const goal = goals.find(g => g.asset_class === item.class) || {
                  id: '',
                  asset_class: item.class as any,
                  current_value: 0,
                  target_value: 0,
                  gold_grams: 0,
                  silver_grams: 0
                };
                
                const curVal = getGoalValue(goal);
                const target = goal.target_value || 0;
                const progress = target > 0 ? Math.min(100, (curVal / target) * 100) : 0;

                return (
                  <div key={item.class} className="bg-dark-depth-2/40 border border-dark-border/45 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">{item.label}</span>
                        <span className="text-[9px] text-gray-500 block mt-0.5">{item.desc}</span>
                      </div>
                      
                      {/* Edit Trigger */}
                      <button
                        onClick={() => {
                          setGoalForm({
                            asset_class: goal.asset_class,
                            current_value: goal.current_value.toString(),
                            target_value: goal.target_value.toString(),
                            gold_grams: (goal.gold_grams || 0).toString(),
                            silver_grams: (goal.silver_grams || 0).toString()
                          });
                          setShowGoalModal(goal);
                        }}
                        className="p-1 rounded-lg border border-transparent hover:border-dark-border hover:bg-dark-depth-3/60 text-gray-400 hover:text-white transition-all cursor-pointer"
                        title="Edit targets"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between text-[10px] font-extrabold mb-1">
                        <span className="text-gray-400">{fmt(curVal)}</span>
                        <span className="text-gray-500">Target: {fmt(target)}</span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-dark-depth-3 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-brand-500 rounded-full transition-all duration-500" 
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-brand-400 font-extrabold mt-1 block">{progress.toFixed(0)}% Completed</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: EXPENSES & SYNC ─── */}
      {subTab === 'expenses' && (
        <div className="space-y-6">
          
          {/* Sync Trigger and Add Button */}
          <div className="flex items-center justify-between bg-dark-depth-2/30 border border-dark-border/40 p-4 rounded-2xl gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-400" />
              <div>
                <h4 className="text-xs font-bold text-white">Gmail Pull Ingestion</h4>
                <p className="text-[9px] text-gray-400 mt-0.5">Click to search and parse Google Pay/banking transaction emails from the last 7 days.</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleGmailSync}
                disabled={syncing}
                className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center gap-2 ${
                  syncing 
                    ? 'bg-dark-depth-3 border-dark-border text-gray-500 cursor-not-allowed'
                    : 'bg-brand-500/10 border-brand-500/25 text-brand-400 hover:bg-brand-500/20'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Gmail'}
              </button>

              <button
                onClick={() => {
                  setTxForm({
                    date: new Date().toISOString().split('T')[0],
                    amount: '',
                    type: 'EXPENSE',
                    category: 'Food',
                    method: 'UPI',
                    description: ''
                  });
                  setShowTxModal(true);
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Add Cash Record
              </button>
            </div>
          </div>

          {/* SMS Webhook Ingestion Configuration Setup Panel */}
          {smsWebhook && (
            <div className="glass-panel border border-dark-border/60 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-dark-border/40 pb-3">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-extrabold text-white uppercase tracking-wider">SMS Auto-Sync Setup</h4>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Forward banking transaction alerts from your Android device directly to Finor. This allows you to track UPI, Credit Card, and bank balances automatically across all phone accounts.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Endpoint URL Input with copy */}
                <div className="space-y-1.5">
                  <span className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wide block">Webhook Endpoint URL</span>
                  <div className="flex items-center gap-1 bg-dark-depth-2/45 border border-dark-border/50 rounded-xl px-3 py-2">
                    <span className="text-[10px] font-semibold text-gray-300 select-all truncate flex-1">{smsWebhook.url}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(smsWebhook.url);
                        triggerToast('success', 'Endpoint URL copied to clipboard.');
                      }}
                      className="p-1 rounded-lg hover:bg-dark-depth-3 text-gray-400 hover:text-white transition-all cursor-pointer shrink-0"
                      title="Copy URL"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Secret Key Input with copy */}
                <div className="space-y-1.5">
                  <span className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wide block">Webhook Secret Key</span>
                  <div className="flex items-center gap-1 bg-dark-depth-2/45 border border-dark-border/50 rounded-xl px-3 py-2">
                    <span className="text-[10px] font-bold text-indigo-400 select-all truncate flex-1">{smsWebhook.secret}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(smsWebhook.secret);
                        triggerToast('success', 'Secret key copied to clipboard.');
                      }}
                      className="p-1 rounded-lg hover:bg-dark-depth-3 text-gray-400 hover:text-white transition-all cursor-pointer shrink-0"
                      title="Copy Secret"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="bg-dark-depth-2/30 border border-dark-border/40 rounded-xl p-3.5 text-[10px] text-gray-400 space-y-2">
                <span className="font-extrabold text-white block uppercase tracking-wider text-[8px] text-indigo-400">Android Setup Guide</span>
                <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                  <li>Install a free SMS forwarding app (e.g. <strong>SmsForwarder</strong> or <strong>SMS to HTTP</strong>) from Google Play.</li>
                  <li>Create a new forwarder rule matching bank codes or messages containing <code>debited</code>, <code>credited</code>, <code>spent</code>.</li>
                  <li>Configure the HTTP Request method as <strong>POST</strong> and point to the Endpoint URL above.</li>
                  <li>Add parameters or request body (JSON) sending fields <code>sender</code>, <code>body</code>, <code>timestamp</code>, and <code>secret</code>.</li>
                </ol>
              </div>
            </div>
          )}

          {/* Transactions Table */}
          <div className="glass-panel rounded-3xl border border-dark-border overflow-hidden">
            <div className="p-5 border-b border-dark-border/60">
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Transaction Ledger</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-dark-border bg-dark-depth-2/30">
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Category</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Method</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Source</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Description</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border/40 text-xs">
                  {transactions.length > 0 ? (
                    transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-dark-depth-2/20">
                        <td className="p-4 font-medium text-gray-300">
                          {new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className={`p-4 font-black ${tx.type === 'INCOME' ? 'text-emerald-400' : 'text-white'}`}>
                          {tx.type === 'INCOME' ? '+' : '-'} {fmt(tx.amount)}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                            tx.type === 'INCOME' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="bg-dark-depth-2 px-2 py-0.5 rounded-lg border border-dark-border/60 font-semibold text-[10px] text-gray-300">
                            {tx.category}
                          </span>
                        </td>
                        <td className="p-4 text-gray-400 font-semibold">{tx.method}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            tx.source === 'GMAIL' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-700/20 text-gray-400'
                          }`}>
                            {tx.source}
                          </span>
                        </td>
                        <td className="p-4 text-gray-400 truncate max-w-xs" title={tx.description}>
                          {tx.description || '-'}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setTxForm({
                                  id: tx.id,
                                  date: tx.date.split('T')[0],
                                  amount: tx.amount.toString(),
                                  type: tx.type,
                                  category: tx.category,
                                  method: tx.method,
                                  description: tx.description
                                });
                                setShowTxModal(true);
                              }}
                              className="p-1 rounded-lg hover:bg-dark-depth-2 text-gray-400 hover:text-white transition-all cursor-pointer"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTx(tx.id)}
                              className="p-1 rounded-lg hover:bg-rose-500/10 text-gray-400 hover:text-rose-500 transition-all cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-500">
                        No transactions recorded. Click "Sync Gmail" or "Add Cash Record" to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: DEBT LEDGER ─── */}
      {subTab === 'debts' && (
        <div className="space-y-6">
          
          {/* Summary and Add Action */}
          <div className="flex items-center justify-between bg-dark-depth-2/30 border border-dark-border/40 p-4 rounded-2xl gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-400" />
              <div>
                <h4 className="text-xs font-bold text-white">Friends Debt Ledger</h4>
                <p className="text-[9px] text-gray-400 mt-0.5">Track money lent to friends or borrowed. Lent funds count towards Net Worth.</p>
              </div>
            </div>

            <button
              onClick={() => {
                setDebtForm({
                  id: '',
                  person_name: '',
                  type: 'LENT',
                  amount: '',
                  notes: '',
                  date: new Date().toISOString().split('T')[0]
                });
                setShowDebtModal(true);
              }}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-brand-500 text-white hover:bg-brand-600 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Create Debt Entry
            </button>
          </div>

          {/* Active Debts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {debts.length > 0 ? (
              debts.map((d) => (
                <div key={d.id} className={`glass-panel border rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between space-y-4 ${
                  d.status === 'SETTLED' ? 'border-dark-border/40 opacity-60' : d.type === 'LENT' ? 'border-emerald-500/20' : 'border-amber-500/20'
                }`}>
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white">{d.person_name}</span>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                          d.status === 'SETTLED' ? 'bg-slate-700/20 text-gray-400' : d.type === 'LENT' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {d.type === 'LENT' ? 'Lent' : 'Borrowed'}
                        </span>
                      </div>
                      <span className="text-[9px] text-gray-500 block mt-1">
                        Recorded: {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setDebtForm({
                            id: d.id,
                            person_name: d.person_name,
                            type: d.type,
                            amount: d.amount.toString(),
                            notes: d.notes,
                            date: d.date.split('T')[0]
                          });
                          setShowDebtModal(true);
                        }}
                        className="p-1 rounded-lg hover:bg-dark-depth-2 text-gray-400 hover:text-white transition-all cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDebt(d.id)}
                        className="p-1 rounded-lg hover:bg-rose-500/10 text-gray-400 hover:text-rose-500 transition-all cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Content Valuation */}
                  <div>
                    <div className="flex items-baseline justify-between text-xs font-black">
                      <span className="text-gray-400">Remaining Due:</span>
                      <span className={d.status === 'SETTLED' ? 'text-gray-500' : d.type === 'LENT' ? 'text-emerald-400' : 'text-amber-500'}>
                        {fmt(d.remaining_amount)}
                      </span>
                    </div>
                    
                    <div className="w-full bg-dark-depth-3 rounded-full h-1 overflow-hidden mt-1.5">
                      <div 
                        className={`h-full rounded-full ${d.type === 'LENT' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${d.amount > 0 ? (d.remaining_amount / d.amount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-gray-500 block mt-1">Original debt: {fmt(d.amount)}</span>
                  </div>

                  {/* Notes & Repayment Actions */}
                  <div className="border-t border-dark-border/40 pt-3 flex items-center justify-between gap-4">
                    <p className="text-[10px] text-gray-400 italic truncate max-w-xs">{d.notes || 'No description notes.'}</p>
                    
                    {d.status === 'ACTIVE' && (
                      <button
                        onClick={() => {
                          setRepayForm({
                            amount: d.remaining_amount.toString(),
                            date: new Date().toISOString().split('T')[0],
                            method: 'UPI',
                            description: `Repayment received from ${d.person_name}`
                          });
                          setShowRepayModal(d);
                        }}
                        className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg border transition-all cursor-pointer shrink-0 ${
                          d.type === 'LENT' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' 
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                        }`}
                      >
                        Record Repayment
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-2 p-8 text-center text-gray-500 glass-panel rounded-2xl border border-dark-border">
                No active or historical peer debt entries. Click "Create Debt Entry" to begin.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL 1: ADD/EDIT TRANSACTION ─── */}
      {showTxModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-depth-1 border border-dark-border w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-dark-border/60 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">{txForm.id ? 'Edit Transaction' : 'Record Cash/Manual Transaction'}</h3>
              <button onClick={() => setShowTxModal(false)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleSaveTx} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={txForm.date}
                    onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="500.00"
                    value={txForm.amount}
                    onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Type</label>
                  <select
                    value={txForm.type}
                    onChange={(e) => setTxForm({ ...txForm, type: e.target.value as any })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="EXPENSE">Expense (Debit)</option>
                    <option value="INCOME">Income (Credit)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Category</label>
                  <select
                    value={txForm.category}
                    onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Payment Method</label>
                <select
                  value={txForm.method}
                  onChange={(e) => setTxForm({ ...txForm, method: e.target.value })}
                  className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Description / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Swiggy food delivery, rent payment"
                  value={txForm.description}
                  onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                  className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Save Transaction
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: ADD/EDIT DEBT ENTRY ─── */}
      {showDebtModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-depth-1 border border-dark-border w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-dark-border/60 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">{debtForm.id ? 'Edit Debt Record' : 'Create Debt Entry'}</h3>
              <button onClick={() => setShowDebtModal(false)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleSaveDebt} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Friend / Person Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul, John Doe"
                  value={debtForm.person_name}
                  onChange={(e) => setDebtForm({ ...debtForm, person_name: e.target.value })}
                  className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Type</label>
                  <select
                    value={debtForm.type}
                    onChange={(e) => setDebtForm({ ...debtForm, type: e.target.value as any })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="LENT">Lent (I gave them money)</option>
                    <option value="BORROWED">Borrowed (They gave me money)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Principal Amount (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="1000"
                    value={debtForm.amount}
                    onChange={(e) => setDebtForm({ ...debtForm, amount: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={debtForm.date}
                    onChange={(e) => setDebtForm({ ...debtForm, date: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Notes / Description</label>
                <textarea
                  placeholder="e.g. Split lunch bill, trip expense"
                  value={debtForm.notes}
                  onChange={(e) => setDebtForm({ ...debtForm, notes: e.target.value })}
                  className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none min-h-[60px]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Save Debt Record
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: RECORD DEBT REPAYMENT ─── */}
      {showRepayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-depth-1 border border-dark-border w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-dark-border/60 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Record Repayment</h3>
                <span className="text-[9px] text-gray-400 block mt-0.5">Person: {showRepayModal.person_name} | Due: {fmt(showRepayModal.remaining_amount)}</span>
              </div>
              <button onClick={() => setShowRepayModal(null)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleRepay} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Repaid Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Enter amount"
                    value={repayForm.amount}
                    onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Repayment Date</label>
                  <input
                    type="date"
                    required
                    value={repayForm.date}
                    onChange={(e) => setRepayForm({ ...repayForm, date: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Payment Method</label>
                <select
                  value={repayForm.method}
                  onChange={(e) => setRepayForm({ ...repayForm, method: e.target.value })}
                  className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Description / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Returned lunch split via GPay"
                  value={repayForm.description}
                  onChange={(e) => setRepayForm({ ...repayForm, description: e.target.value })}
                  className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Log Repayment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: EDIT GOAL TARGET ─── */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-depth-1 border border-dark-border w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-dark-border/60 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Update Target settings</h3>
              <button onClick={() => setShowGoalModal(null)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleSaveGoal} className="p-6 space-y-4">
              <div className="text-xs text-gray-400 border border-dark-border/40 bg-dark-depth-2/30 p-3.5 rounded-xl">
                Asset Class: <strong className="text-white font-extrabold">{goalForm.asset_class}</strong>
              </div>

              {/* Only show current value input for manual fields (not Equity/ETF) */}
              {goalForm.asset_class !== 'EQUITY_STOCKS' && goalForm.asset_class !== 'ETF' && goalForm.asset_class !== 'GOLD_SILVER' && (
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Current Stored Value (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={goalForm.current_value}
                    onChange={(e) => setGoalForm({ ...goalForm, current_value: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              )}

              {/* Show metal gram weights for GOLD_SILVER */}
              {goalForm.asset_class === 'GOLD_SILVER' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Gold holdings (Grams)</label>
                    <input
                      type="number"
                      step="0.001"
                      placeholder="0.000"
                      value={goalForm.gold_grams}
                      onChange={(e) => setGoalForm({ ...goalForm, gold_grams: e.target.value })}
                      className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Silver holdings (Grams)</label>
                    <input
                      type="number"
                      step="0.001"
                      placeholder="0.000"
                      value={goalForm.silver_grams}
                      onChange={(e) => setGoalForm({ ...goalForm, silver_grams: e.target.value })}
                      className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Target Wealth Goal (₹)</label>
                <input
                  type="number"
                  required
                  placeholder="2500000"
                  value={goalForm.target_value}
                  onChange={(e) => setGoalForm({ ...goalForm, target_value: e.target.value })}
                  className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Update Goal Target
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
