#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# DEV-FLOW-2 — autonomy acceptance test.
#
# DEV-FLOW-1 claimed a 92-command permission matrix was "100% correct", and
# ROAS-2 then produced at least twelve routine approval prompts. The claim was
# not wrong so much as unfalsifiable: it lived in a scratchpad script that was
# never committed, so nothing re-checked it and nothing could contradict it.
#
# This gate is that check, committed and wired into CI.
#
# ## It classifies under TWO interpretations, deliberately
#
# Claude Code matches command strings by prefix. What is NOT observable from
# inside this repository is how a rule whose prefix ends mid-token behaves:
#
#     Bash(bash scripts/:*)          -> ends inside a path token
#     Bash(git push -u origin wp/:*) -> ends inside a branch token
#
# Under a raw string-prefix reading these cover `bash scripts/verify-x.sh` and
# `git push -u origin wp/x`. Under a whole-word reading they do not, because the
# final token differs. DEV-FLOW-2 does not guess which is true. Every command is
# classified both ways and reported as:
#
#   ROBUST            allowed under both readings          -> safe to rely on
#   PREFIX-DEPENDENT  allowed only under raw string prefix -> may still prompt
#   BLOCKED           allowed under neither                -> will prompt
#
# The gate FAILS on any BLOCKED expectation. PREFIX-DEPENDENT entries are
# reported in full, because they are exactly the residual risk surface and
# pretending otherwise is how DEV-FLOW-1 produced a confident wrong answer.
#
# Deny is evaluated under BOTH readings and wins under either, so a denied
# command is denied no matter which interpretation is correct.
#
# NOTHING BELOW IS EXECUTED. Command strings are classified as text.
# ============================================================

fail() { echo "GATE FAIL: $1"; exit 1; }

SETTINGS=".claude/settings.json"
CLAUDE_MD="CLAUDE.md"
ENGINEERING_OS="docs/Engineering-OS/Engineering-OS.md"

[ -f "$SETTINGS" ] || fail "MISSING: $SETTINGS"
[ -f "$CLAUDE_MD" ] || fail "MISSING: $CLAUDE_MD"
[ -f "$ENGINEERING_OS" ] || fail "MISSING: $ENGINEERING_OS"

echo "===== AUTONOMY ACCEPTANCE TEST ====="
echo ""

# ------------------------------------------------------------
# 1. Command-shape policy is a hard requirement, not advice
# ------------------------------------------------------------
# ROAS-2's residual friction was mostly self-inflicted: allowed commands wrapped
# in pipes and redirects purely to shorten output. Guidance did not stop it, so
# the policy must be stated as a prohibition and pinned here.
grep -Fq 'MANDATORY COMMAND SHAPE' "$CLAUDE_MD" \
  || fail "CLAUDE.md no longer states the mandatory command-shape requirement"

for phrase in \
  'never wrap an allowed command' \
  'to shorten, format, collate, or monitor output' \
  'gh pr checks' \
  'scratchpad'; do
  grep -Fqi "$phrase" "$CLAUDE_MD" \
    || fail "CLAUDE.md no longer records a required command-shape rule: $phrase"
done

# The specific constructs must be named, or the rule is unfalsifiable prose.
for construct in '| head' '| tail' '| grep' '2>&1' '> logfile' 'while ' '$(' '&&'; do
  grep -Fq "$construct" "$CLAUDE_MD" \
    || fail "CLAUDE.md no longer names a prohibited construct: $construct"
done

# The standard is authoritative in Engineering-OS section 7, not only in the
# operating instructions. CLAUDE.md defers to it, so if only CLAUDE.md carried
# the rule the authoritative document would still say it was a preference.
grep -Fq 'Command shape is a requirement, not a preference' "$ENGINEERING_OS" \
  || fail "Engineering-OS section 7 does not state command shape as a requirement"

