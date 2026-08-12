import type {
  LearningResumeTarget,
  PrerequisiteEvaluation,
  PrerequisiteRule,
  StudentProgressRecord
} from "@tlp/shared-types";
import {
  AppError,
  evaluatePrerequisiteRules,
  selectResumeTarget
} from "@tlp/shared-types";
import { getPublishedLearningPathTree } from "./curriculum";
import { createUserScopedSupabaseClient } from "./supabase";

function mapProgressRow(row: Record<string, unknown>): StudentProgressRecord {
  return {
    nodeType: String(row.node_type) as StudentProgressRecord["nodeType"],
    nodeStableId: String(row.node_stable_id),
    curriculumVersion: Number(row.curriculum_version),
    state: String(row.state) as StudentProgressRecord["state"],
    startedAt: row.started_at == null ? undefined : String(row.started_at),
    completedAt: row.completed_at == null ? undefined : String(row.completed_at),
    lastActivityAt: String(row.last_activity_at)
  };
}

function mapRule(row: Record<string, unknown>): PrerequisiteRule {
  return {
    id: String(row.id),
    targetNodeType: String(row.target_node_type) as PrerequisiteRule["targetNodeType"],
    targetStableId: String(row.target_stable_id),
    requirementType: String(row.requirement_type) as PrerequisiteRule["requirementType"],
    requirementStableId: String(row.requirement_stable_id),
    explanation: String(row.explanation)
  };
}

export async function getResumeTarget(
  accessToken: string,
  pathStableId: string
): Promise<LearningResumeTarget> {
  const stableId = pathStableId.trim();

  if (!stableId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Learning path stable ID is required",
      retryable: false
    });
  }

  const tree = await getPublishedLearningPathTree(accessToken, stableId);
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("student_learning_progress")
    .select(
      "node_type,node_stable_id,curriculum_version,state,started_at,completed_at,last_activity_at"
    )
    .eq("node_type", "mission")
    .order("last_activity_at", { ascending: false });

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to calculate a resume target",
      retryable: true
    });
  }

  return selectResumeTarget(
    tree,
    (data ?? []).map((row) =>
      mapProgressRow(row as Record<string, unknown>)
    )
  );
}

export async function evaluateMissionPrerequisites(
  accessToken: string,
  missionStableId: string
): Promise<PrerequisiteEvaluation> {
  const stableId = missionStableId.trim();

  if (!stableId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Mission stable ID is required",
      retryable: false
    });
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data: ruleRows, error: ruleError } = await supabase
    .from("learning_prerequisite_rules")
    .select(
      "id,target_node_type,target_stable_id,requirement_type,requirement_stable_id,explanation"
    )
    .eq("target_node_type", "mission")
    .eq("target_stable_id", stableId)
    .eq("active", true);

  if (ruleError) {
    return {
      state: "temporarily_unavailable",
      targetStableId: stableId,
      allowed: false,
      requirements: [],
      explanation:
        "Prerequisite evaluation is temporarily unavailable. Your progress is preserved; try again shortly."
    };
  }

  const rules = (ruleRows ?? []).map((row) =>
    mapRule(row as Record<string, unknown>)
  );

  const contentIds = rules
    .filter((rule) => rule.requirementType === "content_completion")
    .map((rule) => rule.requirementStableId);

  const completedContent = new Set<string>();

  if (contentIds.length > 0) {
    const { data: progressRows, error: progressError } = await supabase
      .from("student_learning_progress")
      .select("node_stable_id,state")
      .eq("node_type", "mission")
      .in("node_stable_id", contentIds);

    if (progressError) {
      return {
        state: "temporarily_unavailable",
        targetStableId: stableId,
        allowed: false,
        requirements: [],
        explanation:
          "Prerequisite evaluation is temporarily unavailable. Your progress is preserved; try again shortly."
      };
    }

    for (const row of progressRows ?? []) {
      if (
        row.state === "completed" ||
        row.state === "competency_demonstrated"
      ) {
        completedContent.add(String(row.node_stable_id));
      }
    }
  }

  const externalRules = rules.filter(
    (rule) => rule.requirementType !== "content_completion"
  );

  const satisfactions = new Set<string>();
  let sourcesAvailable = true;

  if (externalRules.length > 0) {
    const { data: rows, error } = await supabase
      .from("learning_requirement_satisfactions")
      .select("requirement_type,requirement_stable_id");

    if (error) {
      sourcesAvailable = false;
    } else {
      for (const row of rows ?? []) {
        satisfactions.add(
          `${row.requirement_type}:${row.requirement_stable_id}`
        );
      }
    }
  }

  return evaluatePrerequisiteRules(
    stableId,
    rules,
    completedContent,
    satisfactions,
    sourcesAvailable
  );
}
