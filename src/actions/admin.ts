"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { profiles, featureRequests, adminAuditLogs } from "@/lib/db/schema";
import { getAdminProfile } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyNewRequest } from "@/lib/telegram";
import { eq, desc, count, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";

const REQUEST_STATUSES = [
  "new",
  "under_review",
  "planned",
  "in_progress",
  "completed",
  "declined",
] as const;
const PRIORITIES = ["low", "medium", "high"] as const;

export async function updateFeatureRequest(params: {
  id: string;
  status?: string;
  priority?: string;
  adminNotes?: string | null;
}) {
  const admin = await getAdminProfile();
  if (!admin) return { error: "Unauthorized" };

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (params.status && (REQUEST_STATUSES as readonly string[]).includes(params.status)) {
    set.status = params.status;
  }
  if (params.priority && (PRIORITIES as readonly string[]).includes(params.priority)) {
    set.priority = params.priority;
  }
  if (params.adminNotes !== undefined) {
    set.adminNotes = params.adminNotes?.trim() || null;
  }

  try {
    await db
      .update(featureRequests)
      .set(set)
      .where(eq(featureRequests.id, params.id));
    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/notifications");
    return { success: true };
  } catch (err: unknown) {
    console.error("updateFeatureRequest error:", err);
    return { error: (err as Error).message || "Failed to update request." };
  }
}

export async function updateUserStatus(params: {
  userId: string;
  status: "active" | "suspended" | "banned";
  reason?: string;
}) {
  const admin = await getAdminProfile();
  if (!admin) return { error: "Unauthorized" };

  const { userId, status, reason } = params;

  if (userId === admin.id) {
    return { error: "Cannot modify status of your own account." };
  }

  if (!["active", "suspended", "banned"].includes(status)) {
    return { error: "Invalid account status value." };
  }

  try {
    const [target] = await db
      .select({
        role: profiles.role,
        status: profiles.status,
        username: profiles.username,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!target) return { error: "User not found." };
    if (target.role === "admin") {
      return { error: "Protected account. Cannot modify status of an admin." };
    }

    const cleanReason = reason ? reason.trim().slice(0, 500) : null;
    const action =
      status === "suspended"
        ? "suspend_user"
        : status === "banned"
        ? "ban_user"
        : target.status === "banned"
        ? "unban_user"
        : "restore_user";

    // 1. Atomic update in transaction: update profile + write audit log
    await db.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({
          status,
          statusReason: cleanReason,
          statusUpdatedAt: new Date(),
          statusUpdatedBy: admin.id,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, userId));

      await tx.insert(adminAuditLogs).values({
        adminId: admin.id,
        targetUserId: userId,
        action: action as "suspend_user" | "restore_user" | "ban_user" | "unban_user" | "role_change",
        reason: cleanReason,
        metadata: {
          previousStatus: target.status,
          newStatus: status,
        },
      });
    });

    // 2. Auth layer session invalidation and ban enforcement
    try {
      if (status === "suspended") {
        await db.execute(
          sql`UPDATE auth.users SET banned_until = NOW() + INTERVAL '100 years' WHERE id = ${userId}::uuid`
        );
        await db.execute(
          sql`DELETE FROM auth.sessions WHERE user_id = ${userId}::uuid`
        );
        await db.execute(
          sql`DELETE FROM auth.refresh_tokens WHERE session_id NOT IN (SELECT id FROM auth.sessions)`
        );
      } else if (status === "banned") {
        await db.execute(
          sql`UPDATE auth.users SET banned_until = '2099-12-31 23:59:59+00'::timestamptz WHERE id = ${userId}::uuid`
        );
        await db.execute(
          sql`DELETE FROM auth.sessions WHERE user_id = ${userId}::uuid`
        );
        await db.execute(
          sql`DELETE FROM auth.refresh_tokens WHERE session_id NOT IN (SELECT id FROM auth.sessions)`
        );
      } else if (status === "active") {
        await db.execute(
          sql`UPDATE auth.users SET banned_until = NULL WHERE id = ${userId}::uuid`
        );
      }
    } catch (authErr) {
      console.warn("Auth table session invalidation warning:", authErr);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    if (target.username) {
      revalidatePath(`/${target.username}`);
      revalidatePath(`/u/${target.username}`);
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("updateUserStatus error:", err);
    return { error: (err as Error).message || "Failed to update user status." };
  }
}

export async function setUserSuspended(userId: string, suspended: boolean) {
  return updateUserStatus({
    userId,
    status: suspended ? "suspended" : "active",
  });
}


export async function submitFeatureRequest(params: {
  category: string;
  title: string;
  description: string;
  email?: string | null;
}) {
  try {
    const headersList = await headers();
    const clientIp =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      "anonymous";

    const rateLimit = await checkRateLimit(`feedback:${clientIp}`, {
      limit: 5,
      windowMs: 10 * 60 * 1000, // 5 submissions per 10 minutes
    });

    if (!rateLimit.allowed) {
      return {
        error: "Too many submissions. Please wait a few minutes before submitting another request.",
      };
    }

    const category = ["feature", "bug", "general"].includes(params.category)
      ? params.category
      : "feature";
    const title = params.title?.trim().slice(0, 140);
    const description = params.description?.trim().slice(0, 4000);

    if (!title || !description) {
      return { error: "Title and description are required." };
    }

    if (title.length < 3) {
      return { error: "Title must be at least 3 characters long." };
    }

    const rawEmail = params.email?.trim() || null;
    if (rawEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(rawEmail) || rawEmail.length > 150) {
        return { error: "Please enter a valid email address." };
      }
    }

    let userId: string | null = null;
    let submitterUsername: string | null = null;
    let submitterEmail = rawEmail;

    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const [profile] = await db
          .select({ id: profiles.id, username: profiles.username })
          .from(profiles)
          .where(eq(profiles.id, user.id))
          .limit(1);
        if (profile) {
          userId = profile.id;
          submitterUsername = profile.username;
        }
        if (!submitterEmail && user.email) {
          submitterEmail = user.email;
        }
      }
    } catch {
      // anonymous submission is fine
    }

    await db.insert(featureRequests).values({
      userId,
      email: submitterEmail,
      category: category as "feature" | "bug" | "general",
      title,
      description,
    });

    // Send instant Telegram alert asynchronously
    notifyNewRequest({
      title,
      description,
      category,
      email: submitterEmail,
      username: submitterUsername,
    }).catch((err) => {
      console.error("Failed to send Telegram notification for request:", err);
    });

    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/notifications");
    return { success: true };
  } catch (err: unknown) {
    console.error("submitFeatureRequest error:", err);
    return { error: "Failed to submit request. Please try again later." };
  }
}

