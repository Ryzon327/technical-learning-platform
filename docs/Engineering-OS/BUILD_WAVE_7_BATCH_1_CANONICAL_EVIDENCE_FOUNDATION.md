# BUILD — Wave 7 / Batch 1

## Canonical Evidence Foundation (EVID-001, EVID-002)

**Status:** implemented
**Scope:** the canonical Evidence Record and provenance foundation only. No
unrelated system was redesigned.

---

## 1. Purpose

Wave 7 owns Canonical Evidence. Before this batch the platform produced
source-engine truth in several places — assessment result digests and evidence
handoffs, deterministic Lab validation runs and results, competency evidence
references — but had no durable, provenance-bearing record that Evidence
consumers could later depend on.

Batch 1 creates that destination and the trusted service boundary in front of
it. It creates nothing else: no handoff consumption, no competency linking, no
portfolio, no export, no verification, no certificates.

---

## 2. Evidence ownership

| Concern | Owner | Not owned by Evidence |
| --- | --- | --- |
| Whether an assessment passed | Assessment Engine | Evidence never recomputes it |
| Whether a lab validated | Lab Engine (deterministic provider probes) | Evidence never re-runs probes |
| Whether a competency is demonstrated | Learning / Competency Engine | Evidence never advances progress |
| Durable proof that a trusted source event happened | **Evidence Engine** | — |
| Certificates | Certificate Engine (future) | consumes Evidence, is not Evidence |

Evidence stores proof. It does not duplicate source-engine truth and it does not
hold progress authority.

---

## 3. Canonical Evidence model

`public.evidence_records`, typed as `EvidenceRecord` in
`packages/shared-types/src/evidence.ts`.

| Field | Column | Notes |
| --- | --- | --- |
| `id` | `id` | uuid |
| `userId` | `user_id` | FK to `auth.users`, cascade delete |
| `sourceType` | `source_type` | `assessment_attempt` \| `lab_validation` \| `manual_authoritative` \| `system_authoritative` |
| `sourceReference` | `source_reference` | safe opaque reference, never blank |
| `sourceEngine` | `source_engine` | `assessment` \| `lab` \| `competency` \| `platform` |
| `sourceOccurredAt` | `source_occurred_at` | when the source event happened |
| `recordedAt` | `recorded_at` | when Evidence accepted it |
| `state` | `state` | `active` \| `invalidated` \| `superseded` |
| `integrityState` | `integrity_state` | `verified` \| `unverified` \| `mismatch` |
| `integrityAlgorithm` | `integrity_algorithm` | `sha256` |
| `integrityDigest` | `evidence_integrity_digest` | Evidence acceptance proof |
| `sourceIntegrityDigest` | `source_integrity_digest` | upstream source-engine proof |
| `metadata` | `metadata` | bounded, structured, non-sensitive |

`EvidenceSourceType` deliberately contains no AI value. There is no
`practice`/`diagnostic` source type either: assessment purpose wording confers
no Evidence authority, and metadata wording changes nothing about acceptance
(test P).

### Bounded metadata

At most 20 keys; keys ≤ 64 characters; values are primitives with strings
≤ 512 characters. Keys matching secret/token/password/credential/api-key/
service-role/private-key/authorization/connection-string/docker/socket/ssh-key/
access-key/bearer are rejected outright. Canonical Evidence is durable and
student-visible, so it must never carry secrets, provider credentials,
infrastructure credentials or sensitive runtime identifiers.

---

## 4. Provenance

`EvidenceProvenance` carries source type, source reference, source engine,
source occurrence time, recorded time, integrity algorithm, both digests and
integrity state. `validateEvidenceProvenance()` enforces every one of them.

Canonical validation (`validateCreateCanonicalEvidenceInput`) requires: user id,
source type, source reference (non-blank), source engine, a parseable source
occurrence timestamp, and a well-formed lowercase hex SHA-256 source digest.
Unsupported source types and unsupported source engines are rejected.

---

## 5. Source integrity vs Evidence integrity

These are two different claims and are never conflated.

**`source_integrity_digest`** is the upstream engine's proof — for an assessment
attempt, the existing `result_digest`. The Evidence Engine carries it forward
untouched. It never recomputes source-engine truth, and never recomputes
anything from untrusted browser fields.

**`evidence_integrity_digest`** is the Evidence Engine's own proof of *what was
accepted*:

```
sha256("evidence-v1|userId|sourceType|sourceReference|sourceEngine|sourceOccurredAt|sourceIntegrityDigest")
```

