import { describe, expect, it } from "vitest";
import {
  buildAssessmentEvidenceMetadata,
  evaluateAssessmentEvidenceEligibility,
  isAssessmentEvidenceResultState,
  toEvidenceCompetencyRelationship,
  validateAssessmentEvidenceMetadata,
  type AssessmentEvidenceSourceFacts
} from "./assessment-evidence";
import {
  deriveEvidenceOutcome,
  qualifiesAsDemonstrationEvidence
} from "./evidence-competency";
import { validateEvidenceMetadata } from "./evidence";

function facts(
  overrides: Partial<AssessmentEvidenceSourceFacts> = {}
): AssessmentEvidenceSourceFacts {
  return {
    attemptId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    assessmentStableId: "assessment.network.subnetting",
    assessmentVersion: 3,
    assessmentTitle: "IPv4 Subnetting Readiness",
    assessmentPurpose: "evidence_producing",
    attemptState: "passed",
    resultState: "passed",
    scorePercent: 88.5,
    passingPercent: 80,
    submittedAt: "2026-08-13T00:00:00.000Z",
    sourceReference: "assessment-attempt:11111111-1111-4111-8111-111111111111",
    resultDigest: "a1".repeat(32),
    evidenceEligible: true,
    ...overrides
  };
}

function eligibility(overrides: Partial<AssessmentEvidenceSourceFacts> = {}) {
  const value = facts(overrides);
  return evaluateAssessmentEvidenceEligibility({
    assessmentPurpose: value.assessmentPurpose,
    attemptState: value.attemptState,
    evidenceEligible: value.evidenceEligible
  });
}

describe("assessment evidence eligibility", () => {
  it("A: a passed evidence-producing attempt is eligible", () => {
    expect(eligibility({ attemptState: "passed" })).toEqual({ eligible: true });
  });

  it("B: a failed evidence-producing attempt is eligible", () => {
    expect(
      eligibility({ attemptState: "failed", resultState: "failed" })
    ).toEqual({ eligible: true });
  });

  it("D: an interrupted attempt produces no evidence", () => {
    const decision = eligibility({ attemptState: "interrupted" });
    expect(decision.eligible).toBe(false);
    expect(decision).toEqual({
      eligible: false,
      reason: "attempt_not_terminal"
    });
  });

  it("D2: an in-progress attempt produces no evidence", () => {
    expect(eligibility({ attemptState: "in_progress" }).eligible).toBe(false);
  });

  it("E: a practice assessment produces no evidence", () => {
    expect(
      eligibility({ assessmentPurpose: "practice" })
    ).toEqual({
      eligible: false,
      reason: "assessment_not_evidence_producing"
    });
  });

  it("F: a diagnostic assessment produces no evidence", () => {
    expect(
      eligibility({ assessmentPurpose: "diagnostic" })
    ).toEqual({
      eligible: false,
      reason: "assessment_not_evidence_producing"
    });
  });

  it("fails closed when the handoff is not marked eligible", () => {
    expect(eligibility({ evidenceEligible: false })).toEqual({
      eligible: false,
      reason: "handoff_not_eligible"
    });
  });

  it("recognises only terminal result states", () => {
    expect(isAssessmentEvidenceResultState("passed")).toBe(true);
    expect(isAssessmentEvidenceResultState("failed")).toBe(true);
    for (const state of ["interrupted", "in_progress", "abandoned", ""]) {
      expect(isAssessmentEvidenceResultState(state)).toBe(false);
    }
  });
});

describe("assessment evidence competency relationships", () => {
  it("maps required mappings to the required relationship", () => {
    expect(toEvidenceCompetencyRelationship(true)).toBe("required");
  });

  it("maps optional mappings to the supporting relationship", () => {
    expect(toEvidenceCompetencyRelationship(false)).toBe("supporting");
  });
});

describe("assessment evidence metadata", () => {
  it("preserves assessment identity, version and outcome", () => {
    const metadata = buildAssessmentEvidenceMetadata(facts());
    expect(metadata.assessmentStableId).toBe("assessment.network.subnetting");
    expect(metadata.assessmentVersion).toBe(3);
    expect(metadata.attemptId).toBe("11111111-1111-4111-8111-111111111111");
    expect(metadata.resultState).toBe("passed");
    expect(metadata.assessmentPurpose).toBe("evidence_producing");
  });

  it("K: never carries questions, options or answer keys", () => {
    const metadata = buildAssessmentEvidenceMetadata(facts());
    const keys = Object.keys(metadata);
    for (const forbidden of [
      "questions",
      "options",
      "answers",
      "answerKey",
      "correctOptionIds",
      "selectedOptionIds"
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    expect(validateAssessmentEvidenceMetadata(metadata).valid).toBe(true);
  });

  it("rejects metadata carrying an answer key", () => {
    const metadata = {
      ...buildAssessmentEvidenceMetadata(facts()),
      correctOptionIds: "option-a"
    };
    expect(validateAssessmentEvidenceMetadata(metadata).valid).toBe(false);
  });

  it("stays inside the Batch 1 bounded metadata rules", () => {
    const metadata = buildAssessmentEvidenceMetadata(facts());
    expect(validateEvidenceMetadata(metadata).valid).toBe(true);
    expect(Object.keys(metadata).length).toBeLessThan(21);
  });

  it("records a failed outcome faithfully", () => {
    const metadata = buildAssessmentEvidenceMetadata(
      facts({ attemptState: "failed", resultState: "failed", scorePercent: 41 })
    );
    expect(metadata.resultState).toBe("failed");
    expect(metadata.scorePercent).toBe(41);
  });
});

describe("C: failed assessment evidence cannot imply demonstration", () => {
  it("derives a negative outcome from a failed result", () => {
    const metadata = buildAssessmentEvidenceMetadata(
      facts({ attemptState: "failed", resultState: "failed" })
    );
    const outcome = deriveEvidenceOutcome(metadata.resultState);
    expect(outcome).toBe("negative");
    expect(qualifiesAsDemonstrationEvidence(outcome)).toBe(false);
  });

  it("derives a positive outcome from a passed result", () => {
    const metadata = buildAssessmentEvidenceMetadata(facts());
    const outcome = deriveEvidenceOutcome(metadata.resultState);
    expect(outcome).toBe("positive");
    expect(qualifiesAsDemonstrationEvidence(outcome)).toBe(true);
  });

  it("fails closed for an unknown or absent result state", () => {
    for (const value of [undefined, null, "", "interrupted", "unknown", 1]) {
      const outcome = deriveEvidenceOutcome(value);
      expect(outcome).toBe("indeterminate");
      expect(qualifiesAsDemonstrationEvidence(outcome)).toBe(false);
    }
  });
});
