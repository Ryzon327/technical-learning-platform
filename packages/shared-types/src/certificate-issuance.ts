import type {
  CertificateDefinitionState
} from "./certificate-definition";
import type {
  CertificateEligibilityResult,
  CertificateEligibilityStatus,
  CertificateEligibilityUnknownReason
} from "./certificate-eligibility";

/**
 * CERT-003 — Deterministic Certificate Issuance.
 *
 * Pure decision and snapshot-assembly logic. No I/O, no clock, no randomness.
 *
 * This module does NOT evaluate eligibility. CERT-002 is the one authoritative
 * evaluator; everything here consumes a `CertificateEligibilityResult` that the
 * server produced immediately beforehand. There is deliberately no competency
 * comparison, no evidence counting and no policy arithmetic in this file.
 *
 * It also owns nothing about a certificate's later life. There is no lifecycle
 * status, no expiration, no revocation, no verification behaviour and no
 * presentation metadata — CERT-004 owns the record's lifecycle, CERT-005 owns
 * verification, and CERT-008 owns revocation.
 */

/**
 * Opaque, non-enumerable certificate identifier minted at issuance.
 *
 * Mirrors the Wave 7 `ev1_` verification-reference convention. It exists so a
 * future CERT-005 verification surface does not require a schema redesign;
 * CERT-003 mints it and exposes no verification endpoint whatsoever.
 */
export const CERTIFICATE_VERIFICATION_ID_PATTERN = /^cert1_[a-f0-9]{48}$/;

export function isCertificateVerificationId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    CERTIFICATE_VERIFICATION_ID_PATTERN.test(value)
  );
}

/**
 * The issued Certificate Record as returned to its owner.
 *
 * Exactly the CERT-003 fields. `userId` is deliberately absent from the
 * projection — the record is only ever returned to the authenticated owner, so
 * echoing their identity back adds nothing, matching the Wave 7
 * `toStudentEvidenceRecord` convention.
 */
export interface IssuedCertificate {
  id: string;
  certificateDefinitionId: string;
  certificateDefinitionStableId: string;
  certificateDefinitionVersion: number;
  verificationId: string;
  issuedAt: string;
}

/** Why issuance was refused. Distinct from a transport or dependency failure. */
export type CertificateIssuanceRefusalReason =
  | "not_eligible"
  | "eligibility_unknown"
  | "definition_not_issuable";

export const CERTIFICATE_ISSUANCE_REFUSAL_REASONS: readonly CertificateIssuanceRefusalReason[] =
  ["not_eligible", "eligibility_unknown", "definition_not_issuable"];

export type CertificateIssuanceDecision =
  | { issuable: true }
  | {
      issuable: false;
      reason: CertificateIssuanceRefusalReason;
      unknownReason?: CertificateEligibilityUnknownReason;
    };

export interface CertificateIssuanceDecisionInput {
  eligibilityStatus: CertificateEligibilityStatus;
  unknownReason?: CertificateEligibilityUnknownReason;
  publicationState: CertificateDefinitionState;
  supersededByDefinitionId: string | null;
}

/**
 * Decides whether an issuance request may proceed.
 *
 * Fail-closed and deliberately narrow: it reads a status CERT-002 already
 * determined and two CERT-001 facts. It never inspects competencies, evidence
 * or policies, so it cannot become a second eligibility engine.
 *
 * A definition must be issuable in its own right before eligibility matters:
 * only a published version that has not been superseded may support a NEW
 * certificate. Supersession is an explicit Founder-authored replacement fact,
 * never inferred from version numbers.
 */
export function decideCertificateIssuance(
  input: CertificateIssuanceDecisionInput
): CertificateIssuanceDecision {
  if (
    input.publicationState !== "published" ||
    input.supersededByDefinitionId !== null
  ) {
    return { issuable: false, reason: "definition_not_issuable" };
  }

  if (input.eligibilityStatus === "unknown") {
    return {
      issuable: false,
      reason: "eligibility_unknown",
      ...(input.unknownReason ? { unknownReason: input.unknownReason } : {})
    };
  }

  if (input.eligibilityStatus !== "eligible") {
    return { issuable: false, reason: "not_eligible" };
  }

  return { issuable: true };
}

export interface CertificateCompetencySnapshotEntry {
  competencyStableId: string;
  competencyVersion: number;
}

