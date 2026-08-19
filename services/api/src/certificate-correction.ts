import type {
  CertificateCorrectionAction,
  CertificateCorrectionRecord,
  CertificateLifecycleStatus
} from "@tlp/shared-types";
import {
  AppError,
  describeCertificateCorrectionReasonError,
  describeCertificateCorrectionReplacementError,
  isCertificateCorrectionAction,
  sortCertificateCorrections,
  validateCertificateCorrectionReason,
  validateCertificateCorrectionReplacement
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { createServerSupabaseClient } from "./supabase";

/**
 * CERT-008 — privileged certificate revocation and correction.
 *
 * ## Authority boundary
 *
 * CERT-004 remains the sole lifecycle authority. This module never decides
 * whether a transition is legal, never writes a lifecycle event itself, and
 * never resolves effective status. It validates CERT-008 workflow inputs and
 * calls one privileged RPC, which records the workflow fact and delegates the
 * transition to CERT-004's existing machinery in the same transaction.
 *
 * A refused transition therefore comes from CERT-004's guard, not from here.
 *
 * ## Authorization
 *
 * Privileged administrative operations only. The caller is a verified founder
 * administrator, established by the route before this module is reached. There
 * is no student-facing revoke, correct, supersede or restore path: CERT-008
 * section 8 forbids student self-revocation and self-restore.
 *
 * ## Downstream
 *
 * Nothing propagates anything. CERT-005 verification, CERT-006 portfolio and
 * CERT-007 export all derive effective status from CERT-004 at read time, so a
 * correction is reflected everywhere the moment its lifecycle event exists.
 *
 * No AI anywhere in this path (CERT-008 section 10).
 */

interface CorrectionRow {
  id: string;
  certificate_id: string;
  sequence_number: number;
  action: string;
  reason: string;
  actor_id: string;
  actor_role: string;
  previous_status: string;
  new_status: string;
  replacement_certificate_id: string | null;
  occurred_at: string;
}

const unavailable = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

const invalid = (message: string) =>
  new AppError({
    code: "VALIDATION_ERROR",
    message,
    retryable: false
  });

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(`${label} is required`);
  }
  return value.trim();
}

function toRecord(row: CorrectionRow): CertificateCorrectionRecord {
  return {
    correctionId: row.id,
    certificateId: row.certificate_id,
    sequenceNumber: row.sequence_number,
    action: row.action as CertificateCorrectionAction,
    reason: row.reason,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    previousStatus: row.previous_status as CertificateLifecycleStatus,
    newStatus: row.new_status as CertificateLifecycleStatus,
    ...(row.replacement_certificate_id
      ? { replacementCertificateId: row.replacement_certificate_id }
      : {}),
    occurredAt: row.occurred_at
  };
}

export interface ApplyCertificateCorrectionInput {
  certificateId: string;
  action: string;
  reason: string;
  replacementCertificateId?: string;
  effectiveAt?: string;
  idempotencyKey?: string;
}

export interface ApplyCertificateCorrectionResult {
  correctionId: string;
}

/**
 * Applies a privileged correction.
 *
 * Workflow validity is checked here so the administrator gets a clear message
 * rather than a database constraint error; the database re-checks everything
 * and remains the authority. Lifecycle legality is checked by neither — it is
 * CERT-004's, and a refusal surfaces as a conflict.
 */
export async function applyCertificateCorrection(
  context: { actorUserId: string },
  input: ApplyCertificateCorrectionInput
): Promise<ApplyCertificateCorrectionResult> {
  const actorUserId = requireIdentifier(
    context.actorUserId,
    "An acting administrator"
  );
  const certificateId = requireIdentifier(
    input.certificateId,
    "A certificate identifier"
  );

  if (!isCertificateCorrectionAction(input.action)) {
    throw invalid("Unknown certificate correction action");
  }

  const reasonError = validateCertificateCorrectionReason(input.reason);
  if (reasonError) {
    throw invalid(describeCertificateCorrectionReasonError(reasonError));
  }

  const replacementError = validateCertificateCorrectionReplacement({
    action: input.action,
    certificateId,
    ...(input.replacementCertificateId
      ? { replacementCertificateId: input.replacementCertificateId }
      : {})
  });
  if (replacementError) {
    throw invalid(
      describeCertificateCorrectionReplacementError(replacementError)
    );
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("certificate_apply_correction", {
    target_certificate_id: certificateId,
    target_action: input.action,
    target_reason: input.reason.trim(),
    target_actor_id: actorUserId,
    target_replacement_certificate_id: input.replacementCertificateId ?? null,
    target_effective_at: input.effectiveAt ?? null,
    target_idempotency_key: input.idempotencyKey ?? null
  });

  if (error) {
    // CERT-004 refused the edge, or a workflow rule was violated. Either way
    // the certificate is unchanged: the RPC is one transaction.
    const message = String(error.message ?? "");
    if (
      message.includes("transition is not permitted") ||
      message.includes("does not follow the recorded status") ||
      message.includes("must be contiguous")
    ) {
      throw new AppError({
        code: "CONFLICT",
        message:
          "That change is not permitted from the certificate's current status",
        retryable: false
      });
    }
    if (message.includes("was not found")) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Certificate was not found",
        retryable: false
      });
    }
    throw unavailable("Unable to record the certificate correction");
  }

  const correctionId = typeof data === "string" ? data : "";

  writeAuditEvent({
    eventType: "certificate.correction.applied",
    outcome: "success",
    actorId: actorUserId,
    targetType: "certificate",
    targetId: certificateId,
    metadata: {
      action: input.action,
      correctionId,
      ...(input.replacementCertificateId
        ? { replacementCertificateId: input.replacementCertificateId }
        : {})
    }
  });

  return { correctionId };
}

/**
 * The privileged correction history for one certificate.
 *
 * Ordered oldest first so a reviewer follows what happened in sequence. The
 * original issuance is never part of this history and is never rewritten by it.
 */
export async function listCertificateCorrections(
  certificateId: string
): Promise<CertificateCorrectionRecord[]> {
  const target = requireIdentifier(certificateId, "A certificate identifier");

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("certificate_correction_events")
    .select(
      "id,certificate_id,sequence_number,action,reason,actor_id,actor_role,previous_status,new_status,replacement_certificate_id,occurred_at"
    )
    .eq("certificate_id", target);

  if (error) {
    throw unavailable("Unable to read the certificate correction history");
  }

  const rows = (data ?? []) as unknown as CorrectionRow[];

  return sortCertificateCorrections(rows.map(toRecord));
}
