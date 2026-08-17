import type {
  CertificateDefinition,
  CertificateDefinitionCompetencyRequirement,
  CertificateDefinitionEvidencePolicy,
  CertificateDefinitionPresentation,
  CertificateDefinitionState,
  CertificateDefinitionValidationIssue,
  CertificateDefinitionValidationResult,
  CreateCertificateDefinitionInput
} from "@tlp/shared-types";
import {
  AppError,
  evaluateCertificateDefinitionEdit,
  isValidCertificateDefinitionTransition,
  isValidCertificateExpirationMonths,
  isValidVerificationPermitted,
  normalizeCertificateDefinitionStableId,
  validateCertificateCompetencyRequirements,
  validateCertificateEvidencePolicies,
  validateCertificateDefinitionForPublicationShape,
  validateCertificateDefinitionSupersession,
  validateCreateCertificateDefinitionInput
} from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";
import { writeAuditEvent } from "./audit";

/**
 * CERT-001 — privileged Certificate Definition authoring.
 *
 * Every function here is reachable only through the founder_admin path in
 * server.ts. There is no student-facing entry point in this module.
 *
 * Strictly out of scope, and absent by construction: eligibility evaluation
 * (CERT-002), issuance (CERT-003), student certificate records and lifecycle
 * (CERT-004), verification (CERT-005), portfolio (CERT-006), export (CERT-007),
 * revocation (CERT-008) and rendering (CERT-009). This module defines what a
 * certificate requires; it never decides that anyone has earned one.
 */

interface AuthoringContext {
  actorUserId: string;
}

const DEFINITION_COLUMNS =
  "id,stable_id,version,title,description,issuer,publication_state,effective_at,expiration_months,verification_permitted,superseded_by_definition_id,plain_language_title,plain_language_summary,logo_text_alternative";

interface DefinitionRow {
  id: string;
  stable_id: string;
  version: number;
  title: string;
  description: string | null;
  issuer: string;
  publication_state: CertificateDefinitionState;
  effective_at: string;
  expiration_months: number | null;
  verification_permitted: boolean;
  superseded_by_definition_id: string | null;
  plain_language_title: string;
  plain_language_summary: string | null;
  logo_text_alternative: string | null;
}

function validationError(
  message: string,
  issues: CertificateDefinitionValidationIssue[]
): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    message,
    retryable: false,
    details: { issues }
  });
}

function unavailable(message: string): AppError {
  return new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });
}

function requireStableId(value: string): string {
  const stableId = normalizeCertificateDefinitionStableId(value);

  if (!stableId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message:
        "Certificate Definition stable ID must be 3-120 lowercase characters using letters, numbers, dot, underscore, or hyphen",
      retryable: false
    });
  }

  return stableId;
}

function toPresentation(row: DefinitionRow): CertificateDefinitionPresentation {
  return {
    plainLanguageTitle: row.plain_language_title,
    ...(row.plain_language_summary
      ? { plainLanguageSummary: row.plain_language_summary }
      : {}),
    ...(row.logo_text_alternative
      ? { logoTextAlternative: row.logo_text_alternative }
      : {})
  };
}

function toDefinition(
  row: DefinitionRow,
  requiredCompetencies: CertificateDefinitionCompetencyRequirement[],
  evidencePolicies: CertificateDefinitionEvidencePolicy[]
): CertificateDefinition {
  return {
    id: row.id,
    stableId: row.stable_id,
    version: row.version,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    issuer: row.issuer,
    publicationState: row.publication_state,
    effectiveAt: row.effective_at,
    expirationMonths: row.expiration_months,
    verificationPermitted: row.verification_permitted,
    supersededByDefinitionId: row.superseded_by_definition_id,
    presentation: toPresentation(row),
    requiredCompetencies,
    evidencePolicies
  };
}

async function loadDefinitionRow(definitionId: string): Promise<DefinitionRow> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("certificate_definitions")
    .select(DEFINITION_COLUMNS)
    .eq("id", definitionId)
    .single();

  if (error || !data) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Certificate Definition was not found",
      retryable: false
    });
  }

  return data as unknown as DefinitionRow;
}

