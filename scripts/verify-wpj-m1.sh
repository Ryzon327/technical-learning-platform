#!/usr/bin/env bash
#
# WP-J Module 1 — the instructional quality gate for the first authored
# Networking Foundations missions.
#
# ## What this gate is for
#
# `verify-wpj.sh` owns the COURSE: identity, module and mission architecture,
# competency accountability, and the staged-authoring rule that says Module 1 is
# the only place instruction may currently appear. This gate owns what is INSIDE
# Module 1.
#
# ## Why so much of it is delegated to a test suite
#
# Every question worth asking about authored instruction is a question about
# PARSED structure — which stage names which device, whether a link resolves,
# whether the server projection actually withholds a decision at CHALLENGE ME.
# Answering those in shell would mean reading JSON with `grep`, which is a
# second curriculum parser wearing a disguise, and it would drift from the real
# contract the first time the contract changed.
#
# So `services/api/src/networking-foundations-module1.test.ts` does that work
# through `parseCurriculumDocument` and `projectMissionStepContent` — the real
# ones — and this gate runs it. What stays here is the set of facts that are
# genuinely about FILES rather than about parsed content: which files exist,
# what the repository has not acquired, and what the production bundle contains.
#
# ## The vocabulary checks, and the trap in them
#
# A term rule must read what the LEARNER reads. Two failures already taught this
# repository the same lesson twice: `grep -w nat` matched "destination", and a
# JSON `\n` escape produced a whole-word "nAt" that no learner would ever see.
# There is a third form of the trap here, and it is worse: the interaction
# registry key is literally `packet_journey`, and `packet` is deferred to
# Mission 6. A naive scan for the learner-facing word would fire on the
# architecture's own spelling and teach the next author to work around the gate.
#
# So learner-facing vocabulary is scanned in the TEST, over authored prose
# collected field by field from the parsed document, where an identifier cannot
# be mistaken for a sentence. This gate checks only the file-level facts where
# no such ambiguity exists.

set -euo pipefail

DOCUMENT="content/curriculum/networking-foundations.json"
HARNESS="apps/web/src/uat/UatHarness.tsx"
MODULE1_TESTS="services/api/src/networking-foundations-module1.test.ts"
RUNBOOK="docs/Engineering-OS/WP_J_MODULE_1_UAT_RUNBOOK.md"
LEDGER="scripts/lib/wpj-concept-ledger.txt"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-J MODULE 1 INSTRUCTIONAL GATE ====="
echo ""

for required in "$DOCUMENT" "$HARNESS" "$MODULE1_TESTS" "$RUNBOOK" "$LEDGER" \
                "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

# The document's JSON escapes decoded, for any check that reads prose.
#
# Searching the raw file is wrong at word level: a paragraph break is stored as
# the two characters `\` and `n`, so `\n\nAt the end` puts n-A-t between a
# backslash and a space and matches a whole-word search for "NAT". The WP-J gate
# failed on exactly that. A vocabulary rule must read what the learner reads.
DECODED="$SCAN_DIR/document-prose.txt"
sed 's/\\n/ /g' "$DOCUMENT" > "$DECODED"

contains_word() {
  grep -qiE "(^|[^A-Za-z0-9])$1([^A-Za-z0-9]|\$)" "$2"
}

# ------------------------------------------------------------
# 1. Module 1 is authored, and both missions carry an interaction
# ------------------------------------------------------------
# Positive assertions. Reverting the authoring must fail here rather than pass
# quietly as a return to the pre-Module-1 invariant.
for interaction in 'nf-pj1-topology-orientation' 'nf-pj2-local-delivery'; do
  grep -Fq "\"$interaction\"" "$DOCUMENT" \
    || fail "Module 1 no longer authors the interaction $interaction"
done

M1_STEPS="$(grep -c '"stableId": "m1-s' "$DOCUMENT" || true)"
M2_STEPS="$(grep -c '"stableId": "m2-s' "$DOCUMENT" || true)"

[ "$M1_STEPS" -ge 3 ] \
  || fail "Mission 1 carries $M1_STEPS authored steps; it teaches more than that"
[ "$M2_STEPS" -ge 3 ] \
  || fail "Mission 2 carries $M2_STEPS authored steps; it teaches more than that"

echo "PASS:  1. both Module 1 missions are authored and carry an interaction"

# ------------------------------------------------------------
# 2. Teaching mode, never a claimed live lab
# ------------------------------------------------------------
# `live_lab` is representable in the contract so that the WP-K seam can be
# expressed, and is refused at publication until an adapter exists. An authored
# teaching simulation that declared it would be claiming a lab that is not there.
if grep -qF 'live_lab' "$DOCUMENT"; then
  fail "the curriculum declares a live lab source; Module 1 is authored teaching"
fi

AUTHORED_TEACHING="$(grep -c '"sourceKind": "authored_teaching"' "$DOCUMENT" || true)"
[ "$AUTHORED_TEACHING" = "2" ] \
  || fail "$AUTHORED_TEACHING of 2 interactions declare an authored teaching source"

