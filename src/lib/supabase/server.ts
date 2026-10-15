import { headers, cookies } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { user as userTable, account as accountTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  created_at?: string;
  last_sign_in_at?: string;
  user_metadata?: {
    user_name?: string;
    avatar_url?: string;
    full_name?: string;
    name?: string;
    [key: string]: any;
  };
  app_metadata?: {
    provider?: string;
    providers?: string[];
    [key: string]: any;
  };
  identities?: Array<{
    id: string;
    user_id: string;
    provider: string;
    identity_data?: any;
  }>;
}

/**
 * Fast authenticated user lookup that reads Better-Auth session.
 * Skips remote calls if no session cookie exists.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    const cookieStore = await cookies();
    const hasAuthCookie = cookieStore
      .getAll()
      .some(
        (c) =>
          c.name.includes("better-auth.session_token") ||
          (c.name.startsWith("sb-") && c.name.includes("auth-token"))
      );

    if (!hasAuthCookie) {
      return null;
    }

    const reqHeaders = await headers();
    const session = await auth.api.getSession({ headers: reqHeaders });
    if (!session?.user) {
      return null;
    }

    const u = session.user;
    return {
      id: u.id,
      email: u.email,
      name: u.name || undefined,
      image: u.image || undefined,
      created_at: u.createdAt
        ? new Date(u.createdAt).toISOString()
        : new Date().toISOString(),
      last_sign_in_at: u.updatedAt
        ? new Date(u.updatedAt).toISOString()
        : new Date().toISOString(),
      user_metadata: {
        user_name: u.name || undefined,
        name: u.name || undefined,
        full_name: u.name || undefined,
        avatar_url: u.image || undefined,
      },
      app_metadata: {
        provider: "email",
        providers: ["email"],
      },
      identities: [
        {
          id: u.id,
          user_id: u.id,
          provider: "email",
        },
      ],
    };
  } catch (err: any) {
    if (err?.digest === "DYNAMIC_SERVER_USAGE" || err?.message?.includes("Dynamic server usage")) {
      throw err;
    }
    console.error("getCurrentUser error:", err);
    return null;
  }
}

/**
 * Server shim maintaining Supabase auth client signature
 * while backed by Better-Auth and native PostgreSQL.
 */
export async function createClient() {
  const user = await getCurrentUser();

  return {
    auth: {
      getUser: async (): Promise<{ data: { user: AuthenticatedUser | null }; error: Error | null }> => ({
        data: { user },
        error: user ? null : new Error("Not authenticated"),
      }),
      getSession: async (): Promise<{ data: { session: any }; error: Error | null }> => ({
        data: { session: user ? { user, access_token: "ba-session" } : null },
        error: user ? null : new Error("No session"),
      }),
      signOut: async (): Promise<{ error: Error | null }> => ({ error: null }),
      signInWithPassword: async ({
        email,
        password,
      }: {
        email: string;
        password: string;
      }): Promise<{ data: any; error: Error | null }> => {
        try {
          const res = await auth.api.signInEmail({
            body: { email, password },
          });
          return { data: res, error: null };
        } catch (err: any) {
          return {
            data: null,
            error: err instanceof Error ? err : new Error(String(err?.message || "Invalid credentials")),
          };
        }
      },
      updateUser: async (updates: {
        email?: string;
        password?: string;
        data?: Record<string, any>;
      }): Promise<{ data: { user: AuthenticatedUser | null } | null; error: Error | null }> => {
        if (!user) return { data: null, error: new Error("Not authenticated") };
        try {
          const userUpdates: Partial<typeof userTable.$inferInsert> = {};
          if (updates.email) userUpdates.email = updates.email;
          if (updates.data?.name) userUpdates.name = updates.data.name;
          if (updates.data?.user_name) userUpdates.name = updates.data.user_name;
          if (updates.data?.avatar_url) userUpdates.image = updates.data.avatar_url;

          if (Object.keys(userUpdates).length > 0) {
            await db
              .update(userTable)
              .set(userUpdates)
              .where(eq(userTable.id, user.id));
          }

          if (updates.password) {
            const hashed = await bcrypt.hash(updates.password, 10);
            await db
              .update(accountTable)
              .set({ password: hashed })
              .where(
                and(
                  eq(accountTable.userId, user.id),
                  eq(accountTable.providerId, "credential")
                )
              );
          }

          return { data: { user }, error: null };
        } catch (err: any) {
          return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
      },
      exchangeCodeForSession: async (_code: string): Promise<{ data: { user: AuthenticatedUser | null }; error: Error | null }> => ({
        data: { user },
        error: null,
      }),
      signInWithOAuth: async (_params: any): Promise<{ data: { url: string } | null; error: Error | null }> => ({
        data: { url: "/api/auth/sign-in/social?provider=google" },
        error: null,
      }),
    },
  };
}
