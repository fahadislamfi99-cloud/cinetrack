import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { sanitizeRedirect } from "@/lib/security";

const RESERVED_ROUTES = new Set([
  "api",
  "_next",
  "auth",
  "admin",
  "discover",
  "landing",
  "library",
  "login",
  "profile",
  "search",
  "u",
  "movie",
  "series",
  "anime",
  "tv",
  "about",
  "contact",
  "feedback",
  "terms",
  "privacy",
  "settings",
  "home",
]);

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie);
  });
}

export default async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // 1. Guarded routes: /library, /profile, /settings, and /admin require authentication
  if (!user) {
    if (pathname === "/library" || pathname.startsWith("/library/")) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
      const redirectResponse = NextResponse.redirect(loginUrl);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }

    if (pathname === "/profile" || pathname.startsWith("/profile/")) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "?next=/profile";
      const redirectResponse = NextResponse.redirect(loginUrl);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }

    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
      const redirectResponse = NextResponse.redirect(loginUrl);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }

    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
      const redirectResponse = NextResponse.redirect(loginUrl);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
  } else {
    // Fast path: authenticated user visiting /library redirects directly to their vanity handle
    if (pathname === "/library") {
      const cachedUsername = request.cookies.get("cinetrack_username")?.value;
      if (cachedUsername) {
        const targetUrl = request.nextUrl.clone();
        targetUrl.pathname = `/${cachedUsername}`;
        const redirectResponse = NextResponse.redirect(targetUrl, 307);
        copyCookies(supabaseResponse, redirectResponse);
        return redirectResponse;
      }
    }

    // Authenticated users visiting /login get redirected to library only if not explicitly bounced with ?next=
    if (pathname === "/login") {
      const hasNext = request.nextUrl.searchParams.has("next");
      if (!hasNext) {
        const cachedUsername = request.cookies.get("cinetrack_username")?.value;
        const targetUrl = new URL(cachedUsername ? `/${cachedUsername}` : "/library", request.url);
        const redirectResponse = NextResponse.redirect(targetUrl);
        copyCookies(supabaseResponse, redirectResponse);
        return redirectResponse;
      }
    }
  }

  // 2. Redirect legacy /u/:username to vanity /:username (e.g. cinetrack.xyz/fahadislam)
  if (pathname.startsWith("/u/") && !request.headers.has("x-internal-profile-rewrite")) {
    const username = pathname.slice(3);
    if (username && !username.includes("/")) {
      const url = request.nextUrl.clone();
      url.pathname = `/${username}`;
      const redirectResponse = NextResponse.redirect(url, 308);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
  }

  // 3. Redirect /@username to vanity /username
  if (pathname.startsWith("/@")) {
    const username = pathname.slice(2);
    if (username) {
      const url = request.nextUrl.clone();
      url.pathname = `/${username}`;
      const redirectResponse = NextResponse.redirect(url, 308);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
  }

  // 4. Handle vanity profile URL: /username -> /u/username (internal rewrite)
  const match = pathname.match(/^\/([a-zA-Z0-9_.-]+)$/);
  if (match) {
    const slug = match[1];
    // If not a reserved route and not a static file with extension
    if (!RESERVED_ROUTES.has(slug.toLowerCase()) && !slug.includes(".")) {
      const url = request.nextUrl.clone();
      url.pathname = `/u/${slug}`;
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-internal-profile-rewrite", "1");
      const rewriteResponse = NextResponse.rewrite(url, {
        request: { headers: requestHeaders },
      });
      copyCookies(supabaseResponse, rewriteResponse);
      return rewriteResponse;
    }
  }

  return supabaseResponse;
}

export { proxy };

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, svgs, etc.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
