import {
  AppError,
  deriveEvidenceOutcome,
  evaluateEvidenceLinkEligibility,
  evaluateExistingEvidenceCompetencyLink,
  isEvidenceCompetencyLinkSource,
  isEvidenceCompetencyRelationship,
  isEffectivelyTrustedEvidence,
  qualifiesAsDemonstrationEvidence,
  resolveEffectiveEvidenceState,
  toStudentEvidenceCompetencyLink,
  validateCreateEvidenceCompetencyLinkInput,
  type AuthoritativeCompetencyEvidenceReference,
  type CompetencyDefinitionReference,
  type CreateEvidenceCompetencyLinkInput,
  type CurriculumPublicationState,
  type EvidenceCompetencyLink,
  type EvidenceMetadata,
  type EvidenceOutcome,
  type EvidenceRecord,
  type StudentEvidenceCompetencyLink
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import {
  loadCorrectionEventsByEvidence
} from "./evidence-correction";
import { mapEvidenceRecordRow } from "./evidence";
import {
  createServerSupabaseClient,
  createUserScopedSupabaseClient
} from "./supabase";

/**
 * Wave 7 / Batch 2 — EVID-003 Competency Evidence Linking.
 *
 * Linking is server-authoritative. The canonical Evidence Record's own
 * `user_id` is the authority for ownership; a caller-supplied userId is only
 * ever checked against it, never trusted on its own.
 *
 * A link states that trusted proof is relevant to an exact historical
 * competency definition. It does not mark a competency demonstrated: this
 * module never writes to any Learning Engine competency table and never calls
 * the Learning Engine's transition function.
 */

const LINK_COLUMNS =
  "id,evidence_id,user_id,competency_id,competency_stable_id," +
  "competency_version,relationship,link_source,metadata,linked_at";

const EVIDENCE_COLUMNS =
  "id,user_id,source_type,source_reference,source_engine,source_occurred_at," +
  "state,integrity_state,integrity_algorithm,evidence_integrity_digest," +
  "source_integrity_digest,metadata,recorded_at";

const COMPETENCY_COLUMNS = "id,stable_id,version,title,description,publication_state";

const dependency = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

function asMetadata(value: unknown): EvidenceMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as EvidenceMetadata;
}

function asPublicationState(value: unknown): CurriculumPublicationState {
  if (
    value === "draft" ||
    value === "review" ||
    value === "published" ||
    value === "retired"
  ) {
    return value;
  }

  throw new AppError({
    code: "INTERNAL_ERROR",
    message: "Invalid curriculum publication state",
    retryable: false
  });
}

export function mapEvidenceCompetencyLinkRow(
  row: Record<string, unknown>
): EvidenceCompetencyLink {
  const relationship = String(row.relationship);
  const linkSource = String(row.link_source);

  if (
    !isEvidenceCompetencyRelationship(relationship) ||
    !isEvidenceCompetencyLinkSource(linkSource)
  ) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Stored Evidence competency link is not canonical",
      retryable: false
    });
  }

  return {
    id: String(row.id),
    evidenceId: String(row.evidence_id),
    userId: String(row.user_id),
    competencyId: String(row.competency_id),
    competencyStableId: String(row.competency_stable_id),
    competencyVersion: Number(row.competency_version),
    relationship,
    linkSource,
    linkedAt: String(row.linked_at),
    metadata: asMetadata(row.metadata)
  };
}

function mapCompetencyDefinitionRow(
  row: Record<string, unknown>
): CompetencyDefinitionReference {
  return {
    id: String(row.id),
    stableId: String(row.stable_id),
    version: Number(row.version),
    title: String(row.title),
    ...(row.description ? { description: String(row.description) } : {}),
    publicationState: asPublicationState(row.publication_state)
  };
}

/**
 * Resolves the exact historical competency definition a mapping refers to.
 * Only a published definition may receive a new trusted mapping; draft, review
 * and retired definitions fail closed.
 */
async function loadApprovedCompetencyDefinition(
  competencyStableId: string,
  competencyVersion: number
): Promise<CompetencyDefinitionReference> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("competencies")
    .select(COMPETENCY_COLUMNS)
    .eq("stable_id", competencyStableId)
    .eq("version", competencyVersion)
    .limit(1);

  if (error) {
    throw dependency("Unable to load competency definition");
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Competency definition was not found for the requested version",
      retryable: false
    });
  }

  const definition = mapCompetencyDefinitionRow(row);

  if (definition.publicationState !== "published") {
    throw new AppError({
      code: "CONFLICT",
      message:
        "Only a published competency definition may receive trusted Evidence mappings",
      retryable: false,
      details: { publicationState: definition.publicationState }
    });
  }

  return definition;
}

