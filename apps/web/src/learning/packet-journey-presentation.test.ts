import { describe, expect, it } from "vitest";
import {
  buildPacketJourneyObservationModel,
  parseCurriculumDocument,
  type LearnerPacketJourneyParameters
} from "@tlp/shared-types";
import networkingFoundations from "../../../../content/curriculum/networking-foundations.json";
import {
  buildTopologyLayout,
  describeDeviceState
} from "./topology-layout";
import {
  INITIAL_PACKET_JOURNEY_VIEW_STATE,
  JOURNEY_BEAT_KINDS,
  PACKET_JOURNEY_TASK_KINDS,
  activeJourneyBeat,
  advance,
  answerKnowledgeCheck,
  applyAction,
  buildPacketJourneyView,
  canAdvance,
  commitPrediction,
  describeAdvanceLabel,
  describeEventHeadline,
  describeFinishActivityLabel,
  describeRolePurpose,
  describeSourceNotice,
  describeStartInstruction,
  describeStartLabel,
  describeWorkspaceCollapseLabel,
  describeWorkspaceExpandLabel,
  describeTaskLabel,
  describeUnsupportedInteraction,
  describeWithheldInteraction,
  isTaskActionable,
  pendingPrediction,
  resetJourney,
  resolveJourneyBeats,
  type JourneyBeat,
  resolveCurrentTask,
  resolveEffectiveTraffic,
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

/**
 * The state after revealing `count` stages, committing whatever is asked on
 * the way. Used by the DEC-066 agreement suites, which have to look at every
 * point of the journey rather than only its ends.
 */
function revealTo(count: number): PacketJourneyViewState {
  let state = BEGUN;

  for (let step = 0; step < count; step += 1) {
    const pending = buildPacketJourneyView(journey, state, "commit_first")
      .pendingPrediction;

    if (pending !== null) {
      state = commitPrediction(state, pending.stageId, pending.options[0] ?? "");
    }

    state = advance(state, journey);
  }

  return state;
}

/** The state in which a prediction is being asked and not yet answered. */
function atPrediction(): PacketJourneyViewState {
  let state = BEGUN;

  for (let step = 0; step < journey.stages.length; step += 1) {
    if (buildPacketJourneyView(journey, state, "commit_first").pendingPrediction !== null) {
      return state;
    }
    state = advance(state, journey);
  }

  throw new Error("the fixture asks for no prediction");
}

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

  it("labels the first reveal with what it will actually do", () => {
    // It used to read "Start", which is what a control that restarts something
    // reads like, so the authored action label replaced it. Founder UAT then
    // found the opposite failure: the authored label promises a send, and the
    // first stage of this fixture crosses no connection, so nothing is sent.
    //
    // The label is now read from the stage the press reveals. Both halves are
    // asserted, so this is a rule rather than a ban on one word.
    const sends = predictFirstJourney.stages[0]?.viaLinkId !== undefined;
    const label = describeAdvanceLabel(committed, predictFirstJourney);

    expect(label).toBe(
      buildPacketJourneyView(predictFirstJourney, committed).advanceLabel
    );

    if (sends) {
      expect(label).toBe("Send the ping from PC-A");
    } else {
      expect(label.toLowerCase()).not.toContain("send");
      expect(label).toContain("PC-A");
    }
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

  it("never grades a prediction the mission left ungraded", () => {
    /*
      Narrowed in the Mission 8 refinement, on a Founder ruling.

      This used to search the whole serialised view for the WORD "correct", on
      the reasoning that the contract had no answer key at all so nothing could
      grade. A prediction may now carry an optional one — but only where the
      course has already taught the learner to work the answer out.

      `predictFirstJourney` authors none, which is the ordinary case, so this
      still asserts what it always did: an ungraded prediction produces no
      verdict of any kind.
    */
    const view = buildPacketJourneyView(
      predictFirstJourney,
      advance(committed, predictFirstJourney)
    );

    expect(
      predictFirstJourney.stages[0]?.prediction?.correctOption
    ).toBeUndefined();
    expect(view.resolvedPrediction?.correct).toBeNull();
    expect(view.resolvedPrediction?.correctOption).toBeNull();

    const beat = resolveJourneyBeats(view).find(
      (candidate) => candidate.kind === "feedback"
    );

    expect(beat?.heading).toBe("Your prediction");
    expect(beat?.body.join(" ")).not.toContain("expected answer");
  });

  it("produces no score or evidence even where a prediction IS graded", () => {
    // The optional answer tells a learner whether their model was right. It is
    // not an assessment, and nothing about it may start behaving like one.
    const graded: LearnerPacketJourneyParameters = {
      ...predictFirstJourney,
      stages: predictFirstJourney.stages.map((stage, index) =>
        index === 0 && stage.prediction !== undefined
          ? {
              ...stage,
              prediction: {
                ...stage.prediction,
                correctOption: stage.prediction.options[0] ?? ""
              }
            }
          : stage
      )
    };

    const state = advance(committed, graded);
    const view = buildPacketJourneyView(graded, state);

    // The verdict is a boolean the pane reads, and it is derived on every
    // render. Nothing about it is written into learner state.
    expect(typeof view.resolvedPrediction?.correct).toBe("boolean");

    const recorded = JSON.stringify(state).toLowerCase();

    for (const forbidden of [
      "score",
      "streak",
      "grade",
      "mastery",
      "evidence",
      "competency",
      "correct"
    ]) {
      expect(`recorded ${forbidden}: ${recorded.includes(forbidden)}`).toBe(
        `recorded ${forbidden}: false`
      );
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

    /*
      The announcement names WHERE the traffic is; the beat card carries the
      narration. It used to carry both, which put the same paragraph in the
      live region and in the card directly beneath it — the Founder UAT defect
      on Mission 8's PC-A screen.
    */
    expect(view.announcement).toContain("At PC-B");
    expect(view.announcement).not.toContain("PC-B received the request.");
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

    /*
      The AUTHORED confirmation is the card's, and it is still reachable —
      asserted directly above. The live region says the three things it says
      everywhere else: where, what moved, what changed.

      It used to return the authored narration verbatim, which announced the
      mission's closing teaching a second time immediately above the card
      showing it. Founder video UAT found the duplication on Mission 1.
    */
    expect(view.announcement).toContain("was delivered.");
    expect(view.announcement).not.toContain("reply returns");
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

  it("moves the token when a knowledge check is answered and nothing else changes", () => {
    /*
      The counterpart of the test above, and it was missing.

      `PacketJourney` shows ONE beat at a time and resets its cursor when this
      token moves. Answering a check is an observable change -- it splices a
      feedback beat in at the FRONT of the list, shifting every later beat one
      place -- so a token that ignored answers left the cursor pointing at
      whatever now sat one position earlier. Founder UAT met that as Mission
      2's source-learning check answering itself with the flooding
      explanation.
    */
    const before = buildPacketJourneyView(
      checkedJourney,
      walkToCheck()
    ).currentEvent.token;

    const after = buildPacketJourneyView(
      checkedJourney,
      answerKnowledgeCheck(
        walkToCheck(),
        "s2-why",
        "There is no subinterface for VLAN 20"
      )
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

    // Moved on: the announcement now reports WHERE the traffic is, and the
    // repair's observation is no longer the thing being announced.
    const moved = buildPacketJourneyView(
      completingJourney,
      advance(repaired, completingJourney)
    ).announcement;

    expect(moved).toContain("At PC-B");
    expect(moved).not.toContain("Router-1 forwards the request on towards PC-B.");
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
    /*
      "Fixed." was a prefix on every confirmation — right for Mission 8 and
      wrong for Mission 1, where nothing was broken. It is still absent.

      The announcement no longer repeats the authored confirmation either.
      That paragraph is the card's, and returning it here announced the
      mission's closing teaching immediately above the card showing it. The
      live region owns location, movement and changed state; `confirmation`
      above is where the authored words are, and they are unchanged.
    */
    expect(view.announcement).not.toContain("Fixed");
    expect(view.announcement).not.toContain("The reply returns to PC-A.");
    expect(view.announcement).toMatch(/^At .+\. .+ was delivered\.$/);
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
    /*
      All the way back to the initial state. A learner who starts over lands on
      the first screen of the journey, not mid-activity.

      `started` is now true in that initial state: the start ceremony was
      removed on a Founder video-UAT ruling, so starting over returns the
      learner to the first real decision rather than to a button that reveals
      it. What matters here is that reset is total.
    */
    expect(resetJourney()).toEqual(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    expect(resetJourney().progress.revealedStageCount).toBe(0);
    expect(resetJourney().progress.appliedActionId).toBeNull();
    expect(resetJourney().committedPredictions).toEqual({});
    expect(resetJourney().answeredChecks).toEqual({});
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

describe("an activity opens on the learner's first real decision", () => {
  /*
    Inverted by a Founder video-UAT ruling.

    This suite protected a deliberate not-started state: one obvious control
    before anything else, and no progress until it was pressed. The video showed
    what that cost — the button moved no traffic, it only revealed the
    prediction the opening had already told the learner to make.

    The journey now begins engaged. What the suite protects instead is that
    nothing MOVES on its own, that a gating prediction still gates, and that the
    first screen carries something real.
  */
  it("reveals no stage until the learner acts", () => {
    const view = buildPacketJourneyView(
      journey,
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      "commit_first"
    );

    expect(view.stages).toEqual([]);
    expect(view.finished).toBe(false);
  });

  it("offers no start ceremony", () => {
    const view = buildPacketJourneyView(
      journey,
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      "commit_first"
    );

    expect(view.startAction).toBeNull();
  });

  it("opens on a beat that carries something real", () => {
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(
        journey,
        INITIAL_PACKET_JOURNEY_VIEW_STATE,
        "commit_first"
      )
    );

    expect(beats.length).toBeGreaterThan(0);

    // No empty card exists merely to hold a button.
    for (const beat of beats) {
      const carries = beat.body.length > 0 || beat.actionable;
      expect(`${beat.kind} carries something: ${carries}`).toBe(
        `${beat.kind} carries something: true`
      );
    }
  });

  it("opens directly on the prediction when the first stage asks one", () => {
    // Mission 1's shape: the learner meets the decision immediately.
    const asking: LearnerPacketJourneyParameters = {
      ...journey,
      stages: journey.stages.map((stage, index) =>
        index === 0
          ? {
              ...stage,
              prediction: {
                prompt: "Which device receives it first?",
                options: ["Switch-1", "Printer"]
              }
            }
          : stage
      )
    };

    const view = buildPacketJourneyView(
      asking,
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      "commit_first"
    );

    expect(view.pendingPrediction).not.toBeNull();
    expect(view.startAction).toBeNull();
  });

  it("still refuses to advance past an uncommitted prediction", () => {
    // The gate that matters is unchanged: a prediction still blocks the reveal.
    const asking: LearnerPacketJourneyParameters = {
      ...journey,
      stages: journey.stages.map((stage, index) =>
        index === 0
          ? {
              ...stage,
              prediction: {
                prompt: "Which device receives it first?",
                options: ["Switch-1", "Printer"]
              }
            }
          : stage
      )
    };

    expect(
      canAdvance(INITIAL_PACKET_JOURNEY_VIEW_STATE, asking, "commit_first")
    ).toBe(false);
  });

  it("runs the whole sequence without a ceremony in front of it", () => {
    let state = INITIAL_PACKET_JOURNEY_VIEW_STATE;
    const seen: string[] = [];

    for (let step = 0; step < journey.stages.length + 2; step += 1) {
      const view = buildPacketJourneyView(journey, state, "commit_first");
      seen.push(view.currentTask.kind);

      if (view.pendingPrediction !== null) {
        state = commitPrediction(
          state,
          view.pendingPrediction.stageId,
          view.pendingPrediction.options[0] ?? ""
        );
        continue;
      }
      if (!view.canAdvance) break;
      state = advance(state, journey);
    }

    expect(seen[0]).not.toBe("start");
    expect(seen.length).toBeGreaterThan(1);
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

  it("names a simultaneous participant as participating, never as arrived", () => {
    /*
      Founder UAT ruling. A device an author named in `alsoAtNodeIds` is part
      of the moment on screen, and that is the whole claim. Every stronger
      word is wrong about it: the traffic was not delivered there, did not
      stop there, is not there now, and did not pass through on its way
      somewhere else. "Participating in this step" is the only sentence that
      is true of a copy that arrived and was not accepted, of a device that
      merely echoed, and of every other reason an author might have.
    */
    const status = resolveNodeJourneyStatus({
      nodeId: "printer",
      revealedNodeIds: ["pc-a", "sw-1"],
      alsoInvolvedNodeIds: ["printer"],
      alsoParticipatingNodeIds: ["printer"],
      confirmed: false,
      stopped: false,
      trafficLabel: "one delivery"
    });

    expect(status.kind).toBe("participating");
    expect(status.label).toBe("Participating in this step.");

    for (const forbidden of [
      "delivered",
      "destination",
      "arrived",
      "reached",
      "confirmed",
      "stopped",
      "accepted"
    ]) {
      expect(
        `says "${forbidden}": ${status.label.toLowerCase().includes(forbidden)}`
      ).toBe(`says "${forbidden}": false`);
    }
  });

  it("does not let a simultaneous participant outrank where the traffic is", () => {
    // The anchor list decides delivered/stopped/here-now, and an author who
    // names a device in BOTH lists must not have the weaker word win.
    const status = resolveNodeJourneyStatus({
      nodeId: "sw-1",
      revealedNodeIds: ["pc-a", "sw-1"],
      alsoInvolvedNodeIds: ["sw-1"],
      alsoParticipatingNodeIds: ["sw-1"],
      confirmed: false,
      stopped: false,
      trafficLabel: "one delivery"
    });

    expect(status.kind).toBe("here-now");
  });

  it("stops calling a device a participant once the moment has moved on", () => {
    // Participation is a statement about the step being observed. Three
    // stages later it would be false, so the historical wording takes over.
    const status = resolveNodeJourneyStatus({
      nodeId: "printer",
      revealedNodeIds: ["pc-a", "sw-1", "pc-b"],
      alsoInvolvedNodeIds: ["printer"],
      alsoParticipatingNodeIds: [],
      confirmed: false,
      stopped: false,
      trafficLabel: "one delivery"
    });

    expect(status.kind).toBe("passed-through");
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
    // Exhaustive on purpose: a new field here has to be a deliberate decision.
    // `answeredChecks` is one — a knowledge-check answer is the same category
    // of thing as a commitment, component state that outlives nothing and
    // records no result anywhere a learner or a grader could read it back.
    expect(Object.keys(INITIAL_PACKET_JOURNEY_VIEW_STATE).sort()).toEqual([
      "answeredChecks",
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


/* ------------------------------------------------------------------ *
 * SHOW ME shows
 *
 * Founder UAT, second round: "the Founder sees 'Show Me' and expects: show me
 * the network and the information I need." The finding was that the richest
 * support level was the one that never told a learner the devices were
 * readable — the inspection prompt appeared only at HELP ME.
 * ------------------------------------------------------------------ */

describe("SHOW ME points the learner at the network", () => {
  it("names the inspector at SHOW ME", () => {
    const view = buildPacketJourneyView(
      predictFirstJourney,
      BEGUN,
      "demonstrate"
    );

    expect(view.inspectionPrompt).not.toBeNull();
  });

  it("still names it at HELP ME", () => {
    const view = buildPacketJourneyView(
      predictFirstJourney,
      BEGUN,
      "guide"
    );

    expect(view.inspectionPrompt).not.toBeNull();
  });

  it("withholds it once the learner is being asked to decide what to inspect", () => {
    // At ASK ME and below, choosing what is worth looking at is part of the
    // work. Telling them would be doing that part for them.
    const view = buildPacketJourneyView(
      predictFirstJourney,
      BEGUN,
      "commit_first"
    );

    expect(view.inspectionPrompt).toBeNull();
  });

  it("does not turn SHOW ME into a prediction gate", () => {
    // The prompt is the only thing that changed. SHOW ME still demonstrates.
    const view = buildPacketJourneyView(
      predictFirstJourney,
      BEGUN,
      "demonstrate"
    );

    expect(view.predictionRequired).toBe(false);
  });
});


/* ------------------------------------------------------------------ *
 * GUIDE THE LEARNER (DEC-063, as amended by DEC-067 §8 on grading)
 *
 * Founder UAT, fourth round. Each block below pins one of the reported
 * defects rather than the wording that currently fixes it, so a rewrite that
 * keeps the meaning stays legal and a regression does not.
 * ------------------------------------------------------------------ */

describe("an originating stage never says traffic reached its own source", () => {
  it("says the traffic STARTS where nothing was traversed to reach", () => {
    // Founder UAT rejected "The file PC-A is sending reached PC-A." Nothing
    // travelled anywhere, so "reached" is false rather than simplified.
    const headline = describeEventHeadline(
      false,
      false,
      false,
      "PC-A",
      false,
      "the file",
      false,
      "PC-A",
      "PC-B"
    );

    expect(headline.toLowerCase()).not.toContain("reached");
    expect(headline.toLowerCase()).not.toContain("arrived");

    // WHO wants to send WHAT to WHOM, and where it currently is.
    expect(headline).toContain("PC-A");
    expect(headline).toContain("PC-B");
    expect(headline).toContain("the file");
    expect(headline.toLowerCase()).toContain("has not left");
  });

  it("still says REACHED once a connection has actually been crossed", () => {
    // The distinction has to cut both ways, or it is just a word ban.
    const headline = describeEventHeadline(
      false,
      false,
      false,
      "Switch-1",
      false,
      "the file",
      true,
      "PC-A",
      "PC-B"
    );

    expect(headline).toContain("reached Switch-1");
  });

  it("draws the distinction from the authored stage, not from position", () => {
    // A journey whose first stage names no link is an origin; the same builder
    // must report it as a start without anything else changing.
    const view = buildPacketJourneyView(journey, BEGUN, "demonstrate");

    const originatesHere =
      journey.stages[0]?.viaLinkId === undefined;

    if (originatesHere) {
      expect(view.currentEvent.headline.toLowerCase()).not.toContain("reached");
    }
  });
});

describe("an ungraded prediction is resolved against what happened", () => {
  it("exposes the prediction, the observation and the reason together", () => {
    const view = buildPacketJourneyView(journey, walkToFailure(), "commit_first");

    expect(view.resolvedPrediction).not.toBeNull();
    expect(view.resolvedPrediction?.option.length ?? 0).toBeGreaterThan(0);
    expect(view.resolvedPrediction?.observed.length ?? 0).toBeGreaterThan(0);
    expect(view.resolvedPrediction?.why?.length ?? 0).toBeGreaterThan(0);
  });

  it("never declares a prediction correct or incorrect", () => {
    // Scoped to THIS fixture, which authors no `correctOption`. Where a
    // mission authors none the comparison IS the feedback and no verdict may
    // appear, which is what the assertions below pin.
    //
    // Not an architecture claim. `PacketJourneyPrediction.correctOption` is
    // optional, and DEC-067 §8 supersedes DEC-063's "never graded": where the
    // course has already taught enough for the answer to be worked out, an
    // author may supply one, and this file exercises exactly that in
    // "a graded prediction gives the verdict and the reason".
    const view = buildPacketJourneyView(journey, walkToFailure(), "commit_first");

    const shown = [
      view.resolvedPrediction?.option ?? "",
      view.resolvedPrediction?.observed ?? "",
      view.resolvedPrediction?.why ?? "",
      view.announcement
    ]
      .join(" ")
      .toLowerCase();

    for (const verdict of ["correct", "incorrect", "wrong", "well done", "score"]) {
      expect(`${verdict}: ${shown.includes(verdict)}`).toBe(`${verdict}: false`);
    }
  });

  it("shows nothing to compare before the stage has been observed", () => {
    // Committed on the stage it is about, but that stage is not yet revealed.
    // A commitment is only pending in the slot immediately ahead, so the first
    // stage has to be revealed before the second can be predicted.
    const stage = journey.stages[1];
    const committed = commitPrediction(
      advance(BEGUN, journey),
      stage?.stageId ?? "",
      stage?.prediction?.options[0] ?? ""
    );
    const view = buildPacketJourneyView(journey, committed, "commit_first");

    expect(view.resolvedPrediction).toBeNull();
    expect(view.pendingCommitment).not.toBeNull();
  });
});

describe("the learner's answer is kept apart from the lesson", () => {
  it("carries the answer as its own field rather than inside the narrative", () => {
    // Founder UAT: the learner must not have to reconstruct an interaction by
    // scrolling back through the lesson. The commitment, the resolved
    // comparison and the chosen remediation are separate fields, so a
    // presentation can put them in their own region.
    const view = buildPacketJourneyView(journey, BEGUN, "demonstrate");

    expect("pendingCommitment" in view).toBe(true);
    expect("resolvedPrediction" in view).toBe(true);
    expect("chosenAction" in view).toBe(true);
  });
});

describe("a control says what the learner will actually get", () => {
  it("says what pressing it will actually do", () => {
    // Founder UAT: "Show me" reads as a promise of a visual demonstration, and
    // an action label on a control that takes no action is worse. The label is
    // now read from the stage the press reveals — it names a destination when
    // something crosses a connection, and names the reasoning when it does not.
    for (let revealed = 0; revealed < journey.stages.length; revealed += 1) {
      const state: PacketJourneyViewState = {
        ...BEGUN,
        progress: { ...BEGUN.progress, revealedStageCount: revealed }
      };

      const label = describeAdvanceLabel(state, journey);
      const moves = journey.stages[revealed]?.viaLinkId !== undefined;

      expect(`stage ${revealed}: ${label.toLowerCase().includes("send")}`).toBe(
        `stage ${revealed}: ${moves}`
      );
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("uses the authored start label only when the first stage actually sends", () => {
    // Founder UAT, blocking: the control said "Send to 192.168.2.20" and the
    // beat that followed said the message had not left. It had not — the first
    // authored stage is a DECISION and traverses no link. An action label on a
    // control that takes no action teaches a learner not to trust the buttons.
    const movesFirst = journey.stages[0]?.viaLinkId !== undefined;

    const label = describeAdvanceLabel(
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      journey
    );

    if (movesFirst) {
      expect(label).toBe(journey.traffic.startActionLabel);
    } else {
      expect(label).not.toBe(journey.traffic.startActionLabel);
      expect(label.toLowerCase()).not.toContain("send");
    }
  });

  it("promises movement only where the next stage crosses a connection", () => {
    // Both directions, so the rule is not just a ban on the word "send".
    for (let revealed = 0; revealed < journey.stages.length; revealed += 1) {
      const state: PacketJourneyViewState = {
        ...BEGUN,
        progress: { ...BEGUN.progress, revealedStageCount: revealed }
      };

      const label = describeAdvanceLabel(state, journey).toLowerCase();
      const moves = journey.stages[revealed]?.viaLinkId !== undefined;

      expect(`stage ${revealed} promises movement: ${label.includes("send")}`).toBe(
        `stage ${revealed} promises movement: ${moves}`
      );
    }
  });
});


/* ------------------------------------------------------------------ *
 * KNOWLEDGE CHECK (DEC-064)
 *
 * A prediction and a knowledge check are different instruments and must stay
 * that way. The difference is WHEN the learner is asked, not whether an answer
 * key may exist: a prediction is committed BEFORE the evidence and carries a
 * key only where the course has already taught the answer, while a knowledge
 * check is asked AFTER the teaching and so always resolves.
 *
 * These assert that difference in both directions. The fixtures below author
 * an ungraded prediction, which is the ordinary case; the graded case is
 * exercised separately, and neither produces a score or any evidence.
 * ------------------------------------------------------------------ */

/** The same journey, with a knowledge check on its second stage. */
const checkedJourney: LearnerPacketJourneyParameters = {
  ...journey,
  stages: journey.stages.map((stage, index) =>
    index === 1
      ? {
          ...stage,
          knowledgeChecks: [
            {
              checkId: "s2-why",
              prompt: "Why did Router-1 discard it?",
              options: [
                "There is no subinterface for VLAN 20",
                "The cable is unplugged"
              ],
              correctOption: "There is no subinterface for VLAN 20",
              explanation: "Router-1 has nothing configured for that VLAN."
            }
          ]
        }
      : stage
  )
};

function walkToCheck(): PacketJourneyViewState {
  let state = advance(BEGUN, checkedJourney);
  state = commitPrediction(state, "s2", "Discard it");
  return advance(state, checkedJourney);
}

describe("a knowledge check is a different instrument from a prediction", () => {
  it("offers no knowledge check where the author wrote none", () => {
    const view = buildPacketJourneyView(journey, walkToFailure(), "demonstrate");
    expect(view.knowledgeCheck).toBeNull();
  });

  it("a prediction needs no correct answer to be valid", () => {
    // The prediction on the base fixture carries prompt and options only, and
    // the view still resolves it. An answer key is OPTIONAL in the contract —
    // this asserts that its absence is valid, not that it may never be
    // present.
    const stage = journey.stages[1];
    expect(stage?.prediction).toBeDefined();
    expect(Object.keys(stage?.prediction ?? {}).sort()).toEqual([
      "options",
      "prompt"
    ]);
  });

  it("offers the check once its stage has been revealed", () => {
    const view = buildPacketJourneyView(
      checkedJourney,
      walkToCheck(),
      "demonstrate"
    );

    expect(view.knowledgeCheck?.prompt).toBe("Why did Router-1 discard it?");
    expect(view.knowledgeCheck?.options).toHaveLength(2);
    expect(view.knowledgeCheck?.answer).toBeNull();
  });

  it("offers nothing before its stage is on screen", () => {
    const view = buildPacketJourneyView(checkedJourney, BEGUN, "demonstrate");
    expect(view.knowledgeCheck).toBeNull();
  });

  it("resolves a correct answer as correct, and still says why", () => {
    const answered = answerKnowledgeCheck(
      walkToCheck(),
      "s2-why",
      "There is no subinterface for VLAN 20"
    );
    const view = buildPacketJourneyView(checkedJourney, answered, "demonstrate");

    expect(view.knowledgeCheck?.answer?.correct).toBe(true);
    expect(view.knowledgeCheck?.answer?.correctOption).toBe(
      "There is no subinterface for VLAN 20"
    );
    expect(view.knowledgeCheck?.answer?.explanation.length ?? 0).toBeGreaterThan(0);
  });

  it("resolves an incorrect answer, and exposes the correct one", () => {
    // The whole reason the type exists: a learner who was wrong must be able
    // to see what the right answer was, not merely that they missed it.
    const answered = answerKnowledgeCheck(
      walkToCheck(),
      "s2-why",
      "The cable is unplugged"
    );
    const view = buildPacketJourneyView(checkedJourney, answered, "demonstrate");

    expect(view.knowledgeCheck?.answer?.correct).toBe(false);
    expect(view.knowledgeCheck?.answer?.option).toBe("The cable is unplugged");
    expect(view.knowledgeCheck?.answer?.correctOption).toBe(
      "There is no subinterface for VLAN 20"
    );
    expect(view.knowledgeCheck?.answer?.explanation.length ?? 0).toBeGreaterThan(0);
  });

  it("decides correctness by comparing against the authored option, and nothing else", () => {
    // Deterministic and inspectable: the same answer gives the same verdict
    // every time, and the verdict is a string comparison against curriculum.
    const answered = answerKnowledgeCheck(walkToCheck(), "s2-why", "The cable is unplugged");

    const first = buildPacketJourneyView(checkedJourney, answered, "demonstrate");
    const second = buildPacketJourneyView(checkedJourney, answered, "demonstrate");

    expect(second.knowledgeCheck?.answer).toEqual(first.knowledgeCheck?.answer);

    // Correctness is exactly one comparison: the learner's option against the
    // authored one. Recomputed here from the same two values the view used.
    const chosen: string = "The cable is unplugged";
    const authored: string =
      checkedJourney.stages[1]?.knowledgeChecks?.[0]?.correctOption ?? "";

    expect(first.knowledgeCheck?.answer?.correct).toBe(chosen === authored);
  });

  it("records an answer once and does not let it be revised", () => {
    const once = answerKnowledgeCheck(walkToCheck(), "s2-why", "The cable is unplugged");
    const again = answerKnowledgeCheck(
      once,
      "s2-why",
      "There is no subinterface for VLAN 20"
    );

    expect(again.answeredChecks["s2-why"]).toBe("The cable is unplugged");
  });

  it("does not gate the journey on answering", () => {
    // A knowledge check confirms understanding; it is not a turnstile.
    const state = walkToCheck();
    expect(canAdvance(state, checkedJourney, "demonstrate")).toBe(
      canAdvance(
        answerKnowledgeCheck(state, "s2-why", "The cable is unplugged"),
        checkedJourney,
        "demonstrate"
      )
    );
  });

  it("produces no score, streak or evidence", () => {
    const answered = answerKnowledgeCheck(
      walkToCheck(),
      "s2-why",
      "There is no subinterface for VLAN 20"
    );
    const serialised = JSON.stringify(answered).toLowerCase();

    for (const forbidden of [
      "score",
      "streak",
      "points",
      "grade",
      "mastery",
      "evidence",
      "competency"
    ]) {
      expect(`${forbidden}: ${serialised.includes(forbidden)}`).toBe(
        `${forbidden}: false`
      );
    }
  });
});


/* ------------------------------------------------------------------ *
 * ONE BEAT AT A TIME (DEC-065)
 *
 * The shell, asserted as a pure function. What matters is that exactly one
 * instructional idea is primary at a time, that the learner always has a way
 * on, and that the beat list cannot describe a state the journey has left.
 * ------------------------------------------------------------------ */

describe("the instructor pane shows one beat at a time", () => {
  it("offers exactly one beat before the journey starts", () => {
    const view = buildPacketJourneyView(journey, INITIAL_PACKET_JOURNEY_VIEW_STATE);
    const beats = resolveJourneyBeats(view);

    expect(beats).toHaveLength(1);
    expect(beats[0]?.kind).toBe("start");
    expect(beats[0]?.actionable).toBe(true);
  });

  it("always resolves to exactly one active beat", () => {
    // Whatever the state, and whatever index the learner is on, the pane has
    // one thing to show. That is the invariant the whole model rests on.
    for (const state of [
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      BEGUN,
      advance(BEGUN, journey),
      walkToFailure()
    ]) {
      const beats = resolveJourneyBeats(buildPacketJourneyView(journey, state));

      for (const index of [-3, 0, 1, 99]) {
        const active = activeJourneyBeat(beats, index);
        expect(active).not.toBeNull();
        expect(beats).toContain(active);
      }
    }
  });

  it("never puts two actionable beats on the learner at once", () => {
    // One thing demanding attention. A pane offering a question AND a repair
    // would be the stacked layout again, wearing one card.
    for (const state of [BEGUN, advance(BEGUN, journey), walkToFailure()]) {
      const beats = resolveJourneyBeats(buildPacketJourneyView(journey, state));
      const actionable = beats.filter((beat) => beat.actionable);

      expect(`actionable beats: ${actionable.length <= 1}`).toBe(
        "actionable beats: true"
      );
    }
  });

  it("gives every beat a heading, so focus always has somewhere to land", () => {
    for (const state of [BEGUN, advance(BEGUN, journey), walkToFailure()]) {
      for (const beat of resolveJourneyBeats(
        buildPacketJourneyView(journey, state)
      )) {
        expect(beat.heading.length).toBeGreaterThan(0);
      }
    }
  });

  it("leads with what just happened after the network moves", () => {
    // Answering must not leave the learner hunting for what changed: the first
    // beat of a new state is the one describing it.
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(journey, advance(BEGUN, journey))
    );

    expect(["observe", "feedback"]).toContain(beats[0]?.kind);
  });

  it("makes a resolved prediction its own beat, before anything new is asked", () => {
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(journey, walkToFailure(), "commit_first")
    );

    const feedback = beats.findIndex((beat) => beat.kind === "feedback");
    const question = beats.findIndex((beat) => beat.kind === "question");

    expect(feedback).toBe(0);
    if (question >= 0) expect(feedback).toBeLessThan(question);
  });

  it("distinguishes prediction feedback from knowledge-check feedback", () => {
    const predicted = resolveJourneyBeats(
      buildPacketJourneyView(journey, walkToFailure(), "commit_first")
    ).find((beat) => beat.kind === "feedback");

    const answered = resolveJourneyBeats(
      buildPacketJourneyView(
        checkedJourney,
        answerKnowledgeCheck(walkToCheck(), "s2-why", "The cable is unplugged"),
        "commit_first"
      )
    ).find((beat) => beat.kind === "feedback");

    // A prediction is compared. A knowledge check resolves.
    expect(predicted?.heading).toBe("Your prediction");
    expect(answered?.heading).toBe("Not correct");
    expect(answered?.body.join(" ")).toContain("Correct answer:");
  });

  it("says Correct without labouring the point when the learner was right", () => {
    const answered = resolveJourneyBeats(
      buildPacketJourneyView(
        checkedJourney,
        answerKnowledgeCheck(
          walkToCheck(),
          "s2-why",
          "There is no subinterface for VLAN 20"
        ),
        "commit_first"
      )
    ).find((beat) => beat.kind === "feedback");

    expect(answered?.heading).toBe("Correct");
    // The right answer is not repeated back at a learner who just gave it.
    expect(answered?.body.join(" ")).not.toContain("Correct answer:");
    // The reason is still there, because the reason is the teaching.
    expect(answered?.body.join(" ")).toContain("Router-1 has nothing configured");
  });

  it("gives the authored reason its own beat rather than the feedback's disclosure", () => {
    /*
      Changed on a Founder ruling about redundant teaching.

      The feedback used to carry the stage's `decision` as optional depth, and
      the EXPLAIN beat then showed the same paragraph as the next screen. The
      reason is not lost — it is exactly one beat further on, as its own screen,
      which is where a learner reads it once instead of twice.
    */
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(journey, walkToFailure(), "commit_first")
    );

    const feedback = beats.find((beat) => beat.kind === "feedback");
    const explain = beats.find((beat) => beat.kind === "explain");

    expect(feedback?.more).toBeNull();
    expect(explain?.body.join(" ")).toContain("There is no subinterface");
  });

  it("offers a way on from every beat", () => {
    // Either the beat owns a control, or Continue reaches the one that does.
    for (const state of [BEGUN, advance(BEGUN, journey), walkToFailure()]) {
      const view = buildPacketJourneyView(journey, state, "commit_first");
      const beats = resolveJourneyBeats(view);

      const reachable =
        beats.some((beat) => beat.actionable) || view.canAdvance || view.finished;

      expect(`a way on exists: ${reachable}`).toBe("a way on exists: true");
    }
  });

  it("is not hard-coded to questions, so a terminal beat can join it", () => {
    // DEC-062 / WP-K: the pane is a sequence of instructional moments, not a
    // quiz. The kind vocabulary already contains observation, explanation,
    // symptom and action alongside question.
    expect([...JOURNEY_BEAT_KINDS]).toContain("observe");
    expect([...JOURNEY_BEAT_KINDS]).toContain("explain");
    expect([...JOURNEY_BEAT_KINDS]).toContain("action");
    expect(JOURNEY_BEAT_KINDS.filter((kind) => kind === "question")).toHaveLength(1);
  });

  it("derives beats from the view, so it cannot describe a stale state", () => {
    const before = resolveJourneyBeats(buildPacketJourneyView(journey, BEGUN));
    const after = resolveJourneyBeats(
      buildPacketJourneyView(journey, advance(BEGUN, journey))
    );

    expect(after).not.toEqual(before);
  });
});


/* ------------------------------------------------------------------ *
 * ORIENTATION BESIDE THE BEAT
 *
 * Founder UAT: "I did not notice the existing leg information because it was
 * below the topology." The learner must be able to answer who, what, to whom
 * and where-now without leaving the current beat.
 * ------------------------------------------------------------------ */

describe("the quick reference answers the orientation questions", () => {
  it("names who is sending, what, and to whom", () => {
    const view = buildPacketJourneyView(journey, BEGUN, "demonstrate");
    const labels = view.quickReference.map((row) => row.label);

    expect(labels).toContain("From");
    expect(labels).toContain("To");
    // "Carrying", since wave 8: what is being carried, in the mission's own
    // vocabulary, rather than "Sending — a message".
    expect(labels).toContain("Carrying");
  });

  it("pairs a device with its address rather than an address alone", () => {
    // Founder UAT: prefer "PC-C (192.168.2.20)" to an address the learner has
    // to remember the owner of.
    const view = buildPacketJourneyView(journey, BEGUN, "demonstrate");
    const from = view.quickReference.find((row) => row.label === "From");

    expect(from?.value).toContain("PC-A");
  });

  it("says where the traffic is once the journey has moved", () => {
    const view = buildPacketJourneyView(
      journey,
      advance(BEGUN, journey),
      "demonstrate"
    );

    expect(view.quickReference.map((row) => row.label)).toContain("Now at");
  });

  it("names the current connection when one was crossed", () => {
    const view = buildPacketJourneyView(journey, walkToFailure(), "commit_first");
    const leg = view.quickReference.find((row) => row.label === "Current leg");

    expect(leg?.value.length ?? 0).toBeGreaterThan(0);
  });

  it("shows only what the mission authored", () => {
    // No field is invented: an address appears only where the author flagged
    // one for display, which is the mission's own concept boundary.
    const bare: LearnerPacketJourneyParameters = {
      ...journey,
      nodes: journey.nodes.map((node) => ({
        ...node,
        interfaces: node.interfaces.map((iface) => ({
          ...iface,
          attributes: iface.attributes.map((attribute) => ({
            label: attribute.label,
            value: attribute.value
          }))
        }))
      }))
    };

    const view = buildPacketJourneyView(bare, BEGUN, "demonstrate");
    const from = view.quickReference.find((row) => row.label === "From");

    // The device is still named; no address is invented for it.
    expect(from?.value).toBe("PC-A");
  });

  it("is orientation, never a control", () => {
    const view = buildPacketJourneyView(journey, BEGUN, "demonstrate");

    for (const row of view.quickReference) {
      expect(typeof row.label).toBe("string");
      expect(typeof row.value).toBe("string");
    }
  });
});

describe("the beat says what the device is doing, not only where it is", () => {
  it("heads with the authored action when one exists", () => {
    const acting: LearnerPacketJourneyParameters = {
      ...journey,
      stages: journey.stages.map((stage, index) =>
        index === 0 ? { ...stage, action: "deciding how to send it" } : stage
      )
    };

    const beats = resolveJourneyBeats(
      buildPacketJourneyView(acting, advance(BEGUN, acting), "demonstrate")
    );
    const observe = beats.find((beat) => beat.kind === "observe");

    expect(observe?.heading).toBe("PC-A — deciding how to send it");
  });

  it("falls back to naming the device when the author wrote none", () => {
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(journey, advance(BEGUN, journey), "demonstrate")
    );
    const observe = beats.find((beat) => beat.kind === "observe");

    expect(observe?.heading).toBe("PC-A");
  });

  it("does not repeat the observation in a second beat", () => {
    /*
      Founder UAT found the stop stated in the headline, the narration and the
      fault symptom. The symptom beat now carries meaning, not a restatement.

      The fixture is built so the symptom and the stopping narration are the
      SAME sentence. Mutation testing caught the earlier form: against the
      authored course the two already differ, so removing the de-duplication
      changed nothing and the test passed on a rule it never exercised.
    */
    const echoed: LearnerPacketJourneyParameters = {
      ...journey,
      fault: journey.fault && {
        ...journey.fault,
        symptom: stoppingNarration(journey)
      }
    };

    const view = buildPacketJourneyView(echoed, walkToFailure(), "commit_first");
    const beats = resolveJourneyBeats(view);

    const observe = beats.find((beat) => beat.kind === "observe");
    const symptom = beats.find((beat) => beat.kind === "symptom");

    expect(symptom).toBeDefined();

    for (const line of symptom?.body ?? []) {
      expect(observe?.body ?? []).not.toContain(line);
    }
  });

  it("keeps a symptom that says something the narration did not", () => {
    // The de-duplication must not swallow a symptom that adds meaning, which
    // is the whole reason the beat exists.
    const view = buildPacketJourneyView(journey, walkToFailure(), "commit_first");
    const symptom = resolveJourneyBeats(view).find(
      (beat) => beat.kind === "symptom"
    );

    expect((symptom?.body ?? []).length).toBeGreaterThan(0);
  });
});


/** The narration of the stage the authored fault stops at. */
function stoppingNarration(
  parameters: LearnerPacketJourneyParameters
): string {
  const stage = parameters.stages.find(
    (candidate) => candidate.stageId === parameters.fault?.stopsAtStageId
  );

  if (stage === undefined) throw new Error("the fixture authors no stopping stage");

  return stage.narration;
}


/* ------------------------------------------------------------------ *
 * DEC-066 — ONE JOURNEY STATE, ONE TRUTH
 *
 * Founder UAT read a pane saying Switch-1 had forwarded a frame to Router-1
 * while the marker was still travelling from PC-A to Switch-1, and read one
 * question twice before answering it once. Neither was a rendering bug: both
 * were text with no obligation to agree with anything.
 * ------------------------------------------------------------------ */

describe("every surface agrees about where the traffic is", () => {
  it("puts the quick reference's location at the stage the model reached", () => {
    for (let revealed = 1; revealed <= journey.stages.length; revealed += 1) {
      const state = revealTo(revealed);
      const view = buildPacketJourneyView(journey, state, "demonstrate");
      const latest = view.stages[view.stages.length - 1];
      const nowAt = view.quickReference.find((row) => row.label === "Now at");

      expect(`@${revealed} now at: ${nowAt?.value}`).toBe(
        `@${revealed} now at: ${latest?.nodeLabel}`
      );
    }
  });

  it("puts the current leg on the link the stage actually crossed", () => {
    for (let revealed = 1; revealed <= journey.stages.length; revealed += 1) {
      const state = revealTo(revealed);
      const view = buildPacketJourneyView(journey, state, "demonstrate");
      const leg = view.quickReference.find((row) => row.label === "Current leg");
      const current = view.links.filter((link) => link.current);

      // Either a leg was crossed and exactly one link is current, or neither.
      expect(`@${revealed} leg and link agree: ${(leg !== undefined) === (current.length > 0)}`)
        .toBe(`@${revealed} leg and link agree: true`);
    }
  });

  it("marks at most one link as the one being travelled", () => {
    for (let revealed = 0; revealed <= journey.stages.length; revealed += 1) {
      const view = buildPacketJourneyView(journey, revealTo(revealed), "demonstrate");
      const current = view.links.filter((link) => link.current);

      expect(`@${revealed} current links: ${current.length <= 1}`).toBe(
        `@${revealed} current links: true`
      );
    }
  });

  it("heads the beat with the device the journey is actually at", () => {
    for (let revealed = 1; revealed <= journey.stages.length; revealed += 1) {
      const view = buildPacketJourneyView(journey, revealTo(revealed), "demonstrate");
      const latest = view.stages[view.stages.length - 1];
      const observe = resolveJourneyBeats(view).find(
        (beat) => beat.kind === "observe" && beat.heading !== "Next"
      );

      if (observe === undefined || latest === undefined) continue;

      expect(
        `@${revealed} heading names ${latest.nodeLabel}: ${observe.heading.startsWith(latest.nodeLabel)}`
      ).toBe(`@${revealed} heading names ${latest.nodeLabel}: true`);
    }
  });
});

describe("the question is emitted once", () => {
  it("leaves the prompt to the control, not the beat body", () => {
    // The fieldset legend owns it: it is the accessible group label for the
    // radios AND it is what sits immediately before the choices.
    const asking = buildPacketJourneyView(journey, atPrediction(), "commit_first");
    const question = resolveJourneyBeats(asking).find(
      (beat) => beat.kind === "question"
    );

    expect(question).toBeDefined();
    expect(question?.body).toEqual([]);
  });

  it("still carries the prompt on the view, so the control can show it", () => {
    // Emptying the beat body must not lose the question altogether.
    const asking = buildPacketJourneyView(journey, atPrediction(), "commit_first");

    expect(asking.pendingPrediction?.prompt.length ?? 0).toBeGreaterThan(0);
  });

  it("puts the prompt in no other beat on the same screen", () => {
    const asking = buildPacketJourneyView(journey, atPrediction(), "commit_first");
    const prompt = asking.pendingPrediction?.prompt ?? "";
    const normalise = (text: string) =>
      text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    for (const beat of resolveJourneyBeats(asking)) {
      for (const line of beat.body) {
        expect(
          `${beat.kind} restates the prompt: ${normalise(line).includes(normalise(prompt))}`
        ).toBe(`${beat.kind} restates the prompt: false`);
      }
    }
  });
});


/* ------------------------------------------------------------------ *
 * THE MISSION 8 REFINEMENT
 *
 * Troubleshoot the system, rather than follow it. The learner interprets the
 * evidence before the interface supplies the interpretation, is told plainly
 * whether their prediction was right, and can act on a wrong repair rather than
 * restarting the whole journey.
 * ------------------------------------------------------------------ */

describe("starting lands the learner in something to think about", () => {
  it("emits no empty beat before anything has happened", () => {
    // Founder ruling: "Nothing has been sent yet" followed by Continue was two
    // clicks and no cognition.
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(journey, BEGUN, "demonstrate")
    );

    for (const beat of beats) {
      const empty = beat.body.length === 0 && !beat.actionable;
      expect(`${beat.kind} is an empty pause: ${empty}`).toBe(
        `${beat.kind} is an empty pause: false`
      );
    }
  });

  it("gives the first beat after Start something to do", () => {
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(journey, BEGUN, "commit_first")
    );

    expect(beats.length).toBeGreaterThan(0);
    expect(beats.some((beat) => beat.actionable)).toBe(true);
  });

  it("says nothing about a stage the journey has not reached", () => {
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(journey, BEGUN, "demonstrate")
    );

    expect(beats.some((beat) => beat.kind === "observe" && beat.body.length > 0))
      .toBe(false);
  });
});

describe("a prediction the learner could reason out is resolved explicitly", () => {
  /** The fixture, with an authored correct option on its prediction. */
  const gradedJourney: LearnerPacketJourneyParameters = {
    ...journey,
    stages: journey.stages.map((stage) =>
      stage.prediction === undefined
        ? stage
        : {
            ...stage,
            prediction: { ...stage.prediction, correctOption: "Discard it" }
          }
    )
  };

  function answeredWith(option: string): PacketJourneyViewState {
    let state = advance(BEGUN, gradedJourney);
    state = commitPrediction(state, "s2", option);
    return advance(state, gradedJourney);
  }

  it("says so, in words, when the learner was right", () => {
    const beat = resolveJourneyBeats(
      buildPacketJourneyView(gradedJourney, answeredWith("Discard it"), "commit_first")
    ).find((candidate) => candidate.kind === "feedback");

    expect(beat?.heading).toBe("Correct prediction");
  });

  it("says so calmly when the learner was not", () => {
    const beat = resolveJourneyBeats(
      buildPacketJourneyView(gradedJourney, answeredWith("Forward it"), "commit_first")
    ).find((candidate) => candidate.kind === "feedback");

    expect(beat?.heading).toBe("Not quite");
    expect(beat?.body.join(" ")).toContain("The expected answer: Discard it");
  });

  it("carries the verdict in the heading, never in colour alone", () => {
    // Accessibility: the pane renders a heading, and the heading is the fact.
    const cases: readonly (readonly [string, string])[] = [
      ["Discard it", "Correct prediction"],
      ["Forward it", "Not quite"]
    ];

    for (const [option, heading] of cases) {
      const beat = resolveJourneyBeats(
        buildPacketJourneyView(gradedJourney, answeredWith(option), "commit_first")
      ).find((candidate) => candidate.kind === "feedback");

      expect(beat?.heading).toBe(heading);
    }
  });

  it("never praises, scores or scolds", () => {
    const beat = resolveJourneyBeats(
      buildPacketJourneyView(gradedJourney, answeredWith("Forward it"), "commit_first")
    ).find((candidate) => candidate.kind === "feedback");

    const said = `${beat?.heading} ${beat?.body.join(" ")}`.toLowerCase();

    for (const forbidden of [
      "well done",
      "great",
      "excellent",
      "oops",
      "sorry",
      "streak",
      "score",
      "points"
    ]) {
      expect(`${forbidden}: ${said.includes(forbidden)}`).toBe(`${forbidden}: false`);
    }
  });

  it("leaves what actually happened to the beat that owns it", () => {
    /*
      Changed on a Founder ruling about redundant teaching. The feedback used
      to print "What actually happened: <narration>", and the OBSERVE beat then
      printed the same paragraph as the very next screen.

      What happened is still shown, once, on the screen after the verdict.
    */
    for (const option of ["Discard it", "Forward it"]) {
      const beats = resolveJourneyBeats(
        buildPacketJourneyView(gradedJourney, answeredWith(option), "commit_first")
      );

      const feedback = beats.find((candidate) => candidate.kind === "feedback");
      const observe = beats.find((candidate) => candidate.kind === "observe");

      expect(feedback?.body.join(" ")).not.toContain("What actually happened:");
      expect(observe?.body.join(" ").length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("a wrong repair teaches and lets the learner try again", () => {
  it("keeps the choices on offer after a change that did not repair", () => {
    const wrong = applyAction(walkToFailure(), "restart-pc-a", true);
    const view = buildPacketJourneyView(journey, wrong, "commit_first");

    expect(view.actions.some((action) => action.available)).toBe(true);
  });

  it("shows what that particular choice got wrong", () => {
    const wrong = applyAction(walkToFailure(), "restart-pc-a", true);
    const view = buildPacketJourneyView(journey, wrong, "commit_first");

    expect(view.chosenAction?.observation).toContain("PC-A restarts");
  });

  it("accepts a second choice, without restarting the journey", () => {
    const first = applyAction(walkToFailure(), "restart-pc-a", true);
    const second = applyAction(first, "add-vlan-20", true);

    expect(second.progress.appliedActionId).toBe("add-vlan-20");
    // The learner did not lose the stages they had already walked.
    expect(second.progress.revealedStageCount).toBe(
      first.progress.revealedStageCount
    );
  });

  it("withdraws the choices once one of them repaired the fault", () => {
    const repaired = applyAction(walkToFailure(), "add-vlan-20", true);
    const view = buildPacketJourneyView(journey, repaired, "commit_first");

    expect(view.actions.some((action) => action.available)).toBe(false);
  });

  it("does not let a repair be undone by a later choice", () => {
    const repaired = applyAction(walkToFailure(), "add-vlan-20", true);
    const view = buildPacketJourneyView(journey, repaired, "commit_first");

    // The renderer passes the model's availability, which is now false.
    const after = applyAction(
      repaired,
      "restart-pc-a",
      view.actions.some((action) => action.available)
    );

    expect(after.progress.appliedActionId).toBe("add-vlan-20");
  });
});

describe("the repair is offered only after the reasoning", () => {
  /** The fixture, with two checks on the stage the fault stops at. */
  const reasoned: LearnerPacketJourneyParameters = {
    ...journey,
    stages: journey.stages.map((stage, index) =>
      index === 1
        ? {
            ...stage,
            knowledgeChecks: [
              {
                checkId: "r1",
                prompt: "What does the stop rule out?",
                options: ["Everything", "The devices that received nothing"],
                correctOption: "The devices that received nothing",
                explanation: "A device can only mishandle what it was given."
              },
              {
                checkId: "r2",
                prompt: "What should you inspect next?",
                options: ["PC-A's configuration", "The cable"],
                correctOption: "PC-A's configuration",
                explanation: "The stop was at PC-A, so the inspection stays there."
              }
            ]
          }
        : stage
    )
  };

  it("puts the question before the repair choices", () => {
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(reasoned, walkToFailure(), "commit_first")
    );

    const question = beats.findIndex((beat) => beat.kind === "question");
    const action = beats.findIndex((beat) => beat.kind === "action");

    expect(question).toBeGreaterThanOrEqual(0);
    expect(action).toBeGreaterThanOrEqual(0);
    expect(question).toBeLessThan(action);
  });

  it("withholds the authored diagnosis while a question is open", () => {
    // Otherwise the interface answers the question it is about to ask.
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(reasoned, walkToFailure(), "commit_first")
    );

    const symptom = beats.find((beat) => beat.kind === "symptom");
    expect(symptom?.more).toBeNull();
  });

  it("leaves the diagnosis with the questions, before AND after they are answered", () => {
    /*
      Tightened on a Founder ruling about redundant teaching.

      Withholding the authored diagnosis while a question is open was right and
      is unchanged. Returning it afterwards was not: it is the same explanation
      the learner has just read in the check's own feedback, restated two
      screens later to no additional effect.
    */
    let state = walkToFailure();
    state = answerKnowledgeCheck(state, "r1", "The devices that received nothing");
    state = answerKnowledgeCheck(state, "r2", "PC-A's configuration");

    const symptom = resolveJourneyBeats(
      buildPacketJourneyView(reasoned, state, "commit_first")
    ).find((beat) => beat.kind === "symptom");

    expect(symptom?.more).toBeNull();

    // And the reasoning itself is still in front of the learner.
    const feedback = resolveJourneyBeats(
      buildPacketJourneyView(reasoned, state, "commit_first")
    ).find((beat) => beat.kind === "feedback");

    expect(feedback?.body.join(" ")).toContain(
      "The stop was at PC-A, so the inspection stays there."
    );
  });

  it("asks one question at a time, in authored order", () => {
    const first = buildPacketJourneyView(reasoned, walkToFailure(), "commit_first");
    expect(first.knowledgeCheck?.checkId).toBe("r1");
    expect(first.knowledgeCheck?.answeredCount).toBe(0);
    expect(first.knowledgeCheck?.totalCount).toBe(2);

    const answered = answerKnowledgeCheck(
      walkToFailure(),
      "r1",
      "The devices that received nothing"
    );
    const second = buildPacketJourneyView(reasoned, answered, "commit_first");

    expect(second.knowledgeCheck?.checkId).toBe("r2");
    expect(second.knowledgeCheck?.answeredCount).toBe(1);
  });
});

describe("the beat says which device it is about", () => {
  it("names the device on an observation", () => {
    const beat = resolveJourneyBeats(
      buildPacketJourneyView(journey, advance(BEGUN, journey), "demonstrate")
    ).find((candidate) => candidate.kind === "observe");

    expect(beat?.device).toBe("PC-A");
  });

  it("leaves it null where no single device owns the beat", () => {
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(journey, walkToFailure(), "commit_first")
    );

    for (const beat of beats.filter((candidate) => candidate.kind !== "observe")) {
      expect(`${beat.kind} device: ${beat.device}`).toBe(`${beat.kind} device: null`);
    }
  });

  it("repeats the device in the heading, so nothing depends on the eyebrow", () => {
    // The eyebrow is aria-hidden. The heading has to carry the fact.
    const beat = resolveJourneyBeats(
      buildPacketJourneyView(journey, advance(BEGUN, journey), "demonstrate")
    ).find((candidate) => candidate.kind === "observe");

    expect(beat?.heading.startsWith(beat?.device ?? "")).toBe(true);
  });
});


/* ------------------------------------------------------------------ *
 * CONSECUTIVE SCREENS MUST ADVANCE
 *
 * The pane shows ONE beat at a time, so the beat list is a sequence of screens.
 * Founder UAT walked Mission 8 and found the same explanation on three of them
 * in a row: the feedback said "what actually happened", Continue showed the
 * same paragraph as the observation, and Continue again showed the same reason
 * the feedback had already offered.
 *
 * The requirement is not "never repeat a fact". It is that a learner must never
 * have to read substantially the same explanation twice in order to progress.
 * ------------------------------------------------------------------ */

describe("no two consecutive beats say the same thing", () => {
  /** Every distinct screen a learner walks, from Start to the repair. */
  function walk(
    parameters: LearnerPacketJourneyParameters
  ): readonly (readonly JourneyBeat[])[] {
    const screens: (readonly JourneyBeat[])[] = [];
    let state = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);

    for (let step = 0; step <= parameters.stages.length + 6; step += 1) {
      const view = buildPacketJourneyView(parameters, state, "commit_first");
      screens.push(resolveJourneyBeats(view));

      if (view.pendingPrediction !== null) {
        state = commitPrediction(
          state,
          view.pendingPrediction.stageId,
          view.pendingPrediction.options[0] ?? ""
        );
        continue;
      }

      if (view.knowledgeCheck !== null && view.knowledgeCheck.answer === null) {
        state = answerKnowledgeCheck(
          state,
          view.knowledgeCheck.checkId,
          view.knowledgeCheck.options[0] ?? ""
        );
        continue;
      }

      if (view.canAdvance) {
        state = advance(state, parameters);
        continue;
      }

      break;
    }

    return screens;
  }

  /*
    WHAT THIS NORMALISATION ACTUALLY PROTECTS AGAINST — read this before
    trusting the tests below.

    It lowercases and collapses everything that is not a letter or a digit. So
    it catches the SAME STRING reaching the learner twice, however it was
    quoted, spaced, capitalised or punctuated on the way — which is the whole
    of the defect these tests exist for, because both copies came from one
    authored field.

    It does NOT detect paraphrase. Two sentences teaching the identical idea in
    different words pass this cleanly, and no reasonable amount of string
    processing would change that. Judging whether two explanations are the same
    explanation is Human UAT's, and CURR-009 section 14a keeps it there.

    That limit is why the ownership suite below exists as well: rather than
    hunting for similar text, it asserts that each authored paragraph is
    RENDERED BY EXACTLY ONE REGION. A paraphrase can still slip past; the same
    paragraph rendered twice cannot.
  */
  const normalise = (text: string): string =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  /** Every line a single beat puts in front of the learner, disclosure included. */
  function linesOf(beat: JourneyBeat): readonly string[] {
    return [...beat.body, ...(beat.more === null ? [] : [beat.more])];
  }

  it("never repeats a line from one beat in the beat after it", () => {
    for (const screen of walk(journey)) {
      for (let index = 1; index < screen.length; index += 1) {
        const previous = screen[index - 1];
        const current = screen[index];
        if (previous === undefined || current === undefined) continue;

        for (const line of linesOf(current)) {
          if (normalise(line).length < 40) continue;

          const repeated = linesOf(previous).some(
            (earlier) => normalise(earlier) === normalise(line)
          );

          expect(
            `${previous.kind} -> ${current.kind} repeats a paragraph: ${repeated}`
          ).toBe(`${previous.kind} -> ${current.kind} repeats a paragraph: false`);
        }
      }
    }
  });

  it("never shows the same paragraph twice anywhere on one screen", () => {
    for (const screen of walk(journey)) {
      const seen = new Set<string>();

      for (const beat of screen) {
        for (const line of linesOf(beat)) {
          const key = normalise(line);
          if (key.length < 40) continue;

          expect(`duplicated on one screen: ${seen.has(key)}`).toBe(
            "duplicated on one screen: false"
          );
          seen.add(key);
        }
      }
    }
  });
});

describe("answer feedback resolves the answer, and stops there", () => {
  const graded: LearnerPacketJourneyParameters = {
    ...journey,
    stages: journey.stages.map((stage) =>
      stage.prediction === undefined
        ? stage
        : {
            ...stage,
            prediction: { ...stage.prediction, correctOption: "Discard it" }
          }
    )
  };

  function afterPredicting(option: string): PacketJourneyViewState {
    let state = advance(BEGUN, graded);
    state = commitPrediction(state, "s2", option);
    return advance(state, graded);
  }

  it("does not carry the narration the next beat will show", () => {
    const state = afterPredicting("Forward it");
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(graded, state, "commit_first")
    );

    const feedback = beats.find((beat) => beat.kind === "feedback");
    const observe = beats.find((beat) => beat.kind === "observe");

    expect(feedback?.body.join(" ")).not.toContain(observe?.body[0] ?? "@@");
  });

  it("does not carry the reason the beat after that will show", () => {
    const state = afterPredicting("Forward it");
    const view = buildPacketJourneyView(graded, state, "commit_first");
    const beats = resolveJourneyBeats(view);

    const feedback = beats.find((beat) => beat.kind === "feedback");
    const explain = beats.find((beat) => beat.kind === "explain");

    expect(feedback?.more).toBeNull();
    expect(explain?.body.length ?? 0).toBeGreaterThan(0);
  });

  it("still tells the learner what they chose and what was expected", () => {
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(graded, afterPredicting("Forward it"), "commit_first")
    );
    const feedback = beats.find((beat) => beat.kind === "feedback");

    expect(feedback?.heading).toBe("Not quite");
    expect(feedback?.body.join(" ")).toContain("You predicted: Forward it");
    expect(feedback?.body.join(" ")).toContain("The expected answer: Discard it");
  });

  it("expires once the learner advances past the stage it resolved", () => {
    // Founder UAT: stage 1's whole explanation was still the first thing on the
    // stop screen, on all three reasoning screens, and after the repair.
    const resolved = buildPacketJourneyView(
      graded,
      afterPredicting("Discard it"),
      "commit_first"
    );
    expect(resolved.resolvedPrediction).not.toBeNull();

    /*
      The fixture stops at s2, so this journey cannot advance past the stage it
      resolved. The expiry itself is asserted directly: a resolution belongs to
      the LAST revealed stage, and reading one stage earlier finds none.
    */
    const earlier = buildPacketJourneyView(
      graded,
      advance(BEGUN, graded),
      "commit_first"
    );

    expect(earlier.stages.length).toBe(1);
    expect(earlier.stages[0]?.committedPrediction).toBeUndefined();
    expect(earlier.resolvedPrediction).toBeNull();
  });
});

describe("every answered check resolves, not only the last one", () => {
  /** Two checks on the stage the fault stops at. */
  const sequenced: LearnerPacketJourneyParameters = {
    ...journey,
    stages: journey.stages.map((stage, index) =>
      index === 1
        ? {
            ...stage,
            knowledgeChecks: [
              {
                checkId: "c1",
                prompt: "What does the stop rule out?",
                options: ["Everything", "The devices that received nothing"],
                correctOption: "The devices that received nothing",
                explanation: "A device can only mishandle what it was given."
              },
              {
                checkId: "c2",
                prompt: "What should you inspect next?",
                options: ["PC-A's configuration", "The cable"],
                correctOption: "PC-A's configuration",
                explanation: "The stop was at PC-A, so the inspection stays there."
              }
            ]
          }
        : stage
    )
  };

  it("gives feedback on the first check while the second is being asked", () => {
    // Founder UAT: answering the first two of three reasoning steps produced
    // no feedback at all — the pane went straight to the next prompt.
    const state = answerKnowledgeCheck(walkToFailure(), "c1", "Everything");
    const view = buildPacketJourneyView(sequenced, state, "commit_first");

    expect(view.resolvedCheck?.checkId).toBe("c1");
    expect(view.resolvedCheck?.correct).toBe(false);
    expect(view.knowledgeCheck?.checkId).toBe("c2");
    expect(view.knowledgeCheck?.answer).toBeNull();
  });

  it("puts that feedback before the question that follows it", () => {
    const state = answerKnowledgeCheck(walkToFailure(), "c1", "Everything");
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(sequenced, state, "commit_first")
    );

    const feedback = beats.findIndex((beat) => beat.kind === "feedback");
    const question = beats.findIndex((beat) => beat.kind === "question");

    expect(feedback).toBeGreaterThanOrEqual(0);
    expect(question).toBeGreaterThan(feedback);
  });

  it("keeps the check's own explanation, which appears nowhere else", () => {
    const state = answerKnowledgeCheck(walkToFailure(), "c1", "Everything");
    const feedback = resolveJourneyBeats(
      buildPacketJourneyView(sequenced, state, "commit_first")
    ).find((beat) => beat.kind === "feedback");

    expect(feedback?.body.join(" ")).toContain(
      "A device can only mishandle what it was given."
    );
  });

  it("lets the questions own the diagnosis, rather than restating it", () => {
    // Before and after the reasoning: the symptom beat's optional depth is the
    // same explanation the checks make the learner derive.
    let state = walkToFailure();
    for (const [checkId, option] of [
      ["c1", "The devices that received nothing"],
      ["c2", "PC-A's configuration"]
    ]) {
      const open = resolveJourneyBeats(
        buildPacketJourneyView(sequenced, state, "commit_first")
      ).find((beat) => beat.kind === "symptom");

      expect(open?.more).toBeNull();
      state = answerKnowledgeCheck(state, checkId ?? "", option ?? "");
    }

    const done = resolveJourneyBeats(
      buildPacketJourneyView(sequenced, state, "commit_first")
    ).find((beat) => beat.kind === "symptom");

    expect(done?.more).toBeNull();
  });

  it("still offers the diagnosis on a stage that asks no questions", () => {
    // The withholding is scoped to stages that make the learner reason. A stop
    // with no checks keeps its optional depth.
    const symptom = resolveJourneyBeats(
      buildPacketJourneyView(journey, walkToFailure(), "commit_first")
    ).find((beat) => beat.kind === "symptom");

    expect(symptom?.more).not.toBeNull();
  });

  it("clears the resolved check once the learner acts on a repair", () => {
    const answered = answerKnowledgeCheck(
      walkToFailure(),
      "c1",
      "The devices that received nothing"
    );
    const repaired = applyAction(answered, "add-vlan-20", true);

    expect(
      buildPacketJourneyView(sequenced, repaired, "commit_first").resolvedCheck
    ).toBeNull();
  });
});


/* ------------------------------------------------------------------ *
 * ONE REGION OWNS EACH AUTHORED PARAGRAPH
 *
 * The pane renders more than beats. Above the beat card sits a live region that
 * announces what changed, and the workspace beside it carries standing context.
 * Founder UAT found the live region ending with the stage's whole narration
 * while the observation beat showed the same paragraph directly underneath —
 * the same explanation, twice, on one screen.
 *
 * The suite above walks BEATS. It could not have caught this, because the
 * announcement is not a beat. These walk every region a learner can see.
 * ------------------------------------------------------------------ */

describe("no authored paragraph is rendered by two regions at once", () => {
  /** Every visible region of one screen, each tagged with who rendered it. */
  function regionsOf(
    parameters: LearnerPacketJourneyParameters,
    state: PacketJourneyViewState
  ): readonly { readonly region: string; readonly text: string }[] {
    const view = buildPacketJourneyView(parameters, state, "commit_first");
    const regions: { region: string; text: string }[] = [
      { region: "announcement", text: view.announcement }
    ];

    resolveJourneyBeats(view).forEach((beat, index) => {
      for (const line of beat.body) {
        regions.push({ region: `beat ${index} (${beat.kind})`, text: line });
      }
      if (beat.more !== null) {
        regions.push({ region: `beat ${index} (${beat.kind}) disclosure`, text: beat.more });
      }
    });

    for (const row of view.quickReference) {
      regions.push({ region: "quick reference", text: row.value });
    }

    for (const shown of view.deviceFacts) {
      for (const fact of shown.facts) {
        regions.push({ region: "current network details", text: fact.value });
      }
    }

    return regions;
  }

  /** Every paragraph the CURRICULUM authored as teaching for this journey. */
  function authoredTeaching(
    parameters: LearnerPacketJourneyParameters
  ): readonly string[] {
    const paragraphs: string[] = [];

    for (const stage of parameters.stages) {
      paragraphs.push(stage.narration);
      if (stage.decision !== undefined) paragraphs.push(stage.decision);
      for (const check of stage.knowledgeChecks ?? []) {
        paragraphs.push(check.explanation);
      }
    }

    if (parameters.fault !== undefined) {
      paragraphs.push(parameters.fault.symptom);
      if (parameters.fault.explanation !== undefined) {
        paragraphs.push(parameters.fault.explanation);
      }
    }

    // Long enough to be teaching rather than a label. A device name appearing
    // in two places is orientation, and orientation is supposed to repeat.
    return paragraphs.filter((text) => text.length >= 60);
  }

  /** Every state a learner passes through, from Start to the last stage. */
  function walkStates(
    parameters: LearnerPacketJourneyParameters
  ): readonly PacketJourneyViewState[] {
    const states: PacketJourneyViewState[] = [];
    let state = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);

    for (let step = 0; step <= parameters.stages.length + 8; step += 1) {
      states.push(state);
      const view = buildPacketJourneyView(parameters, state, "commit_first");

      if (view.pendingPrediction !== null) {
        state = commitPrediction(
          state,
          view.pendingPrediction.stageId,
          view.pendingPrediction.options[0] ?? ""
        );
        continue;
      }

      if (view.knowledgeCheck !== null && view.knowledgeCheck.answer === null) {
        state = answerKnowledgeCheck(
          state,
          view.knowledgeCheck.checkId,
          view.knowledgeCheck.options[0] ?? ""
        );
        continue;
      }

      if (view.canAdvance) {
        state = advance(state, parameters);
        continue;
      }

      break;
    }

    return states;
  }

  const contains = (haystack: string, needle: string): boolean =>
    haystack.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
      .includes(needle.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());

  /**
   * The REAL authored journeys, not only the fixtures.
   *
   * Mutation testing caught this: the fixture's paragraphs are short — "Router-1
   * discards the request." is 29 characters — so the length floor below skipped
   * every one of them, and putting the narration back into the stop
   * announcement passed cleanly. The defect the Founder found was in the
   * authored course, and this is the course.
   */
  function authoredJourneys(): readonly LearnerPacketJourneyParameters[] {
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    return parsed.document.missions.flatMap((mission) =>
      mission.steps.flatMap((step) =>
        step.content.type === "interaction" &&
        step.content.parameters.interactionType === "packet_journey"
          ? [step.content.parameters as LearnerPacketJourneyParameters]
          : []
      )
    );
  }

  it("renders each authored paragraph in at most one region per screen", () => {
    /*
      The ownership invariant, and the reason this suite exists rather than a
      second string comparison: it does not know which paragraph the defect was
      about. It asks, of every authored paragraph on every screen, how many
      regions are rendering it — and one is the only acceptable answer.
    */
    for (const parameters of [journey, checkedJourney, ...authoredJourneys()]) {
      for (const state of walkStates(parameters)) {
        const regions = regionsOf(parameters, state);

        for (const paragraph of authoredTeaching(parameters)) {
          const owners = regions
            .filter((entry) => contains(entry.text, paragraph))
            .map((entry) => entry.region);

          expect(
            `"${paragraph.slice(0, 40)}…" rendered by ${owners.length} region(s): ${owners.join(", ")}`
          ).toBe(
            `"${paragraph.slice(0, 40)}…" rendered by ${Math.min(owners.length, 1)} region(s): ${owners.slice(0, 1).join(", ")}`
          );
        }
      }
    }
  });

  it("keeps the detailed narration out of the live region entirely", () => {
    // The specific ownership the Founder UAT failure came from: the live region
    // announces THAT the moment changed and where; the beat card teaches.
    for (const parameters of [journey, checkedJourney, ...authoredJourneys()]) {
      for (const state of walkStates(parameters)) {
        const view = buildPacketJourneyView(parameters, state, "commit_first");

        for (const stage of parameters.stages) {
          for (const teaching of [stage.narration, stage.decision]) {
            if (teaching === undefined || teaching.length < 60) continue;

            expect(
              `announcement carries teaching: ${contains(view.announcement, teaching)}`
            ).toBe("announcement carries teaching: false");
          }
        }
      }
    }
  });

  it("still says where the traffic is, and which link it crossed", () => {
    // Concise is not empty. The live region is the ONLY text naming the link
    // crossed — the drawn wire is aria-hidden — so that must survive.
    let state = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    state = commitPrediction(state, "s2", "Discard it");
    state = advance(advance(state, journey), journey);

    const view = buildPacketJourneyView(journey, state, "commit_first");

    expect(view.announcement).toContain("PC-A");
    expect(view.announcement.length).toBeGreaterThan(10);
  });

  it("names what the device is doing, from the author's own phrase", () => {
    const acting: LearnerPacketJourneyParameters = {
      ...journey,
      stages: journey.stages.map((stage, index) =>
        index === 0 ? { ...stage, action: "deciding how to send it" } : stage
      )
    };

    const view = buildPacketJourneyView(acting, advance(BEGUN, acting), "commit_first");

    expect(view.announcement).toContain("Deciding how to send it.");
  });

  it("falls back to the outcome when the author wrote no action", () => {
    // A journey authored before `action` existed still announces something.
    const view = buildPacketJourneyView(journey, advance(BEGUN, journey), "commit_first");

    expect(view.announcement).toContain("PC-A");
    expect(view.announcement.trim().endsWith(".")).toBe(true);
  });
});


/* ------------------------------------------------------------------ *
 * A GRADED PREDICTION RESOLVES WITH A REASON
 *
 * Architect ruling: where a prediction has an objectively correct answer, the
 * learner commits first, then gets the verdict, what was expected if they were
 * wrong, and why — in words, with no scoring of any kind.
 * ------------------------------------------------------------------ */

describe("a graded prediction gives the verdict and the reason", () => {
  const WHY = "PC-A has one connection, and it leads to Switch-1.";

  const explained: LearnerPacketJourneyParameters = {
    ...journey,
    stages: journey.stages.map((stage) =>
      stage.prediction === undefined
        ? stage
        : {
            ...stage,
            prediction: {
              ...stage.prediction,
              correctOption: "Discard it",
              explanation: WHY
            }
          }
    )
  };

  function afterAnswering(option: string): PacketJourneyViewState {
    let state = advance(BEGUN, explained);
    state = commitPrediction(state, "s2", option);
    return advance(state, explained);
  }

  it("reveals no correctness before the learner commits", () => {
    const asking = buildPacketJourneyView(explained, atPrediction(), "commit_first");

    expect(asking.pendingPrediction).not.toBeNull();
    expect(asking.resolvedPrediction).toBeNull();

    for (const beat of resolveJourneyBeats(asking)) {
      const text = `${beat.heading} ${beat.body.join(" ")} ${beat.more ?? ""}`;
      expect(`${beat.kind} leaks the answer: ${text.includes(WHY)}`).toBe(
        `${beat.kind} leaks the answer: false`
      );
    }
  });

  it("says the answer was right, and why", () => {
    const beat = resolveJourneyBeats(
      buildPacketJourneyView(explained, afterAnswering("Discard it"), "commit_first")
    ).find((candidate) => candidate.kind === "feedback");

    expect(beat?.heading).toBe("Correct prediction");
    expect(beat?.body.join(" ")).toContain(WHY);
  });

  it("says the answer was wrong, what was expected, and why", () => {
    const beat = resolveJourneyBeats(
      buildPacketJourneyView(explained, afterAnswering("Forward it"), "commit_first")
    ).find((candidate) => candidate.kind === "feedback");

    expect(beat?.heading).toBe("Not quite");
    expect(beat?.body.join(" ")).toContain("You predicted: Forward it");
    expect(beat?.body.join(" ")).toContain("The expected answer: Discard it");
    expect(beat?.body.join(" ")).toContain(WHY);
  });

  it("does not put the reason on the beat that follows it", () => {
    // The feedback owns why the answer was right; the observation owns what
    // the network did. Exact-text ownership — paraphrase is Tier 3 review.
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(explained, afterAnswering("Forward it"), "commit_first")
    );

    for (const beat of beats.filter((candidate) => candidate.kind !== "feedback")) {
      const text = `${beat.body.join(" ")} ${beat.more ?? ""}`;
      expect(`${beat.kind} repeats the reason: ${text.includes(WHY)}`).toBe(
        `${beat.kind} repeats the reason: false`
      );
    }
  });

  it("adds no score, streak or praise to the resolution", () => {
    const state = afterAnswering("Discard it");
    const recorded = JSON.stringify(state).toLowerCase();

    for (const forbidden of ["score", "streak", "grade", "correct", "points"]) {
      expect(`recorded ${forbidden}: ${recorded.includes(forbidden)}`).toBe(
        `recorded ${forbidden}: false`
      );
    }

    const beat = resolveJourneyBeats(
      buildPacketJourneyView(explained, state, "commit_first")
    ).find((candidate) => candidate.kind === "feedback");

    const said = `${beat?.heading} ${beat?.body.join(" ")}`.toLowerCase();
    for (const noise of ["well done", "great", "excellent", "nice", "keep it up"]) {
      expect(`${noise}: ${said.includes(noise)}`).toBe(`${noise}: false`);
    }
  });

  it("leaves an ungraded prediction resolving by comparison", () => {
    // Missions that have not been repaired keep the original behaviour: no
    // verdict, and the observation is the answer.
    const ungraded = resolveJourneyBeats(
      buildPacketJourneyView(journey, afterAnswering("Forward it"), "commit_first")
    );

    expect(journey.stages[1]?.prediction?.correctOption).toBeUndefined();

    const beat = resolveJourneyBeats(
      buildPacketJourneyView(
        journey,
        (() => {
          let state = advance(BEGUN, journey);
          state = commitPrediction(state, "s2", "Forward it");
          return advance(state, journey);
        })(),
        "commit_first"
      )
    ).find((candidate) => candidate.kind === "feedback");

    expect(beat?.heading).toBe("Your prediction");
    expect(ungraded.length).toBeGreaterThan(0);
  });
});


/* ------------------------------------------------------------------ *
 * FOUNDER VIDEO UAT — JOURNEY SEMANTICS
 *
 * Traffic does not arrive at its own source; a stage number describes the
 * network rather than the pane; and a leg is named in the direction it was
 * actually travelled.
 * ------------------------------------------------------------------ */

/**
 * A journey that crosses one link in both directions.
 *
 * The reverse-direction case is the whole point: the same `link-a` carries the
 * outbound leg PC-A to Router-1 and the return leg Router-1 to PC-A. Direction
 * therefore cannot come from how the link is stored.
 */
const roundTrip: LearnerPacketJourneyParameters = {
  ...journey,
  stages: [
    { ...journey.stages[0]!, outcome: "proceeds" },
    {
      stageId: "r1",
      atNodeId: "r-1",
      narration: "It reaches Router-1.",
      outcome: "proceeds",
      viaLinkId: "link-a"
    },
    {
      stageId: "r2",
      atNodeId: "pc-a",
      narration: "The reply reaches PC-A.",
      outcome: "proceeds",
      viaLinkId: "link-a"
    }
  ],
  fault: undefined,
  actions: []
};

describe("a device is described by its role on the current leg", () => {
  it("says the traffic STARTED at a stage it reached without crossing a link", () => {
    const layout = buildTopologyLayout(
      buildPacketJourneyObservationModel(journey as never, {
        revealedStageCount: 1,
        appliedActionId: null,
        committedPredictions: {}
      } as never),
      null
    );

    if (layout.state !== "available") throw new Error("unavailable");

    const source = layout.devices.find((device) => device.nodeId === "pc-a");

    expect(source?.state).toBe("origin");
    expect(describeDeviceState("origin")).toBe("Started here");
    expect(describeDeviceState("origin")).not.toBe("Arrived here");
  });

  it("says a later arrival ARRIVED, even at the device that started it", () => {
    /*
      Leg-aware, not node-aware. Mission 6's reply comes back to PC-A across a
      real link, and that IS an arrival — the role follows the current leg.
    */
    const layout = buildTopologyLayout(
      buildPacketJourneyObservationModel(roundTrip as never, {
        revealedStageCount: 3,
        appliedActionId: null,
        committedPredictions: {}
      } as never),
      null
    );

    if (layout.state !== "available") throw new Error("unavailable");

    // PC-A started the journey AND is where the reply lands. The role follows
    // the current leg, so it is no longer the origin.
    expect(layout.devices.find((device) => device.nodeId === "pc-a")?.state).not.toBe(
      "origin"
    );
  });

  it("keeps the other role wordings distinct", () => {
    expect(describeDeviceState("visited")).toBe("Passed through");
    expect(describeDeviceState("confirmed")).toBe("Delivered here");
  });
});

describe("the visible step number counts network stages", () => {
  it("numbers an observation by the stage, out of the journey's total", () => {
    for (let revealed = 1; revealed <= journey.stages.length; revealed += 1) {
      const view = buildPacketJourneyView(journey, revealTo(revealed), "demonstrate");
      const observe = resolveJourneyBeats(view).find(
        (beat) => beat.kind === "observe"
      );

      expect(`@${revealed} step`).toBe(`@${revealed} step`);
      expect(observe?.journeyStep).toEqual({
        current: revealed,
        total: journey.stages.length
      });
    }
  });

  it("gives no number to a beat that is not a network stage", () => {
    const beats = resolveJourneyBeats(
      buildPacketJourneyView(journey, walkToFailure(), "commit_first")
    );

    for (const beat of beats.filter((candidate) => candidate.kind !== "observe")) {
      expect(`${beat.kind} numbered: ${beat.journeyStep !== null}`).toBe(
        `${beat.kind} numbered: false`
      );
    }
  });

  it("does not restart when a presentation sub-beat appears", () => {
    // The Founder video defect: answering a question reset "Step 1 of 3".
    const before = resolveJourneyBeats(
      buildPacketJourneyView(journey, revealTo(2), "demonstrate")
    ).find((beat) => beat.kind === "observe")?.journeyStep;

    const state = commitPrediction(revealTo(1), "s2", "Discard it");
    const after = resolveJourneyBeats(
      buildPacketJourneyView(journey, advance(state, journey), "commit_first")
    ).find((beat) => beat.kind === "observe")?.journeyStep;

    expect(after?.current).toBe(before?.current);
    expect(after?.total).toBe(journey.stages.length);
  });
});

describe("the current leg is named in the direction it was travelled", () => {
  it("puts the device the traffic came from first", () => {
    const view = buildPacketJourneyView(journey, revealTo(2), "demonstrate");
    const leg = view.quickReference.find((row) => row.label === "Current leg");

    // Stage 2 arrives at Router-1 from PC-A across link-a.
    expect(leg?.value.indexOf("PC-A")).toBeGreaterThanOrEqual(0);
    expect(leg?.value.indexOf("PC-A")).toBeLessThan(
      leg?.value.indexOf("Router-1") ?? Number.MAX_SAFE_INTEGER
    );
  });

  it("reverses when the same link is travelled the other way", () => {
    /*
      The Founder video defect: the final leg read "Printer … to Switch-1"
      when the print request had moved from Switch-1 to the Printer. Direction
      must come from the journey, not from how the link happens to be stored.
    */
    // Stage 2 is the outbound leg; stage 3 is the reply across the same link.
    let state = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    state = advance(advance(advance(state, roundTrip), roundTrip), roundTrip);

    const view = buildPacketJourneyView(roundTrip, state, "demonstrate");
    const leg = view.quickReference.find((row) => row.label === "Current leg");

    /*
      The reply travelled Router-1 → PC-A across the SAME link the outbound leg
      used, so Router-1 is named first this time. Compared against the OUTBOUND
      leg's own text, which is the honest form of "it reversed".
    */
    let outboundState = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    outboundState = advance(advance(outboundState, roundTrip), roundTrip);

    const outbound = buildPacketJourneyView(roundTrip, outboundState, "demonstrate")
      .quickReference.find((row) => row.label === "Current leg")?.value ?? "";

    const returnLeg = leg?.value ?? "";

    expect(outbound.length).toBeGreaterThan(0);
    expect(returnLeg.length).toBeGreaterThan(0);

    // Same link, opposite order.
    expect(`the return leg reversed: ${returnLeg !== outbound}`).toBe(
      "the return leg reversed: true"
    );
    expect(returnLeg.startsWith("Router-1")).toBe(true);
    expect(outbound.startsWith("PC-A")).toBe(true);
  });
});

describe("completion language matches the scenario", () => {
  it("does not call a successful delivery a repair", () => {
    const finished = buildPacketJourneyView(
      completingJourney,
      (() => {
        let state = applyAction(walkToStop(), "add-vlan-20");
        state = advance(state, completingJourney);
        return advance(state, completingJourney);
      })(),
      "demonstrate"
    );

    expect(`announces a repair: ${finished.announcement.includes("Fixed")}`).toBe(
      "announces a repair: false"
    );
  });
});

/* ------------------------------------------------------------------ *
 * FOUNDER VIDEO UAT — MISSION 1 FINAL CLEANUP
 *
 * Four defects the Founder read on screen, each protected against the REAL
 * authored course rather than a fixture. Three of the four had already had
 * their rendering removed once and came back, because the STATE that produced
 * them was still reachable.
 * ------------------------------------------------------------------ */

describe("committing a prediction shows what happened", () => {
  /** Mission 1's authored journey, through the real parser. */
  function missionOneJourney(): LearnerPacketJourneyParameters {
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const mission = parsed.document.missions.find(
      (candidate) => candidate.stableId === "nf-m1-what-a-network-is"
    );
    const step = mission?.steps.find(
      (candidate) => candidate.content.type === "interaction"
    );

    if (step === undefined || step.content.type !== "interaction") {
      throw new Error("Mission 1 authors no interaction");
    }
    if (step.content.parameters.interactionType !== "packet_journey") {
      throw new Error("Mission 1's interaction is not a packet journey");
    }

    return step.content.parameters as LearnerPacketJourneyParameters;
  }

  /** Commit Mission 1's only prediction, the way the component does. */
  function afterCommit(): {
    readonly parameters: LearnerPacketJourneyParameters;
    readonly view: PacketJourneyView;
  } {
    const parameters = missionOneJourney();
    const stage = parameters.stages[0];
    if (stage?.prediction === undefined) {
      throw new Error("Mission 1's first stage asks no prediction");
    }

    const state = commitPrediction(
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      stage.stageId,
      stage.prediction.options[0]!,
      parameters
    );

    return { parameters, view: buildPacketJourneyView(parameters, state) };
  }

  it("reveals the stage the prediction was about, with nothing in between", () => {
    // The defect, at the level that produced it. Removing the interstitial
    // BEAT was not enough: the state it rendered survived, the pane fell
    // through to the orientation, and the live region went on announcing the
    // recording. This asserts the state itself is unreachable.
    const { view } = afterCommit();

    expect(view.stages).toHaveLength(1);
    expect(view.pendingCommitment).toBeNull();
  });

  it("announces what the device is doing, not that a form was submitted", () => {
    const { view } = afterCommit();

    expect(view.announcement).toBe("At PC-A. Sending the print request.");

    for (const interstitial of [
      "Prediction recorded",
      "Nothing has been sent yet",
      "to see what actually happens"
    ]) {
      expect(
        `announces "${interstitial}": ${view.announcement.includes(interstitial)}`
      ).toBe(`announces "${interstitial}": false`);
    }
  });

  it("puts the learner on the resolution of their own prediction", () => {
    const { view } = afterCommit();
    const beats = resolveJourneyBeats(view);

    // Not an acknowledgement screen: the first thing after committing is the
    // comparison between what they said and what happened.
    expect(beats.some((beat) => beat.kind === "feedback")).toBe(true);
    expect(beats.some((beat) => beat.kind === "start")).toBe(false);

    const rendered = JSON.stringify(beats);
    expect(rendered).not.toContain("Prediction recorded");
    expect(rendered).not.toContain("Nothing has been sent yet");
  });

  it("says what to do first, rather than offering an action that is not next", () => {
    // "Ready to start. Send the print request when you are ready." described
    // an action the learner could not take: the journey opens on a prediction.
    const parameters = missionOneJourney();
    const view = buildPacketJourneyView(
      parameters,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(view.announcement).toBe(
      "Before anything moves, predict which device receives the print request first."
    );
  });

  it("keeps the start form for a journey that opens on no question", () => {
    // Generic, not written for Mission 1. Where the send IS the next action,
    // the status still says so.
    const view = buildPacketJourneyView(
      journey,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(view.announcement).toContain("Ready to start");
  });

  /* ---------------------------------------------------------------- *
   * The full text account, before anything has been revealed
   * ---------------------------------------------------------------- */

  it("opens the text account with the same sentence as the status line", () => {
    /*
      Founder video UAT: the "Full text account" disclosure sat directly
      beneath a status line asking for a prediction, and said "Nothing has
      been sent yet. Send the print request to begin." — telling the learner
      to do the one thing they were not being asked to do yet.

      Neither surface was wrong about its own state. They were two independent
      sentences about one state. There is one sentence now, and this asserts
      both surfaces read it.
    */
    const parameters = missionOneJourney();
    const view = buildPacketJourneyView(
      parameters,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    expect(view.textTrace[0]).toBe(
      "Before anything moves, predict which device receives the print request first."
    );
    expect(view.textTrace[0]).toBe(view.announcement);
  });

  it("never tells the learner to send before they have predicted", () => {
    const parameters = missionOneJourney();
    const view = buildPacketJourneyView(
      parameters,
      INITIAL_PACKET_JOURNEY_VIEW_STATE
    );

    // Read across the WHOLE account, not only its first line: a second entry
    // saying it would be the same defect one row lower.
    const account = view.textTrace.join(" ");

    for (const stale of [
      "Nothing has been sent yet",
      "to begin",
      "Send the print request"
    ]) {
      expect(`the account says "${stale}": ${account.includes(stale)}`).toBe(
        `the account says "${stale}": false`
      );
    }
  });

  it("gives each authored journey the opening its own first stage calls for", () => {
    /*
      The generic half, against the real course and in both directions.

      Mission 8's first stage asks a prediction too, so this repair changes it
      as well as Mission 1 — and nothing guarded Mission 8's opening before
      this. Mission 6's first stage asks nothing, so the send IS its next
      action and it must keep saying so. A fix that told every journey to
      predict first would be a new defect in the other direction, and this is
      the test that would catch it.
    */
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const openingOf = (missionStableId: string) => {
      const step = parsed.document.missions
        .find((mission) => mission.stableId === missionStableId)
        ?.steps.find((candidate) => candidate.content.type === "interaction");

      if (step === undefined || step.content.type !== "interaction") {
        throw new Error(`${missionStableId} authors no interaction`);
      }

      const parameters = step.content
        .parameters as LearnerPacketJourneyParameters;
      const view = buildPacketJourneyView(
        parameters,
        INITIAL_PACKET_JOURNEY_VIEW_STATE
      );

      return {
        asks: parameters.stages[0]?.prediction !== undefined,
        trace: view.textTrace[0] ?? "",
        announcement: view.announcement
      };
    };

    const mission6 = openingOf("nf-m6-routers-and-the-journey");
    expect(mission6.asks).toBe(false);
    expect(mission6.trace).toContain("Ready to start");
    expect(mission6.trace).toBe(mission6.announcement);

    const mission8 = openingOf("nf-m8-when-it-does-not-work");
    expect(mission8.asks).toBe(true);
    expect(mission8.trace).toContain("Before anything moves, predict");
    expect(mission8.trace).toBe(mission8.announcement);
    expect(mission8.trace).not.toContain("Nothing has been sent yet");
  });

  it("keeps the two surfaces in step across every authored journey", () => {
    // The invariant rather than three examples: whatever the status line says
    // before anything is revealed, the account's opening entry says too.
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    for (const mission of parsed.document.missions) {
      for (const step of mission.steps) {
        if (step.content.type !== "interaction") continue;
        if (step.content.parameters.interactionType !== "packet_journey") continue;

        const view = buildPacketJourneyView(
          step.content.parameters as LearnerPacketJourneyParameters,
          INITIAL_PACKET_JOURNEY_VIEW_STATE
        );

        expect(view.textTrace[0]).toBe(view.announcement);
      }
    }
  });
});

describe("the source stays the source for the whole leg", () => {
  /** Every device's state label, at each revealed stage of a journey. */
  function labelsAlong(
    parameters: LearnerPacketJourneyParameters
  ): readonly Readonly<Record<string, string>>[] {
    const along: Record<string, string>[] = [];
    let state = INITIAL_PACKET_JOURNEY_VIEW_STATE;

    for (let step = 0; step < parameters.stages.length; step += 1) {
      const next = parameters.stages[state.progress.revealedStageCount];
      state =
        next?.prediction === undefined
          ? advance(state, parameters)
          : commitPrediction(
              state,
              next.stageId,
              next.prediction.options[0]!,
              parameters
            );

      const model = buildPacketJourneyObservationModel(parameters, state.progress);
      const layout = buildTopologyLayout(model, parameters.traffic.sourceNodeId);
      if (layout.state !== "available") throw new Error("no layout");

      along.push(
        Object.fromEntries(
          layout.devices.map((device) => [device.label, device.stateLabel])
        )
      );
    }

    return along;
  }

  it("keeps PC-A as the origin through Mission 1's whole forward journey", () => {
    // Founder video UAT: PC-A said "Started here", then silently became
    // "Passed through" once the request reached Switch-1 — so by the delivery
    // screen the picture no longer said where the request came from.
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const step = parsed.document.missions
      .find((mission) => mission.stableId === "nf-m1-what-a-network-is")
      ?.steps.find((candidate) => candidate.content.type === "interaction");

    if (step === undefined || step.content.type !== "interaction") {
      throw new Error("Mission 1 authors no interaction");
    }

    const along = labelsAlong(
      step.content.parameters as LearnerPacketJourneyParameters
    );

    expect(along).toHaveLength(3);
    for (const stage of along) {
      expect(stage["PC-A"]).toBe("Started here");
    }

    expect(along[1]?.["Switch-1"]).toBe("Arrived here");
    expect(along[2]?.["Switch-1"]).toBe("Passed through");
    expect(along[2]?.["Printer"]).toBe("Delivered here");
  });

  it("moves the origin to the device that starts the return leg", () => {
    // The rule is per LEG and knows nothing about PC-A. Mission 6's reply
    // starts at PC-C, which becomes the origin from that stage on — and the
    // return arrives back at PC-A across a real link, where PC-A is an
    // arrival like any other.
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const step = parsed.document.missions
      .find((mission) => mission.stableId === "nf-m6-routers-and-the-journey")
      ?.steps.find((candidate) => candidate.content.type === "interaction");

    if (step === undefined || step.content.type !== "interaction") {
      throw new Error("Mission 6 authors no interaction");
    }

    const along = labelsAlong(
      step.content.parameters as LearnerPacketJourneyParameters
    );

    // Outbound: PC-A is the origin.
    expect(along[0]?.["PC-A"]).toBe("Started here");
    expect(along[3]?.["PC-A"]).toBe("Started here");

    // The reply starts at PC-C, and the origin moves with it.
    expect(along[4]?.["PC-C"]).toBe("Started here");
    expect(along[4]?.["PC-A"]).toBe("Passed through");

    // And PC-A is a destination on the way back.
    expect(along[7]?.["PC-A"]).toBe("Delivered here");
  });
});

describe("the live region says where, what moved, and what changed", () => {
  it("uses the arrival form when traffic crossed a connection", () => {
    // Founder video UAT read "At Switch-1. Carrying the print request. Arrived
    // across PC-A Network interface to Switch-1 Port 1." — three clauses, two
    // naming the same event, and a link description written for a reference
    // row rather than for a sentence.
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const step = parsed.document.missions
      .find((mission) => mission.stableId === "nf-m1-what-a-network-is")
      ?.steps.find((candidate) => candidate.content.type === "interaction");

    if (step === undefined || step.content.type !== "interaction") {
      throw new Error("Mission 1 authors no interaction");
    }

    const parameters = step.content.parameters as LearnerPacketJourneyParameters;
    let state = commitPrediction(
      INITIAL_PACKET_JOURNEY_VIEW_STATE,
      parameters.stages[0]!.stageId,
      parameters.stages[0]!.prediction!.options[0]!,
      parameters
    );
    state = advance(state, parameters);

    expect(buildPacketJourneyView(parameters, state).announcement).toBe(
      "At Switch-1. The print request arrived from PC-A on port 1."
    );

    state = advance(state, parameters);
    expect(buildPacketJourneyView(parameters, state).announcement).toBe(
      "At Printer. The print request was delivered."
    );
  });

  it("never repeats the stage narration it sits above", () => {
    // The ownership rule: the card owns the teaching, the region owns the
    // change. Asserted over every authored journey, at every state.
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    for (const mission of parsed.document.missions) {
      for (const step of mission.steps) {
        if (step.content.type !== "interaction") continue;
        if (step.content.parameters.interactionType !== "packet_journey") continue;

        const parameters = step.content
          .parameters as LearnerPacketJourneyParameters;

        let state = INITIAL_PACKET_JOURNEY_VIEW_STATE;
        for (let i = 0; i < parameters.stages.length; i += 1) {
          const next = parameters.stages[state.progress.revealedStageCount];
          state =
            next?.prediction === undefined
              ? advance(state, parameters)
              : commitPrediction(
                  state,
                  next.stageId,
                  next.prediction.options[0]!,
                  parameters
                );

          const announcement = buildPacketJourneyView(parameters, state)
            .announcement;

          for (const stage of parameters.stages) {
            if (stage.narration.length < 40) continue;
            expect(announcement).not.toContain(stage.narration);
          }
        }
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * FOUNDER VIDEO UAT — the workspace control names its own action
 * ------------------------------------------------------------------ */

describe("the workspace control", () => {
  it("offers to expand and to collapse", () => {
    expect(describeWorkspaceExpandLabel()).toBe("Expand network workspace");
    expect(describeWorkspaceCollapseLabel()).toBe("Collapse network workspace");
  });

  it("does not promise to reveal something already on screen", () => {
    /*
      Founder video UAT read "Open the network workspace" while the network
      workspace was already visible. Nothing is hidden behind the control: the
      same tree is re-laid out as a full-viewport overlay. "Open" described an
      action that does not occur.
    */
    const labels = [
      describeWorkspaceExpandLabel(),
      describeWorkspaceCollapseLabel()
    ].join(" ");

    for (const stale of ["Open the network", "Close the network"]) {
      expect(`still says "${stale}": ${labels.includes(stale)}`).toBe(
        `still says "${stale}": false`
      );
    }
  });

  it("names an action in each direction, and two different ones", () => {
    // One control in two states. If both read the same the learner could not
    // tell which way it would go.
    expect(describeWorkspaceExpandLabel()).not.toBe(
      describeWorkspaceCollapseLabel()
    );
  });
});

/* ------------------------------------------------------------------ *
 * MISSION 2 FOUNDER UAT — finishing the activity, and simultaneity in words
 * ------------------------------------------------------------------ */

describe("the control that finishes an activity", () => {
  it("names finishing the activity, not finishing the journey", () => {
    /*
      The journey reaching its authored end is the interaction's own state. It
      is not the learner saying they have READ the end — and the steps that
      follow a required activity wait on the second, not the first.

      Founder video UAT recorded that difference next door, on the
      near-transfer check, where releasing the next step on the last commit put
      new instruction underneath feedback nobody had read yet. The same gap
      exists here, so the same explicit act closes it.
    */
    expect(describeFinishActivityLabel()).toBe("Finish activity");
  });
});

describe("a stage where several connections were busy at once", () => {
  /**
   * Mission 2 Founder UAT — the announcement's departures clause.
   *
   * The drawn wires are `aria-hidden`, so before this a stage where a switch
   * sent copies out of two connections announced EXACTLY what a single-link
   * stage announced. A learner using a screen reader was told one delivery had
   * arrived somewhere, and the whole point of the stage — that it happened in
   * several places at the same moment — existed only in the picture.
   *
   * Generic here, as everything in this file is: the fixture is a switch with
   * three connections and no mission attached to it.
   */
  const flooding: LearnerPacketJourneyParameters = {
    interactionType: "packet_journey",
    nodes: [
      {
        nodeId: "pc-a",
        label: "PC-A",
        role: "host",
        interfaces: [
          { interfaceId: "pc-a-eth0", label: "eth0", attributes: [] }
        ]
      },
      {
        nodeId: "sw-1",
        label: "Switch-1",
        role: "switch",
        interfaces: [
          { interfaceId: "sw-1-p1", label: "Port 1", attributes: [] },
          { interfaceId: "sw-1-p2", label: "Port 2", attributes: [] },
          { interfaceId: "sw-1-p3", label: "Port 3", attributes: [] }
        ]
      },
      {
        nodeId: "pc-b",
        label: "PC-B",
        role: "host",
        interfaces: [
          { interfaceId: "pc-b-eth0", label: "eth0", attributes: [] }
        ]
      },
      {
        nodeId: "printer",
        label: "Printer",
        role: "printer",
        interfaces: [
          { interfaceId: "printer-eth0", label: "eth0", attributes: [] }
        ]
      }
    ],
    links: [
      {
        linkId: "link-a",
        label: "PC-A to Switch-1 port 1",
        endpoints: ["pc-a-eth0", "sw-1-p1"]
      },
      {
        linkId: "link-b",
        label: "PC-B to Switch-1 port 2",
        endpoints: ["pc-b-eth0", "sw-1-p2"]
      },
      {
        linkId: "link-p",
        label: "Printer to Switch-1 port 3",
        endpoints: ["printer-eth0", "sw-1-p3"]
      }
    ],
    traffic: {
      label: "one delivery",
      sourceNodeId: "pc-a",
      destinationNodeId: "pc-b",
      startActionLabel: "Send the delivery"
    },
    stages: [
      {
        stageId: "s1",
        atNodeId: "pc-a",
        action: "sending the delivery",
        narration: "PC-A sends.",
        outcome: "proceeds"
      },
      {
        stageId: "s2",
        atNodeId: "sw-1",
        action: "sending a copy out of every other connection",
        narration: "It arrives, and copies leave on both other connections.",
        outcome: "proceeds",
        viaLinkId: "link-a",
        alsoOnLinkIds: ["link-b", "link-p"]
      }
    ],
    actions: [],
    confirmation: {
      narration: "Delivered.",
      summary: "One delivery, several connections."
    }
  };

  /** The same journey with the simultaneity removed, and nothing else changed. */
  const singleLink: LearnerPacketJourneyParameters = {
    ...flooding,
    stages: [
      flooding.stages[0]!,
      { ...flooding.stages[1]!, alsoOnLinkIds: undefined }
    ]
  };

  const at = (
    parameters: LearnerPacketJourneyParameters,
    count: number
  ): string => {
    let state = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    for (let step = 0; step < count; step += 1) {
      state = advance(state, parameters);
    }
    return buildPacketJourneyView(parameters, state).announcement;
  };

  it("names every connection the author said was busy, by its authored label", () => {
    const announcement = at(flooding, 2);

    // The links' OWN authored labels, in authored order — not a description
    // assembled here from node and interface names. If an author renames a
    // connection, this sentence renames with it and no other rule changes.
    expect(announcement).toContain("At the same time:");
    expect(announcement).toContain("PC-B to Switch-1 port 2");
    expect(announcement).toContain("Printer to Switch-1 port 3");
  });

  it("leaves a single-connection stage's sentence byte-identical", () => {
    /*
      The compatibility guarantee, and the reason the clause is APPENDED rather
      than woven in. Seven missions author no simultaneous links, and none of
      them may have their live region reworded by a repair they did not ask
      for.
    */
    const simultaneous = at(flooding, 2);
    const single = at(singleLink, 2);

    expect(single).not.toContain("At the same time");
    expect(simultaneous.startsWith(single)).toBe(true);
    expect(simultaneous.slice(single.length)).toBe(
      " At the same time: PC-B to Switch-1 port 2; Printer to Switch-1 port 3."
    );
  });

  it("says who was busy and never why", () => {
    /*
      The clause names authored connections and nothing else. The reason a
      switch used them is the stage's `decision`, which is withheld at
      protected support levels — a sentence here that explained it would leak
      exactly what the projection dropped.
    */
    const announcement = at(flooding, 2);

    for (const leaked of [
      "because",
      "has no record",
      "does not know",
      "learned",
      "flood"
    ]) {
      expect(`announces "${leaked}": ${announcement.toLowerCase().includes(leaked)}`).toBe(
        `announces "${leaked}": false`
      );
    }
  });

  it("says nothing extra at a stage that named no further connection", () => {
    // The first stage of the flooding fixture names none, so it must announce
    // exactly what it announced before the clause existed.
    expect(at(flooding, 1)).not.toContain("At the same time");
  });
});

/* ------------------------------------------------------------------ *
 * MISSION 2 FOUNDER UAT — what is moving RIGHT NOW
 * ------------------------------------------------------------------ */

describe("a stage may say something else is moving, and the words follow it", () => {
  /*
    Founder UAT round 2, and the defect this whole block exists for.

    Mission 2's reply travels from PC-B back to PC-A. Every surface that
    describes the current moment used to reach into the journey's own traffic
    block instead, so the marker moved one way while the quick reference read
    From PC-A / To PC-B, the orientation line said PC-A is sending, and the
    live region announced that the outbound delivery had arrived.

    The stage override is an AUTHORED fact. Nothing below infers direction from
    the marker, from a link, from a role, or from which stage came before.
  */

  const twoWay: LearnerPacketJourneyParameters = {
    interactionType: "packet_journey",
    nodes: [
      {
        nodeId: "pc-a",
        label: "PC-A",
        role: "host",
        interfaces: [
          { interfaceId: "pc-a-eth0", label: "eth0", attributes: [] }
        ]
      },
      {
        nodeId: "sw-1",
        label: "Switch-1",
        role: "switch",
        interfaces: [
          { interfaceId: "sw-1-p1", label: "Port 1", attributes: [] },
          { interfaceId: "sw-1-p2", label: "Port 2", attributes: [] }
        ]
      },
      {
        nodeId: "pc-b",
        label: "PC-B",
        role: "host",
        interfaces: [
          { interfaceId: "pc-b-eth0", label: "eth0", attributes: [] }
        ]
      }
    ],
    links: [
      {
        linkId: "link-a",
        label: "PC-A to Switch-1 port 1",
        endpoints: ["pc-a-eth0", "sw-1-p1"]
      },
      {
        linkId: "link-b",
        label: "PC-B to Switch-1 port 2",
        endpoints: ["pc-b-eth0", "sw-1-p2"]
      }
    ],
    traffic: {
      label: "one local delivery",
      sourceNodeId: "pc-a",
      destinationNodeId: "pc-b",
      startActionLabel: "Send the delivery"
    },
    stages: [
      {
        stageId: "s1",
        atNodeId: "pc-a",
        action: "sending the delivery",
        narration: "PC-A sends.",
        outcome: "proceeds"
      },
      {
        stageId: "s2",
        atNodeId: "pc-b",
        action: "receiving the delivery",
        narration: "It arrives at PC-B.",
        outcome: "proceeds",
        viaLinkId: "link-b"
      },
      {
        stageId: "s3",
        atNodeId: "pc-a",
        action: "receiving PC-B's reply",
        narration: "PC-B's answer comes back.",
        outcome: "proceeds",
        viaLinkId: "link-a",
        traffic: {
          label: "PC-B's reply",
          sourceNodeId: "pc-b",
          destinationNodeId: "pc-a"
        }
      },
      {
        stageId: "s4",
        atNodeId: "pc-b",
        action: "receiving the second delivery",
        narration: "PC-A sends again, and it arrives.",
        outcome: "proceeds",
        viaLinkId: "link-b"
      }
    ],
    actions: [],
    confirmation: {
      narration: "Both directions completed.",
      summary: "One delivery and one reply."
    }
  };

  const viewAt = (
    parameters: LearnerPacketJourneyParameters,
    revealed: number
  ) => {
    let state = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    for (let step = 0; step < revealed; step += 1) {
      state = advance(state, parameters, "demonstrate");
    }
    return buildPacketJourneyView(parameters, state);
  };

  const rowValue = (
    view: ReturnType<typeof buildPacketJourneyView>,
    label: string
  ): string | undefined =>
    view.quickReference.find((row) => row.label === label)?.value;

  it("resolves the journey's own traffic when a stage authors none", () => {
    // The compatibility guarantee, at the resolver itself. Seven of the
    // course's eight journeys author no override anywhere, and none of them
    // may change by one character.
    expect(
      resolveEffectiveTraffic(twoWay.traffic, twoWay.stages[1])
    ).toEqual({
      label: "one local delivery",
      sourceNodeId: "pc-a",
      destinationNodeId: "pc-b"
    });

    // Including when there is no stage at all, before anything is revealed.
    expect(resolveEffectiveTraffic(twoWay.traffic, undefined)).toEqual({
      label: "one local delivery",
      sourceNodeId: "pc-a",
      destinationNodeId: "pc-b"
    });
  });

  it("drops the start label, which no stage can answer for", () => {
    // `startActionLabel` belongs to the control that BEGINS the journey. A
    // stage override cannot carry one — `STAGE_TRAFFIC_KEYS` refuses the key —
    // so the resolved value must not offer one either, or a surface would read
    // a start label from a moment that has no start.
    expect(
      "startActionLabel" in resolveEffectiveTraffic(twoWay.traffic, undefined)
    ).toBe(false);
  });

  it("reads the stage's own traffic when it authors one", () => {
    expect(
      resolveEffectiveTraffic(twoWay.traffic, twoWay.stages[2])
    ).toEqual({
      label: "PC-B's reply",
      sourceNodeId: "pc-b",
      destinationNodeId: "pc-a"
    });
  });

  it("names the reply in the quick reference, in all three rows at once", () => {
    // The Founder's own reading: rows 4 and 5 already tracked the reply
    // because they were per-stage, and rows 1 to 3 did not. The panel
    // contradicted itself.
    const reply = viewAt(twoWay, 3);

    expect(rowValue(reply, "From")).toContain("PC-B");
    expect(rowValue(reply, "To")).toContain("PC-A");
    expect(rowValue(reply, "Carrying")).toBe("PC-B's reply");
    expect(rowValue(reply, "Now at")).toBe("PC-A");
  });

  it("names the reply in the orientation, the summary and the live region", () => {
    const reply = viewAt(twoWay, 3);

    expect(reply.orientation.title).toContain("PC-B's reply");
    expect(reply.orientation.summary).toContain("PC-B is sending");
    expect(reply.trafficSummary).toBe(
      "Following PC-B's reply from PC-B to PC-A."
    );
    expect(reply.announcement).toContain("PC-B's reply");
    expect(reply.currentEvent.headline).toContain("PC-B's reply");
  });

  it("names the reply in the device status a learner opens", () => {
    // The inspector says what happened to ONE device. Told "one local
    // delivery is here now" while the reply is what arrived, it describes a
    // different journey than the one on screen.
    const reply = viewAt(twoWay, 3);
    const pcA = reply.nodes.find((node) => node.nodeId === "pc-a");

    expect(pcA?.journeyStatus.label).toBe("PC-B's reply is here now.");
  });

  it("goes back to the journey's traffic on a stage that authors none", () => {
    // Not sticky. An override describes ONE moment, and a later stage that
    // says nothing is the original delivery again.
    const outbound = viewAt(twoWay, 2);

    expect(rowValue(outbound, "Carrying")).toBe("one local delivery");
    expect(rowValue(outbound, "From")).toContain("PC-A");
    expect(rowValue(outbound, "To")).toContain("PC-B");
    expect(outbound.orientation.summary).toContain("PC-A is sending");
    expect(outbound.trafficSummary).toBe(
      "Following one local delivery from PC-A to PC-B."
    );

    // And AFTER the reply, which is the direction that would break if an
    // override were allowed to stick.
    const second = viewAt(twoWay, 4);

    expect(rowValue(second, "Carrying")).toBe("one local delivery");
    expect(rowValue(second, "From")).toContain("PC-A");
    expect(rowValue(second, "To")).toContain("PC-B");
  });

  it("makes the authored source this leg's origin on the topology", () => {
    /*
      Architect ruling, and deliberately narrow.

      The existing origin rule reads "a leg begins where the traffic crossed
      nothing to arrive". Mission 2's reply crosses a real link to reach
      Switch-1, so that rule keeps captioning PC-A "Started here" while PC-B's
      answer is what is travelling — the right answer to the question the rule
      asks, and the wrong answer to the one the learner is asking.
    */
    const reply = viewAt(twoWay, 3);
    const byId = new Map(
      reply.topology.state === "available"
        ? reply.topology.devices.map((device) => [device.nodeId, device])
        : []
    );

    expect(byId.get("pc-b")?.state).toBe("origin");
    expect(byId.get("pc-b")?.stateLabel).toBe("Started here");
  });

  it("leaves the origin alone on a stage that authors no traffic", () => {
    // The legacy rule, untouched. This is what keeps Mission 6's return leg
    // turning at PC-C without any mission authoring an override.
    const outbound = viewAt(twoWay, 2);
    const byId = new Map(
      outbound.topology.state === "available"
        ? outbound.topology.devices.map((device) => [device.nodeId, device])
        : []
    );

    expect(byId.get("pc-a")?.state).toBe("origin");
  });
});

describe("Mission 2's authored reply, through the real course", () => {
  /*
    The runtime probe. The block above proves the rule on a fixture; this
    proves the rule fires on the curriculum the learner actually receives,
    parsed by the real parser.

    Without this, a repair could be correct in the abstract and still miss
    Mission 2 — which is exactly what happened: the contract carried
    `stage.traffic` from the document all the way to the browser, every
    contract test passed, and no surface read it.
  */
  const missionTwoJourney = (): LearnerPacketJourneyParameters => {
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const mission = parsed.document.missions.find(
      (candidate) => candidate.stableId === "nf-m2-inside-one-network"
    );
    if (mission === undefined) throw new Error("Mission 2 is not authored");

    const step = mission.steps.find(
      (candidate) =>
        candidate.content.type === "interaction" &&
        candidate.content.parameters.interactionType === "packet_journey"
    );
    if (step === undefined || step.content.type !== "interaction") {
      throw new Error("Mission 2 authors no packet journey");
    }

    return step.content.parameters as LearnerPacketJourneyParameters;
  };

  const viewAtStage = (stageId: string) => {
    const parameters = missionTwoJourney();
    const index = parameters.stages.findIndex(
      (stage) => stage.stageId === stageId
    );
    if (index === -1) throw new Error(`Mission 2 has no stage ${stageId}`);

    let state = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
    for (let step = 0; step <= index; step += 1) {
      state = advance(state, parameters, "demonstrate");
    }

    return buildPacketJourneyView(parameters, state);
  };

  const rowValue = (
    view: ReturnType<typeof buildPacketJourneyView>,
    label: string
  ): string | undefined =>
    view.quickReference.find((row) => row.label === label)?.value;

  for (const stageId of ["d4-pc-b-replies", "d5-reply-reaches-pc-a"]) {
    it(`${stageId} describes PC-B's reply, from PC-B to PC-A`, () => {
      const view = viewAtStage(stageId);

      expect(rowValue(view, "Carrying")).toBe("PC-B's reply");
      expect(rowValue(view, "From")).toContain("PC-B");
      expect(rowValue(view, "To")).toContain("PC-A");
      expect(view.orientation.title).toContain("PC-B's reply");
      expect(view.orientation.summary).toContain("PC-B is sending");
      expect(view.trafficSummary).toBe(
        "Following PC-B's reply from PC-B to PC-A."
      );
      expect(view.announcement).toContain("PC-B's reply");
    });

    it(`${stageId} starts its leg at PC-B on the topology`, () => {
      const view = viewAtStage(stageId);
      const pcB =
        view.topology.state === "available"
          ? view.topology.devices.find((device) => device.nodeId === "pc-b")
          : undefined;

      expect(pcB?.state).toBe("origin");
      expect(pcB?.stateLabel).toBe("Started here");
    });
  }

  it("still describes the outbound delivery on the stages that author none", () => {
    // d1 to d3 and d6 to d8 carry no override, so the mission's own traffic is
    // what is moving there. A repair that made the reply sticky would rename
    // the second pass — the half of the comparison the mission is built on.
    for (const stageId of ["d3-copies-arrive", "d8-pc-b-receives"]) {
      const view = viewAtStage(stageId);

      expect(`${stageId} carrying: ${rowValue(view, "Carrying")}`).toBe(
        `${stageId} carrying: one local-network delivery`
      );
      expect(rowValue(view, "From")).toContain("PC-A");
      expect(rowValue(view, "To")).toContain("PC-B");
    }
  });

  /* ------------------------------------------------------------------ *
     THE SECOND DELIVERY IS A SECOND DELIVERY, NOT A CONTINUATION.

     Founder UAT, journey step 6 of 8. The cards are asserted in
     `topology-layout.test.ts`; these own the half a learner reads in WORDS —
     what the journey says is moving, and what the device inspector says about
     each machine.

     Both matter, and they must agree with the cards. A card reading "Not
     involved so far" beside a status line reading "Passed through here." is
     the same defect in a new place, and the two surfaces accumulate their
     history separately.
   * ------------------------------------------------------------------ */
  describe("the second delivery", () => {
    const statusAt = (stageId: string) => {
      const view = viewAtStage(stageId);
      return new Map(
        view.nodes.map((node) => [node.nodeId, node.journeyStatus.label])
      );
    };

    const factsAt = (stageId: string, nodeId: string) =>
      viewAtStage(stageId)
        .nodes.find((node) => node.nodeId === nodeId)
        ?.shownFacts?.facts.map((fact) => `${fact.label}=${fact.value}`) ?? [];

    it("carries the mission's own delivery again, not PC-B's reply", () => {
      // d6 authors no traffic override, so what is moving reverts to the
      // journey's own delivery. The reply must not bleed across the boundary.
      const view = viewAtStage("d6-pc-a-sends-again");

      expect(rowValue(view, "Carrying")).toBe("one local-network delivery");
      expect(rowValue(view, "From")).toContain("PC-A");
      expect(rowValue(view, "To")).toContain("PC-B");
      expect(view.trafficSummary).toBe(
        "Following one local-network delivery from PC-A to PC-B."
      );
      expect(view.trafficSummary).not.toContain("reply");
    });

    it("says the delivery is at PC-A and nowhere else", () => {
      const status = statusAt("d6-pc-a-sends-again");

      expect(status.get("pc-a")).toBe("One local-network delivery is here now.");

      // The inspector agrees with the cards, which read "Not involved so far".
      for (const nodeId of ["sw-1", "pc-b", "printer"]) {
        expect(`${nodeId}: ${status.get(nodeId)}`).toBe(
          `${nodeId}: Not involved so far.`
        );
      }
    });

    it("does not describe PC-B or the Printer as participants at d6", () => {
      const view = viewAtStage("d6-pc-a-sends-again");
      const status = statusAt("d6-pc-a-sends-again");

      // Participation is a statement about the moment on screen, and neither
      // machine is part of this one.
      for (const nodeId of ["pc-b", "printer"]) {
        expect(status.get(nodeId)).not.toBe("Participating in this step.");
        expect(status.get(nodeId)).not.toBe("Passed through here.");
        expect(
          `${nodeId} current: ${view.nodes.find((n) => n.nodeId === nodeId)?.current}`
        ).toBe(`${nodeId} current: false`);
      }
    });

    it("keeps what Switch-1 learned across the whole second delivery", () => {
      // The comparison the mission is built on. These are authored
      // `deviceFacts`, read from the stage on screen, and the delivery
      // scoping must not touch them.
      for (const stageId of [
        "d6-pc-a-sends-again",
        "d7-switch-sends-once",
        "d8-pc-b-receives"
      ]) {
        expect(`${stageId}: ${factsAt(stageId, "sw-1").join(", ")}`).toBe(
          `${stageId}: PC-A=Port 1, PC-B=Port 2`
        );
      }
    });

    it("leaves the Printer off the path it took, once the journey ends", () => {
      // d8 previously read "Passed through here." on the Printer, directly
      // contradicting the narration beside it.
      expect(statusAt("d8-pc-b-receives").get("printer")).toBe(
        "Not part of the path one local-network delivery took."
      );
      expect(statusAt("d8-pc-b-receives").get("pc-b")).toBe("Delivered here.");
    });

    it("leaves the reply's own stages describing the reply", () => {
      // d4 and d5 are frozen. The delivery boundary is at d6, so both stages
      // still accumulate the first delivery's history exactly as before.
      for (const stageId of ["d4-pc-b-replies", "d5-reply-reaches-pc-a"]) {
        const status = statusAt(stageId);
        expect(`${stageId} printer: ${status.get("printer")}`).toBe(
          `${stageId} printer: Passed through here.`
        );
      }

      expect(statusAt("d4-pc-b-replies").get("sw-1")).toBe(
        "PC-B's reply is here now."
      );
      expect(statusAt("d5-reply-reaches-pc-a").get("pc-a")).toBe(
        "PC-B's reply is here now."
      );
    });
  });

  /* ------------------------------------------------------------------ *
     THE SOURCE-LEARNING CHECK'S FEEDBACK BELONGS TO THE SOURCE-LEARNING CHECK.

     Founder UAT, rendered: answering "Why can Switch-1 record PC-A on port 1
     after this arrival?" CORRECTLY displayed the flooding explanation --
     "Switch-1 uses every other port so the delivery can reach whichever port
     leads to PC-B" -- which is stage d2's `decision`, and answers a different
     question.

     Neither the authored data nor the beat list was wrong. The defect was the
     pane's CURSOR: `PacketJourney` shows one beat at a time and resets its
     index when `currentEvent.token` moves. Answering splices a feedback beat
     in at the FRONT, shifting every later beat one place, but the token
     counted reveals, the current stage, the applied action and committed
     predictions -- not answered checks. The index therefore stayed put and
     rendered whatever had shifted into it: the "Why" beat, one place earlier.

     The token test above owns the mechanism for every mission. These own the
     mission the Founder actually walked, through the real parser.
   * ------------------------------------------------------------------ */
  describe("the source-learning check's feedback", () => {
    const CHECK_ID = "m2-d2-source-learning";
    const STAGE_ID = "d2-switch-sends-copies";

    /** The journey, and the state with d2 revealed and nothing answered. */
    const atSourceLearning = () => {
      const parameters = missionTwoJourney();
      const index = parameters.stages.findIndex(
        (stage) => stage.stageId === STAGE_ID
      );
      if (index === -1) throw new Error(`Mission 2 has no stage ${STAGE_ID}`);

      const stage = parameters.stages[index];
      const check = stage?.knowledgeChecks?.find(
        (candidate) => candidate.checkId === CHECK_ID
      );
      if (stage === undefined || check === undefined) {
        throw new Error(`Mission 2 no longer authors ${CHECK_ID} on ${STAGE_ID}`);
      }

      let state = startJourney(INITIAL_PACKET_JOURNEY_VIEW_STATE);
      for (let step = 0; step <= index; step += 1) {
        state = advance(state, parameters, "demonstrate");
      }

      return { parameters, stage, check, state };
    };

    /** Answered with the AUTHORED correct option, never a literal. */
    const answeredCorrectly = () => {
      const context = atSourceLearning();
      return {
        ...context,
        state: answerKnowledgeCheck(
          context.state,
          CHECK_ID,
          context.check.correctOption ?? ""
        )
      };
    };

    it("is authored on the check itself, not borrowed from the stage", () => {
      const { stage, check } = atSourceLearning();

      expect(check.prompt).toBe(
        "Why can Switch-1 record PC-A on port 1 after this arrival?"
      );
      expect(check.correctOption).toBe(
        "Because the delivery arrived on port 1 with PC-A as its source"
      );
      // The check's own reasoning: a switch learns from what it receives.
      expect(check.explanation).toContain("learns from the source");
      expect(check.explanation).toContain("arrived on port 1");
      // The stage's decision explains FLOODING. Two questions, two answers.
      expect(stage.decision).toContain("whichever port leads to PC-B");
      expect(check.explanation).not.toBe(stage.decision);
    });

    it("renders the check's explanation as the feedback, and nothing else", () => {
      const { parameters, check, state } = answeredCorrectly();

      const feedback = resolveJourneyBeats(
        buildPacketJourneyView(parameters, state, "demonstrate")
      ).find((beat) => beat.kind === "feedback");

      expect(feedback?.heading).toBe("Correct");
      expect(feedback?.body.join(" ")).toContain(check.explanation);
    });

    it("cannot render the flooding explanation as this check's feedback", () => {
      const { parameters, stage, state } = answeredCorrectly();

      for (const beat of resolveJourneyBeats(
        buildPacketJourneyView(parameters, state, "demonstrate")
      ).filter((candidate) => candidate.kind === "feedback")) {
        expect(beat.body.join(" ")).not.toContain(stage.decision ?? "");
        expect(beat.body.join(" ")).not.toContain("whichever port leads to PC-B");
      }
    });

    it("moves the change token, so the pane returns to the feedback beat", () => {
      // The repair itself. Without this the cursor never resets, and the beat
      // the learner lands on is whichever one shifted into their index.
      const before = atSourceLearning();
      const after = answeredCorrectly();

      const tokenOf = (context: typeof before) =>
        buildPacketJourneyView(context.parameters, context.state, "demonstrate")
          .currentEvent.token;

      expect(tokenOf(after)).not.toBe(tokenOf(before));

      // Beat 0 is where the reset lands, and it is the check's resolution.
      const beats = resolveJourneyBeats(
        buildPacketJourneyView(after.parameters, after.state, "demonstrate")
      );
      expect(activeJourneyBeat(beats, 0)?.kind).toBe("feedback");
      expect(activeJourneyBeat(beats, 0)?.heading).toBe("Correct");
    });

    it("still offers Send it to PC-B as the successor", () => {
      const before = atSourceLearning();
      const after = answeredCorrectly();

      // The successor is read from the stage the press will reveal, so
      // answering must not disturb it in either direction.
      expect(describeAdvanceLabel(before.state, before.parameters)).toBe(
        "Send it to PC-B"
      );
      expect(describeAdvanceLabel(after.state, after.parameters)).toBe(
        "Send it to PC-B"
      );
    });
  });
});
