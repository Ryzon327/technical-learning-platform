# BUILD — Wave 8 / Batch 2

## Certificate Eligibility Rules (CERT-002)

**Status:** backend implemented; CERT-002 not yet complete — student eligibility UI/accessibility pending
**Scope:** eligibility evaluation only. No issuance, no certificate record, no
lifecycle, no verification, no UI, no migration.

---

## 1. Purpose

CERT-001 defined what a certificate requires. CERT-002 answers one question
deterministically:

> Does this student, right now, satisfy this exact published Certificate
> Definition version?

It evaluates. It never issues. CERT-003 owns issuance.

---

## 2. Architecture

Two layers, matching the repository's existing split:

| Layer | File | Responsibility |
| --- | --- | --- |
| Domain | `packages/shared-types/src/certificate-eligibility.ts` | Pure deterministic evaluator. No I/O, no clock, no randomness. |
| Orchestration | `services/api/src/certificate-eligibility.ts` | Loads authoritative truth, handles dependency failure, enforces ownership. |
| Transport | `services/api/src/server.ts` | One authenticated student read route. |

The evaluator is a pure function of `(definition, references, evaluatedAt)`.
The timestamp is passed in rather than read from a clock, which is what lets the
determinism tests assert byte-identical results across repeated evaluation.

---

## 3. Proof source — and what was deliberately not used

Eligibility is proven from **Wave 7 version-exact Evidence competency links**,
read through `getAuthoritativeCompetencyEvidenceReferences(userId, stableId)`.

`public.student_competency_state` is **not** read. It is
`unique (user_id, competency_stable_id)` — it stores `curriculum_version` as a
column but collapses to one row per competency stable ID, so it cannot prove
that a student demonstrated a competency **at the exact version** a Certificate
Definition pins. LEARN-003 remains an upstream conceptual dependency; the
version-exact Wave 7 truth is the authority for certificate eligibility.

Per Founder/architect ruling, no mapping rule and no latest-version fallback
was introduced.

---

## 4. Reuse boundary — no second qualifying rule

CERT-002 does **not** define what makes Evidence trustworthy or qualifying.
Wave 7 already resolves that per reference into
`AuthoritativeCompetencyEvidenceReference.qualifiesForDemonstration`, which
combines `resolveEffectiveEvidenceState`, `isEffectivelyTrustedEvidence`,
`evaluateEvidenceLinkEligibility`, `deriveEvidenceOutcome` and
`qualifiesAsDemonstrationEvidence`.

The evaluator **reads that verdict**. It never recomputes it. The verifier fails
the build if any of those four Wave 7 rules is referenced inside the
Certificate Engine service.

Consequently these all follow from Wave 7 rather than from new certificate
logic: invalidated Evidence does not qualify; superseded does not qualify;
failed assessment does not qualify; incomplete Lab does not qualify;
indeterminate/technical-error does not qualify; restored positive qualifies
again; restored negative still does not.

---

## 5. Eligibility state semantics

Three outcomes, kept distinct per CERT-002 §12 and §13:

| Status | Meaning |
| --- | --- |
| `eligible` | Every required competency and every Evidence policy is satisfied. |
| `ineligible` | Evaluation completed; at least one requirement is unmet. |
| `unknown` | Eligibility Unknown / Temporarily Unavailable — no determination was made. |

`unknownReason` distinguishes the three ways an evaluation can decline to
decide:

- **`definition_not_published`** — draft, review and retired versions are not
  evaluable for normal student eligibility. This is a statement about the
  definition, never about the student.
- **`evidence_under_unresolved_review`** — Evidence relevant to this definition
  has an open privileged review. The student is *not* ineligible; the answer is
  not yet determinable. A later evaluation decides again from current state.
- **`dependency_unavailable`** — Evidence or curriculum data could not be read.

**A dependency failure, an unresolved review, and a non-evaluable definition are
never reported as ordinary student ineligibility.** No unknown state is
persisted — a later evaluation simply recomputes.

A Certificate Definition version that does not exist at all is a genuine
`NOT_FOUND` error, not an eligibility outcome.

---

## 6. Decision order

1. Definition not published → `unknown / definition_not_published`.
2. Relevant Evidence under unresolved review → `unknown /
   evidence_under_unresolved_review`.
3. Every `required: true` competency satisfied by qualifying Evidence at the
   exact pinned version.
4. Every declarative Evidence policy satisfied.
5. `eligible` only if 3 **and** 4 hold; otherwise `ineligible`.

