import {
  buildPacketJourneyObservationModel,
  INITIAL_PACKET_JOURNEY_PROGRESS,
  type LearnerPacketJourneyParameters,
  type ObservationModel,
  type PacketJourneyProgress
} from "@tlp/shared-types";
import {
  buildTopologyLayout,
  currentDeliveryStartIndex,
  type TopologyLayout
} from "./topology-layout";

/**
 * WP-H — the Packet Journey's behaviour, as total functions over plain values.
 *
 * ## Why this module exists
 *
 * The same reason `mission-instruction-presentation.ts` exists: this repository
 * has one narrow DOM test (the focus handoff) and no browser harness — no
 * testing-library — and WP-H may not add one, because a dependency change is a
 * Founder gate and fails `verify-roas3.sh`.
 *
 * So every rule that matters — when the learner may advance, what a prediction
 * gates, what is announced, what the text trace says, which controls are
 * offered — lives here as a function over plain values, and `PacketJourney.tsx`
 * is left thin enough that what remains is markup a structural gate can check.
 *
 * ## The one thing this module must never become
 *
 * A second source of networking truth. Nothing here computes forwarding,
 * routing, VLAN membership, reachability or success. It reads an
 * `ObservationModel` that a source already determined, and decides only how to
 * PRESENT it and when the learner may ask for the next authored observation.
 *
 * The single source of the model is `buildPacketJourneyObservationModel` in
 * `@tlp/shared-types`. This module never reads authored parameters to decide an
 * outcome — it passes them to that builder and consumes what comes back.
 *
 * ## One model, two presentations
 *
 * The visual renderer and the accessible path both consume the view built
 * here. CURR-011 section 14.6 requires exactly that: the accessible path "must
 * use the same validated interaction parameters and the same ObservationModel"
 * and "must not create a second simulation or a second source of truth".
 *
 * There is deliberately **no motion input anywhere in this file**. A
 * reduced-motion learner receives the identical view model with the identical
 * actions; only CSS differs. Parity is therefore structural rather than a
 * behaviour two code paths have to remember to keep.
 */

/* ------------------------------------------------------------------ *
 * Sequencing — the client's share of progressive support
 * ------------------------------------------------------------------ */

/**
 * How much the learner is asked to do before the next authored observation.
 *
 * ## What this is, and precisely what it is not
 *
 * It is SEQUENCING over content the server has ALREADY AUTHORISED and already
 * sent. CURR-011 section 7 and DEC-059 place withholding server-side, and note
 * that ordering already-authorised content is the client's concern
 * (`instruction-interaction.ts`, Architect decision 11): "the expected result is
 * withheld until commitment, which is a SEQUENCING concern the client owns".
 *
 * It is **not** enforcement, and it cannot become enforcement. Protected levels
 * do not appear in this file at all. They do not need to: at a protected level
 * the answer-bearing fields are ABSENT from the payload, so there is nothing
 * for any branch here to reveal or conceal. The default arm below is the strict
 * one, so a level this module does not name gets the most participation
 * required and the least assistance offered — which is the safe direction for
 * anything unrecognised.
 *
 *   demonstrate    the system walks the learner through it
 *   guide          the learner is prompted to look before each reveal
 *   commit_first   a prediction must be committed before the reveal
 */
export type InteractionSequencing = "demonstrate" | "guide" | "commit_first";

/**
 * Which sequencing an authorised support level asks for.
 *
 * An ALLOWLIST, deliberately. Only the three levels that withhold nothing are
 * named; everything else — including every level that protects content, and
 * including a value this build does not recognise — falls through to the
 * strictest arm. Written this way, adding a protected level to the contract can
 * never accidentally loosen the client.
 */
export function resolveSequencing(supportLevel: string): InteractionSequencing {
  if (supportLevel === "show_me") return "demonstrate";
  if (supportLevel === "help_me") return "guide";
  return "commit_first";
}

/* ------------------------------------------------------------------ *
 * Learner state
 * ------------------------------------------------------------------ */

/**
 * Where the learner is, and what they have committed to.
 *
 * `committedPredictions` maps a stage id to the option the learner chose. It
 * records a COMMITMENT, not a correctness verdict: nothing scores it, nothing
 * stores it beyond this component's lifetime, and no competency, evidence or
 * progress follows from it.
 */
export interface PacketJourneyViewState {
  /**
   * Whether the learner has deliberately begun the activity.
   *
   * ## Why this exists
   *
   * Founder UAT asked for an obvious Start. Before this field, an interaction
   * began the moment it rendered: the first prediction and the first control
   * were simply present, so "what am I supposed to do" had to be inferred from
   * whichever control happened to be on screen.
   *
   * A deliberate not-started state answers that question instead. The learner
   * reads two lines, sees the environment, and presses one obviously primary
   * control.
   *
   * ## What it is NOT
   *
   * Engagement, and nothing else. Starting a teaching interaction is not
   * competency, not evidence, not lab success, not progress and not
   * publication state — this object holds none of those and cannot acquire
   * them, because it is component state that outlives nothing.
   *
   * It is also not a second progression engine. It gates the FIRST reveal in
   * exactly the way an uncommitted prediction gates the next one, through the
   * same `canAdvance` function.
   */
  readonly started: boolean;
  readonly progress: PacketJourneyProgress;
  readonly committedPredictions: Readonly<Record<string, string>>;
  /**
   * Which option the learner chose for each stage's knowledge check.
   *
   * Separate from `committedPredictions` because the two mean different things,
   * and the difference is WHEN the learner is asked rather than whether an
   * answer key exists.
   *
   * A PREDICTION is committed before the evidence. Where the learner cannot yet
   * know, it stays exploratory and the observation is the answer — Mission 2's
   * d2 asks what a switch does with a destination it has no record of, before
   * they have ever been shown one, and carries no key. Where the course has
   * already taught enough for the answer to be objectively determinable, the
   * author MAY supply `correctOption` and `explanation`, and d7 does exactly
   * that three stages later. DEC-063 originally said a prediction is never
   * graded; the Founder ruling at DEC-067 §8 supersedes that.
   *
   * A KNOWLEDGE CHECK is asked after the teaching, so it always can.
   *
   * Either way the commitment happens BEFORE correctness is revealed, and
   * either way nothing is scored, no attempt is recorded, and no evidence or
   * competency state is produced. Keeping the two records apart is about
   * preserving that ordering, not about which one may carry a key.
   *
   * Recorded once, like a commitment — the point is to find out what the
   * learner actually believed, not to let them reach the right option by
   * elimination.
   */
  readonly answeredChecks: Readonly<Record<string, string>>;
}

export const INITIAL_PACKET_JOURNEY_VIEW_STATE: PacketJourneyViewState = {
  /*
    Founder video UAT: pressing Start moved no traffic. It only revealed the
    prediction the learner had already been told to make, which is a click that
    teaches nothing (the Mechanical Interaction Law).

    The journey therefore begins ENGAGED. Nothing moves until the learner acts;
    what is gone is the ceremony in front of the first real decision.
  */
  started: true,
  progress: INITIAL_PACKET_JOURNEY_PROGRESS,
  committedPredictions: {},
  answeredChecks: {}
};

/**
 * Begin the activity.
 *
 * Idempotent, and it reveals nothing on its own: it moves no stage, commits no
 * prediction and applies no remediation. All it does is release the controls
 * the learner needs in order to take the first step themselves.
 */
export function startJourney(
  state: PacketJourneyViewState
): PacketJourneyViewState {
  if (state.started) return state;
  return { ...state, started: true };
}

/**
 * Record the learner's answer to a stage's knowledge check.
 *
 * Nothing here decides whether it is right. Correctness is a comparison
 * against the AUTHORED `correctOption`, made when the view is built — so it is
 * deterministic, inspectable and identical for every learner. No AI is
 * consulted, nothing is scored, and no evidence is produced.
 */
export function answerKnowledgeCheck(
  state: PacketJourneyViewState,
  /** The CHECK's id, not the stage's — a stage may author several. */
  checkId: string,
  option: string
): PacketJourneyViewState {
  if (state.answeredChecks[checkId] !== undefined) return state;

  return {
    ...state,
    answeredChecks: { ...state.answeredChecks, [checkId]: option }
  };
}

/**
 * Record the learner's prediction, and show them what actually happened.
 *
 * ## Why committing also reveals
 *
 * Founder video UAT, twice. Committing used to record the answer and stop
 * there, which left the learner on a screen that said "Prediction recorded:
 * Switch-1. Nothing has been sent yet." above a second button. Acknowledging a
 * submission is not an instructional beat — the learner knows they submitted,
 * because they submitted — and the screen answered nothing they had just been
 * asked.
 *
 * An earlier pass removed the BEAT that rendered it. The state it rendered
 * survived: with the question answered and nothing revealed, the pane fell
 * through to the orientation, and the live region still announced the
 * recording. Deleting text would have moved the defect rather than fixed it.
 *
 * So the transition itself is now atomic: predict, and observe. The pending
 * state stops being reachable rather than stopping being rendered.
 *
 * ## Why only the stage that was predicted
 *
 * The reveal is released by the commitment for the stage the reveal is about.
 * A prediction committed for anything other than the next unrevealed stage
 * cannot exist — committing is what releases the reveal — and reading exactly
 * that one slot keeps the rule visible rather than implied.
 */
export function commitPrediction(
  state: PacketJourneyViewState,
  stageId: string,
  option: string,
  parameters?: LearnerPacketJourneyParameters
): PacketJourneyViewState {
  if (state.committedPredictions[stageId] !== undefined) return state;

  const committed = {
    ...state,
    committedPredictions: { ...state.committedPredictions, [stageId]: option }
  };

  if (parameters === undefined) return committed;

  const next = parameters.stages[state.progress.revealedStageCount];
  if (next?.stageId !== stageId) return committed;

  return {
    ...committed,
    progress: {
      ...committed.progress,
      revealedStageCount: committed.progress.revealedStageCount + 1
    }
  };
}

/**
 * Reveal the next authored observation.
 *
 * Refuses when a pending prediction has not been committed, so the reveal
 * cannot be reached around: this is the client-side SEQUENCING of content the
 * server already authorised for this support level. It is not a security
 * boundary and is not claimed as one — the server decided what may be sent;
 * this decides when the learner sees it.
 */
export function advance(
  state: PacketJourneyViewState,
  parameters: LearnerPacketJourneyParameters,
  sequencing: InteractionSequencing = "commit_first"
): PacketJourneyViewState {
  if (!canAdvance(state, parameters, sequencing)) return state;

  return {
    ...state,
    progress: {
      ...state.progress,
      revealedStageCount: state.progress.revealedStageCount + 1
    }
  };
}

/**
 * Apply one authored remediation.
 *
 * Only once. A second application would let a learner cycle through the
 * options until something worked, which is guessing rather than diagnosing.
 */
export function applyAction(
  state: PacketJourneyViewState,
  actionId: string,
  /**
   * Whether the model is still offering a choice here.
   *
   * Founder ruling, Mission 8 refinement: a change that did not repair the
   * fault must teach its misconception and let the learner choose again,
   * instead of ending the journey and making them restart from the beginning.
   *
   * This is deliberately NOT `resolvesFault`. Whether a change worked is the
   * observation model's to decide, and the browser must not be able to read
   * the answer key or rebuild a consequence from it (`verify-wph.sh`). The
   * model already withdraws remediation once the fault is resolved, so "is a
   * choice still on offer" is the same fact expressed without the answer —
   * and it is what the renderer is already using to enable the button.
   *
   * Omitted, it keeps the old behaviour: one choice, final.
   */
  stillOffered = false
): PacketJourneyViewState {
  if (state.progress.appliedActionId !== null && !stillOffered) return state;

  return {
    ...state,
    progress: { ...state.progress, appliedActionId: actionId }
  };
}

/** Start again, keeping nothing. Used by the "start over" control. */
export function resetJourney(): PacketJourneyViewState {
  return INITIAL_PACKET_JOURNEY_VIEW_STATE;
}

/* ------------------------------------------------------------------ *
 * Prediction gating
 * ------------------------------------------------------------------ */

/**
 * The prediction the learner must commit before the next reveal, if any.
 *
 * A prediction belongs to the stage it asks about, so it is read from the NEXT
 * stage — the one not yet revealed. Asking after the reveal would be a quiz;
 * asking before it is the instructional method.
 */
export function pendingPrediction(
  state: PacketJourneyViewState,
  parameters: LearnerPacketJourneyParameters
): { readonly stageId: string; readonly prompt: string; readonly options: readonly string[] } | null {
  const next = parameters.stages[state.progress.revealedStageCount];
  if (next === undefined) return null;
  if (next.prediction === undefined) return null;
  if (state.committedPredictions[next.stageId] !== undefined) return null;

  return {
    stageId: next.stageId,
    prompt: next.prediction.prompt,
    options: next.prediction.options
  };
}

