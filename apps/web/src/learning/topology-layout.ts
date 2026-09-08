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
 * browser test harness — no Playwright, no testing-library — and
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

/* ------------------------------------------------------------------ *
 * WHY A FACE FACT IS TWO LINES
 *
 * It used to be one: an interface chip, then the label, then the value, all on
 * a 19px line inside a 156px card. Nothing of that width fits. Founder UAT read
 * the result off the screen — "Network interface I…", "Network interface Ha…" —
 * and it is the worst possible failure for instructional content, because the
 * learner cannot tell that anything was withheld, let alone what.
 *
 * The card did not get wider and the type did not get smaller. The line got
 * shorter: the interface name is now a heading over the facts that belong to
 * it, and each fact puts its LABEL on one line and its VALUE on the next.
 * Every one of those strings fits the card with room to spare, which
 * `faceTextFits` asserts rather than assumes.
 *
 * Ellipsis is gone from the fact rows entirely. A fact that does not fit is a
 * fact that must not be on the face — the authoring boundary, not a rendering
 * trick. `verify-wpi.sh` pins the absence of `text-overflow` on those rows.
 * ------------------------------------------------------------------ */

/** The label line of one authored fact. */
export const NODE_FACT_LABEL_HEIGHT = 12;

/** The value line of one authored fact. */
export const NODE_FACT_VALUE_HEIGHT = 16;

/** One authored display fact on the face: its label, then its value. */
export const NODE_FACT_ROW_HEIGHT =
  NODE_FACT_LABEL_HEIGHT + NODE_FACT_VALUE_HEIGHT;

/**
 * The interface name over the facts that belong to it.
 *
 * Present only when a card carries facts from MORE THAN ONE interface. On a
 * host with a single interface it is a heading over the only group there is,
 * and Founder UAT is explicit that a card must prefer a few high-value facts
 * over many compressed ones.
 *
 * On Router-1 it is the point of the card. The mission reasons about two
 * router interfaces on two different networks, and without this heading the
 * learner cannot tell which address belongs to which side without opening the
 * full text account.
 */
export const NODE_INTERFACE_HEADING_HEIGHT = 13;

/* ------------------------------------------------------------------ *
 * DOES IT FIT?
 *
 * No browser runs in this repository, so "fits" has to be a computation the
 * tests can make. This is a deliberately CONSERVATIVE model: a ratio of glyph
 * width to font size chosen above the real average for the UI stack, so a
 * string this function accepts has margin at every size that ships.
 *
 * It is not a text metric and does not pretend to be. It is a budget, and its
 * job is to fail loudly in a test when authored content grows past what the
 * card can show — the failure Founder UAT had to catch by reading a screen.
 * ------------------------------------------------------------------ */

/** Conservative glyph width as a fraction of font size, for the UI stack. */
export const FACE_GLYPH_RATIO = 0.58;

/** Horizontal padding inside a card, both sides together. */
export const NODE_FACE_PADDING = 20;

/** The width a face line actually has to live in. */
export const NODE_FACE_CONTENT_WIDTH = NODE_WIDTH - NODE_FACE_PADDING;

/** Font size of an interface heading on the face, in px. Mirrors the CSS. */
export const FACE_INTERFACE_FONT_PX = 9.92;

/** Font size of a fact label on the face, in px. Mirrors the CSS. */
export const FACE_LABEL_FONT_PX = 9.92;

/** Font size of a fact value on the face, in px. Mirrors the CSS. */
export const FACE_VALUE_FONT_PX = 11.52;

/** The width this text would need on a card face, under the budget model. */
export function faceTextWidth(text: string, fontPx: number): number {
  return text.length * fontPx * FACE_GLYPH_RATIO;
}

/** Whether this text can be shown in full on a card face. */
export function faceTextFits(text: string, fontPx: number): boolean {
  return faceTextWidth(text, fontPx) <= NODE_FACE_CONTENT_WIDTH;
}

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

/**
 * The plate drawn for a network that continues past the edge of the drawing
 * (WP-NF-NT1B).
 *
 * Deliberately smaller and shorter than a device card. It is not equipment and
 * must not read as another box of the same kind: it carries a label and
 * nothing else — no category word, no interfaces, no facts, no state.
 */
export const EXTERNAL_NETWORK_WIDTH = 150;
export const EXTERNAL_NETWORK_HEIGHT = 40;

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
 * The tallest a drawing may be in the workspace column.
 *
 * Raised from 470 by the Founder layout repair, and the old number was not
 * wrong when it was set: the task used to sit BELOW the topology, so every
 * pixel the drawing took was a pixel the current action lost, and 470 was what
 * left room for both.
 *
 * The single-focus split moved the task BESIDE the network. Nothing competes
 * for vertical space in that column any more, so the old ceiling was doing
 * nothing but shrinking the picture — Missions 4, 6 and 8 were scaled to 0.86
 * on height alone while 15% of their column sat empty.
 *
 * This is the "allow controlled vertical growth" strategy rather than
 * "shrink until it fits": the drawing may be taller, because being taller no
 * longer costs the learner anything.
 */
export const TOPOLOGY_HEIGHT_BUDGET = 620;

/**
 * The smallest the drawing may be scaled before it stops being readable.
 *
 * Port labels are the smallest text in the picture at 0.66rem — about 10.5px.
 * At 0.82 that becomes ~8.7px: small, and still legible.
 *
 * Raised from 0.72 by Founder UAT. The lower floor was reachable, and being
 * reachable was the problem — the layout was solving "everything must
 * mathematically fit" by shrinking until the device names and port labels
 * stopped being comfortable to read. Containment was achieved and the picture
 * was useless.
 *
 * The floor is now high enough that hitting it means the WORKSPACE is too
 * narrow, not that the drawing is too big. That is a layout problem and it is
 * fixed in the layout: the interactive workspace escapes the reading column at
 * 64em, and the network takes the larger share of it. Below the floor the
 * drawing scrolls rather than shrinking further, because a picture nobody can
 * read is not a smaller picture, it is a broken one.
 */
