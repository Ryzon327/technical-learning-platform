import { describe, expect, it } from "vitest";
import {
  AI_TUTOR_RESPONSE_CONTRACT_VERSION,
  AI_TUTOR_RESPONSE_FORBIDDEN_FIELDS,
  TUTOR_ANSWER_MAX_LENGTH,
  TUTOR_BOUNDARY_FLAGS,
  TUTOR_EXPLANATION_MAX_LENGTH,
  TUTOR_GUIDANCE_STEP_MAX_LENGTH,
  TUTOR_MAX_GUIDANCE_STEPS,
  TUTOR_RESPONSE_OUTCOMES,
  TUTOR_SUGGESTED_ACTIONS,
  TUTOR_UNCERTAINTY_LEVELS,
  buildTutorDeferralResponse,
  buildTutorUnavailableResponse,
  containsForbiddenResponseField,
  deriveTutorUncertainty,
  normalizeTutorProviderOutput
} from "./ai-tutor-response";
import {
  TUTOR_DEFERRAL_SUBJECTS,
  TUTOR_LAB_ATTESTATION_SOURCE,
  type TutorLabStateContext
} from "./ai-tutor-boundaries";
import type { TutorGroundingSegment } from "./ai-tutor-grounding";
import type { TutorProviderOutput } from "./ai-tutor-provider";

const presentation = {
  explanationDepth: "concise" as const,
  languageRegister: "default" as const
};

const selected: TutorGroundingSegment[] = [
  {
    kind: "lesson_text",
    segmentStableId: "step-4",
    title: "Trunk ports",
    text: "A trunk port carries tagged frames for several VLANs.",
    sourceReference: "/missions/mission-2/steps/step-4"
  }
];

const labUnavailable: TutorLabStateContext = {
  availability: "unavailable",
  reason: "not_connected"
};

function normalize(
  raw: TutorProviderOutput,
  overrides: Partial<Parameters<typeof normalizeTutorProviderOutput>[0]> = {}
) {
  return normalizeTutorProviderOutput({
    raw,
    requestId: "req-1",
    correlationId: "corr-1",
    groundingMode: "lesson_grounded",
    selectedSegments: selected,
    droppedSegmentCount: 0,
    labState: labUnavailable,
    presentation,
    ...overrides
  });
}

describe("the response contract is versioned and its vocabularies are closed", () => {
  it("stamps the contract version", () => {
    expect(AI_TUTOR_RESPONSE_CONTRACT_VERSION).toBe("ai-tutor-response-v1");
  });

  it("names exactly the three outcomes", () => {
    expect(TUTOR_RESPONSE_OUTCOMES).toEqual([
      "answered",
      "deferred_to_deterministic",
      "unavailable"
    ]);
  });

  it("names exactly the approved uncertainty levels", () => {
    expect(TUTOR_UNCERTAINTY_LEVELS).toEqual([
      "grounded",
      "partial",
      "general",
      "unavailable_context"
    ]);
  });

  /**
   * The suggested-action vocabulary carries no pressure mechanic, and it
   * carries the deterministic hand-off the Tutor offers instead of a verdict.
   */
  it("offers deterministic validation and no pressure mechanic", () => {
    expect(TUTOR_SUGGESTED_ACTIONS).toContain("run_deterministic_validation");

    for (const mechanic of ["beat_your_time", "keep_streak", "leaderboard"]) {
      expect(TUTOR_SUGGESTED_ACTIONS as readonly string[]).not.toContain(
        mechanic
      );
    }
  });

  it("declares every boundary flag false", () => {
    expect(TUTOR_BOUNDARY_FLAGS).toEqual({
      determinesLabCorrectness: false,
      grantsMastery: false,
      altersDeterministicScoring: false,
      mutatesLearnerNotes: false,
      overridesDeterministicValidation: false,
      createsLearnerEvidence: false
    });
  });
});

