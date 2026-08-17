import { randomBytes } from "node:crypto";
import type {
  CertificateIssuanceResult,
  IssuedCertificate
} from "@tlp/shared-types";
import {
  AppError,
  buildCertificateIssuanceSnapshot,
  decideCertificateIssuance,
  normalizeCertificateDefinitionStableId
} from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";
import { getCertificateDefinition } from "./certificate-admin";
import { getStudentCertificateEligibility } from "./certificate-eligibility";
import { writeAuditEvent } from "./audit";

/**
 * CERT-003 — Deterministic Certificate Issuance, authoritative orchestration.
 *
 * Implements the CERT-003 section 8 issuance rule:
 *
 *   request -> re-evaluate eligibility -> confirm definition/version
 *   -> confirm evidence state -> create one record -> audit -> expose
 *
 * CERT-002 remains the ONE authoritative eligibility evaluator. This module
 * never counts Evidence, never evaluates competency satisfaction and never
 * derives an Evidence outcome; it calls `getStudentCertificateEligibility` and
 * requires `status === "eligible"` immediately before issuing. A previously
 * displayed eligible result carries no authority here.
 *
 * Out of scope by construction: lifecycle status, expiration, revocation,
 * correction, verification behaviour, sharing, export and rendering. CERT-004
 * onwards own those.
 */

const CERTIFICATE_COLUMNS =
  "id,certificate_definition_id,certificate_definition_stable_id,certificate_definition_version,verification_id,issued_at";

interface CertificateRow {
  id: string;
  certificate_definition_id: string;
  certificate_definition_stable_id: string;
  certificate_definition_version: number;
  verification_id: string;
  issued_at: string;
}

/**
 * Opaque, cryptographically random certificate identifier, following the
 * Wave 7 `ev1_` convention. It is minted so a future CERT-005 verification
 * surface needs no schema change; nothing in CERT-003 exposes it publicly.
 */
function mintCertificateVerificationId(): string {
  return `cert1_${randomBytes(24).toString("hex")}`;
}

function toIssuedCertificate(row: CertificateRow): IssuedCertificate {
  return {
    id: row.id,
    certificateDefinitionId: row.certificate_definition_id,
    certificateDefinitionStableId: row.certificate_definition_stable_id,
    certificateDefinitionVersion: row.certificate_definition_version,
    verificationId: row.verification_id,
    issuedAt: row.issued_at
  };
}

function unavailable(message: string): AppError {
  return new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });
}

function normalizeRequest(input: { stableId: string; version: number }): {
  stableId: string;
  version: number;
} {
  const stableId = normalizeCertificateDefinitionStableId(input?.stableId ?? "");

  if (!stableId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A valid Certificate Definition stable ID is required",
      retryable: false
    });
  }

  if (!Number.isInteger(input?.version) || input.version <= 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message:
        "An exact Certificate Definition version is required; 'latest' is not supported",
      retryable: false
    });
  }

  return { stableId, version: input.version };
}

async function resolveDefinitionId(
  stableId: string,
  version: number
): Promise<string> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("certificate_definitions")
    .select("id")
    .eq("stable_id", stableId)
    .eq("version", version)
    .maybeSingle();

  if (error) {
    throw unavailable("Unable to resolve the Certificate Definition");
  }

  if (!data?.id) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Certificate Definition version was not found",
      retryable: false
    });
  }

  return data.id;
}

async function findExistingCertificate(
  userId: string,
  definitionId: string
): Promise<IssuedCertificate | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("certificates")
    .select(CERTIFICATE_COLUMNS)
    .eq("user_id", userId)
    .eq("certificate_definition_id", definitionId)
    .maybeSingle();

  if (error) {
    throw unavailable("Unable to read existing certificates");
  }

  return data ? toIssuedCertificate(data as unknown as CertificateRow) : null;
}

