import { describe, expect, it } from "vitest";
import {
  OBSERVATION_NODE_ROLES,
  buildPacketJourneyObservationModel,
  parseCurriculumDocument,
  unavailableObservationModel,
  type ObservationModel,
  type PacketJourneyParameters
} from "@tlp/shared-types";
import networkingFoundations from "../../../../content/curriculum/networking-foundations.json";
import {
  CANVAS_PADDING,
  GROUP_LABEL_HEIGHT,
  MARKER_CLEARANCE,
  FACE_INTERFACE_FONT_PX,
  FACE_LABEL_FONT_PX,
  FACE_VALUE_FONT_PX,
  NODE_BASE_HEIGHT,
  NODE_FACTS_HEADER_HEIGHT,
  NODE_FACT_ROW_HEIGHT,
  NODE_INTERFACE_HEADING_HEIGHT,
  NODE_WIDTH,
  TOPOLOGY_HEIGHT_BUDGET,
  TOPOLOGY_MIN_SCALE,
  TOPOLOGY_WIDTH_BUDGET,
  describeWorkspaceColumns,
  buildTopologyLayout,
  connectionsForDevice,
  describeConnectionFrom,
  describeDeviceState,
  describePacketState,
  describeTopologyRole,
  distanceToBox,
  faceTextFits,
  fitTopologyScale
} from "./topology-layout";

/**
 * WP-I, corrected by WP-J Module 1 — the drawable topology, proven without a
 * browser.
 *
 * This repository has no rendered-DOM test harness, so the rules that decide
 * what the picture CONTAINS — and, since the Founder UAT correction, exactly
 * WHERE every part of it sits — live in a pure module and are pinned here.
 *
 * Two failures are guarded. The quiet one: a layout that silently omits a
 * device or a wire still renders, still looks finished, and leaves a learner
 * reasoning about a network that is not the one they were given. And the loud
 * one Founder UAT found: a drawing whose arrangement teaches nothing, whose
 * wires cross the cards, and whose traffic marker covers a device's own text.
 */

/** Four devices and three links, shaped like the architecture fixture. */
const model: ObservationModel = {
  sourceKind: "authored_teaching",
  availability: "available",
  trafficLabel: "an ICMP echo request",
  // Authored before groups existed, and still valid: an interaction that
  // groups nothing draws no boundary.
  groups: [],
  nodes: [
    {
      nodeId: "pc-a",
      label: "PC-A",
      role: "host",
      interfaces: [
        {
          interfaceId: "pc-a-eth0",
          label: "eth0",
          attributes: [
            {
              label: "IP address",
              value: "192.168.10.10/24",
              availability: "available"
            }
          ]
        }
      ]
    },
    {
      nodeId: "sw-1",
      label: "Switch-1",
      role: "switch",
      interfaces: [
        { interfaceId: "sw-1-fa0-1", label: "Fa0/1", attributes: [] },
        { interfaceId: "sw-1-fa0-24", label: "Fa0/24", attributes: [] }
      ]
    },
    {
      nodeId: "r-1",
      label: "Router-1",
      role: "router",
      interfaces: [
        { interfaceId: "r-1-gi0-0-10", label: "Gi0/0.10", attributes: [] }
      ]
    },
    {
      nodeId: "pc-b",
      label: "PC-B",
      role: "host",
      interfaces: [{ interfaceId: "pc-b-eth0", label: "eth0", attributes: [] }]
    }
  ],
  links: [
    {
      linkId: "link-pc-a",
      label: "PC-A to Switch-1",
      endpoints: ["pc-a-eth0", "sw-1-fa0-1"],
      availability: "available"
    },
    {
      linkId: "link-trunk",
      label: "Switch-1 to Router-1",
      endpoints: ["sw-1-fa0-24", "r-1-gi0-0-10"],
      availability: "available"
    },
    {
      linkId: "link-pc-b",
      label: "PC-B to Switch-1",
      endpoints: ["pc-b-eth0", "sw-1-fa0-1"],
      availability: "available"
    }
  ],
  stages: [
    {
      stageId: "s1",
      atNodeId: "pc-a",
      narration: "PC-A sends the request.",
      outcome: "proceeds",
      availability: "available"
    },
    {
      stageId: "s2",
      atNodeId: "sw-1",
      narration: "Switch-1 forwards it up the trunk.",
      outcome: "proceeds",
      viaLinkId: "link-pc-a",
      availability: "available"
    },
    {
      stageId: "s3",
      atNodeId: "r-1",
      narration: "Router-1 discards it.",
      outcome: "stops",
      viaLinkId: "link-trunk",
      availability: "unknown"
    }
  ],
  currentStageId: "s2",
  actions: [],
  consequence: {
    state: "proceeding",
    narration: "Switch-1 forwards it up the trunk."
  }
};

/* ------------------------------------------------------------------ *
 * Shapes the hierarchy has to handle
 *
 * Written by hand rather than generated, so what each one is TESTING is legible
 * beside the assertion: Module 1's authored star, two intermediary devices side
 * by side, and an end device attached across a row it does not touch.
 * ------------------------------------------------------------------ */

function node(
  nodeId: string,
  label: string,
  role: ObservationModel["nodes"][number]["role"],
  interfaceIds: readonly string[],
  groupId?: string
): ObservationModel["nodes"][number] {
  return {
    nodeId,
    label,
    role,
    ...(groupId === undefined ? {} : { groupId }),
    interfaces: interfaceIds.map((interfaceId) => ({
      interfaceId,
      label: interfaceId,
      attributes: []
    }))
  };
}

function wire(
  linkId: string,
  from: string,
  to: string
): ObservationModel["links"][number] {
  return {
    linkId,
    label: `${from} to ${to}`,
    endpoints: [from, to],
    availability: "available"
  };
}

const emptyJourney = {
  sourceKind: "authored_teaching" as const,
  availability: "available" as const,
  trafficLabel: "anything PC-A sends",
  groups: [],
  stages: [],
  currentStageId: null,
  actions: [],
  consequence: null
};

/**
 * Module 1's authored shape, and the one the Founder UAT correction is about:
 * three end devices on a switch, and a router attached to the same switch.
 */
const moduleOne: ObservationModel = {
  ...emptyJourney,
  nodes: [
    node("pc-a", "PC-A", "host", ["pc-a-nic"]),
    node("pc-b", "PC-B", "host", ["pc-b-nic"]),
    node("printer", "Printer", "printer", ["printer-nic"]),
    node("sw-1", "Switch-1", "switch", [
      "sw-1-p1",
      "sw-1-p2",
      "sw-1-p3",
      "sw-1-p4"
    ]),
    node("r-1", "Router-1", "router", ["r-1-local", "r-1-outward"])
  ],
  links: [
    wire("link-pc-a", "pc-a-nic", "sw-1-p1"),
    wire("link-pc-b", "pc-b-nic", "sw-1-p2"),
    wire("link-printer", "printer-nic", "sw-1-p3"),
    wire("link-router", "r-1-local", "sw-1-p4")
  ],
  stages: [
    {
      stageId: "t1-pc-a",
      atNodeId: "pc-a",
      narration: "PC-A has one link.",
      outcome: "proceeds",
      availability: "available"
    },
    {
      stageId: "t2-switch",
      atNodeId: "sw-1",
      narration: "It arrives at Switch-1.",
      outcome: "proceeds",
      viaLinkId: "link-pc-a",
      availability: "available"
    }
  ],
  currentStageId: "t2-switch",
  consequence: { state: "proceeding", narration: "It arrives at Switch-1." }
};

/**
 * Two intermediary devices in the same row, joined to each other.
 *
 * The shape the Founder asked the layout to stay compatible with: two separated
 * groups of end devices that a later mission could draw side by side.
 */
const twoSwitches: ObservationModel = {
  ...emptyJourney,
  nodes: [
    node("sw-a", "Switch-A", "switch", ["sw-a-p1", "sw-a-p2"]),
    node("sw-b", "Switch-B", "switch", ["sw-b-p1", "sw-b-p2"]),
    node("pc-a", "PC-A", "host", ["pc-a-nic"]),
    node("pc-c", "PC-C", "host", ["pc-c-nic"])
  ],
  links: [
    wire("link-pc-a", "pc-a-nic", "sw-a-p1"),
    wire("link-pc-c", "pc-c-nic", "sw-b-p1"),
    wire("link-sw-sw", "sw-a-p2", "sw-b-p2")
  ]
};

/**
 * Module 1 as it is now authored: the same five devices, with the four the
 * curriculum studies together placed in one authored group, and Router-1
 * deliberately left out of it.
 */
const moduleOneGrouped: ObservationModel = {
  ...moduleOne,
  groups: [{ groupId: "local-network", label: "Local network" }],
  nodes: moduleOne.nodes.map((entry) =>
    entry.nodeId === "r-1" ? entry : { ...entry, groupId: "local-network" }
  )
};

/**
 * Two authored groups side by side, each with its own switch and hosts, joined
 * by a router that belongs to neither.
 *
 * This is the shape the Architect required the presentation to support without
 * authoring any future curriculum to demonstrate it.
 */
const twoGroups: ObservationModel = {
  ...emptyJourney,
  trafficLabel: "anything PC-A sends",
  groups: [
    { groupId: "network-a", label: "Network A" },
    { groupId: "network-b", label: "Network B" }
  ],
  nodes: [
    node("sw-a", "Switch-A", "switch", ["sw-a-p1", "sw-a-p2", "sw-a-up"], "network-a"),
    node("pc-a", "PC-A", "host", ["pc-a-nic"], "network-a"),
    node("pc-b", "PC-B", "host", ["pc-b-nic"], "network-a"),
    node("sw-b", "Switch-B", "switch", ["sw-b-p1", "sw-b-p2", "sw-b-up"], "network-b"),
    node("pc-c", "PC-C", "host", ["pc-c-nic"], "network-b"),
    node("pc-d", "PC-D", "host", ["pc-d-nic"], "network-b"),
    node("r-1", "Router-1", "router", ["r-1-a", "r-1-b"])
  ],
  links: [
    wire("link-pc-a", "pc-a-nic", "sw-a-p1"),
    wire("link-pc-b", "pc-b-nic", "sw-a-p2"),
    wire("link-pc-c", "pc-c-nic", "sw-b-p1"),
    wire("link-pc-d", "pc-d-nic", "sw-b-p2"),
    wire("link-up-a", "r-1-a", "sw-a-up"),
    wire("link-up-b", "r-1-b", "sw-b-up")
  ]
};

/** An end device attached straight to a router, across the switch row. */
const hostToRouter: ObservationModel = {
  ...emptyJourney,
  nodes: [
    node("r-1", "Router-1", "router", ["r-1-local", "r-1-direct"]),
    node("sw-1", "Switch-1", "switch", ["sw-1-p1", "sw-1-p2"]),
    node("pc-a", "PC-A", "host", ["pc-a-nic"]),
    node("pc-b", "PC-B", "host", ["pc-b-nic", "pc-b-second"])
  ],
  links: [
    wire("link-uplink", "r-1-local", "sw-1-p1"),
    wire("link-pc-a", "pc-a-nic", "sw-1-p2"),
    wire("link-direct", "pc-b-second", "r-1-direct")
  ]
};

/** Narrow to the drawable case, so a test reads without a guard in every line. */
function layoutOf(source: ObservationModel) {
  const layout = buildTopologyLayout(source, "pc-a");
  if (layout.state !== "available") {
    throw new Error(`expected a drawable layout, got: ${layout.reason}`);
  }
  return layout;
}

/**
 * The one marker a stage on a single link must produce.
 *
 * Markers became a list when an authored stage gained the ability to say that
 * several links were busy at the same moment. Every stage that names one link
 * must still draw exactly one marker — so this asserts the count rather than
 * reading `[0]`, and a stage that quietly started drawing two would fail here
 * instead of passing on its first element.
 */
function soleMarker(layout: ReturnType<typeof layoutOf>) {
  expect(layout.packets).toHaveLength(1);
  const marker = layout.packets[0];
  if (marker === undefined) throw new Error("expected one marker");
  return marker;
}

describe("nothing is silently dropped", () => {
  it("draws every device the model declares", () => {
    const layout = layoutOf(model);

    expect(layout.devices).toHaveLength(model.nodes.length);
    expect(layout.devices.map((device) => device.nodeId)).toEqual([
      "pc-a",
      "sw-1",
      "r-1",
      "pc-b"
    ]);
    expect(layout.rows).toBe(3);
  });

  it("draws every link the model declares", () => {
    const layout = layoutOf(model);

    expect(layout.links).toHaveLength(model.links.length);
    expect(layout.links.map((link) => link.linkId)).toEqual([
      "link-pc-a",
      "link-trunk",
      "link-pc-b"
    ]);
  });

  it("keeps the devices themselves in authored order", () => {
    // Founder UAT required the ARRANGEMENT to change — a row of cards taught a
    // beginner nothing about what was attached to what. What must not change is
    // the set: the devices are still emitted in authored order, so the picture
    // and every written list stay in the same sequence.
    expect(layoutOf(model).devices.map((device) => device.nodeId)).toEqual(
      model.nodes.map((node) => node.nodeId)
    );
  });

  it("ties an equal placement back to authored order", () => {
    // PC-A and PC-B are both attached to Switch-1 and nothing separates them,
    // so the author's order decides. A layout that broke ties by anything else
    // would draw a different picture from the same model on a different day.
    const hosts = layoutOf(model)
      .devices.filter((device) => device.role === "host")
      .sort((left, right) => left.order - right.order);

    expect(hosts.map((device) => device.nodeId)).toEqual(["pc-a", "pc-b"]);
  });

  it("is deterministic", () => {
    expect(layoutOf(model)).toEqual(layoutOf(model));
  });
});

