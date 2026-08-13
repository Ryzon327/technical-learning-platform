export type EvidenceSourceType =
  | "assessment_attempt"
  | "lab_validation"
  | "manual_authoritative"
  | "system_authoritative";

export const EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  "assessment_attempt",
  "lab_validation",
  "manual_authoritative",
  "system_authoritative"
];

export type EvidenceSourceEngine =
  | "assessment"
  | "lab"
  | "competency"
  | "platform";

export const EVIDENCE_SOURCE_ENGINES: readonly EvidenceSourceEngine[] = [
  "assessment",
  "lab",
  "competency",
  "platform"
];

export type EvidenceRecordState = "active" | "invalidated" | "superseded";

export const EVIDENCE_RECORD_STATES: readonly EvidenceRecordState[] = [
  "active",
  "invalidated",
  "superseded"
];

export type EvidenceIntegrityState = "verified" | "unverified" | "mismatch";

export const EVIDENCE_INTEGRITY_STATES: readonly EvidenceIntegrityState[] = [
  "verified",
  "unverified",
  "mismatch"
];

/** SHA-256 is the current canonical Evidence integrity algorithm. */
export type EvidenceIntegrityAlgorithm = "sha256";

export const EVIDENCE_INTEGRITY_ALGORITHM: EvidenceIntegrityAlgorithm = "sha256";

/** Canonical string version prefix. Changing it changes every Evidence digest. */
export const EVIDENCE_CANONICAL_VERSION = "evidence-v1";

export const EVIDENCE_METADATA_MAX_KEYS = 20;
export const EVIDENCE_METADATA_MAX_KEY_LENGTH = 64;
export const EVIDENCE_METADATA_MAX_VALUE_LENGTH = 512;

/**
 * Metadata is deliberately bounded and structured. Canonical Evidence is
 * student-visible durable proof, so it never carries secrets, provider
 * credentials, infrastructure credentials or sensitive runtime identifiers.
 */
export type EvidenceMetadataValue = string | number | boolean | null;

export interface EvidenceMetadata {
  [key: string]: EvidenceMetadataValue;
}

/** Metadata keys that must never appear in Canonical Evidence. */
const FORBIDDEN_METADATA_KEY_PATTERN =
  /(secret|token|password|passphrase|credential|api[-_]?key|service[-_]?role|private[-_]?key|authorization|connection[-_]?string|docker|socket|ssh[-_]?key|access[-_]?key|bearer)/i;

/**
 * Canonical Evidence Record.
 *
 * `integrityDigest` is the Evidence Engine's own acceptance digest
 * (`evidence_integrity_digest`). `sourceIntegrityDigest` is the upstream
 * source-engine proof (`source_integrity_digest`), for example an assessment
 * `result_digest`. The two are never conflated: the Evidence digest proves what
 * Evidence was accepted, not what the source engine decided.
 */
export interface EvidenceRecord {
  id: string;
  userId: string;
  sourceType: EvidenceSourceType;
  sourceReference: string;
  sourceEngine: EvidenceSourceEngine;
  sourceOccurredAt: string;
  recordedAt: string;
  state: EvidenceRecordState;
  integrityState: EvidenceIntegrityState;
  integrityAlgorithm: EvidenceIntegrityAlgorithm;
  integrityDigest: string;
  sourceIntegrityDigest: string;
  metadata: EvidenceMetadata;
}

export interface EvidenceProvenance {
  sourceType: EvidenceSourceType;
  sourceReference: string;
  sourceEngine: EvidenceSourceEngine;
  sourceOccurredAt: string;
  recordedAt: string;
  integrityAlgorithm: EvidenceIntegrityAlgorithm;
  integrityDigest: string;
  sourceIntegrityDigest: string;
  integrityState: EvidenceIntegrityState;
}

/**
 * Trusted server-side intake shape. There is deliberately no field through
 * which a caller can assert competency demonstration, eligibility, or Evidence
 * state: the Evidence Engine stores proof, the Learning Engine owns progress.
 */
export interface CreateCanonicalEvidenceInput {
  userId: string;
  sourceType: EvidenceSourceType;
  sourceReference: string;
  sourceEngine: EvidenceSourceEngine;
  sourceOccurredAt: string;
  sourceIntegrityDigest: string;
  metadata?: EvidenceMetadata;
}

