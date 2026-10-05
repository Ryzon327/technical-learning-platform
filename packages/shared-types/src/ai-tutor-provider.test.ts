import { describe, expect, it } from "vitest";
import {
  AI_TUTOR_PROVIDER_CONTRACT_VERSION,
  AI_TUTOR_PROVIDER_PROMPT_FORBIDDEN_FIELDS,
  TUTOR_PROVIDER_ERRORS,
  TUTOR_PROVIDER_MAX_ATTEMPTS,
  TUTOR_PROVIDER_TIMEOUT_MS,
  buildTutorProviderPrompt,
  checkTutorProviderSuitability,
  containsForbiddenPromptField,
  describeTutorProviderError,
  isRetryableTutorProviderError,
  mayRetryTutorProvider,
  screenTutorPrompt,
  tutorRetryDelayMs,
  type TutorProviderCapabilities,
  type TutorProviderPrompt
} from "./ai-tutor-provider";
import { TUTOR_LAB_ATTESTATION_SOURCE } from "./ai-tutor-boundaries";
import type { TutorGroundingSegment } from "./ai-tutor-grounding";
import type { TutorRequest } from "./ai-tutor-request";

const FAKE_PROVIDER_KEY = ["sk", "m".repeat(32)].join("-");

const segments: TutorGroundingSegment[] = [
  {
    kind: "lesson_text",
    segmentStableId: "step-4",
    title: "Trunk ports",
    text: "A trunk port carries tagged frames for several VLANs.",
    sourceReference: "/missions/mission-2/steps/step-4"
  }
];

function request(overrides: Partial<TutorRequest> = {}): TutorRequest {
  return {
    contractVersion: "ai-tutor-request-v1",
    requestId: "req-1",
    correlationId: "corr-1",
    callingEngine: "learning",
    taskType: "explain_concept",
    privacyClass: "lesson_context",
    question: "Why does the trunk link stay down?",
    lesson: {
      courseStableId: "networking-foundations",
      moduleStableId: "module-1",
      missionStableId: "mission-2",
      missionVersion: 3
    },
    position: { stepStableId: "step-4" },
    groundingRefs: [{ kind: "lesson_text", segmentStableId: "step-4" }],
    noteExcerpts: [],
    labState: { availability: "unavailable", reason: "not_connected" },
    presentation: { explanationDepth: "concise", languageRegister: "default" },
    issuedAt: "2026-10-05T10:00:00.000Z",
    ...overrides
  };
}

const capabilities: TutorProviderCapabilities = {
  providerId: "local-deterministic",
  contractVersion: AI_TUTOR_PROVIDER_CONTRACT_VERSION,
  processesLocally: true,
  supportsStructuredOutput: true,
  maxContextCharacters: 8_000,
  maxOutputCharacters: 1_200,
  supportedTaskTypes: ["explain_concept", "explain_step"]
};

describe("the provider contract is versioned and its errors are closed", () => {
  it("stamps the contract version", () => {
    expect(AI_TUTOR_PROVIDER_CONTRACT_VERSION).toBe("ai-tutor-provider-v1");
  });

  it("names exactly the normalized failures", () => {
    expect(TUTOR_PROVIDER_ERRORS).toEqual([
      "provider_unavailable",
      "provider_disabled",
      "timeout",
      "rate_limited",
      "unsupported_capability",
      "context_too_large",
      "invalid_provider_response"
    ]);
  });

  it("gives every failure an accessible learner message", () => {
    for (const error of TUTOR_PROVIDER_ERRORS) {
      const message = describeTutorProviderError(error);

      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(/[<>{}]/);
    }
  });

  /**
   * Every unavailable message must say that nothing changed. An unavailable
   * Tutor is the normal case the platform is designed for, and a learner must
   * never be left wondering whether their work was affected.
   */
  it("says that lesson, work and notes are unaffected", () => {
    for (const error of [
      "provider_unavailable",
      "provider_disabled",
      "timeout",
      "rate_limited",
      "invalid_provider_response"
    ] as const) {
      expect(describeTutorProviderError(error).toLowerCase()).toMatch(
        /unaffected|unchanged/
      );
    }
  });
});

