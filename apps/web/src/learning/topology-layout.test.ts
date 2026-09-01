import { describe, expect, it } from "vitest";
import {
  unavailableObservationModel,
  type ObservationModel
} from "@tlp/shared-types";
import {
  buildTopologyLayout,
  connectionsForDevice,
  describeConnectionFrom,
  describeDeviceState,
  describePacketState
} from "./topology-layout";

/**
 * WP-I correction — the drawable topology, proven without a browser.
 *
 * This repository has no rendered-DOM test harness, so the rules that decide
 * what the picture CONTAINS live in a pure module and are pinned here. The
 * failure these tests exist to prevent is the quiet one: a layout that silently
 * omits a device or a wire still renders, still looks finished, and leaves a
 * learner reasoning about a network that is not the one they were given.
 */

/**
 * Four devices and three links, shaped like the architecture fixture —
 * including the link that spans non-adjacent columns, which is what forces a
 * routed lane.
 */
const model: ObservationModel = {
  sourceKind: "authored_teaching",
  availability: "available",
  trafficLabel: "an ICMP echo request",
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

/** Narrow to the drawable case, so a test reads without a guard in every line. */
function layoutOf(source: ObservationModel) {
  const layout = buildTopologyLayout(source, "pc-a");
  if (layout.state !== "available") {
    throw new Error(`expected a drawable layout, got: ${layout.reason}`);
  }
  return layout;
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
    expect(layout.columns).toBe(4);
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

  it("keeps devices in authored order rather than a tidier one", () => {
    // Reordering to reduce crossings would be a layout opinion overriding the
    // author's, and it would make the picture disagree with the written list.
    expect(layoutOf(model).devices.map((device) => device.column)).toEqual([
      0, 1, 2, 3
    ]);
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
      interfaceLabel: "eth0"
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

describe("routing lanes are packing, not pathfinding", () => {
  it("runs adjacent links along the device band", () => {
    const layout = layoutOf(model);

    expect(layout.links[0]?.lane).toBe(0);
    expect(layout.links[1]?.lane).toBe(0);
  });

  it("drops a link spanning further into a lane below", () => {
    const layout = layoutOf(model);

    // PC-B is at column 3 and Switch-1 at column 1, so this cannot run along
    // the band without crossing Router-1.
    expect(layout.links[2]?.lane).toBe(1);
    expect(layout.lanes).toBe(1);
  });
});

describe("journey state comes from fields, never from adjacency", () => {
  it("marks the current, visited and unreached devices", () => {
    const byId = new Map(
      layoutOf(model).devices.map((device) => [device.nodeId, device])
    );

    expect(byId.get("pc-a")?.state).toBe("visited");
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

    expect(layout.packet).toEqual({
      nodeId: "pc-a",
      column: 0,
      state: "waiting",
      stateLabel: describePacketState("waiting")
    });
  });

  it("sits at the current device while the journey proceeds", () => {
    expect(layoutOf(model).packet).toMatchObject({
      nodeId: "sw-1",
      column: 1,
      state: "moving"
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

    expect(layout.packet?.state).toBe("stopped");
    expect(layout.packet?.nodeId).toBe("r-1");
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

    expect(layout.packet?.state).toBe("confirmed");
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
    // PC-A and Switch-1 are adjacent columns joined by a lane-0 wire, and PC-B
    // is on the same switch. The layout still reports no traversal for either
    // until a stage says so, because being drawn near something is not a fact
    // about the network.
    const layout = layoutOf({ ...model, stages: [], currentStageId: null });

    expect(layout.links.every((link) => !link.traversed)).toBe(true);
    expect(layout.devices.every((device) => device.state === "idle")).toBe(true);
  });
});
