# Build Wave 9 — Batch 1

## Search Document and Index Model (SEARCH-001)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `7754e7a` — test: add certificate engine completion gate

---

## 1. Purpose

Define the normalized representation that makes approved platform content
searchable **without making the Search Engine the source of truth**
(SEARCH-001 §1).

---

## 2. Approved architecture

Baseline Search uses **query-time normalized projections** from authoritative
source engines. For SEARCH-001 that means: no materialized shared index, no
`search_documents` table, no PostgreSQL FTS, no `tsvector`/GIN/`pg_trgm`, no
indexing worker, no queue, no new dependency, **no migration**.

Search owns discovery contracts and search semantics. It does not own
curriculum truth, note truth, publication truth, authorization truth or learner
identity truth.

---

## 3. Acceptance criteria and how each is met

| SEARCH-001 §13 criterion | Implementation |
|---|---|
| Normalize multiple source types | Two minimal adapters — `learning_path` and `competency` — project differently shaped rows through one contract |
| Preserve source identity/version | `sourceRecordStableId` + `sourceVersion`, carried verbatim; `documentId` derives from both |
| Distinguish private and shared content | `accessScope: "shared" \| "private"` and `isSharedIndexEligible` |
| Update or remove stale documents | `isSearchDocumentStale` compares against the live source version and fails closed when it cannot be read |
| Resolve results back to source records | `resolveSearchDocument` reads the authoritative row through the caller's RLS-scoped client |
| Founder understands which engines are indexed | `SEARCH_INDEXED_SOURCE_ENGINES` + `describeIndexedSourceEngines()` |
| Founder identifies stale or failed indexing later | `SearchIndexingFailure`, `describeIndexingFailure`, `summarizeResolutions` |

§14 Definition of Done: schema ✓ · source identity/version metadata ✓ ·
privacy/access scope metadata ✓ · source resolution ✓ · stale record handling ✓
· tests covering invalid/private/stale documents ✓ · Founder approval already
recorded ✓.

---

## 4. Authorization — source-derived, never index-derived

SEARCH-001 §6 excludes *"permission decisions based only on index fields"* and
§9 requires that indexed permission metadata is never trusted as the final
check.

This is enforced **by signature, not by discipline**:

```ts
export function canServeSearchDocument(resolution: SearchSourceResolution): boolean
```

It takes a **resolution**, never a document. A document's own
`publicationState` and `accessScope` therefore cannot answer the question —
answering from index metadata alone is not expressible. A test proves a
perfectly "published, shared" document still cannot be served when its source
resolution is `unauthorized`.

Resolution reads through `createUserScopedSupabaseClient`, so PostgreSQL row
level security decides visibility. Curriculum policies already restrict
students to `publication_state = 'published'`. A row the caller cannot see
returns `missing` — deliberately indistinguishable from a row that does not
exist, so hidden results are never revealed by a differing error.

No caller-supplied user identifier is accepted anywhere in this path.

---

## 5. Private notes — excluded by construction

`SEARCH_INDEXED_SOURCE_ENGINES` is `["curriculum"]`. The Knowledge and Notes
Engine is **absent by design**: SEARCH-006 §8 forbids placing private note
content into a broadly shared index that relies only on filters for safety.

A note cannot even be *represented* as an indexed source — `knowledge_notes` is
not a valid source engine and `note` is not a valid content type, so
`buildSearchDocument` returns `null` for both. SEARCH-006 will later integrate
notes through source-level retrieval from their owning engine.

---

## 6. Proof that SEARCH-002 was not implemented early

SEARCH-001 defines the contract; it cannot find anything.

- **No HTTP route.** Every §13 criterion reads "Platform can …", never "Student
  can search". `server.ts` is untouched and does not import the Search service.
- **No query, matching, ranking, filtering, faceting or pagination.** The
  verifier fails on `ilike`, `textSearch`, `facet`, `.order(`, `.limit(`,
  `rankResults`, `scoreResult` and `relevanceScore`.
- **No enumeration.** Every read is pinned to exactly one stable id and one
  version; `.in(` is forbidden.
- **No typo tolerance or synonyms** (SEARCH-005), **no indexing worker, queue or
  schedule** (SEARCH-007).
- Both adapters **receive** a row the caller already holds; neither fetches one.

---

## 7. Conservative normalization

`normalizeSearchableText` collapses whitespace and bounds length at 4000
characters. It deliberately does **not** fold case, strip punctuation, expand
synonyms or correct spelling — SEARCH-005 owns query normalization, and its §8
requires technical tokens to survive.

Tested explicitly: `Get-ADUser`, `index=botsv3`, `kubectl`, `terraform plan`,
`show vlan brief` all survive intact, and case is preserved exactly.

---

## 8. Identity discipline

`documentId` is `sourceEngine:contentType:stableId@version` — reproducible,
carrying no internal database identifier, and changing when the source version
changes. `SEARCH_DOCUMENT_FORBIDDEN_FIELDS` holds 16 prohibited names as data,
including `id`, `uuid`, `internalId`, `sourceRecordId`, identity fields, raw
HTML, provider credentials and embeddings. A test smuggles an internal uuid
through the input and asserts it appears nowhere in the serialized document.

---

## 9. Tests

`packages/shared-types/src/search-document.test.ts` — **57 cases**: the indexed
engine set and the absence of notes, content-type vocabulary, stable identity,
multi-source normalization, conservative text handling including all five
technical tokens, malformed-source failure for every error code, private/shared
separation, staleness including fail-closed, the authorization contract, and
the absence of any writer, ranker or query capability.

`services/api/src/search-document.test.ts` — **33 cases** across six blocks:
Search owns no source truth; SEARCH-002 was not implemented early;
authorization is source-derived; private notes never enter the foundation;
executable projection of both source types; and executable resolution covering
resolved, missing, unpublished, stale, unavailable, no-resolver, independent
resolution and outcome summarizing.

---

## 10. Accepted limitations

1. **No live PostgreSQL/RLS harness.** Every permission claim is a query-level
   claim proven through a mocked client, not a live-RLS claim.
2. **Two adapters only.** Sufficient to prove the contract normalizes multiple
   source types; SEARCH-002 owns the remaining approved content types.
3. **`lab_definition` and other content types have no resolver yet**, so they
   resolve as `unavailable` and are never served. That is fail-closed and
   intentional.
4. **The SEARCH-005 ↔ SEARCH-008 circular dependency is unresolved** and
   recorded, not repaired.
5. **Query-time projection has an unmeasured scale ceiling.** SEARCH-007 is
   where materialization should be evaluated if required.

---

## 11. Boundaries held

No migration · no schema change · no materialized index · no FTS · no new
dependency · no search route · no query persistence or logging · no AI
dependency · no notes index · no Certificate or Evidence change · CERT-008
migration still unexecuted.
