import type { PlatformRole } from "./auth";
import type {
  EvidenceMetadata,
  EvidenceRecord,
  EvidenceRecordState,
  StudentEvidenceRecord
} from "./evidence";
import { validateEvidenceMetadata } from "./evidence";

/**
 * Wave 7 / Batch 5 — EVID-006 Evidence Review and Correction History.
 *
 * Original Evidence is never rewritten. A correction records what changed about
 * our trust in the Evidence, not what happened at the source. Effective state is
 * derived at read time from the original record plus its ordered, append-only
 * correction history.
 *
 * This module is pure: no I/O, no randomness, no AI.
 */

/** Only `founder_admin` may author a correction. */
export const EVIDENCE_CORRECTION_AUTHORITY: PlatformRole = "founder_admin";

export type EvidenceCorrectionAction =
  | "place_under_review"
  | "confirm"
  | "invalidate"
  | "supersede"
  | "restore";

export const EVIDENCE_CORRECTION_ACTIONS: readonly EvidenceCorrectionAction[] = [
  "place_under_review",
  "confirm",
  "invalidate",
  "supersede",
  "restore"
];

/** Actions that change the effective trust state. */
export const EVIDENCE_STATE_CHANGING_ACTIONS: readonly EvidenceCorrectionAction[] =
  ["invalidate", "supersede", "restore"];

export const EVIDENCE_CORRECTION_REASON_MIN_LENGTH = 8;
export const EVIDENCE_CORRECTION_REASON_MAX_LENGTH = 500;

export interface EvidenceCorrectionEvent {
  id: string;
  evidenceId: string;
  /** The Evidence owner, copied from the record and never caller-supplied. */
  userId: string;
  /** Monotonic per Evidence, starting at 1. Defines replay order. */
  sequenceNumber: number;
  action: EvidenceCorrectionAction;
  /** Student-facing plain-language explanation. Required and bounded. */
  reason: string;
  actorId: string;
  actorRole: PlatformRole;
  previousEffectiveState: EvidenceRecordState;
  newEffectiveState: EvidenceRecordState;
  supersedingEvidenceId?: string;
  occurredAt: string;
  metadata: EvidenceMetadata;
}

/**
 * The deterministic answer to "what is the effective trusted state now?".
 *
 * `underReview` is a review flag, not a fourth state: EVID-006 asks for a review
 * state without introducing a competing state vocabulary, so the canonical
 * Batch 1 states are preserved and review is tracked alongside them.
 */
export interface EffectiveEvidenceState {
  state: EvidenceRecordState;
  underReview: boolean;
  correctionCount: number;
  lastCorrectionAt?: string;
  lastReason?: string;
  supersededByEvidenceId?: string;
  /**
   * False when the stored history cannot be replayed coherently. Consumers must
   * treat an invalid sequence as untrusted and fail closed.
   */
  sequenceValid: boolean;
  sequenceError?: string;
}

export function isEvidenceCorrectionAction(
  value: unknown
): value is EvidenceCorrectionAction {
  return (
    typeof value === "string" &&
    (EVIDENCE_CORRECTION_ACTIONS as readonly string[]).includes(value)
  );
}

export function isStateChangingCorrectionAction(
  action: EvidenceCorrectionAction
): boolean {
  return (EVIDENCE_STATE_CHANGING_ACTIONS as readonly string[]).includes(action);
}

export type CorrectionTransitionDenialReason =
  | "ACTION_UNSUPPORTED"
  | "TRANSITION_NOT_PERMITTED"
  | "REVIEW_NOT_OPEN"
  | "SUPERSEDING_EVIDENCE_REQUIRED"
  | "SUPERSEDING_EVIDENCE_NOT_ALLOWED";

export type CorrectionTransitionDecision =
  | {
      allowed: true;
      nextState: EvidenceRecordState;
      nextUnderReview: boolean;
    }
  | { allowed: false; reason: CorrectionTransitionDenialReason };

/**
 * The only permitted transitions. Nothing is free-form, and every disallowed
 * combination fails closed.
 *
 *   active       -> invalidate -> invalidated
 *   active       -> supersede  -> superseded
 *   invalidated  -> restore    -> active
 *   superseded   -> restore    -> active
 *
 * EVID-006 permits restoration "when a correction itself was incorrect", and
 * supersession is a correction, so restoring from either corrected state is
 * allowed. Restoring already-active Evidence is not a correction and is refused.
 *
 * `place_under_review` and `confirm` never change the trust state; they open and
 * close a review.
 */
