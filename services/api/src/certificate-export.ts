import type {
  CertificateExport,
  CertificatePortfolioFilters,
  UnexportableCertificate
} from "@tlp/shared-types";
import {
  AppError,
  assembleCertificateExport,
  describeUnavailableEntry
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { getStudentCertificatePortfolio } from "./certificate-portfolio";

/**
 * CERT-007 — student-controlled certificate export.
 *
 * Composes the CERT-006 portfolio projection and hands the student a portable
 * representation of certificates they already own.
 *
 * ## Why this composes rather than reads
 *
 * Building on the CERT-006 read model means the export can never expose a field
 * the portfolio deliberately withholds, and lifecycle status still comes from
 * CERT-004's resolver. This module issues no query of its own, owns no truth,
 * and writes nothing to any table — certificates already carry the verification
 * reference minted at issuance, so unlike EVID-008 there is nothing to mint.
 *
 * ## Freshness
 *
 * The export is composed on demand, so it always reflects current effective
 * status: a certificate revoked or expired after an earlier export can never
 * read as currently valid in a later one.
 *
 * ## Ownership
 *
 * Scoped to the trusted caller's own user id, which comes from the verified
 * token and never from the request body. There is no code path to another
 * learner's certificates and no admin surface.
 *
 * No AI anywhere in this path. No branding, no student display name, no share
 * link: those are CERT-009 and future sharing scope.
 */

export interface ExportStudentCertificatesOptions {
  filters?: CertificatePortfolioFilters;
}

/**
 * Builds the student's certificate export.
 *
 * A whole-portfolio dependency failure propagates, so the student sees a
 * retryable error rather than an empty export that falsely implies they hold
 * nothing. Per-certificate failures arrive already degraded from CERT-006 and
 * are carried through as unexportable entries — listed, never fabricated and
 * never silently dropped (CERT-007 section 11).
 */
export async function exportStudentCertificates(
  userId: string,
  options: ExportStudentCertificatesOptions = {}
): Promise<CertificateExport> {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A student identifier is required",
      retryable: false
    });
  }

  const portfolio = await getStudentCertificatePortfolio(
    userId,
    options.filters ?? {}
  );

  const unavailableCertificates: UnexportableCertificate[] =
    portfolio.unavailableEntries.map(() => ({
      reason: describeUnavailableEntry()
    }));

  const certificateExport = assembleCertificateExport({
    entries: portfolio.entries,
    generatedAt: new Date().toISOString(),
    unavailableCertificates
  });

  // Counts only. An audit record of an export must not become a second copy of
  // what was exported.
  writeAuditEvent({
    eventType: "certificate.export.requested",
    outcome: "success",
    actorId: userId,
    targetType: "certificate_export",
    metadata: {
      exportedCertificateCount: certificateExport.totalCount,
      currentlyValidCount: certificateExport.currentlyValidCount,
      unavailableCertificateCount:
        certificateExport.unavailableCertificates.length
    }
  });

  return certificateExport;
}
