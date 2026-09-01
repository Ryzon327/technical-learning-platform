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
  readonly progress: PacketJourneyProgress;
  readonly committedPredictions: Readonly<Record<string, string>>;
}

export const INITIAL_PACKET_JOURNEY_VIEW_STATE: PacketJourneyViewState = {
  progress: INITIAL_PACKET_JOURNEY_PROGRESS,
  committedPredictions: {}
};

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

  const nodes: PacketJourneyNodeView[] = model.nodes.map((node) => ({
    nodeId: node.nodeId,
    label: node.label,
    roleLabel: describeNodeRole(node.role),
    current: model.currentStageId !== null &&
      revealed[revealed.length - 1]?.atNodeId === node.nodeId,
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
      pendingCommitment !== null
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

  return {
    sourceNotice: describeSourceNotice(model.sourceKind),
    trafficSummary: describeTrafficSummary(parameters, nodeLabels),
    startLabel: parameters.traffic.startActionLabel,
    nodes,
    links,
    topology,
    stages,
    currentEvent,
    pendingPrediction: openPrediction,
    pendingCommitment,
    canAdvance: canAdvance(state, parameters, sequencing),
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
    remediationWithheld:
      stopped && (parameters.actions ?? []).length === 0
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

export function describeNodeRole(role: string): string {
  if (role === "host") return "Host";
  if (role === "switch") return "Switch";
  if (role === "router") return "Router";
  return role;
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
  hasPendingCommitment: boolean
): string {
  if (confirmed) return "The journey is complete.";
  if (nodeLabel === undefined) {
    return hasPendingCommitment
      ? "Prediction recorded. Nothing has been sent yet."
      : "Nothing has been sent yet.";
  }
  if (stopped) return `Stopped at ${nodeLabel}.`;
  if (atRemediatedStage) {
    return `Repaired at ${nodeLabel}. The journey can continue.`;
  }
  return `The traffic is at ${nodeLabel}.`;
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
