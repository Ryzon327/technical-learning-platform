# BUILD WAVE 9 — SEARCH ENGINE IMPLEMENTATION COMPLETION REVIEW

**Reviewed at:** `7717b16` — Merge pull request #51 (fix/dependency-policy-post-merge-ci);
security closure recorded at `c2c684b` — fix(security): apply authorized
brace-expansion transition (section 3.5)
**Work packages:** SEARCH-CLOSURE-1 (review, runbook); SEARCH-CLOSURE-2 (completion
gate and repository verification, section 3.2); SEARCH-CLOSURE-3 (evidence
classification, re-executed gate and lint in section 3.3, dependency remedy in
finding 4.1); SEARCH-SECURITY-PREP-1 and SEARCH-SECURITY-PREP-2 (exact
remediation proposal, section 4.1.1); SEARCH-RELEASE-CLOSURE-1 (combined-state
verification, section 3.4; lint boundary, finding 4.2);
SEARCH-CLOSURE-REMEDY-PREP-1 (registry metadata and both digests, section
4.1.1; lint proposal, section 4.2.1; authority analysis, section 4.2.2);
SEARCH-CLOSURE-AUTHORITY-RECONCILE-1 (authority reconciled with directive
`tlp-delivery-first-2026-10-02`, section 4.2.2); SEARCH-SECURITY-APPLY-1 (the
pinned `brace-expansion` transition applied, `c2c684b`); SEARCH-SECURITY-CLOSURE-1
(security closure evidence, section 3.5)
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
before execution; no output and no exit status. *Supplied* (from section 3.5)
— gate results the orchestrator supplied to the independent architecture
review; their raw output is not preserved in the repository.

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

### 3.4 Combined-state verification — SEARCH-RELEASE-CLOSURE-1

Executed on 2026-10-02 at `de7cfc8` with the uncommitted edits to these three
documents applied, and nothing else changed. Every result below is
**observed** by SEARCH-RELEASE-CLOSURE-1 in untruncated output.

| Check | Command | Exit | Result |
|---|---|---|---|
| **Search Engine completion gate** | `npm run gate -- search-engine-completion` | **1** | **FAILED** at its final step, `npm audit --audit-level=high`, only |
| Dependency policy | `npm run gate -- dependency-policy` | 0 | 32 pure cases and the live cases (TEST 1–17b) **PASS**; "DEPENDENCY POLICY VERIFIED" |
| Security scan | `npm run security:scan` | **1** | `.env` and credential checks **PASS**; `npm audit` same findings as the gate |
| npm audit | `npm audit --audit-level=high` | **1** | `brace-expansion <=1.1.20` **high** (GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p), "fix available via `npm audit fix`"; `@vitest/mocker`/`vitest` **moderate**; "3 vulnerabilities (2 moderate, 1 high)" |
| lint | `npm run lint` | **2** | ESLint 9.39.5: "couldn't find an eslint.config.(js\|mjs\|cjs) file" |
| Gate selection | `npm run gate -- select` over the three changed document paths | 0 | no gate selected |
| Lockfile digest | `shasum -a 256 package-lock.json` | 0 | `5718e120…f58f`, unchanged |

Inside the completion gate, in order: sections 1–17 all **PASS** (including
section 3, against these edited documents); the delegated
`scripts/verify-wave9.sh` checks, 72 lines, all **PASS**; typecheck of all three
workspaces with no error output; tests web 22 files **986 passed**, shared-types
59 files **1,388 passed**, API 73 files **1,779 passed**, no timeout (slowest
file `curriculum-search.test.ts`, 2,592 ms); `npm run build`, `@tlp/web` 181
modules and `@tlp/api` `tsc -p tsconfig.build.json` completed; then the security
scan above. Build, typecheck and tests therefore ran inside the gate and were not
re-run separately. `git status` after the run showed only the three documents.

**The blocker at that point was unchanged:** the only failing step of the completion
gate was the `brace-expansion` high advisory, whose proposed remedy is in
section 4.1.1. The registry read that section still needs was **not**
re-attempted: it had already been refused twice (PREP-1, PREP-2), which is the
directive's two-attempt limit, and it was not substituted by another route.
That blocker has since been remedied (section 3.5); this section is retained
as the historical record.

### 3.5 Security closure — SEARCH-SECURITY-APPLY-1 and SEARCH-SECURITY-CLOSURE-1

**The applied transition.** SEARCH-SECURITY-APPLY-1 applied exactly the pinned
transition in section 4.1.1, under directive `tlp-delivery-first-2026-10-02`.
It passed independent architecture review and was committed as `c2c684b`
(`fix(security): apply authorized brace-expansion transition`), parent
`fb9dc88`. That commit changes exactly three files:

- `package-lock.json` — one record, `node_modules/brace-expansion`, 1.1.18 →
  **1.1.21**; `version`, `resolved` and `integrity` take the section 4.1.1
  values. No manifest changed.
- `scripts/lib/authorized-dependency-policy.mjs` — a separate one-time
  `brace-expansion` authorization citing the directive and the three
  advisories, pinned **from** `5718e120…f58f` **to** `ae794bd9…bdd5`. The jsdom
  and js-yaml authorizations are unchanged.
- `scripts/verify-dependency-policy.sh` — the pre-patch lockfile is now derived
  from the working one and must hash to `5718e120…f58f`; existing assertions
  are unchanged; new pure cases BRACE0–BRACE15 and live cases TEST 18a–21b.

**Supplied to the architecture review of SEARCH-SECURITY-APPLY-1.** The
orchestrator's full gate run at the patched tree supplied passing tests,
typecheck and build. The review records that; it did not repeat the gates in
its read-only environment, and its independent `git diff --check` passed. No raw
output is preserved in the repository.

**Reported by the SEARCH-SECURITY-APPLY-1 Builder** (raw output not preserved):
`npm run gate -- dependency-policy` passed (reported as 48 pure and 26 live
cases);
`npm audit --audit-level=high` exit 0, the two moderate
`vitest`/`@vitest/mocker` findings remaining; `npm run gate --
search-engine-completion` exit **0**, with tests web 986, shared-types 1,388,
API 1,779; `npm run gate -- select` over the three changed paths selected
`dependency-policy` and `wpj-m2`, both passing; `git diff --check` clean. It did
not reinstall dependencies, so the installed `node_modules` copy of
`brace-expansion` was not changed by that package.

**Observed by SEARCH-SECURITY-CLOSURE-1** on 2026-10-02 at `c2c684b`, in
untruncated output. The only working-tree changes were these three documents.

| Check | Command | Exit | Result |
|---|---|---|---|
| Lockfile digest | `sha256sum package-lock.json` | 0 | `ae794bd905a31b2b969bcc27c48bea06909442496f2508428b6fc5939e62bdd5` — the pinned **to** digest |
| Dependency policy | `npm run gate -- dependency-policy` | 0 | 48 pure cases (including BRACE0–BRACE15) and the live cases (TEST 1–21b) **PASS**; "DEPENDENCY POLICY VERIFIED" |
| npm audit | `npm audit --audit-level=high` | **0** | no high finding; `@vitest/mocker`/`vitest` **moderate** (GHSA-82fw-gwwq-j7x9) remain, "2 moderate severity vulnerabilities" |
| **Search Engine completion gate** | `npm run gate -- search-engine-completion` | **0** | **PASSED**; "SEARCH ENGINE IMPLEMENTATION COMPLETION VERIFIED"; see below |
| lint | `npm run lint` | **2** | ESLint 9.39.5: "couldn't find an eslint.config.(js\|mjs\|cjs) file" — unchanged, finding 4.2 |
| Gate selection | `npm run gate -- select` over the three changed document paths | 0 | no gate selected |
| Whitespace | `git diff --check` | 0 | no output |

Inside the completion gate, in order: sections 1–17 all **PASS** (including
section 3, against these edited documents); the delegated
`scripts/verify-wave9.sh` checks, 72 lines, all **PASS**; typecheck of all three
workspaces with no error output; tests web 22 files **986 passed**, shared-types
59 files **1,388 passed**, API 73 files **1,779 passed**, no timeout (slowest
file `curriculum-search.test.ts`, 3,107 ms); `npm run build`, `@tlp/web` 181
modules and `@tlp/api` `tsc -p tsconfig.build.json` completed;
`scripts/security-scan.sh` — `.env` and credential checks **PASS**, and "npm
audit has no high/critical findings" **PASS**. The gate's own closing text
states that it proves implementation completion only, not rendered usability,
rendered accessibility, live row level security, Founder acceptance or Human UAT.

**CI — not observed.** `gh run list --commit c2c684b…` returned no run for the
pushed commit, so no required `verify` run has been observed for the security
patch. CI success is **not** claimed here, and remains to be observed.

The historical results in sections 3.1–3.4 stand as recorded, including every
gate exit 1; this section does not erase them.

---

## 4. Findings

### 4.1 The completion gate failed on a dependency advisory — **REMEDIED AT `c2c684b`; NOT A SEARCH DEFECT**

**Current state (SEARCH-SECURITY-CLOSURE-1, section 3.5).** The pinned remedy
below was applied in SEARCH-SECURITY-APPLY-1 and committed as `c2c684b`. At
that commit `npm audit --audit-level=high` exits 0 and the completion gate
result is recorded in section 3.5 (observed). CI for that commit has not been
observed. The rest of this finding is the historical record of the failure and
its remedy, retained unchanged.

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

