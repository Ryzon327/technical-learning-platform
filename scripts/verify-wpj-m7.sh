#!/usr/bin/env bash
#
# WP-J8 — Networking Foundations Mission 7, "Testing whether it actually works".
#
# ## What this gate owns
#
# `verify-wpj.sh` owns the COURSE and the staged-authoring rule; the per-mission
# gates own what is inside their own mission. This gate owns Mission 7.
#
# ## The failure mode this gate exists to catch
#
# Mission 7 introduces `ping`, and the way it goes wrong is not that the command
# is documented badly. It is that the mission becomes ABOUT the command.
#
# Its description forbids exactly that — "Reading it is not the interesting
# part; deciding what to test is" — and the competency it develops is about
# choosing a test and telling a confirming result from a merely consistent one.
# So section 4 checks the CLAIMS the mission makes about its two results, which
# is where all of the teaching actually lives. The two command steps are nearly
# identical; everything that distinguishes them is prose.
#
# ## Nothing here is broken, and that is load-bearing
#
# Mission 8 owns real failure, diagnosis, repair and post-repair confirmation.
# Mission 7 reasons about a failed gateway test HYPOTHETICALLY, and section 5
# keeps that hypothetical from quietly becoming an authored failure — which
# would spend Mission 8's entire payoff a mission early.
#
# ## Why so much is delegated
#
# The same reason every gate in this family delegates: the questions worth
# asking are about PARSED structure, and answering them in shell means reading
# JSON with `grep` — a second curriculum parser wearing a disguise.
# `services/api/src/networking-foundations-mission7.test.ts` does that work
# through `parseCurriculumDocument`. What stays here is the file-level facts.
#
# ## What this gate cannot prove
#
# Whether the confirms-versus-consistent-with distinction lands, or reads as
# hair-splitting. That is Tier 3 human review — and in a mission this small it
# is the only thing holding the mission up.

set -euo pipefail

DOCUMENT="content/curriculum/networking-foundations.json"
MISSION7_TESTS="services/api/src/networking-foundations-mission7.test.ts"
COURSE_TESTS="services/api/src/networking-foundations.test.ts"
COURSE_GATE="scripts/verify-wpj.sh"
RUNBOOK="docs/Engineering-OS/WP_J_MISSION_7_UAT_RUNBOOK.md"
LEDGER="scripts/lib/wpj-concept-ledger.txt"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-J MISSION 7 INSTRUCTIONAL GATE ====="
echo ""

for required in "$DOCUMENT" "$MISSION7_TESTS" "$COURSE_TESTS" "$COURSE_GATE" \
                "$RUNBOOK" "$LEDGER" "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

# Blocks are written to FILES, never piped. `printf '%s' "$BLOCK" | grep -q …`
# is a pipefail race: `grep -q` exits on first match, `printf` dies of SIGPIPE
# with status 141, and the pipeline reports 141 despite matching.
SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

M7_BLOCK="$SCAN_DIR/mission-7.json"

awk '
  /"stableId": "nf-m7-testing-whether-it-works"/ { start = 1 }
  /"stableId": "nf-m8-when-it-does-not-work"/ { start = 0 }
  start
' "$DOCUMENT" > "$M7_BLOCK"

[ -s "$M7_BLOCK" ] \
  || fail "Mission 7 could not be located; the mission ordering this gate depends on has changed"

# ------------------------------------------------------------
# 1. Mission 7 is authored, under its approved identity
# ------------------------------------------------------------
grep -Fq '"title": "Mission 7 — Testing whether it actually works"' "$DOCUMENT" \
  || fail "Mission 7's approved title changed"

grep -Fq '"stableId": "m7-s' "$M7_BLOCK" \
  || fail "Mission 7 carries no authored step; this slice authors it"

echo "PASS:  1. Mission 7 is authored under its approved identity"

# ------------------------------------------------------------
# 2. This mission is declared authored, and owns its own instruction
# ------------------------------------------------------------
# This section used to assert that the course gate's staged-authoring anchor
# had moved past Mission 7 and that some LATER anchor still existed. That was
# the durable form of a check that had already broken once by pinning the next
# mission's name, and it survived three boundary moves — but it still encoded
# an opinion about a mission this gate does not own.
#
# It could not survive the last move. Mission 8 has no successor, so "a later
# anchor exists" became a claim about a mission that will never be declared,
# and all five mission gates would have failed at once on the slice that
# authored it. DEC-061 replaces the anchor with an explicit declaration of
# which missions are approved and which are authored.
#
# So this gate now asserts what it actually owns: the declaration lists
# Mission 7 as authored, and Mission 7's steps appear under Mission 7
# and nowhere else. Both are true in either authoring state, and neither goes
# stale when a later slice lands. Whether the course as a whole is STAGED or
# FULLY_AUTHORED is the course gate's business, and it is the only place that
# decides it.
source scripts/lib/wpj-mission-authority.sh
wpj_mission_authority_load

