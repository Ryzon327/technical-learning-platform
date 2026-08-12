import { describe, expect, it } from "vitest";
import { shouldProvisionQueuedSession } from "@tlp/shared-types";

describe("lab automation orchestration boundary", () => {
  it("does not drain queues while provider health is degraded", () => {
    expect(shouldProvisionQueuedSession("degraded", true)).toBe(false);
  });

  it("does not drain queues without capacity", () => {
    expect(shouldProvisionQueuedSession("healthy", false)).toBe(false);
  });
});
