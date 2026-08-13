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
