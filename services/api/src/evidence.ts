import { createHash } from "node:crypto";
import {
  AppError,
  EVIDENCE_INTEGRITY_ALGORITHM,
  buildEvidenceCanonicalString,
  evaluateExistingEvidenceRecord,
  isEvidenceIntegrityState,
  isEvidenceRecordState,
  isEvidenceSourceEngine,
  isEvidenceSourceType,
  resolveEffectiveEvidenceState,
  toStudentEvidenceRecord,
  validateCreateCanonicalEvidenceInput,
  withEffectiveEvidenceState,
  type CreateCanonicalEvidenceInput,
  type EvidenceCanonicalDigestInput,
  type EvidenceMetadata,
  type EvidenceRecord,
  type StudentEvidenceRecordWithState
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { loadCorrectionEventsByEvidence } from "./evidence-correction";
import {
  createServerSupabaseClient,
  createUserScopedSupabaseClient
} from "./supabase";

/**
 * Wave 7 / Batch 1 — Canonical Evidence Records.
 *
 * Creation is server-authoritative: only trusted server-side callers may create
 * Evidence, and ownership always comes from the trusted caller, never from a
 * browser-supplied identity. Students read their own Evidence through the
 * user-scoped client so RLS remains the enforcement boundary.
 *
 * This module stores proof. It does not advance competencies, does not consume
 * assessment handoffs, does not create Lab Evidence, and contains no AI in the
 * Evidence truth path.
 */

const EVIDENCE_COLUMNS =
  "id,user_id,source_type,source_reference,source_engine,source_occurred_at," +
  "state,integrity_state,integrity_algorithm,evidence_integrity_digest," +
  "source_integrity_digest,metadata,recorded_at";

const dependency = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

/**
 * Deterministic Evidence acceptance digest.
 *
 * Computed over an explicit canonical string, never over JSON object key
 * iteration. It proves which Evidence Record was accepted; it does not replace
 * or recompute the upstream source-engine digest.
 */
export function calculateEvidenceIntegrityDigest(
  input: EvidenceCanonicalDigestInput
): string {
  return createHash("sha256")
    .update(buildEvidenceCanonicalString(input))
    .digest("hex");
}

function asMetadata(value: unknown): EvidenceMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as EvidenceMetadata;
}

export function mapEvidenceRecordRow(row: Record<string, unknown>): EvidenceRecord {
  const sourceType = String(row.source_type);
  const sourceEngine = String(row.source_engine);
  const state = String(row.state);
  const integrityState = String(row.integrity_state);

  if (
    !isEvidenceSourceType(sourceType) ||
    !isEvidenceSourceEngine(sourceEngine) ||
    !isEvidenceRecordState(state) ||
    !isEvidenceIntegrityState(integrityState)
  ) {
    // Fail closed rather than surface an Evidence Record we cannot classify.
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Stored Evidence Record is not canonical",
      retryable: false
    });
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    sourceType,
    sourceReference: String(row.source_reference),
    sourceEngine,
    sourceOccurredAt: String(row.source_occurred_at),
    recordedAt: String(row.recorded_at),
    state,
    integrityState,
    integrityAlgorithm: EVIDENCE_INTEGRITY_ALGORITHM,
    integrityDigest: String(row.evidence_integrity_digest),
    sourceIntegrityDigest: String(row.source_integrity_digest),
    metadata: asMetadata(row.metadata)
  };
}

async function loadExistingEvidence(
  input: CreateCanonicalEvidenceInput
): Promise<EvidenceRecord | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("evidence_records")
    .select(EVIDENCE_COLUMNS)
    .eq("user_id", input.userId)
    .eq("source_type", input.sourceType)
    .eq("source_reference", input.sourceReference)
    .limit(1);

  if (error) {
    throw dependency("Unable to load canonical Evidence Record");
  }

  const row = data?.[0];
  return row
    ? mapEvidenceRecordRow(row as unknown as Record<string, unknown>)
    : null;
}

function integrityConflict(
  input: CreateCanonicalEvidenceInput,
  reason: string
): AppError {
  writeAuditEvent({
    eventType: "evidence.record.integrity_conflict",
    outcome: "failure",
    actorId: input.userId,
    targetType: "evidence_record",
    metadata: {
      sourceType: input.sourceType,
      sourceEngine: input.sourceEngine,
      reason
    }
  });

  return new AppError({
    code: "CONFLICT",
    message:
      "Canonical Evidence already exists for this source event with different provenance",
    retryable: false,
    details: { reason }
  });
}

/**
 * Creates Canonical Evidence for a trusted source event.
 *
 * Idempotent on (userId, sourceType, sourceReference): a repeat of the same
 * trusted event with identical provenance and digests returns the existing
 * record. Any divergence is a non-retryable integrity conflict; an existing
 * Evidence Record is never silently overwritten.
 */
