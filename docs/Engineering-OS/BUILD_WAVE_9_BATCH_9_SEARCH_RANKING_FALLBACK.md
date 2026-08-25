# Build Wave 9 — Batch 9

## Search Result Ranking and Fallback (SEARCH-008)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `c870e9d` — build: add search indexing and freshness pipeline

---

## 1. The approved section 12.1 interpretation

SEARCH-008 §12.1 says "Fall back to approved simpler search." **In this platform
that phrase has no referent**, and the Founder ruling is implemented as approved:
it must not cause a second search implementation.

There is no preferred or advanced search provider. The deterministic escaped
`ILIKE` path built across SEARCH-002 through SEARCH-007 **is** the approved
simple search. Building a second query path purely to have something to degrade
*to* would create a second authorization path — the exact hazard every Search
batch has been verified against — so no second provider, retrieval path,
alternate authorization or simulated provider infrastructure was created.

§12.2 through §12.4 are satisfied **concretely**:

| §12 item | How it is satisfied |
|---|---|
| **12.2** preserve permission boundaries | fallback performs no search; navigation reads through the caller's own token via the Curriculum Engine's existing published-paths read |
| **12.3** tell the user search is limited | a dedicated degraded headline that states plainly it is *not* an empty result |
| **12.4** keep structured navigation available | published learning paths, composed from the existing authenticated `GET /curriculum/paths` |

**The Feature Registry was not edited to fit the implementation.**

---

## 2. The ranking mechanism, in full

A lexicographic comparator over **named vocabularies**. There is no numeric
relevance value anywhere.

| Rule | Source | New in SEARCH-008? |
|---|---|---|
| **R1** match class — `exact → normalized → alias → typo` | SEARCH-005 | no — composed |
| **R2** title precision — `whole_title → title_token → title_substring → description_only` | SEARCH-008 | **yes — the only new signal** |
| **R3** content type — `learning_path → course → mission → competency` | SEARCH-002 | no — composed |
| **R4** `sourceRecordStableId` | SEARCH-002 | no — composed |

**R1 dominates R2 by ruling.** A result that matched the learner's *actual* words
must never be displaced by one that only matched after the query was adjusted,
however precisely it matches. The verifier pins the comparator body exactly, so
reordering the two keys fails the gate.

**R3 and R4 arrive together** as SEARCH-002's existing neutral order, applied as
a pre-pass. Because that pre-pass is a total order and the ranking sort is
stable, the same documents in any input order produce byte-identical output.

Title token comparison **reuses** SEARCH-005's `containsTokenSequence`. That is
load-bearing rather than decorative: it is token-based, which is what ranks
`terraform plan` above `Terraform planning` instead of tying with it, and what
keeps `Get-ADUser` from being read as the acronym `AD`. SEARCH-008 implements no
second matching rule.

### Signals deliberately not used

`sourceUpdatedAt` · freshness weighting · competency references · current Course
or Mission context · learner progress · learner identity · popularity · click
history · engagement · analytics · private behaviour · private note content ·
keyword frequency · any numeric score, weight or boost · AI, semantic, vector or
embedding ranking.

Three of those — competency match, Course/Mission context and keyword frequency
— are named in §5 as signals ranking *may* consider. They were declined for a
concrete reason as well as a ruling: `projectCurriculumDocument` populates
neither `curriculumContext` nor `competencyReferences`, and always passes an
empty `keywords` array, so **none of the three is computable from what SEARCH-002
projects today**. Using them would require changing the SEARCH-002 projection,
and Course/Mission context would additionally require reading learner progress —
a new cross-engine dependency and a personalization-adjacent input.

---

## 3. Bounding runs last, and that is a correctness property

Order of operations inside `buildRankedCurriculumSearchResults`:

```
neutral SEARCH-002 order  →  stable sort on (R1, R2)  →  slice(0, limit)
```

If the limit were applied first, a whole-title exact match could be truncated
away in favour of a description-only match that happened to sort earlier
neutrally — the learner would lose the single most relevant result to an
implementation detail. The verifier compares byte offsets to prove the sort
precedes the slice, and that the neutral pre-pass precedes the sort.

---

## 4. Ranking runs only after authorization

The approved order is preserved exactly, and the verifier proves it by byte
offset rather than by inspection:

```
RLS-scoped read → SEARCH-003 surfacing → version resolution
  → SEARCH-004 filtering → SEARCH-005 classification
  → SEARCH-008 ranking → requested limit → facets → response
```

