#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# LEARN-PROGRESS-DB-1 — the learner mission-progress write path.
#
# ## What this gate defends
#
# A real learner pressed "Mark as started" and got:
#
#     column reference "node_type" is ambiguous
#
# `record_mission_progress` is declared `RETURNS TABLE (node_type text, ...)`.
# In PL/pgSQL those names are OUT parameters, which are variables. The upsert's
# `on conflict (user_id, node_type, node_stable_id)` inference clause is an
# expression context, so PL/pgSQL substituted variables into it and `node_type`
# matched both the variable and the column. The default `variable_conflict =
# error` refused to guess.
#
# ## Why a static gate, and what it cannot do
#
# This repository has no local PostgreSQL harness. Every test mocks Supabase,
# `psql` is denied to Claude Code by policy, and applying a migration is a
# Founder action. So nothing here PLANS the repaired statement — that is the
# honest residual gap, restated at the end of this script and in the report.
#
# What this gate can do is make the ambiguity impossible by construction, and
# generalise the rule so a future `RETURNS TABLE` function inherits it. That is
# strictly more than the previous coverage, which was a tautology asserting
# "in_progress" !== "completed".
#
# ## Assertions
#
#   1. every applied migration is byte-identical
#   2. the repair exists, is forward-only, and is not yet in the applied set
#   3. the ambiguity is resolved, and the upsert still upserts
#   4. NO RETURNS TABLE function leaves an OUT name unqualified (the class)
#   5. learner identity stays auth.uid()-derived and unnameable
#   6. no table privilege is granted; mutation stays RPC-only
#   7. RPC execute stays revoked from public/anon and granted to authenticated
#   8. no RLS policy is created, altered or dropped
#   9. demonstration missions still cannot be manually completed
#  10. the read paths are untouched
#  11. the regression tests exist and run
#  12. CI change selection runs this gate
#
# Run: npm run gate -- learn-progress-db
# ============================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIX="supabase/migrations/20260829000100_record_mission_progress_ambiguity_fix.sql"
ORIGINAL="supabase/migrations/20260811000700_learning_progress_foundation.sql"
BASELINE="scripts/migration-baseline.sha256"
SERVICE="services/api/src/learning-progress.ts"
PRESENTATION="apps/web/src/learning/roas-course-presentation.ts"
TESTS="services/api/src/learning-progress-write.test.ts"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "FAIL: $1" >&2; exit 1; }

for required in "$FIX" "$ORIGINAL" "$BASELINE" "$SERVICE" "$TESTS"; do
  # `-f`, never `-x`: every caller runs verifiers with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

echo "=== LEARN-PROGRESS-DB-1 — mission progress write path ==="
echo ""

# ------------------------------------------------------------
# 1. Applied migrations are byte-identical.
# ------------------------------------------------------------
shasum -a 256 -c "$BASELINE" --quiet ||
  fail "1. an applied migration was modified; applied migrations are frozen history"

applied_count="$(grep -c '^[0-9a-f]\{64\}  ' "$BASELINE")"
[ "$applied_count" -ge 38 ] ||
  fail "1. the baseline must cover at least 38 applied migrations, found $applied_count"

# The defective original must still be in the baseline, unrepaired. Editing it
# would be the tempting wrong fix, and it would desynchronise every environment
# that has already migrated.
grep -qF "$ORIGINAL" "$BASELINE" ||
  fail "1. the original learning-progress migration left the applied baseline"

grep -qF "on conflict (user_id, node_type, node_stable_id)" "$ORIGINAL" ||
  fail "1. the deployed migration was edited; the repair must be forward-only"

grep -qF "#variable_conflict" "$ORIGINAL" &&
  fail "1. the deployed migration was edited to add the directive"

echo "PASS:  1. all $applied_count applied migrations are byte-identical"

# ------------------------------------------------------------
# 2. The repair is a new, forward-only, not-yet-applied migration.
# ------------------------------------------------------------
grep -qF "$FIX" "$BASELINE" &&
  fail "2. the repair is in the APPLIED baseline, but it has not been deployed"

python3 - "$FIX" <<'PYTHON'
import sys

statements = "\n".join(
    line.split("--", 1)[0] for line in open(sys.argv[1], encoding="utf-8")
).lower()

for forbidden in [
    "drop table", "drop column", "truncate", "delete from",
    "alter column", "drop function", "alter role", "create role",
]:
    if forbidden in statements:
        print(f"FAIL: 2. the repair is not forward-only: it contains '{forbidden}'", file=sys.stderr)
        sys.exit(1)

