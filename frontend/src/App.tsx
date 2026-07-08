import { useEffect, useState } from 'react';
import { useAuthStore } from './context/authStore';
import { Login } from './pages/Login';
import { Navigation } from './components/Navigation';
import type { TabId } from './components/Navigation';
import { Holdings } from './pages/Holdings';
import { Dashboard } from './pages/Dashboard';
import { PnL } from './pages/PnL';
import { Orders } from './pages/Orders';
import { More } from './pages/More';
import { Finance } from './pages/Finance';
import { Loader2 } from 'lucide-react';
import { ToastContainer } from './components/ToastContainer';
import { useToastStore } from './context/toastStore';

import { SystemLogger } from './utils/logger';

function App() {
  const { user, loading, initialize } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  useEffect(() => {
    initialize();
    SystemLogger.checkDailyClear();
    SystemLogger.info('Finor Web Application started');

    // Internet connection monitor
    const updateOnlineStatus = () => {
      const isOnline = navigator.onLine;
      if (!isOnline) {
        useToastStore.getState().addToast('No internet connection. Operating offline.', 'error', 10000);
      } else {
        const toasts = useToastStore.getState().toasts;
        const offlineToast = toasts.find(t => t.message.includes('No internet connection'));
        if (offlineToast) {
          useToastStore.getState().removeToast(offlineToast.id);
        }
        useToastStore.getState().addToast('Internet connection restored. Back online.', 'success', 3000);
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Initial check for weak connection
    const navAny = navigator as any;
    if (navAny.connection) {
      const conn = navAny.connection;
      const checkNetworkSpeed = () => {
        if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') {
          useToastStore.getState().addToast('Weak internet connection detected. Data loading may take longer.', 'warning', 8000);
        }
      };
      conn.addEventListener('change', checkNetworkSpeed);
      checkNetworkSpeed();
    }

    const handleSwitchTab = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.tab) {
        setActiveTab(customEvent.detail.tab);
        if (customEvent.detail.symbol) {
          localStorage.setItem('finor_prefill_orders', JSON.stringify({
            symbol: customEvent.detail.symbol,
            action: customEvent.detail.action || 'BUY',
            quantity: customEvent.detail.quantity || 10,
            price: customEvent.detail.price || ''
          }));
          window.dispatchEvent(new Event('finor-prefill-triggered'));
        }
      }
    };

    window.addEventListener('finor-switch-tab', handleSwitchTab);
    return () => {
      window.removeEventListener('finor-switch-tab', handleSwitchTab);
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [initialize]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-depth-0 flex flex-col items-center justify-center text-white">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-brand-500/10 blur-[120px] pointer-events-none" />
        <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-4" />
        <h2 className="text-lg font-semibold font-display tracking-wide bg-gradient-to-r from-brand-100 to-brand-500 bg-clip-text text-transparent">
          Initializing Finor...
        </h2>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab}>
        <div className="w-full transition-opacity duration-200 animate-in fade-in">
          {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
          {activeTab === 'holdings' && <Holdings />}
          {activeTab === 'orders' && <Orders />}
          {activeTab === 'pnl' && <PnL />}
          {activeTab === 'finance' && <Finance />}
          {activeTab === 'ai-chat' && (
            <More key="ai-chat-view" defaultSubTab="ai-chat" setActiveTab={setActiveTab} />
          )}
          {activeTab === 'more' && (
            <More key="more-view" defaultSubTab="news" setActiveTab={setActiveTab} />
          )}
        </div>
      </Navigation>
      <ToastContainer />
    </>
  );
}

export default App;
