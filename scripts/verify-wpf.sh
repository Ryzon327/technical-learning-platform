#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# WP-F COMPLETION GATE — the mission-step renderer.
#
# ## What this gate is for
#
# `mission-instruction-presentation.test.ts` proves everything WP-F can prove
# with values: which source is selected, which failures may fall back, what the
# learner is told. It cannot prove anything about MARKUP, because this
# repository has no rendered-DOM harness and WP-F may not add one — a dependency
# change fails verify-roas3.sh.
#
# So this gate takes the other half: the structural properties of the renderer
# that only source inspection can establish. Between them there is no part of
# WP-F that rests on nobody having made a mistake.
#
# ## Deliberately not brittle
#
# Every check below tests a PROPERTY, not a formatting choice. Nothing here
# fails on whitespace, prop order, line breaks, quote style or where a comment
# sits. A check that rejected harmless formatting would be reverted the first
# time it fired, and a gate people route around protects nothing.
#
# ## Absence checks judge comment-stripped code
#
# A comment explaining why a thing is forbidden must not itself trip the check
# that forbids it. Several comments in these files name `expectedOutcome`,
# `dangerouslySetInnerHTML` and `apiRequest` precisely in order to say they are
# absent.
#
# ## No pipelines into grep
#
# Under `set -o pipefail`, `echo "$BIG" | grep -q` can return 141 when grep exits
# on an early match while echo is still writing. A presence check then reads a
# match as a miss, and an absence check reads a real hit as clean — silently
# passing a violation. verify-roas3.sh hit exactly that in CI. Every check here
# greps a FILE.
# ============================================================

RENDERER="apps/web/src/learning/MissionInstruction.tsx"
PRESENTATION="apps/web/src/learning/mission-instruction-presentation.ts"
PRESENTATION_TEST="apps/web/src/learning/mission-instruction-presentation.test.ts"
SERVICE="apps/web/src/learning/learning-service.ts"
VIEW="apps/web/src/learning/LearningView.tsx"
CONTRACT="packages/shared-types/src/mission-instruction.ts"
STEP_MODEL="packages/shared-types/src/mission-steps.ts"

fail() { echo "GATE FAIL: $1"; exit 1; }

echo "===== WP-F MISSION-STEP RENDERER GATE ====="
echo ""

for p in "$RENDERER" "$PRESENTATION" "$PRESENTATION_TEST" "$SERVICE" "$VIEW" \
         "$CONTRACT" "$STEP_MODEL"; do
  [ -f "$p" ] || fail "MISSING: $p"
done

# Comment-stripped copies, assembled as files rather than shell variables.
SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

RENDERER_LOGIC="$SCAN_DIR/renderer-logic.txt"
PRESENTATION_LOGIC="$SCAN_DIR/presentation-logic.txt"
SERVICE_LOGIC="$SCAN_DIR/service-logic.txt"
WPF_LOGIC="$SCAN_DIR/wpf-logic.txt"

code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }

code_of "$RENDERER" > "$RENDERER_LOGIC"
code_of "$PRESENTATION" > "$PRESENTATION_LOGIC"
code_of "$SERVICE" > "$SERVICE_LOGIC"
cat "$RENDERER_LOGIC" "$PRESENTATION_LOGIC" > "$WPF_LOGIC"

# ------------------------------------------------------------
# 1. The renderer exists inside the existing learner surface
# ------------------------------------------------------------
# WP-F must not become a second mission page. The renderer lives in the learning
# package, is used by the view that already owns the mission, and is reached
# through MissionDetail rather than through a route or a navigation entry.
grep -Fq 'export function MissionInstruction' "$RENDERER" \
  || fail "MissionInstruction is not exported from the renderer"

grep -Fq 'MissionInstruction' "$VIEW" \
  || fail "the existing learner view does not use the renderer"

grep -Fq 'from "./MissionInstruction"' "$VIEW" \
  || fail "the learner view does not import the renderer from the learning package"

# No second navigation path and no second mission destination.
if grep -qE 'react-router|createBrowserRouter|useNavigate|window\.location\s*=' "$WPF_LOGIC"; then
  fail "WP-F introduced navigation; the workspace navigates with local state"
fi

echo "PASS:  1. the renderer is part of the existing mission experience"