describe("endpoints are resolved, never left as identifiers", () => {
  it("names the device and the port at both ends", () => {
    const link = layoutOf(model).links[0];

    expect(link?.from).toEqual({
      nodeId: "pc-a",
      nodeLabel: "PC-A",
      interfaceId: "pc-a-eth0",
      interfaceLabel: "eth0",
      // Whether this end is named on the picture. False here because this
      // fixture flags nothing, which is every interaction authored before the
      // flag existed.
      prominent: false
    });
    expect(link?.to.nodeLabel).toBe("Switch-1");
    expect(link?.to.interfaceLabel).toBe("Fa0/1");
    expect(link?.endpointSummary).toBe("PC-A eth0 to Switch-1 Fa0/1");
  });

  it("reads a connection from the selected device's point of view", () => {
    const layout = layoutOf(model);
    const switchLinks = connectionsForDevice(layout.links, "sw-1");

    // All three links touch Switch-1 here, and the filter finds all three.
    expect(switchLinks.map((link) => link.linkId)).toEqual([
      "link-pc-a",
      "link-trunk",
      "link-pc-b"
    ]);

    expect(describeConnectionFrom(switchLinks[0]!, "sw-1")).toBe(
      "Fa0/1 to PC-A eth0"
    );
    expect(describeConnectionFrom(switchLinks[1]!, "sw-1")).toBe(
      "Fa0/24 to Router-1 Gi0/0.10"
    );
  });

  it("finds only the links that touch the device asked about", () => {
    const layout = layoutOf(model);

    expect(
      connectionsForDevice(layout.links, "r-1").map((link) => link.linkId)
    ).toEqual(["link-trunk"]);
    expect(connectionsForDevice(layout.links, "no-such-device")).toEqual([]);
  });

  it("refuses to draw anything when an endpoint does not resolve", () => {
    const broken: ObservationModel = {
      ...model,
      links: [
        {
          linkId: "link-dangling",
          label: "A link to nowhere",
          endpoints: ["pc-a-eth0", "does-not-exist"],
          availability: "available"
        }
      ]
    };

    const layout = buildTopologyLayout(broken, "pc-a");

    // Loud, not partial. A picture missing one attachment still looks
    // finished, and a learner would reason from it.
    expect(layout.state).toBe("unavailable");
    if (layout.state === "unavailable") {
      expect(layout.reason).toContain("cannot be drawn");
    }
  });
});

