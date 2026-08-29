# Router-on-a-Stick — Founder UAT Runbook

**Status:** ROAS-4, last corrected by LEARN-PROGRESS-DB-1.

Sections 2 and 3 have been performed: 38 migrations are applied and the
Router-on-a-Stick curriculum is published in the development/UAT project. §4
learner UAT is **blocked on one undeployed migration** —
`20260829000100_record_mission_progress_ambiguity_fix.sql` — without which
recording mission progress returns HTTP 409.

**Claude Code has still run nothing against any Supabase project.** Every step
below is a Founder action.

---

## 1. What UAT actually requires

Plainly, before any of this works you need five things running or configured.
Three already exist in the repository. Two are yours to supply.

| Piece | What it is | Status |
|---|---|---|
| **Frontend** | The Vite web app, `npm run dev` | ✅ In the repo |
| **API** | The Node API service, `npm run dev:api` | ✅ In the repo |
| **Authentication** | Supabase Auth, via the browser anon key | ⚠️ **Needs your Supabase project** |
| **Database** | A Supabase Postgres with all 39 migrations applied | ⚠️ **Needs your project + migrations** |
| **Curriculum publication** | `npm run admin:publish-roas-curriculum` | ✅ Built here — ⚠️ **you run it** |
| **Learner access** | None needed — any authenticated user reads published curriculum through RLS | ✅ Nothing to do |
| **Progress persistence** | `student_learning_progress`, written by `record_mission_progress` | ✅ Exists once migrations are applied |
| **External services** | None. No AI, no lab provider, no email, no payments | ✅ Nothing to do |

**There is no "enrollment" step.** The platform has no enrollment table and no
provisioning concept for learners: Row-Level Security grants every authenticated
user read access to *published* curriculum. Publishing the course is therefore
the only thing that stands between the current state and a usable UAT.

---

## 2. One-time setup

### 2.1 Create a development Supabase project

A local Supabase stack or a throwaway cloud project. **Do not use anything you
would mind re-creating.** The publication command refuses production targets,
but that is a safety net, not a reason to point it somewhere important.

### 2.2 Apply the migrations

All 39 migrations in `supabase/migrations/` must be applied, in filename order.
ROAS-4 added none. DB-SERVICE-ROLE-1 added the 38th and LEARN-PROGRESS-DB-1 adds
the 39th. Neither executes one — applying them remains a Founder action.

**Use the Supabase CLI.** DB-TOOLING-1 established it as the standard mechanism,
and the full procedure — installation, `link`, `migration list`, `db push`, and
every secret-handling rule — lives in
[`DATABASE_MIGRATION_WORKFLOW.md`](DATABASE_MIGRATION_WORKFLOW.md). The short
version:

```
supabase login
supabase link --project-ref <project-ref>
supabase migration list
supabase db push
```

Dashboard SQL paste and direct `psql` are **not** the normal path — the first
records no migration history, and the migrations are not individually
re-runnable, so that history is load-bearing. `supabase db reset` is destructive
and never appropriate for a remote project.

Check the machine is ready first with `npm run db:doctor`, which is read-only.

**Verify afterwards**, and note one result that looks wrong but is not:

| Check | Expected |
|---|---|
| `supabase migration list` | **39** applied |
| `select count(*) from public.platform_schema_version;` | **38** |
| `select count(*) from information_schema.tables where table_schema='public';` | **61** |
| `select count(*) from pg_policies where schemaname='public';` | **65** |
| `select count(*) from pg_tables where schemaname='public' and rowsecurity=false;` | **0** |

> **One fewer schema-version row than migrations is correct.** Every migration
> registers one component row except
> `20260813001000_certificate_correction_foundation.sql` (CERT-008), which
> registers none. Expecting the counts to match would make a successful
> migration look failed.

> **Migration 38 is required before publication.**
> `20260828000100_service_role_privilege_contract.sql` (DB-SERVICE-ROLE-1) grants
> the `service_role` the curriculum privileges the publication command needs.
> Without it, publication fails on its **first query** with
> `42501 insufficient_privilege`, because `service_role` bypasses RLS but not
> table `GRANT`s — the same two-layer distinction that produced the earlier
> learner-facing 403. The table and policy counts above are unchanged by it: it
> alters privileges only.