export const TOPOLOGY_MIN_SCALE = 0.82;

/**
 * The width each workspace column actually gets, at a viewport width.
 *
 * ## Why this exists, and what it is not
 *
 * It is a MODEL of the layout in `styles.css`, not a second implementation of
 * it. Nothing renders from it. It exists because this repository has no
 * browser harness, and the Founder UAT defect — a topology squeezed into a
 * fraction of the screen and then scaled past readability — is a geometry
 * failure that no test could otherwise see.
 *
 * It mirrors three CSS facts, and `verify-wpi.sh` pins each of them in the
 * stylesheet so the model cannot drift away from what actually renders:
 *
 *   - the interactive workspace escapes the reading column at 64em, up to
 *     1240px, so a lesson-reading width never decides how big the network is;
 *   - the columns are network-dominant — about 1.62fr to 1fr embedded, 1.7fr
 *     to 1fr expanded;
 *   - the expanded workspace is the viewport, less its own padding.
 */
export interface WorkspaceColumns {
  readonly total: number;
  readonly network: number;
  readonly instructor: number;
}

export function describeWorkspaceColumns(
  viewportWidth: number,
  mode: "embedded" | "expanded" = "embedded"
): WorkspaceColumns {
  const rootFontSize = 16;

  // Below the breakout the workspace is still the reading column: `.card` is
  // min(760px, 100%) with up to 3rem of padding on each side.
  if (viewportWidth < 64 * rootFontSize) {
    const card = Math.min(760, viewportWidth);
    const total = Math.max(0, card - 2 * 48);
    // One column below the breakout, so the network gets all of it.
    return { total, network: total, instructor: 0 };
  }

  const gap = mode === "expanded" ? 2.5 * rootFontSize : 2.25 * rootFontSize;

  const total =
    mode === "expanded"
      ? viewportWidth - 2 * Math.min(2.5 * rootFontSize, 0.04 * viewportWidth)
      : Math.min(1240, viewportWidth - 3 * rootFontSize);

  const share = mode === "expanded" ? 1.7 : 1.62;
  const usable = Math.max(0, total - gap);

  const network = (usable * share) / (share + 1);

  return { total, network, instructor: usable - network };
}

/**
 * How much to scale the drawing so it fits the space it is given.
 *
 * ## Why this exists
 *
 * The earlier ruling was that cards never shrink and a drawing wider than the
 * column scrolls sideways inside its own box. Founder UAT overruled it: the
 * far network was off the right-hand edge of Missions 4, 6 and 8, and the
 * reviewer was reconstructing the topology from memory instead of reasoning
 * about it.
 *
 * The budgets were not wrong, and they are still asserted. What was missing was
 * what to do when a drawing exceeds them — the previous answer was "scroll",
 * which is the defect. This is the deliberate responsive strategy that replaces
 * it: scale the whole drawing down, uniformly, to a floor, and scroll only
 * below that floor.
 *
 * ## Why it is a pure function
 *
 * The same reason everything else here is: it can then be asserted over the
 * real authored journeys without a browser. `TopologyView` measures the
 * available width and applies the result; it decides nothing.
 *
 * Scaling is uniform, so no relationship in the picture changes — the drawing
 * is the same drawing, further away. It carries no networking meaning and
 * cannot: it is one number derived from two box sizes.
 */
export function fitTopologyScale(
  frame: TopologyFrame,
  availableWidth: number,
  availableHeight: number = TOPOLOGY_HEIGHT_BUDGET
): number {
  if (frame.width <= 0 || frame.height <= 0) return 1;
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;

  const byWidth = availableWidth / frame.width;
  const byHeight =
    Number.isFinite(availableHeight) && availableHeight > 0
      ? availableHeight / frame.height
      : 1;

  const wanted = Math.min(byWidth, byHeight);

  // Never magnify: a small drawing stays its authored size rather than being
  // stretched to fill a wide screen.
  if (wanted >= 1) return 1;

  return Math.max(TOPOLOGY_MIN_SCALE, wanted);
}

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
  | "participating"
  | "origin"
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
  /**
   * The author flagged this end to be named on the picture.
   *
   * Carried here as well as in `portLabels` because the two answer different
   * questions: `portLabels` says WHERE the text is drawn, and this says
   * whether the arrangement description should name the port in words. Both
   * read the same authored flag, so the picture and the spoken description
   * cannot disagree about which ports a learner has been told about.
   */
  readonly prominent: boolean;
}

/**
 * An authored interface label, placed on the picture beside its connection.
 *
 * Founder UAT: a learner should not have to open the inspector to find out
 * which port a device is plugged into, because the instruction says things
 * like "Switch-1 learned PC-A is on Port 1" and that sentence is about
 * nothing visible unless the picture names the port.
 *
 * One of these exists for each END the AUTHOR flagged `prominent`. Nothing
 * here chooses ends, and nothing invents a name: `text` is the authored
 * interface label, unchanged.
 *
 * `at` is beside the wire rather than on it. A marker rides the wire, and a
 * label sitting in the same place would be covered by the traffic exactly
 * when the learner most wants to read it.
 */
