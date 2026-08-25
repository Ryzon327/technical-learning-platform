# Build Wave 9 — Batch 8

## Indexing and Freshness Pipeline (SEARCH-007)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `894f864` — build: add personal notes search integration

---

## 1. The architectural ruling this batch implements

SEARCH-007 §8 states *"The source Engine is authoritative."* This platform reads
and projects authoritative rows **at query time** and keeps **no persisted shared
search index**. SEARCH-001 §6 excludes *"making the index authoritative"*, and
every Search batch has been verified against a standing prohibition on a
materialized index.

The Founder ruling is therefore implemented as approved: SEARCH-007 provides
**deterministic reconciliation, freshness validation, stale detection,
publication/retirement reconciliation, bounded operations, failure-state
representation and operational health reporting** — and introduces **no persisted
index**.

We did not create a second stored representation merely to manufacture the
index-drift problem this architecture already avoids.

---

## 2. How §14 is satisfied, not waived

Two Definition of Done items name index mechanics. Under the approved
architecture they are satisfied by interpretation, and **their underlying
requirements are not weakened**:

| §14 item | Interpretation | Requirement preserved |
|---|---|---|
| **"index job model exists"** | the bounded reconciliation run: take a bounded set of projected `SearchDocument`s, resolve each against its authoritative source, classify the outcome | there IS a defined, bounded, repeatable job with observable outcomes |
| **"incremental indexing works"** | reconcile only the bounded current representation needed to judge freshness — never rebuild or store a whole index | work is incremental and bounded rather than whole-corpus |

Freshness detection, reconciliation, failure state and observability are all
implemented in full. **The Feature Registry was not edited to fit the
implementation.**

---

## 3. `indexedAt` semantics

`SearchDocument.indexedAt` means **the time the representation was generated or
projected from its authoritative source**. It does **not** imply persistence in a
database index, because none exists.

The field keeps its name: renaming it is not required for correctness and would
churn the SEARCH-001 contract. The semantics are documented in the shared model
and asserted by test `J`, which pins that `indexedAt` and `sourceUpdatedAt` are
distinct values with distinct meanings.

---

## 4. Freshness model

| Field | Role |
|---|---|
| `sourceVersion` | the primary stale comparison — `isSearchDocumentStale` |
| `sourceUpdatedAt` | authoritative source modification time, carried for context. **No SLA is inferred from it**, because repository authority defines none |
| `indexedAt` | projection-generation time (section 3) |

| Source state | Outcome | Servable |
|---|---|---|
| current version, published | `resolved` | **yes** |
| version mismatch | `stale` | no |
| row absent or invisible to the caller | `missing` | no |
| publication state not `published` | `unpublished` | no |
| read failed | `unavailable` | no |
| unknown current version | stale by construction | no |

**Fail closed throughout.** `isSearchDocumentStale` returns `true` when the
current version is unknown, and only `resolved` may serve.

**Publication transition** makes content projectable immediately — the projection
read is constrained to `publication_state = 'published'`, so unpublished rows are
never projected at all. **Retirement** removes content just as immediately. No
refresh mechanism is required because nothing is stored.

---

## 5. Reconciliation and retry

**Bounded before any read.** `SEARCH_RECONCILIATION_MAX_DOCUMENTS = 100`; a
requested limit is clamped, never unbounded and never zero. The document set is
sliced *before* reconciliation, so a caller cannot turn a diagnostic into a crawl.

**Bounded retry.** `SEARCH_RECONCILIATION_MAX_ATTEMPTS = 2` — one attempt plus at
most one retry. There is **no queue, scheduler or background worker**: a retry is
the next immediate attempt inside the same run.

**Only a transient `unavailable` is retried.** `stale`, `unpublished`, `missing`
and `unauthorized` are *answers*, not failures; retrying them would waste a read
and could mask a real state change. `SEARCH_RETRYABLE_OUTCOMES` is pinned to
exactly `["unavailable"]`.

**A retry never broadens access** (§9): it reuses the same caller token, proven
by test `P` and by the verifier's single-client count.

**An exhausted retry is observable** — counted as `exhaustedRetries` and forcing
`healthy: false`.

---

## 6. Composition, not duplication

