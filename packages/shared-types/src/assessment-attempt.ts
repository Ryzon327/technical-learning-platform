import type {
  AssessmentAnswer,
  AssessmentQuestionOption,
  AssessmentQuestionType,
  AssessmentScore
} from "./assessment";

export type AssessmentAttemptState =
  | "in_progress"
  | "submitted"
  | "passed"
  | "failed"
  | "interrupted";

export interface DeliveredAssessmentQuestion {
  stableId: string;
  version: number;
  type: AssessmentQuestionType;
  prompt: string;
  options: AssessmentQuestionOption[];
  points: number;
  position: number;
}

export interface AssessmentAttemptSummary {
  attemptId: string;
  assessmentStableId: string;
  assessmentVersion: number;
  attemptNumber: number;
  state: AssessmentAttemptState;
  startedAt: string;
  submittedAt?: string;
  score?: AssessmentScore;
}

export interface AssessmentAttemptDetail
  extends AssessmentAttemptSummary {
  title: string;
  passingPercent: number;
  questions: DeliveredAssessmentQuestion[];
  answers: AssessmentAnswer[];
}

export function canSubmitAttempt(state: AssessmentAttemptState): boolean {
  return state === "in_progress";
}

export function isTerminalAttemptState(
  state: AssessmentAttemptState
): boolean {
  return state === "passed" || state === "failed" || state === "submitted";
}
