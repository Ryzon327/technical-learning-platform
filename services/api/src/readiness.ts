import {
  AppError,
  readinessExplanation,
  type ReadinessOutcome
} from "@tlp/shared-types";
import { recordAuthoritativeCompetencyEvidence } from "./competency";
import { createServerSupabaseClient } from "./supabase";

interface TrustedStudent { userId: string; }

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export async function processReadinessAssessmentOutcome(
  student: TrustedStudent,
  attemptId: string
): Promise<ReadinessOutcome | null> {
  const supabase = createServerSupabaseClient();

  const { data: attemptRows, error: attemptError } = await supabase
    .from("assessment_attempts")
    .select("id,user_id,assessment_id,assessment_stable_id,assessment_version,state,score_percent,passing_percent,submitted_at")
    .eq("id", attemptId)
    .eq("user_id", student.userId)
    .limit(1);

  if (attemptError) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to load readiness assessment result", retryable: true });
  const attempt = attemptRows?.[0];
  if (!attempt) throw new AppError({ code: "NOT_FOUND", message: "Assessment attempt was not found", retryable: false });
  if (attempt.state !== "passed" && attempt.state !== "failed") return null;

  const { data: definitionRows, error: definitionError } = await supabase
    .from("assessment_definitions")
    .select("purpose,test_out_enabled")
    .eq("id", attempt.assessment_id)
    .eq("version", attempt.assessment_version)
    .limit(1);

  if (definitionError) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to load test-out configuration", retryable: true });
  const definition = definitionRows?.[0];
  if (!definition?.test_out_enabled) return null;
  if (definition.purpose !== "evidence_producing") {
    throw new AppError({ code: "INTERNAL_ERROR", message: "Test-out assessment is not configured as evidence-producing", retryable: false });
  }

  const { data: existingRows } = await supabase
    .from("assessment_readiness_outcomes")
    .select("attempt_id,assessment_stable_id,assessment_version,outcome,score_percent,passing_percent,competency_stable_ids,prerequisite_satisfaction_created,source_reference,explanation,created_at")
    .eq("attempt_id", attemptId)
    .eq("user_id", student.userId)
    .limit(1);

  const existing = existingRows?.[0];
  if (existing) {
    return {
      attemptId: String(existing.attempt_id),
      assessmentStableId: String(existing.assessment_stable_id),
      assessmentVersion: Number(existing.assessment_version),
      outcome: String(existing.outcome) as ReadinessOutcome["outcome"],
      scorePercent: Number(existing.score_percent),
      passingPercent: Number(existing.passing_percent),
      competencyStableIds: strings(existing.competency_stable_ids),
      prerequisiteSatisfactionCreated: Boolean(existing.prerequisite_satisfaction_created),
      sourceReference: String(existing.source_reference),
      explanation: String(existing.explanation),
      createdAt: String(existing.created_at)
    };
  }

  const { data: mappings, error: mappingError } = await supabase
    .from("assessment_competency_mappings")
    .select("competency_stable_id,competency_version,required")
    .eq("assessment_id", attempt.assessment_id)
    .eq("required", true);

  if (mappingError) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to load test-out competency mappings", retryable: true });

  const competencyMappings = mappings ?? [];
  const competencyStableIds = competencyMappings.map((m) => String(m.competency_stable_id));
  const passed = attempt.state === "passed";
  const sourceReference = `assessment-attempt:${attemptId}`;
  const occurredAt = String(attempt.submitted_at ?? new Date().toISOString());
  let prerequisiteSatisfactionCreated = false;

  if (passed) {
    for (const mapping of competencyMappings) {
      const competencyStableId = String(mapping.competency_stable_id);

      await recordAuthoritativeCompetencyEvidence({
        userId: student.userId,
        competencyStableId,
        curriculumVersion: Number(mapping.competency_version),
        evidenceType: "assessment",
        evidenceReference: sourceReference,
        occurredAt,
        accepted: true
      });

      const { error } = await supabase
        .from("learning_requirement_satisfactions")
        .upsert({
          user_id: student.userId,
          requirement_type: "competency",
          requirement_stable_id: competencyStableId,
          source_reference: sourceReference,
          satisfied_at: occurredAt
        }, { onConflict: "user_id,requirement_type,requirement_stable_id" });

      if (error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to persist competency prerequisite satisfaction", retryable: true });
    }

    const { error: readinessError } = await supabase
      .from("learning_requirement_satisfactions")
      .upsert({
        user_id: student.userId,
        requirement_type: "readiness_assessment",
        requirement_stable_id: String(attempt.assessment_stable_id),
        source_reference: sourceReference,
        satisfied_at: occurredAt
      }, { onConflict: "user_id,requirement_type,requirement_stable_id" });

    if (readinessError) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to persist readiness prerequisite satisfaction", retryable: true });
    prerequisiteSatisfactionCreated = true;

    for (const competencyStableId of competencyStableIds) {
      await supabase.from("student_review_state").upsert({
        user_id: student.userId,
        competency_stable_id: competencyStableId,
        needs_review: false,
        reason: null,
        last_evaluated_at: occurredAt,
        updated_at: occurredAt
      }, { onConflict: "user_id,competency_stable_id" });
    }
  } else {
    for (const competencyStableId of competencyStableIds) {
      const { error } = await supabase.from("student_review_state").upsert({
        user_id: student.userId,
        competency_stable_id: competencyStableId,
        needs_review: true,
        reason: "Readiness threshold was not met. Review is recommended before another approved attempt.",
        last_evaluated_at: occurredAt,
        updated_at: occurredAt
      }, { onConflict: "user_id,competency_stable_id" });

      if (error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to persist readiness review recommendation", retryable: true });
    }
  }

  const explanation = readinessExplanation({ passed, competencyCount: competencyStableIds.length });
  const outcome: ReadinessOutcome["outcome"] = passed ? "demonstrated" : "review_recommended";
  const createdAt = new Date().toISOString();

  const { error: outcomeError } = await supabase.from("assessment_readiness_outcomes").insert({
    attempt_id: attemptId,
    user_id: student.userId,
    assessment_stable_id: attempt.assessment_stable_id,
    assessment_version: attempt.assessment_version,
    outcome,
    score_percent: attempt.score_percent,
    passing_percent: attempt.passing_percent,
    competency_stable_ids: competencyStableIds,
    prerequisite_satisfaction_created: prerequisiteSatisfactionCreated,
    source_reference: sourceReference,
    explanation,
    created_at: createdAt
  });

  if (outcomeError) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to persist readiness outcome", retryable: true });

  await supabase.from("student_learning_history").insert({
    user_id: student.userId,
    event_type: passed ? "competency" : "review",
    stable_id: String(attempt.assessment_stable_id),
    summary: explanation,
    source_reference: sourceReference,
    occurred_at: occurredAt
  });

  return {
    attemptId,
    assessmentStableId: String(attempt.assessment_stable_id),
    assessmentVersion: Number(attempt.assessment_version),
    outcome,
    scorePercent: Number(attempt.score_percent),
    passingPercent: Number(attempt.passing_percent),
    competencyStableIds,
    prerequisiteSatisfactionCreated,
    sourceReference,
    explanation,
    createdAt
  };
}

export async function getReadinessAssessmentOutcome(
  student: TrustedStudent,
  attemptId: string
): Promise<ReadinessOutcome> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("assessment_readiness_outcomes")
    .select("attempt_id,assessment_stable_id,assessment_version,outcome,score_percent,passing_percent,competency_stable_ids,prerequisite_satisfaction_created,source_reference,explanation,created_at")
    .eq("attempt_id", attemptId)
    .eq("user_id", student.userId)
    .limit(1);

  if (error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to load readiness outcome", retryable: true });
  const row = data?.[0];
  if (!row) throw new AppError({ code: "NOT_FOUND", message: "Readiness outcome was not found for this attempt", retryable: false });

  return {
    attemptId: String(row.attempt_id),
    assessmentStableId: String(row.assessment_stable_id),
    assessmentVersion: Number(row.assessment_version),
    outcome: String(row.outcome) as ReadinessOutcome["outcome"],
    scorePercent: Number(row.score_percent),
    passingPercent: Number(row.passing_percent),
    competencyStableIds: strings(row.competency_stable_ids),
    prerequisiteSatisfactionCreated: Boolean(row.prerequisite_satisfaction_created),
    sourceReference: String(row.source_reference),
    explanation: String(row.explanation),
    createdAt: String(row.created_at)
  };
}
