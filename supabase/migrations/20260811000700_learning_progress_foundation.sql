-- Technical Learning Platform
-- Wave 3 Batch 1: LEARN-001 Learning Progress Foundation

create table if not exists public.student_learning_progress (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    node_type text not null
        check (node_type in ('learning_path', 'course', 'module', 'mission')),
    node_stable_id text not null,
    curriculum_version integer not null check (curriculum_version > 0),
    state text not null
        check (
            state in (
                'not_started',
                'in_progress',
                'completed',
                'competency_demonstrated',
                'needs_review',
                'blocked_by_prerequisite'
            )
        ),
    started_at timestamptz,
    completed_at timestamptz,
    last_activity_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, node_type, node_stable_id)
);

create index if not exists idx_student_learning_progress_user_activity
    on public.student_learning_progress (user_id, last_activity_at desc);

alter table public.student_learning_progress enable row level security;

create policy "students can read own learning progress"
on public.student_learning_progress
for select
to authenticated
using (auth.uid() = user_id);

create table if not exists public.student_learning_progress_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    node_type text not null
        check (node_type in ('learning_path', 'course', 'module', 'mission')),
    node_stable_id text not null,
    curriculum_version integer not null check (curriculum_version > 0),
    previous_state text,
    new_state text not null,
    occurred_at timestamptz not null default now()
);

create index if not exists idx_student_learning_progress_events_user_time
    on public.student_learning_progress_events (user_id, occurred_at desc);

alter table public.student_learning_progress_events enable row level security;

create policy "students can read own learning progress events"
on public.student_learning_progress_events
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.record_mission_progress(
    target_mission_stable_id text,
    target_action text
)
returns table (
    node_type text,
    node_stable_id text,
    curriculum_version integer,
    state text,
    started_at timestamptz,
    completed_at timestamptz,
    last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_user_id uuid;
    target_mission_version integer;
    existing_state text;
    next_state text;
    now_at timestamptz := now();
begin
    actor_user_id := auth.uid();

    if actor_user_id is null then
        raise exception 'Authentication required';
    end if;

    select m.version
    into target_mission_version
    from public.missions m
    where m.stable_id = target_mission_stable_id
      and m.publication_state = 'published'
    order by m.version desc
    limit 1;

    if target_mission_version is null then
        raise exception 'Published mission not found';
    end if;

    select p.state
    into existing_state
    from public.student_learning_progress p
    where p.user_id = actor_user_id
      and p.node_type = 'mission'
      and p.node_stable_id = target_mission_stable_id
    for update;

    if target_action = 'start' then
        if existing_state in ('completed', 'competency_demonstrated') then
            next_state := existing_state;
        else
            next_state := 'in_progress';
        end if;
    elsif target_action = 'complete' then
        next_state := 'completed';
    else
        raise exception 'Unsupported mission progress action';
    end if;

    insert into public.student_learning_progress (
        user_id,
        node_type,
        node_stable_id,
        curriculum_version,
        state,
        started_at,
        completed_at,
        last_activity_at
    )
    values (
        actor_user_id,
        'mission',
        target_mission_stable_id,
        target_mission_version,
        next_state,
        now_at,
        case
            when next_state in ('completed', 'competency_demonstrated')
                then now_at
            else null
        end,
        now_at
    )
    on conflict (user_id, node_type, node_stable_id)
    do update set
        curriculum_version = excluded.curriculum_version,
        state = excluded.state,
        started_at = coalesce(
            public.student_learning_progress.started_at,
            excluded.started_at
        ),
        completed_at = case
            when excluded.state in ('completed', 'competency_demonstrated')
                then coalesce(
                    public.student_learning_progress.completed_at,
                    excluded.completed_at
                )
            else public.student_learning_progress.completed_at
        end,
        last_activity_at = excluded.last_activity_at,
        updated_at = now_at;

    if existing_state is distinct from next_state then
        insert into public.student_learning_progress_events (
            user_id,
            node_type,
            node_stable_id,
            curriculum_version,
            previous_state,
            new_state,
            occurred_at
        )
        values (
            actor_user_id,
            'mission',
            target_mission_stable_id,
            target_mission_version,
            existing_state,
            next_state,
            now_at
        );
    end if;

    return query
    select
        p.node_type,
        p.node_stable_id,
        p.curriculum_version,
        p.state,
        p.started_at,
        p.completed_at,
        p.last_activity_at
    from public.student_learning_progress p
    where p.user_id = actor_user_id
      and p.node_type = 'mission'
      and p.node_stable_id = target_mission_stable_id;
end;
$$;

revoke all on function public.record_mission_progress(text, text)
from public, anon;

grant execute on function public.record_mission_progress(text, text)
to authenticated;

create or replace function public.learning_progress_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists student_learning_progress_set_updated_at
on public.student_learning_progress;

create trigger student_learning_progress_set_updated_at
before update on public.student_learning_progress
for each row execute function public.learning_progress_set_updated_at();

insert into public.platform_schema_version (component, version)
values ('learning-progress-foundation', '0.1.0')
on conflict (component, version) do nothing;
