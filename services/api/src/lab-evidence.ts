import { createHash } from "node:crypto";
import {
  AppError,
  buildLabEvidenceMetadata,
  buildLabMappingAuthorityCanonicalString,
  buildLabValidationCanonicalString,
  buildLabValidationSourceReference,
  evaluateLabEvidenceEligibility,
  resolveMappingAuthority,
  toLabEvidenceRelationship,
  validateLabEvidenceMetadata,
  type LabEvidenceCompetencyMapping,
  type LabEvidenceConsumptionResult,
  type LabEvidenceMappingAuthority,
  type LabEvidenceSourceFacts,
  type LabValidationCheckResult,
  type LabValidationRunState,
  type EvidenceRecord
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { createCanonicalEvidence } from "./evidence";
import { linkEvidenceToCompetency } from "./evidence-competency";
import { createServerSupabaseClient } from "./supabase";

/**
 * Wave 7 / Batch 4 — EVID-004 Lab Validation Evidence.
 *
 * Consumes an already persisted, authoritative Lab validation run into
 * canonical Evidence and approved competency links.
 *
 * Strict ordering: the Lab Engine's deterministic validation run and results
 * are written first and are authoritative. Evidence ingestion is downstream
 * processing. It never re-runs a probe, never re-derives a check outcome, never
 * mutates a validation run or result, and never decides mastery.
 *
 * There is no AI anywhere in this path.
 */

const CONSUMPTION_TABLE = "lab_evidence_consumptions";
const HANDOFF_TABLE = "lab_evidence_handoffs";

const dependency = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

function asRunState(value: unknown): LabValidationRunState {
  if (
    value === "passed" ||
    value === "incomplete" ||
    value === "technical_error"
  ) {
    return value;
  }

  throw new AppError({
    code: "INTERNAL_ERROR",
    message: "Unsupported lab validation run state",
    retryable: false
  });
}

function asCheckState(value: unknown): LabValidationCheckResult["state"] {
  if (value === "passed" || value === "failed" || value === "technical_error") {
    return value;
  }

  throw new AppError({
    code: "INTERNAL_ERROR",
    message: "Unsupported lab validation check state",
    retryable: false
  });
}

/**
 * Deterministic upstream integrity proof for a Lab validation run.
 *
 * The Lab Engine does not persist a digest of its own, so Batch 4 derives one
 * from the authoritative persisted run and its results. It is recomputed from
 * immutable rows rather than stored, so a retry produces an identical digest
 * and a tampered run fails closed against the existing Evidence Record.
 */
export function calculateLabMappingAuthorityDigest(
  authority: LabEvidenceMappingAuthority
): string {
  return createHash("sha256")
    .update(buildLabMappingAuthorityCanonicalString(authority))
    .digest("hex");
}

export function calculateLabValidationSourceDigest(
  facts: LabEvidenceSourceFacts
): string {
  return createHash("sha256")
    .update(buildLabValidationCanonicalString(facts))
    .digest("hex");
}

async function recordConsumptionState(input: {
  validationRunId: string;
  userId: string;
  labSessionId?: string;
  state: LabEvidenceConsumptionResult["state"];
  evidenceId?: string;
  skipReason?: string;
  failureCode?: string;
}): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();
    const now = new Date().toISOString();

    await supabase.from(CONSUMPTION_TABLE).upsert(
      {
        validation_run_id: input.validationRunId,
        user_id: input.userId,
        lab_session_id: input.labSessionId ?? null,
        state: input.state,
        evidence_id: input.evidenceId ?? null,
        skip_reason: input.skipReason ?? null,
        last_failure_code: input.failureCode ?? null,
        last_attempted_at: now,
        updated_at: now
      },
      { onConflict: "validation_run_id" }
    );
  } catch {
    // Bookkeeping is best effort. The persisted validation run remains the
    // durable retry source of truth, and Lab validation truth is never at risk.
  }
}

/**
 * Loads the authoritative facts for a validation run from the Lab Engine's own
 * persisted state. Ownership is taken from the run and its session, never from
 * a caller or a browser.
 */
