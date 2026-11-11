"use server";

import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { mediaItems, userMediaLogs, profiles } from "@/lib/db/schema";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { NormalizedMedia } from "@/lib/media/normalize";
import { eq, and } from "drizzle-orm";
import { RatingCategory, isValidRating, parseRating } from "@/lib/rating";
import { tmdb } from "@/lib/tmdb/client";

export interface LogMediaParams {
  media: NormalizedMedia;
  status: "watching" | "completed" | "plan_to_watch" | "on_hold" | "dropped";
  rating?: RatingCategory | null;
  episodesWatched?: number;
  currentSeason?: number;
  currentEpisode?: number;
  reviewText?: string | null;
  containsSpoilers?: boolean;
  isFavorite?: boolean;
}

export async function upsertMediaLog(params: LogMediaParams) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: "Authentication required to log titles." };
    }

    // Ensure profile row exists
    const [existingProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

    if (existingProfile?.status === "suspended" || existingProfile?.status === "banned") {
      return { error: `Account is ${existingProfile.status}. Tracking is disabled.` };
    }

    if (!existingProfile) {
      const generatedUsername =
        user.user_metadata?.user_name ||
        user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "") ||
        `user_${user.id.slice(0, 8)}`;

      await db
        .insert(profiles)
        .values({
          id: user.id,
          username: generatedUsername.slice(0, 15),
          fullName: user.user_metadata?.full_name || user.email?.split("@")[0],
          avatarUrl: user.user_metadata?.avatar_url,
          preferredCountry: "US",
        })
        .onConflictDoNothing();
    }

    const {
      media,
      status,
      rating,
      episodesWatched = 0,
      currentSeason = 1,
      currentEpisode = 1,
      reviewText,
      containsSpoilers = false,
      isFavorite = false,
    } = params;

    const ALLOWED_STATUSES = ["watching", "completed", "plan_to_watch", "on_hold", "dropped"] as const;
    if (!ALLOWED_STATUSES.includes(status as any)) {
      return { error: "Invalid status value." };
    }

    const safeEpisodesWatched = Math.max(0, Math.min(Math.floor(Number(episodesWatched) || 0), 10000));
    const safeCurrentSeason = Math.max(1, Math.min(Math.floor(Number(currentSeason) || 1), 1000));
    const safeCurrentEpisode = Math.max(1, Math.min(Math.floor(Number(currentEpisode) || 1), 10000));
    const cleanReviewText = reviewText ? reviewText.trim().slice(0, 5000) : null;

    if (rating !== undefined && rating !== null && !isValidRating(rating)) {
      return { error: "Invalid rating. Allowed categories: poor, average, good, great, masterpiece." };
    }
    const finalRating =
      status === "plan_to_watch" || status === "watching"
        ? null
        : rating
        ? parseRating(rating)
        : null;

    // Determine when the log reached "completed" (for accurate admin metrics)
    const [existingLog] = await db
      .select({
        status: userMediaLogs.status,
        completedAt: userMediaLogs.completedAt,
      })
      .from(userMediaLogs)
      .where(
        and(
          eq(userMediaLogs.userId, user.id),
          eq(userMediaLogs.mediaId, media.id)
        )
      )
      .limit(1);

    let completedAt: Date | null = null;
    if (status === "completed") {
      completedAt =
        existingLog?.status === "completed" && existingLog.completedAt
          ? existingLog.completedAt
          : new Date();
    }

    // Auto-fetch real runtime from TMDb if not provided by search result
    let runtime = media.runtime;
    if (!runtime && media.source === "tmdb" && media.sourceId) {
      try {
        if (media.mediaType === "movie") {
          const details = await tmdb.getMovieDetails(media.sourceId);
          runtime = details?.runtime || undefined;
        } else if (media.mediaType === "series") {
          const details = await tmdb.getTVDetails(media.sourceId);
          runtime =
            details?.episode_run_time?.[0] ||
            details?.last_episode_to_air?.runtime ||
            45;
        }
      } catch (err) {
        console.error("Failed to fetch TMDb runtime:", err);
      }
    }
    if (!runtime) {
      runtime = media.mediaType === "movie" ? 105 : media.mediaType === "anime" ? 24 : 45;
    }

    // Atomic transaction: upsert media_items first, then user_media_logs
    await db.transaction(async (tx) => {
      // 1. Insert metadata if not already cached (prevents arbitrary client metadata defacement)
      await tx
        .insert(mediaItems)
        .values({
          id: media.id,
          source: media.source,
          sourceId: media.sourceId,
          mediaType: media.mediaType,
          title: media.title,
          originalTitle: media.originalTitle,
          posterPath: media.posterPath,
          backdropPath: media.backdropPath,
          releaseDate: media.releaseDate,
          rating: media.rating ? String(media.rating) : null,
          totalEpisodes: media.totalEpisodes,
          runtime,
          genres: media.genres,
          streamingProviders: media.streamingProviders || {},
          synopsis: media.synopsis,
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      // 2. Upsert user log
      await tx
        .insert(userMediaLogs)
        .values({
          userId: user.id,
          mediaId: media.id,
          status,
          rating: finalRating,
          episodesWatched: safeEpisodesWatched,
          currentSeason: safeCurrentSeason,
          currentEpisode: safeCurrentEpisode,
          reviewText: cleanReviewText,
          containsSpoilers,
          isFavorite,
          completedAt,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [userMediaLogs.userId, userMediaLogs.mediaId],
          set: {
            status,
            rating: finalRating,
            episodesWatched: safeEpisodesWatched,
            currentSeason: safeCurrentSeason,
            currentEpisode: safeCurrentEpisode,
            reviewText: cleanReviewText,
            containsSpoilers,
            isFavorite,
            completedAt,
            updatedAt: new Date(),
          },
        });
    });

    revalidatePath("/library");
    revalidatePath("/");
    revalidatePath(`/${media.mediaType}/${media.sourceId}`);
    try {
      updateTag("discover");
      const currentUsername = existingProfile?.username || user.user_metadata?.user_name;
      if (currentUsername) {
        updateTag(`profile-${currentUsername}`);
        revalidatePath(`/${currentUsername}`);
        revalidatePath(`/u/${currentUsername}`);
      }
    } catch {}

    return { success: true };
  } catch (err: any) {
    console.error("upsertMediaLog error:", err);
    return { error: err.message || "Failed to save log." };
  }
}

