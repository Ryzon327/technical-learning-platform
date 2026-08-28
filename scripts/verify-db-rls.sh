#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# DB-RLS-1 — the authenticated database privilege contract.
#
# ## The bug this exists to make impossible
#
# PostgreSQL authorizes a statement in two layers. The base table privilege
# decides whether a role may ATTEMPT an operation; the row-level security policy
# decides which ROWS that operation may touch. Both must be present. Neither
# implies the other.
#
# This repository shipped 36 migrations that enabled RLS on all 61 tables and
# wrote 65 policies — and granted no table privilege to `authenticated` at all.
# Every learner read failed with SQLSTATE 42501 at the privilege layer, before
# any policy was consulted. The policies were correct the whole time and were
# never reached, so RLS had never actually been exercised.
#
# The failure was invisible in review precisely because `create policy ... TO
# authenticated` looks like a grant. It is not one.
#
# ## Why this gate derives instead of listing
#
# A hardcoded table list would be wrong the moment a table is added, and worse,
# it would let the two layers drift apart silently in the meantime. So this gate
# PARSES the migrations: it extracts every policy and every grant, computes the
# contract the policies imply, and compares it to the grants that actually
# exist. Both directions fail:
#
#   policy without grant  -> the 42501 bug, again
#   grant without policy  -> a privilege nothing authorizes rows for
#
# A future developer therefore cannot add one half of the pair.
#
# The parser is quote- and dollar-quote-aware, because the migrations contain
# PL/pgSQL function bodies full of semicolons that a naive split would shred.
# ============================================================

MIGRATIONS="supabase/migrations"
DOCS="docs/Engineering-OS/DATABASE_MIGRATION_WORKFLOW.md"

fail() { echo "GATE FAIL: $1"; exit 1; }

[ -d "$MIGRATIONS" ] || fail "MISSING: $MIGRATIONS"
[ -f "$DOCS" ] || fail "MISSING: $DOCS"

echo "===== DB-RLS-1 PRIVILEGE CONTRACT GATE ====="
echo ""

python3 - "$MIGRATIONS" <<'PYTHON'
import os, re, sys

migrations_dir = sys.argv[1]
failures = []

VERBS = ("select", "insert", "update", "delete")


def strip_and_split(sql: str):
    """Split SQL into statements, honouring quotes, dollar-quotes and comments.

    PL/pgSQL bodies are dollar-quoted and contain semicolons; splitting naively
    would produce nonsense fragments and silently lose statements.
    """
    statements, buf = [], []
    i, n = 0, len(sql)
    in_single = False
    dollar_tag = None

    while i < n:
        ch = sql[i]

        if dollar_tag:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
                continue
            buf.append(ch)
            i += 1
            continue

        if in_single:
            buf.append(ch)
            if ch == "'":
                in_single = False
            i += 1
            continue

        if ch == "'":
            in_single = True
            buf.append(ch)
            i += 1
            continue

        if ch == "-" and sql.startswith("--", i):
            while i < n and sql[i] != "\n":
                i += 1
            continue

        if ch == "$":
            match = re.match(r"\$[a-zA-Z_]*\$", sql[i:])
            if match:
                dollar_tag = match.group(0)
                buf.append(dollar_tag)
                i += len(dollar_tag)
                continue

        if ch == ";":
            statements.append("".join(buf))
            buf = []
            i += 1
            continue

        buf.append(ch)
        i += 1

    if "".join(buf).strip():
        statements.append("".join(buf))

    return [re.sub(r"\s+", " ", s).strip().lower() for s in statements if s.strip()]


# ------------------------------------------------------------------
# Parse every migration
# ------------------------------------------------------------------
policies = {}          # table -> {role -> set(verbs)}
table_grants = {}      # table -> {role -> set(verbs)}
schema_usage = {}      # schema -> set(roles)
function_grants = {}   # function signature -> set(roles)
function_revokes = {}  # function signature -> set(roles)
rls_tables = set()
blanket_grants = []
default_privileges = []

files = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))