describe("wires are routed geometry, not pathfinding", () => {
  it("draws a link between neighbouring rows as one straight branch", () => {
    for (const link of layoutOf(model).links) {
      expect(link.shape).toBe("branch");
      expect(link.points).toHaveLength(2);
    }
  });

  it("routes a link between the same row through the band above it", () => {
    const layout = layoutOf(twoSwitches);
    const peer = layout.links.find((link) => link.linkId === "link-sw-sw");

    expect(peer?.shape).toBe("peer");

    const switches = layout.devices.filter(
      (device) => device.role === "switch"
    );

    // Up out of the top edge, across a lane above the row, and back down. The
    // lane is inside the clear band, so it cannot cross either card.
    for (const point of peer?.points ?? []) {
      expect(point.y).toBeLessThanOrEqual(switches[0]?.box.y ?? 0);
    }
  });

  it("routes a link across a row it does not touch out to a side channel", () => {
    const layout = layoutOf(hostToRouter);
    const bypass = layout.links.find((link) => link.linkId === "link-direct");

    expect(bypass?.shape).toBe("bypass");

    // The channel is beyond every card, which is what stops the wire being
    // drawn through the row in between.
    const rightMost = layout.devices.reduce(
      (widest, device) => Math.max(widest, device.box.x + device.box.width),
      0
    );

    expect(
      Math.max(...(bypass?.points ?? []).map((point) => point.x))
    ).toBeGreaterThan(rightMost);
  });

  it("gives every wire on a device its own point on that device's edge", () => {
    // Three host links meeting a switch at one point is what made the previous
    // drawing impossible to trace. Fanned across the edge, they are separate
    // attachments a learner can follow one at a time.
    const layout = layoutOf(moduleOne);

    const atSwitch = layout.links.map((link) =>
      link.from.nodeId === "sw-1"
        ? link.points[0]
        : link.to.nodeId === "sw-1"
          ? link.points[link.points.length - 1]
          : undefined
    );

    const anchors = atSwitch
      .filter((point): point is { x: number; y: number } => point !== undefined)
      .map((point) => `${point.x},${point.y}`);

    expect(anchors).toHaveLength(4);
    expect(new Set(anchors).size).toBe(4);
  });

  it("draws no two wires along the same line", () => {
    for (const fixture of [model, moduleOne, twoSwitches, hostToRouter]) {
      const paths = layoutOf(fixture).links.map((link) => link.path);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });
});

describe("journey state comes from fields, never from adjacency", () => {
  it("marks the origin, the current device and the unreached ones", () => {
    // `pc-a` was `visited` here until Founder video UAT. It is the stage the
    // traffic did not cross a link to reach — the leg's ORIGIN — and a source
    // the traffic has left is not a device it passed through. The picture has
    // to keep saying where the journey began after the traffic moves on.
    const byId = new Map(
      layoutOf(model).devices.map((device) => [device.nodeId, device])
    );

    expect(byId.get("pc-a")?.state).toBe("origin");
    expect(byId.get("pc-a")?.stateLabel).toBe("Started here");
    expect(byId.get("sw-1")?.state).toBe("current");
    expect(byId.get("r-1")?.state).toBe("idle");
    expect(byId.get("pc-b")?.state).toBe("idle");
  });

  it("states every device state in words as well as in a class", () => {
    for (const device of layoutOf(model).devices) {
      expect(device.stateLabel).toBe(describeDeviceState(device.state));
      expect(device.stateLabel.length).toBeGreaterThan(0);
    }
  });

  it("carries every device category through to the drawing, in a word", () => {
    // The renderer selects a symbol from `role` and a caption from `roleLabel`,
    // so both have to survive the layout for a category to be recognisable.
    for (const device of layoutOf(model).devices) {
      expect(device.role).toBe(
        model.nodes.find((node) => node.nodeId === device.nodeId)?.role
      );
      expect(device.roleLabel).toBe(describeTopologyRole(device.role));
      expect(device.roleLabel.length).toBeGreaterThan(0);
    }
  });

  it("marks a link as crossed only when a revealed stage named it", () => {
    const layout = layoutOf(model);
    const byId = new Map(layout.links.map((link) => [link.linkId, link]));

    // Named by the revealed stage s2.
    expect(byId.get("link-pc-a")?.traversed).toBe(true);
    expect(byId.get("link-pc-a")?.current).toBe(true);

    // Named only by s3, which is still unknown — so not crossed, even though
    // Switch-1 and Router-1 are drawn next to each other.
    expect(byId.get("link-trunk")?.traversed).toBe(false);
    expect(byId.get("link-trunk")?.current).toBe(false);
  });

  it("highlights nothing when the source did not say which link was used", () => {
    // The first stage has no viaLinkId, because nothing was traversed to reach
    // the origin. Searching the link list for a plausible one would be exactly
    // the forwarding inference the architecture forbids.
    const atOrigin: ObservationModel = { ...model, currentStageId: "s1" };
    const layout = layoutOf(atOrigin);

    expect(layout.links.every((link) => !link.current)).toBe(true);
  });

  it("refuses to draw when a stage names a link that does not exist", () => {
    const broken: ObservationModel = {
      ...model,
      stages: model.stages.map((stage) =>
        stage.stageId === "s2" ? { ...stage, viaLinkId: "no-such-link" } : stage
      )
    };

    expect(buildTopologyLayout(broken, "pc-a").state).toBe("unavailable");
  });
});

describe("the packet reports position, not progress", () => {
  it("parks at the authored origin before anything is sent", () => {
    const unstarted: ObservationModel = {
      ...model,
      stages: model.stages.map((stage) => ({
        ...stage,
        availability: "unknown" as const
      })),
      currentStageId: null,
      consequence: null
    };

    const layout = layoutOf(unstarted);

    expect(soleMarker(layout)).toMatchObject({
      nodeId: "pc-a",
      state: "waiting",
      stateLabel: describePacketState("waiting"),
      // Waiting on the link it will leave by, not inside PC-A's card.
      linkId: "link-pc-a"
    });
  });

  it("rides the link the source named, towards the device that has it", () => {
    expect(soleMarker(layoutOf(model))).toMatchObject({
      nodeId: "sw-1",
      state: "moving",
      linkId: "link-pc-a"
    });
  });

  it("stops where the authored outcome stops it", () => {
    const stopped: ObservationModel = {
      ...model,
      stages: model.stages.map((stage) => ({
        ...stage,
        availability: "available" as const
      })),
      currentStageId: "s3",
      consequence: {
        state: "stopped",
        narration: "Router-1 discards it.",
        symptom: "100% packet loss."
      }
    };

    const layout = layoutOf(stopped);

    expect(soleMarker(layout).state).toBe("stopped");
    expect(soleMarker(layout).nodeId).toBe("r-1");
    expect(
      layout.devices.find((device) => device.nodeId === "r-1")?.state
    ).toBe("stopped");
  });

  it("confirms where the authored consequence confirms", () => {
    const confirmed: ObservationModel = {
      ...model,
      stages: model.stages.map((stage) => ({
        ...stage,
        outcome: "proceeds" as const,
        availability: "available" as const
      })),
      currentStageId: "s3",
      consequence: { state: "confirmed", narration: "The reply returns." }
    };

    const layout = layoutOf(confirmed);

    expect(soleMarker(layout).state).toBe("confirmed");
    expect(
      layout.devices.find((device) => device.nodeId === "r-1")?.state
    ).toBe("confirmed");
  });
});

describe("an unavailable model draws nothing", () => {
  it("refuses the fail-closed model rather than inventing a picture", () => {
    const layout = buildTopologyLayout(
      unavailableObservationModel("live_lab", "an ICMP echo request"),
      null
    );

    expect(layout.state).toBe("unavailable");
  });

  it("refuses a model with no devices", () => {
    expect(
      buildTopologyLayout({ ...model, nodes: [], links: [] }, null).state
    ).toBe("unavailable");
  });
});

/* ------------------------------------------------------------------ *
 * WP-I final correction — display facts on the device face
 * ------------------------------------------------------------------ */

/** The same model, with attributes the source flagged for the device face. */
const flaggedModel: ObservationModel = {
  ...model,
  nodes: model.nodes.map((node) =>
    node.nodeId !== "sw-1"
      ? node
      : {
          ...node,
          interfaces: [
            {
              interfaceId: "sw-1-fa0-1",
              label: "Fa0/1",
              attributes: [
                {
                  label: "Mode",
                  value: "access",
                  availability: "available" as const,
                  prominent: true
                },
                {
                  label: "VLAN",
                  value: "10",
                  availability: "available" as const,
                  prominent: true
                },
                {
                  // Flagged off: still fully inspectable, just not on the face.
                  label: "Description",
                  value: "Desk 14",
                  availability: "available" as const
                }
              ]
            },
            {
              interfaceId: "sw-1-fa0-24",
              label: "Fa0/24",
              attributes: [
                {
                  label: "Mode",
                  value: "trunk",
                  availability: "available" as const,
                  prominent: true
                }
              ]
            }
          ]
        }
  )
};

function portsOf(nodeId: string, source: ObservationModel) {
  const device = layoutOf(source).devices.find(
    (candidate) => candidate.nodeId === nodeId
  );
  if (device === undefined) throw new Error(`no device ${nodeId}`);
  return device.ports;
}

describe("display facts are carried, never recognised", () => {
  it("puts only the flagged attributes on the face, in authored order", () => {
    const ports = portsOf("sw-1", flaggedModel);

    expect(ports[0]?.facts).toEqual([
      { label: "Mode", value: "access" },
      { label: "VLAN", value: "10" }
    ]);
    expect(ports[1]?.facts).toEqual([{ label: "Mode", value: "trunk" }]);
  });

  it("leaves an unflagged attribute off the face without hiding it", () => {
    // Emphasis, never a filter on what a learner may see: the full inspection
    // renders every attribute from the observation model regardless.
    const ports = portsOf("sw-1", flaggedModel);

    expect(
      ports[0]?.facts.some((fact) => fact.label === "Description")
    ).toBe(false);

    const iface = flaggedModel.nodes
      .find((node) => node.nodeId === "sw-1")
      ?.interfaces[0];

    expect(iface?.attributes.map((attribute) => attribute.label)).toContain(
      "Description"
    );
  });

  it("shows nothing on the face when the source flagged nothing", () => {
    // The unflagged model is the original one. No flag, no face facts — the
    // layout does not fall back to guessing which attributes look important.
    for (const device of layoutOf(model).devices) {
      for (const port of device.ports) {
        expect(port.facts).toEqual([]);
      }
    }
  });

  it("does not recognise a label by name", () => {
    // The proof that nothing is inferred, stated two ways at once:
    //
    //   an attribute called "VLAN" that is NOT flagged stays off the face;
    //   an attribute with a label from another subject entirely, flagged, is
    //   shown without hesitation.
    //
    // A renderer that matched on "VLAN" would fail both halves, and would show
    // nothing at all for the next interaction type.
    const mixed: ObservationModel = {
      ...model,
      nodes: [
        {
          ...model.nodes[0]!,
          interfaces: [
            {
              interfaceId: "pc-a-eth0",
              label: "eth0",
              attributes: [
                {
                  label: "VLAN",
                  value: "10",
                  availability: "available" as const
                },
                {
                  label: "Filesystem",
                  value: "ext4",
                  availability: "available" as const,
                  prominent: true
                }
              ]
            }
          ]
        },
        ...model.nodes.slice(1)
      ]
    };

    expect(portsOf("pc-a", mixed)[0]?.facts).toEqual([
      { label: "Filesystem", value: "ext4" }
    ]);
  });

  it("omits a flagged attribute the source could not report", () => {
    // An unreported value is omitted rather than rendered blank, which would
    // read as "no value set". The same rule the full inspection follows.
    const unreported: ObservationModel = {
      ...model,
      nodes: [
        {
          ...model.nodes[0]!,
          interfaces: [
            {
              interfaceId: "pc-a-eth0",
              label: "eth0",
              attributes: [
                {
                  label: "VLAN",
                  value: null,
                  availability: "unavailable" as const,
                  prominent: true
                }
              ]
            }
          ]
        },
        ...model.nodes.slice(1)
      ]
    };

    expect(portsOf("pc-a", unreported)[0]?.facts).toEqual([]);
  });
});

describe("the layout is geometry and carries no networking truth", () => {
  it("copies addresses without reading them", () => {
    // Unflagged interface attributes never reach the layout at all: a device
    // face shows its ports, and the rest stays in the semantic tree.
    const serialised = JSON.stringify(layoutOf(model));

    expect(serialised).not.toContain("192.168.10.10/24");
    expect(serialised).not.toContain("IP address");
  });

  it("exposes no field a forwarding decision could be read from", () => {
    const layout = layoutOf(model);

    for (const forbidden of [
      "nextHop",
      "route",
      "reachable",
      "forwards",
      "gateway",
      "subnet",
      "mask"
    ]) {
      expect(Object.keys(layout)).not.toContain(forbidden);
      expect(Object.keys(layout.links[0]!)).not.toContain(forbidden);
      expect(Object.keys(layout.devices[0]!)).not.toContain(forbidden);
    }
  });

  it("says nothing about whether two drawn neighbours can talk", () => {
    // PC-A is drawn directly beneath Switch-1 with a wire between them, and
    // PC-B hangs off the same switch. The layout still reports no traversal for
    // either until a stage says so, because being drawn under something is not
    // a fact about the network.
    const layout = layoutOf({ ...model, stages: [], currentStageId: null });

    expect(layout.links.every((link) => !link.traversed)).toBe(true);
    expect(layout.devices.every((device) => device.state === "idle")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Device categories
 *
 * WP-J Module 1 correction. The topology now draws a symbol per category, and
 * the symbol is selected from `role` alone. These pin the two properties that
 * makes that safe: every registered role has a word, and no role borrows
 * another's.
 * ------------------------------------------------------------------ */

describe("every device category is nameable and distinct", () => {
  it("gives each registered role its own word", () => {
    const labels = OBSERVATION_NODE_ROLES.map((role) =>
      describeTopologyRole(role)
    );

    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }

    // No two categories may share a caption. A duplicate would make two
    // different kinds of device read identically to anyone using the words
    // rather than the picture — which is the accessible path.
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps the general word general", () => {
    // Mission 1 step 2 teaches that a printer is a host. Narrowing `host` to
    // "Workstation" would put the topology in direct contradiction with the
    // instruction printed beside it.
    expect(describeTopologyRole("host")).toBe("Host");
    expect(describeTopologyRole("printer")).toBe("Printer");
  });

  it("draws a printer through the layout as its own category", () => {
    const withPrinter: ObservationModel = {
      ...model,
      nodes: model.nodes.map((node) =>
        node.nodeId === "pc-b" ? { ...node, role: "printer" as const } : node
      )
    };

    const layout = buildTopologyLayout(withPrinter, "pc-a");
    if (layout.state !== "available") throw new Error("expected a layout");

    const printer = layout.devices.find((device) => device.nodeId === "pc-b");

    expect(printer?.role).toBe("printer");
    expect(printer?.roleLabel).toBe("Printer");

    // And it did not disturb anything else: same devices, same links, same
    // geometry. A category is presentation and must change no relationship.
    const before = buildTopologyLayout(model, "pc-a");
    if (before.state !== "available") throw new Error("expected a layout");

    expect(layout.devices.map((device) => device.nodeId)).toEqual(
      before.devices.map((device) => device.nodeId)
    );
    expect(layout.devices.map((device) => device.box)).toEqual(
      before.devices.map((device) => device.box)
    );
    expect(layout.links.map((link) => link.path)).toEqual(
      before.links.map((link) => link.path)
    );
    expect(layout.devices.map((device) => device.state)).toEqual(
      before.devices.map((device) => device.state)
    );
  });
});

/* ------------------------------------------------------------------ *
 * WP-J Module 1 Founder UAT correction — the topology as a hierarchy
 *
 * Founder UAT rejected the previous drawing on four counts: it read as a
 * horizontal row of cards, relationships were not visible in the arrangement,
 * wires overlapped and crossed the cards, and the traffic marker sat on top of
 * a device's text.
 *
 * Every one of those is a property of GEOMETRY, and geometry is computed here,
 * so every one of them can be pinned here. What cannot be pinned here is
 * whether the result looks like a premium product; that is Founder UAT, and no
 * assertion below claims otherwise.
 * ------------------------------------------------------------------ */

/** Whether a point is strictly inside a box, ignoring its boundary. */
function inside(
  point: { x: number; y: number },
  box: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x > box.x &&
    point.x < box.x + box.width &&
    point.y > box.y &&
    point.y < box.y + box.height
  );
}

/** Every wire, walked in small steps, so a crossing cannot hide between two
 *  corner points. */
function samplesAlong(points: readonly { x: number; y: number }[]) {
  const samples: { x: number; y: number }[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const steps = Math.max(
      2,
      Math.ceil(Math.hypot(to.x - from.x, to.y - from.y))
    );

    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      samples.push({
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio
      });
    }
  }

  return samples;
}

/**
 * Mission 2's shape: one arrival, and copies leaving on two other links at the
 * same authored moment.
 *
 * The links are AUTHORED on the stage. Nothing here works out which of
 * Switch-1's four connections should be busy — that is the switching
 * calculation this module must never contain.
 */
const simultaneous: ObservationModel = {
  ...moduleOne,
  stages: [
    {
      stageId: "f1-pc-a",
      atNodeId: "pc-a",
      narration: "PC-A sends the file.",
      outcome: "proceeds",
      availability: "available"
    },
    {
      stageId: "f2-copies-leave",
      atNodeId: "sw-1",
      narration: "Copies leave on both other connections at once.",
      outcome: "proceeds",
      viaLinkId: "link-pc-a",
      alsoOnLinkIds: ["link-pc-b", "link-printer"],
      availability: "available"
    }
  ],
  currentStageId: "f2-copies-leave"
};

const everyShape: readonly [string, ObservationModel][] = [
  ["the architecture fixture", model],
  ["Module 1", moduleOne],
  ["Module 1 with its authored group", moduleOneGrouped],
  ["two authored groups", twoGroups],
  ["two switches side by side", twoSwitches],
  ["an end device attached across a row", hostToRouter],
  ["one arrival with simultaneous copies", simultaneous]
];

describe("the drawing is a hierarchy, not a row of cards", () => {
  it("puts Module 1's switch between its router and its end devices", () => {
    const byId = new Map(
      layoutOf(moduleOne).devices.map((device) => [device.nodeId, device])
    );

    const router = byId.get("r-1")!;
    const switched = byId.get("sw-1")!;

    // The Founder's target shape: Router-1 at the edge of the drawing,
    // Switch-1 in the middle, the end devices branching below it.
    expect(router.row).toBe(0);
    expect(switched.row).toBe(1);

    for (const endpoint of ["pc-a", "pc-b", "printer"]) {
      expect(byId.get(endpoint)?.row).toBe(2);
      expect(byId.get(endpoint)!.box.y).toBeGreaterThan(switched.box.y);
    }

    expect(switched.box.y).toBeGreaterThan(router.box.y);
  });

  it("centres an intermediary device over what is attached to it", () => {
    const byId = new Map(
      layoutOf(moduleOne).devices.map((device) => [device.nodeId, device])
    );

    const centre = (nodeId: string) => {
      const box = byId.get(nodeId)!.box;
      return box.x + box.width / 2;
    };

    // Switch-1 sits over PC-B, which sits between PC-A and the Printer. That
    // is what makes "these three hang off that one" readable without reading.
    expect(centre("sw-1")).toBeCloseTo(
      (centre("pc-a") + centre("pc-b") + centre("printer")) / 3,
      5
    );
    expect(centre("r-1")).toBeCloseTo(centre("sw-1"), 5);
  });

  it("never draws two rows on the same line", () => {
    for (const [name, fixture] of everyShape) {
      const layout = layoutOf(fixture);
      const tops = new Map<number, number>();

      for (const device of layout.devices) {
        const seen = tops.get(device.row);
        if (seen === undefined) {
          tops.set(device.row, device.box.y);
          continue;
        }
        expect(`${name}: ${device.box.y}`).toBe(`${name}: ${seen}`);
      }

      expect(new Set([...tops.values()]).size).toBe(tops.size);
    }
  });

  it("leaves clear space between every pair of cards", () => {
    for (const [name, fixture] of everyShape) {
      const devices = layoutOf(fixture).devices;

      for (const left of devices) {
        for (const right of devices) {
          if (left.nodeId === right.nodeId) continue;

          const overlaps =
            left.box.x < right.box.x + right.box.width &&
            right.box.x < left.box.x + left.box.width &&
            left.box.y < right.box.y + right.box.height &&
            right.box.y < left.box.y + left.box.height;

          expect(`${name}: ${left.nodeId}/${right.nodeId} ${overlaps}`).toBe(
            `${name}: ${left.nodeId}/${right.nodeId} false`
          );
        }
      }
    }
  });

  it("keeps every card inside the canvas it asks the renderer to reserve", () => {
    for (const [name, fixture] of everyShape) {
      const layout = layoutOf(fixture);

      for (const device of layout.devices) {
        expect(device.box.x).toBeGreaterThanOrEqual(0);
        expect(device.box.y).toBeGreaterThanOrEqual(0);
        expect(`${name}: ${device.box.x + device.box.width <= layout.frame.width}`).toBe(
          `${name}: true`
        );
        expect(
          `${name}: ${device.box.y + device.box.height <= layout.frame.height}`
        ).toBe(`${name}: true`);
      }
    }
  });
});

describe("no wire is drawn through a device", () => {
  it("keeps every wire clear of every card, in every shape", () => {
    for (const [name, fixture] of everyShape) {
      const layout = layoutOf(fixture);

      for (const link of layout.links) {
        for (const point of samplesAlong(link.points)) {
          for (const device of layout.devices) {
            expect(`${name} ${link.linkId} ${inside(point, device.box)}`).toBe(
              `${name} ${link.linkId} false`
            );
          }
        }
      }
    }
  });

  it("starts and ends each wire on the edge of the device it names", () => {
    for (const [name, fixture] of everyShape) {
      const layout = layoutOf(fixture);
      const byId = new Map(
        layout.devices.map((device) => [device.nodeId, device])
      );

      for (const link of layout.links) {
        const first = link.points[0]!;
        const last = link.points[link.points.length - 1]!;

        // On the boundary — zero distance to the box, and not inside it. A
        // wire that stopped short would show an attachment that is not made.
        expect(
          `${name} ${link.linkId} ${distanceToBox(first, byId.get(link.from.nodeId)!.box)}`
        ).toBe(`${name} ${link.linkId} 0`);
        expect(
          `${name} ${link.linkId} ${distanceToBox(last, byId.get(link.to.nodeId)!.box)}`
        ).toBe(`${name} ${link.linkId} 0`);
      }
    }
  });

  it("draws Module 1's host links as four separate branches", () => {
    // The trace test: PC-A to Switch-1 has to be one line a learner can follow
    // with their eye, not a shared corridor.
    const layout = layoutOf(moduleOne);

    for (const link of layout.links) {
      expect(link.shape).toBe("branch");
      expect(link.points).toHaveLength(2);
    }

    const midpoints = layout.links.map((link) => {
      const [from, to] = [link.points[0]!, link.points[1]!];
      return `${(from.x + to.x) / 2},${(from.y + to.y) / 2}`;
    });

    expect(new Set(midpoints).size).toBe(midpoints.length);
  });
});

describe("the traffic marker never covers a device", () => {
  it("sits outside every card, in every shape and at every point of the journey", () => {
    for (const [name, fixture] of everyShape) {
      for (let revealed = 0; revealed <= fixture.stages.length; revealed += 1) {
        const walked: ObservationModel = {
          ...fixture,
          stages: fixture.stages.map((stage, index) => ({
            ...stage,
            availability:
              index < revealed ? ("available" as const) : ("unknown" as const)
          })),
          currentStageId:
            revealed === 0 ? null : (fixture.stages[revealed - 1]?.stageId ?? null)
        };

        const layout = layoutOf(walked);

        // EVERY marker, not just the first. A stage that names several links
        // draws several markers, and the Founder-accepted rule — a marker
        // never covers device content — has to hold for all of them or the
        // guarantee is only true of whichever one happened to be drawn first.
        for (const marker of layout.packets) {
          for (const device of layout.devices) {
            // Not merely outside the box — clear of it by more than the
            // marker's own radius, so the dot itself never touches a card.
            expect(
              `${name} ${marker.linkId} ${device.nodeId} ${distanceToBox(marker.at, device.box) > 6}`
            ).toBe(`${name} ${marker.linkId} ${device.nodeId} true`);
          }
        }
      }
    }
  });

  it("waits outside the origin rather than inside it", () => {
    const unstarted: ObservationModel = {
      ...moduleOne,
      stages: moduleOne.stages.map((stage) => ({
        ...stage,
        availability: "unknown" as const
      })),
      currentStageId: null,
      consequence: null
    };

    const layout = layoutOf(unstarted);
    const origin = layout.devices.find((device) => device.nodeId === "pc-a")!;

    expect(soleMarker(layout).state).toBe("waiting");
    expect(soleMarker(layout).linkId).toBe("link-pc-a");
    expect(
      distanceToBox(soleMarker(layout).at, origin.box)
    ).toBeGreaterThanOrEqual(MARKER_CLEARANCE);
  });

  it("arrives beside the device that has the traffic, not on top of it", () => {
    const layout = layoutOf(moduleOne);
    const switched = layout.devices.find((device) => device.nodeId === "sw-1")!;

    expect(soleMarker(layout).nodeId).toBe("sw-1");
    expect(soleMarker(layout).linkId).toBe("link-pc-a");
    expect(
      distanceToBox(soleMarker(layout).at, switched.box)
    ).toBeGreaterThanOrEqual(MARKER_CLEARANCE);

    // And the DEVICE, separately, says the traffic is here. Two claims, two
    // presentations; the marker is transit and the state is arrival.
    expect(switched.state).toBe("current");
    expect(switched.stateLabel).toBe(describeDeviceState("current"));
  });
});

describe("the arrangement is available without sight", () => {
  it("names every row, every device's category and every line drawn", () => {
    const layout = layoutOf(moduleOne);

    expect(layout.description).toContain("3 rows");
    expect(layout.description).toContain("Row 1: Router-1, a router.");
    expect(layout.description).toContain("Row 2: Switch-1, a switch.");
    expect(layout.description).toContain(
      "Row 3: PC-A, a host; PC-B, a host; Printer, a printer."
    );
    expect(layout.description).toContain("PC-A and Switch-1");
    expect(layout.description).toContain("Router-1 and Switch-1");
  });

  it("mentions every device and every link, in every shape", () => {
    for (const [, fixture] of everyShape) {
      const layout = layoutOf(fixture);

      for (const device of layout.devices) {
        expect(layout.description).toContain(device.label);
      }
      expect(layout.description.split(";").length).toBeGreaterThanOrEqual(
        layout.links.length
      );
    }
  });

  it("claims no grouping when the author declared none", () => {
    // The picture may not assert that a set of devices belongs together unless
    // an author said so. A model with no groups therefore says nothing about
    // membership at all — no "contains", no "outside", and no invented name.
    for (const fixture of [model, moduleOne, twoSwitches, hostToRouter]) {
      const layout = layoutOf(fixture);

      expect(layout.groups).toEqual([]);

      const description = layout.description.toLowerCase();

      for (const claim of ["contains", "outside", "network", "subnet", "zone"]) {
        expect(description).not.toContain(claim);
      }
    }
  });
});

describe("geometry is presentation, and stays that way", () => {
  it("puts a device in a row from its authored category alone", () => {
    // Changing what a device IS moves where it is drawn. Changing what it is
    // ATTACHED to does not change what it is. Neither is a claim about traffic.
    const asSwitch: ObservationModel = {
      ...moduleOne,
      nodes: moduleOne.nodes.map((entry) =>
        entry.nodeId === "printer" ? { ...entry, role: "switch" as const } : entry
      )
    };

    const before = layoutOf(moduleOne).devices.find(
      (device) => device.nodeId === "printer"
    );
    const after = layoutOf(asSwitch).devices.find(
      (device) => device.nodeId === "printer"
    );

    expect(before?.row).toBe(2);
    expect(after?.row).toBe(1);
  });

  it("exposes no coordinate a forwarding decision could be read from", () => {
    const layout = layoutOf(moduleOne);

    // Geometry answers "where is this drawn". It answers nothing else, and
    // there is no field here from which a next hop could be recovered.
    for (const forbidden of [
      "nextHop",
      "route",
      "reachable",
      "forwards",
      "gateway",
      "subnet",
      "mask",
      "group",
      "network"
    ]) {
      expect(Object.keys(layout)).not.toContain(forbidden);
      expect(Object.keys(layout.links[0]!)).not.toContain(forbidden);
      expect(Object.keys(layout.devices[0]!)).not.toContain(forbidden);
    }
  });

  it("draws the same picture whatever the journey has done", () => {
    // State changes what a card LOOKS like. It may never change where anything
    // is: a picture that rearranged itself as traffic moved would be asserting
    // that the network changed.
    const untouched = layoutOf({
      ...moduleOne,
      stages: [],
      currentStageId: null,
      consequence: null
    });

    const walked = layoutOf(moduleOne);

    expect(walked.devices.map((device) => device.box)).toEqual(
      untouched.devices.map((device) => device.box)
    );
    expect(walked.links.map((link) => link.path)).toEqual(
      untouched.links.map((link) => link.path)
    );
    expect(walked.frame).toEqual(untouched.frame);
  });

  it("is the same layout at every viewport, because it has no viewport", () => {
    // Responsiveness is the renderer's: the drawing keeps its true size and
    // scrolls inside its own box on a narrow screen. Nothing here can produce
    // a different structure at a different width, so a narrow layout cannot
    // silently lose a relationship.
    expect(buildTopologyLayout(moduleOne, "pc-a")).toEqual(
      buildTopologyLayout(moduleOne, "pc-a")
    );
  });
});

/* ------------------------------------------------------------------ *
 * Authored topology groups
 *
 * The Architect approved one additive authored fact — `ObservationNode.groupId`
 * against a declared `ObservationGroup` — precisely so the picture could stop
 * refusing to show which devices belong together.
 *
 * The whole value of that decision rests on one property: **membership is
 * authored and is never worked out.** These tests exist to make that property
 * expensive to break, which is why several of them assert what the layout does
 * NOT do rather than what it does.
 * ------------------------------------------------------------------ */

describe("group membership is authored, never inferred", () => {
  it("draws a boundary only around the devices the author named", () => {
    const layout = layoutOf(moduleOneGrouped);

    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0]?.groupId).toBe("local-network");
    expect(layout.groups[0]?.label).toBe("Local network");
    expect(layout.groups[0]?.nodeIds).toEqual([
      "pc-a",
      "pc-b",
      "printer",
      "sw-1"
    ]);
  });

  it("carries each device's authored group through unchanged", () => {
    const byId = new Map(
      layoutOf(moduleOneGrouped).devices.map((device) => [device.nodeId, device])
    );

    for (const member of ["pc-a", "pc-b", "printer", "sw-1"]) {
      expect(byId.get(member)?.groupId).toBe("local-network");
    }

    // The one the author left out stays out. Nothing promotes it on the basis
    // of being attached to a member.
    expect(byId.get("r-1")?.groupId).toBeNull();
  });

  it("groups nothing when the author grouped nothing", () => {
    // The same five devices, the same links, the same roles — and no boundary,
    // because the only thing that changed is the authored field. If any rule
    // in the layout could work membership out, this fixture would grow a group.
    expect(layoutOf(moduleOne).groups).toEqual([]);
    expect(
      layoutOf(moduleOne).devices.every((device) => device.groupId === null)
    ).toBe(true);
  });

  it("does not group by role", () => {
    // Two hosts and a printer share no group here, and the switch and router
    // are not paired as "infrastructure". Category selects a row and a symbol
    // and nothing else.
    const layout = layoutOf(moduleOne);
    expect(layout.groups).toEqual([]);
    expect(layout.devices.map((device) => device.groupId)).toEqual([
      null,
      null,
      null,
      null,
      null
    ]);
  });

  it("does not group by what is connected to what", () => {
    // Every device in `hostToRouter` is reachable from every other through the
    // authored links. Connectivity is not membership, and nothing walks it.
    expect(layoutOf(hostToRouter).groups).toEqual([]);
  });

  it("refuses to draw when a device names a group that was not declared", () => {
    const dangling: ObservationModel = {
      ...moduleOneGrouped,
      groups: []
    };

    // Fail closed, in the same way a dangling link endpoint does. Inventing
    // the missing group would be exactly the inference this contract removes.
    expect(buildTopologyLayout(dangling, "pc-a").state).toBe("unavailable");
  });

  it("draws no boundary for a group nothing belongs to", () => {
    const unused: ObservationModel = {
      ...moduleOne,
      groups: [{ groupId: "local-network", label: "Local network" }]
    };

    // Declared but empty. An empty boundary would assert a grouping with no
    // members in it, so nothing is drawn.
    expect(layoutOf(unused).groups).toEqual([]);
  });
});

describe("group geometry follows membership, and never the other way round", () => {
  it("encloses every member's card", () => {
    for (const fixture of [moduleOneGrouped, twoGroups]) {
      const layout = layoutOf(fixture);

      for (const group of layout.groups) {
        for (const nodeId of group.nodeIds) {
          const device = layout.devices.find(
            (candidate) => candidate.nodeId === nodeId
          );
          if (device === undefined) throw new Error(`no device ${nodeId}`);

          expect(device.box.x).toBeGreaterThanOrEqual(group.box.x);
          expect(device.box.y).toBeGreaterThanOrEqual(group.box.y);
          expect(device.box.x + device.box.width).toBeLessThanOrEqual(
            group.box.x + group.box.width
          );
          expect(device.box.y + device.box.height).toBeLessThanOrEqual(
            group.box.y + group.box.height
          );
        }
      }
    }
  });

  it("encloses nobody else, in every shape", () => {
    // The property the whole treatment rests on: a boundary that swallowed a
    // non-member would assert a membership the author never wrote. A layout
    // that cannot achieve this refuses to draw rather than drawing it wrong.
    for (const [name, fixture] of everyShape) {
      const layout = layoutOf(fixture);

      for (const group of layout.groups) {
        for (const device of layout.devices) {
          if (device.groupId === group.groupId) continue;

          const overlaps =
            device.box.x < group.box.x + group.box.width &&
            group.box.x < device.box.x + device.box.width &&
            device.box.y < group.box.y + group.box.height &&
            group.box.y < device.box.y + device.box.height;

          expect(`${name} ${group.groupId}/${device.nodeId} ${overlaps}`).toBe(
            `${name} ${group.groupId}/${device.nodeId} false`
          );
        }
      }
    }
  });

  it("keeps every boundary inside the canvas", () => {
    for (const [name, fixture] of everyShape) {
      const layout = layoutOf(fixture);

      for (const group of layout.groups) {
        expect(group.box.x).toBeGreaterThanOrEqual(0);
        expect(group.box.y).toBeGreaterThanOrEqual(0);
        expect(
          `${name} ${group.box.x + group.box.width <= layout.frame.width}`
        ).toBe(`${name} true`);
        expect(
          `${name} ${group.box.y + group.box.height <= layout.frame.height}`
        ).toBe(`${name} true`);
      }
    }
  });

  it("puts the caption in the boundary's own header strip", () => {
    const group = layoutOf(moduleOneGrouped).groups[0];
    if (group === undefined) throw new Error("expected a group");

    // Inside the box, above every member card, so it can never sit over a
    // device or a wire.
    expect(group.labelAt.x).toBeGreaterThan(group.box.x);
    expect(group.labelAt.y).toBeGreaterThan(group.box.y);
    expect(group.labelAt.y).toBeLessThan(group.box.y + GROUP_LABEL_HEIGHT);

    for (const device of layoutOf(moduleOneGrouped).devices) {
      if (device.groupId !== group.groupId) continue;
      expect(group.labelAt.y).toBeLessThan(device.box.y);
    }
  });

  it("cannot change who is in the group by moving the box", () => {
    // Membership and geometry are independent in one direction only. Making a
    // card taller moves every boundary — and moves nobody between groups.
    const taller: ObservationModel = {
      ...moduleOneGrouped,
      nodes: moduleOneGrouped.nodes.map((entry) =>
        entry.nodeId !== "sw-1"
          ? entry
          : {
              ...entry,
              interfaces: entry.interfaces.map((iface, index) =>
                index !== 0
                  ? iface
                  : {
                      ...iface,
                      attributes: [
                        {
                          label: "Kind of device",
                          value: "A device in the middle",
                          availability: "available" as const,
                          prominent: true
                        }
                      ]
                    }
              )
            }
      )
    };

    const before = layoutOf(moduleOneGrouped);
    const after = layoutOf(taller);

    expect(after.groups[0]?.box).not.toEqual(before.groups[0]?.box);
    expect(after.groups[0]?.nodeIds).toEqual(before.groups[0]?.nodeIds);
    expect(after.devices.map((device) => device.groupId)).toEqual(
      before.devices.map((device) => device.groupId)
    );
  });

  it("leaves the hierarchy and the wires exactly as they were", () => {
    // Adding the authored group must not have disturbed the approved layout:
    // same rows, same order, same wire shapes, same marker.
    const plain = layoutOf(moduleOne);
    const grouped = layoutOf(moduleOneGrouped);

    expect(grouped.rows).toBe(plain.rows);
    expect(grouped.devices.map((device) => [device.row, device.order])).toEqual(
      plain.devices.map((device) => [device.row, device.order])
    );
    expect(grouped.links.map((link) => link.shape)).toEqual(
      plain.links.map((link) => link.shape)
    );
    expect(grouped.packets.map((marker) => marker.nodeId)).toEqual(
      plain.packets.map((marker) => marker.nodeId)
    );
    expect(grouped.packets.map((marker) => marker.linkId)).toEqual(
      plain.packets.map((marker) => marker.linkId)
    );
  });
});

describe("two authored groups coexist", () => {
  it("draws both, separately, with their own labels", () => {
    const layout = layoutOf(twoGroups);

    expect(layout.groups.map((group) => group.groupId)).toEqual([
      "network-a",
      "network-b"
    ]);
    expect(layout.groups.map((group) => group.label)).toEqual([
      "Network A",
      "Network B"
    ]);
    expect(layout.groups[0]?.nodeIds).toEqual(["sw-a", "pc-a", "pc-b"]);
    expect(layout.groups[1]?.nodeIds).toEqual(["sw-b", "pc-c", "pc-d"]);
  });

  it("does not merge them", () => {
    const [first, second] = layoutOf(twoGroups).groups;
    if (first === undefined || second === undefined) {
      throw new Error("expected two groups");
    }

    const overlaps =
      first.box.x < second.box.x + second.box.width &&
      second.box.x < first.box.x + first.box.width &&
      first.box.y < second.box.y + second.box.height &&
      second.box.y < first.box.y + first.box.height;

    expect(overlaps).toBe(false);
  });

  it("does not let the two captions collide", () => {
    const [first, second] = layoutOf(twoGroups).groups;
    if (first === undefined || second === undefined) {
      throw new Error("expected two groups");
    }

    expect(first.labelAt).not.toEqual(second.labelAt);

    // The captions live in boxes that do not overlap, so the labels cannot
    // either; this pins the horizontal separation directly as well.
    expect(second.labelAt.x).toBeGreaterThan(first.box.x + first.box.width);
  });

  it("keeps the wires routable and clear of every card", () => {
    const layout = layoutOf(twoGroups);

    // Router-1 reaches both switches, and both are ordinary branches — the
    // grouping changed the spacing, not the routing.
    expect(layout.links.map((link) => link.shape)).toEqual([
      "branch",
      "branch",
      "branch",
      "branch",
      "branch",
      "branch"
    ]);

    for (const link of layout.links) {
      for (const point of samplesAlong(link.points)) {
        for (const device of layout.devices) {
          expect(inside(point, device.box)).toBe(false);
        }
      }
    }
  });

  it("keeps each device in the group its author gave it", () => {
    const byId = new Map(
      layoutOf(twoGroups).devices.map((device) => [device.nodeId, device.groupId])
    );

    expect(byId.get("pc-a")).toBe("network-a");
    expect(byId.get("pc-b")).toBe("network-a");
    expect(byId.get("sw-a")).toBe("network-a");
    expect(byId.get("pc-c")).toBe("network-b");
    expect(byId.get("pc-d")).toBe("network-b");
    expect(byId.get("sw-b")).toBe("network-b");

    // The router is attached to both switches and belongs to neither group.
    // Nothing about being connected to a member makes a device one.
    expect(byId.get("r-1")).toBeNull();
  });
});

describe("grouping is available without sight", () => {
  it("states the authored membership in words", () => {
    const description = layoutOf(moduleOneGrouped).description;

    expect(description).toContain(
      "Local network contains PC-A, PC-B, Printer and Switch-1."
    );
    expect(description).toContain("Router-1 is drawn outside Local network.");
  });

  it("names both groups when there are two", () => {
    const description = layoutOf(twoGroups).description;

    expect(description).toContain(
      "Network A contains Switch-A, PC-A and PC-B."
    );
    expect(description).toContain(
      "Network B contains Switch-B, PC-C and PC-D."
    );
    expect(description).toContain(
      "Router-1 is drawn outside every group shown."
    );
  });

  it("says nothing a boundary graphic says that the words do not", () => {
    // Every group drawn is described, and every device named as a member is a
    // device the author put in that group.
    for (const [, fixture] of everyShape) {
      const layout = layoutOf(fixture);

      for (const group of layout.groups) {
        expect(layout.description).toContain(`${group.label} contains `);

        for (const nodeId of group.nodeIds) {
          const device = layout.devices.find(
            (candidate) => candidate.nodeId === nodeId
          );
          expect(device?.groupId).toBe(group.groupId);
          expect(layout.description).toContain(device?.label ?? "");
        }
      }
    }
  });

  it("still describes the rows and the lines", () => {
    // Grouping is added to the description, never instead of it.
    const description = layoutOf(moduleOneGrouped).description;

    expect(description).toContain("The diagram is drawn in 3 rows");
    expect(description).toContain("Row 2: Switch-1, a switch.");
    expect(description).toContain("A line is drawn between");
  });
});

describe("a group carries no networking meaning", () => {
  it("exposes only an id, a label, members and a rectangle", () => {
    const group = layoutOf(moduleOneGrouped).groups[0];
    if (group === undefined) throw new Error("expected a group");

    expect(Object.keys(group).sort()).toEqual([
      "box",
      "groupId",
      "label",
      "labelAt",
      "nodeIds"
    ]);
  });

  it("offers no field a networking claim could be read from", () => {
    const group = layoutOf(moduleOneGrouped).groups[0];
    if (group === undefined) throw new Error("expected a group");

    for (const forbidden of [
      "subnet",
      "mask",
      "vlan",
      "broadcastDomain",
      "routingDomain",
      "gateway",
      "reachable",
      "trustZone",
      "location",
      "parentGroupId"
    ]) {
      expect(Object.keys(group)).not.toContain(forbidden);
    }
  });

  it("says nothing about whether two devices in one group can talk", () => {
    // PC-A and the Printer are in the same authored group and are drawn inside
    // the same field. The layout still reports no traversal between them until
    // a stage says so, because being grouped is not a fact about traffic.
    const idle = layoutOf({
      ...moduleOneGrouped,
      stages: [],
      currentStageId: null,
      consequence: null
    });

    expect(idle.links.every((link) => !link.traversed)).toBe(true);
    expect(idle.devices.every((device) => device.state === "idle")).toBe(true);
  });

  it("does not nest", () => {
    // No group is a member of a group in this slice, so there is no tree to
    // walk and no containment to compute.
    for (const [, fixture] of everyShape) {
      for (const group of layoutOf(fixture).groups) {
        expect(Object.keys(group)).not.toContain("groupId2");
        expect(Object.keys(group)).not.toContain("parent");
        expect(group.nodeIds.every((id) => typeof id === "string")).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * WP-J Module 1 Founder UAT — the drawing has to fit the workspace
 *
 * The finding was that the learner did not know what to do, because the first
 * action was below the fold. A topology that fills the viewport is a large part
 * of how that happens, and it is the part this module can be held to.
 *
 * These are budgets rather than measurements: they fail when a constant is
 * tuned in a way that would push the current task off the screen again, which
 * is a defect no browserless test could otherwise see.
 * ------------------------------------------------------------------ */

describe("the drawing leaves room for the task beside it", () => {
  it("fits the lesson's reading column without scrolling sideways", () => {
    for (const [name, fixture] of everyShape) {
      const layout = layoutOf(fixture);

      // The two-group fixture is a synthetic worst case with seven devices and
      // is allowed to scroll; the shapes Module 1 actually authors are not.
      if (fixture === twoGroups) continue;

      expect(`${name}: ${layout.frame.width <= TOPOLOGY_WIDTH_BUDGET}`).toBe(
        `${name}: true`
      );
    }
  });

  it("leaves vertical room for the orientation above and the task below", () => {
    for (const [name, fixture] of everyShape) {
      const layout = layoutOf(fixture);

      expect(`${name}: ${layout.frame.height <= TOPOLOGY_HEIGHT_BUDGET}`).toBe(
        `${name}: true`
      );
    }
  });

  it("still draws every device large enough to read", () => {
    // The budget must not be met by shrinking the cards until their labels stop
    // being legible — the Founder ruled that out explicitly, and it would trade
    // one unusable picture for another.
    expect(NODE_WIDTH).toBeGreaterThanOrEqual(140);
    expect(NODE_BASE_HEIGHT).toBeGreaterThanOrEqual(88);

    for (const device of layoutOf(moduleOneGrouped).devices) {
      expect(device.box.width).toBe(NODE_WIDTH);
      expect(device.box.height).toBeGreaterThanOrEqual(NODE_BASE_HEIGHT);
    }
  });

  it("keeps the hierarchy while it fits", () => {
    // The budget is met by tuning spacing, never by collapsing the drawing:
    // three rows, a central switch, three branches and a boundary are all
    // still there at the smaller size.
    const layout = layoutOf(moduleOneGrouped);

    expect(layout.rows).toBe(3);
    expect(layout.groups).toHaveLength(1);
    expect(layout.links.every((link) => link.shape === "branch")).toBe(true);
  });
});

describe("one authored moment can occupy several links at once", () => {
  /**
   * WP-J3 Mission 2 — authored simultaneous egress.
   *
   * Mission 1's walkthrough moved one marker along one wire at a time, and
   * that was honest because one thing was moving. Mission 2's switch has not
   * learned where the destination is, so it sends copies out of its other
   * connections AT THE SAME MOMENT — and drawing that as a queue of arrivals
   * would teach serial forwarding, which is a different and wrong behaviour.
   *
   * Every link named here is authored. This module is given the ids and draws
   * them; it does not decide which connections a switch would use.
   */
  it("draws one marker per authored link", () => {
    const layout = layoutOf(simultaneous);

    expect(layout.packets).toHaveLength(3);
    expect(layout.packets.map((marker) => marker.linkId).sort()).toEqual([
      "link-pc-a",
      "link-pc-b",
      "link-printer"
    ]);
  });

  it("anchors every marker at the one device the stage happened at", () => {
    // What makes it read as one event rather than three. All three copies
    // leave the same card together, rather than appearing at three ends of
    // the network at once.
    const layout = layoutOf(simultaneous);

    expect(
      new Set(layout.packets.map((marker) => marker.nodeId))
    ).toEqual(new Set(["sw-1"]));
  });

  it("gives every marker the same state, because it is one delivery", () => {
    const layout = layoutOf(simultaneous);

    expect(new Set(layout.packets.map((marker) => marker.state))).toEqual(
      new Set(["moving"])
    );
  });

  it("lights every authored link and nothing else", () => {
    const layout = layoutOf(simultaneous);
    const current = layout.links
      .filter((link) => link.current)
      .map((link) => link.linkId)
      .sort();

    expect(current).toEqual(["link-pc-a", "link-pc-b", "link-printer"]);
    // Switch-1 also connects to Router-1. Nothing authored that link, so
    // nothing may light it — if this ever fails, something started working
    // out which ports a switch "would" use.
    expect(current).not.toContain("link-router");
  });

  it("records every authored link as traversed, so a still picture keeps them", () => {
    // Reduced motion removes movement, not information. With the marker
    // animation gone, `traversed` is what still says both copies went out,
    // so it has to cover every link the moment occupied.
    const layout = layoutOf(simultaneous);
    const traversed = layout.links
      .filter((link) => link.traversed)
      .map((link) => link.linkId)
      .sort();

    expect(traversed).toEqual(["link-pc-a", "link-pc-b", "link-printer"]);
  });

  it("keeps every marker clear of every card", () => {
    // The Founder-accepted rule from Mission 1, applied to all of them. The
    // sweep above covers this fixture too; this states it directly so the
    // guarantee is legible on its own.
    const layout = layoutOf(simultaneous);

    for (const marker of layout.packets) {
      for (const device of layout.devices) {
        expect(
          `${marker.linkId} ${device.nodeId} ${distanceToBox(marker.at, device.box) > 6}`
        ).toBe(`${marker.linkId} ${device.nodeId} true`);
      }
    }
  });

  it("gives each marker its own position, so none is hidden under another", () => {
    const layout = layoutOf(simultaneous);
    const points = layout.packets.map((marker) => `${marker.at.x},${marker.at.y}`);

    expect(new Set(points).size).toBe(points.length);
  });

  it("fits every marker inside the canvas it reports", () => {
    const layout = layoutOf(simultaneous);

    for (const marker of layout.packets) {
      expect(marker.at.y).toBeLessThanOrEqual(layout.frame.height);
      expect(marker.at.x).toBeLessThanOrEqual(layout.frame.width);
    }
  });

  it("still draws exactly one marker when a stage names one link", () => {
    // The additive guarantee: every journey authored before this field
    // existed behaves exactly as it did.
    expect(layoutOf(moduleOne).packets).toHaveLength(1);
  });

  it("refuses to draw when an authored simultaneous link does not exist", () => {
    // Fail closed, exactly as a dangling `viaLinkId` does. Highlighting
    // nothing and looking finished is the failure mode worth avoiding.
    const dangling: ObservationModel = {
      ...simultaneous,
      stages: simultaneous.stages.map((stage) =>
        stage.stageId === "f2-copies-leave"
          ? { ...stage, alsoOnLinkIds: ["link-nope"] }
          : stage
      )
    };

    expect(buildTopologyLayout(dangling, "pc-a").state).toBe("unavailable");
  });

  it("decides nothing from device roles", () => {
    // The structural proof. Make every device a switch and the authored
    // links are unchanged, because nothing consulted what a device IS.
    const rolesChanged: ObservationModel = {
      ...simultaneous,
      nodes: simultaneous.nodes.map((node) => ({
        ...node,
        role: "switch" as const
      }))
    };

    const before = layoutOf(simultaneous);
    const after = layoutOf(rolesChanged);

    expect(after.links.filter((link) => link.current).map((l) => l.linkId)).toEqual(
      before.links.filter((link) => link.current).map((l) => l.linkId)
    );
    expect(after.packets).toHaveLength(before.packets.length);
  });
});

describe("authored port labels are drawn beside their connections", () => {
  /**
   * The approved Mission 1 specification, "TOPOLOGY AS INSTRUCTION": a learner
   * should not have to open an inspector to find out which port a device is
   * plugged into, because the walkthrough says "PC-A's link ends at port 1 on
   * Switch-1" and that sentence is about nothing visible unless the picture
   * names the port.
   *
   * Which ends are named is the AUTHOR's decision, carried on the interface.
   * Nothing here works it out from a device's role, from where a wire happens
   * to sit, or from the order the nodes were declared in.
   */
  /*
    The fixture's `node()` helper labels each interface with its own id, which
    would let a bug that drew `interfaceId` pass unnoticed. These get real
    labels, so the assertions below prove the AUTHORED LABEL reaches the
    picture rather than the identifier beside it.
  */
  const portNames: Record<string, string> = {
    "sw-1-p1": "Port 1",
    "sw-1-p2": "Port 2",
    "sw-1-p3": "Port 3",
    "sw-1-p4": "Port 4"
  };

  const labelled: ObservationModel = {
    ...moduleOne,
    nodes: moduleOne.nodes.map((node) =>
      node.nodeId === "sw-1"
        ? {
            ...node,
            interfaces: node.interfaces.map((iface) => ({
              ...iface,
              label: portNames[iface.interfaceId] ?? iface.label,
              ...(iface.interfaceId === "sw-1-p4" ? {} : { prominent: true })
            }))
          }
        : node
    )
  };

  it("draws nothing when the author flagged nothing", () => {
    // Additive: every topology authored before the flag existed is unchanged.
    expect(layoutOf(moduleOne).portLabels).toEqual([]);
  });

  it("draws one label per flagged end, using the authored text", () => {
    const labels = layoutOf(labelled).portLabels;

    expect(labels.map((port) => port.text).sort()).toEqual([
      "Port 1",
      "Port 2",
      "Port 3"
    ]);
  });

  it("leaves an unflagged end unlabelled, on a wire that has one", () => {
    // Port 4 is a real port on the same device, listed and inspectable, and
    // deliberately not drawn. It is the proof the flag is a decision: a
    // layout that labelled "the switch's ports" would have drawn this too.
    const labels = layoutOf(labelled).portLabels;

    expect(labels.map((port) => port.interfaceId)).not.toContain("sw-1-p4");
    expect(labels.every((port) => port.nodeId === "sw-1")).toBe(true);
  });

  it("puts each label near the device that owns the interface", () => {
    // "Device, then port, then connection" — the label belongs to the socket
    // it names, not to the middle of the wire. Close enough to read as part
    // of Switch-1, and outside the card so it never covers device text.
    const layout = layoutOf(labelled);
    const box = layout.devices.find((device) => device.nodeId === "sw-1")?.box;
    if (box === undefined) throw new Error("expected Switch-1");

    for (const port of layout.portLabels) {
      const distance = distanceToBox(port.at, box);
      expect(`${port.text} ${distance > 0 && distance < 40}`).toBe(
        `${port.text} true`
      );
    }
  });

  it("keeps every label off the wire, so traffic never covers it", () => {
    // A marker rides the wire. A label sitting in the same lane would be
    // hidden by the traffic at exactly the moment the learner wants to read
    // which port it went out of.
    const layout = layoutOf(labelled);

    for (const port of layout.portLabels) {
      const wire = layout.links.find((link) => link.linkId === port.linkId);
      if (wire === undefined) throw new Error("expected the labelled wire");

      const nearest = Math.min(
        ...samplesAlong(wire.points).map((point) =>
          Math.hypot(point.x - port.at.x, point.y - port.at.y)
        )
      );

      expect(`${port.text} ${nearest > 4}`).toBe(`${port.text} true`);
    }
  });

  it("stays clear of the traffic marker at the same device", () => {
    // Both sit just outside Switch-1's edge on the same wires. The label is
    // offset to one side precisely so the two never occupy the same point.
    const layout = layoutOf(simultaneous);
    const withLabels = layoutOf({
      ...simultaneous,
      nodes: labelled.nodes
    });

    expect(layout.packets.length).toBeGreaterThan(0);

    for (const marker of withLabels.packets) {
      for (const port of withLabels.portLabels) {
        const gap = Math.hypot(
          marker.at.x - port.at.x,
          marker.at.y - port.at.y
        );
        expect(`${port.text} ${gap > 6}`).toBe(`${port.text} true`);
      }
    }
  });

  it("gives every label its own position", () => {
    const points = layoutOf(labelled).portLabels.map(
      (port) => `${port.at.x},${port.at.y}`
    );

    expect(new Set(points).size).toBe(points.length);
  });

  it("keeps every label inside the canvas", () => {
    const layout = layoutOf(labelled);

    for (const port of layout.portLabels) {
      expect(port.at.x).toBeGreaterThanOrEqual(0);
      expect(port.at.y).toBeGreaterThanOrEqual(0);
      expect(port.at.x).toBeLessThanOrEqual(layout.frame.width);
      expect(port.at.y).toBeLessThanOrEqual(layout.frame.height);
    }
  });

  it("names the same ports in the arrangement description", () => {
    // The picture must not carry a fact the spoken description does not, or a
    // learner using a screen reader is the only one who has to go hunting.
    const description = layoutOf(labelled).description;

    expect(description).toContain("Switch-1 Port 1");
    expect(description).toContain("Switch-1 Port 2");
    expect(description).toContain("Switch-1 Port 3");
    // And the unflagged end stays unnamed there too, so the two agree.
    expect(description).not.toContain("Switch-1 Port 4");
  });

  it("decides nothing from device roles", () => {
    // The structural proof. Make every device a host — the flag is untouched,
    // so exactly the same ends are labelled.
    const rolesChanged: ObservationModel = {
      ...labelled,
      nodes: labelled.nodes.map((node) => ({ ...node, role: "host" as const }))
    };

    expect(layoutOf(rolesChanged).portLabels.map((port) => port.text).sort())
      .toEqual(layoutOf(labelled).portLabels.map((port) => port.text).sort());
  });

  it("decides nothing from the order devices were declared in", () => {
    const reordered: ObservationModel = {
      ...labelled,
      nodes: [...labelled.nodes].reverse()
    };

    expect(layoutOf(reordered).portLabels.map((port) => port.interfaceId).sort())
      .toEqual(layoutOf(labelled).portLabels.map((port) => port.interfaceId).sort());
  });
});


/* ------------------------------------------------------------------ *
 * The REAL authored journeys
 *
 * Founder UAT, second round: the far network sat off the right-hand edge of
 * Missions 4, 6 and 8, and the reviewer was reconstructing the topology from
 * memory instead of reasoning about it.
 *
 * Every assertion above this point runs against SYNTHETIC fixtures, and the
 * budget test explicitly excused the two-group shape as "a synthetic worst
 * case ... allowed to scroll". That exemption was written when Module 1 was
 * the only authored content. Missions 4, 6 and 8 are now exactly that shape —
 * so the suite was passing on fixtures while the real course clipped.
 *
 * These run against the authored curriculum itself. A fixture cannot be tuned
 * to make them pass.
 * ------------------------------------------------------------------ */

/**
 * The width the NETWORK column actually gets, at the Founder's desktop.
 *
 * Founder UAT found the topology squeezed into a fraction of the screen and
 * then scaled past readability. The earlier assertions targeted the reading
 * column — about 624px — which was the defect written down as a requirement:
 * a lesson-reading width was deciding how big the network could be.
 *
 * A workspace is not a paragraph. These now assert against the width the
 * layout really gives the network, modelled by `describeWorkspaceColumns`.
 */
const FOUNDER_VIEWPORT = 1440;
const NETWORK_COLUMN = describeWorkspaceColumns(FOUNDER_VIEWPORT).network;

function authoredJourneys(): {
  readonly name: string;
  readonly parameters: PacketJourneyParameters;
}[] {
  const parsed = parseCurriculumDocument(networkingFoundations);
  if (!parsed.valid) throw new Error("the authored course does not parse");

  return parsed.document.missions.flatMap((mission) =>
    mission.steps.flatMap((step) =>
      step.content.type === "interaction"
        ? [
            {
              name: step.content.interactionStableId,
              parameters: step.content.parameters as PacketJourneyParameters
            }
          ]
        : []
    )
  );
}

function authoredLayout(parameters: PacketJourneyParameters, revealed: number) {
  const model = buildPacketJourneyObservationModel(parameters, {
    revealedStageCount: revealed,
    appliedActionId: null,
    committedPredictions: {}
  } as never);

  return buildTopologyLayout(model, null);
}

describe("every authored journey fits the lesson column", () => {
  it("scales to fit the reading column without scrolling sideways", () => {
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, parameters.stages.length);
      if (layout.state !== "available") throw new Error(`${name} is unavailable`);

      const scale = fitTopologyScale(layout.frame, NETWORK_COLUMN);
      const width = layout.frame.width * scale;

      expect(`${name} fits ${NETWORK_COLUMN}: ${width <= NETWORK_COLUMN + 0.5}`).toBe(
        `${name} fits ${NETWORK_COLUMN}: true`
      );
    }
  });

  it("leaves vertical room for the task beside it", () => {
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, parameters.stages.length);
      if (layout.state !== "available") throw new Error(`${name} is unavailable`);

      const scale = fitTopologyScale(layout.frame, NETWORK_COLUMN);
      const height = layout.frame.height * scale;

      expect(
        `${name} height ${Math.round(height)} <= ${TOPOLOGY_HEIGHT_BUDGET}: ${height <= TOPOLOGY_HEIGHT_BUDGET + 0.5}`
      ).toBe(`${name} height ${Math.round(height)} <= ${TOPOLOGY_HEIGHT_BUDGET}: true`);
    }
  });

  it("never scales below the readable floor to achieve that", () => {
    // The budget must not be met by shrinking the picture until nobody can read
    // it. If a journey ever needs less than the floor, the layout is what has
    // to change — not this number.
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, parameters.stages.length);
      if (layout.state !== "available") throw new Error(`${name} is unavailable`);

      const scale = fitTopologyScale(layout.frame, NETWORK_COLUMN);

      expect(`${name} scale >= floor: ${scale >= TOPOLOGY_MIN_SCALE}`).toBe(
        `${name} scale >= floor: true`
      );

      const needed = Math.min(
        NETWORK_COLUMN / layout.frame.width,
        TOPOLOGY_HEIGHT_BUDGET / layout.frame.height
      );

      expect(`${name} needs no more than the floor: ${needed >= TOPOLOGY_MIN_SCALE}`).toBe(
        `${name} needs no more than the floor: true`
      );
    }
  });

  it("fits at every point in the journey, not only at the end", () => {
    // Cards grow as stages reveal device facts, so the last stage is not
    // automatically the widest or the tallest moment.
    for (const { name, parameters } of authoredJourneys()) {
      for (let revealed = 0; revealed <= parameters.stages.length; revealed += 1) {
        const layout = authoredLayout(parameters, revealed);
        if (layout.state !== "available") continue;

        const scale = fitTopologyScale(layout.frame, NETWORK_COLUMN);

        expect(
          `${name}@${revealed}: ${layout.frame.width * scale <= NETWORK_COLUMN + 0.5 && layout.frame.height * scale <= TOPOLOGY_HEIGHT_BUDGET + 0.5}`
        ).toBe(`${name}@${revealed}: true`);
      }
    }
  });

  it("leaves a drawing that already fits at its authored size", () => {
    // Never magnified. A small topology is not stretched to fill the column.
    const small = { width: 300, height: 200 };
    expect(fitTopologyScale(small, NETWORK_COLUMN)).toBe(1);
  });
});

describe("every authored journey names the connections that matter", () => {
  it("labels every switch port and every router interface", () => {
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, 0);
      if (layout.state !== "available") throw new Error(`${name} is unavailable`);

      const labelled = new Set(layout.portLabels.map((port) => port.interfaceId));

      for (const node of parameters.nodes) {
        if (node.role !== "switch" && node.role !== "router") continue;

        for (const iface of node.interfaces) {
          // Only ends that are actually attached to a drawn link can carry a
          // label; an unattached interface has no wire to sit beside.
          const attached = parameters.links.some((link) =>
            link.endpoints.includes(iface.interfaceId)
          );
          if (!attached) continue;

          expect(`${name} ${iface.interfaceId} labelled: ${labelled.has(iface.interfaceId)}`).toBe(
            `${name} ${iface.interfaceId} labelled: true`
          );
        }
      }
    }
  });

  it("keeps port labels clear of every device card", () => {
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, 0);
      if (layout.state !== "available") throw new Error(`${name} is unavailable`);

      for (const port of layout.portLabels) {
        for (const device of layout.devices) {
          const inside =
            port.at.x > device.box.x &&
            port.at.x < device.box.x + device.box.width &&
            port.at.y > device.box.y &&
            port.at.y < device.box.y + device.box.height;

          expect(`${name} ${port.interfaceId} inside ${device.nodeId}: ${inside}`).toBe(
            `${name} ${port.interfaceId} inside ${device.nodeId}: false`
          );
        }
      }
    }
  });

  it("does not stack two port labels on the same point", () => {
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, 0);
      if (layout.state !== "available") throw new Error(`${name} is unavailable`);

      const seen = new Set<string>();

      for (const port of layout.portLabels) {
        const key = `${Math.round(port.at.x)},${Math.round(port.at.y)}`;
        expect(`${name} ${key} already used: ${seen.has(key)}`).toBe(
          `${name} ${key} already used: false`
        );
        seen.add(key);
      }
    }
  });
});


