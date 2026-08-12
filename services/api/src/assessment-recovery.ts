import { createHash } from "node:crypto";
import {
  AppError,
  type AssessmentEvidenceHandoff,
  type AssessmentInterruptionReason,
  type AssessmentRecoveryState
} from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";

interface TrustedStudent {
  userId: string;
}

function asReason(value: string): AssessmentInterruptionReason {
  const allowed = [
    "client_disconnect",
    "network_error",
    "server_restart",
    "dependency_unavailable",
    "unknown"
  ] as const;

  if ((allowed as readonly string[]).includes(value)) {
    return value as AssessmentInterruptionReason;
  }

  throw new AppError({
    code: "VALIDATION_ERROR",
    message: "Unsupported assessment interruption reason",
    retryable: false
  });
}

export function calculateAssessmentResultDigest(input: {
  attemptId: string;
  assessmentStableId: string;
  assessmentVersion: number;
  scorePercent: number;
  passingPercent: number;
  resultState: string;
}): string {
  const canonical = [
    input.attemptId,
    input.assessmentStableId,
    String(input.assessmentVersion),
    input.resultState,
    input.scorePercent.toFixed(2),
    input.passingPercent.toFixed(2)
  ].join("|");

  return createHash("sha256").update(canonical).digest("hex");
}

async function loadOwnedAttempt(
  student: TrustedStudent,
  attemptId: string
): Promise<Record<string, unknown>> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("assessment_attempts")
    .select("id,user_id,assessment_id,assessment_stable_id,assessment_version,state,score_percent,passing_percent")
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

export async function interruptAssessmentAttempt(
  student: TrustedStudent,
  attemptId: string,
  reason: string
): Promise<AssessmentRecoveryState> {
  const attempt = await loadOwnedAttempt(student, attemptId);

  if (attempt.state !== "in_progress") {
    throw new AppError({
      code: "CONFLICT",
      message: "Only an in-progress assessment can be interrupted",
      retryable: false
    });
  }

  const interruptionReason = asReason(reason);
  const interruptedAt = new Date().toISOString();
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("assessment_attempts")
    .update({
      state: "interrupted",
      interruption_reason: interruptionReason,
      interrupted_at: interruptedAt,
      updated_at: interruptedAt
    })
    .eq("id", attemptId)
    .eq("user_id", student.userId)
    .eq("state", "in_progress");

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to interrupt assessment attempt",
      retryable: true
    });
  }

  const { count } = await supabase
    .from("assessment_attempt_answers")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", attemptId);

  return {
    attemptId,
    state: "interrupted",
    interruptionReason,
    interruptedAt,
    recoverable: true,
    preservedAnswerCount: count ?? 0
  };
}

export async function resumeInterruptedAssessmentAttempt(
  student: TrustedStudent,
  attemptId: string
): Promise<AssessmentRecoveryState> {
  const attempt = await loadOwnedAttempt(student, attemptId);

  if (attempt.state !== "interrupted") {
    throw new AppError({
      code: "CONFLICT",
      message: "Only an interrupted assessment can be resumed",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("assessment_attempts")
    .update({
      state: "in_progress",
      interruption_reason: null,
      interrupted_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", attemptId)
    .eq("user_id", student.userId)
    .eq("state", "interrupted");

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to resume assessment attempt",
      retryable: true
    });
  }

  const { count } = await supabase
    .from("assessment_attempt_answers")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", attemptId);

  return {
    attemptId,
    state: "in_progress",
    recoverable: true,
    preservedAnswerCount: count ?? 0
  };
}

export async function buildAssessmentEvidenceHandoff(
  student: TrustedStudent,
  attemptId: string
): Promise<AssessmentEvidenceHandoff | null> {
  const attempt = await loadOwnedAttempt(student, attemptId);

  if (attempt.state !== "passed" && attempt.state !== "failed") {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const { data: definitions, error: definitionError } = await supabase
    .from("assessment_definitions")
    .select("purpose")
    .eq("id", String(attempt.assessment_id))
    .eq("version", Number(attempt.assessment_version))
    .limit(1);

  if (definitionError || !definitions?.[0]) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to determine assessment evidence eligibility",
      retryable: true
    });
  }

  const { data: mappings, error: mappingError } = await supabase
    .from("assessment_competency_mappings")
    .select("competency_stable_id")
    .eq("assessment_id", String(attempt.assessment_id));

  if (mappingError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load assessment competency mappings",
      retryable: true
    });
  }

  const competencyStableIds = (mappings ?? []).map((m) =>
    String(m.competency_stable_id)
  );

  const resultState = String(attempt.state) as "passed" | "failed";
  const scorePercent = Number(attempt.score_percent);
  const passingPercent = Number(attempt.passing_percent);
  const sourceReference = `assessment-attempt:${attemptId}`;
  const evidenceEligible = definitions[0].purpose === "evidence_producing";

  const resultDigest = calculateAssessmentResultDigest({
    attemptId,
    assessmentStableId: String(attempt.assessment_stable_id),
    assessmentVersion: Number(attempt.assessment_version),
    scorePercent,
    passingPercent,
    resultState
  });

  const handoff: AssessmentEvidenceHandoff = {
    sourceType: "assessment_attempt",
    sourceReference,
    assessmentStableId: String(attempt.assessment_stable_id),
    assessmentVersion: Number(attempt.assessment_version),
    attemptId,
    resultState,
    scorePercent,
    passingPercent,
    competencyStableIds,
    evidenceEligible
  };

  const { error: handoffError } = await supabase
    .from("assessment_evidence_handoffs")
    .upsert({
      attempt_id: attemptId,
      user_id: student.userId,
      source_type: handoff.sourceType,
      source_reference: handoff.sourceReference,
      assessment_stable_id: handoff.assessmentStableId,
      assessment_version: handoff.assessmentVersion,
      result_state: handoff.resultState,
      score_percent: handoff.scorePercent,
      passing_percent: handoff.passingPercent,
      competency_stable_ids: handoff.competencyStableIds,
      evidence_eligible: handoff.evidenceEligible,
      result_digest: resultDigest
    }, { onConflict: "attempt_id" });

  if (handoffError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to persist assessment evidence handoff",
      retryable: true
    });
  }

  await supabase
    .from("assessment_attempts")
    .update({
      result_digest: resultDigest,
      updated_at: new Date().toISOString()
    })
    .eq("id", attemptId)
    .eq("user_id", student.userId);

  return handoff;
}
