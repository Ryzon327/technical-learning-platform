import { describe, expect, it } from "vitest";
import {
  assembleLearnerInstruction,
  projectCurriculumAsset,
  projectMissionStep,
  projectMissionStepContent,
  type LearnerMissionInstruction
} from "./mission-instruction";
import { MISSION_STEP_TYPES, type MissionStep } from "./mission-steps";
import type { CurriculumAssetReference } from "./curriculum-assets";

/**
 * WP-E — the learner projection, proven at the only level where it can be
 * proven exhaustively: pure functions, no HTTP, no database.
 *
 * The withholding tests below do not check that a field was filtered. They
 * check that it is ABSENT from the produced object, using `in` and
 * `Object.keys`, because a property present with value `undefined` still
 * appears in a serialised response under some encoders and would satisfy a
 * naive `toBeUndefined()`.
 */

function step(content: MissionStep["content"], position = 1): MissionStep {
  return { stableId: `step-${position}`, position, content };
}

const diagramAsset: CurriculumAssetReference = {
  id: "11111111-1111-1111-1111-111111111111",
  missionId: "22222222-2222-2222-2222-222222222222",
  stableId: "two-host-topology",
  assetType: "diagram",
  title: "Two hosts on one switch",
  uri: "https://cdn.example.test/two-host-topology.svg",
  position: 1,
  required: true,
  altText: "Two workstations connected to a single switch."
};

describe("prediction expectedOutcome is structurally withheld", () => {
  const authored = step({
    type: "prediction",
    prompt: "What will ping report?",
    options: ["Reply", "Timeout"],
    expectedOutcome: "Timeout, because the hosts are in different VLANs."
  });

  it("omits the property entirely rather than nulling or blanking it", () => {
    const projected = projectMissionStepContent(authored.content);

    expect("expectedOutcome" in projected).toBe(false);
    expect(Object.keys(projected)).toEqual(["type", "prompt", "options"]);
  });

  it("leaves no trace of the answer anywhere in the serialised step", () => {
    const serialised = JSON.stringify(projectMissionStep(authored));

    expect(serialised).not.toContain("expectedOutcome");
    expect(serialised).not.toContain("different VLANs");
  });

  it("still carries the prompt and the options a learner needs", () => {
    const projected = projectMissionStepContent(authored.content);

    expect(projected).toEqual({
      type: "prediction",
      prompt: "What will ping report?",
      options: ["Reply", "Timeout"]
    });
  });

  it("omits options when the author supplied none", () => {
    const projected = projectMissionStepContent({
      type: "prediction",
      prompt: "What will happen?"
    });

    expect("options" in projected).toBe(false);
  });
});

describe("practice stays a reference and resolves nothing", () => {
  it("carries only the assessment identity and its framing", () => {
    const projected = projectMissionStepContent({
      type: "practice",
      assessmentStableId: "assess.vlan-basics",
      framing: "Check what you just learned."
    });

    expect(projected).toEqual({
      type: "practice",
      assessmentStableId: "assess.vlan-basics",
      framing: "Check what you just learned."
    });
  });

  it("introduces no question, option, answer or score field", () => {
    const projected = projectMissionStepContent({
      type: "practice",
      assessmentStableId: "assess.vlan-basics"
    });

    for (const forbidden of [
      "questions",
      "options",
      "answer",
      "answerKey",
      "correctOption",
      "score",
      "passingScore"
    ]) {
      expect(forbidden in projected).toBe(false);
    }
  });
});

describe("accessibility text survives the projection", () => {
  it("carries a diagram's textAlternative", () => {
    const projected = projectMissionStepContent({
      type: "diagram",
      assetStableId: "two-host-topology",
      caption: "Figure 1",
      textAlternative: "Two hosts, one switch, no router."
    });

    expect(projected).toEqual({
      type: "diagram",
      assetStableId: "two-host-topology",
      caption: "Figure 1",
      textAlternative: "Two hosts, one switch, no router."
    });
  });

  it("carries an interaction's textEquivalent", () => {
    const projected = projectMissionStepContent({
      type: "interaction",
      interactionStableId: "subnet-slider",
      textEquivalent: "Adjust the prefix length and read the host count."
    });

    expect(projected).toEqual({
      type: "interaction",
      interactionStableId: "subnet-slider",
      textEquivalent: "Adjust the prefix length and read the host count."
    });
  });

  it("carries an asset's altText", () => {
    expect(projectCurriculumAsset(diagramAsset)?.altText).toBe(
      "Two workstations connected to a single switch."
    );
  });
});

describe("the projection is exhaustive over the approved step types", () => {
  const samples: Record<string, MissionStep["content"]> = {
    concept: { type: "concept", paragraphs: ["A VLAN is a broadcast domain."] },
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
      textEquivalent: "Adjust the prefix length."
    },
    practice: { type: "practice", assessmentStableId: "assess.vlan-basics" },
    reference: { type: "reference", label: "RFC 1918" }
  };

  it("covers every type in MISSION_STEP_TYPES and no others", () => {
    expect(Object.keys(samples).sort()).toEqual([...MISSION_STEP_TYPES].sort());
  });

  for (const [type, content] of Object.entries(samples)) {
    it(`preserves the discriminator for ${type}`, () => {
      expect(projectMissionStepContent(content).type).toBe(type);
    });
  }
});

