import { useMemo } from "react";
import type { LearnerNearTransferStep } from "@tlp/shared-types";
import { TopologyView } from "./TopologyView";
import {
  acknowledgeAnswer,
  activePhase,
  buildStaticTopologyLayout,
  canCommit,
  commitAnswer,
  describeCommitLabel,
  describeMultipleChoiceHint,
  describeProgress,
  isComplete,
  isSelected,
  resolveQuestion,
  toggleOption,
  type NearTransferState
} from "./near-transfer-presentation";

/**
 * WP-NF-NT1 — an embedded near-transfer check.
 *
 * Presentation only. Every prompt, option, answer and explanation is authored
 * curriculum; this component decides nothing about correctness and reaches no
 * service, so answering can produce no attempt, no evidence and no competency.
 *
 * ## The shape of the activity
 *
 * The scenario stays on screen while the questions advance one at a time. A
 * learner reading a topology should not have to reopen it for every question,
 * and four explanations stacked on one screen is the thing that makes an
 * activity feel like a form rather than a lesson.
 *
 * ## Accessibility
 *
 * This repository runs no rendered-DOM harness, so these are structural choices
 * rather than browser assertions:
 *  - each question is a `fieldset` whose `legend` is the prompt, which is how a
 *    screen reader announces the group;
 *  - native radios for one answer, native checkboxes for several, so arrow and
 *    space behaviour comes from the platform;
 *  - every input has a real `<label>` bound by `htmlFor`;
 *  - the verdict is a WORD in a polite live region, so correctness never
 *    depends on colour;
 *  - the topology carries its authored text equivalent, so the relationships
 *    exist for a learner who cannot see the drawing.
 */
