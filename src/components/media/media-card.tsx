"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Plus, Check, Film, Loader2, Pencil } from "lucide-react";
import { NormalizedMedia } from "@/lib/media/normalize";
import { QuickAddModal } from "../quick-add/quick-add-modal";
import { RatingCategory, getRatingConfig } from "@/lib/rating";
import { upsertMediaLog } from "@/actions/tracking";
import { createClient } from "@/lib/supabase/client";
import { SeasonInfo } from "@/app/api/tv/[id]/seasons/route";
import {
  calculateSeriesProgress,
  getNextEpisodePosition,
  getSeasonsData,
  getSeriesMetadata,
} from "@/lib/media/series-progress";

export interface MediaCardProps {
  media: NormalizedMedia;
  status?: "watching" | "completed" | "plan_to_watch" | "on_hold" | "dropped";
  userRating?: RatingCategory | string | number | null;
  userEpisodes?: number;
  seasonNumber?: number;
  currentSeason?: number;
  currentEpisode?: number;
  seasons?: SeasonInfo[];
  reviewText?: string | null;
  containsSpoilers?: boolean;
  fromUsername?: string;
  badgeLabel?: string;
  tagLabel?: string;
  subMeta?: string;
  className?: string;
  readOnly?: boolean;
  onUpdate?: () => void;
}