The requirement-by-requirement breakdown is computed even for `unknown`
results, so a student can still see what is complete and what remains
(CERT-002 §3, §14).

---

## 7. Exact-version behaviour

A requirement is satisfied only by qualifying Evidence whose
`competencyStableId` **and** `competencyVersion` both match the pin.

When the student holds qualifying Evidence for the competency's stable ID but at
a different version, the requirement still fails and is reported as
`version_not_evidenced` rather than `no_qualifying_evidence`, so the reason is
visible. Evidence at versions 1, 2, 4 and 5 never satisfies a pin on version 3 —
there is no ordering, no `.limit()`, and no fallback anywhere in the path.

The route requires an explicit positive-integer `version`. A request without one
is refused with *"'latest' is not supported"*.

---

## 8. Evidence policy behaviour

Policies are **definition-level, per Evidence source type**, matching the
CERT-001 schema `(certificate_definition_id, evidence_source_type)`. No
competency dimension was added and the CERT-001 schema was not changed.

Counting rules:

- Only references Wave 7 marked `qualifiesForDemonstration` are counted.
- Counting is scoped to Evidence linked to one of **this definition's pinned
  required competencies**, so unrelated Evidence cannot satisfy a certificate's
  policy.
- **Distinct Evidence IDs** are counted. One Evidence record linked to two
  required competencies counts once, not twice.
- `qualifyingCount >= minimumCount` satisfies the policy.
- Multiple policies combine with **AND**, as do competency requirements and
  policies (CERT-002 §8).

### `requirePositiveOutcome`

Per ruling 3, this flag may never turn fundamentally non-qualifying Evidence
into certificate proof. Counting is always restricted to Wave 7's qualifying
verdict, which already requires a positive outcome and effective trust.

**Therefore `requirePositiveOutcome: false` is operationally redundant under the
current MVP qualifying accessor.** It is preserved as a declarative CERT-001
field and reported in the result for transparency, but it does not relax the
Wave 7 gate. This is recorded deliberately rather than weakening Evidence
semantics to give the flag an effect.

---

## 9. Unresolved-review behaviour

If any reference pinned to one of the definition's required competencies has
`evidenceUnderReview === true`, the result is `unknown /
evidence_under_unresolved_review`.

Scoping matters: an open review on Evidence for an unrelated competency, or for
a *different version* of a required competency, does not block this certificate.
Both cases are covered by tests.

Note this is deliberately **stricter than competency demonstration**. Wave 7's
`isEffectivelyTrustedEvidence` is `sequenceValid && state === 'active'` and
ignores `underReview`, so Evidence under review still advances competency
mastery. A certificate is a stronger claim, so CERT-002 declines to decide while
a review is open. This is additive in CERT-002 and changes no Wave 7 behaviour.

---

## 10. Authorization boundary

One route: **`GET /certificates/eligibility?stableId=…&version=…`**, guarded by
`resolveTrustedRequestIdentity`.

The subject is always `trusted.identity.userId`. There is deliberately no
`userId` query parameter and no request body, so a client cannot ask about
another student. The verifier fails the build if
`searchParams.get("userId")`, `searchParams.get("studentId")` or `readJsonBody`
appears in the route block.

No admin eligibility endpoint exists in this batch.

The underlying Wave 7 accessor uses the service-role client with an explicit
`userId` filter, so passing the trusted identity is what enforces ownership —
which is why the route never accepts an identifier from the caller.

---

## 11. Persistence — none

No migration. No table. No stored eligibility snapshot.

Eligibility is computed on demand from current authoritative state. A stored
result would go stale the moment Evidence is corrected, which is exactly the
failure Wave 7 Batch 5 was designed to prevent by resolving effective state at
read time. CERT-003 owns issuance-time snapshots; CERT-004 owns the durable
Certificate Record.

The verifier asserts there is still exactly one certificate migration and that
no eligibility table exists.

---

## 12. Side-effect freedom

The service contains no `.insert(`, `.update(`, `.delete(`, `.upsert(` or
`.rpc(` — asserted by both the tests and the verifier. It writes no audit event
either, matching the Wave 7 read paths (`listStudentEvidence` and the portfolio
reader do not audit reads).

Evidence truth, Learning competency truth and CERT-001 requirements are all
untouched.

---

## 13. Tests

`packages/shared-types/src/certificate-eligibility.test.ts` — **42 cases**.
`services/api/src/certificate-eligibility.test.ts` — **29 cases**.

