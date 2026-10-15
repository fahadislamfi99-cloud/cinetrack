import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import bcrypt from "bcryptjs";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    password: {
      verify: async ({ password, hash }) => {
        // Support legacy Supabase bcrypt password hashes
        if (
          hash.startsWith("$2a$") ||
          hash.startsWith("$2b$") ||
          hash.startsWith("$2y$")
        ) {
          return bcrypt.compare(password, hash);
        }
        // Fallback to bcrypt
        return bcrypt.compare(password, hash).catch(() => false);
      },
      hash: async (password) => {
        return bcrypt.hash(password, 10);
      },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
  },
  secret:
    process.env.BETTER_AUTH_SECRET ||
    "e4f5a3b92d6e492b95fa110d7a6e12a95c3b99ef01a8c432d78e3c1a99f16d2b",
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    undefined,
});