export function evaluateCorrectionTransition(input: {
  currentState: EvidenceRecordState;
  currentUnderReview: boolean;
  action: EvidenceCorrectionAction;
  hasSupersedingEvidence: boolean;
}): CorrectionTransitionDecision {
  if (!isEvidenceCorrectionAction(input.action)) {
    return { allowed: false, reason: "ACTION_UNSUPPORTED" };
  }

  if (input.action !== "supersede" && input.hasSupersedingEvidence) {
    return { allowed: false, reason: "SUPERSEDING_EVIDENCE_NOT_ALLOWED" };
  }

  switch (input.action) {
    case "place_under_review":
      return {
        allowed: true,
        nextState: input.currentState,
        nextUnderReview: true
      };

    case "confirm":
      if (!input.currentUnderReview) {
        return { allowed: false, reason: "REVIEW_NOT_OPEN" };
      }
      return {
        allowed: true,
        nextState: input.currentState,
        nextUnderReview: false
      };

    case "invalidate":
      if (input.currentState !== "active") {
        return { allowed: false, reason: "TRANSITION_NOT_PERMITTED" };
      }
      return { allowed: true, nextState: "invalidated", nextUnderReview: false };

    case "supersede":
      if (input.currentState !== "active") {
        return { allowed: false, reason: "TRANSITION_NOT_PERMITTED" };
      }
      if (!input.hasSupersedingEvidence) {
        return { allowed: false, reason: "SUPERSEDING_EVIDENCE_REQUIRED" };
      }
      return { allowed: true, nextState: "superseded", nextUnderReview: false };

    case "restore":
      if (input.currentState === "active") {
        return { allowed: false, reason: "TRANSITION_NOT_PERMITTED" };
      }
      return { allowed: true, nextState: "active", nextUnderReview: false };

    default:
      return { allowed: false, reason: "ACTION_UNSUPPORTED" };
  }
}

