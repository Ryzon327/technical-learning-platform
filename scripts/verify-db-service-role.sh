#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# DB-SERVICE-ROLE-1 — the privileged server/admin database contract.
#
# ## What this gate is defending
#
# `service_role` has the `bypassrls` attribute. No policy will ever filter a row
# for it, so unlike the `authenticated` contract there is no second barrier:
#
#     the GRANT itself is the entire security boundary.
#
# That inverts how the check has to work. `verify-db-rls.sh` can derive the
# expected `authenticated` grants FROM the RLS policies and prove the two agree,
# because a policy exists for every table that role may touch. `service_role` has
# no policies to derive anything from — which is precisely why the missing
# privileges went unnoticed until real UAT: a policy-derived gate is structurally
# incapable of noticing them.
#
# So this gate carries an EXPLICIT allowlist. Every table/verb pair below was
# derived by reading the approved implementation, and the gate fails on any
# grant that is not in it — in either direction. Adding a verb requires editing
# this file, which is the review step that a blanket grant would have skipped.
#
# ## Assertions
#
#   1.  the pre-existing 37 migrations are byte-identical
#   2.  exactly one new forward-only migration, and it is the last one
#   3.  service_role receives exactly the approved table privileges
#   4.  no blanket ALL TABLES grant, no ALTER DEFAULT PRIVILEGES
#   5.  no anon or PUBLIC privilege broadening
#   6.  no authenticated privilege broadening
#   7.  the publication RPC EXECUTE grant exists, for service_role only
#   8.  forbidden roles still cannot execute the publication RPC
#   9.  service-role credential validation exists and fails closed
#   10. admin diagnostics preserve the database error code and message
#   11. no diagnostic path can print a credential
#   12. the publication command does not print the full Supabase URL
#   13. 31 mission-competency links remain the authored truth
#   14. publication still refuses production and demands exact confirmation
#   15. dry run still performs zero database writes
#   16. no learner progress, evidence or competency state is written
#   17. lab publication remains excluded
#   18. CI change selection runs this gate
#
# Run: npm run gate -- db-service-role
# ============================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MIGRATION="supabase/migrations/20260828000100_service_role_privilege_contract.sql"
BASELINE="scripts/migration-baseline.sha256"
BOOTSTRAP="packages/shared-types/src/roas-bootstrap.ts"
PUBLISH="services/api/src/admin/publish-roas-curriculum.ts"
DIAGNOSTICS="services/api/src/db-diagnostics.ts"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "FAIL: $1" >&2; exit 1; }

for required in "$MIGRATION" "$BASELINE" "$BOOTSTRAP" "$PUBLISH" "$DIAGNOSTICS"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

echo "=== DB-SERVICE-ROLE-1 — service-role privilege contract ==="
echo ""

# ------------------------------------------------------------
# 1. The pre-existing 37 migrations are byte-identical.
# ------------------------------------------------------------
# An applied migration is history. A remote database has already run these and
# Supabase stores their checksums, so editing one desynchronises the repository
# from every environment that has migrated.
if ! shasum -a 256 -c "$BASELINE" --quiet; then
  fail "1. a pre-existing migration changed; the 37 applied migrations are frozen history"
fi

baseline_count="$(grep -c '^[0-9a-f]\{64\}  ' "$BASELINE")"
[ "$baseline_count" -eq 37 ] ||
  fail "1. the baseline must cover exactly 37 migrations, found $baseline_count"

echo "PASS:  1. the 37 pre-existing migrations are byte-identical"

# ------------------------------------------------------------
# 2. Exactly one new forward-only migration.
# ------------------------------------------------------------
migration_count="$(find supabase/migrations -name '*.sql' -type f | wc -l | tr -d ' ')"
[ "$migration_count" -eq 38 ] ||
  fail "2. expected 38 migrations, found $migration_count"

newest="$(find supabase/migrations -name '*.sql' -type f -exec basename {} \; | sort | tail -1)"
[ "$newest" = "$(basename "$MIGRATION")" ] ||
  fail "2. the new migration must sort last; last is $newest"

