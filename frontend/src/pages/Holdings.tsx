import { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../services/api';
import { useToastStore } from '../context/toastStore';
import { LtpPriceText } from '../components/LtpPriceText';
import { CustomAlertModal } from '../components/CustomAlertModal';
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Upload, 
  Search, 
  SlidersHorizontal, 
  AlertCircle, 
  Trash2,
  X,
  FileSpreadsheet,
  CheckCircle2,
  Sparkles,
  PlusCircle,
  Calculator,
  AlertTriangle,
  ArrowLeft,
  PieChart,
  History,
  Loader2,
  Calendar
} from 'lucide-react';

interface Holding {
  id: string;
  stock_symbol: string;
  stock_name: string;
  average_buy_price: number;
  quantity: number;
  ltp: number | null;
  sector: string | null;
  last_updated: string;
}

interface Trade {
  id: string;
  stock_symbol: string;
  trade_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  trade_date: string;
}

export const Holdings = () => {
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('finor_cached_holdings') || '[]');
    } catch {
      return [];
    }
  });
  const [trades, setTrades] = useState<Trade[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('finor_cached_trades') || '[]');
    } catch {
      return [];
    }
  });
  const [stockSettings, setStockSettings] = useState<Record<string, { stoploss_price: number | null, position_tag: 'TRADING' | 'CORE_HOLD' }>>(() => {
    try {
      return JSON.parse(localStorage.getItem('finor_cached_stock_settings') || '{}');
    } catch {
      return {};
    }
  });
  const [considerExits, setConsiderExits] = useState<{ symbol: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(() => {
    return !localStorage.getItem('finor_cached_holdings');
  });
  const [syncing, setSyncing] = useState(false);
  const [forceRebuilding, setForceRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Stock Settings State
  const [editingStock, setEditingStock] = useState<Holding | null>(null);
  const [editStoploss, setEditStoploss] = useState<string>('');
  const [editTag, setEditTag] = useState<'TRADING' | 'CORE_HOLD'>('TRADING');
  const [savingSettings, setSavingSettings] = useState(false);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [performanceFilter, setPerformanceFilter] = useState<'all' | 'profit' | 'loss'>('all');
  const [sortBy, setSortBy] = useState<'value' | 'return' | 'pl' | 'symbol'>('value');
  
  // CSV Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // AI Sentiment Gauge State
  const [selectedAiStock, setSelectedAiStock] = useState<any | null>(null);
  const [csvPreview, setCsvPreview] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ message: string; count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeSubTab, setActiveSubTab] = useState<'holdings' | 'simulator'>('holdings');

  // Stock Deep Dive Analyzer State
  const [activeDetailSymbol, setActiveDetailSymbol] = useState<string | null>(null);
  const [sentimentData, setSentimentData] = useState<any | null>(null);
  const [loadingSentiment, setLoadingSentiment] = useState(false);
  const [detailViewMerged, setDetailViewMerged] = useState(true);
  const sentimentCache = useRef<Record<string, any>>({});
  const activeDetailSymbolRef = useRef<string>('');

  // What-If Simulator State
  const [simStock, setSimStock] = useState('');
  const [simType, setSimType] = useState<'BUY' | 'SELL'>('BUY');
  const [simQty, setSimQty] = useState('');
  const [simPrice, setSimPrice] = useState('');
  const [simPlannedTrades, setSimPlannedTrades] = useState<Array<{ id: string; type: 'BUY' | 'SELL'; quantity: number; price: number }>>([]);

  // Quick Add Trade Modal State
  const [isAddTradeOpen, setIsAddTradeOpen] = useState(false);
  const [addTradeSymbol, setAddTradeSymbol] = useState('');
  const [addTradeType, setAddTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [addTradeQty, setAddTradeQty] = useState('');
  const [addTradePrice, setAddTradePrice] = useState('');
  const [addTradeDate, setAddTradeDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [addTradeLoading, setAddTradeLoading] = useState(false);
  const [addTradeResult, setAddTradeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showAddTradeSuggestions, setShowAddTradeSuggestions] = useState(false);

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

  const fetchCoreData = async () => {
    const hasCache = localStorage.getItem('finor_cached_holdings');
    if (!hasCache) {
      setLoading(true);
    }
    setError(null);
    try {
      const holdingsData = await apiRequest('/holdings');
      setHoldings(holdingsData);
      localStorage.setItem('finor_cached_holdings', JSON.stringify(holdingsData));
      
      const tradesData = await apiRequest('/trades');
      setTrades(tradesData);
      localStorage.setItem('finor_cached_trades', JSON.stringify(tradesData));

      // Fetch settings
      const settingsData = await apiRequest('/holdings/settings');
      setStockSettings(settingsData || {});
      localStorage.setItem('finor_cached_stock_settings', JSON.stringify(settingsData || {}));

      // Fetch consider exits from insights
      if (holdingsData.length > 0) {
        const insights = await apiRequest('/analytics/insights?viewMode=ALL_TIME');
        setConsiderExits(insights.considerExits || []);
      } else {
        setConsiderExits([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch core data.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenStockDetails = async (symbol: string) => {
    activeDetailSymbolRef.current = symbol;
    setActiveDetailSymbol(symbol);
    
    // Check local in-memory cache first
    const cached = sentimentCache.current[symbol];
    if (cached) {
      setSentimentData(cached);
      setLoadingSentiment(false); // No full page loading screen if we have cached data!
    } else {
      setSentimentData(null);
      setLoadingSentiment(true);
    }

    try {
      const res = await apiRequest('/holdings/sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      
      // Save response to cache
      sentimentCache.current[symbol] = res;

      // Only update state if this is still the active detail symbol
      if (activeDetailSymbolRef.current === symbol) {
        setSentimentData(res);
      }
    } catch (err: any) {
      console.error('Failed to load sentiment details:', err);
    } finally {
      if (activeDetailSymbolRef.current === symbol) {
        setLoadingSentiment(false);
      }
    }
  };

  const getStockStats = (symbol: string) => {
    // Sort ascending for calculations
    const stockTrades = trades
      .filter(t => t.stock_symbol.toUpperCase() === symbol.toUpperCase())
      .sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
    
    let totalBuyQty = 0;
    let totalSellQty = 0;
    let totalBuyCost = 0;
    let totalSellVal = 0;

    // FIFO Calculator
    const buys: { quantity: number; price: number; trade_date: string }[] = [];
    let allTimeRealizedPnL = 0;
    
    // Group monthly stats (realized P&L matched to the month of the SELL trade)
    const monthlyData: Record<string, { pnl: number; count: number; buyQty: number; sellQty: number }> = {};

    stockTrades.forEach(t => {
      const type = t.trade_type.toUpperCase();
      const qty = Number(t.quantity);
      const price = Number(t.price);
      const monthKey = t.trade_date.substring(0, 7); // YYYY-MM

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { pnl: 0, count: 0, buyQty: 0, sellQty: 0 };
      }
      monthlyData[monthKey].count++;

      if (type === 'BUY' || type === 'B') {
        totalBuyQty += qty;
        totalBuyCost += qty * price;
        monthlyData[monthKey].buyQty += qty;
        buys.push({ quantity: qty, price: price, trade_date: t.trade_date });
      } else {
        totalSellQty += qty;
        totalSellVal += qty * price;
        monthlyData[monthKey].sellQty += qty;

        let sellRemaining = qty;
        while (sellRemaining > 0 && buys.length > 0) {
          const firstBuy = buys[0];
          const match = Math.min(sellRemaining, firstBuy.quantity);
          const profit = match * (price - firstBuy.price);
          allTimeRealizedPnL += profit;
          monthlyData[monthKey].pnl += profit;

          firstBuy.quantity -= match;
          sellRemaining -= match;
          if (firstBuy.quantity === 0) {
            buys.shift();
          }
        }
      }
    });

    // Find current active cycle start date
    let runningQty = 0;
    let cycleStartIdx = -1;
    stockTrades.forEach((t, idx) => {
      const type = t.trade_type.toUpperCase();
      const qty = Number(t.quantity);
      if (runningQty === 0 && (type === 'BUY' || type === 'B')) {
        cycleStartIdx = idx;
      }
      if (type === 'BUY' || type === 'B') {
        runningQty += qty;
      } else {
        runningQty = Math.max(0, runningQty - qty);
      }
    });

    let cycleStartDate: Date | null = null;
    let cycleRealizedPnL = 0;

    if (cycleStartIdx !== -1 && runningQty > 0) {
      cycleStartDate = new Date(stockTrades[cycleStartIdx].trade_date);
      // Run FIFO on trades on or after cycleStartDate
      const cycleBuys: { quantity: number; price: number }[] = [];
      const cycleTrades = stockTrades.slice(cycleStartIdx);
      cycleTrades.forEach(t => {
        const type = t.trade_type.toUpperCase();
        const qty = Number(t.quantity);
        const price = Number(t.price);
        if (type === 'BUY' || type === 'B') {
          cycleBuys.push({ quantity: qty, price: price });
        } else {
          let sellRemaining = qty;
          while (sellRemaining > 0 && cycleBuys.length > 0) {
            const firstBuy = cycleBuys[0];
            const match = Math.min(sellRemaining, firstBuy.quantity);
            cycleRealizedPnL += match * (price - firstBuy.price);
            firstBuy.quantity -= match;
            sellRemaining -= match;
            if (firstBuy.quantity === 0) {
              cycleBuys.shift();
            }
          }
        }
      });
    }

    // Month-wise formatted array
    const monthWiseStats = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        ...data
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    // Sort descending chronologically for list display
    const rawTrades = [...stockTrades].sort((a, b) => new Date(b.trade_date).getTime() - new Date(a.trade_date).getTime());

    // Merged Trades logic (group by symbol, date, type)
    const mergedMap = new Map<string, any>();
    rawTrades.forEach(t => {
      const dateStr = t.trade_date.substring(0, 10);
      const key = `${t.trade_type}_${dateStr}`;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, {
          ...t,
          splitIds: [t.id],
          splitCount: 1,
          quantity: Number(t.quantity),
          price: Number(t.price),
          totalVal: Number(t.quantity) * Number(t.price)
        });
      } else {
        const existing = mergedMap.get(key);
        existing.splitIds.push(t.id);
        existing.splitCount += 1;
        existing.quantity += Number(t.quantity);
        existing.totalVal += Number(t.quantity) * Number(t.price);
        existing.price = existing.totalVal / existing.quantity;
      }
    });

    const mergedTrades = Array.from(mergedMap.values()).sort((a, b) => new Date(b.trade_date).getTime() - new Date(a.trade_date).getTime());

    const avgBuyPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
    const avgSellPrice = totalSellQty > 0 ? totalSellVal / totalSellQty : 0;

    return {
      tradesCount: stockTrades.length,
      totalBuyQty,
      totalSellQty,
      realizedPnL: allTimeRealizedPnL,
      avgBuyPrice,
      avgSellPrice,
      cycleStartDate,
      cycleRealizedPnL,
      monthWiseStats,
      rawTrades,
      mergedTrades
    };
  };

  useEffect(() => {
    fetchCoreData();

    const handleSyncComplete = () => {
      fetchCoreData();
    };

    const handleCacheUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const endpoint = customEvent.detail?.endpoint;
      if (endpoint === '/holdings' || endpoint === '/trades') {
        fetchCoreData();
      }
    };

    window.addEventListener('portfolio-sync-complete', handleSyncComplete);
    window.addEventListener('finor-cache-updated', handleCacheUpdate);
    return () => {
      window.removeEventListener('portfolio-sync-complete', handleSyncComplete);
      window.removeEventListener('finor-cache-updated', handleCacheUpdate);
    };
  }, []);

  const handleAddTrade = async () => {
    if (!addTradeSymbol.trim() || !addTradeQty || !addTradePrice) {
      setAddTradeResult({ success: false, message: 'Please fill in all fields.' });
      return;
    }
    setAddTradeLoading(true);
    setAddTradeResult(null);
    try {
      // Build a mini CSV and upload it via the existing /trades/upload endpoint
      const tradeDateFormatted = addTradeDate || new Date().toISOString().split('T')[0];
      const [year, month, day] = tradeDateFormatted.split('-');
      const csvContent = `symbol,trade_date,trade_type,quantity,price\n${addTradeSymbol.trim().toUpperCase()},${month}-${day}-${year},${addTradeType},${addTradeQty},${addTradePrice}`;

      const { data: { session } } = await (await import('../services/supabase')).supabase.auth.getSession();
      const token = session?.access_token;
      const baseUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api').replace(/\/$/, '');
      const url = baseUrl.endsWith('/api') ? `${baseUrl}/trades/upload` : `${baseUrl}/api/trades/upload`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/csv',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: csvContent
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to add trade');

      setAddTradeResult({ success: true, message: `✅ ${result.message}` });
      // Reset form
      setAddTradeSymbol('');
      setAddTradeQty('');
      setAddTradePrice('');
      setAddTradeDate(new Date().toISOString().split('T')[0]);
      // Refresh holdings and broadcast sync event
      await fetchCoreData();
      window.dispatchEvent(new Event('portfolio-sync-complete'));
    } catch (err: any) {
      setAddTradeResult({ success: false, message: err.message });
    } finally {
      setAddTradeLoading(false);
    }
  };

  const handleSyncPrices = async () => {
    setSyncing(true);
    setError(null);
    try {
      await apiRequest('/holdings/sync-prices', {
        method: 'POST',
      });
      await fetchCoreData();
    } catch (err: any) {
      setError(err.message || 'Failed to sync prices.');
    } finally {
      setSyncing(false);
    }
  };

  const handleForceRecalculate = async () => {
    setForceRebuilding(true);
    setError(null);
    const toastId = useToastStore.getState().addToast('Clearing caches & rebuilding holdings...', 'loading');
    try {
      // 1. Clear local IndexedDB cache
      const { db: appDb } = await import('../services/api');
      await appDb.apiCache.clear();
      
      // 2. Call backend force recalculation
      await apiRequest('/holdings/force-recalculate', {
        method: 'POST',
      });
      
      // 3. Rebuild historical snapshots
      await apiRequest('/snapshots/initialize-history', {
        method: 'POST',
      });

      useToastStore.getState().removeToast(toastId);
      useToastStore.getState().addToast('System successfully synchronized and rebuilt!', 'success');
      
      await fetchCoreData();
    } catch (err: any) {
      useToastStore.getState().removeToast(toastId);
      setError(err.message || 'Failed to force recalculation.');
      useToastStore.getState().addToast(err.message || 'Failed to force recalculation.', 'error');
    } finally {
      setForceRebuilding(false);
    }
  };

  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const handleClearAll = () => {
    setShowConfirmClear(true);
  };

  const executeClearAll = async () => {
    setShowConfirmClear(false);
    setLoading(true);
    try {
      await apiRequest('/trades', { method: 'DELETE' });
      setHoldings([]);
      setTrades([]);
    } catch (err: any) {
      setError(err.message || 'Failed to clear data.');
    } finally {
      setLoading(false);
    }
  };

  // CSV Parsing and Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setImportResult(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        // Get first 5 lines for preview
        const preview = text.split('\n').slice(0, 5).join('\n');
        setCsvPreview(preview);
      };
      reader.readAsText(file);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const csvText = await csvFile.text();
      const result = await apiRequest('/trades/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/csv',
        },
        body: csvText,
      });

      setImportResult(result);
      setCsvFile(null);
      setCsvPreview('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // Refresh database records
      await fetchCoreData();
    } catch (err: any) {
      setError(err.message || 'Failed to import CSV.');
    } finally {
      setImporting(false);
    }
  };

  // Financial Calculations
  const totalInvested = holdings.reduce((sum, h) => sum + (h.average_buy_price * h.quantity), 0);
  const totalValue = holdings.reduce((sum, h) => sum + ((h.ltp || h.average_buy_price) * h.quantity), 0);
  const totalPL = totalValue - totalInvested;
  const totalROI = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  // Filter and Sort holdings list
  const filteredHoldings = holdings
    .filter(h => {
      const matchesSearch = h.stock_symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            h.stock_name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const currentLTP = h.ltp || h.average_buy_price;
      const pl = (currentLTP - h.average_buy_price) * h.quantity;
      
      if (performanceFilter === 'profit') return matchesSearch && pl >= 0;
      if (performanceFilter === 'loss') return matchesSearch && pl < 0;
      return matchesSearch;
    })
    .sort((a, b) => {
      const aLTP = a.ltp || a.average_buy_price;
      const bLTP = b.ltp || b.average_buy_price;
      
      const aVal = aLTP * a.quantity;
      const bVal = bLTP * b.quantity;
      
      const aCost = a.average_buy_price * a.quantity;
      const bCost = b.average_buy_price * b.quantity;
      
      const aPL = aVal - aCost;
      const bPL = bVal - bCost;
      
      const aROI = aCost > 0 ? (aPL / aCost) * 100 : 0;
      const bROI = bCost > 0 ? (bPL / bCost) * 100 : 0;

      if (sortBy === 'value') return bVal - aVal;
      if (sortBy === 'pl') return bPL - aPL;
      if (sortBy === 'return') return bROI - aROI;
      return a.stock_symbol.localeCompare(b.stock_symbol);
    });

  // Calculate Holding Days since current buy cycle started
  const getHoldingDays = (symbol: string) => {
    // Filter trades for this symbol and sort chronologically (ascending)
    const symbolTrades = trades
      .filter(t => t.stock_symbol === symbol)
      .sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
      
    if (symbolTrades.length === 0) return 0;
    
    // Trace running quantity to find the start of the current cycle
    let runningQty = 0;
    let cycleStartDate = new Date(symbolTrades[0].trade_date);
    
    for (const trade of symbolTrades) {
      if (runningQty === 0 && trade.trade_type === 'BUY') {
        cycleStartDate = new Date(trade.trade_date);
      }
      
      if (trade.trade_type === 'BUY') {
        runningQty += trade.quantity;
      } else {
        runningQty = Math.max(0, runningQty - trade.quantity);
      }
    }
    
    const diffTime = Math.abs(Date.now() - cycleStartDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getOutstandingBuys = (symbol: string) => {
    const symbolTrades = trades
      .filter(t => t.stock_symbol.toUpperCase() === symbol.toUpperCase())
      .sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
    
    const outstandingBuys: { quantity: number; price: number; trade_date: string }[] = [];
    
    symbolTrades.forEach(t => {
      const type = t.trade_type.toUpperCase();
      const qty = Number(t.quantity);
      const price = Number(t.price);
      
      if (type === 'BUY' || type === 'B') {
        outstandingBuys.push({ quantity: qty, price: price, trade_date: t.trade_date });
      } else {
        let sellRemaining = qty;
        while (sellRemaining > 0 && outstandingBuys.length > 0) {
          const firstBuy = outstandingBuys[0];
          const match = Math.min(sellRemaining, firstBuy.quantity);
          firstBuy.quantity -= match;
          sellRemaining -= match;
          if (firstBuy.quantity === 0) {
            outstandingBuys.shift();
          }
        }
      }
    });
    
    return outstandingBuys.filter(b => b.quantity > 0);
  };

  const runSimulation = () => {
    if (!simStock) return null;
    const stockHolding = holdings.find(h => h.stock_symbol.toUpperCase() === simStock.toUpperCase());
    
    let currentQty = stockHolding ? stockHolding.quantity : 0;
    let currentAvg = stockHolding ? stockHolding.average_buy_price : 0;
    let currentInvested = currentQty * currentAvg;
    const ltpVal = stockHolding?.ltp || 0;

    // Retrieve active outstanding buys queue
    const runningBuys = getOutstandingBuys(simStock);
    
    let cumulativeRealizedPnL = 0;
    const stepResults: any[] = [];

    simPlannedTrades.forEach(trade => {
      let stepRealizedPnL = 0;
      if (trade.type === 'BUY') {
        runningBuys.push({
          quantity: trade.quantity,
          price: trade.price,
          trade_date: new Date().toISOString()
        });
      } else {
        let sellRemaining = trade.quantity;
        while (sellRemaining > 0 && runningBuys.length > 0) {
          const firstBuy = runningBuys[0];
          const match = Math.min(sellRemaining, firstBuy.quantity);
          const profit = match * (trade.price - firstBuy.price);
          
          stepRealizedPnL += profit;
          cumulativeRealizedPnL += profit;
          
          firstBuy.quantity -= match;
          sellRemaining -= match;
          if (firstBuy.quantity === 0) {
            runningBuys.shift();
          }
        }
      }

      const stepQty = runningBuys.reduce((sum, b) => sum + b.quantity, 0);
      const stepTotalCost = runningBuys.reduce((sum, b) => sum + (b.quantity * b.price), 0);
      const stepAvg = stepQty > 0 ? stepTotalCost / stepQty : 0;
      const stepActivePnL = stepQty > 0 && ltpVal > 0 ? stepQty * (ltpVal - stepAvg) : 0;

      stepResults.push({
        tradeId: trade.id,
        simQty: stepQty,
        simAvg: stepAvg,
        stepRealizedPnL,
        cumulativeRealizedPnL,
        activePnL: stepActivePnL
      });
    });

    const finalQty = runningBuys.reduce((sum, b) => sum + b.quantity, 0);
    const finalCost = runningBuys.reduce((sum, b) => sum + (b.quantity * b.price), 0);
    const finalAvg = finalQty > 0 ? finalCost / finalQty : 0;
    const finalInvested = finalQty * finalAvg;

    const avgPriceDiff = currentAvg > 0 ? ((finalAvg - currentAvg) / currentAvg) * 100 : 0;

    return {
      currentQty,
      currentAvg,
      currentInvested,
      simQty: finalQty,
      simAvg: finalAvg,
      simInvested: finalInvested,
      totalRealizedPnL: cumulativeRealizedPnL,
      avgPriceDiff,
      ltpVal,
      stepResults
    };
  };

  const renderSimulator = () => {
    const simResult = runSimulation();

    const handleAddSimTrade = (e: React.FormEvent) => {
      e.preventDefault();
      if (!simStock) {
        triggerAlert('error', 'Select Stock', 'Please select a stock to plan simulated trades.');
        return;
      }
      const qty = parseInt(simQty, 10);
      const prc = parseFloat(simPrice);
      if (isNaN(qty) || qty <= 0 || isNaN(prc) || prc <= 0) {
        triggerAlert('error', 'Invalid Trade Data', 'Please enter valid positive quantity and price.');
        return;
      }

      const newPlanned = {
        id: Math.random().toString(36).substring(2, 9),
        type: simType,
        quantity: qty,
        price: prc
      };

      setSimPlannedTrades([...simPlannedTrades, newPlanned]);
      setSimQty('');
      setSimPrice('');
    };

    const handleRemoveSimTrade = (id: string) => {
      setSimPlannedTrades(simPlannedTrades.filter(t => t.id !== id));
    };

    const handleClearSimulation = () => {
      setSimPlannedTrades([]);
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Form & Simulator Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel rounded-3xl p-6 border border-dark-border space-y-5">
            <div>
              <h3 className="text-base font-bold text-white">Simulation Setup</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Plan simulated buys and sells for your positions.</p>
            </div>

            {/* Select Stock Dropdown */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select Position Ticker</label>
              <select
                value={simStock}
                onChange={(e) => {
                  setSimStock(e.target.value);
                  setSimPlannedTrades([]);
                }}
                className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-4 py-2.5 text-xs text-white focus:border-brand-500 outline-none cursor-pointer"
              >
                <option value="">-- Choose Stock --</option>
                {holdings.map(h => (
                  <option key={h.stock_symbol} value={h.stock_symbol}>
                    {h.stock_symbol} ({h.quantity} shares @ ₹{h.average_buy_price.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            {simStock && (
              <form onSubmit={handleAddSimTrade} className="space-y-4 pt-2 border-t border-dark-border/40">
                <div className="flex gap-3">
                  {/* Action Selector */}
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Action</label>
                    <div className="flex bg-dark-depth-2 border border-dark-border p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setSimType('BUY')}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          simType === 'BUY'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        BUY
                      </button>
                      <button
                        type="button"
                        onClick={() => setSimType('SELL')}
                        className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                          simType === 'SELL'
                            ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        SELL
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Quantity */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quantity</label>
                    <input
                      type="number"
                      placeholder="e.g. 40"
                      value={simQty}
                      onChange={(e) => setSimQty(e.target.value)}
                      className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-4 py-2.5 text-xs text-white focus:border-brand-500 outline-none"
                    />
                  </div>

                  {/* Target Price */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Target Price (₹)</label>
                    <input
                      type="number"
                      step="0.05"
                      placeholder="e.g. 330"
                      value={simPrice}
                      onChange={(e) => setSimPrice(e.target.value)}
                      className="w-full bg-dark-depth-2 border border-dark-border rounded-xl px-4 py-2.5 text-xs text-white focus:border-brand-500 outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs font-bold text-white shadow-lg transition-all cursor-pointer"
                >
                  Add Trade to Planner
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Simulation Outcomes & Metrics (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {simStock ? (
            <div className="glass-panel rounded-3xl p-6 border border-dark-border space-y-6">
              
              {/* Outcome Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">Outcome Analysis — {simStock}</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Real-time simulation results computed chronologically.</p>
                </div>
                {simPlannedTrades.length > 0 && (
                  <button
                    onClick={handleClearSimulation}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    Reset Plan
                  </button>
                )}
              </div>

              {/* Outcome Comparison Grid */}
              {simResult && (
                <div className="grid grid-cols-2 gap-4">
                  {/* Before Simulation Card */}
                  <div className="bg-dark-depth-2/40 border border-dark-border/60 rounded-2xl p-4 space-y-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Current Position</span>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-300">Quantity: <span className="text-white font-bold">{simResult.currentQty}</span></p>
                      <p className="text-xs text-gray-300">Avg Cost: <span className="text-white font-bold">₹{simResult.currentAvg.toFixed(2)}</span></p>
                      <p className="text-xs text-gray-300">Total Capital: <span className="text-white font-bold">₹{simResult.currentInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
                    </div>
                  </div>

                  {/* After Simulation Card */}
                  <div className="bg-dark-depth-2/40 border border-dark-border/60 rounded-2xl p-4 space-y-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-400">Simulated Position</span>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-300">Quantity: <span className="text-white font-bold">{simResult.simQty}</span></p>
                      <p className="text-xs text-gray-300">
                        Avg Cost: <span className="text-white font-bold">₹{simResult.simAvg.toFixed(2)}</span>
                        {simResult.avgPriceDiff !== 0 && (
                          <span className={`text-[10px] font-bold ml-1.5 ${simResult.avgPriceDiff < 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            ({simResult.avgPriceDiff < 0 ? '' : '+'}{simResult.avgPriceDiff.toFixed(2)}%)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-300">Total Capital: <span className="text-white font-bold">₹{simResult.simInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span></p>
                    </div>
                  </div>
                </div>
              )}

              {/* Realized Gains Info Alert */}
              {simResult && (simResult.totalRealizedPnL !== 0 || simPlannedTrades.length > 0) && (
                <div className="p-4 rounded-2xl bg-brand-500/5 border border-brand-500/10 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-brand-400">Estimated Outcome Metrics</span>
                    <p className="text-xs text-gray-200">
                      Planned Realized Gain: <span className={`font-bold ${simResult.totalRealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {simResult.totalRealizedPnL >= 0 ? '+' : ''}₹{simResult.totalRealizedPnL.toFixed(2)}
                      </span>
                    </p>
                  </div>
                  {simPlannedTrades.length > 0 && (
                    <div className="text-right space-y-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Planned Triggers</span>
                      <p className="text-xs text-gray-300 font-medium">{simPlannedTrades.length} operations set</p>
                    </div>
                  )}
                </div>
              )}

              {/* Planned Trades List */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Planned Chronology</span>
                {simPlannedTrades.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-dark-border/40 rounded-2xl text-xs text-gray-500 select-none">
                    No planned trades added. Add a simulated Buy/Sell trade using the setup form.
                  </div>
                ) : (
                  <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                    {simPlannedTrades.map((t, idx) => {
                      const step = simResult?.stepResults?.[idx];
                      return (
                        <div key={t.id} className="bg-dark-depth-2/30 border border-dark-border/40 p-4 rounded-2xl space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 font-bold">{idx + 1}.</span>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                t.type === 'BUY'
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                                  : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                              }`}>
                                {t.type}
                              </span>
                              <span className="text-white font-extrabold">{t.quantity} shares</span>
                              <span className="text-gray-600">•</span>
                              <span className="text-gray-400 font-semibold">@ ₹{t.price.toFixed(2)}</span>
                            </div>
                            
                            <div className="flex items-center gap-2 select-none">
                              <button
                                type="button"
                                onClick={() => {
                                  window.dispatchEvent(new CustomEvent('finor-switch-tab', {
                                    detail: {
                                      tab: 'orders',
                                      symbol: simStock,
                                      action: t.type,
                                      quantity: t.quantity,
                                      price: t.price.toFixed(2)
                                    }
                                  }));
                                }}
                                className="text-[9px] font-extrabold text-brand-400 hover:text-brand-300 hover:underline cursor-pointer"
                              >
                                Set GTT
                              </button>
                              <span className="text-gray-700">|</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveSimTrade(t.id)}
                                className="text-gray-500 hover:text-rose-500 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Step Position Outcomes (FIFO) */}
                          {step && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2.5 border-t border-dark-border/30 text-[10px] text-gray-400">
                              <div>
                                  <span className="block text-gray-500 font-bold uppercase text-[8px]">Sim Qty</span>
                                  <span className="font-extrabold text-white block mt-0.5">{step.simQty} shares</span>
                              </div>
                              <div>
                                  <span className="block text-gray-500 font-bold uppercase text-[8px]">Avg Cost (FIFO)</span>
                                  <span className="font-extrabold text-white block mt-0.5">₹{step.simAvg.toFixed(2)}</span>
                              </div>
                              <div>
                                  <span className="block text-gray-500 font-bold uppercase text-[8px]">Active P&L</span>
                                  <span className={`font-extrabold block mt-0.5 ${step.activePnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {step.activePnL >= 0 ? '+' : ''}₹{step.activePnL.toFixed(2)}
                                  </span>
                              </div>
                              <div>
                                  <span className="block text-gray-500 font-bold uppercase text-[8px]">{t.type === 'SELL' ? 'Realized P&L' : 'Cumul. Realized'}</span>
                                  <span className={`font-extrabold block mt-0.5 ${
                                    (t.type === 'SELL' ? step.stepRealizedPnL : step.cumulativeRealizedPnL) >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                  }`}>
                                    {(t.type === 'SELL' ? step.stepRealizedPnL : step.cumulativeRealizedPnL) >= 0 ? '+' : ''}
                                    ₹{(t.type === 'SELL' ? step.stepRealizedPnL : step.cumulativeRealizedPnL).toFixed(2)}
                                  </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="glass-panel rounded-3xl border border-dark-border min-h-[300px] flex flex-col items-center justify-center text-center p-6 select-none text-xs text-gray-500 gap-3">
              <Calculator className="w-10 h-10 text-gray-700" />
              <div>
                <h4 className="font-bold text-white">Select Stock to Begin Simulation</h4>
                <p className="mt-1 leading-relaxed max-w-xs mx-auto text-[11px]">
                  Select any active ticker position from the dropdown menu to simulate planned buys/sells and calculate cost-basis changes.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    );
  };

  const allSymbols = Array.from(new Set([
    ...holdings.map(h => h.stock_symbol.toUpperCase()),
    ...trades.map(t => t.stock_symbol.toUpperCase())
  ])).sort();

  if (activeDetailSymbol) {
    const stats = getStockStats(activeDetailSymbol);
    const activeHolding = holdings.find(h => h.stock_symbol.toUpperCase() === activeDetailSymbol.toUpperCase());
    const settings = activeHolding ? (stockSettings[activeHolding.stock_symbol] || { stoploss_price: null, position_tag: 'TRADING' }) : null;
    const isCoreHold = settings?.position_tag === 'CORE_HOLD';
    const holdingDays = activeHolding ? getHoldingDays(activeHolding.stock_symbol) : 0;
    const [stockNameOnly, weightedAvgStr] = activeHolding ? activeHolding.stock_name.split('|') : [activeDetailSymbol, null];
    const currentLTP = activeHolding ? (activeHolding.ltp || activeHolding.average_buy_price) : 0;
    const investedVal = activeHolding ? (activeHolding.average_buy_price * activeHolding.quantity) : 0;
    const currentVal = activeHolding ? (currentLTP * activeHolding.quantity) : 0;
    const pl = currentVal - investedVal;
    const roi = investedVal > 0 ? (pl / investedVal) * 100 : 0;
    const isProfit = pl >= 0;

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Header & Switcher Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-dark-border/40 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setActiveDetailSymbol(null);
                setSentimentData(null);
              }}
              className="px-3.5 py-2 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-gray-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Portfolio
            </button>
            <div>
              <h1 className="text-2xl font-black font-display text-white tracking-tight flex items-center gap-2">
                {activeDetailSymbol}
                {activeHolding ? (
                  <span className="text-[10px] text-emerald-400 font-extrabold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Active Position
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400 font-extrabold bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Closed Position
                  </span>
                )}
              </h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{stockNameOnly}</p>
            </div>
          </div>

          {/* Switcher Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Analyze Stock:</span>
            <select
              value={activeDetailSymbol}
              onChange={(e) => handleOpenStockDetails(e.target.value)}
              className="bg-dark-depth-2 border border-dark-border text-white text-xs font-extrabold rounded-xl px-3 py-2 focus:outline-none focus:border-brand-500 cursor-pointer"
            >
              {allSymbols.map(sym => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1 & 2: Position details and Trades Ledger */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Position Summary Card */}
            <div className="glass-panel rounded-3xl p-6 border border-dark-border relative overflow-hidden">
              <div className="absolute top-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-brand-500/5 blur-[50px] pointer-events-none" />
              <h3 className="text-xs font-black text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-brand-400" />
                Position Status
              </h3>
              
              {activeHolding ? (
                <>
                  {/* Desktop View (md and up) */}
                  <div className="hidden md:grid grid-cols-5 gap-6">
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Quantity held</span>
                      <span className="text-lg font-black text-white block mt-1">{activeHolding.quantity} shares</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Average Price (FIFO)</span>
                      <span className="text-lg font-black text-white block mt-1">₹{activeHolding.average_buy_price.toFixed(2)}</span>
                      {weightedAvgStr && (
                        <span className="text-[10px] text-gray-400 block mt-1 font-semibold">
                          Weighted: ₹{parseFloat(weightedAvgStr).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Current LTP</span>
                      <span className="text-lg font-black text-white block mt-1">₹{currentLTP.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Position tag</span>
                      <span className="text-lg font-black text-white block mt-1">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${
                          isCoreHold 
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                            : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                        }`}>
                          {isCoreHold ? 'Core Hold' : 'Trading'}
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Holding Period</span>
                      <span className="text-lg font-black text-white block mt-1">{holdingDays} Days</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Investment Value</span>
                      <span className="text-sm font-bold text-white block mt-1">₹{investedVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Current Value</span>
                      <span className="text-sm font-bold text-white block mt-1">₹{currentVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Active P&L</span>
                      <span className={`text-sm font-black block mt-1 ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isProfit ? '+' : ''}₹{pl.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ({isProfit ? '+' : ''}{roi.toFixed(2)}%)
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Cycle Realized P&L</span>
                      <span className={`text-sm font-black block mt-1 ${stats.cycleRealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {stats.cycleRealizedPnL >= 0 ? '+' : ''}₹{stats.cycleRealizedPnL.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Mobile View (below md) */}
                  <div className="md:hidden space-y-4">
                    {/* Hero P&L Banner */}
                    <div className="flex items-center justify-between p-4 bg-dark-depth-2/40 border border-dark-border/60 rounded-2xl select-none">
                      <div>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Active P&L</span>
                        <span className={`text-xl font-black block mt-0.5 ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {isProfit ? '+' : ''}₹{pl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full mt-1.5 inline-block ${
                          isProfit ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {isProfit ? '+' : ''}{roi.toFixed(2)}% ROI
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Current Value</span>
                        <span className="text-base font-black text-white block mt-0.5">
                          ₹{currentVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-gray-400 block mt-1 font-bold">
                          LTP: ₹{currentLTP.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Key Details Rows */}
                    <div className="bg-dark-depth-2/20 border border-dark-border/40 rounded-2xl overflow-hidden divide-y divide-dark-border/30">
                      <div className="flex items-center justify-between px-4 py-3 text-xs">
                        <span className="text-gray-500 font-bold uppercase text-[9px] tracking-wider">Quantity Held</span>
                        <span className="font-extrabold text-white">{activeHolding.quantity} shares</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 text-xs">
                        <span className="text-gray-500 font-bold uppercase text-[9px] tracking-wider">Avg Buy Price (FIFO)</span>
                        <div className="text-right">
                          <span className="font-extrabold text-white block">₹{activeHolding.average_buy_price.toFixed(2)}</span>
                          {weightedAvgStr && (
                            <span className="text-[9px] text-gray-400 font-semibold block">
                              Weighted: ₹{parseFloat(weightedAvgStr).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 text-xs">
                        <span className="text-gray-500 font-bold uppercase text-[9px] tracking-wider">Investment Value</span>
                        <span className="font-extrabold text-white">₹{investedVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 text-xs">
                        <span className="text-gray-500 font-bold uppercase text-[9px] tracking-wider">Holding Period</span>
                        <span className="font-extrabold text-white">{holdingDays} Days</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 text-xs">
                        <span className="text-gray-500 font-bold uppercase text-[9px] tracking-wider">Cycle Realized P&L</span>
                        <span className={`font-extrabold ${stats.cycleRealizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {stats.cycleRealizedPnL >= 0 ? '+' : ''}₹{stats.cycleRealizedPnL.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 text-xs">
                        <span className="text-gray-500 font-bold uppercase text-[9px] tracking-wider">Position Tag</span>
                        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md border ${
                          isCoreHold ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                        }`}>
                          {isCoreHold ? 'Core Hold' : 'Trading'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 py-4 text-xs text-gray-400 bg-dark-depth-2/45 border border-dark-border p-4 rounded-2xl">
                  <CheckCircle2 className="w-5 h-5 text-gray-600" />
                  <div>
                    <h5 className="font-extrabold text-white">No Active Position</h5>
                    <p className="mt-0.5 leading-relaxed">This stock is not currently present in your holdings. All positions have been closed or squared off.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Trade History for this stock */}
            <div className="glass-panel rounded-3xl p-6 border border-dark-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-brand-400" />
                  Transaction Ledger
                </h3>
                
                {/* Merged vs Split Toggle */}
                <div className="flex items-center bg-dark-depth-2/60 border border-dark-border/60 p-0.5 rounded-lg text-[10px]">
                  <button
                    onClick={() => setDetailViewMerged(true)}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                      detailViewMerged 
                        ? 'bg-brand-600 text-white shadow-sm' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Merged View
                  </button>
                  <button
                    onClick={() => setDetailViewMerged(false)}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                      !detailViewMerged 
                        ? 'bg-brand-600 text-white shadow-sm' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    All Executions
                  </button>
                </div>
              </div>
              
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {(detailViewMerged ? stats.mergedTrades : stats.rawTrades).map((t) => {
                  const isBuy = t.trade_type === 'BUY';
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-4 p-3 bg-dark-depth-2/40 border border-dark-border/50 rounded-xl hover:bg-dark-depth-2/70 transition-all select-none">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                            isBuy
                              ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-500'
                              : 'bg-rose-500/10 border-rose-500/10 text-rose-500'
                          }`}>
                            {t.trade_type}
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold">
                            {new Date(t.trade_date).toLocaleDateString('en-IN')}
                          </span>
                          {t.splitCount > 1 && (
                            <span className="text-[9px] font-black bg-brand-500/10 border border-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded">
                              Merged ({t.splitCount} trades)
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 font-semibold mt-1">
                          {t.quantity} shares @ ₹{Number(t.price).toFixed(2)}
                        </p>
                      </div>
                      <span className="text-xs font-extrabold text-white">
                        ₹{(Number(t.quantity) * Number(t.price)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
                
                {(detailViewMerged ? stats.mergedTrades : stats.rawTrades).length === 0 && (
                  <p className="text-xs text-gray-500 py-6 text-center">No trades logged for this stock.</p>
                )}
              </div>
            </div>

            {/* Month-Wise Analytical Card */}
            <div className="glass-panel rounded-3xl p-6 border border-dark-border">
              <h3 className="text-xs font-black text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-brand-400" />
                Month-Wise Analytics (Active & Historical)
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-dark-border/40 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      <th className="py-2.5">Month</th>
                      <th className="py-2.5 text-right">Buys (Qty)</th>
                      <th className="py-2.5 text-right">Sells (Qty)</th>
                      <th className="py-2.5 text-center">Trades</th>
                      <th className="py-2.5 text-right">Realized P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.monthWiseStats.map((row) => {
                      const isProfit = row.pnl >= 0;
                      // Determine if this month falls within the current buy cycle
                      const isCurrentCycle = stats.cycleStartDate && new Date(row.month + '-02') >= new Date(stats.cycleStartDate.getFullYear(), stats.cycleStartDate.getMonth(), 1);
                      return (
                        <tr key={row.month} className="border-b border-dark-border/20 hover:bg-dark-depth-2/20 transition-all select-none">
                          <td className="py-3 font-semibold text-gray-300 flex items-center gap-1.5">
                            {row.month}
                            {isCurrentCycle && (
                              <span className="text-[8px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1 py-0.2 rounded uppercase">
                                Active Cycle
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-right text-gray-400">{row.buyQty > 0 ? `${row.buyQty} shares` : '—'}</td>
                          <td className="py-3 text-right text-gray-400">{row.sellQty > 0 ? `${row.sellQty} shares` : '—'}</td>
                          <td className="py-3 text-center text-gray-400">{row.count}</td>
                          <td className={`py-3 text-right font-bold ${row.pnl === 0 ? 'text-gray-500' : isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {row.pnl === 0 ? '—' : `${isProfit ? '+' : ''}₹${row.pnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                          </td>
                        </tr>
                      );
                    })}
                    {stats.monthWiseStats.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs text-gray-500">No monthly trading activity recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Column 3: AI Sentiment, News & realized PnL Analytics */}
          <div className="space-y-6">
            
            {/* realized returns analytics */}
            <div className="glass-panel rounded-3xl p-6 border border-dark-border">
              <h3 className="text-xs font-black text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-brand-400" />
                Realized Returns & Analytics
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-dark-border/40">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total Trades</span>
                  <span className="text-xs font-bold text-white">{stats.tradesCount} executions</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dark-border/40">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total Buy Qty</span>
                  <span className="text-xs font-semibold text-gray-300">{stats.totalBuyQty} shares</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-dark-border/40">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total Sell Qty</span>
                  <span className="text-xs font-semibold text-gray-300">{stats.totalSellQty} shares</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Net Realized P&L</span>
                  <span className={`text-xs font-black ${stats.realizedPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {stats.realizedPnL >= 0 ? '+' : ''}₹{stats.realizedPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Sentiment Analysis */}
            <div className="glass-panel rounded-3xl p-6 border border-dark-border">
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
                  AI Conviction Audit
                </h3>

                {loadingSentiment ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                    <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-wider">Fetching AI analysis...</span>
                  </div>
                ) : sentimentData ? (
                  <div className="space-y-5">
                    {/* Score gauge */}
                    <div className="flex items-center gap-4">
                      <div className="relative flex items-center justify-center w-16 h-16 rounded-full border border-dark-border bg-dark-depth-2">
                        <span className="text-lg font-black text-brand-400 font-display">{sentimentData.score ?? 50}</span>
                        <span className="text-[8px] text-gray-500 absolute bottom-2 font-bold">SCORE</span>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white">Conviction Rating</h4>
                        <p className="text-[10px] text-gray-400 mt-1 font-semibold leading-relaxed">
                          {(sentimentData.score ?? 50) >= 71 
                            ? 'High Conviction Long-Term Hold' 
                            : (sentimentData.score ?? 50) >= 41 
                            ? 'Moderate Conviction Position' 
                            : 'Low Conviction Risk Alert'}
                        </p>
                      </div>
                    </div>

                    {/* Audit Assessment details */}
                    <div className="text-[11px] text-gray-300 leading-relaxed font-medium space-y-3.5 border-t border-dark-border/40 pt-4">
                      <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Audit Assessment</span>
                      <div className="space-y-2.5">
                        {sentimentData.performance_audit && (
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-gray-500 font-extrabold uppercase block">Performance Audit</span>
                            <p className="text-gray-300 leading-normal font-medium">{sentimentData.performance_audit}</p>
                          </div>
                        )}
                        {sentimentData.news_impact && (
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-gray-500 font-extrabold uppercase block">News & Actions Impact</span>
                            <p className="text-gray-300 leading-normal font-medium">{sentimentData.news_impact}</p>
                          </div>
                        )}
                        {sentimentData.technical_outlook && (
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-gray-500 font-extrabold uppercase block">Outlook</span>
                            <p className="text-gray-300 leading-normal font-medium">{sentimentData.technical_outlook}</p>
                          </div>
                        )}
                        {sentimentData.coach_advice && (
                          <div className="p-3 rounded-2xl bg-brand-500/5 border border-brand-500/10 text-gray-250 mt-2 font-semibold">
                            <span className="text-[8px] text-brand-400 font-black uppercase block tracking-wider mb-0.5">Coach's Rule</span>
                            "{sentimentData.coach_advice}"
                          </div>
                        )}
                      </div>
                    </div>

                    {/* News List */}
                    {sentimentData.newsArticles && sentimentData.newsArticles.length > 0 && (
                      <div className="border-t border-dark-border/40 pt-4 space-y-3">
                        <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Latest News Headlines</span>
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {sentimentData.newsArticles.slice(0, 4).map((art: any, idx: number) => {
                            const sent = (art.sentiment || 'Neutral').toUpperCase();
                            const sentColor = sent === 'BULLISH' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : sent === 'BEARISH' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : 'text-gray-400 bg-gray-500/10 border-gray-500/20';
                            return (
                              <div key={idx} className="p-2.5 rounded-xl bg-dark-depth-2/45 border border-dark-border/50 text-[10px] space-y-1.5 hover:bg-dark-depth-2/70 transition-all">
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${sentColor}`}>{sent}</span>
                                  <span className="text-[8px] text-gray-500 font-semibold">{art.date || new Date().toLocaleDateString('en-IN')}</span>
                                </div>
                                <p className="font-semibold text-gray-250 leading-normal">{art.title || art.headline}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-6 flex flex-col items-center justify-center text-center text-gray-500 text-[10px] font-semibold gap-1.5 border border-dark-border/45 rounded-xl bg-dark-depth-2/30">
                    <Sparkles className="w-5 h-5 text-gray-700" />
                    <span>No active conviction audit loaded for this stock symbol.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming Events Calendar */}
            <div className="glass-panel rounded-3xl p-6 border border-dark-border">
              <h3 className="text-xs font-black text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-400" />
                Upcoming Corporate Actions
              </h3>
              
              {loadingSentiment ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                  <span className="text-[9px] text-gray-500 font-extrabold uppercase tracking-wider">Loading events...</span>
                </div>
              ) : sentimentData?.corporateActions && sentimentData.corporateActions.length > 0 ? (
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {sentimentData.corporateActions.map((act: any, idx: number) => {
                    const eventDate = act.event_date || act.ex_date || act.meeting_date || 'N/A';
                    return (
                      <div key={idx} className="p-3 rounded-2xl bg-dark-depth-2/45 border border-dark-border/50 text-[10px] space-y-1.5 hover:bg-dark-depth-2/70 transition-all">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded border uppercase bg-brand-500/10 border-brand-500/20 text-brand-400">
                            {act.type || 'Announcement'}
                          </span>
                          <span className="text-[8px] text-gray-500 font-bold">{eventDate}</span>
                        </div>
                        <p className="font-bold text-gray-250 leading-normal">{act.title || act.purpose || act.value}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-gray-550 border border-dashed border-dark-border/40 rounded-2xl select-none">
                  No upcoming dividends, results, or board meetings scheduled.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white">Holdings</h1>
          <p className="text-xs text-gray-400 mt-1">
            Displaying live stock positions calculated from your trade ledger.
          </p>
        </div>

        {/* Buttons Toolbar */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncPrices}
            disabled={syncing || forceRebuilding || holdings.length === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-dark-border bg-dark-depth-2/40 text-xs font-semibold text-gray-200 hover:text-white hover:border-brand-500/40 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-brand-500' : ''}`} />
            Refresh Prices
          </button>

          <button
            onClick={handleForceRecalculate}
            disabled={syncing || forceRebuilding || holdings.length === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-xs font-semibold text-rose-400 hover:text-white hover:bg-rose-500/25 hover:border-rose-500/40 transition-all cursor-pointer disabled:opacity-50"
            title="Clear all price caches and rebuild positions from scratch"
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${forceRebuilding ? 'animate-pulse text-rose-500' : ''}`} />
            Force Rebuild
          </button>
          
          <button
            onClick={() => { setIsAddTradeOpen(true); setAddTradeResult(null); }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-lg shadow-emerald-700/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Add Trade
          </button>

          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs font-semibold text-white shadow-lg shadow-brand-700/10 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </button>

          {holdings.length > 0 && (
            <button
              onClick={handleClearAll}
              className="p-2.5 rounded-xl border border-dark-border text-gray-400 hover:text-rose-500 hover:border-rose-500/20 transition-all cursor-pointer"
              title="Clear all trades and holdings"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm font-medium flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Sub-tab Switcher */}
      <div className="flex border-b border-dark-border/40 gap-4 mb-6">
        <button
          onClick={() => setActiveSubTab('holdings')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider relative transition-colors cursor-pointer ${
            activeSubTab === 'holdings' ? 'text-brand-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          Holdings Summary (${holdings.length})
          {activeSubTab === 'holdings' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />}
        </button>
        <button
          onClick={() => setActiveSubTab('simulator')}
          className={`pb-3 text-xs font-bold uppercase tracking-wider relative transition-colors cursor-pointer ${
            activeSubTab === 'simulator' ? 'text-brand-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          What-If Position Simulator
          {activeSubTab === 'simulator' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />}
        </button>
      </div>

      {activeSubTab === 'holdings' ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Total Value Card */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-xl pointer-events-none" />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Current Value</span>
          <h3 className="text-2xl font-extrabold text-white mt-1.5">
            ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500 font-medium">Invested:</span>
            <span className="text-xs text-gray-300 font-semibold">
              ₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* PNL Gain/Loss Card */}
        <div className={`glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden`}>
          <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-xl pointer-events-none ${totalPL >= 0 ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`} />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Profit / Loss</span>
          <h3 className={`text-2xl font-extrabold mt-1.5 flex items-center gap-1.5 ${totalPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {totalPL >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
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

        {/* Positions Count Card */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-xl pointer-events-none" />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Positions Held</span>
          <h3 className="text-2xl font-extrabold text-white mt-1.5">
            {holdings.length}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500 font-medium">Total Sync'd Trades:</span>
            <span className="text-xs text-gray-300 font-semibold">{trades.length}</span>
          </div>
        </div>

      </div>



      {/* Filters and Sorting Panel */}
      <div className="glass-panel rounded-2xl p-4 border border-dark-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search by symbol or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 transition-all placeholder:text-gray-500"
          />
        </div>

        {/* Filters & Sorting buttons */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Performance filter */}
          <div className="flex rounded-xl bg-dark-depth-2 border border-dark-border p-1">
            {(['all', 'profit', 'loss'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setPerformanceFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  performanceFilter === filter
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Sorter selection */}
          <div className="flex items-center gap-1 bg-dark-depth-2 border border-dark-border rounded-xl px-2 py-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-[10px] font-bold text-gray-300 focus:outline-none border-none pr-6 pl-1 py-1 cursor-pointer"
            >
              <option value="value">Sort: Current Value</option>
              <option value="pl">Sort: Profit & Loss</option>
              <option value="return">Sort: Return %</option>
              <option value="symbol">Sort: Ticker Name</option>
            </select>
          </div>

        </div>

      </div>

      {/* Consider Exit Warning Cards */}
      {considerExits.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {considerExits.map((ce) => (
            <div key={ce.symbol} className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">🚨 Consider Exit: {ce.symbol}</h4>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{ce.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Holdings List Grid */}
      {loading ? (
        <div className="text-center py-16">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-3" />
          <p className="text-xs text-gray-400">Loading holdings data...</p>
        </div>
      ) : filteredHoldings.length === 0 ? (
        <div className="glass-panel rounded-3xl p-16 text-center border border-dark-border">
          <FileSpreadsheet className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">No Open Holdings</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            {searchQuery 
              ? "We couldn't find any stocks matching your query. Adjust your search or filters." 
              : "Import your Zerodha tradebook CSV file to calculate and populate your portfolio holdings."}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setIsImportOpen(true)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs font-semibold text-white transition-all cursor-pointer shadow-lg shadow-brand-700/10"
            >
              <Upload className="w-4 h-4" />
              Upload Tradebook CSV
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredHoldings.map((h) => {
            const currentLTP = h.ltp || h.average_buy_price;
            const investedVal = h.average_buy_price * h.quantity;
            const currentVal = currentLTP * h.quantity;
            const pl = currentVal - investedVal;
            const roi = investedVal > 0 ? (pl / investedVal) * 100 : 0;
            const isProfit = pl >= 0;
            const holdingDays = getHoldingDays(h.stock_symbol);
            
            const settings = stockSettings[h.stock_symbol] || { stoploss_price: null, position_tag: 'TRADING' };
            const isCoreHold = settings.position_tag === 'CORE_HOLD';
            const exitFlag = considerExits.find(ce => ce.symbol === h.stock_symbol);
            const [stockNameOnly, weightedAvgStr] = h.stock_name.split('|');

            return (
              <div 
                key={h.id} 
                onClick={() => handleOpenStockDetails(h.stock_symbol)}
                className="glass-panel rounded-2xl p-5 border border-dark-border flex flex-col justify-between cursor-pointer transition-all hover:border-brand-500/30 hover:scale-[1.01]"
                style={exitFlag ? { borderColor: 'rgba(239, 68, 68, 0.3)', boxShadow: '0 0 10px rgba(239, 68, 68, 0.05)' } : {}}
              >
                
                {/* Top Section: Ticker and PNL badge */}
                <div className="flex items-start justify-between border-b border-dark-border/40 pb-3 mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-white font-display tracking-tight flex items-center flex-wrap gap-1.5">
                      {h.stock_symbol}
                      {isCoreHold && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: '#D4AF37', borderColor: 'rgba(212, 175, 55, 0.2)', backgroundColor: 'rgba(212, 175, 55, 0.08)', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                          ★ Core Hold
                        </span>
                      )}
                      {h.ltp === null && (
                        <span className="text-[9px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                          LTP Pending
                        </span>
                      )}
                    </h4>
                    <span className="text-[10px] text-gray-500 mt-0.5 block font-semibold uppercase tracking-wider">
                      {stockNameOnly}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                      isProfit 
                        ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-500' 
                        : 'bg-rose-500/10 border-rose-500/10 text-rose-500'
                    }`}>
                      {isProfit ? '+' : ''}{roi.toFixed(2)}%
                    </span>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingStock(h);
                        setEditStoploss(settings.stoploss_price !== null ? String(settings.stoploss_price) : '');
                        setEditTag(settings.position_tag);
                      }}
                      className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-dark-depth-2 transition-all cursor-pointer"
                      title="Edit stop-loss & tag"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* exit warning inline */}
                {exitFlag && (
                  <div className="mb-4 p-2.5 text-[10px] font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
                    <span>Consider Exit: Down 30%+ over 90+ days & negative news.</span>
                  </div>
                )}

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-500 block">Quantity</span>
                    <span className="text-sm font-bold text-white">{h.quantity}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">Avg. Price (FIFO)</span>
                    <span className="text-sm font-bold text-white">₹{h.average_buy_price.toFixed(2)}</span>
                    {weightedAvgStr && (
                      <span className="text-[9px] text-gray-400 block mt-0.5 font-medium">
                        Weighted: ₹{parseFloat(weightedAvgStr).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">Current LTP</span>
                    <span className="text-sm font-bold text-white">
                      <LtpPriceText value={currentLTP} />
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">Stop-Loss Price</span>
                    <span className="text-sm font-bold text-white">
                      {settings.stoploss_price !== null ? `₹${settings.stoploss_price.toFixed(2)}` : 'Not Set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">Holding Period</span>
                    <span className="text-sm font-bold text-white">{holdingDays} Days</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">Position Type</span>
                    <span className={`text-xs font-bold ${isCoreHold ? 'text-amber-500 font-extrabold' : 'text-gray-300'}`}>
                      {isCoreHold ? 'Core Hold' : 'Trading Position'}
                    </span>
                  </div>
                </div>

                {/* Target Progress Bar & GTT Trigger Suggestions */}
                {(() => {
                  const targetPct = isCoreHold ? 20 : 10;
                  const progress = Math.max(0, Math.min(100, roi > 0 ? (roi / targetPct) * 100 : 0));
                  const isNearTarget = roi > 0 && (targetPct - roi) <= 1.5;
                  const targetValue = h.average_buy_price * (1 + targetPct / 100);

                  return (
                    <div className="mt-4 pt-3.5 border-t border-dark-border/40 space-y-2 select-none">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-500 font-bold uppercase tracking-wider">Profit Target Progress</span>
                        <span className={`font-black ${isNearTarget ? 'text-indigo-400 animate-pulse' : 'text-gray-300'}`}>
                          {roi > 0 ? roi.toFixed(1) : '0.0'}% / {targetPct}%
                        </span>
                      </div>
                      
                      {/* Bar indicator */}
                      <div className="w-full bg-dark-depth-3/60 rounded-full h-1.5 border border-dark-border/40 overflow-hidden relative">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            isNearTarget 
                              ? 'bg-indigo-500 shadow-md shadow-indigo-500/20' 
                              : roi >= targetPct 
                              ? 'bg-emerald-500 shadow-md shadow-emerald-500/20' 
                              : 'bg-brand-500'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      {/* GTT Sell Suggestion Trigger */}
                      {isNearTarget && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('finor-switch-tab', {
                              detail: {
                                tab: 'orders',
                                symbol: h.stock_symbol,
                                action: 'SELL',
                                quantity: h.quantity,
                                price: targetValue.toFixed(2)
                              }
                            }));
                          }}
                          className="w-full py-1.5 px-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-[9px] font-extrabold text-indigo-400 hover:text-indigo-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
                          Target Near! Click to Prefill Sell GTT at ₹{targetValue.toFixed(2)}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Bottom Section: Total Current Value and absolute PNL */}
                <div className="pt-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Current Value</span>
                    <span className="text-base font-extrabold text-white block mt-0.5">
                      ₹{currentVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Net P&L</span>
                    <span className={`text-sm font-bold block mt-0.5 ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {isProfit ? '+' : ''}₹{pl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* AI Mode Toggle Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAiStock({
                      stock: h,
                      roi,
                      holdingDays
                    });
                  }}
                  className="mt-4 w-full py-2.5 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 text-gray-300 hover:text-white transition-all cursor-pointer select-none"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                  AI Conviction Audit
                </button>

              </div>
            );
          })}
        </div>
      )}

        </>
      ) : (
        renderSimulator()
      )}

      {/* CSV Import Modal (Floating Overlay) */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-depth-0/80 backdrop-blur-md">
          <div className="glass-panel w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl border border-dark-border max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-brand-500" />
                <h3 className="text-base font-bold text-white">Import Tradebook CSV</h3>
              </div>
              <button
                onClick={() => {
                  setIsImportOpen(false);
                  setImportResult(null);
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              
              {/* Instructions */}
              <div className="p-4 rounded-xl bg-dark-depth-2/40 border border-dark-border/60 text-xs text-gray-300 leading-relaxed space-y-2">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Zerodha Console Export Format Support
                </p>
                <p>
                  Export your trades directly from your Zerodha Console ledger:
                  <strong> Zerodha Console ➔ Reports ➔ Tradebook ➔ Download CSV</strong>. 
                  Make sure columns like <code className="text-brand-400">symbol</code>, <code className="text-brand-400">trade_type</code>, 
                  <code className="text-brand-400">quantity</code>, and <code className="text-brand-400">price</code> are present.
                </p>
              </div>

              {/* Import Result Screen */}
              {importResult ? (
                <div className="text-center py-6 space-y-4">
                  <div className="inline-flex p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 mb-2">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <h4 className="text-lg font-bold text-white">Import Successful</h4>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                    {importResult.message}
                  </p>
                  <button
                    onClick={() => {
                      setIsImportOpen(false);
                      setImportResult(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs font-semibold text-white transition-all cursor-pointer mt-4"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleImportSubmit} className="space-y-6">
                  
                  {/* File Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-300 block">Select CSV File</label>
                    <div className="border-2 border-dashed border-dark-border hover:border-brand-500/50 rounded-2xl p-8 text-center cursor-pointer transition-all relative">
                      <input
                        type="file"
                        accept=".csv"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <FileSpreadsheet className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                      <p className="text-xs font-semibold text-white">
                        {csvFile ? csvFile.name : 'Click to select or drag and drop'}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-1">CSV files only (.csv)</p>
                    </div>
                  </div>

                  {/* CSV Preview */}
                  {csvPreview && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-300 block">File Preview (First 5 lines)</label>
                      <pre className="p-3.5 rounded-xl bg-dark-depth-0 border border-dark-border text-[10px] text-gray-400 font-mono overflow-x-auto">
                        {csvPreview}
                      </pre>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={importing || !csvFile}
                    className="w-full py-3.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:scale-100 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-700/20"
                  >
                    {importing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Importing Trade Data...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload & Sync Portfolio
                      </>
                    )}
                  </button>

                </form>
              )}

            </div>

          </div>
        </div>
      )}
      {showConfirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-depth-0/85 backdrop-blur-md">
          <div className="glass-panel w-full max-w-sm rounded-3xl p-6 border border-dark-border shadow-2xl flex flex-col items-center text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-3 bg-rose-500/10 text-rose-500 rounded-full border border-rose-500/20">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white font-display">Clear All Portfolio Data?</h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                This action will permanently delete all your trades, holdings, and history. This cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 py-2.5 rounded-xl border border-dark-border text-xs font-bold text-gray-400 hover:text-white hover:bg-dark-depth-2 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeClearAll}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white transition-all cursor-pointer shadow-lg shadow-rose-500/10"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Stock Settings Modal */}
      {editingStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-depth-0/80 backdrop-blur-md">
          <div className="glass-panel w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-dark-border flex flex-col p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-dark-border/40">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Configure Settings: {editingStock.stock_symbol}</h3>
              <button 
                onClick={() => setEditingStock(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4 py-2">
              {/* Position Tag Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Position Tag</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditTag('TRADING')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      editTag === 'TRADING'
                        ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-700/10'
                        : 'bg-dark-depth-2 border-dark-border text-gray-400 hover:text-white'
                    }`}
                  >
                    📈 Trading
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTag('CORE_HOLD')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      editTag === 'CORE_HOLD'
                        ? 'bg-amber-600/20 border-amber-500/40 text-amber-500 shadow-lg shadow-amber-500/5'
                        : 'bg-dark-depth-2 border-dark-border text-gray-400 hover:text-white'
                    }`}
                  >
                    ⭐ Core Hold
                  </button>
                </div>
              </div>

              {/* Stop-Loss Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Stop-Loss Price (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 1500.00 (leave blank to unset)"
                  value={editStoploss}
                  onChange={(e) => setEditStoploss(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 transition-all placeholder:text-gray-500"
                />
                <span className="text-[9px] text-gray-500 leading-relaxed block">
                  Used for panic sell detection. Buy Avg is ₹{editingStock.average_buy_price.toFixed(2)}.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setEditingStock(null)}
                className="flex-1 py-2.5 rounded-xl border border-dark-border text-xs font-bold text-gray-400 hover:text-white hover:bg-dark-depth-2 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editingStock) return;
                  setSavingSettings(true);
                  try {
                    const stoplossVal = editStoploss === '' ? null : parseFloat(editStoploss);
                    await apiRequest('/holdings/settings', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        symbol: editingStock.stock_symbol,
                        stoploss_price: stoplossVal,
                        position_tag: editTag
                      })
                    });
                    setStockSettings(prev => ({
                      ...prev,
                      [editingStock.stock_symbol]: {
                        stoploss_price: stoplossVal,
                        position_tag: editTag
                      }
                    }));
                    // Re-fetch consider exits to update warnings
                    const insights = await apiRequest('/analytics/insights?viewMode=ALL_TIME');
                    setConsiderExits(insights.considerExits || []);
                    setEditingStock(null);
                  } catch (err: any) {
                    console.error("Save settings failed:", err);
                    triggerAlert('error', 'Update Failed', err.message || 'Failed to save settings.');
                  } finally {
                    setSavingSettings(false);
                  }
                }}
                disabled={savingSettings}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {savingSettings && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Conviction Modal Overlay */}
      {selectedAiStock && (
        <AiConvictionModal
          stock={selectedAiStock.stock}
          roi={selectedAiStock.roi}
          holdingDays={selectedAiStock.holdingDays}
          onClose={() => setSelectedAiStock(null)}
        />
      )}

      {/* ─── Quick Add Trade Modal ─── */}
      {isAddTradeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsAddTradeOpen(false); }}
        >
          <div
            className="relative w-full max-w-md rounded-3xl border border-dark-border bg-dark-depth-1 shadow-2xl overflow-hidden"
            style={{ animation: 'scaleIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-dark-border">
              <div>
                <h2 className="text-base font-extrabold text-white tracking-tight">Add Trade</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Log a single buy or sell transaction instantly</p>
              </div>
              <button onClick={() => setIsAddTradeOpen(false)} className="p-2 rounded-xl hover:bg-dark-depth-2 text-gray-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-dark-depth-2/60 border border-dark-border">
                {(['BUY', 'SELL'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setAddTradeType(t)}
                    className={`py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                      addTradeType === t
                        ? t === 'BUY' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' : 'bg-rose-600 text-white shadow-lg shadow-rose-900/30'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >{t}</button>
                ))}
              </div>
              <div className="space-y-1.5 relative">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Stock Symbol (NSE)</label>
                <input 
                  type="text" 
                  value={addTradeSymbol} 
                  onChange={e => setAddTradeSymbol(e.target.value.toUpperCase())} 
                  onFocus={() => setShowAddTradeSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowAddTradeSuggestions(false), 200)}
                  placeholder="e.g. HAL, NATIONALUM, DABUR" 
                  className="w-full px-4 py-3 rounded-xl bg-dark-depth-2/60 border border-dark-border text-sm font-semibold text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500 transition-colors" 
                />
                
                {/* Autocomplete / Symbol Suggestions */}
                {showAddTradeSuggestions && (() => {
                  const POPULAR_SYMBOLS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'LICI', 'ITC', 'LT', 'NATIONALUM'];
                  const uniqueTradedSymbols = [...new Set([
                    ...holdings.map(h => h.stock_symbol),
                    ...trades.map(t => t.stock_symbol),
                    ...POPULAR_SYMBOLS
                  ])];
                  const filteredSymbols = uniqueTradedSymbols
                    .filter(s => s.toLowerCase().includes(addTradeSymbol.toLowerCase()))
                    .slice(0, 6);

                  if (filteredSymbols.length === 0) return null;

                  return (
                    <div className="absolute left-0 right-0 mt-1 bg-dark-depth-2 border border-dark-border rounded-xl shadow-2xl z-30 overflow-hidden max-h-48 overflow-y-auto thin-scrollbar">
                      <div className="divide-y divide-dark-border/20">
                        {filteredSymbols.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setAddTradeSymbol(s)}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-dark-depth-3/60 text-left text-xs font-semibold text-white transition-colors cursor-pointer"
                          >
                            <span>{s}</span>
                            {holdings.some(h => h.stock_symbol === s) && (
                              <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/10 text-emerald-500">
                                Holding
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Quantity</label>
                  <input type="number" min="1" value={addTradeQty} onChange={e => setAddTradeQty(e.target.value)} placeholder="e.g. 10" className="w-full px-4 py-3 rounded-xl bg-dark-depth-2/60 border border-dark-border text-sm font-semibold text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500 transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Price (₹)</label>
                  <input type="number" min="0.01" step="0.01" value={addTradePrice} onChange={e => setAddTradePrice(e.target.value)} placeholder="e.g. 4250.50" className="w-full px-4 py-3 rounded-xl bg-dark-depth-2/60 border border-dark-border text-sm font-semibold text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500 transition-colors" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Trade Date</label>
                <input type="date" value={addTradeDate} onChange={e => setAddTradeDate(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-depth-2/60 border border-dark-border text-sm font-semibold text-white focus:outline-none focus:border-brand-500 transition-colors" />
              </div>
              {addTradeSymbol && addTradeQty && addTradePrice && (
                <div className={`p-3 rounded-xl text-xs font-semibold border ${addTradeType === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                  {addTradeType === 'BUY' ? '📈 Buying' : '📉 Selling'} <strong>{addTradeQty}</strong> shares of <strong>{addTradeSymbol}</strong> at <strong>₹{Number(addTradePrice).toLocaleString('en-IN')}</strong> — Total: <strong>₹{(Number(addTradeQty) * Number(addTradePrice)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
                </div>
              )}
              {addTradeResult && (
                <div className={`p-3 rounded-xl text-xs font-semibold border ${addTradeResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                  {addTradeResult.message}
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setIsAddTradeOpen(false)} className="flex-1 py-3 rounded-xl border border-dark-border text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:bg-dark-depth-2 transition-all cursor-pointer">Cancel</button>
              <button onClick={handleAddTrade} disabled={addTradeLoading || !addTradeSymbol || !addTradeQty || !addTradePrice} className={`flex-1 py-3 rounded-xl text-xs font-extrabold uppercase tracking-wider text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${addTradeType === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'}`}>
                {addTradeLoading ? 'Processing...' : `Confirm ${addTradeType}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Dialog Popup */}
      <CustomAlertModal
        isOpen={alertOpen}
        type={alertType}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertOpen(false)}
      />

    </div>
  );
};

// ==========================================
// Helper Sub-components: AI Conviction Modal
// ==========================================

interface AiConvictionData {
  score: number;
  label: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  news_impact: string;
  performance_audit: string;
  technical_outlook: string;
  coach_advice: string;
}

const AiConvictionModal = ({ 
  stock, 
  roi, 
  holdingDays, 
  onClose 
}: { 
  stock: any; 
  roi: number; 
  holdingDays: number; 
  onClose: () => void 
}) => {
  const [data, setData] = useState<AiConvictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsAnimating(true);

    const loadSentiment = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest('/holdings/sentiment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: stock.stock_symbol })
        });
        setData(response);
      } catch (err: any) {
        console.error('Failed to load AI sentiment:', err);
        setError(err.message || 'Failed to analyze stock sentiment.');
      } finally {
        setLoading(false);
      }
    };

    loadSentiment();
  }, [stock.stock_symbol]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 250);
  };

  const score = data?.score ?? 50;
  const label = data?.label ?? 'NEUTRAL';
  const newsImpact = data?.news_impact ?? '';
  const performanceAudit = data?.performance_audit ?? '';
  const technicalOutlook = data?.technical_outlook ?? '';
  const coachAdvice = data?.coach_advice ?? '';

  let color = '#f59e0b'; // Amber
  let badgeClass = 'text-amber-500 bg-amber-500/10 border-amber-500/20';
  let textGrad = 'from-amber-400 to-yellow-500';
  
  if (label === 'BEARISH') {
    color = '#ef4444'; // Red
    badgeClass = 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    textGrad = 'from-rose-400 to-red-500';
  } else if (label === 'BULLISH') {
    color = '#10b981'; // Green
    badgeClass = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    textGrad = 'from-emerald-400 to-teal-500';
  }

  const radius = 32;
  const strokeWidth = 6;
  const circumference = Math.PI * radius; // Half circle circumference
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-depth-0/80 backdrop-blur-md transition-opacity duration-300">
      <div 
        className="absolute inset-0 bg-transparent" 
        onClick={handleClose} 
      />
      <div className={`glass-panel w-full max-w-lg max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl border border-dark-border flex flex-col transition-all duration-300 transform ${
        isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      }`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-500 animate-pulse" />
            <div>
              <h3 className="text-base font-extrabold text-white uppercase tracking-wider font-display">AI Conviction Audit</h3>
              <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Gemini GenAI & News Core Evaluator</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-dark-depth-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 scrollbar-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-4 border-brand-500/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest animate-pulse">Running Deep Conviction Audit...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 flex gap-3 text-xs text-rose-500 items-start">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <span className="font-extrabold block uppercase tracking-wider">Analysis Failed</span>
                <span className="font-medium mt-1 block">{error}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Score and Gauge Card */}
              <div className="flex items-center justify-center gap-8 bg-dark-depth-2/40 p-5 rounded-2xl border border-dark-border/40">
                {/* SVG Half Donut */}
                <div className="relative w-28 h-14 overflow-hidden select-none shrink-0">
                  <svg className="w-28 h-28 -rotate-180" viewBox="0 0 80 80">
                    <path
                      d="M 12 40 A 28 28 0 0 1 68 40"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.05)"
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                    />
                    <path
                      d="M 12 40 A 28 28 0 0 1 68 40"
                      fill="none"
                      stroke={color}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      className="transition-all duration-1000 ease-out"
                      style={{ filter: `drop-shadow(0 0 6px ${color}50)` }}
                    />
                  </svg>
                  <div className="absolute bottom-0 inset-x-0 text-center font-black text-white text-lg">
                    {score}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-black text-white tracking-wide">{stock.stock_symbol}</span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${badgeClass} uppercase tracking-wider`}>
                      {label}
                    </span>
                  </div>
                  <div className={`text-md font-extrabold bg-gradient-to-r ${textGrad} bg-clip-text text-transparent mt-1 font-display`}>
                    {score >= 71 ? 'Accumulate / Long-Term Buy' : score >= 41 ? 'Hold / Neutral Range' : 'Trim / Caution Recommended'}
                  </div>
                  <div className="text-[10px] text-gray-500 font-semibold mt-1">
                    Current P&L: <span className={roi >= 0 ? 'text-emerald-500 font-extrabold' : 'text-rose-500 font-extrabold'}>{roi >= 0 ? '+' : ''}{roi.toFixed(2)}%</span> • Held {holdingDays} days
                  </div>
                </div>
              </div>

              {/* Detailed convictions */}
              <div className="space-y-4 text-xs">
                {/* News impact */}
                <div className="space-y-1.5 pl-0.5">
                  <h4 className="font-extrabold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    News & Corporate Action Impact
                  </h4>
                  <p className="text-[11px] text-gray-400 leading-relaxed pl-3 font-medium">
                    {newsImpact}
                  </p>
                </div>

                {/* Performance audit */}
                <div className="space-y-1.5 pl-0.5">
                  <h4 className="font-extrabold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    Past Trade Performance & Current P&L Audit
                  </h4>
                  <p className="text-[11px] text-gray-400 leading-relaxed pl-3 font-medium">
                    {performanceAudit}
                  </p>
                </div>

                {/* Technical outlook */}
                <div className="space-y-1.5 pl-0.5">
                  <h4 className="font-extrabold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    Technical & Fundamental Outlook
                  </h4>
                  <p className="text-[11px] text-gray-400 leading-relaxed pl-3 font-medium">
                    {technicalOutlook}
                  </p>
                </div>
              </div>

              {/* Coach Advice alert block */}
              <div className="p-4 rounded-2xl bg-dark-depth-2/40 border border-dark-border/40 relative overflow-hidden">
                <div className="absolute top-0 bottom-0 left-0 w-1" style={{ backgroundColor: color }} />
                <span className="text-[9px] text-gray-500 uppercase font-black tracking-widest block mb-1">AI Coach's Actionable Rule</span>
                <p className="text-[11px] text-gray-300 leading-relaxed font-semibold pl-0.5">
                  "{coachAdvice}"
                </p>
              </div>
            </div>
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

