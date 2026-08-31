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
import type {
  InteractionParameters,
  InteractionSupportLevel
} from "./instruction-interaction";

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

/**
 * An authored packet journey WITH a fault and a resolving action, so the
 * support-level tests below have both protected fields to check:
 * `stages[].decision` and `fault.explanation`.
 */
const packetJourneyFixture: InteractionParameters = {
  interactionType: "packet_journey",
  nodes: [
    {
      nodeId: "pc-a",
      label: "PC-A",
      role: "host",
      interfaces: [
        {
          interfaceId: "pc-a-eth0",
          label: "eth0",
          attributes: [{ label: "IP address", value: "192.168.10.10/24" }]
        }
      ]
    },
    {
      nodeId: "r-1",
      label: "Router-1",
      role: "router",
      interfaces: [
        {
          interfaceId: "r-1-gi0-0-10",
          label: "Gi0/0.10",
          attributes: [{ label: "VLAN", value: "10" }]
        }
      ]
    }
  ],
  links: [
    {
      linkId: "link-a",
      label: "PC-A to Router-1",
      endpoints: ["pc-a-eth0", "r-1-gi0-0-10"]
    }
  ],
  traffic: {
    label: "an ICMP echo request",
    sourceNodeId: "pc-a",
    destinationNodeId: "r-1",
    startActionLabel: "Send the ping"
  },
  stages: [
    {
      stageId: "s1",
      atNodeId: "pc-a",
      narration: "PC-A sends the request towards its gateway.",
      decision: "The destination is on another network, so it uses the gateway.",
      outcome: "proceeds"
    },
    {
      stageId: "s2",
      atNodeId: "r-1",
      narration: "The frame arrives at Router-1 and is discarded.",
      decision: "The subinterface for VLAN 20 does not exist, so there is no route.",
      outcome: "stops",
      prediction: {
        prompt: "What will Router-1 do with this frame?",
        options: ["Forward it to VLAN 20", "Discard it"]
      }
    }
  ],
  fault: {
    atNodeId: "r-1",
    symptom: "The ping reports 100% packet loss.",
    stopsAtStageId: "s2",
    explanation: "Router-1 has no subinterface configured for VLAN 20."
  },
  actions: [
    {
      actionId: "add-vlan-20",
      label: "Add the VLAN 20 subinterface on Router-1",
      resolvesFault: true,
      observation: "Router-1 now has an interface in VLAN 20 and forwards the frame."
    },
    {
      actionId: "restart-pc-a",
      label: "Restart PC-A",
      resolvesFault: false,
      observation: "PC-A comes back up and the ping still reports 100% packet loss."
    }
  ],
  confirmation: {
    narration: "The echo request reaches PC-B and the reply returns.",
    summary: "Router-on-a-stick needs one subinterface per VLAN."
  }
};

function interactionAt(supportLevel: InteractionSupportLevel): MissionStep {
  return step({
    type: "interaction",
    interactionStableId: "packet-journey",
    interactionType: "packet_journey",
    sourceKind: "authored_teaching",
    supportLevel,
    parameters: packetJourneyFixture,
    textEquivalent: "Follow the request hop by hop and see where it stops."
  });
}

