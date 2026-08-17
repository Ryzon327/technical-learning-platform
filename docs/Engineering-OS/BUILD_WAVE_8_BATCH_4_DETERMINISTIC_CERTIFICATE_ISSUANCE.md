# BUILD — Wave 8 / Batch 4

## Deterministic Certificate Issuance (CERT-003)

**Status:** implemented
**Scope:** issuance only. No lifecycle, no expiration, no revocation, no
verification behaviour, no portfolio, no sharing, no rendering, no notification
delivery.

---

## 1. Purpose

CERT-002 answers *"does this student meet the requirements?"* CERT-003 turns
that into an authoritative, evidence-backed Certificate Record — created once,
server-side, only after the server re-confirms eligibility itself.

Eligibility and issuance remain different facts. `eligible` never means
"issued".

---

## 2. Issuance sequence (CERT-003 §8)

```
POST /certificates/issuance
  → trusted identity resolved (subject is never client-supplied)
  → exact (stableId, version) normalised; "latest" refused
  → definition id resolved
  → EXISTING CERTIFICATE LOOKUP  ← idempotent replay exits here
  → CERT-002 re-evaluated  (getStudentCertificateEligibility)
  → decideCertificateIssuance: published, not superseded, status === eligible
  → snapshot assembled from the evaluation
  → evidence pins read
  → certificate_issue RPC   ← one transaction
        confirm definition (locked, published, not superseded)
        confirm no existing record
        confirm every pinned Evidence row is unchanged
        confirm snapshots reference only pinned Evidence
        insert certificate + competency snapshots + evidence snapshots
  → writeAuditEvent("certificate.issued")
  → 201 { certificate, alreadyIssued: false }
```

---

## 3. Certificate Record

`public.certificates` — exactly the CERT-003 fields:

| Column | Notes |
| --- | --- |
| `id` | uuid PK |
| `user_id` | FK `auth.users`, cascade delete |
| `certificate_definition_id` | FK `certificate_definitions`, **`on delete restrict`** |
| `certificate_definition_stable_id` | denormalised, trigger-pinned |
| `certificate_definition_version` | denormalised, trigger-pinned |
| `verification_id` | unique, `^cert1_[a-f0-9]{48}$` |
| `issued_at`, `created_at` | timestamps |

`unique (user_id, certificate_definition_id)` — one certificate per student per
exact definition version.

**Absent by design:** lifecycle status, `expires_at`, `revoked_at`, certificate
supersession, presentation metadata. CERT-004 owns the record's lifecycle;
CERT-008 owns revocation. CERT-001's `expirationMonths` is **not read** by
CERT-003.

---

## 4. The RPC: confirmation, not evaluation

`public.certificate_issue(...)` — `security definer`, fixed `search_path`,
`revoke all … from public, anon, authenticated`.

TypeScript determines **why** the student is eligible. SQL confirms the exact
relied-upon inputs have **not changed**, then writes the historical record. The
RPC never replays the Wave 7 correction resolver, derives an Evidence outcome,
counts Evidence against a policy, evaluates competency satisfaction, searches
for replacement Evidence, or selects another version.

### Why each pinned input is necessary

| Pin | Why it cannot be dropped, and why it is not a re-implementation |
| --- | --- |
| `pin_states` | The base `evidence_records.state` is the **replay origin** of `resolveEffectiveEvidenceState`. Reading it and asserting a literal would encode Wave 7 semantics in SQL; comparing it to the observed value detects drift without interpreting it. |
| `pin_correction_counts` | A correction appended after evaluation can invalidate, supersede or open a review. Comparing the count detects **any** append to the append-only history without replaying it. This is the minimum safe change-detector. |
| `pin_result_states` | `metadata.resultState` is the input to Wave 7 outcome derivation. SQL cannot judge "positive" without reimplementing `deriveEvidenceOutcome`, so the observed value is compared instead. |
| `pin_integrity_states` | `integrity_state` is a qualification precondition. Comparing rather than asserting `'verified'` keeps that rule in Wave 7 where it belongs. |

