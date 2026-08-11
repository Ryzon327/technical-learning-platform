# Supabase

Database changes must be introduced through reviewed migrations in `supabase/migrations/`.

## Current curriculum migrations

- `20260811000300_curriculum_foundation.sql`
- `20260811000400_curriculum_authoring_publication.sql`
- `20260811000500_curriculum_tree_publication.sql`
- `20260811000600_curriculum_quality_assets.sql`

Student reads remain RLS-limited to published curriculum. Founder/admin authoring and publication remain server-side and AAL2 protected.
