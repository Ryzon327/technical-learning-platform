import {
  assembleTutorRequest,
  buildTutorDeferralResponse,
  buildTutorProviderPrompt,
  buildTutorUnavailableResponse,
  checkTutorProviderSuitability,
  containsForbiddenPromptField,
  mayRetryTutorProvider,
  normalizeTutorProviderOutput,
  projectTutorOutcomeForLog,
  projectTutorRequestForLog,
  screenTutorPrompt,
  selectTutorGrounding,
  tutorRetryDelayMs,
  TUTOR_PROVIDER_TIMEOUT_MS,
  type TutorDeferralSubject,
  type TutorGroundingMode,
  type TutorGroundingResolution,
  type TutorGroundingSource,
  type TutorNoteOwnershipDecision,
  type TutorProvider,
  type TutorProviderError,
  type TutorProviderResult,
  type TutorRequest,
  type TutorRequestInput,
  type TutorRequestRefusal,
  type TutorResponse
} from "@tlp/shared-types";

import { createUserScopedSupabaseClient } from "./supabase";
import { log } from "./logger";

/**
 * AI Tutor foundation — the service that composes the contracts.
 *
 * One function does the work: `runTutorTurn`. It validates, grounds, redacts,
 * calls a provider under a bounded timeout and a bounded retry, normalizes the
 * result against the deterministic boundary, and logs operational metadata
 * only.
 *
 * ## There is deliberately no HTTP route
 *
 * The acceptance criteria of this package are all "the platform can ...", never
 * "the learner can ask". Adding a route would mean exposing an AI surface
 * before the Gateway's routing, cost and provider-health policy
 * (`AIGW-003`/`AIGW-004`/`AIGW-006`) exist, and `server.ts` therefore gains
 * nothing here. This follows the `SEARCH-001` precedent, which also shipped a
 * complete contract and projection with no route.
 *
 * The accepted Lovable lesson workspace remains the canonical learner-facing
 * surface, and nothing in this package recreates or replaces any part of it.
 *
 * ## Ordering is the policy
 *
 * assemble -> ground -> prompt -> screen -> provider -> normalize.
 *
 * Nothing reaches a provider before validation, grounding selection, redaction
 * and the prompt screen have all passed. A refusal at any stage returns without
 * a provider call at all, so a malformed, credential-bearing or cross-learner
 * request costs nothing and transmits nothing.
 *
 * ## Why an unavailable lesson context does not become a general answer
 *
 * If a request asked for lesson grounding and the grounding source could not
 * serve it, the turn returns `context_unavailable` WITHOUT calling a provider.
 * Answering a lesson question from no lesson content is the "silent gap-filling"
 * `AIGW-011` section 2 names: it would make an ungrounded answer
 * indistinguishable from a grounded one. A request that asked for no grounding
 * is a different case and is served as `general`, labelled as such.
 *
 * ## Authorization
 *
 * Note ownership is resolved through the CALLER'S OWN client, so PostgreSQL row
 * level security decides which note rows exist for this caller. There is no
 * service-role path here and no caller-supplied identity: a note the caller
 * cannot read is indistinguishable from one that does not exist, and both
 * refuse the excerpt.
 */

/* ------------------------------------------------------------------ *
 * Note ownership — the one authoritative read in this service
 * ------------------------------------------------------------------ */

/**
 * Resolves whether each note belongs to the caller.
 *
 * The read goes through `createUserScopedSupabaseClient`, exactly as
 * `note-retrieval.ts` does, so there is ONE ownership mechanism in the
 * repository: the database policy. No identity is accepted from the caller and
 * no owner predicate is applied here — adding either would create a second
 * ownership mechanism beside row level security.
 *
 * A failed read yields `unavailable`, never `not_owned`. The two are different
 * facts, and the request contract refuses the excerpt for either, so failing
 * closed costs nothing and conflating them would hide a real outage.
 */
export async function resolveTutorNoteOwnership(
  accessToken: string,
  noteIds: readonly string[]
): Promise<TutorNoteOwnershipDecision[]> {
  const requested = [...new Set(noteIds.map((id) => id.trim()).filter(Boolean))];
  if (requested.length === 0) return [];

  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    return requested.map((noteId) => ({ noteId, ownership: "unavailable" }));
  }

  try {
    const supabase = createUserScopedSupabaseClient(accessToken);

    const { data, error } = await supabase
      .from("student_notes")
      .select("id")
      .in("id", requested);

    if (error) {
      return requested.map((noteId) => ({ noteId, ownership: "unavailable" }));
    }

    const visible = new Set(
      ((data ?? []) as unknown as Array<{ id: string }>).map((row) => row.id)
    );

    return requested.map((noteId) => ({
      noteId,
      ownership: visible.has(noteId) ? "owned" : "not_owned"
    }));
  } catch {
    return requested.map((noteId) => ({ noteId, ownership: "unavailable" }));
  }
}

/* ------------------------------------------------------------------ *
 * Bounded waiting
 * ------------------------------------------------------------------ */

