import { unstable_cache } from "next/cache";

/**
 * Lightweight IMDb GraphQL client for title enrichment.
 * Wrapped in unstable_cache because Next.js fetch cache does not cache POST requests on dynamic routes.
 */
const fetchImdbGenresCached = unstable_cache(
  async (imdbId: string): Promise<string[]> => {
    try {
      const query = {
        query: `query GetTitleGenres($id: ID!) {
          title(id: $id) {
            genres {
              genres {
                text
              }
            }
          }
        }`,
        variables: { id: imdbId },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);

      const res = await fetch("https://api.graphql.imdb.com/", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-imdb-client-name": "imdb-web-next",
        },
        body: JSON.stringify(query),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return [];
      const json = await res.json();
      const genres = json.data?.title?.genres?.genres?.map((g: any) => g.text) || [];
      return genres;
    } catch {
      return [];
    }
  },
  ["imdb-genres-v1"],
  { revalidate: 86400 }
);

export async function getImdbGenres(imdbId: string): Promise<string[]> {
  if (!imdbId) return [];
  return fetchImdbGenresCached(imdbId);
}
