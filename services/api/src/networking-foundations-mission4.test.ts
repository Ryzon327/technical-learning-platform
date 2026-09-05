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
 * WP-J5 — Networking Foundations Mission 4, "The prefix, and the decision every
 * host makes".
 *
 * ## What makes Mission 4 correct
 *
 * Mission 4 is the largest mission in the course and the one the rest of it
 * rests on. It carries five new concepts — prefix length, network portion, host
 * portion, ARP, broadcast — and the risk that comes with that number is not
 * that any one of them is wrong. It is that they arrive as a list.
 *
 * So the assertions here are mostly about ORDER, not presence. Each concept has
 * to arrive after the learner has seen the thing it explains, and the mission's
 * shape has to keep one causal question live at a time:
 *
 *   why did PC-A behave differently  →  what does the 24 tell it
 *   →  is the destination local  →  if local, where does the factory identity
 *   come from  →  ARP  →  why did everybody hear it  →  broadcast
 *   →  what happens when it is not local  →  why Router-1  →  Mission 5
 *
 * A test cannot decide whether that lands. It can decide whether the ordering
 * that makes it possible is still there, and that is what these are for.
 *
 * ## Why two journeys
 *
 * The mission's subject is that ONE machine behaves differently for two
 * destinations. A single journey cannot show a difference — it can only show a
 * sequence. Two journeys make the second one a changed context the learner
 * applies a rule to, which is the near-transfer the doctrine asks for, rather
 * than a continuation they watch.
 *
 * ## What this suite cannot decide
 *
 * Whether the mission teaches, and whether its cognitive load is survivable for
 * a beginner. Both are Tier 3 human review (CURR-009 section 14a), and the
 * second is the specific thing the Founder should be watching for here.
 */

const REPOSITORY_ROOT = join(__dirname, "..", "..", "..");

const DOCUMENT_PATH = join(
  REPOSITORY_ROOT,
  "content",
  "curriculum",
  "networking-foundations.json"
);

const M4 = "nf-m4-the-prefix-and-the-decision";
const MODULE2 = "nf-mod2-addresses-and-boundaries";

const LOCAL_JOURNEY = "nf-pj4-local-destination";
const REMOTE_JOURNEY = "nf-pj4-remote-destination";

/** Missions no slice has authored yet. */
const UNAUTHORED = [
  "nf-m7-testing-whether-it-works",
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

function journey(interactionStableId: string): PacketJourneyParameters {
  const step = mission(M4).steps.find(
    (s) =>
      s.content.type === "interaction" &&
      s.content.interactionStableId === interactionStableId
  );

  if (step === undefined || step.content.type !== "interaction") {
    throw new Error(`Mission 4 authors no journey ${interactionStableId}`);
  }

  const parameters = step.content.parameters;
  if (parameters.interactionType !== "packet_journey") {
    throw new Error(`${interactionStableId} is not a packet journey`);
  }

  return parameters;
}

/** Every string a learner reads, collected field by field from parsed content. */
function learnerFacingText(): string {
  const parts: string[] = [];

  const collectJourney = (j: PacketJourneyParameters) => {
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

  for (const step of mission(M4).steps) {
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
          collectJourney(content.parameters);
        }
        break;
      default:
        throw new Error(`Mission 4 authored an unexpected step: ${step.stableId}`);
    }
  }

  return parts.join("\n");
}

