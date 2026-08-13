import type { AssessmentPurpose } from "./assessment";
import type { EvidenceMetadata } from "./evidence";
import { validateEvidenceMetadata } from "./evidence";
import type { EvidenceCompetencyRelationship } from "./evidence-competency";

/**
 * Wave 7 / Batch 3 — EVID-005 Assessment Evidence.
 *
 * Turns approved deterministic assessment outcomes into canonical Evidence.
 * This module is pure: it decides eligibility, shapes bounded metadata and maps
 * approved competency mappings to relationships. It performs no I/O, holds no
 * scoring authority and contains no AI.
 *
 * The Assessment Engine remains authoritative for the result. Evidence records
 * that result; it never recomputes or modifies it.
 */

/** The only assessment purpose that may produce trusted Evidence. */
export const EVIDENCE_PRODUCING_ASSESSMENT_PURPOSE: AssessmentPurpose =
  "evidence_producing";

/** Attempt states that represent an authoritative, completed observation. */
export type AssessmentEvidenceResultState = "passed" | "failed";

export const ASSESSMENT_EVIDENCE_RESULT_STATES: readonly AssessmentEvidenceResultState[] =
  ["passed", "failed"];

/**
 * Why a terminal attempt did or did not become canonical Evidence.
 * Every "skipped" reason is a normal outcome, never an error.
 */
export type AssessmentEvidenceSkipReason =
  | "assessment_not_evidence_producing"
  | "attempt_not_terminal"
  | "handoff_not_eligible";

export type AssessmentEvidenceConsumptionState =
  | "consumed"
  | "skipped"
  | "failed";

export interface AssessmentEvidenceSourceFacts {
  attemptId: string;
  userId: string;
  assessmentStableId: string;
  assessmentVersion: number;
  assessmentTitle: string;
  assessmentPurpose: AssessmentPurpose;
  attemptState: string;
  resultState: AssessmentEvidenceResultState;
  scorePercent: number;
  passingPercent: number;
  submittedAt: string;
  sourceReference: string;
  resultDigest: string;
  evidenceEligible: boolean;
}

export interface AssessmentEvidenceCompetencyMapping {
  competencyStableId: string;
  competencyVersion: number;
  required: boolean;
}

export type AssessmentEvidenceEligibilityDecision =
  | { eligible: true }
  | { eligible: false; reason: AssessmentEvidenceSkipReason };

/**
 * Decides whether an attempt may become canonical Evidence.
 *
 * Fails closed on every axis:
 *  - only `evidence_producing` assessments qualify; practice and diagnostic
 *    attempts produce nothing at all
 *  - only terminal `passed` / `failed` attempts qualify, so an interrupted or
 *    in-progress attempt never becomes negative Evidence (EVID-005 §12)
 *  - the upstream handoff must itself be marked evidence eligible
 *
 * A failed attempt IS eligible: a failed authoritative assessment is a
 * trustworthy record of an observed result. What a failure must never do is
 * count as demonstration — see `deriveAssessmentEvidenceOutcome`.
 */
export function evaluateAssessmentEvidenceEligibility(input: {
  assessmentPurpose: AssessmentPurpose;
  attemptState: string;
  evidenceEligible: boolean;
}): AssessmentEvidenceEligibilityDecision {
  if (input.assessmentPurpose !== EVIDENCE_PRODUCING_ASSESSMENT_PURPOSE) {
    return { eligible: false, reason: "assessment_not_evidence_producing" };
  }

  if (!isAssessmentEvidenceResultState(input.attemptState)) {
    return { eligible: false, reason: "attempt_not_terminal" };
  }

  if (input.evidenceEligible !== true) {
    return { eligible: false, reason: "handoff_not_eligible" };
  }

  return { eligible: true };
}

export function isAssessmentEvidenceResultState(
  value: unknown
): value is AssessmentEvidenceResultState {
  return (
    typeof value === "string" &&
    (ASSESSMENT_EVIDENCE_RESULT_STATES as readonly string[]).includes(value)
  );
}

/**
 * Approved competency mappings become Evidence competency links.
 * `required: true` is a required relationship; anything else is supporting.
 */
export function toEvidenceCompetencyRelationship(
  required: boolean
): EvidenceCompetencyRelationship {
  return required === true ? "required" : "supporting";
}

/**
 * Bounded, student-safe Evidence metadata for an assessment attempt.
 *
 * Deliberately carries no questions, no options, no answer keys and no scoring
 * internals beyond the already student-visible score and threshold
 * (EVID-005 §9). Every value is a primitive, so the metadata stays within the
 * Batch 1 bounds.
 */
export function buildAssessmentEvidenceMetadata(
  facts: AssessmentEvidenceSourceFacts
): EvidenceMetadata {
  return {
    assessmentStableId: facts.assessmentStableId,
    assessmentVersion: facts.assessmentVersion,
    assessmentTitle: facts.assessmentTitle,
    assessmentPurpose: facts.assessmentPurpose,
    attemptId: facts.attemptId,
    resultState: facts.resultState,
    scorePercent: facts.scorePercent,
    passingPercent: facts.passingPercent
  };
}

/** Guards the metadata shape against the Batch 1 bounded-metadata rules. */
export function validateAssessmentEvidenceMetadata(
  metadata: EvidenceMetadata
): { valid: boolean; errors: string[] } {
  const base = validateEvidenceMetadata(metadata);
  const errors = [...base.errors];

  if (!isAssessmentEvidenceResultState(metadata.resultState)) {
    errors.push("assessment Evidence metadata must record a terminal resultState");
  }

  for (const forbidden of [
    "questions",
    "options",
    "answers",
    "answerKey",
    "correctOptionIds"
  ]) {
    if (forbidden in metadata) {
      errors.push(`assessment Evidence metadata must not contain ${forbidden}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface AssessmentEvidenceConsumptionResult {
  attemptId: string;
  state: AssessmentEvidenceConsumptionState;
  evidenceId?: string;
  linkedCompetencyCount: number;
  skipReason?: AssessmentEvidenceSkipReason;
  failureCode?: string;
}
