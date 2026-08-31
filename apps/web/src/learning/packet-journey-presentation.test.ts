import { describe, expect, it } from "vitest";
import type { LearnerPacketJourneyParameters } from "@tlp/shared-types";
import {
  INITIAL_PACKET_JOURNEY_VIEW_STATE,
  advance,
  applyAction,
  buildPacketJourneyView,
  canAdvance,
  commitPrediction,
  describeSourceNotice,
  describeUnsupportedInteraction,
  describeWithheldInteraction,
  pendingPrediction,
  resetJourney,
  type PacketJourneyViewState
} from "./packet-journey-presentation";

/**
 * WP-H — the Packet Journey's behaviour, proven without a DOM.
 *
 * These tests are the accessible-equivalence evidence available at this level:
 * they prove that the SAME view model carries the state, the actions, the
 * consequence and the text account, so a semantic presentation built on it has
 * everything the visual one has. Driving rendered markup is WP-I Human UAT.
 */

const journey: LearnerPacketJourneyParameters = {
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
          attributes: [
            { label: "IP address", value: "192.168.10.10/24" },
            { label: "VLAN", value: "10" }
          ]
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
          attributes: [{ label: "Encapsulation", value: "dot1Q 10" }]
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
    startActionLabel: "Send the ping from PC-A"
  },
  stages: [
    {
      stageId: "s1",
      atNodeId: "pc-a",
      narration: "PC-A sends the request to its gateway.",
      decision: "The destination is on another network.",
      outcome: "proceeds"
    },
    {
      stageId: "s2",
      atNodeId: "r-1",
      narration: "The frame arrives at Router-1 and is discarded.",
      decision: "There is no subinterface for VLAN 20.",
      outcome: "stops",
      prediction: {
        prompt: "What will Router-1 do?",
        options: ["Forward it", "Discard it"]
      }
    }
  ],
  fault: {
    atNodeId: "r-1",
    symptom: "The ping reports 100% packet loss.",
    stopsAtStageId: "s2",
    explanation: "Router-1 has no subinterface for VLAN 20."
  },
  actions: [
    {
      actionId: "add-vlan-20",
      label: "Add the VLAN 20 subinterface",
      resolvesFault: true,
      observation: "Router-1 forwards the frame into VLAN 20."
    },
    {
      actionId: "restart-pc-a",
      label: "Restart PC-A",
      resolvesFault: false,
      observation: "PC-A restarts; the ping still fails."
    }
  ],
  confirmation: {
    narration: "The reply returns to PC-A.",
    summary: "A router needs one subinterface per VLAN."
  }
};

/** Walk to the authored failure, committing the prediction on the way. */
function walkToFailure(): PacketJourneyViewState {
  let state = advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, journey);
  state = commitPrediction(state, "s2", "Discard it");
  return advance(state, journey);
}

/* ------------------------------------------------------------------ *
 * The signature sequence
 * ------------------------------------------------------------------ */

describe("the journey starts unrevealed", () => {
  const view = buildPacketJourneyView(journey, INITIAL_PACKET_JOURNEY_VIEW_STATE);

  it("shows no stage before the learner starts", () => {
    expect(view.stages).toEqual([]);
    expect(view.finished).toBe(false);
  });

  it("says what will be followed, and from where to where", () => {
    expect(view.trafficSummary).toContain("an ICMP echo request");
    expect(view.trafficSummary).toContain("PC-A");
    expect(view.trafficSummary).toContain("Router-1");
  });

  it("identifies itself as instructional simulation", () => {
    // DEC-058: teaching mode must be clearly identified on screen and must
    // never claim a real environment was configured.
    expect(view.sourceNotice).toContain("Instructional simulation");
    expect(view.sourceNotice).toContain("not a live environment");
  });

  it("offers the authored start label", () => {
    expect(view.startLabel).toBe("Send the ping from PC-A");
  });
});

describe("prediction gates the reveal", () => {
  it("blocks the next observation until the prediction is committed", () => {
    const started = advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, journey);

    expect(pendingPrediction(started, journey)?.stageId).toBe("s2");
    expect(canAdvance(started, journey)).toBe(false);

    // Advancing is refused, not silently allowed.
    expect(advance(started, journey)).toBe(started);
  });

  it("releases the reveal once committed", () => {
    const committed = commitPrediction(
      advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, journey),
      "s2",
      "Discard it"
    );

    expect(pendingPrediction(committed, journey)).toBeNull();
    expect(canAdvance(committed, journey)).toBe(true);
  });

  it("does not let a commitment be revised", () => {
    const first = commitPrediction(
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      "s2",
      "Discard it"
    );
    const second = commitPrediction(first, "s2", "Forward it");

    expect(second.committedPredictions.s2).toBe("Discard it");
  });

  it("records the commitment beside the stage it was about", () => {
    const view = buildPacketJourneyView(journey, walkToFailure());

    expect(view.stages[1]?.committedPrediction).toBe("Discard it");
  });

  it("asks nothing on a stage that authors no prediction", () => {
    expect(
      pendingPrediction(INITIAL_PACKET_JOURNEY_VIEW_STATE, journey)
    ).toBeNull();
  });
});

