import {
  scoreAssessment,
  type AssessmentAnswer,
  type AssessmentDefinition,
  type AssessmentQuestionDefinition,
  type AssessmentScore
} from "@tlp/shared-types";

/**
 * ROAS-3 — practice knowledge checks, and the boundary that keeps them practice.
 *
 * ## What this module is allowed to be
 *
 * ROAS-2 authored three knowledge checks with `purpose: "practice"` and an
 * empty `competencyMappings`. They exist so a learner can test their own
 * understanding before the practical demonstration. They are not assessment of
 * record, they produce no evidence, and they settle no competency — the lab
 * validator owns that and nothing else may.
 *
 * ## How that is enforced rather than promised
 *
 * Two mechanisms, either of which is sufficient:
 *
 * 1. **This module cannot reach the server.** It imports exactly one thing,
 *    `@tlp/shared-types`. There is no `apiRequest`, no `fetch`, no service
 *    module and no token. A practice answer physically cannot become an
 *    attempt, an evidence record or a competency claim, whatever a future
 *    caller does with it. `scripts/verify-roas3.sh` pins the import list.
 *
 * 2. **`scorePractice` refuses anything that is not practice.** An assessment
 *    that is evidence-producing, or that maps to a competency, throws rather
 *    than being scored locally. So this convenient unrecorded path cannot be
 *    quietly reused for an assessment that *should* have gone through the
 *    server's attempt lifecycle.
 *
 * Scoring itself is `scoreAssessment` from the shared contract — the same
 * function the server uses. A second scoring implementation in the browser
 * would be a second answer to "was that right", which is exactly the kind of
 * duplicate truth this package avoids.
 *
 * ## A deliberate, bounded disclosure
 *
 * Because scoring happens locally, the authored `correctOptionIds` are present
 * in the client bundle. For practice that costs nothing: there is no score to
 * protect and no claim to forge, and a learner who reads the answers has only
 * denied themselves the practice. This is acceptable **only** because practice
 * is not evidence, and it is precisely why an evidence-producing assessment
 * must never be scored through this module — which mechanism 2 enforces.
 */

/** Selected option ids per question stable id. */
export type PracticeSelection = Readonly<Record<string, readonly string[]>>;

export class PracticeAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeAuthorityError";
  }
}

/**
 * Reject any assessment that is not authored practice.
 *
 * Both conditions are checked, not just `purpose`: an assessment that mapped to
 * a competency would manufacture a claim even while labelled practice, and
 * `validateAssessmentDefinition` does not forbid that combination.
 */
export function assertPracticeOnly(definition: AssessmentDefinition): void {
  if (definition.purpose !== "practice") {
    throw new PracticeAuthorityError(
      `Only practice assessments may be answered here; "${definition.stableId}" is ${definition.purpose} and must go through the server attempt lifecycle.`
    );
  }

  if (definition.competencyMappings.length > 0) {
    throw new PracticeAuthorityError(
      `Practice check "${definition.stableId}" maps to a competency and cannot be scored outside the deterministic path.`
    );
  }
}

/**
 * Toggle one option for one question.
 *
 * A single-choice or boolean question replaces its selection; a multiple-choice
 * question accumulates and removes. The question's authored `type` decides,
 * so the interaction always matches what the author intended.
 */
export function togglePracticeOption(
  current: PracticeSelection,
  question: AssessmentQuestionDefinition,
  optionId: string
): PracticeSelection {
  const existing = current[question.stableId] ?? [];

  if (question.type === "multiple_choice") {
    const next = existing.includes(optionId)
      ? existing.filter((entry) => entry !== optionId)
      : [...existing, optionId];

    return { ...current, [question.stableId]: next };
  }

  return { ...current, [question.stableId]: [optionId] };
}

/** Whether an option is currently chosen. */
export function isOptionSelected(
  selection: PracticeSelection,
  questionStableId: string,
  optionId: string
): boolean {
  return (selection[questionStableId] ?? []).includes(optionId);
}

/** How many of a check's questions have an answer. Never a score. */
export function countAnsweredQuestions(
  definition: AssessmentDefinition,
  selection: PracticeSelection
): number {
  return definition.questions.filter(
    (question) => (selection[question.stableId] ?? []).length > 0
  ).length;
}

/** Whether every question has been answered, so checking is worth offering. */
export function isPracticeComplete(
  definition: AssessmentDefinition,
  selection: PracticeSelection
): boolean {
  return (
    countAnsweredQuestions(definition, selection) ===
    definition.questions.length
  );
}

export function toAssessmentAnswers(
  definition: AssessmentDefinition,
  selection: PracticeSelection
): AssessmentAnswer[] {
  return definition.questions.map((question) => ({
    questionStableId: question.stableId,
    selectedOptionIds: [...(selection[question.stableId] ?? [])]
  }));
}

/**
 * Score a practice check locally, for the learner's own information.
 *
 * Refuses anything that is not authored practice, then defers to the shared
 * `scoreAssessment`. The returned `passed` flag means "you got enough of this
 * practice right"; it is not a competency, not evidence, and not recorded.
 */
export function scorePractice(
  definition: AssessmentDefinition,
  selection: PracticeSelection
): AssessmentScore {
  assertPracticeOnly(definition);
  return scoreAssessment(definition, toAssessmentAnswers(definition, selection));
}

/** Whether one question was answered correctly, for per-question feedback. */
export function isQuestionCorrect(
  question: AssessmentQuestionDefinition,
  selection: PracticeSelection
): boolean {
  const selected = [...new Set(selection[question.stableId] ?? [])].sort();
  const expected = [...new Set(question.correctOptionIds)].sort();

  return (
    selected.length === expected.length &&
    selected.every((value, index) => value === expected[index])
  );
}

/**
 * What the learner is told after checking their answers.
 *
 * Deliberately free of praise, streaks and pressure: it reports what happened
 * and points at what to re-read. A weak result is framed as information, not
 * failure, because nothing here is on their record.
 */
export function describePracticeResult(
  definition: AssessmentDefinition,
  score: AssessmentScore
): string {
  const scale = `${score.earnedPoints} of ${score.possiblePoints} points across ${definition.questions.length} questions`;

  return score.passed
    ? `You scored ${scale}. That suggests the ideas are landing. This is practice only — nothing is recorded.`
    : `You scored ${scale}. Worth re-reading the missions above before the practical demonstration. This is practice only — nothing is recorded.`;
}

/**
 * The standing statement about what practice is.
 *
 * Held here as one string so the interface cannot drift into implying that
 * practice counts for something.
 */
export function describePracticeAuthority(): string {
  return "These checks are for your own practice. They are not recorded, they do not count towards any competency, and they are not the assessment of record. Practical ability is proved in the hands-on lab.";
}
