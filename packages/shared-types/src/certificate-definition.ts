import type { CurriculumPublicationState } from "./curriculum";
import type { EvidenceSourceType } from "./evidence";

/**
 * CERT-001 — Certificate Definition Model.
 *
 * This module owns the authoritative *specification* of a certificate: what it
 * requires, who issues it, how long it stays valid, and whether verification is
 * permitted. It owns nothing about a student.
 *
 * Deliberately absent, and owned by later Features:
 *
 * - CERT-002 eligibility evaluation (does this student qualify?)
 * - CERT-003 deterministic issuance
 * - CERT-004 certificate records and lifecycle
 * - CERT-005 verification behaviour
 * - CERT-006 portfolio, CERT-007 export, CERT-008 revocation, CERT-009 branding UI
 *
 * There is therefore no student identifier, no eligibility result, no issuance
 * function, no expiry calculation and no verification identifier anywhere in
 * this file. `expirationMonths` and `verificationPermitted` are declarations
 * about policy, not executions of it.
 */

/**
 * Certificate Definitions reuse the curriculum publication lifecycle rather
 * than inventing a parallel one: draft -> review -> published -> retired.
 */
export type CertificateDefinitionState = CurriculumPublicationState;

export const CERTIFICATE_DEFINITION_STATES: readonly CertificateDefinitionState[] =
  ["draft", "review", "published", "retired"];

/**
 * Stable-ID convention, matching the existing curriculum authoring rule
 * (`normalizeStableId` in services/api/src/curriculum-admin.ts): 3-120
 * characters, lowercase, letters/digits/dot/underscore/hyphen, leading
 * alphanumeric. Input is lowercased first, so the Feature Registry's
 * `CERTDEF-NET-FOUNDATIONS-001` example normalises to
 * `certdef-net-foundations-001`.
 */
export const CERTIFICATE_DEFINITION_STABLE_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]{2,119}$/;

/**
 * Approved MVP expiration policy. `expirationMonths` is a nullable integer
 * validity window in months. Null means the certificate does not expire.
 *
 * It is declarative only. Nothing here computes an expiry date, schedules a
 * revalidation, or models a revalidation type — those belong to CERT-004
 * lifecycle, not CERT-001.
 */
export const CERTIFICATE_EXPIRATION_MIN_MONTHS = 1;
export const CERTIFICATE_EXPIRATION_MAX_MONTHS = 600;

export const CERTIFICATE_EVIDENCE_POLICY_MIN_COUNT = 1;
export const CERTIFICATE_EVIDENCE_POLICY_MAX_COUNT = 100;

/**
 * A required competency, pinned to one exact historical competency row.
 *
 * `competencyVersion` is never resolved to "latest". A certificate published
 * against competency version 3 keeps meaning version 3 even after version 4 is
 * published, which is the whole point of CERT-001 section 2: curriculum updates
 * must not silently change what a certificate meant.
 */
export interface CertificateDefinitionCompetencyRequirement {
  competencyStableId: string;
  competencyVersion: number;
  required: boolean;
}

/**
 * A declarative evidence requirement. CERT-002 reads these to evaluate
 * eligibility; CERT-001 only records them.
 *
 * `evidenceSourceType` reuses the Wave 7 canonical Evidence source type, which
 * is the EVID-001 dependency CERT-001 section 8 declares.
 */
export interface CertificateDefinitionEvidencePolicy {
  evidenceSourceType: EvidenceSourceType;
  minimumCount: number;
  requirePositiveOutcome: boolean;
}

/**
 * Accessible presentation metadata required by CERT-001 section 10.
 * Presentation is descriptive, never authoritative: nothing here participates
 * in eligibility, and CERT-009 owns actual rendering and branding.
 */
export interface CertificateDefinitionPresentation {
  plainLanguageTitle: string;
  plainLanguageSummary?: string;
  logoTextAlternative?: string;
}

