# Search Engine — Founder Human UAT Runbook

**Work packages:** SEARCH-CLOSURE-1 (prepared); SEARCH-CLOSURE-2 and SEARCH-CLOSURE-3 (gate status, section 0.1)
**Prepared at:** `7717b16`
**Covers:** SEARCH-001 through SEARCH-008 as committed
**Governed by:** DEC-047; `MVP_IMPLEMENTATION_SEQUENCE.md` §15d "Search Engine UAT"
**Companion:** `BUILD_WAVE_9_SEARCH_ENGINE_COMPLETION_REVIEW.md`

This runbook describes what to exercise and what to observe. It does not say
what the reviewer should conclude. Search Human UAT has **not** been performed,
and nothing in this document grants Search product acceptance.

---

## 0. Before starting

### 0.1 Gates that precede this UAT

1. `npm run gate -- search-engine-completion` passes. **It has not passed.** On
   2026-10-02 at `7717b16` it exited **1** — reported in SEARCH-CLOSURE-2 and
   observed in SEARCH-CLOSURE-3 (completion review sections 3.2–3.3). The
   failure is `npm audit --audit-level=high` in the security scan, on a
   high-severity `brace-expansion` advisory reached dev-only through
   `@tlp/web → eslint → minimatch`. Gate sections 1–17, the Wave 9 structural
   checks, typecheck, tests and `npm run build` all passed inside the gate in
   the observed run. That is not a Search defect.
   The recommended remedy is a one-record, lockfile-only update; under the
   accepted dependency policy it needs its own specific Founder decision and a
   separate bounded package (completion review finding 4.1).
2. The independent architecture review of the Search closure packages is
   complete.
3. Rendered Architect review has occurred. It is **pending**.

### 0.2 Authored curriculum is not searchable curriculum

Search returns only database rows in `learning_paths`, `courses`, `missions` and
`competencies` whose `publication_state` is `published`, read through the signed-in
account's own row level security. It never reads repository content files.

| State | Where it lives | Visible to Search? |
|---|---|---|
| **Authored** — e.g. `content/curriculum/networking-foundations.json`, `packages/shared-types/src/roas-curriculum.ts` | the repository | **no** |
| **Bundled for development UAT** — the `apps/web/src/uat/` harness used for Networking Foundations Missions 1–8 | the browser bundle | **no** |
| **Imported as draft** — `npm run admin:publish-curriculum -- <file>` without `--publish` | the database, `draft` | **no** |
| **Published** — `npm run admin:publish-curriculum -- <file> --publish`, or `npm run admin:publish-roas-curriculum` | the database, `published` | **yes**, subject to RLS |

As of `7717b16` there is no seed file and no migration that inserts curriculum.
Whether any curriculum has been published to the UAT project **cannot be
determined from the repository.**

Publishing is a database write and a **Founder gate**. Both commands are dry runs
unless `TLP_UAT_BOOTSTRAP_CONFIRM` is set equal to `SUPABASE_URL`, and both refuse
a production project. `content/README.md` describes a prerequisite migration for
the JSON import (`20260902000100_curriculum_authoring_privileges.sql`); its
applied state in the UAT project is likewise not observable from the repository.

**Check before testing:** after signing in, open **Search** and search for a
nonsense term. The resulting empty-result panel includes a "Browse published
curriculum" list of published learning paths (section 6). Note what that list
shows; the steps below depend on published curriculum being present.

### 0.3 Environment

- The web app and API running against a **non-production** Supabase project.
- A Founder account (MFA required — Search sits behind `FounderMfaGate` for
  Founder accounts).
- Where available, a second, ordinary learner account, for section 7.
- Search is reached from the **Search** button in the signed-in workspace
  navigation. It has no URL of its own.
- Personal notes have no browser editor. Notes for section 5 must already exist,
  or be created through the API (`POST /notes`) as the account under test.

### 0.4 Corpus notes

Record, before starting, the titles of at least a few published learning paths,
courses, missions and competencies. Several steps below ask for a term known to
appear in a published title, and a term known to appear only in a description.

---

## 1. Basic search (SEARCH-002)

1. Search for a word known to appear in a published course title.
2. Search for a word known to appear only in a published description.
3. Search the same query twice and compare the two result lists.
4. Submit an empty query, then a query consisting only of spaces.
5. Search for a term known **not** to appear anywhere in published curriculum.

Observe: the result count line, the labelled curriculum result group, the content
type shown on each result, and the message shown for steps 4 and 5.

## 2. Filters and facets (SEARCH-004)

1. Run a query that returns more than one content type.
2. Select one content type and run again; then select two.
3. Use the clear-filters control.
4. Select a content type that the current query has no results for.