/** Fields the canonical Evidence digest is computed over. */
export interface EvidenceCanonicalDigestInput {
  userId: string;
  sourceType: EvidenceSourceType;
  sourceReference: string;
  sourceEngine: EvidenceSourceEngine;
  sourceOccurredAt: string;
  sourceIntegrityDigest: string;
}

/** Safe student-facing projection. Never carries internals or digests. */
export interface StudentEvidenceRecord {
  id: string;
  sourceType: EvidenceSourceType;
  sourceReference: string;
  sourceEngine: EvidenceSourceEngine;
  sourceOccurredAt: string;
  recordedAt: string;
  state: EvidenceRecordState;
  integrityState: EvidenceIntegrityState;
  metadata: EvidenceMetadata;
}

export interface EvidenceValidationResult {
  valid: boolean;
  errors: string[];
}

export function isEvidenceSourceType(value: unknown): value is EvidenceSourceType {
  return (
    typeof value === "string" &&
    (EVIDENCE_SOURCE_TYPES as readonly string[]).includes(value)
  );
}

export function isEvidenceSourceEngine(
  value: unknown
): value is EvidenceSourceEngine {
  return (
    typeof value === "string" &&
    (EVIDENCE_SOURCE_ENGINES as readonly string[]).includes(value)
  );
}

export function isEvidenceRecordState(value: unknown): value is EvidenceRecordState {
  return (
    typeof value === "string" &&
    (EVIDENCE_RECORD_STATES as readonly string[]).includes(value)
  );
}

export function isEvidenceIntegrityState(
  value: unknown
): value is EvidenceIntegrityState {
  return (
    typeof value === "string" &&
    (EVIDENCE_INTEGRITY_STATES as readonly string[]).includes(value)
  );
}

