import type {
  ClassifiedSearchDocument,
  CurriculumAdjustedSearchResults,
  CurriculumSearchCandidate,
  CurriculumSearchContentType,
  CurriculumSearchFacetedResults,
  CurriculumQueryVariant,
  SearchDocument
} from "@tlp/shared-types";
import type { SearchPermissionedCandidate } from "@tlp/shared-types";
import {
  AppError,
  applyCurriculumSearchFilter,
  buildCurriculumQueryAdjustment,
  buildCurriculumQueryVariants,
  buildCurriculumTypoRecovery,
  buildCurriculumSearchFilter,
  buildCurriculumSearchSnippet,
  buildRankedCurriculumSearchResults,
  classifyCurriculumMatch,
  buildCurriculumSourceReference,
  buildSearchDocument,
  decideFromAuthoritativeRead,
  describeCurriculumSearchFilterError,
  describeCurriculumSearchQueryError,
  maySurface,
  escapeCurriculumSearchPattern,
  normalizeCurriculumSearchLimit,
  normalizeCurriculumSearchQuery,
  selectHighestPublishedVersion,
  surfaceAuthorized,
  validateCurriculumSearchContentTypeFilter,
  validateCurriculumSearchQuery,
  withCurriculumQueryAdjustment,
  withCurriculumSearchFacets
} from "@tlp/shared-types";
import { createUserScopedSupabaseClient } from "./supabase";

/**
 * SEARCH-002 — Curriculum Search.
 *
 * Finds published curriculum a learner is authorized to read, by matching a
 * literal substring against authoritative Curriculum rows.
 *
 * ## Source of truth
 *
 * Curriculum remains authoritative. Every row read here IS the authoritative
 * record, read at query time — there is no index, no cache, no materialized
 * search state and no copy. A `SearchDocument` is produced from that live row
 * as derived discovery data, exactly as SEARCH-001 defines it.
 *
 * ## Authorization
 *
 * Reads go through `createUserScopedSupabaseClient`, so PostgreSQL row level
 * security decides visibility. Every curriculum table carries
 * `for select to authenticated using (publication_state = 'published')`, so
 * draft, review and retired curriculum is unreadable through this path — not
 * filtered out afterwards, but never returned. The `.eq("publication_state",
 * "published")` below is defence in depth, not the protection.
 *
 * No service-role client. No caller-supplied user id. No notes or private
 * source of any kind.
 *
 * ## SEARCH-008 ranking
 *
 * The returned results are ordered by match class, then by how precisely the
 * title carries the search, then by SEARCH-002's existing neutral order. The
 * ordering runs on already-authorized, already-filtered documents and is bounded
 * afterwards. There is no numeric value in it, no learner identity, no
 * behavioural signal and no freshness key. Matching itself is still literal
 * escaped substring matching — ranking reorders what was found; it never widens
 * what is findable.
 *
 * ## SEARCH-004 filters and facets
 *
 * A content-type filter narrows the results, and content-type facets count
 * them. Both run AFTER authorization, after SEARCH-003 surfacing and after
 * version resolution, on the final result set — so a filter can only ever
 * remove a result the caller was already entitled to see, and a facet can only
 * ever count one. Nothing about a withheld candidate is reachable from either.
 *
 * ## Privacy
 *
 * Learner queries are never persisted and never logged. Search runs entirely
 * within the request.
 *
 * No AI anywhere.
 */

/** The four approved types and the tables that hold them. */
const SEARCHABLE_TABLES: Record<CurriculumSearchContentType, string> = {
  learning_path: "learning_paths",
  course: "courses",
  mission: "missions",
  competency: "competencies"
};

interface CurriculumRow {
  stable_id: string;
  version: number;
  title: string;
  description: string | null;
  publication_state: string;
  updated_at: string;
}

const unavailable = () =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message: "Curriculum search is unavailable",
    retryable: true
  });

/**
 * Projects one authorized row into the SEARCH-001 document contract.
 *
 * Covers all four approved types, including the `course` and `mission`
 * adapters SEARCH-002 adds beyond SEARCH-001's two.
 */
export function projectCurriculumDocument(
  contentType: CurriculumSearchContentType,
  candidate: CurriculumSearchCandidate,
  query: string,
  indexedAt: string
): SearchDocument | null {
  const searchableText = [candidate.title, candidate.description ?? ""]
    .join(" ")
    .trim();

  return buildSearchDocument({
    sourceEngine: "curriculum",
    contentType,
    sourceRecordStableId: candidate.stableId,
    sourceVersion: candidate.version,
    title: candidate.title,
    // The snippet preserves the source representation; it only locates the
    // match case-insensitively.
    searchableText: buildCurriculumSearchSnippet(searchableText, query),
    sourceReference: buildCurriculumSourceReference(contentType, candidate.stableId),
    publicationState: candidate.publicationState,
    accessScope: "shared",
    sourceUpdatedAt: candidate.updatedAt,
    indexedAt
  });
}