export async function createCanonicalEvidence(
  input: CreateCanonicalEvidenceInput
): Promise<EvidenceRecord> {
  const validation = validateCreateCanonicalEvidenceInput(input);
  if (!validation.valid) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Canonical Evidence input is not valid",
      retryable: false,
      details: { errors: validation.errors }
    });
  }

  const digestInput: EvidenceCanonicalDigestInput = {
    userId: input.userId,
    sourceType: input.sourceType,
    sourceReference: input.sourceReference,
    sourceEngine: input.sourceEngine,
    sourceOccurredAt: input.sourceOccurredAt,
    sourceIntegrityDigest: input.sourceIntegrityDigest
  };
  const integrityDigest = calculateEvidenceIntegrityDigest(digestInput);
  const candidate = { ...digestInput, integrityDigest };

  const existing = await loadExistingEvidence(input);
  if (existing) {
    const decision = evaluateExistingEvidenceRecord(existing, candidate);
    if (decision.kind === "match") {
      return existing;
    }
    throw integrityConflict(input, decision.reason);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("evidence_records")
    .insert({
      user_id: input.userId,
      source_type: input.sourceType,
      source_reference: input.sourceReference,
      source_engine: input.sourceEngine,
      source_occurred_at: input.sourceOccurredAt,
      state: "active",
      integrity_state: "verified",
      integrity_algorithm: EVIDENCE_INTEGRITY_ALGORITHM,
      evidence_integrity_digest: integrityDigest,
      source_integrity_digest: input.sourceIntegrityDigest,
      metadata: input.metadata ?? {}
    })
    .select(EVIDENCE_COLUMNS)
    .single();

  if (error) {
    // A concurrent trusted writer may have won the uniqueness race.
    if (String((error as { code?: string }).code ?? "") === "23505") {
      const raced = await loadExistingEvidence(input);
      if (raced) {
        const decision = evaluateExistingEvidenceRecord(raced, candidate);
        if (decision.kind === "match") {
          return raced;
        }
        throw integrityConflict(input, decision.reason);
      }
    }
    throw dependency("Unable to persist canonical Evidence Record");
  }

  if (!data) {
    throw dependency("Unable to persist canonical Evidence Record");
  }

  const record = mapEvidenceRecordRow(
    data as unknown as Record<string, unknown>
  );

  writeAuditEvent({
    eventType: "evidence.record.created",
    outcome: "success",
    actorId: record.userId,
    targetType: "evidence_record",
    targetId: record.id,
    metadata: {
      sourceType: record.sourceType,
      sourceEngine: record.sourceEngine,
      integrityState: record.integrityState
    }
  });

  return record;
}

/** Student read. Ownership is enforced by RLS through the user-scoped client. */
export async function listStudentEvidence(
  accessToken: string
): Promise<StudentEvidenceRecordWithState[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("evidence_records")
    .select(EVIDENCE_COLUMNS)
    .order("recorded_at", { ascending: false });

  if (error) {
    throw dependency("Unable to load Evidence Records");
  }

  const records = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
    (row) => mapEvidenceRecordRow(row)
  );

  // Effective trust state is derived at read time so Evidence never silently
  // disappears: an invalidated or superseded record is still listed, carrying
  // its current state and the explanation for it.
  const corrections = await loadCorrectionEventsByEvidence(
    records.map((record) => record.id),
    accessToken
  );

  return records.map((record) =>
    withEffectiveEvidenceState(
      toStudentEvidenceRecord(record),
      resolveEffectiveEvidenceState(record, corrections.get(record.id) ?? [])
    )
  );
}

/** Student read of a single Evidence Record. */
export async function getCanonicalEvidenceForStudent(
  accessToken: string,
  evidenceId: string
): Promise<StudentEvidenceRecordWithState> {
  if (typeof evidenceId !== "string" || evidenceId.trim() === "") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Evidence identifier is required",
      retryable: false
    });
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("evidence_records")
    .select(EVIDENCE_COLUMNS)
    .eq("id", evidenceId)
    .maybeSingle();

  if (error) {
    throw dependency("Unable to load Evidence Record");
  }

  if (!data) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Evidence Record was not found",
      retryable: false
    });
  }

  const record = mapEvidenceRecordRow(
    data as unknown as Record<string, unknown>
  );
  const corrections = await loadCorrectionEventsByEvidence(
    [record.id],
    accessToken
  );

  return withEffectiveEvidenceState(
    toStudentEvidenceRecord(record),
    resolveEffectiveEvidenceState(record, corrections.get(record.id) ?? [])
  );
}
