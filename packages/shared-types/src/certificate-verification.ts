import type { CertificateLifecycleStatus } from "./certificate-lifecycle";

/**
 * CERT-005 — Certificate Verification.
 *
 * Pure model for the public verification surface: what a verifier may learn,
 * and nothing else.
 *
 * ## Privacy boundary
 *
 * This is the platform's only public data surface. The payload carries **no
 * holder identity of any kind** — no display name, no email, no user id, no
 * masked form — and no internal certificate UUID. It carries no Evidence: no
 * evidence ids, source references, outcomes, scores, attempts, lab or session
 * identifiers, correction history or competency database ids.
 *
 * A verification page must never become a public student profile.
 *
 * ## Ownership boundary
 *
 * CERT-004 owns lifecycle truth; this module never derives a status. CERT-006
 * owns the private portfolio, CERT-007 export and sharing, CERT-008 the
 * revoke/correct/supersede/restore workflows, and CERT-009 branding and QR.
 * None appear here.
 */

/**
 * Public verification reference minted by CERT-003.
 *
 * 192 bits of randomness behind a fixed prefix. Format is validated before any
 * database round trip, so a malformed reference never becomes a query.
 */
export const CERTIFICATE_VERIFICATION_REFERENCE_PATTERN =
  /^cert1_[a-f0-9]{48}$/;

export function isCertificateVerificationReference(value: unknown): boolean {
  return (
    typeof value === "string" &&
    CERTIFICATE_VERIFICATION_REFERENCE_PATTERN.test(value)
  );
}

/**
 * A competency the certificate attests to, at the exact pinned version.
 *
 * Title and version only (ruling 3). No competency database id, and nothing
 * about how the competency was demonstrated.
 */
export interface VerifiedCompetencySummary {
  title: string;
  version: number;
}

/**
 * The complete public payload. Every field here is approved by CERT-005
 * section 5; nothing else may be added without a specification change.
 */
export interface CertificateVerificationRecord {
  certificateTitle: string;
  issuer: string;
  certificateDefinitionStableId: string;
  certificateDefinitionVersion: number;
  issuedAt: string;
  status: CertificateLifecycleStatus;
  statusEffectiveAt: string;
  expiresAt?: string;
  competencySummary: VerifiedCompetencySummary[];
  verifiedAt: string;
}

/**
 * The four outcomes of a verification attempt.
 *
 * `unavailable` exists because CERT-005 section 12 forbids reporting a valid
 * certificate as invalid when infrastructure or the lifecycle replay cannot
 * answer. It is never collapsed into `not_found`.
 */
export type CertificateVerificationOutcome =
  | "verified"
  | "not_found"
  | "malformed_reference"
  | "unavailable";

export const CERTIFICATE_VERIFICATION_OUTCOMES: readonly CertificateVerificationOutcome[] =
  ["verified", "not_found", "malformed_reference", "unavailable"];

export type CertificateVerificationResult =
  | { outcome: "verified"; certificate: CertificateVerificationRecord }
  | { outcome: "not_found" }
  | { outcome: "malformed_reference" }
  | { outcome: "unavailable" };

/**
 * Fields that must never appear in a public verification payload.
 *
 * Held as data so tests and the verifier can assert the prohibition directly
 * rather than restating it.
 */
export const CERTIFICATE_VERIFICATION_FORBIDDEN_FIELDS: readonly string[] = [
  "id",
  "certificateId",
  "userId",
  "user_id",
  "studentId",
  "holderName",
  "displayName",
  "email",
  "verificationId",
  "certificateDefinitionId",
  "evidenceIds",
  "evidenceSnapshot",
  "evidenceOutcome",
  "score",
  "attemptId",
  "labSessionId",
  "correctionHistory",
  "competencyId"
];

/**
 * Builds the public payload from already-resolved authoritative inputs.
 *
 * Pure and total: it derives no status, reads no clock, and performs no
 * lookup. `status` and `statusEffectiveAt` come from CERT-004's resolver, and
 * `verifiedAt` from trusted server time supplied by the caller.
 *
 * The explicit field list is the privacy control: adding a field to the source
 * data cannot leak it, because nothing is spread into the result.
 */
export function buildCertificateVerificationRecord(input: {
  certificateTitle: string;
  issuer: string;
  certificateDefinitionStableId: string;
  certificateDefinitionVersion: number;
  issuedAt: string;
  status: CertificateLifecycleStatus;
  statusEffectiveAt: string;
  expiresAt?: string | null;
  competencySummary: readonly VerifiedCompetencySummary[];
  verifiedAt: string;
}): CertificateVerificationRecord {
  return {
    certificateTitle: input.certificateTitle,
    issuer: input.issuer,
    certificateDefinitionStableId: input.certificateDefinitionStableId,
    certificateDefinitionVersion: input.certificateDefinitionVersion,
    issuedAt: input.issuedAt,
    status: input.status,
    statusEffectiveAt: input.statusEffectiveAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    competencySummary: [...input.competencySummary]
      .map((entry) => ({ title: entry.title, version: entry.version }))
      .sort(
        (left, right) =>
          left.title.localeCompare(right.title) || left.version - right.version
      ),
    verifiedAt: input.verifiedAt
  };
}

/**
 * Wording for a verification outcome.
 *
 * An expired, revoked, superseded or corrected certificate is still an
 * authentic issued record, so the wording states what it is rather than
 * reducing it to invalid.
 */
export function describeVerificationOutcome(
  outcome: CertificateVerificationOutcome
): string {
  switch (outcome) {
    case "verified":
      return "This certificate was issued by the Technical Learning Platform.";
    case "not_found":
      return "We could not find a certificate for that reference.";
    case "malformed_reference":
      return "That verification reference is not in a valid format.";
    default:
      return "Verification is temporarily unavailable. This does not mean the certificate is invalid.";
  }
}

/** Readable status label. Text, never colour alone (CERT-005 section 10). */
export function describeVerifiedStatus(
  status: CertificateLifecycleStatus
): string {
  switch (status) {
    case "active":
      return "Active";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "superseded":
      return "Superseded";
    default:
      return "Corrected";
  }
}

/** What the status means to a verifier, in one plain sentence. */
export function explainVerifiedStatus(
  status: CertificateLifecycleStatus
): string {
  switch (status) {
    case "active":
      return "This certificate is current.";
    case "expired":
      return "This certificate was genuinely issued and has passed its validity period.";
    case "revoked":
      return "This certificate was issued but has since been revoked, and should not be relied upon.";
    case "superseded":
      return "This certificate was issued and has since been replaced by a newer certificate.";
    default:
      return "This certificate was issued and has since been corrected.";
  }
}
