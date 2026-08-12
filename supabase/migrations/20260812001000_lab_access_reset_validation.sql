alter table public.lab_sessions add column if not exists access_revoked_at timestamptz;

create table if not exists public.lab_session_runtime_state (
  lab_session_id uuid primary key references public.lab_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reset_count integer not null default 0 check(reset_count>=0),
  last_reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lab_session_runtime_state enable row level security;
create policy "students read own lab runtime state" on public.lab_session_runtime_state for select to authenticated using(auth.uid()=user_id);
-- Mutation is server-only. Students cannot change reset counters directly.

create table if not exists public.lab_validation_checks (
  profile_stable_id text not null,
  stable_id text not null,
  probe_id text not null,
  title text not null,
  explanation text not null,
  required boolean not null default true,
  publication_state text not null default 'draft' check(publication_state in ('draft','review','published','retired')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key(profile_stable_id,stable_id)
);
alter table public.lab_validation_checks enable row level security;
create policy "authenticated users read published lab validation checks" on public.lab_validation_checks for select to authenticated using(publication_state='published');

create table if not exists public.lab_validation_runs (
  id uuid primary key default gen_random_uuid(),
  lab_session_id uuid not null references public.lab_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_stable_id text not null,
  state text not null check(state in ('passed','incomplete','technical_error')),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.lab_validation_runs enable row level security;
create policy "students read own lab validation runs" on public.lab_validation_runs for select to authenticated using(auth.uid()=user_id);

create table if not exists public.lab_validation_results (
  id uuid primary key default gen_random_uuid(),
  validation_run_id uuid not null references public.lab_validation_runs(id) on delete cascade,
  lab_session_id uuid not null references public.lab_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  check_stable_id text not null,
  title text not null,
  required boolean not null,
  state text not null check(state in ('passed','failed','technical_error')),
  passed boolean,
  explanation text not null,
  created_at timestamptz not null default now()
);
alter table public.lab_validation_results enable row level security;
create policy "students read own lab validation results" on public.lab_validation_results for select to authenticated using(auth.uid()=user_id);
-- Validation run/result creation is server-only. Students cannot submit arbitrary privileged probe definitions.

create index if not exists lab_validation_runs_session_checked_idx on public.lab_validation_runs(lab_session_id,checked_at desc);
create index if not exists lab_validation_results_run_idx on public.lab_validation_results(validation_run_id);
insert into public.platform_schema_version(component,version) values('lab-access-reset-validation','0.1.0') on conflict(component,version) do nothing;
