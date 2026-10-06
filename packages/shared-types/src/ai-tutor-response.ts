/**
 * AI Tutor foundation — the structured Tutor response contract.
 *
 * `AIGW-007` for the Tutor task family: one stable response model, validated
 * before any surface consumes it, with the deterministic boundary enforced at
 * the point where untrusted provider output becomes platform data.
 *
 * ## The boundary lives here, not in a prompt
 *
 * `TutorResponse` cannot express a lab verdict, a mastery grant, a score or a
 * note write. There is no field for any of them, `boundaryFlags` are LITERAL
 * `false` so a response claiming otherwise does not compile, and
 * `normalizeTutorProviderOutput` REFUSES output carrying any forbidden
 * authority field at any depth. A model that volunteers `{"labPassed": true}`
 * therefore produces `invalid_provider_response`, not a verdict.
 *
 * That ordering matters: the refusal happens before the answer text is read, so
 * no part of an authority-claiming response is salvaged and shown.
 *
 * ## Nothing is fabricated to fill a field
 *
 * `AIGW-007` section 12: on malformed output, return `InvalidProviderResponse`
 * and do not fabricate missing fields. A missing answer is a refusal, not an
 * empty string. A citation that does not correspond to a selected grounding
 * segment is dropped by `verifyTutorCitations`, and the count of dropped
 * citations is carried so the event is recordable rather than invisible.
 *
 * ## Three honest shapes
 *
 * `buildTutorResponse` for an answer, `buildTutorUnavailableResponse` for a
 * provider or context failure, and `buildTutorDeferralResponse` for a question
 * whose answer belongs to a deterministic engine. All three are the same type,
 * so a surface renders one shape and cannot forget to handle a failure.
 *
 * Pure module: no I/O, no clock, no randomness, no provider, no AI.
 */

import {
  buildTutorDeterministicDeferral,
  containsForbiddenAuthorityField,
  describeTutorLabUnavailable,
  type TutorDeferralSubject,
  type TutorLabStateContext
} from "./ai-tutor-boundaries";
import {
  describeTutorGroundingMode,
  verifyTutorCitations,
  type TutorCitation,
  type TutorGroundingMode,
  type TutorGroundingSegment
} from "./ai-tutor-grounding";
import {
  buildTutorRendering,
  type TutorPresentationPreference,
  type TutorRenderingContract
} from "./ai-tutor-lesson-context";
import {
  describeTutorProviderError,
  type TutorProviderError,
  type TutorProviderOutput
} from "./ai-tutor-provider";

export const AI_TUTOR_RESPONSE_CONTRACT_VERSION = "ai-tutor-response-v1";

export const TUTOR_ANSWER_MAX_LENGTH = 1_200;
export const TUTOR_EXPLANATION_MAX_LENGTH = 4_000;
export const TUTOR_MAX_GUIDANCE_STEPS = 5;
export const TUTOR_GUIDANCE_STEP_MAX_LENGTH = 400;

/**
 * What the learner can do next.
 *
 * A closed vocabulary with no pressure mechanic in it: no "beat your time", no
 * "keep your streak", no ranking. `run_deterministic_validation` is the action
 * the Tutor offers instead of a verdict, and `none` exists so the contract is
 * never forced to invent an action it does not have.
 */
export const TUTOR_SUGGESTED_ACTIONS = [
  "reread_lesson_section",
  "review_prior_concept",
  "try_the_step_again",
  "run_deterministic_validation",
  "ask_a_follow_up",
  "open_your_notes",
  "none"
] as const;

export type TutorSuggestedAction = (typeof TUTOR_SUGGESTED_ACTIONS)[number];

/**
 * How confident the response is about its own grounding.
 *
 * `grounded` only when lesson content was actually used. `partial` when some
 * requested context was dropped by the bound. `unavailable_context` when the
 * answer is not describing lesson content at all. The statement is the
 * learner-facing sentence; the level is what a surface can branch on.
 */
export const TUTOR_UNCERTAINTY_LEVELS = [
  "grounded",
  "partial",
  "general",
  "unavailable_context"
] as const;

export type TutorUncertaintyLevel = (typeof TUTOR_UNCERTAINTY_LEVELS)[number];

