import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import {
  AI_TUTOR_AUTHORITY,
  AI_TUTOR_REQUEST_SCHEMA,
  aiTutorRequestProblems,
  assertValidAiTutorRequest,
  containsLikelySecret,
  normalizeAiTutorProviderOutput,
  redactLikelySecrets,
  type AiTutorRequest
} from "./ai-tutor";

function request(): AiTutorRequest {
  return {
    schemaVersion: AI_TUTOR_REQUEST_SCHEMA,
    requestId: "req-1",
    correlationId: "corr-1",
    task: "tutor",
    learnerQuestion: "Why does a switch need a MAC address?",
    missionStableId: "networking-m01",
    context: [
      {
        id: "lesson-1",
        kind: "lesson_text",
        text: "A switch learns source MAC addresses on incoming frames.",
        provenance: "networking-m01/lesson"
      }
    ]
  };
}

describe("AI Tutor request contract", () => {
  it("accepts minimum necessary lesson context", () => {
    expect(aiTutorRequestProblems(request())).toEqual([]);
    expect(() => assertValidAiTutorRequest(request())).not.toThrow();
  });

  it("requires explicit learner selection before note text can be included", () => {
    const value = request();
    value.context = [
      {
        id: "note-1",
        kind: "selected_note",
        text: "My note",
        provenance: "note:note-1"
      }
    ];

    expect(aiTutorRequestProblems(value)).toContain(
      "selected note note-1 was not explicitly selected by the learner"
    );
  });

  it("requires selected notes to be scoped to the current learner", () => {
    const value = request();
    value.context = [
      {
        id: "note-1",
        kind: "selected_note",
        text: "My note",
        provenance: "note:note-1",
        learnerSelected: true
      }
    ];

    expect(aiTutorRequestProblems(value)).toContain(
      "selected note note-1 is not scoped to the current learner"
    );
  });

  it("requires deterministic trust before lab state can be attached", () => {
    const value = request();
    value.context = [
      {
        id: "lab-1",
        kind: "trusted_lab_state",
        text: "interface eth0 is administratively down",
        provenance: "lab-validator"
      }
    ];

    expect(aiTutorRequestProblems(value)).toContain(
      "lab state lab-1 is not trusted deterministic state"
    );
  });
});

/**
 * Malformed and untrusted input must FAIL CLOSED.
 *
 * The validator is the boundary for input the platform did not construct — a
 * parsed request body, a cross-service payload. Before this repair it recorded
 * the problem and then immediately dereferenced the invalid value, so every
 * shape below raised a raw `TypeError` instead of the normalized non-retryable
 * `VALIDATION_ERROR`.
 *
 * A `TypeError` escaping here is a real boundary failure, not cosmetics: it
 * leaves the `AppError` contract, carries an internal message outward, and a
 * caller cannot distinguish it from a genuine platform fault — so a rejected
 * request would read as a server defect.
 *
 * Each case asserts BOTH halves of the guarantee: that no raw `TypeError`
 * escapes, and that the refusal is the normalized validation failure.
 */