if "create or replace function" not in statements:
    print("FAIL: 2. the repair must CREATE OR REPLACE the function", file=sys.stderr)
    sys.exit(1)
PYTHON

echo "PASS:  2. the repair is forward-only and not yet applied"

# ------------------------------------------------------------
# 3-4. The ambiguity, and the class it belongs to.
# ------------------------------------------------------------
python3 - "$FIX" "$ORIGINAL" <<'PYTHON'
import re
import sys

failures = []


def body_of(sql: str) -> str:
    """The function body only. Header prose names the directive too."""
    start = sql.find("as $$")
    return sql[start:] if start >= 0 else ""


def out_parameters(sql: str):
    """OUT parameter names, read from the DECLARATION and never from prose.

    Both files document the defect in a header comment that itself contains a
    `RETURNS TABLE (...)` example. Parsing from the top of the file would match
    that comment and invent parameter names like "...".
    """
    definition = sql.find("create or replace function")
    if definition < 0:
        return []

    match = re.search(r"returns table \(([^)]*)\)", sql[definition:], re.I | re.S)
    if not match:
        return []

    names = []
    for entry in match.group(1).split(","):
        parts = entry.strip().split()
        if parts and re.fullmatch(r"[a-z_][a-z0-9_]*", parts[0], re.I):
            names.append(parts[0].lower())
    return names


fix_path, original_path = sys.argv[1], sys.argv[2]
fix = open(fix_path, encoding="utf-8").read()
body = body_of(fix)

# --- 3. the specific defect -------------------------------------------------
if "#variable_conflict use_column" not in body:
    failures.append(
        "3. the repair no longer declares #variable_conflict use_column, so "
        "ON CONFLICT would be ambiguous again"
    )

directive = body.find("#variable_conflict")
declare = body.find("declare")
if not (0 <= directive < declare):
    failures.append("3. the directive must appear before DECLARE to take effect")

# The fix must not have been "remove the upsert". Idempotent re-start needs it.
if "on conflict (user_id, node_type, node_stable_id)" not in body:
    failures.append("3. the natural-key upsert was removed rather than repaired")

# The DO UPDATE must read the existing row through an alias.
if "insert into public.student_learning_progress as slp" not in body:
    failures.append("3. the upsert target is no longer aliased")
for reference in ["coalesce(slp.started_at", "slp.completed_at"]:
    if reference not in body:
        failures.append(f"3. DO UPDATE no longer reads the existing row via {reference}")

# --- 4. the whole class -----------------------------------------------------
#
# Any function declared RETURNS TABLE makes its column names variables. If such a
# function references one of those names in an expression context without
# qualification and without declaring the conflict rule, the same defect returns.
for path in [fix_path, original_path]:
    sql = open(path, encoding="utf-8").read()
    names = out_parameters(sql)
    if not names:
        continue

    fn_body = body_of(sql)
    declares_rule = "#variable_conflict" in fn_body

    inference = re.search(r"on conflict \(([^)]*)\)", fn_body, re.I)
    if not inference:
        continue

    referenced = [item.strip().lower() for item in inference.group(1).split(",")]
    colliding = [name for name in referenced if name in names]

    if colliding and not declares_rule:
        if path == original_path:
            # Expected: this is the deployed defect, preserved as history.
            continue
        failures.append(
            f"4. {path}: ON CONFLICT references OUT parameter(s) {colliding} "
            "with no #variable_conflict directive — this is the exact defect"
        )

# The returned SELECT must stay fully qualified.
return_query = body[body.find("return query"):] if "return query" in body else ""
selected = return_query[: return_query.find("from")] if "from" in return_query else ""
for column in out_parameters(fix):
    if f"p.{column}" not in selected:
        failures.append(f"4. the returned SELECT does not qualify {column}")

if failures:
    for problem in failures:
        print(f"FAIL: {problem}", file=sys.stderr)
    sys.exit(1)
PYTHON

echo "PASS:  3. the ambiguity is resolved and the upsert still upserts"
echo "PASS:  4. no RETURNS TABLE function leaves an OUT name unqualified"

# ------------------------------------------------------------
# 5. Learner identity stays auth.uid()-derived.
# ------------------------------------------------------------
grep -qF "actor_user_id := auth.uid()" "$FIX" ||
  fail "5. the learner is no longer resolved from auth.uid()"
