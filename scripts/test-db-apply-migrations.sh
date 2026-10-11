#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# WP-005 / Founder direction G-001 — prepare a DISPOSABLE test database.
#
# Applies the Supabase platform shim, then every migration in
# supabase/migrations in filename order, each in its own transaction, exactly
# as written. Used by CI before the real-database integration tests
# (`services/api/src/curriculum-step-search.db.test.ts`).
#
# This is NOT the project's migration workflow and must never be pointed at a
# Supabase project. Applying migrations to a real database remains a Founder
# gate (docs/Engineering-OS/DATABASE_MIGRATION_WORKFLOW.md). So it refuses to
# run unless the shared disposable-test-database guard,
# scripts/test-db-guard.sh, accepts TLP_TEST_DATABASE_URL,
# TLP_TEST_DATABASE_DISPOSABLE and the libpq environment (Founder direction
# G-003). The real-database tests run the same guard.
#
# Regression coverage: services/api/src/test-db-apply-migrations-guard.test.ts
# and services/api/src/test-db-guard.test.ts.
# ============================================================

fail() { echo "TEST-DB FAIL: $1" >&2; exit 1; }

bash scripts/test-db-guard.sh
URL="$TLP_TEST_DATABASE_URL"

command -v psql >/dev/null || fail "psql is not installed"

psql "$URL" -X -q -v ON_ERROR_STOP=1 -f scripts/test-db/supabase-platform-shim.sql
echo "applied: scripts/test-db/supabase-platform-shim.sql"

count=0
for migration in supabase/migrations/*.sql; do
  psql "$URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$migration"
  echo "applied: $migration"
  count=$((count + 1))
done

[ "$count" -gt 0 ] || fail "no migrations were found"
echo "TEST-DB READY: $count migrations applied to a disposable local database"
