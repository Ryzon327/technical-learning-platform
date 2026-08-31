# Authored curriculum

Curriculum lives here as JSON, outside the application bundle (DEC-056). The
database remains the authoritative **runtime** store; these files are the
authoritative **authoring** representation — what a reviewer reads in a pull
request, and the only input the import command accepts.

Nothing reads these files at runtime. A learner's curriculum comes from the
database through WP-E's read path, exactly as before.

## Layout

```
content/
  curriculum/   production curriculum. The only directory the importer accepts.
  fixtures/     architecture fixtures. Permanently retained, never publishable.
```

`content/curriculum/` does not exist yet. WP-G ships the mechanism; the first
production course is a later package. Router-on-a-Stick is **not** migrated —
it remains compiled content and its own publication command is untouched.

### Fixtures

`fixtures/curriculum-architecture-example.json` exercises the whole contract:
all seven step types, an asset referenced by two steps, both competency
relationships, a competency prerequisite edge, and an explicit prerequisite
rule. It is test evidence, not curriculum.

Three independent mechanisms keep a fixture out of the learner catalog, so a
fixture copied into the production directory is still refused:

1. the path must resolve inside `content/curriculum/`
2. the path must not resolve into `content/fixtures/`
3. the document's own `documentKind` must be `production`

Containment is checked against `realpath`, so a symlink inside the production
directory cannot point somewhere else and be accepted.

## The format

Strict JSON. The parser refuses rather than repairs:

- **unknown fields fail.** A typo in an optional key (`altTxt`, `postion`)
  is an error at review time, not a silently missing field a learner discovers
  as an unlabelled image.
- **no coercion.** `"3"` is not `3`; a whitespace-only title is not an absent
  one. Nothing is trimmed into validity.
- **no metadata escape hatch.** No `_note`, no free-form object.

Step and asset rules are not restated here — the document reuses
`validateMissionStep` and `validateCurriculumAsset`, the same validators the
server runs at publication, so a document that passes CI cannot be rejected at
publication for a step or asset reason.

Instructional text may contain shell commands, HTML tags, configuration
fragments and security examples. Curriculum is inert data: it is stored as text
and escaped by the renderer, and validation judges structure, never resemblance
(DEC-057).

## Importing

```
npm run admin:publish-curriculum -- content/curriculum/<course>.json
npm run admin:publish-curriculum -- content/curriculum/<course>.json --publish
```

**Dry run is the default.** A write requires `TLP_UAT_BOOTSTRAP_CONFIRM` to
equal `SUPABASE_URL` exactly, so an operator names the project rather than
authorising "whatever is configured". `APP_ENV=production` is refused
unconditionally, and a production-looking `SUPABASE_URL` is refused even when
`APP_ENV` disagrees. This is the same guard ROAS-4 proved, imported rather than
copied.

### Reconcile and publish are two acts

Without `--publish`, a confirmed run writes and validates **draft** curriculum
and performs no lifecycle transition. Publication is a separate explicit
request, so curriculum does not go live merely because an import succeeded.

CI never publishes. Validation runs in CI; publication is Founder-controlled.

## What an import will and will not do

| Situation | Result |
|---|---|
| Draft, identical | reuse — no write |
| Draft, changed | update in place, guarded to draft rows |
| Published, identical | reuse — no write, **no lifecycle transition** |
| Published, changed | **refused before any mutation** |
| New child under a published parent | **refused** — the published tree would change |
| Node found under a different parent | **refused** — WP-G cannot move curriculum |
| Review state | **refused** — neither edited nor transitioned as a side effect |
| Anything the document dropped | **refused** — see below |

### Removal is refused, never performed

WP-G holds no `DELETE` privilege on any curriculum table and does not ask for
one. If the database contains a step, asset, competency link, prerequisite edge,
prerequisite rule, module or mission that the document no longer contains, the
import **refuses before writing anything**.

Upserting only what the document contains would leave the stale row in place and
report success — the database would stop matching the authored source and nobody
would be told. Restore the entry, or request a reviewed removal capability.

Refusals distinguish the two causes. A dropped draft step is reported as a
removal limitation, not as a published-content change, because those are fixed
differently.

### No automatic re-versioning

Changed published curriculum is refused, not re-versioned. Proper re-versioning
— including carrying mission steps and assets forward to the new version — is
deferred to a separately reviewed package.

## Failure behaviour

Everything knowable is checked before the first write: the path, the document,
the environment, and a complete reconciliation plan covering nodes, mission
content, competency links, prerequisite edges and prerequisite rules. One
refusal anywhere means nothing is written.

**This is not a transaction.** The REST admin layer offers none spanning an
import, and WP-G does not add a database procedure to manufacture one. A
mid-import failure leaves earlier writes in place. They are **drafts** —
publication is separate and does not run — so the result is unpublished,
inspectable and re-importable rather than half-published. Re-running converges:
every write is a create-or-upsert keyed by stable id. No rollback is simulated.

## Assessments

Practice steps carry an `assessmentStableId`. WP-G does **not** make the
referenced assessment publishable: there is no assessment authoring path, and
none is added here. The reference is validated for shape and deliberately not
resolved, so the document never claims an assessment exists.

## Database

WP-G authors one migration, `20260902000100_curriculum_authoring_privileges.sql`,
granting `UPDATE` on the four curriculum node tables and
`SELECT, INSERT, UPDATE` on `learning_prerequisite_rules` — the verbs the new
code paths issue and no others. No `DELETE`, no blanket grants, no RLS change.

**It is source-only and has not been applied.** Applying it is a Founder action
through the migration workflow in
`docs/Engineering-OS/DATABASE_MIGRATION_WORKFLOW.md`. Until then the import
command cannot write, and it will fail at its first privileged statement rather
than partially succeed.
