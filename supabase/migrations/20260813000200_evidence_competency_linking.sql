-- Wave 7 Batch 2 — EVID-003 Competency Evidence Linking.
--
-- Canonical relationship between Evidence Engine records and the exact
-- historical competency definitions they are approved proof for.
--
-- Forward-only. This migration does not alter Batch 1 Evidence provenance
-- semantics, does not rewrite public.evidence_records, and does not create,
-- alter, drop or write to any Learning Engine competency table (student
-- competency state, its evidence references, or its state events). Nothing here
-- marks a competency demonstrated: the Learning Engine remains authoritative
-- for mastery.
--
-- Version terminology follows the canonical curriculum model: public.competencies
-- is keyed by (stable_id, version), so a link preserves competency_stable_id and
-- competency_version and pins the exact definition row via competency_id.
-- The Learning Engine's own curriculum_version column remains a separate concept
-- and is unchanged.

create table if not exists public.evidence_competency_links (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.evidence_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete restrict,
  competency_stable_id text not null check (
    length(btrim(competency_stable_id)) > 0
  ),
  competency_version integer not null check (competency_version > 0),
  relationship text not null check (relationship in ('required', 'supporting')),
  link_source text not null check (
    link_source in (
      'source_engine_mapping',
      'approved_curriculum_mapping',
      'authoritative_manual_mapping'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint evidence_competency_links_identity_key
    unique (evidence_id, competency_stable_id, competency_version, relationship)
);

-- Logical identity deliberately excludes metadata and timestamps: descriptive
-- data never makes two trusted mappings distinct.

-- link_source has no AI value. AI may explain a mapping; it may never author one.

alter table public.evidence_competency_links enable row level security;

create policy "students read own evidence competency links"
on public.evidence_competency_links
for select to authenticated
using (auth.uid() = user_id);

-- No student insert/update/delete policy is granted. Evidence-to-competency
-- mappings are trusted and server-authoritative.

create index if not exists evidence_competency_links_evidence_idx
on public.evidence_competency_links (evidence_id);

create index if not exists evidence_competency_links_user_competency_idx
on public.evidence_competency_links (user_id, competency_stable_id, competency_version);

create index if not exists evidence_competency_links_competency_idx
on public.evidence_competency_links (competency_stable_id, competency_version);

create index if not exists evidence_competency_links_linked_idx
on public.evidence_competency_links (user_id, linked_at desc);

-- Defence in depth. The service already enforces every rule below; the database
-- enforces them again so no future caller can create an untrustworthy mapping.
create or replace function public.guard_evidence_competency_link()
returns trigger
language plpgsql
as $$
declare
  evidence_owner uuid;
  evidence_state text;
  evidence_integrity text;
  competency_stable text;
  competency_ver integer;
  competency_publication text;
begin
  select user_id, state, integrity_state
    into evidence_owner, evidence_state, evidence_integrity
  from public.evidence_records
  where id = new.evidence_id;

  if evidence_owner is null then
    raise exception 'Evidence Record % was not found', new.evidence_id;
  end if;

  -- A student may never associate another student's Evidence with a competency.
  if new.user_id is distinct from evidence_owner then
    raise exception 'Evidence competency link owner must match the Evidence owner';
  end if;

  if evidence_state <> 'active' or evidence_integrity <> 'verified' then
    raise exception
      'Only active, integrity-verified Evidence may be linked as trusted competency proof';
  end if;

  select stable_id, version, publication_state
    into competency_stable, competency_ver, competency_publication
  from public.competencies
  where id = new.competency_id;

  if competency_stable is null then
    raise exception 'Competency definition % was not found', new.competency_id;
  end if;

  -- The denormalized reference must describe the exact definition row.
  if new.competency_stable_id is distinct from competency_stable
     or new.competency_version is distinct from competency_ver then
    raise exception
      'Evidence competency link must preserve the exact competency definition reference';
  end if;

  if tg_op = 'INSERT' and competency_publication <> 'published' then
    raise exception
      'Only a published competency definition may receive trusted Evidence mappings';
  end if;

  return new;
end
$$;

drop trigger if exists evidence_competency_links_guard
on public.evidence_competency_links;

create trigger evidence_competency_links_guard
before insert or update on public.evidence_competency_links
for each row
execute function public.guard_evidence_competency_link();

-- A competency definition that is later retired does not invalidate history:
-- the stored link is preserved and read paths report the reference as retired
-- or superseded. Links are never silently remapped to the newest version, and
-- no trigger here advances competency state.

insert into public.platform_schema_version (component, version)
values ('evidence-competency-linking', '0.1.0')
on conflict (component, version) do nothing;
