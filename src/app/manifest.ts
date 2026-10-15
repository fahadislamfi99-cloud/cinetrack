import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CineTrack · Cinema & TV Tracker",
    short_name: "CineTrack",
    description: "Track, rate, and discover movies, series, and anime with a worldwide community.",
    start_url: "/library",
    scope: "/",
    id: "/",
    display: "standalone",
    background_color: "#0F141D",
    theme_color: "#0F141D",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    categories: ["entertainment", "movies", "social"],
  };
}
