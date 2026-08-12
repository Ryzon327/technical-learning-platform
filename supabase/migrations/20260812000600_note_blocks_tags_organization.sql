alter table public.student_notes
    add column if not exists pinned boolean not null default false;

create table if not exists public.student_note_blocks (
    id uuid primary key default gen_random_uuid(),
    note_id uuid not null references public.student_notes(id) on delete cascade,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    block_type text not null check (block_type in (
      'paragraph','heading','bulleted_list','numbered_list','checklist',
      'code','command','terminal_output','quote','callout','link','table'
    )),
    position integer not null check (position >= 0),
    text text not null default '' check (char_length(text) <= 100000),
    language text check (language is null or char_length(language) <= 40),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(note_id, position)
);

create index if not exists student_note_blocks_note_position_idx
on public.student_note_blocks(note_id, position);

alter table public.student_note_blocks enable row level security;

create policy "students read own note blocks"
on public.student_note_blocks for select to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.student_notes n
    where n.id = note_id and n.user_id = auth.uid()
  )
);

create policy "students create own note blocks"
on public.student_note_blocks for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.student_notes n
    where n.id = note_id and n.user_id = auth.uid()
  )
);

create policy "students update own note blocks"
on public.student_note_blocks for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "students delete own note blocks"
on public.student_note_blocks for delete to authenticated
using (auth.uid() = user_id);

create table if not exists public.student_note_tags (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name text not null check (char_length(name) between 1 and 50),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, name)
);

alter table public.student_note_tags enable row level security;

create policy "students read own tags"
on public.student_note_tags for select to authenticated
using (auth.uid() = user_id);

create policy "students create own tags"
on public.student_note_tags for insert to authenticated
with check (auth.uid() = user_id);

create policy "students update own tags"
on public.student_note_tags for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "students delete own tags"
on public.student_note_tags for delete to authenticated
using (auth.uid() = user_id);

create table if not exists public.student_note_tag_assignments (
    note_id uuid not null references public.student_notes(id) on delete cascade,
    tag_id uuid not null references public.student_note_tags(id) on delete cascade,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key(note_id, tag_id)
);

alter table public.student_note_tag_assignments enable row level security;

create policy "students read own note tag assignments"
on public.student_note_tag_assignments for select to authenticated
using (
  auth.uid() = user_id
  and exists (select 1 from public.student_notes n where n.id = note_id and n.user_id = auth.uid())
  and exists (select 1 from public.student_note_tags t where t.id = tag_id and t.user_id = auth.uid())
);

create policy "students create own note tag assignments"
on public.student_note_tag_assignments for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (select 1 from public.student_notes n where n.id = note_id and n.user_id = auth.uid())
  and exists (select 1 from public.student_note_tags t where t.id = tag_id and t.user_id = auth.uid())
);

create policy "students delete own note tag assignments"
on public.student_note_tag_assignments for delete to authenticated
using (auth.uid() = user_id);

create or replace function public.touch_student_note_child_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists student_note_blocks_touch_updated_at on public.student_note_blocks;
create trigger student_note_blocks_touch_updated_at
before update on public.student_note_blocks
for each row execute function public.touch_student_note_child_updated_at();

drop trigger if exists student_note_tags_touch_updated_at on public.student_note_tags;
create trigger student_note_tags_touch_updated_at
before update on public.student_note_tags
for each row execute function public.touch_student_note_child_updated_at();

insert into public.platform_schema_version(component, version)
values ('note-blocks-tags-organization', '0.1.0')
on conflict(component, version) do nothing;
