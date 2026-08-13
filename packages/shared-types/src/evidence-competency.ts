import type { EvidenceMetadata, EvidenceRecord } from "./evidence";
import { validateEvidenceMetadata } from "./evidence";
import type { CurriculumPublicationState } from "./curriculum";

/**
 * Wave 7 / Batch 2 — EVID-003 Competency Evidence Linking.
 *
 * A link records that a canonical Evidence Record is approved proof relevant to
 * an exact historical competency definition. A link is NOT a mastery decision:
 * the Learning / Competency Engine remains authoritative for state transitions.
 *
 * Version terminology follows the canonical curriculum model:
 * `public.competencies` is keyed by `(stable_id, version)`, so a link preserves
 * `competencyStableId` + `competencyVersion` (mirroring `competencies.version`)
 * and pins the exact definition row through `competencyId`.
 * The Learning Engine's own `curriculum_version` column remains a separate
 * concept and is not redefined here.
 */

export type EvidenceCompetencyRelationship = "required" | "supporting";

export const EVIDENCE_COMPETENCY_RELATIONSHIPS: readonly EvidenceCompetencyRelationship[] =
  ["required", "supporting"];

/**
 * Provenance of the mapping itself. Every value denotes an approved,
 * human- or configuration-governed origin. There is deliberately no AI value:
 * AI may explain a mapping, never author one.
 */
export type EvidenceCompetencyLinkSource =
  | "source_engine_mapping"
  | "approved_curriculum_mapping"
  | "authoritative_manual_mapping";

export const EVIDENCE_COMPETENCY_LINK_SOURCES: readonly EvidenceCompetencyLinkSource[] =
  [
    "source_engine_mapping",
    "approved_curriculum_mapping",
    "authoritative_manual_mapping"
  ];

/** Matches the curriculum stable-ID convention used by curriculum authoring. */
const COMPETENCY_STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,119}$/;

export interface EvidenceCompetencyLink {
  id: string;
  evidenceId: string;
  userId: string;
  /** The exact `public.competencies` row this link was approved against. */
  competencyId: string;
  competencyStableId: string;
  /** Mirrors `public.competencies.version`. */
  competencyVersion: number;
  relationship: EvidenceCompetencyRelationship;
  linkSource: EvidenceCompetencyLinkSource;
  linkedAt: string;
  metadata: EvidenceMetadata;
}

/**
 * Trusted server-side intake. There is no field through which a caller can
 * assert mastery, advancement, prerequisite satisfaction or certificate
 * eligibility.
 */
export interface CreateEvidenceCompetencyLinkInput {
  evidenceId: string;
  /** Asserted by the caller and verified against the Evidence owner. */
  userId: string;
  competencyStableId: string;
  competencyVersion: number;
  relationship: EvidenceCompetencyRelationship;
  linkSource: EvidenceCompetencyLinkSource;
  metadata?: EvidenceMetadata;
}

/** The competency definition a link points at, as currently stored. */
export interface CompetencyDefinitionReference {
  id: string;
  stableId: string;
  version: number;
  title: string;
  description?: string;
  publicationState: CurriculumPublicationState;
}

/**
 * How a preserved historical reference relates to the current curriculum.
 * Computed at read time; never stored, and never used to rewrite a link.
 */
export type CompetencyReferenceState =
  | "current"
  | "superseded_version"
  | "retired"
  | "missing";

/**
 * Safe student-facing projection. Carries plain-language competency information
 * rather than opaque identifiers alone (EVID-003 accessibility), and no
 * ownership, service-role or infrastructure detail.
 */
export interface StudentEvidenceCompetencyLink {
  id: string;
  evidenceId: string;
  competencyStableId: string;
  competencyVersion: number;
  competencyTitle?: string;
  competencyDescription?: string;
  competencyReferenceState: CompetencyReferenceState;
  relationship: EvidenceCompetencyRelationship;
  linkSource: EvidenceCompetencyLinkSource;
  linkSourceDescription: string;
  linkedAt: string;
}

/**
 * Read-only contract handed to the Learning / Competency Engine. It reports
 * approved proof; it never asks for a transition.
 */
export interface AuthoritativeCompetencyEvidenceReference {
  evidenceId: string;
  competencyStableId: string;
  competencyVersion: number;
  relationship: EvidenceCompetencyRelationship;
  linkSource: EvidenceCompetencyLinkSource;
  linkedAt: string;
  evidenceSourceType: EvidenceRecord["sourceType"];
  evidenceSourceEngine: EvidenceRecord["sourceEngine"];
  evidenceSourceReference: string;
  evidenceSourceOccurredAt: string;
}

export interface EvidenceCompetencyValidationResult {
  valid: boolean;
  errors: string[];
}

export function isEvidenceCompetencyRelationship(
  value: unknown
): value is EvidenceCompetencyRelationship {
  return (
    typeof value === "string" &&
    (EVIDENCE_COMPETENCY_RELATIONSHIPS as readonly string[]).includes(value)
  );
}

export function isEvidenceCompetencyLinkSource(
  value: unknown
): value is EvidenceCompetencyLinkSource {
  return (
    typeof value === "string" &&
    (EVIDENCE_COMPETENCY_LINK_SOURCES as readonly string[]).includes(value)
  );
}

export function isCompetencyStableId(value: unknown): boolean {
  return typeof value === "string" && COMPETENCY_STABLE_ID_PATTERN.test(value);
}

