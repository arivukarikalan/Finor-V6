import { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../services/api';
import { useAuthStore } from '../context/authStore';
import { News } from './News';
import { SystemLogger } from '../utils/logger';
import type { LogEntry } from '../utils/logger';
import { 
  Settings, 
  Newspaper, 
  MessageSquareCode, 
  MessageSquare,
  Sparkles,
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Clock, 
  LogOut,
  AlertCircle,
  Send,
  Brain,
  Plus,
  Mic,
  Sun,
  Moon,
  Menu,
  ArrowDown,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Search,
  Download,
  LineChart,
  TrendingUp,
  Coins
} from 'lucide-react';
import { marked } from 'marked';

type SubTabId = 'news' | 'settings' | 'ai-chat' | 'logs';

// Configure marked options and custom renderer once
marked.use({
  renderer: {
    tablecell(tokenOrContent: any, flagsOrUndefined?: any) {
      let content = '';
      let isHeader = false;
      let align = '';

      if (flagsOrUndefined !== undefined) {
        content = tokenOrContent;
        isHeader = flagsOrUndefined.header;
        align = flagsOrUndefined.align ? ` align="${flagsOrUndefined.align}"` : '';
      } else if (tokenOrContent && typeof tokenOrContent === 'object') {
        content = tokenOrContent.text || '';
        isHeader = tokenOrContent.header ?? tokenOrContent.flags?.header ?? false;
        const alignVal = tokenOrContent.align ?? tokenOrContent.flags?.align;
        align = alignVal ? ` align="${alignVal}"` : '';
      } else {
        content = String(tokenOrContent || '');
      }

      const tag = isHeader ? 'th' : 'td';
      let className = '';

      if (!isHeader) {
        const clean = content.replace(/\*\*/g, '').trim();
        // Render positive values and top performers in mint green (#10b981)
        // and negative values and laggards in soft red/coral (#ef4444).
        if (clean.startsWith('-') || clean.includes('-₹') || clean.includes('- ₹') || (clean.startsWith('(') && clean.endsWith(')'))) {
          className = ' class="val-negative"';
        } else if (clean.startsWith('+') || clean.includes('+₹') || clean.includes('+ ₹')) {
          className = ' class="val-positive"';
        }
      }

      const parsedContent = marked.parseInline(content);
      return `<${tag}${align}${className}>${parsedContent}</${tag}>`;
    },
    table(token: any) {
      let headerHtml = '';
      let bodyHtml = '';

      if (token.header && Array.isArray(token.header)) {
        const headerCells = token.header.map((cell: any) => {
          return this.tablecell(cell);
        }).join('');
        headerHtml = `<thead><tr>${headerCells}</tr></thead>`;
      }

      if (token.rows && Array.isArray(token.rows)) {
        const bodyRows = token.rows.map((row: any) => {
          const rowCells = row.map((cell: any) => {
            return this.tablecell(cell);
          }).join('');
          return `<tr>${rowCells}</tr>`;
        }).join('');
        bodyHtml = `<tbody>${bodyRows}</tbody>`;
      }

      return `
        <div class="table-responsive-wrapper overflow-x-auto max-w-full my-4 rounded-xl border border-slate-200/50 dark:border-white/10">
          <table class="min-w-full border-collapse">
            ${headerHtml}
            ${bodyHtml}
          </table>
        </div>
      `;
    },
    code(tokenOrCode: any, langOrUndefined?: any) {
      let code = '';
      let lang = '';

      if (langOrUndefined !== undefined) {
        code = tokenOrCode;
        lang = langOrUndefined || 'code';
      } else if (tokenOrCode && typeof tokenOrCode === 'object') {
        code = tokenOrCode.text || '';
        lang = tokenOrCode.lang || 'code';
      } else {
        code = String(tokenOrCode || '');
        lang = 'code';
      }

      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `
        <div class="code-block-wrapper my-4 rounded-xl border overflow-hidden shadow-lg">
          <div class="code-block-header flex items-center justify-between px-4 py-2 text-[10px] border-b font-mono select-none">
            <span>${lang}</span>
            <button 
              type="button"
              class="code-block-copy transition-colors flex items-center gap-1 cursor-pointer font-sans text-[10px] bg-transparent border-0 py-0.5 px-2 rounded"
              onclick="
                const codeNode = this.closest('.code-block-wrapper').querySelector('code');
                navigator.clipboard.writeText(codeNode.textContent);
                this.textContent = 'Copied!';
                setTimeout(() => this.textContent = 'Copy code', 2000);
              "
            >
              Copy code
            </button>
          </div>
          <pre class="p-4 overflow-x-auto text-[11px] font-mono select-text whitespace-pre"><code>${escapedCode}</code></pre>
        </div>
      `;
    }
  }
});

const MarkdownView = ({ text, isLightMode }: { text: string; isLightMode: boolean }) => {
  if (!text) return null;

  const handleLinkClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href && (href.startsWith('download://') || href.startsWith('/api/export/'))) {
        e.preventDefault();
        console.log(`[AI Assistant] Intercepted statement download: ${href}`);

        try {
          if (href.startsWith('download://')) {
            const actionType = href.replace('download://', '');
            if (actionType === 'print-pdf') {
              window.print();
            } else if (actionType === 'pnl-csv') {
              const data = await apiRequest('/analytics/realized-pnl');
              const closedTrades = data.closed_trades || [];
              let csvContent = "Stock,Quantity,Buy Date,Sell Date,Buy Price (\u20B9),Sell Price (\u20B9),Realized P&L (\u20B9),Holding Days,Tax Classification\n";
              closedTrades.forEach((trade: any) => {
                const buyDateStr = new Date(trade.buy_date).toLocaleDateString('en-IN');
                const sellDateStr = new Date(trade.sell_date).toLocaleDateString('en-IN');
                const taxClass = trade.holding_days > 365 ? "LTCG" : "STCG";
                csvContent += `${trade.stock_symbol},${trade.quantity},${buyDateStr},${sellDateStr},${trade.buy_price.toFixed(2)},${trade.sell_price.toFixed(2)},${trade.realized_pnl.toFixed(2)},${trade.holding_days},${taxClass}\n`;
              });
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = "finor_pnl_report.csv";
              link.click();
            } else if (actionType === 'holdings-csv') {
              const holdings = await apiRequest('/holdings');
              let csvContent = "Stock,Quantity,Avg Buy Price (\u20B9),LTP (\u20B9),Invested Value (\u20B9),Current Value (\u20B9),P&L (\u20B9),P&L (%)\n";
              holdings.forEach((h: any) => {
                const invested = h.quantity * h.average_buy_price;
                const current = h.quantity * (h.ltp || h.average_buy_price);
                const pnl = current - invested;
                const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
                csvContent += `${h.stock_symbol},${h.quantity},${h.average_buy_price.toFixed(2)},${(h.ltp || 0).toFixed(2)},${invested.toFixed(2)},${current.toFixed(2)},${pnl.toFixed(2)},${pnlPct.toFixed(2)}\n`;
              });
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = "finor_holdings_report.csv";
              link.click();
            }
          } else {
            // Native backend download via fetch with auth JWT headers
            const rawBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';
            let sanitizedBaseUrl = rawBaseUrl.trim().replace(/\/$/, '');
            if (!sanitizedBaseUrl.endsWith('/api')) {
              sanitizedBaseUrl += '/api';
            }
            const downloadUrl = href.startsWith('/api') ? `${sanitizedBaseUrl}${href.substring(4)}` : href;
            
            const session = useAuthStore.getState().session;
            const token = session?.access_token;

            const isPost = href.includes('markdown-pdf') || href.includes('markdown-csv');
            const cleanText = text.replace(/\[Download.*?\]\(.*?\)/gi, '').trim();

            const fetchOptions: RequestInit = {
              method: isPost ? 'POST' : 'GET',
              headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                ...(isPost ? { 'Content-Type': 'application/json' } : {})
              },
              ...(isPost ? { body: JSON.stringify({ markdown: cleanText }) } : {})
            };

            const response = await fetch(downloadUrl, fetchOptions);

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();

            let filename = 'report.pdf';
            if (href.endsWith('-pdf')) {
              filename = 'finor_realized_pnl_statement.pdf';
            } else if (href.endsWith('pnl-csv')) {
              filename = 'finor_realized_pnl_ledger.csv';
            } else if (href.endsWith('holdings-csv')) {
              filename = 'finor_holdings_statement.csv';
            }

            const dlLink = document.createElement('a');
            dlLink.href = URL.createObjectURL(blob);
            dlLink.download = filename;
            dlLink.click();
          }
        } catch (err: any) {
          console.error("AI Assistant Download failed:", err.message);
        }
      }
    }
  };

  const parsedHtml = marked.parse(text) as string;
  return (
    <div 
      onClick={handleLinkClick}
      className={`markdown-body select-text text-xs leading-[1.6] ${isLightMode ? 'text-slate-800' : 'text-gray-200'}`}
      dangerouslySetInnerHTML={{ __html: parsedHtml }} 
    />
  );
};