export interface TopologyPortLabel {
  readonly linkId: string;
  readonly nodeId: string;
  readonly interfaceId: string;
  /** The authored interface label, e.g. "Port 1". */
  readonly text: string;
  readonly at: TopologyPoint;
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
 * One interface's worth of the card face, ready to render.
 *
 * The renderer draws exactly this and computes none of it, because the LAYOUT
 * sized the card from exactly this. Before, the renderer flattened ports into
 * rows on its own and the layout counted facts on its own; the two agreed only
 * because both were simple. They are no longer simple, and a card whose face
 * disagreed with its box would be drawn across the wires below it.
 *
 * `heading` is null when the card carries facts from only one interface — a
 * host's single "Network interface" heading is a line of the card spent saying
 * something the learner can already see.
 */
export interface TopologyFaceGroup {
  readonly interfaceId: string;
  readonly heading: string | null;
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
  /**
   * The card face, in render order, sized to the box above.
   *
   * `ports` remains the authored structure; this is what the face shows.
   */
  readonly face: readonly TopologyFaceGroup[];
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

/**
 * A network past the edge of the drawing, and the wire reaching it.
 *
 * Held apart from `devices` and `links` on purpose. Everything that reasons
 * about traffic — traversal, the packet marker, journey state, the device
 * inspector — iterates those two lists, and an external network belongs in
 * none of it. Keeping it in its own list means "traffic can never be drawn as
 * arriving here" is a property of the type rather than a rule somebody has to
 * remember.
 */
export interface TopologyExternalNetwork {
  readonly networkId: string;
  readonly label: string;
  /** The device the drawing reaches it through. */
  readonly attachedToNodeId: string;
  readonly box: TopologyBox;
  /**
   * The wire between the attached device and this plate, as an SVG path.
   *
   * A plain line with no `traversed`, no `current` and no direction, because
   * there is no traffic on it and never can be.
   */
  readonly path: string;
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
  /**
   * The wire to travel, exactly as the link is drawn.
   *
   * This is the SAME string the SVG uses for that link's `d`, copied rather
   * than rebuilt. Founder UAT, third round: "the animation must use the SAME
   * rendered path geometry as the link. One source of geometry. No separately
   * guessed animation coordinates." Copying it here is what makes that literal
   * — a renderer that animated between node centres would have to invent
   * coordinates this field already forbids.
   *
   * `null` when the marker is parked beside a device rather than riding a
   * wire, which is the origin state and the fault stop.
   */
  readonly path: string | null;
  /**
   * Which way along `path` the traffic travels.
   *
   * `true` runs from the path's first point to its last; `false` runs back.
   * Decided from AUTHORED fields only — the stage's own node, and whether the
   * link was named as the one traffic arrived on (`viaLinkId`) or as one it
   * left on (`alsoOnLinkIds`). Nothing reads the picture to work out a
   * direction, and nothing reverses a path because a later stage looked like a
   * return trip.
   */
  readonly travelsToEnd: boolean;
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
      /**
       * The traffic markers, one per link the authored stage says is carrying
       * something at this moment.
       *
       * Usually one, and empty only when the topology could place none. It is
       * a list because an authored stage may name several links occupied at
       * the same moment — which is how one switch action producing copies is
       * drawn as one event rather than as a queue of arrivals.
       */
      readonly packets: readonly TopologyPacket[];
      /**
       * Networks the author declared past the edge of the drawing.
       *
       * Empty unless the source reported one, which is every packet journey.
       */
      readonly externalNetworks: readonly TopologyExternalNetwork[];
      /**
       * Authored interface labels drawn beside their connections.
       *
       * Empty unless an author flagged an interface `prominent`, which is
       * every interaction written before that flag existed.
       */
      readonly portLabels: readonly TopologyPortLabel[];
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
  /*
    Founder video UAT: PC-A was captioned "Arrived here" on the stage where the
    print request LEAVES it. Traffic does not arrive at its own source.

    `origin` is the leg-aware answer: a stage the traffic reached without
    crossing a link is a stage where it started. That is a fact about the
    CURRENT leg, not about the node — Mission 6's reply arrives back at PC-A
    across a real link, so PC-A is a normal arrival there.
  */
  if (state === "origin") return "Started here";
  if (state === "current") return "Arrived here";
  if (state === "stopped") return "Stopped here";
  if (state === "confirmed") return "Delivered here";
  /*
    A device an author named as part of the moment on screen, and which is not
    where the traffic is anchored.

    Founder UAT ruling. "Passed through" is a claim about transit, and a
    device that received a simultaneous copy did not necessarily pass anything
    on — the printer in Mission 2 received one and did nothing with it. This
    card and the inspector's status line describe the same node at the same
    moment, so they say the same thing.

    It reverts to "Passed through" once the moment has moved on, because
    participation is a statement about the step being observed.
  */
  if (state === "participating") return "Participating in this step";
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
  groups: readonly TopologyGroup[],
  externalNetworks: readonly TopologyExternalNetwork[] = []
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
    /*
      Each connection, naming any end the author flagged.

      A port drawn on the picture has to be said in words too, or the diagram
      carries a fact the spoken description does not — which is exactly the
      gap a learner using a screen reader would fall into when the instruction
      says "Switch-1 learned PC-A is on Port 1".

      Only flagged ends are named, so this stays as short as the picture is.
    */
    const named = (end: TopologyEndpoint): string =>
      end.prominent ? `${end.nodeLabel} ${end.interfaceLabel}` : end.nodeLabel;

    sentences.push(
      `A line is drawn between ${joinWithSemicolons(
        links.map((link) => `${named(link.from)} and ${named(link.to)}`)
      )}.`
    );
  }