Observe: which counts are displayed beside each filter, whether the counts match
the visible results, and the state after clearing.

## 3. Technical terms, aliases and typo recovery (SEARCH-005)

1. Search for `AD`, then for `Active Directory`. (`AD → Active Directory` is the
   one approved alias.)
2. Search for command-like terms with punctuation and casing, for example
   `show vlan brief`, `Get-ADUser`, `kubectl`, `terraform plan`, and a term with a
   trailing `?`.
3. Search for a one-letter misspelling of a protected technical term, for example
   `show vln brief` or `kubctl`.
4. After step 3, use the control offering to return to the original wording.
5. Search for a two-letter misspelling of the same term.

Observe: the sentence describing any adjustment, whether the learner's original
wording is named, the result set before and after step 4, and the outcome of
step 5.

Typo recovery corrects only toward a closed list of approved technical terms and
runs only when the original query returned nothing. Steps 3–5 produce visible
results only if the corrected term appears in published curriculum.

## 4. Result ordering (SEARCH-008 ranking)

1. Run a query that matches one item's whole title, another item's title
   partially, and a third item's description only.
2. Run the same query again.
3. Read the sentence above the results that states the ordering rule.

Observe: the order of results, whether it changes between runs, and the stated
rule.

## 5. Personal notes (SEARCH-006)

1. As an account that owns notes, search for a word in one of its notes.
2. Search for a word that appears in both a note and published curriculum.
3. As a second account, search for the same word from step 1.

Observe: whether notes appear in their own labelled group, whether curriculum and
note results are mixed, and what the second account sees.

## 6. Empty, unavailable and structured navigation (SEARCH-008 fallback)

1. Search for a term with no published match, with no filter active.
2. Repeat with a content-type filter active.
3. **Intentionally incorrect path:** stop the API, then run any search.
4. With the API still stopped, observe the notes section and the browse list.
5. Restart the API and search again without reloading.

Observe: the wording in steps 1 and 3 and how each describes what happened,
whether a clear-filters offer appears in step 2 and in step 3, the "Browse
published curriculum" list in each state, and the recovery in step 5.

## 7. Authorization (SEARCH-003) — where testable

1. As an ordinary learner account, search for a term known to appear in an
   unpublished (draft) item.
2. Compare the result count for a broad query between the Founder account and
   the learner account.

Observe: what appears and what counts are displayed. This is the only part of
the run that touches live row level security; the automated suite does not
(completion review finding 4.3).

## 8. Navigating from a result

1. Activate the link on any curriculum result.
2. Activate an entry in the browse list.

Observe: where the browser goes. **Known risk area:** result links point at
`/learning-paths/…`, `/courses/…`, `/missions/…` and `/competencies/…`, and the SPA
has no route handler for those paths (completion review finding 4.5).

## 9. Keyboard and assistive technology

1. Complete sections 1–3 using the keyboard only.
2. With a screen reader running, run a search, apply a filter, and trigger the
   empty-result state.
3. View the Search screen at a narrow viewport and at 200% zoom.

Observe: focus order, the visible focus indicator, what is announced when results,
counts, adjustments and fallback states change, and reflow. None of this has been
observed in a browser by automation (completion review finding 4.4).

## 10. Founder freshness route (SEARCH-007)

`/admin/search/freshness` has no browser surface. It can be exercised only through
the API as a Founder; a request without Founder authorization is expected to be
refused. Exercising it is optional for this UAT.

---

## 11. Unresolved limitations entering UAT

- Completion gate exits 1 on the `npm audit` high-severity dependency advisory;
  build passed; the remedy awaits its specific Founder decision (finding 4.1).
- Lint exits 2; ESLint 9 flat configuration is absent (finding 4.2).
- Earlier closure results are reported by the Builder that ran them; only the
  gate and lint were re-observed in SEARCH-CLOSURE-3 (completion review
  section 3).
- Historical 5,000 ms test timeouts did not reproduce; their cause is not
  established (completion review section 3.1).
- No live RLS harness; authorization evidence is query-level (finding 4.3).
- No browser harness and no Search DOM test; accessibility evidence is
  structural (finding 4.4).
- Search result destinations are not routed by the SPA (finding 4.5).
- Searchable corpus depends on a Founder-gated publication step (finding 4.6).
- Only titles carry ranking weight; ranking usefulness is unmeasured.
- Structured navigation lists learning paths only.

## 12. Recording findings

Classify each finding before any fix is proposed: curriculum/content, technical
writing, functional interaction, UI/visual, UX/usability, accessibility,
state/progression, architecture, or regression. Material findings return through
a scoped work package. Final Search product acceptance remains pending until the
UAT is performed and blocking findings are resolved.
