#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# DB-TOOLING-1 — Supabase migration tooling is reproducible and secret-free.
#
# ## What this gate is for
#
# The database readiness inspection found the repository able to migrate but the
# procedure undefined. This package defined it. The risk from here is drift of
# three kinds, and each section below targets one:
#
#   1. A secret or a project ref reaching a tracked file. `config.toml` is the
#      one new tracked file in the Supabase directory, so it is scanned
#      directly, and the gitignore rule that keeps the linked ref local is
#      pinned.
#
#   2. The documented mechanism quietly diverging from the decided one — the
#      documentation naming dashboard paste or psql as normal, or losing the
#      CLI as the standard path.
#
#   3. **The documented verification numbers going stale.** This is the subtle
#      one, and it is why sections 4 and 5 recompute the counts from the
#      migrations rather than hardcoding them. An operator who runs a correct
#      migration and reads a wrong expected number concludes the migration
#      failed. Deriving the numbers means a future migration cannot silently
#      falsify the documentation: it fails this gate until the docs are updated.
#
# ## What this gate deliberately does NOT assert
#
# It does not assert that the repository contains exactly 36 migrations. That
# number is correct today and will be wrong the moment a legitimate migration is
# added. `scripts/verify-roas4.sh` pins 36 as a phase-specific fact about ROAS-4,
# which is the right place for it; a long-lived tooling gate must not repeat it.
#
# Absence checks judge COMMENT-STRIPPED content where prose could legitimately
# discuss the thing being forbidden, and every scan greps a FILE rather than
# piping a variable — under `pipefail` an early match makes
# `echo "$VAR" | grep -q` return 141 from echo's SIGPIPE, which an absence check
# reads as clean.
# ============================================================

CONFIG="supabase/config.toml"
DOCS="docs/Engineering-OS/DATABASE_MIGRATION_WORKFLOW.md"
RUNBOOK="docs/Engineering-OS/ROAS_UAT_RUNBOOK.md"
DOCTOR="scripts/db-tooling-doctor.sh"
SETTINGS=".claude/settings.json"
MIGRATIONS="supabase/migrations"
SUPABASE_README="supabase/README.md"

fail() { echo "GATE FAIL: $1"; exit 1; }

for p in "$CONFIG" "$DOCS" "$RUNBOOK" "$DOCTOR" "$SETTINGS" "$SUPABASE_README"; do
  [ -f "$p" ] || fail "MISSING: $p"
done
[ -d "$MIGRATIONS" ] || fail "MISSING: $MIGRATIONS"

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

DOCTOR_LOGIC="$SCAN_DIR/doctor-logic.txt"
grep -vE '^\s*#' "$DOCTOR" > "$DOCTOR_LOGIC" || true
[ -s "$DOCTOR_LOGIC" ] || fail "the doctor script scanned empty"

echo "===== DB-TOOLING-1 COMPLETION GATE ====="
echo ""

# ------------------------------------------------------------
# 1. The CLI configuration is tracked, minimal and unbound
# ------------------------------------------------------------
git ls-files --error-unmatch "$CONFIG" >/dev/null 2>&1 \
  || fail "$CONFIG is not tracked; a fresh clone would not have it"

grep -Eq '^project_id[[:space:]]*=' "$CONFIG" \
  || fail "$CONFIG does not set project_id, which the CLI requires"

# The repository must not be bound to one remote project. `supabase link` writes
# the ref into supabase/.temp/, which must stay ignored.
#
# The check names a FILE inside the directory, not the directory itself. The
# .gitignore pattern ends in a slash, so it only matches a path git can classify
# as a directory — and `git check-ignore supabase/.temp` reports "not ignored"
# for a directory that does not exist yet, which is exactly the state of a fresh
# clone. Asking about the ref file is both correct and closer to the real risk.
if ! git check-ignore -q supabase/.temp/project-ref; then
  fail "supabase/.temp/ is not gitignored; linking would commit a remote project ref"
fi

# A Supabase project ref is 20 lowercase letters. None may appear here.
if grep -qE '\b[a-z]{20}\b' "$CONFIG"; then
  fail "$CONFIG contains a token shaped like a Supabase project ref"
fi
if grep -qE '[a-z]{20}\.supabase\.co' "$CONFIG"; then
  fail "$CONFIG names a specific Supabase project URL"
fi

echo "PASS:  1. the CLI configuration is tracked, sets project_id and names no project"