`buildRankedCurriculumSearchResults` receives `classified`, a value that exists
only downstream of `surfaceAuthorized`. A withheld record is **not in its input**,
so it cannot influence an order, a tie-break, a suggestion or a count. The
comparator's signature admits no token, client, identity or read of any kind —
that is a signature-level guarantee, not a convention.

Recovery passes rank against the variants that **actually found** the results, so
a SEARCH-005B recovered result is judged by the corrected query rather than
collapsing uniformly into the weakest precision class.

---

## 5. Failure and emptiness never collapse

This is the batch's sharpest requirement (ruling 7).

| State | Cause | What the learner is told |
|---|---|---|
| `no_results` | search RAN, was authorized, matched nothing | "No matching curriculum found for “…”." |
| `search_unavailable` | curriculum search could NOT run | "Search is unavailable right now, so nothing could be searched. **This is a search problem, not an empty result.**" |

A third case — an invalid query, such as an empty one — is neither, and clears
the degraded flag explicitly.

`error` alone could not carry this distinction because it also holds ordinary
validation messages. A separate `degraded` flag is set at **exactly one** site,
and the verifier pins both the flag's single assignment and the complete state
expression that derives the two reasons from different facts.

The zero-result trigger reads `results.count` — the number of authorized results
**actually returned**. The response contains no candidate, withheld or global
total, and `CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS` makes one inexpressible, so
no hidden record can reach the decision. A zero-result state caused by "nothing
matched" and one caused by "everything was withheld" are therefore
**indistinguishable to the fallback** — which is exactly correct.

---

## 6. Suggestions are offers, never behaviour

Two actions exist, and no more:

- **`clear_filters`** — offered only when a filter is genuinely active *and* the
  search actually ran. Offering it after a dependency failure would imply the
  learner's filters caused the failure and would send them to re-run a search
  against a source that is still down.
- **`browse_curriculum`** — always offered.

Nothing here broadens a query, generates a synonym, alters a filter, re-runs a
search or widens scope. **The learner chooses.** The clear action reuses the
existing SEARCH-004 clear-all control rather than relaxing the filter
automatically, and the verifier proves the fallback surface contains no call to
`runSearch`, `setContentTypes`, `searchCurriculum` or `searchMyNotes`.

**"Return to your original wording" is deliberately absent.** SEARCH-005B already
renders that affordance, and it is only meaningful when a recovery produced
results — in which case there are results and no fallback is shown. Adding it
here would duplicate a SEARCH-005 control and begin the second correction system
the ownership boundary forbids.

Guidance is a pure function of three inputs: the learner's own submitted query,
whether a filter is active, and the reason. No document, result, count, note or
client is reachable from its signature.

---

## 7. Structured navigation

`GET /curriculum/paths` — the **existing** authenticated Curriculum Engine route.
**SEARCH-008 adds no API route, no request parameter and no response field.**

The read is already constrained to `publication_state = 'published'` and already
goes through the caller's own RLS-scoped client. The browser service sends no
identity, no query parameter and no body, and builds no transport or
`Authorization` header of its own.

The response is projected through `buildCurriculumNavigationEntries`, which
assembles each entry by **explicit assignment** — the same discipline
`buildSearchDocument` applies — so the internal database identifier the Curriculum
contract carries never reaches the Search surface. The destination reuses
SEARCH-002's `buildCurriculumSourceReference`, so fallback navigation lands a
learner on exactly the route a search result would have. The list is bounded at
20 entries.

Three navigation states stay distinct: loading, **unavailable**, and the entries
the caller may actually see. A failed read is never rendered as an empty list,
which would claim the platform has no published curriculum.

The navigation list is **unordered** markup: published paths carry no ranking, and
presenting them as ranked would imply a judgement Search did not make.

---

## 8. Accessibility

Curriculum results are now an **ordered** list, because after SEARCH-008 their
sequence carries meaning. The ordering rule is stated above them as ordinary
text, and it names what the order does *not* depend on — popularity, other
learners, or anything the learner has done before — because §8's commitment is
only meaningful to a learner if it is said.

No per-result ranking annotation, position number, score or internal ordering
value is rendered. Nothing depends on colour, icon, hover or animation. The
verifier fails if `matchKind`, `titlePrecision` or any ranking internal appears
anywhere in the view, including in a comment.

**No browser accessibility testing was performed.** `apps/web` has no DOM harness
and `scripts/verify-wave7.sh` fails the build if one is added, so every claim
here is a **source-structural claim, not a rendered-accessibility claim**.

---

## 9. Not proven here

**There is no live PostgreSQL or RLS harness.** Every authorization and isolation
claim in this batch is a **query-level and structural claim, not live-database
proof**. The service tests mock the client factory using the CERT-005 precedent
and model what row level security would return; they do not execute a PostgreSQL
policy. This mirrors the limitation recorded for SEARCH-003 through SEARCH-007.

