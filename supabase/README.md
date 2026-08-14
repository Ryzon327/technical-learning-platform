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