# ------------------------------------------------------------
# 2. No secret reached a tracked file
# ------------------------------------------------------------
# Assignment shapes and JWT values, not the bare words: this repository's
# documentation must be able to *discuss* passwords and service-role keys in
# order to tell an operator never to commit one.
for tracked in "$CONFIG" "$DOCS" "$RUNBOOK" "$DOCTOR" "$SUPABASE_README"; do
  if grep -qE 'eyJ[A-Za-z0-9_-]{20,}' "$tracked"; then
    fail "a JWT-shaped value appears in $tracked"
  fi
  if grep -qiE '(password|secret|token|apikey|api_key|service_role)[[:space:]]*[=:][[:space:]]*["'\''][^"'\'']{8,}' "$tracked"; then
    fail "a credential assignment appears in $tracked"
  fi
done

# The env files that legitimately hold keys must stay ignored.
for ignored in .env .env.local; do
  git check-ignore -q "$ignored" \
    || fail "$ignored is not gitignored; a key committed there would be public"
done

echo "PASS:  2. no credential value appears in any tracked tooling artifact"

# ------------------------------------------------------------
# 3. The documented mechanism is the decided mechanism
# ------------------------------------------------------------
grep -Fq 'supabase db push' "$DOCS" \
  || fail "the workflow document does not name supabase db push"
grep -Fq 'supabase link' "$DOCS" \
  || fail "the workflow document does not name supabase link"
grep -Fq 'supabase migration list' "$DOCS" \
  || fail "the workflow document does not require a preview before pushing"
grep -Fq 'standard migration mechanism' "$DOCS" \
  || fail "the workflow document does not state the CLI is the standard mechanism"

# The alternatives must be named AND rejected, not merely absent.
grep -Fq 'not** the normal path' "$DOCS" \
  || grep -Fq 'not the normal path' "$DOCS" \
  || fail "the workflow document does not reject dashboard SQL and psql as the normal path"
grep -Fiq 'psql' "$DOCS" \
  || fail "the workflow document does not address direct psql"
grep -Fq 'db reset' "$DOCS" \
  || fail "the workflow document does not warn that db reset is destructive"

# Secret handling, and the fact that a ref is not a secret.
grep -Fq 'interactive' "$DOCS" \
  || grep -Fq 'Interactive' "$DOCS" \
  || fail "the workflow document does not require the password to be entered interactively"
grep -Fq 'not a secret' "$DOCS" \
  || fail "the workflow document does not record that the project ref and URL are identifiers"

# The runbook must point at the workflow rather than leaving it ambiguous.
grep -Fq 'DATABASE_MIGRATION_WORKFLOW.md' "$RUNBOOK" \
  || fail "the UAT runbook does not reference the migration workflow document"
grep -Fq 'DATABASE_MIGRATION_WORKFLOW.md' "$SUPABASE_README" \
  || fail "supabase/README.md does not point at the migration workflow document"

echo "PASS:  3. the CLI is documented as standard and the alternatives are rejected"

# ------------------------------------------------------------
# 4. The documented verification numbers are DERIVED, not asserted
# ------------------------------------------------------------
# Recomputed from the migrations on every run. A future migration that adds a
# table or a policy makes the documentation wrong, and this fails until the
# documentation is corrected — which is the point.
TABLE_COUNT="$(grep -rho 'create table if not exists public\.' "$MIGRATIONS" | wc -l | tr -d ' ')"
POLICY_COUNT="$(grep -rho 'create policy' "$MIGRATIONS" | wc -l | tr -d ' ')"
RLS_COUNT="$(grep -rho 'enable row level security' "$MIGRATIONS" | wc -l | tr -d ' ')"
SCHEMA_VERSION_ROWS="$(grep -rl 'insert into public.platform_schema_version' "$MIGRATIONS" | wc -l | tr -d ' ')"

[ "$TABLE_COUNT" -gt "0" ] || fail "no tables were found in the migrations; the derivation is broken"
[ "$POLICY_COUNT" -gt "0" ] || fail "no policies were found in the migrations; the derivation is broken"

for doc in "$DOCS" "$RUNBOOK"; do
  grep -Fq "**$TABLE_COUNT**" "$doc" \
    || grep -Fq "| **$TABLE_COUNT** " "$doc" \
    || grep -Fq "$TABLE_COUNT" "$doc" \
    || fail "$doc does not state the derived table count ($TABLE_COUNT)"
  grep -Fq "$POLICY_COUNT" "$doc" \
    || fail "$doc does not state the derived policy count ($POLICY_COUNT)"
  grep -Fq "$SCHEMA_VERSION_ROWS" "$doc" \
    || fail "$doc does not state the derived schema-version row count ($SCHEMA_VERSION_ROWS)"
done

echo "       derived: $TABLE_COUNT tables, $POLICY_COUNT policies, $RLS_COUNT RLS statements, $SCHEMA_VERSION_ROWS schema-version rows"
echo "PASS:  4. the documented verification numbers match the migrations"

# ------------------------------------------------------------
# 5. The 36-versus-35 trap is called out explicitly
# ------------------------------------------------------------
MIGRATION_COUNT="$(find "$MIGRATIONS" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"

# Every table must have RLS. If that ever stops being true the documentation's
# "zero tables with RLS disabled" expectation becomes a lie.
[ "$RLS_COUNT" = "$TABLE_COUNT" ] \
  || fail "$RLS_COUNT RLS statements for $TABLE_COUNT tables; the documented 'zero tables with RLS disabled' is no longer true"

# The count of files differs from the count of registered components, and an
# operator who does not know that reads a correct migration as a failed one.
if [ "$SCHEMA_VERSION_ROWS" != "$MIGRATION_COUNT" ]; then
  for doc in "$DOCS" "$RUNBOOK"; do
    grep -Fq "CERT-008" "$doc" \
      || fail "$doc does not explain why $MIGRATION_COUNT migrations produce $SCHEMA_VERSION_ROWS schema-version rows"
  done
  grep -Fq "is correct" "$RUNBOOK" \
    || fail "the runbook does not tell the operator the lower row count is correct"
fi

echo "PASS:  5. $MIGRATION_COUNT migrations versus $SCHEMA_VERSION_ROWS component rows is explained"

# ------------------------------------------------------------
# 6. No helper wraps a Founder-gated command
# ------------------------------------------------------------
# The doctor must never execute the CLI at all — not even --version. That is
# what makes "running it cannot contact a remote project" true by construction
# rather than by intent.
# An invocation is `supabase` followed by whitespace and a subcommand OR a
# flag. Matching only a subcommand is not enough: `supabase --version` is still
# running the CLI, and a mutation adding exactly that survived an earlier
# version of this check that required `supabase [a-z]`.
#
# `command -v supabase` is the one permitted form and is filtered out by line,
# so detection stays possible while execution does not. Path mentions such as
# `supabase/config.toml` and `supabase/tap/supabase` never match, because a
# slash follows rather than whitespace.
CLI_LINES="$SCAN_DIR/doctor-cli-lines.txt"
CLI_INVOCATIONS="$SCAN_DIR/doctor-cli-invocations.txt"

grep -nE 'supabase[[:space:]]+[-a-z]' "$DOCTOR_LOGIC" > "$CLI_LINES" || true
grep -v 'command -v' "$CLI_LINES" > "$CLI_INVOCATIONS" || true

if [ -s "$CLI_INVOCATIONS" ]; then
  echo "the doctor script contains a CLI invocation:"
  cat "$CLI_INVOCATIONS"
  fail "the doctor script invokes the Supabase CLI; it must only detect it"
fi

for gated in 'db push' 'db reset' 'db pull' 'db dump' 'migration up' \
             'migration repair' 'login' 'link --project-ref' 'psql' 'pg_dump'; do
  if grep -qF -e "$gated" "$DOCTOR_LOGIC"; then
    fail "the doctor script references a Founder-gated command: $gated"
  fi
done

grep -Fq 'command -v supabase' "$DOCTOR" \
  || fail "the doctor script does not detect the CLI by presence alone"

echo "PASS:  6. the tooling helper is read-only and wraps no gated command"

# ------------------------------------------------------------
# 7. Remote-touching Supabase commands are Founder-gated
# ------------------------------------------------------------
# The readiness inspection found login and link ungated: they authenticate to
# and bind a remote project, which is a database connection by any reading.
for denied in 'supabase db push' 'supabase db reset' 'supabase db pull' \
              'supabase db dump' 'supabase migration up' \
              'supabase migration repair' 'supabase link' 'supabase login'; do
  grep -Fq -e "Bash($denied:*)" "$SETTINGS" \
    || fail "a remote-touching Supabase command is not denied to Claude Code: $denied"
done

# The workflow document must record the same list, or the boundary is only in
# a settings file nobody reads.
grep -Fq 'Founder-gated' "$DOCS" \
  || fail "the workflow document does not record what is Founder-gated"

echo "PASS:  7. every remote-touching Supabase command is denied and documented"

# ------------------------------------------------------------
# 8. Nothing was executed, and no scope was expanded
# ------------------------------------------------------------
CHANGED_MIGRATIONS="$(git diff --name-only origin/main...HEAD -- "$MIGRATIONS" 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_MIGRATIONS" = "0" ] \
  || fail "DB-TOOLING-1 changed $CHANGED_MIGRATIONS migration file(s); none is authorized"

