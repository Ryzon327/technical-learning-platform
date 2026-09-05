import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCurriculumDocument,
  type CurriculumDocument,
  type CurriculumDocumentMission
} from "@tlp/shared-types";

/**
 * WP-J6 — Networking Foundations Mission 5, "The default gateway".
 *
 * ## The smallest mission in the course, on purpose
 *
 * Mission 4 introduced five concepts across two journeys. Mission 5 introduces
 * ONE, and its authored description says so outright: "This is the smallest
 * mission in the course, and deliberately so. It introduces one idea and one
 * line of output."
 *
 * That makes the assertions here unusual in one respect: several of them guard
 * against the mission GROWING. A slice that added a journey, a second concept
 * or a troubleshooting exercise would not be failing a structural rule — it
 * would be failing the design, and the design is the thing worth protecting
 * after Mission 4's density.
 *
 * ## The continuity this mission depends on
 *
 * Mission 4 put `192.168.1.1/24` on Router-1 and deliberately did not explain
 * it, exactly as Mission 3 put `/24` in front of the learner and left it
 * unexplained for Mission 4. Mission 5 is where that artefact is cashed in.
 *
 * So the address is pinned in BOTH directions here: Mission 5's output must
 * carry it, and Mission 4 must still show it on Router-1. An edit to either
 * mission alone would leave the teaching chain silently broken — the learner
 * would be told "you have seen this address before" and would not have.
 *
 * ## What this suite cannot decide
 *
 * Whether finding the relevant line among the rest feels like a skill or like
 * noise, and whether the mission reads as focused rather than thin. Both are
 * Tier 3 human review (CURR-009 section 14a).
 */

const REPOSITORY_ROOT = join(__dirname, "..", "..", "..");

const DOCUMENT_PATH = join(
  REPOSITORY_ROOT,
  "content",
  "curriculum",
  "networking-foundations.json"
);

const M4 = "nf-m4-the-prefix-and-the-decision";
const M5 = "nf-m5-the-default-gateway";
const MODULE3 = "nf-mod3-reaching-another-network";

/** The address Mission 4 planted on Router-1 and Mission 5 gives meaning to. */
const GATEWAY_ADDRESS = "192.168.1.1";

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

/** Every string Mission 5 puts in front of a learner, from parsed content. */
function learnerFacingText(): string {
  const parts: string[] = [];

  for (const step of mission(M5).steps) {
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
        throw new Error(`Mission 5 authored an unexpected step: ${step.stableId}`);
    }
  }

  return parts.join("\n");
}

function commandSteps() {
  return mission(M5)
    .steps.map((step) => step.content)
    .filter((content) => content.type === "command");
}

