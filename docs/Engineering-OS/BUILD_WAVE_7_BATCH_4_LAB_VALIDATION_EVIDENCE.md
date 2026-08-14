# BUILD — Wave 7 / Batch 4

## Lab Validation Evidence (EVID-004)

**Status:** implemented
**Scope:** consumption of deterministic Lab validation outcomes into canonical
Evidence. No Wave 6 validation logic was changed and no unrelated system was
redesigned.

---

## 1. Architecture

```
Lab Provider probe (deterministic)
    -> Lab Engine validateLabSession()          authoritative
    -> lab_validation_runs + lab_validation_results persisted
    -> Lab Evidence ingestion                    downstream, no authority
    -> canonical Evidence Record                 (Batch 1)
    -> approved competency links                 (Batch 2)
    -> outcome-aware Learning Engine adapter     (Batch 3 model)
```

The Lab Engine decides whether a lab passed. The Evidence Engine records that
decision. Ingestion never re-runs a probe, never re-derives a check outcome, and
never writes to a validation run, result or session.

---

## 2. Repository questions resolved

These were the open items before implementation. All resolved from the real
schema; no architectural gap exists.

**Canonical Lab → competency mapping source.** `public.mission_competencies`
(`mission_id`, `competency_id`, `required`). `lab_definitions.competency_stable_ids`
declares *which* competencies a lab exercises but carries no versions, so it is
used as a filter, not as the mapping authority.

**Does it preserve an exact competency version?** Yes.
`mission_competencies.competency_id` is a foreign key to one row of
`public.competencies`, which is keyed `unique (stable_id, version)`. The exact
version therefore comes from the approved curriculum mapping itself — nothing is
inferred and nothing defaults to "latest published".

**How is the historical version resolved when only stable IDs exist?** Through
the chain the repository already pins, with the mission hop frozen at validation
time (see §3):

```
lab_sessions.lab_definition_stable_id + lab_definition_version   (pinned at request time)
  -> lab_definitions row              exact historical definition
  -> competency_stable_ids            what this lab version exercises
  -> mission_stable_id
  -> missions (published)             resolved the way every stable-id reference is
  -> mission_competencies             approved mapping + required flag
  -> competencies                     exact (stable_id, version)
```

The session already pins the lab definition version, so the lab side is
historical fact. Only the mission hop needs resolving, using the repository's
existing published-resolution convention — the same
`.eq("publication_state","published").order("version", desc).limit(1)` pattern
used by `loadPublishedLabDefinition` and the curriculum reads.

A competency the lab declares but the approved mapping cannot resolve is
**skipped and audited**, never linked against a guessed version.

---

## 3. Frozen mapping authority

Resolving the mission at *ingestion* time would leave a historical-integrity
hole. Ingestion is retryable and may be delayed, so this was possible:

1. student performs Lab Definition vN while Mission v3 is published;
2. the deterministic validation run is persisted;
3. ingestion fails temporarily;
4. Mission v4 publishes with different `mission_competencies`;
5. the retry resolves v4 and links competencies that were never in force for
   that lab execution.

Batch 2 idempotency does not help here, because this is the *first* ingestion of
that run. The fix is to resolve the mapping once and freeze it.

`public.lab_evidence_handoffs`, keyed by `validation_run_id`, captures:

| Column | Purpose |
| --- | --- |
| `lab_definition_stable_id` / `lab_definition_version` | the pinned definition of the session |
| `mission_stable_id` / `mission_version` / `mission_id` | the exact mission whose mapping was in force |
| `competency_mappings` | frozen array of `{competencyStableId, competencyVersion, required}` |
| `unresolved_competency_stable_ids` | declared competencies with no version-bearing mapping |
| `mapping_digest` | SHA-256 over the ordered mapping authority string |

Written only after the validation run and results are persisted, and only via
`on conflict do nothing`, so the first writer wins and the snapshot is read back
rather than overwritten. A `before insert or update` trigger raises on **any**
update — the snapshot is immutable — and enforces that its owner, session and
pinned lab definition all match the validation run.

`resolveMappingAuthority()` is a pure rule: a frozen snapshot always wins; the
currently published curriculum is used only when no snapshot exists at all, and
that case is reported as `capturedLate` and audited rather than passed off as a
validation-time resolution.

RLS is enabled with no policy — students never read or write raw handoff state.

---

## 4. Source identity and integrity

| Field | Value |
| --- | --- |
| `sourceType` | `lab_validation` |
| `sourceEngine` | `lab` |
| `sourceReference` | `lab-validation-run:<validationRunId>` |
| `sourceOccurredAt` | `lab_validation_runs.checked_at` |
| `sourceIntegrityDigest` | derived (below) |
| `integrityDigest` | computed by Batch 1, unchanged |