CHANGED_LOCK="$(git diff --name-only origin/main...HEAD -- package-lock.json 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_LOCK" = "0" ] \
  || fail "the lockfile changed; no dependency change is authorized"

# The CLI installation approach is CONSISTENT with the documentation — it is not
# constrained to one approach forever.
#
# An earlier version of this gate failed outright if the CLI appeared as a
# project dependency, on the incorrect belief that Supabase does not support
# that. Supabase supports both a global install and a project-scoped dev
# dependency invoked through the package runner, and the project-scoped form is
# the supported way to pin a version. A gate that rejected it would have been a
# permanent architectural prohibition blocking a future approved move to a
# pinned project CLI — which is exactly what a long-lived gate must not do.
#
# What is durable is that the repository and its documentation agree about which
# approach is in force. Either is allowed; disagreeing about it is not.
# The documentation carries an explicit one-line declaration of the approach in
# force. Matching on that rather than on an incidental mention matters: an
# earlier version of this check looked for the string `npx supabase` anywhere in
# the document, and a mutation that removed it from the actual instructions
# survived, because the phrase still appeared in the paragraph explaining when
# to reconsider. Prose about an option is not the same as adopting it.
DECLARED_HOMEBREW='CLI installation in force: Homebrew'
DECLARED_DEPENDENCY='CLI installation in force: project dev dependency'

