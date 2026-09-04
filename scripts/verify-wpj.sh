#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# WP-J / J1 GATE — the Networking Foundations curriculum architecture.
#
# ## What this gate is for
#
# `services/api/src/networking-foundations.test.ts` proves BEHAVIOUR: that the
# document parses through the real parser, that competency accountability holds
# inside the course and across the learning path, and that no term is used
# before the mission that introduces it. Those are questions about parsed
# values, and TypeScript answers them far better than bash.
#
# This gate proves ABSENCE and SCOPE — that J1 authored architecture and nothing
# else, that it did not mutate Router-on-a-Stick, that it introduced no
# vocabulary the course is not allowed to teach yet, and that it added no
# migration or dependency. Those are properties of the repository rather than of
# a parsed object, and this is where they belong.
#
# ## What this gate deliberately does NOT do
#
# It encodes no pedagogical judgement. There is no prose-length rule, no reading
# score and no step-count threshold. BEGINNER-COMPLETE-1 is a human-authoritative
# requirement (CURR-009 s14a) and a gate that scored teaching would be an opinion
# pretending to be an invariant.
#
# What it can check is narrow and worth having: that a term does not appear
# before the mission that introduces it. That is objective, and the ledger at
# scripts/lib/wpj-concept-ledger.txt is what makes it answerable.
#
# ## No pipelines into grep
#
# Under `set -o pipefail`, `echo "$BIG" | grep -q` can return 141 when grep exits
# on an early match while echo is still writing — an absence check then reads a
# real hit as clean. Every check greps a FILE.
# ============================================================

DOCUMENT="content/curriculum/networking-foundations.json"
LEDGER="scripts/lib/wpj-concept-ledger.txt"
TRANSITION="scripts/lib/wpj-course-transition.txt"
TRANSITION_RECORD="docs/Engineering-OS/WP_J_CROSS_COURSE_TRANSITION.md"
SUITE="services/api/src/networking-foundations.test.ts"
ROAS="packages/shared-types/src/roas-curriculum.ts"
CONTRACT="packages/shared-types/src/curriculum-document.ts"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

# Whole-word search, portably.
#
# Neither `-w` nor `\b` can be trusted across the greps this repository runs on:
# on macOS both matched "nat" inside "destination", which would have failed this
# gate on the word "destination" appearing in a mission brief. A false positive
# on ordinary English is the fastest way to teach the next author that the gate
# is noise and should be worked around.
#
# A character-class boundary is plain POSIX ERE and behaves identically on BSD
# and GNU grep, so the rule means the same thing locally and in CI.
contains_word() {
  grep -qiE "(^|[^A-Za-z0-9])$1([^A-Za-z0-9]|\$)" "$2"
}

echo "===== WP-J CURRICULUM ARCHITECTURE GATE ====="
echo ""

for required in "$DOCUMENT" "$LEDGER" "$TRANSITION" "$TRANSITION_RECORD" \
                "$SUITE" "$ROAS" "$CONTRACT" "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

# ------------------------------------------------------------
# 1. One production curriculum document, in the one place it may live
# ------------------------------------------------------------
# WP-G's containment rules refuse a document outside content/curriculum and
# refuse a fixture wherever it sits. This asserts the repository still holds
# exactly the approved set, so an unreviewed course cannot arrive quietly.
PRODUCTION_DOCS="$(find content -name '*.json' -not -path 'content/fixtures/*' 2>/dev/null \
  | LC_ALL=C sort | tr '\n' ' ')"

[ "$PRODUCTION_DOCS" = "content/curriculum/networking-foundations.json " ] \
  || fail "unexpected production curriculum documents: ${PRODUCTION_DOCS:-none}"

grep -Fq '"documentKind": "production"' "$DOCUMENT" \
  || fail "the course is not marked as production curriculum"

grep -Fq '"stableId": "networking-foundations"' "$DOCUMENT" \
  || fail "the course identity is not networking-foundations"

