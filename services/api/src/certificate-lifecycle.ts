import type {
  CertificateLifecycleEvent,
  CertificateLifecycleStatus,
  StudentCertificateRecord
} from "@tlp/shared-types";
import {
  AppError,
  isCertificateLifecycleStatus,
  isValidCertificateLifecycleTransition,
  resolveEffectiveCertificateStatus
} from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";
import { writeAuditEvent } from "./audit";

/**
 * CERT-004 — Certificate Record and Lifecycle, authoritative orchestration.
 *
 * Reads a student's own certificates and derives their effective status, and
 * provides the privileged machinery for recording a lifecycle transition.
 *
 * ## Ownership boundary
 *
 * CERT-004 owns the machinery. **CERT-008 owns the revoke, correct, supersede
 * and restore workflows.** `recordCertificateLifecycleTransition` below is
 * deliberately not reachable from any HTTP route: CERT-008 will call it once it
 * owns the reason, actor and replacement-reference concepts that a real
 * workflow requires. There is no student lifecycle control anywhere.
 *
 * CERT-005 owns public verification. Every read here is scoped to the trusted
 * caller's own user id.
 */

const CERTIFICATE_COLUMNS =
  "id,certificate_definition_stable_id,certificate_definition_version,issued_at,expires_at";

interface CertificateRow {
  id: string;
  certificate_definition_stable_id: string;
  certificate_definition_version: number;
  issued_at: string;
  expires_at: string | null;
}

interface LifecycleEventRow {
  id: string;
  certificate_id: string;
  sequence_number: number;
  previous_status: string;
  new_status: string;
  effective_at: string;
  occurred_at: string;
}

function unavailable(message: string): AppError {
  return new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });
}

function requireUserId(userId: string): string {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A student identifier is required",
      retryable: false
    });
  }
  return userId;
}

function mapLifecycleEvent(row: LifecycleEventRow): CertificateLifecycleEvent {
  if (
    !isCertificateLifecycleStatus(row.previous_status) ||
    !isCertificateLifecycleStatus(row.new_status)
  ) {
    // An unrecognised status cannot be replayed. Fail closed rather than
    // coercing it into a known state.
    throw unavailable("Certificate lifecycle history could not be read");
  }

  return {
    id: row.id,
    certificateId: row.certificate_id,
    sequenceNumber: row.sequence_number,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    effectiveAt: row.effective_at,
    occurredAt: row.occurred_at
  };
}

/**
 * Lists the authenticated student's own certificates with their effective
 * lifecycle status.
 *
 * Read-only and scoped by the trusted caller's user id — no client-supplied
 * identifier reaches this function, and no other student's record is
 * reachable. This is the minimum a returning learner needs to see whether a
 * certificate they hold is still current (CERT-004 sections 3 and 14). It is
 * not a portfolio: CERT-006 owns that.
 *
 * Status is derived at read time from immutable issuance truth, the expiry
 * pinned at issuance, and the append-only history. Nothing is cached, so a
 * revocation recorded a moment ago is reflected immediately.
 */
export async function listStudentCertificateRecords(
  userId: string
): Promise<StudentCertificateRecord[]> {
  requireUserId(userId);

  const supabase = createServerSupabaseClient();

  const { data: certificateRows, error: certificateError } = await supabase
    .from("certificates")
    .select(CERTIFICATE_COLUMNS)
    .eq("user_id", userId);

  if (certificateError) {
    throw unavailable("Unable to read your certificates");
  }

  const certificates = (certificateRows ?? []) as unknown as CertificateRow[];
  if (certificates.length === 0) return [];

  const { data: eventRows, error: eventError } = await supabase
    .from("certificate_lifecycle_events")
    .select(
      "id,certificate_id,sequence_number,previous_status,new_status,effective_at,occurred_at"
    )
    .in(
      "certificate_id",
      certificates.map((certificate) => certificate.id)
    );

  if (eventError) {
    throw unavailable("Unable to read certificate lifecycle history");
  }

  const eventsByCertificate = new Map<string, CertificateLifecycleEvent[]>();
  for (const row of (eventRows ?? []) as unknown as LifecycleEventRow[]) {
    const event = mapLifecycleEvent(row);
    const existing = eventsByCertificate.get(event.certificateId) ?? [];
    existing.push(event);
    eventsByCertificate.set(event.certificateId, existing);
  }

  // Trusted server time. A client clock never influences whether a certificate
  // has lapsed.
  const now = new Date().toISOString();

  return certificates
    .map((certificate) => {
      const effective = resolveEffectiveCertificateStatus({
        issuedAt: certificate.issued_at,
        expiresAt: certificate.expires_at,
        events: eventsByCertificate.get(certificate.id) ?? [],
        now
      });

      return {
        id: certificate.id,
        certificateDefinitionStableId:
          certificate.certificate_definition_stable_id,
        certificateDefinitionVersion:
          certificate.certificate_definition_version,
        issuedAt: certificate.issued_at,
        status: effective.status,
        statusEffectiveAt: effective.effectiveAt,
        ...(effective.expiresAt ? { expiresAt: effective.expiresAt } : {}),
        statusDetermined: effective.sequenceValid
      };
    })
    .sort((left, right) => left.issuedAt.localeCompare(right.issuedAt));
}

/**
 * Records one lifecycle transition for a certificate.
 *
 * Privileged machinery, intentionally not exposed by any route in CERT-004.
 * CERT-008 will call it from the revoke, correct, supersede and restore
 * workflows, supplying the reason, actor and replacement reference those
 * workflows own — none of which exist here.
 *
 * The transition is validated against the approved edge set before the write,
 * and again by a database trigger inside the transaction, so an unauthorized or
 * incoherent transition fails closed and history is never partially updated.
 */
export async function recordCertificateLifecycleTransition(
  context: { actorUserId: string },
  input: {
    certificateId: string;
    fromStatus: CertificateLifecycleStatus;
    toStatus: CertificateLifecycleStatus;
    effectiveAt?: string;
  }
): Promise<void> {
  if (!isCertificateLifecycleStatus(input.toStatus)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Unknown certificate lifecycle status",
      retryable: false
    });
  }

  if (!isValidCertificateLifecycleTransition(input.fromStatus, input.toStatus)) {
    throw new AppError({
      code: "CONFLICT",
      message: `Certificate lifecycle transition from ${input.fromStatus} to ${input.toStatus} is not permitted`,
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.rpc("certificate_record_lifecycle_event", {
    target_certificate_id: input.certificateId,
    target_new_status: input.toStatus,
    target_effective_at: input.effectiveAt ?? null
  });

  if (error) {
    throw unavailable("Unable to record the certificate lifecycle transition");
  }

  writeAuditEvent({
    eventType: "certificate.lifecycle.transitioned",
    outcome: "success",
    actorId: context.actorUserId,
    targetType: "certificate",
    targetId: input.certificateId,
    metadata: {
      fromStatus: input.fromStatus,
      toStatus: input.toStatus
    }
  });
}
