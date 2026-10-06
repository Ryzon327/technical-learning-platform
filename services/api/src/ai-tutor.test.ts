import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_TUTOR_LOG_FORBIDDEN_FIELDS,
  AI_TUTOR_REQUEST_CONTRACT_VERSION,
  TUTOR_LAB_ATTESTATION_SOURCE,
  TUTOR_PROVIDER_MAX_ATTEMPTS,
  containsForbiddenLogField,
  containsForbiddenResponseField,
  type TutorGroundingRef,
  type TutorGroundingResolution,
  type TutorGroundingSegment,
  type TutorGroundingSource,
  type TutorProvider,
  type TutorProviderPrompt,
  type TutorProviderResult,
  type TutorRequestInput
} from "@tlp/shared-types";

import {
  resolveTutorNoteOwnership,
  runTutorTurn,
  runWithTutorTimeout,
  TutorTimeoutError
} from "./ai-tutor";
import { createLocalTutorProvider } from "./ai-tutor-local-provider";
import { createUserScopedSupabaseClient } from "./supabase";

/**
 * The Tutor service.
 *
 * SCOPE OF THIS EVIDENCE, stated honestly:
 *
 *   Layer 1 — ORCHESTRATION. The ordering, the refusals, the bounded retry and
 *   the timeout are exercised against real fakes, not asserted from source.
 *   Layer 2 — CALLER-SCOPED/MOCK AUTHORIZATION. The Supabase factory is mocked
 *   using the CERT-005 precedent, and the mock models WHAT ROW LEVEL SECURITY
 *   RETURNS TO EACH CALLER: a caller's token selects which note rows exist,
 *   exactly as `auth.uid() = user_id` does in PostgreSQL.
 *   Layer 3 — STRUCTURAL. No route, no provider SDK, no service-role client,
 *   no caller-supplied identity.
 *
 * **NOT proven here: live PostgreSQL row level security.** The repository has
 * no live database harness. Nothing below should be read as a live-RLS claim.
 */
vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

const service = readFileSync(new URL("./ai-tutor.ts", import.meta.url), "utf8");
const serviceCode = service
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*\/\//.test(line))
  .join("\n");

const server = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

const FAKE_PROVIDER_KEY = ["sk", "t".repeat(32)].join("-");

const STUDENT_A = "student-a-access-token";
const STUDENT_B = "student-b-access-token";
const NOTE_A = "note-belonging-to-a";
const NOTE_B = "note-belonging-to-b";

/** Which note rows each caller's own client can see. Nothing else exists. */
const NOTES_VISIBLE_TO: Record<string, string[]> = {
  [STUDENT_A]: [NOTE_A],
  [STUDENT_B]: [NOTE_B]
};

const segments: TutorGroundingSegment[] = [
  {
    kind: "lesson_text",
    segmentStableId: "step-4",
    title: "Trunk ports",
    text: "A trunk port carries tagged frames for several VLANs.",
    sourceReference: "/missions/mission-2/steps/step-4"
  }
];

function groundingSource(
  resolution: TutorGroundingResolution = {
    availability: "available",
    segments
  }
): TutorGroundingSource & { calls: TutorGroundingRef[][] } {
  const calls: TutorGroundingRef[][] = [];

  return {
    sourceId: "test-curriculum",
    calls,
    async resolve(refs) {
      calls.push([...refs]);
      return resolution;
    }
  };
}

function input(overrides: Partial<TutorRequestInput> = {}): TutorRequestInput {
  return {
    contractVersion: AI_TUTOR_REQUEST_CONTRACT_VERSION,
    taskType: "explain_concept",
    question: "Why does the trunk link stay down?",
    lesson: {
      courseStableId: "networking-foundations",
      missionStableId: "mission-2",
      missionVersion: 3
    },
    position: { stepStableId: "step-4" },
    groundingRefs: [{ kind: "lesson_text", segmentStableId: "step-4" }],
    correlationId: "corr-1",
    ...overrides
  };
}

function turn(overrides: Partial<Parameters<typeof runTutorTurn>[0]> = {}) {
  return runTutorTurn({
    input: input(),
    requestId: "req-1",
    issuedAt: "2026-10-05T10:00:00.000Z",
    noteOwnership: [],
    groundingSource: groundingSource(),
    provider: createLocalTutorProvider(),
    timeoutMs: 200,
    ...overrides
  });
}

