# Router-on-a-Stick — Founder UAT Runbook

**Status:** ROAS-4. Prepared, not executed. Claude Code has run nothing against
any Supabase project; every step below is a Founder action.

---

## 1. What UAT actually requires

Plainly, before any of this works you need five things running or configured.
Three already exist in the repository. Two are yours to supply.

| Piece | What it is | Status |
|---|---|---|
| **Frontend** | The Vite web app, `npm run dev` | ✅ In the repo |
| **API** | The Node API service, `npm run dev:api` | ✅ In the repo |
| **Authentication** | Supabase Auth, via the browser anon key | ⚠️ **Needs your Supabase project** |
| **Database** | A Supabase Postgres with all 36 migrations applied | ⚠️ **Needs your project + migrations** |
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

All 36 migrations in `supabase/migrations/` must be applied, in filename order.
ROAS-4 adds none and executes none.

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
| `supabase migration list` | **36** applied |
| `select count(*) from public.platform_schema_version;` | **35** |
| `select count(*) from information_schema.tables where table_schema='public';` | **61** |
| `select count(*) from pg_policies where schemaname='public';` | **65** |
| `select count(*) from pg_tables where schemaname='public' and rowsecurity=false;` | **0** |

> **36 migrations but 35 schema-version rows is correct.** Every migration
> registers one component row except
> `20260813001000_certificate_correction_foundation.sql` (CERT-008), which
> registers none. Expecting 36 would make a successful migration look failed.

This is the step with the most room for surprise: **live PostgreSQL and RLS
behaviour has never been exercised by this project**. Everything the test suite
proves about RLS is proven against mocks. If something fails here, that is a
genuine finding and worth reporting, not a mistake on your part. The most likely
failure is the `on_auth_user_created` trigger on `auth.users`, which is a
privileged operation — §4 of the workflow document explains how to confirm it.

### 2.3 Configure the environment

Copy `.env.example` to `.env.local` and fill in:

```
APP_ENV=development
SUPABASE_URL=<your development project URL>
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
VITE_SUPABASE_URL=<same URL>
VITE_SUPABASE_ANON_KEY=<same anon key>
VITE_API_BASE_URL=http://localhost:3001
```

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
npm run admin:publish-roas-curriculum
```

With no confirmation set this is a **dry run**. It prints the learning path,
course, 4 modules, 7 missions, 9 competencies, the prerequisite edges and every
mission-competency link it would create, in the order ROAS-2 derived, and then
exits without writing.

Read this output. It is the last cheap moment to notice something wrong.

### 3.2 Actually publish

```
TLP_UAT_BOOTSTRAP_CONFIRM=<your exact SUPABASE_URL> npm run admin:publish-roas-curriculum
```

The confirmation must equal `SUPABASE_URL` **exactly**. This follows the
`provision-founder` precedent: you have to name the project you are changing, so
a shell with the wrong URL exported fails instead of writing somewhere you did
not intend.

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

```
npm run dev:api
npm run dev
```

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
