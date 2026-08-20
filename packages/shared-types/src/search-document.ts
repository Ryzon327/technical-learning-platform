/**
 * SEARCH-001 — Search Document and Index Model.
 *
 * The normalized representation that makes approved platform content
 * searchable WITHOUT making the Search Engine the source of truth.
 *
 * ## What this owns
 *
 * The document contract, source identity and version representation, access
 * scope representation, staleness detection, and the source-resolution outcome
 * vocabulary. Nothing else.
 *
 * ## What this does NOT own
 *
 * Curriculum truth, note truth, publication truth, authorization truth or
 * learner identity truth. SEARCH-001 section 6 excludes making the index
 * authoritative, and section 7 requires every result to resolve back to an
 * authoritative source record.
 *
 * ## What this deliberately does NOT implement
 *
 * SEARCH-002 curriculum search behaviour: there is no query parsing, no text
 * matching, no result set, no ranking and no filtering here. This module can
 * describe a document; it cannot find one.
 *
 * SEARCH-003 authorization decisions, SEARCH-004 facets, SEARCH-005 query
 * normalization and typo tolerance, SEARCH-006 note integration, SEARCH-007
 * indexing pipeline, SEARCH-008 ranking — all remain unimplemented.
 *
 * ## Authorization
 *
 * `accessScope` and `publicationState` exist to narrow candidates cheaply.
 * SEARCH-001 section 6 excludes "permission decisions based only on index
 * fields" and section 9 requires that indexed permission metadata is never
 * trusted as the final authorization check. `canServeSearchDocument` therefore
 * refuses to answer from a document alone — it requires a resolution produced
 * by reading the authoritative source.
 *
 * Pure module: no I/O, no clock, no randomness, no AI. Baseline Search must
 * work with zero AI availability (SEARCH-001 section 11).
 */

export const SEARCH_DOCUMENT_MODEL_VERSION = "search-document-v1";

/**
 * Source Engines whose content may be projected into shared Search.
 *
 * The Knowledge and Notes Engine is deliberately ABSENT. SEARCH-006 section 8
 * forbids placing private note content into a broadly shared index that relies
 * only on filters for safety; notes will be composed at retrieval time from
 * their owning engine instead. Adding a notes engine here would be a privacy
 * regression, not a feature.
 */
export const SEARCH_INDEXED_SOURCE_ENGINES = ["curriculum"] as const;

export type SearchSourceEngine = (typeof SEARCH_INDEXED_SOURCE_ENGINES)[number];

export function isSearchSourceEngine(value: unknown): value is SearchSourceEngine {
  return (
    typeof value === "string" &&
    (SEARCH_INDEXED_SOURCE_ENGINES as readonly string[]).includes(value)
  );
}

/** Plain-language answer to "which source Engines are indexed?" (section 13). */
export function describeIndexedSourceEngines(): string[] {
  return SEARCH_INDEXED_SOURCE_ENGINES.map(
    (engine) => `${engine} — approved, student-visible content only`
  );
}

/**
 * Content types the approved searchable set may contain.
 *
 * The vocabulary is defined here because "content type" is a Search Document
 * field (section 5). Which of these are actually queried, and how, is
 * SEARCH-002's decision, not this module's.
 */
export const SEARCH_CONTENT_TYPES = [
  "learning_path",
  "course",
  "module",
  "mission",
  "competency",
  "learning_asset",
  "lab_definition"
] as const;

export type SearchContentType = (typeof SEARCH_CONTENT_TYPES)[number];