# Comment-aware: the migration documents what it deliberately does NOT grant,
# and naming TRUNCATE in that prose must not read as performing one.
python3 - "$MIGRATION" <<'PYTHON'
import sys

path = sys.argv[1]
statements = "\n".join(
    line.split("--", 1)[0] for line in open(path, encoding="utf-8")
).lower()

for forbidden in ["drop table", "drop policy", "drop column", "truncate", "delete from", "alter column"]:
    if forbidden in statements:
        print(f"FAIL: 2. the migration is not forward-only: it contains '{forbidden}'", file=sys.stderr)
        sys.exit(1)
PYTHON

echo "PASS:  2. exactly one new forward-only migration, sorting last"

# ------------------------------------------------------------
# 3-6. The privilege contract itself.
# ------------------------------------------------------------
# Parsed in Python because the assertion is set equality against an explicit
# allowlist, in both directions. A grep would prove the approved grants are
# present but not that nothing else is.
python3 - "$MIGRATION" <<'PYTHON'
import re
import sys

path = sys.argv[1]
sql = open(path, encoding="utf-8").read()

# Strip line comments before parsing. The migration explains itself at length
# and every justification names tables and verbs, so parsing the prose would
# invent grants that do not exist.
statements = []
for raw in sql.split("\n"):
    line = raw.split("--", 1)[0]
    statements.append(line)
text = "\n".join(statements)

# THE APPROVED CONTRACT. Derived from the implementation, verb by verb:
#
#   learning_paths        select  findExisting / nextVersionFor / validation
#                         insert  createDraftLearningPath
#                         update  updateDraftLearningPath, transition to
#                                 review/retired
#   courses               select  findExisting, validation, quality report
#                         insert  createDraftCourse
#   learning_modules      select, insert   as courses
#   missions              select, insert   as courses
#   competencies          select  findExisting / nextVersionFor
#                         insert  createDraftCompetency
#   competency_prereqs    select  prerequisiteExists, hasPrerequisiteCycle
#                         insert  addCompetencyPrerequisite
#   mission_competencies  select  validation and quality walks
#                         insert  linkMissionCompetency upsert
#                         update  linkMissionCompetency upsert (ON CONFLICT)
#   publication_events    insert  the audit append; never read, never rewritten
#   curriculum_assets     select  quality report reads asset URIs
#
# Absent on purpose: UPDATE on courses/modules/missions/competencies (cascaded by
# the SECURITY DEFINER RPC as its owner), DELETE anywhere, INSERT on
# curriculum_assets (addMissionAsset has no reachable caller), SELECT on
# curriculum_publication_events (nothing reads it).
EXPECTED = {
    "learning_paths": {"select", "insert", "update"},
    "courses": {"select", "insert"},
    "learning_modules": {"select", "insert"},
    "missions": {"select", "insert"},
    "competencies": {"select", "insert"},
    "competency_prerequisites": {"select", "insert"},
    "mission_competencies": {"select", "insert", "update"},
    "curriculum_publication_events": {"insert"},
    "curriculum_assets": {"select"},
}

failures = []

# 4. Structural prohibitions, checked before anything is parsed.
if re.search(r"on\s+all\s+tables\s+in\s+schema", text, re.I):
    failures.append("blanket GRANT ... ON ALL TABLES IN SCHEMA is forbidden")
if re.search(r"alter\s+default\s+privileges", text, re.I):
    failures.append("ALTER DEFAULT PRIVILEGES is forbidden")
if re.search(r"grant\s+all\b", text, re.I):
    failures.append("GRANT ALL is forbidden; name the verbs")
if re.search(r"\bwith\s+grant\s+option\b", text, re.I):
    failures.append("WITH GRANT OPTION is forbidden")
if re.search(r"\balter\s+role\b|\bcreate\s+role\b|\bsuperuser\b|\bbypassrls\b", text, re.I):
    failures.append("this migration must not alter role attributes")