function cleanTextForCopy(text: string) {
  return text
    .replace(/\*\*/g, '')          // Remove bold markers
    .replace(/#/g, '')             // Remove headings
    .replace(/\|/g, '\t')          // Replace pipes with tabs
    .replace(/\*/g, '•')           // Replace bullets
    .replace(/^[ \t]*•[ \t]*/gm, '• '); // Clean bullet indentation
}

const MessageActions = ({
  msg,
  msgIdx,
  activeChatId,
  feedback,
  onFeedback,
  isLightMode
}: {
  msg: any;
  msgIdx: number;
  activeChatId: string;
  feedback: Record<string, { type: 'up' | 'down'; comment?: string }>;
  onFeedback: (chatId: string, idx: number, type: 'up' | 'down', comment?: string) => void;
  isLightMode: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [comment, setComment] = useState('');
  
  const key = `${activeChatId}_${msgIdx}`;
  const currentFeedback = feedback[key];

  const handleCopy = async () => {
    try {
      const clean = cleanTextForCopy(msg.content);
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (currentFeedback?.type === 'down') {
      setComment(currentFeedback.comment || '');
      setShowFeedbackInput(true);
    } else {
      setShowFeedbackInput(false);
    }
  }, [currentFeedback]);

  return (
    <div className="flex flex-col gap-2 mt-2 select-none">
      <div className="flex items-center gap-2 text-gray-500 text-[10px] md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={handleCopy}
          className={`p-1.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:bg-slate-200/50 dark:hover:bg-neutral-800 text-[10px] ${
            isLightMode ? 'hover:text-indigo-600' : 'hover:text-brand-400'
          }`}
          title="Copy response"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>

        <button
          type="button"
          onClick={() => onFeedback(activeChatId, msgIdx, 'up')}
          className={`p-1.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:bg-slate-200/50 dark:hover:bg-neutral-800 text-[10px] ${
            currentFeedback?.type === 'up' 
              ? 'text-emerald-500 hover:text-emerald-600' 
              : 'hover:text-emerald-500'
          }`}
          title="Helpful"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (currentFeedback?.type === 'down') {
              onFeedback(activeChatId, msgIdx, 'down', undefined);
            } else {
              onFeedback(activeChatId, msgIdx, 'down', '');
            }
          }}
          className={`p-1.5 rounded transition-all flex items-center gap-1 cursor-pointer hover:bg-slate-200/50 dark:hover:bg-neutral-800 text-[10px] ${
            currentFeedback?.type === 'down' 
              ? 'text-rose-500 hover:text-rose-600' 
              : 'hover:text-rose-500'
          }`}
          title="Not helpful"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {showFeedbackInput && (
        <div className="flex items-center gap-2 max-w-sm mt-1 animate-fadeIn">
          <input
            type="text"
            placeholder="What was wrong with this response? (Optional)"
            value={comment}
            onChange={e => {
              setComment(e.target.value);
              onFeedback(activeChatId, msgIdx, 'down', e.target.value);
            }}
            className={`flex-1 px-2.5 py-1 text-[10px] rounded-lg border focus:outline-none focus:ring-0 ${
              isLightMode 
                ? 'bg-slate-100 border-slate-200 text-slate-700 focus:border-indigo-500/40' 
                : 'bg-dark-depth-3 border-dark-border text-white focus:border-brand-500/40'
            }`}
          />
        </div>
      )}
    </div>
  );
};

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    engine?: string;
    timestamp?: string;
    responseTime?: number;
    pendingConfirm?: {
      tool: string;
      args: {
        stock_symbol: string;
        trigger_type: string;
        transaction_type: string;
        quantity: number;
        trigger_price_1: number;
        trigger_price_2?: number;
      };
    };
  }>;
}

const OrderConfirmationCard = ({ 
  args, 
  onConfirm, 
  onCancel,
  isLightMode
}: { 
  args: any; 
  onConfirm: () => void; 
  onCancel: () => void;
  isLightMode: boolean;
}) => {
  return (
    <div className={`mt-3 p-3.5 rounded-xl border select-none transition-all ${
      isLightMode 
        ? 'bg-slate-100/90 border-slate-200 text-slate-800' 
        : 'bg-[#1a1a1c] border-indigo-500/20 text-gray-200'
    }`}>
      <div className="flex items-center gap-1.5 mb-2.5 border-b border-dashed pb-1.5 border-slate-200 dark:border-neutral-800/60">
        <span className="text-[10px] font-black tracking-widest text-indigo-400 dark:text-brand-400 uppercase">
          ⚠️ Confirm GTT Order
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] font-semibold mb-3">
        <div>
          <span className="text-gray-400 block text-[8px] uppercase tracking-wider">Stock</span>
          <span className="font-bold text-slate-800 dark:text-white text-xs">{args.stock_symbol}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[8px] uppercase tracking-wider">Action</span>
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold inline-block leading-none uppercase ${
            args.transaction_type === 'BUY' 
              ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20' 
              : 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20'
          }`}>
            {args.transaction_type}
          </span>
        </div>
        <div>
          <span className="text-gray-400 block text-[8px] uppercase tracking-wider">Quantity</span>
          <span className="text-slate-700 dark:text-slate-300">{args.quantity} Shares</span>
        </div>
        <div>
          <span className="text-gray-400 block text-[8px] uppercase tracking-wider">Trigger Price</span>
          <span className="text-slate-700 dark:text-slate-300">₹{parseFloat(args.trigger_price_1).toFixed(2)}</span>
        </div>
        {args.trigger_type === 'OCO' && args.trigger_price_2 && (
          <div className="col-span-2">
            <span className="text-gray-400 block text-[8px] uppercase tracking-wider">Stoploss Price (OCO)</span>
            <span className="text-slate-700 dark:text-slate-300">₹{parseFloat(args.trigger_price_2).toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all border cursor-pointer ${
            isLightMode 
              ? 'border-slate-300 hover:bg-slate-200 text-slate-700 bg-white' 
              : 'border-neutral-800 hover:bg-neutral-800 text-gray-400 bg-transparent'
          }`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-3 py-1 rounded-lg text-[9px] font-bold uppercase transition-all bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-md shadow-indigo-600/10"
        >
          Confirm Placement
        </button>
      </div>
    </div>
  );
};

