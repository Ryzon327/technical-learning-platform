import {
  AI_TUTOR_PROVIDER_CONTRACT_VERSION,
  AI_TUTOR_TASK_TYPES,
  type TutorProvider,
  type TutorProviderCapabilities,
  type TutorProviderHealth,
  type TutorProviderOutput,
  type TutorProviderPrompt,
  type TutorProviderResult
} from "@tlp/shared-types";

/**
 * AI Tutor foundation — the local/test provider.
 *
 * `AIGW-009`'s shape without `AIGW-009`'s network: a deterministic, in-process
 * implementation of `TutorProvider` that proves the interface is implementable
 * and gives every failure path a real producer to be tested against.
 *
 * ## What this is NOT
 *
 * Not a model. Not a connection to one. There is no SDK import, no base URL, no
 * `fetch`, no environment read and no credential anywhere in this file. Running
 * this package activates no paid provider and requires no production API key,
 * and `scripts/verify-ai-tutor-foundation.sh` asserts that structurally rather
 * than taking it on trust.
 *
 * It is the `mockLabProvider` precedent applied to AI: a deterministic fixture
 * with explicit failure modes, so provider outage, timeout, rate limiting and
 * malformed output are all reachable in a test without a network.
 *
 * ## Why composition, not generation
 *
 * The answer is COMPOSED from the grounding segments the platform already
 * selected, in the order it selected them. That is deliberate, and it is the
 * strongest available demonstration of the grounding boundary: a provider that
 * can only restate approved content cannot invent curriculum, cannot cite a
 * segment it was not given, and cannot answer a lesson question when grounding
 * was withheld.
 *
 * It does not pretend to be good pedagogy. A real provider produces better
 * prose; this one proves the contract.
 *
 * ## The boundary is upstream, and this provider does not test it alone
 *
 * `malformed_authority_claim` exists so the response normalizer's refusal is
 * exercised against a provider that genuinely tries to return a verdict. The
 * boundary is enforced in `normalizeTutorProviderOutput`, never here — a
 * well-behaved provider is not a security control.
 */

export type LocalTutorFailureMode =
  | "none"
  | "unavailable"
  | "rate_limited"
  | "slow"
  | "malformed_empty"
  | "malformed_authority_claim"
  | "fabricated_citation";

export const LOCAL_TUTOR_PROVIDER_ID = "local-deterministic";

export interface LocalTutorProviderOptions {
  failureMode?: LocalTutorFailureMode;
  /** Only used by `slow`, so a timeout can be exercised without a network. */
  responseDelayMs?: number;
}

