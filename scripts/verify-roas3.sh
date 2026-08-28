#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# ROAS-3 — the learner Router-on-a-Stick course experience.
#
# ROAS-2 authored the course and closed with an explicit limitation: "No
# learner-facing surface. The UI does not render any of this." ROAS-3 builds
# that surface. This gate proves the surface is a *view* of existing truth and
# never a second source of it.
#
# Two failures are worth engineering against, and neither shows up as a broken
# test:
#
#   1. The UI quietly re-typing the curriculum, so the screen and the reviewed
#      content drift apart. Section 3 extracts every long authored string from
#      ROAS-2 and fails if any of them appears in the web sources — a copy-paste
#      is caught by construction rather than by review.
#
#   2. The browser inventing a comfortable default — "not started", or a tidy
#      0% — when the honest answer is "we could not ask". Section 6 fails if the
#      substituted literal appears anywhere in the learner sources.
#
# Absence checks judge COMMENT-STRIPPED code, so a comment explaining a rule
# cannot satisfy the rule.
# ============================================================

WEB_DIR="apps/web/src/learning"
CONTENT="packages/shared-types/src/roas-curriculum.ts"
VIEW="$WEB_DIR/LearningView.tsx"
PRACTICE_VIEW="$WEB_DIR/PracticeCheckPanel.tsx"
PROJECTION="$WEB_DIR/roas-course-content.ts"
PRESENTATION="$WEB_DIR/roas-course-presentation.ts"
PRACTICE="$WEB_DIR/roas-practice.ts"
SERVICE="$WEB_DIR/learning-service.ts"
WORKSPACE="apps/web/src/auth/AuthenticatedApp.tsx"
SERVER="services/api/src/server.ts"

fail() { echo "GATE FAIL: $1"; exit 1; }
code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }

for p in "$CONTENT" "$VIEW" "$PRACTICE_VIEW" "$PROJECTION" "$PRESENTATION" \
         "$PRACTICE" "$SERVICE" "$WORKSPACE" "$SERVER"; do
  [ -f "$p" ] || fail "MISSING: $p"
done

# The sources to scan are assembled into FILES, not shell variables, and every
# check greps a file rather than piping a variable into grep.
#
# This is not a style preference. Under `set -o pipefail`, `echo "$BIG" | grep -q`
# returns 141 when grep matches early enough to exit while echo is still
# writing: echo takes SIGPIPE and its status wins. A *presence* check then reads
# a match as a miss, and — far worse — an *absence* check reads a real hit as
# clean and silently passes. Which of the two happens depends on where in the
# input the match sits and on the pipe buffer, so the same guard can behave
# differently on a laptop and on a runner. This gate hit exactly that: a match
# on line 39 failed in CI while a match near the end passed locally.
#
# Grepping a file removes the pipeline, and with it the whole class of bug.
SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

LEARNING_CODE="$SCAN_DIR/learning-code.txt"
LEARNING_LOGIC="$SCAN_DIR/learning-logic.txt"

cat "$PROJECTION" "$PRESENTATION" "$PRACTICE" "$SERVICE" "$VIEW" \
  "$PRACTICE_VIEW" > "$LEARNING_CODE"

{
  code_of "$PROJECTION"
  code_of "$PRESENTATION"
  code_of "$PRACTICE"
  code_of "$SERVICE"
  code_of "$VIEW"
  code_of "$PRACTICE_VIEW"
} > "$LEARNING_LOGIC"

# A scan file that came out empty would make every absence check vacuous and
# every presence check fail, so prove both are populated before relying on them.
[ -s "$LEARNING_CODE" ] || fail "the learner sources scanned empty"
[ -s "$LEARNING_LOGIC" ] || fail "the comment-stripped learner sources scanned empty"

# Per-file comment-stripped scans, for the same reason.
PRACTICE_LOGIC="$SCAN_DIR/practice-logic.txt"
PRACTICE_VIEW_LOGIC="$SCAN_DIR/practice-view-logic.txt"
SERVICE_LOGIC="$SCAN_DIR/service-logic.txt"

code_of "$PRACTICE" > "$PRACTICE_LOGIC"
code_of "$PRACTICE_VIEW" > "$PRACTICE_VIEW_LOGIC"
code_of "$SERVICE" > "$SERVICE_LOGIC"

