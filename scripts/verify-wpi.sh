#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# WP-I GATE — instructional quality harness and objective properties.
#
# ## What this gate is for
#
# The WP-I suites prove behaviour: what the fixture projects to at each support
# level. They cannot prove ABSENCE across the package — that the development
# surface is not reachable in production, that it defines no second scenario,
# that it holds no data-access authority. Those are properties of the source and
# of the emitted bundle, and this is where they are checked.
#
# ## What this gate deliberately does NOT do
#
# It encodes no subjective judgement. There is no prose-length limit, no reading
# score, no card count and no visual heuristic that can fail CI. Instructional
# and visual quality are Human UAT, and pretending otherwise would produce a
# gate that is either meaningless or routinely overridden.
#
# Advisory signals are printed at the end. They are LABELLED advisory, they
# report numbers rather than verdicts, and they can never change the exit status.
#
# ## Property verification, not file ownership
#
# WP-F's stale check asserted that shared contract files had not changed since
# main, which failed the moment a later authorized package extended them. This
# gate asserts what WP-I DEPENDS ON instead. Later packages may extend these
# files; they may not remove what the UAT surface needs.
#
# ## No pipelines into grep
#
# Under `set -o pipefail`, `echo "$BIG" | grep -q` can return 141 when grep
# exits on an early match while echo is still writing — an absence check then
# reads a real hit as clean. Every check greps a FILE or a directory.
# ============================================================

APP="apps/web/src/App.tsx"
TARGET="apps/web/src/uat/uat-target.ts"
BUILDER="apps/web/src/uat/uat-instruction.ts"
HARNESS="apps/web/src/uat/UatHarness.tsx"
TARGET_TEST="apps/web/src/uat/uat-target.test.ts"
BUILDER_TEST="apps/web/src/uat/uat-instruction.test.ts"
RENDERER="apps/web/src/learning/MissionInstruction.tsx"
SURFACE="apps/web/src/learning/InteractionSurface.tsx"
JOURNEY="apps/web/src/learning/PacketJourney.tsx"
CONTRACT="packages/shared-types/src/mission-instruction.ts"
STYLES="apps/web/src/styles.css"
FIXTURE="content/fixtures/curriculum-architecture-example.json"
RUNBOOK="docs/Engineering-OS/WP_I_UAT_RUNBOOK.md"
SELECTOR="scripts/ci-select-gates.sh"
# WP-I correction.
PRESENTATION_MODULE="apps/web/src/learning/packet-journey-presentation.ts"
LAYOUT="apps/web/src/learning/topology-layout.ts"
LAYOUT_TEST="apps/web/src/learning/topology-layout.test.ts"
TOPOLOGY="apps/web/src/learning/TopologyView.tsx"
DEVICE="apps/web/src/learning/DeviceNode.tsx"
VITE_CONFIG="apps/web/vite.config.ts"
FIGURE="apps/web/public/uat-fixtures/fixture-topology.svg"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-I INSTRUCTIONAL QUALITY GATE ====="
echo ""

for required in "$APP" "$TARGET" "$BUILDER" "$HARNESS" "$TARGET_TEST" \
                "$BUILDER_TEST" "$RENDERER" "$SURFACE" "$JOURNEY" \
                "$CONTRACT" "$STYLES" "$FIXTURE" "$RUNBOOK" "$SELECTOR" \
                "$LAYOUT" "$LAYOUT_TEST" "$TOPOLOGY" "$DEVICE" \
                "$VITE_CONFIG" "$FIGURE" "$PRESENTATION_MODULE"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

APP_LOGIC="$SCAN_DIR/app-logic.txt"
TARGET_LOGIC="$SCAN_DIR/target-logic.txt"
BUILDER_LOGIC="$SCAN_DIR/builder-logic.txt"
HARNESS_LOGIC="$SCAN_DIR/harness-logic.txt"
UAT_LOGIC="$SCAN_DIR/uat-logic.txt"
FIXTURE_IMPORTERS="$SCAN_DIR/fixture-importers.txt"

code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }

code_of "$APP" > "$APP_LOGIC"
code_of "$TARGET" > "$TARGET_LOGIC"
code_of "$BUILDER" > "$BUILDER_LOGIC"
code_of "$HARNESS" > "$HARNESS_LOGIC"
cat "$TARGET_LOGIC" "$BUILDER_LOGIC" "$HARNESS_LOGIC" > "$UAT_LOGIC"

# ------------------------------------------------------------
# 1. The UAT surface is development-only
# ------------------------------------------------------------
grep -Fq 'import.meta.env.DEV' "$APP" \
  || fail "the UAT surface is not guarded by a development-mode check"

