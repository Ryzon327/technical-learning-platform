#!/usr/bin/env bash
#
# WP-J4 — Networking Foundations Mission 3, "IPv4 addresses: the second
# identity".
#
# ## What this gate owns
#
# `verify-wpj.sh` owns the COURSE: identity, architecture, competency
# accountability, and the staged-authoring rule that says which missions may
# carry instruction at all. `verify-wpj-m1.sh` owns what is inside Module 1.
# This gate owns what is inside Mission 3.
#
# It is deliberately NOT a copy of the Module 1 gate. Module 1 teaches by
# following traffic across a topology, so its gate is largely about packet
# journeys: stages, links, simultaneity, learned state, port labels. Mission 3
# teaches by reading a machine's own report, and authors no journey at all.
# A gate that asserted Module 1's shape here would demand an interaction the
# mission has no reason to author, and would say nothing about the things that
# actually make Mission 3 correct.
#
# ## What makes Mission 3 correct
#
# Two facts, and they pull in opposite directions:
#
#   1. It must TEACH the second identity — the term IPv4 arrives here, and the
#      learner must read a real address off real output.
#   2. It must STOP THERE. Knowing the address does not tell the learner which
#      other addresses are local, and Mission 3 is written to end on that
#      unresolved need so Mission 4 has something to resolve.
#
# The second is the fragile one. A single forward reference — one "prefix", one
# "subnet mask" — would answer the question the mission exists to leave open,
# and the mission would still look complete while no longer working. That is
# why the vocabulary assertions are not housekeeping here.
#
# ## Why so much is delegated to a test suite
#
# The same reason the Module 1 gate delegates: every question worth asking is a
# question about PARSED structure, and answering it in shell would mean reading
# JSON with `grep` — a second curriculum parser wearing a disguise, which drifts
# from the real contract the first time the contract changes.
#
# `services/api/src/networking-foundations-mission3.test.ts` does that work
# through `parseCurriculumDocument`, the real one. What stays here is the set of
# facts genuinely about FILES: which exist, what the repository has not
# acquired, and what this slice must not have disturbed elsewhere.
#
# ## What this gate cannot prove
#
# Whether Mission 3 teaches. That is Human UAT and Tier 3 review (CURR-009
# section 14a), and no assertion below should be read as evidence of it.

set -euo pipefail

DOCUMENT="content/curriculum/networking-foundations.json"
MISSION3_TESTS="services/api/src/networking-foundations-mission3.test.ts"
COURSE_TESTS="services/api/src/networking-foundations.test.ts"
COURSE_GATE="scripts/verify-wpj.sh"
RUNBOOK="docs/Engineering-OS/WP_J_MISSION_3_UAT_RUNBOOK.md"
LEDGER="scripts/lib/wpj-concept-ledger.txt"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-J MISSION 3 INSTRUCTIONAL GATE ====="
echo ""

for required in "$DOCUMENT" "$MISSION3_TESTS" "$COURSE_TESTS" "$COURSE_GATE" \
                "$RUNBOOK" "$LEDGER" "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

# ------------------------------------------------------------
# 1. Mission 3 is authored, and is the mission it says it is
# ------------------------------------------------------------
grep -Fq '"stableId": "nf-m3-ipv4-the-second-identity"' "$DOCUMENT" \
  || fail "Mission 3 is not in the document under its approved stable id"

grep -Fq '"title": "Mission 3 — IPv4 addresses: the second identity"' "$DOCUMENT" \
  || fail "Mission 3's approved title changed"

grep -Fq '"stableId": "m3-s' "$DOCUMENT" \
  || fail "Mission 3 carries no authored step; this slice authors it"

echo "PASS:  1. Mission 3 is authored under its approved identity"

