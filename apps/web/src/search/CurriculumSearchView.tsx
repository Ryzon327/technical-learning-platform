import { useState } from "react";
import {
  CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES,
  buildCurriculumSearchSnippet,
  describeCurriculumContentType,
  describeCurriculumSearchClearFilters,
  describeCurriculumSearchCount,
  describeCurriculumSearchFacetCount,
  describeCurriculumSearchFallback,
  describeCurriculumSearchFilterLegend,
  describeCurriculumSearchQueryError,
  describeCurriculumQueryAdjustment,
  describeCurriculumOriginalQueryAction,
  describeCurriculumOriginalQueryEmptyState,
  describeCurriculumTypoRecovery,
  validateCurriculumSearchQuery,
  type CurriculumSearchContentType,
  type SearchDocument
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import {
  searchCurriculum,
  type CurriculumSearchResponse
} from "./curriculum-search-service";

/**
 * SEARCH-002 — learner-facing curriculum search.
 * SEARCH-004 — content-type filters and facets.
 *
 * Presentation only. Every result is a projection of an authoritative
 * curriculum record the server already authorized; nothing is decided here.
 *
 * Accessibility (SEARCH-002 section 10, SEARCH-004 section 9):
 *  - a real <form> with a programmatically associated <label>, so submitting
 *    with the keyboard works without any key handling of our own
 *  - filters are a <fieldset> with a <legend> and four native <input
 *    type="checkbox"> controls, each with its own <label htmlFor>. Native
 *    controls are keyboard operable, expose their own selected state to
 *    assistive technology, and work on mobile without any custom handling
 *  - a real <button> clears every filter at once
 *  - selection and counts are always WORDS: colour is never the only signal,
 *    and there is no drag-and-drop anywhere
 *  - the returned result count is announced in a polite live region
 *  - results are a semantic list, each with a heading, the content type in
 *    TEXT, a source-preserving snippet and a plain link
 *  - bounded loading: the server returns at most the requested limit, and there
 *    is no infinite scroll
 *
 * ## What a facet count means here
 *
 * Every count describes THESE RESULTS — the authorized documents the server
 * returned — and never the platform as a whole. The wording says so
 * ("3 in these results"), because a corpus-wide total would be a claim about
 * content the learner did not receive.
 *
 * If the server omits `facets`, the filters still work and the counts simply do
 * not appear (SEARCH-004 section 11).
 *
 * Deliberately absent: typo suggestions or "did you mean" (SEARCH-005), note
 * results (SEARCH-006), ranking explanations or sort controls (SEARCH-008), and
 * any AI search experience.
 */

function SearchResult({ result }: { result: SearchDocument }) {
  const headingId = `result-${result.documentId}-title`;

  return (
    <li className="card" aria-labelledby={headingId}>
      {/* Content type as text, never a colour or icon alone. */}
      <p className="eyebrow">{describeCurriculumContentType(result.contentType)}</p>
      <h3 id={headingId}>{result.title}</h3>

      {result.searchableText && (
        <p>{buildCurriculumSearchSnippet(result.searchableText, "")}</p>
      )}

      <p>
        <a href={result.sourceReference}>Open {result.title}</a>
      </p>
    </li>
  );
}

export function CurriculumSearchView() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [query, setQuery] = useState("");
  const [contentTypes, setContentTypes] = useState<CurriculumSearchContentType[]>(
    []
  );
  const [results, setResults] = useState<CurriculumSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  /**
   * SEARCH-005B: the learner asked to see their own words instead of the
   * recovered query. No request is needed — recovery only ever runs when the
   * server already executed the original query and it returned nothing, so the
   * empty state shown here is a result the server actually produced, not a
   * guess. Re-submitting the form re-runs the original query normally.
   */
  const [showingOriginal, setShowingOriginal] = useState(false);

  /**
   * The selection is passed in rather than read from state, so a filter change
   * always searches with the selection the learner just made.
   */
  async function runSearch(
    selected: readonly CurriculumSearchContentType[]
  ): Promise<void> {
    const queryError = validateCurriculumSearchQuery(query);
    if (queryError) {
      setError(describeCurriculumSearchQueryError(queryError));
      setResults(null);
      return;
    }

    setSearching(true);
    setError("");
    setShowingOriginal(false);

    try {
      setResults(
        await searchCurriculum(accessToken, { query, contentTypes: selected })
      );
    } catch (caught) {
      // Honest failure. SEARCH-002 section 12 assumes structured curriculum
      // navigation exists to fall back to; it does not exist in this
      // application yet, so the message does not claim it does.
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : describeCurriculumSearchFallback()
      );
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  function toggleContentType(contentType: CurriculumSearchContentType): void {
    const next = contentTypes.includes(contentType)
      ? contentTypes.filter((entry) => entry !== contentType)
      : [...contentTypes, contentType];

    setContentTypes(next);
    void runSearch(next);
  }

  function clearFilters(): void {
    setContentTypes([]);
    void runSearch([]);
  }

  /** The count of a type among the returned results, when the server sent one. */
  function facetCount(
    contentType: CurriculumSearchContentType
  ): number | undefined {
    return results?.facets?.contentTypes.find(
      (facet) => facet.value === contentType
    )?.count;
  }

  return (
    <section className="card" aria-labelledby="curriculum-search-title">
      <p className="eyebrow">Search Engine</p>
      <h2 id="curriculum-search-title">Search curriculum</h2>
      <p>
        Find published learning content by title or description. Technical terms
        such as <code>kubectl</code> or <code>show vlan brief</code> are matched
        exactly as you type them.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(contentTypes);
        }}
      >
        <label htmlFor="curriculum-search-query">What are you looking for?</label>
        <input
          id="curriculum-search-query"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={200}
        />

        <button type="submit" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {results && (
        <fieldset>
          <legend>{describeCurriculumSearchFilterLegend()}</legend>

          {CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES.map((contentType) => {
            const inputId = `curriculum-search-filter-${contentType}`;
            const count = facetCount(contentType);

            return (
              <p key={contentType}>
                <input
                  id={inputId}
                  type="checkbox"
                  checked={contentTypes.includes(contentType)}
                  disabled={searching}
                  onChange={() => toggleContentType(contentType)}
                />
                {/* Label text carries the type and, where known, how many of
                    THESE results are of that type. Never a platform total. */}
                <label htmlFor={inputId}>
                  {describeCurriculumContentType(contentType)}
                  {count === undefined
                    ? ""
                    : ` — ${describeCurriculumSearchFacetCount(count)}`}
                </label>
              </p>
            );
          })}

          <button
            type="button"
            onClick={clearFilters}
            disabled={searching || contentTypes.length === 0}
          >
            {describeCurriculumSearchClearFilters()}
          </button>
        </fieldset>
      )}

      {/* SEARCH-005A/005B transparency. States the one meaningful adjustment in
          words, naming the learner's own query first. It exposes no retrieval
          pattern, variant list, candidate count, edit distance or other
          algorithm internal, and appears only when something actually changed.

          For a NORMALIZED or ALIAS adjustment no suppression control is offered
          and none is needed: the original query was searched too, and exact
          matches are shown first.

          For a TYPO recovery the original query returned nothing, so SEARCH-005
          section 10's "return to the original query" is a real affordance. It
          needs no request: the server already executed the original query and
          it produced zero authorized results, so the empty state below is a
          result the server actually produced. */}
      {results?.queryAdjustment && !error && !showingOriginal && (
        <p aria-live="polite">
          {results.queryAdjustment.adjustmentKind === "typo"
            ? describeCurriculumTypoRecovery({
                originalQuery: results.queryAdjustment.originalQuery,
                correctedQuery: results.queryAdjustment.effectiveQuery
              })
            : describeCurriculumQueryAdjustment(results.queryAdjustment)}
        </p>
      )}

      {results?.queryAdjustment?.adjustmentKind === "typo" &&
        !error &&
        !showingOriginal && (
          <p>
            <button type="button" onClick={() => setShowingOriginal(true)}>
              {describeCurriculumOriginalQueryAction(
                results.queryAdjustment.originalQuery
              )}
            </button>
          </p>
        )}

      {results?.queryAdjustment?.adjustmentKind === "typo" &&
        !error &&
        showingOriginal && (
          <p aria-live="polite">
            {describeCurriculumOriginalQueryEmptyState(
              results.queryAdjustment.originalQuery
            )}
          </p>
        )}

      <p aria-live="polite">
        {searching
          ? "Searching curriculum…"
          : showingOriginal
            ? ""
            : results
              ? describeCurriculumSearchCount(results.count)
              : ""}
      </p>

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      {results && !error && !showingOriginal && results.results.length > 0 && (
        <ul aria-labelledby="curriculum-search-title">
          {results.results.map((result) => (
            <SearchResult key={result.documentId} result={result} />
          ))}
        </ul>
      )}
    </section>
  );
}
