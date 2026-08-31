-- Technical Learning Platform
-- WP-G: the privileges the curriculum-as-data import path requires.
--
-- ## Why this migration exists
--
-- DB-SERVICE-ROLE-1 (`20260828000100`) established the service-role privilege
-- contract and stated the rule this file obeys:
--
--     "A verb no reachable code issues is not granted, even where granting it
--      would be harmless-looking and convenient."
--
-- It then withheld UPDATE on `courses`, `learning_modules`, `missions` and
-- `competencies` for exactly that reason, recording it explicitly:
--
--     "No approved route or command issues a direct UPDATE against them, so
--      granting one would privilege a statement that does not exist."
--
-- WP-G introduces those statements. It is therefore the package that grants the
-- verbs, which is the pattern DB-SERVICE-ROLE-1 prescribed for exactly this
-- situation and which WP-D already followed for `curriculum_assets`:
--
--     "When a reachable caller is approved, that package grants the verb it
--      needs."
--
-- ## Why a grant is the whole security boundary here
--
-- `service_role` has `bypassrls`, so no policy will ever filter a row for it.
-- PostgreSQL authorizes at the privilege layer first and independently, which is
-- why the ROAS publication command failed on its FIRST query before
-- DB-SERVICE-ROLE-1 existed. For this role the GRANT is not half of a decision;
-- it is the entire decision. Every verb below is therefore justified by a
-- specific line of approved application code, named in the comment above it.
--
-- ## What this does NOT do
--
-- No DELETE anywhere. No blanket grant, no `grant ... on all tables`, no
-- `alter default privileges`. No privilege on any learner-state table:
-- `student_learning_progress`, `assessment_attempts`, `evidence_*` and
-- `student_competency_state` are untouched and unreachable from the code this
-- migration privileges. Learner progress is written only by
-- `record_mission_progress`, which resolves the learner from `auth.uid()` and
-- therefore cannot be driven by any service-role caller.
--
-- No new table, no new column, no policy change, no schema change of any kind.
-- This file contains grants and one version row.

-- ------------------------------------------------------------------
-- Draft revision of curriculum nodes
-- ------------------------------------------------------------------
-- UPDATE on the four node tables that previously had none.
--
--   curriculum-admin.ts  updateDraftCurriculumNode — revising a node whose
--                        authored content changed while it is still a draft.
--
-- This is what makes an authored curriculum document re-importable. Before it,
-- reconciliation could only create or skip: editing a course in the repository
-- and re-running the importer reported "reuse" and changed nothing, which makes
-- a data pipeline a one-shot.
--
-- The statement is guarded in two independent places. The application issues
--
--     update ... where id = $1 and publication_state = 'draft'
--
-- so the publication state is part of the WHERE clause rather than a condition
-- checked earlier against a row that could since have changed. A published node
-- matches no row, the operation reports CONFLICT, and nothing is written.
--
-- UPDATE is granted; DELETE is not. The approved surface revises a draft or
-- refuses. Nothing removes curriculum.
--
-- `learning_paths` already holds UPDATE from DB-SERVICE-ROLE-1 and is not
-- repeated here.

grant update on public.courses          to service_role;
grant update on public.learning_modules to service_role;
grant update on public.missions         to service_role;
grant update on public.competencies     to service_role;

-- ------------------------------------------------------------------
-- Explicit learning prerequisite rules
-- ------------------------------------------------------------------
-- `learning_prerequisite_rules` has been READ by learning-navigation.ts since
-- Wave 3 and written by nothing. It held no service_role privilege at all --
-- not even SELECT -- because no approved code path wrote it.
--
-- BEGINNER-COMPLETE-1 permits required knowledge to be established by an
-- explicitly declared prerequisite. That is unauthorable while the table has no
-- writer, so WP-G adds the smallest one and this grants what it issues:
--
--   SELECT  curriculum-reconciliation reads existing rules so the plan is
--           complete, and so a dry run reports create-versus-reuse honestly
--           rather than guessing.
--   INSERT  upsertPrerequisiteRule — the new-rule half of the upsert.
--   UPDATE  upsertPrerequisiteRule — PostgREST issues INSERT ... ON CONFLICT
--           DO UPDATE against the table's existing unique key
--           (target_node_type, target_stable_id, requirement_type,
--           requirement_stable_id). The UPDATE half is what makes re-running an
--           import idempotent rather than a duplicate-key failure. This mirrors
--           `mission_competencies`, granted the same three verbs by
--           DB-SERVICE-ROLE-1 for the same upsert reason.
--
-- No DELETE. A rule is added or revised; the approved surface removes none.
-- Deactivating a rule is an UPDATE of `active`, which the granted verb already
-- covers and which preserves the row as history.
--
-- This does not create a second prerequisite system. DEC-055 keeps two
-- questions with two owners, and both keep their owner:
--
--   mission_competencies.relationship  what a mission DOES with a competency
--   learning_prerequisite_rules        what must be true BEFORE a node
--
-- Nothing here evaluates a prerequisite. `learning-navigation.ts` remains the
-- sole evaluator, reading as the learner, and it is unchanged.

grant select, insert, update on public.learning_prerequisite_rules to service_role;

-- ------------------------------------------------------------------
-- Deliberately NOT granted
-- ------------------------------------------------------------------
-- DELETE on any table above.
-- Any privilege on assessment_definitions or assessment_questions: assessment
--   authoring is deferred, so no reachable code writes them. `assessment_questions`
--   in particular has no authenticated SELECT policy precisely so answer keys
--   cannot be read, and WP-G adds no route around that.
-- Any privilege on a learner-state table.
-- Any privilege for `anon` or `authenticated`. DB-RLS-1 owns those contracts and
--   this migration does not touch them: a learner reads published curriculum and
--   writes none of it.

insert into public.platform_schema_version (component, version)
values ('curriculum-authoring-privileges', '0.1.0')
on conflict (component, version) do nothing;
