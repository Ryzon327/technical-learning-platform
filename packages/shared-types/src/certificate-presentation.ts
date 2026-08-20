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
 * CERT-009 — Certificate Branding and Presentation.
 *
 * Arranges an already-issued certificate for a reader. It is the last layer in
 * the Certificate Engine and the only one that owns nothing.
 *
 * ## Presentation never alters truth (CERT-009 section 1 and section 9)
 *
 * Every authoritative field is copied verbatim from the CERT-006 projection by
 * explicit assignment. Nothing here derives, formats away, rounds, defaults or
 * recomputes a certificate fact. `presentationPreservesTruth` exists so a test
 * can prove that rather than trust it.
 *
 * ## Holder name is presentation data, NOT historical issuance truth
 *
 * The learner's CURRENT display name is used at render time. It is deliberately
 * not snapshotted into issuance: CERT-003 issuance truth is frozen and copies no
 * mutable presentation data.
 *
 * Consequence, stated plainly: if a learner changes their display name, an
 * older certificate rendered later shows the NEW name. That is accepted. It
 * must never alter certificate identity, certificate id, issuance date,
 * definition or version, the competency snapshot, the verification reference,
 * lifecycle status, or correction history.
 *
 * ## Boundaries
 *
 * Owner-only. The holder name and the certificate id may appear here because
 * this is the authenticated owner's own view. Neither may ever reach CERT-005's
 * public payload or CERT-007's export.
 *
 * No binary brand asset, no logo storage, no accreditation seal: CURR-007 owns
 * asset references and is not implemented. Branding here is text and CSS only.
 *
 * QR is a design-only hook. The model exposes the official CERT-005
 * verification reference a future renderer would encode; it generates no image,
 * mints no second token, and creates no second verification mechanism.
 *
 * Pure module: no I/O, no clock, no randomness, no AI.
 */

export const CERTIFICATE_PRESENTATION_MODEL_VERSION =
  "certificate-presentation-v1";

/**
 * The replaceable brand treatment, sourced from CERT-001's existing
 * presentation metadata. CERT-001 deliberately leaves these editable after
 * publication, so improving them never reissues a certificate.
 */
export interface CertificateBrandPresentation {
  plainLanguageTitle?: string;
  plainLanguageSummary?: string;
  logoTextAlternative?: string;
}

/**
 * A certificate arranged for display to its owner.
 *
 * `isFallback` marks the simpler accessible rendering required by CERT-009
 * section 12 when brand metadata is unavailable. The certificate is equally
 * valid either way, and verification is never blocked.
 */
export interface CertificatePresentationModel {
  modelVersion: string;
  certificateId: string;
  certificateTitle: string;
  plainLanguageTitle?: string;
  plainLanguageSummary?: string;
  logoTextAlternative?: string;
  holderName?: string;
  holderLabel: string;
  issuer: string;
  issuedAt: string;
  certificateDefinitionStableId: string;
  certificateDefinitionVersion: number;
  status: CertificateLifecycleStatus;
  statusLabel: string;
  statusExplanation: string;
  expiresAt?: string;
  competencySummary: CertificatePortfolioCompetency[];
  verificationReference: string;
  isFallback: boolean;
}

/**
 * Fields a certificate presentation must never carry.
 *
 * Held as data so tests and the verifier assert the prohibition directly.
 * Holder name and certificate id are absent from this list on purpose: the
 * CERT-009 ruling permits both in the OWNER'S view. They remain forbidden in
 * CERT-005's public payload and CERT-007's export, which hold their own lists.
 */
export const CERTIFICATE_PRESENTATION_FORBIDDEN_FIELDS: readonly string[] = [
  "userId",
  "user_id",
  "email",
  "evidenceIds",
  "evidenceSnapshot",
  "evidenceOutcome",
  "score",
  "attemptId",
  "labSessionId",
  "correctionHistory",
  "actorId",
  "actorRole",
  "reason",
  "competencyId",
  "shareUrl",
  "shareToken",
  "logoUrl",
  "brandAssetId",
  "accreditationSeal"
];

/**
 * The authoritative fields a presentation may never change.
 *
 * CERT-009 section 13 requires a test proving presentation cannot alter truth;
 * this list is what that test compares.
 */
export const CERTIFICATE_PRESENTATION_TRUTH_FIELDS: readonly string[] = [
  "certificateId",
  "certificateTitle",
  "issuer",
  "issuedAt",
  "certificateDefinitionStableId",
  "certificateDefinitionVersion",
  "status",
  "expiresAt",
  "verificationReference"
];

/** How the certificate names its holder. Never invents a name. */
export function describeCertificateHolder(holderName?: string): string {
  const name = holderName?.trim();
  return name ? `Issued to ${name}` : "Issued to you";
}

