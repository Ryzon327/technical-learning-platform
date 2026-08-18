import type { CertificatePortfolioEntry } from "@tlp/shared-types";

/**
 * CERT-006 — pure presentation logic for the learner's certificate portfolio.
 *
 * This module holds the parts of the portfolio experience that are decisions
 * rather than markup: which certificate is focused, what the focus control
 * says, and where the verification action points. Keeping them here makes them
 * executable in tests, because this repository has no rendered-DOM harness.
 *
 * Nothing here derives certificate truth. Status, dates, versions and
 * competencies arrive already resolved from CERT-004 through the API.
 */

/**
 * Focus a certificate, or unfocus it if it is already the focused one.
 *
 * Exactly one certificate can be focused at a time: the learner is reading a
 * single credential, not comparing a wall of them.
 */
export function selectPortfolioCertificate(
  currentSelectedId: string | null,
  certificateId: string
): string | null {
  return currentSelectedId === certificateId ? null : certificateId;
}

/**
 * Resolve the focused certificate against the certificates actually on screen.
 *
 * Filtering can remove the focused certificate from the list. Resolving at
 * render time means a stale selection silently falls away instead of leaving
 * an expanded control pointing at nothing.
 */
export function resolvePortfolioSelection(
  entries: readonly CertificatePortfolioEntry[],
  selectedCertificateId: string | null
): CertificatePortfolioEntry | null {
  if (!selectedCertificateId) return null;
  return (
    entries.find((entry) => entry.certificateId === selectedCertificateId) ??
    null
  );
}

/** Whether a given entry is the focused one, after stale-selection resolution. */
export function isPortfolioCertificateSelected(
  entries: readonly CertificatePortfolioEntry[],
  selectedCertificateId: string | null,
  certificateId: string
): boolean {
  return (
    resolvePortfolioSelection(entries, selectedCertificateId)?.certificateId ===
    certificateId
  );
}

/**
 * The focus control's wording. The certificate title is included so the
 * accessible name is unambiguous when several controls are on screen.
 */
export function describePortfolioDetailToggle(
  entry: CertificatePortfolioEntry,
  isSelected: boolean
): string {
  return isSelected
    ? `Hide details for ${entry.certificateTitle}`
    : `View details for ${entry.certificateTitle}`;
}

/** Stable id for the detail region a focus control owns, for aria-controls. */
export function buildPortfolioDetailRegionId(certificateId: string): string {
  return `certificate-${certificateId}-details`;
}

/**
 * Where the portfolio's verification action points.
 *
 * This is the only place CERT-006 knows about the CERT-005 path shape. The
 * reference is encoded so the produced path is always a single path segment,
 * which is what CERT-005's own path reader accepts.
 *
 * CERT-006 does not verify anything itself: it links to the public CERT-005
 * page and lets that page do the work.
 */
export function buildCertificateVerificationHref(
  verificationReference: string
): string {
  return `/verify/${encodeURIComponent(verificationReference)}`;
}
