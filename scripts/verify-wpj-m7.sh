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
source scripts/lib/authorized-dependency.sh
authorized_dependency_check "the Mission 7 slice"

if [ -d supabase/migrations ] && ! git diff --quiet HEAD -- supabase/migrations 2>/dev/null; then
  fail "this slice changed a migration; Mission 7 authors curriculum only"
fi

# ## Why the interaction contract is no longer in this list
#
# It used to assert `git diff --quiet HEAD` over
# `instruction-interaction.ts`, on the reasoning that a CURRICULUM slice has no
# business editing the contract. That was right for a curriculum slice and
# wrong as a permanent rule: DEC-064 adds the knowledge-check type to that file
# under Founder approval, and a guard that fails on authorised work is a guard
# that gets deleted rather than fixed.
#
# The invariant underneath it was never "these bytes do not change". It was
# that Mission 7 USES the contract rather than bending it — and specifically
# that a prediction never acquires an answer key, which `verify-wph.sh` asserts
# directly on the prediction type. The remaining contracts stay pinned below.
# Rebased in the Mission 8 refinement. `verify-wph.sh` used to forbid
# `correctOption` on the prediction contract outright, and every mission gate
# delegated to that one string. A Founder ruling then made the field available,
# optionally, so that a learner never has to infer from "what actually
# happened" whether their own model was right.
#
# Delegation alone was always the weaker check: it asserted something about a
# TYPE, in another file, and said nothing about this mission. So each gate now
# asserts what its own mission actually relies on. Mission 7 authors
# exploratory predictions — the learner cannot yet reason the answer out, the
# observation IS the answer, and marking the guess would punish them for doing
# what was asked. None of its predictions may carry a correct option.
grep -Fq 'const PREDICTION_KEYS = ["prompt", "options"] as const;' packages/shared-types/src/instruction-interaction.ts \
  || fail "correctOption became REQUIRED on a prediction; Mission 7 relies on a prediction staying ungradeable"

# The per-mission half of this — that Mission 7 authors no GRADED prediction —
# is asserted in `networking-foundations.test.ts`, which parses the document.
# A grep here cannot tell a prediction's correct option from a knowledge
# check's, and a knowledge check is supposed to have one.

# `observation-model.ts` is excluded for the same reason
# `instruction-interaction.ts` is (DEC-064 note above): the Founder UAT repair
# adds an authored `action` to a stage so the pane can head with what a device
# is DOING rather than only where the learner is. What must not change is that
# the model reports authored observations rather than computing them, and
# `verify-wpj-m1.sh` section 7 asserts that over every presentation source.
grep -Fq 'networking truth entered the presentation layer' scripts/verify-wpj-m1.sh \
  || fail "the renderer-computes-nothing guard is gone"

# `mission-steps.ts` left this pin for the same reason `instruction-interaction.ts`
# did above. It was `git diff --quiet HEAD`, on the reasoning that a curriculum
# slice has no business editing the step contract — right for a curriculum
# slice, wrong as a permanent rule. WP-NF-NT1 adds `near_transfer` to the
# vocabulary under a DEC-054 amendment, and a guard that fails on authorised
# work is a guard that gets deleted rather than fixed.
#
# The invariant underneath was that Mission 7 USES the vocabulary rather than
# inventing one for itself. So: the vocabulary stays closed, and Mission 7
# authors only types inside it.
grep -Fq 'The set is closed.' packages/shared-types/src/mission-steps.ts \
  || fail "the step vocabulary is no longer declared closed; Mission 7 relies on authoring within a fixed set"

grep -Fq 'the vocabulary is closed at ${MISSION_STEP_TYPES.join(", ")}' packages/shared-types/src/mission-steps.ts \
  || fail "an unapproved step type no longer fails validation; the closed vocabulary would be advisory"

# Read from Mission 7's own block, so a type introduced anywhere else in the
# course cannot satisfy this and a type introduced HERE cannot hide.
while IFS= read -r authored; do
  case "$authored" in
    concept|diagram|command|prediction|interaction|practice|near_transfer|reference) ;;
    *) fail "Mission 7 authors the step type \"$authored\", which is not in the closed vocabulary" ;;
  esac
done < <(grep -o '"type": "[a-z_]*"' "$M7_BLOCK" | sed 's/.*: "//; s/"//')

# The other course stays pinned. Nothing in Networking Foundations has any
# reason to edit Router-on-a-Stick, and no ruling has changed that.
if ! git diff --quiet HEAD -- packages/shared-types/src/roas-curriculum.ts 2>/dev/null; then
  fail "this slice changed another course: packages/shared-types/src/roas-curriculum.ts"
fi

# ## Why this no longer forbids the presentation from changing at all
#
# It used to assert `git diff --quiet HEAD` over the journey presentation, on
# the reasoning that a CURRICULUM slice has no business editing the renderer.
# That was right for a curriculum slice and wrong as a permanent rule: the
# Founder UAT repair wave is a PRESENTATION slice, authorised to change exactly
# these files, and a guard that fails on authorised work is a guard that gets
# deleted rather than fixed.
#
# The invariant underneath it was never "these bytes do not change". It was
# "no networking truth lives in the renderer" — Mission 7 may DESCRIBE what a
# network does and nothing in `apps/web` may COMPUTE it. That is asserted over
# every presentation source, test files excluded, in `verify-wpj-m1.sh`
# section 7, and it survives a presentation change because it reads what the
# code DOES rather than whether it moved.
#
# So this asserts the guard still exists and still covers these files, which is
# the part Mission 7's gate can meaningfully own.
grep -Fq 'networking truth entered the presentation layer' scripts/verify-wpj-m1.sh \
  || fail "the renderer-computes-nothing guard is gone; Mission 7's journey depends on the presentation staying presentation"

for computed in routingTable computeRoute nextHop calculateSubnet forwardingTable; do
  if grep -qF -e "$computed" apps/web/src/learning/topology-layout.ts \
       apps/web/src/learning/packet-journey-presentation.ts; then
    fail "networking truth entered the journey presentation: $computed"
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