describe("valid provider output normalizes", () => {
  it("produces a complete structured response", () => {
    const result = normalize({
      answer: "A trunk port carries tagged frames.",
      explanation: "Each VLAN keeps its tag across the trunk.",
      stepGuidance: ["Check the allowed VLAN list on both ends."],
      citedSegmentStableIds: ["step-4"]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.response.outcome).toBe("answered");
    expect(result.response.groundingMode).toBe("lesson_grounded");
    expect(result.response.answer).toBe("A trunk port carries tagged frames.");
    expect(result.response.citations).toEqual([
      {
        segmentStableId: "step-4",
        title: "Trunk ports",
        sourceReference: "/missions/mission-2/steps/step-4"
      }
    ]);
    expect(result.response.uncertainty.level).toBe("grounded");
    expect(result.response.boundaryFlags).toEqual(TUTOR_BOUNDARY_FLAGS);
    expect(result.response.rendering.keyboardReachable).toBe(true);
  });

  it("omits an absent explanation rather than inventing one", () => {
    const result = normalize({ answer: "Short answer." });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.response)).not.toContain("explanation");
    }
  });

  it("bounds every text field", () => {
    const result = normalize({
      answer: "a".repeat(TUTOR_ANSWER_MAX_LENGTH + 500),
      explanation: "b".repeat(TUTOR_EXPLANATION_MAX_LENGTH + 500),
      stepGuidance: Array.from({ length: TUTOR_MAX_GUIDANCE_STEPS + 4 }, () =>
        "c".repeat(TUTOR_GUIDANCE_STEP_MAX_LENGTH + 100)
      )
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.response.answer.length).toBe(TUTOR_ANSWER_MAX_LENGTH);
    expect(result.response.explanation?.length).toBe(
      TUTOR_EXPLANATION_MAX_LENGTH
    );
    expect(result.response.stepGuidance).toHaveLength(TUTOR_MAX_GUIDANCE_STEPS);
    for (const step of result.response.stepGuidance) {
      expect(step.length).toBe(TUTOR_GUIDANCE_STEP_MAX_LENGTH);
    }
  });

  it("carries the honest lab-state sentence when lab state was unavailable", () => {
    const result = normalize({ answer: "Answer." });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.labStateStatement).toContain("not connected");
    }
  });

  it("omits the lab-state sentence when lab state was attested", () => {
    const result = normalize(
      { answer: "Answer." },
      {
        labState: {
          availability: "available",
          attestation: {
            source: TUTOR_LAB_ATTESTATION_SOURCE,
            sessionId: "session-1",
            validationRunId: "run-1",
            observedAt: "2026-10-05T09:59:00.000Z"
          }
        }
      }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.response)).not.toContain("labStateStatement");
    }
  });

  it("suggests a follow-up when it has no step guidance to offer", () => {
    const result = normalize({ answer: "Answer." });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.suggestedAction).toBe("ask_a_follow_up");
    }
  });
});

describe("output claiming deterministic authority is refused entirely", () => {
  /**
   * THE DETERMINISTIC BOUNDARY, at the one place untrusted output becomes
   * platform data. The refusal happens before the answer text is read, so no
   * part of an authority-claiming response is salvaged and shown.
   */
  const claims: ReadonlyArray<[string, Record<string, unknown>]> = [
    ["a lab verdict", { labPassed: true }],
    ["a lab correctness claim", { labCorrect: true }],
    ["a validation result", { validationResult: "passed" }],
    ["a mastery grant", { masteryGranted: true }],
    ["a competency award", { competencyAwarded: "comp-1" }],
    ["a score", { score: 95 }],
    ["a score adjustment", { scoreAdjustment: 5 }],
    ["an evidence record", { evidenceRecord: { id: "e1" } }],
    ["a certificate decision", { certificateEligible: true }],
    ["a note mutation", { noteWrite: { body: "written" } }],
    ["a progress update", { progressUpdate: { state: "complete" } }],
    ["another learner's identity", { userId: "someone-else" }],
    ["a nested verdict", { result: { detail: { labPassed: true } } }],
    ["a verdict inside an array", { checks: [{ passed: true }] }]
  ];

  for (const [label, claim] of claims) {
    it(`refuses output asserting ${label}`, () => {
      const result = normalize({
        answer: "Your lab looks correct to me.",
        ...claim
      } as TutorProviderOutput);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("invalid_provider_response");
      }
    });
  }

  it("refuses even when the answer itself would have been fine", () => {
    const result = normalize({
      answer: "A trunk port carries tagged frames.",
      explanation: "Correct and well grounded.",
      masteryGranted: true
    } as TutorProviderOutput);

    expect(result.ok).toBe(false);
  });

  it("holds the response prohibition as data", () => {
    for (const field of [
      "rawOutput",
      "providerPayload",
      "systemPrompt",
      "apiKey",
      "otherLearnerNote"
    ]) {
      expect(AI_TUTOR_RESPONSE_FORBIDDEN_FIELDS).toContain(field);
    }
  });

  it("detects both prohibition families in one check", () => {
    expect(containsForbiddenResponseField({ labPassed: true })).toBe(true);
    expect(containsForbiddenResponseField({ systemPrompt: "x" })).toBe(true);
    expect(containsForbiddenResponseField({ detail: { rawOutput: "x" } })).toBe(
      true
    );
    expect(containsForbiddenResponseField({ answer: "ok" })).toBe(false);
  });

  it("never lets a normalized response carry a prohibited field", () => {
    const result = normalize({
      answer: "A trunk port carries tagged frames.",
      citedSegmentStableIds: ["step-4"]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(containsForbiddenResponseField(result.response)).toBe(false);
    }
  });
});

