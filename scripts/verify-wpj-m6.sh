#!/usr/bin/env bash
#
# WP-J7 — Networking Foundations Mission 6, "Routers, and the journey end to
# end".
#
# ## What this gate owns
#
# `verify-wpj.sh` owns the COURSE and the staged-authoring rule. `verify-wpj-m1.sh`
# owns Module 1, and `verify-wpj-m3.sh`, `-m4` and `-m5` own their missions.
# This gate owns Mission 6.
#
# ## What is different about an integration mission
#
# Every earlier gate protects something the mission TEACHES. Mission 6 teaches
# no new capability — all six of its competency links are `reinforces`, and its
# description says so outright: "This mission introduces no new responsibility
# of its own."
#
# So what has to be protected here is the integration itself:
#
#   the round trip completes in BOTH directions  (section 3)
#   the comparison has both of its halves        (section 4)
#   the continuity from five missions holds      (section 5)
#   the three new labels arrive last             (delegated to the suite)
#
# Section 3 is the one worth reading twice. Mission 7's own description names
# Mission 6's round trip as its prerequisite — "follow a message from one group
# to another AND BACK" — so a Mission 6 that quietly lost its return leg would
# leave Mission 7 standing on nothing, and would still look complete.
#
# ## Why so much is delegated
#
# The same reason every gate in this family delegates: the questions worth
# asking are about PARSED structure, and answering them in shell means reading
# JSON with `grep` — a second curriculum parser wearing a disguise.
# `services/api/src/networking-foundations-mission6.test.ts` does that work
# through `parseCurriculumDocument`. What stays here is the file-level facts.
#
# ## What this gate cannot prove
#
# Whether a round trip of this length reads as one story rather than a long
# sequence, and whether re-walking five missions feels like payoff or like
# repetition. Both are Tier 3 human review, and the second is the specific risk
# in an integration mission.

set -euo pipefail

DOCUMENT="content/curriculum/networking-foundations.json"
MISSION6_TESTS="services/api/src/networking-foundations-mission6.test.ts"
COURSE_TESTS="services/api/src/networking-foundations.test.ts"
COURSE_GATE="scripts/verify-wpj.sh"
RUNBOOK="docs/Engineering-OS/WP_J_MISSION_6_UAT_RUNBOOK.md"
LEDGER="scripts/lib/wpj-concept-ledger.txt"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-J MISSION 6 INSTRUCTIONAL GATE ====="
echo ""

for required in "$DOCUMENT" "$MISSION6_TESTS" "$COURSE_TESTS" "$COURSE_GATE" \
                "$RUNBOOK" "$LEDGER" "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

# Blocks are written to FILES, never piped. `printf '%s' "$BLOCK" | grep -q …`
# is a pipefail race: `grep -q` exits on first match, `printf` dies of SIGPIPE
# with status 141, and the pipeline reports 141 despite matching. It fires only
# once the block is large enough — and Mission 6's is the largest yet.
SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

M6_BLOCK="$SCAN_DIR/mission-6.json"
M5_BLOCK="$SCAN_DIR/mission-5.json"

awk '
  /"stableId": "nf-m6-routers-and-the-journey"/ { start = 1 }
  /"stableId": "nf-m7-testing-whether-it-works"/ { start = 0 }
  start
' "$DOCUMENT" > "$M6_BLOCK"

awk '
  /"stableId": "nf-m5-the-default-gateway"/ { start = 1 }
  /"stableId": "nf-m6-routers-and-the-journey"/ { start = 0 }
  start
' "$DOCUMENT" > "$M5_BLOCK"

[ -s "$M6_BLOCK" ] \
  || fail "Mission 6 could not be located; the mission ordering this gate depends on has changed"
[ -s "$M5_BLOCK" ] \
  || fail "Mission 5 could not be located; this gate checks continuity against it"

# ------------------------------------------------------------
# 1. Mission 6 is authored, under its approved identity
# ------------------------------------------------------------
grep -Fq '"title": "Mission 6 — Routers, and the journey end to end"' "$DOCUMENT" \
  || fail "Mission 6's approved title changed"

grep -Fq '"stableId": "m6-s' "$M6_BLOCK" \
  || fail "Mission 6 carries no authored step; this slice authors it"