/* ------------------------------------------------------------------ *
 * The marker travels the wire
 *
 * Founder UAT, third round: "traffic must follow the physical/authored line
 * continuously ... it must NOT jump directly between node centers, skip bends,
 * teleport between disconnected visual coordinates, leave the actual wire,
 * infer a shortcut, animate across empty space."
 *
 * The defect was that the marker was positioned at a point and moved by a CSS
 * transition, which interpolates in a straight line — so on any bent wire it
 * cut the corner. These assertions pin the replacement: the marker carries the
 * link's own path string, and the browser walks that.
 * ------------------------------------------------------------------ */

describe("traffic follows the wire it is authored to travel", () => {
  it("carries the same path string the link is drawn with", () => {
    // One source of geometry, asserted literally: not an equal-looking path,
    // the identical string.
    for (const { name, parameters } of authoredJourneys()) {
      for (let revealed = 1; revealed <= parameters.stages.length; revealed += 1) {
        const layout = authoredLayout(parameters, revealed);
        if (layout.state !== "available") continue;

        for (const marker of layout.packets) {
          // A marker with no path is parked, whether or not it sits beside a
          // wire. Only a travelling marker carries geometry, and when it does
          // the geometry must be the link's own string.
          if (marker.path === null) continue;

          const link = layout.links.find(
            (candidate) => candidate.linkId === marker.linkId
          );

          expect(`${name}@${revealed} ${marker.linkId}: ${marker.path === link?.path}`).toBe(
            `${name}@${revealed} ${marker.linkId}: true`
          );
        }
      }
    }
  });

  it("follows every bend, because the path it carries has them", () => {
    // A wire with corners must hand the marker a path with corners. If the
    // marker were given a two-point shortcut the bends would be gone.
    for (const { name, parameters } of authoredJourneys()) {
      for (let revealed = 1; revealed <= parameters.stages.length; revealed += 1) {
        const layout = authoredLayout(parameters, revealed);
        if (layout.state !== "available") continue;

        for (const marker of layout.packets) {
          if (marker.path === null) continue;

          const link = layout.links.find((c) => c.linkId === marker.linkId);
          const corners = (link?.points.length ?? 0) - 1;
          const segments = (marker.path.match(/L/g) ?? []).length;

          expect(`${name} ${marker.linkId} segments: ${segments}`).toBe(
            `${name} ${marker.linkId} segments: ${corners}`
          );
        }
      }
    }
  });

  it("never takes a straight line between two device centres", () => {
    for (const { name, parameters } of authoredJourneys()) {
      for (let revealed = 1; revealed <= parameters.stages.length; revealed += 1) {
        const layout = authoredLayout(parameters, revealed);
        if (layout.state !== "available") continue;

        for (const marker of layout.packets) {
          if (marker.path === null) continue;

          const centres = layout.devices.map((device) => ({
            x: device.box.x + device.box.width / 2,
            y: device.box.y + device.box.height / 2
          }));

          const start = marker.path
            .replace(/^M\s*/, "")
            .split(/[ L]/)
            .slice(0, 2)
            .map(Number);

          const onACentre = centres.some(
            (centre) =>
              Math.abs(centre.x - (start[0] ?? 0)) < 0.5 &&
              Math.abs(centre.y - (start[1] ?? 0)) < 0.5
          );

          expect(`${name} ${marker.linkId} starts at a device centre: ${onACentre}`).toBe(
            `${name} ${marker.linkId} starts at a device centre: false`
          );
        }
      }
    }
  });

  it("animates only the links the authored stage occupies", () => {
    for (const { name, parameters } of authoredJourneys()) {
      for (let revealed = 1; revealed <= parameters.stages.length; revealed += 1) {
        const layout = authoredLayout(parameters, revealed);
        if (layout.state !== "available") continue;

        const current = new Set(
          layout.links.filter((link) => link.current).map((link) => link.linkId)
        );

        for (const marker of layout.packets) {
          // A marker may be PARKED beside a wire the stage did not name — the
          // origin, before anything has moved, is exactly that. What it may
          // not do is travel one: a path is carried only for an authored link.
          if (marker.path === null) continue;

          expect(`${name}@${revealed} ${marker.linkId} is current: ${current.has(marker.linkId ?? "")}`)
            .toBe(`${name}@${revealed} ${marker.linkId} is current: true`);
        }
      }
    }
  });

  it("parks rather than travels when the stage names no link", () => {
    // The origin. Nothing has crossed anything, so there is no authored wire
    // to travel and the marker must carry no path at all.
    for (const { name, parameters } of authoredJourneys()) {
      const originStage = parameters.stages[0];
      if (originStage?.viaLinkId !== undefined) continue;

      const layout = authoredLayout(parameters, 1);
      if (layout.state !== "available") continue;

      for (const marker of layout.packets) {
        expect(`${name} origin marker path: ${marker.path}`).toBe(
          `${name} origin marker path: null`
        );
      }
    }
  });

  it("puts one marker on every link a fan-out moment occupies", () => {
    // Mission 2 floods: `viaLinkId` plus every `alsoOnLinkIds` entry. Each of
    // those wires gets its own marker, and they are all anchored at the same
    // device, so the moment reads as copies leaving together.
    const flood = authoredJourneys().find(
      (entry) => entry.name === "nf-pj2-local-delivery"
    );
    if (flood === undefined) throw new Error("Mission 2's journey is missing");

    const fanOut = flood.parameters.stages.findIndex(
      (stage) => (stage.alsoOnLinkIds ?? []).length > 0
    );

    expect(fanOut).toBeGreaterThanOrEqual(0);

    const stage = flood.parameters.stages[fanOut];
    const layout = authoredLayout(flood.parameters, fanOut + 1);
    if (layout.state !== "available") throw new Error("unavailable");

    const expected = new Set<string>([
      ...(stage?.viaLinkId === undefined ? [] : [stage.viaLinkId]),
      ...(stage?.alsoOnLinkIds ?? [])
    ]);

    expect(new Set(layout.packets.map((marker) => marker.linkId))).toEqual(expected);
    expect(new Set(layout.packets.map((marker) => marker.nodeId)).size).toBe(1);
  });

  it("sends the arriving copy inward and the leaving copies outward", () => {
    // Direction is read from the authored stage: the link it arrived on
    // travels towards the device, every link it left on travels away.
    const flood = authoredJourneys().find(
      (entry) => entry.name === "nf-pj2-local-delivery"
    );
    if (flood === undefined) throw new Error("Mission 2's journey is missing");

    const fanOut = flood.parameters.stages.findIndex(
      (stage) => (stage.alsoOnLinkIds ?? []).length > 0
    );
    const stage = flood.parameters.stages[fanOut];
    const layout = authoredLayout(flood.parameters, fanOut + 1);
    if (layout.state !== "available") throw new Error("unavailable");

    for (const marker of layout.packets) {
      const link = layout.links.find((c) => c.linkId === marker.linkId);
      if (link === undefined) throw new Error("no link");

      const arriving = marker.linkId === stage?.viaLinkId;
      const deviceIsPathEnd = link.to.nodeId === marker.nodeId;
      const expected = arriving ? deviceIsPathEnd : !deviceIsPathEnd;

      expect(`${marker.linkId} travelsToEnd: ${marker.travelsToEnd}`).toBe(
        `${marker.linkId} travelsToEnd: ${expected}`
      );
    }
  });

  it("reverses on the return leg of the round trip", () => {
    // Mission 6 crosses the same wires outbound and back. The same link must
    // travel opposite ways at those two moments, without the path changing.
    const trip = authoredJourneys().find(
      (entry) => entry.name === "nf-pj6-end-to-end"
    );
    if (trip === undefined) throw new Error("Mission 6's journey is missing");

    const directions = new Map<string, boolean[]>();

    for (let revealed = 1; revealed <= trip.parameters.stages.length; revealed += 1) {
      const layout = authoredLayout(trip.parameters, revealed);
      if (layout.state !== "available") continue;

      for (const marker of layout.packets) {
        if (marker.linkId === null) continue;
        const seen = directions.get(marker.linkId) ?? [];
        seen.push(marker.travelsToEnd);
        directions.set(marker.linkId, seen);
      }
    }

    const reversed = [...directions.entries()].filter(
      ([, seen]) => seen.includes(true) && seen.includes(false)
    );

    expect(reversed.length).toBeGreaterThan(0);
  });

  it("does not travel past an authored stop", () => {
    // Mission 8 stops before anything leaves PC-A. The marker must not be in a
    // travelling state there, or the picture would contradict the authored
    // outcome the whole mission is about.
    const faulted = authoredJourneys().find(
      (entry) => entry.name === "nf-pj8-the-stop-and-the-repair"
    );
    if (faulted === undefined) throw new Error("Mission 8's journey is missing");

    const stopIndex = faulted.parameters.stages.findIndex(
      (stage) => stage.outcome === "stops"
    );

    const layout = authoredLayout(faulted.parameters, stopIndex + 1);
    if (layout.state !== "available") throw new Error("unavailable");

    for (const marker of layout.packets) {
      expect(`stopped marker state: ${marker.state}`).toBe(
        "stopped marker state: stopped"
      );
    }
  });

  it("travels again once the authored repair releases the journey", () => {
    const faulted = authoredJourneys().find(
      (entry) => entry.name === "nf-pj8-the-stop-and-the-repair"
    );
    if (faulted === undefined) throw new Error("Mission 8's journey is missing");

    const resolving = faulted.parameters.actions.find(
      (action) => action.resolvesFault
    );

    const stopIndex = faulted.parameters.stages.findIndex(
      (stage) => stage.outcome === "stops"
    );

    const model = buildPacketJourneyObservationModel(faulted.parameters, {
      revealedStageCount: stopIndex + 2,
      appliedActionId: resolving?.actionId ?? null,
      committedPredictions: {}
    } as never);

    const layout = buildTopologyLayout(model, null);
    if (layout.state !== "available") throw new Error("unavailable");

    expect(layout.packets.length).toBeGreaterThan(0);
    for (const marker of layout.packets) {
      expect(`repaired marker state: ${marker.state}`).toBe(
        "repaired marker state: moving"
      );
      expect(marker.path).not.toBeNull();
    }
  });
});


