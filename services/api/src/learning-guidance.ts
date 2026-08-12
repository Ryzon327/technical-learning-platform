import type {
  LearningHistoryEntry,
  RecommendedNextAction,
  ReviewState
} from "@tlp/shared-types";
import {
  AppError,
  recommendNextAction
} from "@tlp/shared-types";
import { listStudentCompetencyState } from "./competency";
import { getResumeTarget } from "./learning-navigation";
import { getLearningPathProgress } from "./learning-progress";
import { createUserScopedSupabaseClient } from "./supabase";

export async function getRecommendedNextAction(
  accessToken: string,
  pathStableId: string
): Promise<RecommendedNextAction> {
  const [progress, resume, competencies] = await Promise.all([
    getLearningPathProgress(accessToken, pathStableId),
    getResumeTarget(accessToken, pathStableId),
    listStudentCompetencyState(accessToken)
  ]);

  return recommendNextAction({
    progress,
    resume,
    competencies
  });
}

export async function listLearningHistory(
  accessToken: string,
  limit = 100
): Promise<LearningHistoryEntry[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 500));
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("student_learning_history")
    .select(
      "event_type,stable_id,summary,source_reference,occurred_at"
    )
    .order("occurred_at", { ascending: false })
    .limit(boundedLimit);

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load learning history",
      retryable: true
    });
  }

  return (data ?? []).map((row) => ({
    eventType: String(row.event_type) as LearningHistoryEntry["eventType"],
    stableId: String(row.stable_id),
    occurredAt: String(row.occurred_at),
    summary: String(row.summary),
    sourceReference:
      row.source_reference == null
        ? undefined
        : String(row.source_reference)
  }));
}

export async function listReviewState(
  accessToken: string
): Promise<ReviewState[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("student_review_state")
    .select(
      "competency_stable_id,needs_review,reason,last_evaluated_at"
    )
    .order("competency_stable_id");

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load review state",
      retryable: true
    });
  }

  return (data ?? []).map((row) => ({
    competencyStableId: String(row.competency_stable_id),
    needsReview: Boolean(row.needs_review),
    reason: row.reason == null ? undefined : String(row.reason),
    lastEvaluatedAt: String(row.last_evaluated_at)
  }));
}
