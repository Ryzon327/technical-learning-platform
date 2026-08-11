import type { PublishedLearningPathTree } from "./curriculum";

export type LearningProgressState =
  | "not_started"
  | "in_progress"
  | "completed"
  | "competency_demonstrated"
  | "needs_review"
  | "blocked_by_prerequisite";

export type LearningProgressNodeType =
  | "learning_path"
  | "course"
  | "module"
  | "mission";

export interface StudentProgressRecord {
  nodeType: LearningProgressNodeType;
  nodeStableId: string;
  curriculumVersion: number;
  state: LearningProgressState;
  startedAt?: string;
  completedAt?: string;
  lastActivityAt: string;
}

export interface MissionProgressSummary {
  stableId: string;
  state: LearningProgressState;
}

export interface ModuleProgressSummary {
  stableId: string;
  state: LearningProgressState;
  completedMissions: number;
  totalMissions: number;
  missions: MissionProgressSummary[];
}

export interface CourseProgressSummary {
  stableId: string;
  state: LearningProgressState;
  completedMissions: number;
  totalMissions: number;
  modules: ModuleProgressSummary[];
}

export interface LearningPathProgressSummary {
  stableId: string;
  state: LearningProgressState;
  completedMissions: number;
  totalMissions: number;
  completionPercent: number;
  courses: CourseProgressSummary[];
}

function missionState(
  state: LearningProgressState | undefined
): LearningProgressState {
  return state ?? "not_started";
}

function aggregateState(
  states: LearningProgressState[]
): LearningProgressState {
  if (states.length === 0) return "not_started";

  if (
    states.every(
      (state) =>
        state === "completed" ||
        state === "competency_demonstrated"
    )
  ) {
    return "completed";
  }

  if (states.some((state) => state === "blocked_by_prerequisite")) {
    return "blocked_by_prerequisite";
  }

  if (states.some((state) => state === "needs_review")) {
    return "needs_review";
  }

  if (states.some((state) => state !== "not_started")) {
    return "in_progress";
  }

  return "not_started";
}

export function aggregateLearningPathProgress(
  tree: PublishedLearningPathTree,
  records: StudentProgressRecord[]
): LearningPathProgressSummary {
  const byMission = new Map(
    records
      .filter((record) => record.nodeType === "mission")
      .map((record) => [record.nodeStableId, record.state])
  );

  let pathCompleted = 0;
  let pathTotal = 0;

  const courses = tree.courses.map((course) => {
    let courseCompleted = 0;
    let courseTotal = 0;

    const modules = course.modules.map((module) => {
      const missions = module.missions.map((mission) => {
        const state = missionState(byMission.get(mission.stableId));

        courseTotal += 1;
        pathTotal += 1;

        if (
          state === "completed" ||
          state === "competency_demonstrated"
        ) {
          courseCompleted += 1;
          pathCompleted += 1;
        }

        return {
          stableId: mission.stableId,
          state
        };
      });

      return {
        stableId: module.stableId,
        state: aggregateState(missions.map((mission) => mission.state)),
        completedMissions: missions.filter(
          (mission) =>
            mission.state === "completed" ||
            mission.state === "competency_demonstrated"
        ).length,
        totalMissions: missions.length,
        missions
      };
    });

    return {
      stableId: course.stableId,
      state: aggregateState(modules.map((module) => module.state)),
      completedMissions: courseCompleted,
      totalMissions: courseTotal,
      modules
    };
  });

  return {
    stableId: tree.learningPath.stableId,
    state: aggregateState(courses.map((course) => course.state)),
    completedMissions: pathCompleted,
    totalMissions: pathTotal,
    completionPercent:
      pathTotal === 0
        ? 0
        : Math.round((pathCompleted / pathTotal) * 100),
    courses
  };
}
