import type { CertificateLifecycleStatus } from "./certificate-lifecycle";
import {
  describeCertificateStatus,
  explainCertificateStatus
} from "./certificate-lifecycle";
import type {
  CertificatePortfolioCompetency,
  CertificatePortfolioEntry
} from "./certificate-portfolio";

/**
 * CERT-007 — Certificate Export and Sharing.
 *
 * Two distinct things live here, following the EVID-008 precedent:
 *
 *   the EXPORT REPRESENTATION — a privacy-safe projection of certificates the
 *   student already owns, reflecting current lifecycle status at the moment of
 *   export;
 *
 *   the SHARE PAYLOAD DESIGN — the minimal shape a future student-controlled
 *   share link would carry (CERT-007 section 5). Designing it now is what lets
 *   sharing arrive later without a schema redesign. Nothing resolves it, no
 *   route serves it, and no link is minted anywhere in this feature.
 *
 * ## Ownership boundary
 *
 * This module owns nothing authoritative. Status is CERT-004's, issuance and
 * the pinned competency summary are CERT-003's, public verification is
 * CERT-005's, and the read model is CERT-006's. CERT-007 owns only the export
 * representation and its format version.
 *
 * ## Presentation boundary
 *
 * No branding, logo, typography, layout metadata or student display name.
 * Those are CERT-009 section 5 scope. This export is text, and deliberately so.
 *
 * Pure module: no I/O, no randomness, no clock, no AI.
 */

export const CERTIFICATE_EXPORT_FORMAT_VERSION = "certificate-export-v1";
export const CERTIFICATE_SHARE_PAYLOAD_VERSION = "certificate-share-v1";

/**
 * The portable formats a student may take away.
 *
 * Both are text. `json` is for machines and archiving, `markdown` is for
 * pasting into a document or a job application. Neither needs a rendering
 * library, and neither can become image-only (CERT-007 section 9).
 */
export type CertificateExportFormat = "json" | "markdown";

export const CERTIFICATE_EXPORT_FORMATS: readonly CertificateExportFormat[] = [
  "json",
  "markdown"
];

/** Unknown input falls back to the archival format rather than failing. */
export function normalizeCertificateExportFormat(
  value: unknown
): CertificateExportFormat {
  return value === "markdown" ? "markdown" : "json";
}

export function describeCertificateExportFormat(
  format: CertificateExportFormat
): string {
  return format === "markdown"
    ? "Markdown — readable text you can paste into a document"
    : "JSON — a structured file you can keep or hand to another system";
}

/**
 * One exported certificate.
 *
 * Deliberately excludes: the certificate's database identifier, the student's
 * identity, evidence identifiers and snapshots, scores, attempt and lab session
 * identifiers, correction history, competency internal identifiers, and the
 * certificate definition's internal id. The verification reference is the only
 * handle, and it is opaque.
 */
export interface ExportedCertificate {
  certificateTitle: string;
  issuer: string;
  certificateDefinitionStableId: string;
  certificateDefinitionVersion: number;
  issuedAt: string;
  status: CertificateLifecycleStatus;
  statusLabel: string;
  statusExplanation: string;
  expiresAt?: string;
  /** True only while the certificate currently stands. Fails closed. */
  currentlyValid: boolean;
  competencySummary: CertificatePortfolioCompetency[];
  verificationReference: string;
}

/**
 * A certificate that could not be included. Identified, never fabricated and
 * never silently dropped (CERT-007 section 11: the record stays intact).
 */
export interface UnexportableCertificate {
  reason: string;
}

export interface CertificateExport {
  formatVersion: string;
  generatedAt: string;
  /** Plain-language description of what the export contains and omits. */
  contents: string[];
  certificates: ExportedCertificate[];
  unavailableCertificates: UnexportableCertificate[];
  totalCount: number;
  currentlyValidCount: number;
}

/**
 * The minimal payload a future student-controlled share link would carry.
 *
 * Designed now, resolved by nothing. It answers only what an external reader
 * needs — what was earned, from whom, when, whether it currently stands, and
 * how to verify it — and carries no student identity at all, so publishing it
 * later stays a policy decision rather than a schema change.
 */
