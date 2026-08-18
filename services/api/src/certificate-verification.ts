import type {
  CertificateLifecycleEvent,
  CertificateVerificationResult,
  VerifiedCompetencySummary
} from "@tlp/shared-types";
import {
  buildCertificateVerificationRecord,
  isCertificateLifecycleStatus,
  isCertificateVerificationReference,
  resolveEffectiveCertificateStatus
} from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";

/**
 * CERT-005 — public certificate verification.
 *
 * The platform's only public data surface. It answers exactly one question:
 * given one exact opaque verification reference, was this certificate issued
 * by the platform and what is its current lifecycle state?
 *
 * ## Access boundary
 *
 * A narrow privileged read, not a public RLS policy. No `to anon` or
 * `to public` policy exists anywhere in this repository, and adding one would
 * expose whole row shapes. Instead this module reads exactly the columns the
 * curated public payload needs and projects them through an explicit builder,
 * so a column added to any table later cannot leak.
 *
 * ## Privacy boundary
 *
 * `user_id` is never selected, `public.user_profiles` is never queried, and no
 * Evidence table is touched. There is deliberately no code path from a
 * verification reference to a learner's identity.
 *
 * ## Lookup boundary
 *
 * Exact equality on `verification_id` only. No prefix, no LIKE, no ordering,
 * no listing, no pagination — one reference in, at most one certificate out.
 * Malformed references are rejected before any query runs.
 */

interface CertificateRow {
  certificate_definition_stable_id: string;
  certificate_definition_version: number;
  issued_at: string;
  expires_at: string | null;
}

/**
 * Verifies one certificate by its exact public reference.
 *
 * Fails closed per CERT-005 section 12: when the lifecycle history cannot be
 * replayed coherently, or a dependency is unavailable, the result is
 * `unavailable` — never `not_found` and never a status. A genuine certificate
 * is never reported as invalid because infrastructure faltered.
 */
export async function verifyCertificateByReference(
  reference: string
): Promise<CertificateVerificationResult> {
  // Format is validated before any database round trip, so a malformed or
  // probing reference never reaches the query layer.
  if (!isCertificateVerificationReference(reference)) {
    return { outcome: "malformed_reference" };
  }

  const verifiedAt = new Date().toISOString();

  try {
    const supabase = createServerSupabaseClient();

    // Exact equality on the opaque reference. `user_id` and the internal
    // certificate UUID are deliberately not selected — except `id`, which is
    // needed only to join the lifecycle history and never leaves this module.
    const { data: certificateRow, error: certificateError } = await supabase
      .from("certificates")
      .select(
        "id,certificate_definition_id,certificate_definition_stable_id,certificate_definition_version,issued_at,expires_at"
      )
      .eq("verification_id", reference)
      .maybeSingle();

    if (certificateError) {
      return { outcome: "unavailable" };
    }

    if (!certificateRow) {
      return { outcome: "not_found" };
    }

    const certificate = certificateRow as unknown as CertificateRow & {
      id: string;
      certificate_definition_id: string;
    };

    const { data: definitionRow, error: definitionError } = await supabase
      .from("certificate_definitions")
      .select("title,issuer")
      .eq("id", certificate.certificate_definition_id)
      .maybeSingle();

    if (definitionError || !definitionRow) {
      return { outcome: "unavailable" };
    }

    const definition = definitionRow as unknown as {
      title: string;
      issuer: string;
    };

    const { data: eventRows, error: eventError } = await supabase
      .from("certificate_lifecycle_events")
      .select(
        "id,certificate_id,sequence_number,previous_status,new_status,effective_at,occurred_at"
      )
      .eq("certificate_id", certificate.id);

    if (eventError) {
      return { outcome: "unavailable" };
    }

    const events: CertificateLifecycleEvent[] = [];
    for (const row of (eventRows ?? []) as unknown as Array<
      Record<string, unknown>
    >) {
      const previousStatus = row.previous_status;
      const newStatus = row.new_status;

      // An unrecognised status cannot be replayed. Fail closed rather than
      // coercing it into a known state.
      if (
        !isCertificateLifecycleStatus(previousStatus) ||
        !isCertificateLifecycleStatus(newStatus)
      ) {
        return { outcome: "unavailable" };
      }

      events.push({
        id: String(row.id),
        certificateId: String(row.certificate_id),
        sequenceNumber: Number(row.sequence_number),
        previousStatus,
        newStatus,
        effectiveAt: String(row.effective_at),
        occurredAt: String(row.occurred_at)
      });
    }

    // CERT-004 owns lifecycle truth. This module never derives a status.
    const effective = resolveEffectiveCertificateStatus({
      issuedAt: certificate.issued_at,
      expiresAt: certificate.expires_at,
      events,
      now: verifiedAt
    });

    // A history that cannot be replayed coherently must not be presented as a
    // status, and must not be presented as invalid either.
    if (!effective.sequenceValid) {
      return { outcome: "unavailable" };
    }

    // Competency titles at the exact pinned versions. Titles and versions
    // only; no competency database id and nothing about demonstration.
    const { data: snapshotRows, error: snapshotError } = await supabase
      .from("certificate_competency_snapshots")
      .select("competency_stable_id,competency_version")
      .eq("certificate_id", certificate.id);

    if (snapshotError) {
      return { outcome: "unavailable" };
    }

    const snapshots = (snapshotRows ?? []) as unknown as Array<{
      competency_stable_id: string;
      competency_version: number;
    }>;

    const competencySummary: VerifiedCompetencySummary[] = [];

    for (const snapshot of snapshots) {
      const { data: competencyRow, error: competencyError } = await supabase
        .from("competencies")
        .select("title")
        .eq("stable_id", snapshot.competency_stable_id)
        .eq("version", snapshot.competency_version)
        .maybeSingle();

      if (competencyError) {
        return { outcome: "unavailable" };
      }

      competencySummary.push({
        // Fall back to the pinned stable id rather than leaking a null, so the
        // summary stays truthful about which competency was attested.
        title:
          (competencyRow as unknown as { title?: string } | null)?.title ??
          snapshot.competency_stable_id,
        version: snapshot.competency_version
      });
    }

    return {
      outcome: "verified",
      certificate: buildCertificateVerificationRecord({
        certificateTitle: definition.title,
        issuer: definition.issuer,
        certificateDefinitionStableId:
          certificate.certificate_definition_stable_id,
        certificateDefinitionVersion:
          certificate.certificate_definition_version,
        issuedAt: certificate.issued_at,
        status: effective.status,
        statusEffectiveAt: effective.effectiveAt,
        expiresAt: certificate.expires_at,
        competencySummary,
        verifiedAt
      })
    };
  } catch {
    // Any unexpected failure is reported as temporarily unavailable, never as
    // an invalid or missing certificate.
    return { outcome: "unavailable" };
  }
}