# Table grants.
actual = {}
table_grant = re.compile(
    r"grant\s+([a-z, \t]+?)\s+on\s+(?:table\s+)?public\.([a-z_]+)\s+to\s+([a-z_, ]+?)\s*;",
    re.I | re.S,
)

for verbs_raw, table, roles_raw in table_grant.findall(text):
    verbs = {v.strip().lower() for v in verbs_raw.split(",") if v.strip()}
    roles = {r.strip().lower() for r in roles_raw.split(",") if r.strip()}

    # 5 + 6. No other role may be widened by this migration.
    for role in roles:
        if role != "service_role":
            failures.append(
                f"{table}: this migration grants to '{role}'; only service_role "
                f"belongs here (anon/authenticated are DB-RLS-1's contract)"
            )

    if "service_role" in roles:
        actual.setdefault(table, set()).update(verbs)

# 3. Set equality against the allowlist, in both directions.
for table, verbs in sorted(EXPECTED.items()):
    got = actual.get(table)
    if got is None:
        failures.append(f"{table}: approved grant missing entirely")
        continue
    extra = got - verbs
    missing = verbs - got
    if extra:
        failures.append(
            f"{table}: service_role granted {sorted(extra)} beyond the approved "
            f"contract — every verb must be justified by real code"
        )
    if missing:
        failures.append(f"{table}: approved verb(s) {sorted(missing)} not granted")

for table in sorted(set(actual) - set(EXPECTED)):
    failures.append(
        f"{table}: service_role granted privileges on a table outside the "
        f"approved curriculum-authoring contract"
    )

# Schema usage, without which every grant above is inert.
if not re.search(r"grant\s+usage\s+on\s+schema\s+public\s+to\s+service_role\s*;", text, re.I):
    failures.append("no GRANT USAGE ON SCHEMA public TO service_role")

for match in re.finditer(r"grant\s+usage\s+on\s+schema\s+\w+\s+to\s+([a-z_, ]+?)\s*;", text, re.I):
    roles = {r.strip().lower() for r in match.group(1).split(",")}
    if roles - {"service_role"}:
        failures.append(f"schema USAGE granted to {sorted(roles - {'service_role'})}")

# No sequence privileges: every key in this contract is gen_random_uuid().
if re.search(r"on\s+sequence|on\s+all\s+sequences", text, re.I):
    failures.append("sequence privileges are not required by this contract")

print("--- service_role table privilege contract ---")
for table, verbs in sorted(actual.items()):
    print(f"  {table:32s} {', '.join(sorted(verbs))}")
print(f"  tables in contract: {len(actual)}")

if failures:
    for problem in failures:
        print(f"FAIL: 3-6. {problem}", file=sys.stderr)
    sys.exit(1)
PYTHON

echo "PASS:  3. service_role holds exactly the approved table privileges"
echo "PASS:  4. no blanket grant, no ALTER DEFAULT PRIVILEGES, no GRANT ALL"
echo "PASS:  5. no anon or PUBLIC privilege broadening"
echo "PASS:  6. no authenticated privilege broadening"

# ------------------------------------------------------------
# 7-8. The publication RPC.
# ------------------------------------------------------------
# Statements wrap across lines, so this is parsed rather than grepped.
python3 - "$MIGRATION" <<'PYTHON'
import re
import sys

path = sys.argv[1]
text = "\n".join(line.split("--", 1)[0] for line in open(path, encoding="utf-8"))

grants = re.findall(
    r"grant\s+execute\s+on\s+function\s+([^;]+?)\s+to\s+([a-z_, ]+?)\s*;",
    text,
    re.I | re.S,
)

if len(grants) != 1:
    print(
        f"FAIL: 7. expected exactly 1 EXECUTE grant, found {len(grants)}. "
        "This contract needs one RPC, not a family of them.",
        file=sys.stderr,
    )
    sys.exit(1)

signature, roles_raw = grants[0]
signature = " ".join(signature.split())
roles = {r.strip().lower() for r in roles_raw.split(",") if r.strip()}

