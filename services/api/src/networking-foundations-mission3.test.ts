import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCurriculumDocument,
  type CurriculumDocument,
  type CurriculumDocumentMission
} from "@tlp/shared-types";

/**
 * WP-J4 — Networking Foundations Mission 3, "IPv4 addresses: the second
 * identity".
 *
 * ## Why Mission 3 has its own suite rather than joining Module 1's
 *
 * `networking-foundations-module1.test.ts` asserts Module 1's rules: every
 * authored mission there carries a packet journey, sits in the One Network
 * module, and treats IPv4 as a term that has not arrived yet. All three are
 * false of Mission 3 by design. Adding Mission 3 to that suite's list would
 * have demanded a journey it has no reason to author and forbidden the very
 * word it exists to teach, so the boundary between the two suites is the
 * boundary between two different sets of approved requirements.
 *
 * ## What Mission 3 teaches, and what it deliberately does not
 *
 * A connection already has an identity — Mission 2's factory MAC address. This
 * mission establishes that the same connection also carries an ASSIGNED
 * identity, that it can be read out of the machine's own report, and that the
 * two answer different questions.
 *
 * It then stops short on purpose. Knowing the address does not tell the learner
 * which other addresses the machine treats as local, and Mission 3 must leave
 * that unresolved rather than reach forward for the information that settles
 * it. The assertions about deferred vocabulary below are therefore not
 * housekeeping: an unresolved need is the mission's designed ending, and a
 * single forward reference would dissolve it.
 *
 * ## What this suite cannot decide
 *
 * Whether the mission TEACHES is Tier 3 human review (CURR-009 section 14a).
 * Everything here is structure, absence and ordering — objective questions with
 * objective answers. Nothing below should be read as evidence of instructional
 * quality.
 */

const REPOSITORY_ROOT = join(__dirname, "..", "..", "..");

const DOCUMENT_PATH = join(
  REPOSITORY_ROOT,
  "content",
  "curriculum",
  "networking-foundations.json"
);

const M3 = "nf-m3-ipv4-the-second-identity";
const MODULE2 = "nf-mod2-addresses-and-boundaries";

/**
 * Missions no slice has authored yet.
 *
 * This list shrinks by exactly one mission each time a slice is approved, and
 * WP-J5 removed Mission 4 from it. That is the list handing authority forward
 * rather than being weakened: what it protects is the emptiness of whatever has
 * NOT been authored, which is a moving edge by design. Mission 4's own suite
 * now owns Mission 4, and this suite keeps owning Mission 3.
 *
 * The alternative — pinning this list to the missions that were unauthored when
 * Mission 3 shipped — would fail the moment the course made legitimate
 * progress, which teaches the next author to edit the assertion out of the way
 * rather than trust it.
 */
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

/**
 * Whole-word, case-insensitive.
 *
 * A substring rule matches "nat" inside "destination" and "port" inside
 * "important", and this repository has failed a gate on exactly that twice. A
 * vocabulary rule that fires on ordinary English teaches the next author to
 * work around the gate rather than trust it.
 */
