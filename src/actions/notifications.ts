"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  notifications,
  reviewReactions,
  userMediaLogs,
  mediaItems,
  profiles,
} from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { eq, and, desc, count } from "drizzle-orm";

export interface UserNotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  actor: {
    name: string;
    username: string | null;
    avatarUrl: string | null;
  } | null;
}

export async function getUserNotifications(): Promise<{
  unreadCount: number;
  items: UserNotificationItem[];
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { unreadCount: 0, items: [] };
    }

    const [unreadRes] = await db
      .select({ n: count() })
      .from(notifications)
      .where(
        and(eq(notifications.userId, user.id), eq(notifications.isRead, false))
      );

    const rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        link: notifications.link,
        isRead: notifications.isRead,
        createdAt: notifications.createdAt,
        actorName: profiles.fullName,
        actorUsername: profiles.username,
        actorAvatar: profiles.avatarUrl,
      })
      .from(notifications)
      .leftJoin(profiles, eq(notifications.actorId, profiles.id))
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(8);

    return {
      unreadCount: unreadRes?.n ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        message: r.message,
        link: r.link,
        isRead: r.isRead,
        createdAt: new Date(r.createdAt).toISOString(),
        actor: r.actorUsername
          ? {
              name: r.actorName || r.actorUsername,
              username: r.actorUsername,
              avatarUrl: r.actorAvatar,
            }
          : null,
      })),
    };
  } catch (err) {
    console.error("getUserNotifications error:", err);
    return { unreadCount: 0, items: [] };
  }
}

export async function markAllNotificationsRead() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return { error: "Unauthorized" };

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(eq(notifications.userId, user.id), eq(notifications.isRead, false))
      );

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    console.error("markAllNotificationsRead error:", err);
    return { error: "Failed to mark notifications as read" };
  }
}

export async function markNotificationRead(id: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return { error: "Unauthorized" };

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err) {
    console.error("markNotificationRead error:", err);
    return { error: "Failed to mark notification read" };
  }
}

export async function toggleReviewReaction(params: {
  reviewId: string;
  mediaHref?: string;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: "Sign in to react to reviews.", requireAuth: true };
    }

    const { reviewId, mediaHref } = params;

    // Check existing reaction
    const [existing] = await db
      .select({ id: reviewReactions.id })
      .from(reviewReactions)
      .where(
        and(
          eq(reviewReactions.reviewId, reviewId),
          eq(reviewReactions.userId, user.id),
          eq(reviewReactions.type, "like")
        )
      )
      .limit(1);

    let liked = false;

    if (existing) {
      // Remove reaction
      await db
        .delete(reviewReactions)
        .where(eq(reviewReactions.id, existing.id));
      liked = false;
    } else {
      // Add reaction
      await db.insert(reviewReactions).values({
        reviewId,
        userId: user.id,
        type: "like",
      });
      liked = true;

      // Find review author to notify
      const [review] = await db
        .select({
          userId: userMediaLogs.userId,
          mediaId: userMediaLogs.mediaId,
        })
        .from(userMediaLogs)
        .where(eq(userMediaLogs.id, reviewId))
        .limit(1);

      // Only notify if reactor is not the review author
      if (review && review.userId !== user.id) {
        // Fetch actor profile & media title
        const [actorProfile] = await db
          .select({
            fullName: profiles.fullName,
            username: profiles.username,
          })
          .from(profiles)
          .where(eq(profiles.id, user.id))
          .limit(1);

        const [media] = await db
          .select({
            title: mediaItems.title,
            mediaType: mediaItems.mediaType,
            sourceId: mediaItems.sourceId,
          })
          .from(mediaItems)
          .where(eq(mediaItems.id, review.mediaId))
          .limit(1);

        const actorDisplay =
          actorProfile?.fullName ||
          (actorProfile?.username ? `@${actorProfile.username}` : "Someone");
        const mediaTitle = media?.title || "your review";
        const link =
          mediaHref || (media ? `/${media.mediaType}/${media.sourceId}` : "/");

        await db.insert(notifications).values({
          userId: review.userId,
          actorId: user.id,
          type: "review_reaction",
          title: `${actorDisplay} liked your review`,
          message: `liked your review on "${mediaTitle}"`,
          link,
          isRead: false,
        });
      }
    }

    // Get updated count
    const [countRow] = await db
      .select({ n: count() })
      .from(reviewReactions)
      .where(
        and(
          eq(reviewReactions.reviewId, reviewId),
          eq(reviewReactions.type, "like")
        )
      );

    const likesCount = countRow?.n ?? 0;

    return {
      success: true,
      liked,
      likesCount,
    };
  } catch (err) {
    console.error("toggleReviewReaction error:", err);
    return { error: "Failed to update reaction" };
  }
}
