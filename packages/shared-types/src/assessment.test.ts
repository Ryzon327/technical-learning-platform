import { describe, expect, it } from "vitest";
import { scoreAssessment, validateAssessmentDefinition, type AssessmentDefinition } from "./assessment";

const assessment: AssessmentDefinition = {
  stableId: "assessment.networking.readiness",
  version: 1,
  title: "Networking readiness",
  purpose: "evidence_producing",
  passingPercent: 80,
  questions: [
    { stableId: "q1", version: 1, type: "single_choice", prompt: "Q1", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctOptionIds: ["b"], points: 1 },
    { stableId: "q2", version: 1, type: "boolean", prompt: "Q2", options: [{ id: "true", text: "True" }, { id: "false", text: "False" }], correctOptionIds: ["true"], points: 1 }
  ],
  competencyMappings: [{ competencyStableId: "competency.networking", competencyVersion: 1, required: true }],
  published: true
};

describe("assessment foundation", () => {
  it("scores deterministically from the approved answer key", () => {
    expect(scoreAssessment(assessment, [
      { questionStableId: "q1", selectedOptionIds: ["b"] },
      { questionStableId: "q2", selectedOptionIds: ["true"] }
    ])).toEqual({ earnedPoints: 2, possiblePoints: 2, percent: 100, passed: true });
  });

  it("does not grant partial credit for an incorrect exact-set response", () => {
    expect(scoreAssessment(assessment, [{ questionStableId: "q1", selectedOptionIds: ["a"] }]).passed).toBe(false);
  });

  it("requires competency mapping for evidence-producing assessments", () => {
    expect(validateAssessmentDefinition({ ...assessment, competencyMappings: [] })).toContain(
      "Evidence-producing assessments require an approved competency mapping."
    );
  });
});
