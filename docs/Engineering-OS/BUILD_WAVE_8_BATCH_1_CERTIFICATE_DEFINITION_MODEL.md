# BUILD — Wave 8 / Batch 1

## Certificate Definition Model (CERT-001)

**Status:** implemented
**Scope:** the Certificate Definition Model only. No unrelated system was
redesigned, and no later CERT Feature was started.

---

## 1. Purpose

Wave 8 owns Certificates. Before this batch the platform had a Certificate
Engine feature registry and two empty scaffold directories, but no certificate
model of any kind — the reconciliation inspection that opened this batch found
no certificate implementation in the working tree, in git history, or in any
dangling object.

Batch 1 creates the authoritative *specification* of a certificate: what it
requires, who issues it, how long it stays valid, whether verification is
permitted, and which version superseded which.

It creates nothing about a student. There is no eligibility evaluator, no
issuance, no student certificate record, no lifecycle, no verification, no
portfolio, no export, no revocation, no rendering and no AI.

---

## 2. Certificate ownership

| Concern | Owner | Not owned by CERT-001 |
| --- | --- | --- |
| What a certificate requires | **CERT-001** | — |
| Whether a student qualifies | CERT-002 (future) | CERT-001 never evaluates |
| Creating a certificate for a student | CERT-003 (future) | CERT-001 never issues |
| Certificate records and lifecycle | CERT-004 (future) | CERT-001 holds no student state |
| Verification behaviour | CERT-005 (future) | CERT-001 declares policy only |
| Whether a competency is demonstrated | Learning / Competency Engine | CERT-001 never advances progress |
| Durable proof a source event happened | Evidence Engine (Wave 7) | CERT-001 declares requirements against it |

---

## 3. The normalized model

Three tables. Structured requirements are columns, never JSON blobs, so a
certificate's requirements are queryable and constrained by the database.

### `public.certificate_definitions`

Typed as `CertificateDefinition` in
`packages/shared-types/src/certificate-definition.ts`.

| Field | Column | Notes |
| --- | --- | --- |
| `id` | `id` | uuid |
| `stableId` | `stable_id` | stable across display-title changes |
| `version` | `version` | positive integer, server-allocated |
| `title` | `title` | display title |
| `description` | `description` | optional |
| `issuer` | `issuer` | authoritative issuing body |
| `publicationState` | `publication_state` | `draft` \| `review` \| `published` \| `retired` |
| `effectiveAt` | `effective_at` | effective date |
| `expirationMonths` | `expiration_months` | **nullable**; 1–600 when present |
| `verificationPermitted` | `verification_permitted` | declarative boolean |
| `supersededByDefinitionId` | `superseded_by_definition_id` | nullable self-reference |
| `presentation.plainLanguageTitle` | `plain_language_title` | accessibility (section 10) |
| `presentation.plainLanguageSummary` | `plain_language_summary` | optional |
| `presentation.logoTextAlternative` | `logo_text_alternative` | text alternative for the visual mark |

Identity is `unique (stable_id, version)`.

### `public.certificate_definition_competencies`

| Column | Notes |
| --- | --- |
| `certificate_definition_id` | FK, cascade delete |
| `competency_id` | FK to the **exact historical** `public.competencies` row, `on delete restrict` |
| `competency_stable_id` | carried alongside, kept in agreement by trigger |
| `competency_version` | carried alongside, kept in agreement by trigger |
| `required` | boolean |

### `public.certificate_definition_evidence_policies`

| Column | Notes |
| --- | --- |
| `certificate_definition_id` | FK, cascade delete |
| `evidence_source_type` | reuses the Wave 7 canonical Evidence source types |
| `minimum_count` | integer 1–100 |
| `require_positive_outcome` | boolean |

Primary key `(certificate_definition_id, evidence_source_type)`, so one source
type carries at most one policy. These are **declarations**. CERT-002 will read
them; nothing in Batch 1 evaluates them.

---

## 4. Stable identity and versioning