/* ------------------------------------------------------------------ *
 * THE WORKSPACE IS BIGGER THAN THE PANE
 *
 * Founder UAT, blocking: "the network must not become a thumbnail beside a
 * text pane." These assert the geometry the layout actually produces, at the
 * Founder's own viewport, against the real authored journeys.
 * ------------------------------------------------------------------ */

describe("the network is the dominant surface at desktop widths", () => {
  const DESKTOP = [1280, 1440, 1728, 1920];

  it("gives the network more width than the instructor pane", () => {
    for (const viewport of DESKTOP) {
      for (const mode of ["embedded", "expanded"] as const) {
        const columns = describeWorkspaceColumns(viewport, mode);

        expect(
          `${viewport} ${mode}: network wider: ${columns.network > columns.instructor}`
        ).toBe(`${viewport} ${mode}: network wider: true`);
      }
    }
  });

  it("keeps the network between 55% and 65% of the workspace", () => {
    // The perceptual requirement, stated as the band the Founder approved.
    for (const viewport of DESKTOP) {
      for (const mode of ["embedded", "expanded"] as const) {
        const { network, instructor } = describeWorkspaceColumns(viewport, mode);
        const share = network / (network + instructor);

        expect(
          `${viewport} ${mode}: share in band: ${share >= 0.55 && share <= 0.65}`
        ).toBe(`${viewport} ${mode}: share in band: true`);
      }
    }
  });

  it("escapes the reading column, so prose width never sizes the network", () => {
    // `.card` is min(760px, 100%) with up to 3rem of padding — about 664px of
    // content. The workspace must be substantially wider than that.
    expect(describeWorkspaceColumns(1440).total).toBeGreaterThan(664 * 1.5);
  });

  it("collapses to a single full-width column below the breakout", () => {
    const narrow = describeWorkspaceColumns(900);

    expect(narrow.instructor).toBe(0);
    expect(narrow.network).toBe(narrow.total);
  });
});

