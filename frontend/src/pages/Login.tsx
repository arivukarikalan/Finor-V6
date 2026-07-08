import { useState } from 'react';
import { supabase } from '../services/supabase';
import { apiRequest } from '../services/api';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight, User, Globe, Users2, ShieldAlert, KeyRound, HelpCircle, FileText } from 'lucide-react';

const SECURITY_QUESTIONS = [
  'What is your mother\'s maiden name?',
  'What was the name of your first pet?',
  'In what city were you born?',
  'What was the name of your first school?',
  'What is your favorite book?'
];

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Authentication Mode
  // LOGIN = sign in, SIGNUP = create account, FORGOT = security question, KEY_RECOVERY = reset key, TICKET = submit request
  const [mode, setMode] = useState<'LOGIN' | 'SIGNUP' | 'FORGOT' | 'KEY_RECOVERY' | 'TICKET'>('LOGIN');

  // Sign Up fields
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [gender, setGender] = useState('Male');
  const [signupQuestion, setSignupQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [signupAnswer, setSignupAnswer] = useState('');

  // Password Recovery fields
  const [recoveryQuestion, setRecoveryQuestion] = useState<string | null>(null);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');

  // Ticket creation fields
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');

  const switchMode = (newMode: typeof mode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
    setRecoveryQuestion(null);
    setSecurityAnswer('');
    setNewPassword('');
    setRecoveryKey('');
    setTicketSubject('');
    setTicketDescription('');
  };

  // Sign In handler
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

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

  // Custom Sign Up handler
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !country || !signupAnswer) {
      setError('Please fill in all sign up fields.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res: any = await apiRequest('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          country,
          gender,
          security_question: signupQuestion,
          security_answer: signupAnswer
        })
      });

      setSuccess(res.message || 'Signup successful! Welcome email sent.');
      setUsername('');
      setEmail('');
      setCountry('');
      setSignupAnswer('');
      setMode('LOGIN');
    } catch (err: any) {
      setError(err.message || 'Failed to complete sign up registration.');
    } finally {
      setLoading(false);
    }
  };

  // Challenge Security Question fetcher
  const handleFetchChallenge = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email first to fetch your security question.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res: any = await apiRequest('/auth/challenge-question', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      setRecoveryQuestion(res.security_question);
    } catch (err: any) {
      setError(err.message || 'Could not fetch security question.');
    } finally {
      setLoading(false);
    }
  };

  // Reset password via Security Answer verification
  const handleVerifyQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !securityAnswer || !newPassword) {
      setError('Please fill in all recovery fields.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res: any = await apiRequest('/auth/verify-question', {
        method: 'POST',
        body: JSON.stringify({
          email,
          security_answer: securityAnswer,
          new_password: newPassword
        })
      });

      setSuccess(res.message || 'Password reset successful! You can now log in.');
      switchMode('LOGIN');
    } catch (err: any) {
      setError(err.message || 'Failed to verify answer.');
    } finally {
      setLoading(false);
    }
  };

  // Reset password via Admin Token Key verification
  const handleVerifyKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !recoveryKey || !newPassword) {
      setError('Please fill in email, recovery key, and new password.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res: any = await apiRequest('/auth/reset-by-key', {
        method: 'POST',
        body: JSON.stringify({
          email,
          reset_key: recoveryKey,
          new_password: newPassword
        })
      });

      setSuccess(res.message || 'Password reset successful! You can now log in.');
      switchMode('LOGIN');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired recovery key.');
    } finally {
      setLoading(false);
    }
  };

  // Submit password request support ticket (guest account recovery)
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !ticketSubject || !ticketDescription) {
      setError('Please fill in all ticket details.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res: any = await apiRequest('/auth/ticket-recovery', {
        method: 'POST',
        body: JSON.stringify({
          email,
          subject: ticketSubject,
          description: ticketDescription
        })
      });

      setSuccess(res.message || 'Support ticket logged! Admin will review and send you a key.');
      setTicketSubject('');
      setTicketDescription('');
      setMode('KEY_RECOVERY');
    } catch (err: any) {
      setError(err.message || 'Failed to submit support ticket.');
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
        <div className="text-center mb-6">
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
              {mode === 'LOGIN' && 'Secure Sign In'}
              {mode === 'SIGNUP' && 'Create Tenant Account'}
              {mode === 'FORGOT' && 'Reset Password'}
              {mode === 'KEY_RECOVERY' && 'Key Token Recovery'}
              {mode === 'TICKET' && 'Request Reset Ticket'}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {mode === 'LOGIN' && 'Enter credentials to access your financial dashboard.'}
              {mode === 'SIGNUP' && 'Sign up to register your tenant space. Welcome details sent to email.'}
              {mode === 'FORGOT' && 'Answer your security question challenge to reset password.'}
              {mode === 'KEY_RECOVERY' && 'Enter the 2-hour recovery key sent to your inbox.'}
              {mode === 'TICKET' && 'Submit a request to Admin to obtain an email reset token.'}
            </p>
          </div>

          {/* Feedback alerts */}
          {error && (
            <div className="p-3.5 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold animate-pulse">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3.5 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              {success}
            </div>
          )}

          {/* ───────────────── SIGN IN MODE ───────────────── */}
          {mode === 'LOGIN' && (
            <form onSubmit={handleSignIn} className="space-y-4">
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
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all placeholder:text-gray-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-1">
                  <label className="text-xs font-semibold text-gray-300" htmlFor="password">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('FORGOT')}
                    className="text-[10px] text-brand-400 hover:text-brand-300 font-bold transition-colors cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
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
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all placeholder:text-gray-500"
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white font-semibold text-xs uppercase tracking-wider hover:from-brand-500 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-700/20"
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

              <div className="pt-2 text-center">
                <span className="text-[11px] text-gray-400">New to Finor? </span>
                <button
                  type="button"
                  onClick={() => switchMode('SIGNUP')}
                  className="text-[11px] text-brand-400 hover:text-brand-300 font-bold transition-colors cursor-pointer"
                >
                  Create Tenant Space
                </button>
              </div>
            </form>
          )}

          {/* ───────────────── SIGN UP MODE ───────────────── */}
          {mode === 'SIGNUP' && (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="username">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    required
                    placeholder="John Doe"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="signupEmail">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <input
                    id="signupEmail"
                    type="email"
                    required
                    placeholder="john@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="country">
                    Country
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <input
                      id="country"
                      type="text"
                      required
                      placeholder="India"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="gender">
                    Gender
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Users2 className="w-3.5 h-3.5" />
                    </div>
                    <select
                      id="gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none accent-dark-depth-1"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="question">
                  Security Question
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </div>
                  <select
                    id="question"
                    value={signupQuestion}
                    onChange={(e) => setSignupQuestion(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none accent-dark-depth-1"
                  >
                    {SECURITY_QUESTIONS.map((q, idx) => (
                      <option key={idx} value={q}>{q}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-300 block ml-1 uppercase" htmlFor="answer">
                  Security Answer
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </div>
                  <input
                    id="answer"
                    type="text"
                    required
                    placeholder="Your answer (case-insensitive)"
                    value={signupAnswer}
                    onChange={(e) => setSignupAnswer(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white font-bold text-xs uppercase tracking-wider hover:from-brand-500 hover:to-brand-600 focus:outline-none disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-brand-700/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Creating Profile...
                  </>
                ) : (
                  <>
                    Submit Registration
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN')}
                  className="text-[11px] text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  Already have an account? Sign In
                </button>
              </div>
            </form>
          )}

          {/* ───────────────── FORGOT PASSWORD MODE ───────────────── */}
          {mode === 'FORGOT' && (
            <form onSubmit={handleVerifyQuestion} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="recoveryEmail">
                  Account Email
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="recoveryEmail"
                      type="email"
                      required
                      placeholder="name@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={!!recoveryQuestion}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none"
                    />
                  </div>
                  {!recoveryQuestion && (
                    <button
                      type="button"
                      onClick={handleFetchChallenge}
                      disabled={loading}
                      className="px-4 py-2.5 rounded-xl bg-dark-depth-2 hover:bg-dark-depth-3 border border-dark-border text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Challenge'}
                    </button>
                  )}
                </div>
              </div>

              {recoveryQuestion && (
                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-3.5 rounded-xl bg-dark-depth-2 border border-dark-border/80">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Challenge Question</span>
                    <span className="text-xs text-white font-semibold mt-1 block">{recoveryQuestion}</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="secAnswer">
                      Your Answer
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <input
                        id="secAnswer"
                        type="text"
                        required
                        placeholder="Security answer"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="recoveryPass">
                      New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="recoveryPass"
                        type="password"
                        required
                        placeholder="Choose new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold text-xs uppercase tracking-wider hover:from-emerald-500 hover:to-emerald-600 focus:outline-none disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-700/20"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      'Update Password & Sign In'
                    )}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('KEY_RECOVERY')}
                  className="text-[11px] text-brand-400 hover:text-brand-300 font-bold transition-colors cursor-pointer"
                >
                  Use Support Recovery Key Token
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN')}
                  className="text-[11px] text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* ───────────────── KEY TOKEN RECOVERY MODE ───────────────── */}
          {mode === 'KEY_RECOVERY' && (
            <form onSubmit={handleVerifyKey} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="keyEmail">
                  Account Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="keyEmail"
                    type="email"
                    required
                    placeholder="name@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="tokenKey">
                  8-Character Reset Key
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    id="tokenKey"
                    type="text"
                    required
                    placeholder="RST-XXXXXX"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="keyNewPass">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="keyNewPass"
                    type="password"
                    required
                    placeholder="Choose new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold text-xs uppercase tracking-wider hover:from-emerald-500 hover:to-emerald-600 focus:outline-none disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-700/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset Password & Sign In'
                )}
              </button>

              <div className="flex flex-col gap-2 pt-2 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('TICKET')}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-bold transition-colors cursor-pointer"
                >
                  Request key token from Super Admin
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN')}
                  className="text-[11px] text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* ───────────────── REQUEST TICKET MODE ───────────────── */}
          {mode === 'TICKET' && (
            <form onSubmit={handleSubmitTicket} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="ticketEmail">
                  Account Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="ticketEmail"
                    type="email"
                    required
                    placeholder="name@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="ticketSubject">
                  Subject
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <input
                    id="ticketSubject"
                    type="text"
                    required
                    placeholder="Account Recovery Request"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 block ml-1" htmlFor="ticketDesc">
                  Detailed Explanation
                </label>
                <textarea
                  id="ticketDesc"
                  rows={4}
                  required
                  placeholder="Provide details of your request so the Super Admin can verify your identity and generate a reset key..."
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-dark-depth-2 border border-dark-border text-white text-xs focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 transition-all placeholder:text-gray-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 text-white font-bold text-xs uppercase tracking-wider hover:from-amber-500 hover:to-amber-600 focus:outline-none disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-700/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting Request...
                  </>
                ) : (
                  'File Reset Ticket'
                )}
              </button>

              <div className="flex flex-col gap-2 pt-2 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('KEY_RECOVERY')}
                  className="text-[11px] text-brand-400 hover:text-brand-300 font-bold transition-colors cursor-pointer"
                >
                  I already have a Recovery Key Token
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('LOGIN')}
                  className="text-[11px] text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Footer info */}
        <p className="text-center text-gray-500 text-xs mt-8 font-semibold uppercase tracking-widest">
          Zero-Trust Security Enabled
        </p>

      </div>
    </div>
  );
};
