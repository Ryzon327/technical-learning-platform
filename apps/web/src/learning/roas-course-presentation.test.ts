import { describe, expect, it } from "vitest";
import type {
  LearningPathProgressSummary,
  LearningProgressState,
  LearningResumeTarget,
  PublishedLearningPathTree,
  RecommendedNextAction
} from "@tlp/shared-types";
import { buildRoasLearnerCourse } from "./roas-course-content";
import {
  buildMissionRegionId,
  canRecordMissionProgress,
  collectPublishedMissionStableIds,
  describeCourseProgress,
  describeDemonstrationAvailability,
  describeMissionProgress,
  describeProgressState,
  explainProgressControl,
  resolveContinueTarget,
  resolveCourseAvailability,
  resolveSelectedMission
} from "./roas-course-presentation";

const course = buildRoasLearnerCourse();
const firstMission = course.missions[0]!.stableId;

function availability(kind: "available" | "not_published" | "unavailable") {
  if (kind === "available") {
    return resolveCourseAvailability({
      publishedMissionStableIds: course.missions.map((m) => m.stableId)
    });
  }
  if (kind === "not_published") {
    return resolveCourseAvailability({
      publishedMissionStableIds: null,
      errorCode: "NOT_FOUND"
    });
  }
  return resolveCourseAvailability({
    publishedMissionStableIds: null,
    errorCode: "DEPENDENCY_UNAVAILABLE"
  });
}

function progressFor(
  states: Record<string, LearningProgressState>
): LearningPathProgressSummary {
  const missions = course.missions.map((mission) => ({
    stableId: mission.stableId,
    state: states[mission.stableId] ?? ("not_started" as const)
  }));

  const completed = missions.filter(
    (mission) =>
      mission.state === "completed" ||
      mission.state === "competency_demonstrated"
  ).length;

  return {
    stableId: course.learningPathStableId,
    state: "in_progress",
    completedMissions: completed,
    totalMissions: missions.length,
    completionPercent: Math.round((completed / missions.length) * 100),
    courses: [
      {
        stableId: course.stableId,
        state: "in_progress",
        completedMissions: completed,
        totalMissions: missions.length,
        modules: [
          {
            stableId: course.modules[0]!.stableId,
            state: "in_progress",
            completedMissions: completed,
            totalMissions: missions.length,
            missions
          }
        ]
      }
    ]
  };
}

describe("ROAS-3 course availability", () => {
  it("is available only when the server returned published missions", () => {
    expect(availability("available").kind).toBe("available");
    expect(availability("available").progressRecorded).toBe(true);
  });

  it("reports an unpublished path as unpublished, not as empty", () => {
    const result = availability("not_published");
    expect(result.kind).toBe("not_published");
    expect(result.progressRecorded).toBe(false);
    expect(result.headline).toMatch(/not published/i);
  });

  it("distinguishes an expired session from an unpublished course", () => {
    const result = resolveCourseAvailability({
      publishedMissionStableIds: null,
      errorCode: "UNAUTHORIZED"
    });
    expect(result.kind).toBe("unauthorized");
    expect(result.progressRecorded).toBe(false);
  });

  it("treats a transport failure as unavailable and promises nothing", () => {
    const result = availability("unavailable");
    expect(result.kind).toBe("unavailable");
    expect(result.progressRecorded).toBe(false);
    expect(result.explanation).toMatch(/has not changed/i);
  });

  it("treats a published path with no missions as not published", () => {
    expect(
      resolveCourseAvailability({ publishedMissionStableIds: [] }).kind
    ).toBe("not_published");
  });

  it("never records progress while loading", () => {
    const result = resolveCourseAvailability({
      loading: true,
      publishedMissionStableIds: null
    });
    expect(result.kind).toBe("loading");
    expect(result.progressRecorded).toBe(false);
  });

  it("collects published mission ids from a curriculum tree", () => {
    const tree = {
      learningPath: { stableId: course.learningPathStableId },
      courses: [
        {
          stableId: course.stableId,
          modules: [{ stableId: "m", missions: [{ stableId: firstMission }] }]
        }
      ]
    } as unknown as PublishedLearningPathTree;

    expect(collectPublishedMissionStableIds(tree)).toEqual([firstMission]);
  });
});