`normalizeCertificateDefinitionStableId()` applies the existing curriculum
convention exactly: trim, lowercase, then
`/^[a-z0-9][a-z0-9._-]{2,119}$/`. The Feature Registry's
`CERTDEF-NET-FOUNDATIONS-001` example normalises to
`certdef-net-foundations-001`.

The version is **always** allocated server-side as `max(version) + 1` for the
stable ID. No route accepts a version, so a material change can only ever
produce a new version — it can never overwrite an existing one.

---

## 5. Exact competency version pinning

This is the mechanism behind CERT-001 section 2: *curriculum updates must not
silently change what a certificate meant*.

A requirement is resolved by `stable_id` **and** exact `version`. Three layers
enforce it:

1. `validateCertificateCompetencyRequirements()` rejects a non-positive-integer
   version, so `"latest"` or `"current"` cannot even be expressed.
2. `setCertificateDefinitionCompetencies()` looks up the exact pair and raises
   `UNRESOLVED_COMPETENCY_VERSION` when it does not exist. It never falls back
   to the newest version.
3. `guard_certificate_definition_competency_pin()` raises if the carried
   `competency_stable_id`/`competency_version` disagree with the row the foreign
   key points at.

A certificate published against competency version 3 keeps meaning version 3
after version 4 is published.

---

## 6. Publication fails closed

`validateCertificateDefinitionForPublication()` blocks publication when:

- the definition shape is invalid (missing title, issuer, accessible title, or
  an unparseable effective date);
- the version is not a positive integer;
- **no competency is required at all** — a certificate that requires nothing
  would certify nothing;
- a required competency version **cannot be resolved**
  (`UNRESOLVED_COMPETENCY_VERSION`);
- a required competency **is not itself published** (`INELIGIBLE_COMPETENCY`).

Nothing is repaired or substituted. Per CERT-001 section 12, an invalid
definition remains draft, and a broken competency reference blocks publication.

Transitions follow the existing curriculum rules exactly, so a draft can never
reach `published` without passing through `review`, and a published definition
can never be pulled back into editing.

---

## 7. Published material immutability

A published Certificate Definition version is **materially** immutable, so a
certificate already issued against it cannot have its meaning rewritten.

**Material** — frozen once published, change requires a new version:

| TypeScript (`CERTIFICATE_DEFINITION_MATERIAL_FIELDS`) | SQL column |
| --- | --- |
| `stableId` | `stable_id` |
| `version` | `version` |
| `issuer` | `issuer` |
| `effectiveAt` | `effective_at` |
| `expirationMonths` | `expiration_months` |
| `verificationPermitted` | `verification_permitted` |
| `requiredCompetencies` | child rows |
| `evidencePolicies` | child rows |

The six scalars are frozen by
`guard_certificate_definition_material_freeze()`; the two collections by
`guard_certificate_definition_requirement_freeze()`, which rejects insert,
update **and** delete of requirement rows whose parent is published. Both hold
against the service role — immutability is enforced at the database, not by
convention. The verifier asserts the TypeScript set and the SQL trigger describe
the same fields, so the two cannot drift apart silently.

**Not material** — editable while published:

- `title`, `description`, and all three presentation fields. CERT-001 section 7
  states Certificate Definition IDs remain stable *across display-title
  changes*, and section 10 requires accessible presentation metadata. Fixing a
  typo or improving a screen-reader alternative does not change what a holder
  had to demonstrate.
- `publicationState` and `supersededByDefinitionId`, which are the retirement
  and supersession mechanisms themselves. Freezing them would make retirement
  and supersession impossible.

> **Flagged for review.** Treating title/description/presentation as
> non-material is an interpretation of "materially immutable" grounded in
> sections 7 and 10. If the Founder/architect intends display title to be frozen
> on publication too, this is a one-line change in both the trigger and the
> material field set, plus one test.

---

## 8. Expiration policy — declarative only

