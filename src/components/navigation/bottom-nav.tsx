"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Compass,
  Film,
  BookmarkCheck,
  Plus,
  MoreHorizontal,
  X,
  ChevronRight,
  Info,
  Mail,
  Lightbulb,
  FileText,
  Shield,
  Settings as SettingsIcon,
  LogOut,
  Loader2,
  LogIn,
  Download,
} from "lucide-react";
import { QuickAddModal } from "@/components/quick-add/quick-add-modal";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { usePwaInstall } from "@/components/pwa/pwa-install-provider";

function getCachedUsername(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)cinetrack_username=([^;]+)/);
  if (match) {
    const val = decodeURIComponent(match[1]).trim();
    if (val && !val.includes(" ") && /^[a-zA-Z0-9_.-]+$/.test(val)) {
      return val;
    }
    document.cookie = "cinetrack_username=; path=/; max-age=0";
  }
  return null;
}

function BottomNavContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openInstallModal, isInstalled } = usePwaInstall();
  const currentType = searchParams.get("type");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string; username?: string } | null>(() => {
    const cached = getCachedUsername();
    return cached ? { username: cached } : null;
  });
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const cached = getCachedUsername();
        const rawUsername = cached || session.user.user_metadata?.user_name || session.user.email?.split("@")[0];
        const username = rawUsername ? rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, "") : undefined;
        setUser({ email: session.user.email, username });
      } else {
        setUser(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const cached = getCachedUsername();
        const rawUsername = cached || session.user.user_metadata?.user_name || session.user.email?.split("@")[0];
        const username = rawUsername ? rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, "") : undefined;
        setUser({ email: session.user.email, username });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      if (typeof document !== "undefined") {
        document.cookie = "cinetrack_username=; path=/; max-age=0";
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      setIsMoreOpen(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleAddClick = () => {
    if (!user) {
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(currentUrl)}`);
      return;
    }
    setIsAddOpen(true);
  };

  // Lock background scrolling when More sheet is open
  useScrollLock(isMoreOpen);

  // Close sheet on route change
  useEffect(() => {
    setIsMoreOpen(false);
  }, [pathname]);

  // Close sheet on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMoreOpen(false);
    };
    if (isMoreOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMoreOpen]);

  const moreLinks = [
    {
      label: "Settings",
      href: "/settings",
      icon: SettingsIcon,
    },
    {
      label: "About",
      href: "/about",
      icon: Info,
    },
    {
      label: "Contact",
      href: "/contact",
      icon: Mail,
    },
    {
      label: "Terms and Conditions",
      href: "/terms",
      icon: FileText,
    },
    {
      label: "Privacy Policy",
      href: "/privacy",
      icon: Shield,
    },
  ];

  const isMoreActive =
    isMoreOpen ||
    pathname.startsWith("/settings") ||
    ["/about", "/contact", "/feedback", "/terms", "/privacy"].includes(pathname);

  const navItems = [
    {
      label: "Home",
      href: "/home",
      icon: Film,
      isActive: pathname === "/home",
    },
    {
      label: "Discover",
      href: "/discover",
      icon: Compass,
      isActive: pathname === "/discover" && !currentType,
    },
    {
      label: "Add",
      href: "#",
      icon: Plus,
      isActive: isAddOpen,
      isPrimary: true,
    },
    {
      label: "Library",
      href: user?.username ? `/${user.username}` : "/library",
      icon: BookmarkCheck,
      isActive:
        pathname === "/library" ||
        pathname.startsWith("/u/") ||
        (![
          "/",
          "/discover",
          "/search",
          "/login",
          "/about",
          "/contact",
          "/feedback",
          "/terms",
          "/privacy",
        ].includes(pathname) &&
          !pathname.startsWith("/settings") &&
          !pathname.startsWith("/movie") &&
          !pathname.startsWith("/series") &&
          !pathname.startsWith("/anime") &&
          !pathname.startsWith("/tv")),
    },
  ];

  return (
    <>
      {/* Backdrop for More Sheet */}
      <div
        className={`md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ease-out ${
          isMoreOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsMoreOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-up Sheet for More links (z-40, sits seamlessly behind bottom nav bar z-50) */}
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 max-h-[85dvh] overflow-y-auto overscroll-contain p-4 bg-[#151C27] border-t border-white/10 rounded-t-2xl shadow-[0_-12px_32px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out will-change-transform ${
          isMoreOpen
            ? "translate-y-0 pointer-events-auto"
            : "translate-y-full pointer-events-none"
        }`}
        style={{
          paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
        }}
        role="dialog"
        aria-label="More navigation links"
        aria-hidden={!isMoreOpen}
      >
          {/* Subtle drag indicator handle */}
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />

          <div className="px-1 mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F7886]">
              More Links
            </span>
          </div>

          {/* Prominent Install CineTrack App Action */}
          <button
            type="button"
            onClick={() => {
              setIsMoreOpen(false);
              openInstallModal(false);
            }}
            className="w-full flex items-center justify-between p-2.5 sm:p-3.5 mb-2 sm:mb-2.5 rounded-2xl bg-gradient-to-r from-[#3B9EFF]/20 via-[#3B9EFF]/10 to-[#2563EB]/15 hover:from-[#3B9EFF]/25 hover:to-[#2563EB]/20 border border-[#3B9EFF]/35 transition-all cursor-pointer group shadow-[0_0_16px_rgba(59,158,255,0.1)] text-left active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#3B9EFF] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#3B9EFF]/30 group-hover:scale-105 transition-transform">
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[13px] sm:text-sm font-bold text-[#F5F7FA] block leading-tight">
                  Install CineTrack
                </span>
                <span className="text-[10px] sm:text-[11px] text-[#A8B0BD] mt-0.5 block truncate">
                  {isInstalled ? "App is active on this device" : "Add to home screen for full-screen"}
                </span>
              </div>
            </div>
            <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-[#3B9EFF] text-white shadow-sm shadow-[#3B9EFF]/25 shrink-0 flex items-center gap-1 ml-2">
              <span>{isInstalled ? "Installed" : "Install"}</span>
            </span>
          </button>

          {/* Eye-catching Highlighted Feature Request Card */}
          <Link
            href="/feedback"
            onClick={() => setIsMoreOpen(false)}
            className="flex items-center justify-between p-2.5 sm:p-3.5 mb-2.5 sm:mb-3 rounded-2xl bg-gradient-to-r from-[#3B9EFF]/15 to-[#3B9EFF]/5 hover:from-[#3B9EFF]/20 hover:to-[#3B9EFF]/10 border border-[#3B9EFF]/30 transition-all cursor-pointer group shadow-[0_0_16px_rgba(59,158,255,0.08)]"
          >
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#3B9EFF]/20 border border-[#3B9EFF]/30 flex items-center justify-center text-[#3B9EFF] shrink-0">
                <Lightbulb className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div className="text-left">
                <span className="text-[13px] sm:text-sm font-semibold text-[#F5F7FA] block leading-tight">
                  Need a New Feature?
                </span>
                <span className="text-[10px] sm:text-[11px] text-[#3B9EFF] mt-0.5 block">
                  Request a feature or report a bug
                </span>
              </div>
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#3B9EFF] text-white shrink-0">
              Request
            </span>
          </Link>

          <div className="space-y-0.5 sm:space-y-1">
            {moreLinks.map((link) => {
              const Icon = link.icon;
              const isCurrent = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMoreOpen(false)}
                  className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl transition-all cursor-pointer ${
                    isCurrent
                      ? "bg-[#3B9EFF]/15 text-[#3B9EFF] font-semibold"
                      : "text-[#F5F7FA] hover:bg-white/[0.06] active:bg-white/[0.1] font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <Icon
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                        isCurrent ? "text-[#3B9EFF]" : "text-[#A8B0BD]"
                      }`}
                    />
                    <span className="text-xs sm:text-sm">{link.label}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6F7886]" />
                </Link>
              );
            })}
          </div>

          {/* Session Actions: Sign Out (if logged in) or Sign In (if guest) */}
          {user ? (
            <>
              <div className="my-2.5 border-t border-white/[0.08]" />
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full flex items-center justify-between p-3 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 active:bg-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                    {isSigningOut ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4" />
                    )}
                  </div>
                  <span className="text-sm font-semibold">
                    {isSigningOut ? "Signing out..." : "Sign Out"}
                  </span>
                </div>
              </button>
            </>
          ) : (
            <>
              <div className="my-2.5 border-t border-white/[0.08]" />
              <Link
                href="/login"
                onClick={() => setIsMoreOpen(false)}
                className="w-full flex items-center justify-between p-3 rounded-xl text-[#3B9EFF] hover:bg-[#3B9EFF]/10 active:bg-[#3B9EFF]/20 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#3B9EFF]/10 border border-[#3B9EFF]/20 text-[#3B9EFF] flex items-center justify-center shrink-0">
                    <LogIn className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold">Sign In</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#3B9EFF]/60" />
              </Link>
            </>
          )}
        </div>

      {/* Main Bottom Navigation Bar (z-50 solid background so sheet slides behind it) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe bg-[#151C27] border-t border-white/[0.06] shadow-2xl">
        <div className="h-14 sm:h-16 flex items-center justify-around px-0.5 sm:px-2">
          {navItems.map((item) => {
            if (item.isPrimary) {
              return (
                <button
                  key={item.label}
                  type="button"
                  suppressHydrationWarning
                  onClick={handleAddClick}
                  className="flex flex-col items-center justify-center min-w-[42px] sm:min-w-[48px] h-full py-0.5 sm:py-1 gap-0.5 group focus:outline-none cursor-pointer"
                  aria-label="Add to Library"
                >
                  <div
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 ${
                      isAddOpen
                        ? "bg-[#5AAFFF] text-white shadow-[#3B9EFF]/40 ring-2 ring-[#3B9EFF]/50"
                        : "bg-[#3B9EFF] hover:bg-[#5AAFFF] text-white shadow-[#3B9EFF]/25"
                    }`}
                  >
                    <Plus className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.5]" />
                  </div>
                  <span className="text-[9.5px] sm:text-[10px] font-semibold text-[#3B9EFF] tracking-tight">
                    {item.label}
                  </span>
                </button>
              );
            }

            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex flex-col items-center justify-center min-w-[38px] sm:min-w-[44px] h-full py-0.5 sm:py-1 gap-0.5 sm:gap-1 transition-colors cursor-pointer ${
                  item.isActive
                    ? "text-[#3B9EFF]"
                    : "text-[#A8B0BD] hover:text-[#F5F7FA]"
                }`}
              >
                <div className="relative">
                  <Icon className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                  {item.isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#3B9EFF]" />
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium tracking-tight">
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* Right Corner: "More" / "Close" Animated Button */}
          <button
            type="button"
            onClick={() => setIsMoreOpen((prev) => !prev)}
            className={`flex flex-col items-center justify-center min-w-[44px] h-full py-1 gap-1 transition-colors cursor-pointer ${
              isMoreOpen || isMoreActive
                ? "text-[#3B9EFF]"
                : "text-[#A8B0BD] hover:text-[#F5F7FA]"
            }`}
            aria-expanded={isMoreOpen}
            aria-label={isMoreOpen ? "Close menu" : "More navigation links"}
          >
            <div className="relative w-5 h-5 flex items-center justify-center">
              <MoreHorizontal
                className={`w-5 h-5 absolute inset-0 transition-all duration-300 transform ${
                  isMoreOpen
                    ? "opacity-0 rotate-90 scale-50"
                    : "opacity-100 rotate-0 scale-100"
                }`}
              />
              <X
                className={`w-5 h-5 absolute inset-0 transition-all duration-300 transform ${
                  isMoreOpen
                    ? "opacity-100 rotate-0 scale-100"
                    : "opacity-0 -rotate-90 scale-50"
                }`}
              />
              {!isMoreOpen && isMoreActive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#3B9EFF]" />
              )}
            </div>
            <span className="text-[11px] font-medium tracking-tight transition-colors">
              {isMoreOpen ? "Close" : "More"}
            </span>
          </button>
        </div>
      </nav>

      {/* Add to Library Modal */}
      <QuickAddModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        media={null}
      />
    </>
  );
}

export function BottomNav() {
  return (
    <Suspense
      fallback={
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe bg-[#151C27]/95 backdrop-blur-xl border-t border-white/[0.06] h-16" />
      }
    >
      <BottomNavContent />
    </Suspense>
  );
}
