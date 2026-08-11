# Supabase

Database changes for the Technical Learning Platform must be introduced through reviewed migrations in `supabase/migrations/`.

Do not make undocumented production schema changes.

## Current implementation migrations

- `20260811000100_platform_foundation.sql`
- `20260811000200_authentication_foundation.sql`
- `20260811000300_curriculum_foundation.sql`
- `20260811000400_curriculum_authoring_publication.sql`
- `20260811000500_curriculum_tree_publication.sql`
- `20260811000600_curriculum_quality_assets.sql`
- `20260811000700_learning_progress_foundation.sql`

## Learning progress boundary

Learning progress belongs to the authenticated student.

Student progress reads are protected by RLS using `auth.uid()` ownership.

Mission progress state transitions are performed through the deterministic `record_mission_progress` function rather than trusting arbitrary client-supplied completion state.

The function resolves authenticated identity, published mission, current mission version, and allowed next state.

## Rules

- Every schema change must be committed as a migration.
- Student-owned data requires explicit RLS ownership.
- Service-role credentials are server-only.
- Production migrations must be reviewed before application.
