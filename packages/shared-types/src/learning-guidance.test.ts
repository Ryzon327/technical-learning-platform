import { describe, expect, it } from "vitest";
import { recommendNextAction } from "./learning-guidance";

describe("recommended next action", () => {
  it("prioritizes review when a competency needs review", () => {
    const result = recommendNextAction({
      progress: {
        stableId: "path.aws",
        state: "in_progress",
        completedMissions: 1,
        totalMissions: 2,
        completionPercent: 50,
        courses: []
      },
      resume: {
        pathStableId: "path.aws",
        missionStableId: "mission.two",
        reason: "next_after_completed",
        explanation: "Continue.",
        recoveredFromMissingTarget: false
      },
      competencies: [
        {
          competencyStableId: "competency.networking",
          curriculumVersion: 1,
          state: "needs_review",
          lastEvaluatedAt: "2026-08-11T00:00:00.000Z"
        }
      ]
    });

    expect(result.actionType).toBe("review_competency");
  });

  it("returns path complete when nothing remains", () => {
    const result = recommendNextAction({
      progress: {
        stableId: "path.aws",
        state: "completed",
        completedMissions: 2,
        totalMissions: 2,
        completionPercent: 100,
        courses: []
      },
      resume: {
        pathStableId: "path.aws",
        reason: "path_complete",
        explanation: "Complete.",
        recoveredFromMissingTarget: false
      },
      competencies: []
    });

    expect(result.actionType).toBe("path_complete");
  });

  it("continues active work without using inactivity", () => {
    const result = recommendNextAction({
      progress: {
        stableId: "path.aws",
        state: "in_progress",
        completedMissions: 0,
        totalMissions: 2,
        completionPercent: 0,
        courses: []
      },
      resume: {
        pathStableId: "path.aws",
        missionStableId: "mission.one",
        reason: "resume_in_progress",
        explanation: "Continue active work.",
        recoveredFromMissingTarget: false
      },
      competencies: []
    });

    expect(result.actionType).toBe("continue_mission");
  });
});