describe("the failure boundary", () => {
  const view = buildPacketJourneyView(journey, walkToFailure());

  it("stops where the fault is authored to stop it", () => {
    expect(view.stages[1]?.stopped).toBe(true);
    expect(view.stages[1]?.outcomeLabel).toBe("Stopped here");
  });

  it("shows the symptom the learner can observe", () => {
    expect(view.symptom).toContain("100% packet loss");
  });

  it("states the outcome in words, never by colour alone", () => {
    // CURR-011 s14.7: consequences must never be conveyed by colour or motion
    // alone. Every stage carries a text outcome label.
    for (const stage of view.stages) {
      expect(stage.outcomeLabel.length).toBeGreaterThan(0);
    }
    expect(view.announcement).toContain("Stopped at Router-1");
  });

  it("offers remediation only after the failure has been seen", () => {
    const early = buildPacketJourneyView(
      journey,
      advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, journey)
    );

    expect(early.actions.every((action) => !action.available)).toBe(true);
    expect(view.actions.every((action) => action.available)).toBe(true);
  });

  it("never marks an action as the correct one", () => {
    // The view model carries no answer key. A learner reads the labels and
    // diagnoses; nothing points at the right one.
    for (const action of view.actions) {
      expect(Object.keys(action)).toEqual(["actionId", "label", "available"]);
    }
  });
});

describe("remediation and confirmation", () => {
  it("keeps the journey stopped after a repair that does not work", () => {
    const view = buildPacketJourneyView(
      journey,
      applyAction(walkToFailure(), "restart-pc-a")
    );

    expect(view.stages[1]?.stopped).toBe(true);
    expect(view.confirmation).toBeNull();
    expect(view.textTrace.join(" ")).toContain("the ping still fails");
  });

  it("lets the journey proceed after the authored repair", () => {
    const view = buildPacketJourneyView(
      journey,
      applyAction(walkToFailure(), "add-vlan-20")
    );

    expect(view.stages[1]?.stopped).toBe(false);
    expect(view.finished).toBe(true);
  });

  it("gives visible confirmation that the system now works", () => {
    const view = buildPacketJourneyView(
      journey,
      applyAction(walkToFailure(), "add-vlan-20")
    );

    expect(view.confirmation).toContain("one subinterface per VLAN");
    expect(view.announcement).toContain("Fixed");
    expect(view.announcement).toContain("reply returns");
  });

  it("withdraws the remediation controls once one is applied", () => {
    const view = buildPacketJourneyView(
      journey,
      applyAction(walkToFailure(), "add-vlan-20")
    );

    expect(view.actions.every((action) => !action.available)).toBe(true);
  });

  it("does not let a second remediation be applied", () => {
    const once = applyAction(walkToFailure(), "restart-pc-a");

    expect(applyAction(once, "add-vlan-20")).toBe(once);
  });

  it("starts over cleanly", () => {
    expect(resetJourney()).toEqual(INITIAL_PACKET_JOURNEY_VIEW_STATE);
  });
});

/* ------------------------------------------------------------------ *
 * Accessibility
 * ------------------------------------------------------------------ */

