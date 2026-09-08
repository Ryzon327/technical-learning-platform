-- Technical Learning Platform
-- MISSION-STEP-VOCAB-1: the database step_type vocabulary rejoins the approved
-- one.
--
-- ## The defect this repairs
--
-- DEC-054 closed the mission step vocabulary at seven types.
-- `20260831000100_mission_steps.sql` wrote those seven into an inline CHECK on
-- `mission_steps.step_type`.
--
-- DEC-054 was later AMENDED to close the vocabulary at eight, adding
-- `near_transfer`. `packages/shared-types/src/mission-steps.ts` was extended,
-- the parser was extended, the renderer was extended, and two near-transfer
-- steps were authored into `content/curriculum/networking-foundations.json`.
--
-- No migration was ever written. The database kept the seven.
--
-- ## How it surfaced
--
-- The first Founder publication of the Networking Foundations course wrote the
-- learning path, the course, all four modules, all eight missions, and then
-- Mission 1's steps at positions 0 to 5. It stopped at position 6:
--
--     mission  nf-m1-what-a-network-is
--     step     m1-s7-try-a-different-network
--     type     near_transfer
--
-- `validateMissionStep` accepted the step, because TypeScript holds the amended
-- eight-value vocabulary. The INSERT then violated this table's CHECK. Nothing
-- was published; the partial tree remains draft.
--
-- This is the shape of drift `20260831000100` predicted in prose and did not
-- prevent:
--
--     "Reproducing that union in SQL is deliberately NOT attempted: it would be
--      a second definition of the same contract, and two definitions drift."
--
-- The `step_type` list is the one part that IS duplicated in SQL, deliberately,
-- and it is the part that drifted. `services/api/src/mission-step-vocabulary.test.ts`
-- now derives this constraint's vocabulary from the migration sources and fails
-- if it stops matching `MISSION_STEP_TYPES`, so the duplication is checked
-- rather than merely intended.
--
-- ## Why this is a new file
--
-- `20260831000100` has been applied to the development/UAT project. Supabase
-- records its checksum, and `scripts/migration-baseline.sha256` freezes it.
-- Editing an applied migration desynchronises the repository from every
-- environment that has already migrated. The only forward move is a new one.
--
-- ## Scope
--
-- One constraint. No table, no column, no index, no policy, no RLS change, no
-- grant change, no data change. `unique (mission_id, stable_id)`,
-- `unique (mission_id, position)`, `check (position >= 0)`, the payload
-- object check, the published-mission read policy and both grants are all
-- untouched.
--
-- No existing row can be invalidated: the vocabulary only widens, and every
-- value accepted before is accepted after.

-- Dropping and re-adding is the only way to widen an inline CHECK. This is the
-- pattern 20260830000100 established and 20260901000100 reused, including for a
-- constraint that was likewise created inline and therefore carries
-- PostgreSQL's generated `<table>_<column>_check` name.
alter table public.mission_steps
    drop constraint if exists mission_steps_step_type_check;

alter table public.mission_steps
    add constraint mission_steps_step_type_check
    check (step_type in (
        'concept',
        'diagram',
        'command',
        'prediction',
        'interaction',
        'practice',
        'near_transfer',
        'reference'
    ));

-- Fail loudly rather than silently.
--
-- `drop constraint if exists` is a no-op when the name does not match. If the
-- generated name were ever something other than `mission_steps_step_type_check`,
-- the drop above would quietly do nothing, the add would succeed, and the table
-- would carry TWO check constraints on step_type -- the old seven-value one
-- still rejecting near_transfer. Publication would fail again in exactly the
-- same way, having cost another Founder migration run to discover.
--
-- The invariant is therefore asserted here, inside the transaction that
-- establishes it.
do $$
declare
    step_type_checks integer;
    admitting_checks integer;
begin
    select count(*) into step_type_checks
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'mission_steps'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%step_type%';

    if step_type_checks <> 1 then
        raise exception
            'mission_steps carries % check constraints on step_type, expected exactly 1; the drop did not match the constraint actually present',
            step_type_checks;
    end if;

    select count(*) into admitting_checks
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'mission_steps'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%near_transfer%';

    if admitting_checks <> 1 then
        raise exception
            'the mission_steps step_type vocabulary still does not admit near_transfer';
    end if;
end
$$;

comment on column public.mission_steps.step_type is
    'DEC-054 as amended. The closed eight-value mission step vocabulary: concept, diagram, command, prediction, interaction, practice, near_transfer, reference. This list is a deliberate duplicate of MISSION_STEP_TYPES in packages/shared-types/src/mission-steps.ts; services/api/src/mission-step-vocabulary.test.ts derives it from the migration sources and fails if the two diverge.';

insert into public.platform_schema_version (component, version)
values ('mission-step-near-transfer', '0.1.0')
on conflict (component, version) do nothing;
