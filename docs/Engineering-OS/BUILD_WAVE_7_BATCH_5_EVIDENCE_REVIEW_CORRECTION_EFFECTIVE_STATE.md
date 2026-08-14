# BUILD — Wave 7 / Batch 5

## Evidence Review, Correction and Effective State (EVID-006)

**Status:** implemented
**Scope:** append-only correction history and deterministic effective state. No
source-engine truth was changed and no unrelated system was redesigned.

---

## 1. Original Evidence vs effective state

Two questions now have two separate, durable answers:

| Question | Answered by |
| --- | --- |
| What is the original Evidence? | `public.evidence_records` — unchanged |
| What is its effective trusted state now, and why? | that record replayed through `public.evidence_correction_events` |

```
Canonical Evidence Record        immutable provenance, immutable digests
        +
0..N append-only correction events
        ↓
resolveEffectiveEvidenceState()  deterministic
        ↓
consumers evaluate effective state at read time
```

A correction never says "this event did not happen". It says "our trust in this
Evidence has changed, and here is who changed it and why".

---

## 2. Correction event model

`public.evidence_correction_events`, typed as `EvidenceCorrectionEvent`.

| Field | Column | Notes |
| --- | --- | --- |
| `evidenceId` | `evidence_id` | FK to `evidence_records` |
| `userId` | `user_id` | the Evidence owner, copied from the record |
| `sequenceNumber` | `sequence_number` | monotonic per Evidence; replay order and concurrency token |
| `action` | `action` | `place_under_review` \| `confirm` \| `invalidate` \| `supersede` \| `restore` |
| `reason` | `reason` | required, 8–500 characters, student-facing |
| `actorId` / `actorRole` | `actor_id` / `actor_role` | authority context; role constrained to `founder_admin` |
| `previousEffectiveState` / `newEffectiveState` | same | recorded so replay can be validated |
| `supersedingEvidenceId` | `superseding_evidence_id` | required for and exclusive to `supersede` |
| `idempotencyKey` | `idempotency_key` | stable caller key; never a timestamp |
| `metadata` | `metadata` | bounded, internal, never shown to students |

The action vocabulary comes from EVID-006 §5 and §14 — review, correct,
invalidate, supersede, restore.

**No fourth state was introduced.** EVID-006 asks for a "review state" while the
prompt forbids competing state vocabularies, so the canonical Batch 1 states
(`active`, `invalidated`, `superseded`) are preserved and review is tracked as a
separate `underReview` flag derived from `place_under_review` / `confirm`. An
open review is informational: it does not by itself withdraw trust, because
EVID-006 does not say it should. The verifier fails the build if an
`under_review` state value ever appears.

---

## 3. Transition rules

```
active       --invalidate--> invalidated
active       --supersede-->  superseded   (requires a replacement Evidence)
invalidated  --restore-->    active
superseded   --restore-->    active
```

`place_under_review` and `confirm` never change the trust state.
Everything else is refused: re-invalidating already-invalidated Evidence,
superseding non-active Evidence, restoring active Evidence, concluding a review
that was never opened, supplying a replacement on a non-supersede action, and
any action outside the union.

EVID-006 §5 permits "restoration when a correction itself was incorrect".
Supersession is a correction, so restoring from `superseded` is permitted; the
restore clears the recorded replacement.

### Fail-closed replay

`resolveEffectiveEvidenceState()` replays the ordered history from the record's
original state and refuses to guess. It returns `sequenceValid: false` with a
reason on a sequence gap, a recorded predecessor that disagrees with the
replayed state, or a recorded successor that breaks the transition rules.
`isEffectivelyTrustedEvidence()` requires `sequenceValid && state === "active"`,
so an incoherent history can never be read as trusted.

---

## 4. Authority

No new authorization model was introduced. The repository already has
`public.user_profiles.role in ('student','founder_admin')`, the `PlatformRole`
type, and `requireFounderAdmin` behind the `founder(request)` helper used by
every `/admin/...` route.

Batch 5 reuses all three, in three layers:

1. **Route** — `POST/GET /admin/evidence/:id/corrections` call `founder(request)`.
2. **Service** — `requireCorrectionAuthority()` rejects any actor whose
   `IdentityContext.role` is not `founder_admin` with `FORBIDDEN`.
