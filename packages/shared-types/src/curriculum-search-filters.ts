import {
  CURRICULUM_SEARCH_CONTENT_TYPES,
  describeCurriculumContentType,
  isCurriculumSearchContentType,
  type CurriculumSearchContentType,
  type CurriculumSearchResults
} from "./curriculum-search";

/**
 * SEARCH-004 — Search Filters and Facets.
 *
 * One filter dimension, one facet dimension: **content type**.
 *
 * ## Why only content type
 *
 * SEARCH-004 section 5 lists filters that *may* be approved — Learning Path,
 * Course, Module, Mission, Competency, Lab, Tag, private versus shared, and
 * publication state. Repository inspection found that content type is the only
 * one of them that today's authorized result already carries authoritatively.
 * The rest would require either inventing a vocabulary that no table holds, or
 * joining Curriculum hierarchy that SEARCH-002 does not read. Both were
 * declined; the dispositions are recorded in
 * `CURRICULUM_SEARCH_FILTER_DISPOSITIONS` as reviewable data.
 *
 * ## Facet counts describe the returned results, and nothing else
 *
 * Section 8: *"Facets must be computed only from content the current user is
 * authorized to discover. A facet count must not leak the existence of hidden
 * records."*
 *
 * `buildCurriculumSearchFacets` therefore takes the final, bounded, already
 * authorized result set and counts it. It cannot see a candidate that row level
 * security withheld, a candidate SEARCH-003 refused to surface, an older
 * published version the read resolution dropped, or a row beyond the service's
 * bounded over-fetch window — none of those are in its input. The invariant
 * `sum(facet counts) === results.length` is therefore true by construction
 * rather than by discipline, and a leak would have to change the input, not the
 * arithmetic.
 *
 * There is deliberately no corpus total, global total, candidate count, hidden
 * count, withheld count or over-fetch count. `CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS`
 * holds that prohibition as data so tests and the verifier assert it directly.
 *
 * ## Deliberately not implemented
 *
 * SEARCH-005 typo tolerance, synonyms and stemming · SEARCH-006 note results ·
 * SEARCH-007 index, cache, queue or worker · SEARCH-008 ranking, scoring and
 * weighting. Filtering removes results; it never reorders them.
 *
 * Pure module: no I/O, no clock, no randomness, no AI.
 */

export const CURRICULUM_SEARCH_FILTER_MODEL_VERSION =
  "curriculum-search-filters-v1";

/** Every filter dimension SEARCH-004 exposes. Exactly one. */
export const CURRICULUM_SEARCH_FILTER_DIMENSIONS = ["contentType"] as const;

export type CurriculumSearchFilterDimension =
  (typeof CURRICULUM_SEARCH_FILTER_DIMENSIONS)[number];

/**
 * The filterable vocabulary: exactly the types SEARCH-002 can return.
 *
 * Deriving it from `CURRICULUM_SEARCH_CONTENT_TYPES` rather than restating it
 * means a filter value can never name something search cannot produce, and a
 * future searchable type cannot be silently unfilterable.
 */
export const CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES =
  CURRICULUM_SEARCH_CONTENT_TYPES;

export const CURRICULUM_SEARCH_MAX_CONTENT_TYPE_FILTERS =
  CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES.length;

export type CurriculumSearchFilterError =
  | "content_type_unknown"
  | "content_type_too_many";

/**
 * Filter dimensions SEARCH-004 does not expose, and why.
 *
 * Recorded as data so the decision is reviewable and testable rather than
 * folklore, and so a later batch adding one has to change this list on purpose.
 */
export const CURRICULUM_SEARCH_FILTER_DISPOSITIONS: readonly {
  dimension: string;
  disposition: "deferred" | "not_applicable" | "not_exposed";
  reason: string;
}[] = [
  {
    dimension: "learningPath",
    disposition: "deferred",
    reason:
      "Requires a deliberate future Search/Curriculum architecture decision based on authoritative hierarchy relationships and implementation cost. Curriculum parents are UUID foreign keys, and SEARCH-002 reads no hierarchy."
  },
  {
    dimension: "course",
    disposition: "deferred",
    reason:
      "Hierarchy filter. Same deliberate future decision as learningPath; course is filterable only as a content type today."
  },
  {
    dimension: "module",
    disposition: "deferred",
    reason:
      "learning_module is not a searchable result type, and missions reference modules by UUID only."
  },
  {
    dimension: "mission",
    disposition: "deferred",
    reason:
      "Hierarchy filter. Same deliberate future decision; mission is filterable only as a content type today."
  },
  {
    dimension: "competency",
    disposition: "deferred",
    reason:
      "Mission-to-competency relationships link by UUID through a join SEARCH-002 does not perform; competency is filterable only as a content type today."
  },
  {
    dimension: "lab",
    disposition: "not_applicable",
    reason: "Labs are not a searchable result type. SEARCH-004 adds no lab search."
  },
  {
    dimension: "tag",
    disposition: "not_applicable",
    reason:
      "No authoritative Curriculum tag model exists. The Notes tag model describes notes, not curriculum, and was not borrowed."
  },
  {
    dimension: "accessScope",
    disposition: "not_applicable",
    reason:
      "Every current result is shared published curriculum, so private versus shared distinguishes nothing. No private source was invented."
  },
  {
    dimension: "publicationState",
    disposition: "not_exposed",
    reason:
      "Published-only is an authorization and publication invariant, not a learner choice. A filter must never provide a mechanism for requesting draft, review or retired curriculum."
  }
];

