-- Wave 7 Batch 5 — EVID-006 Evidence Review and Correction History.
--
-- Append-only review/correction history for canonical Evidence.
--
-- Forward-only. This migration does not alter public.evidence_records, does not
-- weaken the Batch 1 provenance immutability trigger, and does not touch
-- public.evidence_competency_links or any source-engine table. Original
-- Evidence provenance and both integrity digests remain exactly as accepted.
--
-- Effective trust state is derived at read time from the original record plus
-- this ordered history. Nothing here rewrites what the source engine observed.

create table if not exists public.evidence_correction_events (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.evidence_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  action text not null check (
    action in ('place_under_review', 'confirm', 'invalidate', 'supersede', 'restore')
  ),
  reason text not null check (
    length(btrim(reason)) >= 8 and length(btrim(reason)) <= 500
  ),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check (actor_role in ('founder_admin')),
  previous_effective_state text not null check (
    previous_effective_state in ('active', 'invalidated', 'superseded')
  ),
  new_effective_state text not null check (
    new_effective_state in ('active', 'invalidated', 'superseded')
  ),
  superseding_evidence_id uuid references public.evidence_records(id) on delete restrict,
  idempotency_key text check (
    idempotency_key is null
    or (length(btrim(idempotency_key)) >= 8 and length(idempotency_key) <= 128)
  ),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Two concurrent corrections cannot both claim the same predecessor: the
  -- sequence number is the optimistic concurrency token.
  constraint evidence_correction_events_sequence_key
    unique (evidence_id, sequence_number),
  -- A retried request with the same stable key collapses onto one event.
  constraint evidence_correction_events_idempotency_key
    unique (evidence_id, idempotency_key),
  constraint evidence_correction_events_supersede_requires_target
    check (action <> 'supersede' or superseding_evidence_id is not null),
  constraint evidence_correction_events_supersede_only
    check (action = 'supersede' or superseding_evidence_id is null),
  -- Self-supersession is structurally impossible.
  constraint evidence_correction_events_no_self_supersession
    check (superseding_evidence_id is null or superseding_evidence_id <> evidence_id)
);

alter table public.evidence_correction_events enable row level security;

-- EVID-006 requires student transparency: a student may read the history of
-- their own Evidence. Reads are safe because the row carries a plain-language
-- reason; the service projects out actor and internal metadata.
create policy "students read own evidence correction history"
on public.evidence_correction_events
for select to authenticated
using (auth.uid() = user_id);

-- No student insert/update/delete policy is granted. Corrections are privileged
-- and server-authoritative, authored only by a founder_admin actor.

create index if not exists evidence_correction_events_evidence_idx
on public.evidence_correction_events (evidence_id, sequence_number);

create index if not exists evidence_correction_events_user_idx
on public.evidence_correction_events (user_id, occurred_at desc);

create index if not exists evidence_correction_events_superseding_idx
on public.evidence_correction_events (superseding_evidence_id);

-- ------------------------------------------------------------------
-- Append-only: history is never rewritten, even by privileged code.
-- A mistaken correction is repaired by appending a new event.
-- ------------------------------------------------------------------
create or replace function public.guard_evidence_correction_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Evidence correction history is append-only and cannot be updated';
  end if;
  raise exception 'Evidence correction history is append-only and cannot be deleted';
end
$$;

drop trigger if exists evidence_correction_events_append_only
on public.evidence_correction_events;

create trigger evidence_correction_events_append_only
before update or delete on public.evidence_correction_events
for each row
execute function public.guard_evidence_correction_append_only();

-- ------------------------------------------------------------------
-- Ownership, authority and supersession safety.
-- ------------------------------------------------------------------
create or replace function public.guard_evidence_correction_event()
returns trigger
language plpgsql
as $$
declare
  evidence_owner uuid;
  superseding_owner uuid;
  actor_role_value text;
  cycle_found boolean;
begin
  select user_id into evidence_owner
  from public.evidence_records
  where id = new.evidence_id;

  if evidence_owner is null then
    raise exception 'Evidence Record % was not found', new.evidence_id;
  end if;

  -- Ownership comes from the Evidence Record, never from the caller.
  if new.user_id is distinct from evidence_owner then
    raise exception 'Evidence correction owner must match the Evidence owner';
  end if;

  -- Only a founder_admin may author a correction. The role is read from the
  -- existing platform role table; no second authorization model is introduced.
  select role into actor_role_value
  from public.user_profiles
  where user_id = new.actor_id;

  if actor_role_value is distinct from 'founder_admin'
     or new.actor_role is distinct from 'founder_admin' then
    raise exception 'Evidence correction requires founder_admin authority';
  end if;

  if new.superseding_evidence_id is not null then
    select user_id into superseding_owner
    from public.evidence_records
    where id = new.superseding_evidence_id;

    if superseding_owner is null then
      raise exception 'Superseding Evidence Record % was not found',
        new.superseding_evidence_id;
    end if;

    -- Cross-user supersession is refused.
    if superseding_owner is distinct from evidence_owner then
      raise exception 'Superseding Evidence must belong to the same student';
    end if;

    -- Walk the existing supersession chain forward from the replacement. If it
    -- leads back to this Evidence, the correction would create a cycle.
    with recursive chain(evidence_id) as (
      select new.superseding_evidence_id
      union
      select e.superseding_evidence_id
      from public.evidence_correction_events e
      join chain c on e.evidence_id = c.evidence_id
      where e.action = 'supersede' and e.superseding_evidence_id is not null
    )
    select exists (select 1 from chain where evidence_id = new.evidence_id)
      into cycle_found;

    if cycle_found then
      raise exception 'Circular Evidence supersession is not permitted';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists evidence_correction_events_guard
on public.evidence_correction_events;

create trigger evidence_correction_events_guard
before insert on public.evidence_correction_events
for each row
execute function public.guard_evidence_correction_event();

insert into public.platform_schema_version (component, version)
values ('evidence-correction-history', '0.1.0')
on conflict (component, version) do nothing;
