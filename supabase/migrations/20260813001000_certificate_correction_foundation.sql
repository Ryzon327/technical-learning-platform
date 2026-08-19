-- Wave 8 Batch 9 — CERT-008 Certificate Revocation and Correction.
--
-- Append-only workflow history for privileged certificate corrections.
--
-- Forward-only. This migration does NOT alter public.certificates, does NOT add
-- any column to public.certificate_lifecycle_events, does NOT change
-- public.certificate_record_lifecycle_event, and does NOT touch its grants or
-- its transition rules.
--
-- ## Authority boundary
--
-- CERT-004 remains the sole lifecycle authority. It owns the five states, the
-- permitted transition edges, contiguity, append-only history, serialization
-- and effective status. CERT-008 owns only the workflow facts around a
-- correction: which administrative action was taken, why, by whom, and with
-- what replacement.
--
-- The RPC below therefore never decides whether a transition is legal. It
-- validates CERT-008 workflow inputs, delegates the transition to CERT-004's
-- existing machinery, and records what CERT-004 decided. An illegal transition
-- is refused by CERT-004's trigger, not by anything here.

create table if not exists public.certificate_correction_events (
    id uuid primary key default gen_random_uuid(),
    certificate_id uuid not null
        references public.certificates(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    sequence_number integer not null check (sequence_number > 0),

    action text not null check (
        action in ('revoke', 'correct', 'supersede', 'restore')
    ),

    -- CERT-008 section 8: a correction must carry a reason. Enforced by the
    -- database so no code path can record a reasonless correction.
    reason text not null check (
        length(btrim(reason)) >= 8 and length(btrim(reason)) <= 500
    ),

    actor_id uuid not null references auth.users(id) on delete restrict,
    actor_role text not null check (actor_role in ('founder_admin')),

    -- Copied from the CERT-004 event this correction drove, so the workflow
    -- record shows what actually happened rather than what was intended.
    previous_status text not null check (
        previous_status in ('active', 'superseded', 'expired', 'revoked', 'corrected')
    ),
    new_status text not null check (
        new_status in ('active', 'superseded', 'expired', 'revoked', 'corrected')
    ),

    -- The CERT-004 lifecycle event this correction produced. One correction
    -- drives exactly one transition, and no transition is claimed twice.
    lifecycle_event_id uuid not null unique
        references public.certificate_lifecycle_events(id) on delete restrict,

    replacement_certificate_id uuid
        references public.certificates(id) on delete restrict,

    idempotency_key text check (
        idempotency_key is null
        or (length(btrim(idempotency_key)) >= 8 and length(idempotency_key) <= 128)
    ),

    occurred_at timestamptz not null default now(),
    created_at timestamptz not null default now(),

    -- Two concurrent corrections cannot both claim the same predecessor.
    constraint certificate_correction_events_sequence_key
        unique (certificate_id, sequence_number),
    -- A retried request with the same stable key collapses onto one event.
    constraint certificate_correction_events_idempotency_key
        unique (certificate_id, idempotency_key),
    constraint certificate_correction_events_supersede_requires_target
        check (action <> 'supersede' or replacement_certificate_id is not null),
    constraint certificate_correction_events_supersede_only
        check (action = 'supersede' or replacement_certificate_id is null),
    -- Self-supersession is structurally impossible.
    constraint certificate_correction_events_no_self_supersession
        check (
            replacement_certificate_id is null
            or replacement_certificate_id <> certificate_id
        )
);

alter table public.certificate_correction_events enable row level security;

-- CERT-008 section 3 and section 12 require the student to understand why their
-- certificate changed state. A student may read the history of their own
-- certificate. Reads are safe because the row carries a plain-language reason;
-- the service projects out the actor and internal identifiers.
create policy "students read own certificate correction history"
on public.certificate_correction_events
for select to authenticated
using (auth.uid() = user_id);

-- No student insert/update/delete policy is granted. Corrections are privileged
-- and server-authoritative, authored only by a founder_admin actor. CERT-008
-- section 8 forbids student self-revocation and self-restore.

create index if not exists certificate_correction_events_certificate_idx
on public.certificate_correction_events (certificate_id, sequence_number);

create index if not exists certificate_correction_events_user_idx
on public.certificate_correction_events (user_id, occurred_at desc);

create index if not exists certificate_correction_events_replacement_idx
on public.certificate_correction_events (replacement_certificate_id);

-- ---------------------------------------------------------------------------
-- Append-only: history is never rewritten, even by privileged code.
-- A mistaken correction is repaired by appending a new correction.
-- ---------------------------------------------------------------------------
create or replace function public.guard_certificate_correction_append_only()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'UPDATE' then
        raise exception 'Certificate correction history is append-only and cannot be updated';
    end if;
    raise exception 'Certificate correction history is append-only and cannot be deleted';
end
$$;

drop trigger if exists certificate_correction_events_append_only
on public.certificate_correction_events;

create trigger certificate_correction_events_append_only
before update or delete on public.certificate_correction_events
for each row
execute function public.guard_certificate_correction_append_only();

-- ---------------------------------------------------------------------------
-- Ownership and replacement safety.
--
-- The correction row must belong to the certificate's owner, and a replacement
-- certificate must be a real certificate. Lifecycle legality is deliberately
-- NOT checked here: CERT-004's own trigger owns that.
-- ---------------------------------------------------------------------------
create or replace function public.guard_certificate_correction_event()
returns trigger
language plpgsql
as $$
declare
    owner_id uuid;
    replacement_owner_id uuid;
begin
    select c.user_id into owner_id
      from public.certificates c
     where c.id = new.certificate_id;

    if owner_id is null then
        raise exception 'Certificate was not found';
    end if;

    if new.user_id is distinct from owner_id then
        raise exception 'Certificate correction owner must match the certificate';
    end if;

    if new.replacement_certificate_id is not null then
        select c.user_id into replacement_owner_id
          from public.certificates c
         where c.id = new.replacement_certificate_id;

        if replacement_owner_id is null then
            raise exception 'Replacement certificate was not found';
        end if;

        -- A certificate is never superseded by another learner's certificate.
        if replacement_owner_id is distinct from owner_id then
            raise exception 'Replacement certificate must belong to the same learner';
        end if;
    end if;

    return new;
end
$$;

drop trigger if exists certificate_correction_events_guard
on public.certificate_correction_events;

create trigger certificate_correction_events_guard
before insert on public.certificate_correction_events
for each row
execute function public.guard_certificate_correction_event();

-- ---------------------------------------------------------------------------
-- Privileged correction workflow
--
-- Records the workflow fact and drives CERT-004's transition in ONE
-- transaction, so a correction can never exist without its lifecycle event and
-- a lifecycle event can never be driven by CERT-008 without its reason.
--
-- What this function decides: CERT-008 workflow validity — the action is known,
-- a reason is present, replacement semantics hold, and a repeated idempotency
-- key collapses onto the existing correction.
--
-- What this function does NOT decide: whether the lifecycle transition is
-- legal. It calls public.certificate_record_lifecycle_event and lets CERT-004's
-- guard accept or refuse the edge. The action-to-status mapping below is a
-- naming translation of CERT-008 vocabulary, not a transition rule.
--
-- Privileged-RPC convention, matching public.certificate_issue and
-- public.certificate_record_lifecycle_event: security definer, fixed
-- search_path, execute revoked from every client role.
-- ---------------------------------------------------------------------------
create or replace function public.certificate_apply_correction(
    target_certificate_id uuid,
    target_action text,
    target_reason text,
    target_actor_id uuid,
    target_replacement_certificate_id uuid,
    target_effective_at timestamptz,
    target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    owner_id uuid;
    mapped_status text;
    existing_id uuid;
    last_sequence integer;
    lifecycle_id uuid;
    recorded_previous text;
    recorded_new text;
    correction_id uuid;
begin
    if target_action not in ('revoke', 'correct', 'supersede', 'restore') then
        raise exception 'Unknown certificate correction action';
    end if;

    if target_reason is null or length(btrim(target_reason)) < 8 then
        raise exception 'A certificate correction requires a reason';
    end if;

    if target_actor_id is null then
        raise exception 'A certificate correction requires an actor';
    end if;

    if target_action = 'supersede' and target_replacement_certificate_id is null then
        raise exception 'Superseding a certificate requires a replacement certificate';
    end if;

    if target_action <> 'supersede' and target_replacement_certificate_id is not null then
        raise exception 'Only supersession may name a replacement certificate';
    end if;

    -- Lock the certificate so concurrent corrections serialize, and so the
    -- idempotency check below cannot race another request.
    select c.user_id
      into owner_id
      from public.certificates c
     where c.id = target_certificate_id
       for update;

    if owner_id is null then
        raise exception 'Certificate was not found';
    end if;

    -- A retried request returns the original correction rather than recording
    -- a second one or driving a second transition.
    if target_idempotency_key is not null then
        select e.id
          into existing_id
          from public.certificate_correction_events e
         where e.certificate_id = target_certificate_id
           and e.idempotency_key = target_idempotency_key;

        if existing_id is not null then
            return existing_id;
        end if;
    end if;

    mapped_status := case target_action
        when 'revoke' then 'revoked'
        when 'correct' then 'corrected'
        when 'supersede' then 'superseded'
        when 'restore' then 'active'
    end;

    -- CERT-004 owns the transition. If the edge is not permitted, its guard
    -- raises and this whole correction is rolled back.
    lifecycle_id := public.certificate_record_lifecycle_event(
        target_certificate_id,
        mapped_status,
        target_effective_at
    );

    select l.previous_status, l.new_status
      into recorded_previous, recorded_new
      from public.certificate_lifecycle_events l
     where l.id = lifecycle_id;

    select coalesce(max(e.sequence_number), 0)
      into last_sequence
      from public.certificate_correction_events e
     where e.certificate_id = target_certificate_id;

    insert into public.certificate_correction_events (
        certificate_id,
        user_id,
        sequence_number,
        action,
        reason,
        actor_id,
        actor_role,
        previous_status,
        new_status,
        lifecycle_event_id,
        replacement_certificate_id,
        idempotency_key
    )
    values (
        target_certificate_id,
        owner_id,
        last_sequence + 1,
        target_action,
        btrim(target_reason),
        target_actor_id,
        'founder_admin',
        recorded_previous,
        recorded_new,
        lifecycle_id,
        target_replacement_certificate_id,
        target_idempotency_key
    )
    returning id into correction_id;

    return correction_id;
end;
$$;

revoke all on function public.certificate_apply_correction(
    uuid, text, text, uuid, uuid, timestamptz, text
) from public, anon, authenticated;
