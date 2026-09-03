import {
  buildPacketJourneyObservationModel,
  INITIAL_PACKET_JOURNEY_PROGRESS,
  type LearnerPacketJourneyParameters,
  type ObservationModel,
  type PacketJourneyProgress
} from "@tlp/shared-types";
import { buildTopologyLayout, type TopologyLayout } from "./topology-layout";

/**
 * WP-H — the Packet Journey's behaviour, as total functions over plain values.
 *
 * ## Why this module exists
 *
 * The same reason `mission-instruction-presentation.ts` exists: this repository
 * has no rendered-DOM test harness — no jsdom, no happy-dom, no
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
}

export const INITIAL_PACKET_JOURNEY_VIEW_STATE: PacketJourneyViewState = {
  started: false,
  progress: INITIAL_PACKET_JOURNEY_PROGRESS,
  committedPredictions: {}
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
 * Commit a prediction for one stage.
 *
 * Idempotent per stage: a learner cannot revise a commitment once made, which
 * is what makes "predict, then observe" mean anything. Committing is the only
 * thing that unlocks the next reveal when a stage asks for a prediction.
 */
export function commitPrediction(
  state: PacketJourneyViewState,
  stageId: string,
  option: string
): PacketJourneyViewState {
  if (state.committedPredictions[stageId] !== undefined) return state;

  return {
    ...state,
    committedPredictions: { ...state.committedPredictions, [stageId]: option }
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
  actionId: string
): PacketJourneyViewState {
  if (state.progress.appliedActionId !== null) return state;

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
 * Three questions, answered before any scrolling: what am I looking at, what am
 * I supposed to do, and where do I do it. The third is answered by structure —
 * the task sits inside the same workspace as the picture — so this object
 * carries only the first two, in two short lines.
 *
 * `summary` is built from the AUTHORED start label, which is the course's own
 * words for the action this interaction is about.
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
  return `${capitaliseFirst(trafficLabel)} starts at ${sourceLabel}.`;
}

export interface PacketJourneyInterfaceView {
  readonly interfaceId: string;
  readonly label: string;
  readonly attributes: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}

export interface PacketJourneyNodeView {
  readonly nodeId: string;
  readonly label: string;
  readonly roleLabel: string;
  readonly current: boolean;
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
  /** Two short lines answering "what is this" and "what do I do". */
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

  const stages: PacketJourneyStageView[] = revealed.map((stage) => ({
    stageId: stage.stageId,
    nodeId: stage.atNodeId,
    nodeLabel: nodeLabels.get(stage.atNodeId) ?? stage.atNodeId,
    narration: stage.narration,
    ...(stage.decision !== undefined ? { decision: stage.decision } : {}),
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

  // Only the stages the learner has actually observed. `model.stages` also
  // carries the unrevealed ones, each with its `atNodeId` — reading those
  // here would let device inspection answer a question the walkthrough has
  // not reached, including one the learner is about to be asked to predict.
  const revealedNodeIds = revealed.map((stage) => stage.atNodeId);

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
    journeyStatus: resolveNodeJourneyStatus({
      nodeId: node.nodeId,
      revealedNodeIds,
      confirmed,
      stopped,
      trafficLabel: parameters.traffic.label
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

  const textTrace = buildTextTrace(parameters, state, stages, appliedAction);

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

  const via =
    currentStage?.viaLinkId === undefined
      ? null
      : (resolvedLinks?.find(
          (link) => link.linkId === currentStage.viaLinkId
        )?.endpointSummary ?? null);

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
      parameters.traffic.label
    ),
    via,
    // Every observable change moves this on: a reveal, a commitment, a
    // remediation. Nothing branches on it; it exists so a presentation can
    // replay a transient emphasis when the picture changes.
    token: [
      state.progress.revealedStageCount,
      model.currentStageId ?? "none",
      state.progress.appliedActionId ?? "none",
      Object.keys(state.committedPredictions).length
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
      title: describeOrientationTitle(parameters.traffic.label),
      summary: describeOrientationSummary(
        parameters.traffic.label,
        nodeLabels.get(parameters.traffic.sourceNodeId) ??
          parameters.traffic.sourceNodeId
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
    trafficSummary: describeTrafficSummary(parameters, nodeLabels),
    startLabel: parameters.traffic.startActionLabel,
    nodes,
    links,
    topology,
    stages,
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
    inspectionPrompt:
      sequencing === "guide" && (openPrediction !== null || stages.length === 0)
        ? describeInspectionPrompt()
        : null,
    predictionRequired: sequencing === "commit_first",
    actions: model.actions.map((action) => ({
      actionId: action.actionId,
      label: action.label,
      available: action.available
    })),
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
      via
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
  appliedAction: { readonly label: string; readonly observation: string } | undefined
): string[] {
  const trace: string[] = [];
  const pending = resolvePendingCommitment(parameters, state);

  if (stages.length === 0) {
    trace.push(`Nothing has been sent yet. ${parameters.traffic.startActionLabel} to begin.`);
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
  confirmed,
  stopped,
  trafficLabel
}: {
  nodeId: string;
  /** `atNodeId` of every REVEALED stage, in order. Never the unrevealed ones. */
  readonly revealedNodeIds: readonly string[];
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

  const observed = revealedNodeIds.includes(nodeId);
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

export function describeTrafficSummary(
  parameters: LearnerPacketJourneyParameters,
  nodeLabels: ReadonlyMap<string, string>
): string {
  const from =
    nodeLabels.get(parameters.traffic.sourceNodeId) ??
    parameters.traffic.sourceNodeId;
  const to =
    nodeLabels.get(parameters.traffic.destinationNodeId) ??
    parameters.traffic.destinationNodeId;

  return `Following ${parameters.traffic.label} from ${from} to ${to}.`;
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
  return state.progress.revealedStageCount === 0
    ? parameters.traffic.startActionLabel
    : "Show what happens next";
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

/** Names the workspace control, in both directions. */
export function describeWorkspaceOpenLabel(): string {
  return "Open the network workspace";
}

export function describeWorkspaceCloseLabel(): string {
  return "Close the network workspace";
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
  trafficLabel: string
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

export function describeAnnouncement(
  model: ObservationModel,
  stages: readonly PacketJourneyStageView[],
  appliedAction: { readonly observation: string } | undefined,
  pendingCommitment: PacketJourneyCommitmentView | null,
  startActionLabel: string,
  atRemediatedStage: boolean,
  via: string | null
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
    return `Ready to start. ${startActionLabel} when you are ready.`;
  }

  const consequence = model.consequence;

  if (consequence?.state === "confirmed") {
    return `Fixed. ${consequence.narration}`;
  }

  if (consequence?.state === "stopped") {
    const symptom = consequence.symptom ?? "";
    // The connection is named here too, and especially here: where the traffic
    // came from is part of understanding where it stopped.
    const across = via === null ? "" : `, across ${via}`;
    return `Stopped at ${stages[stages.length - 1]?.nodeLabel}${across}. ${consequence.narration} ${symptom}`.trim();
  }

  // The repair's own observation belongs to the moment it was applied. Once the
  // learner moves on, announcing it again would report the fix as though it had
  // just happened while the traffic was somewhere else entirely.
  if (appliedAction !== undefined && atRemediatedStage) {
    return appliedAction.observation;
  }

  const latest = stages[stages.length - 1];

  // Naming the link crossed is what keeps the correlation in TEXT. The wire
  // that lights up is decorative and hidden from assistive technology, so if
  // this sentence did not say which connection was used, that fact would exist
  // only in the picture.
  const across = via === null ? "" : `, across ${via}`;

  return `At ${latest?.nodeLabel}${across}. ${latest?.narration}`;
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
