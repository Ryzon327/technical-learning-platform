-- Technical Learning Platform
-- Wave 2: Curriculum foundation
--
-- Establishes stable/versioned curriculum hierarchy:
-- learning path -> course -> module -> mission
-- plus competency and prerequisite relationships.

create table if not exists public.learning_paths (
    id uuid primary key default gen_random_uuid(),
    stable_id text not null,
    version integer not null default 1 check (version > 0),
    title text not null,
    description text,
    publication_state text not null default 'draft'
        check (publication_state in ('draft', 'review', 'published', 'retired')),
    estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (stable_id, version)
);

create table if not exists public.courses (
    id uuid primary key default gen_random_uuid(),
    stable_id text not null,
    version integer not null default 1 check (version > 0),
    learning_path_id uuid not null references public.learning_paths(id) on delete cascade,
    title text not null,
    description text,
    position integer not null check (position >= 0),
    publication_state text not null default 'draft'
        check (publication_state in ('draft', 'review', 'published', 'retired')),
    estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (stable_id, version),
    unique (learning_path_id, position)
);

create table if not exists public.learning_modules (
    id uuid primary key default gen_random_uuid(),
    stable_id text not null,
    version integer not null default 1 check (version > 0),
    course_id uuid not null references public.courses(id) on delete cascade,
    title text not null,
    description text,
    position integer not null check (position >= 0),
    publication_state text not null default 'draft'
        check (publication_state in ('draft', 'review', 'published', 'retired')),
    estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (stable_id, version),
    unique (course_id, position)
);

create table if not exists public.missions (
    id uuid primary key default gen_random_uuid(),
    stable_id text not null,
    version integer not null default 1 check (version > 0),
    module_id uuid not null references public.learning_modules(id) on delete cascade,
    title text not null,
    description text,
    position integer not null check (position >= 0),
    publication_state text not null default 'draft'
        check (publication_state in ('draft', 'review', 'published', 'retired')),
    estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (stable_id, version),
    unique (module_id, position)
);

create table if not exists public.competencies (
    id uuid primary key default gen_random_uuid(),
    stable_id text not null,
    version integer not null default 1 check (version > 0),
    title text not null,
    description text,
    publication_state text not null default 'draft'
        check (publication_state in ('draft', 'review', 'published', 'retired')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (stable_id, version)
);

create table if not exists public.competency_prerequisites (
    competency_id uuid not null references public.competencies(id) on delete cascade,
    prerequisite_competency_id uuid not null references public.competencies(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (competency_id, prerequisite_competency_id),
    check (competency_id <> prerequisite_competency_id)
);

create table if not exists public.mission_competencies (
    mission_id uuid not null references public.missions(id) on delete cascade,
    competency_id uuid not null references public.competencies(id) on delete cascade,
    required boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (mission_id, competency_id)
);

create index if not exists idx_courses_learning_path
    on public.courses (learning_path_id, position);

create index if not exists idx_learning_modules_course
    on public.learning_modules (course_id, position);

create index if not exists idx_missions_module
    on public.missions (module_id, position);

create index if not exists idx_learning_paths_publication
    on public.learning_paths (publication_state);

create index if not exists idx_competencies_publication
    on public.competencies (publication_state);

alter table public.learning_paths enable row level security;
alter table public.courses enable row level security;
alter table public.learning_modules enable row level security;
alter table public.missions enable row level security;
alter table public.competencies enable row level security;
alter table public.competency_prerequisites enable row level security;
alter table public.mission_competencies enable row level security;

create policy "authenticated users can read published learning paths"
on public.learning_paths
for select
to authenticated
using (publication_state = 'published');

create policy "authenticated users can read published courses"
on public.courses
for select
to authenticated
using (publication_state = 'published');

create policy "authenticated users can read published modules"
on public.learning_modules
for select
to authenticated
using (publication_state = 'published');

create policy "authenticated users can read published missions"
on public.missions
for select
to authenticated
using (publication_state = 'published');

create policy "authenticated users can read published competencies"
on public.competencies
for select
to authenticated
using (publication_state = 'published');

create policy "authenticated users can read published competency prerequisites"
on public.competency_prerequisites
for select
to authenticated
using (
    exists (
        select 1
        from public.competencies c
        where c.id = competency_id
          and c.publication_state = 'published'
    )
    and exists (
        select 1
        from public.competencies p
        where p.id = prerequisite_competency_id
          and p.publication_state = 'published'
    )
);

create policy "authenticated users can read published mission competency links"
on public.mission_competencies
for select
to authenticated
using (
    exists (
        select 1
        from public.missions m
        where m.id = mission_id
          and m.publication_state = 'published'
    )
    and exists (
        select 1
        from public.competencies c
        where c.id = competency_id
          and c.publication_state = 'published'
    )
);

create or replace function public.curriculum_set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists learning_paths_set_updated_at on public.learning_paths;
create trigger learning_paths_set_updated_at
before update on public.learning_paths
for each row execute function public.curriculum_set_updated_at();

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.curriculum_set_updated_at();

drop trigger if exists learning_modules_set_updated_at on public.learning_modules;
create trigger learning_modules_set_updated_at
before update on public.learning_modules
for each row execute function public.curriculum_set_updated_at();

drop trigger if exists missions_set_updated_at on public.missions;
create trigger missions_set_updated_at
before update on public.missions
for each row execute function public.curriculum_set_updated_at();

drop trigger if exists competencies_set_updated_at on public.competencies;
create trigger competencies_set_updated_at
before update on public.competencies
for each row execute function public.curriculum_set_updated_at();

insert into public.platform_schema_version (component, version)
values ('curriculum-foundation', '0.1.0')
on conflict (component, version) do nothing;