describe("internal identity does not cross the boundary", () => {
  it("drops the asset row id, missionId, position and required", () => {
    const projected = projectCurriculumAsset(diagramAsset);

    expect(Object.keys(projected ?? {}).sort()).toEqual([
      "altText",
      "assetType",
      "stableId",
      "title",
      "uri"
    ]);
  });

  it("refuses to project a legacy asset that has no stable identity", () => {
    expect(
      projectCurriculumAsset({ ...diagramAsset, stableId: undefined })
    ).toBeUndefined();
  });

  it("keeps a step's authored identity and position", () => {
    const projected = projectMissionStep(
      step({ type: "concept", paragraphs: ["Text."] }, 3)
    );

    expect(projected.stableId).toBe("step-3");
    expect(projected.position).toBe(3);
    expect("id" in projected).toBe(false);
    expect("missionId" in projected).toBe(false);
  });
});

describe("assembleLearnerInstruction", () => {
  function available(
    instruction: LearnerMissionInstruction
  ): Extract<LearnerMissionInstruction, { state: "available" }> {
    if (instruction.state !== "available") {
      throw new Error(`expected available, received ${instruction.state}`);
    }
    return instruction;
  }

  it("returns steps in authored order, not array order", () => {
    const instruction = available(
      assembleLearnerInstruction(
        [
          step({ type: "concept", paragraphs: ["Third."] }, 3),
          step({ type: "concept", paragraphs: ["First."] }, 1),
          step({ type: "concept", paragraphs: ["Second."] }, 2)
        ],
        []
      )
    );

    expect(instruction.steps.map((entry) => entry.position)).toEqual([1, 2, 3]);
  });

  it("returns only the assets its steps reference", () => {
    const unreferenced: CurriculumAssetReference = {
      ...diagramAsset,
      id: "33333333-3333-3333-3333-333333333333",
      stableId: "unused-diagram",
      position: 2
    };

    const instruction = available(
      assembleLearnerInstruction(
        [
          step({
            type: "diagram",
            assetStableId: "two-host-topology",
            textAlternative: "Two hosts, one switch."
          })
        ],
        [diagramAsset, unreferenced]
      )
    );

    expect(instruction.assets.map((asset) => asset.stableId)).toEqual([
      "two-host-topology"
    ]);
  });

  it("fails the whole mission when a referenced asset does not resolve", () => {
    const instruction = assembleLearnerInstruction(
      [
        step({ type: "concept", paragraphs: ["Intro."] }, 1),
        step(
          {
            type: "diagram",
            assetStableId: "missing-diagram",
            textAlternative: "Two hosts, one switch."
          },
          2
        )
      ],
      [diagramAsset]
    );

    expect(instruction).toEqual({ state: "content_error" });
  });

  it("does not return the surviving steps when one reference fails", () => {
    const instruction = assembleLearnerInstruction(
      [
        step({ type: "concept", paragraphs: ["Intro."] }, 1),
        step(
          {
            type: "diagram",
            assetStableId: "missing-diagram",
            textAlternative: "Two hosts, one switch."
          },
          2
        )
      ],
      [diagramAsset]
    );

    expect("steps" in instruction).toBe(false);
    expect("assets" in instruction).toBe(false);
  });

  it("ignores a legacy asset carrying no stable id", () => {
    const legacy = { ...diagramAsset, stableId: undefined };

    const instruction = assembleLearnerInstruction(
      [
        step({
          type: "diagram",
          assetStableId: "two-host-topology",
          textAlternative: "Two hosts, one switch."
        })
      ],
      [legacy]
    );

    expect(instruction).toEqual({ state: "content_error" });
  });

  it("resolves a reference step's optional asset when it names one", () => {
    const instruction = available(
      assembleLearnerInstruction(
        [step({ type: "reference", label: "Topology", assetStableId: "two-host-topology" })],
        [diagramAsset]
      )
    );

    expect(instruction.assets).toHaveLength(1);
  });

  it("returns no assets for a mission whose steps reference none", () => {
    const instruction = available(
      assembleLearnerInstruction(
        [step({ type: "concept", paragraphs: ["Text only."] })],
        [diagramAsset]
      )
    );

    expect(instruction.assets).toEqual([]);
  });

  it("carries no diagnostic detail on content_error", () => {
    const instruction = assembleLearnerInstruction(
      [
        step({
          type: "diagram",
          assetStableId: "missing-diagram",
          textAlternative: "Two hosts."
        })
      ],
      []
    );

    expect(Object.keys(instruction)).toEqual(["state"]);
  });

  it("withholds expectedOutcome through the assembled instruction too", () => {
    const instruction = assembleLearnerInstruction(
      [
        step({
          type: "prediction",
          prompt: "What will ping report?",
          expectedOutcome: "Timeout."
        })
      ],
      []
    );

    expect(JSON.stringify(instruction)).not.toContain("expectedOutcome");
  });
});
