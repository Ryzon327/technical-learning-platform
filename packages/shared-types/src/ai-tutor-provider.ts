/**
 * AI Tutor foundation — the provider-neutral interface.
 *
 * `AIGW-002` for the Tutor task family. One contract that a local model, a
 * self-hosted service or a future hosted provider can implement, with
 * normalized errors, a bounded retry policy and a redacted prompt.
 *
 * ## No provider is activated here
 *
 * There is no SDK import, no base URL, no credential, no network call and no
 * environment read anywhere in this module or in the local provider that
 * implements it. `AI_TUTOR_FORBIDDEN_PROVIDER_ENV` names the variables this
 * package refuses to consult, and the verifier asserts their absence from the
 * implementation. Connecting a paid provider is `AIGW-010`, a separate
 * authorized package, and it is not this one.
 *
 * ## The provider sees a prompt, never a request
 *
 * `TutorProviderPrompt` is a different type from `TutorRequest` on purpose. It
 * carries no learner identity, no note id, no correlation id and no lesson
 * version — only the task, the question, the already-selected grounding, the
 * redacted excerpts the learner chose to include, and whether lab state is
 * knowable. `AI_TUTOR_PROVIDER_PROMPT_FORBIDDEN_FIELDS` holds that boundary as
 * data.
 *
 * Lab state reaches a provider as an AVAILABILITY and never as a verdict. A
 * model that is told "the check passed" can repeat that as its own judgement;
 * a model that is told "lab state is unavailable" cannot.
 *
 * ## Errors are normalized, and unavailable is a first-class answer
 *
 * `AIGW-006`: bounded retry, no retry storm, and an honest AI-unavailable state
 * when nothing can serve the request. There is no fallback chain here —
 * fallback across providers is `AIGW-006`'s own package, needs a routing policy
 * this foundation does not define, and silently widening privacy class to reach
 * a second provider is exactly what section 6 of that Feature excludes.
 *
 * Pure module: no I/O, no clock, no randomness, no timers. The timeout POLICY
 * lives here; the timer that enforces it lives in the service.
 */

import type { HealthState } from "./index";
import {
  redactTutorText,
  screenTutorTextsForSecrets,
  type TutorSecretScreening
} from "./ai-tutor-privacy";
import type {
  TutorGroundingMode,
  TutorGroundingSegment
} from "./ai-tutor-grounding";
import type { TutorPresentationPreference } from "./ai-tutor-lesson-context";
import type { TutorRequest, TutorTaskType } from "./ai-tutor-request";

export const AI_TUTOR_PROVIDER_CONTRACT_VERSION = "ai-tutor-provider-v1";

/**
 * Normalized provider failures.
 *
 * A closed vocabulary, so a calling surface never parses a provider-specific
 * error and never shows one to a learner. `provider_disabled` is deliberately
 * distinct from `provider_unavailable`: one is a policy decision and must not
 * be retried, the other is a condition that may pass.
 */
export const TUTOR_PROVIDER_ERRORS = [
  "provider_unavailable",
  "provider_disabled",
  "timeout",
  "rate_limited",
  "unsupported_capability",
  "context_too_large",
  "invalid_provider_response"
] as const;

export type TutorProviderError = (typeof TUTOR_PROVIDER_ERRORS)[number];

/**
 * Which failures may be retried.
 *
 * Returns true for exactly three, so a failure kind added later is NOT retried
 * until someone decides it should be. `invalid_provider_response` is excluded
 * on purpose: retrying a model that returned malformed output is how a retry
 * storm starts, and the second attempt has no more reason to parse than the
 * first.
 */
export function isRetryableTutorProviderError(
  error: TutorProviderError
): boolean {
  return (
    error === "provider_unavailable" ||
    error === "timeout" ||
    error === "rate_limited"
  );
}

/** Bounded, and small. Two attempts total, never an unbounded loop. */
export const TUTOR_PROVIDER_TIMEOUT_MS = 8_000;
export const TUTOR_PROVIDER_MAX_ATTEMPTS = 2;
export const TUTOR_PROVIDER_RETRY_DELAY_MS = 250;

/**
 * Whether another attempt is allowed.
 *
 * Takes the attempt count AND the error, so neither alone can authorize a
 * retry. `attempt` is 1-based: the first call is attempt 1.
 */
export function mayRetryTutorProvider(
  attempt: number,
  error: TutorProviderError
): boolean {
  if (!Number.isInteger(attempt) || attempt < 1) return false;
  if (attempt >= TUTOR_PROVIDER_MAX_ATTEMPTS) return false;
  return isRetryableTutorProviderError(error);
}

