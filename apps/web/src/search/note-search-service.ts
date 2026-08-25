import type { NoteSearchResult } from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * SEARCH-006 — private note search feature service.
 *
 * Calls the existing authenticated `/notes/search` route rather than a second
 * notes-search API. The Knowledge and Notes Engine remains authoritative for
 * note authorization; Search only composes what that source already returns.
 *
 * It sends **no identity**. There is no `userId`, `ownerId`, `studentId` or
 * `learnerId` parameter, and there never may be: the server derives the caller
 * from the authenticated session and PostgreSQL row level security decides
 * which note rows exist for that caller. A request parameter naming an owner
 * would be a second ownership mechanism beside the policy.
 */
export async function searchMyNotes(
  accessToken: string,
  options: { query: string; limit?: number; signal?: AbortSignal }
): Promise<NoteSearchResult[]> {
  const payload = await apiRequest<{ results: NoteSearchResult[] }>(
    accessToken,
    "/notes/search",
    {
      query: {
        q: options.query,
        ...(options.limit ? { limit: String(options.limit) } : {})
      },
      ...(options.signal ? { signal: options.signal } : {})
    }
  );

  return payload.results ?? [];
}