async function loadExistingLink(
  input: CreateEvidenceCompetencyLinkInput
): Promise<EvidenceCompetencyLink | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("evidence_competency_links")
    .select(LINK_COLUMNS)
    .eq("evidence_id", input.evidenceId)
    .eq("competency_stable_id", input.competencyStableId)
    .eq("competency_version", input.competencyVersion)
    .eq("relationship", input.relationship)
    .limit(1);

  if (error) {
    throw dependency("Unable to load Evidence competency link");
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  return row ? mapEvidenceCompetencyLinkRow(row) : null;
}

function linkConflict(
  input: CreateEvidenceCompetencyLinkInput,
  reason: string
): AppError {
  writeAuditEvent({
    eventType: "evidence.competency.link_conflict",
    outcome: "failure",
    actorId: input.userId,
    targetType: "evidence_competency_link",
    metadata: {
      evidenceId: input.evidenceId,
      competencyStableId: input.competencyStableId,
      competencyVersion: input.competencyVersion,
      relationship: input.relationship,
      reason
    }
  });

  return new AppError({
    code: "CONFLICT",
    message:
      "A different trusted mapping already exists for this Evidence and competency",
    retryable: false,
    details: { reason }
  });
}

/**
 * Creates a trusted Evidence-to-competency mapping.
 *
 * Idempotent on (evidenceId, competencyStableId, competencyVersion,
 * relationship): an identical trusted mapping returns the existing link with no
 * second audit event. A materially different mapping fails closed rather than
 * rewriting history; corrections belong to EVID-006.
 */
export async function linkEvidenceToCompetency(
  input: CreateEvidenceCompetencyLinkInput
): Promise<EvidenceCompetencyLink> {
  const validation = validateCreateEvidenceCompetencyLinkInput(input);
  if (!validation.valid) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Evidence competency link input is not valid",
      retryable: false,
      details: { errors: validation.errors }
    });
  }

  const supabase = createServerSupabaseClient();

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("evidence_records")
    .select(EVIDENCE_COLUMNS)
    .eq("id", input.evidenceId)
    .limit(1);

  if (evidenceError) {
    throw dependency("Unable to load canonical Evidence Record");
  }

  const candidateEvidenceRows = (evidenceRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const evidenceRow = candidateEvidenceRows[0];
  if (!evidenceRow) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Evidence Record was not found",
      retryable: false
    });
  }

  const evidence = mapEvidenceRecordRow(evidenceRow);

  // The Evidence Record's own owner is authoritative. A caller-supplied userId
  // is only ever verified against it.
  if (evidence.userId !== input.userId) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Evidence Record does not belong to the requested student",
      retryable: false
    });
  }

  const eligibility = evaluateEvidenceLinkEligibility(evidence);
  if (!eligibility.eligible) {
    throw new AppError({
      code: "CONFLICT",
      message:
        "Only active, integrity-verified Evidence may be linked as trusted competency proof",
      retryable: false,
      details: { reason: eligibility.reason }
    });
  }

  const definition = await loadApprovedCompetencyDefinition(
    input.competencyStableId,
    input.competencyVersion
  );

  const candidate = {
    userId: evidence.userId,
    competencyId: definition.id,
    linkSource: input.linkSource
  };

  const existing = await loadExistingLink(input);
  if (existing) {
    const decision = evaluateExistingEvidenceCompetencyLink(existing, candidate);
    if (decision.kind === "match") {
      return existing;
    }
    throw linkConflict(input, decision.reason);
  }

  const { data, error } = await supabase
    .from("evidence_competency_links")
    .insert({
      evidence_id: evidence.id,
      user_id: evidence.userId,
      competency_id: definition.id,
      competency_stable_id: definition.stableId,
      competency_version: definition.version,
      relationship: input.relationship,
      link_source: input.linkSource,
      metadata: input.metadata ?? {}
    })
    .select(LINK_COLUMNS)
    .single();

  if (error) {
    if (String((error as { code?: string }).code ?? "") === "23505") {
      const raced = await loadExistingLink(input);
      if (raced) {
        const decision = evaluateExistingEvidenceCompetencyLink(raced, candidate);
        if (decision.kind === "match") {
          return raced;
        }
        throw linkConflict(input, decision.reason);
      }
    }
    throw dependency("Unable to persist Evidence competency link");
  }

  if (!data) {
    throw dependency("Unable to persist Evidence competency link");
  }

  const link = mapEvidenceCompetencyLinkRow(
    data as unknown as Record<string, unknown>
  );

  writeAuditEvent({
    eventType: "evidence.competency.linked",
    outcome: "success",
    actorId: link.userId,
    targetType: "evidence_competency_link",
    targetId: link.id,
    metadata: {
      evidenceId: link.evidenceId,
      competencyStableId: link.competencyStableId,
      competencyVersion: link.competencyVersion,
      relationship: link.relationship,
      linkSource: link.linkSource
    }
  });

  return link;
}

