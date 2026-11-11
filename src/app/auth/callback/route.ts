import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRedirect } from "@/lib/security";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notifyNewUserRegistration } from "@/lib/telegram";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeRedirect(searchParams.get("next"), "/library");

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") || host.includes("127.0.0.1") || host.includes("192.168.") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  const supabase = await createClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error && user) {
    try {
      const [existing] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, user.id))
        .limit(1);

      if (!existing) {
        notifyNewUserRegistration({
          email: user.email,
          method: "Google OAuth",
        }).catch(() => {});
      }
    } catch (err) {
      console.error("OAuth registration check error:", err);
    }

    // Profile will be configured through Profile Setup popup if not already present
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Return the user to login with error query param
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
