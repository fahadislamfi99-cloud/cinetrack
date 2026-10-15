import { db } from "@/lib/db";
import {
  profiles,
  mediaItems,
  userMediaLogs,
  featureRequests,
  authUsers,
  adminAuditLogs,
} from "@/lib/db/schema";
import { eq, gte, count, desc, isNotNull, or, and, ilike, sql } from "drizzle-orm";
import type { ChartPoint } from "@/components/admin/chart";

export type RangeKey = "7" | "30" | "90" | "365";

export const RANGE_DAYS: Record<RangeKey, number> = {
  "7": 7,
  "30": 30,
  "90": 90,
  "365": 365,
};

export function parseRange(raw: string | undefined): RangeKey {
  return raw === "7" || raw === "90" || raw === "365" ? raw : "30";
}

const DAY = 86400000;

type Granularity = "day" | "week" | "month";

function granularityFor(rangeDays: number): Granularity {
  if (rangeDays <= 31) return "day";
  if (rangeDays <= 120) return "week";
  return "month";
}

function fmt(d: Date, g: Granularity): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  if (g === "month") return months[d.getMonth()];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Bucket an array of timestamps into a contiguous time series for the given
 * range. Buckets are contiguous (no gaps) so charts render a smooth axis.
 * ponytail: JS bucketing over in-memory timestamps — fine for the current
 * catalog size; move to date_trunc GROUP BY if logs grow large.
 */
