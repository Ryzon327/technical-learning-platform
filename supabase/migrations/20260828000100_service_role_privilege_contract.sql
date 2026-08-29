-- Technical Learning Platform
-- DB-SERVICE-ROLE-1: the explicit service-role curriculum-authoring contract.
--
-- ## Why this migration exists
--
-- DB-RLS-1 established the `authenticated` privilege contract after a real
-- learner received `HTTP 403 / error=42501` on the first read of their own
-- profile: the first 36 migrations enabled RLS on 61 tables and wrote 65
-- policies, and granted `authenticated` no table privilege at all.
--
-- The same omission applies to `service_role`, and nothing in the first 37
-- migrations mentions that role. It surfaced during real Founder UAT when
-- `npm run admin:publish-roas-curriculum` failed on its FIRST database
-- operation:
--
--     Unable to inspect existing learning_paths "connected-learning-mvp".
--
-- `service_role` bypasses **row-level security**. It does not bypass
-- **GRANTs**. PostgreSQL authorizes a statement at the privilege layer first
-- and independently, so the publication command was rejected before any policy
-- — or the absence of one — was ever consulted. This was the first service-role
-- PostgREST query the project has ever run: migrations are applied over a
-- direct Postgres connection, and the browser RLS proof ran as `authenticated`.
--
-- ## The security model, and why this file is deliberately small
--
-- For `authenticated`, a GRANT is only half of an authorization decision: the
-- RLS policy still decides which rows the statement may touch. DB-RLS-1 could
-- therefore derive the grant set FROM the policies and check the two agree.
--
-- **That reasoning does not transfer.** `service_role` has the `bypassrls`
-- attribute, so no policy will ever filter a row for it. There is no second
-- barrier and no policy to derive anything from:
--
--     the GRANT itself is the entire security boundary.
--
-- Every verb below is therefore justified by a specific line of approved
-- application code, not by what a table "is for" and not by what a helper
-- function could theoretically do. A verb no reachable code issues is not
-- granted, even where granting it would be harmless-looking and convenient.
--
-- ## Scope
--
-- The curriculum-authoring and publication surface only — `curriculum-admin.ts`
-- and `curriculum-quality.ts`, which own these nine tables and are what the
-- Founder publication command drives.
--
-- Every OTHER service-role surface in `services/api/src` (evidence,
-- certificates, labs, assessments, notes, search) is equally unprivileged and
-- is deliberately NOT granted here. Those are separate contracts requiring
-- their own derivation and their own review. Widening this migration to cover
-- them would be the blanket grant this project has twice refused to write.
--
-- ## What this migration must never become
--
-- No `grant ... on all tables in schema public`. No `alter default privileges`.
-- Both would silently privilege tables nobody decided to privilege, on a role
-- for which a grant is the only thing standing between an accident and the
-- whole schema. `scripts/verify-db-service-role.sh` fails if either appears.
--
-- No policy is created, altered or dropped. No `anon` or `authenticated`
-- privilege is added, widened or removed. No table, column or row is touched.
-- This migration changes `service_role` privileges and nothing else.

-- ------------------------------------------------------------------
-- Schema access
-- ------------------------------------------------------------------
-- Without USAGE on the schema every grant below is inert and the 42501 returns
-- unchanged. This is the same trap DB-RLS-1 documented for `authenticated`.

grant usage on schema public to service_role;

-- ------------------------------------------------------------------
-- Curriculum node tables
-- ------------------------------------------------------------------
-- SELECT  — `findExisting` (publish-roas-curriculum.ts:83) and `nextVersionFor`
--           (curriculum-admin.ts:73) read the newest row per stable id, and
--           `validateLearningPathForPublication` / `buildLearningPathQualityReport`
--           walk the whole tree.
-- INSERT  — the `createDraft*` authoring operations.
--
-- Each create chains `.select(...).single()` onto the insert to return the
-- allocated version, which needs SELECT as well as INSERT; SELECT is already
-- required by the reads above.

grant select, insert on public.learning_paths    to service_role;
grant select, insert on public.courses           to service_role;
grant select, insert on public.learning_modules  to service_role;
grant select, insert on public.missions          to service_role;
grant select, insert on public.competencies      to service_role;

