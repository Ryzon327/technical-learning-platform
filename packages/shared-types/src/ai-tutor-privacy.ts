/**
 * AI Tutor foundation — privacy, secret screening, redaction and log safety.
 *
 * `AIGW-005`, applied to the Tutor. Two deterministic controls and one
 * projection:
 *
 *   1. SCREENING — does this text look like it contains a credential?
 *   2. REDACTION — the seam that masks a detection before any text could reach
 *      a provider, as defence in depth behind the screening block.
 *   3. LOG PROJECTION — what may be written to a routine log, which is
 *      operational metadata and never learner prose.
 *
 * ## Deterministic, never AI
 *
 * `AIGW-005` section 12 is explicit: AI is not used to decide whether obvious
 * secrets should be protected when deterministic screening can do so. Every
 * decision here is a pattern match over text the caller already holds.
 *
 * ## This does not claim to be DLP
 *
 * `AIGW-005` section 6 excludes "claiming perfect DLP", and this module makes no
 * such claim. It detects well-known credential SHAPES. It is the deterministic
 * floor under a request contract that already carries minimum-necessary context,
 * not a guarantee that no sensitive string can ever exist in a question.
 *
 * ## Why screening blocks rather than silently redacting the question
 *
 * A learner who pasted a key needs to know it was not sent. Section 11 requires
 * that a privacy warning explain what was blocked, offer an accessible choice,
 * not rely on colour alone, and avoid exposing the secret again. So the request
 * is refused, the learner is told which KIND of credential was recognised, and
 * the value itself is never echoed back, never logged and never transmitted.
 *
 * Pure module: no I/O, no clock, no randomness, no provider, no AI.
 */

export const AI_TUTOR_PRIVACY_MODEL_VERSION = "ai-tutor-privacy-v1";

/**
 * Credential shapes the Tutor refuses to transmit.
 *
 * Every pattern is assembled from character classes rather than a literal
 * example, so this source contains no string that itself looks like a
 * credential — `scripts/security-scan.sh` scans every tracked file, and a
 * detector written with literal examples would trip the scanner it supports.
 */
export const TUTOR_SECRET_PATTERNS: readonly {
  label: string;
  pattern: RegExp;
}[] = [
  { label: "private key", pattern: /-{5}BEGIN(?: [A-Z]+)? PRIVATE KEY-{5}/ },
  { label: "cloud access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "provider api key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "source control token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  {
    label: "signed token",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/
  },
  {
    label: "bearer token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}/i
  },
  {
    label: "password",
    pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*\S{6,}/i
  },
  {
    label: "api key assignment",
    pattern: /\b(?:api[_-]?key|apikey|secret|access[_-]?token|service[_-]?role[_-]?key)\s*[:=]\s*\S{8,}/i
  },
  /**
   * A bare `token:`, `key:` or `credential:` followed by a long opaque value.
   *
   * The 16-character floor is the whole design of this pattern. `AIGW-005`
   * section 9 says detection should err toward blocking rather than silently
   * transmitting an obvious credential, but a 6-character floor would refuse
   * "explain this key: 0x1A2B" — legitimate technical content the platform
   * exists to teach. Sixteen unbroken non-space characters after an assignment
   * is a credential shape; a short hex value or a sentence is not.
   */
  {
    label: "credential assignment",
    pattern: /\b(?:token|key|passphrase|credential)\s*[:=]\s*\S{16,}/i
  },
  {
    label: "connection string credential",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i
  }
];

/**
 * Environment names the Tutor foundation must never read.
 *
 * Held as data, and asserted absent from the implementation by the verifier.
 * This package activates no paid provider and requires no production
 * credential; naming the variables it refuses to consult is how that stays
 * checkable instead of being a claim in a pull request.
 */
export const AI_TUTOR_FORBIDDEN_PROVIDER_ENV: readonly string[] = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "COHERE_API_KEY",
  "MISTRAL_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
];

export interface TutorSecretScreening {
  detected: boolean;
  /** Which KINDS were recognised. Never the matched text. */
  labels: readonly string[];
}

/**
 * Screens one string for credential shapes.
 *
 * Returns labels only. The matched substring is never returned, so no caller —
 * including a logger or an error message — can accidentally propagate it.
 */
export function screenTutorTextForSecrets(value: unknown): TutorSecretScreening {
  const text = typeof value === "string" ? value : String(value ?? "");
  const labels: string[] = [];

  for (const { label, pattern } of TUTOR_SECRET_PATTERNS) {
    // A fresh RegExp per test: the shared literals carry no `g` flag, so
    // `lastIndex` cannot leak between calls, and this stays explicit about it.
    if (new RegExp(pattern.source, pattern.flags).test(text)) {
      if (!labels.includes(label)) labels.push(label);
    }
  }

  return { detected: labels.length > 0, labels };
}

/** Screens several strings as one decision. */
export function screenTutorTextsForSecrets(
  values: readonly unknown[]
): TutorSecretScreening {
  const labels: string[] = [];

  for (const value of values) {
    for (const label of screenTutorTextForSecrets(value).labels) {
      if (!labels.includes(label)) labels.push(label);
    }
  }

  return { detected: labels.length > 0, labels };
}

export const TUTOR_REDACTION_MARKER = "[REDACTED]";

/**
 * The redaction seam.
 *
 * Replaces every recognised credential shape with a fixed marker that names no
 * kind and reveals no length. It is defence in depth: a screened request is
 * already refused, so nothing redacted here is expected to exist. It runs
 * anyway, on every string that reaches a provider prompt, because "expected not
 * to exist" is not a boundary.
 */