grep -Fq 'lazy(() => import("./uat/UatHarness"))' "$APP" \
  || fail "the harness is not loaded through a dynamic import"

# A static import would defeat the guard entirely: the module and the fixture
# it carries would be linked into the learner bundle regardless of the branch.
if grep -qE '^\s*import .*from "\./uat/UatHarness"' "$APP_LOGIC"; then
  fail "the harness is statically imported into the application entry path"
fi

grep -Fq 'readUatTargetFromPath' "$APP" \
  || fail "the application does not use the pure UAT path reader"

echo "PASS:  1. the UAT surface is development-only and dynamically loaded"

# ------------------------------------------------------------
# 2. The path grammar cannot intercept a learner route
# ------------------------------------------------------------
grep -Fq 'export function readUatTargetFromPath' "$TARGET" \
  || fail "there is no pure UAT path reader"

# One exact path. A prefix match would swallow learner routes.
grep -Fq '^\/uat\/' "$TARGET" \
  || fail "the UAT path reader does not anchor its pattern"

# Matched against the PATHNAME specifically. `includes` on the closed target
# vocabulary is a membership test and is correct; `pathname.includes(...)` would
# be a loose match that could swallow a learner route.
if grep -qE 'pathname\.(startsWith|includes|indexOf)' "$TARGET_LOGIC"; then
  fail "the UAT path reader matches the pathname loosely rather than by anchored pattern"
fi

# No router was introduced. The workspace navigates with local state.
if grep -qE 'react-router|createBrowserRouter|useNavigate' "$UAT_LOGIC"; then
  fail "WP-I introduced routing; the workspace navigates with local state"
fi

echo "PASS:  2. the UAT path is exact and introduces no router"

# ------------------------------------------------------------
# 3. Exactly one fixture source, imported only by the harness
# ------------------------------------------------------------
grep -Fq 'curriculum-architecture-example.json' "$HARNESS" \
  || fail "the harness does not read the architecture fixture"

if grep -qF 'curriculum-architecture-example.json' "$APP_LOGIC"; then
  fail "the application entry path imports the architecture fixture"
fi

# Only the harness and its own test may reach the fixture from the web app. A
# second importer would be a second content source in the browser.
grep -rl 'curriculum-architecture-example' apps/web/src > "$FIXTURE_IMPORTERS" || true

while IFS= read -r importer; do
  [ -n "$importer" ] || continue
  case "$importer" in
    "$HARNESS"|"$BUILDER_TEST") ;;
    *) fail "an unexpected web source reads the architecture fixture: $importer" ;;
  esac
done < "$FIXTURE_IMPORTERS"

# And the production curriculum directory still holds exactly the approved set.
#
# This asserted zero documents until WP-J/J1 authored Networking Foundations. It
# is now pinned to the approved SET rather than to a count, which is the same
# guarantee expressed against the current baseline: WP-I still authors no
# curriculum, and an unreviewed course still fails here. Relaxing it to "one or
# more" would have been the weakening; naming the file is not.
#
# The UAT harness's own isolation is unaffected and is checked above: it reads
# the fixture and nothing else, and no production document is reachable from it.
PRODUCTION_DOCS="$(find content -name '*.json' -not -path 'content/fixtures/*' 2>/dev/null \
  | LC_ALL=C sort | tr '\n' ' ')"
[ "$PRODUCTION_DOCS" = "content/curriculum/networking-foundations.json " ] \
  || fail "unexpected production curriculum documents: ${PRODUCTION_DOCS:-none}. WP-I authors none, and a new course is WP-J's to approve."

echo "PASS:  3. one fixture source, reachable only through the harness"

# ------------------------------------------------------------
# 4. The production bundle contains neither harness nor fixture
# ------------------------------------------------------------
# The strongest available proof, and it runs in CI because `npm run build`
# precedes the change-relevant gates there. Skipped politely when no build is
# present, rather than silently passing as if it had been checked.

# The fixture figure has to be SERVED, because a curriculum asset URI must be an
# absolute http or https URL (isAllowedCurriculumAssetUri) — it cannot be a
# bundler import. Vite copies `public/` into `dist/` by default, which would
# ship fixture content to learners, so the copy is turned off and `public/`
# becomes a development-only static root.
grep -Fq 'copyPublicDir: false' "$VITE_CONFIG" \
  || fail "the development-only static root would be copied into the production build"

# And the figure the fixture points at is the one that is actually served.
grep -Fq 'uat-fixtures/fixture-topology.svg' "$FIXTURE" \
  || fail "the fixture does not reference the local topology figure"

