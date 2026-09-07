import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCurriculumDocument,
  type CurriculumDocument,
  type CurriculumDocumentMission,
  type PacketJourneyParameters
} from "@tlp/shared-types";

/**
 * WP-J9 — Networking Foundations Mission 8, "When it does not work".
 *
 * ## The mission is bounded on purpose, and the boundary is the risk
 *
 * Mission 8 is the first and only authored fault in the course, and the
 * temptation it creates is to let it grow into a troubleshooting course. Its
 * own description forbids that in as many words: the learner "is not yet being
 * asked to find a failure nobody has located for you, which is a harder skill
 * and belongs to a later course."
 *
 * Two independent things hold that line, and both are asserted here. The
 * course-level gate already refuses `net.fault-isolation` anywhere in the
 * document — that competency stays with Router-on-a-Stick. This suite asserts
 * the instructional half: the stopping point is SHOWN, exactly one fault is
 * authored, and nothing asks the learner to search.
 *
 * ## Mission 5's rule, applied rather than replayed
 *
 * The fault is `192.168.2.1` configured as PC-A's default gateway — the very
 * value Mission 5 reasoned about on paper. Reusing it is deliberate, and it
 * carries an obvious hazard: a learner could recall Mission 5's conclusion
 * instead of deriving anything.
 *
 * The transfer therefore has to come from the CONTEXT rather than the value.
 * Mission 5 asked why a proposed setting would be invalid; Mission 8 shows a
 * machine actually configured that way, stops, and asks what the stop rules
 * out. So the assertions below require the reasoning to be present — what was
 * still intact, what never received anything — rather than merely requiring
 * the address to appear.
 *
 * ## A repair is not evidence
 *
 * `resolvesFault` is an authored consequence and nothing more. DEC-060 and
 * doctrine §23.2 are binding: instructional interaction cannot manufacture
 * competency. Mission 8 develops nothing, scores nothing and produces no
 * evidence, and several assertions here exist purely to keep it that way.
 *
 * ## What this suite cannot decide
 *
 * Whether the mission reads as the payoff of the whole course or as the start
 * of a troubleshooting course; whether the repair choices feel meaningful or
 * like clicking until green; whether the ending feels earned. All Tier 3
 * (CURR-009 section 14a).
 */

const REPOSITORY_ROOT = join(__dirname, "..", "..", "..");

const DOCUMENT_PATH = join(
  REPOSITORY_ROOT,
  "content",
  "curriculum",
  "networking-foundations.json"
);

const M8 = "nf-m8-when-it-does-not-work";
const MODULE4 = "nf-mod4-prove-it-and-fix-it";

/** The approved fault: the value Mission 5 reasoned about, now configured. */
const BAD_GATEWAY = "192.168.2.1";
/** The correct value, which Missions 4, 5 and 6 all established. */
const GOOD_GATEWAY = "192.168.1.1";
/** The destination the whole course has been reaching for. */
const FAR_HOST = "192.168.2.20";
/** The machine that carries the fault. */
const FAULTED_HOST = "pc-a";

function loadDocument(): CurriculumDocument {
  const result = parseCurriculumDocument(
    JSON.parse(readFileSync(DOCUMENT_PATH, "utf8"))
  );

  if (!result.valid) {
    throw new Error(
      `the authored document does not parse:\n${result.errors.join("\n")}`
    );
  }

  return result.document;
}

const document = loadDocument();

function mission(stableId: string): CurriculumDocumentMission {
  const found = document.missions.find((m) => m.stableId === stableId);
  if (found === undefined) throw new Error(`no mission ${stableId}`);
  return found;
}

