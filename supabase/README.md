# Supabase

Current Learning Engine implementation migrations:

- `20260811000700_learning_progress_foundation.sql`
- `20260811000800_learning_resume_prerequisites.sql`
- `20260811000900_competency_state_foundation.sql`

## Competency state

Student competency state is RLS-readable by its owner.

Authenticated clients have no direct write policy for competency state, accepted evidence references, or competency transition events.

Competency advancement is server authoritative. Later Assessment, Lab, Evidence, and Portfolio engines contribute evidence references through trusted server-side integrations.

AI does not decide mastery.

## Auditability

Competency state transitions are appended to `student_competency_state_events`.

Administrative correction is represented as an evidence source and must remain attributable rather than silently rewriting student history.
