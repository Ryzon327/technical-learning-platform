-- Wave 8 Batch 1 — CERT-001 Certificate Definition Model.
--
-- This migration owns the authoritative *specification* of a certificate:
-- identity, version, requirements, issuer, validity window, verification
-- policy, publication state and supersession.
--
-- It owns nothing about a student. There is deliberately no student
-- certificate table, no issuance record, no eligibility result, no verification
-- identifier and no expiry timestamp anywhere in this file. Those belong to
-- CERT-002 (eligibility), CERT-003 (issuance), CERT-004 (record and lifecycle)
-- and CERT-005 (verification), none of which are implemented in this batch.
--
-- Structured requirements are normalized into child tables rather than stored
-- as JSON blobs, so a certificate's required competencies and evidence policies
-- are queryable, constrained and version-pinned by the database itself.

create table if not exists public.certificate_definitions (
    id uuid primary key default gen_random_uuid(),
    stable_id text not null,
    version integer not null default 1 check (version > 0),
    title text not null check (length(btrim(title)) > 0),
    description text,
    issuer text not null check (length(btrim(issuer)) > 0),
    publication_state text not null default 'draft'
        check (publication_state in ('draft', 'review', 'published', 'retired')),
    effective_at timestamptz not null,

    -- Approved MVP expiration policy: NULL means the certificate does not
    -- expire; otherwise an integer validity window of 1-600 months. This is a
    -- declaration only. No expiry date is computed here, no scheduler reads it,
    -- and there is no revalidation model in this batch.
    expiration_months integer
        check (
            expiration_months is null
            or (expiration_months >= 1 and expiration_months <= 600)
        ),

    -- Declarative verification policy only. Granting it creates no public
    -- verification surface, mints no verification identifier and enables no
    -- lookup. CERT-005 owns verification behaviour and is not implemented.
    verification_permitted boolean not null default false,

    -- CERT-001 section 13: supersede an older definition without deleting
    -- history. This is the only certificate-to-certificate relationship in the
    -- model; prerequisite certificates are explicitly not part of it.
    superseded_by_definition_id uuid
        references public.certificate_definitions(id) on delete restrict,

    -- Accessible presentation metadata (CERT-001 section 10). Descriptive
    -- only; it never participates in eligibility.
    plain_language_title text not null
        check (length(btrim(plain_language_title)) > 0),
    plain_language_summary text,
    logo_text_alternative text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (stable_id, version),
    constraint certificate_definitions_no_self_supersession
        check (superseded_by_definition_id is null
               or superseded_by_definition_id <> id)
);

-- Required competencies, pinned to one exact historical competency row.
--
-- The foreign key targets public.competencies(id), which is the row for one
-- specific (stable_id, version) pair. competency_stable_id and
-- competency_version are carried alongside it and kept in agreement by a
-- trigger, so the pinned version is readable and auditable without a join and
-- can never drift to "latest".
create table if not exists public.certificate_definition_competencies (
    certificate_definition_id uuid not null
        references public.certificate_definitions(id) on delete cascade,
    competency_id uuid not null
        references public.competencies(id) on delete restrict,
    competency_stable_id text not null,
    competency_version integer not null check (competency_version > 0),
    required boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (certificate_definition_id, competency_id)
);

-- Declarative evidence requirements. CERT-002 reads these to evaluate
-- eligibility. Nothing in this batch evaluates them.
create table if not exists public.certificate_definition_evidence_policies (
    certificate_definition_id uuid not null
        references public.certificate_definitions(id) on delete cascade,
    evidence_source_type text not null check (
        evidence_source_type in (
            'assessment_attempt',
            'lab_validation',
            'manual_authoritative',
            'system_authoritative'
        )
    ),
    minimum_count integer not null default 1
        check (minimum_count >= 1 and minimum_count <= 100),
    require_positive_outcome boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (certificate_definition_id, evidence_source_type)
);

create index if not exists idx_certificate_definitions_publication
    on public.certificate_definitions (publication_state);

create index if not exists idx_certificate_definitions_stable
    on public.certificate_definitions (stable_id, version desc);

create index if not exists idx_certificate_definitions_superseded_by
    on public.certificate_definitions (superseded_by_definition_id);

