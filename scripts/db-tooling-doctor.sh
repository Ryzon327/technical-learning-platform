#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# DB-TOOLING-1 — read-only Supabase tooling readiness check.
#
# ## What this is
#
# The equivalent of `scripts/local-health-check.sh` for database tooling: it
# answers "is this machine ready to apply migrations, and if not, what is
# missing" without doing anything about it.
#
# ## What it deliberately does not do
#
# It **never invokes the Supabase CLI at all** — not even `supabase --version`.
# Detection is `command -v` only. That is a deliberate constraint: it guarantees
# by construction that running this script cannot contact a remote project,
# cannot read stored credentials, and cannot trigger a CLI update check.
#
# It performs no mutation, wraps no Founder-gated command, and offers no
# shortcut to `login`, `link`, `db push`, `db reset` or `migration up`. Those
# are Founder actions and stay that way; this script only tells you whether you
# are ready to perform them, and points at the documentation that says how.
#
# Exit status is 0 whenever the repository side is sound, even if the CLI is not
# installed — a missing CLI is a normal state for a contributor who never
# touches the database, and must not fail anyone's local health run.
# ============================================================

DOCS="docs/Engineering-OS/DATABASE_MIGRATION_WORKFLOW.md"
CONFIG="supabase/config.toml"
MIGRATIONS_DIR="supabase/migrations"

echo "===== SUPABASE TOOLING DOCTOR (read-only) ====="
echo ""

repository_ready=1

# --- repository side -------------------------------------------------
if [ -f "$CONFIG" ]; then
  echo "PASS: $CONFIG is present"
else
  echo "FAIL: $CONFIG is missing; the CLI needs it to recognise this project"
  repository_ready=0
fi

if [ -f "$DOCS" ]; then
  echo "PASS: $DOCS is present"
else
  echo "FAIL: $DOCS is missing"
  repository_ready=0
fi

if [ -d "$MIGRATIONS_DIR" ]; then
  MIGRATION_COUNT="$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
  echo "PASS: $MIGRATION_COUNT migration file(s) in $MIGRATIONS_DIR"
else
  echo "FAIL: $MIGRATIONS_DIR is missing"
  repository_ready=0
fi

# The remote project ref belongs in gitignored local state, never in a commit.
# A file inside the directory is asked about rather than the directory itself:
# the ignore pattern ends in a slash, so it matches only a path git can classify
# as a directory, and the directory does not exist in a fresh clone.
if git check-ignore -q supabase/.temp/project-ref 2>/dev/null; then
  echo "PASS: supabase/.temp/ is gitignored, so a linked project ref stays local"
else
  echo "FAIL: supabase/.temp/ is not gitignored; linking could commit a project ref"
  repository_ready=0
fi

echo ""

# --- machine side ----------------------------------------------------
# `command -v` only. The CLI is never executed here; see the header.
if command -v supabase >/dev/null 2>&1; then
  echo "PASS: the Supabase CLI is installed on this machine"
  echo "      (version intentionally not queried; this script never runs the CLI)"
else
  echo "INFO: the Supabase CLI is not installed on this machine."
  echo "      That is fine unless you are about to apply migrations."
  echo "      macOS: brew install supabase/tap/supabase"
fi

# Linked state is detected by looking for the CLI's local directory, not by
# asking the CLI — so this stays offline and reads no credential.
if [ -d "supabase/.temp" ]; then
  echo "INFO: supabase/.temp exists, so this checkout has been linked before."
else
  echo "INFO: this checkout is not linked to any Supabase project."
fi

echo ""
echo "Next steps, and every secret rule, are in:"
echo "  $DOCS"
echo ""
echo "Applying migrations is a Founder action. This script does not do it, and"
echo "deliberately provides no shortcut to any command that would."

if [ "$repository_ready" = "1" ]; then
  echo ""
  echo "Repository tooling state: OK"
  exit 0
fi

echo ""
echo "Repository tooling state: INCOMPLETE"
exit 1
