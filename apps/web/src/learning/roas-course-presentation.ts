import type {
  LearningPathProgressSummary,
  LearningProgressState,
  LearningResumeTarget,
  PublishedLearningPathTree,
  RecommendedNextAction
} from "@tlp/shared-types";
import type {
  LearnerCourse,
  LearnerMission,
  LearnerPracticeCheck
} from "./roas-course-content";

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
  mission: Pick<LearnerMission, "stableId" | "isDemonstration">
): boolean {
  // ROAS-4. The demonstration mission is settled by the deterministic lab
  // validator and by nothing else. No provider implements the probes yet, so
  // there is no honest way for a learner to complete it — and a "mark as
  // complete" button here would be precisely the simulated pass the Lab rule
  // forbids. Offering it and letting the Learning Engine accept it would record
  // a mission the learner never demonstrated.
  if (mission.isDemonstration) return false;

  if (!availability.progressRecorded) return false;
  if (publishedMissionStableIds === null) return false;
  return publishedMissionStableIds.includes(mission.stableId);
}

/** Why a progress control is unavailable, in the learner's terms. */
export function explainProgressControl(
  availability: CourseAvailability,
  canRecord: boolean,
  mission?: Pick<LearnerMission, "isDemonstration">
): string {
  if (canRecord) {
    return "Marking a mission updates your saved progress.";
  }

  // Checked before availability: this reason holds even on a fully published,
  // reachable course, and it is the accurate one to give.
  if (mission?.isDemonstration) {
    return "This mission is completed by the deterministic lab validator, not by marking it here. The lab environment does not exist yet, so it cannot be completed at all.";
  }

  // UAT-PROGRESS-UI-1. Loading is NOT a failure, and saying so was a lie a
  // learner actually read.
  //
  // `canRecordMissionProgress` is false while `availability.kind === "loading"`,
  // because `progressRecorded` is false. With no branch for it, this function
  // fell through to the generic failure sentence below. A successful save
  // refreshed the course, the refresh set `loading`, and the interface
  // simultaneously reported "Saved." and "Progress cannot be saved right now."
  //
  // `describeCourseProgress` already handled this state ("Checking your
  // progress…"). The two sibling functions had simply drifted apart.
  if (availability.kind === "loading") {
    return "Checking your saved progress…";
  }

  if (availability.kind === "not_published") {
    return "This course is not part of your learning path yet, so progress cannot be saved.";
  }

  if (availability.kind === "unauthorized") {
    return "Sign in again to save your progress.";
  }

  return "Progress cannot be saved right now. Your existing progress is unchanged.";
}

/**
 * Which progress actions a mission may offer, and why.
 *
 * UAT-PROGRESS-UI-1. The controls previously depended only on whether progress
 * could be recorded at all, never on what the server had already recorded. A
 * mission the learner had persisted as `in_progress` still offered an enabled
 * "Mark as started", which contradicts the state shown directly above it.
 *
 * The authority direction is unchanged: this reads the server's answer and
 * narrows what is offered. It never asserts a state, and it never widens what
 * `canRecordMissionProgress` already refused — the demonstration mission and an
 * unavailable course stay closed here for exactly the reasons they close there.
 *
 * The UNKNOWN case deliberately offers both actions. "The server has not told
 * us" is not "not started"; withholding controls on an unknown state would be
 * the same substitution this module exists to refuse, in the other direction.
 * The server remains the authority on what the action then does.
 */
export interface MissionControlState {
  canStart: boolean;
  canComplete: boolean;
  explanation: string;
}

export function resolveMissionControlState(input: {
  availability: CourseAvailability;
  publishedMissionStableIds: readonly string[] | null;
  mission: Pick<LearnerMission, "stableId" | "isDemonstration">;
  missionProgress: MissionProgressDisplay;
}): MissionControlState {
  const canRecord = canRecordMissionProgress(
    input.availability,
    input.publishedMissionStableIds,
    input.mission
  );

  const explanation = explainProgressControl(
    input.availability,
    canRecord,
    input.mission
  );

  if (!canRecord) {
    return { canStart: false, canComplete: false, explanation };
  }

  if (!input.missionProgress.known) {
    return { canStart: true, canComplete: true, explanation };
  }

  switch (input.missionProgress.state) {
    case "completed":
    case "competency_demonstrated":
      // Already recorded. Re-asserting it would be a no-op the learner cannot
      // distinguish from a fresh save.
      return {
        canStart: false,
        canComplete: false,
        explanation: "You have finished this mission. Your progress is saved."
      };

    case "in_progress":
      return {
        canStart: false,
        canComplete: true,
        explanation: "You have started this mission. Mark it complete when you are done."
      };

    default:
      return { canStart: true, canComplete: true, explanation };
  }
}

/**
 * Feedback from one progress operation, and the mission it belongs to.
 *
 * UAT-PROGRESS-FEEDBACK-1. This used to be a bare string in the view, cleared
 * only when the next save began. Nothing tied it to a mission and nothing
 * cleared it on navigation, so a confirmation earned on one mission stayed on
 * screen while another was opened — and the message says "this mission", which
 * is deictic. It silently re-pointed at whatever was rendered beneath it.
 *
 * A learner therefore saw Mission 7 reporting "Not started", with both controls
 * disabled and the validator explanation shown, directly above
 * `Saved. The platform now records this mission as "in progress".`
 *
 * Carrying the owner in the value makes that unrepresentable rather than merely
 * avoided: rendering has to ask whose feedback this is, and a future navigation
 * path that forgets to clear cannot reattach an old operation to a new mission.
 */
export type ProgressFeedbackOutcome = "saved" | "failed";

