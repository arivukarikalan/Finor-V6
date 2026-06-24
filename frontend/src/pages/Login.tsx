import { useState } from 'react';
import { supabase } from '../services/supabase';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-dark-depth-0 overflow-hidden">
      {/* Decorative Background Glows */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-brand-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md z-10">
        
        {/* App Title Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-brand-600/10 border border-brand-500/20 mb-4 animate-pulse">
            <img src="/favicon.png" alt="Finor Logo" className="w-14 h-14 rounded-xl object-contain shadow-lg shadow-brand-500/20" />
          </div>
          <h1 className="text-4xl font-extrabold font-display tracking-tight bg-gradient-to-r from-brand-100 via-brand-500 to-emerald-500 bg-clip-text text-transparent">
            FINOR
          </h1>
          <p className="text-gray-400 text-sm mt-2 font-medium">
            Personal Finance & Stock Tracker v6.0
          </p>
        </div>

        {/* Glassmorphic Login Card */}
        <div className="glass-panel rounded-3xl p-8 shadow-2xl relative">
          
          <div className="mb-6">
            <h2 className="text-xl font-bold font-display text-white">
              Secure Sign In
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Enter your credentials to access your dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold animate-pulse">
                {error}
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="email">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all placeholder:text-gray-500"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all placeholder:text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white font-semibold text-sm hover:from-brand-500 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-700/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Enter Portfolio
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-gray-500 text-xs mt-8">
          Protected by Supabase Authentication. Only authorized device access allowed.
        </p>

      </div>
    </div>
  );
};
