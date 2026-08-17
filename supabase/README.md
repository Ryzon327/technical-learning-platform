# Supabase

Current Assessment migrations:

- `20260812000100_assessment_foundation.sql`
- `20260812000200_assessment_attempts_scoring.sql`
- `20260812000300_readiness_test_out.sql`
- `20260812000400_assessment_recovery_integrity.sql`

Technical interruption is a recoverable non-failure state, saved answers remain preserved, and completed results receive deterministic integrity metadata.

Wave 4 emits an authoritative assessment-source handoff for the later Evidence Engine. Wave 7 remains responsible for canonical Evidence Records and provenance.
- `20260812000500_student_notes_foundation.sql` — private student notes and stable learning-context references with RLS ownership.
- `20260812000600_note_blocks_tags_organization.sql` — technical note blocks, lightweight tags, assignments, and pinned notes.
- `20260812000700_note_retrieval_bookmarks.sql` — private note retrieval indexes and student-owned bookmarks.
- Wave 5 Batch 4 adds private note export and closure hardening without adding new persistent tables.
- `20260812000800_lab_definition_foundation.sql` — provider-independent Lab Definition foundation; student reads are limited to published definitions and no student write policy is granted.
- `20260812000900_lab_session_lifecycle.sql` — student-owned Lab Session lifecycle, server-only provider references, expiration metadata, cleanup state, and state-integrity controls.
- `20260812001000_lab_access_reset_validation.sql` — private access delivery support, bounded reset state, deterministic validation checks, runs, and student-readable results.
- `20260812001100_lab_isolation_expiration_cleanup.sql` — bounded Lab operations, cleanup retry scheduling, operational attention view, and student-readable operation history.
- `20260812001200_lab_health_capacity_automation.sql` — provider health/capacity snapshots, automation cycle history, and uniqueness for open Lab operations.
- `20260812001300_lab_container_provider_foundation.sql` — provider registry and disabled-by-default Container Provider foundation.
- `20260812001400_container_runtime_hardening.sql` — Container Provider runtime-adapter hardening metadata; provider remains disabled by default.
- `20260812001500_container_provider_canary_gate.sql` — server-only Container Provider canary history and explicit activation-state gate.
- `20260812001600_container_provider_controlled_rollout.sql` — explicit Container Provider activation guard, allowlist/percentage/all rollout modes, and suspension-safe rollback.
- `20260813000100_evidence_foundation.sql` — Wave 7 Canonical Evidence Records with immutable provenance, server-authoritative creation, and student read-only RLS.

Wave 7 owns Canonical Evidence Records in `public.evidence_records`. Canonical Evidence creation is server-authoritative: no student insert, update, or delete policy is granted, and provenance columns are immutable after creation.

Wave 4 `assessment_evidence_handoffs` remain source-engine handoffs and are not consumed into Canonical Evidence in this batch. Wave 6 lab validation runs and results remain deterministic source-engine truth. Later Wave 7 batches establish the assessment and lab Evidence handoff consumption.
- `20260813000200_evidence_competency_linking.sql` — Wave 7 Batch 2 canonical Evidence-to-competency relationships with preserved competency definition versions, server-authoritative linking, and student read-only RLS.

Wave 7 Batch 1 owns canonical Evidence Records in `public.evidence_records`. Wave 7 Batch 2 owns canonical Evidence-to-competency relationships in `public.evidence_competency_links`, which reference the exact historical `public.competencies` row (`stable_id`, `version`) a mapping was approved against.

The Evidence Engine stores trusted proof and trusted mappings. The Learning Engine still owns competency state: `public.student_competency_state`, `public.student_competency_evidence_refs` and `public.student_competency_state_events` are unchanged, and a link never marks a competency demonstrated.
- `20260813000300_assessment_evidence_consumption.sql` — Wave 7 Batch 3 durable state for consuming approved assessment outcomes into canonical Evidence.

