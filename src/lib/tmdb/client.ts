const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function getTmdbImageUrl(
  path: string | null | undefined,
  size: "w300" | "w500" | "w780" | "w1280" | "original" = "w500"
): string | null {
  if (!path || path === "null" || path === "undefined" || path.trim() === "" || path.includes("placeholder-")) {
    return null;
  }
  if (path.startsWith("http")) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchTmdb<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.append(key, value);
  });

  const headers: HeadersInit = {
    accept: "application/json",
  };

  if (process.env.TMDB_READ_ACCESS_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}`;
  } else if (process.env.TMDB_API_KEY) {
    url.searchParams.append("api_key", process.env.TMDB_API_KEY);
  } else {
    console.warn(`[TMDb] Warning: TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY is not configured in .env.local. Request to ${endpoint} will fail.`);
  }

  const res = await fetch(url.toString(), {
    headers,
    next: { revalidate: 3600 }, // 1 hour edge cache
  });

  if (!res.ok) {
    throw new Error(`TMDb API Error: ${res.status} ${res.statusText} at ${endpoint}`);
  }

  return res.json();
}

export interface TmdbMovieItem {
  id: number;
  title: string;
  original_title?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  vote_average: number;
  overview?: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
}

export interface TmdbTVItem {
  id: number;
  name: string;
  original_name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date?: string;
  vote_average: number;
  overview?: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  number_of_episodes?: number;
  episode_run_time?: number[];
}

export interface TmdbWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

const TMDB_VIDEO_LANGUAGES =
  "en,ta,te,hi,ml,kn,bn,mr,pa,gu,ja,ko,zh,cn,yue,th,vi,id,ms,tl,es,fr,de,it,pt,ru,uk,pl,nl,sv,no,da,fi,el,tr,ar,he,fa,ur,ro,hu,cs,sk,sl,bg,hr,sr,is,et,lt,lv,ca,null";

export const tmdb = {
  getTrendingMovies: async (timeWindow: "day" | "week" = "week") => {
    return fetchTmdb<{ results: TmdbMovieItem[] }>(`/trending/movie/${timeWindow}`);
  },

  getTrendingTV: async (timeWindow: "day" | "week" = "week") => {
    return fetchTmdb<{ results: TmdbTVItem[] }>(`/trending/tv/${timeWindow}`);
  },

  getPopularMovies: async () => {
    return fetchTmdb<{ results: TmdbMovieItem[] }>("/movie/popular");
  },

  getMovieDetails: async (id: number | string) => {
    return fetchTmdb<any>(`/movie/${id}`, {
      append_to_response: "videos,credits,watch/providers,similar,external_ids",
      include_video_language: TMDB_VIDEO_LANGUAGES,
    });
  },

  getTVDetails: async (id: number | string) => {
    return fetchTmdb<any>(`/tv/${id}`, {
      append_to_response: "videos,credits,watch/providers,similar,external_ids",
      include_video_language: TMDB_VIDEO_LANGUAGES,
    });
  },

  searchMulti: async (query: string, page: number = 1) => {
    return fetchTmdb<{ results: any[]; page?: number; total_pages?: number; total_results?: number }>("/search/multi", {
      query,
      include_adult: "false",
      page: String(page),
    });
  },

  searchMovies: async (query: string, page: number = 1) => {
    return fetchTmdb<{ results: TmdbMovieItem[]; page?: number; total_pages?: number; total_results?: number }>("/search/movie", {
      query,
      include_adult: "false",
      page: String(page),
    });
  },

  searchTV: async (query: string, page: number = 1) => {
    return fetchTmdb<{ results: TmdbTVItem[]; page?: number; total_pages?: number; total_results?: number }>("/search/tv", {
      query,
      include_adult: "false",
      page: String(page),
    });
  },

  discoverMovies: async (params: Record<string, string> = {}) => {
    return fetchTmdb<{ results: TmdbMovieItem[] }>("/discover/movie", params);
  },

  discoverTV: async (params: Record<string, string> = {}) => {
    return fetchTmdb<{ results: TmdbTVItem[] }>("/discover/tv", params);
  },
};