if signature.lower() != "public.curriculum_publish_learning_path_tree(uuid)":
    print(f"FAIL: 7. unexpected EXECUTE grant target: {signature}", file=sys.stderr)
    sys.exit(1)

if roles != {"service_role"}:
    print(
        f"FAIL: 7. the publication RPC must be granted to service_role only, got {sorted(roles)}",
        file=sys.stderr,
    )
    sys.exit(1)
PYTHON

echo "PASS:  7. the publication RPC EXECUTE grant exists, for service_role only"

# The original revocation must survive untouched. If a future edit granted the
# RPC back to a learner-facing role, publication would stop being privileged.
REVOKE_MIGRATION="supabase/migrations/20260811000500_curriculum_tree_publication.sql"
grep -q "from public, anon, authenticated" "$REVOKE_MIGRATION" ||
  fail "8. the original RPC revocation from public/anon/authenticated is gone"

for role in "anon" "authenticated" "public"; do
  if grep -Eqi "grant[[:space:]]+execute[[:space:]]+on[[:space:]]+function[[:space:]]+public\.curriculum_publish_learning_path_tree[^;]*to[^;]*\b${role}\b" "$MIGRATION"; then
    fail "8. the publication RPC must never be executable by '$role'"
  fi
done

echo "PASS:  8. forbidden roles still cannot execute the publication RPC"

# ------------------------------------------------------------
# 9. Credential validation exists and fails closed.
# ------------------------------------------------------------
for symbol in "classifyServiceRoleCredential" "readJwtRoleClaim" "isValidAuthoringActorId"; do
  grep -q "$symbol" "$BOOTSTRAP" || fail "9. $BOOTSTRAP no longer defines $symbol"
done

# The guard must consult the classification, not merely a truthiness check.
grep -q "classifyServiceRoleCredential(input.serviceRoleKey)" "$BOOTSTRAP" ||
  fail "9. resolveBootstrapEnvironment must classify the credential"

grep -q "hasServiceRoleKey" "$BOOTSTRAP" &&
  fail "9. the presence-only hasServiceRoleKey check must not return"

# Fail closed: the classifier's final branch must refuse, never accept.
python3 - "$BOOTSTRAP" <<'PYTHON'
import re
import sys

source = open(sys.argv[1], encoding="utf-8").read()
start = source.index("export function classifyServiceRoleCredential")
end = source.index("export function describeServiceRoleCredentialProblem")
body = source[start:end]

problems = []

# The fall-through must be a refusal. An unrecognised format is not assumed to
# be a valid future one.
tail = body.rstrip().rstrip("}").rstrip()
if "usable: false" not in tail.splitlines()[-1] and "unrecognised_format" not in tail:
    problems.append("the final branch must refuse, not accept")

for required in ['"service_role"', '"anon"', "sb_publishable_", "sb_secret_"]:
    if required not in body:
        problems.append(f"classification no longer considers {required}")

# The anon key must never be accepted, however the branches are reordered.
if re.search(r'role\s*===\s*"anon"[^\n]*usable:\s*true', body):
    problems.append("the anon role must never be classified usable")

if problems:
    for problem in problems:
        print(f"FAIL: 9. {problem}", file=sys.stderr)
    sys.exit(1)
PYTHON

echo "PASS:  9. service-role credential validation exists and fails closed"

# ------------------------------------------------------------
# 10. Admin diagnostics preserve the database error.
# ------------------------------------------------------------
grep -q "describeDatabaseError" "$PUBLISH" ||
  fail "10. the publication command must describe database errors, not discard them"

python3 - "$PUBLISH" <<'PYTHON'
import re
import sys

source = open(sys.argv[1], encoding="utf-8").read()
problems = []

# Every `if (error)` throw in this file must carry the diagnostic through.
for match in re.finditer(r"if \(error\) \{(.*?)\n  \}", source, re.S):
    block = match.group(1)
    if "throw" in block and "describeDatabaseError" not in block:
        problems.append(
            "a database error is thrown without describeDatabaseError: "
            + " ".join(block.split())[:90]
        )

