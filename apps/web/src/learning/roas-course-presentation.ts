import type {
  LearningPathProgressSummary,
  LearningProgressState,
  LearningResumeTarget,
  PublishedLearningPathTree,
  RecommendedNextAction
} from "@tlp/shared-types";
import type { LearnerCourse, LearnerMission } from "./roas-course-content";

/**
 * ROAS-3 — where authored content meets server-owned learner state.
 *
 * ## The rule this module exists to enforce
 *
 * The course *content* comes from ROAS-2. Everything about the *learner* —
 * whether the curriculum is published, how far they have got, what they should
 * do next, whether a mission is reachable — belongs to the Curriculum and
 * Learning Engines and arrives over the API.
 *
 * The failure mode worth engineering against is not a wrong number. It is the
 * browser quietly inventing a comfortable default: showing "not started" when
 * the truth is "we could not ask", or a tidy 0% when the truth is "this course
 * is not published to you". Both read as facts to a learner and neither is one.
 *
 * So every function here is total over the *absence* of server data, and the
 * absent case is always a distinct, named, honest state — never a substituted
 * value. `MissionProgressDisplay` cannot express "not started" unless the
 * server said so: the unknown case carries no `state` field at all, so the type
 * checker refuses the substitution rather than relying on discipline.
 *
 * Nothing here computes completion. `aggregateLearningPathProgress` already
 * does that on the server, and a second implementation in the browser would be
 * a second answer.
 */

export type CourseAvailabilityKind =
  | "available"
  | "not_published"
  | "unauthorized"
  | "unavailable"
  | "loading";

export interface CourseAvailability {
  kind: CourseAvailabilityKind;
  /** Short status the learner reads first. */
  headline: string;
  /** What it means for them, and what happens to their work. */
  explanation: string;
  /**
   * Whether the Learning Engine is currently recording this learner's progress.
   *
   * The only `true` case is a published, reachable curriculum. Every progress
   * control is gated on this, so a learner can never press a button that
   * silently does nothing.
   */
  progressRecorded: boolean;
}

/**
 * Classify what the server told us about this course.
 *
 * `publishedMissionStableIds` is null whenever the curriculum read did not
 * succeed. An error code is mapped to its own state rather than collapsing
 * everything into a generic failure, because "you are signed out",
 * "this is not published yet" and "we could not reach the platform" call for
 * three different actions from the learner.
 */
export function resolveCourseAvailability(input: {
  loading?: boolean;
  publishedMissionStableIds: readonly string[] | null;
  errorCode?: string;
}): CourseAvailability {
  if (input.loading) {
    return {
      kind: "loading",
      headline: "Loading your course…",
      explanation: "Checking what is available to you and where you left off.",
      progressRecorded: false
    };
  }

  if (input.errorCode === "UNAUTHORIZED") {
    return {
      kind: "unauthorized",
      headline: "You need to sign in again",
      explanation:
        "Your session has expired. Sign in again to continue — nothing you have already done has been lost.",
      progressRecorded: false
    };
  }

  if (input.errorCode === "NOT_FOUND") {
    return {
      kind: "not_published",
      headline: "This course is not published to you yet",
      explanation:
        "You can read the material below, but it is not part of your learning path yet, so your progress is not being recorded.",
      progressRecorded: false
    };
  }

  if (input.errorCode !== undefined || input.publishedMissionStableIds === null) {
    return {
      kind: "unavailable",
      headline: "We could not load your progress",
      explanation:
        "The course material below is still readable. Your saved progress has not changed and will reappear when the platform is reachable again.",
      progressRecorded: false
    };
  }

  if (input.publishedMissionStableIds.length === 0) {
    return {
      kind: "not_published",
      headline: "This course is not published to you yet",
      explanation:
        "You can read the material below, but it is not part of your learning path yet, so your progress is not being recorded.",
      progressRecorded: false
    };
  }

  return {
    kind: "available",
    headline: "You are enrolled in this course",
    explanation: "Your progress is saved as you work through the missions.",
    progressRecorded: true
  };
}

/**
 * The published mission ids in a learning path tree.
 *
 * The Curriculum Engine only ever returns published nodes, so presence in this
 * list is the authoritative answer to "may this learner reach that mission".
 */
export function collectPublishedMissionStableIds(
  tree: PublishedLearningPathTree
): string[] {
  return tree.courses.flatMap((course) =>
    course.modules.flatMap((module) =>
      module.missions.map((mission) => mission.stableId)
    )
  );
}

/**
 * What is known about one mission's progress.
 *
 * The unknown variant carries no `state`, which is the point: there is no way
 * to render an unknown mission as "not started" without the type checker
 * objecting.
 */
export type MissionProgressDisplay =
  | { known: true; state: LearningProgressState; label: string }
  | { known: false; label: string };

const PROGRESS_LABELS: Record<LearningProgressState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  competency_demonstrated: "Demonstrated",
  needs_review: "Ready for review",
  blocked_by_prerequisite: "Available after earlier work"
};

/** The learner-facing word for a server progress state. */
export function describeProgressState(state: LearningProgressState): string {
  return PROGRESS_LABELS[state];
}

/**
 * Join one authored mission to the server's record of it.
 *
 * A mission the progress summary does not mention is unknown, not unstarted:
 * the summary covers exactly the published missions, so silence means the
 * mission is not published rather than untouched.
 */