for scan in "$PRACTICE_LOGIC" "$PRACTICE_VIEW_LOGIC" "$SERVICE_LOGIC"; do
  [ -s "$scan" ] || fail "a per-file scan came out empty: $scan"
done

echo "===== ROAS-3 COMPLETION GATE ====="
echo ""

# ------------------------------------------------------------
# 1. A learner can reach Learning, and nothing was taken away
# ------------------------------------------------------------
grep -Fq '"learning"' "$WORKSPACE" \
  || fail "the workspace has no learning view"
grep -Fq '<LearningView />' "$WORKSPACE" \
  || fail "the learning view is never rendered"
grep -Fq 'setView("learning")' "$WORKSPACE" \
  || fail "no navigation control reaches Learning"

# The pre-existing workspace sections must all survive. A learner losing
# Evidence or Certificates to gain Learning is a regression, not a feature.
for section in "Overview" "Evidence portfolio" "Certificates" \
               "Certificate eligibility" "Search" "Learning"; do
  # JSX puts a button's label on its own line, so the label is matched as a
  # whole line rather than as ">Label".
  grep -Eq "^[[:space:]]*${section}[[:space:]]*$" "$WORKSPACE" \
    || fail "the workspace no longer offers: $section"
done

for existing in EvidencePortfolioView CertificatePortfolioView \
                CertificateEligibilityView CurriculumSearchView; do
  grep -Fq "<$existing />" "$WORKSPACE" \
    || fail "an existing workspace view was removed: $existing"
done

# Navigation stays keyboard-operable platform semantics, not click handlers on
# inert elements.
if grep -qE '<(div|span|p|li)[^>]*onClick' "$LEARNING_LOGIC"; then
  fail "a non-interactive element carries a click handler and would be unreachable by keyboard"
fi

echo "PASS:  1. Learning is reachable and no existing workspace section was lost"

# ------------------------------------------------------------
# 2. The experience is assembled from the authored ROAS-2 course
# ------------------------------------------------------------
grep -Fq 'ROAS_MODULES' "$PROJECTION" \
  || fail "the course structure does not read the authored modules"
grep -Fq 'ROAS_MISSIONS' "$PROJECTION" \
  || fail "the course structure does not read the authored missions"
grep -Fq 'ROAS_COMPETENCIES' "$PROJECTION" \
  || fail "competencies are not read from the authored source"
grep -Fq 'ROAS_KNOWLEDGE_CHECKS' "$PROJECTION" \
  || fail "practice checks are not read from the authored source"
grep -Fq 'ROAS_LAB_DEFINITION.missionStableId' "$PROJECTION" \
  || fail "the demonstration mission is not derived from the lab definition"

# Ordering must come from the authored position, not from array order.
grep -Fq 'left.position - right.position' "$PROJECTION" \
  || fail "the projection does not order by the authored position"

# The projection is inert: it may not reach the network or the server.
PROJECTION_IMPORTS="$(grep -oE 'from "[^"]+"' "$PROJECTION" | sed 's/from //' | tr -d '"' \
  | LC_ALL=C sort -u | tr '\n' ' ')"
[ "$PROJECTION_IMPORTS" = "@tlp/shared-types " ] \
  || fail "the course projection imports beyond the authored content: $PROJECTION_IMPORTS"

echo "PASS:  2. the course is projected from the ROAS-2 authored content"

# ------------------------------------------------------------
# 3. The curriculum was not re-typed into the UI
# ------------------------------------------------------------
# The load-bearing check. Every authored string long enough to be content
# rather than a token is extracted from ROAS-2 and must NOT appear anywhere
# under apps/web. A brief, module description, mission title or question
# pasted into a component fails here, whatever the tests say.
#
# Comment-stripped sources are searched, so a comment quoting the course is
# still allowed to explain it.
DUPLICATED=0
while IFS= read -r authored; do
  [ -n "$authored" ] || continue
  # -e is required: an authored line may begin with "- ", which grep would
  # otherwise read as an option and skip — silently weakening this check.
  if grep -Fq -e "$authored" "$LEARNING_LOGIC"; then
    echo "  duplicated authored content: ${authored:0:72}…"
    DUPLICATED=$((DUPLICATED + 1))
  fi
done <<EOF
$(grep -oE '"[^"]{60,}"' "$CONTENT" | sed 's/^"//' | sed 's/"$//' | LC_ALL=C sort -u)
EOF

