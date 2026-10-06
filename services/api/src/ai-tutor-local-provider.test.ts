import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AI_TUTOR_FORBIDDEN_PROVIDER_ENV,
  AI_TUTOR_PROVIDER_CONTRACT_VERSION,
  AI_TUTOR_TASK_TYPES,
  buildTutorProviderPrompt,
  containsForbiddenAuthorityField,
  normalizeTutorProviderOutput,
  type TutorGroundingSegment,
  type TutorProviderPrompt,
  type TutorRequest
} from "@tlp/shared-types";

import {
  LOCAL_TUTOR_PROVIDER_ID,
  createLocalTutorProvider,
  localTutorProvider
} from "./ai-tutor-local-provider";

/**
 * The local/test provider.
 *
 * Two kinds of evidence, and they are different claims:
 *
 *   BEHAVIOURAL — the provider implements the interface, honours grounding
 *   mode, refuses to characterise a lesson it was not given, and can produce
 *   every normalized failure.
 *
 *   STRUCTURAL — the SOURCE contains no provider SDK, no network call, no
 *   base URL and no credential read. That is asserted over the file text,
 *   because "we did not add a network call" is only checkable by looking.
 */

const source = readFileSync(
  new URL("./ai-tutor-local-provider.ts", import.meta.url),
  "utf8"
);

/** Comment-stripped source, so documentation is never mistaken for code. */
const sourceCode = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*\/\//.test(line))
  .join("\n");

