import { describe, expect, it } from "vitest";
import type { CurriculumQualityReport } from "./curriculum-quality";

describe("curriculum quality contracts", () => {
  it("supports deterministic reports", () => {
    const report: CurriculumQualityReport = {
      valid: true,
      checklist: {
        hasCourses: true,
        coursesHaveModules: true,
        modulesHaveMissions: true,
        missionsHaveCompetencies: true,
        prerequisiteGraphAcyclic: true,
        stableOrderingValid: true,
        effortMetadataValid: true,
        contentAssetsValid: true
      },
      issues: [],
      effort: {
        learningPathMinutes: 0,
        courseMinutes: {},
        moduleMinutes: {},
        missionMinutes: {}
      }
    };

    expect(report.valid).toBe(true);
  });
});
