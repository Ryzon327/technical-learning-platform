import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LearningPathProgressSummary,
  LearningResumeTarget,
  PublishedLearningPathTree,
  RecommendedNextAction
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import { MissionInstruction } from "./MissionInstruction";
import {
  selectInstructionSource,
  type InstructionSource,
  type MissionInstructionRequest
} from "./mission-instruction-presentation";
import { PracticeCheckPanel } from "./PracticeCheckPanel";
import {
  buildRoasLearnerCourse,
  describeEstimatedTime,
  type BriefBlock,
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
  loadMissionInstruction,
  loadPublishedLearningPath,
  loadRecommendedNextAction,
  loadResumeTarget,
  recordMissionProgress
} from "./learning-service";
import {
  describeMissionPracticeAuthority,
  describePracticeAuthority
} from "./roas-practice";
import {
  LEARNER_PATH_STABLE_ID,
  selectLearnerCourse
} from "./curriculum-course-projection";

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

/**
 * One block of an authored brief.
 *
 * Unchanged from the markup this view has always produced: a block whose lines
 * were authored as a list becomes a real list, everything else a paragraph.
 * Shared by both brief paths so the server's brief and the bundled brief cannot
 * drift apart visually.
 */
function renderBriefBlock(block: BriefBlock, index: number) {
  return block.kind === "list" ? (
    <ul key={index} className="mission-brief-list">
      {block.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : (
    <p key={index}>{block.text}</p>
  );
}

/**
 * WP-F — the mission's instruction, from whichever single source applies.
 *
 * Four sources, one visible at a time. `selectInstructionSource` has already
 * chosen; this renders only what it chose, which is why there is no branch here
 * in which two sources could appear together.
 *
 * The two brief paths are kept separate rather than merged into one expression.
 * They come from different places and retire at different times: `legacy` is the
 * server's own `missions.description`, which CURR-010 section 13.4 keeps
 * indefinitely for a published mission with no authored steps, while `bundled`
 * is the course's compiled-in brief and exists only until the instruction
 * endpoint can answer for every mission. WP-G owns removing the second; nothing
 * in WP-F does.
 */
function MissionInstructionBody({
  source,
  mission
}: {
  source: InstructionSource;
  mission: LearnerMission;
}) {
  if (source.kind === "structured") {
    return (
      <MissionInstruction
        steps={source.steps}
        assets={source.assets}
        missionStableId={mission.stableId}
      />
    );
  }

  if (source.kind === "unavailable") {
    return <p className="mission-note">{source.message}</p>;
  }

  if (source.kind === "legacy") {
    return <>{source.blocks.map(renderBriefBlock)}</>;
  }

  return <>{mission.brief.map(renderBriefBlock)}</>;
}

function MissionDetail({
  mission,
  totalMissions,
  progressLabel,
  controls,
  saving,
  feedback,
  practice,
  instructionSource,
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
  /** Already reduced to one source. See selectInstructionSource. */
  instructionSource: InstructionSource;
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

      <MissionInstructionBody source={instructionSource} mission={mission} />

      {mission.isDemonstration && (
        <p className="mission-note">{describeDemonstrationAvailability()}</p>
      )}

      {/*
        WP-B / DEC-055. Grouped by what the mission DOES with each competency,
        not by whether it is required. The previous grouping put "What this
        mission develops" above the required list, which announced Mission 4's
        default gateway and Mission 6's connectivity verification as newly
        taught when both were developed earlier. Required-versus-supporting is a
        separate axis and is not what these headings are about.
      */}
      {mission.developsCompetencies.length > 0 && (
        <>
          <h4 id={`${mission.stableId}-develops`}>What this mission teaches you</h4>
          <ul aria-labelledby={`${mission.stableId}-develops`}>
            {mission.developsCompetencies.map((competency) => (
              <li key={competency.stableId}>
                <strong>{competency.title}</strong> — {competency.description}
              </li>
            ))}
          </ul>
        </>
      )}

      {mission.reinforcesCompetencies.length > 0 && (
        <>
          <h4 id={`${mission.stableId}-reinforces`}>
            What you already learned and use again here
          </h4>
          <ul aria-labelledby={`${mission.stableId}-reinforces`}>
            {mission.reinforcesCompetencies.map((competency) => (
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

  // The transitional compiled-in course. Stable for the life of the bundle, so
  // it is built once: it is repository content, not learner state.
  //
  // Router-on-a-Stick still comes from here, and only Router-on-a-Stick. Its
  // bundle supplies competency links, the lab demonstration marker and practice
  // placement, none of which the published tree carries yet; projecting it from
  // the tree today would silently drop all three.
  const bundledCourse = useMemo(() => buildRoasLearnerCourse(), []);

  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  // WP-J / J1.5. The authoritative published hierarchy, RETAINED.
  //
  // This request was always made, and its answer was always reduced to a flat
  // list of published mission ids before anything else could read it. Keeping
  // the tree is the whole of this slice: course, module and mission structure
  // now come from the Curriculum Engine for every course except the one still
  // being served from its bundle.
  const [publishedTree, setPublishedTree] =
    useState<PublishedLearningPathTree | null>(null);
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

  // WP-F. The open mission's instructional content.
  //
  // ONE state slice, and it carries the mission it belongs to.
  //
  // This was three loose values — response, error code, loading — cleared in
  // the effect below. That had a race, and clearing them harder would not have
  // fixed it: an effect runs after the render that scheduled it, so on the
  // render where the selection moves from one mission to the next, the previous
  // mission's response was still present and still consumable. Its structured
  // instruction could appear under the new mission's heading for a frame. The
  // AbortController did not cover that — it stops a late response arriving, and
  // this was a stale read of one that already had.
  //
  // Tagging the state removes the window instead of narrowing it.
  // `selectInstructionSource` is handed both this and the mission being
  // rendered, and refuses to read state belonging to any other.
  const [instructionRequest, setInstructionRequest] =
    useState<MissionInstructionRequest>({ status: "idle" });

  // Which course the learner reads. Bundled for Router-on-a-Stick, projected
  // from the published tree for anything else, and null when the tree names a
  // course that cannot be projected — see `selectLearnerCourse`, which refuses
  // to substitute one course for another.
  const course = useMemo(
    () => selectLearnerCourse({ tree: publishedTree, bundledCourse }),
    [publishedTree, bundledCourse]
  );

  // The path identity is a named constant, not a field read off the compiled-in
  // course. Taking it from a course is what made this surface course-shaped.
  const pathStableId = LEARNER_PATH_STABLE_ID;

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
        setPublishedTree(tree);
        setPublishedMissionStableIds(collectPublishedMissionStableIds(tree));
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        // The curriculum read is what decides availability. Its failure is
        // recorded as a code and classified once, in one place.
        //
        // The tree is cleared with it: a stale tree would keep projecting a
        // course the server can no longer confirm is published.
        setPublishedTree(null);
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

  // WP-F. Fetch the open mission's instruction.
  //
  // Each of the three outcomes writes the one tagged state exactly once. There
  // is deliberately no completion hook: one running after the success branch
  // would have to decide again which state it was leaving, and getting that
  // wrong would overwrite a delivered response.
  //
  // Two independent protections stop one mission's answer reaching another's
  // panel, because they cover different failures:
  //
  //   the AbortController stops a late RESPONSE from being written at all;
  //   the mission tag stops any state that was written from being READ as
  //   another mission's — including during the render before this effect runs,
  //   which is the window an effect-time reset can never close.
  //
  // An abort is silent by design: it means the learner moved on, which is not a
  // failure and must not surface as one.
  useEffect(() => {
    if (!selectedMissionStableId) {
      setInstructionRequest({ status: "idle" });
      return;
    }

    // Captured once. Every state written below is tagged with this mission,
    // never with whatever happens to be selected when the request settles.
    const missionStableId = selectedMissionStableId;
    const controller = new AbortController();

    setInstructionRequest({ status: "loading", missionStableId });

    void (async () => {
      try {
        const response = await loadMissionInstruction(
          accessToken,
          missionStableId,
          { signal: controller.signal }
        );

        setInstructionRequest({ status: "loaded", missionStableId, response });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        // Classified, not rendered. selectInstructionSource decides which codes
        // may fall back to the authored brief and which must not.
        setInstructionRequest({
          status: "error",
          missionStableId,
          errorCode:
            caught instanceof ApiRequestError ? caught.code : "INTERNAL_ERROR"
        });
      }
    })();

    return () => controller.abort();
  }, [accessToken, selectedMissionStableId]);

  const availability = resolveCourseAvailability({
    loading,
    publishedMissionStableIds,
    ...(errorCode ? { errorCode } : {})
  });

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

  // WP-J / J1.5 — fail closed, after every hook has run.
  //
  // The published tree names a course this surface cannot project: the course
  // is published, and nothing inside it is. `selectLearnerCourse` refuses to
  // substitute the compiled-in course here, because doing so would tell a
  // learner that a course they did not ask for is theirs. So the state is
  // stated plainly instead, and nothing pretends to be a working course.
  //
  // This is deliberately not the "we could not load your progress" state: the
  // curriculum read succeeded, and what it returned is simply not yet usable.
  if (course === null) {
    return (
      <section className="card" aria-labelledby="learning-course-title">
        <p className="eyebrow">Learning</p>
        <h2 id="learning-course-title">Your next course is not ready yet</h2>
        <p>
          The next course in your learning path has been published, but its
          missions have not been yet. There is nothing to work through here
          until they are.
        </p>
        <p className="mission-note">
          Nothing you have already completed has been lost.
        </p>
      </section>
    );
  }

  const selectedMission = resolveSelectedMission(
    course,
    selectedMissionStableId
  );

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
          instructionSource={selectInstructionSource(
            instructionRequest,
            selectedMission.stableId
          )}
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