**Deliberately not pinned:** definition publication state and supersession.
CERT-003 requires the **current** state to be published and not superseded, so
the authoritative current row is read directly inside the transaction. Passing
an observed value would have been redundant.

Every Evidence check is a pure equality comparison. **Fail-closed:** any drift
aborts the whole transaction, and the application may then run a fresh CERT-002
evaluation.

---

## 5. Idempotency

`unique (user_id, certificate_definition_id)`, enforced three ways:

1. the service looks up an existing certificate **before** any evaluation;
2. the RPC re-checks inside the transaction and returns the existing id;
3. the unique constraint is the final backstop, and a `23505` race re-reads and
   returns the winner.

**The existence check precedes re-evaluation deliberately.** An issued
certificate is historical truth: a later Evidence correction must never stop a
student from retrieving a certificate they already hold.

| Case | HTTP | `alreadyIssued` | Audit event |
| --- | --- | --- | --- |
| First issuance | 201 | `false` | yes |
| Replay | 200 | `true` | **no** |
| Lost race | 200 | `true` | no |

---

## 6. Snapshots — references, not copied truth

`certificate_competency_snapshots` pins `competencyStableId` + exact
`competencyVersion`. `certificate_evidence_snapshots` pins `evidence_id` (FK,
`on delete restrict`) together with the competency version it satisfied.

Only requirements that were both `required` and `satisfied` are pinned — those
are what actually justified the certificate.

**Nothing is copied:** no evidence content, digest, outcome, effective state,
correction history, provider payload or presentation data. Wave 7 remains the
single source of Evidence truth, and the snapshot never claims those references
stay valid forever. It answers one question: *what exact definition version and
what exact qualifying references justified this issuance?*

---

## 7. Historical truth

An issued record states what was true **at issuance time**. CERT-003 never
re-evaluates one. After issuance: definition supersession, publication of
another version, title changes, Evidence corrections and changes in current
eligibility all leave the record exactly as issued.

Enforced at the database — `guard_certificate_immutable` rejects every UPDATE
to `certificates`, and the snapshot tables are frozen the same way. Later
lifecycle reactions belong to CERT-004 and CERT-008, which will add their own
columns and transitions.

---

## 8. Authorization and security

Subject is always `trusted.identity.userId`. The request body carries only
`stableId` and `version` — no identity, no eligibility claim, no evidence
reference. Writes go through the privileged RPC via the server-authoritative
client. RLS grants students `SELECT` on their own records only; **no student
INSERT/UPDATE/DELETE policy exists** on any of the three tables, and no `anon`
or `public` grant.

| Threat | Protection |
| --- | --- |
| Issuing to another student | trusted identity only; verifier rejects `body.userId`/`studentId` |
| Client-forged eligibility | CERT-002 re-run server-side; no eligibility field accepted |
| Unpublished / superseded definition | refused in TS **and** re-confirmed in-transaction |
| Ineligible / unknown | only `status === "eligible"` proceeds; unknown refused distinctly |
| Duplicate + concurrent requests | pre-check, in-RPC check, unique constraint, `23505` recovery |
| Direct database writes | no student write policy; RPC execute revoked |
| Bypassing the evaluator | verifier asserts the CERT-002 call and gate |
| Version substitution | exact FK + pin trigger; no ordering, no "latest" |
| Forged Evidence references | snapshots must reference only pinned Evidence, and pins are server-derived |
| Partial writes | record and both snapshots in one transaction |
| Retry after network failure | idempotent replay returns the same record |
| Identifier enumeration | opaque `cert1_` + 24 random bytes |

---

## 9. Student experience

One control in the existing eligibility view, shown **only** when the
authoritative displayed status is `eligible`:

- **"Request this certificate"** — a request, never a claim that the client
  issues anything. The view states that the platform checks requirements again.
