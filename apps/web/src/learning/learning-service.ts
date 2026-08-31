import type {
  LearnerMissionInstructionResponse,
  LearningPathProgressSummary,
  LearningResumeTarget,
  PublishedLearningPathTree,
  RecommendedNextAction,
  StudentProgressRecord
} from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * ROAS-3 — the learner's Learning Engine feature service.
 *
 * Follows the repository's service-module convention: the component calls this,
 * this calls the generic API client, and no component builds a request or a
 * bearer header itself.
 *
 * **Every route here already existed.** ROAS-3 adds no API route, no server read
 * model and no server file. The Curriculum Engine already exposes published
 * curriculum, and the Learning Engine already owns progress, resume, guidance
 * and prerequisites — so the learner experience is assembled from the contracts
 * that already hold those facts rather than from a new one shaped for the UI.
 *
 * No identity is ever sent. There is no `userId`, `studentId` or `learnerId`
 * parameter and there never may be: the server derives the caller from the
 * authenticated session, and a parameter naming a learner would be a second
 * ownership mechanism beside RLS.
 *
 * Failures propagate as failures. None of these is converted into an empty
 * result, because "we could not load your progress" and "you have no progress"
 * are different facts and a learner must not be told the wrong one.
 */

/**
 * The published curriculum tree for a learning path.
 *
 * Published-only is the server's rule, not a filter applied here. A path that
 * is not published raises `NOT_FOUND`, which the presentation layer maps to its
 * own honest state rather than to an empty course.
 */
export async function loadPublishedLearningPath(
  accessToken: string,
  pathStableId: string,
  options: { signal?: AbortSignal } = {}
): Promise<PublishedLearningPathTree> {
  return apiRequest<PublishedLearningPathTree>(
    accessToken,
    `/curriculum/paths/${encodeURIComponent(pathStableId)}`,
    { ...(options.signal ? { signal: options.signal } : {}) }
  );
}

/**
 * The learner's aggregated progress for a path.
 *
 * The aggregation — per module, per course, percentage complete — is performed
 * by `aggregateLearningPathProgress` on the server. The browser reads the
 * result and never recomputes it.
 */
export async function loadLearningPathProgress(
  accessToken: string,
  pathStableId: string,
  options: { signal?: AbortSignal } = {}
): Promise<LearningPathProgressSummary> {
  return apiRequest<LearningPathProgressSummary>(
    accessToken,
    "/learning/progress",
    {
      query: { path: pathStableId },
      ...(options.signal ? { signal: options.signal } : {})
    }
  );
}

/**
 * WP-F — the instructional content of one published mission.
 *
 * The single learner-facing entry point to WP-E's read path. What comes back is
 * already projected: protected fields are absent from the response type rather
 * than filtered from it, so there is nothing for this layer to strip and nothing
 * it could accidentally forward.
 *
 * Read-only, and deliberately narrow. It takes a mission identity and no learner
 * identity — the server derives the caller from the session, as every other
 * function here does.
 *
 * Failures propagate. `instruction.state` is a different matter: a mission whose
 * authored content is invalid returns HTTP 200 carrying `content_error`, which
 * is a fact about the mission rather than a transport failure, and is classified
 * by `selectInstructionSource` alongside the error codes.
 */
export async function loadMissionInstruction(
  accessToken: string,
  missionStableId: string,
  options: { signal?: AbortSignal } = {}
): Promise<LearnerMissionInstructionResponse> {
  return apiRequest<LearnerMissionInstructionResponse>(
    accessToken,
    `/learning/missions/${encodeURIComponent(missionStableId)}/instruction`,
    { ...(options.signal ? { signal: options.signal } : {}) }
  );
}

/** Where the Learning Engine says this learner left off. */
export async function loadResumeTarget(
  accessToken: string,
  pathStableId: string,
  options: { signal?: AbortSignal } = {}
): Promise<LearningResumeTarget> {
  return apiRequest<LearningResumeTarget>(accessToken, "/learning/resume", {
    query: { path: pathStableId },
    ...(options.signal ? { signal: options.signal } : {})
  });
}

/**
 * The Learning Engine's recommended next action.
 *
 * This already folds in review state and prerequisite evaluation, which is why
 * the browser prefers it over reasoning about resume state itself.
 */
export async function loadRecommendedNextAction(
  accessToken: string,
  pathStableId: string,
  options: { signal?: AbortSignal } = {}
): Promise<RecommendedNextAction> {
  return apiRequest<RecommendedNextAction>(
    accessToken,
    "/learning/next-action",
    {
      query: { path: pathStableId },
      ...(options.signal ? { signal: options.signal } : {})
    }
  );
}

/**
 * Record that the learner started or completed a mission.
 *
 * The only write in this package, and it changes progress only. The server
 * re-evaluates prerequisites and applies the change through the
 * `record_mission_progress` RPC, so the browser cannot assert a state the
 * Learning Engine would refuse — it asks, and is told what actually happened.
 *
 * It cannot award a competency or create evidence: those come from
 * deterministic lab validation, on a path this module does not touch.
 */
export async function recordMissionProgress(
  accessToken: string,
  missionStableId: string,
  action: "start" | "complete",
  options: { signal?: AbortSignal } = {}
): Promise<StudentProgressRecord> {
  const response = await apiRequest<{ progress: StudentProgressRecord }>(
    accessToken,
    `/learning/missions/${encodeURIComponent(missionStableId)}/${action}`,
    {
      method: "POST",
      ...(options.signal ? { signal: options.signal } : {})
    }
  );

  return response.progress;
}
