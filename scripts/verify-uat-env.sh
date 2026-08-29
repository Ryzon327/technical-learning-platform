#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# UAT-ENV-1 — the UAT environment helper.
#
# ## What this gate defends
#
# The Architect told the Founder to `source scripts/uat-env.sh`. In zsh that
# produced:
#
#     scripts/uat-env.sh:50: BASH_SOURCE[0]: parameter not set
#
# and then five FAILs for configuration that was actually present. `BASH_SOURCE`
# is a bash array; zsh does not define it; `set -u` made it an error; the
# substitution yielded empty; `dirname ""` returns `.`; and the root resolution
# `cd "$(dirname …)/.."` therefore landed on the PARENT of the repository. Every
# check ran against the wrong directory. Because it was sourced, it also left the
# caller's shell cd'd there with `set -euo pipefail` applied.
#
# Separately, `run` invoked the checks before `exec` and aborted on ANY failure,
# so starting the learner API demanded the publication service-role key and the
# bootstrap actor UUID. No learner route uses either.
#
# ## Why these assertions are behavioural
#
# Every section below RUNS the helper in a subprocess with a controlled
# environment and asserts on its exit status and output. A string-presence check
# would pass against a dead guard — the lesson from LEARN-PROGRESS-DB-1, where
# `false && mission.isDemonstration` satisfied a grep.
#
# ## Assertions
#
#   1.  normal bash execution resolves the repository root
#   2.  sourced invocation fails, relocates nothing, changes no shell option
#   3.  learner API runs without service-role configuration
#   4.  learner API runs without bootstrap actor configuration
#   5.  learner API refuses missing APP_ENV
#   6.  learner API refuses missing SUPABASE_URL
#   7.  learner API refuses missing SUPABASE_ANON_KEY
#   8.  publication refuses missing service-role configuration when it will write
#   9.  publication retains actor and confirmation semantics
#   10. API startup does not depend on the browser env file
#   11. no configuration value is ever printed
#   12. gitignore and security protections remain intact
#
# Run: npm run gate -- uat-env
# ============================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HELPER="scripts/uat-env.sh"
RUNBOOK="docs/Engineering-OS/ROAS_UAT_RUNBOOK.md"

fail() { echo "FAIL: $1" >&2; exit 1; }

# `-f`, never `-x`: every caller runs verifiers with `bash`, so an execute-bit
# test would let a mode accident silently skip a gate while reporting success.
for required in "$HELPER" "$RUNBOOK" .gitignore; do
  [ -f "$required" ] || fail "missing required file: $required"
done

echo "=== UAT-ENV-1 — UAT environment helper ==="
echo ""

# Synthetic values. None is a real credential; the point is that none of them
# may ever appear in the helper's output.
SYN_URL="https://synthetic-project.example.com"
SYN_ANON="synthetic-anon-key-AAAA"
SYN_ACTOR="3f2504e0-4f89-11d3-9a0c-0305e82c3301"
SYN_SERVICE="$(node -e '
  const e = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  process.stdout.write(e({alg:"HS256"}) + "." + e({role:"service_role"}) + ".synthetic");
')"

# Run the helper with a controlled environment. Captures stdout+stderr and the
# exit status without letting either abort this gate.
NOENV="/nonexistent-env-file-for-verification"
OUT=""
STATUS=0
# Arguments are `NAME=value …` followed by the helper's own arguments. The split
# is the first bare `run` or `check`, which no environment assignment can equal.
helper() {
  local envs=() args=() a seen=0

  for a in "$@"; do
    if [ "$seen" -eq 0 ] && { [ "$a" = "run" ] || [ "$a" = "check" ]; }; then
      seen=1
    fi
    if [ "$seen" -eq 0 ]; then envs+=("$a"); else args+=("$a"); fi
  done

  set +e
  OUT="$(env TLP_ENV_FILE="$NOENV" ${envs[@]+"${envs[@]}"} \
    bash "$HELPER" ${args[@]+"${args[@]}"} 2>&1)"
  STATUS=$?
  set -e
}

# ------------------------------------------------------------
# 1. Normal bash execution resolves the repository root.
# ------------------------------------------------------------
# Run from an unrelated working directory: the helper must still find the repo
# and resolve paths against it, which is exactly what the sourced path got wrong.
#
# The probe is `package.json`, borrowed as the "browser env file" purely because
# it is a relative path that exists in the repository root and NOT in its parent.
# Reporting it PRESENT therefore proves the helper actually cd'd to the root.
#
# Mutation testing forced this. The first version asserted only that the output
# mentioned `apps/web/.env.local`, which it does whether the file was found or
# not — so a deliberately broken root resolution passed section 1 and was caught
# three sections later by an unrelated assertion.
set +e
ROOT_OUT="$(cd /tmp && env TLP_ENV_FILE="$NOENV" TLP_WEB_ENV_FILE="package.json" \
  APP_ENV=development SUPABASE_URL="$SYN_URL" SUPABASE_ANON_KEY="$SYN_ANON" \
  bash "$ROOT/scripts/uat-env.sh" check 2>&1)"