export class TutorTimeoutError extends Error {
  constructor() {
    super("tutor operation timed out");
    this.name = "TutorTimeoutError";
  }
}

/**
 * Races a promise against a timeout and aborts the loser.
 *
 * The timer is always cleared, including on the success path, so a completed
 * turn never leaves a pending handle behind. The abort signal is passed to the
 * provider so a well-behaved adapter stops its own work rather than merely
 * having its result discarded.
 */
export async function runWithTutorTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TutorTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * The turn
 * ------------------------------------------------------------------ */

export type TutorTurnOutcome =
  | { status: "refused"; refusal: TutorRequestRefusal }
  | { status: "answered"; response: TutorResponse; attempts: number }
  | {
      status: "unavailable";
      response: TutorResponse;
      error: TutorProviderError;
      attempts: number;
    };

export interface RunTutorTurnInput {
  input: TutorRequestInput;
  requestId: string;
  issuedAt: string;
  noteOwnership: readonly TutorNoteOwnershipDecision[];
  /** A deterministic Lab Engine attestation, or nothing. Never client-supplied. */
  labStateClaim?: unknown;
  groundingSource: TutorGroundingSource;
  provider: TutorProvider;
  timeoutMs?: number;
  /**
   * A deterministic subject this question belongs to, resolved by the caller.
   *
   * Deliberately an INPUT rather than something inferred from question text: a
   * text heuristic is not a boundary, and the structural boundary in the
   * response contract does not depend on this being set correctly.
   */
  deferralSubject?: TutorDeferralSubject;
}

/**
 * Runs one Tutor turn.
 *
 * Every return path is one of three honest outcomes, and every one of them
 * leaves lesson state, practice scoring, lab validation, evidence and notes
 * untouched — this function performs no write of any kind.
 */
