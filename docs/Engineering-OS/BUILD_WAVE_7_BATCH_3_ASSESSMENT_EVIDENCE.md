# BUILD — Wave 7 / Batch 3

## Assessment Evidence (EVID-005)

**Status:** implemented
**Scope:** consumption of approved assessment outcomes into canonical Evidence.
No assessment scoring logic was changed and no unrelated system was redesigned.

---

## 1. Purpose

Batch 1 created canonical Evidence. Batch 2 created the Evidence-to-competency
relationship. Neither had a producer: `assessment_evidence_handoffs` accumulated
source-engine truth that nothing consumed.

Batch 3 connects them. An approved, evidence-producing assessment attempt now
becomes a canonical Evidence Record with preserved provenance and approved
competency links, satisfying EVID-005 §14.

```
Assessment attempt submitted
    -> deterministic result persisted        (Assessment Engine, authoritative)
    -> assessment_evidence_handoff persisted (Wave 4, authoritative)
    -> canonical Evidence created            (Batch 1)
    -> Evidence competency links created     (Batch 2)
    -> Learning Engine interprets            (unchanged)
```

---

## 2. Eligibility

`evaluateAssessmentEvidenceEligibility()` is pure and fails closed on three
independent axes:

| Condition | Result |
| --- | --- |
| `purpose = evidence_producing` | required — practice and diagnostic produce nothing |
| attempt state `passed` or `failed` | required — interrupted and in-progress produce nothing |
| handoff `evidence_eligible = true` | required — the upstream engine's own gate |

A skip is a normal outcome, recorded with a bounded reason
(`assessment_not_evidence_producing`, `attempt_not_terminal`,
`handoff_not_eligible`), never an error.

This is EVID-005 §8 and §12: a practice quiz is never confused with trusted
evidence, and a technical interruption never creates a false negative record.

---

## 3. Passed and failed both create Evidence

Both terminal outcomes create canonical Evidence and competency links. A failed
authoritative assessment is a trustworthy record of an observed result, and
suppressing it would destroy the traceability EVID-005 §15 depends on.

`resultState` is preserved in the Evidence metadata and surfaced in the
student-facing representation, so downstream deterministic logic can always tell
the two apart.

---

## 4. The demonstration guardrail

Batch 2's `AuthoritativeCompetencyEvidenceReference` carried no outcome. A
Learning Engine consumer reading it could not distinguish a passed assessment
from a failed one, and would have had to treat both as accepted proof. Creating
failed Evidence without fixing that would have been an active hazard.

Batch 3 closes the boundary at the contract, using both permitted approaches:

1. **Outcome on every reference.** `deriveEvidenceOutcome()` maps the source
   engine's recorded result to `positive` / `negative` / `indeterminate`, and
   every reference now carries `evidenceOutcome`, `evidenceResultState` and
   `qualifiesForDemonstration`. The default is `indeterminate`: an Evidence
   Record that does not explicitly declare success never qualifies.
2. **A mastery-safe accessor.** `getQualifyingCompetencyEvidenceReferences()`
   returns only positive-outcome references, so a consumer that wants
   demonstration proof cannot accidentally receive anything else.

The invariant:

| Source | Evidence | Link | May demonstrate? |
| --- | --- | --- | --- |
| passed assessment | yes | yes | yes, per Learning Engine rules |
| failed assessment | yes | yes | **no** |
| interrupted / technical error | no | no | n/a |

Nothing is deleted and no link is withheld. Historical truth is preserved; only
its interpretation is constrained.

---

## 5. Provenance

| Evidence field | Value |
| --- | --- |
| `sourceType` | `assessment_attempt` |
| `sourceEngine` | `assessment` |
| `sourceReference` | `assessment-attempt:<attemptId>` (from the handoff) |
| `sourceOccurredAt` | the attempt's `submitted_at` |
| `sourceIntegrityDigest` | the handoff's `result_digest`, carried forward unchanged |
| `integrityDigest` | computed by Batch 1 over the canonical Evidence string |

The Evidence Engine never recomputes source-engine truth. It does not call
`calculateAssessmentResultDigest` or `scoreAssessment`; the verifier fails the
build if it ever does. This is exactly the separation Batch 1 reserved
`source_integrity_digest` for.

---

## 6. Competency links

Competency stable IDs **and exact versions** come from
`assessment_competency_mappings`, never from the handoff's stable-ID-only
`competency_stable_ids` array. `required: true` maps to a `required`
relationship, `false` to `supporting`, and `link_source` is
`source_engine_mapping`.

Because Batch 2 pins the exact `public.competencies` row, an Evidence link
records the competency definition as it existed when the assessment was
approved, and later curriculum versions never rewrite it.

---

## 7. Metadata safety

`buildAssessmentEvidenceMetadata()` emits exactly eight bounded primitives:
assessment stable ID, version, title, purpose, attempt ID, result state, score
percent, passing percent.

It carries no questions, no options, no answer keys, no selected answers and no
scoring internals beyond the score and threshold the student already sees
(EVID-005 §9). `validateAssessmentEvidenceMetadata()` rejects any of those keys
explicitly, and the consumer reads neither `assessment_attempt_answers` nor any
option column — enforced by both a test and a verifier check.

---

## 8. Failure boundary