for phrase in \
  'that simple form must be' \
  'to shorten, format, collate' \
  'npm run gate -- <name>' \
  'requires no `chmod`' \
  'gh pr checks' \
  'Shell polling loops are prohibited' \
  'settings.local.json' \
  'scripts/verify-autonomy.sh'; do
  grep -Fq "$phrase" "$ENGINEERING_OS" \
    || fail "Engineering-OS section 7 no longer records a required rule: $phrase"
done

echo "PASS:  1. the command-shape policy is stated as a hard requirement"

# ------------------------------------------------------------
# 2. The verifier namespace is reachable without per-file rules
# ------------------------------------------------------------
[ -f scripts/run-gate.sh ] || fail "MISSING: scripts/run-gate.sh"

grep -Fq '"gate": "bash scripts/run-gate.sh"' package.json \
  || fail "package.json does not expose the namespace-safe verifier entry point"

# It must not become a general bash escape hatch.
grep -Fq 'assert_plain_name' scripts/run-gate.sh \
  || fail "run-gate.sh does not validate the verifier name"
grep -Fq 'scripts/verify-${command_name}.sh' scripts/run-gate.sh \
  || fail "run-gate.sh does not resolve strictly inside the verifier namespace"

# One rule must cover the whole namespace; per-verifier rules are the anti-pattern
# this replaces.
PER_FILE_RULES="$(grep -c 'Bash(bash scripts/verify-' "$SETTINGS" || true)"
[ "$PER_FILE_RULES" = "0" ] \
  || fail "$PER_FILE_RULES per-verifier allow rules exist; the namespace rule replaces them"

# Containment is EXECUTED, not asserted by reading the source. Each of these
# must be refused; if any were accepted, the entry point would be a broader
# grant than the `bash scripts/` rule it replaces rather than a narrower one.
for escape in "../../etc/passwd" "/etc/passwd" "../verify-wave1" \
              "roas1;id" "roas1 && id" "-rf" "" ; do
  if bash scripts/run-gate.sh "$escape" >/dev/null 2>&1; then
    fail "run-gate accepted an argument that escapes the verifier namespace: '$escape'"
  fi
done

# A verifier must not be able to receive extra arguments either.
if bash scripts/run-gate.sh autonomy extra >/dev/null 2>&1; then
  fail "run-gate forwarded extra arguments to a verifier"
fi

echo "PASS:  2. one entry point covers the verifier namespace, and cannot escape it"

# ------------------------------------------------------------
# 3. Creating a verifier requires no chmod
# ------------------------------------------------------------
# Every caller invokes verifiers as `bash <script>`, so the execute bit is not
# load-bearing. With -x, a verifier that merely lost its mode bit would be
# silently skipped while the gate still reported success.
# This script is excluded because it necessarily contains the search pattern
# itself; a scan that matched its own needle would fail vacuously. Its own body
# is then pinned separately so the exclusion cannot become a hiding place.
SELF="verify-autonomy.sh"
if grep -rn --exclude="$SELF" '\[ -x scripts/' scripts/ >/dev/null 2>&1; then
  echo "verifiers still gating on the execute bit:"
  grep -rn --exclude="$SELF" '\[ -x scripts/' scripts/
  fail "a verifier still gates on the execute bit; a mode-bit accident would silently skip it"
fi

SELF_X_HITS="$(grep -c '\[ -x scripts/' "scripts/$SELF" || true)"
[ "$SELF_X_HITS" = "3" ] \
  || fail "scripts/$SELF contains $SELF_X_HITS execute-bit references; only its own 3 search patterns are expected"

grep -Fq 'bash "$gate"' .github/workflows/ci.yml \
  || fail "CI no longer invokes gates with bash; the execute bit would become load-bearing again"

echo "PASS:  3. no verifier depends on the execute bit"

# ------------------------------------------------------------
# 4. The selector is testable without a shell pipeline
# ------------------------------------------------------------
grep -Fq 'read_changed_paths' scripts/ci-select-gates.sh \
  || fail "the selector does not accept changed paths as arguments"