/**
 * Loads the competency definitions referenced by a set of links, plus the
 * latest published version per stable id, so a preserved historical reference
 * can be described without ever being remapped.
 */
async function loadCompetencyContext(
  accessToken: string,
  links: EvidenceCompetencyLink[]
): Promise<{
  definitions: Map<string, CompetencyDefinitionReference>;
  latestPublished: Map<string, number>;
}> {
  const definitions = new Map<string, CompetencyDefinitionReference>();
  const latestPublished = new Map<string, number>();

  if (links.length === 0) {
    return { definitions, latestPublished };
  }

  const stableIds = [...new Set(links.map((link) => link.competencyStableId))];
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("competencies")
    .select(COMPETENCY_COLUMNS)
    .in("stable_id", stableIds);

  if (error) {
    throw dependency("Unable to load competency definitions");
  }

  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const definition = mapCompetencyDefinitionRow(row);
    definitions.set(`${definition.stableId}@${definition.version}`, definition);

    if (definition.publicationState === "published") {
      const current = latestPublished.get(definition.stableId) ?? 0;
      if (definition.version > current) {
        latestPublished.set(definition.stableId, definition.version);
      }
    }
  }

  return { definitions, latestPublished };
}

function projectLinks(
  links: EvidenceCompetencyLink[],
  context: {
    definitions: Map<string, CompetencyDefinitionReference>;
    latestPublished: Map<string, number>;
  }
): StudentEvidenceCompetencyLink[] {
  return links.map((link) =>
    toStudentEvidenceCompetencyLink(
      link,
      context.definitions.get(
        `${link.competencyStableId}@${link.competencyVersion}`
      ) ?? null,
      context.latestPublished.get(link.competencyStableId) ?? null
    )
  );
}

/**
 * Student read helper. Ownership is enforced by RLS through the user-scoped
 * client, so the query filters only on the requested subject.
 */
async function loadStudentLinksBy(
  accessToken: string,
  column: "evidence_id" | "competency_stable_id",
  value: string
): Promise<EvidenceCompetencyLink[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("evidence_competency_links")
    .select(LINK_COLUMNS)
    .eq(column, value)
    .order("linked_at", { ascending: false });

  if (error) {
    throw dependency("Unable to load Evidence competency links");
  }

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) =>
    mapEvidenceCompetencyLinkRow(row)
  );
}

/** Student read: which competencies one of their Evidence Records supports. */
export async function listEvidenceCompetencyLinks(
  accessToken: string,
  evidenceId: string
): Promise<StudentEvidenceCompetencyLink[]> {
  if (typeof evidenceId !== "string" || evidenceId.trim() === "") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Evidence identifier is required",
      retryable: false
    });
  }

  const links = await loadStudentLinksBy(accessToken, "evidence_id", evidenceId);

  return projectLinks(links, await loadCompetencyContext(accessToken, links));
}

/** Student read: which of their Evidence Records support one competency. */
export async function listCompetencyEvidenceLinks(
  accessToken: string,
  competencyStableId: string
): Promise<StudentEvidenceCompetencyLink[]> {
  if (
    typeof competencyStableId !== "string" ||
    competencyStableId.trim() === ""
  ) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Competency identifier is required",
      retryable: false
    });
  }

  const links = await loadStudentLinksBy(
    accessToken,
    "competency_stable_id",
    competencyStableId
  );

  return projectLinks(links, await loadCompetencyContext(accessToken, links));
}

/**
 * Learning / Competency Engine integration contract.
 *
 * Read-only by design: it reports approved Evidence references for a
 * competency so the existing deterministic transition logic can interpret them.
 * It deliberately performs no state transition and marks nothing demonstrated.
 *
 * This is the full historical accessor: invalidated and superseded Evidence is
 * still returned, carrying its effective state, so disputes remain
 * reconstructable. Only `qualifiesForDemonstration` changes.
 */
