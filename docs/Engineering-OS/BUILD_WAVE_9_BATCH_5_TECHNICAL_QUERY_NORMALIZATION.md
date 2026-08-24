# Build Wave 9 — Batch 5

## Technical Query Normalization and Curated Aliases (SEARCH-005A)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `bd08a0b` — docs: resolve search feature dependencies

> **SEARCH-005 is NOT complete.** This batch delivers milestone **SEARCH-M5A**
> only. **SEARCH-M5B — bounded typo recovery — remains unimplemented** and
> requires its own mechanism ruling. SEARCH-005 section 14 is unchanged and its
> "typo tolerance is bounded" item is outstanding.

---

## 1. Purpose

Let a learner find content when they type an approved acronym or add trailing
sentence punctuation, **without ever damaging the technical string they meant**.

---

## 2. The curated vocabulary — one attested entry

| Canonical | Alias | Authority |
|---|---|---|
| Active Directory | AD | SEARCH-005 §2 verbatim: **"AD / Active Directory"** |

**One entry is the correct outcome, not an unfinished one.** The repository seeds
no curriculum content — the four curriculum migrations create schema only, with
no `insert into learning_paths / courses / competencies` anywhere — so there is
no corpus from which terminology could be derived. The only admissible evidence
is terminology written into approved specifications.

`RTO`, `RPO` and `IAM` are **deferred, on provenance rather than correctness**:
the acronyms are attested, but no repository authority establishes their expanded
forms. They are recorded in `DEFERRED_TERM_ALIAS_CANDIDATES` with that reason, so
a future contributor does not mistake deferral for a judgement about technical
accuracy. They become eligible when approved Curriculum content defines the
relationship, an approved Search terminology specification defines it, or the
Founder approves a broader vocabulary source.

The dictionary was **not padded**. Adding a reviewed entry later is an append.

### The short-alias retrieval rule

The relationship is **bidirectional in the vocabulary**. Only its emission as a
retrieval pattern is gated, by `MIN_ALIAS_RETRIEVAL_LENGTH = 3`.

SEARCH-002 matches by substring `ILIKE`, so `%AD%` would also match
"administration", "advanced", "upload", "read" and "broadcast" — and CURR-002
names "Windows administration" as a curriculum domain. SEARCH-005 §6 excludes
"aggressive synonym expansion that changes meaning" and §13 requires avoiding
unsafe query expansion, so emitting that pattern is forbidden by the Feature's
own scope.

`AD` → `Active Directory` is live. `Active Directory` → `AD` is recorded and
inert, and becomes usable automatically if an approved token-aware matching
mechanism ever exists. **SEARCH-002 matching semantics were not changed** — no
regex, no word-boundary operator.

---

## 3. Normalization rules

| Rule | Behavior |
|---|---|
| **R1** Whitespace | Collapse internal runs, trim. Pre-existing. |
| **R2** Terminal punctuation | Strip `? ! , ; :` and paired quotes from the **ends of the whole query only**. |
| **R3** Case | **Unchanged** — matching is already case-insensitive. |
| **R4** Alias detection | **Token-based, never substring.** |
| **R5** Nothing else | No stemming, no plural handling, no internal punctuation removal, no typo handling. |

**Internal technical punctuation is never touched.** `=`, `-`, `_`, `/` and `.`
are absent from the removable set and the verifier fails if any is added.
`Get-ADUser`, `index=botsv3`, `terraform plan` and `show vlan brief` pass through
byte-identical, and `index=botsv3?` loses only the question mark.

R4 is why `Get-ADUser`, `ADD`, `upload`, `read` and `broadcast` never trigger the
acronym: those are single tokens that are not equal to `ad`, and no substring
comparison is performed during detection.

---

## 4. Bounded, deterministic expansion

Maximum **4 variants including the original**. Priority — also the tier order:

1. **the original query — always variant 1, never displaced**
2. the terminal-punctuation-normalized query, if it materially differs
3. approved aliases, in vocabulary declaration order

Duplicates collapse before the cap. Overflow truncates by declaration order —
never sampled, never randomized. Each alias derives from the **original** query
rather than from another variant, so variants can never compound: there is no
Cartesian product and no combinatorial expansion.

**The cap is a maximum, not a target.** Real queries produce one or two variants:
`kubectl` → 1, `AD` → 2, `kubectl?` → 2, `Active Directory` → 1.

---

## 5. Retrieval — expanded, never post-filtered

A post-filter over a literal `ILIKE` result set can only remove rows that already
matched, so it could never surface an alias hit. Every variant is escaped
independently and **all variants combine into the existing single `.or()` per
table**:

```
title.ilike.%AD%,description.ilike.%AD%,
title.ilike.%Active Directory%,description.ilike.%Active Directory%
```

**Broadening adds no source query.** Retrieval remains four reads per search — one
per searchable type — and the `limit * 4` over-fetch bound per table is
unchanged, proven by test `H3`.