/** A provider that records its calls, so "was it reached?" is observable. */
function countingProvider(
  results: TutorProviderResult[]
): TutorProvider & { prompts: TutorProviderPrompt[] } {
  const prompts: TutorProviderPrompt[] = [];
  const local = createLocalTutorProvider();
  let index = 0;

  return {
    providerId: "counting",
    prompts,
    getCapabilities: () => ({
      ...local.getCapabilities(),
      providerId: "counting"
    }),
    getHealth: () => local.getHealth(),
    async generate(prompt) {
      prompts.push(prompt);
      const result = results[Math.min(index, results.length - 1)];
      index += 1;
      return result!;
    }
  };
}

let logs: string[] = [];

beforeEach(() => {
  // Vitest 4's restoreAllMocks no longer clears vi.fn() call history, so
  // "never called" assertions need an explicit per-test clear.
  vi.clearAllMocks();
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    logs.push(String(line));
  });
  vi.spyOn(console, "warn").mockImplementation((line: unknown) => {
    logs.push(String(line));
  });
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    logs.push(String(line));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a valid turn is answered, grounded and bounded", () => {
  it("answers from the lesson and cites what it used", async () => {
    const outcome = await turn();

    expect(outcome.status).toBe("answered");
    if (outcome.status !== "answered") return;

    expect(outcome.response.outcome).toBe("answered");
    expect(outcome.response.groundingMode).toBe("lesson_grounded");
    expect(outcome.response.citations.map((c) => c.segmentStableId)).toEqual([
      "step-4"
    ]);
    expect(outcome.response.uncertainty.level).toBe("grounded");
    expect(outcome.attempts).toBe(1);
  });

  it("asks the grounding source for exactly the requested references", async () => {
    const source = groundingSource();
    await turn({ groundingSource: source });

    expect(source.calls).toEqual([
      [{ kind: "lesson_text", segmentStableId: "step-4" }]
    ]);
  });

  it("never consults a grounding source when nothing was requested", async () => {
    const source = groundingSource();
    const outcome = await turn({
      input: input({ groundingRefs: [] }),
      groundingSource: source
    });

    expect(source.calls).toEqual([]);
    expect(outcome.status).toBe("answered");
    if (outcome.status === "answered") {
      expect(outcome.response.groundingMode).toBe("general");
      expect(outcome.response.uncertainty.level).toBe("general");
    }
  });

  it("writes no learner state: every outcome is read-only", async () => {
    await turn();

    // The only authoritative read in this service is the note-ownership
    // SELECT, and it is only reached when an excerpt was included.
    expect(vi.mocked(createUserScopedSupabaseClient)).not.toHaveBeenCalled();
  });
});

describe("nothing reaches a provider before every check has passed", () => {
  it("refuses a malformed request without calling a provider", async () => {
    const provider = countingProvider([
      { status: "completed", providerId: "counting", output: { answer: "x" } }
    ]);

    const outcome = await turn({
      input: input({ question: "   " }),
      provider
    });

    expect(outcome.status).toBe("refused");
    if (outcome.status === "refused") {
      expect(outcome.refusal.rejection).toBe("question_missing");
    }
    expect(provider.prompts).toHaveLength(0);
  });

  it("refuses a credential-bearing question without calling a provider", async () => {
    const provider = countingProvider([
      { status: "completed", providerId: "counting", output: { answer: "x" } }
    ]);

    const outcome = await turn({
      input: input({ question: `Why does ${FAKE_PROVIDER_KEY} fail?` }),
      provider
    });

    expect(outcome.status).toBe("refused");
    if (outcome.status === "refused") {
      expect(outcome.refusal.rejection).toBe("secret_detected");
    }
    expect(provider.prompts).toHaveLength(0);
  });

  it("refuses an unapproved context type without calling a provider", async () => {
    const provider = countingProvider([
      { status: "completed", providerId: "counting", output: { answer: "x" } }
    ]);

    const outcome = await turn({
      input: input({
        groundingRefs: [{ kind: "answer_key", segmentStableId: "a1" }]
      }),
      provider
    });

    expect(outcome.status).toBe("refused");
    expect(provider.prompts).toHaveLength(0);
  });

  it("refuses a client-asserted authority field without calling a provider", async () => {
    const provider = countingProvider([
      { status: "completed", providerId: "counting", output: { answer: "x" } }
    ]);

    const outcome = await turn({
      input: { ...input(), labPassed: true } as TutorRequestInput,
      provider
    });

    expect(outcome.status).toBe("refused");
    if (outcome.status === "refused") {
      expect(outcome.refusal.rejection).toBe("forbidden_input_field");
    }
    expect(provider.prompts).toHaveLength(0);
  });

  it("never consults the grounding source for a refused request", async () => {
    const source = groundingSource();
    await turn({ input: input({ question: "" }), groundingSource: source });

    expect(source.calls).toEqual([]);
  });

  /**
   * The prompt a provider receives carries no identity, no correlation id and
   * no note id. This asserts it on the ACTUAL prompt the service built, not on
   * a prompt a test constructed.
   */
  it("sends a prompt carrying no identity or correlation", async () => {
    const provider = countingProvider([
      {
        status: "completed",
        providerId: "counting",
        output: { answer: "A trunk port carries tagged frames." }
      }
    ]);

    await turn({ provider });

    const serialized = JSON.stringify(provider.prompts[0]);
    expect(serialized).not.toContain("corr-1");
    expect(serialized).not.toContain("req-1");
    expect(serialized).not.toContain("mission-2");
  });
});