Wave 7 Batch 3 consumes `public.assessment_evidence_handoffs` into canonical Evidence and Evidence-to-competency links. The handoff table remains Wave 4 source-engine truth and is never rewritten by ingestion; `public.assessment_evidence_consumptions` holds only internal retry state and is server-only (RLS enabled with no policy).

Only `evidence_producing` assessments create Evidence. Practice and diagnostic assessments create none, and interrupted or in-progress attempts never create negative Evidence. Both passed and failed terminal attempts create Evidence and competency links; a failed result is retained as traceable proof but reports a negative outcome so the Learning Engine cannot count it as demonstrated.
- `20260813000400_lab_evidence_consumption.sql` — Wave 7 Batch 4 durable state for consuming deterministic Lab validation runs into canonical Evidence.

Wave 7 Batch 4 consumes `public.lab_validation_runs` into canonical Evidence and Evidence-to-competency links. The Lab Engine remains authoritative for validation truth: runs and results are never rewritten by ingestion, and `public.lab_evidence_consumptions` holds only internal retry state, server-only with RLS enabled and no policy.

The approved competency mapping in force when a validation becomes authoritative is frozen in `public.lab_evidence_handoffs` (immutable, server-only) so a delayed ingestion retry can never pick up a mission version published after the lab was performed.

Only authoritative deterministic outcomes create Evidence. A `passed` run is positive Evidence; an `incomplete` run is negative Evidence that stays traceable but can never qualify as demonstration; a `technical_error` run creates no Evidence at all, so a validator outage never masquerades as student failure. Competency links resolve through the approved curriculum mapping (`public.mission_competencies`), which preserves the exact `public.competencies` version.
- `20260813000500_evidence_correction_history.sql` — Wave 7 Batch 5 append-only Evidence review and correction history.

Wave 7 Batch 5 adds `public.evidence_correction_events`: an append-only review and correction history for canonical Evidence. The original record in `public.evidence_records` is never rewritten — provenance, ownership and both integrity digests remain exactly as accepted, and the Batch 1 immutability trigger is unchanged.

Effective trust state (`active`, `invalidated`, `superseded`, plus an under-review flag) is derived at read time from the original record plus its ordered history. Downstream qualification is therefore never cached: Evidence invalidated or superseded today stops qualifying for demonstration today, while remaining fully visible with its effective state and explanation.

Corrections are privileged: only a `founder_admin` actor may author one, enforced in the service and again by a database trigger reading `public.user_profiles`. Students may read the history of their own Evidence and have no mutation policy. Correction never alters assessment or lab source truth — the source engine's record of what happened stays exactly as observed.
- `20260813000600_evidence_verification_references.sql` — Wave 7 Batch 7 stable, opaque verification references for canonical Evidence.

Wave 7 Batch 7 adds `public.evidence_verification_references`: one immutable, cryptographically random identifier per Evidence Record, minted server-side when a student first requests an export. It exists so future Certificate Engine verification does not require an Evidence schema redesign.

It lives beside `public.evidence_records` rather than inside it, because Batch 1 provenance immutability must not be weakened to attach an identifier after Evidence creation. The table stores no Evidence content and no status: export representations are projected on demand, so revoked or superseded Evidence is never presented as currently valid.

An identifier existing does not make Evidence public. RLS grants students `SELECT` on their own references only — there is no anonymous verification endpoint, no public read policy, no share token and no employer access in this batch.
- `20260813000700_certificate_definition_foundation.sql` — Wave 8 Batch 1 CERT-001 Certificate Definition Model.

Wave 8 Batch 1 owns the authoritative *specification* of a certificate across three normalized tables: `public.certificate_definitions`, `public.certificate_definition_competencies` and `public.certificate_definition_evidence_policies`. Structured requirements are columns, not JSON blobs.

It owns nothing about a student. There is no student certificate table, no issuance record, no eligibility result, no verification identifier and no expiry timestamp in this migration. Those belong to CERT-002 (eligibility), CERT-003 (issuance), CERT-004 (record and lifecycle) and CERT-005 (verification), none of which are implemented.

