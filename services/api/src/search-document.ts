import type {
  SearchDocument,
  SearchSourceOutcome,
  SearchSourceResolution
} from "@tlp/shared-types";
import {
  AppError,
  buildSearchDocument,
  isSearchDocumentStale
} from "@tlp/shared-types";
import { createUserScopedSupabaseClient } from "./supabase";

/**
 * SEARCH-001 — Search Document projection and source resolution.
 *
 * ## What this owns
 *
 * Two things, and deliberately only two:
 *
 *   1. MINIMAL source adapters, sufficient to prove the SEARCH-001 document
 *      contract normalizes more than one source type (section 13).
 *   2. Source resolution — confirming an already-built document still points at
 *      an authoritative, servable source record (section 7).
 *
 * ## What this is NOT
 *
 * This is not SEARCH-002. There is no query, no text matching, no result set,
 * no ranking, no filtering, no facet, no pagination and no enumeration of
 * curriculum. Both adapters take a source record the caller already holds and
 * project it; neither goes looking for one.
 *
 * There is no HTTP route. SEARCH-001's acceptance criteria are all "Platform
 * can ...", never "Student can search"; the search surface belongs to
 * SEARCH-002.
 *
 * ## Authorization
 *
 * Source-authoritative, never index-authoritative. Resolution reads through
 * `createUserScopedSupabaseClient`, so PostgreSQL row level security decides
 * what the caller can see — curriculum policies already restrict students to
 * `publication_state = 'published'`. A document's own `accessScope` and
 * `publicationState` never decide anything here.
 *
 * A caller-supplied user id is never accepted: identity comes from the caller's
 * own access token.
 *
 * ## Privacy
 *
 * No query text is logged, no snippet is logged, and nothing is persisted.
 * Resolution is transient request processing only.
 *
 * No AI anywhere: baseline Search must work with zero AI availability.
 */

interface CurriculumSourceRow {
  stable_id: string;
  version: number;
  title: string;
  description: string | null;
  publication_state: string;
  updated_at: string;
}

const unavailable = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

/**
 * Projects an already-authorized Learning Path row into the document contract.
 *
 * Minimal adapter #1. It receives a row; it does not fetch one.
 */
export function projectLearningPathDocument(
  row: CurriculumSourceRow,
  indexedAt: string
): SearchDocument | null {
  return buildSearchDocument({
    sourceEngine: "curriculum",
    contentType: "learning_path",
    sourceRecordStableId: row.stable_id,
    sourceVersion: row.version,
    title: row.title,
    searchableText: [row.title, row.description ?? ""].join(" "),
    sourceReference: `/learning-paths/${row.stable_id}`,
    publicationState: row.publication_state,
    accessScope: "shared",
    sourceUpdatedAt: row.updated_at,
    indexedAt
  });
}

/**
 * Projects an already-authorized Competency row into the same contract.
 *
 * Minimal adapter #2. Its only purpose is to prove the contract normalizes a
 * second, differently-shaped source type. SEARCH-002 owns adding the remaining
 * approved content types and any behaviour that finds them.
 */
export function projectCompetencyDocument(
  row: CurriculumSourceRow,
  indexedAt: string
): SearchDocument | null {
  return buildSearchDocument({
    sourceEngine: "curriculum",
    contentType: "competency",
    sourceRecordStableId: row.stable_id,
    sourceVersion: row.version,
    title: row.title,
    searchableText: [row.title, row.description ?? ""].join(" "),
    sourceReference: `/competencies/${row.stable_id}`,
    publicationState: row.publication_state,
    accessScope: "shared",
    sourceUpdatedAt: row.updated_at,
    indexedAt
  });
}

/** The source tables the two minimal adapters resolve against. */
const SOURCE_TABLES: Record<string, string> = {
  learning_path: "learning_paths",
  competency: "competencies"
};

/**
 * Confirms one document still points at an authoritative, servable source.
 *
 * The read goes through the caller's own RLS-scoped client. A row the caller
 * may not see is indistinguishable from a row that does not exist, which is
 * exactly the behaviour SEARCH-003 section 6 wants: hidden results must not be
 * revealed, not even by a different error.
 *
 * Outcomes are deliberately conservative — anything other than `resolved`
 * means the result must not be served as valid content.
 */
export async function resolveSearchDocument(
  accessToken: string,
  document: SearchDocument
): Promise<SearchSourceResolution> {
  const table = SOURCE_TABLES[document.contentType];

  // A content type with no resolver cannot be proven authoritative, so it is
  // never served. SEARCH-002 adds resolvers as it adds content types.
  if (!table) {
    return { documentId: document.documentId, outcome: "unavailable" };
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from(table)
    .select("stable_id,version,publication_state")
    .eq("stable_id", document.sourceRecordStableId)
    .eq("version", document.sourceVersion)
    .maybeSingle();

  if (error) {
    return { documentId: document.documentId, outcome: "unavailable" };
  }

  // Missing, or invisible to this caller under row level security. The two are
  // deliberately not distinguished.
  if (!data) {
    return { documentId: document.documentId, outcome: "missing" };
  }

  const row = data as unknown as {
    version: number;
    publication_state: string;
  };

  if (row.publication_state !== "published") {
    return { documentId: document.documentId, outcome: "unpublished" };
  }

  if (isSearchDocumentStale(document, row.version)) {
    return { documentId: document.documentId, outcome: "stale" };
  }

  return { documentId: document.documentId, outcome: "resolved" };
}

/**
 * Resolves a set of documents.
 *
 * Each document is resolved independently, so one unavailable source never
 * suppresses the rest. This is a resolution helper, not a search: it answers
 * "may these be served?" and never "what matches this query?".
 */
export async function resolveSearchDocuments(
  accessToken: string,
  documents: readonly SearchDocument[]
): Promise<SearchSourceResolution[]> {
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "An authenticated session is required",
      retryable: false
    });
  }

  const resolutions: SearchSourceResolution[] = [];

  for (const document of documents) {
    resolutions.push(await resolveSearchDocument(accessToken, document));
  }

  return resolutions;
}

/** Counts resolutions by outcome, so failed indexing is identifiable later. */
export function summarizeResolutions(
  resolutions: readonly SearchSourceResolution[]
): Record<SearchSourceOutcome, number> {
  const summary: Record<SearchSourceOutcome, number> = {
    resolved: 0,
    missing: 0,
    stale: 0,
    unpublished: 0,
    unauthorized: 0,
    unavailable: 0
  };

  for (const resolution of resolutions) {
    summary[resolution.outcome] += 1;
  }

  return summary;
}

export { unavailable as searchSourceUnavailable };