`expirationMonths` is nullable: **null means no expiration**. When present it is
an integer validity window of **1–600 months**, enforced in TypeScript
(`isValidCertificateExpirationMonths`) and by a SQL CHECK constraint.

It is a declaration and nothing more. There is no expiry date computed
anywhere, no scheduler, no `expiresAt` field, no revalidation enum and no
revalidation model. The verifier fails the build if `expiresAt`, `expiry`,
`calculateExpir`, `revalidation`, `setInterval`, `setTimeout`, `cron` or
`pg_cron` appears in the certificate path. CERT-004 owns lifecycle.

---

## 9. Verification policy — declarative only

`verificationPermitted` is a strict boolean. `isValidVerificationPermitted()`
rejects truthy strings and numbers, so the policy switch cannot be set by
accident.

Granting it does nothing observable in Batch 1. It mints no identifier, creates
no lookup, exposes no endpoint and grants no public read. The verifier fails the
build if `verification_id`, `verificationId`, `verificationCode`,
`verificationUrl`, `verificationReference`, `gen_random_bytes`, `randomBytes` or
`randomUUID` appears, or if any `/verify` route exists. CERT-005 owns
verification.

---

## 10. Supersession

`superseded_by_definition_id` is the only certificate-to-certificate
relationship in the model. History is never deleted: the superseded definition
remains readable, and later issuance will pin the exact version it was granted
against.

- **Self-supersession** — rejected by the CHECK constraint
  `certificate_definitions_no_self_supersession`, and by
  `validateCertificateDefinitionSupersession()` before the write.
- **Cycles** — rejected by a bounded walk in
  `guard_certificate_definition_supersession()` (bounded by the definition
  count, so a corrupt chain cannot spin), and by the same shared validator
  walking the existing link map in the service.

There are **no prerequisite certificates**. The verifier fails the build if the
word appears in certificate code.

---

## 11. Privileged authoring API

All nine routes resolve `founder(request)` — the existing
`requireFounderAdmin(resolveTrustedRequestIdentity(request))` path, which
requires the `founder_admin` role, a verified email and MFA.

| Route | Method | Function |
| --- | --- | --- |
| `/admin/certificates/definitions` | GET | `listCertificateDefinitions` |
| `/admin/certificates/definitions` | POST | `createDraftCertificateDefinition` |
| `/admin/certificates/definitions/:id` | GET | `getCertificateDefinition` |
| `/admin/certificates/definitions/:id` | PATCH | `updateCertificateDefinition` |
| `/admin/certificates/definitions/:id/competencies` | PUT | `setCertificateDefinitionCompetencies` |
| `/admin/certificates/definitions/:id/evidence-policies` | PUT | `setCertificateDefinitionEvidencePolicies` |
| `/admin/certificates/definitions/:id/validate` | POST | `validateCertificateDefinitionForPublication` |
| `/admin/certificates/definitions/:id/transition` | POST | `transitionCertificateDefinitionState` |
| `/admin/certificates/definitions/:id/supersede` | POST | `supersedeCertificateDefinition` |

There is **no** student-facing certificate route of any kind. Students reach
published definitions through RLS only. The verifier parses the import block and
asserts every imported name is actually exported by `certificate-admin.ts` and
actually called in `server.ts`, so the two can never drift.

Writes use `createServerSupabaseClient()`. The user-scoped client is never used
in this module.

---

## 12. RLS and trust boundary

RLS is enabled on all three tables. Exactly three policies exist, all
`for select to authenticated`, all gated on the parent definition being
`published`.

No student INSERT, UPDATE, DELETE or ALL policy is granted anywhere. No `anon`
or `public` grant exists. Draft, review and retired definitions are invisible to
students.

---

## 13. Audit boundary

- `certificate.definition.created`
- `certificate.definition.updated`
- `certificate.definition.competencies_set`
- `certificate.definition.evidence_policies_set`
- `certificate.definition.state_changed`
- `certificate.definition.superseded`
- `certificate.definition.publication_blocked` (failure)
- `certificate.definition.material_change_rejected` (failure)