# The reserved-TLD placeholder must not come back. `.test` is guaranteed never
# to resolve (RFC 6761), so it renders as a broken image and Founder UAT read it
# as a meaningless visual — correctly.
if grep -qF 'example.test' "$FIXTURE"; then
  fail "the fixture points at a deliberately non-resolving host again"
fi

if [ -d apps/web/dist ]; then
  for marker in 'arch-fixture-path' 'arch-fixture-course' 'fixture-packet-journey' \
                'Development UAT surface' 'Instructional review harness'; do
    if grep -rqF -e "$marker" apps/web/dist; then
      fail "the production build contains a development-only marker: $marker"
    fi
  done

  # The served fixture figure is development-only for the same reason the
  # harness is, and is checked the same way.
  if [ -d apps/web/dist/uat-fixtures ]; then
    fail "the production build carries the development-only fixture assets"
  fi

  echo "PASS:  4. the production build carries no harness or fixture content"
else
  echo "SKIP:  4. no production build present; run 'npm run build' to check the bundle"
fi

# ------------------------------------------------------------
# 5. The harness reuses the real parser, projection and renderer
# ------------------------------------------------------------
grep -Fq 'parseCurriculumDocument' "$BUILDER" \
  || fail "the harness does not use the real curriculum parser"
grep -Fq 'assembleLearnerInstruction' "$BUILDER" \
  || fail "the harness does not use the real learner projection"
grep -Fq 'from "../learning/MissionInstruction"' "$HARNESS" \
  || fail "the harness does not render through the real mission renderer"

# The contracts it depends on must still exist. Properties, not ownership:
# a later package may extend these, but not remove them.
grep -Fq 'export function assembleLearnerInstruction' "$CONTRACT" \
  || fail "the shared learner assembly was removed"
grep -Fq 'export function projectMissionStepContent' "$CONTRACT" \
  || fail "the shared learner step projection was removed"
grep -Fq 'export function MissionInstruction' "$RENDERER" \
  || fail "the mission renderer was removed"
grep -Fq 'export function InteractionSurface' "$SURFACE" \
  || fail "the interaction renderer mapping was removed"
grep -Fq 'export function PacketJourney' "$JOURNEY" \
  || fail "the packet journey renderer was removed"

echo "PASS:  5. the harness reuses the real parser, projection and renderer"

# ------------------------------------------------------------
# 6. The harness defines no second scenario and no second renderer
# ------------------------------------------------------------
# A step dispatch here would be a second renderer that could drift from the one
# learners get.
if grep -qE '^\s*case "' "$UAT_LOGIC"; then
  fail "the harness dispatches on step or interaction type; that is the renderer's job"
fi

# Authored scenario content must live in the fixture, never in the harness.
for forbidden in 'packet_journey' 'resolvesFault' 'stopsAtStageId' \
                 'interactionStableId' 'textEquivalent:' 'narration:'; do
  if grep -qF -e "$forbidden" "$UAT_LOGIC"; then
    fail "the harness defines interaction content of its own: $forbidden"
  fi
done

# The support vocabulary is imported, never restated, so no UAT-only level can
# exist and no level can be silently renamed.
grep -Fq 'INTERACTION_SUPPORT_LEVELS' "$HARNESS" \
  || fail "the harness does not use the shared support-level vocabulary"
if grep -qE 'SUPPORT_LEVELS\s*=\s*\[' "$UAT_LOGIC"; then
  fail "the harness declares its own support-level vocabulary"
fi

echo "PASS:  6. no second scenario, renderer or support vocabulary"

# ------------------------------------------------------------
# 7. The harness holds no authority
# ------------------------------------------------------------
for forbidden in apiRequest 'fetch(' accessToken useAuth Authorization Bearer \
                 '@supabase/supabase-js' createClient getBrowserSupabaseClient \
                 service_role SUPABASE_; do
  if grep -qF -e "$forbidden" "$UAT_LOGIC"; then
    fail "the UAT surface reaches the network or holds a credential: $forbidden"
  fi
done

for forbidden in recordMissionProgress record_mission_progress \
                 student_learning_progress evidence_records \
                 student_competency_state competencyStableId evidenceId; do
  if grep -qF -e "$forbidden" "$UAT_LOGIC"; then
    fail "the UAT surface writes learner state: $forbidden"
  fi
done

for forbidden in 'aiGateway' 'AIProvider' 'openai' 'anthropic' 'llm'; do
  if grep -qF -e "$forbidden" "$UAT_LOGIC"; then
    fail "the UAT surface involves AI: $forbidden"
  fi
done

echo "PASS:  7. no data access, credential, learner-state write or AI"

