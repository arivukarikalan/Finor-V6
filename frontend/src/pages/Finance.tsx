import React, { useState, useEffect, useMemo } from 'react';
import { 
  Landmark, ArrowDownRight, CheckCircle2, AlertCircle, Plus, Trash2, 
  Edit2, UserMinus, UserPlus, Users, X, Link2, Briefcase,
  Receipt, TrendingUp, BarChart3, Check, Search
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts';

interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  method: string;
  description: string;
  source: 'MANUAL' | 'GMAIL' | 'SMS';
  linked_tx_id?: string | null;
  is_claimable?: boolean;
  claim_status?: 'UNCLAIMED' | 'CLAIMED';
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

const CATEGORIES = [
  'Food', 
  'Food (Breakfast)', 
  'Food (Lunch)', 
  'Food (Dinner)', 
  'Food (Snacks)', 
  'Travel', 
  'Shopping', 
  'Investments', 
  'Bills/Utilities', 
  'Rent', 
  'Salary/Income', 
  'Debt Repayment', 
  'Lent/Friends', 
  'Payment Link',
  'Company Claimable',
  'Uncategorized'
];
const METHODS = ['UPI', 'Cash', 'Credit Card', 'Bank Transfer', 'Debit Card'];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#3b82f6', '#14b8a6'];

const fmt = (val: number) => `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Timezone-safe Date & Time parsing helper to prevent UTC day shifts
const formatTxDateTime = (dateStr: string) => {
  if (!dateStr) return { date: '-', time: '-' };

  // YYYY-MM-DD date string without time
  if (dateStr.length === 10 && dateStr.includes('-') && !dateStr.includes('T')) {
    const [year, month, day] = dateStr.split('-');
    const dObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return {
      date: dObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: '12:00 PM'
    };
  }

  const dObj = new Date(dateStr);
  if (isNaN(dObj.getTime())) return { date: dateStr, time: '' };

  return {
    date: dObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: dObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  };
};

const getCategoryIcon = (cat: string) => {
  const c = (cat || '').toLowerCase();
  if (c.includes('food')) return '🍔';
  if (c.includes('travel') || c.includes('petrol') || c.includes('uber')) return '🚗';
  if (c.includes('shopping')) return '🛍️';
  if (c.includes('investment') || c.includes('stocks')) return '📈';
  if (c.includes('bills') || c.includes('utility')) return '💡';
  if (c.includes('rent')) return '🏠';
  if (c.includes('salary') || c.includes('income')) return '💰';
  if (c.includes('lent') || c.includes('friends')) return '🤝';
  if (c.includes('company') || c.includes('claimable')) return '💼';
  return '💳';
};

export const Finance: React.FC = () => {
  const [subTab, setSubTab] = useState<'wealth' | 'expenses' | 'debts'>('wealth');
  
  // Dashboard states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeQuickMapTxId, setActiveQuickMapTxId] = useState<string | null>(null);
  const [popoverTab, setPopoverTab] = useState<'category' | 'link'>('category');

  const handleQuickMapCategory = async (tx: Transaction, newCat: string) => {
    setActiveQuickMapTxId(null);
    try {
      const payload = {
        id: tx.id,
        date: tx.date,
        amount: tx.amount,
        type: tx.type,
        category: newCat,
        method: tx.method,
        description: tx.description,
        source: tx.source,
        is_claimable: tx.is_claimable,
        claim_status: tx.claim_status
      };
      
      await apiRequest('/finance/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, category: newCat } : t));
    } catch (err: any) {
      console.error('Failed to quick map category:', err);
    }
  };

  const handleLinkTransaction = async (tx: Transaction, linkedId: string | null) => {
    setActiveQuickMapTxId(null);
    try {
      const payload = {
        id: tx.id,
        date: tx.date,
        amount: tx.amount,
        type: tx.type,
        category: tx.category,
        method: tx.method,
        description: tx.description,
        source: tx.source,
        linked_tx_id: linkedId,
        is_claimable: tx.is_claimable,
        claim_status: tx.claim_status
      };
      
      await apiRequest('/finance/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, linked_tx_id: linkedId } : t));
      
      // Reciprocal auto-linking back
      if (linkedId) {
        const target = transactions.find(t => t.id === linkedId);
        if (target && target.linked_tx_id !== tx.id) {
          const targetPayload = {
            id: target.id,
            date: target.date,
            amount: target.amount,
            type: target.type,
            category: target.category,
            method: target.method,
            description: target.description,
            source: target.source,
            linked_tx_id: tx.id,
            is_claimable: target.is_claimable,
            claim_status: target.claim_status
          };
          await apiRequest('/finance/transaction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(targetPayload)
          });
          setTransactions(prev => prev.map(t => t.id === target.id ? { ...t, linked_tx_id: tx.id } : t));
        }
      }
    } catch (err: any) {
      console.error('Failed to link transaction:', err);
    }
  };

  const handleToggleClaimStatus = async (tx: Transaction) => {
    const newStatus = tx.claim_status === 'CLAIMED' ? 'UNCLAIMED' : 'CLAIMED';
    setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, claim_status: newStatus, is_claimable: true } : t));
    try {
      await apiRequest(`/finance/transaction/${tx.id}/toggle-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_claimable: true, claim_status: newStatus })
      });
      triggerToast('success', newStatus === 'CLAIMED' ? 'Marked as claimed!' : 'Marked as unclaimed.');
    } catch (err: any) {
      console.error('Failed to toggle claim status:', err);
      triggerToast('error', 'Failed to update claim status.');
      fetchDashboardData(true);
    }
  };

  const getLinkCandidates = (currentTx: Transaction) => {
    return transactions
      .filter(t => t.id !== currentTx.id && Math.abs(new Date(t.date).getTime() - new Date(currentTx.date).getTime()) <= 15 * 24 * 60 * 60 * 1000)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const [autoValuations, setAutoValuations] = useState<AutoValuations>({
    equity: 0,
    etf: 0,
    goldPricePerGram: 0,
    silverPricePerGram: 0
  });

  // Filter states
  const [filterSearch, setFilterSearch] = useState(() => sessionStorage.getItem('finor_filter_search') || '');
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>(() => (sessionStorage.getItem('finor_filter_type') as any) || 'ALL');
  const [filterCategory, setFilterCategory] = useState(() => sessionStorage.getItem('finor_filter_category') || 'ALL');
  const [filterMethod, setFilterMethod] = useState(() => sessionStorage.getItem('finor_filter_method') || 'ALL');
  const [filterClaimable, setFilterClaimable] = useState<'ALL' | 'UNCLAIMED' | 'CLAIMED' | 'PERSONAL'>(() => (sessionStorage.getItem('finor_filter_claimable') as any) || 'ALL');
  const [filterStartDate, setFilterStartDate] = useState(() => sessionStorage.getItem('finor_filter_start_date') || '');
  const [filterEndDate, setFilterEndDate] = useState(() => sessionStorage.getItem('finor_filter_end_date') || '');

  useEffect(() => {
    sessionStorage.setItem('finor_filter_search', filterSearch);
    sessionStorage.setItem('finor_filter_type', filterType);
    sessionStorage.setItem('finor_filter_category', filterCategory);
    sessionStorage.setItem('finor_filter_method', filterMethod);
    sessionStorage.setItem('finor_filter_claimable', filterClaimable);
    sessionStorage.setItem('finor_filter_start_date', filterStartDate);
    sessionStorage.setItem('finor_filter_end_date', filterEndDate);
  }, [filterSearch, filterType, filterCategory, filterMethod, filterClaimable, filterStartDate, filterEndDate]);

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Selection & Bulk Actions
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [txIdToDelete, setTxIdToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBulkCategoryDropdown, setShowBulkCategoryDropdown] = useState(false);

  // Debt deletion confirm states
  const [showDebtDeleteConfirm, setShowDebtDeleteConfirm] = useState(false);
  const [debtIdToDelete, setDebtIdToDelete] = useState<string | null>(null);

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
    is_claimable: boolean;
    claim_status: 'UNCLAIMED' | 'CLAIMED';
  }>({
    date: new Date().toISOString().slice(0, 16),
    amount: '',
    type: 'EXPENSE',
    category: 'Food',
    method: 'UPI',
    description: '',
    is_claimable: false,
    claim_status: 'UNCLAIMED'
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

  // Reimbursable Company Claims Summary
  const unclaimedReimbursable = transactions
    .filter(t => t.is_claimable && (t.claim_status === 'UNCLAIMED' || !t.claim_status))
    .reduce((sum, t) => sum + t.amount, 0);

  const claimedReimbursable = transactions
    .filter(t => t.is_claimable && t.claim_status === 'CLAIMED')
    .reduce((sum, t) => sum + t.amount, 0);

  // Exclude Investments and Lent/Friends from standard consumption expenses
  const isConsumptionExpense = (t: Transaction) => {
    return t.type === 'EXPENSE' && 
           t.category !== 'Investments' && 
           t.category !== 'Lent/Friends';
  };

  // Robust current month check helper
  const isCurrentMonth = (dateStr: string) => {
    if (!dateStr) return false;
    const now = new Date();
    const dObj = new Date(dateStr);
    if (!isNaN(dObj.getTime())) {
      return dObj.getFullYear() === now.getFullYear() && dObj.getMonth() === now.getMonth();
    }
    const thisMonthStr = now.toISOString().substring(0, 7);
    return dateStr.startsWith(thisMonthStr);
  };

  // Monthly metrics
  const monthlyExpenses = transactions
    .filter(t => isConsumptionExpense(t) && isCurrentMonth(t.date))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const monthlyIncome = transactions
    .filter(t => t.type === 'INCOME' && isCurrentMonth(t.date))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Category wise breakdown (only consumption expenses)
  const categoryExpensesMap: { [key: string]: number } = {};
  transactions
    .filter(isConsumptionExpense)
    .forEach(t => {
      const cat = t.category || 'Uncategorized';
      categoryExpensesMap[cat] = (categoryExpensesMap[cat] || 0) + Number(t.amount || 0);
    });

  const categoryExpensesChartData = Object.keys(categoryExpensesMap).map(cat => ({
    name: cat,
    value: categoryExpensesMap[cat]
  })).sort((a, b) => b.value - a.value);

  // Daily Spending Trajectory Data for current month
  const dailySpendingsData = useMemo(() => {
    const daysMap: { [day: number]: number } = {};
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      daysMap[d] = 0;
    }

    transactions
      .filter(t => isConsumptionExpense(t) && isCurrentMonth(t.date))
      .forEach(t => {
        const dObj = new Date(t.date);
        const dayNum = !isNaN(dObj.getTime()) ? dObj.getDate() : parseInt((t.date || '').substring(8, 10), 10);
        if (!isNaN(dayNum) && daysMap[dayNum] !== undefined) {
          daysMap[dayNum] += Number(t.amount || 0);
        }
      });

    let runningTotal = 0;
    return Object.keys(daysMap).map(day => {
      const dayNum = parseInt(day, 10);
      const dailySpend = daysMap[dayNum];
      runningTotal += dailySpend;
      return {
        day: `Day ${dayNum}`,
        daily: dailySpend,
        cumulative: runningTotal
      };
    });
  }, [transactions]);

  // Filtered transactions for the ledger table & cards
  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = tx.description.toLowerCase().includes(filterSearch.toLowerCase()) || 
                          tx.category.toLowerCase().includes(filterSearch.toLowerCase());
    const matchesType = filterType === 'ALL' || tx.type === filterType;
    const matchesCategory = filterCategory === 'ALL' || tx.category === filterCategory;
    const matchesMethod = filterMethod === 'ALL' || tx.method === filterMethod;
    
    let matchesClaimable = true;
    if (filterClaimable === 'UNCLAIMED') {
      matchesClaimable = Boolean(tx.is_claimable) && (tx.claim_status === 'UNCLAIMED' || !tx.claim_status);
    } else if (filterClaimable === 'CLAIMED') {
      matchesClaimable = Boolean(tx.is_claimable) && tx.claim_status === 'CLAIMED';
    } else if (filterClaimable === 'PERSONAL') {
      matchesClaimable = !tx.is_claimable;
    }

    let matchesDate = true;
    if (filterStartDate) {
      const start = new Date(filterStartDate);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && new Date(tx.date) >= start;
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && new Date(tx.date) <= end;
    }
    
    return matchesSearch && matchesType && matchesCategory && matchesMethod && matchesClaimable && matchesDate;
  });

  // Transaction Actions
  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    const tempId = txForm.id || `temp_${Date.now()}`;
    const newTxObj: Transaction = {
      id: tempId,
      date: txForm.date ? new Date(txForm.date).toISOString() : new Date().toISOString(),
      amount: parseFloat(txForm.amount),
      type: txForm.type,
      category: txForm.category,
      method: txForm.method,
      description: txForm.description,
      source: 'MANUAL',
      is_claimable: txForm.is_claimable,
      claim_status: txForm.claim_status
    };

    const rollback = [...transactions];

    if (txForm.id) {
      setTransactions(prev => prev.map(t => t.id === txForm.id ? newTxObj : t));
    } else {
      setTransactions(prev => [newTxObj, ...prev]);
    }
    setShowTxModal(false);
    triggerToast('success', 'Transaction saved successfully.');

    try {
      await apiRequest('/finance/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txForm)
      });
      fetchDashboardData(true);
    } catch (err: any) {
      setTransactions(rollback);
      triggerToast('error', err.message || 'Failed to save transaction.');
    }
  };

  const confirmDeleteTx = (id: string) => {
    setTxIdToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleBulkMapCategory = async (newCat: string) => {
    if (selectedTxIds.length === 0) return;
    const rollback = [...transactions];
    try {
      setTransactions(prev => prev.map(t => selectedTxIds.includes(t.id) ? { ...t, category: newCat } : t));
      const ids = [...selectedTxIds];
      setSelectedTxIds([]);
      setShowBulkCategoryDropdown(false);
      triggerToast('success', `Mapped selected transactions to ${newCat}.`);

      await apiRequest('/finance/transaction/bulk-map-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, category: newCat })
      });
      fetchDashboardData(true);
    } catch (err: any) {
      setTransactions(rollback);
      triggerToast('error', err.message || 'Failed bulk mapping.');
    }
  };

  const confirmBulkDelete = () => {
    if (selectedTxIds.length === 0) return;
    setTxIdToDelete(null);
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    setDeleting(true);
    const isBulk = txIdToDelete === null;
    const rollback = [...transactions];

    try {
      if (isBulk) {
        setTransactions(prev => prev.filter(t => !selectedTxIds.includes(t.id)));
        setSelectedTxIds([]);
        triggerToast('success', 'Selected transactions deleted.');
        setShowDeleteConfirm(false);

        await apiRequest('/finance/transaction/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedTxIds })
        });
      } else if (txIdToDelete) {
        setTransactions(prev => prev.filter(t => t.id !== txIdToDelete));
        triggerToast('success', 'Transaction deleted.');
        setShowDeleteConfirm(false);

        await apiRequest(`/finance/transaction/${txIdToDelete}`, { method: 'DELETE' });
      }
      fetchDashboardData(true);
    } catch (err: any) {
      setTransactions(rollback);
      triggerToast('error', err.message || 'Delete operation failed.');
    } finally {
      setDeleting(false);
      setTxIdToDelete(null);
    }
  };

  // Debt Actions
  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/finance/debt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(debtForm)
      });
      setShowDebtModal(false);
      triggerToast('success', 'Debt record saved.');
      fetchDashboardData();
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to save debt record.');
    }
  };

  const handleRepayDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRepayModal) return;
    try {
      await apiRequest(`/finance/debt/${showRepayModal.id}/repay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(repayForm)
      });
      setShowRepayModal(null);
      triggerToast('success', 'Repayment recorded successfully.');
      fetchDashboardData();
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to record repayment.');
    }
  };

  const confirmDeleteDebt = (id: string) => {
    setDebtIdToDelete(id);
    setShowDebtDeleteConfirm(true);
  };

  const executeDeleteDebt = async () => {
    if (!debtIdToDelete) return;
    try {
      await apiRequest(`/finance/debt/${debtIdToDelete}`, { method: 'DELETE' });
      setShowDebtDeleteConfirm(false);
      triggerToast('success', 'Debt record deleted.');
      fetchDashboardData();
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to delete debt record.');
    } finally {
      setDebtIdToDelete(null);
    }
  };

  // Goal Actions
  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showGoalModal) return;
    try {
      await apiRequest('/finance/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: showGoalModal.id,
          asset_class: goalForm.asset_class,
          current_value: parseFloat(goalForm.current_value || '0'),
          target_value: parseFloat(goalForm.target_value || '0'),
          gold_grams: parseFloat(goalForm.gold_grams || '0'),
          silver_grams: parseFloat(goalForm.silver_grams || '0')
        })
      });
      setShowGoalModal(null);
      triggerToast('success', 'Wealth goal target updated.');
      fetchDashboardData();
    } catch (err: any) {
      triggerToast('error', err.message || 'Failed to update goal.');
    }
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-10 h-10 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
        <span className="text-xs text-gray-400 font-semibold tracking-wider uppercase select-none">Loading Expense Analytics...</span>
      </div>
    );
  }

  const chartData = Object.keys(assetValues).map(key => ({
    name: key.replace('_', ' '),
    value: assetValues[key as keyof typeof assetValues]
  })).filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      
      {/* Top Banner Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white">Finance Hub</h1>
          <p className="text-xs text-gray-400 mt-1">Complete control over your expenses, company reimbursements, wealth goals, and debt ledgers.</p>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Estimated Net Worth</span>
          <span className="text-xl font-black text-white mt-1 block">{fmt(netWorth)}</span>
          <span className="text-[9px] text-emerald-400 mt-1 block truncate">Assets: {fmt(totalAssets)} | Liab: {fmt(netBorrowedDebts)}</span>
          <Landmark className="absolute top-4 right-4 w-5 h-5 text-brand-500/20" />
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Month Burn Rate ({new Date().toLocaleString('default', { month: 'short' })})</span>
          <span className="text-xl font-black text-rose-500 mt-1 block">{fmt(monthlyExpenses)}</span>
          <span className="text-[9px] text-gray-400 mt-1 block">Income: {fmt(monthlyIncome)}</span>
          <ArrowDownRight className="absolute top-4 right-4 w-5 h-5 text-rose-500/20" />
        </div>

        {/* Reimbursable Claims KPI Card */}
        <div 
          onClick={() => { setSubTab('expenses'); setFilterClaimable('UNCLAIMED'); }}
          className="glass-panel glass-panel-hover rounded-2xl p-4 border border-indigo-500/30 relative overflow-hidden cursor-pointer group"
          title="Click to view pending reimbursable claims"
        >
          <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-wider flex items-center gap-1 block">
            <Briefcase className="w-3 h-3 text-indigo-400" />
            Company Claimable
          </span>
          <span className="text-xl font-black text-indigo-400 mt-1 block">{fmt(unclaimedReimbursable)}</span>
          <span className="text-[9px] text-gray-400 mt-1 block">Pending Unclaimed | Claimed: {fmt(claimedReimbursable)}</span>
          <Receipt className="absolute top-4 right-4 w-5 h-5 text-indigo-500/20 group-hover:text-indigo-400 transition-colors" />
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Total Lent to Friends</span>
          <span className="text-xl font-black text-emerald-400 mt-1 block">{fmt(netLentDebts)}</span>
          <span className="text-[9px] text-gray-400 mt-1 block">Receivable Asset value</span>
          <UserPlus className="absolute top-4 right-4 w-5 h-5 text-emerald-500/20" />
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Total Borrowed</span>
          <span className="text-xl font-black text-amber-500 mt-1 block">{fmt(netBorrowedDebts)}</span>
          <span className="text-[9px] text-gray-400 mt-1 block">Payable Liability value</span>
          <UserMinus className="absolute top-4 right-4 w-5 h-5 text-amber-500/20" />
        </div>
      </div>

      {/* Subtab Bar */}
      <div className="flex border-b border-dark-border/60 overflow-x-auto whitespace-nowrap scrollbar-none max-w-full">
        <button
          onClick={() => setSubTab('wealth')}
          className={`px-4 md:px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 cursor-pointer transition-all shrink-0 ${
            subTab === 'wealth' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <span className="hidden md:inline">Wealth & Goals</span>
          <span className="md:hidden">Wealth</span>
        </button>
        <button
          onClick={() => setSubTab('expenses')}
          className={`px-4 md:px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 cursor-pointer transition-all shrink-0 flex items-center gap-1.5 ${
            subTab === 'expenses' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Expense Analysis & Sync</span>
          <span className="md:hidden">Expense Analytics</span>
        </button>
        <button
          onClick={() => setSubTab('debts')}
          className={`px-4 md:px-5 py-3 text-xs font-extrabold uppercase tracking-wider border-b-2 cursor-pointer transition-all shrink-0 ${
            subTab === 'debts' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <span className="hidden md:inline">Debt Ledger</span>
          <span className="md:hidden">Debts</span>
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
                const goal = goals.find(g => g.asset_class === item.class);
                const currentVal = goal ? getGoalValue(goal) : assetValues[item.class as keyof typeof assetValues];
                const targetVal = goal?.target_value || 0;
                const pct = targetVal > 0 ? Math.min(100, Math.round((currentVal / targetVal) * 100)) : 0;

                return (
                  <div key={item.class} className="bg-dark-depth-2/40 border border-dark-border/40 p-4 rounded-2xl space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white">{item.label}</h4>
                        <p className="text-[9px] text-gray-500 mt-0.5">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => {
                          setShowGoalModal(goal || { id: '', asset_class: item.class as any, current_value: currentVal, target_value: targetVal, gold_grams: 0, silver_grams: 0 });
                          setGoalForm({
                            asset_class: item.class,
                            current_value: currentVal.toString(),
                            target_value: targetVal.toString(),
                            gold_grams: goal?.gold_grams?.toString() || '0',
                            silver_grams: goal?.silver_grams?.toString() || '0'
                          });
                        }}
                        className="text-[9px] font-extrabold text-brand-400 hover:text-brand-300 bg-brand-500/10 px-2 py-1 rounded-lg border border-brand-500/20 cursor-pointer"
                      >
                        Edit Target
                      </button>
                    </div>

                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-black text-white">{fmt(currentVal)}</span>
                      <span className="text-[10px] text-gray-400 font-semibold">Target: {fmt(targetVal)}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="w-full bg-dark-depth-2 h-2 rounded-full overflow-hidden">
                        <div className="bg-brand-500 h-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                        <span>{pct}% achieved</span>
                        <span>{targetVal > currentVal ? `Needed: ${fmt(targetVal - currentVal)}` : 'Target Met 🎉'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ─── TAB 2: EXPENSE ANALYSIS & TRANSACTIONS ─── */}
      {subTab === 'expenses' && (
        <div className="space-y-6">
          
          {/* Analytics Visual Dashboard Header Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Monthly Trajectory Outlook Area Chart */}
            <div className="lg:col-span-2 glass-panel rounded-3xl p-6 border border-dark-border flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand-400" />
                    Monthly Spending Outlook & Cumulative Trajectory
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Daily burn rate accumulation across current month ({new Date().toLocaleString('default', { month: 'long', year: 'numeric' })})</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-bold text-gray-400 uppercase block">Total Month Spend</span>
                  <span className="text-sm font-black text-rose-400">{fmt(monthlyExpenses)}</span>
                </div>
              </div>

              <div className="h-[210px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailySpendingsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 9 }} interval={4} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={(val) => `₹${val}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f141f', borderColor: '#1e293b', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                      formatter={(val: any) => fmt(Number(val))}
                    />
                    <Area type="monotone" dataKey="cumulative" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#spendGradient)" name="Cumulative Spend" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Allocation Donut Chart */}
            <div className="glass-panel rounded-3xl p-6 border border-dark-border flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  Category Breakdown
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">Distribution across spending categories</p>
              </div>

              {categoryExpensesChartData.length > 0 ? (
                <div className="h-[170px] my-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryExpensesChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {categoryExpensesChartData.map((_, idx) => (
                          <Cell key={`cat-${idx}`} fill={COLORS[idx % COLORS.length]} />
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
                <div className="h-[170px] flex items-center justify-center text-xs text-gray-500">
                  No expense records available.
                </div>
              )}

              {/* Category Top List */}
              <div className="space-y-1 max-h-[90px] overflow-y-auto pr-1 text-[10px]">
                {categoryExpensesChartData.slice(0, 4).map((c, idx) => (
                  <div key={c.name} className="flex items-center justify-between font-bold">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-gray-300 truncate">{c.name}</span>
                    </div>
                    <span className="text-white shrink-0">{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Ledger Control & Filter Toolbar */}
          <div className="glass-panel rounded-3xl border border-dark-border overflow-hidden">
            
            {/* Header & Add Button */}
            <div className="p-6 border-b border-dark-border/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-extrabold text-white">Expense & Transaction Ledger</h3>
                <p className="text-xs text-gray-400 mt-0.5">Filter, search, and manage your manual and synced transaction logs.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setTxForm({
                      date: new Date().toISOString().slice(0, 16),
                      amount: '',
                      type: 'EXPENSE',
                      category: 'Food',
                      method: 'UPI',
                      description: '',
                      is_claimable: false,
                      claim_status: 'UNCLAIMED'
                    });
                    setShowTxModal(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-brand-900/20"
                >
                  <Plus className="w-4 h-4" />
                  + Add Transaction
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="p-4 bg-dark-depth-2/30 border-b border-dark-border/40 space-y-3">
              
              {/* Row 1: Search & Filter Pills */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by description or category..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                  {filterSearch && (
                    <button onClick={() => setFilterSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs">×</button>
                  )}
                </div>

                {/* Type Filter */}
                <div className="flex bg-dark-depth-2 border border-dark-border p-1 rounded-xl gap-1">
                  {(['ALL', 'EXPENSE', 'INCOME'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        filterType === t ? 'bg-brand-500 text-white shadow' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* Company Claimable Filter Pills */}
                <div className="flex bg-dark-depth-2 border border-dark-border p-1 rounded-xl gap-1 overflow-x-auto">
                  {[
                    { id: 'ALL', label: 'All Expenses' },
                    { id: 'UNCLAIMED', label: '💼 Unclaimed' },
                    { id: 'CLAIMED', label: '✅ Claimed' },
                    { id: 'PERSONAL', label: 'Personal' }
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => setFilterClaimable(p.id as any)}
                      className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                        filterClaimable === p.id ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Category & Method Selectors */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
                  >
                    <option value="ALL">All Categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <select
                    value={filterMethod}
                    onChange={(e) => setFilterMethod(e.target.value)}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
                  >
                    <option value="ALL">All Methods</option>
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
                    style={{ colorScheme: 'dark' }}
                    placeholder="Start date"
                  />
                </div>

                <div>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
                    style={{ colorScheme: 'dark' }}
                    placeholder="End date"
                  />
                </div>
              </div>

            </div>

            {/* Bulk Action Toolbar */}
            {selectedTxIds.length > 0 && (
              <div className="px-5 py-3 bg-rose-500/10 border-b border-dark-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in slide-in-from-top duration-200">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider">{selectedTxIds.length} transactions selected</span>
                </div>
                <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end">
                  <button
                    onClick={() => setSelectedTxIds([])}
                    className="px-3 py-1.5 text-[10px] font-extrabold text-gray-400 hover:text-white uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowBulkCategoryDropdown(true)}
                    className="px-3.5 py-1.5 text-[10px] font-extrabold rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 text-gray-300 hover:text-white border border-dark-border/40 uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    Map Category
                  </button>
                  <button
                    onClick={confirmBulkDelete}
                    className="px-3.5 py-1.5 text-[10px] font-extrabold rounded-xl bg-rose-600 hover:bg-rose-700 text-white uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-rose-900/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Selected
                  </button>
                </div>
              </div>
            )}
            
            {/* Desktop View Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-dark-border bg-dark-depth-2/30">
                    <th className="p-4 w-10">
                      <input 
                        type="checkbox"
                        checked={filteredTransactions.length > 0 && selectedTxIds.length === filteredTransactions.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTxIds(filteredTransactions.map(tx => tx.id));
                          } else {
                            setSelectedTxIds([]);
                          }
                        }}
                        className="rounded border-dark-border bg-dark-depth-2 focus:ring-brand-500/80 cursor-pointer accent-brand-500"
                      />
                    </th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Date & Time</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Category</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Method</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Claimable</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Description</th>
                    <th className="p-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border/40 text-xs">
                  {filteredTransactions.length > 0 ? (
                    <>
                      {filteredTransactions.map((tx) => {
                        const dt = formatTxDateTime(tx.date);

                        return (
                          <tr key={tx.id} className={`hover:bg-dark-depth-2/20 transition-colors ${selectedTxIds.includes(tx.id) ? 'bg-brand-500/5' : ''}`}>
                            <td className="p-4 w-10">
                              <input 
                                type="checkbox"
                                checked={selectedTxIds.includes(tx.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTxIds(prev => [...prev, tx.id]);
                                  } else {
                                    setSelectedTxIds(prev => prev.filter(id => id !== tx.id));
                                  }
                                }}
                                className="rounded border-dark-border bg-dark-depth-2 focus:ring-brand-500/80 cursor-pointer accent-brand-500"
                              />
                            </td>
                            <td className="p-4 font-medium text-gray-300">
                              <div>
                                <span className="font-bold text-white">{dt.date}</span>
                                {dt.time && (
                                  <span className="text-[9px] text-gray-500 block mt-0.5 font-mono">
                                    ⏰ {dt.time}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={`p-4 font-black text-sm ${tx.type === 'INCOME' ? 'text-emerald-400' : 'text-white'}`}>
                              {tx.type === 'INCOME' ? '+' : '-'} {fmt(tx.amount)}
                            </td>
                            <td className="p-4 relative">
                              <div className="flex items-center gap-1.5">
                                <span className="bg-dark-depth-2 px-2.5 py-1 rounded-xl border border-dark-border/60 font-bold text-[10px] text-gray-200 flex items-center gap-1">
                                  <span>{getCategoryIcon(tx.category)}</span>
                                  {tx.category}
                                </span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPopoverTab('category');
                                    setActiveQuickMapTxId(tx.id);
                                  }}
                                  className="text-gray-500 hover:text-brand-400 transition-colors p-0.5 rounded hover:bg-dark-depth-2 cursor-pointer"
                                  title="Quick Link/Map Category"
                                >
                                  <Link2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                            <td className="p-4 text-gray-400 font-semibold">
                              <span className="bg-dark-depth-2/40 px-2 py-0.5 rounded-lg border border-dark-border/20 text-[9px]">
                                {tx.method}
                              </span>
                            </td>

                            {/* Reimbursable Claim Status Badge & Toggle Button */}
                            <td className="p-4">
                              {tx.is_claimable ? (
                                <button
                                  onClick={() => handleToggleClaimStatus(tx)}
                                  className={`px-2.5 py-1 rounded-xl text-[9px] font-extrabold tracking-wider border cursor-pointer transition-all flex items-center gap-1 ${
                                    tx.claim_status === 'CLAIMED'
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                      : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                                  }`}
                                  title="Click to toggle Claim status"
                                >
                                  {tx.claim_status === 'CLAIMED' ? <Check className="w-3 h-3 text-emerald-400" /> : <Briefcase className="w-3 h-3 text-amber-400" />}
                                  {tx.claim_status === 'CLAIMED' ? 'CLAIMED' : 'UNCLAIMED'}
                                </button>
                              ) : (
                                <span className="text-[9px] text-gray-600 font-semibold">—</span>
                              )}
                            </td>

                            <td className="p-4 text-gray-300 truncate max-w-xs" title={tx.description}>
                              <div>
                                <span className="font-medium">{tx.description || '-'}</span>
                                {tx.linked_tx_id && (() => {
                                  const linked = transactions.find(t => t.id === tx.linked_tx_id);
                                  if (linked) {
                                    return (
                                      <div className="mt-1 flex items-center gap-1">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg border ${
                                          tx.type === 'EXPENSE' 
                                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                        }`}>
                                          🔗 {tx.type === 'EXPENSE' ? 'Recouped' : 'Part of'}: {linked.description} ({linked.type === 'INCOME' ? '+' : '-'}₹{linked.amount})
                                        </span>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setTxForm({
                                      id: tx.id,
                                      date: tx.date.includes('T') ? tx.date.slice(0, 16) : `${tx.date}T12:00`,
                                      amount: tx.amount.toString(),
                                      type: tx.type,
                                      category: tx.category,
                                      method: tx.method,
                                      description: tx.description,
                                      is_claimable: Boolean(tx.is_claimable),
                                      claim_status: tx.claim_status || 'UNCLAIMED'
                                    });
                                    setShowTxModal(true);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-dark-depth-2 text-gray-400 hover:text-white transition-all cursor-pointer border border-transparent hover:border-dark-border"
                                  title="Edit Transaction"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => confirmDeleteTx(tx.id)}
                                  className="p-1.5 rounded-lg hover:bg-rose-500/10 text-gray-400 hover:text-rose-500 transition-all cursor-pointer border border-transparent hover:border-rose-500/20"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                    </>
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-500">
                        No matching transactions found for selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile View List Cards */}
            <div className="md:hidden divide-y divide-dark-border/40 text-xs">
              {filteredTransactions.length > 0 ? (
                <>
                  {filteredTransactions.map((tx) => {
                    const dt = formatTxDateTime(tx.date);

                    return (
                      <div key={tx.id} className={`p-4 space-y-3 hover:bg-dark-depth-2/20 transition-all ${selectedTxIds.includes(tx.id) ? 'bg-brand-500/5' : ''}`}>
                        {/* Header: Date/Time + Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                            <input 
                              type="checkbox"
                              checked={selectedTxIds.includes(tx.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTxIds(prev => [...prev, tx.id]);
                                } else {
                                  setSelectedTxIds(prev => prev.filter(id => id !== tx.id));
                                }
                              }}
                              className="rounded border-dark-border bg-dark-depth-2 focus:ring-brand-500/80 cursor-pointer accent-brand-500 w-3.5 h-3.5"
                            />
                            <span>
                              <strong className="text-white">{dt.date}</strong>
                              {dt.time && <span className="text-gray-500 ml-1.5 font-mono">⏰ {dt.time}</span>}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setTxForm({
                                  id: tx.id,
                                  date: tx.date.includes('T') ? tx.date.slice(0, 16) : `${tx.date}T12:00`,
                                  amount: tx.amount.toString(),
                                  type: tx.type,
                                  category: tx.category,
                                  method: tx.method,
                                  description: tx.description,
                                  is_claimable: Boolean(tx.is_claimable),
                                  claim_status: tx.claim_status || 'UNCLAIMED'
                                });
                                setShowTxModal(true);
                              }}
                              className="p-1.5 rounded-lg bg-dark-depth-2 border border-dark-border/60 text-gray-400 hover:text-white transition-all cursor-pointer"
                              title="Edit"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => confirmDeleteTx(tx.id)}
                              className="p-1.5 rounded-lg bg-dark-depth-2 border border-dark-border/60 text-gray-400 hover:text-rose-500 transition-all cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Middle: Description & Amount */}
                        <div className="flex items-start justify-between gap-3 pt-0.5">
                          <div className="font-semibold text-gray-200 line-clamp-2 max-w-[70%]">
                            <div>{tx.description || 'No description'}</div>
                          </div>
                          <div className={`font-black text-sm shrink-0 ${tx.type === 'INCOME' ? 'text-emerald-400' : 'text-white'}`}>
                            {tx.type === 'INCOME' ? '+' : '-'} {fmt(tx.amount)}
                          </div>
                        </div>

                        {/* Footer Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="bg-dark-depth-2 px-2 py-0.5 rounded-lg border border-dark-border/60 font-bold text-[9px] text-gray-200 flex items-center gap-1">
                            <span>{getCategoryIcon(tx.category)}</span>
                            {tx.category}
                          </span>

                          <span className="bg-dark-depth-2/40 px-2 py-0.5 rounded-lg border border-dark-border/20 text-[9px] text-gray-400">
                            {tx.method}
                          </span>

                          {tx.is_claimable && (
                            <button
                              onClick={() => handleToggleClaimStatus(tx)}
                              className={`px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase border ${
                                tx.claim_status === 'CLAIMED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}
                            >
                              {tx.claim_status === 'CLAIMED' ? '✅ CLAIMED' : '💼 UNCLAIMED'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No matching transactions found.
                </div>
              )}
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
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0"
            >
              + Create Debt Record
            </button>
          </div>

          {/* Debt Entries Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {debts.length > 0 ? (
              debts.map(d => (
                <div key={d.id} className="glass-panel rounded-2xl p-5 border border-dark-border space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-white">{d.person_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                          d.type === 'LENT' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        }`}>
                          {d.type === 'LENT' ? 'LENT (Receivable)' : 'BORROWED (Liability)'}
                        </span>
                      </div>
                      <span className="text-[9px] text-gray-400 block mt-1">
                        Recorded: {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    <span className={`text-xs font-black px-2 py-1 rounded-lg border ${
                      d.status === 'SETTLED' ? 'bg-slate-700/20 text-gray-400 border-slate-700/40' : 'bg-brand-500/10 text-brand-400 border-brand-500/20'
                    }`}>
                      {d.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-dark-depth-2/40 p-3 rounded-xl text-xs font-semibold">
                    <div>
                      <span className="text-[9px] text-gray-500 block uppercase">Original Amount</span>
                      <span className="text-white font-bold">{fmt(d.amount)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 block uppercase">Remaining Due</span>
                      <span className={`font-black ${d.remaining_amount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {fmt(d.remaining_amount)}
                      </span>
                    </div>
                  </div>

                  {d.notes && (
                    <p className="text-[10px] text-gray-400 leading-relaxed font-mono bg-dark-depth-2/20 p-2.5 rounded-xl border border-dark-border/20 whitespace-pre-wrap">
                      {d.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-dark-border/40">
                    <button
                      onClick={() => confirmDeleteDebt(d.id)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Delete Debt"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {d.status === 'ACTIVE' && (
                      <button
                        onClick={() => {
                          setShowRepayModal(d);
                          setRepayForm({
                            amount: d.remaining_amount.toString(),
                            date: new Date().toISOString().split('T')[0],
                            method: 'UPI',
                            description: `Repayment for ${d.person_name}`
                          });
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        Record Repayment
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-2 glass-panel rounded-3xl p-12 text-center text-gray-500">
                No active debt records on ledger. Click "+ Create Debt Record" to start tracking.
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
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">{txForm.id ? 'Edit Transaction' : 'Record Transaction'}</h3>
              <button onClick={() => setShowTxModal(false)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleSaveTx} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={txForm.date}
                    onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    style={{ colorScheme: 'dark' }}
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

              {/* Company Reimbursable Toggle */}
              <div className="bg-dark-depth-2/60 border border-dark-border/60 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
                    Company Reimbursable
                  </span>
                  <span className="text-[9px] text-gray-400 block mt-0.5">Flag as expense claimable from employer</span>
                </div>

                <input
                  type="checkbox"
                  checked={txForm.is_claimable}
                  onChange={(e) => setTxForm({ ...txForm, is_claimable: e.target.checked })}
                  className="w-4 h-4 rounded border-dark-border bg-dark-depth-2 text-indigo-500 focus:ring-indigo-500/80 cursor-pointer accent-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Description / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Client lunch, taxi fare, rent payment"
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
                    style={{ colorScheme: 'dark' }}
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

      {/* ─── MODAL 3: REPAY DEBT ─── */}
      {showRepayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-depth-1 border border-dark-border w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-dark-border/60 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Record Repayment for {showRepayModal.person_name}</h3>
              <button onClick={() => setShowRepayModal(null)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleRepayDebt} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Repayment Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    max={showRepayModal.remaining_amount}
                    value={repayForm.amount}
                    onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <span className="text-[9px] text-gray-500 mt-1 block">Max due: {fmt(showRepayModal.remaining_amount)}</span>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={repayForm.date}
                    onChange={(e) => setRepayForm({ ...repayForm, date: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    style={{ colorScheme: 'dark' }}
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
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Notes / Description</label>
                <input
                  type="text"
                  placeholder="e.g. GPay repayment"
                  value={repayForm.description}
                  onChange={(e) => setRepayForm({ ...repayForm, description: e.target.value })}
                  className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Submit Repayment
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
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Update Target: {showGoalModal.asset_class.replace('_', ' ')}</h3>
              <button onClick={() => setShowGoalModal(null)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            
            <form onSubmit={handleSaveGoal} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Target Wealth Goal (₹)</label>
                <input
                  type="number"
                  required
                  placeholder="500000"
                  value={goalForm.target_value}
                  onChange={(e) => setGoalForm({ ...goalForm, target_value: e.target.value })}
                  className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              {showGoalModal.asset_class !== 'EQUITY_STOCKS' && showGoalModal.asset_class !== 'ETF' && (
                <div>
                  <label className="text-[10px] text-gray-400 font-extrabold uppercase block mb-1">Current Manual Asset Value (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="100000"
                    value={goalForm.current_value}
                    onChange={(e) => setGoalForm({ ...goalForm, current_value: e.target.value })}
                    className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Save Goal Settings
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: DELETE TRANSACTION CONFIRM ─── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-depth-1 border border-dark-border w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/20">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Confirm Deletion</h3>
              <p className="text-xs text-gray-400 mt-1">
                {txIdToDelete ? 'Are you sure you want to delete this transaction?' : `Are you sure you want to delete ${selectedTxIds.length} selected transactions?`}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-dark-border text-xs font-bold text-gray-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer shadow-lg shadow-rose-900/20 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 6: DELETE DEBT CONFIRM ─── */}
      {showDebtDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-depth-1 border border-dark-border w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/20">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Delete Debt Record</h3>
              <p className="text-xs text-gray-400 mt-1">Are you sure you want to delete this debt ledger entry?</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDebtDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-dark-border text-xs font-bold text-gray-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteDebt}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer shadow-lg shadow-rose-900/20"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 7: BULK CATEGORY MAP ─── */}
      {showBulkCategoryDropdown && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-dark-depth-1 border border-dark-border w-full max-w-sm rounded-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-dark-border pb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Map Category ({selectedTxIds.length} selected)</h3>
              <button onClick={() => setShowBulkCategoryDropdown(false)} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[250px] overflow-y-auto pr-1 text-xs">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => handleBulkMapCategory(c)}
                  className="p-2 bg-dark-depth-2 hover:bg-brand-500/20 text-gray-300 hover:text-white rounded-xl border border-dark-border/40 text-left font-semibold cursor-pointer truncate"
                >
                  {getCategoryIcon(c)} {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 8: QUICK MAP & LINK TRANSACTION ─── */}
      {activeQuickMapTxId && (() => {
        const tx = transactions.find(t => t.id === activeQuickMapTxId);
        if (!tx) return null;
        const candidates = getLinkCandidates(tx);

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveQuickMapTxId(null)}>
            <div className="bg-dark-depth-1 border border-dark-border w-full max-w-md rounded-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-dark-border pb-3">
                <div className="flex bg-dark-depth-2 p-1 rounded-xl gap-1">
                  <button onClick={() => setPopoverTab('category')} className={`px-3 py-1 text-[10px] font-bold rounded-lg ${popoverTab === 'category' ? 'bg-brand-500 text-white' : 'text-gray-400'}`}>Map Category</button>
                  <button onClick={() => setPopoverTab('link')} className={`px-3 py-1 text-[10px] font-bold rounded-lg ${popoverTab === 'link' ? 'bg-brand-500 text-white' : 'text-gray-400'}`}>Link Transaction</button>
                </div>
                <button onClick={() => setActiveQuickMapTxId(null)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>

              {popoverTab === 'category' ? (
                <div className="grid grid-cols-2 gap-2 max-h-[250px] overflow-y-auto pr-1 text-xs">
                  {CATEGORIES.map(c => (
                    <button
                      key={c}
                      onClick={() => handleQuickMapCategory(tx, c)}
                      className={`p-2 rounded-xl border text-left font-semibold cursor-pointer truncate ${tx.category === c ? 'bg-brand-500 text-white border-brand-500' : 'bg-dark-depth-2 border-dark-border/40 text-gray-300 hover:text-white'}`}
                    >
                      {getCategoryIcon(c)} {c}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 text-xs">
                  {tx.linked_tx_id && (
                    <button onClick={() => handleLinkTransaction(tx, null)} className="w-full p-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl text-left font-bold">Unlink Current Transaction</button>
                  )}
                  {candidates.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleLinkTransaction(tx, c.id)}
                      className={`w-full p-2.5 rounded-xl border text-left flex justify-between items-center ${tx.linked_tx_id === c.id ? 'bg-brand-500/20 border-brand-500 text-white' : 'bg-dark-depth-2 border-dark-border/40 text-gray-300 hover:text-white'}`}
                    >
                      <span className="truncate max-w-[200px]">{c.description || c.category}</span>
                      <span className={`font-bold ${c.type === 'INCOME' ? 'text-emerald-400' : 'text-rose-400'}`}>{c.type === 'INCOME' ? '+' : '-'}₹{c.amount}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
};