export function isSearchContentType(value: unknown): value is SearchContentType {
  return (
    typeof value === "string" &&
    (SEARCH_CONTENT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Section 9: shared content and student-private content must be separated.
 *
 * `private` documents may never enter a shared index. SEARCH-001 keeps the
 * distinction representable so the boundary can be asserted before any private
 * source is ever integrated.
 */
export type SearchAccessScope = "shared" | "private";

/** Optional curriculum placement, carried by stable id only. */
export interface SearchCurriculumContext {
  learningPathStableId?: string;
  courseStableId?: string;
  moduleStableId?: string;
  missionStableId?: string;
}

/** Optional competency reference, always at an exact version. */
export interface SearchCompetencyReference {
  competencyStableId: string;
  competencyVersion: number;
}

/**
 * One normalized searchable document.
 *
 * Every identity field is a STABLE id. Internal database identifiers are
 * deliberately absent: an internal uuid must never become public search
 * identity, and `SEARCH_DOCUMENT_FORBIDDEN_FIELDS` records that prohibition as
 * data so it can be asserted rather than restated.
 */
export interface SearchDocument {
  modelVersion: string;
  documentId: string;
  sourceEngine: SearchSourceEngine;
  sourceRecordStableId: string;
  sourceVersion: number;
  contentType: SearchContentType;
  title: string;
  searchableText: string;
  keywords: string[];
  sourceReference: string;
  publicationState: string;
  accessScope: SearchAccessScope;
  curriculumContext?: SearchCurriculumContext;
  competencyReferences?: SearchCompetencyReference[];
  sourceUpdatedAt: string;
  indexedAt: string;
}

/**
 * Fields a Search Document must never carry.
 *
 * Held as data so tests and the verifier assert the prohibition directly.
 */
export const SEARCH_DOCUMENT_FORBIDDEN_FIELDS: readonly string[] = [
  "id",
  "sourceRecordId",
  "internalId",
  "uuid",
  "userId",
  "user_id",
  "ownerId",
  "displayName",
  "email",
  "noteId",
  "noteBody",
  "providerCredentials",
  "apiKey",
  "rawHtml",
  "embedding",
  "embeddings"
];

/**
 * The public document identity.
 *
 * Derived only from stable source identity and version, so it is reproducible,
 * carries no internal database identifier, and changes when the source version
 * changes.
 */
export function buildSearchDocumentId(input: {
  sourceEngine: SearchSourceEngine;
  contentType: SearchContentType;
  sourceRecordStableId: string;
  sourceVersion: number;
}): string {
  return `${input.sourceEngine}:${input.contentType}:${input.sourceRecordStableId}@${input.sourceVersion}`;
}

export const SEARCHABLE_TEXT_MAX_LENGTH = 4000;

/**
 * Deterministic document text normalization.
 *
 * Collapses whitespace and bounds length. It deliberately does NOT fold case,
 * strip punctuation, expand synonyms or correct spelling: SEARCH-005 owns query
 * normalization and typo tolerance, and its section 8 requires technical tokens
 * such as `Get-ADUser`, `kubectl` and `index=botsv3` to survive intact.
 */
export function normalizeSearchableText(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > SEARCHABLE_TEXT_MAX_LENGTH
    ? text.slice(0, SEARCHABLE_TEXT_MAX_LENGTH)
    : text;
}

/** Keywords are de-duplicated and order-stable; empty entries are dropped. */
export function normalizeSearchKeywords(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const value of values) {
    const keyword = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }

  return keywords;
}

export type SearchDocumentError =
  | "source_engine_unknown"
  | "content_type_unknown"
  | "source_identity_missing"
  | "source_version_invalid"
  | "title_missing"
  | "source_reference_missing";

export interface BuildSearchDocumentInput {
  sourceEngine: unknown;
  contentType: unknown;
  sourceRecordStableId: unknown;
  sourceVersion: unknown;
  title: unknown;
  searchableText?: unknown;
  keywords?: readonly unknown[];
  sourceReference: unknown;
  publicationState: unknown;
  accessScope: SearchAccessScope;
  curriculumContext?: SearchCurriculumContext;
  competencyReferences?: readonly SearchCompetencyReference[];
  sourceUpdatedAt: unknown;
  indexedAt: string;
}

/**
 * Validates a candidate document. A malformed source must fail safely rather
 * than produce a document that misrepresents its source (section 12).
 */
export function validateSearchDocumentInput(
  input: BuildSearchDocumentInput
): SearchDocumentError | null {
  if (!isSearchSourceEngine(input.sourceEngine)) return "source_engine_unknown";
  if (!isSearchContentType(input.contentType)) return "content_type_unknown";

  const stableId = String(input.sourceRecordStableId ?? "").trim();
  if (!stableId) return "source_identity_missing";

  const version = Number(input.sourceVersion);
  if (!Number.isInteger(version) || version < 1) return "source_version_invalid";

  if (!String(input.title ?? "").trim()) return "title_missing";
  if (!String(input.sourceReference ?? "").trim()) return "source_reference_missing";

  return null;
}

export function describeSearchDocumentError(error: SearchDocumentError): string {
  switch (error) {
    case "source_engine_unknown":
      return "The source engine is not an approved indexed engine.";
    case "content_type_unknown":
      return "The content type is not an approved searchable type.";
    case "source_identity_missing":
      return "A stable source identifier is required.";
    case "source_version_invalid":
      return "A positive integer source version is required.";
    case "title_missing":
      return "A title is required.";
    default:
      return "A stable source reference is required.";
  }
}

/**
 * Builds a normalized document.
 *
 * Assembled by explicit assignment rather than a spread, so a field present on
 * a source row can never leak into a search document by accident. Returns null
 * for malformed input; the caller decides how to record the failure.
 */
export function buildSearchDocument(
  input: BuildSearchDocumentInput
): SearchDocument | null {
  if (validateSearchDocumentInput(input) !== null) return null;

  const sourceEngine = input.sourceEngine as SearchSourceEngine;
  const contentType = input.contentType as SearchContentType;
  const sourceRecordStableId = String(input.sourceRecordStableId).trim();
  const sourceVersion = Number(input.sourceVersion);

  return {
    modelVersion: SEARCH_DOCUMENT_MODEL_VERSION,
    documentId: buildSearchDocumentId({
      sourceEngine,
      contentType,
      sourceRecordStableId,
      sourceVersion
    }),
    sourceEngine,
    sourceRecordStableId,
    sourceVersion,
    contentType,
    title: String(input.title).trim(),
    searchableText: normalizeSearchableText(input.searchableText ?? input.title),
    keywords: normalizeSearchKeywords(input.keywords ?? []),
    sourceReference: String(input.sourceReference).trim(),
    publicationState: String(input.publicationState ?? "").trim(),
    accessScope: input.accessScope,
    ...(input.curriculumContext ? { curriculumContext: { ...input.curriculumContext } } : {}),
    ...(input.competencyReferences
      ? {
          competencyReferences: input.competencyReferences.map((reference) => ({
            competencyStableId: reference.competencyStableId,
            competencyVersion: reference.competencyVersion
          }))
        }
      : {}),
    sourceUpdatedAt: String(input.sourceUpdatedAt ?? ""),
    indexedAt: input.indexedAt
  };
}

/**
 * Whether a document may live in the shared search foundation.
 *
 * Private content never may. This is the structural guarantee behind
 * SEARCH-006 section 8: privacy does not depend on a filter being applied
 * correctly at query time.
 */
export function isSharedIndexEligible(document: SearchDocument): boolean {
  return document.accessScope === "shared";
}

/**
 * Staleness, detected by comparing the document against the source's current
 * version. Section 8 of SEARCH-007 states the source Engine is authoritative;
 * SEARCH-001 only has to make staleness detectable.
 */
export function isSearchDocumentStale(
  document: SearchDocument,
  currentSourceVersion: number | null | undefined
): boolean {
  if (currentSourceVersion === null || currentSourceVersion === undefined) return true;
  return document.sourceVersion !== currentSourceVersion;
}

/**
 * The outcome of resolving a document against its authoritative source.
 *
 * Anything other than `resolved` means the result must not be served as valid
 * content (section 7).
 */
export type SearchSourceOutcome =
  | "resolved"
  | "missing"
  | "stale"
  | "unpublished"
  | "unauthorized"
  | "unavailable";

export const SEARCH_SOURCE_OUTCOMES: readonly SearchSourceOutcome[] = [
  "resolved",
  "missing",
  "stale",
  "unpublished",
  "unauthorized",
  "unavailable"
];

export interface SearchSourceResolution {
  documentId: string;
  outcome: SearchSourceOutcome;
}

/**
 * Whether a resolved document may be served.
 *
 * Takes a RESOLUTION, never a document. A document cannot authorize itself:
 * section 6 excludes permission decisions based only on index fields, so this
 * signature makes answering from index metadata alone impossible.
 */
export function canServeSearchDocument(resolution: SearchSourceResolution): boolean {
  return resolution.outcome === "resolved";
}

export function describeSearchSourceOutcome(outcome: SearchSourceOutcome): string {
  switch (outcome) {
    case "resolved":
      return "Available";
    case "missing":
      return "This content no longer exists.";
    case "stale":
      return "This content changed after it was indexed.";
    case "unpublished":
      return "This content is not currently published.";
    case "unauthorized":
      return "You do not have access to this content.";
    default:
      return "This content is temporarily unavailable.";
  }
}

/**
 * A recorded indexing failure, so stale or failed indexing can be identified
 * later (section 13). This is a REPRESENTATION only — SEARCH-007 owns the
 * pipeline, retries and health metrics that would produce and act on it.
 */
export interface SearchIndexingFailure {
  sourceEngine: SearchSourceEngine;
  sourceRecordStableId: string;
  reason: SearchDocumentError | SearchSourceOutcome;
  detectedAt: string;
}

export function describeIndexingFailure(failure: SearchIndexingFailure): string {
  return `${failure.sourceEngine}/${failure.sourceRecordStableId}: ${failure.reason}`;
}