-- UPDATE on `learning_paths` only.
--
--   curriculum-admin.ts:205  updateDraftLearningPath — editing a draft
--   curriculum-admin.ts:690  transitionLearningPathState — the non-published
--                            transitions (draft -> review, -> retired)
--
-- `courses`, `learning_modules`, `missions` and `competencies` deliberately do
-- NOT receive UPDATE. Their publication state is cascaded by
-- `curriculum_publish_learning_path_tree`, which is SECURITY DEFINER and
-- therefore performs those updates as its owner, not as the caller. No approved
-- route or command issues a direct UPDATE against them, so granting one would
-- privilege a statement that does not exist.

grant update on public.learning_paths to service_role;

-- ------------------------------------------------------------------
-- Curriculum relationship tables
-- ------------------------------------------------------------------
-- competency_prerequisites
--   SELECT  — prerequisiteExists (publish-roas-curriculum.ts:111) and
--             hasPrerequisiteCycle (curriculum-quality.ts:86)
--   INSERT  — addCompetencyPrerequisite (curriculum-admin.ts:401)
--
-- No UPDATE and no DELETE: the approved surface adds an edge or leaves it
-- alone. Nothing revises or removes one.

grant select, insert on public.competency_prerequisites to service_role;

-- mission_competencies
--   SELECT          — the validation and quality walks read the required links
--   INSERT, UPDATE  — `linkMissionCompetency` (curriculum-admin.ts:425) uses
--                     `.upsert(...)`, which is INSERT ... ON CONFLICT DO UPDATE
--                     against the (mission_id, competency_id) primary key. The
--                     UPDATE half is what makes re-running publication
--                     idempotent rather than a duplicate-key failure.

grant select, insert, update on public.mission_competencies to service_role;

-- ------------------------------------------------------------------
-- Publication audit trail
-- ------------------------------------------------------------------
-- INSERT only. `transitionLearningPathState` appends one row per transition
-- (curriculum-admin.ts:718) and the insert requests no representation back.
--
-- **No SELECT.** Nothing in the application reads this table, and an audit
-- trail that the writer cannot read back is a slightly stronger one. No UPDATE
-- and no DELETE: an audit row that can be rewritten is not an audit row.

grant insert on public.curriculum_publication_events to service_role;

-- ------------------------------------------------------------------
-- Curriculum assets
-- ------------------------------------------------------------------
-- SELECT only. `buildLearningPathQualityReport` reads asset URIs to validate
-- them (curriculum-quality.ts:258), and that read is on the publication path.
--
-- `addMissionAsset` (curriculum-quality.ts:66) would INSERT here, but it is
-- exported and never called: no `/admin/curriculum/*` route reaches it and the
-- publication command does not use it. INSERT is therefore NOT granted. When a
-- reachable caller is approved, that package grants the verb it needs.

grant select on public.curriculum_assets to service_role;

-- ------------------------------------------------------------------
-- Publication RPC
-- ------------------------------------------------------------------
-- `curriculum_publish_learning_path_tree(uuid)` is SECURITY DEFINER and
-- publishes an entire tree atomically. `20260811000500` revoked it from
-- `public`, `anon` and `authenticated`; revoking the PUBLIC default left only
-- the owner able to execute it, so `service_role` — which is not the owner —
-- could not either. That is a second blocker on the same publication path,
-- reached at the final step after every write has already been committed.
--
-- Those three revocations are deliberately left exactly as they are. This adds
-- one grant and widens nothing: the learner-facing roles still cannot publish
-- curriculum, which is the property `20260811000500` was written to guarantee.

grant execute on function public.curriculum_publish_learning_path_tree(uuid)
    to service_role;

-- ------------------------------------------------------------------
-- Deliberately NOT granted
-- ------------------------------------------------------------------
-- No sequence privileges. Every primary key in this contract is
-- `uuid default gen_random_uuid()`, so no sequence is advanced by any statement
-- above and `usage on sequence` would authorize nothing.
--
-- No DELETE on any table in this contract. The authoring surface creates and
-- transitions curriculum; it never removes it. Retirement is a publication
-- state, not a deletion.
--
-- No TRUNCATE, REFERENCES or TRIGGER on any table.
--
-- No grant to `anon` or `authenticated`. DB-RLS-1 owns those, and
-- `scripts/verify-db-rls.sh` still checks that contract against the policies.

insert into public.platform_schema_version (component, version)
values ('service-role-privilege-contract', '0.1.0')
on conflict (component, version) do nothing;