# ------------------------------------------------------------
# 2. No arbitrary markup anywhere in the instruction path
# ------------------------------------------------------------
# React text escaping is the entire safety boundary for authored instructional
# content, which is what lets the platform teach HTML, shell and security
# material without any of it being pattern-matched or rejected. Opening a raw
# markup path would remove that boundary.
for forbidden in dangerouslySetInnerHTML innerHTML outerHTML \
                 insertAdjacentHTML document.write eval Function; do
  if grep -qF -e "$forbidden" "$WPF_LOGIC"; then
    fail "WP-F opens a markup or evaluation path: $forbidden"
  fi
done

# No markdown or HTML parsing library was reached for either.
if grep -qiE 'marked|showdown|remark|rehype|markdown-it|dompurify|sanitize-html' "$WPF_LOGIC"; then
  fail "WP-F reaches for a markup renderer or sanitizer; authored content is inert text"
fi

echo "PASS:  2. authored content is inert text, escaped by React"

# ------------------------------------------------------------
# 3. Protected content cannot be rendered
# ------------------------------------------------------------
# `expectedOutcome` is absent from the learner type, so this is a second lock on
# a door that is already welded shut: a line trying to read it would not
# compile. It is checked anyway because the cost of finding out late is a
# published answer key.
if grep -qF -e 'expectedOutcome' "$WPF_LOGIC"; then
  fail "WP-F names expectedOutcome in code; it must remain unreachable"
fi

# And the contract it depends on must still not carry the field.
#
# This was written as `grep -q … | grep -qv …`, which could never fail: `-q`
# prints nothing, so the second grep read empty input and always exited 1. The
# check has therefore been dead since it was written — the exact pipeline
# hazard this file's own header warns about, in the file that warns about it.
#
# Judged on comment-stripped code instead, so the module may go on EXPLAINING
# that the field is withheld — which it does at length — while a real member
# would fail. That distinction is why the raw grep could not be used directly.
CONTRACT_LOGIC="$SCAN_DIR/contract-logic.txt"
code_of "$CONTRACT" > "$CONTRACT_LOGIC"

if grep -qF 'expectedOutcome' "$CONTRACT_LOGIC"; then
  fail "the learner contract gained an expectedOutcome member"
fi

# No attempt to recover assessment content through a practice step.
for forbidden in ROAS_KNOWLEDGE_CHECKS assessment_questions answerKey \
                 correctOption scorePractice scoreAssessment; do
  if grep -qF -e "$forbidden" "$WPF_LOGIC"; then
    fail "WP-F reaches for assessment content: $forbidden"
  fi
done

echo "PASS:  3. withheld content stays unreachable from the renderer"

# ------------------------------------------------------------
# 4. The renderer is not a data-access boundary
# ------------------------------------------------------------
# LearningView owns fetching. A component that acquired a token or called the
# API directly would be a second place where the set of consumed contracts has
# to be read off, and would bypass the one feature service.
for forbidden in apiRequest 'fetch(' accessToken useAuth Authorization Bearer; do
  if grep -qF -e "$forbidden" "$RENDERER_LOGIC"; then
    fail "the renderer reaches the network or holds a credential: $forbidden"
  fi
done

for forbidden in createServerSupabaseClient createUserScopedSupabaseClient \
                 '@supabase/supabase-js' 'service_role' SUPABASE_SERVICE; do
  if grep -qF -e "$forbidden" "$WPF_LOGIC"; then
    fail "WP-F performs its own data access or names a privileged client: $forbidden"
  fi
done

# The presentation module is pure: it may reach the shared contract and the
# existing brief parser, and nothing else.
PRESENTATION_IMPORTS="$(grep -oE 'from "[^"]+"' "$PRESENTATION" | sed 's/from //' | tr -d '"' \
  | LC_ALL=C sort -u | tr '\n' ' ')"
[ "$PRESENTATION_IMPORTS" = "./roas-course-content @tlp/shared-types " ] \
  || fail "the presentation module imports beyond the contract and the brief parser: $PRESENTATION_IMPORTS"

echo "PASS:  4. the renderer holds no credential and performs no data access"

# ------------------------------------------------------------
# 5. WP-E remains authoritative; the frontend does not validate
# ------------------------------------------------------------
# Re-checking what WP-E already decided would be a second answer to the same
# question, and the two would eventually disagree.
for forbidden in validateMissionStep validateMissionSteps \
                 resolveMissionStepsForRead resolvePersistedMissionSteps \
                 validateCurriculumAsset resolvePersistedCurriculumAssets \
                 findUnresolvedAssetReferences isMissionStepType; do
  if grep -qF -e "$forbidden" "$WPF_LOGIC"; then
    fail "WP-F re-implements curriculum validation in the browser: $forbidden"
  fi
done

