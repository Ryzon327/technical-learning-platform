import { describe, expect, it } from "vitest";
import type { LearnerPacketJourneyParameters } from "@tlp/shared-types";
import {
  INITIAL_PACKET_JOURNEY_VIEW_STATE,
  advance,
  applyAction,
  buildPacketJourneyView,
  canAdvance,
  commitPrediction,
  describeAdvanceLabel,
  describeSourceNotice,
  describeUnsupportedInteraction,
  describeWithheldInteraction,
  pendingPrediction,
  resetJourney,
  resolveSequencing,
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
      // The link the traffic crossed to get here. Authored, never worked out.
      viaLinkId: "link-a",
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

/* ------------------------------------------------------------------ *
 * WP-I correction — a committed prediction is a learning event, not a reset
 *
 * The Founder deliberately committed a wrong prediction on the first stage.
 * The prediction vanished, the live region still read "Ready to start.", and
 * the control read "Start" — so the interaction appeared to have discarded the
 * answer and restarted. Nothing had reset. These tests pin every part of that.
 * ------------------------------------------------------------------ */

/** A journey whose FIRST stage asks for a prediction, as the fixture does. */
const predictFirstJourney: LearnerPacketJourneyParameters = {
  ...journey,
  stages: [
    {
      ...journey.stages[0]!,
      prediction: {
        prompt: "Where does PC-A send the frame first?",
        options: ["Straight to Router-1", "To its default gateway"]
      }
    },
    journey.stages[1]!
  ]
};

describe("committing a prediction never resets the journey", () => {
  const committed = commitPrediction(
    INITIAL_PACKET_JOURNEY_VIEW_STATE,
    "s1",
    "Straight to Router-1"
  );

  it("does not advance the journey", () => {
    expect(committed.progress.revealedStageCount).toBe(0);
    expect(committed.progress.appliedActionId).toBeNull();
  });

  it("keeps the commitment visible before anything is revealed", () => {
    const view = buildPacketJourneyView(predictFirstJourney, committed);

    expect(view.pendingCommitment).toEqual({
      stageId: "s1",
      option: "Straight to Router-1"
    });
    expect(view.stages).toEqual([]);
  });

  it("changes what the live region announces", () => {
    const before = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    ).announcement;

    const after = buildPacketJourneyView(
      predictFirstJourney,
      committed
    ).announcement;

    expect(after).not.toBe(before);
    expect(after).toContain("Straight to Router-1");
    // Announced without a verdict. The observation is what teaches.
    expect(after).not.toContain("wrong");
    expect(after).not.toContain("incorrect");
  });

  it("records the commitment in the text account immediately", () => {
    const trace = buildPacketJourneyView(predictFirstJourney, committed)
      .textTrace;

    expect(trace).toContain("You predicted: Straight to Router-1");
    expect(trace).toContain("That prediction has not been observed yet.");
  });

  it("labels the first reveal with the authored start action", () => {
    // It used to read "Start", which is what a control that restarts something
    // reads like. The authored label was already in the view model, unused.
    expect(
      describeAdvanceLabel(committed, predictFirstJourney)
    ).toBe("Send the ping from PC-A");

    expect(
      buildPacketJourneyView(predictFirstJourney, committed).advanceLabel
    ).toBe("Send the ping from PC-A");
  });

  it("pairs the prediction with what actually happened once revealed", () => {
    const revealed = advance(committed, predictFirstJourney);
    const view = buildPacketJourneyView(predictFirstJourney, revealed);

    expect(view.pendingCommitment).toBeNull();
    expect(view.stages[0]?.committedPrediction).toBe("Straight to Router-1");
    expect(view.stages[0]?.narration).toBe(
      "PC-A sends the request to its gateway."
    );
  });

  it("never grades the prediction", () => {
    const view = buildPacketJourneyView(
      predictFirstJourney,
      advance(committed, predictFirstJourney)
    );

    // There is no answer key in the contract, so there is nothing to grade
    // with. The whole serialised view is checked, not just the stage.
    const serialised = JSON.stringify(view);

    for (const verdict of ["correct", "Correct", "wrong", "Wrong", "incorrect"]) {
      expect(serialised).not.toContain(verdict);
    }
  });

  it("resets only through the explicit reset", () => {
    const walked = advance(committed, predictFirstJourney);

    // Nothing in the ordinary sequence returns to the initial state.
    expect(walked).not.toEqual(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    expect(
      commitPrediction(walked, "s2", "Discard it").progress.revealedStageCount
    ).toBe(1);
    expect(applyAction(walked, "add-vlan-20")).not.toEqual(
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(resetJourney()).toEqual(INITIAL_PACKET_JOURNEY_VIEW_STATE);
  });
});

/* ------------------------------------------------------------------ *
 * WP-I correction — sequencing at the levels that withhold nothing
 * ------------------------------------------------------------------ */

describe("support level changes sequencing, never authorization", () => {
  it("names only the levels that withhold nothing", () => {
    expect(resolveSequencing("show_me")).toBe("demonstrate");
    expect(resolveSequencing("help_me")).toBe("guide");
    expect(resolveSequencing("ask_me")).toBe("commit_first");
  });

  it("falls through to the strictest arm for anything else", () => {
    // Protected levels are not named here, and do not need to be: their
    // answer-bearing fields are already absent from the payload. An
    // unrecognised value gets the most participation and the least assistance,
    // which is the safe direction.
    for (const level of ["challenge", "prove", "", "something_new"]) {
      expect(resolveSequencing(level)).toBe("commit_first");
    }
  });

  it("requires a commitment before the reveal when asked to", () => {
    const view = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      "commit_first"
    );

    expect(view.predictionRequired).toBe(true);
    expect(view.canAdvance).toBe(false);
    expect(view.pendingPrediction?.stageId).toBe("s1");
  });

  it("still offers the prediction when it is not required", () => {
    for (const sequencing of ["demonstrate", "guide"] as const) {
      const view = buildPacketJourneyView(
        predictFirstJourney,
        INITIAL_PACKET_JOURNEY_VIEW_STATE,
        sequencing
      );

      // Offered, committed and compared exactly as before — simply not a gate.
      expect(view.pendingPrediction?.stageId).toBe("s1");
      expect(view.predictionRequired).toBe(false);
      expect(view.canAdvance).toBe(true);
    }
  });

  it("sends identical content at every sequencing", () => {
    // Sequencing is presentation. It must never change what a learner may see,
    // because what they may see was decided server-side.
    const demonstrate = buildPacketJourneyView(
      journey,
      walkToFailure(),
      "demonstrate"
    );

    for (const sequencing of ["guide", "commit_first"] as const) {
      const view = buildPacketJourneyView(journey, walkToFailure(), sequencing);

      expect(view.stages).toEqual(demonstrate.stages);
      expect(view.nodes).toEqual(demonstrate.nodes);
      expect(view.links).toEqual(demonstrate.links);
      expect(view.actions).toEqual(demonstrate.actions);
      expect(view.symptom).toEqual(demonstrate.symptom);
      expect(view.explanation).toEqual(demonstrate.explanation);
      expect(view.textTrace).toEqual(demonstrate.textTrace);
      expect(view.topology).toEqual(demonstrate.topology);
    }
  });

  it("puts the authored reason behind a disclosure only at the guided level", () => {
    const guide = buildPacketJourneyView(journey, walkToFailure(), "guide");

    expect(guide.decisionDisclosed).toBe(true);
    expect(guide.inspectionPrompt).toBeNull();
    expect(
      buildPacketJourneyView(journey, walkToFailure(), "demonstrate")
        .decisionDisclosed
    ).toBe(false);
  });

  it("prompts the guided learner to inspect before a reveal", () => {
    const guide = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      "guide"
    );

    expect(guide.inspectionPrompt).toContain("select a device");
    // The nudge carries no networking guidance of its own. A hint invented
    // here would be curriculum written by the renderer.
    expect(guide.inspectionPrompt).not.toContain("VLAN");
    expect(guide.inspectionPrompt).not.toContain("gateway");
  });
});