export interface CertificateSharePayload {
  payloadVersion: string;
  verificationReference: string;
  certificateTitle: string;
  issuer: string;
  issuedAt: string;
  status: CertificateLifecycleStatus;
  statusLabel: string;
  competencySummary: CertificatePortfolioCompetency[];
}

/**
 * Fields that must never appear in an export.
 *
 * Held as data so tests and the verifier assert the prohibition directly
 * rather than restating it (the CERT-005 pattern).
 */
export const CERTIFICATE_EXPORT_FORBIDDEN_FIELDS: readonly string[] = [
  "certificateId",
  "id",
  "userId",
  "user_id",
  "studentId",
  "holderName",
  "displayName",
  "email",
  "certificateDefinitionId",
  "evidenceIds",
  "evidenceSnapshot",
  "evidenceOutcome",
  "score",
  "attemptId",
  "labSessionId",
  "correctionHistory",
  "competencyId",
  "shareUrl",
  "shareToken",
  "logoUrl",
  "brandAssetId"
];

/**
 * Whether a certificate currently stands.
 *
 * Fails closed: only an active certificate is currently valid, so an expired,
 * revoked, superseded or corrected certificate can never be exported as
 * current — including one exported before the change.
 */
export function isCurrentlyValidForExport(
  status: CertificateLifecycleStatus
): boolean {
  return status === "active";
}

/**
 * Projects one portfolio entry into its export representation.
 *
 * Built by explicit assignment rather than a spread: adding a field to the
 * portfolio entry can therefore never leak it into an export by accident.
 *
 * Reuses the CERT-006 read model instead of re-reading certificates, so the
 * export can never expose a field the portfolio deliberately withholds, and
 * reuses CERT-004's status wording rather than inventing a second vocabulary.
 */
export function toExportedCertificate(
  entry: CertificatePortfolioEntry
): ExportedCertificate {
  return {
    certificateTitle: entry.certificateTitle,
    issuer: entry.issuer,
    certificateDefinitionStableId: entry.certificateDefinitionStableId,
    certificateDefinitionVersion: entry.certificateDefinitionVersion,
    issuedAt: entry.issuedAt,
    status: entry.status,
    statusLabel: describeCertificateStatus(entry.status),
    statusExplanation: explainCertificateStatus(entry.status),
    ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
    currentlyValid: isCurrentlyValidForExport(entry.status),
    competencySummary: entry.competencySummary.map((competency) => ({
      title: competency.title,
      version: competency.version
    })),
    verificationReference: entry.verificationReference
  };
}

/**
 * Builds the payload a future share link would carry. Design-only: nothing in
 * CERT-007 mints a link, serves this, or makes it reachable.
 */
export function toCertificateSharePayload(
  certificate: ExportedCertificate
): CertificateSharePayload {
  return {
    payloadVersion: CERTIFICATE_SHARE_PAYLOAD_VERSION,
    verificationReference: certificate.verificationReference,
    certificateTitle: certificate.certificateTitle,
    issuer: certificate.issuer,
    issuedAt: certificate.issuedAt,
    status: certificate.status,
    statusLabel: certificate.statusLabel,
    competencySummary: certificate.competencySummary.map((competency) => ({
      title: competency.title,
      version: competency.version
    }))
  };
}

/** Plain-language summary so the student knows what they are taking away. */
export function describeCertificateExportContents(): string[] {
  return [
    "Each certificate's title, who issued it, and when it was issued.",
    "Whether each certificate currently stands, in plain words.",
    "The date a certificate stops being current, where one applies.",
    "The competencies each certificate represents, at their exact version.",
    "A verification reference anyone can use to check the certificate.",
    "It does not include your name, account details, your evidence, your scores, or platform internals."
  ];
}

export interface AssembleCertificateExportInput {
  entries: readonly CertificatePortfolioEntry[];
  generatedAt: string;
  unavailableCertificates?: readonly UnexportableCertificate[];
}

