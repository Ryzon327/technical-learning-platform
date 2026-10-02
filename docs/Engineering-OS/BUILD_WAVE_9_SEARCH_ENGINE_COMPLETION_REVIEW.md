# BUILD WAVE 9 — SEARCH ENGINE IMPLEMENTATION COMPLETION REVIEW

**Reviewed at:** `7717b16` — Merge pull request #51 (fix/dependency-policy-post-merge-ci)
**Work packages:** SEARCH-CLOSURE-1 (review, runbook); SEARCH-CLOSURE-2 (completion
gate and repository verification, section 3.2); SEARCH-CLOSURE-3 (evidence
classification, re-executed gate and lint in section 3.3, dependency remedy in
finding 4.1)
**Authority:** `docs/Feature-Registry/Search-Engine/` (SEARCH-001 … SEARCH-008,
`SEARCH_ENGINE_FEATURES.md`) governed by `FEATURE_REGISTRY_SPEC.md`; DEC-046,
DEC-047, DEC-048; `MVP_IMPLEMENTATION_SEQUENCE.md` §11 and §15d
**Verdict:** SEARCH-001 through SEARCH-008 are implemented in committed source,
each with a build document and passing tests. This is an **implementation**
review. Founder Search Human UAT has not been performed and Search product
acceptance is not granted (DEC-047).

This review is independent of the nine batch build documents. Those record how
each batch was implemented; this asks whether the engine, as a subsystem, has
reached the point where it can enter Founder Search Human UAT, and what that UAT
needs in order to produce meaningful findings.

---

## 1. The governing rule

`FEATURE_REGISTRY_SPEC.md` §9.11 makes a Feature complete when its approved
acceptance criteria pass together with tests, security, accessibility,
documentation and recorded Founder approval. Two of those — rendered
accessibility and Founder approval — cannot be established by automation, and
this review does not claim them.

DEC-047 and `MVP_IMPLEMENTATION_SEQUENCE.md` §15d fix the order:

```
SEARCH-001 → SEARCH-008 implementation          ← this review
        ↓
automated Search Engine completion gate         ← see section 4
        ↓
Founder / Human browser UAT                     ← SEARCH_UAT_RUNBOOK.md
        ↓
blocking findings resolved
        ↓
Search Engine final product acceptance
```

---

## 2. Feature state from repository evidence

Every specification records `[x] Approved` and carries Lifecycle Status
`Specified`. Per the convention recorded at the Wave 9 progress checkpoint, this
repository records implementation state in `CURRENT_BUILD_STATUS.md` rather than
by advancing Feature Registry lifecycle state, so the Registry was not edited.

| Feature | Build document | Implementation commit | Primary modules |
|---|---|---|---|
| SEARCH-001 Search Document and Index Model | Batch 1 | `99e6fca` | `shared-types/search-document.ts`, `api/search-document.ts` |
| SEARCH-002 Curriculum Search | Batch 2 | `0033374` | `shared-types/curriculum-search.ts`, `api/curriculum-search.ts`, `web/search/curriculum-search-service.ts`, `CurriculumSearchView.tsx` |
| SEARCH-003 Permission-Aware Search | Batch 3 | `3111772` | `shared-types/search-permission.ts` |
| SEARCH-004 Search Filters and Facets | Batch 4 | `0628ad4` | `shared-types/curriculum-search-filters.ts` |
| SEARCH-005A Technical Query Normalization | Batch 5 | `0d2b8de` | `shared-types/search-terms.ts` |
| SEARCH-005B Bounded Typo Recovery | Batch 6 | `6671b55` | `shared-types/search-typo.ts` |
| SEARCH-006 Personal Notes Search Integration | Batch 7 | `894f864` | `api/note-retrieval.ts`, `shared-types/note-retrieval.ts`, `web/search/note-search-service.ts` |
| SEARCH-007 Indexing and Freshness Pipeline | Batch 8 | `c870e9d` | `shared-types/search-freshness.ts`, `api/search-freshness.ts` |
| SEARCH-008 Search Result Ranking and Fallback | Batch 9 | `ec7d40a` | `shared-types/search-ranking.ts`, `shared-types/search-fallback.ts`, `web/search/curriculum-navigation-service.ts` |

