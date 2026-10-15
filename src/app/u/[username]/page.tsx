import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Lock } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Footer } from "@/components/navigation/footer";
import { LibraryView, LibraryItem } from "@/components/library/library-view";
import { getCurrentUser } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { userMediaLogs, mediaItems, profiles } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { parseRating } from "@/lib/rating";
import { demoStats, demoLibraryItems } from "@/lib/demo-library";

interface ProfilePageProps {
  params: Promise<{
    username: string;
  }>;
  searchParams: Promise<{
    status?: string;
    type?: string;
  }>;
}

export async function generateMetadata({ params }: ProfilePageProps) {
  const { username } = await params;
  const decoded = decodeURIComponent(username).replace(/^@/, "");
  const title = `@${decoded}'s Library`;
  const description = `Explore movies, series, and anime tracked by @${decoded} on CineTrack.`;
  const url = `/${decoded}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${title} · CineTrack`,
      description,
      url,
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · CineTrack`,
      description,
    },
  };
}

/**
 * Cache public profile and library logs for 60 seconds.
 * Defends database egress against social media traffic spikes and crawlers.
 */
const getProfileLibraryData = (normalizedUsername: string) =>
  unstable_cache(
    async () => {
      const foundProfiles = await db
        .select()
        .from(profiles)
        .where(eq(profiles.username, normalizedUsername))
        .limit(1)
        .catch((err) => {
          console.error("Profile lookup error:", err);
          return [];
        });

      const targetProfile = foundProfiles.length > 0 ? foundProfiles[0] : null;
      if (!targetProfile) {
        return { targetProfile: null, allUserLogs: [] };
      }

      let allUserLogs: any[] = [];
      try {
        allUserLogs = await db
          .select({
            logId: userMediaLogs.id,
            logStatus: userMediaLogs.status,
            logRating: userMediaLogs.rating,
            episodesWatched: userMediaLogs.episodesWatched,
            currentSeason: userMediaLogs.currentSeason,
            currentEpisode: userMediaLogs.currentEpisode,
            reviewText: userMediaLogs.reviewText,
            containsSpoilers: userMediaLogs.containsSpoilers,
            updatedAt: userMediaLogs.updatedAt,
            mediaId: mediaItems.id,
            source: mediaItems.source,
            sourceId: mediaItems.sourceId,
            mediaType: mediaItems.mediaType,
            title: mediaItems.title,
            posterPath: mediaItems.posterPath,
            releaseDate: mediaItems.releaseDate,
            rating: mediaItems.rating,
            totalEpisodes: mediaItems.totalEpisodes,
            genres: mediaItems.genres,
          })
          .from(userMediaLogs)
          .innerJoin(mediaItems, eq(userMediaLogs.mediaId, mediaItems.id))
          .where(eq(userMediaLogs.userId, targetProfile.id))
          .orderBy(desc(userMediaLogs.updatedAt));
      } catch (err) {
        console.error("Error fetching media logs for profile:", err);
      }

      return { targetProfile, allUserLogs };
    },
    [`profile-library-cache-${normalizedUsername}`],
    { revalidate: 60, tags: [`profile-${normalizedUsername}`] }
  )();

export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const { username } = await params;
  const { status = "all", type = "all" } = await searchParams;
  const normalizedUsername = decodeURIComponent(username).toLowerCase().replace(/^@/, "");

  const [currentUser, { targetProfile, allUserLogs }] = await Promise.all([
    getCurrentUser(),
    getProfileLibraryData(normalizedUsername),
  ]);

  let items: LibraryItem[] = [];
  let stats = {
    total: 0,
    movies: 0,
    series: 0,
    anime: 0,
    watching: 0,
    completed: 0,
    totalMinutes: 0,
  };

  // Fallback demo user for showcase/demo username
  const isDemo = !targetProfile && (normalizedUsername === "elenavance" || normalizedUsername === "demo");

  if (!targetProfile && !isDemo) {
    notFound();
  }

  const isOwner = Boolean(currentUser && targetProfile && currentUser.id === targetProfile.id);

  // If user is suspended and caller is not owner/admin, hide profile
  if (targetProfile && targetProfile.status === "suspended" && !isOwner) {
    notFound();
  }

  const isPrivate = Boolean(targetProfile && !targetProfile.isPublic && !isOwner);

  if (targetProfile && !isPrivate && allUserLogs.length > 0) {
    try {
      stats.total = allUserLogs.length;
      stats.movies = allUserLogs.filter((l) => l.mediaType === "movie").length;
      stats.series = allUserLogs.filter((l) => l.mediaType === "series").length;
      stats.anime = allUserLogs.filter((l) => l.mediaType === "anime").length;
      stats.watching = allUserLogs.filter((l) => l.logStatus === "watching").length;
      stats.completed = allUserLogs.filter((l) => l.logStatus === "completed").length;

      stats.totalMinutes = allUserLogs.reduce((acc, curr) => {
        const fallback =
          curr.mediaType === "movie"
            ? 105
            : curr.mediaType === "anime"
            ? 24
            : 45;
        const runtime = curr.runtime || fallback;
        const eps =
          curr.mediaType === "movie"
            ? curr.logStatus === "completed" || curr.logStatus === "watching"
              ? 1
              : 0
            : curr.episodesWatched || (curr.logStatus === "completed" ? curr.totalEpisodes || 1 : 0);
        return acc + runtime * eps;
      }, 0);

      items = allUserLogs.map((l) => ({
        id: l.logId,
        media: {
          id: l.mediaId,
          source: l.source as "tmdb" | "anilist",
          sourceId: l.sourceId,
          mediaType: l.mediaType as "movie" | "series" | "anime",
          title: l.title,
          posterPath: l.posterPath || null,
          year: l.releaseDate ? l.releaseDate.substring(0, 4) : undefined,
          rating: l.rating ? Number(l.rating) : 0,
          totalEpisodes: l.totalEpisodes || 1,
          genres: l.genres || [],
        },
        status: l.logStatus as any,
        userRating: parseRating(l.logRating),
        userEpisodes: l.episodesWatched,
        currentSeason: l.currentSeason ?? 1,
        currentEpisode: l.currentEpisode ?? 1,
        reviewText: l.reviewText,
        containsSpoilers: Boolean(l.containsSpoilers),
        updatedAt: l.updatedAt ? new Date(l.updatedAt).toISOString() : undefined,
      })).sort((a, b) => {
        const isWatchingA = a.status === "watching" ? 1 : 0;
        const isWatchingB = b.status === "watching" ? 1 : 0;
        if (isWatchingA !== isWatchingB) return isWatchingB - isWatchingA;
        return (
          new Date(b.updatedAt || 0).getTime() -
          new Date(a.updatedAt || 0).getTime()
        );
      });
    } catch (err) {
      console.error("Error fetching media logs for profile:", err);
    }
  }

  const finalItems = items.length > 0 || !isDemo ? items : demoLibraryItems;
  const finalStats = items.length > 0 || !isDemo ? stats : demoStats;

  const userProp = targetProfile
    ? {
        id: targetProfile.id,
        username: targetProfile.username,
        displayName: targetProfile.fullName || targetProfile.username,
        fullName: targetProfile.fullName,
        email: isOwner ? currentUser?.email : null,
        avatarUrl: targetProfile.avatarUrl,
        backdropUrl: targetProfile.backdropUrl,
        bio: targetProfile.bio,
        createdAt: targetProfile.createdAt,
      }
    : {
        id: "demo-elenavance",
        username: "elenavance",
        displayName: "Elena Vance",
        fullName: "Elena Vance",
        email: null,
        avatarUrl:
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop",
        backdropUrl: "https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
        bio: "Film archivist & sci-fi enthusiast. Contributor at Sight & Sound. Focused on post-Soviet speculative fiction and structuralist narratives.",
        createdAt: "2024-01-01",
      };

  return (
    <div className="flex-1 flex flex-col w-full min-h-screen bg-[#0F141D]">
      <AppHeader
        user={
          isOwner
            ? {
                id: userProp.id,
                username: userProp.username,
                displayName: userProp.displayName,
                fullName: userProp.fullName || undefined,
                email: currentUser?.email || undefined,
                avatarUrl: userProp.avatarUrl || undefined,
              }
            : undefined
        }
      />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-12 pt-18 sm:pt-24 pb-24 md:pb-12">
        {isPrivate ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center rounded-2xl bg-[#151C27] border border-white/[0.08] shadow-xl my-8 max-w-lg mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-[#1D2734] border border-white/10 flex items-center justify-center text-[#A8B0BD] mb-4 shadow-inner">
              <Lock className="w-6 h-6 text-[#3B9EFF]" />
            </div>
            <h2 className="font-bold text-xl text-[#F5F7FA] tracking-tight">This Profile is Private</h2>
            <p className="text-xs sm:text-sm text-[#A8B0BD] mt-2 leading-relaxed max-w-sm">
              @{userProp.username} has set their library, watch activity, and statistics to private.
            </p>
          </div>
        ) : (
          <LibraryView
            initialItems={finalItems}
            user={userProp}
            stats={finalStats}
            initialStatus={status}
            initialType={type}
            isOwner={isOwner}
          />
        )}
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