  /*
    A network past the edge of the drawing (WP-NF-NT1B).

    Last, and stated as its own relationship rather than folded into the line
    list above: it is not a connection between two devices, and describing it
    as one would tell a screen-reader user there is a second device called
    "Another network".

    This sentence is what makes the picture and the spoken description carry
    the same four relationships. Mission 1's near-transfer asks which device
    reaches another network, and if this were missing the diagram would answer
    a question the description could not.
  */
  for (const network of externalNetworks) {
    const device = devices.find(
      (candidate) => candidate.nodeId === network.attachedToNodeId
    );
    if (device === undefined) continue;

    sentences.push(
      `${device.label} also has a line to ${network.label}, drawn above it at the edge of the diagram.`
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
  readonly prominent: boolean;
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
/**
 * One authored stage, as much of it as the delivery rule reads.
 *
 * Structural rather than a named type: the observation model's stage and the
 * learner's projected stage both satisfy it, and the rule must give both the
 * same answer or the picture and the inspector would disagree.
 */
export interface DeliveryScopedStage {
  readonly viaLinkId?: string;
  readonly traffic?: {
    readonly label: string;
    readonly sourceNodeId: string;
    readonly destinationNodeId: string;
  };
}

/** What is moving at one stage, as a comparable value. */
function movingKey(stage: DeliveryScopedStage): string {
  return stage.traffic === undefined
    ? "journey"
    : [
        stage.traffic.label,
        stage.traffic.sourceNodeId,
        stage.traffic.destinationNodeId
      ].join("|");
}

/**
 * Where the delivery currently on screen began, as an index into the revealed
 * stages. `0` means the journey has sent one thing, which is every authored
 * journey in the course except Mission 2's.
 *
 * Founder UAT, Mission 2 step 6 of 8: PC-A sends a SECOND local delivery, and
 * the picture showed Switch-1, PC-B and the Printer all captioned "Passed
 * through" before the new delivery had reached any of them. The Printer never
 * receives this one at all — that absence is the whole point of the mission —
 * and it was drawn as though it already had.
 *
 * The origin was already leg-aware; the history was not. `legOriginNodeId`
 * correctly moved to PC-A at d6, so the picture said "Started here" on one card
 * and described the previous delivery on the other three.
 *
 * A delivery begins where BOTH authored conditions hold at once:
 *
 *   the traffic crossed no link to arrive   `viaLinkId` is absent
 *   what is moving is not what was moving   the authored `traffic` differs
 *                                           from the previous stage's
 *
 * Either condition alone is something else, and both alternatives were checked
 * against every authored journey in the course:
 *
 *   link-crossing alone   Mission 6's reply turns at PC-C without anything new
 *                         being sent — t5 crosses no link, and what it answers
 *                         with is the same journey traffic that arrived.
 *                         Resetting there would blank PC-A, Switch-1 and
 *                         Router-1 for the whole return leg of a mission built
 *                         on the round trip being ONE story. Mission 4 and
 *                         Mission 8 likewise open on two or three consecutive
 *                         reasoning stages at PC-A, none of which crosses a
 *                         link.
 *
 *   cargo change alone    Mission 2's own reply at d4 changes what is moving to
 *                         "PC-B's reply", but it does so at Switch-1, across a
 *                         real link — the delivery it belongs to was already
 *                         under way, and d4/d5 must not move.
 *
 * Both together mean something new started somewhere nothing arrived, which is
 * what a second delivery is. Across the whole authored course this fires on
 * exactly one stage: Mission 2's `d6-pc-a-sends-again`.
 *
 * Every input is an authored field. Nothing walks the topology, nothing infers
 * a source, and a journey whose stages never change what is moving behaves
 * exactly as it did before.
 */
export function currentDeliveryStartIndex(
  revealed: readonly DeliveryScopedStage[]
): number {
  let start = 0;

  for (let index = 1; index < revealed.length; index += 1) {
    const stage = revealed[index];
    const previous = revealed[index - 1];
    if (stage === undefined || previous === undefined) continue;

    if (stage.viaLinkId !== undefined) continue;
    if (movingKey(stage) === movingKey(previous)) continue;

    start = index;
  }

  return start;
}

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
        interfaceLabel: iface.label,
        // Read from the flag, never worked out. A renderer that decided to
        // label "the switch end" would be reading a device's role; one that
        // labelled "the upper end" would be reading geometry. Both are the
        // inference this module exists without.
        prominent: iface.prominent === true
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

  /*
    Every device the CURRENT DELIVERY named as involved.

    `atNodeId` is where a stage is anchored; `alsoAtNodeIds` is who else the
    author said was involved at that same moment. Both are authored facts about
    the stage, and reading only the first was a Founder UAT defect on Mission 2:
    a device the author had explicitly named as a participant was drawn `idle`
    and captioned "Not involved so far", because the picture keyed on the anchor
    alone.

    `alsoOnLinkIds` is deliberately NOT read here. A busy link is not a claim
    about the device at its far end, and turning one into the other would mean
    walking the topology to decide who participated — the forwarding inference
    DEC-058 forbids. Involvement is authored or it is not shown.

    The scope is the current delivery rather than the whole journey, for the
    reason `currentDeliveryStartIndex` records.
  */
  const deliveryStartIndex = currentDeliveryStartIndex(revealed);

  /*
    The stages belonging to the delivery on screen. Identical to `revealed` for
    every journey that sends one thing, which is all of them but Mission 2.
  */
  const currentDelivery = revealed.slice(deliveryStartIndex);

  const visitedNodeIds = new Set(
    currentDelivery.flatMap((stage) => [
      stage.atNodeId,
      ...(stage.alsoAtNodeIds ?? [])
    ])
  );

  // Who the CURRENT stage names, kept apart from the accumulated set above.
  // Participation is a statement about the moment on screen: three stages
  // later it would be false, and the card says "Passed through" again.
  const participatingNodeIds = new Set(
    revealed[revealed.length - 1]?.alsoAtNodeIds ?? []
  );

  /*
    Where the CURRENT LEG started (Founder video UAT).

    PC-A was captioned "Started here" while the print request was still at it,
    and then silently became "Passed through" the moment the request reached
    Switch-1 — because a node the journey had left fell into `visitedNodeIds`
    like any other. For a forward journey that is wrong twice over: the origin
    is not somewhere the traffic passed through, and by the time the learner
    reaches the delivery screen the picture no longer says where the request
    came from.

    A leg begins at a stage the traffic did NOT cross a link to reach, so the
    most recent revealed stage with no `viaLinkId` is the current leg's origin.
    Authored fact, read rather than inferred.

    It is deliberately per-LEG and not per-node. Mission 6's reply starts at
    PC-C, which becomes the origin from that stage on, and its return arrives
    back at PC-A across a real link — where PC-A is an arrival like any other.
    Nothing here knows that PC-A is a source in any particular course.
  */
  /*
    An AUTHORED override takes precedence, and only for the stage that
    authors it.

    Mission 2's reply crosses a real link to reach Switch-1, so the rule below
    — which reads "a leg begins where the traffic crossed nothing to arrive" —
    correctly keeps PC-A captioned as the origin while PC-B's answer is what is
    actually travelling. That is the right answer to the question the rule
    asks, and the wrong answer to the question the learner is asking.

    So when a stage says what is moving is something else, that authored
    traffic's own source is this leg's origin. It is read, never inferred: no
    stage that authors no override changes by one character, which is why
    Mission 6's round trip still turns at PC-C on the strength of
    `t5-pc-c-answers` crossing no link, exactly as before.
  */
  const authoredLegOrigin =
    revealed[revealed.length - 1]?.traffic?.sourceNodeId;

  const legOriginNodeId =
    authoredLegOrigin ??
    [...revealed].reverse().find((stage) => stage.viaLinkId === undefined)
      ?.atNodeId;

  const knownLinkIds = new Set(model.links.map((link) => link.linkId));

  // A traversed link is one a revealed stage NAMED. Nothing is inferred from
  // which devices happen to be adjacent.
  const traversedLinkIds = new Set<string>();

  for (const [index, stage] of revealed.entries()) {
    // `viaLinkId` is the link this arrival came in on; `alsoOnLinkIds` are
    // links the SOURCE said were busy at the same moment. Both are authored
    // ids and both are treated identically here — this loop collects what it
    // was given and works nothing out.
    const named = [
      ...(stage.viaLinkId === undefined ? [] : [stage.viaLinkId]),
      ...(stage.alsoOnLinkIds ?? [])
    ];

    for (const linkId of named) {
      // Fail loudly rather than highlighting nothing and looking correct.
      //
      // EVERY revealed stage is validated, including the ones before the
      // current delivery. Narrowing this to the delivery would let a bad id
      // in an earlier stage through, and the drawing would stop refusing
      // exactly where it stopped looking.
      if (!knownLinkIds.has(linkId)) {
        return { state: "unavailable", reason: describeTopologyUnavailable() };
      }

      // The wires carry the same history the cards do, and are scoped the same
      // way. At Mission 2's second delivery all three links read as already
      // crossed, so the picture showed a used network where a new delivery was
      // just starting.
      if (index >= deliveryStartIndex) traversedLinkIds.add(linkId);
    }
  }

  /*
    The links carrying traffic RIGHT NOW.

    A set rather than one id, because an authored stage may say several links
    were occupied at the same moment — Mission 2's switch has not learned where
    the destination is, so the author names the links the copies went out on.

    Every id in it is authored. Nothing here decides which links should be
    busy: no eligible-port rule, no excluding the link the traffic arrived on,
    no reading of device roles, no walk over the topology. Given a stage that
    names one link this behaves exactly as it did before.
  */
  const currentLinkIds = new Set<string>(
    currentStage === undefined
      ? []
      : [
          ...(currentStage.viaLinkId === undefined
            ? []
            : [currentStage.viaLinkId]),
          ...(currentStage.alsoOnLinkIds ?? [])
        ]
  );

  /*
    THE WIRE A NEW DELIVERY LEAVES ON.

    Founder rendered retest, Mission 2 step 6 of 8. The previous repair cleared
    the stale history, and the picture then sat completely still: PC-A marked,
    nothing moving, all three wires dark, through the step, its "Why" beat and
    the prediction that follows. The Founder's original report — that traffic is
    not visibly being passed on this screen — still held.

    The cause is structural. `d6-pc-a-sends-again` authors no `viaLinkId`,
    because nothing ARRIVES there: the delivery leaves PC-A at d6 and reaches
    Switch-1 at d7, which is where the crossing is authored. With no link named,
    the marker falls to the parked branch of `resolvePacket`, which deliberately
    carries `path: null` — and a marker with no path cannot travel. d6 therefore
    rendered byte-identically to d1, the state before anything has been sent.

    The Architect has ruled that the incoming leg MAY be shown at this step: it
    is the delivery arriving at the switch, not the switch's forwarding
    decision, so it cannot spoil d7's prediction about which port goes out.

    This resolves that wire WITHOUT reading an unrevealed stage. The rule the
    parked branch protects is exact and stays intact —

        "animating it would show traffic crossing a link the curriculum never
         said carried any"

    — so the departure link must be one the curriculum HAS said carries this
    journey's traffic, and must already have been observed:

      begins a new delivery   `deliveryStartIndex` names this stage, which
                              across the whole authored course is Mission 2's
                              d6 and nothing else
      the stage proceeds      nothing departs a stage the author halted
      it names no link        an authored link always wins; this only fills a
                              silence
      exactly one candidate   a link touching this device that an EARLIER
                              REVEALED stage already named. Two candidates, or
                              none, and the marker stays parked — the picture
                              never guesses which wire a delivery took.

    At d6 that resolves to `link-pc-a`, which d2 and d5 have both already shown
    carrying traffic. `alsoOnLinkIds` is not consulted for the flood's outgoing
    wires here, and no port choice is disclosed: link-pc-b and link-printer stay
    dark until d7 and d8 author them.
  */
  const departureLinkId = ((): string | null => {
    if (currentStage === undefined) return null;
    if (currentStage.outcome === "stops") return null;
    if (currentLinkIds.size > 0) return null;
    if (deliveryStartIndex !== revealed.length - 1) return null;
    if (deliveryStartIndex === 0) return null;

    const alreadyCarried = new Set<string>();
    for (const stage of revealed.slice(0, revealed.length - 1)) {
      if (stage.viaLinkId !== undefined) alreadyCarried.add(stage.viaLinkId);
      for (const linkId of stage.alsoOnLinkIds ?? []) alreadyCarried.add(linkId);
    }

    const touching = model.links.filter((link) =>
      link.endpoints.some(
        (endpoint) => owners.get(endpoint)?.nodeId === currentStage.atNodeId
      )
    );

    const candidates = touching.filter((link) =>
      alreadyCarried.has(link.linkId)
    );

    return candidates.length === 1 ? (candidates[0]?.linkId ?? null) : null;
  })();

  /*
    The wires drawn as carrying traffic at this moment: every link the stage
    authored, plus at most the one departure resolved above. Identical to
    `currentLinkIds` everywhere in the course except Mission 2's second
    delivery, and `currentLinkIds` remains the purely authored set it always
    was.
  */
  const activeLinkIds =
    departureLinkId === null
      ? currentLinkIds
      : new Set<string>([...currentLinkIds, departureLinkId]);

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
  const faceOf = new Map<string, readonly TopologyFaceGroup[]>();
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

    /*
      The face, and the height it costs, decided in one place.

      An interface with no flagged fact contributes nothing — Switch-1 has four
      ports and, in most missions, nothing worth putting on its face. An
      interface heading appears only when there is more than one group to tell
      apart, which is what keeps a host's card to the facts themselves and
      makes Router-1's card say which of its addresses is on which side.
    */
    const bearing = ports.filter((port) => port.facts.length > 0);
    const named = bearing.length > 1;

    const face: readonly TopologyFaceGroup[] = bearing.map((port) => ({
      interfaceId: port.interfaceId,
      heading: named ? port.label : null,
      facts: port.facts
    }));

    faceOf.set(node.nodeId, face);

    const factRows = face.reduce((total, group) => total + group.facts.length, 0);
    const headingRows = face.filter((group) => group.heading !== null).length;

    contentHeightOf.set(
      node.nodeId,
      NODE_BASE_HEIGHT +
        (factRows === 0
          ? 0
          : NODE_FACTS_HEADER_HEIGHT +
            headingRows * NODE_INTERFACE_HEADING_HEIGHT +
            factRows * NODE_FACT_ROW_HEIGHT)
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
  /*
    A network past the edge of the drawing needs a strip above everything else
    (WP-NF-NT1B), and it is reserved by adding to the SAME shift a group
    boundary uses.

    That is the whole of the placement change. `shiftY` is already applied to
    the row tops before any card, anchor, lane, marker or frame coordinate is
    computed, so reserving space here needs no second pass and no downstream
    caller has to know the strip exists. Nothing moves relative to anything
    else; the drawing simply starts lower.
  */
  const declaredNetworks = model.externalNetworks ?? [];

  const attachedNetworks = declaredNetworks.filter((network) =>
    model.nodes.some((node) => node.nodeId === network.attachedToNodeId)
  );

  const externalStrip =
    attachedNetworks.length === 0 ? 0 : EXTERNAL_NETWORK_HEIGHT + ROW_GAP;

  const shiftX = Math.max(
    0,
    ...boundsOfGroups.map((bounds) => CANVAS_PADDING - bounds.left)
  );
  const shiftY = Math.max(
    externalStrip,
    ...boundsOfGroups.map((bounds) => CANVAS_PADDING - bounds.top + externalStrip)
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
      consequence?.state === "confirmed",
      currentStage?.viaLinkId !== undefined,
      legOriginNodeId,
      participatingNodeIds
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
      ports: portsOf.get(node.nodeId) ?? [],
      face: faceOf.get(node.nodeId) ?? []
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
  /*
    A composite key for one link's anchor on one device.

    The separator is a SPACE, and that is unambiguous rather than merely
    tidy: `INTERACTION_KEY` restricts every authored identifier to
    lowercase letters, digits, dot, underscore and hyphen, so neither half
    can contain a space and no two different pairs can collide.

    It was briefly a NUL byte, which worked at runtime and was invisible in
    an editor, but made the whole file classify as binary — so `grep` went
    silent on it and `verify-wph.sh`'s comment-stripping scan produced an
    empty file, quietly disabling every absence check that reads this
    module. A key separator is not worth a byte that blinds a gate.
  */
  const anchorKey = (linkId: string, nodeId: string): string =>
    `${linkId} ${nodeId}`;

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
        interfaceLabel: from.interfaceLabel,
        prominent: from.prominent
      },
      to: {
        nodeId: to.nodeId,
        nodeLabel: to.nodeLabel,
        interfaceId: link.endpoints[1],
        interfaceLabel: to.interfaceLabel,
        prominent: to.prominent
      },
      endpointSummary: `${from.nodeLabel} ${from.interfaceLabel} to ${to.nodeLabel} ${to.interfaceLabel}`,
      shape,
      points,
      path: pointsToPath(points),
      traversed: traversedLinkIds.has(link.linkId),
      current: activeLinkIds.has(link.linkId)
    };
  });