export interface BuildCertificatePresentationInput {
  entry: CertificatePortfolioEntry;
  brand?: CertificateBrandPresentation;
  /** The learner's CURRENT display name. Presentation data, never truth. */
  holderName?: string;
}

/**
 * Builds the branded presentation.
 *
 * Assembled by explicit assignment rather than a spread, so a field added to
 * the portfolio entry can never leak into a rendered certificate by accident,
 * and so no authoritative value can be transformed on the way through.
 */
export function buildCertificatePresentation(
  input: BuildCertificatePresentationInput
): CertificatePresentationModel {
  const { entry, brand, holderName } = input;
  const name = holderName?.trim();

  return {
    modelVersion: CERTIFICATE_PRESENTATION_MODEL_VERSION,
    certificateId: entry.certificateId,
    certificateTitle: entry.certificateTitle,
    ...(brand?.plainLanguageTitle
      ? { plainLanguageTitle: brand.plainLanguageTitle }
      : {}),
    ...(brand?.plainLanguageSummary
      ? { plainLanguageSummary: brand.plainLanguageSummary }
      : {}),
    ...(brand?.logoTextAlternative
      ? { logoTextAlternative: brand.logoTextAlternative }
      : {}),
    ...(name ? { holderName: name } : {}),
    holderLabel: describeCertificateHolder(name),
    issuer: entry.issuer,
    issuedAt: entry.issuedAt,
    certificateDefinitionStableId: entry.certificateDefinitionStableId,
    certificateDefinitionVersion: entry.certificateDefinitionVersion,
    status: entry.status,
    statusLabel: describeCertificateStatus(entry.status),
    statusExplanation: explainCertificateStatus(entry.status),
    ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
    competencySummary: entry.competencySummary.map((competency) => ({
      title: competency.title,
      version: competency.version
    })),
    verificationReference: entry.verificationReference,
    isFallback: false
  };
}

/**
 * The simpler accessible presentation required by CERT-009 section 12.
 *
 * Used when brand metadata cannot be resolved. Every authoritative field and
 * the verification reference survive unchanged — a failed brand lookup must
 * never cost the learner their certificate or block verification.
 */
export function buildFallbackCertificatePresentation(
  entry: CertificatePortfolioEntry,
  holderName?: string
): CertificatePresentationModel {
  return {
    ...buildCertificatePresentation({ entry, ...(holderName ? { holderName } : {}) }),
    isFallback: true
  };
}

/**
 * Proves a presentation reports exactly the certificate it was built from.
 *
 * Compares every authoritative field against the source projection. Used by
 * tests to satisfy CERT-009 section 13: presentation cannot alter truth.
 */
export function presentationPreservesTruth(
  model: CertificatePresentationModel,
  entry: CertificatePortfolioEntry
): boolean {
  return (
    model.certificateId === entry.certificateId &&
    model.certificateTitle === entry.certificateTitle &&
    model.issuer === entry.issuer &&
    model.issuedAt === entry.issuedAt &&
    model.certificateDefinitionStableId ===
      entry.certificateDefinitionStableId &&
    model.certificateDefinitionVersion === entry.certificateDefinitionVersion &&
    model.status === entry.status &&
    model.expiresAt === entry.expiresAt &&
    model.verificationReference === entry.verificationReference &&
    model.competencySummary.length === entry.competencySummary.length &&
    model.competencySummary.every(
      (competency, index) =>
        competency.title === entry.competencySummary[index]?.title &&
        competency.version === entry.competencySummary[index]?.version
    )
  );
}

/**
 * The heading a certificate leads with.
 *
 * Prefers CERT-001's plain-language title because it is written for a reader,
 * and falls back to the authoritative title. Either way the authoritative
 * title remains available and unchanged on the model.
 */
export function describeCertificateHeading(
  model: CertificatePresentationModel
): string {
  return model.plainLanguageTitle?.trim() || model.certificateTitle;
}

/**
 * Whether a certificate should be presented as currently standing.
 *
 * Reuses CERT-004's status verbatim and never softens it: CERT-009 section 6
 * forbids hiding a revoked certificate, so a non-active certificate is always
 * presented with its real status in words.
 */
export function presentAsCurrentlyValid(
  model: CertificatePresentationModel
): boolean {
  return model.status === "active";
}

/**
 * A one-line summary safe to print, read aloud, or use as a document title.
 * Never image-only, never colour-dependent (CERT-009 section 10).
 */
export function describeCertificateForPrint(
  model: CertificatePresentationModel
): string {
  return `${describeCertificateHeading(model)} — ${model.issuer} — ${model.statusLabel}`;
}
