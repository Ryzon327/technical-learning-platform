import type {
  CertificateLifecycleEvent,
  CertificatePortfolioCompetency,
  CertificatePortfolioEntry,
  CertificatePortfolioFilters,
  CertificatePortfolioUnavailableEntry,
  StudentCertificatePortfolio
} from "@tlp/shared-types";
import {
  AppError,
  assembleCertificatePortfolio,
  isCertificateLifecycleStatus,
  resolveEffectiveCertificateStatus
} from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";

/**
 * CERT-006 — private student certificate portfolio.
 *
 * Composes what a learner sees about the certificates they own. It owns no
 * truth: CERT-004's resolver decides lifecycle status, CERT-003 pinned the
 * competency provenance, and CERT-001 owns the definition. This module reads
 * those and arranges them.
 *
 * ## Ownership
 *
 * Scoped to the trusted caller's own user id on every query. No client-supplied
 * identifier reaches this module, and there is no code path to another
 * learner's certificates.
 *
 * ## Why this reads certificates directly
 *
 * CERT-004's `listStudentCertificateRecords` deliberately does not select
 * `verification_id`, and that omission is guarded. The portfolio needs the
 * owner's own verification reference for the CERT-006 verification action, so
 * it issues its own scoped read rather than weakening CERT-004's contract.
 * Lifecycle status still comes from CERT-004's resolver — the single authority
 * is preserved.
 *
 * ## Partial failure
 *
 * A certificate whose presentation cannot be safely resolved is reported as an
 * unavailable entry rather than dropped or fabricated, so the rest of the
 * portfolio stays usable (CERT-006 section 11).
 */

interface CertificateRow {
  id: string;
  certificate_definition_id: string;
  certificate_definition_stable_id: string;
  certificate_definition_version: number;
  verification_id: string;
  issued_at: string;
  expires_at: string | null;
}

function unavailable(message: string): AppError {
  return new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });
}

/**
 * Builds the learner's private portfolio.
 *
 * Whole-portfolio dependency failures raise, so the learner sees a retryable
 * error rather than an empty portfolio that falsely implies they hold nothing.
 * Per-certificate failures degrade to unavailable entries instead.
 */