# The interaction type must come from the closed registry, not be invented here.
REGISTERED="$(grep -c '"interactionType": "packet_journey"' "$DOCUMENT" || true)"
[ "$REGISTERED" = "4" ] \
  || fail "expected 4 registry declarations (a step and its parameters, twice); found $REGISTERED"

echo "PASS:  2. both interactions are authored teaching of a registered type"

# ------------------------------------------------------------
# 3. No fault, and no remediation
# ------------------------------------------------------------
# Architect Decision D. Module 1 teaches no diagnosis, so any fault here could
# only be one the learner has not been equipped to reason about — and the
# contract would then require a resolving action, which is a repair the learner
# would be guessing at. The confirmation moment comes from the second delivery
# succeeding differently, not from fixing something.
for absent in '"fault"' 'stopsAtStageId' 'resolvesFault' '"outcome": "stops"'; do
  if grep -qF -e "$absent" "$DOCUMENT"; then
    fail "Module 1 authored a fault or a remediation: $absent"
  fi
done

EMPTY_ACTIONS="$(grep -c '"actions": \[\]' "$DOCUMENT" || true)"
[ "$EMPTY_ACTIONS" = "2" ] \
  || fail "$EMPTY_ACTIONS of 2 interactions author an empty action list"

echo "PASS:  3. neither journey authors a fault or a repair"

# ------------------------------------------------------------
# 4. Accessibility is authored, and cannot be withheld
# ------------------------------------------------------------
# Required by the type, so this cannot be missing — which is exactly why it is
# worth asserting that it is SUBSTANTIAL. A one-word text equivalent satisfies
# the contract and fails the learner.
TEXT_EQUIVALENTS="$(grep -c '"textEquivalent"' "$DOCUMENT" || true)"
[ "$TEXT_EQUIVALENTS" = "2" ] \
  || fail "$TEXT_EQUIVALENTS of 2 interactions carry a text equivalent"

while IFS= read -r line; do
  LENGTH="${#line}"
  [ "$LENGTH" -ge 400 ] \
    || fail "a text equivalent is $LENGTH characters; it must describe the whole network, not label it"
done < <(grep -o '"textEquivalent": "[^"]*"' "$DOCUMENT")

echo "PASS:  4. every interaction carries a substantial authored text equivalent"

# ------------------------------------------------------------
# 5. No step type this slice ruled out
# ------------------------------------------------------------
# diagram   there is no curriculum asset hosting, so the only available URI is
#           a development host — which would publish a broken image.
# practice  assessments are not publishable as documents, so the reference
#           could not be resolved by anything.
# prediction (standalone)
#           Architect Decision C: the step renders read-only, which reads as a
#           broken control. Predictions live inside the journey, where
#           committing to one is interactive and persists.
for ruled_out in '"type": "diagram"' '"type": "practice"' '"type": "prediction"' \
                 'assetStableId' 'textAlternative'; do
  if grep -qF -e "$ruled_out" "$DOCUMENT"; then
    fail "Module 1 authored a step type this slice ruled out: $ruled_out"
  fi
done

# And no asset dependency of any kind, least of all a development host.
for host in 'localhost' '127.0.0.1' 'http://' 'https://'; do
  if grep -qF -e "$host" "$DOCUMENT"; then
    fail "the production curriculum document names a URI: $host"
  fi
done

echo "PASS:  5. no diagram, practice, standalone prediction or asset dependency"

# ------------------------------------------------------------
# 6. The learner's predictions are inside the journey
# ------------------------------------------------------------
# Decision C's positive half. Ruling the standalone step out is only half the
# instruction; the predictions have to exist somewhere, and the journey is where
# a commitment is interactive, persists, and is shown beside the observation.
PREDICTIONS="$(grep -c '"prediction": {' "$DOCUMENT" || true)"
[ "$PREDICTIONS" -ge 3 ] \
  || fail "Module 1 authors $PREDICTIONS predictions inside its journeys; the method asks the learner to commit before observing"

echo "PASS:  6. the learner commits to predictions inside the journeys"

# ------------------------------------------------------------
# 6b. PJ1's visual is true, not merely disclaimed
# ------------------------------------------------------------
# PJ1's first design walked a marker PC-A → Switch-1 → Printer → Switch-1 →
# Router-1 as a "tour" of the network, and said in authored copy that nothing
# was being sent. Architect review rejected it, and was right to: for a
# beginner the MOVEMENT is instruction, so a disclaimer cannot repair a
# misleading visual.
#
# It was not only a disclaimer problem. `describeDeviceState` renders "The
# traffic passed through here" on every visited device, so the tour would have
# printed that sentence on the Printer's and Router-1's own faces. The falsehood
# was in the picture, where the authored copy could not reach it.
#
# PJ1 now follows a TRUE and COMPLETE path: someone at PC-A prints a document,
# the print request reaches Switch-1, and Switch-1 passes it to the Printer,
# which accepts the job. Every stage is a device that genuinely receives the
# request, and every arrival names the authored link it crossed.
#
# The Printer stage was previously forbidden here, because in the old tour the
# marker visited a Printer that received nothing. That prohibition is now
# wrong: the defect was never the Printer, it was visiting devices that take no
# part. Founder UAT then found the opposite defect — a scenario about printing
# that never reached the printer — so the rule is restated as what it always
# meant.
if grep -qF 'a tour of this network' "$DOCUMENT"; then
  fail "PJ1 describes itself as a tour again; the marker must follow a true path, not visit devices"