describe("unavailable lesson context is never answered as a general question", () => {
  /**
   * The "silent gap-filling" rule. A question that asked for lesson content and
   * got none must not be answered from nothing — an ungrounded answer would be
   * indistinguishable from a grounded one.
   */
  it("returns context_unavailable without calling a provider", async () => {
    const provider = countingProvider([
      {
        status: "completed",
        providerId: "counting",
        output: { answer: "Here is what the lesson says." }
      }
    ]);

    const outcome = await turn({
      provider,
      groundingSource: groundingSource({ availability: "unavailable" })
    });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status !== "unavailable") return;

    expect(outcome.response.groundingMode).toBe("context_unavailable");
    expect(provider.prompts).toHaveLength(0);
  });

  it("treats a grounding source that throws as unavailable", async () => {
    const outcome = await turn({
      groundingSource: {
        sourceId: "broken",
        async resolve() {
          throw new Error("curriculum read failed");
        }
      }
    });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(outcome.response.groundingMode).toBe("context_unavailable");
    }
  });

  it("treats a grounding source that hangs as unavailable", async () => {
    const outcome = await turn({
      timeoutMs: 20,
      groundingSource: {
        sourceId: "hanging",
        resolve: () => new Promise(() => undefined)
      }
    });

    expect(outcome.status).toBe("unavailable");
  });

  it("treats a malformed resolution as unavailable", async () => {
    const outcome = await turn({
      groundingSource: {
        sourceId: "malformed",
        resolve: async () =>
          ({ availability: "available" }) as TutorGroundingResolution
      }
    });

    expect(outcome.status).toBe("unavailable");
  });

  it("never leaks a source's internal reason to the learner", async () => {
    const outcome = await turn({
      groundingSource: groundingSource({
        availability: "unavailable",
        internalReason: "curriculum table permission denied"
      })
    });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(JSON.stringify(outcome.response)).not.toContain(
        "permission denied"
      );
    }
  });
});