async function loadRequirements(definitionId: string): Promise<{
  requiredCompetencies: CertificateDefinitionCompetencyRequirement[];
  evidencePolicies: CertificateDefinitionEvidencePolicy[];
}> {
  const supabase = createServerSupabaseClient();

  const { data: competencyRows, error: competencyError } = await supabase
    .from("certificate_definition_competencies")
    .select("competency_stable_id,competency_version,required")
    .eq("certificate_definition_id", definitionId)
    .order("competency_stable_id");

  if (competencyError) {
    throw unavailable("Unable to load Certificate Definition competencies");
  }

  const { data: policyRows, error: policyError } = await supabase
    .from("certificate_definition_evidence_policies")
    .select("evidence_source_type,minimum_count,require_positive_outcome")
    .eq("certificate_definition_id", definitionId)
    .order("evidence_source_type");

  if (policyError) {
    throw unavailable("Unable to load Certificate Definition evidence policies");
  }

  return {
    requiredCompetencies: (competencyRows ?? []).map((row) => ({
      competencyStableId: row.competency_stable_id,
      competencyVersion: row.competency_version,
      required: row.required
    })),
    evidencePolicies: (policyRows ?? []).map((row) => ({
      evidenceSourceType: row.evidence_source_type,
      minimumCount: row.minimum_count,
      requirePositiveOutcome: row.require_positive_outcome
    }))
  };
}

async function nextCertificateDefinitionVersion(
  stableId: string
): Promise<number> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("certificate_definitions")
    .select("version")
    .eq("stable_id", stableId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw unavailable("Unable to inspect Certificate Definition versions");
  }

  return Number(data?.version ?? 0) + 1;
}

/**
 * Reads a definition with its normalized requirements. Privileged: it returns
 * draft, review and retired definitions, which RLS hides from students.
 */
export async function getCertificateDefinition(
  definitionId: string
): Promise<CertificateDefinition> {
  const row = await loadDefinitionRow(definitionId);
  const { requiredCompetencies, evidencePolicies } = await loadRequirements(
    definitionId
  );
  return toDefinition(row, requiredCompetencies, evidencePolicies);
}

export async function listCertificateDefinitions(): Promise<
  CertificateDefinition[]
> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("certificate_definitions")
    .select(DEFINITION_COLUMNS)
    .order("stable_id")
    .order("version", { ascending: false });

  if (error) {
    throw unavailable("Unable to list Certificate Definitions");
  }

  const definitions: CertificateDefinition[] = [];

  for (const row of (data ?? []) as unknown as DefinitionRow[]) {
    const { requiredCompetencies, evidencePolicies } = await loadRequirements(
      row.id
    );
    definitions.push(toDefinition(row, requiredCompetencies, evidencePolicies));
  }

  return definitions;
}

/**
 * Creates a new draft Certificate Definition version.
 *
 * The version is always allocated by the server as `max(version) + 1` for the
 * stable ID. A caller cannot choose one, so a material change can only ever
 * produce a new version rather than overwrite an existing one.
 */
export async function createDraftCertificateDefinition(
  context: AuthoringContext,
  input: CreateCertificateDefinitionInput
): Promise<CertificateDefinition> {
  const validation = validateCreateCertificateDefinitionInput(input);

  if (!validation.valid) {
    throw validationError(
      "Certificate Definition input is invalid",
      validation.issues
    );
  }

  const supabase = createServerSupabaseClient();
  const stableId = requireStableId(input.stableId);
  const version = await nextCertificateDefinitionVersion(stableId);

  const { data, error } = await supabase
    .from("certificate_definitions")
    .insert({
      stable_id: stableId,
      version,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      issuer: input.issuer.trim(),
      publication_state: "draft",
      effective_at: new Date(input.effectiveAt).toISOString(),
      expiration_months: input.expirationMonths ?? null,
      verification_permitted: input.verificationPermitted ?? false,
      plain_language_title: input.presentation.plainLanguageTitle.trim(),
      plain_language_summary:
        input.presentation.plainLanguageSummary?.trim() || null,
      logo_text_alternative:
        input.presentation.logoTextAlternative?.trim() || null
    })
    .select(DEFINITION_COLUMNS)
    .single();

  if (error?.code === "23505") {
    throw new AppError({
      code: "CONFLICT",
      message: "A Certificate Definition with this stable ID and version already exists",
      retryable: false
    });
  }

  if (error || !data) {
    throw unavailable("Unable to create Certificate Definition draft");
  }

  const row = data as unknown as DefinitionRow;

  if (input.requiredCompetencies?.length) {
    await setCertificateDefinitionCompetencies(
      context,
      row.id,
      input.requiredCompetencies
    );
  }

  if (input.evidencePolicies?.length) {
    await setCertificateDefinitionEvidencePolicies(
      context,
      row.id,
      input.evidencePolicies
    );
  }

  writeAuditEvent({
    eventType: "certificate.definition.created",
    outcome: "success",
    actorId: context.actorUserId,
    targetType: "certificate_definition",
    targetId: row.id,
    metadata: { stableId: row.stable_id, version: row.version }
  });

  return getCertificateDefinition(row.id);
}

