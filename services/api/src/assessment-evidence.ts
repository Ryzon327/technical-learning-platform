import {
  AppError,
  buildAssessmentEvidenceMetadata,
  evaluateAssessmentEvidenceEligibility,
  isAssessmentEvidenceResultState,
  toEvidenceCompetencyRelationship,
  validateAssessmentEvidenceMetadata,
  type AssessmentEvidenceCompetencyMapping,
  type AssessmentEvidenceConsumptionResult,
  type AssessmentEvidenceSourceFacts,
  type AssessmentPurpose,
  type EvidenceRecord
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { createCanonicalEvidence } from "./evidence";
import { linkEvidenceToCompetency } from "./evidence-competency";
import { createServerSupabaseClient } from "./supabase";

/**
 * Wave 7 / Batch 3 — EVID-005 Assessment Evidence.
 *
 * Consumes an already persisted, authoritative assessment evidence handoff into
 * canonical Evidence and approved competency links.
 *
 * Strict ordering: the Assessment Engine's result and its handoff are written
 * first and are authoritative. Evidence ingestion is downstream processing and
 * holds no scoring authority. It never recomputes a score, never changes an
 * attempt state, and never deletes or rewrites a handoff.
 *
 * There is no AI anywhere in this path.
 */

const CONSUMPTION_TABLE = "assessment_evidence_consumptions";

const dependency = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

function asAssessmentPurpose(value: unknown): AssessmentPurpose {
  if (
    value === "practice" ||
    value === "diagnostic" ||
    value === "evidence_producing"
  ) {
    return value;
  }

  throw new AppError({
    code: "INTERNAL_ERROR",
    message: "Unsupported assessment purpose",
    retryable: false
  });
}

/**
 * Records the outcome of a consumption attempt so a failure is durable and the
 * same handoff can be retried later. Never throws: consumption bookkeeping must
 * not become a second failure mode for the student's submission.
 */
async function recordConsumptionState(input: {
  attemptId: string;
  userId: string;
  state: AssessmentEvidenceConsumptionResult["state"];
  evidenceId?: string;
  skipReason?: string;
  failureCode?: string;
}): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();
    const now = new Date().toISOString();

    await supabase.from(CONSUMPTION_TABLE).upsert(
      {
        attempt_id: input.attemptId,
        user_id: input.userId,
        state: input.state,
        evidence_id: input.evidenceId ?? null,
        skip_reason: input.skipReason ?? null,
        last_failure_code: input.failureCode ?? null,
        last_attempted_at: now,
        updated_at: now
      },
      { onConflict: "attempt_id" }
    );
  } catch {
    // Bookkeeping is best effort. The handoff itself remains the durable
    // retry source of truth.
  }
}

/**
 * Loads the authoritative facts for an attempt from the Assessment Engine's own
 * persisted state. Nothing here comes from a browser.
 */