create index if not exists idx_certificate_definition_competencies_competency
    on public.certificate_definition_competencies (competency_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Authenticated users may read published definitions only, so a student can
-- understand what a certificate represents (CERT-001 section 3). Draft, review
-- and retired definitions stay invisible.
--
-- No student INSERT, UPDATE, DELETE or ALL policy is granted on any of the
-- three tables. Authoring is server-authoritative through the founder_admin
-- path only.
-- ---------------------------------------------------------------------------

alter table public.certificate_definitions enable row level security;
alter table public.certificate_definition_competencies enable row level security;
alter table public.certificate_definition_evidence_policies enable row level security;

create policy "authenticated users can read published certificate definitions"
on public.certificate_definitions
for select
to authenticated
using (publication_state = 'published');

create policy "authenticated users can read published certificate competencies"
on public.certificate_definition_competencies
for select
to authenticated
using (
    exists (
        select 1
        from public.certificate_definitions d
        where d.id = certificate_definition_id
          and d.publication_state = 'published'
    )
);

create policy "authenticated users can read published certificate evidence policies"
on public.certificate_definition_evidence_policies
for select
to authenticated
using (
    exists (
        select 1
        from public.certificate_definitions d
        where d.id = certificate_definition_id
          and d.publication_state = 'published'
    )
);

-- ---------------------------------------------------------------------------
-- Pinned competency integrity
--
-- The denormalized stable id and version must always describe the exact
-- competency row referenced by competency_id. This closes the only path by
-- which a certificate could claim to require one competency version while
-- pointing at another.
-- ---------------------------------------------------------------------------
create or replace function public.guard_certificate_definition_competency_pin()
returns trigger
language plpgsql
as $$
declare
    actual_stable_id text;
    actual_version integer;
begin
    select c.stable_id, c.version
      into actual_stable_id, actual_version
      from public.competencies c
     where c.id = new.competency_id;

    if actual_stable_id is null then
        raise exception
            'Certificate Definition references an unknown competency';
    end if;

    if new.competency_stable_id is distinct from actual_stable_id
       or new.competency_version is distinct from actual_version then
        raise exception
            'Certificate Definition competency pin must match the exact competency version';
    end if;

    return new;
end
$$;

drop trigger if exists certificate_definition_competencies_pin_guard
on public.certificate_definition_competencies;

create trigger certificate_definition_competencies_pin_guard
before insert or update on public.certificate_definition_competencies
for each row
execute function public.guard_certificate_definition_competency_pin();

-- ---------------------------------------------------------------------------
-- Published material immutability
--
-- A published Certificate Definition version is materially immutable. These
-- columns are exactly the conceptual fields listed in
-- CERTIFICATE_DEFINITION_MATERIAL_FIELDS in
-- packages/shared-types/src/certificate-definition.ts:
--
--     stable_id              -> stableId
--     version                -> version
--     issuer                 -> issuer
--     effective_at           -> effectiveAt
--     expiration_months      -> expirationMonths
--     verification_permitted -> verificationPermitted
--     (child rows)           -> requiredCompetencies, evidencePolicies
--
-- Changing one of these on a published version would retroactively change what
-- every certificate already issued against that version meant. Material change
-- requires a new definition version.
--
-- title, description and the presentation columns are deliberately NOT frozen.
-- CERT-001 section 7 states that Certificate Definition IDs remain stable
-- across display-title changes, and section 10 requires accessible
-- presentation metadata that can be improved without reissuing certificates.
--
-- publication_state and superseded_by_definition_id are not frozen either:
-- they are the retirement and supersession mechanisms themselves.
--
-- This holds even for the service role. Immutability is enforced at the
-- database, not merely by application convention.
-- ---------------------------------------------------------------------------
create or replace function public.guard_certificate_definition_material_freeze()
returns trigger
language plpgsql
as $$
begin
    if old.publication_state = 'published' then
        if new.stable_id is distinct from old.stable_id
           or new.version is distinct from old.version
           or new.issuer is distinct from old.issuer
           or new.effective_at is distinct from old.effective_at
           or new.expiration_months is distinct from old.expiration_months
           or new.verification_permitted is distinct from old.verification_permitted then
            raise exception
                'Published Certificate Definition versions are materially immutable';
        end if;
    end if;

    new.updated_at := now();
    return new;
end
$$;

drop trigger if exists certificate_definitions_material_freeze
on public.certificate_definitions;

create trigger certificate_definitions_material_freeze
before update on public.certificate_definitions
for each row
execute function public.guard_certificate_definition_material_freeze();

-- Requirement rows are material in their own right: adding, removing or
-- altering one changes what the certificate requires. They are frozen whenever
-- their parent definition is published.
create or replace function public.guard_certificate_definition_requirement_freeze()
returns trigger
language plpgsql
as $$
declare
    parent_state text;
    parent_id uuid;
begin
    -- NEW is unassigned for DELETE, so the row under inspection is chosen by
    -- operation rather than by coalescing the two records.
    if tg_op = 'DELETE' then
        parent_id := old.certificate_definition_id;
    else
        parent_id := new.certificate_definition_id;
    end if;

    select d.publication_state
      into parent_state
      from public.certificate_definitions d
     where d.id = parent_id;

    -- A cascaded delete removes the parent first; there is nothing left to
    -- protect and the definition itself is gone.
    if parent_state is not null and parent_state = 'published' then
        raise exception
            'Published Certificate Definition requirements are materially immutable';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end
$$;

drop trigger if exists certificate_definition_competencies_freeze
on public.certificate_definition_competencies;

create trigger certificate_definition_competencies_freeze
before insert or update or delete on public.certificate_definition_competencies
for each row
execute function public.guard_certificate_definition_requirement_freeze();

drop trigger if exists certificate_definition_evidence_policies_freeze
on public.certificate_definition_evidence_policies;

create trigger certificate_definition_evidence_policies_freeze
before insert or update or delete on public.certificate_definition_evidence_policies
for each row
execute function public.guard_certificate_definition_requirement_freeze();

-- ---------------------------------------------------------------------------
-- Supersession integrity
--
-- Self-supersession is rejected by a CHECK constraint. A cycle spanning two or
-- more definitions needs a walk, which this trigger performs before the write
-- is accepted. The walk is bounded by the number of definitions, so a corrupt
-- chain cannot spin forever.
-- ---------------------------------------------------------------------------
create or replace function public.guard_certificate_definition_supersession()
returns trigger
language plpgsql
as $$
declare
    cursor_id uuid;
    steps integer := 0;
    max_steps integer;
begin
    if new.superseded_by_definition_id is null then
        return new;
    end if;

    if new.superseded_by_definition_id = new.id then
        raise exception 'A Certificate Definition cannot supersede itself';
    end if;

    select count(*) + 1 into max_steps from public.certificate_definitions;

    cursor_id := new.superseded_by_definition_id;

    while cursor_id is not null loop
        if cursor_id = new.id then
            raise exception
                'Certificate Definition supersession would create a cycle';
        end if;

        steps := steps + 1;
        if steps > max_steps then
            raise exception
                'Certificate Definition supersession chain is not resolvable';
        end if;

        select d.superseded_by_definition_id
          into cursor_id
          from public.certificate_definitions d
         where d.id = cursor_id;
    end loop;

    return new;
end
$$;

drop trigger if exists certificate_definitions_supersession_guard
on public.certificate_definitions;

create trigger certificate_definitions_supersession_guard
before insert or update on public.certificate_definitions
for each row
execute function public.guard_certificate_definition_supersession();

-- ---------------------------------------------------------------------------
-- Atomic requirement replacement
--
-- Replacing a requirement set is a DELETE followed by an INSERT. Issued as two
-- separate PostgREST calls those are two separate transactions, so a failure
-- between them would leave the definition with its previous requirements
-- removed and nothing in their place — the definition would silently come to
-- require less than it did before.
--
-- These functions run both statements inside a single implicit transaction.
-- Any failure — a constraint violation, a pin-guard raise, a vanished
-- competency, a dropped connection — rolls the whole replacement back and the
-- previous requirement set survives untouched.
--
-- Requirements arrive as parallel typed arrays rather than a JSON document, so
-- the structured requirement contract stays typed from the service to the row.
--
-- Both follow the privileged-RPC convention established by
-- public.curriculum_publish_learning_path_tree: security definer, a fixed
-- search_path, and EXECUTE revoked from public, anon and authenticated so that
-- only the service role can call them. No student execution permission is
-- granted, and the founder_admin authoring boundary in the API is unchanged.
--
-- The row-level freeze and pin triggers still fire inside these functions, so
-- the published-definition guarantee and the exact-version pin are enforced
-- here exactly as they are for any other writer.
-- ---------------------------------------------------------------------------
create or replace function public.certificate_definition_replace_competencies(
    target_definition_id uuid,
    competency_ids uuid[],
    competency_stable_ids text[],
    competency_versions integer[],
    required_flags boolean[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    parent_state text;
    element_count integer := coalesce(array_length(competency_ids, 1), 0);
begin
    if element_count is distinct from coalesce(array_length(competency_stable_ids, 1), 0)
       or element_count is distinct from coalesce(array_length(competency_versions, 1), 0)
       or element_count is distinct from coalesce(array_length(required_flags, 1), 0) then
        raise exception
            'Certificate Definition competency arrays must be the same length';
    end if;

    -- Lock the parent so two concurrent replacements cannot interleave.
    select d.publication_state
      into parent_state
      from public.certificate_definitions d
     where d.id = target_definition_id
       for update;

    if parent_state is null then
        raise exception 'Certificate Definition was not found';
    end if;

    if parent_state = 'published' then
        raise exception
            'Published Certificate Definition requirements are materially immutable';
    end if;

    delete from public.certificate_definition_competencies
     where certificate_definition_id = target_definition_id;

    if element_count > 0 then
        insert into public.certificate_definition_competencies (
            certificate_definition_id,
            competency_id,
            competency_stable_id,
            competency_version,
            required
        )
        select
            target_definition_id,
            ids.value,
            stable_ids.value,
            versions.value,
            flags.value
        from unnest(competency_ids) with ordinality as ids(value, position)
        join unnest(competency_stable_ids) with ordinality as stable_ids(value, position)
          on stable_ids.position = ids.position
        join unnest(competency_versions) with ordinality as versions(value, position)
          on versions.position = ids.position
        join unnest(required_flags) with ordinality as flags(value, position)
          on flags.position = ids.position;
    end if;
end;
$$;

revoke all on function public.certificate_definition_replace_competencies(
    uuid, uuid[], text[], integer[], boolean[]
) from public, anon, authenticated;

create or replace function public.certificate_definition_replace_evidence_policies(
    target_definition_id uuid,
    source_types text[],
    minimum_counts integer[],
    require_positive_flags boolean[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    parent_state text;
    element_count integer := coalesce(array_length(source_types, 1), 0);
begin
    if element_count is distinct from coalesce(array_length(minimum_counts, 1), 0)
       or element_count is distinct from coalesce(array_length(require_positive_flags, 1), 0) then
        raise exception
            'Certificate Definition evidence policy arrays must be the same length';
    end if;

    select d.publication_state
      into parent_state
      from public.certificate_definitions d
     where d.id = target_definition_id
       for update;

    if parent_state is null then
        raise exception 'Certificate Definition was not found';
    end if;

    if parent_state = 'published' then
        raise exception
            'Published Certificate Definition requirements are materially immutable';
    end if;

    delete from public.certificate_definition_evidence_policies
     where certificate_definition_id = target_definition_id;

    if element_count > 0 then
        insert into public.certificate_definition_evidence_policies (
            certificate_definition_id,
            evidence_source_type,
            minimum_count,
            require_positive_outcome
        )
        select
            target_definition_id,
            types.value,
            counts.value,
            flags.value
        from unnest(source_types) with ordinality as types(value, position)
        join unnest(minimum_counts) with ordinality as counts(value, position)
          on counts.position = types.position
        join unnest(require_positive_flags) with ordinality as flags(value, position)
          on flags.position = types.position;
    end if;
end;
$$;

revoke all on function public.certificate_definition_replace_evidence_policies(
    uuid, text[], integer[], boolean[]
) from public, anon, authenticated;

insert into public.platform_schema_version (component, version)
values ('certificate-definition-foundation', '0.1.0')
on conflict (component, version) do nothing;