Metadata carries stable ID, version, and state names only.

---

## 14. AI non-authority

AI cannot define a certificate, alter requirements, publish a definition,
supersede a version or set a verification policy — there is no code path through
which it could. No OpenAI, Anthropic, Ollama or AI Gateway dependency exists in
the certificate path; the verifier and the tests both enforce this.

---

## 15. Tests

`packages/shared-types/src/certificate-definition.test.ts` — **44 cases**.
`services/api/src/certificate-admin.test.ts` — **49 cases**. Both vitest,
matching the co-located convention.

| Required coverage | Case |
| --- | --- |
| stable ID normalization/validation | A, A2, B, B2 |
| version validation | C, C2 |
| publication-state validation | D, D2 |
| `expirationMonths` null accepted | E |
| `expirationMonths` 1 accepted | F |
| `expirationMonths` 600 accepted | G |
| `expirationMonths` 0 rejected | H |
| `expirationMonths` >600 rejected | I |
| `verificationPermitted` validation | J, J2, J3 |
| exact competency version preservation | K, K2, D (api), D3 (api) |
| invalid competency reference rejected | L, L2 |
| unpublished/ineligible competency prevents publication | E, E2, E3 (api) |
| published material definition cannot be mutated | O, O2, O3, F, F2, F5 (api) |
| supersession cannot point to self | Q, G (api) |
| supersession cannot create a cycle | R, R2, G2 (api) |
| duplicate `stable_id + version` fails | C2 (api) |
| privileged authoring boundary | A, A2, A3, A4, A5 (api) |
| no student mutation route | B, B2, B3, B4 (api) |
| no eligibility/issuance/verification behaviour | H–H9 (api) |
| failed competency replacement preserves previous set | A, A2 (api) |
| failed Evidence-policy replacement preserves previous set | B, B2 (api) |
| successful replacement replaces the complete set | C, C2, C3 (api) |
| published requirements remain immutable | D, D2, E, E2 (api) |

The API-layer tests read the implementation from disk. Absence assertions strip
whole-line comments first, so they judge code rather than the prose documenting
what was excluded.

---

## 16. Verification

`scripts/verify-wave8.sh`, extendable by later Wave 8 batches. Fourteen
sections: single canonical model and single migration; untouched scaffolds; the
normalized three-table shape with no JSON blobs; the nullable bounded expiration
policy with no scheduler; the declarative verification policy with no CERT-005
behaviour; TypeScript/SQL material-field agreement in both directions; exact
competency pinning with no `latest`; fail-closed publication; supersession
integrity with no prerequisites; route/export name agreement and founder
guarding; atomic requirement replacement with the freeze, length and lock
guards proven to precede the destructive statement by line position; the
absence of any student write policy, public read or student route;
and the absence of CERT-002…CERT-009 behaviour and AI.

It then runs the **Wave 7 Evidence Engine completion gate unmodified**
(`scripts/verify-evidence-engine-completion.sh`, which itself runs
`verify-wave7.sh`), followed by `npm run typecheck`, `npm run test`,
`npm run build`, `scripts/security-scan.sh` and `scripts/smoke-api.sh`. Wave 8
is not green unless Wave 7 is still green. No Wave 7 guarantee was weakened.

`scripts/smoke-api.sh` gains 15 assertions: nine privileged certificate routes
returning 401 unauthenticated, and six confirming no student certificate,
issuance or verification route exists. No existing Wave 3–7 assertion was
changed.

---

## 17. Atomic requirement replacement

**Raised by architecture review; fixed before acceptance.**

**Root cause.** `setCertificateDefinitionCompetencies()` and
`setCertificateDefinitionEvidencePolicies()` originally issued the DELETE and
the INSERT as two separate PostgREST calls. Each PostgREST call is its own
transaction, so the two were never atomic. If the DELETE committed and the
INSERT then failed — a constraint violation, a pin-guard raise, a competency
deleted in between, a dropped connection — the definition was left with its
previous requirements removed and nothing in their place. It would silently
come to require *less* than before. Draft status is no defence: a draft that
quietly loses its requirements can still be reviewed and published in that
state.