grep -Fq 'nf-pj6-end-to-end' "$M6_BLOCK" \
  || fail "Mission 6 no longer authors its end-to-end journey"

echo "PASS:  1. Mission 6 is authored under its approved identity"

# ------------------------------------------------------------
# 2. The staged-authoring boundary moved forward, not away
# ------------------------------------------------------------
# The durable form: the split exists, and no longer sits at Mission 6. Pinning
# the NEXT mission's anchor is what made the Mission 3 and Mission 4 gates fail
# when the course made approved progress; that pattern is not repeated.
if grep -Fq 'M6_ANCHOR=' "$COURSE_GATE"; then
  fail "the course gate anchors its staged-authoring split at Mission 6; Mission 6 is authored, so the boundary belongs after it"
fi

grep -Eq '^M[78]_ANCHOR=' "$COURSE_GATE" \
  || fail "the course gate no longer anchors a staged-authoring split after Mission 6"

grep -Fq 'UNAUTHORED_SLICE' "$COURSE_GATE" \
  || fail "the course gate no longer splits authored from unauthored missions"

echo "PASS:  2. the staged-authoring boundary sits after Mission 6, not away"

# ------------------------------------------------------------
# 3. One journey, and it goes out AND comes back
# ------------------------------------------------------------
JOURNEYS="$(grep -c '"interactionStableId"' "$M6_BLOCK" || true)"
[ "$JOURNEYS" = "1" ] \
  || fail "Mission 6 authors $JOURNEYS journeys; the round trip is one continuous exchange and splitting it breaks the continuity it exists to show"

# The return leg, as file facts. The parsed form — reaching PC-C before
# returning to PC-A — is asserted in the suite.
for leg in 't5-pc-c-answers' 't6-return-first-leg' 't7-return-second-leg' 't8-back-at-pc-a'; do
  grep -Fq "$leg" "$M6_BLOCK" \
    || fail "the return leg is gone: $leg — Mission 7 requires the learner to follow a message there AND BACK"
done

# Both of Router-1's connections are used, in both directions.
grep -Fq '"link-far"' "$M6_BLOCK" \
  || fail "Mission 6 never uses Router-1's far connection; the trip cannot leave the first network"

echo "PASS:  3. one continuous journey, out and back, across both connections"

# ------------------------------------------------------------
# 4. Both halves of the comparison are authored
# ------------------------------------------------------------
# The conceptual centre: what survives the trip, and what is rebuilt per leg.
# A curriculum stating only one of them leaves the comparison with nothing to
# compare, and the mission's whole point resting on the learner noticing an
# absence.
grep -Fq "This leg's local delivery" "$M6_BLOCK" \
  || fail "Mission 6 no longer states the per-leg local delivery; the rebuilt half of the comparison is gone"

grep -Fq 'ultimately going' "$M6_BLOCK" \
  || fail "Mission 6 no longer states where the exchange is ultimately going; the surviving half of the comparison is gone"

LEGS="$(grep -c "This leg's local delivery" "$M6_BLOCK" || true)"
[ "$LEGS" -ge 4 ] \
  || fail "Mission 6 states $LEGS per-leg deliveries; a round trip across two networks has four"

echo "PASS:  4. what survives and what is rebuilt are both authored facts"

# ------------------------------------------------------------
# 5. Continuity with five earlier missions
# ------------------------------------------------------------
for value in '192.168.1.10/24' '00:1b:44:11:3a:b7' \
             '192.168.1.11/24' '00:1b:44:11:3a:c2' \
             '192.168.1.12/24' '00:1b:44:11:3a:d9' \
             '192.168.1.1/24'  '00:1b:44:11:3a:01' \
             '192.168.2.1/24'  '00:1b:44:11:3a:02' \
             '192.168.2.20/24' '00:1b:44:11:3a:e4'; do
  grep -Fq "$value" "$M6_BLOCK" \
    || fail "Mission 6 no longer carries an established curriculum value: $value"
done