/* ------------------------------------------------------------------ *
 * WP-I final correction — the journey completes at its destination
 *
 * Founder UAT: after remediation the journey effectively ended at the router.
 * The learner was told the problem was fixed but never saw the objective — PC-A
 * reaching PC-B — actually fulfilled.
 * ------------------------------------------------------------------ */

/**
 * A journey that carries on past the repaired fault to its destination, and
 * then back. Every hop names the link it crossed; nothing is reverse-computed.
 */
const completingJourney: LearnerPacketJourneyParameters = {
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
          attributes: [{ label: "VLAN", value: "10", prominent: true }]
        }
      ]
    },
    {
      nodeId: "r-1",
      label: "Router-1",
      role: "router",
      interfaces: [
        {
          interfaceId: "r-1-gi0",
          label: "Gi0/0.10",
          attributes: [
            { label: "Encapsulation", value: "dot1Q 10", prominent: true }
          ]
        }
      ]
    },
    {
      nodeId: "pc-b",
      label: "PC-B",
      role: "host",
      interfaces: [
        {
          interfaceId: "pc-b-eth0",
          label: "eth0",
          attributes: [{ label: "VLAN", value: "20", prominent: true }]
        }
      ]
    }
  ],
  links: [
    {
      linkId: "link-a",
      label: "PC-A to Router-1",
      endpoints: ["pc-a-eth0", "r-1-gi0"]
    },
    {
      linkId: "link-b",
      label: "Router-1 to PC-B",
      endpoints: ["r-1-gi0", "pc-b-eth0"]
    }
  ],
  traffic: {
    label: "an ICMP echo request",
    sourceNodeId: "pc-a",
    destinationNodeId: "pc-b",
    startActionLabel: "Send the ping from PC-A"
  },
  stages: [
    {
      stageId: "c1",
      atNodeId: "pc-a",
      narration: "PC-A sends the request to its gateway.",
      outcome: "proceeds"
    },
    {
      stageId: "c2",
      atNodeId: "r-1",
      narration: "Router-1 discards the request.",
      outcome: "stops",
      viaLinkId: "link-a"
    },
    {
      stageId: "c3",
      atNodeId: "pc-b",
      narration: "PC-B received the request.",
      outcome: "proceeds",
      viaLinkId: "link-b"
    },
    {
      stageId: "c4",
      atNodeId: "pc-a",
      narration: "Reply received from PC-B.",
      outcome: "proceeds",
      viaLinkId: "link-a"
    }
  ],
  fault: {
    atNodeId: "r-1",
    symptom: "The ping reports 100% packet loss.",
    stopsAtStageId: "c2",
    explanation: "Router-1 has no interface in the destination network."
  },
  actions: [
    {
      actionId: "add-vlan-20",
      label: "Add the VLAN 20 subinterface",
      resolvesFault: true,
      observation: "Router-1 forwards the request on towards PC-B."
    },
    {
      actionId: "restart-pc-b",
      label: "Restart PC-B",
      resolvesFault: false,
      observation: "PC-B comes back up and still receives nothing."
    }
  ],
  confirmation: {
    narration: "The request reaches PC-B and the reply returns to PC-A.",
    summary: "A router needs one interface per network it routes between."
  }
};

