import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { AppHeader } from "@/components/navigation/app-header";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Footer } from "@/components/navigation/footer";
import { DiscoverView } from "@/components/discover/discover-view";
import { LibraryItem } from "@/components/library/library-view";
import { getCurrentUser } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { userMediaLogs, mediaItems, profiles } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { parseRating, getConsensusRating } from "@/lib/rating";
import { demoLibraryItems } from "@/lib/demo-library";

export const metadata: Metadata = {
  title: "Discover Movies, Series & Anime",
  description:
    "Explore top-rated movies, trending television series, and popular anime with streaming availability and community consensus ratings.",
  alternates: {
    canonical: "/discover",
  },
  openGraph: {
    title: "Discover Movies, Series & Anime · CineTrack",
    description:
      "Explore top-rated movies, trending television series, and popular anime with streaming availability and community consensus ratings.",
    url: "/discover",
  },
};

interface DiscoverPageProps {
  searchParams: Promise<{
    type?: string;
    genre?: string;
    provider?: string;
    rating?: string;
  }>;
}

function compactStreamingProviders(raw: any) {
  if (!raw || typeof raw !== "object") return {};
  const usFlat = Array.isArray(raw.US?.flatrate)
    ? raw.US.flatrate.map((p: any) => ({
        provider_name: p.provider_name,
        logo_path: p.logo_path,
      }))
    : [];
  const allMap = new Map<string, { provider_name: string; logo_path?: string }>();
  for (const region of Object.values(raw as Record<string, any>)) {
    if (!region || typeof region !== "object") continue;
    for (const list of [(region as any).flatrate, (region as any).ads, (region as any).buy, (region as any).rent]) {
      if (Array.isArray(list)) {
        for (const p of list) {
          if (p?.provider_name && !allMap.has(p.provider_name.toLowerCase())) {
            allMap.set(p.provider_name.toLowerCase(), {
              provider_name: p.provider_name,
              logo_path: p.logo_path,
            });
          }
        }
      }
    }
  }
  return {
    US: { flatrate: usFlat },
    ALL: { flatrate: Array.from(allMap.values()) },
  };
}

/**
 * Cache platform discover catalog at the edge for 5 minutes.
 * Prevents thousands of visitors and crawlers from repeatedly hammering PostgreSQL.
 */
