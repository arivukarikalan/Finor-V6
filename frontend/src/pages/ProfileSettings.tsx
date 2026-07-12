import { useState, useEffect } from 'react';
import { useAuthStore } from '../context/authStore';
import { apiRequest } from '../services/api';
import { useToastStore } from '../context/toastStore';
import { 
  Loader2, 
  User, 
  Globe, 
  Users2, 
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

  // Change Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // SMS Ingestion state
  const [showSmsKey, setShowSmsKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '');
      setCountry(profile.country || '');
      setGender(profile.gender || 'Male');
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
        body: JSON.stringify({ username, country, gender })
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

  const backendBaseUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api').replace(/\/$/, '');
  const webhookUrl = `${backendBaseUrl.endsWith('/api') ? backendBaseUrl : `${backendBaseUrl}/api`}/finance/sms-webhook`;

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

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight uppercase">Profile Settings & Integrations</h1>
        <p className="text-xs text-gray-400 mt-1">Configure your personal tenant info, credentials, and automated ingestion keys.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Left Column: Tenant Profile */}
        <div className="space-y-6">
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4">
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
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
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
                    placeholder="Country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Gender */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="profileGender">
                  Gender
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Users2 className="w-4 h-4" />
                  </div>
                  <select
                    id="profileGender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none accent-dark-depth-1"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
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
        </div>

        {/* Right Column: Password & Integrations */}
        <div className="space-y-6">
          
          {/* Change Password Form */}
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4">
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
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
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
          <div className="glass-panel rounded-3xl border border-dark-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-dark-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-indigo-400" />
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">SMS Webhook Sync</h3>
              </div>
              <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-500/10 px-2 py-0.5 border border-indigo-500/20 rounded-full select-none">
                Automated
              </span>
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
                    className="flex-1 px-3 py-2 rounded-xl bg-dark-depth-2/60 border border-dark-border/40 text-gray-400 text-xs focus:outline-none select-all"
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
                      className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-dark-depth-2/60 border border-dark-border/40 text-gray-300 text-xs focus:outline-none"
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

              {/* Guide/Instructions section */}
              <div className="p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 text-[10px] leading-relaxed text-gray-350 space-y-2">
                <div className="flex items-start gap-2">
                  <Smartphone className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white font-extrabold block mb-0.5">Automate with Finor SMS Sync App:</strong>
                    To automate, you can configure an Android gateway app (such as Tasker or "SMS Gateway" from Play Store) to forward UPI transaction alert SMSes to this URL.
                  </div>
                </div>
                <div className="flex items-start gap-2 pl-6">
                  <span className="text-[9px] font-black text-indigo-400 mr-1 select-none">1.</span>
                  <span>Set target URL to the Webhook URL above.</span>
                </div>
                <div className="flex items-start gap-2 pl-6">
                  <span className="text-[9px] font-black text-indigo-400 mr-1 select-none">2.</span>
                  <span>Add header: <code className="bg-dark-depth-3 px-1 py-0.5 rounded font-mono text-[9px] border border-dark-border">x-api-key: [Your Personal Ingestion Key]</code></span>
                </div>
                
                <div className="pt-2 border-t border-indigo-500/10 flex items-start gap-2">
                  <Landmark className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white font-extrabold block mb-0.5">Alternative: Manual Ingestion</strong>
                    If you don't use SMS sync, you can always record transactions manually on the <strong className="text-white">Finance</strong> page using the <strong className="text-white">+ Add Transaction</strong> / <strong className="text-white">+ Add Cash</strong> buttons.
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