/**
 * Whether another authored observation may be revealed right now.
 *
 * The prediction gate is what `commit_first` sequencing MEANS: the reveal
 * cannot be reached around, so predicting is participation rather than an
 * optional detour.
 *
 * At `demonstrate` and `guide` the gate is lifted. The prediction is still
 * offered, still committed the same way and still compared against what
 * happened — the learner simply is not required to answer before the system
 * shows them. That is the difference between being taught something and being
 * asked to work it out, and it is the whole of what separates those levels here.
 *
 * Nothing about this is a security boundary and none is claimed: the server
 * decided what may be sent, and this decides only when the learner sees it.
 */
export function canAdvance(
  state: PacketJourneyViewState,
  parameters: LearnerPacketJourneyParameters,
  sequencing: InteractionSequencing = "commit_first"
): boolean {
  // Nothing is revealed until the learner has deliberately begun. The same
  // gate that stops the reveal being reached around an uncommitted prediction
  // stops it being reached around the Start the Founder asked for — one
  // function, one place, rather than a second rule elsewhere.
  if (!state.started) return false;

  if (state.progress.revealedStageCount >= parameters.stages.length) {
    return false;
  }

  // The journey stopped where the source said it stopped, so there is nothing
  // further to observe until that changes.
  //
  // This became load-bearing when the fixture gained the stages that carry the
  // journey through to its destination. Before that, the stop point happened to
  // be the last authored stage, so running out of stages did the job by
  // accident. With stages beyond it, a learner could otherwise have advanced
  // straight past the failure without diagnosing anything.
  //
  // Whether it still stops is read from the OBSERVATION MODEL, never from the
  // authored outcome directly: the authored outcome describes the journey while
  // the fault is present, and the model is what accounts for an applied
  // remediation. Reading the authored field here would need this module to know
  // which action repairs what, which is answer-bearing and is not sent at every
  // support level.
  const model = buildPacketJourneyObservationModel(parameters, state.progress);
  if (model.consequence?.state === "stopped") return false;

  if (sequencing !== "commit_first") return true;
  return pendingPrediction(state, parameters) === null;
}

/* ------------------------------------------------------------------ *
 * The view model
 * ------------------------------------------------------------------ */

export interface PacketJourneyStageView {
  readonly stageId: string;
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly narration: string;
  readonly decision?: string;
  readonly outcomeLabel: string;
  readonly stopped: boolean;
  readonly committedPrediction?: string;
  /** What this device is doing at this stage, in the author's words. */
  readonly action?: string;
}

/**
 * A prediction the learner has committed to for a stage they have NOT yet
 * revealed.
 *
 * ## The Founder UAT defect this exists to fix
 *
 * Committing a prediction on the first stage used to make it VANISH. The
 * fieldset unmounted because the commitment had been recorded, the commitment
 * had nowhere else to render because stage views are built only from revealed
 * stages, the live region still read "Ready to start." because nothing had been
 * revealed, and the advance control was labelled "Start". Four separate
 * presentation facts combined into one wrong impression: that committing a
 * wrong prediction had reset the interaction.
 *
 * Nothing had reset. `revealedStageCount` never moved, `resetJourney` was never
 * called, and the commitment was recorded correctly the whole time — it simply
 * had no home on screen until the stage it belonged to appeared.
 *
 * So a commitment is now a first-class view object from the instant it is made.
 * It stays visible, it changes what is announced, and when the stage is revealed
 * it pairs with the authored narration as prediction beside observation.
 */
export interface PacketJourneyCommitmentView {
  readonly stageId: string;
  readonly option: string;
}

/**
 * What just happened, as one object rendered beside the topology.
 *
 * ## The Founder UAT finding this exists to fix
 *
 * In the expanded workspace the learner decided and acted in the right-hand
 * rail while the packet, the wire and the device changed on the left. It was
 * possible to click through the whole journey without once looking at the
 * network — which defeats the entire method, because the observation IS the
 * teaching.
 *
 * The correction is spatial: the decision, the action and this event object all
 * sit with the picture, and the reference material moves out of the way. This
 * object is what makes that possible — a single, changing, prominent statement
 * of the current state that can be rendered directly under the topology.
 *
 * `token` changes whenever anything observable changes. It drives the transient
 * emphasis and nothing else: no branch reads it, and a presentation that
 * ignored it entirely would lose only the emphasis, never a fact.
 */
export const PACKET_JOURNEY_EVENT_KINDS = [
  "waiting",
  "moving",
  "stopped",
  "repaired",
  "confirmed"
] as const;

export type PacketJourneyEventKind =
  (typeof PACKET_JOURNEY_EVENT_KINDS)[number];

export interface PacketJourneyEventView {
  readonly kind: PacketJourneyEventKind;
  /** Where the traffic is and what state it is in, in words. */
  readonly headline: string;
  /** The link crossed to arrive here, in words. Null when none was named. */
  readonly via: string | null;
  /** A new value means something observable just changed. */
  readonly token: string;
}

export interface PacketJourneyActionView {
  readonly actionId: string;
  readonly label: string;
  readonly available: boolean;
}

/* ------------------------------------------------------------------ *
 * The current task
 *
 * WP-J Module 1 Founder UAT — instructional flow.
 *
 * ## The finding
 *
 * At a normal viewport the Founder "did not know what to do". The first
 * learner action was below the fold, reachable only by scrolling and
 * comfortable only after zooming the browser out. Worse, once the topology was
 * pinned, scrolling could leave a persistent picture on screen with the control
 * that advances it somewhere else entirely — a visualisation with no visible
 * way forward.
 *
 * ## Why the answer is a view object rather than a layout tweak
 *
 * "What should I do right now" was previously implied by which controls
 * happened to be rendered, and by where they happened to sit. That is not
 * something a test without a DOM can read, and it is not something a learner
 * can read either.
 *
 * So the current task is now a NAMED, derived fact. It is computed from the
 * state this module already holds — an open prediction, an available
 * remediation, whether another observation may be revealed, how many have been
 * revealed, whether remediation was withheld — and from nothing else. There is
 * no second progression engine and no second source of instructional truth:
 * every input is a value `buildPacketJourneyView` had already resolved.
 *
 * The renderer keeps the task beside the picture, and a test can assert which
 * task is current at every point of the journey.
 * ------------------------------------------------------------------ */

export const PACKET_JOURNEY_TASK_KINDS = [
  "start",
  "predict",
  "send",
  "continue",
  "repair",
  "blocked",
  "finished"
] as const;

export type PacketJourneyTaskKind = (typeof PACKET_JOURNEY_TASK_KINDS)[number];

export interface PacketJourneyTaskView {
  readonly kind: PacketJourneyTaskKind;
  /**
   * The heading above the current task.
   *
   * Deliberately short. The authored prompt, the authored start label and the
   * authored narration all say more, and all of them are rendered beneath it —
   * a heading that restated them would be the duplication this correction
   * exists to remove.
   */
  readonly label: string;
  /** True while the learner has something to do. False when nothing remains. */
  readonly actionable: boolean;
}

/**
 * Which task is current.
 *
 * Precedence is the instructional method in order: PREDICT before OBSERVE, and
 * a repair before continuing past the failure it caused. Where a level offers
 * both a prediction and the reveal — SHOW ME lifts the commit gate — predicting
 * is still named as the task, because it is still the step that teaches.
 */
export function resolveCurrentTask(
  hasStarted: boolean,
  hasOpenPrediction: boolean,
  hasAvailableRepair: boolean,
  canRevealMore: boolean,
  revealedCount: number,
  remediationWasWithheld: boolean
): PacketJourneyTaskKind {
  if (!hasStarted) return "start";
  if (hasOpenPrediction) return "predict";
  if (hasAvailableRepair) return "repair";
  if (canRevealMore) return revealedCount === 0 ? "send" : "continue";
  if (remediationWasWithheld) return "blocked";
  return "finished";
}

export function describeTaskLabel(kind: PacketJourneyTaskKind): string {
  if (kind === "start") return "Before you begin";
  if (kind === "predict") return "Current step: predict";
  if (kind === "send") return "Current step: send";
  if (kind === "continue") return "Current step: continue";
  if (kind === "repair") return "Current step: choose a change";
  if (kind === "blocked") return "Current step: nothing further to apply";
  return "Walkthrough complete";
}

/**
 * The label on the one obviously primary control in the not-started state.
 *
 * Plain and professional. The authored `startActionLabel` says what the FIRST
 * REVEAL does — "Send something from PC-A" — and is used on that control when
 * the learner reaches it. This one says only that the activity begins, because
 * beginning and sending are two different acts and naming them the same thing
 * is what made the earlier surface ambiguous.
 */
export function describeStartLabel(): string {
  return "Start";
}

/**
 * What the learner is told before they begin.
 *
 * One sentence. It says what they will do and that they will be asked to
 * predict first, and it reveals no answer: it names no destination, no device
 * and no outcome.
 */
export function describeStartInstruction(trafficLabel: string): string {
  return (
    `Look at the network on the left. When you start, you will predict which ` +
    `device ${trafficLabel} reaches first.`
  );
}

export function isTaskActionable(kind: PacketJourneyTaskKind): boolean {
  return kind !== "blocked" && kind !== "finished";
}

/** Whether the learner has not begun yet, for a renderer that must not guess. */
export function isNotStarted(kind: PacketJourneyTaskKind): boolean {
  return kind === "start";
}

/**
 * The orientation shown when the learner arrives at the interaction.
 *
 * Two short lines saying what the learner is looking at and what is happening
 * in it. What they are supposed to DO is `currentTask`'s and `startAction`'s
 * job, not this one — an earlier version of this block claimed orientation
 * answered that too, and the summary has not been phrased as an instruction
 * since Founder UAT rejected "X starts at Y" as awkward.
 *
 * ## What both lines are built from
 *
 * The EFFECTIVE TRAFFIC — the stage's own authored `traffic` override when it
 * carries one, and the journey's traffic block otherwise. `title` takes its
 * label; `summary` takes its label and the label of its source device.
 *
 * This block previously said `summary` was built from the authored START
 * LABEL. That was true once and is not now: Mission 2's reply travels from
 * PC-B, and orientation that stayed on the journey's opening words would go on
 * announcing that PC-A is sending while the learner watches the answer come
 * back. The start label is still authored and still used — by
 * `describeStartInstruction` and `startLabel`, which describe the control that
 * BEGINS the journey and correctly stay on the journey's own block, because a
 * stage override carries no `startActionLabel`.
 *
 * ## What it deliberately does not say
 *
 * It does not name the destination. `trafficSummary` does — "from PC-A to
 * Switch-1" — and that sentence used to sit directly above a prediction asking
 * which device the traffic reaches first, with Switch-1 among the options. The
 * orientation printed the answer above the question. It now says what is being
 * sent and from where, and stops there.
 */
export interface PacketJourneyOrientationView {
  readonly title: string;
  readonly summary: string;
}

export function describeOrientationTitle(trafficLabel: string): string {
  return `Follow ${trafficLabel}`;
}

export function describeOrientationSummary(
  trafficLabel: string,
  sourceLabel: string
): string {
  // A helper line above the network, not a sentence competing with the beat.
  // Founder UAT rejected "X starts at Y" as awkward; this says whose network
  // the learner is looking at, which is what orientation is for.
  return `${capitaliseFirst(sourceLabel)} is sending ${trafficLabel}.`;
}