export function isCompetencyVersion(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateCreateEvidenceCompetencyLinkInput(
  input: CreateEvidenceCompetencyLinkInput
): EvidenceCompetencyValidationResult {
  const errors: string[] = [];

  if (typeof input.evidenceId !== "string" || input.evidenceId.trim() === "") {
    errors.push("evidenceId is required");
  }

  if (typeof input.userId !== "string" || input.userId.trim() === "") {
    errors.push("userId is required");
  }

  if (!isCompetencyStableId(input.competencyStableId)) {
    errors.push("competencyStableId must be a valid curriculum stable identifier");
  }

  if (!isCompetencyVersion(input.competencyVersion)) {
    errors.push("competencyVersion must be a positive integer");
  }

  if (!isEvidenceCompetencyRelationship(input.relationship)) {
    errors.push("relationship must be an approved Evidence competency relationship");
  }

  if (!isEvidenceCompetencyLinkSource(input.linkSource)) {
    errors.push("linkSource must be an approved trusted mapping source");
  }

  errors.push(...validateEvidenceMetadata(input.metadata).errors);

  return { valid: errors.length === 0, errors };
}

export type EvidenceLinkEligibilityReason =
  | "EVIDENCE_STATE_NOT_ACTIVE"
  | "EVIDENCE_INTEGRITY_NOT_VERIFIED";

export type EvidenceLinkEligibilityDecision =
  | { eligible: true }
  | { eligible: false; reason: EvidenceLinkEligibilityReason };

/**
 * Only currently usable canonical Evidence may become trusted competency proof.
 * Fails closed: anything other than active + verified is rejected, which covers
 * invalidated, superseded, unverified and mismatch.
 */
export function evaluateEvidenceLinkEligibility(
  record: Pick<EvidenceRecord, "state" | "integrityState">
): EvidenceLinkEligibilityDecision {
  if (record.state !== "active") {
    return { eligible: false, reason: "EVIDENCE_STATE_NOT_ACTIVE" };
  }

  if (record.integrityState !== "verified") {
    return { eligible: false, reason: "EVIDENCE_INTEGRITY_NOT_VERIFIED" };
  }

  return { eligible: true };
}

export type EvidenceCompetencyLinkConflictReason =
  | "link_source_mismatch"
  | "competency_definition_mismatch"
  | "owner_mismatch";

export type EvidenceCompetencyLinkDecision =
  | { kind: "match" }
  | { kind: "conflict"; reason: EvidenceCompetencyLinkConflictReason };

/**
 * Decides whether a repeated mapping request is the same trusted link or a
 * material conflict.
 *
 * Logical identity is (evidenceId, competencyStableId, competencyVersion,
 * relationship). Metadata is descriptive and never makes two mappings differ.
 * A divergent trusted mapping source, competency row, or owner is a conflict:
 * history is never silently rewritten. Corrections belong to EVID-006.
 */
export function evaluateExistingEvidenceCompetencyLink(
  existing: EvidenceCompetencyLink,
  candidate: {
    userId: string;
    competencyId: string;
    linkSource: EvidenceCompetencyLinkSource;
  }
): EvidenceCompetencyLinkDecision {
  if (existing.userId !== candidate.userId) {
    return { kind: "conflict", reason: "owner_mismatch" };
  }

  if (existing.competencyId !== candidate.competencyId) {
    return { kind: "conflict", reason: "competency_definition_mismatch" };
  }

  if (existing.linkSource !== candidate.linkSource) {
    return { kind: "conflict", reason: "link_source_mismatch" };
  }

  return { kind: "match" };
}

/**
 * Classifies a preserved historical competency reference against the current
 * curriculum. A superseded or retired definition never causes the stored link
 * to be remapped to the newest version; it only informs the reader.
 */
export function classifyCompetencyReference(input: {
  linkedVersion: number;
  definition: Pick<
    CompetencyDefinitionReference,
    "version" | "publicationState"
  > | null;
  latestPublishedVersion: number | null;
}): CompetencyReferenceState {
  if (!input.definition) {
    return "missing";
  }

  if (input.definition.publicationState === "retired") {
    return "retired";
  }

  if (
    typeof input.latestPublishedVersion === "number" &&
    input.latestPublishedVersion > input.linkedVersion
  ) {
    return "superseded_version";
  }

  return "current";
}

/** Plain-language, non-sensitive description of a trusted mapping source. */
export function describeEvidenceCompetencyLinkSource(
  linkSource: EvidenceCompetencyLinkSource
): string {
  switch (linkSource) {
    case "source_engine_mapping":
      return "Mapped by the approved configuration of the source engine that produced this evidence.";
    case "approved_curriculum_mapping":
      return "Mapped by the approved curriculum definition for this competency.";
    case "authoritative_manual_mapping":
      return "Mapped by an authorized reviewer through an approved manual process.";
    default:
      return "Mapped by an approved trusted process.";
  }
}

export function toStudentEvidenceCompetencyLink(
  link: EvidenceCompetencyLink,
  definition: CompetencyDefinitionReference | null,
  latestPublishedVersion: number | null = null
): StudentEvidenceCompetencyLink {
  const referenceState = classifyCompetencyReference({
    linkedVersion: link.competencyVersion,
    definition,
    latestPublishedVersion
  });

  return {
    id: link.id,
    evidenceId: link.evidenceId,
    competencyStableId: link.competencyStableId,
    competencyVersion: link.competencyVersion,
    ...(definition?.title ? { competencyTitle: definition.title } : {}),
    ...(definition?.description
      ? { competencyDescription: definition.description }
      : {}),
    competencyReferenceState: referenceState,
    relationship: link.relationship,
    linkSource: link.linkSource,
    linkSourceDescription: describeEvidenceCompetencyLinkSource(link.linkSource),
    linkedAt: link.linkedAt
  };
}