The Lab Engine persists no digest of its own, so Batch 4 introduces the smallest
possible one — a derived digest, not a new table or a change to validation:

```
sha256(
  "lab-validation-v1|runId|labSessionId|userId|profileStableId|
   labDefinitionStableId|labDefinitionVersion|runState|checkedAt|
   <checks sorted by checkStableId, each `id:required:state:passed`>|
   mappingAuthorityDigest"
)

mappingAuthorityDigest = sha256(
  "lab-mapping-v1|missionStableId|missionVersion|
   <mappings sorted by stableId then version, each `stableId@version:required`>|
   <unresolved stable ids, sorted>"
)
```

The frozen mapping authority is bound into the **source** digest, so mapping
drift is caught by canonical Evidence integrity: re-consuming the same run
against a different mapping set produces a different `source_integrity_digest`
and fails closed through Batch 1's `CONFLICT` path. The Evidence Engine's own
acceptance proof, `evidence_integrity_digest`, remains separate and is still
computed by Batch 1; the two are never conflated.

Explicit and ordered, with checks sorted by stable id so database row order
cannot change it. No JSON serialisation is hashed. It contains authoritative
validation facts only — no explanation text, no probe identifier, no provider
detail. Because it is recomputed from immutable rows rather than stored, a retry
produces an identical digest and any divergence fails closed against the
existing Evidence Record through the Batch 1 conflict path.

---

## 5. Outcome semantics

The canonical Lab run states are used exactly as they exist; none were invented.

| Run state | Meaning | Evidence | Outcome | Qualifies? |
| --- | --- | --- | --- | --- |
| `passed` | every required check passed deterministically | yes | `positive` | yes, per Learning Engine rules |
| `incomplete` | every check evaluated cleanly; a required check did not pass | yes | `negative` | **no** |
| `technical_error` | the validator could not complete a check | **none** | n/a | n/a |

`deriveLabValidationState` returns `technical_error` if *any* check errored, so
an `incomplete` run is guaranteed to contain no technical errors — it is an
unambiguous student result, matching the Lab Engine's own wording that a
technical error "does not count as a student failure".

A `technical_error` run creates no Evidence at all. It is recorded as a skip with
reason `validation_technical_error`, so a validator or provider outage can never
masquerade as student failure and can never be silently reinterpreted later.

Batch 3's `deriveEvidenceOutcome` was extended by one clause to recognise
`incomplete` as the Lab Engine's terminal negative state alongside the
Assessment Engine's `failed`. The fail-closed default is unchanged: absence of
an explicit success is never read as success, and `technical_error` maps to
`indeterminate`.

---

## 6. Competency linking

Links are created through Batch 2's `linkEvidenceToCompetency` with
`link_source = approved_curriculum_mapping`, `required: true` → `required` and
otherwise `supporting`. Link metadata records the lab definition stable id,
version and mission stable id so the mapping's provenance is inspectable.

No second competency registry, no second mapping table, and no inference from
lab names, descriptions, commands or student activity.

Both positive and negative Evidence are linked. A link means "approved proof
relevant to this competency", and Batch 3's outcome model — not link presence —
decides what may count as demonstration.

---

## 7. Ownership

Ownership is derived server-side and verified twice:

1. `lab_validation_runs.user_id` must equal `lab_sessions.user_id`; a divergence
   raises `CONFLICT` and no Evidence is written.
2. The caller's `trustedUserId` must equal the run's owner, or `FORBIDDEN`.

The database enforces it a third time: the `lab_evidence_consumptions_guard`
trigger raises if the ingestion row's `user_id` is not the validation run's
owner, or if its `lab_session_id` disagrees with the run's session.

---

## 8. Failure isolation

`validateLabSession` calls `tryConsumeLabValidationEvidence` only after the run,
the results and the session's `validation_state_reference` are persisted and the
`lab.session.validated` audit event is written. The wrapper catches everything,
records `state = 'failed'` with a bounded failure code, audits
`lab.evidence.consumption_failed`, and returns.

Consequently: Lab validation truth never depends on Evidence Engine
availability, a passed run is never rewritten to failed, and the returned
`LabValidationRunResult` is unchanged. The consumer issues no update, upsert,
insert or delete against `lab_validation_runs`, `lab_validation_results` or
`lab_sessions` — enforced by a verifier pattern check and a test.

---

## 9. Retry state — why a dedicated table

Three options were considered. The choice is semantic, not symmetric.

