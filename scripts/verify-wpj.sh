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
# authored. Module 1 authoring superseded that, and the replacement was
# deliberately NOT a permissive count.
#
# The invariant has a name: STAGED AUTHORING. Instruction appears in the
# missions a slice was approved to author, and in no other mission — so a
# mission silently acquiring a step is a gate failure, which is the thing the
# original check was protecting.
#
# ## Why the anchor is gone, and the rule is not (DEC-061)
#
# Until Mission 8 this was expressed by splitting the document at the NEXT
# UNAUTHORED mission's stableId. That worked while an unauthored tail existed,
# and it moved forward exactly once per approved slice — Module 1 put it before
# Mission 3, and each slice since moved it one mission further.
#
# Mission 8 is the last approved mission. Authoring it leaves no Mission 9 to
# anchor against, and the answer is emphatically not to invent one. The anchor
# was never the invariant; it was one way of expressing it while a tail
# happened to exist. DEC-061 replaces it with the thing the rule was always
# about: an explicit declaration of which missions are approved and which are
# authored, in `scripts/lib/wpj-missions.txt`.
#
# Two legitimate states, DERIVED from that declaration rather than declared
# beside it:
#
#   STAGED           some approved mission is still unauthored. Every declared
#                    unauthored mission must carry an empty step array, and no
#                    instructional content may appear in the region of the
#                    document they occupy. This is the positional protection,
#                    unchanged — it is still a file split, because a total can
#                    be satisfied by redistribution and only a split can tell
#                    five plus three from five plus two plus one elsewhere.
#
#   FULLY_AUTHORED   every approved mission is authored. There is no unauthored
#                    region left, so the split has nothing to protect and
#                    retires ITSELF rather than being deleted. What remains
#                    enforced is that exactly the approved missions exist, in
#                    the approved order, each carrying its own instruction.
#
# FULLY_AUTHORED means STRUCTURALLY authored. It does not mean doctrine
# approved, Founder-UAT approved, publishable, migrated or certification ready,
# and this gate says so in its own output. Doctrine §23.2: passing checks is
# not completion.
source scripts/lib/wpj-mission-authority.sh
wpj_mission_authority_load

MISSION_DECLARATION="$WPJ_MISSION_DECLARATION"

# The declaration and the document must describe the same course. Without this
# the declaration could drift into a description of a course that does not
# exist, and every check built on it would still pass.
DECLARED_ORDER="$SCAN_DIR/declared-order.txt"
DOCUMENT_ORDER="$SCAN_DIR/document-order.txt"

printf '%s\n' "${WPJ_MISSION_ORDER[@]}" > "$DECLARED_ORDER"
sed -n 's/.*"stableId": "\(nf-m[0-9][^"]*\)".*/\1/p' "$DOCUMENT" > "$DOCUMENT_ORDER"

cmp -s "$DECLARED_ORDER" "$DOCUMENT_ORDER" \
  || fail "the mission authority declaration and the document disagree about which missions exist or in what order"

# Belt and braces against a ninth mission arriving with a declaration row to
# match: section 2 already pins the count at eight, and this pins the
# declaration to the same number.
[ "${#WPJ_MISSION_ORDER[@]}" = "8" ] \
  || fail "the mission declaration lists ${#WPJ_MISSION_ORDER[@]} missions; the approved architecture has 8"

# Every declared authored mission carries instruction. Asserted positively, so
# reverting an authoring fails here rather than passing quietly.
for mission in "${WPJ_AUTHORED_MISSIONS[@]}"; do
  MISSION_BLOCK="$SCAN_DIR/block-$mission.json"
  awk -v start_id="\"stableId\": \"$mission\"" '
    index($0, start_id) { collecting = 1 }
    collecting && /^      "assets": \[\]/ { print; exit }
    collecting
  ' "$DOCUMENT" > "$MISSION_BLOCK"

  [ -s "$MISSION_BLOCK" ] \
    || fail "$mission is declared authored but could not be located in the document"

  grep -q '"stableId": "m[0-9]*-s' "$MISSION_BLOCK" \
    || fail "$mission is declared authored but carries no authored step"
done

