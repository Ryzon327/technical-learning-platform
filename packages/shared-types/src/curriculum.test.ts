import { describe, expect, it } from "vitest";
import {
  MISSION_COMPETENCY_RELATIONSHIPS,
  isMissionCompetencyRelationship
} from "./curriculum";
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
      required: true,
      relationship: "develops"
    };

    expect(link.required).toBe(true);
  });

  // WP-B / DEC-055. `required` and `relationship` are independent axes, and a
  // required competency the mission only reinforces is the case that proves it.
  it("keeps required and relationship independent", () => {
    const requiredButReused: MissionCompetencyLink = {
      missionId: "mission-4",
      competencyId: "net.default-gateway",
      required: true,
      relationship: "reinforces"
    };

    const supportingButTaught: MissionCompetencyLink = {
      missionId: "mission-2",
      competencyId: "net.access-port-membership",
      required: false,
      relationship: "develops"
    };

    expect(requiredButReused.required).toBe(true);
    expect(requiredButReused.relationship).toBe("reinforces");
    expect(supportingButTaught.required).toBe(false);
    expect(supportingButTaught.relationship).toBe("develops");
  });

  it("closes the relationship vocabulary at develops and reinforces", () => {
    expect([...MISSION_COMPETENCY_RELATIONSHIPS]).toEqual([
      "develops",
      "reinforces"
    ]);
  });

  // Prerequisites are owned solely by `learning_prerequisite_rules`. A third
  // relationship value would be a second, weaker mechanism for them.
  it("rejects requires and any other value as a relationship", () => {
    expect(isMissionCompetencyRelationship("develops")).toBe(true);
    expect(isMissionCompetencyRelationship("reinforces")).toBe(true);

    for (const rejected of [
      "requires",
      "prerequisite",
      "teaches",
      "reuses",
      "",
      "DEVELOPS",
      null,
      undefined,
      42,
      {}
    ]) {
      expect(isMissionCompetencyRelationship(rejected)).toBe(false);
    }
  });
});
