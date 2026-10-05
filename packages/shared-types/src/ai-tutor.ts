import { AppError } from "./errors";

export const AI_TUTOR_REQUEST_SCHEMA = "ai-tutor-request/v1" as const;
export const AI_TUTOR_RESPONSE_SCHEMA = "ai-tutor-response/v1" as const;

export type AiTutorContextKind =
  | "lesson_text"
  | "transcript"
  | "curriculum_objective"
  | "glossary"
  | "approved_reference"
  | "practice_prompt"
  | "selected_note"
  | "trusted_lab_state";

export interface AiTutorContextSource {
  id: string;
  kind: AiTutorContextKind;
  text: string;
  provenance: string;
  /**
   * Required only for selected_note. The caller must make note inclusion an
   * explicit learner action; the Tutor never sweeps a note library by default.
   */
  learnerSelected?: boolean;
  /**
   * Selected private learner context must explicitly assert that authorization
   * already scoped it to the current learner. The Tutor never accepts a
   * cross-learner owner id as provider context.
   */
  ownerScope?: "current_learner";
  /**
   * Required only for trusted_lab_state. AI may explain deterministic lab
   * state, but must never invent it or decide whether the lab is correct.
   */
  trusted?: boolean;
}

export interface AiTutorRequest {
  schemaVersion: typeof AI_TUTOR_REQUEST_SCHEMA;
  requestId: string;
  correlationId: string;
  task: "tutor";
  learnerQuestion: string;
  courseStableId?: string;
  missionStableId?: string;
  lessonStableId?: string;
  conceptId?: string;
  sceneId?: string;
  stepId?: string;
  readingLevel?: string;
  context: readonly AiTutorContextSource[];
}

export type AiTutorGrounding = "lesson" | "general" | "unavailable";

export interface AiTutorReference {
  sourceId: string;
  label: string;
}

export const AI_TUTOR_AUTHORITY = Object.freeze({
  canGrantMastery: false,
  canMarkLabCorrect: false,
  canChangeScore: false,
  canWriteNotes: false
} as const);

export interface AiTutorResponse {
  schemaVersion: typeof AI_TUTOR_RESPONSE_SCHEMA;
  requestId: string;
  conciseAnswer: string;
  explanation: string;
  steps: readonly string[];
  references: readonly AiTutorReference[];
  nextAction?: string;
  uncertainty?: string;
  grounding: AiTutorGrounding;
  availability: {
    trustedLabState: "available" | "unavailable";
  };
  authority: typeof AI_TUTOR_AUTHORITY;
  providerId: string;
}

export interface AiTutorProviderOutput {
  conciseAnswer: string;
  explanation: string;
  steps?: readonly string[];
  referenceIds?: readonly string[];
  nextAction?: string;
  uncertainty?: string;
  grounding?: AiTutorGrounding;
}

const CONTEXT_KINDS: readonly AiTutorContextKind[] = [
  "lesson_text",
  "transcript",
  "curriculum_objective",
  "glossary",
  "approved_reference",
  "practice_prompt",
  "selected_note",
  "trusted_lab_state"
];

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * A plain object, which is the only shape a Tutor request or context source may
 * take. Arrays are excluded deliberately: `typeof [] === "object"`, so an array
 * would otherwise pass an object check and then fail unpredictably on property
 * access.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an UNTRUSTED Tutor request and returns every problem found.
 *
 * ## Why this accepts `unknown`
 *
 * This is the fail-closed boundary for input the platform did not construct —
 * a parsed request body, a cross-service payload, a fixture. A parameter typed
 * `AiTutorRequest` is a compile-time promise about a value that has not been
 * checked yet, and at a runtime boundary that promise is exactly what is in
 * question. Taking `unknown` makes the guard unskippable: nothing can be
 * dereferenced until it has been narrowed.
 *
 * ## Every dereference is guarded before it happens
 *
 * The rule is uniform: establish the shape, THEN read it. A malformed request
 * must produce the normalized non-retryable `VALIDATION_ERROR` through
 * `assertValidAiTutorRequest`, never a raw `TypeError` — a `TypeError` escapes
 * the error contract, carries an internal message to the caller, and is not
 * distinguishable by a caller from a genuine platform fault.
 *
 * Three places needed guarding, and all three are the same defect:
 *
 *   - the request itself, which may be `null`, a string or an array;
 *   - `learnerQuestion.length`, which previously ran even after the field was
 *     recorded as missing;
 *   - `context`, which may be absent, `null`, or a non-array value, and which
 *     was previously measured and iterated after being recorded as invalid.
 *
 * A non-array `context` RETURNS rather than continuing, so neither `.length`
 * nor iteration is reached. Problems already collected are preserved, so a
 * request that is malformed in several ways still reports what was established
 * before the shape failure.
 *
 * The validation contract itself is unchanged: every rule that held before
 * still holds, with the identical problem strings. This repair only stops the
 * validator from crashing on the input it exists to reject.
 */
