# BUILD — Wave 8 / Batch 6

## Certificate Verification (CERT-005)

**Status:** implemented
**Scope:** public verification only. No portfolio, export, sharing, PDF, QR,
branding, revocation workflow or holder identity.

---

## 1. Purpose

An employer holding a certificate reference can confirm the platform issued it
and see its current lifecycle state — without learning who the student is, what
evidence they produced, or anything about platform internals.

This is the platform's **only public data surface**.

---

## 2. Public route

`GET /certificates/verify/:verificationId` — deliberately unauthenticated.

| Case | Status | Meaning |
| --- | --- | --- |
| Verified | 200 | certificate exists; accurate lifecycle state returned |
| Malformed reference | 400 | rejected before any database lookup |
| Unknown reference | 404 | well-formed but no such certificate |
| Dependency or replay failure | 503 | temporarily unavailable |

Per CERT-005 §12, a dependency failure or an incoherent lifecycle history is
**never** reported as invalid or not-found. A genuine certificate is never
called into question because infrastructure faltered.

The capability is exactly one exact opaque reference in, one curated result
out. No search, no listing, no prefix lookup, no user lookup.

---

## 3. Public payload

```
certificateTitle
issuer
certificateDefinitionStableId
certificateDefinitionVersion
issuedAt
status                  active | expired | revoked | superseded | corrected
statusEffectiveAt
expiresAt?              only when pinned at issuance
competencySummary[]     { title, version }
verifiedAt
```

**Absent by construction:** holder identity of any kind (no display name, no
email, no user id, no masked form), the internal certificate UUID, the
verification reference itself, the definition UUID, and every Evidence
concept — ids, source references, outcomes, scores, attempts, lab or session
identifiers, correction history, competency database ids.

`buildCertificateVerificationRecord` names every output field explicitly and
spreads nothing, so a column added to any source table later cannot leak into
the public payload.

---

## 4. Holder identity — deliberately absent

CERT-005 §5 permits "student display identity **as policy allows**". No such
policy exists in this repository, and `public.certificates` holds no holder
name — only `user_id`. Producing one would have meant a service-role read of
the private `user_profiles` table.

Per ruling 1, CERT-005 exposes **no holder identity**, does not query
`user_profiles`, and never selects `user_id`. There is no code path from a
verification reference to a learner's identity.

A future public holder name should be an approved display value snapshotted as
credential truth at issuance. That is not CERT-005.

---

## 5. Lifecycle truth

CERT-004's `resolveEffectiveCertificateStatus` is reused unchanged. CERT-005
derives nothing: it reads the immutable issuance record, the expiry pinned at
issuance, and the append-only history, then reports the actual state.

Status is **never collapsed into `valid: true/false`**. An expired, revoked,
superseded or corrected certificate is still an authentic issued record, and
the wording says so — for example, revoked reads *"This certificate was issued
but has since been revoked, and should not be relied upon."*

When the replay fails closed (`sequenceValid === false`), or a recorded status
is unrecognised, the result is `unavailable`.

Per ruling 10, verification may **display** the corrected and superseded states
CERT-004 can represent, but creates no replacement-certificate reference and no
CERT-008 workflow.

---

## 6. Verification reference security

Unchanged from CERT-003: `cert1_` + `randomBytes(24)` → `^cert1_[a-f0-9]{48}$`,
**192 bits** of randomness, non-sequential, unique by database constraint.

- **Exact equality lookup only.** No `like`, `ilike`, `filter`, `order`,
  `range`, `textSearch` or `limit` appears in the service — asserted by test
  and verifier.
- **Format validated before any query**, so a malformed or probing reference
  never becomes a database round trip. Verified by line position.
- **Never logged.** The service contains no `writeAuditEvent` and no
  `console.log`.
- **Not redesigned** — there was no evidence of a problem.

---

## 7. Data access

A narrow **privileged server-side read**, not a public RLS policy. No `to anon`
or `to public` policy exists anywhere in this repository; adding one would
expose whole row shapes and require a view or column privileges to stay safe.
The verifier asserts no such policy exists in any certificate migration.

The service reads only what the curated payload needs: the certificate row, the
definition's title and issuer, the lifecycle history, and competency titles at
their pinned versions. It is read-only — no `insert`, `update`, `delete`,
`upsert` or `rpc`.

**No migration.** `verification_id` already existed, unique and constrained.

---

## 8. Public page

`/verify/:reference` renders `CertificateVerificationView`, checked in `App.tsx`
**before every auth branch including the loading state**, so a verifier
following a link never sees a sign-in prompt or waits on session resolution. It
activates only for that explicit path.

Accessibility: one `<h1>` with nested `<h2>`/`<h3>`, a real `<ul>` for the
competency summary, a single `aria-live="polite"` region, status rendered as
text via `describeVerifiedStatus`, no colour-carrying class, no inline styles,
native elements only. Malformed, not-found and unavailable each have distinct
calm wording.