function usesWord(haystack: string, word: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9])${word}([^A-Za-z0-9]|$)`, "i").test(
    haystack
  );
}

/**
 * Whole-address containment.
 *
 * `192.168.1.1` is a prefix of `192.168.1.10/24`, so a plain `includes` reports
 * PC-A's own address as a mention of the gateway. Every check that asks whether
 * a specific address appears has to bound the match at both ends.
 */
function mentionsAddress(haystack: string, address: string): boolean {
  const escaped = address.replace(/\./g, "\\.");
  return new RegExp(`(^|[^0-9.])${escaped}([^0-9.]|$)`).test(haystack);
}

/** Concept prose only — no captions, commands, output or journey text. */
function prose(): string[] {
  return mission(M8).steps.flatMap((step) => {
    const content = step.content;
    if (content.type !== "concept") return [];
    return [content.title ?? "", ...content.paragraphs];
  });
}

function commandSteps() {
  return mission(M8)
    .steps.map((step) => step.content)
    .filter((content) => content.type === "command");
}

function journey(): PacketJourneyParameters {
  const step = mission(M8).steps.find(
    (candidate) => candidate.content.type === "interaction"
  );

  if (step === undefined || step.content.type !== "interaction") {
    throw new Error("Mission 8 authors no interaction");
  }

  return step.content.parameters as PacketJourneyParameters;
}

/** Every string Mission 8 puts in front of a learner, journey included. */
function learnerFacingText(): string {
  const parts: string[] = [];

  for (const step of mission(M8).steps) {
    const content = step.content;
    switch (content.type) {
      case "concept":
        if (content.title !== undefined) parts.push(content.title);
        parts.push(...content.paragraphs);
        break;
      case "command":
        parts.push(
          content.caption ?? "",
          content.command ?? "",
          content.output ?? ""
        );
        break;
      case "interaction": {
        parts.push(content.caption ?? "", content.textEquivalent ?? "");
        const parameters = content.parameters as PacketJourneyParameters;
        parts.push(parameters.traffic.label, parameters.traffic.startActionLabel);
        for (const node of parameters.nodes) {
          parts.push(node.label, node.about ?? "");
          for (const iface of node.interfaces) {
            parts.push(iface.label);
            for (const attribute of iface.attributes) {
              parts.push(attribute.label, attribute.value);
            }
          }
        }
        for (const stage of parameters.stages) {
          parts.push(stage.narration, stage.decision ?? "");
          for (const facts of stage.deviceFacts ?? []) {
            parts.push(facts.label);
            for (const fact of facts.facts) parts.push(fact.label, fact.value);
          }
        }
        if (parameters.fault !== undefined) {
          parts.push(parameters.fault.symptom, parameters.fault.explanation);
        }
        for (const action of parameters.actions) {
          parts.push(action.label, action.observation);
        }
        parts.push(
          parameters.confirmation.narration,
          parameters.confirmation.summary
        );
        break;
      }
      default:
        break;
    }
  }

  return parts.join("\n");
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

describe("Mission 8 is the approved mission, in the approved place", () => {
  it("keeps its stable identity, title and module", () => {
    const m = mission(M8);
    expect(m.title).toBe("Mission 8 — When it does not work");
    expect(m.moduleStableId).toBe(MODULE4);
    expect(m.position).toBe(1);
  });

  it("closes Module 4 rather than opening a new module", () => {
    const inModule = document.missions
      .filter((m) => m.moduleStableId === MODULE4)
      .sort((left, right) => left.position - right.position)
      .map((m) => m.stableId);

    expect(inModule).toEqual(["nf-m7-testing-whether-it-works", M8]);
  });

  it("declares what the learner needs before starting", () => {
    expect(mission(M8).description).toContain("Before this mission");
    expect(mission(M8).description).toContain("Mission 7");
  });

  it("is the final mission the course declares", () => {
    const positions = document.missions.map((m) => m.stableId);
    expect(positions[positions.length - 1]).toBe(M8);
    expect(document.missions).toHaveLength(8);
  });

  it("declares no ninth mission anywhere in the document", () => {
    for (const m of document.missions) {
      expect(/^nf-m[1-8]-/.test(m.stableId)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

describe("Mission 8 uses only the step types this slice approved", () => {
  it("authors concept, command and interaction steps and nothing else", () => {
    const types = mission(M8).steps.map((step) => step.content.type);
    for (const type of types) {
      expect(["concept", "command", "interaction"]).toContain(type);
    }
  });

  it("authors exactly one journey, because the repair and the continuation are one sequence", () => {
    const interactions = mission(M8).steps.filter(
      (step) => step.content.type === "interaction"
    );
    expect(interactions).toHaveLength(1);
  });

  it("authors no standalone prediction step", () => {
    for (const step of mission(M8).steps) {
      expect(step.content.type).not.toBe("prediction");
    }
  });

  it("authors no practice step, because no assessment could be resolved", () => {
    for (const step of mission(M8).steps) {
      expect(step.content.type).not.toBe("practice");
    }
  });

  it("gives every step a unique id and a contiguous position", () => {
    const steps = mission(M8).steps;
    const ids = steps.map((step) => step.stableId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(steps.map((step) => step.position)).toEqual(
      steps.map((_step, index) => index)
    );
  });

  it("names every step for this mission", () => {
    for (const step of mission(M8).steps) {
      expect(step.stableId.startsWith("m8-s")).toBe(true);
    }
  });

  it("authors no asset anywhere", () => {
    for (const m of document.missions) {
      expect(`${m.stableId} ${m.assets.length}`).toBe(`${m.stableId} 0`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Mission 7 is load-bearing
 * ------------------------------------------------------------------ */

describe("Mission 8 begins from an observable failed result", () => {
  it("shows exactly one command result, and it fails", () => {
    const commands = commandSteps();
    expect(commands).toHaveLength(1);

    const only = commands[0];
    if (only?.type !== "command") throw new Error("no command step");
    expect(only.output).toContain("100% packet loss");
    expect(only.output).toContain("0 received");
  });

  it("tests the destination the course has been reaching for", () => {
    const only = commandSteps()[0];
    if (only?.type !== "command") throw new Error("no command step");
    expect(only.command).toContain(FAR_HOST);
  });

  it("tells the learner the output is displayed, not executed", () => {
    /*
      LC-062's honesty convention, pinned as the CLAIM rather than as one
      wording of it. The caption must say the output is displayed AND must
      explicitly deny that anything ran. It used to require the exact phrase
      "no live network"; the architect-authored rewrite denies execution as
      "nothing here runs a live command", which is the same claim.

      Both accepted forms are enumerated, so removing the denial altogether
      still fails. This is not weaker: it went from one required phrase to a
      required phrase plus a required denial from a closed set.
    */
    const only = commandSteps()[0];
    if (only?.type !== "command") throw new Error("no command step");

    expect(only.caption).toContain("displayed output");

    const denials = ["no live network", "nothing here runs a live command"];
    const denied = denials.some((phrase) => only.caption?.includes(phrase));

    expect(`the caption denies live execution: ${denied}`).toBe(
      "the caption denies live execution: true"
    );
  });

  it("asks the learner to commit before the reasoning arrives", () => {
    const only = commandSteps()[0];
    if (only?.type !== "command") throw new Error("no command step");
    expect(only.caption).toContain("Before you read on");
  });

  it("never claims the learner ran anything", () => {
    const text = learnerFacingText();
    for (const claim of [
      "you ran",
      "your machine executed",
      "the live network returned",
      "run this command",
      "type the following"
    ]) {
      expect(`${claim}: ${text.toLowerCase().includes(claim)}`).toBe(
        `${claim}: false`
      );
    }
  });

  it("applies Mission 7's habit to the failure rather than restating the command", () => {
    /*
      The point of reusing ping here is the inference, not the tool. If the
      mission started explaining the command again it would be re-teaching
      Mission 7 rather than requiring it.

      The two frozen phrases — "what else would have produced" and "starting
      point" — were one wording of two invariants. The architect-authored
      rewrite states both differently: the habit is reactivated as "what else
      could have produced the same result?", and a failed result is
      distinguished from a diagnosis rather than called a starting point.
      Both invariants are asserted here as CONCEPTS.
    */
    const text = prose().join("\n").toLowerCase();

    // Mission 7's question, reactivated rather than re-derived.
    expect(`reactivates the habit: ${text.includes("what else could have produced") || text.includes("what else would have produced")}`)
      .toBe("reactivates the habit: true");

    // A failed result is not a diagnosis. Named as the distinction it is.
    expect(`distinguishes result from diagnosis: ${text.includes("diagnosis")}`)
      .toBe("distinguishes result from diagnosis: true");
  });

  it("teaches no ping syntax and no further ICMP", () => {
    const text = learnerFacingText();
    for (const term of [
      "ICMP",
      "echo request",
      "echo reply",
      "header",
      "checksum",
      "datagram",
      "payload",
      "TTL",
      "time to live",
      "hop limit"
    ]) {
      expect(`${term} in learner text: ${usesWord(text, term)}`).toBe(
        `${term} in learner text: false`
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * One bounded fault, shown rather than searched for
 * ------------------------------------------------------------------ */

describe("Mission 8 authors exactly one bounded, visible fault", () => {
  it("authors a fault at all, which no earlier mission does", () => {
    expect(journey().fault).toBeDefined();

    for (const m of document.missions) {
      if (m.stableId === M8) continue;
      for (const step of m.steps) {
        if (step.content.type !== "interaction") continue;
        const parameters = step.content.parameters as PacketJourneyParameters;
        expect(`${m.stableId} fault: ${parameters.fault !== undefined}`).toBe(
          `${m.stableId} fault: false`
        );
      }
    }
  });

  it("stops the journey at exactly one authored stage", () => {
    const stopping = journey().stages.filter(
      (stage) => stage.outcome === "stops"
    );
    expect(stopping).toHaveLength(1);
  });

  it("authors the stop point beside the fault rather than leaving it inferred", () => {
    const fault = journey().fault;
    if (fault === undefined) throw new Error("no fault");

    const stopStage = journey().stages.find(
      (stage) => stage.stageId === fault.stopsAtStageId
    );

    expect(stopStage).toBeDefined();
    expect(stopStage?.outcome).toBe("stops");
  });

  it("places the fault on PC-A", () => {
    expect(journey().fault?.atNodeId).toBe(FAULTED_HOST);
  });

  it("shows the learner a symptom rather than asking them to find one", () => {
    const fault = journey().fault;
    if (fault === undefined) throw new Error("no fault");
    expect(fault.symptom.length).toBeGreaterThan(0);
    // The symptom is an observation and is kept at every support level. It says
    // what can be SEEN, and must not be the diagnosis.
    expect(fault.symptom).not.toContain(BAD_GATEWAY);
  });

  it("never asks the learner to locate an unknown failure", () => {
    const text = learnerFacingText();
    for (const phrase of [
      "find the fault",
      "find the problem",
      "locate the fault",
      "work out where it is failing",
      "search for",
      "hunt"
    ]) {
      expect(`${phrase}: ${text.toLowerCase().includes(phrase)}`).toBe(
        `${phrase}: false`
      );
    }
  });

  it("says plainly that finding an unlocated failure belongs to a later course", () => {
    const text = prose().join("\n");
    expect(text).toContain("later course");
  });

  it("authors no second fault anywhere in the journey", () => {
    const parameters = journey();
    // One `fault` is all the contract permits, but a second stopping stage
    // would be a second failure in everything but name.
    const stops = parameters.stages.filter((stage) => stage.outcome === "stops");
    expect(stops).toHaveLength(1);
    expect(stops[0]?.stageId).toBe(parameters.fault?.stopsAtStageId);
  });
});

/* ------------------------------------------------------------------ *
 * The fault is Mission 5's rule, broken
 * ------------------------------------------------------------------ */

describe("the fault is a wrong default gateway, and Mission 5's rule explains it", () => {
  it("configures PC-A with the value Mission 5 reasoned about", () => {
    // Read from the stage facts rather than the fixed details: the configured
    // gateway is state, and the surface that reports it has to be the one that
    // can change. `keeps the configured gateway out of PC-A's fixed details`
    // below is the other half of that.
    const parameters = journey();
    const atStop = (parameters.stages.find(
      (stage) => stage.stageId === parameters.fault?.stopsAtStageId
    )?.deviceFacts ?? [])
      .filter((entry) => entry.nodeId === FAULTED_HOST)
      .flatMap((entry) => entry.facts.map((fact) => fact.value));

    expect(atStop).toContain(BAD_GATEWAY);
    expect(atStop).toContain("192.168.1.10/24");
  });

  it("explains the stop with the reachability rule rather than by assertion", () => {
    /*
      The rule, stated where it is used. The "mission 5" clause this used to
      require was removed on a Founder ruling in wave 8: the explanation has to
      stand on its own for a learner who has not opened Mission 5 in weeks, so
      the citation is replaced by the rule it was pointing at.
    */
    const explanation = journey().fault?.explanation ?? "";

    expect(explanation).toContain("local delivery");
    expect(explanation).toContain("own network");
    // The circularity, which is the argument rather than an assertion.
    expect(explanation).toContain("gateway in order to reach");
    expect(explanation).toContain(BAD_GATEWAY);
    expect(explanation).toContain("192.168.1.10/24");
  });

  it("explains the stop without sending the learner to another mission", () => {
    const explanation = journey().fault?.explanation ?? "";
    expect(explanation.match(/Mission \d+/g) ?? []).toEqual([]);
  });

  it("states the circularity that makes the setting impossible", () => {
    const text = learnerFacingText().toLowerCase();
    // "It would need a gateway in order to reach its gateway" is the whole
    // argument. Without it the learner is being told the value is wrong rather
    // than shown why.
    expect(text).toContain("gateway in order to reach");
  });

  it("makes PC-A's own address prominent, since that is what the rule compares against", () => {
    const pcA = journey().nodes.find((node) => node.nodeId === FAULTED_HOST);
    const shown = pcA?.interfaces
      .flatMap((iface) => iface.attributes)
      .some(
        (attribute) =>
          attribute.value === "192.168.1.10/24" && attribute.prominent === true
      );

    expect(shown).toBe(true);
  });

  it("shows the faulted setting in the facts at the stop", () => {
    const fault = journey().fault;
    const stopStage = journey().stages.find(
      (stage) => stage.stageId === fault?.stopsAtStageId
    );

    const facts = (stopStage?.deviceFacts ?? []).flatMap((entry) =>
      entry.facts.map((item) => item.value)
    );

    expect(facts).toContain(BAD_GATEWAY);
  });

  it("keeps the configured gateway out of PC-A's fixed details", () => {
    // The inspector renders interface attributes in a static disclosure that
    // describes the device, and renders the current stage's deviceFacts as
    // "what the devices know now". A setting the learner CHANGES belongs in
    // the second surface. Left in the first, it would go on reporting
    // 192.168.2.1 after the repair, while the journey behaved as though the
    // repair had happened — a learner-visible contradiction in the one mission
    // whose whole argument is that a repair must be confirmed.
    const pcA = journey().nodes.find((node) => node.nodeId === FAULTED_HOST);
    if (pcA === undefined) throw new Error("no PC-A");

    const values = pcA.interfaces.flatMap((iface) =>
      iface.attributes.map((attribute) => attribute.value)
    );

    for (const gateway of [BAD_GATEWAY, GOOD_GATEWAY]) {
      expect(`${gateway} in PC-A's fixed details: ${values.includes(gateway)}`).toBe(
        `${gateway} in PC-A's fixed details: false`
      );
    }

    // The facts that do NOT change are still there.
    expect(values).toContain("192.168.1.10/24");
    expect(values).toContain("00:1b:44:11:3a:b7");
  });

  it("reports the faulted setting at the stop", () => {
    const parameters = journey();
    const stop = parameters.stages.find(
      (stage) => stage.stageId === parameters.fault?.stopsAtStageId
    );

    const values = (stop?.deviceFacts ?? [])
      .filter((entry) => entry.nodeId === FAULTED_HOST)
      .flatMap((entry) => entry.facts.map((fact) => fact.value));

    expect(values).toContain(BAD_GATEWAY);
  });

  it("never reports the faulted setting again after the repair", () => {
    const parameters = journey();
    const stopIndex = parameters.stages.findIndex(
      (stage) => stage.stageId === parameters.fault?.stopsAtStageId
    );

    for (const stage of parameters.stages.slice(stopIndex + 1)) {
      const values = (stage.deviceFacts ?? [])
        .filter((entry) => entry.nodeId === FAULTED_HOST)
        .flatMap((entry) => entry.facts.map((fact) => fact.value));

      expect(`${stage.stageId} still shows ${BAD_GATEWAY}: ${values.includes(BAD_GATEWAY)}`).toBe(
        `${stage.stageId} still shows ${BAD_GATEWAY}: false`
      );
    }
  });

  it("reports the repaired setting immediately after the repair and at the end", () => {
    const parameters = journey();
    const stopIndex = parameters.stages.findIndex(
      (stage) => stage.stageId === parameters.fault?.stopsAtStageId
    );

    const gatewayAt = (index: number) =>
      (parameters.stages[index]?.deviceFacts ?? [])
        .filter((entry) => entry.nodeId === FAULTED_HOST)
        .flatMap((entry) => entry.facts.map((fact) => fact.value));

    // The step after the stop is where the change is the news, and the last
    // step is where the learner verifies it against the successful round trip.
    expect(gatewayAt(stopIndex + 1)).toContain(GOOD_GATEWAY);
    expect(gatewayAt(parameters.stages.length - 1)).toContain(GOOD_GATEWAY);
  });

  it("names the setting the same way before and after, so the change is legible", () => {
    const parameters = journey();
    const labelsCarrying = (value: string) =>
      parameters.stages.flatMap((stage) =>
        (stage.deviceFacts ?? [])
          .filter((entry) => entry.nodeId === FAULTED_HOST)
          .flatMap((entry) =>
            entry.facts
              .filter((fact) => fact.value === value)
              .map((fact) => fact.label)
          )
      );

    const before = labelsCarrying(BAD_GATEWAY);
    const after = labelsCarrying(GOOD_GATEWAY);

    // One field holding a different value, rather than two differently named
    // facts a learner has to reconcile.
    expect(before.some((label) => after.includes(label))).toBe(true);
  });

  it("explains why the stop happened without prescribing the repair", () => {
    const explanation = journey().fault?.explanation ?? "";

    // Approved boundary: the explanation may say what rule is violated and why
    // nothing left PC-A. It may not hand over the answer — the learner has to
    // apply prior reasoning to choose among the offered changes, and the
    // Printer option only works as a test of that if the fix is not stated.
    expect(mentionsAddress(explanation, GOOD_GATEWAY)).toBe(false);

    for (const prescription of [
      "change the gateway to",
      "set it to",
      "choose",
      "select",
      "you should",
      "the fix is",
      "correct it to",
      "router-1's local connection"
    ]) {
      expect(
        `${prescription}: ${explanation.toLowerCase().includes(prescription)}`
      ).toBe(`${prescription}: false`);
    }
  });

  it("does not contradict Mission 5 about what 192.168.2.1 is", () => {
    // Mission 5 established 192.168.2.1 as Router-1's second connection, a real
    // address on a real device. Mission 8 must not recast it as fictional or
    // invalid in itself — it is wrong only as PC-A's gateway.
    const routerFar = journey()
      .nodes.find((node) => node.nodeId === "r-1")
      ?.interfaces.flatMap((iface) => iface.attributes)
      .map((attribute) => attribute.value);

    expect(routerFar).toContain("192.168.2.1/24");
  });
});

