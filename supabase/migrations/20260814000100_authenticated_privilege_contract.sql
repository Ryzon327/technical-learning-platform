-- Technical Learning Platform
-- DB-RLS-1: the explicit authenticated database privilege contract.
--
-- ## Why this migration exists
--
-- PostgreSQL authorizes a statement in two layers. The base table privilege
-- decides whether a role may ATTEMPT an operation; the row-level security
-- policy decides which ROWS that operation may touch. Both are required, and
-- neither implies the other.
--
-- The first 36 migrations enabled RLS on all 61 tables and wrote 65 policies,
-- and granted `authenticated` no table privilege at all. A real learner
-- therefore authenticated successfully and then received
--
--     HTTP 403   proxy-status: PostgREST; error=42501
--
-- on the very first read of their own profile. PostgreSQL rejected the
-- statement at the privilege layer, before any policy was consulted. The
-- policies were correct throughout and were simply never reached, which means
-- RLS has never actually been exercised on this project.
--
-- The mistake was easy to make and hard to see: `create policy ... TO
-- authenticated` reads like a grant. It is not one.
--
-- ## What this migration does, and what it deliberately does not
--
-- For every table carrying an `authenticated` policy, it grants exactly the
-- verbs those policies authorize — nothing inferred, nothing rounded up. The
-- contract is therefore: granted verbs are a subset of policy verbs, and a
-- table with no `authenticated` policy receives nothing.
--
-- It does NOT use `grant ... on all tables in schema public`, and it does NOT
-- use `alter default privileges`. Both would be shorter to write and both are
-- wrong here. Thirteen tables in this schema enable RLS and deliberately define
-- no policy at all — they are server-only by construction. RLS alone would
-- still return zero rows for them, but the absent grant is a second,
-- independent barrier, and a blanket grant would make one accidental future
-- policy sufficient to expose them. `alter default privileges` would silently
-- grant on every table added from here on, which is the same failure in
-- reverse: a privilege nobody decided to give.
--
-- No policy is created, altered or dropped. No table, column, function or row
-- is touched. This migration changes privileges and nothing else.
--
-- `scripts/verify-db-rls.sh` parses the policies out of these migrations and
-- fails if this grant set and those policies ever disagree in either direction,
-- so a future policy without a grant — or a grant without a policy — cannot
-- reach main.

-- ------------------------------------------------------------------
-- Schema access
-- ------------------------------------------------------------------
-- Without USAGE on the schema every table grant below is inert and the 42501
-- returns unchanged.

grant usage on schema public to authenticated;

-- ------------------------------------------------------------------
-- Wave 1 — Authentication
-- ------------------------------------------------------------------
-- SELECT and UPDATE only. The UPDATE policy's `with check` pins `role` to its
-- current value, so a learner still cannot promote themselves to founder_admin;
-- this grant permits the statement, and that policy continues to constrain it.
-- No INSERT: profile rows are created by the `on_auth_user_created` trigger.
-- No DELETE: removal cascades from auth.users.

grant select, update on public.user_profiles to authenticated;

-- ------------------------------------------------------------------
-- Wave 2 — Curriculum
-- ------------------------------------------------------------------
-- Read-only throughout. The policies restrict every one of these to
-- publication_state = 'published', so an unpublished course stays invisible.

grant select on public.learning_paths           to authenticated;
grant select on public.courses                  to authenticated;
grant select on public.learning_modules         to authenticated;
grant select on public.missions                 to authenticated;
grant select on public.competencies             to authenticated;
grant select on public.competency_prerequisites to authenticated;
grant select on public.mission_competencies     to authenticated;
grant select on public.curriculum_assets        to authenticated;

-- ------------------------------------------------------------------
-- Wave 3 — Learning Engine
-- ------------------------------------------------------------------
-- Read-only. Progress is WRITTEN exclusively through
-- public.record_mission_progress(text, text), a security-definer function whose
-- EXECUTE was already granted in 20260811000700. No INSERT or UPDATE is granted
-- here: introducing one to make the model look symmetrical would create a
-- second, unaudited write path to learner progress.