The engine completion gate `scripts/verify-search-engine-completion.sh` was added
in `8e884a9` (which also removed a NUL byte from `curriculum-search.ts` that had
made text scans over it pass vacuously) and adjusted for locale-independent
sorting in `a6621e0`. Neither change altered Search behaviour.

### Routes

| Route | Purpose | Guard |
|---|---|---|
| `GET /search/curriculum` | learner curriculum search | caller's own RLS-scoped client |
| `GET /notes/search` | the caller's private notes | caller's own RLS-scoped client |
| `/admin/search/freshness` | Founder freshness reconciliation | `founder(request)` |
| `GET /curriculum/paths` | structured navigation (existing Curriculum route, reused) | caller's own RLS-scoped client |

No browser surface calls `/admin/search/freshness`; it is reachable through the
API only.

---

## 3. Executed automated evidence — this review

Executed on 2026-10-01 at `7717b16`, with a clean working tree before any
documentation change, by the first SEARCH-CLOSURE-1 verification run. The
results below were recorded by the Builder that executed that run; its raw
command output is not preserved in the repository, so they are **reported**, not
re-inspectable. Later SEARCH-CLOSURE-1 runs reuse this evidence; only the web
suite was re-executed, in section 3.1. The same totals were later observed
directly in the SEARCH-CLOSURE-3 gate run (section 3.3).

**Evidence classes used from here on.** *Observed* — command output seen by the
package that records it. *Reported* — recorded by an earlier Builder whose raw
output was not preserved. *Inferred* — concluded from script structure or
control flow, not from output. *Refused* — blocked by the permission system
before execution; no output and no exit status.

| Check | Command | Result |
|---|---|---|
| shared-types tests | `npx vitest run --root packages/shared-types` | 59 files, **1,388 passed** |
| API tests | `npx vitest run --root services/api --silent` | 73 files, **1,779 passed** |
| web tests | `npx vitest run --root apps/web` | 22 files, **986 passed** |
| typecheck — web | `npx tsc --noEmit -p apps/web` | **pass** (no output) |
| typecheck — API | `npx tsc --noEmit -p services/api` | **pass** (no output) |
| typecheck — shared-types | `npx tsc --noEmit -p packages/shared-types` | **pass** (no output) |

Search-specific test files within those totals:

| Workspace | File | Tests |
|---|---|---|
| shared-types | `search-document` · `curriculum-search` · `curriculum-search-filters` · `search-terms` · `search-typo` · `search-permission` · `search-freshness` · `search-ranking` · `search-fallback` · `note-retrieval` | 57 · 39 · 68 · 60 · 52 · 28 · 36 · 34 · 33 · 2 |
| API | `curriculum-search` · `search-document` · `search-freshness` · `note-retrieval` | 110 · 33 · 27 · 32 |
| web | `curriculum-search-service` · `note-search-service` · `curriculum-navigation-service` | 37 · 14 · 16 |

### 3.1 Test timeouts in later quick-gate runs — **NOT REPRODUCED; CAUSE NOT ESTABLISHED**

Two later automated quick-gate runs at this HEAD recorded `npm test` failing
on per-test 5,000 ms timeouts, each in a different place:

- an earlier run: three API tests (`curriculum-search` F3, `lab-admin` F1,
  `search-freshness` S) timed out; the next run passed all 1,779 API tests;
