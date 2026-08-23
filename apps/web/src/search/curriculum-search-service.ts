import type {
  CurriculumSearchContentType,
  CurriculumSearchFacetedResults
} from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * SEARCH-002 — curriculum search feature service.
 * SEARCH-004 — content-type filtering.
 *
 * Follows the repository's service-module convention: the component calls this,
 * this calls the generic API client, and no component builds a request or a
 * bearer header itself.
 *
 * It sends no identity. The server derives the caller from the authenticated
 * session, and PostgreSQL row level security decides what that caller can see.
 *
 * The filter is sent as repeated `contentType` values and nothing else — no
 * free-form filter object, no arbitrary field name, no internal identifier. The
 * server validates the vocabulary; the browser is not trusted to enforce it.
 */
export async function searchCurriculum(
  accessToken: string,
  options: {
    query: string;
    limit?: number;
    contentTypes?: readonly CurriculumSearchContentType[];
    signal?: AbortSignal;
  }
): Promise<CurriculumSearchFacetedResults> {
  return apiRequest<CurriculumSearchFacetedResults>(
    accessToken,
    "/search/curriculum",
    {
      query: {
        q: options.query,
        ...(options.limit ? { limit: String(options.limit) } : {}),
        ...(options.contentTypes && options.contentTypes.length > 0
          ? { contentType: [...options.contentTypes] }
          : {})
      },
      ...(options.signal ? { signal: options.signal } : {})
    }
  );
}
