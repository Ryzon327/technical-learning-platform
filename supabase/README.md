# Supabase

Database changes for the Technical Learning Platform must be introduced through reviewed migrations in `supabase/migrations/`.

Do not make undocumented production schema changes.

## Current migrations

- `20260811000100_platform_foundation.sql`
  - platform schema-version metadata;
  - RLS baseline.

- `20260811000200_authentication_foundation.sql`
  - application `user_profiles`;
  - student/founder-admin role constraint;
  - self-read profile RLS;
  - restricted self-update;
  - automatic student profile creation from `auth.users`.

## Authentication boundary

Supabase Auth owns:

- passwords;
- authentication identities;
- authentication sessions;
- provider identity state.

`public.user_profiles` owns only application profile and role metadata.

The browser uses only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The service-role key is **server-only**.

## Founder/admin role

The initial migration never allows normal signup to assign `founder_admin`.

Founder/admin elevation must be performed through an explicitly authorized administrative path in a later Wave 1 batch.

## Rules

- Every schema change must be committed as a migration.
- RLS is required for student-facing data unless a documented architecture decision says otherwise.
- Service-role credentials are server-only.
- Production migrations must be reviewed before application.