describe("retry is bounded and never a storm", () => {
  it("bounds total attempts at two", () => {
    expect(TUTOR_PROVIDER_MAX_ATTEMPTS).toBe(2);
    expect(TUTOR_PROVIDER_TIMEOUT_MS).toBe(8_000);
  });

  it("retries only a transient failure", () => {
    expect(isRetryableTutorProviderError("provider_unavailable")).toBe(true);
    expect(isRetryableTutorProviderError("timeout")).toBe(true);
    expect(isRetryableTutorProviderError("rate_limited")).toBe(true);
  });

  /**
   * `invalid_provider_response` is excluded on purpose. A second attempt has no
   * more reason to parse than the first, and retrying malformed output is how a
   * retry storm starts.
   */
  it("never retries a malformed response, a disabled provider or a bad fit", () => {
    expect(isRetryableTutorProviderError("invalid_provider_response")).toBe(
      false
    );
    expect(isRetryableTutorProviderError("provider_disabled")).toBe(false);
    expect(isRetryableTutorProviderError("unsupported_capability")).toBe(false);
    expect(isRetryableTutorProviderError("context_too_large")).toBe(false);
  });

  it("allows exactly one retry after a transient first failure", () => {
    expect(mayRetryTutorProvider(1, "timeout")).toBe(true);
    expect(mayRetryTutorProvider(2, "timeout")).toBe(false);
    expect(mayRetryTutorProvider(3, "timeout")).toBe(false);
  });

  it("requires both a transient failure and a remaining attempt", () => {
    expect(mayRetryTutorProvider(1, "invalid_provider_response")).toBe(false);
  });

  it("refuses a nonsensical attempt count rather than assuming one", () => {
    for (const attempt of [0, -1, 1.5, Number.NaN]) {
      expect(mayRetryTutorProvider(attempt, "timeout")).toBe(false);
    }
  });

  it("backs off deterministically, with no jitter", () => {
    expect(tutorRetryDelayMs(1)).toBe(250);
    expect(tutorRetryDelayMs(2)).toBe(500);
    expect(tutorRetryDelayMs(1)).toBe(tutorRetryDelayMs(1));
  });
});

