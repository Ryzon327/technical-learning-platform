import { describe, expect, it } from "vitest";
import type {
  CreateCompetencyInput,
  CreateCourseInput,
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

  it("supports course authoring contracts", () => {
    const input: CreateCourseInput = {
      learningPathId: "path-1",
      stableId: "course.identity",
      title: "Identity",
      position: 0
    };
    expect(input.position).toBe(0);
  });

  it("supports competency authoring contracts", () => {
    const input: CreateCompetencyInput = {
      stableId: "competency.route53",
      title: "Route 53 Routing"
    };
    expect(input.title).toContain("Route");
  });
});