describe("provider failure, timeout and retry stay bounded", () => {
  it("returns an honest unavailable response on a provider outage", async () => {
    const outcome = await turn({
      provider: createLocalTutorProvider({ failureMode: "unavailable" })
    });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status !== "unavailable") return;

    expect(outcome.error).toBe("provider_unavailable");
    expect(outcome.response.outcome).toBe("unavailable");
    expect(outcome.response.answer.toLowerCase()).toContain("unavailable");
    expect(outcome.response.suggestedAction).toBe("none");
  });

  it("times out a slow provider rather than waiting on it", async () => {
    const outcome = await turn({
      provider: createLocalTutorProvider({
        failureMode: "slow",
        responseDelayMs: 5_000
      }),
      timeoutMs: 20
    });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(outcome.error).toBe("timeout");
      expect(outcome.response.answer.toLowerCase()).toContain("too long");
    }
  });

  it("retries a transient failure exactly once, then stops", async () => {
    const provider = countingProvider([
      { status: "failed", providerId: "counting", error: "rate_limited" }
    ]);

    const outcome = await turn({ provider });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(outcome.attempts).toBe(TUTOR_PROVIDER_MAX_ATTEMPTS);
    }
    expect(provider.prompts).toHaveLength(TUTOR_PROVIDER_MAX_ATTEMPTS);
  });

  it("succeeds on the retry when the first failure was transient", async () => {
    const provider = countingProvider([
      { status: "failed", providerId: "counting", error: "provider_unavailable" },
      {
        status: "completed",
        providerId: "counting",
        output: {
          answer: "A trunk port carries tagged frames.",
          citedSegmentStableIds: ["step-4"]
        }
      }
    ]);

    const outcome = await turn({ provider });

    expect(outcome.status).toBe("answered");
    if (outcome.status === "answered") {
      expect(outcome.attempts).toBe(2);
    }
  });

  /**
   * A malformed response is never retried: a second attempt has no more reason
   * to parse than the first, and retrying it is how a retry storm starts.
   */
  it("never retries a malformed response", async () => {
    const provider = countingProvider([
      { status: "completed", providerId: "counting", output: {} }
    ]);

    const outcome = await turn({ provider });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(outcome.error).toBe("invalid_provider_response");
      expect(outcome.attempts).toBe(1);
    }
    expect(provider.prompts).toHaveLength(1);
  });

  it("never retries a provider that cannot serve the request at all", async () => {
    const local = createLocalTutorProvider();
    const provider: TutorProvider = {
      providerId: "narrow",
      getCapabilities: () => ({
        ...local.getCapabilities(),
        supportedTaskTypes: ["explain_lab_failure"]
      }),
      getHealth: () => local.getHealth(),
      generate: async () => {
        throw new Error("must not be called");
      }
    };

    const outcome = await turn({ provider });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(outcome.error).toBe("unsupported_capability");
      expect(outcome.attempts).toBe(0);
    }
  });

  it("reports an oversized context as a normalized refusal", async () => {
    const local = createLocalTutorProvider();
    const provider: TutorProvider = {
      providerId: "tiny",
      getCapabilities: () => ({
        ...local.getCapabilities(),
        maxContextCharacters: 5
      }),
      getHealth: () => local.getHealth(),
      generate: async () => {
        throw new Error("must not be called");
      }
    };

    const outcome = await turn({ provider });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(outcome.error).toBe("context_too_large");
    }
  });

  it("treats a provider that throws as unavailable rather than crashing", async () => {
    const local = createLocalTutorProvider();
    const provider: TutorProvider = {
      providerId: "throwing",
      getCapabilities: () => local.getCapabilities(),
      getHealth: () => local.getHealth(),
      generate: async () => {
        throw new Error("adapter blew up");
      }
    };

    const outcome = await turn({ provider });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(JSON.stringify(outcome.response)).not.toContain("adapter blew up");
    }
  });
});

