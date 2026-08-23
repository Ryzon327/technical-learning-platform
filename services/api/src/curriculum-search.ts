import type {
  CurriculumSearchCandidate,
  CurriculumSearchContentType,
  CurriculumSearchFacetedResults,
  SearchDocument
} from "@tlp/shared-types";
import type { SearchPermissionedCandidate } from "@tlp/shared-types";
import {
  AppError,
  applyCurriculumSearchFilter,
  buildCurriculumSearchFilter,
  buildCurriculumSearchResults,
  buildCurriculumSearchSnippet,
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
 * ## Deliberately not implemented
 *
 * SEARCH-005 typo tolerance, synonyms and acronym aliases · SEARCH-006 note
 * results · SEARCH-007 indexing pipeline · SEARCH-008 relevance ranking.
 * Matching is literal substring; ordering is neutral.
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
  pattern: string,
  limit: number
): Promise<SearchPermissionedCandidate<CurriculumSearchCandidate>[]> {
  const { data, error } = await supabase
    .from(SEARCHABLE_TABLES[contentType])
    .select("stable_id,version,title,description,publication_state,updated_at")
    .eq("publication_state", "published")
    .or(`title.ilike.%${pattern}%,description.ilike.%${pattern}%`)
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
): Promise<CurriculumSearchFacetedResults> {
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
  const pattern = escapeCurriculumSearchPattern(query);
  const indexedAt = new Date().toISOString();

  const supabase = createUserScopedSupabaseClient(accessToken);

  const permissioned: SearchPermissionedCandidate<CurriculumSearchCandidate>[] =
    [];
  for (const contentType of Object.keys(
    SEARCHABLE_TABLES
  ) as CurriculumSearchContentType[]) {
    permissioned.push(
      ...(await searchOneType(supabase, contentType, pattern, limit))
    );
  }

  // SEARCH-003: only an explicit authorized decision may surface. Anything else
  // is dropped silently — no placeholder, no marker, no contribution to count.
  const candidates = surfaceAuthorized(permissioned);

  // Read resolution only. This selects which published version a learner is
  // shown; it asserts nothing about supersession and writes nothing.
  const selected = selectHighestPublishedVersion(candidates);

  // SEARCH-004 filtering happens HERE — after row level security, after the
  // permission decision and after version resolution. Every source is still
  // read exactly as an unfiltered search reads it, so the authorized candidate
  // set is identical whether or not a filter was supplied: the filter narrows
  // presentation and can never widen, redirect or influence authorization.
  const filtered = applyCurriculumSearchFilter(selected, filter);

  const documents: SearchDocument[] = [];
  for (const entry of filtered) {
    const document = projectCurriculumDocument(
      entry.contentType,
      entry,
      query,
      indexedAt
    );
    if (document) documents.push(document);
  }

  // Facets are computed from the built, ordered, bounded result set — the exact
  // documents the learner receives. A withheld candidate is not in that input,
  // and neither is the bounded over-fetch window, so no count can describe a
  // record the learner did not get. If facet computation fails, `facets` is
  // omitted and the results still return (SEARCH-004 section 11).
  return withCurriculumSearchFacets(
    buildCurriculumSearchResults(documents, limit)
  );
}