describe("every authored journey is readable in the network column", () => {
  it("never scales below the readable floor at the Founder's viewport", () => {
    for (const { name, parameters } of authoredJourneys()) {
      for (let revealed = 0; revealed <= parameters.stages.length; revealed += 1) {
        const layout = authoredLayout(parameters, revealed);
        if (layout.state !== "available") continue;

        const scale = fitTopologyScale(layout.frame, NETWORK_COLUMN);

        expect(`${name}@${revealed} scale ${scale.toFixed(2)} >= floor: ${scale >= TOPOLOGY_MIN_SCALE}`)
          .toBe(`${name}@${revealed} scale ${scale.toFixed(2)} >= floor: true`);

        // And the floor is not being MET by clipping: the scaled drawing has
        // to actually fit the column it is given.
        expect(`${name}@${revealed} fits: ${layout.frame.width * scale <= NETWORK_COLUMN + 0.5}`)
          .toBe(`${name}@${revealed} fits: true`);
      }
    }
  });

  it("keeps every device card inside the network column", () => {
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, parameters.stages.length);
      if (layout.state !== "available") continue;

      const scale = fitTopologyScale(layout.frame, NETWORK_COLUMN);

      for (const device of layout.devices) {
        const right = (device.box.x + device.box.width) * scale;

        expect(`${name} ${device.nodeId} clipped: ${right > NETWORK_COLUMN + 0.5}`).toBe(
          `${name} ${device.nodeId} clipped: false`
        );
      }
    }
  });

  it("keeps every network group inside the column", () => {
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, parameters.stages.length);
      if (layout.state !== "available") continue;

      const scale = fitTopologyScale(layout.frame, NETWORK_COLUMN);

      for (const group of layout.groups) {
        const right = (group.box.x + group.box.width) * scale;

        expect(`${name} ${group.groupId} clipped: ${right > NETWORK_COLUMN + 0.5}`).toBe(
          `${name} ${group.groupId} clipped: false`
        );
      }
    }
  });

  it("keeps every port label inside the column", () => {
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, 0);
      if (layout.state !== "available") continue;

      const scale = fitTopologyScale(layout.frame, NETWORK_COLUMN);

      for (const port of layout.portLabels) {
        expect(`${name} ${port.interfaceId} clipped: ${port.at.x * scale > NETWORK_COLUMN + 0.5}`)
          .toBe(`${name} ${port.interfaceId} clipped: false`);
      }
    }
  });

  it("draws Missions 1, 2, 6 and 8 at a comfortable size", () => {
    // The four the Founder retests. None of them should need shrinking at all
    // in the expanded workspace: if one does, the column is too narrow rather
    // than the drawing too big.
    const expanded = describeWorkspaceColumns(FOUNDER_VIEWPORT, "expanded").network;

    for (const name of [
      "nf-pj1-topology-orientation",
      "nf-pj2-local-delivery",
      "nf-pj6-end-to-end",
      "nf-pj8-the-stop-and-the-repair"
    ]) {
      const entry = authoredJourneys().find((candidate) => candidate.name === name);
      if (entry === undefined) throw new Error(`${name} is missing`);

      const layout = authoredLayout(entry.parameters, entry.parameters.stages.length);
      if (layout.state !== "available") throw new Error("unavailable");

      expect(`${name} fits the expanded column unscaled: ${layout.frame.width <= expanded}`)
        .toBe(`${name} fits the expanded column unscaled: true`);
    }
  });
});


