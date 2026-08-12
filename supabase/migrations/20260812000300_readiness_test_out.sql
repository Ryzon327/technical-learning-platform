alter table public.assessment_definitions
    add column if not exists test_out_enabled boolean not null default false;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'assessment_test_out_requires_evidence_purpose'
    ) then
        alter table public.assessment_definitions
            add constraint assessment_test_out_requires_evidence_purpose
            check (test_out_enabled = false or purpose = 'evidence_producing');
    end if;
end
$$;

create table if not exists public.assessment_readiness_outcomes (
    id uuid primary key default gen_random_uuid(),
    attempt_id uuid not null unique references public.assessment_attempts(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    assessment_stable_id text not null,
    assessment_version integer not null check (assessment_version > 0),
    outcome text not null check (outcome in ('demonstrated','review_recommended')),
    score_percent numeric(5,2) not null check (score_percent >= 0 and score_percent <= 100),
    passing_percent numeric(5,2) not null check (passing_percent >= 0 and passing_percent <= 100),
    competency_stable_ids jsonb not null default '[]'::jsonb,
    prerequisite_satisfaction_created boolean not null default false,
    source_reference text not null,
    explanation text not null,
    created_at timestamptz not null default now()
);

alter table public.assessment_readiness_outcomes enable row level security;

create policy "students can read own readiness outcomes"
on public.assessment_readiness_outcomes
for select to authenticated
using (auth.uid() = user_id);

insert into public.platform_schema_version (component, version)
values ('readiness-test-out', '0.1.0')
on conflict (component, version) do nothing;