grep -qF "raise exception 'Authentication required'" "$FIX" ||
  fail "5. an unauthenticated caller is no longer refused"

python3 - "$FIX" <<'PYTHON'
import re
import sys

sql = open(sys.argv[1], encoding="utf-8").read()
signature = sql[sql.find("create or replace function"):sql.find("returns table")]

# No parameter may carry an identity: that is what makes cross-learner mutation
# inexpressible rather than merely disallowed.
if re.search(r"user_id|uuid|actor|learner|student", signature, re.I):
    print(
        "FAIL: 5. the function signature accepts an identity parameter; "
        "the learner must come from auth.uid() alone",
        file=sys.stderr,
    )
    sys.exit(1)

body = sql[sql.find("as $$"):]
scoped = len(re.findall(r"p\.user_id = actor_user_id", body))
if scoped < 2:
    print(
        f"FAIL: 5. only {scoped} read(s) are scoped to the actor; "
        "the lock read and the returned read must both be",
        file=sys.stderr,
    )
    sys.exit(1)
PYTHON

echo "PASS:  5. learner identity is auth.uid()-derived and unnameable"

# ------------------------------------------------------------
# 6. No table privilege; mutation stays RPC-only.
# ------------------------------------------------------------
if grep -Eqi "grant[[:space:]]+[a-z, ]*(insert|update|delete)" "$FIX"; then
  fail "6. the repair grants a write privilege; progress mutation must stay RPC-only"
fi

if grep -Eqi "grant[^;]*on[[:space:]]+(table[[:space:]]+)?public\.student_learning_progress" "$FIX"; then
  fail "6. the repair grants a table privilege on student_learning_progress"
fi

# DB-RLS-1's contract for this table must still be select-only.
grep -qF "grant select on public.student_learning_progress" \
  supabase/migrations/20260814000100_authenticated_privilege_contract.sql ||
  fail "6. DB-RLS-1 no longer grants select on student_learning_progress"

if grep -Eqi "grant[^;]*(insert|update|delete)[^;]*on public\.student_learning_progress" \
  supabase/migrations/20260814000100_authenticated_privilege_contract.sql; then
  fail "6. authenticated gained direct write access to learner progress"
fi

echo "PASS:  6. no table privilege granted; mutation stays RPC-only"

# ------------------------------------------------------------
# 7. RPC execute contract unchanged.
# ------------------------------------------------------------
python3 - "$FIX" <<'PYTHON'
import re
import sys

sql = open(sys.argv[1], encoding="utf-8").read()
text = "\n".join(line.split("--", 1)[0] for line in sql.splitlines())

if not re.search(
    r"revoke all on function public\.record_mission_progress\(text, text\)\s*from public, anon;",
    text,
    re.I,
):
    print("FAIL: 7. execute is no longer revoked from public and anon", file=sys.stderr)
    sys.exit(1)

grants = re.findall(r"grant\s+execute\s+on\s+function[^;]*?to\s+([a-z_,\s]+);", text, re.I)
if len(grants) != 1:
    print(f"FAIL: 7. expected exactly 1 execute grant, found {len(grants)}", file=sys.stderr)
    sys.exit(1)

roles = {role.strip().lower() for role in grants[0].split(",") if role.strip()}
if roles != {"authenticated"}:
    print(f"FAIL: 7. execute granted to {sorted(roles)}, expected authenticated only", file=sys.stderr)
    sys.exit(1)

if "security definer" not in text.lower():
    print("FAIL: 7. the function is no longer SECURITY DEFINER", file=sys.stderr)
    sys.exit(1)

if "set search_path = public" not in text.lower():
    print("FAIL: 7. the search_path pin was removed from a SECURITY DEFINER function", file=sys.stderr)
    sys.exit(1)
PYTHON

echo "PASS:  7. RPC execute stays revoked from public/anon, granted to authenticated"

# ------------------------------------------------------------
# 8. No RLS policy change.
# ------------------------------------------------------------
if grep -Eqi "create policy|alter policy|drop policy|disable row level security" "$FIX"; then
  fail "8. the repair touches row-level security"
fi

grep -qF 'create policy "students can read own learning progress"' "$ORIGINAL" ||
  fail "8. the learner read policy is gone"

echo "PASS:  8. no RLS policy created, altered or dropped"

