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
 *
 * `prominent` is DISPLAY METADATA and nothing else: it says this fact is worth
 * showing on a compact device face as well as in a full inspection. The source
 * decides; a presentation obeys.
 *
 * ## Why this is a flag rather than the renderer choosing
 *
 * A renderer that picked which facts to surface would have to recognise them —
 * matching a label against "VLAN", or "Mode", or "Encapsulation". That is
 * domain knowledge in the presentation layer: it would work only for
 * networking, would silently show nothing for the next interaction type, and
 * would be the first step towards a renderer that understands what a VLAN IS.
 *
 * It confers no meaning. It does not say a fact is a VLAN, that two devices
 * share one, that a port is a trunk, or that anything can reach anything. It
 * says "show this one early". Every fact remains available at full inspection
 * whether or not it is flagged, so nothing is hidden by omitting it.
 */
export interface ObservationAttribute {
  readonly label: string;
  readonly value: string | null;
  readonly availability: ObservationAvailability;
  readonly prominent?: boolean;
}

export interface ObservationInterface {
  readonly interfaceId: string;
  readonly label: string;
  /**
   * Draw this interface's own label on the picture, beside the connection.
   *
   * ## Why this is a flag and not a rule
   *
   * A learner reading "Switch-1 learned PC-A is on Port 1" has to be able to
   * SEE which connection Port 1 is, or the sentence is about something
   * off-screen. The label itself is already authored — it is `label` — so the
   * only question is which ends are worth drawing.
   *
   * A presentation could try to answer that itself: label the switch end,
   * label the busiest device, label whichever end is higher on the canvas.
   * Every one of those is the renderer deciding which end of a wire matters,
   * from a device's role, from geometry or from position — the inference this
   * model exists to prevent, and the reason Mission 1's topology draws nothing
   * it was not given.
   *
   * So the author says. In Mission 2 the switch's ports carry it and the host
   * interfaces do not, which is what keeps the diagram to three short labels
   * instead of six.
   *
   * Exactly the same shape and exactly the same reason as
   * `ObservationAttribute.prominent`, which decides which facts reach a
   * device's face. Absent means not drawn on the wire; the interface is still
   * listed in full wherever interfaces are listed, so nothing is hidden by
   * leaving it off.
   */
  readonly prominent?: boolean;
  readonly attributes: readonly ObservationAttribute[];
}

/**
 * What a device IS, for presentation. It confers no behaviour.
 *
 * ## Why `printer` is here, next to the generic `host`
 *
 * A printer IS a host — Networking Foundations Mission 1 teaches exactly that,
 * and nothing about delivery treats the two differently. This value therefore
 * changes no networking truth whatsoever; it exists so that a presentation can
 * tell the learner WHICH KIND of end device it is drawing.
 *
 * That distinction is instruction, not decoration. A topology in which PC-A and
 * the Printer are the same shape teaches a beginner that a network is made of
 * interchangeable boxes, which is the mental model the course exists to
 * replace. A topology that distinguishes them lets a learner recognise device
 * categories before they can name a single one.
 *
 * ## Why the renderer may not work this out instead
 *
 * The alternative is a presentation that recognises the string "Printer" in a
 * label, or matches an authored attribute like "Kind of device". That is the
 * same defect `ObservationAttribute.prominent` exists to prevent: domain
 * knowledge in the presentation layer, correct for one course's wording and
 * silently wrong for the next. The category a device belongs to is an AUTHORING
 * decision, so it is carried as authored data and copied, never inferred.
 *
 * ## The boundary this does not cross
 *
 * A role selects a symbol and a word. It must never select a BEHAVIOUR. Nothing
 * may read this field to decide forwarding, reachability, whether a frame is
 * accepted or discarded, or what any device does with traffic — every one of
 * those remains an authored observation (DEC-058). Adding a role is additive
 * and presentational by construction; a role that meant something would be a
 * second networking model.
 */
export const OBSERVATION_NODE_ROLES = [
  "host",
  "switch",
  "router",
  "printer"
] as const;

export type ObservationNodeRole = (typeof OBSERVATION_NODE_ROLES)[number];

export function isObservationNodeRole(
  value: unknown
): value is ObservationNodeRole {
  return (
    typeof value === "string" &&
    (OBSERVATION_NODE_ROLES as readonly string[]).includes(value)
  );
}

/**
 * An authored grouping of nodes, for presentation.
 *
 * ## What this is, and the exact size of the claim it makes
 *
 * It says: **these authored nodes belong to this authored group, and the group
 * is called this.** That is the whole of it.
 *
 * It exists because Founder UAT required a learner to SEE which devices are
 * being studied together, and because a renderer may not work that out. The
 * previous revision refused to draw a boundary at all, and that refusal was
 * correct: membership was not derivable from role, from link adjacency, from
 * geometry, from the presence of a router, or from authored prose, and every
 * one of those inferences would have been a networking fact invented by a
 * picture. This field is the missing authored fact, so the picture can state
 * something true instead of guessing.
 *
 * ## What a group does NOT mean
 *
 * A group is deliberately NOT an IP network, a subnet, a VLAN, a broadcast
 * domain, a routing domain, a trust or security zone, a physical location, or a
 * statement about reachability, forwarding or gateways. Nothing may read this
 * field to decide any of them, and nothing may read it to decide behaviour of
 * any kind.
 *
 * The naming is generic on purpose. Had this been called `ObservationNetwork`
 * with a `subnet` field, the first consumer to need "which devices can reach
 * each other" would have found something that looked like an answer. There is
 * no answer here to find: an id, a label, and membership an author wrote down.
 * A future contract may add a specific meaning; until one does, a group means
 * what the author's `label` says and nothing more.
 *
 * ## Why membership lives on the node
 *
 * A node carries at most one `groupId`, so membership cannot contradict itself
 * and there is no second list to keep in step. There is no nesting in this
 * slice: a group has no parent, and a group is not a member of a group.
 */
