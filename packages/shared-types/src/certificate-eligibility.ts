import type {
  CertificateDefinition,
  CertificateDefinitionState
} from "./certificate-definition";
import type { AuthoritativeCompetencyEvidenceReference } from "./evidence-competency";
import type { EvidenceSourceType } from "./evidence";

/**
 * CERT-002 — Certificate Eligibility Rules.
 *
 * Deterministically decides whether a student currently satisfies a specific
 * published Certificate Definition version.
 *
 * This module evaluates. It does not issue. There is no certificate record, no
 * certificate id, no verification identifier, no lifecycle state and no
 * expiration timestamp anywhere in this file — those belong to CERT-003
 * (issuance), CERT-004 (record and lifecycle) and CERT-005 (verification).
 *
 * It is a pure function of its inputs: no I/O, no clock read, no randomness.
 * The same inputs always produce the same result, which is what makes an
 * eligibility decision reproducible from authoritative data.
 *
 * ## Reuse boundary
 *
 * CERT-002 does NOT define what makes Evidence trustworthy or qualifying. That
 * is Wave 7's canonical rule, already resolved per reference into
 * `AuthoritativeCompetencyEvidenceReference.qualifiesForDemonstration` by
 * `getAuthoritativeCompetencyEvidenceReferences`, which combines
 * `resolveEffectiveEvidenceState`, `isEffectivelyTrustedEvidence`,
 * `evaluateEvidenceLinkEligibility`, `deriveEvidenceOutcome` and
 * `qualifiesAsDemonstrationEvidence`.
 *
 * This module reads that verdict. It never recomputes it, and there is
 * deliberately no second "qualifying evidence" rule inside the Certificate
 * Engine. Invalidated, superseded, failed, incomplete, indeterminate and
 * untrusted Evidence are therefore excluded by Wave 7, not by CERT-002.
 */

/**
 * The three outcomes CERT-002 section 12 and section 13 require be kept
 * distinct: `eligible`, `ineligible`, and Eligibility Unknown / Temporarily
 * Unavailable.
 *
 * A dependency failure, an unresolved Evidence review, and a definition that is
 * not published are never reported as ordinary student ineligibility.
 */
export type CertificateEligibilityStatus =
  | "eligible"
  | "ineligible"
  | "unknown";

export const CERTIFICATE_ELIGIBILITY_STATUSES: readonly CertificateEligibilityStatus[] =
  ["eligible", "ineligible", "unknown"];

/**
 * Why an evaluation could not produce an eligible/ineligible determination.
 *
 * - `definition_not_published` — normal student eligibility applies only to a
 *   published Certificate Definition version. Draft, review and retired
 *   versions are not evaluable; that is not a statement about the student.
 * - `evidence_under_unresolved_review` — Evidence relevant to this definition
 *   has an open privileged review. The student is not ineligible; the answer is
 *   not yet determinable. Once the review resolves, a later evaluation decides
 *   again from current authoritative state.
 * - `dependency_unavailable` — Evidence or curriculum data could not be read.
 */
export type CertificateEligibilityUnknownReason =
  | "definition_not_published"
  | "evidence_under_unresolved_review"
  | "dependency_unavailable";

export const CERTIFICATE_ELIGIBILITY_UNKNOWN_REASONS: readonly CertificateEligibilityUnknownReason[] =
  [
    "definition_not_published",
    "evidence_under_unresolved_review",
    "dependency_unavailable"
  ];

/**
 * Why a pinned competency requirement is not satisfied.
 *
 * `version_not_evidenced` is reported when the student holds qualifying
 * Evidence for the competency's stable id but at a different version. The
 * requirement still fails — a certificate pins an exact version and no mapping
 * or latest-version fallback exists — but the student is told precisely why.
 */
export type CertificateRequirementUnmetReason =
  | "no_qualifying_evidence"
  | "version_not_evidenced";

