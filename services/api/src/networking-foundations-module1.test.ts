import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCurriculumDocument,
  projectMissionStepContent,
  type CurriculumDocument,
  type CurriculumDocumentMission,
  type MissionStep,
  type MissionStepInteractionContent,
  type PacketJourneyParameters
} from "@tlp/shared-types";

/**
 * WP-J / Module 1 — the first authored instruction in Networking Foundations.
 *
 * ## What this suite is for, and what it deliberately is not
 *
 * `networking-foundations.test.ts` owns the course ARCHITECTURE — identity,
 * ordering, competency accountability, the cross-course graph. This suite owns
 * the INSTRUCTION authored into Missions 1 and 2, and only the parts of it that
 * can be wrong in a way a machine can see.
 *
 * It asserts nothing about whether the course teaches well. That is Human UAT
 * and is human-authoritative (CURR-009 s14a). What it can assert is that the
 * instruction does not contradict itself, does not use a term before the step
 * that introduces it, does not claim to be a live lab, and does not quietly
 * acquire a fault, an assessment or an answer key.
 *
 * ## Why the real parser, and only the real parser
 *
 * Every structural fact below is read from `parseCurriculumDocument`'s output,
 * never from a second reading of the file. A suite that re-derived the topology
 * would be a second curriculum truth, and the interesting failures — a stage
 * naming a device that does not exist, a link naming an interface that does not
 * exist — are exactly the ones the real validator already catches. The job here
 * is to prove the validator RAN and to assert the things it has no opinion
 * about.
 *
 * ## The technical-accuracy tests are the point
 *
 * `flooding` and `broadcast` are not synonyms. A switch that has not learned a
 * destination floods an unknown unicast frame out of its other ports; that is a
 * different thing from a frame deliberately addressed to every machine at once.
 * Teaching the first and calling it the second would be a false simplification
 * that a learner would have to unlearn, so it is pinned here rather than left
 * to review.
 */

const REPOSITORY_ROOT = join(__dirname, "..", "..", "..");

const DOCUMENT_PATH = join(
  REPOSITORY_ROOT,
  "content",
  "curriculum",
  "networking-foundations.json"
);

const M1 = "nf-m1-what-a-network-is";
const M2 = "nf-m2-inside-one-network";
const M3 = "nf-m3-ipv4-the-second-identity";
const M4 = "nf-m4-the-prefix-and-the-decision";
const M5 = "nf-m5-the-default-gateway";

/**
 * The missions Module 1 authoring is authorized to touch.
 *
 * Every Module-1-specific rule in this file iterates this list — packet
 * journeys, the One Network module, the Module 1 deferred vocabulary in which
 * IPv4 is still a future term. Mission 3 must NOT be added here: it belongs to
 * Module 2 and to its own gate, and asserting Module 1's rules about it would
 * demand a journey Mission 3 has no reason to author and forbid the very term
 * Mission 3 exists to teach.
 */
const AUTHORED = [M1, M2] as const;

/**
 * Every mission authored anywhere in the course so far.
 *
 * Used only by the two staged-authoring assertions below. They protect the
 * emptiness of the missions NOBODY has authored yet, which is a course-wide
 * fact rather than a Module 1 one, so it has to know about Mission 3 without
 * dragging Mission 3 into Module 1's rules.
 */
const AUTHORED_ANYWHERE = [M1, M2, M3, M4, M5] as const;

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

function interactionOf(stableId: string): MissionStepInteractionContent {
  const step = mission(stableId).steps.find(
    (candidate) => candidate.content.type === "interaction"
  );

  if (step === undefined || step.content.type !== "interaction") {
    throw new Error(`${stableId} authors no interaction`);
  }

  return step.content;
}

function journeyOf(stableId: string): PacketJourneyParameters {
  const parameters = interactionOf(stableId).parameters;
  if (parameters.interactionType !== "packet_journey") {
    throw new Error(`${stableId} is not a packet journey`);
  }
  return parameters;
}

/**
 * Is this node one of the machines information starts or ends at?
 *
 * `printer` is a presentation category, not a different kind of participant:
 * Mission 1 step 2 teaches in as many words that a printer IS a host, and
 * nothing about delivery treats the two differently.
 *
 * This predicate exists because writing `role === "host"` would now QUIETLY
 * skip the Printer in every rule below — the checks would still pass, on one
 * device fewer, which is the way a suite stops being able to catch anything.
 * Anything true of every end device is asserted through here.
 */
function isEndDevice(role: string): boolean {
  return role === "host" || role === "printer";
}

/**
 * Every string a learner could read in one mission's steps.
 *
 * Authored prose ONLY. Identifiers, registry keys and schema field names are
 * excluded by construction rather than by filtering — `stageId`, `nodeId`,
 * `interactionType` and the registry value `packet_journey` are never collected
 * here, so a vocabulary rule below cannot fire on the architecture's own
 * spelling. That was the whole failure mode the WP-J gate hit when a substring
 * rule matched "nat" inside "destination".
 */
function learnerFacingText(stableId: string): string {
  const parts: string[] = [];

  const collectJourney = (journey: PacketJourneyParameters) => {
    parts.push(journey.traffic.label, journey.traffic.startActionLabel);

    // A group's label is drawn on the topology and read aloud in the
    // arrangement description, so it is learner-facing prose and is held to
    // every vocabulary rule below. The `groupId` beside it is an identifier
    // and is deliberately not collected.
    for (const group of journey.groups ?? []) parts.push(group.label);

    for (const node of journey.nodes) {
      parts.push(node.label);
      // The device explainer a learner reads when they select a device. It is
      // prose on the screen like any other, so every vocabulary rule below
      // applies to it — which is the point of collecting it here rather than
      // testing it separately: device inspection cannot become a side door
      // through which a later mission's terms arrive early.
      if (node.about !== undefined) parts.push(node.about);
      for (const iface of node.interfaces) {
        parts.push(iface.label);
        for (const attribute of iface.attributes) {
          parts.push(attribute.label, attribute.value);
        }
      }
    }

    for (const link of journey.links) parts.push(link.label);

    for (const stage of journey.stages) {
      parts.push(stage.narration);
      if (stage.decision !== undefined) parts.push(stage.decision);
      if (stage.prediction !== undefined) {
        parts.push(stage.prediction.prompt, ...stage.prediction.options);
      }
    }

    for (const action of journey.actions) {
      parts.push(action.label, action.observation);
    }

    parts.push(journey.confirmation.narration, journey.confirmation.summary);
  };

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
      case "interaction":
        if (content.caption !== undefined) parts.push(content.caption);
        parts.push(content.textEquivalent);
        if (content.parameters.interactionType === "packet_journey") {
          collectJourney(content.parameters);
        }
        break;
      case "diagram":
        parts.push(content.textAlternative);
        if (content.caption !== undefined) parts.push(content.caption);
        break;
      case "reference":
        parts.push(content.label);
        if (content.note !== undefined) parts.push(content.note);
        break;
      case "practice":
        if (content.framing !== undefined) parts.push(content.framing);
        break;
      case "prediction":
        parts.push(content.prompt);
        break;
    }
  }

  return parts.join("\n");
}