/* ------------------------------------------------------------------ *
 * THE CARD CARRIES NETWORK IDENTITY WITHOUT BECOMING A DUMP
 *
 * Founder UAT: "if the instructional text references an IP address, the learner
 * should be able to find it on the topology rather than opening Full text" —
 * and, immediately after it, "the cards must not become cluttered". Those pull
 * against each other, so both directions are pinned here.
 * ------------------------------------------------------------------ */

describe("device faces carry identity without clutter", () => {
  /*
    Founder UAT, wave 8: the cards showed "Network interface I…" and
    "Network interface Ha…". The previous version of this suite capped a face
    at three facts, which was the wrong instrument entirely — three facts on
    one line each still did not fit, and Router-1 needs four to say which of
    its addresses is on which network.

    The cap is gone. What replaces it is a measurement: every string the course
    puts on a card face must fit the card, under a budget model deliberately
    more pessimistic than the real font. A fact that does not fit is a fact the
    author has to take off the face — never one the renderer quietly cuts.
  */

  it("shows every face line in full, with nothing cut", () => {
    for (const { name, parameters } of authoredJourneys()) {
      for (let revealed = 0; revealed <= parameters.stages.length; revealed += 1) {
        const layout = authoredLayout(parameters, revealed);
        if (layout.state !== "available") continue;

        for (const device of layout.devices) {
          for (const group of device.face) {
            if (group.heading !== null) {
              expect(
                `${name} ${device.nodeId} heading "${group.heading}" fits: ${faceTextFits(group.heading, FACE_INTERFACE_FONT_PX)}`
              ).toBe(
                `${name} ${device.nodeId} heading "${group.heading}" fits: true`
              );
            }

            for (const fact of group.facts) {
              expect(
                `${name} ${device.nodeId} label "${fact.label}" fits: ${faceTextFits(fact.label, FACE_LABEL_FONT_PX)}`
              ).toBe(
                `${name} ${device.nodeId} label "${fact.label}" fits: true`
              );

              expect(
                `${name} ${device.nodeId} value "${fact.value}" fits: ${faceTextFits(fact.value, FACE_VALUE_FONT_PX)}`
              ).toBe(
                `${name} ${device.nodeId} value "${fact.value}" fits: true`
              );
            }
          }
        }
      }
    }
  });

  it("gives every card a box its face actually fits in", () => {
    for (const { name, parameters } of authoredJourneys()) {
      for (let revealed = 0; revealed <= parameters.stages.length; revealed += 1) {
        const layout = authoredLayout(parameters, revealed);
        if (layout.state !== "available") continue;

        for (const device of layout.devices) {
          const factRows = device.face.reduce(
            (total, group) => total + group.facts.length,
            0
          );
          const headingRows = device.face.filter(
            (group) => group.heading !== null
          ).length;

          const needed =
            NODE_BASE_HEIGHT +
            (factRows === 0
              ? 0
              : NODE_FACTS_HEADER_HEIGHT +
                headingRows * NODE_INTERFACE_HEADING_HEIGHT +
                factRows * NODE_FACT_ROW_HEIGHT);

          expect(
            `${name}@${revealed} ${device.nodeId} fits: ${device.box.height >= needed}`
          ).toBe(`${name}@${revealed} ${device.nodeId} fits: true`);
        }
      }
    }
  });

  it("names the interface only when there is more than one to tell apart", () => {
    // A host's single "Network interface" heading is a line of the card spent
    // saying something the learner can already see. Router-1's two are the
    // point of the card.
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, parameters.stages.length);
      if (layout.state !== "available") continue;

      for (const device of layout.devices) {
        const headed = device.face.filter((group) => group.heading !== null);

        expect(
          `${name} ${device.nodeId} headings: ${headed.length === 0 || headed.length === device.face.length}`
        ).toBe(`${name} ${device.nodeId} headings: true`);

        expect(
          `${name} ${device.nodeId} heads only when it must: ${device.face.length > 1 ? headed.length > 0 : headed.length === 0}`
        ).toBe(`${name} ${device.nodeId} heads only when it must: true`);
      }
    }
  });

  it("still fits the Founder column once identity is on the face", () => {
    // Every fact added to a face costs a row of height, and the floor scale is
    // not permitted to absorb it.
    for (const { name, parameters } of authoredJourneys()) {
      const layout = authoredLayout(parameters, parameters.stages.length);
      if (layout.state !== "available") continue;

      const scale = fitTopologyScale(layout.frame, NETWORK_COLUMN);

      expect(`${name} above the floor: ${scale > TOPOLOGY_MIN_SCALE || scale === 1}`).toBe(
        `${name} above the floor: true`
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * WP-NF-NT1B — a network past the edge of the drawing
 *
 * The defect this closes: Mission 1's near-transfer asks which device
 * connects the local network to another network, and the only thing that
 * answered it was a sentence. The router's onward connection had no far end,
 * so the diagram drew nothing and a sighted beginner had to read prose to
 * find a topology fact.
 * ------------------------------------------------------------------ */

/** Two hosts on a switch, a router above it, and a network past the router. */
const beyondTheRouter: ObservationModel = {
  ...emptyJourney,
  externalNetworks: [
    {
      networkId: "beyond",
      label: "Another network",
      attachedToNodeId: "r-2"
    }
  ],
  nodes: [
    node("r-2", "Router-2", "router", ["r-2-local"]),
    node("sw-2", "Switch-2", "switch", ["sw-2-p1", "sw-2-p2", "sw-2-p3"]),
    node("laptop-a", "Laptop-A", "host", ["laptop-a-nic"]),
    node("server-a", "Server-A", "host", ["server-a-nic"])
  ],
  links: [
    wire("link-laptop", "laptop-a-nic", "sw-2-p1"),
    wire("link-server", "server-a-nic", "sw-2-p2"),
    wire("link-router", "r-2-local", "sw-2-p3")
  ]
};

describe("a network past the edge of the drawing", () => {
  it("is drawn when the author declares one", () => {
    const layout = layoutOf(beyondTheRouter);

    expect(layout.externalNetworks).toHaveLength(1);
    expect(layout.externalNetworks[0]?.label).toBe("Another network");
    expect(layout.externalNetworks[0]?.attachedToNodeId).toBe("r-2");
  });

  it("is not a device", () => {
    // The load-bearing separation. Everything that reasons about traffic
    // iterates `devices` and `links`, so a network that is in neither can
    // never acquire journey state, be arrived at, or be offered as an answer
    // to "which device…".
    const layout = layoutOf(beyondTheRouter);

    expect(layout.devices.map((device) => device.label)).not.toContain(
      "Another network"
    );
    expect(layout.devices).toHaveLength(4);
    expect(layout.links).toHaveLength(3);
  });

  it("carries no journey state, because no traffic can reach it", () => {
    // A wire and a label. There is no `traversed`, no `current`, no direction
    // and no marker — not "they are false", but no field to set.
    const network = layoutOf(beyondTheRouter).externalNetworks[0];

    expect(Object.keys(network ?? {}).sort()).toEqual([
      "attachedToNodeId",
      "box",
      "label",
      "networkId",
      "path"
    ]);
  });

  it("is never carrying the packet marker", () => {
    const layout = layoutOf({
      ...beyondTheRouter,
      stages: [
        {
          stageId: "s1",
          atNodeId: "laptop-a",
          narration: "It leaves Laptop-A.",
          outcome: "proceeds",
          availability: "available"
        }
      ],
      currentStageId: "s1"
    });

    for (const marker of layout.packets) {
      expect(marker.nodeId).not.toBe("beyond");
      expect(
        layout.externalNetworks.some(
          (network) => network.path === marker.path
        )
      ).toBe(false);
    }
  });

  it("draws a wire that actually reaches the device it names", () => {
    // The failure this catches is a plate floating unconnected, which would
    // look like a fifth device rather than a continuation.
    const layout = layoutOf(beyondTheRouter);
    const network = layout.externalNetworks[0];
    const router = layout.devices.find((device) => device.nodeId === "r-2");

    if (network === undefined || router === undefined) {
      throw new Error("expected a network and the router it attaches to");
    }

    // Ends on the plate's bottom edge, and on the router card's top edge.
    expect(network.path).toContain(
      `M ${network.box.x + network.box.width / 2} ${network.box.y + network.box.height}`
    );
    expect(network.path).toContain(
      `L ${router.box.x + router.box.width / 2} ${router.box.y}`
    );
  });

  it("sits above every device, inside the canvas", () => {
    const layout = layoutOf(beyondTheRouter);
    const network = layout.externalNetworks[0];
    if (network === undefined) throw new Error("expected a network");

    expect(network.box.x).toBeGreaterThanOrEqual(CANVAS_PADDING);
    expect(network.box.x + network.box.width).toBeLessThanOrEqual(
      layout.frame.width
    );

    for (const device of layout.devices) {
      expect(network.box.y + network.box.height).toBeLessThanOrEqual(
        device.box.y
      );
    }
  });

  it("makes room for itself rather than overlapping the drawing", () => {
    // The strip is reserved through the same shift a group boundary uses, so
    // nothing moves relative to anything else — the drawing simply starts
    // lower. Compared against the identical model with the declaration
    // removed, so this measures the strip and not the arithmetic.
    const withNetwork = layoutOf(beyondTheRouter);
    const without = layoutOf({ ...beyondTheRouter, externalNetworks: [] });

    const topOf = (layout: ReturnType<typeof layoutOf>) =>
      Math.min(...layout.devices.map((device) => device.box.y));

    expect(topOf(withNetwork)).toBeGreaterThan(topOf(without));
    expect(withNetwork.frame.height).toBeGreaterThan(without.frame.height);
  });

  it("says the same relationship in the arrangement description", () => {
    // Test 7 of the work package: the picture and the words stay aligned. If
    // the plate is drawn and this sentence is not said, a screen-reader
    // learner cannot answer a question a sighted learner can.
    const layout = layoutOf(beyondTheRouter);

    expect(layout.description).toContain(
      "Router-2 also has a line to Another network"
    );
  });

  it("does not describe it as a connection between two devices", () => {
    // It would then be announced as a fifth device with that name.
    const layout = layoutOf(beyondTheRouter);

    expect(layout.description).not.toContain(
      "Router-2 and Another network"
    );
    expect(layout.description).not.toContain("Another network, a ");
  });

  it("changes nothing at all for a topology that declares none", () => {
    // Every packet journey in the course. The field is optional and absent,
    // and the drawing must be byte-identical to what it was.
    const before = layoutOf(moduleOne);
    const after = layoutOf({ ...moduleOne, externalNetworks: [] });

    expect(after).toEqual(before);
    expect(before.externalNetworks).toEqual([]);
  });

  it("ignores a network attached to a device that is not drawn", () => {
    // Fail quietly rather than drawing a wire from nowhere. A dangling link
    // refuses the whole layout because a missing wire changes what a learner
    // concludes; a dangling external network is additive, so dropping it
    // leaves an honest picture rather than no picture.
    const layout = layoutOf({
      ...beyondTheRouter,
      externalNetworks: [
        {
          networkId: "nowhere",
          label: "Another network",
          attachedToNodeId: "not-a-device"
        }
      ]
    });

    expect(layout.externalNetworks).toEqual([]);
    expect(layout.description).not.toContain("Another network");
  });
});