describe("the accessible account carries the whole journey", () => {
  it("tells the learner what to do before anything has happened", () => {
    const view = buildPacketJourneyView(
      journey,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(view.textTrace[0]).toContain("Send the ping from PC-A");
  });

  it("records prediction, observation and reason in order", () => {
    const trace = buildPacketJourneyView(journey, walkToFailure()).textTrace;

    expect(trace).toEqual([
      "At PC-A: PC-A sends the request to its gateway.",
      "Why: The destination is on another network.",
      "You predicted: Discard it",
      "At Router-1: The frame arrives at Router-1 and is discarded.",
      "Why: There is no subinterface for VLAN 20."
    ]);
  });

  it("records the remediation and its result", () => {
    const trace = buildPacketJourneyView(
      journey,
      applyAction(walkToFailure(), "add-vlan-20")
    ).textTrace;

    expect(trace).toContain("You chose: Add the VLAN 20 subinterface");
    expect(trace).toContain("Result: Router-1 forwards the frame into VLAN 20.");
  });

  it("exposes the same inspectable state the visual learner sees", () => {
    const view = buildPacketJourneyView(journey, walkToFailure());
    const pcA = view.nodes.find((node) => node.nodeId === "pc-a");

    expect(pcA?.roleLabel).toBe("Host");
    expect(pcA?.interfaces[0]?.attributes).toEqual([
      { label: "IP address", value: "192.168.10.10/24" },
      { label: "VLAN", value: "10" }
    ]);
  });

  it("names every link in words", () => {
    const view = buildPacketJourneyView(journey, walkToFailure());

    expect(view.links).toEqual([
      { linkId: "link-a", label: "PC-A to Router-1" }
    ]);
  });
});

describe("reduced motion loses no information and no action", () => {
  it("exposes no motion-dependent field at all", () => {
    // Parity is structural: there is no motion input to this module, so a
    // reduced-motion learner cannot receive a different view. Only CSS differs.
    const view = buildPacketJourneyView(journey, walkToFailure());

    for (const motionField of [
      "animated",
      "animation",
      "reducedMotion",
      "duration",
      "transition"
    ]) {
      expect(Object.keys(view)).not.toContain(motionField);
    }
  });

  it("carries every consequence as text", () => {
    const view = buildPacketJourneyView(journey, walkToFailure());

    // Everything the animation could show is also a string here.
    expect(view.announcement.length).toBeGreaterThan(0);
    expect(view.textTrace.length).toBeGreaterThan(0);
    expect(view.symptom).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Withholding, as it reaches the presentation
 * ------------------------------------------------------------------ */

/**
 * Exactly what the server sends at CHALLENGE ME: no stage `decision`, no
 * `fault.explanation`, no `actions` and no `confirmation`.
 *
 * Building the fixture by OMISSION rather than by blanking is the point — the
 * presentation is handed a payload that never contained the answer, so there
 * is nothing for it to leak, hide or reconstruct.
 */
const challengeMeJourney: LearnerPacketJourneyParameters = {
  interactionType: "packet_journey",
  nodes: journey.nodes,
  links: journey.links,
  traffic: journey.traffic,
  stages: journey.stages.map(({ decision: _decision, ...rest }) => rest),
  fault: {
    atNodeId: "r-1",
    symptom: "The ping reports 100% packet loss.",
    stopsAtStageId: "s2"
  }
};

describe("withheld teaching content simply is not there", () => {
  const view = buildPacketJourneyView(challengeMeJourney, walkToFailure());

  it("shows no reason when the support level dropped the explanation", () => {
    expect(view.explanation).toBeNull();
    expect(view.stages.every((stage) => stage.decision === undefined)).toBe(true);
    expect(view.textTrace.some((line) => line.startsWith("Why:"))).toBe(false);
  });

  it("offers no remediation when the server sent none", () => {
    expect(view.actions).toEqual([]);
    expect(view.confirmation).toBeNull();
  });

  it("says why there is nothing to click, without hinting at the answer", () => {
    expect(view.remediationWithheld).toContain("not offered at this level");
    expect(view.remediationWithheld).not.toContain("subinterface");
    expect(view.remediationWithheld).not.toContain("VLAN");
  });

  it("keeps the symptom, the state and the account when the reason is withheld", () => {
    // Over-withholding is the opposite failure and is just as wrong: a
    // legitimate observation is not tutoring because it describes state.
    expect(view.symptom).toContain("100% packet loss");
    expect(view.nodes).toHaveLength(2);
    expect(view.nodes[0]?.interfaces[0]?.attributes).toHaveLength(2);
    expect(view.links).toHaveLength(1);
    expect(view.textTrace.length).toBeGreaterThan(0);
    expect(view.stages).toHaveLength(2);
  });

  it("still lets the learner predict and follow the journey", () => {
    const started = advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, challengeMeJourney);

    expect(pendingPrediction(started, challengeMeJourney)?.prompt).toBe(
      "What will Router-1 do?"
    );
    expect(canAdvance(started, challengeMeJourney)).toBe(false);
    expect(
      canAdvance(
        commitPrediction(started, "s2", "Discard it"),
        challengeMeJourney
      )
    ).toBe(true);
  });

  it("reconstructs nothing when an unknown action id is somehow applied", () => {
    // Defensive: even if state named an action, the payload holds none, so
    // there is nothing to resolve and no consequence to fabricate.
    const view = buildPacketJourneyView(
      challengeMeJourney,
      applyAction(walkToFailure(), "add-vlan-20")
    );

    expect(view.confirmation).toBeNull();
    expect(view.stages[1]?.stopped).toBe(true);
    expect(view.textTrace.some((line) => line.startsWith("You chose:"))).toBe(
      false
    );
  });

  it("leaks no protected string into the whole view model", () => {
    // The serialisation assertion, applied to the view the component renders
    // from — not only to the wire payload.
    const serialised = JSON.stringify(
      buildPacketJourneyView(
        challengeMeJourney,
        applyAction(walkToFailure(), "add-vlan-20")
      )
    );

    for (const leaked of [
      "The destination is on another network.",
      "There is no subinterface for VLAN 20.",
      "Router-1 has no subinterface for VLAN 20.",
      "Add the VLAN 20 subinterface",
      "Router-1 forwards the frame into VLAN 20.",
      "A router needs one subinterface per VLAN.",
      "resolvesFault"
    ]) {
      expect(serialised).not.toContain(leaked);
    }
  });
});

describe("honest wording for the states with nothing to render", () => {
  it("explains a protected demonstration without implying loss", () => {
    expect(describeWithheldInteraction()).toContain("protected demonstration");
    expect(describeWithheldInteraction()).toContain("unchanged");
  });

  it("reports a missing renderer without dumping the payload", () => {
    expect(describeUnsupportedInteraction()).toBe(
      "This interactive element could not be displayed."
    );
  });

  it("labels a future live source differently from a taught one", () => {
    expect(describeSourceNotice("live_lab")).toContain("Live lab");
    expect(describeSourceNotice("authored_teaching")).toContain(
      "Instructional simulation"
    );
  });
});
