import { describe, expect, it } from "vitest";
import { scoreAssessment, type AssessmentDefinition } from "@tlp/shared-types";

describe("assessment API boundary", () => {
  it("keeps pass/fail deterministic and independent from AI", () => {
    const definition: AssessmentDefinition = {
      stableId: "assessment.test", version: 1, title: "Test", purpose: "practice", passingPercent: 100,
      questions: [{ stableId: "q1", version: 1, type: "single_choice", prompt: "Question", options: [{ id: "a", text: "A" }], correctOptionIds: ["a"], points: 1 }],
      competencyMappings: [], published: true
    };
    expect(scoreAssessment(definition, [{ questionStableId: "q1", selectedOptionIds: ["a"] }]).passed).toBe(true);
  });
});
