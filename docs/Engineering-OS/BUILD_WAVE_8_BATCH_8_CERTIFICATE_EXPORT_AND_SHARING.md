# Build Wave 8 — Batch 8

## Certificate Export and Sharing (CERT-007)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `ee726a0` — CERT-006 Student Certificate Portfolio

---

## 1. Purpose

A student can take certificates they already hold out of the platform: a
portable, privacy-safe file containing what was earned, from whom, when,
whether it currently stands, the competencies it represents, and the
verification reference an employer can check.

Nothing becomes public. Sharing remains a student action, and no share link
exists to be leaked.

---

## 2. Founder rulings this batch implements

| Decision | Ruling |
|---|---|
| A — portable format | Structured export **plus** a browser-native file download (JSON and Markdown). No PDF, no new dependency. |
| B — CERT-009 dependency | Proceed without branding; the branded/printable representation is deferred to CERT-009. |
| C — student display name | **Omit.** The export identifies the credential, not the person. |
| D — share-link scope | **Design-only.** The payload shape exists; nothing resolves or mints a link. |

---

## 3. The governing precedent

EVID-008 (Wave 7 Batch 7) is the same feature one engine over, and this batch
follows it deliberately: a pure projection module, a thin API service that
composes the existing portfolio read model, one authenticated POST route, and a
panel mounted inside the portfolio view that receives the same filters.

Two things differ, both because certificates are further along than Evidence
was:

* **No table.** EVID-008 had to mint and store a verification reference because
  Evidence had none. Certificates already carry `verification_id`, minted at
  issuance by CERT-003. CERT-007 therefore **writes nothing and adds no
  migration**.
* **A real file.** EVID-008 stopped at an on-screen representation. Ruling A
  extends this batch to a browser-native download, which needs no library.

---

## 4. Contract

`POST /certificates/export` — authenticated, owner-scoped, accepts the same
`status` and `certificateDefinitionStableId` filters as the portfolio.

```
CertificateExport {
  formatVersion, generatedAt, contents[],
  certificates: ExportedCertificate[],
  unavailableCertificates: UnexportableCertificate[],
  totalCount, currentlyValidCount
}
```

`ExportedCertificate` carries exactly: title, issuer, definition stable id and
version, issued date, status, status label, status explanation, expiry when one
applies, `currentlyValid`, the competency summary at exact versions, and the
verification reference.

It is built by **explicit assignment, never a spread**, so a field added to the
portfolio entry cannot leak into an export by accident. A test proves this by
smuggling `holderName` and `evidenceIds` into an entry and asserting neither
survives.

---

## 5. Source-of-truth boundaries

CERT-007 owns **nothing authoritative** — only the export representation and
its format version.

* Lifecycle status: CERT-004's resolver, reached through CERT-006. The service
  contains no status literal and calls no resolver.
* Pinned competency provenance: CERT-003.
* Definition detail: CERT-001.
* Public verification: CERT-005 — the export carries the reference and verifies
  nothing itself.

The service issues **no query and no write at all**: no `.from(`, `.select(`,
`.insert(`, `.update(`, `.delete(` or `.rpc(`. The verifier enforces each.

---

## 6. Current validity fails closed

`isCurrentlyValidForExport` returns true only for `active`. A superseded,
expired, revoked or corrected certificate is exported with its real status and
`currentlyValid: false`, and the readable file writes the status out in words.

Because the export is composed on demand, a certificate revoked after an
earlier export can never read as currently valid in a later one.

---

## 7. Privacy

`CERTIFICATE_EXPORT_FORBIDDEN_FIELDS` is held as data — 21 fields including the
certificate id, every identity field, evidence ids and snapshots, scores,
attempt and lab session ids, correction history, and `shareUrl`/`shareToken`.
Tests assert the projection and the share payload against that list directly
rather than restating it.

No student name. No `user_profiles` read, consistent with the CERT-005 ruling.

---

## 8. Sharing is designed, not built

`CertificateSharePayload` and `toCertificateSharePayload` define the minimal
shape a future share link would carry, so sharing can arrive without a schema
redesign. **Nothing resolves it**: the verifier fails the build if the builder
is referenced by the service, the router, the panel or the web service, and
fails if any share token, share link or `randomBytes` appears in the path.

