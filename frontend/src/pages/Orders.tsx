import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { 
  FileText, 
  Search, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  X, 
  Plus, 
  Minus, 
  CheckCircle,
  HelpCircle,
  Clock,
  Trash2,
  Activity
} from 'lucide-react';

interface OrderConfig {
  status: 'CONNECTED' | 'DISCONNECTED' | 'MOCK_MODE';
  broker: string;
  login_url?: string;
  message: string;
}

interface BrokerOrder {
  id: string;
  stock_symbol: string;
  transaction_type: 'BUY' | 'SELL';
  order_type: 'LIMIT' | 'MARKET';
  quantity: number;
  price: number;
  status: 'OPEN' | 'COMPLETE' | 'CANCELLED' | 'REJECTED';
  broker_order_id: string;
  created_at: string;
}

interface GttTrigger {
  id: string;
  gtt_id: string;
  stock_symbol: string;
  trigger_type: 'SINGLE' | 'OCO';
  trigger_price_1: number;
  trigger_price_2: number | null;
  quantity: number;
  status: 'ACTIVE' | 'TRIGGERED' | 'CANCELLED';
  created_at: string;
}

interface Holding {
  stock_symbol: string;
  quantity: number;
  average_buy_price: number;
  ltp: number | null;
}

const POPULAR_SYMBOLS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'TATASTEEL', 'ITC'];

