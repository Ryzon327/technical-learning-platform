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
 * Which required INTERACTIONS the learner has settled, by step stableId.
 *
 * ## Why a boolean is the whole state
 *
 * A near-transfer check needs a state machine because the lesson has to know
 * which question the learner is on. An interaction owns its own state entirely
 * — where the journey is, what was predicted, what was applied — and the lesson
 * needs exactly one fact from it: has the learner said they are finished. One
 * boolean is that fact, and anything richer would be a second copy of state the
 * interaction already holds.
 *
 * ## What it is not
 *
 * Not a score, not a result, not evidence, and not correctness. It records that
 * the learner pressed Finish on an activity, the same way `acknowledged`
 * records that they pressed Finish on a question's feedback. It is browsing
 * state: nothing persists it and nothing is sent anywhere.
 *
 * An absent entry is `false` — not settled — which is the correct reading for
 * an activity the learner has not reached.
 */
export type MissionInteractionSettlement = Readonly<Record<string, boolean>>;

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
 * ## The second kind of required activity
 *
 * A required INTERACTION waits in exactly the same way, on exactly the same
 * terms. Founder UAT on Mission 2 read the closing steps while the walkthrough
 * above them was still on its first stage: the lesson answered its own activity
 * before the learner had worked it. What it waits on is the learner pressing
 * Finish on the activity — settled, never correct — and only where the author
 * marked the step required. `settlement` is optional, and omitting it is
 * today's behaviour exactly.
 *
 * Whichever kind comes FIRST in authored order is the one the lesson waits at.
 *
 * Generic: it knows about the step TYPE and about nothing in any mission. The
 * blocking step itself always stays visible — it is the thing being waited on.
 */
/**
 * The step a learner is moved to once a required activity is finished.
 *
 * ## Why the reveal needs a destination at all
 *
 * Finishing a required activity unmounts the control that was pressed — its
 * own render condition goes false — and the focus it was holding falls to
 * `document.body`. A keyboard learner is returned to the top of the document,
 * and a screen-reader learner is told nothing about the steps that press just
 * revealed. Inside the expanded workspace it is worse: losing focus also drops
 * the learner out of the pane's Tab cycle.
 *
 * So the reveal announces itself, and this says where.
 *
 * ## What it knows, and what it refuses to know
 *
 * AUTHORED ORDER, and nothing else. It does not read step types, content,
 * settlement or near-transfer state, and it does not ask whether the next step
 * is itself withheld — `visibleInstructionSteps` already decides that, and
 * asking twice would let the two disagree.
 *
 * `null` when the finished step was the last authored one. That is ordinary:
 * there is nothing after it, and the caller leaves focus where it is rather
 * than inventing a destination.
 */
/**
 * Whether this change to a near-transfer's state is the one that reveals what
 * comes after it.
 *
 * ## Why a transition, and not simply "is it settled now"
 *
 * The lesson hands focus on exactly ONCE, at the moment the steps behind a
 * required activity appear. Asking "is it settled" would be true of every
 * subsequent keystroke in the revealed content too, and focus would be yanked
 * back to the same section over and over.
 *
 * ## Why the near-transfer needs this at all
 *
 * The interaction's Finish already hands focus on, from its own `onSettle`.
 * The near-transfer has no `onSettle` — it settles by acknowledging the last
 * question's feedback, through the same `onChange` every other answer goes
 * through — so nothing on that path could tell the reveal from an ordinary
 * selection. Mission 2 has both controls, and until this existed only one of
 * them carried the learner forward.
 *
 * Correctness is no part of it. A learner who answered every question wrongly
 * settles, reveals and is carried on exactly as one who answered them all
 * correctly.
 */
export function revealedByNearTransfer(
  step: LearnerMissionStep,
  before: NearTransferState,
  after: NearTransferState
): boolean {
  if (step.content.type !== "near_transfer") return false;

  return !isSettled(step.content, before) && isSettled(step.content, after);
}

export function nextInstructionStepId(
  steps: readonly LearnerMissionStep[],
  stableId: string
): string | null {
  const at = steps.findIndex((step) => step.stableId === stableId);

  // A step that is not in this lesson has no successor in it. Returning
  // `steps[0]` for `-1 + 1` would move the learner to the top of a mission
  // because of a bookkeeping error somewhere else.
  if (at === -1) return null;

  return steps[at + 1]?.stableId ?? null;
}

export function visibleInstructionSteps(
  steps: readonly LearnerMissionStep[],
  states: MissionNearTransferState,
  settlement: MissionInteractionSettlement = {}
): readonly LearnerMissionStep[] {
  const blockedAt = blockingStepIndex(steps, states, settlement);

  return blockedAt === -1 ? steps : steps.slice(0, blockedAt + 1);
}

