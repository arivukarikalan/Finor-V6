import React from 'react';
import { 
  LayoutDashboard, 
  Briefcase, 
  FileText, 
  BarChart3, 
  Grid,
  LogOut,
  User,
  Brain,
  Sun,
  Moon,
  X,
  Menu,
  Landmark,
  ShieldAlert,
  Radar,
  RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../context/authStore';
import { supabase } from '../services/supabase';
import { apiRequest } from '../services/api';
import { useToastStore } from '../context/toastStore';

export type TabId = 'dashboard' | 'holdings' | 'orders' | 'pnl' | 'insights' | 'ai-chat' | 'finance' | 'more' | 'admin' | 'profile' | 'buy-scanner';

interface NavigationProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  children: React.ReactNode;
}

export const Navigation: React.FC<NavigationProps> = ({ 
  activeTab, 
  setActiveTab, 
  children 
}) => {
  const { user, signOut, role, profile } = useAuthStore();
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [lastTradeDate, setLastTradeDate] = React.useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState<boolean>(false);

  const fetchLastTrade = async () => {
    try {
      const { data } = await supabase
        .from('trades')
        .select('trade_date')
        .order('trade_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.trade_date) {
        setLastTradeDate(data.trade_date);
      } else {
        setLastTradeDate(null);
      }
    } catch (err) {
      console.error('Failed to fetch last trade date:', err);
    }
  };

  React.useEffect(() => {
    fetchLastTrade();

    const handleSyncComplete = () => {
      fetchLastTrade();
    };

    window.addEventListener('portfolio-sync-complete', handleSyncComplete);
    return () => {
      window.removeEventListener('portfolio-sync-complete', handleSyncComplete);
    };
  }, []);

  const [syncingPortfolio, setSyncingPortfolio] = React.useState(false);

  const handleSyncPortfolio = async () => {
    setSyncingPortfolio(true);
    const toastId = useToastStore.getState().addToast('Synchronizing portfolio from Zerodha Kite & Coin...', 'loading');
    try {
      const res = await apiRequest('/portfolio/sync-all', { method: 'POST' });
      useToastStore.getState().removeToast(toastId);
      if (res.status === 'SUCCESS') {
        useToastStore.getState().addToast(
          res.message || `Portfolio synced: ${res.newTradesCount} new trades, ${res.mfCount} mutual funds.`,
          'success'
        );
        fetchLastTrade();
        window.dispatchEvent(new CustomEvent('finor-cache-updated', { detail: { endpoint: '/portfolio/summary' } }));
        window.dispatchEvent(new CustomEvent('finor-cache-updated', { detail: { endpoint: '/holdings' } }));
        window.dispatchEvent(new CustomEvent('finor-cache-updated', { detail: { endpoint: '/trades' } }));
        window.dispatchEvent(new CustomEvent('finor-cache-updated', { detail: { endpoint: '/mutual-funds' } }));
        window.dispatchEvent(new CustomEvent('finor-cache-updated', { detail: { endpoint: '/orders/live' } }));
        window.dispatchEvent(new CustomEvent('finor-cache-updated', { detail: { endpoint: '/analytics/dashboard' } }));
      } else {
        useToastStore.getState().addToast(res.message || 'Failed to sync portfolio.', 'error');
      }
    } catch (err: any) {
      useToastStore.getState().removeToast(toastId);
      const msg = err.message || 'Error syncing portfolio.';
      if (msg.includes('session') || msg.includes('400')) {
        useToastStore.getState().addToast('Broker session offline. Please log in on the Orders page.', 'error');
      } else {
        useToastStore.getState().addToast(msg, 'error');
      }
    } finally {
      setSyncingPortfolio(false);
    }
  };

  const formatLastTradeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const [isThemeLight, setIsThemeLight] = React.useState<boolean>(() => {
    return localStorage.getItem('finor_theme') === 'light';
  });

  const toggleTheme = () => {
    setIsThemeLight(prev => !prev);
  };

  React.useEffect(() => {
    const isCurrentlyLight = document.documentElement.classList.contains('light');
    if (isCurrentlyLight !== isThemeLight) {
      if (isThemeLight) {
        document.documentElement.classList.add('light');
        localStorage.setItem('finor_theme', 'light');
      } else {
        document.documentElement.classList.remove('light');
        localStorage.setItem('finor_theme', 'dark');
      }
      // Update browser status bar meta theme-color dynamically
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isThemeLight ? '#f8fafc' : '#080b11');
      window.dispatchEvent(new Event('themechange'));
    }
  }, [isThemeLight]);

  React.useEffect(() => {
    const handleThemeChange = () => {
      const isLight = localStorage.getItem('finor_theme') === 'light';
      setIsThemeLight(isLight);
    };
    // Initial sync
    const isLightOnMount = localStorage.getItem('finor_theme') === 'light';
    if (isLightOnMount) {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    window.addEventListener('themechange', handleThemeChange);
    return () => {
      window.removeEventListener('themechange', handleThemeChange);
    };
  }, []);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const navigationItems = [
    { id: 'dashboard' as TabId, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'holdings' as TabId, label: 'Holdings', icon: Briefcase },
    { id: 'orders' as TabId, label: 'Orders', icon: FileText },
    { id: 'pnl' as TabId, label: 'P&L', icon: BarChart3 },
    { id: 'finance' as TabId, label: 'Finance', icon: Landmark },
    { id: 'ai-chat' as TabId, label: 'AI Assistant', icon: Brain },
    { id: 'buy-scanner' as TabId, label: 'Buy Scanner', icon: Radar },
    { id: 'more' as TabId, label: 'More', icon: Grid },
  ];

  if (role === 'SUPER_ADMIN') {
    navigationItems.push({ id: 'admin' as TabId, label: 'Admin Portal', icon: ShieldAlert });
  }

  return (
    <div className="h-[100dvh] md:h-auto md:min-h-screen bg-dark-depth-0 text-white flex flex-col md:flex-row overflow-hidden md:overflow-visible">
      
      {/* 1. Desktop Sidebar (md and up) */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-dark-depth-1 border-r border-dark-border h-screen sticky top-0 flex-shrink-0 z-40">
        
        {/* Brand/Logo Section */}
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-dark-border">
          <img src="/favicon.png" alt="Finor Logo" className="w-7 h-7 rounded-lg object-contain shadow-md shadow-brand-500/10" />
          <div className="flex items-baseline">
            <span className="font-extrabold font-display text-lg tracking-tight bg-gradient-to-r from-brand-100 to-brand-500 bg-clip-text text-transparent">
              FINOR
            </span>
            <span className="text-[9px] text-emerald-500 font-bold ml-1.5 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
              V6.0
            </span>
          </div>
        </div>

        {/* Connection status inside sidebar */}
        <div className="px-6 py-2 border-b border-dark-border/40 flex items-center justify-between text-[10px] font-semibold">
          <span className="text-gray-500">SYSTEM STATUS</span>
          <div className="flex items-center gap-1.5 select-none">
            {isOnline ? (
              <>
                <span className="text-emerald-500">Connected</span>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
              </>
            ) : (
              <>
                <span className="text-rose-500 font-bold">Offline</span>
                <span className="inline-flex rounded-full h-1.5 w-1.5 bg-rose-500 animate-pulse"></span>
              </>
            )}
          </div>
        </div>

        {/* User profile card */}
        <div className="px-4 py-4 border-b border-dark-border">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              activeTab === 'profile' 
                ? 'bg-brand-500/10 border-brand-500/30' 
                : 'bg-dark-depth-2/40 border-dark-border/40 hover:bg-dark-depth-3/60'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-brand-600/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {profile?.username || user?.email?.split('@')[0]}
              </p>
              <p className="text-[10px] text-gray-400 truncate uppercase tracking-wider font-extrabold">
                {profile?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Client Profile'}
              </p>
            </div>
          </button>
        </div>

        {/* Sidebar Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-gradient-to-r from-brand-600/20 to-brand-700/5 text-brand-400 border-l-4 border-brand-500' 
                    : 'text-gray-400 hover:text-white hover:bg-dark-depth-2/50 border-l-4 border-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-brand-400' : 'text-gray-400 group-hover:text-white'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Logout at bottom */}
        <div className="p-4 border-t border-dark-border">
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dark-border text-xs font-bold text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* 2. Mobile Top Header (sm and down) */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-dark-depth-1/95 backdrop-blur-md border-b border-dark-border flex items-center justify-between px-4 z-40 w-full min-h-[56px]">
        
        {/* Left Branding with Status Ping */}
        <div className="flex items-center gap-2 select-none">
          {/* Hamburger Menu Toggle Button */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-1 -ml-1 rounded-lg border border-transparent hover:border-dark-border hover:bg-dark-depth-2/40 text-gray-400 hover:text-white transition-all cursor-pointer mr-1"
            title="Open Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
          <img src="/favicon.png" alt="Finor Logo" className="w-5 h-5 rounded-md object-contain" />
          <span className="font-extrabold font-display tracking-tight text-sm bg-gradient-to-r from-brand-100 to-brand-500 bg-clip-text text-transparent">
            FINOR
          </span>
          <span className="relative flex h-1.5 w-1.5 ml-0.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          </span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Mobile Common Sync Button */}
          <button
            onClick={handleSyncPortfolio}
            disabled={syncingPortfolio}
            className="p-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 text-brand-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Sync Portfolio (Zerodha Kite & Coin)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingPortfolio ? 'animate-spin' : ''}`} />
          </button>

          {/* Mobile Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-dark-border text-gray-400 hover:text-white transition-colors cursor-pointer"
            title={isThemeLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {isThemeLight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>

          {/* Mobile Profile Navigation Icon */}
          <button
            onClick={() => setActiveTab('profile')}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-400'
                : 'border-dark-border text-gray-400 hover:text-white'
            }`}
            title="Profile Settings"
          >
            <User className="w-3.5 h-3.5" />
          </button>

        </div>
      </header>

      {/* 3. Desktop Header & Content Area Wrapper */}
      <div className="flex-grow flex-shrink min-w-0 flex flex-col md:max-h-screen overflow-hidden">
        
        {/* Desktop Top Header Bar */}
        <header className="hidden md:flex h-16 bg-dark-depth-1 border-b border-dark-border items-center justify-between px-8 flex-shrink-0 z-30">
          <div className="flex items-center gap-2">
            <span className="font-extrabold font-display text-sm tracking-widest uppercase bg-gradient-to-r from-brand-100 to-brand-500 bg-clip-text text-transparent">
              {activeTab === 'ai-chat' ? 'AI Assistant' : activeTab === 'pnl' ? 'P&L Statement' : activeTab === 'finance' ? 'Finance Hub' : activeTab === 'buy-scanner' ? 'Considerations for Buying' : activeTab}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Common Unified Sync Button */}
            <button
              onClick={handleSyncPortfolio}
              disabled={syncingPortfolio}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-xs font-bold text-white shadow-md shadow-brand-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              title="One-Click Sync: Ingest Zerodha Orders, Equity Holdings & Coin Mutual Funds"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingPortfolio ? 'animate-spin' : ''}`} />
              <span>Sync Portfolio</span>
            </button>

            {lastTradeDate && (
              <div className="flex items-center gap-2 bg-dark-depth-2/40 border border-dark-border/40 px-3 py-1 rounded-xl select-none">
                <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wide">
                  Trades: {formatLastTradeDate(lastTradeDate)}
                </span>
              </div>
            )}

            {/* Status Indicator */}
            {isOnline ? (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 text-xs text-emerald-500 font-bold select-none">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <span>System Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 rounded-full px-3 py-1 text-xs text-rose-500 font-bold animate-pulse select-none">
                <span className="inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                <span>Offline Mode</span>
              </div>
            )}

            {/* Desktop Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-dark-border text-gray-400 hover:text-white hover:bg-dark-depth-2/50 transition-all cursor-pointer"
              title={isThemeLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {isThemeLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Main Content Container */}
        <main className={`flex-grow min-h-0 ${
          activeTab === 'ai-chat' 
            ? 'px-0 pt-[56px] pb-[80px] md:p-6 md:h-[calc(100vh-64px)] flex flex-col overflow-hidden' 
            : 'overflow-y-auto px-4 pt-[72px] pb-[112px] md:px-8 md:pt-6 md:pb-16'
        }`}>
          <div className={`max-w-7xl mx-auto flex flex-col w-full ${activeTab === 'ai-chat' ? 'flex-1 h-full min-h-0' : ''}`}>
            {!isOnline && (
              <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-between gap-3 animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span>Offline Mode: Live market price syncing is suspended. Check your internet connection.</span>
                </div>
                <button 
                  onClick={() => window.location.reload()} 
                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-[10px] text-white border border-rose-500/25 transition-all font-bold uppercase cursor-pointer"
                >
                  Reconnect
                </button>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      {/* 4. Mobile Bottom Navigation (sm and down) */}
      <nav className="fixed bottom-0 left-0 right-0 w-full md:hidden h-16 bg-dark-depth-1/95 backdrop-blur-md border-t border-dark-border flex items-center justify-around z-50 px-2 pb-safe shadow-2xl flex-shrink-0">
        {(() => {
          const mobileBottomItems = [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'holdings', label: 'Holdings', icon: Briefcase },
            { id: 'pnl', label: 'P&L', icon: BarChart3 },
            { id: 'finance', label: 'Finance', icon: Landmark },
            { id: 'menu', label: 'Menu', icon: Menu },
          ];

          return mobileBottomItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === 'menu'
              ? ['orders', 'ai-chat', 'admin', 'profile', 'buy-scanner'].includes(activeTab)
              : activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'menu') {
                    setIsMobileMenuOpen(true);
                  } else {
                    setActiveTab(item.id as any);
                  }
                }}
                className="flex flex-col items-center justify-center flex-1 h-full py-1 cursor-pointer"
              >
                <div className={`p-1 rounded-lg transition-colors ${isActive ? 'text-brand-400 bg-brand-500/10' : 'text-gray-400'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-[9px] font-bold mt-1 transition-colors ${isActive ? 'text-brand-400' : 'text-gray-400'}`}>
                  {item.label}
                </span>
              </button>
            );
          });
        })()}
      </nav>

      {/* 6. Sliding Mobile Menu Drawer Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] transition-opacity duration-300 md:hidden animate-in fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 7. Sliding Mobile Menu Drawer Panel */}
      <aside 
        className={`fixed inset-y-0 left-0 w-72 bg-dark-depth-1 border-r border-dark-border z-[120] flex flex-col md:hidden transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-dark-border">
          <div className="flex items-baseline gap-2">
            <span className="font-extrabold font-display text-lg tracking-tight bg-gradient-to-r from-brand-100 to-brand-500 bg-clip-text text-transparent">
              FINOR
            </span>
            <span className="text-[9px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
              V6.0
            </span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1.5 rounded-lg hover:bg-dark-depth-2 border border-transparent hover:border-dark-border text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User profile card */}
        <div className="px-4 py-4 border-b border-dark-border">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-dark-depth-2/40 border border-dark-border/40">
            <div className="w-8 h-8 rounded-full bg-brand-600/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {user?.email?.split('@')[0]}
              </p>
              <p className="text-[10px] text-gray-400 truncate">
                Owner Account
              </p>
            </div>
          </div>
        </div>

        {/* Drawer Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-gradient-to-r from-brand-600/20 to-brand-700/5 text-brand-400 border-l-4 border-brand-500' 
                    : 'text-gray-400 hover:text-white hover:bg-dark-depth-2/50 border-l-4 border-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-brand-400' : 'text-gray-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Logout at bottom */}
        <div className="p-4 border-t border-dark-border">
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              signOut();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dark-border text-xs font-bold text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

    </div>
  );
};
