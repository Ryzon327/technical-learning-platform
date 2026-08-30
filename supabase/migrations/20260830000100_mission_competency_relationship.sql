-- Technical Learning Platform
-- WP-B / DEC-055: what a Mission DOES with a competency.
--
-- ## The distinction this adds
--
-- `mission_competencies` has carried exactly one fact about a link: `required`,
-- meaning required-versus-supporting WITHIN the mission. It could not express
-- whether the mission is accountable for TEACHING the competency or is
-- deliberately REUSING one developed elsewhere.
--
--     develops    this mission is accountable for teaching/developing it
--     reinforces  it was developed elsewhere; this mission applies it again
--
-- LEARN-008 section 8.1 item 1 recorded the gap. DEC-049 recorded that closing
-- it needs a migration and separate Founder authorization. This is that
-- migration, authorized by DEC-055.
--
-- ## Why this is not cosmetic
--
-- Without it, "where was this competency developed?" can only be guessed, and
-- the repository guessed it the one way available: the first mission that lists
-- the competency as `required`. That inference placed a practice check about
-- IPv4 addressing at a mission which APPLIES addressing rather than teaching
-- it, and a learner met a question about a procedure the instruction had never
-- given. The inference was faithful to the data; the data could not say what it
-- meant.
--
-- ## `required` is NOT the same axis, and is not touched
--
-- All four combinations are meaningful and none is derivable from the other:
--
--     required=true  + develops     teaches it, and you must reach it here
--     required=true  + reinforces   reuses it, and you must reach it here
--     required=false + develops     teaches it as supporting material
--     required=false + reinforces   reuses it as supporting material
--
-- Two authored ROAS links are `required=true` AND `reinforces` — Mission 4's
-- default gateway and Mission 6's connectivity verification — which is exactly
-- why one column cannot serve both purposes.
--
-- ## `requires` is deliberately absent from the vocabulary
--
-- A third value naming a prerequisite would be a SECOND, weaker prerequisite
-- mechanism: no learner-facing explanation, no satisfaction types, no
-- server-side evaluation, no test-out path. `learning_prerequisite_rules`
-- already owns all of that and remains the sole authority for "what must be
-- true before this mission". The CHECK constraint below makes `requires`
-- unrepresentable rather than merely discouraged.
--
-- ## Why the column is nullable
--
-- A NOT NULL column needs a value for every existing row, and a DEFAULT would
-- silently classify every already-published link as `develops`. That is a
-- fabricated classification, and it would be indistinguishable from an authored
-- one.
--
-- NULL here means "not yet classified", which is true, and the CHECK still
-- rejects `requires` or any arbitrary string. Legacy rows are corrected by
-- re-running the existing idempotent publication command, which upserts every
-- link with its explicitly authored value — no bespoke backfill, no guesswork.
--
-- Tightening to NOT NULL is deliberately deferred to a later, separately
-- authorized migration, once the transition is proven.
--
-- ## Scope
--
-- One column and one constraint. No RLS change: the existing policy is
-- row-scoped on publication state and is unaffected by an added column. No
-- grant change: `select, insert, update` on this table already covers it for
-- `service_role`, and `select` for `authenticated`. Nothing else is altered.

alter table public.mission_competencies
    add column if not exists relationship text;

-- The closed vocabulary, enforced by the database and not only by TypeScript.
-- `not valid` is deliberately NOT used: the constraint must apply to existing
-- rows too, and it does, because NULL passes a CHECK.
alter table public.mission_competencies
    drop constraint if exists mission_competencies_relationship_check;

alter table public.mission_competencies
    add constraint mission_competencies_relationship_check
    check (relationship is null or relationship in ('develops', 'reinforces'));

comment on column public.mission_competencies.relationship is
    'DEC-055. What this mission does with the competency: develops (accountable for teaching it) or reinforces (developed elsewhere, applied again here). Orthogonal to required. NULL means not yet classified; prerequisites are owned solely by learning_prerequisite_rules.';

insert into public.platform_schema_version (component, version)
values ('mission-competency-relationship', '0.1.0')
on conflict (component, version) do nothing;
