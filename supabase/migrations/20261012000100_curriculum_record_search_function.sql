-- Technical Learning Platform
-- WP-005 / Founder direction G-005: title and description matching moves into
-- PostgreSQL, beside step-body search.
--
-- ## Why
--
-- Founder UAT on the UAT Supabase project: searching `VLAN` or `vlan` returned
-- nothing, although PostgreSQL itself matches `title ~* '\yVLANs?\y'`. The API
-- sent each whole-word acronym to PostgREST as an `imatch` filter inside an
-- `or=(...)` query parameter, so the regular expression travelled as PostgREST
-- filter syntax rather than as a bound argument, and that path returned no
-- row. Plain phrases (`ilike`) and the step-body function (`20261011000100`)
-- were unaffected. The exact transformation was not reproduced outside UAT; it
-- no longer matters, because no pattern travels that way any more.
--
-- Here the acronym and the phrases reach PostgreSQL as ordinary function
-- arguments (`text[]`), never as filter syntax, and are matched by exactly the
-- rules `search_published_mission_steps` applies to step bodies. One tested
-- path now handles all matching: `curriculum-step-search.db.test.ts` calls this
-- function against real PostgreSQL in CI.
--
-- `20261011000100_curriculum_step_search_functions.sql` is already applied to
-- UAT and is not edited.
--
-- ## What this adds
--
--   search_published_curriculum_records(...)
--       one row per stable identity of the named curriculum source
--       (`learning_paths`, `courses`, `missions` or `competencies`) whose title
--       or description matches, at its highest published matching version, in
--       stable-id order, keyset paged by `p_after`
--
-- Used only by `services/api/src/curriculum-record-search.ts`.
--
-- ## Published-only, and RLS still decides
--
-- SECURITY INVOKER. It runs with the caller's role and JWT claims, so the
-- published-only `for select to authenticated` policies on all four tables
-- apply exactly as they do to the direct table read this replaces. It also
-- states `publication_state = 'published'` itself for every source, as defence
-- in depth, as that read did with `.eq("publication_state", "published")`.
--
-- ## Matching rules (the same as step bodies)
--
--   p_phrases    case-insensitive substring of the title, or of the
--                description, by `strpos` on lower-cased text. No pattern
--                language, so `%`, `_` and `\` in learner text are literal and
--                need no escaping.
--   p_acronyms   case-insensitive whole word with an optional plural `s`
--                (`\y` is a word boundary). Only letters-and-digits values are
--                used; anything else is ignored, so no value can carry regular
--                expression syntax. The API passes validated alias DATA
--                members here, never learner text.
--
-- Title and description are matched separately, never across their join.
--
-- ## What is returned
--
-- Only the columns the previous direct read selected and the search result
-- already displays: stable id, version, title, description, publication state
-- and updated-at. No other column of any table.
--
-- ## Performance
--
-- A sequential scan of the published rows of one source, matching two short
-- text columns. Curriculum nodes number in the hundreds at most; mission steps,
-- which number in the thousands, keep their own stored searchable text
-- (`20261011000100`). No index is added: `strpos` is served by none.
--
-- ## Scope
--
-- One read-only function and its EXECUTE grant. No table, column, index,
-- policy or RLS change; no grant is widened. `authenticated` alone may execute
-- it; `anon` and the curriculum writer may not.

create or replace function public.search_published_curriculum_records(
    p_source text,
    p_phrases text[],
    p_acronyms text[],
    p_after text default null,
    p_page_size integer default 50
)
returns table (
    stable_id text,
    version integer,
    title text,
    description text,
    publication_state text,
    updated_at timestamptz
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
    records as (
        select lp.stable_id as record_id, lp.version as record_version,
               lp.title as record_title, lp.description as record_description,
               lp.publication_state as record_state, lp.updated_at as record_updated_at
        from public.learning_paths as lp
        where p_source = 'learning_paths' and lp.publication_state = 'published'

        union all

        select c.stable_id, c.version, c.title, c.description,
               c.publication_state, c.updated_at
        from public.courses as c
        where p_source = 'courses' and c.publication_state = 'published'

        union all

        select m.stable_id, m.version, m.title, m.description,
               m.publication_state, m.updated_at
        from public.missions as m
        where p_source = 'missions' and m.publication_state = 'published'

        union all

        select k.stable_id, k.version, k.title, k.description,
               k.publication_state, k.updated_at
        from public.competencies as k
        where p_source = 'competencies' and k.publication_state = 'published'
    ),
    matched as (
        select distinct on (r.record_id) r.*
        from records as r
        where (p_after is null or r.record_id > p_after)
          and (
                exists (
                    select 1 from needles as n
                    where strpos(lower(r.record_title), n.needle) > 0
                       or strpos(lower(coalesce(r.record_description, '')), n.needle) > 0
                )
             or exists (
                    select 1 from words as w
                    where r.record_title ~* w.pattern
                       or coalesce(r.record_description, '') ~* w.pattern
                )
          )
        order by r.record_id, r.record_version desc
    )
    select mt.record_id, mt.record_version, mt.record_title, mt.record_description,
           mt.record_state, mt.record_updated_at
    from matched as mt
    order by mt.record_id
    limit least(greatest(coalesce(p_page_size, 50), 1), 100)
$$;

-- PostgreSQL grants EXECUTE on a new function to PUBLIC, which includes anon.
-- Search is an authenticated learner surface only.
revoke all on function public.search_published_curriculum_records(text, text[], text[], text, integer) from public, anon;
grant execute on function public.search_published_curriculum_records(text, text[], text[], text, integer) to authenticated;

insert into public.platform_schema_version (component, version)
values ('curriculum-record-search', '0.1.0')
on conflict (component, version) do nothing;
