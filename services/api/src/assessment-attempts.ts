import {
  AppError,
  scoreAssessment,
  type AssessmentAnswer,
  type AssessmentAttemptDetail,
  type AssessmentAttemptState,
  type AssessmentDefinition,
  type AssessmentQuestionDefinition,
  type AssessmentScore
} from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";
import { processReadinessAssessmentOutcome } from "./readiness";
import { buildAssessmentEvidenceHandoff } from "./assessment-recovery";
import { tryConsumeAssessmentEvidenceHandoff } from "./assessment-evidence";

interface TrustedStudent {
  userId: string;
}

function asAttemptState(value: unknown): AssessmentAttemptState {
  if (
    value === "in_progress" ||
    value === "submitted" ||
    value === "passed" ||
    value === "failed" ||
    value === "interrupted"
  ) {
    return value;
  }

  throw new AppError({
    code: "INTERNAL_ERROR",
    message: "Invalid assessment attempt state returned",
    retryable: false
  });
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

async function loadPublishedAssessmentDefinition(
  stableId: string
): Promise<{
  id: string;
  definition: AssessmentDefinition;
  questionRows: Record<string, unknown>[];
}> {
  const supabase = createServerSupabaseClient();

  const { data: assessmentRows, error: assessmentError } = await supabase
    .from("assessment_definitions")
    .select(
      "id,stable_id,version,title,purpose,passing_percent,max_attempts,publication_state"
    )
    .eq("stable_id", stableId)
    .eq("publication_state", "published")
    .order("version", { ascending: false })
    .limit(1);

  if (assessmentError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load assessment",
      retryable: true
    });
  }

  const row = assessmentRows?.[0];

  if (!row) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Published assessment was not found",
      retryable: false
    });
  }

  const { data: questionRows, error: questionError } = await supabase
    .from("assessment_questions")
    .select(
      "stable_id,version,question_type,prompt,position,points,options,correct_option_ids"
    )
    .eq("assessment_id", row.id)
    .order("position");

  if (questionError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load assessment questions",
      retryable: true
    });
  }

  const { data: mappings, error: mappingError } = await supabase
    .from("assessment_competency_mappings")
    .select("competency_stable_id,competency_version,required")
    .eq("assessment_id", row.id);

  if (mappingError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load assessment competency mappings",
      retryable: true
    });
  }

  const questions: AssessmentQuestionDefinition[] = (questionRows ?? []).map(
    (question) => ({
      stableId: String(question.stable_id),
      version: Number(question.version),
      type: String(question.question_type) as AssessmentQuestionDefinition["type"],
      prompt: String(question.prompt),
      options: Array.isArray(question.options)
        ? question.options.map((option) => ({
            id: String((option as Record<string, unknown>).id),
            text: String((option as Record<string, unknown>).text)
          }))
        : [],
      correctOptionIds: arrayOfStrings(question.correct_option_ids),
      points: Number(question.points)
    })
  );

  const definition: AssessmentDefinition = {
    stableId: String(row.stable_id),
    version: Number(row.version),
    title: String(row.title),
    purpose: String(row.purpose) as AssessmentDefinition["purpose"],
    passingPercent: Number(row.passing_percent),
    maxAttempts:
      row.max_attempts == null ? undefined : Number(row.max_attempts),
    questions,
    competencyMappings: (mappings ?? []).map((mapping) => ({
      competencyStableId: String(mapping.competency_stable_id),
      competencyVersion: Number(mapping.competency_version),
      required: Boolean(mapping.required)
    })),
    published: true
  };

  return {
    id: String(row.id),
    definition,
    questionRows: (questionRows ?? []) as Record<string, unknown>[]
  };
}

async function assertAttemptOwnership(
  student: TrustedStudent,
  attemptId: string
): Promise<Record<string, unknown>> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("assessment_attempts")
    .select(
      "id,user_id,assessment_id,assessment_stable_id,assessment_version,attempt_number,state,passing_percent,earned_points,possible_points,score_percent,started_at,submitted_at"
    )
    .eq("id", attemptId)
    .eq("user_id", student.userId)
    .limit(1);

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load assessment attempt",
      retryable: true
    });
  }

  const row = data?.[0];

  if (!row) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Assessment attempt was not found",
      retryable: false
    });
  }

  return row as Record<string, unknown>;
}

