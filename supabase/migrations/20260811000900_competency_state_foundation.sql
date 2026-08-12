-- Wave 3 Batch 3: LEARN-003 Competency State and Advancement

create table if not exists public.student_competency_state (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    competency_stable_id text not null,
    curriculum_version integer not null check (curriculum_version > 0),
    state text not null
        check (
            state in (
                'not_started',
                'developing',
                'demonstrated',
                'needs_review'
            )
        ),
    demonstrated_at timestamptz,
    last_evaluated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, competency_stable_id)
);

alter table public.student_competency_state enable row level security;

create policy "students can read own competency state"
on public.student_competency_state
for select
to authenticated
using (auth.uid() = user_id);

create table if not exists public.student_competency_evidence_refs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    competency_stable_id text not null,
    evidence_type text not null
        check (
            evidence_type in (
                'mission_completion',
                'assessment',
                'lab',
                'portfolio',
                'administrative_correction'
            )
        ),
    evidence_reference text not null,
    accepted boolean not null default false,
    occurred_at timestamptz not null,
    created_at timestamptz not null default now(),
    unique (
        user_id,
        competency_stable_id,
        evidence_type,
        evidence_reference
    )
);

alter table public.student_competency_evidence_refs enable row level security;

create policy "students can read own competency evidence refs"
on public.student_competency_evidence_refs
for select
to authenticated
using (auth.uid() = user_id);

create table if not exists public.student_competency_state_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    competency_stable_id text not null,
    curriculum_version integer not null check (curriculum_version > 0),
    previous_state text,
    new_state text not null,
    reason text not null,
    source_reference text,
    occurred_at timestamptz not null default now()
);

alter table public.student_competency_state_events enable row level security;

create policy "students can read own competency state events"
on public.student_competency_state_events
for select
to authenticated
using (auth.uid() = user_id);

-- Authenticated users receive read access through RLS only.
-- There are intentionally no authenticated INSERT/UPDATE policies.
-- Competency state and accepted evidence are written by trusted server-side flows.

insert into public.platform_schema_version (component, version)
values ('competency-state-foundation', '0.1.0')
on conflict (component, version) do nothing;
