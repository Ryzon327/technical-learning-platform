import { describe, expect, it } from "vitest";
import type {
  LearnerMissionStep,
  LearnerNearTransferStep
} from "@tlp/shared-types";
import {
  INITIAL_NEAR_TRANSFER_STATE,
  acknowledgeAnswer,
  activePhase,
  attemptedNearTransfer,
  activeQuestionIndex,
  buildStaticTopologyLayout,
  canCommit,
  commitAnswer,
  describeCommitLabel,
  describeMultipleChoiceHint,
  describeProgress,
  describeWithheldStepsNotice,
  hasUnattemptedInstruction,
  isComplete,
  isSelected,
  isSettled,
  requiredNearTransfer,
  resolveQuestion,
  toggleOption,
  visibleInstructionSteps,
  type NearTransferState
} from "./near-transfer-presentation";

/**
 * WP-NF-NT1 — the near-transfer presentation rules.
 *
 * The repository runs no rendered-DOM harness, so what a learner may see is a
 * pure function and is tested as one. The component draws exactly what these
 * return, and the two source-structure gates at the end of this file hold it
 * to that.
 *
 * Generic throughout: no mission, no course, no networking. The Mission 1
 * content is protected in the course's own suite.
 */

const STEP: LearnerNearTransferStep = {
  type: "near_transfer",
  title: "A title",
  framing: "Framing.",
  topology: {
    nodes: [
      { nodeId: "a", label: "A", role: "host" },
      { nodeId: "b", label: "B", role: "switch" },
      { nodeId: "c", label: "C", role: "router" }
    ],
    links: [
      { linkId: "ab", label: "A to B", endpoints: ["a", "b"] },
      { linkId: "cb", label: "C to B", endpoints: ["c", "b"] }
    ],
    externalNetworks: [
      { networkId: "beyond", label: "Somewhere else", attachedToNodeId: "c" }
    ],
    textEquivalent:
      "A connects to B. C connects to B. C also connects to somewhere else."
  },
  questions: [
    {
      questionStableId: "q1",
      type: "multiple_choice",
      prompt: "Which two?",
      options: [
        { optionId: "o1", text: "A text" },
        { optionId: "o2", text: "B text" },
        { optionId: "o3", text: "C text" }
      ]
    },
    {
      questionStableId: "q2",
      type: "single_choice",
      prompt: "Which one?",
      options: [
        { optionId: "p1", text: "P one" },
        { optionId: "p2", text: "P two" }
      ]
    }
  ],
  answers: {
    q1: { correctOptionIds: ["o1", "o3"], explanation: "The first reason." },
    q2: { correctOptionIds: ["p2"], explanation: "The second reason." }
  }
};

/** Answer one question, correctly or not, and read the feedback. */
function answer(
  state: NearTransferState,
  questionStableId: string,
  optionIds: readonly string[]
): NearTransferState {
  let next = state;
  const question = STEP.questions.find(
    (candidate) => candidate.questionStableId === questionStableId
  );
  if (question === undefined) throw new Error("no such question");

  for (const optionId of optionIds) {
    next = toggleOption(next, question, optionId);
  }
  return commitAnswer(next, questionStableId);
}

/* ------------------------------------------------------------------ *
 * Before commitment
 * ------------------------------------------------------------------ */

