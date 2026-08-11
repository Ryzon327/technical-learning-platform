# Supabase

Database changes for the Technical Learning Platform must be introduced through reviewed migrations in `supabase/migrations/`.

Do not make undocumented production schema changes.

## Current migrations

- `20260811000100_platform_foundation.sql`
  - platform schema-version metadata;
  - RLS baseline.

- `20260811000200_authentication_foundation.sql`
  - application user profiles;
  - student/founder-admin role constraint;
  - profile RLS;
  - automatic profile creation.

- `20260811000300_curriculum_foundation.sql`
  - learning paths;
  - courses;
  - modules;
  - missions;
  - competencies;
  - competency prerequisites;
  - mission competency links;
  - stable IDs and versions;
  - publication states;
  - student-facing published-only RLS.

## Curriculum boundary

Student-facing curriculum reads are RLS-limited to `published`.

Draft/review/retired authoring access is reserved for a later Founder/admin curriculum-authoring batch.

## Authentication boundary

Supabase Auth owns credentials and sessions.

The browser uses only public Supabase configuration.

Privileged service-role credentials remain server-only.

## Rules

- Every schema change must be committed as a migration.
- RLS is required for student-facing data unless a documented architecture decision says otherwise.
- Service-role credentials are server-only.
- Production migrations must be reviewed before application.
