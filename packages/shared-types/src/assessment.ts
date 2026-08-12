export type AssessmentPurpose = "practice" | "diagnostic" | "evidence_producing";
export type AssessmentQuestionType = "single_choice" | "multiple_choice" | "boolean";

export interface AssessmentQuestionOption {
  id: string;
  text: string;
}

export interface AssessmentQuestionDefinition {
  stableId: string;
  version: number;
  type: AssessmentQuestionType;
  prompt: string;
  options: AssessmentQuestionOption[];
  correctOptionIds: string[];
  points: number;
}

export interface AssessmentCompetencyMapping {
  competencyStableId: string;
  competencyVersion: number;
  required: boolean;
}

export interface AssessmentDefinition {
  stableId: string;
  version: number;
  title: string;
  purpose: AssessmentPurpose;
  passingPercent: number;
  maxAttempts?: number;
  questions: AssessmentQuestionDefinition[];
  competencyMappings: AssessmentCompetencyMapping[];
  published: boolean;
}

export interface AssessmentAnswer {
  questionStableId: string;
  selectedOptionIds: string[];
}

export interface AssessmentScore {
  earnedPoints: number;
  possiblePoints: number;
  percent: number;
  passed: boolean;
}

function normalized(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function validateAssessmentDefinition(definition: AssessmentDefinition): string[] {
  const errors: string[] = [];
  if (!definition.stableId.trim()) errors.push("Assessment stable ID is required.");
  if (definition.version < 1) errors.push("Assessment version must be positive.");
  if (!definition.title.trim()) errors.push("Assessment title is required.");
  if (definition.passingPercent < 0 || definition.passingPercent > 100) {
    errors.push("Passing percent must be between 0 and 100.");
  }
  if (definition.questions.length === 0) errors.push("At least one question is required.");
  if (definition.questions.some((question) => question.points <= 0)) {
    errors.push("Every question must award positive points.");
  }
  if (definition.questions.some((question) => question.correctOptionIds.length === 0)) {
    errors.push("Every question must define at least one correct option.");
  }
  if (definition.purpose === "evidence_producing" && definition.competencyMappings.length === 0) {
    errors.push("Evidence-producing assessments require an approved competency mapping.");
  }
  return errors;
}

export function scoreAssessment(
  definition: AssessmentDefinition,
  answers: AssessmentAnswer[]
): AssessmentScore {
  const validationErrors = validateAssessmentDefinition(definition);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid assessment definition: ${validationErrors.join(" ")}`);
  }

  const answerMap = new Map(answers.map((answer) => [answer.questionStableId, normalized(answer.selectedOptionIds)]));
  let earnedPoints = 0;
  const possiblePoints = definition.questions.reduce((sum, question) => sum + question.points, 0);

  for (const question of definition.questions) {
    const selected = answerMap.get(question.stableId) ?? [];
    const expected = normalized(question.correctOptionIds);
    if (selected.length === expected.length && selected.every((value, index) => value === expected[index])) {
      earnedPoints += question.points;
    }
  }

  const percent = possiblePoints === 0 ? 0 : Math.round((earnedPoints / possiblePoints) * 10000) / 100;
  return { earnedPoints, possiblePoints, percent, passed: percent >= definition.passingPercent };
}
