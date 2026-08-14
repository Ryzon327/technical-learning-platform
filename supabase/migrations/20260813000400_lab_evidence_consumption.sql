-- Wave 7 Batch 4 — EVID-004 Lab Validation Evidence.
--
-- Durable consumption state for the Lab validation -> canonical Evidence
-- pipeline.
--
-- Forward-only. This migration does not alter the Batch 1 Evidence model, does
-- not modify public.evidence_records or public.evidence_competency_links, does
-- not change the Batch 3 assessment consumption table, and does not touch any
-- Wave 6 Lab Engine table. Nothing here validates a lab, changes a validation
-- run or result, or advances competency state.
--
-- Why a dedicated Evidence-owned table rather than the Wave 6 public.lab_operations
-- queue: that queue is Lab Engine session-lifecycle infrastructure, its
-- processor handles cleanup work, and extending it would place Evidence
-- ingestion retries inside the Lab lifecycle path. Lab validation truth must
-- never depend on Evidence Engine availability, so ingestion state is kept on
-- the Evidence side, mirroring the Batch 3 assessment consumption pattern.

-- ------------------------------------------------------------------
-- Frozen Lab Evidence handoff.
--
-- A Lab Definition references its mission by stable id only, so the approved
-- competency mapping in force for a lab execution must be resolved once, when
-- the validation becomes authoritative, and then frozen. Without this, a
-- mission published between validation and a delayed ingestion retry would
-- silently supply different competency links for historical Evidence.
--
-- Written only after the deterministic validation run and results are
-- persisted. Immutable once written, so every retry reproduces exactly the
-- same canonical competency links.
-- ------------------------------------------------------------------
create table if not exists public.lab_evidence_handoffs (
  validation_run_id uuid primary key references public.lab_validation_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lab_session_id uuid not null references public.lab_sessions(id) on delete cascade,
  lab_definition_stable_id text not null check (length(btrim(lab_definition_stable_id)) > 0),
  lab_definition_version integer not null check (lab_definition_version > 0),
  mission_stable_id text not null,
  mission_version integer check (mission_version is null or mission_version > 0),
  mission_id uuid references public.missions(id) on delete restrict,
  competency_mappings jsonb not null default '[]'::jsonb,
  unresolved_competency_stable_ids jsonb not null default '[]'::jsonb,
  mapping_digest text not null check (mapping_digest ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Internal trusted state: RLS enabled with no policy, so students never read or
-- write raw handoff content. Student-facing proof is the canonical Evidence.
alter table public.lab_evidence_handoffs enable row level security;

create index if not exists lab_evidence_handoffs_user_idx
on public.lab_evidence_handoffs (user_id);

create index if not exists lab_evidence_handoffs_session_idx
on public.lab_evidence_handoffs (lab_session_id);

-- The frozen snapshot is immutable. Ownership must match the validation run,
-- and the pinned lab definition must match the run's session, so a handoff can
-- never claim mapping authority for someone else's lab execution.
create or replace function public.guard_lab_evidence_handoff()
returns trigger
language plpgsql
as $$
declare
  run_owner uuid;
  run_session uuid;
  session_lab_stable text;
  session_lab_version integer;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Lab evidence handoff is immutable once captured';
  end if;

  select user_id, lab_session_id
    into run_owner, run_session
  from public.lab_validation_runs
  where id = new.validation_run_id;

  if run_owner is null then
    raise exception 'Lab validation run % was not found', new.validation_run_id;
  end if;

  if new.user_id is distinct from run_owner then
    raise exception 'Lab evidence handoff owner must match the validation run owner';
  end if;

  if new.lab_session_id is distinct from run_session then
    raise exception 'Lab evidence handoff must reference the validation run lab session';
  end if;

  select lab_definition_stable_id, lab_definition_version
    into session_lab_stable, session_lab_version
  from public.lab_sessions
  where id = run_session;

  if new.lab_definition_stable_id is distinct from session_lab_stable
     or new.lab_definition_version is distinct from session_lab_version then
    raise exception 'Lab evidence handoff must pin the lab definition of its session';
  end if;

  return new;
end
$$;

drop trigger if exists lab_evidence_handoffs_guard
on public.lab_evidence_handoffs;

create trigger lab_evidence_handoffs_guard
before insert or update on public.lab_evidence_handoffs
for each row
execute function public.guard_lab_evidence_handoff();

create table if not exists public.lab_evidence_consumptions (
  validation_run_id uuid primary key references public.lab_validation_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lab_session_id uuid references public.lab_sessions(id) on delete set null,
  state text not null check (state in ('consumed', 'skipped', 'failed')),
  evidence_id uuid references public.evidence_records(id) on delete set null,
  skip_reason text check (
    skip_reason is null
    or skip_reason in (
      'validation_technical_error',
      'validation_run_not_found',
      'lab_definition_not_found'
    )
  ),
  last_failure_code text,
  last_attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lab_evidence_consumptions_consumed_has_evidence
    check (state <> 'consumed' or evidence_id is not null)
);

-- Row level security is enabled with no policy at all. This table is internal
-- operational state, not student-facing evidence: only server-authoritative
-- code reaches it, and students see nothing. Student-facing reads go through
-- the Batch 1 Evidence routes and the Batch 2 competency link routes.
alter table public.lab_evidence_consumptions enable row level security;

create index if not exists lab_evidence_consumptions_state_idx
on public.lab_evidence_consumptions (state, last_attempted_at);

create index if not exists lab_evidence_consumptions_user_idx
on public.lab_evidence_consumptions (user_id);

create index if not exists lab_evidence_consumptions_session_idx
on public.lab_evidence_consumptions (lab_session_id, last_attempted_at desc);

create index if not exists lab_evidence_consumptions_evidence_idx
on public.lab_evidence_consumptions (evidence_id);

-- Defence in depth: ingestion state must describe a validation run that really
-- belongs to the recorded student. Ownership can never be asserted by a caller.
create or replace function public.guard_lab_evidence_consumption()
returns trigger
language plpgsql
as $$
declare
  run_owner uuid;
  run_session uuid;
begin
  select user_id, lab_session_id
    into run_owner, run_session
  from public.lab_validation_runs
  where id = new.validation_run_id;

  if run_owner is null then
    raise exception 'Lab validation run % was not found', new.validation_run_id;
  end if;

  if new.user_id is distinct from run_owner then
    raise exception
      'Lab evidence consumption owner must match the validation run owner';
  end if;

  if new.lab_session_id is not null
     and new.lab_session_id is distinct from run_session then
    raise exception
      'Lab evidence consumption must reference the validation run lab session';
  end if;

  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists lab_evidence_consumptions_guard
on public.lab_evidence_consumptions;

create trigger lab_evidence_consumptions_guard
before insert or update on public.lab_evidence_consumptions
for each row
execute function public.guard_lab_evidence_consumption();

insert into public.platform_schema_version (component, version)
values ('lab-evidence-consumption', '0.1.0')
on conflict (component, version) do nothing;
