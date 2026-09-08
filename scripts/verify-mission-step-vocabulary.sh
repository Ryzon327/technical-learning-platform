#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# MISSION-STEP-VOCAB-1 — the mission step vocabulary is defined twice and the
# two definitions agree.
#
# ## The failure this gate exists to prevent
#
# DEC-054 closed the mission step vocabulary. `20260831000100_mission_steps.sql`
# duplicated ONE part of that contract in SQL -- the `step_type` list -- and its
# own header explains why nothing else was duplicated:
#
#     "Reproducing that union in SQL is deliberately NOT attempted: it would be
#      a second definition of the same contract, and two definitions drift."
#
# The one duplicated part drifted. DEC-054 was amended to add `near_transfer`;
# `MISSION_STEP_TYPES`, the parser, the renderer and the authored curriculum all
# gained it, and no migration was written.
#
# The result was invisible to every existing gate, because each side was
# internally consistent. It surfaced only when a Founder ran the real
# publication, which wrote the learning path, the course, four modules, eight
# missions and Mission 1 steps 0 to 5, then failed at
# `m1-s7-try-a-different-network` on a CHECK violation the writer discarded.
#
# ## Why a dedicated gate rather than an entry in an existing one
#
# The invariant spans two directories that no single existing gate is woken for.
# `supabase/migrations/*` selects four database gates and none of them reads the
# shared types; `packages/shared-types/src/mission-steps*` selects four product
# gates and none of them reads the migrations. A gate that is not woken for half
# of what it checks is a gate that passes forever, which is precisely how this
# defect survived.
#
# ## What this gate does NOT prove
#
# It does not prove the migration has been applied. Nothing here executes SQL,
# contacts a database, or publishes anything. Applying the migration is a
# Founder action, and until it happens the DEPLOYED database still rejects
# `near_transfer`.
# ============================================================

MIGRATIONS="supabase/migrations"
REPAIR="$MIGRATIONS/20260907000100_mission_step_near_transfer.sql"
ORIGIN="$MIGRATIONS/20260831000100_mission_steps.sql"
TYPES="packages/shared-types/src/mission-steps.ts"
SUITE="services/api/src/mission-step-vocabulary.test.ts"

fail() { echo "GATE FAIL: $1"; exit 1; }

echo "===== MISSION-STEP-VOCAB-1 COMPLETION GATE ====="
echo ""

for p in "$REPAIR" "$ORIGIN" "$TYPES" "$SUITE"; do
  # `-f`, never `-x`. Every caller runs scripts with `bash`, so an execute-bit
  # test would let a mode accident skip a gate while still reporting success.
  [ -f "$p" ] || fail "MISSING: $p"
done
echo "PASS:  1. both vocabulary definitions and the comparison suite are present"

# ------------------------------------------------------------
# 2. The repair is FORWARD-ONLY
# ------------------------------------------------------------
# `20260831000100` has been applied to the development/UAT project and is frozen
# in scripts/migration-baseline.sha256. Editing it would desynchronise the
# repository from every environment that has already migrated, and no amount of
# correctness in the new text would undo that.
grep -Fq "'reference'" "$ORIGIN" \
  || fail "$ORIGIN no longer contains its original inline vocabulary; an applied migration was edited"
if grep -Fq "'near_transfer'" "$ORIGIN"; then
  fail "$ORIGIN was edited to add near_transfer; an applied migration must never be changed, the repair is a new file"
fi
echo "PASS:  2. the applied migration is unedited and the repair is a new file"

# ------------------------------------------------------------
# 3. The repair replaces the constraint rather than adding a second one
# ------------------------------------------------------------
# A bare `add constraint` would leave the original seven-value CHECK in place,
# and both must pass for a row to be written -- so publication would still fail,
# having cost another Founder migration run to find out.
grep -Fq 'drop constraint if exists mission_steps_step_type_check' "$REPAIR" \
  || fail "$REPAIR does not drop the existing constraint; a second CHECK would still reject near_transfer"
grep -Fq 'add constraint mission_steps_step_type_check' "$REPAIR" \
  || fail "$REPAIR does not re-add the constraint under its generated name"

# The migration asserts its own outcome. `drop constraint if exists` is a no-op
# when the name does not match, and without this the mismatch would be silent.
grep -Fq 'pg_get_constraintdef' "$REPAIR" \
  || fail "$REPAIR does not verify the outcome of its own drop; a name mismatch would fail silently"
grep -Fq 'raise exception' "$REPAIR" \
  || fail "$REPAIR introspects the constraint but raises nothing, so the check cannot fail the migration"
