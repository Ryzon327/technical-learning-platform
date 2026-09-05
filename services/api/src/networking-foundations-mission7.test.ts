import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCurriculumDocument,
  type CurriculumDocument,
  type CurriculumDocumentMission
} from "@tlp/shared-types";

/**
 * WP-J8 — Networking Foundations Mission 7, "Testing whether it actually
 * works".
 *
 * ## The mission is about inference, not about a command
 *
 * Mission 7 introduces `ping`, and the single largest risk in authoring it is
 * that it becomes a lesson about `ping`. Its own description forbids that —
 * "Reading it is not the interesting part; deciding what to test is" — and the
 * competency it develops is about choosing verification steps and telling a
 * confirming result from a merely consistent one.
 *
 * So the assertions here spend far more effort on what the mission CLAIMS than
 * on what it shows. The two command steps are nearly identical; the difference
 * between them lives entirely in the prose that follows each.
 *
 * ## The claim boundary, asserted in both directions
 *
 * A successful ping to the gateway proves the first leg and nothing else. A
 * successful ping to the far host proves the round trip. Getting either of
 * those wrong — in either direction — is the defect this mission exists to
 * prevent, so both the positive and the negative claims are pinned:
 *
 *   gateway success  MUST say what it proves, and MUST say what it does not
 *   far-host success MUST claim the round trip, and only for that exchange
 *
 * ## Nothing is broken here
 *
 * Mission 8 owns real failure, diagnosis, repair and post-repair confirmation.
 * Mission 7 reasons about a failed gateway test HYPOTHETICALLY, and a suite of
 * assertions below keeps that hypothetical from becoming an authored fault or
 * a troubleshooting exercise.
 *
 * ## What this suite cannot decide
 *
 * Whether the confirms-versus-consistent-with distinction actually lands, or
 * reads as hair-splitting. That is Tier 3 human review (CURR-009 section 14a),
 * and in a mission this small it is the only thing holding the mission up.
 */

const REPOSITORY_ROOT = join(__dirname, "..", "..", "..");

const DOCUMENT_PATH = join(
  REPOSITORY_ROOT,
  "content",
  "curriculum",
  "networking-foundations.json"
);

const M7 = "nf-m7-testing-whether-it-works";
const MODULE4 = "nf-mod4-prove-it-and-fix-it";

/** The two approved targets, each encoding a different provable claim. */
const GATEWAY = "192.168.1.1";
const FAR_HOST = "192.168.2.20";

/** The only mission no slice has authored yet. */
const UNAUTHORED = ["nf-m8-when-it-does-not-work"] as const;

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

/** Concept prose only — no captions, commands or output. */
function prose(): string[] {
  return mission(M7).steps.flatMap((step) => {
    const content = step.content;
    if (content.type !== "concept") return [];
    return [content.title ?? "", ...content.paragraphs];
  });
}

function commandSteps() {
  return mission(M7)
    .steps.map((step) => step.content)
    .filter((content) => content.type === "command");
}

/** Every string Mission 7 puts in front of a learner. */
function learnerFacingText(): string {
  const parts: string[] = [];

  for (const step of mission(M7).steps) {
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
        throw new Error(`Mission 7 authored an unexpected step: ${step.stableId}`);
    }
  }

  return parts.join("\n");
}

