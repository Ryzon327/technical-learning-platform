#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# WP-005 / Founder direction G-003 — THE one disposable-test-database guard.
#
# Every path that connects to the test database runs this first and connects
# only if it exits 0:
#
#   scripts/test-db-apply-migrations.sh            before its first psql
#   services/api/src/test-db-psql.ts               before the real-database
#                                                  tests' first psql
#
# It prints nothing on success, and "TEST-DB FAIL: ..." on stderr with a
# non-zero exit otherwise. It refuses unless:
#
#   TLP_TEST_DATABASE_DISPOSABLE  is exactly 1;
#   TLP_TEST_DATABASE_URL         is exactly
#                                 postgres[ql]://user[:password]@HOST:port/dbname
#                                 with HOST localhost or 127.0.0.1 — one host,
#                                 and no query string, fragment or other
#                                 parameter that could change where libpq
#                                 connects (host=, hostaddr=, service=, ...);
#   PGHOST                        is unset, localhost, 127.0.0.1, ::1 or a
#                                 single Unix-socket directory;
#   PGHOSTADDR                    is unset, 127.0.0.1 or ::1;
#   PGSERVICE, PGSERVICEFILE      are unset. A service entry can name any host,
#                                 so no value of either is accepted as local.
#
# Regression coverage: services/api/src/test-db-guard.test.ts.
# ============================================================

fail() { echo "TEST-DB FAIL: $1" >&2; exit 1; }

[ "${TLP_TEST_DATABASE_DISPOSABLE:-}" = "1" ] \
  || fail "TLP_TEST_DATABASE_DISPOSABLE=1 is required; only a throwaway database may be used"

URL="${TLP_TEST_DATABASE_URL:-}"
[ -n "$URL" ] || fail "TLP_TEST_DATABASE_URL is not set"

# The whole URL is matched, so nothing after the database name — a `?host=`,
# `?hostaddr=` or `?service=` that libpq would honour over the authority — and
# no second host (`localhost:5432,remote:5432`) can pass.
LOCAL_URL_RE='^postgres(ql)?://[A-Za-z0-9_.-]+(:[A-Za-z0-9_.~-]*)?@(localhost|127\.0\.0\.1):[0-9]+/[A-Za-z0-9_-]+$'
[[ "$URL" =~ $LOCAL_URL_RE ]] \
  || fail "refusing a database URL that is not exactly postgres://user@localhost:port/dbname (or 127.0.0.1), with no query parameters or extra hosts"

# libpq reads these when the URL does not set them: PGHOSTADDR overrides the
# network address of a URL that names localhost, and a service entry can set
# host or hostaddr the same way.
case "${PGHOST:-}" in
  "" | localhost | 127.0.0.1 | ::1) ;;
  /*,* | /*" "*) fail "refusing to run with PGHOST=$PGHOST; it names more than one destination" ;;
  /*) ;;
  *) fail "refusing to run with PGHOST=$PGHOST; it can redirect the connection away from localhost" ;;
esac
case "${PGHOSTADDR:-}" in
  "" | 127.0.0.1 | ::1) ;;
  *) fail "refusing to run with PGHOSTADDR=$PGHOSTADDR; it can redirect the connection away from localhost" ;;
esac
for var in PGSERVICE PGSERVICEFILE; do
  [ -z "${!var:-}" ] || fail "refusing to run with $var set; a service entry can redirect the connection away from localhost"
done
