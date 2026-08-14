import {
  AppError,
  EVIDENCE_CORRECTION_AUTHORITY,
  evaluateCorrectionTransition,
  isEvidenceCorrectionAction,
  resolveEffectiveEvidenceState,
  toStudentCorrectionEntry,
  validateCreateEvidenceCorrectionInput,
  type CreateEvidenceCorrectionInput,
  type EffectiveEvidenceState,
  type EvidenceCorrectionEvent,
  type EvidenceMetadata,
  type EvidenceRecord,
  type EvidenceRecordState,
  type IdentityContext,
  type PlatformRole,
  type StudentEvidenceCorrectionHistory
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { mapEvidenceRecordRow } from "./evidence";
import {
  createServerSupabaseClient,
  createUserScopedSupabaseClient
} from "./supabase";

/**
 * Wave 7 / Batch 5 — EVID-006 Evidence Review and Correction History.
 *
 * Corrections are privileged and server-authoritative. They append to an
 * immutable history and never rewrite the original Evidence Record: provenance,
 * both integrity digests, ownership and accepted metadata are untouched.
 *
 * Effective trust state is derived from the original record plus its ordered
 * history, so downstream consumers always evaluate the current answer rather
 * than a cached one.
 *
 * There is no AI anywhere in this path.
 */

const CORRECTION_TABLE = "evidence_correction_events";

const CORRECTION_COLUMNS =
  "id,evidence_id,user_id,sequence_number,action,reason,actor_id,actor_role," +
  "previous_effective_state,new_effective_state,superseding_evidence_id," +
  "idempotency_key,metadata,occurred_at";

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

function asEvidenceState(value: unknown): EvidenceRecordState {
  if (value === "active" || value === "invalidated" || value === "superseded") {
    return value;
  }
  throw new AppError({
    code: "INTERNAL_ERROR",
    message: "Stored Evidence correction state is not canonical",
    retryable: false
  });
}

function asMetadata(value: unknown): EvidenceMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as EvidenceMetadata;
}

export function mapEvidenceCorrectionRow(
  row: Record<string, unknown>
): EvidenceCorrectionEvent {
  const action = String(row.action);
  if (!isEvidenceCorrectionAction(action)) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Stored Evidence correction action is not canonical",
      retryable: false
    });
  }

  return {
    id: String(row.id),
    evidenceId: String(row.evidence_id),
    userId: String(row.user_id),
    sequenceNumber: Number(row.sequence_number),
    action,
    reason: String(row.reason),
    actorId: String(row.actor_id),
    actorRole: String(row.actor_role) as PlatformRole,
    previousEffectiveState: asEvidenceState(row.previous_effective_state),
    newEffectiveState: asEvidenceState(row.new_effective_state),
    ...(row.superseding_evidence_id
      ? { supersedingEvidenceId: String(row.superseding_evidence_id) }
      : {}),
    occurredAt: String(row.occurred_at),
    metadata: asMetadata(row.metadata)
  };
}

/**
 * Loads correction events for a set of Evidence Records in one query, so
 * effective state can be derived at read time without an N+1 pattern.
 */
export async function loadCorrectionEventsByEvidence(
  evidenceIds: readonly string[],
  accessToken?: string
): Promise<Map<string, EvidenceCorrectionEvent[]>> {
  const byEvidence = new Map<string, EvidenceCorrectionEvent[]>();
  if (evidenceIds.length === 0) {
    return byEvidence;
  }

  const supabase = accessToken
    ? createUserScopedSupabaseClient(accessToken)
    : createServerSupabaseClient();

  const { data, error } = await supabase
    .from(CORRECTION_TABLE)
    .select(CORRECTION_COLUMNS)
    .in("evidence_id", [...evidenceIds])
    .order("sequence_number", { ascending: true });

  if (error) {
    throw dependency("Unable to load Evidence correction history");
  }

  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const event = mapEvidenceCorrectionRow(row);
    const existing = byEvidence.get(event.evidenceId);
    if (existing) {
      existing.push(event);
    } else {
      byEvidence.set(event.evidenceId, [event]);
    }
  }

  return byEvidence;
}

