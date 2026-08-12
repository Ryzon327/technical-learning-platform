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