describe("AI Tutor request fails closed on untrusted input", () => {
  /** Every shape must reach `VALIDATION_ERROR`, never a raw runtime error. */
  function expectNormalizedRefusal(value: unknown): AppError {
    let thrown: unknown;
    try {
      assertValidAiTutorRequest(value);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).not.toBeInstanceOf(TypeError);

    const error = thrown as AppError;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.retryable).toBe(false);
    expect(Array.isArray(error.details?.problems)).toBe(true);
    expect((error.details?.problems as string[]).length).toBeGreaterThan(0);

    return error;
  }

  it("fails closed when context is missing", () => {
    const { context: _omitted, ...withoutContext } = request();

    expect(() => aiTutorRequestProblems(withoutContext)).not.toThrow();
    expect(aiTutorRequestProblems(withoutContext)).toContain(
      "context must be an array"
    );
    expectNormalizedRefusal(withoutContext);
  });

  it("fails closed when context is null", () => {
    const value = { ...request(), context: null };

    expect(() => aiTutorRequestProblems(value)).not.toThrow();
    expect(aiTutorRequestProblems(value)).toContain("context must be an array");
    expectNormalizedRefusal(value);
  });

  /**
   * A non-array `context` must stop validation before `.length` and before
   * iteration. A plain object has no `length` and is not iterable; a number is
   * neither; a string has a `length` and IS iterable, which is the case most
   * likely to produce nonsense problems rather than a clean refusal.
   */
  it("fails closed when context is not an array", () => {
    for (const context of [{}, 5, "lesson-1", true, { length: 3 }]) {
      const value = { ...request(), context };

      expect(() => aiTutorRequestProblems(value)).not.toThrow();
      expect(aiTutorRequestProblems(value)).toContain(
        "context must be an array"
      );
      expectNormalizedRefusal(value);
    }
  });

  it("reports a non-array context exactly once and never enumerates it", () => {
    const problems = aiTutorRequestProblems({
      ...request(),
      context: { 0: { id: "smuggled" }, length: 1 }
    });

    expect(problems).toEqual(["context must be an array"]);
    expect(problems.join(" ")).not.toContain("smuggled");
  });

  it("fails closed on a malformed top-level request object", () => {
    for (const value of [
      null,
      undefined,
      "ask me something",
      42,
      true,
      [],
      [request()]
    ]) {
      expect(() => aiTutorRequestProblems(value)).not.toThrow();
      expectNormalizedRefusal(value);
    }

    expect(aiTutorRequestProblems(null)).toEqual(["request must be an object"]);
    expect(aiTutorRequestProblems([])).toEqual(["request must be an object"]);
  });

  /**
   * An empty object is the shape that exposed a SECOND instance of the same
   * defect: `learnerQuestion.length` ran even after the field was recorded as
   * missing. It must now report the missing fields and nothing else.
   */
  it("fails closed on an empty request object without crashing on a missing question", () => {
    const problems = aiTutorRequestProblems({});

    expect(problems).toContain("learnerQuestion is required");
    expect(problems).not.toContain("learnerQuestion exceeds 4000 characters");
    expect(problems).toContain("context must be an array");
    expectNormalizedRefusal({});
  });

  it("fails closed on a malformed context entry without crashing", () => {
    for (const source of [null, undefined, "lesson-1", 7, []]) {
      const value = { ...request(), context: [source] };

      expect(() => aiTutorRequestProblems(value)).not.toThrow();
      expect(aiTutorRequestProblems(value)).toContain(
        "context source must be an object"
      );
      expectNormalizedRefusal(value);
    }
  });

  it("still validates the remaining sources after a malformed entry", () => {
    const problems = aiTutorRequestProblems({
      ...request(),
      context: [
        null,
        {
          id: "note-1",
          kind: "selected_note",
          text: "My note",
          provenance: "note:note-1"
        }
      ]
    });

    expect(problems).toContain("context source must be an object");
    expect(problems).toContain(
      "selected note note-1 was not explicitly selected by the learner"
    );
  });

  it("reports a missing context source kind rather than throwing", () => {
    const problems = aiTutorRequestProblems({
      ...request(),
      context: [{ id: "lesson-1", text: "text", provenance: "fixture" }]
    });

    expect(problems).toContain("unsupported context kind: undefined");
  });

  /**
   * The shape failure must not suppress problems already established. A caller
   * fixing one field should not have the others appear only on the next attempt.
   */
  it("preserves problems found before the context shape failure", () => {
    const problems = aiTutorRequestProblems({
      schemaVersion: "ai-tutor-request/v0",
      task: "draft",
      requestId: "",
      correlationId: "",
      learnerQuestion: "",
      context: null
    });

    expect(problems).toContain("unsupported schema version");
    expect(problems).toContain("unsupported task");
    expect(problems).toContain("requestId is required");
    expect(problems).toContain("correlationId is required");
    expect(problems).toContain("learnerQuestion is required");
    expect(problems).toContain("context must be an array");
  });

  it("still accepts a valid request unchanged", () => {
    expect(aiTutorRequestProblems(request())).toEqual([]);
    expect(() => assertValidAiTutorRequest(request())).not.toThrow();
  });

  /**
   * The length rule is unchanged by the repair; only its guard moved. An
   * over-long question is still rejected, and still by that exact problem.
   */
  it("still rejects an over-long learner question", () => {
    const problems = aiTutorRequestProblems({
      ...request(),
      learnerQuestion: "a".repeat(4001)
    });

    expect(problems).toEqual(["learnerQuestion exceeds 4000 characters"]);
  });

  it("narrows an untrusted payload once it has been validated", () => {
    const payload: unknown = request();

    assertValidAiTutorRequest(payload);

    // Reachable only because the assertion narrowed `unknown`. A caller no
    // longer has to cast an unvalidated body to reach the validator.
    expect(payload.context).toHaveLength(1);
    expect(payload.task).toBe("tutor");
  });
});

describe("AI Tutor privacy boundary", () => {
  it("detects and redacts representative secrets deterministically", () => {
    const text = "authorization: Bearer abcdefghijklmnop and password=hunter2";
    expect(containsLikelySecret(text)).toBe(true);
    const redacted = redactLikelySecrets(text);
    expect(redacted).not.toContain("abcdefghijklmnop");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).toContain("[REDACTED]");
  });
});

describe("AI Tutor response authority", () => {
  it("drops provider mutation claims and pins all authority flags false", () => {
    const raw = {
      conciseAnswer: "The switch uses MAC addresses to forward Ethernet frames.",
      explanation: "It learns which source MAC address appears on which port.",
      referenceIds: ["lesson-1", "not-authorized"],
      grounding: "lesson",
      grantMastery: true,
      markLabCorrect: true,
      score: 100,
      writeNote: "provider tried to write"
    };

    const normalized = normalizeAiTutorProviderOutput(
      "req-1",
      "test-provider",
      raw,
      new Set(["lesson-1"])
    );

    expect(normalized.availability.trustedLabState).toBe("unavailable");
    expect(normalized.authority).toEqual(AI_TUTOR_AUTHORITY);
    expect(normalized.authority.canGrantMastery).toBe(false);
    expect(normalized.authority.canMarkLabCorrect).toBe(false);
    expect(normalized.authority.canChangeScore).toBe(false);
    expect(normalized.authority.canWriteNotes).toBe(false);
    expect(normalized.references.map((reference) => reference.sourceId)).toEqual([
      "lesson-1"
    ]);
    expect(normalized).not.toHaveProperty("grantMastery");
    expect(normalized).not.toHaveProperty("markLabCorrect");
    expect(normalized).not.toHaveProperty("score");
    expect(normalized).not.toHaveProperty("writeNote");
  });
});
