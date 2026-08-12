import { describe, expect, it } from "vitest";
import { isRecoverableAssessmentState } from "./assessment-recovery";

describe("assessment recovery", () => {
  it("treats interrupted state as recoverable", () => {
    expect(isRecoverableAssessmentState("interrupted")).toBe(true);
  });

  it("keeps recovery separate from pass/fail", () => {
    expect(isRecoverableAssessmentState("in_progress")).toBe(true);
  });
});