fi

# Doubling back, and visiting the router, are still the tour's signatures.
for absent in '"stageId": "t4-switch-again"' '"stageId": "t5-router"'; do
  if grep -qF -e "$absent" "$DOCUMENT"; then
    fail "PJ1 authors a stage at a device that receives nothing: $absent"
  fi
done

# And the scenario completes. A walkthrough about printing that stops at the
# switch tells the learner an intermediate step was correct and leaves the goal
# unmet; the per-stage assertions live in the test suite, and what is pinned
# here is that the destination stage exists at all.
grep -Fq '"stageId": "t3-printer"' "$DOCUMENT" \
  || fail "PJ1 no longer reaches the printer; the printing scenario would end unfinished"

echo "PASS: 6b. PJ1 follows a true path, and completes the scenario it sets"

# ------------------------------------------------------------
# 6c. The device symbols are instruction, and stay honest
# ------------------------------------------------------------
# Founder UAT required that a learner recognise device CATEGORIES on sight.
# That makes the topology teach something the prose never says, which is the
# reason each of these is a rule rather than a preference.
#
# There is no rendered-DOM harness in this repository and this slice may not add
# one, so what can be proven here is structural. The behavioural half —
# categories survive the layout, every role has its own word, a category changes
# no relationship — is asserted in `topology-layout.test.ts`.
SYMBOL="apps/web/src/learning/DeviceSymbol.tsx"
NODE="apps/web/src/learning/DeviceNode.tsx"
VIEW="apps/web/src/learning/TopologyView.tsx"
LAYOUT="apps/web/src/learning/topology-layout.ts"
STYLES="apps/web/src/styles.css"

for required in "$SYMBOL" "$NODE" "$VIEW" "$LAYOUT" "$STYLES"; do
  [ -f "$required" ] || fail "missing required file: $required"
done

# A symbol exists for every registered role. A category with no silhouette would
# fall back to another category's, which is a misleading picture rather than a
# missing one.
for category in '"switch"' '"router"' '"printer"' '"host"'; do
  grep -Fq "role === $category" "$SYMBOL" \
    || fail "no device symbol is drawn for the $category category"
done

# The `never` arm is what makes that total. Without it a role added later would
# silently reuse a shape.
grep -Fq ': never = role' "$SYMBOL" \
  || fail "the symbol set is not exhaustive over the role union"

# The symbol comes from the authored role and from NOTHING else. Recognising a
# device by its name or by an authored attribute is the domain knowledge the
# presentation layer must not have — correct for this course's wording, silently
# wrong for the next.
#
# Scanned with COMMENTS STRIPPED, and the first version of this check proved why:
# the module's own documentation says "nothing here reads a label, an interface,
# an attribute or a device name", so a plain search fired on the sentence
# defending the invariant. That is the same defect as the `\n` escape and the
# `packet_journey` registry key already recorded in this file — a rule about
# code must read code.
SYMBOL_CODE="$SCAN_DIR/device-symbol-code.tsx"
sed -e 's://.*::' -e '/^[[:space:]]*\*/d' -e '/^[[:space:]]*\/\*/d' \
  "$SYMBOL" > "$SYMBOL_CODE"

for sniffed in '.label' '.nodeId' '.attributes' '.interfaces' '.facts' \
               'Printer' 'PC-A' 'Switch-1'; do
  if grep -Fq -e "$sniffed" "$SYMBOL_CODE"; then
    fail "the symbol set inspects something other than the authored role: $sniffed"
  fi
done

# Decorative, and honestly so: the category is text on the face beside it.
grep -Fq 'aria-hidden="true"' "$SYMBOL" \
  || fail "the device symbol is not marked decorative"

# Every device state is captioned in words. `visited` and `idle` used to render
# no text at all, which made "the traffic passed through here" a claim carried
# by background colour alone.
grep -Fq 'is-unreached' "$NODE" \
  || fail "the unreached state carries no wording for assistive technology"

if grep -Fq 'device.state !== "visited"' "$NODE"; then
  fail "the visited state renders no caption; it would be carried by colour alone"
fi

grep -Fq 'clip-path: inset(50%)' "$STYLES" \
  || fail "the unreached caption is removed rather than visually hidden"

# Selection is what the LEARNER is looking at; journey state is what the TRAFFIC
# did. Recolouring the border for selection overrode `is-current` and made the
# current device stop looking current the moment it was inspected.
#
# A CSS rule spans lines, and grep matches one line at a time, so a block-scoped
# check has to read the sheet unwrapped — the same reason the runbook checks
# below flatten their prose first.
STYLES_FLAT="$SCAN_DIR/styles-flat.css"
tr '\n' ' ' < "$STYLES" | tr -s ' ' > "$STYLES_FLAT"

grep -Eq '\.topology-device\.is-selected \{[^}]*outline:' "$STYLES_FLAT" \
  || fail "selection is not drawn separately from journey state"

echo "PASS: 6c. device categories are drawn from authored roles, and stay honest"

