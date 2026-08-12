export type CompetencyState =
  | "not_started"
  | "developing"
  | "demonstrated"
  | "needs_review";

export type CompetencyEvidenceType =
  | "mission_completion"
  | "assessment"
  | "lab"
  | "portfolio"
  | "administrative_correction";

export interface CompetencyStateRecord {
  competencyStableId: string;
  curriculumVersion: number;
  state: CompetencyState;
  demonstratedAt?: string;
  lastEvaluatedAt: string;
}

export interface CompetencyEvidenceReference {
  evidenceType: CompetencyEvidenceType;
  evidenceReference: string;
  competencyStableId: string;
  accepted: boolean;
  occurredAt: string;
}

export interface CompetencyTransitionDecision {
  from: CompetencyState;
  to: CompetencyState;
  changed: boolean;
  reason: string;
}

export function decideCompetencyTransition(
  current: CompetencyState,
  acceptedEvidenceCount: number,
  forceNeedsReview = false
): CompetencyTransitionDecision {
  if (forceNeedsReview) {
    return {
      from: current,
      to: "needs_review",
      changed: current !== "needs_review",
      reason: "Approved review criteria require renewed demonstration."
    };
  }

  if (current === "demonstrated") {
    return {
      from: current,
      to: current,
      changed: false,
      reason: "Demonstrated competency remains demonstrated."
    };
  }

  if (acceptedEvidenceCount >= 1) {
    return {
      from: current,
      to: "demonstrated",
      changed: true,
      reason: "At least one approved authoritative evidence reference was accepted."
    };
  }

  if (current === "not_started") {
    return {
      from: current,
      to: "developing",
      changed: true,
      reason: "Competency activity has begun but no accepted demonstration exists."
    };
  }

  return {
    from: current,
    to: current,
    changed: false,
    reason: "No authoritative evidence supports advancement."
  };
}
