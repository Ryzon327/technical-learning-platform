# BUILD — Wave 7 / Batch 7

## Evidence Export and Verification Hooks (EVID-008)

**Status:** implemented
**Scope:** a privacy-safe export representation, a stable verification
identifier model, and a private student-controlled export request. Nothing is
made public.

---

## 1. Architecture

```
listStudentEvidence + effective state        Batches 1, 5
        ↓
getStudentEvidencePortfolio                  Batch 6 student-safe projection
        ↓
evidence_verification_references             Batch 7: stable opaque identifier
        ↓
services/api/src/evidence-export.ts          composition only
        ↓
POST /evidence/export                        authenticated, student scoped
        ↓
EvidenceExportPanel.tsx                      private request UI
```

The export owns no truth. It reads the Batch 6 projection rather than
`evidence_records`, so it can never expose a field the portfolio deliberately
withholds — the verifier fails the build if it touches the Evidence table or
the row mapper directly.

---

## 2. Why a separate verification reference table

EVID-008 §15 requires that "Evidence can support future verification without
schema redesign", and §8 requires a verifier to determine whether a given
identifier is valid. A future verifier can only resolve an identifier a student
exported earlier if that identifier is **stable**, which means persisted.

Batch 1 makes Evidence provenance immutable through
`guard_evidence_record_provenance()`. Adding an identifier to an existing
`evidence_records` row would require weakening that trigger, which is exactly
what must not happen. Minting at Evidence creation would instead reach back into
a completed batch's write path.

So the identifier lives beside the Evidence, in
`public.evidence_verification_references`:

| Column | Purpose |
| --- | --- |
| `evidence_id` | primary key — the logical identity, one reference per Evidence |
| `user_id` | the Evidence owner, enforced by trigger |
| `verification_id` | opaque `ev1_` + 48 hex chars, CHECK-constrained |
| `created_at` | when minted |

Nothing about Evidence content or state is stored. Effective state is never
snapshotted here — the verifier fails the build if a status column appears.

---

## 3. The identifier

`mintVerificationId()` returns `ev1_` plus 24 bytes from `randomBytes`, hex
encoded. It is derived from nothing: no evidence id, no user id, no sequence, no
timestamp, no provider identifier — so it cannot leak one. A verifier check
inspects the function body and fails if any platform identifier appears in it.

The reference is immutable once minted: a `before update` trigger raises,
because rotating an identifier would silently invalidate an export a student
already holds.

**An identifier existing is not publication.** There is no anonymous endpoint,
no public read policy, no share token and no employer lookup. RLS grants
students `SELECT` on their own references only, and the verifier rejects
`to anon`, `to public` and `using (true)`.

---

## 4. Export representation

`ExportedEvidenceItem` carries: the verification reference, source type, a
friendly source label, the outcome word, observed and issued dates, the current
verification status with readable wording, the authoritative outcome, whether it
currently demonstrates anything, and exact competency references.

It carries **no** integrity digests, source digests, provider or session
identifiers, user identifiers, actor data, correction-event mechanics, private
notes or audit data. The verifier greps for each and fails the build.

On digests specifically: EVID-008 §5 lists "integrity/reference hooks". The
opaque verification reference *is* the reference hook. Exporting a raw
`evidence_integrity_digest` would leak internal provenance a student cannot use
and a verifier does not need, so it is deliberately excluded.

### Current effective state, never a stale snapshot

`deriveVerificationStatus` maps effective state to `current` / `revoked` /
`superseded`, failing closed to `unavailable` for anything unrecognised. Because
the export is composed on demand, Evidence invalidated or superseded after an
earlier export can never read as currently valid — which is EVID-008 §15's
success metric.

### Historical competency truth

Competency references are matched on the exact pinned version through
`competencyReferenceKey`. A v5 curriculum context is not attached to a v2 link;
the export shows the version the Evidence was actually approved against.

---

## 5. Verification payload design

EVID-008 §5 asks for "privacy-safe public verification payload design" — the
design, not the endpoint. `EvidenceVerificationPayload` answers exactly the five
questions §8 lists: is the identifier valid, is it currently effective, what
competency does it support, when was it produced, was it superseded or revoked.

It carries no student identity at all — not even the source label — so
publishing it later remains a policy decision rather than a schema change.
Nothing resolves it in this batch.

---

## 6. Idempotency and failure

The logical identity is the Evidence Record, never a timestamp. A repeated
export returns the identifier that already exists; a lost insert race is
resolved by reading back, so concurrent requests converge on one identifier.

If verification references cannot be minted or read, the export is still
returned, the affected items are listed as unavailable with plain-language
wording, and **no** Evidence state is altered or claimed invalid — EVID-008 §12.
The service issues no update or delete against any table and reads no
source-engine table; the verifier enforces both.

---

## 7. Route dispatch and reserved segments