[ "$DUPLICATED" = "0" ] \
  || fail "$DUPLICATED authored string(s) were copied into the web sources; the UI must project the ROAS-2 content, not restate it"

# The approved counts are never hardcoded as a structural constant either.
if grep -qE '(modules|missions)\.length\s*(===|==)\s*[0-9]' "$LEARNING_LOGIC"; then
  fail "the UI pins a module or mission count instead of rendering what is authored"
fi

echo "PASS:  3. no authored curriculum text or count was duplicated into the UI"

# ------------------------------------------------------------
# 4. Mission instruction reaches the learner as authored
# ------------------------------------------------------------
grep -Fq 'parseMissionBrief' "$PROJECTION" \
  || fail "there is no path from the authored brief to the screen"
grep -Fq 'authored.brief' "$PROJECTION" \
  || fail "the mission projection does not read the authored brief"
grep -Fq 'mission.brief.map' "$VIEW" \
  || fail "the mission view never renders the brief"

# Competencies are taught in words. The architectural identity must not be the
# thing a learner is shown.
grep -Fq 'competency.title' "$VIEW" \
  || fail "the mission view does not name competencies in human-readable terms"
grep -Fq 'competency.description' "$VIEW" \
  || fail "the mission view does not explain what a competency means"
# A stable id may be a React key, a DOM id or part of a template literal — all
# attribute positions the learner never reads. What it may never be is a JSX
# text child. The character immediately before the interpolation distinguishes
# them: "=" is an attribute, "$" is a template literal, anything else is text.
RENDERED_IDS="$(grep -oE '.\{[a-zA-Z]+\.stableId\}' "$LEARNING_LOGIC" \
  | grep -vE '^[=$]' || true)"

if [ -n "$RENDERED_IDS" ]; then
  echo "$RENDERED_IDS"
  fail "an internal stable identifier is rendered into learner-facing text"
fi

# Every mission must carry a required competency through the projection, which
# is what makes the course publishable at all.
grep -Fq 'requiredCompetencies' "$PROJECTION" \
  || fail "the projection loses the required-competency distinction"

echo "PASS:  4. authored mission instruction and competencies reach the learner"

# ------------------------------------------------------------
# 5. Practice cannot manufacture evidence or competency
# ------------------------------------------------------------
# Mechanism one: the practice module physically cannot reach the server.
PRACTICE_IMPORTS="$(grep -oE 'from "[^"]+"' "$PRACTICE" | sed 's/from //' | tr -d '"' \
  | LC_ALL=C sort -u | tr '\n' ' ')"
[ "$PRACTICE_IMPORTS" = "@tlp/shared-types " ] \
  || fail "the practice module can reach beyond the shared contract: $PRACTICE_IMPORTS"

# Precise reach targets, not the bare words: this module's own error message
# names the attempt lifecycle in order to refuse it, and a substring match on
# "attempt" would fire on the guard that makes the module safe.
for forbidden in apiRequest 'fetch(' accessToken supabase '/assessments' \
                 'assessment-attempts' attemptId evidenceId '/evidence' \
                 competencyStableId; do
  if grep -qF -e "$forbidden" "$PRACTICE_LOGIC"; then
    fail "the practice module reaches something it must not: $forbidden"
  fi
done

# The practice component must not acquire a token or a service either.
for forbidden in useAuth apiRequest accessToken learning-service; do
  if grep -qF -e "$forbidden" "$PRACTICE_VIEW_LOGIC"; then
    fail "the practice component can reach the server: $forbidden"
  fi
done

# Mechanism two: it refuses anything that is not authored practice.
grep -Fq 'definition.purpose !== "practice"' "$PRACTICE" \
  || fail "the practice path does not refuse a non-practice assessment"
grep -Fq 'definition.competencyMappings.length > 0' "$PRACTICE" \
  || fail "the practice path does not refuse an assessment mapped to a competency"
grep -Fq 'assertPracticeOnly(definition)' "$PRACTICE" \
  || fail "scorePractice does not enforce the practice-only guard"

# Scoring is the shared contract, not a second implementation.
grep -Fq 'scoreAssessment' "$PRACTICE" \
  || fail "practice scoring does not reuse the shared assessment contract"
if grep -qE 'earnedPoints\s*\+=' "$PRACTICE_LOGIC"; then
  fail "the practice module implements its own scoring loop"
fi

# The learner is told what practice is, every time.
grep -Fq 'describePracticeAuthority' "$VIEW" \
  || fail "the course never states that practice is not recorded"