export function MediaCard({
  media,
  status,
  userRating,
  userEpisodes,
  seasonNumber,
  currentSeason,
  currentEpisode,
  seasons,
  reviewText,
  containsSpoilers,
  fromUsername,
  badgeLabel,
  tagLabel,
  subMeta,
  className,
  readOnly = false,
  onUpdate,
}: MediaCardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Local state for optimistic instant card updates
  const [localStatus, setLocalStatus] = useState<string | undefined>(status);
  const [localSeason, setLocalSeason] = useState<number>(
    currentSeason ?? seasonNumber ?? 1
  );
  const [localEpisode, setLocalEpisode] = useState<number>(
    currentEpisode ?? userEpisodes ?? 1
  );
  const [seasonsData, setSeasonsData] = useState<SeasonInfo[]>(seasons || []);

  // Sync state if props change from server or parent
  useEffect(() => {
    setLocalStatus(status);
  }, [status]);

  useEffect(() => {
    if (currentSeason !== undefined) setLocalSeason(currentSeason);
    else if (seasonNumber !== undefined) setLocalSeason(seasonNumber);
  }, [currentSeason, seasonNumber]);

  useEffect(() => {
    if (currentEpisode !== undefined) setLocalEpisode(currentEpisode);
    else if (userEpisodes !== undefined) setLocalEpisode(userEpisodes);
  }, [currentEpisode, userEpisodes]);

  useEffect(() => {
    if (seasons && seasons.length > 0) {
      setSeasonsData(seasons);
    }
  }, [seasons]);

  // Extra metadata for series (e.g. end year and ongoing/ended status)
  const [seriesEndYear, setSeriesEndYear] = useState<string | undefined>(
    media.endYear
  );
  const [seriesStatus, setSeriesStatus] = useState<string | undefined>(
    media.status
  );

  // Whether this card represents an active watching series/anime
  const isWatchingSeries =
    localStatus === "watching" && media.mediaType !== "movie";

  // Dynamically fetch season breakdown and series metadata (years/status)
  useEffect(() => {
    if (
      (isWatchingSeries || isQuickAddOpen) &&
      (media.mediaType === "series" || media.mediaType === "anime")
    ) {
      let cancelled = false;
      getSeriesMetadata(media.sourceId, media.source, media.totalEpisodes).then(
        (details) => {
          if (!cancelled && details) {
            if (
              details.seasons &&
              details.seasons.length > 0 &&
              seasonsData.length === 0
            ) {
              setSeasonsData(details.seasons);
            }
            if (details.endYear) setSeriesEndYear(details.endYear);
            if (details.status) setSeriesStatus(details.status);
          }
        }
      );
      return () => {
        cancelled = true;
      };
    }
  }, [
    isWatchingSeries,
    isQuickAddOpen,
    media.sourceId,
    media.source,
    media.totalEpisodes,
    media.mediaType,
    seasonsData.length,
  ]);

  const detailUrl = `/${media.mediaType}/${media.source === "anilist" ? media.sourceId : media.sourceId
    }${fromUsername ? `?from=${fromUsername}` : ""}`;

  // Overall series completion progress across all seasons
  const progressInfo = calculateSeriesProgress(
    seasonsData,
    localSeason,
    localEpisode,
    localStatus === "completed"
  );

  // Format label
  const formatText =
    media.mediaType === "movie"
      ? "Film"
      : media.mediaType === "anime"
        ? "Anime"
        : "TV Series";

  // Year display: "2008–2013" if series has ended with end year, "2022–" if ongoing, "2024" if single-year or film
  const getYearDisplay = () => {
    if (media.mediaType === "movie") {
      return media.year || "2024";
    }

    const start = media.year;
    if (!start) return "2024";

    const end = seriesEndYear || media.endYear;
    const isEnded =
      seriesStatus === "Ended" ||
      seriesStatus === "Canceled" ||
      (!seriesStatus && end && end !== start);

    // If both start and end year exist and are different (e.g. Breaking Bad 2008–2013)
    if (end && start !== end) {
      return `${start}–${end}`;
    }

    // If it's a finished single-year series (e.g. Shōgun 2024)
    if (isEnded && end && start === end) {
      return start;
    }

    // If ongoing series (e.g. FROM 2022– or Severance 2022–)
    if (seriesStatus === "Returning Series" || !isEnded) {
      return `${start}–`;
    }

    return start;
  };
  const yearDisplay = getYearDisplay();

  // Extra metadata (Creator / Studio / Network / Genre)
  const getExtraMeta = () => {
    if (subMeta) return subMeta;
    const titleLower = media.title.toLowerCase();
    if (titleLower.includes("spider-man")) return "Marvel";
    if (titleLower.includes("severance")) return "Apple TV+";
    if (titleLower.includes("dune")) return "Denis Villeneuve";
    if (titleLower.includes("oppenheimer") || titleLower.includes("interstellar"))
      return "Christopher Nolan";

    const usProviders = media.streamingProviders?.US;
    const topProvider =
      usProviders?.flatrate?.[0] ||
      usProviders?.ads?.[0] ||
      usProviders?.buy?.[0] ||
      usProviders?.rent?.[0];
    if (topProvider?.provider_name) {
      return topProvider.provider_name;
    }

    return null;
  };
  const extraMetadata = getExtraMeta();

  // Bottom left critic tag badge
  const getBottomTag = () => {
    if (tagLabel) {
      return {
        label: tagLabel.toUpperCase(),
        className: "bg-[#8B5CF6]/10 border border-[#8B5CF6]/25 text-[#A78BFA]",
        dotColor: "bg-[#8B5CF6]",
      };
    }

    const rConfig = getRatingConfig(userRating);
    if (rConfig) {
      if (rConfig.id === "masterpiece") {
        return {
          label: "MASTERPIECE",
          className: "bg-[#F5C84B]/10 border border-[#F5C84B]/30 text-[#F5C84B]",
          isStar: true,
        };
      }
      if (rConfig.id === "great") {
        return {
          label: "GREAT",
          className: "bg-[#10B981]/10 border border-[#10B981]/25 text-[#34D399]",
          dotColor: "bg-[#10B981]",
        };
      }
      if (rConfig.id === "good") {
        return {
          label: "GOOD",
          className: "bg-[#3B9EFF]/10 border border-[#3B9EFF]/25 text-[#60A5FA]",
          dotColor: "bg-[#3B9EFF]",
        };
      }
      if (rConfig.id === "average") {
        return {
          label: "AVERAGE",
          className: "bg-[#F59E0B]/10 border border-[#F59E0B]/25 text-[#FBBF24]",
          dotColor: "bg-[#F59E0B]",
        };
      }
      return {
        label: "POOR",
        className: "bg-[#F43F5E]/10 border border-[#F43F5E]/25 text-[#FB7185]",
        dotColor: "bg-[#F43F5E]",
      };
    }

    if (media.genres && media.genres.length > 0) {
      return {
        label: media.genres[0].toUpperCase(),
        className: "bg-white/[0.04] border border-white/[0.08] text-[#94A3B8]",
      };
    }

    return null;
  };
  const bottomTag = getBottomTag();

  // Bottom right genre text
  const getBottomRightText = () => {
    if (media.genres && media.genres.length > 1) {
      return media.genres.slice(0, 2).join(" • ");
    }
    if (media.genres && media.genres.length === 1) {
      return media.genres[0];
    }
    return formatText;
  };
  const bottomRightText = getBottomRightText();

  // Fast episode progression (+1 EP) with season detection & double-click protection
  const requireAuthAndAct = async (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(currentUrl)}`);
      return;
    }
    action();
  };

  const handleAdvanceEpisode = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isAdvancing) return;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(currentUrl)}`);
      return;
    }

    setIsAdvancing(true);

    // Compute next season, episode, and series completion status
    const nextPos = getNextEpisodePosition(
      seasonsData,
      localSeason,
      localEpisode
    );
    const newStatus = nextPos.isCompleted ? "completed" : "watching";

    // Optimistic UI updates
    const prevSeason = localSeason;
    const prevEpisode = localEpisode;
    const prevStatus = localStatus;

    setLocalSeason(nextPos.nextSeason);
    setLocalEpisode(nextPos.nextEpisode);
    setLocalStatus(newStatus);

    try {
      const nextProgress = calculateSeriesProgress(
        seasonsData,
        nextPos.nextSeason,
        nextPos.nextEpisode,
        nextPos.isCompleted
      );

      const res = await upsertMediaLog({
        media,
        status: newStatus,
        episodesWatched: nextProgress.watched,
        currentSeason: nextPos.nextSeason,
        currentEpisode: nextPos.nextEpisode,
        rating: userRating as any,
      });

      if (res && "error" in res && res.error) {
        throw new Error(res.error);
      }

      startTransition(() => {
        router.refresh();
      });
      onUpdate?.();
    } catch (err) {
      console.error("Failed to advance episode:", err);
      // Rollback optimistic update on error
      setLocalSeason(prevSeason);
      setLocalEpisode(prevEpisode);
      setLocalStatus(prevStatus);
    } finally {
      setIsAdvancing(false);
    }
  };

  // Top-left status badge (Frosted Glass Capsule)
  const renderTopLeftBadge = () => {
    if (localStatus === "completed") {
      const label =
        badgeLabel ||
        (media.title.toLowerCase().includes("spider") ? "WATCHED" : "COMPLETED");
      return (
        <div className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-emerald-950/70 backdrop-blur-md border border-emerald-500/30 text-emerald-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shadow-lg flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap">
          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34D399] shrink-0" />
          <span>{label}</span>
        </div>
      );
    }

    if (localStatus === "watching") {
      return (
        <div className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-blue-950/70 backdrop-blur-md border border-blue-500/35 text-blue-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide shadow-lg flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap">
          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_#60A5FA] animate-pulse shrink-0" />
          <span>{badgeLabel || "WATCHING"}</span>
        </div>
      );
    }

    if (localStatus === "plan_to_watch") {
      return (
        <div className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-purple-950/70 backdrop-blur-md border border-purple-500/30 text-purple-300 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shadow-lg flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap">
          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-purple-400 shrink-0" />
          <span>{badgeLabel || "WANT TO WATCH"}</span>
        </div>
      );
    }

    if (localStatus === "on_hold") {
      return (
        <div className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-amber-950/70 backdrop-blur-md border border-amber-500/30 text-amber-300 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shadow-lg flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap">
          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-amber-400 shrink-0" />
          <span>{badgeLabel || "ON HOLD"}</span>
        </div>
      );
    }

    if (localStatus === "dropped") {
      return (
        <div className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-rose-950/70 backdrop-blur-md border border-rose-500/30 text-rose-300 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shadow-lg flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap">
          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-rose-400 shrink-0" />
          <span>{badgeLabel || "DROPPED"}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div
        className={`${className || "w-[170px] sm:w-[190px] lg:w-[210px] shrink-0 snap-start"
          } group relative flex flex-col rounded-[14px] bg-[#121824] border border-white/[0.08] hover:border-[#3B9EFF]/40 hover:shadow-[0_12px_32px_rgba(0,0,0,0.65)] hover:-translate-y-1 transition-all duration-300 ease-out overflow-hidden`}
      >
        {/* Poster Container (2:3 Aspect Ratio) */}
        <div className="relative w-full aspect-[2/3] overflow-hidden bg-[#161E2C]">
          <Link href={detailUrl} className="block w-full h-full relative">
            {media.posterPath ? (
              <img
                src={media.posterPath}
                alt={media.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.classList.remove("hidden");
                }}
              />
            ) : null}
            <div
              className={`w-full h-full flex flex-col items-center justify-center text-xs text-[#6F7886] p-2 text-center bg-[#161E2C] ${media.posterPath ? "hidden" : "flex"
                }`}
            >
              <Film className="w-8 h-8 text-white/10 mb-2" />
              <span>No Poster</span>
            </div>
          </Link>

          {/* Smooth Bottom Vignette transitioning poster into info area */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#121824] via-[#121824]/40 to-transparent pointer-events-none" />

          {/* Top-Left Status Pill Badge */}
          {localStatus && (
            <div className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 z-10 pointer-events-none">
              {renderTopLeftBadge()}
            </div>
          )}

          {/* Top-Right Pill: For Watching Series, display Current Watch Position (S03 · E09); otherwise Star Rating Badge */}
          {isWatchingSeries ? (
            <div
              className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-[#0B0F17]/85 backdrop-blur-md border border-white/10 text-[9px] sm:text-[11px] font-semibold text-[#E2E8F0] tracking-wider shadow-lg pointer-events-none flex items-center gap-1 font-mono z-10 select-none"
              title={`Current Position: Season ${localSeason}, Episode ${localEpisode}`}
            >
              <span>{`S${String(localSeason).padStart(2, "0")} · E${String(
                localEpisode
              ).padStart(2, "0")}`}</span>
            </div>
          ) : (
            <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-[#0B0F17]/80 backdrop-blur-md border border-white/10 text-[10px] sm:text-[11px] font-bold text-[#F5F7FA] flex items-center gap-0.5 sm:gap-1 shadow-lg pointer-events-none z-10">
              <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-[#F5C84B] text-[#F5C84B]" />
              <span>{media.rating ? media.rating.toFixed(1) : "N/A"}</span>
            </div>
          )}

          {/* Hover Quick Action Pill Overlay - Desktop only (hidden if readOnly or on mobile/tablet) */}
          {!readOnly && (
            <div className="hidden lg:flex absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none items-center justify-center p-3 z-10">
              <button
                type="button"
                onClick={(e) => requireAuthAndAct(e, () => setIsQuickAddOpen(true))}
                className={`pointer-events-auto px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur-xl text-white text-xs font-semibold shadow-2xl transition-all duration-200 active:scale-95 flex items-center gap-2 cursor-pointer ${localStatus
                  ? "border border-white/20 hover:border-[#22C55E] hover:shadow-[0_0_16px_rgba(34,197,94,0.35)]"
                  : "border border-white/20 hover:border-[#3B9EFF] hover:shadow-[0_0_16px_rgba(59,158,255,0.35)]"
                  }`}
              >
                {localStatus ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>Edit Log</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-[#3B9EFF]" />
                    <span>Add to Library</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Mobile & Tablet Quick Edit Button at Bottom-Left of Poster */}
          {!readOnly && localStatus && (
            <button
              type="button"
              onClick={(e) => requireAuthAndAct(e, () => setIsQuickAddOpen(true))}
              className="lg:hidden absolute bottom-2 left-2 w-8 h-8 rounded-full bg-[#121824]/90 hover:bg-[#1A2434] active:scale-90 backdrop-blur-md border border-white/20 text-[#A8B0BD] hover:text-white flex items-center justify-center shadow-lg z-20 cursor-pointer transition-all duration-150"
              title="Edit Log"
              aria-label="Edit Log"
            >
              <Pencil className="w-3.5 h-3.5 stroke-[2.2]" />
            </button>
          )}

          {/* Quick Action Button in bottom-right corner of poster */}
          {!readOnly && (isWatchingSeries ? (
            <button
              type="button"
              onClick={handleAdvanceEpisode}
              disabled={isAdvancing}
              className="group/plus absolute bottom-2 right-2 w-8 h-8 rounded-full bg-[#121824]/90 hover:bg-[#3B9EFF] border border-white/20 hover:border-[#3B9EFF] text-[#3B9EFF] hover:text-white flex items-center justify-center shadow-lg hover:shadow-[0_0_16px_rgba(59,158,255,0.55)] hover:scale-110 active:scale-95 z-20 cursor-pointer transition-all duration-200 ease-out backdrop-blur-md disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-[#121824]/90 disabled:hover:text-[#3B9EFF]"
              title={`Advance to ${getNextEpisodePosition(seasonsData, localSeason, localEpisode).isCompleted
                ? "Completed"
                : `S${String(
                  getNextEpisodePosition(seasonsData, localSeason, localEpisode).nextSeason
                ).padStart(2, "0")} · E${String(
                  getNextEpisodePosition(seasonsData, localSeason, localEpisode).nextEpisode
                ).padStart(2, "0")}`
                }`}
              aria-label="Advance watch progress by 1 episode"
            >
              {isAdvancing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-current" />
              ) : (
                <Plus className="w-3.5 h-3.5 stroke-[2.5] transition-transform duration-200 group-hover/plus:rotate-90" />
              )}
            </button>
          ) : !localStatus ? (
            <button
              type="button"
              onClick={(e) => requireAuthAndAct(e, () => setIsQuickAddOpen(true))}
              className="lg:hidden absolute bottom-2 right-2 w-8 h-8 rounded-full bg-[#121824]/90 hover:bg-[#3B9EFF] active:scale-90 backdrop-blur-md border border-white/15 text-[#3B9EFF] hover:text-white flex items-center justify-center shadow-lg z-20 cursor-pointer transition-all duration-150"
              title="Add to Library"
              aria-label="Add to Library"
            >
              <Plus className="w-3.5 h-3.5 text-[#3B9EFF]" />
            </button>
          ) : null)}
        </div>

        {/* Overall Series Progress Bar underneath poster for active Watching items */}
        {isWatchingSeries && (
          <div
            className="w-full h-[3px] bg-white/[0.06] relative overflow-hidden shrink-0"
            role="progressbar"
            aria-valuenow={Math.round(progressInfo.percentage)}
            aria-valuemin={0}
            aria-valuemax={100}
            title={`Overall Progress: ${progressInfo.watched}/${progressInfo.total} episodes watched (${Math.round(progressInfo.percentage)}%)`}
          >
            <div
              className="h-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8] shadow-[0_0_6px_rgba(56,189,248,0.4)] transition-all duration-300 ease-out"
              style={{ width: `${progressInfo.percentage}%` }}
            />
          </div>
        )}

        {/* Card Content Section */}
        <div className="p-2.5 sm:p-3.5 flex flex-col justify-between flex-1 relative z-10 bg-[#121824]">
          <div>
            {/* Title */}
            <Link
              href={detailUrl}
              className="font-bold text-[13px] sm:text-[14px] lg:text-[15px] text-[#F5F7FA] group-hover:text-[#3B9EFF] transition-colors line-clamp-2 block leading-snug tracking-tight"
              title={media.title}
            >
              {media.title}
            </Link>

            {/* Subtitle / Metadata (Never wrap year like 2022-2026 into two lines) */}
            <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs text-[#8B95A5] mt-1 font-medium whitespace-nowrap overflow-hidden">
              <span className="text-[#A8B0BD] shrink-0 whitespace-nowrap">{yearDisplay}</span>
              <span className="text-white/20 shrink-0">•</span>
              <span className="shrink-0 whitespace-nowrap">{formatText}</span>
              {extraMetadata && (
                <>
                  <span className="text-white/20 shrink-0">•</span>
                  <span className="truncate text-[#8B95A5]">{extraMetadata}</span>
                </>
              )}
            </div>
          </div>

          {/* Bottom Row: Tag Badge & Right Action/Genre */}
          <div className="mt-2 sm:mt-2.5 pt-1.5 sm:pt-2 border-t border-white/[0.04] flex items-center justify-between gap-1 sm:gap-2 text-xs">
            {bottomTag ? (
              <button
                type="button"
                onClick={(e) => requireAuthAndAct(e, () => setIsQuickAddOpen(true))}
                className={`inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all hover:opacity-80 active:scale-95 cursor-pointer shrink-0 whitespace-nowrap ${bottomTag.className}`}
                title="Click to rate or edit"
              >
                {bottomTag.isStar && <Star className="w-2.5 h-2.5 fill-current shrink-0" />}
                {bottomTag.dotColor && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${bottomTag.dotColor}`} />
                )}
                <span>{bottomTag.label}</span>
              </button>
            ) : (
              <span />
            )}

            <span className="text-[10px] sm:text-[11px] text-[#6F7886] font-medium tracking-wide truncate max-w-[45%] text-right">
              {bottomRightText}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Add / Log Modal */}
      <QuickAddModal
        media={media}
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        initialLog={{
          status: localStatus as any,
          rating: userRating,
          episodesWatched: progressInfo.watched,
          currentSeason: localSeason,
          currentEpisode: localEpisode,
          reviewText: reviewText,
          containsSpoilers: containsSpoilers,
        }}
        onSuccess={onUpdate}
      />
    </>
  );
}