/** Assembles the export. Pure: the caller supplies the clock. */
export function assembleCertificateExport(
  input: AssembleCertificateExportInput
): CertificateExport {
  const certificates = input.entries.map(toExportedCertificate);

  return {
    formatVersion: CERTIFICATE_EXPORT_FORMAT_VERSION,
    generatedAt: input.generatedAt,
    contents: describeCertificateExportContents(),
    certificates,
    unavailableCertificates: [...(input.unavailableCertificates ?? [])],
    totalCount: certificates.length,
    currentlyValidCount: certificates.filter(
      (certificate) => certificate.currentlyValid
    ).length
  };
}

/** Wording for the export summary. Counts, never a claim about validity. */
export function describeCertificateExportSummary(
  certificateExport: CertificateExport
): string {
  const { totalCount, currentlyValidCount } = certificateExport;
  const noun = totalCount === 1 ? "certificate" : "certificates";

  return `Export prepared: ${totalCount} ${noun}, ${currentlyValidCount} currently valid.`;
}

/**
 * Renders the export as Markdown.
 *
 * Headings and lists only, so the artifact keeps a logical reading order and is
 * never image-only (CERT-007 section 9). Status is always written out, so a
 * revoked certificate reads as revoked in the exported file too.
 */
export function renderCertificateExportAsMarkdown(
  certificateExport: CertificateExport
): string {
  const lines: string[] = [
    "# Your certificates",
    "",
    `Exported on ${certificateExport.generatedAt}.`,
    "",
    "## What this file contains",
    "",
    ...certificateExport.contents.map((line) => `- ${line}`),
    ""
  ];

  for (const certificate of certificateExport.certificates) {
    lines.push(
      `## ${certificate.certificateTitle}`,
      "",
      `- Issued by: ${certificate.issuer}`,
      `- Issued on: ${certificate.issuedAt}`,
      `- Status: ${certificate.statusLabel}`,
      `- ${certificate.statusExplanation}`
    );

    if (certificate.expiresAt) {
      lines.push(`- Valid until: ${certificate.expiresAt}`);
    }

    lines.push(
      `- Certificate version: ${certificate.certificateDefinitionVersion}`,
      `- Verification reference: ${certificate.verificationReference}`,
      ""
    );

    if (certificate.competencySummary.length > 0) {
      lines.push("Competencies this represents:", "");
      for (const competency of certificate.competencySummary) {
        lines.push(`- ${competency.title} (version ${competency.version})`);
      }
      lines.push("");
    }
  }

  if (certificateExport.unavailableCertificates.length > 0) {
    lines.push("## Certificates that could not be included", "");
    for (const entry of certificateExport.unavailableCertificates) {
      lines.push(`- ${entry.reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Serializes the export in the requested portable format. */
export function serializeCertificateExport(
  certificateExport: CertificateExport,
  format: CertificateExportFormat
): string {
  return format === "markdown"
    ? renderCertificateExportAsMarkdown(certificateExport)
    : JSON.stringify(certificateExport, null, 2);
}

/** The media type the serialized export should be handed over as. */
export function certificateExportMediaType(
  format: CertificateExportFormat
): string {
  return format === "markdown" ? "text/markdown" : "application/json";
}

/**
 * Everything needed to hand the student a file, with no DOM involved.
 *
 * The browser glue that turns this into a saved file is three lines in the
 * component; keeping the decisions here means the file name, media type and
 * contents are all unit tested.
 */
export interface CertificateExportDownload {
  fileName: string;
  mediaType: string;
  content: string;
}

export function buildCertificateExportDownload(
  certificateExport: CertificateExport,
  format: CertificateExportFormat
): CertificateExportDownload {
  return {
    fileName: buildCertificateExportFileName(certificateExport, format),
    mediaType: certificateExportMediaType(format),
    content: serializeCertificateExport(certificateExport, format)
  };
}

/**
 * A stable, safe file name. Derived only from the format and the export date,
 * so it can never leak a certificate title or anything about the student.
 */
export function buildCertificateExportFileName(
  certificateExport: CertificateExport,
  format: CertificateExportFormat
): string {
  const day = certificateExport.generatedAt.slice(0, 10);
  const extension = format === "markdown" ? "md" : "json";

  return `certificates-${day}.${extension}`;
}