/**
 * The single place this provider waits.
 *
 * It resolves on the caller's abort signal as well as the timer, so a timed-out
 * request does not leave a pending timer behind. The service applies its own
 * timeout regardless; this exists so the provider honours cancellation too,
 * which is what `AIGW-002` section 3 requires of every adapter.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class LocalTutorProvider implements TutorProvider {
  readonly providerId = LOCAL_TUTOR_PROVIDER_ID;

  private failureMode: LocalTutorFailureMode;
  private readonly responseDelayMs: number;

  constructor(options: LocalTutorProviderOptions = {}) {
    this.failureMode = options.failureMode ?? "none";
    this.responseDelayMs = options.responseDelayMs ?? 0;
  }

  setFailureMode(mode: LocalTutorFailureMode): void {
    this.failureMode = mode;
  }

  /**
   * Honest capability metadata.
   *
   * `processesLocally` is true because nothing leaves the process.
   * `supportsStructuredOutput` is true because this provider returns the
   * structured shape directly rather than prose a parser has to guess at.
   *
   * The limits are small on purpose: a local fixture that advertised a huge
   * context would let `context_too_large` go permanently unexercised.
   */
  getCapabilities(): TutorProviderCapabilities {
    return {
      providerId: this.providerId,
      contractVersion: AI_TUTOR_PROVIDER_CONTRACT_VERSION,
      processesLocally: true,
      supportsStructuredOutput: true,
      maxContextCharacters: 8_000,
      maxOutputCharacters: 1_200,
      supportedTaskTypes: [...AI_TUTOR_TASK_TYPES]
    };
  }

  async getHealth(): Promise<TutorProviderHealth> {
    return {
      providerId: this.providerId,
      state:
        this.failureMode === "unavailable"
          ? "unavailable"
          : this.failureMode === "rate_limited"
            ? "degraded"
            : "healthy",
      // The caller stamps nothing: a health record without a time is not a
      // health record. This is the only clock in the file.
      checkedAt: new Date().toISOString()
    };
  }

  async generate(
    prompt: TutorProviderPrompt,
    options: { timeoutMs: number; signal?: AbortSignal }
  ): Promise<TutorProviderResult> {
    if (this.failureMode === "unavailable") {
      return {
        status: "failed",
        providerId: this.providerId,
        error: "provider_unavailable"
      };
    }

    if (this.failureMode === "rate_limited") {
      return {
        status: "failed",
        providerId: this.providerId,
        error: "rate_limited"
      };
    }

    if (this.failureMode === "slow") {
      await delay(this.responseDelayMs, options.signal);
    }

    if (this.failureMode === "malformed_empty") {
      // No answer at all. The normalizer must refuse rather than invent one.
      return { status: "completed", providerId: this.providerId, output: {} };
    }

    if (this.failureMode === "malformed_authority_claim") {
      // A provider trying to be helpful in exactly the prohibited way. The
      // assertion is required because `TutorProviderOutput` has no field for a
      // verdict — which is the point being demonstrated.
      return {
        status: "completed",
        providerId: this.providerId,
        output: {
          answer: "Your lab looks correct to me.",
          explanation: "Everything in the configuration matches.",
          labPassed: true,
          masteryGranted: true
        } as TutorProviderOutput
      };
    }

    if (this.failureMode === "fabricated_citation") {
      return {
        status: "completed",
        providerId: this.providerId,
        output: {
          answer: "Here is what this lesson says.",
          citedSegmentStableIds: ["segment-that-was-never-supplied"]
        }
      };
    }

    return {
      status: "completed",
      providerId: this.providerId,
      output: this.compose(prompt),
      usage: {
        promptCharacters: promptCharacterCount(prompt),
        outputCharacters: 0
      }
    };
  }

  /**
   * Composes an answer from the supplied grounding and nothing else.
   *
   * Three honest shapes:
   *
   *   - GROUNDED. Restate the first segment, cite exactly the segments given.
   *   - GENERAL. Say plainly that no lesson content was used.
   *   - UNAVAILABLE CONTEXT. Refuse to characterise the lesson at all. This is
   *     the "never guess" rule at the one place a provider could break it.
   *
   * `deeper` adds the remaining segments to the explanation rather than
   * inventing more prose, because the only content this provider is entitled to
   * is the content it was handed.
   */
  private compose(prompt: TutorProviderPrompt): {
    answer: string;
    explanation?: string;
    stepGuidance?: string[];
    citedSegmentStableIds?: string[];
    uncertain?: boolean;
  } {
    if (prompt.groundingMode === "context_unavailable") {
      return {
        answer:
          "I could not read this lesson's content, so I will not describe what it says.",
        uncertain: true
      };
    }

    if (prompt.groundingMode === "general" || prompt.groundingSegments.length === 0) {
      return {
        answer:
          "I can only answer from this lesson's content, and none was available for this question.",
        uncertain: true
      };
    }

    const [first, ...rest] = prompt.groundingSegments;
    const depth = prompt.presentation.explanationDepth;

    const explanationSegments = depth === "deeper" ? rest : rest.slice(0, 1);

    const explanation =
      depth === "concise" || explanationSegments.length === 0
        ? undefined
        : explanationSegments
            .map((segment) => `${segment.title}: ${segment.text}`)
            .join(" ");

    const excerptNote =
      prompt.learnerSelectedExcerpts.length > 0
        ? ["Compare this with the note text you included."]
        : [];

    return {
      answer: `${first?.title ?? "This lesson"}: ${first?.text ?? ""}`.trim(),
      ...(explanation ? { explanation } : {}),
      stepGuidance: [
        "Reread the lesson section this came from.",
        ...excerptNote
      ],
      citedSegmentStableIds: prompt.groundingSegments.map(
        (segment) => segment.segmentStableId
      )
    };
  }
}

function promptCharacterCount(prompt: TutorProviderPrompt): number {
  return (
    prompt.question.length +
    prompt.groundingSegments.reduce(
      (total, segment) => total + segment.title.length + segment.text.length,
      0
    ) +
    prompt.learnerSelectedExcerpts.reduce(
      (total, excerpt) => total + excerpt.length,
      0
    )
  );
}

/** A fresh provider. Tests construct their own; nothing shares state. */
export function createLocalTutorProvider(
  options: LocalTutorProviderOptions = {}
): LocalTutorProvider {
  return new LocalTutorProvider(options);
}

/**
 * The default local provider.
 *
 * Registered nowhere and reached by no route. The Tutor foundation exposes no
 * HTTP surface, so this is an implementation the Learning Engine can be wired
 * to under a later authorized package, not a live capability.
 */
export const localTutorProvider = createLocalTutorProvider();
