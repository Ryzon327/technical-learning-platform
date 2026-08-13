# BUILD — Wave 7 / Batch 2

## Competency Evidence Linking (EVID-003)

**Status:** implemented
**Scope:** the canonical Evidence-to-competency relationship layer only. No
unrelated system was redesigned, and no completed Wave 3/4 behaviour changed.

---

## 1. Purpose

Batch 1 created durable, provenance-bearing Evidence. On its own that is
activity history: nothing recorded *what capability* a result proves.

Batch 2 adds the missing edge. `public.evidence_competency_links` records that a
canonical Evidence Record is approved proof relevant to an exact historical
competency definition, giving the traceable chain EVID-003 requires:

```
Source Engine
    -> Canonical Evidence
    -> Approved Evidence-to-Competency Mapping
    -> Learning / Competency Engine
```

The Evidence Engine establishes the proof relationship. The Learning Engine
interprets it under its existing deterministic rules.

---

## 2. Canonical relationship model

`public.evidence_competency_links`, typed as `EvidenceCompetencyLink`.

| Field | Column | Notes |
| --- | --- | --- |
| `id` | `id` | uuid |
| `evidenceId` | `evidence_id` | FK to `public.evidence_records`, cascade delete |
| `userId` | `user_id` | FK to `auth.users`; always the Evidence owner |
| `competencyId` | `competency_id` | FK to `public.competencies`, `on delete restrict` |
| `competencyStableId` | `competency_stable_id` | mirrors `competencies.stable_id` |
| `competencyVersion` | `competency_version` | mirrors `competencies.version` |
| `relationship` | `relationship` | `required` \| `supporting` |
| `linkSource` | `link_source` | trusted mapping provenance |
| `linkedAt` | `linked_at` | when the mapping was accepted |
| `metadata` | `metadata` | bounded, structured, non-sensitive |

### Version terminology

The canonical competency model is `public.competencies`, keyed by
`unique (stable_id, version)`. Each version is its own row, so the link both
pins that row through `competency_id` and denormalises `stable_id` + `version`
for durable, joinable history.

`student_competency_state.curriculum_version` is the Learning Engine's own
column describing the curriculum version at evaluation time. It is a different
concept, it is untouched, and no third spelling was introduced: the link uses
`competency_version` because that is precisely `competencies.version`.

### Relationship semantics

- **`required`** — this Evidence is approved proof that the competency's
  requirements are addressed.
- **`supporting`** — this Evidence is approved corroborating proof.

Neither value means mastery (§7). Both are permitted for the same competency
from different Evidence Records, and one Evidence Record may support several
competencies, as EVID-003 §5 allows.

### Link source

`source_engine_mapping`, `approved_curriculum_mapping`,
`authoritative_manual_mapping` — each an approved, governed origin, enforced by
a database CHECK constraint and a TypeScript union. There is deliberately no
`ai_generated`, `llm` or `model_decision` value (§9).

---

## 3. Version preservation

A link is a historical fact. When curriculum moves on, the stored reference is
never rewritten to the newest version.

Read paths compute — never store — a `competencyReferenceState`:

| State | Meaning |
| --- | --- |
| `current` | the linked version is the latest published version |
| `superseded_version` | a newer published version of the same stable id exists |
| `retired` | the linked definition is now retired |
| `missing` | the definition is not visible |

`classifyCompetencyReference()` is pure and directly tested (case T): a link
made against version 2 still reports version 2 after version 5 publishes. This
also satisfies EVID-003 §12 — Evidence is preserved, the reference is reported
as needing attention, and no competency is falsely awarded.

New mappings may only be made against a **published** definition. Draft, review
and retired definitions fail closed at both the service and the database.

---

## 4. Ownership consistency

The caller-supplied `userId` is never authority on its own. `linkEvidenceToCompetency`:

1. loads the canonical Evidence Record server-side;
2. takes `user_id` from that record;
3. rejects with `FORBIDDEN` if the requested user differs;
4. writes the Evidence Record's owner into the link.

