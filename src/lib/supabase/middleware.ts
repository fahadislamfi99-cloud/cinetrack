import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  });

  // Check Better-Auth session cookie or legacy Supabase cookie
  const hasAuthCookie = request.cookies
    .getAll()
    .some(
      (c) =>
        c.name.includes("better-auth.session_token") ||
        (c.name.startsWith("sb-") && c.name.includes("auth-token"))
    );

  if (!hasAuthCookie) {
    return { supabaseResponse, user: null };
  }

  // Authoritative session verification runs in Server Components / Actions.
  return { supabaseResponse, user: { authenticated: true } };
}
