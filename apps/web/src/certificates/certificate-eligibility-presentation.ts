import type {
  CertificateCompetencyRequirementResult,
  CertificateEligibilityResult,
  CertificateEligibilityStatus,
  CertificateEvidencePolicyResult
} from "@tlp/shared-types";

/**
 * CERT-002 — student-facing wording for an eligibility result.
 *
 * Every string a student reads is produced here, as pure functions, so it can be
 * unit tested without a rendered DOM. The repository has no jsdom or
 * DOM-testing stack by design, and the Wave 7 verifier fails the build if one is
 * added — so presentation logic that matters must live outside the component.
 *
 * ## Truth boundary
 *
 * This module computes NO eligibility. It never counts qualifying Evidence,
 * never decides whether a competency is satisfied, never compares a count to a
 * minimum, and never substitutes a competency version. It reads the decisions
 * the CERT-002 backend already made — `status`, `satisfied`, `qualifyingCount`,
 * `unsatisfiedCompetencyCount` — and chooses words for them.
 *
 * ## Tone
 *
 * Calm by design: no guilt, no urgency, no streaks, no "falling behind". If
 * requirements remain, they are simply listed.
 */

/** Status wording. Eligible never implies a certificate has been issued. */
export function describeEligibilityStatus(
  status: CertificateEligibilityStatus
): string {
  switch (status) {
    case "eligible":
      return "You've met the current requirements for this certificate.";
    case "ineligible":
      return "You still have requirements to complete.";
    default:
      return "We can't determine your eligibility right now.";
  }
}

/** Short text label. Never a colour or icon alone. */
export function describeEligibilityStatusLabel(
  status: CertificateEligibilityStatus
): string {
  switch (status) {
    case "eligible":
      return "Requirements met";
    case "ineligible":
      return "Requirements remaining";
    default:
      return "Not determined yet";
  }
}

/**
 * Explains an undetermined result.
 *
 * Each reason is framed as a state of the system or the review process, never
 * as a student failure, so "we cannot tell" is never mistaken for "you did not
 * meet a requirement" (CERT-002 section 10).
 */
export function describeUnknownReason(
  result: Pick<CertificateEligibilityResult, "unknownReason">
): string {
  switch (result.unknownReason) {
    case "evidence_under_unresolved_review":
      return "Some of the evidence for this certificate is being reviewed, so we can't confirm your eligibility yet. Nothing is wrong with your work — this simply hasn't finished.";
    case "dependency_unavailable":
      return "We couldn't reach the information needed to check this. Please try again in a little while.";
    case "definition_not_published":
      return "This certificate isn't available for eligibility checks at the moment. This is about the certificate, not about your progress.";
    default:
      return "We can't determine your eligibility right now. Please try again in a little while.";
  }
}

/** Whether the result should be presented as an explanation rather than a verdict. */
export function isUndetermined(
  result: Pick<CertificateEligibilityResult, "status">
): boolean {
  return result.status === "unknown";
}

/**
 * Calm summary of what remains.
 *
 * Reads the counts the backend already computed. It performs no arithmetic on
 * requirements beyond adding two backend-supplied totals for display.
 */
export function describeRemainingWork(
  result: Pick<
    CertificateEligibilityResult,
    "status" | "unsatisfiedCompetencyCount" | "unsatisfiedPolicyCount"
  >
): string {
  if (result.status === "eligible") {
    return "Nothing remaining.";
  }

  if (result.status === "unknown") {
    return "We'll show what remains once this can be checked.";
  }

  const remaining =
    result.unsatisfiedCompetencyCount + result.unsatisfiedPolicyCount;

  if (remaining === 0) {
    return "No outstanding requirements are listed.";
  }

  return `${remaining} ${remaining === 1 ? "requirement" : "requirements"} remaining.`;
}

/** Per-requirement state as words. */
export function describeRequirementState(
  requirement: Pick<CertificateCompetencyRequirementResult, "satisfied">
): string {
  return requirement.satisfied ? "Satisfied" : "Still needed";
}

/**
 * Why a requirement is not yet met.
 *
 * `version_not_evidenced` is explained plainly, because a student who has done
 * the work would otherwise have no way to understand why it does not count.
 */
export function describeRequirementDetail(
  requirement: Pick<
    CertificateCompetencyRequirementResult,
    "satisfied" | "unmetReason" | "satisfyingEvidenceIds"
  >
): string {
  if (requirement.satisfied) {
    const count = requirement.satisfyingEvidenceIds.length;
    return `Met by ${count} ${count === 1 ? "piece" : "pieces"} of your evidence.`;
  }

  if (requirement.unmetReason === "version_not_evidenced") {
    return "Your evidence for this skill is from a different version of it, so it doesn't count towards this certificate.";
  }

  return "No evidence counts towards this yet.";
}

/** Human wording for a canonical Evidence source type. */
export function describeEvidenceSourceLabel(
  evidenceSourceType: CertificateEvidencePolicyResult["evidenceSourceType"]
): string {
  switch (evidenceSourceType) {
    case "assessment_attempt":
      return "Assessments";
    case "lab_validation":
      return "Hands-on labs";
    case "manual_authoritative":
      return "Reviewed submissions";
    default:
      return "Platform records";
  }
}

/** Progress wording for an Evidence policy, using backend-supplied counts. */
export function describeEvidencePolicyProgress(
  policy: Pick<CertificateEvidencePolicyResult, "qualifyingCount" | "minimumCount">
): string {
  return `${policy.qualifyingCount} of ${policy.minimumCount} counted so far.`;
}

export function describeEvidencePolicyState(
  policy: Pick<CertificateEvidencePolicyResult, "satisfied">
): string {
  return policy.satisfied ? "Satisfied" : "Still needed";
}

/**
 * Polite status-region text for the load lifecycle.
 *
 * One sentence per state so the live region announces a single, meaningful
 * change rather than a stream of updates.
 */
export function describeLoadingStatus(input: {
  loading: boolean;
  hasSelection: boolean;
  hasResult: boolean;
}): string {
  if (!input.hasSelection) {
    return "Choose a certificate to check your eligibility.";
  }
  if (input.loading) {
    return "Checking your eligibility…";
  }
  if (input.hasResult) {
    return "Eligibility check complete.";
  }
  return "No eligibility result to show.";
}

/** Exact version wording for secondary detail. Never labelled latest or current. */
export function describeCertificateVersion(
  result: Pick<CertificateEligibilityResult, "certificateDefinitionVersion">
): string {
  return `Version ${result.certificateDefinitionVersion}`;
}
