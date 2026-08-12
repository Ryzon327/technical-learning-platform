create table if not exists public.lab_definitions (
 id uuid primary key default gen_random_uuid(), stable_id text not null, version integer not null check(version>0),
 name text not null, description text not null default '', mission_stable_id text not null,
 competency_stable_ids jsonb not null default '[]'::jsonb, required_capabilities jsonb not null default '[]'::jsonb,
 resources jsonb not null default '[]'::jsonb, access_methods jsonb not null default '[]'::jsonb,
 estimated_duration_minutes integer not null check(estimated_duration_minutes>0), session_limit_minutes integer not null check(session_limit_minutes>=estimated_duration_minutes),
 validation_profile_stable_id text not null, reset_strategy text not null check(reset_strategy in ('recreate','snapshot','provider_reset')),
 safety jsonb not null, accessibility jsonb not null, data_persistence_policy text not null check(data_persistence_policy in ('ephemeral','session')),
 publication_state text not null default 'draft' check(publication_state in ('draft','review','published','retired')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(stable_id,version)
);
create index if not exists lab_definitions_publication_idx on public.lab_definitions(publication_state,stable_id,version desc);
alter table public.lab_definitions enable row level security;
create policy "authenticated read published labs" on public.lab_definitions for select to authenticated using(publication_state='published');
-- Founder/admin authoring remains server-side through governed admin access; no student write policy is granted here.
insert into public.platform_schema_version(component,version) values('lab-definition-foundation','0.1.0') on conflict(component,version) do nothing;