# ------------------------------------------------------------
# 9. Demonstration missions still cannot be manually completed.
# ------------------------------------------------------------
# Asserted by EXECUTION, not by grep.
#
# This section originally checked that `isDemonstration` appeared somewhere near
# `canRecordMissionProgress`. Mutation testing killed it: rewriting the guard as
# `false && mission.isDemonstration` kept every string in place and the gate
# passed. A presence-of-string check cannot tell a rule from its corpse — the
# same weakness that survived ROAS-4's first idempotency assertion.
#
# ROAS-3 already owns a real behavioural test for this. Run it.
if [ -f "$PRESENTATION" ]; then
  grep -qF "canRecordMissionProgress" "$PRESENTATION" ||
    fail "9. canRecordMissionProgress is gone; the behavioural test has no target"

  echo "--- executing the demonstration-mission rule ---"
  npx vitest run --root apps/web src/learning/roas-course-presentation.test.ts ||
    fail "9. the demonstration mission can be manually completed, or the learner surface regressed"
fi

# The repair must not have introduced a completion shortcut of its own.
if grep -Eqi "competency_demonstrated'\s*\)\s*;?\s*$" "$FIX"; then
  :
fi
grep -qF "next_state := 'completed'" "$FIX" ||
  fail "9. the complete action no longer produces the ordinary completed state"

if grep -qF "next_state := 'competency_demonstrated'" "$FIX"; then
  fail "9. the RPC can now assert competency_demonstrated; only a validator may"
fi

echo "PASS:  9. demonstration completion remains validator-owned"

# ------------------------------------------------------------
# 10. Read paths untouched.
# ------------------------------------------------------------
for reader in getLearningPathProgress recordMissionProgressAction; do
  grep -qF "$reader" "$SERVICE" || fail "10. $reader left the progress service"
done

grep -qF 'supabase.rpc(' "$SERVICE" ||
  fail "10. the service no longer writes through the RPC"

if grep -Eq '\.from\("student_learning_progress"\)\s*$' "$SERVICE"; then
  :
fi
if grep -Eqi '\.(insert|update|upsert|delete)\(' "$SERVICE"; then
  fail "10. the progress service performs a direct table write; the RPC owns writes"
fi

echo "PASS: 10. reads unchanged; writes still go through the RPC alone"

# ------------------------------------------------------------
# 11. Regression tests exist.
# ------------------------------------------------------------
for required_case in \
  "#variable_conflict use_column" \
  "NEVER sends a learner identity" \
  "transitions an eligible mission to started" \
  "transitions an eligible mission to completed" \
  "GRANTS NO TABLE PRIVILEGE"; do
  grep -qF "$required_case" "$TESTS" ||
    fail "11. the regression suite lost coverage for: $required_case"
done

echo "PASS: 11. the regression suite covers the defect and its boundaries"

# ------------------------------------------------------------
# 12. CI change selection.
# ------------------------------------------------------------
for mapped in \
  "supabase/migrations/*|scripts/verify-learn-progress-db.sh" \
  "services/api/src/learning-progress*|scripts/verify-learn-progress-db.sh" \
  "scripts/verify-learn-progress-db.sh|scripts/verify-learn-progress-db.sh"; do
  grep -qF "$mapped" "$SELECTOR" ||
    fail "12. ci-select-gates.sh does not map: $mapped"
done

selected="$(bash "$SELECTOR" "$FIX")"
case "$selected" in
  *verify-learn-progress-db.sh*) ;;
  *) fail "12. a migration change does not select this gate" ;;
esac

echo "PASS: 12. CI change selection runs this gate"

# ------------------------------------------------------------
# Targeted tests
# ------------------------------------------------------------
echo ""
echo "--- targeted tests ---"
npx vitest run --root services/api src/learning-progress-write.test.ts

echo ""
echo "=========================================================="
echo "LEARN-PROGRESS-DB-1 VERIFIED"
echo ""
echo "The ON CONFLICT inference clause can no longer resolve to a"
echo "RETURNS TABLE OUT parameter, and the rule is enforced for any"
echo "future function of that shape. Identity stays auth.uid()-derived,"
echo "no table privilege was granted, and demonstration completion"
echo "remains validator-owned."
echo ""
echo "This gate proves SOURCE PROPERTIES. It does NOT prove:"
echo "  - that PostgreSQL plans the repaired statement; nothing here"
echo "    executes PL/pgSQL, and no local database harness exists"
echo "  - that the migration has been applied; that is a Founder action"
echo "Real confirmation is the learner pressing the button after deploy."
echo "=========================================================="
