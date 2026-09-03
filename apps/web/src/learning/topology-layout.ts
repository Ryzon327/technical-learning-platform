import type {
  ObservationLink,
  ObservationModel,
  ObservationNode,
  ObservationNodeRole
} from "@tlp/shared-types";

/**
 * WP-I, corrected by WP-J Module 1 — the topology as a PICTURE, derived from
 * the observation model and from nothing else.
 *
 * ## Why this is a separate, pure module
 *
 * The same reason `packet-journey-presentation.ts` is: this repository has no
 * rendered-DOM test harness — no jsdom, no happy-dom, no testing-library — and
 * this slice may not add one, because a dependency change is a Founder gate. So
 * every rule that decides what the drawing contains AND where every part of it
 * sits lives here, as total functions over plain values, and the components are
 * left thin enough that what remains is markup a structural gate can check.
 *
 * A layout that cannot be tested is a layout that will silently drop a device —
 * or, as Founder UAT found, draw five devices in a horizontal row with wires
 * running through the cards.
 *
 * ## The Founder UAT correction this module now carries
 *
 * The previous revision assigned each device a COLUMN in authored order and
 * drew every wire either along one horizontal band or through a routed lane
 * below it. Three consequences followed directly from that choice, and all
 * three were rejected at Founder UAT:
 *
 *   - the picture read as a row of cards rather than as a network;
 *   - a switch and the hosts attached to it were peers in that row, so nothing
 *     about the drawing said which device the others were attached to;
 *   - links between non-adjacent columns dropped into shared lanes underneath,
 *     where they ran parallel to each other and under the cards.
 *
 * The correction is that **layout is instruction**. A beginner should be able
 * to read the important relationships out of the arrangement before reading a
 * word, so this module now computes a HIERARCHY:
 *
 * ```text
 *                     Router-1          row 0  — network-edge equipment
 *                        |
 *                     Switch-1          row 1  — intermediary equipment
 *                   /     |     \
 *                 PC-A   PC-B   Printer row 2  — end devices
 * ```
 *
 * ## What decides a row, and why that is not networking
 *
 * A row is chosen from the authored `role` and from nothing else: routers draw
 * in the edge row, switches in the intermediary row, hosts and printers in the
 * end-device row. That is a DRAWING CONVENTION over an authored category, in
 * exactly the way `DeviceSymbol` selects a silhouette from the same field. It
 * asserts no behaviour: a router drawn at the top has not been said to route,
 * to forward, to be a default gateway, or to be reachable from anything.
 *
 * Horizontal position comes from the AUTHORED LINKS: a device is drawn near the
 * devices it is authored as attached to, and a device with attachments below it
 * is centred over them. Using an authored link to decide where to put a box is
 * geometry. It is not a traversal, and no path is computed from it — where the
 * traffic went is still `ObservationStage.atNodeId`, and which link carried it
 * is still `ObservationStage.viaLinkId`, both carried and never derived.
 *
 * ## What is NOT here, and cannot be
 *
 * There is no routing, forwarding, next hop, reachability, VLAN membership,
 * subnet arithmetic or address parsing — an address is a string that is copied
 * to the screen and never read. This module never searches the link list for a
 * link joining two consecutive stages: that search is the forwarding inference
 * DEC-058 forbids, and it is also simply wrong on a topology with two links
 * between the same pair of devices.
 *
 * **Membership in a group is authored, never inferred.** A boundary is drawn
 * only around the nodes an author placed in a group with `ObservationNode.
 * groupId`. This module does not decide who belongs together, and it has no
 * rule that could: not "everything that is not a router", not "everything
 * reachable through the switch", not "everything the prose mentions". It reads
 * a field.
 *
 * What it MAY do, and does, is turn that authored membership into geometry —
 * the rectangle enclosing the members, its padding, and where the caption sits.
 * Geometry cannot change membership: a node's group is the one the author gave
 * it, wherever the box ends up.
 *
 * A group carries no networking meaning. It is not a subnet, a VLAN, a
 * broadcast domain, a routing domain, a trust zone or a location, and nothing
 * here reads one to decide behaviour. See `ObservationGroup`.
 *
 * ## Failure is loud
 *
 * A link whose endpoint names an interface no device declares does not get
 * dropped, and neither does the device it should have reached. The whole layout
 * becomes `unavailable` and says so. A picture missing one device is worse than
 * no picture, because a learner reasons about the network they can see.
 *
 * ## This is an ADDITION, never a replacement
 *
 * CURR-011 section 14.6 forbids a second simulation and requires the accessible
 * path to consume the same observation model. It does: this layout is built
 * from the model the semantic presentation already renders, so the drawing can
 * carry nothing the text does not. `describeTopologyArrangement` puts the
 * arrangement itself into words for the same reason — spatial position is
 * information, so it may not be available only to people who can see it.
 */

/* ------------------------------------------------------------------ *
 * Geometry constants
 *
 * These are CSS pixels in the topology's own coordinate space, and the
 * stylesheet mirrors the ones that decide how tall a device card's contents
 * are allowed to be. The two must agree: the layout tells the renderer the
 * exact box each card occupies, and a card whose contents were taller than the
 * box it was given would spill across the wires beneath it.
 *
 * `verify-wpj-m1.sh` pins both sides.
 * ------------------------------------------------------------------ */

/** Width of every device card. Constant, so a row reads as one register. */
export const NODE_WIDTH = 156;

/**
 * A card with no authored display facts on its face: symbol, category word,
 * device name and state caption.
 */
export const NODE_BASE_HEIGHT = 96;

/** The rule and spacing that separate the face facts from the name above. */
export const NODE_FACTS_HEADER_HEIGHT = 14;

/** One authored display fact on the face. One line, never wrapped. */
export const NODE_FACT_ROW_HEIGHT = 19;

/** Clear space between two cards in the same row. */
export const NODE_GAP = 22;

/**
 * Clear space between one row of cards and the next.
 *
 * This band is where every branch line is drawn, and no card is ever inside it.
 * That is what makes "a link never runs through a device body" a property of
 * the construction rather than a hope.
 */
export const ROW_GAP = 52;

/** Margin between the outermost drawing and the edge of the canvas. */
export const CANVAS_PADDING = 16;

/** Vertical separation between two routed lanes in the same band. */
export const LANE_STEP = 22;

/** Horizontal separation between two vertical channels beside the drawing. */
export const CHANNEL_STEP = 30;

/**
 * How far outside a device the traffic marker sits.
 *
 * The Founder UAT defect this fixes is the marker overlapping the text inside
 * PC-A's card. A marker is INFORMATION IN TRANSIT, so it belongs on a link and
 * outside the device at either end of it — never over a name, a category, an
 * interface or a control.
 */
export const MARKER_CLEARANCE = 16;

/** Clear space between a group's boundary and the cards inside it. */
export const GROUP_PADDING = 16;