wpj_require_authored 'nf-m7-testing-whether-it-works' 'verify-wpj-m7.sh'

grep -Fq 'wpj_mission_authority_load' "$COURSE_GATE" \
  || fail "the course gate no longer reads the mission authority declaration; nothing would then constrain which missions may carry instruction"

MISSION_STEP_OWNERSHIP="$SCAN_DIR/m7-step-ownership.txt"
grep -o '"stableId": "m[0-9]*-s[^"]*"' "$DOCUMENT" > "$MISSION_STEP_OWNERSHIP" || true

M7_OWN_STEPS="$(grep -c '"stableId": "m7-s' "$MISSION_STEP_OWNERSHIP" || true)"
M7_BLOCK_STEPS="$(grep -c '"stableId": "m7-s' "$M7_BLOCK" || true)"

[ "$M7_OWN_STEPS" = "$M7_BLOCK_STEPS" ] \
  || fail "$M7_OWN_STEPS Mission 7 steps exist in the document but only $M7_BLOCK_STEPS sit inside Mission 7; instruction may not migrate between missions"

echo "PASS:  2. Mission 7 is declared authored and owns its own instruction"

# ------------------------------------------------------------
# 3. Two displayed tests, both successful, no journey
# ------------------------------------------------------------
# Architect Decision A: Mission 6 delivered the definitive journey one mission
# ago. Animating traffic again would be anticlimax, and Mission 7's substance
# is inference rather than motion.
for forbidden in 'interactionStableId' 'interactionType' 'packet_journey' \
                 'textEquivalent' 'supportLevel' 'sourceKind' \
                 '"type": "prediction"' '"type": "diagram"' '"type": "practice"' \
                 'assessmentStableId' 'assetStableId' 'live_lab'; do
  if grep -qF -e "$forbidden" "$M7_BLOCK"; then
    fail "Mission 7 acquired machinery it was designed without: $forbidden"
  fi
done

TESTS="$(grep -c '"type": "command"' "$M7_BLOCK" || true)"
[ "$TESTS" = "2" ] \
  || fail "Mission 7 shows $TESTS tests; it is built on exactly two, one for each provable claim"

for target in '192.168.1.1' '192.168.2.20'; do
  grep -Fq "ping -c 3 $target" "$M7_BLOCK" \
    || fail "Mission 7 no longer tests the approved target: $target"
done

# Architect Decision H: the platform displays authored output and executes
# nothing. Both captions must say so.
HONEST="$(grep -c 'nothing here offers to run' "$M7_BLOCK" || true)"
[ "$HONEST" = "2" ] \
  || fail "$HONEST of 2 captions tell the learner the output is not executable"

echo "PASS:  3. two displayed tests against the approved targets, and no journey"

# ------------------------------------------------------------
# 4. The claims each result supports
# ------------------------------------------------------------
# Where the whole mission lives. The gateway result must carry BOTH halves —
# what it proves and what it does not — because an overclaiming edit drops the
# second half and nothing else would notice.
grep -Fq 'says nothing about whether PC-C is reachable' "$M7_BLOCK" \
  || fail "Mission 7 no longer states what the gateway result does NOT prove; that limit is the mission"

grep -Fq 'consistent with' "$M7_BLOCK" \
  || fail "Mission 7 no longer draws the confirms-versus-consistent-with distinction"

grep -Fq 'what else would have produced' "$M7_BLOCK" \
  || fail "Mission 7 no longer leaves the learner the portable habit; the distinction becomes terminology without it"

echo "PASS:  4. both halves of the claim boundary and the habit are authored"

# ------------------------------------------------------------
# 5. Nothing is actually broken
# ------------------------------------------------------------
# Architect Decision F. Mission 8 owns real failure, and the ordering lesson
# here is taught from a hypothesis rather than from a fault.
SUCCESSES="$(grep -c '0% packet loss' "$M7_BLOCK" || true)"
[ "$SUCCESSES" = "2" ] \
  || fail "$SUCCESSES of 2 results succeed; Mission 7 shows no real failure"

if grep -Eq '[1-9][0-9]*% packet loss|Destination Host Unreachable' "$M7_BLOCK"; then
  fail "Mission 7 shows a failed test; Mission 8 owns real failure"
fi

grep -Fq 'Suppose PC-A could not reach' "$M7_BLOCK" \
  || fail "Mission 7 no longer poses the failed-gateway case as a hypothesis; test ordering has nothing to reason from"

echo "PASS:  5. every result succeeds, and the ordering lesson is hypothetical"

# ------------------------------------------------------------
# 6. The ledger still orders what Mission 7 teaches
# ------------------------------------------------------------
for concept in 'ICMP and ping' 'reachability observation'; do
  grep -Eq "^[0-9]+\|nf-m7-testing-whether-it-works\|$concept\|" "$LEDGER" \
    || fail "the ledger no longer places '$concept' at Mission 7"
