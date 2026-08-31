import { describe, expect, it } from "vitest";
import {
  MISSION_STEP_TYPES,
  type LearnerCurriculumAsset,
  type LearnerMissionInstructionResponse,
  type LearnerMissionStep,
  type LearnerMissionStepContent
} from "@tlp/shared-types";
import {
  buildAssetIndex,
  describeCommandLabel,
  describeCommandOutputLabel,
  describeInstructionUnavailable,
  describePracticeCheckpoint,
  describePracticeCheckpointLabel,
  isBundledFallbackEligible,
  resolveAsset,
  resolveReferenceHref,
  selectInstructionSource,
  type InstructionSource
} from "./mission-instruction-presentation";
import { parseMissionBrief } from "./roas-course-content";

/**
 * WP-F — the decisions that must hold regardless of markup.
 *
 * This repository has no rendered-DOM harness and WP-F may not add one, so
 * everything provable without a DOM is proved here and the rest is left to
 * `scripts/verify-wpf.sh`.
 */

const MISSION = {
  stableId: "mission.vlan-basics",
  version: 2,
  title: "Why two hosts cannot talk"
} as const;

function response(
  instruction: LearnerMissionInstructionResponse["instruction"]
): LearnerMissionInstructionResponse {
  return { mission: MISSION, instruction };
}

function step(
  content: LearnerMissionStepContent,
  position = 1
): LearnerMissionStep {
  return { stableId: `step-${position}`, position, content };
}

const DIAGRAM_ASSET: LearnerCurriculumAsset = {
  stableId: "two-host-topology",
  assetType: "diagram",
  title: "Two hosts on one switch",
  uri: "https://cdn.example.test/two-host-topology.svg",
  altText: "Two workstations connected to a single switch."
};

const CONCEPT = step({ type: "concept", paragraphs: ["A VLAN is a domain."] });

function expectKind<K extends InstructionSource["kind"]>(
  source: InstructionSource,
  kind: K
): Extract<InstructionSource, { kind: K }> {
  expect(source.kind).toBe(kind);
  return source as Extract<InstructionSource, { kind: K }>;
}

/* ------------------------------------------------------------------ *
 * Source selection
 * ------------------------------------------------------------------ */

describe("selectInstructionSource", () => {
  it("selects structured instruction when WP-E says available", () => {
    const source = expectKind(
      selectInstructionSource({
        loading: false,
        response: response({
          state: "available",
          steps: [CONCEPT],
          assets: [DIAGRAM_ASSET]
        }),
        errorCode: null
      }),
      "structured"
    );

    expect(source.steps).toHaveLength(1);
    expect(source.assets).toHaveLength(1);
  });

  it("selects the server legacy brief when WP-E says legacy_brief", () => {
    const source = expectKind(
      selectInstructionSource({
        loading: false,
        response: response({
          state: "legacy_brief",
          description: "First block.\n\nSecond block."
        }),
        errorCode: null
      }),
      "legacy"
    );

    expect(source.blocks).toEqual([
      { kind: "paragraph", text: "First block." },
      { kind: "paragraph", text: "Second block." }
    ]);
  });

  it("parses a legacy brief exactly as the existing brief parser does", () => {
    const description = "Intro line.\n\n- first\n- second";

    const source = expectKind(
      selectInstructionSource({
        loading: false,
        response: response({ state: "legacy_brief", description }),
        errorCode: null
      }),
      "legacy"
    );

    expect(source.blocks).toEqual(parseMissionBrief(description));
  });

  it("selects the bundled brief while the request is in flight", () => {
    expectKind(
      selectInstructionSource({
        loading: true,
        response: null,
        errorCode: null
      }),
      "bundled"
    );
  });

  it("selects the bundled brief before a request has been made", () => {
    expectKind(
      selectInstructionSource({
        loading: false,
        response: null,
        errorCode: null
      }),
      "bundled"
    );
  });

  it("prefers a delivered response over a stale loading flag", () => {
    expectKind(
      selectInstructionSource({
        loading: true,
        response: response({
          state: "available",
          steps: [CONCEPT],
          assets: []
        }),
        errorCode: null
      }),
      "structured"
    );
  });
});

/* ------------------------------------------------------------------ *
 * Fallback classification
 * ------------------------------------------------------------------ */

