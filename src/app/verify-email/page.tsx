// -- Verify Email Page --------------------------------------------------------
// Shows "check your email" card with resend (60s cooldown) and sign-out link.
// Adapted from networth-agent — uses OnEasy gold/navy styling.

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Mail, RefreshCw, ArrowLeft } from 'lucide-react';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'unauthenticated' | 'verified' | 'unverified'
  >('loading');
  const [resendState, setResendState] = useState<
    'idle' | 'sending' | 'sent' | 'error'
  >('idle');
  const [resendError, setResendError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Check auth state on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setStatus('unauthenticated');
        return;
      }

      setEmail(user.email ?? null);

      if (user.email_confirmed_at) {
        setStatus('verified');
        router.replace('/');
      } else {
        setStatus('unverified');
      }
    });
  }, [router]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Resend verification email
  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resendState === 'sending') return;

    setResendState('sending');
    setResendError('');

    try {
      const res = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 429) {
          setResendError('Too many requests. Please try again later.');
        } else {
          setResendError(data.error || 'Failed to resend verification email.');
        }
        setResendState('error');
        return;
      }

      setResendState('sent');
      setCooldown(60);
    } catch {
      setResendError('Something went wrong. Please try again.');
      setResendState('error');
    }
  }, [cooldown, resendState]);

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar text-navy-400 font-body">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // ─── Unauthenticated ─────────────────────────────────────────────────────

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-body p-8">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Mail className="w-6 h-6 text-slate-400" />
          </div>
          <h1 className="text-xl font-bold text-navy-900 mb-2">
            Session expired
          </h1>
          <p className="text-sm text-navy-500 mb-6">
            Please log in to verify your email address.
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-sidebar text-white text-sm font-semibold rounded-lg hover:bg-navy-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  // ─── Verified (brief flash before redirect) ──────────────────────────────

  if (status === 'verified') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar text-navy-400 font-body">
        <span className="text-sm">Redirecting...</span>
      </div>
    );
  }

  // ─── Unverified — Main UI ────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 font-body p-8">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center text-navy-900 font-black text-base">
            O
          </div>
          <span className="text-lg font-extrabold text-navy-900 tracking-tight">
            OnEasy
          </span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-navy-100 shadow-sm p-8 text-center">
          {/* Icon */}
          <div className="w-14 h-14 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <Mail className="w-6 h-6 text-accent-dark" />
          </div>

          <h1 className="text-xl font-bold text-navy-900 mb-2">
            Check your email
          </h1>
          <p className="text-sm text-navy-500 mb-1">
            We sent a verification link to
          </p>
          {email && (
            <p className="text-sm font-semibold text-navy-800 mb-6">
              {email}
            </p>
          )}

          <p className="text-xs text-navy-400 mb-6">
            Click the link in your email to verify your account. The link expires
            in 15 minutes.
          </p>

          {/* Resend success */}
          {resendState === 'sent' && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-2.5 rounded-lg text-sm mb-4">
              Verification email sent! Check your inbox.
            </div>
          )}

          {/* Resend error */}
          {resendState === 'error' && resendError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg text-sm mb-4">
              {resendError}
            </div>
          )}

          {/* Resend button */}
          <button
            onClick={handleResend}
            disabled={cooldown > 0 || resendState === 'sending'}
            className="w-full py-3 bg-sidebar text-white border-none rounded-lg text-sm font-semibold cursor-pointer
              transition-all hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {resendState === 'sending' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : cooldown > 0 ? (
              `Resend in ${cooldown}s`
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Resend verification email
              </>
            )}
          </button>

          {/* Logout / switch account */}
          <p className="text-xs text-navy-400 mt-5">
            Wrong email?{' '}
            <a
              href="/login"
              onClick={async (e) => {
                e.preventDefault();
                await supabase.auth.signOut();
                window.location.href = '/login';
              }}
              className="text-navy-900 font-semibold cursor-pointer hover:underline"
            >
              Sign out and try again
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