/** The deterministic current answer for one Evidence Record. */
export async function resolveEvidenceEffectiveState(
  evidenceId: string,
  accessToken?: string
): Promise<EffectiveEvidenceState> {
  const supabase = accessToken
    ? createUserScopedSupabaseClient(accessToken)
    : createServerSupabaseClient();

  const { data, error } = await supabase
    .from("evidence_records")
    .select(EVIDENCE_COLUMNS)
    .eq("id", evidenceId)
    .limit(1);

  if (error) {
    throw dependency("Unable to load canonical Evidence Record");
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Evidence Record was not found",
      retryable: false
    });
  }

  const record = mapEvidenceRecordRow(row);
  const events = await loadCorrectionEventsByEvidence([evidenceId], accessToken);
  return resolveEffectiveEvidenceState(record, events.get(evidenceId) ?? []);
}

function requireCorrectionAuthority(actor: IdentityContext): void {
  if (!actor || actor.role !== EVIDENCE_CORRECTION_AUTHORITY) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Evidence correction requires founder_admin authority",
      retryable: false
    });
  }
}

async function loadEvidenceRecord(evidenceId: string): Promise<EvidenceRecord> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("evidence_records")
    .select(EVIDENCE_COLUMNS)
    .eq("id", evidenceId)
    .limit(1);

  if (error) {
    throw dependency("Unable to load canonical Evidence Record");
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Evidence Record was not found",
      retryable: false
    });
  }

  return mapEvidenceRecordRow(row);
}

async function findByIdempotencyKey(
  evidenceId: string,
  idempotencyKey: string
): Promise<EvidenceCorrectionEvent | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(CORRECTION_TABLE)
    .select(CORRECTION_COLUMNS)
    .eq("evidence_id", evidenceId)
    .eq("idempotency_key", idempotencyKey)
    .limit(1);

  if (error) {
    throw dependency("Unable to load Evidence correction history");
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  return row ? mapEvidenceCorrectionRow(row) : null;
}

/**
 * Appends one privileged correction event.
 *
 * Concurrency: the next sequence number is derived from the replayed history and
 * written under `unique (evidence_id, sequence_number)`. Two administrators
 * acting on the same predecessor therefore cannot both succeed — one wins and
 * the other fails closed with CONFLICT and must retry against fresh state.
 *
 * Idempotency: a stable caller-supplied key collapses a retry onto the existing
 * event. Two legitimately distinct corrections that merely share an action and
 * reason are never collapsed, because collapsing requires the same key.
 */
export async function appendEvidenceCorrection(
  actor: IdentityContext,
  input: CreateEvidenceCorrectionInput
): Promise<EvidenceCorrectionEvent> {
  requireCorrectionAuthority(actor);

  const validation = validateCreateEvidenceCorrectionInput(input);
  if (!validation.valid) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Evidence correction input is not valid",
      retryable: false,
      details: { errors: validation.errors }
    });
  }

  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(
      input.evidenceId,
      input.idempotencyKey
    );
    if (existing) {
      return existing;
    }
  }

  const record = await loadEvidenceRecord(input.evidenceId);
  const events = await loadCorrectionEventsByEvidence([input.evidenceId]);
  const history = events.get(input.evidenceId) ?? [];
  const effective = resolveEffectiveEvidenceState(record, history);

  if (!effective.sequenceValid) {
    throw new AppError({
      code: "CONFLICT",
      message: "Evidence correction history could not be replayed coherently",
      retryable: false,
      details: { reason: effective.sequenceError }
    });
  }

  // Guard against acting on a stale view of the effective state.
  if (effective.state !== input.expectedPreviousState) {
    throw new AppError({
      code: "CONFLICT",
      message: "Evidence effective state changed since it was read",
      retryable: true,
      details: {
        expected: input.expectedPreviousState,
        current: effective.state
      }
    });
  }

  const decision = evaluateCorrectionTransition({
    currentState: effective.state,
    currentUnderReview: effective.underReview,
    action: input.action,
    hasSupersedingEvidence: typeof input.supersedingEvidenceId === "string"
  });

  if (!decision.allowed) {
    throw new AppError({
      code: "CONFLICT",
      message: "Evidence correction transition is not permitted",
      retryable: false,
      details: { reason: decision.reason }
    });
  }

  if (input.supersedingEvidenceId) {
    const replacement = await loadEvidenceRecord(input.supersedingEvidenceId);
    if (replacement.userId !== record.userId) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Superseding Evidence must belong to the same student",
        retryable: false
      });
    }
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(CORRECTION_TABLE)
    .insert({
      evidence_id: record.id,
      // Ownership is taken from the Evidence Record, never from the caller.
      user_id: record.userId,
      sequence_number: history.length + 1,
      action: input.action,
      reason: input.reason.trim(),
      actor_id: actor.userId,
      actor_role: actor.role,
      previous_effective_state: effective.state,
      new_effective_state: decision.nextState,
      superseding_evidence_id: input.supersedingEvidenceId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      metadata: input.metadata ?? {}
    })
    .select(CORRECTION_COLUMNS)
    .single();

  if (error) {
    if (String((error as { code?: string }).code ?? "") === "23505") {
      if (input.idempotencyKey) {
        const raced = await findByIdempotencyKey(
          input.evidenceId,
          input.idempotencyKey
        );
        if (raced) {
          return raced;
        }
      }
      throw new AppError({
        code: "CONFLICT",
        message:
          "A concurrent Evidence correction was recorded first. Retry against the current effective state.",
        retryable: true
      });
    }
    throw dependency("Unable to persist Evidence correction event");
  }

  if (!data) {
    throw dependency("Unable to persist Evidence correction event");
  }

  const event = mapEvidenceCorrectionRow(data as unknown as Record<string, unknown>);

  writeAuditEvent({
    eventType: `evidence.review.${event.action}`,
    outcome: "success",
    actorId: actor.userId,
    targetType: "evidence_record",
    targetId: event.evidenceId,
    metadata: {
      correctionEventId: event.id,
      sequenceNumber: event.sequenceNumber,
      previousEffectiveState: event.previousEffectiveState,
      newEffectiveState: event.newEffectiveState,
      ...(event.supersedingEvidenceId
        ? { supersedingEvidenceId: event.supersedingEvidenceId }
        : {})
    }
  });

  return event;
}

