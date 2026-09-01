import { describe, expect, it } from "vitest";
import {
  INTERACTION_SUPPORT_LEVELS,
  MISSION_STEP_TYPES,
  type InteractionSupportLevel,
  type LearnerMissionInstruction,
  type LearnerMissionStepContent
} from "@tlp/shared-types";
import {
  buildUatInstruction,
  findUatMission,
  listUatMissions,
  loadUatDocument
} from "./uat-instruction";
import fixture from "../../../../content/fixtures/curriculum-architecture-example.json";

/**
 * WP-I — the UAT surface shows what a learner would actually receive.
 *
 * These tests exist to prove ONE thing in several directions: the harness runs
 * the real fixture through the real parser and the real projection. If it drifted
 * into building learner objects by hand, UAT would be reviewing a mock — and
 * findings about a mock look exactly like findings about the product.
 *
 * The support-level withholding rules themselves are proven in
 * `packages/shared-types/src/mission-instruction.test.ts` and are not restated
 * here. What IS asserted here is that the harness's own inputs reach those rules
 * unchanged, using the real architecture fixture rather than a local sample.
 */

const outcome = loadUatDocument(fixture);

function documentOrThrow() {
  if (outcome.state !== "ready") {
    throw new Error(
      `the architecture fixture does not parse: ${outcome.errors.join(", ")}`
    );
  }
  return outcome.document;
}

/** The fixture mission that carries every step type and the packet journey. */
const EVERY_STEP_MISSION = "arch-fixture-m1-every-step-type";

function instructionAt(
  supportLevel: InteractionSupportLevel
): LearnerMissionInstruction {
  return buildUatInstruction(documentOrThrow(), EVERY_STEP_MISSION, supportLevel);
}

function availableAt(supportLevel: InteractionSupportLevel) {
  const instruction = instructionAt(supportLevel);
  if (instruction.state !== "available") {
    throw new Error(`expected available instruction at ${supportLevel}`);
  }
  return instruction;
}

function interactionAt(supportLevel: InteractionSupportLevel) {
  const step = availableAt(supportLevel).steps.find(
    (candidate) => candidate.content.type === "interaction"
  );
  if (step === undefined) throw new Error("the fixture carries no interaction");
  return step.content as Extract<
    LearnerMissionStepContent,
    { type: "interaction" }
  >;
}

/* ------------------------------------------------------------------ *
 * The real parser
 * ------------------------------------------------------------------ */

describe("the architecture fixture reaches the harness through the real parser", () => {
  it("parses", () => {
    expect(outcome.state).toBe("ready");
  });

  it("is still marked as a fixture, so it can never be published", () => {
    expect(documentOrThrow().documentKind).toBe("architecture_fixture");
  });

  it("offers its missions in authored order", () => {
    const missions = listUatMissions(documentOrThrow());

    expect(missions.length).toBeGreaterThanOrEqual(2);
    expect(missions[0]?.stableId).toBe(EVERY_STEP_MISSION);
    expect(missions[0]?.hasInteraction).toBe(true);
  });

  it("flags the mission that carries a read-only prediction step", () => {
    // WP-I final correction. A `prediction` step renders a prompt and a list of
    // options with nothing selectable, because it is read-only by design.
    // On screen that is indistinguishable from a question that has broken, and
    // Founder UAT reported it as exactly that.
    //
    // The harness says so, so a reviewer stops mistaking authored architecture
    // for a defect. Nothing learner-facing changes and the step architecture is
    // untouched: this is a reviewer aid, and only that.
    const missions = listUatMissions(documentOrThrow());

    expect(missions[0]?.hasPassivePrediction).toBe(true);
    expect(missions[1]?.hasPassivePrediction).toBe(false);
  });

  it("reports a document the parser refuses rather than rendering part of it", () => {
    expect(loadUatDocument({ documentKind: "production" }).state).toBe("invalid");
  });

  it("refuses a mission that is not in the document", () => {
    expect(
      buildUatInstruction(documentOrThrow(), "no-such-mission", "show_me").state
    ).toBe("content_error");
  });
});

/* ------------------------------------------------------------------ *
 * All seven step types are reviewable
 * ------------------------------------------------------------------ */