describe("the deterministic boundary holds end to end", () => {
  it("refuses a provider answer that claims a lab verdict", async () => {
    const outcome = await turn({
      provider: createLocalTutorProvider({
        failureMode: "malformed_authority_claim"
      })
    });

    expect(outcome.status).toBe("unavailable");
    if (outcome.status !== "unavailable") return;

    expect(outcome.error).toBe("invalid_provider_response");
    expect(JSON.stringify(outcome.response)).not.toContain("looks correct");
    expect(containsForbiddenResponseField(outcome.response)).toBe(false);
  });

  it("drops a fabricated citation and reports that it did", async () => {
    const outcome = await turn({
      provider: createLocalTutorProvider({
        failureMode: "fabricated_citation"
      })
    });

    expect(outcome.status).toBe("answered");
    if (outcome.status !== "answered") return;

    expect(outcome.response.citations).toEqual([]);
    expect(outcome.response.droppedCitationCount).toBe(1);
    expect(JSON.stringify(outcome.response)).not.toContain(
      "segment-that-was-never-supplied"
    );
  });

  it("declares every boundary flag false on every outcome", async () => {
    const outcomes = [
      await turn(),
      await turn({
        provider: createLocalTutorProvider({ failureMode: "unavailable" })
      }),
      await turn({ deferralSubject: "lab_correctness" })
    ];

    for (const outcome of outcomes) {
      if (outcome.status === "refused") continue;
      expect(outcome.response.boundaryFlags).toEqual({
        determinesLabCorrectness: false,
        grantsMastery: false,
        altersDeterministicScoring: false,
        mutatesLearnerNotes: false,
        overridesDeterministicValidation: false,
        createsLearnerEvidence: false
      });
    }
  });

  it("defers a deterministic question without calling a provider", async () => {
    const provider = countingProvider([
      { status: "completed", providerId: "counting", output: { answer: "x" } }
    ]);

    const outcome = await turn({
      provider,
      deferralSubject: "lab_correctness"
    });

    expect(outcome.status).toBe("answered");
    if (outcome.status !== "answered") return;

    expect(outcome.response.outcome).toBe("deferred_to_deterministic");
    expect(outcome.response.suggestedAction).toBe("run_deterministic_validation");
    expect(provider.prompts).toHaveLength(0);
  });

  it("reports an unattested lab state as unavailable, never as a verdict", async () => {
    const outcome = await turn({
      labStateClaim: {
        source: "client",
        sessionId: "session-1",
        validationRunId: "run-1",
        observedAt: "2026-10-05T09:59:00.000Z"
      }
    });

    expect(outcome.status).toBe("answered");
    if (outcome.status !== "answered") return;

    expect(outcome.response.labStateStatement).toBeDefined();
    expect(outcome.response.labStateStatement?.toLowerCase()).not.toContain(
      "passed"
    );
  });

  it("carries an attested lab state as availability only", async () => {
    const provider = countingProvider([
      {
        status: "completed",
        providerId: "counting",
        output: { answer: "A trunk port carries tagged frames." }
      }
    ]);

    await turn({
      provider,
      labStateClaim: {
        source: TUTOR_LAB_ATTESTATION_SOURCE,
        sessionId: "session-1",
        validationRunId: "run-1",
        observedAt: "2026-10-05T09:59:00.000Z"
      }
    });

    expect(provider.prompts[0]?.labAvailability).toBe("available");
    expect(JSON.stringify(provider.prompts[0])).not.toContain("session-1");
    expect(JSON.stringify(provider.prompts[0])).not.toContain("run-1");
  });
});

describe("a learner's own note may be included; another learner's may not", () => {
  function noteClient(accessToken: string) {
    return {
      from: () => ({
        select: () => ({
          in: (_column: string, ids: string[]) => {
            const visible = NOTES_VISIBLE_TO[accessToken] ?? [];
            return Promise.resolve({
              data: ids
                .filter((id) => visible.includes(id))
                .map((id) => ({ id })),
              error: null
            });
          }
        })
      })
    };
  }

  beforeEach(() => {
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(
      (accessToken: string) => noteClient(accessToken) as never
    );
  });

  it("reports the caller's own note as owned", async () => {
    await expect(
      resolveTutorNoteOwnership(STUDENT_A, [NOTE_A])
    ).resolves.toEqual([{ noteId: NOTE_A, ownership: "owned" }]);
  });

  /**
   * THE CROSS-LEARNER PROOF at the service layer. Student A's own client never
   * yields student B's note, so the note is not owned — and the request
   * contract then refuses the excerpt.
   */
  it("never reports another learner's note as owned", async () => {
    await expect(
      resolveTutorNoteOwnership(STUDENT_A, [NOTE_B])
    ).resolves.toEqual([{ noteId: NOTE_B, ownership: "not_owned" }]);
  });

  it("refuses the whole turn when another learner's note was referenced", async () => {
    const ownership = await resolveTutorNoteOwnership(STUDENT_A, [NOTE_B]);

    const outcome = await turn({
      input: input({
        noteExcerpts: [
          {
            noteId: NOTE_B,
            excerpt: "Another learner's note text.",
            includedByLearnerAction: true
          }
        ]
      }),
      noteOwnership: ownership
    });

    expect(outcome.status).toBe("refused");
    if (outcome.status === "refused") {
      expect(outcome.refusal.rejection).toBe("cross_learner_reference");
    }
  });

  it("includes the caller's own excerpt in the provider prompt as text alone", async () => {
    const provider = countingProvider([
      {
        status: "completed",
        providerId: "counting",
        output: { answer: "A trunk port carries tagged frames." }
      }
    ]);

    const outcome = await turn({
      provider,
      input: input({
        noteExcerpts: [
          {
            noteId: NOTE_A,
            excerpt: "My own note about trunking.",
            includedByLearnerAction: true
          }
        ]
      }),
      noteOwnership: await resolveTutorNoteOwnership(STUDENT_A, [NOTE_A])
    });

    expect(outcome.status).toBe("answered");
    expect(provider.prompts[0]?.learnerSelectedExcerpts).toEqual([
      "My own note about trunking."
    ]);
    expect(JSON.stringify(provider.prompts[0])).not.toContain(NOTE_A);
  });

  it("reports an unavailable ownership read as unavailable, not as denied", async () => {
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(
      () =>
        ({
          from: () => ({
            select: () => ({
              in: () =>
                Promise.resolve({ data: null, error: { message: "boom" } })
            })
          })
        }) as never
    );

    await expect(
      resolveTutorNoteOwnership(STUDENT_A, [NOTE_A])
    ).resolves.toEqual([{ noteId: NOTE_A, ownership: "unavailable" }]);
  });

  it("reports a thrown ownership read as unavailable", async () => {
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(() => {
      throw new Error("configuration missing");
    });

    await expect(
      resolveTutorNoteOwnership(STUDENT_A, [NOTE_A])
    ).resolves.toEqual([{ noteId: NOTE_A, ownership: "unavailable" }]);
  });

  it("refuses to resolve ownership without a session", async () => {
    for (const token of ["", "   "]) {
      await expect(
        resolveTutorNoteOwnership(token, [NOTE_A])
      ).resolves.toEqual([{ noteId: NOTE_A, ownership: "unavailable" }]);
    }
  });

  it("reads nothing when no note was referenced", async () => {
    await expect(resolveTutorNoteOwnership(STUDENT_A, [])).resolves.toEqual([]);
    expect(vi.mocked(createUserScopedSupabaseClient)).not.toHaveBeenCalled();
  });

  it("de-duplicates and trims the requested ids", async () => {
    await expect(
      resolveTutorNoteOwnership(STUDENT_A, [NOTE_A, ` ${NOTE_A} `, ""])
    ).resolves.toEqual([{ noteId: NOTE_A, ownership: "owned" }]);
  });
});

