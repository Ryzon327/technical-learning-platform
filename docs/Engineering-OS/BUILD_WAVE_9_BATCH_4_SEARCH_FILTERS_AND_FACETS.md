# Build Wave 9 — Batch 4

## Search Filters and Facets (SEARCH-004)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `3111772` — build: add permission-aware search

---

## 1. Purpose

Let a learner narrow authorized search results by meaningful platform metadata
**without exposing hidden content** (SEARCH-004 §1), and compute facet counts
that cannot leak the existence of records the learner did not receive (§8).

---

## 2. One filter dimension, deliberately

SEARCH-004 §5 lists ten filters that *may* be approved. Repository inspection
found that **content type is the only one today's authorized result already
carries authoritatively**. Every other dimension would require either inventing
a vocabulary no table holds, or joining Curriculum hierarchy SEARCH-002 does not
read.

The approved scope is therefore:

* filter dimension: `contentType`
* facet dimension: `contentType`
* vocabulary: `learning_path`, `course`, `mission`, `competency`

The vocabulary is **derived** from `CURRICULUM_SEARCH_CONTENT_TYPES` rather than
restated, so a filter value can never name something search cannot return, and
a future searchable type cannot silently become unfilterable.

---

## 3. Dispositions, recorded as data

`CURRICULUM_SEARCH_FILTER_DISPOSITIONS` holds every excluded dimension and its
reason, so the decision is reviewable and testable rather than folklore, and a
later batch adding one has to change the list on purpose.

| Dimension | Disposition | Why |
|---|---|---|
| Learning Path | **deferred** | Requires a deliberate future Search/Curriculum architecture decision based on authoritative hierarchy relationships and implementation cost |
| Course (hierarchy) | **deferred** | Same decision; `course` is filterable only as a content type today |
| Module | **deferred** | `learning_module` is not a searchable result type; missions reference modules by UUID only |
| Mission (hierarchy) | **deferred** | Same decision |
| Competency (relationship) | **deferred** | `mission_competencies` links by UUID through a join SEARCH-002 does not perform |
| Lab | not applicable | Labs are not a searchable result type; no lab search was added |
| Tag | not applicable | **No authoritative Curriculum tag model exists.** The Notes tag model describes notes, not curriculum, and was not borrowed |
| Private vs shared | not applicable | Every current result is shared published curriculum; no private source was invented |
| Publication state | **not exposed** | Published-only is an authorization and publication invariant, not a learner choice. A filter must never provide a mechanism for requesting draft, review or retired curriculum |

Hierarchical filtering is **not assigned to another feature**. SEARCH-007 owns
Indexing and Freshness Pipeline and may later make broader facet computation
practical, but that does not make it the owner of hierarchical filtering
semantics. A test asserts no disposition reason names SEARCH-005 through
SEARCH-008.

---

## 4. Facet counts describe the returned results, and nothing else

`buildCurriculumSearchFacets` takes the **final, bounded, ordered, already
authorized result set** and counts it. It therefore cannot see:

* a candidate row level security withheld — never in its input
* a candidate SEARCH-003 refused to surface — dropped by `surfaceAuthorized`
* an older published version — dropped by `selectHighestPublishedVersion`
* a row beyond the `limit * 4` over-fetch window — dropped by the bound
* anything past the requested `limit` — dropped by `buildCurriculumSearchResults`

The service pins the composition:

```ts
return withCurriculumSearchFacets(
  buildCurriculumSearchResults(documents, limit)
);
```

The invariant `sum(facet counts) === count === results.length` is therefore true
**by construction rather than by discipline** — a leak would have to change the
input, not the arithmetic. `curriculumSearchFacetCountsMatchResults` exposes it
so the tests and the verifier check the same thing.

**A type with no returned result is omitted, never reported as zero.** A zero
would be a claim about content the learner did not receive.

`CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS` holds the prohibition as data:
`candidateCount`, `totalCount`, `globalTotal`, `hiddenCount`,
`unauthorizedCount`, `withheldCount`, `overFetchCount`, `corpusTotal`,
`matchedTotal`.

### The honest limitation

These are **result-set counts, not corpus counts**. "2 in these results" means
two of the results shown, not two courses in the platform. The wording says so,
and a test asserts it never says "in the platform", "overall", "in total",
"available" or "exist".

---

