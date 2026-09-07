import {
  buildTopologyLayout,
  type TopologyLayout
} from "./topology-layout";
import {
  isNearTransferAnswerCorrect,
  type LearnerMissionStep,
  type LearnerNearTransferStep,
  type NearTransferQuestion,
  type NearTransferTopology,
  type ObservationModel
} from "@tlp/shared-types";

/**
 * WP-NF-NT1 — everything the near-transfer renderer needs, as pure functions.
 *
 * The same separation the packet journey uses: this module decides what a
 * learner may see, and the component draws it. No state machine of its own, no
 * networking knowledge, and no way to reach a service.
 *
 * ## What this may never do
 *
 * Produce a score, a percentage, points, an attempt, evidence, or competency
 * state. A near-transfer check is instruction: the learner commits, is told
 * whether they were right and why, and moves on. Being wrong is part of the
 * lesson and never blocks them.
 */

/** What the learner has selected, and whether they have committed, per question. */
export interface NearTransferState {
  /** Option ids selected but not yet submitted, by question id. */
  readonly selection: Readonly<Record<string, readonly string[]>>;
  /** Question ids the learner has committed an answer for, in order. */
  readonly committed: readonly string[];
  /**
   * Question ids whose feedback the learner has read and moved past.
   *
   * Separate from `committed` on purpose. Committing produces the verdict and
   * the explanation; acknowledging is the learner saying they have read it.
   * Without the second step the next question would appear beside the feedback
   * for the previous one, which is the crowded screen this activity avoids.
   */
  readonly acknowledged: readonly string[];
}

export const INITIAL_NEAR_TRANSFER_STATE: NearTransferState = {
  selection: {},
  committed: [],
  acknowledged: []
};

/**
 * Toggle one option.
 *
 * A single-choice question replaces the selection; a multiple-choice one adds
 * or removes. A committed question is frozen — the learner has been told the
 * answer, so changing the selection afterwards would let them rewrite history
 * against feedback they have already read.
 */
export function toggleOption(
  state: NearTransferState,
  question: { readonly questionStableId: string; readonly type: string },
  optionId: string
): NearTransferState {
  if (state.committed.includes(question.questionStableId)) return state;

  const current = state.selection[question.questionStableId] ?? [];

  const next =
    question.type === "single_choice"
      ? [optionId]
      : current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];

  return {
    ...state,
    selection: { ...state.selection, [question.questionStableId]: next }
  };
}

/** Whether an option is currently selected. */
export function isSelected(
  state: NearTransferState,
  questionStableId: string,
  optionId: string
): boolean {
  return (state.selection[questionStableId] ?? []).includes(optionId);
}

/** Whether the learner has chosen anything yet for this question. */
export function canCommit(
  state: NearTransferState,
  questionStableId: string
): boolean {
  return (
    !state.committed.includes(questionStableId) &&
    (state.selection[questionStableId] ?? []).length > 0
  );
}

/** Record that the learner has answered. Idempotent, and never undone. */
export function commitAnswer(
  state: NearTransferState,
  questionStableId: string
): NearTransferState {
  if (state.committed.includes(questionStableId)) return state;
  if ((state.selection[questionStableId] ?? []).length === 0) return state;

  return { ...state, committed: [...state.committed, questionStableId] };
}

/** Move past the feedback for one question. Idempotent. */
export function acknowledgeAnswer(
  state: NearTransferState,
  questionStableId: string
): NearTransferState {
  if (!state.committed.includes(questionStableId)) return state;
  if (state.acknowledged.includes(questionStableId)) return state;

  return { ...state, acknowledged: [...state.acknowledged, questionStableId] };
}

/**
 * The question the learner is on.
 *
 * One at a time, in authored order: the first question they have not yet
 * committed. Once every question is answered this is null and the activity is
 * complete. Four explanations and four answer states competing on one screen is
 * the thing this prevents.
 */