type LabValidationFacts = Omit<LabEvidenceSourceFacts, "mappingAuthorityDigest">;

async function loadLabEvidenceFacts(
  validationRunId: string
): Promise<LabValidationFacts | null> {
  const supabase = createServerSupabaseClient();

  const { data: runRows, error: runError } = await supabase
    .from("lab_validation_runs")
    .select("id,lab_session_id,user_id,profile_stable_id,state,checked_at")
    .eq("id", validationRunId)
    .limit(1);

  if (runError) {
    throw dependency("Unable to load lab validation run");
  }

  const runs = (runRows ?? []) as unknown as Array<Record<string, unknown>>;
  const run = runs[0];
  if (!run) {
    return null;
  }

  const labSessionId = String(run.lab_session_id);

  const { data: sessionRows, error: sessionError } = await supabase
    .from("lab_sessions")
    .select("id,user_id,lab_definition_stable_id,lab_definition_version")
    .eq("id", labSessionId)
    .limit(1);

  if (sessionError) {
    throw dependency("Unable to load lab session");
  }

  const sessions = (sessionRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const session = sessions[0];
  if (!session) {
    return null;
  }

  // The validation run and its session must agree on the owner. A divergence
  // means the trusted chain is broken, so fail closed rather than record proof.
  if (String(session.user_id) !== String(run.user_id)) {
    throw new AppError({
      code: "CONFLICT",
      message: "Lab validation run and lab session ownership diverge",
      retryable: false
    });
  }

  const labDefinitionStableId = String(session.lab_definition_stable_id);
  const labDefinitionVersion = Number(session.lab_definition_version);

  const { data: definitionRows, error: definitionError } = await supabase
    .from("lab_definitions")
    .select("stable_id,version,name,mission_stable_id,competency_stable_ids")
    .eq("stable_id", labDefinitionStableId)
    .eq("version", labDefinitionVersion)
    .limit(1);

  if (definitionError) {
    throw dependency("Unable to load lab definition");
  }

  const definitions = (definitionRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const definition = definitions[0];
  if (!definition) {
    return null;
  }

  const { data: resultRows, error: resultError } = await supabase
    .from("lab_validation_results")
    .select("check_stable_id,title,required,state,passed")
    .eq("validation_run_id", validationRunId);

  if (resultError) {
    throw dependency("Unable to load lab validation results");
  }

  const results: LabValidationCheckResult[] = (
    (resultRows ?? []) as unknown as Array<Record<string, unknown>>
  ).map((row) => ({
    checkStableId: String(row.check_stable_id),
    title: String(row.title),
    required: row.required === true,
    ...(row.passed === null || row.passed === undefined
      ? {}
      : { passed: row.passed === true }),
    state: asCheckState(row.state),
    // Explanations stay in the Lab Engine's own read model; Evidence never
    // carries validator explanation text.
    explanation: ""
  }));

  return {
    validationRunId,
    labSessionId,
    userId: String(run.user_id),
    profileStableId: String(run.profile_stable_id),
    labDefinitionStableId,
    labDefinitionVersion,
    labName: String(definition.name),
    missionStableId: String(definition.mission_stable_id),
    runState: asRunState(run.state),
    checkedAt: String(run.checked_at),
    results
  };
}

function declaredCompetencyStableIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim() !== "") {
      seen.add(entry.trim());
    }
  }
  return [...seen];
}

/**
 * Resolves the approved Lab competency mappings, preserving exact competency
 * versions.
 *
 * The canonical mapping source is the curriculum configuration, not the lab
 * name or any inference:
 *
 *   lab_definitions (exact pinned version)
 *     -> competency_stable_ids   which competencies this lab exercises
 *     -> mission_stable_id
 *   missions (published)
 *     -> mission_competencies    approved mapping, carries `required`
 *   competencies                 exact (stable_id, version) definition row
 *
 * `mission_competencies.competency_id` is a foreign key to one versioned
 * `public.competencies` row, so the exact competency version comes from the
 * approved curriculum mapping itself. A competency the lab declares but the
 * approved mapping does not resolve is skipped and reported: no link is ever
 * created against a guessed version.
 */