ROOT_STATUS=$?
set -e

[ "$ROOT_STATUS" -eq 0 ] ||
  fail "1. the helper failed when executed from another directory: $ROOT_OUT"

case "$ROOT_OUT" in
  *"package.json"*"present"*) ;;
  *) fail "1. the helper did not resolve relative paths against the repository root: $ROOT_OUT" ;;
esac

echo "PASS:  1. normal bash execution resolves the repository root"

# ------------------------------------------------------------
# 2. Sourced invocation fails safely.
# ------------------------------------------------------------
# Asserted for bash always, and for zsh when present — zsh is the shell that
# actually produced the incident.
assert_source_is_refused() {
  local shell="$1" probe result

  probe='cd "'"$ROOT"'"; before="$PWD"; source scripts/uat-env.sh; rc=$?;
    if [ "$PWD" = "$before" ]; then moved=no; else moved=YES; fi
    case "$-" in *e*) opts=CHANGED;; *) opts=intact;; esac
    echo "rc=$rc moved=$moved opts=$opts"'

  set +e
  result="$("$shell" -c "$probe" 2>&1)"
  set -e

  case "$result" in
    *"must be executed with bash"*) ;;
    *) fail "2. [$shell] sourcing did not produce the refusal message: $result" ;;
  esac
  case "$result" in
    *"rc=0"*) fail "2. [$shell] sourcing succeeded; it must fail" ;;
  esac
  case "$result" in
    *"moved=YES"*) fail "2. [$shell] sourcing relocated the caller's shell" ;;
  esac
  case "$result" in
    *"opts=CHANGED"*) fail "2. [$shell] sourcing altered the caller's shell options" ;;
  esac
  # It must not have partially continued into the checks.
  case "$result" in
    *"configuration check"*) fail "2. [$shell] sourcing partially continued" ;;
  esac

  echo "       ok: $shell refuses the sourced invocation cleanly"
}

assert_source_is_refused bash
if command -v zsh >/dev/null 2>&1; then
  assert_source_is_refused zsh
else
  echo "       note: zsh unavailable on this machine; bash coverage only"
fi

echo "PASS:  2. sourced invocation fails, relocates nothing, changes no options"

# ------------------------------------------------------------
# 3-4. The learner API needs no publication configuration.
# ------------------------------------------------------------
LEARNER_ENV=(APP_ENV=development SUPABASE_URL="$SYN_URL" SUPABASE_ANON_KEY="$SYN_ANON")

helper "${LEARNER_ENV[@]}" run echo UAT_ENV_STARTED
[ "$STATUS" -eq 0 ] ||
  fail "3. the learner API refused to start without a service-role key: $OUT"
case "$OUT" in
  *UAT_ENV_STARTED*) ;;
  *) fail "3. the learner command did not execute" ;;
esac
echo "PASS:  3. learner API runs without service-role configuration"

# With a service-role key present but no actor, the API must still start.
helper "${LEARNER_ENV[@]}" SUPABASE_SERVICE_ROLE_KEY="$SYN_SERVICE" run echo UAT_ENV_STARTED
[ "$STATUS" -eq 0 ] ||
  fail "4. the learner API refused to start without a bootstrap actor: $OUT"
echo "PASS:  4. learner API runs without bootstrap actor configuration"

# ------------------------------------------------------------
# 5-7. The learner API still refuses what it genuinely needs.
# ------------------------------------------------------------
helper SUPABASE_URL="$SYN_URL" SUPABASE_ANON_KEY="$SYN_ANON" run echo UAT_ENV_STARTED
[ "$STATUS" -ne 0 ] || fail "5. missing APP_ENV was accepted"
case "$OUT" in
  *UAT_ENV_STARTED*) fail "5. the command executed despite a fatal failure" ;;
esac
echo "PASS:  5. learner API refuses missing APP_ENV"

helper APP_ENV=development SUPABASE_ANON_KEY="$SYN_ANON" run echo UAT_ENV_STARTED
[ "$STATUS" -ne 0 ] || fail "6. missing SUPABASE_URL was accepted"
case "$OUT" in
  *UAT_ENV_STARTED*) fail "6. the command executed despite a fatal failure" ;;
esac
echo "PASS:  6. learner API refuses missing SUPABASE_URL"