export interface CertificateCompetencyRequirementResult {
  competencyStableId: string;
  /** The exact pinned version. Never resolved to latest. */
  competencyVersion: number;
  required: boolean;
  satisfied: boolean;
  /** Evidence that satisfied this exact pinned version, sorted and distinct. */
  satisfyingEvidenceIds: string[];
  unmetReason?: CertificateRequirementUnmetReason;
}

export interface CertificateEvidencePolicyResult {
  evidenceSourceType: EvidenceSourceType;
  minimumCount: number;
  /**
   * Carried from the Certificate Definition and reported for transparency.
   *
   * It does not relax the Wave 7 qualification gate: counting is always
   * restricted to references Wave 7 already marked
   * `qualifiesForDemonstration`. Under the current MVP qualifying accessor a
   * value of `false` is therefore operationally redundant — preserved as a
   * declarative CERT-001 field rather than weakening Evidence semantics.
   */
  requirePositiveOutcome: boolean;
  /** Distinct qualifying Evidence records of this source type. */
  qualifyingCount: number;
  satisfied: boolean;
  satisfyingEvidenceIds: string[];
}

export interface CertificateEligibilityResult {
  status: CertificateEligibilityStatus;
  /** Absent only when the definition itself could not be loaded. */
  certificateDefinitionId?: string;
  certificateDefinitionStableId: string;
  /** The exact definition version evaluated. */
  certificateDefinitionVersion: number;
  definitionPublicationState?: CertificateDefinitionState;
  evaluatedAt: string;
  unknownReason?: CertificateEligibilityUnknownReason;
  competencyRequirements: CertificateCompetencyRequirementResult[];
  evidencePolicies: CertificateEvidencePolicyResult[];
  unsatisfiedCompetencyCount: number;
  unsatisfiedPolicyCount: number;
}

/**
 * The minimum a student needs to choose a certificate to be evaluated against.
 *
 * Lives here rather than in its own module because it exists solely as the
 * selection input to an eligibility evaluation — it is not a second Certificate
 * Definition model, and it deliberately carries none of CERT-001's authoring or
 * policy fields (issuer, effective date, expiration policy, verification
 * policy, publication state, supersession, requirements). Those are either
 * administrative or belong to the evaluation result, not to picking a
 * certificate from a list.
 *
 * `stableId` and `version` are implementation identifiers the student never
 * types: they travel with the chosen option so the exact selected version is
 * the one evaluated.
 */
export interface StudentCertificateDefinitionOption {
  stableId: string;
  version: number;
  title: string;
  /** Accessible plain-language title required by CERT-001 section 10. */
  plainLanguageTitle: string;
  description?: string;
}

/**
 * Labels a set of selectable definitions for a student.
 *
 * Version text is added only where a title alone would be ambiguous, so a
 * single certificate reads as its plain name. No option is ever labelled
 * "latest", "current", "recommended" or "preferred" — CERT-001 defines no such
 * precedence, and inventing one here would contradict the exact-version model.
 */