/** Advance to the authored stop, committing nothing on the way. */
function walkToStop(): PacketJourneyViewState {
  return advance(
    advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, completingJourney),
    completingJourney
  );
}

/** Repair, then advance through every remaining authored stage. */
function walkToArrival(): PacketJourneyViewState {
  let state = applyAction(walkToStop(), "add-vlan-20");
  state = advance(state, completingJourney);
  return state;
}

describe("the journey stops where it stopped, and no further", () => {
  it("refuses to advance past an authored stop that is still unrepaired", () => {
    const stopped = walkToStop();
    const view = buildPacketJourneyView(completingJourney, stopped);

    // There ARE stages after the stop. Before the repair they are unreachable,
    // so a learner cannot click straight past the failure they came to diagnose.
    expect(completingJourney.stages).toHaveLength(4);
    expect(stopped.progress.revealedStageCount).toBe(2);
    expect(view.canAdvance).toBe(false);
    expect(advance(stopped, completingJourney)).toBe(stopped);
  });

  it("still refuses after a repair that does not repair anything", () => {
    const wrong = applyAction(walkToStop(), "restart-pc-b");

    expect(buildPacketJourneyView(completingJourney, wrong).canAdvance).toBe(
      false
    );
    expect(advance(wrong, completingJourney)).toBe(wrong);
  });

  it("releases the rest of the journey once the authored repair is applied", () => {
    const repaired = applyAction(walkToStop(), "add-vlan-20");

    expect(buildPacketJourneyView(completingJourney, repaired).canAdvance).toBe(
      true
    );
    expect(
      advance(repaired, completingJourney).progress.revealedStageCount
    ).toBe(3);
  });
});