export function describeMissionProgress(
  availability: CourseAvailability,
  progress: LearningPathProgressSummary | null,
  missionStableId: string
): MissionProgressDisplay {
  if (availability.kind !== "available" || progress === null) {
    return { known: false, label: "Progress not recorded" };
  }

  for (const course of progress.courses) {
    for (const module of course.modules) {
      for (const mission of module.missions) {
        if (mission.stableId === missionStableId) {
          return {
            known: true,
            state: mission.state,
            label: describeProgressState(mission.state)
          };
        }
      }
    }
  }

  return { known: false, label: "Not part of your path yet" };
}

/**
 * The one-line course progress summary.
 *
 * Percentages come from the server's own aggregation. When the server has not
 * answered, this says so instead of rendering a zero.
 */
export function describeCourseProgress(
  availability: CourseAvailability,
  progress: LearningPathProgressSummary | null
): string {
  if (availability.kind === "loading") return "Checking your progress…";
  if (availability.kind !== "available" || progress === null) {
    return "Your progress is not being recorded for this course yet.";
  }

  if (progress.totalMissions === 0) {
    return "No missions are published in your path yet.";
  }

  if (progress.completedMissions === 0) {
    return `You have not completed any of the ${progress.totalMissions} missions in your path yet. Start wherever makes sense for you.`;
  }

  return `You have completed ${progress.completedMissions} of ${progress.totalMissions} missions in your path (${progress.completionPercent}%).`;
}

export interface ContinueTarget {
  /** Present only when the server named a mission this course actually has. */
  missionStableId?: string;
  label: string;
  /** The server's own explanation, shown verbatim. */
  explanation: string;
  actionable: boolean;
}

/**
 * Where "continue" goes.
 *
 * Both candidate answers are server contracts: `RecommendedNextAction`
 * (LEARN guidance) and `LearningResumeTarget` (resume). Guidance wins when
 * present because it already folds in review state and prerequisites. Nothing
 * is computed here — if neither contract names a mission, the learner is told
 * that plainly and chooses for themselves.
 *
 * A named mission the authored course does not contain is refused rather than
 * linked, so a stale server reference cannot produce a dead control.
 */
export function resolveContinueTarget(input: {
  availability: CourseAvailability;
  course: LearnerCourse;
  nextAction: RecommendedNextAction | null;
  resume: LearningResumeTarget | null;
}): ContinueTarget {
  const { availability, course, nextAction, resume } = input;

  if (availability.kind !== "available") {
    return {
      label: "Choose where to begin",
      explanation:
        "Your next step cannot be worked out right now, so nothing has been chosen for you. Any mission below is open to read.",
      actionable: false
    };
  }

  if (nextAction?.actionType === "path_complete") {
    return {
      label: "Path complete",
      explanation: nextAction.explanation,
      actionable: false
    };
  }

  if (nextAction?.actionType === "review_competency") {
    return {
      label: "Review recommended",
      explanation: nextAction.explanation,
      actionable: false
    };
  }

  if (nextAction?.actionType === "temporarily_unavailable") {
    return {
      label: "Choose where to begin",
      explanation: nextAction.explanation,
      actionable: false
    };
  }

  const candidate =
    nextAction?.missionStableId ?? resume?.missionStableId ?? undefined;

  const mission = candidate
    ? course.missions.find((entry) => entry.stableId === candidate)
    : undefined;

  if (!mission) {
    return {
      label: "Choose where to begin",
      explanation:
        "Your next step could not be matched to a mission in this course, so nothing has been chosen for you.",
      actionable: false
    };
  }

  return {
    missionStableId: mission.stableId,
    label:
      nextAction?.actionType === "continue_mission"
        ? `Continue ${mission.title}`
        : `Start ${mission.title}`,
    explanation:
      nextAction?.explanation ??
      resume?.explanation ??
      "Continue where you left off.",
    actionable: true
  };
}

/**
 * Whether a mission may be opened for reading.
 *
 * Reading is always allowed — withholding authored instruction teaches nobody
 * anything. What is gated is *recording progress*, which needs the curriculum
 * to be published and reachable.
 */
export function canRecordMissionProgress(
  availability: CourseAvailability,
  publishedMissionStableIds: readonly string[] | null,
  missionStableId: string
): boolean {
  if (!availability.progressRecorded) return false;
  if (publishedMissionStableIds === null) return false;
  return publishedMissionStableIds.includes(missionStableId);
}

/** Why a progress control is unavailable, in the learner's terms. */
export function explainProgressControl(
  availability: CourseAvailability,
  canRecord: boolean
): string {
  if (canRecord) {
    return "Marking a mission updates your saved progress.";
  }

  if (availability.kind === "not_published") {
    return "This course is not part of your learning path yet, so progress cannot be saved.";
  }

  if (availability.kind === "unauthorized") {
    return "Sign in again to save your progress.";
  }

  return "Progress cannot be saved right now. Your existing progress is unchanged.";
}

/** Resolve the open mission against the missions actually in the course. */
export function resolveSelectedMission(
  course: LearnerCourse,
  selectedMissionStableId: string | null
): LearnerMission | null {
  if (!selectedMissionStableId) return null;
  return (
    course.missions.find(
      (mission) => mission.stableId === selectedMissionStableId
    ) ?? null
  );
}

/** Stable DOM id for a mission's detail region, for `aria-controls`. */
export function buildMissionRegionId(missionStableId: string): string {
  return `mission-${missionStableId}-detail`;
}

/**
 * What the practical demonstration mission may claim today.
 *
 * The lab has no provider implementation, so the honest thing is to name the
 * step and say it is not runnable yet. Pretending otherwise would be the one
 * lie this whole package is designed not to tell.
 */
export function describeDemonstrationAvailability(): string {
  return "This mission is proved in a hands-on lab, checked automatically against fixed conditions. The lab environment is not available yet, so this mission cannot be completed here. Nothing else in the course depends on it.";
}
