-- Technical Learning Platform
-- LEARN-PROGRESS-DB-1: repair the learner mission-progress write path.
--
-- ## The failure
--
-- A real learner clicked "Mark as started" on a published mission. The API
-- returned HTTP 409 and the database reported:
--
--     column reference "node_type" is ambiguous
--
-- ## Why PostgreSQL considered it ambiguous
--
-- `record_mission_progress` is declared `RETURNS TABLE (node_type text, ...)`.
-- In PL/pgSQL a `RETURNS TABLE` column list is not merely a result shape: each
-- name becomes an **OUT parameter**, and OUT parameters are ordinary PL/pgSQL
-- variables visible throughout the function body. So `node_type`,
-- `node_stable_id`, `curriculum_version`, `state`, `started_at`, `completed_at`
-- and `last_activity_at` were all variables — with exactly the names of the
-- columns the function writes to.
--
-- Inside the upsert, one clause referenced those names without qualification:
--
--     on conflict (user_id, node_type, node_stable_id)
--
-- The `ON CONFLICT` **index-inference** clause is parsed as a list of index
-- elements, which are expressions, so PL/pgSQL applies variable substitution to
-- it. `node_type` therefore matched both the OUT-parameter variable and
-- `student_learning_progress.node_type`. The default `plpgsql.variable_conflict`
-- setting is `error`, so PostgreSQL refused rather than guessing. `user_id` was
-- fine (the variable is `actor_user_id`); `node_stable_id` was equally ambiguous
-- and would have been reported next.
--
-- The INSERT's own target column list — `insert into ... (user_id, node_type,
-- ...)` — was never the problem. A target column list is column names by
-- grammar and is not an expression context, so no substitution happens there.
-- Only the inference clause was affected.
--
-- ## Why this survived every gate
--
-- PL/pgSQL plans each SQL statement lazily, on first execution. Every statement
-- before the upsert qualifies its columns (`p.node_type`, `m.stable_id`), so the
-- function ran fine right up to the first write. The suite mocks Supabase
-- entirely, so no test ever planned this statement. It could only fail the first
-- time a real learner pressed the button — which is exactly when it did.
--
-- ## Blast radius
--
-- `record_mission_progress` is the ONLY function in the schema declared
-- `RETURNS TABLE`; every other function returns `trigger`, `void` or a scalar
-- and takes `target_`-prefixed parameters that collide with nothing. So the
-- defect is confined to this function — but within it, to BOTH actions, because
-- `start` and `complete` share the same upsert. Mission start and mission
-- completion were both broken.
--
-- The read paths are unaffected and were never at risk: progress, resume and
-- next-action are plain SELECTs through the user-scoped client and do not call
-- this function. Real UAT confirms all three return 200.
--
-- ## The repair
--
-- 1. `#variable_conflict use_column` — the documented PL/pgSQL remedy. Where a
--    name could mean either, the column wins.
--
--    This is safe here by inspection, not by hope. Every variable this function
--    actually READS inside a SQL statement — `actor_user_id`,
--    `target_mission_stable_id`, `target_mission_version`, `existing_state`,
--    `next_state`, `now_at` — has a name that is not a column of any table in
--    that statement's scope, so the directive cannot capture one. The only
--    colliding names are the OUT parameters, which are never read in SQL; they
--    are assigned implicitly by RETURN QUERY.
--
--    The alternative was renaming the OUT parameters. That was rejected: OUT
--    parameter names ARE the result column names, PostgREST returns them
--    verbatim, and `mapProgressRow` in `services/api/src/learning-progress.ts`
--    reads `node_type`, `node_stable_id`, `curriculum_version`, `state`,
--    `started_at`, `completed_at`, `last_activity_at` by those exact keys.
--    Renaming would have turned a database defect into an API break.
--
-- 2. The upsert target is now aliased `as slp`, and the DO UPDATE clause
--    references `slp.` instead of `public.student_learning_progress.`.
--
--    This is defensive, not a second proven defect. The alias form is the
--    documented way to read the existing row in DO UPDATE, and it removes a
--    schema-qualified reference whose validity could not be confirmed without a
--    live database — the original statement never got far enough to find out,
--    because analysis failed on the inference clause first. Behaviour is
--    identical; the uncertainty is not.
--
-- ## What is deliberately unchanged
--
-- Same signature, so the RPC contract and every caller are untouched. Same
-- `RETURNS TABLE` column names, so the API mapper is untouched. Still
-- `security definer` with `set search_path = public`. The learner is still
-- resolved from `auth.uid()` and from nothing else — no caller can name another
-- learner, because no parameter carries an identity.
--
-- No table privilege is granted or widened. `student_learning_progress` still
-- carries only a SELECT policy for `authenticated`, and DB-RLS-1 still grants
-- only `select`. Learners mutate progress through this SECURITY DEFINER function
-- or not at all; that is the architecture and this migration preserves it.
--
-- No policy is created, altered or dropped. No table, column or row is touched.