async function loadCertificateById(
  certificateId: string
): Promise<IssuedCertificate> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("certificates")
    .select(CERTIFICATE_COLUMNS)
    .eq("id", certificateId)
    .single();

  if (error || !data) {
    throw unavailable("Unable to read the issued certificate");
  }

  return toIssuedCertificate(data as unknown as CertificateRow);
}

interface EvidencePin {
  evidenceId: string;
  state: string;
  integrityState: string;
  resultState: string | null;
  correctionCount: number;
}

/**
 * Reads the exact authoritative values the eligibility evaluation relied upon,
 * so the issuance transaction can confirm they have not changed.
 *
 * These are observations, not judgements: nothing here decides whether Evidence
 * qualifies. The comparison happens inside the database transaction, and any
 * difference aborts issuance.
 */
async function readEvidencePins(
  evidenceIds: readonly string[]
): Promise<EvidencePin[]> {
  if (evidenceIds.length === 0) return [];

  const supabase = createServerSupabaseClient();

  const { data: records, error: recordError } = await supabase
    .from("evidence_records")
    .select("id,state,integrity_state,metadata")
    .in("id", [...evidenceIds]);

  if (recordError) {
    throw unavailable("Unable to read Evidence for issuance");
  }

  const { data: corrections, error: correctionError } = await supabase
    .from("evidence_correction_events")
    .select("evidence_id")
    .in("evidence_id", [...evidenceIds]);

  if (correctionError) {
    throw unavailable("Unable to read Evidence correction history");
  }

  const correctionCounts = new Map<string, number>();
  for (const row of (corrections ?? []) as Array<{ evidence_id: string }>) {
    correctionCounts.set(
      row.evidence_id,
      (correctionCounts.get(row.evidence_id) ?? 0) + 1
    );
  }

  const byId = new Map<string, Record<string, unknown>>(
    ((records ?? []) as unknown as Array<Record<string, unknown>>).map((row) => [
      String(row.id),
      row
    ])
  );

  return [...evidenceIds].map((evidenceId) => {
    const row = byId.get(evidenceId);

    if (!row) {
      // The transaction will reject this as drift; failing here keeps the
      // error close to its cause.
      throw new AppError({
        code: "CONFLICT",
        message:
          "Authoritative Evidence changed after eligibility was evaluated",
        retryable: false,
        details: { reason: "authoritative_inputs_changed" }
      });
    }

    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const resultState = metadata.resultState;

    return {
      evidenceId,
      state: String(row.state),
      integrityState: String(row.integrity_state),
      resultState: typeof resultState === "string" ? resultState : null,
      correctionCount: correctionCounts.get(evidenceId) ?? 0
    };
  });
}

function refusal(
  reason: string,
  message: string,
  extra: Record<string, unknown> = {}
): AppError {
  return new AppError({
    code: "CONFLICT",
    message,
    retryable: false,
    details: { reason, ...extra }
  });
}

/**
 * Issues a certificate to the authenticated student for one exact published
 * Certificate Definition version.
 *
 * The subject is always the trusted caller's own user id, passed in by the
 * route. No client-supplied identifier can choose the recipient.
 *
 * Idempotent: an existing Certificate Record is returned unchanged, and the
 * existence check runs BEFORE any fresh evaluation. An already-issued
 * certificate is historical truth, so a later Evidence correction must never
 * stop a student from retrieving it.
 */
