alter table public.assessment_attempts
    add column if not exists interruption_reason text,
    add column if not exists integrity_version integer not null default 1,
    add column if not exists result_digest text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'assessment_interruption_reason_check'
    ) then
        alter table public.assessment_attempts
            add constraint assessment_interruption_reason_check
            check (
                interruption_reason is null
                or interruption_reason in (
                    'client_disconnect',
                    'network_error',
                    'server_restart',
                    'dependency_unavailable',
                    'unknown'
                )
            );
    end if;
end
$$;

create table if not exists public.assessment_evidence_handoffs (
    id uuid primary key default gen_random_uuid(),
    attempt_id uuid not null unique references public.assessment_attempts(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    source_type text not null default 'assessment_attempt' check (source_type = 'assessment_attempt'),
    source_reference text not null unique,
    assessment_stable_id text not null,
    assessment_version integer not null check (assessment_version > 0),
    result_state text not null check (result_state in ('passed','failed')),
    score_percent numeric(5,2) not null check (score_percent >= 0 and score_percent <= 100),
    passing_percent numeric(5,2) not null check (passing_percent >= 0 and passing_percent <= 100),
    competency_stable_ids jsonb not null default '[]'::jsonb,
    evidence_eligible boolean not null default false,
    result_digest text not null,
    created_at timestamptz not null default now()
);

alter table public.assessment_evidence_handoffs enable row level security;

create policy "students can read own assessment evidence handoffs"
on public.assessment_evidence_handoffs
for select to authenticated
using (auth.uid() = user_id);

insert into public.platform_schema_version (component, version)
values ('assessment-recovery-integrity', '0.1.0')
on conflict (component, version) do nothing;