# The extracted block is written to a FILE rather than held in a variable and
# piped, and that is not a style preference.
#
# `printf '%s' "$BLOCK" | grep -q …` is a pipefail race. `grep -q` exits the
# moment it matches, which closes the pipe; `printf` then dies of SIGPIPE with
# status 141, and under `set -o pipefail` the pipeline reports 141 even though
# the match succeeded. It only fires when the block is large enough that printf
# has not finished writing — so it passes on a small mission and fails on a big
# one, which is the worst possible failure mode for a guardrail. This repository
# has already fixed one of these once.
#
# Grepping a file has no pipe, no second process and no race.
SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

M3_BLOCK="$SCAN_DIR/mission-3.json"

awk '
  /"stableId": "nf-m3-ipv4-the-second-identity"/ { start = 1 }
  /"stableId": "nf-m4-the-prefix-and-the-decision"/ { start = 0 }
  start
' "$DOCUMENT" > "$M3_BLOCK"

[ -s "$M3_BLOCK" ] \
  || fail "Mission 3 could not be located; the mission ordering this gate depends on has changed"

# ------------------------------------------------------------
# 2. This mission is declared authored, and owns its own instruction
# ------------------------------------------------------------
# This section used to assert that the course gate's staged-authoring anchor
# had moved past Mission 3 and that some LATER anchor still existed. That was
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
# Mission 3 as authored, and Mission 3's steps appear under Mission 3
# and nowhere else. Both are true in either authoring state, and neither goes
# stale when a later slice lands. Whether the course as a whole is STAGED or
# FULLY_AUTHORED is the course gate's business, and it is the only place that
# decides it.
source scripts/lib/wpj-mission-authority.sh
wpj_mission_authority_load

wpj_require_authored 'nf-m3-ipv4-the-second-identity' 'verify-wpj-m3.sh'

grep -Fq 'wpj_mission_authority_load' "$COURSE_GATE" \
  || fail "the course gate no longer reads the mission authority declaration; nothing would then constrain which missions may carry instruction"

MISSION_STEP_OWNERSHIP="$SCAN_DIR/m3-step-ownership.txt"
grep -o '"stableId": "m[0-9]*-s[^"]*"' "$DOCUMENT" > "$MISSION_STEP_OWNERSHIP" || true

M3_OWN_STEPS="$(grep -c '"stableId": "m3-s' "$MISSION_STEP_OWNERSHIP" || true)"
M3_BLOCK_STEPS="$(grep -c '"stableId": "m3-s' "$M3_BLOCK" || true)"

[ "$M3_OWN_STEPS" = "$M3_BLOCK_STEPS" ] \
  || fail "$M3_OWN_STEPS Mission 3 steps exist in the document but only $M3_BLOCK_STEPS sit inside Mission 3; instruction may not migrate between missions"

echo "PASS:  2. Mission 3 is declared authored and owns its own instruction"

# ------------------------------------------------------------
# 3. Mission 3 authored no interaction, and needed none
# ------------------------------------------------------------
# Mission 3 reads a machine's report. There is nothing travelling, so a packet
# journey would be a moving picture of nothing — authored because the registry
# offers one rather than because the teaching asks for one.
#
# Checked here as a FILE fact because the step ids make it unambiguous: no
# `m3-s*` step may sit alongside an interaction key. The parsed-structure form
# of the same rule is in the test suite.

for forbidden in 'interactionStableId' 'interactionType' 'packet_journey' \
                 'textEquivalent' 'supportLevel' 'sourceKind' \
                 'assessmentStableId' 'assetStableId' 'live_lab'; do
  if grep -qF -e "$forbidden" "$M3_BLOCK"; then
    fail "Mission 3 authored interaction or evidence machinery: $forbidden"
  fi
done

echo "PASS:  3. Mission 3 authors no interaction, assessment or lab surface"

# ------------------------------------------------------------
# 4. Mission 3 shows real output, and says it runs nothing
# ------------------------------------------------------------
grep -qF '"type": "command"' "$M3_BLOCK" \
  || fail "Mission 3 authors no command step; the learner must read real output"

grep -qF 'nothing here offers to run' "$M3_BLOCK" \
  || fail "a command step does not tell the learner the output is not executable"

