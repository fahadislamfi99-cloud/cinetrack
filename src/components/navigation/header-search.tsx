"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Search,
  X,
  Loader2,
  Film,
  Tv,
  Flame,
  User,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { NormalizedMedia } from "@/lib/media/normalize";
import { ProfileSearchResult } from "@/app/api/search/route";

interface HeaderSearchProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export function HeaderSearch({ isMobileOpen, onCloseMobile }: HeaderSearchProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [liveResults, setLiveResults] = useState<{
    media: NormalizedMedia[];
    profiles: ProfileSearchResult[];
  }>({ media: [], profiles: [] });

  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync search input if already on /search page
  useEffect(() => {
    if (typeof window !== "undefined" && pathname === "/search") {
      const q = new URLSearchParams(window.location.search).get("q") || "";
      setSearchQuery(q);
    }
  }, [pathname]);

  // Global keyboard shortcut: Command+K / Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        desktopInputRef.current?.focus();
      } else if (e.key === "Escape") {
        setIsFocused(false);
        onCloseMobile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCloseMobile]);

  // Focus mobile input when mobile search overlay opens
  useEffect(() => {
    if (isMobileOpen) {
      setTimeout(() => {
        mobileInputRef.current?.focus();
      }, 50);
    }
  }, [isMobileOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced live preview search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setLiveResults({ media: [], profiles: [] });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          setLiveResults({
            media: (data.media || []).slice(0, 4),
            profiles: (data.profiles || []).slice(0, 3),
          });
        }
      } catch (err) {
        console.error("Live search preview error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleCloseMobile = () => {
    setIsFocused(false);
    onCloseMobile();
  };

  useEffect(() => {
    if (!isMobileOpen) {
      setIsFocused(false);
    }
  }, [isMobileOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      setIsFocused(false);
      onCloseMobile();
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleSelectResult = () => {
    setIsFocused(false);
    onCloseMobile();
  };

  const showDropdown = isFocused && searchQuery.trim().length >= 2;

  const getFormatIcon = (type: string) => {
    if (type === "anime") return <Flame className="w-3 h-3 text-orange-400 shrink-0" />;
    if (type === "series") return <Tv className="w-3 h-3 text-purple-400 shrink-0" />;
    return <Film className="w-3 h-3 text-[#3B9EFF] shrink-0" />;
  };

  const getMediaUrl = (media: NormalizedMedia) => {
    const rawId = media.sourceId || media.id;
    const cleanId = rawId.split(":").pop() || rawId;
    return `/${media.mediaType}/${cleanId}`;
  };

  return (
    <div ref={containerRef} className={isMobileOpen ? "relative z-[60]" : "relative"}>
      {/* 1. Mobile Search Overlay Bar (< 768px when active) */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-x-0 top-0 h-14 sm:h-16 bg-[#0F141D] z-[60] flex items-center px-3 border-b border-white/[0.08] shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200">
          <form onSubmit={handleSubmit} className="relative flex items-center w-full gap-2">
            <button
              type="button"
              onClick={handleCloseMobile}
              className="p-1.5 text-[#A8B0BD] hover:text-[#F5F7FA] rounded-lg cursor-pointer shrink-0"
              aria-label="Close search"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="relative flex-1 flex items-center">
              <input
                ref={mobileInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                placeholder="Search movies, TV, anime, profiles..."
                className="w-full h-10 pl-3 pr-9 bg-[#151C27] border border-white/[0.1] rounded-xl text-[#F5F7FA] text-sm placeholder-[#6F7886] focus:outline-none focus:border-[#3B9EFF]"
              />
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-[#3B9EFF] animate-spin absolute right-3 pointer-events-none" />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 text-[#6F7886] hover:text-white p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-[#3B9EFF] text-white text-xs font-semibold shrink-0 cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>
      )}

      {/* 2. Tablet Search Box (768px - 1023px) */}
      <form
        onSubmit={handleSubmit}
        className="relative hidden md:flex lg:hidden items-center w-28 sm:w-32 md:w-36 transition-all duration-200 focus-within:w-44 shrink-0"
      >
        <Search className="w-3.5 h-3.5 text-[#6F7886] absolute left-2.5 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search..."
          className="w-full h-8 bg-[#151C27] text-xs text-[#F5F7FA] placeholder-[#6F7886] pl-8 pr-7 rounded-lg border border-white/[0.08] focus:outline-none focus:border-[#3B9EFF] transition-all"
        />
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 text-[#3B9EFF] animate-spin absolute right-2 pointer-events-none" />
        ) : searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2 text-[#6F7886] hover:text-white p-0.5 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
      </form>

      {/* 3. Desktop / iPad Pro Search Bar (≥ 1024px) */}
      <form
        onSubmit={handleSubmit}
        className="relative hidden lg:block w-44 xl:w-72 2xl:w-80 transition-all duration-200 focus-within:w-56 xl:focus-within:w-72 shrink-0"
      >
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6F7886] pointer-events-none" />
        <input
          ref={desktopInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search movies, TV, users..."
          className="w-full h-9 pl-9 pr-12 xl:pr-14 bg-[#1A2330]/70 border border-white/[0.06] hover:border-white/[0.12] focus:border-[#3B9EFF] rounded-lg text-[#F5F7FA] text-xs xl:text-[13px] placeholder:text-[#6F7886] focus:outline-none transition-colors"
        />
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-[#3B9EFF] animate-spin absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        ) : searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-7 xl:right-8 top-1/2 -translate-y-1/2 text-[#6F7886] hover:text-white p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden xl:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-semibold text-[#6F7886] bg-[#1B2029] rounded border border-white/[0.06] pointer-events-none select-none">
            ⌘K
          </kbd>
        )}
      </form>

      {/* 4. Live Search Dropdown Preview */}
      {showDropdown && (
        <div
          className={`absolute left-0 lg:left-auto lg:right-0 mt-2 z-[70] rounded-2xl bg-[#141B26]/95 backdrop-blur-2xl border border-white/[0.1] shadow-2xl overflow-hidden divide-y divide-white/[0.06] transition-all animate-in fade-in slide-in-from-top-2 duration-150 ${
            isMobileOpen
              ? "fixed top-14 sm:top-16 left-3 right-3 max-h-[calc(100vh-80px)] overflow-y-auto"
              : "w-[340px] sm:w-[400px] lg:w-[420px] max-h-[500px] overflow-y-auto"
          }`}
        >
          {/* Section A: Profiles Matches */}
          {liveResults.profiles.length > 0 && (
            <div className="p-2.5">
              <div className="px-2.5 py-1 text-[11px] font-bold text-[#A8B0BD] uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3 h-3 text-[#3B9EFF]" />
                <span>Profiles</span>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {liveResults.profiles.map((profile) => (
                  <Link
                    key={profile.id}
                    href={`/${profile.username}`}
                    onClick={handleSelectResult}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.05] transition-colors group cursor-pointer"
                  >
                    {profile.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fallback) fallback.classList.remove("hidden");
                        }}
                        className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
                      />
                    ) : null}
                    <div
                      className={`w-8 h-8 rounded-full bg-[#3B9EFF]/20 text-[#3B9EFF] flex items-center justify-center font-bold text-xs shrink-0 border border-[#3B9EFF]/30 ${
                        profile.avatarUrl ? "hidden" : "flex"
                      }`}
                    >
                      {(profile.fullName || profile.username).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[#F5F7FA] group-hover:text-[#3B9EFF] transition-colors truncate">
                        {profile.fullName || profile.username}
                      </div>
                      <div className="text-[11px] text-[#3B9EFF] font-mono truncate">
                        @{profile.username}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Section B: Media Matches */}
          {liveResults.media.length > 0 && (
            <div className="p-2.5">
              <div className="px-2.5 py-1 text-[11px] font-bold text-[#A8B0BD] uppercase tracking-wider flex items-center gap-1.5">
                <Film className="w-3 h-3 text-[#3B9EFF]" />
                <span>Media</span>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {liveResults.media.map((item) => (
                  <Link
                    key={item.id}
                    href={getMediaUrl(item)}
                    onClick={handleSelectResult}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.05] transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-12 rounded bg-[#1A2330] overflow-hidden shrink-0 border border-white/[0.06]">
                      {item.posterPath ? (
                        <img
                          src={item.posterPath}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-[#6F7886]">
                          N/A
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[#F5F7FA] group-hover:text-[#3B9EFF] transition-colors truncate">
                        {item.title}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#8B95A5] mt-0.5">
                        {getFormatIcon(item.mediaType)}
                        <span className="capitalize">{item.mediaType}</span>
                        {item.year && (
                          <>
                            <span>•</span>
                            <span>{item.year}</span>
                          </>
                        )}
                        {item.rating ? (
                          <>
                            <span>•</span>
                            <span className="text-[#F5C84B] font-semibold">
                              ★ {item.rating.toFixed(1)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Section C: Loading State */}
          {isLoading && liveResults.media.length === 0 && liveResults.profiles.length === 0 && (
            <div className="p-6 flex items-center justify-center gap-2 text-xs text-[#A8B0BD]">
              <Loader2 className="w-4 h-4 text-[#3B9EFF] animate-spin" />
              <span>Searching catalog & profiles...</span>
            </div>
          )}

          {/* Section D: No Results State */}
          {!isLoading && liveResults.media.length === 0 && liveResults.profiles.length === 0 && (
            <div className="p-6 text-center text-xs text-[#A8B0BD]">
              <p className="font-semibold text-[#F5F7FA]">No quick matches found</p>
              <p className="text-[11px] text-[#6F7886] mt-0.5">
                Press Enter to search full titles and profile records.
              </p>
            </div>
          )}

          {/* Section E: View All Results Link */}
          <div className="p-2 bg-[#0B0F17]/50">
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="w-full py-2 px-3 rounded-xl bg-[#1D2734] hover:bg-[#253244] border border-white/[0.08] hover:border-[#3B9EFF]/40 text-xs font-semibold text-[#F5F7FA] hover:text-white flex items-center justify-between transition-colors cursor-pointer group"
            >
              <span className="truncate">
                View all results for <strong className="text-[#3B9EFF]">&ldquo;{searchQuery}&rdquo;</strong>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#A8B0BD] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