/** Whole-word, case-insensitive. "report" must not match "port". */
function usesWord(haystack: string, word: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9])${word}([^A-Za-z0-9]|$)`, "i").test(
    haystack
  );
}

/* ------------------------------------------------------------------ *
 * Staged authoring
 * ------------------------------------------------------------------ */

describe("Module 1 is authored and nothing beyond it is", () => {
  it("authors instruction in exactly the missions a slice has authored", () => {
    const authored = document.missions
      .filter((m) => m.steps.length > 0)
      .map((m) => m.stableId);

    expect(authored).toEqual([...AUTHORED_ANYWHERE]);
  });

  it("leaves Missions 6 to 8 with no step of any kind", () => {
    for (const m of document.missions) {
      if ((AUTHORED_ANYWHERE as readonly string[]).includes(m.stableId)) {
        continue;
      }
      expect(m.steps).toEqual([]);
    }
  });

  it("authors both missions inside the One Network module", () => {
    for (const stableId of AUTHORED) {
      expect(mission(stableId).moduleStableId).toBe("nf-mod1-one-network");
    }
  });

  it("gives every authored step a unique id and a contiguous position", () => {
    for (const stableId of AUTHORED) {
      const steps = mission(stableId).steps;
      const ids = steps.map((step) => step.stableId);

      expect(new Set(ids).size).toBe(ids.length);
      expect(steps.map((step) => step.position)).toEqual(
        steps.map((_, index) => index)
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * The step vocabulary Module 1 is allowed to use
 * ------------------------------------------------------------------ */

describe("Module 1 uses only the step types this slice approved", () => {
  const authoredSteps = (): readonly MissionStep[] =>
    AUTHORED.flatMap((stableId) => mission(stableId).steps);

  it("authors no diagram step, because no curriculum asset hosting exists", () => {
    // A diagram would need an asset whose URI must be absolute http(s). The
    // only such URI available today is a development host, which would publish
    // a broken image to a real learner.
    expect(
      authoredSteps().filter((step) => step.content.type === "diagram")
    ).toEqual([]);
  });

  it("authors no standalone prediction step", () => {
    // Architect Decision C. The step type renders read-only, which reads as a
    // broken control; every Module 1 prediction lives inside the Packet
    // Journey, where committing to one is interactive and persists.
    expect(
      authoredSteps().filter((step) => step.content.type === "prediction")
    ).toEqual([]);
  });

  it("authors no practice step, because no assessment could be resolved", () => {
    expect(
      authoredSteps().filter((step) => step.content.type === "practice")
    ).toEqual([]);
  });

  it("references no asset from any authored step", () => {
    for (const step of authoredSteps()) {
      expect(step.content).not.toHaveProperty("assetStableId");
    }
  });
});

/* ------------------------------------------------------------------ *
 * Both journeys: what they must be, and must not become
 * ------------------------------------------------------------------ */

describe("both Packet Journeys are authored teaching and nothing else", () => {
  for (const stableId of AUTHORED) {
    it(`${stableId} declares an authored teaching source, never a live lab`, () => {
      expect(interactionOf(stableId).sourceKind).toBe("authored_teaching");
    });

    it(`${stableId} uses the registered interaction type`, () => {
      expect(interactionOf(stableId).interactionType).toBe("packet_journey");
      expect(journeyOf(stableId).interactionType).toBe("packet_journey");
    });

    it(`${stableId} carries a text equivalent that describes the network`, () => {
      const equivalent = interactionOf(stableId).textEquivalent;

      // Non-trivial, and actually about this network: every declared device
      // must be findable in it, or the accessible path is not equivalent.
      for (const node of journeyOf(stableId).nodes) {
        expect(equivalent).toContain(node.label);
      }
    });

    it(`${stableId} authors no fault and no remediation`, () => {
      // Architect Decision D. Module 1 teaches no diagnosis, so a fault here
      // could only be one the learner has not been equipped to reason about.
      const journey = journeyOf(stableId);
      expect(journey.fault).toBeUndefined();
      expect(journey.actions).toEqual([]);
    });

    it(`${stableId} authors no stage that stops`, () => {
      for (const stage of journeyOf(stableId).stages) {
        expect(stage.outcome).toBe("proceeds");
      }
    });

    it(`${stableId} ends with a confirmation`, () => {
      const { confirmation } = journeyOf(stableId);
      expect(confirmation.narration.length).toBeGreaterThan(0);
      expect(confirmation.summary.length).toBeGreaterThan(0);
    });

    it(`${stableId} gives every prediction at least two options and no answer key`, () => {
      for (const stage of journeyOf(stableId).stages) {
        if (stage.prediction === undefined) continue;
        expect(stage.prediction.options.length).toBeGreaterThanOrEqual(2);
        // The contract has no correct-option field. Asserting the absence
        // keeps a future author from adding one by widening the type.
        expect(stage.prediction).not.toHaveProperty("correctOption");
        expect(stage.prediction).not.toHaveProperty("expectedOutcome");
      }
    });

    it(`${stableId} starts at the device the traffic starts from`, () => {
      const journey = journeyOf(stableId);
      expect(journey.stages[0]?.atNodeId).toBe(journey.traffic.sourceNodeId);
    });

    it(`${stableId} names a traversed link on every stage that arrives somewhere`, () => {
      // The WP-I invariant that made the journey followable. A stage without
      // one must be an origin — the start of a pass — and not an arrival whose
      // route was left unstated.
      const journey = journeyOf(stableId);

      journey.stages.forEach((stage, index) => {
        if (stage.viaLinkId !== undefined) {
          expect(
            journey.links.some((link) => link.linkId === stage.viaLinkId)
          ).toBe(true);
          return;
        }

        expect(stage.atNodeId).toBe(journey.traffic.sourceNodeId);
        const previous = journey.stages[index - 1];
        expect(previous === undefined || previous.atNodeId === stage.atNodeId).toBe(
          true
        );
      });
    });
  }
});

/* ------------------------------------------------------------------ *
 * PJ1 — topology orientation
 * ------------------------------------------------------------------ */

describe("PJ1 orients the learner in a topology", () => {
  const journey = () => journeyOf(M1);

  it("declares the five devices the mission teaches", () => {
    expect(journey().nodes.map((node) => node.label).sort()).toEqual([
      "PC-A",
      "PC-B",
      "Printer",
      "Router-1",
      "Switch-1"
    ]);
  });

  it("uses all four device categories, so each is distinguishable on sight", () => {
    // The renderer picks a device symbol from `role` and from nothing else, so
    // this is what makes the four categories the Founder must be able to tell
    // apart actually distinguishable. Authoring the Printer as a plain `host`
    // would draw it with the workstation symbol — a picture asserting something
    // the course does not, which a caption cannot repair.
    const roles = journey().nodes.map((node) => node.role);

    expect(roles.filter((role) => role === "host").length).toBe(2);
    expect(roles.filter((role) => role === "printer").length).toBe(1);
    expect(roles.filter((role) => role === "switch").length).toBe(1);
    expect(roles.filter((role) => role === "router").length).toBe(1);

    // Five devices, four categories, no device left uncategorised.
    expect(roles.length).toBe(5);
    expect(new Set(roles).size).toBe(4);
  });

  it("names the Printer as a printer rather than by label alone", () => {
    const printer = journey().nodes.find((node) => node.label === "Printer");
    expect(printer?.role).toBe("printer");
  });

  it("connects every host to the switch and to nothing else", () => {
    const journeyValue = journey();
    const switchInterfaces = new Set(
      journeyValue.nodes
        .filter((node) => node.role === "switch")
        .flatMap((node) => node.interfaces.map((iface) => iface.interfaceId))
    );

    for (const node of journeyValue.nodes) {
      if (!isEndDevice(node.role)) continue;

      const own = new Set(node.interfaces.map((iface) => iface.interfaceId));
      const links = journeyValue.links.filter((link) =>
        link.endpoints.some((endpoint) => own.has(endpoint))
      );

      expect(links.length).toBe(1);
      // Its single link must land on the switch. This is the fact the mission
      // teaches, so it is asserted rather than assumed.
      expect(
        links[0]?.endpoints.some((endpoint) => switchInterfaces.has(endpoint))
      ).toBe(true);
    }
  });

  it("gives the router a connection that leaves the drawn network", () => {
    const journeyValue = journey();
    const router = journeyValue.nodes.find((node) => node.role === "router");
    const linked = new Set(journeyValue.links.flatMap((link) => link.endpoints));

    // Exactly one of its interfaces is attached to something in this picture.
    // The other one is the reason it is a different kind of device.
    const attached = router?.interfaces.filter((iface) =>
      linked.has(iface.interfaceId)
    );
    const unattached = router?.interfaces.filter(
      (iface) => !linked.has(iface.interfaceId)
    );

    expect(attached?.length).toBe(1);
    expect(unattached?.length).toBe(1);
  });

  it("carries no address of any kind, because none has been taught", () => {
    const journeyValue = journey();

    for (const node of journeyValue.nodes) {
      for (const iface of node.interfaces) {
        for (const attribute of iface.attributes) {
          // No dotted-quad and no colon-separated hardware identity.
          expect(attribute.value).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
          expect(attribute.value).not.toMatch(/\b[0-9a-f]{2}(:[0-9a-f]{2}){5}\b/i);
        }
      }
    }
  });

  it("asks the learner to predict before the one thing that happens", () => {
    const journeyValue = journey();
    const predicting = journeyValue.stages.filter(
      (stage) => stage.prediction !== undefined
    );

    expect(predicting.length).toBe(1);
    // Read from the NEXT unrevealed stage, so it must sit on the first.
    expect(journeyValue.stages[0]?.prediction).toBeDefined();
  });

  /* ---------------------------------------------------------------- *
   * The visual must be true, not merely disclaimed
   *
   * PJ1's first design walked a marker PC-A → Switch-1 → Printer →
   * Switch-1 → Router-1 as a "tour", with authored copy saying nothing was
   * being sent. Architect review rejected it, correctly: for a beginner the
   * MOVEMENT is instruction, and a disclaimer cannot repair a misleading
   * visual.
   *
   * It was worse than a disclaimer problem. `describeDeviceState` renders
   * "The traffic passed through here" on every visited device, so the tour
   * would have printed that sentence on the Printer's and Router-1's own
   * device faces — a plain falsehood in the picture, not in the prose.
   *
   * The corrected journey follows one true step: what PC-A sends arrives at
   * Switch-1, because that is where PC-A's only link ends. Every assertion
   * below pins a way the old design was untrue.
   * ---------------------------------------------------------------- */

  it("follows the print request from the sender to the printer", () => {
    // Founder UAT: the walkthrough used to stop at Switch-1 and tell the
    // learner the rest was Mission 2. The scenario is someone printing a
    // document, so the modelled system now reaches the goal the scenario set:
    // PC-A -> Switch-1 -> Printer.
    const journeyValue = journey();

    expect(journeyValue.stages.map((stage) => stage.atNodeId)).toEqual([
      "pc-a",
      "sw-1",
      "printer"
    ]);
  });

  it("ends at the destination the scenario named", () => {
    const journeyValue = journey();
    const last = journeyValue.stages[journeyValue.stages.length - 1];

    expect(journeyValue.traffic.destinationNodeId).toBe("printer");
    expect(last?.atNodeId).toBe(journeyValue.traffic.destinationNodeId);
  });

  it("is not complete at Switch-1", () => {
    // The learner must not be told the activity is finished at the halfway
    // point. Switch-1 is a stage the journey passes through, and the authored
    // reason there points FORWARD rather than closing the walkthrough.
    const journeyValue = journey();
    const atSwitch = journeyValue.stages.findIndex(
      (stage) => stage.atNodeId === "sw-1"
    );

    expect(atSwitch).toBeGreaterThan(0);
    expect(atSwitch).toBeLessThan(journeyValue.stages.length - 1);
    expect(journeyValue.stages[atSwitch]?.decision ?? "").toMatch(/continue/i);
  });

  it("confirms a successful delivery in words", () => {
    // Success is stated, not only coloured. The confirmation names the
    // printer, names what reached it, and says the job was accepted.
    const confirmation = journey().confirmation;

    expect(confirmation.narration).toMatch(/print request/);
    expect(confirmation.narration).toMatch(/printer/i);
    expect(confirmation.narration).toMatch(/accepted/i);

    // The summary is the RECAP, and the approved Mission 1 specification asks
    // for it to be the three-beat journey rather than a restatement of the
    // narration: PC-A sent it, Switch-1 was in the middle, the Printer
    // received it. So this pins the recap's content, not its old phrasing.
    expect(confirmation.summary).toMatch(/PC-A/);
    expect(confirmation.summary).toMatch(/Switch-1/);
    expect(confirmation.summary).toMatch(/Printer/i);
    expect(confirmation.summary).toMatch(/received/i);
  });

  it("leaves the learner with the two questions Mission 1 sets up", () => {
    // The curiosity bridge the approved specification requires. Mission 1
    // deliberately stops short of switching mechanics and of what a router
    // does, so it has to hand the learner both questions rather than let them
    // look like gaps — and it must say where each one is answered.
    const summary = journey().confirmation.summary;

    expect(summary).toMatch(/how Switch-1 knew where to send it/i);
    expect(summary).toMatch(/Router-1/);
    expect(summary).toMatch(/Mission 2/);
    expect(summary).toMatch(/Missions? 5/);

    // And it must not answer either of them here.
    for (const answered of ["MAC", "flooding", "routing", "gateway"]) {
      expect(usesWord(summary, answered)).toBe(false);
    }
  });

  it("traverses only authored links, one per arrival", () => {
    // Two arrivals, two authored links. The renderer draws what the author
    // wrote; it never works out that Switch-1 would forward to the printer.
    const traversed = journey()
      .stages.flatMap((stage) =>
        stage.viaLinkId === undefined ? [] : [stage.viaLinkId]
      );

    expect(traversed).toEqual(["link-pc-a", "link-printer"]);

    const declared = new Set(journey().links.map((link) => link.linkId));
    for (const linkId of traversed) expect(declared.has(linkId)).toBe(true);
  });

  it("never visits a device that receives nothing", () => {
    // PC-B and Router-1 still take no part. A stage at either would print a
    // delivery caption on a device that received nothing.
    const visited = new Set(journey().stages.map((stage) => stage.atNodeId));

    for (const untouched of ["pc-b", "r-1"]) {
      expect({ node: untouched, visited: visited.has(untouched) }).toEqual({
        node: untouched,
        visited: false
      });
    }
  });

  it("never returns to a device it has already left", () => {
    // A marker doubling back was the clearest way the old tour implied
    // forwarding that does not happen.
    const nodes = journey().stages.map((stage) => stage.atNodeId);
    expect(new Set(nodes).size).toBe(nodes.length);
  });

  it("still defers the switching mechanism to Mission 2", () => {
    // The learner SEES the print request continue from Switch-1 to the
    // printer. Nothing tells them how Switch-1 chose the port — that is
    // Mission 2, and behaviour before vocabulary is the method.
    const journeyValue = journey();
    const text = [
      journeyValue.stages[1]?.decision ?? "",
      journeyValue.confirmation.summary
    ].join("\n");

    expect(text).toContain("Mission 2");
  });
});

/* ------------------------------------------------------------------ *
 * PJ2 — local delivery, in two passes
 * ------------------------------------------------------------------ */

describe("PJ2 teaches local delivery as two passes", () => {
  const journey = () => journeyOf(M2);

  it("excludes the router, so the mission stays inside one network", () => {
    expect(journey().nodes.some((node) => node.role === "router")).toBe(false);
  });

  it("gives every end device's interface a hardware identity to read", () => {
    for (const node of journey().nodes) {
      if (!isEndDevice(node.role)) continue;

      for (const iface of node.interfaces) {
        expect(
          iface.attributes.some((attribute) =>
            /\b[0-9a-f]{2}(:[0-9a-f]{2}){5}\b/i.test(attribute.value)
          )
        ).toBe(true);
      }
    }
  });

  it("labels that identity without naming it before the step that does", () => {
    // Behavior Before Vocabulary, enforced. The value is visible during the
    // journey; the words "MAC address" arrive in a later step.
    for (const node of journey().nodes) {
      for (const iface of node.interfaces) {
        for (const attribute of iface.attributes) {
          expect(attribute.label.toUpperCase()).not.toContain("MAC");
        }
      }
    }
  });

  it("gives every end device a different hardware identity", () => {
    const values = journey()
      .nodes.filter((node) => isEndDevice(node.role))
      .flatMap((node) =>
        node.interfaces.flatMap((iface) =>
          iface.attributes
            .filter((attribute) =>
              /\b[0-9a-f]{2}(:[0-9a-f]{2}){5}\b/i.test(attribute.value)
            )
            .map((attribute) => attribute.value)
        )
      );

    expect(new Set(values).size).toBe(values.length);
    expect(values.length).toBe(3);
  });

  it("runs two passes, each starting at the sender", () => {
    const journeyValue = journey();
    const origins = journeyValue.stages.filter(
      (stage) => stage.viaLinkId === undefined
    );

    expect(origins.length).toBe(2);
    for (const origin of origins) {
      expect(origin.atNodeId).toBe(journeyValue.traffic.sourceNodeId);
    }
  });

  it("asks three predictions, each on the stage that answers it", () => {
    // A prediction is read from the NEXT unrevealed stage, so a prediction
    // authored on stage X is asked before X and answered by X. Every one of
    // them must therefore sit on the stage that resolves it, or the learner
    // is asked about something they have already been shown.
    const journeyValue = journey();
    const predicting = journeyValue.stages.filter(
      (stage) => stage.prediction !== undefined
    );

    expect(predicting.map((stage) => stage.stageId)).toEqual([
      // What does a switch do with a destination it has not learned?
      "d2-switch-sends-copies",
      // What has it learned from that first delivery?
      "d3-copies-arrive",
      // And what does it do once it knows?
      "d7-switch-sends-once"
    ]);
  });

  it("asks what the switch knows only before the answer is on screen", () => {
    // The whole value of the learned-state prediction is that the learner
    // has to reason rather than read. It is answered by `d3`, so no stage
    // before `d3` may already show the switch's record or state it in prose.
    const journeyValue = journey();
    const askedAt = journeyValue.stages.findIndex(
      (stage) => stage.stageId === "d3-copies-arrive"
    );

    expect(askedAt).toBeGreaterThan(0);

    for (const stage of journeyValue.stages.slice(0, askedAt)) {
      expect(stage.deviceFacts ?? []).toEqual([]);
      expect(`${stage.narration} ${stage.decision ?? ""}`).not.toMatch(
        /PC-A is on port 1/i
      );
    }
  });

  it("involves the unintended recipient in the first delivery and not the second", () => {
    // The Printer no longer has a stage of its own. It receives its copy at
    // the same authored moment as PC-B, so its involvement is now carried by
    // link occupancy — which is the honest record of a simultaneous copy.
    const journeyValue = journey();
    const secondPassStart = journeyValue.stages.findIndex(
      (stage, index) => index > 0 && stage.viaLinkId === undefined
    );

    const linksIn = (stages: readonly { viaLinkId?: string; alsoOnLinkIds?: readonly string[] }[]) =>
      new Set(
        stages.flatMap((stage) => [
          ...(stage.viaLinkId === undefined ? [] : [stage.viaLinkId]),
          ...(stage.alsoOnLinkIds ?? [])
        ])
      );

    expect(linksIn(journeyValue.stages.slice(0, secondPassStart))).toContain(
      "link-printer"
    );
    expect(
      linksIn(journeyValue.stages.slice(secondPassStart))
    ).not.toContain("link-printer");
  });

  it("sends the first delivery out of several connections at one moment", () => {
    // The defect this replaces: the flood was authored as three stages in a
    // row, so the picture showed the file visiting the Printer and then PC-B.
    // Switching does not work that way. One stage now names every connection
    // occupied at that moment, and the drawing shows one action with copies.
    const flood = journey().stages.find(
      (stage) => stage.stageId === "d2-switch-sends-copies"
    );

    expect(flood?.atNodeId).toBe("sw-1");
    expect(flood?.viaLinkId).toBe("link-pc-a");
    expect([...(flood?.alsoOnLinkIds ?? [])].sort()).toEqual([
      "link-pc-b",
      "link-printer"
    ]);

    // And the connection to the router is NOT among them. It is not authored,
    // so nothing may light it — if this ever fails, something started working
    // out which ports a switch "would" use.
    expect(flood?.alsoOnLinkIds ?? []).not.toContain("link-router");
  });

  it("sends the second delivery out of one connection only", () => {
    const second = journey().stages.find(
      (stage) => stage.stageId === "d7-switch-sends-once"
    );

    expect(second?.atNodeId).toBe("sw-1");
    expect(second?.viaLinkId).toBe("link-pc-a");
    // The whole comparison the mission rests on: no simultaneous copies.
    expect(second?.alsoOnLinkIds).toBeUndefined();
  });

  it("keeps the reply authored rather than a reversed path", () => {
    // A reply is not the renderer walking the journey backwards. It is
    // authored stages naming authored links, exactly like every other step.
    const reply = journey().stages.find(
      (stage) => stage.stageId === "d4-pc-b-replies"
    );

    expect(reply?.atNodeId).toBe("sw-1");
    expect(reply?.viaLinkId).toBe("link-pc-b");
    expect(reply?.narration ?? "").toMatch(/repl/i);
  });

  it("reaches the destination in both passes", () => {
    const journeyValue = journey();
    const destination = journeyValue.traffic.destinationNodeId;
    const secondPassStart = journeyValue.stages.findIndex(
      (stage, index) => index > 0 && stage.viaLinkId === undefined
    );

    expect(
      journeyValue.stages
        .slice(0, secondPassStart)
        .some((stage) => stage.atNodeId === destination)
    ).toBe(true);
    expect(
      journeyValue.stages
        .slice(secondPassStart)
        .some((stage) => stage.atNodeId === destination)
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Technical accuracy
 * ------------------------------------------------------------------ */

describe("the simplification stays technically true", () => {
  it("never calls unknown-destination flooding a broadcast", () => {
    // These are different behaviours. What PJ2 shows is a frame whose
    // destination the switch has not learned being sent out of the other
    // ports; a broadcast is a frame deliberately addressed to every machine,
    // which needs an address the learner does not have until Mission 4.
    // Teaching the first under the second's name would have to be unlearned.
    for (const stableId of AUTHORED) {
      expect(usesWord(learnerFacingText(stableId), "broadcasts?")).toBe(false);
    }
  });

  it("names the behaviour it actually shows", () => {
    expect(usesWord(learnerFacingText(M2), "flooding")).toBe(true);
  });

  it("teaches that the switch learns from traffic arriving, not from the destination", () => {
    // The accuracy that is easiest to get wrong: a switch learns from the
    // SOURCE of a frame on ingress, which is why it knows the sender from the
    // very first frame and the destination only after a reply.
    // Asserted against the authored learned state rather than against prose,
    // because that state is now what the learner actually reads. The record
    // must gain PC-A first and PC-B only once PC-B has sent something.
    const stages = journeyOf(M2).stages;

    const switchRecordAt = (stageId: string): readonly string[] =>
      (
        stages
          .find((stage) => stage.stageId === stageId)
          ?.deviceFacts?.find((shown) => shown.nodeId === "sw-1")?.facts ?? []
      ).map((fact) => fact.label);

    // After the first delivery: the sender, and only the sender.
    expect(switchRecordAt("d3-copies-arrive")).toEqual(["PC-A"]);
    // The reply is what supplies the destination.
    expect(switchRecordAt("d4-pc-b-replies")).toEqual(["PC-A", "PC-B"]);

    // And the prose agrees with the state, so the two cannot drift.
    const replyDecision =
      stages.find((stage) => stage.stageId === "d4-pc-b-replies")?.decision ??
      "";
    expect(replyDecision).toMatch(/PC-B is on port 2/);
  });

  it("never shows the switch knowing a device before that device has sent anything", () => {
    // The single easiest error in this mission: a switch cannot learn where a
    // machine is until that machine transmits. PC-B's first transmission is
    // its reply, so no stage before it may carry PC-B in the record.
    const stages = journeyOf(M2).stages;
    const replyAt = stages.findIndex(
      (stage) => stage.stageId === "d4-pc-b-replies"
    );

    expect(replyAt).toBeGreaterThan(0);

    for (const stage of stages.slice(0, replyAt)) {
      const record =
        stage.deviceFacts?.find((shown) => shown.nodeId === "sw-1")?.facts ??
        [];
      expect(record.map((fact) => fact.label)).not.toContain("PC-B");
    }
  });

  it("does not claim the unintended recipient never received anything", () => {
    // It received a copy and did not accept it. "Never saw it" would be false
    // for the first delivery, and it is the distinction the last concept step
    // teaches. The Printer's copy now arrives at the same authored moment as
    // PC-B's, so the claim lives in that stage rather than in one of its own.
    const arrival = journeyOf(M2).stages.find(
      (stage) => stage.stageId === "d3-copies-arrive"
    );

    expect(arrival?.narration ?? "").toMatch(/reaches the Printer/);
    expect(arrival?.narration ?? "").toMatch(/does not accept it/);
    expect(
      `${arrival?.narration ?? ""} ${arrival?.decision ?? ""}`
    ).not.toMatch(/never (saw|received)/i);

    // And the Printer says so on its own face, in authored words rather than
    // through a renderer state that would have to mean "discarded".
    const printerFacts = arrival?.deviceFacts?.find(
      (shown) => shown.nodeId === "printer"
    );

    expect(printerFacts).toBeDefined();
    expect(JSON.stringify(printerFacts)).toMatch(/Copy arrived/);
  });

  it("never presents the unintended copy as a fault", () => {
    // Founder-approved language rule: a copy reaching a machine it was not
    // meant for is the system working, not breaking. Nothing in this journey
    // may describe it with failure vocabulary.
    const journeyValue = journeyOf(M2);
    const prose = [
      ...journeyValue.stages.flatMap((stage) => [
        stage.narration,
        stage.decision ?? "",
        JSON.stringify(stage.deviceFacts ?? [])
      ]),
      journeyValue.confirmation.narration,
      journeyValue.confirmation.summary
    ].join("\n");

    // Words that can only mean malfunction. "wrong" and "failure" are
    // deliberately NOT here: the mission says "nothing has gone wrong at the
    // Printer" and names a step "Looks wrong, works as designed", and both
    // are the reassurance rather than the claim. A rule that banned the word
    // regardless of polarity would forbid the sentence doing the work.
    for (const failure of [
      "error",
      "fault",
      "failed",
      "broken",
      "dropped",
      "lost",
      "rejected",
      "invalid",
      "corrupt"
    ]) {
      expect(
        { term: failure, used: usesWord(prose, failure) },
        `the unintended copy is described as a failure: "${failure}"`
      ).toEqual({ term: failure, used: false });
    }

    // And the reassurance is actually present, so this is not satisfied by
    // simply saying nothing about the Printer at all.
    expect(prose).toMatch(/nothing has gone wrong/i);
  });
});

/* ------------------------------------------------------------------ *
 * Teach before use
 * ------------------------------------------------------------------ */

describe("no learner-facing term arrives before it is taught", () => {
  /** Terms whose earliest mission is later than Module 1. */
  const DEFERRED = [
    "packets?",
    "routing",
    "route",
    "gateway",
    "subnets?",
    "prefix",
    "netmask",
    "IPv4",
    "IPv6",
    "ARP",
    "VLANs?",
    "DHCP",
    "DNS",
    "ping",
    "ICMP"
  ] as const;

  for (const stableId of AUTHORED) {
    it(`${stableId} uses no deferred networking vocabulary`, () => {
      const text = learnerFacingText(stableId);

      for (const term of DEFERRED) {
        expect({ term, used: usesWord(text, term) }).toEqual({
          term,
          used: false
        });
      }
    });

    it(`${stableId} does not write an IP address a learner could read`, () => {
      expect(learnerFacingText(stableId)).not.toMatch(
        /\b\d{1,3}(\.\d{1,3}){3}\b/
      );
    });
  }

  it("does not name a layer model", () => {
    for (const stableId of AUTHORED) {
      const text = learnerFacingText(stableId);
      expect(text).not.toMatch(/\bLayer\s*[23]\b/i);
      expect(usesWord(text, "OSI")).toBe(false);
    }
  });

  it("keeps Mission 1 free of the identity Mission 2 introduces", () => {
    const text = learnerFacingText(M1);
    expect(usesWord(text, "MAC")).toBe(false);
    expect(usesWord(text, "frame")).toBe(false);
    expect(usesWord(text, "flooding")).toBe(false);
  });

  it("introduces each Mission 1 term in a step before the one that teaches with it", () => {
    /*
      ## Why step 0 is excluded

      The approved Mission 1 specification opens with a short "what you'll
      learn" step that previews the mission's objectives, and one of those
      objectives is where a switch sits. Naming a term in a list of what is
      coming is a PREVIEW; it asks the learner to understand nothing.

      The guarantee worth holding is the other one: no step may TEACH WITH a
      term the learner has not been given yet. That is measured across the
      teaching steps, which is what this does.

      This supersedes the strict "connection point before the device" ordering
      recorded as Architect Decision E. The specification introduces the switch
      earlier than that decision assumed; the implementation still teaches the
      interface first, and the preview is the only place the order differs.
    */
    const steps = mission(M1).steps.slice(1);
    const positionOfFirstUse = (word: string): number =>
      steps.findIndex((step) => {
        const content = step.content;
        if (content.type !== "concept") return false;
        return usesWord(
          [content.title ?? "", ...content.paragraphs].join("\n"),
          word
        );
      });

    // The connection point, then the device those connections lead into.
    expect(positionOfFirstUse("interface")).toBeGreaterThanOrEqual(0);
    expect(positionOfFirstUse("interface")).toBeLessThan(
      positionOfFirstUse("switch")
    );
    // And the topology is named only after the learner has walked one.
    expect(positionOfFirstUse("topology")).toBeGreaterThan(
      positionOfFirstUse("switch")
    );
  });

  it("opens by saying what the mission will teach", () => {
    // The approved specification's first teaching moment. A learner should be
    // able to scan what they are about to learn before anything asks them to
    // do something — the "what am I learning?" half of a calm screen.
    const first = mission(M1).steps[0]?.content;

    if (first === undefined || first.type !== "concept") {
      throw new Error("Mission 1 does not open with a concept step");
    }

    const prose = [first.title ?? "", ...first.paragraphs].join("\n");

    // The concrete scenario, up front rather than discovered in the exercise.
    expect(prose).toMatch(/print/i);
    // And an objectives preview the learner can scan.
    expect(prose).toMatch(/you will learn/i);
  });

  it("names the identity in Mission 2 only after the journey that motivates it", () => {
    const steps = mission(M2).steps;
    const interactionAt = steps.findIndex(
      (step) => step.content.type === "interaction"
    );
    const macAt = steps.findIndex(
      (step) =>
        step.content.type === "concept" &&
        usesWord(step.content.paragraphs.join("\n"), "MAC")
    );
    const frameAt = steps.findIndex(
      (step) =>
        step.content.type === "concept" &&
        usesWord(step.content.paragraphs.join("\n"), "frame")
    );

    expect(interactionAt).toBeGreaterThanOrEqual(0);
    expect(macAt).toBeGreaterThan(interactionAt);
    expect(frameAt).toBeGreaterThan(interactionAt);
  });

  it("shows only taught fields in the authored command output", () => {
    const command = mission(M2).steps.find(
      (step) => step.content.type === "command"
    );

    if (command === undefined || command.content.type !== "command") {
      throw new Error("Mission 2 authors no command step");
    }

    const output = command.content.output ?? "";

    // Real output carries an address, flags, an MTU and a queue discipline.
    // Every one of them would be a term the learner has not met.
    expect(output).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    for (const field of ["mtu", "qdisc", "BROADCAST", "MULTICAST", "brd"]) {
      expect(output).not.toContain(field);
    }
    // And it must still show the thing it exists to show.
    expect(output).toMatch(/\b[0-9a-f]{2}(:[0-9a-f]{2}){5}\b/i);
  });
});

/* ------------------------------------------------------------------ *
 * Support levels — the real server projection
 * ------------------------------------------------------------------ */

describe("the server projection protects what it should", () => {
  const interactionStep = (stableId: string): MissionStep => {
    const step = mission(stableId).steps.find(
      (candidate) => candidate.content.type === "interaction"
    );
    if (step === undefined) throw new Error(`${stableId} has no interaction`);
    return step;
  };

  const project = (stableId: string, supportLevel: string) => {
    const step = interactionStep(stableId);
    if (step.content.type !== "interaction") throw new Error("not interaction");

    return projectMissionStepContent({
      ...step.content,
      supportLevel: supportLevel as MissionStepInteractionContent["supportLevel"]
    });
  };

  for (const stableId of AUTHORED) {
    it(`${stableId} sends the teaching at SHOW ME`, () => {
      const projected = project(stableId, "show_me");
      expect(projected.type).toBe("interaction");

      if (projected.type !== "interaction") return;
      expect(projected.presentation.state).toBe("available");

      if (projected.presentation.state !== "available") return;
      const parameters = projected.presentation.parameters;
      expect(parameters.confirmation).toBeDefined();
      expect(
        parameters.stages.some((stage) => stage.decision !== undefined)
      ).toBe(true);
    });

    it(`${stableId} withholds every explanation at CHALLENGE ME`, () => {
      const projected = project(stableId, "challenge_me");
      if (projected.type !== "interaction") throw new Error("not interaction");
      expect(projected.presentation.state).toBe("available");

      if (projected.presentation.state !== "available") return;
      const parameters = projected.presentation.parameters;

      // The answer-bearing halves are ABSENT, not merely undrawn.
      expect(parameters.confirmation).toBeUndefined();
      for (const stage of parameters.stages) {
        expect(stage.decision).toBeUndefined();
      }

      // And what remains still lets the learner do the work.
      expect(parameters.nodes.length).toBeGreaterThan(0);
      expect(parameters.links.length).toBeGreaterThan(0);
      expect(
        parameters.stages.every((stage) => stage.narration.length > 0)
      ).toBe(true);
      expect(
        parameters.stages.some((stage) => stage.prediction !== undefined)
      ).toBe(true);
    });

    it(`${stableId} withholds the whole simulation at PROVE IT`, () => {
      const projected = project(stableId, "prove_it");
      if (projected.type !== "interaction") throw new Error("not interaction");
      expect(projected.presentation.state).toBe("withheld");
      expect(projected.presentation).not.toHaveProperty("parameters");
    });

    it(`${stableId} keeps the text equivalent at every level`, () => {
      for (const level of ["show_me", "challenge_me", "prove_it"]) {
        const projected = project(stableId, level);
        if (projected.type !== "interaction") throw new Error("not interaction");
        expect(projected.textEquivalent.length).toBeGreaterThan(0);
      }
    });
  }
});

/* ------------------------------------------------------------------ *
 * Nothing about the learner
 * ------------------------------------------------------------------ */

describe("Module 1 creates no learner state", () => {
  it("adds no evidence, progress or competency field to any step", () => {
    // Asserted over the authored FIELD NAMES, never over prose.
    //
    // The first version of this test searched the serialised steps for words
    // like "passed" and "correct", and failed on the sentence "nothing
    // addressed to PC-B's interface has ever passed through it" — ordinary
    // English in a prediction prompt. That is the same defect the WP-J gate
    // hit when a substring rule matched "nat" inside "destination", and the
    // lesson is the same: a rule about structure must read structure.
    //
    // The invariant is real and worth pinning: a mission step's content type
    // has no learner-state field, so one could only appear by someone widening
    // the contract. Keys are exactly where that would show up.
    const keys = new Set<string>();

    const collect = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }
      if (value === null || typeof value !== "object") return;

      for (const [key, nested] of Object.entries(value)) {
        keys.add(key);
        collect(nested);
      }
    };

    collect(AUTHORED.map((stableId) => mission(stableId).steps));

    for (const forbidden of [
      "evidence",
      "evidenceId",
      "competencyStableId",
      "competencyVersion",
      "progress",
      "score",
      "passed",
      "correct",
      "correctOption",
      "answer",
      "expectedOutcome",
      "resolvesFault"
    ]) {
      expect({ forbidden, present: keys.has(forbidden) }).toEqual({
        forbidden,
        present: false
      });
    }
  });

  it("leaves the mission's competency claims exactly as J1 authored them", () => {
    expect(mission(M1).competencies).toEqual([
      {
        competencyStableId: "net.topology-literacy",
        required: true,
        relationship: "develops"
      }
    ]);

    expect(mission(M2).competencies).toEqual([
      {
        competencyStableId: "net.local-delivery",
        required: true,
        relationship: "develops"
      },
      {
        competencyStableId: "net.topology-literacy",
        required: true,
        relationship: "reinforces"
      }
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Authored topology grouping
 *
 * Founder UAT required a learner to SEE which devices are being studied
 * together. The Architect approved one additive authored fact for it, and these
 * tests hold Module 1's use of that fact to the same standard as its prose:
 * the grouping must be TRUE of what the missions actually teach, and it must
 * not smuggle in a networking claim the course has not earned.
 * ------------------------------------------------------------------ */

describe("Module 1 authors its grouping, and authors it truthfully", () => {
  for (const stableId of AUTHORED) {
    it(`declares exactly one group in ${stableId}`, () => {
      const groups = journeyOf(stableId).groups ?? [];

      expect(groups).toHaveLength(1);
      expect(groups[0]?.groupId).toBe("local-network");
      expect(groups[0]?.label).toBe("Local network");
    });

    it(`resolves every group reference in ${stableId}`, () => {
      // The parser refuses a dangling reference, so this is a second statement
      // of an invariant already enforced — worth making because a boundary
      // drawn around a group that does not exist is the failure mode the whole
      // contract exists to prevent.
      const journey = journeyOf(stableId);
      const declared = new Set((journey.groups ?? []).map((g) => g.groupId));

      for (const node of journey.nodes) {
        if (node.groupId === undefined) continue;
        expect(declared.has(node.groupId)).toBe(true);
      }
    });
  }

  it("groups the devices PJ1 teaches as one local network", () => {
    // Mission 1 step 4 states it directly: every host has one link, every one
    // of those links ends at Switch-1, and anything travelling between two
    // hosts passes through it. Those four devices are what the mission studies
    // together, so those four are what the boundary encloses.
    const grouped = journeyOf(M1)
      .nodes.filter((node) => node.groupId === "local-network")
      .map((node) => node.label)
      .sort();

    expect(grouped).toEqual(["PC-A", "PC-B", "Printer", "Switch-1"]);
  });

  it("leaves Router-1 outside the group, because that is what M1 teaches", () => {
    // The authored prose is explicit — "Router-1 marks the point where this
    // local network stops", and its outward port "leads away from this network
    // entirely". Placing Router-1 inside the boundary would contradict the
    // sentence printed beside the picture.
    //
    // It also teaches no routing. Being drawn at the edge says where the
    // device sits, not what it does with traffic, which is Missions 5 and 6.
    const router = journeyOf(M1).nodes.find((node) => node.label === "Router-1");

    expect(router?.role).toBe("router");
    expect(router?.groupId).toBeUndefined();
  });

  it("groups all four devices in PJ2, which has no device outside them", () => {
    // Mission 2 is titled "Inside one network" and its own text equivalent
    // opens with "A small network of four devices". Every device it declares
    // is part of that network, so every device is a member.
    const journey = journeyOf(M2);

    expect(journey.nodes.every((node) => node.groupId === "local-network")).toBe(
      true
    );
    expect(journey.nodes).toHaveLength(4);
  });

  it("names the group in words the missions already use", () => {
    // "Local network" is Mission 1's own phrase. A caption inventing a term
    // the course has not taught would be vocabulary arriving in a picture,
    // which is the one place the teach-before-use audit cannot see it — which
    // is exactly why the group label is collected as learner-facing prose.
    const prose = learnerFacingText(M1).toLowerCase();

    expect(prose).toContain("local network");
  });

  it("adds no networking claim to the authored group", () => {
    // A group is an id and a label. Module 1 must not have used it to smuggle
    // in a subnet, a VLAN or a broadcast domain — none of which the course has
    // taught, and none of which the contract can express.
    for (const stableId of AUTHORED) {
      const serialised = JSON.stringify(journeyOf(stableId).groups ?? []);

      for (const forbidden of [
        "subnet",
        "mask",
        "vlan",
        "broadcast",
        "routing",
        "gateway",
        "reachable"
      ]) {
        expect(serialised.toLowerCase()).not.toContain(forbidden);
      }

      for (const group of journeyOf(stableId).groups ?? []) {
        expect(Object.keys(group).sort()).toEqual(["groupId", "label"]);
      }
    }
  });

  it("reaches the learner through the projection at every level it is offered", () => {
    // The grouping is topology, not an answer, so it must survive the same
    // projection that strips the expected path at CHALLENGE ME.
    for (const level of ["show_me", "challenge_me"] as const) {
      const authored = interactionOf(M1);
      const projected = projectMissionStepContent({
        ...authored,
        supportLevel: level
      });

      if (projected.type !== "interaction") throw new Error("expected an interaction");
      if (projected.presentation.state !== "available") {
        throw new Error("expected an available interaction");
      }

      const parameters = projected.presentation.parameters;

      expect(parameters.groups).toEqual([
        { groupId: "local-network", label: "Local network" }
      ]);
      expect(
        parameters.nodes.filter((node) => node.groupId === "local-network")
      ).toHaveLength(4);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Concrete language — no unexplained placeholder nouns
 *
 * Founder UAT rejected "Send something from PC-A":
 *
 *   "what is something? I want this type of language to be removed completely
 *    from this application! Provide a real world context to what something is.
 *    This needs to be relatable to new learners."
 *
 * The rule the Architect formalised is SEMANTIC, not lexical: learner-facing
 * technical instruction must not use a placeholder noun where the learner needs
 * a concrete referent to understand what is happening.
 *
 * These tests therefore do NOT ban ordinary English pronouns, which would fail
 * on correct prose and teach the next author to write around a regex. They pin
 * the known-dangerous constructions, and they pin the concrete scenario that
 * replaced the abstract one. Whether a sentence READS well remains Human UAT.
 * ------------------------------------------------------------------ */

describe("Module 1 names what is moving, and never a placeholder", () => {
  /**
   * Constructions where a placeholder noun stands exactly where the learner
   * needs the object of the lesson.
   *
   * Each is a PHRASE, not a word. "something" inside "something like a switch"
   * is ordinary English; "sends something" is the defect.
   *
   * The list is deliberately narrow. An earlier draft included "something
   * from", which fired on the course's own framing question — "how does
   * something get from here to there?" — a sentence whose referent is
   * established by the three concrete examples immediately above it. A rule
   * that fails on correct prose is a rule the next author writes around, so
   * generality is left to Human UAT and only the known defects are pinned.
   */
  const PLACEHOLDER_PHRASES = [
    "send something",
    "sends something",
    "sending something",
    "send anything",
    "sends anything",
    "anything pc-a sends",
    "has something for",
    "sends something to",
    "records something",
    "attached to something",
    "some stuff",
    "look at it",
    "watch it",
    "follow it through",
    "see what happens to it",
    "some are there so",
    "a machine someone uses"
  ];

  for (const stableId of AUTHORED) {
    it(`uses no placeholder construction in ${stableId}`, () => {
      const text = learnerFacingText(stableId).toLowerCase();

      for (const phrase of PLACEHOLDER_PHRASES) {
        expect({ phrase, used: text.includes(phrase) }).toEqual({
          phrase,
          used: false
        });
      }
    });
  }

  it("names a print request as the thing PC-A sends", () => {
    const journey = journeyOf(M1);

    expect(journey.traffic.label).toBe("the print request");
    expect(journey.traffic.startActionLabel).toBe("Send the print request");
    expect(journey.traffic.sourceNodeId).toBe("pc-a");
  });

  it("gives the scenario a reason a beginner already understands", () => {
    // Printing a document is ordinary life, not networking. That is the point:
    // the learner arrives with the context already in place.
    const caption = interactionOf(M1).caption ?? "";

    expect(caption).toMatch(/print/i);
    expect(caption).toMatch(/document|printer/i);
  });

  it("asks the prediction about the print request by name", () => {
    const prediction = journeyOf(M1).stages[0]?.prediction;

    expect(prediction?.prompt).toMatch(/print request/);
    expect(prediction?.prompt).not.toMatch(/something/i);

    // The options are the device names themselves. A learner choosing between
    // three devices is choosing between three devices, not three sentences.
    expect(prediction?.options).toEqual(["The Printer", "Switch-1", "Router-1"]);
  });

  it("names the print request in what the learner observes", () => {
    const stages = journeyOf(M1).stages;

    expect(stages[0]?.narration).toMatch(/print request/);
    expect(stages[1]?.narration).toMatch(/print request/);
    expect(journeyOf(M1).confirmation.narration).toMatch(/print request/);
  });

  it("introduces no protocol vocabulary the course has not taught", () => {
    // "Print request" is a real-world object at this point in the course. It is
    // NOT a packet, a frame, an IP datagram or an ICMP echo request, and none
    // of those words may arrive early merely because they are more precise.
    const text = learnerFacingText(M1).toLowerCase();

    for (const untaught of [
      "icmp",
      "echo request",
      "ethernet frame",
      "ip packet",
      "datagram",
      "arp",
      "layer 2",
      "layer 3",
      "pdu",
      "tcp",
      "udp"
    ]) {
      expect({ untaught, used: text.includes(untaught) }).toEqual({
        untaught,
        used: false
      });
    }
  });

  it("describes PC-A once, in one natural sentence", () => {
    // The rejected prose was "PC-A is a machine someone uses. PC-A has one
    // network interface, and one link leaves that interface." — the subject
    // repeated three times in two sentences, and a description that told the
    // learner nothing.
    const first = journeyOf(M1).stages[0];
    const prose = `${first?.narration ?? ""} ${first?.decision ?? ""}`;

    expect(prose).not.toMatch(/a machine someone uses/i);

    // No sentence in this pair may open with the subject more than twice, and
    // the description must say what PC-A REPRESENTS rather than restating it.
    const sentenceStarts = prose
      .split(/(?<=\.)\s+/)
      .filter((sentence) => sentence.trim().startsWith("PC-A"));

    expect(sentenceStarts.length).toBeLessThanOrEqual(2);

    // It must say what PC-A IS in ordinary words. The exact phrase used to be
    // "a user's computer"; the approved Mission 1 specification names PC-A as
    // "the computer sending our print request", so what is pinned here is
    // that the description is concrete, not which of those sentences it is.
    expect(prose).toMatch(/computer/i);
  });

  it("keeps the device descriptions concrete", () => {
    const values = journeyOf(M1)
      .nodes.flatMap((node) => node.interfaces)
      .flatMap((iface) => iface.attributes)
      .map((attribute) => attribute.value);

    expect(values).not.toContain("A machine someone uses");
    expect(values).not.toContain("A machine that produces documents");
    expect(values).toContain("A computer someone uses");
    expect(values).toContain("The network printer");
  });
});

describe("every device explains itself before it lists itself", () => {
  /**
   * WP-J Module 1, Founder UAT — device inspection.
   *
   * Selecting a device used to present its whole technical inventory to a
   * beginner who had asked a much smaller question: "what is this, and why is
   * it here?" The repair is authored prose that answers that question, with
   * the interfaces and attributes kept intact behind a deliberate disclosure.
   *
   * These prove the authored half. Whether the writing is calm, concise and
   * professional is Human UAT's judgement, so nothing here pins the prose
   * itself — only the properties that must hold however it is rewritten.
   */
  const pj1 = journeyOf(M1);
  const pj2 = journeyOf(M2);

  it("explains every device in both walkthroughs", () => {
    // No device a learner can click is left without an answer. A beginner who
    // selects PC-B and reads nothing learns that clicking devices is not
    // worth doing.
    for (const journey of [pj1, pj2]) {
      for (const node of journey.nodes) {
        expect(node.about, `${node.label} has no explanation`).toBeDefined();
        expect((node.about ?? "").length).toBeGreaterThan(40);
      }
    }
  });

  it("names the device it explains", () => {
    // Concrete referents, per the writing standard. An explanation that opens
    // with "this device" leaves a learner who clicked the wrong card unaware
    // that they did.
    for (const journey of [pj1, pj2]) {
      for (const node of journey.nodes) {
        expect(node.about ?? "").toContain(node.label);
      }
    }
  });

  it("explains Router-1's purpose without teaching Mission 5's mechanism", () => {
    // The narrow line the Architect drew. A learner who sees a router in
    // Mission 1 can reasonably ask why it is on the screen, and "it connects
    // one network to another" answers that. HOW it decides anything is
    // Mission 5's and Mission 6's, and device inspection must not become a
    // second curriculum running out of order.
    const router = pj1.nodes.find((node) => node.nodeId === "r-1");
    const about = router?.about ?? "";

    expect(about).toContain("Router-1");
    expect(about).toContain("Mission 5");

    // Whole-word, for the reason this file's header already records: a
    // substring rule that forbids "route" fires on "Router-1", which is the
    // one word the explanation obviously has to contain.
    for (const deferred of [
      "routing table",
      "forwarding table",
      "route",
      "routes",
      "routing",
      "default gateway",
      "gateway",
      "subnet",
      "prefix",
      "netmask",
      "ARP",
      "MAC address",
      "broadcast",
      "IP address"
    ]) {
      expect(
        usesWord(about, deferred),
        `Router-1's explanation teaches "${deferred}"`
      ).toBe(false);
    }
  });

  it("tells the learner why Router-1 takes no part in this print request", () => {
    // The ambiguity Founder UAT found. A device drawn on the screen and never
    // used needs its absence explained, or the learner is left waiting for an
    // arrival that is never coming.
    const about = pj1.nodes.find((node) => node.nodeId === "r-1")?.about ?? "";

    expect(about).toMatch(/does not use Router-1/i);
  });

  it("defers the switching mechanism from Switch-1's explanation too", () => {
    // Mission 1's whole discipline, applied to the surface a curious learner
    // reaches by clicking rather than by reading.
    const about = pj1.nodes.find((node) => node.nodeId === "sw-1")?.about ?? "";

    expect(about).toContain("Mission 2");

    for (const deferred of [
      "MAC",
      "MAC address",
      "forwarding table",
      "flood",
      "floods",
      "flooding",
      "learns",
      "learned",
      "frame",
      "Ethernet",
      "Layer 2"
    ]) {
      expect(
        usesWord(about, deferred),
        `Switch-1's explanation teaches "${deferred}"`
      ).toBe(false);
    }
  });

  it("points forward without promising a result", () => {
    // A forward reference is instructional context, never progression. It
    // names a mission the course contains and claims nothing about unlocking,
    // completing, earning or scoring.
    for (const journey of [pj1, pj2]) {
      for (const node of journey.nodes) {
        const about = (node.about ?? "").toLowerCase();
        for (const promise of [
          "unlock",
          "you will earn",
          "points",
          "score",
          "badge",
          "complete this to",
          "level up"
        ]) {
          expect(about).not.toContain(promise);
        }
      }
    }
  });

  it("references only missions this course actually contains", () => {
    // A forward reference the learner cannot follow is worse than none.
    const titles = document.missions.map((m) => m.title).join("\n");

    for (const journey of [pj1, pj2]) {
      for (const node of journey.nodes) {
        for (const match of (node.about ?? "").matchAll(/Mission (\d+)/g)) {
          expect(titles).toContain(`Mission ${match[1]} —`);
        }
      }
    }
  });

  it("keeps every authored interface and attribute intact", () => {
    // Simplifying the default view must not delete anything from the model.
    // Later courses inspect, troubleshoot and operate against exactly this
    // data, so it stays whole and moves behind a disclosure instead.
    const switch1 = pj1.nodes.find((node) => node.nodeId === "sw-1");

    expect(switch1?.interfaces.map((iface) => iface.label)).toEqual([
      "Port 1",
      "Port 2",
      "Port 3",
      "Port 4"
    ]);
    expect(
      switch1?.interfaces.every((iface) => iface.attributes.length > 0)
    ).toBe(true);
  });

  it("never tells a learner to wait for something that is not coming", () => {
    // The exact wording Founder UAT rejected, retired everywhere in Module 1.
    for (const stableId of AUTHORED) {
      expect(learnerFacingText(stableId)).not.toContain("Not reached yet");
    }
  });
});

