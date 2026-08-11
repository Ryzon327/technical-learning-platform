-- Technical Learning Platform
-- Wave 2 Batch 4: Curriculum quality, assets, and version lineage

create table if not exists public.curriculum_assets (
    id uuid primary key default gen_random_uuid(),
    mission_id uuid not null references public.missions(id) on delete cascade,
    asset_type text not null
        check (asset_type in ('article', 'video', 'lab', 'assessment', 'reference', 'download')),
    title text not null,
    uri text not null,
    position integer not null check (position >= 0),
    required boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (mission_id, position)
);

alter table public.curriculum_assets enable row level security;

create policy "authenticated users can read published mission assets"
on public.curriculum_assets
for select
to authenticated
using (
    exists (
        select 1
        from public.missions m
        where m.id = mission_id
          and m.publication_state = 'published'
    )
);

create table if not exists public.curriculum_version_lineage (
    id uuid primary key default gen_random_uuid(),
    node_type text not null
        check (node_type in ('learning_path', 'course', 'module', 'mission', 'competency')),
    stable_id text not null,
    version integer not null check (version > 0),
    previous_version integer,
    created_at timestamptz not null default now(),
    unique (node_type, stable_id, version),
    check (
        previous_version is null
        or (previous_version > 0 and previous_version < version)
    )
);

alter table public.curriculum_version_lineage enable row level security;

insert into public.platform_schema_version (component, version)
values ('curriculum-quality-assets', '0.1.0')
on conflict (component, version) do nothing;
