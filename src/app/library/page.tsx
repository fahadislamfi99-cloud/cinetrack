import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface LibraryPageProps {
  searchParams: Promise<{
    status?: string;
    type?: string;
  }>;
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/library");
  }

  const resolvedParams = await searchParams;
  const query = new URLSearchParams();
  if (resolvedParams.status && resolvedParams.status !== "all") {
    query.set("status", resolvedParams.status);
  }
  if (resolvedParams.type && resolvedParams.type !== "all") {
    query.set("type", resolvedParams.type);
  }
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";

  let targetUsername: string | null = null;
  try {
    const profileRows = await db
      .select({ username: profiles.username })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

    if (profileRows.length > 0 && profileRows[0].username) {
      targetUsername = profileRows[0].username;
    } else {
      const baseSlug = (
        user.user_metadata?.user_name ||
        user.email?.split("@")[0] ||
        user.name ||
        "user"
      )
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 15) || "user";

      let candidateSlug = baseSlug;
      let counter = 1;
      while (true) {
        const existing = await db
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.username, candidateSlug))
          .limit(1);
        if (existing.length === 0) break;
        candidateSlug = `${baseSlug.slice(0, 12)}${counter}`;
        counter++;
      }

      await db
        .insert(profiles)
        .values({
          id: user.id,
          username: candidateSlug,
          fullName: user.user_metadata?.full_name || user.name || user.email?.split("@")[0],
          avatarUrl: user.user_metadata?.avatar_url || user.image,
          preferredCountry: "US",
        })
        .onConflictDoNothing();

      targetUsername = candidateSlug;
    }
  } catch (err) {
    console.error("Library redirect error:", err);
  }

  const cookieStore = await cookies();

  if (targetUsername) {
    try {
      cookieStore.set("cinetrack_username", targetUsername, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    } catch {}
    redirect(`/${targetUsername}${suffix}`);
  }

  const rawFallback = user.user_metadata?.user_name || user.email?.split("@")[0];
  const fallbackUsername = rawFallback ? rawFallback.toLowerCase().replace(/[^a-z0-9_]/g, "") : null;
  if (fallbackUsername) {
    try {
      cookieStore.set("cinetrack_username", fallbackUsername, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    } catch {}
    redirect(`/${fallbackUsername}${suffix}`);
  }

  redirect(`/profile${suffix}`);
}
