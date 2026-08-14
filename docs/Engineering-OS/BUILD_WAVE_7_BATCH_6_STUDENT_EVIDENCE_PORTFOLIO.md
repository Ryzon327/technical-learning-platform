# BUILD — Wave 7 / Batch 6

## Student Evidence Portfolio View (EVID-007)

**Status:** implemented
**Scope:** a private, student-scoped read model plus its accessible UI. No new
domain authority, no migration, no source-engine change.

---

## 1. Architecture

The portfolio is a projection, not a new engine.

```
listStudentEvidence            Batch 1 record + Batch 5 effective state
listEvidenceCompetencyLinks…   Batch 2 approved competency links
resolveCompetencyCurriculum…   Curriculum-owned course relationship
        ↓
services/api/src/evidence-portfolio.ts        composition only
        ↓
GET /evidence/portfolio                       authenticated, user scoped
        ↓
apps/web/src/lib/api-client.ts                generic transport
        ↓
apps/web/src/evidence/evidence-portfolio-service.ts
        ↓
apps/web/src/evidence/EvidencePortfolioView.tsx
```

It owns no Evidence truth, no competency mapping, no correction state and no
curriculum structure. It writes nothing — the verifier fails the build if any
`insert`, `update`, `upsert` or `delete` appears in the service.

---

## 2. Reuse decisions

| Need | Existing owner reused |
| --- | --- |
| Evidence records + effective state | `listStudentEvidence` (already returns `effectiveState`, `underReview`, `correctionCount`, `lastCorrectionReason` as of Batch 5) |
| Student-safe Evidence projection | `toStudentEvidenceRecord` (Batch 1) |
| Competency links, titles, versions | `StudentEvidenceCompetencyLink` (Batch 2) |
| Correction/supersession indication | Batch 5 effective state, surfaced as readable text |
| Source-friendly labels | bounded metadata already recorded by Batch 3 (`assessmentTitle`) and Batch 4 (`labName`) |
| Ownership enforcement | RLS through the user-scoped accessors |
| Filter/limit conventions | `note-retrieval` normalizer pattern |

Two additive changes were required, both approved in advance:

**`listEvidenceCompetencyLinksForEvidenceIds`** in `evidence-competency.ts` —
identical behaviour to `listEvidenceCompetencyLinks`, batched over many Evidence
ids so the portfolio does not issue one query per record. No existing accessor
changed.

**`resolveCompetencyCurriculumContext`** in `curriculum.ts` — the canonical
`competencies → mission_competencies → missions → learning_modules → courses`
traversal. It consumes exact `CompetencyReference` values
(`competencyStableId` + `competencyVersion`) and returns a map keyed
`stableId@version`, because different versions of one competency may map to
different missions and therefore different courses. Historical Evidence linked
to v2 keeps Course A even after v5 publishes against Course B. There is no
"latest" fallback, and the verifier fails the build if one appears. This gap was real: `PublishedLearningPathTree` carries no
competencies and is scoped to a single learning path, so nothing could answer
"which course does this competency belong to?". Curriculum owns the
relationship; the portfolio consumes it. The verifier fails the build if the
portfolio queries any curriculum table directly.

---

## 3. Proof qualification

The portfolio defines no qualification rule of its own. `isCurrentProof`
delegates to the canonical semantics established by Batch 3, Batch 4 and
Batch 5:

```
positive source outcome  (deriveEvidenceOutcome + qualifiesAsDemonstrationEvidence)
+ effective state active
+ integrity verified
    -> may be current proof
```

A failed assessment and an incomplete lab validation are **negative** and never
current proof, even while active and integrity-verified. Indeterminate results
(technical error, absent or unrecognised) fail closed. Restoration restores
effective state only — a restored negative result remains non-qualifying.

Every item also carries `evidenceOutcome`, so the outcome is explicit in the
read model rather than implied. The verifier extracts the body of
`isCurrentProof` and fails the build unless it consults both the result state
and the canonical demonstration rule.

---

## 4. Effective state

The portfolio derives no status of its own. It consumes Batch 5's resolved
state and presents it:

| Effective state | Student-visible status | Counts as current proof |
| --- | --- | --- |
| `active` | "Current evidence" | yes (integrity `verified`) |
| `active` + under review | "Current evidence — under review" | yes |
| `invalidated` | "No longer valid — kept for your records" | **no** |
| `superseded` | "Replaced by newer evidence — kept for your records" | **no** |

Invalidated and superseded Evidence stays visible by default, clearly labelled,
and is never presented as current proof. The verifier fails the build if the
service filters on effective state or recomputes it.

---

## 5. Filtering and grouping

`EvidencePortfolioFilters` mirrors the `note-retrieval` convention: optional
fields plus a clamped `limit` (1–200, default 50). Unknown values are dropped
rather than rejected, so a stale bookmark degrades to a broader portfolio.

- **competency** — Evidence linked to that competency
- **type** — canonical `EvidenceSourceType` internally; the UI renders friendly
  labels ("Hands-on lab", "Assessment")
- **course** — Evidence linked to at least one competency belonging to that
  course through the canonical curriculum relationship, matched on the exact
  pinned competency version

Filters constrain the item list first; `groupPortfolioItemsByCompetency` then
presents that filtered result. Grouping is never an independent source. The
verifier asserts this ordering inside `assembleEvidencePortfolio`.

