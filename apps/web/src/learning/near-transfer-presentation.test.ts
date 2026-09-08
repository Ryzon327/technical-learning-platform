import { describe, expect, it } from "vitest";
import { parseCurriculumDocument } from "@tlp/shared-types";
import networkingFoundations from "../../../../content/curriculum/networking-foundations.json";
// Read as text through Vite's own `?raw`, which `"types": ["vite/client"]`
// already declares. `node:fs` has no types in this browser workspace, and
// adding `@types/node` to reach it would be a dependency change.
import nearTransferStepSource from "./NearTransferStep.tsx?raw";
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
  nextInstructionStepId,
  revealedByNearTransfer,
  isSelected,
  isSettled,
  requiredInteraction,
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
 * A required interaction, alongside the near-transfer check
 * ------------------------------------------------------------------ */

describe("what a required interaction holds back", () => {
  /**
   * Mission 2 Founder UAT. Every step after the walkthrough explains what the
   * walkthrough shows, and all of them were on screen from the moment the
   * mission opened — so a learner could read the answer without watching a
   * single stage.
   *
   * The near-transfer check already had this behaviour. What is new is that an
   * INTERACTION can ask for it too, and that both kinds are answered by ONE
   * traversal rule in authored order rather than by two rules that could
   * disagree about where the lesson stops.
   *
   * Generic throughout: no mission, no course, no networking. Mission 2's own
   * authoring is pinned in the course suite.
   */
  const requiredJourney: LearnerMissionStep = {
    stableId: "walkthrough",
    position: 1,
    content: {
      type: "interaction",
      interactionStableId: "a-journey",
      interactionType: "packet_journey",
      sourceKind: "authored_teaching",
      supportLevel: "show_me",
      textEquivalent: "A description of the journey.",
      requiredForProgression: true,
      presentation: { state: "withheld", reason: "protected_demonstration" }
    }
  };

  /** The same step with the author's gate absent, which is the ordinary case. */
  const optionalJourney: LearnerMissionStep = {
    stableId: "walkthrough",
    position: 1,
    content: {
      type: "interaction",
      interactionStableId: "a-journey",
      interactionType: "packet_journey",
      sourceKind: "authored_teaching",
      supportLevel: "show_me",
      textEquivalent: "A description of the journey.",
      presentation: { state: "withheld", reason: "protected_demonstration" }
    }
  };

  const lesson = (activity: LearnerMissionStep): readonly LearnerMissionStep[] => [
    {
      stableId: "teaching",
      position: 0,
      content: { type: "concept", paragraphs: ["Taught."] }
    },
    activity,
    {
      stableId: "explains-it",
      position: 2,
      content: { type: "concept", paragraphs: ["What the activity showed."] }
    }
  ];

  it("hands focus on when the near-transfer's own Finish reveals the rest", () => {
    /*
      Mission 2 has TWO Finish controls, and until this existed only one of
      them carried the learner forward.

      The interaction's Finish has an `onSettle` and hands focus to the step it
      revealed. The near-transfer's Finish has no `onSettle` at all — it
      settles by acknowledging the last question's feedback, through the same
      `onChange` every answer goes through — so nothing on that path could tell
      the reveal from an ordinary selection, and the focus it was holding fell
      to the document body.
    */
    const check: LearnerMissionStep = {
      stableId: "the-check",
      position: 2,
      content: STEP
    };
    const answered = STEP.questions.map(
      (question) => question.questionStableId
    );

    const beforeLast: NearTransferState = {
      selection: Object.fromEntries(
        answered.map((id) => [id, ["any"] as readonly string[]])
      ),
      committed: answered,
      acknowledged: answered.slice(0, -1)
    };

    const settled: NearTransferState = {
      ...beforeLast,
      acknowledged: answered
    };

    expect(revealedByNearTransfer(check, beforeLast, settled)).toBe(true);
  });

  it("hands focus on once, and not on every change afterwards", () => {
    // A TRANSITION, not a state. Asking "is it settled" would be true of every
    // later change too, and would keep pulling focus back to the same section
    // while the learner was reading past it.
    const check: LearnerMissionStep = {
      stableId: "the-check",
      position: 2,
      content: STEP
    };
    const answered = STEP.questions.map(
      (question) => question.questionStableId
    );

    const settled: NearTransferState = {
      selection: Object.fromEntries(
        answered.map((id) => [id, ["any"] as readonly string[]])
      ),
      committed: answered,
      acknowledged: answered
    };

    expect(revealedByNearTransfer(check, settled, settled)).toBe(false);
  });

  it("hands focus nowhere while questions are still unanswered", () => {
    const check: LearnerMissionStep = {
      stableId: "the-check",
      position: 2,
      content: STEP
    };
    const first = STEP.questions[0]?.questionStableId as string;

    const oneAnswered: NearTransferState = {
      selection: { [first]: ["any"] },
      committed: [first],
      acknowledged: []
    };
    const oneAcknowledged: NearTransferState = {
      ...oneAnswered,
      acknowledged: [first]
    };

    expect(
      revealedByNearTransfer(check, oneAnswered, oneAcknowledged)
    ).toBe(false);
  });

  it("says nothing about a step that is not a near-transfer", () => {
    // The interaction has its own handoff, from its own `onSettle`. Two
    // mechanisms firing for one press would move focus twice.
    expect(
      revealedByNearTransfer(
        requiredJourney,
        INITIAL_NEAR_TRANSFER_STATE,
        INITIAL_NEAR_TRANSFER_STATE
      )
    ).toBe(false);
  });

  it("names the step a finished activity reveals, in authored order", () => {
    /*
      The focus handoff's destination.

      Finishing a required activity unmounts the button that was pressed, and
      the focus it held falls to the document body: a keyboard learner is sent
      to the top of the page, and a screen-reader learner hears nothing about
      what appeared. The lesson moves them to what the press revealed instead,
      and this is the only thing that decides where that is.

      Authored order and nothing else. No step type, no content, no settlement
      state — `visibleInstructionSteps` already owns whether the next step is
      itself withheld, and asking a second time would let the two disagree.
    */
    const steps = lesson(requiredJourney);

    expect(nextInstructionStepId(steps, "walkthrough")).toBe("explains-it");
    expect(nextInstructionStepId(steps, "teaching")).toBe("walkthrough");
  });

  it("moves the learner nowhere when there is nothing after the activity", () => {
    // Two ordinary cases that must not produce a destination: the finished
    // step was the last one authored, and — the bookkeeping error — a step id
    // that is not in this lesson at all. `findIndex` returns -1 there, and
    // `steps[-1 + 1]` would silently move the learner to the top of the
    // mission.
    const steps = lesson(requiredJourney);

    expect(nextInstructionStepId(steps, "explains-it")).toBeNull();
    expect(nextInstructionStepId(steps, "not-in-this-lesson")).toBeNull();
    expect(nextInstructionStepId([], "walkthrough")).toBeNull();
  });

  it("withholds everything after it until the learner finishes it", () => {
    // The defect, in one assertion: without this, "What the activity showed."
    // is on screen while the activity is still on its first stage.
    expect(
      visibleInstructionSteps(lesson(requiredJourney), {}, {}).map(
        (step) => step.stableId
      )
    ).toEqual(["teaching", "walkthrough"]);
  });

  it("releases them once the learner says they have finished", () => {
    expect(
      visibleInstructionSteps(lesson(requiredJourney), {}, {
        walkthrough: true
      }).map((step) => step.stableId)
    ).toEqual(["teaching", "walkthrough", "explains-it"]);
  });

  it("holds nothing back for an interaction the author did not mark", () => {
    /*
      The additive half, and the one that matters most. Most interactions in
      the course are demonstrations placed beside prose; gating the lesson on
      every one of them would change the behaviour of every mission already
      written. Absent means today's behaviour exactly.
    */
    const steps = lesson(optionalJourney);

    expect(visibleInstructionSteps(steps, {}, {})).toEqual(steps);
    expect(requiredInteraction(optionalJourney, {})).toBeNull();
  });

  it("behaves exactly as before when no settlement is passed at all", () => {
    /*
      The compatibility guarantee, pinned rather than assumed. Every existing
      caller passes two arguments, and a mission that authors no required
      interaction must be unaffected by the third — otherwise this change
      would alter what a learner sees in seven missions that did not ask for
      it.
    */
    expect(visibleInstructionSteps(STEPS, {})).toEqual(
      visibleInstructionSteps(STEPS, {}, {})
    );
    expect(hasUnattemptedInstruction(STEPS, {})).toBe(
      hasUnattemptedInstruction(STEPS, {}, {})
    );

    const settledCheck = (() => {
      let state = answer(INITIAL_NEAR_TRANSFER_STATE, "q1", ["o1", "o3"]);
      state = acknowledgeAnswer(state, "q1");
      state = answer(state, "q2", ["p2"]);
      return acknowledgeAnswer(state, "q2");
    })();

    expect(visibleInstructionSteps(STEPS, { check: settledCheck })).toEqual(
      STEPS
    );
  });

  it("waits at whichever required activity comes first in authored order", () => {
    /*
      One traversal rule, and this is the assertion that makes it one. Asking
      about near-transfer checks first would let a later check hide an earlier
      required walkthrough, and asking about interactions first would do the
      reverse. `findIndex` over the authored order cannot make either mistake.
    */
    const journeyThenCheck: readonly LearnerMissionStep[] = [
      requiredJourney,
      { stableId: "check", position: 2, content: STEP }
    ];

    expect(
      visibleInstructionSteps(journeyThenCheck, {}, {}).map((s) => s.stableId)
    ).toEqual(["walkthrough"]);

    const checkThenJourney: readonly LearnerMissionStep[] = [
      { stableId: "check", position: 0, content: STEP },
      requiredJourney
    ];

    expect(
      visibleInstructionSteps(checkThenJourney, {}, {}).map((s) => s.stableId)
    ).toEqual(["check"]);
  });

  it("says nothing about answering questions when a journey is the blocker", () => {
    /*
      The notice under an activity is "Answer the questions above to continue."
      A walkthrough has no questions, so that sentence would be an instruction
      the learner cannot follow — the same class of stale notice Founder video
      UAT found on the near-transfer check.

      `hasUnattemptedInstruction` reads ATTEMPTED, and an interaction has
      nothing attempted to read, so it reports false and the pane says nothing.
    */
    expect(hasUnattemptedInstruction(lesson(requiredJourney), {}, {})).toBe(false);

    // And the steps really are still withheld in that same state, which is the
    // invariant the quiet notice must not have traded away.
    expect(
      visibleInstructionSteps(lesson(requiredJourney), {}, {}).map(
        (step) => step.stableId
      )
    ).toEqual(["teaching", "walkthrough"]);
  });

  it("has no opinion about a step that is not an interaction", () => {
    // `null` is "not my kind of step", which is what keeps the traversal rule
    // generic and lets the two predicates live side by side.
    expect(requiredInteraction(STEPS[0]!, {})).toBeNull();
    expect(requiredInteraction(STEPS[1]!, {})).toBeNull();
    expect(requiredNearTransfer(requiredJourney, {})).toBeNull();
  });

  it("reads settlement and nothing else — correctness does not exist here", () => {
    /*
      An interaction produces no score, no attempt and no evidence, so there is
      no correctness for a gate to read even if someone wanted one. What
      settles it is the learner pressing Finish, and that is the whole of it.

      Pinned as arity as well as behaviour: `requiredInteraction` takes the
      step and the settlement, and has no third input through which a
      prediction, a knowledge-check answer or a journey's own progress could
      reach it.
    */
    expect(requiredInteraction.length).toBe(2);

    expect(requiredInteraction(requiredJourney, {})).toBe(false);
    expect(requiredInteraction(requiredJourney, { walkthrough: true })).toBe(true);

    // A settlement recorded against a DIFFERENT step settles nothing here.
    expect(
      requiredInteraction(requiredJourney, { "some-other-step": true })
    ).toBe(false);

    // And `false` is not a truthy value in disguise: only an explicit `true`
    // settles, so a client sending anything else leaves the lesson waiting
    // rather than releasing it.
    expect(requiredInteraction(requiredJourney, { walkthrough: false })).toBe(
      false
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


/* ------------------------------------------------------------------ *
 * PORT NAMES ON THE DIAGRAM
 *
 * Founder UAT, Mission 2's "Try it on a different switch". Its four questions
 * ask which ports carry copies, which entry the switch can learn, which single
 * port a known destination uses, and what the switch does with a frame it has
 * no entry for — and the diagram named no port anywhere. The mapping existed
 * only in the framing sentence and inside each link's `label`, so answering
 * required memorising an invisible port-to-device mapping from prose. That is
 * not what the questions are testing.
 *
 * The cause was the CONTRACT, not the renderer: `NearTransferTopologyLink` had
 * `linkId`, `label` and `endpoints` and no way to say which port a link
 * occupies on a device. `buildTopologyLayout` and `TopologyView` have drawn
 * `prominent` interface labels beside wires since WP-I; the near-transfer
 * bridge simply had nothing to flag.
 * ------------------------------------------------------------------ */

describe("authored port names are drawn beside their connections", () => {
  const missionTwoScenario = () => {
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const mission = parsed.document.missions.find(
      (candidate) => candidate.stableId === "nf-m2-inside-one-network"
    );
    const step = mission?.steps.find(
      (candidate) => candidate.content.type === "near_transfer"
    );
    if (step === undefined || step.content.type !== "near_transfer") {
      throw new Error("Mission 2 authors no near-transfer step");
    }
    if (step.content.topology === undefined) {
      throw new Error("Mission 2's near-transfer authors no topology");
    }

    return step.content;
  };

  const drawnScenario = () => {
    const layout = buildStaticTopologyLayout(missionTwoScenario().topology!);
    if (layout.state !== "available") {
      throw new Error(`the scenario did not draw: ${layout.reason}`);
    }
    return layout;
  };

  it("names Port 1, Port 2 and Port 3 at Switch-2's three connections", () => {
    const drawnPorts = drawnScenario().portLabels.map(
      (port) => `${port.linkId}@${port.nodeId}=${port.text}`
    );

    expect(drawnPorts).toEqual([
      "nt2-workstation-a@switch-2=Port 1",
      "nt2-workstation-b@switch-2=Port 2",
      "nt2-camera@switch-2=Port 3"
    ]);
  });

  it("maps each port to its link from authored data, not from position", () => {
    /*
      The mapping is keyed by `nodeId` inside the link that owns it, so it
      cannot drift with layout order. Proved by REORDERING the authored
      devices and links and asserting the pairing is unchanged: a
      position-based implementation would follow the new order.
    */
    const topology = missionTwoScenario().topology!;

    const reordered = buildStaticTopologyLayout({
      ...topology,
      nodes: [...topology.nodes].reverse(),
      // Both orderings that could be mistaken for the mapping: the order of
      // the links themselves, and the order of the two ends WITHIN each link.
      links: [...topology.links].reverse().map((link) => ({
        ...link,
        endpoints: [link.endpoints[1], link.endpoints[0]] as const
      }))
    });
    if (reordered.state !== "available") throw new Error("expected a layout");

    const pairing = (ports: typeof reordered.portLabels) =>
      [...ports]
        .map((port) => `${port.linkId}=${port.text}`)
        .sort();

    expect(pairing(reordered.portLabels)).toEqual([
      "nt2-camera=Port 3",
      "nt2-workstation-a=Port 1",
      "nt2-workstation-b=Port 2"
    ]);
    expect(pairing(reordered.portLabels)).toEqual(
      pairing(drawnScenario().portLabels)
    );
  });

  it("reads the end from the authored nodeId, not from list order", () => {
    /*
      The decisive case, and the reorder test above cannot supply it: Mission 2
      names one port per link, so reversing anything still lands correctly by
      luck. This authors BOTH ends of one link with different names and then
      declares them in the order that a position-based implementation would get
      backwards.
    */
    const layout = buildStaticTopologyLayout({
      nodes: [
        { nodeId: "host", label: "Host", role: "host" },
        { nodeId: "sw", label: "Switch", role: "switch" }
      ],
      links: [
        {
          linkId: "one",
          label: "Host to Switch",
          endpoints: ["host", "sw"],
          // Declared switch-end FIRST, while `endpoints` names the host first.
          portLabels: [
            { nodeId: "sw", label: "Port 7" },
            { nodeId: "host", label: "eth0" }
          ]
        }
      ],
      textEquivalent: "Host connects to Switch."
    });
    if (layout.state !== "available") throw new Error("expected a layout");

    expect(
      layout.portLabels
        .map((port) => `${port.nodeId}=${port.text}`)
        .sort()
    ).toEqual(["host=eth0", "sw=Port 7"]);
  });

  it("keeps the port on the end the author named, never the other one", () => {
    // Every drawn label belongs to Switch-2, which is the end the author
    // named. The hosts are unlabelled, exactly as PC-A's NIC is in the main
    // Packet Journey while Switch-1's ports are the flagged ends.
    for (const port of drawnScenario().portLabels) {
      expect(`${port.linkId} is on ${port.nodeId}`).toBe(
        `${port.linkId} is on switch-2`
      );
    }
  });

  it("says the same ports in words, so the drawing carries no private fact", () => {
    // The picture and the spoken arrangement must agree. This is the same
    // `prominent` flag driving both, which is what makes that structural.
    const description = drawnScenario().description;

    expect(description).toContain("Workstation-A and Switch-2 Port 1");
    expect(description).toContain("Workstation-B and Switch-2 Port 2");
    expect(description).toContain("Camera and Switch-2 Port 3");
  });

  it("places every label clear of every device card", () => {
    // Readability, mechanically: a label drawn over a card is unreadable at
    // any zoom, and the row gap is where these belong.
    const layout = drawnScenario();

    for (const port of layout.portLabels) {
      for (const device of layout.devices) {
        const inside =
          port.at.x >= device.box.x &&
          port.at.x <= device.box.x + device.box.width &&
          port.at.y >= device.box.y &&
          port.at.y <= device.box.y + device.box.height;

        expect(`${port.text} inside ${device.nodeId}: ${inside}`).toBe(
          `${port.text} inside ${device.nodeId}: false`
        );
      }

      // And inside the canvas the renderer reserves.
      expect(port.at.x).toBeGreaterThanOrEqual(0);
      expect(port.at.y).toBeGreaterThanOrEqual(0);
      expect(port.at.x).toBeLessThanOrEqual(layout.frame.width);
      expect(port.at.y).toBeLessThanOrEqual(layout.frame.height);
    }
  });

  it("draws no port where the author named none", () => {
    // Mission 1's near-transfer asks nothing about ports and names none, so
    // it must not acquire labels. Absence stays absence.
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const missionOne = parsed.document.missions.find(
      (candidate) => candidate.stableId === "nf-m1-what-a-network-is"
    );
    const step = missionOne?.steps.find(
      (candidate) => candidate.content.type === "near_transfer"
    );
    if (step === undefined || step.content.type !== "near_transfer") {
      throw new Error("Mission 1 authors no near-transfer step");
    }

    const layout = buildStaticTopologyLayout(step.content.topology!);
    if (layout.state !== "available") throw new Error("expected a layout");

    expect(layout.portLabels).toEqual([]);
  });

  it("leaves the four questions, their keys and completion untouched", () => {
    // The repair is visual. Nothing about what is asked, what is correct or
    // when the activity is finished may move with it.
    const content = missionTwoScenario();

    expect(
      content.questions.map(
        (question) =>
          `${question.questionStableId} -> ${[...question.correctOptionIds].join(",")}`
      )
    ).toEqual([
      "m2-nt-q1-unknown-destination -> ports-2-and-3",
      "m2-nt-q2-source-learning -> workstation-a-port-1",
      "m2-nt-q3-camera-copy -> expected-flood",
      "m2-nt-q4-known-destination -> port-2"
    ]);

    // Completion still needs every question ATTEMPTED, and nothing else. The
    // learner-facing shape, which is what the component actually holds.
    const step: LearnerNearTransferStep = {
      type: "near_transfer",
      questions: content.questions.map((question) => ({
        questionStableId: question.questionStableId,
        type: question.type,
        prompt: question.prompt,
        options: question.options
      })),
      answers: Object.fromEntries(
        content.questions.map((question) => [
          question.questionStableId,
          {
            correctOptionIds: question.correctOptionIds,
            explanation: question.explanation
          }
        ])
      )
    };

    const committed: string[] = [];
    for (const question of step.questions) {
      expect(
        isComplete(step, { selection: {}, committed, acknowledged: [] })
      ).toBe(false);
      committed.push(question.questionStableId);
    }
    expect(
      isComplete(step, { selection: {}, committed, acknowledged: [] })
    ).toBe(true);
  });
});


/* ------------------------------------------------------------------ *
 * ONE OWNER FOR THE PORT MAPPING
 *
 * Founder UAT, after the port labels landed: Mission 2's scenario stated the
 * same mapping three times on one screen — in the framing paragraph, on the
 * topology as Port 1 / Port 2 / Port 3, and again in the sentence underneath
 * it. The Architect ruled that the diagram owns it visually.
 *
 * The two halves of that ruling pull against each other and both have to hold:
 * the visible repetition goes, and nothing leaves assistive technology. So the
 * framing sentence drops the mapping, the diagram keeps it, and the authored
 * text equivalent stays in the document while being hidden from sight.
 * ------------------------------------------------------------------ */

describe("the port mapping is stated visibly in one place", () => {
  const nearTransferOf = (missionStableId: string) => {
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const mission = parsed.document.missions.find(
      (candidate) => candidate.stableId === missionStableId
    );
    const step = mission?.steps.find(
      (candidate) => candidate.content.type === "near_transfer"
    );
    if (step === undefined || step.content.type !== "near_transfer") {
      throw new Error(`${missionStableId} authors no near-transfer step`);
    }
    return step.content;
  };

  it("keeps the mapping on the diagram, where the ruling put it", () => {
    const layout = buildStaticTopologyLayout(
      nearTransferOf("nf-m2-inside-one-network").topology!
    );
    if (layout.state !== "available") throw new Error("expected a layout");

    expect(
      layout.portLabels.map((port) => `${port.linkId}=${port.text}`)
    ).toEqual([
      "nt2-workstation-a=Port 1",
      "nt2-workstation-b=Port 2",
      "nt2-camera=Port 3"
    ]);
  });

  it("stops repeating the mapping in the visible framing", () => {
    const framing = nearTransferOf("nf-m2-inside-one-network").framing ?? "";

    // Still orients the learner, and still says the two things only it says.
    expect(framing).toContain("A different office");
    expect(framing).toContain(
      "Use the topology and the MAC-table state stated in each question."
    );
    expect(framing).toContain("Nothing here requires configuration.");

    // And no longer carries the mapping the diagram now owns.
    for (const port of ["port 1", "port 2", "port 3"]) {
      expect(`framing names ${port}: ${framing.toLowerCase().includes(port)}`).toBe(
        `framing names ${port}: false`
      );
    }
    for (const device of ["Workstation-A", "Workstation-B"]) {
      expect(`framing names ${device}: ${framing.includes(device)}`).toBe(
        `framing names ${device}: false`
      );
    }
  });

  it("still renders that sentence, so hiding it did not delete it", () => {
    // A future cleanup could reasonably remove an element nothing displays.
    // This is what stops that: the authored equivalent must reach the DOM.
    expect(nearTransferStepSource).toContain(
      "{content.topology.textEquivalent}"
    );
    expect(nearTransferStepSource).toContain("near-transfer-scenario-text");
  });

  it("decides visibility from the drawing, never from which mission it is", () => {
    /*
      THE REGRESSION THIS BLOCK EXISTS TO PREVENT A SECOND TIME.

      The first version of this repair suppressed the sentence in the SHARED
      class, so every near-transfer activity lost it — including Mission 1,
      already Founder-approved with it visible and with a diagram that names no
      port. The Architect refused that rendered change.

      The condition is now a property of the picture: the component reads
      `layout.portLabels`. A mission id in this decision would be the same
      mistake in a different shape, so its absence is asserted too.
    */
    expect(nearTransferStepSource).toContain("layout.portLabels.length > 0");
    expect(nearTransferStepSource).toContain("is-visually-redundant");

    for (const identity of ["missionStableId", "nf-m1-", "nf-m2-"]) {
      expect(
        `NearTransferStep branches on ${identity}: ${nearTransferStepSource.includes(identity)}`
      ).toBe(`NearTransferStep branches on ${identity}: false`);
    }
  });

  it("suppresses the sentence for Mission 2, whose diagram names its ports", () => {
    const layout = buildStaticTopologyLayout(
      nearTransferOf("nf-m2-inside-one-network").topology!
    );
    if (layout.state !== "available") throw new Error("expected a layout");

    // Non-empty is the condition the component reads, so this IS the assertion
    // that Mission 2's sentence is suppressed.
    expect(layout.portLabels.length).toBe(3);
  });

  it("leaves Mission 1's sentence visible, because its diagram names no port", () => {
    // Mission 1 was Founder-approved and closed with this sentence visible.
    // An empty port-label set is exactly what keeps it that way.
    const layout = buildStaticTopologyLayout(
      nearTransferOf("nf-m1-what-a-network-is").topology!
    );
    if (layout.state !== "available") throw new Error("expected a layout");

    expect(layout.portLabels).toEqual([]);
  });

  it("changes no other near-transfer activity's visibility", () => {
    // Every authored near-transfer in the course, and which way it resolves.
    // A future activity appearing here with an unexpected verdict is a
    // rendered change somebody has to approve.
    const parsed = parseCurriculumDocument(networkingFoundations);
    if (!parsed.valid) throw new Error("the authored course does not parse");

    const verdicts: string[] = [];

    for (const mission of parsed.document.missions) {
      for (const step of mission.steps) {
        if (step.content.type !== "near_transfer") continue;
        if (step.content.topology === undefined) continue;

        const layout = buildStaticTopologyLayout(step.content.topology);
        if (layout.state !== "available") throw new Error("expected a layout");

        verdicts.push(
          `${mission.stableId} -> ${
            layout.portLabels.length > 0 ? "suppressed" : "visible"
          }`
        );
      }
    }

    expect(verdicts).toEqual([
      "nf-m1-what-a-network-is -> visible",
      "nf-m2-inside-one-network -> suppressed"
    ]);
  });

  it("still tells assistive technology which port each device uses", () => {
    const content = nearTransferOf("nf-m2-inside-one-network");
    const layout = buildStaticTopologyLayout(content.topology!);
    if (layout.state !== "available") throw new Error("expected a layout");

    // Two independent routes, and the mapping survives on both.
    for (const pairing of [
      "Workstation-A and Switch-2 Port 1",
      "Workstation-B and Switch-2 Port 2",
      "Camera and Switch-2 Port 3"
    ]) {
      expect(layout.description).toContain(pairing);
    }

    expect(content.topology!.textEquivalent).toBe(
      "Workstation-A connects to Switch-2 port 1. Workstation-B connects to Switch-2 port 2. The Camera connects to Switch-2 port 3."
    );
  });

  it("leaves Mission 1's authored near-transfer exactly as it was", () => {
    // Mission 1 asks nothing about ports. Its scenario text is hidden by the
    // shared rule above, which is a stylesheet change and not an authored one;
    // every authored value here is unchanged.
    const content = nearTransferOf("nf-m1-what-a-network-is");

    expect(content.framing).toBe(
      "This network uses different devices, but the same ideas still apply. Use the topology to answer each question."
    );
    expect(content.topology!.textEquivalent).toBe(
      "Laptop-A connects to Switch-2. Server-A connects to Switch-2. Router-2 connects to Switch-2. Router-2 also connects to another network."
    );

    const layout = buildStaticTopologyLayout(content.topology!);
    if (layout.state !== "available") throw new Error("expected a layout");
    expect(layout.portLabels).toEqual([]);
  });
});
