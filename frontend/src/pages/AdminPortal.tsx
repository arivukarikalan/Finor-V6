import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { useAuthStore } from '../context/authStore';
import { 
  Loader2, 
  Users, 
  Landmark, 
  AlertCircle, 
  MessageSquare, 
  Check, 
  RefreshCw, 
  Lock, 
  Trash2, 
  Search, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  Server, 
  Database, 
  Sparkles, 
  Send, 
  Copy, 
  Clock, 
  Megaphone, 
  Terminal, 
  CheckCircle2, 
  ChevronRight, 
  X, 
  CheckCheck,
  TrendingUp,
  RotateCcw
} from 'lucide-react';

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'REVIEWING' | 'RESOLVED';
  admin_response: string | null;
  created_at: string;
  profiles?: {
    email: string;
  };
}

interface UserProfile {
  id: string;
  email: string;
  role: 'USER' | 'SUPER_ADMIN';
  username: string | null;
  country: string | null;
  gender: string | null;
  created_at: string;
  temp_reset_expiry: string | null;
  holdings_count: number;
  trades_count: number;
  has_active_reset_key: boolean;
}

interface PlatformAnalytics {
  metrics: {
    totalUsers: number;
    totalHoldings: number;
    totalTrades: number;
    tickets: {
      total: number;
      open: number;
      reviewing: number;
      resolved: number;
      pending: number;
      resolutionRate: number;
    };
    cache: {
      newsCacheItems: number;
      priceCacheItems: number;
    };
  };
  system: {
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
    memoryHeapTotalMb: number;
    timestamp: string;
  };
}

interface BroadcastBanner {
  message: string;
  severity: 'INFO' | 'WARNING' | 'SUCCESS';
  active: boolean;
  updated_at?: string;
}

