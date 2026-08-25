import type {
  SearchDocument,
  SearchFreshnessReport,
  SearchSourceResolution
} from "@tlp/shared-types";
import {
  AppError,
  SEARCH_RECONCILIATION_MAX_ATTEMPTS,
  buildSearchFreshnessReport,
  isRetryableSearchOutcome,
  isSharedIndexEligible,
  normalizeReconciliationLimit
} from "@tlp/shared-types";
import {
  projectCompetencyDocument,
  projectLearningPathDocument,
  resolveSearchDocument
} from "./search-document";
import { createUserScopedSupabaseClient } from "./supabase";

/**
 * SEARCH-007 — Indexing and Freshness Pipeline.
 *
 * The bounded reconciliation run: the "index job" under this platform's
 * source-authoritative, query-time architecture.
 *
 * ## Composition, not duplication
 *
 * Reconciliation is NOT reimplemented here. `resolveSearchDocument` (SEARCH-001)
 * already reads the authoritative row through the caller's own RLS-scoped
 * client and classifies the outcome. This module adds only what SEARCH-007
 * owns: a bound on how much one run examines, a bound on retries, and the
 * aggregate health report.
 *
 * Keeping it separate from `search-document.ts` matters: that module is the
 * SEARCH-001 projection and resolution contract, and its verifier guards pin it
 * as owning no pipeline behaviour. Putting run mechanics there would blur the
 * two Features.
 *
 * ## No index, no worker, no schedule
 *
 * There is no persisted search index, so there is nothing to rebuild. A run
 * reconciles the bounded current representation and reports; it writes nothing,
 * stores nothing, and is invoked on demand rather than by a cron job, queue,
 * scheduler or background worker.
 *
 * ## Authorization
 *
 * Every read goes through the caller's own access token. There is no
 * service-role path, and a retry re-uses the same token — SEARCH-007 §9 forbids
 * broadening access during retry or recovery. A source the caller cannot see is
 * indistinguishable from one that does not exist.
 */

/** The two adapters SEARCH-001 provides, and the tables they project from. */
const FRESHNESS_SOURCES = [
  { table: "learning_paths", project: projectLearningPathDocument },
  { table: "competencies", project: projectCompetencyDocument }
] as const;

interface CurriculumFreshnessRow {
  stable_id: string;
  version: number;
  title: string;
  description: string | null;
  publication_state: string;
  updated_at: string;
}

/**
 * Projects the bounded current curriculum representation for one run.
 *
 * This is the "incremental" half: it reads only the bounded set needed to judge
 * freshness, never the whole corpus, and never stores what it produces.
 *
 * Reads go through the caller's own RLS-scoped client and are constrained to
 * published rows, so an unpublished or invisible row is never even projected.
 * Only shared-scope documents survive `isSharedIndexEligible`, which is what
 * keeps private content — notes above all — out of this path entirely.
 */
export async function projectCurriculumFreshnessDocuments(
  accessToken: string,
  limit?: unknown
): Promise<SearchDocument[]> {
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "An authenticated session is required",
      retryable: false
    });
  }

  const bound = normalizeReconciliationLimit(limit);
  const supabase = createUserScopedSupabaseClient(accessToken);
  const indexedAt = new Date().toISOString();
  const documents: SearchDocument[] = [];

  for (const source of FRESHNESS_SOURCES) {
    const { data, error } = await supabase
      .from(source.table)
      .select("stable_id,version,title,description,publication_state,updated_at")
      .eq("publication_state", "published")
      .limit(bound);

    // A source that cannot be read is not silently skipped: the run fails
    // retryably rather than reporting healthy on partial information.
    if (error) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Search freshness reconciliation is unavailable",
        retryable: true
      });
    }

    for (const row of (data ?? []) as unknown as CurriculumFreshnessRow[]) {
      const document = source.project(row, indexedAt);
      // Private or non-shared content can never enter this run.
      if (document && isSharedIndexEligible(document)) documents.push(document);
    }
  }

  return documents.slice(0, bound);
}

/**
 * Reconciles one document, retrying only a transient unreachable source.
 *
 * At most `SEARCH_RECONCILIATION_MAX_ATTEMPTS` attempts. There is no loop that
 * can run longer than that bound, no recursion, and no delay mechanism — a
 * retry is simply the next immediate attempt inside the same run.
 *
 * A definitive outcome (`stale`, `unpublished`, `missing`, `unauthorized`) is an
 * ANSWER and is returned immediately. Retrying it would waste a read and could
 * mask a real state change.
 */
export async function reconcileSearchDocument(
  accessToken: string,
  document: SearchDocument
): Promise<{ resolution: SearchSourceResolution; exhausted: boolean }> {
  let resolution = await resolveSearchDocument(accessToken, document);

  for (
    let attempt = 1;
    attempt < SEARCH_RECONCILIATION_MAX_ATTEMPTS &&
    isRetryableSearchOutcome(resolution.outcome);
    attempt += 1
  ) {
    // The SAME caller token. A retry may never widen what the caller can read.
    resolution = await resolveSearchDocument(accessToken, document);
  }

  return {
    resolution,
    exhausted: isRetryableSearchOutcome(resolution.outcome)
  };
}

export interface SearchFreshnessRunInput {
  documents: readonly SearchDocument[];
  limit?: unknown;
}

/**
 * Runs one bounded reconciliation and returns aggregate health.
 *
 * The document set is bounded BEFORE any read, so a caller cannot turn a
 * diagnostic into an unbounded crawl of the corpus.
 *
 * The returned report carries counts only — no document, identifier, title,
 * snippet, owner or query. SEARCH-007 §9 forbids logging private content, and a
 * report naming records would leak exactly the record existence SEARCH-003 §2
 * protects.
 */
export async function runSearchFreshnessReconciliation(
  accessToken: string,
  input: SearchFreshnessRunInput
): Promise<SearchFreshnessReport> {
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "An authenticated session is required",
      retryable: false
    });
  }

  const limit = normalizeReconciliationLimit(input.limit);
  const bounded = input.documents.slice(0, limit);

  const resolutions: SearchSourceResolution[] = [];
  let exhaustedRetries = 0;

  for (const document of bounded) {
    const outcome = await reconcileSearchDocument(accessToken, document);
    resolutions.push(outcome.resolution);
    if (outcome.exhausted) exhaustedRetries += 1;
  }

  return buildSearchFreshnessReport(resolutions, exhaustedRetries);
}
