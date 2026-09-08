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
const M6 = "nf-m6-routers-and-the-journey";
const M7 = "nf-m7-testing-whether-it-works";

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
      // The author's phrase for what the device is doing. It heads the beat
      // card and is spoken by the live region, so it is prose on the screen
      // like any other and every vocabulary rule below applies to it.
      if (stage.action !== undefined) parts.push(stage.action);
      // What is moving, when a stage says something different is moving from
      // the journey as a whole. Mission 2's return leg names PC-B's reply.
      if (stage.traffic !== undefined) parts.push(stage.traffic.label);
      if (stage.prediction !== undefined) {
        parts.push(stage.prediction.prompt, ...stage.prediction.options);
        // The graded half. A prediction that carries an answer key shows the
        // learner the key and the reason, so both are read prose — and without
        // collecting them, the answer to a graded prediction would be the one
        // place in a mission a deferred term could arrive unchecked.
        if (stage.prediction.correctOption !== undefined) {
          parts.push(stage.prediction.correctOption);
        }
        if (stage.prediction.explanation !== undefined) {
          parts.push(stage.prediction.explanation);
        }
      }
      // Knowledge checks were never collected here, and Mission 2's Founder
      // UAT repair is what makes that matter: it moves a question out of a
      // prediction and into a check, so the same words would have left the
      // vocabulary rules' reach by being reworded rather than by changing.
      for (const check of stage.knowledgeChecks ?? []) {
        parts.push(
          check.prompt,
          ...check.options,
          check.correctOption,
          check.explanation
        );
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
      case "near_transfer":
        // WP-NF-NT1. Every vocabulary rule below applies to a near-transfer
        // check exactly as it applies to a paragraph, and this case is what
        // makes that true. Without it the eighth step type would be the one
        // place in a mission where a deferred term, an address or a routing
        // mechanism could be introduced with every rule still reporting
        // success — the "passes, on one step fewer" failure this file's
        // isEndDevice comment already describes once.
        //
        // Identifiers are excluded by construction, as everywhere else here:
        // `questionStableId` and `optionId` are never collected, so a rule
        // cannot fire on the schema's own spelling.
        if (content.title !== undefined) parts.push(content.title);
        if (content.framing !== undefined) parts.push(content.framing);
        if (content.topology !== undefined) {
          parts.push(content.topology.textEquivalent);
          for (const node of content.topology.nodes) {
            parts.push(node.label);
            if (node.about !== undefined) parts.push(node.about);
          }
          for (const link of content.topology.links) parts.push(link.label);
        }
        for (const question of content.questions) {
          parts.push(question.prompt, question.explanation);
          for (const option of question.options) parts.push(option.text);
        }
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

describe("Module 1 owns its own instruction", () => {
  /**
   * This used to list every mission authored anywhere in the course, so that
   * it could assert the emptiness of the missions nobody had authored yet.
   * That was a course-wide fact living in a Module 1 gate, and it needed
   * editing every time an unrelated slice landed.
   *
   * DEC-061 moved course authoring state to
   * `services/api/src/networking-foundations.test.ts`, which reads the mission
   * authority declaration. What is left here is what Module 1 actually owns:
   * a Module 1 step appears under a Module 1 mission and nowhere else.
   */
  it("keeps Module 1's instruction inside Module 1", () => {
    for (const m of document.missions) {
      const mine = m.steps
        .map((step) => step.stableId)
        .filter(
          (stableId) =>
            stableId.startsWith("m1-s") || stableId.startsWith("m2-s")
        );

      const expected = (AUTHORED as readonly string[]).includes(m.stableId)
        ? m.steps.length
        : 0;

      expect(`${m.stableId} ${mine.length}`).toBe(`${m.stableId} ${expected}`);
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

      // The substance floor, moved here from `verify-wpj-m1.sh` by WP-NF-NT1.
      // In shell it swept every `textEquivalent` in the document and could not
      // tell a journey's from a near-transfer topology's; here `content.type`
      // says which is which, so the floor applies to the thing it was
      // calibrated for. A one-word equivalent satisfies the contract and fails
      // the learner, and naming every device is not on its own enough — a list
      // of five labels is not a description of a walkthrough.
      expect(equivalent.length).toBeGreaterThanOrEqual(400);
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

    it(`${stableId} gives every prediction at least two options, and any answer key is answerable`, () => {
      /*
        Inverted on an Architect ruling, and the change is bounded.

        This used to assert that no prediction could carry a correct option at
        all, on the reasoning that a guess made before the evidence must not be
        graded. The ruling standardises predictions toward the Mission 8
        behaviour: where a prediction has an objectively correct answer, the
        learner commits first and is then told plainly whether they were right.

        What is still forbidden is a prediction that cannot be answered — an
        answer key naming an option nobody can pick — and any outcome field,
        which would let the browser reconstruct a consequence.
      */
      for (const stage of journeyOf(stableId).stages) {
        if (stage.prediction === undefined) continue;

        expect(stage.prediction.options.length).toBeGreaterThanOrEqual(2);
        expect(stage.prediction).not.toHaveProperty("expectedOutcome");

        const correct = stage.prediction.correctOption;
        if (correct === undefined) continue;

        expect(
          `${stage.stageId} answer is on offer: ${stage.prediction.options.includes(correct)}`
        ).toBe(`${stage.stageId} answer is on offer: true`);

        // A verdict with no reason leaves a wrong learner no better off.
        expect((stage.prediction.explanation ?? "").length).toBeGreaterThan(0);
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
    /*
      The learner must not be told the activity is finished at the halfway
      point. Switch-1 is a stage the journey passes through.

      The forward-pointing sentence that used to live here is gone on a Founder
      video-UAT ruling: previewing Mission 2 between Switch-1 and the Printer
      interrupted the causal event the learner was following. The preview now
      sits at mission consolidation, and this checks the STRUCTURE plus the fact
      that the stage points onward toward the destination.
    */
    const journeyValue = journey();
    const atSwitch = journeyValue.stages.findIndex(
      (stage) => stage.atNodeId === "sw-1"
    );

    expect(atSwitch).toBeGreaterThan(0);
    expect(atSwitch).toBeLessThan(journeyValue.stages.length - 1);

    const stage = journeyValue.stages[atSwitch];

    // It carries the journey onward rather than concluding.
    expect(stage?.narration ?? "").toMatch(/toward the Printer/i);

    // No mid-journey preview, and no navigation instruction: the pane owns
    // the control, and the unanswered question belongs after the journey.
    const text = `${stage?.narration ?? ""} ${stage?.decision ?? ""}`;
    expect(`the switch stage previews Mission 2: ${text.includes("Mission 2")}`)
      .toBe("the switch stage previews Mission 2: false");

    for (const instruction of ["press", "click", "continue to see", "button"]) {
      expect(`switch stage instructs "${instruction}": ${text.toLowerCase().includes(instruction)}`)
        .toBe(`switch stage instructs "${instruction}": false`);
    }
  });

  it("confirms a successful delivery in words", () => {
    // Success is stated, not only coloured. The confirmation names the
    // printer, names what reached it, and says the job was accepted.
    const confirmation = journey().confirmation;

    expect(confirmation.narration).toMatch(/print request/);
    expect(confirmation.narration).toMatch(/printer/i);

    /*
      Arrival is stated, not only coloured. This used to require the word
      "accepted" in the confirmation; under the Architect ruling the acceptance
      is stated by the Printer's own stage — "The Printer accepts the print
      job" — and the confirmation states the outcome of the journey. Both facts
      are still required, each of the surface that owns it.
    */
    expect(confirmation.narration).toMatch(/reached/i);

    const printerStage = journey().stages.find((stage) => stage.atNodeId === "printer");
    expect(printerStage?.narration ?? "").toMatch(/accept/i);

    // The summary is the RECAP, and the approved Mission 1 specification asks
    // for it to be the three-beat journey rather than a restatement of the
    // narration: PC-A sent it, Switch-1 was in the middle, the Printer
    // received it. So this pins the recap's content, not its old phrasing.
    expect(confirmation.summary).toMatch(/PC-A/);
    expect(confirmation.summary).toMatch(/Switch-1/);
    expect(confirmation.summary).toMatch(/Printer/i);
    expect(confirmation.summary).toMatch(/received/i);
  });

  it("leaves the learner with ONE unresolved question, after the journey", () => {
    /*
      Founder video-UAT ruling: Mission 1 closes on one open question — how a
      switch decides which port to use — and it is asked AFTER the learner has
      named the concepts, not inside the packet journey.

      So the journey's confirmation must NOT carry it, and the mission's final
      teaching step must.
    */
    const summary = journey().confirmation.summary;

    expect(`the journey previews Mission 2: ${summary.includes("Mission 2")}`).toBe(
      "the journey previews Mission 2: false"
    );

    const closing = mission(M1).steps[mission(M1).steps.length - 1]?.content;
    if (closing?.type !== "concept") throw new Error("Mission 1 does not close on a concept");

    const text = closing.paragraphs.join("\n");

    expect(text).toMatch(/how a switch decides which port to use/i);
    expect(text).toMatch(/Mission 2/);
    expect(`the closing previews routing too: ${/Missions? [56]/.test(text)}`).toBe(
      "the closing previews routing too: false"
    );
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
    /*
      The learner SEES the print request continue from Switch-1 to the Printer.
      Nothing tells them how Switch-1 chose the port — that is Mission 2, and
      behaviour before vocabulary is the method.

      Where the deferral is STATED moved on a Founder video-UAT ruling: out of
      the journey, into consolidation. The mission still defers it; it no longer
      interrupts the journey to say so.
    */
    const text = learnerFacingTextFor(M1);

    expect(text).toContain("Mission 2");
    expect(text).toMatch(/how a switch decides which port to use/i);

    // And it still teaches none of the mechanism.
    for (const mechanism of ["MAC address table", "flooding", "learns which port"]) {
      expect(`Mission 1 teaches ${mechanism}: ${text.includes(mechanism)}`).toBe(
        `Mission 1 teaches ${mechanism}: false`
      );
    }
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

  it("asks two predictions, each on the stage that answers it", () => {
    /*
      A prediction is read from the NEXT unrevealed stage, so a prediction
      authored on stage X is asked before X and answered by X. Every one of
      them must therefore sit on the stage that resolves it, or the learner is
      asked about something they have already been shown.

      ## Why this used to expect three

      `d3-copies-arrive` carried a third: "what does Switch-1 know at this
      point?" It sat on the stage that answers it, so it satisfied the rule
      above — and Founder UAT round 2 found it was still the wrong instrument.
      A prediction asks what the learner thinks will happen BEFORE they can
      know, and at d3 the learner had not been shown a switch record anything
      at all, so the question was a guess dressed as reasoning.

      The same question is now a knowledge check on d2, asked AFTER the arrival
      that supplies the answer. That is asserted below. This test is not
      weakened by the change: it still requires every remaining prediction to
      sit on the stage that resolves it, and the set is still exact.
    */
    const journeyValue = journey();
    const predicting = journeyValue.stages.filter(
      (stage) => stage.prediction !== undefined
    );

    expect(predicting.map((stage) => stage.stageId)).toEqual([
      // What does a switch do with a destination it has no record of?
      "d2-switch-sends-copies",
      // And what does it do once it has one?
      "d7-switch-sends-once"
    ]);
  });

  it("asks what the switch does before showing what it recorded", () => {
    /*
      The whole value of the flooding prediction is that the learner has to
      reason rather than read. It is answered by `d2`, so nothing at or before
      `d2` may already state where PC-B is — which is the fact that would make
      "sends it out of port 2 only" the obvious answer.

      ## Why this no longer requires the earlier stages to show nothing

      It used to assert `deviceFacts` was EMPTY on every stage before `d3`.
      That was the right rule while the learned-state question was a prediction
      on `d3`: any earlier record would have answered it.

      Founder UAT round 2 asked for the opposite of nothing. A learner watching
      a switch "learn" needs to see the record BEFORE and AFTER, or there is no
      change to notice — so `d1` now states, in the switch's own panel, that it
      has no location recorded for PC-B. An emptiness rule would fail on the
      repair it asked for, so the rule is restated as what it always meant:
      no stage up to and including the one the prediction resolves may place
      PC-B on a port.
    */
    const journeyValue = journey();
    const resolvedAt = journeyValue.stages.findIndex(
      (stage) => stage.stageId === "d2-switch-sends-copies"
    );

    expect(resolvedAt).toBeGreaterThan(0);

    for (const stage of journeyValue.stages.slice(0, resolvedAt + 1)) {
      for (const shown of stage.deviceFacts ?? []) {
        for (const fact of shown.facts) {
          // "PC-B | No location recorded yet" is the setup and is allowed.
          // "PC-B | Port 2" would be the answer, on screen before the question.
          expect(
            `${stage.stageId} ${fact.label} ${fact.value}`
          ).not.toMatch(/PC-B\s+Port\s*\d/i);
        }
      }

      expect(`${stage.narration} ${stage.decision ?? ""}`).not.toMatch(
        /PC-B is on port 2/i
      );
    }

    // And the record does arrive, later, or there is no change to notice.
    const afterReply = journeyValue.stages.find(
      (stage) => stage.stageId === "d4-pc-b-replies"
    );

    expect(
      (afterReply?.deviceFacts ?? []).some((shown) =>
        shown.facts.some(
          (fact) => fact.label === "PC-B" && /port\s*2/i.test(fact.value)
        )
      )
    ).toBe(true);
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
 * Mission 2 — the second Founder UAT round
 * ------------------------------------------------------------------ */

describe("Mission 2 is repaired as the Founder UAT round authorised", () => {
  /**
   * The second Founder UAT round found Mission 2 the hardest mission in Module
   * 1 to follow. Six things about it changed, and each of them changes what the
   * learner is asked to do rather than only how it looks. Each is pinned here,
   * read through the real parser, so that a later repair cannot quietly undo
   * one of them while every other rule in this file still reports success.
   *
   * `verify-wpj-m2.sh` asserts the file-level half. This is the parsed half,
   * and it is the stronger of the two: a `grep` for `"alsoAtNodeIds"` cannot
   * tell which stage carries it, and for most of these that is the whole
   * question.
   */
  const journey = () => journeyOf(M2);

  const stage = (stageId: string) => {
    const found = journey().stages.find((s) => s.stageId === stageId);
    if (found === undefined) throw new Error(`Mission 2 has no stage ${stageId}`);
    return found;
  };

  it("requires the walkthrough before the steps that explain it", () => {
    /*
      The defect: every step after the activity explains what the activity
      shows, and all of them were on screen from the moment the mission opened.
      A learner could read the answer and never watch a delivery.

      Authored, not inferred. A renderer deciding for itself which steps are
      worth requiring would be writing pedagogy, and it would be wrong the first
      time a mission wanted an optional activity.
    */
    expect(interactionOf(M2).requiredForProgression).toBe(true);
  });

  it("requires exactly one step, so the learner is never blocked twice", () => {
    const required = mission(M2).steps.filter(
      (step) =>
        step.content.type === "interaction" &&
        step.content.requiredForProgression === true
    );

    expect(required.map((step) => step.stableId)).toEqual(["m2-s2-local-delivery"]);
  });

  it("names one delivery, and names the reply separately while it travels", () => {
    /*
      Founder UAT: the marker went on being described as the outbound delivery
      while what was actually moving was PC-B's answer.

      Which direction traffic is going is a networking fact, so it is authored
      per stage. A presentation that worked it out from which way the marker
      points would be inferring one.
    */
    expect(journey().traffic.label).toBe("one local-network delivery");
    expect(journey().traffic.startActionLabel).toBe("Send the delivery to PC-B");

    for (const stageId of ["d4-pc-b-replies", "d5-reply-reaches-pc-a"]) {
      expect(stage(stageId).traffic).toEqual({
        label: "PC-B's reply",
        sourceNodeId: "pc-b",
        destinationNodeId: "pc-a"
      });
    }
  });

  it("leaves every other stage carrying the journey's own traffic", () => {
    // The reply is the exception, and it has to stay one. A stage that
    // redefined what is moving without reason would leave the learner unable
    // to trust the label at all.
    const overriding = journey()
      .stages.filter((s) => s.traffic !== undefined)
      .map((s) => s.stageId);

    expect(overriding).toEqual(["d4-pc-b-replies", "d5-reply-reaches-pc-a"]);
  });

  it("asks the flooding prediction without an answer key", () => {
    /*
      DEC-063, and the clearest case of it in the course. At d2 the learner has
      never been shown what a switch does with a destination it has no record
      of. The observation IS the answer, and marking the guess would tell them
      they were wrong for doing exactly what the step asked.
    */
    const prediction = stage("d2-switch-sends-copies").prediction;

    expect(prediction).toBeDefined();
    expect(prediction?.correctOption).toBeUndefined();
    expect(prediction?.explanation).toBeUndefined();
  });

  it("checks the learning question after the arrival that answers it", () => {
    /*
      The question that used to be a prediction on d3. As a knowledge check on
      d2 it is offered once the stage is revealed, so it asks about the arrival
      the learner has just watched rather than about one they have not.

      A knowledge check MAY carry a right answer — that is the difference
      between the two instruments — and this one must, or the learner finds out
      nothing about whether they understood.
    */
    const checks = stage("d2-switch-sends-copies").knowledgeChecks ?? [];

    expect(checks.map((check) => check.checkId)).toEqual([
      "m2-d2-source-learning"
    ]);

    const check = checks[0];
    expect(check?.correctOption).toBe(
      "Because the delivery arrived on port 1 with PC-A as its source"
    );
    expect(check?.options).toContain(check?.correctOption);
    expect((check?.explanation ?? "").length).toBeGreaterThan(40);
  });

  it("authors that check on the flooding stage and nowhere else", () => {
    // One check, at one stopping point. A second elsewhere would ask the
    // learner to answer twice in a journey that is meant to be watched.
    const carrying = journey()
      .stages.filter((s) => (s.knowledgeChecks ?? []).length > 0)
      .map((s) => s.stageId);

    expect(carrying).toEqual(["d2-switch-sends-copies"]);
  });

  it("asks nothing at the stage where the copies land", () => {
    // d3's prediction is gone. What replaced it is the d2 knowledge check
    // above; if this ever fails alongside that one, the question came back
    // rather than moved.
    expect(stage("d3-copies-arrive").prediction).toBeUndefined();
    expect(stage("d3-copies-arrive").knowledgeChecks ?? []).toEqual([]);
  });

  it("shows the Printer's copy on the connection AND on the device", () => {
    /*
      One moment, two places. `alsoOnLinkIds` lights the wire; `alsoAtNodeIds`
      marks the device it ends at. With only the first, a learner watches a
      connection light up toward a Printer that shows no sign of having
      received anything, which reads as a drawing error rather than as the
      point of the stage.

      Both are authored. Working out which devices a copy "would" reach is the
      switching calculation the whole contract exists to keep out of code.
    */
    const arrival = stage("d3-copies-arrive");

    expect(arrival.atNodeId).toBe("pc-b");
    expect(arrival.viaLinkId).toBe("link-pc-b");
    expect(arrival.alsoOnLinkIds).toEqual(["link-printer"]);
    expect(arrival.alsoAtNodeIds).toEqual(["printer"]);
  });

  it("marks a further device only where a further copy actually arrived", () => {
    // The second pass is the comparison: one copy, one connection, nothing
    // anywhere else. A stage after the switch has learned may name neither.
    const secondPass = ["d6-pc-a-sends-again", "d7-switch-sends-once", "d8-pc-b-receives"];

    for (const stageId of secondPass) {
      expect(`${stageId} also-at: ${JSON.stringify(stage(stageId).alsoAtNodeIds)}`).toBe(
        `${stageId} also-at: undefined`
      );
      expect(`${stageId} also-on: ${JSON.stringify(stage(stageId).alsoOnLinkIds)}`).toBe(
        `${stageId} also-on: undefined`
      );
    }
  });

  it("grades the second prediction, and says why", () => {
    /*
      The inversion of the d2 rule, and the reason both are authored rather
      than derived from the step type. By d7 the learner HAS watched Switch-1
      record where PC-B is, so they can reason the answer out — and leaving them
      to infer from the animation whether they were right is what Founder UAT
      reported. A verdict with no reason would be the same defect one step on.
    */
    const prediction = stage("d7-switch-sends-once").prediction;

    expect(prediction?.correctOption).toBe("Send it through port 2 only");
    expect(prediction?.options).toContain("Send it through port 2 only");
    expect((prediction?.explanation ?? "").length).toBeGreaterThan(40);
  });

  it("closes with a near-transfer check and then a handoff", () => {
    /*
      The shape Mission 1 ends with. The handoff answers the activity's own
      question, so it must come after it — and `visibleInstructionSteps` is
      what actually holds it back, which is proven in
      `near-transfer-presentation.test.ts`. What is asserted here is the
      authoring the presentation depends on: the check exists, it is second to
      last, and the handoff is last.
    */
    const steps = mission(M2).steps;
    const tail = steps.slice(-2);

    expect(tail.map((step) => step.stableId)).toEqual([
      "m2-s8-try-a-different-switch",
      "m2-s9-what-comes-next"
    ]);
    expect(tail[0]?.content.type).toBe("near_transfer");
    expect(tail[1]?.content.type).toBe("concept");
  });

  it("asks four near-transfer questions, each with an authored answer", () => {
    const check = mission(M2).steps.find(
      (step) => step.stableId === "m2-s8-try-a-different-switch"
    )?.content;

    if (check?.type !== "near_transfer") {
      throw new Error("Mission 2's near-transfer check is not a near_transfer step");
    }

    expect(check.questions.map((question) => question.questionStableId)).toEqual([
      "m2-nt-q1-unknown-destination",
      "m2-nt-q2-source-learning",
      "m2-nt-q3-camera-copy",
      "m2-nt-q4-known-destination"
    ]);

    for (const question of check.questions) {
      // Deterministic and authored. Nothing infers a right answer, nothing
      // scores it, and answering it produces no evidence of any kind.
      expect(question.correctOptionIds.length).toBeGreaterThan(0);
      for (const correct of question.correctOptionIds) {
        expect(question.options.map((option) => option.optionId)).toContain(correct);
      }
      expect(question.explanation.length).toBeGreaterThan(20);
    }
  });

  it("sets the near-transfer check on a network the learner has not seen", () => {
    // Near transfer is the same idea on different surface features. Reusing
    // Mission 2's own devices would be recall, which the journey already did.
    const check = mission(M2).steps.find(
      (step) => step.stableId === "m2-s8-try-a-different-switch"
    )?.content;

    if (check?.type !== "near_transfer") {
      throw new Error("Mission 2's near-transfer check is not a near_transfer step");
    }

    const labels = (check.topology?.nodes ?? []).map((node) => node.label);
    const journeyLabels = journey().nodes.map((node) => node.label);

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(journeyLabels).not.toContain(label);
    }
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

    /*
      And the prose agrees with the state, so the two cannot drift.

      ## Why this no longer matches one sentence

      It required the literal "PC-B is on port 2". The Mission 2 Founder UAT
      repair rewords the same claim as "This arrival shows Switch-1 that
      traffic sourced by PC-B is arriving through port 2, so Switch-1 records
      PC-B on port 2." — which states the mechanism more explicitly than the
      sentence it replaced, and which the old pattern could not see.

      The rule is unchanged and is not weakened: the decision must attribute
      the record to the SOURCE of traffic that arrived, name the device, and
      name the port. A decision saying the switch learned it from the
      destination, or from configuration, still fails.
    */
    const replyDecision =
      stages.find((stage) => stage.stageId === "d4-pc-b-replies")?.decision ??
      "";

    expect(replyDecision).toMatch(/PC-B/);
    expect(replyDecision).toMatch(/port 2/i);
    expect(replyDecision).toMatch(/\bsource[d]?\b|\barriv/i);
    expect(replyDecision).not.toMatch(/configur|destination/i);
  });

  it("never shows the switch knowing a device before that device has sent anything", () => {
    /*
      The single easiest error in this mission: a switch cannot learn where a
      machine is until that machine transmits. PC-B's first transmission is its
      reply, so no stage before it may say where PC-B is.

      ## Why the record may now NAME PC-B before then

      It could not, and the rule was "PC-B does not appear in the record at
      all". Founder UAT round 2 asked for the opposite of nothing: a learner
      watching a switch learn needs to see the record BEFORE and AFTER, or
      there is no change to notice — so the first stage now states, in the
      switch's own panel, "PC-B — No location recorded yet".

      That is the ABSENCE of knowledge, stated. Banning the label would forbid
      the sentence doing the work, which is the same polarity mistake the
      failure-vocabulary rule below already records. So the rule is restated as
      what it always meant: no stage before the reply may give PC-B a LOCATION.
    */
    const stages = journeyOf(M2).stages;
    const replyAt = stages.findIndex(
      (stage) => stage.stageId === "d4-pc-b-replies"
    );

    expect(replyAt).toBeGreaterThan(0);

    for (const stage of stages.slice(0, replyAt)) {
      const record =
        stage.deviceFacts?.find((shown) => shown.nodeId === "sw-1")?.facts ??
        [];

      for (const fact of record) {
        if (fact.label !== "PC-B") continue;

        // A port number, an interface name, or anything else that answers
        // "where". Only a statement that there is no answer yet is allowed.
        expect(
          `${stage.stageId} PC-B: ${fact.value}`,
          `${stage.stageId} places PC-B before PC-B has sent anything`
        ).not.toMatch(/port\s*\d|eth\d|interface/i);

        expect(
          fact.value,
          `${stage.stageId} names PC-B without saying its location is unknown`
        ).toMatch(/\bno\b|\bnot\b|\byet\b|unknown/i);
      }
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
    //
    // "broken" left this list for exactly the reason already written above it.
    // The Mission 2 Founder UAT repair states the reassurance as "Nothing is
    // broken." — the same negation, in a different word — and a ban that fired
    // on it would be forbidding the sentence that does the work, which is the
    // mistake this comment was written to prevent rather than to permit twice.
    // The positive assertion below is what keeps the reassurance required.
    for (const failure of [
      "error",
      "fault",
      "failed",
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
    // simply saying nothing about the Printer at all. Matched as the CLAIM
    // rather than as one phrasing of it: the repair says "Nothing is broken."
    // where the previous wording said "nothing has gone wrong", and both are
    // the same sentence doing the same job.
    expect(
      prose,
      "the journey never tells the learner the unintended copy is normal"
    ).toMatch(/nothing has gone wrong|nothing is broken|nothing has broken/i);
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

    /*
      A DEVICE NAME IS NOT THE CONCEPT.

      "Switch-1" is the label the learner has been looking at since the journey;
      the word "switch" as a KIND of device is what a later step teaches. The
      Founder video-UAT copy names Switch-1 while explaining ports, which is
      correct — it is pointing at the thing on screen, not defining a category.

      So device names are removed before the term search. The invariant is
      unchanged: no step may teach WITH a concept the learner has not been
      given.
    */
    const withoutDeviceNames = (text: string): string =>
      text.replace(/\b(?:Switch|Router|PC|Printer)-?[A-Z0-9]*\b/g, "");

    const positionOfFirstUse = (word: string): number =>
      steps.findIndex((step) => {
        const content = step.content;
        if (content.type !== "concept") return false;
        return usesWord(
          withoutDeviceNames([content.title ?? "", ...content.paragraphs].join("\n")),
          word
        );
      });

    /*
      ORDERED BY THE STEP THAT TEACHES THE TERM, not by first mention.

      The Founder video-UAT copy says "In this topology, PC-A has one link"
      while teaching connections — pointing at the drawing the learner has been
      using, several steps before the step that defines what a topology is.
      Counting that as "introducing topology" measures mentions, not teaching.

      A step teaches a term when its TITLE names it. That is the authored
      signal, and it is what this orders: connections, then switches and
      routers, then reading the topology.
    */
    const teaches = (word: string): number =>
      steps.findIndex((step) => {
        const content = step.content;
        if (content.type !== "concept") return false;
        return usesWord(content.title ?? "", word);
      });

    // `usesWord` matches whole words, so the plural titles are searched as
    // authored: "Network connections", "Switches and routers".
    const connections = teaches("connections");
    const switches = teaches("switches");
    const topology = teaches("topology");

    for (const [label, position] of [
      ["connections", connections],
      ["switches and routers", switches],
      ["reading the topology", topology]
    ] as const) {
      expect(`${label} has a teaching step: ${position >= 0}`).toBe(
        `${label} has a teaching step: true`
      );
    }

    // The connection point, then the devices those connections lead into,
    // then the drawing that shows how they are arranged.
    expect(`connections before switches: ${connections < switches}`).toBe(
      "connections before switches: true"
    );
    expect(`switches before topology: ${switches < topology}`).toBe(
      "switches before topology: true"
    );

    // And every one of them comes after the journey (index 0 of `steps`,
    // which is the interaction, since `steps` drops the opening concept).
    expect(`the journey precedes the vocabulary: ${connections > 0}`).toBe(
      "the journey precedes the vocabulary: true"
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

    /*
      An objective the learner can scan — but NOT a preview of the vocabulary.

      This used to require "you will learn", which was a list of the terms the
      mission would name. The Architect ruling removes that preview: Mission 1
      is the course's reference example of experience before explanation, and
      naming host, interface, switch and router before the journey undercuts
      the very ordering the mission exists to demonstrate.

      So the opening must state the job and defer the naming, and this checks
      both halves.
    */
    expect(prose).toMatch(/your job/i);
    expect(prose.toLowerCase()).toContain("afterward");

    for (const premature of ["host", "interface", "topology"]) {
      expect(`the opening names "${premature}": ${new RegExp(`\\b${premature}s?\\b`, "i").test(prose)}`)
        .toBe(`the opening names "${premature}": false`);
    }
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

      /*
        SHOW ME sends the answer-revealing content the journey authors. Mission
        1's stages now author no `decision` — the Founder video-UAT ruling moved
        its one explanatory beat out of the journey — so what is checked is that
        nothing is WITHHELD at this level, rather than that a particular field
        happens to exist.
      */
      const authored = journeyOf(stableId);
      const authoredDecisions = authored.stages.filter(
        (stage) => stage.decision !== undefined
      ).length;
      const sentDecisions = parameters.stages.filter(
        (stage) => stage.decision !== undefined
      ).length;

      expect(`${stableId} decisions sent: ${sentDecisions}`).toBe(
        `${stableId} decisions sent: ${authoredDecisions}`
      );

      /*
        The two graded artefacts, counted the same way and for the same
        reason: a fixture that authors none makes an absence assertion pass
        without proving anything. Mission 2 authors both — a graded prediction
        with a `correctOption`, and a knowledge check — so counting sent
        against authored is a real comparison here and stays one if Mission 1
        ever gains either.
      */
      const authoredCorrect = authored.stages.filter(
        (stage) => stage.prediction?.correctOption !== undefined
      ).length;
      const sentCorrect = parameters.stages.filter(
        (stage) => stage.prediction?.correctOption !== undefined
      ).length;
      expect(`${stableId} correct options sent: ${sentCorrect}`).toBe(
        `${stableId} correct options sent: ${authoredCorrect}`
      );

      const authoredChecks = authored.stages.filter(
        (stage) => stage.knowledgeChecks !== undefined
      ).length;
      const sentChecks = parameters.stages.filter(
        (stage) => stage.knowledgeChecks !== undefined
      ).length;
      expect(`${stableId} knowledge checks sent: ${sentChecks}`).toBe(
        `${stableId} knowledge checks sent: ${authoredChecks}`
      );
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
        expect(stage.knowledgeChecks).toBeUndefined();
        expect(stage.prediction?.correctOption).toBeUndefined();
        expect(stage.prediction?.explanation).toBeUndefined();
      }

      /*
        Proved to be a real deletion, not an absence the fixture never had.

        Asserting `not.toContain("correctOption")` against content that never
        authored one is a test that cannot fail, and two of these already read
        that way elsewhere. This mission authors both artefacts, so the count
        below is what makes the assertions above mean something.
      */
      const authored = journeyOf(stableId);
      const graded =
        authored.stages.filter(
          (stage) => stage.prediction?.correctOption !== undefined
        ).length +
        authored.stages.filter(
          (stage) => stage.knowledgeChecks !== undefined
        ).length;
      expect(`${stableId} authors graded content: ${graded > 0}`).toBe(
        `${stableId} authors graded content: true`
      );

      // And nothing reintroduces either by another route.
      const serialised = JSON.stringify(parameters);
      expect(serialised).not.toContain("correctOption");
      expect(serialised).not.toContain("knowledgeChecks");

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
      "answer",
      "expectedOutcome",
      "resolvesFault"
    ]) {
      expect({ forbidden, present: keys.has(forbidden) }).toEqual({
        forbidden,
        present: false
      });
    }

    /*
      `correctOption` came OFF that list on an Architect ruling.

      It is AUTHORED CURRICULUM, not learner state: the mission says which
      answer is right so the pane can tell the learner. Nothing about it is
      recorded, scored or carried anywhere. The invariant this list protects —
      that a mission step creates no learner state — is unchanged, and the
      fields that would carry such state are all still forbidden above.
    */
    expect(`the mission authors an answer key: ${keys.has("correctOption")}`).toBe(
      "the mission authors an answer key: true"
    );

    for (const state of ["evidence", "progress", "score", "attempts", "streak"]) {
      expect(`${state} recorded: ${keys.has(state)}`).toBe(`${state} recorded: false`);
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
    // Order and labels set by the Architect ruling; the correct answer is
    // Switch-1, derived from PC-A's single link ending on Switch-1 port 1.
    expect(prediction?.options).toEqual(["Switch-1", "Printer", "Router-1"]);
    expect(prediction?.correctOption).toBe("Switch-1");
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

    /*
      It must say what PC-A IS in ordinary words — read from the surface that
      OWNS that job.

      This used to require the word "computer" in the stage's own text. Under
      the Architect ruling the stage narrates what the print request did, and
      the device note is where PC-A is described. Requiring both would put the
      same description on two surfaces at once, which is the duplication the
      Founder-UAT work removed.
    */
    const about =
      journeyOf(M1).nodes.find((node) => node.nodeId === "pc-a")?.about ?? "";

    expect(about).toMatch(/computer/i);
    expect(about).toMatch(/one network connection/i);

    // And the stage does not repeat the description.
    expect(`the stage re-describes PC-A: ${/computer/i.test(prose)}`).toBe(
      "the stage re-describes PC-A: false"
    );
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

  it("marks every switch port to be drawn", () => {
    // Founder UAT, second round: "the learner should not have to infer which
    // switch port". An earlier ruling drew three of the four and left Port 4
    // off because Mission 1 defers Router-1 — but a learner looking at a wire
    // with no name on it does not know it is deferred, only that it is
    // unlabelled. Naming a port is orientation; it teaches no routing.
    const drawn = switchInterfaces()
      .filter((iface) => iface.prominent === true)
      .map((iface) => iface.label);

    expect(drawn).toEqual(["Port 1", "Port 2", "Port 3", "Port 4"]);
  });

  it("marks both of the router's connections to be drawn", () => {
    // Same finding: "which router interface" must not have to be inferred.
    const router = journey().nodes.find((node) => node.nodeId === "r-1");
    const drawn = (router?.interfaces ?? []).filter(
      (iface) => iface.prominent === true
    );

    expect(drawn).toHaveLength(router?.interfaces.length ?? 0);
    expect(drawn.length).toBeGreaterThan(0);
  });

  it("still marks no host interface, so the drawing does not become a patch panel", () => {
    // Restraint survives the correction, because the Founder asked for the
    // important labels and explicitly not for an overloaded canvas. A host has
    // exactly one interface and its card already carries the host's name, so a
    // label on that wire end would repeat what the card says.
    for (const node of journey().nodes) {
      if (node.nodeId === "sw-1" || node.nodeId === "r-1") continue;

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
    // Read from everything the stage puts in front of the learner. The ports
    // used to be named in the authored `decision`; under the Architect ruling
    // they are named in the narration, which is the beat the learner reads
    // first. Either surface satisfies the invariant — the ports must be
    // readable without opening the inspector.
    const named = journey()
      .stages.map((stage) => `${stage.narration} ${stage.decision ?? ""}`)
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


/* ------------------------------------------------------------------ *
 * MISSION 1 — THE ARCHITECT-AUTHORED REPAIR
 *
 * Mission 1 is the course's reference example of experience before
 * explanation: the learner follows the print request, and only then are the
 * devices and connections named. These protect that ordering, the graded
 * prediction, and the boundaries Mission 1 must not cross.
 *
 * Structure and disclosure only. Whether the prose teaches is Tier 3 review
 * and Founder UAT (CURR-009 s14a).
 * ------------------------------------------------------------------ */

describe("Mission 1 follows the network before naming it", () => {
  const M1_ID = "nf-m1-what-a-network-is";

  function stepIndex(stableId: string): number {
    return mission(M1_ID).steps.findIndex((step) => step.stableId === stableId);
  }

  it("puts the journey before every vocabulary step", () => {
    const journeyAt = stepIndex("m1-s5-orientation");

    expect(journeyAt).toBeGreaterThanOrEqual(0);

    for (const vocabulary of [
      "m1-s2-the-machines-people-use",
      "m1-s3-where-a-machine-joins",
      "m1-s4-the-middle-and-the-edge",
      "m1-s6-reading-the-picture"
    ]) {
      const at = stepIndex(vocabulary);
      expect(`${vocabulary} comes after the journey: ${at > journeyAt}`).toBe(
        `${vocabulary} comes after the journey: true`
      );
    }
  });

  it("opens on the situation and the job, and names no vocabulary", () => {
    const first = mission(M1_ID).steps[0]?.content;
    if (first?.type !== "concept") throw new Error("Mission 1 does not open on a concept");

    const prose = [first.title ?? "", ...first.paragraphs].join("\n");

    expect(prose).toMatch(/print request/);
    expect(prose).toMatch(/your job/i);

    // The naming is deferred, explicitly.
    expect(prose.toLowerCase()).toContain("afterward");

    for (const deferred of ["host", "interface", "port", "topology"]) {
      expect(`the opening names "${deferred}": ${new RegExp(`\\b${deferred}s?\\b`, "i").test(prose)}`)
        .toBe(`the opening names "${deferred}": false`);
    }
  });

  it("does not tell the learner they are configuring anything", () => {
    const first = mission(M1_ID).steps[0]?.content;
    if (first?.type !== "concept") throw new Error("no opening concept");

    expect(first.paragraphs.join("\n")).toMatch(/not configure/i);
  });

  it("carries no whimsy where a technical statement belongs", () => {
    // Founder finding: the course's only reach for whimsy, and a voice outlier.
    const text = learnerFacingTextFor(M1_ID);

    expect(`says it is not magic: ${/magic/i.test(text)}`).toBe(
      "says it is not magic: false"
    );
  });

  it("grades the prediction, with the answer the topology settles", () => {
    const prediction = journeyOf(M1_ID).stages[0]?.prediction;

    expect(prediction?.correctOption).toBe("Switch-1");
    expect(prediction?.options).toContain("Switch-1");
    expect((prediction?.explanation ?? "").length).toBeGreaterThan(0);

    // The answer is derivable from authored truth, not asserted: PC-A has one
    // link, and it ends on Switch-1.
    const links = journeyOf(M1_ID).links.filter((link) =>
      link.endpoints.some((endpoint) => endpoint.startsWith("pc-a"))
    );

    expect(links).toHaveLength(1);
    expect(links[0]?.endpoints.some((endpoint) => endpoint.startsWith("sw-1"))).toBe(true);
  });

  it("does not reveal the answer inside the question", () => {
    const prediction = journeyOf(M1_ID).stages[0]?.prediction;
    const prompt = prediction?.prompt ?? "";

    // The prompt names the source and the eventual destination, and does not
    // name the device that answers it.
    expect(prompt).toMatch(/PC-A/);
    expect(prompt).toMatch(/Printer/);
    expect(`the prompt names the answer: ${prompt.includes("Switch-1")}`).toBe(
      "the prompt names the answer: false"
    );
  });

  it("does not repeat the prediction's reason in the stage it resolves at", () => {
    /*
      Region ownership: the feedback beat carries WHY the answer was right; the
      stage narration carries what the network did. This asserts they are
      different authored fields with different text — it cannot detect a
      paraphrase, and no string test could. Semantic overlap is Tier 3 review.
    */
    const stage = journeyOf(M1_ID).stages[0];
    const reason = stage?.prediction?.explanation ?? "";

    expect(reason.length).toBeGreaterThan(0);
    expect(stage?.narration).not.toBe(reason);
    expect(stage?.narration.includes(reason)).toBe(false);
  });

  it("keeps the switching mechanism out of Mission 1", () => {
    const text = learnerFacingTextFor(M1_ID);

    for (const later of [
      "MAC address",
      "MAC address table",
      "ARP",
      "routing",
      "default gateway",
      "flooding",
      "broadcast",
      "IPv4",
      "prefix"
    ]) {
      expect(`Mission 1 teaches ${later}: ${text.includes(later)}`).toBe(
        `Mission 1 teaches ${later}: false`
      );
    }
  });

  it("shows Router-1 without the print request ever reaching it", () => {
    const journeyValue = journeyOf(M1_ID);

    // Present in the topology…
    expect(journeyValue.nodes.some((node) => node.nodeId === "r-1")).toBe(true);

    // …and on no stage of the journey.
    expect(journeyValue.stages.some((stage) => stage.atNodeId === "r-1")).toBe(false);

    // And the vocabulary step says so in words.
    const edge = mission(M1_ID).steps.find(
      (step) => step.stableId === "m1-s4-the-middle-and-the-edge"
    )?.content;

    if (edge?.type !== "concept") throw new Error("no edge-device concept step");
    expect(edge.paragraphs.join("\n")).toMatch(/did not use Router-1/i);
  });

  it("uses the device names once the mission has named them", () => {
    // Plain English may introduce a role; it may not replace the name after it
    // has been earned. The final vocabulary step and the closing step are read.
    const closing = mission(M1_ID).steps.find(
      (step) => step.stableId === "m1-s6-reading-the-picture"
    )?.content;

    if (closing?.type !== "concept") throw new Error("no closing concept step");

    const text = closing.paragraphs.join("\n");
    expect(`the closing step says "device in the middle": ${text.includes("device in the middle")}`)
      .toBe('the closing step says "device in the middle": false');
  });

  it("names the ports the walkthrough depends on, in the stages", () => {
    const stages = journeyOf(M1_ID)
      .stages.map((stage) => `${stage.narration} ${stage.decision ?? ""}`)
      .join(" ");

    expect(stages).toMatch(/port 1/);
    expect(stages).toMatch(/port 3/);
  });

  it("closes on one unresolved question, and issues no button instruction", () => {
    /*
      The question moved out of the journey and into consolidation on a Founder
      video-UAT ruling: previewing Mission 2 between Switch-1 and the Printer
      interrupted the event the learner was following.
    */
    const journeyValue = journeyOf(M1_ID);
    const closing = mission(M1_ID).steps[mission(M1_ID).steps.length - 1]?.content;
    if (closing?.type !== "concept") throw new Error("Mission 1 does not close on a concept");

    const text = closing.paragraphs.join("\n");

    expect(text).toMatch(/how a switch decides which port to use/i);
    expect(text).toMatch(/Mission 2/);
    expect(`previews routing too: ${/Missions? [56]/.test(text)}`).toBe(
      "previews routing too: false"
    );
    expect(
      `the journey previews it: ${journeyValue.confirmation.summary.includes("Mission 2")}`
    ).toBe("the journey previews it: false");

    const stageText = journeyValue.stages
      .map((stage) => `${stage.narration} ${stage.decision ?? ""}`)
      .join(" ")
      .toLowerCase();

    for (const instruction of ["press ", "click ", "continue to see"]) {
      expect(`a stage instructs "${instruction.trim()}": ${stageText.includes(instruction)}`)
        .toBe(`a stage instructs "${instruction.trim()}": false`);
    }
  });
});

/** Every learner-facing string of one mission, for the boundary checks above. */
function learnerFacingTextFor(missionStableId: string): string {
  const parts: string[] = [];

  for (const step of mission(missionStableId).steps) {
    const content = step.content;
    if (content.type === "concept") {
      parts.push(content.title ?? "", ...content.paragraphs);
    } else if (content.type === "near_transfer") {
      // WP-NF-NT1. The boundary checks that use this helper — what Mission 1
      // may claim, which terms it may use, what it must not promise — apply to
      // a near-transfer check exactly as they apply to a paragraph.
      parts.push(content.title ?? "", content.framing ?? "");
      if (content.topology !== undefined) {
        parts.push(content.topology.textEquivalent);
      }
      for (const question of content.questions) {
        parts.push(question.prompt, question.explanation);
        for (const option of question.options) parts.push(option.text);
      }
    } else if (content.type === "command") {
      parts.push(content.caption ?? "", content.command ?? "", content.output ?? "");
    } else if (content.type === "interaction") {
      parts.push(content.caption ?? "", content.textEquivalent ?? "");
      const parameters = content.parameters;
      if (parameters.interactionType === "packet_journey") {
        for (const node of parameters.nodes) parts.push(node.about ?? "");
        for (const stage of parameters.stages) {
          parts.push(stage.narration, stage.decision ?? "", stage.action ?? "");
          if (stage.prediction !== undefined) {
            parts.push(
              stage.prediction.prompt,
              ...stage.prediction.options,
              stage.prediction.explanation ?? ""
            );
          }
        }
        parts.push(parameters.confirmation.narration, parameters.confirmation.summary);
      }
    }
  }

  return parts.join("\n");
}


/* ------------------------------------------------------------------ *
 * FOUNDER VIDEO UAT — MISSION 1 CURRICULUM INVARIANTS
 * ------------------------------------------------------------------ */

describe("Mission 1 after the video review", () => {
  const M1_ID = "nf-m1-what-a-network-is";

  it("names the print request in the visible title", () => {
    expect(mission(M1_ID).title).toContain("print request");
    expect(mission(M1_ID).title).not.toContain("something");
    // The identity is not renamed because the visible title changed.
    expect(mission(M1_ID).stableId).toBe(M1_ID);
  });

  it("authors exactly three network stages", () => {
    const stages = journeyOf(M1_ID).stages;

    expect(stages.map((stage) => stage.atNodeId)).toEqual([
      "pc-a",
      "sw-1",
      "printer"
    ]);
  });

  it("opens the workspace on the prediction", () => {
    // No stage before it, so nothing stands between entry and the decision.
    expect(journeyOf(M1_ID).stages[0]?.prediction).toBeDefined();
  });

  it("gives the Printer its own stage before the confirmation", () => {
    const stages = journeyOf(M1_ID).stages;
    const last = stages[stages.length - 1];

    expect(last?.atNodeId).toBe("printer");
    expect(last?.narration).toMatch(/accepts the print job/i);
    expect(journeyOf(M1_ID).confirmation.narration).not.toBe(last?.narration);
  });

  it("confirms a delivery rather than a repair", () => {
    const confirmation = journeyOf(M1_ID).confirmation;

    expect(confirmation.narration).toBe(
      "Delivered. The print request reached the Printer."
    );
    expect(`says Fixed: ${confirmation.narration.includes("Fixed")}`).toBe(
      "says Fixed: false"
    );
    expect(journeyOf(M1_ID).fault).toBeUndefined();
  });

  it("carries no mid-journey preview and no navigation instruction", () => {
    const text = journeyOf(M1_ID)
      .stages.map((stage) => `${stage.narration} ${stage.decision ?? ""}`)
      .join(" ");

    expect(`previews Mission 2 mid-journey: ${text.includes("Mission 2")}`).toBe(
      "previews Mission 2 mid-journey: false"
    );
    for (const instruction of ["press", "click", "continue to see"]) {
      expect(`instructs "${instruction}": ${text.toLowerCase().includes(instruction)}`)
        .toBe(`instructs "${instruction}": false`);
    }
  });

  it("names switch and router once they are earned", () => {
    const closing = mission(M1_ID).steps.find(
      (step) => step.stableId === "m1-s4-the-middle-and-the-edge"
    )?.content;

    if (closing?.type !== "concept") throw new Error("no switch/router step");

    expect(closing.title).toBe("Switches and routers");

    const text = [closing.title, ...closing.paragraphs].join("\n");
    for (const substitute of ["device in the middle", "device at the edge"]) {
      expect(`uses "${substitute}": ${text.includes(substitute)}`).toBe(
        `uses "${substitute}": false`
      );
    }
  });

  it("does not equate port and interface, or a printer and a computer", () => {
    const text = learnerFacingTextFor(M1_ID);

    for (const claim of [
      "Port and interface name the same idea",
      "behaves exactly as a computer does",
      "aerial",
      "most common way to misread"
    ]) {
      expect(`Mission 1 still says "${claim}": ${text.includes(claim)}`).toBe(
        `Mission 1 still says "${claim}": false`
      );
    }
  });

  it("keeps Router-1 visible and unused by the print request", () => {
    const journeyValue = journeyOf(M1_ID);

    expect(journeyValue.nodes.some((node) => node.nodeId === "r-1")).toBe(true);
    expect(journeyValue.stages.some((stage) => stage.atNodeId === "r-1")).toBe(false);
    expect(learnerFacingTextFor(M1_ID)).toMatch(/did not use Router-1/i);
  });
});

/* ------------------------------------------------------------------ *
 * WP-NF-NT1 — Mission 1's embedded near-transfer check
 *
 * The generic capability is protected in `packages/shared-types` and
 * `apps/web`. What is protected HERE is the authored Mission 1 content: that
 * it exists, that it sits where the instruction needs it, and that its four
 * answers are the ones the Architect authored.
 *
 * Read through the real parser, like everything else in this file. A suite
 * that re-read the JSON would be a second curriculum truth.
 * ------------------------------------------------------------------ */

describe("Mission 1 applies what it taught to a different network", () => {
  const M1_ID = "nf-m1-what-a-network-is";

  /** Mission 1's steps in the order a learner meets them. */
  function orderedSteps(): readonly MissionStep[] {
    return [...mission(M1_ID).steps].sort((a, b) => a.position - b.position);
  }

  function nearTransferStep(): MissionStep {
    const step = orderedSteps().find(
      (candidate) => candidate.content.type === "near_transfer"
    );
    if (step === undefined) {
      throw new Error("Mission 1 authors no near-transfer check");
    }
    return step;
  }

  function nearTransfer() {
    const content = nearTransferStep().content;
    if (content.type !== "near_transfer") throw new Error("not a near transfer");
    return content;
  }

  function questionById(questionStableId: string) {
    const question = nearTransfer().questions.find(
      (candidate) => candidate.questionStableId === questionStableId
    );
    if (question === undefined) {
      throw new Error(`Mission 1 authors no question ${questionStableId}`);
    }
    return question;
  }

  /** The authored answer, as the option TEXT a learner reads. */
  function answerText(questionStableId: string): readonly string[] {
    const question = questionById(questionStableId);
    return question.options
      .filter((option) => question.correctOptionIds.includes(option.optionId))
      .map((option) => option.text);
  }

  it("places the check after the topology step that earns it", () => {
    // Mission 1 test 1. Position, not order of storage: the two have differed
    // in this document before.
    const ids = orderedSteps().map((step) => step.stableId);

    expect(ids.indexOf("m1-s7-try-a-different-network")).toBeGreaterThan(
      ids.indexOf("m1-s6-reading-the-picture")
    );
  });

  it("places it before the mission's closing handoff", () => {
    // Mission 1 test 2. The handoff answers the question the activity asks;
    // ahead of it, it would answer it before the learner tried.
    const ids = orderedSteps().map((step) => step.stableId);

    expect(ids.indexOf("m1-s7-try-a-different-network")).toBeLessThan(
      ids.indexOf("m1-s8-what-comes-next")
    );
    expect(ids[ids.length - 1]).toBe("m1-s8-what-comes-next");
  });

  it("carries the authored title and framing", () => {
    // Mission 1 tests 3 and 4.
    const content = nearTransfer();

    expect(content.title).toBe("Try it on a different network");
    expect(content.framing).toBe(
      "This network uses different devices, but the same ideas still apply. Use the topology to answer each question."
    );
  });

  it("shows a different network, not the one the mission just walked", () => {
    // Mission 1 test 5, and the whole point of near transfer: applying the
    // idea to the SAME topology would be recall. Neither device from the
    // mission's own journey may appear here.
    const labels = nearTransfer()
      .topology?.nodes.map((node) => node.label)
      .sort();

    expect(labels).toEqual(["Laptop-A", "Router-2", "Server-A", "Switch-2"]);

    const text = JSON.stringify(nearTransfer());
    for (const fromTheJourney of ["PC-A", "PC-B", "Switch-1", "Router-1", "Printer"]) {
      expect(`the scenario reuses ${fromTheJourney}: ${text.includes(fromTheJourney)}`)
        .toBe(`the scenario reuses ${fromTheJourney}: false`);
    }
  });

  it("wires both hosts and the router to the switch", () => {
    // Mission 1 test 6, read as the RELATIONSHIPS rather than as link ids:
    // renaming a link must not be able to satisfy this.
    const topology = nearTransfer().topology;
    if (topology === undefined) throw new Error("no topology");

    const label = (nodeId: string) =>
      topology.nodes.find((node) => node.nodeId === nodeId)?.label ?? nodeId;

    const pairs = topology.links
      .map((link) => [label(link.endpoints[0]), label(link.endpoints[1])].sort().join(" — "))
      .sort();

    expect(pairs).toEqual([
      "Laptop-A — Switch-2",
      "Router-2 — Switch-2",
      "Server-A — Switch-2"
    ]);
  });

  it("draws the network Router-2 reaches, rather than only stating it", () => {
    // WP-NF-NT1B. Question 3 asks which device connects this local network to
    // another network, and until this existed the only thing that answered it
    // was a sentence: the onward connection had no far end, so the diagram
    // drew nothing. A sighted beginner had to read prose to find a topology
    // fact. The author now declares the far end, and it is drawn.
    const external = nearTransfer().topology?.externalNetworks ?? [];

    expect(external).toHaveLength(1);
    expect(external[0]?.label).toBe("Another network");
    expect(external[0]?.attachedToNodeId).toBe("router-2");
  });

  it("does not offer that network as an answer to any question", () => {
    // It is not a device, it is not in `nodes`, and no question may name it.
    // "Which device connects this local network to another network?" is
    // answered by Router-2 — offering the network itself would make the
    // question answer itself.
    const content = nearTransfer();
    const label = content.topology?.externalNetworks?.[0]?.label ?? "";

    expect(content.topology?.nodes.map((node) => node.label)).not.toContain(
      label
    );

    for (const question of content.questions) {
      for (const option of question.options) {
        expect(option.text).not.toBe(label);
      }
    }
  });

  it("says in words what the drawing shows, including the way out", () => {
    // The accessible equivalent states the same four relationships the picture
    // now draws. Neither is the only source of any of them.
    const text = nearTransfer().topology?.textEquivalent ?? "";

    for (const relationship of [
      "Laptop-A connects to Switch-2",
      "Server-A connects to Switch-2",
      "Router-2 connects to Switch-2",
      "Router-2 also connects to another network"
    ]) {
      expect(`states "${relationship}": ${text.includes(relationship)}`).toBe(
        `states "${relationship}": true`
      );
    }
  });

  it("teaches no address, identity or mechanism it has not earned", () => {
    // Mission 1 tests 7 and 14. The near-transfer prose is collected by
    // `learnerFacingText`, so the deferred-vocabulary and no-IP-address rules
    // above already cover it; this pins the specific exclusions the Architect
    // named for this activity, so removing the collection case is caught here
    // rather than being silently unprotected.
    const text = [
      nearTransfer().title ?? "",
      nearTransfer().framing ?? "",
      nearTransfer().topology?.textEquivalent ?? "",
      ...nearTransfer().questions.flatMap((question) => [
        question.prompt,
        question.explanation,
        ...question.options.map((option) => option.text)
      ])
    ].join("\n");

    expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);

    for (const term of ["MAC", "VLANs?", "gateway", "routing", "route", "subnets?", "table", "forwards?"]) {
      expect({ term, used: usesWord(text, term) }).toEqual({ term, used: false });
    }
  });

  it("asks which two devices are hosts, and accepts only both", () => {
    // Mission 1 test 8.
    const question = questionById("m1-nt-q1-hosts");

    expect(question.type).toBe("multiple_choice");
    expect(question.prompt).toBe("Which two devices are hosts in this topology?");
    expect([...answerText("m1-nt-q1-hosts")].sort()).toEqual([
      "Laptop-A",
      "Server-A"
    ]);

    // Both, and the switch and the router are genuinely on offer — a question
    // whose only wrong answers were absent would not be a question.
    expect(question.options.map((option) => option.text).sort()).toEqual([
      "Laptop-A",
      "Router-2",
      "Server-A",
      "Switch-2"
    ]);
  });

  it("asks which device carries local traffic, and answers Switch-2", () => {
    // Mission 1 test 9.
    const question = questionById("m1-nt-q2-carries");

    expect(question.type).toBe("single_choice");
    expect(answerText("m1-nt-q2-carries")).toEqual(["Switch-2"]);
  });

  it("asks which device reaches another network, and answers Router-2", () => {
    // Mission 1 test 10.
    const question = questionById("m1-nt-q3-connects-networks");

    expect(question.type).toBe("single_choice");
    expect(answerText("m1-nt-q3-connects-networks")).toEqual(["Router-2"]);
  });

  it("asks what traffic reaches first, and answers Switch-2", () => {
    // Mission 1 test 11. The one question that requires following a path
    // rather than naming a category, which is why Server-A is on offer.
    const question = questionById("m1-nt-q4-reaches-first");

    expect(question.type).toBe("single_choice");
    expect(answerText("m1-nt-q4-reaches-first")).toEqual(["Switch-2"]);
    expect(question.options.map((option) => option.text)).toContain("Server-A");
  });

  it("attaches each authored explanation to the question it explains", () => {
    // Mission 1 test 12. Explanations are the instruction here, and four
    // reasons attached to the wrong four questions would read as plausible
    // nonsense rather than as an obvious defect.
    const expected: Record<string, string> = {
      "m1-nt-q1-hosts":
        "Laptop-A and Server-A send or receive network traffic for themselves, so both are hosts.",
      "m1-nt-q2-carries":
        "Both hosts connect to Switch-2, so traffic between them passes through the switch.",
      "m1-nt-q3-connects-networks":
        "Router-2 has a connection to this network and another connection leading beyond it, so it connects different networks.",
      "m1-nt-q4-reaches-first":
        "Laptop-A's link connects to Switch-2, so the traffic reaches Switch-2 before it can reach Server-A."
    };

    for (const [questionStableId, explanation] of Object.entries(expected)) {
      expect(questionById(questionStableId).explanation).toBe(explanation);
    }
  });

  it("leaves exactly one unresolved forward question, and it is the handoff", () => {
    // Mission 1 test 13. "Do not add another summary" — a second closing
    // paragraph would make the mission end twice.
    const forward = orderedSteps().filter((step) => {
      if (step.content.type !== "concept") return false;
      return step.content.paragraphs.some((paragraph) =>
        paragraph.includes("The next question is")
      );
    });

    expect(forward.map((step) => step.stableId)).toEqual([
      "m1-s8-what-comes-next"
    ]);

    const handoff = forward[0]?.content;
    if (handoff?.type !== "concept") throw new Error("no handoff");

    expect(handoff.paragraphs).toEqual([
      "You can now identify the main devices and connections in a small network and follow traffic between two hosts. The next question is how a switch decides which port to use. Mission 2 answers that."
    ]);
  });

  it("produces no evidence, and asks nothing of the learner's record", () => {
    // The completion doctrine, at the content level. Nothing in an authored
    // near-transfer check can name a competency or a score, so attempting one
    // cannot change anything about the learner.
    const serialised = JSON.stringify(nearTransferStep());

    const names = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      if (value === null || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        names.add(key);
        walk(nested);
      }
    };
    walk(JSON.parse(serialised));

    for (const forbidden of [
      "score",
      "points",
      "passingPercent",
      "attempts",
      "mastery",
      "evidence",
      "competencyStableId",
      "assessmentStableId"
    ]) {
      expect(names.has(forbidden)).toBe(false);
    }
  });

  it("hands the renderer the questions without their answers", () => {
    // The projection seam, through the real projection. A renderer drawing a
    // question cannot reach the answer by accident: it is not on the object.
    const projected = projectMissionStepContent(nearTransfer());
    if (projected.type !== "near_transfer") throw new Error("not projected");

    for (const question of projected.questions) {
      expect("correctOptionIds" in question).toBe(false);
      expect("explanation" in question).toBe(false);
      expect(projected.answers[question.questionStableId]).toBeDefined();
    }

    expect(projected.questions).toHaveLength(4);
  });
});

/* ------------------------------------------------------------------ *
 * FOUNDER VIDEO UAT — MISSION 1 FINAL CLEANUP
 *
 * The curriculum half of the final video pass. The presentation half — the
 * prediction flow, the device-state labels, the live-region forms and the
 * near-transfer counter — is asserted in `apps/web`, where those functions
 * live.
 * ------------------------------------------------------------------ */

describe("Mission 1's full description is current, and gives nothing away", () => {
  const M1_ID = "nf-m1-what-a-network-is";

  /** The "Full description of this activity" disclosure the Founder opened. */
  function fullDescription(): string {
    return interactionOf(M1_ID).textEquivalent;
  }

  it("is the Architect-authored replacement, word for word", () => {
    expect(fullDescription()).toBe(
      "This activity shows five devices: PC-A, PC-B, the Printer, Switch-1, and " +
        "Router-1. PC-A, PC-B, and the Printer each connect to Switch-1. Router-1 " +
        "also connects to Switch-1 and has another connection leading beyond this " +
        "local network. PC-A is sending a print request to the Printer. Use the " +
        "connections in the topology to predict which device receives the print " +
        "request first. You can select any device to inspect what it connects to."
    );
  });

  it("no longer carries the stale curriculum the Founder read", () => {
    // Every one of these was in the description this replaced. It had been
    // written against an earlier instructional sequence and had gone on
    // teaching it from a secondary surface: switch mechanism, routing, the
    // vocabulary of later missions, and a narration of the finished journey.
    const text = fullDescription();

    for (const stale of [
      "device in the middle",
      "Mission 2",
      "Mission 5",
      "Mission 6",
      "works out which port",
      "decides which port",
      "passes it on",
      "walkthrough is then complete",
      "accepts the print job",
      "are not visited"
    ]) {
      expect(`still says "${stale}": ${text.includes(stale)}`).toBe(
        `still says "${stale}": false`
      );
    }
  });

  it("does not answer the prediction it can be opened before", () => {
    // The disclosure is reachable BEFORE the learner commits, so it is bound
    // by the pre-commitment boundary: it may describe the topology, because
    // reading the topology is the reasoning task, and it may not hand over the
    // conclusion or narrate the journey that has not happened yet.
    const text = fullDescription();

    // It names Switch-1 as a device on the diagram — it must, or the
    // accessible path is poorer than the visual one.
    expect(text).toContain("Switch-1");

    // What it must not do is say the request reaches it, or reaches it first.
    for (const reveal of [
      "reaches Switch-1",
      "arrives at Switch-1",
      "Switch-1 first",
      "receives the print request first is Switch-1",
      "The print request leaves PC-A",
      "arrives at the Printer"
    ]) {
      expect(`gives away "${reveal}": ${text.includes(reveal)}`).toBe(
        `gives away "${reveal}": false`
      );
    }

    // And it must not carry the authored prediction explanation.
    const prediction = journeyOf(M1_ID).stages.find(
      (stage) => stage.prediction !== undefined
    )?.prediction;

    expect(prediction?.explanation).toBeDefined();
    expect(text).not.toContain(prediction?.explanation ?? "@@ never @@");
  });

  it("still describes every device and every connection the learner reasons from", () => {
    // The boundary cuts one way only. Withholding the topology to hide the
    // answer would take the reasoning task away from the learner who cannot
    // see the diagram, which is the opposite of equivalence.
    const text = fullDescription();

    for (const node of journeyOf(M1_ID).nodes) {
      expect(text).toContain(node.label);
    }

    for (const relationship of [
      "PC-A, PC-B, and the Printer each connect to Switch-1",
      "Router-1 also connects to Switch-1",
      "another connection leading beyond this local network"
    ]) {
      expect(text).toContain(relationship);
    }
  });

  it("says what the learner is being asked to do", () => {
    expect(fullDescription()).toContain(
      "predict which device receives the print request first"
    );
  });
});