/* ------------------------------------------------------------------ *
 * Bounded repair
 * ------------------------------------------------------------------ */

describe("the repair is bounded, enumerated and reasoned", () => {
  it("offers a small enumerated set of changes", () => {
    const actions = journey().actions;
    expect(actions.length).toBeGreaterThanOrEqual(2);
    // Not a threshold on teaching quality — a ceiling on how many plausible
    // wrong answers the three authorized concepts can actually support. Beyond
    // this the mission would be manufacturing distractors.
    expect(actions.length).toBeLessThanOrEqual(4);
  });

  it("authors exactly one change that resolves the fault", () => {
    const resolving = journey().actions.filter(
      (action) => action.resolvesFault
    );
    expect(resolving).toHaveLength(1);
  });

  it("makes the resolving change the correct gateway", () => {
    const resolving = journey().actions.find((action) => action.resolvesFault);
    expect(resolving?.label).toContain(GOOD_GATEWAY);
  });

  it("gives every change an authored observation, wrong ones included", () => {
    for (const action of journey().actions) {
      expect(`${action.actionId} ${action.observation.length > 0}`).toBe(
        `${action.actionId} true`
      );
    }
  });

  it("explains each wrong change rather than judging it", () => {
    for (const action of journey().actions) {
      if (action.resolvesFault) continue;
      const observation = action.observation.toLowerCase();

      for (const verdict of [
        "incorrect",
        "wrong answer",
        "try again",
        "correct!",
        "well done",
        "score"
      ]) {
        expect(`${action.actionId} ${verdict}: ${observation.includes(verdict)}`).toBe(
          `${action.actionId} ${verdict}: false`
        );
      }
    }
  });

  it("keeps every wrong change plausible enough to test the reasoning", () => {
    // Each distractor must be defeated by something the course actually
    // taught, not by being obviously silly. Asserted by requiring each wrong
    // observation to cite the reason it fails.
    const wrong = journey().actions.filter((action) => !action.resolvesFault);
    expect(wrong.length).toBeGreaterThanOrEqual(1);

    for (const action of wrong) {
      expect(action.observation.length).toBeGreaterThan(80);
    }
  });

  it("changes one setting on one machine", () => {
    const resolving = journey().actions.find((action) => action.resolvesFault);
    expect(resolving?.label.toLowerCase()).toContain("pc-a");
  });

  it("teaches that the repair was bounded", () => {
    const text = prose().join("\n").toLowerCase();
    expect(text).toContain("one value");
    expect(text).toContain("nothing else");
  });
});

