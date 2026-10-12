-- Technical Learning Platform
-- WP-008: learners stop reading withheld step fields directly.
--
-- ## The defect this repairs
--
-- `20260831000100_mission_steps.sql` granted `authenticated` a TABLE-WIDE
-- SELECT on `public.mission_steps`:
--
--     grant select on public.mission_steps to authenticated;
--
-- Its row level security policy narrows ROWS to steps of published missions.
-- Nothing narrowed COLUMNS. Any signed-in learner could therefore ask
-- PostgREST for `mission_steps?select=payload` and receive every published
-- step's authored payload exactly as stored, including everything the learner
-- projection (`packages/shared-types/src/mission-instruction.ts`) withholds:
--
--   prediction.expectedOutcome              never sent to a learner
--   interaction.parameters                  at CHALLENGE ME and PROVE IT the
--     stages[].decision, fault.explanation, projection drops these, or the
--     actions (resolvesFault), confirmation, whole interaction; the raw row
--     knowledgeChecks, prediction answers   carried them at every level
--   near_transfer.questions[].correctOptionIds and .explanation
--
-- The API's projection was correct; the database beside it was not, and a
-- network response is readable. Content the server withholds must be absent
-- from every path a learner can reach, not only from the API.
--
-- ## The approach, and why it fits the accepted architecture
--
-- Learners keep SELECT on `mission_steps`, but only on named columns, and
-- never on `payload`. The row level security policy is untouched, so it still
-- decides which rows a learner may see (DEC-054: a step is readable exactly
-- when its mission is published), and every learner-callable function stays
-- SECURITY INVOKER under that policy.
--
-- Alternatives considered:
--
--   a learner view with an explicit column list
--       A default (security-definer) view runs as its owner and bypasses the
--       table's RLS, so publication would have to be restated in the view and
--       RLS would stop deciding. A `security_invoker` view still needs the
--       caller to hold column privileges on the table, which is this
--       migration anyway. A view adds an object and protects nothing more.
--
--   a learner-safe payload projection in SQL
--       The projection is support-level dependent (CURR-011 section 11) and
--       is defined once, in TypeScript, where it is typed so that a withheld
--       field cannot compile into the learner shape. A second definition in
--       SQL is a second answer to "what may a learner see", and two
--       definitions drift (`20260831000100` says the same of the step union).
--
-- Column-level privileges are therefore the smallest change that closes the
-- path at the database layer while leaving RLS, publication and the single
-- projection exactly where they were.
--
-- ## What a learner may still read, and why each column
--
--   id, mission_id, stable_id, position
--       step identity and order; the search function joins and orders on them
--   searchable_text
--       the learner-visible prose already stored by `20261011000100`, built
--       only from SEARCHABLE_STEP_TEXT_FIELDS; never an answer-bearing field
--   title_text, label_text (added here)
--       the step's own `title` and `label`, which the search result displays
--
-- Not granted: `payload` (the withheld content), `step_type`, `created_at`,
-- `updated_at`. No learner-callable function needs them.
--
-- ## How the lesson is still rendered
--
-- `getLearnerMissionInstruction` (services/api/src/curriculum.ts) still
-- resolves the mission through the learner's own RLS-scoped client. Only the
-- step payloads of that one published mission are then read SERVER-SIDE,
-- through `published_mission_step_payloads`, which only `service_role` may
-- execute, and are passed through the existing TypeScript projection before
-- anything is returned. The service-role key never leaves the API.
--
-- `service_role` is the narrowest privilege available to the API: a learner
-- JWT cannot read the payload by design, and a dedicated database role would
-- need a new signing secret, which is a Founder gate this package does not
-- cross. The function narrows what that key is used for: one mission's
-- steps, four columns, and only while the mission is published.
--
-- ## Hosted default privileges
--
-- Hosted Supabase grants new public tables to `anon` and `authenticated` by
-- default privilege, outside this repository's migrations. `revoke all` below
-- removes whatever either role holds on `mission_steps` — table-level and,
-- per PostgreSQL's REVOKE semantics, every column-level privilege too — before
-- the column grant is made, so the result does not depend on what the project
-- held beforehand. `anon` ends with nothing.
--
-- ## Search keeps working
--
-- `search_published_mission_steps` read `s.payload -> 'title'` and
-- `s.payload -> 'label'`. As SECURITY INVOKER it runs with the learner's
-- privileges, which no longer include `payload`, so it is redefined here to
-- read the two generated columns instead. Its signature, result columns,
-- matching, snippet, paging and grants are unchanged. `20261011000100` is
-- applied to UAT and is not edited.
--
-- ## Scope
--
-- Two stored generated columns on `mission_steps`, one replaced search
-- function, one new service-role read function, and privileges on
-- `mission_steps`. No table, policy, RLS or publication change; no data is
-- written except the generated columns computed for existing rows and the
-- schema-version row. Every statement may be re-run.

alter table public.mission_steps
    add column if not exists title_text text
    generated always as (
        case when jsonb_typeof(payload -> 'title') = 'string'
             then payload ->> 'title' end
    ) stored;

