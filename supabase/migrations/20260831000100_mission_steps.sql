-- Technical Learning Platform
-- WP-C / CURR-010 / DEC-054: ordered instructional content beneath a Mission.
--
-- ## What this adds
--
-- `missions.description` is the only instructional text the schema has ever
-- had: one untyped column carrying an entire lesson. It cannot hold a diagram,
-- an interaction, a learner prediction, a command and its output, a placed
-- practice check, or a reference — and it cannot express ORDER between them.
--
-- The consequence is the failure mode BEGINNER-COMPLETE-1 exists to prevent: a
-- mission can only be DESCRIBED in prose, which produces the textbook wall the
-- approved instructional model prohibits, while the platform has no structure
-- with which to detect it.
--
-- `mission_steps` is that structure: an ordered, typed sequence per mission.
--
-- ## A step is CONTENT, not a curriculum node
--
-- This is the load-bearing decision, and the table's shape is what enforces it:
--
--   no publication_state   a step is readable when its owning MISSION is
--                          published, by the RLS policy below and by no other
--                          rule. `curriculum_publish_learning_path_tree()`
--                          therefore needs no change: it publishes the five
--                          node tables, and steps inherit that.
--   no version             a step belongs to `missions(stable_id, version)`.
--                          Re-versioning a mission carries its steps forward.
--                          `curriculum_version_lineage` stays node-level.
--   no competency_id       `mission_competencies` remains the sole join, so no
--                          step can contribute to a competency claim.
--   no evidence column     evidence comes from the deterministic lab validator
--                          and from evidence-producing assessments. A step
--                          confers nothing.
--   no required flag       a step has no mechanism by which to become a
--                          prerequisite. `learning_prerequisite_rules` remains
--                          the sole prerequisite authority.
--   no progress column     `student_learning_progress.node_type` is unchanged
--                          and still stops at 'mission'. Steps sit BELOW the
--                          progress grain, which is precisely why a Lesson node
--                          was evaluated and rejected (DEC-054): that would
--                          have reopened the completed Wave 3 Learning Engine
--                          to gain what steps provide without touching it.
--
-- ## Shape precedent
--
-- `student_note_blocks` (Wave 5) is the proven ordered-typed-block table in this
-- repository: closed enum type, integer position with a uniqueness constraint,
-- bounded text, jsonb metadata. Its SHAPE is mirrored deliberately.
--
-- Its TABLE is not shared. That one is Knowledge Engine property scoped to a
-- learner's private notes; putting published curriculum in it would violate
-- one-concept-one-owner and place private and published content under a single
-- RLS policy set.
--
-- ## Why the payload is jsonb, and why that is not an escape hatch
--
-- Seven step types carry seven different shapes. Seven nullable column groups
-- in one table would be unreadable and would still not stop an invalid
-- combination.
--
-- The database enforces what a database should: the type is drawn from a closed
-- vocabulary, the payload is a json OBJECT, ordering is unique, identity is
-- unique within the mission. The shape of each payload is enforced by the
-- discriminated union in `packages/shared-types/src/mission-steps.ts`, which
-- runs at authoring, at publication validation, and at read.
--
-- Reproducing that union in SQL is deliberately NOT attempted: it would be a
-- second definition of the same contract, and two definitions drift. The
-- repository already makes this distinction elsewhere — `assessment_questions`
-- constrains `question_type` in SQL and validates option shape in TypeScript.
--
-- ## Content safety
--
-- Authored content is inert data. Nothing here renders markup, nothing here is
-- executable, and a `command` step is a DISPLAY artefact — the platform never
-- runs it.
--
-- No CHECK pattern-matches against markup-like or script-like strings, and none
-- may be added. The platform has to be able to teach HTML, JavaScript, shell
-- syntax and security examples; a constraint rejecting `<script>` in prose
-- would make it unable to teach its own subject matter. Safety comes from
-- inertness and from renderer escaping, never from keyword matching.

create table if not exists public.mission_steps (
    id uuid primary key default gen_random_uuid(),
    mission_id uuid not null references public.missions(id) on delete cascade,
    stable_id text not null,
    position integer not null check (position >= 0),
    step_type text not null
        check (step_type in (
            'concept',
            'diagram',
            'command',
            'prediction',
            'interaction',
            'practice',
            'reference'
        )),
    -- The typed payload. Constrained to a json OBJECT so a bare scalar or array
    -- cannot be stored; its per-type shape belongs to the shared discriminated
    -- union, which is the single definition of that contract.
    payload jsonb not null default '{}'::jsonb
        check (jsonb_typeof(payload) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Identity is MISSION-SCOPED, not global. A step id is referenceable for
    -- deep-linking, AI context addressing and content migration; it is not a
    -- curriculum node id and never appears in publication events, version
    -- lineage, prerequisite rules or learner progress. Two different missions
    -- may each have a step called `s01-what-a-network-is`.
    unique (mission_id, stable_id),
    -- Deterministic authored ordering. Never insertion order, never a
    -- timestamp, never uuid order. This mirrors `unique (note_id, position)` on
    -- student_note_blocks and `unique (module_id, position)` on missions.
    unique (mission_id, position)
);

create index if not exists idx_mission_steps_mission_position
    on public.mission_steps (mission_id, position);

alter table public.mission_steps enable row level security;

-- Published-only learner visibility, gated on the OWNING MISSION.
--
-- Byte-for-byte the pattern `curriculum_assets` already uses. It is what makes
-- publication inherited: a step becomes readable exactly when its mission does,
-- with no second publication state to keep in sync and no change to the
-- publication cascade.
create policy "authenticated users can read published mission steps"
on public.mission_steps
for select
to authenticated
using (
    exists (
        select 1
        from public.missions m
        where m.id = mission_id
          and m.publication_state = 'published'
    )
);

-- No insert, update or delete policy for `authenticated`, deliberately.
-- Curriculum authoring is server-authorized and runs through the existing
-- Founder-guarded `curriculum-admin` operations, exactly as every other
-- curriculum table does. Learners read published content and write nothing.

-- Base privileges. RLS narrows rows; a grant is still required for the policy
-- to be reachable, and `verify-db-rls.sh` asserts the two agree in both
-- directions.
grant select on public.mission_steps to authenticated;

-- The authoring path: read to find what exists, insert to create, update so the
-- writer's upsert is idempotent on re-publication. This is the same verb set
-- `mission_competencies` holds, and for the same reasons.
--
-- No delete, matching every other curriculum table.
grant select, insert, update on public.mission_steps to service_role;

insert into public.platform_schema_version (component, version)
values ('mission-steps', '0.1.0')
on conflict (component, version) do nothing;
