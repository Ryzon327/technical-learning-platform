alter table public.lab_provider_registry
add column if not exists rollout_mode text
not null default 'off'
check (
  rollout_mode in (
    'off',
    'allowlist',
    'percentage',
    'all'
  )
);

alter table public.lab_provider_registry
add column if not exists rollout_percentage integer
not null default 0
check (
  rollout_percentage >= 0
  and rollout_percentage <= 100
);

alter table public.lab_provider_registry
add column if not exists rollout_allowed_user_ids text[]
not null default '{}';

update public.lab_provider_registry
set
  rollout_mode = 'off',
  rollout_percentage = 0,
  rollout_allowed_user_ids = '{}'
where provider_id = 'container'
  and activation_state <> 'enabled';

create or replace function public.guard_container_provider_activation()
returns trigger
language plpgsql
as $$
begin
  if new.provider_id = 'container'
     and new.activation_state = 'enabled'
     and old.activation_state <> 'enabled' then

    if old.activation_state <> 'canary_eligible' then
      raise exception
        'Container Provider may only be enabled from canary_eligible state';
    end if;

    if old.last_canary_passed_at is null then
      raise exception
        'Container Provider requires passing canary evidence before enablement';
    end if;

    if new.rollout_mode = 'off' then
      raise exception
        'Container Provider enablement requires an explicit rollout mode';
    end if;

    if new.rollout_mode = 'allowlist'
       and cardinality(new.rollout_allowed_user_ids) = 0 then
      raise exception
        'Allowlist rollout requires at least one user';
    end if;

    if new.rollout_mode = 'percentage'
       and new.rollout_percentage < 1 then
      raise exception
        'Percentage rollout requires at least 1 percent';
    end if;
  end if;

  if new.provider_id = 'container'
     and new.activation_state in ('disabled', 'suspended') then
    new.enabled := false;
    new.rollout_mode := 'off';
    new.rollout_percentage := 0;
    new.rollout_allowed_user_ids := '{}';
  end if;

  return new;
end
$$;

drop trigger if exists container_provider_activation_guard
on public.lab_provider_registry;

create trigger container_provider_activation_guard
before update on public.lab_provider_registry
for each row
execute function public.guard_container_provider_activation();

-- The database independently enforces:
-- passing canary evidence -> canary_eligible -> explicit enablement.
-- It also guarantees disabled/suspended means rollout off.

insert into public.platform_schema_version(component, version)
values ('container-provider-controlled-rollout', '0.1.0')
on conflict(component, version) do nothing;