async function loadAssessmentEvidenceFacts(
  attemptId: string
): Promise<AssessmentEvidenceSourceFacts | null> {
  const supabase = createServerSupabaseClient();

  const { data: handoffRows, error: handoffError } = await supabase
    .from("assessment_evidence_handoffs")
    .select(
      "attempt_id,user_id,source_reference,assessment_stable_id,assessment_version," +
        "result_state,score_percent,passing_percent,evidence_eligible,result_digest"
    )
    .eq("attempt_id", attemptId)
    .limit(1);

  if (handoffError) {
    throw dependency("Unable to load assessment evidence handoff");
  }

  const handoffs = (handoffRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const handoff = handoffs[0];
  if (!handoff) {
    return null;
  }

  const { data: attemptRows, error: attemptError } = await supabase
    .from("assessment_attempts")
    .select("id,user_id,assessment_id,assessment_version,state,submitted_at")
    .eq("id", attemptId)
    .limit(1);

  if (attemptError) {
    throw dependency("Unable to load assessment attempt");
  }

  const attempts = (attemptRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const attempt = attempts[0];
  if (!attempt) {
    return null;
  }

  const { data: definitionRows, error: definitionError } = await supabase
    .from("assessment_definitions")
    .select("id,title,purpose")
    .eq("id", String(attempt.assessment_id))
    .eq("version", Number(attempt.assessment_version))
    .limit(1);

  if (definitionError) {
    throw dependency("Unable to load assessment definition");
  }

  const definitions = (definitionRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const definition = definitions[0];
  if (!definition) {
    throw dependency("Unable to determine assessment evidence eligibility");
  }

  const attemptState = String(attempt.state);
  const resultState = isAssessmentEvidenceResultState(attemptState)
    ? attemptState
    : "failed";

  return {
    attemptId,
    userId: String(handoff.user_id),
    assessmentStableId: String(handoff.assessment_stable_id),
    assessmentVersion: Number(handoff.assessment_version),
    assessmentTitle: String(definition.title),
    assessmentPurpose: asAssessmentPurpose(definition.purpose),
    attemptState,
    resultState,
    scorePercent: Number(handoff.score_percent),
    passingPercent: Number(handoff.passing_percent),
    submittedAt: String(attempt.submitted_at ?? ""),
    sourceReference: String(handoff.source_reference),
    resultDigest: String(handoff.result_digest),
    evidenceEligible: handoff.evidence_eligible === true
  };
}

/**
 * Approved competency mappings for an assessment, carrying the exact competency
 * version each mapping was approved against. Versions come from the curriculum
 * mapping table, never from the handoff's stable-id-only array.
 */
async function loadApprovedCompetencyMappings(
  assessmentStableId: string,
  assessmentVersion: number
): Promise<AssessmentEvidenceCompetencyMapping[]> {
  const supabase = createServerSupabaseClient();

  const { data: definitionRows, error: definitionError } = await supabase
    .from("assessment_definitions")
    .select("id")
    .eq("stable_id", assessmentStableId)
    .eq("version", assessmentVersion)
    .limit(1);

  if (definitionError) {
    throw dependency("Unable to load assessment definition");
  }

  const definitions = (definitionRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const definition = definitions[0];
  if (!definition) {
    return [];
  }

  const { data, error } = await supabase
    .from("assessment_competency_mappings")
    .select("competency_stable_id,competency_version,required")
    .eq("assessment_id", String(definition.id));

  if (error) {
    throw dependency("Unable to load assessment competency mappings");
  }

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
    (row) => ({
      competencyStableId: String(row.competency_stable_id),
      competencyVersion: Number(row.competency_version),
      required: row.required === true
    })
  );
}

/**
 * Consumes one persisted assessment evidence handoff.
 *
 * Idempotent through Batch 1's logical source identity
 * `(user_id, source_type, source_reference)` and Batch 2's link identity, so a
 * retry of the same handoff can never duplicate Evidence or links.
 *
 * Both passed and failed evidence-producing attempts produce Evidence and
 * links: a failed authoritative assessment is still a trustworthy observation.
 * Interrupted, in-progress, practice and diagnostic attempts produce nothing.
 */
export async function consumeAssessmentEvidenceHandoff(
  trustedUserId: string,
  attemptId: string
): Promise<AssessmentEvidenceConsumptionResult> {
  if (
    typeof trustedUserId !== "string" ||
    trustedUserId.trim() === "" ||
    typeof attemptId !== "string" ||
    attemptId.trim() === ""
  ) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Student and attempt identifiers are required",
      retryable: false
    });
  }

  const facts = await loadAssessmentEvidenceFacts(attemptId);
  if (!facts) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Assessment evidence handoff was not found",
      retryable: false
    });
  }

  // The persisted handoff owner is authoritative for Evidence ownership.
  if (facts.userId !== trustedUserId) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Assessment attempt does not belong to the requested student",
      retryable: false
    });
  }

  const eligibility = evaluateAssessmentEvidenceEligibility({
    assessmentPurpose: facts.assessmentPurpose,
    attemptState: facts.attemptState,
    evidenceEligible: facts.evidenceEligible
  });

  if (!eligibility.eligible) {
    await recordConsumptionState({
      attemptId,
      userId: facts.userId,
      state: "skipped",
      skipReason: eligibility.reason
    });

    return {
      attemptId,
      state: "skipped",
      linkedCompetencyCount: 0,
      skipReason: eligibility.reason
    };
  }

  const metadata = buildAssessmentEvidenceMetadata(facts);
  const metadataValidation = validateAssessmentEvidenceMetadata(metadata);
  if (!metadataValidation.valid) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Assessment Evidence metadata is not valid",
      retryable: false,
      details: { errors: metadataValidation.errors }
    });
  }

  const evidence: EvidenceRecord = await createCanonicalEvidence({
    userId: facts.userId,
    sourceType: "assessment_attempt",
    sourceReference: facts.sourceReference,
    sourceEngine: "assessment",
    sourceOccurredAt: facts.submittedAt,
    // The Assessment Engine's own result digest is preserved unchanged as the
    // upstream proof. Evidence never recomputes source-engine truth.
    sourceIntegrityDigest: facts.resultDigest,
    metadata
  });

  const mappings = await loadApprovedCompetencyMappings(
    facts.assessmentStableId,
    facts.assessmentVersion
  );

  let linkedCompetencyCount = 0;
  for (const mapping of mappings) {
    await linkEvidenceToCompetency({
      evidenceId: evidence.id,
      userId: facts.userId,
      competencyStableId: mapping.competencyStableId,
      competencyVersion: mapping.competencyVersion,
      relationship: toEvidenceCompetencyRelationship(mapping.required),
      linkSource: "source_engine_mapping"
    });
    linkedCompetencyCount += 1;
  }

  await recordConsumptionState({
    attemptId,
    userId: facts.userId,
    state: "consumed",
    evidenceId: evidence.id
  });

  writeAuditEvent({
    eventType: "assessment.evidence.consumed",
    outcome: "success",
    actorId: facts.userId,
    targetType: "evidence_record",
    targetId: evidence.id,
    metadata: {
      attemptId,
      assessmentStableId: facts.assessmentStableId,
      assessmentVersion: facts.assessmentVersion,
      resultState: facts.resultState,
      linkedCompetencyCount
    }
  });

  return {
    attemptId,
    state: "consumed",
    evidenceId: evidence.id,
    linkedCompetencyCount
  };
}