**Minimal remedy — proposed, not executed.** Re-resolve the single lockfile
record `node_modules/brace-expansion` from 1.1.18 to **1.1.21**, with no manifest
change. The exact proposal, prepared in SEARCH-SECURITY-PREP-1, is in
section 4.1.1. The moderate `vitest`/`@vitest/mocker` findings are excluded: they
do not fail `--audit-level=high`, and their only reported fix is a breaking
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
passing `npm run gate -- search-engine-completion`. The decision was supplied by
directive `tlp-delivery-first-2026-10-02` (section 4.2.2), the applying package
is `c2c684b`, and the gate observation is in section 3.5.

### 4.1.1 Exact remediation proposal — SEARCH-SECURITY-PREP-1

Prepared at `de7cfc8` on 2026-10-02 (SEARCH-SECURITY-PREP-1) and re-attempted
there the same day (SEARCH-SECURITY-PREP-2). Nothing was applied:
`package-lock.json`, every manifest and the dependency policy are unchanged.
The committed lockfile still hashes to `5718e120…f58f` (observed in
SEARCH-SECURITY-PREP-2).

**Advisories — observed** through `gh api -X GET /advisories/<id>` (GitHub
Advisory Database), npm ecosystem, 1.x line:

| Advisory | CVE | GitHub severity | 1.x vulnerable | 1.x first patched |
|---|---|---|---|---|
| GHSA-6j4f-fj2g-mc7p | CVE-2026-102276 | high | `< 1.1.19` | 1.1.19 |
| GHSA-qhr7-859c-m2p7 | CVE-2026-102278 | high | `< 1.1.20` | 1.1.20 |
| GHSA-q2hr-2g5m-vwhr | CVE-2026-102277 | medium | `< 1.1.21` | 1.1.21 |

- **1.1.21 is the lowest 1.x release outside all three recorded ranges.** It is
  the version proposed. 1.1.20 would clear both high-rated advisories but stays
  inside GHSA-q2hr-2g5m-vwhr, and npm's audit reported the three together as one
  high finding over `<=1.1.20`, so 1.1.20 is not proposed.
- 1.1.21 satisfies minimatch 3.1.5's existing range `^1.1.7`
  (`>=1.1.7 <2.0.0`). No range moves and no manifest changes.
- **Upstream — observed** through `gh api -X GET repos/juliangruber/brace-expansion/...`:
  `v1.1.21` (commit `8e81e187b6e9c6c723d16c042657c00acefc2483`) is the newest
  1.1.x tag. Its `package.json` declares version `1.1.21`, license `MIT`,
  dependencies `balanced-match ^1.0.0` and `concat-map 0.0.1`, and no `engines`
  — the same fields the 1.1.18 lockfile record carries. The lockfile already
  holds `balanced-match` 1.0.2 and `concat-map` 0.0.1, which satisfy them, so
  **no other record is expected to move**.

**Proposed lockfile record.** Three fields change; `dev`, `license`,
`dependencies` and the record's position stay as committed.

| Field | Committed (observed) | Proposed |
|---|---|---|
| `version` | `1.1.18` | `1.1.21` |
| `resolved` | `https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.18.tgz` | `https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz` |
| `integrity` | `sha512-Edep/X9fGqVNmzKBVsDYIOtD+z1tuezV70LBjdCst9Tqu76lsnvRiZ6oTic1n+/BIwX6QDGAO94PN4N2SADvtw==` | `sha512-9zeA+KLZNNzglF2TPKRQEDyx6Yby7daAkuy8MiPzpXPsYDWi/DRM8jmwUDxokQjYqBpv5DgPiwD4h4ZZSy1Ujw==` |

**Registry metadata — history.** In PREP-1 and PREP-2 the registry read
(`npm view brace-expansion@1.1.21 …`) was refused by the permission system
before execution, twice. That exhausted the two-attempt limit; it was not
retried in any later package, and it was not replaced by a web fetch, an
interpreter making a network request, or any other route to the registry.

**Registry metadata — observed in SEARCH-CLOSURE-REMEDY-PREP-1** from npm's own
local HTTP cache (`~/.npm/_cacache`), which needs no network request and no new
command class. The cache holds the registry's install document for
`https://registry.npmjs.org/brace-expansion`, which npm fetched itself on
2026-10-02 at 23:13:36 GMT (registry `last-modified` 2026-09-14). The
document was located with a search and read in memory with `python3`. Nothing
was written and no cache entry was changed. Observed in it:

- 1.1.19, 1.1.20 and 1.1.21 are published; dist-tag `1.x` is `1.1.21`.
- 1.1.21: `dist.tarball`
  `https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.21.tgz`;
  `dist.integrity` as in the table above; `dist.shasum`
  `edf4fab5c64d051aea5a8def49aba1c7522279f3`; `dependencies`
  `balanced-match ^1.0.0` and `concat-map 0.0.1`; no `engines` and no
  `deprecated` field. This install document does not carry `license`. The
  upstream tag declares MIT (observed in PREP-1), and the record's `license`
  field stays `MIT`.
