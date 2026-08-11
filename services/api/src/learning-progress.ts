import type {
  LearningPathProgressSummary,
  LearningProgressState,
  StudentProgressRecord
} from "@tlp/shared-types";
import {
  AppError,
  aggregateLearningPathProgress
} from "@tlp/shared-types";
import { getPublishedLearningPathTree } from "./curriculum";
import { createUserScopedSupabaseClient } from "./supabase";

type MissionAction = "start" | "complete";

function isLearningProgressState(
  value: unknown
): value is LearningProgressState {
  return (
    value === "not_started" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "competency_demonstrated" ||
    value === "needs_review" ||
    value === "blocked_by_prerequisite"
  );
}

function mapProgressRow(row: Record<string, unknown>): StudentProgressRecord {
  if (!isLearningProgressState(row.state)) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Invalid learning progress state was returned",
      retryable: false
    });
  }

  return {
    nodeType: String(row.node_type) as StudentProgressRecord["nodeType"],
    nodeStableId: String(row.node_stable_id),
    curriculumVersion: Number(row.curriculum_version),
    state: row.state,
    startedAt:
      row.started_at == null ? undefined : String(row.started_at),
    completedAt:
      row.completed_at == null ? undefined : String(row.completed_at),
    lastActivityAt: String(row.last_activity_at)
  };
}

export async function getLearningPathProgress(
  accessToken: string,
  pathStableId: string
): Promise<LearningPathProgressSummary> {
  const stableId = pathStableId.trim();

  if (!stableId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Learning path stable ID is required",
      retryable: false
    });
  }

  const tree = await getPublishedLearningPathTree(
    accessToken,
    stableId
  );

  const missionStableIds = tree.courses.flatMap((course) =>
    course.modules.flatMap((module) =>
      module.missions.map((mission) => mission.stableId)
    )
  );

  if (missionStableIds.length === 0) {
    return aggregateLearningPathProgress(tree, []);
  }

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_learning_progress")
    .select(
      "node_type,node_stable_id,curriculum_version,state,started_at,completed_at,last_activity_at"
    )
    .eq("node_type", "mission")
    .in("node_stable_id", missionStableIds);

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load learning progress",
      retryable: true
    });
  }

  return aggregateLearningPathProgress(
    tree,
    (data ?? []).map((row) =>
      mapProgressRow(row as Record<string, unknown>)
    )
  );
}

export async function recordMissionProgressAction(
  accessToken: string,
  missionStableId: string,
  action: MissionAction
): Promise<StudentProgressRecord> {
  const stableId = missionStableId.trim();

  if (!stableId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Mission stable ID is required",
      retryable: false
    });
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase.rpc(
    "record_mission_progress",
    {
      target_mission_stable_id: stableId,
      target_action: action
    }
  );

  if (error) {
    throw new AppError({
      code: "CONFLICT",
      message: "Unable to update mission progress",
      retryable: false,
      details: {
        reason: error.message
      }
    });
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== "object") {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Mission progress update returned no state",
      retryable: false
    });
  }

  return mapProgressRow(row as Record<string, unknown>);
}