export function activeQuestionIndex(
  step: LearnerNearTransferStep,
  state: NearTransferState
): number | null {
  const index = step.questions.findIndex(
    (question) => !state.acknowledged.includes(question.questionStableId)
  );

  return index === -1 ? null : index;
}

/**
 * What the learner is looking at right now: the question, its resolution, or
 * nothing because the activity is finished.
 *
 * One state at a time. A question that has been answered shows its verdict and
 * reason until the learner moves on; it is never on screen beside the next
 * question.
 */
export function activePhase(
  step: LearnerNearTransferStep,
  state: NearTransferState
): { readonly kind: "asking" | "resolved"; readonly questionStableId: string } | { readonly kind: "complete" } {
  const index = activeQuestionIndex(step, state);
  if (index === null) return { kind: "complete" };

  const question = step.questions[index];
  if (question === undefined) return { kind: "complete" };

  return {
    kind: state.committed.includes(question.questionStableId)
      ? "resolved"
      : "asking",
    questionStableId: question.questionStableId
  };
}

/**
 * Every question has been attempted.
 *
 * ATTEMPTED, not passed. There is no score here and no threshold: a learner who
 * answered every question wrong has done the instructional work and reaches the
 * handoff exactly as one who answered them all correctly does.
 */
export function isComplete(
  step: LearnerNearTransferStep,
  state: NearTransferState
): boolean {
  return step.questions.every((question) =>
    state.committed.includes(question.questionStableId)
  );
}

/**
 * Every question has been answered AND its feedback read past.
 *
 * ## Why this is not `isComplete`
 *
 * They answer two different questions, and Founder video UAT found the gap
 * between them. Committing the fourth answer satisfies `isComplete`
 * immediately, but the learner is at that moment looking at the verdict and
 * explanation for the answer they just gave. Releasing the mission's closing
 * handoff on that event put the next instructional step on screen underneath
 * feedback the learner had not read yet: two instructional jobs at once.
 *
 *   `isComplete`  every question ATTEMPTED. Drives the "answer the questions
 *                 above" notice, and nothing else.
 *   `isSettled`   every question attempted AND its feedback dismissed. Drives
 *                 what the learner is shown next, and — by Architect ruling —
 *                 whether the mission may be marked complete.
 *
 * Pressing "Finish" is the difference between them, and it is the learner
 * saying they have read the last piece of feedback.
 *
 * Neither counts correct answers. A learner who was wrong four times settles
 * the activity exactly as one who was right four times does.
 */
export function isSettled(
  step: LearnerNearTransferStep,
  state: NearTransferState
): boolean {
  // The module's own notion of "no question is on screen", reused rather than
  // restated, so this and the counter can never disagree about where the
  // learner is.
  return activeQuestionIndex(step, state) === null;
}

/* ------------------------------------------------------------------ *
 * Where a near-transfer check sits in a mission
 * ------------------------------------------------------------------ */

/** Near-transfer state for every such step in one mission, by step stableId. */
export type MissionNearTransferState = Readonly<
  Record<string, NearTransferState>
>;

/**
 * The steps a learner may currently see.
 *
 * A near-transfer check is the point of the instruction that precedes it, so
 * whatever an author places AFTER one waits. In Mission 1 that is the handoff
 * to Mission 2, which would otherwise sit on screen answering the activity's
 * closing question before the learner had done it.
 *
 * ## What it waits for, and what it deliberately does not
 *
 * It waits on `isSettled` — every question answered and its feedback read past
 * — and NOT on `isComplete`. The two used to be the same call; Founder video
 * UAT showed why they cannot be. Committing the last answer satisfies
 * `isComplete` in the same instant the feedback for that answer appears, so
 * the handoff was released underneath feedback the learner had not read.
 *
 * Mission-completion eligibility now waits on the same thing, by Architect
 * ruling: reading the feedback is part of the instruction, so the activity is
 * not finished until the learner presses Finish.
 *
 * ATTEMPTED, not passed, applies throughout. Nothing here counts correct
 * answers, so a learner who was wrong four times reaches the handoff exactly
 * as one who was right four times does. Nothing can block a learner
 * permanently: the only thing standing between them and the next step is
 * pressing Finish.
 *
 * Generic: it knows about the step TYPE and about nothing in any mission. The
 * near-transfer step itself always stays visible — it is the thing being
 * waited on.
 */