describe("the harness exercises every approved step type", () => {
  it("projects all seven types from one fixture mission", () => {
    const types = availableAt("show_me").steps.map((step) => step.content.type);

    expect([...new Set(types)].sort()).toEqual([...MISSION_STEP_TYPES].sort());
  });

  it("resolves the diagram's asset, so the figure is reviewable", () => {
    const instruction = availableAt("show_me");

    expect(instruction.assets.length).toBeGreaterThanOrEqual(1);
    expect(instruction.assets[0]?.altText).toBeDefined();
  });

  it("keeps the mission's own steps in authored order", () => {
    const positions = availableAt("show_me").steps.map((step) => step.position);

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

/* ------------------------------------------------------------------ *
 * The real projection, at every support level
 * ------------------------------------------------------------------ */

describe("every support level is reviewable through the real projection", () => {
  it("covers exactly the shared support vocabulary", () => {
    // The harness selects among contract values; it invents no UAT-only level.
    for (const level of INTERACTION_SUPPORT_LEVELS) {
      expect(interactionAt(level).supportLevel).toBe(level);
    }
  });

  for (const level of ["show_me", "help_me", "ask_me"] as const) {
    it(`presents the full teaching interaction at ${level}`, () => {
      const interaction = interactionAt(level);

      expect(interaction.presentation.state).toBe("available");
      if (interaction.presentation.state !== "available") return;

      const parameters = interaction.presentation.parameters;
      expect(parameters.actions?.length).toBeGreaterThanOrEqual(2);
      expect(parameters.confirmation?.summary).toBeDefined();
      expect(parameters.fault?.explanation).toBeDefined();
    });
  }

  it("withholds the answer-bearing content at CHALLENGE ME", () => {
    const interaction = interactionAt("challenge_me");

    expect(interaction.presentation.state).toBe("available");
    if (interaction.presentation.state !== "available") return;

    const parameters = interaction.presentation.parameters;

    expect("actions" in parameters).toBe(false);
    expect("confirmation" in parameters).toBe(false);
    expect(parameters.fault).toBeDefined();
    expect("explanation" in (parameters.fault ?? {})).toBe(false);
    expect(parameters.stages.every((stage) => stage.decision === undefined)).toBe(
      true
    );
  });

  it("keeps the environment the learner needs at CHALLENGE ME", () => {
    const interaction = interactionAt("challenge_me");
    if (interaction.presentation.state !== "available") return;

    const parameters = interaction.presentation.parameters;

    expect(parameters.nodes.length).toBeGreaterThanOrEqual(2);
    expect(parameters.fault?.symptom).toBeDefined();
    expect(parameters.stages.every((stage) => stage.narration !== "")).toBe(true);
  });

  it("withholds the whole interaction at PROVE IT", () => {
    expect(interactionAt("prove_it").presentation).toEqual({
      state: "withheld",
      reason: "protected_demonstration"
    });
  });

  it("keeps the accessible text equivalent at every level", () => {
    for (const level of INTERACTION_SUPPORT_LEVELS) {
      expect(interactionAt(level).textEquivalent.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Leakage, measured on what the harness actually hands the renderer
 * ------------------------------------------------------------------ */

describe("protected fixture content does not reach the renderer", () => {
  /**
   * Read from the fixture rather than retyped, so this cannot pass by testing
   * a string the fixture no longer contains.
   */
  const authored = JSON.stringify(fixture);

  const protectedStrings = [
    "Router-on-a-stick needs one subinterface per VLAN",
    "Router-1 has a subinterface for VLAN 10 but none for VLAN 20",
    "Add subinterface Gi0/0.20 for VLAN 20 with address 192.168.20.1/24",
    "Router-1 now has an interface in VLAN 20 and forwards the request on towards PC-B."
  ];

  it("the protected strings really are in the fixture", () => {
    for (const value of protectedStrings) {
      expect(authored).toContain(value);
    }
  });

  it("none of them reaches the CHALLENGE ME projection", () => {
    const serialised = JSON.stringify(availableAt("challenge_me"));

    for (const value of protectedStrings) {
      expect(serialised).not.toContain(value);
    }
    expect(serialised).not.toContain("resolvesFault");
  });

  it("none of them reaches the PROVE IT projection", () => {
    const serialised = JSON.stringify(availableAt("prove_it"));

    for (const value of protectedStrings) {
      expect(serialised).not.toContain(value);
    }
    expect(serialised).not.toContain("resolvesFault");
  });

  it("the prediction answer key never exists at any level", () => {
    for (const level of INTERACTION_SUPPORT_LEVELS) {
      const serialised = JSON.stringify(availableAt(level));

      for (const forbidden of [
        "expectedOutcome",
        "expectedOptionIndex",
        "correctOption",
        "answerKey"
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * Determinism, and the absence of a second scenario
 * ------------------------------------------------------------------ */

describe("the harness adds no scenario and no nondeterminism", () => {
  it("produces an identical projection for identical inputs", () => {
    expect(instructionAt("show_me")).toEqual(instructionAt("show_me"));
  });

  it("changes only the interaction when the support level changes", () => {
    const show = availableAt("show_me");
    const challenge = availableAt("challenge_me");

    const nonInteraction = (instruction: typeof show) =>
      instruction.steps.filter((step) => step.content.type !== "interaction");

    expect(nonInteraction(show)).toEqual(nonInteraction(challenge));
  });

  it("finds the fixture mission by its authored identity", () => {
    expect(findUatMission(documentOrThrow(), EVERY_STEP_MISSION)?.stableId).toBe(
      EVERY_STEP_MISSION
    );
    expect(findUatMission(documentOrThrow(), "nope")).toBeUndefined();
  });
});