/** Lowercase hex SHA-256 digest. */
export function isSha256Digest(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isIsoTimestamp(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

export function normalizeEvidenceTimestamp(value: string): string {
  return new Date(Date.parse(value)).toISOString();
}

export function validateEvidenceMetadata(
  metadata: unknown
): EvidenceValidationResult {
  const errors: string[] = [];

  if (metadata === undefined) {
    return { valid: true, errors };
  }

  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return { valid: false, errors: ["metadata must be a structured object"] };
  }

  const entries = Object.entries(metadata as Record<string, unknown>);

  if (entries.length > EVIDENCE_METADATA_MAX_KEYS) {
    errors.push(
      `metadata must contain at most ${EVIDENCE_METADATA_MAX_KEYS} keys`
    );
  }

  for (const [key, value] of entries) {
    if (key.trim() === "" || key.length > EVIDENCE_METADATA_MAX_KEY_LENGTH) {
      errors.push("metadata keys must be non-empty and bounded in length");
      continue;
    }

    if (FORBIDDEN_METADATA_KEY_PATTERN.test(key)) {
      errors.push(`metadata must not contain sensitive key "${key}"`);
      continue;
    }

    const isPrimitive =
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean";

    if (!isPrimitive) {
      errors.push(`metadata value for "${key}" must be a bounded primitive`);
      continue;
    }

    if (
      typeof value === "string" &&
      value.length > EVIDENCE_METADATA_MAX_VALUE_LENGTH
    ) {
      errors.push(`metadata value for "${key}" exceeds the allowed length`);
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      errors.push(`metadata value for "${key}" must be a finite number`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateCreateCanonicalEvidenceInput(
  input: CreateCanonicalEvidenceInput
): EvidenceValidationResult {
  const errors: string[] = [];

  if (typeof input.userId !== "string" || input.userId.trim() === "") {
    errors.push("userId is required");
  }

  if (!isEvidenceSourceType(input.sourceType)) {
    errors.push("sourceType must be a supported Evidence source type");
  }

  if (
    typeof input.sourceReference !== "string" ||
    input.sourceReference.trim() === ""
  ) {
    errors.push("sourceReference is required");
  }

  if (!isEvidenceSourceEngine(input.sourceEngine)) {
    errors.push("sourceEngine must be a supported Evidence source engine");
  }

  if (!isIsoTimestamp(input.sourceOccurredAt)) {
    errors.push("sourceOccurredAt must be a valid timestamp");
  }

  if (!isSha256Digest(input.sourceIntegrityDigest)) {
    errors.push("sourceIntegrityDigest must be a lowercase hex SHA-256 digest");
  }

  const metadata = validateEvidenceMetadata(input.metadata);
  errors.push(...metadata.errors);

  return { valid: errors.length === 0, errors };
}

export function validateEvidenceProvenance(
  provenance: EvidenceProvenance
): EvidenceValidationResult {
  const errors: string[] = [];

  if (!isEvidenceSourceType(provenance.sourceType)) {
    errors.push("sourceType must be a supported Evidence source type");
  }

  if (
    typeof provenance.sourceReference !== "string" ||
    provenance.sourceReference.trim() === ""
  ) {
    errors.push("sourceReference is required");
  }

  if (!isEvidenceSourceEngine(provenance.sourceEngine)) {
    errors.push("sourceEngine must be a supported Evidence source engine");
  }

  if (!isIsoTimestamp(provenance.sourceOccurredAt)) {
    errors.push("sourceOccurredAt must be a valid timestamp");
  }

  if (!isIsoTimestamp(provenance.recordedAt)) {
    errors.push("recordedAt must be a valid timestamp");
  }

  if (provenance.integrityAlgorithm !== EVIDENCE_INTEGRITY_ALGORITHM) {
    errors.push("integrityAlgorithm must be sha256");
  }

  if (!isSha256Digest(provenance.integrityDigest)) {
    errors.push("integrityDigest must be a lowercase hex SHA-256 digest");
  }

  if (!isSha256Digest(provenance.sourceIntegrityDigest)) {
    errors.push("sourceIntegrityDigest must be a lowercase hex SHA-256 digest");
  }

  if (!isEvidenceIntegrityState(provenance.integrityState)) {
    errors.push("integrityState must be a supported Evidence integrity state");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Deterministic canonical string for Evidence integrity.
 *
 * Built from an explicit ordered field list. Object key iteration is never used,
 * so the digest cannot change because of incidental property ordering.
 */
export function buildEvidenceCanonicalString(
  input: EvidenceCanonicalDigestInput
): string {
  return [
    EVIDENCE_CANONICAL_VERSION,
    input.userId,
    input.sourceType,
    input.sourceReference,
    input.sourceEngine,
    normalizeEvidenceTimestamp(input.sourceOccurredAt),
    input.sourceIntegrityDigest
  ].join("|");
}

export function toEvidenceProvenance(record: EvidenceRecord): EvidenceProvenance {
  return {
    sourceType: record.sourceType,
    sourceReference: record.sourceReference,
    sourceEngine: record.sourceEngine,
    sourceOccurredAt: record.sourceOccurredAt,
    recordedAt: record.recordedAt,
    integrityAlgorithm: record.integrityAlgorithm,
    integrityDigest: record.integrityDigest,
    sourceIntegrityDigest: record.sourceIntegrityDigest,
    integrityState: record.integrityState
  };
}

/** Projects a Canonical Evidence Record into the safe student-facing shape. */
export function toStudentEvidenceRecord(
  record: EvidenceRecord
): StudentEvidenceRecord {
  return {
    id: record.id,
    sourceType: record.sourceType,
    sourceReference: record.sourceReference,
    sourceEngine: record.sourceEngine,
    sourceOccurredAt: record.sourceOccurredAt,
    recordedAt: record.recordedAt,
    state: record.state,
    integrityState: record.integrityState,
    metadata: record.metadata
  };
}

export type EvidenceIdempotencyDecision =
  | { kind: "match" }
  | { kind: "conflict"; reason: string };

/**
 * Decides whether a repeated trusted source event is the same Canonical
 * Evidence or an integrity conflict.
 *
 * Fails closed: any divergence in provenance or in either digest is a conflict.
 * An existing record is never silently overwritten.
 */
export function evaluateExistingEvidenceRecord(
  existing: EvidenceRecord,
  candidate: EvidenceCanonicalDigestInput & { integrityDigest: string }
): EvidenceIdempotencyDecision {
  if (existing.sourceEngine !== candidate.sourceEngine) {
    return { kind: "conflict", reason: "source_engine_mismatch" };
  }

  if (
    normalizeEvidenceTimestamp(existing.sourceOccurredAt) !==
    normalizeEvidenceTimestamp(candidate.sourceOccurredAt)
  ) {
    return { kind: "conflict", reason: "source_occurred_at_mismatch" };
  }

  if (existing.sourceIntegrityDigest !== candidate.sourceIntegrityDigest) {
    return { kind: "conflict", reason: "source_integrity_digest_mismatch" };
  }

  if (existing.integrityDigest !== candidate.integrityDigest) {
    return { kind: "conflict", reason: "evidence_integrity_digest_mismatch" };
  }

  return { kind: "match" };
}
