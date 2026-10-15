"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LogoIcon } from "@/components/ui/logo-icon";
import { sanitizeRedirect } from "@/lib/security";
import { notifyAccountCreated } from "@/actions/account";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const initialEmail = searchParams.get("email") || "";
  const initialUsername = searchParams.get("username") || "";
  const next = sanitizeRedirect(searchParams.get("next"), "/library");

  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const getBackTarget = () => {
    if (next && next !== "/library" && next !== "/profile" && next !== "/login") {
      const decoded = decodeURIComponent(next);
      if (decoded.startsWith("/discover")) return { url: decoded, label: "Discover" };
      if (
        decoded.startsWith("/movie") ||
        decoded.startsWith("/series") ||
        decoded.startsWith("/anime") ||
        decoded.startsWith("/tv")
      ) {
        return { url: decoded, label: "Title Details" };
      }
      if (decoded.startsWith("/search")) return { url: decoded, label: "Search" };
      if (decoded.startsWith("/u/") || decoded.startsWith("/@")) return { url: decoded, label: "Profile" };
      if (decoded === "/" || decoded === "/home") return { url: "/home", label: "Home" };
      return { url: decoded, label: "Previous Page" };
    }
    return { url: "/discover", label: null };
  };

  const backTarget = getBackTarget();

  const handleBack = () => {
    if (next && next !== "/library" && next !== "/profile" && next !== "/login") {
      router.push(decodeURIComponent(next));
      return;
    }

    if (typeof window !== "undefined") {
      const hasHistory =
        (window.history.state && window.history.state.idx > 0) ||
        window.history.length > 1;

      if (hasHistory) {
        router.back();
        return;
      }
    }

    router.push(backTarget.url || "/discover");
  };

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const errParam = searchParams.get("error");
    if (!errParam) return null;
    if (errParam === "auth_failed") return "Authentication failed. Please try again.";
    return errParam;
  });
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const qMode = searchParams.get("mode");
    if (qMode === "signup" || qMode === "signin") {
      setMode(qMode);
    }
  }, [searchParams]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    setSuccessMsg(null);
    const supabase = createClient();

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) {
        setError(error.message);
        setGoogleLoading(false);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err?.message || "Failed to initiate Google sign in.");
      setGoogleLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }

        router.push(next);
        router.refresh();
      } else {
        // Sign Up (Profile setup follows in dedicated popup once authenticated)
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }

        // Send instant Telegram notification for new account
        if (data.user) {
          notifyAccountCreated(data.user.email || email.trim(), "Email & Password").catch(() => {});
        }

        if (data.session) {
          // Instant sign in - user will be greeted with Profile Setup popup and PWA prompt
          try {
            sessionStorage.setItem("cinetrack_just_registered", "true");
          } catch {}
          router.push(next);
          router.refresh();
        } else {
          // Email confirmation required
          setSuccessMsg(
            "Account created! Please check your email inbox to confirm your account, then sign in."
          );
          setMode("signin");
          setLoading(false);
        }
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed.");
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address to receive reset instructions.");
      return;
    }

    setResetLoading(true);
    setError(null);
    setSuccessMsg(null);
    const supabase = createClient();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/library`,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccessMsg("Password reset link sent! Check your inbox.");
        setShowForgot(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to send reset email.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0F141D] flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-[#3B9EFF]/30 selection:text-white">
      {/* Background Poster Wall with Ambient Scrim */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <img
          src="/hero-background.jpeg"
          alt="Cinematic Backdrop"
          className="w-full h-full object-cover object-center opacity-15 blur-sm scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F141D] via-[#0F141D]/90 to-[#0F141D]" />
        <div className="absolute -top-40 right-1/4 w-[500px] h-[500px] rounded-full bg-[#3B9EFF]/10 blur-[140px]" />
      </div>

      {/* Prominent Floating Top-Left Back Button (Desktop / Tablet) */}
      <div className="hidden sm:block fixed top-6 left-6 z-30">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Go back to previous page"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#151C27]/90 hover:bg-[#1D2734] active:scale-95 text-[#F5F7FA] border border-white/10 hover:border-[#3B9EFF]/40 backdrop-blur-xl text-xs sm:text-sm font-semibold shadow-xl hover:shadow-[0_0_16px_rgba(59,158,255,0.15)] transition-all cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 text-[#3B9EFF] group-hover:-translate-x-0.5 transition-transform" />
          <span>Back</span>
        </button>
      </div>

      <div className="relative z-10 w-full max-w-[440px] p-6 sm:p-8 rounded-2xl bg-[#151C27]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl flex flex-col">
        {/* Mobile-only In-Card Back Bar */}
        <div className="flex items-center justify-between w-full mb-3 -mt-1 sm:hidden">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1D2734] hover:bg-[#253244] active:scale-95 text-[#A8B0BD] hover:text-[#F5F7FA] border border-white/[0.08] transition-all text-xs font-semibold cursor-pointer group"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#3B9EFF] group-hover:-translate-x-0.5 transition-transform" />
            <span>Back</span>
          </button>
          {backTarget.label && (
            <span className="text-[11px] font-medium text-[#6F7886] truncate max-w-[200px]">
              to {backTarget.label}
            </span>
          )}
        </div>
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <Link href="/" className="group flex flex-col items-center mb-3">
            <LogoIcon className="w-12 h-12 mb-2" size={48} priority />
            <h1 className="font-extrabold text-2xl text-[#F5F7FA] tracking-tight group-hover:text-[#3B9EFF] transition-colors">
              Cine<span className="text-[#3B9EFF]">Track</span>
            </h1>
          </Link>
          <p className="text-xs text-[#A8B0BD] max-w-xs leading-relaxed">
            {mode === "signin"
              ? "Sign in to track movies, TV shows, and anime."
              : "Create an account to start your personal watch library."}
          </p>
        </div>

        {/* Dual Mode Tab Selector */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[#0F141D]/80 border border-white/[0.06] mb-6 select-none">
          <Link
            href={`/login?mode=signin${next !== "/library" ? `&next=${encodeURIComponent(next)}` : ""}`}
            onClick={(e) => {
              e.preventDefault();
              setMode("signin");
              setError(null);
              setSuccessMsg(null);
              setShowForgot(false);
            }}
            className={`py-2 text-xs sm:text-sm font-semibold rounded-lg text-center transition-all cursor-pointer ${
              mode === "signin"
                ? "bg-[#3B9EFF] text-white shadow-md shadow-[#3B9EFF]/20"
                : "text-[#A8B0BD] hover:text-[#F5F7FA]"
            }`}
          >
            Sign In
          </Link>
          <Link
            href={`/login?mode=signup${next !== "/library" ? `&next=${encodeURIComponent(next)}` : ""}`}
            onClick={(e) => {
              e.preventDefault();
              setMode("signup");
              setError(null);
              setSuccessMsg(null);
              setShowForgot(false);
            }}
            className={`py-2 text-xs sm:text-sm font-semibold rounded-lg text-center transition-all cursor-pointer ${
              mode === "signup"
                ? "bg-[#3B9EFF] text-white shadow-md shadow-[#3B9EFF]/20"
                : "text-[#A8B0BD] hover:text-[#F5F7FA]"
            }`}
          >
            Create Account
          </Link>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="w-full mb-4 p-3 rounded-xl bg-[#F43F5E]/10 border border-[#F43F5E]/20 text-xs text-[#F43F5E] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="w-full mb-4 p-3 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/20 text-xs text-[#22C55E] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{successMsg}</span>
          </div>
        )}

        {/* Google OAuth Button */}
        <Link
          href={`/auth/login/google${next !== "/library" ? `?next=${encodeURIComponent(next)}` : ""}`}
          onClick={() => setGoogleLoading(true)}
          className="w-full h-11 sm:h-12 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 shadow-md active:scale-95 transition-all cursor-pointer"
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-900" />
          ) : (
            <svg className="w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          )}
          <span>Continue with Google</span>
        </Link>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="h-[1px] flex-1 bg-white/[0.08]" />
          <span className="text-[11px] uppercase tracking-wider text-[#6F7886] font-medium">
            or with email
          </span>
          <div className="h-[1px] flex-1 bg-white/[0.08]" />
        </div>

        {/* Forgot Password Sub-flow */}
        {showForgot ? (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-3.5">
            <div className="text-left">
              <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                Account Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#6F7886] absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[#0F141D] text-xs sm:text-sm text-[#F5F7FA] placeholder-[#4B5563] border border-white/[0.08] focus:outline-none focus:border-[#3B9EFF] focus:ring-1 focus:ring-[#3B9EFF] transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={resetLoading}
              className="w-full h-11 mt-1 rounded-xl bg-[#3B9EFF] hover:bg-[#5AAFFF] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-[#3B9EFF]/25 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {resetLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <span>Send Password Reset Link</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowForgot(false)}
              className="text-xs text-[#A8B0BD] hover:text-white transition-colors mt-1"
            >
              ← Back to Sign In
            </button>
          </form>
        ) : (
          /* Email / Password Main Form */
          <form onSubmit={handleEmailAuth} className="flex flex-col gap-3.5">

            <div className="text-left">
              <label className="block text-xs font-semibold text-[#CBD5E1] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#6F7886] absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[#0F141D] text-xs sm:text-sm text-[#F5F7FA] placeholder-[#4B5563] border border-white/[0.08] focus:outline-none focus:border-[#3B9EFF] focus:ring-1 focus:ring-[#3B9EFF] transition-all"
                />
              </div>
            </div>

            <div className="text-left">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#CBD5E1]">
                  Password
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgot(true);
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="text-[11px] text-[#3B9EFF] hover:text-[#5AAFFF] transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#6F7886] absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                  className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#0F141D] text-xs sm:text-sm text-[#F5F7FA] placeholder-[#4B5563] border border-white/[0.08] focus:outline-none focus:border-[#3B9EFF] focus:ring-1 focus:ring-[#3B9EFF] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-[#6F7886] hover:text-[#A8B0BD] transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full h-11 sm:h-12 mt-2 rounded-xl bg-[#3B9EFF] hover:bg-[#5AAFFF] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#3B9EFF]/25 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <span>{mode === "signin" ? "Sign In" : "Create CineTrack Account"}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Quick Switch Text Link */}
            <div className="text-center mt-3">
              <span className="text-xs text-[#A8B0BD]">
                {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              </span>
              <Link
                href={`/login?mode=${mode === "signin" ? "signup" : "signin"}${next !== "/library" ? `&next=${encodeURIComponent(next)}` : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setSuccessMsg(null);
                  setShowForgot(false);
                }}
                className="text-xs font-semibold text-[#3B9EFF] hover:text-[#5AAFFF] transition-colors"
              >
                {mode === "signin" ? "Create Account" : "Sign In"}
              </Link>
            </div>
          </form>
        )}

        {/* Footer info */}
        <p className="text-[11px] text-[#6F7886] mt-6 text-center leading-relaxed">
          By signing in, you agree to CineTrack terms and community guidelines.
        </p>

        {/* Back / Continue as Guest Button */}
        <button
          type="button"
          onClick={handleBack}
          className="w-full mt-4 h-10 rounded-xl bg-[#1A2330]/80 hover:bg-[#222E3F] active:scale-[0.99] border border-white/[0.08] hover:border-[#3B9EFF]/30 text-xs font-semibold text-[#A8B0BD] hover:text-[#F5F7FA] inline-flex items-center justify-center gap-2 transition-all cursor-pointer group shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#3B9EFF] group-hover:-translate-x-0.5 transition-transform" />
          <span>{backTarget.label ? `Back to ${backTarget.label}` : "Continue as Guest"}</span>
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-[#0F141D] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#3B9EFF]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
