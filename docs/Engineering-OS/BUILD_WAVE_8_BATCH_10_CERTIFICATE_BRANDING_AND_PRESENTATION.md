# Build Wave 8 — Batch 10

## Certificate Branding and Presentation (CERT-009)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `7544bad` — routine permission configuration
**Preceding feature commit:** `b9f9359` — CERT-008 Certificate Revocation and Correction

---

## 1. Purpose

Render an issued certificate so it reads as a credential — what was earned, by
whom, from whom, when, which competencies it represents, whether it currently
stands, and how to verify it — professionally laid out, printable, and
accessible.

**Presentation never alters certificate truth.** CERT-009 is the last layer of
the Certificate Engine and the only one that owns nothing.

---

## 2. Founder rulings this batch implements

| Ruling | Implementation |
|---|---|
| Holder name = current `display_name`, read-time, owner-only | Read from `user_profiles` scoped to the caller; never snapshotted |
| No snapshot into issuance | CERT-003 untouched; no migration |
| Certificate ID allowed in the owner's view | Rendered in the credential; still forbidden in CERT-005's payload |
| Text/CSS branding only | CERT-001's `plainLanguageTitle`, `plainLanguageSummary`, `logoTextAlternative` |
| No CURR-007 implementation | No asset registry, no logo storage, no seal |
| Browser-native print | `@media print`, no PDF library |
| QR design-only | The existing CERT-005 reference is exposed; no image, no token |
| Presentation only | No lifecycle, eligibility, issuance or correction logic |

---

## 3. The holder-name boundary, stated plainly

> **The current display name is presentation data, not historical issuance
> truth.**

If a learner changes their display name, an older certificate rendered later
shows the **new** name. That is accepted and documented in the module header.

It must never move any frozen fact, and a test proves it does not: rendering the
same certificate under two different names leaves `certificateId`,
`certificateTitle`, `issuer`, `issuedAt`, definition stable id and version,
`status`, `verificationReference` and the competency snapshot byte-identical,
and `presentationPreservesTruth` still returns true.

The name is read **only** for the authenticated owner, scoped by
`.eq("user_id", userId)`. There is no code path to another learner's name.

---

## 4. Presentation cannot alter truth — proven, not asserted

`presentationPreservesTruth(model, entry)` compares every authoritative field
against the CERT-006 projection the model was built from. CERT-009 §13 requires
a test confirming presentation cannot alter truth; this is that test, and it
runs in both directions:

* brand metadata that tries to replace the title, issuer or version **cannot** —
  the authoritative values survive and the comparator returns true;
* a deliberately tampered model (wrong `issuedAt`, wrong `status`, a dropped
  competency) makes the comparator return **false**, so the test would catch a
  real regression rather than passing vacuously.

The model is assembled by explicit assignment, never a spread, so a field added
to the portfolio entry cannot leak into a rendered certificate.

---

## 5. Composition, not duplication

CERT-009 calls `getStudentCertificatePortfolio` and adds exactly two reads that
belong to no earlier feature:

1. CERT-001's editable presentation metadata for the definitions in play.
2. the authenticated owner's current display name.

The verifier pins this: the service's `.from(...)` set must be **exactly**
`certificate_definitions` and `user_profiles`. It reads no certificate, no
lifecycle event, no competency snapshot, and writes nothing at all.

---

## 6. Accessible fallback (CERT-009 §12)

When brand metadata cannot be resolved, the certificate renders through
`buildFallbackCertificatePresentation`. Every authoritative field and the
verification reference survive; `isFallback` is set, and the view shows a plain
note explaining that the certificate itself is unaffected and can still be
verified. A failed brand lookup never costs the learner their certificate and
never blocks verification.

---

## 7. Accessibility and printing

Semantic headings, a real list, a description list for facts, and readable
status text — a revoked certificate reads "Revoked — this certificate is not
currently valid" in words, so colour and seals are never the only signal.

The brand mark is a **text alternative**, never an image. The credential is
therefore never image-only, in print or in a screen reader.

`@media print` hides navigation and controls, avoids page breaks inside a
credential, and — importantly — prints the verification URL beside its link text
via `content: " (" attr(href) ")"`, so the destination survives on paper.

---

## 8. Guardrail changes

| Guard | Change | Still protects |
|---|---|---|
| Duplicate-model glob | `certificate-presentation.*` added; redeclaration protection **extended** to it | Any other certificate module still fails |
| Student route `case` allowlist | One exact literal added: `"/certificates/presentation"` | Exact literals only; no wildcard |
| Route allowlists (4 test files) | six → seven, exact array equality retained | An eighth route fails |
| CERT-001 privileged-authoring exemption | `"/certificates/presentation"` added | Every other certificate path must be `/admin/certificates/` |
| Certificate migration set | **Unchanged** | CERT-009 adds no migration |
| CERT-005 forbidden fields | **Unchanged** | Holder identity still forbidden publicly |

No guard was removed and no exact check became a pattern.

---

## 9. Tests

`packages/shared-types/src/certificate-presentation.test.ts` — **36 cases**:
truth preservation across every lifecycle status, brand metadata unable to
displace an authoritative field, the comparator detecting tampering, privacy,
holder-name handling including the rename consequence, status always stated,
heading precedence, the fallback, the printable summary, and the verification
hook carrying no second token.

`services/api/src/certificate-presentation.test.ts` — **30 cases**, of which
the **"E" block executes the real service** against a mocked client: brand
treatment applied, holder name resolved and scoped to the caller, truth
preserved end to end, fallback when brand metadata is missing, a missing display
name never blocking presentation, a revoked certificate presented as revoked, a
blank identifier refused before any query, whole-portfolio failure propagating,
an empty portfolio, and no identity or evidence field in the serialized result.

---

## 10. Accepted limitations

1. **No browser/DOM harness.** Print output, focus order and rendered markup are
   asserted structurally by the verifier, never executed.
2. **Colour contrast is unverified.** The palette is stated to meet contrast
   requirements; nothing in this repository can measure it.
3. **No live PostgreSQL/RLS harness** — owner scoping proven at the query level
   through a mock.
4. **No binary brand asset.** Deferred to CURR-007, which is unimplemented.
5. **No PDF and no QR image**, per ruling.

---

## 11. Boundaries held

No migration · no schema change · no dependency · no new public data · no public
holder identity · no CERT-007 export change · no second verification token · no
RLS change · no lifecycle, eligibility, issuance or correction logic ·
CERT-005's forbidden-field protection intact · DEC-029–040 untouched.
