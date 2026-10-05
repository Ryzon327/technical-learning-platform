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

export function aiTutorRequestProblems(request: AiTutorRequest): string[] {
  const problems: string[] = [];

  if (request.schemaVersion !== AI_TUTOR_REQUEST_SCHEMA) {
    problems.push("unsupported schema version");
  }
  if (request.task !== "tutor") problems.push("unsupported task");
  if (!nonEmpty(request.requestId)) problems.push("requestId is required");
  if (!nonEmpty(request.correlationId)) problems.push("correlationId is required");
  if (!nonEmpty(request.learnerQuestion)) problems.push("learnerQuestion is required");
  if (request.learnerQuestion.length > 4000) {
    problems.push("learnerQuestion exceeds 4000 characters");
  }
  if (!Array.isArray(request.context)) problems.push("context must be an array");
  if (request.context.length > 24) problems.push("context exceeds 24 sources");

  const ids = new Set<string>();
  for (const source of request.context) {
    if (!nonEmpty(source.id)) problems.push("context source id is required");
    if (ids.has(source.id)) problems.push(`duplicate context source id: ${source.id}`);
    ids.add(source.id);

    if (!(CONTEXT_KINDS as readonly string[]).includes(source.kind)) {
      problems.push(`unsupported context kind: ${String(source.kind)}`);
    }
    if (!nonEmpty(source.text)) problems.push(`context source ${source.id} has no text`);
    if (!nonEmpty(source.provenance)) {
      problems.push(`context source ${source.id} has no provenance`);
    }
    if (source.kind === "selected_note" && source.learnerSelected !== true) {
      problems.push(`selected note ${source.id} was not explicitly selected by the learner`);
    }
    if (source.kind === "trusted_lab_state" && source.trusted !== true) {
      problems.push(`lab state ${source.id} is not trusted deterministic state`);
    }
  }

  return problems;
}

export function assertValidAiTutorRequest(request: AiTutorRequest): void {
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