export async function getStudentCertificatePortfolio(
  userId: string,
  filters: CertificatePortfolioFilters = {}
): Promise<StudentCertificatePortfolio> {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A student identifier is required",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { data: certificateRows, error: certificateError } = await supabase
    .from("certificates")
    .select(
      "id,certificate_definition_id,certificate_definition_stable_id,certificate_definition_version,verification_id,issued_at,expires_at"
    )
    .eq("user_id", userId);

  if (certificateError) {
    throw unavailable("Unable to read your certificates");
  }

  const certificates = (certificateRows ?? []) as unknown as CertificateRow[];

  if (certificates.length === 0) {
    return assembleCertificatePortfolio({ entries: [], filters });
  }

  const certificateIds = certificates.map((certificate) => certificate.id);

  const { data: eventRows, error: eventError } = await supabase
    .from("certificate_lifecycle_events")
    .select(
      "id,certificate_id,sequence_number,previous_status,new_status,effective_at,occurred_at"
    )
    .in("certificate_id", certificateIds);

  if (eventError) {
    throw unavailable("Unable to read certificate lifecycle history");
  }

  const { data: definitionRows, error: definitionError } = await supabase
    .from("certificate_definitions")
    .select("id,title,issuer")
    .in(
      "id",
      certificates.map((certificate) => certificate.certificate_definition_id)
    );

  if (definitionError) {
    throw unavailable("Unable to read certificate details");
  }

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from("certificate_competency_snapshots")
    .select("certificate_id,competency_stable_id,competency_version")
    .in("certificate_id", certificateIds);

  if (snapshotError) {
    throw unavailable("Unable to read certificate competencies");
  }

  const definitions = new Map<string, { title: string; issuer: string }>(
    (
      (definitionRows ?? []) as unknown as Array<{
        id: string;
        title: string;
        issuer: string;
      }>
    ).map((row) => [row.id, { title: row.title, issuer: row.issuer }])
  );

  // Competency titles at the exact pinned versions. A title that cannot be
  // resolved falls back to the pinned stable id rather than inventing a name.
  const snapshots = (snapshotRows ?? []) as unknown as Array<{
    certificate_id: string;
    competency_stable_id: string;
    competency_version: number;
  }>;

  const competencyTitles = new Map<string, string>();
  if (snapshots.length > 0) {
    const { data: competencyRows, error: competencyError } = await supabase
      .from("competencies")
      .select("stable_id,version,title")
      .in(
        "stable_id",
        [...new Set(snapshots.map((s) => s.competency_stable_id))]
      );

    if (competencyError) {
      throw unavailable("Unable to read certificate competencies");
    }

    for (const row of (competencyRows ?? []) as unknown as Array<{
      stable_id: string;
      version: number;
      title: string;
    }>) {
      competencyTitles.set(`${row.stable_id}@${row.version}`, row.title);
    }
  }

  const snapshotsByCertificate = new Map<
    string,
    CertificatePortfolioCompetency[]
  >();
  for (const snapshot of snapshots) {
    const existing = snapshotsByCertificate.get(snapshot.certificate_id) ?? [];
    existing.push({
      title:
        competencyTitles.get(
          `${snapshot.competency_stable_id}@${snapshot.competency_version}`
        ) ?? snapshot.competency_stable_id,
      version: snapshot.competency_version
    });
    snapshotsByCertificate.set(snapshot.certificate_id, existing);
  }

  const eventsByCertificate = new Map<string, CertificateLifecycleEvent[]>();
  const certificatesWithUnreadableHistory = new Set<string>();

  for (const row of (eventRows ?? []) as unknown as Array<
    Record<string, unknown>
  >) {
    const certificateId = String(row.certificate_id);
    const previousStatus = row.previous_status;
    const newStatus = row.new_status;

    // An unrecognised status cannot be replayed. Mark the certificate rather
    // than coercing the value into a known state.
    if (
      !isCertificateLifecycleStatus(previousStatus) ||
      !isCertificateLifecycleStatus(newStatus)
    ) {
      certificatesWithUnreadableHistory.add(certificateId);
      continue;
    }

    const existing = eventsByCertificate.get(certificateId) ?? [];
    existing.push({
      id: String(row.id),
      certificateId,
      sequenceNumber: Number(row.sequence_number),
      previousStatus,
      newStatus,
      effectiveAt: String(row.effective_at),
      occurredAt: String(row.occurred_at)
    });
    eventsByCertificate.set(certificateId, existing);
  }

  // Trusted server time. A client clock never decides whether a certificate
  // has lapsed.
  const now = new Date().toISOString();

  const entries: CertificatePortfolioEntry[] = [];
  const unavailableEntries: CertificatePortfolioUnavailableEntry[] = [];

  for (const certificate of certificates) {
    const definition = definitions.get(certificate.certificate_definition_id);

    if (!definition || certificatesWithUnreadableHistory.has(certificate.id)) {
      unavailableEntries.push({
        certificateId: certificate.id,
        reason: "details_unavailable"
      });
      continue;
    }

    // CERT-004 owns lifecycle truth.
    const effective = resolveEffectiveCertificateStatus({
      issuedAt: certificate.issued_at,
      expiresAt: certificate.expires_at,
      events: eventsByCertificate.get(certificate.id) ?? [],
      now
    });

    // A history that cannot be replayed coherently must not be presented as a
    // status.
    if (!effective.sequenceValid) {
      unavailableEntries.push({
        certificateId: certificate.id,
        reason: "status_unavailable"
      });
      continue;
    }

    entries.push({
      certificateId: certificate.id,
      certificateTitle: definition.title,
      issuer: definition.issuer,
      certificateDefinitionStableId:
        certificate.certificate_definition_stable_id,
      certificateDefinitionVersion: certificate.certificate_definition_version,
      issuedAt: certificate.issued_at,
      status: effective.status,
      statusEffectiveAt: effective.effectiveAt,
      ...(effective.expiresAt ? { expiresAt: effective.expiresAt } : {}),
      competencySummary: (
        snapshotsByCertificate.get(certificate.id) ?? []
      ).sort(
        (left, right) =>
          left.title.localeCompare(right.title) || left.version - right.version
      ),
      verificationReference: certificate.verification_id
    });
  }

  return assembleCertificatePortfolio({
    entries,
    unavailableEntries,
    filters
  });
}
