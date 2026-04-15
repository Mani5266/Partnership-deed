// -- Reset Password Page -------------------------------------------------------
// Reads `token` from URL, shows new password + confirm form.
// Adapted from networth-agent — uses OnEasy gold/navy styling.

'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // No token in URL
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8 font-body">
        <div className="w-full max-w-[420px] text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-xl font-bold">!</span>
          </div>
          <h1 className="text-xl font-bold text-navy-900 mb-2">Invalid Reset Link</h1>
          <p className="text-sm text-navy-500 mb-6">
            This password reset link is invalid or has already been used.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-2.5 bg-sidebar text-white rounded-lg text-sm font-semibold
              hover:bg-navy-800 transition-all"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8 font-body">
        <div className="w-full max-w-[420px] text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-navy-900 mb-2">Password Updated</h1>
          <p className="text-sm text-navy-500 mb-6">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-2.5 bg-sidebar text-white rounded-lg text-sm font-semibold
              hover:bg-navy-800 transition-all"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8 font-body">
      <div className="w-full max-w-[420px]">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center text-navy-900 font-black text-base">
            O
          </div>
          <span className="text-lg font-extrabold text-navy-900 tracking-tight">OnEasy</span>
        </div>

        <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight mb-1">
          Set new password
        </h1>
        <p className="text-sm text-navy-400 mb-8">
          Enter your new password below.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label className="block text-sm text-navy-900 mb-2 font-semibold">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full px-4 py-3 bg-white border border-navy-100 rounded-lg text-navy-900 text-[0.95rem] outline-none
                focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-navy-400"
            />
          </div>

          <div className="mb-5">
            <label className="block text-sm text-navy-900 mb-2 font-semibold">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              required
              autoComplete="new-password"
              className="w-full px-4 py-3 bg-white border border-navy-100 rounded-lg text-navy-900 text-[0.95rem] outline-none
                focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-navy-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-sidebar text-white border-none rounded-lg text-[0.95rem] font-semibold cursor-pointer mt-2
              transition-all hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating...' : 'Reset Password'}
          </button>
        </form>

        <div className="text-center mt-5">
          <a
            onClick={() => router.push('/login')}
            className="text-sm text-navy-900 font-semibold cursor-pointer hover:underline"
          >
            Back to Login
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-navy-400 font-body">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
