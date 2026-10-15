"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Compass,
  Crown,
  Medal,
  CheckCircle2,
  Award,
  Flame,
  Clock,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { DiscoverFilterBar } from "./discover-filter-bar";
import { MediaCard } from "@/components/media/media-card";
import { LibraryItem } from "@/components/library/library-view";

interface DiscoverViewProps {
  items: LibraryItem[];
  initialType?: string;
  initialProvider?: string;
  initialGenre?: string;
  initialRating?: string;
}

export function DiscoverView({
  items,
  initialType = "all",
  initialProvider = "all",
  initialGenre = "all",
  initialRating = "all",
}: DiscoverViewProps) {
  const [selectedType, setSelectedType] = useState(initialType || "all");
  const [selectedProvider, setSelectedProvider] = useState(initialProvider || "all");
  const [selectedGenre, setSelectedGenre] = useState(initialGenre || "all");
  const [selectedRating, setSelectedRating] = useState(initialRating || "all");
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [isFiltering, setIsFiltering] = useState(false);
  const [loadingSectionId, setLoadingSectionId] = useState<string | null>(null);
  const filterTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync if initial props change (e.g. browser back/forward or navigation)
  useEffect(() => {
    if (initialType) setSelectedType(initialType);
    if (initialProvider) setSelectedProvider(initialProvider);
    if (initialGenre) setSelectedGenre(initialGenre);
    if (initialRating) setSelectedRating(initialRating);
  }, [initialType, initialProvider, initialGenre, initialRating]);

  useEffect(() => {
    return () => {
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    };
  }, []);

  const updateFilter = (key: string, value: string) => {
    const currentVal =
      key === "type"
        ? selectedType
        : key === "provider"
        ? selectedProvider
        : key === "genre"
        ? selectedGenre
        : key === "rating"
        ? selectedRating
        : null;

    if (currentVal?.toLowerCase() === value.toLowerCase()) return;

    // Trigger loader IMMEDIATELY (0ms, synchronous in same event frame)
    setIsFiltering(true);
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);

    if (key === "type") setSelectedType(value);
    if (key === "provider") setSelectedProvider(value);
    if (key === "genre") setSelectedGenre(value);
    if (key === "rating") setSelectedRating(value);
    setVisibleCounts({});

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (!value || value === "all" || value === "All") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname
      );
    }

    // Keep active for 280ms so the user sees the polished transition
    filterTimerRef.current = setTimeout(() => {
      setIsFiltering(false);
    }, 280);
  };

  const resetFilters = () => {
    setIsFiltering(true);
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);

    setSelectedType("all");
    setSelectedProvider("all");
    setSelectedGenre("all");
    setSelectedRating("all");
    setVisibleCounts({});
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }

    filterTimerRef.current = setTimeout(() => {
      setIsFiltering(false);
    }, 280);
  };

  const handleSeeMore = (catId: string) => {
    setLoadingSectionId(catId);
    setTimeout(() => {
      setVisibleCounts((prev) => ({
        ...prev,
        [catId]: (prev[catId] ?? 12) + 12,
      }));
      setLoadingSectionId(null);
    }, 280);
  };

  // Instant in-memory client-side filtering (0ms latency, zero network trips)
  const filteredItems = useMemo(() => {
    let list = items;

    if (selectedType && selectedType !== "all") {
      list = list.filter((i) => i.media.mediaType === selectedType);
    }

    if (selectedGenre && selectedGenre !== "all") {
      list = list.filter((i) =>
        i.media.genres?.some((g) => g.toLowerCase().includes(selectedGenre.toLowerCase()))
      );
    }

    if (selectedProvider && selectedProvider !== "all") {
      const pLower = selectedProvider.toLowerCase();
      list = list.filter((item) => {
        const sp = item.media.streamingProviders;
        if (sp) {
          for (const region of Object.values(sp as Record<string, any>)) {
            const providers = [
              ...(region?.flatrate || []),
              ...(region?.ads || []),
              ...(region?.buy || []),
              ...(region?.rent || []),
            ];
            if (
              providers.some(
                (prov: any) =>
                  prov.provider_name?.toLowerCase().includes(pLower) ||
                  (pLower === "prime" && prov.provider_name?.toLowerCase().includes("amazon")) ||
                  (pLower === "apple" && prov.provider_name?.toLowerCase().includes("apple")) ||
                  (pLower === "disney" && prov.provider_name?.toLowerCase().includes("disney")) ||
                  (pLower === "paramount" && prov.provider_name?.toLowerCase().includes("paramount")) ||
                  (pLower === "peacock" && prov.provider_name?.toLowerCase().includes("peacock")) ||
                  (pLower === "hulu" && prov.provider_name?.toLowerCase().includes("hulu")) ||
                  (pLower === "jio" && (prov.provider_name?.toLowerCase().includes("jio") || prov.provider_name?.toLowerCase().includes("hotstar"))) ||
                  (pLower === "zee5" && prov.provider_name?.toLowerCase().includes("zee")) ||
                  (pLower === "sonyliv" && prov.provider_name?.toLowerCase().includes("sony")) ||
                  (pLower === "hoichoi" && prov.provider_name?.toLowerCase().includes("hoichoi")) ||
                  (pLower === "chorki" && prov.provider_name?.toLowerCase().includes("chorki"))
              )
            ) {
              return true;
            }
          }
        }
        // Heuristic fallback for demo and community titles
        const t = item.media.title.toLowerCase();
        if (pLower === "apple" && t.includes("severance")) return true;
        if (
          pLower === "crunchyroll" &&
          (item.media.mediaType === "anime" ||
            t.includes("frieren") ||
            t.includes("jujutsu") ||
            t.includes("titan") ||
            t.includes("chainsaw") ||
            t.includes("demon slayer"))
        )
          return true;
        if (pLower === "netflix" && (t.includes("stranger") || t.includes("squid") || t.includes("queen")))
          return true;
        if (pLower === "max" && (t.includes("dune") || t.includes("succession") || t.includes("game of thrones")))
          return true;
        if (pLower === "hulu" && (t.includes("bear") || t.includes("shogun") || t.includes("only murders")))
          return true;
        if (pLower === "paramount" && (t.includes("yellowstone") || t.includes("top gun") || t.includes("tulsa king")))
          return true;
        if (pLower === "peacock" && (t.includes("oppenheimer") || t.includes("poker face") || t.includes("office")))
          return true;
        if (pLower === "chorki" && (t.includes("myself allen") || t.includes("networker") || t.includes("redrum") || t.includes("guti") || t.includes("pet kata") || t.includes("unoloukik")))
          return true;
        return false;
      });
    }

    if (selectedRating && selectedRating !== "all") {
      list = list.filter(
        (i) => String(i.userRating || "").toLowerCase() === selectedRating.toLowerCase()
      );
    }

    return list;
  }, [items, selectedType, selectedProvider, selectedGenre, selectedRating]);

  // Categorize based on community ratings
  const ratingCategories = [
    {
      id: "masterpiece",
      title: "Masterpieces",
      label: "Masterpiece",
      description: "Highest rated by users on the platform",
      icon: <Crown className="w-4 h-4 text-[#F5C84B]" />,
      pillClass: "bg-[#F5C84B]/15 text-[#F5C84B] border-[#F5C84B]/30",
      dotClass: "bg-[#F5C84B]",
      items: filteredItems.filter((i) => i.userRating === "masterpiece"),
    },
    {
      id: "great",
      title: "Great",
      label: "Great",
      description: "Standout direction and exceptional storytelling",
      icon: <Medal className="w-4 h-4 text-[#10B981]" />,
      pillClass: "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30",
      dotClass: "bg-[#10B981]",
      items: filteredItems.filter((i) => i.userRating === "great"),
    },
    {
      id: "good",
      title: "Good",
      label: "Good",
      description: "Consistently recommended and praised",
      icon: <CheckCircle2 className="w-4 h-4 text-[#3B9EFF]" />,
      pillClass: "bg-[#3B9EFF]/15 text-[#3B9EFF] border-[#3B9EFF]/30",
      dotClass: "bg-[#3B9EFF]",
      items: filteredItems.filter((i) => i.userRating === "good"),
    },
    {
      id: "average",
      title: "Average",
      label: "Average",
      description: "Solid entertainment with mixed community reception",
      icon: <Award className="w-4 h-4 text-[#F59E0B]" />,
      pillClass: "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30",
      dotClass: "bg-[#F59E0B]",
      items: filteredItems.filter((i) => i.userRating === "average"),
    },
    {
      id: "poor",
      title: "Poor",
      label: "Poor",
      description: "Disappointing or dropped titles",
      icon: <Flame className="w-4 h-4 text-[#F43F5E]" />,
      pillClass: "bg-[#F43F5E]/15 text-[#F43F5E] border-[#F43F5E]/30",
      dotClass: "bg-[#F43F5E]",
      items: filteredItems.filter((i) => i.userRating === "poor"),
    },
  ];

  // If unrated items exist and user hasn't filtered to a specific rating:
  const unratedItems = filteredItems.filter((i) => !i.userRating);
  if (unratedItems.length > 0 && (!selectedRating || selectedRating === "all")) {
    ratingCategories.push({
      id: "unrated",
      title: "Community Tracked",
      label: "Unrated",
      description: "Recently added titles pending user rating",
      icon: <Clock className="w-4 h-4 text-[#A8B0BD]" />,
      pillClass: "bg-white/[0.06] text-[#A8B0BD] border-white/[0.1]",
      dotClass: "bg-[#A8B0BD]",
      items: unratedItems,
    });
  }

  const activeCategories = ratingCategories.filter((cat) => cat.items.length > 0);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Filter Bar */}
      <div className="relative z-30">
        <DiscoverFilterBar
          currentType={selectedType}
          currentProvider={selectedProvider}
          currentGenre={selectedGenre}
          currentRating={selectedRating}
          totalResults={filteredItems.length}
          isPending={isFiltering}
          onUpdateFilter={updateFilter}
          onResetFilters={resetFilters}
        />
      </div>

      {/* Results Content Area */}
      <div className="relative min-h-[350px]">
        {/* Floating Loading Beacon Indicator */}
        {isFiltering && (
          <div className="absolute inset-x-0 top-12 sm:top-20 z-40 flex justify-center pointer-events-none animate-in fade-in duration-75">
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#121824]/95 backdrop-blur-xl border border-white/[0.12] shadow-2xl shadow-black/80 text-xs font-semibold text-[#F5F7FA]">
              <div className="relative flex items-center justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3B9EFF] animate-ping absolute opacity-60" />
                <Loader2 className="w-3.5 h-3.5 text-[#3B9EFF] animate-spin relative" />
              </div>
              <span className="tracking-wide">Updating catalog...</span>
            </div>
          </div>
        )}

        {/* Content Container (Gracefully dims during filter update) */}
        <div
          className={`transition-all duration-150 ${
            isFiltering ? "opacity-35 blur-[0.5px] scale-[0.995] pointer-events-none" : "opacity-100"
          }`}
        >
          {activeCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-2xl bg-[#151C27]/40 border border-white/[0.04] mt-2">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#6F7886] mb-3.5">
                <Compass className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-[#F5F7FA]">No titles match your filters</h3>
              <p className="text-xs text-[#A8B0BD] max-w-xs sm:max-w-sm mt-1 leading-relaxed">
                No user-added titles match the selected format, platform, genre, or rating.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-5 px-4 py-2 rounded-xl bg-[#3B9EFF] hover:bg-[#2F8EEA] text-white text-xs font-semibold transition-all shadow-md shadow-[#3B9EFF]/20 cursor-pointer"
              >
                Reset all filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-9 mt-1">
              {activeCategories.map((cat) => {
                const visibleCount = visibleCounts[cat.id] ?? 12;
                const displayedItems = cat.items.slice(0, visibleCount);
                const hasMore = cat.items.length > visibleCount;

                return (
                  <section
                    key={cat.id}
                    style={{ contentVisibility: "auto", containIntrinsicSize: "0 400px" }}
                    className="flex flex-col gap-2.5 sm:gap-3.5"
                  >
                    {/* Rating Category Header */}
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5 sm:pb-3">
                      <div className="flex items-center gap-2 sm:gap-2.5">
                        <div
                          className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center ${cat.pillClass}`}
                        >
                          {cat.icon}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <h2 className="text-sm sm:text-lg font-bold text-[#F5F7FA] tracking-tight">
                              {cat.title}
                            </h2>
                            <span
                              className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border ${cat.pillClass}`}
                            >
                              {cat.items.length}
                            </span>
                          </div>
                          <span className="text-[10px] sm:text-xs text-[#A8B0BD]">
                            {cat.description}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Media Cards Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-4">
                      {displayedItems.map((item) => (
                        <MediaCard
                          key={item.id}
                          media={item.media}
                          status={item.status}
                          userRating={item.userRating || undefined}
                          userEpisodes={item.userEpisodes}
                          currentSeason={item.currentSeason}
                          currentEpisode={item.currentEpisode}
                          seasons={item.seasons}
                          reviewText={item.reviewText}
                          containsSpoilers={item.containsSpoilers}
                          readOnly={true}
                          className="w-full"
                        />
                      ))}
                    </div>

                    {/* See More Button (adds 12 more) */}
                    {hasMore && (
                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          disabled={loadingSectionId === cat.id}
                          onClick={() => handleSeeMore(cat.id)}
                          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#141B26]/90 hover:bg-[#1A2434] border border-white/[0.08] hover:border-[#3B9EFF]/40 text-xs font-semibold text-[#F5F7FA] hover:text-white transition-all shadow-md hover:shadow-[0_0_16px_rgba(59,158,255,0.15)] cursor-pointer group active:scale-95 select-none disabled:opacity-80 disabled:cursor-default"
                        >
                          {loadingSectionId === cat.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 text-[#3B9EFF] animate-spin shrink-0" />
                              <span className="text-[#3B9EFF] font-medium">Loading titles...</span>
                            </>
                          ) : (
                            <>
                              <span>See More</span>
                              <ChevronDown className="w-3.5 h-3.5 text-[#8E97A6] group-hover:text-[#3B9EFF] group-hover:translate-y-0.5 transition-all shrink-0" />
                              <span className="text-[11px] text-[#6F7886] font-normal">
                                ({cat.items.length - visibleCount} more)
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