- Disabled while in flight, labelled "Requesting…".
- Success announced in the **existing single** `aria-live="polite"` region:
  *"Certificate issued: {title}"*, or on replay *"Already issued: {title}. You
  requested this before, so no new certificate was created."*
- Refusals use the existing `role="alert"` convention with calm, blame-free
  wording per reason.
- A previous issuance message is cleared when the selection changes.

Not added: lifecycle UI, management, download, PDF, sharing, verification,
portfolio, branding, revocation, correction.

`ApiRequestError` gained a `details` passthrough so a machine-readable refusal
reason reaches the UI without matching on human-readable message text. The API
client still interprets nothing.

---

## 10. Tests

`packages/shared-types/src/certificate-issuance.test.ts` — **23 behavioural
cases**: the issuance gate (eligible / ineligible / unknown, each distinct);
unpublished and superseded refusals; issuability checked before eligibility;
supersession never inferred from version numbers; verification-id format;
snapshot assembly including optional-requirement exclusion, distinct evidence
pinning, deterministic ordering and the absence of copied Evidence content; the
record model exposing only CERT-003 fields.

`services/api/src/certificate-issuance.test.ts` — **40 structural cases**:
authorization, exactly three student certificate routes, eligibility
re-evaluation, no re-implemented qualification rule, idempotency ordering,
RPC confirm-before-insert proven by line position, RLS, immutability triggers,
snapshot purity, and CERT-004+ absence.

**Not proven by execution.** Transaction rollback and true concurrent issuance
are verified **structurally only**. This repository has no live PostgreSQL
harness — every wave to date validates migrations by static inspection. CERT-003
§15 asks for tests covering duplicate and concurrent issuance; the duplicate
path is covered structurally and by the constraint, and **concurrency is not
runtime-proven**. A live database integration-test harness is recorded as a
candidate future work item and was not built here.

---

## 11. Verifier

`scripts/verify-wave8.sh` was **extended**. All CERT-001, CERT-002 backend and
CERT-002 UI checks, and the Wave 7 Evidence Engine completion gate, are
preserved.

Five sections added (28–32): one issuance migration with student read-only RLS;
eligibility re-evaluated through CERT-002; the RPC confirming before creating,
with the published, supersession, drift and lock checks all proven to precede
the insert by line position; idempotency ordering and trusted-identity
targeting; and CERT-004+ absence.

### Checks narrowed, each scoped exactly

1. **Student route allowlist** — now exactly `/certificates/definitions`,
   `/certificates/eligibility`, `/certificates/issuance`, by explicit `case`.
   No wildcard.
2. **UI POST prohibition** — PATCH/PUT/DELETE remain prohibited outright. POST
   is permitted **at most once**, and only when its destination is
   `/certificates/issuance`.
3. **Forbidden client endpoints** — the pattern gained a terminating quote so
   `/certificates/issuance` is not mistaken for `/certificates/issue`.
   `/certificates/issue`, `/claim`, `/verify` and `/verify/` remain forbidden,
   and the approved wording is now positively asserted.
4. **Duplicate-model glob** — `certificate-issuance.ts` excluded, with the
   "declared outside certificate-definition.ts" check extended to cover it.
5. **Migration counts** — the CERT-001 check is now scoped to
   `*certificate_definition*.sql` and the CERT-002 check to
   `*eligibility*.sql`, rather than counting every certificate migration. Both
   still assert exactly what they were written to protect.

`scripts/smoke-api.sh` gains seven assertions: issuance returns 401
unauthenticated; GET/PATCH/DELETE on it fall through to 404; and
`/certificates/issue`, `/certificates/claim` and `/certificates/verify/:id`
remain 404.

---

## 12. Accepted limitations

1. **No live PostgreSQL harness.** Transaction rollback and concurrent issuance
   are structurally verified, not runtime-proven.