- the latest run: API 1,779 passed, and `@tlp/web` exited 1 on two timeouts —
  `packet-journey-presentation.test.ts` ("keeps the detailed narration out of the
  live region entirely") and `topology-layout.test.ts` ("keeps the wires routable
  and clear of every card").

Focused validation on 2026-10-01 at `7717b16`, **reported** by the
SEARCH-CLOSURE-1 Builder:

| Check | Command | Result |
|---|---|---|
| the two timed-out files | `npx vitest run --root apps/web src/learning/packet-journey-presentation.test.ts src/learning/topology-layout.test.ts` | 2 files, **460 passed**; files took 121 ms and 195 ms |
| full web suite | `npx vitest run --root apps/web` | 22 files, **986 passed**; 1.26 s |

No failure reproduced. Each affected file completes in well under the 5,000 ms
per-test limit, the timeouts moved between unrelated tests and workspaces from
run to run, and no assertion failed in any run. Transient timing under host load
is consistent with those observations but **has not been demonstrated**; the
cause remains unresolved. The historical failures stand as recorded, and the
passing runs in this section and in sections 3.2 and 3.3 do not erase them. No test,
timeout or verifier was changed. The first-run totals in section 3 stand.

### 3.2 Completion gate and repository verification — SEARCH-CLOSURE-2

Executed on 2026-10-02 at `7717b16`. The only working-tree changes were these
three documents and an untracked `status.sh` outside product scope.

**Evidence class.** The preserved record of this run is the SEARCH-CLOSURE-2
Builder's own completion report and the execution harness's permission-denial
record. No raw command output was preserved. Every exit status and result in
the table below is therefore **reported** by that Builder, except the
`npm ls brace-expansion` row, whose refusal also appears in the harness's
permission-denial record. SEARCH-CLOSURE-3 re-executed the gate and lint and
observed them directly (section 3.3); the remaining rows are reused unchanged
because their inputs have not changed.

| Check | Command | Exit | Result |
|---|---|---|---|
| verifier namespace | `npm run gate -- list` | 0 | lists `search-engine-completion` and `wave9` |
| **Search Engine completion gate** | `npm run gate -- search-engine-completion` | **1** | **FAILED** at its final step, the security scan; see finding 4.1 |
| curriculum-search I11 | `npx vitest run --root services/api src/curriculum-search.test.ts -t "I11"` | 0 | 1 passed, 109 skipped |
| mission instruction focus (whole file, including its per-test cleanup) | `npx vitest run --root apps/web src/learning/mission-instruction-focus.test.tsx` | 0 | 4 passed |
| certificate-correction H | `npx vitest run --root services/api src/certificate-correction.test.ts -t "H: downstream readers reflect a revocation" --silent` | 0 | 2 passed, 40 skipped |
| full suite | `npm test --silent` | 0 | web 22 files **986**; shared-types 59 files **1,388**; API 73 files **1,779**; no timeout |
| typecheck | `npm run typecheck` | 0 | all three workspaces pass |
| lint | `npm run lint` | **2** | ESLint 9.39.5 found no `eslint.config.(js\|mjs\|cjs)`; finding 4.2 |
| dependency path | `npm ls brace-expansion` | — | **refused by the permission system before execution**; no output, no exit status; not retried in SEARCH-CLOSURE-2 or SEARCH-CLOSURE-3 |

The Builder reported running the focused checks unchanged, as named, and
separately from the full suite, and reported that they reproduced the
previously supplied test 0, typecheck 0 and lint 2.

Inside the completion gate, as reported by the SEARCH-CLOSURE-2 Builder, in
order:

1. Gate sections 1–17: all **PASS**, including section 3 ("no Human UAT or
   product acceptance is claimed anywhere").
2. The delegated `scripts/verify-wave9.sh` structural checks: every check
   printed in the Builder's display was **PASS**, but part of that output was
   truncated. That no Wave 9 structural check failed was **inferred**, not seen:
   `verify-wave9.sh` exits on its first `FAIL` and reached its toolchain step.
3. Repository toolchain (`scripts/ci-toolchain.sh typecheck test build security`):
   - typecheck and test: passed. The tail shows API 73 files, 1,779 passed, and
     the script runs under `set -e`;
   - `npm run build`: **passed**. `@tlp/web` `tsc -b && vite build` built 181
     modules, and `@tlp/api` `tsc -p tsconfig.build.json` completed;
   - `scripts/security-scan.sh`: "no committed runtime .env files" and "no
     obvious hardcoded credential patterns detected" both **PASS**;
     `npm audit --audit-level=high` **failed**, and the gate exited 1.

`npm run build` and `npm run security:scan` were not run again on their own,
because their inputs had not changed since the gate executed them.

The Builder reported running the gate a second time after editing these
documents, because the gate's section 3 scans them, with section 3 again
passing and the gate again exiting **1** on the same `npm audit` finding.

### 3.3 Re-executed gate and lint — SEARCH-CLOSURE-3

SEARCH-CLOSURE-2 left no inspectable output for its two non-zero results, so
SEARCH-CLOSURE-3 re-executed exactly those two commands at `7717b16`, after the
corrections to these three documents. No other check was re-run. Results below
are **observed** by SEARCH-CLOSURE-3.

| Check | Command | Exit | Result |
|---|---|---|---|
| **Search Engine completion gate** | `npm run gate -- search-engine-completion` | **1** | **FAILED** at its final step, `npm audit --audit-level=high`; see below |
| lint | `npm run lint` | **2** | ESLint 9.39.5: "couldn't find an eslint.config.(js\|mjs\|cjs) file" |

Inside the gate, in order, all seen in untruncated output:

1. Gate sections 1–17: all **PASS**, including section 3 ("no Human UAT or
   product acceptance is claimed anywhere") against these corrected documents.
2. The delegated `scripts/verify-wave9.sh` checks: 72 lines, every one **PASS**.
   This replaces the inference recorded in section 3.2 with an observation.
3. Typecheck: all three workspaces completed with no error output.
4. Tests: web 22 files **986 passed**; shared-types 59 files **1,388 passed**;
   API 73 files **1,779 passed**. No timeout; the slowest file,
   `curriculum-search.test.ts`, took 2,952 ms in total.
5. `npm run build`: `@tlp/web` built 181 modules; `@tlp/api`
   `tsc -p tsconfig.build.json` completed.
6. `scripts/security-scan.sh`: "no committed runtime .env files" and "no
   obvious hardcoded credential patterns detected" **PASS**; `npm audit` reported
   `brace-expansion <=1.1.20` **high** at `node_modules/brace-expansion`, "fix
   available via `npm audit fix`", and `@vitest/mocker`/`vitest` **moderate**,
   "fix available via `npm audit fix --force`" (vitest 5.0.3, breaking);
   "3 vulnerabilities (2 moderate, 1 high)". The gate exited **1**.

These observations agree with every SEARCH-CLOSURE-2 report they cover.

---

## 4. Findings

### 4.1 The completion gate fails on a dependency advisory — **OPEN, BLOCKING THE GATE, NOT A SEARCH DEFECT**

`npm run gate -- search-engine-completion` exited **1** on 2026-10-02: reported
in SEARCH-CLOSURE-2 (section 3.2) and observed in SEARCH-CLOSURE-3 (section 3.3).
Every Search-specific check passed, and so did typecheck, test and build. The
failure is the gate's final repository step, `npm audit --audit-level=high` in
`scripts/security-scan.sh`, which reported:

- `brace-expansion` `<=1.1.20` — **high** (GHSA-q2hr-2g5m-vwhr,
  GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p); npm reports "fix available via
  `npm audit fix`";
- `@vitest/mocker` 2.1.0–4.1.10 and `vitest` 2.1.0-beta.1–4.1.10 — moderate
  (GHSA-82fw-gwwq-j7x9); the reported fix is a breaking upgrade to vitest 5.0.3.

npm summarised this as "3 vulnerabilities (2 moderate, 1 high)". The advisory
sits in the dependency tree, not in Search source.

**Dependency chain — from the committed lockfile.** `npm ls brace-expansion` was
refused in SEARCH-CLOSURE-2 and was not retried or substituted. SEARCH-CLOSURE-3
instead read the committed `package-lock.json` and workspace manifests, as its
scope directs. Observed there:

```
@tlp/web (apps/web/package.json devDependencies)
  └─ eslint ^9.17.0                         locked 9.39.5
       ├─ minimatch ^3.1.5                  ┐
       ├─ @eslint/config-array → minimatch  ├─ one record: minimatch 3.1.5
       └─ @eslint/eslintrc     → minimatch  ┘
             └─ brace-expansion ^1.1.7      locked 1.1.18, "dev": true
```

- The lockfile has exactly one `brace-expansion` record (`node_modules/brace-expansion`,
  1.1.18) and one `minimatch` record (3.1.5). No manifest declares either, and
  no workspace declares `overrides`.
- Every record on the chain is marked `"dev": true`; ESLint is a dev-only lint tool for
  `apps/web`. Reaching production is therefore **inferred not to occur**.
- This describes the committed lockfile, not the installed `node_modules` tree,
  which only the refused command would have shown.

**Minimal remedy — recommended, not executed.** Re-resolve the single lockfile
record `node_modules/brace-expansion` from 1.1.18 to the lowest patched 1.x
release. A 1.x release above 1.1.20 satisfies `^1.1.7`, so no range moves and
no manifest changes. That such a release exists is **inferred** from npm
reporting the fix as available via plain `npm audit fix`, which does not make
out-of-range changes; the exact target version is not observable from the
repository and must be confirmed when the package is prepared. Scope: one
lockfile record (version, `resolved`, `integrity`), no manifest, no other
record. The moderate `vitest`/`@vitest/mocker` findings are excluded: they do
not fail `--audit-level=high`, and their only reported fix is a breaking
upgrade to vitest 5, a separate decision.

**Is the remedy consequential under accepted authority? Yes — specifically, not
categorically.** Investigating the chain is not gated, and this package did it.
Applying the remedy is gated for a recorded reason: the accepted dependency
policy (`scripts/lib/authorized-dependency-policy.mjs`, enforced by
`scripts/verify-dependency-policy.sh`) refuses every lockfile change that no
recorded one-time authorization covers. The directly analogous precedent,
`47bfdcd` (js-yaml 4.3.1 → 4.3.2, also reached through
`@tlp/web → eslint → @eslint/eslintrc`, also lockfile-only and dev-only), was
treated in that policy as "a second Founder decision" and given its own pinned
authorization, which its source documents as one-time and no longer applying
once merged. The brace-expansion transition is therefore expected to need its
own specific Founder decision and its own exact policy authorization, prepared
in a separate bounded package. That is the decision this finding asks for; no
blanket dependency approval is sought.

This package did not run `npm audit fix`, `npm update` or `npm install`, and
changed no dependency or policy. The gate, the scan and its audit level were not
edited, weakened or bypassed.

In SEARCH-CLOSURE-1 the verification environment refused the gate, build and
security scan before they executed, so that package had no exit status for any
of them. Those were permission refusals, not command failures. The results in
sections 3.2 and 3.3 supersede them.

**CI will not run the gate for this change.** `scripts/ci-select-gates.sh`
selects `verify-search-engine-completion.sh` only for Search source and verifier
paths, and a documentation-only change selects no engine gate.

**Required before Founder Search UAT:** the specific Founder decision on the
remedy above, a bounded dependency package that applies it, and an observed
passing `npm run gate -- search-engine-completion`.

### 4.2 Lint does not pass — **OPEN, PRE-EXISTING, NOT A SEARCH DEFECT**

`npm run lint` exited **2** on 2026-10-02: reported in SEARCH-CLOSURE-2
(section 3.2) and observed in SEARCH-CLOSURE-3 (section 3.3). `@tlp/web` runs
`eslint . --max-warnings=0` under ESLint 9.39.5, and no
`eslint.config.(js|mjs|cjs)` exists.

This pre-dates Wave 9 and was recorded at the Wave 9 progress checkpoint.
`typescript-eslint` is absent from the lockfile (observed). That a working
configuration for the TypeScript sources needs it, or another new dev
dependency, is **inferred** and was not investigated here. Adding a dependency
changes a protected manifest, which the accepted dependency policy refuses
without its own recorded authorization, so that step would need a specific
Founder decision once a remedy is proposed. It is left for a separate bounded
engineering package and is **not** resolved here.

### 4.3 No live PostgreSQL / RLS proof — **OPEN, CARRIED FORWARD**

There is no live database harness. Every Search authorization and isolation
claim — curriculum publication filtering, SEARCH-003 surfacing, private-note
ownership, freshness reconciliation scope — is **query-level and structural**.
Service tests mock the client factory and model what row level security would
return; they do not execute a PostgreSQL policy.

Founder UAT can observe some of this behaviour in a real environment (section 3
of the runbook), which would be disposition **B** under
`MVP_IMPLEMENTATION_SEQUENCE.md` §15d. It is not dispositioned here.

### 4.4 No rendered or browser accessibility proof — **OPEN, CARRIED FORWARD**

`apps/web` has one jsdom test, `mission-instruction-focus.test.tsx`; `jsdom` is a
Founder-authorized dev-only dependency. That test does not cover Search.
`scripts/verify-wave7.sh` still prohibits `@testing-library/react` and
`jest-axe`. No Search surface is exercised in a DOM. Ordered/unordered list semantics, headings, labels, the
separately grouped note results, and the fallback and navigation states are all
**source-structural** claims. Focus order, keyboard behaviour, screen-reader
output, zoom/reflow and contrast are unobserved and belong to rendered review.

### 4.5 Search result destinations are not routed by the SPA — **OPEN, RECORDED SINCE BATCH 2**

Result links are plain anchors to `/learning-paths/{id}`, `/courses/{id}`,
`/missions/{id}` and `/competencies/{id}`
(`packages/shared-types/src/curriculum-search.ts`, `buildCurriculumSourceReference`).
The SPA has no router library: Search is a workspace view selected by a button in
`apps/web/src/auth/AuthenticatedApp.tsx`, and no handler for those paths was found
in source. **Inferred, not observed:** following a result link is not expected to
open the linked item. Batch 2 and Batch 9 both record the condition. The UAT
runbook lists it as a known risk area rather than as a step expected to succeed.

### 4.6 The searchable corpus depends on publication, not authorship — **UAT PREREQUISITE**

Search reads `learning_paths`, `courses`, `missions` and `competencies` with
`publication_state = 'published'`, through the caller's own client. It does not
read repository content files.

- `content/curriculum/networking-foundations.json` (Networking Foundations,
  Missions 1–8) is **authored** repository content. The Mission 1–8 UATs used the
  bundled development harness (`apps/web/src/uat/`), which needs no database, and
  the Mission 8 runbook records that no curriculum was published.
- No `supabase/seed*.sql` exists and no migration inserts curriculum rows.
- Rows reach the database only through two Founder-operated commands, both of
  which default to a dry run, write only when `TLP_UAT_BOOTSTRAP_CONFIRM` equals
  `SUPABASE_URL`, and refuse production:
  `npm run admin:publish-roas-curriculum` (Router-on-a-Stick) and
  `npm run admin:publish-curriculum -- <file> [--publish]` (JSON imports; without
  `--publish` it writes drafts, which Search cannot return).
- Whether either has been executed against the UAT project is **not observable
  from the repository**.

Running either command is a database write and a Founder gate. This package did
not run one.

### 4.7 Documentation lag outside this package — **FLAGGED, NOT EDITED**

- `MVP_IMPLEMENTATION_SEQUENCE.md` §15d "Search Engine UAT" still says Search UAT
  "cannot occur yet — Search is incomplete", and §15e still says no
  repository-seeded curriculum exists. The roadmap is a separate authority; this
  package did not edit it.
- `content/README.md` states that `content/curriculum/` "does not exist yet",
  which is no longer true, and that the curriculum authoring privileges migration
  is "not applied". The migration's actual state is not observable here.

---

## 5. Boundaries held by this package

No product source, test, verifier, dependency, dependency policy, migration, CI
workflow or Feature Registry entry was changed by the SEARCH-CLOSURE packages. No
database command, curriculum publication, dependency fix, deployment or commit
was performed. The refused `npm ls brace-expansion` was not retried and was not
replaced by another command that inspects the installed tree. The Search Engine
completion gate and `scripts/verify-wave9.sh` are unchanged.

---

## 6. What this review does not establish

- a passing completion gate; the observed gate exited 1 (finding 4.1)
- the installed dependency tree; the chain in finding 4.1 is read from the
  committed lockfile, and the exact patched `brace-expansion` version is not
  established
- inspectable raw output for SEARCH-CLOSURE-1 and SEARCH-CLOSURE-2 results;
  those are reported, and only the gate and lint were re-observed (section 3.3)
- the cause of the historical test timeouts, or that they cannot recur
  (section 3.1)
- passing lint (finding 4.2)
- live row level security enforcement (finding 4.3)
- rendered usability, rendered accessibility or visual quality (finding 4.4)
- that a searchable corpus exists in any environment (finding 4.6)
- ranking usefulness to a learner, which only Founder UAT can judge
- Founder acceptance or Human UAT of any kind — Search Human UAT remains
  **pending**, and final Search product acceptance is **not granted** (DEC-047)

**Status: IMPLEMENTED — AUTOMATED VALIDATION INCOMPLETE (completion gate exit 1
on the npm audit dependency advisory, remedy awaiting its specific Founder
decision; lint exit 2) — Rendered Architect review
and Founder Search Human UAT pending — PENDING INDEPENDENT ARCHITECTURE REVIEW.**
