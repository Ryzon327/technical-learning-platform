-- Wave 8 Batch 4 — CERT-003 Deterministic Certificate Issuance.
--
-- Creates the authoritative Certificate Record and the historical reference
-- snapshots that justified it.
--
-- What this migration deliberately does NOT own:
--   * lifecycle status, expiration, revocation, supersession of a certificate
--     (CERT-004 record and lifecycle, CERT-008 revocation and correction)
--   * verification behaviour or any public surface (CERT-005)
--   * portfolio, export, sharing, rendering, branding (CERT-006/007/009)
--
-- There is therefore no status column, no expires_at, no revoked_at, no
-- superseded_by and no presentation metadata anywhere in this file.

create table if not exists public.certificates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,

    -- The exact Certificate Definition version. `on delete restrict`: the
    -- definition that justified a certificate can never be deleted out from
    -- under it.
    certificate_definition_id uuid not null
        references public.certificate_definitions(id) on delete restrict,
    certificate_definition_stable_id text not null,
    certificate_definition_version integer not null
        check (certificate_definition_version > 0),

    -- Opaque, non-enumerable identifier minted at issuance (CERT-003 section 10).
    -- It is a hook only: CERT-003 exposes no verification route, and CERT-005
    -- owns public verification behaviour.
    verification_id text not null unique
        check (verification_id ~ '^cert1_[a-f0-9]{48}$'),

    issued_at timestamptz not null default now(),
    created_at timestamptz not null default now(),

    -- CERT-003 idempotency: exactly one Certificate Record per student per
    -- exact definition version. A retry after a lost network response can
    -- therefore never become a duplicate certificate.
    constraint certificates_student_definition_key
        unique (user_id, certificate_definition_id)
);

-- Historical reference snapshots.
--
-- References only. No Evidence content, digest, outcome, effective state,
-- correction history, provider payload or mutable presentation data is copied:
-- Wave 7 remains the single source of Evidence truth. These answer "what exact
-- definition version and what exact qualifying references justified this
-- issuance?" without asserting those references remain valid forever.

create table if not exists public.certificate_competency_snapshots (
    certificate_id uuid not null
        references public.certificates(id) on delete cascade,
    competency_stable_id text not null,
    competency_version integer not null check (competency_version > 0),
    created_at timestamptz not null default now(),
    primary key (certificate_id, competency_stable_id, competency_version)
);

create table if not exists public.certificate_evidence_snapshots (
    certificate_id uuid not null
        references public.certificates(id) on delete cascade,
    evidence_id uuid not null
        references public.evidence_records(id) on delete restrict,
    competency_stable_id text not null,
    competency_version integer not null check (competency_version > 0),
    created_at timestamptz not null default now(),
    primary key (
        certificate_id,
        evidence_id,
        competency_stable_id,
        competency_version
    )
);

create index if not exists idx_certificates_user
    on public.certificates (user_id, issued_at desc);

create index if not exists idx_certificates_definition
    on public.certificates (certificate_definition_id);

