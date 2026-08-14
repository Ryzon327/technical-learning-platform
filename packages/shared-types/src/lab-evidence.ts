import type { EvidenceMetadata } from "./evidence";
import { validateEvidenceMetadata } from "./evidence";
import type { EvidenceCompetencyRelationship } from "./evidence-competency";
import type {
  LabValidationCheckResult,
  LabValidationRunState
} from "./lab-runtime";

/**
 * Wave 7 / Batch 4 — EVID-004 Lab Validation Evidence.
 *
 * Records deterministic Lab Engine validation outcomes as canonical Evidence.
 * This module is pure: it decides eligibility, builds the deterministic
 * upstream integrity string and shapes bounded metadata. It performs no I/O,
 * holds no validation authority and contains no AI.
 *
 * The Lab Engine remains authoritative for whether a lab passed. Evidence
 * records the result; it never re-evaluates a probe or reinterprets a check.
 */

/** Version prefix for the Lab source integrity string. */
export const LAB_VALIDATION_CANONICAL_VERSION = "lab-validation-v1";

/** Stable source reference prefix, matching the repository's convention. */
export const LAB_VALIDATION_SOURCE_REFERENCE_PREFIX = "lab-validation-run:";

export function buildLabValidationSourceReference(validationRunId: string): string {
  return `${LAB_VALIDATION_SOURCE_REFERENCE_PREFIX}${validationRunId}`;
}

/**
 * Why an authoritative validation run did or did not become canonical Evidence.
 * Every skip is a normal outcome, never an error.
 */
export type LabEvidenceSkipReason =
  | "validation_technical_error"
  | "validation_run_not_found"
  | "lab_definition_not_found";

export type LabEvidenceConsumptionState = "consumed" | "skipped" | "failed";

export interface LabEvidenceSourceFacts {
  validationRunId: string;
  labSessionId: string;
  userId: string;
  profileStableId: string;
  labDefinitionStableId: string;
  labDefinitionVersion: number;
  labName: string;
  missionStableId: string;
  runState: LabValidationRunState;
  checkedAt: string;
  results: LabValidationCheckResult[];
  /**
   * Digest of the frozen competency mapping authority that was in force when
   * this validation became authoritative. Binding it into the source integrity
   * string means a later curriculum change cannot silently alter the proof.
   */
  mappingAuthorityDigest: string;
}

/**
 * An approved Lab competency mapping, carrying the exact competency definition
 * version it was resolved against.
 */
export interface LabEvidenceCompetencyMapping {
  competencyStableId: string;
  competencyVersion: number;
  required: boolean;
}

/** Version prefix for the frozen mapping authority string. */
export const LAB_MAPPING_AUTHORITY_CANONICAL_VERSION = "lab-mapping-v1";

/**
 * The approved competency mapping in force when a validation run became
 * authoritative.
 *
 * Lab Definitions reference their mission by stable id only, so the applicable
 * mission version must be resolved once — at validation time — and then frozen.
 * Resolving it again at ingestion time would let a curriculum publication that
 * happened after the lab was performed change the resulting competency links.
 */
export interface LabEvidenceMappingAuthority {
  missionStableId: string;
  /** The exact mission version whose approved mapping was captured. */
  missionVersion: number | null;
  missionId: string | null;
  mappings: LabEvidenceCompetencyMapping[];
  /** Declared competencies with no approved, version-bearing mapping. */
  unresolvedCompetencyStableIds: string[];
}

/**
 * Deterministic canonical string for a frozen mapping authority.
 *
 * Mappings are sorted by competency stable id and version so row order cannot
 * change the digest, and no JSON serialisation is hashed.
 */
export function buildLabMappingAuthorityCanonicalString(
  authority: LabEvidenceMappingAuthority
): string {
  const mappings = [...authority.mappings]
    .sort((a, b) => {
      if (a.competencyStableId !== b.competencyStableId) {
        return a.competencyStableId < b.competencyStableId ? -1 : 1;
      }
      return a.competencyVersion - b.competencyVersion;
    })
    .map(
      (mapping) =>
        `${mapping.competencyStableId}@${mapping.competencyVersion}:${
          mapping.required ? "1" : "0"
        }`
    )
    .join(";");

  const unresolved = [...authority.unresolvedCompetencyStableIds]
    .sort()
    .join(",");

  return [
    LAB_MAPPING_AUTHORITY_CANONICAL_VERSION,
    authority.missionStableId,
    authority.missionVersion === null ? "-" : String(authority.missionVersion),
    mappings,
    unresolved
  ].join("|");
}

export interface LabMappingAuthorityResolution {
  authority: LabEvidenceMappingAuthority;
  /**
   * True when no frozen authority existed and one had to be captured after the
   * validation run. Recorded so the audit trail never implies a snapshot was
   * taken at validation time when it was not.
   */
  capturedLate: boolean;
}

/**
 * The frozen mapping authority always wins.
 *
 * A snapshot captured when the validation became authoritative is the mapping
 * that was in force for that lab execution. The currently published curriculum
 * is used only when no snapshot exists at all, and that case is reported.
 */
export function resolveMappingAuthority(input: {
  frozen: LabEvidenceMappingAuthority | null;
  current: LabEvidenceMappingAuthority;
}): LabMappingAuthorityResolution {
  if (input.frozen) {
    return { authority: input.frozen, capturedLate: false };
  }
  return { authority: input.current, capturedLate: true };
}

export type LabEvidenceEligibilityDecision =
  | { eligible: true }
  | { eligible: false; reason: LabEvidenceSkipReason };