grep -Fq '"stableId": "connected-learning-mvp"' "$DOCUMENT" \
  || fail "the course does not join the approved learning path"

echo "PASS:  1. one production document, correctly placed and identified"

# ------------------------------------------------------------
# 2. The approved architecture, and only it
# ------------------------------------------------------------
MODULE_COUNT="$(grep -c '"stableId": "nf-mod' "$DOCUMENT" || true)"
MISSION_COUNT="$(grep -c '"moduleStableId"' "$DOCUMENT" || true)"

[ "$MODULE_COUNT" = "4" ] \
  || fail "the course declares $MODULE_COUNT modules; the approved architecture has 4"
[ "$MISSION_COUNT" = "8" ] \
  || fail "the course declares $MISSION_COUNT missions; the approved architecture has 8"

echo "PASS:  2. four modules and eight missions, as approved"

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

# ------------------------------------------------------------
# 3. Instruction exists only where a slice authorised it
# ------------------------------------------------------------
# J1 asserted that all eight missions were instructionally empty, which was the
# correct statement while J1 was the newest slice and no mission had been
# authored. Module 1 authoring supersedes that, and the replacement is
# deliberately NOT a permissive count.
#
# The invariant now has a name: STAGED AUTHORING. Instruction appears in the
# missions a slice was approved to author, and in no other mission — so a later
# mission silently acquiring a step is still a gate failure, which is the thing
# the original check was protecting.
#
# Expressed as a file split rather than a total, because a total can be
# satisfied by redistribution: eight empty arrays becoming five plus three
# populated ones is the approved change, but five plus two plus one somewhere
# else is not, and only a positional split can tell those apart. Mission order
# in the document is fixed and is asserted by
# `services/api/src/networking-foundations.test.ts`.
#
# ## Why the boundary keeps moving
#
# The boundary is not a fixed point in the course. It is the edge of whatever
# the newest approved slice authored, and it moves exactly once per approved
# slice — never ahead of one. Module 1 put it before Mission 3; each approved
# slice since has moved it exactly one mission further, and WP-J6 authored
# Mission 5 and moves it before Mission 6 — so Missions 6 to 8 remain prohibited
# by the same check that previously prohibited Mission 5.
#
# Moving the anchor is therefore the whole of the change. The invariant, the
# forbidden-content list and the positional split are untouched, because
# loosening any of those would stop the gate protecting the missions that are
# still unauthored.
AUTHORED_SLICE="$SCAN_DIR/authored-missions.json"
UNAUTHORED_SLICE="$SCAN_DIR/unauthored-missions.json"

M6_ANCHOR='"stableId": "nf-m6-routers-and-the-journey"'

awk -v anchor="$M6_ANCHOR" '
  index($0, anchor) { stop = 1 }
  /"stableId": "nf-m1-what-a-network-is"/ { start = 1 }
  start && !stop
' "$DOCUMENT" > "$AUTHORED_SLICE"

awk -v anchor="$M6_ANCHOR" '
  index($0, anchor) { start = 1 }
  start
' "$DOCUMENT" > "$UNAUTHORED_SLICE"

[ -s "$AUTHORED_SLICE" ] \
  || fail "Missions 1 to 5 could not be located in the document; the mission ordering this gate depends on has changed"
[ -s "$UNAUTHORED_SLICE" ] \
  || fail "Missions 6 to 8 could not be located in the document; the mission ordering this gate depends on has changed"

# Missions 1 to 5 are authored. Asserted positively, so reverting the authoring
# fails here rather than passing quietly as a return to the old invariant.
AUTHORED_STEPS="$(grep -c '"stableId": "m[12345]-s' "$AUTHORED_SLICE" || true)"
[ "$AUTHORED_STEPS" -ge 5 ] \
  || fail "the authored slice carries $AUTHORED_STEPS steps; Missions 1 to 5 are authored"