# ------------------------------------------------------------
# 6d. The topology is a hierarchy, in ONE coordinate space
# ------------------------------------------------------------
# Founder UAT rejected the previous drawing: a horizontal row of cards, wires
# that overlapped and crossed the cards, and a traffic marker sitting on top of
# a device's own text. The cause was structural, so the gate is too.
#
# The old geometry lived in TWO places that agreed only by arithmetic kept in
# step by hand — a CSS grid row for the devices, and an SVG scaled independently
# with preserveAspectRatio="none" for the wires. That is why the checks this
# replaces pinned a band height and a band centre in a component against the
# same numbers in a stylesheet: it was the only way to stop the wires drifting
# off the cards.
#
# There is now one coordinate space. `topology-layout.ts` computes every box,
# every wire corner and the canvas size in CSS pixels, and the renderer places
# elements at numbers it is given. What still has to agree is narrower and
# stronger: the card's INTERNAL heights, because the layout sizes each box from
# them and a card taller than its box would be drawn over the wires beneath it.
# Pinned in both directions, as before.

for constant in 'export const NODE_WIDTH = 156;' \
                'export const NODE_BASE_HEIGHT = 96;' \
                'export const NODE_FACTS_HEADER_HEIGHT = 14;' \
                'export const NODE_FACT_ROW_HEIGHT = 19;'; do
  grep -Fq "$constant" "$LAYOUT" \
    || fail "a card geometry constant moved in the layout: $constant"
done

# 8 + 28 + 2 + 12 + 2 + 18 + 2 + 12 + 10 = 94, inside NODE_BASE_HEIGHT.
grep -Eq '\.topology-device \{[^}]*padding: 8px 10px 10px;' "$STYLES_FLAT" \
  || fail "the card's padding moved without NODE_BASE_HEIGHT"
grep -Eq '\.topology-device-figure \{[^}]*height: 28px;' "$STYLES_FLAT" \
  || fail "the symbol plate height moved without NODE_BASE_HEIGHT"
grep -Eq '\.topology-device-name \{[^}]*height: 18px;' "$STYLES_FLAT" \
  || fail "the device name line height moved without NODE_BASE_HEIGHT"

# 2 (the card own grid gap) + 5 + 6 + 1 = 14, mirroring
# NODE_FACTS_HEADER_HEIGHT.
grep -Eq '\.topology-device-ports \{[^}]*margin-top: 5px;' "$STYLES_FLAT" \
  || fail "the facts divider moved without NODE_FACTS_HEADER_HEIGHT"

# One fact, one line, 19px, mirroring NODE_FACT_ROW_HEIGHT. It must not wrap:
# a wrapped value makes the card taller than the box the wires were drawn
# around, which is the defect this whole section exists to prevent.
grep -Eq '\.topology-port-row \{[^}]*height: 19px;' "$STYLES_FLAT" \
  || fail "a face fact row moved without NODE_FACT_ROW_HEIGHT"
grep -Eq '\.topology-port-row \{[^}]*white-space: nowrap;' "$STYLES_FLAT" \
  || fail "a face fact row may wrap; the card would outgrow its box"
grep -Eq '\.topology-device \{[^}]*overflow: hidden;' "$STYLES_FLAT" \
  || fail "a card may spill past the box the wires were drawn around"

# The renderer computes no geometry. A constant reappearing in the component is
# the second coordinate space coming back.
#
# Scanned with COMMENTS STRIPPED, for the reason section 6c already records: the
# component's documentation explains what `preserveAspectRatio="none"` used to
# do and why it is gone, so a plain search fires on the sentence defending the
# invariant. A rule about code must read code.
VIEW_CODE="$SCAN_DIR/topology-view-code.tsx"
sed -e 's://.*::' -e '/^[[:space:]]*\*/d' -e '/^[[:space:]]*\/\*/d' \
  "$VIEW" > "$VIEW_CODE"

for banned in 'BAND_HEIGHT' 'BAND_CENTRE' 'LANE_HEIGHT' 'columnCentre' \
              'preserveAspectRatio' 'tlp-topology-columns' 'tlp-packet-column'; do
  if grep -Fq -e "$banned" "$VIEW_CODE"; then
    fail "TopologyView computes geometry of its own again: $banned"
  fi
done

if grep -qF -e 'tlp-topology-columns' "$STYLES"; then
  fail "the stylesheet still positions the topology by column"
fi

# The wire layer must not scale independently of the cards.
if grep -Eq '\.topology-wires \{[^}]*(width|height): 100%' "$STYLES_FLAT"; then
  fail "the wire layer stretches; wires would drift off their devices"
fi

# The hierarchy comes from the authored category and from nothing else, and it
# confers no behaviour. A row is where a box is drawn, never what a device does.
grep -Fq 'function bandOfRole' "$LAYOUT" \
  || fail "the layout no longer derives its rows from the authored category"
grep -Fq ': never = role' "$LAYOUT" \
  || fail "the row mapping is not exhaustive over the role union"

# The traffic marker is information IN TRANSIT and belongs on a link, clear of
# every card. Which device HAS the traffic is a separate claim, drawn on the
# card as a ring. Collapsing the two is what put a dot over PC-A's text.
grep -Fq 'MARKER_CLEARANCE' "$LAYOUT" \
  || fail "the traffic marker has no clearance from the device cards"
