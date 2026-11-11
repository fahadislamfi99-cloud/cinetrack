import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AppHeader } from "@/components/navigation/app-header";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Footer } from "@/components/navigation/footer";
import { LibraryView } from "@/components/library/library-view";

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

  let targetUsername: string | null = user.user_metadata?.user_name || null;
  if (!targetUsername) {
    try {
      const profileRows = await db
        .select({ username: profiles.username })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);

      if (
        profileRows.length > 0 &&
        profileRows[0].username &&
        !profileRows[0].username.startsWith("temp_pending_")
      ) {
        targetUsername = profileRows[0].username;
      }
    } catch (err) {
      console.error("Library redirect error:", err);
    }
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

  // Newly created account that hasn't completed ProfileSetupModal yet:
  // Render empty LibraryView directly on /library so ProfileSetupModal opens over it.
  const displayName =
    user.user_metadata?.full_name ||
    user.name ||
    user.email?.split("@")[0] ||
    "Curator";
  const placeholderUsername =
    user.email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9_]/g, "") || "user";

  return (
    <div className="flex-1 flex flex-col w-full min-h-screen bg-[#0F141D]">
      <AppHeader
        user={{
          id: user.id,
          username: placeholderUsername,
          displayName,
          fullName: displayName,
          email: user.email || undefined,
          avatarUrl: user.user_metadata?.avatar_url || user.image || undefined,
        }}
      />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 lg:px-12 pt-18 sm:pt-24 pb-24 md:pb-12">
        <LibraryView
          initialItems={[]}
          user={{
            id: user.id,
            username: placeholderUsername,
            displayName,
            fullName: displayName,
            email: user.email || null,
            avatarUrl: user.user_metadata?.avatar_url || user.image || null,
            backdropUrl: null,
            bio: null,
            createdAt: new Date().toISOString(),
          }}
          stats={{
            total: 0,
            movies: 0,
            series: 0,
            anime: 0,
            watching: 0,
            completed: 0,
            totalMinutes: 0,
          }}
          initialStatus={resolvedParams.status || "all"}
          initialType={resolvedParams.type || "all"}
          isOwner={true}
        />
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