SELECTED_ARGV="$(bash scripts/ci-select-gates.sh services/api/src/lab-admin.ts)"
[ "$SELECTED_ARGV" = "scripts/verify-roas1.sh" ] \
  || fail "argument invocation selected '$SELECTED_ARGV'"

# CI still uses stdin, and both entry points must agree exactly.
SELECTED_STDIN="$(echo services/api/src/lab-admin.ts | bash scripts/ci-select-gates.sh)"
[ "$SELECTED_STDIN" = "$SELECTED_ARGV" ] \
  || fail "stdin and argument invocation disagree: '$SELECTED_STDIN' vs '$SELECTED_ARGV'"

grep -Fq 'bash scripts/ci-select-gates.sh < /tmp/changed-files.txt' .github/workflows/ci.yml \
  || fail "the CI stdin invocation changed; DEV-FLOW-2 must preserve it"

# --- selector regression matrix ---------------------------------------------
# Adding an argument entry point is only safe if the SELECTION POLICY is
# unchanged. Each case asserts the exact expected output, so a future edit to
# the rule table cannot silently drop or reorder a gate.
expect_selection() {
  local label="$1" expected="$2"
  shift 2
  local actual
  actual="$(bash scripts/ci-select-gates.sh "$@")"
  if [ "$actual" != "$expected" ]; then
    echo "  selector case '$label' expected:" >&2
    printf '%s\n' "$expected" >&2
    echo "  but got:" >&2
    printf '%s\n' "$actual" >&2
    fail "selector regression in case: $label"
  fi
  echo "       ok: $label"
}

expect_selection "lab change" \
  "scripts/verify-roas1.sh" \
  services/api/src/lab-provider.ts

expect_selection "search change" \
  "scripts/verify-search-engine-completion.sh" \
  services/api/src/search-index.ts

# A docs-only change owns no engine. Empty output is correct and means the
# baseline alone runs; it must not accidentally select everything.
expect_selection "docs-only change" \
  "" \
  docs/Project/CURRENT_BUILD_STATUS.md README.md

# Multi-engine: both gates selected, in rule-table order, neither dropped.
expect_selection "multi-engine change" \
  "scripts/verify-roas1.sh
scripts/verify-search-engine-completion.sh" \
  services/api/src/lab-admin.ts services/api/src/search-index.ts

# Duplicate matches: one path matching several rules, and the same gate reached
# by several paths, must both de-duplicate to a single invocation.
expect_selection "duplicate matches de-duplicate" \
  "scripts/verify-roas1.sh" \
  services/api/src/lab-admin.ts services/api/src/lab-provider.ts \
  packages/shared-types/src/lab.ts scripts/verify-wave6.sh

# This work package's own paths must select this gate, or the verification
# machinery would be merged unchecked — the DEV-FLOW-1 failure.
expect_selection "autonomy machinery selects itself" \
  "scripts/verify-autonomy.sh" \
  .claude/settings.json CLAUDE.md docs/Engineering-OS/Engineering-OS.md \
  package.json scripts/run-gate.sh scripts/ci-select-gates.sh

# A mapped gate that no longer exists must FAIL, not silently stop running.
# Tested against a temporary copy so the real rule table is never mutated.
SELECTOR_TMP="$(mktemp -d)"
trap 'rm -rf "$SELECTOR_TMP"' EXIT
sed 's|^RULES$|deleted/gate/probe.ts\|scripts/verify-does-not-exist.sh\nRULES|' \
  scripts/ci-select-gates.sh > "$SELECTOR_TMP/selector.sh"

grep -Fq 'scripts/verify-does-not-exist.sh' "$SELECTOR_TMP/selector.sh" \
  || fail "could not construct the missing-gate probe; the rule table shape changed"

if bash "$SELECTOR_TMP/selector.sh" deleted/gate/probe.ts >/dev/null 2>&1; then
  fail "the selector accepted a mapping to a missing gate instead of failing"
fi
echo "       ok: missing mapped gate fails the selector"