export interface TutorUncertainty {
  level: TutorUncertaintyLevel;
  statement: string;
}

/**
 * What this response is explicitly NOT authoritative for.
 *
 * Literal `false` types. A response that claims any of these cannot be
 * constructed, so the guarantee is checked by the compiler on every call site
 * rather than by a reviewer reading prose.
 */
export interface TutorBoundaryFlags {
  determinesLabCorrectness: false;
  grantsMastery: false;
  altersDeterministicScoring: false;
  mutatesLearnerNotes: false;
  overridesDeterministicValidation: false;
  createsLearnerEvidence: false;
}

export const TUTOR_BOUNDARY_FLAGS: TutorBoundaryFlags = {
  determinesLabCorrectness: false,
  grantsMastery: false,
  altersDeterministicScoring: false,
  mutatesLearnerNotes: false,
  overridesDeterministicValidation: false,
  createsLearnerEvidence: false
};

/** The outcome shape a surface branches on. */
export const TUTOR_RESPONSE_OUTCOMES = [
  "answered",
  "deferred_to_deterministic",
  "unavailable"
] as const;

export type TutorResponseOutcome = (typeof TUTOR_RESPONSE_OUTCOMES)[number];

/**
 * One structured Tutor response.
 *
 * `answer` is required and `explanation` is optional, in that order, because
 * the default is concise: a surface may render the answer alone and request the
 * explanation only when the learner asks for more.
 */
export interface TutorResponse {
  contractVersion: string;
  requestId: string;
  correlationId: string;
  outcome: TutorResponseOutcome;
  groundingMode: TutorGroundingMode;
  answer: string;
  explanation?: string;
  stepGuidance: readonly string[];
  citations: readonly TutorCitation[];
  /** Citations the provider claimed that no selected segment supports. */
  droppedCitationCount: number;
  suggestedAction: TutorSuggestedAction;
  uncertainty: TutorUncertainty;
  /** Honest lab-state sentence when lab state was not knowable. */
  labStateStatement?: string;
  boundaryFlags: TutorBoundaryFlags;
  presentation: TutorPresentationPreference;
  rendering: TutorRenderingContract;
}

/**
 * Fields a Tutor response must never carry.
 *
 * Composed from the boundary module's authority list rather than restated, so
 * there is one source of truth. The extra entries are response-shaped leakage
 * that is not an authority claim: raw provider output, a system prompt, or a
 * provider's own error payload.
 */
export const AI_TUTOR_RESPONSE_FORBIDDEN_FIELDS: readonly string[] = [
  "rawOutput",
  "providerPayload",
  "providerError",
  "systemPrompt",
  "promptText",
  "apiKey",
  "accessToken",
  "otherLearnerNote",
  "otherLearnerId"
];

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

function boundedText(value: unknown, limit: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? text.slice(0, limit) : text;
}

export type TutorNormalization =
  | { ok: true; response: TutorResponse }
  | { ok: false; error: TutorProviderError };

/**
 * Derives the uncertainty from facts, never from the provider's self-report.
 *
 * A provider may declare itself uncertain, and that is honoured by downgrading.
 * It may NOT declare itself grounded: being grounded is a property of what the
 * platform selected, so a confident model with no grounding is still `general`.
 */
export function deriveTutorUncertainty(input: {
  groundingMode: TutorGroundingMode;
  droppedSegmentCount: number;
  /** Citations that survived verification against the selected segments. */
  verifiedCitationCount: number;
  providerDeclaredUncertain: boolean;
}): TutorUncertainty {
  if (input.groundingMode === "context_unavailable") {
    return {
      level: "unavailable_context",
      statement: describeTutorGroundingMode("context_unavailable")
    };
  }

  if (input.groundingMode === "general") {
    return {
      level: "general",
      statement: describeTutorGroundingMode("general")
    };
  }

  if (input.providerDeclaredUncertain) {
    return {
      level: "partial",
      statement:
        "This answer may be incomplete. Check it against the lesson text before relying on it."
    };
  }

  // "Comes from this lesson" is only true when the answer points at lesson
  // content the platform can verify; an uncited answer is not lesson-grounded.
  if (input.verifiedCitationCount === 0) {
    return {
      level: "partial",
      statement:
        "This answer does not point to a specific part of the lesson. Check it against the lesson text before relying on it."
    };
  }

  if (input.droppedSegmentCount > 0) {
    return {
      level: "partial",
      statement:
        "This answer uses part of the lesson content, not all of it. Some lesson material was not included."
    };
  }

  return {
    level: "grounded",
    statement: describeTutorGroundingMode("lesson_grounded")
  };
}

