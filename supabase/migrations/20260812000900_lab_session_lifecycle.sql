create table if not exists public.lab_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 lab_definition_stable_id text not null,
 lab_definition_version integer not null check(lab_definition_version>0),
 provider_id text,
 lifecycle_state text not null default 'requested' check(lifecycle_state in ('requested','queued','provisioning','ready','active','validating','completed','cleaning','terminated','provisioning_failed','degraded','recovery_required','expired','cleanup_failed')),
 requested_at timestamptz not null default now(),
 ready_at timestamptz, active_at timestamptz, last_activity_at timestamptz, expires_at timestamptz,
 validation_state_reference text,
 cleanup_state text not null default 'not_required' check(cleanup_state in ('not_required','pending','cleaning','complete','failed')),
 failure_code text, failure_message text, connection_metadata_reference text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(lab_definition_stable_id,lab_definition_version) references public.lab_definitions(stable_id,version)
);
create index if not exists lab_sessions_user_requested_idx on public.lab_sessions(user_id,requested_at desc);
create index if not exists lab_sessions_state_expiration_idx on public.lab_sessions(lifecycle_state,expires_at);
create unique index if not exists lab_sessions_one_live_definition_per_user_idx on public.lab_sessions(user_id,lab_definition_stable_id)
where lifecycle_state in ('requested','queued','provisioning','ready','active','validating','completed','cleaning','degraded','recovery_required','expired','cleanup_failed');

alter table public.lab_sessions enable row level security;
create policy "students read own lab sessions" on public.lab_sessions for select to authenticated using(auth.uid()=user_id);
create policy "students request own lab sessions" on public.lab_sessions for insert to authenticated
with check(auth.uid()=user_id and lifecycle_state='requested' and provider_id is null and cleanup_state='not_required');
-- Deliberately no authenticated UPDATE or DELETE policy. Student clients cannot mutate lifecycle state directly.

create table if not exists public.lab_session_provider_references (
 lab_session_id uuid primary key references public.lab_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 provider_id text not null, provider_session_id text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(provider_id,provider_session_id)
);
alter table public.lab_session_provider_references enable row level security;
-- No authenticated policies are granted on provider references. Provider resource identifiers are server-only.

create or replace function public.touch_lab_session_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists lab_sessions_touch_updated_at on public.lab_sessions;
create trigger lab_sessions_touch_updated_at before update on public.lab_sessions for each row execute function public.touch_lab_session_updated_at();
drop trigger if exists lab_session_provider_refs_touch_updated_at on public.lab_session_provider_references;
create trigger lab_session_provider_refs_touch_updated_at before update on public.lab_session_provider_references for each row execute function public.touch_lab_session_updated_at();

insert into public.platform_schema_version(component,version) values('lab-session-lifecycle','0.1.0') on conflict(component,version) do nothing;