**Reuse `public.lab_operations` (rejected).** That queue is Wave 6 Lab Engine
session-lifecycle infrastructure; its processor handles cleanup work and skips
other kinds. Using it would require widening a Wave 6 CHECK constraint and would
place Evidence ingestion retries inside the Lab lifecycle path — precisely the
coupling §12 forbids.

**No table, derive retries from missing Evidence (rejected).** Workable and
idempotent, but it cannot distinguish "ingestion failed" from "not yet
attempted", and cannot record why a run was skipped.

**Dedicated `public.lab_evidence_consumptions` (chosen),** alongside the frozen
`public.lab_evidence_handoffs` snapshot described in §3. Evidence-owned, keyed
by `validation_run_id`, recording `consumed` / `skipped` / `failed`, the
resulting `evidence_id`, a bounded skip reason and the last failure code. RLS is
enabled with **no policy at all**: this is internal operational state, and
students see nothing. `retryFailedLabEvidenceConsumption()` re-runs failed rows;
retry is safe because the consumer performs no dedupe of its own and relies on
Batch 1's logical source identity and Batch 2's link identity.

---

## 10. Student visibility

`GET /lab-sessions/:sessionId/evidence` returns, for each consumed validation
run of that session, the canonical Evidence and its competency links — both
through the user-scoped client so RLS enforces ownership.

The student sees the lab name, the authoritative outcome, when it was validated,
the supported competencies, and the Evidence and integrity state. Metadata
carries no probe identifier, no explanation text, no endpoint, no username, no
provider or container identifier and no connection metadata;
`validateLabEvidenceMetadata` rejects those keys explicitly.

There is no student create, update or delete route. Ingestion is not imported by
`server.ts`, so it is unreachable from HTTP; mutation-shaped paths return 404,
asserted by the smoke script.

---

## 11. Learning Engine and AI separation

The consumer never writes to student competency state, never calls
`recordAuthoritativeCompetencyEvidence()` and never calls
`decideCompetencyTransition()`. Qualifying Lab Evidence reaches the Learning
Engine only through Batch 2/3's existing read-only adapter, where
`getQualifyingCompetencyEvidenceReferences()` filters to positive outcomes.

No OpenAI, Anthropic, Ollama or AI Gateway dependency exists in this path. AI
cannot determine a lab result, convert a failure into a pass, manufacture a
validation, alter a digest or decide mastery.

---

## 12. Tests

`packages/shared-types/src/lab-evidence.test.ts` (20 cases) and
`services/api/src/lab-evidence.test.ts` (22 cases).

| Case | Covered by |
| --- | --- |
| A successful validation creates Evidence | both |
| B failed (incomplete) validation is traceable but never qualifies | both |
| C technical validator failure creates no student Evidence | both |
| D incomplete/unrecognised states fail closed | shared types |
| E duplicate consumption is idempotent (stable digest, ordering-independent) | both |
| A–E regression: delayed retry after a curriculum change still links the version-3 / mapping-A set and adds nothing from version 4 | shared types |
| F source integrity divergence fails closed | both |
| G ownership derives from authoritative Lab data | api |
| H user mismatch fails closed | api |
| I mappings come only from approved configuration | api |
| J AI cannot create or alter Lab Evidence truth | api |
| K ingestion failure never alters validation truth | api |
| L ingestion is safely retryable | api |
| M no student HTTP creation path | api |
| N unauthenticated reads fail | smoke |
| O reads are owner-scoped | api |
| P qualifying adapter returns only positive evidence | api |
| Q negative Evidence remains historically available | api |
| R validator outage distinguishable from student failure | shared types |
| S no mastery state is mutated | api |

Batch 1–3 suites were re-run against the extended outcome model and remain
green.

---

## 13. Verification

`scripts/verify-wave7.sh` was extended, not replaced: the first 363 lines are
byte-identical to the Batch 3 version, and 15 Batch 4 checks were appended
before the toolchain run. Total 56 static checks, then the repository's real
typecheck, tests, build, security scan and smoke API.

---

## 14. Rollback and recovery

No Lab Engine or Evidence table is altered, so rollback is additive-only.

1. **Stop new ingestion** — revert the single call in `validateLabSession`.
   Validation continues unchanged; existing Evidence stays valid.
2. **Reprocess** — `retryFailedLabEvidenceConsumption()` re-runs failed rows at
   any time; idempotency guarantees no duplicates.
3. **Full revert** — restore the modified files from the applier's
   `.w7b4-backup/<timestamp>/`. `lab_evidence_consumptions` may be left in place
   harmlessly, or dropped; canonical Evidence already created remains valid and
   independently readable, since the consumption table is bookkeeping only.

Evidence history is never deleted to resolve an ingestion problem.