if grep -qE '"supabase"[[:space:]]*:' package.json services/api/package.json apps/web/package.json; then
  grep -Fq -e "$DECLARED_DEPENDENCY" "$DOCS" \
    || fail "the CLI is a project dependency, but the documentation still declares a different installation approach in force"
  grep -Fq 'npx supabase' "$DOCS" \
    || fail "the CLI is a project dependency, but the documentation never shows the package-runner invocation"
else
  grep -Fq -e "$DECLARED_HOMEBREW" "$DOCS" \
    || fail "the CLI is not a project dependency, but the documentation does not declare the per-machine approach in force"
  grep -Fq 'brew install supabase/tap/supabase' "$DOCS" \
    || fail "the CLI is not a project dependency, so the documentation must give a supported per-machine installation method"
fi

# Exactly one approach may be declared in force, or the declaration means nothing.
if grep -Fq -e "$DECLARED_HOMEBREW" "$DOCS" && grep -Fq -e "$DECLARED_DEPENDENCY" "$DOCS"; then
  fail "the documentation declares two installation approaches in force at once"
fi

# Both supported approaches must be described, so a future operator is not told
# that the one this phase did not choose is unavailable.
grep -Fq 'dev dependency' "$DOCS" \
  || fail "the documentation does not record that a project-scoped dev dependency is a supported installation approach"
grep -Fq 'pin' "$DOCS" \
  || fail "the documentation does not record that a project-scoped install is how the CLI version would be pinned"

# The lockfile check above is what enforces DB-TOOLING-1's own decision to add
# no dependency. It is scoped to this branch's diff and stops applying once
# merged, which is the correct lifetime for a work-package decision.

echo "PASS:  8. no migration or dependency was added, and the install approach matches the docs"

# ------------------------------------------------------------
# 9. The gate participates in the DEV-FLOW-2 workflow
# ------------------------------------------------------------
grep -Fq 'target="scripts/verify-${command_name}.sh"' scripts/run-gate.sh \
  || fail "run-gate.sh no longer resolves a bare verifier name; npm run gate -- db-tooling would break"

for owned in supabase/config.toml \
             docs/Engineering-OS/DATABASE_MIGRATION_WORKFLOW.md \
             scripts/db-tooling-doctor.sh \
             scripts/verify-db-tooling.sh; do
  SELECTED="$(bash scripts/ci-select-gates.sh "$owned")"
  case "$SELECTED" in
    *scripts/verify-db-tooling.sh*) ;;
    *) fail "$owned does not select this gate; it selected: $SELECTED" ;;
  esac
done

echo "PASS:  9. the gate resolves through the verifier namespace and owns its paths"

# ------------------------------------------------------------
# 10. The doctor actually runs, and is honest when the CLI is absent
# ------------------------------------------------------------
echo ""
echo "--- running the read-only tooling doctor ---"
bash "$DOCTOR"

echo ""
echo "============================================================"
echo "DB-TOOLING-1 SUPABASE MIGRATION TOOLING VERIFIED"
echo "supabase/config.toml is tracked, minimal, and names no project."
echo "The Supabase CLI is documented as the standard migration"
echo "mechanism; dashboard SQL and psql are explicitly rejected as"
echo "the normal path. The documented verification numbers are"
echo "derived from the migrations on every run, so they cannot go"
echo "stale silently. login, link, db push, db pull, db dump,"
echo "db reset, migration up and migration repair are all denied to"
echo "Claude Code."
echo ""
echo "This gate proves TOOLING READINESS only. It does NOT prove:"
echo "  - that any migration has been applied; nothing was executed"
echo "  - that the CLI accepts this config; the CLI is not installed"
echo "  - live PostgreSQL, Auth-trigger or RLS behaviour"
echo "============================================================"
