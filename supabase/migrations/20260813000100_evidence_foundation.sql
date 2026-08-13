-- Wave 7 Batch 1 — Canonical Evidence foundation.
-- Wave 7 owns Canonical Evidence Records. Source-engine truth stays where it is:
-- Wave 4 assessment_evidence_handoffs and Wave 6 lab_validation_runs/results are
-- source handoffs, not Canonical Evidence, and are not consumed by this batch.

create table if not exists public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (
    source_type in (
      'assessment_attempt',
      'lab_validation',
      'manual_authoritative',
      'system_authoritative'
    )
  ),
  source_reference text not null check (length(btrim(source_reference)) > 0),
  source_engine text not null check (
    source_engine in ('assessment', 'lab', 'competency', 'platform')
  ),
  source_occurred_at timestamptz not null,
  state text not null default 'active' check (
    state in ('active', 'invalidated', 'superseded')
  ),
  integrity_state text not null default 'verified' check (
    integrity_state in ('verified', 'unverified', 'mismatch')
  ),
  integrity_algorithm text not null default 'sha256' check (
    integrity_algorithm in ('sha256')
  ),
  evidence_integrity_digest text not null check (
    evidence_integrity_digest ~ '^[a-f0-9]{64}$'
  ),
  source_integrity_digest text not null check (
    source_integrity_digest ~ '^[a-f0-9]{64}$'
  ),
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evidence_records_source_identity_key
    unique (user_id, source_type, source_reference)
);

-- Logical identity is (user_id, source_type, source_reference) so the same
-- trusted source event cannot create duplicate Canonical Evidence. The digest
-- is a fail-closed integrity check, never the uniqueness mechanism.

-- evidence_integrity_digest is the Evidence Engine's acceptance proof.
-- source_integrity_digest preserves the upstream source-engine proof
-- (for example an assessment result_digest). The two are never conflated.

alter table public.evidence_records enable row level security;

create policy "students read own evidence records"
on public.evidence_records
for select to authenticated
using (auth.uid() = user_id);

-- No student insert/update/delete policy is granted. Canonical Evidence
-- creation and mutation are server-authoritative only. Students may never
-- create Evidence, alter provenance, alter integrity state, or alter state.

create index if not exists evidence_records_user_recorded_idx
on public.evidence_records (user_id, recorded_at desc);

create index if not exists evidence_records_user_state_idx
on public.evidence_records (user_id, state);

create index if not exists evidence_records_source_lookup_idx
on public.evidence_records (source_type, source_reference);

create index if not exists evidence_records_recorded_idx
on public.evidence_records (recorded_at desc);

-- Provenance is immutable after creation. Later correction/invalidation
-- workflows remain possible because state, integrity_state and metadata stay
-- mutable by privileged server code, which keeps corrections append-only and
-- auditable rather than rewriting history. Correction workflows are NOT
-- implemented in Batch 1.
create or replace function public.guard_evidence_record_provenance()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.source_type is distinct from old.source_type
     or new.source_reference is distinct from old.source_reference
     or new.source_engine is distinct from old.source_engine
     or new.source_occurred_at is distinct from old.source_occurred_at
     or new.integrity_algorithm is distinct from old.integrity_algorithm
     or new.evidence_integrity_digest is distinct from old.evidence_integrity_digest
     or new.source_integrity_digest is distinct from old.source_integrity_digest
     or new.recorded_at is distinct from old.recorded_at then
    raise exception
      'Canonical Evidence provenance is immutable';
  end if;

  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists evidence_records_provenance_guard
on public.evidence_records;

create trigger evidence_records_provenance_guard
before update on public.evidence_records
for each row
execute function public.guard_evidence_record_provenance();

insert into public.platform_schema_version (component, version)
values ('evidence-foundation', '0.1.0')
on conflict (component, version) do nothing;