export interface CertificateDefinition {
  id: string;
  stableId: string;
  version: number;
  title: string;
  description?: string;
  issuer: string;
  publicationState: CertificateDefinitionState;
  effectiveAt: string;
  /** Null means no expiration. Otherwise an integer 1-600 month window. */
  expirationMonths: number | null;
  /** Declarative policy switch only. No verification behaviour exists here. */
  verificationPermitted: boolean;
  supersededByDefinitionId: string | null;
  presentation: CertificateDefinitionPresentation;
  requiredCompetencies: CertificateDefinitionCompetencyRequirement[];
  evidencePolicies: CertificateDefinitionEvidencePolicy[];
}

export interface CreateCertificateDefinitionInput {
  stableId: string;
  title: string;
  description?: string;
  issuer: string;
  effectiveAt: string;
  expirationMonths?: number | null;
  verificationPermitted?: boolean;
  presentation: CertificateDefinitionPresentation;
  requiredCompetencies?: CertificateDefinitionCompetencyRequirement[];
  evidencePolicies?: CertificateDefinitionEvidencePolicy[];
}

/**
 * The material field set.
 *
 * A published Certificate Definition version is *materially* immutable: these
 * fields determine what the certificate requires and means, so changing one on
 * a published version would retroactively change the meaning of every
 * certificate already issued against it. Material changes require a new
 * version.
 *
 * `public.guard_certificate_definition_material_freeze()` in migration
 * 20260813000700 freezes exactly these same conceptual fields at the database,
 * so the guarantee does not depend on application code being called.
 *
 * Deliberately NOT material, and therefore still editable while published:
 * `title`, `description` and `presentation` (plain-language title, summary,
 * logo text alternative). CERT-001 section 7 states that Certificate Definition
 * IDs must remain stable across display-title changes, and section 10 requires
 * accessible presentation metadata that can be improved without reissuing
 * certificates. Correcting a typo or improving a screen-reader alternative does
 * not change what a holder had to demonstrate.
 *
 * `publicationState` and `supersededByDefinitionId` are also excluded: they are
 * the lifecycle and supersession mechanisms themselves, and freezing them would
 * make retirement and supersession impossible.
 */
export const CERTIFICATE_DEFINITION_MATERIAL_FIELDS = [
  "stableId",
  "version",
  "issuer",
  "effectiveAt",
  "expirationMonths",
  "verificationPermitted",
  "requiredCompetencies",
  "evidencePolicies"
] as const;

export type CertificateDefinitionMaterialField =
  (typeof CERTIFICATE_DEFINITION_MATERIAL_FIELDS)[number];

export type CertificateDefinitionValidationCode =
  | "INVALID_STABLE_ID"
  | "MISSING_TITLE"
  | "MISSING_ISSUER"
  | "MISSING_PLAIN_LANGUAGE_TITLE"
  | "INVALID_EFFECTIVE_AT"
  | "INVALID_EXPIRATION_MONTHS"
  | "INVALID_VERIFICATION_PERMITTED"
  | "INVALID_VERSION"
  | "INVALID_STATE"
  | "INVALID_STATE_TRANSITION"
  | "MISSING_REQUIRED_COMPETENCY"
  | "DUPLICATE_COMPETENCY_REQUIREMENT"
  | "INVALID_COMPETENCY_REFERENCE"
  | "UNRESOLVED_COMPETENCY_VERSION"
  | "INELIGIBLE_COMPETENCY"
  | "DUPLICATE_EVIDENCE_POLICY"
  | "INVALID_EVIDENCE_POLICY"
  | "SELF_SUPERSESSION"
  | "CIRCULAR_SUPERSESSION"
  | "MATERIAL_CHANGE_TO_PUBLISHED_DEFINITION";

export interface CertificateDefinitionValidationIssue {
  code: CertificateDefinitionValidationCode;
  message: string;
  stableId?: string;
  competencyStableId?: string;
  competencyVersion?: number;
  field?: string;
}

