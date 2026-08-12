import { describe, expect, it } from "vitest";
import { readinessExplanation } from "./readiness";

describe("readiness/test-out outcome", () => {
  it("explains successful competency-linked test-out", () => {
    expect(readinessExplanation({ passed: true, competencyCount: 2 })).toContain("demonstrated");
  });

  it("does not describe an unsuccessful attempt as loss of progress", () => {
    expect(readinessExplanation({ passed: false, competencyCount: 2 })).toContain("remain intact");
  });
});
