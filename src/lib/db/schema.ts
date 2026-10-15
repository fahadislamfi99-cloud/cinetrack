import {
  pgTable,
  pgSchema,
  text,
  uuid,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Better-Auth Core Tables
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Alias for admin inspection queries
export const authUsers = user;

// 1. Profiles Table
export const profiles = pgTable(

  "profiles",
  {
    id: uuid("id").primaryKey(),
    username: text("username").notNull().unique(),
    fullName: text("full_name"),
    avatarUrl: text("avatar_url"),
    backdropUrl: text("backdrop_url"),
    bio: text("bio"),
    preferredCountry: text("preferred_country").default("US").notNull(),
    isPublic: boolean("is_public").default(true).notNull(),
    role: text("role").default("user").notNull(),
    status: text("status").default("active").notNull(), // 'active' | 'suspended' | 'banned'
    statusReason: text("status_reason"),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    statusUpdatedBy: uuid("status_updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("profiles_username_idx").on(table.username)]
);

// 2. Media Items Table (Metadata cache)
export const mediaItems = pgTable(
  "media_items",
  {
    id: text("id").primaryKey(), // 'tmdb:movie:123', 'tmdb:tv:456', 'anilist:789'
    source: text("source").notNull(), // 'tmdb' | 'anilist'
    sourceId: text("source_id").notNull(),
    mediaType: text("media_type").notNull(), // 'movie' | 'series' | 'anime'
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    posterPath: text("poster_path"),
    backdropPath: text("backdrop_path"),
    releaseDate: text("release_date"),
    rating: numeric("rating", { precision: 3, scale: 1 }),
    totalEpisodes: integer("total_episodes").default(1),
    runtime: integer("runtime"), // in minutes
    genres: text("genres").array().default([]),
    streamingProviders: jsonb("streaming_providers").default({}),
    synopsis: text("synopsis"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("media_source_idx").on(table.source, table.sourceId),
  ]
);

// 3. User Tracking Logs & Reviews Table
export const userMediaLogs = pgTable(
  "user_media_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    mediaId: text("media_id")
      .references(() => mediaItems.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").notNull(), // 'watching' | 'completed' | 'plan_to_watch' | 'on_hold' | 'dropped'
    rating: text("rating"), // 'poor' | 'average' | 'good' | 'great' | 'masterpiece' | null
    episodesWatched: integer("episodes_watched").default(0).notNull(),
    currentSeason: integer("current_season").default(1),
    currentEpisode: integer("current_episode").default(1),
    reviewText: text("review_text"),
    containsSpoilers: boolean("contains_spoilers").default(false).notNull(),
    isFavorite: boolean("is_favorite").default(false).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_media_unique_idx").on(table.userId, table.mediaId),
    index("user_media_completed_at_idx").on(table.completedAt),
    index("user_media_user_updated_idx").on(table.userId, table.updatedAt),
    index("user_media_media_id_idx").on(table.mediaId),
  ]
);

// 4. Feature Requests (product feedback management)
export const featureRequests = pgTable(
  "feature_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    email: text("email"),
    category: text("category").default("feature").notNull(), // 'feature' | 'bug' | 'general'
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").default("new").notNull(), // 'new' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined'
    priority: text("priority").default("medium").notNull(), // 'low' | 'medium' | 'high'
    adminNotes: text("admin_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("feature_requests_status_idx").on(table.status),
    index("feature_requests_created_idx").on(table.createdAt),
  ]
);

// 5. Review Reactions (Likes on user reviews)
export const reviewReactions = pgTable(
  "review_reactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reviewId: uuid("review_id")
      .references(() => userMediaLogs.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").default("like").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("review_reactions_user_unique_idx").on(
      table.reviewId,
      table.userId,
      table.type
    ),
    index("review_reactions_review_idx").on(table.reviewId),
  ]
);

// 6. User Notifications
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    actorId: uuid("actor_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(), // 'review_reaction' | 'system'
    title: text("title").notNull(),
    message: text("message").notNull(),
    link: text("link"),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId),
    index("notifications_is_read_idx").on(table.userId, table.isRead),
    index("notifications_created_idx").on(table.createdAt),
  ]
);

// 7. Rate Limits (Distributed serverless rate limiting)
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").default(1).notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limits_reset_at_idx").on(table.resetAt)]
);

// 8. Admin Audit Logs (Action tracking for user moderation & changes)
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    targetUserId: uuid("target_user_id")
      .references(() => profiles.id, { onDelete: "cascade" })
      .notNull(),
    action: text("action").notNull(), // 'suspend_user' | 'restore_user' | 'ban_user' | 'unban_user' | 'role_change'
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("admin_audit_logs_target_idx").on(table.targetUserId),
    index("admin_audit_logs_created_idx").on(table.createdAt),
  ]
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
export type UserMediaLog = typeof userMediaLogs.$inferSelect;
export type NewUserMediaLog = typeof userMediaLogs.$inferInsert;
export type FeatureRequest = typeof featureRequests.$inferSelect;
export type NewFeatureRequest = typeof featureRequests.$inferInsert;
export type ReviewReaction = typeof reviewReactions.$inferSelect;
export type NewReviewReaction = typeof reviewReactions.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;



