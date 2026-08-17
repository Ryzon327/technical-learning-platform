# BUILD — Wave 8 / Batch 3

## Student Eligibility UI and Accessibility (CERT-002 completion follow-up)

**Status:** implemented — closes the remaining CERT-002 §10 / §13 student-facing
requirement left open by Batch 2
**Scope:** eligibility presentation and the minimum discovery needed to reach
it. No issuance, no certificate record, no lifecycle, no verification, no
migration.

---

## 1. Purpose

Batch 2 delivered and verified the CERT-002 backend evaluator and API, but
deliberately deferred the frontend. CERT-002 §10 requires eligibility *views*
and §13 requires that a student can view eligibility status, see required
competencies and evidence, and understand what remains. None of that was
reachable by a student.

This batch delivers exactly that view, and the narrow discovery endpoint the
selector needs. It changes no eligibility semantics.

---

## 2. Architecture

```
CERT-002 backend (authoritative)
    GET /certificates/definitions   → selectable certificates
    GET /certificates/eligibility   → deterministic evaluation
        ↓
    certificate-eligibility-service.ts   (transport only)
        ↓
    certificate-eligibility-presentation.ts   (pure wording, unit tested)
        ↓
    CertificateEligibilityView.tsx   (renders, decides nothing)
```

The repository has no jsdom or DOM-testing stack, and the Wave 7 verifier fails
the build if one is added. So every string a student reads is produced by pure
functions in `certificate-eligibility-presentation.ts` and unit tested there —
the same approach EVID-007 used. The component holds no wording logic worth
testing that a test cannot reach.

---

## 3. Discovery endpoint

`GET /certificates/definitions` — authenticated, read-only.

Selectable means:

```
publication_state = 'published'
AND superseded_by_definition_id IS NULL
```

Publication alone is not enough: `superseded_by_definition_id` records an
explicit Founder decision that a definition was replaced, and a replaced
certificate should not be offered as an ordinary choice for a new evaluation.

**This is a discovery/selection rule only.** It does not retire the superseded
definition, change its publication state, delete it, alter RLS, or prevent an
exact-version reference to it. The historical definition remains intact and
remains evaluable if requested directly by `stableId` + `version`.

Fields returned — the minimum the selector needs:

| Field | Why |
| --- | --- |
| `stableId` | identifier for the eligibility call; never shown to the student |
| `version` | exact version to evaluate; shown only as secondary detail |
| `title` | fallback display name |
| `plainLanguageTitle` | accessible name required by CERT-001 §10 |
| `description` | optional; helps a student understand what the certificate means |

Deliberately withheld: `id`, `issuer`, `effectiveAt`, `expirationMonths`,
`verificationPermitted`, `publicationState`, `supersededByDefinitionId`,
requirements and evidence policies. Administrative and policy fields are not
exposed merely because they exist.

The endpoint computes no eligibility. It is a read with no mutation, accepts no
client input, and sends no user identifier.

Results are sorted in TypeScript rather than with a database `ORDER BY`, because
CERT-002 forbids selecting a version by ordering. Sorting here is presentation
and picks nothing.

---

## 4. Version handling

Per the approved ruling, CERT-001 defines no "current" or "latest" version and
this batch introduces none.

- Two published, non-superseded versions of one stable ID remain **independently
  selectable**.
- No option is ever labelled *Latest*, *Current*, *Recommended* or *Preferred* —
  asserted by both a test and the verifier.
- `labelCertificateDefinitionOptions` adds "— Version N" **only** when more than
  one option shares a title. A single certificate reads as its plain name.
- The student never types a stable ID or a version; both travel with the chosen
  option.
- Once selected, the view calls
  `/certificates/eligibility?stableId=…&version=…` with **exactly** that pair.
  No substitution is possible.

---

## 5. Student experience

Reached from the existing workspace navigation as a third `WorkspaceView`
("Certificate eligibility"), beside Overview and Evidence portfolio. No routing
library, no certificates dashboard.

The flow is: choose a certificate → one evaluation for that exact version.
Nothing is evaluated automatically on page load.

| State | Presentation |
| --- | --- |
| No selection | "Choose a certificate to check your eligibility." |
| Loading | "Checking your eligibility…" |
| `eligible` | "You've met the current requirements for this certificate." · label "Requirements met" |
| `ineligible` | "You still have requirements to complete." · "2 requirements remaining." |
| `unknown` | "We can't determine your eligibility right now." plus a reason-specific explanation |
| Error | `role="alert"` with the normalized API message; no stack traces |
| Empty | "There are no certificates available to check right now." |

Eligible never implies issuance — the view states plainly that *"Checking here
does not request or issue a certificate."* A test asserts the eligible wording
contains none of *issued*, *earned*, *awarded*, *granted*, *claim*, *download*.

Requirements render as **Satisfied** / **Still needed** with a plain-language
detail line. `version_not_evidenced` is explained as *"Your evidence for this
skill is from a different version of it, so it doesn't count towards this
certificate"* — otherwise a student who did the work would have no way to
understand why it does not count.

Evidence policies render as a readable source name ("Hands-on labs"), the
backend-supplied progress ("1 of 2 counted so far"), and Satisfied / Still
needed.

### Unknown is never failure

Each `unknownReason` has its own calm explanation:

- **unresolved review** — "Some of the evidence for this certificate is being
  reviewed… Nothing is wrong with your work — this simply hasn't finished."
- **dependency unavailable** — "We couldn't reach the information needed to
  check this. Please try again in a little while."