if problems:
    for problem in problems:
        print(f"FAIL: 10. {problem}", file=sys.stderr)
    sys.exit(1)
PYTHON

grep -q "error.code" "$DIAGNOSTICS" ||
  fail "10. the SQLSTATE must be preserved — it is what names a 42501"

echo "PASS: 10. admin diagnostics preserve the database error code and message"

# ------------------------------------------------------------
# 11. No diagnostic path can print a credential.
# ------------------------------------------------------------
grep -q "redactSecrets" "$DIAGNOSTICS" || fail "11. $DIAGNOSTICS must redact"

python3 - "$DIAGNOSTICS" <<'PYTHON'
import re
import sys

raw = open(sys.argv[1], encoding="utf-8").read()

# Comment-aware. This module documents its own guarantees, so prose naming
# `process.env` or `details` must not read as doing either.
source = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
source = "\n".join(line.split("//", 1)[0] for line in source.splitlines())

problems = []

# `details` is where postgrest-js puts transport stack traces and the request
# host. It must not be surfaced.
body_start = source.index("export function describeDatabaseError")
body = source[body_start:]
if re.search(r"\berror\.details\b", body):
    problems.append("describeDatabaseError must not surface `details`")

# Every rendered field must pass through the redactor.
for field in ["code", "message", "hint"]:
    if not re.search(rf"redactSecrets\({field}\)", body):
        problems.append(f"the {field} field is rendered without redaction")

# The redactor must cover every credential shape the project actually holds.
for shape, label in [
    ("eyJ", "legacy JWTs"),
    ("sb_", "current-generation API keys"),
    ("postgres", "database connection strings"),
    ("supabase", "project URLs"),
]:
    if shape not in source:
        problems.append(f"the redactor no longer covers {label}")

# Nothing here may read the environment directly.
if "process.env" in source:
    problems.append("the diagnostics module must not read process.env")

if problems:
    for problem in problems:
        print(f"FAIL: 11. {problem}", file=sys.stderr)
    sys.exit(1)
PYTHON

# The helper script must never echo a value either.
if [ -f scripts/uat-env.sh ]; then
  python3 - scripts/uat-env.sh <<'PYTHON'
import re
import sys

source = open(sys.argv[1], encoding="utf-8").read()
problems = []

# A printf/echo whose arguments expand a credential variable would leak it.
for line in source.splitlines():
    stripped = line.strip()
    if not (stripped.startswith("echo") or stripped.startswith("printf")):
        continue
    for secret in [
        "$SUPABASE_SERVICE_ROLE_KEY",
        "${SUPABASE_SERVICE_ROLE_KEY",
        "$SUPABASE_ANON_KEY",
        "${SUPABASE_ANON_KEY",
        "$SUPABASE_URL",
        "${SUPABASE_URL",
    ]:
        if secret in stripped:
            problems.append(f"a credential is printed: {stripped[:70]}")

if problems:
    for problem in problems:
        print(f"FAIL: 11. {problem}", file=sys.stderr)
    sys.exit(1)
PYTHON
fi

echo "PASS: 11. no diagnostic path can print a credential"

# ------------------------------------------------------------
# 12. The publication command does not print the full Supabase URL.
# ------------------------------------------------------------
grep -q "MODE: EXECUTE — \${targetDescription}" "$PUBLISH" ||
  fail "12. execute mode must print the safe target description"

if grep -q 'target \${targetUrl}' "$PUBLISH"; then
  fail "12. the full Supabase URL must not be printed"
fi

grep -q "describeBootstrapTarget" "$BOOTSTRAP" ||
  fail "12. describeBootstrapTarget must exist"

python3 - "$BOOTSTRAP" <<'PYTHON'
import sys

source = open(sys.argv[1], encoding="utf-8").read()
start = source.index("export function describeBootstrapTarget")
end = source.index("export interface BootstrapEnvironmentInput")
body = source[start:end]

