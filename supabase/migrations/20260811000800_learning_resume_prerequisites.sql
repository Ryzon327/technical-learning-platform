-- Wave 3 Batch 2: Resume and prerequisite foundation

create table if not exists public.learning_prerequisite_rules (
    id uuid primary key default gen_random_uuid(),
    target_node_type text not null
        check (target_node_type in ('course', 'module', 'mission')),
    target_stable_id text not null,
    requirement_type text not null
        check (
            requirement_type in (
                'content_completion',
                'competency',
                'readiness_assessment',
                'equivalent_competency'
            )
        ),
    requirement_stable_id text not null,
    explanation text not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    unique (
        target_node_type,
        target_stable_id,
        requirement_type,
        requirement_stable_id
    )
);

alter table public.learning_prerequisite_rules enable row level security;

create policy "authenticated users can read active prerequisite rules"
on public.learning_prerequisite_rules
for select
to authenticated
using (active = true);

create table if not exists public.learning_requirement_satisfactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    requirement_type text not null
        check (
            requirement_type in (
                'competency',
                'readiness_assessment',
                'equivalent_competency'
            )
        ),
    requirement_stable_id text not null,
    source_reference text not null,
    satisfied_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (
        user_id,
        requirement_type,
        requirement_stable_id
    )
);

alter table public.learning_requirement_satisfactions enable row level security;

create policy "students can read own authoritative requirement satisfactions"
on public.learning_requirement_satisfactions
for select
to authenticated
using (auth.uid() = user_id);

insert into public.platform_schema_version (component, version)
values ('learning-resume-prerequisites', '0.1.0')
on conflict (component, version) do nothing;