- **Cross-check:** the cached 1.1.18 `dist.integrity` is byte-identical to the
  committed lockfile's 1.1.18 `integrity`. The npm cache also holds the 1.1.18
  tarball under that same integrity.

**No metadata mismatch.** The published 1.1.21 manifest matches the upstream
tag, and its dependencies are already met by the lockfile's `balanced-match`
1.0.2 and `concat-map` 0.0.1. The committed lockfile has exactly one
`brace-expansion` record. **The remedy stays one record**, and the stop
condition for a widened remedy is not triggered.

**Both digests — computed in memory with `node`, nothing written.** The
committed lockfile re-serialises byte-exactly as
`JSON.stringify(lock, null, 2) + "\n"` (computed in PREP-2 and again here).
Applying only the three field values above:

| | SHA-256 of `package-lock.json` |
|---|---|
| **from** (committed, observed) | `5718e12047ca39436a505d42a4112e6430aa406cbe506356bfb0341157b5f58f` |
| **to** (computed) | `ae794bd905a31b2b969bcc27c48bea06909442496f2508428b6fc5939e62bdd5` |

The line count is unchanged and exactly three lines differ. If `npm` writes
anything else when the remedy is applied, the result will not hash to the
**to** digest, the pinned policy will refuse it, and the package must stop.

**Policy authorization required — following the js-yaml precedent (`47bfdcd`).**
The current committed lockfile hashes to
`5718e12047ca39436a505d42a4112e6430aa406cbe506356bfb0341157b5f58f` (observed
with `shasum -a 256`). That is the js-yaml transition's own `to` digest, so that
authorization is spent, and `checkLockfile` would refuse the brace-expansion
change. The narrowest authorization is a second, separately named one-time
transition in `scripts/lib/authorized-dependency-policy.mjs`, with the same
shape as the js-yaml one:

- advisories GHSA-6j4f-fj2g-mc7p, GHSA-qhr7-859c-m2p7, GHSA-q2hr-2g5m-vwhr;
  package `brace-expansion`; record `node_modules/brace-expansion`;
  `1.1.18` → `1.1.21`;
- **from** digest `5718e12047ca39436a505d42a4112e6430aa406cbe506356bfb0341157b5f58f`;
- **to** digest `ae794bd905a31b2b969bcc27c48bea06909442496f2508428b6fc5939e62bdd5`;
- consulted by `checkLockfile` before the spent refusal, returning `null` unless
  the base hashes to exactly the `from` digest — so it stops applying the moment
  it merges;
- no manifest authorization, no parameter, list or wildcard, and no change to
  the jsdom or js-yaml authorizations.

**Regression checks required in `scripts/verify-dependency-policy.sh`.**

1. *Existing fixtures, re-based without weakening.* The gate reads the working
   `package-lock.json` as the jsdom- and js-yaml-approved lockfile (pure
   `APPROVED_LOCK`, live `APPROVED_LOCKFILE`), and the cases that depend on its
   digest — at least K2, SEC0–SEC12, the jsdom live cases built from it, and
   live tests 14–17 — assume it still hashes to `5718e120…f58f`. After the patch
   it does not, so the gate must first derive the pre-patch lockfile
   — the brace-expansion record put back to the committed 1.1.18 values in the
   table above — and assert it hashes to `5718e120…f58f`, the same derivation
   technique SEC0 already uses for js-yaml. Every existing assertion stays as it
   is.
2. *New pure cases, mirroring SEC0–SEC12:* the derived base reproduces the
   `from` digest; the exact 1.1.18 → 1.1.21 transition is accepted; 1.1.20, any
   later 1.x and any 2.x are refused; the patch plus an unrelated record added,
   removed or changed (including a `vitest` change) is refused; removing the
   record is refused; the patch plus a manifest change is refused; once 1.1.21
   is in the base the transition returns `null` and a later lockfile change is
   refused; the js-yaml transition still returns `null`; both pins are
   well-formed and distinct.
3. *New live cases, mirroring tests 14–17:* exact patch uncommitted and
   committed pass; another version is refused; an unchanged post-merge tree
   passes; a later lockfile change after merge is refused.

**Expected diff of the applying package:** `package-lock.json` — three changed
lines in one record; `scripts/lib/authorized-dependency-policy.mjs`;
`scripts/verify-dependency-policy.sh`. Nothing else.