# Mission 5 must still say what it said about 192.168.2.1. Mission 6 reuses the
# same address as an ordinary one on Router-1's far side, and both are true —
# but only if Mission 5's teaching is still there to be true.
grep -Fq '192.168.2.1' "$M5_BLOCK" \
  || fail "Mission 5 no longer discusses 192.168.2.1; Mission 6's reuse of it depends on that teaching standing"

# The interface identities Missions 4 and 5 established.
grep -Fq '"r-1-lan"' "$M6_BLOCK" \
  || fail "Mission 6 no longer uses the r-1-lan interface identity"
grep -Fq '"r-1-far"' "$M6_BLOCK" \
  || fail "Mission 6 no longer uses the r-1-far interface identity"

echo "PASS:  5. every established value and interface identity is intact"

# ------------------------------------------------------------
# 6. Mission 6 develops nothing, and stays teaching
# ------------------------------------------------------------
if grep -Fq '"relationship": "develops"' "$M6_BLOCK"; then
  fail "Mission 6 claims to develop a competency; it is an integration mission and its own description says it introduces no new responsibility"
fi

for forbidden in 'assessmentStableId' 'assetStableId' 'live_lab' \
                 '"type": "prediction"' '"type": "command"' \
                 '"type": "diagram"' '"type": "practice"'; do
  if grep -qF -e "$forbidden" "$M6_BLOCK"; then
    fail "Mission 6 acquired machinery it was designed without: $forbidden"
  fi
done

# A fault would make an outcome depend on a learner action, and diagnosis is
# Mission 8's. Mission 6 is the successful journey.
if grep -Fq '"fault"' "$M6_BLOCK"; then
  fail "Mission 6 authored a fault; it is the successful journey and diagnosis belongs to Mission 8"
fi

echo "PASS:  6. Mission 6 develops nothing and authors no fault or evidence surface"

# ------------------------------------------------------------
# 7. The ledger still orders what Mission 6 teaches
# ------------------------------------------------------------
for concept in 'routing' 'frame versus packet' 'Layer 2 and Layer 3'; do
  grep -Eq "^[0-9]+\|nf-m6-routers-and-the-journey\|$concept\|" "$LEDGER" \
    || fail "the ledger no longer places '$concept' at Mission 6"
done

for later in 'nf-m7-testing-whether-it-works|ICMP and ping' \
             'nf-m8-when-it-does-not-work|simple failure reasoning'; do
  grep -Eq "^[0-9]+\|$later\|" "$LEDGER" \
    || fail "the ledger no longer orders '$later' after Mission 6"
done

echo "PASS:  7. the ledger orders Mission 6's three concepts and defers the rest"

# ------------------------------------------------------------
# 8. This slice changed no contract, dependency or migration
# ------------------------------------------------------------
for manifest in package.json package-lock.json apps/web/package.json \
                packages/shared-types/package.json services/api/package.json; do
  if ! git diff --quiet HEAD -- "$manifest" 2>/dev/null; then
    fail "this slice changed a dependency manifest: $manifest"
  fi
done

if [ -d supabase/migrations ] && ! git diff --quiet HEAD -- supabase/migrations 2>/dev/null; then
  fail "this slice changed a migration; Mission 6 authors curriculum only"
fi

for contract in packages/shared-types/src/instruction-interaction.ts \
                packages/shared-types/src/mission-steps.ts \
                packages/shared-types/src/observation-model.ts \
                packages/shared-types/src/roas-curriculum.ts; do
  if ! git diff --quiet HEAD -- "$contract" 2>/dev/null; then
    fail "this slice changed a contract or another course; Mission 6 uses the existing one: $contract"
  fi
done

# Mission 6 authors the longest journey in the course through the EXISTING
# renderer. If the presentation changed, the journey was made to fit the
# picture rather than the picture proving sufficient.
for source in apps/web/src/learning/topology-layout.ts \
              apps/web/src/learning/packet-journey-presentation.ts; do
  if ! git diff --quiet HEAD -- "$source" 2>/dev/null; then
    fail "this slice changed the journey presentation; Mission 6 uses the existing architecture: $source"
  fi
done

echo "PASS:  8. no contract, dependency, migration or presentation change"

# ------------------------------------------------------------
# 9. Earlier missions are intact
# ------------------------------------------------------------
for earlier in 'm1-s' 'm2-s' 'm3-s' 'm4-s' 'm5-s'; do
  grep -Fq "\"stableId\": \"$earlier" "$DOCUMENT" \
    || fail "an earlier mission's authored steps are gone: $earlier"
