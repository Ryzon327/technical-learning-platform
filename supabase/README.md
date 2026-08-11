# Supabase

Database changes for the Technical Learning Platform must be introduced through reviewed migrations in `supabase/migrations/`.

Do not make undocumented production schema changes.

## Build Wave 0 baseline

`20260811000100_platform_foundation.sql` establishes only platform schema-version metadata and enables Row Level Security.

It deliberately does **not** create student, curriculum, learning, evidence, or certificate data models yet. Those schemas belong to their approved implementation waves.

## Rules

- Every schema change must be committed as a migration.
- RLS is required for student-facing data unless a documented architecture decision says otherwise.
- Service-role credentials are server-only.
- Production migrations must be reviewed before application.
