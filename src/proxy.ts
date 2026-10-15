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
    // Fast path: authenticated user visiting /library immediately renders their library (zero-hop rewrite)
    if (pathname === "/library") {
      const rawCookie = request.cookies.get("cinetrack_username")?.value;
      const cachedUsername = rawCookie ? decodeURIComponent(rawCookie).trim() : null;
      if (cachedUsername && !cachedUsername.includes(" ") && /^[a-zA-Z0-9_.-]+$/.test(cachedUsername)) {
        const targetUrl = request.nextUrl.clone();
        targetUrl.pathname = `/u/${cachedUsername}`;
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-internal-profile-rewrite", "1");
        const rewriteResponse = NextResponse.rewrite(targetUrl, {
          request: { headers: requestHeaders },
        });
        copyCookies(supabaseResponse, rewriteResponse);
        return rewriteResponse;
      }
    }

    // Authenticated users visiting /login get redirected to library only if not explicitly bounced with ?next=
    if (pathname === "/login") {
      const hasNext = request.nextUrl.searchParams.has("next");
      if (!hasNext) {
        const rawCookie = request.cookies.get("cinetrack_username")?.value;
        const cachedUsername = rawCookie ? decodeURIComponent(rawCookie).trim() : null;
        const validUsername =
          cachedUsername && !cachedUsername.includes(" ") && /^[a-zA-Z0-9_.-]+$/.test(cachedUsername)
            ? cachedUsername
            : null;
        const targetUrl = new URL(validUsername ? `/${validUsername}` : "/library", request.url);
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

  // 4. Redirect paths with spaces or unencoded characters to clean slug (e.g. /Fahad%20Islam -> /fahadislam)
  const decodedPath = decodeURIComponent(pathname);
  if (decodedPath.includes(" ")) {
    const cleanSlug = decodedPath.slice(1).toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (cleanSlug && !RESERVED_ROUTES.has(cleanSlug)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${cleanSlug}`;
      const redirectResponse = NextResponse.redirect(url, 308);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
  }

  // 5. Handle vanity profile URL: /username -> /u/username (internal rewrite)
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
