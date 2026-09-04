import { describe, expect, it } from "vitest";
import type { LearnerPacketJourneyParameters } from "@tlp/shared-types";
import {
  INITIAL_PACKET_JOURNEY_VIEW_STATE,
  PACKET_JOURNEY_TASK_KINDS,
  advance,
  applyAction,
  buildPacketJourneyView,
  canAdvance,
  commitPrediction,
  describeAdvanceLabel,
  describeRolePurpose,
  describeSourceNotice,
  describeStartInstruction,
  describeStartLabel,
  describeTaskLabel,
  describeUnsupportedInteraction,
  describeWithheldInteraction,
  isTaskActionable,
  pendingPrediction,
  resetJourney,
  resolveCurrentTask,
  resolveNodeJourneyStatus,
  resolveSequencing,
  startJourney,
  type PacketJourneyView,
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

/**
 * The state a learner is in immediately after pressing Start.
 *
 * Every walk below begins here rather than at the initial state, because
 * nothing progresses until the learner has deliberately begun — the same gate
 * that stops an uncommitted prediction being reached around. Tests that are
 * genuinely ABOUT the not-started state keep using
 * `INITIAL_PACKET_JOURNEY_VIEW_STATE`.
 */
const BEGUN: PacketJourneyViewState = startJourney(
  INITIAL_PACKET_JOURNEY_VIEW_STATE
);

/** Walk to the authored failure, committing the prediction on the way. */
function walkToFailure(): PacketJourneyViewState {
  let state = advance(BEGUN, journey);
  state = commitPrediction(state, "s2", "Discard it");
  return advance(state, journey);
}

/* ------------------------------------------------------------------ *
 * The signature sequence
 * ------------------------------------------------------------------ */

describe("the journey starts unrevealed", () => {
  const view = buildPacketJourneyView(journey, BEGUN);

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
    const started = advance(BEGUN, journey);

    expect(pendingPrediction(started, journey)?.stageId).toBe("s2");
    expect(canAdvance(started, journey)).toBe(false);

    // Advancing is refused, not silently allowed.
    expect(advance(started, journey)).toBe(started);
  });

  it("releases the reveal once committed", () => {
    const committed = commitPrediction(
      advance(BEGUN, journey),
      "s2",
      "Discard it"
    );

    expect(pendingPrediction(committed, journey)).toBeNull();
    expect(canAdvance(committed, journey)).toBe(true);
  });

  it("does not let a commitment be revised", () => {
    const first = commitPrediction(
      BEGUN,
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
      pendingPrediction(BEGUN, journey)
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
    BEGUN,
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
      BEGUN
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
      BEGUN,
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
        BEGUN,
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
      BEGUN,
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
    advance(BEGUN, completingJourney),
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

    // The headline names WHAT stopped, in the authored words — not "the
    // traffic", which told a beginner nothing about what had arrived.
    expect(view.currentEvent.headline).toBe(
      "An ICMP echo request stopped at Router-1."
    );
    // The wire that lights up is decorative and hidden, so the connection has
    // to be named in words or the fact exists only in the picture.
    expect(view.currentEvent.via).toBe("PC-A eth0 to Router-1 Gi0/0.10");
    expect(view.announcement).toContain("PC-A eth0 to Router-1 Gi0/0.10");
  });

  it("names no connection for a stage the source did not attribute to one", () => {
    const started = advance(BEGUN, completingJourney);

    expect(buildPacketJourneyView(completingJourney, started).currentEvent.via)
      .toBeNull();
  });

  it("moves the change token on every observable event", () => {
    const tokenOf = (state: PacketJourneyViewState) =>
      buildPacketJourneyView(completingJourney, state).currentEvent.token;

    const start = BEGUN;
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
      BEGUN
    ).currentEvent.token;

    const after = buildPacketJourneyView(
      predictFirstJourney,
      commitPrediction(BEGUN, "s1", "To its default gateway")
    ).currentEvent.token;

    expect(after).not.toBe(before);
  });

  it("walks the kinds through the whole signature sequence", () => {
    const kindOf = (state: PacketJourneyViewState) =>
      buildPacketJourneyView(completingJourney, state).currentEvent.kind;

    const stopped = walkToStop();
    const repaired = applyAction(stopped, "add-vlan-20");
    const arrived = advance(repaired, completingJourney);

    expect(kindOf(BEGUN)).toBe("waiting");
    expect(kindOf(advance(BEGUN, completingJourney)))
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
    let state = BEGUN;
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
    expect(headlines).toContain("An ICMP echo request stopped at Router-1.");
    expect(headlines).toContain("An ICMP echo request reached PC-B.");
    expect(headlines).toContain("An ICMP echo request was delivered to PC-A.");
  });

  it("keeps offering the next step after every advance that has one", () => {
    // The complaint was never that the control vanished — it was where it was.
    // This pins the other half: it must still be there, every time, so that
    // "read, act, read" never breaks.
    let state = applyAction(walkToStop(), "add-vlan-20");

    // Arriving at the destination, then the authored reply. The last headline
    // is the completion rather than a location, which is the point of it.
    for (const expected of [
      "An ICMP echo request reached PC-B.",
      "An ICMP echo request was delivered to PC-A."
    ]) {
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
    // device the marker belongs to, the point it is drawn at and the change
    // token must all move each time.
    let state = applyAction(walkToStop(), "add-vlan-20");
    const nodes: string[] = [];
    const points: string[] = [];
    const tokens: string[] = [];

    for (let step = 0; step < 3; step += 1) {
      const view = buildPacketJourneyView(completingJourney, state);
      if (view.topology.state !== "available") throw new Error("expected a layout");

      nodes.push(view.topology.packets[0]?.nodeId ?? "none");
      points.push(
        `${view.topology.packets[0]?.at.x ?? -1},${view.topology.packets[0]?.at.y ?? -1}`
      );
      tokens.push(view.currentEvent.token);
      state = advance(state, completingJourney);
    }

    // Router-1, then PC-B, then back to PC-A on the authored reply.
    expect(nodes).toEqual(["r-1", "pc-b", "pc-a"]);
    expect(new Set(points).size).toBe(3);
    expect(new Set(tokens).size).toBe(3);
  });

  it("carries a commitment through the whole walk without resetting it", () => {
    let state = commitPrediction(
      BEGUN,
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
      advance(BEGUN, journey)
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
    // All the way back, including the deliberate start. A learner who starts
    // over meets the same orientation and the same Start they met the first
    // time, rather than landing mid-activity.
    expect(resetJourney()).toEqual(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    expect(resetJourney().started).toBe(false);
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
      advance(BEGUN, journey)
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
    const started = advance(BEGUN, challengeMeJourney);

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

/* ------------------------------------------------------------------ *
 * WP-J Module 1 Founder UAT — instructional flow
 *
 * The finding: at a normal viewport the Founder did not know what to do. The
 * first learner action was below the fold, discoverable only by scrolling and
 * comfortable only after zooming out; and once the topology was pinned,
 * scrolling could leave the picture on screen with the control that advances it
 * somewhere else entirely.
 *
 * WHERE something renders is a structural property this repository proves in a
 * gate, on source order. What is proven HERE is the half that is behaviour:
 * that the interaction now NAMES what the learner is looking at and what they
 * should do, that the named task changes as the journey progresses instead of
 * accumulating, and that the orientation does not give away the answer to the
 * question it is introducing.
 * ------------------------------------------------------------------ */

describe("the interaction orients the learner immediately", () => {
  it("names what this is and what to do, before anything is sent", () => {
    const view = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(view.orientation.title.length).toBeGreaterThan(0);
    expect(view.orientation.summary.length).toBeGreaterThan(0);

    // Built from the AUTHORED traffic, so the course's own words say what is
    // moving and where it starts — never a placeholder noun.
    expect(view.orientation.title).toContain(predictFirstJourney.traffic.label);
    expect(view.orientation.summary).toContain(
      predictFirstJourney.traffic.label.slice(1)
    );
    expect(view.orientation.summary).toContain("PC-A");
  });

  it("does not print the answer above the question", () => {
    // `trafficSummary` names the destination — "from PC-A to Router-1" — and it
    // used to sit directly above a prediction asking which device the traffic
    // reaches, with that device among the options. The orientation says what is
    // being sent and from where, and stops there.
    const view = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    const destination = predictFirstJourney.nodes.find(
      (node) => node.nodeId === predictFirstJourney.traffic.destinationNodeId
    );

    expect(destination).toBeDefined();
    expect(view.orientation.summary).not.toContain(destination?.label ?? "");
  });

  it("still identifies teaching mode on screen", () => {
    // DEC-058. The orientation is shorter; the source notice is not one of the
    // things that was shortened away.
    const view = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(view.sourceNotice).toBe(describeSourceNotice("authored_teaching"));
    expect(view.sourceNotice.length).toBeGreaterThan(0);
  });
});

describe("the current task is named, not inferred", () => {
  it("asks for a prediction first when one is authored", () => {
    const view = buildPacketJourneyView(
      predictFirstJourney,
      BEGUN
    );

    expect(view.currentTask.kind).toBe("predict");
    expect(view.currentTask.label).toBe(describeTaskLabel("predict"));
    expect(view.currentTask.actionable).toBe(true);
  });

  it("asks the learner to send once the prediction is committed", () => {
    const committed = commitPrediction(
      BEGUN,
      "s1",
      "To its default gateway"
    );

    const view = buildPacketJourneyView(predictFirstJourney, committed);

    // Nothing has been revealed yet, so the task is to send — named with the
    // first-reveal wording rather than "continue".
    expect(view.currentTask.kind).toBe("send");
    expect(view.canAdvance).toBe(true);
  });

  it("asks for the next prediction once the first one has been observed", () => {
    // The workspace replaces one task with the next rather than showing both.
    let state = commitPrediction(
      BEGUN,
      "s1",
      "To its default gateway"
    );
    state = advance(state, predictFirstJourney);

    expect(
      buildPacketJourneyView(predictFirstJourney, state).currentTask.kind
    ).toBe("predict");
  });

  it("changes to continue once something has been observed", () => {
    const started = advance(BEGUN, completingJourney);

    expect(
      buildPacketJourneyView(completingJourney, BEGUN)
        .currentTask.kind
    ).toBe("send");
    expect(
      buildPacketJourneyView(completingJourney, started).currentTask.kind
    ).toBe("continue");
  });

  it("asks for a repair once the journey has stopped", () => {
    const view = buildPacketJourneyView(completingJourney, walkToStop());

    expect(view.currentTask.kind).toBe("repair");
    expect(view.currentTask.actionable).toBe(true);
    expect(view.actions.some((action) => action.available)).toBe(true);
  });

  it("reports nothing to do once the journey is complete", () => {
    const finished = advance(walkToArrival(), completingJourney);
    const view = buildPacketJourneyView(completingJourney, finished);

    expect(view.currentTask.kind).toBe("finished");
    expect(view.currentTask.actionable).toBe(false);
    expect(view.canAdvance).toBe(false);
  });

  it("says so when the journey stopped and no repair was sent", () => {
    // A protected level withholds the remediation. The learner is told there is
    // nothing to apply rather than meeting a dead end, and the task says the
    // same thing rather than pretending an action exists.
    const withheld: LearnerPacketJourneyParameters = {
      ...completingJourney,
      actions: []
    };

    const stopped = advance(
      advance(BEGUN, withheld),
      withheld
    );

    const view = buildPacketJourneyView(withheld, stopped);

    expect(view.currentTask.kind).toBe("blocked");
    expect(view.currentTask.actionable).toBe(false);
    expect(view.remediationWithheld).not.toBeNull();
  });

  it("holds exactly one task at a time, all the way through", () => {
    // The workspace evolves rather than accumulates. At every point of a
    // complete journey there is exactly one current task, and it is one of the
    // registered kinds — never a set of them, and never none.
    const seen: string[] = [];
    let state = BEGUN;

    for (let step = 0; step < 6; step += 1) {
      const view = buildPacketJourneyView(completingJourney, state);
      seen.push(view.currentTask.kind);

      expect(PACKET_JOURNEY_TASK_KINDS).toContain(view.currentTask.kind);
      expect(view.currentTask.label).toBe(
        describeTaskLabel(view.currentTask.kind)
      );

      state = view.currentTask.kind === "repair"
        ? applyAction(state, "add-vlan-20")
        : advance(state, completingJourney);
    }

    // It moved: send, then continue, then a stop that needs a repair, then on
    // to the end. A task that never changed would mean the workspace was
    // showing a stale instruction.
    expect(seen[0]).toBe("send");
    expect(new Set(seen).size).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe("finished");
  });

  it("names every registered task kind", () => {
    for (const kind of PACKET_JOURNEY_TASK_KINDS) {
      expect(describeTaskLabel(kind).length).toBeGreaterThan(0);
    }

    // No two steps may read identically, or a learner using the words rather
    // than the controls could not tell which step they were on.
    const labels = PACKET_JOURNEY_TASK_KINDS.map(describeTaskLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("task precedence follows the instructional method", () => {
  it("puts starting ahead of everything", () => {
    // Nothing the journey could otherwise offer outranks the first deliberate
    // act. Even with a prediction open and a reveal available, an activity the
    // learner has not begun has exactly one task.
    expect(resolveCurrentTask(false, true, true, true, 0, true)).toBe("start");
  });

  it("puts predicting ahead of revealing, even where the gate is lifted", () => {
    // SHOW ME lifts the commit gate, so a prediction and the reveal are both
    // offered at once. Predicting is still the step that teaches, so it is
    // still the named task.
    expect(resolveCurrentTask(true, true, false, true, 0, false)).toBe("predict");
  });

  it("puts repairing ahead of continuing", () => {
    expect(resolveCurrentTask(true, false, true, false, 2, false)).toBe("repair");
  });

  it("distinguishes the first reveal from every later one", () => {
    expect(resolveCurrentTask(true, false, false, true, 0, false)).toBe("send");
    expect(resolveCurrentTask(true, false, false, true, 1, false)).toBe("continue");
  });

  it("falls to blocked only when a withheld remediation explains it", () => {
    expect(resolveCurrentTask(true, false, false, false, 2, true)).toBe("blocked");
    expect(resolveCurrentTask(true, false, false, false, 2, false)).toBe("finished");
  });

  it("marks exactly the kinds that give the learner something to do", () => {
    expect(isTaskActionable("predict")).toBe(true);
    expect(isTaskActionable("send")).toBe(true);
    expect(isTaskActionable("continue")).toBe(true);
    expect(isTaskActionable("repair")).toBe(true);
    expect(isTaskActionable("blocked")).toBe(false);
    expect(isTaskActionable("finished")).toBe(false);
  });
});

describe("the reference material survives the new hierarchy", () => {
  it("still carries every connection, device and trace line", () => {
    // Progressive disclosure means quieter, never deleted. The Founder asked
    // for the detail to remain available; this is the half of that promise a
    // test can hold.
    const view = buildPacketJourneyView(completingJourney, walkToArrival());

    expect(view.links.length).toBe(completingJourney.links.length);
    expect(view.nodes.length).toBe(completingJourney.nodes.length);
    expect(view.textTrace.length).toBeGreaterThan(0);
    expect(view.trafficSummary.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * WP-J Module 1 Founder UAT — the deliberate start
 *
 * "the layout should be side by side … This would include an obvious start
 * button as well."
 *
 * The composition half of that is structural and is pinned in the gate, on
 * source order. What is proven here is the STATE half: that an activity does
 * not begin merely because a component rendered, that nothing progresses until
 * the learner says so, that starting reveals no answer, and that starting is
 * engagement rather than evidence.
 * ------------------------------------------------------------------ */

describe("an activity does not begin until the learner begins it", () => {
  it("starts in a deliberate not-started state", () => {
    const view = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(INITIAL_PACKET_JOURNEY_VIEW_STATE.started).toBe(false);
    expect(view.currentTask.kind).toBe("start");
    expect(view.currentTask.label).toBe(describeTaskLabel("start"));
    expect(view.currentTask.actionable).toBe(true);
  });

  it("offers exactly one primary control before anything else", () => {
    const view = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(view.startAction).not.toBeNull();
    expect(view.startAction?.label).toBe(describeStartLabel());
    expect(view.startAction?.instruction).toBe(
      describeStartInstruction(predictFirstJourney.traffic.label)
    );

    // It names what will move, in the AUTHORED words. "predict what happens"
    // told a beginner nothing; naming the thing is the whole correction.
    expect(view.startAction?.instruction).toContain(
      predictFirstJourney.traffic.label
    );

    // And nothing else to press. No reveal, no prediction, no remediation —
    // one obvious action, which is the whole point of the state.
    expect(view.canAdvance).toBe(false);
    expect(view.pendingPrediction).toBeNull();
    expect(view.actions.every((action) => !action.available)).toBe(true);
  });

  it("refuses to progress until it is started", () => {
    // Not merely undrawn. The state machine refuses, through the same gate
    // that refuses an uncommitted prediction.
    expect(canAdvance(INITIAL_PACKET_JOURNEY_VIEW_STATE, completingJourney))
      .toBe(false);
    expect(advance(INITIAL_PACKET_JOURNEY_VIEW_STATE, completingJourney))
      .toBe(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    expect(
      buildPacketJourneyView(
        completingJourney,
        INITIAL_PACKET_JOURNEY_VIEW_STATE
      ).stages
    ).toEqual([]);
  });

  it("reveals no answer before the learner begins", () => {
    const view = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    const serialised = JSON.stringify({
      orientation: view.orientation,
      startAction: view.startAction,
      currentTask: view.currentTask
    });

    // Nothing the learner is about to be asked to predict may appear in what
    // they can read before they start: not the options, not the destination,
    // and not the first authored narration.
    const prediction = predictFirstJourney.stages[0]?.prediction;
    for (const option of prediction?.options ?? []) {
      expect(serialised).not.toContain(option);
    }
    expect(serialised).not.toContain(predictFirstJourney.stages[0]?.narration);
    expect(serialised).not.toContain("Router-1");
  });

  it("starts on request, and only then offers the first step", () => {
    const started = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    const view = buildPacketJourneyView(predictFirstJourney, started);

    expect(started.started).toBe(true);
    expect(view.startAction).toBeNull();
    expect(view.currentTask.kind).toBe("predict");
    expect(view.pendingPrediction).not.toBeNull();
  });

  it("starting reveals nothing by itself", () => {
    // It releases the controls. It does not move the traffic, commit a
    // prediction or apply a remediation.
    const started = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);

    expect(started.progress.revealedStageCount).toBe(0);
    expect(started.progress.appliedActionId).toBeNull();
    expect(started.committedPredictions).toEqual({});
    expect(
      buildPacketJourneyView(predictFirstJourney, started).stages
    ).toEqual([]);
  });

  it("is idempotent", () => {
    const once = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    expect(startJourney(once)).toBe(once);
  });

  it("produces no competency, evidence, score or progress", () => {
    // Engagement, and nothing else. Starting a teaching interaction cannot
    // contribute to a competency claim, and there is no field here that could
    // carry one.
    const started = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    const serialised = JSON.stringify(started);

    for (const forbidden of [
      "competency",
      "evidence",
      "score",
      "passed",
      "attempt",
      "lab",
      "session",
      "published"
    ]) {
      expect(serialised.toLowerCase()).not.toContain(forbidden);
    }

    expect(Object.keys(started).sort()).toEqual([
      "committedPredictions",
      "progress",
      "started"
    ]);
  });

  it("keeps the environment readable and described before the start", () => {
    // The learner must be able to see enough of the environment to understand
    // what the activity concerns. The topology and its accessible description
    // are both present before anything is pressed.
    const view = buildPacketJourneyView(
      predictFirstJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(view.topology.state).toBe("available");
    if (view.topology.state !== "available") return;

    expect(view.topology.devices.length).toBe(predictFirstJourney.nodes.length);
    expect(view.topology.description.length).toBeGreaterThan(0);
  });

  it("still identifies teaching mode before the start", () => {
    expect(
      buildPacketJourneyView(
        predictFirstJourney,
        INITIAL_PACKET_JOURNEY_VIEW_STATE
      ).sourceNotice
    ).toBe(describeSourceNotice("authored_teaching"));
  });

  it("runs the whole sequence once started", () => {
    // ORIENT -> START -> PREDICT -> SEND -> OBSERVE -> ... -> FINISH, through
    // the existing state and nothing else.
    const seen: string[] = [];
    let state: PacketJourneyViewState = INITIAL_PACKET_JOURNEY_VIEW_STATE;

    for (let step = 0; step < 7; step += 1) {
      const view = buildPacketJourneyView(completingJourney, state);
      seen.push(view.currentTask.kind);

      state =
        view.currentTask.kind === "start"
          ? startJourney(state)
          : view.currentTask.kind === "repair"
            ? applyAction(state, "add-vlan-20")
            : advance(state, completingJourney);
    }

    expect(seen[0]).toBe("start");
    expect(seen[1]).toBe("send");
    expect(seen[seen.length - 1]).toBe("finished");
  });
});

/* ------------------------------------------------------------------ *
 * WP-J Module 1 Founder UAT — completion confirmation
 *
 * The finding: the walkthrough modelled someone printing a document and then
 * stopped halfway, at the switch. The learner was told an intermediate step was
 * correct and sent away to Mission 2.
 *
 * The principle this formalises: where instruction models a real-world goal,
 * the modelled system should visibly REACH that goal, and say so.
 *
 *   ACTION -> VISIBLE CONSEQUENCE -> PROGRESSION -> GOAL REACHED -> CONFIRMATION
 *
 * These tests pin the presentation half: that a journey with no fault can now
 * reach its authored conclusion at all, that the success state is distinct from
 * being in transit, and that success is carried in WORDS rather than by a
 * colour the drawing happens to use.
 * ------------------------------------------------------------------ */

/** Three stages, no fault, no remediation — the shape Module 1 authors. */
const deliveryJourney: LearnerPacketJourneyParameters = {
  ...journey,
  traffic: {
    label: "the print request",
    sourceNodeId: "pc-a",
    destinationNodeId: "r-1",
    startActionLabel: "Send the print request"
  },
  stages: [
    {
      stageId: "d1",
      atNodeId: "pc-a",
      narration: "The print request leaves PC-A.",
      outcome: "proceeds",
      prediction: {
        prompt: "Which device does the print request reach first?",
        options: ["Router-1", "PC-A"]
      }
    },
    {
      stageId: "d2",
      atNodeId: "r-1",
      narration: "The print request arrives at Router-1.",
      decision: "Continue to see where it goes next.",
      outcome: "proceeds",
      viaLinkId: "link-a"
    }
  ],
  fault: undefined,
  actions: [],
  confirmation: {
    narration: "The print request reached Router-1 and was accepted.",
    summary: "You followed one request from its source to its destination."
  }
};

function walkDelivery(): PacketJourneyViewState {
  let state = commitPrediction(BEGUN, "d1", "Router-1");
  state = advance(state, deliveryJourney);
  return advance(state, deliveryJourney);
}

describe("a journey that authors no fault can still be completed", () => {
  it("reaches the authored conclusion when every stage is revealed", () => {
    // The defect: completion used to require a repaired fault, so a
    // walkthrough with nothing to repair could never confirm. Module 1 is
    // exactly that walkthrough, which is why it appeared to stop rather than
    // to succeed.
    const view = buildPacketJourneyView(deliveryJourney, walkDelivery());

    expect(view.finished).toBe(true);
    expect(view.currentEvent.kind).toBe("confirmed");
    expect(view.confirmation).toBe(deliveryJourney.confirmation?.summary);
  });

  it("still refuses to confirm a fault journey that was never repaired", () => {
    // The condition that was removed was redundant, never load-bearing: a
    // stop point still blocks the reveal until the authored repair is applied,
    // so an unrepaired journey cannot reach its last stage at all.
    const stopped = walkToStop();
    const view = buildPacketJourneyView(completingJourney, stopped);

    expect(view.currentEvent.kind).toBe("stopped");
    expect(view.finished).toBe(false);
    expect(view.confirmation).toBeNull();
  });

  it("says nothing was confirmed when the level withheld the conclusion", () => {
    // At a protected level the authored conclusion is absent from the payload.
    // The honest state is that the journey is proceeding — not a confirmation
    // with no words to show.
    const withheld: LearnerPacketJourneyParameters = {
      ...deliveryJourney,
      confirmation: undefined
    };

    const view = buildPacketJourneyView(withheld, walkDelivery());

    expect(view.currentEvent.kind).not.toBe("confirmed");
    expect(view.confirmation).toBeNull();
  });
});

describe("successful delivery is stated, never only coloured", () => {
  it("names what was delivered and where, in words", () => {
    const view = buildPacketJourneyView(deliveryJourney, walkDelivery());

    expect(view.currentEvent.headline).toBe(
      "The print request was delivered to Router-1."
    );
    expect(view.currentEvent.headline).toContain(
      deliveryJourney.traffic.label.slice(4)
    );
  });

  it("reads differently from being in transit", () => {
    // Requirement: the successful state must differ from the moving state.
    // A learner who cannot see the colour change reads two different
    // sentences.
    let state = commitPrediction(BEGUN, "d1", "Router-1");
    state = advance(state, deliveryJourney);

    const inTransit = buildPacketJourneyView(deliveryJourney, state);
    const delivered = buildPacketJourneyView(deliveryJourney, walkDelivery());

    expect(inTransit.currentEvent.kind).toBe("moving");
    expect(delivered.currentEvent.kind).toBe("confirmed");
    expect(inTransit.currentEvent.headline).not.toBe(
      delivered.currentEvent.headline
    );
  });

  it("marks the destination device as delivered, in words", () => {
    const view = buildPacketJourneyView(deliveryJourney, walkDelivery());
    if (view.topology.state !== "available") throw new Error("expected a layout");

    const destination = view.topology.devices.find(
      (device) => device.nodeId === "r-1"
    );

    expect(destination?.state).toBe("confirmed");
    expect(destination?.stateLabel).toBe("Delivered here");

    // And it is the ONLY device in that state — success belongs to the device
    // the journey completed at, not to every device it passed.
    expect(
      view.topology.devices.filter((device) => device.state === "confirmed")
    ).toHaveLength(1);
  });

  it("moves the marker to the delivered state as well", () => {
    const view = buildPacketJourneyView(deliveryJourney, walkDelivery());
    if (view.topology.state !== "available") throw new Error("expected a layout");

    expect(view.topology.packets).toHaveLength(1);
    expect(view.topology.packets[0]?.state).toBe("confirmed");
    expect(view.topology.packets[0]?.stateLabel).toBe("Arrived");
  });

  it("carries the completion in the accessible account too", () => {
    // Reduced motion, screen readers and the text trace all read the same
    // completion: nothing about success depends on seeing the marker change.
    const view = buildPacketJourneyView(deliveryJourney, walkDelivery());

    expect(view.announcement.length).toBeGreaterThan(0);
    expect(view.textTrace.join(" ")).toContain("Router-1");
    expect(view.confirmation).not.toBeNull();
  });
});

/* ------------------------------------------------------------------------ *
   WP-J Module 1, Founder UAT — device inspection.

   Two defects. Selecting a device dumped every interface and attribute at a
   beginner who had asked a much smaller question, and the journey status it
   showed said "Not reached yet" on devices the print request never goes near,
   which reads as an instruction to wait for an arrival that is never coming.

   These prove the parts that must not drift. Whether the resulting panel is
   calm and well written is Human UAT's to judge, so nothing here pins prose
   the reviewer is the authority on.
 * ------------------------------------------------------------------------ */

/** The delivery journey, plus a device no stage ever names. */
const inspectionJourney: LearnerPacketJourneyParameters = {
  ...deliveryJourney,
  nodes: [
    ...deliveryJourney.nodes,
    {
      nodeId: "pc-b",
      label: "PC-B",
      role: "host",
      about: "PC-B is a second computer on this network.",
      interfaces: [
        {
          interfaceId: "pc-b-eth0",
          label: "eth0",
          attributes: [{ label: "Connects to", value: "Switch-1, port 2" }]
        }
      ]
    }
  ]
};

function nodeOf(view: PacketJourneyView, nodeId: string) {
  const node = view.nodes.find((entry) => entry.nodeId === nodeId);
  if (node === undefined) throw new Error(`no node view for ${nodeId}`);
  return node;
}

function walkInspection(): PacketJourneyViewState {
  let state = commitPrediction(BEGUN, "d1", "Router-1");
  state = advance(state, inspectionJourney);
  return advance(state, inspectionJourney);
}

describe("device inspection answers what a device is before what it holds", () => {
  it("derives the category sentence from the authored role, and only that", () => {
    // The one half of "what is this?" that is safe to derive: a property of
    // the category the author already declared, not of this device.
    expect(describeRolePurpose("router")).toContain("router");
    expect(describeRolePurpose("switch")).toContain("switch");
    expect(describeRolePurpose("host")).toContain("host");
    expect(describeRolePurpose("printer")).toContain("printer");
  });

  it("invents nothing for a role it has no sentence for", () => {
    // Silence, not a filler sentence. A learner reads the category word, the
    // connections and the journey status, none of which were made up.
    expect(describeRolePurpose("firewall")).toBeUndefined();
  });

  it("does not teach the mechanism a later mission owns", () => {
    // The router sentence may say what a router is FOR, because a learner who
    // sees one in Mission 1 can reasonably ask. How it decides anything is
    // Mission 5's, and device inspection must not become a second curriculum
    // running out of order.
    const purpose = describeRolePurpose("router") ?? "";

    for (const deferred of [
      "routing table",
      "forwarding table",
      "default gateway",
      "subnet",
      "prefix",
      "ARP",
      "MAC",
      "broadcast"
    ]) {
      expect(purpose.toLowerCase()).not.toContain(deferred.toLowerCase());
    }
  });

  it("carries authored scenario prose through unchanged", () => {
    const view = buildPacketJourneyView(inspectionJourney, BEGUN);

    expect(nodeOf(view, "pc-b").about).toBe(
      "PC-B is a second computer on this network."
    );
  });

  it("says nothing where the author wrote no explanation", () => {
    // Absence is a fact, not a gap to fill. Nothing composes an explanation
    // out of the role, the connections or the label.
    const view = buildPacketJourneyView(inspectionJourney, BEGUN);

    expect(nodeOf(view, "pc-a").about).toBeUndefined();
  });

  it("still carries every interface and attribute for the disclosure", () => {
    // Simplifying the default view must not delete anything from the model.
    // The technical detail is one interaction away, not gone.
    const view = buildPacketJourneyView(inspectionJourney, BEGUN);
    const pcA = nodeOf(view, "pc-a");

    expect(pcA.interfaces).toHaveLength(1);
    expect(pcA.interfaces[0]?.attributes.map((a) => a.label)).toEqual([
      "IP address",
      "VLAN"
    ]);
  });
});

describe("journey status separates what was observed from what was never used", () => {
  it("claims nothing before the learner sends anything", () => {
    const view = buildPacketJourneyView(
      inspectionJourney,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    for (const node of view.nodes) {
      expect(node.journeyStatus.kind).toBe("not-started");
    }
  });

  it("never says a device is off the path while the journey is still running", () => {
    // The whole point of the distinction. Mid-journey, absence from the
    // revealed stages means "not seen yet" and nothing stronger.
    const running = advance(commitPrediction(BEGUN, "d1", "Router-1"), inspectionJourney);
    const view = buildPacketJourneyView(inspectionJourney, running);

    expect(nodeOf(view, "pc-b").journeyStatus.kind).toBe("not-yet");
    expect(nodeOf(view, "pc-b").journeyStatus.label.toLowerCase()).not.toContain(
      "not part of"
    );
  });

  it("does not read unrevealed stages to answer early", () => {
    // One stage revealed, one still to come. Router-1 is authored as that
    // next arrival, and its `atNodeId` is sitting in the model right now
    // marked unknown. Reading it would answer the learner's question a step
    // early — and, on a stage carrying a prediction, hand over the answer.
    const running = advance(commitPrediction(BEGUN, "d1", "Router-1"), inspectionJourney);
    const view = buildPacketJourneyView(inspectionJourney, running);

    expect(nodeOf(view, "r-1").journeyStatus.kind).toBe("not-yet");
  });

  it("reports where the request is while it is still moving", () => {
    const running = advance(commitPrediction(BEGUN, "d1", "Router-1"), inspectionJourney);
    const view = buildPacketJourneyView(inspectionJourney, running);

    expect(nodeOf(view, "pc-a").journeyStatus.kind).toBe("here-now");
  });

  it("names the device the completed journey ended at as delivered", () => {
    const view = buildPacketJourneyView(inspectionJourney, walkInspection());

    expect(nodeOf(view, "r-1").journeyStatus.kind).toBe("delivered");
    expect(nodeOf(view, "r-1").journeyStatus.label).toMatch(/delivered/i);
  });

  it("names a device the journey crossed as passed through", () => {
    const view = buildPacketJourneyView(inspectionJourney, walkInspection());

    expect(nodeOf(view, "pc-a").journeyStatus.kind).toBe("passed-through");
  });

  it("only once the journey is complete calls an unused device off the path", () => {
    // Authored completion is what makes this sayable: no further stage will
    // ever be revealed, so a device that never appeared is a device this
    // journey never used. That is a fact about the finished authored path,
    // not a deduction about networking.
    const view = buildPacketJourneyView(inspectionJourney, walkInspection());
    const status = nodeOf(view, "pc-b").journeyStatus;

    expect(status.kind).toBe("off-path");
    expect(status.label).toContain(inspectionJourney.traffic.label);
  });

  it("retires the ambiguous wording entirely", () => {
    // Founder UAT: "Not reached yet" sounds like an instruction to wait.
    for (const state of [
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      BEGUN,
      walkInspection()
    ]) {
      const view = buildPacketJourneyView(inspectionJourney, state);
      for (const node of view.nodes) {
        expect(node.journeyStatus.label).not.toContain("Not reached yet");
      }
    }
  });

  it("reports an authored stop at the device it stopped at", () => {
    expect(
      resolveNodeJourneyStatus({
        nodeId: "sw-1",
        revealedNodeIds: ["pc-a", "sw-1"],
        confirmed: false,
        stopped: true,
        trafficLabel: "the print request"
      }).kind
    ).toBe("stopped");
  });

  it("decides participation from stages alone, never from roles or labels", () => {
    // The structural guarantee. Rewrite what every device IS and what it is
    // CALLED, leave the authored stages untouched, and every status must be
    // identical — because nothing consulted the things that changed.
    const renamed: LearnerPacketJourneyParameters = {
      ...inspectionJourney,
      nodes: inspectionJourney.nodes.map((node) => ({
        ...node,
        label: `${node.label} (renamed)`,
        role: "switch" as const
      }))
    };

    const before = buildPacketJourneyView(inspectionJourney, walkInspection());
    const after = buildPacketJourneyView(renamed, walkInspection());

    expect(after.nodes.map((n) => n.journeyStatus.kind)).toEqual(
      before.nodes.map((n) => n.journeyStatus.kind)
    );
  });

  it("decides participation without walking a single link", () => {
    // Remove the topology's connections entirely. The journey is authored
    // stages, so the answers cannot change — if they did, something was
    // traversing the graph.
    const unlinked: LearnerPacketJourneyParameters = {
      ...inspectionJourney,
      links: []
    };

    const before = buildPacketJourneyView(inspectionJourney, walkInspection());
    const after = buildPacketJourneyView(unlinked, walkInspection());

    expect(after.nodes.map((n) => n.journeyStatus.kind)).toEqual(
      before.nodes.map((n) => n.journeyStatus.kind)
    );
  });
});

describe("inspecting a device is not progress", () => {
  it("has nowhere to record a selection, so it cannot be evidence", () => {
    // Which device is selected lives in component state and never enters the
    // journey's state. That is what keeps inspection free: it cannot advance
    // a stage, satisfy a prediction, apply an action or produce a result.
    expect(Object.keys(INITIAL_PACKET_JOURNEY_VIEW_STATE).sort()).toEqual([
      "committedPredictions",
      "progress",
      "started"
    ]);
  });

  it("derives every node view from the same state the journey already had", () => {
    const first = buildPacketJourneyView(inspectionJourney, BEGUN);
    const second = buildPacketJourneyView(inspectionJourney, BEGUN);

    expect(second.nodes).toEqual(first.nodes);
    expect(second.currentTask).toEqual(first.currentTask);
    expect(second.stages).toEqual(first.stages);
  });
});

/* ------------------------------------------------------------------------ *
   WP-J3 Mission 2 — authored learned state.

   Mission 2's whole point is that a switch comes to know something it did not
   know before. A learner who has to be TOLD that in prose, once, as it scrolls
   past, has been told the point of the mission; a learner who watches a record
   gain a row has been shown it.

   The state is AUTHORED at every stage. Nothing accumulates, nothing is
   derived from traffic, and carrying a fact forward means authoring it again.
 * ------------------------------------------------------------------------ */

const learningJourney: LearnerPacketJourneyParameters = {
  ...journey,
  traffic: {
    label: "the file PC-A is sending",
    sourceNodeId: "pc-a",
    destinationNodeId: "r-1",
    startActionLabel: "Send the file"
  },
  stages: [
    {
      stageId: "k1",
      atNodeId: "pc-a",
      narration: "PC-A sends the file.",
      outcome: "proceeds"
    },
    {
      stageId: "k2",
      atNodeId: "r-1",
      narration: "It arrives, and copies leave on every other connection.",
      outcome: "proceeds",
      viaLinkId: "link-a",
      deviceFacts: [
        {
          nodeId: "r-1",
          label: "What Router-1 knows",
          facts: [{ label: "PC-A", value: "Port 1" }]
        }
      ]
    },
    {
      stageId: "k3",
      atNodeId: "pc-a",
      narration: "The reply comes back.",
      outcome: "proceeds",
      viaLinkId: "link-a",
      deviceFacts: [
        {
          nodeId: "r-1",
          label: "What Router-1 knows",
          facts: [
            { label: "PC-A", value: "Port 1" },
            { label: "PC-B", value: "Port 2" }
          ]
        }
      ]
    }
  ],
  fault: undefined,
  actions: [],
  confirmation: {
    narration: "The file arrived.",
    summary: "One delivery, followed end to end."
  }
};

function walkLearning(steps: number): PacketJourneyViewState {
  let state = BEGUN;
  for (let step = 0; step < steps; step += 1) {
    state = advance(state, learningJourney);
  }
  return state;
}

describe("what a device knows is authored, and visibly changes", () => {
  it("shows nothing before a stage that authors something", () => {
    const view = buildPacketJourneyView(learningJourney, walkLearning(1));

    expect(view.deviceFacts).toEqual([]);
  });

  it("shows the authored record once a stage carries one", () => {
    const view = buildPacketJourneyView(learningJourney, walkLearning(2));

    expect(view.deviceFacts).toHaveLength(1);
    expect(view.deviceFacts[0]?.label).toBe("What Router-1 knows");
    expect(view.deviceFacts[0]?.facts).toEqual([
      { label: "PC-A", value: "Port 1" }
    ]);
  });

  it("gains the second entry only at the stage that authors it", () => {
    // The teaching moment: the learner watches a row appear. It appears
    // because the author wrote it on that stage, not because anything
    // worked out that a reply had been seen.
    const view = buildPacketJourneyView(learningJourney, walkLearning(3));

    expect(view.deviceFacts[0]?.facts.map((fact) => fact.label)).toEqual([
      "PC-A",
      "PC-B"
    ]);
  });

  it("never accumulates a fact the current stage does not author", () => {
    // The guarantee that keeps authority with the author. A stage that
    // authors nothing shows nothing, even when an earlier stage showed
    // something — a presentation that carried state forward would be
    // deciding what a device knows.
    const forgetful: LearnerPacketJourneyParameters = {
      ...learningJourney,
      stages: [
        learningJourney.stages[0]!,
        learningJourney.stages[1]!,
        { ...learningJourney.stages[2]!, deviceFacts: undefined }
      ]
    };

    let state = BEGUN;
    for (let step = 0; step < 3; step += 1) state = advance(state, forgetful);

    expect(buildPacketJourneyView(forgetful, state).deviceFacts).toEqual([]);
  });

  it("resolves the device's own name, so a caption never shows an identifier", () => {
    const view = buildPacketJourneyView(learningJourney, walkLearning(2));

    expect(view.deviceFacts[0]?.nodeId).toBe("r-1");
    expect(view.deviceFacts[0]?.nodeLabel).toBe("Router-1");
  });

  it("offers the same authored values to the device inspector", () => {
    // One resolution feeding both surfaces, so the Instructor pane and the
    // inspector cannot drift apart or disagree.
    const view = buildPacketJourneyView(learningJourney, walkLearning(2));
    const router = view.nodes.find((node) => node.nodeId === "r-1");
    const other = view.nodes.find((node) => node.nodeId === "pc-a");

    expect(router?.shownFacts).toEqual(view.deviceFacts[0]);
    expect(other?.shownFacts).toBeUndefined();
  });

  it("adds nothing to journey state, so reading a record is not progress", () => {
    // Watching what a device knows cannot advance a stage, satisfy a
    // prediction or produce a result. There is nowhere to record that it was
    // read.
    const before = buildPacketJourneyView(learningJourney, walkLearning(2));
    const after = buildPacketJourneyView(learningJourney, walkLearning(2));

    expect(after.deviceFacts).toEqual(before.deviceFacts);
    expect(after.currentTask).toEqual(before.currentTask);
  });
});

describe("simultaneous authored traffic reaches the drawing", () => {
  it("draws one marker per authored link, all at the same device", () => {
    const flooding: LearnerPacketJourneyParameters = {
      ...learningJourney,
      stages: [
        learningJourney.stages[0]!,
        {
          ...learningJourney.stages[1]!,
          alsoOnLinkIds: ["link-b"]
        }
      ],
      links: [
        ...journey.links,
        {
          linkId: "link-b",
          label: "PC-B to Router-1",
          endpoints: ["pc-b-eth0", "r-1-gi0-0-10"]
        }
      ],
      nodes: [
        ...journey.nodes,
        {
          nodeId: "pc-b",
          label: "PC-B",
          role: "host",
          interfaces: [
            { interfaceId: "pc-b-eth0", label: "eth0", attributes: [] }
          ]
        }
      ]
    };

    let state = BEGUN;
    for (let step = 0; step < 2; step += 1) state = advance(state, flooding);

    const view = buildPacketJourneyView(flooding, state);
    if (view.topology.state !== "available") throw new Error("expected a layout");

    expect(view.topology.packets).toHaveLength(2);
    expect(
      new Set(view.topology.packets.map((marker) => marker.nodeId))
    ).toEqual(new Set(["r-1"]));
    expect(
      view.topology.packets.map((marker) => marker.linkId).sort()
    ).toEqual(["link-a", "link-b"]);
  });
});
