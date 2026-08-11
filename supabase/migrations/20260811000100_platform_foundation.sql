-- Technical Learning Platform
-- Build Wave 0: platform foundation
--
-- This migration intentionally creates only infrastructure-neutral metadata.
-- Product-domain tables begin in later implementation waves.

create extension if not exists pgcrypto;

create table if not exists public.platform_schema_version (
    id uuid primary key default gen_random_uuid(),
    component text not null,
    version text not null,
    applied_at timestamptz not null default now(),
    constraint platform_schema_version_component_version_key
        unique (component, version)
);

insert into public.platform_schema_version (component, version)
values ('platform-foundation', '0.1.0')
on conflict (component, version) do nothing;

comment on table public.platform_schema_version is
'Tracks explicitly applied Technical Learning Platform schema components.';

alter table public.platform_schema_version enable row level security;

-- No general client policy is intentionally created.
-- This table is platform-operational metadata and is not student writable.
