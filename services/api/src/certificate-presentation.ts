import type {
  CertificateBrandPresentation,
  CertificatePortfolioEntry,
  CertificatePortfolioFilters,
  CertificatePresentationModel
} from "@tlp/shared-types";
import {
  AppError,
  buildCertificatePresentation,
  buildFallbackCertificatePresentation
} from "@tlp/shared-types";
import { getStudentCertificatePortfolio } from "./certificate-portfolio";
import { createServerSupabaseClient } from "./supabase";

/**
 * CERT-009 — the owner's branded certificate presentation.
 *
 * ## Composes, never replaces
 *
 * The certificate itself comes from CERT-006's portfolio projection, unchanged.
 * This module adds exactly two narrow reads that are presentation concerns and
 * belong to no earlier feature:
 *
 *   1. CERT-001's editable presentation metadata for the definitions in play.
 *   2. the authenticated owner's CURRENT display name.
 *
 * It resolves no lifecycle status, no eligibility, no issuance, no verification
 * and no correction. It is not a second certificate projection.
 *
 * ## Holder name
 *
 * PRESENTATION DATA, NOT HISTORICAL ISSUANCE TRUTH. Read at render time for the
 * authenticated owner only, scoped to their own user id. It never reaches
 * CERT-003 issuance, CERT-005's public payload, CERT-007's export, or lifecycle
 * and correction history. There is no code path here to another learner's name.
 *
 * ## Failure behaviour (CERT-009 section 12)
 *
 * If brand metadata or the display name cannot be resolved, the certificate is
 * still presented through the accessible fallback with every authoritative
 * field and the verification reference intact. Presentation failure never
 * costs the learner their certificate and never blocks verification.
 *
 * No AI anywhere in this path.
 */

interface DefinitionPresentationRow {
  id: string;
  stable_id: string;
  version: number;
  plain_language_title: string | null;
  plain_language_summary: string | null;
  logo_text_alternative: string | null;
}

const unavailable = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

/** Keyed on the exact pinned definition version, never the stable id alone. */
function brandKey(stableId: string, version: number): string {
  return `${stableId}@${version}`;
}

/**
 * The owner's current display name.
 *
 * Scoped to the caller's own user id. A failure here is never fatal: the
 * certificate is presented without a name rather than not at all.
 */
async function readHolderName(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return undefined;

  const name = (data as { display_name: string | null }).display_name;
  return typeof name === "string" && name.trim() !== "" ? name : undefined;
}

/**
 * CERT-001's presentation metadata for the definitions actually presented.
 *
 * A failure is not fatal: an empty map means every certificate renders through
 * the accessible fallback.
 */
async function readBrandPresentation(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  entries: readonly CertificatePortfolioEntry[]
): Promise<Map<string, CertificateBrandPresentation>> {
  const brands = new Map<string, CertificateBrandPresentation>();
  if (entries.length === 0) return brands;

  const { data, error } = await supabase
    .from("certificate_definitions")
    .select(
      "id,stable_id,version,plain_language_title,plain_language_summary,logo_text_alternative"
    )
    .in(
      "stable_id",
      entries.map((entry) => entry.certificateDefinitionStableId)
    );

  if (error || !data) return brands;

  for (const row of data as unknown as DefinitionPresentationRow[]) {
    brands.set(brandKey(row.stable_id, row.version), {
      ...(row.plain_language_title
        ? { plainLanguageTitle: row.plain_language_title }
        : {}),
      ...(row.plain_language_summary
        ? { plainLanguageSummary: row.plain_language_summary }
        : {}),
      ...(row.logo_text_alternative
        ? { logoTextAlternative: row.logo_text_alternative }
        : {})
    });
  }

  return brands;
}

export interface StudentCertificatePresentation {
  certificates: CertificatePresentationModel[];
  /** Certificates CERT-006 could not resolve, carried through, never dropped. */
  unavailableCount: number;
}

/**
 * Builds the owner's branded certificate presentations.
 *
 * A whole-portfolio failure propagates from CERT-006 rather than being masked,
 * so the learner sees a retryable error instead of an empty credential wall.
 */
export async function getStudentCertificatePresentation(
  userId: string,
  filters: CertificatePortfolioFilters = {}
): Promise<StudentCertificatePresentation> {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A student identifier is required",
      retryable: false
    });
  }

  const portfolio = await getStudentCertificatePortfolio(userId, filters);

  const supabase = createServerSupabaseClient();
  const holderName = await readHolderName(supabase, userId);
  const brands = await readBrandPresentation(supabase, portfolio.entries);

  const certificates = portfolio.entries.map((entry) => {
    const brand = brands.get(
      brandKey(
        entry.certificateDefinitionStableId,
        entry.certificateDefinitionVersion
      )
    );

    // CERT-009 section 12: no brand metadata means the simpler accessible
    // presentation, never a missing or degraded certificate.
    return brand
      ? buildCertificatePresentation({
          entry,
          brand,
          ...(holderName ? { holderName } : {})
        })
      : buildFallbackCertificatePresentation(entry, holderName);
  });

  return {
    certificates,
    unavailableCount: portfolio.unavailableEntries.length
  };
}