describe("the provider receives a prompt, never a request", () => {
  const prompt = buildTutorProviderPrompt({
    request: request(),
    groundingMode: "lesson_grounded",
    groundingSegments: segments,
    maxOutputCharacters: 1_200
  });

  it("carries the task, question, grounding and presentation", () => {
    expect(prompt.contractVersion).toBe(AI_TUTOR_PROVIDER_CONTRACT_VERSION);
    expect(prompt.taskType).toBe("explain_concept");
    expect(prompt.question).toBe("Why does the trunk link stay down?");
    expect(prompt.groundingMode).toBe("lesson_grounded");
    expect(prompt.groundingSegments).toHaveLength(1);
    expect(prompt.presentation.explanationDepth).toBe("concise");
    expect(prompt.maxOutputCharacters).toBe(1_200);
  });

  it("carries no identity, correlation, note id or lesson version", () => {
    expect(containsForbiddenPromptField(prompt)).toBe(false);

    const keys = Object.keys(prompt);
    for (const forbidden of AI_TUTOR_PROVIDER_PROMPT_FORBIDDEN_FIELDS) {
      expect(keys).not.toContain(forbidden);
    }

    const serialized = JSON.stringify(prompt);
    expect(serialized).not.toContain("corr-1");
    expect(serialized).not.toContain("req-1");
  });

  /**
   * THE BUILDER ASSEMBLES FIELD BY FIELD. This asserts the consequence: a field
   * added to a request object cannot reach a provider without someone editing
   * the builder.
   */
  it("drops a field the request carries but the prompt does not name", () => {
    const widened = buildTutorProviderPrompt({
      request: {
        ...request(),
        smuggledField: "should not travel"
      } as unknown as TutorRequest,
      groundingMode: "lesson_grounded",
      groundingSegments: segments,
      maxOutputCharacters: 1_200
    });

    expect(JSON.stringify(widened)).not.toContain("should not travel");
  });

  /**
   * Lab state reaches a provider as AVAILABILITY and never as a verdict. A
   * model told "the check passed" can repeat that as its own judgement.
   */
  it("reduces lab state to availability, carrying no verdict or session", () => {
    const attested = buildTutorProviderPrompt({
      request: request({
        labState: {
          availability: "available",
          attestation: {
            source: TUTOR_LAB_ATTESTATION_SOURCE,
            sessionId: "session-1",
            validationRunId: "run-1",
            observedAt: "2026-10-05T09:59:00.000Z"
          }
        }
      }),
      groundingMode: "lesson_grounded",
      groundingSegments: segments,
      maxOutputCharacters: 1_200
    });

    expect(attested.labAvailability).toBe("available");

    const serialized = JSON.stringify(attested);
    expect(serialized).not.toContain("session-1");
    expect(serialized).not.toContain("run-1");
    expect(serialized).not.toContain("validationRunId");
  });

  it("carries a learner's own excerpt as text alone, with no note id", () => {
    const withExcerpt = buildTutorProviderPrompt({
      request: request({
        noteExcerpts: [
          {
            noteId: "note-1",
            excerpt: "My note about trunking.",
            includedByLearnerAction: true
          }
        ]
      }),
      groundingMode: "lesson_grounded",
      groundingSegments: segments,
      maxOutputCharacters: 1_200
    });

    expect(withExcerpt.learnerSelectedExcerpts).toEqual([
      "My note about trunking."
    ]);
    expect(JSON.stringify(withExcerpt)).not.toContain("note-1");
  });

  it("redacts every string that leaves, as defence in depth", () => {
    const leaky = buildTutorProviderPrompt({
      request: request({
        question: `Why does ${FAKE_PROVIDER_KEY} fail?`,
        noteExcerpts: [
          {
            noteId: "note-1",
            excerpt: `saved ${FAKE_PROVIDER_KEY}`,
            includedByLearnerAction: true
          }
        ]
      }),
      groundingMode: "lesson_grounded",
      groundingSegments: [
        { ...segments[0]!, text: `see ${FAKE_PROVIDER_KEY}` }
      ],
      maxOutputCharacters: 1_200
    });

    const serialized = JSON.stringify(leaky);
    expect(serialized).not.toContain(FAKE_PROVIDER_KEY);
    expect(serialized).toContain("[REDACTED]");
  });

  it("detects a forbidden field at any depth", () => {
    expect(containsForbiddenPromptField({ a: { userId: "x" } })).toBe(true);
    expect(containsForbiddenPromptField([{ apiKey: "x" }])).toBe(true);
    expect(containsForbiddenPromptField({ question: "ok" })).toBe(false);
  });

  it("screens the assembled prompt as the last gate before transmission", () => {
    expect(screenTutorPrompt(prompt).detected).toBe(false);

    const hostile: TutorProviderPrompt = {
      ...prompt,
      question: FAKE_PROVIDER_KEY
    };
    expect(screenTutorPrompt(hostile).detected).toBe(true);
  });

  it("screens grounding text and excerpts, not only the question", () => {
    expect(
      screenTutorPrompt({
        ...prompt,
        groundingSegments: [
          { ...prompt.groundingSegments[0]!, text: FAKE_PROVIDER_KEY }
        ]
      }).detected
    ).toBe(true);

    expect(
      screenTutorPrompt({
        ...prompt,
        learnerSelectedExcerpts: [FAKE_PROVIDER_KEY]
      }).detected
    ).toBe(true);
  });
});

describe("suitability is checked before a provider is called", () => {
  const prompt = buildTutorProviderPrompt({
    request: request(),
    groundingMode: "lesson_grounded",
    groundingSegments: segments,
    maxOutputCharacters: 1_200
  });

  it("accepts a prompt the provider advertises support for", () => {
    expect(checkTutorProviderSuitability(capabilities, prompt)).toBeNull();
  });

  it("refuses a task the provider does not advertise", () => {
    expect(
      checkTutorProviderSuitability(
        { ...capabilities, supportedTaskTypes: ["explain_step"] },
        prompt
      )
    ).toBe("unsupported_capability");
  });

  /**
   * An oversized context is a NORMALIZED refusal rather than a
   * provider-specific error, so a learner never sees a vendor message.
   */
  it("refuses a context larger than the provider advertises", () => {
    expect(
      checkTutorProviderSuitability(
        { ...capabilities, maxContextCharacters: 10 },
        prompt
      )
    ).toBe("context_too_large");
  });

  it("counts question, grounding and excerpts toward the context size", () => {
    const big = buildTutorProviderPrompt({
      request: request({
        noteExcerpts: [
          {
            noteId: "note-1",
            excerpt: "x".repeat(200),
            includedByLearnerAction: true
          }
        ]
      }),
      groundingMode: "lesson_grounded",
      groundingSegments: segments,
      maxOutputCharacters: 1_200
    });

    expect(
      checkTutorProviderSuitability(
        { ...capabilities, maxContextCharacters: 150 },
        big
      )
    ).toBe("context_too_large");
  });
});