describe("ROAS-3 mission progress is never invented", () => {
  it("uses the server state when the server gave one", () => {
    const display = describeMissionProgress(
      availability("available"),
      progressFor({ [firstMission]: "in_progress" }),
      firstMission
    );

    expect(display.known).toBe(true);
    expect(display.known && display.state).toBe("in_progress");
    expect(display.label).toBe(describeProgressState("in_progress"));
  });

  it("does NOT claim not-started when the course is unavailable", () => {
    for (const kind of ["not_published", "unavailable"] as const) {
      const display = describeMissionProgress(
        availability(kind),
        progressFor({}),
        firstMission
      );

      expect(display.known).toBe(false);
      expect(display.label).not.toMatch(/not started/i);
    }
  });

  it("does NOT claim not-started when progress could not be loaded", () => {
    const display = describeMissionProgress(
      availability("available"),
      null,
      firstMission
    );

    expect(display.known).toBe(false);
    expect(display.label).not.toMatch(/not started/i);
  });

  it("treats a mission absent from the server summary as not in the path", () => {
    const display = describeMissionProgress(
      availability("available"),
      progressFor({}),
      "ros-m99-not-in-the-path"
    );

    expect(display.known).toBe(false);
    expect(display.label).toMatch(/not part of your path/i);
  });

  it("reports every server progress state in plain words", () => {
    const states = [
      "not_started",
      "in_progress",
      "completed",
      "competency_demonstrated",
      "needs_review",
      "blocked_by_prerequisite"
    ] as const;

    for (const state of states) {
      const label = describeProgressState(state);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain("_");
    }
  });
});

describe("ROAS-3 course progress summary", () => {
  it("uses the server's own aggregation rather than recomputing", () => {
    const progress = progressFor({
      [firstMission]: "completed",
      [course.missions[1]!.stableId]: "completed"
    });

    const text = describeCourseProgress(availability("available"), progress);
    expect(text).toContain(String(progress.completedMissions));
    expect(text).toContain(String(progress.totalMissions));
    expect(text).toContain(`${progress.completionPercent}%`);
  });

  it("says progress is not recorded rather than showing zero", () => {
    const text = describeCourseProgress(availability("not_published"), null);
    expect(text).toMatch(/not being recorded/i);
    expect(text).not.toContain("0%");
  });

  it("says progress is not recorded even if a stale summary is present", () => {
    const text = describeCourseProgress(
      availability("unavailable"),
      progressFor({ [firstMission]: "completed" })
    );
    expect(text).toMatch(/not being recorded/i);
  });

  it("is encouraging without pressure when nothing is complete", () => {
    const text = describeCourseProgress(
      availability("available"),
      progressFor({})
    );
    expect(text).toMatch(/have not completed any/i);
    expect(text).not.toMatch(/streak|behind|falling|hurry|only \d+ days/i);
  });
});

