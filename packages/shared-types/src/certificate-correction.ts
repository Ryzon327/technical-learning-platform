import type { CertificateLifecycleStatus } from "./certificate-lifecycle";

/**
 * CERT-008 — Certificate Revocation and Correction.
 *
 * The workflow vocabulary around a privileged certificate correction: which
 * administrative action was taken, why, by whom, and with what replacement.
 *
 * ## Authority boundary
 *
 * CERT-004 remains the sole lifecycle authority. It owns the states, the
 * permitted edges, transition validation, contiguity, serialization and
 * effective status.
 *
 * Nothing here decides whether a transition is legal. `certificateCorrection
 * TargetStatus` is a naming translation from CERT-008 vocabulary to the CERT-004
 * status it drives — not a second state machine. Legality is decided by
 * `isValidCertificateLifecycleTransition` and, authoritatively, by the database
 * guard CERT-004 installed.
 *
 * Pure module: no I/O, no randomness, no clock, no AI. CERT-008 section 10
 * forbids AI from revoking, restoring or correcting a certificate.
 */

export type CertificateCorrectionAction =
  | "revoke"
  | "correct"
  | "supersede"
  | "restore";

export const CERTIFICATE_CORRECTION_ACTIONS: readonly CertificateCorrectionAction[] =
  ["revoke", "correct", "supersede", "restore"];

export function isCertificateCorrectionAction(
  value: unknown
): value is CertificateCorrectionAction {
  return (
    typeof value === "string" &&
    (CERTIFICATE_CORRECTION_ACTIONS as readonly string[]).includes(value)
  );
}

/** CERT-008 section 8: a correction may never be recorded without a reason. */
export const CERTIFICATE_CORRECTION_REASON_MIN_LENGTH = 8;
export const CERTIFICATE_CORRECTION_REASON_MAX_LENGTH = 500;

export type CertificateCorrectionReasonError =
  | "reason_missing"
  | "reason_too_short"
  | "reason_too_long";

/**
 * Validates the mandatory reason.
 *
 * Mirrors the database check exactly, so the API refuses a reasonless
 * correction with a clear message instead of surfacing a constraint violation.
 * The database remains the authority; this is not the only enforcement.
 */
export function validateCertificateCorrectionReason(
  reason: unknown
): CertificateCorrectionReasonError | null {
  if (typeof reason !== "string" || reason.trim() === "") {
    return "reason_missing";
  }
  if (reason.trim().length < CERTIFICATE_CORRECTION_REASON_MIN_LENGTH) {
    return "reason_too_short";
  }
  if (reason.trim().length > CERTIFICATE_CORRECTION_REASON_MAX_LENGTH) {
    return "reason_too_long";
  }
  return null;
}

export function describeCertificateCorrectionReasonError(
  error: CertificateCorrectionReasonError
): string {
  switch (error) {
    case "reason_missing":
      return "A reason is required to change a certificate.";
    case "reason_too_short":
      return `A reason must be at least ${CERTIFICATE_CORRECTION_REASON_MIN_LENGTH} characters.`;
    default:
      return `A reason must be ${CERTIFICATE_CORRECTION_REASON_MAX_LENGTH} characters or fewer.`;
  }
}

/**
 * The CERT-004 status a CERT-008 action drives.
 *
 * A naming translation, not a transition rule: whether the certificate may
 * actually move to this status is CERT-004's decision.
 */
export function certificateCorrectionTargetStatus(
  action: CertificateCorrectionAction
): CertificateLifecycleStatus {
  switch (action) {
    case "revoke":
      return "revoked";
    case "correct":
      return "corrected";
    case "supersede":
      return "superseded";
    default:
      return "active";
  }
}

/** Only supersession names a replacement certificate. */
export function certificateCorrectionRequiresReplacement(
  action: CertificateCorrectionAction
): boolean {
  return action === "supersede";
}

export type CertificateCorrectionReplacementError =
  | "replacement_missing"
  | "replacement_not_allowed"
  | "replacement_is_self";

export function validateCertificateCorrectionReplacement(input: {
  action: CertificateCorrectionAction;
  certificateId: string;
  replacementCertificateId?: string;
}): CertificateCorrectionReplacementError | null {
  const replacement = input.replacementCertificateId?.trim();

  if (certificateCorrectionRequiresReplacement(input.action)) {
    if (!replacement) return "replacement_missing";
    if (replacement === input.certificateId) return "replacement_is_self";
    return null;
  }

  return replacement ? "replacement_not_allowed" : null;
}

export function describeCertificateCorrectionReplacementError(
  error: CertificateCorrectionReplacementError
): string {
  switch (error) {
    case "replacement_missing":
      return "Superseding a certificate requires the replacement certificate.";
    case "replacement_not_allowed":
      return "Only supersession may name a replacement certificate.";
    default:
      return "A certificate cannot replace itself.";
  }
}

/**
 * One recorded correction, as an administrator reviewing history sees it.
 *
 * `actorId` is present because CERT-008 section 12 requires the privileged
 * history to show who acted. The student-facing projection below removes it.
 */
export interface CertificateCorrectionRecord {
  correctionId: string;
  certificateId: string;
  sequenceNumber: number;
  action: CertificateCorrectionAction;
  reason: string;
  actorId: string;
  actorRole: string;
  previousStatus: CertificateLifecycleStatus;
  newStatus: CertificateLifecycleStatus;
  replacementCertificateId?: string;
  occurredAt: string;
}

/**
 * What the certificate's owner may see about a change to their own credential.
 *
 * CERT-008 section 3 promises the student a transparent explanation. It does
 * not promise them the identity of the administrator who acted, so the actor is
 * projected out by explicit assignment rather than omitted by convention.
 */
export interface StudentCertificateCorrection {
  action: CertificateCorrectionAction;
  reason: string;
  previousStatus: CertificateLifecycleStatus;
  newStatus: CertificateLifecycleStatus;
  occurredAt: string;
}

export function toStudentCertificateCorrection(
  record: CertificateCorrectionRecord
): StudentCertificateCorrection {
  return {
    action: record.action,
    reason: record.reason,
    previousStatus: record.previousStatus,
    newStatus: record.newStatus,
    occurredAt: record.occurredAt
  };
}

/** Fields a student-facing correction must never carry. */
export const CERTIFICATE_CORRECTION_STUDENT_FORBIDDEN_FIELDS: readonly string[] =
  [
    "actorId",
    "actorRole",
    "correctionId",
    "certificateId",
    "sequenceNumber",
    "replacementCertificateId",
    "userId",
    "user_id",
    "lifecycleEventId"
  ];

/** Plain-language wording for what an administrator did. */
export function describeCertificateCorrectionAction(
  action: CertificateCorrectionAction
): string {
  switch (action) {
    case "revoke":
      return "Revoked";
    case "correct":
      return "Corrected";
    case "supersede":
      return "Superseded";
    default:
      return "Restored";
  }
}

/** Plain-language wording for the student, explaining the change. */
export function explainCertificateCorrection(
  correction: StudentCertificateCorrection
): string {
  switch (correction.action) {
    case "revoke":
      return "This certificate was revoked and is no longer valid.";
    case "correct":
      return "This certificate was corrected. The original issuance is preserved in its history.";
    case "supersede":
      return "This certificate was replaced by a newer certificate.";
    default:
      return "This certificate was restored and is valid again.";
  }
}

/** Ordered oldest first, so a reader follows what happened in sequence. */
export function sortCertificateCorrections<
  T extends { sequenceNumber: number }
>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}
