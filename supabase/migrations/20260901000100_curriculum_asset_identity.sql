-- Technical Learning Platform
-- WP-D / CURR-007: give curriculum assets an identity a mission step can name,
-- and an accessibility guarantee the database itself enforces.
--
-- ## What was missing
--
-- WP-C's `diagram` and `reference` steps carry an `assetStableId`. Nothing
-- could resolve it: `curriculum_assets` has had no stable id since Wave 2, so
-- a step could name an asset only in the sense that a string looks like a name.
--
-- The table also had no accessibility metadata and no visual asset type, so the
-- one thing the instructional model most needs — a diagram a learner can
-- actually reach — could neither be typed nor described.
--
-- ## What this migration does NOT do
--
-- No column is dropped, no value is removed from the existing vocabulary, and
-- no row is rewritten. Every change is additive.
--
-- The six Wave 2 asset types are preserved exactly. Narrowing a live column
-- would be a destructive vocabulary migration, and the application narrows
-- NEW AUTHORING instead: `CURRICULUM_AUTHORABLE_ASSET_TYPES` excludes `lab`,
-- `assessment` and `video`, because the Lab Engine owns the mission-to-lab
-- binding through `lab_definitions.mission_stable_id`, `assessment_definitions`
-- owns assessments, and video delivery is outside the approved scope. Those
-- rows stay readable; they simply cannot be newly authored.
--
-- ## An asset is supporting content, not a node
--
-- Deliberately still absent, and absent for the same reasons as `mission_steps`:
--
--   no publication_state   an asset is reachable exactly when its owning
--                          MISSION is published, through the RLS policy this
--                          table has carried since Wave 2. No second
--                          publication hierarchy, and the publication cascade
--                          needs no change.
--   no version             the asset belongs to `missions(stable_id, version)`.
--   no competency          an asset awards nothing.
--   no evidence            evidence comes from the deterministic lab validator
--                          and evidence-producing assessments.
--   no prerequisite        prerequisites remain owned by
--                          learning_prerequisite_rules.
--   no progress            student_learning_progress still stops at 'mission'.
--
-- ## Identity is mission-scoped
--
-- `unique (mission_id, stable_id)`, matching `unique (mission_id, position)`
-- which this table has always had, and matching `mission_steps`. Two missions
-- may each carry an asset called `two-host-topology`.
--
-- Nullable, because a row predating WP-D has none. Postgres permits multiple
-- NULLs under a unique constraint, so legacy rows coexist without a backfill
-- and without a fabricated identity. Nothing has ever written a row through
-- `addMissionAsset` — it has had no caller — so in practice there are no such
-- rows; the column is nullable so that a restored older database still reads.
--
-- ## Accessibility, enforced by the database
--
-- A visual asset without an authored description is instruction a learner
-- cannot reach. The CHECK below makes that unstorable rather than merely
-- discouraged.
--
-- It is written so that EXISTING rows remain valid: it constrains only rows
-- whose type is `image` or `diagram`, and no row can already carry those types
-- because the previous CHECK did not permit them. The constraint is therefore
-- satisfied by every row in existence at the moment it is added.
--
-- Alt text is authored. It must never be produced by AI: accessibility has to
-- work with the AI Gateway switched off, which it currently is.
--
-- ## No keyword filtering
--
-- Nothing here pattern-matches titles or alt text against markup-like strings.
-- The platform teaches HTML, shell and security material, so code-looking text
-- in a title or description is legitimate instructional content. Safety comes
-- from the column holding inert text with no executable position, and from the
-- renderer escaping it later.

alter table public.curriculum_assets
    add column if not exists stable_id text;

alter table public.curriculum_assets
    add column if not exists alt_text text;

-- Mission-scoped identity.
--
-- A TOTAL unique constraint, deliberately, not a partial unique index.
--
-- Multiple legacy rows with a NULL stable_id remain permitted either way: SQL
-- treats NULLs as distinct in a unique constraint, so no backfill invents an
-- identity for them.
--
-- The difference that matters is `ON CONFLICT`. `addMissionAsset` upserts on
-- (mission_id, stable_id), and PostgreSQL can only INFER a partial index when
-- the statement also supplies the index predicate — `on conflict (cols) where
-- …`. PostgREST emits only the column list, so a partial index here would make
-- every upsert fail with "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification". A total constraint is inferrable from the
-- column list alone.
alter table public.curriculum_assets
    drop constraint if exists curriculum_assets_mission_stable_id_key;

alter table public.curriculum_assets
    add constraint curriculum_assets_mission_stable_id_key
    unique (mission_id, stable_id);

-- Extend the vocabulary. The existing six are preserved verbatim; `image` and
-- `diagram` are added. Dropping and re-adding is the only way to widen an
-- inline CHECK, and it is the pattern 20260830000100 already established.
alter table public.curriculum_assets
    drop constraint if exists curriculum_assets_asset_type_check;

alter table public.curriculum_assets
    add constraint curriculum_assets_asset_type_check
    check (asset_type in (
        'article',
        'video',
        'lab',
        'assessment',
        'reference',
        'download',
        'image',
        'diagram'
    ));

-- A visual asset cannot exist without an authored description.
alter table public.curriculum_assets
    drop constraint if exists curriculum_assets_visual_alt_text_check;

alter table public.curriculum_assets
    add constraint curriculum_assets_visual_alt_text_check
    check (
        asset_type not in ('image', 'diagram')
        or (alt_text is not null and length(btrim(alt_text)) > 0)
    );

comment on column public.curriculum_assets.stable_id is
    'WP-D. Mission-scoped authored identity a mission step names through diagram.assetStableId or reference.assetStableId. Not a curriculum node id: it never appears in publication events, version lineage, prerequisite rules or learner progress. Nullable for rows predating WP-D.';

comment on column public.curriculum_assets.alt_text is
    'WP-D. Authored description of what a visual asset DEPICTS. Required for image and diagram, enforced by curriculum_assets_visual_alt_text_check. Distinct from a mission step''s textAlternative, which describes what the visual TEACHES in that mission. Both are authored; neither may be produced by AI.';

-- Authoring privileges.
--
-- `service_role` has held SELECT since 20260828000100, which deliberately
-- withheld INSERT because `addMissionAsset` had no reachable caller. WP-D makes
-- it a real, validated authoring operation with an upsert on
-- (mission_id, stable_id), so it now needs INSERT and UPDATE.
--
-- This is the same verb set mission_competencies and mission_steps hold, and
-- for the same reason. No DELETE, matching every other curriculum table.
grant insert, update on public.curriculum_assets to service_role;

-- `authenticated` is unchanged: SELECT only, already granted by
-- 20260814000100, narrowed by the published-mission RLS policy this table has
-- carried since Wave 2. Learners read published content and write nothing.

insert into public.platform_schema_version (component, version)
values ('curriculum-asset-identity', '0.1.0')
on conflict (component, version) do nothing;