> **Migration 39 is required before a learner can record progress.**
> `20260829000100_record_mission_progress_ambiguity_fix.sql`
> (LEARN-PROGRESS-DB-1) repairs `record_mission_progress`. Without it, "Mark as
> started" and "Mark as complete" both fail with HTTP 409 and
> `column reference "node_type" is ambiguous` — the function's `RETURNS TABLE`
> column names are PL/pgSQL variables, and the upsert's `ON CONFLICT` clause
> referenced three of them unqualified. Reading the course works without it;
> only the write path is affected. It changes one function body and adds one
> schema-version row.

This step has already been performed once, and it is worth recording what it
proved: the `on_auth_user_created` trigger on `auth.users` fires correctly, and
**two-way RLS isolation is confirmed** — learner A reads A's rows and zero of
B's, and the reverse. Live PostgreSQL and RLS behaviour is therefore no longer
unexercised.

What that exercise also proved is that the test suite cannot stand in for it.
Everything the suite asserts about the database is asserted against mocks, and
three defects reached real UAT anyway: the missing `authenticated` grants
(42501), the missing `service_role` grants, and the ambiguous `node_type`
reference this runbook's §2.2 note describes. If something fails here, that is a
genuine finding worth reporting, not a mistake on your part.

### 2.3 Configure the environment

> **This section was rewritten after real UAT.** The previous instruction — one
> `.env.local` at the repository root — does not work, and the way it fails is
> confusing rather than loud. Three separate mechanisms are involved:
>
> | Who needs it | Variables | Where it is read from | Loaded by |
> |---|---|---|---|
> | The **browser** | `VITE_*` | `apps/web/.env.local` | Vite, automatically |
> | The **API** and the **publication command** | `SUPABASE_*`, `APP_ENV` | your shell environment | **nothing — you must load it** |
>
> `apps/web/vite.config.ts` sets no `envDir`, so Vite's env root is `apps/web`,
> not the repository root. And the API runs under `tsx`, which has no dotenv
> support at all. A root `.env.local` is therefore read by *neither*.
>
> This is why the first UAT attempt had a working browser and a broken API at
> the same time, and why the API then returned `HTTP 500 "Unexpected server
> error"` — `SUPABASE_URL` was eventually set to something that was not a URL,
> and nothing validated its shape.
>
> **Do not `source apps/web/.env.local`.** In zsh that breaks on any value
> containing a space and silently mangles quoted values. It was never safe.

**Two files, and one command that loads the second one.**

**1. The browser file** — `apps/web/.env.local`:

```
VITE_SUPABASE_URL=<your development project URL>
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_API_BASE_URL=http://localhost:3001
```

**2. The API file** — `.env.api` at the repository root. **Three lines are all
the learner API needs:**

```
APP_ENV=development
SUPABASE_URL=<the same project URL>
SUPABASE_ANON_KEY=<the same anon key>
```

Both files are git-ignored. Never commit either. Create them in a text editor
rather than with `echo` or a heredoc, so no value reaches your shell history.

**Publication credentials are deliberately separate.** `SUPABASE_SERVICE_ROLE_KEY`
and `TLP_UAT_BOOTSTRAP_ACTOR_ID` are needed **only** to publish curriculum. They
are not needed to run the learner API, and §3.2 shows how to supply them for the
one command that does need them. You may keep them out of `.env.api` entirely.

#### The execution contract

> **DO:**
> ```
> bash scripts/uat-env.sh check
> bash scripts/uat-env.sh run npm run dev:api
> ```
>
> **DO NOT:**
> ```
> source scripts/uat-env.sh
> ```
>
> The helper is a **bash script that must be executed**. Sourcing it runs it in
> your own shell, where `BASH_SOURCE` may not exist — in zsh that produced
> `BASH_SOURCE[0]: parameter not set`, made the helper resolve the *parent* of
> the repository, and reported five failures for configuration that was present.
> It also left the shell relocated with `set -euo pipefail` applied.
>
> The helper now refuses a sourced invocation immediately, without moving your
> shell or changing its options. If you see that refusal, re-run it with `bash`.

**3. Check it before you rely on it:**

```
bash scripts/uat-env.sh check
```

Requirements are **scoped by purpose**, so the check tells you what each value is
for and fails only on what the thing you are doing actually needs:

| Category | Variables | Required for |
|---|---|---|
| learner API + publication | `APP_ENV`, `SUPABASE_URL` | everything |
| learner API | `SUPABASE_ANON_KEY` | running the API |
| publication/admin | `SUPABASE_SERVICE_ROLE_KEY`, `TLP_UAT_BOOTSTRAP_ACTOR_ID` | publishing only |
| browser/frontend | `apps/web/.env.local` | the browser only — never blocks the API |