function usesWord(haystack: string, word: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9])${word}([^A-Za-z0-9]|$)`, "i").test(
    haystack
  );
}

/**
 * Every string Mission 3 puts in front of a learner, collected field by field
 * from the PARSED document.
 *
 * Field by field, and never by reading the file again, because the raw JSON
 * contains identifiers as well as sentences. Mission 3 authors no interaction,
 * so the registry key `packet_journey` cannot appear here — but collecting
 * prose properly is what keeps that true if a later slice adds one.
 */
function learnerFacingText(stableId: string): string {
  const parts: string[] = [];

  for (const step of mission(stableId).steps) {
    const content = step.content;

    switch (content.type) {
      case "concept":
        if (content.title !== undefined) parts.push(content.title);
        parts.push(...content.paragraphs);
        break;
      case "command":
        if (content.caption !== undefined) parts.push(content.caption);
        if (content.command !== undefined) parts.push(content.command);
        if (content.output !== undefined) parts.push(content.output);
        break;
      default:
        // Mission 3 authors no other step type, and a test below asserts that.
        // Reaching here means the assertion is stale, not that this is safe.
        throw new Error(`Mission 3 authored an unexpected step: ${step.stableId}`);
    }
  }

  return parts.join("\n");
}

function commandSteps(stableId: string) {
  return mission(stableId)
    .steps.map((step) => step.content)
    .filter((content) => content.type === "command");
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

describe("Mission 3 is the approved mission, in the approved place", () => {
  it("keeps its stable identity, title and module", () => {
    const m = mission(M3);

    expect({
      stableId: m.stableId,
      title: m.title,
      moduleStableId: m.moduleStableId,
      position: m.position
    }).toEqual({
      stableId: M3,
      title: "Mission 3 — IPv4 addresses: the second identity",
      moduleStableId: MODULE2,
      position: 0
    });
  });

  it("opens Module 2 rather than extending Module 1", () => {
    // Mission 3 is the first mission of the second module. If it were ever
    // moved into Module 1, the course would claim One Network teaches
    // addressing, and Module 1's own gate would start asserting Module 1's
    // rules about it.
    expect(mission(M3).moduleStableId).not.toBe("nf-mod1-one-network");
    expect(mission(M3).moduleStableId).toBe(MODULE2);
  });

  it("declares what the learner needs before starting", () => {
    expect(mission(M3).description).toMatch(/Before this mission you should/);
  });

  it("carries the approved competency relationships, unchanged", () => {
    const links = mission(M3).competencies.map((link) => ({
      competencyStableId: link.competencyStableId,
      required: link.required,
      relationship: link.relationship
    }));

    expect(links).toEqual([
      {
        competencyStableId: "net.address-identification",
        required: true,
        relationship: "develops"
      },
      {
        competencyStableId: "net.local-delivery",
        required: true,
        relationship: "reinforces"
      },
      {
        competencyStableId: "net.topology-literacy",
        required: false,
        relationship: "reinforces"
      }
    ]);
  });

  it("is the only mission that develops address identification", () => {
    const developers = document.missions
      .filter((m) =>
        m.competencies.some(
          (link) =>
            link.competencyStableId === "net.address-identification" &&
            link.relationship === "develops"
        )
      )
      .map((m) => m.stableId);

    expect(developers).toEqual([M3]);
  });
});

/* ------------------------------------------------------------------ *
 * Staged authoring
 * ------------------------------------------------------------------ */

describe("Mission 3 is authored and the boundary sits after it", () => {
  it("authors instruction in Mission 3", () => {
    expect(mission(M3).steps.length).toBeGreaterThan(0);
  });

  it("leaves every still-unauthored mission with no step of any kind", () => {
    for (const stableId of UNAUTHORED) {
      expect(`${stableId} ${mission(stableId).steps.length}`).toBe(
        `${stableId} 0`
      );
    }
  });

  it("authors no asset, in Mission 3 or anywhere else", () => {
    // Unchanged by this slice: there is no curriculum asset hosting, so a
    // diagram step could only name a URI served from a development host.
    for (const m of document.missions) {
      expect(`${m.stableId} ${m.assets.length}`).toBe(`${m.stableId} 0`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The step types this mission uses, and the ones it may not
 * ------------------------------------------------------------------ */

describe("Mission 3 uses only the step types this slice approved", () => {
  it("authors concept and command steps and nothing else", () => {
    const types = [
      ...new Set(mission(M3).steps.map((step) => step.content.type))
    ].sort();

    expect(types).toEqual(["command", "concept"]);
  });

  it("authors no standalone prediction step", () => {
    // Architect Decision C, still in force: the prediction step renders
    // read-only, which reads to a learner as a control that is broken. Module 1
    // put its predictions inside a journey, where committing to one is real.
    // Mission 3 has no journey, so it asks its questions in prose and places
    // the answer in a LATER step — sequence doing the work a control would.
    const predictions = mission(M3).steps.filter(
      (step) => step.content.type === "prediction"
    );

    expect(predictions).toEqual([]);
  });

  it("authors no interaction, because it has nothing to animate", () => {
    // Mission 3 reads a machine's own report. A packet journey would be a
    // moving picture of nothing, authored only because the registry offers one.
    const interactions = mission(M3).steps.filter(
      (step) => step.content.type === "interaction"
    );

    expect(interactions).toEqual([]);
  });

  it("gives every step a unique id and a contiguous position", () => {
    const steps = mission(M3).steps;
    const ids = steps.map((step) => step.stableId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(steps.map((step) => step.position)).toEqual(
      steps.map((_step, index) => index)
    );
  });

  it("names every step for this mission", () => {
    for (const step of mission(M3).steps) {
      expect(step.stableId.startsWith("m3-s")).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Experience before abstraction
 * ------------------------------------------------------------------ */

describe("the learner reads real output before the term arrives", () => {
  it("shows a machine's report before naming IPv4", () => {
    const steps = mission(M3).steps;

    const firstCommand = steps.findIndex(
      (step) => step.content.type === "command"
    );
    const firstNaming = steps.findIndex((step) => {
      const content = step.content;
      if (content.type !== "concept") return false;
      return content.paragraphs.some((p) => usesWord(p, "IPv4"));
    });

    expect(firstCommand).toBeGreaterThanOrEqual(0);
    expect(firstNaming).toBeGreaterThanOrEqual(0);

    // The doctrine's ordering, asserted rather than hoped for: EXPERIENCE then
    // NAME THE CONCEPT. If a future edit moved the definition above the output,
    // the mission would become the vocabulary dump it was written to avoid.
    expect(
      `output at step ${firstCommand}, term at step ${firstNaming}, ordered ${firstCommand < firstNaming}`
    ).toBe(
      `output at step ${firstCommand}, term at step ${firstNaming}, ordered true`
    );
  });

  it("opens by asking the question rather than answering it", () => {
    const first = mission(M3).steps[0]?.content;
    if (first?.type !== "concept") throw new Error("expected a concept first");

    const text = [first.title ?? "", ...first.paragraphs].join("\n");

    // The opening reconnects to Mission 2 and poses the need. It must not
    // already contain the answer it is sending the learner to find.
    expect(text).toMatch(/Mission 2/);
    expect(usesWord(text, "IPv4")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * The output steps themselves
 * ------------------------------------------------------------------ */

describe("the machine's report is shown honestly", () => {
  it("authors at least two separate readings", () => {
    expect(commandSteps(M3).length).toBeGreaterThanOrEqual(2);
  });

  it("gives every reading a command, output and caption", () => {
    for (const content of commandSteps(M3)) {
      if (content.type !== "command") throw new Error("not a command step");

      expect(typeof content.command).toBe("string");
      expect(typeof content.output).toBe("string");
      expect(typeof content.caption).toBe("string");
      expect((content.output ?? "").length).toBeGreaterThan(0);
    }
  });

  it("tells the learner the output is displayed, not executable", () => {
    // The step type carries no execution semantics and no surface offers to run
    // it. The learner cannot read a type definition, so the caption says so.
    for (const content of commandSteps(M3)) {
      if (content.type !== "command") throw new Error("not a command step");
      expect(content.caption ?? "").toMatch(/nothing here offers to run/i);
    }
  });

  it("shows an address a learner can actually read", () => {
    // The inverse of Module 1's rule. Module 1 forbids a readable IP address
    // because it had not taught one; Mission 3 REQUIRES one, because reading it
    // off real output is the competency.
    const outputs = commandSteps(M3)
      .map((content) => (content.type === "command" ? content.output ?? "" : ""))
      .join("\n");

    expect(outputs).toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
  });

  /**
   * The approved treatment of the part after the address.
   *
   * Real `ip address show` output carries more than the four numbers, and
   * Mission 3 shows it rather than trimming it. That is deliberate, and the
   * distinction it rests on is narrow enough to be worth stating plainly:
   *
   *   VISIBLE UNEXPLAINED ARTEFACT   allowed, and required
   *   NAME / EXPLANATION / MEANING   forbidden until Mission 4
   *
   * Sanitising realistic output because part of it has not been taught would
   * misrepresent what a machine actually prints, in the one mission whose whole
   * point is confirming what a machine actually has. Naming or explaining it
   * would answer the question Mission 3 exists to leave open.
   *
   * So the artefact is pinned present here, and pinned unnamed by the deferred
   * vocabulary suite below. Neither assertion is sufficient alone: without this
   * one a later edit could quietly trim the output and the mission's ending
   * would lose the thing it points at; without that one the mission could
   * explain it and Mission 4 would have nothing left to teach.
   */
  it("keeps the unexplained part of the line visible", () => {
    const outputs = commandSteps(M3)
      .map((content) => (content.type === "command" ? content.output ?? "" : ""))
      .join("\n");

    // The artefact itself, immediately after an address and never named.
    expect(outputs).toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}\b/);
  });

  it("points at the artefact without naming or explaining it", () => {
    // Step 6 must refer to it only by position. If a future edit reached for
    // the word instead, the deferred-vocabulary suite would fail — but this
    // assertion says why that matters rather than leaving it to be inferred.
    const text = learnerFacingText(M3);

    expect(text).toMatch(/part after the address/i);
    expect(text).not.toMatch(/\/24 means/i);
    expect(text).not.toMatch(/the \/24/i);
  });

  it("keeps the reading beside the connection that holds it", () => {
    // Objective 2: the learner must be able to say WHICH connection carries the
    // address. That is only answerable if the output names both together.
    for (const content of commandSteps(M3)) {
      if (content.type !== "command") throw new Error("not a command step");
      const output = content.output ?? "";
      const command = content.command ?? "";

      const named = /([A-Za-z][A-Za-z0-9]*\d)\s/.exec(output)?.[1];
      expect(named === undefined ? "no interface named" : "named").toBe(
        "named"
      );
      expect(command).toContain(named ?? "");
    }
  });
});

/* ------------------------------------------------------------------ *
 * Near transfer
 * ------------------------------------------------------------------ */

describe("the second reading is a changed context, not a repetition", () => {
  it("uses a different connection name", () => {
    const names = commandSteps(M3).map((content) =>
      content.type === "command" ? content.command ?? "" : ""
    );

    expect(new Set(names).size).toBe(names.length);
  });

  it("shows a different address on a different machine", () => {
    const addresses = commandSteps(M3).flatMap((content) => {
      const output = content.type === "command" ? content.output ?? "" : "";
      return [...output.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)].map(
        (match) => match[0]
      );
    });

    expect(addresses.length).toBeGreaterThanOrEqual(2);
    expect(new Set(addresses).size).toBe(addresses.length);
  });

  /**
   * The approved addresses, pinned.
   *
   * PC-A holds 192.168.1.10 and PC-B holds 192.168.1.11, on one network,
   * beside the factory identities Mission 2 already showed for the same two
   * machines. That pairing is the designed continuity of this course: a later
   * mission returning to PC-A must find the machine the learner already met.
   *
   * Pinned as exact values rather than as "two different addresses", because a
   * later edit that casually renumbered them would satisfy the looser rule
   * while destroying the continuity. Changing them is allowed — it just has to
   * be a decision, taken here, rather than a side effect somewhere else.
   */
  it("holds the approved addresses for PC-A and PC-B", () => {
    const outputs = commandSteps(M3)
      .map((content) => (content.type === "command" ? content.output ?? "" : ""))
      .join("\n");

    expect(outputs).toContain("192.168.1.10");
    expect(outputs).toContain("192.168.1.11");
  });

  it("pairs each address with the factory identity Mission 2 showed", () => {
    const readings = commandSteps(M3).map((content) =>
      content.type === "command" ? content.output ?? "" : ""
    );

    const pcA = readings.find((output) => output.includes("192.168.1.10")) ?? "";
    const pcB = readings.find((output) => output.includes("192.168.1.11")) ?? "";

    // The same two MAC addresses Mission 2 authored for PC-A and PC-B.
    expect(pcA).toContain("00:1b:44:11:3a:b7");
    expect(pcB).toContain("00:1b:44:11:3a:c2");
  });

  it("does not reuse one output verbatim as the other", () => {
    const outputs = commandSteps(M3).map((content) =>
      content.type === "command" ? content.output ?? "" : ""
    );

    expect(new Set(outputs).size).toBe(outputs.length);
  });
});

/* ------------------------------------------------------------------ *
 * Designed reuse of Missions 1 and 2
 * ------------------------------------------------------------------ */

describe("Mission 3 builds on what Missions 1 and 2 established", () => {
  it("returns to the machine and connection Mission 2 used", () => {
    // Mission 2 read `ip link show eth0` on PC-A and showed the factory
    // identity 00:1b:44:11:3a:b7. Mission 3 reads the same connection on the
    // same machine, so the new line arrives beside something already familiar.
    // That continuity is the "I already did this" moment, authored rather than
    // hoped for.
    const m2Output = mission("nf-m2-inside-one-network")
      .steps.map((step) =>
        step.content.type === "command" ? step.content.output ?? "" : ""
      )
      .join("\n");

    const m2Mac = /([0-9a-f]{2}(?::[0-9a-f]{2}){5})/i.exec(m2Output)?.[1];
    expect(m2Mac === undefined ? "Mission 2 shows no MAC" : "shown").toBe(
      "shown"
    );

    const m3Output = commandSteps(M3)
      .map((content) => (content.type === "command" ? content.output ?? "" : ""))
      .join("\n");

    expect(m3Output).toContain(m2Mac);
  });

  it("names the earlier mission the learner is building on", () => {
    expect(learnerFacingText(M3)).toMatch(/Mission 2/);
  });

  it("reuses the devices Mission 1 established", () => {
    const text = learnerFacingText(M3);
    expect(text).toMatch(/PC-A/);
    expect(text).toMatch(/Switch-1/);
  });
});

/* ------------------------------------------------------------------ *
 * The unresolved need, and the handoff
 * ------------------------------------------------------------------ */

describe("Mission 3 ends on a need it deliberately does not meet", () => {
  it("closes with the question Mission 4 answers", () => {
    const steps = mission(M3).steps;
    const last = steps[steps.length - 1]?.content;
    if (last?.type !== "concept") throw new Error("expected a concept last");

    const text = last.paragraphs.join("\n");

    // The handoff, stated as a question the learner carries forward rather than
    // as a promise the course makes to itself.
    expect(text).toMatch(/local network ends/i);
    expect(text).toContain("?");
  });

  it("states plainly that the address alone does not settle what is local", () => {
    const text = learnerFacingText(M3);
    expect(text).toMatch(/cannot|does not/i);
    expect(text).toMatch(/next mission/i);
  });

  it("points at the unexplained part of the line it already showed", () => {
    // The limit is anchored to something the learner has SEEN. An abstract
    // "something is missing" would be a weaker ending than an artefact they
    // read four steps ago and could not use.
    const text = learnerFacingText(M3);
    expect(text).toMatch(/part after the address/i);
  });
});

/* ------------------------------------------------------------------ *
 * Teach before use
 * ------------------------------------------------------------------ */

describe("no later mission's vocabulary arrives in Mission 3", () => {
  /**
   * Terms the concept ledger places at Mission 4 or later.
   *
   * `IPv4` is deliberately absent: it is ledger row 14, Mission 3's own term,
   * and the mission that introduces it is the one place it may appear. `MAC`
   * is absent for the same reason at row 10 — Mission 2 introduced it, and
   * reuse is what the ledger exists to permit.
   *
   * Everything below is row 15 or later. A single one of them appearing here
   * would answer the question Mission 3 is written to leave open.
   */
  const DEFERRED = [
    "prefix",
    "netmask",
    "subnets?",
    "mask",
    "CIDR",
    "ARP",
    "broadcasts?",
    "gateway",
    "routing",
    "routes?",
    "packets?",
    "ping",
    "ICMP",
    "DHCP",
    "DNS",
    "IPv6",
    "VLANs?",
    "Layer 2",
    "Layer 3"
  ] as const;

  for (const term of DEFERRED) {
    it(`does not use "${term}"`, () => {
      expect({ term, used: usesWord(learnerFacingText(M3), term) }).toEqual({
        term,
        used: false
      });
    });
  }

  it("does use the term it is responsible for introducing", () => {
    // Asserted positively so that a future edit which quietly removes the
    // teaching fails here, rather than passing every absence check by teaching
    // nothing at all.
    expect(usesWord(learnerFacingText(M3), "IPv4")).toBe(true);
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
      // Curriculum Doctrine section 28.1, NON-NEGOTIABLE: a certification
      // blueprint is an internal coverage map, never the learner's course
      // structure. The learner meets the networking competency now; the
      // certification abstraction arrives later, when it can mean something.
      expect({
        term,
        used: usesWord(learnerFacingText(M3), term)
      }).toEqual({ term, used: false });
    });
  }
});

/* ------------------------------------------------------------------ *
 * The evidence boundary
 * ------------------------------------------------------------------ */

describe("Mission 3 teaches and claims nothing about competency", () => {
  it("references no assessment", () => {
    for (const step of mission(M3).steps) {
      expect(JSON.stringify(step.content)).not.toContain("assessmentStableId");
    }
  });

  it("authors no interaction that could carry a support level or a source", () => {
    // Deterministic validation remains the sole authority for technical
    // competency. Mission 3 authors no interaction at all, so there is no
    // surface here that could produce evidence even in principle.
    const suspicious = mission(M3).steps.filter((step) =>
      ["interaction", "practice"].includes(step.content.type)
    );

    expect(suspicious).toEqual([]);
  });

  it("names no live lab", () => {
    expect(JSON.stringify(mission(M3))).not.toContain("live_lab");
  });
});
