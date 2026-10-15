import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  });

  // Clear any legacy Supabase cookies to prevent stale auth conflicts
  request.cookies.getAll().forEach((c) => {
    if (c.name.startsWith("sb-")) {
      supabaseResponse.cookies.delete(c.name);
    }
  });

  // Check Better-Auth session cookie
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.includes("better-auth.session_token"));

  if (!hasAuthCookie) {
    return { supabaseResponse, user: null };
  }

  // Authoritative session verification runs in Server Components / Actions.
  return { supabaseResponse, user: { authenticated: true } };
}
