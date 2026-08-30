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
  buildFailedFeedback,
  buildSavedFeedback,
  resolveContinueTarget,
  resolveCourseAvailability,
  resolveMissionControlState,
  resolveProgressFeedback,
  resolveSelectedMission,
  type ProgressFeedback
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
  // Every non-demonstration mission; the demonstration has its own rule below.
  const ordinaryMission = course.missions.find(
    (mission) => !mission.isDemonstration
  )!;
  const demonstrationMission = course.missions.find(
    (mission) => mission.isDemonstration
  )!;

  it("allows recording only for a published mission on an available course", () => {
    expect(
      canRecordMissionProgress(
        availability("available"),
        course.missions.map((m) => m.stableId),
        ordinaryMission
      )
    ).toBe(true);
  });

  it("refuses recording for a mission the server did not publish", () => {
    expect(
      canRecordMissionProgress(
        availability("available"),
        [course.missions[1]!.stableId],
        ordinaryMission
      )
    ).toBe(false);
  });

  it("refuses recording whenever the course is not available", () => {
    for (const kind of ["not_published", "unavailable"] as const) {
      expect(
        canRecordMissionProgress(
          availability(kind),
          course.missions.map((m) => m.stableId),
          ordinaryMission
        )
      ).toBe(false);
    }
  });

  it("refuses recording when the published set is unknown", () => {
    expect(
      canRecordMissionProgress(availability("available"), null, ordinaryMission)
    ).toBe(false);
  });

  // ROAS-4. The strongest version of the lab rule: even a fully published,
  // fully reachable course must not offer a way to complete the demonstration,
  // because the deterministic validator is the only thing that may settle it.
  it("NEVER allows recording the demonstration mission, even when everything else is green", () => {
    expect(
      canRecordMissionProgress(
        availability("available"),
        course.missions.map((m) => m.stableId),
        demonstrationMission
      )
    ).toBe(false);
  });

  it("says the demonstration is settled by the lab, not by marking it", () => {
    const text = explainProgressControl(
      availability("available"),
      false,
      demonstrationMission
    );
    expect(text).toMatch(/deterministic lab validator/i);
    expect(text).toMatch(/does not exist yet/i);
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

/* ------------------------------------------------------------------ *
 * UAT-PROGRESS-UI-1 — a successful save must never read as a failure
 * ------------------------------------------------------------------ */

const loadingAvailability = resolveCourseAvailability({
  loading: true,
  publishedMissionStableIds: course.missions.map((m) => m.stableId)
});

const publishedIds = course.missions.map((m) => m.stableId);
const missionOne = course.missions[0]!;
const demonstrationMission = course.missions.find((m) => m.isDemonstration)!;

/** Any sentence a learner would read as "your save did not work". */
function readsAsFailure(text: string): boolean {
  return /cannot be saved|not saved|could not|unchanged|failed/i.test(text);
}

function controlsFor(
  state: LearningProgressState | "unknown",
  mission = missionOne,
  courseAvailability = availability("available")
) {
  const progress =
    state === "unknown" ? null : progressFor({ [mission.stableId]: state });

  return resolveMissionControlState({
    availability: courseAvailability,
    publishedMissionStableIds: publishedIds,
    mission,
    missionProgress: describeMissionProgress(
      courseAvailability,
      progress,
      mission.stableId
    )
  });
}

describe("UAT-PROGRESS-UI-1 a refresh is never reported as a failed save", () => {
  // The exact defect. A successful write triggered a refresh, the refresh set
  // `loading`, and this sentence appeared beside "Saved.".
  it("NEVER calls the loading state a save failure", () => {
    const explanation = explainProgressControl(
      loadingAvailability,
      canRecordMissionProgress(loadingAvailability, publishedIds, missionOne),
      missionOne
    );

    expect(readsAsFailure(explanation)).toBe(false);
    expect(explanation).toMatch(/checking/i);
  });

  it("successful start feedback is never accompanied by failure text", () => {
    // The post-write render: the save succeeded, and a revalidation is in
    // flight. Neither the control note nor the course summary may contradict it.
    const saved = 'Saved. The platform now records this mission as "in progress".';
    const controls = controlsFor("in_progress", missionOne, loadingAvailability);

    expect(readsAsFailure(saved)).toBe(false);
    expect(readsAsFailure(controls.explanation)).toBe(false);
    expect(readsAsFailure(describeCourseProgress(loadingAvailability, null))).toBe(
      false
    );
  });

  it("successful complete feedback is never accompanied by failure text", () => {
    const saved = 'Saved. The platform now records this mission as "completed".';
    const controls = controlsFor("completed", missionOne, loadingAvailability);

    expect(readsAsFailure(saved)).toBe(false);
    expect(readsAsFailure(controls.explanation)).toBe(false);
  });

  // The transition the Founder actually observed, as a sequence.
  it("no phase of a successful save renders failure text", () => {
    const phases = [
      controlsFor("unknown", missionOne, availability("available")),
      controlsFor("in_progress", missionOne, loadingAvailability),
      controlsFor("in_progress", missionOne, availability("available"))
    ];

    for (const phase of phases) {
      expect(readsAsFailure(phase.explanation)).toBe(false);
    }
  });
});

describe("UAT-PROGRESS-UI-1 genuine failures still surface honestly", () => {
  it("an unreachable course still says progress cannot be saved", () => {
    const controls = controlsFor("unknown", missionOne, availability("unavailable"));

    expect(controls.canStart).toBe(false);
    expect(controls.canComplete).toBe(false);
    expect(readsAsFailure(controls.explanation)).toBe(true);
  });

  it("an unpublished course still refuses and explains why", () => {
    const controls = controlsFor(
      "unknown",
      missionOne,
      availability("not_published")
    );

    expect(controls.canStart).toBe(false);
    expect(controls.canComplete).toBe(false);
    expect(controls.explanation).toMatch(/not part of your learning path/i);
  });

  it("an expired session still asks the learner to sign in", () => {
    const expired = resolveCourseAvailability({
      publishedMissionStableIds: null,
      errorCode: "UNAUTHORIZED"
    });
    const controls = resolveMissionControlState({
      availability: expired,
      publishedMissionStableIds: null,
      mission: missionOne,
      missionProgress: describeMissionProgress(expired, null, missionOne.stableId)
    });

    expect(controls.canStart).toBe(false);
    expect(controls.explanation).toMatch(/sign in again/i);
  });

  it("a failed save message is recognisable as a failure", () => {
    // Pins the detector honest: it must classify the real failure string.
    expect(
      readsAsFailure("Not saved. Your existing progress is unchanged.")
    ).toBe(true);
  });
});

describe("UAT-PROGRESS-UI-1 controls reflect persisted progress", () => {
  it("a persisted in_progress mission does not offer Mark as started", () => {
    const controls = controlsFor("in_progress");

    expect(controls.canStart).toBe(false);
    expect(controls.canComplete).toBe(true);
    expect(controls.explanation).toMatch(/already started|have started/i);
  });

  it("a persisted completed mission offers neither action", () => {
    const controls = controlsFor("completed");

    expect(controls.canStart).toBe(false);
    expect(controls.canComplete).toBe(false);
    expect(controls.explanation).toMatch(/finished/i);
  });

  it("a demonstrated mission offers neither action", () => {
    const controls = controlsFor("competency_demonstrated");

    expect(controls.canStart).toBe(false);
    expect(controls.canComplete).toBe(false);
  });

  it("a not_started mission offers both actions", () => {
    const controls = controlsFor("not_started");

    expect(controls.canStart).toBe(true);
    expect(controls.canComplete).toBe(true);
  });

  // The architecture rule this module exists to protect.
  it("UNKNOWN progress is not treated as not_started", () => {
    const unknown = controlsFor("unknown");

    // Both remain offered: "the server has not said" is not "not started", and
    // withholding a control would be the same substitution in reverse.
    expect(unknown.canStart).toBe(true);
    expect(unknown.canComplete).toBe(true);
    expect(
      describeMissionProgress(availability("available"), null, missionOne.stableId)
        .known
    ).toBe(false);
  });

  it("repeating a start on an already-started mission is not offered", () => {
    // Redundant start is safe at the server, but offering it contradicts the
    // state shown directly above the control.
    const controls = controlsFor("in_progress");
    expect(controls.canStart).toBe(false);
  });

  // ROAS-4's rule, unchanged by any of this.
  it("MISSION 7 still cannot be manually completed, in any progress state", () => {
    for (const state of [
      "unknown",
      "not_started",
      "in_progress",
      "completed"
    ] as const) {
      const controls = controlsFor(state, demonstrationMission);
      expect(controls.canStart).toBe(false);
      expect(controls.canComplete).toBe(false);
      expect(controls.explanation).toMatch(/deterministic lab validator/i);
    }
  });
});

/* ------------------------------------------------------------------ *
 * UAT-PROGRESS-FEEDBACK-1 — feedback belongs to the mission that earned it
 * ------------------------------------------------------------------ */

const missionA = course.missions[0]!;
const missionB = course.missions[1]!;

/**
 * The learner's whole interaction, as the view sequences it.
 *
 * `feedback` is the view's own state; `selectMission` is its navigation
 * callback. Modelling both here lets the sequence that produced the defect be
 * replayed exactly — save on one mission, navigate, render — without a DOM.
 */
function learnerSession() {
  let feedback: ProgressFeedback | null = null;

  return {
    save(mission: { stableId: string }, action: "start" | "complete", recordedState: string) {
      feedback = null;
      feedback = buildSavedFeedback(mission.stableId, action, recordedState);
    },
    failSave(
      mission: { stableId: string },
      action: "start" | "complete",
      detail?: string
    ) {
      feedback = null;
      feedback = buildFailedFeedback(mission.stableId, action, detail);
    },
    selectMission() {
      // What LearningView's `selectMission` callback does.
      feedback = null;
    },
    /** What a mission's detail panel would render. */
    shownFor(mission: { stableId: string }): string {
      return resolveProgressFeedback(feedback, mission.stableId)?.message ?? "";
    }
  };
}

describe("UAT-PROGRESS-FEEDBACK-1 save feedback is owned by one mission", () => {
  it("a successful start shows its confirmation on the mission that earned it", () => {
    const session = learnerSession();
    session.save(missionA, "start", "in_progress");

    expect(session.shownFor(missionA)).toMatch(/^Saved\./);
    expect(session.shownFor(missionA)).toContain("in progress");
  });

  it("a successful complete behaves the same way", () => {
    const session = learnerSession();
    session.save(missionA, "complete", "completed");

    expect(session.shownFor(missionA)).toMatch(/^Saved\./);
    expect(session.shownFor(missionA)).toContain("completed");
  });

  // The exact defect: Mission A's confirmation appearing under Mission B.
  it("NEVER shows one mission's confirmation on another mission", () => {
    const session = learnerSession();
    session.save(missionA, "start", "in_progress");

    expect(session.shownFor(missionB)).toBe("");
  });

  it("ownership holds even if navigation forgot to clear", () => {
    // Defence in depth. `selectMission` clears, but a future call site that set
    // the mission directly must still not be able to reattach old feedback.
    const stale: ProgressFeedback = buildSavedFeedback(
      missionA.stableId,
      "start",
      "in_progress"
    );

    expect(resolveProgressFeedback(stale, missionB.stableId)).toBeNull();
    expect(resolveProgressFeedback(stale, missionA.stableId)).toEqual(stale);
  });

  it("navigating away ends the feedback rather than parking it", () => {
    const session = learnerSession();
    session.save(missionA, "start", "in_progress");
    session.selectMission();

    expect(session.shownFor(missionB)).toBe("");
    // And it does not resurrect on returning to the mission that earned it.
    expect(session.shownFor(missionA)).toBe("");
  });

  it("a failed save is truthful and stays on its own mission", () => {
    const session = learnerSession();
    session.failSave(missionA, "start", "The platform could not complete that request.");

    const shown = session.shownFor(missionA);
    expect(shown).toMatch(/^Not saved\./);
    expect(shown).toContain("existing progress is unchanged");
    expect(session.shownFor(missionB)).toBe("");
  });

  it("a failure with no detail still says nothing was changed", () => {
    const session = learnerSession();
    session.failSave(missionA, "complete");

    expect(session.shownFor(missionA)).toBe(
      "Not saved. Your existing progress is unchanged."
    );
  });

  it("navigating after a failure does not associate it with another mission", () => {
    const session = learnerSession();
    session.failSave(missionA, "start", "Prerequisites are not yet satisfied");
    session.selectMission();

    expect(session.shownFor(missionB)).toBe("");
  });

  it("a new save replaces the previous result rather than accumulating", () => {
    const session = learnerSession();
    session.failSave(missionA, "start", "Something went wrong.");
    session.save(missionA, "start", "in_progress");

    expect(session.shownFor(missionA)).toMatch(/^Saved\./);
    expect(session.shownFor(missionA)).not.toMatch(/Not saved/);
  });

  // The reported scenario, end to end.
  it("MISSION 7 shows no stale confirmation after another mission was saved", () => {
    const session = learnerSession();
    session.save(missionA, "start", "in_progress");
    session.selectMission();

    expect(session.shownFor(demonstrationMission)).toBe("");

    // And its controls are still closed, for the reason they were always closed.
    const controls = controlsFor("unknown", demonstrationMission);
    expect(controls.canStart).toBe(false);
    expect(controls.canComplete).toBe(false);
    expect(controls.explanation).toMatch(/deterministic lab validator/i);
  });

  it("reports the state the server recorded, not the one requested", () => {
    // Asking to complete and being told in_progress must read as in_progress.
    const session = learnerSession();
    session.save(missionA, "complete", "in_progress");

    expect(session.shownFor(missionA)).toContain("in progress");
    expect(session.shownFor(missionA)).not.toContain('"completed"');
  });

  it("carries the action that produced it, so feedback is attributable", () => {
    expect(buildSavedFeedback(missionA.stableId, "start", "in_progress")).toMatchObject({
      missionStableId: missionA.stableId,
      action: "start",
      outcome: "saved"
    });
    expect(buildFailedFeedback(missionA.stableId, "complete")).toMatchObject({
      missionStableId: missionA.stableId,
      action: "complete",
      outcome: "failed"
    });
  });

  it("no feedback at all renders nothing", () => {
    expect(resolveProgressFeedback(null, missionA.stableId)).toBeNull();
    expect(learnerSession().shownFor(missionA)).toBe("");
  });
});

describe("UAT-PROGRESS-FEEDBACK-1 the earlier repairs still hold", () => {
  // UAT-PROGRESS-UI-1 must not have regressed.
  it("a post-success background refresh still never reads as failure", () => {
    const session = learnerSession();
    session.save(missionA, "start", "in_progress");

    const duringRefresh = controlsFor("in_progress", missionA, loadingAvailability);

    expect(readsAsFailure(session.shownFor(missionA))).toBe(false);
    expect(readsAsFailure(duringRefresh.explanation)).toBe(false);
  });

  it("persisted progress remains authoritative for the controls", () => {
    expect(controlsFor("in_progress").canStart).toBe(false);
    expect(controlsFor("completed").canComplete).toBe(false);
  });

  it("unknown remains distinct from not_started", () => {
    expect(
      describeMissionProgress(availability("available"), null, missionA.stableId).known
    ).toBe(false);
    expect(controlsFor("unknown").canStart).toBe(true);
  });
});