export interface PacketJourneyInterfaceView {
  readonly interfaceId: string;
  readonly label: string;
  readonly attributes: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

/**
 * One device's authored display at the current stage.
 *
 * `label` is the author's caption ("Switch-1 knows"); `facts` are label/value
 * pairs in authored order. `nodeLabel` is resolved here so a presentation
 * never has to look a device up to caption this.
 */
export interface PacketJourneyDeviceFactsView {
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly label: string;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
}

export interface PacketJourneyNodeView {
  readonly nodeId: string;
  readonly label: string;
  readonly roleLabel: string;
  readonly current: boolean;
  /**
   * What this device is showing at the current stage, if the author gave it
   * something. The same authored values the Instructor pane reads — one
   * resolution, so the two surfaces cannot disagree.
   */
  readonly shownFacts?: PacketJourneyDeviceFactsView;
  /**
   * One sentence on what this CATEGORY of device is, derived from the authored
   * role. Absent for a role this presentation has no sentence for, in which
   * case nothing stands in for it.
   */
  readonly purpose?: string;
  /**
   * Authored prose on what this device is doing in this scenario. Absent when
   * the author wrote none; nothing is composed to fill the gap.
   */
  readonly about?: string;
  /** This device's relationship to the current journey, in one phrase. */
  readonly journeyStatus: JourneyStatusView;
  readonly interfaces: readonly PacketJourneyInterfaceView[];
}

export interface PacketJourneyLinkView {
  readonly linkId: string;
  readonly label: string;
  /**
   * Both ends in words: "PC-A eth0 to Switch-1 Fa0/1".
   *
   * Absent only when the topology could not be resolved, in which case the
   * authored `label` is all there is and is shown alone rather than replaced by
   * something invented.
   */
  readonly endpointSummary?: string;
  readonly current: boolean;
  readonly traversed: boolean;
}

export interface PacketJourneyView {
  /** Says what the learner is looking at. DEC-058 requires this on screen. */
  readonly sourceNotice: string;
  /** Two short lines saying what this is and what is happening in it. */
  readonly orientation: PacketJourneyOrientationView;
  /** What the learner should do RIGHT NOW, named rather than implied. */
  readonly currentTask: PacketJourneyTaskView;
  /**
   * The one obviously primary control, before the learner has begun.
   *
   * Null once the activity is under way, so a renderer cannot show a second
   * way to begin something that has already begun.
   */
  readonly startAction: { readonly label: string; readonly instruction: string } | null;
  readonly trafficSummary: string;
  readonly startLabel: string;
  readonly nodes: readonly PacketJourneyNodeView[];
  readonly links: readonly PacketJourneyLinkView[];
  /**
   * The drawable picture of the same observation model, or an explicit refusal
   * to draw one. Never a second source of state — it is built from the model
   * this view already read.
   */
  readonly topology: TopologyLayout;
  readonly stages: readonly PacketJourneyStageView[];
  /** How many network stages the journey authors, revealed or not. */
  readonly totalStages: number;
  /**
   * What devices are showing RIGHT NOW, as the author wrote it.
   *
   * Empty for every journey that authors none, which is every journey written
   * before the field existed. Read from the CURRENT revealed stage only: a
   * stage shows what its author gave it, and nothing accumulates across stages
   * here — carrying a fact forward is an authoring decision, not something
   * this function may make on the author's behalf.
   *
   * This is the Instructor pane's copy. It is instruction, so it belongs where
   * the learner is already looking rather than only behind a device click.
   */
  readonly deviceFacts: readonly PacketJourneyDeviceFactsView[];
  /** What just happened, rendered beside the topology it happened in. */
  readonly currentEvent: PacketJourneyEventView;
  readonly pendingPrediction: ReturnType<typeof pendingPrediction>;
  /** A commitment made for a stage that has not been revealed yet. */
  readonly pendingCommitment: PacketJourneyCommitmentView | null;
  readonly canAdvance: boolean;
  readonly advanceLabel: string;
  /** Whether the authored reason sits inline or behind a disclosure. */
  readonly decisionDisclosed: boolean;
  /** Set at the guided level: what to do before asking for the next reveal. */
  readonly inspectionPrompt: string | null;
  /** Whether committing a prediction is required before the next reveal. */
  readonly predictionRequired: boolean;
  readonly actions: readonly PacketJourneyActionView[];
  /**
   * The remediation the learner actually chose, and what it produced.
   *
   * Founder UAT, second round: "the learner must always be able to distinguish
   * ... MY ANSWER / CHOICE". The choice was already known here — it decided
   * whether the fault stage proceeds — but it reached the learner only as a
   * line inside the text trace, several screens down. Surfacing it is carrying
   * an authored value to the surface, not deciding anything new.
   *
   * `null` until a remediation is applied, and at every support level that
   * withheld the remediation set.
   */
  readonly chosenAction: {
    readonly label: string;
    readonly observation: string;
  } | null;
  /**
   * A prediction the learner made, now that the stage it was about has been
   * observed.
   *
   * Founder UAT: "'Recorded' alone is NOT adequate ... after observation
   * clearly expose YOUR PREDICTION / WHAT ACTUALLY HAPPENED / WHY."
   *
   * All three values were already authored and already on screen somewhere —
   * the comparison existed, but only inside the history disclosure the Founder
   * had already reported not noticing. This carries it to the live pane.
   *
   * Whether it is GRADED is the author's decision, per stage.
   *
   * `PacketJourneyPrediction.correctOption` is optional. Where an author left
   * it out — because the learner cannot yet know — this compares what they
   * expected against what happened and declares nobody right or wrong, which
   * is most of the course. Where an author supplied it, because the course has
   * already taught enough to work the answer out, the pane says so plainly.
   *
   * Either way nothing is scored, nothing is recorded, and no evidence or
   * competency is produced. See `correct` below, which is `null` in the
   * ungraded case rather than `false`.
   */
  readonly resolvedPrediction: {
    readonly option: string;
    readonly observed: string;
    readonly why: string | null;
    /**
     * Whether the learner's prediction matched the authored one — or `null`
     * where the mission authored no correct option, which is most of them.
     *
     * Founder ruling, Mission 8 refinement: a learner must never have to infer
     * from "what actually happened" whether their own model was right. Where
     * the course has already taught them enough to work the answer out, the
     * pane says so plainly. Where it has not, this stays null and the beat
     * compares expectation with observation exactly as before.
     */
    readonly correct: boolean | null;
    readonly correctOption: string | null;
    /** Why the expected answer is the expected answer. Authored, or null. */
    readonly explanation: string | null;
  } | null;
  /**
   * A knowledge check on the stage the learner is looking at.
   *
   * DEC-063 keeps this apart from a prediction. It asks about material already
   * shown, it carries an authored right answer, and once answered it resolves
   * explicitly — the learner is told whether they were correct, what the
   * correct answer was, and why.
   *
   * `answer` is `null` until they respond. Correctness is a comparison against
   * the authored `correctOption` and nothing else: no inference, no scoring,
   * no AI, and no evidence.
   */
  /**
   * The orientation facts, beside the current beat.
   *
   * Founder UAT: "I did not notice the existing leg information because it was
   * below the topology." Who is sending, what, to whom, where it is now and
   * which connection it is crossing are the questions a learner asks at every
   * step, and hunting for them under the drawing is the friction this removes.
   *
   * Every field is COPIED — a device's authored label, its flagged address,
   * the link's own endpoint summary. Nothing is computed, and a field the
   * mission has not authorised is simply absent rather than blank.
   */
  readonly quickReference: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly knowledgeCheck: {
    readonly stageId: string;
    /** The check being offered. A stage may author several, in order. */
    readonly checkId: string;
    readonly prompt: string;
    readonly options: readonly string[];
    /** How far through this stage's checks the learner is, for orientation. */
    readonly answeredCount: number;
    readonly totalCount: number;
    readonly answer: {
      readonly option: string;
      readonly correct: boolean;
      readonly correctOption: string;
      readonly explanation: string;
    } | null;
  } | null;
  /**
   * The check the learner most recently ANSWERED on the stage they are on.
   *
   * Separate from `knowledgeCheck`, which is the one being asked. A stage may
   * author a sequence, and while the learner is part-way through it those are
   * two different checks: answering the first must resolve the first, not
   * silently move on to the second.
   *
   * Founder UAT walked Mission 8's three reasoning steps and got no feedback at
   * all for the first two — the pane skipped straight to the next question, so
   * every transition read as the same two screens followed by another prompt.
   *
   * Cleared once the learner has acted on a repair: the reasoning is finished
   * and the answer belongs to the history disclosure from then on.
   */
  readonly resolvedCheck: {
    readonly checkId: string;
    readonly option: string;
    readonly correct: boolean;
    readonly correctOption: string;
    readonly explanation: string;
  } | null;
  readonly symptom: string | null;
  readonly explanation: string | null;
  readonly confirmation: string | null;
  /** Set when the journey stopped and this level sent no remediation. */
  readonly remediationWithheld: string | null;
  /** What an `aria-live` region announces after the latest change. */
  readonly announcement: string;
  /** The ordered plain-language account. Present at every support level. */
  readonly textTrace: readonly string[];
  readonly finished: boolean;
}

/**
 * Build everything both presentations need, from one observation model.
 *
 * Reads the model for every fact about the journey. The only inputs it takes
 * from learner state are which predictions were committed and which action was
 * applied — neither of which can change an outcome, because every outcome was
 * authored before the learner arrived.
 */
export function buildPacketJourneyView(
  parameters: LearnerPacketJourneyParameters,
  state: PacketJourneyViewState,
  sequencing: InteractionSequencing = "commit_first"
): PacketJourneyView {
  const model: ObservationModel = buildPacketJourneyObservationModel(
    parameters,
    state.progress
  );

  const nodeLabels = new Map(model.nodes.map((node) => [node.nodeId, node.label]));

  const revealed = model.stages.filter(
    (stage) => stage.availability === "available"
  );

  /*
    WHAT IS MOVING AT THE MOMENT THE LEARNER IS LOOKING AT.

    Resolved once, here, and handed to every surface that describes this
    moment. Before this existed each of those surfaces reached into
    `parameters.traffic` on its own, so Mission 2's reply travelled from PC-B
    while the quick reference, the orientation line, the announcement and the
    inspector all went on naming the outbound delivery from PC-A.

    Read from the LAST REVEALED stage, which is where the traffic is. The
    surfaces that describe the control that STARTS the journey deliberately do
    not use this — see `startLabel` and `describeStartInstruction` below, which
    stay on the journey's own block because a stage override carries no
    `startActionLabel` and could not answer them.
  */
  const effectiveTraffic = resolveEffectiveTraffic(
    parameters.traffic,
    revealed[revealed.length - 1]
  );

  const stages: PacketJourneyStageView[] = revealed.map((stage) => ({
    stageId: stage.stageId,
    nodeId: stage.atNodeId,
    nodeLabel: nodeLabels.get(stage.atNodeId) ?? stage.atNodeId,
    narration: stage.narration,
    ...(stage.decision !== undefined ? { decision: stage.decision } : {}),
    ...(stage.action !== undefined ? { action: stage.action } : {}),
    outcomeLabel: describeStageOutcome(stage.outcome),
    stopped: stage.outcome === "stops",
    ...(state.committedPredictions[stage.stageId] !== undefined
      ? { committedPrediction: state.committedPredictions[stage.stageId] }
      : {})
  }));

  // Absent when the support level withheld remediation. The presentation has
  // nothing to offer and invents nothing — it does not reconstruct, guess or
  // synthesise an action the server did not send.
  const appliedAction =
    state.progress.appliedActionId === null
      ? undefined
      : (parameters.actions ?? []).find(
          (action) => action.actionId === state.progress.appliedActionId
        );

  const consequence = model.consequence;
  const stopped = consequence?.state === "stopped";
  const confirmed = consequence?.state === "confirmed";

  /*
    THE DELIVERY ON SCREEN, NOT THE WHOLE JOURNEY.

    The card and the inspector describe the same device at the same moment and
    must say the same thing — that is a standing Founder ruling, and it is why
    `describeDeviceState` and `resolveNodeJourneyStatus` were brought into
    agreement over "Participating in this step".

    They each accumulate their own history, so scoping only the drawing would
    have re-opened exactly that disagreement in a new place: at Mission 2's
    second delivery PC-B's card would read "Not involved so far" while its
    status line still read "Passed through here."

    One rule, imported rather than restated. `currentDeliveryStartIndex` owns
    it, and its own comment records why both authored conditions are required.
  */
  const currentDelivery = revealed.slice(currentDeliveryStartIndex(revealed));

  // Only the stages the learner has actually observed. `model.stages` also
  // carries the unrevealed ones, each with its `atNodeId` — reading those
  // here would let device inspection answer a question the walkthrough has
  // not reached, including one the learner is about to be asked to predict.
  const revealedNodeIds = currentDelivery.map((stage) => stage.atNodeId);

  // The devices an author named as involved at a moment anchored elsewhere.
  // Read from the SAME stages, and kept apart from the anchors above for the
  // reason `resolveNodeJourneyStatus` records: the anchor list is ordered and
  // its last element is where the traffic is.
  const alsoInvolvedNodeIds = currentDelivery.flatMap(
    (stage) => stage.alsoAtNodeIds ?? []
  );

  // Who the CURRENT stage names, kept apart from the accumulated set above.
  // Participation is a statement about the moment on screen: three stages
  // later it would be false, and the status says "Passed through here." again.
  const alsoParticipatingNodeIds =
    revealed[revealed.length - 1]?.alsoAtNodeIds ?? [];

  /*
    What devices are showing at the moment the learner is looking at.

    Read from the CURRENT revealed stage and from nowhere else. Nothing here
    merges, accumulates or carries a fact forward from an earlier stage: if
    Switch-1 still knows something it learned two stages ago, the author says
    so again on this stage. That is deliberately more verbose to write, and it
    is the whole guarantee — a presentation that accumulated would be deciding
    what a device knows, which is the author's to state and not ours to infer.
  */
  // The last revealed stage is the one `model.currentStageId` names — the
  // projection sets it from exactly this position — and it is already to hand
  // here, so this reads it rather than resolving the same stage a second way.
  const deviceFacts: PacketJourneyDeviceFactsView[] = (
    revealed[revealed.length - 1]?.deviceFacts ?? []
  ).map((shown) => ({
    nodeId: shown.nodeId,
    nodeLabel: nodeLabels.get(shown.nodeId) ?? shown.nodeId,
    label: shown.label,
    facts: shown.facts.map((fact) => ({
      label: fact.label,
      value: fact.value
    }))
  }));

  const factsByNodeId = new Map(
    deviceFacts.map((shown) => [shown.nodeId, shown])
  );

  const nodes: PacketJourneyNodeView[] = model.nodes.map((node) => ({
    nodeId: node.nodeId,
    label: node.label,
    roleLabel: describeNodeRole(node.role),
    current: model.currentStageId !== null &&
      revealed[revealed.length - 1]?.atNodeId === node.nodeId,
    ...(describeRolePurpose(node.role) !== undefined
      ? { purpose: describeRolePurpose(node.role) as string }
      : {}),
    ...(node.about !== undefined ? { about: node.about } : {}),
    ...(factsByNodeId.has(node.nodeId)
      ? { shownFacts: factsByNodeId.get(node.nodeId) as PacketJourneyDeviceFactsView }
      : {}),
    journeyStatus: resolveNodeJourneyStatus({
      nodeId: node.nodeId,
      revealedNodeIds,
      alsoInvolvedNodeIds,
      alsoParticipatingNodeIds,
      confirmed,
      stopped,
      trafficLabel: effectiveTraffic.label
    }),
    interfaces: node.interfaces.map((iface) => ({
      interfaceId: iface.interfaceId,
      label: iface.label,
      // Only reported attributes are shown. An unreported one is omitted
      // rather than rendered as blank, which would read as "no value set".
      attributes: iface.attributes.flatMap((attribute) =>
        attribute.availability === "available" && attribute.value !== null
          ? [{ label: attribute.label, value: attribute.value }]
          : []
      )
    }))
  }));

  /*
    Whether the learner is being asked to predict before anything moves.

    Read from the stage the next reveal would show, so the opening status
    describes the action actually in front of them. Derived HERE, above both
    consumers, so the status line and the text account are told the same thing
    rather than each working it out.
  */
  const nextStageAsks =
    parameters.stages[state.progress.revealedStageCount]?.prediction !==
    undefined;

  const textTrace = buildTextTrace(
    parameters,
    state,
    stages,
    appliedAction,
    nextStageAsks
  );

  // Built from the model this view already read, never from the authored
  // parameters and never from a second walk of the topology.
  const topology = buildTopologyLayout(model, parameters.traffic.sourceNodeId);

  // Endpoint resolution has one home. The drawn wires and the written
  // connection list read from the same resolved links, so the picture and the
  // text cannot disagree about what is plugged into what.
  const resolvedLinks =
    topology.state === "available" ? topology.links : undefined;

  const links: PacketJourneyLinkView[] = model.links.map((link) => {
    const resolved = resolvedLinks?.find(
      (candidate) => candidate.linkId === link.linkId
    );

    return {
      linkId: link.linkId,
      label: link.label,
      ...(resolved === undefined
        ? {}
        : { endpointSummary: resolved.endpointSummary }),
      current: resolved?.current ?? false,
      traversed: resolved?.traversed ?? false
    };
  });

  const openPrediction = pendingPrediction(state, parameters);
  const pendingCommitment = resolvePendingCommitment(parameters, state);

  const latestStage = stages[stages.length - 1];

  // The link crossed to arrive where the traffic is now, in words. Read from
  // the already-resolved links so the sentence and the highlighted wire cannot
  // describe different connections.
  const currentStage =
    model.currentStageId === null
      ? undefined
      : model.stages.find((stage) => stage.stageId === model.currentStageId);

  /*
    THE CURRENT LEG, IN THE DIRECTION THE TRAFFIC ACTUALLY MOVED.

    Founder video UAT read "Printer Network interface to Switch-1 Port 3" at the
    end of Mission 1, when the print request had moved from Switch-1 to the
    Printer. `endpointSummary` is built from the link's stored from/to order,
    which is arbitrary and fixed — and the same physical link is traversed in
    both directions elsewhere in the course.

    So the leg is composed from the JOURNEY: the stage before this one is where
    the traffic came from, this stage is where it arrived. Storage order decides
    nothing.
  */
  const via = (() => {
    if (currentStage?.viaLinkId === undefined) return null;

    const link = resolvedLinks?.find(
      (candidate) => candidate.linkId === currentStage.viaLinkId
    );
    if (link === undefined) return null;

    const arrivedAt = currentStage.atNodeId;
    const currentIndex = model.stages.findIndex(
      (stage) => stage.stageId === currentStage.stageId
    );
    const cameFrom = model.stages[currentIndex - 1]?.atNodeId;

    const endpoints = [link.from, link.to];
    const source = endpoints.find((end) => end.nodeId === cameFrom);
    const destination = endpoints.find((end) => end.nodeId === arrivedAt);

    // Both ends identified from the journey: say it in travel order.
    if (source !== undefined && destination !== undefined) {
      return (
        `${source.nodeLabel} ${source.interfaceLabel} to ` +
        `${destination.nodeLabel} ${destination.interfaceLabel}`
      );
    }

    // A link whose ends the journey cannot place — the authored summary, which
    // at least names the two devices, rather than a direction that may be wrong.
    return link.endpointSummary;
  })();

  /*
    The same arrival, structured rather than pre-composed.

    `via` is written for the Quick Reference's "Current leg" row, where naming
    both ends and both ports is exactly right. A sentence needs different
    parts: who it came from, and the port it came in on. Both are read from the
    same authored link and the same journey order, so the two can never
    describe different events.
  */
  const arrival = (() => {
    if (currentStage?.viaLinkId === undefined) return null;

    const link = resolvedLinks?.find(
      (candidate) => candidate.linkId === currentStage.viaLinkId
    );
    if (link === undefined) return null;

    const currentIndex = model.stages.findIndex(
      (stage) => stage.stageId === currentStage.stageId
    );
    const cameFrom = model.stages[currentIndex - 1]?.atNodeId;

    const endpoints = [link.from, link.to];
    const source = endpoints.find((end) => end.nodeId === cameFrom);
    const destination = endpoints.find(
      (end) => end.nodeId === currentStage.atNodeId
    );

    if (source === undefined || destination === undefined) return null;

    return {
      fromNodeLabel: source.nodeLabel,
      atInterfaceLabel: destination.interfaceLabel
    };
  })();

  // The remediation's own observation belongs to the MOMENT it was applied, at
  // the stage it repaired. Once the learner advances past that stage, the new
  // observation is what happened next — not a stale account of the repair.
  const atRemediatedStage =
    appliedAction !== undefined &&
    parameters.fault !== undefined &&
    model.currentStageId === parameters.fault.stopsAtStageId;

  const currentEvent: PacketJourneyEventView = {
    kind: confirmed
      ? "confirmed"
      : stopped
        ? "stopped"
        : atRemediatedStage
          ? "repaired"
          : latestStage === undefined
            ? "waiting"
            : "moving",
    headline: describeEventHeadline(
      confirmed,
      stopped,
      atRemediatedStage,
      latestStage?.nodeLabel,
      pendingCommitment !== null,
      effectiveTraffic.label,
      via !== null,
      nodeLabels.get(effectiveTraffic.sourceNodeId),
      nodeLabels.get(effectiveTraffic.destinationNodeId)
    ),
    via,
    /*
      Every observable change moves this on: a reveal, a commitment, an
      ANSWER, a remediation. Nothing branches on it; it exists so a
      presentation can replay a transient emphasis when the picture changes —
      and so `PacketJourney` knows to put the learner back on the first beat
      of the new state.

      Answered checks were missing, and that was a rendered defect rather than
      a cosmetic one. Founder UAT answered Mission 2's source-learning check
      correctly and was shown the FLOODING explanation: answering splices a
      feedback beat in at the front of the beat list, every later beat shifts
      one place, and the pane's cursor only resets when this token moves. It
      did not, so the cursor stayed put and rendered whatever had shifted into
      the position the learner was already on — the "Why" beat carrying the
      stage's decision, which answers a different question entirely.

      A commitment was already counted here. An answer is the same kind of
      event and is counted the same way.
    */
    token: [
      state.progress.revealedStageCount,
      model.currentStageId ?? "none",
      state.progress.appliedActionId ?? "none",
      Object.keys(state.committedPredictions).length,
      Object.keys(state.answeredChecks).length
    ].join(":")
  };

  const advanceAvailable = canAdvance(state, parameters, sequencing);
  const repairAvailable = model.actions.some((action) => action.available);
  const remediationWithheld =
    stopped && (parameters.actions ?? []).length === 0;

  // Derived from values this function already resolved. No new state, no
  // second progression engine, and nothing read from a label.
  const taskKind = resolveCurrentTask(
    state.started,
    openPrediction !== null,
    repairAvailable,
    advanceAvailable,
    stages.length,
    remediationWithheld
  );

  return {
    sourceNotice: describeSourceNotice(model.sourceKind),
    orientation: {
      title: describeOrientationTitle(effectiveTraffic.label),
      summary: describeOrientationSummary(
        effectiveTraffic.label,
        nodeLabels.get(effectiveTraffic.sourceNodeId) ??
          effectiveTraffic.sourceNodeId
      )
    },
    currentTask: {
      kind: taskKind,
      label: describeTaskLabel(taskKind),
      actionable: isTaskActionable(taskKind)
    },
    startAction: state.started
      ? null
      : {
          label: describeStartLabel(),
          instruction: describeStartInstruction(parameters.traffic.label)
        },
    trafficSummary: describeTrafficSummary(effectiveTraffic, nodeLabels),
    startLabel: parameters.traffic.startActionLabel,
    nodes,
    links,
    topology,
    stages,
    totalStages: parameters.stages.length,
    deviceFacts,
    currentEvent,
    // Withheld until the learner begins. Before Start there is exactly one
    // thing to do, and a question sitting beside it would compete with the
    // control the Founder asked to be unmistakable.
    pendingPrediction: state.started ? openPrediction : null,
    pendingCommitment,
    canAdvance: advanceAvailable,
    advanceLabel: describeAdvanceLabel(state, parameters),
    // At the guided level the authored reason is available but is not pushed at
    // the learner: they open it when they want it, which is what a graduated
    // hint is. Elsewhere it reads inline, or is simply absent because the
    // server never sent it.
    decisionDisclosed: sequencing === "guide",
    /*
      Founder UAT, second round: "the Founder sees 'Show Me' and expects: show
      me the network and the information I need ... SHOW ME should NOT primarily
      mean: show me several paragraphs."

      Most of that was answered in the authored topology — port and interface
      names, addresses and network identity are now ON the drawing rather than
      behind a click. What was still missing at SHOW ME is that a learner had no
      way of knowing the devices were readable at all: the prompt appeared only
      at HELP ME, so the richest support level was the one that never mentioned
      the inspector.

      So SHOW ME now gets the prompt too. It is not extended to the levels below,
      because at ASK ME and beyond, working out what is worth inspecting is part
      of what the learner is being asked to do.
    */
    inspectionPrompt:
      (sequencing === "demonstrate" || sequencing === "guide") &&
      (openPrediction !== null || stages.length === 0)
        ? describeInspectionPrompt()
        : null,
    predictionRequired: sequencing === "commit_first",
    actions: model.actions.map((action) => ({
      actionId: action.actionId,
      label: action.label,
      available: action.available
    })),
    /*
      The most recently OBSERVED stage that carried a commitment. Only the
      latest one: the pane evolves rather than accumulating a transcript, and
      every earlier comparison is still in the history below.
    */
    /*
      Offered on the latest REVEALED stage that authors one, so it can only
      ever ask about something already on screen. It gates nothing: a learner
      may answer it or read on, which is what keeps a course from becoming
      read-answer-read-answer.
    */
    quickReference: (() => {
      const rows: { label: string; value: string }[] = [];

      const named = (nodeId: string): string =>
        nodeLabels.get(nodeId) ?? nodeId;

      // A device's address, only where the author flagged one for display —
      // which is the mission's own concept boundary, already enforced.
      const addressOf = (nodeId: string): string | null => {
        const node = parameters.nodes.find(
          (candidate) => candidate.nodeId === nodeId
        );

        for (const iface of node?.interfaces ?? []) {
          for (const attribute of iface.attributes) {
            if (attribute.prominent === true && attribute.label.includes("IPv4")) {
              return attribute.value;
            }
          }
        }
        return null;
      };

      const withAddress = (nodeId: string): string => {
        const address = addressOf(nodeId);
        return address === null ? named(nodeId) : `${named(nodeId)} — ${address}`;
      };

      // The two ends of what is moving RIGHT NOW. Founder UAT round 2 read
      // From PC-A / To PC-B while PC-B's reply was on the wire; these rows
      // sit directly above "Now at", which was already per-stage, so the
      // panel disagreed with itself.
      rows.push({ label: "From", value: withAddress(effectiveTraffic.sourceNodeId) });
      rows.push({ label: "To", value: withAddress(effectiveTraffic.destinationNodeId) });

      /*
        "Carrying", not "Sending", and the noun is the mission's own.

        Founder UAT read "Sending — a message" in Mission 6, two steps after
        the course had taught both frame and packet. The vagueness was
        authored: `traffic.label` said "a message". The word is fixed in the
        curriculum, where terminology boundaries are decided; this row just
        stops describing the journey as an act in progress when what the
        learner wants to know is what is being carried.
      */
      rows.push({ label: "Carrying", value: effectiveTraffic.label });

      const at = stages[stages.length - 1];
      if (at !== undefined) {
        rows.push({ label: "Now at", value: at.nodeLabel });
      }

      if (via !== null) {
        rows.push({ label: "Current leg", value: via });
      }

      return rows;
    })(),
    knowledgeCheck: (() => {
      /*
        Read from the AUTHORED stages, not from the observation model: a
        knowledge check is instruction, and the model is a record of what
        happened. Which stages are revealed comes from the model; what each one
        asks comes from the curriculum.

        A stage may author SEVERAL checks, in order. The one offered is the
        first UNANSWERED check on the latest revealed stage that has any — so
        Mission 8's three reasoning steps at the stop arrive one at a time,
        each resolving before the next is set, which is DEC-065. Once every
        check on a stage is answered, the most recent answer stays on screen so
        the learner can still read the explanation.
      */
      for (let index = revealed.length - 1; index >= 0; index -= 1) {
        const revealedStage = revealed[index];
        if (revealedStage === undefined) continue;

        const stage = parameters.stages.find(
          (candidate) => candidate.stageId === revealedStage.stageId
        );
        const authored = stage?.knowledgeChecks;
        if (stage === undefined || authored === undefined || authored.length === 0) {
          continue;
        }

        const open =
          authored.find(
            (check) => state.answeredChecks[check.checkId] === undefined
          ) ?? authored[authored.length - 1];

        if (open === undefined) continue;

        const chosen = state.answeredChecks[open.checkId];

        return {
          stageId: stage.stageId,
          checkId: open.checkId,
          prompt: open.prompt,
          options: open.options,
          /** How many of this stage's checks are answered, and of how many. */
          answeredCount: authored.filter(
            (check) => state.answeredChecks[check.checkId] !== undefined
          ).length,
          totalCount: authored.length,
          answer:
            chosen === undefined
              ? null
              : {
                  option: chosen,
                  // Deterministic, and the only place correctness is decided.
                  correct: chosen === open.correctOption,
                  correctOption: open.correctOption,
                  explanation: open.explanation
                }
        };
      }
      return null;
    })(),
    resolvedCheck: (() => {
      // The last check the learner answered on the stage they are looking at.
      // Read from the AUTHORED stage, in authored order, so "most recent" is
      // the sequence's order rather than the order answers happened to arrive.
      if (appliedAction !== undefined) return null;

      const latestStageId = revealed[revealed.length - 1]?.stageId;
      if (latestStageId === undefined) return null;

      const authored = parameters.stages.find(
        (candidate) => candidate.stageId === latestStageId
      )?.knowledgeChecks;

      if (authored === undefined) return null;

      for (let index = authored.length - 1; index >= 0; index -= 1) {
        const check = authored[index];
        if (check === undefined) continue;

        const chosen = state.answeredChecks[check.checkId];
        if (chosen === undefined) continue;

        return {
          checkId: check.checkId,
          option: chosen,
          // Deterministic, and the only place correctness is decided.
          correct: chosen === check.correctOption,
          correctOption: check.correctOption,
          explanation: check.explanation
        };
      }

      return null;
    })(),
    resolvedPrediction: (() => {
      /*
        THE STAGE JUST REVEALED, AND NO EARLIER ONE.

        This used to scan backwards for the most recent stage carrying a
        commitment, which meant a resolved prediction never expired. Founder
        UAT walked Mission 8 and found stage 1's whole explanation still
        sitting at the top of the stop screen, of the three reasoning
        questions after it, and of the screen after the repair — five
        transitions where the first thing the learner read was the answer to a
        question they had already finished.

        A resolution belongs to the moment it resolves. Once the learner
        advances, the network has moved on and so has the instruction; the
        comparison stays available in the history disclosure below.
      */
      const stage = stages[stages.length - 1];
      if (stage?.committedPrediction === undefined) return null;

      // Authored, and read from the curriculum rather than from the model:
      // correctness is a teaching fact, and the model records what happened.
      const prediction = parameters.stages.find(
        (candidate) => candidate.stageId === stage.stageId
      )?.prediction;
      const authored = prediction?.correctOption;

      return {
        option: stage.committedPrediction,
        observed: stage.narration,
        why: stage.decision ?? null,
        correct:
          authored === undefined ? null : stage.committedPrediction === authored,
        correctOption: authored ?? null,
        explanation: prediction?.explanation ?? null
      };
    })(),
    chosenAction:
      appliedAction === undefined
        ? null
        : {
            label: appliedAction.label,
            observation: appliedAction.observation
          },
    symptom: stopped ? (consequence?.symptom ?? null) : null,
    // Present only when the support level allowed it through. Its absence is a
    // withholding, and the presentation simply has nothing to show.
    explanation: stopped ? (parameters.fault?.explanation ?? null) : null,
    confirmation:
      confirmed && parameters.confirmation !== undefined
        ? parameters.confirmation.summary
        : null,
    // Said only when the journey has stopped and no remediation was sent, so
    // the learner is told why there is nothing to click rather than meeting a
    // dead end.
    remediationWithheld: remediationWithheld
      ? describeRemediationWithheld()
      : null,
    announcement: describeAnnouncement(
      model,
      stages,
      appliedAction,
      pendingCommitment,
      parameters.traffic.startActionLabel,
      atRemediatedStage,
      via,
      effectiveTraffic.label,
      arrival,
      nextStageAsks
    ),
    textTrace,
    finished: confirmed || (model.currentStageId !== null && !stopped &&
      state.progress.revealedStageCount >= parameters.stages.length)
  };
}

/**
 * The commitment the learner has made for a stage they have not yet revealed.
 *
 * Only the next stage can be in this position: committing is what releases the
 * reveal, so a commitment further ahead cannot exist. Reading exactly that one
 * slot keeps the rule visible rather than implied by a search.
 */
function resolvePendingCommitment(
  parameters: LearnerPacketJourneyParameters,
  state: PacketJourneyViewState
): PacketJourneyCommitmentView | null {
  const next = parameters.stages[state.progress.revealedStageCount];
  if (next === undefined) return null;

  const option = state.committedPredictions[next.stageId];
  if (option === undefined) return null;

  return { stageId: next.stageId, option };
}

/* ------------------------------------------------------------------ *
 * The text trace
 * ------------------------------------------------------------------ */

/**
 * The ordered plain-language account of everything observed so far.
 *
 * Required by CURR-011 section 14.3 and never withheld: it is narration and
 * observation history, which is accessibility rather than tutoring, so it
 * survives every support level. What it must NOT carry is the diagnosis — that
 * lives in a stage's `decision`, which the server drops at protected levels.
 *
 * It is also the reduced-motion presentation: a learner who sees no animation
 * reads exactly the same account, in the same order.
 */
function buildTextTrace(
  parameters: LearnerPacketJourneyParameters,
  state: PacketJourneyViewState,
  stages: readonly PacketJourneyStageView[],
  appliedAction: { readonly label: string; readonly observation: string } | undefined,
  /**
   * Whether the first unrevealed stage asks the learner to predict.
   *
   * Passed rather than re-derived: one derivation of "the next stage asks for
   * a prediction" means the trace and the status line cannot disagree about
   * it, which is the whole point of sharing the sentence below.
   */
  nextStageAsks: boolean
): string[] {
  const trace: string[] = [];
  const pending = resolvePendingCommitment(parameters, state);

  if (stages.length === 0) {
    // The SAME sentence the status line shows, from the same function. This
    // used to be its own string — "Nothing has been sent yet. Send the print
    // request to begin." — and Founder video UAT read it directly beneath a
    // status line asking for a prediction instead.
    trace.push(
      describeOpeningStatus(
        nextStageAsks,
        parameters.traffic.label,
        parameters.traffic.startActionLabel
      )
    );
    // A commitment made before anything was sent belongs in the account from
    // the moment it is made, not from the moment its stage appears. Leaving it
    // out is what made a committed prediction look like it had been discarded.
    if (pending !== null) {
      trace.push(`You predicted: ${pending.option}`);
      trace.push("That prediction has not been observed yet.");
    }
    return trace;
  }

  for (const stage of stages) {
    const committed = state.committedPredictions[stage.stageId];
    if (committed !== undefined) {
      trace.push(`You predicted: ${committed}`);
    }
    trace.push(`At ${stage.nodeLabel}: ${stage.narration}`);
    if (stage.decision !== undefined) {
      trace.push(`Why: ${stage.decision}`);
    }
  }

  if (pending !== null) {
    trace.push(`You predicted: ${pending.option}`);
    trace.push("That prediction has not been observed yet.");
  }

  if (appliedAction !== undefined) {
    trace.push(`You chose: ${appliedAction.label}`);
    trace.push(`Result: ${appliedAction.observation}`);
  }

  return trace;
}

/* ------------------------------------------------------------------ *
 * Learner-facing wording
 *
 * Kept out of JSX so every string is reachable from a test that runs without a
 * DOM — the same reason `mission-instruction-presentation.ts` holds the
 * instruction wording.
 * ------------------------------------------------------------------ */

/**
 * What the learner is looking at.
 *
 * DEC-058 requires teaching mode to be clearly identified on screen as
 * instructional simulation, and requires that it never claim a real
 * environment was configured. This is that statement, and it is derived from
 * the model's `sourceKind` rather than assumed.
 */
export function describeSourceNotice(sourceKind: string): string {
  if (sourceKind === "live_lab") {
    return "Live lab. This shows observations read from your lab environment.";
  }

  return (
    "Instructional simulation. This is a taught example, not a live " +
    "environment, and nothing here is recorded or counts towards a competency."
  );
}

/**
 * The device category, in the word a learner reads.
 *
 * `host` is deliberately "Host" and not "Workstation": Networking Foundations
 * teaches that a printer and a server are hosts too, so the general word has to
 * stay general. `printer` narrows it without contradicting it.
 */
export function describeNodeRole(role: string): string {
  if (role === "host") return "Host";
  if (role === "switch") return "Switch";
  if (role === "router") return "Router";
  if (role === "printer") return "Printer";
  return role;
}

/**
 * One sentence saying what a device of this CATEGORY is, for a beginner.
 *
 * ## Why this is derived and `about` is authored
 *
 * The two halves of "what is this and why is it here?" have different owners.
 * "A router connects one network to another" is a property of the category the
 * author already declared, in the same way that the word "Router" and the
 * symbol drawn on the card are — deriving it from `role` invents nothing.
 * "Router-1 sits at the edge of THIS network and this print request does not
 * use it" is a property of the scenario, and is authored.
 *
 * The line between them is the same one the whole observation model is built
 * on. This function may say what a category is. It may not say what a
 * particular device is doing, which mission explains it, or what would happen
 * if the topology were different.
 *
 * ## Deliberately short of the mechanism
 *
 * Each sentence names a purpose and stops. A learner who selects Router-1 in
 * Mission 1 can reasonably wonder why a router is on the screen at all, and
 * "it connects one network to another" answers that. How it decides where to
 * send anything is Mission 5's, and saying so here would turn device
 * inspection into a second, out-of-order curriculum.
 *
 * An unrecognised role returns nothing rather than a generic filler sentence.
 * The learner then reads the category word, the connections and the journey
 * status, none of which were invented.
 */
export function describeRolePurpose(role: string): string | undefined {
  if (role === "host") {
    return "A host is a machine that sends or receives information over a network, such as a desktop computer, a laptop or a server.";
  }
  if (role === "printer") {
    return "A printer is a host that produces documents. It receives print requests from other devices and prints them.";
  }
  if (role === "switch") {
    return "A switch connects the devices inside one local network so they can exchange information with each other.";
  }
  if (role === "router") {
    return "A router connects one network to another and moves traffic between them.";
  }
  return undefined;
}

/**
 * What this device's relationship to the CURRENT journey is, in one phrase.
 *
 * ## The defect this replaces
 *
 * Device inspection used to show the topology card's state caption, whose idle
 * wording said the journey had not got here YET. Founder UAT found that
 * ambiguous, and it was: on PC-B and Router-1 it read as "wait, and the print
 * request will arrive", when the authored truth is that the print request
 * never goes near either of them.
 *
 * ## The distinction, and where each half comes from
 *
 * "Not observed yet" and "not on this journey's path" are genuinely different
 * facts, and only one of them is knowable at any given moment:
 *
 * - While the journey is running, a device that has not appeared in a revealed
 *   stage is simply not something the learner has seen yet. Saying it is off
 *   the path would be a claim about stages that have not been revealed — and
 *   for a walkthrough whose next step is the subject of a prediction, it would
 *   also hand over the answer.
 * - Once the authored journey has COMPLETED, no further stage will ever be
 *   revealed, so a device that never appeared is a device the journey never
 *   used. That is a fact about the finished authored path, not a deduction
 *   about networking.
 *
 * So the off-path phrase is gated on `confirmed`, which is the authored
 * completion the model reports, and on nothing else.
 *
 * ## What is deliberately not consulted
 *
 * Unrevealed stages, though they are right there in the model carrying their
 * `atNodeId`. Reading them would answer "is this device on the path?" earlier
 * and more cheaply, and it would be exactly the spoiler the reveal sequence
 * exists to prevent.
 *
 * Links, roles, labels, group membership and positions are not consulted
 * either. Nothing here walks the topology, and there is no case in which the
 * answer depends on what a device is or what it is attached to.
 */
export type JourneyStatusKind =
  | "not-started"
  | "here-now"
  | "passed-through"
  | "participating"
  | "delivered"
  | "stopped"
  | "not-yet"
  | "off-path";

export interface JourneyStatusView {
  readonly kind: JourneyStatusKind;
  readonly label: string;
}

export function resolveNodeJourneyStatus({
  nodeId,
  revealedNodeIds,
  alsoInvolvedNodeIds = [],
  alsoParticipatingNodeIds = [],
  confirmed,
  stopped,
  trafficLabel
}: {
  nodeId: string;
  /** `atNodeId` of every REVEALED stage, in order. Never the unrevealed ones. */
  readonly revealedNodeIds: readonly string[];
  /**
   * Devices a revealed stage named in `alsoAtNodeIds` — authored participants
   * at a moment anchored somewhere else.
   *
   * Deliberately a SECOND list rather than more entries in the first. The
   * anchor list is ordered and its last element decides delivered, stopped and
   * here-now; a participant is not where the traffic is, and merging the two
   * would let a device the author merely named be described as holding it.
   */
  readonly alsoInvolvedNodeIds?: readonly string[];
  /** Those participating in the CURRENT stage, from its `alsoAtNodeIds`. */
  readonly alsoParticipatingNodeIds?: readonly string[];
  /** The authored journey ran to its authored end. */
  confirmed: boolean;
  /** The authored journey halted at an authored fault. */
  stopped: boolean;
  trafficLabel: string;
}): JourneyStatusView {
  if (revealedNodeIds.length === 0) {
    return {
      kind: "not-started",
      label: `${capitaliseFirst(trafficLabel)} has not been sent yet.`
    };
  }

  const observed =
    revealedNodeIds.includes(nodeId) || alsoInvolvedNodeIds.includes(nodeId);
  const atLast = revealedNodeIds[revealedNodeIds.length - 1] === nodeId;

  if (observed && atLast && confirmed) {
    return { kind: "delivered", label: "Delivered here." };
  }
  if (observed && atLast && stopped) {
    return { kind: "stopped", label: `${capitaliseFirst(trafficLabel)} stopped here.` };
  }
  if (observed && atLast) {
    return { kind: "here-now", label: `${capitaliseFirst(trafficLabel)} is here now.` };
  }
  /*
    A device the author named as participating in THIS observed moment, and
    which is not where the traffic is anchored.

    It gets its own word. It cannot be "delivered", "stopped" or "here now" —
    those belong to `atNodeId`, and the branches above key on `atLast`, which
    reads the anchor list only. It must not be "passed through" either: that
    is a claim about transit, and while the moment is still on screen the
    honest statement is simply that this device is part of it.

    "Reached here" was the first wording and the Founder rejected it, because
    reached reads as arrival at a destination — which is the one thing a
    simultaneous participant is not.
  */
  if (alsoParticipatingNodeIds.includes(nodeId)) {
    return { kind: "participating", label: "Participating in this step." };
  }

  if (observed) {
    return { kind: "passed-through", label: "Passed through here." };
  }

  // Complete: no further stage will be revealed, so absence is now a fact
  // about the finished path rather than a gap in what has been observed.
  if (confirmed) {
    return {
      kind: "off-path",
      label: `Not part of the path ${trafficLabel} took.`
    };
  }

  // Still running. This says only what has been observed, and predicts
  // nothing about the stages still to come.
  return { kind: "not-yet", label: "Not involved so far." };
}

export function describeStageOutcome(outcome: string): string {
  return outcome === "stops" ? "Stopped here" : "Continued";
}

/**
 * What is moving RIGHT NOW, and between which two devices.
 *
 * ## Why a journey-wide answer was not enough
 *
 * Founder UAT round 2 watched Mission 2's reply travel from PC-B back to PC-A
 * while every sentence around it went on naming the outbound delivery: the
 * quick reference still read From PC-A / To PC-B / Carrying one local-network
 * delivery, and the live region announced that the delivery had arrived. The
 * marker moved one way and the words described the other.
 *
 * A journey has ONE opening traffic block, and that is correct — it is what
 * the whole activity is for. But a stage may say that what is on the wire at
 * this moment is something else, and when an author says so, the surfaces that
 * describe THIS MOMENT have to say it too.
 *
 * ## What this refuses to do
 *
 * It reads two things: the stage's authored `traffic`, and the journey's own.
 * It does not infer direction from which way the marker points, does not parse
 * narration, and does not consult links, roles, device facts, topology or any
 * earlier stage. If an author did not say the traffic changed, it did not
 * change — which is why seven of the course's eight journeys get a value
 * byte-identical to the one they got before this existed.
 *
 * `startActionLabel` is deliberately absent from the result. It belongs to the
 * control that BEGINS the journey and would be meaningless part-way through
 * one, which is why `STAGE_TRAFFIC_KEYS` omits it from the authored shape too.
 */
export interface EffectiveTraffic {
  readonly label: string;
  readonly sourceNodeId: string;
  readonly destinationNodeId: string;
}

export function resolveEffectiveTraffic(
  journeyTraffic: {
    readonly label: string;
    readonly sourceNodeId: string;
    readonly destinationNodeId: string;
  },
  stage: { readonly traffic?: EffectiveTraffic } | undefined
): EffectiveTraffic {
  const override = stage?.traffic;

  if (override !== undefined) return override;

  return {
    label: journeyTraffic.label,
    sourceNodeId: journeyTraffic.sourceNodeId,
    destinationNodeId: journeyTraffic.destinationNodeId
  };
}

export function describeTrafficSummary(
  traffic: EffectiveTraffic,
  nodeLabels: ReadonlyMap<string, string>
): string {
  const from = nodeLabels.get(traffic.sourceNodeId) ?? traffic.sourceNodeId;
  const to =
    nodeLabels.get(traffic.destinationNodeId) ?? traffic.destinationNodeId;

  return `Following ${traffic.label} from ${from} to ${to}.`;
}

/**
 * The label on the control that reveals the next observation.
 *
 * The first one is the AUTHORED start label — "Send the ping from PC-A" — and
 * not the word "Start". The authored label was already carried in the view
 * model and was simply never used, while the control read "Start" instead;
 * after committing a prediction, a learner who had not moved anywhere was shown
 * a button that looked like it was offering to begin again. Saying what the
 * action actually does removes that reading entirely.
 */
export function describeAdvanceLabel(
  state: PacketJourneyViewState,
  parameters: LearnerPacketJourneyParameters
): string {
  /*
    Founder UAT: "the Founder reasonably interprets 'Show me' as a visual
    demonstration. If an action primarily advances text rather than visually
    showing network behavior, use clearer wording."

    This control does show network behaviour — it reveals the next authored
    stage, which moves the traffic onto a different connection and changes the
    picture. What the old wording did not say was WHERE to look, so a learner
    could press it expecting a demonstration and read a paragraph instead.
    Naming the network is the whole fix.
  */
  /*
    Founder UAT, blocking: the control said "Send to 192.168.2.20" and the beat
    that followed said the message had not left PC-A. It had not — the first
    authored stage is a DECISION, and nothing traverses a link there. A control
    that names an action the journey does not take teaches a learner not to
    trust the buttons.

    So the label is read from the stage the press will reveal. A stage that
    names `viaLinkId` moves something across a connection, and only then may
    the control say so; a stage that names none is reasoning, and the control
    says that instead. Both come from authored data.
  */
  const next = parameters.stages[state.progress.revealedStageCount];

  if (next === undefined) return "Show the next step on the network";

  const moves = next.viaLinkId !== undefined;

  if (state.progress.revealedStageCount === 0) {
    // The authored start label is an ACTION label. It is honest only when the
    // first stage actually moves something.
    return moves
      ? parameters.traffic.startActionLabel
      : `See what ${nodeLabelFor(parameters, next.atNodeId)} does first`;
  }

  return moves
    ? `Send it to ${nodeLabelFor(parameters, next.atNodeId)}`
    : `See what ${nodeLabelFor(parameters, next.atNodeId)} does next`;
}

/** A device's authored label, or its id when the author named no device. */
function nodeLabelFor(
  parameters: LearnerPacketJourneyParameters,
  nodeId: string
): string {
  return (
    parameters.nodes.find((node) => node.nodeId === nodeId)?.label ?? nodeId
  );
}

/** The two halves of the prediction comparison, named in words. */
export function describePredictionLabel(): string {
  return "Your prediction";
}

export function describeObservationLabel(): string {
  return "What actually happened";
}

/**
 * What a committed prediction says while its stage is still unrevealed.
 *
 * It is deliberately not a verdict. The learner is told their answer is
 * recorded and that the network has not been observed yet — the observation is
 * the reveal, and it is what teaches.
 */
export function describeUnobservedCommitment(): string {
  return "Recorded. Nothing has been observed yet.";
}

/**
 * The guided level's nudge.
 *
 * Generic on purpose. It points at the act of inspecting, and carries no
 * networking guidance of its own: authored teaching lives in authored fields,
 * and a hint invented here would be curriculum written by the renderer.
 */
export function describeInspectionPrompt(): string {
  return (
    "Before you continue, select a device to inspect what it is connected to " +
    "and what its interfaces say."
  );
}

/**
 * Names the workspace control, in both directions.
 *
 * ## Why these are not "open" and "close"
 *
 * Founder video UAT read "Open the network workspace" while the network
 * workspace was already on screen, and it was right to notice. Nothing is
 * hidden behind this control: the topology, the orientation, the event and the
 * inspector are all mounted and visible inline, and pressing it re-lays out
 * that same tree as a full-viewport overlay. "Open" promises to reveal
 * something that is already revealed.
 *
 * Expand and collapse describe what actually happens — the same workspace, at
 * two sizes. A control must describe the action that will occur.
 */
export function describeWorkspaceExpandLabel(): string {
  return "Expand network workspace";
}

export function describeWorkspaceCollapseLabel(): string {
  return "Collapse network workspace";
}

/**
 * Names the control that says the learner has finished a required activity.
 *
 * ## Why this is not the journey's own end
 *
 * The journey reaching its authored end is the interaction's state. Whether
 * the learner has READ that end is a different fact, and it is the one the
 * steps after a required activity wait on.
 *
 * Founder video UAT recorded exactly that difference next door, on the
 * near-transfer check: releasing the next step on the last commit put new
 * instruction underneath feedback nobody had read yet. The same gap exists
 * here, so the same explicit act closes it.
 *
 * "Activity" and not "journey", because what is being finished is the piece of
 * instruction, not the traffic's trip.
 */
export function describeFinishActivityLabel(): string {
  return "Finish activity";
}

/**
 * What is announced after the latest change.
 *
 * This is the text an `aria-live` region carries, and it is why a consequence
 * is never conveyed by colour or motion alone (CURR-011 section 14.7): whatever
 * the animation shows, this says in words.
 */
/**
 * The current-event headline: where the traffic is, and what state it is in.
 *
 * Kept short. It sits directly above the live region, which carries the
 * authored narration, so this is the glanceable half and that is the detail.
 * Every state it names is also carried by a class on the device and by the
 * announcement below it, so nothing here is the sole carrier of a fact.
 */
export function describeEventHeadline(
  confirmed: boolean,
  stopped: boolean,
  atRemediatedStage: boolean,
  nodeLabel: string | undefined,
  hasPendingCommitment: boolean,
  /**
   * What is moving, in the AUTHORED words — "the print request", not "the
   * traffic".
   *
   * Founder UAT rejected placeholder nouns in learner-facing instruction. "The
   * traffic is at Switch-1" told a beginner nothing about what had arrived; the
   * course already names the thing, so the headline names it too.
   */
  trafficLabel: string,
  /**
   * Whether the traffic CROSSED a connection to be here.
   *
   * Founder UAT: "The file PC-A is sending reached PC-A" and "What PC-A is
   * sending to PC-C reached PC-A" were both rejected, correctly. At the stage
   * where traffic ORIGINATES nothing has travelled anywhere, so "reached" is
   * not a simplification — it is false, and it teaches a beginner that a
   * sender is also a recipient of its own traffic.
   *
   * The distinction is STARTED AT versus ARRIVED AT, and the model already
   * carries it: a stage names `viaLinkId` only when a connection was crossed
   * to get there. This reads that fact rather than guessing from position.
   */
  traversed: boolean,
  /**
   * Who is sending, and to whom, in the authored device names.
   *
   * Founder UAT: at an origin the learner must immediately know WHO wants to
   * send WHAT to WHOM, without reconstructing it. "The message starts at PC-A"
   * was true but told them a third of that, so the sentence is built from the
   * authored traffic instead: its source, its subject and its destination.
   */
  sourceLabel: string | undefined,
  destinationLabel: string | undefined
): string {
  if (nodeLabel === undefined) {
    return hasPendingCommitment
      ? "Prediction recorded. Nothing has been sent yet."
      : "Nothing has been sent yet.";
  }

  const subject = capitaliseFirst(trafficLabel);

  // Success is stated in WORDS, not only by the green treatment the drawing
  // uses. A learner who cannot see colour reads the same fact.
  if (confirmed) return `${subject} was delivered to ${nodeLabel}.`;
  if (stopped) return `${subject} stopped at ${nodeLabel}.`;
  if (atRemediatedStage) {
    return `${subject} can continue from ${nodeLabel}.`;
  }

  // Nothing was crossed to get here, so nothing "reached" anything.
  if (!traversed) {
    // The journey's own origin: name the whole intention in one sentence.
    if (
      sourceLabel !== undefined &&
      destinationLabel !== undefined &&
      nodeLabel === sourceLabel
    ) {
      return `${sourceLabel} wants to send ${trafficLabel} to ${destinationLabel}. It has not left ${sourceLabel} yet.`;
    }

    // A later stage that also crossed nothing — a reply being composed, for
    // instance. Saying it is "at" the device is accurate; claiming the
    // journey's source and destination here would describe the wrong trip.
    return `${subject} is at ${nodeLabel}.`;
  }

  return `${subject} reached ${nodeLabel}.`;
}

/**
 * The authored traffic label at the start of a sentence.
 *
 * Authors write "the print request", which is right in the middle of a
 * sentence and wrong at the beginning of one. Capitalising here keeps the
 * authored words authored and the sentences readable, without asking an author
 * to write the same noun twice in two cases.
 */
function capitaliseFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

/**
 * What the learner is told before anything has been revealed.
 *
 * ## Why this is a function and not two strings
 *
 * Founder video UAT found the same moment described two different ways on one
 * screen. The status line said "Before anything moves, predict which device
 * receives the print request first." — correct — while the "Full text account"
 * disclosure directly beneath it still said "Nothing has been sent yet. Send
 * the print request to begin.", which told the learner to do the one thing
 * they were not being asked to do yet.
 *
 * Neither surface was wrong about its own state. They were two independent
 * sentences about one state, which is how they came to disagree. There is one
 * sentence now, and both surfaces read it, so drifting apart is not something
 * a future edit can do by accident.
 *
 * ## Why the wording branches
 *
 * A journey whose first stage asks a prediction opens on that prediction, and
 * sending is not the next action. A journey whose first stage asks nothing
 * opens on the send, and there the authored start label IS the next action.
 * Both are read from authored data; neither is written for a mission.
 */
export function describeOpeningStatus(
  /** Whether the first unrevealed stage asks the learner to predict. */
  predicts: boolean,
  /** The authored name for what is moving. */
  trafficLabel: string,
  /** The authored label on the control that starts the journey. */
  startActionLabel: string
): string {
  return predicts
    ? `Before anything moves, predict which device receives ${trafficLabel} first.`
    : `Ready to start. ${startActionLabel} when you are ready.`;
}

/** Where the traffic came from, and the port it came in on. Authored facts. */
export interface PacketJourneyArrival {
  readonly fromNodeLabel: string;
  readonly atInterfaceLabel: string;
}

export function describeAnnouncement(
  model: ObservationModel,
  stages: readonly PacketJourneyStageView[],
  appliedAction: { readonly observation: string } | undefined,
  pendingCommitment: PacketJourneyCommitmentView | null,
  startActionLabel: string,
  atRemediatedStage: boolean,
  via: string | null,
  /** The authored name for what is moving, for the movement sentences. */
  trafficLabel: string = "",
  /** Resolved arrival, when this stage was reached across a connection. */
  arrival: PacketJourneyArrival | null = null,
  /** Whether the first unrevealed stage asks the learner to predict. */
  predicts: boolean = false
): string {
  if (model.availability === "unavailable") {
    return "The state of this environment is unavailable.";
  }

  // Committing used to change this string not at all, so a screen-reader
  // learner was told nothing had happened at exactly the moment a sighted
  // learner thought the interaction had reset. A commitment is an event, and
  // an event that changes nothing announced is an event that did not occur as
  // far as assistive technology is concerned.
  if (pendingCommitment !== null) {
    return stages.length === 0
      ? `Prediction recorded: ${pendingCommitment.option}. Nothing has been sent yet. ${startActionLabel} to see what actually happens.`
      : `Prediction recorded: ${pendingCommitment.option}. Ask to see what happens next.`;
  }

  if (stages.length === 0) {
    return describeOpeningStatus(predicts, trafficLabel, startActionLabel);
  }

  const consequence = model.consequence;

  /*
    THE OTHER CONNECTIONS THAT WERE BUSY AT THIS MOMENT.

    Mission 2's switch sends a copy out of every other connection at once. The
    drawn wires show that, and the drawn wires are aria-hidden — so without
    this clause a screen-reader learner is told about one connection while the
    picture shows three, which is the whole of what that stage teaches.

    Read from the stage's authored `alsoOnLinkIds` and from nothing else. The
    engine never works out which connections a switch would use: that is the
    forwarding calculation DEC-058 keeps out of the renderer.

    The links are named by their OWN AUTHORED LABELS, in authored order.
    Composing a far end from `nodeLabel` + `interfaceLabel` was the first
    attempt and the Founder ruled it out: it reads as a list of destinations,
    and it is a description this module assembled rather than one an author
    wrote. Naming the connection says which wires were busy and nothing else —
    never why, which is the stage's `decision` and is withheld at protected
    support levels.
  */
  const announcedStage =
    model.currentStageId === null
      ? undefined
      : model.stages.find((stage) => stage.stageId === model.currentStageId);

  const departures = (announcedStage?.alsoOnLinkIds ?? []).flatMap((linkId) => {
    const link = model.links.find((candidate) => candidate.linkId === linkId);
    return link === undefined ? [] : [link.label];
  });

  /*
    APPENDED, never woven in.

    Seven missions author no simultaneous links, and none of them may have its
    live region reworded by a repair it did not ask for. An empty list returns
    the sentence untouched, so nothing that authors none changes by one
    character.
  */
  const withDepartures = (sentence: string): string =>
    departures.length === 0
      ? sentence
      : `${sentence} At the same time: ${departures.join("; ")}.`;

  if (consequence?.state === "confirmed") {
    /*
      DELIVERY, in the live region's own register.

      This used to return the authored confirmation verbatim. That paragraph is
      the card's — it is the mission's closing teaching — and the region
      announced it a second time directly above it. The region says the same
      three things it says everywhere else: where, what moved, and what
      changed.

      The authored confirmation is unchanged and still shown on the card.
    */
    const delivered = stages[stages.length - 1];

    return withDepartures(
      delivered === undefined
        ? consequence.narration
        : `At ${delivered.nodeLabel}. ${capitaliseFirst(trafficLabel)} was delivered.`
    );
  }

  if (consequence?.state === "stopped") {
    // The connection is named here too, and especially here: where the traffic
    // came from is part of understanding where it stopped.
    const across = via === null ? "" : `, across ${via}`;
    const stage = stages[stages.length - 1];

    return withDepartures(
      `Stopped at ${stage?.nodeLabel}${across}. ${describeChange(stage)}`.trim()
    );
  }

  // The repair's own observation belongs to the moment it was applied. Once the
  // learner moves on, announcing it again would report the fix as though it had
  // just happened while the traffic was somewhere else entirely.
  if (appliedAction !== undefined && atRemediatedStage) {
    return withDepartures(appliedAction.observation);
  }

  const latest = stages[stages.length - 1];

  // Naming the link crossed is what keeps the correlation in TEXT. The wire
  // that lights up is decorative and hidden from assistive technology, so if
  // this sentence did not say which connection was used, that fact would exist
  // only in the picture.
  /*
    Founder video UAT read "At Switch-1, across PC-A Network interface to
    Switch-1 Port 1..." and found it hard to parse. The link is still named —
    the drawn wire is aria-hidden, so this is the only text that carries it —
    but it is a sentence of its own rather than a clause wedged between the
    location and the action.
  */
  const location = `At ${latest?.nodeLabel}.`;

  /*
    ARRIVAL, as one sentence about movement.

    Founder video UAT read "At Switch-1. Carrying the print request. Arrived
    across PC-A Network interface to Switch-1 Port 1." and could not parse it:
    three clauses, two of which name the same event, and a link description
    written for a reference row rather than for a sentence.

    The live region owns LOCATION, CONCISE MOVEMENT and CHANGED STATE. The
    stage card owns the teaching. So the arrival is stated once, in travel
    order, from authored facts the journey already carries — where it came
    from, and the port it came in on.
  */
  if (arrival !== null) {
    return withDepartures(
      `${location} ${capitaliseFirst(trafficLabel)} arrived from ${arrival.fromNodeLabel} on ${lowercaseFirst(arrival.atInterfaceLabel)}.`
    );
  }

  const action = describeChange(latest);
  const crossing = via === null ? "" : ` Arrived across ${via}.`;

  return withDepartures(`${location} ${action}${crossing}`.trim());
}

/**
 * An authored label used mid-sentence.
 *
 * The mirror of `capitaliseFirst`, and it exists for the same reason: authors
 * write "Port 1" because that is what the card and the reference row show, and
 * "arrived from PC-A on Port 1" reads as a proper noun in the middle of a
 * sentence. The authored words stay authored; only the case of the first
 * letter moves.
 */
function lowercaseFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toLowerCase() + value.slice(1);
}