**No rendered accessibility proof** (section 8).

---

## 10. Existing guards narrowed — reported, not silent

Two verifier guards and one test were narrowly re-pinned. Every unrelated
assertion in each was preserved.

| Guard | Why it existed | What SEARCH-008 legitimately changed | Property preserved |
|---|---|---|---|
| `verify-wave9.sh` §16 — pinned `buildTieredCurriculumSearchResults(classified, limit)` | proves the returned set is bounded by the requested limit, through the approved builder, after ordering | ranking must occupy that position, for the same reason tiering did | re-pinned on `buildRankedCurriculumSearchResults(classified, effectiveVariants, limit)` **including the limit argument**; the `.limit(limit * 4)` over-fetch pin is untouched; two new assertions prove the builder composes SEARCH-005 match classes and SEARCH-002 neutral order rather than re-deriving them |
| `verify-wave9.sh` §32 — pinned `withCurriculumSearchFacets(buildTieredCurriculumSearchResults(classified,limit))` | facets must be computed from the **final bounded authorized** result set, never the candidate list or over-fetch window | only the identity of the builder producing that set | re-pinned on the flattened `withCurriculumSearchFacets(buildRankedCurriculumSearchResults(classified,effectiveVariants,limit))`, which still proves the facet call wraps the bounding builder **directly, with nothing between them** |
| `curriculum-search.test.ts` D2 — forbade the bare substring `rank` | asserted SEARCH-008 was unimplemented in the SEARCH-002 service | ranking is now the approved deliverable and the service composes its builder, whose name contains `rank` | the list **grew**: `relevance`, `score`, `boost`, `weight` stay forbidden and `rankscore`, `ranking configuration`, `popularity`, `engagement`, `clickhistory` were added. A ranking that scores, weights or boosts still fails |

**No other guard was changed.** The standing "SEARCH-008 ranking must not leak
into SEARCH-001/002/004/005A/007" scans at lines 164, 380, 819, 996 and 1628 were
examined and **kept exactly as they are** — SEARCH-008 lives in new modules, and
after this batch those guards become standing proof that the approved mechanism
is non-numeric and non-behavioural.

---

## 11. Boundaries held

No migration · no schema change · no RLS change · no database operation · no API
route · no request parameter · no response field · no new dependency · no search
provider · no Elasticsearch, OpenSearch, Algolia, Meilisearch, Redis or vector
database · no embeddings · no semantic or vector ranking · no AI of any kind · no
numeric relevance score, weight or boost · no popularity, click, engagement or
analytics signal · no learner identity or progress input · no personalization ·
no persisted index · no cache · no client storage · no background worker, queue,
scheduler or cron · no service-role Search path · no second retrieval path · no
second query-interpretation engine · no cross-source ranking · no private-note
influence on curriculum ordering.

**The Search Engine completion gate was NOT created.** Per ruling 12,
`scripts/verify-search-engine-completion.sh` is the next separate Wave 9 closure
step and will be reviewed on its own.

**`CURRENT_BUILD_STATUS.md` was NOT reconciled.** Per ruling 11 it is corrected at
Wave 9 closure. It therefore still records SEARCH-006, SEARCH-007 and SEARCH-008
as unimplemented; that lag is known and deliberate, not a discrepancy discovered
here.

Search Human UAT has **not** been performed. Per DEC-047 it occurs after
SEARCH-001 through SEARCH-008 **and** the automated Search Engine completion
gate. **The Search Engine is not complete and no product acceptance is granted.**

CERT-008's migration remains committed and unexecuted.

---

## 12. Known limitations

- **No live-RLS proof** (section 9) — the largest outstanding evidence gap,
  carried forward from every prior Search batch.
- **No rendered accessibility proof** (section 8).
- **Ranking quality is unmeasured.** The comparator is provably deterministic and
  provably explainable; whether its order *feels* useful to a learner is a
  question only the Founder Search UAT can answer, and no curriculum is seeded
  yet to answer it with.
- **Only titles carry ranking weight.** A result whose description matches far
  more strongly than another's ranks below any title match. That is the approved
  mechanism and it is honest, but it is a deliberate simplification, not an
  optimum.
- **Structured navigation lists learning paths only.** Courses and missions have
  no browse route, and SEARCH-008 does not add one — the destinations a result
  links to are still not routed by the SPA, a condition recorded in Batch 2.
- **The fallback panel is suppressed while the learner is viewing their original
  query** after a typo recovery, matching how every other section behaves in that
  state.
