import { useState, useEffect } from 'react';
import { useAuthStore } from '../context/authStore';
import { apiRequest } from '../services/api';
import { useToastStore } from '../context/toastStore';
import { Loader2, User, Globe, Users2, Lock, ShieldCheck, Mail } from 'lucide-react';

export const ProfileSettings = () => {
  const { profile, fetchProfile } = useAuthStore();
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [gender, setGender] = useState('Male');

  // Change Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight uppercase">Profile Settings</h1>
        <p className="text-xs text-gray-400 mt-1">Configure your personal tenant info and credentials.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Profile Info Form */}
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
      </div>
    </div>
  );
};