/** Deterministic backoff. No jitter, so the delay is reproducible in tests. */
export function tutorRetryDelayMs(attempt: number): number {
  return TUTOR_PROVIDER_RETRY_DELAY_MS * Math.max(1, attempt);
}

/* ------------------------------------------------------------------ *
 * Capabilities and health
 * ------------------------------------------------------------------ */

/**
 * Honest capability metadata.
 *
 * `AIGW-009` section 8: a provider must advertise its ACTUAL capability, and
 * the Gateway must not route a task to a model merely because it is free.
 * `processesLocally` exists so a local-only privacy class can be enforced
 * without asking the provider's name.
 */
export interface TutorProviderCapabilities {
  providerId: string;
  contractVersion: string;
  processesLocally: boolean;
  supportsStructuredOutput: boolean;
  maxContextCharacters: number;
  maxOutputCharacters: number;
  supportedTaskTypes: readonly TutorTaskType[];
}

export interface TutorProviderHealth {
  providerId: string;
  state: HealthState;
  checkedAt: string;
}

/* ------------------------------------------------------------------ *
 * The prompt
 * ------------------------------------------------------------------ */

/**
 * Lab state as a provider may see it: knowable, or not.
 *
 * No verdict, no check result, no pass/fail. See the module header.
 */
export type TutorPromptLabAvailability = "available" | "unavailable";

/**
 * Everything a provider receives, and nothing else.
 *
 * Built by `buildTutorProviderPrompt` and never by a spread of the request.
 */
export interface TutorProviderPrompt {
  contractVersion: string;
  taskType: TutorTaskType;
  question: string;
  groundingMode: TutorGroundingMode;
  groundingSegments: readonly {
    kind: string;
    segmentStableId: string;
    title: string;
    text: string;
  }[];
  learnerSelectedExcerpts: readonly string[];
  labAvailability: TutorPromptLabAvailability;
  presentation: TutorPresentationPreference;
  maxOutputCharacters: number;
}

/**
 * Fields a provider prompt must never carry.
 *
 * Held as data so tests and the verifier assert the prohibition directly.
 */
export const AI_TUTOR_PROVIDER_PROMPT_FORBIDDEN_FIELDS: readonly string[] = [
  "userId",
  "user_id",
  "ownerId",
  "studentId",
  "learnerId",
  "email",
  "accessToken",
  "authorization",
  "apiKey",
  "noteId",
  "noteIds",
  "correlationId",
  "requestId",
  "missionVersion",
  "labValidationResult",
  "labPassed",
  "validationRunId",
  "sessionId",
  "competencyStableId",
  "score"
];

/**
 * Builds the redacted provider prompt.
 *
 * Three guarantees, each by construction:
 *
 *   - ASSEMBLED FIELD BY FIELD. Nothing is spread, so a field added to
 *     `TutorRequest` later cannot reach a provider without someone editing this
 *     function.
 *   - REDACTED. Every string that leaves is passed through `redactTutorText`.
 *     The request was already screened and refused if a credential was found,
 *     so this is defence in depth over content that should already be clean.
 *   - BOUNDED. The caller supplies the provider's own output ceiling, so a
 *     prompt never asks for more than the provider advertises.
 */
export function buildTutorProviderPrompt(input: {
  request: TutorRequest;
  groundingMode: TutorGroundingMode;
  groundingSegments: readonly TutorGroundingSegment[];
  maxOutputCharacters: number;
}): TutorProviderPrompt {
  return {
    contractVersion: AI_TUTOR_PROVIDER_CONTRACT_VERSION,
    taskType: input.request.taskType,
    question: redactTutorText(input.request.question),
    groundingMode: input.groundingMode,
    groundingSegments: input.groundingSegments.map((segment) => ({
      kind: segment.kind,
      segmentStableId: segment.segmentStableId,
      title: redactTutorText(segment.title),
      text: redactTutorText(segment.text)
    })),
    learnerSelectedExcerpts: input.request.noteExcerpts.map((entry) =>
      redactTutorText(entry.excerpt)
    ),
    labAvailability: input.request.labState.availability,
    presentation: { ...input.request.presentation },
    maxOutputCharacters: input.maxOutputCharacters
  };
}

/**
 * Whether a candidate prompt carries a prohibited field at any depth.
 *
 * Exposed so the service and the tests can check the prompt itself rather than
 * trusting the builder.
 */
