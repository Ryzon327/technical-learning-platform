# Database Migration Workflow

**Status:** DB-TOOLING-1. Establishes the standard mechanism. No database has
been migrated yet; the first `supabase db push` is a Founder action.

---

## 1. The standard mechanism

**The Supabase CLI is the standard migration mechanism for this project.**
Migrations are applied with `supabase link` followed by `supabase db push`.

Two alternatives exist and are **not** the normal path:

- **Dashboard SQL copy/paste** — workable in an emergency, but it records no
  migration history. A later `supabase db push` would then try to re-apply
  everything and fail (see §5). Use only for read-only inspection queries.
- **Direct `psql`** — puts the database password on a command line and in shell
  history, and is denied to Claude Code by `.claude/settings.json`. Not the
  normal path.

`supabase db reset` **drops and recreates the database**. It is appropriate for
a local stack and is never appropriate for the remote development/UAT project.
It is denied to Claude Code.

---

## 2. Repository truth

- The **37 SQL files in `supabase/migrations/`** are the authoritative schema.
- **Filename order is dependency order.** The timestamps are monotonic and later
  files depend on earlier ones — every migration but one inserts into
  `public.platform_schema_version`, created by the first; and
  `20260813000900` redefines `public.certificate_issue`, first created by
  `20260813000800`. Applying out of order silently produces a different schema.
- `supabase/config.toml` is tracked and carries no secret and no project ref.
- `supabase/.temp/` is gitignored. `supabase link` writes the remote project ref
  there, which is what keeps this repository unbound to any one project.

Adding or editing a migration is a **Founder gate**. CI's migration guard warns
on any pull request that touches `supabase/migrations/`.

---

## 3. Installing the CLI

Supabase supports **two** installation approaches, and both are legitimate:

1. **Per-machine, globally.** On macOS, via Homebrew:

   ```
   brew install supabase/tap/supabase
   ```

2. **Project-scoped, as a dev dependency**, using npm, pnpm, yarn or bun, and
   invoked through the package runner:

   ```
   npx supabase migration list
   ```

   This is also the supported way to **pin the CLI version for the project**, so
   every operator and any future CI job runs the same one.

### What this repository does today, and why

> **CLI installation in force: Homebrew (global).**
>
> This one line is the declaration `scripts/verify-db-tooling.sh` checks against
> `package.json`. Change it in the same commit that changes the approach, or the
> gate fails — that is what keeps this section from going quietly stale.

The CLI is not currently an npm dependency, and no CLI version is pinned.

That is a deliberate choice for this phase, not a statement that the
project-scoped option is unavailable — it is available and supported:

- One Founder/operator performs remote migrations by hand, a handful of times.
  Version drift between operators is not yet a real risk.
- Adding the dependency was **outside DB-TOOLING-1's approved scope**. That work
  package was authorized to establish configuration and documentation, and a
  dependency change is a separate toolchain decision.

### When to reconsider — and what to prefer then

**A project-scoped, version-pinned CLI dev dependency is the preferred option**
the moment either of these becomes true:

- **Migration execution moves into CI/CD.** An automated runner must not depend
  on whatever CLI version a machine happens to have.
- **More than one operator applies migrations**, and reproducible CLI versions
  start to matter.

At that point the change is: add the CLI as a pinned dev dependency, switch the
commands in §4 to `npx supabase …`, and update this section. Nothing in this
repository forbids it — `scripts/verify-db-tooling.sh` checks that the
documentation matches whichever approach is in force, and does not prohibit
either.

Check local readiness at any time with:

```
npm run db:doctor
```

That command is read-only. It inspects the local machine and repository and
contacts nothing.

---

## 4. Applying migrations to a development project

Every step below is a **Founder action**. Claude Code is denied the
consequential ones.

### 4.1 Authenticate

```
supabase login
```

Opens a browser. No secret is typed into a terminal.

### 4.2 Link the project

```
supabase link --project-ref <project-ref>
```

The CLI prompts for the **database password interactively**. Enter it at the
prompt — never as a command argument, where it would land in shell history.

The project ref is the identifier in your project URL
(`https://<project-ref>.supabase.co`). It is an identifier, not a secret.

### 4.3 Preview before applying

```
supabase migration list
```

**Always run this before `db push`.** It shows which migrations exist locally
and which the remote already has. On a brand-new project every migration should
appear as local-only.

### 4.4 Apply

```
supabase db push
```

Applies pending migrations in filename order, each inside a transaction, and
records them in `supabase_migrations.schema_migrations` on the remote.

### 4.5 Confirm history

```
supabase migration list
```

All 37 should now appear as applied both locally and remotely.

---

## 4A. The database authorization contract

This is the part that was missing, cost a full UAT cycle, and is worth reading
before writing any migration that touches access.

**PostgreSQL authorizes in two layers, and both are required:**

1. **The base privilege** (`GRANT SELECT ON … TO authenticated`) decides whether
   the role may *attempt* the operation at all.
2. **The row-level security policy** (`CREATE POLICY … TO authenticated USING …`)
   decides which *rows* that operation may touch.

Neither implies the other. A table can have a perfect policy and still be
completely unreadable.

> **RLS-enabled alone is not proof that a learner can read a table.** Our
> first 36 migrations enabled RLS on all 61 tables and wrote 65 policies while
> granting `authenticated` nothing. Every learner read failed with
> **`42501 insufficient_privilege`**, surfaced by PostgREST as **HTTP 403** with
> `proxy-status: PostgREST; error=42501`. The policies were correct and were
> never reached.

The trap is that `create policy … TO authenticated` *reads* like a grant.
It is not one — `TO` there names the role a policy applies to, not a privilege
being given.