describe("ROAS-3 continue target comes from the server", () => {
  const nextAction = (
    overrides: Partial<RecommendedNextAction>
  ): RecommendedNextAction => ({
    actionType: "continue_mission",
    pathStableId: course.learningPathStableId,
    missionStableId: firstMission,
    explanation: "Continue the mission you were actively working on.",
    ...overrides
  });

  const resume = (missionStableId?: string): LearningResumeTarget => ({
    pathStableId: course.learningPathStableId,
    ...(missionStableId ? { missionStableId } : {}),
    reason: "resume_in_progress",
    explanation: "Continue where you left off.",
    recoveredFromMissingTarget: false
  });

  it("follows the recommended next action and quotes its explanation", () => {
    const target = resolveContinueTarget({
      availability: availability("available"),
      course,
      nextAction: nextAction({}),
      resume: null
    });

    expect(target.actionable).toBe(true);
    expect(target.missionStableId).toBe(firstMission);
    expect(target.explanation).toBe(
      "Continue the mission you were actively working on."
    );
  });

  it("falls back to the resume contract when guidance names no mission", () => {
    const second = course.missions[1]!.stableId;
    const target = resolveContinueTarget({
      availability: availability("available"),
      course,
      nextAction: null,
      resume: resume(second)
    });

    expect(target.actionable).toBe(true);
    expect(target.missionStableId).toBe(second);
  });

  it("chooses nothing when the course is unavailable", () => {
    for (const kind of ["not_published", "unavailable"] as const) {
      const target = resolveContinueTarget({
        availability: availability(kind),
        course,
        nextAction: nextAction({}),
        resume: resume(firstMission)
      });

      expect(target.actionable).toBe(false);
      expect(target.missionStableId).toBeUndefined();
    }
  });

  it("refuses a server mission this course does not contain", () => {
    const target = resolveContinueTarget({
      availability: availability("available"),
      course,
      nextAction: nextAction({ missionStableId: "linux-m1-not-here" }),
      resume: null
    });

    expect(target.actionable).toBe(false);
    expect(target.missionStableId).toBeUndefined();
  });

  it("does not offer a mission when the path is complete", () => {
    const target = resolveContinueTarget({
      availability: availability("available"),
      course,
      nextAction: nextAction({
        actionType: "path_complete",
        explanation: "You have completed the current required learning path."
      }),
      resume: null
    });

    expect(target.actionable).toBe(false);
    expect(target.explanation).toContain("completed");
  });

  it("surfaces a review recommendation without inventing a mission", () => {
    const target = resolveContinueTarget({
      availability: availability("available"),
      course,
      nextAction: nextAction({
        actionType: "review_competency",
        explanation: "Review this competency because approved learning rules require renewed demonstration."
      }),
      resume: resume(firstMission)
    });

    expect(target.actionable).toBe(false);
    expect(target.explanation).toMatch(/review/i);
  });

  it("passes through a temporarily unavailable recommendation", () => {
    const target = resolveContinueTarget({
      availability: availability("available"),
      course,
      nextAction: nextAction({
        actionType: "temporarily_unavailable",
        explanation: "Your next action cannot be calculated right now. Your progress is preserved."
      }),
      resume: null
    });

    expect(target.actionable).toBe(false);
    expect(target.explanation).toMatch(/preserved/i);
  });
});

describe("ROAS-3 progress controls gate on server authority", () => {
  it("allows recording only for a published mission on an available course", () => {
    expect(
      canRecordMissionProgress(
        availability("available"),
        course.missions.map((m) => m.stableId),
        firstMission
      )
    ).toBe(true);
  });

  it("refuses recording for a mission the server did not publish", () => {
    expect(
      canRecordMissionProgress(
        availability("available"),
        [course.missions[1]!.stableId],
        firstMission
      )
    ).toBe(false);
  });

  it("refuses recording whenever the course is not available", () => {
    for (const kind of ["not_published", "unavailable"] as const) {
      expect(
        canRecordMissionProgress(
          availability(kind),
          course.missions.map((m) => m.stableId),
          firstMission
        )
      ).toBe(false);
    }
  });

  it("refuses recording when the published set is unknown", () => {
    expect(
      canRecordMissionProgress(availability("available"), null, firstMission)
    ).toBe(false);
  });

  it("explains why a control is unavailable in the learner's terms", () => {
    expect(
      explainProgressControl(availability("not_published"), false)
    ).toMatch(/not part of your learning path/i);
    expect(
      explainProgressControl(
        resolveCourseAvailability({
          publishedMissionStableIds: null,
          errorCode: "UNAUTHORIZED"
        }),
        false
      )
    ).toMatch(/sign in again/i);
    expect(explainProgressControl(availability("available"), true)).toMatch(
      /updates your saved progress/i
    );
  });
});

describe("ROAS-3 mission selection", () => {
  it("resolves a selected mission", () => {
    expect(resolveSelectedMission(course, firstMission)?.stableId).toBe(
      firstMission
    );
  });

  it("resolves nothing when nothing is selected", () => {
    expect(resolveSelectedMission(course, null)).toBeNull();
  });

  it("drops a selection this course does not contain", () => {
    expect(resolveSelectedMission(course, "linux-m1-not-here")).toBeNull();
  });

  it("gives each mission a distinct region id", () => {
    const ids = course.missions.map((mission) =>
      buildMissionRegionId(mission.stableId)
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("ROAS-3 tells the truth about the lab", () => {
  it("says the practical demonstration is not runnable yet", () => {
    const text = describeDemonstrationAvailability();
    expect(text).toMatch(/not available yet/i);
    expect(text).toMatch(/cannot be completed/i);
  });

  it("names no infrastructure provider", () => {
    const text = describeDemonstrationAvailability().toLowerCase();
    for (const token of [
      "proxmox",
      "vmware",
      "esxi",
      "docker",
      "aws",
      "azure",
      "gcp",
      "hypervisor"
    ]) {
      expect(text).not.toContain(token);
    }
  });
});
