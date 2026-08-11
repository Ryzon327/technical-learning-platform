-- Technical Learning Platform
-- Wave 2 Batch 2: Curriculum authoring and publication workflow
--
-- Student-facing RLS from the previous migration remains published-only.
-- Founder/admin write operations are performed through server-authorized API paths.

create table if not exists public.curriculum_publication_events (
    id uuid primary key default gen_random_uuid(),
    node_type text not null
        check (node_type in ('learning_path', 'course', 'module', 'mission', 'competency')),
    node_id uuid not null,
    stable_id text not null,
    version integer not null check (version > 0),
    from_state text not null
        check (from_state in ('draft', 'review', 'published', 'retired')),
    to_state text not null
        check (to_state in ('draft', 'review', 'published', 'retired')),
    actor_user_id uuid not null references auth.users(id),
    reason text,
    occurred_at timestamptz not null default now()
);

create index if not exists idx_curriculum_publication_events_node
    on public.curriculum_publication_events (node_type, node_id, occurred_at desc);

alter table public.curriculum_publication_events enable row level security;

-- No student policy is intentionally created.
-- Founder/admin access occurs through trusted server-side operations.

create or replace function public.curriculum_valid_transition(
    current_state text,
    next_state text
)
returns boolean
language sql
immutable
as $$
    select case
        when current_state = next_state then true
        when current_state = 'draft' and next_state in ('review', 'retired') then true
        when current_state = 'review' and next_state in ('draft', 'published', 'retired') then true
        when current_state = 'published' and next_state = 'retired' then true
        when current_state = 'retired' and next_state = 'draft' then true
        else false
    end;
$$;

insert into public.platform_schema_version (component, version)
values ('curriculum-authoring-publication', '0.1.0')
on conflict (component, version) do nothing;