# Each newest mission specifically, so that a slice cannot regress to an earlier
# module and still satisfy the count above.
grep -q '"stableId": "m3-s' "$AUTHORED_SLICE" \
  || fail "Mission 3 carries no authored step; WP-J4 authored it"
grep -q '"stableId": "m4-s' "$AUTHORED_SLICE" \
  || fail "Mission 4 carries no authored step; WP-J5 authored it"
grep -q '"stableId": "m5-s' "$AUTHORED_SLICE" \
  || fail "Mission 5 carries no authored step; WP-J6 authored it"

# Missions 6 to 8 are not. Three missions, three empty step arrays.
LATER_EMPTY_STEPS="$(grep -c '"steps": \[\]' "$UNAUTHORED_SLICE" || true)"
[ "$LATER_EMPTY_STEPS" = "3" ] \
  || fail "$LATER_EMPTY_STEPS of 3 later missions have empty steps; Missions 6 to 8 are not authored yet"

# No later mission may acquire instructional content of any kind.
for forbidden in 'packet_journey' 'interactionType' 'interactionStableId' \
                 'assessmentStableId' 'textEquivalent' 'textAlternative' \
                 'assetType' '"type": "concept"' '"type": "command"'; do
  if grep -qF -e "$forbidden" "$UNAUTHORED_SLICE"; then
    fail "a mission beyond Mission 5 authored instructional content: $forbidden"
  fi
done

# Assets stay absent everywhere: there is no curriculum asset hosting, so a
# diagram step could only name an asset served from a development host.
EMPTY_ASSETS="$(grep -c '"assets": \[\]' "$DOCUMENT" || true)"
[ "$EMPTY_ASSETS" = "8" ] \
  || fail "$EMPTY_ASSETS of 8 missions have empty assets; no slice has authored an asset"

# Assessments are not publishable as documents, so a practice step could only
# name something nothing is able to resolve.
if grep -qF 'assessmentStableId' "$DOCUMENT"; then
  fail "the document names an assessment; assessments are not publishable as documents"
fi

grep -Fq '"prerequisiteRules": []' "$DOCUMENT" \
  || fail "a prerequisite rule was authored; the cross-document rule is recorded, not authored"

echo "PASS:  3. instruction exists only in the missions a slice authorised"

# The document with its JSON escapes decoded, for prose checks.
#
# Searching the raw file is wrong for word-level rules. Authored prose stores
# paragraph breaks as the two characters `\` and `n`, so `\n\nAt the end` puts
# the letters n-A-t between a backslash and a space — a genuine whole-word match
# for "NAT" that is not the word NAT at all. This gate failed on exactly that
# before the escapes were decoded, and the finding is worth keeping in view: a
# vocabulary rule must read what the learner reads, not what the file stores.
DECODED="$SCAN_DIR/document-prose.txt"
sed 's/\\n/ /g' "$DOCUMENT" > "$DECODED"

# ------------------------------------------------------------
# 4. No deferred vocabulary reaches the learner
# ------------------------------------------------------------
# Everything in the document is learner-facing: JSON carries no comment
# mechanism, so there is nowhere for an architectural aside to hide. Router-on-a-
# Stick's vocabulary and everything deferred beyond it must therefore be absent
# outright. The transition record is where those words are allowed to appear,
# and it is a different file.
#
# Matched as WHOLE WORDS through `contains_word`. A bare substring search flags
# "destination" for containing "nat" and "transport" for containing "port",
# which would teach the next author to work around the gate rather than trust
# it. `inter-VLAN` needs no entry of its own: `VLAN` covers it.
for deferred in 'VLANs?' 'trunks?' '802\.1Q' 'subinterfaces?' 'ACLs?' 'NAT' \
                'dynamic routing' 'OSPF' 'BGP' 'DHCP' 'DNS'; do
  if contains_word "$deferred" "$DECODED"; then
    fail "deferred vocabulary appears in learner-facing curriculum: $deferred"
  fi
done