done

for later in 'simple failure reasoning' 'bounded repair' 'confirmation after repair'; do
  grep -Eq "^[0-9]+\|nf-m8-when-it-does-not-work\|$later\|" "$LEDGER" \
    || fail "the ledger no longer defers '$later' to Mission 8"
done

echo "PASS:  6. the ledger orders Mission 7's concepts and defers Mission 8's"

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
  fail "this slice changed a migration; Mission 7 authors curriculum only"
fi

for contract in packages/shared-types/src/instruction-interaction.ts \
                packages/shared-types/src/mission-steps.ts \
                packages/shared-types/src/observation-model.ts \
                packages/shared-types/src/roas-curriculum.ts; do
  if ! git diff --quiet HEAD -- "$contract" 2>/dev/null; then
    fail "this slice changed a contract or another course; Mission 7 uses the existing one: $contract"
  fi
done

# Mission 7 authors no interaction, so the presentation had no reason to change.
for source in apps/web/src/learning/topology-layout.ts \
              apps/web/src/learning/packet-journey-presentation.ts; do
  if ! git diff --quiet HEAD -- "$source" 2>/dev/null; then
    fail "this slice changed the journey presentation; Mission 7 authors no journey: $source"
  fi
done

echo "PASS:  7. no contract, dependency, migration or presentation change"

# ------------------------------------------------------------
# 8. Earlier missions are intact
# ------------------------------------------------------------
for earlier in 'm1-s' 'm2-s' 'm3-s' 'm4-s' 'm5-s' 'm6-s'; do
  grep -Fq "\"stableId\": \"$earlier" "$DOCUMENT" \
    || fail "an earlier mission's authored steps are gone: $earlier"
done

echo "PASS:  8. Missions 1 to 6 are intact"

# ------------------------------------------------------------
# 9. The gate is reachable the way every other gate is
# ------------------------------------------------------------
[ -f "scripts/verify-wpj-m7.sh" ] \
  || fail "this gate is not at the path the verifier namespace resolves"

grep -Fq 'verify-wpj-m7.sh' "$SELECTOR" \
  || fail "the change-relevant selector does not map anything to this gate"

echo "PASS:  9. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# 10. The Founder has something to review
# ------------------------------------------------------------
grep -Fq 'Mission 7' "$RUNBOOK" \
  || fail "the runbook does not cover Mission 7"

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
echo "--- running the Mission 7 instructional suite ---"
npm run test --workspace @tlp/api -- networking-foundations-mission7

echo ""
echo "--- running the course architecture suite ---"
npm run test --workspace @tlp/api -- networking-foundations.test

# ------------------------------------------------------------
# Advisory signals. These never fail CI.
# ------------------------------------------------------------
STEPS="$(grep -c '"stableId": "m7-s' "$M7_BLOCK" || true)"
CONCEPTS="$(grep -c '"type": "concept"' "$M7_BLOCK" || true)"

echo ""
echo "--- advisory signals (never fail CI) ---"
printf 'ADVISORY: Mission 7 authored steps:          %s\n' "$STEPS"
printf 'ADVISORY: concept steps:                     %s\n' "$CONCEPTS"
printf 'ADVISORY: tests shown:                       %s\n' "$TESTS"
printf 'ADVISORY: results that succeed:              %s of %s\n' "$SUCCESSES" "$TESTS"
echo "ADVISORY: terms Mission 7 introduces:        ping, ICMP"
echo "ADVISORY: this mission is small, and the command in it is smaller still."
echo "ADVISORY: whether the confirms-versus-consistent-with distinction lands,"
echo "ADVISORY: or reads as hair-splitting, is Human UAT — and it is the only"
echo "ADVISORY: thing holding the mission up."

cat <<'SUMMARY'

==========================================================
WP-J MISSION 7 INSTRUCTION VERIFIED

Mission 7 is authored as production curriculum that parses
through the real parser. It reopens Mission 6's question,
shows two successful tests against the gateway and the far
host, and names ping and ICMP only after a result has been
put in front of the learner.

Each result is tied to exactly the claim it supports. The
gateway result carries both halves — what it proves, and
that it says nothing about whether PC-C is reachable — and
the far-host result is bounded to that exchange rather than
to "the network works".

Nothing is broken IN MISSION 7. Both results succeed and
the lesson about which test to run first is reasoned from a
hypothesis rather than from a failure, so the first real
failure is still Mission 8's — and this gate still fails if a
broken result appears here.

No journey, no prediction control, no assessment and no lab
surface. Mission 7 develops connectivity verification and
produces no evidence.

This gate proves AUTHORED STRUCTURE, absence and ordering.
It does NOT prove:
  - that the instruction teaches well; that is Human UAT
  - that the confirms/consistent-with distinction lands
  - that the mission reads as focused rather than thin
  - anything about a browser rendering; none runs here
==========================================================
SUMMARY
