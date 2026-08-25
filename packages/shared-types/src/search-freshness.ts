import {
  SEARCH_SOURCE_OUTCOMES,
  canServeSearchDocument,
  type SearchSourceOutcome,
  type SearchSourceResolution
} from "./search-document";

/**
 * SEARCH-007 — Indexing and Freshness Pipeline.
 *
 * ## What "indexing" means under this architecture
 *
 * SEARCH-007 §8: *"The source Engine is authoritative."* This platform reads and
 * projects authoritative source rows at query time and keeps **no persisted
 * shared search index**. SEARCH-001 §6 excludes *"making the index
 * authoritative"*, and every Search batch since has been verified against a
 * standing prohibition on a materialized index.
 *
 * The §14 requirements are therefore satisfied by architecture, not waived:
 *
 * * **"Index job model"** — the bounded reconciliation run defined here. A run
 *   takes a bounded set of projected `SearchDocument`s, resolves each against
 *   its authoritative source, and classifies the outcome.
 * * **"Incremental indexing"** — reconciling only the bounded current
 *   representation needed to determine freshness and health, never rebuilding
 *   or storing a whole index.
 *
 * None of the underlying freshness, reconciliation, failure or observability
 * requirements is weakened by this reading: staleness is still detected, retired
 * content still stops being servable, failures are still recorded and surfaced,
 * and reconciliation is still deterministic.
 *
 * ## What `indexedAt` means
 *
 * `SearchDocument.indexedAt` is **the time the representation was projected from
 * its authoritative source**. It does not imply persistence in a database index,
 * because none exists. The field keeps its name because renaming it is not
 * required for correctness and would churn the SEARCH-001 contract.
 *
 * ## Serving safety
 *
 * Only `resolved` may serve. `stale`, `missing`, `unpublished`, `unauthorized`
 * and `unavailable` all fail closed — a source that cannot be proven current and
 * authorized is never treated as current.
 *
 * Pure module: no I/O, no clock, no randomness, no AI. No ranking (SEARCH-008).
 */

export const SEARCH_FRESHNESS_MODEL_VERSION = "search-freshness-v1";

/**
 * The maximum number of documents one reconciliation run may examine.
 *
 * SEARCH-007 §5 requires bounded operations. A run is a diagnostic, not a
 * crawler: it must never walk an unbounded corpus, and the bound is explicit so
 * the verifier can pin it.
 */
export const SEARCH_RECONCILIATION_MAX_DOCUMENTS = 100;

/**
 * The maximum number of attempts for one document.
 *
 * SEARCH-007 §12 requires *"retries are bounded"*. One initial attempt plus at
 * most one retry. Only a transient `unavailable` is retried — a definitive
 * outcome such as `unpublished` or `stale` is an answer, not a failure, and
 * retrying it would be wasted work that could mask a real state.
 *
 * There is no queue, scheduler or background worker: a retry is the immediately
 * following attempt inside the same bounded run.
 */
export const SEARCH_RECONCILIATION_MAX_ATTEMPTS = 2;

/** Outcomes worth retrying. Only transient source unavailability qualifies. */
export const SEARCH_RETRYABLE_OUTCOMES: readonly SearchSourceOutcome[] = [
  "unavailable"
];

export function isRetryableSearchOutcome(outcome: SearchSourceOutcome): boolean {
  return SEARCH_RETRYABLE_OUTCOMES.includes(outcome);
}

/**
 * Whether a document may still be served after reconciliation.
 *
 * Delegates to `canServeSearchDocument`, which takes a RESOLUTION rather than a
 * document, so a document can never authorize itself.
 */
export function isFreshEnoughToServe(
  resolution: SearchSourceResolution
): boolean {
  return canServeSearchDocument(resolution);
}

/** Bounds a requested reconciliation size. Never unbounded, never zero. */
export function normalizeReconciliationLimit(value: unknown): number {
  const parsed = Number(value ?? SEARCH_RECONCILIATION_MAX_DOCUMENTS);
  if (!Number.isFinite(parsed)) return SEARCH_RECONCILIATION_MAX_DOCUMENTS;
  return Math.max(
    1,
    Math.min(SEARCH_RECONCILIATION_MAX_DOCUMENTS, Math.floor(parsed))
  );
}

