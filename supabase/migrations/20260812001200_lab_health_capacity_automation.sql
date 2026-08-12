create table if not exists public.lab_provider_operational_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  health_state text not null check (health_state in ('healthy','degraded','unavailable')),
  health_detail text,
  capacity_available boolean not null,
  active_sessions integer not null check (active_sessions >= 0),
  maximum_sessions integer not null check (maximum_sessions >= 0),
  checked_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists lab_provider_snapshots_provider_checked_idx on public.lab_provider_operational_snapshots(provider_id, checked_at desc);
alter table public.lab_provider_operational_snapshots enable row level security;
-- Provider operational snapshots are server/Founder operations data.
-- No student-facing RLS policy is granted.

create table if not exists public.lab_automation_cycles (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  provider_id text not null,
  health_state text not null check (health_state in ('healthy','degraded','unavailable')),
  capacity_available boolean not null,
  sessions_expired integer not null default 0 check (sessions_expired >= 0),
  queued_sessions_provisioned integer not null default 0 check (queued_sessions_provisioned >= 0),
  queued_sessions_failed integer not null default 0 check (queued_sessions_failed >= 0),
  cleanup_operations_processed integer not null default 0 check (cleanup_operations_processed >= 0),
  created_at timestamptz not null default now()
);
create index if not exists lab_automation_cycles_completed_idx on public.lab_automation_cycles(completed_at desc);
alter table public.lab_automation_cycles enable row level security;
-- Automation cycle history is operational data and remains server-only.

create unique index if not exists lab_operations_one_open_kind_per_session_idx
on public.lab_operations(lab_session_id, kind)
where state in ('pending','running','failed');

insert into public.platform_schema_version(component, version)
values ('lab-health-capacity-automation', '0.1.0')
on conflict(component, version) do nothing;
