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
  unavailableObservationModel
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

  it("offers exactly the three presentation roles", () => {
    expect([...OBSERVATION_NODE_ROLES]).toEqual(["host", "switch", "router"]);
    expect(isObservationNodeRole("firewall")).toBe(false);
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
