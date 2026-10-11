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
# run unless:
#
#   TLP_TEST_DATABASE_URL         is exactly
#                                 postgres[ql]://user[:password]@HOST:port/dbname
#                                 with HOST localhost or 127.0.0.1 — one host,
#                                 and no query string, fragment or other
#                                 parameter that could change where libpq
#                                 connects (host=, hostaddr=, service=, ...),
#   no PGHOSTADDR, PGSERVICE or PGSERVICEFILE environment override is set,
#                                 and
#   TLP_TEST_DATABASE_DISPOSABLE  is exactly 1.
#
# Regression coverage: services/api/src/test-db-apply-migrations-guard.test.ts.
# ============================================================

fail() { echo "TEST-DB FAIL: $1" >&2; exit 1; }

URL="${TLP_TEST_DATABASE_URL:-}"
[ -n "$URL" ] || fail "TLP_TEST_DATABASE_URL is not set"
[ "${TLP_TEST_DATABASE_DISPOSABLE:-}" = "1" ] \
  || fail "TLP_TEST_DATABASE_DISPOSABLE=1 is required; this script only prepares a throwaway database"

# The whole URL is matched, so nothing after the database name — a `?host=`,
# `?hostaddr=` or `?service=` that libpq would honour over the authority — and
# no second host (`localhost:5432,remote:5432`) can pass.
LOCAL_URL_RE='^postgres(ql)?://[A-Za-z0-9_.-]+(:[A-Za-z0-9_.~-]*)?@(localhost|127\.0\.0\.1):[0-9]+/[A-Za-z0-9_-]+$'
[[ "$URL" =~ $LOCAL_URL_RE ]] \
  || fail "refusing a database URL that is not exactly postgres://user@localhost:port/dbname (or 127.0.0.1), with no query parameters or extra hosts"

# libpq reads these when the URL does not set them: PGHOSTADDR overrides the
# network address of a URL that names localhost, and a service entry can set
# hostaddr the same way.
for var in PGHOSTADDR PGSERVICE PGSERVICEFILE; do
  [ -z "${!var:-}" ] || fail "refusing to run with $var set; it can redirect the connection away from localhost"
done

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
