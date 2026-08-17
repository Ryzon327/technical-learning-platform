import type {
  AuthoritativeCompetencyEvidenceReference,
  CertificateEligibilityResult,
  StudentCertificateDefinitionOption
} from "@tlp/shared-types";
import {
  AppError,
  buildUnknownEligibilityResult,
  evaluateCertificateEligibility,
  normalizeCertificateDefinitionStableId
} from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";
import { getCertificateDefinition } from "./certificate-admin";
import { getAuthoritativeCompetencyEvidenceReferences } from "./evidence-competency";

/**
 * CERT-002 — Certificate Eligibility Rules, authoritative orchestration.
 *
 * Gathers authoritative platform truth and hands it to the pure evaluator in
 * `@tlp/shared-types`. It reads; it never writes.
 *
 * Nothing here issues a certificate, creates a student certificate record,
 * assigns a certificate id, mints a verification identifier, creates lifecycle
 * state or computes an expiration timestamp. CERT-003 owns issuance and
 * CERT-004 owns the durable record.
 *
 * ## Proof source
 *
 * Eligibility is proven from Wave 7 version-exact Evidence competency links via
 * `getAuthoritativeCompetencyEvidenceReferences`. `student_competency_state` is
 * deliberately NOT read: it is unique on `(user_id, competency_stable_id)` and
 * so collapses versions, which cannot prove the exact competency version a
 * Certificate Definition pins. There is no mapping rule and no latest-version
 * fallback.
 *
 * ## Ownership
 *
 * The subject is always the trusted caller's own user id, passed in by the
 * route from `resolveTrustedRequestIdentity`. No client-supplied identifier
 * ever determines whose eligibility is evaluated.
 */

interface DefinitionLocator {
  stableId: string;
  version: number;
}

/**
 * Student-facing discovery for the eligibility selector.
 *
 * Scope is deliberately tiny: it exists only so an authenticated student can
 * choose a certificate to be evaluated against. It is not a catalogue — there
 * is no search, no filtering, no pagination, no recommendation and no ranking.
 *
 * Selectable means published AND not superseded. Publication state alone is not
 * enough: `superseded_by_definition_id` records an explicit Founder decision
 * that a definition has been replaced, and a replaced certificate should not be
 * offered as an ordinary choice for a new evaluation.
 *
 * This is a discovery/selection rule only. It does not retire the superseded
 * definition, change its publication state, hide it from RLS, or prevent an
 * exact-version reference to it elsewhere — the historical definition remains
 * intact and evaluable if requested directly.
 *
 * Results are sorted in TypeScript rather than with a database ORDER BY,
 * because CERT-002 forbids selecting a competency or certificate version by
 * ordering. Sorting here is presentation only and picks nothing.
 */
export async function listSelectableCertificateDefinitions(): Promise<
  StudentCertificateDefinitionOption[]
> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("certificate_definitions")
    .select("stable_id,version,title,description,plain_language_title")
    .eq("publication_state", "published")
    .is("superseded_by_definition_id", null);

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load available certificates",
      retryable: true
    });
  }

  const options: StudentCertificateDefinitionOption[] = (
    (data ?? []) as unknown as Array<Record<string, unknown>>
  ).map((row) => ({
    stableId: String(row.stable_id),
    version: Number(row.version),
    title: String(row.title),
    plainLanguageTitle: String(row.plain_language_title),
    ...(row.description ? { description: String(row.description) } : {})
  }));

  // Stable, deterministic presentation order. No precedence is implied: two
  // published, non-superseded versions of one certificate both remain
  // independently selectable.
  return options.sort(
    (left, right) =>
      left.plainLanguageTitle.localeCompare(right.plainLanguageTitle) ||
      left.title.localeCompare(right.title) ||
      left.version - right.version
  );
}

/**
 * Resolves the definition row id for an exact (stable id, version) pair.
 *
 * Deliberately does not filter on publication state: a draft, review or
 * retired version must be reported as "not evaluable", which is different from
 * "does not exist". Requirements themselves are loaded by the canonical
 * CERT-001 reader, so no second definition model is created here.
 */