3. **Database** — the insert trigger reads `user_profiles.role` for the actor and
   raises unless it is `founder_admin`, and the column has a CHECK constraint.

Students have a `SELECT` policy on their own rows and no insert, update or
delete policy of any kind.

---

## 5. Reason

Every correction requires a non-blank reason of 8–500 characters, enforced in
`validateCorrectionReason()` and again by a database CHECK on
`length(btrim(reason))`. Whitespace-only reasons and oversized payloads are
rejected. The reason is student-facing by design (EVID-006 §11 asks for plain
language), so anything internal belongs in `metadata`, which students never see.

---

## 6. Supersession safety

| Risk | Prevention |
| --- | --- |
| self-supersession | CHECK `superseding_evidence_id <> evidence_id`, plus input validation |
| missing replacement | CHECK `action <> 'supersede' or superseding_evidence_id is not null` |
| replacement on a non-supersede action | CHECK `action = 'supersede' or superseding_evidence_id is null` |
| cross-user supersession | trigger compares both records' owners; service checks it too |
| circular supersession | trigger walks the existing supersession chain with a recursive CTE and raises if it returns to this Evidence |
| silent deletion | superseded Evidence is never deleted; the FK is `on delete restrict` |

---

## 7. Concurrency and idempotency

**Concurrency.** The next `sequence_number` is derived from the replayed history
and inserted under `unique (evidence_id, sequence_number)`. Two administrators
acting on the same predecessor cannot both succeed: one wins, the other gets a
`23505` which surfaces as `CONFLICT` with `retryable: true` and must retry
against fresh effective state. A stale caller is additionally caught earlier by
`expectedPreviousState`, which is compared against the freshly resolved state
before anything is written.

**Idempotency.** An optional stable `idempotencyKey` (8–128 chars, never a
timestamp) is unique per Evidence. A retry with the same key returns the
existing event instead of appending a second one, including when the race is
lost. Two legitimately distinct corrections that merely share an action and a
reason are never collapsed, because collapsing requires the same key.

---

## 8. Append-only history

A `before update or delete` trigger raises unconditionally: correction history
cannot be rewritten, even by the service role. A mistaken correction is repaired
by appending a new event, exactly as EVID-006 §8 requires. The service performs
only inserts — the verifier fails the build if `.update(`, `.upsert(` or
`.delete(` ever appears in it.

---

## 9. Downstream qualification — the non-negotiable invariant

`getAuthoritativeCompetencyEvidenceReferences()` now loads correction events for
the whole link set in one query and resolves effective state per Evidence at
read time. Qualification requires **all** of:

- a positive source-engine outcome (Batch 3/4 model), **and**
- `isEffectivelyTrustedEvidence(effective)` — coherent history, currently active, **and**
- integrity still `verified`.

```
positive Evidence qualifying yesterday
        ↓
invalidated or superseded today
        ↓
getQualifyingCompetencyEvidenceReferences today
        ↓
does NOT return it
```

Nothing is cached onto the link, so the answer can never go stale. A restored,
still-positive, otherwise-eligible Evidence qualifies again. Negative Evidence
never qualifies regardless of trust state, and indeterminate Evidence never
qualifies at all.

**Behaviour change worth noting:** the full accessor previously skipped
ineligible Evidence entirely. It now returns it, carrying
`evidenceEffectiveState` and `evidenceUnderReview` with
`qualifiesForDemonstration: false`, so disputes remain reconstructable
(requirement Y).

---

## 10. Student transparency

`GET /evidence/:id/corrections` returns the student's own history: action,
plain-language reason, timestamp, and the states either side of the change. The
projection drops the actor, the actor role, the internal metadata and the owner
id. RLS scopes rows to the owner, so a student cannot read another student's
history.

`GET /evidence` and `GET /evidence/:id` now carry `effectiveState`,
`underReview`, `correctionCount` and `lastCorrectionReason` alongside the
original `state`, so Evidence never silently disappears from a student's view —
it appears with an understandable current state and an explanation.

---

## 11. Source-engine boundaries