export interface CertificateDefinitionValidationResult {
  valid: boolean;
  issues: CertificateDefinitionValidationIssue[];
}

function issue(
  code: CertificateDefinitionValidationCode,
  message: string,
  extra: Omit<CertificateDefinitionValidationIssue, "code" | "message"> = {}
): CertificateDefinitionValidationIssue {
  return { code, message, ...extra };
}

/**
 * Normalises a Certificate Definition stable ID, or returns null when the value
 * does not satisfy the convention. Callers turn null into their own error type
 * so this module stays free of transport and error-shape concerns.
 */
export function normalizeCertificateDefinitionStableId(
  value: string
): string | null {
  const stableId = String(value ?? "").trim().toLowerCase();
  return CERTIFICATE_DEFINITION_STABLE_ID_PATTERN.test(stableId)
    ? stableId
    : null;
}

export function isCertificateDefinitionState(
  value: unknown
): value is CertificateDefinitionState {
  return (
    value === "draft" ||
    value === "review" ||
    value === "published" ||
    value === "retired"
  );
}

export function isValidCertificateDefinitionVersion(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) > 0;
}

/**
 * Declarative expiration policy check. Null is valid and means no expiration.
 * A present value must be an integer month count within 1-600.
 */
export function isValidCertificateExpirationMonths(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (!Number.isInteger(value)) return false;

  const months = value as number;
  return (
    months >= CERTIFICATE_EXPIRATION_MIN_MONTHS &&
    months <= CERTIFICATE_EXPIRATION_MAX_MONTHS
  );
}

/**
 * `verificationPermitted` is a strict boolean declaration. Truthy strings and
 * numbers are rejected so a policy switch can never be set by accident.
 */
export function isValidVerificationPermitted(value: unknown): boolean {
  return typeof value === "boolean";
}

function isParsableTimestamp(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  return !Number.isNaN(Date.parse(value));
}

/**
 * Publication lifecycle, identical to the curriculum rule set so authoring
 * behaves the same way everywhere in the platform.
 */
export function isValidCertificateDefinitionTransition(
  from: CertificateDefinitionState,
  to: CertificateDefinitionState
): boolean {
  if (from === to) return true;
  if (from === "draft" && (to === "review" || to === "retired")) return true;
  if (
    from === "review" &&
    (to === "draft" || to === "published" || to === "retired")
  ) {
    return true;
  }
  if (from === "published" && to === "retired") return true;
  if (from === "retired" && to === "draft") return true;

  return false;
}

export function validateCertificateCompetencyRequirements(
  requirements: readonly CertificateDefinitionCompetencyRequirement[]
): CertificateDefinitionValidationIssue[] {
  const issues: CertificateDefinitionValidationIssue[] = [];
  const seen = new Set<string>();

  for (const requirement of requirements) {
    const stableId = normalizeCertificateDefinitionStableId(
      requirement?.competencyStableId ?? ""
    );

    if (!stableId) {
      issues.push(
        issue(
          "INVALID_COMPETENCY_REFERENCE",
          "Required competency stable ID is not a valid stable identifier.",
          { competencyStableId: requirement?.competencyStableId }
        )
      );
      continue;
    }

    if (!isValidCertificateDefinitionVersion(requirement?.competencyVersion)) {
      issues.push(
        issue(
          "INVALID_COMPETENCY_REFERENCE",
          "Required competency version must be a positive integer. A certificate never resolves a competency to 'latest'.",
          {
            competencyStableId: stableId,
            competencyVersion: requirement?.competencyVersion
          }
        )
      );
      continue;
    }

    if (typeof requirement.required !== "boolean") {
      issues.push(
        issue(
          "INVALID_COMPETENCY_REFERENCE",
          "Required competency flag must be a boolean.",
          { competencyStableId: stableId }
        )
      );
      continue;
    }

    const key = `${stableId}@${requirement.competencyVersion}`;
    if (seen.has(key)) {
      issues.push(
        issue(
          "DUPLICATE_COMPETENCY_REQUIREMENT",
          "The same competency version is required more than once.",
          {
            competencyStableId: stableId,
            competencyVersion: requirement.competencyVersion
          }
        )
      );
      continue;
    }

    seen.add(key);
  }

  return issues;
}