echo "PASS:  5. WP-E's projection is authoritative and is not re-validated"

# ------------------------------------------------------------
# 6. All seven approved types are handled, and no eighth
# ------------------------------------------------------------
# The vocabulary is closed by DEC-054 and owned by packages/shared-types. A type
# handled here that the shared contract does not define would be frontend-created
# curriculum vocabulary.
for step_type in concept diagram command prediction interaction practice reference; do
  grep -Fq "case \"$step_type\":" "$RENDERER" \
    || fail "the renderer does not handle the approved step type: $step_type"
done

HANDLED="$(grep -cE '^\s*case "' "$RENDERER_LOGIC" || true)"
[ "$HANDLED" = "7" ] \
  || fail "the renderer handles $HANDLED step types; exactly 7 are approved"

# The shared vocabulary still has exactly seven entries, so the count above is
# measured against the contract rather than against a number typed here.
AUTHORED_TYPES="$(grep -cE '^\s{2}"[a-z]+"' "$STEP_MODEL" || true)"
[ "$AUTHORED_TYPES" -ge 7 ] \
  || fail "the shared step vocabulary no longer lists the approved types"

echo "PASS:  6. exactly the seven approved step types are rendered"

# ------------------------------------------------------------
# 7. The two accessibility fields keep their distinct roles
# ------------------------------------------------------------
# asset.altText answers "what does this depict" and belongs in alt, where it
# stands in for the image. step.textAlternative answers "what does this teach
# here" and is instruction every learner should read. Swapping them hands a
# screen-reader user a paragraph of teaching where a description belongs, and
# withholds that teaching from everyone else.
grep -Fq 'alt={asset.altText' "$RENDERER" \
  || fail "the image alt attribute is not bound to the asset's own alt text"

if grep -qE 'alt=\{[^}]*textAlternative' "$RENDERER_LOGIC"; then
  fail "a step's textAlternative was substituted into the image alt attribute"
fi

if grep -qE 'alt=\{[^}]*textEquivalent' "$RENDERER_LOGIC"; then
  fail "an interaction's textEquivalent was substituted into an alt attribute"
fi

# Both authored alternatives must reach the page as visible children.
grep -Fq '{content.textAlternative}' "$RENDERER" \
  || fail "a diagram's instructional text alternative is not rendered for the learner"

grep -Fq '{content.textEquivalent}' "$RENDERER" \
  || fail "an interaction's authored text equivalent is not rendered for the learner"

# A command and its result must be distinguishable without sight.
grep -Fq 'describeCommandLabel' "$RENDERER" \
  || fail "a command block carries no accessible label"
grep -Fq 'describeCommandOutputLabel' "$RENDERER" \
  || fail "a command result carries no accessible label"

echo "PASS:  7. depiction and instruction remain separate accessible paths"

# ------------------------------------------------------------
# 8. Links are safe and identities are never learner-facing
# ------------------------------------------------------------
grep -Fq 'rel="noreferrer noopener"' "$RENDERER" \
  || fail "an external reference link carries no safe rel attribute"

# A stable id may be a React key, a DOM id or part of a template literal. What it
# may never be is a JSX text child. The character immediately before the
# interpolation distinguishes them: "=" is an attribute, "$" is a template
# literal, anything else is rendered text.
RENDERED_IDS="$(grep -oE '.\{[a-zA-Z.]*[sS]tableId\}' "$RENDERER_LOGIC" \
  | grep -vE '^[=$]' || true)"

if [ -n "$RENDERED_IDS" ]; then
  echo "$RENDERED_IDS"
  fail "an internal stable identifier is rendered as learner-facing text"
fi

# A practice step must not become a control that cannot do anything.
if grep -qE '<button[^>]*disabled' "$RENDERER_LOGIC"; then
  fail "the renderer offers a disabled control; an action that does nothing reads as broken"
fi

# Nothing offers to run a displayed command.
if grep -qiE 'onClick[^}]*(run|execute|launch)' "$RENDERER_LOGIC"; then
  fail "a command step offers to execute; a command is a display artefact"
fi

echo "PASS:  8. links are safe and no internal identity reaches the learner"

# ------------------------------------------------------------
# 9. One instructional source, and the legacy path survives
# ------------------------------------------------------------
# The single-source rule is enforced by the shape of InstructionSource: one
# tagged variant carries one payload, so there is nothing to combine.
grep -Fq 'selectInstructionSource' "$PRESENTATION" \
  || fail "there is no single instruction-source decision"
grep -Fq 'selectInstructionSource' "$VIEW" \
  || fail "the learner view does not route instruction through the source decision"

