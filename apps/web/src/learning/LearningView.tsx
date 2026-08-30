import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LearningPathProgressSummary,
  LearningResumeTarget,
  RecommendedNextAction
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import { PracticeCheckPanel } from "./PracticeCheckPanel";
import {
  buildRoasLearnerCourse,
  describeEstimatedTime,
  type LearnerMission,
  type LearnerPracticeCheck
} from "./roas-course-content";
import {
  buildMissionRegionId,
  collectPublishedMissionStableIds,
  describeCourseProgress,
  describeDemonstrationAvailability,
  describeMissionProgress,
  buildFailedFeedback,
  buildSavedFeedback,
  resolveContinueTarget,
  resolveCourseAvailability,
  resolveMissionControlState,
  resolveProgressFeedback,
  resolveReachedMissionIndex,
  resolveSelectedMission,
  selectCourseReview,
  selectMissionPractice,
  type MissionControlState,
  type ProgressFeedback
} from "./roas-course-presentation";
import {
  loadLearningPathProgress,
  loadPublishedLearningPath,
  loadRecommendedNextAction,
  loadResumeTarget,
  recordMissionProgress
} from "./learning-service";
import {
  describeMissionPracticeAuthority,
  describePracticeAuthority
} from "./roas-practice";

/**
 * ROAS-3 — the learner's Router-on-a-Stick course experience.
 *
 * The course text comes from ROAS-2's authored content through
 * `buildRoasLearnerCourse`. Publication, progress, resume and next action come
 * from the Learning and Curriculum Engines. This component joins the two and
 * asserts neither: when the server has not answered, the interface says so
 * rather than filling the gap with a plausible default.
 *
 * There is no router. The workspace shell navigates with native buttons and
 * local state, and one course does not justify a routing dependency.
 *
 * Accessibility: a heading hierarchy that matches the structure, real lists for
 * real lists, `aria-current` on the open mission, `aria-controls` pointing at a
 * region that always exists, polite live regions for load and save outcomes,
 * and focus moved to the mission heading when a mission is opened so a keyboard
 * user is not left at the top of the outline.
 */