alter table public.mission_steps
    add column if not exists label_text text
    generated always as (
        case when jsonb_typeof(payload -> 'label') = 'string'
             then payload ->> 'label' end
    ) stored;

-- Learners lose the payload. Everything either client role held is removed
-- first, including hosted default privileges, then named columns come back.
revoke all on table public.mission_steps from public, anon, authenticated;

grant select (id, mission_id, stable_id, position, searchable_text, title_text, label_text)
    on public.mission_steps to authenticated;

-- Identical to the `20261011000100` definition except for two lines in
-- `candidates`: `step_title` and `step_label` come from the generated
-- `title_text` and `label_text` columns rather than from `payload`, so the
-- function never reads `payload`.
create or replace function public.search_published_mission_steps(
    p_phrases text[],
    p_acronyms text[],
    p_after text default null,
    p_page_size integer default 50
)
returns table (
    mission_stable_id text,
    mission_version integer,
    mission_title text,
    mission_description text,
    mission_publication_state text,
    mission_updated_at timestamptz,
    course_title text,
    step_stable_id text,
    step_position integer,
    step_title text,
    step_label text,
    step_snippet text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
    with needles as (
        select lower(btrim(phrase.value)) as needle
        from unnest(coalesce(p_phrases, '{}'::text[])) as phrase(value)
        where btrim(phrase.value) <> ''
    ),
    words as (
        select '\y' || acronym.value || 's?\y' as pattern
        from unnest(coalesce(p_acronyms, '{}'::text[])) as acronym(value)
        where acronym.value ~ '^[A-Za-z0-9]+$'
    ),
    candidates as (
        select cm.mission_stable_id as stable_id,
               cm.mission_version as version,
               cm.mission_title as title,
               cm.mission_description as description,
               cm.mission_publication_state as publication_state,
               cm.mission_updated_at as updated_at,
               cm.course_title as course,
               s.id as step_id,
               s.stable_id as step_stable,
               s.position as step_pos,
               s.title_text as step_title,
               s.label_text as step_label,
               s.searchable_text as body
        from public.current_published_missions() as cm
        join public.mission_steps as s on s.mission_id = cm.mission_id
        where p_after is null or cm.mission_stable_id > p_after
    ),
    matched as (
        select distinct on (cand.stable_id) cand.*
        from candidates as cand
        where exists (
                  select 1 from needles as n
                  where strpos(lower(cand.body), n.needle) > 0
              )
           or exists (
                  select 1 from words as w
                  where cand.body ~* w.pattern
              )
        order by cand.stable_id, cand.step_pos, cand.step_id
    ),
    paged as (
        select mt.*
        from matched as mt
        order by mt.stable_id
        limit least(greatest(coalesce(p_page_size, 50), 1), 100)
    )
    select pg.stable_id, pg.version, pg.title, pg.description,
           pg.publication_state, pg.updated_at, pg.course,
           pg.step_stable, pg.step_pos, pg.step_title, pg.step_label,
           case when win.from_at > 1 then chr(8230) else '' end
               || substr(pg.body, win.from_at, win.to_at - win.from_at)
               || case when win.to_at <= length(pg.body) then chr(8230) else '' end
    from paged as pg
    left join lateral (
        select hit.at, hit.len
        from (
            select strpos(lower(pg.body), n.needle) as at, length(n.needle) as len
            from needles as n
            union all
            select regexp_instr(pg.body, w.pattern, 1, 1, 0, 'i'),
                   regexp_instr(pg.body, w.pattern, 1, 1, 1, 'i')
                       - regexp_instr(pg.body, w.pattern, 1, 1, 0, 'i')
            from words as w
        ) as hit
        where hit.at > 0
        order by hit.at, hit.len desc
        limit 1
    ) as first_hit on true
    cross join lateral (
        select greatest(first_hit.at - 60, 1) as from_at,
               first_hit.at + first_hit.len + 100 as to_at
    ) as win
    order by pg.stable_id
$$;

-- The server-side payload read for one published mission's lesson. SECURITY
-- INVOKER: run by any role other than `service_role` it would also need
-- SELECT on `payload`, which no client role holds. It restates the
-- publication requirement itself because `service_role` bypasses RLS.
-- `position` is a PostgreSQL column-name keyword and cannot name a RETURNS
-- TABLE column unquoted; quoted, the result column is still `position`.
create or replace function public.published_mission_step_payloads(p_mission_id uuid)
returns table (
    stable_id text,
    "position" integer,
    step_type text,
    payload jsonb
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
    select s.stable_id, s.position, s.step_type, s.payload
    from public.mission_steps as s
    join public.missions as m on m.id = s.mission_id
    where s.mission_id = p_mission_id
      and m.publication_state = 'published'
    order by s.position
$$;

-- PostgreSQL grants EXECUTE on a new function to PUBLIC, which includes anon.
-- `create or replace` keeps the search function's existing grants.
revoke all on function public.published_mission_step_payloads(uuid) from public, anon, authenticated;
grant execute on function public.published_mission_step_payloads(uuid) to service_role;

insert into public.platform_schema_version (component, version)
values ('mission-step-payload-withholding', '0.1.0')
on conflict (component, version) do nothing;