export async function issueStudentCertificate(
  userId: string,
  input: { stableId: string; version: number }
): Promise<CertificateIssuanceResult> {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A student identifier is required",
      retryable: false
    });
  }

  const request = normalizeRequest(input);
  const definitionId = await resolveDefinitionId(
    request.stableId,
    request.version
  );

  // Idempotent replay: return the existing authoritative record without
  // re-evaluating, and without emitting a second issuance audit event.
  const existing = await findExistingCertificate(userId, definitionId);
  if (existing) {
    return { certificate: existing, alreadyIssued: true };
  }

  const definition = await getCertificateDefinition(definitionId);

  // CERT-002 is re-run here. The eligibility a student saw earlier is never
  // authority for issuance.
  const eligibility = await getStudentCertificateEligibility(userId, {
    stableId: request.stableId,
    version: request.version
  });

  const decision = decideCertificateIssuance({
    eligibilityStatus: eligibility.status,
    ...(eligibility.unknownReason
      ? { unknownReason: eligibility.unknownReason }
      : {}),
    publicationState: definition.publicationState,
    supersededByDefinitionId: definition.supersededByDefinitionId
  });

  if (!decision.issuable) {
    if (decision.reason === "definition_not_issuable") {
      throw refusal(
        decision.reason,
        "This certificate is not available for issuance."
      );
    }

    if (decision.reason === "eligibility_unknown") {
      throw refusal(
        decision.reason,
        "Your eligibility for this certificate cannot be confirmed right now.",
        decision.unknownReason
          ? { unknownReason: decision.unknownReason }
          : {}
      );
    }

    throw refusal(
      decision.reason,
      "You do not currently meet the requirements for this certificate."
    );
  }

  const snapshot = buildCertificateIssuanceSnapshot(eligibility);
  const pins = await readEvidencePins(snapshot.evidenceIds);

  const supabase = createServerSupabaseClient();

  const { data: issuedId, error } = await supabase.rpc("certificate_issue", {
    target_user_id: userId,
    target_definition_id: definitionId,
    new_verification_id: mintCertificateVerificationId(),
    pin_evidence_ids: pins.map((pin) => pin.evidenceId),
    pin_states: pins.map((pin) => pin.state),
    pin_integrity_states: pins.map((pin) => pin.integrityState),
    pin_result_states: pins.map((pin) => pin.resultState),
    pin_correction_counts: pins.map((pin) => pin.correctionCount),
    snap_competency_stable_ids: snapshot.competencies.map(
      (entry) => entry.competencyStableId
    ),
    snap_competency_versions: snapshot.competencies.map(
      (entry) => entry.competencyVersion
    ),
    snap_evidence_ids: snapshot.evidence.map((entry) => entry.evidenceId),
    snap_evidence_competency_stable_ids: snapshot.evidence.map(
      (entry) => entry.competencyStableId
    ),
    snap_evidence_competency_versions: snapshot.evidence.map(
      (entry) => entry.competencyVersion
    )
  });

  if (error) {
    // A lost uniqueness race means a concurrent request already issued this
    // certificate. Re-read and return the winner rather than duplicating.
    if (error.code === "23505") {
      const winner = await findExistingCertificate(userId, definitionId);
      if (winner) {
        return { certificate: winner, alreadyIssued: true };
      }
    }

    if (/changed after eligibility was evaluated/i.test(error.message ?? "")) {
      throw refusal(
        "authoritative_inputs_changed",
        "The evidence behind this certificate changed while it was being issued. Please try again."
      );
    }

    throw unavailable("Unable to issue the certificate");
  }

  const certificate = await loadCertificateById(String(issuedId));

  writeAuditEvent({
    eventType: "certificate.issued",
    outcome: "success",
    actorId: userId,
    targetType: "certificate",
    targetId: certificate.id,
    metadata: {
      certificateDefinitionStableId: certificate.certificateDefinitionStableId,
      certificateDefinitionVersion: certificate.certificateDefinitionVersion,
      competencySnapshotCount: snapshot.competencies.length,
      evidenceSnapshotCount: snapshot.evidence.length
    }
  });

  return { certificate, alreadyIssued: false };
}

/*
 * A student certificate listing route is deliberately NOT provided.
 *
 * The approved CERT-003 student surface is exactly one action:
 * POST /certificates/issuance. Listing issued certificates is a CERT-006
 * portfolio concern, and `GET /certificates` remains a forbidden route that
 * both the smoke script and the Wave 8 verifier assert returns 404.
 *
 * The UI does not need one: issuance is idempotent, so a repeat request
 * returns the existing record with `alreadyIssued: true`.
 */