/**
 * Turns untrusted provider output into a validated response, or refuses.
 *
 * The order is the policy:
 *
 *   1. The AUTHORITY REFUSAL first, over the whole raw object, before a single
 *      field is read. Nothing from an authority-claiming response survives.
 *   2. Required fields. A missing or empty answer is a refusal; no field is
 *      invented to fill a gap.
 *   3. Citations verified against the SELECTED grounding segments. Anything the
 *      provider invented is dropped and counted.
 *   4. Bounds applied to every text field.
 *   5. Uncertainty derived from platform facts.
 */
export function normalizeTutorProviderOutput(input: {
  raw: TutorProviderOutput;
  requestId: string;
  correlationId: string;
  groundingMode: TutorGroundingMode;
  selectedSegments: readonly TutorGroundingSegment[];
  droppedSegmentCount: number;
  labState: TutorLabStateContext;
  presentation: TutorPresentationPreference;
}): TutorNormalization {
  if (!input.raw || typeof input.raw !== "object") {
    return { ok: false, error: "invalid_provider_response" };
  }

  if (containsForbiddenAuthorityField(input.raw)) {
    return { ok: false, error: "invalid_provider_response" };
  }

  const answer = boundedText(input.raw.answer, TUTOR_ANSWER_MAX_LENGTH);
  if (!answer) return { ok: false, error: "invalid_provider_response" };

  const explanation = boundedText(
    input.raw.explanation,
    TUTOR_EXPLANATION_MAX_LENGTH
  );

  const rawGuidance = Array.isArray(input.raw.stepGuidance)
    ? input.raw.stepGuidance
    : [];
  const stepGuidance = rawGuidance
    .map((entry) => boundedText(entry, TUTOR_GUIDANCE_STEP_MAX_LENGTH))
    .filter((entry) => entry.length > 0)
    .slice(0, TUTOR_MAX_GUIDANCE_STEPS);

  const claimed = Array.isArray(input.raw.citedSegmentStableIds)
    ? input.raw.citedSegmentStableIds
    : [];
  const { verified, fabricatedCount } = verifyTutorCitations({
    claimed,
    selected: input.selectedSegments
  });

  const uncertainty = deriveTutorUncertainty({
    groundingMode: input.groundingMode,
    droppedSegmentCount: input.droppedSegmentCount,
    verifiedCitationCount: verified.length,
    providerDeclaredUncertain: input.raw.uncertain === true
  });

  const labStateStatement =
    input.labState.availability === "unavailable"
      ? describeTutorLabUnavailable(input.labState.reason)
      : undefined;

  return {
    ok: true,
    response: {
      contractVersion: AI_TUTOR_RESPONSE_CONTRACT_VERSION,
      requestId: input.requestId,
      correlationId: input.correlationId,
      outcome: "answered",
      groundingMode: input.groundingMode,
      answer,
      ...(explanation ? { explanation } : {}),
      stepGuidance,
      citations: verified,
      droppedCitationCount: fabricatedCount,
      suggestedAction:
        stepGuidance.length > 0 ? "try_the_step_again" : "ask_a_follow_up",
      uncertainty,
      ...(labStateStatement ? { labStateStatement } : {}),
      boundaryFlags: TUTOR_BOUNDARY_FLAGS,
      presentation: { ...input.presentation },
      rendering: buildTutorRendering({
        answer,
        explanation,
        stepGuidance,
        references: verified.map((citation) => citation.title),
        statusStatement:
          uncertainty.level === "grounded" ? undefined : uncertainty.statement
      })
    }
  };
}

/* ------------------------------------------------------------------ *
 * The honest failure shapes
 * ------------------------------------------------------------------ */

