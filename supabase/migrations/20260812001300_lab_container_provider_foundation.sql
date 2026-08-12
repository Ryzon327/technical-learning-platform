create table if not exists public.lab_provider_registry (
  provider_id text primary key,
  provider_type text not null,
  enabled boolean not null default false,
  priority integer not null default 100,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lab_provider_registry enable row level security;
-- Provider registry is operational configuration. No student-facing policy is granted.

insert into public.lab_provider_registry(provider_id, provider_type, enabled, priority, configuration)
values
  ('mock', 'mock', true, 100, '{}'::jsonb),
  ('container', 'container', false, 200, '{"mode":"foundation"}'::jsonb)
on conflict(provider_id) do nothing;

insert into public.platform_schema_version(component, version)
values ('lab-container-provider-foundation', '0.1.0')
on conflict(component, version) do nothing;