describe("bundled fallback eligibility", () => {
  for (const code of [
    "DEPENDENCY_UNAVAILABLE",
    "NOT_FOUND",
    "NETWORK_UNAVAILABLE"
  ]) {
    it(`falls back to the bundled brief on ${code}`, () => {
      expect(isBundledFallbackEligible(code)).toBe(true);
      expectKind(
        selectInstructionSource({
          loading: false,
          response: null,
          errorCode: code
        }),
        "bundled"
      );
    });
  }

  for (const code of [
    "INTERNAL_ERROR",
    "UNAUTHORIZED",
    "VALIDATION_ERROR",
    "CONFIGURATION_MISSING",
    "SOMETHING_NEW"
  ]) {
    it(`refuses to disguise ${code} as working curriculum`, () => {
      expect(isBundledFallbackEligible(code)).toBe(false);
      expectKind(
        selectInstructionSource({
          loading: false,
          response: null,
          errorCode: code
        }),
        "unavailable"
      );
    });
  }

  it("treats no error as not eligible", () => {
    expect(isBundledFallbackEligible(null)).toBe(false);
  });

  it("keeps an authentication failure out of the fallback path", () => {
    // The course-level availability state already tells the learner their
    // session ended; the instruction panel must not invent a second story.
    const source = expectKind(
      selectInstructionSource({
        loading: false,
        response: null,
        errorCode: "UNAUTHORIZED"
      }),
      "unavailable"
    );

    expect(source.message).toBe(describeInstructionUnavailable());
  });
});

/* ------------------------------------------------------------------ *
 * content_error never falls back
 * ------------------------------------------------------------------ */

describe("content_error", () => {
  const contentError = selectInstructionSource({
    loading: false,
    response: response({ state: "content_error" }),
    errorCode: null
  });

  it("renders no instruction at all", () => {
    expectKind(contentError, "unavailable");
  });

  it("never becomes a bundled fallback", () => {
    expect(contentError.kind).not.toBe("bundled");
  });

  it("never becomes a legacy brief", () => {
    expect(contentError.kind).not.toBe("legacy");
  });

  it("carries no steps and no blocks", () => {
    expect("steps" in contentError).toBe(false);
    expect("blocks" in contentError).toBe(false);
    expect("assets" in contentError).toBe(false);
  });

  it("stays unavailable even when a fallback-eligible code is also present", () => {
    // A successful response is authoritative. A stale error code from an
    // earlier attempt must not reopen the fallback path.
    expectKind(
      selectInstructionSource({
        loading: false,
        response: response({ state: "content_error" }),
        errorCode: "DEPENDENCY_UNAVAILABLE"
      }),
      "unavailable"
    );
  });
});

/* ------------------------------------------------------------------ *
 * Exactly one source, always
 * ------------------------------------------------------------------ */

describe("only one instructional source is ever selected", () => {
  const inputs = [
    { loading: false, response: null, errorCode: null },
    { loading: true, response: null, errorCode: null },
    { loading: false, response: null, errorCode: "DEPENDENCY_UNAVAILABLE" },
    { loading: false, response: null, errorCode: "INTERNAL_ERROR" },
    { loading: true, response: null, errorCode: "NOT_FOUND" },
    {
      loading: false,
      response: response({ state: "available", steps: [CONCEPT], assets: [] }),
      errorCode: null
    },
    {
      loading: true,
      response: response({ state: "available", steps: [CONCEPT], assets: [] }),
      errorCode: "INTERNAL_ERROR"
    },
    {
      loading: false,
      response: response({ state: "legacy_brief", description: "Brief." }),
      errorCode: "DEPENDENCY_UNAVAILABLE"
    },
    {
      loading: false,
      response: response({ state: "content_error" }),
      errorCode: null
    }
  ] as const;

  it("returns exactly one known kind for every input combination", () => {
    for (const input of inputs) {
      const source = selectInstructionSource(input);
      expect(["structured", "legacy", "bundled", "unavailable"]).toContain(
        source.kind
      );
    }
  });

  it("never returns structured steps together with brief blocks", () => {
    for (const input of inputs) {
      const source = selectInstructionSource(input);
      const hasSteps = "steps" in source;
      const hasBlocks = "blocks" in source;
      expect(hasSteps && hasBlocks).toBe(false);
    }
  });

  it("carries brief blocks only on the legacy kind", () => {
    for (const input of inputs) {
      const source = selectInstructionSource(input);
      if ("blocks" in source) expect(source.kind).toBe("legacy");
    }
  });
});