/**
 * Decides whether an authoritative validation run may become canonical
 * Evidence.
 *
 * Uses the canonical Lab run states and invents none:
 *
 *   passed          -> eligible; every required check passed deterministically
 *   incomplete      -> eligible; every check was evaluated deterministically and
 *                      at least one required check did not pass. This is a
 *                      genuine student result, not a validator problem.
 *   technical_error -> NOT eligible. The validator could not complete a check,
 *                      so there is no authoritative student outcome to record.
 *                      A validator outage must never become student Evidence.
 *
 * Fails closed: anything unrecognised is treated as a technical error.
 */
export function evaluateLabEvidenceEligibility(
  runState: LabValidationRunState
): LabEvidenceEligibilityDecision {
  if (runState === "passed" || runState === "incomplete") {
    return { eligible: true };
  }
  return { eligible: false, reason: "validation_technical_error" };
}

/**
 * True when a run state represents an authoritative deterministic student
 * outcome rather than a validator/provider problem.
 */
export function isAuthoritativeLabOutcome(
  runState: LabValidationRunState
): boolean {
  return evaluateLabEvidenceEligibility(runState).eligible;
}

function checkLine(result: LabValidationCheckResult): string {
  const passed =
    result.passed === true ? "1" : result.passed === false ? "0" : "-";
  return [
    result.checkStableId,
    result.required ? "1" : "0",
    result.state,
    passed
  ].join(":");
}

/**
 * Deterministic canonical string for the Lab source integrity digest.
 *
 * Built from an explicit ordered field list, with checks sorted by their stable
 * id. Object key iteration and JSON serialisation are never hashed, so the
 * digest cannot drift because of incidental property or row ordering.
 *
 * It represents authoritative upstream facts only: which run, whose session,
 * which profile and definition version, the run state, when it was checked,
 * each check's deterministic outcome, and the digest of the competency mapping
 * authority frozen at validation time. No explanation text, probe identifier or
 * validator internal is included.
 *
 * This is the SOURCE integrity proof. The Evidence Engine's own acceptance
 * proof remains the separate evidence_integrity_digest computed by Batch 1.
 */
export function buildLabValidationCanonicalString(
  facts: LabEvidenceSourceFacts
): string {
  const checks = [...facts.results]
    .sort((a, b) => (a.checkStableId < b.checkStableId ? -1 : a.checkStableId > b.checkStableId ? 1 : 0))
    .map(checkLine)
    .join(";");

  return [
    LAB_VALIDATION_CANONICAL_VERSION,
    facts.validationRunId,
    facts.labSessionId,
    facts.userId,
    facts.profileStableId,
    facts.labDefinitionStableId,
    String(facts.labDefinitionVersion),
    facts.runState,
    new Date(Date.parse(facts.checkedAt)).toISOString(),
    checks,
    facts.mappingAuthorityDigest
  ].join("|");
}

/** Approved mappings become Evidence competency links. */
export function toLabEvidenceRelationship(
  required: boolean
): EvidenceCompetencyRelationship {
  return required === true ? "required" : "supporting";
}

/**
 * Bounded, student-safe Evidence metadata for a validation run.
 *
 * Carries understandable proof, never infrastructure: no provider identifiers,
 * no container or runtime internals, no endpoints, no probe identifiers and no
 * check explanations. `resultState` holds the canonical run state so the
 * Batch 2/3 outcome model can classify it.
 */
export function buildLabEvidenceMetadata(
  facts: LabEvidenceSourceFacts
): EvidenceMetadata {
  const requiredChecks = facts.results.filter((result) => result.required);
  const passedRequired = requiredChecks.filter(
    (result) => result.state === "passed"
  );

  return {
    labDefinitionStableId: facts.labDefinitionStableId,
    labDefinitionVersion: facts.labDefinitionVersion,
    labName: facts.labName,
    missionStableId: facts.missionStableId,
    validationProfileStableId: facts.profileStableId,
    validationRunId: facts.validationRunId,
    resultState: facts.runState,
    requiredCheckCount: requiredChecks.length,
    passedRequiredCheckCount: passedRequired.length
  };
}

/** Metadata keys that would leak validator or infrastructure internals. */
const FORBIDDEN_LAB_METADATA_KEYS = [
  "probeId",
  "probe_id",
  "explanation",
  "endpoint",
  "username",
  "providerSessionId",
  "providerId",
  "containerId",
  "dockerImage",
  "connectionMetadata"
];

export function validateLabEvidenceMetadata(
  metadata: EvidenceMetadata
): { valid: boolean; errors: string[] } {
  const base = validateEvidenceMetadata(metadata);
  const errors = [...base.errors];

  if (
    metadata.resultState !== "passed" &&
    metadata.resultState !== "incomplete"
  ) {
    errors.push(
      "lab Evidence metadata must record an authoritative validation run state"
    );
  }

  for (const forbidden of FORBIDDEN_LAB_METADATA_KEYS) {
    if (forbidden in metadata) {
      errors.push(`lab Evidence metadata must not contain ${forbidden}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface LabEvidenceConsumptionResult {
  validationRunId: string;
  state: LabEvidenceConsumptionState;
  evidenceId?: string;
  linkedCompetencyCount: number;
  unresolvedCompetencyCount: number;
  /** Mission version whose approved mapping was frozen for this run. */
  missionVersion?: number | null;
  /** True when the mapping snapshot had to be captured after validation. */
  mappingCapturedLate?: boolean;
  skipReason?: LabEvidenceSkipReason;
  failureCode?: string;
}