/**
 * Count fields that must never appear in a search response.
 *
 * Each one would answer "how much exists that you cannot see?", which is the
 * hidden-record side channel section 8 forbids.
 */
export const CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS: readonly string[] = [
  "candidateCount",
  "totalCount",
  "globalTotal",
  "hiddenCount",
  "unauthorizedCount",
  "withheldCount",
  "overFetchCount",
  "corpusTotal",
  "matchedTotal"
];

/**
 * A normalized filter selection.
 *
 * An empty `contentTypes` means no content-type filtering — the same result set
 * an unfiltered search returns.
 */
export interface CurriculumSearchFilter {
  contentTypes: CurriculumSearchContentType[];
}

/**
 * Normalizes a raw content-type selection into a deterministic set.
 *
 * Accepts a single value, a repeated value list, or nothing. Duplicates
 * collapse, and output is always in the fixed vocabulary order, so
 * `?contentType=mission&contentType=course&contentType=mission` and
 * `?contentType=course&contentType=mission` produce byte-identical filters.
 *
 * Unrecognised values are dropped here; rejecting them is
 * `validateCurriculumSearchContentTypeFilter`'s job, so a caller cannot get a
 * silently-ignored filter by skipping validation and a caller cannot get an
 * unsupported type by skipping normalization.
 */
export function normalizeCurriculumSearchContentTypeFilter(
  value: unknown
): CurriculumSearchContentType[] {
  const raw =
    value === undefined || value === null
      ? []
      : Array.isArray(value)
        ? value
        : [value];

  const selected = new Set<CurriculumSearchContentType>();
  for (const entry of raw) {
    const candidate = typeof entry === "string" ? entry.trim() : entry;
    if (isCurriculumSearchContentType(candidate)) selected.add(candidate);
  }

  return CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES.filter((contentType) =>
    selected.has(contentType)
  );
}

/**
 * Rejects an unsupported selection rather than silently ignoring it.
 *
 * Silently dropping an unknown value would tell a learner their filter applied
 * when it did not, and would let a client probe for filter dimensions by
 * watching which values change the results.
 *
 * The uniqueness cap is defence in depth: with today's four-value vocabulary a
 * normalized selection cannot exceed four, so this check guards vocabulary
 * growth rather than any reachable request.
 */
export function validateCurriculumSearchContentTypeFilter(
  value: unknown
): CurriculumSearchFilterError | null {
  const raw =
    value === undefined || value === null
      ? []
      : Array.isArray(value)
        ? value
        : [value];

  for (const entry of raw) {
    const candidate = typeof entry === "string" ? entry.trim() : entry;
    if (candidate === "") continue;
    if (!isCurriculumSearchContentType(candidate)) return "content_type_unknown";
  }

  const normalized = normalizeCurriculumSearchContentTypeFilter(value);
  if (normalized.length > CURRICULUM_SEARCH_MAX_CONTENT_TYPE_FILTERS) {
    return "content_type_too_many";
  }

  return null;
}

export function describeCurriculumSearchFilterError(
  error: CurriculumSearchFilterError
): string {
  return error === "content_type_unknown"
    ? `Filter by one of: ${CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES.map(
        describeCurriculumContentType
      ).join(", ")}.`
    : `Choose ${CURRICULUM_SEARCH_MAX_CONTENT_TYPE_FILTERS} content types or fewer.`;
}

export function buildCurriculumSearchFilter(
  value: unknown
): CurriculumSearchFilter {
  return { contentTypes: normalizeCurriculumSearchContentTypeFilter(value) };
}

/** True when no filter is selected — the unfiltered case. */
export function isUnfilteredCurriculumSearch(
  filter: CurriculumSearchFilter
): boolean {
  return filter.contentTypes.length === 0;
}

/** The cleared filter a clear-all control restores. */
export function clearCurriculumSearchFilter(): CurriculumSearchFilter {
  return { contentTypes: [] };
}