export function visibleInstructionSteps(
  steps: readonly LearnerMissionStep[],
  states: MissionNearTransferState
): readonly LearnerMissionStep[] {
  const blockedAt = blockingStepIndex(steps, states);

  return blockedAt === -1 ? steps : steps.slice(0, blockedAt + 1);
}

/**
 * The step holding the rest of the lesson back, or -1.
 *
 * One traversal rule, used by everything that needs to know where the lesson
 * stops. Two `findIndex` calls with the same intent is how the thing that
 * hides the steps and the thing that explains why they are hidden come to
 * disagree — which is the defect below.
 */
function blockingStepIndex(
  steps: readonly LearnerMissionStep[],
  states: MissionNearTransferState
): number {
  return steps.findIndex((step) => {
    if (step.content.type !== "near_transfer") return false;
    const state = states[step.stableId] ?? INITIAL_NEAR_TRANSFER_STATE;
    return !isSettled(step.content, state);
  });
}

/**
 * Whether the learner still has a question they have not answered.
 *
 * ## Why this is not "are any steps hidden"
 *
 * Founder video UAT. The notice under the activity — "Answer the questions
 * above to continue." — was rendered whenever a later step was hidden, and a
 * later step is hidden for two different reasons: questions still unanswered,
 * and feedback still on screen. Only the first is something the learner can
 * act on.
 *
 * So after committing the last answer the learner read a verdict, an
 * explanation and a Finish button, and underneath them a sentence telling
 * them to answer the questions they had just finished answering.
 *
 * This asks the narrower question the sentence actually claims: is the step
 * that is blocking the lesson blocked because something is UNATTEMPTED? Once
 * every question is attempted the answer is no, whatever the learner got
 * right, and Finish is left to say what happens next on its own.
 *
 * Per-step, deliberately. A whole-mission answer would go wrong the first time
 * a mission authored two near-transfer checks: the first one's Finish would
 * sit under a notice about the second one's untouched questions.
 */
export function hasUnattemptedInstruction(
  steps: readonly LearnerMissionStep[],
  states: MissionNearTransferState
): boolean {
  const blockedAt = blockingStepIndex(steps, states);
  if (blockedAt === -1) return false;

  const blocking = steps[blockedAt];
  if (blocking === undefined) return false;

  // Reads ATTEMPTED directly, and must never delegate to
  // `requiredNearTransfer`: that one reads SETTLED, so it reports `false` for
  // any blocking step by construction, and the notice would return underneath
  // the final feedback. `false` here is "this step has questions left";
  // `null` cannot occur, because only a near-transfer step can block.
  return attemptedNearTransfer(blocking, states) === false;
}

/**
 * Whether one step is a required near-transfer check, and whether it is DONE.
 *
 * The opinion `resolveRequiredInstruction` asks for, in one place instead of
 * inline at the call site. `null` means "not my kind of step".
 *
 * ## Done means SETTLED, by Architect ruling
 *
 * It reads `isSettled` — every question attempted AND its feedback read past.
 * It used to read `isComplete`, and that let a learner mark the mission
 * complete while the final verdict and explanation were still on screen and
 * Finish had not been pressed. Reading the feedback is part of the
 * instruction, so the activity is not finished until the learner says it is.
 *
 * **Correctness is still not a gate and never becomes one.** `isSettled`
 * counts feedback dismissed, not answers right: a learner who was wrong on
 * every question settles the activity by pressing Finish exactly as one who
 * was right on every question does.
 *
 * ## Why this exists as a function
 *
 * Because the choice between two predicates that differ by one word is not
 * something to leave inline in a component with no test harness. Mutation
 * testing proved that: while this logic sat in `MissionInstruction.tsx` the
 * predicate could be swapped and nothing failed. It is pinned here instead.
 *
 * Eligibility and the visibility of following steps now ride the SAME
 * predicate, which is the ruling. What still rides ATTEMPTED is the
 * "answer the questions above" notice — see `hasUnattemptedInstruction`,
 * which is why that function must not delegate to this one.
 */
