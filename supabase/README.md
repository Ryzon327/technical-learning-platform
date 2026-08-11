# Supabase

Database changes for the Technical Learning Platform must be introduced through reviewed migrations in `supabase/migrations/`.

Do not make undocumented production schema changes.

## Current migrations

- `20260811000100_platform_foundation.sql`
  - platform schema-version metadata;
  - RLS baseline.

- `20260811000200_authentication_foundation.sql`
  - user profiles and authentication role metadata.

- `20260811000300_curriculum_foundation.sql`
  - learning paths;
  - courses;
  - modules;
  - missions;
  - competencies;
  - prerequisites and competency links;
  - publication states;
  - published-only student RLS.

- `20260811000400_curriculum_authoring_publication.sql`
  - curriculum publication history;
  - deterministic publication-state transition helper.

## Curriculum authoring boundary

Student-facing reads remain RLS-limited to published content.

Founder/admin write operations are performed through protected server routes using trusted Founder/admin authorization.

Privileged credentials remain server-only.

## Publication workflow

Draft content does not become student-readable until:

1. it moves to review;
2. validation passes;
3. a Founder/admin explicitly transitions it to published.

## Rules

- Every schema change must be committed as a migration.
- RLS is required for student-facing data.
- Service-role credentials are server-only.
- Production migrations must be reviewed before application.