/**
 * Reads one curriculum type and pairs every row with the SEARCH-003 decision
 * the owning Engine already made.
 *
 * The decision is derived, never invented: Curriculum's row level security
 * decided what this caller can read, and `decideFromAuthoritativeRead` only
 * records that outcome. A failed read becomes `unavailable`, which can never
 * surface; rows that came back are `authorized`, because RLS returning them IS
 * the authorization. No publication or ownership rule is re-implemented here.
 */
async function searchOneType(
  supabase: ReturnType<typeof createUserScopedSupabaseClient>,
  contentType: CurriculumSearchContentType,
  patterns: readonly string[],
  limit: number
): Promise<SearchPermissionedCandidate<CurriculumSearchCandidate>[]> {
  // SEARCH-005A: every approved variant is matched in ONE read, so broadening
  // the query never multiplies the number of source queries and never changes
  // the bounded over-fetch. Each pattern arrives already escaped.
  const matchConditions = patterns
    .flatMap((pattern) => [
      `title.ilike.%${pattern}%`,
      `description.ilike.%${pattern}%`
    ])
    .join(",");

  const { data, error } = await supabase
    .from(SEARCHABLE_TABLES[contentType])
    .select("stable_id,version,title,description,publication_state,updated_at")
    .eq("publication_state", "published")
    .or(matchConditions)
    .limit(limit * 4);

  // A source that cannot be authorized fails closed. No diagnostic reason is
  // constructed here: nothing in this path could carry one to the learner, so
  // `internalReason` stays confined to the permission contract itself.
  if (error) {
    const decision = decideFromAuthoritativeRead({
      readFailed: true,
      found: false
    });
    if (!maySurface(decision)) throw unavailable();
  }

  return ((data ?? []) as unknown as CurriculumRow[]).map((row) => ({
    decision: decideFromAuthoritativeRead({ readFailed: false, found: true }),
    value: {
      contentType,
      stableId: row.stable_id,
      version: row.version,
      title: row.title,
      ...(row.description ? { description: row.description } : {}),
      publicationState: row.publication_state,
      updatedAt: row.updated_at
    }
  }));
}

export interface CurriculumSearchInput {
  query: unknown;
  limit?: unknown;
  /** SEARCH-004: repeated `contentType` values, or nothing. */
  contentTypes?: unknown;
}

/**
 * Runs a curriculum search for the authenticated caller.
 *
 * Candidates are gathered per type, collapsed to the highest published version
 * per stable identity (a learner-facing read resolution, never a supersession
 * claim), projected, ordered neutrally and bounded.
 */
