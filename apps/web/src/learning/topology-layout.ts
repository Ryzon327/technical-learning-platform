import type {
  ObservationModel,
  ObservationNodeRole
} from "@tlp/shared-types";

/**
 * WP-I correction — the topology as a PICTURE, derived from the observation
 * model and from nothing else.
 *
 * ## Why this is a separate, pure module
 *
 * The same reason `packet-journey-presentation.ts` is: this repository has no
 * rendered-DOM test harness — no jsdom, no happy-dom, no testing-library — and
 * WP-I may not add one, because a dependency change is a Founder gate. So every
 * rule that decides what the drawing contains lives here, as total functions
 * over plain values, and the components are left thin enough that what remains
 * is markup a structural gate can check.
 *
 * A layout that cannot be tested is a layout that will silently drop a device.
 *
 * ## The one thing this module computes, and the one thing it must never
 *
 * It computes **geometry**: which column a device occupies, which lane a link
 * routes through, which endpoint label sits at each end of a wire. Geometry is
 * presentation. Two devices being drawn next to each other says nothing about
 * whether traffic can pass between them.
 *
 * It computes **no networking truth**. There is no routing here, no forwarding,
 * no next hop, no reachability, no VLAN membership, no subnet arithmetic and no
 * address parsing — an address is a string that is copied to the screen and
 * never read. Where the traffic went is `ObservationStage.atNodeId`, and which
 * link carried it is `ObservationStage.viaLinkId`: both are FIELDS the source
 * determined, and both are copied rather than derived.
 *
 * In particular, this module never searches the link list for a link joining
 * two consecutive stages. That search is the forwarding inference DEC-058
 * forbids, and it is also simply wrong on a topology with two links between the
 * same pair of devices. If the source did not say which link was used, the
 * drawing highlights none.
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
 * carry nothing the text does not. The components keep the semantic tree and
 * mark the drawn layer `aria-hidden`.
 */

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

export interface TopologyDevice {
  readonly nodeId: string;
  readonly label: string;
  readonly role: ObservationNodeRole;
  readonly roleLabel: string;
  /** Authored order, left to right. Never rearranged to make a tidier picture. */
  readonly column: number;
  readonly state: TopologyDeviceState;
  readonly stateLabel: string;
  readonly ports: readonly TopologyPort[];
}

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
  readonly fromColumn: number;
  readonly toColumn: number;
  /** 0 draws along the device band; 1 and above route below it, one per lane. */
  readonly lane: number;
  /** The traffic has crossed this link at some revealed stage. */
  readonly traversed: boolean;
  /** The traffic crossed this link to reach where it is now. */
  readonly current: boolean;
}

export interface TopologyPacket {
  readonly nodeId: string;
  readonly column: number;
  readonly state: "waiting" | "moving" | "stopped" | "confirmed";
  readonly stateLabel: string;
}

export type TopologyLayout =
  | {
      readonly state: "available";
      readonly columns: number;
      /** How many routed lanes the drawing needs beneath the device band. */
      readonly lanes: number;
      readonly devices: readonly TopologyDevice[];
      readonly links: readonly TopologyLink[];
      readonly packet: TopologyPacket | null;
    }
  | { readonly state: "unavailable"; readonly reason: string };

/* ------------------------------------------------------------------ *
 * Wording
 *
 * Kept out of JSX so every string is reachable from a test that runs without a
 * DOM, and so no state is ever conveyed by colour or position alone.
 * ------------------------------------------------------------------ */

export function describeTopologyRole(role: ObservationNodeRole): string {
  if (role === "host") return "Host";
  if (role === "switch") return "Switch";
  return "Router";
}

