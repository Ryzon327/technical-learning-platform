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
