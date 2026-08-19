# Build Wave 8 — Batch 9

## Certificate Revocation and Correction (CERT-008)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `550a58c` — CERT-007 Certificate Export and Sharing

---

## 1. Purpose

A controlled, auditable way to revoke, correct, supersede or restore a
certificate — with a mandatory reason, a named actor, and history that is never
rewritten. Silent deletion would undermine trust, so nothing is ever deleted.

---

## 2. The authority question, settled

CERT-008 was approved on one condition: **CERT-004 remains the sole lifecycle
authority.** That is the organising decision of this batch.

| Concern | Owner |
|---|---|
| States, permitted edges, transition validation | **CERT-004** |
| Append-only lifecycle history, contiguity, serialization | **CERT-004** |
| Effective status at read time | **CERT-004** |
| Which action was taken, why, by whom, with what replacement | **CERT-008** |
| Idempotency of a retried correction | **CERT-008** |

CERT-008 contains **no second state machine**. `certificateCorrectionTarget
Status` maps a CERT-008 action name to the CERT-004 status it drives — a naming
translation, not a rule. Whether the certificate may actually move there is
decided by CERT-004's database guard, which raises and rolls the whole
correction back if the edge is not permitted.

A test proves this rather than asserting it: the mapping is checked against
CERT-004's own `isValidCertificateLifecycleTransition`, including a case where
CERT-008 names `active` for a restore but CERT-004 forbids the edge from
`expired` — and CERT-008 does not make it legal.

---

## 3. Schema

One new migration, `20260813001000_certificate_correction_foundation.sql`,
authored but **not executed**.

`public.certificate_correction_events` mirrors `evidence_correction_events`
(EVID-006, the dependency CERT-008 §7 names): sequence number, action, mandatory
`reason` (8–500 characters, enforced by a database check), `actor_id`,
`actor_role`, previous/new status, `replacement_certificate_id`,
`idempotency_key`.

Two columns are CERT-008-specific:

* `lifecycle_event_id ... not null unique` — the CERT-004 event this correction
  produced. One correction drives exactly one transition, and no transition can
  be claimed twice.
* previous/new status are **copied from what CERT-004 recorded**, so the
  workflow row shows what actually happened rather than what was intended.

**CERT-004 is untouched.** No column was added to `certificate_lifecycle_events`,
no change to `certificate_record_lifecycle_event`'s three-argument signature, no
overload, no grant change, no edge change. A test asserts the CERT-004 migration
still contains its exact revoke statement and still contains none of `reason`,
`actor_id` or `replacement_certificate`.

---

## 4. The privileged RPC

`public.certificate_apply_correction(...)` — `security definer`, fixed
`search_path`, execute revoked from `public, anon, authenticated`, matching the
convention of `certificate_issue` and `certificate_record_lifecycle_event`.

It exists for one reason: **atomicity**. The workflow fact and the lifecycle
transition must land in one transaction, so a correction can never exist without
its lifecycle event and CERT-008 can never drive a transition without a reason.

What it decides: action is known, reason is present, replacement semantics hold,
and a repeated idempotency key returns the original correction instead of
recording a second one.

What it does **not** decide: transition legality. It calls
`public.certificate_record_lifecycle_event` and lets CERT-004 accept or refuse.

It locks the certificate `for update` before the idempotency check, so a retried
request cannot race another and produce two corrections.

---

## 5. Authorization

Two privileged routes, both behind the existing `founder()` helper:

```
POST /admin/certificates/:certificateId/corrections
GET  /admin/certificates/:certificateId/corrections
```

The acting administrator comes from the verified admin identity, never from the
request body — asserted by test. There is **no student-facing revoke, correct,
supersede or restore route**, and the verifier fails the build if one appears.

Students get RLS `select` on their **own** correction history only; no insert,
update or delete policy exists for any client role. That mirrors EVID-006 and
satisfies CERT-008 §3's promise that a student understands why their certificate
changed.

---

## 6. Downstream propagation — none written

CERT-008 adds **no propagation code**, no propagation flag and no cached status.
CERT-005 verification, CERT-006 portfolio and CERT-007 export all resolve
effective status from CERT-004 at read time, so a correction is visible
everywhere the moment its lifecycle event exists.

This is proven executably, not argued: block **H** revokes a certificate through
a lifecycle event and then asserts the CERT-006 portfolio reports `revoked` and
the CERT-007 export reports `currentlyValid: false` with `currentlyValidCount`
of zero — without CERT-008 telling either of them anything.

---

## 7. Nothing is deleted, nothing is hidden

* No delete action exists; `isCertificateCorrectionAction("delete")` is false.
* Correction history is append-only by trigger, in both directions.
* The service contains no `.delete(` or `.update(`.
* The original issuance record is never touched.
* The student is given a plain-language explanation of every action, and a
  revoked certificate reads "no longer valid" — asserted by test.

---

## 8. Audit

Every correction writes `certificate.correction.applied` naming the actor, the
certificate and the action. The **reason text is deliberately not copied into
the audit metadata** — the audit record points at the correction, it does not
become a second copy of it. A test asserts the audit block contains no reason.

---

## 9. Guardrail changes

| Guard | Change | Still protects |
|---|---|---|
| Duplicate-model glob | `certificate-correction.*` added to the approved list; redeclaration protection **extended** to it | Any other certificate module is still a failure |
| Certificate migration count (×3 sites: CERT-005, CERT-006, CERT-007) | Bare count of `3` → **exact filename set** of four | **Stricter than before** — a count is satisfied by any three files; the set is satisfied by exactly these four. CERT-005/006/007 still cannot add one |
| Privileged route count (×2 sites) | 9 → 11 | Every privileged certificate route still resolves `founder(request)`, and guards still equal returns |
| CERT-007 section | **New check added** — correction workflow must not leak into export | — |
| **CERT-004 workflow-concept guard** | **Unchanged** | `reason`, `actor_id`, `replacement_certificate`, `notification`, `notify` are still forbidden in the CERT-004 migration |

No guard was removed, and no wildcard or broad exemption was introduced.

---

## 10. Tests

`packages/shared-types/src/certificate-correction.test.ts` — **29 cases**:
the four approved actions and no deletion action, action-to-status mapping
checked against CERT-004's own rule, mandatory-reason validation at every
boundary, replacement semantics including self-replacement, the student
projection carrying no actor and no forbidden field, explanation wording, and
history ordering.

`services/api/src/certificate-correction.test.ts` — **42 cases** across nine
blocks: CERT-004 authority preserved, privileged authorization, append-only
history, mandatory reason, executable correction behaviour (including CERT-004's
refusal surfacing as a conflict and infrastructure failure staying retryable),
audit, no duplicated propagation, **downstream propagation proven**, and the
history read scoped to one certificate.

---

## 11. Accepted limitations

1. **The migration is authored, not executed.** No database was touched. The
   triggers, constraints, RLS policy and RPC are verified by static inspection
   and by tests that read the migration file — not by running them.
2. **No live PostgreSQL harness**, so real transactional rollback, real
   concurrency serialization and real RLS isolation remain unproven.
3. **No admin UI.** CERT-008 delivers the privileged API and the model; no
   frontend surface was built in this batch.
4. **Student notification hook not built.** CERT-008 §5 lists it; no notification
   subsystem exists in this repository to hook into.

---

## 12. Boundaries held

CERT-004 untouched · no second lifecycle authority · no student mutation route ·
no anonymous or public access · no service-role expansion · no deletion path ·
no cached status · no AI in the correction path · no new dependency ·
CERT-005/006/007 behaviour unchanged · DEC-029–039 untouched.
