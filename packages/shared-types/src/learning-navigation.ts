import type {
  LearningProgressState,
  PublishedLearningPathTree,
  StudentProgressRecord
} from "./index";

export type ResumeReason =
  | "resume_in_progress"
  | "next_after_completed"
  | "first_incomplete"
  | "approved_start"
  | "path_complete";

export interface LearningResumeTarget {
  pathStableId: string;
  missionStableId?: string;
  reason: ResumeReason;
  explanation: string;
  recoveredFromMissingTarget: boolean;
}

export type PrerequisiteRequirementType =
  | "content_completion"
  | "competency"
  | "readiness_assessment"
  | "equivalent_competency";

export interface PrerequisiteRule {
  id: string;
  targetNodeType: "course" | "module" | "mission";
  targetStableId: string;
  requirementType: PrerequisiteRequirementType;
  requirementStableId: string;
  explanation: string;
}

export type PrerequisiteEvaluationState =
  | "satisfied"
  | "blocked"
  | "temporarily_unavailable";

export interface PrerequisiteRequirementResult {
  ruleId: string;
  requirementType: PrerequisiteRequirementType;
  requirementStableId: string;
  satisfied: boolean;
  explanation: string;
}

export interface PrerequisiteEvaluation {
  state: PrerequisiteEvaluationState;
  targetStableId: string;
  allowed: boolean;
  requirements: PrerequisiteRequirementResult[];
  explanation: string;
}

function missionOrder(tree: PublishedLearningPathTree): string[] {
  return tree.courses.flatMap((course) =>
    course.modules.flatMap((module) =>
      module.missions.map((mission) => mission.stableId)
    )
  );
}

function isCompleted(state: LearningProgressState | undefined): boolean {
  return state === "completed" || state === "competency_demonstrated";
}

export function selectResumeTarget(
  tree: PublishedLearningPathTree,
  records: StudentProgressRecord[]
): LearningResumeTarget {
  const orderedMissions = missionOrder(tree);
  const currentMissionSet = new Set(orderedMissions);

  const missionRecords = records
    .filter((record) => record.nodeType === "mission")
    .slice()
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

  const latestRecord = missionRecords[0];
  const recoveredFromMissingTarget =
    Boolean(latestRecord) &&
    !currentMissionSet.has(latestRecord!.nodeStableId);

  const active = missionRecords.find(
    (record) =>
      currentMissionSet.has(record.nodeStableId) &&
      record.state === "in_progress"
  );

  if (active) {
    return {
      pathStableId: tree.learningPath.stableId,
      missionStableId: active.nodeStableId,
      reason: "resume_in_progress",
      explanation: "Continue the mission you were actively working on.",
      recoveredFromMissingTarget
    };
  }

  const byMission = new Map(
    missionRecords.map((record) => [record.nodeStableId, record.state])
  );

  let lastCompletedIndex = -1;

  for (let index = 0; index < orderedMissions.length; index += 1) {
    if (isCompleted(byMission.get(orderedMissions[index]!))) {
      lastCompletedIndex = index;
    }
  }

  if (
    lastCompletedIndex >= 0 &&
    lastCompletedIndex + 1 < orderedMissions.length
  ) {
    const next = orderedMissions[lastCompletedIndex + 1]!;
    if (!isCompleted(byMission.get(next))) {
      return {
        pathStableId: tree.learningPath.stableId,
        missionStableId: next,
        reason: "next_after_completed",
        explanation: "Continue with the next required mission in your path.",
        recoveredFromMissingTarget
      };
    }
  }

  const firstIncomplete = orderedMissions.find(
    (stableId) => !isCompleted(byMission.get(stableId))
  );

  if (firstIncomplete) {
    return {
      pathStableId: tree.learningPath.stableId,
      missionStableId: firstIncomplete,
      reason:
        missionRecords.length === 0 ? "approved_start" : "first_incomplete",
      explanation:
        missionRecords.length === 0
          ? "Begin at the approved starting point for this learning path."
          : "Continue at the first incomplete required mission.",
      recoveredFromMissingTarget
    };
  }

  return {
    pathStableId: tree.learningPath.stableId,
    reason: "path_complete",
    explanation: "This learning path is complete.",
    recoveredFromMissingTarget
  };
}

export function evaluatePrerequisiteRules(
  targetStableId: string,
  rules: PrerequisiteRule[],
  completedContent: Set<string>,
  satisfiedAuthoritativeRequirements: Set<string>,
  authoritativeSourcesAvailable: boolean
): PrerequisiteEvaluation {
  if (rules.length === 0) {
    return {
      state: "satisfied",
      targetStableId,
      allowed: true,
      requirements: [],
      explanation: "No prerequisites are required."
    };
  }

  const requirements = rules.map((rule) => {
    const satisfied =
      rule.requirementType === "content_completion"
        ? completedContent.has(rule.requirementStableId)
        : satisfiedAuthoritativeRequirements.has(
            `${rule.requirementType}:${rule.requirementStableId}`
          );

    return {
      ruleId: rule.id,
      requirementType: rule.requirementType,
      requirementStableId: rule.requirementStableId,
      satisfied,
      explanation: rule.explanation
    };
  });

  const requiresExternalAuthority = rules.some(
    (rule) => rule.requirementType !== "content_completion"
  );

  if (requiresExternalAuthority && !authoritativeSourcesAvailable) {
    return {
      state: "temporarily_unavailable",
      targetStableId,
      allowed: false,
      requirements,
      explanation:
        "Prerequisite evaluation is temporarily unavailable. Your progress is preserved; try again shortly."
    };
  }

  if (requirements.some((requirement) => !requirement.satisfied)) {
    return {
      state: "blocked",
      targetStableId,
      allowed: false,
      requirements,
      explanation:
        "Complete or demonstrate the listed prerequisite before continuing."
    };
  }

  return {
    state: "satisfied",
    targetStableId,
    allowed: true,
    requirements,
    explanation: "All prerequisites are satisfied."
  };
}