/**
 * Submission-path wrapper.
 *
 * Evidence ingestion is downstream of assessment scoring authority, so a
 * consumption failure is audited and recorded for retry but never propagates:
 * it must not fail the submission, change the deterministic result, or touch
 * the handoff.
 */
export async function tryConsumeAssessmentEvidenceHandoff(
  trustedUserId: string,
  attemptId: string
): Promise<AssessmentEvidenceConsumptionResult> {
  try {
    return await consumeAssessmentEvidenceHandoff(trustedUserId, attemptId);
  } catch (error) {
    const failureCode =
      error instanceof AppError ? error.code : "INTERNAL_ERROR";

    await recordConsumptionState({
      attemptId,
      userId: trustedUserId,
      state: "failed",
      failureCode
    });

    writeAuditEvent({
      eventType: "assessment.evidence.consumption_failed",
      outcome: "failure",
      actorId: trustedUserId,
      targetType: "assessment_attempt",
      targetId: attemptId,
      metadata: { failureCode }
    });

    return {
      attemptId,
      state: "failed",
      linkedCompetencyCount: 0,
      failureCode
    };
  }
}

/**
 * Operational retry for handoffs whose consumption previously failed. Batch 1
 * and Batch 2 idempotency make a retry safe to run repeatedly.
 */
export async function retryFailedAssessmentEvidenceConsumption(
  limit = 25
): Promise<AssessmentEvidenceConsumptionResult[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(CONSUMPTION_TABLE)
    .select("attempt_id,user_id")
    .eq("state", "failed")
    .order("last_attempted_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw dependency("Unable to load failed assessment evidence consumptions");
  }

  const pending = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const results: AssessmentEvidenceConsumptionResult[] = [];

  for (const row of pending) {
    results.push(
      await tryConsumeAssessmentEvidenceHandoff(
        String(row.user_id),
        String(row.attempt_id)
      )
    );
  }

  return results;
}

/** Student read: the canonical Evidence produced by one of their attempts. */
export async function getAssessmentAttemptEvidenceId(
  trustedUserId: string,
  attemptId: string
): Promise<string | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(CONSUMPTION_TABLE)
    .select("evidence_id,user_id,state")
    .eq("attempt_id", attemptId)
    .eq("user_id", trustedUserId)
    .limit(1);

  if (error) {
    throw dependency("Unable to load assessment evidence consumption state");
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row || row.state !== "consumed" || !row.evidence_id) {
    return null;
  }

  return String(row.evidence_id);
}
