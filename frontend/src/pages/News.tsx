import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { 
  Newspaper, 
  Loader2, 
  Search, 
  X, 
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Coins,
  Calendar,
  Users,
  FileText
} from 'lucide-react';

interface Article {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  category: 'Dividends' | 'Quarterly Results' | 'Bonus/Split' | 'Regulatory' | 'General';
  stock_symbol: string;
  api_source?: string;
}

interface CorporateAction {
  stock_symbol: string;
  type: string;
  description: string;
  date: string;
  date_type: string;
  is_upcoming: boolean;
}

export const News = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [corporateActions, setCorporateActions] = useState<{ upcoming: CorporateAction[]; past: CorporateAction[] }>({ upcoming: [], past: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sub-tab selection: 'actions' (Corporate Actions) or 'news' (Standard feed)
  const [activeSubTab, setActiveSubTab] = useState<'actions' | 'news'>('actions');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const fetchNewsAndActions = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch news list (also populates/syncs the backend cache)
      const newsRes = await apiRequest('/news');
      setArticles(newsRes || []);
      
      // Fetch parsed corporate actions calendar
      const actionsRes = await apiRequest('/news/corporate-actions');
      setCorporateActions(actionsRes || { upcoming: [], past: [] });
    } catch (err: any) {
      console.error('Failed to load news feed or corporate actions:', err);
      setError(err.message || 'Failed to retrieve stock updates. Ensure your internet connection is active.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNewsAndActions();
  }, []);

  // Extract unique stock symbols from holdings/articles for filtering options
  const uniqueSymbols = ['ALL', ...new Set([
    ...articles.map(art => art.stock_symbol),
    ...corporateActions.upcoming.map(ca => ca.stock_symbol),
    ...corporateActions.past.map(ca => ca.stock_symbol)
  ])];
  const categories = ['ALL', 'Quarterly Results', 'Dividends', 'Bonus/Split', 'Regulatory', 'General'];

  // Filter News Articles
  const filteredArticles = articles.filter(art => {
    const matchesSearch = 
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.stock_symbol.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSymbol = selectedSymbol === 'ALL' || art.stock_symbol === selectedSymbol;
    const matchesCategory = selectedCategory === 'ALL' || art.category === selectedCategory;

    return matchesSearch && matchesSymbol && matchesCategory;
  });

  // Filter Corporate Actions
  const filteredUpcomingActions = corporateActions.upcoming.filter(ca => {
    const matchesSymbol = selectedSymbol === 'ALL' || ca.stock_symbol === selectedSymbol;
    const matchesCategory = selectedCategory === 'ALL' || 
      (selectedCategory === 'Dividends' && ca.type === 'Dividend') ||
      (selectedCategory === 'Quarterly Results' && ca.type === 'Quarterly Results') ||
      (selectedCategory === 'Bonus/Split' && ca.type === 'Bonus/Split') ||
      (selectedCategory === 'General' && (ca.type === 'Board Meeting' || ca.type === 'Annual Report'));
      
    const matchesSearch = searchQuery === '' || 
      ca.stock_symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ca.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ca.type.toLowerCase().includes(searchQuery.toLowerCase());
      
    return matchesSymbol && matchesCategory && matchesSearch;
  });

  const filteredPastActions = corporateActions.past.filter(ca => {
    const matchesSymbol = selectedSymbol === 'ALL' || ca.stock_symbol === selectedSymbol;
    const matchesCategory = selectedCategory === 'ALL' || 
      (selectedCategory === 'Dividends' && ca.type === 'Dividend') ||
      (selectedCategory === 'Quarterly Results' && ca.type === 'Quarterly Results') ||
      (selectedCategory === 'Bonus/Split' && ca.type === 'Bonus/Split') ||
      (selectedCategory === 'General' && (ca.type === 'Board Meeting' || ca.type === 'Annual Report'));
      
    const matchesSearch = searchQuery === '' || 
      ca.stock_symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ca.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ca.type.toLowerCase().includes(searchQuery.toLowerCase());
      
    return matchesSymbol && matchesCategory && matchesSearch;
  });

  const getSentimentPill = (sentiment: string) => {
    switch (sentiment) {
      case 'POSITIVE':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <TrendingUp className="w-2.5 h-2.5" />
            Positive
          </span>
        );
      case 'NEGATIVE':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <TrendingDown className="w-2.5 h-2.5" />
            Negative
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Minus className="w-2.5 h-2.5" />
            Neutral
          </span>
        );
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'Dividends':
        return 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/10';
      case 'Quarterly Results':
        return 'bg-brand-500/5 text-brand-400 border border-brand-500/10';
      case 'Regulatory':
        return 'bg-rose-500/5 text-rose-400 border border-rose-500/10';
      case 'Bonus/Split':
        return 'bg-amber-500/5 text-amber-400 border border-amber-500/10';
      default:
        return 'bg-dark-depth-3 text-gray-400 border border-dark-border/40';
    }
  };

  const formatPublishDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'Dividend':
        return <Coins className="w-3.5 h-3.5 text-emerald-400" />;
      case 'Quarterly Results':
        return <FileText className="w-3.5 h-3.5 text-brand-400" />;
      case 'Board Meeting':
        return <Users className="w-3.5 h-3.5 text-indigo-400" />;
      case 'Annual Report':
        return <FileText className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Calendar className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const renderActionItem = (ca: CorporateAction, idx: number) => {
    return (
      <div 
        key={idx}
        className="flex items-center justify-between p-4 border border-dark-border/60 bg-dark-depth-1/40 hover:bg-dark-depth-1/80 rounded-2xl transition-all duration-300 relative select-none"
      >
        <div className="flex items-center gap-3">
          {/* Icon Circle */}
          <div className="w-8 h-8 rounded-full bg-dark-depth-2/80 flex items-center justify-center border border-dark-border/50 shadow-inner flex-shrink-0">
            {getActionIcon(ca.type)}
          </div>
          
          {/* Event Content */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-white uppercase tracking-wide">
              <span className="text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded text-[9px] tracking-wide mr-1 select-none">
                {ca.stock_symbol}
              </span>
              <span>{ca.type}</span>
              {(ca.type === 'Quarterly Results' || ca.type === 'Annual Report') && (
                <span className="text-brand-500 font-extrabold text-[8px] transform rotate-90 scale-75 ml-0.5">▲</span>
              )}
            </div>
            <div className="text-[10px] text-gray-400 font-semibold mt-0.5 max-w-xs sm:max-w-md">
              {ca.description}
            </div>
          </div>
        </div>
        
        {/* Date block */}
        <div className="text-right flex-shrink-0">
          <div className="text-[8px] font-extrabold text-gray-500 uppercase tracking-widest">
            {ca.date_type}
          </div>
          <div className="text-[11px] font-extrabold text-white mt-0.5 font-mono">
            {formatDate(ca.date)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-dark-border/40 pb-3.5 flex-wrap gap-3 select-none">
        <div className="flex items-center gap-2.5">
          <Newspaper className="w-5 h-5 text-brand-500" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Holding Stock News Feed</h2>
          {articles.length > 0 && activeSubTab === 'news' && (
            <span className="text-[9px] bg-dark-depth-3 text-gray-400 px-2 py-0.5 rounded-lg border border-dark-border/50 font-bold uppercase tracking-wider select-none">
              Source: {articles[0].api_source || 'Default'}
            </span>
          )}
        </div>
        <button
          onClick={fetchNewsAndActions}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-xl text-[10px] font-extrabold uppercase bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-white transition-all cursor-pointer disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh Feed'}
        </button>
      </div>

      {/* Filter controls */}
      <div className="glass-panel rounded-2xl border border-dark-border p-4 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Keyword Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 pointer-events-none">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all placeholder:text-gray-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Symbol Filter */}
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="px-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all cursor-pointer"
          >
            <option value="ALL">All Portfolio Stocks</option>
            {uniqueSymbols.filter(s => s !== 'ALL').map(sym => (
              <option key={sym} value={sym}>{sym}</option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500 transition-all cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            {categories.filter(c => c !== 'ALL').map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

        </div>
      </div>

      {/* Sub tabs selection */}
      <div className="flex gap-2 border-b border-dark-border/40 pb-2.5 flex-wrap select-none">
        <button
          onClick={() => setActiveSubTab('actions')}
          className={`px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider border transition-all cursor-pointer ${
            activeSubTab === 'actions'
              ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-extrabold shadow-lg shadow-brand-500/5'
              : 'bg-dark-depth-2/40 border-dark-border/50 text-gray-400 hover:text-white hover:border-dark-border'
          }`}
        >
          Corporate Actions
        </button>
        <button
          onClick={() => setActiveSubTab('news')}
          className={`px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider border transition-all cursor-pointer ${
            activeSubTab === 'news'
              ? 'bg-brand-500/10 border-brand-500/30 text-brand-400 font-extrabold shadow-lg shadow-brand-500/5'
              : 'bg-dark-depth-2/40 border-dark-border/50 text-gray-400 hover:text-white hover:border-dark-border'
          }`}
        >
          News Feed
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-xs text-gray-500 gap-3">
          <Loader2 className="w-7 h-7 text-brand-500 animate-spin" />
          <span>Syncing latest holdings announcements & events...</span>
        </div>
      ) : error ? (
        <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs text-center max-w-sm mx-auto">
          <AlertTriangle className="w-7 h-7 mx-auto mb-2 text-rose-500" />
          <h5 className="font-bold text-white mb-0.5">Could Not Sync Data</h5>
          <p className="text-[10px] text-gray-400 leading-relaxed mb-3">{error}</p>
          <button onClick={fetchNewsAndActions} className="px-3.5 py-1.5 bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-white text-[10px] font-bold rounded-xl transition-all cursor-pointer">
            Retry Sync
          </button>
        </div>
      ) : activeSubTab === 'actions' ? (
        /* Corporate Actions Tab */
        <div className="space-y-6">
          
          {/* Upcoming Events Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest select-none">
              Upcoming Events:
            </h3>
            {filteredUpcomingActions.length === 0 ? (
              <div className="glass-panel rounded-2xl border border-dark-border/40 py-8 text-center text-xs text-gray-500 select-none">
                No upcoming corporate events scheduled.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredUpcomingActions.map((ca, idx) => renderActionItem(ca, idx))}
              </div>
            )}
          </div>

          {/* Past Events Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest select-none">
              Events (Past):
            </h3>
            {filteredPastActions.length === 0 ? (
              <div className="glass-panel rounded-2xl border border-dark-border/40 py-8 text-center text-xs text-gray-500 select-none">
                No past corporate action records found.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredPastActions.map((ca, idx) => renderActionItem(ca, idx))}
              </div>
            )}
          </div>

        </div>
      ) : (
        /* News Feed Tab */
        filteredArticles.length === 0 ? (
          <div className="glass-panel rounded-2xl border border-dark-border/40 py-20 text-center text-xs text-gray-500 select-none">
            <Newspaper className="w-8 h-8 text-gray-700 mx-auto mb-2.5" />
            <h5 className="font-bold text-white">No News Items Found</h5>
            <p className="text-[10px] text-gray-400 mt-1 max-w-xs mx-auto">
              Try adjusting your search query, selecting another category, or verify you have stock symbols loaded under holdings.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredArticles.map((art, idx) => (
              <a
                key={idx}
                href={art.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block glass-panel rounded-2xl border border-dark-border p-4.5 hover:border-brand-500/40 hover:bg-dark-depth-1/40 transition-all duration-300 relative overflow-hidden"
              >
                <div className="flex flex-col gap-2">
                  
                  {/* Meta details */}
                  <div className="flex items-center gap-2 flex-wrap text-[9px] font-bold text-gray-500 select-none">
                    <span className="text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded uppercase tracking-wide">
                      {art.stock_symbol}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded font-extrabold ${getCategoryBadgeColor(art.category)}`}>
                      {art.category}
                    </span>
                    <span>•</span>
                    <span>{art.source} {art.api_source && `(${art.api_source})`}</span>
                    <span>•</span>
                    <span>{formatPublishDate(art.publishedAt)}</span>
                    
                    <div className="ml-auto">
                      {getSentimentPill(art.sentiment)}
                    </div>
                  </div>

                  {/* Article Header */}
                  <h3 className="text-xs font-bold text-white group-hover:text-brand-400 transition-colors flex items-start gap-1 pr-4">
                    <span>{art.title}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-brand-400 flex-shrink-0 transition-all mt-0.5" />
                  </h3>

                  {/* Article Description */}
                  <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                    {art.description}
                  </p>

                </div>
              </a>
            ))}
          </div>
        )
      )}

    </div>
  );
};