`bash scripts/uat-env.sh check publish` checks the publication requirements, and
`check all` checks every category at once.

**It never prints a value** — only variable names, verdicts and purpose labels.
It catches every mistake that actually happened during UAT: a project URL that is
really the database connection string, the anon key pasted into the service-role
slot, and an unset `APP_ENV`.

**4. Run everything through it:**

```
bash scripts/uat-env.sh run npm run dev:api
```

`run` loads `.env.api`, validates only what that command needs, then starts it.
It parses the file without `source` and without `eval`, so values containing
spaces, quotes or `$` are treated as data. It recognises the publication command
automatically and applies the stronger publication requirements to that one.

#### Where each value comes from

In the Supabase dashboard, **Settings → API**:

- **Project URL** → `SUPABASE_URL` and `VITE_SUPABASE_URL`. It starts with
  `https://` and ends in `.supabase.co`. It is *not* the value on the Database
  settings page — that one starts with `postgresql://` and contains your
  database password.
- **anon / publishable key** → `SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY`.
- **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY`. This sits
  directly beside the anon key and is the one people paste wrongly. It grants
  full database access and **bypasses RLS**; it must never reach the browser,
  a commit, or a `VITE_*` variable.

`TLP_UAT_BOOTSTRAP_ACTOR_ID` is the `id` of a row in `auth.users` — take it from
**Authentication → Users** in the dashboard. Publication is recorded against a
real account in `curriculum_publication_events`, whose `actor_user_id` column is
`uuid not null references auth.users(id)`, so a placeholder cannot be used.

`APP_ENV` must be `development` or `test`. The publication command refuses to
run under any other value, including an unset one.

### 2.4 Create a learner account

Sign up through the web app, or create a user in the Supabase dashboard. **Use
an ordinary learner account for UAT, not a founder account** — `founder_admin`
users are wrapped in `FounderMfaGate` and must enrol MFA before reaching the
workspace, which adds a step UAT does not need.

---

## 3. Publish the curriculum

### 3.1 See what would happen — safe, changes nothing

```
bash scripts/uat-env.sh run npm run admin:publish-roas-curriculum
```

With no confirmation set this is a **dry run**. It prints the learning path,
course, 4 modules, 7 missions, 9 competencies, 6 prerequisite edges and all
**31** mission-competency links it would create, in the order ROAS-2 derived,
and then exits without writing.

> **31 is correct.** The ROAS-4 pull-request description said 30. That prose was
> a miscount: `packages/shared-types/src/roas-curriculum.ts` has exactly one
> commit and has never been modified, and its seven missions carry
> 4 + 3 + 2 + 4 + 3 + 6 + 9 = 31 competency assignments. The count is derived
> from the authored missions by `flatMap`, never stated as a constant, and
> `roas-bootstrap.test.ts` now pins both the total and the per-mission
> breakdown.

Read this output. It is the last cheap moment to notice something wrong.

**The dry run touches no database at all.** It resolves the environment, builds
the plan in memory and prints it. A successful dry run therefore proves nothing
about your credentials, your privileges or your connection — which is exactly
why the first real execution failed on its very first query.

### 3.2 Actually publish

```
TLP_UAT_BOOTSTRAP_CONFIRM=<your exact SUPABASE_URL> bash scripts/uat-env.sh run npm run admin:publish-roas-curriculum
```

The confirmation must equal `SUPABASE_URL` **exactly**. This follows the
`provision-founder` precedent: you have to name the project you are changing, so
a shell with the wrong URL exported fails instead of writing somewhere you did
not intend.

**If you kept the publication credentials out of `.env.api`**, supply them for
this one command by putting them in a second env file and pointing the helper at
it — never by echoing them into your shell:

```
TLP_ENV_FILE=.env.publish TLP_UAT_BOOTSTRAP_CONFIRM=<your exact SUPABASE_URL> bash scripts/uat-env.sh run npm run admin:publish-roas-curriculum
```

`.env.publish` would hold the learner API three plus `SUPABASE_SERVICE_ROLE_KEY`
and `TLP_UAT_BOOTSTRAP_ACTOR_ID`. Any `.env*` name is git-ignored. Keeping the
service-role key out of the file you use every day is the point: the API never
needs it, so it never has to be loaded to run the course.

The helper recognises this command as a publication and applies the stronger
requirements — with a confirmation present it refuses to start without a valid
service-role credential and a real actor UUID. Without a confirmation it is a
dry run, and a dry run deliberately requires neither.

The command then:

1. creates or reuses each node through the existing `curriculum-admin`
   operations — the same code path the guarded API routes use,
2. runs `validateLearningPathForPublication` and refuses to publish if it fails,
3. transitions `draft → review → published`, which triggers
   `curriculum_publish_learning_path_tree` and cascades publication to the
   course, modules, missions and mapped competencies.

**Re-running is safe.** Existing nodes are found by stable id and reused, never
re-created — `curriculum-admin` allocates `version = max + 1` on every create,
so a naive second run would produce a second version of the entire course.

### 3.3 What it deliberately does not do

- **No lab is published.** The four lab operations in the ROAS-2 authoring plan
  are listed as deferred and skipped. No provider implements the deterministic
  probes, so a published lab definition would describe something that cannot
  run.
- **No progress, evidence or competency state is written.** It could not be:
  `record_mission_progress` resolves the learner from `auth.uid()`, so progress
  is writable only by an authenticated learner's own session.

---

## 4. Run the UAT

In two terminals:

```
bash scripts/uat-env.sh run npm run dev:api
```

```
npm run dev
```

The API needs the wrapper because nothing else loads `.env.api` (§2.3). The web
app does not, because Vite loads `apps/web/.env.local` by itself.

Sign in, then work through this list. The point is to judge whether it *teaches*,
not whether it renders.

### Reaching the course
- [ ] **Learning** appears in the workspace navigation
- [ ] Overview, Evidence portfolio, Certificates, Certificate eligibility and
      Search all still work
- [ ] Learning opens Router-on-a-Stick
- [ ] The status reads **"You are enrolled in this course"** — not "not published
      to you yet". If it still says not published, publication did not take.

### The course
- [ ] The overview explains what the course is and what you will be able to do
- [ ] 4 modules and 7 missions, in the authored order
- [ ] Estimated times read as guidance, never as a deadline

### A mission
- [ ] Opening a mission moves focus to its heading
- [ ] The instructional brief reads as teaching, with paragraphs and lists
- [ ] Competencies are described in plain language — no `net.` identifiers
- [ ] "Mission N of 7" and the estimate are right

### Progress — the part that matters most
- [ ] Mark an ordinary mission **started**; the state changes
- [ ] Mark one **complete**; the course summary updates
- [ ] **Sign out, close the tab, come back and sign in again**
- [ ] The progress you recorded is still there
- [ ] "What to do next" points somewhere sensible
- [ ] Refreshing mid-course does not lose anything

### Practice
- [ ] The three knowledge checks open and are answerable by keyboard
- [ ] Checking answers gives feedback
- [ ] It says clearly that practice is not recorded and is not competency

### The lab boundary — do not skip this
- [ ] Mission 7 says the demonstration is proved by a lab that does not exist yet
- [ ] **There is no way to mark Mission 7 complete.** Its progress buttons are
      disabled, and the reason says the deterministic validator settles it.
- [ ] Nothing anywhere offers a simulated pass

### Failure states
- [ ] Stop the API and reload: the material stays readable, and it says progress
      could not be loaded rather than showing 0%
- [ ] Nothing ever claims a mission is "Not started" when the truth is that it
      could not be checked

### Accessibility and feel
- [ ] Tab through the whole course — everything reachable, focus always visible
- [ ] Practice options work with arrow keys and space
- [ ] Narrow the window to a phone width: still usable
- [ ] It feels calm. No urgency, no streaks, no pressure.

---

## 5. Reporting findings

Blocking findings return as a normal scoped work package. Note which of these a
finding is:

- **Instructional** — the teaching itself. A ROAS content package.
- **Interface** — layout, focus, wording. A learner-surface package.
- **Platform** — RLS, auth, persistence. Likely the first real evidence of live
  database behaviour, and the most valuable kind to report precisely.

---

## 6. What UAT still cannot cover

- The practical lab. No provider exists; Mission 7 is honestly unfinishable.
- Certificate issuance, which needs Evidence, which needs the lab.
- Search against a populated corpus — worth a look once the curriculum is
  published, but SEARCH UAT is its own package.