export function buildTimeSeries(dates: Date[], rangeDays: number): ChartPoint[] {
  const g = granularityFor(rangeDays);
  const now = new Date();
  const start = new Date(now.getTime() - rangeDays * DAY);

  // Build bucket boundaries (start of each bucket, oldest first)
  const buckets: { start: Date; label: string }[] = [];
  if (g === "day") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    while (cursor.getTime() <= end.getTime()) {
      buckets.push({ start: new Date(cursor), label: fmt(new Date(cursor), g) });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (g === "week") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cursor.getTime() <= now.getTime()) {
      buckets.push({ start: new Date(cursor), label: fmt(new Date(cursor), g) });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    let y = start.getFullYear();
    let m = start.getMonth();
    const cursor = new Date(y, m, 1);
    while (cursor.getTime() <= now.getTime()) {
      buckets.push({ start: new Date(cursor), label: fmt(new Date(cursor), g) });
      m += 1;
      cursor.setFullYear(y + Math.floor(m / 12), m % 12, 1);
      y = cursor.getFullYear();
      m = cursor.getMonth();
    }
  }

  const counts = new Map<string, number>();
  for (const d of dates) {
    const t = d.getTime();
    if (t < start.getTime() || t > now.getTime()) continue;
    let idx = 0;
    if (g === "day") {
      idx = Math.floor((t - buckets[0].start.getTime()) / DAY);
    } else if (g === "week") {
      idx = Math.floor((t - buckets[0].start.getTime()) / (7 * DAY));
    } else {
      idx =
        (d.getFullYear() - buckets[0].start.getFullYear()) * 12 +
        (d.getMonth() - buckets[0].start.getMonth());
    }
    if (idx < 0 || idx >= buckets.length) continue;
    const key = String(idx);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return buckets.map((b, i) => ({
    label: b.label,
    value: counts.get(String(i)) || 0,
  }));
}

export function daysAgo(n: number) {
  return new Date(Date.now() - n * DAY);
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

export async function countRows() {
  const [[users], [media], [logs], [requests]] = await Promise.all([
    db.select({ n: count(profiles.id) }).from(profiles),
    db.select({ n: count(mediaItems.id) }).from(mediaItems),
    db.select({ n: count(userMediaLogs.id) }).from(userMediaLogs),
    db.select({ n: count(featureRequests.id) }).from(featureRequests),
  ]);
  return {
    users: users?.n ?? 0,
    media: media?.n ?? 0,
    logs: logs?.n ?? 0,
    requests: requests?.n ?? 0,
  };
}

export async function getUserGrowth(rangeDays: number): Promise<ChartPoint[]> {
  const since = daysAgo(rangeDays);
  const rows = await db
    .select({ createdAt: profiles.createdAt })
    .from(profiles)
    .where(gte(profiles.createdAt, since));
  return buildTimeSeries(
    rows.map((r) => r.createdAt),
    rangeDays
  );
}

export async function getMediaAddedSeries(rangeDays: number): Promise<ChartPoint[]> {
  const since = daysAgo(rangeDays);
  const rows = await db
    .select({ createdAt: userMediaLogs.createdAt })
    .from(userMediaLogs)
    .where(gte(userMediaLogs.createdAt, since));
  return buildTimeSeries(
    rows.map((r) => r.createdAt),
    rangeDays
  );
}

export interface UserLibraryStats {
  total: number;
  watching: number;
  completed: number;
  planToWatch: number;
  onHold: number;
  dropped: number;
  movies: number;
  series: number;
  anime: number;
  reviews: number;
  ratings: number;
}

export async function getUserLibraryStats(userId: string): Promise<UserLibraryStats> {
  const logs = await db
    .select({
      status: userMediaLogs.status,
      mediaType: mediaItems.mediaType,
      reviewText: userMediaLogs.reviewText,
      rating: userMediaLogs.rating,
    })
    .from(userMediaLogs)
    .innerJoin(mediaItems, eq(userMediaLogs.mediaId, mediaItems.id))
    .where(eq(userMediaLogs.userId, userId));

  return {
    total: logs.length,
    watching: logs.filter((l) => l.status === "watching").length,
    completed: logs.filter((l) => l.status === "completed").length,
    planToWatch: logs.filter((l) => l.status === "plan_to_watch").length,
    onHold: logs.filter((l) => l.status === "on_hold").length,
    dropped: logs.filter((l) => l.status === "dropped").length,
    movies: logs.filter((l) => l.mediaType === "movie").length,
    series: logs.filter((l) => l.mediaType === "series").length,
    anime: logs.filter((l) => l.mediaType === "anime").length,
    reviews: logs.filter((l) => l.reviewText && l.reviewText.trim()).length,
    ratings: logs.filter((l) => l.rating != null).length,
  };
}

export async function getStatusDistribution() {
  const rows = await db
    .select({ status: userMediaLogs.status, n: count(userMediaLogs.id) })
    .from(userMediaLogs)
    .groupBy(userMediaLogs.status);
  return rows.map((r) => ({ status: r.status, count: r.n }));
}

export async function getMediaTypeDistribution() {
  const rows = await db
    .select({ mediaType: mediaItems.mediaType, n: count(mediaItems.id) })
    .from(mediaItems)
    .groupBy(mediaItems.mediaType);
  return rows.map((r) => ({ mediaType: r.mediaType, count: r.n }));
}

export async function getPopularMedia(limit = 8) {
  const rows = await db
    .select({
      mediaId: userMediaLogs.mediaId,
      title: mediaItems.title,
      posterPath: mediaItems.posterPath,
      mediaType: mediaItems.mediaType,
      n: count(userMediaLogs.id),
    })
    .from(userMediaLogs)
    .innerJoin(mediaItems, eq(userMediaLogs.mediaId, mediaItems.id))
    .groupBy(
      userMediaLogs.mediaId,
      mediaItems.title,
      mediaItems.posterPath,
      mediaItems.mediaType
    )
    .orderBy(desc(count(userMediaLogs.id)))
    .limit(limit);
  return rows.map((r) => ({
    id: r.mediaId,
    title: r.title,
    posterPath: r.posterPath,
    mediaType: r.mediaType,
    count: r.n,
  }));
}

export async function getMostRated(limit = 8) {
  const rows = await db
    .select({
      mediaId: userMediaLogs.mediaId,
      title: mediaItems.title,
      posterPath: mediaItems.posterPath,
      mediaType: mediaItems.mediaType,
      n: count(userMediaLogs.id),
    })
    .from(userMediaLogs)
    .innerJoin(mediaItems, eq(userMediaLogs.mediaId, mediaItems.id))
    .where(isNotNull(userMediaLogs.rating))
    .groupBy(
      userMediaLogs.mediaId,
      mediaItems.title,
      mediaItems.posterPath,
      mediaItems.mediaType
    )
    .orderBy(desc(count(userMediaLogs.id)))
    .limit(limit);
  return rows.map((r) => ({
    id: r.mediaId,
    title: r.title,
    posterPath: r.posterPath,
    mediaType: r.mediaType,
    count: r.n,
  }));
}

export async function getMostByStatus(status: string, limit = 8) {
  const rows = await db
    .select({
      mediaId: userMediaLogs.mediaId,
      title: mediaItems.title,
      posterPath: mediaItems.posterPath,
      mediaType: mediaItems.mediaType,
      n: count(userMediaLogs.id),
    })
    .from(userMediaLogs)
    .innerJoin(mediaItems, eq(userMediaLogs.mediaId, mediaItems.id))
    .where(eq(userMediaLogs.status, status))
    .groupBy(
      userMediaLogs.mediaId,
      mediaItems.title,
      mediaItems.posterPath,
      mediaItems.mediaType
    )
    .orderBy(desc(count(userMediaLogs.id)))
    .limit(limit);
  return rows.map((r) => ({
    id: r.mediaId,
    title: r.title,
    posterPath: r.posterPath,
    mediaType: r.mediaType,
    count: r.n,
  }));
}

export async function getRatingDistribution() {
  const rows = await db
    .select({ rating: userMediaLogs.rating, n: count(userMediaLogs.id) })
    .from(userMediaLogs)
    .where(isNotNull(userMediaLogs.rating))
    .groupBy(userMediaLogs.rating);
  return rows.map((r) => ({ rating: r.rating as string, count: r.n }));
}

// ---------------------------------------------------------------------------
// Production User Management Queries
// ---------------------------------------------------------------------------

export interface AdminUserListItem {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  status: "active" | "suspended" | "banned";
  statusReason: string | null;
  statusUpdatedAt: Date | null;
  createdAt: Date;
  email: string | null;
  lastSignInAt: Date | null;
  provider: string | null;
  library: number;
  reviews: number;
  ratings: number;
}

export interface GetPaginatedUsersParams {
  q?: string;
  status?: string;
  role?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedUsersResult {
  users: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getPaginatedUsers(
  params: GetPaginatedUsersParams = {}
): Promise<PaginatedUsersResult> {
  const q = params.q?.trim() || "";
  const status = params.status || "all";
  const role = params.role || "all";
  const sort = params.sort || "newest";
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize || 20));

  // 1. Aggregate per-user library and review counts
  const activityRows = await db
    .select({
      userId: userMediaLogs.userId,
      library: count(userMediaLogs.id),
      reviews: sql<number>`count(case when ${userMediaLogs.reviewText} is not null and trim(${userMediaLogs.reviewText}) != '' then 1 end)`,
      ratings: count(userMediaLogs.rating),
    })
    .from(userMediaLogs)
    .groupBy(userMediaLogs.userId);

  const activityMap = new Map<string, { library: number; reviews: number; ratings: number }>();
  for (const r of activityRows) {
    activityMap.set(r.userId, {
      library: Number(r.library),
      reviews: Number(r.reviews),
      ratings: Number(r.ratings),
    });
  }

  // 2. Query profiles joined with auth.users
  const conditions = [];

  if (q) {
    conditions.push(
      or(
        ilike(profiles.username, `%${q}%`),
        ilike(profiles.fullName, `%${q}%`),
        ilike(authUsers.email, `%${q}%`)
      )
    );
  }

  if (status && status !== "all") {
    conditions.push(eq(profiles.status, status));
  }

  if (role && role !== "all") {
    conditions.push(eq(profiles.role, role));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      fullName: profiles.fullName,
      avatarUrl: profiles.avatarUrl,
      role: profiles.role,
      status: profiles.status,
      statusReason: profiles.statusReason,
      statusUpdatedAt: profiles.statusUpdatedAt,
      createdAt: profiles.createdAt,
      email: authUsers.email,
      lastSignInAt: authUsers.updatedAt,
    })
    .from(profiles)
    .leftJoin(authUsers, eq(profiles.id, authUsers.id))
    .where(whereClause);

  const mapped: AdminUserListItem[] = rows.map((r) => {
    const act = activityMap.get(r.id) || { library: 0, reviews: 0, ratings: 0 };
    const provider = "email";
    return {
      id: r.id,
      username: r.username,
      fullName: r.fullName,
      avatarUrl: r.avatarUrl,
      role: r.role,
      status: (r.status as "active" | "suspended" | "banned") || "active",
      statusReason: r.statusReason,
      statusUpdatedAt: r.statusUpdatedAt,
      createdAt: r.createdAt,
      email: r.email,
      lastSignInAt: r.lastSignInAt,
      provider,
      library: act.library,
      reviews: act.reviews,
      ratings: act.ratings,
    };
  });

  // 3. Sorting
  if (sort === "oldest") {
    mapped.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  } else if (sort === "name") {
    mapped.sort((a, b) =>
      (a.fullName || a.username).localeCompare(b.fullName || b.username)
    );
  } else if (sort === "activity") {
    mapped.sort((a, b) => b.library - a.library);
  } else if (sort === "reviews") {
    mapped.sort((a, b) => b.reviews - a.reviews);
  } else {
    // Default newest
    mapped.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const total = mapped.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paginated = mapped.slice((page - 1) * pageSize, page * pageSize);

  return {
    users: paginated,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export interface AdminUserDetail {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  backdropUrl: string | null;
  bio: string | null;
  preferredCountry: string;
  isPublic: boolean;
  role: string;
  status: "active" | "suspended" | "banned";
  statusReason: string | null;
  statusUpdatedAt: Date | null;
  statusUpdatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  email: string | null;
  lastSignInAt: Date | null;
  provider: string | null;
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const [row] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      fullName: profiles.fullName,
      avatarUrl: profiles.avatarUrl,
      backdropUrl: profiles.backdropUrl,
      bio: profiles.bio,
      preferredCountry: profiles.preferredCountry,
      isPublic: profiles.isPublic,
      role: profiles.role,
      status: profiles.status,
      statusReason: profiles.statusReason,
      statusUpdatedAt: profiles.statusUpdatedAt,
      statusUpdatedBy: profiles.statusUpdatedBy,
      createdAt: profiles.createdAt,
      updatedAt: profiles.updatedAt,
      email: authUsers.email,
      lastSignInAt: authUsers.updatedAt,
    })
    .from(profiles)
    .leftJoin(authUsers, eq(profiles.id, authUsers.id))
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!row) return null;

  const provider = "email";

  return {
    ...row,
    status: (row.status as "active" | "suspended" | "banned") || "active",
    provider,
  };
}

export interface AdminAuditLogRow {
  id: string;
  adminId: string;
  adminName: string;
  adminUsername: string;
  targetUserId: string;
  action: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export async function getUserAuditLogs(userId: string): Promise<AdminAuditLogRow[]> {
  const rows = await db
    .select({
      id: adminAuditLogs.id,
      adminId: adminAuditLogs.adminId,
      adminName: profiles.fullName,
      adminUsername: profiles.username,
      targetUserId: adminAuditLogs.targetUserId,
      action: adminAuditLogs.action,
      reason: adminAuditLogs.reason,
      metadata: adminAuditLogs.metadata,
      createdAt: adminAuditLogs.createdAt,
    })
    .from(adminAuditLogs)
    .leftJoin(profiles, eq(adminAuditLogs.adminId, profiles.id))
    .where(eq(adminAuditLogs.targetUserId, userId))
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    adminId: r.adminId,
    adminName: r.adminName || r.adminUsername || "Admin",
    adminUsername: r.adminUsername || "admin",
    targetUserId: r.targetUserId,
    action: r.action,
    reason: r.reason,
    metadata: (r.metadata as Record<string, unknown>) || null,
    createdAt: r.createdAt,
  }));
}