# The probe must not have broken the copy for every other path.
UNAFFECTED="$(bash "$SELECTOR_TMP/selector.sh" services/api/src/lab-provider.ts)"
[ "$UNAFFECTED" = "scripts/verify-roas1.sh" ] \
  || fail "the missing-gate probe altered unrelated selection: '$UNAFFECTED'"

echo "PASS:  4. the selector accepts arguments and its CI stdin path is unchanged"

# ------------------------------------------------------------
# 5. Permission classification — the acceptance matrix
# ------------------------------------------------------------
echo ""
python3 - "$SETTINGS" <<'PYTHON'
import json, shlex, sys

settings = json.load(open(sys.argv[1]))
perms = settings.get("permissions", {})
allow_rules = list(perms.get("allow", []))
deny_rules = list(perms.get("deny", []))

# Machine-local rules are intentionally NOT loaded. This gate proves the
# committed project configuration is sufficient on its own; a laptop-specific
# "don't ask again" entry must never be what makes the workflow work.

def bash_spec(rule):
    if rule.startswith("Bash(") and rule.endswith(")"):
        return rule[5:-1]
    return None

def parse(rules):
    out = []
    for rule in rules:
        spec = bash_spec(rule)
        if spec is None:
            continue
        if spec.endswith(":*"):
            out.append((spec[:-2], True))
        else:
            out.append((spec, False))
    return out

ALLOW = parse(allow_rules)
DENY = parse(deny_rules)

def matches_raw(prefix, wild, command):
    if not wild:
        return command == prefix
    return command == prefix or command.startswith(prefix)

def matches_word(prefix, wild, command):
    if not wild:
        return command == prefix
    p = prefix.split()
    c = command.split()
    if len(p) > len(c):
        return False
    return c[:len(p)] == p

def segments(command):
    """Split a compound command into the parts a permission engine must judge.

    A pipeline or a `;` chain is not one command. Every segment has to be
    permitted for the whole line to run unattended, so the weakest segment
    decides. Modelling this matters: it is what shows that some prohibited
    shapes are nonetheless *permitted*, which is precisely why the prohibition
    has to live in CLAUDE.md rather than in the rule set.
    """
    parts = [command]
    for operator in ("&&", "||", "|", ";"):
        nxt = []
        for part in parts:
            nxt.extend(part.split(operator))
        parts = nxt
    return [p.strip() for p in parts if p.strip()]

def classify_one(command, matcher):
    if any(matcher(p, w, command) for p, w in DENY):
        return "DENY"
    if any(matcher(p, w, command) for p, w in ALLOW):
        return "ALLOW"
    return "PROMPT"

def classify(command, matcher):
    results = [classify_one(s, matcher) for s in segments(command)]
    if "DENY" in results:
        return "DENY"
    if "PROMPT" in results:
        return "PROMPT"
    return "ALLOW"

EXPECT_AUTONOMOUS = [
    "git status --porcelain",
    "git diff --stat",
    "git diff --check",
    "git log --oneline -5",
    "git fetch origin",
    "git switch wp/dev-flow-2-autonomy",
    "git switch -c wp/dev-flow-2-autonomy",
    "git add scripts/verify-autonomy.sh",
    "git rev-parse HEAD",
    "git ls-tree -r --name-only HEAD",
    "npm run test",
    "npm run typecheck",
    "npm run build",
    "npm audit --audit-level=high",
    "npm run gate -- example",
    "npm run gate -- list",
    "npm run gate -- select services/api/src/lab-admin.ts",
    "bash scripts/verify-example.sh",
    "bash scripts/ci-select-gates.sh path1 path2",
    "gh issue view 1",
    "gh issue create --title x --body y",
    "gh pr view 1",
    "gh pr checks 1",
    "gh pr checks 1 --watch",
    "gh run list",
    "gh run view 12345",
    "gh api repos/owner/name/branches/main/protection",
]

