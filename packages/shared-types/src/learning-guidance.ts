import type {
  CompetencyStateRecord,
  LearningPathProgressSummary,
  LearningResumeTarget,
  PrerequisiteEvaluation
} from "./index";

export type NextActionType =
  | "continue_mission"
  | "review_competency"
  | "start_mission"
  | "path_complete"
  | "temporarily_unavailable";

export interface RecommendedNextAction {
  actionType: NextActionType;
  pathStableId: string;
  missionStableId?: string;
  competencyStableId?: string;
  explanation: string;
}

export interface LearningHistoryEntry {
  eventType:
    | "progress"
    | "competency"
    | "review"
    | "administrative_correction";
  stableId: string;
  occurredAt: string;
  summary: string;
  sourceReference?: string;
}

export interface ReviewState {
  competencyStableId: string;
  needsReview: boolean;
  reason?: string;
  lastEvaluatedAt: string;
}

export function recommendNextAction(input: {
  progress: LearningPathProgressSummary;
  resume: LearningResumeTarget;
  competencies: CompetencyStateRecord[];
  prerequisite?: PrerequisiteEvaluation;
}): RecommendedNextAction {
  const needsReview = input.competencies.find(
    (competency) => competency.state === "needs_review"
  );

  if (needsReview) {
    return {
      actionType: "review_competency",
      pathStableId: input.progress.stableId,
      competencyStableId: needsReview.competencyStableId,
      explanation:
        "Review this competency because approved learning rules require renewed demonstration."
    };
  }

  if (
    input.prerequisite &&
    input.prerequisite.state === "temporarily_unavailable"
  ) {
    return {
      actionType: "temporarily_unavailable",
      pathStableId: input.progress.stableId,
      explanation:
        "Your next action cannot be calculated right now. Your progress is preserved."
    };
  }

  if (input.resume.reason === "path_complete") {
    return {
      actionType: "path_complete",
      pathStableId: input.progress.stableId,
      explanation: "You have completed the current required learning path."
    };
  }

  if (input.resume.missionStableId) {
    return {
      actionType:
        input.resume.reason === "resume_in_progress"
          ? "continue_mission"
          : "start_mission",
      pathStableId: input.progress.stableId,
      missionStableId: input.resume.missionStableId,
      explanation: input.resume.explanation
    };
  }

  return {
    actionType: "temporarily_unavailable",
    pathStableId: input.progress.stableId,
    explanation:
      "A safe next action could not be determined. Your learning state has not changed."
  };
}