No public route, no anonymous access, no RLS change, no new token surface.

---

## 9. Frontend

`CertificateExportPanel` mounts inside the Certificates workspace and receives
the portfolio's current filters, so "export what I am looking at" is honest.

The student presses **Prepare my certificates**, sees exactly what the file
contains — a plain-language contents list and a real table of the included
certificates with status and reference — chooses JSON or Markdown from a
labelled native `<select>`, then presses **Save my certificates**.

The only browser-specific step is three lines: `Blob` → `createObjectURL` →
`<a download>`. Every decision it needs (file name, media type, contents) comes
from `buildCertificateExportDownload` in the shared pure module and is unit
tested. The file name is derived from the date and format only, so it can never
leak a certificate title.

Accessibility: semantic headings and lists, a table with caption and column
scopes, a labelled native select, `aria-live="polite"` for the outcome,
`role="alert"` for failure, readable status text, no colour-only signal, no
custom controls.

---

## 10. Guardrail changes

Four narrow evolutions, each negative-tested:

1. **Duplicate-model glob** — `certificate-export.*` added to the approved
   module list, and the redeclaration protection **extended** to cover it, so
   the guard is stronger than before.
2. **Student route allowlist** — five → six, by exact `case` literal.
3. **CERT-001 privileged-authoring allowlist** (`certificate-admin.test.ts`) —
   `/certificates/export` added as an approved student write.
4. **CERT-006 export-control guard** — previously "the portfolio view may
   contain no export/share/download wording". Now the exact token
   `CertificateExportPanel` is stripped before the scan, and two checks were
   **added**: the panel must be mounted, and the portfolio view must contain no
   `createObjectURL`, `new Blob` or `.download =`. The prior invariant is
   preserved and the guard is strictly stronger.

Point 4 matters: the mount would have survived the original check untouched,
because `CertificateExportPanel` contains no word-bounded "export". Relying on
that accident would have left the guardrail silently decorative.

**Unchanged:** CERT-002/003/004/005 service scope guards, the eligibility
view's "Download certificate" prohibition, and `verify-wave7.sh:875` (a
different engine).

---

## 11. Tests

`packages/shared-types/src/certificate-export.test.ts` — **43 cases**:
field-exact projection, no forbidden field, no leak from a smuggled entry, every
lifecycle status carried through, fail-closed validity for all four non-active
states, counts, partial failure, determinism, non-mutation, both formats, JSON
round-trip, Markdown structure, the readable file naming a revoked status, file
naming that cannot leak a title, the download bundle, and the share payload's
exact shape.

`services/api/src/certificate-export.test.ts` — **22 cases**, of which the
**"D" block executes the real service** against a mocked client: the enriched
export, ownership scoping asserted on every `user_id` filter, a different caller
never receiving the first caller's scoping, a blank identifier refused before
any client is created, a revoked certificate exported as not currently valid,
a certificate whose definition is missing degraded to an unexportable entry, a
whole-portfolio failure raising `DEPENDENCY_UNAVAILABLE`, an empty portfolio
exporting cleanly, and no internal identifier appearing in the serialized
result. The remaining cases assert route ownership, source-of-truth boundaries
and the CERT-008/009 exclusions.

---

## 12. Accepted limitations

1. **No live PostgreSQL/RLS harness.** Ownership is proven at the query level
   through a mock, which is not the same as proving the database enforces it.
2. **No browser harness.** The three-line download glue (`Blob`,
   `createObjectURL`, `<a download>`) is the one part of this batch not covered
   by an executable test; it is asserted structurally by the verifier instead.
   Everything it depends on is unit tested.
3. **No PDF and no branded artifact.** Deferred to CERT-009 per ruling B.
4. **No live share link.** Designed only, per ruling D.

---

## 13. Boundaries held

No migration · no schema change · no new dependency · no public or anonymous
route · no RLS change · no service-role expansion · no CERT-008 lifecycle
control · no CERT-009 branding · no holder identity · no AI · DEC-029–035
untouched.