export async function searchCurriculum(
  accessToken: string,
  input: CurriculumSearchInput
): Promise<CurriculumSearchFacetedResults & CurriculumAdjustedSearchResults> {
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "An authenticated session is required",
      retryable: false
    });
  }

  const queryError = validateCurriculumSearchQuery(input.query);
  if (queryError) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: describeCurriculumSearchQueryError(queryError),
      retryable: false
    });
  }

  // SEARCH-004: an unsupported filter value is rejected rather than ignored, so
  // a learner is never told a filter applied when it did not, and a client
  // cannot probe for filter dimensions by watching which values change results.
  const filterError = validateCurriculumSearchContentTypeFilter(
    input.contentTypes
  );
  if (filterError) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: describeCurriculumSearchFilterError(filterError),
      retryable: false
    });
  }

  const query = normalizeCurriculumSearchQuery(input.query);
  const limit = normalizeCurriculumSearchLimit(input.limit);
  const filter = buildCurriculumSearchFilter(input.contentTypes);

  // SEARCH-005A: the original query is ALWAYS variant 1 and is never displaced.
  // If variant construction fails for any reason, retrieval falls back to the
  // original escaped literal query alone — never to an empty result, never to a
  // substituted meaning, and never to a widened authorization scope.
  let variants: CurriculumQueryVariant[];
  let adjustment = undefined as
    | ReturnType<typeof buildCurriculumQueryAdjustment>
    | undefined;
  try {
    variants = buildCurriculumQueryVariants(query);
    adjustment = buildCurriculumQueryAdjustment(query, variants);
  } catch {
    variants = [{ value: query, matchKind: "exact" }];
    adjustment = undefined;
  }
  if (variants.length === 0) {
    variants = [{ value: query, matchKind: "exact" }];
  }

  const indexedAt = new Date().toISOString();

  const supabase = createUserScopedSupabaseClient(accessToken);

  /**
   * One complete authorized pass.
   *
   * EVERY pass — the original and any SEARCH-005B recovery — goes through the
   * identical boundaries in the identical order: escaped patterns, the caller's
   * own RLS-scoped client, the SEARCH-003 decision, version resolution, then
   * SEARCH-004 filtering. Recovery changes which query is interpreted; it can
   * never change who is authorized to see a record, and it has no alternate
   * client or authorization path.
   */
  const runAuthorizedPass = async (
    passVariants: readonly CurriculumQueryVariant[]
  ): Promise<ClassifiedSearchDocument[]> => {
    const patterns = passVariants.map((variant) =>
      escapeCurriculumSearchPattern(variant.value)
    );

    const permissioned: SearchPermissionedCandidate<CurriculumSearchCandidate>[] =
      [];
    for (const contentType of Object.keys(
      SEARCHABLE_TABLES
    ) as CurriculumSearchContentType[]) {
      permissioned.push(
        ...(await searchOneType(supabase, contentType, patterns, limit))
      );
    }

    // SEARCH-003: only an explicit authorized decision may surface. Anything
    // else is dropped silently — no placeholder, no marker, no count.
    const candidates = surfaceAuthorized(permissioned);

    // Read resolution only. This selects which published version a learner is
    // shown; it asserts nothing about supersession and writes nothing.
    const selected = selectHighestPublishedVersion(candidates);

    // SEARCH-004 filtering happens HERE — after row level security, after the
    // permission decision and after version resolution.
    const filtered = applyCurriculumSearchFilter(selected, filter);

    // Match classification runs only on text the caller is already entitled to
    // see, so no unauthorized candidate can influence a tier.
    const passClassified: ClassifiedSearchDocument[] = [];
    for (const entry of filtered) {
      const document = projectCurriculumDocument(
        entry.contentType,
        entry,
        query,
        indexedAt
      );
      if (!document) continue;

      passClassified.push({
        document,
        matchKind: classifyCurriculumMatch(
          `${entry.title} ${entry.description ?? ""}`,
          passVariants
        )
      });
    }

    return passClassified;
  };

  let classified = await runAuthorizedPass(variants);

  // SEARCH-005B: bounded typo recovery, attempted ONLY when the normal path
  // produced zero final usable results. One pass, one corrected token, one
  // recovered variant, one edit — and only toward a term this repository has
  // already approved. If recovery finds nothing, the learner keeps the honest
  // empty result and is told nothing about the attempt.
  if (classified.length === 0) {
    const recovery = buildCurriculumTypoRecovery(query);

    if (recovery) {
      const recovered = await runAuthorizedPass([
        { value: recovery.correctedQuery, matchKind: "typo" }
      ]);

      if (recovered.length > 0) {
        classified = recovered;
        adjustment = {
          originalQuery: recovery.originalQuery,
          effectiveQuery: recovery.correctedQuery,
          adjustmentKind: "typo"
        };
      }
    }
  }

  // Facets are computed from the built, ordered, bounded result set — the exact
  // documents the learner receives. A withheld candidate is not in that input,
  // and neither is the bounded over-fetch window, so no count can describe a
  // record the learner did not get. If facet computation fails, `facets` is
  // omitted and the results still return (SEARCH-004 section 11).
  // SEARCH-008 ranks against the query that ACTUALLY produced the results in
  // hand, derived from the adjustment already recorded above rather than from a
  // second copy of the recovery literal. When a typo recovery won, that is the
  // corrected query — the same one the learner is told was searched — so a
  // recovered result is judged by the words that found it instead of collapsing
  // into the weakest precision class. In every other case the approved variant
  // set is unchanged.
  const effectiveVariants: readonly CurriculumQueryVariant[] =
    adjustment?.adjustmentKind === "typo"
      ? [{ value: adjustment.effectiveQuery, matchKind: "typo" }]
      : variants;

  // SEARCH-008 ranking applies SEARCH-002's neutral order first, then match
  // class, then title precision, and only THEN bounds — so a whole-title exact
  // match can never be truncated in favour of a description-only match. It runs
  // here, on `classified`, which exists only downstream of the caller's
  // RLS-scoped read, the SEARCH-003 decision, version resolution and SEARCH-004
  // filtering: a withheld record is not in its input and cannot influence an
  // order, a tie-break or a count. Facets are still computed from the final
  // bounded result set, so the SEARCH-004 count guarantee is unchanged. The
  // adjustment is attached last and omitted when nothing meaningful changed.
  return withCurriculumQueryAdjustment(
    withCurriculumSearchFacets(
      buildRankedCurriculumSearchResults(classified, effectiveVariants, limit)
    ),
    adjustment
  );
}