Reconciliation is **not** reimplemented. `resolveSearchDocument` (SEARCH-001)
already reads the authoritative row through the caller's RLS-scoped client and
classifies the outcome. This batch adds only what SEARCH-007 owns: the bound, the
retry, and the aggregate report.

The service lives in its own module rather than extending `search-document.ts`,
because that module is the SEARCH-001 projection and resolution contract and its
verifier guards pin it as owning no pipeline behaviour. Putting run mechanics
there would blur the two Features.

---

## 7. Health output is aggregate-only

```jsonc
{ "modelVersion": "...", "examined": 12, "outcomes": { "resolved": 11, "stale": 1, ... },
  "servable": 11, "unservable": 1, "exhaustedRetries": 0, "healthy": false }
```

Seven fields, pinned by name in the verifier. **No document body, title, snippet,
identifier, owner, query, credential, policy or hidden total.** A report naming
records would leak exactly the record existence SEARCH-003 §2 protects, and §9
forbids logging private content.

`healthy` means *nothing needs attention*: no stale document, no unreachable
source, no exhausted retry. **`unpublished` and `missing` are not unhealthy** —
they are correct answers about content that legitimately stopped being servable,
which is precisely what §2 wants the pipeline to notice rather than hide.

Status text is accessible prose (§10), and every outcome has a plain-language
label so a raw code is never rendered.

---

## 8. Route and authorization

`GET /admin/search/freshness` — Founder-guarded via the existing
`requireFounderAdmin` mechanism, read-only, fail-closed. No second administration
framework was created.

The route accepts **no** `userId`, `ownerId`, `studentId`, `learnerId` or token
parameter. Reconciliation reads through the caller's own access token; **there is
exactly one client creation and no service-role path anywhere** in the Search
freshness code.

Smoke coverage proves the route is never reachable unauthenticated and exposes no
mutation method.

---

## 9. Private content stays out

`SEARCH_INDEXED_SOURCE_ENGINES` remains `["curriculum"]`. Only documents passing
`isSharedIndexEligible` enter a run, so private content — notes above all — cannot
be reconciled, counted or reported. The SEARCH-006 boundary is untouched.

---

## 10. Not proven here

**There is no live PostgreSQL or RLS harness.** Every authorization and isolation
claim in this batch is a **query-level and structural claim, not live-database
proof**. The service tests mock the client factory using the CERT-005 precedent
and model what row level security would return to the caller; they do not execute
a PostgreSQL policy. This mirrors the limitation recorded for SEARCH-003 through
SEARCH-006.

**No DOM harness.** SEARCH-007 §10 is operational and adds no learner surface, so
this batch introduces no new rendered accessibility claim.

---

## 11. Boundaries held

No migration · no schema change · no RLS change · no database extension · no
`search_documents` table · no materialized view · no full-text index · no
Elasticsearch, OpenSearch, Algolia, Meilisearch, Redis or vector database · no
database trigger · no cron · no scheduler · no queue · no background worker · no
webhook · no cache · no new dependency · no paid service · no service-role Search
retrieval · no private-note indexing · no `SearchDocument` contract change · no
AI.

**SEARCH-008 remains unimplemented** — no ranking, scoring, weighting, boosting
or relevance behaviour exists in this batch.

Search Human UAT has **not** been performed. Per DEC-047 it occurs after
SEARCH-001 through SEARCH-008 and the automated Search Engine completion gate.

CERT-008's migration remains committed and unexecuted.

---

## 12. Known limitations

- **No live-RLS proof** (section 10) — the largest outstanding evidence gap.
- **Reconciliation is inherently near-tautological under query-time projection**:
  a document is projected and resolved within the same request, so the drift
  window is small. The run's real value is detecting rows that changed,
  unpublished or became unreachable between the two reads, and surfacing
  operational health — not repairing an index that cannot drift.
- **Only two content types are reconciled** — `learning_path` and `competency`,
  the two adapters SEARCH-001 provides. Courses and missions have no resolver
  yet and would resolve `unavailable`; they are deliberately not projected rather
  than reported as failures.
- The scale ceiling of query-time projection remains unmeasured, as recorded in
  Batch 1 §10.5.