describe("the journey reaches its destination", () => {
  it("carries on to PC-B after the repair", () => {
    const view = buildPacketJourneyView(completingJourney, walkToArrival());

    expect(view.stages.map((stage) => stage.nodeLabel)).toEqual([
      "PC-A",
      "Router-1",
      "PC-B"
    ]);
    expect(view.stages[2]?.narration).toBe("PC-B received the request.");
    expect(view.announcement).toContain("PC-B received the request.");
  });

  it("names the authored destination as the place it arrived", () => {
    const view = buildPacketJourneyView(completingJourney, walkToArrival());
    const arrival = view.stages[2];

    expect(arrival?.nodeId).toBe(completingJourney.traffic.destinationNodeId);
    expect(view.currentEvent.headline).toContain("PC-B");
  });

  it("shows the reply as an AUTHORED stage, never a reversed path", () => {
    // The reply exists because the source wrote it down, and it crosses the
    // link the source named. Nothing here walks the topology backwards.
    const reply = completingJourney.stages[3];

    expect(reply?.atNodeId).toBe("pc-a");
    expect(reply?.viaLinkId).toBe("link-a");

    const view = buildPacketJourneyView(
      completingJourney,
      advance(walkToArrival(), completingJourney)
    );

    expect(view.stages[3]?.narration).toBe("Reply received from PC-B.");
  });

  it("ends confirmed, with the authored conclusion", () => {
    const finished = advance(walkToArrival(), completingJourney);
    const view = buildPacketJourneyView(completingJourney, finished);

    expect(view.finished).toBe(true);
    expect(view.currentEvent.kind).toBe("confirmed");
    expect(view.confirmation).toContain("one interface per network");
    expect(view.announcement).toContain("reply returns");
  });

  it("does not reach confirmation merely by repairing the fault", () => {
    // The old behaviour: the fault stage was the last stage, so repairing it
    // completed the journey. The learner has to watch it work now.
    const repaired = applyAction(walkToStop(), "add-vlan-20");
    const view = buildPacketJourneyView(completingJourney, repaired);

    expect(view.finished).toBe(false);
    expect(view.confirmation).toBeNull();
    expect(view.currentEvent.kind).toBe("repaired");
  });
});

/* ------------------------------------------------------------------ *
 * WP-I final correction — action and consequence are synchronised
 * ------------------------------------------------------------------ */