export function validateCertificateEvidencePolicies(
  policies: readonly CertificateDefinitionEvidencePolicy[]
): CertificateDefinitionValidationIssue[] {
  const issues: CertificateDefinitionValidationIssue[] = [];
  const seen = new Set<string>();

  for (const policy of policies) {
    const sourceType = policy?.evidenceSourceType;

    if (
      sourceType !== "assessment_attempt" &&
      sourceType !== "lab_validation" &&
      sourceType !== "manual_authoritative" &&
      sourceType !== "system_authoritative"
    ) {
      issues.push(
        issue(
          "INVALID_EVIDENCE_POLICY",
          "Evidence policy source type is not a supported canonical Evidence source type."
        )
      );
      continue;
    }

    if (
      !Number.isInteger(policy?.minimumCount) ||
      policy.minimumCount < CERTIFICATE_EVIDENCE_POLICY_MIN_COUNT ||
      policy.minimumCount > CERTIFICATE_EVIDENCE_POLICY_MAX_COUNT
    ) {
      issues.push(
        issue(
          "INVALID_EVIDENCE_POLICY",
          `Evidence policy minimum count must be an integer between ${CERTIFICATE_EVIDENCE_POLICY_MIN_COUNT} and ${CERTIFICATE_EVIDENCE_POLICY_MAX_COUNT}.`
        )
      );
      continue;
    }

    if (typeof policy.requirePositiveOutcome !== "boolean") {
      issues.push(
        issue(
          "INVALID_EVIDENCE_POLICY",
          "Evidence policy positive-outcome requirement must be a boolean."
        )
      );
      continue;
    }

    if (seen.has(sourceType)) {
      issues.push(
        issue(
          "DUPLICATE_EVIDENCE_POLICY",
          "The same Evidence source type carries more than one policy."
        )
      );
      continue;
    }

    seen.add(sourceType);
  }

  return issues;
}

/**
 * Shape validation for authoring input. This proves the definition is
 * internally well-formed. It cannot prove that referenced competencies exist or
 * are publishable — that requires the database, and lives in
 * `validateCertificateDefinitionForPublication` in the API service.
 */
export function validateCreateCertificateDefinitionInput(
  input: CreateCertificateDefinitionInput
): CertificateDefinitionValidationResult {
  const issues: CertificateDefinitionValidationIssue[] = [];

  const stableId = normalizeCertificateDefinitionStableId(input?.stableId ?? "");
  if (!stableId) {
    issues.push(
      issue(
        "INVALID_STABLE_ID",
        "Certificate Definition stable ID must be 3-120 lowercase characters using letters, numbers, dot, underscore, or hyphen.",
        { field: "stableId" }
      )
    );
  }

  if (!String(input?.title ?? "").trim()) {
    issues.push(
      issue("MISSING_TITLE", "Certificate title is required.", {
        field: "title"
      })
    );
  }

  if (!String(input?.issuer ?? "").trim()) {
    issues.push(
      issue("MISSING_ISSUER", "Certificate issuer is required.", {
        field: "issuer"
      })
    );
  }

  if (!String(input?.presentation?.plainLanguageTitle ?? "").trim()) {
    issues.push(
      issue(
        "MISSING_PLAIN_LANGUAGE_TITLE",
        "An accessible plain-language title is required.",
        { field: "presentation.plainLanguageTitle" }
      )
    );
  }

  if (!isParsableTimestamp(input?.effectiveAt)) {
    issues.push(
      issue(
        "INVALID_EFFECTIVE_AT",
        "Effective date must be a parseable timestamp.",
        { field: "effectiveAt" }
      )
    );
  }

  if (!isValidCertificateExpirationMonths(input?.expirationMonths)) {
    issues.push(
      issue(
        "INVALID_EXPIRATION_MONTHS",
        `Expiration months must be null (no expiration) or an integer between ${CERTIFICATE_EXPIRATION_MIN_MONTHS} and ${CERTIFICATE_EXPIRATION_MAX_MONTHS}.`,
        { field: "expirationMonths" }
      )
    );
  }

  if (
    input?.verificationPermitted !== undefined &&
    !isValidVerificationPermitted(input.verificationPermitted)
  ) {
    issues.push(
      issue(
        "INVALID_VERIFICATION_PERMITTED",
        "Verification permitted must be a boolean policy declaration.",
        { field: "verificationPermitted" }
      )
    );
  }

  issues.push(
    ...validateCertificateCompetencyRequirements(
      input?.requiredCompetencies ?? []
    )
  );
  issues.push(
    ...validateCertificateEvidencePolicies(input?.evidencePolicies ?? [])
  );

  return { valid: issues.length === 0, issues };
}