grep -Fq 'topology-packet' "$VIEW" \
  || fail "there is no traffic marker"
grep -Fq 'topology-pulse' "$VIEW" \
  || fail "the device that has the traffic is not marked separately"

# The arrangement is information, so it may not be visible-only.
grep -Fq 'topology-description' "$VIEW" \
  || fail "the arrangement is not described for assistive technology"
grep -Fq 'describeTopologyArrangement' "$LAYOUT" \
  || fail "the layout produces no text equivalent of its own arrangement"
grep -Eq '\.topology-description \{[^}]*clip-path: inset\(50%\);' "$STYLES_FLAT" \
  || fail "the arrangement description is removed rather than visually hidden"

echo "PASS: 6d. the topology is a hierarchy in one coordinate space"

# ------------------------------------------------------------
# 6e. Group membership is authored, and the chain is unbroken
# ------------------------------------------------------------
# The Founder required visible separation between networks and devices. The
# previous revision refused to draw one, correctly: membership could not be
# derived from role, connectivity, prose, the presence of a router or the
# geometry, and every one of those inferences would have been a networking fact
# invented by a picture.
#
# The Architect approved one additive AUTHORED fact instead. What this section
# owns is that the chain carrying it is unbroken end to end:
#
#   authored parameters -> strict validator -> server projection
#     -> ObservationModel -> layout -> drawing and description
#
# A break anywhere in that chain reintroduces the defect in its worst form:
# presentation reconstructing membership it was not given.
#
# The BEHAVIOUR — that nothing infers membership, that two groups coexist, that
# a boundary encloses its members and nobody else — is proven by the suites this
# gate runs, not by scanning for words. A structural test is stronger than a
# string, and this section deliberately checks only that each link in the chain
# EXISTS, leaving what it does to the tests below.

MODEL="packages/shared-types/src/observation-model.ts"
REGISTRY="packages/shared-types/src/instruction-interaction.ts"
INSTRUCTION="packages/shared-types/src/mission-instruction.ts"

for required in "$MODEL" "$REGISTRY" "$INSTRUCTION"; do
  [ -f "$required" ] || fail "missing required file: $required"
done

# 1. The shared contract carries the fact.
grep -Fq 'export interface ObservationGroup' "$MODEL" \
  || fail "the shared observation model declares no authored group"
grep -Fq 'readonly groupId?: string;' "$MODEL" \
  || fail "an observation node cannot carry authored group membership"

# 2. The authored contract can declare it, and the validator resolves it.
grep -Fq 'export interface PacketJourneyGroup' "$REGISTRY" \
  || fail "an authored interaction cannot declare a group"
grep -Fq 'names a group that is not declared' "$REGISTRY" \
  || fail "a dangling group reference is not refused at authoring"

# 3. The server projection carries it to the learner.
grep -Fq 'projectGroup' "$REGISTRY" \
  || fail "authored groups are not projected into the observation model"
grep -Fq 'parameters.groups' "$INSTRUCTION" \
  || fail "the support-level projection drops authored groups"

# 4. The presentation CONSUMES the authored fact rather than reconstructing it.
grep -Fq 'node.groupId' "$LAYOUT" \
  || fail "the layout does not read authored group membership"
grep -Fq 'topology-group' "$VIEW" \
  || fail "the drawing renders no authored group"
grep -Eq '\.topology-group \{' "$STYLES_FLAT" \
  || fail "an authored group has no visual treatment"

# 5. The boundary is a field BEHIND the drawing, so it can never hide a wire,
#    cover a device or sit over the traffic marker. Paint order, not opacity.
GROUP_LINE="$(grep -n 'topology-group' "$VIEW" | head -1 | cut -d: -f1)"
DEVICE_LINE="$(grep -n 'DeviceNode' "$VIEW" | tail -1 | cut -d: -f1)"
PACKET_LINE="$(grep -n 'topology-packet' "$VIEW" | tail -1 | cut -d: -f1)"

[ "$GROUP_LINE" -lt "$DEVICE_LINE" ] \
  || fail "a group boundary is painted over the device cards"
[ "$GROUP_LINE" -lt "$PACKET_LINE" ] \
  || fail "a group boundary is painted over the traffic marker"

# 6. Membership has a text equivalent. A boundary drawn and not described would
#    make grouping a sighted-only fact, which is the defect section 6d fixed for
#    the arrangement and must not be reintroduced for the grouping.
grep -Fq 'group.label' "$LAYOUT" \
  || fail "the arrangement description does not name the authored groups"

# 7. The group stays GENERIC. The Architect was explicit that this must not
#    become a contract about IP networks: a field named for one would be read as
#    one by the first consumer that wanted an answer.
GROUP_CONTRACT="$SCAN_DIR/group-contract.ts"
sed -e 's://.*::' -e '/^[[:space:]]*\*/d' -e '/^[[:space:]]*\/\*/d' \
  "$MODEL" "$REGISTRY" > "$GROUP_CONTRACT"

