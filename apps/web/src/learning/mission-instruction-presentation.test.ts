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
  type InstructionSource,
  type MissionInstructionRequest
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

/** The mission the learner has open in most tests. */
const MISSION_A = MISSION.stableId;
/** A second mission, used to prove one mission's state cannot reach another. */
const MISSION_B = "mission.trunking";

function response(
  instruction: LearnerMissionInstructionResponse["instruction"],
  missionStableId: string = MISSION.stableId
): LearnerMissionInstructionResponse {
  return {
    mission: { ...MISSION, stableId: missionStableId },
    instruction
  };
}

/* One request in each of its four statuses, tagged with the mission it is
   about. The tag is the whole point: see the module comment on
   MissionInstructionRequest. */

function idle(): MissionInstructionRequest {
  return { status: "idle" };
}

function loadingFor(missionStableId: string): MissionInstructionRequest {
  return { status: "loading", missionStableId };
}

function loadedFor(
  missionStableId: string,
  instruction: LearnerMissionInstructionResponse["instruction"]
): MissionInstructionRequest {
  return {
    status: "loaded",
    missionStableId,
    response: response(instruction, missionStableId)
  };
}

function errorFor(
  missionStableId: string,
  errorCode: string
): MissionInstructionRequest {
  return { status: "error", missionStableId, errorCode };
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
 * Mission scoping — the architecture-review regression
 *
 * The defect this guards against was a stale READ, not a stale write. An
 * effect runs after the render that scheduled it, so clearing state when the
 * selection changes leaves one render in which the previous mission's response
 * is still present and still consumable. An AbortController does not help: it
 * stops a late response arriving, and this response had already arrived.
 *
 * The fix is that state carries the mission it belongs to and the selector is
 * told which mission it is being asked about. These tests pin that invariant
 * for every status a request can hold.
 * ------------------------------------------------------------------ */

describe("instruction state is scoped to the mission it belongs to", () => {
  it("does not render mission A's structured instruction for mission B", () => {
    const source = selectInstructionSource(
      loadedFor(MISSION_A, {
        state: "available",
        steps: [CONCEPT],
        assets: []
      }),
      MISSION_B
    );

    expect(source.kind).not.toBe("structured");
    expectKind(source, "bundled");
  });

  it("leaks none of mission A's steps or assets into mission B's source", () => {
    const source = selectInstructionSource(
      loadedFor(MISSION_A, {
        state: "available",
        steps: [
          step({
            type: "concept",
            paragraphs: ["Mission A's own instructional text."]
          })
        ],
        assets: [DIAGRAM_ASSET]
      }),
      MISSION_B
    );

    expect("steps" in source).toBe(false);
    expect("assets" in source).toBe(false);
    expect(JSON.stringify(source)).not.toContain("Mission A's own");
    expect(JSON.stringify(source)).not.toContain(DIAGRAM_ASSET.uri);
  });

  it("does not render mission A's legacy brief for mission B", () => {
    const source = selectInstructionSource(
      loadedFor(MISSION_A, {
        state: "legacy_brief",
        description: "Mission A's authored brief."
      }),
      MISSION_B
    );

    expectKind(source, "bundled");
    expect(JSON.stringify(source)).not.toContain("Mission A's authored brief.");
  });

  it("does not blank mission B because mission A's content is broken", () => {
    // A content_error belongs to the mission that has it. Applying it to
    // another mission would hide a healthy mission behind an unrelated defect.
    const source = selectInstructionSource(
      loadedFor(MISSION_A, { state: "content_error" }),
      MISSION_B
    );

    expect(source.kind).not.toBe("unavailable");
    expectKind(source, "bundled");
  });

  it("does not apply mission A's non-recoverable failure to mission B", () => {
    const source = selectInstructionSource(
      errorFor(MISSION_A, "INTERNAL_ERROR"),
      MISSION_B
    );

    expect(source.kind).not.toBe("unavailable");
    expectKind(source, "bundled");
  });

  it("does not treat mission A's in-flight request as mission B's", () => {
    expectKind(
      selectInstructionSource(loadingFor(MISSION_A), MISSION_B),
      "bundled"
    );
  });

  it("treats another mission's state exactly as never having asked", () => {
    const neverAsked = selectInstructionSource(idle(), MISSION_B);

    for (const foreign of [
      loadedFor(MISSION_A, { state: "available", steps: [CONCEPT], assets: [] }),
      loadedFor(MISSION_A, { state: "content_error" }),
      loadedFor(MISSION_A, { state: "legacy_brief", description: "Brief." }),
      errorFor(MISSION_A, "INTERNAL_ERROR"),
      errorFor(MISSION_A, "DEPENDENCY_UNAVAILABLE"),
      loadingFor(MISSION_A)
    ]) {
      expect(selectInstructionSource(foreign, MISSION_B)).toEqual(neverAsked);
    }
  });

  it("still renders a mission's own state when the identities match", () => {
    // The positive control: scoping must not suppress the correct answer.
    expectKind(
      selectInstructionSource(
        loadedFor(MISSION_B, {
          state: "available",
          steps: [CONCEPT],
          assets: []
        }),
        MISSION_B
      ),
      "structured"
    );
  });

  it("switches to the new mission's own answer once it arrives", () => {
    const available = {
      state: "available",
      steps: [CONCEPT],
      assets: []
    } as const;

    expectKind(
      selectInstructionSource(loadedFor(MISSION_A, available), MISSION_B),
      "bundled"
    );
    expectKind(
      selectInstructionSource(loadedFor(MISSION_B, available), MISSION_B),
      "structured"
    );
  });
});

/* ------------------------------------------------------------------ *
 * Source selection
 * ------------------------------------------------------------------ */

describe("selectInstructionSource", () => {
  it("selects structured instruction when WP-E says available", () => {
    const source = expectKind(
      selectInstructionSource(
        loadedFor(MISSION_A, {
          state: "available",
          steps: [CONCEPT],
          assets: [DIAGRAM_ASSET]
        }),
        MISSION_A
      ),
      "structured"
    );

    expect(source.steps).toHaveLength(1);
    expect(source.assets).toHaveLength(1);
  });

  it("selects the server legacy brief when WP-E says legacy_brief", () => {
    const source = expectKind(
      selectInstructionSource(
        loadedFor(MISSION_A, {
          state: "legacy_brief",
          description: "First block.\n\nSecond block."
        }),
        MISSION_A
      ),
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
      selectInstructionSource(
        loadedFor(MISSION_A, { state: "legacy_brief", description }),
        MISSION_A
      ),
      "legacy"
    );

    expect(source.blocks).toEqual(parseMissionBrief(description));
  });

  it("selects the bundled brief while the request is in flight", () => {
    expectKind(
      selectInstructionSource(loadingFor(MISSION_A), MISSION_A),
      "bundled"
    );
  });

  it("selects the bundled brief before a request has been made", () => {
    expectKind(
      selectInstructionSource(idle(), MISSION_A),
      "bundled"
    );
  });

  it("is authoritative once a response replaces the loading state", () => {
    // A request holds one status at a time, so a delivered response cannot
    // coexist with a loading flag. The combination is now unrepresentable
    // rather than merely handled correctly.
    expectKind(
      selectInstructionSource(loadingFor(MISSION_A), MISSION_A),
      "bundled"
    );
    expectKind(
      selectInstructionSource(
        loadedFor(MISSION_A, {
          state: "available",
          steps: [CONCEPT],
          assets: []
        }),
        MISSION_A
      ),
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
        selectInstructionSource(errorFor(MISSION_A, code), MISSION_A),
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
        selectInstructionSource(errorFor(MISSION_A, code), MISSION_A),
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
      selectInstructionSource(errorFor(MISSION_A, "UNAUTHORIZED"), MISSION_A),
      "unavailable"
    );

    expect(source.message).toBe(describeInstructionUnavailable());
  });
});

/* ------------------------------------------------------------------ *
 * content_error never falls back
 * ------------------------------------------------------------------ */

describe("content_error", () => {
  const contentError = selectInstructionSource(
    loadedFor(MISSION_A, { state: "content_error" }),
    MISSION_A
  );

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

  it("is not reopened by an earlier fallback-eligible failure", () => {
    // A request holds one status, so a delivered content_error replaces an
    // earlier error rather than sitting beside it. A stale code cannot reopen
    // the fallback path.
    expectKind(
      selectInstructionSource(
        errorFor(MISSION_A, "DEPENDENCY_UNAVAILABLE"),
        MISSION_A
      ),
      "bundled"
    );
    expectKind(
      selectInstructionSource(
        loadedFor(MISSION_A, { state: "content_error" }),
        MISSION_A
      ),
      "unavailable"
    );
  });
});

/* ------------------------------------------------------------------ *
 * Exactly one source, always
 * ------------------------------------------------------------------ */

describe("only one instructional source is ever selected", () => {
  const AVAILABLE = {
    state: "available",
    steps: [CONCEPT],
    assets: []
  } as const;

  // Every status, asked about its own mission and about another one.
  const cases: ReadonlyArray<readonly [MissionInstructionRequest, string]> = [
    [idle(), MISSION_A],
    [loadingFor(MISSION_A), MISSION_A],
    [errorFor(MISSION_A, "DEPENDENCY_UNAVAILABLE"), MISSION_A],
    [errorFor(MISSION_A, "INTERNAL_ERROR"), MISSION_A],
    [errorFor(MISSION_A, "NOT_FOUND"), MISSION_A],
    [loadedFor(MISSION_A, AVAILABLE), MISSION_A],
    [
      loadedFor(MISSION_A, { state: "legacy_brief", description: "Brief." }),
      MISSION_A
    ],
    [loadedFor(MISSION_A, { state: "content_error" }), MISSION_A],
    [idle(), MISSION_B],
    [loadingFor(MISSION_A), MISSION_B],
    [errorFor(MISSION_A, "DEPENDENCY_UNAVAILABLE"), MISSION_B],
    [errorFor(MISSION_A, "INTERNAL_ERROR"), MISSION_B],
    [loadedFor(MISSION_A, AVAILABLE), MISSION_B],
    [
      loadedFor(MISSION_A, { state: "legacy_brief", description: "Brief." }),
      MISSION_B
    ],
    [loadedFor(MISSION_A, { state: "content_error" }), MISSION_B]
  ];

  it("returns exactly one known kind for every input combination", () => {
    for (const [request, missionStableId] of cases) {
      const source = selectInstructionSource(request, missionStableId);
      expect(["structured", "legacy", "bundled", "unavailable"]).toContain(
        source.kind
      );
    }
  });

  it("never returns structured steps together with brief blocks", () => {
    for (const [request, missionStableId] of cases) {
      const source = selectInstructionSource(request, missionStableId);
      const hasSteps = "steps" in source;
      const hasBlocks = "blocks" in source;
      expect(hasSteps && hasBlocks).toBe(false);
    }
  });

  it("carries brief blocks only on the legacy kind", () => {
    for (const [request, missionStableId] of cases) {
      const source = selectInstructionSource(request, missionStableId);
      if ("blocks" in source) expect(source.kind).toBe("legacy");
    }
  });

  it("carries content only for the mission that owns it", () => {
    for (const [request, missionStableId] of cases) {
      const source = selectInstructionSource(request, missionStableId);
      if ("steps" in source || "blocks" in source) {
        expect(request.status).toBe("loaded");
        if (request.status === "loaded") {
          expect(request.missionStableId).toBe(missionStableId);
        }
      }
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
      interactionStableId: "packet-journey",
      interactionType: "packet_journey",
      sourceKind: "authored_teaching",
      supportLevel: "show_me",
      textEquivalent: "Follow the request hop by hop and see where it stops.",
      presentation: { state: "withheld", reason: "protected_demonstration" }
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
      selectInstructionSource(
        loadedFor(MISSION_A, { state: "available", steps, assets: [] }),
        MISSION_A
      ),
      "structured"
    );

    expect(source.steps.map((entry) => entry.content.type).sort()).toEqual(
      [...MISSION_STEP_TYPES].sort()
    );
  });

  it("preserves an interaction's authored text equivalent", () => {
    const source = expectKind(
      selectInstructionSource(
        loadedFor(MISSION_A, {
          state: "available",
          steps: [step(samples.interaction as LearnerMissionStepContent)],
          assets: []
        }),
        MISSION_A
      ),
      "structured"
    );

    const content = source.steps[0]?.content;
    expect(content).toMatchObject({
      type: "interaction",
      textEquivalent: "Follow the request hop by hop and see where it stops."
    });
  });

  it("carries the text equivalent even when the interaction is withheld", () => {
    // The sample is authored at PROVE IT, where the interaction itself is
    // withheld. Accessibility is an accommodation rather than tutoring, so the
    // authored account survives the withholding (DEC-059).
    const source = expectKind(
      selectInstructionSource(
        loadedFor(MISSION_A, {
          state: "available",
          steps: [step(samples.interaction as LearnerMissionStepContent)],
          assets: []
        }),
        MISSION_A
      ),
      "structured"
    );

    const content = source.steps[0]?.content as Extract<
      LearnerMissionStepContent,
      { type: "interaction" }
    >;

    expect(content.presentation.state).toBe("withheld");
    expect(content.textEquivalent.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * Protected content
 * ------------------------------------------------------------------ */

describe("protected content stays unreachable", () => {
  it("exposes no expectedOutcome on a prediction that crosses this layer", () => {
    const source = expectKind(
      selectInstructionSource(
        loadedFor(MISSION_A, {
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
        MISSION_A
      ),
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
      selectInstructionSource(
        loadedFor(MISSION_A, {
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
        MISSION_A
      ),
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