Not added: QR, PDF, download, share, portfolio, branding, employer profile,
public student profile.

---

## 9. Guardrail narrowings

### Wave 7 — approved under ruling 9

**Old check** (`verify-wave7.sh`):

```bash
if grep -nE '"/verify|/verification/|publicVerification|anonymousVerification' services/api/src/server.ts; then
  echo "FAIL: no anonymous or public verification route may exist in Batch 7"; exit 1
fi
```

It scanned all of `server.ts`, so any certificate verification route tripped a
Wave 7 check.

**New scope:** anonymous/public **Evidence** verification remains forbidden by
name (`/evidence/verify`, `/verify/evidence`, `/evidence/verification/`,
`publicVerification`, `anonymousVerification`); a **bare top-level `/verify`**
route remains forbidden separately; and a new check forbids the certificate
verification service from reading `evidence_verification_references`.

**Why this is safe:** the Batch 7 invariant was that EVID-008 minted a
verification hook *without exposing Evidence publicly*. Certificate
verification does not weaken it — it reads no Evidence table and returns no
Evidence field, asserted independently by
`services/api/src/certificate-verification.test.ts`.

**Negative-test result** — all three bite:

| Injection | Result |
| --- | --- |
| anonymous `/evidence/verify` route | FAIL: no anonymous or public Evidence verification route may exist in Batch 7 |
| bare top-level `/verify` route | FAIL: no top-level anonymous verification route may exist |
| `publicVerification` symbol | FAIL: no anonymous or public Evidence verification route may exist in Batch 7 |

### Wave 8 — four narrowings

1. **CERT-001 section** — the blanket "a certificate verification route exists;
   CERT-005 is not in scope" is replaced by: a bare `/verify` route still
   fails, and at most **one** certificate verification route may exist.
2. **CERT-002 UI section** — unchanged prohibition, plus a **new** check that
   the eligibility UI must not call `certificates/verify/`. CERT-005 has its
   own separate pre-auth view.
3. **CERT-003 section** — scoped from all of `server.ts` to the **issuance
   service**, which must still contain no verification.
4. **Duplicate-model glob** — `certificate-verification.*` excluded, with the
   "declared outside certificate-definition.ts" check extended to it.

### Tests

`certificate-admin.test.ts` **B** and **H5** were narrowed: B now permits at
most one non-admin path-parameter certificate route and requires it to be the
verification path; H5 requires exactly one verification route and requires it
to be the certificate one. Certificate **record** routes remain forbidden.

---

## 10. Tests

`packages/shared-types/src/certificate-verification.test.ts` — **24 cases**:
reference format including prefix and wildcard rejection; the payload's exact
field set; absence of holder identity, internal ids and Evidence, driven by the
shared forbidden-field list; a deliberate extra source field proven not to
leak; competency summary limited to title and version; every lifecycle status
representable and never collapsed to a boolean; the four outcomes distinct;
`unavailable` never reading as invalid; `not_found` leaking nothing about why;
determinism.

`services/api/src/certificate-verification.test.ts` — **31 cases**: the route
unauthenticated, GET-only, no query parameters, correct status mapping; exact
equality with no pattern lookup; format validated before the query by line
position; `user_id`/`user_profiles`/`email` unreachable; no Evidence table
touched; the internal id never reaching the builder; resolver reuse with no
reimplementation; read-only; no public RLS policy in any certificate migration;
reference never logged; no CERT-006+ behaviour; CERT-003's identifier
unchanged; credential-kind agnostic.

**Not runtime-proven:** enumeration resistance under real traffic, and the RLS
behaviour of the privileged read. Both need a live database, which this
repository does not have. Entropy is provable by inspection; behaviour under
load is not.

---

## 11. Accepted limitations

1. **No rate limiting.** CERT-005 §9 says "support abuse/rate limiting
   **later**". Per ruling 8 none is built. Public verification currently relies
   on 192-bit opaque references, strict format validation, exact-equality
   lookup, no search or listing, and a minimal response. The design stays
   compatible with a future limiter.
2. **No live database harness**, so enumeration resistance and privileged-read
   RLS behaviour are structurally verified only.
3. **No holder identity**, by ruling — verification confirms the credential,
   not the person.
4. The smoke environment has no database, so a well-formed reference there
   returns **503 unavailable**. That is the correct fail-closed behaviour and
   is asserted as such.

---

## 12. Boundaries held

CERT-006 portfolio · CERT-007 export/sharing/PDF · CERT-008
revoke/correct/supersede/restore and replacement references · CERT-009
branding/logos/QR — none implemented. DEC-029 to DEC-035 untouched: no
`certificateKind`, no `course_completion` Evidence, no Learning completion
recorder, no CERT-001 publication-rule change. §15c legacy assurance audit not
run.

---

**PENDING INDEPENDENT ARCHITECTURE REVIEW**