export async function startAssessmentAttempt(
  student: TrustedStudent,
  assessmentStableId: string
): Promise<AssessmentAttemptDetail> {
  const stableId = assessmentStableId.trim();

  if (!stableId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Assessment stable ID is required",
      retryable: false
    });
  }

  const { id: assessmentId, definition } =
    await loadPublishedAssessmentDefinition(stableId);

  const supabase = createServerSupabaseClient();

  const { data: priorAttempts, error: priorError } = await supabase
    .from("assessment_attempts")
    .select("id,attempt_number,state")
    .eq("user_id", student.userId)
    .eq("assessment_id", assessmentId)
    .order("attempt_number", { ascending: false });

  if (priorError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to inspect prior assessment attempts",
      retryable: true
    });
  }

  const active = (priorAttempts ?? []).find(
    (attempt) => attempt.state === "in_progress"
  );

  if (active) {
    return getAssessmentAttempt(student, String(active.id));
  }

  const completedAttemptCount = (priorAttempts ?? []).filter(
    (attempt) =>
      attempt.state === "passed" ||
      attempt.state === "failed" ||
      attempt.state === "submitted"
  ).length;

  if (
    definition.maxAttempts !== undefined &&
    completedAttemptCount >= definition.maxAttempts
  ) {
    throw new AppError({
      code: "CONFLICT",
      message: "Assessment attempt limit has been reached",
      retryable: false
    });
  }

  const nextAttemptNumber =
    Math.max(
      0,
      ...(priorAttempts ?? []).map((attempt) =>
        Number(attempt.attempt_number)
      )
    ) + 1;

  const { data: createdRows, error: createError } = await supabase
    .from("assessment_attempts")
    .insert({
      user_id: student.userId,
      assessment_id: assessmentId,
      assessment_stable_id: definition.stableId,
      assessment_version: definition.version,
      attempt_number: nextAttemptNumber,
      state: "in_progress",
      passing_percent: definition.passingPercent
    })
    .select("id")
    .limit(1);

  if (createError || !createdRows?.[0]) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to start assessment attempt",
      retryable: true
    });
  }

  return getAssessmentAttempt(student, String(createdRows[0].id));
}

export async function getAssessmentAttempt(
  student: TrustedStudent,
  attemptId: string
): Promise<AssessmentAttemptDetail> {
  const attempt = await assertAttemptOwnership(student, attemptId);
  const supabase = createServerSupabaseClient();

  const { data: definitionRows, error: definitionError } = await supabase
    .from("assessment_definitions")
    .select("id,title")
    .eq("id", String(attempt.assessment_id))
    .eq("version", Number(attempt.assessment_version))
    .limit(1);

  if (definitionError || !definitionRows?.[0]) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load frozen assessment definition",
      retryable: true
    });
  }

  const { data: questions, error: questionError } = await supabase
    .from("assessment_questions")
    .select(
      "stable_id,version,question_type,prompt,position,points,options"
    )
    .eq("assessment_id", String(attempt.assessment_id))
    .order("position");

  if (questionError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load attempt questions",
      retryable: true
    });
  }

  const { data: answers, error: answerError } = await supabase
    .from("assessment_attempt_answers")
    .select("question_stable_id,selected_option_ids")
    .eq("attempt_id", attemptId);

  if (answerError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load saved assessment answers",
      retryable: true
    });
  }

  const state = asAttemptState(attempt.state);

  const score: AssessmentScore | undefined =
    attempt.score_percent == null
      ? undefined
      : {
          earnedPoints: Number(attempt.earned_points ?? 0),
          possiblePoints: Number(attempt.possible_points ?? 0),
          percent: Number(attempt.score_percent),
          passed: state === "passed"
        };

  return {
    attemptId: String(attempt.id),
    assessmentStableId: String(attempt.assessment_stable_id),
    assessmentVersion: Number(attempt.assessment_version),
    attemptNumber: Number(attempt.attempt_number),
    state,
    startedAt: String(attempt.started_at),
    submittedAt:
      attempt.submitted_at == null
        ? undefined
        : String(attempt.submitted_at),
    score,
    title: String(definitionRows[0].title),
    passingPercent: Number(attempt.passing_percent),
    questions: (questions ?? []).map((question) => ({
      stableId: String(question.stable_id),
      version: Number(question.version),
      type: String(question.question_type) as AssessmentQuestionDefinition["type"],
      prompt: String(question.prompt),
      options: Array.isArray(question.options)
        ? question.options.map((option) => ({
            id: String((option as Record<string, unknown>).id),
            text: String((option as Record<string, unknown>).text)
          }))
        : [],
      points: Number(question.points),
      position: Number(question.position)
    })),
    answers: (answers ?? []).map((answer) => ({
      questionStableId: String(answer.question_stable_id),
      selectedOptionIds: arrayOfStrings(answer.selected_option_ids)
    }))
  };
}