/**
 * Publication readiness that can be judged without the database.
 *
 * A certificate that requires nothing would certify nothing, so at least one
 * required competency is mandatory before publication. Everything else that
 * blocks publication — unresolvable competency versions, unpublished
 * competencies — needs a database lookup and is enforced in the API service.
 */
export function validateCertificateDefinitionForPublicationShape(
  definition: Pick<
    CertificateDefinition,
    | "stableId"
    | "version"
    | "title"
    | "issuer"
    | "effectiveAt"
    | "expirationMonths"
    | "verificationPermitted"
    | "presentation"
    | "requiredCompetencies"
    | "evidencePolicies"
  >
): CertificateDefinitionValidationResult {
  const result = validateCreateCertificateDefinitionInput({
    stableId: definition.stableId,
    title: definition.title,
    issuer: definition.issuer,
    effectiveAt: definition.effectiveAt,
    expirationMonths: definition.expirationMonths,
    verificationPermitted: definition.verificationPermitted,
    presentation: definition.presentation,
    requiredCompetencies: definition.requiredCompetencies,
    evidencePolicies: definition.evidencePolicies
  });

  const issues = [...result.issues];

  if (!isValidCertificateDefinitionVersion(definition.version)) {
    issues.push(
      issue("INVALID_VERSION", "Version must be a positive integer.", {
        field: "version"
      })
    );
  }

  const required = (definition.requiredCompetencies ?? []).filter(
    (requirement) => requirement?.required === true
  );

  if (required.length === 0) {
    issues.push(
      issue(
        "MISSING_REQUIRED_COMPETENCY",
        "A Certificate Definition must require at least one competency before publication.",
        { stableId: definition.stableId }
      )
    );
  }

  return { valid: issues.length === 0, issues };
}

function sortedCompetencyKeys(
  requirements: readonly CertificateDefinitionCompetencyRequirement[]
): string[] {
  return (requirements ?? [])
    .map(
      (requirement) =>
        `${String(requirement?.competencyStableId ?? "").toLowerCase()}@${
          requirement?.competencyVersion
        }:${requirement?.required === true ? "required" : "optional"}`
    )
    .sort();
}

function sortedEvidenceKeys(
  policies: readonly CertificateDefinitionEvidencePolicy[]
): string[] {
  return (policies ?? [])
    .map(
      (policy) =>
        `${policy?.evidenceSourceType}:${policy?.minimumCount}:${
          policy?.requirePositiveOutcome === true ? "positive" : "any"
        }`
    )
    .sort();
}

function sameStringList(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  );
}

/**
 * Returns the material fields that differ between two definition snapshots.
 *
 * An empty array means the change is presentational and may be applied to a
 * published version. A non-empty array means a new version is required.
 */
