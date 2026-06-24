import React from 'react';
import { 
  LayoutDashboard, 
  Briefcase, 
  FileText, 
  BarChart3, 
  Lightbulb, 
  Grid,
  LogOut,
  User,
  Wifi,
  WifiOff,
  Brain,
  Sun,
  Moon,
  RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../context/authStore';
import { supabase } from '../services/supabase';
import { apiRequest } from '../services/api';

export type TabId = 'dashboard' | 'holdings' | 'orders' | 'pnl' | 'insights' | 'ai-chat' | 'more';

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
  const { user, signOut } = useAuthStore();
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [lastTradeDate, setLastTradeDate] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);

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

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const config = await apiRequest('/orders/config');
      
      let res;
      if (config.status === 'CONNECTED') {
        res = await apiRequest('/trades/sync-kite', { method: 'POST' });
      } else {
        res = await apiRequest('/orders/sync-mock', { method: 'POST' });
      }

      await fetchLastTrade();
      window.dispatchEvent(new Event('portfolio-sync-complete'));
      console.log('Sync result:', res.message);
    } catch (err: any) {
      console.error('Synchronization failed:', err.message);
    } finally {
      setIsSyncing(false);
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
    { id: 'insights' as TabId, label: 'Insights', icon: Lightbulb },
    { id: 'ai-chat' as TabId, label: 'AI Assistant', icon: Brain },
    { id: 'more' as TabId, label: 'More', icon: Grid },
  ];

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
      <header className="md:hidden h-14 bg-dark-depth-1/80 backdrop-blur-md border-b border-dark-border flex items-center justify-between px-4 flex-shrink-0 z-40 w-full relative min-h-[56px]">
        {/* Left Stats */}
        <div className="flex items-center gap-1.5 absolute left-4 top-1/2 -translate-y-1/2 z-10 select-none">
          <span className="text-[8px] text-gray-500 font-extrabold uppercase">
            {lastTradeDate ? `Upto: ${formatLastTradeDate(lastTradeDate)}` : 'No Trades'}
          </span>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className={`p-1 rounded-lg text-gray-500 hover:text-white transition-all cursor-pointer ${
              isSyncing ? 'animate-spin text-brand-400' : ''
            }`}
            title="Sync Trades"
          >
            <RefreshCw className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* Center Logo */}
        <div className="flex items-center justify-center w-full absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <img src="/favicon.png" alt="Finor Logo" className="w-5 h-5 rounded-md object-contain" />
            <span className="font-extrabold font-display tracking-tight text-sm bg-gradient-to-r from-brand-100 to-brand-500 bg-clip-text text-transparent">
              FINOR
            </span>
          </div>
        </div>

        {/* Right Status / Theme / Signout */}
        <div className="flex items-center gap-1.5 absolute right-4 top-1/2 -translate-y-1/2 z-10">
          {isOnline ? (
            <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 text-[9px] text-emerald-500 font-bold select-none">
              <Wifi className="w-2.5 h-2.5" />
              <span>Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 rounded-full px-2 py-0.5 text-[9px] text-rose-500 font-bold animate-pulse select-none">
              <WifiOff className="w-2.5 h-2.5" />
              <span>Offline</span>
            </div>
          )}

          {/* Mobile Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-dark-border text-gray-400 hover:text-white transition-colors cursor-pointer"
            title={isThemeLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {isThemeLight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={signOut}
            className="p-1.5 rounded-lg border border-dark-border text-gray-400 hover:text-rose-500 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 3. Desktop Header & Content Area Wrapper */}
      <div className="flex-grow flex-shrink min-w-0 flex flex-col md:max-h-screen overflow-hidden">
        
        {/* Desktop Top Header Bar */}
        <header className="hidden md:flex h-16 bg-dark-depth-1 border-b border-dark-border items-center justify-between px-8 flex-shrink-0 z-30">
          <div className="flex items-center gap-2">
            <span className="font-extrabold font-display text-sm tracking-widest uppercase bg-gradient-to-r from-brand-100 to-brand-500 bg-clip-text text-transparent">
              {activeTab === 'ai-chat' ? 'AI Assistant' : activeTab === 'pnl' ? 'P&L Statement' : activeTab}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-dark-depth-2/40 border border-dark-border/40 pl-2.5 pr-1.5 py-1 rounded-xl select-none">
              <span className="text-[10px] text-gray-400 font-extrabold uppercase">
                {lastTradeDate ? `Trades Up-to-date: ${formatLastTradeDate(lastTradeDate)}` : 'No Trades Synced'}
              </span>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={`p-1 rounded-lg hover:bg-dark-depth-2 text-gray-400 hover:text-white transition-all cursor-pointer ${
                  isSyncing ? 'animate-spin text-brand-400' : ''
                }`}
                title="Sync Trades from Broker"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

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
        <main className={`flex-grow overflow-y-auto ${
          activeTab === 'ai-chat' ? 'px-0 pt-0 pb-0 md:p-6' : 'px-4 pt-4 pb-4 md:p-6'
        } min-h-0`}>
          <div className="max-w-7xl mx-auto h-full flex flex-col">
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
      <nav className="md:hidden h-16 bg-dark-depth-1/95 backdrop-blur-md border-t border-dark-border flex items-center justify-around z-50 px-2 pb-safe shadow-2xl flex-shrink-0">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
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
        })}
      </nav>

    </div>
  );
};