/**
 * The strip along the top of a group where its caption sits.
 *
 * Inside the boundary rather than above it, so the name and the field it names
 * are one object. Together with `GROUP_PADDING` this is 44px above the topmost
 * card in a group — comfortably less than `ROW_GAP`, which is what guarantees a
 * boundary can never reach into the row above and enclose a device that is not
 * a member.
 */
export const GROUP_LABEL_HEIGHT = 22;

/**
 * Clear space between two cards in the same row that are NOT in the same
 * authored group.
 *
 * Wide enough for both boundaries and their padding to fit between the cards,
 * so two groups drawn side by side never touch and an ungrouped device never
 * ends up pressed against a boundary it is not inside. Spacing derived from
 * authored membership is geometry: it moves cards, and it changes nobody's
 * group.
 */
export const GROUP_GAP = NODE_GAP + 2 * GROUP_PADDING;

/* ------------------------------------------------------------------ *
 * The size the drawing has to live within
 *
 * WP-J Module 1 Founder UAT: at a normal viewport the Founder did not know what
 * to do, because the first learner action was below the fold — and had to zoom
 * the browser out to work comfortably.
 *
 * The topology was a large part of why. The interaction is rendered inside the
 * lesson's reading column, and a drawing wider than that column scrolls
 * sideways; a drawing taller than about half the viewport pushes the current
 * task out of sight.
 *
 * These are BUDGETS, not measurements of the current fixture. They are asserted
 * over every fixture in the layout suite, so tuning a constant — a taller card,
 * a wider gap, another row — fails here rather than quietly reintroducing the
 * defect in a browser nobody is testing in.
 * ------------------------------------------------------------------ */

/**
 * The widest a drawing may be before it scrolls sideways inside the lesson
 * column. The reading column is ~624px once the card's padding is removed.
 */
export const TOPOLOGY_WIDTH_BUDGET = 620;

/**
 * The tallest a drawing may be and still leave room, in one pinned workspace,
 * for the orientation above it and the current task below it.
 */
export const TOPOLOGY_HEIGHT_BUDGET = 470;

/* ------------------------------------------------------------------ *
 * The shapes a renderer receives
 * ------------------------------------------------------------------ */

/**
 * What a device looks like right now.
 *
 *   idle       the journey has not reached it
 *   visited    the traffic passed through earlier
 *   current    the traffic is here
 *   stopped    the traffic is here, and the authored outcome stops it
 *   confirmed  the traffic is here, and the journey completed
 *
 * Presentation states over authored observations. None of them is a verdict,
 * and none is computed from topology.
 */
export type TopologyDeviceState =
  | "idle"
  | "visited"
  | "current"
  | "stopped"
  | "confirmed";

export interface TopologyPoint {
  readonly x: number;
  readonly y: number;
}

/** A device's box, top-left anchored, in the canvas coordinate space. */
export interface TopologyBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One end of a wire, resolved from an interface id to something readable. */
export interface TopologyEndpoint {
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly interfaceId: string;
  readonly interfaceLabel: string;
}

/** One authored fact shown beside a port on the device's own face. */
export interface TopologyFact {
  readonly label: string;
  readonly value: string;
}

/**
 * A port on a device, for the device's own face.
 *
 * `facts` are the attributes the SOURCE flagged as `prominent`, copied in
 * authored order. The layout does not choose them, does not rank them and does
 * not know what any of them mean — it filters on a flag the observation model
 * carries. A renderer that instead recognised "VLAN" or "Mode" by name would be
 * networking knowledge in the presentation layer, and would show nothing at all
 * for the next interaction type.
 *
 * Every attribute stays available at full inspection whether or not it is
 * flagged, so this is emphasis, never a filter on what a learner may see.
 */
export interface TopologyPort {
  readonly interfaceId: string;
  readonly label: string;
  readonly facts: readonly TopologyFact[];
}

/**
 * One authored group, turned into something drawable.
 *
 * `groupId`, `label` and `nodeIds` are COPIED from the observation model. `box`
 * and `labelAt` are DERIVED from where the members were drawn — geometry over
 * authored membership, which is the only direction that is allowed. Nothing
 * reads the box to decide who is in the group.
 */
export interface TopologyGroup {
  readonly groupId: string;
  readonly label: string;
  /** The members, in authored node order. Copied, never computed. */
  readonly nodeIds: readonly string[];
  /** The padded rectangle enclosing every member's card. */
  readonly box: TopologyBox;
  /** Where the caption is drawn, in the strip along the top of the box. */
  readonly labelAt: TopologyPoint;
}

export interface TopologyDevice {
  readonly nodeId: string;
  readonly label: string;
  readonly role: ObservationNodeRole;
  readonly roleLabel: string;
  /**
   * The authored group this device belongs to, or `null` when the author put
   * it in none. Copied from `ObservationNode.groupId`.
   */
  readonly groupId: string | null;
  /**
   * Which row of the hierarchy this device is drawn in. 0 is the top row.
   *
   * Chosen from the authored category, never from behaviour. See the module
   * note: a row is a drawing convention, not a claim about the network.
   */
  readonly row: number;
  /** Left-to-right position within the row. */
  readonly order: number;
  /** Exactly where the card sits. The renderer positions, and decides nothing. */
  readonly box: TopologyBox;
  readonly state: TopologyDeviceState;
  readonly stateLabel: string;
  readonly ports: readonly TopologyPort[];
}

/**
 * How one wire is drawn.
 *
 *   branch  between neighbouring rows — one straight line, the shape that
 *           makes "these devices hang off that one" readable at a glance
 *   peer    between two devices in the SAME row — routed through the clear
 *           band above the row
 *   bypass  between rows that are not neighbours — routed out to a vertical
 *           channel beside the drawing, so it cannot cross the row between
 */
export type TopologyLinkShape = "branch" | "peer" | "bypass";

export interface TopologyLink {
  readonly linkId: string;
  /** The authored label, kept as authored. */
  readonly label: string;
  readonly from: TopologyEndpoint;
  readonly to: TopologyEndpoint;
  /**
   * Both ends in one line of plain words.
   *
   * This is the Founder UAT finding that a learner could not tell what connects
   * to what: the authored label is free text, and the endpoints were interface
   * identifiers nothing resolved. One resolution, used by the drawing AND by
   * the accessible list, so the two cannot disagree.
   */
  readonly endpointSummary: string;
  readonly shape: TopologyLinkShape;
  /**
   * The wire, corner by corner. Always at least two points, the first on the
   * `from` device's edge and the last on the `to` device's edge.
   */
  readonly points: readonly TopologyPoint[];
  /** The same polyline as an SVG path. Built here so no component computes one. */
  readonly path: string;
  /** The traffic has crossed this link at some revealed stage. */
  readonly traversed: boolean;
  /** The traffic crossed this link to reach where it is now. */
  readonly current: boolean;
}

