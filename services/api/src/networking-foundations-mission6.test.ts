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
 * WP-J7 — Networking Foundations Mission 6, "Routers, and the journey end to
 * end".
 *
 * ## The integration mission
 *
 * Mission 6 is the only authored mission that DEVELOPS nothing. Every one of
 * its six competency links is `reinforces`, and its description says why: "This
 * mission introduces no new responsibility of its own. It puts five missions
 * together into one continuous story."
 *
 * That shapes this suite. There is no new capability to assert. What has to be
 * protected is that the integration actually happens — the round trip completes
 * in both directions, the pieces from Missions 1 to 5 are genuinely present,
 * and the three concepts the ledger grants arrive only after the learner has
 * watched the behaviour they name.
 *
 * ## What survives, and what is rebuilt
 *
 * The mission's conceptual centre is a comparison the learner must be able to
 * make from the journey itself: the destination survives the whole trip, and
 * the local-delivery wrapper is thrown away and rebuilt for each leg. Both
 * halves are authored as `deviceFacts`, and both are asserted here — because a
 * curriculum that stated only one of them would leave the comparison with
 * nothing to compare.
 *
 * ## What this suite cannot decide
 *
 * Whether a round trip of this length reads as one coherent story rather than a
 * long sequence, and whether re-walking five missions feels like payoff or like
 * repetition. Both are Tier 3 human review (CURR-009 section 14a), and the
 * second is the specific risk in an integration mission.
 */

const REPOSITORY_ROOT = join(__dirname, "..", "..", "..");

const DOCUMENT_PATH = join(
  REPOSITORY_ROOT,
  "content",
  "curriculum",
  "networking-foundations.json"
);

const M6 = "nf-m6-routers-and-the-journey";
const MODULE3 = "nf-mod3-reaching-another-network";
const JOURNEY = "nf-pj6-end-to-end";

/** Continuity pinned from earlier missions, plus the two values WP-J7 adds. */
const CONTINUITY = {
  pcA: { ip: "192.168.1.10/24", mac: "00:1b:44:11:3a:b7" },
  pcB: { ip: "192.168.1.11/24", mac: "00:1b:44:11:3a:c2" },
  printer: { ip: "192.168.1.12/24", mac: "00:1b:44:11:3a:d9" },
  routerLan: { ip: "192.168.1.1/24", mac: "00:1b:44:11:3a:01" },
  /** New in WP-J7: the far side Mission 4 showed without an address. */
  routerFar: { ip: "192.168.2.1/24", mac: "00:1b:44:11:3a:02" },
  /** New in WP-J7: PC-C had an address in Mission 4 but no hardware identity. */
  pcC: { ip: "192.168.2.20/24", mac: "00:1b:44:11:3a:e4" }
} as const;

/** Missions no slice has authored yet. */
const UNAUTHORED = [
  "nf-m8-when-it-does-not-work"
] as const;

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

function journey(): PacketJourneyParameters {
  const step = mission(M6).steps.find(
    (s) =>
      s.content.type === "interaction" &&
      s.content.interactionStableId === JOURNEY
  );

  if (step === undefined || step.content.type !== "interaction") {
    throw new Error(`Mission 6 authors no journey ${JOURNEY}`);
  }

  const parameters = step.content.parameters;
  if (parameters.interactionType !== "packet_journey") {
    throw new Error(`${JOURNEY} is not a packet journey`);
  }

  return parameters;
}

/** Every string Mission 6 puts in front of a learner, from parsed content. */
function learnerFacingText(): string {
  const parts: string[] = [];

  const collect = (j: PacketJourneyParameters) => {
    parts.push(j.traffic.label, j.traffic.startActionLabel);
    for (const group of j.groups ?? []) parts.push(group.label);
    for (const node of j.nodes) {
      parts.push(node.label);
      if (node.about !== undefined) parts.push(node.about);
      for (const iface of node.interfaces) {
        parts.push(iface.label);
        for (const attribute of iface.attributes) {
          parts.push(attribute.label, attribute.value);
        }
      }
    }
    for (const link of j.links) parts.push(link.label);
    for (const stage of j.stages) {
      parts.push(stage.narration);
      if (stage.decision !== undefined) parts.push(stage.decision);
      if (stage.prediction !== undefined) {
        parts.push(stage.prediction.prompt, ...stage.prediction.options);
      }
      for (const facts of stage.deviceFacts ?? []) {
        parts.push(facts.label);
        for (const fact of facts.facts) parts.push(fact.label, fact.value);
      }
    }
    for (const action of j.actions) parts.push(action.label, action.observation);
    parts.push(j.confirmation.narration, j.confirmation.summary);
  };

  for (const step of mission(M6).steps) {
    const content = step.content;
    switch (content.type) {
      case "concept":
        if (content.title !== undefined) parts.push(content.title);
        parts.push(...content.paragraphs);
        break;
      case "interaction":
        if (content.caption !== undefined) parts.push(content.caption);
        parts.push(content.textEquivalent);
        if (content.parameters.interactionType === "packet_journey") {
          collect(content.parameters);
        }
        break;
      default:
        throw new Error(`Mission 6 authored an unexpected step: ${step.stableId}`);
    }
  }

  return parts.join("\n");
}