# ------------------------------------------------------------
# 8. No networking truth model entered the UAT surface
# ------------------------------------------------------------
for forbidden in routingTable computeRoute nextHop calculateSubnet subnetMask \
                 netmask parseAddress macLearning spanningTree arpTable \
                 isReachable computeForwarding vlanForward; do
  if grep -qF -e "$forbidden" "$UAT_LOGIC"; then
    fail "the UAT surface implements networking truth: $forbidden"
  fi
done

# Bitwise operators are how an address calculator is written, and there is no
# legitimate reason for one here.
#
# Matched as SPACED operators. A bare `[^&]&[^&]` also matches HTML entities
# such as `&apos;` and `&nbsp;`, which are ordinary text — that false positive
# fired on this very file's markup and would have taught the next author to
# work around the gate rather than trust it.
if grep -qE '>>>|[^<]<<[^=<]|[^&|] & [^&|]' "$UAT_LOGIC"; then
  fail "the UAT surface performs bitwise arithmetic; addresses are authored text"
fi

echo "PASS:  8. no routing, switching, VLAN or subnet computation"

# ------------------------------------------------------------
# 9. The UAT surface is inert and semantic
# ------------------------------------------------------------
for forbidden in dangerouslySetInnerHTML innerHTML outerHTML document.write \
                 'eval(' 'new Function'; do
  if grep -qF -e "$forbidden" "$UAT_LOGIC"; then
    fail "the UAT surface opens a markup or evaluation path: $forbidden"
  fi
done

grep -Fq '<button' "$HARNESS" \
  || fail "the harness controls are not real buttons"

if grep -qE '<(div|span|li|p)[^>]*onClick' "$HARNESS_LOGIC"; then
  fail "a harness control is not a real semantic control"
fi

if grep -qE '<button[^>]*disabled' "$HARNESS_LOGIC"; then
  fail "the harness offers a disabled control"
fi

# The reviewer must be told this is not learner curriculum, or findings about
# fixture prose will be reported as platform defects.
grep -Fq 'architecture fixture' "$HARNESS" \
  || fail "the harness does not identify itself as a fixture surface"

echo "PASS:  9. the UAT surface is inert, semantic and self-identifying"

# ------------------------------------------------------------
# 10. The learner-facing contracts WP-I reviews are intact
# ------------------------------------------------------------
# Properties the review depends on. These belong to WP-F/WP-H; WP-I asserts
# only that they still hold, and claims ownership of none of them.
grep -Fq 'readonly textEquivalent: string' "$CONTRACT" \
  || fail "an interaction's text equivalent is no longer required on the learner type"
grep -Fq 'readonly textAlternative: string' "$CONTRACT" \
  || fail "a diagram's text alternative is no longer required on the learner type"
grep -Fq 'withholdsEntireInteraction' "$CONTRACT" \
  || fail "whole-interaction withholding was removed from the projection"
grep -Fq 'withholdsAnswerRevealingContent' "$CONTRACT" \
  || fail "answer-revealing withholding was removed from the projection"

grep -Fq 'aria-live' "$JOURNEY" \
  || fail "the interaction no longer announces progression"
grep -Fq 'outcomeLabel' "$JOURNEY" \
  || fail "a stage outcome is no longer stated in words"

grep -Fq 'prefers-reduced-motion' "$STYLES" \
  || fail "reduced-motion support was removed"

echo "PASS: 10. the contracts under review are intact"

# ------------------------------------------------------------
# 10b. The Founder UAT corrections hold (WP-I correction)
# ------------------------------------------------------------
# Properties, one per finding, so a regression names the finding it undoes.

# FINDING 6 — a committed prediction must not read as a reset. It stays on
# screen from the moment it is made, and it pairs with what actually happened.
grep -Fq 'pendingCommitment' "$JOURNEY" \
  || fail "a committed prediction is not shown before its stage is revealed"
grep -Fq 'describePredictionLabel' "$JOURNEY" \
  || fail "the prediction half of the comparison is not labelled"
grep -Fq 'describeObservationLabel' "$JOURNEY" \
  || fail "the observation half of the comparison is not labelled"

# And it must not be graded. There is no answer key in the contract, so a
# verdict here could only have been invented.
for forbidden in 'You were right' 'You were wrong' 'Correct!' 'Incorrect'; do
  if grep -qF -e "$forbidden" "$JOURNEY"; then
    fail "the interaction grades a prediction: $forbidden"
  fi
done

# FINDING 6 — the first reveal says what it does, rather than "Start", which
# reads like a control that begins something again.
grep -Fq 'startActionLabel' "$PRESENTATION_MODULE" \
  || fail "the first reveal no longer uses the authored start label"