export async function incrementEpisode(mediaId: string, totalEpisodes: number = 1) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };

    const [profile] = await db
      .select({ status: profiles.status, username: profiles.username })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

    if (profile?.status === "suspended" || profile?.status === "banned") {
      return { error: `Account is ${profile.status}.` };
    }

    const [existing] = await db
      .select({
        log: userMediaLogs,
        mediaType: mediaItems.mediaType,
        totalEpisodes: mediaItems.totalEpisodes,
      })
      .from(userMediaLogs)
      .innerJoin(mediaItems, eq(userMediaLogs.mediaId, mediaItems.id))
      .where(
        and(
          eq(userMediaLogs.userId, user.id),
          eq(userMediaLogs.mediaId, mediaId)
        )
      )
      .limit(1);

    if (!existing) return { error: "Log not found" };

    if (existing.mediaType === "movie") {
      return { error: "Cannot increment episodes on a movie." };
    }

    const maxEpisodes = Math.max(1, existing.totalEpisodes || totalEpisodes || 1);
    const currentWatched = existing.log.episodesWatched || 0;

    if (currentWatched >= maxEpisodes) {
      return { success: true, count: currentWatched };
    }

    const newEpisodeCount = Math.min(currentWatched + 1, maxEpisodes);
    const newCurrentEpisode = (existing.log.currentEpisode || 1) + 1;
    const shouldComplete = newEpisodeCount >= maxEpisodes;

    await db
      .update(userMediaLogs)
      .set({
        episodesWatched: newEpisodeCount,
        currentEpisode: newCurrentEpisode,
        status: shouldComplete ? "completed" : (existing.log.status === "plan_to_watch" ? "watching" : existing.log.status),
        completedAt: shouldComplete ? (existing.log.completedAt || new Date()) : null,
        updatedAt: new Date(),
      })
      .where(eq(userMediaLogs.id, existing.log.id));

    revalidatePath("/library");
    revalidatePath("/");
    try {
      updateTag("discover");
      if (profile?.username) {
        updateTag(`profile-${profile.username}`);
        revalidatePath(`/${profile.username}`);
        revalidatePath(`/u/${profile.username}`);
      }
    } catch {}

    return { success: true, count: newEpisodeCount };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function getUserMediaLog(mediaId: string, userId?: string) {
  try {
    let targetUserId = userId;
    if (!targetUserId) {
      const user = await getCurrentUser();
      if (!user) return null;
      targetUserId = user.id;
    }

    const [log] = await db
      .select()
      .from(userMediaLogs)
      .where(
        and(
          eq(userMediaLogs.userId, targetUserId),
          eq(userMediaLogs.mediaId, mediaId)
        )
      )
      .limit(1);

    return log || null;
  } catch {
    return null;
  }
}

export async function deleteMediaLog(mediaId: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: "Authentication required to remove items." };
    }

    const [profile] = await db
      .select({ status: profiles.status, username: profiles.username })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

    if (profile?.status === "suspended" || profile?.status === "banned") {
      return { error: `Account is ${profile.status}.` };
    }

    await db
      .delete(userMediaLogs)
      .where(
        and(
          eq(userMediaLogs.userId, user.id),
          eq(userMediaLogs.mediaId, mediaId)
        )
      );

    revalidatePath("/library");
    revalidatePath("/");
    try {
      updateTag("discover");
      if (profile?.username) {
        updateTag(`profile-${profile.username}`);
        revalidatePath(`/${profile.username}`);
        revalidatePath(`/u/${profile.username}`);
      }
    } catch {}

    return { success: true };
  } catch (err: any) {
    console.error("deleteMediaLog error:", err);
    return { error: err.message || "Failed to remove item from library." };
  }
}

export async function getCurrentUserLibraryLogs() {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    const logs = await db
      .select({
        id: userMediaLogs.id,
        mediaId: userMediaLogs.mediaId,
        source: mediaItems.source,
        sourceId: mediaItems.sourceId,
        mediaType: mediaItems.mediaType,
        status: userMediaLogs.status,
        rating: userMediaLogs.rating,
        currentSeason: userMediaLogs.currentSeason,
        currentEpisode: userMediaLogs.currentEpisode,
        episodesWatched: userMediaLogs.episodesWatched,
        reviewText: userMediaLogs.reviewText,
        containsSpoilers: userMediaLogs.containsSpoilers,
      })
      .from(userMediaLogs)
      .innerJoin(mediaItems, eq(userMediaLogs.mediaId, mediaItems.id))
      .where(eq(userMediaLogs.userId, user.id));

    return logs.map((l) => ({
      ...l,
      rating: parseRating(l.rating),
    }));
  } catch (err) {
    console.error("getCurrentUserLibraryLogs error:", err);
    return [];
  }
}
