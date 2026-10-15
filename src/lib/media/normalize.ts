import { getTmdbImageUrl } from "../tmdb/client";

export interface NormalizedMedia {
  id: string; // 'tmdb:movie:123', 'tmdb:tv:456', 'anilist:789'
  source: "tmdb" | "anilist";
  sourceId: string;
  mediaType: "movie" | "series" | "anime";
  title: string;
  originalTitle?: string;
  posterPath: string | null;
  backdropPath?: string | null;
  releaseDate?: string;
  year?: string;
  endYear?: string;
  status?: string;
  rating: number; // 0.0 - 10.0 scale
  totalEpisodes: number;
  runtime?: number; // in minutes
  genres: string[];
  synopsis?: string;
  streamingProviders?: Record<
    string,
    {
      link?: string;
      flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
      rent?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
      buy?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
      ads?: Array<{ provider_id: number; provider_name: string; logo_path: string }>;
    }
  >;
  popularity?: number;
}

export const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

export function isTmdbAnime(item: any): boolean {
  if (!item) return false;

  const hasAnimationGenre =
    item.genre_ids?.includes(16) ||
    item.genres?.some(
      (g: any) =>
        (typeof g === "string" && g.toLowerCase() === "animation") ||
        g?.id === 16 ||
        g?.name?.toLowerCase() === "animation"
    );

  const hasAnimeGenre = item.genres?.some(
    (g: any) =>
      (typeof g === "string" && g.toLowerCase() === "anime") ||
      g?.name?.toLowerCase() === "anime"
  );

  if (hasAnimeGenre) return true;
  if (!hasAnimationGenre) return false;

  // Japanese origin indicator
  const isJp =
    item.original_language === "ja" ||
    item.origin_country?.some(
      (c: any) => (typeof c === "string" ? c.toUpperCase() === "JP" : c?.iso_3166_1 === "JP")
    ) ||
    item.production_countries?.some(
      (c: any) => (typeof c === "string" ? c.toUpperCase() === "JP" : c?.iso_3166_1 === "JP")
    );

  return Boolean(isJp);
}

export function normalizeTmdbMovie(item: any): NormalizedMedia {
  const releaseDate = item.release_date || "";
  const year = releaseDate ? releaseDate.slice(0, 4) : undefined;
  const rating = item.vote_average ? Number(item.vote_average.toFixed(1)) : 0;
  const isAnime = isTmdbAnime(item);
  const mediaType = isAnime ? "anime" : "movie";

  const rawGenres = Array.from(
    new Set([
      ...(item.genres?.map((g: any) => g.name || g) || []),
      ...(item.genre_ids?.map((id: number) => TMDB_GENRE_MAP[id]).filter(Boolean) || []),
    ])
  );
  if (isAnime && !rawGenres.some((g) => g.toLowerCase() === "anime")) {
    rawGenres.unshift("Anime");
  }

  return {
    id: `tmdb:movie:${item.id}`,
    source: "tmdb",
    sourceId: String(item.id),
    mediaType,
    title: item.title || item.original_title || "Untitled",
    originalTitle: item.original_title,
    posterPath: getTmdbImageUrl(item.poster_path, "w500"),
    backdropPath: item.backdrop_path ? getTmdbImageUrl(item.backdrop_path, "w1280") : null,
    releaseDate,
    year,
    rating,
    totalEpisodes: 1,
    runtime: item.runtime || undefined,
    genres: rawGenres,
    synopsis: item.overview,
    streamingProviders: item["watch/providers"]?.results || {},
    popularity: typeof item.popularity === "number" ? item.popularity : 0,
  };
}

export function normalizeTmdbTV(item: any): NormalizedMedia {
  const releaseDate = item.first_air_date || "";
  const year = releaseDate ? releaseDate.slice(0, 4) : undefined;
  const endYear = item.last_air_date ? item.last_air_date.slice(0, 4) : undefined;
  const rating = item.vote_average ? Number(item.vote_average.toFixed(1)) : 0;
  const isAnime = isTmdbAnime(item);
  const mediaType = isAnime ? "anime" : "series";

  const rawGenres = Array.from(
    new Set([
      ...(item.genres?.map((g: any) => g.name || g) || []),
      ...(item.genre_ids?.map((id: number) => TMDB_GENRE_MAP[id]).filter(Boolean) || []),
    ])
  );
  if (isAnime && !rawGenres.some((g) => g.toLowerCase() === "anime")) {
    rawGenres.unshift("Anime");
  }

  return {
    id: `tmdb:tv:${item.id}`,
    source: "tmdb",
    sourceId: String(item.id),
    mediaType,
    title: item.name || item.original_name || "Untitled",
    originalTitle: item.original_name,
    posterPath: getTmdbImageUrl(item.poster_path, "w500"),
    backdropPath: item.backdrop_path ? getTmdbImageUrl(item.backdrop_path, "w1280") : null,
    releaseDate,
    year,
    endYear,
    status: item.status,
    rating,
    totalEpisodes: item.number_of_episodes || 1,
    runtime: item.episode_run_time?.[0] || item.last_episode_to_air?.runtime || 45,
    genres: rawGenres,
    synopsis: item.overview,
    streamingProviders: item["watch/providers"]?.results || {},
    popularity: typeof item.popularity === "number" ? item.popularity : 0,
  };
}

export function normalizeAniListAnime(item: any): NormalizedMedia {
  const title = item.title?.english || item.title?.romaji || item.title?.native || "Untitled";
  const year = item.startDate?.year ? String(item.startDate.year) : undefined;
  const rating = item.averageScore ? Number((item.averageScore / 10).toFixed(1)) : 0;

  return {
    id: `anilist:${item.id}`,
    source: "anilist",
    sourceId: String(item.id),
    mediaType: "anime",
    title,
    originalTitle: item.title?.native || item.title?.romaji,
    posterPath: item.coverImage?.extraLarge || item.coverImage?.large || null,
    backdropPath: item.bannerImage || null,
    releaseDate: year ? `${year}-01-01` : undefined,
    year,
    rating,
    totalEpisodes: item.episodes || 1,
    runtime: item.duration || undefined,
    genres: item.genres || [],
    synopsis: item.description?.replace(/<[^>]*>/g, ""), // strip raw HTML tags
    popularity: typeof item.popularity === "number" ? item.popularity : 0,
  };
}
