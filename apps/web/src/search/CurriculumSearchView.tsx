import { useEffect, useState } from "react";
import {
  CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES,
  buildCurriculumFallbackGuidance,
  buildCurriculumSearchSnippet,
  describeCurriculumContentType,
  describeCurriculumFallbackHeading,
  describeCurriculumNavigationEmpty,
  describeCurriculumNavigationHeading,
  describeCurriculumNavigationIntro,
  describeCurriculumNavigationLoading,
  describeCurriculumNavigationUnavailable,
  describeCurriculumRankingOrder,
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
  describeCurriculumResultGroup,
  describeNoteResultGroup,
  describeNoteSearchCount,
  describeNoteSearchUnavailable,
  validateCurriculumSearchQuery,
  type CurriculumNavigationEntry,
  type CurriculumSearchContentType,
  type NoteSearchResult,
  type SearchDocument,
  type SearchFallbackReason
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import {
  searchCurriculum,
  type CurriculumSearchResponse
} from "./curriculum-search-service";
import { listCurriculumNavigation } from "./curriculum-navigation-service";
import { searchMyNotes } from "./note-search-service";

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
 * ## SEARCH-008 — ranking and fallback
 *
 * Curriculum results are rendered as an ORDERED list, because after SEARCH-008
 * their order carries meaning, and the ordering rule is stated in plain text
 * above them. No per-result ranking annotation, position number, score or
 * internal ordering value is rendered, and no sort control exists — the order is
 * deterministic and is not the learner's to configure.
 *
 * Two failure states are kept strictly apart. `degraded` means the curriculum
 * search could not run; a zero `count` means it ran, was authorized, and matched
 * nothing. They produce different wording, and a dependency failure is never
 * shown as an empty result.
 *
 * Structured navigation is offered in both states by composing the existing
 * authenticated published-paths read. It never carries an identity parameter,
 * and a failed navigation read is shown as a failure rather than as an empty
 * curriculum.
 *
 * Deliberately absent: any AI search experience.
 */

/**
 * Structured curriculum navigation (SEARCH-008 section 12.4).
 *
 * Loads once per mount through the caller's own session. It renders three
 * mutually exclusive honest states — loading, unavailable, and the entries the
 * caller may actually see — so "we could not load this" is never displayed as
 * "there is nothing here".
 *
 * The list is UNORDERED: unlike search results, published learning paths carry
 * no ranking, and presenting them as ranked would imply a judgement Search did
 * not make.
 */
function CurriculumNavigationPanel({
  reason,
  accessToken
}: {
  reason: SearchFallbackReason;
  accessToken: string;
}) {
  const [entries, setEntries] = useState<CurriculumNavigationEntry[] | null>(
    null
  );
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setUnavailable(false);

    listCurriculumNavigation(accessToken)
      .then((loaded) => {
        if (!cancelled) setEntries(loaded);
      })
      .catch(() => {
        if (cancelled) return;
        // A failed read is a failure. It must never become an empty list.
        setEntries(null);
        setUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <section aria-labelledby="curriculum-navigation-heading">
      <h4 id="curriculum-navigation-heading">
        {describeCurriculumNavigationHeading()}
      </h4>
      <p>{describeCurriculumNavigationIntro(reason)}</p>

      {unavailable && (
        <p className="form-message" role="status">
          {describeCurriculumNavigationUnavailable()}
        </p>
      )}

      {!unavailable && entries === null && (
        <p aria-live="polite">{describeCurriculumNavigationLoading()}</p>
      )}

      {!unavailable && entries !== null && entries.length === 0 && (
        <p role="status">{describeCurriculumNavigationEmpty()}</p>
      )}

      {!unavailable && entries !== null && entries.length > 0 && (
        <ul aria-labelledby="curriculum-navigation-heading">
          {entries.map((entry) => (
            <li key={entry.stableId}>
              <a href={entry.reference}>{entry.title}</a>
              {entry.description ? <span> — {entry.description}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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

/**
 * One of the learner's own notes.
 *
 * Renders only fields the note's own owner may already see. There is no owner
 * identity, no permission state and no authorization diagnostic — the learner
 * receives a note only because the database returned it to them.
 */
function NoteResult({ note }: { note: NoteSearchResult }) {
  const headingId = `note-${note.noteId}-title`;

  return (
    <li className="card" aria-labelledby={headingId}>
      {/* The group is private; say so in words, not by colour or icon alone. */}
      <p className="eyebrow">{describeNoteResultGroup()}</p>
      <h4 id={headingId}>{note.title}</h4>

      {note.excerpt && <p>{note.excerpt}</p>}

      <p>
        <a href={`/notes/${note.noteId}`}>Open {note.title}</a>
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
   * SEARCH-008: the query the SERVER was actually asked, captured when the
   * search ran. The input box may have been edited since, and fallback wording
   * naming a query the learner never submitted would be a false statement about
   * what was searched.
   */
  const [searchedQuery, setSearchedQuery] = useState("");
  /**
   * SEARCH-008 ruling 7: TRUE only when curriculum search could not run.
   *
   * `error` alone cannot carry this — it also holds ordinary validation messages
   * such as an empty query, and those are neither a dependency failure nor an
   * empty result. This flag is what keeps "search failed" from ever being
   * rendered as "0 results".
   */
  const [degraded, setDegraded] = useState(false);
  /**
   * SEARCH-005B: the learner asked to see their own words instead of the
   * recovered query. No request is needed — recovery only ever runs when the
   * server already executed the original query and it returned nothing, so the
   * empty state shown here is a result the server actually produced, not a
   * guess. Re-submitting the form re-runs the original query normally.
   */
  const [showingOriginal, setShowingOriginal] = useState(false);
  /**
   * SEARCH-006: the learner's own notes, held separately from curriculum so
   * either source can succeed or fail without affecting the other. `null` means
   * "not searched or unavailable" and is never rendered as an empty result.
   */
  const [notes, setNotes] = useState<NoteSearchResult[] | null>(null);
  const [noteError, setNoteError] = useState("");

  /**
   * The selection is passed in rather than read from state, so a filter change
   * always searches with the selection the learner just made.
   */
  async function runSearch(
    selected: readonly CurriculumSearchContentType[]
  ): Promise<void> {
    const queryError = validateCurriculumSearchQuery(query);
    if (queryError) {
      // A rejected query is neither a dependency failure nor an empty result.
      setError(describeCurriculumSearchQueryError(queryError));
      setResults(null);
      setDegraded(false);
      return;
    }

    setSearching(true);
    setError("");
    setDegraded(false);
    setSearchedQuery(query);
    setShowingOriginal(false);
    setNoteError("");

    // SEARCH-006: the two sources are searched INDEPENDENTLY and settled
    // separately, so a failure in one can never erase valid results from the
    // other. Curriculum keeps its own error state; notes keep theirs.
    const [curriculumOutcome, noteOutcome] = await Promise.allSettled([
      searchCurriculum(accessToken, { query, contentTypes: selected }),
      searchMyNotes(accessToken, { query })
    ]);

    if (curriculumOutcome.status === "fulfilled") {
      setResults(curriculumOutcome.value);
    } else {
      // Honest failure. SEARCH-002 section 12 assumes structured curriculum
      // navigation exists to fall back to; it does not exist in this
      // application yet, so the message does not claim it does.
      const caught = curriculumOutcome.reason;
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : describeCurriculumSearchFallback()
      );
      setResults(null);
      // SEARCH-008: this, and only this, is the degraded state.
      setDegraded(true);
    }

    if (noteOutcome.status === "fulfilled") {
      setNotes(noteOutcome.value);
    } else {
      // A failed notes search must never be shown as "you have no notes".
      setNotes(null);
      setNoteError(describeNoteSearchUnavailable());
    }

    setSearching(false);
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

  /**
   * SEARCH-008: which fallback state, if either, the learner is in.
   *
   * The two are mutually exclusive and are derived from different facts. The
   * degraded state comes from a rejected request; the empty state comes from a
   * SUCCESSFUL response whose returned count is zero. `count` is the number of
   * authorized results actually returned — there is no candidate, withheld or
   * global total in the response, so no hidden record can reach this decision.
   */
  const fallbackReason: SearchFallbackReason | undefined = degraded
    ? "search_unavailable"
    : results && !error && results.count === 0
      ? "no_results"
      : undefined;

  /**
   * Guidance is built from the learner's own submitted query and whether a
   * filter is currently active. No result, document, count or note is passed in,
   * and the function has no parameter that could carry one.
   */
  const fallbackGuidance = fallbackReason
    ? buildCurriculumFallbackGuidance({
        reason: fallbackReason,
        query: searchedQuery,
        filterActive: contentTypes.length > 0
      })
    : undefined;

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
        <section aria-labelledby="curriculum-results-heading">
          <h3 id="curriculum-results-heading">
            {describeCurriculumResultGroup()}
          </h3>

          {/* SEARCH-008 section 10 — the ordering rule stated as ordinary text,
              so the order is understandable without seeing the page. It
              describes the RULE and never an individual result: no per-result
              annotation, position number or internal ordering value is
              rendered anywhere below. */}
          {results.results.length > 1 && <p>{describeCurriculumRankingOrder()}</p>}

          {/* ORDERED, because after SEARCH-008 the sequence carries meaning. */}
          <ol aria-labelledby="curriculum-results-heading">
            {results.results.map((result) => (
              <SearchResult key={result.documentId} result={result} />
            ))}
          </ol>
        </section>
      )}

      {/* SEARCH-008 fallback. Reached from exactly two states, which are never
          conflated: a SUCCESSFUL search that returned nothing, and a curriculum
          search that could not run. Each states its own fact, and structured
          navigation is offered in both.

          Every suggestion is an offer the learner may take. Nothing here
          broadens the query, generates a term, alters a filter or re-runs a
          search on its own — SEARCH-005 owns query interpretation and this is
          not a second correction system. */}
      {fallbackGuidance && !showingOriginal && (
        <section aria-labelledby="search-fallback-heading">
          <h3 id="search-fallback-heading">
            {describeCurriculumFallbackHeading()}
          </h3>

          <p role="status">{fallbackGuidance.headline}</p>

          <ul aria-labelledby="search-fallback-heading">
            {fallbackGuidance.suggestions.map((suggestion) => (
              <li key={suggestion.action}>
                {suggestion.action === "clear_filters" ? (
                  // The learner chooses. This reuses the existing clear-all
                  // control rather than relaxing the filter automatically.
                  <button type="button" onClick={clearFilters} disabled={searching}>
                    {suggestion.label}
                  </button>
                ) : (
                  suggestion.label
                )}
              </li>
            ))}
          </ul>

          <CurriculumNavigationPanel
            reason={fallbackGuidance.reason}
            accessToken={accessToken}
          />
        </section>
      )}

      {/* SEARCH-006 — the learner's own private notes, in their own section.
          It renders independently of curriculum: a failure in either source
          leaves the other intact. A failed notes search shows an honest
          unavailable message and is NEVER shown as "no notes". */}
      {noteError && !showingOriginal && (
        <section aria-labelledby="note-results-heading">
          <h3 id="note-results-heading">{describeNoteResultGroup()}</h3>
          <p className="form-message" role="status">
            {noteError}
          </p>
        </section>
      )}

      {notes && !noteError && !showingOriginal && (
        <section aria-labelledby="note-results-heading">
          <h3 id="note-results-heading">{describeNoteResultGroup()}</h3>
          <p aria-live="polite">{describeNoteSearchCount(notes.length)}</p>

          {notes.length > 0 && (
            <ul aria-labelledby="note-results-heading">
              {notes.map((note) => (
                <NoteResult key={note.noteId} note={note} />
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