/**
 * What just changed, in one clause — never the teaching about it.
 *
 * ## Why this exists
 *
 * The live region used to end with the stage's full `narration`, and the
 * observation beat shows that same paragraph. Because the pane renders the
 * announcement directly above the beat card, a learner on the observation beat
 * read the whole /24 explanation, then read it again immediately underneath —
 * the same explanation, twice, on one screen. Founder UAT reported exactly that
 * on Mission 8's PC-A screen.
 *
 * ## The ownership rule
 *
 * The BEAT CARD owns the detailed teaching for the current moment. The live
 * region owns the fact that the moment CHANGED, and where. Those are different
 * jobs, and only the second one needs a region that speaks on its own.
 *
 * The authored `action` is exactly the right size for it: the author's own
 * phrase for what this device is doing, which is what the beat's heading is
 * built from too. So the announcement stays complementary — it adds the link
 * crossed, which appears in no other text — without restating the paragraph
 * the card is about to show.
 *
 * A learner using assistive technology loses nothing. Focus moves to the beat
 * heading, and the narration is the very next thing in the document after it.
 */
function describeChange(stage: PacketJourneyStageView | undefined): string {
  if (stage === undefined) return "";

  // A journey authored before `action` existed still announces something, and
  // the outcome is the only thing available that says what just happened.
  return stage.action === undefined
    ? `${stage.outcomeLabel}.`
    : `${capitaliseFirst(stage.action)}.`;
}