# The step type carries no execution semantics and no surface offers to run it.
# Nothing in the authored payload may suggest otherwise.
for executable in '"executable"' '"runnable"' 'onRun' 'runCommand'; do
  if grep -qF -e "$executable" "$M3_BLOCK"; then
    fail "Mission 3 suggests its displayed output is executable: $executable"
  fi
done

echo "PASS:  4. Mission 3 shows displayed output and claims no execution"

# ------------------------------------------------------------
# 4b. The visible artefact stays visible, and stays unnamed
# ------------------------------------------------------------
# Mission 3's output carries more than the four numbers of an address, and that
# is APPROVED rather than an oversight. The rule is narrow:
#
#   VISIBLE UNEXPLAINED ARTEFACT   allowed, and required
#   NAME / EXPLANATION / MEANING   forbidden until Mission 4
#
# Trimming realistic output because part of it has not been taught would
# misrepresent what a machine prints, in the one mission about confirming what a
# machine actually has. Naming it would answer the question Mission 3 exists to
# leave open. So both halves are checked, and neither is sufficient alone.
#
# The naming half is enforced over parsed prose in the test suite, where an
# identifier cannot be mistaken for a sentence. What is checked here is only the
# half that is a plain file fact: the artefact is still present in the output.
grep -qE '[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}' "$M3_BLOCK" \
  || fail "Mission 3's output no longer shows the unexplained part of the line; Mission 4 returns to it"

echo "PASS: 4b. the unexplained part of the line is shown and left unexplained"

# ------------------------------------------------------------
# 5. The ledger still places IPv4 at Mission 3, and the rest later
# ------------------------------------------------------------
# The ledger is the teach-before-use audit source. Mission 3 introduces IPv4, so
# the ledger must still say so — otherwise the authored course and the audit
# source disagree about what was taught when, and the ledger silently stops
# being able to catch anything.
grep -Eq "^[0-9]+\|nf-m3-ipv4-the-second-identity\|IPv4\|" "$LEDGER" \
  || fail "the ledger no longer places 'IPv4' at Mission 3"

# And the terms Mission 3 must NOT reach for are still ordered after it.
for concept in 'prefix length' 'ARP' 'broadcast'; do
  grep -Eq "^[0-9]+\|nf-m4-the-prefix-and-the-decision\|$concept\|" "$LEDGER" \
    || fail "the ledger no longer orders '$concept' at Mission 4, after Mission 3"
done

grep -Eq "^[0-9]+\|nf-m5-the-default-gateway\|default gateway\|" "$LEDGER" \
  || fail "the ledger no longer orders 'default gateway' after Mission 3"

echo "PASS:  5. the ledger still orders IPv4 here and the rest afterwards"

# ------------------------------------------------------------
# 6. This slice changed no contract, dependency or migration
# ------------------------------------------------------------
# Mission 3 is authored content. It needed no new step type, no new interaction
# type, no schema change and no dependency — and a slice that quietly acquired
# one would be a different work package.
for manifest in package.json package-lock.json apps/web/package.json \
                packages/shared-types/package.json services/api/package.json; do
  if ! git diff --quiet HEAD -- "$manifest" 2>/dev/null; then
    fail "this slice changed a dependency manifest: $manifest"
  fi
done

if [ -d supabase/migrations ] && ! git diff --quiet HEAD -- supabase/migrations 2>/dev/null; then
  fail "this slice changed a migration; Mission 3 authors curriculum only"
fi

if ! git diff --quiet HEAD -- packages/shared-types/src/instruction-interaction.ts 2>/dev/null; then
  fail "this slice changed the interaction contract; Mission 3 uses the existing one"
fi

if ! git diff --quiet HEAD -- packages/shared-types/src/mission-steps.ts 2>/dev/null; then
  fail "this slice changed the step vocabulary; Mission 3 uses the existing one"
fi

echo "PASS:  6. no contract, dependency or migration change"