| Required coverage | Case |
| --- | --- |
| A all required competencies satisfied → eligible | A, A2, A3, A4 |
| B missing required competency → not eligible | B, B2 |
| C exact version mismatch → not eligible | C, C2, C3, C4 |
| D invalidated Evidence → not eligible | D |
| E superseded Evidence → not eligible | E |
| F failed assessment Evidence → not eligible | F |
| G incomplete Lab Evidence → not eligible | G, G2 |
| H restored positive Evidence may qualify | H |
| I restored negative Evidence does not qualify | I, I2 |
| J Evidence source-type policy enforced | J, J2 |
| K minimum Evidence count enforced | K, K2, K3 |
| L multiple policies combine (AND) | L, L2, L3 |
| M unpublished definition → no normal eligibility | M |
| N draft/review/retired behaviour | N, N2 |
| O dependency failure not misreported | O, O2, O3, O4, O5, O6 |
| P evaluation has no side effects | P, P2, P3 + C–C5 (api) |
| Q no student certificate record created | Q + E–E3 (api) |
| R no issuance function called | R + E (api) |
| S no AI authority | S + F (api) |
| T Wave 7 + CERT-001 remain green | G, G2, G3 (api) + full regression |

API-layer absence assertions strip whole-line comments and the
`@tlp/shared-types` package specifier before scanning, so they judge code rather
than prose or import paths.

---

## 14. Verification

`scripts/verify-wave8.sh` was **extended, not replaced**. All CERT-001 sections
and the Wave 7 Evidence Engine completion gate are preserved and still run
first.

Seven CERT-002 sections were added (14–20): no migration and no persisted
snapshot; side-effect freedom; canonical Wave 7 reuse with no second qualifying
rule and no version-collapsed state; exact-version matching with no
latest/newest/ordering fallback; three distinct outcomes with all three unknown
reasons; published-only student evaluation; own-user authorization with no
admin endpoint and no client-supplied subject; CERT-003…009 absence; and a check
that `apps/web` is unchanged since UI is deferred.

`scripts/smoke-api.sh` gains five assertions: the eligibility read returns 401
unauthenticated with and without parameters, POST/DELETE on it fall through to
404, and no admin eligibility endpoint exists. No existing Wave 3–8 assertion
was changed.

### One CERT-001 verifier check was narrowed

Batch 1 contained:

```bash
if grep -nE 'pathname === "/certificates?' "$SERVER" | grep -q .; then
  fail "a student certificate route exists"
fi
```

That was correct for Batch 1, which had no student certificate route. Ruling 9
approves exactly one, so this single check could not be preserved verbatim. It
was **narrowed, not removed**: the only permitted student certificate path is
`/certificates/eligibility`, and student certificate *collection*, *record* and
*definition* routes each remain an explicit failure. Every other CERT-001 check
is unchanged.

---

## 15. Deferred follow-up — accessibility and presentation

CERT-002 §10 requires eligibility **views** to use clear text, list
requirements, explain incomplete state, support screen readers, avoid
color-only status, and distinguish unavailable verification from unmet
competency.

Frontend UI was deferred by ruling 6, so **§10 is not yet met**. The API
contract was shaped to make it straightforward — the result carries a
requirement-by-requirement breakdown, an explicit `unmetReason` per requirement,
and an `unknownReason` that separates "temporarily unavailable" from "unmet" —
but no view exists.

**This is an open Feature requirement, not a closed one.** It must be scheduled
before CERT-002 can be considered complete against its own specification.

---

## 16. Boundaries held

**CERT-003 issuance.** No issuance function, no certificate id, no student
certificate record, no idempotency key.

**CERT-004 lifecycle.** No lifecycle state, no expiration timestamp. CERT-001's
`expirationMonths` is not read by CERT-002 at all — it is an issuance-time and
lifecycle concern.

**CERT-005 verification.** No verification identifier, no endpoint.

**CERT-006/007/009.** No portfolio, export, sharing or rendering.

**Wave 7 Evidence Engine.** Read-only consumption through the existing
authoritative accessor. No Evidence table, correction event or verification
reference is written.

**LEARN-003.** Not modified and not read.

**CERT-001.** Not modified. Requirements are loaded through the existing
canonical reader.

---

## 17. Batch 3 dependency

CERT-003 builds on `getStudentCertificateEligibility` for its issuance-time
re-check, and on the `CertificateEligibilityResult` breakdown for the
competency/Evidence snapshot references CERT-003 §5 requires. Nothing in Batch 2
needs reshaping for that — CERT-003 adds a writer around this evaluator rather
than changing it.

---

**PENDING INDEPENDENT ARCHITECTURE REVIEW**
