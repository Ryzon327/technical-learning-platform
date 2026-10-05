/**
 * AI Tutor foundation — the deterministic authority boundary.
 *
 * The single module that records what the Tutor may never decide, and makes
 * most of it structurally inexpressible rather than merely documented.
 *
 * ## The rule, stated once
 *
 * Deterministic truth stays deterministic. The Tutor may explain a
 * deterministic outcome; it never produces one. DEC-059 and
 * `docs/Project/DECISION_LEDGER.md` state it directly: "The validator owns the
 * factual pass/fail state; the tutor may explain it. Those roles never merge."
 *
 * ## What this owns
 *
 * The authority prohibitions as data, the forbidden-field list that response
 * normalization refuses, the trusted-lab-state classification, and the
 * deterministic deferral an honest Tutor returns instead of a verdict.
 *
 * ## What this does NOT own
 *
 * Lab validation (`LAB-005` and the Lab Engine own it), mastery and competency
 * (the Learning and Evidence Engines own them), assessment scoring (the
 * Assessment Engine owns it) and note persistence (the Knowledge and Notes
 * Engine owns it). This module holds no authority it could delegate; it holds
 * the refusal to acquire any.
 *
 * ## Why classification, not pattern matching
 *
 * Nothing here inspects question text to decide whether a learner "asked about
 * lab correctness". A text heuristic is not a boundary: it fails on the
 * phrasing it did not anticipate, and it would place the guarantee in a regular
 * expression rather than in the type system. The guarantee instead comes from
 * the response contract being unable to express a verdict at all.
 *
 * Pure module: no I/O, no clock, no randomness, no provider, no AI.
 */

export const AI_TUTOR_BOUNDARY_MODEL_VERSION = "ai-tutor-boundary-v1";

/**
 * What the Tutor must never do. Held as data so it is reviewable and testable.
 *
 * Each entry corresponds to a non-negotiable product boundary, and each is
 * backed below either by a literal-typed field, by a forbidden-field refusal,
 * or by a fail-closed classification.
 */
export const AI_TUTOR_AUTHORITY_PROHIBITIONS: readonly string[] = [
  "The Tutor never determines whether a lab is correct.",
  "The Tutor never grants mastery, competency or a certificate.",
  "The Tutor never overrides or reinterprets deterministic validation.",
  "The Tutor never alters deterministic practice or assessment scoring.",
  "The Tutor never invents, amends or records learner evidence.",
  "The Tutor never writes a private learner note without an explicit learner action.",
  "The Tutor never exposes another learner's data.",
  "The Tutor never claims a lab state that a deterministic service did not attest.",
  "The Tutor never fabricates a citation or a lesson reference."
];

/**
 * Which engine actually owns each deterministic fact.
 *
 * Recorded so a reviewer can see that the Tutor foundation delegates nothing
 * and duplicates nothing: every entry names an owner that is NOT the Tutor.
 */
export const TUTOR_DETERMINISTIC_AUTHORITIES = {
  labCorrectness: "Lab Engine deterministic validation",
  mastery: "Learning Engine competency state",
  evidence: "Evidence Engine",
  assessmentScoring: "Assessment Engine",
  practiceScoring: "Assessment Engine",
  certificateEligibility: "Certificate Engine",
  noteContent: "Knowledge and Notes Engine, on explicit learner action"
} as const;

/**
 * Fields that must never appear anywhere in Tutor output.
 *
 * This is the enforcement list, not a comment. `ai-tutor-response.ts` refuses
 * provider output carrying any of these keys at any depth, which is why a
 * model that volunteers `{ "labPassed": true }` produces an invalid provider
 * response instead of a verdict.
 *
 * Declared here, and only here, so the response contract and the verifier share
 * one source of truth.
 */
export const AI_TUTOR_FORBIDDEN_AUTHORITY_FIELDS: readonly string[] = [
  "labPassed",
  "labCorrect",
  "labFailed",
  "validationResult",
  "validationState",
  "checkPassed",
  "passed",
  "correct",
  "masteryGranted",
  "mastery",
  "competencyAwarded",
  "competencyState",
  "competencyStableId",
  "evidenceRecord",
  "evidenceClaim",
  "certificateEligible",
  "certificateIssued",
  "score",
  "scoreAdjustment",
  "grade",
  "marks",
  "attemptResult",
  "progressUpdate",
  "noteWrite",
  "noteUpdate",
  "notePatch",
  "noteDelete",
  "userId",
  "user_id",
  "ownerId",
  "studentId",
  "learnerId"
];

