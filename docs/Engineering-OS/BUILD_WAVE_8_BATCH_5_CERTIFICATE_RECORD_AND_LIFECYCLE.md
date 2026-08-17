# BUILD — Wave 8 / Batch 5

## Certificate Record and Lifecycle (CERT-004)

**Status:** in progress — architecture approved, implementation underway
**Scope:** lifecycle machinery only. No revoke/correct/supersede/restore
workflow, no public verification, no portfolio, no export, no branding.

---

## 1. Approved rulings this batch implements

| Ruling | Decision |
| --- | --- |
| **Q1 states** | `active`, `superseded`, `expired`, `revoked`, `corrected` |
| **Q1 edges** | `active→superseded`, `active→revoked`, `active→corrected`, `active→expired`, and `revoked→active` so the model can represent CERT-008 restore. `expired`/`superseded`/`corrected` otherwise terminal. No other states or edges. |
| **Q1 ownership** | CERT-004 owns the state model, append-only history, resolver, transition validation and historical-truth guarantees. **CERT-008 owns the revoke/correct/supersede/restore workflows** — none are exposed here. |
| **Q2 expiration** | `expires_at` is **permanently pinned at issuance** as `issued_at + issuance-time expirationMonths`. A later definition change never moves an issued certificate's expiry. Effective expiration is derived using trusted server time. No scheduler, and no synthetic scheduled events. |
| **Q3 cached status** | **Rejected.** No mutable `current_status` column. Effective status is derived from the immutable issuance record + pinned `expires_at` + append-only history, using the Wave 7 fail-closed replay pattern. |
| **Q4 CERT-008 fields** | No `reason`, `actor_id`, `replacement_certificate_id`, notification data or workflow metadata. CERT-008 adds them when it needs them. |
| **Q5 student read** | Exactly one additional authenticated student read for a learner's **own** records and effective status. Identity from trusted authentication only. Route allowlist narrows from three to four. No public lookup. |
| **Q6 presentation** | Nothing added. The existing certificate → definition relationship is the reference. CERT-009 owns branding. |

**Also binding:** no student lifecycle controls · no public verification ·
no sharing/export/PDF · no portfolio behaviour beyond the approved own-record
read · CERT-003's certificate row and issuance snapshots stay historically
immutable · the CERT-003 pin-completeness invariant stays untouched.

---

## 2. Why expiration must be pinned rather than derived

CERT-001 freezes material fields — including `expirationMonths` — only while a
definition is `published`. `guard_certificate_definition_material_freeze` gates
on `old.publication_state = 'published'`, so once a definition is retired the
material freeze no longer applies and `expirationMonths` becomes editable again.

Deriving expiry at read time from the pinned definition version would therefore
let a post-retirement edit silently move the expiry date of an
already-issued certificate. Pinning `expires_at` at issuance closes that,
and is what the ruling requires.

---

## 3. Historical-truth architecture

- `public.certificates` remains **immutable**. CERT-003's
  `guard_certificate_immutable` trigger is preserved unchanged; `expires_at` is
  written once at insert and can never be updated.
- Every lifecycle change is an **appended event** in
  `public.certificate_lifecycle_events`. Nothing is rewritten in place.
- Current status is **resolved at read time** by replaying events from the
  implicit `active` origin, with Wave 7's fail-closed discipline: a sequence
  gap, a recorded predecessor that disagrees with the replayed state, or an
  edge outside the approved set marks the history invalid rather than guessing.
- Time-based expiry is applied **only** to a certificate whose replay is valid
  and whose replayed status is `active`. A revoked certificate stays revoked
  past its expiry date; expiry never overwrites a recorded transition.
- When replay fails, the platform **refuses to assert a status** rather than
  reporting a possibly-wrong one.

---

**PENDING INDEPENDENT ARCHITECTURE REVIEW**