for specific in 'subnetId' 'subnetMask' 'vlanId' 'broadcastDomain' \
                'routingDomain' 'trustZone' 'parentGroupId' 'groupMembers'; do
  if grep -Fq -e "$specific" "$GROUP_CONTRACT"; then
    fail "the group contract acquired a specific or nested meaning: $specific"
  fi
done

# 8. Module 1 actually uses it, and uses it once per journey.
AUTHORED_GROUPS="$(grep -c '"groupId": "local-network", "label": "Local network"' "$DOCUMENT" || true)"
[ "$AUTHORED_GROUPS" = "2" ] \
  || fail "$AUTHORED_GROUPS of 2 Module 1 journeys declare their authored group"

echo "PASS: 6e. group membership is authored and the chain is unbroken"

# ------------------------------------------------------------
# 6f. Every device explains itself, and defers what it should
# ------------------------------------------------------------
# Founder UAT: selecting a device "presents too much information at once", and
# a beginner "may not understand what they are looking at". The repair is
# authored prose answering "what is this, and why is it here?", with the
# technical inventory kept whole behind a deliberate disclosure.
#
# The prose itself is checked in the test suite, where it is read out of the
# PARSED document and held to every vocabulary rule the rest of Module 1 obeys
# — which is how a device explainer is stopped from becoming a side door for a
# later mission's terms. What is pinned here is the chain, in the same shape as
# the group chain above: the fact exists, it is optional, it is validated, it is
# projected, and the presentation consumes it rather than composing one.

PRESENTATION="apps/web/src/learning/packet-journey-presentation.ts"
[ -f "$PRESENTATION" ] || fail "missing required file: $PRESENTATION"

# 1. Every device a learner can select has an answer. Five in PJ1, four in PJ2.
ABOUT_COUNT="$(grep -c '"about":' "$DOCUMENT" || true)"
if [ "$ABOUT_COUNT" -lt 9 ]; then
  fail "not every Module 1 device is explained ($ABOUT_COUNT authored, expected 9)"
fi

# 2. Optional on the node, exactly like `groupId`. A required field would
#    invalidate every interaction authored before this existed.
grep -Fq 'readonly about?: string;' "$MODEL" \
  || fail "an observation node cannot carry an authored explanation"
grep -Fq 'readonly about?: string;' "$REGISTRY" \
  || fail "an authored interaction cannot declare a device explanation"

# 3. Checked as prose, and projected verbatim.
grep -Fq 'checkOptionalText(entry, "about"' "$REGISTRY" \
  || fail "an authored explanation is not validated"
grep -Fq 'node.about' "$REGISTRY" \
  || fail "authored explanations are not projected into the observation model"

# 4. The presentation READS the authored fact. The category sentence beside it
#    is derived from the authored role and from nothing else; anything richer
#    would be a presentation that had learned the curriculum.
grep -Fq 'node.about' "$PRESENTATION" \
  || fail "device inspection does not read the authored explanation"
grep -Fq 'describeRolePurpose' "$PRESENTATION" \
  || fail "device inspection no longer says what a category of device is"

# 5. Journey participation comes from authored observation, never from the
#    topology. If this ever reads links or roles, the renderer has started
#    deciding which devices "should" be on a path.
grep -Fq 'resolveNodeJourneyStatus' "$PRESENTATION" \
  || fail "device inspection no longer states a device's relation to the journey"

# 6. The forward references the Founder asked to keep. That they name only
#    missions this course contains, and promise no unlock or score, is
#    asserted in the suite.
grep -Fq 'Mission 5' "$DOCUMENT" \
  || fail "Router-1's explanation no longer points at the mission that develops it"
grep -Fq 'Mission 2' "$DOCUMENT" \
  || fail "Switch-1's explanation no longer defers the switching mechanism"

echo "PASS: 6f. every device is explained, with the mechanism still deferred"

# ------------------------------------------------------------
# 7. No networking truth was moved into the renderer
# ------------------------------------------------------------
# Authored content may DESCRIBE behaviour. Nothing may COMPUTE it. The renderer
# is presentation-only, and this slice must not have been the one that changed
# that.
#
# Test sources are excluded deliberately, and the first version of this check
# proved why: `topology-layout.test.ts` ASSERTS that these identifiers are
# absent, so it necessarily contains them. A gate that fails on the test
# defending the same invariant is a gate that gets deleted rather than fixed.
while IFS= read -r source; do
  [ -n "$source" ] || continue
  case "$source" in *.test.ts|*.test.tsx) continue ;; esac

  for forbidden in routingTable computeRoute nextHop calculateSubnet subnetMask \
                   netmask parseAddress macLearning learnMac floodFrame \
                   forwardingTable isReachable computeForwarding; do
    if grep -qF -e "$forbidden" "$source"; then
      fail "networking truth entered the presentation layer: $forbidden in $source"
    fi
  done
done <<EOF
$(find apps/web/src -name '*.ts' -o -name '*.tsx')
EOF

echo "PASS:  7. the renderer computes no networking behaviour"

# ------------------------------------------------------------
# 8. The UAT surface reads the real course, and ships nothing
# ------------------------------------------------------------
# Founder instructional UAT must review the AUTHORED document through the real
# parser and the real projection. A copy in a second fixture would be a second
# curriculum truth, and it would drift the first time either side changed.
grep -Fq 'content/curriculum/networking-foundations.json' "$HARNESS" \
  || fail "the UAT harness cannot reach the authored course"