  /* --- authored port labels ----------------------------------------- */

  /*
    One label per END the author flagged, on either end of any wire.

    Both ends are offered to `resolvePortLabel` and the flag decides, so the
    author can name a switch's ports, a host's interface, both or neither.
    Nothing here prefers one end over the other — the moment it did, it would
    be choosing from a device's role or from where the wire happens to sit.

    Each label walks out from its OWN device, so the points are reversed for
    the far end of the wire.
  */
  const portLabels: TopologyPortLabel[] = resolved.flatMap(
    ({ link, from, to }) => {
      const drawn = links.find((candidate) => candidate.linkId === link.linkId);
      if (drawn === undefined) return [];

      const ends: TopologyPortLabel[] = [];

      if (from.prominent) {
        const label = resolvePortLabel(
          link.linkId,
          {
            nodeId: from.nodeId,
            interfaceId: link.endpoints[0],
            interfaceLabel: from.interfaceLabel
          },
          drawn.points,
          boxOf
        );
        if (label !== null) ends.push(label);
      }

      if (to.prominent) {
        const label = resolvePortLabel(
          link.linkId,
          {
            nodeId: to.nodeId,
            interfaceId: link.endpoints[1],
            interfaceLabel: to.interfaceLabel
          },
          [...drawn.points].reverse(),
          boxOf
        );
        if (label !== null) ends.push(label);
      }

      return ends;
    }
  );