/**
 * The step holding the rest of the lesson back, or -1.
 *
 * One traversal rule, used by everything that needs to know where the lesson
 * stops. Two `findIndex` calls with the same intent is how the thing that
 * hides the steps and the thing that explains why they are hidden come to
 * disagree — which is the defect below.
 *
 * ## Two kinds of required activity, one rule
 *
 * `findIndex` stops at the FIRST unsettled one in AUTHORED ORDER, whichever
 * kind it is. That ordering is the whole guarantee: a mission that authors a
 * required walkthrough and then a near-transfer check waits at the walkthrough,
 * and one that authors them the other way round waits at the check. Asking
 * about one kind first would let a later activity hide an earlier one.
 *
 * An interaction blocks only when its author SAID it should
 * (`requiredForProgression`). Absent means today's behaviour exactly: the step
 * is not a gate and nothing waits on it.
 */
function blockingStepIndex(
  steps: readonly LearnerMissionStep[],
  states: MissionNearTransferState,
  settlement: MissionInteractionSettlement
): number {
  return steps.findIndex((step) => {
    if (step.content.type === "near_transfer") {
      const state = states[step.stableId] ?? INITIAL_NEAR_TRANSFER_STATE;
      return !isSettled(step.content, state);
    }

    return requiredInteraction(step, settlement) === false;
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
  states: MissionNearTransferState,
  settlement: MissionInteractionSettlement = {}
): boolean {
  const blockedAt = blockingStepIndex(steps, states, settlement);
  if (blockedAt === -1) return false;

  const blocking = steps[blockedAt];
  if (blocking === undefined) return false;

  // Reads ATTEMPTED directly, and must never delegate to
  // `requiredNearTransfer`: that one reads SETTLED, so it reports `false` for
  // any blocking step by construction, and the notice would return underneath
  // the final feedback. `false` here is "this step has questions left".
  //
  // `null` now DOES occur, and returning false for it is the point rather than
  // an oversight: a required interaction can block, and the notice this drives
  // says "Answer the questions above to continue." A walkthrough has no
  // questions and carries its own Finish control, so telling a learner to
  // answer questions that do not exist would be the same stale-notice defect
  // in a new place. The activity says what it needs; the lesson stays quiet.
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
 * Whether one step is a required INTERACTION, and whether it is DONE.
 *
 * The sibling of `requiredNearTransfer`, answering the same question about the
 * other kind of inline activity. `null` means "not my kind of step" — which
 * covers every step that is not an interaction, and equally every interaction
 * whose author did not mark it required.
 *
 * ## Why the author decides, and not this function
 *
 * An interaction is not required merely by existing. Most are demonstrations
 * placed beside prose, and gating the lesson on every one of them would change
 * the behaviour of every mission already written. `requiredForProgression` is
 * the authored fact, it is optional, and its absence is today's behaviour
 * exactly.
 *
 * ## Done means SETTLED, the same as it does next door
 *
 * The learner pressing Finish on the activity, and nothing else. Not the
 * journey reaching its authored end — that is the interaction's own state, not
 * the learner saying they have read it — and not correctness, which does not
 * exist here: an interaction produces no score, no attempt and no evidence, so
 * a learner who predicted wrongly at every stage settles it exactly as one who
 * predicted correctly does.
 *
 * ## Why this lives here rather than inline
 *
 * The same reason `requiredNearTransfer` does. Mutation testing showed that a
 * predicate of this kind sitting inside a component with no test harness could
 * be swapped without a single failure, so it is pinned in a module that has
 * one.
 */
export function requiredInteraction(
  step: LearnerMissionStep,
  settlement: MissionInteractionSettlement
): boolean | null {
  if (step.content.type !== "interaction") return null;
  if (step.content.requiredForProgression !== true) return null;

  // Absent is "not settled", which is the correct reading for an activity the
  // learner has not reached yet.
  return settlement[step.stableId] === true;
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
      /*
        One interface per link end, so the existing layout can anchor a wire.

        Where the author named the PORT this link occupies on this device, that
        name becomes the interface label and the end is flagged `prominent` —
        which is the same authored flag Switch-1 uses in the main Packet
        Journey, read by the same `buildTopologyLayout`, drawn by the same
        `TopologyView`, in the same place beside the same wire. There is no
        second visual language here and no second placement rule.

        Founder UAT, Mission 2's "Try it on a different switch": the questions
        ask which ports carry copies and which entry the switch can learn, and
        the diagram named no port at all. The mapping lived in prose, so a
        learner had to memorise it to answer questions about switching.

        Where the author named no port, nothing changes: the interface keeps
        the link's own label, stays unflagged, and no label is drawn. Mission
        1's near-transfer authors none and is untouched.
      */
      interfaces: topology.links
        .filter((link) => link.endpoints.includes(node.nodeId))
        .map((link) => {
          // Matched by nodeId, never by endpoint position. Which end a port
          // belongs to is an authored fact; reordering `endpoints` must not
          // silently move a port from one device to the other.
          const port = link.portLabels?.find(
            (candidate) => candidate.nodeId === node.nodeId
          );

          return {
            interfaceId: `${node.nodeId}--${link.linkId}`,
            label: port?.label ?? link.label,
            availability: "available" as const,
            attributes: [],
            ...(port !== undefined ? { prominent: true } : {})
          };
        })
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