/**
 * What a learner is told when the journey stops and no remediation was sent.
 *
 * At CHALLENGE ME the authored fixes are answer-bearing — each names whether
 * it works and what it produces — so they are withheld server-side and the
 * step genuinely is not available here. The wording says the observation
 * stands and points at diagnosis, without implying a broken feature and
 * without hinting at the answer it is withholding.
 */
export function describeRemediationWithheld(): string {
  return (
    "Guided fixes are not offered at this level. Work out from what you can " +
    "observe why the journey stopped here."
  );
}

/**
 * What a learner is told when the interaction is withheld.
 *
 * PROVE IT withholds instructional assistance, and an authored teaching
 * simulation that walks the learner to the answer is assistance by definition
 * (CURR-011 section 11). The wording says that plainly rather than presenting
 * a broken or empty component, and it does not imply the learner lost
 * anything they need to demonstrate the competency.
 */
export function describeWithheldInteraction(): string {
  return (
    "The guided walkthrough and its network workspace are withheld during a " +
    "protected demonstration. That is deliberate, not a fault: the teaching " +
    "visualisation would show you the answer. Your objective, your " +
    "environment and your own tools are unchanged."
  );
}

/**
 * What a learner is told when an interaction type has no renderer.
 *
 * CURR-011 section 16: a renderer missing for a valid registered type renders
 * nothing and reports the defect. It never falls back to raw payload output,
 * which would put an authored data structure in front of a learner.
 */