echo "PASS:  3. the repair replaces the constraint and asserts its own outcome"

# ------------------------------------------------------------
# 4. The repair changes NOTHING else about the table
# ------------------------------------------------------------
# Scope discipline, mechanically. A vocabulary repair that quietly altered the
# read policy, the grants, the ordering constraints or the payload check would
# reopen decisions this package has no authority over.
for forbidden in 'create table' 'drop table' 'create policy' 'drop policy' \
                 'enable row level security' 'grant ' 'revoke ' \
                 'add column' 'drop column' 'delete from' 'truncate' 'update public.'; do
  if grep -v '^[[:space:]]*--' "$REPAIR" | grep -Fqi -- "$forbidden"; then
    fail "$REPAIR contains '$forbidden'; this repair is one constraint and nothing else"
  fi
done
echo "PASS:  4. the repair touches no table, column, policy, grant or row"

# ------------------------------------------------------------
# 5. The repair is NOT frozen in the applied baseline
# ------------------------------------------------------------
# "A migration joins that list in the work package that follows its deployment,
# never in the one that authors it." Freezing it here would assert that a
# database has seen it, which no database has.
if grep -Fq '20260907000100' scripts/migration-baseline.sha256; then
  fail "the repair is already in scripts/migration-baseline.sha256, which claims it has been applied; it has not"
fi
echo "PASS:  5. the unapplied repair is not frozen as applied"

# ------------------------------------------------------------
# 6. The comparison is DERIVED, not declared
# ------------------------------------------------------------
# A third hand-maintained copy of the eight types would be a third thing to
# forget, and a suite carrying its own answer would pass while both real
# definitions were wrong.
grep -Fq 'MISSION_STEP_TYPES' "$SUITE" \
  || fail "$SUITE does not compare against the exported shared vocabulary"
grep -Fq 'readdirSync' "$SUITE" \
  || fail "$SUITE does not read the migration directory; it is not deriving the database vocabulary"
if grep -Eq "^[[:space:]]*(const|let)[[:space:]]+[A-Za-z_]*[Ee][Xx][Pp][Ee][Cc][Tt][Ee][Dd][A-Za-z_]*[[:space:]]*(:|=)[[:space:]]*\[" "$SUITE"; then
  fail "$SUITE declares its own expected vocabulary; the comparison must derive both sides"
fi
echo "PASS:  6. the suite derives both vocabularies instead of restating them"

# ------------------------------------------------------------
# 7. The comparison actually runs
# ------------------------------------------------------------
echo ""
echo "--- running the vocabulary comparison suite ---"
npm run test --workspace @tlp/api -- mission-step-vocabulary
echo ""
echo "PASS:  7. the derived database vocabulary equals MISSION_STEP_TYPES"

# ------------------------------------------------------------
# 8. The gate participates in the DEV-FLOW-2 workflow
# ------------------------------------------------------------
grep -Fq 'target="scripts/verify-${command_name}.sh"' scripts/run-gate.sh \
  || fail "run-gate.sh no longer resolves a bare verifier name; npm run gate -- mission-step-vocabulary would break"

# Every path this gate READS must wake it. Both sides of the invariant are
# listed deliberately: the defect this gate exists for was a change to one side
# with nothing watching the other.
for owned in "$REPAIR" "$ORIGIN" "$TYPES" "$SUITE" \
             services/api/src/curriculum-admin.ts \
             scripts/verify-mission-step-vocabulary.sh; do
  SELECTED="$(bash scripts/ci-select-gates.sh "$owned")"
  case "$SELECTED" in
    *scripts/verify-mission-step-vocabulary.sh*) ;;
    *) fail "$owned does not select this gate; it selected: $SELECTED" ;;
  esac
done
echo "PASS:  8. the gate resolves through the namespace and owns both sides of the contract"

echo ""
echo "============================================================"
echo "MISSION-STEP-VOCAB-1 STEP VOCABULARY CONTRACT VERIFIED"
echo "The mission_steps.step_type CHECK vocabulary, derived from"
echo "the migration sources in order, is exactly MISSION_STEP_TYPES."
echo "The repair is a new forward-only migration; the applied"
echo "20260831000100 is unedited, and the repair is not frozen in"
echo "the applied baseline."
echo ""
echo "This gate proves SOURCE AGREEMENT only. It does NOT prove:"
echo "  - that the repair has been applied; nothing was executed"
echo "  - that any curriculum has been published"
echo "  - live PostgreSQL constraint behaviour"
echo "Applying 20260907000100 is a Founder action."
echo "============================================================"
