# Build Wave 9 — Batch 2

## Curriculum Search (SEARCH-002)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `99e6fca` — build: add search document and index model

---

## 1. Purpose

A learner types a technical term — VLAN, `kubectl`, `show vlan brief` — and
finds the published curriculum that mentions it, without remembering which
Module it lived in.

---

## 2. Approved architecture

Query-time normalized projection. Authoritative Curriculum rows are read
through the caller's own RLS-scoped client and projected into SEARCH-001
`SearchDocument`s. **No index, no FTS, no cache, no worker, no queue, no
migration, no dependency.**

Curriculum remains authoritative. Search owns discovery contracts and query
semantics only.

---

## 3. Searchable types — exactly four

`learning_path` · `course` · `mission` · `competency`

These are the types SEARCH-002 §13 names. `learning_module`,
`curriculum_asset` and `lab_definition` appear in §5's permissive "may include"
list but not in the acceptance criteria, and are deliberately excluded.

**Accepted consequence:** searching only a *module title* returns nothing,
because modules are not searched and mission documents are not padded with
parent-module text to compensate. Hierarchical search is SEARCH-004's concern,
not a workaround to apply here.

---

## 4. Authorization

Every curriculum table carries:

```sql
for select to authenticated using (publication_state = 'published')
```

so draft, review and retired curriculum is **unreadable** through this path —
never returned, not filtered afterwards. The explicit
`.eq("publication_state", "published")` in the service is defence in depth, not
the protection.

Reads use `createUserScopedSupabaseClient`. No service-role client, no
caller-supplied user id, no notes or private source of any kind.

---

## 5. Version selection — read resolution, not supersession

When several published versions of one `contentType + stableId` exist,
`selectHighestPublishedVersion` shows the learner the highest published
version.

**This is a learner-facing READ decision.** It asserts nothing about
supersession, retires nothing, writes nothing, and leaves Curriculum truth
untouched. It mirrors the only current-version resolution the repository
already performs — `getPublishedLearningPathTree`, which resolves a stable id
with `.order("version", desc).limit(1)` — so a search result and the
destination a learner opens agree.

**CURR-006 owns real supersession relationships, published version history and
lineage semantics, and is specified but unimplemented.** When CURR-006 provides
authoritative current-version semantics, Search must defer to it and this
interim helper should be replaced.

Nine tests cover the ruling's cases A–G plus published-only filtering and
"highest *published*, not highest overall".

---

## 6. Pre-existing Curriculum inconsistency — recorded, not repaired

Discovered during the SEARCH-002 architecture review and **left untouched**:

- multiple simultaneously published versions of one `stable_id` are
  structurally possible — the only constraint is `unique (stable_id, version)`,
  and `curriculum_publish_learning_path_tree` never retires a predecessor;
- the detail reader `getPublishedLearningPathTree` collapses to the highest
  published version;
- the listing reader `listPublishedLearningPaths` returns every published
  version;
- CURR-006 supersession semantics are specified but not implemented, and no
  service code references `curriculum_version_lineage`;
- SEARCH-002 temporarily mirrors the detail-reader behaviour for learner search
  result resolution;
- **Curriculum itself is unchanged** — neither reader was modified;
- the inconsistency should be reconciled during Curriculum or pre-MVP
  architecture assurance work.

---

## 7. Query semantics

Case-insensitive **literal substring** matching over `title` and `description`,
using escaped `ilike`. `\`, `%` and `_` are escaped, so searching `100%` or
`index_name` matches those characters instead of matching everything.

Query normalization touches whitespace only; case and punctuation are
preserved, so `Get-ADUser` and `index=botsv3` keep their source representation.
**No fuzzy matching, typo correction, synonyms, stemming, semantic search,
embeddings or AI rewriting** — all SEARCH-005 and Wave 10.

---

## 8. Bounded over-fetch

Each type is read with `.limit(limit * 4)`.

**Why:** version collapse happens *after* authoritative retrieval. Fetching
exactly `limit` would let four published versions of one stable identity consume
the entire candidate window and starve otherwise valid distinct results.

It is an implementation mechanism, **not** a result-count contract and **not**
pagination. It remains bounded; the learner still receives at most the requested
limit; the candidate count is never exposed.

**Scale limitation, stated honestly:** four `ilike` reads per query, each
fetching up to four times the result limit, is adequate at MVP content volume
and has an unmeasured ceiling. SEARCH-007 owns indexing and freshness
architecture and is the right place to evaluate materialization if scale
requires it. SEARCH-002 does not solve that future concern.

---

## 9. Ordering and count

Ordering is neutral and deterministic: content type in the fixed vocabulary
order, then stable id. **No relevance scoring, weighting or popularity** —
SEARCH-008 owns ranking.

`count` is the number of authorized results actually returned. There is no
global or hidden total: a total the learner cannot see would become a
result-count side channel the moment SEARCH-003 adds private or role-restricted
sources.

---

## 10. API

`GET /search/curriculum` — authenticated, GET only.
`q` required, whitespace-normalized, 1–200 characters. `limit` optional,
default 25, maximum 100.
Response: `{ results: SearchDocument[], count: number }`.

No `resultSources`, no cursor, no facets, no ranking controls, no filters, no
public or admin route.

---

## 11. Frontend

A `Search` workspace destination with a semantic `<form>`, a programmatically
associated `<label>`, a `type="search"` input bounded at 200 characters, a
submit button, an `aria-live="polite"` region announcing the returned count,
and results as a semantic list — each with a heading, the **content type in
text**, a source-preserving snippet, and a plain link to the destination.

Failure is announced through `role="alert"`. No facets, filter panels, typo
suggestions, "did you mean", note results, ranking explanations, AI search,
infinite scroll or pagination.

---

## 12. Failure and fallback — honest

SEARCH-002 §12 assumes a learner can fall back to structured Learning Path and
Course navigation. **That navigation does not exist in this application** —
`apps/web/src` contains only `auth`, `certificates`, `evidence` and now
`search`. Curriculum API routes exist; no browsing UI does.

`describeCurriculumSearchFallback()` therefore says what is true — search is
unavailable, learning content is unaffected, retrying is safe — and
deliberately does **not** name browsing or navigation. A test asserts the
message contains none of "browse", "navigate", "learning paths" or "courses".

No curriculum-browsing feature was built to satisfy the fallback.

---

## 13. Enrollment

No enrollment or access-policy model exists anywhere in the repository, so
SEARCH-002 §9's "enrollment/access policy where applicable" is **not currently
applicable**. None was invented. RLS and publication authorization remain
mandatory and are enforced.

---

## 14. Accepted limitations

1. **No live PostgreSQL/RLS harness** — every permission claim is a query-level
   claim proven through a mocked client, not a live-RLS claim.
2. **No browser/DOM harness** — accessibility is asserted structurally.
3. **Module titles are not searchable** (item 3).
4. **Bounded over-fetch has an unmeasured scale ceiling** (item 8).
5. **The pre-existing Curriculum version inconsistency is unrepaired** (item 6).
6. **SEARCH-005 ↔ SEARCH-008 circular dependency remains unresolved**;
   SEARCH-002 did not resolve it. New datum for that later decision: SEARCH-002
   delivers usable search with neither feature, so the pair is not blocking.

---

## 15. Boundaries held

No migration · no schema change · no dependency · no FTS · no index worker · no
cache · no materialized search state · no query persistence or logging · no AI ·
no notes source · no public or admin route · Curriculum truth unmodified ·
CERT-008 migration still unexecuted.
