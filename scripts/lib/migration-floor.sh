#!/usr/bin/env bash
# ============================================================
# CI-MIGRATION-GATE-1 — "this package changed no migration", stated durably.
#
# ## The defect this replaces
#
# Five gates asserted an EXACT migration count — `[ "$MIGRATION_COUNT" = "43" ]`
# — or a closed date window, `find … -name '2026090[3-9]*'` must be empty. Both
# say "the repository has exactly the migrations it had when I was written",
# which is true on the day a package lands and false forever after.
#
# `20260907000100_mission_step_near_transfer.sql` was a legitimate,
# architect-approved, forward-only migration. It broke Module 1, J1, J1.5, WP-I
# and WP-H, none of which it touches, and it broke them in a way whose failure
# text blamed the wrong package: "Module 1 adds none to 43".
#
# The repository had already ruled on this once. `verify-db-tooling.sh` section
# 8 removed its own version and recorded why:
#
#     "That was true of DB-TOOLING-1's own pull request and is not a durable
#      rule: DB-RLS-1 was authorized to add the privilege-contract migration,
#      and read literally the old check said no later package may ever add a
#      migration at all."
#
# ## What replaces it, and why this is not a weakening
#
# Two assertions, both of which the exact count could not make:
#
#   the applied set is UNMODIFIED   `shasum -c migration-baseline.sha256`.
#                                   A count cannot detect an edit. This can,
#                                   and it keeps holding as later authorized
#                                   migrations are added.
#
#   nothing was REMOVED             a floor. The count may grow; it may not
#                                   shrink below the frozen applied set.
#
# The floor is a LOWER BOUND, not the current count, and it is the same literal
# `verify-api-cors.sh` and the ROAS gates have carried unbroken through four
# later migrations. A floor goes stale only downward: it stays true as
# migrations are added and still fails when the directory is emptied.
#
# What is deliberately NOT asserted here is "this branch added no migration".
# That invariant is real and it has an owner: `verify-db-rls.sh` asserts every
# migration change is an ADDITION, which fails on a modified applied file on any
# branch rather than only on the branch that happened to be written first. A
# second, weaker copy here is exactly the drift `scripts/lib/` exists to stop.
#
# Usage, from a gate running at the repository root:
#
#   source scripts/lib/migration-floor.sh
#   migration_floor_check "Module 1"
# ============================================================

readonly MIGRATION_BASELINE="scripts/migration-baseline.sha256"
readonly MIGRATIONS_DIR="supabase/migrations"

# A LOWER BOUND, and deliberately not the current count.
#
# The same literal `verify-api-cors.sh` and the four ROAS gates have used since
# DB-SERVICE-ROLE-1, for the reason that made those gates survive four later
# migrations while these five broke: a floor only ever goes stale DOWNWARD. It
# stays true as migrations are added, and it keeps failing when the directory
# is emptied or truncated. An exact count is false the day after it is written.
#
# It is deliberately NOT derived from the baseline. A derived floor would be
# redundant with the checksum below — thirty-eight intact files already imply
# thirty-eight present files — so it could never fire, and a baseline truncated
# alongside the directory would lower the bar it was supposed to enforce. An
# independent constant is the only version of this check that can fail.
readonly MIGRATION_FLOOR=37

migration_floor_check() {
  local slice="$1"

  [ -f "$MIGRATION_BASELINE" ] || {
    echo "GATE FAIL: $slice cannot verify migrations: $MIGRATION_BASELINE is missing" >&2
    exit 1
  }

  [ -d "$MIGRATIONS_DIR" ] || {
    echo "GATE FAIL: $slice cannot verify migrations: $MIGRATIONS_DIR is missing" >&2
    exit 1
  }

  # Every APPLIED migration is byte-identical. This is the strong half, and the
  # half an exact count could never make: a count cannot detect an edit.
  shasum -a 256 -c "$MIGRATION_BASELINE" --quiet || {
    echo "GATE FAIL: a migration $slice was written against was modified" >&2
    exit 1
  }

  # Nothing was removed wholesale. Catches an emptied or truncated directory,
  # including the case where the baseline was emptied with it.
  local present
  present="$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"

  if [ "$present" -lt "$MIGRATION_FLOOR" ]; then
    echo "GATE FAIL: migrations were removed: $present present in $MIGRATIONS_DIR, at least $MIGRATION_FLOOR required" >&2
    exit 1
  fi
}