/**
 * Whether a value carries a forbidden authority field at any depth.
 *
 * Recursive by design: a provider that nests `{ result: { labPassed: true } }`
 * is making the same claim as one that puts it at the top level. Key comparison
 * is case-insensitive and exact per key, never a substring match — a substring
 * rule would reject the legitimate word "corrected" inside a key.
 */
export function containsForbiddenAuthorityField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsForbiddenAuthorityField(entry));
  }

  if (!value || typeof value !== "object") return false;

  const forbidden = new Set(
    AI_TUTOR_FORBIDDEN_AUTHORITY_FIELDS.map((field) => field.toLowerCase())
  );

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key.toLowerCase())) return true;
    if (containsForbiddenAuthorityField(nested)) return true;
  }

  return false;
}

/* ------------------------------------------------------------------ *
 * Trusted lab state
 * ------------------------------------------------------------------ */

/**
 * The one source that may produce an `available` lab state.
 *
 * A single exact literal, so a claim arriving with any other source — or with
 * no source at all — cannot be trusted by accident.
 */
export const TUTOR_LAB_ATTESTATION_SOURCE =
  "lab_engine_deterministic_validation" as const;

/**
 * Why a lab state is unavailable.
 *
 * `unknown` is the terminal fallback and is never an error: an unknown lab
 * state is a legitimate, honest state, and representing it is the whole point
 * of this union.
 */
export const TUTOR_LAB_UNAVAILABLE_REASONS = [
  "no_lab_in_lesson",
  "not_connected",
  "not_attested",
  "attestation_stale",
  "unknown"
] as const;

export type TutorLabUnavailableReason =
  (typeof TUTOR_LAB_UNAVAILABLE_REASONS)[number];

/**
 * A deterministic attestation of lab state.
 *
 * It carries only what an explanation needs: that a session exists, which
 * deterministic run produced the state, and when. It deliberately carries NO
 * pass/fail field — see `AI_TUTOR_FORBIDDEN_AUTHORITY_FIELDS`. The Tutor is
 * told whether lab state is knowable, never what the verdict was, because a
 * verdict in Tutor context is a verdict the Tutor can repeat as its own.
 */
export interface TutorLabAttestation {
  source: typeof TUTOR_LAB_ATTESTATION_SOURCE;
  sessionId: string;
  /** Opaque deterministic run reference, for the learner-facing deferral. */
  validationRunId: string;
  observedAt: string;
}

/**
 * Lab state as the Tutor may ever see it.
 *
 * A discriminated union rather than an optional attestation, so "we do not know"
 * can never collapse into "nothing is wrong". There is no third state and no
 * boolean, which is what makes guessing inexpressible.
 */
export type TutorLabStateContext =
  | { availability: "available"; attestation: TutorLabAttestation }
  | { availability: "unavailable"; reason: TutorLabUnavailableReason };

export function tutorLabStateUnavailable(
  reason: TutorLabUnavailableReason
): TutorLabStateContext {
  return { availability: "unavailable", reason };
}

/**
 * Classifies a lab-state claim, failing closed.
 *
 * EVERY path that is not a complete, correctly-sourced attestation yields
 * `unavailable`. That includes a claim with the wrong source, a missing session
 * or run reference, a non-string timestamp, and — importantly — a well-formed
 * claim that simply arrived from somewhere untrusted, because the caller is
 * responsible for only passing what the Lab Engine produced.
 *
 * This takes `unknown` on purpose. The input is modelled as untrusted so the
 * function cannot be bypassed by a caller that already believes its value.
 */
export function classifyTutorLabState(claim: unknown): TutorLabStateContext {
  if (!claim || typeof claim !== "object") {
    return tutorLabStateUnavailable("unknown");
  }

  const candidate = claim as Record<string, unknown>;

  if (candidate.source !== TUTOR_LAB_ATTESTATION_SOURCE) {
    return tutorLabStateUnavailable("not_attested");
  }

  const sessionId = typeof candidate.sessionId === "string" ? candidate.sessionId.trim() : "";
  const validationRunId =
    typeof candidate.validationRunId === "string" ? candidate.validationRunId.trim() : "";
  const observedAt =
    typeof candidate.observedAt === "string" ? candidate.observedAt.trim() : "";

  if (!sessionId || !validationRunId || !observedAt) {
    return tutorLabStateUnavailable("not_attested");
  }

  return {
    availability: "available",
    attestation: {
      source: TUTOR_LAB_ATTESTATION_SOURCE,
      sessionId,
      validationRunId,
      observedAt
    }
  };
}

