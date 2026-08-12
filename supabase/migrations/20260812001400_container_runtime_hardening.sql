update public.lab_provider_registry
set configuration = jsonb_build_object(
  'mode', 'runtime-adapter',
  'enabledByDefault', false,
  'requiresExplicitImageAllowlist', true,
  'requiresNonRootImageUser', true,
  'networkMode', 'none',
  'readOnlyRootFilesystem', true,
  'dropAllCapabilities', true,
  'noNewPrivileges', true,
  'dockerSocketMountAllowed', false
),
updated_at = now()
where provider_id = 'container';

insert into public.platform_schema_version(component, version)
values ('container-runtime-hardening', '0.1.0')
on conflict(component, version) do nothing;
