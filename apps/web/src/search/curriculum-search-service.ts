import type { CurriculumSearchResults } from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * SEARCH-002 — curriculum search feature service.
 *
 * Follows the repository's service-module convention: the component calls this,
 * this calls the generic API client, and no component builds a request or a
 * bearer header itself.
 *
 * It sends no identity. The server derives the caller from the authenticated
 * session, and PostgreSQL row level security decides what that caller can see.
 */
export async function searchCurriculum(
  accessToken: string,
  options: { query: string; limit?: number; signal?: AbortSignal }
): Promise<CurriculumSearchResults> {
  return apiRequest<CurriculumSearchResults>(accessToken, "/search/curriculum", {
    query: {
      q: options.query,
      ...(options.limit ? { limit: String(options.limit) } : {})
    },
    ...(options.signal ? { signal: options.signal } : {})
  });
}
