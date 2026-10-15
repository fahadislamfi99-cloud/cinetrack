"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  Bell,
  Film,
  Plus,
  Settings,
  ChevronDown,
  Info,
  Mail,
  Lightbulb,
  FileText,
  Shield,
  User,
  BookmarkCheck,
  LogOut,
  Loader2,
  Download,
} from "lucide-react";
import { QuickAddModal } from "../quick-add/quick-add-modal";
import { LogoIcon } from "@/components/ui/logo-icon";
import { createClient } from "@/lib/supabase/client";
import { usePwaInstall } from "@/components/pwa/pwa-install-provider";

import { HeaderSearch } from "./header-search";
import { NotificationDropdown } from "./notification-dropdown";

interface AppHeaderProps {
  user?: {
    id?: string;
    email?: string;
    avatarUrl?: string;
    username?: string;
    displayName?: string;
    fullName?: string;
  } | null;
}

function getCachedUsername(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)cinetrack_username=([^;]+)/);
  if (match) {
    const val = decodeURIComponent(match[1]).trim();
    if (val && !val.includes(" ") && /^[a-zA-Z0-9_.-]+$/.test(val)) {
      return val;
    }
    // Clear corrupted cookie containing spaces or invalid chars
    document.cookie = "cinetrack_username=; path=/; max-age=0";
  }
  return null;
}