/**
 * The response for a provider or context failure.
 *
 * A failure is an ANSWERABLE state, not an exception a surface may forget. The
 * answer text says the Tutor is unavailable and that nothing changed, the
 * grounding mode records why, and the suggested action is `none` — an
 * unavailable Tutor must not nudge the learner anywhere.
 */
export function buildTutorUnavailableResponse(input: {
  requestId: string;
  correlationId: string;
  error: TutorProviderError;
  groundingMode: TutorGroundingMode;
  presentation: TutorPresentationPreference;
  labState?: TutorLabStateContext;
}): TutorResponse {
  const answer = describeTutorProviderError(input.error);

  const labStateStatement =
    input.labState && input.labState.availability === "unavailable"
      ? describeTutorLabUnavailable(input.labState.reason)
      : undefined;

  return {
    contractVersion: AI_TUTOR_RESPONSE_CONTRACT_VERSION,
    requestId: input.requestId,
    correlationId: input.correlationId,
    outcome: "unavailable",
    groundingMode: input.groundingMode,
    answer,
    stepGuidance: [],
    citations: [],
    droppedCitationCount: 0,
    suggestedAction: "none",
    uncertainty: {
      level: "unavailable_context",
      statement:
        "No answer was produced. Nothing about your lesson, your work or your notes changed."
    },
    ...(labStateStatement ? { labStateStatement } : {}),
    boundaryFlags: TUTOR_BOUNDARY_FLAGS,
    presentation: { ...input.presentation },
    rendering: buildTutorRendering({
      answer,
      statusStatement: answer
    })
  };
}

/**
 * The response for a question whose answer belongs to a deterministic engine.
 *
 * It names the owning authority and points at the deterministic path, so the
 * refusal is useful rather than a dead end. For lab correctness the suggested
 * action is to run the lab's own validation, which is the only thing that can
 * answer the question the learner actually asked.
 */
export function buildTutorDeferralResponse(input: {
  requestId: string;
  correlationId: string;
  subject: TutorDeferralSubject;
  groundingMode: TutorGroundingMode;
  presentation: TutorPresentationPreference;
  labState?: TutorLabStateContext;
}): TutorResponse {
  const deferral = buildTutorDeterministicDeferral(input.subject);

  const labStateStatement =
    input.labState && input.labState.availability === "unavailable"
      ? describeTutorLabUnavailable(input.labState.reason)
      : undefined;

  return {
    contractVersion: AI_TUTOR_RESPONSE_CONTRACT_VERSION,
    requestId: input.requestId,
    correlationId: input.correlationId,
    outcome: "deferred_to_deterministic",
    groundingMode: input.groundingMode,
    answer: deferral.statement,
    stepGuidance: [],
    citations: [],
    droppedCitationCount: 0,
    suggestedAction:
      input.subject === "lab_correctness"
        ? "run_deterministic_validation"
        : "reread_lesson_section",
    uncertainty: {
      level: "general",
      statement: `This is decided by ${deferral.authority}, not by the Tutor.`
    },
    ...(labStateStatement ? { labStateStatement } : {}),
    boundaryFlags: TUTOR_BOUNDARY_FLAGS,
    presentation: { ...input.presentation },
    rendering: buildTutorRendering({
      answer: deferral.statement,
      statusStatement: `This is decided by ${deferral.authority}, not by the Tutor.`
    })
  };
}

/**
 * Whether a candidate response carries a prohibited field at any depth.
 *
 * Checks BOTH prohibition lists, because a response must satisfy the authority
 * boundary and the leakage boundary at once.
 */
export function containsForbiddenResponseField(value: unknown): boolean {
  if (containsForbiddenAuthorityField(value)) return true;

  if (Array.isArray(value)) {
    return value.some((entry) => containsForbiddenResponseField(entry));
  }

  if (!value || typeof value !== "object") return false;

  const forbidden = new Set(
    AI_TUTOR_RESPONSE_FORBIDDEN_FIELDS.map((field) => field.toLowerCase())
  );

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key.toLowerCase())) return true;
    if (containsForbiddenResponseField(nested)) return true;
  }

  return false;
}
