import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { ChangeGuardLogo } from '../components/Logo';
import { apiFetch, setStoredToken } from '../lib/api';
import type { User } from '../types';

interface LoginPageProps {
  onSuccess: (user: User) => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [role, setRole] = useState('Software Quality Engineer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password state
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetCode, setResetCode] = useState('');
  const [issuedCodeHint, setIssuedCodeHint] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
      });
      setStoredToken(data.token, rememberMe);
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setError(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'demo@changeguard.edu',
          password: 'ChangeGuard2026!',
          rememberMe: true,
        }),
      });
      setStoredToken(data.token, true);
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in with demo account.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError('Provide your full name, valid email, and a password of at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });
      setStoredToken(data.token, true);
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      if (resetStep === 'request') {
        const res = await apiFetch<{ message: string; verificationCode: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim() }),
        });
        setIssuedCodeHint(res.verificationCode);
        setInfoMsg(res.message);
        setResetStep('confirm');
      } else {
        const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), code: resetCode.trim(), newPassword }),
        });
        setInfoMsg(res.message);
        setMode('login');
        setResetStep('request');
        setIssuedCodeHint(null);
        setPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-50 dark:bg-slate-950">
      {/* Left Brand & Workflow Overview */}
      <div className="hidden lg:flex lg:col-span-5 bg-[#0B1528] text-white p-10 xl:p-12 flex-col justify-between border-r border-slate-800">
        <div>
          <ChangeGuardLogo lightText />
          <p className="mt-10 text-xs font-medium tracking-wide text-blue-400">
            Requirement Change &amp; Regression Intelligence
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-white max-w-md">
            Trace every requirement change to its impacted tests.
          </h2>
          <p className="mt-4 text-sm text-slate-300 leading-relaxed max-w-md">
            ChangeGuard connects requirement diffing, dependency graph traversal, and explainable test ranking in one auditable engineering workflow.
          </p>

          <div className="mt-10 space-y-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">01. Requirement Change Detection</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Compare Version 1 and Version 2 specifications across TXT, PDF, and DOCX documents with word-level diffs.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">02. Change Impact Analysis</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Traverse Requirement → Design → Code → Test traceability graphs to isolate direct and indirect effects.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">03. Regression Test Prioritization</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Rank high-risk test cases first, estimate testing time saved, and export detailed evaluation reports.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          ChangeGuard Software Engineering Platform
        </p>
      </div>

      {/* Right Authentication Form */}
      <div className="lg:col-span-7 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-7 shadow-sm">
          <div className="lg:hidden mb-4">
            <ChangeGuardLogo />
          </div>

          {mode !== 'forgot' && (
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfoMsg(null);
                }}
                className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setInfoMsg(null);
                }}
                className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'register'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
            <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {mode === 'login' && 'Sign in to ChangeGuard'}
              {mode === 'register' && 'Create Engineer Account'}
              {mode === 'forgot' && 'Reset Password'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {mode === 'login' && 'Sign in with your account or launch the demonstration workspace.'}
              {mode === 'register' && 'Register a persistent account stored in the project database.'}
              {mode === 'forgot' && 'Verify your account email to set a new password.'}
            </p>
          </div>

          {error && (
            <div className="mb-3.5 px-3.5 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 space-y-1">
              <p>{error}</p>
              {mode === 'login' && error.toLowerCase().includes('invalid') && (
                <p>
                  New email?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError(null);
                    }}
                    className="font-semibold underline hover:text-red-900 dark:hover:text-red-100"
                  >
                    Create an account
                  </button>{' '}
                  or click <strong>Use Demonstration Account</strong> below.
                </p>
              )}
            </div>
          )}

          {infoMsg && (
            <div className="mb-3.5 px-3.5 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
              <p>{infoMsg}</p>
              {issuedCodeHint && (
                <p className="mt-1 font-mono font-semibold">
                  Local verification code: {issuedCodeHint}
                </p>
              )}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="engineer@company.com"
                  required
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                      setInfoMsg(null);
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full h-9 pl-3 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Remember me on this device</span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Sign in</span>
              </button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white dark:bg-slate-900 px-2 text-slate-400">or</span>
                </div>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleDemoSignIn}
                className="w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>Use Demonstration Account</span>
                <ArrowRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </button>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                Demo: <span className="font-mono">demo@changeguard.edu</span> / <span className="font-mono">ChangeGuard2026!</span>
              </p>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Full name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label htmlFor="reg-role" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Engineering Role
                </label>
                <input
                  id="reg-role"
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label htmlFor="reg-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Password (minimum 8 characters)
                </label>
                <div className="relative">
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Create Account</span>
              </button>
              <div className="text-center text-xs text-slate-600 dark:text-slate-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Back to Sign in
                </button>
              </div>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Registered Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              {resetStep === 'confirm' && (
                <>
                  <div>
                    <label htmlFor="reset-code" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      6-Digit Verification Code
                    </label>
                    <input
                      id="reset-code"
                      type="text"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      required
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-pw" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      New Password (8+ characters)
                    </label>
                    <input
                      id="new-pw"
                      type="password"
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <KeyRound className="w-4 h-4" />
                <span>{resetStep === 'request' ? 'Generate Verification Code' : 'Update Password'}</span>
              </button>
              <div className="text-center text-xs text-slate-600 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setResetStep('request');
                    setError(null);
                    setInfoMsg(null);
                  }}
                  className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Return to Sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
