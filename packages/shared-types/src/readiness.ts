export type ReadinessOutcomeState = "demonstrated" | "review_recommended";

export interface ReadinessOutcome {
  attemptId: string;
  assessmentStableId: string;
  assessmentVersion: number;
  outcome: ReadinessOutcomeState;
  scorePercent: number;
  passingPercent: number;
  competencyStableIds: string[];
  prerequisiteSatisfactionCreated: boolean;
  explanation: string;
  sourceReference: string;
  createdAt: string;
}

export function readinessExplanation(input: {
  passed: boolean;
  competencyCount: number;
}): string {
  if (input.passed && input.competencyCount > 0) {
    return "You demonstrated the approved competencies for this test-out assessment. Eligible prerequisite and competency state can advance.";
  }
  if (input.passed) return "You met the approved readiness threshold.";
  return "The readiness threshold was not met. Your existing progress and competency remain intact, and review is recommended before another approved attempt.";
}
