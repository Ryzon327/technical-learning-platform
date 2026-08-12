import { describe, expect, it } from "vitest";
import { containerLabProvider } from "./container-lab-provider";

describe("container lab provider", () => {
  it("reports safe capabilities", async () => {
    const capabilities = await containerLabProvider.getCapabilities();
    const health = await containerLabProvider.getHealth();
    expect(capabilities.providerId).toBe("container");
    expect(capabilities.capabilities).toContain("deterministic_validation");
    expect(health.state).toBe("healthy");
  });
});