/** The index of the first step whose learner-facing prose uses a word. */
function firstStepUsing(word: string): number {
  return mission(M4).steps.findIndex((step) => {
    const content = step.content;
    if (content.type !== "concept") return false;
    const text = [content.title ?? "", ...content.paragraphs].join("\n");
    return usesWord(text, word);
  });
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

describe("Mission 4 is the approved mission, in the approved place", () => {
  it("keeps its stable identity, title, module and position", () => {
    const m = mission(M4);

    expect({
      stableId: m.stableId,
      title: m.title,
      moduleStableId: m.moduleStableId,
      position: m.position
    }).toEqual({
      stableId: M4,
      title: "Mission 4 — The prefix, and the decision every host makes",
      moduleStableId: MODULE2,
      position: 1
    });
  });

  it("declares what the learner needs before starting", () => {
    expect(mission(M4).description).toMatch(/Before this mission you should/);
  });

  it("carries the approved competency relationships, unchanged", () => {
    const links = mission(M4).competencies.map((link) => ({
      competencyStableId: link.competencyStableId,
      required: link.required,
      relationship: link.relationship
    }));

    expect(links).toEqual([
      { competencyStableId: "net.ip-addressing", required: true, relationship: "develops" },
      { competencyStableId: "net.subnet-boundaries", required: true, relationship: "develops" },
      { competencyStableId: "net.address-identification", required: true, relationship: "reinforces" },
      { competencyStableId: "net.local-delivery", required: true, relationship: "reinforces" },
      { competencyStableId: "net.topology-literacy", required: false, relationship: "reinforces" }
    ]);
  });

  it("is the only mission developing addressing and subnet boundaries", () => {
    for (const competency of ["net.ip-addressing", "net.subnet-boundaries"]) {
      const developers = document.missions
        .filter((m) =>
          m.competencies.some(
            (link) =>
              link.competencyStableId === competency &&
              link.relationship === "develops"
          )
        )
        .map((m) => m.stableId);

      expect(`${competency} ${developers.join(",")}`).toBe(`${competency} ${M4}`);
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

describe("Mission 4 uses only the step types this slice approved", () => {
  it("authors concept and interaction steps and nothing else", () => {
    const types = [
      ...new Set(mission(M4).steps.map((step) => step.content.type))
    ].sort();

    expect(types).toEqual(["concept", "interaction"]);
  });

  it("authors no standalone prediction step", () => {
    // Architect Decision C, still in force. Mission 4's predictions live inside
    // its journeys, where committing to one is interactive and persists.
    const predictions = mission(M4).steps.filter(
      (step) => step.content.type === "prediction"
    );

    expect(predictions).toEqual([]);
  });

  it("authors exactly two journeys, both authored teaching", () => {
    const interactions = mission(M4).steps.filter(
      (step) => step.content.type === "interaction"
    );

    expect(interactions.length).toBe(2);

    for (const step of interactions) {
      if (step.content.type !== "interaction") throw new Error("not interaction");
      expect(step.content.sourceKind).toBe("authored_teaching");
      expect(step.content.supportLevel).toBe("show_me");
      expect(step.content.interactionType).toBe("packet_journey");
      expect(step.content.textEquivalent.length).toBeGreaterThan(600);
    }
  });

  it("runs the local journey before the remote one", () => {
    const ids = mission(M4)
      .steps.filter((step) => step.content.type === "interaction")
      .map((step) =>
        step.content.type === "interaction" ? step.content.interactionStableId : ""
      );

    expect(ids).toEqual([LOCAL_JOURNEY, REMOTE_JOURNEY]);
  });

  it("gives every step a unique id, a contiguous position and this mission's name", () => {
    const steps = mission(M4).steps;
    const ids = steps.map((step) => step.stableId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(steps.map((step) => step.position)).toEqual(
      steps.map((_step, index) => index)
    );
    for (const id of ids) expect(id.startsWith("m4-s")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Experience before abstraction — the ordering that carries the mission
 * ------------------------------------------------------------------ */

describe("every concept arrives after the thing it explains", () => {
  const firstJourney = () =>
    mission(M4).steps.findIndex((step) => step.content.type === "interaction");

  it("shows the decision before naming the prefix length", () => {
    const seen = firstJourney();
    const named = firstStepUsing("prefix");

    expect(
      `journey ${seen}, prefix named ${named}, ordered ${seen < named}`
    ).toBe(`journey ${seen}, prefix named ${named}, ordered true`);
  });

  it("shows the exchange before naming ARP", () => {
    const seen = firstJourney();
    const named = firstStepUsing("ARP");

    expect(`journey ${seen}, ARP named ${named}, ordered ${seen < named}`).toBe(
      `journey ${seen}, ARP named ${named}, ordered true`
    );
  });

  it("shows everyone receiving the question before naming broadcast", () => {
    const seen = firstJourney();
    const named = firstStepUsing("broadcast");

    expect(
      `journey ${seen}, broadcast named ${named}, ordered ${seen < named}`
    ).toBe(`journey ${seen}, broadcast named ${named}, ordered true`);
  });

  it("opens on the behavioural difference rather than a definition", () => {
    const first = mission(M4).steps[0]?.content;
    if (first?.type !== "concept") throw new Error("expected a concept first");

    const text = [first.title ?? "", ...first.paragraphs].join("\n");

    // The opening states that PC-A treats two destinations differently, and
    // names none of the concepts that explain why.
    for (const term of ["prefix", "ARP", "broadcast", "network portion", "host portion"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
    expect(text).toMatch(/192\.168\.2\.20/);
  });

  it("names the prefix, both portions, ARP and broadcast somewhere", () => {
    // Asserted positively so a future edit cannot satisfy every ordering rule
    // above by removing the teaching altogether.
    const text = learnerFacingText();
    for (const term of ["prefix", "network portion", "host portion", "ARP", "broadcast"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: true });
    }
  });
});

/* ------------------------------------------------------------------ *
 * Journey A — the local destination
 * ------------------------------------------------------------------ */

describe("the local journey establishes the decision, then reuses Mission 2", () => {
  it("sends from PC-A to PC-B", () => {
    const j = journey(LOCAL_JOURNEY);
    expect({ from: j.traffic.sourceNodeId, to: j.traffic.destinationNodeId }).toEqual({
      from: "pc-a",
      to: "pc-b"
    });
  });

  it("carries the addresses and factory identities Missions 2 and 3 established", () => {
    const j = journey(LOCAL_JOURNEY);
    const attributes = j.nodes.flatMap((node) =>
      node.interfaces.flatMap((iface) => iface.attributes.map((a) => a.value))
    );

    // Continuity, pinned. A later renumbering has to be a decision taken here.
    expect(attributes).toContain("192.168.1.10/24");
    expect(attributes).toContain("192.168.1.11/24");
    expect(attributes).toContain("00:1b:44:11:3a:b7");
    expect(attributes).toContain("00:1b:44:11:3a:c2");
  });

  it("states the local decision as an authored fact, not a computation", () => {
    const j = journey(LOCAL_JOURNEY);
    const facts = j.stages.flatMap((stage) =>
      (stage.deviceFacts ?? []).flatMap((entry) =>
        entry.facts.map((fact) => `${fact.label}: ${fact.value}`)
      )
    );

    // The conclusion is authored into the model. Nothing derives it, which is
    // what keeps the renderer from becoming a second networking implementation.
    expect(facts.join("\n")).toMatch(/Is the destination in it: Yes/);
  });

  it("asks the ARP question of every local connection at once", () => {
    const j = journey(LOCAL_JOURNEY);
    const broadcast = j.stages.find(
      (stage) => (stage.alsoOnLinkIds ?? []).length >= 2
    );

    if (broadcast === undefined) {
      throw new Error("no stage puts the question on more than one connection");
    }

    // Reuses the simultaneity built for Mission 2's flooding. Every other
    // local connection receives it, which is what makes "broadcast" observable
    // before it is named.
    const reached = new Set([broadcast.viaLinkId, ...(broadcast.alsoOnLinkIds ?? [])]);
    expect(reached.has("link-pc-b")).toBe(true);
    expect(reached.has("link-printer")).toBe(true);
    expect(reached.has("link-r-1")).toBe(true);
  });

  it("shows the machines that stay silent, and says nothing is wrong", () => {
    const j = journey(LOCAL_JOURNEY);
    const text = j.stages
      .map((stage) => `${stage.narration}\n${stage.decision ?? ""}`)
      .join("\n");

    expect(text).toMatch(/Printer/);
    expect(text).toMatch(/nothing has gone wrong|stayed silent|said nothing/i);
  });

  it("reaches PC-B, so the local case completes", () => {
    const j = journey(LOCAL_JOURNEY);
    expect(j.stages.some((stage) => stage.atNodeId === "pc-b")).toBe(true);
    expect(j.stages.every((stage) => stage.outcome === "proceeds")).toBe(true);
  });

  it("names Mission 2 where it is being reused", () => {
    const j = journey(LOCAL_JOURNEY);
    const text = j.stages
      .map((stage) => `${stage.narration}\n${stage.decision ?? ""}`)
      .join("\n");

    expect(text).toMatch(/Mission 2/);
  });
});

/* ------------------------------------------------------------------ *
 * Journey B — the changed destination
 * ------------------------------------------------------------------ */

describe("the remote journey is a changed context the learner applies the rule to", () => {
  it("is addressed to the remote machine, and never reaches it", () => {
    const j = journey(REMOTE_JOURNEY);

    expect(j.traffic.destinationNodeId).toBe("pc-c");

    // The whole point: PC-A does not deliver to it. A journey that arrived
    // would be teaching Mission 6's content a mission and a half early.
    expect(j.stages.some((stage) => stage.atNodeId === "pc-c")).toBe(false);
  });

  it("uses the approved remote address, in its own group", () => {
    const j = journey(REMOTE_JOURNEY);
    const pcC = j.nodes.find((node) => node.nodeId === "pc-c");

    expect(
      pcC?.interfaces.flatMap((iface) => iface.attributes.map((a) => a.value))
    ).toContain("192.168.2.20/24");
    expect(pcC?.groupId).not.toBe("local-network");
  });

  it("keeps PC-A unchanged from the local journey", () => {
    // Same machine, same address. If PC-A differed between the two journeys the
    // mission would be comparing two situations rather than one machine's two
    // decisions, and the whole contrast would collapse.
    const local = journey(LOCAL_JOURNEY).nodes.find((n) => n.nodeId === "pc-a");
    const remote = journey(REMOTE_JOURNEY).nodes.find((n) => n.nodeId === "pc-a");

    expect(JSON.stringify(remote?.interfaces)).toBe(
      JSON.stringify(local?.interfaces)
    );
  });

  it("states the remote decision as an authored fact", () => {
    const j = journey(REMOTE_JOURNEY);
    const facts = j.stages.flatMap((stage) =>
      (stage.deviceFacts ?? []).flatMap((entry) =>
        entry.facts.map((fact) => `${fact.label}: ${fact.value}`)
      )
    );

    expect(facts.join("\n")).toMatch(/Is the destination in it: No/);
  });

  it("hands off to Router-1 and stops there", () => {
    const j = journey(REMOTE_JOURNEY);
    const last = j.stages[j.stages.length - 1];

    expect(last?.atNodeId).toBe("r-1");
  });

  it("asks no ARP question for a destination outside the group", () => {
    // PC-A does not broadcast for something it has already decided is not
    // local. A stage putting the question on every connection here would
    // contradict the rule the mission just taught.
    const j = journey(REMOTE_JOURNEY);
    expect(j.stages.every((stage) => (stage.alsoOnLinkIds ?? []).length === 0)).toBe(
      true
    );
  });

  it("says plainly that nothing is broken", () => {
    const j = journey(REMOTE_JOURNEY);
    const text = [
      ...j.stages.map((s) => `${s.narration}\n${s.decision ?? ""}`),
      j.confirmation.narration,
      j.confirmation.summary
    ].join("\n");

    expect(text).toMatch(/nothing is broken/i);
  });
});

/* ------------------------------------------------------------------ *
 * Commitment
 * ------------------------------------------------------------------ */

describe("the learner commits before observing, where they have enough to reason", () => {
  it("asks for a prediction in both journeys", () => {
    for (const id of [LOCAL_JOURNEY, REMOTE_JOURNEY]) {
      const predicting = journey(id).stages.filter(
        (stage) => stage.prediction !== undefined
      );
      expect(`${id} ${predicting.length > 0}`).toBe(`${id} true`);
    }
  });

  it("asks the near-transfer question before showing the answer", () => {
    // The mission's key moment: same machine, changed destination, and the
    // learner has just been given the rule that settles it.
    const first = journey(REMOTE_JOURNEY).stages[0];
    expect(first?.prediction?.prompt ?? "").toMatch(/192\.168\.2\.20/);
    expect((first?.prediction?.options ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("gives every prediction at least two options and no answer key", () => {
    for (const id of [LOCAL_JOURNEY, REMOTE_JOURNEY]) {
      for (const stage of journey(id).stages) {
        if (stage.prediction === undefined) continue;
        expect(stage.prediction.options.length).toBeGreaterThanOrEqual(2);
        expect(Object.keys(stage.prediction)).toEqual(["prompt", "options"]);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * The Mission 5 handoff
 * ------------------------------------------------------------------ */

describe("Mission 4 hands Router-1's role to Mission 5 without teaching it", () => {
  it("closes on the question Mission 5 answers", () => {
    const steps = mission(M4).steps;
    const last = steps[steps.length - 1]?.content;
    if (last?.type !== "concept") throw new Error("expected a concept last");

    const text = last.paragraphs.join("\n");
    expect(text).toMatch(/Router-1/);
    expect(text).toContain("?");
  });

  it("names Router-1 as the device it already is, and never as a role", () => {
    // Mission 1 introduced Router-1 by name, so reusing it is ordinary. What
    // Mission 5 owns is the ROLE — why traffic goes there, and why it must be
    // that device. None of that vocabulary may appear here.
    const text = learnerFacingText();

    expect(text).toMatch(/Router-1/);
    for (const term of ["gateway", "default gateway", "routing", "routes?", "next hop"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });

  it("states that the reason is not yet explained", () => {
    const text = learnerFacingText();
    expect(text).toMatch(/not something this mission shows you|is not shown here|does not explain/i);
  });
});

/* ------------------------------------------------------------------ *
 * Teach before use
 * ------------------------------------------------------------------ */

describe("no later mission's vocabulary arrives in Mission 4", () => {
  /**
   * Terms the concept ledger places at Mission 5 or later, plus the
   * course-level exclusions.
   *
   * `prefix`, `network portion`, `host portion`, `ARP` and `broadcast` are
   * absent from this list on purpose: rows 15 to 19 place them at Mission 4,
   * and this is the mission that introduces them.
   */
  const DEFERRED = [
    "gateway",
    "routing",
    "routes?",
    "packets?",
    "ping",
    "ICMP",
    "Layer 2",
    "Layer 3",
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

  it("does not turn the prefix into arithmetic", () => {
    // The approved scope is conceptual and operational: read which part names
    // the network and compare. Binary, mask conversion and CIDR tables are all
    // explicitly out of scope.
    const text = learnerFacingText();
    for (const term of ["binary", "bits?", "octets?", "255\\.255\\.255\\.0"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });
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

describe("Mission 4 teaches and claims nothing about competency", () => {
  it("authors no assessment and no live lab", () => {
    const raw = JSON.stringify(mission(M4));
    expect(raw).not.toContain("assessmentStableId");
    expect(raw).not.toContain("live_lab");
  });

  it("authors no fault and no remediation", () => {
    // Diagnosis is Mission 8. A fault here would also give the journey an
    // outcome that depends on a learner action, which is the one thing an
    // authored teaching interaction must never have.
    for (const id of [LOCAL_JOURNEY, REMOTE_JOURNEY]) {
      const j = journey(id);
      expect(j.fault).toBeUndefined();
      expect(j.actions).toEqual([]);
    }
  });

  it("stays at show_me, so nothing is withheld and nothing is proven", () => {
    for (const step of mission(M4).steps) {
      if (step.content.type !== "interaction") continue;
      expect(step.content.supportLevel).toBe("show_me");
    }
  });
});
