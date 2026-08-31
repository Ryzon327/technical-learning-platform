/**
 * WP-H / CURR-011 section 8 / DEC-058 — the shared observation model.
 *
 * ## What this is
 *
 * The one shape every interaction renderer and every accessible interaction
 * path consumes. It describes observations that have ALREADY BEEN DETERMINED
 * by an authoritative source.
 *
 * ```text
 * teaching mode:  authored curriculum      → projection → ObservationModel → renderer
 * future live:    Lab Engine observations  → projection → ObservationModel → renderer
 * ```
 *
 * The seam is the anti-rewrite constraint DEC-058 records. Building teaching
 * mode against this shape is what makes live mode (WP-K) an adapter rather than
 * a rewrite of the instructional content model and both presentations.
 *
 * ## What this is NOT, and can never become
 *
 * **Not a network simulator, and not a digital twin.** There is no routing
 * algorithm here, no subnet arithmetic, no next-hop calculation, no switching
 * or VLAN forwarding logic, no ARP, no STP, no packet parsing and no
 * reachability computation. There is also nothing to compute them FROM: the
 * decision at each hop and whether the journey proceeds or stops are FIELDS,
 * carried from the source, never derived here or by a consumer.
 *
 * The architecture is one directional sentence:
 *
 * ```text
 * SOURCE DETERMINES TRUTH → ObservationModel DESCRIBES TRUTH → RENDERER PRESENTS TRUTH
 * ```
 *
 * A renderer that inferred a forwarding outcome from topology would be a second
 * answer to a question the deterministic validator (LAB-008) owns. That is the
 * failure mode DEC-058 exists to prevent, and it is prevented structurally:
 * this model exposes no adjacency-plus-address surface from which forwarding
 * COULD be inferred, only labelled facts and authored outcomes.
 *
 * ## Why availability is explicit at three grains
 *
 * Teaching mode is authored, so everything it carries is available. Live mode
 * is not: a provider can lose one interface's state without losing the
 * topology, so availability is modelled per attribute, per link and per stage,
 * and once more at the top level.
 *
 * `value: null` therefore never means "false", "zero" or "down" — it means the
 * source did not report it, and `availability` says which kind of not-reported
 * it is. A consumer that treated absence as a comfortable default would be
 * fabricating state, which CURR-011 section 12 forbids in both modes.
 *
 * ## This model produces no evidence
 *
 * There is no competency field, no evidence field, no score, no pass mark and
 * no progress field anywhere below, so nothing built on it can contribute to a
 * competency claim. Deterministic validation remains the sole authority for
 * success and failure.
 */

/* ------------------------------------------------------------------ *
 * Source and availability
 * ------------------------------------------------------------------ */

/**
 * Which authority determined these observations.
 *
 * The renderer READS this to label the surface honestly — DEC-058 requires
 * teaching mode to be clearly identified on screen as instructional simulation
 * — and never sets or infers it.
 *
 * `live_lab` is a seam, not a capability. WP-H implements `authored_teaching`
 * only; publication refuses a live interaction until WP-K's adapter exists.
 */
export const OBSERVATION_SOURCE_KINDS = [
  "authored_teaching",
  "live_lab"
] as const;

export type ObservationSourceKind = (typeof OBSERVATION_SOURCE_KINDS)[number];