async function resolveDefinitionId(
  locator: DefinitionLocator
): Promise<string | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("certificate_definitions")
    .select("id")
    .eq("stable_id", locator.stableId)
    .eq("version", locator.version)
    .maybeSingle();

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to resolve the Certificate Definition",
      retryable: true
    });
  }

  return data?.id ?? null;
}

function normalizeLocator(input: {
  stableId: string;
  version: number;
}): DefinitionLocator {
  const stableId = normalizeCertificateDefinitionStableId(input.stableId ?? "");

  if (!stableId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A valid Certificate Definition stable ID is required",
      retryable: false
    });
  }

  // The exact version is mandatory. There is no "latest published" shortcut,
  // because a certificate's meaning is version-specific.
  if (!Number.isInteger(input.version) || input.version <= 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message:
        "An exact Certificate Definition version is required; 'latest' is not supported",
      retryable: false
    });
  }

  return { stableId, version: input.version };
}

function isDependencyFailure(error: unknown): boolean {
  return error instanceof AppError && error.code === "DEPENDENCY_UNAVAILABLE";
}

/**
 * Evaluates whether the given student currently satisfies one exact published
 * Certificate Definition version.
 *
 * Side-effect free: no row is written, no Evidence is altered, no Certificate
 * Definition is altered, and no eligibility snapshot is persisted. A stored
 * result would go stale the moment Evidence is corrected, so eligibility is
 * always computed from current authoritative state.
 *
 * A transient dependency failure returns the CERT-002 unknown state rather
 * than a negative determination, per section 12.
 */
export async function getStudentCertificateEligibility(
  userId: string,
  input: { stableId: string; version: number }
): Promise<CertificateEligibilityResult> {
  if (typeof userId !== "string" || userId.trim() === "") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A student identifier is required",
      retryable: false
    });
  }

  const locator = normalizeLocator(input);
  const evaluatedAt = new Date().toISOString();

  let definitionId: string | null;

  try {
    definitionId = await resolveDefinitionId(locator);
  } catch (error) {
    if (isDependencyFailure(error)) {
      return buildUnknownEligibilityResult({
        certificateDefinitionStableId: locator.stableId,
        certificateDefinitionVersion: locator.version,
        unknownReason: "dependency_unavailable",
        evaluatedAt
      });
    }
    throw error;
  }

  // A definition that does not exist is a genuine not-found, not an
  // eligibility outcome.
  if (!definitionId) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Certificate Definition version was not found",
      retryable: false
    });
  }

  try {
    const definition = await getCertificateDefinition(definitionId);

    // Only a published version supports normal student eligibility. Gathering
    // Evidence for a non-evaluable definition would be wasted work, and the
    // evaluator reports this as unknown rather than ineligible.
    if (definition.publicationState !== "published") {
      return buildUnknownEligibilityResult({
        certificateDefinitionId: definition.id,
        certificateDefinitionStableId: definition.stableId,
        certificateDefinitionVersion: definition.version,
        definitionPublicationState: definition.publicationState,
        unknownReason: "definition_not_published",
        evaluatedAt
      });
    }

    // One accessor call per distinct competency stable id. Version filtering
    // happens in the evaluator against the exact pin, never in the query.
    const stableIds = [
      ...new Set(
        definition.requiredCompetencies.map(
          (requirement) => requirement.competencyStableId
        )
      )
    ].sort();

    const references: AuthoritativeCompetencyEvidenceReference[] = [];

    for (const competencyStableId of stableIds) {
      references.push(
        ...(await getAuthoritativeCompetencyEvidenceReferences(
          userId,
          competencyStableId
        ))
      );
    }

    return evaluateCertificateEligibility({
      definition,
      references,
      evaluatedAt
    });
  } catch (error) {
    if (isDependencyFailure(error)) {
      return buildUnknownEligibilityResult({
        certificateDefinitionId: definitionId,
        certificateDefinitionStableId: locator.stableId,
        certificateDefinitionVersion: locator.version,
        unknownReason: "dependency_unavailable",
        evaluatedAt
      });
    }
    throw error;
  }
}