export const More = ({ 
  defaultSubTab = 'news', 
  setActiveTab 
}: { 
  defaultSubTab?: SubTabId; 
  setActiveTab?: (tab: any) => void;
}) => {
  const { signOut } = useAuthStore();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>(defaultSubTab);
  const [logsList, setLogsList] = useState<LogEntry[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'info' | 'success' | 'warn' | 'error'>('all');

  const prevDefaultSubTabRef = useRef(defaultSubTab);
  useEffect(() => {
    if (prevDefaultSubTabRef.current !== defaultSubTab) {
      setActiveSubTab(defaultSubTab);
      prevDefaultSubTabRef.current = defaultSubTab;
    }
  }, [defaultSubTab]);

  useEffect(() => {
    if (activeSubTab === 'logs') {
      setLogsList(SystemLogger.getLogs());
    }
  }, [activeSubTab]);

  useEffect(() => {
    const handleNewLog = () => {
      setLogsList(SystemLogger.getLogs());
    };
    window.addEventListener('finor-new-log', handleNewLog);
    window.addEventListener('finor-logs-cleared', handleNewLog);
    return () => {
      window.removeEventListener('finor-new-log', handleNewLog);
      window.removeEventListener('finor-logs-cleared', handleNewLog);
    };
  }, []);
  
  // Theme state (synced with global finor_theme)
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    return localStorage.getItem('finor_theme') === 'light';
  });

  useEffect(() => {
    const isCurrentlyLight = document.documentElement.classList.contains('light');
    if (isCurrentlyLight !== isLightMode) {
      if (isLightMode) {
        document.documentElement.classList.add('light');
        localStorage.setItem('finor_theme', 'light');
      } else {
        document.documentElement.classList.remove('light');
        localStorage.setItem('finor_theme', 'dark');
      }
      window.dispatchEvent(new Event('themechange'));
    }
  }, [isLightMode]);

  useEffect(() => {
    const handleThemeChange = () => {
      const isLight = localStorage.getItem('finor_theme') === 'light';
      setIsLightMode(isLight);
    };
    window.addEventListener('themechange', handleThemeChange);
    return () => {
      window.removeEventListener('themechange', handleThemeChange);
    };
  }, []);
  
  // Settings States
  const [priceInterval, setPriceInterval] = useState<number>(10);
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    return parseInt(localStorage.getItem('coreHoldSplitRatio') || '80', 10);
  });
  const [reentryDip, setReentryDip] = useState<number>(() => {
    return parseInt(localStorage.getItem('reentryDipPct') || '-10', 10);
  });
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  // Status Alerts
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI Assistant States (Local storage chat history)
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('finor_ai_chats');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Auto-delete chats older than 2 days
        const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
        const validChats = parsed.filter((c: any) => c.createdAt > twoDaysAgo);
        localStorage.setItem('finor_ai_chats', JSON.stringify(validChats));
        return validChats;
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return localStorage.getItem('finor_ai_active_chat_id') || null;
  });

  const [messages, setMessages] = useState<Array<{ 
    role: 'user' | 'assistant'; 
    content: string; 
    engine?: string; 
    timestamp?: string;
    responseTime?: number;
    pendingConfirm?: {
      tool: string;
      args: {
        stock_symbol: string;
        trigger_type: string;
        transaction_type: string;
        quantity: number;
        trigger_price_1: number;
        trigger_price_2?: number;
      };
    };
  }>>([]);

  const [activeOrderWorkflow, setActiveOrderWorkflow] = useState<{
    stock_symbol: string;
    trigger_type: string;
    transaction_type: string;
    quantity: number;
    trigger_price_1: number;
    trigger_price_2?: number;
  } | null>(null);

  const [chatInput, setChatInput] = useState<string>('');
  const [activeQuery, setActiveQuery] = useState<string>('');
  const [sendingChat, setSendingChat] = useState<boolean>(false);
  const [usageRemaining, setUsageRemaining] = useState<number | null>(null);

  // Model Selector state
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('aiChatSelectedModel') || 'default';
  });

  // Mobile sidebar drawer state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Rename states
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');

  // Scroll to bottom states
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Feedback states
  const [feedback, setFeedback] = useState<Record<string, { type: 'up' | 'down'; comment?: string }>>(() => {
    const saved = localStorage.getItem('finor_ai_feedback');
    return saved ? JSON.parse(saved) : {};
  });



  // Thinking step state
  const [thinkingStep, setThinkingStep] = useState(1);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const promptChips = [
    { label: '📊 Portfolio Analysis', text: 'Analyse my portfolio and show holdings summary' },
    { label: '📈 Best Performer', text: 'Which stock in my portfolio is my best performer?' },
    { label: '💰 Profit Booking', text: 'Should I book profit on any of my stocks?' },
    { label: '📋 GTT Orders', text: 'Show my current GTT orders' },
    { label: '🔍 Risk Analysis', text: 'What is my highest risk position right now?' }
  ];

  const getProgressBarColor = (val: number) => {
    if (val > 50) return 'bg-emerald-500';
    if (val >= 21) return 'bg-amber-500';
    return 'bg-rose-500';
  };



  // Sync selected model
  useEffect(() => {
    localStorage.setItem('aiChatSelectedModel', selectedModel);
  }, [selectedModel]);

  // Sync activeChatId and load messages
  useEffect(() => {
    localStorage.setItem('finor_ai_active_chat_id', activeChatId || '');
    if (activeChatId) {
      const active = chats.find(c => c.id === activeChatId);
      if (active) {
        setMessages(active.messages);
      }
    } else {
      setMessages([]);
    }
    setActiveOrderWorkflow(null); // Clear active workflow state when active chat changes
    setUnreadCount(0);
  }, [activeChatId]);

  // Sync messages into the active chat session in the chats list
  const updateActiveChatMessages = (newMessages: typeof messages) => {
    if (!activeChatId) return;
    setChats(prev => {
      const updated = prev.map(c => c.id === activeChatId ? { ...c, messages: newMessages } : c);
      localStorage.setItem('finor_ai_chats', JSON.stringify(updated));
      return updated;
    });
  };



  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeSubTab === 'ai-chat' && !showScrollBottom) {
      scrollToBottom();
    }
  }, [messages, activeSubTab, sendingChat]);

  // Cycle through thinking steps
  useEffect(() => {
    if (!sendingChat) {
      setThinkingStep(1);
      return;
    }
    const timers = [
      setTimeout(() => setThinkingStep(2), 500),
      setTimeout(() => setThinkingStep(3), 1300),
      setTimeout(() => setThinkingStep(4), 1900),
      setTimeout(() => setThinkingStep(5), 2600)
    ];
    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [sendingChat]);

  const getThinkingText = (step: number) => {
    const query = activeQuery.toLowerCase();
    
    // GTT / Order Placement intent
    if (query.includes('gtt') || query.includes('place') || query.includes('buy') || query.includes('sell') || query.includes('order')) {
      switch (step) {
        case 1: return "Analyzing GTT order intent...";
        case 2: return "Verifying ticker symbols against exchange...";
        case 3: return "Auditing account margin & bounds...";
        case 4: return "Drafting order execution payload...";
        default: return "Finalizing GTT response...";
      }
    }
    
    // Discipline / Behavior intent
    if (query.includes('discipline') || query.includes('score') || query.includes('grade') || query.includes('violation') || query.includes('performance') || query.includes('coach')) {
      switch (step) {
        case 1: return "Fetching transaction logs from database...";
        case 2: return "Calculating winner vs. loser holding periods...";
        case 3: return "Scanning for risk rules violations...";
        case 4: return "Generating behavioral grade profile...";
        default: return "Composing discipline response...";
      }
    }
    
    // Portfolio / Holdings P&L intent
    if (query.includes('portfolio') || query.includes('holding') || query.includes('invested') || query.includes('summary') || query.includes('performer') || query.includes('profit') || query.includes('loss') || query.includes('pnl')) {
      switch (step) {
        case 1: return "Requesting live market prices (LTP)...";
        case 2: return "Calculating allocations and cost basis...";
        case 3: return "Computing absolute & percentage P&L...";
        case 4: return "Sorting top gains and laggards...";
        default: return "Formatting portfolio report card...";
      }
    }

    // Default general query
    switch (step) {
      case 1: return "Processing context query...";
      case 2: return "Reading portfolio configurations...";
      case 3: return "Retrieving historical trades...";
      case 4: return "Synthesizing answer structure...";
      default: return "Finishing response formatting...";
    }
  };

  const fetchUsage = async () => {
    try {
      const usageRes = await apiRequest('/assistant/usage');
      if (usageRes && typeof usageRes.remaining === 'number') {
        setUsageRemaining(usageRes.remaining);
      }
    } catch (err) {
      console.error('Failed to fetch usage limits:', err);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'ai-chat') {
      fetchUsage();
    }
  }, [activeSubTab]);

  const handleSendChat = async (textToSend?: string, confirmArgs?: any) => {
    const text = (textToSend || chatInput).trim();
    if (!text) return;

    // Check if we are in an active GTT order workflow and the user types a confirmation/cancellation keyword
    if (activeOrderWorkflow && !confirmArgs) {
      const cleanText = text.toLowerCase().replace(/[.,!]/g, '').trim();
      const isAffirmation = ['yes', 'proceed', 'confirm', 'place order', 'do it', 'yup', 'yeah', 'go ahead', 'ok', 'okay'].includes(cleanText);
      const isCancellation = ['no', 'cancel', 'stop', 'dont', "don't", 'reject'].includes(cleanText);
      
      if (isAffirmation) {
        const msgIdx = messages.findLastIndex(m => m.pendingConfirm && m.pendingConfirm.tool === 'placeGttOrder');
        if (msgIdx !== -1) {
          if (!textToSend) setChatInput('');
          await handleConfirmOrder(activeOrderWorkflow, msgIdx);
          return;
        }
      } else if (isCancellation) {
        const msgIdx = messages.findLastIndex(m => m.pendingConfirm && m.pendingConfirm.tool === 'placeGttOrder');
        if (msgIdx !== -1) {
          if (!textToSend) setChatInput('');
          handleCancelOrder(msgIdx);
          return;
        }
      }
    }

    if (!textToSend) setChatInput('');
    setActiveQuery(text);

    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const userMsg = { role: 'user' as const, content: text, timestamp: timeStr };

    let currentChatId = activeChatId;
    let currentChats = [...chats];

    // If no active chat, create a new one (Auto-naming)
    if (!currentChatId) {
      const words = text.split(/\s+/);
      const title = words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '');
      const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      
      const newChat: ChatSession = {
        id: newId,
        title,
        createdAt: Date.now(),
        messages: [userMsg]
      };

      currentChatId = newId;
      currentChats = [newChat, ...currentChats];
      setChats(currentChats);
      localStorage.setItem('finor_ai_chats', JSON.stringify(currentChats));
      setActiveChatId(newId);
      setMessages([userMsg]);
    } else {
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      updateActiveChatMessages(updatedMessages);
    }

    setSendingChat(true);

    const startTime = performance.now();

    try {
      // Load current messages for context window
      const active = currentChats.find(c => c.id === currentChatId);
      const activeMsgs = active ? active.messages : [userMsg];
      const historyToSend = activeMsgs.slice(-21).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await apiRequest('/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chatHistory: historyToSend.slice(0, -1), // exclude the user message just added
          modelName: selectedModel,
          confirmOrder: !!confirmArgs,
          orderArgs: confirmArgs,
          activeOrderWorkflow: activeOrderWorkflow
        })
      });

      const endTime = performance.now();
      const responseTime = parseFloat(((endTime - startTime) / 1000).toFixed(1));

      if (res && res.reply) {
        // If the reply contains a pending GTT confirmation, lock into the workflow state
        if (res.pendingConfirm && res.pendingConfirm.tool === 'placeGttOrder') {
          setActiveOrderWorkflow(res.pendingConfirm.args);
        }

        const assistantMsg = {
          role: 'assistant' as const,
          content: res.reply,
          engine: res.engine,
          timestamp: timeStr,
          pendingConfirm: res.pendingConfirm,
          responseTime
        };

        setMessages(prev => {
          const updated = [...prev, assistantMsg];
          
          // If scrolled up, increment unreadCount
          const el = scrollRef.current;
          if (el && (el.scrollHeight - el.scrollTop - el.clientHeight > 300)) {
            setUnreadCount(count => count + 1);
          }

          // Sync immediately
          setChats(prevChats => {
            const updatedChats = prevChats.map(c => c.id === currentChatId ? { ...c, messages: updated } : c);
            localStorage.setItem('finor_ai_chats', JSON.stringify(updatedChats));
            return updatedChats;
          });

          return updated;
        });

        if (typeof res.remaining === 'number') {
          setUsageRemaining(res.remaining);
        }
      }
    } catch (err: any) {
      console.error('Assistant call failed:', err);
      const errMsg = {
        role: 'assistant' as const,
        content: `⚠️ **Error:** ${err.message || 'Failed to contact AI server. Please check your connection.'}`,
        engine: 'System error',
        timestamp: timeStr
      };
      setMessages(prev => {
        const updated = [...prev, errMsg];
        setChats(prevChats => {
          const updatedChats = prevChats.map(c => c.id === currentChatId ? { ...c, messages: updated } : c);
          localStorage.setItem('finor_ai_chats', JSON.stringify(updatedChats));
          return updatedChats;
        });
        return updated;
      });
    } finally {
      setSendingChat(false);
    }
  };

  const handleConfirmOrder = async (args: any, msgIdx: number) => {
    if (!activeChatId) return;
    
    // Remove confirmation card from state to avoid double actions and show status
    const updated = messages.map((m, i) => i === msgIdx ? { 
      ...m, 
      pendingConfirm: undefined, 
      content: m.content + "\n\n⏳ *Placing order on broker/mock terminal...*" 
    } : m);
    
    setMessages(updated);
    updateActiveChatMessages(updated);

    // Clear active workflow state immediately upon confirmation execution
    setActiveOrderWorkflow(null);

    // Trigger GTT placement query
    await handleSendChat(`Confirming placement of ${args.transaction_type} GTT order for ${args.quantity} shares of ${args.stock_symbol} at trigger price ₹${args.trigger_price_1}`, args);
  };

  const handleCancelOrder = (msgIdx: number) => {
    if (!activeChatId) return;
    const updated = messages.map((m, i) => i === msgIdx ? { 
      ...m, 
      pendingConfirm: undefined, 
      content: m.content + "\n\n❌ *Order placement cancelled by user.*" 
    } : m);
    setMessages(updated);
    updateActiveChatMessages(updated);
    
    // Clear active workflow state
    setActiveOrderWorkflow(null);
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setIsSidebarOpen(false);
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;
    
    let text = `=========================================\n`;
    text += `   FINOR AI COACH CHAT HISTORY EXPORT\n`;
    text += `   Generated: ${new Date().toLocaleString('en-IN')}\n`;
    text += `=========================================\n\n`;
    
    messages.forEach((m) => {
      const sender = m.role === 'user' ? 'USER' : 'FINOR AI COACH';
      const engineStr = m.engine ? ` (Engine: ${m.engine})` : '';
      const time = m.timestamp ? ` [${m.timestamp}]` : '';
      text += `[${sender}]${engineStr}${time}:\n${m.content}\n`;
      text += `--------------------------------------------------\n\n`;
    });
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const sessionTitle = chats.find(c => c.id === activeChatId)?.title || 'session';
    const sanitizedTitle = sessionTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.download = `finor_chat_${sanitizedTitle}.txt`;
    link.click();
  };

  const renderInputForm = (isCenter = false) => {
    return (
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          handleSendChat();
        }}
        className={`relative border rounded-3xl flex items-center px-4 py-2.5 shadow-inner gap-3 w-full transition-all ${
          isLightMode 
            ? 'bg-white border-slate-200 text-slate-805' 
            : 'bg-dark-depth-2/65 border-dark-border/80 text-white focus-within:border-brand-500/50'
        } ${isCenter ? 'max-w-2xl mx-auto shadow-2xl' : ''}`}
      >
        <button 
          type="button" 
          className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
            isLightMode 
              ? 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-850 hover:bg-slate-200' 
              : 'bg-dark-depth-3 border-dark-border/60 text-gray-400 hover:text-white'
          }`}
        >
          <Plus className="w-4 h-4" />
        </button>

        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          disabled={sendingChat || usageRemaining === 0}
          placeholder={usageRemaining === 0 ? "Daily query limit reached (100/100)" : "Ask anything about your portfolio..."}
          className={`flex-1 bg-transparent border-0 text-xs focus:outline-none focus:ring-0 p-0 ${
            isLightMode ? 'text-slate-800 placeholder-slate-450' : 'text-white placeholder-gray-500'
          }`}
        />

        <button 
          type="button" 
          className={`w-7 h-7 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
            isLightMode ? 'text-slate-400 hover:text-slate-750' : 'text-gray-500 hover:text-white'
          }`}
        >
          <Mic className="w-4 h-4" />
        </button>

        <button
          type="submit"
          disabled={sendingChat || !chatInput.trim() || usageRemaining === 0}
          className={`w-7 h-7 rounded-full disabled:opacity-40 flex items-center justify-center transition-all cursor-pointer shrink-0 ${
            isLightMode 
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md' 
              : 'bg-brand-500 hover:bg-brand-400 text-white'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    );
  };

  const handleDeleteChat = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = chats.filter(c => c.id !== chatId);
    setChats(updated);
    localStorage.setItem('finor_ai_chats', JSON.stringify(updated));
    if (activeChatId === chatId) {
      if (updated.length > 0) {
        setActiveChatId(updated[0].id);
      } else {
        setActiveChatId(null);
      }
    }
  };

  const handleStartRename = (chatId: string, currentTitle: string) => {
    setEditingChatId(chatId);
    setEditTitleText(currentTitle);
  };

  const handleSaveRename = (chatId: string) => {
    if (editTitleText.trim()) {
      setChats(prev => {
        const updated = prev.map(c => c.id === chatId ? { ...c, title: editTitleText.trim() } : c);
        localStorage.setItem('finor_ai_chats', JSON.stringify(updated));
        return updated;
      });
    }
    setEditingChatId(null);
  };

  const handleFeedback = (chatId: string, idx: number, type: 'up' | 'down', comment?: string) => {
    const key = `${chatId}_${idx}`;
    setFeedback(prev => {
      const updated = { ...prev, [key]: { type, comment } };
      localStorage.setItem('finor_ai_feedback', JSON.stringify(updated));
      return updated;
    });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    
    // Check if scrolled up more than 300px from the bottom
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isScrolledUp = distanceFromBottom > 300;
    setShowScrollBottom(isScrolledUp);

    // If back at bottom, reset unread count
    if (!isScrolledUp) {
      setUnreadCount(0);
    }
  };

  // Swipe Gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartX.current) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    if (Math.abs(diffX) > Math.abs(diffY)) {
      // Swipe Right: Open Sidebar Drawer on mobile
      if (diffX > 75 && !isSidebarOpen) {
        setIsSidebarOpen(true);
        touchStartX.current = 0; // reset
      }
      // Swipe Left: Close Sidebar Drawer
      else if (diffX < -75 && isSidebarOpen) {
        setIsSidebarOpen(false);
        touchStartX.current = 0; // reset
      }
    }
  };

  const fetchSettings = async () => {
    setLoadingSettings(true);
    setError(null);
    try {
      const res = await apiRequest('/admin/settings');
      if (res && res.price_refresh_interval) {
        setPriceInterval(res.price_refresh_interval);
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setError('Could not retrieve app configurations.');
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSuccess(null);
    setError(null);
    try {
      await apiRequest('/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_refresh_interval: priceInterval })
      });
      
      // Save local storage parameters
      localStorage.setItem('coreHoldSplitRatio', String(splitRatio));
      localStorage.setItem('reentryDipPct', String(reentryDip));

      setSuccess('Settings updated successfully.');
    } catch (err: any) {
      console.error('Update settings failed:', err);
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const executeClearCache = async () => {
    setShowConfirmClear(false);
    setClearingCache(true);
    setSuccess(null);
    setError(null);
    try {
      const res = await apiRequest('/admin/clear-cache', { method: 'POST' });
      setSuccess(res.message);
    } catch (err: any) {
      console.error('Clear cache failed:', err);
      setError(err.message || 'Failed to clear cache.');
    } finally {
      setClearingCache(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'settings') {
      fetchSettings();
    }
  }, [activeSubTab]);

  return (
    <div className={`w-full flex-1 flex flex-col ${activeSubTab === 'ai-chat' ? 'h-full overflow-hidden' : 'space-y-4 md:space-y-6'}`}>
      
      {/* Tab selectors */}
      {(!isMobile || activeSubTab !== 'ai-chat') && (
        <div className={`grid ${isMobile ? 'grid-cols-3' : 'grid-cols-4'} gap-2 sm:gap-4 p-1.5 bg-dark-depth-2 rounded-2xl border border-dark-border select-none flex-shrink-0`}>
          <button
            onClick={() => { 
              setActiveSubTab('news'); 
              setSuccess(null); 
              setError(null); 
              if (setActiveTab) setActiveTab('more');
            }}
            className={`py-2 sm:py-3.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-300 cursor-pointer flex flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeSubTab === 'news'
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/10'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
            <span>Stock News</span>
          </button>
          
          <button
            onClick={() => { 
              setActiveSubTab('settings'); 
              setSuccess(null); 
              setError(null); 
              if (setActiveTab) setActiveTab('more');
            }}
            className={`py-2 sm:py-3.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-300 cursor-pointer flex flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeSubTab === 'settings'
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/10'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
            <span>Settings</span>
          </button>

          {!isMobile ? (
            <button
              onClick={() => { 
                setActiveSubTab('ai-chat'); 
                setSuccess(null); 
                setError(null); 
                if (setActiveTab) setActiveTab('ai-chat');
              }}
              className={`py-2 sm:py-3.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-300 cursor-pointer flex flex-row items-center justify-center gap-1 sm:gap-1.5 ${
                activeSubTab === 'ai-chat'
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/10'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquareCode className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
              <span>AI Assistant</span>
            </button>
          ) : null}

          <button
            onClick={() => { 
              setActiveSubTab('logs'); 
              setSuccess(null); 
              setError(null); 
              if (setActiveTab) setActiveTab('more');
            }}
            className={`py-2 sm:py-3.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all duration-300 cursor-pointer flex flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeSubTab === 'logs'
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/10'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
            <span>System Logs</span>
          </button>
        </div>
      )}

      {/* Global Alerts */}
      {error && (
        <div className="flex-shrink-0 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4.5 h-4.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex-shrink-0 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Subtab Contents router */}
      <div className={activeSubTab === 'ai-chat' ? 'flex-1 min-h-0 flex flex-col h-full md:h-[calc(100vh-164px)] md:mt-4' : 'min-h-[400px]'}>
        
        {/* 1. News subtab */}
        {activeSubTab === 'news' && <News />}

        {/* 2. Settings subtab */}
        {activeSubTab === 'settings' && (
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-6 max-w-xl mx-auto">
            <div className="flex justify-between items-center border-b border-dark-border/40 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Settings className="w-4.5 h-4.5 text-brand-400" />
                App Parameters
              </h3>
              {setActiveTab && (
                <button
                  onClick={() => setActiveTab('profile')}
                  className="px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-[10px] text-brand-400 font-extrabold uppercase hover:bg-brand-500/20 hover:text-white transition-all cursor-pointer"
                >
                  Edit Profile & Credentials
                </button>
              )}
            </div>

            {loadingSettings ? (
              <div className="flex items-center justify-center py-10 gap-2 text-xs text-gray-500">
                <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                <span>Loading settings...</span>
              </div>
            ) : (
              <div className="space-y-5">
                
                {/* Refresh Interval Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                    Price Refresh Interval
                  </label>
                  <div className="flex items-center gap-2.5">
                    <select
                      value={priceInterval}
                      onChange={(e) => setPriceInterval(parseInt(e.target.value, 10))}
                      className="px-3.5 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all flex-1"
                    >
                      <option value={5}>Every 5 minutes</option>
                      <option value={10}>Every 10 minutes</option>
                      <option value={15}>Every 15 minutes</option>
                      <option value={30}>Every 30 minutes</option>
                      <option value={60}>Every 60 minutes</option>
                    </select>
                    
                    <button
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="px-4 py-2.5 bg-brand-500 hover:bg-brand-400 text-dark-depth-0 text-xs font-extrabold uppercase rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                    </button>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-1 leading-relaxed">
                    Set how frequently the system requests Yahoo Finance API for live market pricing ticks.
                  </p>
                </div>

                {/* Core Hold Profit Harvest Split Ratio */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                    Core Hold Profit Harvest Split Ratio (%)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="90"
                    value={splitRatio}
                    onChange={(e) => setSplitRatio(Math.min(95, Math.max(5, parseInt(e.target.value, 10) || 80)))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 transition-all"
                    placeholder="80"
                  />
                  <p className="text-[9px] text-gray-400 mt-1 leading-relaxed">
                    Percentage of position to suggest selling when booking profit on Core Hold stocks (default: 80%).
                  </p>
                </div>

                {/* Core Hold Re-entry Dip Alert */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                    Core Hold Re-entry Dip Alert (%)
                  </label>
                  <input
                    type="number"
                    max="-1"
                    min="-50"
                    value={reentryDip}
                    onChange={(e) => setReentryDip(Math.min(-1, Math.max(-90, parseInt(e.target.value, 10) || -10)))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 transition-all"
                    placeholder="-10"
                  />
                  <p className="text-[9px] text-gray-400 mt-1 leading-relaxed">
                    Percentage dip from current LTP to suggest re-entry on Core Hold stocks (e.g. -10%).
                  </p>
                </div>

                {/* Maintenance Section */}
                <div className="pt-4 border-t border-dark-border/40 space-y-4">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Maintenance</h4>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-dark-depth-2/40 border border-dark-border/40">
                    <div>
                      <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                        Clear Cached Data
                      </h5>
                      <p className="text-[9px] text-gray-400 mt-0.5 leading-relaxed">
                        Flush all locally saved historical charting prices and holding news announcements.
                      </p>
                    </div>
                    
                    <button
                      onClick={() => setShowConfirmClear(true)}
                      disabled={clearingCache}
                      className="px-4 py-2 rounded-xl text-[10px] font-bold uppercase border border-dark-border bg-dark-depth-2 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20 text-gray-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {clearingCache ? <Loader2 className="w-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Clear Cache
                    </button>
                  </div>
                </div>

                {/* Account Settings */}
                <div className="pt-4 border-t border-dark-border/40">
                  <button
                    onClick={signOut}
                    className="w-full py-2.5 rounded-xl border border-dark-border hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-500 text-gray-400 transition-all text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out Account
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. System Logs subtab */}
        {activeSubTab === 'logs' && (() => {
          const infoCount = logsList.filter(l => l.type === 'info' || !l.type).length;
          const successCount = logsList.filter(l => l.type === 'success').length;
          const warnCount = logsList.filter(l => l.type === 'warn').length;
          const errorCount = logsList.filter(l => l.type === 'error').length;

          const filteredLogs = logsList.filter(log => {
            const matchesSearch = log.message.toLowerCase().includes(logSearch.toLowerCase());
            const matchesType = logTypeFilter === 'all' || 
              (logTypeFilter === 'info' && (!log.type || log.type === 'info')) ||
              log.type === logTypeFilter;
            return matchesSearch && matchesType;
          });

          return (
            <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4 max-w-4xl mx-auto flex flex-col h-[550px] w-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-dark-border/40 pb-4 flex-shrink-0">
                <div className="space-y-0.5 border-0">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    System Execution Trails
                  </h3>
                  <p className="text-[10px] text-gray-400">Track real-time background cycles, database operations, and API events.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const logs = SystemLogger.getLogs();
                      const text = logs.map(l => `[${l.timestamp}] [${l.type ? l.type.toUpperCase() : 'INFO'}] ${l.message}`).join('\n');
                      navigator.clipboard.writeText(text);
                      setSuccess('Logs copied to clipboard!');
                      setTimeout(() => setSuccess(null), 3000);
                    }}
                    className="px-3 py-2 rounded-xl border border-dark-border hover:bg-dark-depth-3/50 text-[10px] font-bold text-gray-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Trails
                  </button>
                  <button
                    onClick={() => {
                      SystemLogger.clear();
                      setLogsList([]);
                      setSuccess('Logs cleared!');
                      setTimeout(() => setSuccess(null), 3000);
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/30 text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Trails
                  </button>
                </div>
              </div>

              {/* Search & Filters Stats Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 flex-shrink-0 bg-dark-depth-2/45 p-3 rounded-2xl border border-dark-border/60">
                {/* Search box */}
                <div className="relative flex-grow max-w-sm">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="w-full bg-dark-depth-2/70 border border-dark-border/60 hover:border-dark-border rounded-xl py-1.5 pl-9 pr-4 text-xs font-semibold text-white focus:outline-none focus:border-brand-500 transition-all"
                  />
                </div>

                {/* Filter pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider">
                  <button
                    onClick={() => setLogTypeFilter('all')}
                    className={`px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      logTypeFilter === 'all'
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                        : 'border-dark-border/60 text-gray-400 hover:text-white hover:bg-dark-depth-3/50'
                    }`}
                  >
                    All <span className="px-1 py-0.5 rounded-md bg-dark-depth-1 border border-dark-border/40 text-[8px]">{logsList.length}</span>
                  </button>
                  <button
                    onClick={() => setLogTypeFilter('info')}
                    className={`px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      logTypeFilter === 'info'
                        ? 'bg-blue-500/15 border-blue-500/35 text-blue-400'
                        : 'border-dark-border/60 text-gray-400 hover:text-white hover:bg-dark-depth-3/50'
                    }`}
                  >
                    Info <span className="px-1 py-0.5 rounded-md bg-dark-depth-1 border border-dark-border/40 text-[8px]">{infoCount}</span>
                  </button>
                  <button
                    onClick={() => setLogTypeFilter('success')}
                    className={`px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      logTypeFilter === 'success'
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                        : 'border-dark-border/60 text-gray-400 hover:text-white hover:bg-dark-depth-3/50'
                    }`}
                  >
                    Success <span className="px-1 py-0.5 rounded-md bg-dark-depth-1 border border-dark-border/40 text-[8px]">{successCount}</span>
                  </button>
                  <button
                    onClick={() => setLogTypeFilter('warn')}
                    className={`px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      logTypeFilter === 'warn'
                        ? 'bg-amber-500/15 border-amber-500/35 text-amber-500 dark:text-amber-400'
                        : 'border-dark-border/60 text-gray-400 hover:text-white hover:bg-dark-depth-3/50'
                    }`}
                  >
                    Warn <span className="px-1 py-0.5 rounded-md bg-dark-depth-1 border border-dark-border/40 text-[8px]">{warnCount}</span>
                  </button>
                  <button
                    onClick={() => setLogTypeFilter('error')}
                    className={`px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                      logTypeFilter === 'error'
                        ? 'bg-rose-500/15 border-rose-500/35 text-rose-500 dark:text-rose-400'
                        : 'border-dark-border/60 text-gray-400 hover:text-white hover:bg-dark-depth-3/50'
                    }`}
                  >
                    Error <span className="px-1 py-0.5 rounded-md bg-dark-depth-1 border border-dark-border/40 text-[8px]">{errorCount}</span>
                  </button>
                </div>
              </div>

              {/* Console logs view */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[10px] scrollbar-hidden">
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-20 text-gray-500 italic text-xs">
                    No matching logs found in console buffer.
                  </div>
                ) : (
                  filteredLogs.map((log, idx) => {
                    const time = new Date(log.timestamp).toLocaleTimeString('en-IN', { hour12: false });
                    let borderClass = 'border-l-4 border-l-blue-500 bg-blue-500/[0.03] border-dark-border/40 text-blue-400';
                    if (log.type === 'success') borderClass = 'border-l-4 border-l-emerald-500 bg-emerald-500/[0.03] border-dark-border/40 text-emerald-500 dark:text-emerald-400';
                    if (log.type === 'error') borderClass = 'border-l-4 border-l-rose-500 bg-rose-500/[0.03] border-dark-border/40 text-rose-500 dark:text-rose-400';
                    if (log.type === 'warn') borderClass = 'border-l-4 border-l-amber-500 bg-amber-500/[0.03] border-dark-border/40 text-amber-600 dark:text-amber-400';

                    return (
                      <div key={idx} className={`p-2.5 rounded-r-lg border-y border-r flex items-start gap-3.5 leading-relaxed transition-all hover:bg-dark-depth-2/30 ${borderClass}`}>
                        <span className="opacity-60 flex-shrink-0 select-none font-bold text-gray-400">{time}</span>
                        <span className="font-semibold break-all select-text text-gray-300 dark:text-gray-200">{log.message}</span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-2 border-t border-dark-border/40 text-[9px] text-gray-500 font-semibold uppercase tracking-wider flex items-center justify-between select-none flex-shrink-0">
                <span>Cleared automatically once daily</span>
                <span>Total Logs: {logsList.length}</span>
              </div>
            </div>
          );
        })()}

        {/* 3. AI Chat subtab */}
        {activeSubTab === 'ai-chat' && (
          <div 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            className={`flex-1 min-h-0 flex flex-row relative h-full w-full overflow-hidden md:rounded-2xl md:border ${
              isLightMode 
                ? 'bg-white md:border-slate-200 border-0' 
                : 'bg-dark-depth-1 md:border-dark-border border-0'
            }`}
          >
            {/* Backdrop overlay (mobile only) */}
            {isSidebarOpen && (
              <div 
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] md:hidden transition-all animate-fadeIn"
              />
            )}

            {/* Left Chat History Sidebar */}
            <div className={`w-[200px] shrink-0 h-full border-r flex flex-col transition-transform duration-300 z-[60] md:relative md:translate-x-0 ${
              isLightMode 
                ? 'bg-slate-50/50 border-slate-200' 
                : 'bg-dark-depth-2 border-dark-border'
            } ${
              isSidebarOpen ? 'fixed left-0 top-0 bottom-0 translate-x-0' : 'fixed -translate-x-full md:translate-x-0'
            }`}>
              {/* Sidebar Header */}
              <div className="p-4 border-b border-dark-border/40 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                  Chat History
                </span>
                
                <button
                  type="button"
                  onClick={handleNewChat}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                    isLightMode 
                      ? 'border-slate-250 hover:bg-slate-100 text-slate-700 bg-white' 
                      : 'border-dark-border hover:bg-dark-depth-3 text-gray-300'
                  }`}
                  title="New Chat"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Chat Sessions List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                {chats.length === 0 ? (
                  <div className="text-center py-12 px-4 flex flex-col items-center justify-center space-y-3 select-none">
                    <div className={`p-3 rounded-full border ${
                      isLightMode 
                        ? 'bg-slate-100 border-slate-200 text-slate-400' 
                        : 'bg-dark-depth-3/60 border-dark-border text-gray-550'
                    }`}>
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <p className={`text-[10px] font-black uppercase tracking-wider ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>No Past Chats</p>
                      <p className={`text-[10px] font-semibold max-w-[150px] mx-auto leading-relaxed ${isLightMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        Start a new chat to begin.
                      </p>
                    </div>
                  </div>
                ) : (
                  chats.map(chat => {
                    const isEditing = editingChatId === chat.id;
                    const isActive = activeChatId === chat.id;
                    return (
                      <div
                        key={chat.id}
                        onClick={() => { if (!isEditing) { setActiveChatId(chat.id); setIsSidebarOpen(false); } }}
                        className={`group flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                          isActive 
                            ? (isLightMode ? 'bg-indigo-55/70 text-indigo-700 border-l-2 border-indigo-600' : 'bg-brand-500/10 text-brand-400 border-l-2 border-brand-500') 
                            : (isLightMode ? 'text-slate-650 hover:bg-slate-100 hover:text-slate-900 border-l-2 border-transparent' : 'text-gray-400 hover:bg-dark-depth-3/60 hover:text-white border-l-2 border-transparent')
                        }`}
                      >
                        <div className="flex-1 min-w-0 mr-2" onDoubleClick={() => handleStartRename(chat.id, chat.title)}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={editTitleText}
                              onChange={e => setEditTitleText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveRename(chat.id);
                                if (e.key === 'Escape') setEditingChatId(null);
                              }}
                              onBlur={() => handleSaveRename(chat.id)}
                              autoFocus
                              className={`w-full px-1.5 py-0.5 text-xs rounded border focus:outline-none ${
                                isLightMode 
                                  ? 'bg-white border-slate-300 text-slate-850 focus:border-indigo-500' 
                                  : 'bg-dark-depth-3 border-dark-border text-white focus:border-brand-500'
                              }`}
                            />
                          ) : (
                            <div className="truncate">
                              <p className="truncate font-bold leading-normal">{chat.title}</p>
                              <span className="text-[9px] text-gray-505 block mt-0.5">
                                {new Date(chat.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleStartRename(chat.id, chat.title); }}
                              className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-neutral-800 transition-colors ${isLightMode ? 'text-slate-500 hover:text-slate-800' : 'text-gray-400 hover:text-white'}`}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteChat(chat.id, e)}
                              className={`p-1 rounded hover:bg-rose-500/10 hover:text-rose-500 transition-colors ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              
              {/* Mobile-only subtab links in sidebar */}
              {isMobile && (
                <div className={`p-3 pb-20 border-t shrink-0 space-y-1.5 ${
                  isLightMode 
                    ? 'border-slate-200 bg-slate-50' 
                    : 'border-dark-border/40 bg-dark-depth-3/20'
                }`}>
                  <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 block px-2">
                    Navigation
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubTab('news');
                      setIsSidebarOpen(false);
                      if (setActiveTab) setActiveTab('more');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isLightMode
                        ? 'text-slate-650 hover:bg-slate-100 hover:text-slate-900'
                        : 'text-gray-400 hover:bg-dark-depth-3 hover:text-white'
                    }`}
                  >
                    <Newspaper className="w-3.5 h-3.5" />
                    <span>Go to Stock News</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubTab('settings');
                      setIsSidebarOpen(false);
                      if (setActiveTab) setActiveTab('more');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isLightMode
                        ? 'text-slate-650 hover:bg-slate-100 hover:text-slate-900'
                        : 'text-gray-400 hover:bg-dark-depth-3 hover:text-white'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Go to Settings</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Chat Pane Container */}
            <div className="flex-1 flex flex-col min-w-0 h-full relative">
              {/* Header Top Bar */}
              <div className={`flex flex-col relative select-none border-b ${
                isLightMode ? 'border-slate-200 bg-white' : 'border-dark-border bg-dark-depth-1'
              }`}>
                <div className="flex items-center justify-between p-3.5 w-full relative min-h-[52px]">
                  {/* Left Side: Menu button on mobile, Finor Title on desktop */}
                  <div className="flex items-center md:static absolute left-3 top-1/2 -translate-y-1/2 z-10">
                    <button
                      type="button"
                      onClick={() => setIsSidebarOpen(true)}
                      className={`md:hidden p-1.5 rounded-lg border transition-all cursor-pointer ${
                        isLightMode 
                          ? 'border-slate-200 hover:bg-slate-100 text-slate-655' 
                          : 'border-neutral-800 hover:bg-neutral-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      <Menu className="w-4 h-4" />
                    </button>
                    
                    <span className={`text-sm font-extrabold tracking-tight hidden md:flex items-center gap-1.5 ${
                      isLightMode ? 'text-slate-900' : 'text-white'
                    }`}>
                      <Brain className="w-4 h-4 text-brand-500 shrink-0" />
                      <span>Finor AI Coach</span>
                    </span>
                  </div>

                  {/* Center Content: Model selector centered on mobile, adjacent to title on desktop */}
                  <div className="flex items-center justify-center md:justify-start md:ml-4 w-full md:w-auto absolute md:static left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none md:pointer-events-auto">
                    <div className="relative flex items-center gap-1.5 pointer-events-auto">
                      <Sparkles className="w-3 h-3 text-brand-400 shrink-0" />
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="text-[10px] font-extrabold pl-1.5 pr-5 py-0.5 rounded-full border focus:outline-none transition-all cursor-pointer select-none appearance-none"
                        style={{
                          backgroundColor: isLightMode ? '#eff6ff' : 'rgba(99, 102, 241, 0.1)',
                          color: isLightMode ? '#4f46e5' : '#818cf8',
                          borderColor: isLightMode ? '#e0e7ff' : 'rgba(99, 102, 241, 0.2)',
                          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${isLightMode ? '%234f46e5' : '%23818cf8'}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 0.35rem center',
                          backgroundSize: '0.6em'
                        }}
                      >
                        <option value="default">Default (Auto-Switch)</option>
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Right Side: Usage & Mode */}
                  <div className="flex items-center gap-2 md:static absolute right-3 top-1/2 -translate-y-1/2 z-10">
                    {usageRemaining !== null && (
                      <span className={`text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-lg select-none ${
                        usageRemaining <= 20 
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/25 animate-pulse' 
                          : (isLightMode ? 'bg-slate-100 text-slate-655' : 'bg-dark-depth-3 text-gray-400')
                      }`}>
                        {isMobile ? `${usageRemaining}/100` : `${usageRemaining} of 100 queries left`}
                      </span>
                    )}
                    {messages.length > 0 && (
                      <button
                        type="button"
                        onClick={handleExportChat}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          isLightMode 
                            ? 'border-slate-200 hover:bg-slate-100 text-slate-655' 
                            : 'border-neutral-800 hover:bg-neutral-800 text-gray-400 hover:text-white'
                        }`}
                        title="Export Chat History"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsLightMode(!isLightMode)}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                        isLightMode 
                          ? 'border-slate-200 hover:bg-slate-100 text-slate-655' 
                          : 'border-neutral-800 hover:bg-neutral-800 text-gray-400 hover:text-white'
                      }`}
                      title={isLightMode ? "Switch to Dark Mode" : "Switch to Light Mode"}
                    >
                      {isLightMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Progress bar at the absolute bottom of header */}
                <div className={`w-full h-[2px] absolute bottom-0 left-0 right-0 overflow-hidden ${isLightMode ? 'bg-slate-200/50' : 'bg-neutral-850/50'}`}>
                  <div 
                    className={`h-full transition-all duration-500 ${getProgressBarColor(usageRemaining !== null ? usageRemaining : 100)}`}
                    style={{ width: `${usageRemaining !== null ? (usageRemaining / 100) * 100 : 100}%` }}
                  />
                </div>
              </div>

              {/* Messages list relative container */}
              <div className="flex-1 min-h-0 flex flex-col relative">
                <div 
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className={`flex-1 overflow-y-auto px-2 md:px-6 py-4 space-y-4 scrollbar-thin select-text ${
                    isLightMode ? 'bg-white' : 'bg-dark-depth-1'
                  }`}
                >
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-6 space-y-10 select-none animate-fadeIn max-w-3xl mx-auto w-full">
                      {/* Welcome Section */}
                      <div className="space-y-4">
                        <h4 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-brand-100 via-indigo-300 to-brand-400 bg-clip-text text-transparent py-2">
                          Ready when you are
                        </h4>
                        <p className={`text-xs max-w-md leading-relaxed mx-auto ${
                          isLightMode ? 'text-slate-500' : 'text-gray-400'
                        }`}>
                          Ask your portfolio coach anything about holdings, trade matches, discipline rules, or broker operations.
                        </p>
                      </div>

                      {/* Gemini Center Input Box */}
                      <div className="w-full max-w-2xl px-4">
                        {renderInputForm(true)}
                      </div>
                      
                      {/* Quick Suggestions grid */}
                      <div className="w-full max-w-2xl space-y-3.5 pt-4">
                        <span className="text-[9px] font-black text-gray-500 tracking-widest uppercase block mb-1">
                          Quick Analysis Suggestions
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                          {[
                            { text: 'Analyse my portfolio', desc: 'Full holdings review', icon: LineChart, color: 'from-blue-500/10 to-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:border-indigo-500/40 shadow-indigo-500/5' },
                            { text: 'Which stock is my best performer?', desc: 'Highest ROI assets', icon: TrendingUp, color: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20 text-emerald-400 hover:border-emerald-500/40 shadow-emerald-500/5' },
                            { text: 'Should I book profit on any stock?', desc: 'Unrealized gains checks', icon: Coins, color: 'from-amber-500/10 to-orange-500/10 border-amber-500/20 text-amber-400 hover:border-amber-500/40 shadow-amber-500/5' }
                          ].map((item) => (
                            <button
                              key={item.text}
                              type="button"
                              onClick={() => handleSendChat(item.text)}
                              disabled={sendingChat || usageRemaining === 0}
                              className={`flex flex-col items-center justify-center text-center p-5 border rounded-2xl bg-gradient-to-br cursor-pointer transition-all duration-300 disabled:opacity-40 shadow-md hover:scale-[1.03] group ${
                                isLightMode 
                                  ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 hover:border-indigo-500/40' 
                                  : `${item.color} bg-dark-depth-2/80`
                              }`}
                            >
                              <item.icon className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />
                              <span className="text-xs font-bold leading-snug text-white group-hover:text-brand-300 transition-colors">{item.text}</span>
                              <span className="text-[9px] text-gray-500 mt-1.5 font-bold uppercase tracking-wider">{item.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 max-w-3xl mx-auto w-full py-4">
                      {messages.map((msg, idx) => {
                        const time = msg.timestamp || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                        return (
                          <div key={idx} className="w-full">
                            {msg.role === 'user' ? (
                              <div className="flex justify-end w-full py-2">
                                <div className="max-w-[85%] md:max-w-[70%] bg-neutral-800/80 border border-neutral-700/30 text-white rounded-3xl px-5 py-3 text-xs select-text leading-relaxed whitespace-pre-wrap shadow-md">
                                  <p className="select-text font-semibold text-gray-100 tracking-wide">{msg.content}</p>
                                  <span className="text-[8px] text-gray-500 mt-1.5 block text-right font-medium">
                                    {time}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-start w-full py-4 items-start gap-4">
                                {/* Avatar */}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md shrink-0 select-none ${
                                  isLightMode 
                                    ? 'bg-indigo-50 border border-indigo-100 text-indigo-600' 
                                    : 'bg-brand-500/10 border border-brand-500/20 text-brand-400 shadow-brand-500/5'
                                }`}>
                                  <Brain className="w-4.5 h-4.5" />
                                </div>
                                
                                {/* Message Content Container (No bubble, no card background!) */}
                                <div className="flex-1 space-y-3 min-w-0 select-text">
                                  {msg.engine && (
                                    <div className={`text-[9px] font-black uppercase tracking-widest ${
                                      isLightMode ? 'text-indigo-650' : 'text-brand-400'
                                    }`}>
                                      Finor AI Coach ({msg.engine})
                                    </div>
                                  )}
                                  
                                  <div className={`text-[13px] leading-relaxed select-text font-medium text-gray-150`}>
                                    <MarkdownView text={msg.content} isLightMode={isLightMode} />
                                  </div>
                                  
                                  {msg.pendingConfirm && (
                                    <OrderConfirmationCard 
                                      args={msg.pendingConfirm.args}
                                      onConfirm={() => handleConfirmOrder(msg.pendingConfirm!.args, idx)}
                                      onCancel={() => handleCancelOrder(idx)}
                                      isLightMode={isLightMode}
                                    />
                                  )}
                                  
                                  <div className="flex items-center justify-between pt-1 select-none gap-4">
                                    <div className="flex items-center gap-1.5">
                                      <MessageActions 
                                        msg={msg}
                                        msgIdx={idx}
                                        activeChatId={activeChatId || ''}
                                        feedback={feedback}
                                        onFeedback={handleFeedback}
                                        isLightMode={isLightMode}
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {msg.responseTime !== undefined && (
                                        <span className={`text-[8px] font-black flex items-center gap-0.5 ${
                                          isLightMode ? 'text-indigo-650' : 'text-brand-400'
                                        }`}>
                                          ⚡ {msg.responseTime.toFixed(1)}s
                                        </span>
                                      )}
                                      <span className={`text-[8px] font-medium ${
                                        isLightMode ? 'text-slate-400' : 'text-gray-500'
                                      }`}>
                                        {time}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {sendingChat && (
                        <div className="flex justify-start w-full py-4 items-start gap-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md shrink-0 select-none ${
                            isLightMode 
                              ? 'bg-indigo-50 border border-indigo-100 text-indigo-600' 
                              : 'bg-brand-500/10 border border-brand-500/20 text-brand-400 shadow-brand-500/5'
                          }`}>
                            <Brain className="w-4.5 h-4.5 animate-pulse" />
                          </div>
                          <div className="flex-1 space-y-3 min-w-0">
                            <div className={`text-[9px] font-black uppercase tracking-widest ${
                              isLightMode ? 'text-indigo-650' : 'text-brand-400'
                            }`}>
                              Finor AI is thinking...
                            </div>
                            
                            <div className="flex items-center gap-2.5 text-xs text-gray-400 font-semibold select-none">
                              <Loader2 className="w-4.5 h-4.5 text-brand-500 animate-spin shrink-0" />
                              <span>{getThinkingText(thinkingStep)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Floating scroll to bottom badge */}
                {showScrollBottom && (
                  <button
                    type="button"
                    onClick={() => {
                      scrollToBottom();
                      setUnreadCount(0);
                    }}
                    className={`absolute p-2.5 rounded-full border shadow-xl flex items-center justify-center transition-all cursor-pointer z-25 hover:scale-105 active:scale-95 right-6 bottom-6 ${
                      isLightMode 
                        ? 'bg-white border-slate-200 text-indigo-650 hover:bg-slate-50 shadow-slate-200/50' 
                        : 'bg-dark-depth-3 border-dark-border text-brand-400 hover:bg-dark-depth-2'
                    }`}
                  >
                    <ArrowDown className="w-4.5 h-4.5 animate-bounce" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white min-w-4 text-center leading-none animate-in zoom-in">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Bottom Sticky Input Area (Only visible when messages are present) */}
              {messages.length > 0 && (
                <div 
                  className={`w-full shrink-0 px-4 py-3 border-t transition-all z-20 ${
                    isLightMode 
                      ? 'bg-white border-slate-200 text-slate-805' 
                      : 'bg-dark-depth-1 border-[#2d3748] text-white'
                  }`}
                >
                  <div className="max-w-3xl mx-auto w-full flex flex-col gap-2">
                    {/* Prompt chips */}
                    <div className="flex items-center gap-2 overflow-x-auto md:overflow-x-visible md:flex-wrap md:justify-center pb-1.5 md:pb-0 scrollbar-hidden select-none -mx-2 px-2 mask-gradient whitespace-nowrap">
                      {promptChips.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => setChatInput(chip.text)}
                          disabled={sendingChat || usageRemaining === 0}
                          className={`px-3 py-1.5 border rounded-full text-[10px] font-bold whitespace-nowrap cursor-pointer transition-all shrink-0 ${
                            isLightMode 
                              ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-500/40 shadow-sm' 
                              : 'bg-dark-depth-2 hover:bg-dark-depth-3 border-dark-border text-gray-300 hover:border-brand-500/40'
                          }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>

                    {/* Form helper call */}
                    {renderInputForm(false)}
                    
                    <p className={`text-[8.5px] text-center mt-1 select-none font-medium tracking-wide ${
                      isLightMode ? 'text-slate-450' : 'text-gray-500'
                    }`}>
                      Finor AI Coach can make mistakes. Verify critical trade details before taking actions.
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {showConfirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-depth-0/85 backdrop-blur-md">
          <div className="glass-panel w-full max-w-sm rounded-3xl p-6 border border-dark-border shadow-2xl flex flex-col items-center text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-3 bg-rose-500/10 text-rose-500 rounded-full border border-rose-500/20">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white font-display">Clear Cache?</h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                This will delete all cached historical prices and stock news headlines. Fresh data will fetch on your next request.
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
                onClick={executeClearCache}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white transition-all cursor-pointer shadow-lg shadow-rose-500/10"
              >
                Yes, Clear Cache
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