export interface ProgressFeedback {
  /** The mission this feedback is about. Nothing else may display it. */
  missionStableId: string;
  action: "start" | "complete";
  outcome: ProgressFeedbackOutcome;
  message: string;
}

/**
 * What the server recorded, phrased for a learner.
 *
 * The state is the one the server returned, never the one that was requested —
 * asking to complete a mission and being told it is `in_progress` must read as
 * `in_progress`.
 */
export function buildSavedFeedback(
  missionStableId: string,
  action: "start" | "complete",
  recordedState: string
): ProgressFeedback {
  return {
    missionStableId,
    action,
    outcome: "saved",
    message: `Saved. The platform now records this mission as "${recordedState.replace(/_/g, " ")}".`
  };
}

/**
 * A save that did not happen.
 *
 * The wording is unchanged from before this package: it names the failure and
 * states that existing progress is untouched, which is the honest claim — the
 * write either applied or it did not, and a failed write changed nothing.
 */
export function buildFailedFeedback(
  missionStableId: string,
  action: "start" | "complete",
  detail?: string
): ProgressFeedback {
  const reason = detail?.trim();

  return {
    missionStableId,
    action,
    outcome: "failed",
    message: reason
      ? `Not saved. ${reason} Your existing progress is unchanged.`
      : "Not saved. Your existing progress is unchanged."
  };
}

/**
 * The feedback a given mission may display, or null.
 *
 * The whole point of the package: feedback earned elsewhere is not this
 * mission's to show. This is the single place that decides, so there is one
 * answer rather than one per call site.
 */
export function resolveProgressFeedback(
  feedback: ProgressFeedback | null,
  missionStableId: string
): ProgressFeedback | null {
  if (feedback === null) return null;
  return feedback.missionStableId === missionStableId ? feedback : null;
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

/* ------------------------------------------------------------------ *
 * PRACTICE-ARCH-1 — where practice appears, and when
 * ------------------------------------------------------------------ */

/**
 * How far through the course the learner has actually got.
 *
 * The reference point for "do not show practice about concepts not yet
 * reached". It is the furthest of:
 *
 *   - the mission currently open, because reading a mission is reaching it;
 *   - the furthest mission the SERVER reports as started or completed.
 *
 * Both inputs already exist. Unknown progress simply contributes nothing rather
 * than being read as "reached nothing" or as "reached everything" — the same
 * rule the rest of this module follows, applied here.
 *
 * Returns -1 when nothing has been reached, which makes every gated check
 * ineligible rather than accidentally eligible.
 */
export function resolveReachedMissionIndex(
  course: LearnerCourse,
  progress: LearningPathProgressSummary | null,
  selectedMissionStableId: string | null
): number {
  const indexOf = new Map(
    course.missions.map((mission, index) => [mission.stableId, index])
  );

  let reached = -1;

  if (selectedMissionStableId !== null) {
    reached = Math.max(reached, indexOf.get(selectedMissionStableId) ?? -1);
  }

  if (progress === null) return reached;

  for (const summaryCourse of progress.courses) {
    for (const module of summaryCourse.modules) {
      for (const mission of module.missions) {
        const started =
          mission.state === "in_progress" ||
          mission.state === "completed" ||
          mission.state === "competency_demonstrated";

        if (!started) continue;
        reached = Math.max(reached, indexOf.get(mission.stableId) ?? -1);
      }
    }
  }

  return reached;
}

/**
 * The practice that belongs to one mission.
 *
 * A mission-scoped check appears at the mission where it BECOMES answerable,
 * and only there. That is what makes it read as "practice for what you just
 * learned" rather than as a growing pile beneath every later mission — the
 * cumulative reading is what the review section is for.
 *
 * Course-review checks are never returned here, whatever their availability.
 */
export function selectMissionPractice(
  course: LearnerCourse,
  missionStableId: string
): readonly LearnerPracticeCheck[] {
  return course.practice.filter(
    (check) =>
      check.scope === "mission" &&
      check.availableFromMissionStableId === missionStableId
  );
}

export interface CourseReviewPractice {
  /** Cumulative checks the learner has reached the material for. */
  available: readonly LearnerPracticeCheck[];
  /** How many cumulative checks are still ahead. Never their content. */
  lockedCount: number;
  explanation: string;
}

/**
 * Cumulative review across the course.
 *
 * Deliberately separate from any mission: these integrate competencies
 * developed across several missions and belong to the course, not to whatever
 * happens to be open.
 *
 * A check the learner has not reached the material for is COUNTED but not
 * returned. Saying "there is more review ahead" is honest; rendering its
 * questions would be the early exposure this package exists to stop.
 */
export function selectCourseReview(
  course: LearnerCourse,
  reachedMissionIndex: number
): CourseReviewPractice {
  const cumulative = course.practice.filter(
    (check) => check.scope === "course_review"
  );

  const available = cumulative.filter(
    (check) =>
      check.availableFromIndex >= 0 &&
      check.availableFromIndex <= reachedMissionIndex
  );

  const lockedCount = cumulative.length - available.length;

  if (cumulative.length === 0) {
    return { available, lockedCount, explanation: "" };
  }

  if (available.length === 0) {
    return {
      available,
      lockedCount,
      explanation:
        "Cumulative review opens once you have worked through the missions it draws on. Nothing here is scored, and nothing is missed by leaving it."
    };
  }

  return {
    available,
    lockedCount,
    explanation:
      lockedCount === 0
        ? "This review draws on several missions at once, so it is a good way to check what has stayed with you."
        : "This review draws on several missions at once. More opens as you work further through the course."
  };
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
