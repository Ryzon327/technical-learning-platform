-- Technical Learning Platform
-- WP-005 / Founder direction G-001: step-body search matching and pagination
-- move into PostgreSQL.
--
-- ## What this adds
--
-- Three read-only functions, used only by `services/api/src/curriculum-step-search.ts`:
--
--   mission_step_searchable_text(jsonb)   the learner-visible prose of one
--                                         step payload, decoded and
--                                         whitespace-compacted
--   search_published_mission_steps(...)   one row per published mission whose
--                                         CURRENT version has a matching step,
--                                         naming the earliest such step, with a
--                                         snippet of its learner-visible text
--   published_mission_contexts(...)       the current published version, with
--                                         its course, of named missions
--
-- and `mission_steps.searchable_text`, the first function's result stored per
-- step (see Performance).
--
-- Before this, the API pulled raw step rows over PostgREST, matched an
-- approximation of the text there, re-checked it in TypeScript, and resolved
-- each mission's highest published version with offset pages whose size grew
-- with the request. A PostgREST `max-rows` cap smaller than such a page made a
-- truncated page look like the last one, and missions silently disappeared.
--
-- Here the database does the matching over the decoded text itself, resolves
-- the version, picks the step, and returns ONE row per mission in stable-id
-- order. Pages are keyset pages (`p_after`), so a page shortened by any server
-- row cap still advances correctly: the caller simply asks for the rows after
-- the last stable id it received, until a page comes back empty.
--
-- ## Published-only, and RLS still decides
--
-- Every function is SECURITY INVOKER. It runs with the caller's role and the
-- caller's JWT claims, so the existing row level security on `missions`,
-- `learning_modules`, `courses` and `mission_steps` (published-only, and a
-- step only when its mission is published, DEC-054) applies exactly as it does
-- to a direct table read. No function here can see a row the caller could not
-- already select. Each also states the publication requirement itself, as
-- defence in depth, so a superuser session still only ever sees published
-- curriculum through them.
--
-- ## What is searched
--
-- The step fields listed in `SEARCHABLE_STEP_TEXT_FIELDS`
-- (`curriculum-step-search.ts`), in that order, joined by a space and
-- whitespace-compacted. Answer-bearing and withheld fields (`expectedOutcome`,
-- `questions`, `options`, `parameters`, ...) are never read.
-- `services/api/src/wp005-step-search-sql.test.ts` fails if the two lists
-- diverge.
--
-- ## What is returned (Founder direction G-003)
--
-- Only what the search UI displays: mission, course and step identifiers and
-- titles (the step's own `title` or `label`), the mission fields every search
-- candidate already carries, and `step_snippet`, a short excerpt cut from the
-- stored searchable text above around the earliest match. Never the step
-- payload: no `expectedOutcome`, near-transfer answer, interaction parameter or
-- any other withheld field ever leaves the function, whatever the caller
-- searched for. `curriculum-step-search.db.test.ts` calls the function directly
-- as an authenticated learner and fails if one does.
--
-- ## Matching rules
--
--   p_phrases    case-insensitive substring, by `strpos` on lower-cased text.
--                No pattern language is involved, so learner text needs no
--                escaping and cannot become syntax.
--   p_acronyms   case-insensitive whole word with an optional plural `s`
--                (`\y` is a word boundary). Only letters-and-digits values are
--                used; anything else is ignored, so no value can carry regular
--                expression syntax. The API passes validated alias DATA members
--                here, never learner text.
--
-- ## Performance (Founder direction G-002)
--
-- Each step's searchable text is computed ONCE, when the step is written, and
-- stored in `mission_steps.searchable_text`: a STORED generated column built
-- from the IMMUTABLE `mission_step_searchable_text(payload)`, so it can never
-- disagree with the payload it came from. A search call no longer decodes any
-- JSON. It is a sequential scan of the current published steps that lower-cases
-- the stored text and runs `strpos` and the whole-word expression on it. The
-- snippet is cut only for the rows of the returned page.
--
-- Before this, every call rebuilt the text of every current step (about 1200
-- in the latency fixture), and that alone took most of the 500 ms budget.
-- `services/api/src/curriculum-step-search.db.test.ts` measures the function
-- and the service end to end against a real PostgreSQL in CI, over a fixture
-- larger than today's content, and prints the observed times.
--
-- No index is added. Phrases are matched with `strpos`, which no index serves,
-- and a trigram index was not added without a measured speedup to justify it.
--
-- ## Scope
--
-- The functions and their EXECUTE grants, and one generated column on
-- `public.mission_steps`. No new table, index, policy or RLS change; no grant
-- is widened. The column is derived only from the learner-visible fields
-- above, never an answer-bearing one, and every existing policy on
-- `mission_steps` governs it. Nothing writes data; adding the column only
-- computes it for the existing rows.
--
-- Writing a step now evaluates `mission_step_searchable_text`, so the writer's
-- role needs EXECUTE on it. The grants below give it explicitly to
-- `service_role` (the curriculum writer, per the service-role privilege
-- contract) as well as `authenticated`, rather than relying on hosted platform
-- default privileges. `service_role` gets that one function only, never the
-- learner search functions. Changing that function's text rules later needs a
-- migration that also recomputes the column.

create or replace function public.mission_step_searchable_text(p_payload jsonb)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
    select btrim(regexp_replace(
        coalesce(string_agg(parts.part, ' ' order by parts.field_order, parts.item_order), ''),
        '\s+', ' ', 'g'
    ))
    from (
        select fields.ord as field_order,
               0::bigint as item_order,
               p_payload ->> fields.name as part
        from unnest(array[
            'title', 'paragraphs', 'caption', 'textAlternative', 'command', 'output',
            'prompt', 'textEquivalent', 'framing', 'label', 'note'
        ]) with ordinality as fields(name, ord)
        where jsonb_typeof(p_payload -> fields.name) = 'string'

        union all

        select fields.ord,
               items.ord,
               items.value #>> '{}'
        from unnest(array[
            'title', 'paragraphs', 'caption', 'textAlternative', 'command', 'output',
            'prompt', 'textEquivalent', 'framing', 'label', 'note'
        ]) with ordinality as fields(name, ord)
        cross join lateral jsonb_array_elements(
            case when jsonb_typeof(p_payload -> fields.name) = 'array'
                 then p_payload -> fields.name
                 else '[]'::jsonb
            end
        ) with ordinality as items(value, ord)
        where jsonb_typeof(items.value) = 'string'
    ) as parts
$$;

-- Founder direction G-002: the searchable text, computed once per write rather
-- than once per search.
alter table public.mission_steps
    add column searchable_text text
    generated always as (public.mission_step_searchable_text(payload)) stored;

-- The current published version of every mission the caller can read, with
-- its published course. "Current" is the highest published version whose
-- module and course are also published, which is what the previous inner
-- PostgREST embed resolved.
create or replace function public.current_published_missions()
returns table (
    mission_id uuid,
    mission_stable_id text,
    mission_version integer,
    mission_title text,
    mission_description text,
    mission_publication_state text,
    mission_updated_at timestamptz,
    course_title text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
    select distinct on (m.stable_id)
           m.id, m.stable_id, m.version, m.title, m.description,
           m.publication_state, m.updated_at, c.title
    from public.missions as m
    join public.learning_modules as lm on lm.id = m.module_id
    join public.courses as c on c.id = lm.course_id
    where m.publication_state = 'published'
      and lm.publication_state = 'published'
      and c.publication_state = 'published'
    order by m.stable_id, m.version desc
$$;

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
               case when jsonb_typeof(s.payload -> 'title') = 'string'
                    then s.payload ->> 'title' end as step_title,
               case when jsonb_typeof(s.payload -> 'label') = 'string'
                    then s.payload ->> 'label' end as step_label,
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
    -- The snippet is cut from the stored learner-visible text around its
    -- earliest match: 60 characters before and 100 after, with an ellipsis
    -- where text was cut (CURRICULUM_MATCH_SNIPPET_BEFORE / _AFTER). chr(8230)
    -- is the ellipsis.
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

create or replace function public.published_mission_contexts(
    p_stable_ids text[],
    p_after text default null,
    p_page_size integer default 50
)
returns table (
    mission_stable_id text,
    mission_version integer,
    mission_title text,
    course_title text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
    select cm.mission_stable_id, cm.mission_version, cm.mission_title, cm.course_title
    from public.current_published_missions() as cm
    where cm.mission_stable_id = any(coalesce(p_stable_ids, '{}'::text[]))
      and (p_after is null or cm.mission_stable_id > p_after)
    order by cm.mission_stable_id
    limit least(greatest(coalesce(p_page_size, 50), 1), 100)
$$;

-- PostgreSQL grants EXECUTE on a new function to PUBLIC, which includes anon.
-- Search is an authenticated learner surface only.
revoke all on function public.mission_step_searchable_text(jsonb) from public, anon;
revoke all on function public.current_published_missions() from public, anon;
revoke all on function public.search_published_mission_steps(text[], text[], text, integer) from public, anon;
revoke all on function public.published_mission_contexts(text[], text, integer) from public, anon;

grant execute on function public.mission_step_searchable_text(jsonb) to authenticated;
-- The searchable_text column evaluates this on every step insert and payload
-- update, so the curriculum writer must be able to execute it.
grant execute on function public.mission_step_searchable_text(jsonb) to service_role;
grant execute on function public.current_published_missions() to authenticated;
grant execute on function public.search_published_mission_steps(text[], text[], text, integer) to authenticated;
grant execute on function public.published_mission_contexts(text[], text, integer) to authenticated;

insert into public.platform_schema_version (component, version)
values ('curriculum-step-search', '0.1.0')
on conflict (component, version) do nothing;
