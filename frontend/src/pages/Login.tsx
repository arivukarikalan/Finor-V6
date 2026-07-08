import { useState } from 'react';
import { supabase } from '../services/supabase';
import { Mail, ShieldCheck, Loader2, ArrowRight, KeyRound } from 'lucide-react';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'EMAIL' | 'OTP'>('EMAIL'); // EMAIL = send code, OTP = verify code
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Stage 1: Send OTP to Email
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true // multi-tenant auto-signup
        }
      });

      if (otpError) {
        setError(otpError.message);
      } else {
        setStage('OTP');
        setSuccessMessage(`A 6-digit verification code has been sent to ${email}`);
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Stage 2: Verify OTP code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email'
      });

      if (verifyError) {
        setError(verifyError.message);
      } else {
        setSuccessMessage('Successfully authenticated! Loading dashboard...');
      }
    } catch (err: any) {
      setError('Verification failed. Check the code or try again.');
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
            Multi-Tenant Zero-Trust Wealth Platform
          </p>
        </div>

        {/* Glassmorphic Login Card */}
        <div className="glass-panel rounded-3xl p-8 shadow-2xl relative">
          
          <div className="mb-6">
            <h2 className="text-xl font-bold font-display text-white">
              {stage === 'EMAIL' ? 'Passwordless Sign In' : 'Enter Verification Code'}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {stage === 'EMAIL' 
                ? 'Sign in or create a multi-tenant account securely using Email OTP.' 
                : `We sent a one-time passcode to ${email}.`
              }
            </p>
          </div>

          {/* Feedback alerts */}
          {error && (
            <div className="p-3.5 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold animate-pulse">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="p-3.5 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              {successMessage}
            </div>
          )}

          {stage === 'EMAIL' ? (
            <form onSubmit={handleSendOtp} className="space-y-5">
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

              {/* Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white font-semibold text-sm hover:from-brand-500 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-700/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending OTP...
                  </>
                ) : (
                  <>
                    Get Verification Code
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              {/* OTP Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="otp">
                  6-Digit Passcode
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="otp"
                    type="text"
                    required
                    pattern="[0-9]*"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-sm tracking-[0.3em] font-mono text-center focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all placeholder:text-gray-500 placeholder:tracking-normal"
                  />
                </div>
              </div>

              {/* Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-semibold text-sm hover:from-emerald-500 hover:to-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-700/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying Code...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Verify & Enter Portfolio
                  </>
                )}
              </button>

              {/* Go Back button */}
              <button
                type="button"
                onClick={() => {
                  setStage('EMAIL');
                  setError(null);
                  setSuccessMessage(null);
                  setOtp('');
                }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors pt-2 cursor-pointer"
              >
                Change Email Address
              </button>
            </form>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-gray-500 text-xs mt-8">
          Protected by Supabase Zero-Trust Security.
        </p>

      </div>
    </div>
  );
};
