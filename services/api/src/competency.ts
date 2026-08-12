import type {
  CompetencyEvidenceType,
  CompetencyState,
  CompetencyStateRecord
} from "@tlp/shared-types";
import {
  AppError,
  decideCompetencyTransition
} from "@tlp/shared-types";
import {
  createServerSupabaseClient,
  createUserScopedSupabaseClient
} from "./supabase";

function isCompetencyState(value: unknown): value is CompetencyState {
  return (
    value === "not_started" ||
    value === "developing" ||
    value === "demonstrated" ||
    value === "needs_review"
  );
}

export async function listStudentCompetencyState(
  accessToken: string
): Promise<CompetencyStateRecord[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("student_competency_state")
    .select(
      "competency_stable_id,curriculum_version,state,demonstrated_at,last_evaluated_at"
    )
    .order("competency_stable_id");

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load competency state",
      retryable: true
    });
  }

  return (data ?? []).map((row) => {
    if (!isCompetencyState(row.state)) {
      throw new AppError({
        code: "INTERNAL_ERROR",
        message: "Invalid competency state returned",
        retryable: false
      });
    }

    return {
      competencyStableId: String(row.competency_stable_id),
      curriculumVersion: Number(row.curriculum_version),
      state: row.state,
      demonstratedAt:
        row.demonstrated_at == null
          ? undefined
          : String(row.demonstrated_at),
      lastEvaluatedAt: String(row.last_evaluated_at)
    };
  });
}

export async function recordAuthoritativeCompetencyEvidence(input: {
  userId: string;
  competencyStableId: string;
  curriculumVersion: number;
  evidenceType: CompetencyEvidenceType;
  evidenceReference: string;
  occurredAt: string;
  accepted: boolean;
  forceNeedsReview?: boolean;
}): Promise<CompetencyStateRecord> {
  if (!input.userId || !input.competencyStableId || !input.evidenceReference) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Competency evidence requires student, competency, and evidence reference",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { data: currentRows, error: currentError } = await supabase
    .from("student_competency_state")
    .select("state")
    .eq("user_id", input.userId)
    .eq("competency_stable_id", input.competencyStableId)
    .limit(1);

  if (currentError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to inspect competency state",
      retryable: true
    });
  }

  const rawCurrent = currentRows?.[0]?.state;
  const current: CompetencyState = isCompetencyState(rawCurrent)
    ? rawCurrent
    : "not_started";

  const { error: evidenceError } = await supabase
    .from("student_competency_evidence_refs")
    .upsert(
      {
        user_id: input.userId,
        competency_stable_id: input.competencyStableId,
        evidence_type: input.evidenceType,
        evidence_reference: input.evidenceReference,
        accepted: input.accepted,
        occurred_at: input.occurredAt
      },
      {
        onConflict:
          "user_id,competency_stable_id,evidence_type,evidence_reference"
      }
    );

  if (evidenceError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to record competency evidence reference",
      retryable: true
    });
  }

  const { count, error: countError } = await supabase
    .from("student_competency_evidence_refs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("competency_stable_id", input.competencyStableId)
    .eq("accepted", true);

  if (countError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to evaluate competency evidence",
      retryable: true
    });
  }

  const decision = decideCompetencyTransition(
    current,
    count ?? 0,
    input.forceNeedsReview ?? false
  );

  const now = new Date().toISOString();

  const { error: stateError } = await supabase
    .from("student_competency_state")
    .upsert(
      {
        user_id: input.userId,
        competency_stable_id: input.competencyStableId,
        curriculum_version: input.curriculumVersion,
        state: decision.to,
        demonstrated_at:
          decision.to === "demonstrated" ? now : null,
        last_evaluated_at: now,
        updated_at: now
      },
      {
        onConflict: "user_id,competency_stable_id"
      }
    );

  if (stateError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to persist competency state",
      retryable: true
    });
  }

  if (decision.changed) {
    const { error: eventError } = await supabase
      .from("student_competency_state_events")
      .insert({
        user_id: input.userId,
        competency_stable_id: input.competencyStableId,
        curriculum_version: input.curriculumVersion,
        previous_state: decision.from,
        new_state: decision.to,
        reason: decision.reason,
        source_reference: input.evidenceReference,
        occurred_at: now
      });

    if (eventError) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Unable to record competency transition history",
        retryable: true
      });
    }
  }

  return {
    competencyStableId: input.competencyStableId,
    curriculumVersion: input.curriculumVersion,
    state: decision.to,
    demonstratedAt:
      decision.to === "demonstrated" ? now : undefined,
    lastEvaluatedAt: now
  };
}
