/**
 * CERT-004 — Certificate Record and Lifecycle.
 *
 * Pure lifecycle machinery: the state model, transition validation, and a
 * fail-closed resolver that derives a certificate's effective status from
 * immutable issuance truth plus append-only history.
 *
 * ## Ownership boundary
 *
 * CERT-004 owns the model. **CERT-008 owns the revoke, correct, supersede and
 * restore workflows** — there is deliberately no reason, actor, replacement
 * reference or notification concept anywhere in this file, and no function here
 * decides that a transition *should* happen. `revoked -> active` is
 * representable because CERT-008 will own restore; CERT-004 exposes no restore
 * workflow.
 *
 * CERT-005 owns public verification. Nothing here is public.
 */

export type CertificateLifecycleStatus =
  | "active"
  | "superseded"
  | "expired"
  | "revoked"
  | "corrected";

export const CERTIFICATE_LIFECYCLE_STATUSES: readonly CertificateLifecycleStatus[] =
  ["active", "superseded", "expired", "revoked", "corrected"];

/** Every certificate begins active at issuance. There is no other origin. */
export const CERTIFICATE_INITIAL_STATUS: CertificateLifecycleStatus = "active";

export function isCertificateLifecycleStatus(
  value: unknown
): value is CertificateLifecycleStatus {
  return (
    typeof value === "string" &&
    (CERTIFICATE_LIFECYCLE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * The approved edges, and only these.
 *
 * `expired`, `superseded` and `corrected` are terminal for the MVP.
 * `revoked -> active` exists so the model can represent a CERT-008 restore;
 * CERT-004 never performs one.
 *
 * A transition must change the status: a no-op is not an event.
 */
const PERMITTED_TRANSITIONS: ReadonlyArray<
  readonly [CertificateLifecycleStatus, CertificateLifecycleStatus]
> = [
  ["active", "superseded"],
  ["active", "revoked"],
  ["active", "corrected"],
  ["active", "expired"],
  ["revoked", "active"]
];

export function isValidCertificateLifecycleTransition(
  from: CertificateLifecycleStatus,
  to: CertificateLifecycleStatus
): boolean {
  return PERMITTED_TRANSITIONS.some(
    ([permittedFrom, permittedTo]) => permittedFrom === from && permittedTo === to
  );
}

export function listPermittedCertificateLifecycleTransitions(): Array<{
  from: CertificateLifecycleStatus;
  to: CertificateLifecycleStatus;
}> {
  return PERMITTED_TRANSITIONS.map(([from, to]) => ({ from, to }));
}

/** A recorded lifecycle transition. Append-only; never rewritten. */
export interface CertificateLifecycleEvent {
  id: string;
  certificateId: string;
  sequenceNumber: number;
  previousStatus: CertificateLifecycleStatus;
  newStatus: CertificateLifecycleStatus;
  effectiveAt: string;
  occurredAt: string;
}

export type CertificateLifecycleSequenceError =
  | "SEQUENCE_GAP"
  | "PREVIOUS_STATUS_MISMATCH"
  | "INVALID_TRANSITION";

export interface EffectiveCertificateStatus {
  status: CertificateLifecycleStatus;
  /** When the reported status took effect. */
  effectiveAt: string;
  /** False when the recorded history could not be replayed coherently. */
  sequenceValid: boolean;
  sequenceError?: CertificateLifecycleSequenceError;
  transitionCount: number;
  /** Pinned at issuance. Absent means the certificate does not expire. */
  expiresAt?: string;
  /** True when the status is `expired` because the pinned date has passed. */
  expiredByTime: boolean;
}

function sortEvents(
  events: readonly CertificateLifecycleEvent[]
): CertificateLifecycleEvent[] {
  return [...events].sort(
    (left, right) => left.sequenceNumber - right.sequenceNumber
  );
}

/**
 * Derives the authoritative current status of a certificate.
 *
 * Inputs are the three sources of truth and nothing else: the immutable
 * issuance record, the expiry pinned at issuance, and the append-only history.
 * `now` is supplied by the caller from trusted server time, so this stays a
 * pure function and never reads a clock itself.
 *
 * Fails closed, matching the Wave 7 effective-state resolver: a sequence gap, a
 * recorded predecessor that disagrees with the replayed status, or an edge
 * outside the approved set all mark the history invalid rather than guessing an
 * answer. When that happens the caller must not present the returned status as
 * authoritative.
 *
 * Time-based expiry is applied only to a coherent history that replayed to
 * `active`. A revoked, superseded or corrected certificate keeps that recorded
 * status after its expiry date — expiry never overwrites a recorded decision.
 */
export function resolveEffectiveCertificateStatus(input: {
  issuedAt: string;
  expiresAt?: string | null;
  events: readonly CertificateLifecycleEvent[];
  now: string;
}): EffectiveCertificateStatus {
  const ordered = sortEvents(input.events ?? []);
  const expiresAt = input.expiresAt ?? undefined;

  let status: CertificateLifecycleStatus = CERTIFICATE_INITIAL_STATUS;
  let effectiveAt = input.issuedAt;
  let expectedSequence = 1;

  for (const event of ordered) {
    const failure = (
      sequenceError: CertificateLifecycleSequenceError
    ): EffectiveCertificateStatus => ({
      status,
      effectiveAt,
      sequenceValid: false,
      sequenceError,
      transitionCount: ordered.length,
      ...(expiresAt ? { expiresAt } : {}),
      expiredByTime: false
    });

    if (event.sequenceNumber !== expectedSequence) {
      return failure("SEQUENCE_GAP");
    }

    if (event.previousStatus !== status) {
      return failure("PREVIOUS_STATUS_MISMATCH");
    }

    if (
      !isValidCertificateLifecycleTransition(
        event.previousStatus,
        event.newStatus
      )
    ) {
      return failure("INVALID_TRANSITION");
    }

    status = event.newStatus;
    effectiveAt = event.effectiveAt;
    expectedSequence += 1;
  }

  // Pinned expiry, derived rather than recorded. Only a certificate that is
  // still active can lapse; a recorded transition always wins.
  if (status === "active" && expiresAt && Date.parse(input.now) >= Date.parse(expiresAt)) {
    return {
      status: "expired",
      effectiveAt: expiresAt,
      sequenceValid: true,
      transitionCount: ordered.length,
      expiresAt,
      expiredByTime: true
    };
  }

  return {
    status,
    effectiveAt,
    sequenceValid: true,
    transitionCount: ordered.length,
    ...(expiresAt ? { expiresAt } : {}),
    expiredByTime: false
  };
}

/**
 * Computes the expiry to pin at issuance.
 *
 * Null months means the certificate does not expire. The value is derived from
 * the issuance-time definition and stored once, so a later change to that
 * definition can never move an already-issued certificate's expiry.
 */
export function calculateCertificateExpiry(input: {
  issuedAt: string;
  expirationMonths: number | null;
}): string | null {
  if (
    input.expirationMonths === null ||
    input.expirationMonths === undefined ||
    !Number.isInteger(input.expirationMonths) ||
    input.expirationMonths <= 0
  ) {
    return null;
  }

  const issued = new Date(input.issuedAt);
  if (Number.isNaN(issued.getTime())) return null;

  const expires = new Date(issued.getTime());
  expires.setUTCMonth(expires.getUTCMonth() + input.expirationMonths);
  return expires.toISOString();
}

/**
 * A certificate as presented to its owner, with derived status.
 *
 * Carries no `userId` — it is only ever returned to the authenticated owner —
 * and no CERT-008 workflow data.
 */
export interface StudentCertificateRecord {
  id: string;
  certificateDefinitionStableId: string;
  certificateDefinitionVersion: number;
  issuedAt: string;
  status: CertificateLifecycleStatus;
  statusEffectiveAt: string;
  expiresAt?: string;
  /** False when the recorded history could not be replayed coherently. */
  statusDetermined: boolean;
}

/** Plain-language status wording. Never colour alone (CERT-004 section 11). */
export function describeCertificateStatus(
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

/** One calm sentence explaining what the status means for the learner. */
export function explainCertificateStatus(
  status: CertificateLifecycleStatus
): string {
  switch (status) {
    case "active":
      return "This certificate is current.";
    case "expired":
      return "This certificate has passed its validity period. What you demonstrated to earn it is unchanged.";
    case "revoked":
      return "This certificate has been revoked and is no longer valid.";
    case "superseded":
      return "A newer certificate has replaced this one. This record remains part of your history.";
    default:
      return "This certificate has been corrected. The original issuance remains part of your history.";
  }
}
