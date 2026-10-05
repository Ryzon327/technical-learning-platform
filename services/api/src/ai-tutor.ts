import {
  AppError,
  assertValidAiTutorRequest,
  containsLikelySecret,
  normalizeAiTutorProviderOutput,
  type AiTutorContextKind,
  type AiTutorContextSource,
  type AiTutorProviderOutput,
  type AiTutorRequest,
  type AiTutorResponse
} from "@tlp/shared-types";

export interface AiTutorProviderRequest {
  requestId: string;
  correlationId: string;
  learnerQuestion: string;
  context: readonly AiTutorContextSource[];
  trustedLabStateAvailable: boolean;
}

export interface AiTutorProvider {
  readonly id: string;
  complete(
    request: AiTutorProviderRequest,
    signal: AbortSignal
  ): Promise<unknown>;
}

export interface AiTutorRunOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  maxContextCharacters?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_MAX_CONTEXT_CHARACTERS = 6_000;

const CONTEXT_PRIORITY: Readonly<Record<AiTutorContextKind, number>> = {
  lesson_text: 1,
  transcript: 2,
  curriculum_objective: 3,
  glossary: 4,
  practice_prompt: 5,
  approved_reference: 6,
  selected_note: 7,
  trusted_lab_state: 8
};

function validationError(message: string, details?: Record<string, unknown>) {
  return new AppError({
    code: "VALIDATION_ERROR",
    message,
    retryable: false,
    ...(details ? { details } : {})
  });
}

function dependencyError(message: string) {
  return new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });
}

/**
 * Minimum-context selection is deterministic and provider-independent. Current
 * lesson material wins over broader references, while explicitly selected notes
 * and trusted lab state remain available when the budget permits.
 */
export function selectAiTutorGrounding(
  request: AiTutorRequest,
  maxCharacters = DEFAULT_MAX_CONTEXT_CHARACTERS
): AiTutorContextSource[] {
  const boundedMax = Math.max(256, Math.min(maxCharacters, 20_000));
  const ordered = [...request.context].sort((left, right) => {
    const priority = CONTEXT_PRIORITY[left.kind] - CONTEXT_PRIORITY[right.kind];
    return priority === 0 ? left.id.localeCompare(right.id) : priority;
  });

  const selected: AiTutorContextSource[] = [];
  let used = 0;

  for (const source of ordered) {
    const remaining = boundedMax - used;
    if (remaining <= 0) break;

    if (source.text.length <= remaining) {
      selected.push(source);
      used += source.text.length;
      continue;
    }

    // Keep the highest-priority first source useful without silently sending a
    // larger context than the contract allows.
    if (selected.length === 0) {
      selected.push({ ...source, text: source.text.slice(0, remaining) });
    }
    break;
  }

  return selected;
}

export function assertAiTutorPrivacyBoundary(request: AiTutorRequest): void {
  if (containsLikelySecret(request.learnerQuestion)) {
    throw validationError("AI Tutor request contains a likely secret");
  }

  for (const source of request.context) {
    if (containsLikelySecret(source.text)) {
      throw validationError("AI Tutor context contains a likely secret", {
        sourceId: source.id,
        kind: source.kind
      });
    }
  }
}

export function buildAiTutorAuditMetadata(
  request: AiTutorRequest,
  selectedContext: readonly AiTutorContextSource[]
): Record<string, unknown> {
  return {
    requestId: request.requestId,
    correlationId: request.correlationId,
    task: request.task,
    contextCount: selectedContext.length,
    contextKinds: selectedContext.map((source) => source.kind),
    contextSourceIds: selectedContext.map((source) => source.id),
    trustedLabStateAvailable: selectedContext.some(
      (source) => source.kind === "trusted_lab_state"
    )
  };
}

async function callProviderWithTimeout(
  provider: AiTutorProvider,
  input: AiTutorProviderRequest,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();

  return await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(dependencyError("AI Tutor provider timed out"));
    }, timeoutMs);

    provider
      .complete(input, controller.signal)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function asProviderError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  return dependencyError("AI Tutor provider is unavailable");
}

export async function answerAiTutorQuestion(
  request: AiTutorRequest,
  provider: AiTutorProvider,
  options: AiTutorRunOptions = {}
): Promise<AiTutorResponse> {
  assertValidAiTutorRequest(request);
  assertAiTutorPrivacyBoundary(request);

  const selectedContext = selectAiTutorGrounding(
    request,
    options.maxContextCharacters
  );
  const trustedLabStateAvailable = selectedContext.some(
    (source) => source.kind === "trusted_lab_state"
  );

  const providerRequest: AiTutorProviderRequest = {
    requestId: request.requestId,
    correlationId: request.correlationId,
    learnerQuestion: request.learnerQuestion,
    context: selectedContext,
    trustedLabStateAvailable
  };

  const timeoutMs = Math.max(
    50,
    Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30_000)
  );
  const maxAttempts = Math.max(
    1,
    Math.min(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, 2)
  );

  let lastError: AppError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const raw = await callProviderWithTimeout(
        provider,
        providerRequest,
        timeoutMs
      );
      return normalizeAiTutorProviderOutput(
        request.requestId,
        provider.id,
        raw,
        new Set(selectedContext.map((source) => source.id)),
        trustedLabStateAvailable
      );
    } catch (error) {
      lastError = asProviderError(error);
      if (!lastError.retryable || attempt === maxAttempts) break;
    }
  }

  throw (
    lastError ??
    dependencyError("AI Tutor provider failed without a normalized error")
  );
}

/**
 * Deterministic provider for tests and local contract exercises. It never calls
 * a network service and therefore needs no credential or billing account.
 */
export function createStaticAiTutorProvider(
  output:
    | AiTutorProviderOutput
    | ((request: AiTutorProviderRequest) => AiTutorProviderOutput),
  id = "local-test"
): AiTutorProvider {
  return {
    id,
    async complete(request) {
      return typeof output === "function" ? output(request) : output;
    }
  };
}