export async function runTutorTurn(
  input: RunTutorTurnInput
): Promise<TutorTurnOutcome> {
  const timeoutMs = input.timeoutMs ?? TUTOR_PROVIDER_TIMEOUT_MS;

  const assembly = assembleTutorRequest(input.input, {
    requestId: input.requestId,
    issuedAt: input.issuedAt,
    noteOwnership: input.noteOwnership,
    ...(input.labStateClaim === undefined
      ? {}
      : { labStateClaim: input.labStateClaim })
  });

  if (!assembly.ok) {
    // The refusal reason is operational metadata. The question is not logged,
    // and a detected credential is identified only by KIND — never by value.
    //
    // The field is `credentialKinds` rather than `secretLabels` deliberately:
    // `logger.ts` blanket-redacts any key containing "secret", which would
    // reduce a genuinely useful operational signal to `[REDACTED]`. The
    // sanitizer is correct and is not weakened here — the field simply does not
    // carry a secret, so it is not named like one.
    log("warn", "tutor request refused", {
      event: "ai_tutor.request_refused",
      correlationId: input.requestId,
      metadata: {
        requestId: input.requestId,
        rejection: assembly.refusal.rejection,
        credentialKinds: assembly.refusal.secretLabels ?? []
      }
    });

    return { status: "refused", refusal: assembly.refusal };
  }

  const request = assembly.request;

  log("info", "tutor request accepted", {
    event: "ai_tutor.request_accepted",
    correlationId: request.correlationId,
    metadata: {
      ...projectTutorRequestForLog({
        request,
        questionLength: request.question.length,
        noteExcerptCount: request.noteExcerpts.length,
        groundingRefCount: request.groundingRefs.length,
        labStateAvailability: request.labState.availability,
        explanationDepth: request.presentation.explanationDepth,
        languageRegister: request.presentation.languageRegister
      })
    }
  });

  // A deterministic question is answered by a deferral, with no provider call.
  if (input.deferralSubject) {
    const response = buildTutorDeferralResponse({
      requestId: request.requestId,
      correlationId: request.correlationId,
      subject: input.deferralSubject,
      groundingMode: "general",
      presentation: request.presentation,
      labState: request.labState
    });

    recordOutcome(request, response, input.provider.providerId, 0, 0);
    return { status: "answered", response, attempts: 0 };
  }

  const grounding = selectTutorGrounding({
    refs: request.groundingRefs,
    resolution: await resolveGrounding(
      input.groundingSource,
      request,
      timeoutMs
    )
  });

  // Asked for lesson content and received none usable: say so, do not guess.
  if (grounding.mode === "context_unavailable") {
    return unavailable(
      request,
      "provider_unavailable",
      grounding.mode,
      0,
      input.provider.providerId,
      "context_unavailable"
    );
  }

  const prompt = buildTutorProviderPrompt({
    request,
    groundingMode: grounding.mode,
    groundingSegments: grounding.segments,
    maxOutputCharacters: input.provider.getCapabilities().maxOutputCharacters
  });

  // Two gates over the assembled prompt, both fail-closed. A forbidden field
  // or a surviving credential shape means the prompt is not sent at all.
  if (containsForbiddenPromptField(prompt) || screenTutorPrompt(prompt).detected) {
    return unavailable(
      request,
      "invalid_provider_response",
      grounding.mode,
      0,
      input.provider.providerId,
      "prompt_rejected"
    );
  }

  const unsuitable = checkTutorProviderSuitability(
    input.provider.getCapabilities(),
    prompt
  );
  if (unsuitable) {
    return unavailable(
      request,
      unsuitable,
      grounding.mode,
      0,
      input.provider.providerId,
      "provider_unsuitable"
    );
  }

  let attempts = 0;
  let lastError: TutorProviderError = "provider_unavailable";

  while (attempts < 1 || mayRetryTutorProvider(attempts, lastError)) {
    if (attempts > 0) {
      await sleep(tutorRetryDelayMs(attempts));
    }

    attempts += 1;

    let result: TutorProviderResult;

    try {
      result = await runWithTutorTimeout(
        (signal) => input.provider.generate(prompt, { timeoutMs, signal }),
        timeoutMs
      );
    } catch (error) {
      lastError = error instanceof TutorTimeoutError ? "timeout" : "provider_unavailable";
      continue;
    }

    if (result.status === "failed") {
      lastError = result.error;
      continue;
    }

    const normalized = normalizeTutorProviderOutput({
      raw: result.output,
      requestId: request.requestId,
      correlationId: request.correlationId,
      groundingMode: grounding.mode,
      selectedSegments: grounding.segments,
      droppedSegmentCount: grounding.droppedSegmentCount,
      labState: request.labState,
      presentation: request.presentation
    });

    if (!normalized.ok) {
      // Never retried: a malformed or authority-claiming response has no more
      // reason to parse on a second attempt, and retrying it is a retry storm.
      return unavailable(
        request,
        normalized.error,
        grounding.mode,
        attempts,
        input.provider.providerId,
        "invalid_provider_response"
      );
    }

    recordOutcome(
      request,
      normalized.response,
      input.provider.providerId,
      attempts,
      normalized.response.droppedCitationCount
    );

    return { status: "answered", response: normalized.response, attempts };
  }

  return unavailable(
    request,
    lastError,
    grounding.mode,
    attempts,
    input.provider.providerId,
    "provider_failed"
  );

  function unavailable(
    forRequest: TutorRequest,
    error: TutorProviderError,
    groundingMode: TutorGroundingMode,
    attemptCount: number,
    providerId: string,
    reason: string
  ): TutorTurnOutcome {
    const response = buildTutorUnavailableResponse({
      requestId: forRequest.requestId,
      correlationId: forRequest.correlationId,
      error,
      groundingMode,
      presentation: forRequest.presentation,
      labState: forRequest.labState
    });

    log("warn", "tutor unavailable", {
      event: "ai_tutor.unavailable",
      correlationId: forRequest.correlationId,
      metadata: {
        ...projectTutorOutcomeForLog({
          requestId: forRequest.requestId,
          correlationId: forRequest.correlationId,
          providerId,
          outcome: "unavailable",
          groundingMode,
          citationCount: 0,
          attempts: attemptCount,
          latencyMs: 0,
          answerLength: 0
        }),
        reason,
        normalizedError: error
      }
    });

    return { status: "unavailable", response, error, attempts: attemptCount };
  }

  function recordOutcome(
    forRequest: TutorRequest,
    response: TutorResponse,
    providerId: string,
    attemptCount: number,
    droppedCitations: number
  ): void {
    log("info", "tutor answered", {
      event: "ai_tutor.answered",
      correlationId: forRequest.correlationId,
      metadata: {
        ...projectTutorOutcomeForLog({
          requestId: forRequest.requestId,
          correlationId: forRequest.correlationId,
          providerId,
          outcome: response.outcome,
          groundingMode: response.groundingMode,
          citationCount: response.citations.length,
          attempts: attemptCount,
          latencyMs: 0,
          answerLength: response.answer.length
        }),
        droppedCitationCount: droppedCitations,
        uncertaintyLevel: response.uncertainty.level
      }
    });
  }
}

/**
 * Resolves grounding under the same timeout as a provider call.
 *
 * A grounding source that hangs must not hold a lesson open. Any failure —
 * rejection, timeout or a malformed resolution — becomes `unavailable`, which
 * the selector turns into `context_unavailable` rather than an empty context
 * that would read as "this lesson says nothing".
 */
async function resolveGrounding(
  source: TutorGroundingSource,
  request: TutorRequest,
  timeoutMs: number
): Promise<TutorGroundingResolution> {
  if (request.groundingRefs.length === 0) {
    return { availability: "available", segments: [] };
  }

  try {
    const resolution = await runWithTutorTimeout(
      () => source.resolve(request.groundingRefs),
      timeoutMs
    );

    if (!resolution || typeof resolution !== "object") {
      return { availability: "unavailable" };
    }

    if (resolution.availability === "available" && !Array.isArray(resolution.segments)) {
      return { availability: "unavailable" };
    }

    return resolution;
  } catch {
    return { availability: "unavailable" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
