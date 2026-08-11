-- Technical Learning Platform
-- Build Wave 1: Authentication foundation
--
-- Supabase Auth remains the source of truth for credentials and sessions.
-- public.user_profiles contains application profile/role metadata only.

create table if not exists public.user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    role text not null default 'student',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_profiles_role_check
        check (role in ('student', 'founder_admin'))
);

comment on table public.user_profiles is
'Application profile and platform role metadata linked one-to-one with Supabase auth.users.';

alter table public.user_profiles enable row level security;

create policy "users can read own profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can update own non-role profile row"
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (
    auth.uid() = user_id
    and role = (
        select existing.role
        from public.user_profiles as existing
        where existing.user_id = auth.uid()
    )
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.user_profiles (user_id, display_name, role)
    values (
        new.id,
        nullif(new.raw_user_meta_data ->> 'display_name', ''),
        'student'
    )
    on conflict (user_id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_user_profiles_updated_at();

insert into public.platform_schema_version (component, version)
values ('authentication-foundation', '0.1.0')
on conflict (component, version) do nothing;