export interface TopologyPacket {
  readonly nodeId: string;
  readonly state: "waiting" | "moving" | "stopped" | "confirmed";
  readonly stateLabel: string;
  /**
   * Where the marker is drawn — on a link, clear of every device card.
   *
   * Never inside a device. A device that has the traffic says so through its
   * own state and its own caption; those are different claims and must stay
   * separately readable.
   */
  readonly at: TopologyPoint;
  /** The link the marker is riding, when the source named one. */
  readonly linkId: string | null;
}

export interface TopologyFrame {
  readonly width: number;
  readonly height: number;
}

export type TopologyLayout =
  | {
      readonly state: "available";
      /** The canvas the renderer must reserve, in CSS pixels. */
      readonly frame: TopologyFrame;
      /** How many rows the hierarchy has. */
      readonly rows: number;
      /**
       * The authored groups that have at least one member drawn, in authored
       * order. Empty when the author declared none — which is every
       * interaction written before groups existed.
       */
      readonly groups: readonly TopologyGroup[];
      readonly devices: readonly TopologyDevice[];
      readonly links: readonly TopologyLink[];
      readonly packet: TopologyPacket | null;
      /**
       * The arrangement in words.
       *
       * Spatial position carries information here, so it may not be available
       * only to people who can see it. Rendered as text inside the drawing.
       */
      readonly description: string;
    }
  | { readonly state: "unavailable"; readonly reason: string };

/* ------------------------------------------------------------------ *
 * Wording
 *
 * Kept out of JSX so every string is reachable from a test that runs without a
 * DOM, and so no state is ever conveyed by colour or position alone.
 * ------------------------------------------------------------------ */

/**
 * The device category, in the word printed on the device's own face.
 *
 * Exhaustive over the union rather than falling through to a default. The
 * earlier form returned "Router" for anything it did not recognise, which meant
 * a role added without a label here would have silently mislabelled a device —
 * the worst available failure, because the picture would look complete and
 * would be wrong. A `never` arm makes that a compile error instead.
 *
 * "Host" stays the general word. Networking Foundations Mission 1 teaches that
 * a printer and a server are hosts too, so narrowing it to "Workstation" would
 * contradict the instruction the topology sits beside.
 */
export function describeTopologyRole(role: ObservationNodeRole): string {
  if (role === "host") return "Host";
  if (role === "switch") return "Switch";
  if (role === "router") return "Router";
  if (role === "printer") return "Printer";

  const unreachable: never = role;
  return unreachable;
}

/**
 * A device's state, in the words printed on its own face.
 *
 * Short, and about the EVENT rather than the object. The object is named
 * everywhere it has room to be — the headline, the instructor pane, the
 * authored account — and a card 156px wide cannot carry "the print request is
 * here" without ellipsising it. Naming the event keeps the caption honest,
 * legible and free of the placeholder noun "traffic" that Founder UAT rejected.
 *
 * `confirmed` is the successful end of the journey. It reads as success in
 * WORDS, so the green treatment beside it is reinforcement and never the
 * carrier of the fact.
 */
export function describeDeviceState(state: TopologyDeviceState): string {
  if (state === "current") return "Arrived here";
  if (state === "stopped") return "Stopped here";
  if (state === "confirmed") return "Delivered here";
  if (state === "visited") return "Passed through";
  /*
    Founder UAT found the previous idle wording ambiguous, and it was: phrased
    as a device the journey had not got to YET, it read on PC-B and Router-1 as
    an instruction to wait for an arrival that is never coming.

    "Not involved so far" reports what has been OBSERVED and predicts nothing
    either way, which is the only claim this function is in a position to make
    — a card knows the journey's revealed stages and not whether it has ended.
    The precise fact, including "not part of the path this request took" once
    the authored journey has completed, is the inspector's to state.
  */
  return "Not involved so far";
}

export function describePacketState(state: TopologyPacket["state"]): string {
  if (state === "waiting") return "Nothing has been sent yet";
  if (state === "stopped") return "Stopped";
  if (state === "confirmed") return "Arrived";
  return "In flight";
}

/**
 * What a learner is told when the drawing cannot be built.
 *
 * It names the condition without naming an internal identifier, and it does not
 * imply the lesson is broken: the semantic account beside it still works, which
 * is exactly why refusing to draw is safe.
 */
export function describeTopologyUnavailable(): string {
  return (
    "The network diagram cannot be drawn from the information available, so " +
    "none is shown. The written account of the network below is complete."
  );
}

/**
 * The arrangement, in words.
 *
 * Describes the DRAWING — which devices are in which row, and which pairs have
 * a line between them. It makes no claim the picture does not make, and in
 * particular it does not say that any set of devices forms a network, because
 * nothing authored says so.
 *
 * Built here rather than in JSX so it is one string both the component and a
 * test can read, and so it can never drift from the geometry it describes.
 */
export function describeTopologyArrangement(
  devices: readonly TopologyDevice[],
  links: readonly TopologyLink[],
  rows: number,
  groups: readonly TopologyGroup[]
): string {
  const sentences: string[] = [];

  /*
    Grouping FIRST, because it is the strongest relationship on the page and
    the one a boundary drawn on screen states in a glance. A learner using a
    screen reader should not have to assemble it from row numbers.

    Every sentence here restates an AUTHORED fact. "Contains" is the author's
    membership; "outside" is safe to say because a group's boundary is
    guaranteed to enclose its members and nothing else — a layout that could
    not guarantee that refuses to draw at all rather than describing a boundary
    it did not achieve.
  */
  for (const group of groups) {
    const members = group.nodeIds
      .map((nodeId) => devices.find((device) => device.nodeId === nodeId))
      .flatMap((device) => (device === undefined ? [] : [device.label]));

    if (members.length === 0) continue;

    sentences.push(`${group.label} contains ${joinWithAnd(members)}.`);
  }

  if (groups.length > 0) {
    const loose = devices
      .filter((device) => device.groupId === null)
      .map((device) => device.label);

    if (loose.length > 0) {
      const where =
        groups.length === 1 && groups[0] !== undefined
          ? groups[0].label
          : "every group shown";

      sentences.push(
        loose.length === 1
          ? `${loose[0]} is drawn outside ${where}.`
          : `${joinWithAnd(loose)} are drawn outside ${where}.`
      );
    }
  }

  sentences.push(
    rows === 1
      ? "The diagram is drawn as one row of devices."
      : `The diagram is drawn in ${rows} rows, top to bottom.`
  );

  for (let row = 0; row < rows; row += 1) {
    const inRow = devices
      .filter((device) => device.row === row)
      .sort((left, right) => left.order - right.order)
      .map(
        (device) =>
          `${device.label}, a ${describeTopologyRole(device.role).toLowerCase()}`
      );

    if (inRow.length === 0) continue;

    sentences.push(
      rows === 1
        ? `${joinWithSemicolons(inRow)}.`
        : `Row ${row + 1}: ${joinWithSemicolons(inRow)}.`
    );
  }

  if (links.length > 0) {
    sentences.push(
      `A line is drawn between ${joinWithSemicolons(
        links.map((link) => `${link.from.nodeLabel} and ${link.to.nodeLabel}`)
      )}.`
    );
  }

  return sentences.join(" ");
}