/**
 * Edits a Certificate Definition.
 *
 * Draft, review and retired versions accept the full patch. A published version
 * accepts presentational corrections only: any material change is rejected
 * here, and rejected again by the database freeze trigger if it were ever
 * attempted by another writer.
 */
export async function updateCertificateDefinition(
  context: AuthoringContext,
  definitionId: string,
  patch: {
    title?: string;
    description?: string | null;
    issuer?: string;
    effectiveAt?: string;
    expirationMonths?: number | null;
    verificationPermitted?: boolean;
    presentation?: Partial<CertificateDefinitionPresentation>;
  }
): Promise<CertificateDefinition> {
  const current = await getCertificateDefinition(definitionId);

  const proposed: Partial<CertificateDefinition> = {};
  if (patch.issuer !== undefined) proposed.issuer = patch.issuer.trim();
  if (patch.effectiveAt !== undefined) {
    proposed.effectiveAt = new Date(patch.effectiveAt).toISOString();
  }
  if (patch.expirationMonths !== undefined) {
    proposed.expirationMonths = patch.expirationMonths;
  }
  if (patch.verificationPermitted !== undefined) {
    proposed.verificationPermitted = patch.verificationPermitted;
  }

  const editCheck = evaluateCertificateDefinitionEdit(current, proposed);

  if (!editCheck.valid) {
    writeAuditEvent({
      eventType: "certificate.definition.material_change_rejected",
      outcome: "failure",
      actorId: context.actorUserId,
      targetType: "certificate_definition",
      targetId: definitionId,
      metadata: { stableId: current.stableId, version: current.version }
    });

    throw new AppError({
      code: "CONFLICT",
      message:
        "Published Certificate Definition versions are materially immutable. Create a new version instead.",
      retryable: false,
      details: { issues: editCheck.issues }
    });
  }

  const update: Record<string, unknown> = {};

  if (patch.title !== undefined) {
    if (!patch.title.trim()) {
      throw validationError("Certificate Definition input is invalid", [
        { code: "MISSING_TITLE", message: "Certificate title is required." }
      ]);
    }
    update.title = patch.title.trim();
  }

  if (patch.description !== undefined) {
    update.description = patch.description?.trim() || null;
  }

  if (patch.issuer !== undefined) {
    if (!patch.issuer.trim()) {
      throw validationError("Certificate Definition input is invalid", [
        { code: "MISSING_ISSUER", message: "Certificate issuer is required." }
      ]);
    }
    update.issuer = patch.issuer.trim();
  }

  if (patch.effectiveAt !== undefined) {
    if (Number.isNaN(Date.parse(patch.effectiveAt))) {
      throw validationError("Certificate Definition input is invalid", [
        {
          code: "INVALID_EFFECTIVE_AT",
          message: "Effective date must be a parseable timestamp."
        }
      ]);
    }
    update.effective_at = new Date(patch.effectiveAt).toISOString();
  }

  if (patch.expirationMonths !== undefined) {
    if (!isValidCertificateExpirationMonths(patch.expirationMonths)) {
      throw validationError("Certificate Definition input is invalid", [
        {
          code: "INVALID_EXPIRATION_MONTHS",
          message:
            "Expiration months must be null (no expiration) or an integer between 1 and 600."
        }
      ]);
    }
    update.expiration_months = patch.expirationMonths;
  }

  if (patch.verificationPermitted !== undefined) {
    if (!isValidVerificationPermitted(patch.verificationPermitted)) {
      throw validationError("Certificate Definition input is invalid", [
        {
          code: "INVALID_VERIFICATION_PERMITTED",
          message:
            "Verification permitted must be a boolean policy declaration."
        }
      ]);
    }
    update.verification_permitted = patch.verificationPermitted;
  }

  if (patch.presentation?.plainLanguageTitle !== undefined) {
    if (!patch.presentation.plainLanguageTitle.trim()) {
      throw validationError("Certificate Definition input is invalid", [
        {
          code: "MISSING_PLAIN_LANGUAGE_TITLE",
          message: "An accessible plain-language title is required."
        }
      ]);
    }
    update.plain_language_title = patch.presentation.plainLanguageTitle.trim();
  }

  if (patch.presentation?.plainLanguageSummary !== undefined) {
    update.plain_language_summary =
      patch.presentation.plainLanguageSummary?.trim() || null;
  }

  if (patch.presentation?.logoTextAlternative !== undefined) {
    update.logo_text_alternative =
      patch.presentation.logoTextAlternative?.trim() || null;
  }

  if (Object.keys(update).length === 0) {
    return current;
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("certificate_definitions")
    .update(update)
    .eq("id", definitionId);

  if (error) {
    throw unavailable("Unable to update Certificate Definition");
  }

  writeAuditEvent({
    eventType: "certificate.definition.updated",
    outcome: "success",
    actorId: context.actorUserId,
    targetType: "certificate_definition",
    targetId: definitionId,
    metadata: { stableId: current.stableId, version: current.version }
  });

  return getCertificateDefinition(definitionId);
}

/**
 * Replaces the normalized required-competency set.
 *
 * Each requirement is resolved by its exact (stable id, version) pair. A
 * competency version that does not exist is an error — it is never quietly
 * replaced with the latest published version, because doing so would change
 * what the certificate requires without anyone deciding to.
 */
export async function setCertificateDefinitionCompetencies(
  context: AuthoringContext,
  definitionId: string,
  requirements: CertificateDefinitionCompetencyRequirement[]
): Promise<CertificateDefinition> {
  const issues = validateCertificateCompetencyRequirements(requirements);

  if (issues.length > 0) {
    throw validationError(
      "Certificate Definition competency requirements are invalid",
      issues
    );
  }

  const current = await loadDefinitionRow(definitionId);

  if (current.publication_state === "published") {
    throw new AppError({
      code: "CONFLICT",
      message:
        "Published Certificate Definition requirements are materially immutable. Create a new version instead.",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();
  const resolved: Array<{
    competency_id: string;
    competency_stable_id: string;
    competency_version: number;
    required: boolean;
  }> = [];

  for (const requirement of requirements) {
    const competencyStableId = requireStableId(requirement.competencyStableId);

    const { data: competency, error } = await supabase
      .from("competencies")
      .select("id,stable_id,version,publication_state")
      .eq("stable_id", competencyStableId)
      .eq("version", requirement.competencyVersion)
      .maybeSingle();

    if (error) {
      throw unavailable("Unable to resolve required competency");
    }

    if (!competency) {
      throw validationError(
        "Certificate Definition competency requirements are invalid",
        [
          {
            code: "UNRESOLVED_COMPETENCY_VERSION",
            message:
              "The exact competency version referenced by this certificate does not exist.",
            competencyStableId,
            competencyVersion: requirement.competencyVersion
          }
        ]
      );
    }

    resolved.push({
      competency_id: competency.id,
      competency_stable_id: competency.stable_id,
      competency_version: competency.version,
      required: requirement.required
    });
  }

  // Every competency was resolved above, so all validation and resolution is
  // complete before anything destructive happens. The replacement itself runs
  // as one transaction inside the database: a failure rolls back the delete
  // too, leaving the previous requirement set intact rather than empty.
  const { error: replaceError } = await supabase.rpc(
    "certificate_definition_replace_competencies",
    {
      target_definition_id: definitionId,
      competency_ids: resolved.map((row) => row.competency_id),
      competency_stable_ids: resolved.map((row) => row.competency_stable_id),
      competency_versions: resolved.map((row) => row.competency_version),
      required_flags: resolved.map((row) => row.required)
    }
  );

  if (replaceError) {
    throw unavailable("Unable to replace Certificate Definition competencies");
  }

  writeAuditEvent({
    eventType: "certificate.definition.competencies_set",
    outcome: "success",
    actorId: context.actorUserId,
    targetType: "certificate_definition",
    targetId: definitionId,
    metadata: {
      stableId: current.stable_id,
      version: current.version,
      requirementCount: resolved.length
    }
  });

  return getCertificateDefinition(definitionId);
}

/** Replaces the normalized declarative evidence policy set. */
export async function setCertificateDefinitionEvidencePolicies(
  context: AuthoringContext,
  definitionId: string,
  policies: CertificateDefinitionEvidencePolicy[]
): Promise<CertificateDefinition> {
  const issues = validateCertificateEvidencePolicies(policies);

  if (issues.length > 0) {
    throw validationError(
      "Certificate Definition evidence policies are invalid",
      issues
    );
  }

  const current = await loadDefinitionRow(definitionId);

  if (current.publication_state === "published") {
    throw new AppError({
      code: "CONFLICT",
      message:
        "Published Certificate Definition requirements are materially immutable. Create a new version instead.",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  // Validated above, so the destructive step is reached only with a known-good
  // policy set. The replacement runs as one transaction inside the database:
  // a failure rolls back the delete too, leaving the previous policy set
  // intact rather than empty.
  const { error: replaceError } = await supabase.rpc(
    "certificate_definition_replace_evidence_policies",
    {
      target_definition_id: definitionId,
      source_types: policies.map((policy) => policy.evidenceSourceType),
      minimum_counts: policies.map((policy) => policy.minimumCount),
      require_positive_flags: policies.map(
        (policy) => policy.requirePositiveOutcome
      )
    }
  );

  if (replaceError) {
    throw unavailable(
      "Unable to replace Certificate Definition evidence policies"
    );
  }

  writeAuditEvent({
    eventType: "certificate.definition.evidence_policies_set",
    outcome: "success",
    actorId: context.actorUserId,
    targetType: "certificate_definition",
    targetId: definitionId,
    metadata: {
      stableId: current.stable_id,
      version: current.version,
      policyCount: policies.length
    }
  });

  return getCertificateDefinition(definitionId);
}

/**
 * Publication readiness. Fails closed: any unresolved or ineligible competency
 * reference blocks publication, and nothing is repaired or substituted.
 */
export async function validateCertificateDefinitionForPublication(
  definitionId: string
): Promise<CertificateDefinitionValidationResult> {
  const definition = await getCertificateDefinition(definitionId);
  const shape = validateCertificateDefinitionForPublicationShape(definition);
  const issues: CertificateDefinitionValidationIssue[] = [...shape.issues];

  const supabase = createServerSupabaseClient();

  for (const requirement of definition.requiredCompetencies) {
    const { data: competency, error } = await supabase
      .from("competencies")
      .select("id,stable_id,version,publication_state")
      .eq("stable_id", requirement.competencyStableId)
      .eq("version", requirement.competencyVersion)
      .maybeSingle();

    if (error) {
      throw unavailable("Unable to validate Certificate Definition competencies");
    }

    if (!competency) {
      issues.push({
        code: "UNRESOLVED_COMPETENCY_VERSION",
        message:
          "The exact competency version required by this certificate cannot be resolved.",
        competencyStableId: requirement.competencyStableId,
        competencyVersion: requirement.competencyVersion
      });
      continue;
    }

    // CERT-001 section 12: broken competency references must block
    // publication. A competency that is not itself published cannot support a
    // published certificate.
    if (competency.publication_state !== "published") {
      issues.push({
        code: "INELIGIBLE_COMPETENCY",
        message:
          "A required competency is not published and cannot support a published certificate.",
        competencyStableId: requirement.competencyStableId,
        competencyVersion: requirement.competencyVersion
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Moves a Certificate Definition through the publication lifecycle.
 *
 * Transition to `published` runs the full fail-closed validation first: an
 * invalid definition, an unresolvable competency version or an unpublished
 * competency all block publication, and CERT-001 section 12 requires that
 * invalid definitions remain draft.
 */
export async function transitionCertificateDefinitionState(
  context: AuthoringContext,
  definitionId: string,
  to: CertificateDefinitionState,
  reason?: string
): Promise<CertificateDefinition> {
  const current = await loadDefinitionRow(definitionId);
  const from = current.publication_state;

  if (!isValidCertificateDefinitionTransition(from, to)) {
    throw new AppError({
      code: "CONFLICT",
      message: `Invalid Certificate Definition transition from ${from} to ${to}`,
      retryable: false
    });
  }

  if (to === "published") {
    const validation = await validateCertificateDefinitionForPublication(
      definitionId
    );

    if (!validation.valid) {
      writeAuditEvent({
        eventType: "certificate.definition.publication_blocked",
        outcome: "failure",
        actorId: context.actorUserId,
        targetType: "certificate_definition",
        targetId: definitionId,
        metadata: {
          stableId: current.stable_id,
          version: current.version,
          issueCount: validation.issues.length
        }
      });

      throw new AppError({
        code: "CONFLICT",
        message:
          "Certificate Definition cannot be published until validation passes",
        retryable: false,
        details: { issues: validation.issues }
      });
    }
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("certificate_definitions")
    .update({ publication_state: to })
    .eq("id", definitionId);

  if (error) {
    throw unavailable(
      "Unable to transition Certificate Definition publication state"
    );
  }

  writeAuditEvent({
    eventType: "certificate.definition.state_changed",
    outcome: "success",
    actorId: context.actorUserId,
    targetType: "certificate_definition",
    targetId: definitionId,
    metadata: {
      stableId: current.stable_id,
      version: current.version,
      fromState: from,
      toState: to,
      ...(reason?.trim() ? { reason: reason.trim() } : {})
    }
  });

  return getCertificateDefinition(definitionId);
}

/**
 * Records that one Certificate Definition supersedes another.
 *
 * History is never deleted: the superseded definition remains readable, and
 * later issuance will pin the exact version it was granted against. Self-
 * supersession and supersession cycles are rejected here and again by the
 * database trigger.
 */
export async function supersedeCertificateDefinition(
  context: AuthoringContext,
  definitionId: string,
  supersededByDefinitionId: string
): Promise<CertificateDefinition> {
  const current = await loadDefinitionRow(definitionId);
  const successor = await loadDefinitionRow(supersededByDefinitionId);

  const supabase = createServerSupabaseClient();

  const { data: links, error: linkError } = await supabase
    .from("certificate_definitions")
    .select("id,superseded_by_definition_id");

  if (linkError) {
    throw unavailable("Unable to inspect Certificate Definition supersession");
  }

  const existingLinks = new Map<string, string | null>(
    (links ?? []).map((row) => [row.id, row.superseded_by_definition_id])
  );

  const validation = validateCertificateDefinitionSupersession(
    definitionId,
    supersededByDefinitionId,
    existingLinks
  );

  if (!validation.valid) {
    throw new AppError({
      code: "CONFLICT",
      message: validation.issues[0]?.message ?? "Invalid supersession",
      retryable: false,
      details: { issues: validation.issues }
    });
  }

  const { error } = await supabase
    .from("certificate_definitions")
    .update({ superseded_by_definition_id: supersededByDefinitionId })
    .eq("id", definitionId);

  if (error) {
    throw unavailable("Unable to record Certificate Definition supersession");
  }

  writeAuditEvent({
    eventType: "certificate.definition.superseded",
    outcome: "success",
    actorId: context.actorUserId,
    targetType: "certificate_definition",
    targetId: definitionId,
    metadata: {
      stableId: current.stable_id,
      version: current.version,
      supersededByStableId: successor.stable_id,
      supersededByVersion: successor.version
    }
  });

  return getCertificateDefinition(definitionId);
}