describe("interaction support levels are enforced in the projection", () => {
  it("shows the expected path and the fault explanation at SHOW ME", () => {
    const projected = projectMissionStep(interactionAt("show_me"));
    const content = projected.content as Extract<
      typeof projected.content,
      { type: "interaction" }
    >;

    expect(content.presentation.state).toBe("available");
    if (content.presentation.state !== "available") return;

    const parameters = content.presentation.parameters;
    expect(parameters.stages[1]?.decision).toContain("VLAN 20");
    expect(parameters.fault?.explanation).toContain("subinterface");
  });

  for (const level of ["help_me", "ask_me"] as const) {
    it(`still shows answer-revealing teaching at ${level}`, () => {
      const projected = projectMissionStep(interactionAt(level));
      const content = projected.content as Extract<
        typeof projected.content,
        { type: "interaction" }
      >;

      if (content.presentation.state !== "available") {
        throw new Error("expected an available interaction");
      }

      expect(content.presentation.parameters.fault?.explanation).toBeDefined();
    });
  }

  it("withholds the expected path and the explanation at CHALLENGE ME", () => {
    const projected = projectMissionStep(interactionAt("challenge_me"));
    const content = projected.content as Extract<
      typeof projected.content,
      { type: "interaction" }
    >;

    if (content.presentation.state !== "available") {
      throw new Error("expected an available interaction");
    }

    const parameters = content.presentation.parameters;

    // ABSENT, not undefined. A property carrying `undefined` still appears in
    // some serialisations and would satisfy a naive assertion.
    for (const stage of parameters.stages) {
      expect("decision" in stage).toBe(false);
    }
    expect(parameters.fault).toBeDefined();
    expect("explanation" in (parameters.fault ?? {})).toBe(false);
  });

  it("withholds the answer-bearing remediation and conclusion at CHALLENGE ME", () => {
    // The architecture-review correction. Every authored action names whether
    // it resolves the fault and what it produces, and the confirmation states
    // the lesson's answer. Shipping them and not drawing them is not
    // withholding, because the response is readable.
    const projected = projectMissionStep(interactionAt("challenge_me"));
    const content = projected.content as Extract<
      typeof projected.content,
      { type: "interaction" }
    >;

    if (content.presentation.state !== "available") {
      throw new Error("expected an available interaction");
    }

    const parameters = content.presentation.parameters;

    expect("actions" in parameters).toBe(false);
    expect("confirmation" in parameters).toBe(false);
  });

  it("keeps the environment, the symptom and the prediction at CHALLENGE ME", () => {
    // DEC-059: withholding assistance must never remove the means of
    // demonstrating. A legitimate observation is not tutoring merely because
    // it describes system state.
    const projected = projectMissionStep(interactionAt("challenge_me"));
    const content = projected.content as Extract<
      typeof projected.content,
      { type: "interaction" }
    >;

    if (content.presentation.state !== "available") {
      throw new Error("expected an available interaction");
    }

    const parameters = content.presentation.parameters;

    expect(parameters.nodes).toHaveLength(2);
    expect(parameters.nodes[0]?.interfaces[0]?.attributes).toHaveLength(1);
    expect(parameters.links).toHaveLength(1);
    expect(parameters.traffic.label).toBe("an ICMP echo request");
    expect(parameters.fault?.symptom).toContain("packet loss");
    expect(parameters.stages.every((stage) => stage.narration !== "")).toBe(true);
    expect(parameters.stages[1]?.prediction?.options).toHaveLength(2);
  });

  it("withholds the whole teaching interaction at PROVE IT", () => {
    const projected = projectMissionStep(interactionAt("prove_it"));
    const content = projected.content as Extract<
      typeof projected.content,
      { type: "interaction" }
    >;

    expect(content.presentation).toEqual({
      state: "withheld",
      reason: "protected_demonstration"
    });

    // No parameters crossed the wire at all, so no authored fault, decision,
    // action or narration can be read out of the response.
    expect(JSON.stringify(content)).not.toContain("subinterface");
    expect(JSON.stringify(content)).not.toContain("packet loss");
  });

  it("keeps the accessible text equivalent at PROVE IT", () => {
    // Accessibility is an accommodation, not tutoring (DEC-059). It does not
    // disappear when instructional assistance does.
    const projected = projectMissionStep(interactionAt("prove_it"));
    const content = projected.content as Extract<
      typeof projected.content,
      { type: "interaction" }
    >;

    expect(content.textEquivalent).toContain("Follow the request");
  });

  it("leaks no protected authored string into the CHALLENGE ME response", () => {
    // The assertion the architecture review asked for: serialise what actually
    // crosses the wire and search it, rather than trusting property names.
    const serialised = JSON.stringify(
      projectMissionStep(interactionAt("challenge_me"))
    );

    const protectedStrings = [
      // stage.decision — the expected path
      "The destination is on another network, so it uses the gateway.",
      "The subinterface for VLAN 20 does not exist, so there is no route.",
      // fault.explanation — the diagnosis
      "Router-1 has no subinterface configured for VLAN 20.",
      // action labels and observations — which fix works, and what it does
      "Add the VLAN 20 subinterface on Router-1",
      "Router-1 now has an interface in VLAN 20 and forwards the frame.",
      "PC-A comes back up and the ping still reports 100% packet loss.",
      // confirmation — the conclusion, in plain words
      "The echo request reaches PC-B and the reply returns.",
      "Router-on-a-stick needs one subinterface per VLAN."
    ];

    for (const leaked of protectedStrings) {
      expect(serialised).not.toContain(leaked);
    }

    // The answer-key field name must be gone with them.
    expect(serialised).not.toContain("resolvesFault");
  });

  it("still carries the legitimate observations in the CHALLENGE ME response", () => {
    // The other half of the same assertion. Over-withholding would remove the
    // means of demonstrating, which DEC-059 forbids just as clearly.
    const serialised = JSON.stringify(
      projectMissionStep(interactionAt("challenge_me"))
    );

    for (const kept of [
      "The ping reports 100% packet loss.",
      "The frame arrives at Router-1 and is discarded.",
      "PC-A sends the request towards its gateway.",
      "What will Router-1 do with this frame?",
      "192.168.10.10/24",
      "Follow the request hop by hop"
    ]) {
      expect(serialised).toContain(kept);
    }
  });

  it("leaks nothing at all in the PROVE IT response", () => {
    const serialised = JSON.stringify(
      projectMissionStep(interactionAt("prove_it"))
    );

    for (const leaked of [
      "Router-1 has no subinterface configured for VLAN 20.",
      "Add the VLAN 20 subinterface on Router-1",
      "Router-on-a-stick needs one subinterface per VLAN.",
      "The ping reports 100% packet loss.",
      "The frame arrives at Router-1 and is discarded.",
      "192.168.10.10/24",
      "resolvesFault"
    ]) {
      expect(serialised).not.toContain(leaked);
    }

    // The accessible account survives, because it is an accommodation.
    expect(serialised).toContain("Follow the request hop by hop");
  });

  it("sends the remediation and conclusion at the teaching levels", () => {
    for (const level of ["show_me", "help_me", "ask_me"] as const) {
      const projected = projectMissionStep(interactionAt(level));
      const content = projected.content as Extract<
        typeof projected.content,
        { type: "interaction" }
      >;

      if (content.presentation.state !== "available") {
        throw new Error(`expected an available interaction at ${level}`);
      }

      const parameters = content.presentation.parameters;

      expect(parameters.actions).toHaveLength(2);
      expect(parameters.confirmation?.summary).toContain("subinterface");
      expect(parameters.fault?.explanation).toBeDefined();
      expect(parameters.stages[1]?.decision).toBeDefined();
    }
  });

  it("never sends a prediction answer key at any support level", () => {
    for (const level of [
      "show_me",
      "help_me",
      "ask_me",
      "challenge_me",
      "prove_it"
    ] as const) {
      const serialised = JSON.stringify(projectMissionStep(interactionAt(level)));

      for (const forbidden of [
        "expectedOutcome",
        "expectedOptionIndex",
        "correctOption",
        "answer"
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
    }
  });
});

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
      interactionStableId: "packet-journey",
      interactionType: "packet_journey",
      sourceKind: "authored_teaching",
      supportLevel: "show_me",
      parameters: packetJourneyFixture,
      textEquivalent: "Follow the request hop by hop and see where it stops."
    });

    expect(projected).toMatchObject({
      type: "interaction",
      interactionStableId: "packet-journey",
      interactionType: "packet_journey",
      sourceKind: "authored_teaching",
      supportLevel: "show_me",
      textEquivalent: "Follow the request hop by hop and see where it stops."
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
      interactionStableId: "packet-journey",
      interactionType: "packet_journey",
      sourceKind: "authored_teaching",
      supportLevel: "show_me",
      parameters: packetJourneyFixture,
      textEquivalent: "Follow the request hop by hop."
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