/**
 * The aggregate outcome of one reconciliation run.
 *
 * Deliberately counts only. SEARCH-007 §9 forbids logging private content and
 * §6 excludes indexing hidden admin content; a report naming individual records
 * would leak exactly the record existence SEARCH-003 §2 protects. There is no
 * document body, title, snippet, identifier, owner or query anywhere in it.
 */
export interface SearchFreshnessReport {
  modelVersion: string;
  /** Documents examined in this run — never a corpus total. */
  examined: number;
  /** Counts per outcome. Aggregate state only. */
  outcomes: Record<SearchSourceOutcome, number>;
  /** Documents that may still be served. */
  servable: number;
  /** Documents that must not be served for any reason. */
  unservable: number;
  /** Attempts that exhausted the retry bound while still unavailable. */
  exhaustedRetries: number;
  /** True when nothing needs operator attention. */
  healthy: boolean;
}

/**
 * Fields a freshness report must never carry.
 *
 * Held as data so tests and the verifier assert the prohibition directly.
 */
export const SEARCH_FRESHNESS_FORBIDDEN_FIELDS: readonly string[] = [
  "documents",
  "documentIds",
  "titles",
  "snippets",
  "searchableText",
  "bodies",
  "records",
  "userId",
  "ownerId",
  "acl",
  "policy",
  "query",
  "hiddenCount",
  "unauthorizedIds",
  "score",
  "rank"
];

/**
 * Builds the aggregate report from a completed run.
 *
 * A run is **healthy** when nothing needs attention: no stale document, no
 * exhausted retry, and no source that could not be reached. `unpublished`,
 * `missing` and `unauthorized` are NOT unhealthy — they are correct answers
 * about content that legitimately stopped being servable, which is precisely
 * what §2 wants the pipeline to notice rather than hide.
 */
export function buildSearchFreshnessReport(
  resolutions: readonly SearchSourceResolution[],
  exhaustedRetries = 0
): SearchFreshnessReport {
  const outcomes: Record<SearchSourceOutcome, number> = {
    resolved: 0,
    missing: 0,
    stale: 0,
    unpublished: 0,
    unauthorized: 0,
    unavailable: 0
  };

  for (const resolution of resolutions) {
    outcomes[resolution.outcome] += 1;
  }

  const servable = resolutions.filter(isFreshEnoughToServe).length;

  return {
    modelVersion: SEARCH_FRESHNESS_MODEL_VERSION,
    examined: resolutions.length,
    outcomes,
    servable,
    unservable: resolutions.length - servable,
    exhaustedRetries,
    healthy:
      outcomes.stale === 0 && outcomes.unavailable === 0 && exhaustedRetries === 0
  };
}

/**
 * Plain-language operational status. SEARCH-007 §10 requires Founder-facing
 * indexing status to use accessible text labels rather than colour or codes.
 */
export function describeSearchFreshnessStatus(
  report: SearchFreshnessReport
): string {
  if (report.examined === 0) {
    return "No search content was examined in this run.";
  }
  if (report.healthy) {
    return `Search content is current. ${report.servable} of ${report.examined} representations resolved against their source.`;
  }

  const problems: string[] = [];
  if (report.outcomes.stale > 0) {
    problems.push(`${report.outcomes.stale} changed after being projected`);
  }
  if (report.outcomes.unavailable > 0) {
    problems.push(`${report.outcomes.unavailable} could not be reached`);
  }
  if (report.exhaustedRetries > 0) {
    problems.push(`${report.exhaustedRetries} still unreachable after retrying`);
  }

  return `Search content needs attention: ${problems.join(", ")}.`;
}

/** Plain-language label for one outcome, for Founder-facing status text. */
export function describeFreshnessOutcomeLabel(
  outcome: SearchSourceOutcome
): string {
  switch (outcome) {
    case "resolved":
      return "Current";
    case "stale":
      return "Changed since projection";
    case "unpublished":
      return "No longer published";
    case "missing":
      return "No longer present";
    case "unauthorized":
      return "Not accessible to this account";
    default:
      return "Source unreachable";
  }
}

/** Every outcome has a label, so operational status can never render a code. */
export function describeAllFreshnessOutcomes(): string[] {
  return SEARCH_SOURCE_OUTCOMES.map(
    (outcome) => `${outcome}: ${describeFreshnessOutcomeLabel(outcome)}`
  );
}