create index if not exists idx_certificate_evidence_snapshots_evidence
    on public.certificate_evidence_snapshots (evidence_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Students read their own certificates and the snapshots belonging to them.
-- No student INSERT, UPDATE, DELETE or ALL policy is granted anywhere:
-- issuance is server-authoritative through the privileged RPC below.
-- ---------------------------------------------------------------------------

alter table public.certificates enable row level security;
alter table public.certificate_competency_snapshots enable row level security;
alter table public.certificate_evidence_snapshots enable row level security;

create policy "students read own certificates"
on public.certificates
for select
to authenticated
using (auth.uid() = user_id);

create policy "students read own certificate competency snapshots"
on public.certificate_competency_snapshots
for select
to authenticated
using (
    exists (
        select 1
        from public.certificates c
        where c.id = certificate_id
          and c.user_id = auth.uid()
    )
);

create policy "students read own certificate evidence snapshots"
on public.certificate_evidence_snapshots
for select
to authenticated
using (
    exists (
        select 1
        from public.certificates c
        where c.id = certificate_id
          and c.user_id = auth.uid()
    )
);

-- ---------------------------------------------------------------------------
-- Definition pin integrity
--
-- The denormalized stable id and version must always describe the exact
-- Certificate Definition row referenced by certificate_definition_id, so a
-- certificate can never claim one version while pointing at another.
-- ---------------------------------------------------------------------------
create or replace function public.guard_certificate_definition_pin()
returns trigger
language plpgsql
as $$
declare
    actual_stable_id text;
    actual_version integer;
begin
    select d.stable_id, d.version
      into actual_stable_id, actual_version
      from public.certificate_definitions d
     where d.id = new.certificate_definition_id;

    if actual_stable_id is null then
        raise exception 'Certificate references an unknown Certificate Definition';
    end if;

    if new.certificate_definition_stable_id is distinct from actual_stable_id
       or new.certificate_definition_version is distinct from actual_version then
        raise exception
            'Certificate definition pin must match the exact definition version';
    end if;

    return new;
end
$$;

drop trigger if exists certificates_definition_pin_guard on public.certificates;

create trigger certificates_definition_pin_guard
before insert or update on public.certificates
for each row
execute function public.guard_certificate_definition_pin();

-- ---------------------------------------------------------------------------
-- Issued certificates are historical
--
-- An issued Certificate Record states what was true at issuance time. CERT-003
-- never rewrites one: later definition supersession, publication of another
-- version, title changes, Evidence corrections or a change in current
-- eligibility all leave the record exactly as issued.
--
-- Lifecycle reactions to those events belong to CERT-004 and CERT-008, which
-- will add their own columns and their own transitions. Until then, every
-- column here is frozen, and the snapshots are append-only-at-insert.
-- ---------------------------------------------------------------------------
create or replace function public.guard_certificate_immutable()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Issued Certificate Records are immutable in CERT-003';
end
$$;

drop trigger if exists certificates_immutable on public.certificates;

create trigger certificates_immutable
before update on public.certificates
for each row
execute function public.guard_certificate_immutable();

create or replace function public.guard_certificate_snapshot_immutable()
returns trigger
language plpgsql
as $$
begin
    raise exception 'Certificate issuance snapshots are immutable';
end
$$;

drop trigger if exists certificate_competency_snapshots_immutable
on public.certificate_competency_snapshots;

create trigger certificate_competency_snapshots_immutable
before update on public.certificate_competency_snapshots
for each row
execute function public.guard_certificate_snapshot_immutable();

drop trigger if exists certificate_evidence_snapshots_immutable
on public.certificate_evidence_snapshots;

create trigger certificate_evidence_snapshots_immutable
before update on public.certificate_evidence_snapshots
for each row
execute function public.guard_certificate_snapshot_immutable();

-- ---------------------------------------------------------------------------
-- Transaction-time issuance
--
-- CERT-002 in TypeScript determines WHY the student is eligible. This function
-- confirms that the exact relied-upon authoritative inputs have not materially
-- changed, and then creates the historical record — all in one transaction.
--
-- It is NOT a second eligibility evaluator. It never replays the Wave 7
-- correction resolver, never derives an Evidence outcome, never counts Evidence
-- against a policy, never evaluates competency satisfaction, never searches for
-- replacement Evidence, and never selects a different version. Every Evidence
-- check below is a pure equality comparison against the value the application
-- observed, so no Wave 7 or CERT-002 rule is reimplemented here.
--
-- Why each pinned input is necessary:
--
--   pin_states            the base state is the replay ORIGIN of
--                         resolveEffectiveEvidenceState. Reading it and
--                         asserting a literal would encode Wave 7 semantics in
--                         SQL; comparing it detects drift without doing so.
--   pin_correction_counts a correction event appended after evaluation can
--                         invalidate, supersede or open a review on Evidence.
--                         Comparing the count detects ANY such append without
--                         replaying the resolver. This is the minimum safe
--                         change-detector for append-only history.
--   pin_result_states     metadata.resultState is the input to Wave 7 outcome
--                         derivation. SQL cannot judge "positive" without
--                         reimplementing deriveEvidenceOutcome, so the observed
--                         value is compared instead.
--   pin_integrity_states  integrity_state is a qualification precondition.
--                         Comparing rather than asserting 'verified' keeps the
--                         rule itself in Wave 7 where it belongs.
--
-- Definition publication and supersession are NOT pinned: CERT-003 requires the
-- CURRENT state to be published and not superseded, so the authoritative
-- current row is read directly inside the transaction.
--
-- Fail-closed: if any relied-upon input changed, the whole transaction aborts.
-- The application may then perform a fresh CERT-002 evaluation.
--
-- Privileged-RPC convention, matching public.curriculum_publish_learning_path_tree:
-- security definer, fixed search_path, execute revoked from every client role.
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
    existing_certificate_id uuid;
    new_certificate_id uuid;
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
    select d.publication_state, d.superseded_by_definition_id, d.stable_id, d.version
      into definition_state, definition_superseded, definition_stable_id, definition_version
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

    -- 6. Create exactly one Certificate Record and its snapshots.
    insert into public.certificates (
        user_id,
        certificate_definition_id,
        certificate_definition_stable_id,
        certificate_definition_version,
        verification_id
    )
    values (
        target_user_id,
        target_definition_id,
        definition_stable_id,
        definition_version,
        new_verification_id
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
values ('certificate-issuance-foundation', '0.1.0')
on conflict (component, version) do nothing;
