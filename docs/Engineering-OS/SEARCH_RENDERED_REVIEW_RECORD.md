# Search Engine — Rendered Review Record and Founder Handoff

**Package:** SEARCH-UAT-HANDOFF-1
**Reviews:** PR #55 "Search closure and rendered UAT handoff", head
`59e7274992d9e8298af2d49fdfd8dfa54f526ecf`
**Against:** `main` at `a0f2745`
**Companions:** `SEARCH_FOUNDER_UAT_CHECKLIST.md` (what the Founder is asked to
do), `SEARCH_UAT_RUNBOOK.md` (the full step list, delivered by PR #55),
`BUILD_WAVE_9_SEARCH_ENGINE_COMPLETION_REVIEW.md` (the engineering review, also
delivered by PR #55)
**Governed by:** DEC-047, DEC-068

This record exists so the Search handoff is not idle. It states what was
executed and observed, what was deliberately not attempted, which findings are
closed and which are not, and what is left for the Founder. Every claim below is
marked **OBSERVED** where a command or an API response produced it, and
**INFERRED** where it did not.

It grants nothing. Search Human UAT remains pending, and this document does not
record product acceptance.

---

## 1. What is being reviewed, and whether it moved

**OBSERVED.** The Search implementation on PR #55's head is byte-identical to
`main`:

```
git diff --stat origin/main origin/ai/autonomous-mvp -- apps packages services
```

produces no output. PR #55's six changed files are the two review documents,
`CURRENT_BUILD_STATUS.md`, and the three files of the accepted
`brace-expansion` security closure.

**Consequence, and the reason this record can exist at all:** PR #55 does not
change the Search implementation, so evidence captured against `main`'s
application sources is evidence at PR #55's reviewed head. Nothing had to be
re-captured for code drift between the two, because there is none.

This branch then adds exactly one Search source change of its own — the five-line
state repair in section 3.1.1 — and every result below was produced with it in
place.

---

## 2. Gate status at the exact heads

**OBSERVED, via the GitHub checks API.** The required `verify` context on PR
#55's exact head `59e7274` concluded **success** (run `37079379637`, job
`111076314506`). The precondition the issue names holds.

**OBSERVED, and newly recorded.** `main` itself is **red**. The push run for
`a0f2745` (run `37155853863`, job `111298960843`) failed at the **Security scan**
step, on `npm audit --audit-level=high`, reporting the high-severity
`brace-expansion` advisories — the exact advisory PR #55's accepted closure
fixes. Reproduced locally at `a0f2745`: `npm audit --audit-level=high` exits
**1**.

That is not a Search defect, and it is not new work. It is the already-accepted
`SEARCH-SECURITY-APPLY-1` closure (`c2c684b`) not yet being on `main`.

### 2.1 The security closure, carried identically

This branch carries `c2c684b` as a cherry-pick, byte-identical to the accepted
commit — the same three files, the same lockfile record, the same two pinned
digests. It is not a re-derivation and not a widening.

**OBSERVED:**

| Fact | Value |
|---|---|
| `main` lockfile digest | `5718e12047…b5f58f`, which is the authorization's pinned **FROM** digest |
| this branch's lockfile digest | `ae794bd905…62bdd5`, which is its pinned **TO** digest |
| `npm audit --audit-level=high` here | exits **0**; two moderate `@vitest/mocker`/`vitest` advisories remain, below the gate threshold |
| `npm run gate -- dependency-policy` | exits **0**, including the sixteen `BRACE*` cases that pin both ends |

The transition remains one-time: its FROM end is pinned, so once it merges no
base hashes to it again. If PR #55 merges first, this branch's copy becomes a
no-op and can be rebased away.

### 2.2 Everything else run here

`npm run gate -- select <this package's changed paths>` selects
`verify-search-engine-completion.sh`, `verify-autonomy.sh`,
`verify-dependency-policy.sh` and `verify-wpj-m2.sh`. All four were run, not just
the Search one.

**OBSERVED**, on this branch head:

| Check | Result |
|---|---|
| `bash scripts/verify-search-engine-completion.sh` | exit **0** — 93 `PASS` lines, including the Wave 9 per-batch verifier it defers to |
| `npm run gate -- dependency-policy` | exit **0** |
| `npm run gate -- autonomy` | exit **0** |
| `npm run gate -- wpj-m2` | exit **0** |
| `npm run typecheck` | clean across all three workspaces |
| `npm test` | all passing — `@tlp/web` 23 files / 1004 tests, `@tlp/shared-types` 59 / 1388, `@tlp/api` 73 / 1779 |
| `npm run build` | clean, web and API |
| `npm run health` | exit **0** |
| `bash scripts/smoke-api.sh` | exit **1** on the default port; exit **0** with `API_PORT=3987` |
| `npm run lint` | exit **2** |

Two of those need their honest footnote.

**The smoke failure is an environment artifact, not a repository defect.** On the
default port 3001 the first probe reported `GET /assessments expected 401 got
200`, because an unrelated process in this review environment was already
listening there, so `curl` never reached the API the script had started. On a
free port every probe passes, including all four Search-reachable routes. CI
starts from a clean runner and observed this step passing on PR #55's head.

**Lint is pre-existing and outside Search.** `npm run lint` exits 2 because
`apps/web` has no ESLint 9 flat configuration. This is completion-review finding
4.2, it is not a Search defect, and lint is not a step in `verify` or in any
Search gate. Nothing in this package changed it.

---

## 3. The rendered review, and the honest boundary of it

The issue asks for current rendered evidence. What that can mean here has a hard
limit, and naming it precisely matters more than producing an artefact.

### 3.1 What was newly established

`apps/web/src/search/curriculum-search-surface.test.tsx` mounts the real
`CurriculumSearchView`, driven through the real feature services and the real API
client over a stubbed `fetch`, in a real DOM. **OBSERVED:** 18 cases pass.

It establishes, as mechanical properties of a live DOM rather than as readings of
the source:

- the search field's `<label>` is programmatically associated with it, and the
  surface is a real `<form>` submitted from the keyboard with no key handling of
  its own;
- each state the UAT script visits is reachable and renders the documented
  wording: initial, rejected query, in-flight, results, filtered, no-result,
  unavailable, recovered, notes-unavailable, and typo recovery with the way back
  to the learner's own words;
- curriculum results are an `<ol>`; the learner's notes are a separate labelled
  `<ul>`; filters are a `<fieldset>` with a `<legend>` and four native
  checkboxes, each with an associated label, and facet counts read "in these
  results";
- counts and adjustments are announced in polite live regions, and no score,
  rank, position number or algorithm internal is rendered;
- the filter selection reaches the wire as **repeated** `contentType`
  parameters, no request carries `userId`, `ownerId`, `studentId` or
  `learnerId`, and the bearer token is the session's;
- a curriculum search that **could not run** is never rendered as a search that
  matched nothing, and a failed notes search is never rendered as "no notes".

Those last two are the invariants a single boolean protects, and they were
previously asserted only by reading code.

**Mutation probe, OBSERVED.** Flipping `setDegraded(true)` to `setDegraded(false)`
in the view fails two of the new cases; the suite is not vacuous. Replacing
`setNotes(null)` with `setNotes([])` on the notes-failure path changes nothing
observable, because the error branch suppresses the notes branch entirely — that
mutation is genuinely equivalent, not a gap in the suite.

`scripts/verify-search-engine-completion.sh` section 17b now asserts the suite's
presence, its DOM environment, and one marker per covered state, so coverage
cannot quietly lapse back to structural.

### 3.1.1 The one defect the suite found, and its repair

**OBSERVED.** Building the suite surfaced a real state defect, repaired in this
package.

**Reproduction.** Sign in, open Search, search any term that returns at least one
of your own notes, then submit a query of spaces only.

**Before:** the validation message `Enter something to search for.` appeared, the
curriculum results were withdrawn — and the **previous query's note results and
note count stayed on screen** under "My notes". Half of one search's results were
presented as the state of another, with nothing on the surface naming the query
they belonged to.

**Classification:** state/progression, with a UX consequence. **Severity:** low —
nothing incorrect is said about any individual note, and no authorization,
privacy or count boundary is crossed. It is wrong about *which search* the
learner is looking at.

**Cause.** `runSearch`'s validation branch cleared `results` and the degraded
flag and returned, without touching `notes` or `noteError`. SEARCH-006 requires
the two sources to settle **independently during** a search; their lifetimes
**across** searches still have to match, and only one of them was being withdrawn.

**Repair.** The branch now clears `notes` and `noteError` as well — five lines in
`CurriculumSearchView.tsx`, no contract, service, request or wording changed. It
extends the decision already made for curriculum rather than making a new one.
A regression case in the DOM suite fails without it, and gate section 17b
requires that case to keep existing.

Two other dispositions were available and were not taken: leaving both result
sets intact across a rejected query, or clearing the stale notes while keeping
the stale curriculum results. Both change accepted behaviour for curriculum; the
repair above does not. If the Founder prefers either, it is a one-line change in
the same branch.

### 3.2 What was NOT established, and will not be claimed

jsdom is not a browser and has no assistive technology. Nothing above
establishes visual appearance, focus-ring quality, what a screen reader actually
announces, contrast, zoom or reflow behaviour, responsive readability, or whether
any of it is useful to a learner. Those are rendered review and Founder UAT, and
section 1 of the checklist asks for them.

No browser was driven and no screenshot was taken in this package. No browser
automation dependency exists in this repository, `@testing-library/react` and
`jest-axe` remain unauthorized by `scripts/verify-wave7.sh`, and adding either
would be a dependency decision, not a bounded handoff.

`fetch` is stubbed throughout, so **no claim is made about live row level
security.** Completion-review finding 4.3 is unchanged.

### 3.3 Why the application was not driven against a real environment

Exercising Search end to end needs a non-production Supabase project, a Founder
account past MFA, and **published** curriculum. Search reads only rows whose
`publication_state` is `published`; it never reads repository content files, no
seed file or migration inserts curriculum, and publishing is a database write and
a Founder gate. Whether anything has been published to the UAT project is not
observable from the repository.

**INFERRED, not observed:** against an unpublished project, every curriculum step
of the runbook reaches the empty-result state. That state is now covered
mechanically, which is why the Founder checklist puts the publication decision
first rather than sending a reviewer to discover it.

---

## 4. Findings and dispositions

| # | Finding | Classification | Disposition |
|---|---|---|---|
| 1 | `main` is red on the `brace-expansion` advisory the accepted closure fixes | security / release sequencing | **Carried.** This branch carries the identical accepted commit, so its own head is green. Merging PR #55 resolves it on `main`. |
| 2 | Result destinations are not routed by the application (completion review 4.5) | architecture / scope | **Open, not repaired.** Routing `/learning-paths/…`, `/courses/…`, `/missions/…` and `/competencies/…` means adding a router and four detail surfaces that do not exist. That is a new product surface, Lovable is the canonical direction for it, and it is a Founder/architect decision — checklist 0.2. |
| 3 | No rendered or browser accessibility proof (4.4) | accessibility | **Mechanical half closed** by the DOM suite and gate section 17b. The rendered half is unchanged and is checklist step 6. |
| 4 | No live PostgreSQL / RLS proof (4.3) | security / architecture | **Open, unchanged.** Partly observable by the Founder with two accounts; the automated suite cannot reach it. |
| 5 | Searchable corpus depends on a Founder-gated publication (4.6) | prerequisite | **Open, Founder gate** — checklist 0.1. Not a defect. |
| 6 | Lint exits 2; no ESLint 9 flat configuration (4.2) | pre-existing, outside Search | **Open, untouched.** Not a gate step, not a Search defect. |
| 7 | Smoke probe fails on an occupied default port | environment | **Not a defect.** Reproduced and explained in section 2.2; passes on a free port. |
| 8 | A rejected query withdrew the curriculum results but left the previous query's notes on screen | state/progression | **Found and REPAIRED here** (section 3.1.1), with a regression case and a gate assertion. Low severity. The only Search source change in this package. |

One new Search defect was found, and it was routine and bounded, so it was
repaired here rather than handed up. Nothing in findings 2–6 is a routine bounded
repair: each is either a Founder gate, a decision about a surface that does not
exist, or a dependency decision outside this package.

---

## 5. Boundaries this package held

The only Search product source change is the five-line state repair in section
3.1.1. No Search contract, Feature Registry entry, migration, CI workflow or
permission rule was changed. No dependency was
added, removed or moved; the only lockfile change is the already-accepted,
doubly-pinned `brace-expansion` transition, carried byte-identically. No
database command, curriculum publication, deployment or merge was performed. No
verifier was weakened: section 17b and the dependency policy only add
assertions, and the one gate line edited was a closing disclaimer that had become
inaccurate — it now states a narrower claim about jsdom, not a wider one.

`CURRENT_BUILD_STATUS.md` was deliberately **not** edited here. PR #55 already
rewrites that section, and a second edit would conflict with it for no gain.

---

## 6. What remains

Two Founder decisions (checklist 0.1 and 0.2), one short rendered-review pass
that only a human can perform (checklist step 6), and — if the corpus decision
is "not yet" — the recommendation in checklist section 4: merge PR #55 and this
package under existing authority, and open Search Human UAT as its own work
package once there is something to find.

Implemented and automated validation passed. Rendered Architect/Founder UAT
remains required.