grep -Fq 'not recorded' "$PRACTICE" \
  || fail "the practice wording no longer says results are not recorded"

# And nothing anywhere in the learner surface writes evidence or competency.
if grep -qE '/evidence|/certificates|competencyState|awardCompetency|competency_demonstrated"\s*\)' "$LEARNING_LOGIC"; then
  fail "the learner course surface reaches an evidence or competency write"
fi

echo "PASS:  5. practice is provably practice and produces no evidence"

# ------------------------------------------------------------
# 6. Server state is read, never invented
# ------------------------------------------------------------
# The substitution this package exists to prevent. A quoted "not_started"
# anywhere in the learner sources would mean the browser can decide a learner
# has not begun something it never actually asked about.
if grep -qF -e '"not_started"' "$LEARNING_LOGIC"; then
  fail "the learner surface can substitute a not-started state the server never sent"
fi

# The unknown case must be a distinct variant carrying no state at all, so the
# substitution cannot be reintroduced without a type error.
grep -Fq '{ known: false; label: string }' "$PRESENTATION" \
  || fail "the unknown-progress case is not a state-free variant and could be filled in"
grep -Fq 'known: false' "$PRESENTATION" \
  || fail "there is no unknown-progress case at all"

# Completion is the server's aggregation. The browser must not compute one.
# Assignment or construction only. Reading `progress.completedMissions === 0`
# is the correct behaviour and must not be caught, so the comparison operator
# is excluded rather than the identifier.
for forbidden in 'completionPercent[[:space:]]*=[^=]' \
                 'completedMissions[[:space:]]*=[^=]' \
                 'completionPercent:' 'completedMissions:'; do
  if grep -qE "$forbidden" "$LEARNING_LOGIC"; then
    fail "the browser computes course completion instead of reading it: $forbidden"
  fi
done
grep -Fq 'progress.completionPercent' "$PRESENTATION" \
  || fail "the course summary does not read the server's own completion figure"

# Availability is classified from what the server said, with distinct states.
for state in '"available"' '"not_published"' '"unauthorized"' '"unavailable"' '"loading"'; do
  grep -Fq "$state" "$PRESENTATION" \
    || fail "a required course availability state is missing: $state"
done
grep -Fq 'progressRecorded: false' "$PRESENTATION" \
  || fail "availability does not fail closed on recording progress"
if grep -Fq 'progressRecorded: true' "$PRESENTATION"; then
  RECORDED_TRUE="$(grep -c 'progressRecorded: true' "$PRESENTATION")"
  [ "$RECORDED_TRUE" = "1" ] \
    || fail "progress is treated as recorded in $RECORDED_TRUE places; exactly one (the available case) is expected"
else
  fail "progress can never be recorded, so the course could not work when published"
fi

# Every progress control is gated on that single decision.
grep -Fq 'canRecordMissionProgress' "$VIEW" \
  || fail "progress controls are not gated on server authority"
grep -Fq 'disabled={!canRecord' "$VIEW" \
  || fail "a progress control is offered even when progress cannot be saved"

# What is displayed after a write is what the server returned.
grep -Fq 'record.state' "$VIEW" \
  || fail "the view reports the requested state rather than the recorded one"

echo "PASS:  6. publication, progress and completion are read from the server"

# ------------------------------------------------------------
# 7. Only pre-existing contracts were used
# ------------------------------------------------------------
# Every route the learner service calls must already exist in the server. A
# route the UI needed and invented would appear here as a missing match.
for route in "/curriculum/paths/" "/learning/progress" "/learning/resume" \
             "/learning/next-action"; do
  grep -Fq "$route" "$SERVICE" \
    || fail "the learner service no longer uses the existing contract: $route"
  grep -Fq "$route" "$SERVER" \
    || fail "the learner service calls a route the server does not expose: $route"
done
grep -Fq '/learning/missions/' "$SERVICE" \
  || fail "mission progress is not recorded through the existing Learning route"
# The server matches this one with a regular expression, so the path appears
# escaped rather than as a plain string.
grep -Fq -e 'learning\/missions\/' "$SERVER" \
  || fail "the mission progress route does not exist on the server"
grep -Fq -e '(start|complete)' "$SERVER" \
  || fail "the server no longer accepts the start/complete progress actions"