2. **TOCTOU — what is and is not covered.** Every Evidence record CERT-002
   reports as contributing to the successful result is pinned and confirmed
   inside the issuance transaction: the union of Evidence satisfying the
   required competencies and Evidence counted toward each Evidence policy. If
   any of those rows changed — base state, integrity state, result state, or an
   appended correction — the transaction aborts.

   The remaining window is narrow and specific: the definition row is locked
   `FOR UPDATE` and re-checked, and the pinned Evidence is compared by equality,
   but those reads happen inside the transaction while the eligibility
   evaluation itself happened just before it. A change to Evidence that did
   **not** contribute to the result cannot affect issuance, because such
   Evidence could not have changed the outcome. What is not covered is a change
   arriving between the pin read and the transaction that leaves every pinned
   value identical — which by construction means no contributing input changed.

   **An earlier draft of this document claimed "Evidence never in the snapshot
   could still change the outcome." That was wrong**, and the pin set that made
   it true has been corrected; see §14.
3. **Audit is log-only.** No audit table exists; `writeAuditEvent` writes
   structured logs, so issuance audit is not durably queryable. KERN-005's
   Definition of Done is satisfied by the existing shared schema.
4. **Notification hook deferred.** No email or messaging infrastructure exists
   in this repository. CERT-003 emits the audit event only, per ruling.
5. **`metadata.resultState` residual.** It lives in mutable evidence metadata;
   pinning it closes the gap for issuance, and no API currently edits it.

---

## 14. Pin-set completeness — defect found in review and corrected

Independent architecture review asked for proof that every Evidence record
contributing to a successful eligibility result is in the transaction-time pin
set. It was not, and the gap was real.

**Counterexample**, produced by running the real `evaluateCertificateEligibility()`
and `buildCertificateIssuanceSnapshot()`:

```
definition: competency.a v1 REQUIRED, competency.b v1 OPTIONAL
            policy: lab_validation, minimumCount 2
evidence:   E1 -> competency.a v1     E2 -> competency.b v1   (both lab_validation)

status                       : eligible
policy qualifyingCount       : 2
policy satisfyingEvidenceIds : ["E1","E2"]
pin set (before correction)  : ["E1"]        <- E2 omitted
```

**Root cause.** CERT-002 builds its policy-relevant reference set from
`pinnedKeys`, which is derived from **all** of `definition.requiredCompetencies`
— including entries marked `required: false`. Evidence linked only to an
optional competency therefore counts toward a policy's `minimumCount`. The
snapshot builder, however, walked only requirements that were `required &&
satisfied`. E2 was the reason the policy reached 2, and so the reason the
student was eligible, yet it was never pinned: an invalidation of E2 between
evaluation and issuance would have gone undetected.

**Correction.** `buildCertificateIssuanceSnapshot` now takes both
`competencyRequirements` and `evidencePolicies` and pins the **union** of the
two gates, deduplicated by Evidence id. Both lists are read from the
authoritative evaluation — CERT-002 already reported
`policy.satisfyingEvidenceIds`, so no policy arithmetic was reproduced in
CERT-003 and nothing was added to SQL. Provenance rows now also resolve
policy-contributing Evidence back to the exact competency version it was linked
to, and Evidence contributing to neither gate is still not pinned.

Seven behavioural regressions were added (J block) that drive the real evaluator
end to end, including the general invariant that the pin set equals exactly the
set of Evidence ids CERT-002 reports as contributing. The verifier additionally
fails the build if the snapshot stops consuming `evidencePolicies`, or if
`minimumCount`/`qualifyingCount` arithmetic ever appears in CERT-003.

---

## 13. Boundaries held

No lifecycle status or transitions · no expiration · no revocation or
correction · no verification route, page, QR or employer flow · no portfolio,
export, sharing, PDF, rendering or branding · no batch issuance · no external
issuers · no AI decision path · no notification delivery · no new audit
infrastructure · no student certificate listing route (`GET /certificates`
remains 404 and is asserted as such).

---

**PENDING INDEPENDENT ARCHITECTURE REVIEW**