async function resolveCurrentMappingAuthority(
  facts: LabValidationFacts
): Promise<LabEvidenceMappingAuthority> {
  const supabase = createServerSupabaseClient();

  const { data: definitionRows, error: definitionError } = await supabase
    .from("lab_definitions")
    .select("competency_stable_ids")
    .eq("stable_id", facts.labDefinitionStableId)
    .eq("version", facts.labDefinitionVersion)
    .limit(1);

  if (definitionError) {
    throw dependency("Unable to load lab definition competencies");
  }

  const definitions = (definitionRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const declared = declaredCompetencyStableIds(
    definitions[0]?.competency_stable_ids
  );

  if (declared.length === 0) {
    return {
      missionStableId: facts.missionStableId,
      missionVersion: null,
      missionId: null,
      mappings: [],
      unresolvedCompetencyStableIds: []
    };
  }

  // The lab's mission is referenced by stable id, so resolve it the way the
  // repository resolves every other published curriculum reference.
  // Resolved once, here, at the moment the validation became authoritative.
  // The result is then frozen in the handoff and never resolved again.
  const { data: missionRows, error: missionError } = await supabase
    .from("missions")
    .select("id,stable_id,version")
    .eq("stable_id", facts.missionStableId)
    .eq("publication_state", "published")
    .order("version", { ascending: false })
    .limit(1);

  if (missionError) {
    throw dependency("Unable to load lab mission");
  }

  const missions = (missionRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const mission = missions[0];
  if (!mission) {
    return {
      missionStableId: facts.missionStableId,
      missionVersion: null,
      missionId: null,
      mappings: [],
      unresolvedCompetencyStableIds: declared
    };
  }

  const missionId = String(mission.id);
  const missionVersion = Number(mission.version);

  const { data: mappingRows, error: mappingError } = await supabase
    .from("mission_competencies")
    .select("competency_id,required")
    .eq("mission_id", missionId);

  if (mappingError) {
    throw dependency("Unable to load approved mission competency mappings");
  }

  const approved = (mappingRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;

  if (approved.length === 0) {
    return {
      missionStableId: facts.missionStableId,
      missionVersion,
      missionId,
      mappings: [],
      unresolvedCompetencyStableIds: declared
    };
  }

  const { data: competencyRows, error: competencyError } = await supabase
    .from("competencies")
    .select("id,stable_id,version,publication_state")
    .in(
      "id",
      approved.map((row) => String(row.competency_id))
    );

  if (competencyError) {
    throw dependency("Unable to load competency definitions");
  }

  const competencyById = new Map<string, Record<string, unknown>>(
    ((competencyRows ?? []) as unknown as Array<Record<string, unknown>>).map(
      (row) => [String(row.id), row] as const
    )
  );

  const mappings: LabEvidenceCompetencyMapping[] = [];
  const resolved = new Set<string>();

  for (const row of approved) {
    const competency = competencyById.get(String(row.competency_id));
    if (!competency) {
      continue;
    }

    const stableId = String(competency.stable_id);
    if (!declared.includes(stableId)) {
      continue;
    }

    // Batch 2 only accepts a published definition; anything else fails closed
    // there, so skip it here rather than raise an avoidable conflict.
    if (competency.publication_state !== "published") {
      continue;
    }

    mappings.push({
      competencyStableId: stableId,
      competencyVersion: Number(competency.version),
      required: row.required === true
    });
    resolved.add(stableId);
  }

  return {
    missionStableId: facts.missionStableId,
    missionVersion,
    missionId,
    mappings,
    unresolvedCompetencyStableIds: declared.filter(
      (stableId) => !resolved.has(stableId)
    )
  };
}


function parseMappingAuthorityRow(
  row: Record<string, unknown>
): LabEvidenceMappingAuthority {
  const rawMappings = Array.isArray(row.competency_mappings)
    ? (row.competency_mappings as Array<Record<string, unknown>>)
    : [];
  const rawUnresolved = Array.isArray(row.unresolved_competency_stable_ids)
    ? (row.unresolved_competency_stable_ids as unknown[])
    : [];

  return {
    missionStableId: String(row.mission_stable_id),
    missionVersion:
      row.mission_version === null || row.mission_version === undefined
        ? null
        : Number(row.mission_version),
    missionId: row.mission_id ? String(row.mission_id) : null,
    mappings: rawMappings.map((mapping) => ({
      competencyStableId: String(mapping.competencyStableId),
      competencyVersion: Number(mapping.competencyVersion),
      required: mapping.required === true
    })),
    unresolvedCompetencyStableIds: rawUnresolved
      .filter((value): value is string => typeof value === "string")
      .map((value) => value)
  };
}

async function loadFrozenMappingAuthority(
  validationRunId: string
): Promise<LabEvidenceMappingAuthority | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(HANDOFF_TABLE)
    .select(
      "validation_run_id,mission_stable_id,mission_version,mission_id," +
        "competency_mappings,unresolved_competency_stable_ids,mapping_digest"
    )
    .eq("validation_run_id", validationRunId)
    .limit(1);

  if (error) {
    throw dependency("Unable to load lab evidence handoff");
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  return row ? parseMappingAuthorityRow(row) : null;
}

/**
 * Freezes the approved competency mapping that is in force for a validation
 * run, and returns the frozen snapshot.
 *
 * Written only after the deterministic validation run and its results are
 * persisted. The insert is `on conflict do nothing`, so the first writer wins
 * and every later retry reads back exactly the same snapshot — even if a newer
 * mission version is published in between. A failure here never changes Lab
 * validation truth; it surfaces as an ingestion failure that can be retried.
 */
export async function captureLabEvidenceHandoff(
  facts: LabValidationFacts
): Promise<{ authority: LabEvidenceMappingAuthority; capturedLate: boolean }> {
  const existing = await loadFrozenMappingAuthority(facts.validationRunId);
  if (existing) {
    return { authority: existing, capturedLate: false };
  }

  const current = await resolveCurrentMappingAuthority(facts);
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from(HANDOFF_TABLE).upsert(
    {
      validation_run_id: facts.validationRunId,
      user_id: facts.userId,
      lab_session_id: facts.labSessionId,
      lab_definition_stable_id: facts.labDefinitionStableId,
      lab_definition_version: facts.labDefinitionVersion,
      mission_stable_id: current.missionStableId,
      mission_version: current.missionVersion,
      mission_id: current.missionId,
      competency_mappings: current.mappings,
      unresolved_competency_stable_ids: current.unresolvedCompetencyStableIds,
      mapping_digest: calculateLabMappingAuthorityDigest(current)
    },
    { onConflict: "validation_run_id", ignoreDuplicates: true }
  );

  if (error) {
    throw dependency("Unable to persist lab evidence handoff");
  }

  // Read back so a concurrent writer's snapshot, not ours, becomes canonical.
  const frozen = await loadFrozenMappingAuthority(facts.validationRunId);
  const resolution = resolveMappingAuthority({
    frozen,
    current
  });

  writeAuditEvent({
    eventType: "lab.evidence.handoff_captured",
    outcome: "success",
    actorId: facts.userId,
    targetType: "lab_validation_run",
    targetId: facts.validationRunId,
    metadata: {
      missionStableId: resolution.authority.missionStableId,
      missionVersion: resolution.authority.missionVersion,
      mappedCompetencyCount: resolution.authority.mappings.length
    }
  });

  return { authority: resolution.authority, capturedLate: frozen === null };
}

/**
 * Consumes one authoritative Lab validation run into canonical Evidence.
 *
 * Idempotent through Batch 1's logical source identity
 * `(user_id, source_type, source_reference)` and Batch 2's link identity, so a
 * retry can never duplicate Evidence or links. A materially divergent digest
 * for the same run fails closed with CONFLICT through the Batch 1 mechanism.
 */
export async function consumeLabValidationEvidence(
  trustedUserId: string,
  validationRunId: string
): Promise<LabEvidenceConsumptionResult> {
  if (
    typeof trustedUserId !== "string" ||
    trustedUserId.trim() === "" ||
    typeof validationRunId !== "string" ||
    validationRunId.trim() === ""
  ) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Student and validation run identifiers are required",
      retryable: false
    });
  }

  const baseFacts = await loadLabEvidenceFacts(validationRunId);
  if (!baseFacts) {
    await recordConsumptionState({
      validationRunId,
      userId: trustedUserId,
      state: "skipped",
      skipReason: "validation_run_not_found"
    });

    return {
      validationRunId,
      state: "skipped",
      linkedCompetencyCount: 0,
      unresolvedCompetencyCount: 0,
      skipReason: "validation_run_not_found"
    };
  }

  // The persisted validation run's owner is authoritative for Evidence
  // ownership. A caller-supplied identity is only ever checked against it.
  if (baseFacts.userId !== trustedUserId) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Lab validation run does not belong to the requested student",
      retryable: false
    });
  }

  const eligibility = evaluateLabEvidenceEligibility(baseFacts.runState);
  if (!eligibility.eligible) {
    await recordConsumptionState({
      validationRunId,
      userId: baseFacts.userId,
      labSessionId: baseFacts.labSessionId,
      state: "skipped",
      skipReason: eligibility.reason
    });

    return {
      validationRunId,
      state: "skipped",
      linkedCompetencyCount: 0,
      unresolvedCompetencyCount: 0,
      skipReason: eligibility.reason
    };
  }

  // Freeze (or read back) the approved competency mapping in force for this
  // run BEFORE any Evidence is created, so the mapping authority is pinned and
  // bound into the source integrity digest.
  const handoff = await captureLabEvidenceHandoff(baseFacts);
  const authority = handoff.authority;

  const facts: LabEvidenceSourceFacts = {
    ...baseFacts,
    mappingAuthorityDigest: calculateLabMappingAuthorityDigest(authority)
  };

  const metadata = buildLabEvidenceMetadata(facts);
  const metadataValidation = validateLabEvidenceMetadata(metadata);
  if (!metadataValidation.valid) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Lab Evidence metadata is not valid",
      retryable: false,
      details: { errors: metadataValidation.errors }
    });
  }

  const evidence: EvidenceRecord = await createCanonicalEvidence({
    userId: facts.userId,
    sourceType: "lab_validation",
    sourceReference: buildLabValidationSourceReference(facts.validationRunId),
    sourceEngine: "lab",
    sourceOccurredAt: facts.checkedAt,
    sourceIntegrityDigest: calculateLabValidationSourceDigest(facts),
    metadata
  });

  const unresolved = authority.unresolvedCompetencyStableIds;

  let linkedCompetencyCount = 0;
  for (const mapping of authority.mappings) {
    await linkEvidenceToCompetency({
      evidenceId: evidence.id,
      userId: facts.userId,
      competencyStableId: mapping.competencyStableId,
      competencyVersion: mapping.competencyVersion,
      relationship: toLabEvidenceRelationship(mapping.required),
      linkSource: "approved_curriculum_mapping",
      metadata: {
        labDefinitionStableId: facts.labDefinitionStableId,
        labDefinitionVersion: facts.labDefinitionVersion,
        missionStableId: authority.missionStableId,
        ...(authority.missionVersion === null
          ? {}
          : { missionVersion: authority.missionVersion })
      }
    });
    linkedCompetencyCount += 1;
  }

  if (unresolved.length > 0) {
    // A declared competency with no approved, version-bearing mapping is never
    // linked against a guessed version. Report it instead.
    writeAuditEvent({
      eventType: "lab.evidence.competency_mapping_unresolved",
      outcome: "failure",
      actorId: facts.userId,
      targetType: "evidence_record",
      targetId: evidence.id,
      metadata: {
        validationRunId: facts.validationRunId,
        labDefinitionStableId: facts.labDefinitionStableId,
        missionStableId: authority.missionStableId,
        unresolvedCompetencyCount: unresolved.length
      }
    });
  }

  await recordConsumptionState({
    validationRunId,
    userId: facts.userId,
    labSessionId: facts.labSessionId,
    state: "consumed",
    evidenceId: evidence.id
  });

  writeAuditEvent({
    eventType: "lab.evidence.consumed",
    outcome: "success",
    actorId: facts.userId,
    targetType: "evidence_record",
    targetId: evidence.id,
    metadata: {
      validationRunId: facts.validationRunId,
      labSessionId: facts.labSessionId,
      resultState: facts.runState,
      missionVersion: authority.missionVersion,
      linkedCompetencyCount
    }
  });

  return {
    validationRunId,
    state: "consumed",
    evidenceId: evidence.id,
    linkedCompetencyCount,
    unresolvedCompetencyCount: unresolved.length,
    missionVersion: authority.missionVersion,
    mappingCapturedLate: handoff.capturedLate
  };
}