function sortCorrectionEvents(
  events: readonly EvidenceCorrectionEvent[]
): EvidenceCorrectionEvent[] {
  return [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

/**
 * Derives the effective state from the original record plus its ordered history.
 *
 * The original `evidence_records.state` is the origin of the replay and is never
 * rewritten by a correction. Replay fails closed: a gap in the sequence, a
 * recorded predecessor that disagrees with the replayed state, or a recorded
 * successor that disagrees with the transition rules all mark the history
 * invalid rather than guessing an answer.
 */
export function resolveEffectiveEvidenceState(
  record: Pick<EvidenceRecord, "state">,
  events: readonly EvidenceCorrectionEvent[]
): EffectiveEvidenceState {
  const ordered = sortCorrectionEvents(events);

  let state: EvidenceRecordState = record.state;
  let underReview = false;
  let lastCorrectionAt: string | undefined;
  let lastReason: string | undefined;
  let supersededByEvidenceId: string | undefined;
  let expectedSequence = 1;

  for (const event of ordered) {
    if (event.sequenceNumber !== expectedSequence) {
      return {
        state,
        underReview,
        correctionCount: ordered.length,
        sequenceValid: false,
        sequenceError: "SEQUENCE_GAP",
        ...(lastCorrectionAt ? { lastCorrectionAt } : {}),
        ...(lastReason ? { lastReason } : {}),
        ...(supersededByEvidenceId ? { supersededByEvidenceId } : {})
      };
    }

    if (event.previousEffectiveState !== state) {
      return {
        state,
        underReview,
        correctionCount: ordered.length,
        sequenceValid: false,
        sequenceError: "PREVIOUS_STATE_MISMATCH",
        ...(lastCorrectionAt ? { lastCorrectionAt } : {}),
        ...(lastReason ? { lastReason } : {}),
        ...(supersededByEvidenceId ? { supersededByEvidenceId } : {})
      };
    }

    const decision = evaluateCorrectionTransition({
      currentState: state,
      currentUnderReview: underReview,
      action: event.action,
      hasSupersedingEvidence: typeof event.supersedingEvidenceId === "string"
    });

    if (!decision.allowed || decision.nextState !== event.newEffectiveState) {
      return {
        state,
        underReview,
        correctionCount: ordered.length,
        sequenceValid: false,
        sequenceError: "INVALID_TRANSITION",
        ...(lastCorrectionAt ? { lastCorrectionAt } : {}),
        ...(lastReason ? { lastReason } : {}),
        ...(supersededByEvidenceId ? { supersededByEvidenceId } : {})
      };
    }

    state = decision.nextState;
    underReview = decision.nextUnderReview;
    lastCorrectionAt = event.occurredAt;
    lastReason = event.reason;

    if (event.action === "supersede") {
      supersededByEvidenceId = event.supersedingEvidenceId;
    }
    if (event.action === "restore") {
      supersededByEvidenceId = undefined;
    }

    expectedSequence += 1;
  }

  return {
    state,
    underReview,
    correctionCount: ordered.length,
    sequenceValid: true,
    ...(lastCorrectionAt ? { lastCorrectionAt } : {}),
    ...(lastReason ? { lastReason } : {}),
    ...(supersededByEvidenceId ? { supersededByEvidenceId } : {})
  };
}

/**
 * Evidence may be treated as currently trusted proof only when its history
 * replays coherently and leaves it active. Fails closed on anything else.
 */
export function isEffectivelyTrustedEvidence(
  effective: EffectiveEvidenceState
): boolean {
  return effective.sequenceValid === true && effective.state === "active";
}

export interface CreateEvidenceCorrectionInput {
  evidenceId: string;
  action: EvidenceCorrectionAction;
  reason: string;
  /** Guards against acting on a stale view of the effective state. */
  expectedPreviousState: EvidenceRecordState;
  supersedingEvidenceId?: string;
  /** Stable caller-supplied key making a retry safe. Never a timestamp. */
  idempotencyKey?: string;
  metadata?: EvidenceMetadata;
}

export interface EvidenceCorrectionValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCorrectionReason(reason: unknown): boolean {
  if (typeof reason !== "string") {
    return false;
  }
  const trimmed = reason.trim();
  return (
    trimmed.length >= EVIDENCE_CORRECTION_REASON_MIN_LENGTH &&
    trimmed.length <= EVIDENCE_CORRECTION_REASON_MAX_LENGTH
  );
}

export function validateCreateEvidenceCorrectionInput(
  input: CreateEvidenceCorrectionInput
): EvidenceCorrectionValidationResult {
  const errors: string[] = [];

  if (typeof input.evidenceId !== "string" || input.evidenceId.trim() === "") {
    errors.push("evidenceId is required");
  }

  if (!isEvidenceCorrectionAction(input.action)) {
    errors.push("action must be an approved Evidence correction action");
  }

  if (!validateCorrectionReason(input.reason)) {
    errors.push(
      `reason is required and must be between ${EVIDENCE_CORRECTION_REASON_MIN_LENGTH} and ${EVIDENCE_CORRECTION_REASON_MAX_LENGTH} characters`
    );
  }

  if (
    input.expectedPreviousState !== "active" &&
    input.expectedPreviousState !== "invalidated" &&
    input.expectedPreviousState !== "superseded"
  ) {
    errors.push("expectedPreviousState must be a canonical Evidence state");
  }

  if (input.supersedingEvidenceId !== undefined) {
    if (
      typeof input.supersedingEvidenceId !== "string" ||
      input.supersedingEvidenceId.trim() === ""
    ) {
      errors.push("supersedingEvidenceId must be a non-empty identifier");
    } else if (input.supersedingEvidenceId === input.evidenceId) {
      errors.push("Evidence cannot supersede itself");
    }
  }

  if (input.action === "supersede" && !input.supersedingEvidenceId) {
    errors.push("supersede requires a superseding Evidence Record");
  }

  if (
    input.idempotencyKey !== undefined &&
    (typeof input.idempotencyKey !== "string" ||
      input.idempotencyKey.trim().length < 8 ||
      input.idempotencyKey.length > 128)
  ) {
    errors.push("idempotencyKey must be a stable identifier of 8-128 characters");
  }

  errors.push(...validateEvidenceMetadata(input.metadata).errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Safe student-facing correction entry. Carries the plain-language reason and
 * the resulting state, and never the actor, the internal metadata, or any
 * authorization detail.
 */
export interface StudentEvidenceCorrectionEntry {
  action: EvidenceCorrectionAction;
  reason: string;
  occurredAt: string;
  previousEffectiveState: EvidenceRecordState;
  newEffectiveState: EvidenceRecordState;
  supersededByEvidenceId?: string;
}

export function toStudentCorrectionEntry(
  event: EvidenceCorrectionEvent
): StudentEvidenceCorrectionEntry {
  return {
    action: event.action,
    reason: event.reason,
    occurredAt: event.occurredAt,
    previousEffectiveState: event.previousEffectiveState,
    newEffectiveState: event.newEffectiveState,
    ...(event.supersedingEvidenceId
      ? { supersededByEvidenceId: event.supersedingEvidenceId }
      : {})
  };
}

/** Student-facing Evidence plus its derived effective state. */
export interface StudentEvidenceRecordWithState extends StudentEvidenceRecord {
  effectiveState: EvidenceRecordState;
  underReview: boolean;
  correctionCount: number;
  lastCorrectionReason?: string;
  supersededByEvidenceId?: string;
}

export function withEffectiveEvidenceState(
  record: StudentEvidenceRecord,
  effective: EffectiveEvidenceState
): StudentEvidenceRecordWithState {
  return {
    ...record,
    effectiveState: effective.state,
    underReview: effective.underReview,
    correctionCount: effective.correctionCount,
    ...(effective.lastReason ? { lastCorrectionReason: effective.lastReason } : {}),
    ...(effective.supersededByEvidenceId
      ? { supersededByEvidenceId: effective.supersededByEvidenceId }
      : {})
  };
}

export interface StudentEvidenceCorrectionHistory {
  evidenceId: string;
  effectiveState: EvidenceRecordState;
  underReview: boolean;
  entries: StudentEvidenceCorrectionEntry[];
}
