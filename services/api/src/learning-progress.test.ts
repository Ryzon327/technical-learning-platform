import { describe, expect, it } from "vitest";
import type { LearningProgressState } from "@tlp/shared-types";

describe("learning progress state contract", () => {
  it("does not equate in-progress work with completion", () => {
    const state: LearningProgressState = "in_progress";
    expect(state).not.toBe("completed");
  });

  it("keeps competency demonstrated distinct from ordinary completion", () => {
    const state: LearningProgressState = "competency_demonstrated";
    expect(state).toBe("competency_demonstrated");
  });
});