**Mechanism used.** The repository already had a privileged-RPC convention:
`public.curriculum_publish_learning_path_tree` is a `security definer`
PL/pgSQL function with a fixed `search_path`, called through `supabase.rpc()`,
with EXECUTE revoked from `public`, `anon` and `authenticated` so only the
service role can invoke it. No new convention was invented.

Two functions were added to the CERT-001 migration:

- `public.certificate_definition_replace_competencies(uuid, uuid[], text[], integer[], boolean[])`
- `public.certificate_definition_replace_evidence_policies(uuid, text[], integer[], boolean[])`

A PL/pgSQL function body runs in a single implicit transaction, so the DELETE
and INSERT now commit or roll back together. Requirements are passed as
parallel typed arrays rather than a JSON document, so the structured
requirement contract stays typed end to end and the "no JSON blobs" rule is
preserved unchanged.

**Order of operations inside each function**, all before anything destructive:

1. input array lengths must agree;
2. the parent definition row is `SELECT ... FOR UPDATE`, serializing concurrent
   replacements;
3. a missing definition raises;
4. a **published** definition raises — the freeze is enforced inside the
   transaction, not only by the row triggers;
5. only then DELETE, then INSERT, in the same transaction.

The service still resolves every competency to its exact `(stable_id, version)`
row *before* calling the RPC, so resolution failure throws with
`UNRESOLVED_COMPETENCY_VERSION` having mutated nothing. The row-level pin guard
and requirement-freeze triggers still fire inside the function, so no guarantee
was relaxed to make this work.

**Unchanged:** RLS, the `founder_admin` authoring boundary, the published
freeze, and student permissions. No EXECUTE is granted anywhere in the
migration — the verifier fails the build if `grant execute` appears.

**Coverage limitation, stated plainly.** The repository has no live-database
test harness; every wave to date validates migrations by static inspection. The
A–D regression cases are therefore structural proofs over the SQL and the
service — that both statements live in one function body, that the freeze and
length guards precede the DELETE, that the service issues no `.delete()` of its
own — not executed rollbacks against a running PostgreSQL. Proving rollback
behaviour by execution would require a database test harness, which does not
exist and was not in scope to build.

---

## 18. Boundaries held for later batches

**CERT-002 eligibility.** No evaluator exists. The evidence policies and
required competencies are declarations that CERT-002 will read.

**CERT-003 issuance.** No issuance function, no student certificate row, no
`auth.users` reference in the migration.

**CERT-004 lifecycle.** No expiry timestamp, no scheduler, no revalidation
model. `expirationMonths` is a declared window only.

**CERT-005 verification.** No identifier, no endpoint, no public read.
`verificationPermitted` is a declared policy only. The Wave 7
`evidence_verification_references` table is untouched.

**CERT-006/007/009.** No portfolio, export, sharing or rendering.

**Curriculum, Learning, Assessment, Lab, Evidence Engines.** Untouched. The only
outward reference is a read-only foreign key from
`certificate_definition_competencies` to `public.competencies`, plus reuse of
the `EvidenceSourceType` union as the evidence policy source type.

**Empty scaffolds.** `packages/certificate-engine/` and `content/certificates/`
remain empty and untracked, per the established
`packages/shared-types` + `services/api` architecture. The verifier fails the
build if a file appears in either.

---

## 19. Batch 2 dependency

Batch 2 (CERT-002 eligibility) builds on three things established here: the
canonical `CertificateDefinition` shape, the exact-version competency pin, and
the declarative evidence policy rows. Nothing in Batch 1 needs reshaping for
eligibility evaluation — CERT-002 adds a reader around this model rather than
changing it.

---

**PENDING INDEPENDENT ARCHITECTURE REVIEW**