> **Elevated SQL cannot prove learner access.** The Supabase **SQL Editor** runs
> as a privileged role that bypasses both grants and RLS. A query that succeeds
> there tells you a row exists; it tells you nothing about whether a learner can
> reach it. We confirmed `user_profiles` rows that way and still shipped a
> completely inaccessible table. **Only a real authenticated session proves
> learner access**, which is why §6.2 is mandatory and cannot be replaced by a
> SQL check.

**The contract this repository now holds**, established by
`20260814000100_authenticated_privilege_contract.sql`:

- Every table with an `authenticated` policy is granted exactly the verbs those
  policies authorize — granted verbs are a *subset* of policy verbs.
- A table with no `authenticated` policy receives **no** grant. Thirteen tables
  are server-only this way, with RLS-without-policy and the absent grant as two
  independent barriers.
- No `GRANT … ON ALL TABLES`, and no `ALTER DEFAULT PRIVILEGES` — either would
  grant on tables nobody decided to expose.
- `anon` receives nothing; there is no anonymous data contract.
- Privileged RPCs stay revoked from every client role.

`scripts/verify-db-rls.sh` parses the policies out of the migrations and fails
if the grants and the policies ever disagree **in either direction** — a policy
without its grant, or a grant without a policy. Adding one half of the pair
cannot reach main.

---

## 5. Why migration history matters here

The existing migrations contain **65 `create policy` statements and no
`drop policy if exists` guards**. PostgreSQL has no `create policy if not
exists`, so re-executing an already-applied file fails on its first policy.
Tables are idempotent (`create table if not exists`); policies are not.

This is not a defect for a normal run — each file is applied once. It does mean:

- **Migration history is load-bearing.** The CLI records what it applied and
  never re-applies it. Dashboard paste records nothing, which is why it would
  poison later CLI use.
- **A failed file rolls back cleanly**, because the CLI wraps each migration in
  a transaction. Fix and re-push; do not hand-patch the remote.

---

## 6. Post-migration verification

Run these against the development project after `db push`. All are read-only.

### 6.1 Structure

| Check | Expected |
|---|---|
| `supabase migration list` | **37** migrations applied |
| `select count(*) from public.platform_schema_version;` | **36** — see the note below |
| `select count(*) from information_schema.tables where table_schema='public';` | **61** tables |
| `select count(*) from pg_policies where schemaname='public';` | **65** policies |
| `select count(*) from pg_tables where schemaname='public' and rowsecurity=false;` | **0** |
| `select count(*) from public.lab_provider_registry;` | **2** rows |

> **37 migrations, 36 schema-version rows — this is correct, not a failure.**
> Each migration registers one component row in
> `public.platform_schema_version`, except
> `20260813001000_certificate_correction_foundation.sql` (CERT-008), which
> registers none. An operator expecting 37 rows will read a correct migration as
> a broken one.

The `lab_provider_registry` rows are intended operational configuration seeded
by `20260812001300`: `mock` enabled, `container` **disabled**.

### 6.2 Real behaviour

The structural checks above prove the schema exists. These prove it *works*,
and they matter more. The auth trigger has now been proven on a real project;
**RLS row filtering still has not**, because until the privilege contract landed
PostgreSQL rejected every learner statement before any policy ran.

1. **Auth trigger.** Sign up a user through the web app, then confirm a
   `public.user_profiles` row exists for them with `role = 'student'`. That
   proves the `on_auth_user_created` trigger on `auth.users` fired.
   ✅ Proven on the development project.
2. **Learner read reaches the table at all.** Signed in, load the app. The
   profile must resolve rather than showing *"We could not load your profile."*
   A 403 with `error=42501` here means the privilege contract is not applied.
3. **Learner RLS isolation — the criterion that actually matters.** Create a
   **second** learner. Signed in as each, `select * from public.user_profiles`
   through the app must return exactly **one** row — their own. One account only
   proves the policy permits self-reads; **two prove it denies cross-reads**, and
   that is the first genuine demonstration that RLS works on this project.

A failure in any of these is a genuine finding about live behaviour, not an
operator mistake. Report it precisely.

---

## 7. Secrets

**Never commit a secret, and never paste one into Claude or ChatGPT.** Neither
AI needs any of them.

| Value | Handling |
|---|---|
| Database password | Interactive CLI prompt only. Never a command argument. |
| `service_role` key | `.env.local` only. Gitignored. |
| `anon` key | `.env.local` only. Publishable, but still not for AI. |
| Access token | Held by `supabase login`. Never copied. |
| **Project ref** | **Identifier, not a secret.** Safe to share. |
| **Project URL** | **Identifier, not a secret.** Safe to share. |

Claude Code is denied read and write access to every `.env` file by
`.claude/settings.json`, so it cannot see these even accidentally.

`.env.local`, `.env` and `.env.*.local` are gitignored. `supabase/config.toml`
is tracked and must stay secret-free; `scripts/verify-db-tooling.sh` fails the
build if a key, password or project ref appears in it.

---

## 8. What is Founder-gated

Claude Code may read migrations, count them, inspect this documentation and run
the read-only doctor. It is denied, in `.claude/settings.json`:

`supabase login` · `supabase link` · `supabase db push` · `supabase db pull` ·
`supabase db dump` · `supabase db reset` · `supabase migration up` ·
`supabase migration repair` · `psql` · `pg_dump` · `pg_restore`

Deny rules match command strings and are defence in depth, not a sandbox. The
governing rule is Engineering-OS §7: executing migrations and modifying
persistent state always require Founder approval.
