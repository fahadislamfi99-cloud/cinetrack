import { NextResponse } from "next/server";
import { sanitizeRedirect } from "@/lib/security";
import { auth } from "@/lib/auth/auth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = sanitizeRedirect(requestUrl.searchParams.get("next"), "/library");

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(
          "Google sign in requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local"
        )}`,
        request.url
      )
    );
  }

  try {
    const origin = requestUrl.origin;
    const res = await auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: `${origin}${next}`,
      },
      asResponse: true,
    });

    const location = res.headers.get("location");
    if (location) {
      const response = NextResponse.redirect(location);

      // Preserve Set-Cookie headers for state and PKCE verification
      const setCookies =
        typeof res.headers.getSetCookie === "function"
          ? res.headers.getSetCookie()
          : [res.headers.get("set-cookie")].filter(Boolean);

      for (const cookieStr of setCookies) {
        if (cookieStr) {
          response.headers.append("set-cookie", cookieStr);
        }
      }

      return response;
    }
  } catch (err: any) {
    console.error("Google sign in error:", err);
  }

  return NextResponse.redirect(
    new URL(
      `/login?error=${encodeURIComponent("Failed to initiate Google sign in.")}`,
      request.url
    )
  );
}