- **definition not published** — "This certificate isn't available for
  eligibility checks at the moment. This is about the certificate, not about
  your progress."

Tests assert the three are distinct, that the review message contains none of
*failed*, *rejected*, *invalid*, *not met*, and that unknown never asserts what
remains.

### Calm tone

No guilt, urgency, streaks or shame. A test scans the module's prose for
*falling behind*, *hurry*, *urgent*, *streak*, *act now*, *finish these now*,
*you failed*, *overdue* and fails on any of them.

---

## 6. Accessibility

- Native `<select>` with a real `<label htmlFor>` — keyboard operation, focus
  and screen-reader behaviour come from the platform, not a custom control. The
  verifier fails on `role="listbox"`, `role="combobox"`, `onKeyDown` or
  `tabIndex`.
- Semantic `<section>` / `<h2>` / `<h3>` / `<h4>` / `<ul>` / `<dl>`, with regions
  and lists tied to their headings by `aria-labelledby`.
- **Status is always text.** "Satisfied", "Still needed", "Requirements met",
  "Not determined yet". The verifier fails if a colour-carrying class name
  appears, and the view contains no inline styles.
- **Exactly one** `aria-live="polite"` region for the load lifecycle, asserted by
  count in both a test and the verifier, so a screen reader gets one meaningful
  change rather than a stream.
- Errors use the existing `role="alert"` convention.
- Existing `.card` / `.status-grid` classes only — no CSS change was needed, so
  the responsive behaviour and contrast of the existing design system are
  inherited unchanged.

---

## 7. Truth boundary

The frontend computes no eligibility. Verified by test and verifier: no
`qualifyingCount >=` comparison, no `.every(`/`.some(` over requirements, no
reference to `qualifiesForDemonstration`, `deriveEvidenceOutcome`,
`qualifiesAsDemonstrationEvidence`, `resolveEffectiveEvidenceState`,
`isEffectivelyTrustedEvidence` or `evaluateCertificateEligibility`, and no
`latest`/`newest` anywhere.

Branching on `result.status` for presentation is the only decision the component
makes.

---

## 8. Tests

`apps/web/src/certificates/certificate-eligibility-presentation.test.ts` —
**44 cases**, covering: eligible/ineligible/unknown wording and distinctness;
each unknown reason; unknown never phrased as failure; calm remaining counts
with correct pluralisation; requirement and policy state wording; version
mismatch explained distinctly; loading lifecycle producing one sentence per
state; option labelling ambiguous-only; no precedence labels; calm-tone
vocabulary scan; no eligibility computation in any of the three frontend files;
no issuance control or endpoint; read-only service sending no user identifier;
and the accessible structure of the view.

`services/api/src/certificate-eligibility.test.ts` — **+8 cases** (29 → 37) for
the discovery endpoint boundary: authenticated, read-only, published and
non-superseded only, minimum fields, no eligibility calculation, no client
input, no ordering-based selection, no mutation.

---

## 9. Verifier

`scripts/verify-wave8.sh` was **extended, not replaced**. All CERT-001 checks,
all CERT-002 backend checks and the Wave 7 Evidence Engine completion gate are
preserved and still run.

**One Batch 2 assertion was replaced, as authorized:**

```bash
if git status --porcelain apps/web 2>/dev/null | grep -q .; then
  fail "Batch 2 defers frontend UI; apps/web must be unchanged"
fi
```

It recorded the intentionally deferred UI state, which this batch ends. It was
also git-state dependent and would have stopped meaning anything once the UI was
committed. It is replaced by seven substantive sections (21–27) over the
delivered files: no router or DOM-testing dependency; no eligibility computation
in the frontend; exact-version pass-through with no precedence labels; no
issuance/sharing/verification control and no user identifier; accessibility
(labelled native control, single live region, text-based status, no custom
controls, no colour-only meaning); unknown distinct from ineligible; and the
view being reachable from the existing navigation.

The student certificate route allowlist now permits **exactly**
`/certificates/eligibility` and `/certificates/definitions`, by explicit `case`
match. `/certificates/*` is never broadly permitted; any other student
certificate route still fails.

Three CERT-001/CERT-002 test allowlists were widened by one entry for the same
reason — `certificate-admin.test.ts` A3 and B, and `certificate-eligibility.test.ts`
A4 — each still asserting an exact set rather than a pattern. One Batch 2
assertion (E3) was narrowed to permit *reading* `superseded_by_definition_id` as
a discovery filter while still forbidding any lifecycle write.

`scripts/smoke-api.sh` gains four assertions: discovery returns 401
unauthenticated, and POST/PATCH/DELETE on it fall through to 404. No existing
assertion was changed.

---

## 10. Boundaries held

No issuance, certificate record, lifecycle, verification identifier, portfolio,
export, sharing, revocation, correction, PDF, rendering, branding, employer
workflow or public certificate page. No AI. No new database table, no migration,
no new dependency.

`superseded_by_definition_id` is **read** as a selection filter and never
written; CERT-001 lifecycle semantics are untouched.

---

## 11. CERT-002 status

With this batch the approved CERT-002 requirements are satisfied: the evaluator
and API (Batch 2), and the student view with its accessibility requirements
(this batch). §14 Definition of Done items — evaluator, requirement-by-requirement
result, trusted evidence checks, unavailable state, tests across
eligible/ineligible/unknown — are all represented.

CERT-002 closure remains subject to independent architecture review.

---

**PENDING INDEPENDENT ARCHITECTURE REVIEW**