Evidence ingestion is downstream processing and holds no scoring authority.

`submitAssessmentAttempt()` calls the consumer only after the deterministic
result and the handoff are both persisted. It uses
`tryConsumeAssessmentEvidenceHandoff()`, which catches every failure and:

- does **not** fail or roll back the submission
- does **not** change the deterministic result
- does **not** delete, rewrite or corrupt the handoff
- records `state = 'failed'` with a bounded failure code
- writes an `assessment.evidence.consumption_failed` audit event

The consumer never issues an update, upsert, insert or delete against
`assessment_attempts` or `assessment_evidence_handoffs`; the verifier enforces
this with a pattern check, and a separate check enforces that the handoff call
precedes the consumption call inside `submitAssessmentAttempt`.

Consumption bookkeeping is itself best-effort and swallows its own errors, so it
can never become a second failure mode. The handoff row remains the durable
retry source of truth regardless.

---

## 9. Durable retry and idempotency

`public.assessment_evidence_consumptions` records `consumed` / `skipped` /
`failed` per attempt, with the resulting `evidence_id`, a bounded skip reason,
the last failure code and the last attempt timestamp.

RLS is enabled with **no policy at all**: this is internal operational state,
not student-facing evidence. Students read Evidence through the Batch 1 routes
and competency links through the Batch 2 routes.

`retryFailedAssessmentEvidenceConsumption()` re-runs failed rows. Retry is safe
because the consumer performs no dedupe of its own — it relies on Batch 1's
logical source identity `(user_id, source_type, source_reference)` and Batch 2's
link identity. A retry of the same handoff returns the existing Evidence and
existing links, creating nothing new and emitting no duplicate audit event. Any
provenance or digest divergence fails closed with `CONFLICT`.

---

## 10. Audit

- `assessment.evidence.consumed` — success, target `evidence_record`, metadata
  `{ attemptId, assessmentStableId, assessmentVersion, resultState,
  linkedCompetencyCount }`.
- `assessment.evidence.consumption_failed` — failure, target
  `assessment_attempt`, metadata `{ failureCode }`.

Batch 1's `evidence.record.created` and Batch 2's `evidence.competency.linked`
still fire beneath. No Evidence metadata body and no assessment content is
logged.

---

## 11. Student surface

`GET /assessment-attempts/:attemptId/evidence` returns the canonical Evidence
produced by that attempt together with its competency links, both through the
user-scoped client so RLS enforces ownership. The response gives the student the
assessment name, outcome, purpose and supported competencies required by
EVID-005 §10 and §13.

There is no student create, update or delete route. Ingestion is not imported by
`server.ts`, so it is unreachable from HTTP; mutation-shaped paths return 404,
which the smoke script asserts.

---

## 12. Boundaries preserved

- Assessment scoring, `scoreAssessment`, attempt states and
  `buildAssessmentEvidenceHandoff` are unchanged; the only edit to
  `assessment-attempts.ts` is one call plus a comment.
- The Wave 4 handoff table is untouched by the migration.
- The Learning Engine's own tables and `recordAuthoritativeCompetencyEvidence()`
  remain untouched — Batch 2's checks still enforce this verbatim.
- Lab Evidence (EVID-004), correction history (EVID-006), portfolio (EVID-007)
  and export (EVID-008) remain unimplemented. Wave 7 stays open.
- No OpenAI, Anthropic, Ollama or AI Gateway dependency exists anywhere in this
  path. AI holds no authority over scores, thresholds or Evidence outcomes.

---

## 13. Tests

`packages/shared-types/src/assessment-evidence.test.ts` (18 cases) and
`services/api/src/assessment-evidence.test.ts` (21 cases).

| Case | Covered by |
| --- | --- |
| A passed attempt creates Evidence + links | both |
| B failed attempt creates Evidence + links | both |
| C failed Evidence cannot cause demonstration | both |
| D interrupted attempt creates neither | shared types |
| E practice creates neither | shared types |
| F diagnostic creates neither | shared types |
| G consumer failure does not fail submission | api |
| H retry is durable and idempotent | api |
| I `result_digest` preserved as `source_integrity_digest` | api |
| J exact mapping competency versions preserved | api |
| K no answer keys, questions or options in metadata | both |

Plus: in-progress attempts, handoff-not-eligible, terminal-state recognition,
relationship mapping, bounded metadata limits, fail-closed outcome derivation
for unknown result states, ownership enforcement, the handoff never being
rewritten, bookkeeping never throwing, and the absence of student mutation
routes.

Batch 1 and Batch 2 suites were re-run against the modified adapter and remain
green.

---

## 14. Verification

`scripts/verify-wave7.sh` was extended, not replaced: the first 226 lines are
byte-identical to the Batch 2 version, and 14 Batch 3 checks were appended
before the toolchain run. Total 41 static checks.

The Batch 3 section verifies eligibility rules, digest preservation, the absence
of scoring recomputation, the absence of answer-key access, handoff-before-
ingestion ordering inside `submitAssessmentAttempt`, the non-throwing failure
path, the immutability of upstream tables, durable retry state with no student
policy, the demonstration guardrail, the authenticated read route with no
mutation route, and the absence of AI.

`scripts/smoke-api.sh` gains three assertions without weakening any existing
Wave 3–7 Batch 2 assertion.
