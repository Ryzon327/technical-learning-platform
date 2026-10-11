-- Technical Learning Platform — TEST DATABASE ONLY.
--
-- WP-005 / Founder direction G-001. The minimum a hosted Supabase project
-- provides before TLP's own migrations run, so those migrations can be applied
-- UNCHANGED to a plain, disposable PostgreSQL in CI:
--
--   roles     anon, authenticated, service_role (no login; PostgREST switches
--             into them with SET ROLE, as the integration tests do)
--   schema    auth, with auth.users and auth.uid()
--
-- auth.uid() reads the `sub` claim exactly where PostgREST puts it: the
-- transaction-local setting `request.jwt.claims`.
--
-- This file is never applied to a real Supabase project, which already owns
-- every object here. `scripts/test-db-apply-migrations.sh` refuses any database
-- that is not a local, explicitly disposable one.

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
    end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
    select nullif(
        coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
        ),
        ''
    )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
