import { describe, expect, it } from "vitest";
import type {
  CurriculumValidationResult,
  PublicationTransitionRequest
} from "./curriculum-admin";

describe("curriculum admin contracts", () => {
  it("supports deterministic publication validation", () => {
    const result: CurriculumValidationResult = {
      valid: false,
      issues: [
        {
          code: "EMPTY_COURSE",
          message: "Course must contain at least one module.",
          nodeType: "course"
        }
      ]
    };

    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("EMPTY_COURSE");
  });

  it("captures explicit publication transitions", () => {
    const transition: PublicationTransitionRequest = {
      nodeType: "learning_path",
      nodeId: "path-1",
      from: "review",
      to: "published"
    };

    expect(transition.to).toBe("published");
  });
});
