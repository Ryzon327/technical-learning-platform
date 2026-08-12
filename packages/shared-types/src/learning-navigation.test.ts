import { describe, expect, it } from "vitest";
import type {
  PrerequisiteRule,
  PublishedLearningPathTree,
  StudentProgressRecord
} from "./index";
import {
  evaluatePrerequisiteRules,
  selectResumeTarget
} from "./learning-navigation";

const tree: PublishedLearningPathTree = {
  learningPath: {
    id: "path-id",
    stableId: "path.cloud",
    version: 2,
    title: "Cloud",
    publicationState: "published"
  },
  courses: [
    {
      id: "course-id",
      stableId: "course.core",
      version: 2,
      learningPathId: "path-id",
      title: "Core",
      position: 0,
      publicationState: "published",
      modules: [
        {
          id: "module-id",
          stableId: "module.network",
          version: 2,
          courseId: "course-id",
          title: "Network",
          position: 0,
          publicationState: "published",
          missions: [
            {
              id: "m1",
              stableId: "mission.one",
              version: 2,
              moduleId: "module-id",
              title: "One",
              position: 0,
              publicationState: "published"
            },
            {
              id: "m2",
              stableId: "mission.two",
              version: 2,
              moduleId: "module-id",
              title: "Two",
              position: 1,
              publicationState: "published"
            }
          ]
        }
      ]
    }
  ]
};

describe("resume selection", () => {
  it("returns the active mission", () => {
    const records: StudentProgressRecord[] = [
      {
        nodeType: "mission",
        nodeStableId: "mission.two",
        curriculumVersion: 2,
        state: "in_progress",
        lastActivityAt: "2026-08-11T20:00:00.000Z"
      }
    ];

    expect(selectResumeTarget(tree, records).missionStableId).toBe(
      "mission.two"
    );
  });

  it("recovers from retired content", () => {
    const records: StudentProgressRecord[] = [
      {
        nodeType: "mission",
        nodeStableId: "mission.retired",
        curriculumVersion: 1,
        state: "in_progress",
        lastActivityAt: "2026-08-11T20:00:00.000Z"
      },
      {
        nodeType: "mission",
        nodeStableId: "mission.one",
        curriculumVersion: 1,
        state: "completed",
        lastActivityAt: "2026-08-11T19:00:00.000Z"
      }
    ];

    const result = selectResumeTarget(tree, records);

    expect(result.missionStableId).toBe("mission.two");
    expect(result.recoveredFromMissingTarget).toBe(true);
  });

  it("uses the approved start for a new learner", () => {
    const result = selectResumeTarget(tree, []);
    expect(result.missionStableId).toBe("mission.one");
    expect(result.reason).toBe("approved_start");
  });
});

describe("prerequisite evaluation", () => {
  const rules: PrerequisiteRule[] = [
    {
      id: "rule-1",
      targetNodeType: "mission",
      targetStableId: "mission.two",
      requirementType: "content_completion",
      requirementStableId: "mission.one",
      explanation: "Complete Mission One first."
    }
  ];

  it("blocks unsatisfied content", () => {
    const result = evaluatePrerequisiteRules(
      "mission.two",
      rules,
      new Set(),
      new Set(),
      true
    );
    expect(result.state).toBe("blocked");
  });

  it("allows satisfied content", () => {
    const result = evaluatePrerequisiteRules(
      "mission.two",
      rules,
      new Set(["mission.one"]),
      new Set(),
      true
    );
    expect(result.allowed).toBe(true);
  });

  it("supports authoritative competency satisfaction", () => {
    const competencyRule: PrerequisiteRule = {
      id: "rule-2",
      targetNodeType: "mission",
      targetStableId: "mission.two",
      requirementType: "competency",
      requirementStableId: "competency.networking",
      explanation: "Demonstrate networking competency."
    };

    const result = evaluatePrerequisiteRules(
      "mission.two",
      [competencyRule],
      new Set(),
      new Set(["competency:competency.networking"]),
      true
    );

    expect(result.allowed).toBe(true);
  });

  it("distinguishes unavailable evaluation", () => {
    const readinessRule: PrerequisiteRule = {
      id: "rule-3",
      targetNodeType: "mission",
      targetStableId: "mission.two",
      requirementType: "readiness_assessment",
      requirementStableId: "assessment.networking",
      explanation: "Pass the readiness assessment."
    };

    const result = evaluatePrerequisiteRules(
      "mission.two",
      [readinessRule],
      new Set(),
      new Set(),
      false
    );

    expect(result.state).toBe("temporarily_unavailable");
  });
});