# FINDING 7 — committing must change what the live region says. An event that
# announces nothing did not happen, as far as assistive technology is concerned.
grep -Fq 'Prediction recorded' "$PRESENTATION_MODULE" \
  || fail "committing a prediction announces nothing"

# FINDING 3 — both ends of every link, resolved to device and port.
grep -Fq 'endpointSummary' "$LAYOUT" \
  || fail "link endpoints are not resolved to device and port"
grep -Fq 'endpointSummary' "$JOURNEY" \
  || fail "the connections list does not show resolved endpoints"

# FINDINGS 2 and 11 — there is a real drawn topology, and its devices are
# operable controls rather than shapes.
grep -Fq 'TopologyView' "$JOURNEY" \
  || fail "the interaction renders no topology"
grep -Fq '<button' "$DEVICE" \
  || fail "a topology device is not an operable control"

# FINDINGS 9 and 10 — one instance, one state, two scales. A second component
# holding its own journey state is exactly what must not exist.
grep -Fq 'packet-journey--workspace' "$JOURNEY" \
  || fail "there is no expanded workspace presentation"
grep -Fq 'packet-journey--workspace' "$STYLES" \
  || fail "the expanded workspace has no layout"

WORKSPACE_STATE="$(grep -c 'useState<PacketJourneyViewState>' "$JOURNEY" || true)"
[ "$WORKSPACE_STATE" = "1" ] \
  || fail "there are $WORKSPACE_STATE journey states; the embedded and expanded views must share exactly one"

for scanned in "$TOPOLOGY" "$DEVICE" "$LAYOUT"; do
  if grep -qF 'PacketJourneyViewState' "$scanned"; then
    fail "the drawing holds interaction state of its own: $scanned"
  fi
done

# The workspace claims to be modal, so the tab cycle must actually be
# contained — and without a dependency, which is a Founder gate.
grep -Fq 'aria-modal' "$JOURNEY" \
  || fail "the expanded workspace does not identify itself to assistive technology"
grep -Fq 'Escape' "$JOURNEY" \
  || fail "the expanded workspace cannot be closed from the keyboard"

# FINDING 1 — a figure that will not load says so, and never fabricates one.
grep -Fq 'describeFigureUnavailable' "$RENDERER" \
  || fail "a figure that fails to load has no honest state"
grep -Fq 'onError' "$RENDERER" \
  || fail "a failed image is not detected"

# I6G — the corrected surface is built on tokens, so a future dark theme is a
# block that redefines them rather than a rewrite. Dark mode itself stays off.
grep -Fq -- '--tlp-surface' "$STYLES" \
  || fail "the instructional surface has no design tokens"
grep -Fq -- '--tlp-focus' "$STYLES" \
  || fail "there is no shared focus token"

if grep -qF 'prefers-color-scheme' "$STYLES"; then
  fail "product-wide dark mode was enabled; that is a separate design package"
fi

echo "PASS: 10b. every Founder UAT correction is present"

# ------------------------------------------------------------
# 10c. The final Founder UAT corrections hold (WP-I final)
# ------------------------------------------------------------
# Three bounded mechanics, one property each.

# FINDING A — action and consequence must not be spatially disconnected.
#
# The current event is a first-class view object rendered directly under the
# topology, and the decision and the controls sit beneath it. The learner acts
# within a glance of the thing their action changes.
grep -Fq 'currentEvent' "$PRESENTATION_MODULE" \
  || fail "there is no current-event state to synchronise attention with"
grep -Fq 'packet-journey-event' "$JOURNEY" \
  || fail "the current event is not rendered beside the topology"
grep -Fq 'packet-journey-visual' "$JOURNEY" \
  || fail "the topology and the current event are not one block"
grep -Fq 'packet-journey-visual' "$STYLES" \
  || fail "the topology block has no layout of its own"

# The live region must stay inside that block, so the announcement and the
# picture are the same place.
grep -Fq 'aria-live' "$JOURNEY" \
  || fail "progression is no longer announced"

# Emphasis is transient and CSS-only, and the marker itself must NOT be keyed:
# remounting it would hand React a fresh element already at its destination and
# the packet would teleport instead of travelling.
grep -Fq 'topology-pulse' "$TOPOLOGY" \
  || fail "there is no transient emphasis when the network changes"
grep -Fq 'topology-pulse' "$STYLES" \
  || fail "the transient emphasis has no styling"
grep -Fq 'eventToken' "$TOPOLOGY" \
  || fail "the drawing cannot tell when something changed"

