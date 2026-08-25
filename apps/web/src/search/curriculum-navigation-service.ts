import {
  buildCurriculumNavigationEntries,
  type CurriculumNavigationEntry
} from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * SEARCH-008 — structured curriculum navigation fallback.
 *
 * Calls the **existing** authenticated `GET /curriculum/paths` route. No API
 * route was added, no authorization semantics changed, and no second
 * curriculum-navigation mechanism was created: the Curriculum Engine already
 * owns this read, already restricts it to `publication_state = 'published'`, and
 * already performs it through the caller's own RLS-scoped client.
 *
 * It sends **no identity**. There is no `userId`, `ownerId`, `studentId` or
 * `learnerId` parameter and there never may be — the server derives the caller
 * from the authenticated session, and a parameter naming a learner would be a
 * second ownership mechanism beside the policy. It sends no query parameter of
 * any kind.
 *
 * The response is projected through the shared
 * `buildCurriculumNavigationEntries`, which assembles each entry by explicit
 * assignment. The internal database identifier the Curriculum contract carries
 * therefore never reaches the Search surface.
 *
 * A failure propagates as a failure. It is never converted into an empty list,
 * because "we could not load the curriculum" and "you have no curriculum" are
 * different facts and the learner must not be told the wrong one.
 */
export async function listCurriculumNavigation(
  accessToken: string,
  options: { signal?: AbortSignal } = {}
): Promise<CurriculumNavigationEntry[]> {
  const payload = await apiRequest<{
    learningPaths?: {
      stableId: string;
      title: string;
      description?: string;
    }[];
  }>(accessToken, "/curriculum/paths", {
    ...(options.signal ? { signal: options.signal } : {})
  });

  return buildCurriculumNavigationEntries(payload.learningPaths ?? []);
}