/* ------------------------------------------------------------------ *
 * Wording
 * ------------------------------------------------------------------ */

describe("learner-facing wording", () => {
  const unavailable = describeInstructionUnavailable();

  it("says the state is temporary and that progress is safe", () => {
    expect(unavailable).toContain("temporarily unavailable");
    expect(unavailable).toContain("progress is saved");
  });

  it("leaks no implementation, migration or deployment detail", () => {
    for (const leak of [
      "database",
      "migration",
      "deploy",
      "endpoint",
      "server",
      "supabase",
      "mission_steps",
      "500",
      "503",
      "error code",
      "DEPENDENCY_UNAVAILABLE",
      "content_error"
    ]) {
      expect(unavailable.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it("does not tell the learner a feature is missing or unfinished", () => {
    for (const leak of [
      "not available yet",
      "coming soon",
      "not yet",
      "unfinished",
      "future",
      "beta"
    ]) {
      expect(unavailable.toLowerCase()).not.toContain(leak);
    }
  });

  it("distinguishes a command from its result in words", () => {
    expect(describeCommandLabel()).not.toBe(describeCommandOutputLabel());
    expect(describeCommandLabel().trim()).not.toBe("");
    expect(describeCommandOutputLabel().trim()).not.toBe("");
  });

  it("names a practice checkpoint without naming an assessment", () => {
    expect(describePracticeCheckpointLabel()).toBe("Practice checkpoint");
  });

  it("restates the established practice guarantee", () => {
    const wording = describePracticeCheckpoint();
    expect(wording).toContain("not recorded");
    expect(wording).toContain("does not count towards any competency");
  });

  it("promises no practice control that does not exist", () => {
    const wording = describePracticeCheckpoint().toLowerCase();
    for (const leak of ["click", "button", "start now", "launch", "open the"]) {
      expect(wording).not.toContain(leak);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Assets
 * ------------------------------------------------------------------ */

describe("asset lookup", () => {
  const index = buildAssetIndex([DIAGRAM_ASSET]);

  it("resolves an asset by the identity a step names", () => {
    expect(resolveAsset(index, "two-host-topology")).toEqual(DIAGRAM_ASSET);
  });

  it("returns nothing for an unknown identity", () => {
    expect(resolveAsset(index, "missing")).toBeUndefined();
  });

  it("returns nothing when a step names no asset", () => {
    expect(resolveAsset(index, undefined)).toBeUndefined();
  });

  it("keeps the depiction and the teaching as separate fields", () => {
    // altText answers "what does this depict"; a step's textAlternative
    // answers "what does this teach here". Neither may stand in for the other.
    const diagram = step({
      type: "diagram",
      assetStableId: "two-host-topology",
      textAlternative: "Two hosts, one switch, so no router is involved."
    });
    const asset = resolveAsset(index, "two-host-topology");

    expect(asset?.altText).toBe(DIAGRAM_ASSET.altText);
    expect(diagram.content).toHaveProperty("textAlternative");
    expect(asset?.altText).not.toBe(
      (diagram.content as { textAlternative: string }).textAlternative
    );
  });
});

describe("reference destinations", () => {
  const index = buildAssetIndex([DIAGRAM_ASSET]);

  it("prefers an authored URI", () => {
    expect(
      resolveReferenceHref(index, { uri: "https://example.test/rfc1918" })
    ).toBe("https://example.test/rfc1918");
  });

  it("falls back to the named asset's own location", () => {
    expect(
      resolveReferenceHref(index, { assetStableId: "two-host-topology" })
    ).toBe(DIAGRAM_ASSET.uri);
  });

  it("resolves to nothing when neither is present", () => {
    expect(resolveReferenceHref(index, {})).toBeUndefined();
  });

  it("resolves to nothing when the named asset is absent", () => {
    expect(
      resolveReferenceHref(index, { assetStableId: "missing" })
    ).toBeUndefined();
  });

  it("never returns the stable identity itself as a destination", () => {
    expect(
      resolveReferenceHref(index, { assetStableId: "two-host-topology" })
    ).not.toBe("two-host-topology");
  });
});

/* ------------------------------------------------------------------ *
 * The closed vocabulary
 * ------------------------------------------------------------------ */

describe("the seven approved step types", () => {
  const samples: Record<string, LearnerMissionStepContent> = {
    concept: { type: "concept", paragraphs: ["Text."] },
    diagram: {
      type: "diagram",
      assetStableId: "two-host-topology",
      textAlternative: "Two hosts, one switch."
    },
    command: { type: "command", command: "show vlan brief" },
    prediction: { type: "prediction", prompt: "What happens?" },
    interaction: {
      type: "interaction",
      interactionStableId: "subnet-slider",
      textEquivalent: "Adjust the prefix length and read the host count."
    },
    practice: { type: "practice", assessmentStableId: "assess.vlan-basics" },
    reference: { type: "reference", label: "RFC 1918" }
  };

  it("covers exactly the shared vocabulary, with no eighth type", () => {
    expect(Object.keys(samples).sort()).toEqual([...MISSION_STEP_TYPES].sort());
  });

  it("carries every type through source selection unchanged", () => {
    const steps = Object.values(samples).map((content, index) =>
      step(content, index + 1)
    );

    const source = expectKind(
      selectInstructionSource({
        loading: false,
        response: response({ state: "available", steps, assets: [] }),
        errorCode: null
      }),
      "structured"
    );

    expect(source.steps.map((entry) => entry.content.type).sort()).toEqual(
      [...MISSION_STEP_TYPES].sort()
    );
  });

  it("preserves an interaction's authored text equivalent", () => {
    const source = expectKind(
      selectInstructionSource({
        loading: false,
        response: response({
          state: "available",
          steps: [step(samples.interaction as LearnerMissionStepContent)],
          assets: []
        }),
        errorCode: null
      }),
      "structured"
    );

    const content = source.steps[0]?.content;
    expect(content).toMatchObject({
      type: "interaction",
      textEquivalent: "Adjust the prefix length and read the host count."
    });
  });
});

/* ------------------------------------------------------------------ *
 * Protected content
 * ------------------------------------------------------------------ */

describe("protected content stays unreachable", () => {
  it("exposes no expectedOutcome on a prediction that crosses this layer", () => {
    const source = expectKind(
      selectInstructionSource({
        loading: false,
        response: response({
          state: "available",
          steps: [
            step({
              type: "prediction",
              prompt: "What will ping report?",
              options: ["Reply", "Timeout"]
            })
          ],
          assets: []
        }),
        errorCode: null
      }),
      "structured"
    );

    const content = source.steps[0]?.content as unknown as Record<
      string,
      unknown
    >;
    expect("expectedOutcome" in content).toBe(false);
    expect(JSON.stringify(source)).not.toContain("expectedOutcome");
  });

  it("offers no reveal or commitment path for a prediction", () => {
    const wording = [
      describeInstructionUnavailable(),
      describePracticeCheckpoint(),
      describeCommandLabel(),
      describeCommandOutputLabel()
    ].join(" ");

    for (const leak of ["answer", "correct", "reveal", "expected"]) {
      expect(wording.toLowerCase()).not.toContain(leak);
    }
  });

  it("carries no question, option, answer or score on a practice step", () => {
    const source = expectKind(
      selectInstructionSource({
        loading: false,
        response: response({
          state: "available",
          steps: [
            step({
              type: "practice",
              assessmentStableId: "assess.vlan-basics",
              framing: "Check what you just read."
            })
          ],
          assets: []
        }),
        errorCode: null
      }),
      "structured"
    );

    const content = source.steps[0]?.content as unknown as Record<
      string,
      unknown
    >;
    for (const forbidden of [
      "questions",
      "options",
      "answer",
      "answerKey",
      "correctOption",
      "score",
      "passingScore"
    ]) {
      expect(forbidden in content).toBe(false);
    }
  });

  it("never renders an assessment identity through the practice wording", () => {
    const wording = `${describePracticeCheckpointLabel()} ${describePracticeCheckpoint()}`;
    expect(wording).not.toContain("assess.");
    expect(wording).not.toContain("assessmentStableId");
  });
});