describe("before the learner commits", () => {
  it("offers no resolution at all", () => {
    // Tests 5 and 6 together, and they are the same fact: the expected answer
    // and the explanation both live inside the resolution, and there is no
    // resolution until the learner has answered. Nothing is filtered out —
    // there is nothing to filter.
    expect(resolveQuestion(STEP, INITIAL_NEAR_TRANSFER_STATE, "q1")).toBeNull();
  });

  it("still offers none once an option is merely selected", () => {
    const selected = toggleOption(
      INITIAL_NEAR_TRANSFER_STATE,
      STEP.questions[0]!,
      "o1"
    );

    expect(resolveQuestion(STEP, selected, "q1")).toBeNull();
  });

  it("will not commit an empty answer", () => {
    expect(canCommit(INITIAL_NEAR_TRANSFER_STATE, "q1")).toBe(false);
    expect(
      commitAnswer(INITIAL_NEAR_TRANSFER_STATE, "q1").committed
    ).toEqual([]);
  });

  it("allows commitment once something is chosen", () => {
    const selected = toggleOption(
      INITIAL_NEAR_TRANSFER_STATE,
      STEP.questions[0]!,
      "o1"
    );

    expect(canCommit(selected, "q1")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Choosing
 * ------------------------------------------------------------------ */

describe("choosing", () => {
  it("replaces the selection for a single-choice question", () => {
    let state = toggleOption(INITIAL_NEAR_TRANSFER_STATE, STEP.questions[1]!, "p1");
    state = toggleOption(state, STEP.questions[1]!, "p2");

    expect(isSelected(state, "q2", "p1")).toBe(false);
    expect(isSelected(state, "q2", "p2")).toBe(true);
  });

  it("accumulates the selection for a multiple-choice question", () => {
    let state = toggleOption(INITIAL_NEAR_TRANSFER_STATE, STEP.questions[0]!, "o1");
    state = toggleOption(state, STEP.questions[0]!, "o3");

    expect(isSelected(state, "q1", "o1")).toBe(true);
    expect(isSelected(state, "q1", "o3")).toBe(true);
  });

  it("removes a multiple-choice option chosen twice", () => {
    let state = toggleOption(INITIAL_NEAR_TRANSFER_STATE, STEP.questions[0]!, "o1");
    state = toggleOption(state, STEP.questions[0]!, "o1");

    expect(isSelected(state, "q1", "o1")).toBe(false);
  });

  it("freezes the selection once committed", () => {
    // Otherwise a learner could read the feedback and then change what they
    // had chosen, and the feedback on screen would be about an answer they no
    // longer gave.
    const committed = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o2"]);
    const after = toggleOption(committed, STEP.questions[0]!, "o1");

    expect(after).toBe(committed);
  });
});

/* ------------------------------------------------------------------ *
 * After commitment
 * ------------------------------------------------------------------ */

describe("after the learner commits", () => {
  it("says the verdict in a word, for a correct answer", () => {
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
    const resolution = resolveQuestion(STEP, state, "q1");

    // Test 7: correctness is a WORD, not a colour and not an icon.
    expect(resolution?.correct).toBe(true);
    expect(resolution?.verdict).toBe("Correct");
  });

  it("says the verdict in a word, for a wrong answer", () => {
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1"]);
    const resolution = resolveQuestion(STEP, state, "q1");

    expect(resolution?.correct).toBe(false);
    expect(resolution?.verdict).toBe("Not quite");
  });

  it("shows a wrong learner what they chose", () => {
    // Test 8, in the authored option text rather than an id, because "o1" is
    // not something a learner ever saw.
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o2"]);

    expect(resolveQuestion(STEP, state, "q1")?.selected).toEqual(["B text"]);
  });

  it("shows a wrong learner the expected answer", () => {
    // Test 9.
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o2"]);

    expect(resolveQuestion(STEP, state, "q1")?.expected).toEqual([
      "A text",
      "C text"
    ]);
  });

  it("does not repeat a correct learner's own answer back as the expectation", () => {
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q2", ["p2"]);

    expect(resolveQuestion(STEP, state, "q2")?.expected).toEqual([]);
  });

  it("shows the authored explanation either way", () => {
    // Test 10. The reason is the instruction; a learner who was right still
    // needs to know why, or they learned only that they guessed well.
    const right = answer(INITIAL_NEAR_TRANSFER_STATE, "q2", ["p2"]);
    const wrong = answer(INITIAL_NEAR_TRANSFER_STATE, "q2", ["p1"]);

    expect(resolveQuestion(STEP, right, "q2")?.explanation).toBe(
      "The second reason."
    );
    expect(resolveQuestion(STEP, wrong, "q2")?.explanation).toBe(
      "The second reason."
    );
  });

  it("resolves against the authored answer, not against the selection", () => {
    // The mutation this catches: a resolution that reported `correct: true`
    // for everything would still pass every test above that only checks a
    // correct path.
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o2", "o3"]);

    expect(resolveQuestion(STEP, state, "q1")?.correct).toBe(false);
  });

  it("emits nothing that counts", () => {
    // Test 11. Checked against the resolution's own field names: there is no
    // score, no percentage, no points, no streak and no attempt number for a
    // renderer to draw, so no gamification can appear without changing this
    // contract first.
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
    const resolution = resolveQuestion(STEP, state, "q1");

    expect(Object.keys(resolution ?? {}).sort()).toEqual([
      "correct",
      "expected",
      "explanation",
      "selected",
      "verdict"
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * One question at a time
 * ------------------------------------------------------------------ */

describe("question progression", () => {
  it("starts on the first question", () => {
    expect(activeQuestionIndex(STEP, INITIAL_NEAR_TRANSFER_STATE)).toBe(0);
    expect(activePhase(STEP, INITIAL_NEAR_TRANSFER_STATE)).toEqual({
      kind: "asking",
      questionStableId: "q1"
    });
  });

  it("shows the resolution instead of the question once answered", () => {
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1"]);

    expect(activePhase(STEP, state)).toEqual({
      kind: "resolved",
      questionStableId: "q1"
    });
  });

  it("does not advance until the learner has read the feedback", () => {
    // The screen must not carry the explanation for question 1 beside
    // question 2. Committing produces the verdict; acknowledging moves on.
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1"]);

    expect(activeQuestionIndex(STEP, state)).toBe(0);
    expect(activeQuestionIndex(STEP, acknowledgeAnswer(state, "q1"))).toBe(1);
  });

  it("refuses to acknowledge a question that was never answered", () => {
    const state = acknowledgeAnswer(INITIAL_NEAR_TRANSFER_STATE, "q1");

    expect(state).toBe(INITIAL_NEAR_TRANSFER_STATE);
  });

  it("is finished once every question has been read past", () => {
    let state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1"]);
    state = acknowledgeAnswer(state, "q1");
    state = answer(state, "q2", ["p1"]);
    state = acknowledgeAnswer(state, "q2");

    expect(activePhase(STEP, state)).toEqual({ kind: "complete" });
  });

  it("counts the question on screen, not the answers committed", () => {
    // Founder video UAT: submitting an answer advanced the counter while the
    // feedback for that same answer was still the only thing displayed, so
    // the learner read "Question 2 of 4" above question 1's verdict and
    // explanation. The counter was describing internal state, not the screen.
    expect(describeProgress(STEP, INITIAL_NEAR_TRANSFER_STATE)).toBe(
      "Question 1 of 2"
    );

    // Committed, and its feedback is what is on screen. Still question 1.
    const answered = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o2"]);
    expect(activePhase(STEP, answered)).toEqual({
      kind: "resolved",
      questionStableId: "q1"
    });
    expect(describeProgress(STEP, answered)).toBe("Question 1 of 2");

    // Only reading past it advances the number.
    expect(
      describeProgress(STEP, acknowledgeAnswer(answered, "q1"))
    ).toBe("Question 2 of 2");
  });

  it("reports where the learner is, and never how they are doing", () => {
    // Answered wrongly throughout; the line still only says where they are.
    let wrong = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o2"]);
    wrong = acknowledgeAnswer(wrong, "q1");

    expect(describeProgress(STEP, wrong)).toBe("Question 2 of 2");
    expect(describeProgress(STEP, wrong)).not.toMatch(/correct|wrong|score|%/i);
  });

  it("shows no counter once the activity is finished", () => {
    // Founder video UAT: an orphaned "Question 4 of 4" sat above the Mission 2
    // handoff after Finish. There is no question on screen then, so a counter
    // would be describing nothing.
    let done = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
    done = acknowledgeAnswer(done, "q1");
    done = answer(done, "q2", ["p2"]);
    done = acknowledgeAnswer(done, "q2");

    expect(activePhase(STEP, done)).toEqual({ kind: "complete" });
    expect(describeProgress(STEP, done)).toBeNull();
  });

  it("tells a multi-answer question apart in words", () => {
    expect(describeMultipleChoiceHint()).toBe("Select all that apply.");
    expect(describeCommitLabel()).toBe("Submit answer");
  });
});

/* ------------------------------------------------------------------ *
 * Completion, and what waits on it
 * ------------------------------------------------------------------ */

const STEPS: readonly LearnerMissionStep[] = [
  {
    stableId: "teaching",
    position: 0,
    content: { type: "concept", paragraphs: ["Taught."] }
  },
  { stableId: "check", position: 1, content: STEP },
  {
    stableId: "handoff",
    position: 2,
    content: { type: "concept", paragraphs: ["What comes next."] }
  }
];

describe("what the near-transfer check holds back", () => {
  it("withholds everything after it until every question is attempted", () => {
    // Test 18. The handoff answers the question the activity asks; on screen
    // from the start, it would answer it before the learner had tried.
    const visible = visibleInstructionSteps(STEPS, {});

    expect(visible.map((step) => step.stableId)).toEqual(["teaching", "check"]);
  });

  it("still withholds it after only some questions are answered", () => {
    const state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);

    expect(
      visibleInstructionSteps(STEPS, { check: state }).map((s) => s.stableId)
    ).toEqual(["teaching", "check"]);
  });

  it("still withholds it while the last answer's feedback is on screen", () => {
    /*
      Founder video UAT. Committing the final answer used to release the
      handoff in the same instant that answer's feedback appeared, so the
      mission's next instructional step sat underneath a verdict and
      explanation the learner had not read. Two instructional jobs at once.

      This is the exact moment: every question answered, the last one's
      feedback displayed, Finish not yet pressed.
    */
    let state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
    state = acknowledgeAnswer(state, "q1");
    state = answer(state, "q2", ["p2"]);

    expect(activePhase(STEP, state)).toEqual({
      kind: "resolved",
      questionStableId: "q2"
    });
    expect(
      visibleInstructionSteps(STEPS, { check: state }).map((s) => s.stableId)
    ).toEqual(["teaching", "check"]);
  });

  it("releases it once the last feedback has been read past", () => {
    let state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
    state = acknowledgeAnswer(state, "q1");
    state = answer(state, "q2", ["p2"]);
    state = acknowledgeAnswer(state, "q2");

    expect(
      visibleInstructionSteps(STEPS, { check: state }).map((s) => s.stableId)
    ).toEqual(["teaching", "check", "handoff"]);
  });

  it("releases it for a learner who got everything wrong", () => {
    // The whole completion doctrine in one assertion: this is ATTEMPTED, not
    // passed. A wrong answer is instruction. If this ever fails because a
    // threshold was introduced, the threshold is the defect.
    let state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o2"]);
    state = acknowledgeAnswer(state, "q1");
    state = answer(state, "q2", ["p1"]);
    state = acknowledgeAnswer(state, "q2");

    expect(isComplete(STEP, state)).toBe(true);
    expect(
      visibleInstructionSteps(STEPS, { check: state }).map((s) => s.stableId)
    ).toEqual(["teaching", "check", "handoff"]);
  });

  it("holds both the handoff and completion until Finish", () => {
    /*
      Architect ruling: visibility and eligibility now wait on the SAME event.

      They briefly differed — eligibility moved on the last commitment while
      the handoff waited for Finish — which let a learner mark the mission
      complete while the final verdict was still on screen. Reading the
      feedback is part of the instruction, so both wait for the learner to
      finish the activity.
    */
    let state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
    state = acknowledgeAnswer(state, "q1");
    state = answer(state, "q2", ["p2"]);

    // Attempted, but not settled: the next step waits, and so does the
    // mission.
    expect(isComplete(STEP, state)).toBe(true);
    expect(isSettled(STEP, state)).toBe(false);
    expect(visibleInstructionSteps(STEPS, { check: state })).toHaveLength(2);

    // Finish releases both together.
    const finished = acknowledgeAnswer(state, "q2");
    expect(isComplete(STEP, finished)).toBe(true);
    expect(isSettled(STEP, finished)).toBe(true);
    expect(visibleInstructionSteps(STEPS, { check: finished })).toHaveLength(3);
  });

  it("feeds completion eligibility from Finish, never from correctness", () => {
    /*
      Architect ruling. Eligibility waits for the activity to be FINISHED —
      every question attempted and its feedback read past — not merely for the
      answers to be committed. A learner reading the final verdict has not yet
      finished the instruction, and marking the mission complete underneath it
      was the behaviour that ruling removed.

      Correctness is not a gate and never becomes one: everything below is
      answered wrongly, and it still finishes.

      Pinned as a pure function because mutation testing proved the choice
      between two one-word-apart predicates cannot survive inline in a
      component with no test harness.
    */
    const check: LearnerMissionStep = {
      stableId: "check",
      position: 1,
      content: STEP
    };

    // Nothing answered.
    expect(requiredNearTransfer(check, {})).toBe(false);

    // Every question answered wrongly, the last feedback still on screen.
    // Attempted, but not finished: NOT yet eligible.
    let state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o2"]);
    state = answer(state, "q2", ["p1"]);

    expect(state.acknowledged).toEqual([]);
    expect(isComplete(STEP, state)).toBe(true);
    expect(requiredNearTransfer(check, { check: state })).toBe(false);

    // Finish settles it, and being wrong throughout changed nothing.
    let finished = acknowledgeAnswer(state, "q1");
    finished = acknowledgeAnswer(finished, "q2");
    expect(requiredNearTransfer(check, { check: finished })).toBe(true);

    // And a learner who was right throughout is in exactly the same place.
    let right = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
    right = acknowledgeAnswer(right, "q1");
    right = answer(right, "q2", ["p2"]);
    expect(requiredNearTransfer(check, { check: right })).toBe(false);

    right = acknowledgeAnswer(right, "q2");
    expect(requiredNearTransfer(check, { check: right })).toBe(true);
  });

  it("keeps the notice on attempts even though eligibility moved", () => {
    /*
      The decoupling, pinned. `hasUnattemptedInstruction` must NOT delegate to
      `requiredNearTransfer`: that one now reads SETTLED, so it reports
      "not done" for any blocking step by construction, and the stale
      "Answer the questions above to continue." would return underneath the
      final feedback — the defect the previous pass removed.

      This is the exact state where the two must disagree.
    */
    const check: LearnerMissionStep = {
      stableId: "check",
      position: 1,
      content: STEP
    };

    let state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
    state = acknowledgeAnswer(state, "q1");
    state = answer(state, "q2", ["p2"]);

    // Nothing left to answer...
    expect(attemptedNearTransfer(check, { check: state })).toBe(true);
    expect(hasUnattemptedInstruction(STEPS, { check: state })).toBe(false);

    // ...and not yet finished.
    expect(requiredNearTransfer(check, { check: state })).toBe(false);
  });

  it("has no opinion about a step that is not a near-transfer check", () => {
    // `null` is "not my kind of step", which is what keeps
    // `resolveRequiredInstruction` generic and keeps practice out of it.
    expect(requiredNearTransfer(STEPS[0]!, {})).toBeNull();
    expect(requiredNearTransfer(STEPS[2]!, {})).toBeNull();
  });

  it("settles regardless of correctness", () => {
    // `isSettled` counts feedback read, never answers right.
    let wrong = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o2"]);
    wrong = acknowledgeAnswer(wrong, "q1");
    wrong = answer(wrong, "q2", ["p1"]);
    wrong = acknowledgeAnswer(wrong, "q2");

    expect(isSettled(STEP, wrong)).toBe(true);
  });

  it("changes nothing in a mission that has no near-transfer step", () => {
    const ordinary = STEPS.filter((step) => step.stableId !== "check");

    expect(visibleInstructionSteps(ordinary, {})).toEqual(ordinary);
  });

  it("says the notice only while questions are actually unanswered", () => {
    /*
      Founder video UAT. The notice was gated on "some later step is hidden",
      and a later step is hidden for two different reasons — questions still
      unanswered, and feedback still on screen. So after committing the last
      answer the learner read a verdict, an explanation and a Finish button,
      and underneath them a sentence telling them to answer the questions they
      had just finished answering.

      This walks the whole activity and asserts the notice at every step.
    */
    // Nothing answered: there is something to answer.
    expect(hasUnattemptedInstruction(STEPS, {})).toBe(true);

    // One answered, its feedback on screen, one still to go.
    let state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
    expect(hasUnattemptedInstruction(STEPS, { check: state })).toBe(true);

    // Read past it; the last question is now being asked.
    state = acknowledgeAnswer(state, "q1");
    expect(hasUnattemptedInstruction(STEPS, { check: state })).toBe(true);

    // THE DEFECT. Every question attempted, the last one's feedback on
    // screen, Finish not yet pressed. Nothing is left to answer.
    state = answer(state, "q2", ["p2"]);
    expect(activePhase(STEP, state)).toEqual({
      kind: "resolved",
      questionStableId: "q2"
    });
    expect(hasUnattemptedInstruction(STEPS, { check: state })).toBe(false);

    // And the handoff is still correctly withheld in that same state, which
    // is the invariant the fix must not have traded away.
    expect(
      visibleInstructionSteps(STEPS, { check: state }).map((s) => s.stableId)
    ).toEqual(["teaching", "check"]);

    // After Finish there is nothing hidden and nothing to say.
    state = acknowledgeAnswer(state, "q2");
    expect(hasUnattemptedInstruction(STEPS, { check: state })).toBe(false);
  });

  it("says nothing about a mission that requires no questions", () => {
    const ordinary = STEPS.filter((step) => step.stableId !== "check");

    expect(hasUnattemptedInstruction(ordinary, {})).toBe(false);
  });

  it("is not swayed by whether the answers were right", () => {
    // Attempted is the whole of it. A learner who was wrong twice is in the
    // same state as one who was right twice.
    let wrong = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o2"]);
    wrong = acknowledgeAnswer(wrong, "q1");
    wrong = answer(wrong, "q2", ["p1"]);

    expect(hasUnattemptedInstruction(STEPS, { check: wrong })).toBe(false);
  });

  it("names what the learner still has to do", () => {
    expect(describeWithheldStepsNotice()).toBe(
      "Answer the questions above to continue."
    );
  });
});

/* ------------------------------------------------------------------ *
 * The scenario
 * ------------------------------------------------------------------ */

/** The drawn layout, or a failure the test should report rather than skip. */
function drawn() {
  const layout = buildStaticTopologyLayout(STEP.topology!);
  if (layout.state !== "available") {
    throw new Error(`the static topology did not draw: ${layout.reason}`);
  }
  return layout;
}

describe("the static topology", () => {
  it("draws every authored device and connection", () => {
    // Test 15: a topology, with no journey anywhere near it.
    const layout = drawn();

    expect(layout.devices.map((device) => device.label).sort()).toEqual([
      "A",
      "B",
      "C"
    ]);
    expect(layout.links).toHaveLength(2);
  });

  it("leaves every device at rest", () => {
    // Nothing is current, nothing arrived, nothing stopped. A network being
    // read is not a journey with the motion removed — there is no journey.
    for (const device of drawn().devices) {
      expect(device.state).toBe("idle");
    }
  });

  it("traverses no connection and carries no traffic", () => {
    const layout = drawn();

    for (const link of layout.links) {
      expect(link.traversed).toBe(false);
    }

    // The packet marker is the single most visible claim that something is
    // happening. There is nothing happening, so there is no marker.
    expect(layout.packets).toEqual([]);
  });

  it("describes the arrangement in words as well as in pixels", () => {
    expect(drawn().description.length).toBeGreaterThan(0);
  });

  it("is derived only from authored content, so it never changes as questions are answered", () => {
    // Test 17: the scenario stays put while the questions advance. The layout
    // takes the topology and nothing else, so learner state cannot reach it.
    expect(buildStaticTopologyLayout.length).toBe(1);

    expect(drawn()).toEqual(drawn());
  });

  it("carries the authored relationships in words", () => {
    // Test 16. Required by validation, and rendered as visible prose by the
    // component — checked structurally below.
    expect(STEP.topology?.textEquivalent).toContain("A connects to B");
  });

  /* ---------------------------------------------------------------- *
   * WP-NF-NT1B — a network past the edge of the diagram
   * ---------------------------------------------------------------- */

  it("draws a network the author declared past the edge", () => {
    // The defect this closes: a question that asks which device reaches
    // another network, answerable only by reading a sentence.
    const layout = drawn();

    expect(layout.externalNetworks).toHaveLength(1);
    expect(layout.externalNetworks[0]?.label).toBe("Somewhere else");
    expect(layout.externalNetworks[0]?.attachedToNodeId).toBe("c");
  });

  it("keeps it out of the devices, so it can never be an answer choice", () => {
    const layout = drawn();

    expect(layout.devices.map((device) => device.label).sort()).toEqual([
      "A",
      "B",
      "C"
    ]);
    expect(layout.devices).toHaveLength(3);
  });

  it("states the same relationship in the diagram's own description", () => {
    // The visual and the accessible representation stay aligned: whatever the
    // picture says about the edge of the network, the words say too.
    expect(drawn().description).toContain("C also has a line to Somewhere else");
  });

  it("passes the authored declaration through unchanged", () => {
    // The presentation carries it; it never decides that a network exists
    // past a device, which would be a networking fact invented by a renderer.
    const layout = drawn();

    expect(layout.externalNetworks[0]?.networkId).toBe(
      STEP.topology?.externalNetworks?.[0]?.networkId
    );
  });

  it("draws nothing extra for a topology that declares none", () => {
    const plain = buildStaticTopologyLayout({
      nodes: STEP.topology!.nodes,
      links: STEP.topology!.links,
      textEquivalent: STEP.topology!.textEquivalent
    });
    if (plain.state !== "available") throw new Error("expected a layout");

    expect(plain.externalNetworks).toEqual([]);
  });
});