const segments: TutorGroundingSegment[] = [
  {
    kind: "lesson_text",
    segmentStableId: "step-4",
    title: "Trunk ports",
    text: "A trunk port carries tagged frames for several VLANs.",
    sourceReference: "/missions/mission-2/steps/step-4"
  },
  {
    kind: "objective",
    segmentStableId: "obj-1",
    title: "Objective",
    text: "Explain why a trunk is required between two VLAN-aware devices.",
    sourceReference: "/missions/mission-2/objective"
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

function prompt(
  overrides: Partial<TutorProviderPrompt> = {},
  requestOverrides: Partial<TutorRequest> = {}
): TutorProviderPrompt {
  return {
    ...buildTutorProviderPrompt({
      request: request(requestOverrides),
      groundingMode: "lesson_grounded",
      groundingSegments: segments,
      maxOutputCharacters: 1_200
    }),
    ...overrides
  };
}

const options = { timeoutMs: 1_000 };

describe("the provider implements the contract", () => {
  it("advertises its identity and the contract version", () => {
    const capabilities = localTutorProvider.getCapabilities();

    expect(localTutorProvider.providerId).toBe(LOCAL_TUTOR_PROVIDER_ID);
    expect(capabilities.providerId).toBe(LOCAL_TUTOR_PROVIDER_ID);
    expect(capabilities.contractVersion).toBe(
      AI_TUTOR_PROVIDER_CONTRACT_VERSION
    );
  });

  it("advertises local processing and honest limits", () => {
    const capabilities = localTutorProvider.getCapabilities();

    expect(capabilities.processesLocally).toBe(true);
    expect(capabilities.supportsStructuredOutput).toBe(true);
    expect(capabilities.maxContextCharacters).toBeGreaterThan(0);
    expect(capabilities.maxOutputCharacters).toBeGreaterThan(0);
    expect(capabilities.supportedTaskTypes).toEqual([...AI_TUTOR_TASK_TYPES]);
  });

  it("reports health, and reports it as unavailable when it is", async () => {
    await expect(
      createLocalTutorProvider().getHealth()
    ).resolves.toMatchObject({
      providerId: LOCAL_TUTOR_PROVIDER_ID,
      state: "healthy"
    });

    await expect(
      createLocalTutorProvider({ failureMode: "unavailable" }).getHealth()
    ).resolves.toMatchObject({ state: "unavailable" });

    await expect(
      createLocalTutorProvider({ failureMode: "rate_limited" }).getHealth()
    ).resolves.toMatchObject({ state: "degraded" });
  });

  it("stamps a check time on every health record", async () => {
    const health = await localTutorProvider.getHealth();

    expect(Number.isNaN(Date.parse(health.checkedAt))).toBe(false);
  });
});

describe("the answer is composed from supplied grounding and nothing else", () => {
  it("restates the first grounding segment", async () => {
    const result = await createLocalTutorProvider().generate(
      prompt(),
      options
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    expect(String(result.output.answer)).toContain("Trunk ports");
    expect(String(result.output.answer)).toContain("tagged frames");
  });

  it("cites exactly the segments it was given", async () => {
    const result = await createLocalTutorProvider().generate(
      prompt(),
      options
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    expect(result.output.citedSegmentStableIds).toEqual(["step-4", "obj-1"]);
  });

  /**
   * The whole point of composition over generation: a provider that can only
   * restate approved content cannot invent curriculum, so a lesson it was not
   * given cannot be described.
   */
  it("refuses to characterise a lesson when grounding was withheld", async () => {
    const result = await createLocalTutorProvider().generate(
      prompt({ groundingMode: "context_unavailable", groundingSegments: [] }),
      options
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    expect(String(result.output.answer)).toContain("will not describe");
    expect(result.output.uncertain).toBe(true);
    expect(result.output.citedSegmentStableIds).toBeUndefined();
  });

  it("says plainly when no lesson content was available at all", async () => {
    const result = await createLocalTutorProvider().generate(
      prompt({ groundingMode: "general", groundingSegments: [] }),
      options
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    expect(String(result.output.answer)).toContain("none was available");
    expect(result.output.uncertain).toBe(true);
  });

  it("keeps a concise answer free of an explanation", async () => {
    const result = await createLocalTutorProvider().generate(
      prompt(),
      options
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    expect(result.output.explanation).toBeUndefined();
  });

  it("adds the remaining supplied segments when deeper was requested", async () => {
    const result = await createLocalTutorProvider().generate(
      prompt(
        {},
        {
          presentation: {
            explanationDepth: "deeper",
            languageRegister: "default"
          }
        }
      ),
      options
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    expect(String(result.output.explanation)).toContain("Objective");
  });

  it("never claims deterministic authority on its normal path", async () => {
    const result = await createLocalTutorProvider().generate(
      prompt(),
      options
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    expect(containsForbiddenAuthorityField(result.output)).toBe(false);
  });

  it("produces output the normalizer accepts", async () => {
    const result = await createLocalTutorProvider().generate(
      prompt(),
      options
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    const normalized = normalizeTutorProviderOutput({
      raw: result.output,
      requestId: "req-1",
      correlationId: "corr-1",
      groundingMode: "lesson_grounded",
      selectedSegments: segments,
      droppedSegmentCount: 0,
      labState: { availability: "unavailable", reason: "not_connected" },
      presentation: {
        explanationDepth: "concise",
        languageRegister: "default"
      }
    });

    expect(normalized.ok).toBe(true);
  });

  it("is deterministic: the same prompt gives the same output", async () => {
    const provider = createLocalTutorProvider();
    const first = await provider.generate(prompt(), options);
    const second = await provider.generate(prompt(), options);

    expect(second).toEqual(first);
  });
});

describe("every normalized failure is reachable without a network", () => {
  it("reports a provider outage", async () => {
    const result = await createLocalTutorProvider({
      failureMode: "unavailable"
    }).generate(prompt(), options);

    expect(result).toMatchObject({
      status: "failed",
      error: "provider_unavailable"
    });
  });

  it("reports rate limiting", async () => {
    const result = await createLocalTutorProvider({
      failureMode: "rate_limited"
    }).generate(prompt(), options);

    expect(result).toMatchObject({ status: "failed", error: "rate_limited" });
  });

  it("can return no answer at all", async () => {
    const result = await createLocalTutorProvider({
      failureMode: "malformed_empty"
    }).generate(prompt(), options);

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.output).toEqual({});
    }
  });

  /**
   * The fixture that exercises the deterministic boundary against a provider
   * genuinely trying to return a verdict. The refusal lives in the normalizer,
   * never here: a well-behaved provider is not a security control.
   */
  it("can try to claim deterministic authority, and the normalizer refuses it", async () => {
    const result = await createLocalTutorProvider({
      failureMode: "malformed_authority_claim"
    }).generate(prompt(), options);

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    expect(containsForbiddenAuthorityField(result.output)).toBe(true);

    const normalized = normalizeTutorProviderOutput({
      raw: result.output,
      requestId: "req-1",
      correlationId: "corr-1",
      groundingMode: "lesson_grounded",
      selectedSegments: segments,
      droppedSegmentCount: 0,
      labState: { availability: "unavailable", reason: "not_connected" },
      presentation: {
        explanationDepth: "concise",
        languageRegister: "default"
      }
    });

    expect(normalized.ok).toBe(false);
    if (!normalized.ok) {
      expect(normalized.error).toBe("invalid_provider_response");
    }
  });

  it("can fabricate a citation, which verification then drops", async () => {
    const result = await createLocalTutorProvider({
      failureMode: "fabricated_citation"
    }).generate(prompt(), options);

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;

    const normalized = normalizeTutorProviderOutput({
      raw: result.output,
      requestId: "req-1",
      correlationId: "corr-1",
      groundingMode: "lesson_grounded",
      selectedSegments: segments,
      droppedSegmentCount: 0,
      labState: { availability: "unavailable", reason: "not_connected" },
      presentation: {
        explanationDepth: "concise",
        languageRegister: "default"
      }
    });

    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.response.citations).toEqual([]);
      expect(normalized.response.droppedCitationCount).toBe(1);
    }
  });

  it("can be slow, and stops when the caller aborts", async () => {
    const provider = createLocalTutorProvider({
      failureMode: "slow",
      responseDelayMs: 5_000
    });
    const controller = new AbortController();

    const started = Date.now();
    const pending = provider.generate(prompt(), {
      timeoutMs: 10,
      signal: controller.signal
    });
    controller.abort();

    await pending;

    // Abort resolves the wait immediately rather than letting the 5s timer run.
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("switches failure mode on an existing instance", async () => {
    const provider = createLocalTutorProvider();
    provider.setFailureMode("unavailable");

    expect(await provider.generate(prompt(), options)).toMatchObject({
      status: "failed",
      error: "provider_unavailable"
    });
  });
});

describe("no provider is activated and no credential is read", () => {
  it("imports no AI provider SDK", () => {
    for (const forbidden of [
      "openai",
      "@anthropic-ai",
      "anthropic",
      "ollama",
      "@google/generative-ai",
      "cohere",
      "mistralai",
      "langchain"
    ]) {
      expect(sourceCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("makes no network call and names no provider endpoint", () => {
    for (const forbidden of [
      "fetch(",
      "http://",
      "https://",
      "XMLHttpRequest",
      "WebSocket",
      "node:http",
      "undici",
      "axios",
      "baseUrl",
      "apiBase"
    ]) {
      expect(sourceCode).not.toContain(forbidden);
    }
  });

  it("reads no environment variable at all", () => {
    expect(sourceCode).not.toContain("process.env");

    for (const name of AI_TUTOR_FORBIDDEN_PROVIDER_ENV) {
      expect(sourceCode).not.toContain(name);
    }
  });

  it("touches no database and no learner record", () => {
    for (const forbidden of [
      "supabase",
      "createServerSupabaseClient",
      "createUserScopedSupabaseClient",
      "student_notes",
      "userId",
      "accessToken"
    ]) {
      expect(sourceCode).not.toContain(forbidden);
    }
  });

  it("yields inspectable text, so these absence scans are not vacuous", () => {
    expect(sourceCode.trim().length).toBeGreaterThan(500);
    expect(sourceCode).toContain("class LocalTutorProvider");
  });
});
