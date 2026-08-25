# Build Wave 9 — Batch 6

## Bounded Typo Recovery (SEARCH-005B)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `9a9536e` — docs: add human acceptance release gates

> This batch completes milestone **SEARCH-M5B**. With SEARCH-M5A it delivers the
> whole of SEARCH-005 — see section 11 for the completion assessment.

---

## 1. Purpose

Recover a learner from an ordinary typing mistake **only when their query
returned nothing**, and only toward a term this repository already approved.

SEARCH-005 §2: *"Small typos or alternate terminology should not cause empty
results unnecessarily."* §15: *"Fewer false empty searches."*

---

## 2. The closed target vocabulary IS the safety mechanism

The protection is not a parser that recognises every technical shape. It is that
a correction can only ever **output** a term drawn from
`PROTECTED_TECHNICAL_TERMS` and the curated alias vocabulary.

Correcting **toward** an approved technical term is safe. Correcting **away**
from one is what §6 forbids — and it is unreachable, because those terms are the
only possible outputs.

This is why `10.0.0.1`, `10.0.0.0/24`, `443`, `v1.29`, `--namespace` and
`resource_group` are safe: nothing within one edit of them exists in the
vocabulary. The explicit input exclusions are defence in depth, not the
protection.

Targets are **derived**, never restated, so a target cannot name an unapproved
term and a future approved term becomes a target automatically. Standalone terms
are collected before phrase tokens so a term's own casing wins — `Terraform`
rather than the `terraform` inside `terraform plan`.

**Zero database access, zero corpus.** The vocabulary is never built from
unauthorized, hidden, draft, retired or inaccessible records, from search
candidates, from learner behaviour, from analytics or from result frequency.
That is the structural reason a correction cannot leak: it is computable from the
learner's own query and a static table alone.

---

## 3. Bounds — every one deliberate

| Bound | Value |
|---|---|
| Edit distance | **1** (Damerau — one adjacent transposition counts as one) |
| Minimum token length | **4** |
| Short-token exception | **3**, lowercase letters only, target ≥ 4 |
| Corrected tokens per query | **1** |
| Recovered variants | **1** |
| Recovery passes | **1**, only after zero authorized results |
| Ambiguity | **Refused, never resolved** |

Distance 2 is **unreachable rather than capped**: `isWithinOneEdit` cannot
express it, so a distance-2 recovery is impossible even if every other bound were
removed.

The three-character exception exists for exactly one shape — `vln` inside
`show vln brief`. It is not general short-token fuzzy matching: uppercase
acronyms stay excluded, the target must be full length, and every other bound
still applies.

### Input shapes never eligible

Flags (`--namespace`) · `key=value` (`index=botsv`) · any digit-bearing token
(IP, CIDR, port, version) · uppercase acronyms (`AD`, `RTO`, `IAM`).

Hyphenated and underscore-bearing input **is** eligible, because the closed
target set already guarantees the output is approved — which is what makes
`Get-ADUsr` → `Get-ADUser` safe while `resource_group` simply finds no target.

---

## 4. A defect this batch found and fixed

`terraform plan` was being "corrected" to `terraform vlan`.

`plan` is an approved term **and** is one edit from the approved term `vlan`, so
without an is-already-a-target check the recovery corrupted an already-correct
protected technical term — precisely what §6 forbids. Found by the
protected-terms test before any commit; fixed by refusing to correct any token
that is itself an approved target, and covered by a named regression test.

---

## 5. Recovery runs only on empty results

```
original query → 005A normalization + approved aliases
  → escaped variants → RLS-scoped read → SEARCH-003 surfacing
  → version resolution → SEARCH-004 filtering → classification
       │
       └─ if ZERO authorized results → one bounded correction
            → the SAME pipeline again, identical boundaries
```

Recovery is **never** attempted when the original path produced results — even
for a query that merely looks misspelled. Verified by test `I2`, where
`kubctl` matches a real row and no second pass occurs.

The service defines the pipeline **once** (`runAuthorizedPass`) and calls it at
most twice, so the recovery pass cannot diverge from the original. The verifier
pins one definition, exactly two calls, and exactly one caller-scoped client.

If recovery finds nothing, the learner keeps the honest empty result and is told
**nothing** about the attempt.

---

## 6. Authorization is untouched

Every pass uses the caller's own `createUserScopedSupabaseClient`. There is no
service-role client and no alternate authorization path. Recovered results pass
through the identical SEARCH-003 surfacing, version resolution and SEARCH-004
filtering — proven by `I11` (published-only enforced on all eight reads) and
`I13` (a filter still excludes recovered results).

**Recovery changes query interpretation only. It does not change authorization.**

Facets and counts describe only the final surfaced result set. The failed
original pass leaks no candidate, hidden, withheld, alternative or recovery
count.

---

## 7. Transparency and returning to the original query