const getDiscoverCatalog = unstable_cache(
  async () => {
    const [rawMedia, allDbLogs] = await Promise.all([
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
          streamingProviders: mediaItems.streamingProviders,
        })
        .from(mediaItems)
        .orderBy(desc(mediaItems.createdAt))
        .catch((err) => {
          console.error("Discover mediaItems query error:", err);
          return [];
        }),
      db
        .select({
          log: {
            id: userMediaLogs.id,
            userId: userMediaLogs.userId,
            mediaId: userMediaLogs.mediaId,
            status: userMediaLogs.status,
            rating: userMediaLogs.rating,
            episodesWatched: userMediaLogs.episodesWatched,
            currentSeason: userMediaLogs.currentSeason,
            currentEpisode: userMediaLogs.currentEpisode,
            reviewText: userMediaLogs.reviewText,
            containsSpoilers: userMediaLogs.containsSpoilers,
            updatedAt: userMediaLogs.updatedAt,
          },
          profile: {
            username: profiles.username,
            fullName: profiles.fullName,
          },
        })
        .from(userMediaLogs)
        .leftJoin(profiles, eq(userMediaLogs.userId, profiles.id))
        .orderBy(desc(userMediaLogs.updatedAt))
        .catch((err) => {
          console.error("Discover userMediaLogs query error:", err);
          return [];
        }),
    ]);

    const allMedia = rawMedia.map((m) => ({
      ...m,
      streamingProviders: compactStreamingProviders(m.streamingProviders),
    }));

    return { allMedia, allDbLogs };
  },
  ["discover-catalog-v2"],
  { revalidate: 300, tags: ["discover"] }
);

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const {
    type = "all",
    genre = "all",
    provider = "all",
    rating = "all",
  } = await searchParams;

  // 1. Parallel fetch auth user and cached catalog
  const [user, { allMedia, allDbLogs }] = await Promise.all([
    getCurrentUser(),
    getDiscoverCatalog(),
  ]);

  let userProfile: any = null;
  if (user) {
    const existingLog = allDbLogs.find((l) => l.log.userId === user.id);
    if (existingLog?.profile?.username) {
      userProfile = existingLog.profile;
    } else {
      try {
        const profileRows = await db
          .select()
          .from(profiles)
          .where(eq(profiles.id, user.id))
          .limit(1);
        if (profileRows.length > 0) {
          userProfile = profileRows[0];
        }
      } catch {
        // ignore
      }
    }
  }

  const userProp = user
    ? {
        id: user.id,
        username: userProfile?.username || user.email?.split("@")[0] || "user",
        displayName:
          userProfile?.fullName ||
          user.user_metadata?.full_name ||
          userProfile?.username ||
          user.email?.split("@")[0] ||
          "Film Explorer",
        fullName: userProfile?.fullName,
        email: user.email,
        avatarUrl: userProfile?.avatarUrl || user.user_metadata?.avatar_url,
        backdropUrl: userProfile?.backdropUrl,
        bio: userProfile?.bio,
        createdAt: userProfile?.createdAt,
      }
    : null;

  // 2. Group community logs by mediaId & index current user logs directly in-memory
  const logsByMediaId = new Map<string, typeof allDbLogs>();
  const currentUserLogsMap = new Map<string, (typeof allDbLogs)[number]["log"]>();

  for (const l of allDbLogs) {
    const list = logsByMediaId.get(l.log.mediaId) || [];
    list.push(l);
    logsByMediaId.set(l.log.mediaId, list);

    if (user && l.log.userId === user.id) {
      currentUserLogsMap.set(l.log.mediaId, l.log);
    }
  }

  // 3. Construct unified discover library items
  let allUniqueItems: LibraryItem[] = [];

  if (allMedia && allMedia.length > 0) {
    allUniqueItems = allMedia.map((m) => {
      const mediaLogs = logsByMediaId.get(m.id) || [];
      const ratings = mediaLogs
        .map((l) => parseRating(l.log.rating))
        .filter(Boolean) as string[];
      const consensusRating = ratings.length > 0 ? getConsensusRating(ratings) : null;
      const bestLogWithReview = mediaLogs.find((l) => l.log.reviewText) || mediaLogs[0];
      const myLog = currentUserLogsMap.get(m.id);

      return {
        id: bestLogWithReview?.log.id || `media_${m.id}`,
        media: {
          id: m.id,
          source: m.source as "tmdb" | "anilist",
          sourceId: m.sourceId,
          mediaType: m.mediaType as "movie" | "series" | "anime",
          title: m.title,
          originalTitle: m.originalTitle || undefined,
          posterPath: m.posterPath || null,
          backdropPath: m.backdropPath || null,
          releaseDate: m.releaseDate || undefined,
          year: m.releaseDate ? m.releaseDate.substring(0, 4) : undefined,
          rating: m.rating ? Number(m.rating) : 0,
          totalEpisodes: m.totalEpisodes || 1,
          runtime: m.runtime || undefined,
          genres: m.genres || [],
          streamingProviders: (m.streamingProviders as any) || {},
        },
        status: myLog ? (myLog.status as any) : undefined,
        userRating: consensusRating,
        userEpisodes: myLog ? myLog.episodesWatched ?? undefined : undefined,
        currentSeason: myLog ? myLog.currentSeason ?? 1 : undefined,
        currentEpisode: myLog ? myLog.currentEpisode ?? 1 : undefined,
        reviewText: myLog?.reviewText || undefined,
        containsSpoilers: Boolean(myLog?.containsSpoilers),
        fromUsername: bestLogWithReview?.profile?.username || undefined,
        updatedAt: bestLogWithReview?.log.updatedAt
          ? new Date(bestLogWithReview.log.updatedAt).toISOString()
          : undefined,
      };
    });
  }

  // Fallback to community curated items if DB has no media yet
  if (allUniqueItems.length === 0) {
    allUniqueItems = demoLibraryItems;
  }

  return (
    <div className="flex-1 flex flex-col w-full min-h-screen bg-[#0F141D]">
      <AppHeader user={userProp} />

      <main className="flex-1 max-w-[1440px] mx-auto w-full px-3.5 sm:px-6 lg:px-12 pt-18 sm:pt-24 pb-24 md:pb-12 flex flex-col gap-4 sm:gap-6">
        {/* Header Title & Subtitle */}
        <div className="flex flex-col gap-0.5 sm:gap-1">
          <h1 className="font-black text-xl sm:text-3xl lg:text-4xl text-[#F5F7FA] tracking-tight">
            Discover
          </h1>
          <p className="text-xs sm:text-sm text-[#8E97A6] max-w-xl leading-relaxed">
            Explore movies, TV series, and anime added by users across CineTrack, categorized by rating.
          </p>
        </div>

        <DiscoverView
          items={allUniqueItems}
          initialType={type}
          initialProvider={provider}
          initialGenre={genre}
          initialRating={rating}
        />
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}