  /* --- the markers -------------------------------------------------- */

  /*
    One marker per link the authored stage says is carrying traffic.

    All of them are anchored at the SAME device — the one the stage is at — and
    each walks out along its own link. That is what makes a flood read as one
    event with several copies leaving, rather than as several arrivals in a
    row: every marker starts at Switch-1's edge and moves outward together.

    A stage naming one link produces one marker, which is every stage authored
    before this field existed.
  */
  const markerNodeId = currentStage?.atNodeId ?? originNodeId;
  const markerLinkIds =
    currentStage === undefined ? [] : [...activeLinkIds];

  const waiting = currentStage === undefined;
  const stopped = currentStage?.outcome === "stops";
  const confirmed = consequence?.state === "confirmed";

  const packets: TopologyPacket[] =
    markerLinkIds.length === 0
      ? // No link named — the origin before anything is sent, or a source that
        // reported a hop without a link. One marker, parked beside the device.
        collect(
          resolvePacket(
            markerNodeId,
            null,
            links,
            boxOf,
            waiting,
            stopped,
            confirmed
          )
        )
      : markerLinkIds.flatMap((linkId) =>
          collect(
            resolvePacket(
              markerNodeId,
              linkId,
              links,
              boxOf,
              waiting,
              stopped,
              confirmed,
              // Read from the authored stage, never worked out. The link the
              // stage names as `viaLinkId` is the one traffic came in on;
              // every link in `alsoOnLinkIds` is one it went out on.
              linkId === currentStage?.viaLinkId ? "arriving" : "leaving"
            )
          )
        );