# The description must be built from a truncated label, never the whole URL.
if "supabaseUrl.trim()" in body and "hostname" not in body:
    print("FAIL: 12. the target description must not embed the whole URL", file=sys.stderr)
    sys.exit(1)

# The execute reason is printed; it must use the description, not the URL.
if "Confirmed target ${supabaseUrl}" in source:
    print("FAIL: 12. the execute reason still names the full URL", file=sys.stderr)
    sys.exit(1)
PYTHON

echo "PASS: 12. the full Supabase project URL is never printed"

# ------------------------------------------------------------
# 13. 31 mission-competency links remain the authored truth.
# ------------------------------------------------------------
python3 - <<'PYTHON'
import re
import sys

source = open("packages/shared-types/src/roas-curriculum.ts", encoding="utf-8").read()

start = source.index("export const ROAS_MISSIONS")
# The authored missions end where the next top-level export begins.
rest = source[start + 10:]
end = start + 10 + rest.index("\nexport const ")
missions_block = source[start:end]

links = len(re.findall(r"\{\s*competencyStableId:", missions_block))

if links != 31:
    print(
        f"FAIL: 13. expected 31 authored mission-competency links, found {links}. "
        "31 is the reconciled truth (4+3+2+4+3+6+9); ROAS-4's pull request "
        "description said 30 and was wrong.",
        file=sys.stderr,
    )
    sys.exit(1)

print(f"  authored mission-competency links: {links}")
PYTHON

grep -q "toHaveLength(31)" packages/shared-types/src/roas-bootstrap.test.ts ||
  fail "13. the 31-link count must be pinned by a test"

echo "PASS: 13. 31 mission-competency links remain the authored truth"

# ------------------------------------------------------------
# 14. Publication still refuses production and demands exact confirmation.
# ------------------------------------------------------------
grep -q 'appEnv === "production"' "$BOOTSTRAP" ||
  fail "14. the production refusal is gone"
grep -q "looksLikeProductionTarget" "$BOOTSTRAP" ||
  fail "14. the production-looking-host refusal is gone"
grep -q "confirmation !== requiredConfirmationFor" "$BOOTSTRAP" ||
  fail "14. the exact-confirmation requirement is gone"

# `--` and `-F`: without them grep reads `--force` as an option, the command
# fails, and the check silently passes for the one override most worth catching.
for override in "FORCE" "ALLOW_PRODUCTION" "--force" "skipGuard" "bypass"; do
  if grep -qF -- "$override" "$BOOTSTRAP" "$PUBLISH"; then
    fail "14. an override escape hatch appeared: $override"
  fi
done

echo "PASS: 14. publication refuses production and demands exact confirmation"

# ------------------------------------------------------------
# 15. Dry run still performs zero database writes.
# ------------------------------------------------------------
python3 - "$PUBLISH" <<'PYTHON'
import sys

source = open(sys.argv[1], encoding="utf-8").read()

start = source.index("function printDryRun")
end = source.index("async function execute")
dry_run = source[start:end]

problems = []
for write in [".insert(", ".update(", ".upsert(", ".delete(", ".rpc(", "createServerSupabaseClient"]:
    if write in dry_run:
        problems.append(f"the dry run performs {write}")

# main() must return before execute() when the decision is a dry run.
main_start = source.index("async function main()")
main_body = source[main_start:]
if 'decision.mode === "dry_run"' not in main_body or "return;" not in main_body:
    problems.append("main() no longer returns before execute() on a dry run")

if problems:
    for problem in problems:
        print(f"FAIL: 15. {problem}", file=sys.stderr)
    sys.exit(1)
PYTHON

echo "PASS: 15. the dry run performs zero database writes"

# ------------------------------------------------------------
# 16. No learner progress, evidence or competency state is written.
# ------------------------------------------------------------
# Comment-aware: the command's header explains that it CANNOT fabricate
# progress, and names `record_mission_progress` to say why. Prose asserting the
# guarantee must not read as violating it.
python3 - "$PUBLISH" <<'PYTHON'
import re
import sys