export function describeUnsupportedInteraction(): string {
  return "This interactive element could not be displayed.";
}


/* ------------------------------------------------------------------ *
 * ONE BEAT AT A TIME (DEC-065)
 *
 * Founder UX ruling: the five stacked regions were an improvement on the
 * original stream and still put the question, the answer, the observation, the
 * reason and the next control on screen together. The learner was reading a
 * dashboard of lesson state instead of following a lesson.
 *
 * So the workspace splits. The topology stays on the left, persistent, because
 * it is the thing the learner is reasoning about and remounting it would cost
 * them their mental map. The right side shows exactly ONE instructional beat.
 *
 * ## Why this is a pure function over the view
 *
 * The same reason everything else here is: it can be asserted without a
 * browser, and it cannot drift from the journey. A beat is DERIVED from the
 * state the journey already has — nothing is stored twice, and there is no
 * second progression engine to disagree with `canAdvance`.
 *
 * The component holds one number: how many times the learner has pressed
 * Continue at this journey state. `currentEvent.token` already moves on every
 * observable change, so it is what resets that number.
 *
 * ## Room for a terminal
 *
 * `kind` is an open vocabulary of instructional moments, not a question type.
 * A future WP-K terminal is another kind — `situation`, `task`, `terminal`,
 * `output` — and slots in beside these without the shell changing shape. That
 * is deliberate; nothing here is hard-coded to multiple choice.
 * ------------------------------------------------------------------ */