/**
 * Keeps only results whose content type was selected.
 *
 * Order is preserved exactly: filtering removes results, and never reorders,
 * scores or weights them. An empty selection returns everything.
 *
 * This runs on results that are already authorized, already permission-checked
 * and already version-resolved. It is a presentation narrowing, never an
 * authorization step — no filter value can widen what the caller may read.
 */
export function applyCurriculumSearchFilter<
  T extends { readonly contentType: string }
>(results: readonly T[], filter: CurriculumSearchFilter): T[] {
  if (isUnfilteredCurriculumSearch(filter)) return [...results];

  const selected = new Set<string>(filter.contentTypes);
  return results.filter((result) => selected.has(result.contentType));
}

/** One facet value and how many of the returned results carry it. */
export interface CurriculumSearchFacetValue {
  value: CurriculumSearchContentType;
  label: string;
  count: number;
}

export interface CurriculumSearchFacets {
  contentTypes: CurriculumSearchFacetValue[];
}

/**
 * Counts the returned results by content type.
 *
 * The input is the final bounded authorized result set, so every count is
 * literally "how many of these results are of this type". A type with no
 * returned result is omitted rather than reported as zero: a zero would be a
 * claim about content the learner did not receive, which is exactly the
 * existence signal section 8 forbids.
 *
 * Output follows the fixed vocabulary order, so facets never imply relevance.
 */
export function buildCurriculumSearchFacets(
  results: readonly { readonly contentType: string }[]
): CurriculumSearchFacets {
  const counts = new Map<CurriculumSearchContentType, number>();

  for (const result of results) {
    const contentType = result.contentType;
    // Only the approved vocabulary may become a facet value. A result carrying
    // anything else contributes to no facet rather than inventing one.
    if (!isCurriculumSearchContentType(contentType)) continue;
    counts.set(contentType, (counts.get(contentType) ?? 0) + 1);
  }

  return {
    contentTypes: CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES.filter(
      (contentType) => (counts.get(contentType) ?? 0) > 0
    ).map((contentType) => ({
      value: contentType,
      label: describeCurriculumContentType(contentType),
      count: counts.get(contentType) ?? 0
    }))
  };
}

/**
 * Facets, or nothing at all.
 *
 * Section 11: if facet calculation fails, core search remains usable and
 * filters may be temporarily omitted. Returning `undefined` rather than an
 * empty or partial facet set means a failure can never be mistaken for "no
 * results of that type", and can never surface unauthorized metadata.
 */
export function buildCurriculumSearchFacetsSafely(
  results: readonly { readonly contentType: string }[]
): CurriculumSearchFacets | undefined {
  try {
    return buildCurriculumSearchFacets(results);
  } catch {
    return undefined;
  }
}

/**
 * The learner-facing result set with facets attached.
 *
 * `facets` is optional precisely because section 11 allows it to be omitted.
 * `count` keeps its SEARCH-002 meaning — authorized results actually returned —
 * and no new total joins it.
 */
export interface CurriculumSearchFacetedResults extends CurriculumSearchResults {
  facets?: CurriculumSearchFacets;
}

/**
 * Asserts the only invariant that makes facet counts safe to publish.
 *
 * If the facet counts summed to more than the results returned, they would be
 * describing records the learner did not receive. Exposed as a function so the
 * service, the tests and the verifier all check the same thing.
 */
export function curriculumSearchFacetCountsMatchResults(
  results: CurriculumSearchFacetedResults
): boolean {
  if (!results.facets) return true;

  const facetTotal = results.facets.contentTypes.reduce(
    (total, facet) => total + facet.count,
    0
  );

  return facetTotal === results.count && results.count === results.results.length;
}

/**
 * Neutral wording for a facet count.
 *
 * Says "in these results" and never "in the platform", "found overall" or any
 * other phrasing that would imply a corpus-wide total the count is not.
 */
export function describeCurriculumSearchFacetCount(count: number): string {
  return count === 1 ? "1 in these results" : `${count} in these results`;
}

/** The accessible label for one facet control. */
export function describeCurriculumSearchFacetOption(
  facet: CurriculumSearchFacetValue
): string {
  return `${facet.label}, ${describeCurriculumSearchFacetCount(facet.count)}`;
}

/** The legend for the filter group, and the clear-all control's label. */
export function describeCurriculumSearchFilterLegend(): string {
  return "Narrow these results by content type";
}

export function describeCurriculumSearchClearFilters(): string {
  return "Clear filters";
}

/** Attaches facets to an already-built result set, omitting them on failure. */
export function withCurriculumSearchFacets(
  results: CurriculumSearchResults
): CurriculumSearchFacetedResults {
  const facets = buildCurriculumSearchFacetsSafely(results.results);
  return { ...results, ...(facets ? { facets } : {}) };
}