export function redactTutorText(value: unknown): string {
  let text = typeof value === "string" ? value : String(value ?? "");

  for (const { pattern } of TUTOR_SECRET_PATTERNS) {
    text = text.replace(
      new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`),
      TUTOR_REDACTION_MARKER
    );
  }

  return text;
}

/**
 * The accessible explanation for a blocked request.
 *
 * Names the kind, never the value, and tells the learner exactly what to do.
 * There is no colour, no icon and no severity code in this string — the text
 * alone carries the whole message, which is what section 11 requires.
 */
export function describeTutorSecretBlocked(
  labels: readonly string[]
): string {
  const kinds = labels.length > 0 ? labels.join(", ") : "credential";

  return (
    `Your question was not sent, because it looks like it contains a ${kinds}. ` +
    "Nothing was transmitted and nothing was stored. Remove that value and ask again — " +
    "you can describe the problem without pasting the credential itself."
  );
}

/* ------------------------------------------------------------------ *
 * Log projection
 * ------------------------------------------------------------------ */

/**
 * Fields a routine Tutor log record must never contain.
 *
 * Held as data so tests and the verifier assert the prohibition directly.
 * `AIGW-008` section 6 excludes full prompt logging, full response logging and
 * secret logging BY DEFAULT, and this list is how "by default" is enforced
 * rather than remembered.
 */
export const AI_TUTOR_LOG_FORBIDDEN_FIELDS: readonly string[] = [
  "question",
  "prompt",
  "answer",
  "explanation",
  "noteExcerpt",
  "noteExcerpts",
  "noteBody",
  "excerpt",
  "transcript",
  "lessonText",
  "groundingText",
  "segments",
  "providerPrompt",
  "providerOutput",
  "rawOutput",
  "apiKey",
  "accessToken",
  "authorization",
  "userId",
  "user_id",
  "ownerId",
  "studentId",
  "learnerId",
  "email"
];

/**
 * The minimum a Tutor request must expose to be logged operationally.
 *
 * A narrow structural interface rather than an import of `TutorRequest`. That
 * keeps this module a leaf — the request contract composes privacy, never the
 * other way round — and it means the projection cannot accidentally gain access
 * to a field the request adds later.
 */
export interface TutorLoggableRequest {
  readonly contractVersion: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly callingEngine: string;
  readonly taskType: string;
  readonly privacyClass: string;
}

/**
 * One operational log record for a Tutor request.
 *
 * Answers "what happened operationally?" and never "what did the learner say?".
 * Counts replace content: `noteExcerptCount` makes a privacy-relevant fact
 * measurable without storing a single word of a private note.
 */
export interface TutorRequestLogProjection {
  contractVersion: string;
  requestId: string;
  correlationId: string;
  callingEngine: string;
  taskType: string;
  privacyClass: string;
  questionLength: number;
  noteExcerptCount: number;
  groundingRefCount: number;
  labStateAvailability: string;
  explanationDepth: string;
  languageRegister: string;
}

export function projectTutorRequestForLog(input: {
  request: TutorLoggableRequest;
  questionLength: number;
  noteExcerptCount: number;
  groundingRefCount: number;
  labStateAvailability: string;
  explanationDepth: string;
  languageRegister: string;
}): TutorRequestLogProjection {
  // Assembled by explicit assignment, never by a spread of the request. A
  // spread would silently carry any field the contract gains later, which is
  // exactly how prompt text ends up in a log nobody meant to widen.
  return {
    contractVersion: input.request.contractVersion,
    requestId: input.request.requestId,
    correlationId: input.request.correlationId,
    callingEngine: input.request.callingEngine,
    taskType: input.request.taskType,
    privacyClass: input.request.privacyClass,
    questionLength: input.questionLength,
    noteExcerptCount: input.noteExcerptCount,
    groundingRefCount: input.groundingRefCount,
    labStateAvailability: input.labStateAvailability,
    explanationDepth: input.explanationDepth,
    languageRegister: input.languageRegister
  };
}

/** One operational log record for a Tutor outcome. */
export interface TutorOutcomeLogProjection {
  requestId: string;
  correlationId: string;
  providerId: string;
  outcome: string;
  groundingMode: string;
  citationCount: number;
  attempts: number;
  latencyMs: number;
  answerLength: number;
}

export function projectTutorOutcomeForLog(
  input: TutorOutcomeLogProjection
): TutorOutcomeLogProjection {
  return {
    requestId: input.requestId,
    correlationId: input.correlationId,
    providerId: input.providerId,
    outcome: input.outcome,
    groundingMode: input.groundingMode,
    citationCount: input.citationCount,
    attempts: input.attempts,
    latencyMs: input.latencyMs,
    answerLength: input.answerLength
  };
}

/**
 * Whether a candidate log record carries a prohibited field at any depth.
 *
 * Exposed so a test can assert the projection's output rather than trust it,
 * and so a future logging site can check itself before writing.
 */
export function containsForbiddenLogField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsForbiddenLogField(entry));
  }

  if (!value || typeof value !== "object") return false;

  const forbidden = new Set(
    AI_TUTOR_LOG_FORBIDDEN_FIELDS.map((field) => field.toLowerCase())
  );

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key.toLowerCase())) return true;
    if (containsForbiddenLogField(nested)) return true;
  }

  return false;
}