export function containsForbiddenPromptField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsForbiddenPromptField(entry));
  }

  if (!value || typeof value !== "object") return false;

  const forbidden = new Set(
    AI_TUTOR_PROVIDER_PROMPT_FORBIDDEN_FIELDS.map((field) =>
      field.toLowerCase()
    )
  );

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key.toLowerCase())) return true;
    if (containsForbiddenPromptField(nested)) return true;
  }

  return false;
}

/**
 * Screens an assembled prompt for credential shapes.
 *
 * The last gate before transmission. Redaction has already run, so a detection
 * here means redaction did not cover a shape and the caller must refuse rather
 * than send.
 *
 * It delegates to the privacy module's screen: the package has exactly one set
 * of credential patterns and one screening implementation, so the two gates
 * cannot drift apart.
 */
export function screenTutorPrompt(
  prompt: TutorProviderPrompt
): TutorSecretScreening {
  return screenTutorTextsForSecrets([
    prompt.question,
    ...prompt.groundingSegments.flatMap((segment) => [
      segment.title,
      segment.text
    ]),
    ...prompt.learnerSelectedExcerpts
  ]);
}

/* ------------------------------------------------------------------ *
 * Provider output and the interface itself
 * ------------------------------------------------------------------ */

/**
 * Raw, UNTRUSTED provider output.
 *
 * Every field is `unknown`, because a provider is not a type system. Validation
 * and the boundary refusal happen in `ai-tutor-response.ts`; nothing here
 * assumes any field is present or well-shaped.
 */
export interface TutorProviderOutput {
  answer?: unknown;
  explanation?: unknown;
  stepGuidance?: unknown;
  citedSegmentStableIds?: unknown;
  /** The provider's own statement that it could not ground its answer. */
  uncertain?: unknown;
}

export type TutorProviderResult =
  | {
      status: "completed";
      providerId: string;
      output: TutorProviderOutput;
      usage?: { promptCharacters: number; outputCharacters: number };
    }
  | { status: "failed"; providerId: string; error: TutorProviderError };

/**
 * The provider contract.
 *
 * Three methods. `generate` receives an `AbortSignal` so cancellation is the
 * provider's responsibility as well as the caller's, and a `timeoutMs` so a
 * provider that can bound itself does.
 */
export interface TutorProvider {
  readonly providerId: string;
  getCapabilities(): TutorProviderCapabilities;
  getHealth(): Promise<TutorProviderHealth>;
  generate(
    prompt: TutorProviderPrompt,
    options: { timeoutMs: number; signal?: AbortSignal }
  ): Promise<TutorProviderResult>;
}

/**
 * Whether a provider can serve this prompt at all.
 *
 * Checked BEFORE a call, so an oversized context or an unsupported task is a
 * normalized refusal rather than a provider-specific error. Returns null when
 * the provider is suitable.
 */
export function checkTutorProviderSuitability(
  capabilities: TutorProviderCapabilities,
  prompt: TutorProviderPrompt
): TutorProviderError | null {
  if (!capabilities.supportedTaskTypes.includes(prompt.taskType)) {
    return "unsupported_capability";
  }

  const promptCharacters =
    prompt.question.length +
    prompt.groundingSegments.reduce(
      (total, segment) => total + segment.title.length + segment.text.length,
      0
    ) +
    prompt.learnerSelectedExcerpts.reduce(
      (total, excerpt) => total + excerpt.length,
      0
    );

  if (promptCharacters > capabilities.maxContextCharacters) {
    return "context_too_large";
  }

  return null;
}

/** The accessible learner-facing sentence for each normalized failure. */
export function describeTutorProviderError(error: TutorProviderError): string {
  switch (error) {
    case "provider_disabled":
      return "The Tutor is switched off right now. Your lesson, your work and your notes are unaffected.";
    case "timeout":
      return "The Tutor took too long to answer, so nothing was returned. Your work is unchanged — you can ask again.";
    case "rate_limited":
      return "The Tutor is busy right now. Try again in a moment. Your work is unchanged.";
    case "unsupported_capability":
      return "The Tutor cannot help with that kind of request right now.";
    case "context_too_large":
      return "That question includes too much lesson content for the Tutor. Ask about a smaller part of the lesson.";
    case "invalid_provider_response":
      return "The Tutor's answer could not be read, so none of it is being shown. Your work is unchanged.";
    default:
      return "The Tutor is unavailable right now. Your lesson, your work and your notes are unaffected.";
  }
}
