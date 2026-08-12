import { describe, expect, it } from "vitest";
import { calculateAssessmentResultDigest } from "./assessment-recovery";

describe("assessment integrity", () => {
  it("creates deterministic result digests", () => {
    const input = {
      attemptId: "attempt-1",
      assessmentStableId: "assessment.test",
      assessmentVersion: 1,
      scorePercent: 90,
      passingPercent: 80,
      resultState: "passed"
    };

    expect(calculateAssessmentResultDigest(input)).toBe(
      calculateAssessmentResultDigest(input)
    );
  });

  it("changes digest when the result changes", () => {
    const base = {
      attemptId: "attempt-1",
      assessmentStableId: "assessment.test",
      assessmentVersion: 1,
      passingPercent: 80,
      resultState: "passed"
    };

    expect(
      calculateAssessmentResultDigest({ ...base, scorePercent: 90 })
    ).not.toBe(
      calculateAssessmentResultDigest({ ...base, scorePercent: 91 })
    );
  });
});
