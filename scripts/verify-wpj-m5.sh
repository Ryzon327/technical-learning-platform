#!/usr/bin/env bash
#
# WP-J6 — Networking Foundations Mission 5, "The default gateway".
#
# ## What this gate owns
#
# `verify-wpj.sh` owns the COURSE and the staged-authoring rule. `verify-wpj-m1.sh`
# owns Module 1, `verify-wpj-m3.sh` Mission 3, `verify-wpj-m4.sh` Mission 4.
# This gate owns Mission 5.
#
# ## What is unusual about this one
#
# Most of this family guards against a mission being WRONG. Several checks here
# guard against Mission 5 becoming BIGGER.
#
# The repository describes Mission 5 as "the smallest mission in the course, and
# deliberately so. It introduces one idea and one line of output." After Mission
# 4 — five concepts, two journeys, 65 minutes — that change of pace is a design
# decision, and the obvious way to lose it is not a bad edit but a well-meaning
# one: adding a journey for consistency, a second reading for symmetry, a
# troubleshooting exercise because the constraint invites it. Section 3 exists
# to make each of those visible.
#
# ## The continuity this mission spends
#
# Mission 4 put `192.168.1.1/24` on Router-1 and did not explain it, exactly as
# Mission 3 planted `/24` for Mission 4. Mission 5 tells the learner they have
# seen this address before — a sentence that becomes false if either mission is
# edited alone. Section 5 pins both ends.
#
# ## What this gate cannot prove
#
# Whether finding the line among the rest feels like a skill or like noise, and
# whether the mission reads as focused rather than thin. Tier 3 human review.

set -euo pipefail

DOCUMENT="content/curriculum/networking-foundations.json"
MISSION5_TESTS="services/api/src/networking-foundations-mission5.test.ts"
COURSE_TESTS="services/api/src/networking-foundations.test.ts"
COURSE_GATE="scripts/verify-wpj.sh"
RUNBOOK="docs/Engineering-OS/WP_J_MISSION_5_UAT_RUNBOOK.md"
LEDGER="scripts/lib/wpj-concept-ledger.txt"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-J MISSION 5 INSTRUCTIONAL GATE ====="
echo ""

for required in "$DOCUMENT" "$MISSION5_TESTS" "$COURSE_TESTS" "$COURSE_GATE" \
                "$RUNBOOK" "$LEDGER" "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

# Blocks are written to FILES rather than held in variables and piped.
# `printf '%s' "$BLOCK" | grep -q …` is a pipefail race: `grep -q` exits on
# first match, `printf` dies of SIGPIPE with status 141, and the pipeline
# reports 141 despite matching. It only fires once the block is large enough,
# so it passes on a small mission and fails on a big one.
SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

M5_BLOCK="$SCAN_DIR/mission-5.json"
M4_BLOCK="$SCAN_DIR/mission-4.json"

awk '
  /"stableId": "nf-m5-the-default-gateway"/ { start = 1 }
  /"stableId": "nf-m6-routers-and-the-journey"/ { start = 0 }
  start
' "$DOCUMENT" > "$M5_BLOCK"

awk '
  /"stableId": "nf-m4-the-prefix-and-the-decision"/ { start = 1 }
  /"stableId": "nf-m5-the-default-gateway"/ { start = 0 }
  start
' "$DOCUMENT" > "$M4_BLOCK"

[ -s "$M5_BLOCK" ] \
  || fail "Mission 5 could not be located; the mission ordering this gate depends on has changed"
[ -s "$M4_BLOCK" ] \
  || fail "Mission 4 could not be located; this gate compares the two"

# ------------------------------------------------------------
# 1. Mission 5 is authored, under its approved identity
# ------------------------------------------------------------
grep -Fq '"title": "Mission 5 — The default gateway"' "$DOCUMENT" \
  || fail "Mission 5's approved title changed"

grep -Fq '"stableId": "m5-s' "$M5_BLOCK" \
  || fail "Mission 5 carries no authored step; this slice authors it"

echo "PASS:  1. Mission 5 is authored under its approved identity"

# ------------------------------------------------------------
# 2. The staged-authoring boundary moved forward, not away
# ------------------------------------------------------------
# Written in the durable form: the split exists, and it no longer sits at
# Mission 5. Pinning the NEXT mission's anchor is what made the Mission 3 and
# Mission 4 gates fail when the course made approved progress, and this gate
# does not repeat it.
if grep -Fq 'M5_ANCHOR=' "$COURSE_GATE"; then
  fail "the course gate anchors its staged-authoring split at Mission 5; Mission 5 is authored, so the boundary belongs after it"
fi

grep -Eq '^M[678]_ANCHOR=' "$COURSE_GATE" \
  || fail "the course gate no longer anchors a staged-authoring split after Mission 5"

