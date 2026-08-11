import { describe, expect, it } from "vitest";
import type {
  PublishedLearningPathTree,
  StudentProgressRecord
} from "./index";
import { aggregateLearningPathProgress } from "./learning";

const tree: PublishedLearningPathTree = {
  learningPath: {
    id: "path-id",
    stableId: "path.aws",
    version: 1,
    title: "AWS",
    publicationState: "published"
  },
  courses: [
    {
      id: "course-id",
      stableId: "course.networking",
      version: 1,
      learningPathId: "path-id",
      title: "Networking",
      position: 0,
      publicationState: "published",
      modules: [
        {
          id: "module-id",
          stableId: "module.vpc",
          version: 1,
          courseId: "course-id",
          title: "VPC",
          position: 0,
          publicationState: "published",
          missions: [
            {
              id: "mission-1",
              stableId: "mission.vpc-basics",
              version: 1,
              moduleId: "module-id",
              title: "VPC Basics",
              position: 0,
              publicationState: "published"
            },
            {
              id: "mission-2",
              stableId: "mission.routing",
              version: 1,
              moduleId: "module-id",
              title: "Routing",
              position: 1,
              publicationState: "published"
            }
          ]
        }
      ]
    }
  ]
};

describe("learning progress aggregation", () => {
  it("treats missing records as not started", () => {
    const summary = aggregateLearningPathProgress(tree, []);
    expect(summary.state).toBe("not_started");
    expect(summary.completionPercent).toBe(0);
    expect(summary.totalMissions).toBe(2);
  });

  it("aggregates mission completion deterministically", () => {
    const records: StudentProgressRecord[] = [
      {
        nodeType: "mission",
        nodeStableId: "mission.vpc-basics",
        curriculumVersion: 1,
        state: "completed",
        lastActivityAt: "2026-08-11T00:00:00.000Z"
      },
      {
        nodeType: "mission",
        nodeStableId: "mission.routing",
        curriculumVersion: 1,
        state: "in_progress",
        lastActivityAt: "2026-08-11T00:01:00.000Z"
      }
    ];

    const summary = aggregateLearningPathProgress(tree, records);
    expect(summary.state).toBe("in_progress");
    expect(summary.completedMissions).toBe(1);
    expect(summary.totalMissions).toBe(2);
    expect(summary.completionPercent).toBe(50);
  });

  it("counts competency-demonstrated missions as complete", () => {
    const records: StudentProgressRecord[] =
      tree.courses[0]!.modules[0]!.missions.map((mission) => ({
        nodeType: "mission" as const,
        nodeStableId: mission.stableId,
        curriculumVersion: mission.version,
        state: "competency_demonstrated" as const,
        lastActivityAt: "2026-08-11T00:00:00.000Z"
      }));

    const summary = aggregateLearningPathProgress(tree, records);
    expect(summary.state).toBe("completed");
    expect(summary.completionPercent).toBe(100);
  });
});