EXPECT_DENIED = [
    # BOUNDED AUTONOMY. Committing, pushing and opening a pull request were
    # expected to be autonomous under the previous model, whose goal was a WP
    # cycle that ran end to end without Founder clicks. That is deliberately no
    # longer the model: Claude Code PREPARES work for these gates and the
    # Founder crosses them.
    #
    # Each is asserted in several spellings, because a gate that only catches
    # the common one is not a gate. `git commit -m` was denied while
    # `git commit -F -` was not — and `-F` is the form actually used for
    # multi-paragraph messages, so the gate was open exactly where it was most
    # likely to be reached.
    "git commit",
    'git commit -m "feat: message"',
    'git commit --message="feat: message"',
    "git commit -F -",
    "git commit --file=/tmp/message",
    "git commit -am wip",
    "git commit -a -m wip",
    "git push",
    "git push origin wp/example",
    "git push -u origin wp/example",
    "git push --set-upstream origin wp/example",
    "git push origin HEAD",
    "git push origin HEAD:wp/example",
    "gh pr create",
    "gh pr create --title x --body y",
    "gh pr create --fill",
    "gh pr merge 1 --rebase",
    "git push origin main",
    "git push -u origin main",
    "git push --set-upstream origin main",
    "git push --force",
    "git push -f origin wp/example",
    "git push --force-with-lease",
    "git push --delete origin wp/example",
    "gh pr merge 1",
    "gh pr merge 1 --squash",
    "git reset --hard HEAD~1",
    "git rebase main",
    "git commit --amend -m x",
    "git clean -fd",
    "git branch -D wp/example",
    "git add .",
    "git add -A",
    "git add --all",
    "git stash drop",
    "git stash clear",
    "gh api -X POST repos/x/merges",
    "gh api --method PATCH repos/x",
    "gh api -X DELETE repos/x",
    "gh api -X PUT repos/x/branches/main/protection",
    "gh secret set FOO",
    "gh workflow disable ci.yml",
    "gh release create v1",
    "gh repo delete x",
    "supabase db push",
    "supabase migration up",
    "supabase db reset",
    # DB-TOOLING-1. Authenticating to and binding a remote project are database
    # connection actions, and the migration workflow requires them to stay
    # Founder-gated. They were reachable before this package.
    "supabase login",
    "supabase link --project-ref abcdefghijklmnopqrst",
    "supabase db pull",
    "supabase db dump",
    "psql -c 'select 1'",
    "pg_dump db",
    "vercel deploy",
    "netlify deploy",
    "fly deploy",
    "sudo rm x",
    "rm -rf /",
    "chmod 777 .",
]

# Shapes Claude must never generate for ordinary work. The permission engine
# cannot express "discouraged", so these are asserted to be NOT autonomous —
# which is precisely why the policy in CLAUDE.md has to carry the requirement.
BAD_SHAPES = [
    "bash scripts/verify-example.sh | head -40",
    "bash scripts/verify-example.sh 2>&1 | tail -20",
    "bash scripts/verify-example.sh > /tmp/log 2>&1; echo done",
    "git push -u origin wp/example 2>&1 | tail -5",
    "printf 'a\\nb\\n' | bash scripts/ci-select-gates.sh",
    "git diff --name-only | bash scripts/ci-select-gates.sh",
    "while true; do gh pr checks 1; sleep 20; done",
    "git log --format=%H | grep -i claude",
]

failures = []
prefix_dependent = []

print("--- expected autonomous ---")
for command in EXPECT_AUTONOMOUS:
    raw = classify(command, matches_raw)
    word = classify(command, matches_word)
    if raw == "ALLOW" and word == "ALLOW":
        verdict = "ROBUST"
    elif raw == "ALLOW":
        verdict = "PREFIX-DEPENDENT"
        prefix_dependent.append(command)
    else:
        verdict = "BLOCKED"
        failures.append(f"expected autonomous but {raw}/{word}: {command}")
    print(f"  {verdict:17} {command}")

print("")
print("--- expected denied ---")
for command in EXPECT_DENIED:
    raw = classify(command, matches_raw)
    word = classify(command, matches_word)
    if raw == "DENY" and word == "DENY":
        print(f"  {'DENIED':17} {command}")
    else:
        failures.append(f"expected denied but {raw}/{word}: {command}")
        print(f"  {'NOT DENIED':17} {command}   <-- FAILURE")