if [ "$WPJ_AUTHORING_STATE" = "STAGED" ]; then
  # The positional split, unchanged in what it proves. The anchor is now read
  # from the declaration rather than written into this file, which is the only
  # difference.
  FIRST_UNAUTHORED="${WPJ_UNAUTHORED_MISSIONS[0]}"
  ANCHOR="\"stableId\": \"$FIRST_UNAUTHORED\""

  AUTHORED_SLICE="$SCAN_DIR/authored-missions.json"
  UNAUTHORED_SLICE="$SCAN_DIR/unauthored-missions.json"

  awk -v anchor="$ANCHOR" '
    index($0, anchor) { stop = 1 }
    /"stableId": "nf-m1-what-a-network-is"/ { start = 1 }
    start && !stop
  ' "$DOCUMENT" > "$AUTHORED_SLICE"

  awk -v anchor="$ANCHOR" '
    index($0, anchor) { start = 1 }
    start
  ' "$DOCUMENT" > "$UNAUTHORED_SLICE"

  [ -s "$AUTHORED_SLICE" ] \
    || fail "the authored missions could not be located in the document; the mission ordering this gate depends on has changed"
  [ -s "$UNAUTHORED_SLICE" ] \
    || fail "$FIRST_UNAUTHORED could not be located in the document; the mission ordering this gate depends on has changed"

  # One empty step array per declared unauthored mission, and no more.
  LATER_EMPTY_STEPS="$(grep -c '"steps": \[\]' "$UNAUTHORED_SLICE" || true)"
  [ "$LATER_EMPTY_STEPS" = "${#WPJ_UNAUTHORED_MISSIONS[@]}" ] \
    || fail "$LATER_EMPTY_STEPS of ${#WPJ_UNAUTHORED_MISSIONS[@]} unauthored missions have empty steps; the declaration says they are not authored yet"

  # No unauthored mission may acquire instructional content of any kind.
  for forbidden in 'packet_journey' 'interactionType' 'interactionStableId' \
                   'assessmentStableId' 'textEquivalent' 'textAlternative' \
                   'assetType' '"type": "concept"' '"type": "command"'; do
    if grep -qF -e "$forbidden" "$UNAUTHORED_SLICE"; then
      fail "a mission the declaration calls unauthored carries instructional content: $forbidden"
    fi
  done

  echo "PASS:  3. instruction exists only in the missions the declaration authorises (STAGED)"
else
  # FULLY_AUTHORED. There is no unauthored region, so the split above would be
  # empty and proving anything about it would be theatre. What still has to
  # hold is that no mission beyond the approved set exists — a ninth mission
  # would be caught by section 2's count and by the declaration comparison
  # above, and this asserts it once more against the document text so the
  # protection is not carried by a count alone.
  if grep -qE '"stableId": "nf-m(9|[1-9][0-9])-' "$DOCUMENT"; then
    fail "the document declares a mission beyond the eight approved; DEC-061 authorises no ninth mission"
  fi

  # Every mission holds its OWN steps. This is what stops instruction migrating
  # between missions once no empty tail is left to notice a move: mission N's
  # block may contain only step ids prefixed mN-s.
  index=0
  for mission in "${WPJ_MISSION_ORDER[@]}"; do
    index=$((index + 1))
    MISSION_BLOCK="$SCAN_DIR/block-$mission.json"
    FOREIGN_STEPS="$SCAN_DIR/foreign-$mission.txt"

    grep -o '"stableId": "m[0-9]*-s' "$MISSION_BLOCK" > "$FOREIGN_STEPS" || true
    if grep -qv "\"stableId\": \"m$index-s" "$FOREIGN_STEPS"; then
      fail "$mission carries a step belonging to another mission; instruction may not migrate between missions"
    fi
  done

  echo "PASS:  3. every approved mission carries its own instruction, and no other (FULLY_AUTHORED)"
fi

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
echo "needs before every mission. Every mission the authority"
echo "declaration approves carries its own instruction, and no"
echo "step belonging to one mission sits under another; assets,"
echo "assessments and prerequisite rules remain unauthored"
echo "everywhere."
echo ""
echo "Authoring state: $WPJ_AUTHORING_STATE."
echo ""
echo "FULLY_AUTHORED means every approved mission is"
echo "STRUCTURALLY authored, and nothing more than that. It does"
echo "NOT mean the course is doctrine-approved, Founder-UAT"
echo "approved, publishable, migrated or certification ready."
echo "Curriculum Doctrine section 23.2 is explicit that passing"
echo "checks is not completion, and CURR-009 section 14a keeps"
echo "every judgement of that kind with human authority."
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
echo "    verify-wpj-m5.sh owns Mission 5 and"
echo "    verify-wpj-m6.sh owns Mission 6 and"
echo "    verify-wpj-m7.sh owns Mission 7 and"
echo "    verify-wpj-m8.sh owns Mission 8"
echo "  - that Networking Foundations is pedagogically complete;"
echo "    a structural state is not a teaching verdict"
echo "=========================================================="