done

echo "PASS:  9. Missions 1 to 5 are intact"

# ------------------------------------------------------------
# 10. The gate is reachable the way every other gate is
# ------------------------------------------------------------
[ -f "scripts/verify-wpj-m6.sh" ] \
  || fail "this gate is not at the path the verifier namespace resolves"

grep -Fq 'verify-wpj-m6.sh' "$SELECTOR" \
  || fail "the change-relevant selector does not map anything to this gate"

echo "PASS: 10. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# 11. The Founder has something to review
# ------------------------------------------------------------
grep -Fq 'Mission 6' "$RUNBOOK" \
  || fail "the runbook does not cover Mission 6"

for verdict in 'UAT PASSED' 'UAT PASS' 'ACCEPTED' 'APPROVED BY FOUNDER'; do
  if grep -qF -e "$verdict" "$RUNBOOK"; then
    fail "the runbook records a Founder verdict: $verdict"
  fi
done

echo "PASS: 11. the runbook is complete and records no verdict"

# ------------------------------------------------------------
# Delegated: everything about parsed structure
# ------------------------------------------------------------
echo ""
echo "--- running the Mission 6 instructional suite ---"
npm run test --workspace @tlp/api -- networking-foundations-mission6

echo ""
echo "--- running the course architecture suite ---"
npm run test --workspace @tlp/api -- networking-foundations.test

# ------------------------------------------------------------
# Advisory signals. These never fail CI.
# ------------------------------------------------------------
STEPS="$(grep -c '"stableId": "m6-s' "$M6_BLOCK" || true)"
CONCEPTS="$(grep -c '"type": "concept"' "$M6_BLOCK" || true)"
STAGES="$(grep -c '"stageId"' "$M6_BLOCK" || true)"
PREDICTIONS="$(grep -c '"prediction"' "$M6_BLOCK" || true)"
DEVICES="$(grep -c '"nodeId": "' "$M6_BLOCK" || true)"

echo ""
echo "--- advisory signals (never fail CI) ---"
printf 'ADVISORY: Mission 6 authored steps:          %s\n' "$STEPS"
printf 'ADVISORY: concept steps:                     %s\n' "$CONCEPTS"
printf 'ADVISORY: journey stages (round trip):       %s\n' "$STAGES"
printf 'ADVISORY: learner predictions:               %s\n' "$PREDICTIONS"
printf 'ADVISORY: local deliveries stated:           %s\n' "$LEGS"
echo "ADVISORY: terms Mission 6 introduces:        routing, packet,"
echo "ADVISORY:                                    Layer 2, Layer 3"
echo "ADVISORY: this is the integration mission. Whether the round trip reads"
echo "ADVISORY: as one story rather than a long sequence, and whether five"
echo "ADVISORY: missions coming together feels like payoff rather than"
echo "ADVISORY: repetition, is Human UAT and cannot be counted."

cat <<'SUMMARY'

==========================================================
WP-J MISSION 6 INSTRUCTION VERIFIED

Mission 6 is authored as production curriculum that parses
through the real parser. One continuous journey carries an
exchange from PC-A to PC-C and back, across two networks and
through both of Router-1's connections, and every stage
proceeds — it is the successful journey.

Both halves of its central comparison are authored facts:
where the exchange is ultimately going, stated repeatedly and
unchanged, and the separate local delivery made on each of
the four legs. Neither is computed.

Routing, packet and the two layer labels are named only after
the learner has watched the behaviour each one describes, and
no numbered layer model is taught.

Mission 6 develops no competency. All six of its links
reinforce work developed in Missions 1 to 5, which is what an
integration mission is for.

The staged-authoring boundary sits after Mission 6, so
Missions 7 and 8 remain prohibited.

This gate proves AUTHORED STRUCTURE, absence and ordering.
It does NOT prove:
  - that the instruction teaches well; that is Human UAT
  - that the round trip reads as one coherent story
  - that the reuse feels like payoff rather than repetition
  - anything about a browser rendering; none runs here
==========================================================
SUMMARY