/** The index of the first step whose concept prose uses a word. */
function firstStepUsing(word: string): number {
  return mission(M5).steps.findIndex((step) => {
    const content = step.content;
    if (content.type !== "concept") return false;
    return [content.title ?? "", ...content.paragraphs].some((p) =>
      usesWord(p, word)
    );
  });
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

describe("Mission 5 is the approved mission, in the approved place", () => {
  it("keeps its stable identity, title, module and position", () => {
    const m = mission(M5);

    expect({
      stableId: m.stableId,
      title: m.title,
      moduleStableId: m.moduleStableId,
      position: m.position
    }).toEqual({
      stableId: M5,
      title: "Mission 5 — The default gateway",
      moduleStableId: MODULE3,
      position: 0
    });
  });

  it("opens Module 3 rather than extending Module 2", () => {
    // Mission 5 is the first mission of "Reaching Another Network". Module 2
    // ended with Mission 4, and moving Mission 5 back into it would make the
    // course claim Addresses and Boundaries teaches the hand-off.
    expect(mission(M5).moduleStableId).not.toBe("nf-mod2-addresses-and-boundaries");
  });

  it("declares what the learner needs before starting", () => {
    expect(mission(M5).description).toMatch(/Before this mission you should/);
  });

  it("carries the approved competency relationships, unchanged", () => {
    const links = mission(M5).competencies.map((link) => ({
      competencyStableId: link.competencyStableId,
      required: link.required,
      relationship: link.relationship
    }));

    expect(links).toEqual([
      { competencyStableId: "net.default-gateway", required: true, relationship: "develops" },
      { competencyStableId: "net.subnet-boundaries", required: true, relationship: "reinforces" },
      { competencyStableId: "net.ip-addressing", required: false, relationship: "reinforces" }
    ]);
  });

  it("is the only mission that develops the default gateway competency", () => {
    const developers = document.missions
      .filter((m) =>
        m.competencies.some(
          (link) =>
            link.competencyStableId === "net.default-gateway" &&
            link.relationship === "develops"
        )
      )
      .map((m) => m.stableId);

    expect(developers).toEqual([M5]);
  });

  it("keeps this mission's instruction inside this mission", () => {
    // DEC-061: the course is fully authored, so there is no unauthored tail for
    // this gate to assert about, and asserting one would be a check that can
    // only pass. What this gate still owns is its own mission — a Mission 5
    // step may appear under Mission 5 and under no other mission, which is
    // what stops instruction migrating now that an empty array no longer
    // signals a mission that has quietly acquired content.
    for (const m of document.missions) {
      const mine = m.steps
        .map((step) => step.stableId)
        .filter((stableId) => stableId.startsWith("m5-s"));

      const expected = m.stableId === M5 ? m.steps.length : 0;

      expect(`${m.stableId} ${mine.length}`).toBe(`${m.stableId} ${expected}`);
    }
  });

  it("authors no asset anywhere", () => {
    for (const m of document.missions) {
      expect(`${m.stableId} ${m.assets.length}`).toBe(`${m.stableId} 0`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Shape — and staying small
 * ------------------------------------------------------------------ */

describe("Mission 5 stays the small mission it is designed to be", () => {
  it("authors concept and command steps and nothing else", () => {
    const types = [
      ...new Set(mission(M5).steps.map((step) => step.content.type))
    ].sort();

    expect(types).toEqual(["command", "concept"]);
  });

  it("authors no packet journey", () => {
    // Architect Decision A. Nothing new travels in Mission 5, so a journey
    // would be an animation of nothing — authored to preserve the rhythm of
    // Missions 1, 2 and 4 rather than because the teaching asks for one.
    const interactions = mission(M5).steps.filter(
      (step) => step.content.type === "interaction"
    );

    expect(interactions).toEqual([]);
  });

  it("authors no standalone prediction step", () => {
    // Architect Decisions B and C: the learner is asked to consider the output
    // in ordinary prose before the answer is revealed, which is instructional
    // sequencing rather than a control. The prediction step renders read-only.
    const predictions = mission(M5).steps.filter(
      (step) => step.content.type === "prediction"
    );

    expect(predictions).toEqual([]);
  });

  it("shows exactly one machine reading", () => {
    // "One idea and one line of output." A second reading would make this the
    // near-transfer mission Mission 3 already is, and Mission 5's transfer is
    // conceptual rather than another round of the same exercise.
    expect(commandSteps().length).toBe(1);
  });

  it("stays smaller than Mission 4", () => {
    // Not a numeric pedagogy threshold: a RELATIVE assertion that the change of
    // pace the course was designed around still exists. Mission 4 is the dense
    // one; if Mission 5 ever grew past it, the intended contrast would be gone.
    const five = mission(M5).steps.length;
    const four = mission(M4).steps.length;

    expect(`M5 ${five} < M4 ${four}: ${five < four}`).toBe(
      `M5 ${five} < M4 ${four}: true`
    );
  });

  it("gives every step a unique id, a contiguous position and this mission's name", () => {
    const steps = mission(M5).steps;
    const ids = steps.map((step) => step.stableId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(steps.map((step) => step.position)).toEqual(
      steps.map((_step, index) => index)
    );
    for (const id of ids) expect(id.startsWith("m5-s")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Reopening Mission 4's question
 * ------------------------------------------------------------------ */

describe("Mission 5 reopens the question Mission 4 left standing", () => {
  it("opens on PC-A already knowing, and names no answer", () => {
    const first = mission(M5).steps[0]?.content;
    if (first?.type !== "concept") throw new Error("expected a concept first");

    const text = [first.title ?? "", ...first.paragraphs].join("\n");

    expect(text).toMatch(/Mission 4/);
    expect(text).toMatch(/Router-1/);
    // The term must not arrive in the step that poses the question.
    expect(usesWord(text, "gateway")).toBe(false);
  });

  it("sends the learner to the machine rather than answering", () => {
    const first = mission(M5).steps[0]?.content;
    if (first?.type !== "concept") throw new Error("expected a concept first");

    expect(first.paragraphs.join("\n")).toMatch(/configuration|go and look|read/i);
  });
});

/* ------------------------------------------------------------------ *
 * The reading, and the skill of finding the line
 * ------------------------------------------------------------------ */

describe("the machine's own configuration is shown honestly", () => {
  it("gives the reading a command, output and caption", () => {
    const content = commandSteps()[0];
    if (content?.type !== "command") throw new Error("no command step");

    expect(typeof content.command).toBe("string");
    expect(typeof content.output).toBe("string");
    expect(typeof content.caption).toBe("string");
  });

  it("tells the learner the output is displayed, not executable", () => {
    const content = commandSteps()[0];
    if (content?.type !== "command") throw new Error("no command step");
    expect(content.caption ?? "").toMatch(/nothing here offers to run/i);
  });

  it("shows more than the answer, so there is something to look past", () => {
    // The repository's stated intent: "you will learn to find that line and
    // ignore the rest, which is a skill in itself". Output trimmed to only the
    // answer would delete the skill the mission claims to teach.
    const content = commandSteps()[0];
    if (content?.type !== "command") throw new Error("no command step");

    const lines = (content.output ?? "").split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2);

    // Matched as a whole address, not a substring: `192.168.1.10` CONTAINS
    // `192.168.1.1`, so `includes` counts PC-A's own address line as a second
    // answer. This is the same substring trap that made an earlier gate flag
    // "nat" inside "destination", and it is worth failing loudly here rather
    // than quietly accepting output with two candidate lines.
    const whole = new RegExp(
      `(^|[^0-9.])${GATEWAY_ADDRESS.replace(/\./g, "\\.")}([^0-9.]|$)`
    );
    const answering = lines.filter((line) => whole.test(line));
    expect(answering.length).toBe(1);
  });

  it("keeps the noise bounded", () => {
    // "Reasonable noise" — enough to require looking, not a wall of output a
    // beginner would read as hostile.
    const content = commandSteps()[0];
    if (content?.type !== "command") throw new Error("no command step");

    const lines = (content.output ?? "").split("\n").filter((l) => l.trim());
    expect(lines.length).toBeLessThanOrEqual(4);
  });

  it("teaches that the rest of the output is not the answer", () => {
    const text = learnerFacingText();
    expect(text).toMatch(/not what you were looking for|is not the answer|do not need/i);
  });

  it("asks the learner to find the line before revealing it", () => {
    const content = commandSteps()[0];
    if (content?.type !== "command") throw new Error("no command step");

    // Sequencing, not a control: the caption poses the task, and the answer is
    // in a LATER step.
    expect(content.caption ?? "").toMatch(/before you read on/i);

    const readingIndex = mission(M5).steps.findIndex(
      (step) => step.content.type === "command"
    );
    const answerIndex = firstStepUsing("gateway");

    expect(
      `reading ${readingIndex}, answer ${answerIndex}, ordered ${readingIndex < answerIndex}`
    ).toBe(`reading ${readingIndex}, answer ${answerIndex}, ordered true`);
  });
});

/* ------------------------------------------------------------------ *
 * Recognition before terminology
 * ------------------------------------------------------------------ */

describe("the address is recognised before the term is named", () => {
  it("shows the address before any step names the gateway", () => {
    const steps = mission(M5).steps;

    const firstAddress = steps.findIndex((step) => {
      const content = step.content;
      if (content.type === "command") {
        return (content.output ?? "").includes(GATEWAY_ADDRESS);
      }
      // Narrowed explicitly rather than by elimination: excluding `command`
      // still leaves diagram, prediction, interaction, practice and reference
      // in the union, none of which carry `paragraphs`. A test above asserts
      // Mission 5 authors only concept and command steps, so this branch is
      // concept in practice — but the type has to say so.
      if (content.type !== "concept") return false;
      return [content.title ?? "", ...content.paragraphs].some((p) =>
        p.includes(GATEWAY_ADDRESS)
      );
    });
    const firstTerm = firstStepUsing("gateway");

    expect(
      `address ${firstAddress}, term ${firstTerm}, ordered ${firstAddress < firstTerm}`
    ).toBe(`address ${firstAddress}, term ${firstTerm}, ordered true`);
  });

  it("connects the address to Router-1 before naming it", () => {
    // The recognition the whole mission turns on: the learner has seen this
    // address already, on Router-1, in Mission 4.
    const naming = mission(M5).steps[firstStepUsing("gateway")]?.content;
    if (naming?.type !== "concept") throw new Error("expected a concept");

    const text = naming.paragraphs.join("\n");
    const routerAt = text.indexOf("Router-1");
    const termAt = text.toLowerCase().indexOf("default gateway");

    expect(routerAt).toBeGreaterThanOrEqual(0);
    expect(termAt).toBeGreaterThanOrEqual(0);
    expect(`Router-1 before the term: ${routerAt < termAt}`).toBe(
      "Router-1 before the term: true"
    );
  });

  it("does name the term it is responsible for introducing", () => {
    // Asserted positively so a future edit cannot satisfy every ordering rule
    // above by removing the teaching altogether.
    expect(usesWord(learnerFacingText(), "gateway")).toBe(true);
    expect(learnerFacingText().toLowerCase()).toContain("default gateway");
  });
});

/* ------------------------------------------------------------------ *
 * Continuity with Mission 4 — pinned in both directions
 * ------------------------------------------------------------------ */

describe("the artefact Mission 4 planted is the one Mission 5 explains", () => {
  it("uses the address Mission 4 showed on Router-1", () => {
    expect(learnerFacingText()).toContain(GATEWAY_ADDRESS);
  });

  it("Mission 4 still shows that address on Router-1", () => {
    // The other half of the chain. Mission 5 tells the learner they have seen
    // this address before; if a later edit renumbered Router-1 in Mission 4,
    // that sentence would become false and nothing else would notice.
    const m4 = JSON.stringify(mission(M4));
    expect(m4).toContain(`${GATEWAY_ADDRESS}/24`);
    expect(m4).toContain("Router-1");
  });

  it("keeps PC-A's own address consistent with Missions 3 and 4", () => {
    expect(learnerFacingText()).toContain("192.168.1.10");
  });

  it("names the mission the learner is building on", () => {
    expect(learnerFacingText()).toMatch(/Mission 4/);
  });
});

/* ------------------------------------------------------------------ *
 * Near-transfer: Mission 4's rule, applied to the gateway itself
 * ------------------------------------------------------------------ */

describe("Mission 4's rule explains the constraint, without a new rule", () => {
  it("asks whether another address could have been configured", () => {
    const text = learnerFacingText();
    // The conceptual transfer: the learner applies the local/remote rule to the
    // setting itself, rather than being told the constraint.
    expect(text).toMatch(/192\.168\.2\.1\b/);
  });

  it("resolves it with the local-delivery reasoning rather than new theory", () => {
    const text = learnerFacingText();
    expect(text).toMatch(/its own group|in the machine's own group/i);
    expect(text).toMatch(/directly/i);
  });

  it("says the learner needed no new rule", () => {
    expect(learnerFacingText()).toMatch(/did not need a new rule|already had/i);
  });

  it("does not turn the constraint into a fault to diagnose", () => {
    // Architect Decision C: Mission 5 teaches the rule. Mission 8 may later
    // make the learner diagnose a violation of it, and that payoff must survive.
    const text = learnerFacingText();
    for (const term of ["broken", "fault", "troubleshoot", "diagnose", "symptom"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });
});

/* ------------------------------------------------------------------ *
 * The Mission 6 handoff
 * ------------------------------------------------------------------ */

describe("Mission 5 stops at Router-1", () => {
  it("closes on what Router-1 does next", () => {
    const steps = mission(M5).steps;
    const last = steps[steps.length - 1]?.content;
    if (last?.type !== "concept") throw new Error("expected a concept last");

    const text = last.paragraphs.join("\n");
    expect(text).toMatch(/Router-1/);
    expect(text).toContain("?");
    expect(text).toMatch(/next mission|what does Router-1/i);
  });

  it("says plainly that the traffic has not arrived", () => {
    expect(learnerFacingText()).toMatch(/has not arrived|not arrived anywhere/i);
  });

  it("never follows the traffic past Router-1", () => {
    // Mission 6 owns everything after the hand-off. Naming any of it here would
    // spend the question Mission 5 exists to leave open.
    const text = learnerFacingText();
    for (const term of ["routing", "routing table", "next hop", "forwards", "onward"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });
});

/* ------------------------------------------------------------------ *
 * Teach before use
 * ------------------------------------------------------------------ */

describe("no later mission's vocabulary arrives in Mission 5", () => {
  /**
   * Terms the concept ledger places at Mission 6 or later, plus the
   * course-level exclusions.
   *
   * `gateway` is absent from this list on purpose: ledger row 20 places it at
   * Mission 5, and this is the mission that introduces it. It is the ONLY
   * concept Mission 5 owns.
   */
  const DEFERRED = [
    "routing",
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

  it("uses the word route only as the name of the command it displays", () => {
    // `ip route show` is the canonical way a Linux machine reports this, and
    // the ledger defers `routing` (row 21) rather than `route`. Sanitising the
    // command name would misrepresent what a learner would actually type.
    //
    // What must stay true is that the word appears ONLY there: in the command
    // string, never in authored prose or in the output, and never as an
    // explanation of anything.
    for (const step of mission(M5).steps) {
      const content = step.content;
      if (content.type === "command") {
        expect(usesWord(content.output ?? "", "routes?")).toBe(false);
        expect(usesWord(content.caption ?? "", "routes?")).toBe(false);
        continue;
      }
      if (content.type !== "concept") continue;
      for (const paragraph of [content.title ?? "", ...content.paragraphs]) {
        expect({
          paragraph: paragraph.slice(0, 40),
          used: usesWord(paragraph, "routes?")
        }).toEqual({ paragraph: paragraph.slice(0, 40), used: false });
      }
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

describe("Mission 5 teaches and claims nothing about competency", () => {
  it("authors no assessment, interaction or live lab", () => {
    const raw = JSON.stringify(mission(M5));
    expect(raw).not.toContain("assessmentStableId");
    expect(raw).not.toContain("live_lab");
    expect(raw).not.toContain("interactionStableId");
    expect(raw).not.toContain("supportLevel");
  });

  it("infers nothing from the learner having read the output", () => {
    // Reading a configuration is not evidence of anything, and nothing here may
    // imply it is. Deterministic validation remains the sole authority.
    const text = learnerFacingText();
    for (const term of ["score", "passed", "mastery", "correct answer", "you have proven"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });
});
