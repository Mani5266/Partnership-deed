"use client";

import { useState, useEffect, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";

/* ── Feature bullet ─────────────────────────────────────────── */
function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 text-[0.95rem] font-medium text-white/80">
      <div className="w-[22px] h-[22px] rounded-full bg-accent/20 flex items-center justify-center shrink-0">
        <Check className="w-3 h-3 text-accent" strokeWidth={2.5} />
      </div>
      {text}
    </div>
  );
}

/* ── Friendly error messages for raw Supabase errors ────────── */
function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("password should contain"))
    return "Password must include at least one uppercase letter, one lowercase letter, one number, and one special character.";
  if (lower.includes("user already registered"))
    return "An account with this email already exists. Try logging in instead.";
  if (lower.includes("invalid login credentials"))
    return "Incorrect email or password. Please try again.";
  if (lower.includes("email rate limit"))
    return "Too many attempts. Please wait a few minutes and try again.";
  if (lower.includes("over_email_send_rate_limit"))
    return "Too many attempts. Please wait a few minutes and try again.";
  return raw;
}

/* ── Main page ──────────────────────────────────────────────── */
function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  /* redirect if already authenticated + verified; read URL params for status messages */
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        try {
          const checkRes = await fetch("/api/check-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id }),
          });
          const checkData = await checkRes.json();
          if (checkData.verified) {
            router.replace("/");
            return;
          }
          await supabase.auth.signOut();
        } catch {
          await supabase.auth.signOut();
        }
      }

      const verified = searchParams.get("verified");
      const errorParam = searchParams.get("error");

      if (verified === "true") {
        setSuccess("Email verified successfully! Please sign in.");
      } else if (errorParam === "expired") {
        setError("Verification link has expired. Please request a new one.");
      } else if (errorParam === "invalid") {
        setError("Invalid verification link. Please request a new one.");
      }

      setChecking(false);
    });
  }, [router, searchParams]);

  const switchTab = (tab: "login" | "signup" | "forgot") => {
    setMode(tab);
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (mode === "forgot") {
        const res = await fetch("/api/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok && !data.success) {
          setError(data.error || "Something went wrong.");
          setLoading(false);
          return;
        }
        setSuccess("If an account exists with that email, a password reset link has been sent. Check your inbox.");
        setLoading(false);
        return;
      } else if (mode === "signup") {
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError("Password must be at least 6 characters.");
          setLoading(false);
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(friendlyAuthError(signUpError.message));
          setLoading(false);
          return;
        }

        if (data.session) {
          await supabase.auth.signOut();
        }

        if (data.user?.id) {
          try {
            await fetch("/api/send-verification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, userId: data.user.id }),
            });
          } catch {
            // Verification email failure should not break signup flow
          }
        }

        setSuccess(
          "Account created! Check your email to verify your account, then come back and login."
        );
        setPassword("");
        setConfirmPassword("");
      } else {
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(friendlyAuthError(signInError.message));
          setLoading(false);
          return;
        }

        const userId = signInData.user?.id;
        if (!userId) {
          await supabase.auth.signOut();
          setError("Something went wrong. Please try again.");
          setLoading(false);
          return;
        }

        try {
          const checkRes = await fetch("/api/check-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          const checkData = await checkRes.json();
          if (!checkData.verified) {
            await supabase.auth.signOut();
            setError("Please verify your email before logging in. Check your inbox for the verification link.");
            setLoading(false);
            return;
          }
        } catch {
          await supabase.auth.signOut();
          setError("Unable to verify your account status. Please try again.");
          setLoading(false);
          return;
        }

        router.replace("/");
        return;
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError("Something went wrong. Please try again.");
    }

    setLoading(false);
  };

  /* ── Loading gate ── */
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar text-navy-400 font-body">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  const isLogin = mode === "login";
  const isForgot = mode === "forgot";

  return (
    <div className="min-h-screen flex font-body">
      {/* ── Left panel ── */}
      <div className="hidden md:flex w-1/2 min-h-screen bg-sidebar text-white flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-[350px] h-[350px] rounded-full bg-[radial-gradient(circle,rgba(240,185,41,0.08)_0%,transparent_70%)]" />
        <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-sidebar via-accent/40 to-sidebar" />

        <div>
          <div className="flex items-center gap-3">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="20" fill="#1e293b" />
              <text x="20" y="26" textAnchor="middle" fontSize="20" fontWeight="700" fill="#f0b929" fontFamily="DM Sans, sans-serif">O</text>
            </svg>
            <span className="text-lg font-extrabold tracking-tight">OnEasy</span>
          </div>
          <div className="w-full h-px bg-white/[0.06] my-8" />
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-[2.5rem] font-black tracking-tight leading-tight mb-5">
            Partnership
            <br />
            Deed Generator
          </h1>
          <p className="text-base text-white/50 leading-relaxed max-w-[420px]">
            Generate professional partnership deeds in minutes.
            AI-powered, legally sound, and ready for execution.
          </p>
          <div className="mt-12 flex flex-col gap-4">
            <Feature text="AI-Powered Deed Drafting" />
            <Feature text="Multi-Partner Support (2-20)" />
            <Feature text="Instant DOCX Export" />
          </div>
        </div>

        <div className="text-xs text-white/25">
          &copy; 2026 OnEasy. All rights reserved.
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-full md:w-1/2 min-h-screen flex items-center justify-center bg-white p-8 md:p-10">
        <div className="w-full max-w-[420px]">
          {/* Mobile brand */}
          <div className="md:hidden flex items-center gap-3 mb-8">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="20" fill="#1e293b" />
              <text x="20" y="26" textAnchor="middle" fontSize="20" fontWeight="700" fill="#f0b929" fontFamily="DM Sans, sans-serif">O</text>
            </svg>
            <span className="text-lg font-extrabold text-navy-900 tracking-tight">OnEasy</span>
          </div>

          <h2 className="text-2xl font-extrabold text-navy-900 tracking-tight mb-1">
            {isForgot
              ? "Reset your password"
              : isLogin
                ? "Sign in to your account"
                : "Create your account"}
          </h2>
          <p className="text-sm text-navy-400 mb-8">
            {isForgot
              ? "Enter your email and we'll send you a reset link."
              : isLogin
                ? "Enter your credentials to access the dashboard."
                : "Enter your details to get started."}
          </p>

          {/* tabs */}
          {!isForgot && (
            <div className="flex mb-8 border border-navy-200 rounded-[10px] overflow-hidden">
              <button
                type="button"
                onClick={() => switchTab("login")}
                className={`flex-1 py-3 text-sm font-semibold transition-all border-none cursor-pointer ${
                  isLogin
                    ? "bg-sidebar text-white"
                    : "bg-transparent text-navy-400"
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => switchTab("signup")}
                className={`flex-1 py-3 text-sm font-semibold transition-all border-none cursor-pointer ${
                  !isLogin
                    ? "bg-sidebar text-white"
                    : "bg-transparent text-navy-400"
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-2.5 rounded-lg text-sm mb-4">
              {success}
            </div>
          )}

          {/* form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-5">
              <label className="block text-sm text-navy-800 mb-2 font-semibold">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                autoComplete="email"
                className="w-full px-4 py-3 bg-white border border-navy-200 rounded-lg text-navy-800 text-[0.95rem] outline-none
                  focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-navy-400"
              />
            </div>

            {!isForgot && (
              <div className="mb-5">
                <label className="block text-sm text-navy-800 mb-2 font-semibold">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  minLength={6}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="w-full px-4 py-3 bg-white border border-navy-200 rounded-lg text-navy-800 text-[0.95rem] outline-none
                    focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-navy-400"
                />
                {isLogin && (
                  <div className="text-right mt-1.5">
                    <a
                      onClick={() => switchTab("forgot")}
                      className="text-xs text-navy-400 hover:text-navy-800 font-medium cursor-pointer hover:underline transition-colors"
                    >
                      Forgot password?
                    </a>
                  </div>
                )}
              </div>
            )}

            {!isLogin && !isForgot && (
              <div className="mb-5">
                <label className="block text-sm text-navy-800 mb-2 font-semibold">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  className="w-full px-4 py-3 bg-white border border-navy-200 rounded-lg text-navy-800 text-[0.95rem] outline-none
                    focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-navy-400"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-sidebar text-white border-none rounded-lg text-[0.95rem] font-semibold cursor-pointer mt-2
                transition-all hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "..."
                : isForgot
                  ? "Send Reset Link"
                  : isLogin
                    ? "Sign In"
                    : "Create Account"}
            </button>
          </form>

          <div className="text-center mt-5 text-sm text-navy-400">
            {isForgot ? (
              <>
                Remember your password?{" "}
                <a
                  onClick={() => switchTab("login")}
                  className="text-navy-800 font-semibold cursor-pointer hover:underline"
                >
                  Back to Login
                </a>
              </>
            ) : isLogin ? (
              <>
                Don&apos;t have an account?{" "}
                <a
                  onClick={() => switchTab("signup")}
                  className="text-navy-800 font-semibold cursor-pointer hover:underline"
                >
                  Sign up
                </a>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <a
                  onClick={() => switchTab("login")}
                  className="text-navy-800 font-semibold cursor-pointer hover:underline"
                >
                  Login
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Suspense wrapper (required for useSearchParams in Next.js 14) ── */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-sidebar text-navy-400 font-body">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
