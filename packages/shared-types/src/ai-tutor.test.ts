import { describe, expect, it } from "vitest";
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