/** The concept step that follows a given command step, by target address. */
function explanationAfter(target: string): string {
  const steps = mission(M7).steps;
  const commandIndex = steps.findIndex(
    (step) =>
      step.content.type === "command" &&
      (step.content.command ?? "").includes(target)
  );

  if (commandIndex < 0) throw new Error(`no command step targets ${target}`);

  for (let index = commandIndex + 1; index < steps.length; index += 1) {
    const content = steps[index]?.content;
    if (content?.type === "concept") {
      return [content.title ?? "", ...content.paragraphs].join("\n");
    }
  }

  throw new Error(`no explanation follows the ${target} test`);
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

describe("Mission 7 is the approved mission, in the approved place", () => {
  it("keeps its stable identity, title, module and position", () => {
    const m = mission(M7);

    expect({
      stableId: m.stableId,
      title: m.title,
      moduleStableId: m.moduleStableId,
      position: m.position
    }).toEqual({
      stableId: M7,
      title: "Mission 7 — Testing whether it actually works",
      moduleStableId: MODULE4,
      position: 0
    });
  });

  it("opens Module 4 rather than extending Module 3", () => {
    expect(mission(M7).moduleStableId).not.toBe("nf-mod3-reaching-another-network");
  });

  it("declares what the learner needs before starting", () => {
    expect(mission(M7).description).toMatch(/Before this mission you should/);
  });

  it("carries the approved competency relationships, unchanged", () => {
    const links = mission(M7).competencies.map((link) => ({
      competencyStableId: link.competencyStableId,
      required: link.required,
      relationship: link.relationship
    }));

    expect(links).toEqual([
      { competencyStableId: "net.connectivity-verification", required: true, relationship: "develops" },
      { competencyStableId: "net.default-gateway", required: true, relationship: "reinforces" },
      { competencyStableId: "net.topology-literacy", required: false, relationship: "reinforces" }
    ]);
  });

  it("develops exactly one competency, and it is verification", () => {
    const develops = mission(M7).competencies.filter(
      (link) => link.relationship === "develops"
    );

    expect(develops.map((link) => link.competencyStableId)).toEqual([
      "net.connectivity-verification"
    ]);
  });

  it("is the only mission that develops connectivity verification", () => {
    const developers = document.missions
      .filter((m) =>
        m.competencies.some(
          (link) =>
            link.competencyStableId === "net.connectivity-verification" &&
            link.relationship === "develops"
        )
      )
      .map((m) => m.stableId);

    expect(developers).toEqual([M7]);
  });

  it("leaves Mission 8 with no step of any kind", () => {
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

describe("Mission 7 uses only the step types this slice approved", () => {
  it("authors concept and command steps and nothing else", () => {
    const types = [
      ...new Set(mission(M7).steps.map((step) => step.content.type))
    ].sort();

    expect(types).toEqual(["command", "concept"]);
  });

  it("authors no packet journey", () => {
    // Architect Decision A. Mission 6 delivered the definitive round trip one
    // mission ago; animating traffic again for consistency would be
    // anticlimax, and Mission 7's substance is inference rather than motion.
    const interactions = mission(M7).steps.filter(
      (step) => step.content.type === "interaction"
    );

    expect(interactions).toEqual([]);
  });

  it("authors no standalone prediction step", () => {
    // Architect Decisions B and C: the learner is asked to commit in ordinary
    // prose before each explanation. That is instructional sequencing, and it
    // is deliberately not a control and not an assessment.
    const predictions = mission(M7).steps.filter(
      (step) => step.content.type === "prediction"
    );

    expect(predictions).toEqual([]);
  });

  it("shows exactly two tests", () => {
    // One for each provable claim. A third would dilute the comparison the
    // whole mission is built on.
    expect(commandSteps().length).toBe(2);
  });

  it("gives every step a unique id, a contiguous position and this mission's name", () => {
    const steps = mission(M7).steps;
    const ids = steps.map((step) => step.stableId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(steps.map((step) => step.position)).toEqual(
      steps.map((_step, index) => index)
    );
    for (const id of ids) expect(id.startsWith("m7-s")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The need exists before the tool is named
 * ------------------------------------------------------------------ */

describe("the learner wants a way to ask before ping is named", () => {
  it("opens on Mission 6's question, naming no tool", () => {
    const first = mission(M7).steps[0]?.content;
    if (first?.type !== "concept") throw new Error("expected a concept first");

    const text = [first.title ?? "", ...first.paragraphs].join("\n");

    expect(text).toMatch(/Mission 6/);
    // The need: everything was understood only because it was shown.
    expect(text).toMatch(/shown|drawn|animated/i);
    for (const term of ["ping", "ICMP"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });

  it("explains ping only after a result has been shown", () => {
    const steps = mission(M7).steps;

    const firstTest = steps.findIndex((step) => step.content.type === "command");
    const firstExplained = steps.findIndex((step) => {
      const content = step.content;
      if (content.type !== "concept") return false;
      return [content.title ?? "", ...content.paragraphs].some((p) =>
        usesWord(p, "ping")
      );
    });

    expect(
      `test ${firstTest}, explained ${firstExplained}, ordered ${firstTest < firstExplained}`
    ).toBe(`test ${firstTest}, explained ${firstExplained}, ordered true`);
  });

  it("says why an observed answer beats a diagram", () => {
    expect(prose().join("\n")).toMatch(/observed|from outside/i);
  });
});

/* ------------------------------------------------------------------ *
 * The two tests
 * ------------------------------------------------------------------ */

describe("both tests are shown honestly and target the approved addresses", () => {
  it("tests the gateway and the far host, and nothing else", () => {
    const targets = commandSteps().map((content) =>
      content.type === "command" ? content.command ?? "" : ""
    );

    expect(targets.some((c) => c.includes(GATEWAY))).toBe(true);
    expect(targets.some((c) => c.includes(FAR_HOST))).toBe(true);

    // No invented third target: the approved pair already encodes the
    // distinction the mission teaches.
    const addresses = targets.flatMap((c) =>
      [...c.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)].map((m) => m[0])
    );
    expect(new Set(addresses)).toEqual(new Set([GATEWAY, FAR_HOST]));
  });

  it("tests the gateway before the far host", () => {
    const order = commandSteps()
      .map((content) => (content.type === "command" ? content.command ?? "" : ""))
      .map((command) => (command.includes(GATEWAY) ? "gateway" : "far"));

    expect(order).toEqual(["gateway", "far"]);
  });

  it("tells the learner the output is displayed, not executed", () => {
    // Architect Decision H. The platform shows authored output; it runs
    // nothing. Saying otherwise would be a lie the learner cannot check.
    for (const content of commandSteps()) {
      if (content.type !== "command") throw new Error("not a command step");
      expect(content.caption ?? "").toMatch(/nothing here offers to run/i);
    }
  });

  it("never claims the learner ran anything", () => {
    const text = learnerFacingText();
    for (const claim of [
      "you ran",
      "you executed",
      "your machine executed",
      "the live network returned",
      "when you run"
    ]) {
      expect({
        claim,
        used: text.toLowerCase().includes(claim)
      }).toEqual({ claim, used: false });
    }
  });

  it("asks the learner to decide before each explanation", () => {
    // Commitment through prose sequencing, per Decision C.
    for (const content of commandSteps()) {
      if (content.type !== "command") throw new Error("not a command step");
      expect(content.caption ?? "").toMatch(/before you read on/i);
    }
  });

  it("shows enough output for the result to be readable", () => {
    // Trimmed to a single line, there would be nothing to interpret and the
    // inference the mission teaches would have no material to work on.
    for (const content of commandSteps()) {
      if (content.type !== "command") throw new Error("not a command step");
      const lines = (content.output ?? "").split("\n").filter((l) => l.trim());
      expect(lines.length).toBeGreaterThanOrEqual(4);
      expect(content.output ?? "").toMatch(/packet loss/);
    }
  });

  it("shows only successful results", () => {
    // Architect Decision F: no real failure in Mission 7. Mission 8 owns it.
    for (const content of commandSteps()) {
      if (content.type !== "command") throw new Error("not a command step");
      expect(content.output ?? "").toMatch(/0% packet loss/);
      expect(content.output ?? "").not.toMatch(/[1-9]\d*% packet loss/);
      expect(content.output ?? "").not.toMatch(/Destination Host Unreachable|100% packet loss/i);
    }
  });
});

/* ------------------------------------------------------------------ *
 * ICMP, narrowly
 * ------------------------------------------------------------------ */

describe("ICMP is explained just enough to stop ping being magic", () => {
  it("names ICMP as the kind of ask-and-answer message", () => {
    const text = prose().join("\n");
    expect(usesWord(text, "ICMP")).toBe(true);
    expect(text).toMatch(/replied to|asking and answering/i);
  });

  it("teaches no protocol detail", () => {
    // Architect Decision E. The purpose is to make ping non-magical, not to
    // teach ICMP as a protocol unit.
    const text = prose().join("\n");
    for (const term of [
      "type 8",
      "type 0",
      "echo request",
      "echo reply",
      "header",
      "checksum",
      "datagram",
      "payload",
      "TTL",
      "time to live"
    ]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });

  it("keeps the ICMP explanation to a single paragraph", () => {
    const mentioning = prose().filter((p) => usesWord(p, "ICMP"));
    expect(mentioning.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * The claim boundary — the heart of the mission
 * ------------------------------------------------------------------ */

describe("each result is tied to exactly the claim it supports", () => {
  it("says what reaching the gateway proves", () => {
    const text = explanationAfter(GATEWAY);
    // The positive half: the first leg, out and back.
    expect(text).toMatch(/first leg|first part/i);
    expect(text).toMatch(/Router-1/);
  });

  it("says what reaching the gateway does NOT prove", () => {
    // The half that is actually hard, and the one an overclaiming edit would
    // quietly drop. Named explicitly rather than left to inference.
    const text = explanationAfter(GATEWAY);

    expect(text).toMatch(/does not|says nothing/i);
    expect(text).toContain("PC-C");
    expect(text).toMatch(/network works/i);
  });

  it("never says the gateway result proves the far host is reachable", () => {
    const text = explanationAfter(GATEWAY);
    expect(text).not.toMatch(/proves that PC-C is reachable/i);
    expect(text).not.toMatch(/so the whole (trip|path|network) works/i);
  });

  it("says what reaching the far host proves, and bounds it", () => {
    const text = explanationAfter(FAR_HOST);

    // The round trip, because a reply had to come back.
    expect(text).toMatch(/round trip|whole trip/i);
    expect(text).toMatch(/reply|back/i);
    // Bounded to that address at that moment — not "the network works".
    expect(text).toMatch(/that address|that moment|that exchange/i);
  });

  it("never claims any result proves the network works", () => {
    const text = learnerFacingText();
    expect(text).not.toMatch(/proves (that )?the network works/i);
    expect(text).not.toMatch(/everything works/i);
  });
});

/* ------------------------------------------------------------------ *
 * Confirms versus merely consistent with
 * ------------------------------------------------------------------ */

describe("the mission teaches the distinction it exists for", () => {
  it("names both sides of the distinction", () => {
    const text = prose().join("\n");
    expect(text).toMatch(/consistent with/i);
    expect(text).toMatch(/confirm/i);
  });

  it("gives alternatives that would produce the same gateway result", () => {
    // What makes a result weak is that other situations produce it too. Naming
    // those alternatives is what turns the distinction from an assertion into
    // something the learner can check.
    const text = prose().join("\n");
    expect(text).toMatch(/would (also )?(have )?produce/i);
    expect(text).toMatch(/unplugged|switched off|off for/i);
  });

  it("explains why the far-host result rules those alternatives out", () => {
    const text = prose().join("\n");
    expect(text).toMatch(/rules? out|could not have produced/i);
  });

  it("leaves the learner a portable habit rather than terminology", () => {
    const text = prose().join("\n");
    expect(text).toMatch(/what else would have produced/i);
  });

  it("uses no formal logic vocabulary", () => {
    // Not authorized, and it would replace a usable habit with a word to
    // memorise — the exact failure the description warns against.
    const text = learnerFacingText();
    for (const term of [
      "necessary condition",
      "sufficient condition",
      "falsifiable",
      "deductive",
      "inductive",
      "syllogism"
    ]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });
});

/* ------------------------------------------------------------------ *
 * Test ordering, hypothetically
 * ------------------------------------------------------------------ */

describe("test ordering is taught without breaking anything", () => {
  it("poses the failed-gateway case as a hypothesis", () => {
    const text = prose().join("\n");
    expect(text).toMatch(/suppose|if PC-A could not/i);
    expect(text).toMatch(/would it be worth|worth testing/i);
  });

  it("draws the ordering conclusion from the topology", () => {
    const text = prose().join("\n");
    expect(text).toMatch(/nothing beyond/i);
    expect(text).toMatch(/Mission 5|Mission 6/);
  });

  it("says plainly that nothing is wrong here", () => {
    const text = prose().join("\n");
    expect(text).toMatch(/nothing is wrong|nothing has been wrong/i);
  });

  it("authors no fault, diagnosis or repair", () => {
    // Mission 8's entire payoff. A fault authored here would spend it, and the
    // hypothetical above is precisely how the ordering lesson is taught
    // without one.
    const text = learnerFacingText();
    for (const term of [
      "troubleshoot",
      "troubleshooting",
      "diagnose",
      "diagnosis",
      "repair",
      "isolate",
      "root cause",
      "symptom"
    ]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });
});

/* ------------------------------------------------------------------ *
 * Reuse and the Mission 8 handoff
 * ------------------------------------------------------------------ */

describe("Mission 7 uses the earlier missions rather than reteaching them", () => {
  it("names the missions it is building on", () => {
    const text = learnerFacingText();
    for (const label of ["Mission 4", "Mission 5", "Mission 6"]) {
      expect({ label, named: text.includes(label) }).toEqual({
        label,
        named: true
      });
    }
  });

  it("closes on something being wrong next, without starting it", () => {
    const steps = mission(M7).steps;
    const last = steps[steps.length - 1]?.content;
    if (last?.type !== "concept") throw new Error("expected a concept last");

    const text = last.paragraphs.join("\n");
    expect(text).toMatch(/everything you tested (in this mission )?worked|has been easy/i);
    expect(text).toMatch(/fail|wrong/i);
  });
});

/* ------------------------------------------------------------------ *
 * Teach before use
 * ------------------------------------------------------------------ */

describe("no later mission's vocabulary arrives in Mission 7", () => {
  /**
   * Terms the ledger places at Mission 8, plus the course-level exclusions.
   *
   * `ping` and `ICMP` are absent from this list on purpose: ledger rows 24 and
   * 25 place them at Mission 7, and this is the mission that introduces them.
   */
  const DEFERRED = [
    "troubleshoot",
    "diagnose",
    "repair",
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
    "dynamic routing",
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

  it("does name the tool and the message kind it is responsible for", () => {
    const text = learnerFacingText();
    expect(usesWord(text, "ping")).toBe(true);
    expect(usesWord(text, "ICMP")).toBe(true);
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

describe("Mission 7 teaches and claims nothing about competency", () => {
  it("authors no assessment, interaction or live lab", () => {
    const raw = JSON.stringify(mission(M7));
    expect(raw).not.toContain("assessmentStableId");
    expect(raw).not.toContain("live_lab");
    expect(raw).not.toContain("interactionStableId");
    expect(raw).not.toContain("supportLevel");
  });

  it("treats the learner's answer as thinking, never as a score", () => {
    // A mission about deciding what to test invites the platform to grade the
    // decision. It must not. The prose asks the learner to decide; nothing
    // records, marks or infers anything from it.
    const text = learnerFacingText();
    for (const term of [
      "score",
      "scored",
      "passed",
      "mastery",
      "correct answer",
      "you have proven",
      "grade"
    ]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });
});