export type AdminNotificationItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  author: string;
};

export async function getAdminNotifications(): Promise<{
  unreadCount: number;
  items: AdminNotificationItem[];
}> {
  const admin = await getAdminProfile();
  if (!admin) return { unreadCount: 0, items: [] };

  try {
    const [unreadRes] = await db
      .select({ n: count(featureRequests.id) })
      .from(featureRequests)
      .where(eq(featureRequests.status, "new"));

    const recent = await db
      .select({
        id: featureRequests.id,
        title: featureRequests.title,
        description: featureRequests.description,
        category: featureRequests.category,
        status: featureRequests.status,
        createdAt: featureRequests.createdAt,
        email: featureRequests.email,
        username: profiles.username,
      })
      .from(featureRequests)
      .leftJoin(profiles, eq(featureRequests.userId, profiles.id))
      .orderBy(desc(featureRequests.createdAt))
      .limit(6);

    return {
      unreadCount: unreadRes?.n ?? 0,
      items: recent.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        status: r.status,
        createdAt: new Date(r.createdAt).toISOString(),
        author: r.username ? `@${r.username}` : r.email || "Anonymous",
      })),
    };
  } catch (err) {
    console.error("getAdminNotifications error:", err);
    return { unreadCount: 0, items: [] };
  }
}

export async function markAllRequestsReviewed() {
  const admin = await getAdminProfile();
  if (!admin) return { error: "Unauthorized" };

  try {
    await db
      .update(featureRequests)
      .set({ status: "under_review", updatedAt: new Date() })
      .where(eq(featureRequests.status, "new"));

    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/notifications");
    return { success: true };
  } catch (err: unknown) {
    console.error("markAllRequestsReviewed error:", err);
    return { error: (err as Error).message || "Failed to update requests." };
  }
}