Invalidating Evidence does **not** mean the assessment attempt never happened or
that the lab validation never passed.

- **Assessment (Batch 3).** `assessment_attempts`, `assessment_evidence_handoffs`
  and the attempt result are untouched.
- **Lab (Batch 4).** `lab_validation_runs`, `lab_validation_results` and
  `lab_evidence_handoffs` are untouched.
- **Evidence (Batch 1).** Provenance, ownership, `evidence_integrity_digest` and
  `source_integrity_digest` are never rewritten, and the Batch 1 immutability
  trigger is neither modified nor dropped.

The verifier greps for each of those five source tables in the correction
service and migration and fails the build if any appears.

Original Evidence integrity proves what was originally accepted. Effective state
describes current trust. Batch 5 keeps them separate, exactly as §18 requires.

---

## 12. Certificate and Learning Engine boundaries

No certificate is issued, revoked or modified; the word does not appear in the
correction path, and the verifier enforces that. The correction service writes to
no competency table and calls no transition function. Certificate eligibility and
competency mastery consume effective Evidence through the existing read-only
adapter, which is now effective-state aware — that is the clean downstream
contract §17 asked for, without implementing Certificate work.

---

## 13. AI non-authority

AI cannot invalidate, restore, supersede, approve, alter history, or decide
effective state: every path requires a `founder_admin` actor verified in three
layers, and effective state is a pure deterministic function. No OpenAI,
Anthropic, Ollama or AI Gateway dependency exists here.

---

## 14. Tests

`packages/shared-types/src/evidence-correction.test.ts` (32 cases) and
`services/api/src/evidence-correction.test.ts` (25 cases).

| Case | Covered by |
| --- | --- |
| A active with no corrections resolves active | shared types |
| B active → invalidated | shared types |
| C active → superseded | shared types |
| D invalidated → restored (and D2 superseded → restored) | shared types |
| E invalid transitions and incoherent replay fail closed | shared types |
| F reason required and bounded | shared types |
| G actor and authority persisted | api |
| H students cannot create corrections | api |
| I/J history is append-only | api |
| K superseding Evidence must exist | both |
| L superseding Evidence cannot equal the original | both |
| M ownership mismatch fails | api |
| N circular supersession impossible | api |
| O repeated identical privileged request handled | both |
| P/Q original provenance and digests unchanged | api |
| R/S assessment and lab source truth unchanged | api |
| T invalidated positive Evidence stops qualifying | shared types |
| U superseded positive Evidence stops qualifying | shared types |
| V restored positive Evidence may qualify again | shared types |
| W negative Evidence never qualifies, even restored | shared types |
| X indeterminate Evidence never qualifies | shared types |
| Y full accessor still exposes corrected Evidence | api |
| Z student reads own safe history | both |
| AA history is owner-scoped by RLS | api |
| AB AI has no correction authority | both |
| AC concurrent/stale correction fails safely | api |

Batch 1–4 suites were re-run against the modified adapter and remain green.

---

## 15. Verification

`scripts/verify-wave7.sh` was extended, not replaced: the first 536 lines are
byte-identical to the Batch 4 version, and 16 Batch 5 checks were appended.
Total 75 static checks, then the repository's real typecheck, tests, build,
security scan and smoke API.

Three of the new checks were confirmed against deliberate regressions: adding a
student write policy, removing the read-time effective-state resolution from the
accessor body, and making the service update `evidence_records` each exit 1.

`scripts/smoke-api.sh` gains five assertions — unauthenticated student and admin
correction reads rejected, student mutation paths absent, and the privileged
route rejecting unauthenticated access — without weakening any prior assertion.

---

## 16. Rollback and recovery

No existing table is altered, so rollback is additive-only.

1. **Stop new corrections** — remove the admin routes. Existing history stays
   readable and effective state keeps resolving.
2. **Reverse a specific correction** — append a `restore` event. History is never
   edited; the reversal is itself auditable.
3. **Full revert** — restore the modified files from the applier's
   `.w7b5-backup/<timestamp>/`. `evidence_correction_events` may be left in place
   harmlessly; with the resolver gone, consumers fall back to
   `evidence_records.state`, which Batch 5 never modified, so no Evidence is lost
   or misstated.