grep -Fq 'UNAUTHORED_SLICE' "$COURSE_GATE" \
  || fail "the course gate no longer splits authored from unauthored missions"

echo "PASS:  2. the staged-authoring boundary sits after Mission 5, not away"

# ------------------------------------------------------------
# 3. Mission 5 stays the small mission it is designed to be
# ------------------------------------------------------------
# Not a numeric pedagogy threshold. Each of these protects a stated design
# decision, and each names the specific well-meaning edit that would lose it.
for forbidden in 'interactionStableId' 'interactionType' 'packet_journey' \
                 'textEquivalent' 'supportLevel' 'sourceKind' \
                 '"type": "prediction"' '"type": "diagram"' '"type": "practice"' \
                 'assessmentStableId' 'assetStableId' 'live_lab'; do
  if grep -qF -e "$forbidden" "$M5_BLOCK"; then
    fail "Mission 5 acquired machinery it was designed without: $forbidden"
  fi
done

READINGS="$(grep -c '"type": "command"' "$M5_BLOCK" || true)"
[ "$READINGS" = "1" ] \
  || fail "Mission 5 shows $READINGS machine readings; it is designed around one idea and one line of output"

M5_STEPS="$(grep -c '"stableId": "m5-s' "$M5_BLOCK" || true)"
M4_STEPS="$(grep -c '"stableId": "m4-s' "$M4_BLOCK" || true)"
[ "$M5_STEPS" -lt "$M4_STEPS" ] \
  || fail "Mission 5 carries $M5_STEPS steps against Mission 4's $M4_STEPS; the change of pace after Mission 4 is the design"

echo "PASS:  3. Mission 5 stays smaller and simpler than Mission 4"

# ------------------------------------------------------------
# 4. The reading is displayed, and shows more than the answer
# ------------------------------------------------------------
grep -Fq 'nothing here offers to run' "$M5_BLOCK" \
  || fail "the command step does not tell the learner the output is not executable"

grep -Fq 'before you read on' "$M5_BLOCK" \
  || grep -Fq 'Before you read on' "$M5_BLOCK" \
  || fail "the learner is not asked to find the line before the answer is revealed"

# The repository's stated intent: "you will learn to find that line and ignore
# the rest, which is a skill in itself". Output trimmed to only the answer
# deletes the skill the mission claims to teach.
grep -Fq 'proto kernel' "$M5_BLOCK" \
  || fail "the machine reading no longer shows anything but the answer; finding the relevant line is the skill"

echo "PASS:  4. the reading is displayed output with something to look past"

# ------------------------------------------------------------
# 5. The artefact Mission 4 planted is the one Mission 5 explains
# ------------------------------------------------------------
# Pinned at BOTH ends. Mission 5 tells the learner they have seen this address
# before; an edit to either mission alone makes that sentence false and nothing
# else in the repository would notice.
grep -Fq '192.168.1.1' "$M5_BLOCK" \
  || fail "Mission 5 no longer uses the address Mission 4 planted on Router-1"

grep -Fq '192.168.1.1/24' "$M4_BLOCK" \
  || fail "Mission 4 no longer shows 192.168.1.1/24 on Router-1; Mission 5 tells the learner they have already seen it"

grep -Fq 'Router-1' "$M5_BLOCK" \
  || fail "Mission 5 no longer names Router-1, so the recognition it depends on cannot happen"

echo "PASS:  5. the Router-1 address continuity holds at both ends"

# ------------------------------------------------------------
# 6. The ledger still orders what Mission 5 teaches
# ------------------------------------------------------------
grep -Eq "^[0-9]+\|nf-m5-the-default-gateway\|default gateway\|" "$LEDGER" \
  || fail "the ledger no longer places 'default gateway' at Mission 5"

# Mission 5 owns exactly one concept. If the ledger ever gave it a second, the
# mission's whole design premise would have changed and this gate should say so.
LEDGER_ROWS="$(grep -cE "^[0-9]+\|nf-m5-the-default-gateway\|" "$LEDGER" || true)"
[ "$LEDGER_ROWS" = "1" ] \
  || fail "the ledger gives Mission 5 $LEDGER_ROWS concepts; it is designed around exactly one"

for later in 'nf-m6-routers-and-the-journey|routing' \
             'nf-m6-routers-and-the-journey|frame versus packet' \
             'nf-m7-testing-whether-it-works|ICMP and ping'; do
  grep -Eq "^[0-9]+\|$later\|" "$LEDGER" \
    || fail "the ledger no longer orders '$later' after Mission 5"
done

echo "PASS:  6. the ledger gives Mission 5 one concept and defers the rest"

# ------------------------------------------------------------
# 7. This slice changed no contract, dependency or migration
# ------------------------------------------------------------
for manifest in package.json package-lock.json apps/web/package.json \
                packages/shared-types/package.json services/api/package.json; do
  if ! git diff --quiet HEAD -- "$manifest" 2>/dev/null; then
    fail "this slice changed a dependency manifest: $manifest"
  fi
