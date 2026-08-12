-- Wave 3 Batch 4: LEARN-006, LEARN-007, LEARN-008

create table if not exists public.student_review_state (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    competency_stable_id text not null,
    needs_review boolean not null default false,
    reason text,
    last_evaluated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, competency_stable_id)
);

alter table public.student_review_state enable row level security;

create policy "students can read own review state"
on public.student_review_state
for select
to authenticated
using (auth.uid() = user_id);

create table if not exists public.student_learning_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    event_type text not null
        check (
            event_type in (
                'progress',
                'competency',
                'review',
                'administrative_correction'
            )
        ),
    stable_id text not null,
    summary text not null,
    source_reference text,
    occurred_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_student_learning_history_user_time
    on public.student_learning_history (user_id, occurred_at desc);

alter table public.student_learning_history enable row level security;

create policy "students can read own learning history"
on public.student_learning_history
for select
to authenticated
using (auth.uid() = user_id);

-- The browser receives read access only. History and review state are
-- written by trusted server-side learning/competency flows.

insert into public.platform_schema_version (component, version)
values ('learning-history-review', '0.1.0')
on conflict (component, version) do nothing;