Identity is `(stable_id, version)`, unique, with the version always allocated server-side. Required competencies are pinned to one exact historical `public.competencies` row: the foreign key targets that row, and `guard_certificate_definition_competency_pin()` raises if the carried `competency_stable_id`/`competency_version` disagree with it. A certificate published against competency version 3 keeps meaning version 3, and a broken or unpublished reference blocks publication rather than being silently resolved to "latest".

Published versions are *materially* immutable. `guard_certificate_definition_material_freeze()` rejects any change to `stable_id`, `version`, `issuer`, `effective_at`, `expiration_months` or `verification_permitted` once `publication_state = 'published'`, and `guard_certificate_definition_requirement_freeze()` rejects any insert, update or delete of requirement rows belonging to a published definition. These are the same conceptual fields as `CERTIFICATE_DEFINITION_MATERIAL_FIELDS` in `packages/shared-types/src/certificate-definition.ts`. Material change requires a new version. Title, description and presentation metadata stay editable, and `publication_state`/`superseded_by_definition_id` stay writable because they are the retirement and supersession mechanisms themselves.

`expiration_months` is declarative: `NULL` means no expiration, otherwise an integer 1–600 month validity window. Nothing computes an expiry date, schedules revalidation, or models a revalidation type. `verification_permitted` is likewise a declarative boolean policy: it mints no identifier, grants no public read and creates no verification surface.

Supersession is permitted and never deletes history: a self-reference is rejected by a CHECK constraint and a longer cycle by a bounded walk in `guard_certificate_definition_supersession()`. There are no prerequisite certificates.

RLS is enabled on all three tables. Authenticated users may `SELECT` published definitions only; draft, review and retired definitions stay invisible. No student INSERT, UPDATE, DELETE or ALL policy is granted anywhere — authoring is server-authoritative through the `founder_admin` path.

- `20260813000800_certificate_issuance_foundation.sql` — Wave 8 Batch 4 CERT-003 Deterministic Certificate Issuance.

Wave 8 Batch 4 owns the authoritative Certificate Record in `public.certificates`, with historical reference snapshots in `public.certificate_competency_snapshots` and `public.certificate_evidence_snapshots`.

`unique (user_id, certificate_definition_id)` is the issuance invariant: exactly one certificate per student per exact Certificate Definition version. A retry after a lost network response therefore returns the existing record rather than creating a duplicate. The `verification_id` is an opaque `cert1_` identifier minted at issuance so a future CERT-005 verification surface needs no schema change — **CERT-003 exposes no public verification route, page or lookup of any kind**.

Snapshots are references, never copied truth: they store Evidence ids and exact `competency_stable_id`/`competency_version` pins only. No Evidence content, digest, outcome, effective state or correction history is duplicated, so Wave 7 remains the single source of Evidence truth. Both the Certificate Definition and the referenced Evidence use `on delete restrict` — what justified a certificate cannot be deleted out from under it.

Issued records are historical. `guard_certificate_immutable` rejects every UPDATE to `public.certificates`, and the snapshot tables are frozen the same way, so later definition supersession, Evidence correction or a change in current eligibility never rewrites what was issued. Lifecycle reactions to those events belong to CERT-004 and CERT-008.

RLS is enabled on all three tables with three `SELECT`-only policies scoped to `auth.uid()`. No student INSERT, UPDATE, DELETE or ALL policy is granted anywhere, and no `anon` or `public` grant exists.

Issuance runs through `public.certificate_issue(...)`, a privileged RPC following the `curriculum_publish_learning_path_tree` convention: `security definer`, fixed `search_path`, and EXECUTE revoked from `public`, `anon` and `authenticated`. In one transaction it locks the definition and confirms it is still published and not superseded, returns any existing record rather than creating a second, confirms every relied-upon Evidence row is unchanged, and only then writes the certificate and both snapshot sets. It is a confirmer, not an evaluator — CERT-002 in TypeScript decides eligibility, and the RPC compares observed values by equality without replaying the Wave 7 correction resolver or recomputing policy counts.