**Routine checks the applying package runs itself:** `npm run gate --
dependency-policy`; `npm audit --audit-level=high` (expected: no high finding;
the two moderate `vitest`/`@vitest/mocker` findings remain and do not fail it);
`npm run gate -- search-engine-completion` (expected exit 0); `npm test`;
`npm run typecheck`; `npm run build`; and `npm run gate -- select` over the
changed paths, running whatever it selects. None of these needs a Founder
decision.

**Founder decision — now supplied by directive `tlp-delivery-first-2026-10-02`
for this exact scope (section 4.2.2).** The scope as originally requested:
exactly one transition, the committed
lockfile `5718e120…f58f` → lockfile `ae794bd9…bdd5`, which is the same lockfile
with only `node_modules/brace-expansion` moved from 1.1.18 to 1.1.21 (the
`resolved` and `integrity` values above), plus the matching one-time pinned transition and its
regression cases in the two dependency-policy files above. This authorization
would not cover: any manifest change, any other record, `npm audit fix`
applied wholesale, the `vitest` 5 upgrade, or any other version of
brace-expansion. The registry metadata now confirms one record (above). If
applying it still produces any lockfile other than `ae794bd9…bdd5`, the
authorization does not apply and a revised scope comes back first. The applying
package remains separate and bounded, and records the directive as its
authorizing decision in the policy file.

**Applied — SEARCH-SECURITY-APPLY-1, `c2c684b`.** The committed lockfile now
hashes to `ae794bd9…bdd5` (observed, section 3.5), so the applied result is
exactly the computed **to** digest and the authorization's scope held.

### 4.2 Lint does not pass — **OPEN, PRE-EXISTING, NOT A SEARCH DEFECT**

`npm run lint` exited **2** on 2026-10-02: reported in SEARCH-CLOSURE-2
(section 3.2) and observed in SEARCH-CLOSURE-3 (section 3.3). `@tlp/web` runs
`eslint . --max-warnings=0` under ESLint 9.39.5, and no
`eslint.config.(js|mjs|cjs)` exists.

This pre-dates Wave 9 and was recorded at the Wave 9 progress checkpoint.

**Investigated in SEARCH-RELEASE-CLOSURE-1 — observed:**

- No ESLint configuration of any form (`eslint.config.*`, `.eslintrc*`) has
  ever been committed: `git log --all` over those paths returns nothing.
- Every lintable file tracked under `apps/web` is TypeScript — `src/**/*.ts`,
  `src/**/*.tsx` and `vite.config.ts`; there is no `.js`, `.mjs` or `.cjs`
  source.
- Installed lint packages are `eslint` 9.39.5 with its own `@eslint/*`
  dependencies (including `@eslint/js`) and `globals`. No TypeScript parser is
  installed: `node_modules/@typescript-eslint` and
  `node_modules/typescript-eslint` do not exist, and neither do React lint
  plugins.

**Consequence — inferred from ESLint's documented behaviour, not executed:**
ESLint's built-in parser (espree) does not parse TypeScript syntax. A flat
configuration built only from installed packages could therefore pass only by
ignoring every `.ts`/`.tsx` file, which is all of `apps/web`. That makes
`eslint . --max-warnings=0` check nothing while reporting success. It would
weaken the check, so it was **not** done, and no configuration file was added.

**Exact authorization boundary.** A lint that checks the TypeScript sources
needs at least one new dev dependency in `apps/web/package.json` that supplies a
TypeScript parser (for example `typescript-eslint`), plus its lockfile records,
and then an `apps/web/eslint.config.js`. The accepted dependency policy refuses
every edit to a protected manifest now that the jsdom authorization is spent
(`scripts/lib/authorized-dependency-policy.mjs`). That is a dependency decision
for the Founder, separate from the `brace-expansion` decision, and not covered
by the active directive (section 4.2.2). The exact proposal is in section 4.2.1.
Lint is **not** resolved here.

### 4.2.1 Exact lint proposal — SEARCH-CLOSURE-REMEDY-PREP-1

Nothing was applied: no manifest, lockfile, configuration or source changed.

**Context — observed.** Only `@tlp/web` defines `lint`
(`eslint . --max-warnings=0`). The root `npm run lint` runs it through
`--workspaces --if-present`, and `services/api` and `packages/shared-types` have
no lint script. Installed versions: `eslint` 9.39.5, `@eslint/js` 9.39.5,
`globals` 14.0.0 and `typescript` 5.9.3. The root `engines.node` is `>=22`.

**Package — observed upstream** through `gh api -X GET` on
`typescript-eslint/typescript-eslint`: the latest release is **`v8.71.0`**
(published 2026-09-28). Its `packages/typescript-eslint/package.json` at that tag
declares version `8.71.0`, license MIT, `engines.node`
`^18.18.0 || ^20.9.0 || >=21.1.0`, and peer dependencies
`eslint ^8.57.0 || ^9.0.0 || ^10.0.0` and `typescript >=4.8.4 <6.1.0`.