function joinWithSemicolons(parts: readonly string[]): string {
  return parts.join("; ");
}

function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/* ------------------------------------------------------------------ *
 * Building the layout
 * ------------------------------------------------------------------ */

interface InterfaceOwner {
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly interfaceLabel: string;
}

interface ResolvedLink {
  readonly link: ObservationLink;
  readonly from: InterfaceOwner;
  readonly to: InterfaceOwner;
}

/**
 * Which band of the hierarchy a category is drawn in.
 *
 * A DRAWING CONVENTION over the authored role, and the only place category
 * influences position. Lower numbers draw higher up.
 *
 *   0  equipment that faces out of the drawing — a router
 *   1  equipment other devices attach through — a switch
 *   2  end devices — hosts, of which a printer is one
 *
 * Exhaustive over the union, so adding a role is a compile error here until
 * somebody decides where it belongs. A silent default would put a new category
 * in the end-device row and quietly teach that it is one.
 *
 * This confers no behaviour. Nothing reads a band to decide whether traffic
 * moves, where it goes next, or what any device does with it.
 */
function bandOfRole(role: ObservationNodeRole): number {
  if (role === "router") return 0;
  if (role === "switch") return 1;
  if (role === "host") return 2;
  if (role === "printer") return 2;

  const unreachable: never = role;
  return unreachable;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function pointsToPath(points: readonly TopologyPoint[]): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`
    )
    .join(" ");
}

/** How far a point is from a box. Zero when the point is on or inside it. */
export function distanceToBox(point: TopologyPoint, box: TopologyBox): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

/**
 * Build the drawable topology for one observation model.
 *
 * `originNodeId` is where the traffic starts, from the authored traffic
 * declaration. It is a carried fact and is used for one thing: parking the
 * packet marker before anything has been sent. Pass `null` when it is unknown,
 * and the marker simply is not placed.
 */
export function buildTopologyLayout(
  model: ObservationModel,
  originNodeId: string | null
): TopologyLayout {
  // Live mode's fail-closed state. An unavailable model draws nothing, and
  // never falls back to a plausible picture (CURR-011 section 12).
  if (model.availability !== "available") {
    return { state: "unavailable", reason: describeTopologyUnavailable() };
  }

  if (model.nodes.length === 0) {
    return { state: "unavailable", reason: describeTopologyUnavailable() };
  }

  const owners = new Map<string, InterfaceOwner>();

  for (const node of model.nodes) {
    for (const iface of node.interfaces) {
      owners.set(iface.interfaceId, {
        nodeId: node.nodeId,
        nodeLabel: node.label,
        interfaceLabel: iface.label
      });
    }
  }

  const resolved: ResolvedLink[] = [];

  for (const link of model.links) {
    const from = owners.get(link.endpoints[0]);
    const to = owners.get(link.endpoints[1]);

    // A dangling endpoint means the drawing would show a wire going nowhere,
    // or a device quietly missing an attachment. Neither is acceptable in a
    // picture a learner reasons about, so the whole layout refuses.
    if (from === undefined || to === undefined) {
      return { state: "unavailable", reason: describeTopologyUnavailable() };
    }

    resolved.push({ link, from, to });
  }

  /* --- authored group membership ------------------------------------ */

  // READ, never derived. The only question asked of the model is "what did the
  // author write on this node", and the only failure available is a reference
  // that does not resolve — which refuses the whole drawing rather than
  // quietly inventing the group the author meant.
  const declaredGroups = new Map(
    model.groups.map((group) => [group.groupId, group])
  );

  for (const node of model.nodes) {
    if (node.groupId === undefined) continue;
    if (declaredGroups.has(node.groupId)) continue;

    return { state: "unavailable", reason: describeTopologyUnavailable() };
  }

  const groupOf = (node: ObservationNode): string | null =>
    node.groupId ?? null;

  /* --- what the journey has observed so far ------------------------- */

  const revealed = model.stages.filter(
    (stage) => stage.availability === "available"
  );

  const currentStage =
    model.currentStageId === null
      ? undefined
      : model.stages.find((stage) => stage.stageId === model.currentStageId);

  const visitedNodeIds = new Set(revealed.map((stage) => stage.atNodeId));

  const knownLinkIds = new Set(model.links.map((link) => link.linkId));

  // A traversed link is one a revealed stage NAMED. Nothing is inferred from
  // which devices happen to be adjacent.
  const traversedLinkIds = new Set<string>();

  for (const stage of revealed) {
    if (stage.viaLinkId === undefined) continue;

    // Fail loudly rather than highlighting nothing and looking correct.
    if (!knownLinkIds.has(stage.viaLinkId)) {
      return { state: "unavailable", reason: describeTopologyUnavailable() };
    }

    traversedLinkIds.add(stage.viaLinkId);
  }

  const currentLinkId = currentStage?.viaLinkId ?? null;

  /* --- rows --------------------------------------------------------- */

  // Only the bands that are actually occupied become rows, so a network with
  // no router does not draw an empty band where one would have been.
  const usedBands = [
    ...new Set(model.nodes.map((node) => bandOfRole(node.role)))
  ].sort((left, right) => left - right);

  const rowOfBand = new Map(usedBands.map((band, index) => [band, index]));
  const rowCount = usedBands.length;

  const rowOf = new Map(
    model.nodes.map((node) => [
      node.nodeId,
      rowOfBand.get(bandOfRole(node.role)) ?? 0
    ])
  );

  const authoredIndex = new Map(
    model.nodes.map((node, index) => [node.nodeId, index])
  );

  /* --- who is attached to whom, for placement only ------------------ */

  // Authored attachments, used to decide WHERE TO DRAW a box and for nothing
  // else. This is never walked to work out where traffic goes.
  const attachments = new Map<string, string[]>();
  for (const node of model.nodes) attachments.set(node.nodeId, []);

  for (const { from, to } of resolved) {
    if (from.nodeId === to.nodeId) continue;
    attachments.get(from.nodeId)?.push(to.nodeId);
    attachments.get(to.nodeId)?.push(from.nodeId);
  }

  const attachedIn = (nodeId: string, row: number): readonly string[] =>
    (attachments.get(nodeId) ?? []).filter(
      (other) => rowOf.get(other) === row
    );

  /* --- order within each row ---------------------------------------- */

  // Top row keeps authored order. Each row below is ordered by the average
  // position of what it is attached to in the row above, so devices sharing an
  // attachment end up side by side and their lines cannot cross.
  //
  // On top of that, devices in the SAME authored group are kept contiguous.
  // That is presentation acting on an authored fact — it changes where a card
  // is drawn and never which group it is in — and it is what lets a group's
  // boundary be a single tight rectangle rather than a shape with holes in it.
  const members: string[][] = Array.from({ length: rowCount }, () => []);
  for (const node of model.nodes) {
    members[rowOf.get(node.nodeId) ?? 0]?.push(node.nodeId);
  }

  const groupIdOf = new Map(
    model.nodes.map((node) => [node.nodeId, groupOf(node)])
  );

  // Ungrouped devices get -1, which no group can collide with, so a device the
  // author left out of every group can never be sorted INTO a group's block.
  const groupOrdinal = new Map(
    model.groups.map((group, index) => [group.groupId, index])
  );

  const ordinalOf = (nodeId: string): number => {
    const group = groupIdOf.get(nodeId) ?? null;
    return group === null ? -1 : (groupOrdinal.get(group) ?? -1);
  };

  const orderOf = new Map<string, number>();

  /**
   * Sort one row by (the group's average position, the group, this device's own
   * position, authored order).
   *
   * `own` is the row's own notion of where a device wants to be: authored index
   * in the top row, and the average position of what it is attached to above in
   * every row below.
   */
  function orderRow(row: number, own: (nodeId: string) => number): void {
    const inRow = members[row] ?? [];

    // A group's position is the average of its own members' positions in THIS
    // row. Members with nothing above them do not drag the average to infinity
    // while a sibling has a real position to offer.
    const groupPosition = new Map<string, number>();

    for (const group of model.groups) {
      const positions = inRow
        .filter((nodeId) => groupIdOf.get(nodeId) === group.groupId)
        .map(own)
        .filter((value) => Number.isFinite(value));

      if (positions.length === 0) continue;

      groupPosition.set(
        group.groupId,
        positions.reduce((total, value) => total + value, 0) / positions.length
      );
    }

    const blockKey = (nodeId: string): number => {
      const group = groupIdOf.get(nodeId) ?? null;
      if (group === null) return own(nodeId);
      return groupPosition.get(group) ?? own(nodeId);
    };

    const sorted = [...inRow].sort((left, right) => {
      const leftBlock = blockKey(left);
      const rightBlock = blockKey(right);
      if (leftBlock !== rightBlock) return leftBlock - rightBlock;

      // Same block position: keep whole groups together rather than letting an
      // ungrouped device land in the middle of one.
      const leftOrdinal = ordinalOf(left);
      const rightOrdinal = ordinalOf(right);
      if (leftOrdinal !== rightOrdinal) return leftOrdinal - rightOrdinal;

      const leftOwn = own(left);
      const rightOwn = own(right);
      if (leftOwn !== rightOwn) return leftOwn - rightOwn;

      // Equal on everything — including two devices with nothing above them —
      // falls through to authored order, so the picture is reproducible.
      return (authoredIndex.get(left) ?? 0) - (authoredIndex.get(right) ?? 0);
    });

    members[row] = sorted;
    sorted.forEach((nodeId, index) => orderOf.set(nodeId, index));
  }

  orderRow(0, (nodeId) => authoredIndex.get(nodeId) ?? 0);

  for (let row = 1; row < rowCount; row += 1) {
    orderRow(row, (nodeId) => {
      const parents = attachedIn(nodeId, row - 1).map(
        (other) => orderOf.get(other) ?? 0
      );

      return parents.length === 0
        ? Number.POSITIVE_INFINITY
        : parents.reduce((total, value) => total + value, 0) / parents.length;
    });
  }

  /* --- routed lanes and channels ------------------------------------ */

  // A link between neighbouring rows is a straight branch and needs nothing
  // reserved. Anything else is routed, and routing needs clear space that no
  // card may occupy.
  const laneCount = new Array<number>(rowCount).fill(0);
  const laneOf = new Map<string, number>();
  const channelOf = new Map<string, number>();
  let channels = 0;

  for (const { link, from, to } of resolved) {
    if (from.nodeId === to.nodeId) continue;

    const fromRow = rowOf.get(from.nodeId) ?? 0;
    const toRow = rowOf.get(to.nodeId) ?? 0;
    const span = Math.abs(fromRow - toRow);

    if (span === 1) continue;

    if (span === 0) {
      const lane = laneCount[fromRow] ?? 0;
      laneOf.set(link.linkId, lane);
      laneCount[fromRow] = lane + 1;
      continue;
    }

    const lane = Math.max(laneCount[fromRow] ?? 0, laneCount[toRow] ?? 0);
    laneOf.set(link.linkId, lane);
    laneCount[fromRow] = lane + 1;
    laneCount[toRow] = lane + 1;
    channelOf.set(link.linkId, channels);
    channels += 1;
  }

  /* --- card heights and row tops ------------------------------------ */

  const portsOf = new Map<string, readonly TopologyPort[]>();
  const contentHeightOf = new Map<string, number>();

  for (const node of model.nodes) {
    const ports: TopologyPort[] = node.interfaces.map((iface) => ({
      interfaceId: iface.interfaceId,
      label: iface.label,
      // Flagged by the source, copied in authored order. An unreported
      // attribute is omitted rather than rendered blank, which would read as
      // "no value set" — the same rule the full inspection follows.
      facts: iface.attributes.flatMap((attribute) =>
        attribute.prominent === true &&
        attribute.availability === "available" &&
        attribute.value !== null
          ? [{ label: attribute.label, value: attribute.value }]
          : []
      )
    }));

    portsOf.set(node.nodeId, ports);

    const factRows = ports.reduce(
      (total, port) => total + port.facts.length,
      0
    );

    contentHeightOf.set(
      node.nodeId,
      NODE_BASE_HEIGHT +
        (factRows === 0
          ? 0
          : NODE_FACTS_HEADER_HEIGHT + factRows * NODE_FACT_ROW_HEIGHT)
    );
  }

  // Every card in a row takes the height of the tallest one in it.
  //
  // Not tidiness: it is what makes the band between two rows genuinely empty.
  // With ragged heights, a branch line leaving a short card would pass through
  // the region a taller card beside it occupies, and a link would be drawn
  // through a device body — the exact defect Founder UAT rejected.
  const rowHeight = members.map((row) =>
    row.reduce(
      (tallest, nodeId) =>
        Math.max(tallest, contentHeightOf.get(nodeId) ?? NODE_BASE_HEIGHT),
      NODE_BASE_HEIGHT
    )
  );

  const rowTop: number[] = [];

  for (let row = 0; row < rowCount; row += 1) {
    if (row === 0) {
      // Headroom for anything routed above the top row.
      rowTop.push(CANVAS_PADDING + (laneCount[0] ?? 0) * LANE_STEP);
      continue;
    }

    const clearance = Math.max(
      ROW_GAP,
      (laneCount[row] ?? 0) * LANE_STEP + LANE_STEP + 4
    );

    rowTop.push(
      (rowTop[row - 1] ?? 0) + (rowHeight[row - 1] ?? 0) + clearance
    );
  }

  /* --- horizontal placement, from the bottom up --------------------- */

  const leftMostCentre = CANVAS_PADDING + NODE_WIDTH / 2;
  const centreX = new Map<string, number>();

  // How far apart two neighbouring cards must be, centre to centre. Cards in
  // the same authored group sit at the ordinary spacing; cards that are not
  // leave room for the boundaries that will be drawn between them. Two
  // ungrouped cards compare equal — neither has a boundary — and stay close.
  const pitchBetween = (left: string, right: string): number =>
    NODE_WIDTH +
    ((groupIdOf.get(left) ?? null) === (groupIdOf.get(right) ?? null)
      ? NODE_GAP
      : GROUP_GAP);

  (members[rowCount - 1] ?? []).forEach((nodeId, index, row) => {
    const previous = index === 0 ? undefined : row[index - 1];

    centreX.set(
      nodeId,
      previous === undefined
        ? leftMostCentre
        : (centreX.get(previous) ?? leftMostCentre) +
            pitchBetween(previous, nodeId)
    );
  });

  for (let row = rowCount - 2; row >= 0; row -= 1) {
    const inRow = members[row] ?? [];
    const placed: number[] = [];

    inRow.forEach((nodeId, index) => {
      const below = attachedIn(nodeId, row + 1).map(
        (other) => centreX.get(other) ?? leftMostCentre
      );

      const previous = index === 0 ? undefined : inRow[index - 1];

      const floor =
        previous === undefined
          ? leftMostCentre
          : (placed[index - 1] ?? leftMostCentre) +
            pitchBetween(previous, nodeId);

      // Centred over what it is attached to. A device with nothing below it
      // simply takes the next free slot, in order.
      const wanted =
        below.length === 0
          ? floor
          : below.reduce((total, value) => total + value, 0) / below.length;

      placed.push(Math.max(wanted, floor));
    });

    inRow.forEach((nodeId, index) => {
      centreX.set(nodeId, placed[index] ?? leftMostCentre);
    });
  }

  /* --- group boxes, and the room they need -------------------------- */

  // Geometry over authored membership, and strictly in that direction: the
  // members decide the rectangle, and the rectangle decides nothing.
  //
  // A group's boundary sits 20px clear of its members on three sides and 44px
  // above them, which leaves room for the caption. Both are smaller than
  // ROW_GAP, so a boundary can never reach into the row above or below and
  // enclose a device that is not a member.
  interface GroupBounds {
    readonly groupId: string;
    readonly label: string;
    readonly nodeIds: readonly string[];
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  }

  const boundsOfGroups: GroupBounds[] = model.groups.flatMap((group) => {
    const nodeIds = model.nodes
      .filter((node) => groupOf(node) === group.groupId)
      .map((node) => node.nodeId);

    // Declared but empty. There is nothing to enclose, so nothing is drawn —
    // an empty boundary would assert a grouping with no members in it.
    if (nodeIds.length === 0) return [];

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const nodeId of nodeIds) {
      const row = rowOf.get(nodeId) ?? 0;
      const centre = centreX.get(nodeId) ?? leftMostCentre;
      const height = rowHeight[row] ?? NODE_BASE_HEIGHT;

      left = Math.min(left, centre - NODE_WIDTH / 2);
      right = Math.max(right, centre + NODE_WIDTH / 2);
      top = Math.min(top, rowTop[row] ?? CANVAS_PADDING);
      bottom = Math.max(bottom, (rowTop[row] ?? CANVAS_PADDING) + height);
    }

    return [
      {
        groupId: group.groupId,
        label: group.label,
        nodeIds,
        left: left - GROUP_PADDING,
        top: top - GROUP_PADDING - GROUP_LABEL_HEIGHT,
        right: right + GROUP_PADDING,
        bottom: bottom + GROUP_PADDING
      }
    ];
  });

  // A boundary that reaches outside the canvas would be clipped, so the whole
  // drawing slides to make room for it.
  //
  // Applied to the row tops and the column centres themselves rather than at
  // each use, so every coordinate downstream — cards, anchors, lanes, the
  // marker, the frame — is already in the shifted space and no caller has to
  // remember to add it.
  const shiftX = Math.max(
    0,
    ...boundsOfGroups.map((bounds) => CANVAS_PADDING - bounds.left)
  );
  const shiftY = Math.max(
    0,
    ...boundsOfGroups.map((bounds) => CANVAS_PADDING - bounds.top)
  );

  if (shiftX !== 0 || shiftY !== 0) {
    for (let row = 0; row < rowCount; row += 1) {
      rowTop[row] = (rowTop[row] ?? CANVAS_PADDING) + shiftY;
    }
    for (const [nodeId, centre] of [...centreX]) {
      centreX.set(nodeId, centre + shiftX);
    }
  }

  const groups: TopologyGroup[] = boundsOfGroups.map((bounds) => {
    const box: TopologyBox = {
      x: round(bounds.left + shiftX),
      y: round(bounds.top + shiftY),
      width: round(bounds.right - bounds.left),
      height: round(bounds.bottom - bounds.top)
    };

    return {
      groupId: bounds.groupId,
      label: bounds.label,
      nodeIds: bounds.nodeIds,
      box,
      labelAt: {
        x: round(box.x + GROUP_PADDING),
        y: round(box.y + GROUP_LABEL_HEIGHT / 2)
      }
    };
  });

  /* --- devices ------------------------------------------------------ */

  const consequence = model.consequence;

  const boxOf = new Map<string, TopologyBox>();

  const devices: TopologyDevice[] = model.nodes.map((node) => {
    const row = rowOf.get(node.nodeId) ?? 0;

    const box: TopologyBox = {
      x: round((centreX.get(node.nodeId) ?? leftMostCentre) - NODE_WIDTH / 2),
      y: round(rowTop[row] ?? CANVAS_PADDING),
      width: NODE_WIDTH,
      height: round(rowHeight[row] ?? NODE_BASE_HEIGHT)
    };

    boxOf.set(node.nodeId, box);

    const state = resolveDeviceState(
      node.nodeId,
      currentStage?.atNodeId,
      visitedNodeIds,
      currentStage?.outcome === "stops",
      consequence?.state === "confirmed"
    );

    return {
      nodeId: node.nodeId,
      label: node.label,
      role: node.role,
      roleLabel: describeTopologyRole(node.role),
      // Copied straight from the author's field. Not from the box, not from
      // what the device is attached to, not from where it happened to land.
      groupId: groupOf(node),
      row,
      order: orderOf.get(node.nodeId) ?? 0,
      box,
      state,
      stateLabel: describeDeviceState(state),
      ports: portsOf.get(node.nodeId) ?? []
    };
  });

  /*
    A boundary must enclose its members and nobody else.

    Row spacing guarantees a group cannot reach into a neighbouring row, and
    contiguous ordering keeps its members together within a row — but a group
    spanning several rows of different widths could still, in principle, have
    its rectangle fall across a device that is not a member.

    If that ever happens the drawing REFUSES, in the same way it refuses a
    dangling link endpoint. The alternative is a boundary that silently claims
    a device belongs to a group the author did not put it in, which is a
    networking falsehood drawn in a picture — the exact failure the authored
    contract exists to prevent, arriving by a different door.
  */
  for (const group of groups) {
    for (const device of devices) {
      if (device.groupId === group.groupId) continue;

      const overlaps =
        device.box.x < group.box.x + group.box.width &&
        group.box.x < device.box.x + device.box.width &&
        device.box.y < group.box.y + group.box.height &&
        group.box.y < device.box.y + device.box.height;

      if (overlaps) {
        return { state: "unavailable", reason: describeTopologyUnavailable() };
      }
    }
  }

  const drawnRight = Math.max(
    devices.reduce(
      (widest, device) => Math.max(widest, device.box.x + device.box.width),
      0
    ),
    groups.reduce(
      (widest, group) => Math.max(widest, group.box.x + group.box.width),
      0
    )
  );

  // Routed channels sit beyond the boundaries too, so a bypass wire is never
  // drawn across a group it has nothing to do with.
  const nodeRight = drawnRight;

  const channelX = (index: number): number =>
    nodeRight + CANVAS_PADDING + index * CHANNEL_STEP;

  /* --- anchors ------------------------------------------------------ */

  // Every wire touching a device gets its OWN point on that device's edge.
  //
  // This is the second half of the overlap correction. Three host links all
  // meeting a switch at one point is what made the previous drawing impossible
  // to trace; fanned across the edge, in the order the far ends sit, they read
  // as three separate attachments and they cannot cross each other.
  interface AnchorRequest {
    readonly linkId: string;
    readonly nodeId: string;
    readonly edge: "top" | "bottom";
    /** Sorts the fan. The far end's horizontal position, or a channel's. */
    readonly towards: number;
  }

  const requests: AnchorRequest[] = [];

  for (const { link, from, to } of resolved) {
    if (from.nodeId === to.nodeId) continue;

    const fromRow = rowOf.get(from.nodeId) ?? 0;
    const toRow = rowOf.get(to.nodeId) ?? 0;
    const fromCentre = centreX.get(from.nodeId) ?? 0;
    const toCentre = centreX.get(to.nodeId) ?? 0;

    if (fromRow === toRow) {
      // Peer links leave upwards, into the band above their own row.
      requests.push({
        linkId: link.linkId,
        nodeId: from.nodeId,
        edge: "top",
        towards: toCentre
      });
      requests.push({
        linkId: link.linkId,
        nodeId: to.nodeId,
        edge: "top",
        towards: fromCentre
      });
      continue;
    }

    const channel = channelOf.get(link.linkId);

    if (channel !== undefined) {
      // Bypass links leave upwards too, then run out to a side channel — so
      // their anchors sort to the right-hand end of the fan.
      const towards = channelX(channel);
      requests.push({
        linkId: link.linkId,
        nodeId: from.nodeId,
        edge: "top",
        towards
      });
      requests.push({
        linkId: link.linkId,
        nodeId: to.nodeId,
        edge: "top",
        towards
      });
      continue;
    }

    const upper = fromRow < toRow ? from.nodeId : to.nodeId;
    const lower = fromRow < toRow ? to.nodeId : from.nodeId;

    requests.push({
      linkId: link.linkId,
      nodeId: upper,
      edge: "bottom",
      towards: upper === from.nodeId ? toCentre : fromCentre
    });
    requests.push({
      linkId: link.linkId,
      nodeId: lower,
      edge: "top",
      towards: lower === from.nodeId ? toCentre : fromCentre
    });
  }

  const anchorOf = new Map<string, TopologyPoint>();
  const anchorKey = (linkId: string, nodeId: string): string =>
    `${linkId} ${nodeId}`;

  for (const device of devices) {
    for (const edge of ["top", "bottom"] as const) {
      const onEdge = requests
        .filter(
          (request) =>
            request.nodeId === device.nodeId && request.edge === edge
        )
        .sort((left, right) => left.towards - right.towards);

      onEdge.forEach((request, index) => {
        anchorOf.set(anchorKey(request.linkId, request.nodeId), {
          x: round(
            device.box.x + (device.box.width * (index + 1)) / (onEdge.length + 1)
          ),
          y: round(
            edge === "top" ? device.box.y : device.box.y + device.box.height
          )
        });
      });
    }
  }

  /* --- links -------------------------------------------------------- */

  const laneY = (row: number, lane: number): number =>
    round((rowTop[row] ?? CANVAS_PADDING) - (lane + 1) * LANE_STEP);

  const links: TopologyLink[] = resolved.map(({ link, from, to }) => {
    const fromRow = rowOf.get(from.nodeId) ?? 0;
    const toRow = rowOf.get(to.nodeId) ?? 0;

    const fromAnchor = anchorOf.get(anchorKey(link.linkId, from.nodeId));
    const toAnchor = anchorOf.get(anchorKey(link.linkId, to.nodeId));

    let shape: TopologyLinkShape = "branch";
    let points: TopologyPoint[];

    if (
      from.nodeId === to.nodeId ||
      fromAnchor === undefined ||
      toAnchor === undefined
    ) {
      // A link whose two ends are the same device. It joins nothing to
      // anything, so it is drawn as a short mark beside the card rather than
      // as a wire that appears to reach somewhere it does not.
      const box = boxOf.get(from.nodeId);
      const anchorX = (box?.x ?? 0) + (box?.width ?? NODE_WIDTH);
      const anchorY = (box?.y ?? 0) + (box?.height ?? NODE_BASE_HEIGHT) / 2;

      shape = "peer";
      points = [
        { x: round(anchorX), y: round(anchorY) },
        { x: round(anchorX + LANE_STEP), y: round(anchorY) }
      ];
    } else if (fromRow === toRow) {
      shape = "peer";
      const lane = laneOf.get(link.linkId) ?? 0;
      const y = laneY(fromRow, lane);

      points = [
        fromAnchor,
        { x: fromAnchor.x, y },
        { x: toAnchor.x, y },
        toAnchor
      ];
    } else if (Math.abs(fromRow - toRow) === 1) {
      shape = "branch";
      points = [fromAnchor, toAnchor];
    } else {
      shape = "bypass";
      const lane = laneOf.get(link.linkId) ?? 0;
      const x = round(channelX(channelOf.get(link.linkId) ?? 0));
      const fromLane = laneY(fromRow, lane);
      const toLane = laneY(toRow, lane);

      points = [
        fromAnchor,
        { x: fromAnchor.x, y: fromLane },
        { x, y: fromLane },
        { x, y: toLane },
        { x: toAnchor.x, y: toLane },
        toAnchor
      ];
    }

    return {
      linkId: link.linkId,
      label: link.label,
      from: {
        nodeId: from.nodeId,
        nodeLabel: from.nodeLabel,
        interfaceId: link.endpoints[0],
        interfaceLabel: from.interfaceLabel
      },
      to: {
        nodeId: to.nodeId,
        nodeLabel: to.nodeLabel,
        interfaceId: link.endpoints[1],
        interfaceLabel: to.interfaceLabel
      },
      endpointSummary: `${from.nodeLabel} ${from.interfaceLabel} to ${to.nodeLabel} ${to.interfaceLabel}`,
      shape,
      points,
      path: pointsToPath(points),
      traversed: traversedLinkIds.has(link.linkId),
      current: currentLinkId === link.linkId
    };
  });

  /* --- the packet --------------------------------------------------- */

  const packet = resolvePacket(
    currentStage?.atNodeId ?? originNodeId,
    currentStage === undefined ? null : currentLinkId,
    links,
    boxOf,
    currentStage === undefined,
    currentStage?.outcome === "stops",
    consequence?.state === "confirmed"
  );

  /* --- the canvas --------------------------------------------------- */

  const lastRow = rowCount - 1;
  const contentBottom = Math.max(
    (rowTop[lastRow] ?? CANVAS_PADDING) + (rowHeight[lastRow] ?? 0),
    ...groups.map((group) => group.box.y + group.box.height)
  );

  const frame: TopologyFrame = {
    width: round(
      Math.max(
        drawnRight + CANVAS_PADDING,
        channels === 0 ? 0 : channelX(channels - 1) + CANVAS_PADDING
      )
    ),
    height: round(
      Math.max(
        contentBottom + CANVAS_PADDING,
        packet === null ? 0 : packet.at.y + CANVAS_PADDING
      )
    )
  };

  return {
    state: "available",
    frame,
    rows: rowCount,
    groups,
    devices,
    links,
    packet,
    description: describeTopologyArrangement(devices, links, rowCount, groups)
  };
}

/**
 * Which presentation state one device is in.
 *
 * Reads observations only: where the current stage is, which nodes revealed
 * stages named, whether the authored outcome at the current stage stops, and
 * whether the consequence is confirmed. Every one of those is a field.
 */
function resolveDeviceState(
  nodeId: string,
  currentNodeId: string | undefined,
  visitedNodeIds: ReadonlySet<string>,
  stopped: boolean,
  confirmed: boolean
): TopologyDeviceState {
  if (nodeId === currentNodeId) {
    if (confirmed) return "confirmed";
    if (stopped) return "stopped";
    return "current";
  }

  return visitedNodeIds.has(nodeId) ? "visited" : "idle";
}

/**
 * Where the traffic marker is drawn.
 *
 * The Founder UAT defect: the marker sat on top of the device card and covered
 * the text inside it. A marker is information IN TRANSIT, so it belongs on a
 * link, clear of the cards at both ends. Which device currently holds the
 * traffic is a different claim, carried by that device's own state and its own
 * caption, and the two must not be collapsed into one dot.
 *
 * The link it rides is the one the SOURCE named. When no link was named — at
 * the origin, before anything has been sent — the marker waits just outside the
 * originating device, on the first link authored against it. Nothing here
 * searches for a plausible link between two devices; a device with no authored
 * link at all simply has the marker parked below it.
 */
function resolvePacket(
  nodeId: string | null | undefined,
  linkId: string | null,
  links: readonly TopologyLink[],
  boxOf: ReadonlyMap<string, TopologyBox>,
  waiting: boolean,
  stopped: boolean,
  confirmed: boolean
): TopologyPacket | null {
  if (nodeId === null || nodeId === undefined) return null;

  const box = boxOf.get(nodeId);
  if (box === undefined) return null;

  const state: TopologyPacket["state"] = waiting
    ? "waiting"
    : confirmed
      ? "confirmed"
      : stopped
        ? "stopped"
        : "moving";

  const named =
    linkId === null
      ? undefined
      : links.find((candidate) => candidate.linkId === linkId);

  const ride =
    named ??
    links.find(
      (candidate) =>
        candidate.from.nodeId === nodeId || candidate.to.nodeId === nodeId
    );

  if (ride === undefined) {
    // No authored attachment to sit beside. Below the card, and still outside
    // it — never over the name, the category or the state.
    return {
      nodeId,
      state,
      stateLabel: describePacketState(state),
      at: {
        x: round(box.x + box.width / 2),
        y: round(box.y + box.height + MARKER_CLEARANCE)
      },
      linkId: null
    };
  }

  // Walk in from the end that touches this device, so the marker is always on
  // the near side of the wire — leaving the origin, or arriving at the device
  // that has it now.
  const ordered =
    ride.to.nodeId === nodeId ? [...ride.points].reverse() : [...ride.points];

  return {
    nodeId,
    state,
    stateLabel: describePacketState(state),
    at: pointClearOfBox(ordered, box, MARKER_CLEARANCE),
    linkId: ride.linkId
  };
}

/**
 * The first point along a polyline that is at least `clearance` away from the
 * box it starts at, sampled at one-unit steps and capped at the halfway mark.
 *
 * Capped so a marker can never overshoot past the middle of a wire and appear
 * to belong to the device at the other end.
 */
function pointClearOfBox(
  points: readonly TopologyPoint[],
  box: TopologyBox,
  clearance: number
): TopologyPoint {
  const segments: { from: TopologyPoint; to: TopologyPoint; length: number }[] =
    [];

  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;

    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, length });
    total += length;
  }

  if (total === 0) {
    return {
      x: round(box.x + box.width / 2),
      y: round(box.y + box.height + clearance)
    };
  }

  const limit = total / 2;
  let behind = 0;
  let furthest = points[0] ?? { x: 0, y: 0 };

  for (const segment of segments) {
    for (let step = 1; step <= Math.ceil(segment.length); step += 1) {
      const along = Math.min(step, segment.length);
      const travelled = behind + along;

      const ratio = segment.length === 0 ? 1 : along / segment.length;

      furthest = {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio
      };

      if (
        distanceToBox(furthest, box) >= clearance ||
        travelled >= limit
      ) {
        return { x: round(furthest.x), y: round(furthest.y) };
      }
    }

    behind += segment.length;
  }

  return { x: round(furthest.x), y: round(furthest.y) };
}

/* ------------------------------------------------------------------ *
 * Reading the layout back
 * ------------------------------------------------------------------ */

/**
 * The links touching one device.
 *
 * Used by the inspector so selecting a device shows what it is attached to,
 * rather than making a learner scan the whole connection list. A filter over
 * already-resolved endpoints — it walks nothing and decides nothing.
 */
export function connectionsForDevice(
  links: readonly TopologyLink[],
  nodeId: string
): readonly TopologyLink[] {
  return links.filter(
    (link) => link.from.nodeId === nodeId || link.to.nodeId === nodeId
  );
}

/**
 * How one device's own end of a link reads, from that device's point of view.
 *
 * "Fa0/1 to PC-A eth0" rather than the neutral both-ends summary, because a
 * learner inspecting Switch-1 is asking what leaves Switch-1.
 */
export function describeConnectionFrom(
  link: TopologyLink,
  nodeId: string
): string {
  const near = link.from.nodeId === nodeId ? link.from : link.to;
  const far = link.from.nodeId === nodeId ? link.to : link.from;

  return `${near.interfaceLabel} to ${far.nodeLabel} ${far.interfaceLabel}`;
}