The Evidence surface exposes a single-identifier route
(`/evidence/:evidenceId`, Batch 1) alongside sibling collection routes under
the same prefix (`/evidence/portfolio`, `/evidence/export`). A single-segment
path therefore matches the identifier pattern even when the segment names a
collection route.

Without a guard, `GET /evidence/export` fell through the POST-only export
handler and matched the identifier route with `evidenceId = "export"`, reaching
the authenticated record handler and answering **401 instead of 404** — the
request looked authenticated-but-unauthorized when in fact no such route exists.

`packages/shared-types/src/evidence-routing.ts` declares `portfolio` and
`export` as reserved: they can never be an Evidence identifier, which is always
a UUID. The identifier route now skips reserved segments, so any method a
collection route does not support falls through to the standard
route-not-found response.

| Request | Result |
| --- | --- |
| `POST /evidence/export` | 401 unauthenticated — the real export route |
| `GET`/`PUT`/`PATCH`/`DELETE` `/evidence/export` | 404 route not found |
| `GET /evidence/EXPORT` | 404 — the guard is case- and padding-tolerant |
| `GET /evidence/portfolio` | 401 — unchanged |
| `POST /evidence/portfolio` | 404 — unchanged |
| `GET /evidence/:uuid` | 401 — unchanged |

Authentication on `POST /evidence/export` is untouched, and no new route was
added. The same class of collision cannot affect other method-restricted routes
here: `/evidence/portfolio` is the only other single-segment collection name and
it is now reserved too. Nested routes (`/corrections`, `/competencies`) use
two-segment patterns and never collide.

---

## 8. Student-facing request

`POST /evidence/export`, routed before `/evidence/:id`, authenticated through
`resolveTrustedRequestIdentity`, with ownership derived server-side. There is no
anonymous route, and the smoke script asserts `/verify/:id` and
`/evidence/verify/:id` return 404.

`EvidenceExportPanel.tsx` is a **separate component** from the portfolio view.
That separation is architectural — browsing and exporting are different
responsibilities — and it also keeps Batch 6's verifier boundary intact rather
than requiring it to be loosened.

Accessibility follows Option (a): semantic headings and lists, a real `<table>`
with `<caption>`, `scope="col"` and `scope="row"`, `<time dateTime>`, readable
status text rather than badges, `aria-live` for the outcome, `role="alert"` for
errors, and native keyboard-operable controls. No colour-only meaning, and no
DOM testing stack was added.

No document generation. EVID-008 requires a safe representation, not a file, so
no PDF or download subsystem exists.

---

## 9. Tests

`packages/shared-types/src/evidence-export.test.ts` — 22 cases.
`packages/shared-types/src/evidence-routing.test.ts` — 13 cases covering the
dispatch regression: `POST /evidence/export` authenticates, every other method
on that path is not found, a reserved segment never reaches the identifier
handler, casing cannot bypass the guard, and Batch 1–6 routing is unchanged.

| Case | Covered |
| --- | --- |
| C/D/S privacy-safe representation, no internal identifiers or notes | yes |
| E exact competency stable id and version, including a deliberate v2/v5 mismatch | yes |
| F/G/H current, revoked and superseded status | yes |
| I/J identifier opaque, rejecting uuids, sequences and malformed values | yes |
| R understandable source, date and status | yes |
| Verification payload answers §8's five questions and carries no identity | yes |
| Unavailable items preserved rather than hidden | yes |

A, B, K, L, M, N, O, P and Q are enforced structurally by the verifier and the
smoke script — ownership through RLS, no anonymous route, no mutation of source
truth, and authentication on the export route.

Batch 1–6 suites were re-run and remain green.

---

## 10. Verification

`scripts/verify-wave7.sh` extended, not replaced: Batch 1–6 checks are
byte-identical through line 907, with 16 Batch 7 checks appended. 109 static
checks total.

Five were confirmed against deliberate regressions, each exiting 1: adding a
public read policy, deriving the identifier from an evidence id, exposing an
integrity digest in the export, adding an anonymous `/verify/:id` route, and
removing the reserved-segment guard from the identifier route.

Two of my own new checks over-fired during development and I corrected the
checks rather than the code: the migration's own comment about
`guard_evidence_record_provenance` tripped the immutability check (now inspects
SQL with comments stripped), and `insert into public.platform_schema_version`
matched `to public` (now word-bounded).

---

## 11. Wave 7 is not closed

Batch 7 completes EVID-008 only. Per the closure boundary, a separate Wave 7
Evidence Engine completion review must verify EVID-001 through EVID-008 and the
engine exit criteria before any status or roadmap document is updated.

---

## 12. Rollback

Additive only. Removing the panel mount hides the feature; removing the route
and service removes the capability. `evidence_verification_references` may be
left in place harmlessly — it holds no Evidence content, and dropping it would
only invalidate identifiers students already hold. No Evidence, correction
history or source-engine truth was written by this batch.
