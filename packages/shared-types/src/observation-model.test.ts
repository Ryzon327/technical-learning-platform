import { describe, expect, it } from "vitest";
import {
  OBSERVATION_AVAILABILITY,
  OBSERVATION_NODE_ROLES,
  OBSERVATION_SOURCE_KINDS,
  OBSERVATION_STAGE_OUTCOMES,
  isObservationAvailability,
  isObservationNodeRole,
  isObservationSourceKind,
  isObservationStageOutcome,
  unavailableObservationModel,
  type ObservationGroup,
  type ObservationNode
} from "./observation-model";

/**
 * WP-H / CURR-011 section 8 — the shared observation model.
 *
 * These tests pin the vocabulary and the fail-closed construction. The
 * teaching-mode projection that POPULATES the model is tested in
 * `instruction-interaction.test.ts`, beside the authored contract it reads.
 */

describe("the observation vocabularies are closed", () => {
  it("offers exactly two source kinds", () => {
    expect([...OBSERVATION_SOURCE_KINDS]).toEqual([
      "authored_teaching",
      "live_lab"
    ]);
    expect(isObservationSourceKind("authored_teaching")).toBe(true);
    expect(isObservationSourceKind("simulation")).toBe(false);
  });

  it("distinguishes unavailable from unknown", () => {
    // "The source could not be read" and "you have not looked yet" are
    // different facts. Collapsing them would let a provider failure read as
    // ordinary progress.
    expect([...OBSERVATION_AVAILABILITY]).toEqual([
      "available",
      "unavailable",
      "unknown"
    ]);
    expect(isObservationAvailability("unavailable")).toBe(true);
    expect(isObservationAvailability("missing")).toBe(false);
  });

  it("offers exactly the four presentation roles", () => {
    expect([...OBSERVATION_NODE_ROLES]).toEqual([
      "host",
      "switch",
      "router",
      "printer"
    ]);
    expect(isObservationNodeRole("firewall")).toBe(false);
  });

  // The vocabulary is closed, and `printer` is the proof that extending it is
  // additive rather than open. A role that arrived by being written down would
  // let an author invent a category no presentation can draw.
  it("refuses a role that is plausible but not registered", () => {
    for (const invented of ["workstation", "pc", "laptop", "server", "hub"]) {
      expect(isObservationNodeRole(invented)).toBe(false);
    }
  });

  it("offers exactly two stage outcomes", () => {
    expect([...OBSERVATION_STAGE_OUTCOMES]).toEqual(["proceeds", "stops"]);
    expect(isObservationStageOutcome("maybe")).toBe(false);
  });
});

describe("the unavailable model fails closed", () => {
  const model = unavailableObservationModel("live_lab", "an ICMP echo request");

  it("reports unavailable rather than empty-but-fine", () => {
    expect(model.availability).toBe("unavailable");
  });

  it("draws nothing at all", () => {
    // CURR-011 s12: on unavailable authoritative state, live mode shows
    // unavailable rather than a plausible path.
    expect(model.groups).toEqual([]);
    expect(model.nodes).toEqual([]);
    expect(model.links).toEqual([]);
    expect(model.stages).toEqual([]);
    expect(model.actions).toEqual([]);
    expect(model.currentStageId).toBeNull();
    expect(model.consequence).toBeNull();
  });

  it("still says which source could not be read", () => {
    expect(model.sourceKind).toBe("live_lab");
    expect(model.trafficLabel).toBe("an ICMP echo request");
  });
});

describe("the model carries no networking engine", () => {
  it("exposes no field a consumer could compute forwarding from", () => {
    const model = unavailableObservationModel(
      "authored_teaching",
      "a frame"
    );

    // The model is a description, not a graph to solve. Nothing here offers a
    // routing table, a mask, a next hop or a reachability verdict.
    for (const forbidden of [
      "routingTable",
      "nextHop",
      "subnetMask",
      "reachable",
      "forward"
    ]) {
      expect(Object.keys(model)).not.toContain(forbidden);
    }
  });
});