Filter *options* are derived from the student's unfiltered Evidence, so the
controls stay usable after a filter narrows the view. Items with no competency
link appear under "Evidence not yet linked to a competency" rather than being
silently dropped.

---

## 6. Privacy

The view model carries: evidence id, source type, friendly label, outcome word,
dates, effective state, readable status, correction count and reason,
superseding id, competency links and course context.

It carries **no** integrity digests, no source integrity digest, no provider or
session identifiers, no actor or actor role, no owner id and no internal audit
metadata. The verifier greps for each of those and fails the build if one
appears.

Ownership is enforced by RLS on every underlying accessor, so a guessed
identifier cannot surface another student's Evidence — the portfolio never
takes a user id as input at all.

---

## 7. Frontend foundation

The web application had no client for `services/api` — every existing service
used the Supabase SDK for auth. Batch 6 establishes the smallest generic one:

`apps/web/src/lib/api-client.ts` owns base-URL resolution
(`VITE_API_BASE_URL`, following the `lib/supabase.ts` convention since
`packages/configuration` is empty), bearer headers from the existing
`AuthProvider` session, JSON handling, abort signals, and error normalization
into `ApiRequestError` with the platform's own codes.

It owns no feature logic, no auth state, no Supabase authentication and no
routing — enforced by a verifier check that inspects code with comments
stripped, so the module's own documentation of what it does *not* own cannot
trip the boundary.

Components never construct an Authorization header; the verifier fails the build
if `Authorization` or `Bearer` appears in the view or the shell.

**Navigation.** No routing library was introduced. `AuthenticatedApp.tsx` keeps
its existing `Workspace` shell; a `<nav aria-label="Workspace sections">` with
native buttons and `aria-current="page"` switches between Overview and the
portfolio via local state. The shell was not redesigned.

---

## 8. Accessibility

Per the approved Option (a), no jsdom, testing-library or axe was added. The
approach is:

- semantic landmarks, headings (`h2`–`h5`), lists and description lists
- native keyboard-operable controls only — `<select>` with real `<label
  htmlFor>`, `<button type="button">`
- every status is a full readable phrase, never a colour or bare badge; the
  verifier fails the build on `badge` class names, `color:` or
  `backgroundColor`
- absolute dates in `<time dateTime>` with readable text
- competency→evidence relationships expressed through nested lists bound by
  `aria-labelledby`
- `aria-live="polite"` for result counts, `role="alert"` for errors
- all decision logic in pure tested modules; the component only presents

The verifier asserts the presence of each structural element.

---

## 9. Failure behaviour (EVID-007 §12)

If competency links or curriculum context cannot be loaded, the portfolio is
still returned, the affected detail is listed in `unavailableItems` and shown
under "Some details are unavailable", and no status is hidden or fabricated.

---

## 10. Boundaries

### Required configuration

The web application needs `VITE_API_BASE_URL`. The canonical
`.env.example` already declares it (`http://localhost:3001`, matching
`API_PORT`), so Batch 6 modifies no environment file. The applier verifies the
declaration as a post-condition and the verifier enforces it, so the
requirement can never become tribal knowledge held only by this document.

No export, download, sharing, public URL, verification identifier, employer
access or public profile — all EVID-008. No AI: EVID-007 §11 makes
summarization optional and it is not implemented. No migration: the portfolio
reads existing tables through existing indexed access paths, and no index was
added speculatively.

---

## 11. Tests

| File | Cases |
| --- | --- |
| `packages/shared-types/src/evidence-portfolio.test.ts` | 36 |
| `apps/web/src/lib/api-client.test.ts` | 11 |

Coverage: proof qualification for passed assessment, failed assessment, passed
lab, incomplete lab, invalidated positive, superseded positive, indeterminate,
unverified integrity and restoration; version-aware curriculum context with v2
under Course A while v5 maps to Course B, across filtering, grouping and filter
options; limit clamping and filter normalization; filtering by type,
competency and course, and conjunctively; grouping under multiple competencies;
grouping only what the filter produced; current-proof counting; ungrouped items
surfaced; corrected Evidence retained and never current proof; readable status
for every state; friendly labels with fallbacks; date formatting including bad
input; filter options derived pre-filter; failure behaviour; base-URL
resolution and trailing slashes; URL building, blank-value omission and
encoding; error normalization for platform, auth, not-found and server errors.

---

## 12. Verification

`scripts/verify-wave7.sh` extended, not replaced: Batch 1–5 checks are
byte-identical through line 687, with 14 Batch 6 checks appended before the
toolchain run. 97 static checks total.

Eight were confirmed against deliberate regressions, each exiting 1: hiding
corrected Evidence, querying curriculum tables from the portfolio, routing
`/evidence/portfolio` after `/evidence/:id`, a component building its own bearer
header, adding `jsdom` to `apps/web`, reverting proof qualification to state and
integrity alone, reverting the curriculum accessor to stable-id-only, and
removing `VITE_API_BASE_URL` from the environment template.

`scripts/smoke-api.sh` gains three assertions — unauthenticated portfolio read
rejected, and `POST`/`DELETE` absent — without weakening any prior assertion.

---

## 13. Rollback

Additive only. Removing the nav entry in `AuthenticatedApp.tsx` hides the
feature with no data consequence; the route and read model can be removed
independently. Nothing in Batch 6 wrote data, so there is nothing to unwind.
The generic API client is deliberately feature-neutral and should outlive this
batch as the platform's client foundation.