## 5. Order is the security property

```
trusted identity
  → source-authoritative query
  → row level security
  → SEARCH-003 permission decision
  → surfaceAuthorized
  → selectHighestPublishedVersion
  → applyCurriculumSearchFilter        ← SEARCH-004
  → buildCurriculumSearchResults
  → withCurriculumSearchFacets         ← SEARCH-004
```

**Every source is read exactly as an unfiltered search reads it.** The service
does not skip a table when it is unselected, so the authorized candidate set is
identical whether or not a filter was supplied — proven by `F11`, which asserts
that a filtered and an unfiltered search produce byte-identical `from`, `.eq`,
`.or` and `.limit` calls.

The filter is a presentation narrowing, never an authorization step. The
verifier enforces the order by **line number**, not just presence.

The cost of this choice is recorded honestly: filtering to one type still reads
four tables. Skipping unselected reads would be safe and equivalent, but keeping
the read set constant makes the security property structural.

---

## 6. API contract

```
GET /search/curriculum?q=<required>&limit=<optional>&contentType=<repeatable>
```

* allowed values: exactly the four searchable content types
* repeated for multi-select — `?contentType=course&contentType=mission`
* duplicates collapse; output order follows the fixed vocabulary, so request
  order never changes the response
* **an unknown value fails validation rather than being silently ignored** — a
  silent drop would tell a learner their filter applied when it did not, and
  would let a client probe for filter dimensions by watching which values change
  the results
* absent or empty means no filtering
* no free-form filter JSON, no arbitrary field name, no internal UUID

Validation runs **before any read**, so a rejected filter never touches the
database.

Response:

```jsonc
{
  "results": [...],
  "count": 5,
  "facets": { "contentTypes": [ { "value": "course", "label": "Course", "count": 2 } ] }
}
```

`facets` is optional. If computation fails it is **omitted entirely** rather
than sent empty or partial, so a failure can never be mistaken for "no results
of that type" (§11).

---

## 7. Browser transport — an approved inventory expansion

`buildApiUrl` took `Record<string, string | number | undefined>` and called
`URLSearchParams.set`. A `Record` cannot hold a repeated key, so **the browser
physically could not send `?contentType=course&contentType=mission`**.

`apps/web/src/lib/api-client.ts` was therefore widened to accept
`readonly string[]` and `append` each member. The change is additive — every
existing scalar caller behaves identically — and it keeps one wire format with
URL encoding in the single module that owns it. Comma-joining was rejected as
ambiguous for any value containing a comma.

This expansion was reported and approved before it was made.

---

## 8. Frontend

A native `<fieldset>` with a `<legend>`, four `<input type="checkbox">` controls
each with its own `<label htmlFor>`, and a real `<button type="button">` that
clears every filter at once.

Native controls are keyboard operable, expose their own selected state to
assistive technology, and work on mobile with no custom handling. Selection and
counts are always **words** — colour is never the only signal, and there is no
drag-and-drop, no custom pseudo-checkbox, no `role="checkbox"` and no key
handling of our own.

All four types are always offered, because the vocabulary is static and public;
a count appears beside a type only when the server sent a facet for it. Clearing
filters produces a request **byte-identical** to a search that never had one —
there is no "cleared" marker on the wire.

**Not proven here:** rendered markup. `apps/web` has no DOM harness, and
`scripts/verify-wave7.sh` fails the build if `jsdom`, `@testing-library/react`
or `jest-axe` is added. Control structure is asserted in the verifier as source
assertions, and every string the UI renders is unit tested. This is the same
honest distinction SEARCH-002 established.

---

## 9. Not proven here — no live RLS harness

**There is no live PostgreSQL or RLS test harness in this repository.**

Every authorization and isolation claim in this document — including section 5's
"order is the security property" and section 4's "a candidate row level security
withheld is never in the facet input" — is therefore a **query-level and
structural claim, not live-database proof**. The service tests mock the client
factory using the CERT-005 precedent, so they prove which client is used, which
constraints are applied and which collection each step operates on. They do not
execute a PostgreSQL policy.

SEARCH-004 **does not independently prove live RLS isolation, and does not claim
to.** It adds no authorization of its own. It uses the existing caller-scoped
`createUserScopedSupabaseClient` architecture unchanged, and preserves the
SEARCH-003 authorization-before-surfacing boundary: filtering and faceting run
strictly after `surfaceAuthorized`, on collections that contain only candidates
the owning Engine already authorized.