export function requiredNearTransfer(
  step: LearnerMissionStep,
  states: MissionNearTransferState
): boolean | null {
  if (step.content.type !== "near_transfer") return null;

  return isSettled(
    step.content,
    states[step.stableId] ?? INITIAL_NEAR_TRANSFER_STATE
  );
}

/**
 * Whether one step is a near-transfer check with questions still UNANSWERED.
 *
 * The sibling of `requiredNearTransfer`, and deliberately a separate function
 * reading a separate predicate. `null` means "not my kind of step".
 *
 * These two were one function until the settlement ruling, and collapsing
 * them again would be a silent regression rather than a tidy-up: the moment
 * eligibility moved to `isSettled`, anything delegating to it would report
 * "unanswered" for a learner who had answered everything and was reading the
 * last explanation — which is exactly the stale notice Founder video UAT
 * found. They differ only in the state they read, and that difference is the
 * whole point.
 */
export function attemptedNearTransfer(
  step: LearnerMissionStep,
  states: MissionNearTransferState
): boolean | null {
  if (step.content.type !== "near_transfer") return null;

  return isComplete(
    step.content,
    states[step.stableId] ?? INITIAL_NEAR_TRANSFER_STATE
  );
}

/**
 * What a learner is told is waiting, rather than leaving the lesson looking
 * finished when it is not.
 *
 * Mechanical interface copy, not curriculum: it names the activity's own state
 * and teaches nothing.
 */
export function describeWithheldStepsNotice(): string {
  return "Answer the questions above to continue.";
}

/**
 * How far through the learner is, for orientation. Never a score.
 *
 * ## What the number describes
 *
 * The question WHOSE CONTENT IS ON SCREEN — its prompt while it is being
 * asked, its feedback once it has been answered. Not how many have been
 * committed.
 *
 * Founder video UAT found the difference. This counted commitments, so
 * submitting an answer advanced the counter while the feedback for that same
 * answer was still the only thing displayed: the learner read "Question 2 of
 * 4" above the verdict and explanation for question 1, and again "Question 4
 * of 4" above question 3's. The counter was describing internal state rather
 * than the screen.
 *
 * It now reads the same `activeQuestionIndex` the rest of the activity is
 * built from, so the number and the content cannot disagree — advancing
 * happens when the learner presses on, and not before.
 *
 * `null` once every question has been read past. There is no question on
 * screen then, so a counter would be describing nothing.
 */
export function describeProgress(
  step: LearnerNearTransferStep,
  state: NearTransferState
): string | null {
  const index = activeQuestionIndex(step, state);
  if (index === null) return null;

  return `Question ${index + 1} of ${step.questions.length}`;
}

/** Conventional instruction for a question that takes more than one answer. */
export function describeMultipleChoiceHint(): string {
  return "Select all that apply.";
}

/** What a learner is told before they have answered anything. */
export function describeCommitLabel(): string {
  return "Submit answer";
}

/**
 * The resolution of one committed question.
 *
 * Null before commitment — which is what keeps the answer and the explanation
 * off the screen until the learner has chosen. Nothing else guards it, and
 * nothing else needs to.
 */