raw = open(sys.argv[1], encoding="utf-8").read()
code = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
code = "\n".join(line.split("//", 1)[0] for line in code.splitlines())

for forbidden in [
    "student_learning_progress",
    "student_competency_state",
    "evidence_records",
    "record_mission_progress",
    "assessment_attempts",
    "certificates",
]:
    if forbidden in code:
        print(
            f"FAIL: 16. the publication command references learner state: {forbidden}",
            file=sys.stderr,
        )
        sys.exit(1)
PYTHON

# The migration must not privilege learner-state tables either.
for forbidden in \
  "student_learning_progress" "student_competency_state" "evidence_records" \
  "student_notes" "assessment_attempts"; do
  if grep -q "$forbidden" "$MIGRATION"; then
    fail "16. the migration grants service_role access to learner state: $forbidden"
  fi
done

# The guarantee this rests on must still be in the migration that makes it true.
grep -q "auth.uid()" supabase/migrations/20260811000700_learning_progress_foundation.sql ||
  fail "16. record_mission_progress no longer resolves the learner from auth.uid()"

echo "PASS: 16. no learner progress, evidence or competency state is written"

# ------------------------------------------------------------
# 17. Lab publication remains excluded.
# ------------------------------------------------------------
grep -q "deferredOperations" "$PUBLISH" ||
  fail "17. deferred lab operations are no longer reported"

python3 - "$PUBLISH" <<'PYTHON'
import sys

source = open(sys.argv[1], encoding="utf-8").read()
start = source.index("async function execute")
end = source.index("async function main()")
execute_body = source[start:end]

# The deferred operations may be printed, never executed.
for forbidden in ["createLabDefinition", "publishLabDefinition", "linkLabMission"]:
    if forbidden in execute_body:
        print(f"FAIL: 17. execute() performs a lab operation: {forbidden}", file=sys.stderr)
        sys.exit(1)

if "deferredOperations" in execute_body and "await" in execute_body.split("deferredOperations")[1][:200]:
    print("FAIL: 17. deferred operations must be printed, not awaited", file=sys.stderr)
    sys.exit(1)
PYTHON

echo "PASS: 17. lab publication remains excluded"

# ------------------------------------------------------------
# 18. CI change selection runs this gate.
# ------------------------------------------------------------
for mapped in \
  "supabase/migrations/*|scripts/verify-db-service-role.sh" \
  "scripts/verify-db-service-role.sh|scripts/verify-db-service-role.sh" \
  "services/api/src/db-diagnostics*|scripts/verify-db-service-role.sh" \
  "services/api/src/admin/publish-roas-curriculum.ts|scripts/verify-db-service-role.sh" \
  "packages/shared-types/src/roas-bootstrap*|scripts/verify-db-service-role.sh" \
  "scripts/uat-env.sh|scripts/verify-db-service-role.sh" \
  "scripts/migration-baseline.sha256|scripts/verify-db-service-role.sh"; do
  grep -qF "$mapped" "$SELECTOR" ||
    fail "18. ci-select-gates.sh does not map: $mapped"
done

selected="$(bash "$SELECTOR" "$MIGRATION")"
case "$selected" in
  *verify-db-service-role.sh*) ;;
  *) fail "18. a migration change does not select this gate" ;;
esac

echo "PASS: 18. CI change selection runs this gate"

# ------------------------------------------------------------
# Targeted tests
# ------------------------------------------------------------
echo ""
echo "--- targeted tests ---"
npx vitest run --root packages/shared-types src/roas-bootstrap.test.ts
npx vitest run --root services/api src/db-diagnostics.test.ts

echo ""
echo "=========================================================="
echo "DB-SERVICE-ROLE-1 VERIFIED"
echo ""
echo "service_role holds exactly the curriculum-authoring privileges the"
echo "approved implementation issues, and nothing else. The 37 applied"
echo "migrations are byte-identical. The credential guard checks the role"
echo "claim and fails closed. Diagnostics carry the SQLSTATE and no"
echo "credential. 31 mission-competency links remain authored truth."
echo "=========================================================="