The existing `queryAdjustment` contract carries this with **no shape change** —
`adjustmentKind` is typed `Exclude<CurriculumMatchKind, "exact">`, so adding
`typo` to the match-kind vocabulary extended it automatically. Still exactly
three fields.

> No results for "kubctl". Showing results for "kubectl".
> [ Search for "kubctl" instead ]

Choosing that control shows the honest empty state for the original query.

**§10's "return to the original query" needed no API change, and none was made.**
Recovery only ever runs when the server **already executed the original query and
it returned zero authorized results** — so the empty state is a result the server
actually produced, not a guess. Re-submitting the unchanged search box re-runs
the original normally.

There is no `mode=`, `searchMode`, `fuzzy=`, `disableTypo`, `disableAliases`,
`literal` or `exact` parameter. `server.ts` was **not modified**, and the
verifier pins the route's parameter set to exactly `q`, `limit` and
`contentType`.

No edit distance, candidate vocabulary, candidate count, hidden alternative,
confidence, similarity, match score or per-result match kind is exposed.

---

## 8. SEARCH-008 boundary

`typo` is the **last** match class — a recovered match can never outrank an
exact, normalized or alias match, and the verifier pins that it is last.

No relevance score, weight, boost, popularity, click history, behavioural,
semantic, AI or provider ranking. No general query or refinement suggestions and
no fallback navigation: SEARCH-008 owns those and remains unimplemented.

---

## 9. Existing guards narrowed — reported, not silent

| Guard | Why | Property |
|---|---|---|
| §17 (SEARCH-002) `typo` forbidden in Curriculum Search | bounded recovery is now the approved deliverable | **strengthened** — `typo` removed, but `damerau`, `semantic`, `trgm`, `spelling` and `similarity` added |
| §37 (SEARCH-004) same list | same basis | same strengthening |
| §42 (SEARCH-005A) match-kind vocabulary pinned to three | `typo` is now approved | re-pinned to the exact four-kind array **plus** a new guard that `typo` is last |
| Service test `D` | forbade `typo` in the service | narrowed identically and extended with the same additional terms |

Every narrowing removed exactly one now-approved word and added more prohibitions
than it removed.

---

## 10. Not proven here

**There is no live PostgreSQL or RLS test harness.** Every authorization claim
above is a **query-level and structural claim, not live-database proof**. The
service tests mock the client factory using the CERT-005 precedent. This mirrors
the limitation recorded for SEARCH-003 (Batch 3 §10), SEARCH-004 (Batch 4 §9) and
SEARCH-005A (Batch 5 §9).

The test harness now approximates `ILIKE` so a pass can genuinely return zero
results; it is still a stand-in, not PostgreSQL.

**Rendered markup is not proven** — `apps/web` has no DOM harness. The
return-to-original control is asserted as a source assertion in the verifier and
every string it renders is unit tested.

---

## 11. SEARCH-005 completion assessment

| §14 DoD item | State |
|---|---|
| normalization pipeline exists | ✅ 005A |
| technical token rules exist | ✅ 005A, extended by 005B input exclusions |
| alias dictionary structure exists | ✅ 005A |
| **typo tolerance is bounded** | ✅ **005B** |
| original-query fallback exists | ✅ 005A, plus the 005B return-to-original affordance |
| tests cover representative technical searches | ✅ all five protected terms and all listed technical shapes |
| Founder approval recorded | ✅ |

| §13 acceptance | State |
|---|---|
| search common acronyms and aliases | ✅ |
| **recover from small typos** | ✅ **005B** |
| search code/command-like tokens | ✅ |
| see when the platform adjusted the query | ✅ |
| preserve exact technical terms | ✅ |
| apply deterministic aliases | ✅ |
| avoid unsafe query expansion | ✅ |

**On the evidence, SEARCH-005 now satisfies its acceptance criteria and
Definition of Done.** That is a recommendation for the Founder/architect review
to accept or reject — this batch does not mark it complete on its own authority,
and the practical limitation of section 12 is part of the judgement.

---

## 12. Known limitations

The vocabulary is small because **no curriculum is seeded** — the curriculum
migrations create schema only. Typo recovery therefore helps only for the
approved technical terms today. It grows automatically as approved terminology
grows. Corpus-derived recovery from authorized rows was evaluated and
**deferred**, unassigned to any feature.

---

## 13. Boundaries held

No migration · no database extension · no `pg_trgm` · no dependency · no
lockfile change · no `SearchDocument` change · no route change · no `server.ts`
change · no index · no cache · no queue · no worker · no AI, LLM, embedding,
external spelling provider or suggestion API.

**SEARCH-006, SEARCH-007 and SEARCH-008 remain unimplemented.**

Search Human UAT has **not** been performed. Per DEC-047 it occurs after
SEARCH-001 through SEARCH-008 and the automated Search Engine completion gate.

CERT-008's migration remains unexecuted.