Built by `buildEvidenceCanonicalString()` from an explicit ordered field list.
JSON object key iteration is never hashed, so a digest cannot drift because of
incidental property ordering. `sourceOccurredAt` is normalised to ISO-8601
first, so `2026-08-13T00:00:00Z` and `2026-08-13T00:00:00.000Z` agree.
Metadata is deliberately outside the digest: it is descriptive, not provenance.

SHA-256 via Node `crypto`, matching `calculateAssessmentResultDigest`. No custom
cryptography.

---

## 6. Server-authoritative creation

`createCanonicalEvidence(input)` in `services/api/src/evidence.ts`:

1. validates the canonical input (`VALIDATION_ERROR` on failure);
2. computes the Evidence digest;
3. looks up `(user_id, source_type, source_reference)` through
   `createServerSupabaseClient()`;
4. on a hit, compares provenance and both digests;
5. on a miss, inserts with `state='active'`, `integrity_state='verified'`;
6. writes `evidence.record.created` and returns the record.

Ownership always comes from the trusted caller's `userId`. A browser-supplied
identity never determines Evidence ownership, because no HTTP route reaches this
function at all.

---

## 7. Idempotency and fail-closed conflict

Logical identity is `(user_id, source_type, source_reference)`, enforced by
`evidence_records_source_identity_key`. The digest is a fail-closed integrity
check, never the uniqueness mechanism.

`evaluateExistingEvidenceRecord()` decides:

- **match** — same source engine, same source occurrence time, same source
  digest, same Evidence digest → the existing record is returned unchanged, with
  no second audit event.
- **conflict** — any divergence → `AppError` `CONFLICT`, `retryable: false`, with
  a machine-readable reason (`source_engine_mismatch`,
  `source_occurred_at_mismatch`, `source_integrity_digest_mismatch`,
  `evidence_integrity_digest_mismatch`) and an
  `evidence.record.integrity_conflict` audit event.

An existing Canonical Evidence Record is never silently overwritten. A lost
uniqueness race (`23505`) re-reads and applies the same decision, so concurrent
trusted writers converge instead of duplicating.

---

## 8. Immutable provenance

`guard_evidence_record_provenance()` is a `before update` trigger that raises if
`user_id`, `source_type`, `source_reference`, `source_engine`,
`source_occurred_at`, `integrity_algorithm`, `evidence_integrity_digest`,
`source_integrity_digest` or `recorded_at` change. This holds even for the
service role — provenance is immutable at the database, not merely by
convention.

`state`, `integrity_state` and `metadata` remain mutable by privileged server
code so that later correction and invalidation workflows can be append-only and
auditable rather than rewriting history. **No correction workflow exists in
Batch 1**, and no general Evidence UPDATE API is exposed.

---

## 9. Student read-only boundary and RLS

RLS is enabled. Exactly one policy:

```sql
create policy "students read own evidence records"
on public.evidence_records
for select to authenticated
using (auth.uid() = user_id);
```

No student INSERT, UPDATE, DELETE or ALL policy is granted anywhere. Students
cannot create Evidence, alter provenance, alter integrity state, or alter
Evidence state.

Reads go through `createUserScopedSupabaseClient(accessToken)` so RLS remains
the enforcement boundary — the service never substitutes its own filter for the
database's ownership check.

---

## 10. Student data exposure

`toStudentEvidenceRecord()` projects to: id, source type, source reference,
source engine, source occurrence time, recorded time, state, integrity state and
safe metadata.

Deliberately excluded: `userId`, `evidence_integrity_digest`,
`source_integrity_digest`, and anything about service-role configuration,
provider runtime credentials, container identifiers, internal addresses or
authorization internals. Digests stay internal until public verification is
specified in a later batch.

---