# And there is no second copy of Module 1 anywhere.
COPIES="$(grep -rl 'nf-pj2-local-delivery' content apps services packages 2>/dev/null | wc -l | tr -d ' ')"
[ "$COPIES" = "1" ] \
  || fail "Module 1's journey appears in $COPIES files; it must exist once, in the authored document"

# The production bundle carries none of it. `verify-wpj15.sh` asserts the same
# fact — deliberately, because it is the compensating control for that gate's
# UAT exclusion, and a compensating control only one gate can see is one that
# gets lost.
if [ -d apps/web/dist ]; then
  for leaked in 'nf-m1-what-a-network-is' 'nf-pj1-topology-orientation' \
                'is called flooding'; do
    if grep -rqF -e "$leaked" apps/web/dist; then
      fail "the production build carries Module 1 curriculum: $leaked"
    fi
  done
  echo "PASS:  8. UAT reads the authored course, and the bundle carries none of it"
else
  echo "PASS:  8. UAT reads the authored course (bundle check skipped: no build)"
fi

# ------------------------------------------------------------
# 9. The ledger still orders the concepts Module 1 teaches
# ------------------------------------------------------------
# The ledger is the teach-before-use audit source. Module 1 introduces its
# concepts, so the ledger must still name them and still place them in Module 1
# — otherwise the authored course and the audit source disagree about what was
# taught when, and the ledger silently stops being able to catch anything.
for concept in 'host' 'switch' 'router' 'interface' 'port' 'topology'; do
  grep -Eq "^[0-9]+\|nf-m1-what-a-network-is\|$concept\|" "$LEDGER" \
    || fail "the ledger no longer places '$concept' in Mission 1"
done

for concept in 'frame' 'MAC address' 'unknown-destination flooding'; do
  grep -Eq "^[0-9]+\|nf-m2-inside-one-network\|$concept\|" "$LEDGER" \
    || fail "the ledger no longer places '$concept' in Mission 2"
done

# And `broadcast` is NOT a Module 1 concept.
#
# Mission 2 demonstrates a switch copying a frame out of its other ports
# because it has not learned the destination — flooding. A broadcast is a frame
# deliberately addressed to every machine, which needs an address the learner
# does not have until Mission 4. The ledger placed broadcast in Mission 2 until
# Module 1 authoring found the distinction; leaving it there would have had the
# audit source assert a concept the curriculum does not teach, which is how a
# ledger stops being able to catch anything.
if grep -Eq "^[0-9]+\|nf-m1-what-a-network-is\|broadcast\|" "$LEDGER"; then
  fail "the ledger places 'broadcast' in Mission 1"
fi
if grep -Eq "^[0-9]+\|nf-m2-inside-one-network\|broadcast\|" "$LEDGER"; then
  fail "the ledger places 'broadcast' in Mission 2; Module 1 teaches flooding, which is a different behaviour"
fi
grep -Eq "^[0-9]+\|nf-m4-the-prefix-and-the-decision\|broadcast\|" "$LEDGER" \
  || fail "the ledger no longer orders 'broadcast' at Mission 4, where addressing makes it teachable"

echo "PASS:  9. the concept ledger still orders what Module 1 teaches"

# ------------------------------------------------------------
# 10. No migration, dependency, publication or lab side effect
# ------------------------------------------------------------
shasum -a 256 -c scripts/migration-baseline.sha256 --quiet \
  || fail "a migration this package was written against was modified"

MIGRATION_COUNT="$(find supabase/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
[ "$MIGRATION_COUNT" = "43" ] \
  || fail "the repository carries $MIGRATION_COUNT migrations; Module 1 adds none to 43"

for manifest in package.json apps/web/package.json \
                packages/shared-types/package.json services/api/package.json; do
  git diff --quiet HEAD -- "$manifest" 2>/dev/null \
    || fail "Module 1 changed a dependency manifest: $manifest"
done

# Authoring is not publishing. Nothing in this slice may reach a database, a
# provider or a deployment.
for operational in 'publishCurriculum' 'importCurriculum' 'service_role' \
                   'supabase db' 'LabProvider' 'deployTo'; do
  if grep -qF -e "$operational" "$DOCUMENT"; then
    fail "the curriculum document names an operational identifier: $operational"
  fi
done

echo "PASS: 10. no migration, dependency, publication or lab side effect"

# ------------------------------------------------------------
# 11. The runbook is complete and Founder-facing
# ------------------------------------------------------------
grep -Fq '/uat/instruction' "$RUNBOOK" \
  || fail "the runbook does not say where to go"

# The runbook UNWRAPPED, because these are phrase rules and prose wraps.
#
# The first version of this check searched line by line and failed on
# "Behavior Before Vocabulary" — which was present, and split across two lines
# by ordinary paragraph wrapping. That is the same defect as searching a JSON
# file for a word that a `\n` escape had cut in half: a rule about phrases must
# read the prose, not the file's line breaks. Matched case-insensitively too,
# so a phrase used as an uppercase heading still counts.
UNWRAPPED="$SCAN_DIR/runbook-prose.txt"
tr '\n' ' ' < "$RUNBOOK" | tr -s ' ' > "$UNWRAPPED"

