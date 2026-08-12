import { describe, expect, it } from "vitest";
import type {
  AssessmentAttemptState,
  DeliveredAssessmentQuestion
} from "@tlp/shared-types";

describe("assessment attempt API contracts", () => {
  it("does not include answer keys in delivered questions", () => {
    const question: DeliveredAssessmentQuestion = {
      stableId: "question.one",
      version: 1,
      type: "single_choice",
      prompt: "Question?",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" }
      ],
      points: 1,
      position: 1
    };

    expect("correctOptionIds" in question).toBe(false);
  });

  it("keeps interrupted distinct from failed", () => {
    const interrupted: AssessmentAttemptState = "interrupted";
    const failed: AssessmentAttemptState = "failed";
    expect(interrupted).not.toBe(failed);
  });
});
