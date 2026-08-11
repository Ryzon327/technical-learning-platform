import { describe, expect, it } from "vitest";
import type {
  CurriculumPublicationState,
  LearningPath,
  MissionCompetencyLink
} from "./curriculum";

describe("curriculum contracts", () => {
  it("supports governed publication states", () => {
    const state: CurriculumPublicationState = "published";
    expect(state).toBe("published");
  });

  it("requires stable IDs and versions", () => {
    const path: LearningPath = {
      id: "00000000-0000-0000-0000-000000000001",
      stableId: "path.aws-saa",
      version: 1,
      title: "AWS Solutions Architect Associate",
      publicationState: "draft"
    };

    expect(path.stableId).toBe("path.aws-saa");
    expect(path.version).toBe(1);
  });

  it("supports mission competency requirements", () => {
    const link: MissionCompetencyLink = {
      missionId: "mission-1",
      competencyId: "competency-1",
      required: true
    };

    expect(link.required).toBe(true);
  });
});