# The instruction request must be scoped to the mission it belongs to.
#
# Architecture review found a race here. The state was three loose values reset
# inside an effect keyed by the selected mission, and an effect runs AFTER the
# render that scheduled it — so on the render where the selection changed, the
# previous mission's response was still present and still consumable, and its
# structured instruction could appear under the new mission's heading. The
# AbortController did not cover it: that stops a late response ARRIVING, and
# this was a stale READ of one that already had.
#
# These three checks pin the fix as a property rather than as a timing hope.
grep -Fq 'MissionInstructionRequest' "$PRESENTATION" \
  || fail "the instruction request state is not modelled"

grep -Fq 'request.missionStableId !== missionStableId' "$PRESENTATION" \
  || fail "the instruction source is not scoped to the mission being rendered"

# The view must hand the selector the mission it is asking about, and must hold
# no loose instruction state beside the tagged request.
for forbidden in 'setInstruction(' 'setInstructionErrorCode(' \
                 'setInstructionLoading('; do
  if grep -qF -e "$forbidden" "$VIEW"; then
    fail "the learner view holds untagged instruction state: $forbidden"
  fi
done

grep -Fq 'selectInstructionSource(' "$VIEW" \
  || fail "the learner view does not call the scoped source decision"

for kind in structured legacy bundled unavailable; do
  grep -Fq "\"$kind\"" "$PRESENTATION" \
    || fail "the instruction source model is missing the $kind case"
done

# content_error must be decided before any fallback is considered, so it can
# never reach one. CURR-010 section 13.2.
grep -Fq 'content_error' "$PRESENTATION" \
  || fail "the source decision does not handle content_error"

# The bundled ROAS brief stays. WP-G owns retiring it, not WP-F, and removing it
# now would make every existing mission unreadable while mission_steps is
# unavailable remotely.
grep -Fq 'mission.brief.map' "$VIEW" \
  || fail "the bundled brief path was removed; it is the transitional fallback"
grep -Fq 'parseMissionBrief' "$PRESENTATION" \
  || fail "the legacy brief is not parsed with the existing brief parser"

# The service call exists and names no learner.
grep -Fq 'loadMissionInstruction' "$SERVICE" \
  || fail "the feature service has no mission instruction read"
grep -Fq '/instruction' "$SERVICE" \
  || fail "the feature service does not call the WP-E instruction route"
if grep -qE 'userId|studentId|learnerId|ownerId' "$SERVICE_LOGIC"; then
  fail "the learner service names a learner in a request; ownership is the session's"
fi

echo "PASS:  9. one source at a time, and the legacy path is intact"

# ------------------------------------------------------------
# 10. No migration, no dependency, no scope expansion
# ------------------------------------------------------------
shasum -a 256 -c scripts/migration-baseline.sha256 --quiet \
  || fail "a migration this package was written against was modified"

CHANGED_LOCK="$(git diff --name-only origin/main...HEAD -- package-lock.json 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_LOCK" = "0" ] \
  || fail "the lockfile changed; no dependency change is authorized in this package"

