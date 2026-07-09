import { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { Loader2, Users, Landmark, AlertCircle, MessageSquare, Check, RefreshCw, Lock } from 'lucide-react';

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

export const AdminPortal = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Active filter state
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'REVIEWING' | 'RESOLVED'>('ALL');
  
  // Selected ticket for resolution details
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [adminResponseText, setAdminResponseText] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const ticketsData = await apiRequest('/admin/tickets');
      const usersData = await apiRequest('/admin/users-count');
      setTickets(ticketsData);
      setTotalUsers(usersData.totalUsers);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to fetch admin dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !adminResponseText.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await apiRequest(`/admin/tickets/${selectedTicket.id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ admin_response: adminResponseText })
      });

      setSuccess('Ticket resolved and response recorded successfully!');
      setAdminResponseText('');
      setSelectedTicket(null);
      // Refresh list
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to submit response.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!selectedTicket) return;
    setGeneratingKey(true);
    setError(null);
    setSuccess(null);
    try {
      const res: any = await apiRequest(`/admin/tickets/${selectedTicket.id}/generate-reset-key`, {
        method: 'POST'
      });
      setSuccess(res.message || 'Reset key generated and emailed successfully!');
      setSelectedTicket(null);
      await fetchData();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate reset key.');
    } finally {
      setGeneratingKey(false);
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (statusFilter === 'ALL') return true;
    return ticket.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Portal Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase">Super Admin Portal</h1>
          <p className="text-xs text-gray-400 mt-1">Manage global user accounts, system metrics, and client support tickets.</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border/80 text-gray-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Alert Banners */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Metrics Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Registered SaaS Tenants</span>
          <span className="text-2xl font-black text-brand-400 mt-1.5 block">{totalUsers} Users</span>
          <span className="text-[9px] text-gray-400 mt-1 block">Active user profiles in public schema</span>
          <Users className="absolute top-4 right-4 w-5 h-5 text-brand-500/20" />
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Pending Tickets</span>
          <span className="text-2xl font-black text-amber-500 mt-1.5 block">
            {tickets.filter(t => t.status !== 'RESOLVED').length} Tickets
          </span>
          <span className="text-[9px] text-gray-400 mt-1 block">Requiring review or response</span>
          <MessageSquare className="absolute top-4 right-4 w-5 h-5 text-amber-500/20" />
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-dark-border relative overflow-hidden">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Security Isolation Mode</span>
          <span className="text-2xl font-black text-emerald-400 mt-1.5 block">Strict RLS</span>
          <span className="text-[9px] text-gray-400 mt-1 block">Zero-Trust schema separation active</span>
          <Landmark className="absolute top-4 right-4 w-5 h-5 text-emerald-500/20" />
        </div>
      </div>

      {/* Main Support Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Ticket Selector column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel rounded-3xl border border-dark-border overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-dark-border/40 pb-3 flex-wrap gap-2">
              <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">Support Ticketing System</h3>
              <div className="flex items-center gap-1.5 bg-dark-depth-2 p-1 rounded-xl border border-dark-border/60">
                {(['ALL', 'OPEN', 'REVIEWING', 'RESOLVED'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      statusFilter === f 
                        ? 'bg-brand-500 text-white' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-xs font-semibold">
                No tickets matching criteria found.
              </div>
            ) : (
              <div className="divide-y divide-dark-border/40 max-h-[500px] overflow-y-auto pr-1">
                {filteredTickets.map(t => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTicket(t);
                      setAdminResponseText(t.admin_response || '');
                    }}
                    className={`p-4 space-y-2 hover:bg-dark-depth-2/20 transition-all rounded-2xl cursor-pointer mt-1 ${
                      selectedTicket?.id === t.id ? 'bg-brand-500/5 border border-brand-500/30' : 'border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-sm text-white">{t.subject}</span>
                      <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${
                        t.status === 'RESOLVED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : t.status === 'REVIEWING'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {t.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed">{t.description}</p>
                    <div className="flex items-center justify-between text-[9px] text-gray-500 pt-1 font-semibold">
                      <span>User: {t.profiles?.email || t.user_id}</span>
                      <span>{new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Resolution Column */}
        <div className="lg:col-span-1">
          {selectedTicket ? (
            <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4 animate-in fade-in slide-in-from-right-5 duration-200">
              <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">Resolve Ticket</h3>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="text-xs text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-gray-400 block font-bold uppercase text-[9px]">Subject</span>
                  <span className="text-white mt-1 block font-semibold">{selectedTicket.subject}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold uppercase text-[9px]">User Email</span>
                  <span className="text-gray-300 mt-1 block font-semibold">{selectedTicket.profiles?.email || selectedTicket.user_id}</span>
                </div>
                <div>
                  <span className="text-gray-400 block font-bold uppercase text-[9px]">Description</span>
                  <p className="text-gray-300 mt-1 leading-relaxed bg-dark-depth-2 p-3 rounded-xl border border-dark-border/80">
                    {selectedTicket.description}
                  </p>
                </div>
              </div>

              <form onSubmit={handleResolveTicket} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="adminResponse">
                    Admin Response
                  </label>
                  <textarea
                    id="adminResponse"
                    rows={4}
                    required
                    placeholder="Enter resolution instructions or feedback..."
                    value={adminResponseText}
                    onChange={(e) => setAdminResponseText(e.target.value)}
                    disabled={selectedTicket.status === 'RESOLVED' || submitting}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all placeholder:text-gray-500"
                  />
                </div>

                {selectedTicket.status !== 'RESOLVED' ? (
                  <div className="space-y-3">
                    <button
                      type="submit"
                      disabled={submitting || generatingKey || !adminResponseText.trim()}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white font-bold text-xs uppercase tracking-wider hover:from-brand-500 hover:to-brand-600 focus:outline-none active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Acknowledge & Resolve
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerateKey}
                      disabled={generatingKey || submitting}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs uppercase tracking-wider focus:outline-none active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {generatingKey ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Generating Key...
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          Generate & Send Recovery Key
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="p-3 text-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                    Ticket Already Resolved
                  </div>
                )}
              </form>
            </div>
          ) : (
            <div className="glass-panel rounded-3xl border border-dark-border/40 p-8 text-center text-gray-500 text-xs font-semibold">
              Select a support ticket from the list to view full details and submit a resolution response.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