export function labelCertificateDefinitionOptions(
  options: readonly StudentCertificateDefinitionOption[]
): Array<StudentCertificateDefinitionOption & { label: string }> {
  const titleCounts = new Map<string, number>();

  for (const option of options) {
    const title = option.plainLanguageTitle || option.title;
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  return options.map((option) => {
    const title = option.plainLanguageTitle || option.title;
    const ambiguous = (titleCounts.get(title) ?? 0) > 1;

    return {
      ...option,
      label: ambiguous ? `${title} — Version ${option.version}` : title
    };
  });
}

export interface EvaluateCertificateEligibilityInput {
  definition: CertificateDefinition;
  /**
   * Authoritative Evidence competency references for this student, covering
   * every competency stable id the definition requires. The full historical set
   * is expected — including non-qualifying references — so the evaluation can
   * explain a version mismatch and detect an open review without a second
   * query.
   */
  references: readonly AuthoritativeCompetencyEvidenceReference[];
  /** Supplied by the caller so this function stays a pure function. */
  evaluatedAt: string;
}

function sortedDistinct(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function requirementKey(stableId: string, version: number): string {
  return `${stableId}@${version}`;
}

/**
 * Builds an unknown result that still carries the definition identity, so a
 * caller can always report which definition version was being evaluated.
 */
export function buildUnknownEligibilityResult(input: {
  certificateDefinitionStableId: string;
  certificateDefinitionVersion: number;
  certificateDefinitionId?: string;
  definitionPublicationState?: CertificateDefinitionState;
  unknownReason: CertificateEligibilityUnknownReason;
  evaluatedAt: string;
  competencyRequirements?: CertificateCompetencyRequirementResult[];
  evidencePolicies?: CertificateEvidencePolicyResult[];
}): CertificateEligibilityResult {
  const competencyRequirements = input.competencyRequirements ?? [];
  const evidencePolicies = input.evidencePolicies ?? [];

  return {
    status: "unknown",
    ...(input.certificateDefinitionId
      ? { certificateDefinitionId: input.certificateDefinitionId }
      : {}),
    certificateDefinitionStableId: input.certificateDefinitionStableId,
    certificateDefinitionVersion: input.certificateDefinitionVersion,
    ...(input.definitionPublicationState
      ? { definitionPublicationState: input.definitionPublicationState }
      : {}),
    evaluatedAt: input.evaluatedAt,
    unknownReason: input.unknownReason,
    competencyRequirements,
    evidencePolicies,
    unsatisfiedCompetencyCount: competencyRequirements.filter(
      (requirement) => requirement.required && !requirement.satisfied
    ).length,
    unsatisfiedPolicyCount: evidencePolicies.filter(
      (policy) => !policy.satisfied
    ).length
  };
}

/**
 * Deterministically evaluates a student's eligibility for one exact
 * Certificate Definition version.
 *
 * Order of decision, per CERT-002 section 8 and the approved rulings:
 *
 * 1. A definition that is not published is not evaluable for normal student
 *    eligibility — reported as unknown, never as ineligible.
 * 2. Relevant Evidence under an unresolved review makes the answer
 *    undeterminable — reported as unknown, never as ineligible.
 * 3. Every required competency must be satisfied by qualifying Evidence linked
 *    to that exact pinned version.
 * 4. Every declarative Evidence policy must be satisfied.
 * 5. All of the above must hold (AND), otherwise the student is ineligible.
 *
 * The requirement-by-requirement breakdown is always computed, including for
 * unknown results, so a student can still see what is complete and what
 * remains (CERT-002 section 3).
 */
export function evaluateCertificateEligibility(
  input: EvaluateCertificateEligibilityInput
): CertificateEligibilityResult {
  const { definition, references, evaluatedAt } = input;

  // Pinned requirements, in a deterministic order.
  const requirements = [...(definition.requiredCompetencies ?? [])].sort(
    (left, right) =>
      left.competencyStableId.localeCompare(right.competencyStableId) ||
      left.competencyVersion - right.competencyVersion
  );

  const pinnedKeys = new Set(
    requirements.map((requirement) =>
      requirementKey(
        requirement.competencyStableId,
        requirement.competencyVersion
      )
    )
  );

  // Wave 7 already decided which references qualify. CERT-002 only reads that
  // verdict; it never recomputes trust or outcome.
  const qualifyingReferences = references.filter(
    (reference) => reference.qualifiesForDemonstration === true
  );

  const competencyRequirements: CertificateCompetencyRequirementResult[] =
    requirements.map((requirement) => {
      // Exact version match. Evidence linked to another version of the same
      // competency never satisfies this pin.
      const satisfying = qualifyingReferences.filter(
        (reference) =>
          reference.competencyStableId === requirement.competencyStableId &&
          reference.competencyVersion === requirement.competencyVersion
      );

      const satisfyingEvidenceIds = sortedDistinct(
        satisfying.map((reference) => reference.evidenceId)
      );

      if (satisfyingEvidenceIds.length > 0) {
        return {
          competencyStableId: requirement.competencyStableId,
          competencyVersion: requirement.competencyVersion,
          required: requirement.required,
          satisfied: true,
          satisfyingEvidenceIds
        };
      }

      // Distinguish "nothing at all" from "something, but at another version",
      // so the student is told precisely why the pin failed.
      const otherVersionQualifies = qualifyingReferences.some(
        (reference) =>
          reference.competencyStableId === requirement.competencyStableId &&
          reference.competencyVersion !== requirement.competencyVersion
      );

      return {
        competencyStableId: requirement.competencyStableId,
        competencyVersion: requirement.competencyVersion,
        required: requirement.required,
        satisfied: false,
        satisfyingEvidenceIds: [],
        unmetReason: otherVersionQualifies
          ? "version_not_evidenced"
          : "no_qualifying_evidence"
      };
    });

  // Evidence policies are definition-level, evaluated per Evidence source type.
  //
  // Counting is scoped to Evidence that qualifies AND links to one of the
  // definition's pinned required competencies, so unrelated Evidence cannot
  // satisfy a certificate's policy. Distinct Evidence ids are counted, so one
  // record linked to two required competencies counts once.
  const policyRelevantReferences = qualifyingReferences.filter((reference) =>
    pinnedKeys.has(
      requirementKey(reference.competencyStableId, reference.competencyVersion)
    )
  );

  const evidencePolicies: CertificateEvidencePolicyResult[] = [
    ...(definition.evidencePolicies ?? [])
  ]
    .sort((left, right) =>
      left.evidenceSourceType.localeCompare(right.evidenceSourceType)
    )
    .map((policy) => {
      const matching = policyRelevantReferences.filter(
        (reference) => reference.evidenceSourceType === policy.evidenceSourceType
      );

      const satisfyingEvidenceIds = sortedDistinct(
        matching.map((reference) => reference.evidenceId)
      );

      return {
        evidenceSourceType: policy.evidenceSourceType,
        minimumCount: policy.minimumCount,
        requirePositiveOutcome: policy.requirePositiveOutcome,
        qualifyingCount: satisfyingEvidenceIds.length,
        satisfied: satisfyingEvidenceIds.length >= policy.minimumCount,
        satisfyingEvidenceIds
      };
    });

  const unsatisfiedCompetencyCount = competencyRequirements.filter(
    (requirement) => requirement.required && !requirement.satisfied
  ).length;

  const unsatisfiedPolicyCount = evidencePolicies.filter(
    (policy) => !policy.satisfied
  ).length;

  const base = {
    certificateDefinitionId: definition.id,
    certificateDefinitionStableId: definition.stableId,
    certificateDefinitionVersion: definition.version,
    definitionPublicationState: definition.publicationState,
    evaluatedAt,
    competencyRequirements,
    evidencePolicies,
    unsatisfiedCompetencyCount,
    unsatisfiedPolicyCount
  };

  // 1. Only a published version supports normal student eligibility.
  if (definition.publicationState !== "published") {
    return {
      ...base,
      status: "unknown",
      unknownReason: "definition_not_published"
    };
  }

  // 2. An unresolved review of relevant Evidence makes the answer
  //    undeterminable. Scoped to the pinned requirements so an open review on
  //    unrelated Evidence cannot block this certificate.
  const relevantUnderReview = references.some(
    (reference) =>
      reference.evidenceUnderReview === true &&
      pinnedKeys.has(
        requirementKey(
          reference.competencyStableId,
          reference.competencyVersion
        )
      )
  );

  if (relevantUnderReview) {
    return {
      ...base,
      status: "unknown",
      unknownReason: "evidence_under_unresolved_review"
    };
  }

  // 3-5. All required competencies AND all Evidence policies.
  const eligible =
    unsatisfiedCompetencyCount === 0 && unsatisfiedPolicyCount === 0;

  return {
    ...base,
    status: eligible ? "eligible" : "ineligible"
  };
}

export function isCertificateEligibilityStatus(
  value: unknown
): value is CertificateEligibilityStatus {
  return (
    value === "eligible" || value === "ineligible" || value === "unknown"
  );
}
