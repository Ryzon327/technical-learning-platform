create table if not exists public.student_notes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null default '' check(char_length(title)<=200), body text not null default '' check(char_length(body)<=100000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists student_notes_user_updated_idx on public.student_notes(user_id,updated_at desc);
alter table public.student_notes enable row level security;
create policy "students read own notes" on public.student_notes for select to authenticated using(auth.uid()=user_id);
create policy "students create own notes" on public.student_notes for insert to authenticated with check(auth.uid()=user_id);
create policy "students update own notes" on public.student_notes for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "students delete own notes" on public.student_notes for delete to authenticated using(auth.uid()=user_id);
create table if not exists public.student_note_contexts (
 id uuid primary key default gen_random_uuid(), note_id uuid not null references public.student_notes(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 context_type text not null check(context_type in ('learning_path','course','module','mission','competency','lab_definition','lab_session','content_asset')),
 context_stable_id text not null, context_version integer check(context_version is null or context_version>0), created_at timestamptz not null default now());
alter table public.student_note_contexts enable row level security;
create policy "students read own note contexts" on public.student_note_contexts for select to authenticated using(auth.uid()=user_id and exists(select 1 from public.student_notes n where n.id=note_id and n.user_id=auth.uid()));
create policy "students create own note contexts" on public.student_note_contexts for insert to authenticated with check(auth.uid()=user_id and exists(select 1 from public.student_notes n where n.id=note_id and n.user_id=auth.uid()));
create policy "students delete own note contexts" on public.student_note_contexts for delete to authenticated using(auth.uid()=user_id);
create or replace function public.touch_student_note_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists student_notes_touch_updated_at on public.student_notes;
create trigger student_notes_touch_updated_at before update on public.student_notes for each row execute function public.touch_student_note_updated_at();
insert into public.platform_schema_version(component,version) values('student-notes-foundation','0.1.0') on conflict(component,version) do nothing;