# Nothing scrolls the learner.
#
# An earlier revision nudged the topology into view on every event. With the
# progression control now below the journey history (10e), that would drag the
# learner back up to the picture every time they pressed it — the exact shuttle
# this correction exists to remove. The picture is pinned instead.
if grep -qF 'scrollIntoView' "$JOURNEY"; then
  fail "the interaction scrolls the learner away from where they are acting"
fi

# FINDING B — VLAN context visible in BOTH the fixed figure and the interaction.
grep -Fq 'prominent' "$FIXTURE" \
  || fail "the fixture flags no display context for the device faces"
grep -Fq 'topology-fact' "$DEVICE" \
  || fail "a device face shows no authored display context"
grep -Fq 'VLAN' "$FIGURE" \
  || fail "the fixed topology figure shows no VLAN context"

# FINDING C — the successful journey must reach the destination.
#
# Asserted through the CONTRACT, not by counting stages: the authored journey
# has to carry on past the stop point, and the last stage has to be reachable
# only after the repair.
FIXTURE_STOP="$(grep -c '"outcome": "stops"' "$FIXTURE" || true)"
[ "$FIXTURE_STOP" = "1" ] \
  || fail "the fixture authors $FIXTURE_STOP stop points; the journey needs exactly one"

grep -Fq 'PC-B received the request' "$FIXTURE" \
  || fail "the authored journey never reaches its destination"
grep -Fq 'Reply received from PC-B' "$FIXTURE" \
  || fail "the authored reply never returns"

# Every stage past the origin names the link it crossed, so the continuation
# and the reply are traversals the SOURCE stated rather than a renderer
# walking the topology backwards.
FIXTURE_STAGES="$(grep -c '"stageId"' "$FIXTURE" || true)"
FIXTURE_VIA="$(grep -c '"viaLinkId"' "$FIXTURE" || true)"
[ "$FIXTURE_VIA" = "$((FIXTURE_STAGES - 1))" ] \
  || fail "$FIXTURE_VIA of $FIXTURE_STAGES stages name a traversed link; every stage after the origin must"

# FINDING D — connections remain available but visually subordinate.
grep -Fq 'packet-journey-connections' "$JOURNEY" \
  || fail "the connections list was removed rather than subordinated"
grep -Fq 'Every connection, in full' "$JOURNEY" \
  || fail "the connections list is not behind a disclosure"

# FINDING F — a read-only prediction step is identified as such, in the HARNESS.
grep -Fq 'hasPassivePrediction' "$BUILDER" \
  || fail "the harness cannot tell a reviewer that a prediction step is read-only"
grep -Fq 'no response required' "$HARNESS" \
  || fail "the harness does not identify a read-only prediction step"

# And it stays a harness concern. Making the fixture interactive to stop it
# looking broken would be changing the product to suit the test.
if grep -qE '<input[^>]*prediction|onChange.*prediction' "$RENDERER"; then
  fail "the prediction step was made interactive; that is WP-J's decision"
fi

echo "PASS: 10c. synchronisation, VLAN context, completion and hierarchy hold"

# ------------------------------------------------------------
# 10d. PROVE IT is unchanged (WP-I final)
# ------------------------------------------------------------
# The Founder observed the teaching workspace disappearing at PROVE IT. That is
# the architecture working. Wording may explain it; semantics may not move.
grep -Fq 'withholdsEntireInteraction' "$CONTRACT" \
  || fail "whole-interaction withholding was removed"
grep -Fq 'describeWithheldInteraction' "$SURFACE" \
  || fail "a withheld interaction has no honest state"
grep -Fq 'protected demonstration' "$PRESENTATION_MODULE" \
  || fail "the withheld-interaction wording no longer names the protected demonstration"

# No simulated lab, and no teaching interaction smuggled back in.
for forbidden in 'proveItLab' 'simulatedLab' 'fakeLab' 'mockEnvironment'; do
  if grep -qF -e "$forbidden" "$JOURNEY" "$SURFACE" "$PRESENTATION_MODULE"; then
    fail "a simulated protected-demonstration environment was introduced: $forbidden"
  fi
done

echo "PASS: 10d. PROVE IT withholding is unchanged"

# ------------------------------------------------------------
# 10e. The next action is where the reading is (WP-I final flow)
# ------------------------------------------------------------
# Founder UAT: the progression control sat ABOVE the journey history. The
# history grows downward, so a learner who had read as far as Router-1 had to
# scroll UP to click, back DOWN to read the result, and up again — once for
# every remaining authored stage.
#
# WHERE a control renders is a structural property no pure test can reach, and
# this repository has no rendered-DOM harness. So it is checked here, on source
# order, which is also document order and therefore tab order.