**Compatibility.** eslint 9.39.5, typescript 5.9.3 and Node ≥22 all satisfy
those ranges (computed by comparing the observed values). No other installed
package needs to move to meet a peer range. That the npm-published 8.71.0
matches the tag was **not** observed: no registry document for it is in the
local npm cache, and the registry read was not attempted by another route.

**Proposed change — one package, three files plus the lockfile:**

1. `apps/web/package.json` `devDependencies`: add `"typescript-eslint": "8.71.0"`,
   an exact pin. It is the single meta-package that supplies the parser and the
   plugin, and it is the only **new** package. The configuration also imports
   `@eslint/js` and `globals`, which are already installed through `eslint`.
   They are declared at their installed versions, `"@eslint/js": "9.39.5"` and
   `"globals": "14.0.0"`, so the imports are not undeclared, and **no record is
   added or moved for either**. The manifest changes by three lines, all in
   `devDependencies`.
2. `package-lock.json`: the `packages["apps/web"].devDependencies` entry, plus
   **new** records only, for `typescript-eslint`, `@typescript-eslint/*` and
   whatever transitive packages are not already present. No existing record may
   change version. The exact set of new records is resolved by npm
   and is **not** computed here. The applying package derives it with
   `npm install -D typescript-eslint@8.71.0 -w @tlp/web`, reports it, and pins
   the resulting lockfile by digest before the policy accepts it. If any
   existing record changes, it stops.
3. New `apps/web/eslint.config.js`:
   `tseslint.config(js.configs.recommended, ...tseslint.configs.recommended)`,
   with `ignores: ["dist/**"]`, `files: ["**/*.{ts,tsx}"]`,
   `languageOptions.globals` from `globals.browser`, and the existing
   `--max-warnings=0` kept.
   - Rules: `@eslint/js` `recommended` plus `typescript-eslint` `recommended`
     (syntactic, not type-checked), with **no rule disabled, and no rule
     downgraded to a warning**.
   - Type-checked presets are excluded. They need parser project
     configuration and a full program build per run, which is more scope than
     restoring a working lint.
   - React plugins (`eslint-plugin-react-hooks`, `-react-refresh`) are
     excluded: each is a further dependency decision.

**Handling of existing findings — bounded.** Whether the current TypeScript
sources pass these rules is **unknown**, because the rules cannot run without the
dependency. The applying package therefore:

- runs `npm run lint` once after configuration and records the counts per rule
  and per file;
- if it is clean, finishes;
- if there are findings, it does **not** disable or downgrade rules, add
  `eslint-disable` comments, widen `ignores`, or raise `--max-warnings`. It
  stops and reports them;
- leaves source fixes to a separate bounded package, because changing product
  source is outside a dependency package.

So the lint gate is not weakened to make it pass.

**Policy authorization required.** The jsdom authorization is spent, and
`checkUnauthorizedManifest` refuses every change to `apps/web/package.json`.
`checkLockfile` refuses every lockfile other than the pinned ones.

- **Proposed authorization:** a third, separately named one-time authorization
  in `scripts/lib/authorized-dependency-policy.mjs`, with the same shape. It
  allows exactly the three `devDependencies` additions in item 1 to
  `apps/web/package.json`, and exactly one resulting lockfile, pinned by SHA-256.
- **Matching regression cases** in `scripts/verify-dependency-policy.sh`: the
  exact additions pass; any other version or package is refused; any further
  addition is refused; once it is spent, a further change is refused; and the
  jsdom, js-yaml and brace-expansion pins are unchanged.
- **Ordering:** if the `brace-expansion` remedy lands first, this pin's
  **from** digest is `ae794bd9…bdd5`; otherwise it is `5718e120…f58f`. The two
  remedies must be applied in sequence, never combined into one transition.
  The `brace-expansion` remedy has landed (`c2c684b`), so the **from** digest
  is now `ae794bd9…bdd5`.

### 4.2.2 Authority for either transition — SEARCH-CLOSURE-REMEDY-PREP-1, reconciled in SEARCH-CLOSURE-AUTHORITY-RECONCILE-1

**Conclusion (reconciled): the `brace-expansion` security transition is
covered by the active Founder directive `tlp-delivery-first-2026-10-02`,
bounded to exactly the pinned transition in section 4.1.1. The
`typescript-eslint` lint transition is not covered and is not a Search closure
blocker.** No dependency or policy was changed by this package. The two
conclusions are assessed separately below.

The analysis first recorded by SEARCH-CLOSURE-REMEDY-PREP-1 rested on the
issue #52 response. That response has been consumed and is now superseded as the
current directive. It is kept below as history.

**Canonical requirements — unchanged, and binding on both transitions:**