/**
 * The honest learner-facing sentence for an unavailable lab state.
 *
 * Each message says what is not known and points at the deterministic path. No
 * message guesses, reassures or implies a verdict.
 */
export function describeTutorLabUnavailable(
  reason: TutorLabUnavailableReason
): string {
  switch (reason) {
    case "no_lab_in_lesson":
      return "This lesson has no lab, so there is no lab state to describe.";
    case "not_connected":
      return "Your lab is not connected right now, so I cannot see its state. Nothing about your work has changed.";
    case "not_attested":
      return "I have no confirmed information about your lab state, so I will not guess at it.";
    case "attestation_stale":
      return "The lab information I have is out of date, so I will not describe your current lab state.";
    default:
      return "I cannot tell what state your lab is in right now.";
  }
}

/* ------------------------------------------------------------------ *
 * Deterministic deferral
 * ------------------------------------------------------------------ */

/**
 * The deterministic facts a learner may ask the Tutor about and that the Tutor
 * must hand back to the owning engine.
 */
export const TUTOR_DEFERRAL_SUBJECTS = [
  "lab_correctness",
  "mastery",
  "practice_score",
  "evidence",
  "certificate_eligibility"
] as const;

export type TutorDeferralSubject = (typeof TUTOR_DEFERRAL_SUBJECTS)[number];

export interface TutorDeterministicDeferral {
  subject: TutorDeferralSubject;
  /** Which engine actually decides. Never the Tutor. */
  authority: string;
  /** What the learner is told, in plain language. */
  statement: string;
}

/**
 * Builds the answer the Tutor gives instead of a verdict.
 *
 * This is the pedagogically useful half of the boundary: refusing to judge is
 * only helpful if the learner is told who does judge and what to do next.
 */
export function buildTutorDeterministicDeferral(
  subject: TutorDeferralSubject
): TutorDeterministicDeferral {
  switch (subject) {
    case "lab_correctness":
      return {
        subject,
        authority: TUTOR_DETERMINISTIC_AUTHORITIES.labCorrectness,
        statement:
          "I cannot decide whether your lab is correct. Only the lab's own validation check can, and you can run it from the lab. I can help you understand what a check is looking for."
      };
    case "mastery":
      return {
        subject,
        authority: TUTOR_DETERMINISTIC_AUTHORITIES.mastery,
        statement:
          "I cannot award a competency. Your competency state comes from the platform's own records of what you demonstrated. I can help you understand what a competency asks for."
      };
    case "practice_score":
      return {
        subject,
        authority: TUTOR_DETERMINISTIC_AUTHORITIES.practiceScoring,
        statement:
          "I cannot change a practice or assessment result. Scoring is decided by the platform, not by this conversation. I can help you understand the idea the question is testing."
      };
    case "evidence":
      return {
        subject,
        authority: TUTOR_DETERMINISTIC_AUTHORITIES.evidence,
        statement:
          "I cannot create or change your evidence record. Evidence comes from what you actually demonstrated."
      };
    default:
      return {
        subject,
        authority: TUTOR_DETERMINISTIC_AUTHORITIES.certificateEligibility,
        statement:
          "I cannot decide certificate eligibility. That comes from the platform's own records."
      };
  }
}

/* ------------------------------------------------------------------ *
 * Note mutation
 * ------------------------------------------------------------------ */

/**
 * A note change the Tutor may PROPOSE.
 *
 * `applied` is a literal `false`, so a proposal that claims to have been
 * written cannot be constructed. The Tutor foundation contains no note writer
 * at all; applying a suggestion is a separate, learner-initiated action in the
 * Knowledge and Notes Engine, authorized by that engine's own rules.
 */
export interface TutorNoteSuggestion {
  suggestedText: string;
  /** Never written by the Tutor. Only an explicit learner action can apply it. */
  applied: false;
  requiresExplicitLearnerAction: true;
  authority: string;
}

export function buildTutorNoteSuggestion(
  suggestedText: string
): TutorNoteSuggestion {
  return {
    suggestedText: suggestedText.trim(),
    applied: false,
    requiresExplicitLearnerAction: true,
    authority: TUTOR_DETERMINISTIC_AUTHORITIES.noteContent
  };
}

/**
 * Whether the Tutor may apply a note change itself.
 *
 * Always false, and deliberately a function rather than a constant so a caller
 * that asks the question gets an unconditional answer at the call site.
 */
export function tutorMayWriteLearnerNote(): false {
  return false;
}