for section in 'BEGINNER-COMPLETE' 'Behavior Before Vocabulary' \
               'teach-before-use' 'keyboard' 'CHALLENGE ME' 'PROVE IT' \
               'narrow' 'progression control'; do
  grep -Fqi -e "$section" "$UNWRAPPED" \
    || fail "the runbook does not ask the Founder to judge: $section"
done

# The runbook must not pre-judge the result. Human UAT is the Founder's.
if grep -qE '^\s*(RESULT|VERDICT|Outcome):\s*PASS' "$RUNBOOK"; then
  fail "the runbook records a UAT pass; only the Founder may do that"
fi

echo "PASS: 11. the runbook is complete and records no verdict"

# ------------------------------------------------------------
# 12. The gate resolves through the verifier namespace
# ------------------------------------------------------------
[ -f scripts/verify-wpj-m1.sh ] \
  || fail "this gate is not resolvable as scripts/verify-wpj-m1.sh"

grep -Fq 'scripts/verify-wpj-m1.sh' "$SELECTOR" \
  || fail "the gate is not registered in change-relevant gate selection"

# Every path this gate makes an assertion about must select it, or a change
# breaking one of those assertions would never run it. Sections 6c and 6d added
# five presentation files to what this gate owns, so they are listed here too —
# a gate that checks a file it is not woken for is a gate that passes forever.
for owned in "$DOCUMENT" "$HARNESS" "$MODULE1_TESTS" "$SYMBOL" "$NODE" \
             "$VIEW" "$LAYOUT" "$STYLES"; do
  SELECTED="$(bash "$SELECTOR" "$owned")"
  case "
$SELECTED
" in
    *"
scripts/verify-wpj-m1.sh
"*) ;;
    *) fail "$owned does not select this gate; it selected: $SELECTED" ;;
  esac
done

echo "PASS: 12. the gate resolves through the verifier namespace and owns its paths"

# ------------------------------------------------------------
# The suites that own the parsed content
# ------------------------------------------------------------
echo ""
echo "--- running the Module 1 instructional suite ---"
npm run test --workspace @tlp/api -- networking-foundations-module1

echo ""
echo "--- running the interaction and step contract suites ---"
npm run test --workspace @tlp/shared-types -- instruction-interaction mission-steps mission-instruction observation-model

# Sections 6d and 6e prove the geometry contract and the authored-group chain
# are DECLARED. What they actually produce — the hierarchy, wires that touch no
# card, a marker clear of every device, a boundary around exactly the authored
# members, two groups that do not merge, and the fact that nothing infers
# membership from a role or a link — is behaviour, and behaviour is proven by
# the layout suite rather than by grepping a component.
echo ""
echo "--- running the topology geometry suite ---"
npm run test --workspace @tlp/web -- src/learning/topology-layout

# ------------------------------------------------------------
# Advisory
#
# Counts, never verdicts. Cognitive load, prose density and whether the course
# actually teaches are judged by a human in the runbook, and no threshold here
# could decide any of them. A gate that failed on prose length would teach the
# next author to pad or trim to a number instead of to a learner.
# ------------------------------------------------------------
echo ""
echo "--- advisory signals (never fail CI) ---"
echo "ADVISORY: Mission 1 authored steps:          $M1_STEPS"
echo "ADVISORY: Mission 2 authored steps:          $M2_STEPS"
echo "ADVISORY: journey stages:                    $(grep -c '"stageId"' "$DOCUMENT" || true)"
echo "ADVISORY: learner predictions:               $PREDICTIONS"
echo "ADVISORY: devices across both journeys:      $(grep -c '"nodeId"' "$DOCUMENT" || true)"
echo "ADVISORY: authored paragraphs (rough):       $(grep -c '^\s*"[A-Z]' "$DECODED" || true)"
echo "ADVISORY: terms Module 1 introduces:         host, interface, port, link,"
echo "ADVISORY:                                    switch, router, topology,"
echo "ADVISORY:                                    flooding, MAC address, frame"
echo "ADVISORY: these are counts, not verdicts. Whether the instruction teaches"
echo "ADVISORY: is Human UAT, and this gate cannot see it."

echo ""
echo "=========================================================="
echo "WP-J MODULE 1 INSTRUCTION VERIFIED"
echo ""
echo "Missions 1 and 2 are authored as production curriculum that"
echo "parses through the real parser. Both journeys are authored"
echo "teaching of a registered type, carry a substantial text"
echo "equivalent, ask the learner to predict before observing,"
echo "and author no fault and no repair. No deferred term reaches"
echo "the learner, the renderer computes nothing, and the UAT"
echo "surface reads the authored document without shipping it."
echo ""
echo "This gate proves AUTHORED STRUCTURE, absence and pure logic."
echo "It does NOT prove:"
echo "  - that the instruction teaches well; that is Human UAT"
echo "  - that a beginner could follow it; that is Human UAT"
echo "  - that any curriculum has been published to a database"
echo "  - anything about a browser rendering; none runs here"
echo "=========================================================="
