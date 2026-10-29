import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cinetrack.xyz";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/discover",
          "/about",
          "/contact",
          "/terms",
          "/privacy",
          "/feedback",
          "/movie/",
          "/series/",
          "/anime/",
          "/u/",
          "/.well-known/",
          "/ai-catalog.json",
          "/agent-card.json",
        ],
        disallow: ["/admin/", "/api/", "/settings/", "/auth/", "/login"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