describe("the topology carries the connection facts the lesson depends on", () => {
  /**
   * The approved Mission 1 specification, "TOPOLOGY AS INSTRUCTION":
   *
   *   A learner should not need to click a device, scroll the instructor
   *   pane, expand technical details, find a port fact, memorise it, scroll
   *   back and compare it with the diagram — when the fact is fundamental to
   *   understanding the visible network.
   *
   * Mission 1 says things like "PC-A's link ends at port 1 on Switch-1". That
   * sentence is about something the learner cannot see unless the picture
   * names the port, so the ports the lesson names must be authored to appear
   * on the drawing.
   */
  const journey = () => journeyOf(M1);

  const switchInterfaces = () =>
    journey().nodes.find((node) => node.nodeId === "sw-1")?.interfaces ?? [];

  it("marks the ports the walkthrough names to be drawn", () => {
    const drawn = switchInterfaces()
      .filter((iface) => iface.prominent === true)
      .map((iface) => iface.label);

    expect(drawn).toEqual(["Port 1", "Port 2", "Port 3"]);
  });

  it("leaves the port this mission never uses unmarked", () => {
    // Router-1's port is real, listed, and inspectable — and deliberately not
    // on the picture, because Mission 1 defers Router-1 entirely. It is also
    // the proof that the flag is an authoring decision: a presentation that
    // labelled "the switch's ports" would have labelled this one too.
    const router = switchInterfaces().find(
      (iface) => iface.interfaceId === "sw-1-p4"
    );

    expect(router?.label).toBe("Port 4");
    expect(router?.prominent).toBeUndefined();
  });

  it("marks no host interface, so the diagram stays to three labels", () => {
    // Calm is a requirement, not a preference. Labelling both ends of every
    // wire would put six labels on a five-device picture and turn it into a
    // patch panel.
    for (const node of journey().nodes) {
      if (node.nodeId === "sw-1") continue;

      for (const iface of node.interfaces) {
        expect({ node: node.nodeId, drawn: iface.prominent }).toEqual({
          node: node.nodeId,
          drawn: undefined
        });
      }
    }
  });

  it("names each drawn port on the link the learner is told about", () => {
    // The mapping the specification states: PC-A to Port 1, PC-B to Port 2,
    // the Printer to Port 3. Read from the authored links, so the picture and
    // the instruction cannot disagree.
    const expected: Record<string, string> = {
      "pc-a-nic": "sw-1-p1",
      "pc-b-nic": "sw-1-p2",
      "printer-nic": "sw-1-p3"
    };

    for (const [hostInterface, switchPort] of Object.entries(expected)) {
      const link = journey().links.find(
        (candidate) =>
          candidate.endpoints.includes(hostInterface) &&
          candidate.endpoints.includes(switchPort)
      );

      expect({ hostInterface, linked: link !== undefined }).toEqual({
        hostInterface,
        linked: true
      });
    }
  });

  it("keeps the port facts required by the walkthrough out of optional details", () => {
    // The specification's real test: could a learner follow the walkthrough
    // without ever opening the inspector? The stages name ports 1 and 3, and
    // both of those are drawn, so the answer is yes.
    const named = journey()
      .stages.map((stage) => stage.decision ?? "")
      .join(" ");

    const drawn = switchInterfaces()
      .filter((iface) => iface.prominent === true)
      .map((iface) => iface.label.toLowerCase());

    for (const port of ["port 1", "port 3"]) {
      expect({ port, mentioned: named.toLowerCase().includes(port) }).toEqual({
        port,
        mentioned: true
      });
      expect({ port, drawn: drawn.includes(port) }).toEqual({
        port,
        drawn: true
      });
    }
  });
});
