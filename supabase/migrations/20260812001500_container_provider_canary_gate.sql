create table if not exists public.lab_provider_canary_runs (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  image_reference text not null,
  passed boolean not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  stages jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists lab_provider_canary_runs_provider_completed_idx
on public.lab_provider_canary_runs(provider_id, completed_at desc);

alter table public.lab_provider_canary_runs enable row level security;

-- Canary history is operational security evidence.
-- No student-facing RLS policy is granted.

alter table public.lab_provider_registry
add column if not exists activation_state text
not null default 'disabled'
check (
  activation_state in (
    'disabled',
    'canary_eligible',
    'enabled',
    'suspended'
  )
);

alter table public.lab_provider_registry
add column if not exists last_canary_passed_at timestamptz;

create or replace function public.refresh_container_provider_canary_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.provider_id = 'container' and new.passed = true then
    update public.lab_provider_registry
    set
      activation_state = case
        when activation_state = 'disabled'
          then 'canary_eligible'
        else activation_state
      end,
      last_canary_passed_at = new.completed_at,
      updated_at = now()
    where provider_id = 'container';
  end if;

  return new;
end
$$;

drop trigger if exists container_provider_canary_eligibility
on public.lab_provider_canary_runs;

create trigger container_provider_canary_eligibility
after insert on public.lab_provider_canary_runs
for each row
execute function public.refresh_container_provider_canary_eligibility();

-- A passed canary never enables the provider automatically.
-- activation_state='enabled' remains an explicit administrative action.

insert into public.platform_schema_version(component, version)
values ('container-provider-canary-gate', '0.1.0')
on conflict(component, version) do nothing;
