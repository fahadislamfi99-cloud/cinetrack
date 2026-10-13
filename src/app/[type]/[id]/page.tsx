import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { ArrowLeft, Star, Plus, Film, Tv, Check, Bookmark, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Footer } from "@/components/navigation/footer";
import { ReviewCard } from "@/components/reviews/review-card";
import { MediaCard } from "@/components/media/media-card";
import { tmdb } from "@/lib/tmdb/client";
import { anilist } from "@/lib/anilist/client";
import {
  normalizeTmdbMovie,
  normalizeTmdbTV,
  normalizeAniListAnime,
  NormalizedMedia,
} from "@/lib/media/normalize";
import { getCurrentUser } from "@/lib/supabase/server";
import { getUserMediaLog } from "@/actions/tracking";
import { MediaDetailsActions, WriteReviewButton } from "./actions-client";
import { DetailsBackButton } from "./back-button";
import { TrailerPlayer, TrailerVideo } from "@/components/media/trailer-player";
import { db } from "@/lib/db";
import { mediaItems, profiles, userMediaLogs, reviewReactions } from "@/lib/db/schema";
import { eq, and, ne, isNotNull, desc, count, inArray, or } from "drizzle-orm";
import { getConsensusRating, RatingCategory } from "@/lib/rating";
import { getImdbGenres } from "@/lib/imdb/client";

interface PageProps {
  params: Promise<{
    type: string;
    id: string;
  }>;
  searchParams?: Promise<{
    from?: string;
    ref?: string;
  }>;
}

/**
 * Cache platform candidate pool for related recommendations at the edge for 5 minutes.
 * Prevents bots and users from executing full-table scans on PostgreSQL on every details page visit.
 */
