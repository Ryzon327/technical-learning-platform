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

- The **36 SQL files in `supabase/migrations/`** are the authoritative schema.
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

The CLI is **not** an npm dependency and is not vendored. Supabase does not
support installing it as a project dependency, so it is installed per machine.

On macOS, the supported method is Homebrew:

```
brew install supabase/tap/supabase
```

**No CLI version is pinned in this repository.** Pinning was considered and
rejected for now: it would require either a dependency change or a
version-manager mechanism, both outside DB-TOOLING-1's scope, for a tool that
one operator runs by hand a handful of times. If more than one operator starts
applying migrations, revisit it — that is the point at which drift becomes a
real risk rather than a theoretical one.

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

All 36 should now appear as applied both locally and remotely.

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
| `supabase migration list` | **36** migrations applied |
| `select count(*) from public.platform_schema_version;` | **35** — see the note below |
| `select count(*) from information_schema.tables where table_schema='public';` | **61** tables |
| `select count(*) from pg_policies where schemaname='public';` | **65** policies |
| `select count(*) from pg_tables where schemaname='public' and rowsecurity=false;` | **0** |
| `select count(*) from public.lab_provider_registry;` | **2** rows |

> **36 migrations, 35 schema-version rows — this is correct, not a failure.**
> Each migration registers one component row in
> `public.platform_schema_version`, except
> `20260813001000_certificate_correction_foundation.sql` (CERT-008), which
> registers none. An operator expecting 36 rows will read a correct migration as
> a broken one.

The `lab_provider_registry` rows are intended operational configuration seeded
by `20260812001300`: `mock` enabled, `container` **disabled**.

### 6.2 Real behaviour

The structural checks above prove the schema exists. These prove it *works*,
and they matter more, because **live PostgreSQL and RLS behaviour has never
been exercised by this project** — every RLS guarantee in the test suite is
proven against mocks.

1. **Auth trigger.** Sign up a user through the web app, then confirm a
   `public.user_profiles` row exists for them with `role = 'student'`. That
   proves the `on_auth_user_created` trigger on `auth.users` fired.
   This is the single most likely step to fail, because attaching a trigger to
   `auth.users` is a privileged operation.
2. **Learner RLS isolation.** Signed in as that learner, `select * from
   public.user_profiles` must return exactly one row — their own. With a second
   learner account, neither may see the other.

A failure in either is a genuine finding about live behaviour, not an operator
mistake. Report it precisely.

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