- `Engineering-OS.md` §7 (DEC-048), "Actions that always require Founder
  approval", lists **adding, removing, upgrading or replacing dependencies**.
  The `brace-expansion` upgrade and the `typescript-eslint` addition are both in
  that category.
- DEC-050 lists **dependency changes** among the consequential gates for which
  the Founder remains the authority. DEC-051 restates this, and `CLAUDE.md`
  Change Control lists "consequential dependency changes" under "never do
  independently".
- The accepted policy (`scripts/lib/authorized-dependency-policy.mjs`) records
  two one-time Founder authorizations, jsdom and js-yaml (`47bfdcd`). Both are
  pinned to their own exact content, and both are spent. Its own text says that
  a future authorization must be a separate, written decision. Neither
  authorization can be reused.
- No decision with ledger status **Locked** governs dependencies. DEC-048,
  DEC-050 and DEC-051 are **Approved**. The directive is consistent with them,
  because it is itself a Founder authorization, and it does not amend them. No
  conflict with a Locked decision was found.

**Older directive — the issue #52 response (consumed 2026-10-02, superseded).**
It said: *"No Founder decision is required for routine verification. Complete
the required writable local verification …"*. It authorized routine
verification only. It did not mention a dependency, a lockfile or the policy,
so it authorized neither transition. That remains true of that response.

**Active directive — `tlp-delivery-first-2026-10-02`** (observed in the
workstation-local `.ai-runtime/platform-directive.json`): `authorized_by`
`Founder`, `authorized_at` `2026-10-02T22:50:00Z`, `enabled` `true`. It is later
than the issue #52 response and replaces it as the current execution directive.
Its relevant terms, quoted:

- `search_rescue.objective`: *"Finish Search release closure from the accepted
  implementation and existing closure evidence; resolve only blocking
  closure/security issues, run required deterministic verification, produce a
  durable checkpoint, then open Founder Search UAT."*
- `search_rescue.preserve_remote_checkpoint`: `de7cfc8…`, and
  `do_not_rebuild_search_001_through_008`: `true`.
- `execution_rules`: *"Founder interruption is reserved for meaningful
  learner-facing UAT, a genuinely new product/business decision,
  credentials/secrets/billing, privileged destructive actions, or an exhausted
  safety stop"*; and *"No new architecture, framework, or scope is introduced
  merely to make the automation easier."*
- `human_boundaries`: Founder Search UAT and later learner-facing UAT; new
  product/business choices; credentials, billing, secrets or account
  authorization; privileged or destructive external actions; production
  deployment or public exposure.

Its provenance is not observable from the repository. It is a workstation-local
runtime file, not a GitHub issue (DEC-050/051), and it is not committed (runtime
evidence is excluded from product commits). This conclusion treats it as the
Founder's directive because this work package names it as the current Founder
execution directive.

**Security conclusion — `brace-expansion` 1.1.18 → 1.1.21: covered, exactly
bounded.**

- The advisory is the **only** step on which the Search Engine completion gate
  fails (section 3.4, observed). The gate runs `npm audit --audit-level=high`
  through `scripts/security-scan.sh`. It is therefore both a **blocking
  closure** issue and a **security** issue, the class the directive explicitly
  tells this delivery to resolve.
- DEC-048 needs a Founder approval for a dependency upgrade. It does not need a
  separate approval channel. The directive is a written Founder authorization to
  resolve exactly this class of issue, and section 4.1.1 has fully specified the
  only remedy since before the directive was issued. The remedy changes one
  lockfile record from `5718e120…f58f` to `ae794bd9…bdd5`, is dev-only, stays
  inside minimatch's existing `^1.1.7` range, and changes no manifest. It is not
  a new product or business choice, and it touches no credentials or production.
  It is outside every directive `human_boundaries` entry.
- So the Founder approval DEC-048 needs is supplied, **for that one pinned
  transition only**. It does not cover any manifest change, any other record,
  wholesale `npm audit fix`, the `vitest` 5 upgrade, any other `brace-expansion`
  version, or any lockfile other than `ae794bd9…bdd5`. If the applied result
  differs, the coverage lapses and a revised scope returns first, as section
  4.1.1 already states.
- **What still applies:** the dependency policy's own rule that a future
  authorization is a change to `scripts/lib/authorized-dependency-policy.mjs`,
  reviewed as the policy change it is. The applying package therefore remains a
  separate bounded package. It records `tlp-delivery-first-2026-10-02` as the
  authorizing decision in that file, in the same form as the js-yaml
  authorization. Its diff, checks and expected results are exactly those in
  section 4.1.1. It still goes through architecture review and CI. This package
  does not apply it. (It was applied later by SEARCH-SECURITY-APPLY-1,
  `c2c684b`, after architecture review; CI is not yet observed — section 3.5.)
- **No further Founder decision is required for this transition.**