function MissionDetail({
  mission,
  totalMissions,
  progressLabel,
  controls,
  saving,
  feedback,
  practice,
  onRecord
}: {
  mission: LearnerMission;
  totalMissions: number;
  progressLabel: string;
  controls: MissionControlState;
  saving: boolean;
  /** Already resolved to this mission, or null. See resolveProgressFeedback. */
  feedback: ProgressFeedback | null;
  /** Already selected for this mission. See selectMissionPractice. */
  practice: readonly LearnerPracticeCheck[];
  onRecord: (action: "start" | "complete") => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = `${buildMissionRegionId(mission.stableId)}-title`;

  useEffect(() => {
    headingRef.current?.focus();
  }, [mission.stableId]);

  return (
    <section
      className="mission-detail"
      aria-labelledby={headingId}
      id={buildMissionRegionId(mission.stableId)}
    >
      <p className="eyebrow">
        Mission {mission.ordinal} of {totalMissions} ·{" "}
        {describeEstimatedTime(mission.estimatedMinutes)}
      </p>
      <h3 id={headingId} ref={headingRef} tabIndex={-1}>
        {mission.title}
      </h3>
      <p className="mission-state">{progressLabel}</p>

      {mission.brief.map((block, index) =>
        block.kind === "list" ? (
          <ul key={index} className="mission-brief-list">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.text}</p>
        )
      )}

      {mission.isDemonstration && (
        <p className="mission-note">{describeDemonstrationAvailability()}</p>
      )}

      {mission.requiredCompetencies.length > 0 && (
        <>
          <h4 id={`${mission.stableId}-required`}>What this mission develops</h4>
          <ul aria-labelledby={`${mission.stableId}-required`}>
            {mission.requiredCompetencies.map((competency) => (
              <li key={competency.stableId}>
                <strong>{competency.title}</strong> — {competency.description}
              </li>
            ))}
          </ul>
        </>
      )}

      {mission.supportingCompetencies.length > 0 && (
        <>
          <h4 id={`${mission.stableId}-supporting`}>Also drawn on here</h4>
          <ul aria-labelledby={`${mission.stableId}-supporting`}>
            {mission.supportingCompetencies.map((competency) => (
              <li key={competency.stableId}>
                <strong>{competency.title}</strong> — {competency.description}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mission-note">{controls.explanation}</p>

      <button
        type="button"
        disabled={!controls.canStart || saving}
        onClick={() => onRecord("start")}
      >
        Mark as started
      </button>{" "}
      <button
        type="button"
        disabled={!controls.canComplete || saving}
        onClick={() => onRecord("complete")}
      >
        Mark as complete
      </button>

      <p aria-live="polite">{feedback?.message ?? ""}</p>

      {practice.length > 0 && (
        <section aria-labelledby={`${mission.stableId}-practice`}>
          <h4 id={`${mission.stableId}-practice`}>Practice what you just read</h4>
          <p>{describeMissionPracticeAuthority()}</p>
          <ul
            className="practice-list"
            aria-labelledby={`${mission.stableId}-practice`}
          >
            {practice.map((check) => (
              <PracticeCheckPanel
                key={check.definition.stableId}
                definition={check.definition}
              />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

export function LearningView() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  // Authored content. Stable for the life of the bundle, so it is built once
  // and never refetched: it is repository content, not learner state.
  const course = useMemo(() => buildRoasLearnerCourse(), []);

  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [publishedMissionStableIds, setPublishedMissionStableIds] = useState<
    string[] | null
  >(null);
  const [progress, setProgress] =
    useState<LearningPathProgressSummary | null>(null);
  const [resume, setResume] = useState<LearningResumeTarget | null>(null);
  const [nextAction, setNextAction] =
    useState<RecommendedNextAction | null>(null);

  const [selectedMissionStableId, setSelectedMissionStableId] = useState<
    string | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<ProgressFeedback | null>(null);

  const pathStableId = course.learningPathStableId;

  // `background` distinguishes the FIRST load from a post-write revalidation.
  //
  // UAT-PROGRESS-UI-1. `handleRecord` refreshed by calling this, which set
  // `loading`, which made availability `loading`, which made
  // `canRecordMissionProgress` false, which made the control note read
  // "Progress cannot be saved right now." — beside a "Saved." message, after a
  // write the server had accepted with HTTP 200.
  //
  // A revalidation is not a cold start. The previous successful read stays
  // authoritative on screen while the new one is in flight, so the course does
  // not regress to "Loading your course…" after a successful save. A genuine
  // failure during that refresh still clears the curriculum read and sets the
  // error code below, so real failures surface exactly as before.
  const load = useCallback(
    async (signal: AbortSignal, options: { background?: boolean } = {}) => {
      const background = options.background === true;

      if (!background) setLoading(true);
      setErrorCode(undefined);

      try {
        const tree = await loadPublishedLearningPath(
          accessToken,
          pathStableId,
          { signal }
        );
        setPublishedMissionStableIds(collectPublishedMissionStableIds(tree));
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        // The curriculum read is what decides availability. Its failure is
        // recorded as a code and classified once, in one place.
        setPublishedMissionStableIds(null);
        setErrorCode(
          caught instanceof ApiRequestError ? caught.code : "INTERNAL_ERROR"
        );
        if (!background) setLoading(false);
        return;
      }

      // Learner state is loaded independently. A failure here leaves the
      // corresponding value null, which every consumer renders as "unknown"
      // rather than as an absence of progress.
      const settle = async <T,>(
        work: Promise<T>,
        apply: (value: T) => void
      ) => {
        try {
          apply(await work);
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "AbortError") {
            return;
          }
          // Deliberately swallowed: the specific learner read is simply
          // unknown. Availability is already decided by the curriculum read.
        }
      };

      await Promise.all([
        settle(
          loadLearningPathProgress(accessToken, pathStableId, { signal }),
          setProgress
        ),
        settle(
          loadResumeTarget(accessToken, pathStableId, { signal }),
          setResume
        ),
        settle(
          loadRecommendedNextAction(accessToken, pathStableId, { signal }),
          setNextAction
        )
      ]);

      if (!background) setLoading(false);
    },
    [accessToken, pathStableId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const availability = resolveCourseAvailability({
    loading,
    publishedMissionStableIds,
    ...(errorCode ? { errorCode } : {})
  });

  const selectedMission = resolveSelectedMission(
    course,
    selectedMissionStableId
  );

  // UAT-PROGRESS-FEEDBACK-1. Opening a different mission ends the previous
  // operation's feedback.
  //
  // Ownership alone would already stop the message rendering under the wrong
  // mission, but on its own it would let an old confirmation REAPPEAR on
  // returning to the mission that earned it — resurrecting a result from a
  // visit the learner has since left. Feedback is about an action just taken,
  // not a property of the mission, so it ends when that context does.
  //
  // Routing every selection through one callback is what stops a future call
  // site from setting the mission without ending the feedback.
  const selectMission = useCallback((missionStableId: string | null) => {
    setSelectedMissionStableId(missionStableId);
    setFeedback(null);
  }, []);

  const courseReview = selectCourseReview(
    course,
    resolveReachedMissionIndex(course, progress, selectedMissionStableId)
  );

  const continueTarget = resolveContinueTarget({
    availability,
    course,
    nextAction,
    resume
  });

  async function handleRecord(
    mission: LearnerMission,
    action: "start" | "complete"
  ) {
    setSaving(true);
    setFeedback(null);

    try {
      const record = await recordMissionProgress(
        accessToken,
        mission.stableId,
        action
      );
      // What is displayed is what the server returned, not what was requested,
      // and it is stamped with the mission that earned it.
      setFeedback(
        buildSavedFeedback(mission.stableId, action, record.state)
      );
      const controller = new AbortController();
      await load(controller.signal, { background: true });
    } catch (caught) {
      setFeedback(
        buildFailedFeedback(
          mission.stableId,
          action,
          caught instanceof ApiRequestError ? caught.message : undefined
        )
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" aria-labelledby="learning-course-title">
      <p className="eyebrow">Learning</p>
      <h2 id="learning-course-title">{course.title}</h2>
      <p>{course.description}</p>
      <p className="mission-note">
        {describeEstimatedTime(course.estimatedMinutes)} in total, at whatever
        pace suits you. Nothing here expires.
      </p>

      <div aria-live="polite">
        <p className="course-status">
          <strong>{availability.headline}</strong>
        </p>
        <p>{availability.explanation}</p>
        <p>{describeCourseProgress(availability, progress)}</p>
      </div>

      <section aria-labelledby="learning-continue-title">
        <h3 id="learning-continue-title">What to do next</h3>
        <p>{continueTarget.explanation}</p>
        {continueTarget.actionable && continueTarget.missionStableId && (
          <button
            type="button"
            onClick={() =>
              selectMission(continueTarget.missionStableId ?? null)
            }
          >
            {continueTarget.label}
          </button>
        )}
      </section>

      <section aria-labelledby="learning-outcomes-title">
        <h3 id="learning-outcomes-title">What you will be able to do</h3>
        <ul aria-labelledby="learning-outcomes-title">
          {course.outcomes.map((outcome) => (
            <li key={outcome.stableId}>
              <strong>{outcome.title}</strong> — {outcome.description}
            </li>
          ))}
        </ul>
      </section>

      <nav aria-labelledby="learning-outline-title">
        <h3 id="learning-outline-title">Course outline</h3>
        <ol className="module-list">
          {course.modules.map((module) => (
            <li key={module.stableId}>
              <h4 id={`${module.stableId}-title`}>{module.title}</h4>
              <p>{module.description}</p>
              <ul aria-labelledby={`${module.stableId}-title`}>
                {module.missions.map((mission) => {
                  const missionProgress = describeMissionProgress(
                    availability,
                    progress,
                    mission.stableId
                  );
                  const isOpen =
                    selectedMission?.stableId === mission.stableId;

                  return (
                    <li key={mission.stableId}>
                      <button
                        type="button"
                        aria-current={isOpen ? "true" : undefined}
                        aria-controls={buildMissionRegionId(mission.stableId)}
                        onClick={() =>
                          selectMission(mission.stableId)
                        }
                      >
                        {mission.title}
                      </button>{" "}
                      <span className="mission-state">
                        {missionProgress.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </nav>

      {selectedMission ? (
        <MissionDetail
          mission={selectedMission}
          totalMissions={course.missions.length}
          progressLabel={
            describeMissionProgress(
              availability,
              progress,
              selectedMission.stableId
            ).label
          }
          controls={resolveMissionControlState({
            availability,
            publishedMissionStableIds,
            mission: selectedMission,
            missionProgress: describeMissionProgress(
              availability,
              progress,
              selectedMission.stableId
            )
          })}
          saving={saving}
          feedback={resolveProgressFeedback(
            feedback,
            selectedMission.stableId
          )}
          practice={selectMissionPractice(course, selectedMission.stableId)}
          onRecord={(action) => void handleRecord(selectedMission, action)}
        />
      ) : (
        <p>Choose a mission above to read it. You can move between them freely.</p>
      )}

      <section aria-labelledby="learning-review-title">
        <h3 id="learning-review-title">Cumulative course review</h3>
        <p>{describePracticeAuthority()}</p>
        <p>{courseReview.explanation}</p>
        {courseReview.available.length > 0 && (
          <ul className="practice-list" aria-labelledby="learning-review-title">
            {courseReview.available.map((check) => (
              <PracticeCheckPanel
                key={check.definition.stableId}
                definition={check.definition}
              />
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
