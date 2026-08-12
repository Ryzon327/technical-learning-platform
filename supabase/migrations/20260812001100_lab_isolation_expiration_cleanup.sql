create table if not exists public.lab_operations (
  id uuid primary key default gen_random_uuid(),
  lab_session_id uuid not null references public.lab_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('expire','cleanup','recover')),
  state text not null default 'pending' check (state in ('pending','running','succeeded','failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lab_operations_due_idx
on public.lab_operations(state, next_attempt_at)
where state = 'failed';

alter table public.lab_operations enable row level security;

create policy "students read own lab operations"
on public.lab_operations for select to authenticated
using (auth.uid() = user_id);

-- Creation/mutation is server-only so students cannot forge operational state.

create or replace view public.lab_operations_requiring_attention as
select *
from public.lab_operations
where state = 'failed'
  and (attempt_count >= 5 or next_attempt_at is null);

insert into public.platform_schema_version(component, version)
values ('lab-isolation-expiration-cleanup', '0.1.0')
on conflict(component, version) do nothing;
