-- Wave 4 Batch 1: deterministic assessment foundation

create table if not exists public.assessment_definitions (
    id uuid primary key default gen_random_uuid(),
    stable_id text not null,
    version integer not null check (version > 0),
    title text not null,
    purpose text not null check (purpose in ('practice','diagnostic','evidence_producing')),
    passing_percent numeric(5,2) not null check (passing_percent >= 0 and passing_percent <= 100),
    max_attempts integer check (max_attempts is null or max_attempts > 0),
    publication_state text not null default 'draft' check (publication_state in ('draft','review','published','retired')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (stable_id, version)
);

create table if not exists public.assessment_questions (
    id uuid primary key default gen_random_uuid(),
    assessment_id uuid not null references public.assessment_definitions(id) on delete cascade,
    stable_id text not null,
    version integer not null check (version > 0),
    question_type text not null check (question_type in ('single_choice','multiple_choice','boolean')),
    prompt text not null,
    position integer not null check (position > 0),
    points numeric(8,2) not null check (points > 0),
    options jsonb not null default '[]'::jsonb,
    -- Server-authoritative answer key. RLS intentionally provides no authenticated SELECT policy on this table.
    correct_option_ids jsonb not null default '[]'::jsonb,
    unique (assessment_id, stable_id, version),
    unique (assessment_id, position)
);

create table if not exists public.assessment_competency_mappings (
    id uuid primary key default gen_random_uuid(),
    assessment_id uuid not null references public.assessment_definitions(id) on delete cascade,
    competency_stable_id text not null,
    competency_version integer not null check (competency_version > 0),
    required boolean not null default true,
    created_at timestamptz not null default now(),
    unique (assessment_id, competency_stable_id, competency_version)
);

alter table public.assessment_definitions enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_competency_mappings enable row level security;

create policy "students can list published assessment definitions"
on public.assessment_definitions for select to authenticated
using (publication_state = 'published');

-- Questions/answer keys and mappings are deliberately server-only in Batch 1.
-- A later Wave 4 batch will expose a sanitized question-delivery contract that never returns answer keys.

insert into public.platform_schema_version (component, version)
values ('assessment-foundation', '0.1.0')
on conflict (component, version) do nothing;