export function aiTutorRequestProblems(request: unknown): string[] {
  if (!isRecord(request)) {
    return ["request must be an object"];
  }

  const problems: string[] = [];

  if (request.schemaVersion !== AI_TUTOR_REQUEST_SCHEMA) {
    problems.push("unsupported schema version");
  }
  if (request.task !== "tutor") problems.push("unsupported task");
  if (!nonEmpty(request.requestId)) problems.push("requestId is required");
  if (!nonEmpty(request.correlationId)) problems.push("correlationId is required");
  // Length is checked only once the field is known to be a string. The two
  // checks are mutually exclusive: a missing question cannot also be too long.
  if (!nonEmpty(request.learnerQuestion)) {
    problems.push("learnerQuestion is required");
  } else if (request.learnerQuestion.length > 4000) {
    problems.push("learnerQuestion exceeds 4000 characters");
  }

  if (!Array.isArray(request.context)) {
    problems.push("context must be an array");
    return problems;
  }
  if (request.context.length > 24) problems.push("context exceeds 24 sources");

  const ids = new Set<string>();
  for (const source of request.context) {
    if (!isRecord(source)) {
      problems.push("context source must be an object");
      continue;
    }

    // The label used in messages. `String` reproduces the previous template
    // interpolation exactly, including "undefined" for an absent id, so no
    // problem string changes shape for an input that already validated.
    const label = String(source.id);

    if (!nonEmpty(source.id)) {
      problems.push("context source id is required");
    } else {
      if (ids.has(source.id)) {
        problems.push(`duplicate context source id: ${source.id}`);
      }
      ids.add(source.id);
    }

    if (
      typeof source.kind !== "string" ||
      !(CONTEXT_KINDS as readonly string[]).includes(source.kind)
    ) {
      problems.push(`unsupported context kind: ${String(source.kind)}`);
    }
    if (!nonEmpty(source.text)) problems.push(`context source ${label} has no text`);
    if (!nonEmpty(source.provenance)) {
      problems.push(`context source ${label} has no provenance`);
    }
    if (source.kind === "selected_note") {
      if (source.learnerSelected !== true) {
        problems.push(`selected note ${label} was not explicitly selected by the learner`);
      }
      if (source.ownerScope !== "current_learner") {
        problems.push(`selected note ${label} is not scoped to the current learner`);
      }
    }
    if (source.kind === "trusted_lab_state" && source.trusted !== true) {
      problems.push(`lab state ${label} is not trusted deterministic state`);
    }
  }

  return problems;
}

/**
 * The fail-closed gate. Narrows an untrusted value to `AiTutorRequest`, or
 * throws the normalized non-retryable `VALIDATION_ERROR`.
 *
 * Declared as a type assertion so a caller that validates an `unknown` payload
 * gains the narrowed type from the check itself. That removes the reason a
 * caller would otherwise cast an unvalidated body into `AiTutorRequest` just to
 * reach this function, which is how an unchecked value gets downstream.
 */
export function assertValidAiTutorRequest(
  request: unknown
): asserts request is AiTutorRequest {
  const problems = aiTutorRequestProblems(request);
  if (problems.length === 0) return;

  throw new AppError({
    code: "VALIDATION_ERROR",
    message: "Invalid AI Tutor request",
    retryable: false,
    details: { problems }
  });
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\b(?:password|passwd|api[_-]?key|secret|token)\s*[:=]\s*\S+/i,
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/
];

export function containsLikelySecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function redactLikelySecrets(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

/**
 * Provider output is normalized by construction: only fields in the Tutor
 * contract survive. Provider-specific or mutation-shaped fields are discarded.
 */
export function normalizeAiTutorProviderOutput(
  requestId: string,
  providerId: string,
  raw: unknown,
  allowedSourceIds: ReadonlySet<string>,
  trustedLabStateAvailable = false
): AiTutorResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "AI provider returned an invalid response",
      retryable: true
    });
  }

  const value = raw as Record<string, unknown>;
  if (!nonEmpty(value.conciseAnswer) || !nonEmpty(value.explanation)) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "AI provider response is missing required explanation fields",
      retryable: true
    });
  }

  const grounding: AiTutorGrounding =
    value.grounding === "lesson" ||
    value.grounding === "general" ||
    value.grounding === "unavailable"
      ? value.grounding
      : "general";

  const steps = Array.isArray(value.steps)
    ? value.steps.filter(nonEmpty).slice(0, 8)
    : [];

  const referenceIds = Array.isArray(value.referenceIds)
    ? value.referenceIds.filter(nonEmpty)
    : [];

  const references = [...new Set(referenceIds)]
    .filter((sourceId) => allowedSourceIds.has(sourceId))
    .map((sourceId) => ({ sourceId, label: sourceId }));

  return {
    schemaVersion: AI_TUTOR_RESPONSE_SCHEMA,
    requestId,
    conciseAnswer: value.conciseAnswer.trim(),
    explanation: value.explanation.trim(),
    steps,
    references,
    ...(nonEmpty(value.nextAction)
      ? { nextAction: value.nextAction.trim() }
      : {}),
    ...(nonEmpty(value.uncertainty)
      ? { uncertainty: value.uncertainty.trim() }
      : {}),
    grounding,
    availability: {
      trustedLabState: trustedLabStateAvailable ? "available" : "unavailable"
    },
    authority: AI_TUTOR_AUTHORITY,
    providerId
  };
}