const getRelatedPlatformPool = unstable_cache(
  async () => {
    const [platformRows, platformLogs] = await Promise.all([
      db
        .select({
          id: mediaItems.id,
          source: mediaItems.source,
          sourceId: mediaItems.sourceId,
          mediaType: mediaItems.mediaType,
          title: mediaItems.title,
          originalTitle: mediaItems.originalTitle,
          posterPath: mediaItems.posterPath,
          backdropPath: mediaItems.backdropPath,
          releaseDate: mediaItems.releaseDate,
          rating: mediaItems.rating,
          totalEpisodes: mediaItems.totalEpisodes,
          runtime: mediaItems.runtime,
          genres: mediaItems.genres,
          synopsis: mediaItems.synopsis,
          streamingProviders: mediaItems.streamingProviders,
        })
        .from(mediaItems)
        .orderBy(desc(mediaItems.createdAt))
        .limit(100)
        .catch((err) => {
          console.error("Related mediaItems query error:", err);
          return [];
        }),
      db
        .select({
          mediaId: userMediaLogs.mediaId,
          rating: userMediaLogs.rating,
        })
        .from(userMediaLogs)
        .where(isNotNull(userMediaLogs.rating))
        .orderBy(desc(userMediaLogs.updatedAt))
        .limit(500)
        .catch((err) => {
          console.error("Related userMediaLogs query error:", err);
          return [];
        }),
    ]);
    return { platformRows, platformLogs };
  },
  ["platform-related-pool-v1"],
  { revalidate: 300, tags: ["discover"] }
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type, id } = await params;
  let media: NormalizedMedia | null = null;

  try {
    if (type === "movie") {
      const raw = await tmdb.getMovieDetails(id);
      media = normalizeTmdbMovie(raw);
    } else if (type === "series" || type === "tv") {
      const raw = await tmdb.getTVDetails(id);
      media = normalizeTmdbTV(raw);
    } else if (type === "anime") {
      const [dbItem] = await db
        .select()
        .from(mediaItems)
        .where(
          or(
            eq(mediaItems.id, id),
            eq(mediaItems.id, `tmdb:tv:${id}`),
            eq(mediaItems.id, `tmdb:movie:${id}`),
            eq(mediaItems.id, `anilist:${id}`),
            eq(mediaItems.sourceId, id)
          )
        )
        .limit(1);

      if (dbItem?.id.startsWith("tmdb:tv:")) {
        const raw = await tmdb.getTVDetails(dbItem.sourceId);
        media = normalizeTmdbTV(raw);
      } else if (dbItem?.id.startsWith("tmdb:movie:")) {
        const raw = await tmdb.getMovieDetails(dbItem.sourceId);
        media = normalizeTmdbMovie(raw);
      } else if (dbItem?.source === "anilist" || dbItem?.id.startsWith("anilist:")) {
        const raw = await anilist.getAnimeDetails(dbItem.sourceId);
        media = normalizeAniListAnime(raw);
      } else {
        try {
          const raw = await anilist.getAnimeDetails(id);
          media = normalizeAniListAnime(raw);
        } catch {
          try {
            const raw = await tmdb.getTVDetails(id);
            media = normalizeTmdbTV(raw);
          } catch {
            const raw = await tmdb.getMovieDetails(id);
            media = normalizeTmdbMovie(raw);
          }
        }
      }
    }
  } catch {
    return {
      title: "Title Not Found",
    };
  }

  if (!media) {
    return {
      title: "Title Not Found",
    };
  }

  const releaseYear = media.releaseDate
    ? new Date(media.releaseDate).getFullYear()
    : null;
  const title = releaseYear ? `${media.title} (${releaseYear})` : media.title;

  const description =
    media.synopsis?.slice(0, 160) ||
    `Discover ratings, reviews, streaming providers, and tracking details for ${media.title} on CineTrack.`;

  const ogImage = media.backdropPath || media.posterPath;
  const canonicalPath = `/${type === "tv" ? "series" : type}/${id}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: `${title} · CineTrack`,
      description,
      url: canonicalPath,
      type: type === "movie" ? "video.movie" : "video.tv_show",
      images: ogImage
        ? [
            {
              url: ogImage,
              width: 1280,
              height: 720,
              alt: media.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · CineTrack`,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function MediaDetailsPage({ params, searchParams }: PageProps) {
  const { type, id } = await params;
  const resolvedSearchParams = (await searchParams) || {};
  const fromUsername = resolvedSearchParams.from || resolvedSearchParams.ref;
  const fallbackUrl = fromUsername
    ? fromUsername === "library"
      ? "/library"
      : `/${fromUsername}`
    : "/";

  let media: NormalizedMedia | null = null;
  let rawDetails: any = null;

  try {
    if (type === "movie") {
      rawDetails = await tmdb.getMovieDetails(id);
      media = normalizeTmdbMovie(rawDetails);
    } else if (type === "series" || type === "tv") {
      rawDetails = await tmdb.getTVDetails(id);
      media = normalizeTmdbTV(rawDetails);
    } else if (type === "anime") {
      const [dbItem] = await db
        .select()
        .from(mediaItems)
        .where(
          or(
            eq(mediaItems.id, id),
            eq(mediaItems.id, `tmdb:tv:${id}`),
            eq(mediaItems.id, `tmdb:movie:${id}`),
            eq(mediaItems.id, `anilist:${id}`),
            eq(mediaItems.sourceId, id)
          )
        )
        .limit(1);

      if (dbItem?.id.startsWith("tmdb:tv:")) {
        rawDetails = await tmdb.getTVDetails(dbItem.sourceId);
        media = normalizeTmdbTV(rawDetails);
      } else if (dbItem?.id.startsWith("tmdb:movie:")) {
        rawDetails = await tmdb.getMovieDetails(dbItem.sourceId);
        media = normalizeTmdbMovie(rawDetails);
      } else if (dbItem?.source === "anilist" || dbItem?.id.startsWith("anilist:")) {
        rawDetails = await anilist.getAnimeDetails(dbItem.sourceId);
        media = normalizeAniListAnime(rawDetails);
      } else {
        try {
          rawDetails = await anilist.getAnimeDetails(id);
          media = normalizeAniListAnime(rawDetails);
        } catch {
          try {
            rawDetails = await tmdb.getTVDetails(id);
            media = normalizeTmdbTV(rawDetails);
          } catch {
            rawDetails = await tmdb.getMovieDetails(id);
            media = normalizeTmdbMovie(rawDetails);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error fetching media details:", err);
    notFound();
  }

  if (!media) notFound();

  // Extract IMDb ID for unrestricted trailer / video gallery fallback
  const imdbId: string | null =
    rawDetails?.imdb_id || rawDetails?.external_ids?.imdb_id || null;

  // Enrich genres with IMDb genres if available
  if (imdbId) {
    try {
      const imdbGenres = await getImdbGenres(imdbId);
      if (imdbGenres.length > 0) {
        const existingLower = new Set(media.genres.map((g) => g.toLowerCase()));
        for (const ig of imdbGenres) {
          if (!existingLower.has(ig.toLowerCase())) {
            media.genres.push(ig);
            existingLower.add(ig.toLowerCase());
          }
        }
      }
    } catch (err) {
      console.error("IMDb genres enrichment error:", err);
    }
  }

  // Extract YouTube trailers & clips
  let trailerVideos: TrailerVideo[] = [];
  if (type === "movie" || type === "series" || type === "tv" || rawDetails?.videos?.results?.length) {
    const rawVideos: any[] = rawDetails?.videos?.results || [];
    const ytVideos = rawVideos.filter(
      (v) => v.site === "YouTube" && Boolean(v.key)
    );

    // Prioritize actual Trailers first, then Teasers, then other clips
    const origLang = rawDetails?.original_language;
    ytVideos.sort((a, b) => {
      const getScore = (v: any) => {
        const nameLower = (v.name || "").toLowerCase();
        const isOfficialTrailer = nameLower.includes("official trailer");
        const hasTrailerInName = nameLower.includes("trailer");
        const isTrailer = v.type === "Trailer" || hasTrailerInName;
        const isTeaser = v.type === "Teaser" || nameLower.includes("teaser");

        let typeScore = 10;
        if (isOfficialTrailer && v.official) typeScore = 1;
        else if (isOfficialTrailer) typeScore = 2;
        else if (isTrailer && v.official && hasTrailerInName) typeScore = 3;
        else if (isTrailer && v.official) typeScore = 4;
        else if (isTrailer) typeScore = 5;
        else if (isTeaser && v.official) typeScore = 6;
        else if (isTeaser) typeScore = 7;

        let langScore = 2;
        if (v.iso_639_1 === "en") langScore = 0;
        else if (origLang && v.iso_639_1 === origLang) langScore = 1;

        return typeScore * 10 + langScore;
      };
      return getScore(a) - getScore(b);
    });

    trailerVideos = ytVideos.map((v) => ({
      key: v.key,
      name: v.name,
      type: v.type,
    }));
  } else if (type === "anime") {
    if (rawDetails?.trailer?.site === "youtube" && rawDetails?.trailer?.id) {
      trailerVideos = [
        {
          key: rawDetails.trailer.id,
          name: "Official Trailer",
          type: "Trailer",
        },
      ];
    }
  }

  const trailerKey = trailerVideos[0]?.key || null;

  // Fetch user tracking log for this title if authenticated
  const currentUser = await getCurrentUser();
  const userLog = currentUser ? await getUserMediaLog(media.id) : null;

  // Fetch contextual curator review if user arrived from a specific profile (?from=username)
  let contextualReview: {
    author: {
      username: string;
      fullName: string;
      avatarUrl?: string;
      isVerified?: boolean;
    };
    rating?: string | null;
    reviewText: string;
    containsSpoilers: boolean;
    updatedAt?: Date | null;
  } | null = null;

  if (fromUsername) {
    const cleanUsername = fromUsername.replace(/^@/, "").toLowerCase().trim();
    try {
      let refProfile: any = null;
      let refLog: any = null;

      if (cleanUsername === "library" || cleanUsername === "me") {
        if (currentUser) {
          const [myProfile] = await db
            .select()
            .from(profiles)
            .where(eq(profiles.id, currentUser.id))
            .limit(1);

          refProfile = myProfile;
          refLog = userLog;
        }
      } else {
        const [foundProfile] = await db
          .select()
          .from(profiles)
          .where(eq(profiles.username, cleanUsername))
          .limit(1);

        refProfile = foundProfile;

        if (refProfile) {
          const [foundLog] = await db
            .select()
            .from(userMediaLogs)
            .where(
              and(
                eq(userMediaLogs.userId, refProfile.id),
                eq(userMediaLogs.mediaId, media.id)
              )
            )
            .limit(1);

          refLog = foundLog;
        }
      }

      if (refProfile && refLog && refLog.reviewText && refLog.reviewText.trim().length > 0) {
        contextualReview = {
          author: {
            username: refProfile.username,
            fullName: refProfile.fullName || refProfile.username,
            avatarUrl: refProfile.avatarUrl || undefined,
            isVerified: true,
          },
          rating: refLog.rating,
          reviewText: refLog.reviewText.trim(),
          containsSpoilers: Boolean(refLog.containsSpoilers),
          updatedAt: refLog.updatedAt,
        };
      } else if (cleanUsername === "elenavance") {
        // Fallback demo curator review if testing demo profile Elena Vance
        if (
          media.title.toLowerCase().includes("dune") ||
          id === "693134"
        ) {
          contextualReview = {
            author: {
              username: "elenavance",
              fullName: "Elena Vance",
              avatarUrl:
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop",
              isVerified: true,
            },
            rating: "masterpiece",
            reviewText:
              "Villeneuve achieves an astonishing sensory convergence of religious fervor and sonic weaponization. Greig Fraser's infrared cinematography during the Giedi Prime gladiatorial sequence creates an almost alien physical presence rarely allowed in high-budget cinema.",
            containsSpoilers: false,
            updatedAt: new Date(),
          };
        } else if (
          media.title.toLowerCase().includes("severance") ||
          id === "97951"
        ) {
          contextualReview = {
            author: {
              username: "elenavance",
              fullName: "Elena Vance",
              avatarUrl:
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop",
              isVerified: true,
            },
            rating: "masterpiece",
            reviewText:
              "The season finale ties the severed floor dialectic directly to corporate religious worship. The execution of the elevator descent sequence is unmatched in contemporary prestige television.",
            containsSpoilers: true,
            updatedAt: new Date(),
          };
        }
      }
    } catch (err) {
      console.error("Contextual review query error:", err);
    }
  }

  // Fetch broader community reviews for lower Reviews section
  let totalReviews = 0;
  let communityReviews: Array<{
    id: string;
    author: {
      name: string;
      avatarUrl?: string;
      username?: string;
      isVerified?: boolean;
    };
    rating?: string | null;
    reviewText: string;
    containsSpoilers?: boolean;
    likesCount: number;
    hasLiked: boolean;
    timeAgo: string;
  }> = [];

  try {
    const rawCommunityLogs = await db
      .select({
        log: userMediaLogs,
        profile: profiles,
      })
      .from(userMediaLogs)
      .innerJoin(profiles, eq(userMediaLogs.userId, profiles.id))
      .where(
        and(
          eq(userMediaLogs.mediaId, media.id),
          isNotNull(userMediaLogs.reviewText)
        )
      )
      .orderBy(desc(userMediaLogs.updatedAt))
      .limit(6);

    const [countRow] = await db
      .select({ value: count() })
      .from(userMediaLogs)
      .where(
        and(
          eq(userMediaLogs.mediaId, media.id),
          isNotNull(userMediaLogs.reviewText)
        )
      );

    totalReviews = Number(countRow?.value || 0);

    const filteredLogs = rawCommunityLogs.filter(
      (r) => r.log.reviewText && r.log.reviewText.trim().length > 0
    );
    const revIds = filteredLogs.map((r) => r.log.id);

    const reactionsMap: Record<string, { count: number; hasLiked: boolean }> = {};
    if (revIds.length > 0) {
      const reactions = await db
        .select({
          reviewId: reviewReactions.reviewId,
          userId: reviewReactions.userId,
        })
        .from(reviewReactions)
        .where(
          and(
            inArray(reviewReactions.reviewId, revIds),
            eq(reviewReactions.type, "like")
          )
        );

      for (const rx of reactions) {
        if (!reactionsMap[rx.reviewId]) {
          reactionsMap[rx.reviewId] = { count: 0, hasLiked: false };
        }
        reactionsMap[rx.reviewId].count++;
        if (currentUser && rx.userId === currentUser.id) {
          reactionsMap[rx.reviewId].hasLiked = true;
        }
      }
    }

    communityReviews = filteredLogs.map((r) => ({
      id: r.log.id,
      author: {
        name: r.profile.fullName || r.profile.username,
        avatarUrl: r.profile.avatarUrl || undefined,
        username: r.profile.username,
        isVerified: true,
      },
      rating: r.log.rating,
      reviewText: r.log.reviewText!,
      containsSpoilers: Boolean(r.log.containsSpoilers),
      likesCount: reactionsMap[r.log.id]?.count || 0,
      hasLiked: reactionsMap[r.log.id]?.hasLiked || false,
      timeAgo: r.log.updatedAt
        ? new Intl.DateTimeFormat("en", {
            month: "short",
            day: "numeric",
          }).format(new Date(r.log.updatedAt))
        : "Recent log",
    }));
  } catch (err) {
    console.error("Community reviews fetch error:", err);
  }

  // Streaming Providers
  const rawProviderResults = (media.streamingProviders as any) || {};
  const countryData =
    rawProviderResults["US"] ||
    rawProviderResults["GB"] ||
    rawProviderResults["CA"] ||
    rawProviderResults["IN"] ||
    rawProviderResults["BD"] ||
    Object.values(rawProviderResults)[0] ||
    null;

  const providers: Array<{ provider_id: number; provider_name: string; logo_path: string }> = [];
  const seenProviderIds = new Set<number>();

  if (countryData) {
    const list = [
      ...(countryData.flatrate || []),
      ...(countryData.ads || []),
      ...(countryData.buy || []),
      ...(countryData.rent || []),
    ];
    list.forEach((p: any) => {
      if (p.provider_id && !seenProviderIds.has(p.provider_id)) {
        seenProviderIds.add(p.provider_id);
        providers.push({
          provider_id: p.provider_id,
          provider_name: p.provider_name,
          logo_path: p.logo_path,
        });
      }
    });
  }

  // Cast members
  const castList =
    type === "anime"
      ? (rawDetails?.characters?.edges || []).slice(0, 6).map((c: any) => ({
          name: c.node.name.full,
          role: c.role,
          image: c.node.image.medium,
        }))
      : (rawDetails?.credits?.cast || []).slice(0, 6).map((c: any) => ({
          name: c.name,
          role: c.character,
          image: c.profile_path
            ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
            : null,
        }));

  // Similar / recommendations (strictly only media added to CineTrack platform with consensus ratings)
  let similarItems: Array<{
    media: NormalizedMedia;
    consensusRating: RatingCategory | null;
  }> = [];

  try {
    const { platformRows, platformLogs } = await getRelatedPlatformPool();
    const candidateRows = platformRows.filter(
      (cMedia) => cMedia.id !== media.id && cMedia.sourceId !== String(id)
    );

    if (candidateRows.length > 0) {
      // Index ratings across platform for candidate media items
      const ratingsMap = new Map<string, string[]>();
      for (const l of platformLogs) {
        if (l.rating) {
          const list = ratingsMap.get(l.mediaId) || [];
          list.push(l.rating);
          ratingsMap.set(l.mediaId, list);
        }
      }

      // External recommendation IDs for relevance boost
      const extSimilarIds = new Set<string>();
      if (type === "anime") {
        (rawDetails?.recommendations?.nodes || []).forEach((r: any) => {
          if (r.mediaRecommendation?.id) {
            extSimilarIds.add(String(r.mediaRecommendation.id));
          }
        });
      } else {
        (rawDetails?.similar?.results || []).forEach((item: any) => {
          if (item.id) {
            extSimilarIds.add(String(item.id));
          }
        });
      }

      const currentGenres = new Set(
        (media.genres || []).map((g: string) => g.toLowerCase())
      );

      const scored = candidateRows.map((cMedia) => {
        let score = 0;
        if (extSimilarIds.has(cMedia.sourceId)) {
          score += 50;
        }
        if (cMedia.mediaType === media.mediaType) {
          score += 20;
        }
        const cGenres = cMedia.genres || [];
        for (const g of cGenres) {
          if (currentGenres.has(g.toLowerCase())) {
            score += 10;
          }
        }

        const consensusRating = getConsensusRating(ratingsMap.get(cMedia.id) || []);

        return {
          score,
          consensusRating,
          media: {
            id: cMedia.id,
            source: cMedia.source as "tmdb" | "anilist",
            sourceId: cMedia.sourceId,
            mediaType: cMedia.mediaType as "movie" | "series" | "anime",
            title: cMedia.title,
            originalTitle: cMedia.originalTitle || undefined,
            posterPath: cMedia.posterPath || null,
            backdropPath: cMedia.backdropPath || null,
            releaseDate: cMedia.releaseDate || undefined,
            year: cMedia.releaseDate
              ? cMedia.releaseDate.substring(0, 4)
              : undefined,
            rating: cMedia.rating ? Number(cMedia.rating) : 0,
            totalEpisodes: cMedia.totalEpisodes || 1,
            runtime: cMedia.runtime || undefined,
            genres: cMedia.genres || [],
            synopsis: cMedia.synopsis || undefined,
            streamingProviders: (cMedia.streamingProviders as any) || {},
          } as NormalizedMedia,
        };
      });

      scored.sort((a, b) => b.score - a.score);
      similarItems = scored.slice(0, 4).map((s) => ({
        media: s.media,
        consensusRating: s.consensusRating,
      }));
    }
  } catch (err) {
    console.error("Related platform media query error:", err);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cinetrack.xyz";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": type === "movie" ? "Movie" : "TVSeries",
    name: media.title,
    description: media.synopsis,
    image: media.backdropPath || media.posterPath,
    datePublished: media.releaseDate,
    genre: media.genres,
    url: `${siteUrl}/${type === "tv" ? "series" : type}/${id}`,
  };

  return (
    <div className="flex-1 flex flex-col w-full min-h-screen bg-[#0F141D]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AppHeader />

      <main className="flex-1 flex flex-col w-full pt-16 pb-24 md:pb-12">
        {/* Backdrop & Header Hero */}
        <div className="relative w-full overflow-hidden bg-[#151C27] border-b border-white/[0.06]">
          {/* Back Button (Desktop, Tablet & Mobile) */}
          <div className="absolute top-3.5 left-4 sm:top-5 sm:left-6 lg:left-8 z-20">
            <DetailsBackButton fallbackUrl={fallbackUrl} />
          </div>

          {/* Backdrop Image */}
          <div
            className="w-full h-80 sm:h-96 bg-cover bg-center relative"
            style={
              media.backdropPath || media.posterPath
                ? {
                    backgroundImage: `url('${
                      media.backdropPath || media.posterPath
                    }')`,
                  }
                : undefined
            }
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F141D] via-[#0F141D]/70 to-black/40" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0F141D]/90 via-transparent to-[#0F141D]/40" />
          </div>

          {/* Overlapping Poster & Information */}
          <div className="max-w-5xl mx-auto px-4 -mt-32 sm:-mt-40 relative z-10 pb-6 flex flex-col gap-4">
            <div className="flex items-end gap-3.5 sm:gap-5">
              {/* Poster 2:3 */}
              <div className="w-28 sm:w-40 aspect-[2/3] shrink-0 rounded-xl overflow-hidden shadow-2xl bg-[#1D2734] border border-white/[0.1] relative">
                {media.posterPath ? (
                  <img
                    src={media.posterPath}
                    alt={media.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-xs text-[#6F7886] p-2 text-center bg-[#161E2C]">
                    <Film className="w-8 h-8 text-white/10 mb-1" />
                    <span>No Poster</span>
                  </div>
                )}
                <span className="absolute top-1.5 left-1.5 bg-[#0F141D]/90 backdrop-blur-sm text-[#F5C84B] px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide flex items-center gap-1 border border-white/[0.08] z-10">
                  <Star className="w-3 h-3 fill-[#F5C84B]" />
                  <span>{media.rating ? media.rating.toFixed(1) : "N/A"}</span>
                </span>
              </div>

              {/* Title & Metadata */}
              <div className="flex flex-col justify-end min-w-0 pb-1">
                <div className="flex items-center gap-1.5 flex-wrap mb-1 text-xs">
                  <span className="bg-[#3B9EFF]/20 text-[#3B9EFF] px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]">
                    {media.mediaType}
                  </span>
                  <span className="text-[#6F7886] font-medium">{media.year || "2024"}</span>
                  <span className="text-[#4B5563]">•</span>
                  {media.runtime && (
                    <>
                      <span className="text-[#6F7886] font-medium">
                        {Math.floor(media.runtime / 60)}h {media.runtime % 60}m
                      </span>
                      <span className="text-[#4B5563]">•</span>
                    </>
                  )}
                  {media.totalEpisodes > 1 && (
                    <>
                      <span className="text-[#6F7886] font-medium">
                        {media.totalEpisodes} Episodes
                      </span>
                      <span className="text-[#4B5563]">•</span>
                    </>
                  )}
                  {media.genres && media.genres.length > 0 && (
                    <span className="text-[#A8B0BD] font-medium">
                      {media.genres.join(", ")}
                    </span>
                  )}
                </div>

                <h1 className="font-extrabold text-xl sm:text-3xl text-[#F5F7FA] tracking-tight">
                  {media.title}
                </h1>
                {media.originalTitle && media.originalTitle !== media.title && (
                  <p className="text-xs text-[#A8B0BD] italic mt-0.5">
                    {media.originalTitle}
                  </p>
                )}
              </div>
            </div>

            {/* Client Interactive Action Buttons (Add to Library / Rate / Trailer) */}
            <MediaDetailsActions
              media={media}
              initialLog={userLog}
              trailerKey={trailerKey}
              trailerVideos={trailerVideos}
              imdbId={imdbId}
            />
          </div>
        </div>

        {/* Content Body */}
        <div className="max-w-5xl mx-auto px-4 w-full py-6 flex flex-col gap-6">
          {/* Contextual Curator Review (Only shown when navigated from a user profile with a review) */}
          {contextualReview && (
            <section
              aria-label="Curator Review"
              className="flex flex-col gap-2.5 rounded-2xl bg-gradient-to-b from-[#182333]/90 to-[#121822]/90 border border-[#3B9EFF]/30 p-3.5 sm:p-5 shadow-lg shadow-black/40 relative overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300"
            >
              {/* Subtle top glow highlight */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#3B9EFF]/50 to-transparent" />

              {/* Context Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3B9EFF] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3B9EFF]" />
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-[#F5F7FA] tracking-wide">
                    Note from{" "}
                    <Link
                      href={`/${contextualReview.author.username}`}
                      className="text-[#3B9EFF] hover:underline font-bold"
                    >
                      @{contextualReview.author.username}
                    </Link>
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-[#3B9EFF]/15 text-[#3B9EFF] border border-[#3B9EFF]/30 hidden sm:inline-block">
                    Curator Dispatch
                  </span>
                </div>

                <Link
                  href={`/${contextualReview.author.username}`}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#A8B0BD] hover:text-[#F5F7FA] transition-colors group cursor-pointer"
                >
                  <span>View @{contextualReview.author.username}&apos;s Profile</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>

              {/* Review Card */}
              <ReviewCard
                author={{
                  name: contextualReview.author.fullName || contextualReview.author.username,
                  avatarUrl: contextualReview.author.avatarUrl,
                  username: contextualReview.author.username,
                  isVerified: contextualReview.author.isVerified,
                }}
                mediaTitle={media.title}
                rating={contextualReview.rating}
                containsSpoilers={contextualReview.containsSpoilers}
                reviewText={contextualReview.reviewText}
                likesCount={0}
                commentsCount={0}
                timeAgo={
                  contextualReview.updatedAt
                    ? new Intl.DateTimeFormat("en", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(contextualReview.updatedAt))
                    : "Recently logged"
                }
              />
            </section>
          )}

          {/* Where to Watch (OTT Providers) */}
          <section className="p-4 rounded-xl bg-[#151C27] border border-white/[0.06] flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-[#F5F7FA]">Where to Watch</h3>
                {providers.length > 0 && (
                  <span className="text-[11px] font-semibold text-[#6F7886] bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md">
                    {providers.length}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[#A8B0BD] uppercase tracking-wider font-semibold">
                Streaming Availability
              </span>
            </div>

            {providers.length > 0 ? (
              <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 md:flex-wrap md:overflow-visible">
                {providers.map((p: any) => (
                  <div
                    key={p.provider_id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1D2734] hover:bg-[#222E3D] border border-white/[0.06] hover:border-white/[0.12] transition-colors shrink-0 select-none"
                  >
                    {p.logo_path && (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                        alt={p.provider_name}
                        className="w-6 h-6 rounded-md object-cover ring-1 ring-white/10 shrink-0"
                      />
                    )}
                    <span className="text-xs font-medium text-[#F5F7FA]">
                      {p.provider_name}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#6F7886]">
                Streaming information currently unavailable for this region. Check back soon.
              </p>
            )}
          </section>

          {/* Synopsis */}
          <section className="flex flex-col gap-2">
            <h3 className="font-bold text-sm text-[#A8B0BD] uppercase tracking-wider">
              Overview
            </h3>
            <p className="text-sm text-[#dee2ef] leading-relaxed font-sans">
              {media.synopsis || "No description provided."}
            </p>
          </section>

          {/* Official Trailer & Video Clips */}
          {(trailerVideos.length > 0 || imdbId) && (
            <section id="official-trailer" className="flex flex-col gap-3">
              <h3 className="font-bold text-sm text-[#A8B0BD] uppercase tracking-wider">
                Official Trailer
              </h3>
              <TrailerPlayer
                title={media.title}
                videos={trailerVideos}
                imdbId={imdbId}
              />
            </section>
          )}

          {/* Cast */}
          {castList.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="font-bold text-sm text-[#A8B0BD] uppercase tracking-wider">
                Principal Cast
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {castList.map((actor: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center text-center p-3 rounded-xl bg-[#151C27] border border-white/[0.04]"
                  >
                    {actor.image ? (
                      <img
                        src={actor.image}
                        alt={actor.name}
                        className="w-14 h-14 rounded-full object-cover shadow-sm ring-1 ring-white/10 mb-2"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[#1D2734] flex items-center justify-center text-xs font-bold text-[#6F7886] mb-2">
                        {actor.name.slice(0, 2)}
                      </div>
                    )}
                    <span className="font-semibold text-xs text-[#F5F7FA] truncate w-full">
                      {actor.name}
                    </span>
                    <span className="text-[10px] text-[#A8B0BD] truncate w-full mt-0.5">
                      {actor.role}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Reviews */}
          {communityReviews.length > 0 && (
            <section className="flex flex-col gap-3 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-[#F5F7FA]">Reviews</h3>
                  <span className="text-xs font-semibold text-[#A8B0BD] bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 rounded-full">
                    {totalReviews}
                  </span>
                </div>
                <WriteReviewButton media={media} initialLog={userLog} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {communityReviews.map((rev) => (
                  <ReviewCard
                    key={rev.id}
                    reviewId={rev.id}
                    author={rev.author}
                    mediaTitle={media.title}
                    mediaHref={`/${type}/${id}`}
                    rating={rev.rating}
                    reviewText={rev.reviewText}
                    containsSpoilers={rev.containsSpoilers}
                    likesCount={rev.likesCount}
                    initialLiked={rev.hasLiked}
                    commentsCount={0}
                    timeAgo={rev.timeAgo}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Related Titles */}
          {similarItems.length > 0 && (
            <section className="flex flex-col gap-3 mt-2">
              <h3 className="font-bold text-sm sm:text-base text-[#F5F7FA]">
                If you liked {media.title}, you might also like...
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {similarItems.map(({ media: itemMedia, consensusRating }) => (
                  <MediaCard
                    key={itemMedia.id}
                    media={itemMedia}
                    userRating={consensusRating}
                    className="w-full"
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