CHANGED_WEB_DEPS="$(git diff origin/main...HEAD -- apps/web/package.json 2>/dev/null | grep -cE '^\+.*"(dependencies|devDependencies)"|^\+\s+"[^"]+": "\^?[0-9~]' || true)"
[ "$CHANGED_WEB_DEPS" = "0" ] \
  || fail "the web workspace gained $CHANGED_WEB_DEPS dependency line(s); none is authorized"

# WP-F consumes the shared contract. It does not own it.
#
# ## Why this is no longer a file-level ownership assertion
#
# This check used to require that mission-instruction.ts, mission-steps.ts,
# curriculum-assets.ts, curriculum.ts and server.ts had not changed at all
# since origin/main. That was correct while WP-F was the package under
# construction, and became wrong the moment a later approved package extended
# the same contract: WP-H added the interaction registry, the typed interaction
# parameters and the ObservationModel to two of those files by approved design.
#
# A file-level assertion cannot tell an authorized extension from a regression.
# It reads any evolution of a shared file as a WP-F violation, which makes a
# permanent gate hostile to every later work package that touches the same
# contract — and the failure it reports names the wrong package.
#
# It was also **untestable locally**: `origin/main...HEAD` is empty in a working
# tree whose changes are uncommitted, so the check could only ever fire in CI.
# A gate that cannot fail on the machine where the work is done is a gate that
# is discovered late, which is exactly what happened.
#
# So the invariant is expressed as the PROPERTIES WP-F depends on. A later
# package may extend these files; it may not remove what this renderer needs.
# That distinguishes authorized later evolution through the WP-F seam from an
# unauthorized regression to WP-F.

# The WP-E read path still exists and is still the user-scoped one. WP-F renders
# whatever this returns, so a read that stopped being RLS-scoped would silently
# widen what the renderer displays.
grep -Fq 'export async function getLearnerMissionInstruction' \
  services/api/src/curriculum.ts \
  || fail "the WP-E mission instruction read was removed"
grep -Fq 'createUserScopedSupabaseClient' services/api/src/curriculum.ts \
  || fail "the WP-E instruction read is no longer user-scoped"

grep -Fq '/instruction$' services/api/src/server.ts \
  || fail "the WP-E instruction route was removed"

# The three instruction states the renderer branches on. A fourth is fine; a
# missing one would leave the renderer with an unhandled response.
for state in available legacy_brief content_error; do
  grep -Fq "\"$state\"" "$CONTRACT" \
    || fail "the learner instruction contract lost the $state outcome"
done

# The projection WP-F consumes, and the assembly that enforces authored order
# and asset resolution before anything reaches this renderer.
grep -Fq 'export function projectMissionStepContent' "$CONTRACT" \
  || fail "the learner step projection was removed"
grep -Fq 'export function assembleLearnerInstruction' "$CONTRACT" \
  || fail "the learner instruction assembly was removed"

# The accessibility fields WP-F renders are required by the learner types, so a
# later package cannot make them optional and quietly drop them.
grep -Fq 'readonly textAlternative: string' "$CONTRACT" \
  || fail "a diagram's text alternative is no longer required on the learner type"
grep -Fq 'readonly textEquivalent: string' "$CONTRACT" \
  || fail "an interaction's text equivalent is no longer required on the learner type"

# The closed vocabulary is still exactly seven. Check 6 proves the renderer
# handles seven; this proves seven is still the number to handle, so adding an
# eighth authored type without a renderer cannot pass both.
AUTHORED_TYPE_COUNT="$(grep -cE '^\s{2}"[a-z]+"' "$STEP_MODEL" || true)"
[ "$AUTHORED_TYPE_COUNT" = "7" ] \
  || fail "the shared step vocabulary declares $AUTHORED_TYPE_COUNT types; exactly 7 are approved"

# No AI, no lab provider, no interaction engine pulled forward.
if grep -qiE 'openai|anthropic|ollama|ai[ _-]?gateway|aigw|llm|gpt|tutor' "$WPF_LOGIC"; then
  fail "an AI dependency or AI tutor behaviour entered the mission renderer"
fi

if grep -qiE 'packet[ _-]?journey|observationModel|simulate' "$WPF_LOGIC"; then
  fail "WP-H interaction behaviour was pulled forward into WP-F"
fi

echo "PASS: 10. no migration, dependency, contract or future-scope change"

# ------------------------------------------------------------
# 11. The gate resolves through the verifier namespace
# ------------------------------------------------------------
[ -f scripts/verify-wpf.sh ] \
  || fail "this gate is not resolvable as scripts/verify-wpf.sh"

grep -Fq 'scripts/verify-wpf.sh' scripts/ci-select-gates.sh \
  || fail "the gate is not registered in change-relevant gate selection"

echo "PASS: 11. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# WP-F tests
# ------------------------------------------------------------
echo ""
echo "--- running the WP-F presentation tests ---"
npm run test --workspace @tlp/web -- src/learning/mission-instruction-presentation

echo ""
echo "--- deferring to the ROAS-3 learner surface gate ---"
bash scripts/verify-roas3.sh

echo ""
echo "=========================================================="
echo "WP-F MISSION-STEP RENDERER VERIFIED"
echo ""
echo "The learner sees WP-E's authorized instruction inside the"
echo "mission that already existed. Exactly one instructional"
echo "source renders at a time; a content error falls back to"
echo "nothing. Authored content is inert text escaped by React,"
echo "the renderer holds no credential and validates nothing,"
echo "and the two accessibility alternatives keep their separate"
echo "roles."
echo ""
echo "This gate proves SOURCE STRUCTURE and pure logic. It does NOT prove:"
echo "  - how any of it looks or reads on a real screen"
echo "  - screen-reader, keyboard or responsive behaviour"
echo "  - anything about structured content in a real database;"
echo "    mission_steps is authored as a migration and not applied"
echo "Those remain Human UAT and are outstanding."
echo "=========================================================="