The database enforces the same rule independently: the
`evidence_competency_links_guard` trigger raises if the link's `user_id` is not
the referenced Evidence Record's owner. A student can therefore never associate
another student's Evidence with their own competency state, even if a future
caller were written incorrectly.

---

## 5. Eligibility

Only currently usable Evidence may become trusted competency proof:
`state = 'active'` **and** `integrity_state = 'verified'`.

`invalidated`, `superseded`, `unverified` and `mismatch` all fail closed —
`evaluateEvidenceLinkEligibility()` is allow-listed rather than deny-listed, so
any future Evidence state is rejected until explicitly permitted. The trigger
re-checks the same condition.

The Learning Engine adapter applies the same rule at read time, so Evidence that
is later invalidated stops being reported as trusted proof without any link
needing to be rewritten.

---

## 6. Server-authoritative linking, RLS, and the student boundary

Creation runs through `createServerSupabaseClient()`. Student reads run through
`createUserScopedSupabaseClient()` so RLS stays the enforcement boundary.

RLS is enabled with exactly one policy:

```sql
create policy "students read own evidence competency links"
on public.evidence_competency_links
for select to authenticated
using (auth.uid() = user_id);
```

No student INSERT, UPDATE, DELETE or ALL policy exists.

| Route | Method | Auth |
| --- | --- | --- |
| `/evidence/:evidenceId/competencies` | GET | trusted request identity |
| `/competencies/:competencyStableId/evidence` | GET | trusted request identity |

`linkEvidenceToCompetency` is not imported by `server.ts`, so trusted linking is
unreachable from HTTP. Mutation-shaped student paths return the standard 404,
which the smoke script asserts for POST, PATCH and DELETE.

The student projection carries id, evidence id, competency stable id and
version, competency title and description, reference state, relationship, link
source with a plain-language description, and the linked timestamp. It omits
`userId`, `competencyId` and `metadata`, and exposes no service-role,
authorization or infrastructure detail. Including the title and description
satisfies EVID-003 §10: students see capability statements, not only opaque IDs.

---

## 7. Why a link is not mastery

A link means *"this canonical Evidence is approved proof relevant to this
competency."* It does not mean *"this competency is mastered."*

`services/api/src/evidence-competency.ts` never writes to any Learning Engine
competency table, never calls `recordAuthoritativeCompetencyEvidence()`, and
never calls `decideCompetencyTransition()`. The migration creates no trigger
that advances competency state. Both the tests and the verifier fail the build
if any of that changes.

The integration contract is read-only:

```ts
getAuthoritativeCompetencyEvidenceReferences(userId, competencyStableId)
  -> AuthoritativeCompetencyEvidenceReference[]
```

It returns approved, still-eligible Evidence references with their source
provenance. The Learning Engine's existing deterministic transition logic
decides what, if anything, that means. Wiring existing Wave 3/4 callers to this
adapter is deliberately not part of Batch 2.

---

## 8. Interoperability with the existing mechanism

`public.student_competency_evidence_refs`, `public.student_competency_state`,
`public.student_competency_state_events` and
`recordAuthoritativeCompetencyEvidence()` are untouched — not removed, renamed,
rewritten or referenced. The Batch 2 migration neither reads nor writes them.

There is therefore no second mastery authority. The Evidence Engine owns the
proof relationship; the Learning Engine owns state. The adapter in §7 is the
single, explicit, minimal seam between them.

---

## 9. Idempotency

Logical identity is `(evidence_id, competency_stable_id, competency_version,
relationship)`, enforced by `evidence_competency_links_identity_key`. Metadata
and timestamps are excluded: descriptive data never makes two trusted mappings
distinct.

- **Identical mapping** → the existing link is returned, with no duplicate row
  and no second audit event.
- **Material conflict** → `CONFLICT`, `retryable: false`, with a reason
  (`owner_mismatch`, `competency_definition_mismatch`, `link_source_mismatch`)
  and an `evidence.competency.link_conflict` audit event.

History is never silently rewritten. Correction and review history belong to
EVID-006 and are not implemented here.