export function isObservationSourceKind(
  value: unknown
): value is ObservationSourceKind {
  return (
    typeof value === "string" &&
    (OBSERVATION_SOURCE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Whether the source reported this observation.
 *
 *   available    the source reported it; `value` is what it said
 *   unavailable  the source was asked and could not answer — live mode's
 *                fail-closed state (CURR-011 section 12)
 *   unknown      not yet observed; the learner has not reached this point
 *
 * `unavailable` and `unknown` are deliberately distinct. "The lab could not be
 * read" and "you have not looked yet" are different facts, and collapsing them
 * would let a provider failure read as ordinary progress.
 */
export const OBSERVATION_AVAILABILITY = [
  "available",
  "unavailable",
  "unknown"
] as const;

export type ObservationAvailability = (typeof OBSERVATION_AVAILABILITY)[number];

export function isObservationAvailability(
  value: unknown
): value is ObservationAvailability {
  return (
    typeof value === "string" &&
    (OBSERVATION_AVAILABILITY as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ *
 * Topology as observed
 * ------------------------------------------------------------------ */

/**
 * One inspectable fact about an interface.
 *
 * `label` is authored words ("IP address", "VLAN"), never a storage key, so
 * both presentations can show it directly. `value` is text: an address is a
 * string here and is never parsed, compared or arithmetic'd.
 */
export interface ObservationAttribute {
  readonly label: string;
  readonly value: string | null;
  readonly availability: ObservationAvailability;
}

export interface ObservationInterface {
  readonly interfaceId: string;
  readonly label: string;
  readonly attributes: readonly ObservationAttribute[];
}

/** What a device IS, for presentation. It confers no behaviour. */
export const OBSERVATION_NODE_ROLES = ["host", "switch", "router"] as const;

export type ObservationNodeRole = (typeof OBSERVATION_NODE_ROLES)[number];

export function isObservationNodeRole(
  value: unknown
): value is ObservationNodeRole {
  return (
    typeof value === "string" &&
    (OBSERVATION_NODE_ROLES as readonly string[]).includes(value)
  );
}

export interface ObservationNode {
  readonly nodeId: string;
  readonly label: string;
  readonly role: ObservationNodeRole;
  readonly interfaces: readonly ObservationInterface[];
}

/**
 * A connection between two interfaces.
 *
 * Endpoints exist so a picture can be drawn and so an accessible list can say
 * what connects to what. They are **not** an adjacency table to route over:
 * nothing in this package walks them, and the journey's path is authored
 * stages rather than a traversal.
 */
export interface ObservationLink {
  readonly linkId: string;
  readonly label: string;
  readonly endpoints: readonly [string, string];
  readonly availability: ObservationAvailability;
}

/* ------------------------------------------------------------------ *
 * The journey
 * ------------------------------------------------------------------ */

/**
 * Whether the unit of traffic moved on from this point.
 *
 * Authored or observed, never computed. CURR-011 section 10.1: "No inference.
 * The path is authored; where a fault is authored, the stop point is authored
 * with it."
 */
export const OBSERVATION_STAGE_OUTCOMES = ["proceeds", "stops"] as const;

export type ObservationStageOutcome =
  (typeof OBSERVATION_STAGE_OUTCOMES)[number];

export function isObservationStageOutcome(
  value: unknown
): value is ObservationStageOutcome {
  return (
    typeof value === "string" &&
    (OBSERVATION_STAGE_OUTCOMES as readonly string[]).includes(value)
  );
}

/**
 * One position in the journey.
 *
 * `narration` is the text trace entry and is REQUIRED. CURR-011 section 14.3
 * keeps it mandatory for narration, state description, reduced-motion
 * presentation and observation history — and section 12 of the Architect
 * decision keeps accessibility present at every support level, so narration
 * describes what was OBSERVED and never carries the diagnosis.
 *
 * `decision` is the teaching — what the device decided and why. It is
 * answer-revealing, so it is optional here and the server drops it at
 * protected support levels. Its absence is a withholding, never a defect.
 */
export interface ObservationStage {
  readonly stageId: string;
  readonly atNodeId: string;
  readonly narration: string;
  readonly decision?: string;
  readonly outcome: ObservationStageOutcome;
  readonly availability: ObservationAvailability;
}

/**
 * An enumerated change the learner may make.
 *
 * There is no free-form configuration anywhere in this model. A learner
 * chooses from authored actions, which is what keeps the interaction from
 * needing an engine to interpret arbitrary input.
 */
export interface ObservationAction {
  readonly actionId: string;
  readonly label: string;
  readonly available: boolean;
}

/**
 * Where the journey currently stands.
 *
 *   proceeding  moving through the authored path
 *   stopped     halted at an authored stop point; `symptom` says what the
 *               learner can see, and deliberately not why
 *   confirmed   remediation was applied and the journey completed
 */
export const OBSERVATION_CONSEQUENCE_STATES = [
  "proceeding",
  "stopped",
  "confirmed"
] as const;

export type ObservationConsequenceState =
  (typeof OBSERVATION_CONSEQUENCE_STATES)[number];

export interface ObservationConsequence {
  readonly state: ObservationConsequenceState;
  readonly narration: string;
  readonly symptom?: string;
}

/* ------------------------------------------------------------------ *
 * The model
 * ------------------------------------------------------------------ */

/**
 * One interaction's observations, as both presentations receive them.
 *
 * The visual renderer and the accessible path consume THIS, and only this.
 * CURR-011 section 14.6: the accessible path "must use the same validated
 * interaction parameters and the same ObservationModel" and "must not create a
 * second simulation or a second source of truth".
 *
 * `availability` at the top level is live mode's fail-closed switch. When it is
 * `unavailable`, a presentation says so and draws no path — it never falls back
 * to a plausible one.
 */
export interface ObservationModel {
  readonly sourceKind: ObservationSourceKind;
  readonly availability: ObservationAvailability;
  /** What the traffic is, in authored words. Never parsed. */
  readonly trafficLabel: string;
  readonly nodes: readonly ObservationNode[];
  readonly links: readonly ObservationLink[];
  readonly stages: readonly ObservationStage[];
  readonly currentStageId: string | null;
  readonly actions: readonly ObservationAction[];
  readonly consequence: ObservationConsequence | null;
}

/**
 * The honest empty model.
 *
 * Live mode uses this when authoritative state cannot be read, and it is the
 * only correct answer in that case: no nodes, no links, no stages, no
 * consequence, and `availability: "unavailable"` saying why there is nothing.
 *
 * Exported so the fail-closed path is one shared construction rather than a
 * shape each future caller reinvents — and so a test can assert that the
 * unavailable model draws nothing.
 */
export function unavailableObservationModel(
  sourceKind: ObservationSourceKind,
  trafficLabel: string
): ObservationModel {
  return {
    sourceKind,
    availability: "unavailable",
    trafficLabel,
    nodes: [],
    links: [],
    stages: [],
    currentStageId: null,
    actions: [],
    consequence: null
  };
}
