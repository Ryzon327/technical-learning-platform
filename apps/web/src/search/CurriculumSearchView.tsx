import { useState } from "react";
import {
  buildCurriculumSearchSnippet,
  describeCurriculumContentType,
  describeCurriculumSearchCount,
  describeCurriculumSearchFallback,
  describeCurriculumSearchQueryError,
  validateCurriculumSearchQuery,
  type CurriculumSearchResults,
  type SearchDocument
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import { searchCurriculum } from "./curriculum-search-service";

/**
 * SEARCH-002 — learner-facing curriculum search.
 *
 * Presentation only. Every result is a projection of an authoritative
 * curriculum record the server already authorized; nothing is decided here.
 *
 * Accessibility (SEARCH-002 section 10):
 *  - a real <form> with a programmatically associated <label>, so submitting
 *    with the keyboard works without any key handling of our own
 *  - the returned result count is announced in a polite live region
 *  - results are a semantic list, each with a heading, the content type in
 *    TEXT, a source-preserving snippet and a plain link
 *  - bounded loading: the server returns at most the requested limit, and there
 *    is no infinite scroll
 *  - status is always words; colour is never the only signal
 *
 * Deliberately absent: facets and filters (SEARCH-004), typo suggestions or
 * "did you mean" (SEARCH-005), note results (SEARCH-006), ranking explanations
 * (SEARCH-008), and any AI search experience.
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
  const [results, setResults] = useState<CurriculumSearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(): Promise<void> {
    const queryError = validateCurriculumSearchQuery(query);
    if (queryError) {
      setError(describeCurriculumSearchQueryError(queryError));
      setResults(null);
      return;
    }

    setSearching(true);
    setError("");

    try {
      setResults(await searchCurriculum(accessToken, { query }));
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
          void handleSearch();
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

      <p aria-live="polite">
        {searching
          ? "Searching curriculum…"
          : results
            ? describeCurriculumSearchCount(results.count)
            : ""}
      </p>

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      {results && !error && results.results.length > 0 && (
        <ul aria-labelledby="curriculum-search-title">
          {results.results.map((result) => (
            <SearchResult key={result.documentId} result={result} />
          ))}
        </ul>
      )}
    </section>
  );
}