echo "PASS:  4. no deferred vocabulary in learner-facing text"

# ------------------------------------------------------------
# 5. Entry assumptions are declared, on every mission
# ------------------------------------------------------------
# BEGINNER-COMPLETE-1 permits required knowledge to be established by explicit
# declaration. "Explicit" means the learner is told, in words, before they
# begin — not that an author had it in mind.
ENTRY_ASSUMPTIONS="$(grep -c 'Before this mission you should be able to:' "$DOCUMENT" || true)"

[ "$ENTRY_ASSUMPTIONS" = "8" ] \
  || fail "$ENTRY_ASSUMPTIONS of 8 missions declare entry assumptions"

grep -Fq 'No networking vocabulary is assumed' "$DOCUMENT" \
  || fail "the course does not state that it assumes no networking vocabulary"

echo "PASS:  5. every mission declares what the learner needs first"

# ------------------------------------------------------------
# 6. Competency accountability, at the file level
# ------------------------------------------------------------
COMPETENCIES="$(grep -c '"stableId": "net\.' "$DOCUMENT" || true)"
DEVELOPS="$(grep -c '"relationship": "develops"' "$DOCUMENT" || true)"

[ "$COMPETENCIES" = "7" ] \
  || fail "the course declares $COMPETENCIES competencies; seven are expected"
[ "$DEVELOPS" = "7" ] \
  || fail "the course declares $DEVELOPS development points for 7 competencies"

# Every mission is accountable for exactly what it teaches. M3 develops the
# address-identification competency rather than nothing: reading an address off
# an interface is needed by every later course, and is demonstrable on its own.
grep -Fq '"stableId": "net.address-identification"' "$DOCUMENT" \
  || fail "the foundational address-identification competency is not declared"

# D1 and D9. Fault isolation stays with Router-on-a-Stick: reasoning about a
# stop the learner is SHOWN is a smaller capability than narrowing an unlocated
# fault across several boundary types.
if grep -qF 'net.fault-isolation' "$DOCUMENT"; then
  fail "Networking Foundations claims fault isolation; that competency stays with Router-on-a-Stick"
fi

echo "PASS:  6. seven competencies, seven development points, no fault isolation"

# ------------------------------------------------------------
# 7. Router-on-a-Stick is untouched
# ------------------------------------------------------------
# J1 records the transition and does not perform it. If these stop matching,
# either the transition happened without the record being updated, or the record
# is describing links that no longer exist — both are worse than the gap.
git diff --quiet HEAD -- "$ROAS" 2>/dev/null \
  || fail "J1 modified Router-on-a-Stick; the transition is recorded, not applied"

while IFS='|' read -r mission competency current _future; do
  case "$mission" in ''|'#'*) continue ;; esac
  grep -Fq "{ competencyStableId: \"$competency\", required: true, relationship: \"$current\" }" "$ROAS" \
    || fail "the transition record describes a link Router-on-a-Stick does not have: $mission -> $competency ($current)"
done < "$TRANSITION"

echo "PASS:  7. Router-on-a-Stick still holds its own relationships"

# ------------------------------------------------------------
# 8. The transition is recorded, in full
# ------------------------------------------------------------
for recorded in 'T1' 'T2' 'T3' 'T4' 'develops' 'reinforces' \
                'requirementType: "competency"' 'position: 1' \
                'validateRoasCurriculum'; do
  grep -Fq -e "$recorded" "$TRANSITION_RECORD" \
    || fail "the transition record does not cover: $recorded"
done

# The record must not claim the transition has happened.
grep -Fq 'recorded, not executed' "$TRANSITION_RECORD" \
  || fail "the transition record does not state that nothing has been applied"

echo "PASS:  8. the cross-course transition is recorded and not claimed as done"