create or replace function public.record_mission_progress(
    target_mission_stable_id text,
    target_action text
)
returns table (
    node_type text,
    node_stable_id text,
    curriculum_version integer,
    state text,
    started_at timestamptz,
    completed_at timestamptz,
    last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
    actor_user_id uuid;
    target_mission_version integer;
    existing_state text;
    next_state text;
    now_at timestamptz := now();
begin
    -- The learner is the authenticated caller. There is no parameter through
    -- which a different identity could be supplied.
    actor_user_id := auth.uid();

    if actor_user_id is null then
        raise exception 'Authentication required';
    end if;

    select m.version
    into target_mission_version
    from public.missions m
    where m.stable_id = target_mission_stable_id
      and m.publication_state = 'published'
    order by m.version desc
    limit 1;

    if target_mission_version is null then
        raise exception 'Published mission not found';
    end if;

    select p.state
    into existing_state
    from public.student_learning_progress p
    where p.user_id = actor_user_id
      and p.node_type = 'mission'
      and p.node_stable_id = target_mission_stable_id
    for update;

    if target_action = 'start' then
        if existing_state in ('completed', 'competency_demonstrated') then
            next_state := existing_state;
        else
            next_state := 'in_progress';
        end if;
    elsif target_action = 'complete' then
        next_state := 'completed';
    else
        raise exception 'Unsupported mission progress action';
    end if;

    insert into public.student_learning_progress as slp (
        user_id,
        node_type,
        node_stable_id,
        curriculum_version,
        state,
        started_at,
        completed_at,
        last_activity_at
    )
    values (
        actor_user_id,
        'mission',
        target_mission_stable_id,
        target_mission_version,
        next_state,
        now_at,
        case
            when next_state in ('completed', 'competency_demonstrated')
                then now_at
            else null
        end,
        now_at
    )
    -- The clause that failed. `#variable_conflict use_column` above is what
    -- makes these three names resolve to columns rather than to the identically
    -- named OUT parameters.
    on conflict (user_id, node_type, node_stable_id)
    do update set
        curriculum_version = excluded.curriculum_version,
        state = excluded.state,
        -- The first start wins: an existing started_at is never overwritten.
        started_at = coalesce(slp.started_at, excluded.started_at),
        completed_at = case
            when excluded.state in ('completed', 'competency_demonstrated')
                then coalesce(slp.completed_at, excluded.completed_at)
            else slp.completed_at
        end,
        last_activity_at = excluded.last_activity_at,
        updated_at = now_at;

    if existing_state is distinct from next_state then
        insert into public.student_learning_progress_events (
            user_id,
            node_type,
            node_stable_id,
            curriculum_version,
            previous_state,
            new_state,
            occurred_at
        )
        values (
            actor_user_id,
            'mission',
            target_mission_stable_id,
            target_mission_version,
            existing_state,
            next_state,
            now_at
        );
    end if;

    return query
    select
        p.node_type,
        p.node_stable_id,
        p.curriculum_version,
        p.state,
        p.started_at,
        p.completed_at,
        p.last_activity_at
    from public.student_learning_progress p
    where p.user_id = actor_user_id
      and p.node_type = 'mission'
      and p.node_stable_id = target_mission_stable_id;
end;
$$;

-- ------------------------------------------------------------------
-- Execute privileges
-- ------------------------------------------------------------------
-- `create or replace function` preserves the existing ACL, so these are
-- re-asserted rather than required. They are stated anyway so the contract is
-- readable in one place and cannot drift if the function is ever dropped and
-- recreated. This is exactly the privilege set `20260811000700` established:
-- nothing is broadened.

revoke all on function public.record_mission_progress(text, text)
from public, anon;

grant execute on function public.record_mission_progress(text, text)
to authenticated;

insert into public.platform_schema_version (component, version)
values ('record-mission-progress-ambiguity-fix', '0.1.0')
on conflict (component, version) do nothing;
