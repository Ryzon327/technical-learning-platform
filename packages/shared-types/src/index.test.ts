import { describe, expect, it } from "vitest";
import type { AppHealth, HealthState } from "./index";

describe("shared platform types", () => {
  it("supports the platform health contract", () => {
    const state: HealthState = "healthy";

    const health: AppHealth = {
      service: "test-service",
      state,
      checkedAt: new Date().toISOString(),
      version: "0.1.0"
    };

    expect(health.state).toBe("healthy");
    expect(health.service).toBe("test-service");
  });
});