  /* --- networks past the edge of the drawing ------------------------ */

  /*
    Placed AFTER the devices, so each plate can be centred on the card it
    reaches — which is what makes "Router-2 connects to another network" read
    as one relationship rather than as two objects that happen to be near each
    other.

    The wire is a straight line between two facing edges. There is no routing
    to do: the plate sits directly above its device in the strip reserved for
    it, in the band `ROW_GAP` guarantees is empty, so a line between them can
    cross nothing.

    Deliberately not a `TopologyLink`. There is no traffic here, so there is
    nothing to mark traversed, nothing to ride it, and no direction to travel.
  */
  const externalNetworks: TopologyExternalNetwork[] = attachedNetworks.flatMap(
    (network) => {
      const attachedBox = boxOf.get(network.attachedToNodeId);
      if (attachedBox === undefined) return [];

      const box: TopologyBox = {
        // Centred on the card, but never off the left edge. A plate wider than
        // the card it reaches, above a device at the left of the drawing,
        // would otherwise be clipped. The wire then runs slightly diagonally,
        // which still says exactly what it says.
        x: round(
          Math.max(
            CANVAS_PADDING,
            attachedBox.x + attachedBox.width / 2 - EXTERNAL_NETWORK_WIDTH / 2
          )
        ),
        y: round(CANVAS_PADDING),
        width: EXTERNAL_NETWORK_WIDTH,
        height: EXTERNAL_NETWORK_HEIGHT
      };

      const from: TopologyPoint = {
        x: round(box.x + box.width / 2),
        y: round(box.y + box.height)
      };
      const to: TopologyPoint = {
        x: round(attachedBox.x + attachedBox.width / 2),
        y: round(attachedBox.y)
      };

      return [
        {
          networkId: network.networkId,
          label: network.label,
          attachedToNodeId: network.attachedToNodeId,
          box,
          path: pointsToPath([from, to])
        }
      ];
    }
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
        channels === 0 ? 0 : channelX(channels - 1) + CANVAS_PADDING,
        // A plate wider than the card it sits above would otherwise be clipped
        // at the right-hand edge, which is the same defect the group boundary
        // shift exists to prevent at the left.
        ...externalNetworks.map(
          (network) => network.box.x + network.box.width + CANVAS_PADDING
        )
      )
    ),
    height: round(
      Math.max(
        contentBottom + CANVAS_PADDING,
        // EVERY marker has to fit, not just the first one. A marker parked
        // below a card is the lowest thing on the canvas, and with several of
        // them the tallest one decides the frame.
        ...packets.map((marker) => marker.at.y + CANVAS_PADDING)
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
    packets,
    externalNetworks,
    portLabels,
    description: describeTopologyArrangement(
      devices,
      links,
      rowCount,
      groups,
      externalNetworks
    )
  };
}

/** `[value]` when it is there, `[]` when it is not. */
function collect<T>(value: T | null): T[] {
  return value === null ? [] : [value];
}

/**
 * How far along the wire a port label sits, and how far to one side of it.
 *
 * ALONG is small, so the label reads as belonging to the socket it names
 * rather than floating in the middle of the wire — the "device, then port,
 * then connection" reading the Founder asked for.
 *
 * ASIDE is what keeps it off the wire itself. The traffic marker rides the
 * wire at `MARKER_CLEARANCE`, and a label in that lane would be covered by
 * the traffic at exactly the moment the learner wants to read which port it
 * went out of.
 */
const PORT_LABEL_CLEARANCE = 10;
const PORT_LABEL_ASIDE = 11;

/**
 * Where one authored port label sits, beside its connection.
 *
 * Two steps, and both of them have to be right or the label lands somewhere
 * useless:
 *
 * 1. Walk along the wire until the card is genuinely behind us. This reuses
 *    `pointClearOfBox`, the same helper the traffic marker uses, so "clear of
 *    the card" means one thing in this module rather than two.
 *
 * 2. Step to one side, so the label is beside the wire rather than on it. A
 *    marker rides the wire, and a label in that lane would be covered by the
 *    traffic exactly when the learner wants to read which port it left by.
 *
 * The side is chosen by which one ends up FURTHER from the card. A fixed side
 * looks tidy on a vertical wire and pushes the label back inside the device on
 * a steep diagonal — which is exactly what the first version of this did, and
 * what the geometry tests caught.
 *
 * `PORT_LABEL_CLEARANCE` is deliberately smaller than `MARKER_CLEARANCE`: the
 * label belongs to the socket and the marker is in transit, so the label sits
 * nearer the card and the two separate along the wire as well as across it.
 */
function resolvePortLabel(
  linkId: string,
  owner: { nodeId: string; interfaceId: string; interfaceLabel: string },
  points: readonly TopologyPoint[],
  boxOf: ReadonlyMap<string, TopologyBox>
): TopologyPortLabel | null {
  const box = boxOf.get(owner.nodeId);
  if (box === undefined) return null;

  const start = points[0];
  if (start === undefined) return null;

  const on = pointClearOfBox(points, box, PORT_LABEL_CLEARANCE);

  const dx = on.x - start.x;
  const dy = on.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;

  // The perpendicular of (x, y) is (-y, x); the other side is its negation.
  const asideX = (-dy / length) * PORT_LABEL_ASIDE;
  const asideY = (dx / length) * PORT_LABEL_ASIDE;

  const candidates: TopologyPoint[] = [
    { x: on.x + asideX, y: on.y + asideY },
    { x: on.x - asideX, y: on.y - asideY }
  ];

  const furthest = candidates.reduce((best, candidate) =>
    distanceToBox(candidate, box) > distanceToBox(best, box) ? candidate : best
  );

  return {
    linkId,
    nodeId: owner.nodeId,
    interfaceId: owner.interfaceId,
    text: owner.interfaceLabel,
    at: { x: round(furthest.x), y: round(furthest.y) }
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
  confirmed: boolean,
  /** Whether the current stage was reached by crossing an authored link. */
  arrivedByLink: boolean,
  /** Where the current leg started, from the authored stages. */
  legOriginNodeId: string | undefined,
  /** Who the CURRENT stage names as also part of it, and nobody else. */
  participatingNodeIds: ReadonlySet<string> = new Set()
): TopologyDeviceState {
  if (nodeId === currentNodeId) {
    if (confirmed) return "confirmed";
    if (stopped) return "stopped";
    // Nothing travelled to get here, so nothing arrived: the traffic started.
    return arrivedByLink ? "current" : "origin";
  }

  // The origin STAYS the origin for the whole leg. A source the traffic has
  // left is not a device it passed through, and the picture has to keep saying
  // where the journey began after the traffic has moved on.
  if (nodeId === legOriginNodeId) return "origin";

  // Checked after the anchor and the leg origin, never before: a device that
  // is where the traffic IS must keep the stronger word, even when an author
  // also names it among the participants.
  if (participatingNodeIds.has(nodeId)) return "participating";

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
  confirmed: boolean,
  /**
   * `arriving` when the stage named this link as the one traffic came in on,
   * `leaving` when the author named it among the links traffic went out on.
   * Both are authored facts; this function never decides which a link is.
   */
  travel: "arriving" | "leaving" = "arriving"
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
      linkId: null,
      path: null,
      travelsToEnd: true
    };
  }

