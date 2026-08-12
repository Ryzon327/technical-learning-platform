create index if not exists student_notes_title_lower_idx
on public.student_notes(user_id, lower(title));

create index if not exists student_note_contexts_lookup_idx
on public.student_note_contexts(user_id, context_type, context_stable_id);

create index if not exists student_note_tag_assignments_user_idx
on public.student_note_tag_assignments(user_id, tag_id, note_id);

create index if not exists student_note_blocks_user_note_idx
on public.student_note_blocks(user_id, note_id);

create table if not exists public.student_bookmarks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    target_type text not null check (target_type in (
      'learning_path','course','module','mission','competency',
      'content_asset','lab_definition','lab_session','note'
    )),
    target_stable_id text not null,
    target_version integer check (target_version is null or target_version > 0),
    label text check (label is null or char_length(label) <= 160),
    created_at timestamptz not null default now(),
    unique(user_id, target_type, target_stable_id, target_version)
);

alter table public.student_bookmarks enable row level security;

create policy "students read own bookmarks"
on public.student_bookmarks for select to authenticated
using (auth.uid() = user_id);

create policy "students create own bookmarks"
on public.student_bookmarks for insert to authenticated
with check (auth.uid() = user_id);

create policy "students delete own bookmarks"
on public.student_bookmarks for delete to authenticated
using (auth.uid() = user_id);

insert into public.platform_schema_version(component, version)
values ('note-retrieval-bookmarks', '0.1.0')
on conflict(component, version) do nothing;
