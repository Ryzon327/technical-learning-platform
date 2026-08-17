-- Wave 8 Batch 5 — CERT-004 Certificate Record and Lifecycle.
--
-- Adds the lifecycle machinery: a pinned expiry, an append-only transition
-- history, and a privileged function that records a transition atomically.
--
-- What this migration deliberately does NOT own:
--   * the revoke, correct, supersede and restore WORKFLOWS, together with the
--     reason, actor, effective date and replacement-certificate reference they
--     carry (CERT-008)
--   * public verification of any kind (CERT-005)
--   * portfolio, export, sharing, branding (CERT-006/007/009)
--
-- There is therefore no reason column, no actor column, no replacement
-- reference, no notification data and no public policy anywhere in this file.
--
-- CERT-003's issuance record and its snapshots remain historically immutable.
-- `guard_certificate_immutable` is untouched, so `expires_at` below is written
-- exactly once at issuance and can never be updated afterwards.

-- ---------------------------------------------------------------------------
-- Pinned expiry
--
-- CERT-001 freezes material fields only while a definition is `published`:
-- guard_certificate_definition_material_freeze gates on
-- `old.publication_state = 'published'`, so once a definition is retired its
-- expiration_months becomes editable again.
--
-- Deriving expiry at read time from the pinned definition version would
-- therefore let a post-retirement edit silently move the expiry date of an
-- already-issued certificate. The value is pinned at issuance instead.
--
-- NULL means the certificate does not expire.
-- ---------------------------------------------------------------------------
alter table public.certificates
    add column if not exists expires_at timestamptz;