# ------------------------------------------------------------
# 7. Router-on-a-Stick and Module 1 were not disturbed
# ------------------------------------------------------------
if ! git diff --quiet HEAD -- packages/shared-types/src/roas-curriculum.ts 2>/dev/null; then
  fail "this slice modified Router-on-a-Stick"
fi

grep -Fq '"stableId": "m1-s' "$DOCUMENT" \
  || fail "Mission 1's authored steps are gone"
grep -Fq '"stableId": "m2-s' "$DOCUMENT" \
  || fail "Mission 2's authored steps are gone"

echo "PASS:  7. Router-on-a-Stick and Module 1 are intact"

# ------------------------------------------------------------
# 8. The gate is reachable the way every other gate is
# ------------------------------------------------------------
[ -f "scripts/verify-wpj-m3.sh" ] \
  || fail "this gate is not at the path the verifier namespace resolves"

grep -Fq 'verify-wpj-m3.sh' "$SELECTOR" \
  || fail "the change-relevant selector does not map anything to this gate"

echo "PASS:  8. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# 9. The Founder has something to review
# ------------------------------------------------------------
grep -Fq 'Mission 3' "$RUNBOOK" \
  || fail "the runbook does not cover Mission 3"

# A runbook that recorded its own verdict would be the implementation grading
# its own Human UAT.
for verdict in 'UAT PASSED' 'UAT PASS' 'ACCEPTED' 'APPROVED BY FOUNDER'; do
  if grep -qF -e "$verdict" "$RUNBOOK"; then
    fail "the runbook records a Founder verdict: $verdict"
  fi
done

echo "PASS:  9. the runbook is complete and records no verdict"

# ------------------------------------------------------------
# Delegated: everything about parsed structure
# ------------------------------------------------------------
echo ""
echo "--- running the Mission 3 instructional suite ---"
npm run test --workspace @tlp/api -- networking-foundations-mission3

echo ""
echo "--- running the course architecture suite ---"
npm run test --workspace @tlp/api -- networking-foundations.test

# ------------------------------------------------------------
# Advisory signals. These never fail CI.
# ------------------------------------------------------------
STEPS="$(grep -c '"stableId": "m3-s' "$M3_BLOCK" || true)"
READINGS="$(grep -c '"type": "command"' "$M3_BLOCK" || true)"
CONCEPTS="$(grep -c '"type": "concept"' "$M3_BLOCK" || true)"

echo ""
echo "--- advisory signals (never fail CI) ---"
printf 'ADVISORY: Mission 3 authored steps:          %s\n' "$STEPS"
printf 'ADVISORY: machine readings shown:            %s\n' "$READINGS"
printf 'ADVISORY: concept steps:                     %s\n' "$CONCEPTS"
echo "ADVISORY: term Mission 3 introduces:         IPv4 address"
echo "ADVISORY: these are counts, not verdicts. Whether the mission teaches,"
echo "ADVISORY: and whether it leaves the right question open, is Human UAT."

cat <<'SUMMARY'

==========================================================
WP-J MISSION 3 INSTRUCTION VERIFIED

Mission 3 is authored as production curriculum that parses
through the real parser. It reads a machine's own report
before it names the term, shows a second reading on a
different machine, reuses the connection and factory
identity Mission 2 established, and authors no interaction,
no assessment and no lab surface.

The course is fully authored (DEC-061), so this gate no
longer asserts anything about an unauthored tail. It asserts
that Mission 3 is declared authored and that every Mission 3
step sits inside Mission 3 and nowhere else.

No later mission's vocabulary reaches the learner, so the
mission still ends on the unresolved need Mission 4 exists
to meet.

This gate proves AUTHORED STRUCTURE, absence and ordering.
It does NOT prove:
  - that the instruction teaches well; that is Human UAT
  - that a beginner could follow it; that is Human UAT
  - that the unresolved ending lands as intended
  - anything about a browser rendering; none runs here
==========================================================
SUMMARY