export async function getAuthoritativeCompetencyEvidenceReferences(
  userId: string,
  competencyStableId: string
): Promise<AuthoritativeCompetencyEvidenceReference[]> {
  if (
    typeof userId !== "string" ||
    userId.trim() === "" ||
    typeof competencyStableId !== "string" ||
    competencyStableId.trim() === ""
  ) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Student and competency identifiers are required",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("evidence_competency_links")
    .select(LINK_COLUMNS)
    .eq("user_id", userId)
    .eq("competency_stable_id", competencyStableId)
    .order("linked_at", { ascending: true });

  if (error) {
    throw dependency("Unable to load Evidence competency links");
  }

  const links: EvidenceCompetencyLink[] = (
    (data ?? []) as unknown as Array<Record<string, unknown>>
  ).map((row) => mapEvidenceCompetencyLinkRow(row));

  if (links.length === 0) {
    return [];
  }

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("evidence_records")
    .select(EVIDENCE_COLUMNS)
    .in(
      "id",
      links.map((link) => link.evidenceId)
    );

  if (evidenceError) {
    throw dependency("Unable to load canonical Evidence Records");
  }

  const evidenceById = new Map<string, EvidenceRecord>(
    ((evidenceRows ?? []) as unknown as Array<Record<string, unknown>>)
      .map((row) => mapEvidenceRecordRow(row))
      .map((record) => [record.id, record] as const)
  );

  const references: AuthoritativeCompetencyEvidenceReference[] = [];

  // Effective trust state is resolved at read time from the append-only
  // correction history, never cached onto the link. Evidence invalidated or
  // superseded after it was linked therefore stops qualifying immediately.
  const correctionsByEvidence = await loadCorrectionEventsByEvidence(
    links.map((link) => link.evidenceId)
  );

  for (const link of links) {
    const evidence = evidenceById.get(link.evidenceId);
    if (!evidence) {
      continue;
    }

    const effective = resolveEffectiveEvidenceState(
      evidence,
      correctionsByEvidence.get(link.evidenceId) ?? []
    );

    // The authoritative outcome comes from the source engine's recorded result
    // state, so a failed assessment is reported as negative rather than as
    // unqualified accepted proof.
    const resultState = evidence.metadata.resultState;
    const evidenceOutcome: EvidenceOutcome = deriveEvidenceOutcome(resultState);

    // Qualification requires BOTH a positive source outcome and Evidence that
    // is effectively trusted right now. Integrity must also still be verified.
    const trusted =
      isEffectivelyTrustedEvidence(effective) &&
      evaluateEvidenceLinkEligibility({
        state: effective.state,
        integrityState: evidence.integrityState
      }).eligible;

    references.push({
      evidenceId: link.evidenceId,
      competencyStableId: link.competencyStableId,
      competencyVersion: link.competencyVersion,
      relationship: link.relationship,
      linkSource: link.linkSource,
      linkedAt: link.linkedAt,
      evidenceSourceType: evidence.sourceType,
      evidenceSourceEngine: evidence.sourceEngine,
      evidenceSourceReference: evidence.sourceReference,
      evidenceSourceOccurredAt: evidence.sourceOccurredAt,
      evidenceOutcome,
      ...(typeof resultState === "string"
        ? { evidenceResultState: resultState }
        : {}),
      evidenceEffectiveState: effective.state,
      evidenceUnderReview: effective.underReview,
      qualifiesForDemonstration:
        trusted && qualifiesAsDemonstrationEvidence(evidenceOutcome)
    });
  }

  return references;
}

/**
 * Mastery-safe subset of `getAuthoritativeCompetencyEvidenceReferences`.
 *
 * Returns only references whose source engine recorded a positive outcome, so a
 * Learning Engine consumer cannot accidentally treat a failed assessment as
 * proof that a competency was demonstrated. The failed Evidence and its
 * competency link are still created, still stored and still returned by the
 * full accessor above: historical truth is preserved, only its interpretation
 * is constrained.
 */
export async function getQualifyingCompetencyEvidenceReferences(
  userId: string,
  competencyStableId: string
): Promise<AuthoritativeCompetencyEvidenceReference[]> {
  const references = await getAuthoritativeCompetencyEvidenceReferences(
    userId,
    competencyStableId
  );

  return references.filter((reference) => reference.qualifiesForDemonstration);
}