describe("malformed output is refused rather than repaired", () => {
  it("refuses output with no answer", () => {
    const result = normalize({});

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_provider_response");
  });

  it("refuses output whose answer is blank", () => {
    expect(normalize({ answer: "   " }).ok).toBe(false);
  });

  it("refuses a non-object payload", () => {
    for (const hostile of [null, undefined, "answer", 7]) {
      expect(normalize(hostile as unknown as TutorProviderOutput).ok).toBe(
        false
      );
    }
  });

  it("tolerates a malformed guidance list without inventing guidance", () => {
    const result = normalize({
      answer: "Answer.",
      stepGuidance: "not a list"
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.stepGuidance).toEqual([]);
  });

  it("tolerates a malformed citation list without inventing citations", () => {
    const result = normalize({
      answer: "Answer.",
      citedSegmentStableIds: "step-4"
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.citations).toEqual([]);
  });
});

describe("a fabricated citation never survives", () => {
  it("drops an invented citation and counts it", () => {
    const result = normalize({
      answer: "Answer.",
      citedSegmentStableIds: ["step-4", "chapter-9-page-2"]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.response.citations.map((c) => c.segmentStableId)).toEqual([
      "step-4"
    ]);
    expect(result.response.droppedCitationCount).toBe(1);
    expect(JSON.stringify(result.response)).not.toContain("chapter-9-page-2");
  });

  it("drops every citation when none was grounded", () => {
    const result = normalize(
      { answer: "Answer.", citedSegmentStableIds: ["step-4"] },
      { selectedSegments: [], groundingMode: "general" }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.citations).toEqual([]);
      expect(result.response.droppedCitationCount).toBe(1);
    }
  });
});

describe("uncertainty is derived from platform facts, not self-report", () => {
  it("is grounded when lesson content was used and nothing was dropped", () => {
    expect(
      deriveTutorUncertainty({
        groundingMode: "lesson_grounded",
        droppedSegmentCount: 0,
        verifiedCitationCount: 1,
        providerDeclaredUncertain: false
      }).level
    ).toBe("grounded");
  });

  /**
   * A confident model with no grounding is still `general`. Being grounded is a
   * property of what the PLATFORM selected, so a provider cannot assert it.
   */
  it("stays general when no lesson content was used, however confident", () => {
    expect(
      deriveTutorUncertainty({
        groundingMode: "general",
        droppedSegmentCount: 0,
        verifiedCitationCount: 1,
        providerDeclaredUncertain: false
      }).level
    ).toBe("general");
  });

  it("is unavailable_context when lesson content could not be read", () => {
    const uncertainty = deriveTutorUncertainty({
      groundingMode: "context_unavailable",
      droppedSegmentCount: 0,
      verifiedCitationCount: 1,
      providerDeclaredUncertain: false
    });

    expect(uncertainty.level).toBe("unavailable_context");
    expect(uncertainty.statement).toContain("will not describe");
  });

  it("is partial when a grounded answer cites no verified lesson segment", () => {
    const uncertainty = deriveTutorUncertainty({
      groundingMode: "lesson_grounded",
      droppedSegmentCount: 0,
      verifiedCitationCount: 0,
      providerDeclaredUncertain: false
    });

    expect(uncertainty.level).toBe("partial");
    expect(uncertainty.statement).not.toContain("comes from this lesson");
  });

  it("honours a provider's own declaration of uncertainty by downgrading", () => {
    expect(
      deriveTutorUncertainty({
        groundingMode: "lesson_grounded",
        droppedSegmentCount: 0,
        verifiedCitationCount: 1,
        providerDeclaredUncertain: true
      }).level
    ).toBe("partial");
  });

  it("is partial when lesson content was truncated by the bound", () => {
    expect(
      deriveTutorUncertainty({
        groundingMode: "lesson_grounded",
        droppedSegmentCount: 2,
        verifiedCitationCount: 1,
        providerDeclaredUncertain: false
      }).level
    ).toBe("partial");
  });

  /**
   * A non-grounded answer is announced as such BEFORE the answer, because a
   * screen-reader user must learn that the answer is ungrounded on arrival.
   */
  it("announces a non-grounded answer first", () => {
    const result = normalize(
      { answer: "General explanation." },
      { groundingMode: "general", selectedSegments: [] }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.response.rendering.blocks[0]?.role).toBe("status");
    expect(result.response.rendering.screenReaderAnnouncement).toContain(
      "not drawn from"
    );
  });

  it("does not announce a status for a fully grounded answer", () => {
    const result = normalize({
      answer: "Grounded answer.",
      citedSegmentStableIds: ["step-4"]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.rendering.blocks[0]?.role).toBe("paragraph");
    }
  });
});

describe("an unavailable Tutor is an answerable state", () => {
  it("returns the same response type as a successful answer", () => {
    const response = buildTutorUnavailableResponse({
      requestId: "req-1",
      correlationId: "corr-1",
      error: "timeout",
      groundingMode: "lesson_grounded",
      presentation,
      labState: labUnavailable
    });

    expect(response.contractVersion).toBe(AI_TUTOR_RESPONSE_CONTRACT_VERSION);
    expect(response.outcome).toBe("unavailable");
    expect(response.answer.toLowerCase()).toContain("took too long");
    expect(response.boundaryFlags).toEqual(TUTOR_BOUNDARY_FLAGS);
    expect(containsForbiddenResponseField(response)).toBe(false);
  });

  it("nudges the learner nowhere", () => {
    const response = buildTutorUnavailableResponse({
      requestId: "req-1",
      correlationId: "corr-1",
      error: "provider_unavailable",
      groundingMode: "context_unavailable",
      presentation
    });

    expect(response.suggestedAction).toBe("none");
    expect(response.citations).toEqual([]);
    expect(response.stepGuidance).toEqual([]);
  });

  it("states plainly that nothing changed, and announces it", () => {
    const response = buildTutorUnavailableResponse({
      requestId: "req-1",
      correlationId: "corr-1",
      error: "provider_unavailable",
      groundingMode: "general",
      presentation
    });

    expect(response.uncertainty.statement.toLowerCase()).toContain(
      "nothing about your lesson"
    );
    expect(response.rendering.blocks[0]?.role).toBe("status");
    expect(response.rendering.screenReaderAnnouncement.length).toBeGreaterThan(
      0
    );
  });

  it("never carries a citation it could not have earned", () => {
    for (const error of ["timeout", "provider_unavailable"] as const) {
      const response = buildTutorUnavailableResponse({
        requestId: "req-1",
        correlationId: "corr-1",
        error,
        groundingMode: "lesson_grounded",
        presentation
      });

      expect(response.citations).toEqual([]);
      expect(response.droppedCitationCount).toBe(0);
    }
  });
});

describe("a deterministic question is deferred, with somewhere to go", () => {
  it("points a lab-correctness question at deterministic validation", () => {
    const response = buildTutorDeferralResponse({
      requestId: "req-1",
      correlationId: "corr-1",
      subject: "lab_correctness",
      groundingMode: "general",
      presentation,
      labState: labUnavailable
    });

    expect(response.outcome).toBe("deferred_to_deterministic");
    expect(response.suggestedAction).toBe("run_deterministic_validation");
    expect(response.answer.toLowerCase()).toContain("cannot decide");
    expect(response.uncertainty.statement.toLowerCase()).toContain(
      "not by the tutor"
    );
  });

  it("covers every deferral subject without ever claiming authority", () => {
    for (const subject of TUTOR_DEFERRAL_SUBJECTS) {
      const response = buildTutorDeferralResponse({
        requestId: "req-1",
        correlationId: "corr-1",
        subject,
        groundingMode: "general",
        presentation
      });

      expect(response.outcome).toBe("deferred_to_deterministic");
      expect(response.boundaryFlags).toEqual(TUTOR_BOUNDARY_FLAGS);
      expect(containsForbiddenResponseField(response)).toBe(false);
      expect(response.answer).toContain("cannot");
    }
  });
});
