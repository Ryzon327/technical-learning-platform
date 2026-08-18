import type { CertificateLifecycleStatus } from "./certificate-lifecycle";
import { describeCertificateStatus } from "./certificate-lifecycle";

/**
 * CERT-006 — Student Certificate Portfolio.
 *
 * Pure composition and presentation for a learner's private certificate list.
 *
 * ## Ownership boundary
 *
 * This module is presentation only. It owns no truth:
 *
 *   CERT-001 certificate definition · CERT-002 eligibility ·
 *   CERT-003 issuance and pinned competency provenance ·
 *   CERT-004 lifecycle status · CERT-005 public verification
 *
 * Nothing here derives a status, decides eligibility, or resolves a lifecycle
 * transition. It arranges already-authoritative values for a reader.
 *
 * ## Privacy boundary
 *
 * Private to the owning learner. The verification reference appears here
 * because it is the owner's own credential handle — it is never a lookup key
 * for anyone else, and it is never added to CERT-004's lifecycle record or to
 * CERT-005's public payload.
 *
 * No Evidence detail beyond the pinned competency summary CERT-003 recorded.
 */

/** A competency the certificate attests to, at its exact pinned version. */
export interface CertificatePortfolioCompetency {
  title: string;
  version: number;
}

/**
 * One certificate as the owning learner sees it.
 *
 * `verificationReference` is present so the learner can open verification of
 * their own credential — the action CERT-006 section 5 requires, and which was
 * previously unreachable after issuance.
 */
export interface CertificatePortfolioEntry {
  certificateId: string;
  certificateTitle: string;
  issuer: string;
  certificateDefinitionStableId: string;
  certificateDefinitionVersion: number;
  issuedAt: string;
  status: CertificateLifecycleStatus;
  statusEffectiveAt: string;
  expiresAt?: string;
  competencySummary: CertificatePortfolioCompetency[];
  verificationReference: string;
}

/**
 * A certificate the learner owns whose presentation could not be resolved.
 *
 * Listed rather than dropped: an owned certificate must never silently vanish,
 * and its details must never be fabricated (CERT-006 sections 9 and 11).
 */
export interface CertificatePortfolioUnavailableEntry {
  certificateId: string;
  reason: string;
}

export interface CertificatePortfolioFilters {
  status?: CertificateLifecycleStatus;
  certificateDefinitionStableId?: string;
}

export interface CertificatePortfolioFilterOptions {
  statuses: Array<{
    value: CertificateLifecycleStatus;
    label: string;
    count: number;
  }>;
  certificates: Array<{ value: string; label: string }>;
}

export interface StudentCertificatePortfolio {
  entries: CertificatePortfolioEntry[];
  unavailableEntries: CertificatePortfolioUnavailableEntry[];
  appliedFilters: CertificatePortfolioFilters;
  availableFilters: CertificatePortfolioFilterOptions;
  /** Certificates the learner owns, before filtering. */
  totalCount: number;
}

function isLifecycleStatus(value: unknown): value is CertificateLifecycleStatus {
  return (
    value === "active" ||
    value === "superseded" ||
    value === "expired" ||
    value === "revoked" ||
    value === "corrected"
  );
}

/**
 * Normalises filter input from the transport layer.
 *
 * Unrecognised values are dropped rather than rejected, so a stale bookmark
 * shows the whole portfolio instead of an error.
 */
export function normalizeCertificatePortfolioFilters(
  input: {
    status?: string | undefined;
    certificateDefinitionStableId?: string | undefined;
  } = {}
): CertificatePortfolioFilters {
  const filters: CertificatePortfolioFilters = {};

  if (isLifecycleStatus(input.status)) {
    filters.status = input.status;
  }

  const stableId = input.certificateDefinitionStableId?.trim();
  if (stableId) {
    filters.certificateDefinitionStableId = stableId;
  }

  return filters;
}

export function filterCertificatePortfolioEntries(
  entries: readonly CertificatePortfolioEntry[],
  filters: CertificatePortfolioFilters
): CertificatePortfolioEntry[] {
  return entries.filter((entry) => {
    if (filters.status && entry.status !== filters.status) return false;
    if (
      filters.certificateDefinitionStableId &&
      entry.certificateDefinitionStableId !==
        filters.certificateDefinitionStableId
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Deterministic order: most recently issued first, then title, version and id.
 *
 * The trailing keys make the order total, so two certificates issued in the
 * same instant never swap places between requests.
 */
export function sortCertificatePortfolioEntries(
  entries: readonly CertificatePortfolioEntry[]
): CertificatePortfolioEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.issuedAt.localeCompare(left.issuedAt) ||
      left.certificateTitle.localeCompare(right.certificateTitle) ||
      left.certificateDefinitionVersion - right.certificateDefinitionVersion ||
      left.certificateId.localeCompare(right.certificateId)
  );
}

/**
 * Filter choices derived from the learner's own certificates only, so the
 * control never hints at certificates they do not hold.
 */
export function buildCertificatePortfolioFilterOptions(
  entries: readonly CertificatePortfolioEntry[]
): CertificatePortfolioFilterOptions {
  const statusCounts = new Map<CertificateLifecycleStatus, number>();
  const certificates = new Map<string, string>();

  for (const entry of entries) {
    statusCounts.set(entry.status, (statusCounts.get(entry.status) ?? 0) + 1);
    certificates.set(
      entry.certificateDefinitionStableId,
      entry.certificateTitle
    );
  }

  return {
    statuses: [...statusCounts.entries()]
      .map(([value, count]) => ({
        value,
        label: describeCertificateStatus(value),
        count
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    certificates: [...certificates.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label))
  };
}

/**
 * Composes the portfolio a learner sees.
 *
 * Filter options are always derived from the complete owned set, not the
 * filtered view, so narrowing to one status never hides the way back.
 */
export function assembleCertificatePortfolio(input: {
  entries: readonly CertificatePortfolioEntry[];
  unavailableEntries?: readonly CertificatePortfolioUnavailableEntry[];
  filters?: CertificatePortfolioFilters;
}): StudentCertificatePortfolio {
  const filters = input.filters ?? {};
  const owned = input.entries ?? [];

  return {
    entries: sortCertificatePortfolioEntries(
      filterCertificatePortfolioEntries(owned, filters)
    ),
    unavailableEntries: [...(input.unavailableEntries ?? [])].sort((left, right) =>
      left.certificateId.localeCompare(right.certificateId)
    ),
    appliedFilters: filters,
    availableFilters: buildCertificatePortfolioFilterOptions(owned),
    totalCount: owned.length
  };
}

/** Calm summary of how many certificates are shown. */
export function describePortfolioCount(
  portfolio: Pick<StudentCertificatePortfolio, "entries" | "totalCount">
): string {
  const shown = portfolio.entries.length;

  if (portfolio.totalCount === 0) {
    return "You have not earned any certificates yet.";
  }

  if (shown === portfolio.totalCount) {
    return `${shown} ${shown === 1 ? "certificate" : "certificates"}.`;
  }

  return `${shown} of ${portfolio.totalCount} certificates shown.`;
}

/** Wording for a certificate whose presentation could not be resolved. */
export function describeUnavailableEntry(): string {
  return "We could not load the details for this certificate right now. It is still yours, and nothing about it has changed.";
}