/* ------------------------------------------------------------------ *
 * Reading the stop
 * ------------------------------------------------------------------ */

describe("the stop is read for what it rules in and what it rules out", () => {
  it("says what was still intact when it stopped", () => {
    const text = prose().join("\n").toLowerCase();
    // Wording, not invariant: the mission says "what was still working".
    expect(text).toContain("still working");
  });

  it("names the devices that never received anything", () => {
    const text = prose().join("\n");
    for (const device of ["Switch-1", "Router-1", "PC-C"]) {
      expect(`${device}: ${text.includes(device)}`).toBe(`${device}: true`);
    }
  });

  it("states the rule that a device receiving nothing cannot have failed", () => {
    const text = learnerFacingText().toLowerCase();
    expect(text).toContain("received nothing cannot be the device that failed");
  });

  it("says that a failed result on its own does not locate anything", () => {
    /*
      The invariant is that the mission states, in words, that the failure does
      not identify WHICH PART of the path caused it. The old assertion froze one
      phrasing of that ("does not tell you which part"); the architect-authored
      rewrite says "it does not identify which part of the path caused that
      result".

      Pinned as the claim: a negation, about which part.
    */
    const text = prose().join("\n").toLowerCase();

    const stated =
      text.includes("does not tell you which part") ||
      text.includes("does not identify which part");

    expect(`states that the failure locates nothing: ${stated}`).toBe(
      "states that the failure locates nothing: true"
    );

    // And the observable fact it DOES establish is stated plainly.
    expect(text).toContain("did not receive a reply");
  });
});

/* ------------------------------------------------------------------ *
 * Confirmation after repair
 * ------------------------------------------------------------------ */