export async function placeEvidenceUnderReview(
  actor: IdentityContext,
  input: Omit<CreateEvidenceCorrectionInput, "action" | "supersedingEvidenceId">
): Promise<EvidenceCorrectionEvent> {
  return appendEvidenceCorrection(actor, {
    ...input,
    action: "place_under_review"
  });
}

export async function invalidateEvidence(
  actor: IdentityContext,
  input: Omit<CreateEvidenceCorrectionInput, "action" | "supersedingEvidenceId">
): Promise<EvidenceCorrectionEvent> {
  return appendEvidenceCorrection(actor, { ...input, action: "invalidate" });
}

export async function supersedeEvidence(
  actor: IdentityContext,
  input: Omit<CreateEvidenceCorrectionInput, "action"> & {
    supersedingEvidenceId: string;
  }
): Promise<EvidenceCorrectionEvent> {
  return appendEvidenceCorrection(actor, { ...input, action: "supersede" });
}

export async function restoreEvidence(
  actor: IdentityContext,
  input: Omit<CreateEvidenceCorrectionInput, "action" | "supersedingEvidenceId">
): Promise<EvidenceCorrectionEvent> {
  return appendEvidenceCorrection(actor, { ...input, action: "restore" });
}

/** Privileged read of the full correction history. */
export async function getEvidenceCorrectionHistory(
  actor: IdentityContext,
  evidenceId: string
): Promise<EvidenceCorrectionEvent[]> {
  requireCorrectionAuthority(actor);
  const events = await loadCorrectionEventsByEvidence([evidenceId]);
  return events.get(evidenceId) ?? [];
}

/**
 * Student read of their own correction history.
 *
 * RLS scopes the rows to the owner, and the projection drops the actor, the
 * internal metadata and every authorization detail, leaving the plain-language
 * reason and the resulting effective state.
 */
export async function getStudentEvidenceCorrectionHistory(
  accessToken: string,
  evidenceId: string
): Promise<StudentEvidenceCorrectionHistory> {
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

  const record = mapEvidenceRecordRow(data as unknown as Record<string, unknown>);
  const events = await loadCorrectionEventsByEvidence([evidenceId], accessToken);
  const history = events.get(evidenceId) ?? [];
  const effective = resolveEffectiveEvidenceState(record, history);

  return {
    evidenceId,
    effectiveState: effective.state,
    underReview: effective.underReview,
    entries: history.map((event) => toStudentCorrectionEntry(event))
  };
}
