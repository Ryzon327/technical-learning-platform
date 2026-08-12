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