**Lint conclusion — `typescript-eslint` 8.71.0: not covered, and not a closure
blocker.**

- Lint is **not** a step of the Search Engine completion gate. The gate's steps
  other than `npm audit` all passed while `npm run lint` exited 2, in the same
  run (section 3.4, observed). Lint is pre-existing, pre-dates Wave 9, and is
  not a Search defect (finding 4.2). It is also not a security issue. So it is
  outside *"resolve only blocking closure/security issues"*.
- Unlike the security remedy, it **adds** a new package and changes a protected
  manifest. That is new dev tooling, which the directive does not mention, and
  which its *"no new … framework, or scope"* rule leaves outside the current
  delivery scope.
- No other authority covers it. The jsdom and js-yaml authorizations are spent
  and pinned to their own content. The issue #52 response covered verification
  only. DEC-048 still needs a Founder approval for adding a dependency.
- **Consequence:** Search closure and Founder Search UAT do **not** wait on it,
  and no Founder interruption is raised for it now. It stays an open,
  carried-forward limitation (finding 4.2), with its exact proposal in section
  4.2.1.
- **Founder decision required only when lint is scheduled** (the approved
  sequence's Hardening stage is the natural point, but this package does not
  schedule it). The protected transition is: `apps/web/package.json`
  `devDependencies` gains exactly `"typescript-eslint": "8.71.0"`,
  `"@eslint/js": "9.39.5"` and `"globals": "14.0.0"`. The lockfile moves from
  `ae794bd9…bdd5` (or `5718e120…f58f` if the security transition has not landed)
  to one npm-resolved digest that adds records only. The security transition
  has landed, so the **from** digest is `ae794bd9…bdd5`. A third one-time policy
  authorization pins both. Existing authority cannot cover it because it adds a
  dependency and changes a manifest, it is neither blocking nor security, and
  every prior dependency authorization is spent.

The two transitions remain sequential and are never combined (section 4.2.1,
Ordering).

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
workflow or Feature Registry entry was changed by the SEARCH-CLOSURE packages,
SEARCH-SECURITY-PREP-1, SEARCH-SECURITY-PREP-2, SEARCH-RELEASE-CLOSURE-1,
SEARCH-CLOSURE-REMEDY-PREP-1 or SEARCH-CLOSURE-AUTHORITY-RECONCILE-1, and no
ESLint configuration was added. No
database command, curriculum publication, dependency fix, deployment or commit
was performed. The refused `npm ls brace-expansion` was not retried and was not
replaced by another command that inspects the installed tree. The Search Engine
completion gate and `scripts/verify-wave9.sh` are unchanged.

SEARCH-SECURITY-APPLY-1 (`c2c684b`) is the one package that changed a
dependency and the dependency policy: exactly the three files listed in section
3.5, within the pinned transition. SEARCH-SECURITY-CLOSURE-1 changed only this
review, `SEARCH_UAT_RUNBOOK.md` and `CURRENT_BUILD_STATUS.md`; it ran no
install, fix or database command, and performed no commit, push or deployment.

---

## 6. What this review does not establish

- a passing CI run for `c2c684b` or for these documents; no required `verify`
  run has been observed (section 3.5)
- the installed dependency tree; the chain in finding 4.1 is read from the
  committed lockfile, and no reinstall followed the lockfile change, so the
  installed `brace-expansion` copy is not observed
- the exact lockfile records a `typescript-eslint` 8.71.0 install adds, or that
  the TypeScript sources pass the proposed rules (section 4.2.1)
- inspectable raw output for SEARCH-CLOSURE-1 and SEARCH-CLOSURE-2 results;
  those are reported, and only the gate and lint were re-observed (section 3.3)
- the cause of the historical test timeouts, or that they cannot recur
  (section 3.1)
- passing lint, or that the TypeScript sources would pass a configured lint
  (finding 4.2)
- live row level security enforcement (finding 4.3)
- rendered usability, rendered accessibility or visual quality (finding 4.4)
- that a searchable corpus exists in any environment (finding 4.6)
- ranking usefulness to a learner, which only Founder UAT can judge
- Founder acceptance or Human UAT of any kind — Search Human UAT remains
  **pending**, and final Search product acceptance is **not granted** (DEC-047)

**Status: IMPLEMENTED — AUTOMATED VALIDATION PASSED (completion gate exit 0
at `c2c684b`, observed in section 3.5; the pinned `brace-expansion`
transition applied at `c2c684b` under directive `tlp-delivery-first-2026-10-02`;
`npm audit --audit-level=high` exit 0, section 3.5; CI not yet observed; lint
exit 2, not a closure blocker, its dependency remedy not covered and needing its
own Founder decision when scheduled, section 4.2.2) — Rendered Architect review
and Founder Search Human UAT pending — PENDING INDEPENDENT ARCHITECTURE REVIEW.**