export const AdminPortal = () => {
  const { user: currentAuthUser } = useAuthStore();
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'tickets' | 'users' | 'analytics' | 'maintenance'>('tickets');

  // Data states
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [broadcast, setBroadcast] = useState<BroadcastBanner>({
    message: '',
    severity: 'INFO',
    active: false
  });

  // Global operation loading & feedback states
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Tickets module states
  // Default to PENDING ('OPEN' + 'REVIEWING') so resolved tickets automatically vacate the inbox!
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'ALL'>('PENDING');
  const [ticketSearch, setTicketSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [adminResponseText, setAdminResponseText] = useState('');

  // Users module states
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | 'USER' | 'SUPER_ADMIN'>('ALL');

  // Maintenance module states
  const [reconcileResult, setReconcileResult] = useState<any | null>(null);

  // Modal dialog states
  const [ticketToDelete, setTicketToDelete] = useState<SupportTicket | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [userToChangeRole, setUserToChangeRole] = useState<{ user: UserProfile; newRole: 'USER' | 'SUPER_ADMIN' } | null>(null);

  // Fetch all primary admin data
  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketsData, usersData, analyticsData, broadcastData] = await Promise.all([
        apiRequest('/admin/tickets'),
        apiRequest('/admin/users'),
        apiRequest('/admin/analytics'),
        apiRequest('/admin/broadcast').catch(() => ({ banner: null }))
      ]);

      setTickets(ticketsData || []);
      setUsers(usersData || []);
      setAnalytics(analyticsData || null);
      if (broadcastData?.banner) {
        setBroadcast(broadcastData.banner);
      }
    } catch (err: any) {
      console.error('[AdminPortal] Data fetch error:', err);
      setError(err.message || 'Failed to load administration data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Sync selected ticket text when selection changes
  useEffect(() => {
    if (selectedTicket) {
      setAdminResponseText(selectedTicket.admin_response || '');
    } else {
      setAdminResponseText('');
    }
  }, [selectedTicket]);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setSuccess(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedKey(null), 3000);
  };

  // ─── TICKET ACTIONS ────────────────────────────────────────────────────────
  
  // Submit custom response and resolve
  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !adminResponseText.trim()) return;

    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiRequest(`/admin/tickets/${selectedTicket.id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ admin_response: adminResponseText.trim() })
      });

      setSuccess(`Ticket "${selectedTicket.subject}" resolved successfully!`);
      setSelectedTicket(null);
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to resolve ticket.');
    } finally {
      setActionLoading(false);
    }
  };

  // 1-Click quick resolve without changing text
  const handleQuickResolve = async (ticket: SupportTicket) => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiRequest(`/admin/tickets/${ticket.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ 
          status: 'RESOLVED',
          admin_response: ticket.admin_response || 'Resolved by Super Admin.' 
        })
      });

      setSuccess(`Ticket "${ticket.subject}" marked as Resolved!`);
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket(null);
      }
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update ticket status.');
    } finally {
      setActionLoading(false);
    }
  };

  // Generate reset key and dispatch (with option to mark resolved immediately)
  const handleGenerateKey = async (markResolved: boolean) => {
    if (!selectedTicket) return;
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res: any = await apiRequest(`/admin/tickets/${selectedTicket.id}/generate-reset-key`, {
        method: 'POST',
        body: JSON.stringify({ markResolved })
      });

      const key = res.resetKey;
      setSuccess(
        `${res.message || 'Recovery key generated successfully!'} Key: ${key} (Copied to clipboard)`
      );
      if (key) {
        navigator.clipboard.writeText(key);
        setCopiedKey('key');
      }

      setSelectedTicket(null);
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate reset key.');
    } finally {
      setActionLoading(false);
    }
  };

  // Reopen a resolved ticket
  const handleReopenTicket = async (ticket: SupportTicket) => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiRequest(`/admin/tickets/${ticket.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'OPEN' })
      });

      setSuccess(`Ticket "${ticket.subject}" reopened to OPEN queue.`);
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to reopen ticket.');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete single ticket
  const confirmDeleteTicket = async () => {
    if (!ticketToDelete) return;
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiRequest(`/admin/tickets/${ticketToDelete.id}`, {
        method: 'DELETE'
      });

      setSuccess('Ticket permanently deleted from database.');
      if (selectedTicket?.id === ticketToDelete.id) {
        setSelectedTicket(null);
      }
      setTicketToDelete(null);
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to delete ticket.');
    } finally {
      setActionLoading(false);
    }
  };

  // Purge all resolved tickets
  const confirmPurgeResolved = async () => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res: any = await apiRequest('/admin/tickets/clear-resolved', {
        method: 'POST'
      });

      setSuccess(res.message || 'All resolved tickets purged successfully.');
      setShowPurgeModal(false);
      setSelectedTicket(null);
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to purge resolved tickets.');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── USER ACTIONS ──────────────────────────────────────────────────────────
  
  const confirmRoleChange = async () => {
    if (!userToChangeRole) return;
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res: any = await apiRequest(`/admin/users/${userToChangeRole.user.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: userToChangeRole.newRole })
      });

      setSuccess(res.message || 'User role updated successfully.');
      setUserToChangeRole(null);
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update user role.');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── MAINTENANCE ACTIONS ───────────────────────────────────────────────────

  const handleTriggerReconcile = async () => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);
    setReconcileResult(null);

    try {
      const res: any = await apiRequest('/admin/trigger-reconcile', {
        method: 'POST'
      });

      setSuccess('Staging reconciliation executed successfully!');
      setReconcileResult(res);
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Reconciliation failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearCache = async () => {
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res: any = await apiRequest('/admin/clear-cache', {
        method: 'POST'
      });

      setSuccess(res.message || 'Historical price & stock news caches cleared successfully.');
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to clear cache.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res: any = await apiRequest('/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify(broadcast)
      });

      setSuccess(res.message || 'Broadcast announcement updated successfully.');
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save broadcast.');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── FILTERING & COUNTS ───────────────────────────────────────────────────
  
  const pendingCount = tickets.filter(t => t.status === 'OPEN' || t.status === 'REVIEWING').length;
  const openCount = tickets.filter(t => t.status === 'OPEN').length;
  const reviewingCount = tickets.filter(t => t.status === 'REVIEWING').length;
  const resolvedCount = tickets.filter(t => t.status === 'RESOLVED').length;

  const filteredTickets = tickets.filter(t => {
    // 1. Status Filter
    if (statusFilter === 'PENDING') {
      if (t.status !== 'OPEN' && t.status !== 'REVIEWING') return false;
    } else if (statusFilter !== 'ALL') {
      if (t.status !== statusFilter) return false;
    }

    // 2. Keyword Search
    if (ticketSearch.trim()) {
      const query = ticketSearch.toLowerCase();
      const matchSubject = t.subject?.toLowerCase().includes(query);
      const matchDesc = t.description?.toLowerCase().includes(query);
      const matchEmail = t.profiles?.email?.toLowerCase().includes(query) || t.user_id?.toLowerCase().includes(query);
      return matchSubject || matchDesc || matchEmail;
    }

    return true;
  });

  const filteredUsers = users.filter(u => {
    if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false;
    if (userSearch.trim()) {
      const query = userSearch.toLowerCase();
      const matchEmail = u.email?.toLowerCase().includes(query);
      const matchUsername = u.username?.toLowerCase().includes(query);
      const matchId = u.id?.toLowerCase().includes(query);
      return matchEmail || matchUsername || matchId;
    }
    return true;
  });

  // Extract reset key snippet if exists in description or response
  const extractResetKey = (ticket: SupportTicket | null) => {
    if (!ticket) return null;
    const text = `${ticket.description || ''} ${ticket.admin_response || ''}`;
    const match = text.match(/RST-\d{6}/);
    return match ? match[0] : null;
  };

  const currentResetKey = extractResetKey(selectedTicket);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* ─── Portal Executive Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-dark-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase font-display">
                Super Admin Suite
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Global SaaS Multi-Tenant Management, Helpdesk, and System Telemetry
              </p>
            </div>
          </div>
        </div>

        {/* Global Refresh & Quick Status */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-dark-depth-2/80 border border-dark-border text-xs text-gray-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Strict RLS Active</span>
          </div>

          <button
            onClick={fetchAllData}
            disabled={loading || actionLoading}
            className="px-3.5 py-2 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border/80 text-gray-300 hover:text-white transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 text-xs font-semibold"
            title="Refresh Administration Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand-400' : ''}`} />
            <span>Sync Live</span>
          </button>
        </div>
      </div>

      {/* ─── Feedback Banners ─── */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Suite Navigation Tabs ─── */}
      <div className="flex items-center gap-2 border-b border-dark-border/40 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('tickets')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'tickets'
              ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
              : 'text-gray-400 hover:text-white hover:bg-dark-depth-2'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Support Desk</span>
          {pendingCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'tickets'
                ? 'bg-white text-brand-600'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
            }`}>
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'users'
              ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
              : 'text-gray-400 hover:text-white hover:bg-dark-depth-2'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Directory</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            activeTab === 'users' ? 'bg-white text-brand-600' : 'bg-dark-depth-3 text-gray-400'
          }`}>
            {users.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
              : 'text-gray-400 hover:text-white hover:bg-dark-depth-2'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Platform Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab('maintenance')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'maintenance'
              ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
              : 'text-gray-400 hover:text-white hover:bg-dark-depth-2'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Operations & Maintenance</span>
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 1. SUPPORT DESK MODULE                                                */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div 
              onClick={() => setStatusFilter('PENDING')}
              className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'PENDING' ? 'border-amber-500/40 bg-amber-500/5' : 'border-dark-border hover:border-dark-border/80'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-gray-400 font-bold uppercase tracking-wider">
                <span>Needs Action</span>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              </div>
              <div className="text-2xl font-black text-amber-400 mt-1">{pendingCount}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Open + In Review</div>
            </div>

            <div 
              onClick={() => setStatusFilter('OPEN')}
              className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'OPEN' ? 'border-rose-500/40 bg-rose-500/5' : 'border-dark-border hover:border-dark-border/80'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-gray-400 font-bold uppercase tracking-wider">
                <span>Open Queue</span>
                <span className="w-2 h-2 rounded-full bg-rose-400" />
              </div>
              <div className="text-2xl font-black text-rose-400 mt-1">{openCount}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Unanswered inquiries</div>
            </div>

            <div 
              onClick={() => setStatusFilter('RESOLVED')}
              className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'RESOLVED' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-dark-border hover:border-dark-border/80'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-gray-400 font-bold uppercase tracking-wider">
                <span>Resolved</span>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-emerald-400 mt-1">{resolvedCount}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Solved & acknowledged</div>
            </div>

            <div 
              onClick={() => setStatusFilter('ALL')}
              className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === 'ALL' ? 'border-brand-500/40 bg-brand-500/5' : 'border-dark-border hover:border-dark-border/80'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-gray-400 font-bold uppercase tracking-wider">
                <span>All Tickets</span>
                <Database className="w-3.5 h-3.5 text-brand-400" />
              </div>
              <div className="text-2xl font-black text-white mt-1">{tickets.length}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Complete ticket ledger</div>
            </div>
          </div>

          {/* Filter Toolbar & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            
            {/* Filter pills */}
            <div className="flex items-center gap-1.5 bg-dark-depth-2 p-1 rounded-2xl border border-dark-border/70 overflow-x-auto">
              <button
                onClick={() => setStatusFilter('PENDING')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'PENDING'
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Needs Action ({pendingCount})
              </button>

              <button
                onClick={() => setStatusFilter('OPEN')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'OPEN'
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Open ({openCount})
              </button>

              <button
                onClick={() => setStatusFilter('REVIEWING')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'REVIEWING'
                    ? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/20'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                In Review ({reviewingCount})
              </button>

              <button
                onClick={() => setStatusFilter('RESOLVED')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'RESOLVED'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Resolved ({resolvedCount})
              </button>

              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === 'ALL'
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                All ({tickets.length})
              </button>
            </div>

            {/* Search & Bulk Clear */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search tickets by email or keyword..."
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500"
                />
                {ticketSearch && (
                  <button 
                    onClick={() => setTicketSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {resolvedCount > 0 && (
                <button
                  onClick={() => setShowPurgeModal(true)}
                  disabled={actionLoading}
                  className="px-3 py-2 rounded-xl bg-dark-depth-2 hover:bg-rose-500/10 border border-dark-border hover:border-rose-500/30 text-rose-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  title="Bulk clear all resolved tickets from database"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Purge Resolved</span>
                </button>
              )}
            </div>
          </div>

          {/* Main 2-Column Split: Ticket List (Left) & Inspector (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: Ticket Feed */}
            <div className="lg:col-span-7 glass-panel rounded-3xl border border-dark-border overflow-hidden p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
                <span className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Tickets Feed</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-depth-3 text-gray-400">
                    {filteredTickets.length} items
                  </span>
                </span>
                <span className="text-[11px] text-gray-400">
                  Showing {statusFilter === 'PENDING' ? 'Active / Unresolved' : statusFilter} tickets
                </span>
              </div>

              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                  <span className="text-xs text-gray-400">Loading support queue...</span>
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500/50 mx-auto" />
                  <h3 className="text-sm font-bold text-white">No Tickets in this Queue</h3>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto">
                    {statusFilter === 'PENDING'
                      ? 'Great job! All customer support tickets have been resolved and answered.'
                      : 'No tickets matching your current filter criteria were found.'}
                  </p>
                  {statusFilter === 'PENDING' && resolvedCount > 0 && (
                    <button
                      onClick={() => setStatusFilter('RESOLVED')}
                      className="mt-3 text-xs text-brand-400 hover:text-brand-300 font-bold underline cursor-pointer"
                    >
                      View {resolvedCount} Resolved Tickets ➔
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                  {filteredTickets.map(t => {
                    const isSelected = selectedTicket?.id === t.id;
                    const isResolved = t.status === 'RESOLVED';
                    const isReviewing = t.status === 'REVIEWING';

                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${
                          isSelected
                            ? 'bg-brand-500/10 border-brand-500/40 shadow-lg shadow-brand-500/10'
                            : 'bg-dark-depth-2/40 border-dark-border/60 hover:bg-dark-depth-2/80 hover:border-dark-border'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                                isResolved
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                  : isReviewing
                                    ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                                    : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                              }`}>
                                {t.status}
                              </span>
                              <span className="text-[11px] text-gray-400 font-medium truncate">
                                {t.profiles?.email || t.user_id}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-white truncate group-hover:text-brand-300 transition-colors">
                              {t.subject}
                            </h4>
                            <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                              {t.description}
                            </p>
                          </div>

                          {/* Quick Card Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTicketToDelete(t);
                              }}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete ticket"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-brand-400 translate-x-0.5' : 'text-gray-600'}`} />
                          </div>
                        </div>

                        {/* Card footer */}
                        <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2.5 pt-2 border-t border-dark-border/30">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {t.admin_response && (
                            <span className="text-emerald-400/80 font-medium flex items-center gap-1">
                              <CheckCheck className="w-3 h-3" />
                              Response Recorded
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Ticket Details & Action Panel */}
            <div className="lg:col-span-5">
              {selectedTicket ? (
                <div className="glass-panel rounded-3xl border border-dark-border p-5 sm:p-6 space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
                  
                  {/* Top Bar */}
                  <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                        selectedTicket.status === 'RESOLVED'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : selectedTicket.status === 'REVIEWING'
                            ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                            : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      }`}>
                        {selectedTicket.status}
                      </span>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Ticket Inspector
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setTicketToDelete(selectedTicket)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete ticket permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSelectedTicket(null)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-dark-depth-2 transition-colors cursor-pointer"
                        title="Close inspector"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata info */}
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-gray-500 font-bold uppercase text-[9px] block">Subject</span>
                      <h3 className="text-sm font-bold text-white mt-0.5">{selectedTicket.subject}</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-dark-depth-2/60 border border-dark-border/60">
                      <div>
                        <span className="text-gray-500 font-bold uppercase text-[9px] block">User Profile</span>
                        <span className="text-white font-semibold truncate block mt-0.5">
                          {selectedTicket.profiles?.email || selectedTicket.user_id}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 font-bold uppercase text-[9px] block">Submitted</span>
                        <span className="text-gray-300 font-semibold block mt-0.5">
                          {new Date(selectedTicket.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    {/* Full Description */}
                    <div>
                      <span className="text-gray-500 font-bold uppercase text-[9px] block mb-1">Inquiry Description</span>
                      <div className="p-3.5 rounded-2xl bg-dark-depth-2/80 border border-dark-border/80 text-gray-200 text-xs leading-relaxed whitespace-pre-wrap font-medium">
                        {selectedTicket.description}
                      </div>
                    </div>

                    {/* Active Recovery Key Pill if detected */}
                    {currentResetKey && (
                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                            🔑 Recovery Key Generated
                          </span>
                          <span className="font-mono text-sm font-black text-white tracking-widest">
                            {currentResetKey}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopy(currentResetKey, 'Recovery Key')}
                          className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedKey === 'Recovery Key' ? 'Copied!' : 'Copy Key'}</span>
                        </button>
                      </div>
                    )}

                    {/* Existing Admin Response Log */}
                    {selectedTicket.admin_response && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-500 font-bold uppercase text-[9px]">Recorded Admin Response</span>
                          <button
                            onClick={() => handleCopy(selectedTicket.admin_response || '', 'Response')}
                            className="text-[10px] text-brand-400 hover:text-brand-300 font-semibold cursor-pointer"
                          >
                            Copy Log
                          </button>
                        </div>
                        <div className="p-3 rounded-2xl bg-dark-depth-3/60 border border-dark-border/60 text-gray-300 text-xs leading-relaxed font-mono">
                          {selectedTicket.admin_response}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resolution Form & Quick Actions */}
                  <form onSubmit={handleResolveTicket} className="space-y-4 pt-1 border-t border-dark-border/40">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-300 block" htmlFor="ticketResponse">
                        Resolution Notes / User Message
                      </label>
                      <textarea
                        id="ticketResponse"
                        rows={3}
                        placeholder="Type resolution instructions or response..."
                        value={adminResponseText}
                        onChange={(e) => setAdminResponseText(e.target.value)}
                        disabled={actionLoading}
                        className="w-full px-3.5 py-2.5 rounded-2xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all placeholder:text-gray-500"
                      />
                    </div>

                    {/* Primary Action Buttons */}
                    <div className="space-y-2">
                      
                      {/* Submit custom response and mark resolved */}
                      <button
                        type="submit"
                        disabled={actionLoading || !adminResponseText.trim()}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white font-bold text-xs shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:scale-100 active:scale-[0.98]"
                      >
                        {actionLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Acknowledge & Mark as Resolved</span>
                      </button>

                      {/* 1-Click quick resolve (when ticket is OPEN or REVIEWING) */}
                      {selectedTicket.status !== 'RESOLVED' && (
                        <button
                          type="button"
                          onClick={() => handleQuickResolve(selectedTicket)}
                          disabled={actionLoading}
                          className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>1-Click Quick Resolve</span>
                        </button>
                      )}

                      {/* Send Recovery Key & Resolve immediately */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleGenerateKey(true)}
                          disabled={actionLoading}
                          className="py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          title="Generate reset key, send email, and mark ticket resolved immediately"
                        >
                          <Lock className="w-3 h-3" />
                          <span>Send Key & Resolve</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleGenerateKey(false)}
                          disabled={actionLoading}
                          className="py-2 px-3 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-gray-300 hover:text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          title="Generate reset key, send email, keep in review"
                        >
                          <Send className="w-3 h-3" />
                          <span>Send Key (Review)</span>
                        </button>
                      </div>

                      {/* Reopen ticket button (if currently resolved) */}
                      {selectedTicket.status === 'RESOLVED' && (
                        <button
                          type="button"
                          onClick={() => handleReopenTicket(selectedTicket)}
                          disabled={actionLoading}
                          className="w-full py-2 px-3 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-gray-400 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reopen Ticket to Open Queue</span>
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              ) : (
                <div className="glass-panel rounded-3xl border border-dark-border/40 p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-dark-depth-2 border border-dark-border flex items-center justify-center mx-auto text-gray-500">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Select a Support Ticket</h4>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                    Click any ticket from the feed on the left to view user inquiry details, dispatch recovery keys, or submit resolution responses.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 2. USER DIRECTORY MODULE                                              */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-5">
          
          {/* User directory toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-white">Registered SaaS Tenants</span>
              <span className="px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-bold">
                {users.length} Users
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Role filter */}
              <div className="flex items-center gap-1 bg-dark-depth-2 p-1 rounded-xl border border-dark-border/60">
                {(['ALL', 'SUPER_ADMIN', 'USER'] as const).map(role => (
                  <button
                    key={role}
                    onClick={() => setUserRoleFilter(role)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      userRoleFilter === role
                        ? 'bg-brand-500 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {role === 'ALL' ? 'All Roles' : role.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search user email or ID..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-dark-depth-2 border border-dark-border text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          {/* User Table Card */}
          <div className="glass-panel rounded-3xl border border-dark-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-dark-border/60 bg-dark-depth-2/40 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                    <th className="py-3.5 px-5">User Tenant</th>
                    <th className="py-3.5 px-4">Role & Access</th>
                    <th className="py-3.5 px-4">Portfolio Activity</th>
                    <th className="py-3.5 px-4">Account Status</th>
                    <th className="py-3.5 px-4">Joined Date</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border/40">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500 text-xs">
                        No users matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => {
                      const isCurrentUser = currentAuthUser?.id === u.id;
                      const isSuperAdmin = u.role === 'SUPER_ADMIN';

                      return (
                        <tr key={u.id} className="hover:bg-dark-depth-2/30 transition-colors">
                          
                          {/* User Avatar + Email */}
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                                isSuperAdmin
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  : 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                              }`}>
                                {u.email.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-white flex items-center gap-2">
                                  <span className="truncate">{u.email}</span>
                                  {isCurrentUser && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-400 font-extrabold border border-brand-500/30">
                                      YOU
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-500 truncate font-mono">
                                  ID: {u.id.substring(0, 16)}...
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role Badge */}
                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black border ${
                              isSuperAdmin
                                ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                                : 'bg-slate-500/15 border-slate-500/30 text-slate-300'
                            }`}>
                              {isSuperAdmin ? (
                                <>
                                  <ShieldCheck className="w-3 h-3 text-purple-400" />
                                  SUPER ADMIN
                                </>
                              ) : (
                                <>
                                  <Users className="w-3 h-3 text-slate-400" />
                                  STANDARD USER
                                </>
                              )}
                            </span>
                          </td>

                          {/* Portfolio Activity */}
                          <td className="py-4 px-4">
                            <div className="text-gray-300 font-semibold space-y-0.5">
                              <div>{u.holdings_count} Equity Positions</div>
                              <div className="text-[10px] text-gray-500">{u.trades_count} Trades Executed</div>
                            </div>
                          </td>

                          {/* Security Status */}
                          <td className="py-4 px-4">
                            {u.has_active_reset_key ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold animate-pulse">
                                <Lock className="w-3 h-3" />
                                Recovery Key Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium text-[11px]">
                                <Check className="w-3.5 h-3.5" />
                                Active & Verified
                              </span>
                            )}
                          </td>

                          {/* Joined Date */}
                          <td className="py-4 px-4 text-gray-400 font-medium">
                            {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>

                          {/* Role Actions */}
                          <td className="py-4 px-5 text-right">
                            {isCurrentUser ? (
                              <span className="text-[10px] text-gray-500 italic">Self (Locked)</span>
                            ) : isSuperAdmin ? (
                              <button
                                onClick={() => setUserToChangeRole({ user: u, newRole: 'USER' })}
                                disabled={actionLoading}
                                className="px-3 py-1 rounded-xl bg-dark-depth-2 hover:bg-rose-500/10 border border-dark-border hover:border-rose-500/30 text-rose-400 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                              >
                                Demote to User
                              </button>
                            ) : (
                              <button
                                onClick={() => setUserToChangeRole({ user: u, newRole: 'SUPER_ADMIN' })}
                                disabled={actionLoading}
                                className="px-3 py-1 rounded-xl bg-dark-depth-2 hover:bg-purple-500/10 border border-dark-border hover:border-purple-500/30 text-purple-300 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                              >
                                Promote to Admin
                              </button>
                            )}
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 3. PLATFORM ANALYTICS & TELEMETRY MODULE                              */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          
          {/* Main KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Registered Tenants</span>
              <div className="text-3xl font-black text-brand-400 mt-1.5">
                {analytics?.metrics.totalUsers ?? users.length}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">Total SaaS tenant profiles in Supabase</div>
              <Users className="absolute top-4 right-4 w-5 h-5 text-brand-500/20" />
            </div>

            <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Global Holdings Tracked</span>
              <div className="text-3xl font-black text-indigo-400 mt-1.5">
                {analytics?.metrics.totalHoldings ?? '-'}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">Active equity positions monitored</div>
              <Landmark className="absolute top-4 right-4 w-5 h-5 text-indigo-500/20" />
            </div>

            <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Executed Trades Ingested</span>
              <div className="text-3xl font-black text-emerald-400 mt-1.5">
                {analytics?.metrics.totalTrades ?? '-'}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">Processed trade orders in core ledger</div>
              <TrendingUp className="absolute top-4 right-4 w-5 h-5 text-emerald-500/20" />
            </div>

            <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Ticket Resolution Rate</span>
              <div className="text-3xl font-black text-emerald-400 mt-1.5">
                {analytics?.metrics.tickets.resolutionRate ?? 100}%
              </div>
              <div className="w-full bg-dark-depth-3 rounded-full h-1.5 mt-2 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${analytics?.metrics.tickets.resolutionRate ?? 100}%` }}
                />
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                {analytics?.metrics.tickets.resolved ?? resolvedCount} of {analytics?.metrics.tickets.total ?? tickets.length} resolved
              </div>
            </div>

          </div>

          {/* Infrastructure & Host Telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Server Runtime Panel */}
            <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-brand-400" />
                  <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                    Node.js Server Telemetry
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  HEALTHY
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-2xl bg-dark-depth-2/60 border border-dark-border/60 space-y-1">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Process Uptime</span>
                  <span className="font-bold text-white text-sm">
                    {analytics?.system ? `${Math.floor(analytics.system.uptimeSeconds / 3600)}h ${Math.floor((analytics.system.uptimeSeconds % 3600) / 60)}m` : 'Active'}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-dark-depth-2/60 border border-dark-border/60 space-y-1">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Node Runtime</span>
                  <span className="font-bold text-white text-sm font-mono">
                    {analytics?.system.nodeVersion ?? 'v20.x'} ({analytics?.system.platform ?? 'Win32'})
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-dark-depth-2/60 border border-dark-border/60 space-y-1">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Memory (RSS)</span>
                  <span className="font-bold text-white text-sm">
                    {analytics?.system.memoryRssMb ?? 0} MB
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-dark-depth-2/60 border border-dark-border/60 space-y-1">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Heap Utilization</span>
                  <span className="font-bold text-white text-sm">
                    {analytics?.system.memoryHeapUsedMb ?? 0} / {analytics?.system.memoryHeapTotalMb ?? 0} MB
                  </span>
                </div>
              </div>
            </div>

            {/* Database & Cache Telemetry */}
            <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                    Database & Cache Telemetry
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  CONNECTED
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-dark-depth-2/60 border border-dark-border/60">
                  <div>
                    <span className="font-bold text-white block">Stock Price Cache</span>
                    <span className="text-[10px] text-gray-500">Cached Yahoo & NSE market price quotes</span>
                  </div>
                  <span className="font-bold text-brand-400 text-sm">
                    {analytics?.metrics.cache.priceCacheItems ?? 0} Items
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-dark-depth-2/60 border border-dark-border/60">
                  <div>
                    <span className="font-bold text-white block">News & Settings Cache</span>
                    <span className="text-[10px] text-gray-500">Corporate actions, headlines, and settings</span>
                  </div>
                  <span className="font-bold text-brand-400 text-sm">
                    {analytics?.metrics.cache.newsCacheItems ?? 0} Items
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-dark-depth-2/60 border border-dark-border/60">
                  <div>
                    <span className="font-bold text-white block">Row-Level Security (RLS)</span>
                    <span className="text-[10px] text-gray-500">Zero-Trust tenant data isolation</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                    ACTIVE
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 4. OPERATIONS & MAINTENANCE MODULE                                    */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Staging Reconciliation Card */}
            <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-dark-border/40 pb-3">
                <Terminal className="w-4 h-4 text-brand-400" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                  Staging Queue Reconciliation
                </h3>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed">
                Manually process any pending staging transactions and imported Zerodha trade CSV backlogs across all tenants into the core ledger immediately.
              </p>

              <button
                onClick={handleTriggerReconcile}
                disabled={actionLoading}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Run Staging Reconciliation Now</span>
              </button>

              {reconcileResult && (
                <div className="p-3 rounded-2xl bg-dark-depth-2/80 border border-dark-border text-[11px] font-mono text-gray-300 space-y-1">
                  <div className="text-emerald-400 font-bold">Reconciliation Complete:</div>
                  <div>Processed Tx: {JSON.stringify(reconcileResult.transactions || {})}</div>
                  <div>Processed Trades: {JSON.stringify(reconcileResult.trades || {})}</div>
                </div>
              )}
            </div>

            {/* Cache Flush Card */}
            <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-dark-border/40 pb-3">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                  Application Cache Management
                </h3>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed">
                Purges the historical stock price cache and expired news feed cache. This forces fresh live API fetches across market hours without altering portfolios or user settings.
              </p>

              <button
                onClick={handleClearCache}
                disabled={actionLoading}
                className="w-full py-3 px-4 rounded-2xl bg-dark-depth-2 hover:bg-amber-500/15 border border-dark-border hover:border-amber-500/30 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Flush Historical & Price Caches</span>
              </button>
            </div>

          </div>

          {/* Global Broadcast Banner Management */}
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-brand-400" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">
                  Platform-Wide Announcement Banner
                </h3>
              </div>
              <span className="text-[10px] text-gray-400">
                Visible to all active users across the platform
              </span>
            </div>

            <form onSubmit={handleSaveBroadcast} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-300 block" htmlFor="broadcastMsg">
                  Announcement Message
                </label>
                <input
                  id="broadcastMsg"
                  type="text"
                  placeholder="e.g. Scheduled system upgrade tonight at 11:00 PM IST. Live trading sync will resume tomorrow."
                  value={broadcast.message}
                  onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all placeholder:text-gray-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-300 block">
                    Severity Level
                  </label>
                  <div className="flex items-center gap-2">
                    {(['INFO', 'WARNING', 'SUCCESS'] as const).map(sev => (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setBroadcast({ ...broadcast, severity: sev })}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer ${
                          broadcast.severity === sev
                            ? sev === 'INFO'
                              ? 'bg-brand-500 text-white'
                              : sev === 'WARNING'
                                ? 'bg-amber-500 text-white'
                                : 'bg-emerald-500 text-white'
                            : 'bg-dark-depth-2 text-gray-400 border border-dark-border'
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4 sm:pt-6">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={broadcast.active}
                      onChange={(e) => setBroadcast({ ...broadcast, active: e.target.checked })}
                      className="w-4 h-4 rounded text-brand-500 bg-dark-depth-2 border-dark-border focus:ring-brand-500/25"
                    />
                    <span className="text-xs font-bold text-white">Active / Published to Users</span>
                  </label>
                </div>
              </div>

              {/* Live Preview Box */}
              {broadcast.message && broadcast.active && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Live User Preview</span>
                  <div className={`p-3 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 ${
                    broadcast.severity === 'WARNING'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : broadcast.severity === 'SUCCESS'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                  }`}>
                    <Megaphone className="w-4 h-4 shrink-0" />
                    <span>{broadcast.message}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow-lg shadow-brand-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  Save & Update Broadcast
                </button>

                {broadcast.active && (
                  <button
                    type="button"
                    onClick={() => {
                      setBroadcast({ message: '', severity: 'INFO', active: false });
                    }}
                    className="px-4 py-2.5 rounded-2xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-gray-400 hover:text-white font-bold text-xs transition-all cursor-pointer"
                  >
                    Clear Banner
                  </button>
                )}
              </div>
            </form>
          </div>

        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* CONFIRMATION MODALS                                                    */}
      {/* ────────────────────────────────────────────────────────────────────── */}

      {/* 1. Delete Ticket Modal */}
      {ticketToDelete && (
        <div 
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setTicketToDelete(null)}
        >
          <div 
            className="w-full max-w-sm rounded-3xl bg-dark-depth-1 border border-dark-border p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Support Ticket?</h3>
                <p className="text-[10px] text-gray-400">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-dark-depth-2 text-xs text-gray-300 space-y-1">
              <span className="font-bold text-white block truncate">{ticketToDelete.subject}</span>
              <span className="text-[10px] text-gray-500 block truncate">User: {ticketToDelete.profiles?.email || ticketToDelete.user_id}</span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setTicketToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-xs font-bold text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTicket}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-lg shadow-rose-500/20 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Purge Resolved Tickets Modal */}
      {showPurgeModal && (
        <div 
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowPurgeModal(false)}
        >
          <div 
            className="w-full max-w-sm rounded-3xl bg-dark-depth-1 border border-dark-border p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Purge All Resolved Tickets?</h3>
                <p className="text-[10px] text-gray-400">Permanently delete all {resolvedCount} resolved tickets.</p>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Are you sure you want to delete all {resolvedCount} resolved support tickets from the database? This cleans up historical logs and cannot be reversed.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowPurgeModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-xs font-bold text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmPurgeResolved}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-lg shadow-rose-500/20 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Purging...' : `Purge ${resolvedCount} Tickets`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Role Change Modal */}
      {userToChangeRole && (
        <div 
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setUserToChangeRole(null)}
        >
          <div 
            className="w-full max-w-sm rounded-3xl bg-dark-depth-1 border border-dark-border p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-purple-400">
              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Change User Role?</h3>
                <p className="text-[10px] text-gray-400">Confirm role permissions update.</p>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Are you sure you want to change <span className="font-bold text-white">{userToChangeRole.user.email}</span> to{' '}
              <span className="font-bold text-purple-400">{userToChangeRole.newRole}</span>?
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setUserToChangeRole(null)}
                className="flex-1 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-xs font-bold text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmRoleChange}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/20 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Updating...' : 'Confirm Role'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