export const JOURNEY_BEAT_KINDS = [
  "start",
  "question",
  "pending",
  "feedback",
  "observe",
  "explain",
  "symptom",
  "action",
  "done"
] as const;

export type JourneyBeatKind = (typeof JOURNEY_BEAT_KINDS)[number];

export interface JourneyBeat {
  readonly kind: JourneyBeatKind;
  /**
   * The device this beat is about, when it is about one.
   *
   * Founder ruling, Mission 8 refinement: when the instructional focus moves to
   * a device, the learner should be oriented immediately rather than having to
   * infer the location from body prose. The pane renders this above the
   * heading, in the existing hierarchy — it is not a new visual language, it
   * is the device name given the prominence it was already earning.
   */
  readonly device: string | null;
  /**
   * Which network stage this beat is, out of how many the journey authors.
   *
   * Null on every beat that is not a network stage. Founder video UAT found
   * "Step 1 of 3" restarting whenever a presentation sub-beat appeared, so the
   * number described the pane rather than the journey. Feedback, questions,
   * explanations and confirmations are not stages and carry none.
   */
  readonly journeyStep: { readonly current: number; readonly total: number } | null;
  /** The heading the pane shows, and the element focus moves to. */
  readonly heading: string;
  /** The beat's own words. Short by construction — one idea per beat. */
  readonly body: readonly string[];
  /**
   * Optional depth, behind a disclosure. Never required to follow the lesson:
   * a learner who ignores every one of these still has the whole thread.
   */
  readonly more: string | null;
  /**
   * Whether this beat owns the journey's control — Start, Submit, Show, a
   * repair choice. `false` means the only way on is Continue.
   */
  readonly actionable: boolean;
}