describe("an authored group is membership and nothing else", () => {
  /**
   * The shape, asserted as a value rather than only as a type.
   *
   * A type test would pass whatever the runtime carried. This one states, in
   * one place, exactly what a group may contain — so a field that arrived later
   * has to be added here deliberately, in front of the note explaining why the
   * vocabulary is generic.
   */
  const group: ObservationGroup = {
    groupId: "local-network",
    label: "Local network"
  };

  it("carries an identifier and words, and no third thing", () => {
    expect(Object.keys(group).sort()).toEqual(["groupId", "label"]);
  });

  it("names no networking concept", () => {
    // The whole point of the generic vocabulary: there is nothing here for a
    // consumer to mistake for a subnet, a domain or a reachability claim.
    for (const forbidden of [
      "subnet",
      "mask",
      "vlan",
      "broadcastDomain",
      "routingDomain",
      "gateway",
      "reachable",
      "trustZone",
      "location"
    ]) {
      expect(Object.keys(group)).not.toContain(forbidden);
    }
  });

  it("does not nest", () => {
    // A group is not a member of a group in this slice, so there is no tree to
    // walk and no containment for anything to compute.
    expect(Object.keys(group)).not.toContain("parentGroupId");
    expect(Object.keys(group)).not.toContain("groups");
  });

  it("puts membership on the node, so it cannot contradict itself", () => {
    // One optional field on the node, rather than a list on the group that
    // could disagree with it. Absent means the author grouped this device with
    // nothing — never "put it in the default group".
    const member: ObservationNode = {
      nodeId: "pc-a",
      label: "PC-A",
      role: "host",
      groupId: "local-network",
      interfaces: []
    };

    const loose: ObservationNode = {
      nodeId: "r-1",
      label: "Router-1",
      role: "router",
      interfaces: []
    };

    expect(member.groupId).toBe("local-network");
    expect(loose.groupId).toBeUndefined();
  });
});

describe("a node's explanation is authored prose and nothing more", () => {
  /**
   * WP-J Module 1, Founder UAT — device inspection.
   *
   * `about` exists because a beginner who selects a device asks "what is this
   * and why is it here?", and the second half of that question is scenario
   * knowledge. The category sentence can be derived from `role`, because that
   * is a property of the category. What THIS device is doing in THIS topology,
   * and which later mission develops the part deliberately left unexplained,
   * cannot be — deriving it would mean teaching a presentation layer what a
   * router does and which mission covers it.
   */
  const explained: ObservationNode = {
    nodeId: "r-1",
    label: "Router-1",
    role: "router",
    about: "Router-1 sits at the edge of this local network.",
    interfaces: []
  };

  const bare: ObservationNode = {
    nodeId: "pc-a",
    label: "PC-A",
    role: "host",
    interfaces: []
  };

  it("is one optional string, carried on the node", () => {
    expect(explained.about).toBe(
      "Router-1 sits at the edge of this local network."
    );
  });

  it("is absent rather than defaulted when the author wrote none", () => {
    // Absence is a fact. Nothing composes an explanation out of the role, the
    // label or what the device is attached to.
    expect(bare.about).toBeUndefined();
  });

  it("is prose, not a structure for a consumer to interpret", () => {
    // Deliberately NOT a shaped object with a mission id, a concept key or a
    // difficulty band. A structure invites something to branch on it, and a
    // presentation that branches on curriculum structure is a presentation
    // that has learned the curriculum.
    expect(typeof explained.about).toBe("string");
  });

  it("adds no second explanatory field to the node", () => {
    // One seam, not a growing panel schema. Everything the beginner reads is
    // either derived from `role`, authored here, or already in `interfaces`.
    expect(Object.keys(explained).sort()).toEqual([
      "about",
      "interfaces",
      "label",
      "nodeId",
      "role"
    ]);
  });
});