export function detectCertificateDefinitionMaterialChanges(
  current: CertificateDefinition,
  proposed: Partial<CertificateDefinition>
): CertificateDefinitionMaterialField[] {
  const changed: CertificateDefinitionMaterialField[] = [];

  if (
    proposed.stableId !== undefined &&
    proposed.stableId !== current.stableId
  ) {
    changed.push("stableId");
  }
  if (proposed.version !== undefined && proposed.version !== current.version) {
    changed.push("version");
  }
  if (proposed.issuer !== undefined && proposed.issuer !== current.issuer) {
    changed.push("issuer");
  }
  if (
    proposed.effectiveAt !== undefined &&
    proposed.effectiveAt !== current.effectiveAt
  ) {
    changed.push("effectiveAt");
  }
  if (
    proposed.expirationMonths !== undefined &&
    proposed.expirationMonths !== current.expirationMonths
  ) {
    changed.push("expirationMonths");
  }
  if (
    proposed.verificationPermitted !== undefined &&
    proposed.verificationPermitted !== current.verificationPermitted
  ) {
    changed.push("verificationPermitted");
  }
  if (
    proposed.requiredCompetencies !== undefined &&
    !sameStringList(
      sortedCompetencyKeys(current.requiredCompetencies),
      sortedCompetencyKeys(proposed.requiredCompetencies)
    )
  ) {
    changed.push("requiredCompetencies");
  }
  if (
    proposed.evidencePolicies !== undefined &&
    !sameStringList(
      sortedEvidenceKeys(current.evidencePolicies),
      sortedEvidenceKeys(proposed.evidencePolicies)
    )
  ) {
    changed.push("evidencePolicies");
  }

  return changed;
}

/**
 * A published Certificate Definition version is materially immutable, so that a
 * certificate already issued against it cannot have its meaning rewritten.
 */
export function evaluateCertificateDefinitionEdit(
  current: CertificateDefinition,
  proposed: Partial<CertificateDefinition>
): CertificateDefinitionValidationResult {
  if (current.publicationState !== "published") {
    return { valid: true, issues: [] };
  }

  const changed = detectCertificateDefinitionMaterialChanges(current, proposed);

  if (changed.length === 0) {
    return { valid: true, issues: [] };
  }

  return {
    valid: false,
    issues: changed.map((field) =>
      issue(
        "MATERIAL_CHANGE_TO_PUBLISHED_DEFINITION",
        `Published Certificate Definition versions are materially immutable. Changing '${field}' requires a new definition version.`,
        { stableId: current.stableId, field }
      )
    )
  };
}

/**
 * Supersession, CERT-001 section 13: an older definition may be superseded
 * without deleting history.
 *
 * `existingLinks` maps a definition id to the definition id it is already
 * superseded by. Walking it forward from the proposed successor detects a cycle
 * before it can be written. There are no prerequisite certificates in this
 * model, so this is the only certificate-to-certificate relationship.
 */
export function validateCertificateDefinitionSupersession(
  definitionId: string,
  supersededByDefinitionId: string,
  existingLinks: ReadonlyMap<string, string | null> = new Map()
): CertificateDefinitionValidationResult {
  if (definitionId === supersededByDefinitionId) {
    return {
      valid: false,
      issues: [
        issue(
          "SELF_SUPERSESSION",
          "A Certificate Definition cannot supersede itself."
        )
      ]
    };
  }

  const visited = new Set<string>([definitionId]);
  let cursor: string | null | undefined = supersededByDefinitionId;

  while (cursor) {
    if (visited.has(cursor)) {
      return {
        valid: false,
        issues: [
          issue(
            "CIRCULAR_SUPERSESSION",
            "Superseding this Certificate Definition would create a supersession cycle."
          )
        ]
      };
    }

    visited.add(cursor);
    cursor = existingLinks.get(cursor) ?? null;
  }

  return { valid: true, issues: [] };
}