grant select on public.student_learning_progress         to authenticated;
grant select on public.student_learning_progress_events  to authenticated;
grant select on public.learning_prerequisite_rules       to authenticated;
grant select on public.learning_requirement_satisfactions to authenticated;
grant select on public.student_competency_state          to authenticated;
grant select on public.student_competency_evidence_refs  to authenticated;
grant select on public.student_competency_state_events   to authenticated;
grant select on public.student_review_state              to authenticated;
grant select on public.student_learning_history          to authenticated;

-- ------------------------------------------------------------------
-- Wave 4 — Assessment
-- ------------------------------------------------------------------
-- Read-only. public.assessment_questions is deliberately absent: it carries no
-- authenticated policy, so question content is served by the API rather than
-- read directly by the browser. That is an existing design decision and this
-- migration preserves it.

grant select on public.assessment_definitions         to authenticated;
grant select on public.assessment_attempts            to authenticated;
grant select on public.assessment_attempt_answers     to authenticated;
grant select on public.assessment_readiness_outcomes  to authenticated;
grant select on public.assessment_evidence_handoffs   to authenticated;

-- ------------------------------------------------------------------
-- Wave 5 — Knowledge and Notes
-- ------------------------------------------------------------------
-- The only genuinely learner-writable surface in the platform. Every verb here
-- is matched by an existing owner-scoped policy.

grant select, insert, update, delete on public.student_notes              to authenticated;
grant select, insert, delete         on public.student_note_contexts      to authenticated;
grant select, insert, update, delete on public.student_note_blocks        to authenticated;
grant select, insert, update, delete on public.student_note_tags          to authenticated;
grant select, insert, delete         on public.student_note_tag_assignments to authenticated;
grant select, insert, delete         on public.student_bookmarks          to authenticated;

-- ------------------------------------------------------------------
-- Wave 6 — Lab Engine
-- ------------------------------------------------------------------
-- Read-only apart from requesting a session, which has an INSERT policy.
-- public.lab_session_provider_references is deliberately absent: provider
-- identifiers are server-only.

grant select         on public.lab_definitions           to authenticated;
grant select, insert on public.lab_sessions              to authenticated;
grant select         on public.lab_session_runtime_state to authenticated;
grant select         on public.lab_validation_checks     to authenticated;
grant select         on public.lab_validation_runs       to authenticated;
grant select         on public.lab_validation_results    to authenticated;
grant select         on public.lab_operations            to authenticated;

-- ------------------------------------------------------------------
-- Wave 7 — Evidence Engine
-- ------------------------------------------------------------------
-- Read-only. Evidence creation is server-authoritative; no student write policy
-- exists anywhere in Wave 7 and none is granted.

grant select on public.evidence_records                 to authenticated;
grant select on public.evidence_competency_links        to authenticated;
grant select on public.evidence_correction_events       to authenticated;
grant select on public.evidence_verification_references to authenticated;

-- ------------------------------------------------------------------
-- Wave 8 — Certificate Engine
-- ------------------------------------------------------------------
-- Read-only. Issuance and lifecycle transitions run through privileged RPCs
-- whose EXECUTE remains revoked from every client role.

grant select on public.certificate_definitions                    to authenticated;
grant select on public.certificate_definition_competencies        to authenticated;
grant select on public.certificate_definition_evidence_policies   to authenticated;
grant select on public.certificates                               to authenticated;
grant select on public.certificate_competency_snapshots           to authenticated;
grant select on public.certificate_evidence_snapshots             to authenticated;
grant select on public.certificate_lifecycle_events               to authenticated;
grant select on public.certificate_correction_events              to authenticated;

-- ------------------------------------------------------------------
-- Deliberately granted nothing
-- ------------------------------------------------------------------
-- These thirteen tables enable RLS and define no authenticated policy. They are
-- server-only, and the absence of a grant is the second barrier that keeps them
-- that way:
--
--   assessment_competency_mappings      assessment_evidence_consumptions
--   assessment_questions                curriculum_publication_events
--   curriculum_version_lineage          lab_automation_cycles
--   lab_evidence_consumptions           lab_evidence_handoffs
--   lab_provider_canary_runs            lab_provider_operational_snapshots
--   lab_provider_registry               lab_session_provider_references
--   platform_schema_version
--
-- `anon` receives nothing at all. Public certificate verification reaches the
-- database through the service-role client, so no anonymous data contract
-- exists and none is invented here.

insert into public.platform_schema_version (component, version)
values ('authenticated-privilege-contract', '0.1.0')
on conflict (component, version) do nothing;