/**
 * Validation-path wrapper.
 *
 * Evidence ingestion is downstream of Lab validation authority, so a failure is
 * audited and recorded for retry but never propagates: it must not fail the
 * validation call, must not change the deterministic run state, and must not
 * touch the persisted run or results.
 */
export async function tryConsumeLabValidationEvidence(
  trustedUserId: string,
  validationRunId: string
): Promise<LabEvidenceConsumptionResult> {
  try {
    return await consumeLabValidationEvidence(trustedUserId, validationRunId);
  } catch (error) {
    const failureCode =
      error instanceof AppError ? error.code : "INTERNAL_ERROR";

    await recordConsumptionState({
      validationRunId,
      userId: trustedUserId,
      state: "failed",
      failureCode
    });

    writeAuditEvent({
      eventType: "lab.evidence.consumption_failed",
      outcome: "failure",
      actorId: trustedUserId,
      targetType: "lab_validation_run",
      targetId: validationRunId,
      metadata: { failureCode }
    });

    return {
      validationRunId,
      state: "failed",
      linkedCompetencyCount: 0,
      unresolvedCompetencyCount: 0,
      failureCode
    };
  }
}

/**
 * Operational retry for runs whose ingestion previously failed. Batch 1 and
 * Batch 2 idempotency make a retry safe to run repeatedly.
 */