# No server file may change. ROAS-3 is a consumer of the API, not an author of
# it: a new read model shaped for the UI is exactly the duplicate truth this
# package must not create.
CHANGED_API="$(git diff --name-only origin/main...HEAD -- services/api 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_API" = "0" ] \
  || fail "ROAS-3 changed $CHANGED_API API files; no server change is authorized in this package"

CHANGED_SHARED="$(git diff --name-only origin/main...HEAD -- packages/shared-types 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_SHARED" = "0" ] \
  || fail "ROAS-3 changed $CHANGED_SHARED shared-types files; the authored curriculum and contracts are not in scope"

# No identity is ever sent: ownership is the session's, enforced by RLS.
if grep -qE 'userId|studentId|learnerId|ownerId' "$SERVICE_LOGIC"; then
  fail "the learner service names a learner in a request; ownership is the session's"
fi

echo "PASS:  7. only pre-existing API contracts were used; no server change"

# ------------------------------------------------------------
# 8. No migration, no dependency, no provider, no AI
# ------------------------------------------------------------
MIGRATION_COUNT="$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
[ "$MIGRATION_COUNT" = "36" ] \
  || fail "the migration set changed: $MIGRATION_COUNT migrations (36 expected)"

CHANGED_DEPS="$(git diff --name-only origin/main...HEAD -- package.json package-lock.json 'apps/web/package.json' 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_DEPS" = "0" ] \
  || fail "ROAS-3 changed dependency manifests; no dependency change is authorized"

# The workspace still navigates without a router, which is why no routing
# dependency was needed.
for library in react-router @tanstack/react-router redux zustand jotai recoil \
               @mui/material antd chakra bootstrap tailwind; do
  if grep -Fq "\"$library" apps/web/package.json; then
    fail "a large convenience dependency was introduced: $library"
  fi
done

for token in proxmox pve hypervisor esxi vsphere vcenter qemu kvm libvirt \
             docker podman containerd aws azure gcp node-r620; do
  if grep -qiF -e "$token" "$LEARNING_CODE"; then
    fail "a provider-specific token entered the learner experience: $token"
  fi
done

if grep -qiE 'openai|anthropic|ollama|ai[ _-]?gateway|aigw|llm|gpt|tutor' "$LEARNING_CODE"; then
  fail "an AI dependency or AI tutor behaviour entered the learner experience"
fi

# Only the approved course. ROAS-3 authors no new one.
for later in 'linux' 'windows-' 'integrated-challenge'; do
  if grep -qF -e "\"$later" "$LEARNING_LOGIC"; then
    fail "the learner surface authored content for a later course: $later"
  fi
done

echo "PASS:  8. no migration, dependency, provider, AI or later course entered"

# ------------------------------------------------------------
# 9. The lab boundary is stated, not faked
# ------------------------------------------------------------
grep -Fq 'describeDemonstrationAvailability' "$VIEW" \
  || fail "the demonstration mission does not tell the learner where practical validation stands"
grep -Fq 'not available yet' "$PRESENTATION" \
  || fail "the course implies a lab environment exists"

# No lab session may be requested from here: the provider does not exist.
if grep -qE '/lab-sessions|/lab-providers|startLab|provisionLab' "$LEARNING_LOGIC"; then
  fail "the learner course tries to start a lab; no provider implements one"
fi

echo "PASS:  9. the practical demonstration is described honestly, not simulated"

# ------------------------------------------------------------
# 10. Calm, accessible, adult-learner interface
# ------------------------------------------------------------
# The platform philosophy, enforced as vocabulary. A streak or a countdown is
# a product decision this package is not authorized to make.
for pressure in streak countdown "days left" "don't lose" "keep it up" \
                badge leaderboard "points earned" "you're behind" urgent \
                "hurry" "expires in"; do
  # Comment-stripped: a comment may explain that streaks are deliberately
  # absent, which is documentation rather than a streak.
  if grep -qiF -e "$pressure" "$LEARNING_LOGIC"; then
    fail "pressure-oriented or gamified language entered the learner experience: $pressure"
  fi
done

if grep -qE 'setTimeout|setInterval|Date.now\(\)' "$LEARNING_LOGIC"; then
  fail "the learner experience introduces timing behaviour; nothing here is timed"
fi