/**
 * Every beat available at the journey's CURRENT state, in the order a learner
 * meets them.
 *
 * The list is recomputed whenever the journey changes, so it never describes a
 * state the journey has left.
 */
export function resolveJourneyBeats(
  view: PacketJourneyView
): readonly JourneyBeat[] {
  const beats: JourneyBeat[] = [];

  /*
    THE START CEREMONY IS GONE.

    Founder video UAT: the workspace opened on a card whose button moved no
    traffic — it only revealed the prediction the learner had already been told
    to make. `INITIAL_PACKET_JOURNEY_VIEW_STATE` now begins engaged, so the
    first thing a learner meets is the first real decision.
  */
  if (view.confirmation !== null) {
    beats.push({
      kind: "done",
      device: null,
      journeyStep: null,
      heading: "Where that leaves you",
      body: [view.confirmation],
      more: null,
      actionable: false
    });
    return beats;
  }

  /*
    What just happened, once.

    Founder UAT found the same fact in four places — the headline, the
    narration, the device facts and the fault symptom — so the beat now carries
    the authored NARRATION and nothing that restates it. The headline is the
    glance version and is already the announcement; repeating it here is how
    "the packet stopped at PC-A" came to be said three times.

    The heading answers WHERE AM I and WHAT IS THIS DEVICE DOING, from the
    authored action. "At PC-A" said only the first half.
  */
  const latest = view.stages[view.stages.length - 1];

  /*
    NOTHING HAS BEEN SENT YET is not a beat.

    Founder ruling, Mission 8 refinement: pressing Start used to produce a card
    that said nothing had happened, with a Continue button under it, before the
    learner could do anything at all. Two clicks, no cognition.

    So this beat exists only once there is something to observe. When the
    journey has begun and no stage is revealed, the beats below carry the whole
    screen — the prediction the first stage asks for, or the control that
    reveals it. Starting now lands the learner in the first real decision.
  */
  if (latest !== undefined) {
    beats.push({
      kind: "observe",
      device: latest.nodeLabel,
      journeyStep: {
        current: view.stages.length,
        total: view.totalStages
      },
      heading:
        latest.action === undefined
          ? latest.nodeLabel
          : `${latest.nodeLabel} — ${latest.action}`,
      body: [latest.narration],
      more: null,
      actionable: false
    });
  }

  /*
    A resolved answer, before anything new is asked.

    The heading is the verdict when the mission authored one — "Correct
    prediction" or "Not quite", calm and unmistakable, so the learner gets the
    cognitive confirmation without having to compare their answer against the
    narration themselves. Nothing is counted, nothing accumulates, no praise is
    offered, and the verdict is carried in WORDS — so nothing about it depends
    on seeing a colour.

    Where no correct option was authored the prediction was exploratory, the
    observation is the answer, and the heading stays neutral.
  */
  if (view.resolvedPrediction !== null) {
    const resolved = view.resolvedPrediction;

    beats.splice(0, 0, {
      kind: "feedback",
      device: null,
      journeyStep: null,
      heading:
        resolved.correct === null
          ? "Your prediction"
          : resolved.correct
            ? "Correct prediction"
            : "Not quite",
      /*
        ONE OWNER FOR EACH PIECE OF TEACHING.

        This beat used to repeat two paragraphs it does not own. "What actually
        happened" was the stage's narration, which the OBSERVE beat shows on the
        very next screen; `more` was the stage's decision, which the EXPLAIN
        beat shows on the screen after that. Because the pane presents one beat
        at a time, a learner answering Mission 8's first prediction read the
        same long paragraph on two consecutive screens and the same reason on
        two more.

        So this beat now resolves the ANSWER and nothing else: what the learner
        chose, and — when they were wrong — what the expected answer was, which
        is the concise statement of the correct reasoning. What actually
        happened, and why, are the next two screens, and both are new when the
        learner reaches them.
      */
      body: [
        `You predicted: ${resolved.option}`,
        ...(resolved.correct === false && resolved.correctOption !== null
          ? [`The expected answer: ${resolved.correctOption}`]
          : []),
        /*
          The authored reason, where the mission graded the prediction. A
          verdict on its own tells a learner they were wrong and leaves them no
          better off, so the beat that resolves the answer also says why.

          It is a field of its own, authored beside the question rather than
          taken from the stage. The stage's narration says what the network
          did; this says why the answer was what it was, and neither has to
          carry the other's job.
        */
        ...(resolved.explanation !== null ? [resolved.explanation] : [])
      ],
      more: null,
      actionable: false
    });
  }

  /*
    The check the learner just ANSWERED, which is not always the one being
    asked. A stage may author a sequence, and while the learner works through
    it those are two different checks — so this reads `resolvedCheck` rather
    than looking for an answer on the open question.

    Founder UAT: answering the first two of Mission 8's three reasoning steps
    produced no feedback at all. The pane went straight to the next prompt, so
    each transition read as the same two screens and then another question.

    The explanation stays here, unlike the prediction's. A check's explanation
    is authored FOR the check and appears nowhere else, so carrying it is not
    repetition — it is the only place the reasoning is stated.
  */
  if (view.resolvedCheck !== null) {
    const answer = view.resolvedCheck;

    beats.splice(0, 0, {
      kind: "feedback",
      device: null,
      journeyStep: null,
      heading: answer.correct ? "Correct" : "Not correct",
      body: [
        `Your answer: ${answer.option}`,
        ...(answer.correct
          ? []
          : [`Correct answer: ${answer.correctOption}`]),
        answer.explanation
      ],
      more: null,
      actionable: false
    });
  }

  // The authored reason, its own beat rather than a paragraph under the event.
  const reason = view.stages[view.stages.length - 1]?.decision;
  if (reason !== undefined) {
    beats.push({
      kind: "explain",
      device: null,
      journeyStep: null,
      heading: "Why",
      body: [reason],
      more: null,
      actionable: false
    });
  }

  if (view.symptom !== null) {
    /*
      The symptom is dropped when the stage narration already says it.
      Founder UAT: "nothing leaves PC-A" appeared in the narration, again in
      the fault symptom, and again in the headline. Saying it once and moving
      to WHY is the repair.
    */
    const alreadySaid =
      latest !== undefined &&
      view.symptom.trim().toLowerCase() === latest.narration.trim().toLowerCase();

    /*
      WHERE A STAGE ASKS THE LEARNER TO REASON, THE QUESTIONS OWN THE REASONING.

      `view.explanation` is the authored diagnosis. On a stage that authors no
      checks it is exactly what optional depth is for, and it stays.

      On a stage that DOES author checks it is withheld entirely, in both
      directions. Before they are answered it would pre-empt the question the
      interface is about to ask. After they are answered it is the same
      explanation the learner has just read in the feedback — Founder UAT found
      Mission 8's third check explaining the unreachable gateway, then the
      symptom beat two screens later explaining the unreachable gateway again,
      in different words and to no additional effect.

      This withholds nothing the learner cannot reach. A check's explanation is
      shown however they answer, and the concept step after the journey states
      the diagnosis in full.
    */
    const stageAsksTheLearner =
      view.knowledgeCheck !== null || view.resolvedCheck !== null;

    beats.push({
      kind: "symptom",
      device: null,
      journeyStep: null,
      heading: "What this means",
      body: alreadySaid ? [] : [view.symptom],
      more: stageAsksTheLearner ? null : view.explanation,
      actionable: false
    });
  }

  /*
    ONE OWNER FOR ACTIONABLE QUESTION TEXT.

    Founder UAT read a Mission 6 prompt, then read the same sentence again
    immediately below it, then answered. Both were real: the beat printed
    `prompt` in its body, and the fieldset printed it again as the `<legend>`
    the options are grouped under.

    The legend wins, and the body is empty. It is the accessible group label
    for the radios — removing it would leave the choices unnamed for a screen
    reader — and it is what sits immediately before the options, which is the
    Founder's rule: the question is read ONCE, right before the answers.

    So a question beat carries a heading, a control, and no prose. Anything
    that genuinely adds context belongs in the beat BEFORE this one, where it
    can say something the question does not.
  */
  if (view.knowledgeCheck !== null && view.knowledgeCheck.answer === null) {
    beats.push({
      kind: "question",
      device: null,
      journeyStep: null,
      heading: "Check your understanding",
      body: [],
      more: null,
      actionable: true
    });
  }

  if (view.pendingPrediction !== null) {
    beats.push({
      kind: "question",
      device: null,
      journeyStep: null,
      heading: "What do you think happens next?",
      body: [],
      more: null,
      actionable: true
    });
  }

  /*
    THE REPAIR COMES LAST, AFTER THE REASONING.

    Founder ruling, Mission 8 refinement: a learner must interpret the evidence
    before the interface offers them the fix. The repair beat used to sit ahead
    of the questions, so the choices were on screen before the learner had been
    asked what the stopping point ruled out or what to inspect next — which
    turns troubleshooting into recognising the right-looking option.

    Ordering is all that changed. Which actions are OFFERED is still the
    observation model's decision, and it still requires the learner to have
    reached the authored stop.
  */
  if (view.actions.some((action) => action.available)) {
    beats.push({
      kind: "action",
      device: null,
      journeyStep: null,
      heading: "What will you change?",
      body: [],
      more: null,
      actionable: true
    });
  }

  /*
    THE "PREDICTION RECORDED" BEAT IS GONE.

    Founder video UAT: submitting a prediction produced a screen saying the
    answer had been recorded and that nothing had been sent yet, with another
    button under it. Acknowledging a submission is not an instructional beat —
    the learner knows they submitted, because they submitted.

    Submitting now resolves the answer and the journey continues from there.
  */
  /*
    NOTHING REVEALED, AND NOTHING ASKED: the orientation carries the screen.

    A journey whose first stage asks a prediction opens on that prediction, and
    this never fires — Mission 1 is that case. A journey whose first stage asks
    nothing would otherwise open on an empty pane, so the orientation the
    workspace already authors becomes the beat, and it carries the control that
    MOVES the network rather than a control that reveals a question.

    That is not the Start ceremony returning. The ceremony's defect was a button
    that changed nothing; this beat carries real context and its control is the
    authored send.
  */
  if (beats.length === 0 && view.canAdvance) {
    beats.push({
      kind: "start",
      device: null,
      journeyStep: null,
      heading: view.orientation.title,
      body: [view.orientation.summary],
      more: null,
      actionable: true
    });
  }

  /*
    THE EMPTY "NEXT" BEAT IS GONE.

    Founder video UAT: an almost-empty card appeared between Switch-1 and the
    Printer whose only content was a button telling the learner to press a
    button. The Mechanical Interaction Law forbids it.

    The pane owns the progression control, so the last beat of a state carries
    it. No card exists merely to hold it.
  */
  return beats;
}

/**
 * Which beat the learner is on.
 *
 * Clamped rather than trusted: the beat list is recomputed on every change, so
 * an index kept from a previous state must never address past the end.
 */
export function activeJourneyBeat(
  beats: readonly JourneyBeat[],
  index: number
): JourneyBeat | null {
  if (beats.length === 0) return null;
  return beats[Math.min(Math.max(index, 0), beats.length - 1)] ?? null;
}