print("")
print("--- prohibited command shapes ---")
print("  The permission engine cannot express 'discouraged'. Some of these are")
print("  fully PERMITTED and would run without a prompt. They are prohibited by")
print("  CLAUDE.md policy, asserted in section 1, not by the rule set. That is")
print("  the honest boundary between what tooling enforces and what discipline")
print("  must: a shape that is merely permitted is still forbidden to generate.")
print("")
policy_only = []
for command in BAD_SHAPES:
    raw = classify(command, matches_raw)
    word = classify(command, matches_word)
    if raw == "ALLOW" and word == "ALLOW":
        policy_only.append(command)
        print(f"  {'POLICY-ONLY':17} {command}")
    else:
        print(f"  {'ALSO PROMPTS':17} {command}")

print("")
print(f"allow rules: {len(allow_rules)}   deny rules: {len(deny_rules)}")
print(f"classified: {len(EXPECT_AUTONOMOUS)} autonomous, {len(EXPECT_DENIED)} denied, {len(BAD_SHAPES)} shapes")

if policy_only:
    print("")
    print(f"POLICY-ONLY ({len(policy_only)}) — permitted by the rule set, prohibited")
    print("by CLAUDE.md. Only Claude Code's own discipline prevents these.")

if prefix_dependent:
    print("")
    print(f"PREFIX-DEPENDENT ({len(prefix_dependent)}) — autonomous only if Claude Code")
    print("matches a rule prefix that ends mid-token. Not locally observable.")
    print("These are the residual prompt risk and are reported, not hidden:")
    for command in prefix_dependent:
        print(f"  - {command}")

if failures:
    print("")
    print(f"{len(failures)} CLASSIFICATION FAILURE(S):")
    for failure in failures:
        print(f"  - {failure}")
    sys.exit(1)

print("")
print("classification: no BLOCKED expectations, no denied command reachable")
PYTHON

echo ""
echo "PASS:  5. the permission acceptance matrix classifies correctly"

# ------------------------------------------------------------
# 6. The safety boundary is intact
# ------------------------------------------------------------
# Every item the Founder requires to stay gated, asserted individually. A rule
# removed here fails the gate rather than quietly widening autonomy.
#
# BOUNDED AUTONOMY added the first three. Committing, pushing a feature branch
# and opening a pull request were autonomous under the previous model; they are
# now Founder gates, and each is denied by a single rule covering every spelling
# rather than by an enumeration that a `-F` or a bare form could slip past.
for rule in \
  '"Bash(git commit:*)"' \
  '"Bash(git push:*)"' \
  '"Bash(gh pr create:*)"' \
  '"Bash(gh pr merge:*)"' \
  '"Bash(git push origin main:*)"' \
  '"Bash(git push -u origin main:*)"' \
  '"Bash(git push --set-upstream origin main:*)"' \
  '"Bash(git push --force:*)"' \
  '"Bash(git push --force-with-lease:*)"' \
  '"Bash(git push --delete:*)"' \
  '"Bash(git reset --hard:*)"' \
  '"Bash(git rebase:*)"' \
  '"Bash(git commit --amend:*)"' \
  '"Bash(git filter-branch:*)"' \
  '"Bash(git filter-repo:*)"' \
  '"Bash(git branch -D:*)"' \
  '"Bash(git clean:*)"' \
  '"Bash(git stash drop:*)"' \
  '"Bash(git stash clear:*)"' \
  '"Bash(git add .)"' \
  '"Bash(git add -A:*)"' \
  '"Bash(git add --all:*)"' \
  '"Bash(gh api -X POST:*)"' \
  '"Bash(gh api -X PUT:*)"' \
  '"Bash(gh api -X PATCH:*)"' \
  '"Bash(gh api -X DELETE:*)"' \
  '"Bash(gh secret:*)"' \
  '"Bash(gh workflow run:*)"' \
  '"Bash(gh workflow enable:*)"' \
  '"Bash(gh workflow disable:*)"' \
  '"Bash(gh release:*)"' \
  '"Bash(gh repo delete:*)"' \
  '"Bash(gh repo archive:*)"' \
  '"Bash(supabase db push:*)"' \
  '"Bash(supabase migration up:*)"' \
  '"Bash(supabase db reset:*)"' \
  '"Bash(psql:*)"' \
  '"Bash(pg_dump:*)"' \
  '"Bash(vercel deploy:*)"' \
  '"Bash(netlify deploy:*)"' \
  '"Bash(fly deploy:*)"' \
  '"Bash(rm -rf:*)"' \
  '"Bash(sudo:*)"' \
  '"Bash(chmod 777:*)"' \
  '"Bash(claude --dangerously-skip-permissions:*)"'; do
  grep -Fq "$rule" "$SETTINGS" \
    || fail "a required safety boundary is missing from the deny list: $rule"