# Semantics that make the experience operable. These are source-level
# guarantees: this repository has no rendered-DOM harness, and section 12's
# note is explicit that browser accessibility remains Human UAT.
for semantic in 'aria-labelledby' 'aria-live' 'aria-controls' 'aria-current' \
                'aria-expanded'; do
  if ! grep -qF -e "$semantic" "$LEARNING_CODE"; then
    fail "a required accessibility affordance is missing: $semantic"
  fi
done

grep -Fq '<fieldset' "$PRACTICE_VIEW" \
  || fail "practice questions are not grouped in a fieldset"
grep -Fq '<legend>' "$PRACTICE_VIEW" \
  || fail "a practice question group has no legend"
grep -Fq 'htmlFor={inputId}' "$PRACTICE_VIEW" \
  || fail "a practice option has no bound label"
grep -Fq 'type={multiple ? "checkbox" : "radio"}' "$PRACTICE_VIEW" \
  || fail "practice does not use native inputs, so keyboard behaviour would be hand-built"

# Focus is moved to the mission a learner opened, or a keyboard user is left
# where they were while the page changes around them.
grep -Fq 'headingRef.current?.focus()' "$VIEW" \
  || fail "opening a mission does not move focus to it"
grep -Fq 'tabIndex={-1}' "$VIEW" \
  || fail "the mission heading cannot receive programmatic focus"

# Status must never be conveyed by colour alone: every state is a word.
grep -Fq 'describeProgressState' "$PRESENTATION" \
  || fail "progress states are not rendered as words"

echo "PASS: 10. the interface is calm, semantic and keyboard-operable in source"

# ------------------------------------------------------------
# 11. The gate participates in the DEV-FLOW-2 workflow
# ------------------------------------------------------------
grep -Fq 'target="scripts/verify-${command_name}.sh"' scripts/run-gate.sh \
  || fail "run-gate.sh no longer resolves a bare verifier name; npm run gate -- roas3 would break"

for roas3_path in apps/web/src/learning/LearningView.tsx \
                  apps/web/src/learning/roas-practice.ts \
                  scripts/verify-roas3.sh; do
  SELECTED="$(bash scripts/ci-select-gates.sh "$roas3_path")"
  case "$SELECTED" in
    scripts/verify-roas3.sh*) ;;
    *) fail "$roas3_path does not select this gate; it selected: $SELECTED" ;;
  esac
done

echo "PASS: 11. the gate resolves through the verifier namespace and owns its paths"

# ------------------------------------------------------------
# 12. The experience is proved by tests, and ROAS-2 remains green
# ------------------------------------------------------------
for suite in roas-course-content roas-course-presentation roas-practice; do
  [ -f "$WEB_DIR/$suite.test.ts" ] \
    || fail "the learner experience has no tests for: $suite"
done

# A test asserting an authored literal would pass while the UI drifted from the
# reviewed curriculum, so the tests must compare against the source too.
grep -Fq 'ROAS_MISSIONS' "$WEB_DIR/roas-course-content.test.ts" \
  || fail "the projection tests do not compare against the authored curriculum"

echo ""
if [ "${TLP_CI_BASELINE_VERIFIED:-}" = "1" ]; then
  echo "--- ROAS-3 learner tests: SKIPPED ---"
  echo "TLP_CI_BASELINE_VERIFIED=1 — the hardened CI baseline already ran the"
  echo "full web suite, which includes every learning test."
else
  echo "--- running the ROAS-3 learner tests ---"
  npm run test --workspace @tlp/web -- src/learning
fi

echo ""
echo "--- deferring to the ROAS-2 authored curriculum gate ---"
bash scripts/verify-roas2.sh

echo ""
echo "============================================================"
echo "ROAS-3 LEARNER COURSE EXPERIENCE VERIFIED"
echo "A signed-in learner can reach Learning, open Router-on-a-Stick,"
echo "and work through 4 modules and 7 missions rendered from the"
echo "ROAS-2 authored content — no curriculum text is duplicated in"
echo "the UI. Publication, progress, resume and next action are read"
echo "from existing Curriculum and Learning routes; the browser"
echo "computes no completion and substitutes no default. Practice"
echo "cannot reach the server at all and refuses any assessment that"
echo "is not authored practice."
echo ""
echo "This gate proves the LEARNER SURFACE only. It does NOT prove:"
echo "  - that the curriculum has been published to any database"
echo "  - that a lab exists (no provider implements the demonstration)"
echo "  - real browser, screen-reader or keyboard behaviour"
echo "  - instructional flow or clarity, which is a Founder judgement"
echo "============================================================"
