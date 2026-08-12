# Supabase

Current Learning Engine migrations:

- `20260811000700_learning_progress_foundation.sql`
- `20260811000800_learning_resume_prerequisites.sql`
- `20260811000900_competency_state_foundation.sql`
- `20260811001000_learning_history_review.sql`

## Learning history

Learning history is student-owned and RLS readable only by the owning student.

The browser has no direct write policy. Trusted engine flows append meaningful educational events.

## Review state

Review is modeled as explicit competency review state, not inactivity punishment.

Time away, missed days, streak loss, or engagement frequency do not lower competency or progress.

## Next action

Recommended-next-action logic is deterministic and derived from current progress, resume state, and competency review state.

AI does not choose authoritative progression.

## Wave 4 assessment foundation

Migration `20260812000100_assessment_foundation.sql` adds versioned assessment definitions, server-authoritative question/answer-key storage, and approved competency mappings. Authenticated students may discover published assessment metadata; sanitized question delivery and attempt persistence arrive in later Wave 4 batches.