for name in files:
    with open(os.path.join(migrations_dir, name), encoding="utf-8") as handle:
        raw = handle.read()

    for statement in strip_and_split(raw):
        # --- RLS enablement ---
        m = re.match(r"alter table (?:public\.)?(\w+) enable row level security", statement)
        if m:
            rls_tables.add(m.group(1))
            continue

        # --- policies ---
        if statement.startswith("create policy"):
            table_m = re.search(r"\bon (?:public\.)?(\w+)", statement)
            if not table_m:
                failures.append(f"{name}: could not parse the table of a policy")
                continue
            table = table_m.group(1)

            # Everything before USING / WITH CHECK is the policy header.
            cut = len(statement)
            for marker in (" using ", " using(", " with check ", " with check("):
                idx = statement.find(marker)
                if idx != -1:
                    cut = min(cut, idx)
            header = statement[:cut]

            verb_m = re.search(r"\bfor (select|insert|update|delete|all)\b", header)
            verb = verb_m.group(1) if verb_m else "all"
            verbs = set(VERBS) if verb == "all" else {verb}

            role_m = re.search(r"\bto ([a-z_ ,]+)$", header.strip())
            if role_m:
                roles = {r.strip() for r in role_m.group(1).split(",") if r.strip()}
            else:
                # No TO clause means PUBLIC, which includes authenticated.
                roles = {"public"}

            entry = policies.setdefault(table, {})
            for role in roles:
                entry.setdefault(role, set()).update(verbs)
            continue

        # --- grants ---
        if statement.startswith("grant "):
            if re.search(r"\bon all (tables|sequences|functions)\b", statement):
                blanket_grants.append(f"{name}: {statement[:90]}")
                continue

            m = re.match(r"grant usage on schema (\w+) to ([a-z_ ,]+)", statement)
            if m:
                roles = {r.strip() for r in m.group(2).split(",") if r.strip()}
                schema_usage.setdefault(m.group(1), set()).update(roles)
                continue

            m = re.match(r"grant execute on function (.+?) to ([a-z_ ,]+)$", statement)
            if m:
                sig = re.sub(r"\s+", "", m.group(1))
                roles = {r.strip() for r in m.group(2).split(",") if r.strip()}
                function_grants.setdefault(sig, set()).update(roles)
                continue

            m = re.match(
                r"grant ([a-z, ]+?) on (?:table )?(?:public\.)?(\w+) to ([a-z_ ,]+)$",
                statement,
            )
            if m:
                verbs = {v.strip() for v in m.group(1).split(",") if v.strip()}
                roles = {r.strip() for r in m.group(3).split(",") if r.strip()}
                entry = table_grants.setdefault(m.group(2), {})
                for role in roles:
                    entry.setdefault(role, set()).update(verbs)
                continue

            failures.append(f"{name}: unrecognised GRANT, refusing to guess: {statement[:90]}")
            continue

        # --- revokes on functions ---
        m = re.match(r"revoke all on function (.+?) from ([a-z_ ,]+)$", statement)
        if m:
            sig = re.sub(r"\s+", "", m.group(1))
            roles = {r.strip() for r in m.group(2).split(",") if r.strip()}
            function_revokes.setdefault(sig, set()).update(roles)
            continue

        if re.match(r"alter default privileges", statement):
            default_privileges.append(f"{name}: {statement[:90]}")
            continue

# ------------------------------------------------------------------
# Derive the contract the policies imply
# ------------------------------------------------------------------
expected = {}
for table, by_role in policies.items():
    verbs = set(by_role.get("authenticated", set()))
    if verbs:
        expected[table] = verbs

actual = {}
for table, by_role in table_grants.items():
    verbs = set(by_role.get("authenticated", set()))
    if verbs:
        actual[table] = verbs

server_only = sorted(rls_tables - set(expected))

print(f"parsed {len(files)} migrations")
print(f"  RLS-enabled tables:            {len(rls_tables)}")
print(f"  tables with an authenticated policy: {len(expected)}")
print(f"  server-only tables (no authenticated policy): {len(server_only)}")
print("")

# ------------------------------------------------------------------
# 1. Policy without grant — the original 42501 bug
# ------------------------------------------------------------------
for table in sorted(expected):
    missing = expected[table] - actual.get(table, set())
    if missing:
        failures.append(
            f"{table}: authenticated policy for {sorted(missing)} but no matching grant "
            f"— PostgreSQL rejects this with 42501 before RLS is consulted"
        )

# ------------------------------------------------------------------
# 2. Grant without policy, and 3. server-only tables
# ------------------------------------------------------------------
for table in sorted(actual):
    if table not in expected:
        failures.append(
            f"{table}: authenticated table privilege {sorted(actual[table])} with no "
            f"authenticated RLS policy — nothing would filter the rows"
        )
        continue
    extra = actual[table] - expected[table]
    if extra:
        failures.append(
            f"{table}: authenticated granted {sorted(extra)} beyond the verbs its "
            f"policies authorize {sorted(expected[table])}"
        )

for table in server_only:
    if table in actual:
        failures.append(
            f"{table}: server-only table received an authenticated privilege; "
            f"RLS-with-no-policy and the absent grant are two deliberate barriers"
        )

# ------------------------------------------------------------------
# 4/5. Blanket grants and default privileges
# ------------------------------------------------------------------
for entry in blanket_grants:
    failures.append(f"blanket grant is forbidden: {entry}")
for entry in default_privileges:
    failures.append(f"ALTER DEFAULT PRIVILEGES is forbidden: {entry}")

# ------------------------------------------------------------------
# 6. anon must receive nothing
# ------------------------------------------------------------------
for table, by_role in sorted(table_grants.items()):
    if by_role.get("anon"):
        failures.append(f"{table}: anon received a table privilege; no anonymous data contract exists")
    if by_role.get("public"):
        failures.append(f"{table}: PUBLIC received a table privilege, which includes anon")

for schema, roles in schema_usage.items():
    if "anon" in roles:
        failures.append(f"schema {schema}: USAGE granted to anon; no anonymous contract exists")

