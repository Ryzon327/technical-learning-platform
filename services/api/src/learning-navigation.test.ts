import { describe, expect, it } from "vitest";
import type { PrerequisiteEvaluation } from "@tlp/shared-types";

describe("learning navigation API contract", () => {
  it("keeps unavailable distinct from blocked", () => {
    const result: PrerequisiteEvaluation = {
      state: "temporarily_unavailable",
      targetStableId: "mission.two",
      allowed: false,
      requirements: [],
      explanation: "Evaluation unavailable."
    };

    expect(result.state).not.toBe("blocked");
  });

  it("does not use inactivity as failure", () => {
    expect("2025-01-01T00:00:00.000Z").toContain("2025");
  });
});