describe("routine logs carry operations, never learner prose", () => {
  it("logs an accepted request without the question text", async () => {
    await turn();

    const combined = logs.join("\n");

    expect(combined).toContain("ai_tutor.request_accepted");
    expect(combined).not.toContain("Why does the trunk link stay down?");

    for (const record of logs.map((line) => JSON.parse(line))) {
      expect(containsForbiddenLogField(record.metadata)).toBe(false);
    }
  });

  it("logs a refusal reason and a credential KIND, never the credential", async () => {
    await turn({
      input: input({ question: `Why does ${FAKE_PROVIDER_KEY} fail?` })
    });

    const combined = logs.join("\n");

    expect(combined).toContain("ai_tutor.request_refused");
    expect(combined).toContain("secret_detected");
    expect(combined).toContain("provider api key");
    expect(combined).not.toContain(FAKE_PROVIDER_KEY);
    expect(combined).not.toContain("t".repeat(32));
  });

  /**
   * `logger.ts` redacts any metadata key containing "secret". The credential
   * KIND is a useful operational signal and is not a secret, so it is carried
   * under a name the sanitizer does not swallow. This pins that choice: a
   * rename back to `secretLabels` would silently destroy the signal, and the
   * sanitizer itself must stay exactly as strict as it is.
   */
  it("names the credential-kind field so the log sanitizer does not swallow it", async () => {
    await turn({
      input: input({ question: `Why does ${FAKE_PROVIDER_KEY} fail?` })
    });

    const record = JSON.parse(logs[0]!);

    expect(record.metadata.credentialKinds).toEqual(["provider api key"]);
    expect(record.metadata.secretLabels).toBeUndefined();
  });

  it("logs an answer without the answer text", async () => {
    const outcome = await turn();

    expect(outcome.status).toBe("answered");
    if (outcome.status !== "answered") return;

    const combined = logs.join("\n");

    expect(combined).toContain("ai_tutor.answered");
    expect(combined).toContain("answerLength");
    expect(combined).not.toContain(outcome.response.answer);
  });

  it("logs a private note excerpt as a count, never as text", async () => {
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(
      () =>
        ({
          from: () => ({
            select: () => ({
              in: (_column: string, ids: string[]) =>
                Promise.resolve({
                  data: ids.map((id) => ({ id })),
                  error: null
                })
            })
          })
        }) as never
    );

    await turn({
      input: input({
        noteExcerpts: [
          {
            noteId: NOTE_A,
            excerpt: "A very private note about my own mistake.",
            includedByLearnerAction: true
          }
        ]
      }),
      noteOwnership: await resolveTutorNoteOwnership(STUDENT_A, [NOTE_A])
    });

    const combined = logs.join("\n");

    expect(combined).not.toContain("A very private note");
    expect(combined).toContain("noteExcerptCount");
    expect(combined).toContain("learner_private_content");
  });

  it("logs an unavailable outcome with a reason and no provider internals", async () => {
    await turn({
      provider: createLocalTutorProvider({ failureMode: "unavailable" })
    });

    const combined = logs.join("\n");

    expect(combined).toContain("ai_tutor.unavailable");
    expect(combined).toContain("provider_unavailable");
  });

  it("holds the log prohibition as data and honours it on every record", async () => {
    await turn();
    await turn({ input: input({ question: "" }) });
    await turn({
      provider: createLocalTutorProvider({ failureMode: "unavailable" })
    });

    expect(AI_TUTOR_LOG_FORBIDDEN_FIELDS).toContain("question");

    for (const record of logs.map((line) => JSON.parse(line))) {
      expect(containsForbiddenLogField(record.metadata)).toBe(false);
    }
  });
});