export interface CertificateEvidenceSnapshotEntry {
  evidenceId: string;
  competencyStableId: string;
  competencyVersion: number;
}

export interface CertificateIssuanceSnapshot {
  competencies: CertificateCompetencySnapshotEntry[];
  evidence: CertificateEvidenceSnapshotEntry[];
  /** Distinct evidence ids, for the transaction-time integrity pin. */
  evidenceIds: string[];
}

/**
 * Assembles the historical reference snapshot that justified issuance.
 *
 * References only. No evidence content, digest, outcome, effective state,
 * correction history or provider payload is copied — Wave 7 remains the single
 * source of Evidence truth, and the snapshot never claims those references stay
 * valid forever.
 *
 * ## Completeness of the integrity pin set
 *
 * A CERT-002 result becomes `eligible` through TWO independent gates: every
 * required competency satisfied, AND every definition-level Evidence policy
 * satisfied. Those gates do not draw on the same Evidence.
 *
 * CERT-002 counts a policy over Evidence linked to ANY of the definition's
 * requirements — including requirements marked `required: false`. So Evidence
 * attached only to an optional competency can still be the reason a policy
 * reached its `minimumCount`, and therefore the reason the student is eligible
 * at all.
 *
 * `evidenceIds` is consequently the union of both gates:
 *
 *   - Evidence satisfying the required competencies, and
 *   - Evidence counted by each Evidence policy (`policy.satisfyingEvidenceIds`,
 *     which CERT-002 already reports).
 *
 * Nothing is recomputed here: both lists are read from the authoritative
 * evaluation result. Evidence that did not contribute to either gate is not
 * pinned, so the set stays exactly as wide as the justification.
 */
export function buildCertificateIssuanceSnapshot(
  result: Pick<
    CertificateEligibilityResult,
    "competencyRequirements" | "evidencePolicies"
  >
): CertificateIssuanceSnapshot {
  const requirements = [...(result.competencyRequirements ?? [])].sort(
    (left, right) =>
      left.competencyStableId.localeCompare(right.competencyStableId) ||
      left.competencyVersion - right.competencyVersion
  );

  const satisfied = requirements.filter(
    (requirement) => requirement.satisfied === true
  );

  // The competencies the certificate demanded. Optional requirements never
  // gated issuance, so they are not part of the competency justification even
  // when their Evidence supported a policy.
  const competencies: CertificateCompetencySnapshotEntry[] = satisfied
    .filter((requirement) => requirement.required === true)
    .map((requirement) => ({
      competencyStableId: requirement.competencyStableId,
      competencyVersion: requirement.competencyVersion
    }));

  // Gate 1 — Evidence satisfying the required competencies.
  const contributing = new Set<string>();
  for (const requirement of satisfied) {
    if (requirement.required !== true) continue;
    for (const evidenceId of requirement.satisfyingEvidenceIds ?? []) {
      contributing.add(evidenceId);
    }
  }

  // Gate 2 — Evidence counted toward each Evidence policy, as reported by the
  // authoritative evaluation.
  for (const policy of result.evidencePolicies ?? []) {
    for (const evidenceId of policy.satisfyingEvidenceIds ?? []) {
      contributing.add(evidenceId);
    }
  }

  // Provenance rows, resolved back to the exact competency version each piece
  // of contributing Evidence was linked to.
  const evidence: CertificateEvidenceSnapshotEntry[] = [];
  for (const requirement of satisfied) {
    for (const evidenceId of [
      ...new Set(requirement.satisfyingEvidenceIds ?? [])
    ].sort()) {
      if (!contributing.has(evidenceId)) continue;
      evidence.push({
        evidenceId,
        competencyStableId: requirement.competencyStableId,
        competencyVersion: requirement.competencyVersion
      });
    }
  }

  return {
    competencies,
    evidence,
    // The complete integrity pin set. Broader than the provenance rows only if
    // a contributing Evidence id could not be mapped back to a satisfied
    // requirement, which fails safe toward pinning more rather than less.
    evidenceIds: [...contributing].sort()
  };
}

/**
 * The result of an issuance request.
 *
 * `alreadyIssued` distinguishes a first issuance from an idempotent replay, so
 * a retry after a lost network response is never presented as a new
 * certificate.
 */
export interface CertificateIssuanceResult {
  certificate: IssuedCertificate;
  alreadyIssued: boolean;
}