-- ---------------------------------------------------------------------------
-- Append-only lifecycle history
--
-- Every status change is an appended event. Nothing is rewritten in place, so
-- the issuance record and every prior transition survive each change
-- (CERT-004 sections 9 and 14).
--
-- `previous_status` is recorded alongside `new_status` so replay is
-- self-validating: a recorded predecessor that disagrees with the replayed
-- status marks the history invalid rather than being silently accepted.
-- ---------------------------------------------------------------------------
create table if not exists public.certificate_lifecycle_events (
    id uuid primary key default gen_random_uuid(),
    certificate_id uuid not null
        references public.certificates(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    sequence_number integer not null check (sequence_number > 0),
    previous_status text not null check (
        previous_status in ('active', 'superseded', 'expired', 'revoked', 'corrected')
    ),
    new_status text not null check (
        new_status in ('active', 'superseded', 'expired', 'revoked', 'corrected')
    ),
    effective_at timestamptz not null default now(),
    occurred_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint certificate_lifecycle_events_sequence_key
        unique (certificate_id, sequence_number),
    -- A transition must change the status; a no-op is not an event.
    constraint certificate_lifecycle_events_changes_status
        check (previous_status <> new_status)
);

create index if not exists idx_certificate_lifecycle_events_certificate
    on public.certificate_lifecycle_events (certificate_id, sequence_number);

create index if not exists idx_certificate_lifecycle_events_user
    on public.certificate_lifecycle_events (user_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Students read the history of their own certificates. No student INSERT,
-- UPDATE, DELETE or ALL policy is granted: CERT-004 section 9 requires that
-- students cannot modify status, and lifecycle writes are server-authoritative
-- through the privileged function below.
-- ---------------------------------------------------------------------------
alter table public.certificate_lifecycle_events enable row level security;

create policy "students read own certificate lifecycle events"
on public.certificate_lifecycle_events
for select
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Append-only guard
--
-- CERT-004 section 7 excludes arbitrary deletion of certificate history, and
-- section 9 forbids silent rewriting. History is therefore insert-only.
-- ---------------------------------------------------------------------------
create or replace function public.guard_certificate_lifecycle_append_only()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Certificate lifecycle history is append-only';
end
$$;

drop trigger if exists certificate_lifecycle_events_append_only
on public.certificate_lifecycle_events;

create trigger certificate_lifecycle_events_append_only
before update or delete on public.certificate_lifecycle_events
for each row
execute function public.guard_certificate_lifecycle_append_only();

-- ---------------------------------------------------------------------------
-- Transition validity guard
--
-- Enforces the approved edge set and local sequence continuity. This is not a
-- resolver: it compares an appended event against the immediately preceding
-- one, and never replays the whole history or derives an effective status.
--
-- Approved edges (CERT-004 ruling Q1):
--   active -> superseded | revoked | corrected | expired
--   revoked -> active          (so CERT-008 restore is representable)
-- Everything else is rejected. expired, superseded and corrected are terminal.
-- ---------------------------------------------------------------------------
create or replace function public.guard_certificate_lifecycle_event()
returns trigger
language plpgsql
as $$
declare
    owner_id uuid;
    last_status text;
    last_sequence integer;
begin
    select c.user_id into owner_id
      from public.certificates c
     where c.id = new.certificate_id;

    if owner_id is null then
        raise exception 'Certificate was not found';
    end if;

    if new.user_id is distinct from owner_id then
        raise exception 'Certificate lifecycle event owner must match the certificate';
    end if;

    select e.new_status, e.sequence_number
      into last_status, last_sequence
      from public.certificate_lifecycle_events e
     where e.certificate_id = new.certificate_id
     order by e.sequence_number desc
     limit 1;

    -- Every certificate begins active at issuance.
    if last_status is null then
        last_status := 'active';
        last_sequence := 0;
    end if;

    if new.sequence_number is distinct from last_sequence + 1 then
        raise exception 'Certificate lifecycle events must be contiguous';
    end if;

    if new.previous_status is distinct from last_status then
        raise exception 'Certificate lifecycle event does not follow the recorded status';
    end if;

    if not (
        (new.previous_status = 'active' and new.new_status in ('superseded', 'revoked', 'corrected', 'expired'))
        or (new.previous_status = 'revoked' and new.new_status = 'active')
    ) then
        raise exception 'Certificate lifecycle transition is not permitted';
    end if;

    return new;
end
$$;

drop trigger if exists certificate_lifecycle_events_guard
on public.certificate_lifecycle_events;

create trigger certificate_lifecycle_events_guard
before insert on public.certificate_lifecycle_events
for each row
execute function public.guard_certificate_lifecycle_event();

-- ---------------------------------------------------------------------------
-- Transactional transition recording
--
-- Allocates the next sequence number and the preceding status under a lock, so
-- two concurrent transitions cannot interleave into an incoherent history.
--
-- CERT-004 provides this machinery; it exposes no workflow. CERT-008 will drive
-- it with a reason, an actor and any replacement reference, which is why none
-- of those appear here.
--
-- Privileged-RPC convention, matching public.certificate_issue: security
-- definer, fixed search_path, execute revoked from every client role.
-- ---------------------------------------------------------------------------
create or replace function public.certificate_record_lifecycle_event(
    target_certificate_id uuid,
    target_new_status text,
    target_effective_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    owner_id uuid;
    last_status text;
    last_sequence integer;
    new_event_id uuid;
begin
    -- Lock the certificate so concurrent transitions serialize.
    select c.user_id
      into owner_id
      from public.certificates c
     where c.id = target_certificate_id
       for update;

    if owner_id is null then
        raise exception 'Certificate was not found';
    end if;

    select e.new_status, e.sequence_number
      into last_status, last_sequence
      from public.certificate_lifecycle_events e
     where e.certificate_id = target_certificate_id
     order by e.sequence_number desc
     limit 1;

    if last_status is null then
        last_status := 'active';
        last_sequence := 0;
    end if;

    insert into public.certificate_lifecycle_events (
        certificate_id,
        user_id,
        sequence_number,
        previous_status,
        new_status,
        effective_at
    )
    values (
        target_certificate_id,
        owner_id,
        last_sequence + 1,
        last_status,
        target_new_status,
        coalesce(target_effective_at, now())
    )
    returning id into new_event_id;

    return new_event_id;
end;
$$;

revoke all on function public.certificate_record_lifecycle_event(
    uuid, text, timestamptz
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Issuance pins the expiry
--
-- public.certificate_issue is redefined here so the expiry can be pinned in the
-- same transaction that creates the record. Every CERT-003 guarantee is carried
-- forward unchanged and is re-verified against this body by the Wave 8
-- verifier: the definition is locked and must still be published and not
-- superseded, an existing record is returned rather than duplicated, every
-- relied-upon Evidence row is confirmed unchanged by equality, snapshot rows
-- may only reference pinned Evidence, and the record plus both snapshot sets
-- are written in one transaction.
--
-- The signature is unchanged, so no caller changes.
-- ---------------------------------------------------------------------------
create or replace function public.certificate_issue(
    target_user_id uuid,
    target_definition_id uuid,
    new_verification_id text,
    pin_evidence_ids uuid[],
    pin_states text[],
    pin_integrity_states text[],
    pin_result_states text[],
    pin_correction_counts integer[],
    snap_competency_stable_ids text[],
    snap_competency_versions integer[],
    snap_evidence_ids uuid[],
    snap_evidence_competency_stable_ids text[],
    snap_evidence_competency_versions integer[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    definition_state text;
    definition_superseded uuid;
    definition_stable_id text;
    definition_version integer;
    definition_expiration_months integer;
    existing_certificate_id uuid;
    new_certificate_id uuid;
    issued_at_value timestamptz := now();
    expires_at_value timestamptz;
    pin_count integer := coalesce(array_length(pin_evidence_ids, 1), 0);
    competency_count integer := coalesce(array_length(snap_competency_stable_ids, 1), 0);
    evidence_snapshot_count integer := coalesce(array_length(snap_evidence_ids, 1), 0);
    drifted integer;
    orphaned integer;
begin
    -- 1. Input arrays must be internally consistent.
    if pin_count is distinct from coalesce(array_length(pin_states, 1), 0)
       or pin_count is distinct from coalesce(array_length(pin_integrity_states, 1), 0)
       or pin_count is distinct from coalesce(array_length(pin_result_states, 1), 0)
       or pin_count is distinct from coalesce(array_length(pin_correction_counts, 1), 0) then
        raise exception 'Certificate issuance Evidence pin arrays must be the same length';
    end if;

    if competency_count is distinct from coalesce(array_length(snap_competency_versions, 1), 0) then
        raise exception 'Certificate issuance competency snapshot arrays must be the same length';
    end if;

    if evidence_snapshot_count is distinct from coalesce(array_length(snap_evidence_competency_stable_ids, 1), 0)
       or evidence_snapshot_count is distinct from coalesce(array_length(snap_evidence_competency_versions, 1), 0) then
        raise exception 'Certificate issuance Evidence snapshot arrays must be the same length';
    end if;

    -- 2. The exact Certificate Definition, locked, and issuable right now.
    select d.publication_state, d.superseded_by_definition_id, d.stable_id,
           d.version, d.expiration_months
      into definition_state, definition_superseded, definition_stable_id,
           definition_version, definition_expiration_months
      from public.certificate_definitions d
     where d.id = target_definition_id
       for update;

    if definition_state is null then
        raise exception 'Certificate Definition was not found';
    end if;

    if definition_state <> 'published' then
        raise exception 'Certificate Definition is not published';
    end if;

    if definition_superseded is not null then
        raise exception 'Certificate Definition has been superseded';
    end if;

    -- 3. Idempotency inside the transaction: never create a second record.
    select c.id
      into existing_certificate_id
      from public.certificates c
     where c.user_id = target_user_id
       and c.certificate_definition_id = target_definition_id;

    if existing_certificate_id is not null then
        return existing_certificate_id;
    end if;

    -- 4. Every relied-upon Evidence row must be exactly as the application
    --    observed it. Pure equality; no resolution, no derivation.
    select count(*)
      into drifted
      from unnest(
              pin_evidence_ids,
              pin_states,
              pin_integrity_states,
              pin_result_states,
              pin_correction_counts
           ) as pinned(evidence_id, state, integrity_state, result_state, correction_count)
      left join public.evidence_records e on e.id = pinned.evidence_id
     where e.id is null
        or e.state is distinct from pinned.state
        or e.integrity_state is distinct from pinned.integrity_state
        or (e.metadata ->> 'resultState') is distinct from pinned.result_state
        or (
             select count(*)
               from public.evidence_correction_events ce
              where ce.evidence_id = pinned.evidence_id
           ) is distinct from pinned.correction_count;

    if drifted > 0 then
        raise exception
            'Authoritative Evidence changed after eligibility was evaluated';
    end if;

    -- 5. Snapshot rows may only reference Evidence that was pinned above.
    select count(*)
      into orphaned
      from unnest(snap_evidence_ids) as s(evidence_id)
     where not (s.evidence_id = any(pin_evidence_ids));

    if orphaned > 0 then
        raise exception
            'Certificate Evidence snapshot references unpinned Evidence';
    end if;

    -- 6. CERT-004: pin the expiry from the issuance-time definition. NULL
    --    expiration_months means the certificate does not expire. Written once
    --    here; the immutability trigger prevents it ever being updated.
    if definition_expiration_months is not null then
        expires_at_value := issued_at_value
            + make_interval(months => definition_expiration_months);
    end if;

    -- 7. Create exactly one Certificate Record and its snapshots.
    insert into public.certificates (
        user_id,
        certificate_definition_id,
        certificate_definition_stable_id,
        certificate_definition_version,
        verification_id,
        issued_at,
        expires_at
    )
    values (
        target_user_id,
        target_definition_id,
        definition_stable_id,
        definition_version,
        new_verification_id,
        issued_at_value,
        expires_at_value
    )
    returning id into new_certificate_id;

    if competency_count > 0 then
        insert into public.certificate_competency_snapshots (
            certificate_id,
            competency_stable_id,
            competency_version
        )
        select
            new_certificate_id,
            stable_ids.value,
            versions.value
        from unnest(snap_competency_stable_ids) with ordinality as stable_ids(value, position)
        join unnest(snap_competency_versions) with ordinality as versions(value, position)
          on versions.position = stable_ids.position;
    end if;

    if evidence_snapshot_count > 0 then
        insert into public.certificate_evidence_snapshots (
            certificate_id,
            evidence_id,
            competency_stable_id,
            competency_version
        )
        select
            new_certificate_id,
            ids.value,
            stable_ids.value,
            versions.value
        from unnest(snap_evidence_ids) with ordinality as ids(value, position)
        join unnest(snap_evidence_competency_stable_ids) with ordinality as stable_ids(value, position)
          on stable_ids.position = ids.position
        join unnest(snap_evidence_competency_versions) with ordinality as versions(value, position)
          on versions.position = ids.position;
    end if;

    return new_certificate_id;
end;
$$;

revoke all on function public.certificate_issue(
    uuid, uuid, text, uuid[], text[], text[], text[], integer[],
    text[], integer[], uuid[], text[], integer[]
) from public, anon, authenticated;

insert into public.platform_schema_version (component, version)
values ('certificate-lifecycle-foundation', '0.1.0')
on conflict (component, version) do nothing;