export interface NearTransferResolution {
  readonly correct: boolean;
  /** The verdict, in words. Never carried by colour alone. */
  readonly verdict: string;
  /** What the learner chose, in the authored option text. */
  readonly selected: readonly string[];
  /** The authored answer, shown only when the learner was wrong. */
  readonly expected: readonly string[];
  readonly explanation: string;
}

export function resolveQuestion(
  step: LearnerNearTransferStep,
  state: NearTransferState,
  questionStableId: string
): NearTransferResolution | null {
  if (!state.committed.includes(questionStableId)) return null;

  const question = step.questions.find(
    (candidate) => candidate.questionStableId === questionStableId
  );
  const answer = step.answers[questionStableId];

  if (question === undefined || answer === undefined) return null;

  const selectedIds = state.selection[questionStableId] ?? [];

  // Deterministic, authored, and decided in one comparison. The shared contract
  // owns the rule so the browser cannot disagree with anything else about it.
  const correct = isNearTransferAnswerCorrect(
    {
      ...question,
      correctOptionIds: answer.correctOptionIds,
      explanation: answer.explanation
    } as NearTransferQuestion,
    selectedIds
  );

  const textOf = (ids: readonly string[]): readonly string[] =>
    question.options
      .filter((option) => ids.includes(option.optionId))
      .map((option) => option.text);

  return {
    correct,
    verdict: correct ? "Correct" : "Not quite",
    selected: textOf(selectedIds),
    // Shown only when they were wrong; a learner who was right does not need
    // their own answer repeated back at them as "the expected answer".
    expected: correct ? [] : textOf(answer.correctOptionIds),
    explanation: answer.explanation
  };
}

/* ------------------------------------------------------------------ *
 * The scenario
 * ------------------------------------------------------------------ */

/**
 * A topology the learner reads, drawn by the existing renderer.
 *
 * ## Why this builds an ObservationModel
 *
 * `buildTopologyLayout` already knows how to place devices, route wires, size
 * cards and label ports, and `TopologyView` already renders that accessibly. A
 * second topology renderer would be a second answer to "what does this network
 * look like", which is exactly the duplication DEC-058 exists to prevent.
 *
 * What it does NOT do is fabricate a journey. `stages` is empty,
 * `currentStageId` is null, there are no actions and no consequence — so no
 * device is current, no link is traversed, no marker is drawn and nothing
 * animates. This is the observation contract describing a network at rest,
 * which is a legitimate observation, not a packet journey with the motion
 * removed.
 */
export function buildStaticTopologyLayout(
  topology: NearTransferTopology
): TopologyLayout {
  const model: ObservationModel = {
    sourceKind: "authored_teaching",
    availability: "available",
    // No traffic exists in a static scenario. The renderer only uses this to
    // caption motion, and there is none.
    trafficLabel: "",
    groups: [],
    nodes: topology.nodes.map((node) => ({
      nodeId: node.nodeId,
      label: node.label,
      role: node.role,
      ...(node.about !== undefined ? { about: node.about } : {}),
      // One interface per link end, so the existing layout can anchor a wire.
      interfaces: topology.links
        .filter((link) => link.endpoints.includes(node.nodeId))
        .map((link) => ({
          interfaceId: `${node.nodeId}--${link.linkId}`,
          label: link.label,
          availability: "available" as const,
          attributes: []
        }))
    })),
    // Carried across unchanged. The renderer draws what the author declared;
    // nothing here decides that a network exists past a device.
    ...(topology.externalNetworks !== undefined
      ? { externalNetworks: topology.externalNetworks }
      : {}),
    links: topology.links.map((link) => ({
      linkId: link.linkId,
      label: link.label,
      endpoints: [
        `${link.endpoints[0]}--${link.linkId}`,
        `${link.endpoints[1]}--${link.linkId}`
      ] as const,
      availability: "available" as const
    })),
    stages: [],
    currentStageId: null,
    actions: [],
    consequence: null
  };

  return buildTopologyLayout(model, null);
}