# One progression control. Two would be worse than the original defect: a
# learner would never know which of them was the live one.
ADVANCE_COUNT="$(grep -c 'className="packet-journey-advance"' "$JOURNEY" || true)"
[ "$ADVANCE_COUNT" = "1" ] \
  || fail "there are $ADVANCE_COUNT progression controls; there must be exactly one"

ADVANCE_LABEL_COUNT="$(grep -c 'view.advanceLabel' "$JOURNEY" || true)"
[ "$ADVANCE_LABEL_COUNT" = "1" ] \
  || fail "the progression label is rendered $ADVANCE_LABEL_COUNT times; a duplicate control is being built"

# And it comes AFTER the journey history, so it belongs to the latest event
# rather than sitting above everything the learner has read.
HISTORY_LINE="$(grep -n -m1 'className="packet-journey-stages"' "$JOURNEY" | cut -d: -f1)"
ADVANCE_LINE="$(grep -n -m1 'className="packet-journey-advance"' "$JOURNEY" | cut -d: -f1)"

[ -n "$HISTORY_LINE" ] \
  || fail "the journey history is no longer rendered"
[ "$ADVANCE_LINE" -gt "$HISTORY_LINE" ] \
  || fail "the progression control (line $ADVANCE_LINE) is above the journey history (line $HISTORY_LINE); the learner would have to scroll up to continue"

# The decision belongs with the action, not back up beside the picture.
PREDICTION_LINE="$(grep -n -m1 'className="packet-journey-prediction"' "$JOURNEY" | cut -d: -f1)"
ACTIONS_LINE="$(grep -n -m1 'className="packet-journey-actions"' "$JOURNEY" | cut -d: -f1)"

[ "$PREDICTION_LINE" -gt "$HISTORY_LINE" ] \
  || fail "the prediction is rendered above the journey history"
[ "$ACTIONS_LINE" -gt "$HISTORY_LINE" ] \
  || fail "the remediation controls are rendered above the journey history"

grep -Fq 'packet-journey-next' "$JOURNEY" \
  || fail "there is no what-to-do-next group after the journey history"
grep -Fq 'packet-journey-next' "$STYLES" \
  || fail "the what-to-do-next group has no layout"

# The observation surface is pinned instead of the learner being scrolled to
# it, and pinned in BOTH modes — the embedded lesson has the same reading flow.
# A view, not a control: pinning it duplicates nothing.
grep -Fq 'position: sticky' "$STYLES" \
  || fail "the observation surface is not pinned; advancing would change a picture nobody can see"
if grep -qF '.packet-journey--workspace .packet-journey-visual' "$STYLES"; then
  fail "the observation surface is pinned only in the workspace; embedded mode has the same reading flow"
fi

echo "PASS: 10e. one progression control, and it follows the latest event"

# ------------------------------------------------------------
# 11. The fixture still exercises what UAT must review
# ------------------------------------------------------------
for step_type in concept diagram command prediction interaction practice reference; do
  grep -Fq "\"type\": \"$step_type\"" "$FIXTURE" \
    || fail "the fixture no longer exercises the $step_type step type"
done

# A complete journey: a failure to diagnose, a way to repair it, and a
# confirmation to observe. Without all three the signature method cannot be
# reviewed at all.
for element in '"fault"' '"actions"' '"confirmation"' '"prediction"' '"stages"'; do
  grep -Fq "$element" "$FIXTURE" \
    || fail "the fixture packet journey is missing $element"
done

# The traversed link, so the drawn journey has something authored to follow.
grep -Fq '"viaLinkId"' "$FIXTURE" \
  || fail "the fixture authors no traversed link; the packet has no path to follow"

grep -Fq '"documentKind": "architecture_fixture"' "$FIXTURE" \
  || fail "the architecture fixture is no longer marked as a fixture"

echo "PASS: 11. the fixture exercises every step type and a complete journey"

# ------------------------------------------------------------
# 12. No migration, no dependency, no manifest change
# ------------------------------------------------------------
shasum -a 256 -c scripts/migration-baseline.sha256 --quiet \
  || fail "a migration this package was written against was modified"

MIGRATION_COUNT="$(find supabase/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
[ "$MIGRATION_COUNT" = "43" ] \
  || fail "the repository carries $MIGRATION_COUNT migrations; WP-I adds none to 43"

# Browser automation is deferred to a separate Architect decision. None of
# these may appear in any manifest.
for manifest in package.json apps/web/package.json \
                packages/shared-types/package.json services/api/package.json; do
  for forbidden in playwright cypress puppeteer jsdom happy-dom \
                   '@testing-library' storybook axe-core; do
    if grep -qF -e "$forbidden" "$manifest"; then
      fail "$manifest gained a deferred browser-test dependency: $forbidden"
    fi
  done