describe("bounded waiting", () => {
  it("returns the result when the work finishes first", async () => {
    await expect(
      runWithTutorTimeout(async () => "done", 1_000)
    ).resolves.toBe("done");
  });

  it("rejects with a timeout when the work does not finish", async () => {
    await expect(
      runWithTutorTimeout(() => new Promise(() => undefined), 10)
    ).rejects.toBeInstanceOf(TutorTimeoutError);
  });

  it("aborts the work it abandoned", async () => {
    let aborted = false;

    await expect(
      runWithTutorTimeout(
        (signal) =>
          new Promise(() => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
          }),
        10
      )
    ).rejects.toBeInstanceOf(TutorTimeoutError);

    expect(aborted).toBe(true);
  });

  it("propagates the work's own failure unchanged", async () => {
    await expect(
      runWithTutorTimeout(async () => {
        throw new Error("real failure");
      }, 1_000)
    ).rejects.toThrow("real failure");
  });
});

describe("structural boundaries of the Tutor service", () => {
  /**
   * No HTTP route. This package's acceptance criteria are all "the platform
   * can ...", and exposing an AI surface before the Gateway's routing, cost and
   * provider-health policy exists would be scope this issue did not authorize.
   */
  it("adds no route to the API server", () => {
    for (const path of ["/tutor", "/ai", "/ai-tutor", "/learning/tutor"]) {
      expect(server).not.toContain(`pathname === "${path}"`);
    }
    expect(server).not.toContain("runTutorTurn");
    expect(server).not.toContain("ai-tutor");
  });

  it("uses the caller's own client and never a service-role client", () => {
    expect(serviceCode).toContain("createUserScopedSupabaseClient(accessToken)");
    expect(serviceCode).not.toContain("createServerSupabaseClient");
  });

  it("creates exactly one client, so no path can widen access", () => {
    const clients = serviceCode.match(/createUserScopedSupabaseClient\(/g) ?? [];
    expect(clients).toHaveLength(1);
  });

  it("applies no owner predicate, so ownership has one mechanism", () => {
    for (const forbidden of [
      "user_id",
      "userId",
      "owner_id",
      "ownerId",
      "studentId",
      "learnerId"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("imports no AI provider SDK and makes no provider network call", () => {
    for (const forbidden of [
      "openai",
      "anthropic",
      "ollama",
      "cohere",
      "mistralai",
      "langchain",
      "fetch(",
      "http://",
      "https://",
      "axios"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("reads no provider credential from the environment", () => {
    expect(serviceCode).not.toContain("process.env");
    expect(serviceCode).not.toContain("API_KEY");
  });

  it("performs no write of any kind", () => {
    for (const forbidden of [
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      ".rpc("
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("yields inspectable text, so these absence scans are not vacuous", () => {
    expect(serviceCode.trim().length).toBeGreaterThan(1_000);
    expect(serviceCode).toContain("export async function runTutorTurn");
  });
});