# ------------------------------------------------------------
# 9. The concept ledger exists and is an audit source, not curriculum
# ------------------------------------------------------------
LEDGER_ROWS="$(grep -cE '^[0-9]+\|' "$LEDGER" || true)"
[ "$LEDGER_ROWS" -ge 20 ] \
  || fail "the concept ledger holds only $LEDGER_ROWS concepts; the course teaches more than that"

for concept in 'network purpose' 'host' 'switch' 'router' 'interface' 'port' \
               'topology' 'local delivery' 'frame' 'MAC address' 'broadcast' \
               'IPv4' 'prefix length' 'ARP' 'default gateway' 'routing' \
               'Layer 2 and Layer 3'; do
  grep -Fq -e "|$concept|" "$LEDGER" \
    || fail "the concept ledger does not order: $concept"
done

# It is tooling, not content: it must not live where curriculum lives, or the
# publisher would eventually be asked to read it.
if [ -f "content/curriculum/$(basename "$LEDGER")" ]; then
  fail "the concept ledger is inside the curriculum directory; it is an audit source, not curriculum"
fi

echo "PASS:  9. the concept ledger orders the required concepts"

# ------------------------------------------------------------
# 10. No migration, no dependency, no publication
# ------------------------------------------------------------
shasum -a 256 -c scripts/migration-baseline.sha256 --quiet \
  || fail "a migration this package was written against was modified"

MIGRATION_COUNT="$(find supabase/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
[ "$MIGRATION_COUNT" = "43" ] \
  || fail "the repository carries $MIGRATION_COUNT migrations; J1 adds none to 43"

for manifest in package.json apps/web/package.json \
                packages/shared-types/package.json services/api/package.json; do
  git diff --quiet HEAD -- "$manifest" 2>/dev/null \
    || fail "J1 changed a dependency manifest: $manifest"
done

echo "PASS: 10. no migration and no dependency change"

# ------------------------------------------------------------
# 11. The gate resolves through the verifier namespace
# ------------------------------------------------------------
[ -f scripts/verify-wpj.sh ] \
  || fail "this gate is not resolvable as scripts/verify-wpj.sh"

grep -Fq 'scripts/verify-wpj.sh' "$SELECTOR" \
  || fail "the gate is not registered in change-relevant gate selection"

grep -Fq 'content/curriculum/*|scripts/verify-wpj.sh' "$SELECTOR" \
  || fail "a curriculum change does not select this gate"

echo "PASS: 11. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# WP-J suites
# ------------------------------------------------------------
echo ""
echo "--- running the WP-J architecture suite ---"
npm run test --workspace @tlp/api -- networking-foundations

echo ""
echo "--- running the curriculum document contract suites ---"
npm run test --workspace @tlp/api -- curriculum-document curriculum-content-path

echo ""
echo "=========================================================="
echo "WP-J CURRICULUM ARCHITECTURE VERIFIED"
echo ""
echo "Networking Foundations is authored as one production"
echo "curriculum document that parses through the real parser."
echo "It declares four modules, eight missions and seven"
echo "competencies, develops each exactly once, reinforces"
echo "nothing before it is developed, and states what the learner"
echo "needs before every mission. Instruction is authored in"
echo "Missions 1 to 5 and in no other mission; assets, assessments"
echo "and prerequisite rules remain unauthored everywhere."
echo ""
echo "Router-on-a-Stick is unmodified. The cross-course"
echo "transition is recorded, and proved coherent against a"
echo "declared future state, without being applied."
echo ""
echo "This gate proves STRUCTURE, ABSENCE and pure logic."
echo "It does NOT prove:"
echo "  - that the course teaches well; that is Human UAT"
echo "  - that any curriculum has been imported or published"
echo "  - that the five pending migrations have been applied"
echo "  - anything about the authored missions' instruction beyond"
echo "    where it sits; verify-wpj-m1.sh owns Module 1,"
echo "    verify-wpj-m3.sh owns Mission 3 and"
echo "    verify-wpj-m4.sh owns Mission 4 and"
echo "    verify-wpj-m5.sh owns Mission 5"
echo "=========================================================="
