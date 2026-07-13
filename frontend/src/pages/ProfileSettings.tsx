import { useState, useEffect } from 'react';
import { useAuthStore } from '../context/authStore';
import { apiRequest } from '../services/api';
import { useToastStore } from '../context/toastStore';
import { 
  Loader2, 
  User, 
  Globe, 
  Lock, 
  ShieldCheck, 
  Mail, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  RefreshCw, 
  Smartphone, 
  Landmark
} from 'lucide-react';

export const ProfileSettings = () => {
  const { profile, fetchProfile } = useAuthStore();
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [gender, setGender] = useState('Male');
  const [sessionExpiryDays, setSessionExpiryDays] = useState(1);

  // Change Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // SMS Ingestion state
  const [showSmsKey, setShowSmsKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  // Zerodha Integration state
  const [zerodhaApiKey, setZerodhaApiKey] = useState('');
  const [zerodhaApiSecret, setZerodhaApiSecret] = useState('');
  const [zerodhaPdfPassword, setZerodhaPdfPassword] = useState('');
  const [showZerodhaSecret, setShowZerodhaSecret] = useState(false);
  const [showPdfPassword, setShowPdfPassword] = useState(false);
  const [savingZerodha, setSavingZerodha] = useState(false);
  const [kiteStatus, setKiteStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'MOCK_MODE'>('MOCK_MODE');
  const [kiteLoginUrl, setKiteLoginUrl] = useState('');

  // Gmail integration state
  const [disconnectingGmail, setDisconnectingGmail] = useState(false);
  const [gmailFilterFrom, setGmailFilterFrom] = useState('noreply@zerodha.com');
  const [gmailFilterSubject, setGmailFilterSubject] = useState('contract note');
  const [gmailClientId, setGmailClientId] = useState('');
  const [gmailClientSecret, setGmailClientSecret] = useState('');
  const [showGmailSecret, setShowGmailSecret] = useState(false);
  const [savingGmailCredentials, setSavingGmailCredentials] = useState(false);
  const [savingGmailFilters, setSavingGmailFilters] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    const fetchDecryptedCredentials = async () => {
      try {
        const credentials = await apiRequest('/auth/decrypted-profile');
        setZerodhaApiKey(credentials.zerodha_api_key || '');
        setZerodhaApiSecret(credentials.zerodha_api_secret || '');
        setZerodhaPdfPassword(credentials.zerodha_pdf_password || '');
        setGmailClientId(credentials.gmail_client_id || '');
        setGmailClientSecret(credentials.gmail_client_secret || '');
      } catch (err) {
        console.error('Failed to fetch decrypted credentials:', err);
      }
    };

    if (profile) {
      setUsername(profile.username || '');
      setCountry(profile.country || '');
      setGender(profile.gender || 'Male');
      setSessionExpiryDays(profile.session_expiry_days || 1);
      setGmailFilterFrom(profile.gmail_filter_from || 'noreply@zerodha.com');
      setGmailFilterSubject(profile.gmail_filter_subject || 'contract note');
      fetchDecryptedCredentials();
    }
  }, [profile]);

  useEffect(() => {
    const fetchKiteConfig = async () => {
      try {
        const data = await apiRequest('/orders/config');
        setKiteStatus(data.status);
        if (data.login_url) {
          setKiteLoginUrl(data.login_url);
        }
      } catch (err) {
        console.error('Error fetching Kite config:', err);
      }
    };
    if (profile) {
      fetchKiteConfig();
    }
  }, [profile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !country) {
      useToastStore.getState().addToast('Username and Country are required.', 'error');
      return;
    }

    setSavingProfile(true);
    try {
      await apiRequest('/auth/update-profile', {
        method: 'POST',
        body: JSON.stringify({ username, country, gender, session_expiry_days: sessionExpiryDays })
      });
      await fetchProfile();
      useToastStore.getState().addToast('Profile updated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast(err.message || 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      useToastStore.getState().addToast('Please fill in current and new password.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      useToastStore.getState().addToast('Passwords do not match.', 'error');
      return;
    }

    setUpdatingPassword(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword
        })
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      useToastStore.getState().addToast('Password changed successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast(err.message || 'Failed to change password.', 'error');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleRegenerateSmsKey = async () => {
    if (!window.confirm('Are you sure you want to regenerate your SMS Ingestion API Key? Any devices currently using your old key will stop syncing.')) {
      return;
    }
    setRegeneratingKey(true);
    try {
      await apiRequest('/auth/regenerate-sms-key', {
        method: 'POST'
      });
      await fetchProfile();
      useToastStore.getState().addToast('SMS Ingestion Key rotated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast(err.message || 'Failed to rotate SMS key.', 'error');
    } finally {
      setRegeneratingKey(false);
    }
  };

  const handleUpdateZerodha = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingZerodha(true);
    try {
      await apiRequest('/auth/update-zerodha-credentials', {
        method: 'POST',
        body: JSON.stringify({
          zerodha_api_key: zerodhaApiKey,
          zerodha_api_secret: zerodhaApiSecret,
          zerodha_pdf_password: zerodhaPdfPassword
        })
      });
      await fetchProfile();
      useToastStore.getState().addToast('Zerodha credentials saved successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast(err.message || 'Failed to save Zerodha credentials.', 'error');
    } finally {
      setSavingZerodha(false);
    }
  };

  const handleUpdateGmailCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGmailCredentials(true);
    try {
      await apiRequest('/auth/update-gmail-credentials', {
        method: 'POST',
        body: JSON.stringify({
          gmail_client_id: gmailClientId,
          gmail_client_secret: gmailClientSecret
        })
      });
      await fetchProfile();
      useToastStore.getState().addToast('Google Cloud App credentials saved successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast(err.message || 'Failed to save Google Cloud credentials.', 'error');
    } finally {
      setSavingGmailCredentials(false);
    }
  };

  const handleSaveGmailFilters = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGmailFilters(true);
    try {
      await apiRequest('/auth/update-profile', {
        method: 'POST',
        body: JSON.stringify({
          gmail_filter_from: gmailFilterFrom,
          gmail_filter_subject: gmailFilterSubject
        })
      });
      await fetchProfile();
      useToastStore.getState().addToast('Gmail sync filter queries updated successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast(err.message || 'Failed to save filter configs.', 'error');
    } finally {
      setSavingGmailFilters(false);
    }
  };

  const handleConnectGmail = () => {
    const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api').replace(/\/$/, '');
    const base = backendUrl.endsWith('/api') ? backendUrl.replace('/api', '') : backendUrl;
    window.open(`${base}/api/gmail/auth?userId=${profile?.id}`, '_self');
  };

  const handleDisconnectGmail = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Gmail integration? Auto-syncing of trades will stop.')) {
      return;
    }
    setDisconnectingGmail(true);
    try {
      await apiRequest('/auth/disconnect-gmail', { method: 'POST' });
      await fetchProfile();
      useToastStore.getState().addToast('Gmail connection disconnected successfully!', 'success');
    } catch (err: any) {
      console.error(err);
      useToastStore.getState().addToast(err.message || 'Failed to disconnect Gmail.', 'error');
    } finally {
      setDisconnectingGmail(false);
    }
  };

  const backendBaseUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api').replace(/\/$/, '');
  const webhookUrl = `${backendBaseUrl.endsWith('/api') ? backendBaseUrl : `${backendBaseUrl}/api`}/finance/sms-webhook`;
  const apkDownloadUrl = `${backendBaseUrl.replace(/\/api$/, '')}/downloads/finor-sms-sync.apk`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyKey = () => {
    if (profile?.sms_api_key) {
      navigator.clipboard.writeText(profile.sms_api_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  // Generate instant setup QR payload
  const qrConfigPayload = JSON.stringify({
    url: webhookUrl,
    key: profile?.sms_api_key || ''
  });
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&color=63-66-f1&bgcolor=0f-14-1f&data=${encodeURIComponent(qrConfigPayload)}`;

  return (
    <div className="space-y-6 w-full px-4 md:px-8">
      
      {/* Premium Profile Header Board */}
      <div className="glass-panel rounded-3xl border border-dark-border p-6 flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-brand-600 via-brand-500 to-indigo-400 flex items-center justify-center text-white text-xl font-extrabold shadow-lg select-none">
            {profile?.username?.charAt(0).toUpperCase() || profile?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">{profile?.username || 'Client Profile'}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{profile?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 select-none">
          <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-2.5 py-1 border border-emerald-500/20 rounded-full">
            Status: Active
          </span>
          <span className="text-[9px] font-black uppercase text-brand-400 bg-brand-500/10 px-2.5 py-1 border border-brand-500/20 rounded-full">
            Role: {profile?.role || 'USER'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Left Column: Tenant Profile, Change Password, and SMS Webhook configuration */}
        <div className="space-y-6">
          
          {/* Profile metadata Card */}
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-dark-border/40 pb-3">
              <User className="w-4 h-4 text-brand-400" />
              <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">Tenant Profile</h3>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {/* Email (Read Only) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="profileEmail">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-505">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="profileEmail"
                    type="email"
                    readOnly
                    disabled
                    value={profile?.email || ''}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2/40 border border-dark-border/40 text-gray-500 text-xs focus:outline-none select-none cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="profileUsername">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="profileUsername"
                    type="text"
                    required
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all"
                  />
                </div>
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="profileCountry">
                  Country
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Globe className="w-4 h-4" />
                  </div>
                  <input
                    id="profileCountry"
                    type="text"
                    required
                    placeholder="India"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all"
                  />
                </div>
              </div>

              {/* Gender selection */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase">
                  Gender
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['Male', 'Female', 'Other'].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                        gender === g
                          ? 'bg-brand-500/10 border-brand-500 text-brand-400 font-extrabold'
                          : 'bg-dark-depth-2 border-dark-border/40 text-gray-455 hover:bg-dark-depth-3 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Security session expiry slider */}
              <div className="space-y-2 border-t border-dark-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-gray-300 uppercase tracking-wider block ml-1">
                    Security Session Expiry Limit
                  </label>
                  <span className="text-[10px] font-black text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-lg border border-brand-500/20">
                    {sessionExpiryDays} {sessionExpiryDays === 1 ? 'Day' : 'Days'}
                  </span>
                </div>
                <p className="text-[9px] text-gray-400 leading-normal ml-1">
                  Enforces automatic credentials re-authentication verification. Configurable between 1 and 30 days.
                </p>
                <div className="flex items-center gap-4 pt-1 px-1">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={sessionExpiryDays}
                    onChange={(e) => setSessionExpiryDays(parseInt(e.target.value) || 1)}
                    className="flex-1 accent-brand-500 bg-dark-depth-3 h-1.5 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] font-black text-gray-500 w-12 text-right">
                    <span>1D - 30D</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white font-bold text-xs uppercase tracking-wider hover:from-brand-500 hover:to-brand-600 focus:outline-none active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-brand-700/20"
              >
                {savingProfile ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  'Save Profile Changes'
                )}
              </button>
            </form>
          </div>

          {/* Change Password Form */}
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-dark-border/40 pb-3">
              <Lock className="w-4 h-4 text-emerald-400" />
              <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">Change Password</h3>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              {/* Current Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="currentPass">
                  Current Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="currentPass"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all"
                  />
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="profileNewPass">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="profileNewPass"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all"
                  />
                </div>
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="profileConfirmPass">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-405">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <input
                    id="profileConfirmPass"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={updatingPassword}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold text-xs uppercase tracking-wider hover:from-emerald-500 hover:to-emerald-600 focus:outline-none active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-700/20"
              >
                {updatingPassword ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  'Update Password Key'
                )}
              </button>
            </form>
          </div>

          {/* SMS Webhook Ingestion Configuration */}
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-400" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">SMS Webhook Sync</h3>
              </div>
              <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 border border-indigo-500/20 rounded-full select-none">
                Automated
              </span>
            </div>

            {/* Premium Download Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-brand-500/5 to-transparent border border-brand-500/15 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1.5">
                  <Smartphone className="w-4.5 h-4.5 text-brand-400" />
                  Download Finor SMS Sync App
                </h4>
                <p className="text-[10px] text-gray-400 leading-normal max-w-sm">
                  Automate UPI trade & expense sync directly from your device. Our lightweight Android background app intercepts transaction SMSes and securely forwards them.
                </p>
              </div>
              <a
                href={apkDownloadUrl}
                download
                className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-500 text-[10px] font-black uppercase rounded-xl text-white transition-all shadow-md shadow-indigo-600/15 whitespace-nowrap text-center shrink-0 cursor-pointer"
              >
                Download APK
              </a>
            </div>

            <div className="space-y-4">
              
              {/* Webhook Endpoint Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase">
                  SMS Webhook URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-3 py-2.5 rounded-xl bg-dark-depth-2/60 border border-dark-border/40 text-gray-400 text-xs focus:outline-none select-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="p-2.5 rounded-xl border border-dark-border bg-dark-depth-2 hover:bg-dark-depth-3 text-gray-400 hover:text-white transition-colors cursor-pointer"
                    title="Copy Webhook URL"
                  >
                    {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Personal SMS API Ingestion Key */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase">
                  Personal Ingestion Key
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showSmsKey ? "text" : "password"}
                      readOnly
                      value={profile?.sms_api_key || 'No Ingestion Key Loaded'}
                      className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-dark-depth-2/60 border border-dark-border/40 text-gray-300 text-xs focus:outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmsKey(!showSmsKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    >
                      {showSmsKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    disabled={!profile?.sms_api_key}
                    className="p-2.5 rounded-xl border border-dark-border bg-dark-depth-2 hover:bg-dark-depth-3 text-gray-400 hover:text-white transition-colors cursor-pointer"
                    title="Copy Ingestion Key"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerateSmsKey}
                    disabled={regeneratingKey}
                    className="p-2.5 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                    title="Rotate/Regenerate Ingestion Key"
                  >
                    {regeneratingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Instant Setup config & instructions */}
              <div className="flex flex-col sm:flex-row gap-4 items-center p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                <div className="flex-1 text-[10px] leading-relaxed text-gray-350 space-y-2.5">
                  <div className="space-y-1">
                    <strong className="text-white font-extrabold block text-xs">Instant Config Scanner:</strong>
                    <span>Open the Finor SMS app on your Android device, select "Scan Config", and point your camera to this QR code. It will auto-configure your Webhook URL and API Key instantly.</span>
                  </div>
                  
                  <div className="pt-2.5 border-t border-indigo-500/10 flex items-start gap-2">
                    <Landmark className="w-4.5 h-4.5 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white font-extrabold block mb-0.5">Alternative: Manual Ingestion</strong>
                      You can record transactions manually on the <strong className="text-white">Finance</strong> page using the <strong className="text-white">+ Add Transaction</strong> / <strong className="text-white">+ Add Cash</strong> buttons.
                    </div>
                  </div>
                </div>
                
                {profile?.sms_api_key && (
                  <div className="p-2.5 bg-dark-depth-1 border border-dark-border/80 rounded-2xl shrink-0 flex flex-col items-center gap-1.5 shadow-md">
                    <img 
                      src={qrImageUrl} 
                      alt="Config QR Code" 
                      className="w-24 h-24 object-contain rounded-md"
                    />
                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest select-none">Scan config</span>
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>

        {/* Right Column: Broker API and Mail Sync Integrations */}
        <div className="space-y-6">
          
          {/* Zerodha Kite Brokerage Integration */}
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-brand-400" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">Zerodha Kite Integration</h3>
              </div>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 border rounded-full select-none ${
                kiteStatus === 'CONNECTED' 
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                  : kiteStatus === 'DISCONNECTED'
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
              }`}>
                {kiteStatus === 'CONNECTED' ? 'Connected' : kiteStatus === 'DISCONNECTED' ? 'Credentials Loaded' : 'Mock Mode'}
              </span>
            </div>

            <form onSubmit={handleUpdateZerodha} className="space-y-4">
              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="zerodhaKey">
                  Kite API Key
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Landmark className="w-4 h-4" />
                  </div>
                  <input
                    id="zerodhaKey"
                    type="text"
                    placeholder="Enter your Zerodha API Key"
                    value={zerodhaApiKey}
                    onChange={(e) => setZerodhaApiKey(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all"
                  />
                </div>
              </div>

              {/* API Secret */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="zerodhaSecret">
                  Kite API Secret
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="zerodhaSecret"
                    type={showZerodhaSecret ? "text" : "password"}
                    placeholder="Enter your Zerodha API Secret"
                    value={zerodhaApiSecret}
                    onChange={(e) => setZerodhaApiSecret(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowZerodhaSecret(!showZerodhaSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                  >
                    {showZerodhaSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* PDF Decryption PAN Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="pdfPassword">
                  Contract Note PDF Password (PAN)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <input
                    id="pdfPassword"
                    type={showPdfPassword ? "text" : "password"}
                    placeholder="PAN in uppercase (e.g. ABCDE1234F)"
                    value={zerodhaPdfPassword}
                    onChange={(e) => setZerodhaPdfPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPdfPassword(!showPdfPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                  >
                    {showPdfPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Required Redirect URL */}
              <div className="p-3 rounded-2xl bg-brand-500/5 border border-brand-500/10 text-[9px] text-gray-350 space-y-1.5 leading-relaxed">
                <span className="font-extrabold text-white block uppercase tracking-wider">Required Kite Redirect URL</span>
                <span>In your <a href="https://kite.trade" target="_blank" rel="noreferrer" className="text-brand-400 hover:text-brand-300 underline font-bold">Kite Developer Console</a>, you must set your app's <strong>Redirect URL</strong> to:</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="bg-dark-depth-3 px-2 py-1 rounded font-mono text-[9px] border border-dark-border text-gray-300 select-all flex-1">
                    {window.location.origin}/orders
                  </code>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingZerodha}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white font-bold text-xs uppercase tracking-wider hover:from-brand-500 hover:to-brand-600 focus:outline-none active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-brand-700/20"
                >
                  {savingZerodha ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Credentials'
                  )}
                </button>

                {kiteStatus === 'DISCONNECTED' && kiteLoginUrl && (
                  <a
                    href={kiteLoginUrl}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-650 text-white text-center font-bold text-xs uppercase tracking-wider hover:bg-indigo-500 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer"
                  >
                    Link Zerodha
                  </a>
                )}
              </div>
            </form>
          </div>

          {/* Gmail Integration Card */}
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">Gmail Integration</h3>
              </div>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 border rounded-full select-none ${
                profile?.gmail_connected_email
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
              }`}>
                {profile?.gmail_connected_email ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <div className="space-y-6">
              <p className="text-xs text-gray-300 leading-relaxed">
                Connect your personal Gmail account directly to synchronize transaction contract notes automatically.
              </p>

              {/* 1. Custom Google Cloud Credentials Configuration */}
              <form onSubmit={handleUpdateGmailCredentials} className="space-y-3.5 border-t border-dark-border/40 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Custom Google App ID Credentials</span>
                  <span className="text-[8px] font-black text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-550/20 select-none">Optional Client</span>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="gmailClientId">
                    Google OAuth Client ID
                  </label>
                  <input
                    id="gmailClientId"
                    type="text"
                    placeholder="Enter custom Google Client ID"
                    value={gmailClientId}
                    onChange={(e) => setGmailClientId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="gmailClientSecret">
                    Google OAuth Client Secret
                  </label>
                  <div className="relative">
                    <input
                      id="gmailClientSecret"
                      type={showGmailSecret ? "text" : "password"}
                      placeholder="Enter custom Google Client Secret"
                      value={gmailClientSecret}
                      onChange={(e) => setGmailClientSecret(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGmailSecret(!showGmailSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    >
                      {showGmailSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingGmailCredentials}
                  className="w-full py-2.5 px-4 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 text-gray-300 hover:text-white border border-dark-border/40 font-bold text-xs uppercase tracking-wider focus:outline-none transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {savingGmailCredentials ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving API Keys...
                    </>
                  ) : (
                    'Save Google API Credentials'
                  )}
                </button>
              </form>

              {/* 2. Connection Status & OAuth linking */}
              <div className="border-t border-dark-border/40 pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Authentication Link</span>
                </div>

                {profile?.gmail_connected_email ? (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-2xl bg-dark-depth-2 border border-dark-border flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-gray-400 block uppercase">Connected Inbox</span>
                        <span className="text-xs text-white block font-bold truncate mt-0.5">{profile.gmail_connected_email}</span>
                      </div>
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    </div>

                    {/* Gmail Filters Configuration Form */}
                    <form onSubmit={handleSaveGmailFilters} className="space-y-3.5 bg-dark-depth-2/40 p-4 rounded-2xl border border-dark-border/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-350 block uppercase tracking-wider">Sync Ingestion Filters</span>
                        <span className="text-[8px] font-black text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-550/20 select-none">Active</span>
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="gmailFilterFrom">
                          From Email (Sender)
                        </label>
                        <input
                          id="gmailFilterFrom"
                          type="text"
                          placeholder="noreply@zerodha.com"
                          value={gmailFilterFrom}
                          onChange={(e) => setGmailFilterFrom(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="gmailFilterSubject">
                          Subject Query Filter
                        </label>
                        <input
                          id="gmailFilterSubject"
                          type="text"
                          placeholder="contract note"
                          value={gmailFilterSubject}
                          onChange={(e) => setGmailFilterSubject(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all font-mono"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={savingGmailFilters}
                        className="w-full py-2.5 px-4 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 text-gray-350 hover:text-white border border-dark-border/40 font-bold text-xs uppercase tracking-wider focus:outline-none transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        {savingGmailFilters ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Saving Filters...
                          </>
                        ) : (
                          'Save Filters'
                        )}
                      </button>
                    </form>

                    <button
                      onClick={handleDisconnectGmail}
                      disabled={disconnectingGmail}
                      className="w-full py-2.5 px-4 rounded-xl border border-rose-500/30 hover:border-rose-500 text-rose-400 hover:text-white hover:bg-rose-500/10 font-bold text-xs uppercase tracking-wider focus:outline-none transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                    >
                      {disconnectingGmail ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        'Disconnect Gmail Account'
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-[9px] text-gray-400 leading-relaxed">
                      <span className="font-extrabold text-amber-400 uppercase block mb-0.5">Authorization Notice</span>
                      Connecting your inbox allows Finor to scan emails from **Zerodha** matching subjects like **"contract note"** to automatically ingest trades. Your password is never shared.
                    </div>
                    <button
                      onClick={handleConnectGmail}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold text-xs uppercase tracking-wider hover:from-emerald-500 hover:to-emerald-600 focus:outline-none active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-700/20"
                    >
                      Link Gmail Inbox
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
