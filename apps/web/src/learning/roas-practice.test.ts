import { describe, expect, it } from "vitest";
import {
  ROAS_KNOWLEDGE_CHECKS,
  type AssessmentDefinition
} from "@tlp/shared-types";
import {
  PracticeAuthorityError,
  assertPracticeOnly,
  countAnsweredQuestions,
  describePracticeAuthority,
  describePracticeResult,
  isOptionSelected,
  isPracticeComplete,
  isQuestionCorrect,
  scorePractice,
  toAssessmentAnswers,
  togglePracticeOption,
  type PracticeSelection
} from "./roas-practice";

const check = ROAS_KNOWLEDGE_CHECKS[0]!;

/** Every option chosen correctly, straight from the authored definition. */
function allCorrect(definition: AssessmentDefinition): PracticeSelection {
  return Object.fromEntries(
    definition.questions.map((question) => [
      question.stableId,
      [...question.correctOptionIds]
    ])
  );
}

describe("ROAS-3 practice stays practice", () => {
  it("accepts the authored checks, which are all practice with no mapping", () => {
    for (const definition of ROAS_KNOWLEDGE_CHECKS) {
      expect(() => assertPracticeOnly(definition)).not.toThrow();
      expect(definition.purpose).toBe("practice");
      expect(definition.competencyMappings).toEqual([]);
    }
  });

  it("refuses to score an evidence-producing assessment", () => {
    const evidenceProducing: AssessmentDefinition = {
      ...check,
      purpose: "evidence_producing",
      competencyMappings: [
        {
          competencyStableId: "net.ip-addressing",
          competencyVersion: 1,
          required: true
        }
      ]
    };

    expect(() => scorePractice(evidenceProducing, allCorrect(check))).toThrow(
      PracticeAuthorityError
    );
  });

  it("refuses a diagnostic assessment too", () => {
    expect(() =>
      scorePractice({ ...check, purpose: "diagnostic" }, allCorrect(check))
    ).toThrow(PracticeAuthorityError);
  });

  it("refuses a practice check that maps to a competency", () => {
    const mapped: AssessmentDefinition = {
      ...check,
      competencyMappings: [
        {
          competencyStableId: "net.vlan-segmentation",
          competencyVersion: 1,
          required: true
        }
      ]
    };

    expect(() => scorePractice(mapped, allCorrect(check))).toThrow(
      PracticeAuthorityError
    );
    expect(() => assertPracticeOnly(mapped)).toThrow(/cannot be scored/i);
  });

  it("produces a score object and nothing that resembles evidence", () => {
    const score = scorePractice(check, allCorrect(check));

    expect(Object.keys(score).sort()).toEqual([
      "earnedPoints",
      "passed",
      "percent",
      "possiblePoints"
    ]);
    expect(score).not.toHaveProperty("competencyStableId");
    expect(score).not.toHaveProperty("evidenceId");
    expect(score).not.toHaveProperty("attemptId");
  });

  it("states plainly that practice is not recorded and not competency", () => {
    const text = describePracticeAuthority();
    expect(text).toMatch(/not recorded/i);
    expect(text).toMatch(/do not count towards any competency/i);
    expect(text).toMatch(/hands-on lab/i);
  });

  it("repeats that nothing is recorded in the result, whatever the outcome", () => {
    for (const selection of [allCorrect(check), {}]) {
      const score = scorePractice(check, selection);
      expect(describePracticeResult(check, score)).toMatch(
        /practice only — nothing is recorded/i
      );
    }
  });
});

describe("ROAS-3 practice scoring reuses the shared contract", () => {
  it("awards full marks for the authored correct answers", () => {
    const score = scorePractice(check, allCorrect(check));
    expect(score.earnedPoints).toBe(score.possiblePoints);
    expect(score.percent).toBe(100);
    expect(score.passed).toBe(true);
  });

  it("awards nothing for an empty selection and does not pass it", () => {
    const score = scorePractice(check, {});
    expect(score.earnedPoints).toBe(0);
    expect(score.passed).toBe(false);
  });

  it("requires every correct option on a multiple-choice question", () => {
    const multi = ROAS_KNOWLEDGE_CHECKS.flatMap((d) => d.questions).find(
      (question) => question.type === "multiple_choice"
    )!;

    expect(
      isQuestionCorrect(multi, {
        [multi.stableId]: [multi.correctOptionIds[0]!]
      })
    ).toBe(false);

    expect(
      isQuestionCorrect(multi, {
        [multi.stableId]: [...multi.correctOptionIds]
      })
    ).toBe(true);
  });

  it("ignores selection order and duplicates", () => {
    const multi = ROAS_KNOWLEDGE_CHECKS.flatMap((d) => d.questions).find(
      (question) => question.type === "multiple_choice"
    )!;

    expect(
      isQuestionCorrect(multi, {
        [multi.stableId]: [
          ...[...multi.correctOptionIds].reverse(),
          multi.correctOptionIds[0]!
        ]
      })
    ).toBe(true);
  });

  it("builds one answer per authored question", () => {
    const answers = toAssessmentAnswers(check, {});
    expect(answers).toHaveLength(check.questions.length);
    expect(answers.map((answer) => answer.questionStableId)).toEqual(
      check.questions.map((question) => question.stableId)
    );
  });
});

describe("ROAS-3 practice selection behaviour", () => {
  const single = check.questions.find(
    (question) => question.type === "single_choice"
  )!;
  const boolean = check.questions.find(
    (question) => question.type === "boolean"
  )!;
  const multi = ROAS_KNOWLEDGE_CHECKS.flatMap((d) => d.questions).find(
    (question) => question.type === "multiple_choice"
  )!;

  it("replaces the answer to a single-choice question", () => {
    let selection: PracticeSelection = {};
    selection = togglePracticeOption(selection, single, "a");
    selection = togglePracticeOption(selection, single, "b");

    expect(selection[single.stableId]).toEqual(["b"]);
  });

  it("replaces the answer to a boolean question", () => {
    let selection: PracticeSelection = {};
    selection = togglePracticeOption(selection, boolean, "true");
    selection = togglePracticeOption(selection, boolean, "false");

    expect(selection[boolean.stableId]).toEqual(["false"]);
  });

  it("accumulates and removes answers on a multiple-choice question", () => {
    let selection: PracticeSelection = {};
    selection = togglePracticeOption(selection, multi, "a");
    selection = togglePracticeOption(selection, multi, "b");
    expect(selection[multi.stableId]).toEqual(["a", "b"]);

    selection = togglePracticeOption(selection, multi, "a");
    expect(selection[multi.stableId]).toEqual(["b"]);
  });

  it("does not mutate the previous selection", () => {
    const original: PracticeSelection = { [single.stableId]: ["a"] };
    togglePracticeOption(original, single, "b");
    expect(original[single.stableId]).toEqual(["a"]);
  });

  it("reports which options are selected", () => {
    const selection = togglePracticeOption({}, single, "c");
    expect(isOptionSelected(selection, single.stableId, "c")).toBe(true);
    expect(isOptionSelected(selection, single.stableId, "a")).toBe(false);
  });

  it("counts answered questions without revealing correctness", () => {
    expect(countAnsweredQuestions(check, {})).toBe(0);
    expect(
      countAnsweredQuestions(check, togglePracticeOption({}, single, "a"))
    ).toBe(1);
  });

  it("is complete only when every question has an answer", () => {
    expect(isPracticeComplete(check, {})).toBe(false);
    expect(isPracticeComplete(check, allCorrect(check))).toBe(true);

    const partial = togglePracticeOption({}, single, "a");
    expect(isPracticeComplete(check, partial)).toBe(false);
  });
});