describe("the repair is confirmed, and the confirmation is the point", () => {
  it("continues the journey past the repaired stage to the destination", () => {
    const parameters = journey();
    const stopIndex = parameters.stages.findIndex(
      (stage) => stage.stageId === parameters.fault?.stopsAtStageId
    );

    expect(stopIndex).toBeGreaterThanOrEqual(0);
    expect(parameters.stages.length).toBeGreaterThan(stopIndex + 1);

    for (const stage of parameters.stages.slice(stopIndex + 1)) {
      expect(`${stage.stageId} ${stage.outcome}`).toBe(
        `${stage.stageId} proceeds`
      );
    }
  });

  it("reaches the destination and returns to where it started", () => {
    const parameters = journey();
    const stages = parameters.stages;

    expect(stages.some((stage) => stage.atNodeId === "pc-c")).toBe(true);
    expect(stages[stages.length - 1]?.atNodeId).toBe(
      parameters.traffic.sourceNodeId
    );
  });

  it("uses both of Router-1's connections on the restored trip", () => {
    const links = journey()
      .stages.map((stage) => stage.viaLinkId)
      .filter((linkId): linkId is string => linkId !== undefined);

    expect(links).toContain("link-r-1");
    expect(links).toContain("link-far");
  });

  it("ends in an authored confirmation", () => {
    const confirmation = journey().confirmation;
    expect(confirmation.narration.length).toBeGreaterThan(0);
    expect(confirmation.summary.length).toBeGreaterThan(0);
  });

  it("teaches that an unconfirmed repair is not a repair", () => {
    const text = prose().join("\n").toLowerCase();
    expect(text).toContain("hope");
    expect(text).toContain("two different claims");
  });

  it("bounds what the confirmation establishes", () => {
    const text = prose().join("\n").toLowerCase();
    // Mission 7's discipline, applied to the repair. Confirming this exchange
    // is not confirming the network.
    expect(text).toContain("does not establish that nothing else");
  });

  it("never reaches PC-B or the Printer", () => {
    const visited = new Set(journey().stages.map((stage) => stage.atNodeId));
    expect(visited.has("pc-b")).toBe(false);
    expect(visited.has("printer")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Designed reuse
 * ------------------------------------------------------------------ */

describe("Mission 8 requires the earlier missions rather than reciting them", () => {
  it("carries the reasoning of the earlier missions, restated where it is used", () => {
    /*
      Inverted in wave 8, on a Founder ruling. This required the strings
      "Mission 4" through "Mission 7" to appear in Mission 8, as evidence that
      the integration mission drew on them. Founder UAT ruled that a learner
      returning after a break cannot be sent to a numbered mission to
      understand the sentence in front of them.

      What the citations stood for is checked instead: the address comparison,
      the gateway rule, the routed path, and the test result — each present in
      Mission 8's own words, where the learner needs it.
    */
    const text = learnerFacingText();

    for (const carried of [
      "192.168.1.10/24",
      "octets name the network",
      "default gateway",
      "Router-1",
      "ping"
    ]) {
      expect(`carries "${carried}": ${text.includes(carried)}`).toBe(
        `carries "${carried}": true`
      );
    }
  });

  it("asks the learner to remember no numbered mission during the journey", () => {
    const j = journey();
    const parts = [
      ...j.stages.flatMap((stage) => [
        stage.narration,
        stage.decision ?? "",
        stage.action ?? ""
      ]),
      ...j.nodes.map((node) => node.about ?? ""),
      j.fault?.symptom ?? "",
      j.fault?.explanation ?? "",
      j.confirmation.narration,
      j.confirmation.summary
    ];

    expect(parts.join("\n").match(/Mission \d+/g) ?? []).toEqual([]);
  });

  it("keeps every established address exactly as earlier missions left it", () => {
    const values = journey().nodes.flatMap((node) =>
      node.interfaces.flatMap((iface) =>
        iface.attributes.map((attribute) => attribute.value)
      )
    );

    for (const established of [
      "192.168.1.10/24",
      "192.168.1.11/24",
      "192.168.1.12/24",
      "192.168.1.1/24",
      "192.168.2.1/24",
      "192.168.2.20/24",
      "00:1b:44:11:3a:b7",
      "00:1b:44:11:3a:c2",
      "00:1b:44:11:3a:d9",
      "00:1b:44:11:3a:01",
      "00:1b:44:11:3a:02",
      "00:1b:44:11:3a:e4"
    ]) {
      expect(`${established}: ${values.includes(established)}`).toBe(
        `${established}: true`
      );
    }
  });

  it("uses the interface identities the earlier missions established", () => {
    const interfaceIds = journey().nodes.flatMap((node) =>
      node.interfaces.map((iface) => iface.interfaceId)
    );

    expect(interfaceIds).toContain("r-1-lan");
    expect(interfaceIds).toContain("r-1-far");
  });

  it("draws the same six devices across the same two groups", () => {
    const parameters = journey();
    expect(parameters.nodes.map((node) => node.nodeId).sort()).toEqual([
      "pc-a",
      "pc-b",
      "pc-c",
      "printer",
      "r-1",
      "sw-1"
    ]);
    expect((parameters.groups ?? []).map((group) => group.groupId).sort()).toEqual(
      ["local-network", "other-network"]
    );
  });

  it("does not re-teach a concept an earlier mission owns", () => {
    // The ledger gives Mission 8 three concepts and no more. A mission that
    // re-explained ARP, the prefix or routing would be re-teaching rather than
    // requiring, which is the specific failure an integration mission has.
    const text = prose().join("\n");
    for (const owned of ["ARP", "prefix", "flooding", "Layer 2", "Layer 3"]) {
      expect(`${owned}: ${usesWord(text, owned)}`).toBe(`${owned}: false`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Concept ownership
 * ------------------------------------------------------------------ */

describe("Mission 8 stays inside its authorized concepts", () => {
  it("teaches no troubleshooting framework or methodology", () => {
    const text = learnerFacingText();
    for (const term of [
      "methodology",
      "framework",
      "checklist",
      "OSI",
      "top-down",
      "bottom-up",
      "divide and conquer",
      "root cause analysis"
    ]) {
      expect(`${term}: ${usesWord(text, term)}`).toBe(`${term}: false`);
    }
  });

  it("does not claim the learner can isolate faults", () => {
    const text = learnerFacingText();
    for (const term of ["fault isolation", "isolate"]) {
      expect(`${term}: ${text.toLowerCase().includes(term)}`).toBe(
        `${term}: false`
      );
    }
  });

  it("introduces no later-course vocabulary", () => {
    const text = learnerFacingText();
    for (const term of [
      "VLANs?",
      "trunks?",
      "subinterfaces?",
      "ACLs?",
      "NAT",
      "OSPF",
      "BGP",
      "IPv6",
      "DHCP",
      "DNS",
      "netmask",
      "CIDR",
      "subnets?"
    ]) {
      expect(`${term}: ${usesWord(text, term)}`).toBe(`${term}: false`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Evidence, certification and AI boundaries
 * ------------------------------------------------------------------ */

describe("Mission 8 teaches and claims nothing about competency", () => {
  it("develops no competency, and reinforces only what was developed earlier", () => {
    const links = mission(M8).competencies;
    expect(links.every((link) => link.relationship === "reinforces")).toBe(true);
    expect(links.length).toBeGreaterThan(0);
  });

  it("leaves the course's seven development points untouched", () => {
    const develops = document.missions.flatMap((m) =>
      m.competencies.filter((link) => link.relationship === "develops")
    );
    expect(develops).toHaveLength(7);
  });

  it("does not claim fault isolation as a competency", () => {
    for (const competency of document.competencies) {
      expect(competency.stableId).not.toBe("net.fault-isolation");
    }
    for (const m of document.missions) {
      for (const link of m.competencies) {
        expect(link.competencyStableId).not.toBe("net.fault-isolation");
      }
    }
  });

  it("authors no assessment and no live lab", () => {
    const raw = JSON.stringify(mission(M8));
    for (const key of ["assessmentStableId", "live_lab", "assetStableId"]) {
      expect(`${key}: ${raw.includes(key)}`).toBe(`${key}: false`);
    }
  });

  it("declares the journey as authored teaching", () => {
    const step = mission(M8).steps.find(
      (candidate) => candidate.content.type === "interaction"
    );
    if (step?.content.type !== "interaction") throw new Error("no interaction");
    expect(step.content.sourceKind).toBe("authored_teaching");
  });

  it("treats the learner's choice as thinking, never as a score", () => {
    const text = learnerFacingText();
    // Scoring SHAPES, not bare words. An earlier draft of this check forbade
    // "points" and fired on the step title "A failure points in many
    // directions" — a check that fails on correct prose teaches the next
    // author to edit it out of the way, so it is narrowed to the phrasings a
    // score would actually take.
    for (const term of [
      "score",
      "scored",
      "grade",
      "graded",
      "mastery",
      "marks",
      "points for",
      "points awarded",
      "evidence of competency"
    ]) {
      expect(`${term}: ${usesWord(text, term)}`).toBe(`${term}: false`);
    }
  });

  it("is certification-free everywhere a learner can see", () => {
    const text = learnerFacingText() + mission(M8).description;
    for (const term of [
      "Security\\+",
      "CompTIA",
      "certification",
      "certified",
      "exam",
      "objective",
      "domain"
    ]) {
      expect(`${term}: ${usesWord(text, term)}`).toBe(`${term}: false`);
    }
  });

  it("involves no AI anywhere", () => {
    const raw = JSON.stringify(mission(M8));
    for (const term of ["AI ", "tutor", "assistant", "generated"]) {
      expect(`${term}: ${raw.includes(term)}`).toBe(`${term}: false`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The ending
 * ------------------------------------------------------------------ */

describe("the course ends honestly about instruction versus evidence", () => {
  it("separates having been taught from having demonstrated", () => {
    const text = prose().join("\n").toLowerCase();
    expect(text).toContain("taught these things");
    expect(text).toContain("not yet demonstrated");
  });

  it("says the failure had already been located for the learner", () => {
    const text = prose().join("\n").toLowerCase();
    expect(text).toContain("already been located");
  });

  it("claims no readiness of any kind", () => {
    const text = learnerFacingText();
    // Only ASSERTIONS of readiness. A bare "you are ready" fired on the
    // mission's own honest denial — "this course does not tell you that you
    // are ready for anything in particular" — which is the sentence this
    // check exists to protect, not to forbid. The denial itself is asserted
    // positively below.
    for (const claim of [
      "you are now ready",
      "you are ready to",
      "job ready",
      "job-ready",
      "you have mastered",
      "you are now qualified",
      "you can now troubleshoot any"
    ]) {
      expect(`${claim}: ${text.toLowerCase().includes(claim)}`).toBe(
        `${claim}: false`
      );
    }
  });

  it("says plainly that the course does not certify readiness", () => {
    const text = prose().join("\n").toLowerCase();
    expect(text).toContain("does not tell you that you are ready");
  });
});

/* ------------------------------------------------------------------ *
 * Mission authority
 * ------------------------------------------------------------------ */

describe("the mission authority declaration records the terminal state", () => {
  const DECLARATION_PATH = join(
    REPOSITORY_ROOT,
    "scripts",
    "lib",
    "wpj-missions.txt"
  );

  const rows = readFileSync(DECLARATION_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split("|"));

  it("declares Mission 8 authored", () => {
    const row = rows.find((entry) => entry[1] === M8);
    expect(row?.[2]).toBe("authored");
  });

  it("declares every approved mission authored, so the course is FULLY_AUTHORED", () => {
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(`${row[1]} ${row[2]}`).toBe(`${row[1]} authored`);
    }
  });

  it("declares no mission the document does not contain", () => {
    const declared = rows.map((row) => row[1]);
    const actual = document.missions.map((m) => m.stableId);
    expect(declared).toEqual(actual);
  });
});


/* ------------------------------------------------------------------ *
 * TROUBLESHOOT, RATHER THAN FOLLOW
 *
 * Mission 6 says "come with me". Mission 8 says "you know how this should work
 * — something failed, tell me what the evidence means". These assert that the
 * mission actually asks, rather than showing the diagnosis and then asking the
 * learner to recognise the repair.
 * ------------------------------------------------------------------ */

describe("the learner reasons before the interface explains", () => {
  it("opens by asking what PC-A does, before narrating what PC-A does", () => {
    const first = journey().stages[0];

    expect(first?.prediction).toBeDefined();
    expect(first?.prediction?.correctOption).toBeDefined();

    // The prompt states the two facts the learner reasons from, and neither
    // the prompt nor the options give the comparison away as the answer.
    expect(first?.prediction?.prompt).toContain("192.168.2.20");
    expect(first?.prediction?.prompt).toContain("192.168.1.10/24");
  });

  it("asks the learner what the stopping point rules out", () => {
    const stop = journey().stages.find(
      (stage) => stage.stageId === journey().fault?.stopsAtStageId
    );

    const prompts = (stop?.knowledgeChecks ?? []).map((check) => check.prompt);

    expect(prompts.some((prompt) => prompt.includes("conclude"))).toBe(true);
  });

  it("asks the learner what to inspect next, before showing them", () => {
    const stop = journey().stages.find(
      (stage) => stage.stageId === journey().fault?.stopsAtStageId
    );

    const inspect = (stop?.knowledgeChecks ?? []).find((check) =>
      check.prompt.includes("inspect next")
    );

    expect(inspect).toBeDefined();
    expect(inspect?.correctOption).toContain("hand off to");
  });

  it("asks the learner to apply the /24 rule to the configured gateway", () => {
    const stop = journey().stages.find(
      (stage) => stage.stageId === journey().fault?.stopsAtStageId
    );

    const reach = (stop?.knowledgeChecks ?? []).find((check) =>
      check.prompt.includes("directly")
    );

    expect(reach).toBeDefined();
    expect(reach?.prompt).toContain("192.168.1.10/24");
    expect(reach?.prompt).toContain("192.168.2.1");
    expect(reach?.correctOption).toContain("192.168.1.0/24");
  });

  it("orders the three reasoning steps: rule out, then inspect, then evaluate", () => {
    const stop = journey().stages.find(
      (stage) => stage.stageId === journey().fault?.stopsAtStageId
    );

    expect((stop?.knowledgeChecks ?? []).map((check) => check.checkId)).toEqual([
      "f2-what-it-rules-out",
      "f2-what-to-inspect",
      "f2-can-it-reach-the-gateway"
    ]);
  });

  it("hands the learner no diagnosis in the stage that stops", () => {
    /*
      The stopping stage used to carry a `decision` telling the learner to
      compare the gateway against PC-A's own address — which is the answer to
      the question the mission is about to ask. The narration states what is
      observable and stops there.
    */
    const stop = journey().stages.find(
      (stage) => stage.stageId === journey().fault?.stopsAtStageId
    );

    expect(stop?.decision).toBeUndefined();
    expect(stop?.narration).toContain("never leaves PC-A");
    expect(stop?.narration).not.toContain("192.168.2.1");
  });

  it("puts the evidence on screen without interpreting it", () => {
    // The learner needs PC-A's address, PC-A's network and the configured
    // gateway to answer. All three are readings, not conclusions.
    const stop = journey().stages.find(
      (stage) => stage.stageId === journey().fault?.stopsAtStageId
    );

    /*
      Checked as LABEL AND VALUE together. Mutation testing renamed a label to
      something meaningless and left the address in place; a value-only
      assertion passed, while a learner would have been looking at an
      unattributed number and asked to reason from it.
    */
    const pairs = (stop?.deviceFacts ?? []).flatMap((entry) =>
      entry.facts.map((fact) => `${fact.label} = ${fact.value}`)
    );

    expect(pairs).toContain("PC-A's own address = 192.168.1.10/24");
    expect(pairs).toContain("PC-A's own network = 192.168.1.0/24");
    expect(pairs).toContain(
      "Currently configured to hand off to = 192.168.2.1"
    );

    // And nothing there does the reasoning for the learner.
    for (const pair of pairs) {
      expect(`${pair} concludes: ${/not in|cannot|wrong|unreachable/i.test(pair)}`)
        .toBe(`${pair} concludes: false`);
    }
  });
});

describe("the repair choices are misconceptions rather than filler", () => {
  it("offers exactly one change that repairs the fault", () => {
    const resolving = actions().filter((action) => action.resolvesFault);
    expect(resolving).toHaveLength(1);
    expect(resolving[0]?.label).toContain("192.168.1.1");
  });

  it("offers the local-reachability misconception", () => {
    // "PC-A can reach the Printer, so the Printer can be its gateway."
    const printer = actions().find((action) => action.label.includes("192.168.1.12"));

    expect(printer?.resolvesFault).toBe(false);
    expect(printer?.observation).toContain("CAN reach");
    expect(printer?.observation).toContain("not sufficient");
  });

  it("offers the destination-as-gateway misconception", () => {
    const asGateway = actions().find(
      (action) =>
        action.label.includes("gateway") && action.label.includes("192.168.2.20")
    );

    expect(asGateway?.resolvesFault).toBe(false);
    expect(asGateway?.observation).toContain("not on PC-A's network");
  });

  it("offers the change-the-destination misconception", () => {
    const destination = actions().find((action) =>
      action.label.startsWith("Change the destination")
    );

    expect(destination?.resolvesFault).toBe(false);
    expect(destination?.observation).toContain("repairs nothing");
  });

  it("gives every wrong choice targeted remediation and an invitation to retry", () => {
    for (const action of actions().filter((entry) => !entry.resolvesFault)) {
      expect(`${action.actionId} invites another attempt: ${action.observation.includes("Choose again")}`)
        .toBe(`${action.actionId} invites another attempt: true`);

      // Targeted, not a replay of the generic explanation.
      expect(action.observation).not.toBe(journey().fault?.explanation);
      expect(action.observation.length).toBeGreaterThan(120);
    }
  });

  it("needs no concept the course has not taught", () => {
    const text = actions()
      .map((action) => `${action.label} ${action.observation}`)
      .join("\n");

    for (const untaught of ["VLAN", "trunk", "NAT", "DHCP", "route table", "metric"]) {
      expect(`${untaught}: ${text.includes(untaught)}`).toBe(`${untaught}: false`);
    }
  });
});

/** The authored remediation choices. */
function actions() {
  return journey().actions;
}


/* ------------------------------------------------------------------ *
 * THE PRE-WORKSPACE SETUP
 *
 * Mission 8's new instructional problem is HOW TO INTERPRET A FAILED RESULT.
 * Missions 1 to 7 already taught everything else it needs, so the setup
 * reactivates the topology, shows the failure, and reasons about it — without
 * re-teaching the course and without disclosing the diagnosis.
 *
 * These protect structure, ordering and disclosure. Whether the prose teaches
 * well is Tier 3 review and Founder UAT (CURR-009 s14a); nothing here tries to
 * judge writing quality.
 * ------------------------------------------------------------------ */

describe("the setup establishes the situation without giving the answer", () => {
  const PRE_WORKSPACE = [
    "m8-s1-a-result-you-have-to-act-on",
    "m8-s2-the-test-that-fails",
    "m8-s3-a-failure-points-in-many-directions"
  ] as const;

  function step(stableId: string) {
    const found = mission(M8).steps.find((entry) => entry.stableId === stableId);
    if (found === undefined) throw new Error(`no step ${stableId}`);
    return found;
  }

  function paragraphsOf(stableId: string): readonly string[] {
    const content = step(stableId).content;
    if (content.type !== "concept") throw new Error(`${stableId} is not a concept`);
    return content.paragraphs;
  }

  /** Everything the learner reads BEFORE the workspace opens. */
  function setupText(): string {
    return PRE_WORKSPACE.map((stableId) => {
      const content = step(stableId).content;
      if (content.type === "concept") {
        return [content.title ?? "", ...content.paragraphs].join("\n");
      }
      if (content.type === "command") {
        return [content.caption ?? "", content.command ?? "", content.output ?? ""].join("\n");
      }
      return "";
    }).join("\n");
  }

  it("keeps the pre-workspace steps, their ids and their order", () => {
    // Step ids are curriculum identity. A rewrite replaces copy, not steps.
    const ids = mission(M8).steps.map((entry) => entry.stableId);

    expect(ids.slice(0, 3)).toEqual([...PRE_WORKSPACE]);
    expect(ids).toHaveLength(7);
    expect(ids[3]).toBe("m8-s4-watching-where-it-stops");
  });

  it("names the source, the destination, both networks and the router", () => {
    const opening = paragraphsOf("m8-s1-a-result-you-have-to-act-on").join("\n");

    for (const fact of [
      "PC-A",
      "PC-C",
      "192.168.1.0/24",
      "192.168.2.0/24",
      "Router-1"
    ]) {
      expect(`the setup names ${fact}: ${opening.includes(fact)}`).toBe(
        `the setup names ${fact}: true`
      );
    }
  });

  it("reactivates the topology rather than re-teaching the prefix", () => {
    // Mission 4 taught /24. The setup needs the two networks, not the lesson.
    const opening = paragraphsOf("m8-s1-a-result-you-have-to-act-on").join("\n").toLowerCase();

    for (const reteaching of ["octet", "network portion", "host portion", "prefix length"]) {
      expect(`the setup re-teaches "${reteaching}": ${opening.includes(reteaching)}`).toBe(
        `the setup re-teaches "${reteaching}": false`
      );
    }
  });

  it("reaches the evidence in three paragraphs or fewer", () => {
    // The instructional problem is reading a failure, so the failure has to
    // arrive quickly rather than after a refresher.
    expect(paragraphsOf("m8-s1-a-result-you-have-to-act-on").length).toBeLessThanOrEqual(3);
  });

  it("discloses no part of the diagnosis before the workspace", () => {
    /*
      The central invariant of this pass. The learner derives the fault inside
      the workspace; nothing before it may name the faulty device, the faulty
      setting, the wrong value, the correct value, or the shape of the repair.
    */
    const text = setupText();

    for (const disclosure of [
      BAD_GATEWAY,
      GOOD_GATEWAY,
      "default gateway",
      "one correction",
      "single wrong setting",
      "one setting",
      "Mission 5",
      "misconfigured",
      "wrong setting",
      "where the packet stops"
    ]) {
      expect(`the setup discloses "${disclosure}": ${text.includes(disclosure)}`).toBe(
        `the setup discloses "${disclosure}": false`
      );
    }
  });

  it("states only what the failed test actually establishes", () => {
    // Not "the connection failed", not "PC-C was unreachable" — the evidence is
    // specifically that PC-A received no reply.
    const reasoning = paragraphsOf("m8-s3-a-failure-points-in-many-directions");
    const first = reasoning[0] ?? "";

    expect(first).toContain("PC-A did not receive a reply from 192.168.2.20");

    for (const overclaim of [
      "PC-C was unreachable",
      "the connection failed",
      "the network is down.",
      "the packet failed",
      "something went wrong"
    ]) {
      expect(`the setup overclaims "${overclaim}": ${reasoning.join("\n").includes(overclaim)}`)
        .toBe(`the setup overclaims "${overclaim}": false`);
    }
  });

  it("reasons in order: fact, then limit, then meaning, then next move", () => {
    /*
      CONCRETE BEFORE ABSTRACT. The observable fact must come before the
      principle drawn from it — the ordering DEC-067 requires, and the specific
      thing Founder UAT rejected when the abstraction led.
    */
    const reasoning = paragraphsOf("m8-s3-a-failure-points-in-many-directions");
    const index = (needle: string) =>
      reasoning.findIndex((paragraph) => paragraph.includes(needle));

    const fact = index("did not receive a reply");
    const limit = index("It does not tell you why");
    const meaning = index("failed test and a diagnosis");
    const nextMove = index("follow the packet from PC-A");
    const scope = index("later course");

    for (const [label, position] of [
      ["the observable fact", fact],
      ["the limit of the evidence", limit],
      ["the technical meaning", meaning],
      ["the next move", nextMove],
      ["the scope boundary", scope]
    ] as const) {
      expect(`${label} is present: ${position >= 0}`).toBe(`${label} is present: true`);
    }

    expect(`fact before limit: ${fact < limit}`).toBe("fact before limit: true");
    expect(`limit before meaning: ${limit < meaning}`).toBe("limit before meaning: true");
    expect(`meaning before the next move: ${meaning < nextMove}`).toBe(
      "meaning before the next move: true"
    );
    expect(`the next move before the scope boundary: ${nextMove < scope}`).toBe(
      "the next move before the scope boundary: true"
    );
  });

  it("leaves several causes open, naming more than one candidate", () => {
    // If only one cause survived the setup, the workspace would be a formality.
    const reasoning = paragraphsOf("m8-s3-a-failure-points-in-many-directions").join("\n");

    for (const candidate of ["PC-C", "Router-1", "PC-A", "connection"]) {
      expect(`the setup leaves ${candidate} open: ${reasoning.includes(candidate)}`).toBe(
        `the setup leaves ${candidate} open: true`
      );
    }
  });

  it("states the learner's job once, not on every screen", () => {
    /*
      Founder UAT found the same instruction three times before the workspace.
      The job is set where the reasoning produces it — in the setup's closing
      paragraphs — and the workspace caption then says what to DO, not what the
      exercise is for.
    */
    const setup = setupText().toLowerCase();
    const restatements = (setup.match(/your job/g) ?? []).length;

    expect(`the job is stated ${restatements} time(s)`).toBe(
      "the job is stated 1 time(s)"
    );
  });

  it("introduces no deferred protocol vocabulary in the setup", () => {
    const text = setupText();

    for (const deferred of [
      "ICMP",
      "TTL",
      "Layer 2",
      "Layer 3",
      "ARP",
      "routing table",
      "subnetting"
    ]) {
      expect(`the setup introduces ${deferred}: ${text.includes(deferred)}`).toBe(
        `the setup introduces ${deferred}: false`
      );
    }
  });
});

describe("the mission description does not answer the mission", () => {
  /**
   * The description is learner-facing on a FALLBACK rendering path — the
   * bundled brief, shown while the instruction request is idle, loading, or
   * has failed in a way that permits fallback. Repository discovery found it
   * naming the fault class and the mission that teaches it.
   */
  it("discloses no part of the diagnosis", () => {
    const description = mission(M8).description ?? "";

    for (const disclosure of [
      BAD_GATEWAY,
      GOOD_GATEWAY,
      "default gateway",
      "single wrong setting",
      "one wrong setting",
      "Mission 5",
      "PC-A",
      "wrong setting",
      "misconfigured"
    ]) {
      expect(`the description discloses "${disclosure}": ${description.includes(disclosure)}`)
        .toBe(`the description discloses "${disclosure}": false`);
    }
  });

  it("still declares what the learner needs before starting", () => {
    // BEGINNER-COMPLETE-1, counted across all eight missions by verify-wpj.sh.
    // The prerequisite declaration carries no disclosure and is preserved.
    const description = mission(M8).description ?? "";

    expect(description).toContain("Before this mission you should be able to:");
    expect(description).toContain("Mission 7");
  });

  it("says what the learner will do, in one sentence of orientation", () => {
    const description = mission(M8).description ?? "";

    expect(description).toContain("A test that worked before now fails");
    expect(description).toContain("use the stopping point to decide what to investigate next");
  });
});