helper APP_ENV=development SUPABASE_URL="$SYN_URL" run echo UAT_ENV_STARTED
[ "$STATUS" -ne 0 ] || fail "7. missing SUPABASE_ANON_KEY was accepted"
case "$OUT" in
  *UAT_ENV_STARTED*) fail "7. the command executed despite a fatal failure" ;;
esac
echo "PASS:  7. learner API refuses missing SUPABASE_ANON_KEY"

# A production APP_ENV must be refused whatever the purpose.
helper APP_ENV=production SUPABASE_URL="$SYN_URL" SUPABASE_ANON_KEY="$SYN_ANON" \
  run echo UAT_ENV_STARTED
[ "$STATUS" -ne 0 ] || fail "7. APP_ENV=production was accepted"
echo "       ok: APP_ENV=production is refused"

# ------------------------------------------------------------
# 8-9. Publication keeps its stronger requirements.
# ------------------------------------------------------------
# A write-intent publication (confirmation present) without a service-role key
# must be refused.
helper "${LEARNER_ENV[@]}" TLP_UAT_BOOTSTRAP_CONFIRM="$SYN_URL" \
  TLP_UAT_BOOTSTRAP_ACTOR_ID="$SYN_ACTOR" \
  run npm run admin:publish-roas-curriculum
[ "$STATUS" -ne 0 ] ||
  fail "8. publication with write intent was allowed without a service-role key"
case "$OUT" in
  *"purpose:  publish"*) ;;
  *) fail "8. the publication command was not recognised as publication purpose" ;;
esac
echo "PASS:  8. publication refuses missing service-role configuration"

# Same, missing the actor instead.
helper "${LEARNER_ENV[@]}" SUPABASE_SERVICE_ROLE_KEY="$SYN_SERVICE" \
  TLP_UAT_BOOTSTRAP_CONFIRM="$SYN_URL" \
  run npm run admin:publish-roas-curriculum
[ "$STATUS" -ne 0 ] ||
  fail "9. publication with write intent was allowed without an actor id"

# A malformed actor is refused even without write intent: it is an error to
# correct, not a missing optional.
helper "${LEARNER_ENV[@]}" TLP_UAT_BOOTSTRAP_ACTOR_ID="not-a-uuid" run echo UAT_ENV_STARTED
[ "$STATUS" -ne 0 ] || fail "9. a malformed actor id was accepted"

# The anon key in the service-role slot is always refused, whatever the purpose.
SYN_ANON_JWT="$(node -e '
  const e = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  process.stdout.write(e({alg:"HS256"}) + "." + e({role:"anon"}) + ".synthetic");
')"
helper "${LEARNER_ENV[@]}" SUPABASE_SERVICE_ROLE_KEY="$SYN_ANON_JWT" run echo UAT_ENV_STARTED
[ "$STATUS" -ne 0 ] || fail "9. the anon key was accepted in the service-role slot"

# The dry run must stay reachable: no confirmation means no write, and the
# authoritative guard allows a dry run with no service-role key at all.
helper "${LEARNER_ENV[@]}" run npm run admin:publish-roas-curriculum
[ "$STATUS" -eq 0 ] ||
  fail "9. the publication DRY RUN was blocked; seeing the plan must stay risk-free: $OUT"
case "$OUT" in
  *"dry run"*) ;;
  *) fail "9. the dry-run intent was not reported" ;;
esac
echo "PASS:  9. publication retains actor and confirmation semantics"

# ------------------------------------------------------------
# 10. API startup does not depend on the browser env file.
# ------------------------------------------------------------
set +e
NOWEB_OUT="$(env TLP_ENV_FILE="$NOENV" TLP_WEB_ENV_FILE="$NOENV" \
  APP_ENV=development SUPABASE_URL="$SYN_URL" SUPABASE_ANON_KEY="$SYN_ANON" \
  bash "$HELPER" run echo UAT_ENV_STARTED 2>&1)"
NOWEB_STATUS=$?
set -e

[ "$NOWEB_STATUS" -eq 0 ] ||
  fail "10. a missing browser env file blocked API startup: $NOWEB_OUT"
case "$NOWEB_OUT" in
  *UAT_ENV_STARTED*) ;;
  *) fail "10. the command did not execute without the browser env file" ;;
esac
# It must still be reported, just not fatal.
case "$NOWEB_OUT" in
  *"browser/frontend"*) ;;
  *) fail "10. the browser env file was not reported at all" ;;
esac
echo "PASS: 10. API startup does not depend on the browser env file"