export function AppHeader({ user: initialUser }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { openInstallModal, isInstalled } = usePwaInstall();
  const [currentUser, setCurrentUser] = useState<AppHeaderProps["user"]>(() => {
    if (initialUser !== undefined) return initialUser;
    const cached = getCachedUsername();
    return cached ? { username: cached } : null;
  });
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMoreDropdownOpen, setIsMoreDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const moreDropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isMoreActive = ["/about", "/contact", "/feedback", "/terms", "/privacy"].includes(pathname);
  const isLibraryActive =
    pathname === "/library" ||
    (currentUser?.username
      ? pathname === `/${currentUser.username}` ||
        pathname === `/u/${currentUser.username}`
      : false);

  // Close dropdown on route change
  useEffect(() => {
    setIsMoreDropdownOpen(false);
  }, [pathname]);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        moreDropdownRef.current &&
        !moreDropdownRef.current.contains(e.target as Node)
      ) {
        setIsMoreDropdownOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMoreDropdownOpen(false);
        setIsUserMenuOpen(false);
      }
    };

    if (isMoreDropdownOpen || isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreDropdownOpen, isUserMenuOpen]);

  useEffect(() => {
    if (initialUser !== undefined) {
      setCurrentUser(initialUser);
      if (initialUser?.username && typeof document !== "undefined") {
        document.cookie = `cinetrack_username=${encodeURIComponent(initialUser.username)}; path=/; max-age=31536000; SameSite=Lax`;
      }
      return;
    }

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const cached = getCachedUsername();
        const rawUsername = cached || session.user.user_metadata?.user_name || session.user.email?.split("@")[0];
        const username = rawUsername ? rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, "") : undefined;
        if (username && typeof document !== "undefined") {
          document.cookie = `cinetrack_username=${encodeURIComponent(username)}; path=/; max-age=31536000; SameSite=Lax`;
        }
        setCurrentUser({
          email: session.user.email,
          avatarUrl: session.user.user_metadata?.avatar_url,
          username,
        });
      } else {
        setCurrentUser(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const cached = getCachedUsername();
        const rawUsername = cached || session.user.user_metadata?.user_name || session.user.email?.split("@")[0];
        const username = rawUsername ? rawUsername.toLowerCase().replace(/[^a-z0-9_]/g, "") : undefined;
        if (username && typeof document !== "undefined") {
          document.cookie = `cinetrack_username=${encodeURIComponent(username)}; path=/; max-age=31536000; SameSite=Lax`;
        }
        setCurrentUser({
          email: session.user.email,
          avatarUrl: session.user.user_metadata?.avatar_url,
          username,
        });
      } else {
        setCurrentUser(null);
        if (typeof document !== "undefined") {
          document.cookie = "cinetrack_username=; path=/; max-age=0";
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [initialUser]);

  const handleQuickAdd = () => {
    if (!currentUser) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setIsQuickAddOpen(true);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      if (typeof document !== "undefined") {
        document.cookie = "cinetrack_username=; path=/; max-age=0";
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      setCurrentUser(null);
      setIsUserMenuOpen(false);
      setIsMoreDropdownOpen(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-50 bg-[#0F141D]/90 backdrop-blur-xl border-b border-white/[0.06] shadow-[0_1px_8px_rgba(0,0,0,0.04)] h-14 sm:h-16 lg:h-[70px] flex items-center">
        <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-5 md:px-6 lg:px-8 xl:px-12 flex items-center justify-between gap-1.5 sm:gap-4 lg:gap-6">
          {/* Left: Brand & Navigation Links */}
          <div className="flex items-center gap-3 sm:gap-4 md:gap-4 lg:gap-6 xl:gap-8 min-w-0">
            {/* Brand Logo & Badge */}
            <Link
              href="/"
              className="flex items-center gap-2 sm:gap-2.5 shrink-0 group focus:outline-none"
            >
              <LogoIcon className="w-6 h-6 sm:w-7 sm:h-7" size={28} priority />
              <span className="font-bold text-base sm:text-lg tracking-tight text-[#F5F7FA]">
                Cine<span className="text-[#3B9EFF]">Track</span>
              </span>
            </Link>

            {/* Main Navigation Menu Links */}
            <nav
              className="hidden md:flex items-center gap-2 md:gap-2.5 lg:gap-4 xl:gap-6 shrink-0 text-xs md:text-[13px] lg:text-[13px] xl:text-[14px]"
              aria-label="Main Navigation"
            >
              <Link
                href="/home"
                className={`relative py-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-1 group ${
                  pathname === "/home"
                    ? "text-[#F5F7FA]"
                    : "text-[#A8B0BD] hover:text-[#F5F7FA]"
                }`}
              >
                <span>Home</span>
                {pathname === "/home" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#3B9EFF]" />
                )}
              </Link>
              <Link
                href="/discover"
                className={`relative py-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-1 group ${
                  pathname === "/discover"
                    ? "text-[#F5F7FA]"
                    : "text-[#A8B0BD] hover:text-[#F5F7FA]"
                }`}
              >
                <span>Discover</span>
                {pathname === "/discover" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#3B9EFF]" />
                )}
              </Link>
              <Link
                href={currentUser?.username ? `/${currentUser.username}` : "/library"}
                className={`relative py-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-1 group ${
                  isLibraryActive
                    ? "text-[#F5F7FA]"
                    : "text-[#A8B0BD] hover:text-[#F5F7FA]"
                }`}
              >
                <span>My Library</span>
                {isLibraryActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#3B9EFF]" />
                )}
              </Link>

              {/* More Dropdown (Desktop) */}
              <div
                className="relative"
                ref={moreDropdownRef}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsMoreDropdownOpen((prev) => !prev);
                  }}
                  className={`relative py-2 font-semibold whitespace-nowrap transition-colors flex items-center gap-1 group cursor-pointer ${
                    isMoreActive
                      ? "text-[#F5F7FA]"
                      : "text-[#A8B0BD] hover:text-[#F5F7FA]"
                  }`}
                  aria-expanded={isMoreDropdownOpen}
                  aria-haspopup="true"
                >
                  <span>More</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-300 ease-out ${
                      isMoreDropdownOpen ? "rotate-180 text-[#3B9EFF]" : "text-[#A8B0BD] group-hover:text-[#F5F7FA]"
                    }`}
                  />
                  {isMoreActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#3B9EFF]" />
                  )}
                </button>

                {/* Dropdown Menu Container with seamless hover bridge & smooth slow animation */}
                <div
                  className={`absolute top-full left-0 pt-2 w-64 sm:w-72 z-50 transition-all duration-300 ease-out origin-top-left ${
                    isMoreDropdownOpen
                      ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                      : "opacity-0 scale-[0.96] -translate-y-2 pointer-events-none"
                  }`}
                >
                  <div className="p-2 rounded-2xl bg-[#151C27]/95 border border-white/[0.12] shadow-[0_20px_45px_rgba(0,0,0,0.65)] backdrop-blur-2xl ring-1 ring-black/40 flex flex-col gap-1">
                    {/* Install CineTrack PWA Action */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreDropdownOpen(false);
                        openInstallModal(false);
                      }}
                      className="flex items-center justify-between px-3 py-2 sm:py-2.5 rounded-xl text-xs font-semibold text-[#F5F7FA] hover:text-[#3B9EFF] hover:bg-white/[0.05] transition-all duration-200 group/install cursor-pointer w-full text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-[#3B9EFF]/10 border border-[#3B9EFF]/20 text-[#3B9EFF] group-hover/install:bg-[#3B9EFF] group-hover/install:text-white transition-colors flex items-center justify-center shrink-0">
                          <Download className="w-3.5 h-3.5" />
                        </div>
                        <span>Install CineTrack</span>
                      </div>
                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[#3B9EFF]/15 text-[#3B9EFF] border border-[#3B9EFF]/30 group-hover/install:bg-[#3B9EFF] group-hover/install:text-white transition-colors">
                        {isInstalled ? "Active" : "App"}
                      </span>
                    </button>

                    <div className="my-0.5 border-t border-white/[0.08]" />

                    <Link
                      href="/about"
                      onClick={() => setIsMoreDropdownOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        pathname === "/about"
                          ? "bg-[#3B9EFF]/15 text-[#3B9EFF]"
                          : "text-[#A8B0BD] hover:text-white hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="w-6 h-6 rounded-lg bg-[#3B9EFF]/10 border border-[#3B9EFF]/20 text-[#3B9EFF] flex items-center justify-center shrink-0">
                        <Info className="w-3.5 h-3.5" />
                      </div>
                      <span>About</span>
                    </Link>

                    <Link
                      href="/contact"
                      onClick={() => setIsMoreDropdownOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        pathname === "/contact"
                          ? "bg-[#3B9EFF]/15 text-[#3B9EFF]"
                          : "text-[#A8B0BD] hover:text-white hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="w-6 h-6 rounded-lg bg-[#3B9EFF]/10 border border-[#3B9EFF]/20 text-[#3B9EFF] flex items-center justify-center shrink-0">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                      <span>Contact</span>
                    </Link>

                    {/* Focused & Highlighted Feature Request Card */}
                    <div className="my-1">
                      <Link
                        href="/feedback"
                        onClick={() => setIsMoreDropdownOpen(false)}
                        className={`relative p-2.5 rounded-xl border transition-all duration-250 flex items-center justify-between group/feat overflow-hidden cursor-pointer ${
                          pathname === "/feedback"
                            ? "bg-[#3B9EFF]/20 border-[#3B9EFF] shadow-[0_0_20px_rgba(59,158,255,0.25)]"
                            : "bg-gradient-to-r from-[#3B9EFF]/15 via-[#3B9EFF]/8 to-amber-500/10 hover:from-[#3B9EFF]/25 hover:via-[#3B9EFF]/15 hover:to-amber-500/15 border-[#3B9EFF]/30 hover:border-[#3B9EFF]/60 shadow-[0_0_14px_rgba(59,158,255,0.1)] hover:shadow-[0_0_22px_rgba(59,158,255,0.22)] active:scale-[0.98]"
                        }`}
                      >
                        {/* Ambient subtle glow background */}
                        <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-[#3B9EFF]/20 rounded-full blur-xl pointer-events-none group-hover/feat:bg-[#3B9EFF]/30 transition-colors" />

                        <div className="flex items-center gap-2.5 relative z-10 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-amber-400/20 border border-amber-400/35 text-amber-300 flex items-center justify-center shrink-0 shadow-sm group-hover/feat:scale-105 group-hover/feat:bg-amber-400/30 transition-all">
                            <Lightbulb className="w-4 h-4 text-amber-300" />
                          </div>
                          <div className="flex flex-col text-left min-w-0">
                            <span className="font-bold text-xs text-[#F5F7FA] group-hover/feat:text-white leading-tight">
                              Request Feature
                            </span>
                            <span className="text-[10px] text-[#A8B0BD] group-hover/feat:text-[#E2E8F0] leading-tight mt-0.5 truncate">
                              Suggest ideas &amp; improvements
                            </span>
                          </div>
                        </div>

                        <span className="relative z-10 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[#3B9EFF]/20 text-[#3B9EFF] border border-[#3B9EFF]/30 group-hover/feat:bg-[#3B9EFF] group-hover/feat:text-white transition-colors shrink-0 ml-2">
                          New
                        </span>
                      </Link>
                    </div>

                    <div className="my-0.5 border-t border-white/[0.08]" />

                    <Link
                      href="/terms"
                      onClick={() => setIsMoreDropdownOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        pathname === "/terms"
                          ? "bg-[#3B9EFF]/15 text-[#3B9EFF]"
                          : "text-[#A8B0BD] hover:text-white hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[#A8B0BD] flex items-center justify-center shrink-0">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <span>Terms and Conditions</span>
                    </Link>

                    <Link
                      href="/privacy"
                      onClick={() => setIsMoreDropdownOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        pathname === "/privacy"
                          ? "bg-[#3B9EFF]/15 text-[#3B9EFF]"
                          : "text-[#A8B0BD] hover:text-white hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[#A8B0BD] flex items-center justify-center shrink-0">
                        <Shield className="w-3.5 h-3.5" />
                      </div>
                      <span>Privacy Policy</span>
                    </Link>

                    {currentUser && (
                      <>
                        <div className="my-0.5 border-t border-white/[0.08]" />
                        <button
                          type="button"
                          onClick={() => {
                            setIsMoreDropdownOpen(false);
                            handleSignOut();
                          }}
                          disabled={isSigningOut}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <div className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                            {isSigningOut ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <LogOut className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </nav>
          </div>

          {/* Right: Search Bar & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 lg:gap-3 xl:gap-4 shrink-0">
            {/* Search Input for Desktop / Tablet & Mobile Overlay */}
            <HeaderSearch
              isMobileOpen={isMobileSearchOpen}
              onCloseMobile={() => setIsMobileSearchOpen(false)}
            />

            {/* Quick Add Button */}
            <button
              type="button"
              suppressHydrationWarning
              onClick={handleQuickAdd}
              className="hidden md:inline-flex h-8 lg:h-9 px-2.5 lg:px-3.5 rounded-lg bg-[#3B9EFF] hover:bg-[#5AAFFF] text-white font-semibold text-xs lg:text-[13px] items-center gap-1 lg:gap-1.5 transition-colors shadow-sm shrink-0 cursor-pointer"
              title="Add to Library"
            >
              <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              <span className="whitespace-nowrap">Add</span>
            </button>

            {/* Mobile Search Icon Button (Immediately Beside Notification Bell) */}
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => setIsMobileSearchOpen((prev) => !prev)}
              aria-label="Search"
              className="md:hidden p-1.5 sm:p-2 text-[#A8B0BD] hover:text-[#F5F7FA] hover:bg-[#1A2330] rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              <Search className="w-4.5 h-4.5 sm:w-5 sm:h-5 block" />
            </button>

            {/* Notification Bell Dropdown */}
            <NotificationDropdown currentUser={currentUser} />

            {/* Settings Link */}
            {currentUser && (
              <Link
                href="/settings"
                aria-label="Settings"
                title="Settings"
                className={`p-1.5 sm:p-2 rounded-lg transition-colors shrink-0 cursor-pointer ${
                  pathname.startsWith("/settings")
                    ? "text-[#3B9EFF] bg-[#1A2330]"
                    : "text-[#A8B0BD] hover:text-[#F5F7FA] hover:bg-[#1A2330]"
                }`}
              >
                <Settings className="w-4.5 h-4.5 sm:w-5 sm:h-5 block" />
              </Link>
            )}

            {/* User Profile Avatar / Sign In */}
            {currentUser ? (
              <div className="relative shrink-0 pl-1" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreDropdownOpen(false);
                    setIsUserMenuOpen((prev) => !prev);
                  }}
                  className="flex items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-[#3B9EFF]/40 cursor-pointer select-none"
                  aria-label="User account menu"
                  aria-expanded={isUserMenuOpen}
                >
                  {currentUser.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.username || "Profile"}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover border border-white/[0.06] hover:border-white/[0.16] ring-1 ring-white/[0.08] hover:ring-[#3B9EFF]/50 transition-all"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#3B9EFF]/20 border border-[#3B9EFF]/40 flex items-center justify-center text-xs font-semibold text-[#3B9EFF]">
                      {currentUser.email?.slice(0, 2).toUpperCase() || "U"}
                    </div>
                  )}
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2.5 w-60 rounded-2xl bg-[#141B26]/95 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/80 py-1.5 z-50 animate-in fade-in-50 zoom-in-95 duration-150">
                    {/* User Info Header */}
                    <div className="px-3.5 py-2.5 border-b border-white/[0.06]">
                      <p className="text-xs font-bold text-[#F5F7FA] truncate">
                        {currentUser.displayName || currentUser.fullName || currentUser.username || "User"}
                      </p>
                      <p className="text-[11px] text-[#A8B0BD] truncate mt-0.5">
                        {currentUser.email || `@${currentUser.username}`}
                      </p>
                    </div>

                    {/* Navigation Items */}
                    <div className="p-1 space-y-0.5">
                      <Link
                        href={currentUser.username ? `/${currentUser.username}` : "/library"}
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#A8B0BD] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <User className="w-4 h-4 text-[#3B9EFF]" />
                        <span>Public Profile</span>
                      </Link>

                      <Link
                        href={currentUser.username ? `/${currentUser.username}` : "/library"}
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#A8B0BD] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <BookmarkCheck className="w-4 h-4 text-[#10B981]" />
                        <span>My Library</span>
                      </Link>

                      <Link
                        href="/settings"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#A8B0BD] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-[#F5C84B]" />
                        <span>Settings</span>
                      </Link>
                    </div>

                    {/* Divider & Sign Out */}
                    <div className="p-1 border-t border-white/[0.06] mt-1">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        disabled={isSigningOut}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isSigningOut ? (
                          <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                        ) : (
                          <LogOut className="w-4 h-4 text-rose-400" />
                        )}
                        <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded-lg bg-[#1A2330] hover:bg-[#253244] text-xs font-semibold text-[#F5F7FA] border border-white/[0.08] transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Add to Library Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        media={null}
      />
    </>
  );
}

