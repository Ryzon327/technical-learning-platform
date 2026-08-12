import { describe, expect, it } from "vitest";
import { shouldProvisionQueuedSession } from "./lab-automation";

describe("lab automation policy", () => {
  it("provisions queued sessions only with healthy available capacity", () => {
    expect(shouldProvisionQueuedSession("healthy", true)).toBe(true);
    expect(shouldProvisionQueuedSession("healthy", false)).toBe(false);
    expect(shouldProvisionQueuedSession("degraded", true)).toBe(false);
    expect(shouldProvisionQueuedSession("unavailable", true)).toBe(false);
  });
});