done

if [ -d supabase/migrations ] && ! git diff --quiet HEAD -- supabase/migrations 2>/dev/null; then
  fail "this slice changed a migration; Mission 5 authors curriculum only"
fi

for contract in packages/shared-types/src/instruction-interaction.ts \
                packages/shared-types/src/mission-steps.ts \
                packages/shared-types/src/observation-model.ts \
                packages/shared-types/src/roas-curriculum.ts; do
  if ! git diff --quiet HEAD -- "$contract" 2>/dev/null; then
    fail "this slice changed a contract or another course; Mission 5 uses the existing one: $contract"
  fi
done

# Mission 5 authors no interaction, so the presentation had no reason to change.
for source in apps/web/src/learning/topology-layout.ts \
              apps/web/src/learning/packet-journey-presentation.ts; do
  if ! git diff --quiet HEAD -- "$source" 2>/dev/null; then
    fail "this slice changed the journey presentation; Mission 5 authors no journey: $source"
  fi
done

echo "PASS:  7. no contract, dependency, migration or presentation change"

# ------------------------------------------------------------
# 8. Earlier missions are intact
# ------------------------------------------------------------
for earlier in 'm1-s' 'm2-s' 'm3-s' 'm4-s'; do
  grep -Fq "\"stableId\": \"$earlier" "$DOCUMENT" \
    || fail "an earlier mission's authored steps are gone: $earlier"
done

echo "PASS:  8. Missions 1 to 4 are intact"

# ------------------------------------------------------------
# 9. The gate is reachable the way every other gate is
# ------------------------------------------------------------
[ -f "scripts/verify-wpj-m5.sh" ] \
  || fail "this gate is not at the path the verifier namespace resolves"

grep -Fq 'verify-wpj-m5.sh' "$SELECTOR" \
  || fail "the change-relevant selector does not map anything to this gate"

echo "PASS:  9. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# 10. The Founder has something to review
# ------------------------------------------------------------
grep -Fq 'Mission 5' "$RUNBOOK" \
  || fail "the runbook does not cover Mission 5"

for verdict in 'UAT PASSED' 'UAT PASS' 'ACCEPTED' 'APPROVED BY FOUNDER'; do
  if grep -qF -e "$verdict" "$RUNBOOK"; then
    fail "the runbook records a Founder verdict: $verdict"
  fi
done

echo "PASS: 10. the runbook is complete and records no verdict"

# ------------------------------------------------------------
# Delegated: everything about parsed structure
# ------------------------------------------------------------
echo ""
echo "--- running the Mission 5 instructional suite ---"
npm run test --workspace @tlp/api -- networking-foundations-mission5

echo ""
echo "--- running the course architecture suite ---"
npm run test --workspace @tlp/api -- networking-foundations.test

# ------------------------------------------------------------
# Advisory signals. These never fail CI.
# ------------------------------------------------------------
CONCEPTS="$(grep -c '"type": "concept"' "$M5_BLOCK" || true)"

echo ""
echo "--- advisory signals (never fail CI) ---"
printf 'ADVISORY: Mission 5 authored steps:          %s\n' "$M5_STEPS"
printf 'ADVISORY: concept steps:                     %s\n' "$CONCEPTS"
printf 'ADVISORY: machine readings shown:            %s\n' "$READINGS"
printf 'ADVISORY: Mission 4 authored steps:          %s\n' "$M4_STEPS"
echo "ADVISORY: term Mission 5 introduces:         default gateway"
echo "ADVISORY: Mission 5 is deliberately the smallest mission in the course."
echo "ADVISORY: Whether it reads as focused rather than thin is Human UAT, and"
echo "ADVISORY: it is the specific thing this slice should be judged on."

cat <<'SUMMARY'

==========================================================
WP-J MISSION 5 INSTRUCTION VERIFIED

Mission 5 is authored as production curriculum that parses
through the real parser. It reopens the question Mission 4
left standing, shows the machine's own configuration with
more on screen than the answer, connects the address to the
Router-1 artefact Mission 4 planted, and only then names the
default gateway.

It authors no journey, no prediction control, no assessment
and no lab surface, and it stays smaller than Mission 4 —
which is the design rather than an omission.

The constraint that a gateway must itself be locally
reachable is explained with Mission 4's own rule, and is not
turned into the fault Mission 8 may later use.

No Mission 6 vocabulary reaches the learner, so the mission
still ends on the question Mission 6 exists to answer.

This gate proves AUTHORED STRUCTURE, absence and ordering.
It does NOT prove:
  - that the instruction teaches well; that is Human UAT
  - that finding the line reads as a skill rather than noise
  - that the mission feels focused rather than thin
  - anything about a browser rendering; none runs here
==========================================================
SUMMARY