  // Walk in from the end that touches this device, so the marker is always on
  // the near side of the wire — leaving the origin, or arriving at the device
  // that has it now.
  const ordered =
    ride.to.nodeId === nodeId ? [...ride.points].reverse() : [...ride.points];

  /*
    Which end the traffic is heading for.

    A link the stage ARRIVED on carries traffic towards this device; a link the
    author named among those it LEFT on carries traffic away from it. So the
    same wire animates one way on the outbound leg and the other way on the
    return, without any stage being re-read or any path being reversed — the
    authored `atNodeId` is the only thing consulted.
  */
  const towardsThisDevice = travel === "arriving";
  const thisDeviceIsPathEnd = ride.to.nodeId === nodeId;

  /*
    Only an AUTHORED link may be travelled.

    `ride` falls back to any wire touching this device when the stage named
    none — the origin, before anything has moved, is exactly that case. That
    fallback is fine for POSITIONING a parked marker beside its device, and it
    must never become motion: animating it would show traffic crossing a link
    the curriculum never said carried any, which is the "do not animate to
    devices the curriculum did not author as recipients" rule.

    So the path is carried only when the stage itself named the link. A parked
    marker has no path, and a marker with no path cannot travel.
  */
  return {
    nodeId,
    state,
    stateLabel: describePacketState(state),
    at: pointClearOfBox(ordered, box, MARKER_CLEARANCE),
    linkId: ride.linkId,
    path: named === undefined ? null : ride.path,
    travelsToEnd: towardsThisDevice ? thisDeviceIsPathEnd : !thisDeviceIsPathEnd
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
