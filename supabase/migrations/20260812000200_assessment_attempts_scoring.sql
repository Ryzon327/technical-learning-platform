-- Wave 4 Batch 2: assessment attempts and deterministic scoring

create table if not exists public.assessment_attempts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    assessment_id uuid not null references public.assessment_definitions(id),
    assessment_stable_id text not null,
    assessment_version integer not null check (assessment_version > 0),
    attempt_number integer not null check (attempt_number > 0),
    state text not null
        check (state in ('in_progress','submitted','passed','failed','interrupted')),
    passing_percent numeric(5,2) not null check (passing_percent >= 0 and passing_percent <= 100),
    earned_points numeric(10,2),
    possible_points numeric(10,2),
    score_percent numeric(5,2),
    started_at timestamptz not null default now(),
    submitted_at timestamptz,
    interrupted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, assessment_id, attempt_number)
);

create index if not exists idx_assessment_attempts_user_assessment
    on public.assessment_attempts (user_id, assessment_id, attempt_number desc);

create table if not exists public.assessment_attempt_answers (
    id uuid primary key default gen_random_uuid(),
    attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
    question_stable_id text not null,
    selected_option_ids jsonb not null default '[]'::jsonb,
    saved_at timestamptz not null default now(),
    unique (attempt_id, question_stable_id)
);

alter table public.assessment_attempts enable row level security;
alter table public.assessment_attempt_answers enable row level security;

create policy "students can read own assessment attempts"
on public.assessment_attempts
for select
to authenticated
using (auth.uid() = user_id);

create policy "students can read own assessment answers"
on public.assessment_attempt_answers
for select
to authenticated
using (
    exists (
        select 1
        from public.assessment_attempts attempt
        where attempt.id = assessment_attempt_answers.attempt_id
          and attempt.user_id = auth.uid()
    )
);

-- There are intentionally no authenticated INSERT/UPDATE policies.
-- Student attempt mutations are mediated by trusted API flows so that:
--  * answer keys stay server-only;
--  * assessment versions remain frozen per attempt;
--  * attempt limits cannot be bypassed;
--  * clients cannot submit their own score/pass state.

insert into public.platform_schema_version (component, version)
values ('assessment-attempts-scoring', '0.1.0')
on conflict (component, version) do nothing;