export async function retryFailedLabEvidenceConsumption(
  limit = 25
): Promise<LabEvidenceConsumptionResult[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(CONSUMPTION_TABLE)
    .select("validation_run_id,user_id")
    .eq("state", "failed")
    .order("last_attempted_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw dependency("Unable to load failed lab evidence consumptions");
  }

  const pending = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const results: LabEvidenceConsumptionResult[] = [];

  for (const row of pending) {
    results.push(
      await tryConsumeLabValidationEvidence(
        String(row.user_id),
        String(row.validation_run_id)
      )
    );
  }

  return results;
}

/** Student read: canonical Evidence produced by one of their lab sessions. */
export async function listLabSessionEvidenceIds(
  trustedUserId: string,
  labSessionId: string
): Promise<string[]> {
  if (
    typeof trustedUserId !== "string" ||
    trustedUserId.trim() === "" ||
    typeof labSessionId !== "string" ||
    labSessionId.trim() === ""
  ) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Student and lab session identifiers are required",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(CONSUMPTION_TABLE)
    .select("evidence_id,state,last_attempted_at")
    .eq("lab_session_id", labSessionId)
    .eq("user_id", trustedUserId)
    .eq("state", "consumed")
    .order("last_attempted_at", { ascending: false });

  if (error) {
    throw dependency("Unable to load lab evidence consumption state");
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const evidenceIds: string[] = [];

  for (const row of rows) {
    if (row.evidence_id) {
      evidenceIds.push(String(row.evidence_id));
    }
  }

  return evidenceIds;
}