# ------------------------------------------------------------
# 11. No configuration value is ever printed.
# ------------------------------------------------------------
# Every synthetic value is fed in at once, across several purposes, and the
# combined output must contain none of them.
assert_no_value_printed() {
  local label="$1"; shift
  set +e
  local out
  out="$(env TLP_ENV_FILE="$NOENV" "$@" bash "$HELPER" check all 2>&1)"
  set -e

  local secret
  for secret in "$SYN_URL" "$SYN_ANON" "$SYN_SERVICE" "$SYN_ACTOR" "$SYN_ANON_JWT"; do
    case "$out" in
      *"$secret"*) fail "11. [$label] a configuration value reached the output" ;;
    esac
  done

  # Credential SHAPES must not appear either.
  case "$out" in
    *eyJ* | *"sb_secret_"* | *"sb_publishable_"* | *"postgresql://"*)
      fail "11. [$label] a credential-shaped string reached the output"
      ;;
  esac
}

assert_no_value_printed "fully configured" \
  APP_ENV=development SUPABASE_URL="$SYN_URL" SUPABASE_ANON_KEY="$SYN_ANON" \
  SUPABASE_SERVICE_ROLE_KEY="$SYN_SERVICE" TLP_UAT_BOOTSTRAP_ACTOR_ID="$SYN_ACTOR" \
  TLP_UAT_BOOTSTRAP_CONFIRM="$SYN_URL"

assert_no_value_printed "wrong key in service slot" \
  APP_ENV=development SUPABASE_URL="$SYN_URL" SUPABASE_ANON_KEY="$SYN_ANON" \
  SUPABASE_SERVICE_ROLE_KEY="$SYN_ANON_JWT"

assert_no_value_printed "connection string in URL slot" \
  APP_ENV=development SUPABASE_URL="postgresql://postgres:pw@db.example.com:5432/postgres" \
  SUPABASE_ANON_KEY="$SYN_ANON"

# The script must not echo these variables anywhere, in any mode.
python3 - "$HELPER" <<'PYTHON'
import re
import sys

source = open(sys.argv[1], encoding="utf-8").read()
code = "\n".join(line.split("#", 1)[0] for line in source.splitlines())

problems = []
secrets = [
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_URL",
    "TLP_UAT_BOOTSTRAP_ACTOR_ID",
    "TLP_UAT_BOOTSTRAP_CONFIRM",
]

for line in code.splitlines():
    stripped = line.strip()
    if not (stripped.startswith("echo") or stripped.startswith("printf")):
        continue
    for name in secrets:
        if f"${name}" in stripped or f"${{{name}" in stripped:
            problems.append(f"a credential variable is printed: {stripped[:70]}")

if problems:
    for problem in problems:
        print(f"FAIL: 11. {problem}", file=sys.stderr)
    sys.exit(1)
PYTHON

echo "PASS: 11. no configuration value is ever printed"

# ------------------------------------------------------------
# 12. Gitignore and security protections remain intact.
# ------------------------------------------------------------
git check-ignore -q .env.api ||
  fail "12. .env.api is no longer gitignored; the service-role key could be committed"
git check-ignore -q apps/web/.env.local ||
  fail "12. apps/web/.env.local is no longer gitignored"

# The helper must never create either file.
python3 - "$HELPER" <<'PYTHON'
import re
import sys

source = open(sys.argv[1], encoding="utf-8").read()
code = "\n".join(line.split("#", 1)[0] for line in source.splitlines())

for pattern, message in [
    (r">\s*\"?\$?\{?ENV_FILE", "writes to the env file"),
    (r"\btouch\b", "creates files"),
    (r"\beval\b", "evaluates shell from data"),
    (r"^\s*source\b", "sources a file"),
]:
    if re.search(pattern, code, re.M):
        print(f"FAIL: 12. the helper {message}", file=sys.stderr)
        sys.exit(1)
PYTHON

# The runbook must document the execution contract unambiguously.
grep -Fq "bash scripts/uat-env.sh" "$RUNBOOK" ||
  fail "12. the runbook no longer documents the bash invocation"
grep -Fq "source scripts/uat-env.sh" "$RUNBOOK" ||
  fail "12. the runbook does not warn against sourcing the helper"

echo "PASS: 12. gitignore, file-safety and documentation protections intact"

echo ""
echo "=========================================================="
echo "UAT-ENV-1 VERIFIED"
echo ""
echo "The helper refuses to be sourced, and refuses without moving the"
echo "caller's shell or changing its options. Requirements are scoped to"
echo "purpose: the learner API needs APP_ENV, SUPABASE_URL and"
echo "SUPABASE_ANON_KEY and nothing more, while publication keeps its"
echo "service-role and actor requirements when it intends to write. No"
echo "configuration value reaches the output in any mode."
echo ""
echo "This gate proves HELPER BEHAVIOUR. It does NOT prove:"
echo "  - that the Founder's own .env.api is correct; it is never read here"
echo "  - anything about a running API or a real Supabase project"
echo "=========================================================="