/** The index of the first concept step whose prose uses a word. */
function firstStepUsing(word: string): number {
  return mission(M6).steps.findIndex((step) => {
    const content = step.content;
    if (content.type !== "concept") return false;
    return [content.title ?? "", ...content.paragraphs].some((p) =>
      usesWord(p, word)
    );
  });
}

const journeyIndex = () =>
  mission(M6).steps.findIndex((step) => step.content.type === "interaction");

/** Every authored fact in the journey, flattened to "label: value". */
function allFacts(): string[] {
  return journey().stages.flatMap((stage) =>
    (stage.deviceFacts ?? []).flatMap((entry) =>
      entry.facts.map((fact) => `${entry.label} | ${fact.label}: ${fact.value}`)
    )
  );
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

describe("Mission 6 is the approved mission, in the approved place", () => {
  it("keeps its stable identity, title, module and position", () => {
    const m = mission(M6);

    expect({
      stableId: m.stableId,
      title: m.title,
      moduleStableId: m.moduleStableId,
      position: m.position
    }).toEqual({
      stableId: M6,
      title: "Mission 6 — Routers, and the journey end to end",
      moduleStableId: MODULE3,
      position: 1
    });
  });

  it("declares what the learner needs before starting", () => {
    expect(mission(M6).description).toMatch(/Before this mission you should/);
  });

  it("carries the approved competency relationships, unchanged", () => {
    const links = mission(M6).competencies.map((link) => ({
      competencyStableId: link.competencyStableId,
      required: link.required,
      relationship: link.relationship
    }));

    expect(links).toEqual([
      { competencyStableId: "net.default-gateway", required: true, relationship: "reinforces" },
      { competencyStableId: "net.subnet-boundaries", required: true, relationship: "reinforces" },
      { competencyStableId: "net.local-delivery", required: false, relationship: "reinforces" },
      { competencyStableId: "net.ip-addressing", required: false, relationship: "reinforces" },
      { competencyStableId: "net.address-identification", required: false, relationship: "reinforces" },
      { competencyStableId: "net.topology-literacy", required: false, relationship: "reinforces" }
    ]);
  });

  it("develops no competency at all", () => {
    // The defining property of an integration mission, and the one most likely
    // to be eroded by a well-meaning edit: adding a `develops` link here would
    // claim Mission 6 teaches a new capability, which its own description
    // denies and which would leave some other mission's competency with two
    // accountable owners.
    const develops = mission(M6).competencies.filter(
      (link) => link.relationship === "develops"
    );

    expect(develops).toEqual([]);
  });

  it("reinforces only competencies developed in earlier missions", () => {
    for (const link of mission(M6).competencies) {
      const developer = document.missions.find((m) =>
        m.competencies.some(
          (l) =>
            l.competencyStableId === link.competencyStableId &&
            l.relationship === "develops"
        )
      );

      const earlier = developer !== undefined && developer.position < 6;
      expect(`${link.competencyStableId} developed earlier: ${earlier}`).toBe(
        `${link.competencyStableId} developed earlier: true`
      );
    }
  });

  it("leaves every still-unauthored mission with no step of any kind", () => {
    for (const stableId of UNAUTHORED) {
      expect(`${stableId} ${mission(stableId).steps.length}`).toBe(
        `${stableId} 0`
      );
    }
  });

  it("authors no asset anywhere", () => {
    for (const m of document.missions) {
      expect(`${m.stableId} ${m.assets.length}`).toBe(`${m.stableId} 0`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

describe("Mission 6 uses only the step types this slice approved", () => {
  it("authors concept and interaction steps and nothing else", () => {
    const types = [
      ...new Set(mission(M6).steps.map((step) => step.content.type))
    ].sort();

    expect(types).toEqual(["concept", "interaction"]);
  });

  it("authors exactly one journey, and it is authored teaching", () => {
    // One continuous round trip. Splitting it would break the very continuity
    // the mission exists to show — the reply is the second half of one
    // exchange, not a separate exercise.
    const interactions = mission(M6).steps.filter(
      (step) => step.content.type === "interaction"
    );

    expect(interactions.length).toBe(1);

    const content = interactions[0]?.content;
    if (content?.type !== "interaction") throw new Error("not interaction");
    expect(content.sourceKind).toBe("authored_teaching");
    expect(content.supportLevel).toBe("show_me");
    expect(content.interactionType).toBe("packet_journey");
    expect(content.textEquivalent.length).toBeGreaterThan(800);
  });

  it("authors no standalone prediction step and no command step", () => {
    // Architect Decisions B and F. Mission 5 already provided the
    // configuration-reading experience; Mission 6's problem is following the
    // traffic, and its predictions live inside the journey where committing to
    // one is interactive.
    const forbidden = mission(M6).steps.filter((step) =>
      ["prediction", "command", "diagram", "practice", "reference"].includes(
        step.content.type
      )
    );

    expect(forbidden).toEqual([]);
  });

  it("gives every step a unique id, a contiguous position and this mission's name", () => {
    const steps = mission(M6).steps;
    const ids = steps.map((step) => step.stableId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(steps.map((step) => step.position)).toEqual(
      steps.map((_step, index) => index)
    );
    for (const id of ids) expect(id.startsWith("m6-s")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The round trip
 * ------------------------------------------------------------------ */

describe("the journey goes out and comes back", () => {
  it("starts at PC-A and is addressed to PC-C", () => {
    const j = journey();
    expect({ from: j.traffic.sourceNodeId, to: j.traffic.destinationNodeId }).toEqual({
      from: "pc-a",
      to: "pc-c"
    });
  });

  it("reaches PC-C and then returns to PC-A", () => {
    // Mission 7 depends on this literally: "follow a message from one group to
    // another AND BACK". A one-way trip would leave Mission 7 without its
    // stated prerequisite.
    const nodes = journey().stages.map((stage) => stage.atNodeId);

    const reachesC = nodes.indexOf("pc-c");
    expect(reachesC).toBeGreaterThan(0);

    const returnsToA = nodes.lastIndexOf("pc-a");
    expect(
      `reaches PC-C at ${reachesC}, back at PC-A at ${returnsToA}, ordered ${reachesC < returnsToA}`
    ).toBe(
      `reaches PC-C at ${reachesC}, back at PC-A at ${returnsToA}, ordered true`
    );
  });

  it("crosses Router-1 in both directions", () => {
    const atRouter = journey()
      .stages.map((stage, index) => ({ stage, index }))
      .filter(({ stage }) => stage.atNodeId === "r-1");

    expect(atRouter.length).toBeGreaterThanOrEqual(2);
  });

  it("uses both of Router-1's connections", () => {
    const links = new Set(
      journey()
        .stages.map((stage) => stage.viaLinkId)
        .filter((id): id is string => id !== undefined)
    );

    expect(links.has("link-r-1")).toBe(true);
    expect(links.has("link-far")).toBe(true);
  });

  it("never stops, and authors no fault or repair", () => {
    // Mission 6 is the successful journey. Faults are Mission 8's, and a fault
    // would also give the journey an outcome depending on a learner action.
    const j = journey();
    expect(j.stages.every((stage) => stage.outcome === "proceeds")).toBe(true);
    expect(j.fault).toBeUndefined();
    expect(j.actions).toEqual([]);
  });

  it("never delivers anything to PC-B or the Printer", () => {
    const j = journey();
    const touched = new Set(j.stages.map((stage) => stage.atNodeId));
    expect(touched.has("pc-b")).toBe(false);
    expect(touched.has("printer")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * What survives, and what is rebuilt — the conceptual centre
 * ------------------------------------------------------------------ */

describe("the journey shows both halves of the comparison", () => {
  it("states the destination that survives, more than once", () => {
    // Authored as a fact rather than derived. If the curriculum stopped saying
    // it, the comparison would have only one side and the mission's central
    // idea would rest on the learner noticing an absence.
    const surviving = allFacts().filter((fact) =>
      /ultimately going|ultimately for|What arrived|What PC-[AC] settled/i.test(fact)
    );

    expect(surviving.length).toBeGreaterThanOrEqual(3);
  });

  it("states a per-leg local delivery, on more than one leg", () => {
    const legs = allFacts().filter((fact) =>
      /This leg's local delivery/i.test(fact)
    );

    expect(legs.length).toBeGreaterThanOrEqual(4);
  });

  it("addresses each leg to a hardware identity, and they are not all the same", () => {
    // The wrapper is rebuilt per leg. Four legs delivering to one identity
    // would be a single wrapper carried through, which is the misconception
    // this mission exists to prevent.
    const delivering = allFacts()
      .filter((fact) => /Delivering to/i.test(fact))
      .map((fact) => fact.split("Delivering to:")[1]?.trim() ?? "");

    expect(delivering.length).toBeGreaterThanOrEqual(4);
    expect(new Set(delivering).size).toBeGreaterThanOrEqual(3);
  });

  it("names the network each leg happens on, and uses both", () => {
    const networks = new Set(
      allFacts()
        .filter((fact) => /On network/i.test(fact))
        .map((fact) => fact.split("On network:")[1]?.trim() ?? "")
    );

    expect(networks.has("192.168.1")).toBe(true);
    expect(networks.has("192.168.2")).toBe(true);
  });

  it("keeps the ultimate destination unchanged while it is in transit", () => {
    // The outbound half must never state a different ultimate destination than
    // the one PC-A chose. A mutation that "corrected" it mid-flight would teach
    // precisely the wrong model.
    const outbound = journey().stages.slice(
      0,
      journey().stages.findIndex((stage) => stage.stageId.startsWith("t5"))
    );

    const destinations = outbound.flatMap((stage) =>
      (stage.deviceFacts ?? []).flatMap((entry) =>
        entry.facts
          .filter((fact) => /^To$|trying to reach/i.test(fact.label))
          .map((fact) => fact.value)
      )
    );

    expect(destinations.length).toBeGreaterThan(0);
    for (const destination of destinations) {
      expect(`outbound destination ${destination}`).toBe(
        "outbound destination 192.168.2.20"
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * Experience before abstraction
 * ------------------------------------------------------------------ */

describe("every concept arrives after the behaviour it names", () => {
  for (const term of ["routing", "packets?", "Layer 2", "Layer 3"]) {
    it(`shows the behaviour before naming "${term}"`, () => {
      const seen = journeyIndex();
      const named = firstStepUsing(term);

      expect(
        `journey ${seen}, ${term} named ${named}, ordered ${seen < named}`
      ).toBe(`journey ${seen}, ${term} named ${named}, ordered true`);
    });
  }

  it("opens by reopening Mission 5's question, naming nothing", () => {
    const first = mission(M6).steps[0]?.content;
    if (first?.type !== "concept") throw new Error("expected a concept first");

    const text = [first.title ?? "", ...first.paragraphs].join("\n");

    expect(text).toMatch(/Mission 5/);
    expect(text).toMatch(/Router-1/);
    for (const term of ["routing", "packets?", "Layer 2", "Layer 3"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });

  it("names frame before or with packet, never packet alone", () => {
    // `frame` is Mission 2's word. The packet is introduced by contrast with
    // something already known, so the step that first says "packet" must also
    // carry the frame it is being distinguished from.
    const naming = mission(M6).steps[firstStepUsing("packets?")]?.content;
    if (naming?.type !== "concept") throw new Error("expected a concept");

    const text = [naming.title ?? "", ...naming.paragraphs].join("\n");
    expect(usesWord(text, "frames?")).toBe(true);
    expect(text).toMatch(/Mission 2/);
  });

  it("does name the three concepts it is responsible for", () => {
    const text = learnerFacingText();
    for (const term of ["routing", "packets?", "Layer 2", "Layer 3"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: true });
    }
  });
});

/* ------------------------------------------------------------------ *
 * Layer 2 / Layer 3, narrowly
 * ------------------------------------------------------------------ */

describe("the two labels stay labels, not a framework", () => {
  it("teaches no numbered layer model", () => {
    const text = learnerFacingText();
    for (const term of [
      "OSI",
      "TCP/IP",
      "seven-layer",
      "seven layers",
      "protocol stack",
      "encapsulation",
      "Layer 1",
      "Layer 4",
      "Layer 5",
      "Layer 6",
      "Layer 7"
    ]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });

  it("says the formal models are deferred rather than pretending they do not exist", () => {
    // Honesty about a deferral is different from silence about it. The learner
    // is told the models exist and that this course has not given them a reason
    // to need one.
    expect(learnerFacingText()).toMatch(
      /formal models|when you have a reason/i
    );
  });

  it("presents the labels as shorthand for observed behaviour", () => {
    const naming = mission(M6).steps[firstStepUsing("Layer 2")]?.content;
    if (naming?.type !== "concept") throw new Error("expected a concept");

    const text = naming.paragraphs.join("\n");
    expect(text).toMatch(/shorthand|already watched|already understood/i);
  });
});

/* ------------------------------------------------------------------ *
 * Continuity
 * ------------------------------------------------------------------ */

describe("every value the earlier missions established is unchanged", () => {
  const nodeOf = (nodeId: string) =>
    journey().nodes.find((node) => node.nodeId === nodeId);

  const attributesOf = (nodeId: string, interfaceId?: string) =>
    (nodeOf(nodeId)?.interfaces ?? [])
      .filter((iface) => interfaceId === undefined || iface.interfaceId === interfaceId)
      .flatMap((iface) => iface.attributes.map((a) => a.value));

  it("keeps PC-A, PC-B and the Printer exactly as Missions 2 to 4 left them", () => {
    expect(attributesOf("pc-a")).toEqual(
      expect.arrayContaining([CONTINUITY.pcA.ip, CONTINUITY.pcA.mac])
    );
    expect(attributesOf("pc-b")).toEqual(
      expect.arrayContaining([CONTINUITY.pcB.ip, CONTINUITY.pcB.mac])
    );
    expect(attributesOf("printer")).toEqual(
      expect.arrayContaining([CONTINUITY.printer.ip, CONTINUITY.printer.mac])
    );
  });

  it("keeps Router-1's local connection as Missions 4 and 5 established it", () => {
    expect(attributesOf("r-1", "r-1-lan")).toEqual(
      expect.arrayContaining([CONTINUITY.routerLan.ip, CONTINUITY.routerLan.mac])
    );
  });

  it("gives Router-1's far connection the approved address and a pinned identity", () => {
    // New in WP-J7. Mission 4 showed `r-1-far` with only "Connects to = PC-C";
    // the far-side local delivery needs both an address and an identity, and
    // both are pinned so a later edit cannot drift them.
    expect(attributesOf("r-1", "r-1-far")).toEqual(
      expect.arrayContaining([CONTINUITY.routerFar.ip, CONTINUITY.routerFar.mac])
    );
  });

  it("keeps PC-C's address and pins the identity WP-J7 adds", () => {
    expect(attributesOf("pc-c")).toEqual(
      expect.arrayContaining([CONTINUITY.pcC.ip, CONTINUITY.pcC.mac])
    );
  });

  it("uses the interface identities Missions 4 and 5 established", () => {
    const ids = (nodeOf("r-1")?.interfaces ?? []).map((i) => i.interfaceId);
    expect(ids).toEqual(["r-1-lan", "r-1-far"]);
  });

  it("does not contradict Mission 5 about 192.168.2.1", () => {
    // Mission 5 taught that 192.168.2.1 could not be PC-A's default gateway,
    // because PC-A cannot reach it directly. Mission 6 uses that same address
    // as a perfectly ordinary address on Router-1's far side. Both are true,
    // and Mission 5 must still say what it said.
    const m5 = JSON.stringify(mission("nf-m5-the-default-gateway"));
    expect(m5).toContain("192.168.2.1");
    expect(m5).toMatch(/could not|not in its group/i);

    // And Mission 6 must not restate it as an invalid address.
    const text = learnerFacingText();
    expect(text).not.toMatch(/192\.168\.2\.1 is invalid/i);
    expect(text).not.toMatch(/192\.168\.2\.1 was wrong/i);
  });

  it("keeps every MAC address inside the established fictional scheme", () => {
    const macs = journey()
      .nodes.flatMap((node) =>
        node.interfaces.flatMap((iface) => iface.attributes.map((a) => a.value))
      )
      .filter((value) => /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(value));

    expect(macs.length).toBeGreaterThanOrEqual(6);
    for (const mac of macs) {
      expect(`${mac} in scheme: ${mac.startsWith("00:1b:44:11:3a:")}`).toBe(
        `${mac} in scheme: true`
      );
    }
    // Every identity distinct: two devices sharing one would make the per-leg
    // delivery story incoherent.
    expect(new Set(macs).size).toBe(macs.length);
  });
});

/* ------------------------------------------------------------------ *
 * Reuse and commitment
 * ------------------------------------------------------------------ */

describe("Mission 6 is the payoff for Missions 1 to 5", () => {
  it("names each earlier mission it is drawing on", () => {
    const text = learnerFacingText();
    for (const label of ["Mission 1", "Mission 2", "Mission 4", "Mission 5"]) {
      expect({ label, named: text.includes(label) }).toEqual({
        label,
        named: true
      });
    }
  });

  it("asks the learner to commit inside the journey", () => {
    const predicting = journey().stages.filter(
      (stage) => stage.prediction !== undefined
    );

    expect(predicting.length).toBeGreaterThanOrEqual(2);
  });

  it("asks the return-trip question as near-transfer", () => {
    // The reply is where the learner applies the outbound reasoning themselves
    // rather than watching it applied. That prediction is the transfer.
    const prompts = journey()
      .stages.filter((stage) => stage.prediction !== undefined)
      .map((stage) => stage.prediction?.prompt ?? "");

    expect(prompts.some((p) => p.includes("192.168.2.20/24"))).toBe(true);
    expect(prompts.some((p) => /same rule|PC-C/i.test(p))).toBe(true);
  });

  it("gives every prediction at least two options and no answer key", () => {
    for (const stage of journey().stages) {
      if (stage.prediction === undefined) continue;
      expect(stage.prediction.options.length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(stage.prediction)).toEqual(["prompt", "options"]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The Mission 7 handoff
 * ------------------------------------------------------------------ */

describe("Mission 6 hands verification to Mission 7 without doing any", () => {
  it("closes on how the learner would find out for themselves", () => {
    const steps = mission(M6).steps;
    const last = steps[steps.length - 1]?.content;
    if (last?.type !== "concept") throw new Error("expected a concept last");

    const text = last.paragraphs.join("\n");
    expect(text).toContain("?");
    expect(text).toMatch(/find out|shown/i);
  });

  it("performs no test and states no result", () => {
    const text = learnerFacingText();
    for (const term of ["ping", "ICMP", "test", "verify", "reachability", "prove"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });
});

/* ------------------------------------------------------------------ *
 * Teach before use
 * ------------------------------------------------------------------ */

describe("no later mission's vocabulary arrives in Mission 6", () => {
  /**
   * Terms the ledger places at Mission 7 or later, plus the course-level
   * exclusions.
   *
   * `routing`, `packet` and the two layer labels are absent from this list on
   * purpose: ledger rows 21 to 23 place them at Mission 6, and this is the
   * mission that introduces them. Note that `dynamic routing` remains forbidden
   * document-wide even though plain `routing` is now legal.
   */
  const DEFERRED = [
    "ping",
    "ICMP",
    "troubleshoot",
    "diagnose",
    "fault",
    "broken",
    "repair",
    "dynamic routing",
    "netmask",
    "CIDR",
    "subnets?",
    "IPv6",
    "DHCP",
    "DNS",
    "VLANs?",
    "trunks?",
    "subinterfaces?",
    "ACLs?",
    "NAT",
    "OSPF",
    "BGP"
  ] as const;

  for (const term of DEFERRED) {
    it(`does not use "${term}"`, () => {
      expect({ term, used: usesWord(learnerFacingText(), term) }).toEqual({
        term,
        used: false
      });
    });
  }
});

/* ------------------------------------------------------------------ *
 * Certification stays out of the learner's way
 * ------------------------------------------------------------------ */

describe("the learner-facing mission is certification-free", () => {
  const CERTIFICATION = [
    "Security\\+",
    "CompTIA",
    "certification",
    "certified",
    "exam",
    "objective",
    "domain"
  ] as const;

  for (const term of CERTIFICATION) {
    it(`does not mention "${term}"`, () => {
      expect({ term, used: usesWord(learnerFacingText(), term) }).toEqual({
        term,
        used: false
      });
    });
  }
});

/* ------------------------------------------------------------------ *
 * The evidence boundary
 * ------------------------------------------------------------------ */

describe("Mission 6 teaches and claims nothing about competency", () => {
  it("authors no assessment and no live lab", () => {
    const raw = JSON.stringify(mission(M6));
    expect(raw).not.toContain("assessmentStableId");
    expect(raw).not.toContain("live_lab");
  });

  it("stays at show_me, so nothing is withheld and nothing is proven", () => {
    for (const step of mission(M6).steps) {
      if (step.content.type !== "interaction") continue;
      expect(step.content.supportLevel).toBe("show_me");
    }
  });

  it("infers no mastery from having watched the journey", () => {
    const text = learnerFacingText();
    for (const term of ["score", "passed", "mastery", "you have proven"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });
});
