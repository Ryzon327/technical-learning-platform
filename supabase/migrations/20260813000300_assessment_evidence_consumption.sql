-- Wave 7 Batch 3 — EVID-005 Assessment Evidence.
--
-- Durable consumption state for the assessment -> canonical Evidence pipeline.
--
-- Forward-only. This migration does not alter Batch 1 Evidence provenance
-- semantics, does not modify public.evidence_records or
-- public.evidence_competency_links, and does not change the Wave 4
-- public.assessment_evidence_handoffs table, which remains the authoritative
-- source-engine handoff. Nothing here scores an assessment, changes an attempt
-- result, or advances competency state.
--
-- Its only purpose is to make a failed Evidence ingestion durable and
-- retryable: the assessment result and its handoff are already authoritative
-- and complete before ingestion is ever attempted.

create table if not exists public.assessment_evidence_consumptions (
  attempt_id uuid primary key references public.assessment_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null check (state in ('consumed', 'skipped', 'failed')),
  evidence_id uuid references public.evidence_records(id) on delete set null,
  skip_reason text check (
    skip_reason is null
    or skip_reason in (
      'assessment_not_evidence_producing',
      'attempt_not_terminal',
      'handoff_not_eligible'
    )
  ),
  last_failure_code text,
  last_attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_evidence_consumptions_consumed_has_evidence
    check (state <> 'consumed' or evidence_id is not null)
);

-- Row level security is enabled with no policy at all. This table is internal
-- operational state, not student-facing evidence: only server-authoritative
-- code reaches it, and students see nothing. Student-facing reads go through
-- the Batch 1 Evidence routes and the Batch 2 competency link routes.
alter table public.assessment_evidence_consumptions enable row level security;

create index if not exists assessment_evidence_consumptions_state_idx
on public.assessment_evidence_consumptions (state, last_attempted_at);

create index if not exists assessment_evidence_consumptions_user_idx
on public.assessment_evidence_consumptions (user_id);

create index if not exists assessment_evidence_consumptions_evidence_idx
on public.assessment_evidence_consumptions (evidence_id);

create or replace function public.assessment_evidence_consumptions_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists assessment_evidence_consumptions_set_updated_at
on public.assessment_evidence_consumptions;

create trigger assessment_evidence_consumptions_set_updated_at
before update on public.assessment_evidence_consumptions
for each row
execute function public.assessment_evidence_consumptions_touch();

insert into public.platform_schema_version (component, version)
values ('assessment-evidence-consumption', '0.1.0')
on conflict (component, version) do nothing;