describe("every action produces a current-event change", () => {
  it("describes where the traffic is, and over which connection", () => {
    const view = buildPacketJourneyView(completingJourney, walkToStop());

    expect(view.currentEvent.headline).toBe("Stopped at Router-1.");
    // The wire that lights up is decorative and hidden, so the connection has
    // to be named in words or the fact exists only in the picture.
    expect(view.currentEvent.via).toBe("PC-A eth0 to Router-1 Gi0/0.10");
    expect(view.announcement).toContain("PC-A eth0 to Router-1 Gi0/0.10");
  });

  it("names no connection for a stage the source did not attribute to one", () => {
    const started = advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, completingJourney);

    expect(buildPacketJourneyView(completingJourney, started).currentEvent.via)
      .toBeNull();
  });

  it("moves the change token on every observable event", () => {
    const tokenOf = (state: PacketJourneyViewState) =>
      buildPacketJourneyView(completingJourney, state).currentEvent.token;

    const start = INITIAL_PACKET_JOURNEY_VIEW_STATE;
    const revealed = advance(start, completingJourney);
    const stopped = advance(revealed, completingJourney);
    const repaired = applyAction(stopped, "add-vlan-20");
    const arrived = advance(repaired, completingJourney);

    const tokens = [start, revealed, stopped, repaired, arrived].map(tokenOf);

    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("moves the token when a prediction is committed and nothing else changes", () => {
    const before = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    ).currentEvent.token;

    const after = buildPacketJourneyView(
      predictFirstJourney,
      commitPrediction(INITIAL_PACKET_JOURNEY_VIEW_STATE, "s1", "To its default gateway")
    ).currentEvent.token;

    expect(after).not.toBe(before);
  });

  it("walks the kinds through the whole signature sequence", () => {
    const kindOf = (state: PacketJourneyViewState) =>
      buildPacketJourneyView(completingJourney, state).currentEvent.kind;

    const stopped = walkToStop();
    const repaired = applyAction(stopped, "add-vlan-20");
    const arrived = advance(repaired, completingJourney);

    expect(kindOf(INITIAL_PACKET_JOURNEY_VIEW_STATE)).toBe("waiting");
    expect(kindOf(advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, completingJourney)))
      .toBe("moving");
    expect(kindOf(stopped)).toBe("stopped");
    expect(kindOf(repaired)).toBe("repaired");
    expect(kindOf(arrived)).toBe("moving");
    expect(kindOf(advance(arrived, completingJourney))).toBe("confirmed");
  });

  it("stops repeating the repair once the traffic has moved on", () => {
    // The repair's observation belongs to the moment it was applied. Announcing
    // it again at PC-B would report the fix as though it had just happened
    // somewhere the traffic no longer is.
    const repaired = applyAction(walkToStop(), "add-vlan-20");

    expect(
      buildPacketJourneyView(completingJourney, repaired).announcement
    ).toBe("Router-1 forwards the request on towards PC-B.");

    expect(
      buildPacketJourneyView(completingJourney, advance(repaired, completingJourney))
        .announcement
    ).toContain("PC-B received the request.");
  });

  it("carries every event state as text, not only as a kind", () => {
    // Reduced motion removes the ring and the settle. Everything below survives
    // it, because none of it is animation.
    for (const state of [
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      walkToStop(),
      walkToArrival()
    ]) {
      const view = buildPacketJourneyView(completingJourney, state);

      expect(view.currentEvent.headline.length).toBeGreaterThan(0);
      expect(view.announcement.length).toBeGreaterThan(0);
      expect(view.textTrace.length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * WP-I final flow correction — the learner continues downward
 *
 * Founder UAT: the progression control sat ABOVE the journey history. Once the
 * history had grown to Router-1, continuing meant scrolling up to click and
 * back down to read — once per remaining authored stage.
 *
 * The control moved to sit immediately after the latest event. WHERE it renders
 * is a structural property of the component and is pinned by verify-wpi.sh;
 * what these tests pin is that the control is offered at exactly the points a
 * downward-reading learner needs it, and withdrawn everywhere else.
 * ------------------------------------------------------------------ */

describe("the whole authored journey is walkable in one direction", () => {
  it("offers exactly one next step at every point, until there is none", () => {
    let state = INITIAL_PACKET_JOURNEY_VIEW_STATE;
    const offered: boolean[] = [];
    const headlines: string[] = [];

    // Walk forward the way a learner does: read, act, read. The only
    // interruption is the authored stop, which is repaired once.
    for (let step = 0; step < 12; step += 1) {
      const view = buildPacketJourneyView(completingJourney, state);
      offered.push(view.canAdvance);
      headlines.push(view.currentEvent.headline);

      if (view.canAdvance) {
        state = advance(state, completingJourney);
        continue;
      }

      // Not offered: either the journey needs repairing, or it is finished.
      if (view.actions.some((action) => action.available)) {
        state = applyAction(state, "add-vlan-20");
        continue;
      }

      break;
    }

    const finished = buildPacketJourneyView(completingJourney, state);

    expect(finished.currentEvent.kind).toBe("confirmed");
    expect(finished.canAdvance).toBe(false);
    expect(finished.stages).toHaveLength(completingJourney.stages.length);

    // Withdrawn exactly twice: at the unrepaired stop, and at the end.
    expect(offered.filter((available) => !available)).toHaveLength(2);

    // And the learner passed through every authored device in authored order.
    expect(headlines).toContain("Stopped at Router-1.");
    expect(headlines).toContain("The traffic is at PC-B.");
    expect(headlines).toContain("The journey is complete.");
  });

  it("keeps offering the next step after every advance that has one", () => {
    // The complaint was never that the control vanished — it was where it was.
    // This pins the other half: it must still be there, every time, so that
    // "read, act, read" never breaks.
    let state = applyAction(walkToStop(), "add-vlan-20");

    // Arriving at the destination, then the authored reply. The last headline
    // is the completion rather than a location, which is the point of it.
    for (const expected of ["The traffic is at PC-B.", "The journey is complete."]) {
      expect(buildPacketJourneyView(completingJourney, state).canAdvance).toBe(
        true
      );
      state = advance(state, completingJourney);
      expect(
        buildPacketJourneyView(completingJourney, state).currentEvent.headline
      ).toBe(expected);
    }
  });

  it("moves the picture on every advance, not only the text", () => {
    // The control is at the bottom now, so the consequence has to be real: the
    // packet column and the change token must both move each time.
    let state = applyAction(walkToStop(), "add-vlan-20");
    const columns: number[] = [];
    const tokens: string[] = [];

    for (let step = 0; step < 3; step += 1) {
      const view = buildPacketJourneyView(completingJourney, state);
      if (view.topology.state !== "available") throw new Error("expected a layout");

      columns.push(view.topology.packet?.column ?? -1);
      tokens.push(view.currentEvent.token);
      state = advance(state, completingJourney);
    }

    // Router-1, then PC-B, then back to PC-A on the authored reply.
    expect(columns).toEqual([1, 2, 0]);
    expect(new Set(tokens).size).toBe(3);
  });

  it("carries a commitment through the whole walk without resetting it", () => {
    let state = commitPrediction(
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      "c1",
      "To its default gateway"
    );

    state = advance(state, completingJourney);
    state = advance(state, completingJourney);
    state = applyAction(state, "add-vlan-20");
    state = advance(state, completingJourney);
    state = advance(state, completingJourney);

    const view = buildPacketJourneyView(completingJourney, state);

    expect(view.stages[0]?.committedPrediction).toBe("To its default gateway");
    expect(state.committedPredictions.c1).toBe("To its default gateway");
    expect(view.textTrace).toContain("You predicted: To its default gateway");
  });

  it("offers nothing to press once the journey is confirmed", () => {
    let state = applyAction(walkToStop(), "add-vlan-20");
    state = advance(state, completingJourney);
    state = advance(state, completingJourney);

    const view = buildPacketJourneyView(completingJourney, state);

    expect(view.canAdvance).toBe(false);
    expect(view.actions.every((action) => !action.available)).toBe(true);
    expect(view.pendingPrediction).toBeNull();
    // The last thing in the reading flow is the authored conclusion.
    expect(view.confirmation).toContain("one interface per network");
  });
});

describe("the drawing and the written account agree", () => {
  it("shows the same devices in the picture and in the listing", () => {
    const view = buildPacketJourneyView(completingJourney, walkToArrival());
    if (view.topology.state !== "available") throw new Error("expected a layout");

    expect(view.topology.devices.map((device) => device.nodeId)).toEqual(
      view.nodes.map((node) => node.nodeId)
    );
  });

  it("shows the same connections in the picture and in the listing", () => {
    const view = buildPacketJourneyView(completingJourney, walkToArrival());
    if (view.topology.state !== "available") throw new Error("expected a layout");

    expect(view.topology.links.map((link) => link.linkId)).toEqual(
      view.links.map((link) => link.linkId)
    );

    for (const link of view.links) {
      expect(link.endpointSummary).toBeDefined();
    }
  });

  it("highlights the connection the current event names", () => {
    const view = buildPacketJourneyView(completingJourney, walkToStop());
    if (view.topology.state !== "available") throw new Error("expected a layout");

    const current = view.topology.links.find((link) => link.current);

    expect(current?.endpointSummary).toBe(view.currentEvent.via);
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

  it("names every link by both devices AND both ports", () => {
    // Founder UAT: a bulleted list of authored link labels left a learner
    // unable to say what PC-A was plugged into. The endpoints are resolved
    // once, and the same resolution feeds the drawing and this list.
    const view = buildPacketJourneyView(journey, walkToFailure());

    expect(view.links).toEqual([
      {
        linkId: "link-a",
        label: "PC-A to Router-1",
        endpointSummary: "PC-A eth0 to Router-1 Gi0/0.10",
        current: true,
        traversed: true
      }
    ]);
  });

  it("marks the crossed link from the authored field, not from adjacency", () => {
    // Before the traffic reaches the stage that names the link, the link is
    // neither current nor traversed — even though the two devices it joins are
    // drawn next to each other. Adjacency is not traversal.
    const early = buildPacketJourneyView(
      journey,
      advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, journey)
    );

    expect(early.links[0]?.current).toBe(false);
    expect(early.links[0]?.traversed).toBe(false);
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
