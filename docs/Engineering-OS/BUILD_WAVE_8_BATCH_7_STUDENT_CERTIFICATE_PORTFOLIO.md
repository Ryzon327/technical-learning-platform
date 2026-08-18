# BUILD — Wave 8 / Batch 7

## Student Certificate Portfolio (CERT-006)

**Status:** implemented
**Scope:** private learner portfolio composition and presentation only. No
export, sharing, PDF, QR, branding, admin access or lifecycle workflow.

---

## 1. Purpose

A private place where a learner sees every certificate they hold, whether each
is still current, what competencies it represents, and can open verification of
their own credential.

---

## 2. Contract

**`GET /certificates/portfolio`** — authenticated, owner-only.

Optional filters: `status`, `certificateDefinitionStableId`. Unrecognised filter
values are ignored rather than rejected, so a stale bookmark shows the whole
portfolio instead of an error.

**CERT-004's `GET /certificates` is untouched**, and its
`StudentCertificateRecord` contract is unchanged — asserted by both a test and
the verifier.

### Entry shape

```
certificateId
certificateTitle
issuer
certificateDefinitionStableId
certificateDefinitionVersion
issuedAt
status                        active | expired | revoked | superseded | corrected
statusEffectiveAt
expiresAt?
competencySummary[]           { title, version }
verificationReference
```

Absent: holder identity of any kind, Evidence detail beyond the pinned
competency summary, and every CERT-007/CERT-008 field (`shareUrl`, `pdfUrl`,
`reason`, `actorId`, `replacementCertificateId`).

---

## 3. Why the verification reference lives here and not in CERT-004

Before this batch a learner had **no way to obtain their own verification
reference**: CERT-003 returns it once in the issuance response, and CERT-004
deliberately omits it. A returning learner therefore could not verify their own
certificate — the gap CERT-006 section 5's "verification action" exists to close.

Per ruling 2 the reference is added to the **new portfolio entry type**, never to
`StudentCertificateRecord`. That choice is what let CERT-006 land **without
weakening a single CERT-001…CERT-005 guardrail** — the alternative would have
forced four narrowings for no architectural gain.

The portfolio service issues its own scoped read rather than reusing
`listStudentCertificateRecords`, precisely because that function's omission of
`verification_id` is guarded and must stay that way. Lifecycle status still
comes from CERT-004's resolver, so the single authority is preserved.

---

## 4. Source-of-truth boundaries

| Concern | Owner |
| --- | --- |
| Definition title, issuer | CERT-001 |
| Eligibility | CERT-002 — not touched |
| Issuance, pinned competency provenance | CERT-003 |
| Lifecycle status | CERT-004 `resolveEffectiveCertificateStatus` |
| Public verification | CERT-005 |
| **Portfolio composition and presentation** | **CERT-006** |

CERT-006 derives nothing. The verifier fails the build if it references
`isValidCertificateLifecycleTransition`, `calculateCertificateExpiry`,
`evaluateCertificateEligibility`, `getStudentCertificateEligibility`,
`issueStudentCertificate` or `decideCertificateIssuance`.

---

## 5. Ownership and privacy

Every query is scoped to `trusted.identity.userId`. No `userId`/`studentId`
reaches the route from a query string or body, there is no admin portfolio
route, and the service never reads `user_profiles`, `display_name`, `email` or
`auth.users`. No Evidence table is read — only
`certificate_competency_snapshots`, which CERT-003 pinned, plus competency
titles.

Read-only: no `insert`, `update`, `delete`, `upsert` or `rpc`.

---

## 6. Filtering and sorting

Filters apply to status and certificate definition, and combine. **Filter
options are always derived from the complete owned set, never the filtered
view**, so narrowing to one status never hides the way back — and they are built
only from the learner's own certificates, so the control never hints at a
certificate they do not hold.

Sorting is deterministic and total: most recently issued first, then title,
version and certificate id. Two certificates issued in the same instant never
swap places between requests, and sorting does not mutate its input.

---

## 7. Partial failure

A certificate whose presentation cannot be safely resolved — missing
definition, unreadable lifecycle history, or a history that fails CERT-004's
coherence replay — becomes an `unavailableEntry` carrying only its id and a
reason code. It is **never dropped and never fabricated**: no status, title,
competency or verification reference is invented. The rest of the portfolio
stays usable, per CERT-006 section 11.

A whole-portfolio dependency failure raises instead, so a learner sees a
retryable error rather than an empty portfolio falsely implying they hold
nothing.

---

## 8. Frontend

**Certificates** is now its own authenticated workspace destination, beside
Overview, Evidence portfolio and Certificate eligibility. The earned-certificate
list is no longer buried inside eligibility.

The redundant "Certificates you hold" block was removed from
`CertificateEligibilityView`, along with the now-dead `held` state, its loader
and four unused imports. The eligibility and issuance experience is otherwise
untouched. `loadStudentCertificates` remains in the web service as the client
for CERT-004's still-live `GET /certificates`; nothing in the UI calls it now.