export async function saveAssessmentAnswer(
  student: TrustedStudent,
  attemptId: string,
  answer: AssessmentAnswer
): Promise<void> {
  const attempt = await assertAttemptOwnership(student, attemptId);

  if (asAttemptState(attempt.state) !== "in_progress") {
    throw new AppError({
      code: "CONFLICT",
      message: "Only an in-progress assessment attempt can be modified",
      retryable: false
    });
  }

  if (!answer.questionStableId.trim()) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Question stable ID is required",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { data: questionRows, error: questionError } = await supabase
    .from("assessment_questions")
    .select("stable_id")
    .eq("assessment_id", String(attempt.assessment_id))
    .eq("stable_id", answer.questionStableId)
    .limit(1);

  if (questionError || !questionRows?.[0]) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Question does not belong to this assessment attempt",
      retryable: false
    });
  }

  const normalizedSelected = [
    ...new Set(answer.selectedOptionIds.map((value) => String(value)))
  ];

  const { error } = await supabase
    .from("assessment_attempt_answers")
    .upsert(
      {
        attempt_id: attemptId,
        question_stable_id: answer.questionStableId,
        selected_option_ids: normalizedSelected,
        saved_at: new Date().toISOString()
      },
      {
        onConflict: "attempt_id,question_stable_id"
      }
    );

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to save assessment answer",
      retryable: true
    });
  }
}

export async function submitAssessmentAttempt(
  student: TrustedStudent,
  attemptId: string
): Promise<AssessmentAttemptDetail> {
  const attempt = await assertAttemptOwnership(student, attemptId);

  if (asAttemptState(attempt.state) !== "in_progress") {
    throw new AppError({
      code: "CONFLICT",
      message: "Assessment attempt has already been submitted or is not active",
      retryable: false
    });
  }

  const { definition } = await loadPublishedAssessmentDefinition(
    String(attempt.assessment_stable_id)
  );

  if (definition.version !== Number(attempt.assessment_version)) {
    throw new AppError({
      code: "CONFLICT",
      message: "Assessment version no longer matches this attempt",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { data: answerRows, error: answerError } = await supabase
    .from("assessment_attempt_answers")
    .select("question_stable_id,selected_option_ids")
    .eq("attempt_id", attemptId);

  if (answerError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load assessment answers for scoring",
      retryable: true
    });
  }

  const answers: AssessmentAnswer[] = (answerRows ?? []).map((answer) => ({
    questionStableId: String(answer.question_stable_id),
    selectedOptionIds: arrayOfStrings(answer.selected_option_ids)
  }));

  const score = scoreAssessment(definition, answers);
  const terminalState: AssessmentAttemptState =
    score.passed ? "passed" : "failed";
  const submittedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("assessment_attempts")
    .update({
      state: terminalState,
      earned_points: score.earnedPoints,
      possible_points: score.possiblePoints,
      score_percent: score.percent,
      submitted_at: submittedAt,
      updated_at: submittedAt
    })
    .eq("id", attemptId)
    .eq("user_id", student.userId)
    .eq("state", "in_progress");

  if (updateError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to persist assessment result",
      retryable: true
    });
  }

  await processReadinessAssessmentOutcome(
    { userId: student.userId },
    attemptId
  );

  await buildAssessmentEvidenceHandoff(
    { userId: student.userId },
    attemptId
  );

  // The authoritative result and its handoff are now persisted and complete.
  // Canonical Evidence ingestion is downstream processing: it holds no scoring
  // authority, and a failure here is audited and made retryable rather than
  // failing the submission, changing the result, or touching the handoff.
  await tryConsumeAssessmentEvidenceHandoff(student.userId, attemptId);

  return getAssessmentAttempt(student, attemptId);
}