- `20260813000900_certificate_lifecycle_foundation.sql` — Wave 8 Batch 5 CERT-004 Certificate Record and Lifecycle.

Wave 8 Batch 5 adds `public.certificate_lifecycle_events`: an append-only transition history for issued certificates. Every status change is an appended row carrying `previous_status`, `new_status`, a contiguous `sequence_number` unique per certificate, and an `effective_at`. `guard_certificate_lifecycle_append_only` rejects every UPDATE and DELETE, and `guard_certificate_lifecycle_event` enforces the approved edge set — `active → superseded | revoked | corrected | expired`, plus `revoked → active` so a future restore is representable. A no-op transition is rejected by a CHECK constraint.

There is **no cached status column**. Effective lifecycle status is derived at read time from three sources of truth: the immutable issuance record, the expiry pinned at issuance, and the append-only history. Replay fails closed exactly as the Wave 7 effective-state resolver does — a sequence gap, a recorded predecessor that disagrees with the replayed status, or an edge outside the approved set marks the history invalid rather than guessing, and the platform then refuses to assert a status.

`public.certificates` gains a nullable `expires_at timestamptz`, **pinned once at issuance** as `issued_at + the issuance-time definition's expiration_months`. NULL means the certificate does not expire. It is pinned rather than derived because CERT-001 freezes material fields only while a definition is `published`: once a definition is retired its `expiration_months` becomes editable again, so a read-time derivation could silently move an already-issued certificate's expiry. CERT-003's `guard_certificate_immutable` continues to reject every UPDATE to `public.certificates`, so the pinned value can never change after issuance. Time-based expiry applies only to a coherent history that replayed to `active` — a revoked, superseded or corrected certificate keeps that recorded status past its expiry date.

RLS grants students `SELECT` on the lifecycle history of their own certificates only. No student INSERT, UPDATE, DELETE or ALL policy is granted, and no `anon` or `public` grant exists.

`public.certificate_record_lifecycle_event(...)` records one transition atomically, allocating the next sequence number and the preceding status under a row lock so concurrent transitions cannot interleave. It follows the privileged-RPC convention: `security definer`, fixed `search_path`, EXECUTE revoked from `public`, `anon` and `authenticated`. **CERT-004 provides this machinery but exposes no workflow** — the revoke, correct, supersede and restore operations, together with the reason, actor and replacement-certificate reference they carry, belong to CERT-008 and are not implemented here. No public verification exists either; CERT-005 owns that.

This migration also redefines `public.certificate_issue(...)` with `CREATE OR REPLACE`, keeping the identical signature, so the expiry can be pinned inside the same transaction that creates the record. Every CERT-003 issuance guarantee is carried forward and is verified against this effective body by `scripts/verify-wave8.sh`: the definition is locked and must still be published and not superseded, an existing record is returned rather than duplicated, all four transaction-time Evidence pins are confirmed by equality before any insert, snapshot rows may only reference pinned Evidence, and the record plus both snapshot sets are written atomically. `unique (user_id, certificate_definition_id)` is untouched.

Requirement replacement is atomic. `certificate_definition_replace_competencies()` and `certificate_definition_replace_evidence_policies()` perform the DELETE and INSERT inside one PL/pgSQL function, so a failure rolls both back and the previous requirement set survives rather than being left emptied. Both lock the parent definition with `SELECT ... FOR UPDATE`, validate input array lengths, and re-enforce the published freeze before deleting anything. Both follow the privileged-RPC convention of `curriculum_publish_learning_path_tree`: `security definer`, fixed `search_path`, and EXECUTE revoked from `public`, `anon` and `authenticated` so only the service role may call them. No student execution permission is granted.