**Opening one certificate.** The list shows each certificate's title and status.
A native `<button>` per certificate — carrying `aria-expanded` and
`aria-controls`, so the platform announces its state — opens that certificate's
detail region and closes any other. The detail region stays in the document and
is toggled with `hidden`, so `aria-controls` always resolves to a real element.

The decisions behind that live in
`apps/web/src/certificates/certificate-portfolio-presentation.ts` — which
certificate is focused, what the control says, where the verification action
points — because this repository has no rendered-DOM harness, so pure functions
are the only way to prove the behaviour executably. `resolvePortfolioSelection`
resolves the focus against the certificates actually on screen, so a filter that
removes the open certificate drops the focus instead of leaving a control
expanded over nothing. Focus is React state; **no router exists or was added**,
and the verifier fails the build if one appears.

Accessibility: `<h2>`/`<h3>`/`<h4>` structure, a real `<ul>` of certificates,
`<dl>` for facts, two labelled native `<select>` filters, status rendered
through `describeCertificateStatus` as text, one `aria-live="polite"` region,
`role="alert"` errors, `<time dateTime>` dates, and the verification action as a
plain link — keyboard-operable by default.

**No export, share or download control exists**, not even disabled. Per ruling 4
a placeholder would be a dead affordance; the verifier fails the build if one
appears.

---

## 9. Guardrail changes

**No CERT-001…CERT-005 or Wave 7 protection was weakened.** The only guard
touched is the duplicate-model glob, extended to recognise
`certificate-portfolio.*` as an approved module — and the redeclaration
protection was **extended** to cover it, so the guard is now stronger than
before.

Predicted in the architecture review and confirmed in implementation: keeping
the verification reference off CERT-004's type meant zero narrowings.

---

## 10. Tests

`packages/shared-types/src/certificate-portfolio.test.ts` — **30 behavioural
cases**: composition, every lifecycle status surviving unchanged, filtering
including combined and ignored-value cases, filter options derived from the full
owned set, deterministic total ordering and non-mutation, partial failure
listing without fabrication, count wording, and the exact entry field set with
no identity, Evidence or CERT-007/008 field.

`services/api/src/certificate-portfolio.test.ts` — **33 cases**, of which the
**"Z" block executes the real service** against a mocked client (the CERT-005
precedent): enriched portfolio, revoked status presented as recorded, incoherent
history and missing definition degrading to `unavailableEntries`, every read
scoped to the caller's user id, a blank identifier refused before any query, a
whole-portfolio failure raising rather than implying none, filters narrowing
without losing options, and an empty portfolio returning cleanly. The remaining
cases assert route ownership, source-of-truth boundaries, privacy, and that
CERT-004's and CERT-005's contracts are unchanged.

`apps/web/src/certificates/certificate-portfolio-presentation.test.ts` —
**15 behavioural cases** for the detail experience: focusing, refocusing and
unfocusing a certificate, never two focused at once, a stale focus dropped when
filtering removes that certificate, the focused entry carrying its full detail
(issuer, issued date, expiry, version, status, pinned competencies), the control
wording in both states, distinct detail-region ids, and the verification link.

The verification link is proven by **round-trip against CERT-005's own
`readVerificationReferenceFromPath`** — the very function `App.tsx` routes with.
The href CERT-006 renders is parsed by CERT-005 and yields back exactly the
reference the portfolio held, including for references that would otherwise
break a path. That is a contract proof, not a duplicated implementation:
CERT-006 owns no verification logic, and the verifier fails the build if the
proof is replaced by a local reimplementation.

---

## 11. Accepted limitations

1. **No live PostgreSQL harness.** Real RLS cross-user isolation, live query
   behaviour and query performance are **not** runtime-proven. Ownership scoping
   is proven executably at the query level (`.eq("user_id", …)` asserted through
   a mock), which is not the same as proving the database enforces it.
2. **Detail presentation is in-page, not a route.** CERT-006 section 5's
   "certificate detail view" is satisfied inside the Certificates workspace:
   the learner scans a list of certificate titles with their status, opens
   exactly one certificate with a native button (`aria-expanded` /
   `aria-controls`), and reads its full detail — issuer, issued date, effective
   status and its plain-language explanation, expiry when one applies,
   certificate version, the pinned competency titles and versions, and the
   verification action. Focus is React state, not a URL; no router exists or
   was added. Only one certificate is open at a time, and a certificate removed
   by a filter stops being the open one.
3. **Export/share hooks are structural only** — the entry shape leaves room for
   CERT-007 to add actions, but no visible affordance exists.

---

## 12. Boundaries held

No admin access · no export, share, download, PDF, QR or branding · no CERT-008
revoke/correct/supersede/restore or replacement reference · no lifecycle-event
history UI · no AI · no `certificateKind` or course-completion behaviour
(DEC-029…DEC-035 untouched) · §15b and §15c unaffected · no migration.

---

**PENDING INDEPENDENT ARCHITECTURE REVIEW**