---

## 6. Order is the security property

```
identity → validation → normalization + alias expansion (query-side, no DB access)
  → escape every variant → RLS-scoped source read → SEARCH-003 surfaceAuthorized
  → version resolution → SEARCH-004 filter → match classification
  → exact/normalized/alias tiering → bounded results → facets → adjustment
```

Expansion changes **which authorized rows match**; it never changes **which rows
are authorized**. Classification runs after `surfaceAuthorized`, so it only ever
reads text the caller is already entitled to see. Test `H16` asserts that a
broadened query issues byte-identical `from` and `.eq` calls to an unbroadened
one.

---

## 7. Match-class tiering is not relevance ranking

`exact → normalized → alias`. `typo` is absent and reserved for SEARCH-005B.

SEARCH-002's neutral order is applied **first** and preserved **within** each
tier: the tier pass is a stable sort keyed solely on the vocabulary index. **With
every result in one tier the output is byte-identical to SEARCH-002.**

There is **no numeric value anywhere**: no score, weight, boost, freshness,
competency, Course/Mission context, popularity, click history, AI ranking,
persisted signal or ranking configuration. The comparator subtracts two
vocabulary indices and consults nothing else.

Tiering runs **before** the bound, so an exact match can never be truncated in
favour of an alias match (`H10`).

---

## 8. Transparency

```jsonc
"queryAdjustment": {
  "originalQuery": "AD",
  "effectiveQuery": "Active Directory",
  "adjustmentKind": "alias"
}
```

Omitted entirely when nothing meaningful changed. Exactly three fields — the
verifier pins the shape. No retrieval pattern, `ILIKE` pattern, variant array,
variant priority, candidate count, hidden alternative, edit distance, ranking
internal or diagnostic. **Per-result `matchKind` is internal ordering metadata
and never reaches the learner or a `SearchDocument`.**

**No API mode was added.** There is no `exact=true`, `literal=true`,
`disableAliases=true` or `mode=exact`. SEARCH-005 §10's "return to the original
query" is satisfied structurally rather than by a toggle: the learner's words stay
in the search box, are permanently variant 1, are named first in the sentence,
and exact matches are shown above adjusted ones — so there is nothing to undo.
`server.ts` was therefore **not modified**.

---

## 9. Not proven here

**There is no live PostgreSQL or RLS test harness in this repository.** Every
authorization and isolation claim above is a **query-level and structural claim,
not live-database proof**. The service tests mock the client factory using the
CERT-005 precedent, so they prove which client is used and which collection each
step operates on; they do not execute a PostgreSQL policy. SEARCH-005A adds no
authorization of its own, uses the existing caller-scoped client unchanged, and
preserves the SEARCH-003 authorization-before-surfacing boundary. This mirrors the
limitation recorded for SEARCH-003 (Batch 3 §10) and SEARCH-004 (Batch 4 §9).

**Rendered markup is not proven.** `apps/web` has no DOM harness, and
`verify-wave7.sh` fails the build if `jsdom`, `@testing-library/react` or
`jest-axe` is added. The adjustment notice is asserted as a source assertion in
the verifier, and every string it renders is unit tested.

---

## 10. Existing guards narrowed — reported, not silent

Three SEARCH-001–004 guards were narrowed because approved SEARCH-005A behavior
made their exact pin obsolete. **In every case the security property is unchanged
and each was re-pinned equally strictly, never deleted.**

| Guard | Why | Property |
|---|---|---|
| §16 `buildCurriculumSearchResults(documents, limit)` | tiering must run between neutral ordering and the limit slice | results still bounded by the requested limit; re-pinned on `buildTieredCurriculumSearchResults(classified, limit)` |
| §17 `escapeCurriculumSearchPattern(query)` | there are now multiple variants | every pattern still escaped; re-pinned on `escapeCurriculumSearchPattern(variant.value)` **plus** a new exactly-one-escaping-path count and a guard that no raw query reaches `.or(` |
| §32 facet composition pin | the builder producing the bounded set changed | facets still computed from the final bounded authorized set; re-pinned on the new composition |

All SEARCH-005B and SEARCH-008 prohibitions were **preserved**.

---

## 11. Boundaries held

No migration · no database extension · no `pg_trgm` · no dependency · no
lockfile change · no `SearchDocument` change · no new route · no `server.ts`
change · no index · no cache · no queue · no worker · no AI.

**SEARCH-005B unimplemented:** no free-form typo tolerance, Levenshtein,
Damerau-Levenshtein, soundex, spelling-variant generation, typo match kind or
typo retrieval variant.

**SEARCH-008 unimplemented:** no relevance ordering, scoring, weighting,
boosting, fallback navigation, empty-result recovery or provider degradation.

**SEARCH-006 and SEARCH-007 unimplemented.**

CERT-008's migration remains unexecuted.