This mirrors the limitation already recorded for SEARCH-003 (Batch 3, section
10), which likewise recorded that no live-RLS harness exists and that its
permission claims are query-level.

---

## 10. `SearchDocument` unchanged

No new field. No ACL metadata, identity field, UUID, hierarchy label,
denormalized parent title, hidden total, facet cache or ranking metadata.
SEARCH-001 is intact, and the verifier fails if `facet`, `filterValue`,
`hierarchyLabel` or `parentTitle` appears in `search-document.ts`.

---

## 11. Mutation evidence

Fourteen mutations were applied to the SEARCH-004 security and scope boundaries,
each run against the gates and then restored byte-identically (`cmp` per file).
Every one was caught.

| # | Mutation | Caught by |
|---|---|---|
| 1 | Facets computed from a pre-filter, pre-bound set | verifier §32 — pinned composition |
| 2 | Arbitrary facet vocabulary (approved-type guard removed) | verifier §32 — vocabulary guard |
| 3 | Internal UUID added as a facet identifier | verifier §30 — identifier scan |
| 4 | `draft`/`retired` made filterable | verifier §29 — derivation guard |
| 5 | Private/shared filter dimension added | verifier §29 — dimension guard |
| 6 | `lab_definition` added to the filter vocabulary | verifier §29 — derivation guard |
| 7 | Facet/result count divergence (`+1` → `+2`) | test suite — 4 tests failed |
| 8 | `candidateCount` exposed in the response | verifier §33 — total prohibition |
| 9 | Arbitrary `JSON.parse` filter object accepted by the route | verifier §30 — route input guard |
| 10 | `SearchDocument` polluted with `parentTitle` | verifier §35 |
| 11a | **Additional filter application against pre-resolution candidates** | verifier §31 — **only after strengthening; see below** |
| 11b | Filter applied before `surfaceAuthorized` | verifier §26 |
| 12 | Ranking introduced (`scoreResultRelevance`) | verifier §37 |
| 13 | `learning_modules` made searchable | verifier §14 |
| 14 | `withheldCount` exposed in the response | verifier §33 — total prohibition |

Mutations 8 and 14 were each run twice. The first form also destroyed the pinned
facet composition, so it was caught by §32 rather than by the total prohibition
it was meant to exercise. Both were re-run in a form that left the composition
intact, and §33 then caught them directly.

### M11a — a verifier-quality defect found and corrected

The original section 31 guard pinned only the expected post-resolution call,
`applyCurriculumSearchFilter(selected, filter)`, and checked its line position.

A mutation that added an **additional, earlier** application against the
pre-resolution candidate collection **survived that guard**: the pinned call was
still present and still in the right relative position, so position-pinning
alone was insufficient.

The verifier was strengthened to require **exactly one** application of
`applyCurriculumSearchFilter`, and to explicitly reject application against the
`permissioned`, `candidates` or `documents` collections. The mutation was re-run
and then correctly failed. A second mutation (11b), applying the filter to the
permissioned set before `surfaceAuthorized`, was also added and is caught.

**This was a verifier-quality defect, not a production authorization defect.**
The shipped code always applied the filter exactly once, after authorization and
after version resolution; what was missing was a guard strong enough to keep it
that way.

### Scope of this evidence

Mutation testing exercises the **guards and tests**, not a live database. It
proves that a regression of these specific kinds would be caught by the gates.
It does not, and cannot, substitute for the live-RLS proof recorded as absent in
section 9.

---

## 12. Boundaries held

No migration · no schema change · no dependency · no index · no cache · no
queue · no worker · no full-text search · no typo tolerance (SEARCH-005) · no
note results (SEARCH-006) · no indexing pipeline (SEARCH-007) · no ranking,
scoring or weighting (SEARCH-008) · no AI anywhere.

**Filtering removes results; it never reorders them.** SEARCH-002's neutral
ordering — content type in vocabulary order, then stable id — is unchanged, and
a test asserts the filtered output is a subsequence of the unfiltered output.

The SEARCH-005 ↔ SEARCH-008 circular dependency remains unresolved. SEARCH-004
adds no information that changes it, and neither specification was edited.

CERT-008's migration remains unexecuted.