export function NearTransferStep({
  content,
  headingId,
  instanceId,
  state,
  onChange
}: {
  content: LearnerNearTransferStep;
  headingId: string;
  instanceId: string;
  /**
   * Held by `MissionInstruction` rather than here, because the steps AFTER
   * this one wait on it. State owned privately by this component could not be
   * read by the thing that has to wait for it.
   */
  state: NearTransferState;
  onChange: (next: (current: NearTransferState) => NearTransferState) => void;
}) {
  const setState = onChange;

  // The drawing is derived from authored data and never from learner state, so
  // it is computed once rather than on every selection.
  const layout = useMemo(
    () =>
      content.topology === undefined
        ? null
        : buildStaticTopologyLayout(content.topology),
    [content.topology]
  );

  /*
    WHETHER THE DIAGRAM ALREADY SAYS WHAT THE SENTENCE SAYS.

    Read from the LAYOUT, which is presentation state derived from authored
    data — never from a mission id, and never from a hand-maintained list.

    `portLabels` is non-empty exactly when an author named the ports on this
    topology's connections, which is the case where the picture visibly carries
    the mapping and the sentence below it repeats it. Mission 2 names three;
    Mission 1 names none and reads unchanged.

    Any future activity gets the right answer for free: name your ports and the
    sentence steps out of the way, name none and it stays where it was.
  */
  const diagramNamesItsPorts =
    layout !== null && layout.state === "available" && layout.portLabels.length > 0;

  const phase = activePhase(content, state);
  const progress = describeProgress(content, state);

  return (
    <section aria-labelledby={headingId} className="near-transfer">
      {content.title !== undefined && <h4 id={headingId}>{content.title}</h4>}
      {content.framing !== undefined && <p>{content.framing}</p>}

      {/* ------------------------------------------------------------ *
          THE SCENARIO — standing context, not a step.

          It stays visible while the questions advance, because every question
          is about it. Nothing here moves: no stage is revealed, so no device
          is current, no wire is traversed and no marker is drawn.
       * ------------------------------------------------------------ */}
      {content.topology !== undefined && layout !== null && (
        <div className="near-transfer-scenario">
          <TopologyView
            layout={layout}
            selectedNodeId={null}
            inspectorId={`${instanceId}-scenario`}
            eventToken={instanceId}
            onSelect={() => undefined}
          />

          {/*
            The same relationships in words. Authored, required by validation,
            and rendered for a learner who cannot see the drawing.

            VISIBLE BY DEFAULT, and hidden from sight only where the diagram
            already names its ports.

            The first version of this repair hid it for EVERY near-transfer
            activity, through the shared class alone. That was a regression the
            Architect refused: Mission 1 was already Founder-approved with this
            sentence visible, its diagram names no port, and nothing about
            Mission 2's redundancy applies to it.

            The condition is a fact about the PICTURE, not about which mission
            is on screen. `diagramNamesItsPorts` above reads `layout.portLabels`
            — presentation state derived from authored data — so no mission id
            appears here and no list has to be maintained.

            The element itself never moves: it stays in the document and in the
            reading order either way, so nothing is taken from assistive
            technology in either case, and no branch reads a user preference.
          */}
          <p
            className={`near-transfer-scenario-text${
              diagramNamesItsPorts ? " is-visually-redundant" : ""
            }`}
          >
            {content.topology.textEquivalent}
          </p>
        </div>
      )}

      {/*
        Absent once the activity is finished, rather than left showing the last
        question's number above the mission's closing steps.
      */}
      {progress !== null && (
        <p className="near-transfer-progress">{progress}</p>
      )}

      {content.questions.map((question) => {
        // One question at a time, and only while it is being ASKED. Once the
        // learner commits, the resolution below replaces it until they move on.
        if (
          phase.kind !== "asking" ||
          phase.questionStableId !== question.questionStableId
        ) {
          return null;
        }

        const multiple = question.type === "multiple_choice";
        const commitId = `${instanceId}-${question.questionStableId}`;

        return (
          <form
            key={question.questionStableId}
            className="near-transfer-question"
            onSubmit={(event) => {
              event.preventDefault();
              setState((current) =>
                commitAnswer(current, question.questionStableId)
              );
            }}
          >
            <fieldset>
              <legend>{question.prompt}</legend>

              {multiple && (
                <p className="near-transfer-hint">
                  {describeMultipleChoiceHint()}
                </p>
              )}

              {question.options.map((option) => {
                const inputId = `${commitId}-${option.optionId}`;

                return (
                  <p key={option.optionId} className="near-transfer-option">
                    <input
                      id={inputId}
                      type={multiple ? "checkbox" : "radio"}
                      name={commitId}
                      value={option.optionId}
                      checked={isSelected(
                        state,
                        question.questionStableId,
                        option.optionId
                      )}
                      onChange={() =>
                        setState((current) =>
                          toggleOption(current, question, option.optionId)
                        )
                      }
                    />{" "}
                    <label htmlFor={inputId}>{option.text}</label>
                  </p>
                );
              })}
            </fieldset>

            {/*
              The application's own primary control treatment, not a browser
              default. Same class the journey's advance control uses, so the
              two read as the same product. Still a native <button>: type,
              disabled state, keyboard operation and focus ring are the
              platform's.
            */}
            <button
              type="submit"
              className="near-transfer-submit"
              disabled={!canCommit(state, question.questionStableId)}
            >
              {describeCommitLabel()}
            </button>
          </form>
        );
      })}

      {/* ------------------------------------------------------------ *
          THE RESOLUTION of the question just answered.

          Only the most recent one: the learner reads the verdict and the
          reason, then moves to the next question. Earlier answers are settled
          and do not need to stay on screen competing with the current one.
       * ------------------------------------------------------------ */}
      {(() => {
        if (phase.kind !== "resolved") return null;

        const answered = phase.questionStableId;
        const resolution = resolveQuestion(content, state, answered);
        if (resolution === null) return null;

        return (
          <div className="near-transfer-result" aria-live="polite">
            <p className="near-transfer-verdict">{resolution.verdict}</p>

            <p>{`You chose: ${resolution.selected.join(", ")}`}</p>

            {resolution.expected.length > 0 && (
              <p>{`The expected answer: ${resolution.expected.join(", ")}`}</p>
            )}

            <p>{resolution.explanation}</p>

            <button
              type="button"
              className="near-transfer-advance"
              onClick={() =>
                setState((current) => acknowledgeAnswer(current, answered))
              }
            >
              {content.questions[content.questions.length - 1]
                ?.questionStableId === answered
                ? "Finish"
                : "Next question"}
            </button>
          </div>
        );
      })()}
    </section>
  );
}

/**
 * Whether a mission's near-transfer activity has been attempted in full.
 *
 * ATTEMPTED, never passed: a wrong answer is instruction, and it must not hold
 * a learner back.
 *
 * It does NOT decide what the learner is shown next, and it does not decide
 * mission-completion eligibility. Both of those wait for the activity to be
 * SETTLED — every question attempted and its feedback read past — through
 * `visibleInstructionSteps` and `requiredNearTransfer`. This says only that
 * the questions have been answered.
 */
export function isNearTransferComplete(
  content: LearnerNearTransferStep,
  state: NearTransferState
): boolean {
  return isComplete(content, state);
}