done

# DEV-FLOW-1 recorded 63 deny rules. Autonomy work must never shrink that.
DENY_COUNT="$(python3 -c "import json;print(len(json.load(open('.claude/settings.json'))['permissions']['deny']))")"
[ "$DENY_COUNT" -ge "63" ] \
  || fail "the deny list shrank to $DENY_COUNT rules; 63 or more are required"

# No ALLOW rule may broadly reopen a Founder or safety gate.
# Inspect permissions.allow specifically because a broad git commit/push rule
# is intentionally required in permissions.deny under bounded autonomy.
python3 - "$SETTINGS" <<'PYTHON_CHECK6'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    allow = json.load(handle).get("permissions", {}).get("allow", [])

forbidden_allows = [
    "Bash(bash:*)",
    "Bash(gh:*)",
    "Bash(gh pr:*)",
    "Bash(gh api:*)",
    "Bash(git push:*)",
    "Bash(git commit:*)",
    "Bash(chmod:*)",
    "Bash(chmod +x:*)",
    "Bash(bash /tmp/:*)",
    "Bash(bash /private/tmp/:*)",
    "Bash(npm:*)",
    "Bash(:*)",
]

for rule in forbidden_allows:
    if rule in allow:
        print(
            f"FAIL: 6. an over-broad allow rule was introduced: {rule}",
            file=sys.stderr,
        )
        sys.exit(1)
PYTHON_CHECK6

echo "PASS:  6. no over-broad allow rule reopens a Founder or safety gate"

# ------------------------------------------------------------
# 7. Machine-local settings are not what makes this work
# ------------------------------------------------------------
# The matrix above loaded ONLY the committed configuration. If autonomy depended
# on a laptop-local "don't ask again" entry, it would not survive a fresh clone.
if [ -f .claude/settings.local.json ]; then
  LOCAL_ALLOW="$(python3 -c "
import json
d = json.load(open('.claude/settings.local.json'))
print(len(d.get('permissions', {}).get('allow', [])))
")"
  echo "note: .claude/settings.local.json holds $LOCAL_ALLOW machine-local rule(s),"
  echo "      deliberately excluded from the matrix above."
fi

grep -Fq 'settings.local.json' "$CLAUDE_MD" \
  || fail "CLAUDE.md does not record the machine-local settings policy"

echo "PASS:  7. autonomy rests on committed configuration only"

echo ""
echo "============================================================"
echo "AUTONOMY ACCEPTANCE TEST PASSED"
echo "The command-shape policy is mandatory and pinned."
echo "One rule covers the verifier namespace and cannot escape it."
echo "No verifier depends on the execute bit, so no chmod is needed."
echo "The selector is testable without a pipeline; CI stdin unchanged."
echo "Every Founder-gated boundary is present; nothing was widened."
echo ""
echo "This gate proves CLASSIFICATION, not lived experience. It cannot"
echo "observe whether Claude Code actually prompted. The real acceptance"
echo "signal is the next work package running without Founder clicks."
echo "============================================================"