export interface ObservationGroup {
  readonly groupId: string;
  /** Authored words, shown as the group's caption. Never a storage key. */
  readonly label: string;
}

export interface ObservationNode {
  readonly nodeId: string;
  readonly label: string;
  readonly role: ObservationNodeRole;
  /**
   * Which authored group this node belongs to, if any.
   *
   * Absent means the author did not place it in a group — never "it is in the
   * default one", and never "work it out from what it is attached to". A
   * presentation draws an ungrouped node outside every group boundary, which is
   * the honest reading and the only one available.
   */
  readonly groupId?: string;
  /**
   * Authored prose explaining what this node is doing in THIS scenario.
   *
   * This is the UNDERSTAND layer of device inspection. It exists because a
   * beginner who selects a device is asking "what is this and why is it here?",
   * and the answer is scenario-specific: Router-1's presence in a print-request
   * walkthrough is worth explaining precisely because the print request does
   * not use it.
   *
   * It is AUTHORED, and deliberately so. The category-level sentence ("a router
   * connects one network to another") can be derived from `role`, because that
   * is a property of the category. Everything after it — what this device does
   * in this topology, and which later mission develops the part left unexplained
   * — is course knowledge. Deriving it would mean teaching a presentation layer
   * what a router does and which mission covers it, which is the inference this
   * model exists to prevent.
   *
   * Optional. A node without one still inspects: the learner reads the
   * category sentence, the connections and the journey status, and is told
   * nothing invented to fill the gap.
   */
  readonly about?: string;
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
 *
 * `viaLinkId` is the link the unit of traffic traversed to ARRIVE here.
 *
 * ## Why that field is not inference
 *
 * It is a CARRIED FACT, exactly like `atNodeId` and `outcome` beside it. The
 * source states which link was used; nothing here and nothing downstream works
 * it out. A renderer that instead searched `links` for one joining the previous
 * stage's node to this one would be deriving a path element the source never
 * reported — the forwarding inference DEC-058 exists to forbid, and wrong
 * outright on a topology carrying two links between the same pair of devices.
 *
 * It is optional because a stage need not have been arrived at over a link: the
 * first stage is where the traffic originates, and a live source may report a
 * hop without reporting which link carried it.
 *
 * It reveals no more than `atNodeId` already does, so it is not
 * answer-revealing and is carried at every support level.
 */
export interface ObservationStage {
  readonly stageId: string;
  readonly atNodeId: string;
  readonly narration: string;
  readonly decision?: string;
  readonly outcome: ObservationStageOutcome;
  readonly viaLinkId?: string;
  /**
   * Further links occupied at the SAME moment as this stage.
   *
   * ## What this is
   *
   * `viaLinkId` names the one link this stage's arrival came in on. This names
   * links that were carrying something at the same instant — so one observed
   * moment can be drawn as one event on several links rather than as several
   * events in a row.
   *
   * ## Why it is deliberately not called anything about networks
   *
   * The obvious names — flooded, egress, forwarded, broadcast — are all claims
   * about WHY several links were busy, and that is exactly the claim this
   * model must never make. A source says which links were occupied together;
   * what that meant is the author's narration, and in Mission 2 it happens to
   * be a switch that has not learned a destination yet. A different source, a
   * different course or a live capture could name links here for a completely
   * different reason and this field would still be honest.
   *
   * ## What a consumer may and may not do with it
   *
   * A presentation may draw these links as active, and may draw a marker on
   * each. It may NOT work out which links SHOULD be here: no eligible-port
   * calculation, no excluding an ingress link, no reading device roles, no
   * walking the topology. Every id is authored, and validation refuses one
   * that does not resolve.
   *
   * Optional and additive: absent means one link, or none, exactly as before.
   */
  readonly alsoOnLinkIds?: readonly string[];
  /**
   * What named devices are SHOWING at this stage, as authored facts.
   *
   * Authored teaching state, and nothing else. It is how a device can display
   * something that changes as a journey runs — in Mission 2, what Switch-1 has
   * learned so far — without any of it being computed.
   *
   * Nothing derives these. Not from traffic, not from links, not from roles,
   * not from earlier stages. A stage shows exactly what its author wrote, so
   * carrying a fact forward means authoring it again on the later stage. That
   * is more verbose and it is the point: a model that accumulated state would
   * be deciding what a device knows, which is the authority this contract
   * exists to keep with the author.
   *
   * The label/value pair is the same vocabulary interfaces already use for
   * attributes, so a presentation needs no second display grammar and no
   * second accessible pattern.
   */
  readonly deviceFacts?: readonly ObservationDeviceFacts[];
  readonly availability: ObservationAvailability;
}

/**
 * One device's authored display at one stage.
 *
 * `label` is the caption above the facts — authored words like "Switch-1
 * knows", never a key a consumer branches on. `facts` are label/value pairs in
 * authored order.
 */
export interface ObservationDeviceFacts {
  readonly nodeId: string;
  readonly label: string;
  readonly facts: readonly ObservationDeviceFact[];
}

export interface ObservationDeviceFact {
  readonly label: string;
  readonly value: string;
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
  /**
   * The authored groups, in authored order.
   *
   * Required rather than optional, and empty when the author declared none, so
   * a consumer never has to decide what a missing list means. Every `groupId` a
   * node names is declared here; validation refuses the document otherwise, so
   * a presentation resolving one can rely on finding it.
   */
  readonly groups: readonly ObservationGroup[];
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
    groups: [],
    nodes: [],
    links: [],
    stages: [],
    currentStageId: null,
    actions: [],
    consequence: null
  };
}