# ------------------------------------------------------------------
# 7. Privileged RPC restrictions unchanged
# ------------------------------------------------------------------
# Revoking from PUBLIC/anon and then granting to authenticated is the intended
# narrowing pattern, not a contradiction. Only granting back to a role the same
# statement set revoked from is a defect.
for sig, revoked_roles in sorted(function_revokes.items()):
    regranted = function_grants.get(sig, set()) & revoked_roles
    if regranted:
        failures.append(
            f"function {sig[:60]}: revoked from {sorted(revoked_roles)} then granted "
            f"back to {sorted(regranted)}"
        )

for sig, roles in sorted(function_grants.items()):
    if roles & {"anon", "public"}:
        failures.append(f"function {sig[:60]}: EXECUTE granted to anon/PUBLIC")

# Schema usage is required, or every table grant is inert.
if "authenticated" not in schema_usage.get("public", set()):
    failures.append(
        "no GRANT USAGE ON SCHEMA public TO authenticated — without it every table "
        "grant is inert and the 42501 returns"
    )

# ------------------------------------------------------------------
# Report
# ------------------------------------------------------------------
print("--- authenticated table privilege contract ---")
for table in sorted(expected):
    granted = sorted(actual.get(table, set()))
    policy_verbs = sorted(expected[table])
    mark = "ok " if set(granted) == set(policy_verbs) else "!! "
    print(f"  {mark}{table:<44} policy={','.join(policy_verbs):<28} grant={','.join(granted) or 'NONE'}")

print("")
print("--- server-only tables (must receive nothing) ---")
for table in server_only:
    state = "GRANTED" if table in actual else "none"
    print(f"  {'!! ' if table in actual else 'ok '}{table:<44} {state}")

print("")
if failures:
    print(f"--- {len(failures)} contract violation(s) ---")
    for entry in failures:
        print(f"  {entry}")
    sys.exit(1)

print("privilege contract is consistent: every policy has its grant, and no grant lacks a policy")
PYTHON

echo ""
echo "PASS:  1. the authenticated privilege contract agrees with the RLS policies"

# ------------------------------------------------------------
# 2. The existing migrations were not rewritten
# ------------------------------------------------------------
CHANGED_EXISTING="$(git diff --name-only origin/main...HEAD -- "$MIGRATIONS" 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
ADDED_MIGRATIONS="$(git diff --name-only --diff-filter=A origin/main...HEAD -- "$MIGRATIONS" 2>/dev/null | wc -l | tr -d ' ' || echo 0)"

[ "$CHANGED_EXISTING" = "$ADDED_MIGRATIONS" ] \
  || fail "an already-applied migration was modified; migrations are forward-only"

echo "PASS:  2. no already-applied migration was modified"

# ------------------------------------------------------------
# 3. The documented authorization contract exists
# ------------------------------------------------------------
grep -Fq 'Row-level security' "$DOCS" \
  || grep -Fq 'row-level security' "$DOCS" \
  || fail "the workflow document does not describe row-level security"
grep -Fq '42501' "$DOCS" \
  || fail "the workflow document does not record the 42501 failure mode"
grep -Fq 'RLS-enabled alone is not proof' "$DOCS" \
  || fail "the workflow document does not warn that RLS enablement is not proof of accessibility"
grep -Fq 'SQL Editor' "$DOCS" \
  || fail "the workflow document does not warn that elevated SQL cannot prove learner RLS"

echo "PASS:  3. the two-layer authorization contract is documented"

# ------------------------------------------------------------
# 4. The gate participates in the DEV-FLOW-2 workflow
# ------------------------------------------------------------
grep -Fq 'target="scripts/verify-${command_name}.sh"' scripts/run-gate.sh \
  || fail "run-gate.sh no longer resolves a bare verifier name"

for owned in supabase/migrations/20260814000100_authenticated_privilege_contract.sql \
             scripts/verify-db-rls.sh; do
  SELECTED="$(bash scripts/ci-select-gates.sh "$owned")"
  case "$SELECTED" in
    *scripts/verify-db-rls.sh*) ;;
    *) fail "$owned does not select this gate; it selected: $SELECTED" ;;
  esac
done

echo "PASS:  4. the gate resolves through the verifier namespace and owns its paths"

echo ""
echo "============================================================"
echo "DB-RLS-1 PRIVILEGE CONTRACT VERIFIED"
echo "Every table carrying an authenticated RLS policy holds exactly"
echo "the base privileges those policies justify, and no others."
echo "Server-only tables hold none. anon holds none. Blanket grants"
echo "and ALTER DEFAULT PRIVILEGES are rejected. The expectations are"
echo "parsed from the migrations, so a future policy without a grant —"
echo "or a grant without a policy — fails this gate."
echo ""
echo "This gate proves the CONTRACT IN THE REPOSITORY. It does NOT prove:"
echo "  - that the migration has been applied; nothing was executed"
echo "  - live RLS behaviour, which needs a real two-account learner test"
echo "============================================================"