export const Orders = () => {
  // Config & Session State
  const [config, setConfig] = useState<OrderConfig>({ status: 'MOCK_MODE', broker: 'zerodha', message: '' });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [syncingMock, setSyncingMock] = useState(false);

  // Form Fields
  const [symbol, setSymbol] = useState('');
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'GTT_SINGLE' | 'GTT_OCO'>('MARKET');
  const [quantity, setQuantity] = useState<number>(10);
  const [price, setPrice] = useState<string>('');
  const [triggerPrice1, setTriggerPrice1] = useState<string>('');
  const [triggerPrice2, setTriggerPrice2] = useState<string>('');
  
  // Search state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ltp, setLtp] = useState<number | null>(null);
  const [fetchingLtp, setFetchingLtp] = useState(false);

  // Data lists
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [orders, setOrders] = useState<BrokerOrder[]>([]);
  const [gtts, setGtts] = useState<GttTrigger[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [showConfirmClearHistory, setShowConfirmClearHistory] = useState(false);

  // UI state
  const [listTab, setListTab] = useState<'active' | 'completed' | 'gtt'>('active');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Fetch session config and data lists
  const fetchConfig = async () => {
    try {
      const data = await apiRequest('/orders/config');
      setConfig(data);
    } catch (err: any) {
      console.error('Failed to load order config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  const fetchLists = async () => {
    setLoadingLists(true);
    try {
      // Fetch holdings for sell limits / auto-fill helpers
      const holdingsData = await apiRequest('/holdings');
      setHoldings(holdingsData || []);

      // Fetch regular orders
      const ordResult = await apiRequest('/orders/live');
      setOrders(ordResult.orders || []);

      // Fetch GTT triggers
      const gttResult = await apiRequest('/orders/gtt/live');
      setGtts(gttResult.gtts || []);

      // Fetch trades history
      const tradesData = await apiRequest('/trades');
      setTrades(tradesData || []);
    } catch (err: any) {
      console.error('Failed to load orders/gtts/trades lists:', err);
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => {
    // 1. Check if we returned from Zerodha connection with request_token
    const urlParams = new URLSearchParams(window.location.search);
    const requestToken = urlParams.get('request_token');

    const initAuthAndConfig = async () => {
      setLoadingConfig(true);
      if (requestToken) {
        try {
          await apiRequest('/orders/kite/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_token: requestToken })
          });
          setSuccess('Zerodha account connected successfully!');
          // Clear query parameters
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err: any) {
          setError(err.message || 'Failed to exchange Zerodha request token.');
        }
      }
      await fetchConfig();
      await fetchLists();
    };

    initAuthAndConfig();
  }, []);

  // Sync LTP when symbol changes
  useEffect(() => {
    if (!symbol) {
      setLtp(null);
      return;
    }

    const fetchLtp = async () => {
      setFetchingLtp(true);
      try {
        const symbolUpper = symbol.toUpperCase().trim();
        const res = await apiRequest(`/holdings/ltp/${symbolUpper}`);
        if (res && res.ltp) {
          setLtp(res.ltp);
        } else {
          setLtp(null);
        }
      } catch (err) {
        console.error('LTP fetch failed:', err);
        setLtp(null);
      } finally {
        setFetchingLtp(false);
      }
    };

    // Debounce LTP lookup
    const timer = setTimeout(() => {
      fetchLtp();
    }, 800);

    return () => clearTimeout(timer);
  }, [symbol]);

  // Handle Quick Select Stocks
  const selectSymbol = (sym: string) => {
    setSymbol(sym);
    setShowSuggestions(false);
    
    // Attempt to lookup default price if it is in holdings
    const holdItem = holdings.find(h => h.stock_symbol === sym);
    if (holdItem?.ltp) {
      setLtp(holdItem.ltp);
      if (orderType === 'LIMIT' && !price) setPrice(holdItem.ltp.toString());
    }
  };

  // Simulated Mock Price Execution Sync
  const handleMockSync = async () => {
    setSyncingMock(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiRequest('/orders/sync-mock', { method: 'POST' });
      if (res.executedCount > 0) {
        setSuccess(res.message);
        await fetchLists();
      } else {
        setSuccess('Market simulation checked. No open mock orders/GTT triggers hit their price boundary.');
      }
    } catch (err: any) {
      setError(err.message || 'Mock trigger sync failed.');
    } finally {
      setSyncingMock(false);
    }
  };

  // Submit Order Execution
  const handlePlaceOrder = async () => {
    setSubmittingOrder(true);
    setError(null);
    setSuccess(null);
    try {
      const isGtt = orderType === 'GTT_SINGLE' || orderType === 'GTT_OCO';
      
      let endpoint = '/orders/place';
      let body: any = {
        stock_symbol: symbol.toUpperCase().trim(),
        quantity: quantity,
      };

      if (isGtt) {
        endpoint = '/orders/gtt/place';
        body.trigger_type = orderType === 'GTT_OCO' ? 'OCO' : 'SINGLE';
        body.trigger_price_1 = parseFloat(triggerPrice1);
        if (orderType === 'GTT_OCO') {
          body.trigger_price_2 = parseFloat(triggerPrice2);
        }
        body.transaction_type = action;
      } else {
        body.transaction_type = action;
        body.order_type = orderType;
        body.price = orderType === 'LIMIT' ? parseFloat(price) : 0;
      }

      const res = await apiRequest(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      setSuccess(res.message);
      setShowConfirm(false);
      
      // Reset form
      setSymbol('');
      setPrice('');
      setTriggerPrice1('');
      setTriggerPrice2('');
      
      // Refresh list
      await fetchLists();
    } catch (err: any) {
      setError(err.message || 'Failed to place order.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Cancel order execution
  const handleCancelOrder = async (orderId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await apiRequest('/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId })
      });
      setSuccess(res.message);
      await fetchLists();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel order.');
    }
  };

  // Cancel GTT trigger
  const handleCancelGtt = async (gttId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await apiRequest('/orders/gtt/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtt_id: gttId })
      });
      setSuccess(res.message);
      await fetchLists();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel GTT.');
    }
  };

  // Clear mock order history
  const handleClearOrderHistory = async () => {
    setShowConfirmClearHistory(false);
    setClearingHistory(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiRequest('/orders/clear-history', { method: 'POST' });
      setSuccess(res.message);
      fetchLists();
    } catch (err: any) {
      console.error('Clear order history failed:', err);
      setError(err.message || 'Failed to clear order history.');
    } finally {
      setClearingHistory(false);
    }
  };

  // Form Validation
  const isFormValid = () => {
    if (!symbol) return false;
    if (quantity <= 0) return false;
    
    if (orderType === 'LIMIT') {
      if (!price || parseFloat(price) <= 0) return false;
    }
    
    if (orderType === 'GTT_SINGLE') {
      if (!triggerPrice1 || parseFloat(triggerPrice1) <= 0) return false;
    }
    
    if (orderType === 'GTT_OCO') {
      if (!triggerPrice1 || parseFloat(triggerPrice1) <= 0) return false;
      if (!triggerPrice2 || parseFloat(triggerPrice2) <= 0) return false;
    }

    return true;
  };

  // Dynamic calculations
  const displayPrice = 
    orderType === 'MARKET' 
      ? (ltp || 100) 
      : (orderType === 'GTT_SINGLE' || orderType === 'GTT_OCO')
      ? (parseFloat(triggerPrice1) || 0)
      : (parseFloat(price) || 0);
  const estimatedValue = quantity * displayPrice;
  const estimatedTaxes = estimatedValue * 0.0006 + 15; // standard simulated brokerage/charges
  const netTotal = estimatedValue + (action === 'BUY' ? estimatedTaxes : -estimatedTaxes);

  // Group list categories
  const activeOrders = orders.filter(o => o.status === 'OPEN');
  const completedOrders = orders.filter(o => o.status !== 'OPEN');

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-white">Stock Trading Terminal</h1>
          <p className="text-xs text-gray-400 mt-1">
            Place GTT triggers and Limit orders. Connect live Zerodha Kite account or use Simulated Paper Trading.
          </p>
        </div>

        {/* Mock sync execution controller */}
        {config.status === 'MOCK_MODE' && (
          <button
            onClick={handleMockSync}
            disabled={syncingMock}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-brand-400 bg-brand-500/10 border border-brand-500/20 hover:bg-brand-500/20 hover:border-brand-500/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {syncingMock ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Simulate Market Check
          </button>
        )}
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm font-medium flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm font-medium flex items-start gap-2.5">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Connection Banner */}
      {loadingConfig ? (
        <div className="glass-panel p-4 rounded-2xl border border-dark-border flex items-center justify-center gap-3">
          <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />
          <span className="text-xs text-gray-400">Verifying broker connection configuration...</span>
        </div>
      ) : (
        <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 ${
          config.status === 'CONNECTED' 
            ? 'bg-emerald-500/5 border-emerald-500/10' 
            : config.status === 'DISCONNECTED'
            ? 'bg-amber-500/5 border-amber-500/10'
            : 'bg-brand-500/5 border-brand-500/10'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border mt-0.5 ${
              config.status === 'CONNECTED' 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                : config.status === 'DISCONNECTED'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                : 'bg-brand-500/10 border-brand-500/20 text-brand-400'
            }`}>
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                {config.status === 'CONNECTED' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                {config.status === 'DISCONNECTED' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                {config.status === 'MOCK_MODE' && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />}
                {config.status === 'CONNECTED' ? 'Zerodha Account Linked' : config.status === 'DISCONNECTED' ? 'Zerodha Session Expired' : 'Paper Trading (Mock Mode)'}
              </h4>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{config.message}</p>
            </div>
          </div>

          {config.status === 'DISCONNECTED' && config.login_url && (
            <a
              href={config.login_url}
              className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-dark-depth-0 hover:bg-amber-400 transition-all text-center"
            >
              Link Account
            </a>
          )}
          
          {config.status === 'MOCK_MODE' && (
            <span className="px-3 py-1 rounded-lg text-[9px] font-extrabold uppercase bg-brand-500/10 border border-brand-500/20 text-brand-400 self-start sm:self-auto">
              Simulated Account
            </span>
          )}
        </div>
      )}

      {/* Main Grid split: Form on Left (or top on mobile), Orders List on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Order Placement Form (width: 5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel rounded-3xl border border-dark-border overflow-hidden">
            
            {/* BUY / SELL Switcher */}
            <div className="flex border-b border-dark-border/40">
              <button
                onClick={() => setAction('BUY')}
                className={`flex-1 py-4 text-xs font-extrabold uppercase transition-all duration-300 border-b-2 cursor-pointer ${
                  action === 'BUY'
                    ? 'text-emerald-500 border-emerald-500 bg-emerald-500/5'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                BUY SHARES
              </button>
              <button
                onClick={() => setAction('SELL')}
                className={`flex-1 py-4 text-xs font-extrabold uppercase transition-all duration-300 border-b-2 cursor-pointer ${
                  action === 'SELL'
                    ? 'text-rose-500 border-rose-500 bg-rose-500/5'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                SELL SHARES
              </button>
            </div>

            <div className="p-6 space-y-5">
              
              {/* Stock Search Input */}
              <div className="space-y-1.5 relative">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Search Stock</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-500 pointer-events-none">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="Enter symbol (e.g. INFY, SBIN)..."
                    value={symbol}
                    onChange={(e) => {
                      setSymbol(e.target.value.toUpperCase());
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all placeholder:text-gray-500"
                  />
                  {symbol && (
                    <button 
                      onClick={() => setSymbol('')}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Autocomplete / Symbol Suggestions */}
                {showSuggestions && (
                  <div className="absolute left-0 right-0 mt-1.5 bg-dark-depth-2 border border-dark-border rounded-xl shadow-2xl z-30 overflow-hidden max-h-56">
                    <div className="p-2 border-b border-dark-border/40 text-[9px] text-gray-500 font-bold uppercase">
                      Quick Select
                    </div>
                    
                    {/* Holdings list */}
                    {holdings.length > 0 && (
                      <div className="divide-y divide-dark-border/20">
                        {holdings.map((h) => (
                          <button
                            key={h.stock_symbol}
                            onClick={() => selectSymbol(h.stock_symbol)}
                            className="w-full flex items-center justify-between px-4 py-2 hover:bg-dark-depth-3/60 text-left text-xs font-semibold text-white transition-colors"
                          >
                            <span>{h.stock_symbol}</span>
                            <span className="text-[10px] text-gray-500 font-medium">{h.quantity} held</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Popular symbols */}
                    <div className="p-3 bg-dark-depth-1/30 flex flex-wrap gap-1.5">
                      {POPULAR_SYMBOLS.map((s) => (
                        <button
                          key={s}
                          onClick={() => selectSymbol(s)}
                          className="px-2.5 py-1 rounded-lg text-[9px] font-bold bg-dark-depth-3 hover:bg-brand-500 hover:text-white border border-dark-border text-gray-300 transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Order Type Segmented Control */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Trigger Type</label>
                <div className="grid grid-cols-4 gap-1 p-1 bg-dark-depth-2 rounded-xl border border-dark-border">
                  {(['MARKET', 'LIMIT', 'GTT_SINGLE', 'GTT_OCO'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOrderType(t)}
                      className={`py-1.5 rounded-lg text-[9px] font-extrabold uppercase transition-all duration-200 cursor-pointer ${
                        orderType === t
                          ? 'bg-brand-500 text-white shadow-md shadow-brand-500/10'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {t === 'GTT_SINGLE' ? 'GTT' : t === 'GTT_OCO' ? 'GTT OCO' : t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Quantity</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-dark-depth-2 border border-dark-border rounded-xl w-32 justify-between px-1 py-1">
                    <button
                      type="button"
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-dark-depth-3 hover:text-white transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 text-center bg-transparent border-none focus:outline-none focus:ring-0 text-white text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(q => q + 1)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-dark-depth-3 hover:text-white transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  {/* Quick select chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 10, 50, 100].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setQuantity(val)}
                        className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                          quantity === val
                            ? 'bg-brand-500/20 border-brand-500/30 text-brand-400'
                            : 'bg-dark-depth-2 border-dark-border text-gray-400 hover:text-white'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Price fields depending on Trigger Type */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Regular Limit Price */}
                {orderType === 'LIMIT' && (
                  <div className="col-span-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Limit Price (₹)</label>
                      {ltp && (
                        <button
                          type="button"
                          onClick={() => setPrice(ltp.toFixed(2))}
                          className="text-[9px] font-extrabold text-brand-400 hover:underline"
                        >
                          Use LTP: ₹{ltp.toFixed(2)}
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.05"
                      placeholder="0.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all"
                    />
                  </div>
                )}

                {/* Market Price helper info */}
                {orderType === 'MARKET' && (
                  <div className="col-span-2 p-3 bg-dark-depth-2/40 border border-dark-border/40 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-gray-400 font-medium">Estimated LTP:</span>
                    {fetchingLtp ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-600" />
                    ) : (
                      <span className="font-extrabold text-white">
                        {ltp ? `₹${ltp.toFixed(2)}` : 'Market Price'}
                      </span>
                    )}
                  </div>
                )}

                {/* GTT Single Trigger */}
                {orderType === 'GTT_SINGLE' && (
                  <div className="col-span-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Trigger Price (₹)</label>
                      {ltp && (
                        <span className="text-[9px] font-bold text-gray-500">Current LTP: ₹{ltp.toFixed(2)}</span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.05"
                      placeholder="Trigger boundary..."
                      value={triggerPrice1}
                      onChange={(e) => setTriggerPrice1(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all"
                    />
                  </div>
                )}

                {/* GTT OCO triggers */}
                {orderType === 'GTT_OCO' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Target Trigger (₹)</label>
                      <input
                        type="number"
                        step="0.05"
                        placeholder="Profit Target..."
                        value={triggerPrice1}
                        onChange={(e) => setTriggerPrice1(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Stoploss Trigger (₹)</label>
                      <input
                        type="number"
                        step="0.05"
                        placeholder="Stoploss Limit..."
                        value={triggerPrice2}
                        onChange={(e) => setTriggerPrice2(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all"
                      />
                    </div>
                  </>
                )}

              </div>

              {/* live estimation summary */}
              {isFormValid() && (
                <div className="p-4 rounded-2xl bg-dark-depth-1/40 border border-dark-border/40 text-xs space-y-2 select-none">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Order Value:</span>
                    <span className="font-bold text-white">₹{estimatedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Charges & Taxes:</span>
                    <span className="font-bold text-gray-300">₹{estimatedTaxes.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-dark-border/20">
                    <span className="text-gray-400 font-medium">{action === 'BUY' ? 'Total Cost:' : 'Estimated Proceeds:'}</span>
                    <span className={`font-extrabold text-sm ${action === 'BUY' ? 'text-brand-400' : 'text-emerald-500'}`}>
                      ₹{netTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {/* Pre-Trade Risk Audit Card */}
              {symbol && isFormValid() && (() => {
                const symbolUpper = symbol.toUpperCase().trim();
                const totalPortfolioVal = holdings.reduce((sum, h) => sum + (h.quantity * (h.ltp || h.average_buy_price)), 0);
                
                // Estimate price of the trade
                const activePrice = parseFloat(triggerPrice1) || parseFloat(price) || ltp || 0;
                const orderValue = (quantity || 0) * activePrice;
                const allocationPct = totalPortfolioVal > 0 ? (orderValue / totalPortfolioVal) * 100 : 0;
                
                // Past performance stats for this ticker
                const stockTrades = trades.filter(t => t.stock_symbol.toUpperCase() === symbolUpper);
                let stockStats = null;
                if (stockTrades.length > 0) {
                  let buyQty = 0;
                  let buyCost = 0;
                  let realizedPnL = 0;
                  let completedCount = 0;
                  let winCount = 0;
                  
                  const sorted = [...stockTrades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime());
                  sorted.forEach(t => {
                    const type = t.trade_type.toUpperCase();
                    const qty = Number(t.quantity);
                    const prc = Number(t.price);
                    if (type === 'BUY' || type === 'B') {
                      buyQty += qty;
                      buyCost += qty * prc;
                    } else if (type === 'SELL' || type === 'S') {
                      if (buyQty > 0) {
                        const avgBuy = buyCost / buyQty;
                        const sellQty = Math.min(qty, buyQty);
                        const pnl = sellQty * (prc - avgBuy);
                        realizedPnL += pnl;
                        completedCount++;
                        if (pnl > 0) winCount++;
                        buyQty -= sellQty;
                        buyCost = buyQty * avgBuy;
                      }
                    }
                  });
                  const winRate = completedCount > 0 ? (winCount / completedCount) * 100 : 0;
                  stockStats = { realizedPnL, completedCount, winRate };
                }

                // Exposure Warnings
                const isOverAllocation = allocationPct > 8;
                const matchingHolding = holdings.find(h => h.stock_symbol === symbolUpper);

                return (
                  <div className="p-4 rounded-2xl bg-dark-depth-2/40 border border-dark-border/40 text-[10px] font-bold space-y-3 animate-in fade-in slide-in-from-top-2 duration-300 select-none">
                    <div className="flex items-center justify-between border-b border-dark-border/20 pb-1.5">
                      <span className="text-gray-400 font-extrabold uppercase tracking-wide flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-indigo-400" />
                        Finor Pre-Trade Risk Audit
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-2 rounded-xl bg-dark-depth-2/60 border border-dark-border/40">
                        <span className="text-gray-500 block uppercase text-[8px] tracking-wide mb-0.5">Capital Weight</span>
                        <span className={`text-xs font-black ${isOverAllocation ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                          {allocationPct.toFixed(1)}% of Portfolio
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-dark-depth-2/60 border border-dark-border/40">
                        <span className="text-gray-500 block uppercase text-[8px] tracking-wide mb-0.5">Exposure Status</span>
                        <span className={`text-xs font-black ${isOverAllocation ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                          {isOverAllocation ? '⚠️ Over-Allocated (>8%)' : '🟢 Safe Size (≤8%)'}
                        </span>
                      </div>
                    </div>

                    {matchingHolding && (
                      <div className="p-2.5 bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl leading-relaxed">
                        ⚠️ You already own **{matchingHolding.quantity} shares** of {symbolUpper} at avg. cost **₹{matchingHolding.average_buy_price.toFixed(2)}**. 
                        {action === 'BUY' ? ' Buying more will average your entry price.' : ' Selling will decrease your position size.'}
                      </div>
                    )}

                    {stockStats && stockStats.completedCount > 0 && (
                      <div className="p-2.5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl leading-relaxed text-indigo-400 space-y-1">
                        <span className="text-[8px] text-indigo-300 font-black uppercase tracking-wider block">Past Performance Capsule</span>
                        <div className="flex justify-between">
                          <span>Realized P&L on {symbolUpper}:</span>
                          <span className={`font-black ${stockStats.realizedPnL >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                            ₹{stockStats.realizedPnL.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Win Rate ({stockStats.completedCount} trades):</span>
                          <span className="font-black text-white">{stockStats.winRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Submit Trigger */}
              <button
                type="button"
                disabled={!isFormValid()}
                onClick={() => setShowConfirm(true)}
                className={`w-full py-3 rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-all duration-300 cursor-pointer shadow-lg ${
                  !isFormValid()
                    ? 'bg-dark-depth-2 text-gray-600 border border-dark-border/40 cursor-not-allowed'
                    : action === 'BUY'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-dark-depth-0 shadow-emerald-500/10'
                    : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/10'
                }`}
              >
                PLACE {action} ORDER
              </button>

            </div>
          </div>
        </div>

        {/* Right column: Active Orders & GTT lists (width: 7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-panel rounded-3xl border border-dark-border overflow-hidden min-h-[450px] flex flex-col">
            
            {/* List Header Selector Tabs */}
            <div className="flex border-b border-dark-border/40 bg-dark-depth-1/30 px-6 py-2 items-center justify-between flex-wrap gap-4">
              <div className="flex gap-4">
                <button
                  onClick={() => setListTab('active')}
                  className={`py-3 text-xs font-bold relative transition-colors cursor-pointer ${
                    listTab === 'active' ? 'text-brand-400' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Active Orders ({activeOrders.length})
                  {listTab === 'active' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />}
                </button>
                <button
                  onClick={() => setListTab('completed')}
                  className={`py-3 text-xs font-bold relative transition-colors cursor-pointer ${
                    listTab === 'completed' ? 'text-brand-400' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Completed Orders ({completedOrders.length})
                  {listTab === 'completed' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />}
                </button>
                <button
                  onClick={() => setListTab('gtt')}
                  className={`py-3 text-xs font-bold relative transition-colors cursor-pointer ${
                    listTab === 'gtt' ? 'text-brand-400' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  GTT triggers ({gtts.filter(g => g.status === 'ACTIVE').length})
                  {listTab === 'gtt' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />}
                </button>
              </div>

              {/* Quick actions and refresh button */}
              <div className="flex items-center gap-2">
                {listTab === 'completed' && completedOrders.length > 0 && (
                  <button
                    onClick={() => setShowConfirmClearHistory(true)}
                    disabled={clearingHistory}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 text-rose-500 text-[10px] font-bold uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear History</span>
                  </button>
                )}
                
                <button
                  onClick={fetchLists}
                  disabled={loadingLists}
                  className="p-2 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${loadingLists ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* List Body */}
            <div className="flex-1 p-6">
              {loadingLists ? (
                <div className="flex flex-col items-center justify-center py-20 text-xs text-gray-500 gap-3">
                  <Loader2 className="w-7 h-7 text-brand-500 animate-spin" />
                  <span>Fetching active ledger states...</span>
                </div>
              ) : listTab === 'active' && activeOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center select-none text-xs text-gray-500 max-w-xs mx-auto gap-3.5">
                  <Clock className="w-10 h-10 text-gray-700" />
                  <div>
                    <h5 className="font-bold text-white">No Open Limit Orders</h5>
                    <p className="mt-1 leading-relaxed">Regular limit buy or sell transactions waiting to hit a target price boundary will be listed here.</p>
                  </div>
                </div>
              ) : listTab === 'completed' && completedOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center select-none text-xs text-gray-500 max-w-xs mx-auto gap-3.5">
                  <CheckCircle className="w-10 h-10 text-gray-700" />
                  <div>
                    <h5 className="font-bold text-white">No Completed Orders Today</h5>
                    <p className="mt-1 leading-relaxed">Transactions that filled or were canceled during the current calendar session will accumulate here.</p>
                  </div>
                </div>
              ) : listTab === 'gtt' && gtts.filter(g => g.status === 'ACTIVE').length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center select-none text-xs text-gray-500 max-w-xs mx-auto gap-3.5">
                  <HelpCircle className="w-10 h-10 text-gray-700" />
                  <div>
                    <h5 className="font-bold text-white">No Active GTT Triggers</h5>
                    <p className="mt-1 leading-relaxed">Good-Till-Triggered long-term profit target / stoploss orders are set up here.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  
                  {/* Active Orders List */}
                  {listTab === 'active' && activeOrders.map((ord) => (
                    <div key={ord.id} className="glass-panel rounded-2xl p-4 border border-dark-border flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-white tracking-tight">{ord.stock_symbol}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            ord.transaction_type === 'BUY'
                              ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-500'
                              : 'bg-rose-500/10 border-rose-500/10 text-rose-500'
                          }`}>
                            {ord.transaction_type}
                          </span>
                          <span className="text-[9px] text-gray-400 font-bold bg-dark-depth-2 px-1.5 py-0.5 rounded border border-dark-border">
                            {ord.order_type}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 font-medium">
                          Qty: <span className="text-white font-bold">{ord.quantity}</span> shares <span className="text-gray-600">•</span> Limit Price: <span className="text-white font-bold">₹{ord.price.toFixed(2)}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => handleCancelOrder(ord.broker_order_id)}
                        className="flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 rounded-xl px-3 py-1.5 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                  ))}

                  {/* Completed Orders List */}
                  {listTab === 'completed' && completedOrders.map((ord) => (
                    <div key={ord.id} className="glass-panel rounded-2xl p-4 border border-dark-border/40 flex items-center justify-between gap-4 select-none opacity-80">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-white tracking-tight">{ord.stock_symbol}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            ord.transaction_type === 'BUY'
                              ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-500'
                              : 'bg-rose-500/10 border-rose-500/10 text-rose-500'
                          }`}>
                            {ord.transaction_type}
                          </span>
                          <span className="text-[9px] text-gray-500 font-semibold uppercase">{ord.order_type}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 font-medium">
                          Qty: <span className="text-gray-300 font-semibold">{ord.quantity}</span> shares <span className="text-gray-600">•</span> Price: <span className="text-gray-300 font-semibold">₹{ord.price.toFixed(2)}</span>
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        ord.status === 'COMPLETE'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : ord.status === 'CANCELLED'
                          ? 'bg-gray-500/10 text-gray-400'
                          : 'bg-rose-500/10 text-rose-500'
                      }`}>
                        {ord.status}
                      </span>
                    </div>
                  ))}

                  {/* GTT Triggers List */}
                  {listTab === 'gtt' && gtts.filter(g => g.status === 'ACTIVE').map((gtt) => (
                    <div key={gtt.id} className="glass-panel rounded-2xl p-4 border border-dark-border flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-white tracking-tight">{gtt.stock_symbol}</span>
                          <span className="text-[9px] text-brand-400 font-bold bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20">
                            GTT {gtt.trigger_type}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-2 font-medium space-y-1">
                          <p>Qty: <span className="text-white font-bold">{gtt.quantity}</span> shares</p>
                          <p>
                            Trigger 1 (Target): <span className="text-white font-bold">₹{gtt.trigger_price_1.toFixed(2)}</span>
                            {gtt.trigger_price_2 && (
                              <> <span className="text-gray-600">•</span> Trigger 2 (SL): <span className="text-white font-bold">₹{gtt.trigger_price_2.toFixed(2)}</span></>
                            )}
                          </p>
                        </div>
                      </div>
                      
                      {gtt.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handleCancelGtt(gtt.gtt_id)}
                          className="flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 rounded-xl px-3 py-1.5 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      ) : (
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          gtt.status === 'TRIGGERED'
                            ? 'bg-amber-500/10 text-amber-500'
                            : 'bg-gray-500/10 text-gray-400'
                        }`}>
                          {gtt.status}
                        </span>
                      )}
                    </div>
                  ))}

                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Confirmation Slide-in Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-dark-depth-0/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-panel max-w-sm w-full rounded-3xl border border-dark-border p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
              <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">Confirm Order</h3>
              <button 
                onClick={() => setShowConfirm(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-dark-border/20 pb-2">
                <span className="text-gray-400 text-xs font-medium">Stock Symbol:</span>
                <span className="font-extrabold text-sm text-white">{symbol.toUpperCase()}</span>
              </div>
              <div className="flex items-center justify-between border-b border-dark-border/20 pb-2">
                <span className="text-gray-400 text-xs font-medium">Action:</span>
                <span className={`text-xs font-extrabold px-2 py-0.5 rounded border ${
                  orderType === 'GTT_SINGLE' || orderType === 'GTT_OCO'
                    ? 'bg-brand-500/10 border-brand-500/10 text-brand-400'
                    : action === 'BUY'
                    ? 'bg-emerald-500/10 border-emerald-500/10 text-emerald-500'
                    : 'bg-rose-500/10 border-rose-500/10 text-rose-500'
                }`}>
                  {orderType === 'GTT_SINGLE' || orderType === 'GTT_OCO' ? 'GTT TRIGGER' : action}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-dark-border/20 pb-2">
                <span className="text-gray-400 text-xs font-medium">Order Type:</span>
                <span className="font-bold text-xs text-white">{orderType}</span>
              </div>
              <div className="flex items-center justify-between border-b border-dark-border/20 pb-2">
                <span className="text-gray-400 text-xs font-medium">Quantity:</span>
                <span className="font-extrabold text-xs text-white">{quantity} shares</span>
              </div>
              
              {orderType === 'LIMIT' && (
                <div className="flex items-center justify-between border-b border-dark-border/20 pb-2">
                  <span className="text-gray-400 text-xs font-medium">Limit Price:</span>
                  <span className="font-extrabold text-xs text-white">₹{parseFloat(price).toFixed(2)}</span>
                </div>
              )}

              {(orderType === 'GTT_SINGLE' || orderType === 'GTT_OCO') && (
                <div className="flex items-center justify-between border-b border-dark-border/20 pb-2">
                  <span className="text-gray-400 text-xs font-medium">Target Trigger:</span>
                  <span className="font-extrabold text-xs text-white">₹{parseFloat(triggerPrice1).toFixed(2)}</span>
                </div>
              )}

              {orderType === 'GTT_OCO' && triggerPrice2 && (
                <div className="flex items-center justify-between border-b border-dark-border/20 pb-2">
                  <span className="text-gray-400 text-xs font-medium">Stoploss Trigger:</span>
                  <span className="font-extrabold text-xs text-white">₹{parseFloat(triggerPrice2).toFixed(2)}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-gray-400 text-xs font-medium">Estimated Value:</span>
                <span className="font-extrabold text-sm text-brand-400">
                  ₹{estimatedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-dark-border text-xs font-bold text-gray-400 hover:text-white hover:bg-dark-depth-2 transition-all cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={submittingOrder}
                className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold uppercase transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  action === 'BUY'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-dark-depth-0'
                    : 'bg-rose-500 hover:bg-rose-400 text-white'
                }`}
              >
                {submittingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Confirm {action === 'BUY' ? 'Buy' : 'Sell'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Clear Order History Confirmation Modal */}
      {showConfirmClearHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-depth-0/85 backdrop-blur-md">
          <div className="glass-panel w-full max-w-sm rounded-3xl p-6 border border-dark-border shadow-2xl flex flex-col items-center text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-3 bg-rose-500/10 text-rose-500 rounded-full border border-rose-500/20">
              <Trash2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white font-display">Clear Order History?</h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                This will delete your completed, cancelled, and rejected mock order records. Active open limit orders and holdings will be preserved.
              </p>
            </div>
            <div className="flex items-center gap-3 w-full">
              <button
                onClick={() => setShowConfirmClearHistory(false)}
                className="flex-1 py-2.5 rounded-xl border border-dark-border text-xs font-bold text-gray-400 hover:text-white hover:bg-dark-depth-2 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearOrderHistory}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white transition-all cursor-pointer shadow-lg shadow-rose-500/10"
              >
                Yes, Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