A lost uniqueness race (`23505`) re-reads and applies the same decision, so
concurrent trusted writers converge rather than duplicating.

---

## 10. Audit

- `evidence.competency.linked` — success, target type `evidence_competency_link`,
  target id the link id, metadata `{ evidenceId, competencyStableId,
  competencyVersion, relationship, linkSource }`.
- `evidence.competency.link_conflict` — failure, with the conflict reason.

Idempotent repeats emit no audit event. No Evidence metadata body is logged; a
test asserts the audit blocks never pass `link.metadata`, `input.metadata` or
`evidence.metadata`.

---

## 11. Boundaries held for later batches

- **Assessment (EVID-005, Batch 3)** — `assessment_evidence_handoffs` is not
  read, consumed or modified. Assessment submission is untouched.
- **Lab (EVID-004, Batch 4)** — deterministic Lab validation truth is untouched
  and no Lab Evidence is created.
- **Corrections (EVID-006)** — links are append-only in practice; no correction
  or review-history workflow exists.
- **Portfolio, export, verification, certificates** — not implemented. Wave 7
  remains open.

---

## 12. AI non-authority

No mapping source grants AI authority; the union, the CHECK constraint, the
row-mapper and the verifier all reject `ai_generated`, `llm` and
`model_decision`. No OpenAI, Anthropic, Ollama or AI Gateway dependency exists
in this path. A future approved workflow may let AI *suggest* a mapping for
human approval; suggestion is not authorship, and it is outside this batch.

---

## 13. Tests

`packages/shared-types/src/evidence-competency.test.ts` (23 cases) and
`services/api/src/evidence-competency.test.ts` (18 cases), both vitest.

| Case | Covered by |
| --- | --- |
| A valid Evidence links to a valid competency | shared types |
| B competency version preserved | both |
| C `required` accepted | shared types |
| D `supporting` accepted | shared types |
| E duplicate exact link idempotent | shared types |
| F invalid Evidence state rejected | both |
| G integrity mismatch rejected | both |
| H missing Evidence rejected | api |
| I missing competency rejected | api |
| J invalid competency version rejected | shared types |
| K ownership mismatch rejected | both |
| L no student create route | api |
| M no student update/delete route | api |
| N student reads only own relationships | both |
| O mapping source cannot be AI | both |
| P `student_competency_evidence_refs` intact | api |
| Q existing competency transitions unchanged | shared types |
| R no assessment handoff consumed | api |
| S no Lab validation consumed | api |
| T historical version not rewritten to latest | shared types |

Plus: stable-ID format, metadata bounding, non-canonical stored relationship and
link source failing closed, the read-only adapter performing no writes, and
audit events carrying no metadata bodies.

---

## 14. Verification

`scripts/verify-wave7.sh` was **extended, not replaced** — every Batch 1 check
remains byte-identical, and a Batch 2 section was appended before the toolchain
run. It covers the shared type and its export, the table and its constraints,
RLS with a SELECT-only policy, the absence of any write policy (including
multi-line definitions), ownership enforcement, version preservation,
relationship and link-source constraints, absence of AI authority, absence of
assessment and lab consumption, authenticated read routes, absence of student
mutation routes, and preservation of `student_competency_evidence_refs` and
`recordAuthoritativeCompetencyEvidence()`. It then runs `npm run typecheck`,
`npm run test`, `npm run build`, `scripts/security-scan.sh` and
`scripts/smoke-api.sh`.

`scripts/smoke-api.sh` gains five assertions — two 401s for the new read routes
and three 404s for mutation-shaped paths — without weakening any existing
Wave 3–7 Batch 1 assertion.

---

## 15. Migration safety

Forward-only. The migration creates one table, one policy, four indexes and one
guard trigger. It does not alter Batch 1 Evidence provenance semantics, does not
rewrite `evidence_records`, does not touch any Learning Engine competency table,
and creates no trigger that marks a competency demonstrated. The
`on delete restrict` foreign key to `public.competencies` ensures a curriculum
row cannot be deleted out from under preserved Evidence history.