## 11. API surface

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/evidence` | GET | trusted request identity | list own Evidence |
| `/evidence/:id` | GET | trusted request identity | read one own Evidence |

Both resolve identity through `resolveTrustedRequestIdentity(request)` and pass
only `trusted.accessToken`, matching the existing student read routes. Neither
reads a request body.

There is **no** `POST /evidence` and no other student write route.
`createCanonicalEvidence` is not imported by `server.ts` at all, so Evidence
creation is unreachable from the HTTP surface. An unauthenticated `POST
/evidence` therefore falls through to the standard 404, which the smoke script
asserts.

---

## 12. Audit boundary

- `evidence.record.created` — success, target type `evidence_record`, target id
  the Evidence id, metadata `{ sourceType, sourceEngine, integrityState }`.
- `evidence.record.integrity_conflict` — failure, with the conflict reason only.

Idempotent repeat reads of an existing record emit no audit event. Raw Evidence
metadata and Evidence content are never logged; a test asserts the audit blocks
never pass `record.metadata` or `input.metadata`.

---

## 13. Boundaries held for later batches

**Assessment handoff (Batch 3).** `assessment_evidence_handoffs` is not read,
not consumed, and not modified. Assessment submission logic is untouched. The
handoff remains source-engine output; Batch 3 will map it into Canonical
Evidence, at which point `result_digest` becomes the `sourceIntegrityDigest`.

**Lab handoff (Batch 4).** Deterministic Lab validation truth is untouched:
provider probe → deterministic result → persisted
`lab_validation_runs` / `lab_validation_results`. No Lab Evidence is created.

**Learning / Competency Engine.** `recordAuthoritativeCompetencyEvidence()` and
`student_competency_evidence_refs` are not removed, rewritten, or referenced.
Wave 3 / Wave 4 behaviour is unchanged. `CreateCanonicalEvidenceInput` carries
no eligibility or advancement field, so no caller can smuggle a competency
instruction through Evidence intake — the verifier fails the build if such a
field appears.

**Certificate Engine.** Not implemented. It will consume Evidence later;
Evidence holds no certificate authority.

---

## 14. AI non-authority

AI cannot create Evidence truth, change Evidence state, change integrity state,
mark competencies demonstrated, forge provenance, or override a digest mismatch —
there is no code path through which it could. No OpenAI, Anthropic, Ollama or AI
Gateway dependency exists in the Evidence path; the verifier and the tests both
enforce this. AI may explain Evidence to students in a later batch; explanation
is not authority.

---

## 15. Tests

`packages/shared-types/src/evidence.test.ts` (18 cases) and
`services/api/src/evidence.test.ts` (11 cases), both vitest, matching the
existing co-located convention.

| Case | Covered by |
| --- | --- |
| A valid input passes | shared types |
| B missing user id fails | shared types |
| C missing/blank source reference fails | shared types |
| D unsupported source type fails (+ D2 source engine) | shared types |
| E malformed SHA-256 digest fails | shared types |
| F canonical digest deterministic | both |
| G same input → same digest | both |
| H material provenance change → different digest | both |
| I duplicate with matching provenance is idempotent | shared types |
| J duplicate with mismatched digest fails closed (+ J2 provenance) | shared types |
| K student list reads only through user-scoped access | api |
| L no student Evidence creation route exists | api |
| M service uses the server-side creation path | api |
| N provenance is not writable or readable through student routes | both |
| O source types exclude AI authority | shared types |
| P practice/diagnostic wording is not authoritative | shared types |

Plus: metadata bounding and sensitive-key rejection, invalid timestamps,
metadata excluded from the digest, digest format, no handoff consumption, and no
raw metadata in audit events.

---

## 16. Verification

`scripts/verify-wave7.sh` — extendable by later Wave 7 batches. It checks the
shared type exists and is exported; the migration exists with canonical CHECK
constraints, RLS, a student SELECT-only policy and no write policy (including
multi-line policy definitions); the immutability guard; both digest columns; the
logical uniqueness key; the server-authoritative service; SHA-256; the audit
event; the `CONFLICT` contract; authenticated read routes; the absence of any
student create route or `createCanonicalEvidence` import in `server.ts`; the
absence of handoff consumption; and the absence of AI dependencies. It then runs
`npm run typecheck`, `npm run test`, `npm run build`,
`scripts/security-scan.sh` and `scripts/smoke-api.sh`.

`scripts/smoke-api.sh` gains three assertions — `GET /evidence` 401,
`GET /evidence/:id` 401, `POST /evidence` 404 — without weakening any existing
Wave 3–6 assertion.

---

## 17. Batch 2 dependency

Batch 2 builds on exactly three things established here: the canonical
`EvidenceRecord` shape, the immutable provenance guarantee, and the
`createCanonicalEvidence` trusted-intake boundary. Nothing in Batch 1 needs to
be reshaped for competency linking (EVID-003), Lab consumption (EVID-004),
assessment consumption (EVID-005), correction history (EVID-006), portfolio
(EVID-007) or export (EVID-008); each of those adds tables or callers around
this foundation rather than changing it.