export function describeDeviceState(state: TopologyDeviceState): string {
  if (state === "current") return "The traffic is here";
  if (state === "stopped") return "The traffic stopped here";
  if (state === "confirmed") return "The journey completed here";
  if (state === "visited") return "The traffic passed through here";
  return "Not reached yet";
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

/* ------------------------------------------------------------------ *
 * Building the layout
 * ------------------------------------------------------------------ */

interface InterfaceOwner {
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly interfaceLabel: string;
}

/**
 * Which lane a link routes through.
 *
 * Adjacent columns get lane 0 and draw straight along the device band.
 * Anything spanning further is pushed below, into the lowest lane no
 * already-placed link overlaps. Authored link order decides ties, so the same
 * model always produces the same picture.
 *
 * This is packing, not pathfinding. It answers "where does this line fit", and
 * says nothing about whether traffic uses it.
 */
function assignLane(
  fromColumn: number,
  toColumn: number,
  placed: { readonly low: number; readonly high: number; readonly lane: number }[]
): number {
  const low = Math.min(fromColumn, toColumn);
  const high = Math.max(fromColumn, toColumn);

  if (high - low <= 1) return 0;

  let lane = 1;

  // Walk upwards until a lane is found that nothing overlapping already holds.
  // The list is small — one entry per authored link — so a scan is clearer than
  // an index, and clarity is worth more here than a constant factor.
  while (
    placed.some(
      (entry) => entry.lane === lane && entry.low < high && low < entry.high
    )
  ) {
    lane += 1;
  }

  return lane;
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

  const columnOf = new Map<string, number>();
  const owners = new Map<string, InterfaceOwner>();

  model.nodes.forEach((node, index) => {
    columnOf.set(node.nodeId, index);

    for (const iface of node.interfaces) {
      owners.set(iface.interfaceId, {
        nodeId: node.nodeId,
        nodeLabel: node.label,
        interfaceLabel: iface.label
      });
    }
  });

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

  /* --- links -------------------------------------------------------- */

  const placed: { low: number; high: number; lane: number }[] = [];
  const links: TopologyLink[] = [];

  for (const link of model.links) {
    const from = owners.get(link.endpoints[0]);
    const to = owners.get(link.endpoints[1]);

    // A dangling endpoint means the drawing would show a wire going nowhere,
    // or a device quietly missing an attachment. Neither is acceptable in a
    // picture a learner reasons about, so the whole layout refuses.
    if (from === undefined || to === undefined) {
      return { state: "unavailable", reason: describeTopologyUnavailable() };
    }

    const fromColumn = columnOf.get(from.nodeId) ?? 0;
    const toColumn = columnOf.get(to.nodeId) ?? 0;
    const lane = assignLane(fromColumn, toColumn, placed);

    placed.push({
      low: Math.min(fromColumn, toColumn),
      high: Math.max(fromColumn, toColumn),
      lane
    });

    links.push({
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
      fromColumn,
      toColumn,
      lane,
      traversed: traversedLinkIds.has(link.linkId),
      current: currentLinkId === link.linkId
    });
  }

  /* --- devices ------------------------------------------------------ */

  const consequence = model.consequence;

  const devices: TopologyDevice[] = model.nodes.map((node, index) => {
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
      column: index,
      state,
      stateLabel: describeDeviceState(state),
      ports: node.interfaces.map((iface) => ({
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
      }))
    };
  });

  /* --- the packet --------------------------------------------------- */

  const packet = resolvePacket(
    currentStage?.atNodeId ?? originNodeId,
    columnOf,
    currentStage === undefined,
    currentStage?.outcome === "stops",
    consequence?.state === "confirmed"
  );

  return {
    state: "available",
    columns: model.nodes.length,
    lanes: placed.reduce((highest, entry) => Math.max(highest, entry.lane), 0),
    devices,
    links,
    packet
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

function resolvePacket(
  nodeId: string | null | undefined,
  columnOf: ReadonlyMap<string, number>,
  waiting: boolean,
  stopped: boolean,
  confirmed: boolean
): TopologyPacket | null {
  if (nodeId === null || nodeId === undefined) return null;

  const column = columnOf.get(nodeId);
  if (column === undefined) return null;

  const state: TopologyPacket["state"] = waiting
    ? "waiting"
    : confirmed
      ? "confirmed"
      : stopped
        ? "stopped"
        : "moving";

  return { nodeId, column, state, stateLabel: describePacketState(state) };
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
