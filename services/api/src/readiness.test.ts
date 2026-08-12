import { describe, expect, it } from "vitest";
import type { ReadinessOutcome } from "@tlp/shared-types";

describe("readiness API contract", () => {
  it("preserves the assessment attempt as source reference", () => {
    const outcome: ReadinessOutcome = {
      attemptId: "attempt-1",
      assessmentStableId: "assessment.networking.readiness",
      assessmentVersion: 1,
      outcome: "demonstrated",
      scorePercent: 90,
      passingPercent: 80,
      competencyStableIds: ["competency.networking"],
      prerequisiteSatisfactionCreated: true,
      explanation: "Demonstrated.",
      sourceReference: "assessment-attempt:attempt-1",
      createdAt: "2026-08-12T00:00:00.000Z"
    };
    expect(outcome.sourceReference).toBe("assessment-attempt:attempt-1");
  });

  it("uses a non-punitive unsuccessful outcome", () => {
    const outcome: ReadinessOutcome["outcome"] = "review_recommended";
    expect(outcome).not.toBe("failed");
  });
});
