import { useState } from "react";
import type { AssessmentDefinition, AssessmentScore } from "@tlp/shared-types";
import {
  countAnsweredQuestions,
  describePracticeResult,
  isOptionSelected,
  isPracticeComplete,
  isQuestionCorrect,
  scorePractice,
  togglePracticeOption,
  type PracticeSelection
} from "./roas-practice";

/**
 * ROAS-3 — one authored practice knowledge check.
 *
 * Presentation only. Every question, option and correct answer is read from the
 * ROAS-2 authored `AssessmentDefinition`; nothing is written here.
 *
 * The component reaches no service module and holds no token, so answering can
 * produce no attempt, no evidence and no competency. Its only outcome is text
 * on the learner's own screen, discarded when they navigate away.
 *
 * Accessibility (this repository has no rendered-DOM harness, so the choices
 * are made structurally rather than asserted in a browser test):
 *  - each question is a `fieldset` with the prompt as its `legend`, which is how
 *    a screen reader announces the group
 *  - native radio inputs for single-answer questions and native checkboxes for
 *    multi-answer ones, so arrow-key and space behaviour comes from the platform
 *  - every input has a real `<label>` bound by `htmlFor`
 *  - results are text in a polite live region; correctness is never colour alone
 */
export function PracticeCheckPanel({
  definition
}: {
  definition: AssessmentDefinition;
}) {
  const [selection, setSelection] = useState<PracticeSelection>({});
  const [score, setScore] = useState<AssessmentScore | null>(null);
  const [open, setOpen] = useState(false);

  const answered = countAnsweredQuestions(definition, selection);
  const complete = isPracticeComplete(definition, selection);
  const regionId = `practice-${definition.stableId}-questions`;
  const headingId = `practice-${definition.stableId}-title`;

  return (
    <li className="practice-check">
      <h4 id={headingId}>{definition.title}</h4>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((current) => !current)}
      >
        {open
          ? `Hide ${definition.questions.length} practice questions`
          : `Try ${definition.questions.length} practice questions`}
      </button>

      <div id={regionId} hidden={!open}>
        <form
          aria-labelledby={headingId}
          onSubmit={(event) => {
            event.preventDefault();
            setScore(scorePractice(definition, selection));
          }}
        >
          {definition.questions.map((question) => {
            const multiple = question.type === "multiple_choice";
            const checked = score !== null;
            const correct = isQuestionCorrect(question, selection);

            return (
              <fieldset key={question.stableId} className="practice-question">
                <legend>{question.prompt}</legend>

                {multiple && (
                  <p className="practice-hint">Select every answer that applies.</p>
                )}

                {question.options.map((option) => {
                  const inputId = `${question.stableId}-${option.id}`;

                  return (
                    <p key={option.id} className="practice-option">
                      <input
                        id={inputId}
                        type={multiple ? "checkbox" : "radio"}
                        name={question.stableId}
                        value={option.id}
                        checked={isOptionSelected(
                          selection,
                          question.stableId,
                          option.id
                        )}
                        onChange={() => {
                          setScore(null);
                          setSelection((current) =>
                            togglePracticeOption(current, question, option.id)
                          );
                        }}
                      />{" "}
                      <label htmlFor={inputId}>{option.text}</label>
                    </p>
                  );
                })}

                {checked && (
                  <p className="practice-question-result">
                    {correct
                      ? "Correct."
                      : "Not quite — revisit this one in the mission material above."}
                  </p>
                )}
              </fieldset>
            );
          })}

          <p aria-live="polite">
            {score
              ? describePracticeResult(definition, score)
              : `${answered} of ${definition.questions.length} questions answered.`}
          </p>

          <button type="submit" disabled={!complete}>
            Check my answers
          </button>

          {!complete && (
            <p className="practice-hint">
              Answer every question to check them. There is no time limit and no
              attempt is recorded.
            </p>
          )}

          {score && (
            <button
              type="button"
              onClick={() => {
                setSelection({});
                setScore(null);
              }}
            >
              Clear and try again
            </button>
          )}
        </form>
      </div>
    </li>
  );
}
