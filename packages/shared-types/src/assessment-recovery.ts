export type AssessmentInterruptionReason =
  | "client_disconnect"
  | "network_error"
  | "server_restart"
  | "dependency_unavailable"
  | "unknown";

export interface AssessmentRecoveryState {
  attemptId: string;
  state: "in_progress" | "interrupted";
  interruptionReason?: AssessmentInterruptionReason;
  interruptedAt?: string;
  recoverable: boolean;
  preservedAnswerCount: number;
}

export interface AssessmentEvidenceHandoff {
  sourceType: "assessment_attempt";
  sourceReference: string;
  assessmentStableId: string;
  assessmentVersion: number;
  attemptId: string;
  resultState: "passed" | "failed";
  scorePercent: number;
  passingPercent: number;
  competencyStableIds: string[];
  evidenceEligible: boolean;
}

export function isRecoverableAssessmentState(
  state: AssessmentRecoveryState["state"]
): boolean {
  return state === "in_progress" || state === "interrupted";
}
