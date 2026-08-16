-- Wave 7 Batch 7 — EVID-008 Evidence Export and Verification Hooks.
--
-- A minimal, server-owned verification reference for canonical Evidence.
--
-- Why a separate table rather than a column on public.evidence_records:
-- Batch 1 makes Evidence provenance immutable through
-- guard_evidence_record_provenance(), and that guarantee must not be weakened
-- to attach an identifier after Evidence creation. EVID-008 §15 requires that
-- future verification work without an Evidence schema redesign, so the
-- identifier lives beside the Evidence rather than inside it.
--
-- Forward-only. This migration does not alter evidence_records, does not touch
-- evidence_competency_links or evidence_correction_events, and does not modify
-- any source-engine table. It stores no student-visible content: the export
-- representation is projected on demand from existing truth.
--
-- The identifier is a hook, NOT publication. There is no public read policy and
-- no anonymous resolution route anywhere in this batch.

create table if not exists public.evidence_verification_references (
  evidence_id uuid primary key references public.evidence_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Opaque, cryptographically random. Carries no evidence id, user id,
  -- sequential value or provider identifier.
  verification_id text not null unique check (verification_id ~ '^ev1_[a-f0-9]{48}$'),
  created_at timestamptz not null default now()
);

-- One stable identifier per Evidence Record: repeated export requests return
-- the same reference, so a previously exported identifier keeps resolving.
-- The logical identity is the Evidence itself, never a timestamp.

alter table public.evidence_verification_references enable row level security;

-- Students may read their own verification references so an export they
-- requested remains inspectable. There is deliberately no anonymous or public
-- policy: an identifier existing does not make Evidence public.
create policy "students read own evidence verification references"
on public.evidence_verification_references
for select to authenticated
using (auth.uid() = user_id);

-- No student insert, update or delete policy is granted. Minting is
-- server-authoritative.

create index if not exists evidence_verification_references_user_idx
on public.evidence_verification_references (user_id);

-- The reference is immutable once minted. Rotating or reassigning an
-- identifier would silently invalidate an export a student already holds.
create or replace function public.guard_evidence_verification_reference()
returns trigger
language plpgsql
as $$
declare
  evidence_owner uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Evidence verification references are immutable once minted';
  end if;

  select user_id into evidence_owner
  from public.evidence_records
  where id = new.evidence_id;

  if evidence_owner is null then
    raise exception 'Evidence Record % was not found', new.evidence_id;
  end if;

  -- Ownership comes from the Evidence Record, never from the caller.
  if new.user_id is distinct from evidence_owner then
    raise exception
      'Evidence verification reference owner must match the Evidence owner';
  end if;

  return new;
end
$$;

drop trigger if exists evidence_verification_references_guard
on public.evidence_verification_references;

create trigger evidence_verification_references_guard
before insert or update on public.evidence_verification_references
for each row
execute function public.guard_evidence_verification_reference();

insert into public.platform_schema_version (component, version)
values ('evidence-verification-references', '0.1.0')
on conflict (component, version) do nothing;