done

echo "PASS: 12. no migration and no dependency change"

# ------------------------------------------------------------
# 13. The runbook exists and is written for the Founder
# ------------------------------------------------------------
grep -Fq '/uat/instruction' "$RUNBOOK" \
  || fail "the runbook does not state the UAT entry point"
grep -Fq 'npm run dev' "$RUNBOOK" \
  || fail "the runbook does not state how to start the environment"

# The five levels must each be walked, or the support contract goes unreviewed.
for level in 'SHOW ME' 'HELP ME' 'ASK ME' 'CHALLENGE ME' 'PROVE IT'; do
  grep -Fq "$level" "$RUNBOOK" \
    || fail "the runbook does not cover the $level support level"
done

# Dark mode is a required product capability and may not be silently waived.
grep -Fiq 'dark mode' "$RUNBOOK" \
  || fail "the runbook does not evaluate the known dark-mode absence"

# Findings must be classifiable, because the fixture is not production content.
for classification in 'INSTRUCTIONAL' 'INTERFACE' 'PLATFORM' 'ACCESSIBILITY' \
                      'VISUAL DESIGN' 'SUPPORT-LEVEL'; do
  grep -Fq "$classification" "$RUNBOOK" \
    || fail "the runbook cannot classify a $classification finding"
done

for severity in BLOCKING IMPORTANT POLISH OBSERVATION; do
  grep -Fq "$severity" "$RUNBOOK" \
    || fail "the runbook has no $severity severity"
done

echo "PASS: 13. the runbook is complete and Founder-facing"

# ------------------------------------------------------------
# 14. The gate resolves through the verifier namespace
# ------------------------------------------------------------
[ -f scripts/verify-wpi.sh ] \
  || fail "this gate is not resolvable as scripts/verify-wpi.sh"

grep -Fq 'scripts/verify-wpi.sh' "$SELECTOR" \
  || fail "the gate is not registered in change-relevant gate selection"

echo "PASS: 14. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# WP-I tests
# ------------------------------------------------------------
echo ""
echo "--- running the WP-I harness suites ---"
npm run test --workspace @tlp/web -- src/uat

echo ""
echo "--- running the WP-I correction suites ---"
npm run test --workspace @tlp/web -- src/learning/topology-layout src/learning/packet-journey-presentation

# ------------------------------------------------------------
# ADVISORY SIGNALS — never change the exit status
# ------------------------------------------------------------
# Reported because they are worth a human glance, and NOT enforced because a
# threshold here would be an opinion pretending to be a gate. Instructional
# quality is Human UAT (Architect decision 3).
echo ""
echo "--- advisory signals (never fail CI) ---"

FIXTURE_STEPS="$(grep -c '"stableId": "step-' "$FIXTURE" || true)"
FIXTURE_STAGES="$(grep -c '"stageId"' "$FIXTURE" || true)"
FIXTURE_ACTIONS="$(grep -c '"actionId"' "$FIXTURE" || true)"
FIXTURE_NODES="$(grep -c '"nodeId"' "$FIXTURE" || true)"
FIXTURE_PARAGRAPHS="$(grep -c '^\s*"[A-Z]' "$FIXTURE" || true)"

echo "ADVISORY: fixture authored steps:            $FIXTURE_STEPS"
echo "ADVISORY: packet journey stages:             $FIXTURE_STAGES"
echo "ADVISORY: packet journey remediations:       $FIXTURE_ACTIONS"
echo "ADVISORY: packet journey devices:            $FIXTURE_NODES"
echo "ADVISORY: authored prose lines (rough):      $FIXTURE_PARAGRAPHS"
echo "ADVISORY: these are counts, not verdicts. Cognitive load, prose density"
echo "ADVISORY: and teaching quality are judged by a human, in the runbook."

echo ""
echo "=========================================================="
echo "WP-I INSTRUCTIONAL QUALITY HARNESS VERIFIED"
echo ""
echo "The UAT surface is development-only, dynamically loaded, and"
echo "absent from the production bundle. It reads one fixture through"
echo "the real parser, the real learner projection and the real"
echo "renderer, and defines no scenario, renderer or support"
echo "vocabulary of its own. It holds no credential, writes no learner"
echo "state, and computes no networking truth."
echo ""
echo "This gate proves SOURCE STRUCTURE, bundle content and pure logic."
echo "It does NOT prove:"
echo "  - that the instruction teaches well; that is Human UAT"
echo "  - accessible operation with a real screen reader"
echo "  - visual quality, hierarchy or dark mode"
echo "  - anything about a browser rendering; no browser runs here"
echo "=========================================================="
