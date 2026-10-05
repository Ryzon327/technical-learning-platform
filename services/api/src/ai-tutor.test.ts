import { describe, expect, it, vi } from "vitest";
import {
  AI_TUTOR_REQUEST_SCHEMA,
  AppError,
  type AiTutorRequest
} from "@tlp/shared-types";
import {
  answerAiTutorQuestion,
  buildAiTutorAuditMetadata,
  createStaticAiTutorProvider,
  selectAiTutorGrounding,
  type AiTutorProvider
} from "./ai-tutor";

function request(): AiTutorRequest {
  return {
    schemaVersion: AI_TUTOR_REQUEST_SCHEMA,
    requestId: "req-1",
    correlationId: "corr-1",
    task: "tutor",
    learnerQuestion: "Why does a switch learn source MAC addresses?",
    missionStableId: "networking-m01",
    context: [
      {
        id: "reference-1",
        kind: "approved_reference",
        text: "Ethernet reference material",
        provenance: "approved-reference"
      },
      {
        id: "lesson-1",
        kind: "lesson_text",
        text: "A switch learns the source MAC address and incoming port.",
        provenance: "networking-m01/lesson"
      },
      {
        id: "note-1",
        kind: "selected_note",
        text: "My note about MAC learning",
        provenance: "note:note-1",
        learnerSelected: true
      }
    ]
  };
}

describe("AI Tutor grounding", () => {
  it("prefers current lesson context under a bounded context budget", () => {
    const selected = selectAiTutorGrounding(request(), 256);
    expect(selected[0]?.id).toBe("lesson-1");
    expect(
      selected.reduce((sum, source) => sum + source.text.length, 0)
    ).toBeLessThanOrEqual(256);
  });

  it("never includes raw learner question or context text in audit metadata", () => {
    const value = request();
    const selected = selectAiTutorGrounding(value);
    const metadata = buildAiTutorAuditMetadata(value, selected);
    const serialized = JSON.stringify(metadata);

    expect(serialized).not.toContain(value.learnerQuestion);
    expect(serialized).not.toContain("My note about MAC learning");
    expect(metadata.contextSourceIds).toContain("lesson-1");
  });
});

describe("AI Tutor provider boundary", () => {
  it("uses a provider-neutral local test adapter and filters references", async () => {
    const provider = createStaticAiTutorProvider((input) => ({
      conciseAnswer: "It is building a forwarding map.",
      explanation:
        "The source address tells the switch which device is reachable through the incoming port.",
      referenceIds: [input.context[0]!.id, "not-supplied"],
      grounding: "lesson",
      nextAction: "Trace one frame through the switch."
    }));

    const response = await answerAiTutorQuestion(request(), provider);

    expect(response.providerId).toBe("local-test");
    expect(response.grounding).toBe("lesson");
    expect(response.references).toHaveLength(1);
    expect(response.references[0]?.sourceId).toBe("lesson-1");
    expect(response.authority.canGrantMastery).toBe(false);
    expect(response.authority.canMarkLabCorrect).toBe(false);
    expect(response.authority.canChangeScore).toBe(false);
    expect(response.authority.canWriteNotes).toBe(false);
  });

  it("represents missing trusted lab state as unavailable rather than guessing", async () => {
    const provider = createStaticAiTutorProvider({
      conciseAnswer: "I can explain the concept, but I do not have trusted lab state.",
      explanation:
        "No deterministic lab state was supplied with this request.",
      grounding: "general"
    });

    const response = await answerAiTutorQuestion(request(), provider);
    expect(response.availability.trustedLabState).toBe("unavailable");
    expect(response.authority.canMarkLabCorrect).toBe(false);
  });

  it("marks trusted deterministic lab state available without granting validation authority", async () => {
    const value = request();
    value.context = [
      ...value.context,
      {
        id: "lab-1",
        kind: "trusted_lab_state",
        text: "eth0 link state: down",
        provenance: "deterministic-lab-validator",
        trusted: true
      }
    ];

    const provider = createStaticAiTutorProvider({
      conciseAnswer: "The supplied state says the link is down.",
      explanation: "That state came from the deterministic lab validator.",
      referenceIds: ["lab-1"],
      grounding: "lesson"
    });

    const response = await answerAiTutorQuestion(value, provider);
    expect(response.availability.trustedLabState).toBe("available");
    expect(response.authority.canMarkLabCorrect).toBe(false);
  });

  it("blocks likely secrets before the provider is called", async () => {
    const complete = vi.fn(async () => ({
      conciseAnswer: "should not run",
      explanation: "should not run"
    }));
    const provider: AiTutorProvider = { id: "spy", complete };
    const value = request();
    value.context = [
      {
        id: "bad",
        kind: "lesson_text",
        text: "password=hunter2",
        provenance: "fixture"
      }
    ];

    await expect(answerAiTutorQuestion(value, provider)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      retryable: false
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("retries a retryable provider failure at most once", async () => {
    let attempts = 0;
    const provider: AiTutorProvider = {
      id: "flaky",
      async complete() {
        attempts += 1;
        if (attempts === 1) {
          throw new AppError({
            code: "DEPENDENCY_UNAVAILABLE",
            message: "temporary",
            retryable: true
          });
        }
        return {
          conciseAnswer: "Recovered.",
          explanation: "The bounded second attempt succeeded.",
          grounding: "general"
        };
      }
    };

    const response = await answerAiTutorQuestion(request(), provider);
    expect(response.conciseAnswer).toBe("Recovered.");
    expect(attempts).toBe(2);
  });

  it("times out and returns a normalized unavailable error", async () => {
    const provider: AiTutorProvider = {
      id: "hung",
      async complete(_request, signal) {
        return await new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }
    };

    await expect(
      answerAiTutorQuestion(request(), provider, {
        timeoutMs: 50,
        maxAttempts: 1
      })
    ).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      retryable: true
    });
  });
});
