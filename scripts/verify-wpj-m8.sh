#!/usr/bin/env bash
#
# WP-J9 — Networking Foundations Mission 8, "When it does not work", and the
# staged-authoring → FULLY_AUTHORED transition it forces (DEC-061).
#
# ## What this gate owns
#
# `verify-wpj.sh` owns the COURSE and the authoring state; the per-mission gates
# own what is inside their own mission. This gate owns Mission 8 — and, because
# Mission 8 is the mission that makes the course fully authored, it also asserts
# that the transition was made properly rather than by deleting a check.
#
# ## The failure mode this gate exists to catch
#
# Mission 8 is the first authored fault in the course, and the way it goes wrong
# is that it becomes a troubleshooting course. Its own description rules that
# out: the learner "is not yet being asked to find a failure nobody has located
# for you, which is a harder skill and belongs to a later course."
#
# Two things hold that boundary, and this gate asserts both. `verify-wpj.sh`
# section 6 already refuses `net.fault-isolation` anywhere in the document —
# that competency stays with Router-on-a-Stick. Section 4 here asserts the
# instructional half: one fault, one stop, shown rather than searched for.
#
# ## The second failure mode: a repair that becomes evidence
#
# `resolvesFault` is an authored consequence and nothing else. DEC-060 and
# doctrine §23.2 are binding — instructional interaction cannot manufacture
# competency — so section 6 keeps assessment, scoring, lab and AI machinery out
# of a mission whose whole shape invites them.
#
# ## The third: an invariant retired instead of completed
#
# The tempting way to make Mission 8 pass was to delete the staged-authoring
# split, because with no unauthored tail it has nothing to protect. Section 2
# asserts the opposite happened: the declaration exists, the course gate reads
# it, both states are still implemented, and no ninth mission was invented to
# keep the old mechanism alive.
#
# ## Why so much is delegated
#
# The questions worth asking are about PARSED structure, and answering them in
# shell means reading JSON with `grep` — a second curriculum parser wearing a
# disguise. `services/api/src/networking-foundations-mission8.test.ts` does that
# work through `parseCurriculumDocument`. What stays here is the file-level
# facts and the cross-file consistency no single suite can see.
#
# ## What this gate cannot prove
#
# Whether the mission reads as the payoff of the whole course or as the start of
# a troubleshooting course; whether the repair choices feel meaningful or like
# clicking until green; whether the ending feels earned. All Tier 3.

set -euo pipefail

DOCUMENT="content/curriculum/networking-foundations.json"
MISSION8_TESTS="services/api/src/networking-foundations-mission8.test.ts"
COURSE_TESTS="services/api/src/networking-foundations.test.ts"
COURSE_GATE="scripts/verify-wpj.sh"
RUNBOOK="docs/Engineering-OS/WP_J_MISSION_8_UAT_RUNBOOK.md"
LEDGER="scripts/lib/wpj-concept-ledger.txt"
DECLARATION="scripts/lib/wpj-missions.txt"
AUTHORITY="scripts/lib/wpj-mission-authority.sh"
DECISIONS="docs/Project/DECISION_LEDGER.md"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-J MISSION 8 INSTRUCTIONAL GATE ====="
echo ""

for required in "$DOCUMENT" "$MISSION8_TESTS" "$COURSE_TESTS" "$COURSE_GATE" \
                "$RUNBOOK" "$LEDGER" "$DECLARATION" "$AUTHORITY" \
                "$DECISIONS" "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

# Blocks are written to FILES, never piped. `printf '%s' "$BLOCK" | grep -q …`
# is a pipefail race: `grep -q` exits on first match, `printf` dies of SIGPIPE
# with status 141, and the pipeline reports 141 despite matching.
SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

M8_BLOCK="$SCAN_DIR/mission-8.json"

awk '
  /"stableId": "nf-m8-when-it-does-not-work"/ { start = 1 }
  start
' "$DOCUMENT" > "$M8_BLOCK"

[ -s "$M8_BLOCK" ] \
  || fail "Mission 8 could not be located; the mission ordering this gate depends on has changed"

# ------------------------------------------------------------
# 1. Mission 8 is authored, and is the mission it says it is
# ------------------------------------------------------------
grep -Fq '"stableId": "nf-m8-when-it-does-not-work"' "$DOCUMENT" \
  || fail "Mission 8 is not in the document under its approved stable id"

grep -Fq '"title": "Mission 8 — When it does not work"' "$DOCUMENT" \
  || fail "Mission 8's approved title changed"

grep -Fq '"stableId": "m8-s' "$M8_BLOCK" \
  || fail "Mission 8 carries no authored step; this slice authors it"

echo "PASS:  1. Mission 8 is authored under its approved identity"

# ------------------------------------------------------------
# 2. The invariant was completed, not retired (DEC-061)
# ------------------------------------------------------------
source scripts/lib/wpj-mission-authority.sh
wpj_mission_authority_load

wpj_require_authored 'nf-m8-when-it-does-not-work' 'verify-wpj-m8.sh'

[ "$WPJ_AUTHORING_STATE" = "FULLY_AUTHORED" ] \
  || fail "the declaration reports $WPJ_AUTHORING_STATE; Mission 8 is the last approved mission, so authoring it makes the course fully authored"

# The course gate must READ the declaration rather than restating it. A gate
# that hard-coded the same list would be the drift the declaration replaced.
grep -Fq 'wpj_mission_authority_load' "$COURSE_GATE" \
  || fail "the course gate no longer reads the mission authority declaration"

# Both states must still be implemented. Deleting the STAGED branch would make
# the invariant unavailable to the next course that needs staged authoring, and
# would turn a completed rule back into a retired one.
# Matching the BRANCH, not the word. An earlier form grepped for the bare
# string `STAGED`, and mutation testing showed it passing on a course gate
# whose staged branch had been turned into `if false; then` — because the word
# still appeared in the comments explaining the branch. A guard that matches
# the prose describing a check is not checking anything.
grep -Fq 'if [ "$WPJ_AUTHORING_STATE" = "STAGED" ]; then' "$COURSE_GATE" \
  || fail "the course gate no longer branches on the STAGED authoring state; the invariant must be completed, not retired"

grep -Eq '"PASS: +3\..*STAGED' "$COURSE_GATE" \
  || fail "the course gate no longer reports a result for the STAGED authoring state"
grep -Eq '"PASS: +3\..*FULLY_AUTHORED' "$COURSE_GATE" \
  || fail "the course gate no longer reports a result for the FULLY_AUTHORED authoring state"
grep -Fq 'UNAUTHORED_SLICE' "$COURSE_GATE" \
  || fail "the course gate no longer splits authored from unauthored missions in STAGED mode"

# No anchor variable may survive. Leaving one would mean two mechanisms claiming
# the same authority, and the older one silently winning on the next slice.
if grep -Eq '^M[0-9]+_ANCHOR=' "$COURSE_GATE"; then
  fail "the course gate still declares a positional mission anchor; DEC-061 replaced it with the declaration"
fi

# And no gate may still assert that a LATER anchor exists. That assertion is
# the thing Mission 8 makes permanently unsatisfiable.
for gate in scripts/verify-wpj-m3.sh scripts/verify-wpj-m4.sh \
            scripts/verify-wpj-m5.sh scripts/verify-wpj-m6.sh \
            scripts/verify-wpj-m7.sh; do
  if grep -Eq '\^M\[[0-9]+\]_ANCHOR=|\^M[0-9]+_ANCHOR=' "$gate"; then
    fail "$gate still asserts a later mission anchor exists; no mission follows Mission 8"
  fi

  # Anchored to line start, and matching the CALL rather than the string.
  #
  # An earlier form grepped for the bare word `wpj_mission_authority_load`
  # anywhere in the file, and mutation testing showed it passing on a gate
  # whose call had been deleted — because each gate also QUOTES that name
  # inside its own assertion about the course gate. A guard that matches the
  # text of a check instead of the check itself is not a guard.
  grep -Eq '^wpj_mission_authority_load$' "$gate" \
    || fail "$gate does not load the mission authority declaration"

  grep -Eq '^wpj_require_authored ' "$gate" \
    || fail "$gate no longer asserts its own mission is declared authored; the transition must not weaken a prior gate"
done

# No ninth mission, by any route.
if grep -Eq '"stableId": "nf-m(9|[1-9][0-9])-' "$DOCUMENT"; then
  fail "the document declares a mission beyond the eight approved; DEC-061 authorises no ninth mission"
fi
if grep -Eq '^[0-9]+\|nf-m(9|[1-9][0-9])-' "$DECLARATION"; then
  fail "the declaration lists a mission beyond the eight approved"
fi

DECLARED_ROWS="$(grep -c '^[0-9]' "$DECLARATION" || true)"
[ "$DECLARED_ROWS" = "8" ] \
  || fail "the declaration lists $DECLARED_ROWS missions; the approved architecture has 8"

echo "PASS:  2. the authoring invariant is completed, not retired, and no ninth mission exists"

# ------------------------------------------------------------
# 3. One journey, beginning faulted and ending confirmed
# ------------------------------------------------------------
# Architect decision 5: ONE journey rather than a broken one and a repaired one,
# because the repair and the continuation are a single causal sequence — the
# learner has to watch the thing that stopped go on to work.
JOURNEY_COUNT="$(grep -c '"interactionStableId"' "$M8_BLOCK" || true)"
[ "$JOURNEY_COUNT" = "1" ] \
  || fail "Mission 8 authors $JOURNEY_COUNT journeys; the approved design is exactly one"

grep -Fq '"interactionStableId": "nf-pj8-the-stop-and-the-repair"' "$M8_BLOCK" \
  || fail "Mission 8's journey does not carry its approved interaction identity"

grep -Fq '"sourceKind": "authored_teaching"' "$M8_BLOCK" \
  || fail "Mission 8's journey is not declared authored teaching"

grep -Fq '"textEquivalent"' "$M8_BLOCK" \
  || fail "Mission 8's journey carries no text equivalent; the accessible path must be able to convey the same reasoning"

# The whole shape, asserted as authored keys. Each of these is a half of the
# approved sequence, and a missing one silently changes what the mission is.
for required_key in '"fault"' '"stopsAtStageId"' '"symptom"' '"explanation"' \
                    '"actions"' '"resolvesFault"' '"observation"' \
                    '"confirmation"' '"outcome": "stops"'; do
  grep -qF -e "$required_key" "$M8_BLOCK" \
    || fail "Mission 8's journey is missing an authored half of the fault-to-confirmation sequence: $required_key"
done

# Exactly one stopping stage. A second would be a second fault in all but name.
STOPS="$(grep -c '"outcome": "stops"' "$M8_BLOCK" || true)"
[ "$STOPS" = "1" ] \
  || fail "Mission 8 authors $STOPS stopping stages; the approved design is one bounded fault"

# Exactly one resolving action.
RESOLVING="$(grep -c '"resolvesFault": true' "$M8_BLOCK" || true)"
[ "$RESOLVING" = "1" ] \
  || fail "Mission 8 authors $RESOLVING resolving actions; exactly one change may repair the fault"

# And at least one that does not, so the choice is a choice.
NON_RESOLVING="$(grep -c '"resolvesFault": false' "$M8_BLOCK" || true)"
[ "$NON_RESOLVING" -ge 1 ] \
  || fail "Mission 8 offers no alternative to the correct change; a single option is not a decision"

echo "PASS:  3. one journey, one bounded fault, one repair, and an authored confirmation"

# ------------------------------------------------------------
# 4. The fault is shown, bounded, and is Mission 5's rule broken
# ------------------------------------------------------------
grep -Fq '"atNodeId": "pc-a"' "$M8_BLOCK" \
  || fail "Mission 8's fault is not placed on PC-A"

# The approved value, and the approved correction. Both are pinned because the
# whole reuse of Mission 5 depends on them.
grep -Fq '192.168.2.1' "$M8_BLOCK" \
  || fail "Mission 8 does not configure the approved wrong gateway 192.168.2.1"
grep -Fq '192.168.1.1' "$M8_BLOCK" \
  || fail "Mission 8 does not offer the correct gateway 192.168.1.1"
grep -Fq '192.168.2.20' "$M8_BLOCK" \
  || fail "Mission 8 does not reach for the destination the course has been reaching for"

# The rule, applied rather than asserted. Without this the mission is telling
# the learner the value is wrong instead of showing them why.
#
# Anchored to the RULE, not to one phrasing of it. This used to grep for the
# words "own group"; Founder UAT wave 8 replaced the course's informal "group"
# with "network" in Mission 8's journey, and a gate that fails on the repair it
# asked for is testing the sentence rather than the invariant.
grep -Fq 'deliver directly' "$M8_BLOCK" \
  || fail "Mission 8 does not explain the stop with the direct-delivery rule"
grep -Eq 'own (network|group)' "$M8_BLOCK" \
  || fail "Mission 8 does not tie the stop to the host's own network"
grep -Fq 'gateway' "$M8_BLOCK" \
  || fail "Mission 8 does not name the gateway the rule is being applied to"
grep -Fq 'gateway in order to reach' "$M8_BLOCK" \
  || fail "Mission 8 does not state the circularity that makes the setting impossible"

# ## Post-repair state honesty
#
# The configured gateway is the thing the learner CHANGES, so it must not sit
# in PC-A's static interface attributes — the inspector renders those as the
# device's fixed details, and they would go on reporting 192.168.2.1 after the
# repair while the journey behaved as though the repair had happened. In the
# one mission whose argument is that a repair must be confirmed, a surface
# quietly saying the repair did not take is the worst possible defect.
#
# It lives in stage deviceFacts instead, which are scoped to the stage the
# learner is on. Asserted here as a file fact; the suite asserts the parsed
# form, including that no stage after the stop reports the faulted value.
PCA_ATTRIBUTES="$SCAN_DIR/pc-a-attributes.json"
awk '
  /"nodeId": "pc-a"/ { collecting = 1 }
  collecting && /"nodeId": "pc-b"/ { exit }
  collecting
' "$M8_BLOCK" > "$PCA_ATTRIBUTES"

[ -s "$PCA_ATTRIBUTES" ] \
  || fail "PC-A could not be located in Mission 8's journey"

if grep -qF '"value": "192.168.2.1"' "$PCA_ATTRIBUTES"; then
  fail "PC-A's fixed details carry the configured gateway; a setting the learner repairs must be reported per stage, or it will still read 192.168.2.1 after the repair"
fi

# The correct value must not be hiding there either — a static "192.168.1.1"
# would be visible before the learner had done anything.
if grep -qF '"value": "192.168.1.1"' "$PCA_ATTRIBUTES"; then
  fail "PC-A's fixed details carry a gateway value; the configured gateway is stage state, not a fixture"
fi

# The learner is SHOWN the stop. Nothing may ask them to find it.
for forbidden in 'find the fault' 'find the problem' 'locate the fault' \
                 'search for' 'hunt for' 'fault isolation' 'root cause' \
                 'methodology' 'divide and conquer'; do
  if grep -qiF -e "$forbidden" "$M8_BLOCK"; then
    fail "Mission 8 asks the learner to locate or methodise a failure: $forbidden"
  fi
done

# The bounded-failure boundary, stated to the learner rather than only observed
# by this gate.
grep -Fq 'later course' "$M8_BLOCK" \
  || fail "Mission 8 does not tell the learner that finding an unlocated failure belongs to a later course"

echo "PASS:  4. the fault is PC-A's wrong gateway, shown rather than searched for"

# ------------------------------------------------------------
# 5. Mission 7 is required, and is not re-taught
# ------------------------------------------------------------
grep -Fq '100% packet loss' "$M8_BLOCK" \
  || fail "Mission 8 shows no failed result; Mission 7's skill would then not be required"

grep -Fq 'displayed output' "$M8_BLOCK" \
  || fail "Mission 8's command step does not carry the honest presentation convention"

grep -Fq 'Before you read on' "$M8_BLOCK" \
  || fail "Mission 8 does not ask the learner to commit before the reasoning arrives"

# Reused, not re-taught. Mission 7 owns ping and ICMP; Mission 8 uses a result.
for forbidden in 'ICMP' 'echo request' 'echo reply' 'checksum' 'time to live' \
                 'hop limit'; do
  if grep -qiF -e "$forbidden" "$M8_BLOCK"; then
    fail "Mission 8 re-teaches protocol detail Mission 7 deliberately bounded: $forbidden"
  fi
done

# The reasoning the learner must actually apply, checked as REASONING.
#
# This loop used to require the strings "Mission 4", "Mission 5", "Mission 6"
# and "Mission 7" to appear in Mission 8. Founder UAT wave 8 ruled that a
# learner returning after weeks cannot be sent to a numbered mission to
# understand the sentence in front of them, and the journey's citations were
# removed. A gate that fails on the repair it asked for is checking the
# footnote instead of the integration.
#
# So each line below pins the thing that mission contributed, in the form
# Mission 8 has to put in front of the learner for the integration to be real.
grep -Fq '192.168.1.10/24' "$M8_BLOCK" \
  || fail "Mission 8 does not restate PC-A's address and prefix; the comparison cannot be made"
grep -Fq 'octets name the network' "$M8_BLOCK" \
  || fail "Mission 8 does not restate how the prefix decides the network"
grep -Fq 'default gateway' "$M8_BLOCK" \
  || fail "Mission 8 does not use the default gateway, which is the fault's subject"
grep -Fq 'Router-1' "$M8_BLOCK" \
  || fail "Mission 8 does not carry the routed journey the repair restores"
grep -Fq 'ping' "$M8_BLOCK" \
  || fail "Mission 8 does not open on the test whose result the learner must read"

echo "PASS:  5. Mission 8 requires Mission 7's reasoning without re-teaching it"

# ------------------------------------------------------------
# 6. No evidence, no scoring, no certification, no AI, no lab
# ------------------------------------------------------------
for forbidden in 'assessmentStableId' 'assetStableId' 'live_lab' \
                 '"relationship": "develops"' 'competencyEvidence' \
                 'mastery' 'graded' 'certification' 'CompTIA' 'Security+'; do
  if grep -qF -e "$forbidden" "$M8_BLOCK"; then
    fail "Mission 8 authored evidence, scoring or certification machinery: $forbidden"
  fi
done

# The course-level protection this mission is most likely to breach.
if grep -qF 'net.fault-isolation' "$DOCUMENT"; then
  fail "Networking Foundations claims fault isolation; that competency stays with Router-on-a-Stick"
fi

DEVELOPS="$(grep -c '"relationship": "develops"' "$DOCUMENT" || true)"
[ "$DEVELOPS" = "7" ] \
  || fail "the course declares $DEVELOPS development points; Mission 8 develops nothing and the total must stay 7"

echo "PASS:  6. Mission 8 develops nothing and produces no evidence"

# ------------------------------------------------------------
# 7. The ledger gives Mission 8 exactly three concepts
# ------------------------------------------------------------
for concept in 'simple failure reasoning' 'bounded repair' \
               'confirmation after repair'; do
  grep -Eq "^[0-9]+\|nf-m8-when-it-does-not-work\|$concept\|" "$LEDGER" \
    || fail "the ledger no longer gives Mission 8 the concept '$concept'"
done

M8_LEDGER_ROWS="$(grep -c '|nf-m8-when-it-does-not-work|' "$LEDGER" || true)"
[ "$M8_LEDGER_ROWS" = "3" ] \
  || fail "the ledger gives Mission 8 $M8_LEDGER_ROWS concepts; exactly three are authorized and there is no later mission to defer a fourth to"

echo "PASS:  7. the ledger gives Mission 8 exactly its three authorized concepts"

# ------------------------------------------------------------
# 8. No contract, dependency, migration or presentation change
# ------------------------------------------------------------
# Mission 8 is authored content. It is the first mission to USE the fault and
# remediation machinery WP-H built, and using it is not changing it — so the
# contract files are asserted unchanged rather than merely present.
source scripts/lib/authorized-dependency.sh
authorized_dependency_check "the Mission 8 slice"

if [ -d supabase/migrations ] && ! git diff --quiet HEAD -- supabase/migrations 2>/dev/null; then
  fail "this slice changed a migration; Mission 8 authors curriculum only"
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
# that Mission 8 USES the contract rather than bending it — and specifically
# that a prediction never acquires an answer key, which `verify-wph.sh` asserts
# directly on the prediction type. The remaining contracts stay pinned below.
# Rebased in the Mission 8 refinement, and INVERTED for this mission alone.
#
# Every other mission's predictions are exploratory: the learner cannot yet
# reason the answer out, so the observation IS the answer and their gate forbids
# a correct option. Mission 8 is the mission where the learner already has the
# model, and the Founder ruled that they must be told plainly whether it
# predicted correctly rather than inferring it from the narration.
#
# What has not moved, and is asserted here: the field is OPTIONAL, so the
# exploratory predictions elsewhere stay ungradeable; correctness produces no
# score and no evidence; and it is withheld at the levels that test rather than
# teach, since with no per-answer round trip the shipped option IS the answer.
grep -Fq 'const PREDICTION_KEYS = ["prompt", "options"] as const;' packages/shared-types/src/instruction-interaction.ts \
  || fail "correctOption became REQUIRED on a prediction; the rest of the course relies on predictions staying ungradeable"
grep -Fq '"correctOption",' packages/shared-types/src/instruction-interaction.ts \
  || fail "the prediction key set no longer admits an optional correctness field"
grep -Fq 'prediction: withhold' packages/shared-types/src/mission-instruction.ts \
  || fail "a prediction's correct option is shipped at protected support levels"

# That Mission 8 DOES author one is asserted in
# `networking-foundations-mission8.test.ts`, which parses the document — a grep
# here cannot tell a prediction's correct option from a knowledge check's.

# `observation-model.ts` is excluded for the same reason
# `instruction-interaction.ts` is (DEC-064 note above): the Founder UAT repair
# adds an authored `action` to a stage so the pane can head with what a device
# is DOING rather than only where the learner is. What must not change is that
# the model reports authored observations rather than computing them, and
# `verify-wpj-m1.sh` section 7 asserts that over every presentation source.
grep -Fq 'networking truth entered the presentation layer' scripts/verify-wpj-m1.sh \
  || fail "the renderer-computes-nothing guard is gone"

# `mission-steps.ts` and `curriculum-document.ts` left this list for the same
# reason `instruction-interaction.ts` did above: both were pinned to
# `git diff --quiet HEAD` on the reasoning that a curriculum slice has no
# business editing the step contract, which is right for a curriculum slice and
# wrong as a permanent rule. WP-NF-NT1 adds `near_transfer` to the vocabulary
# and its key list to the parser, under a DEC-054 amendment, and a guard that
# fails on authorised work is a guard that gets deleted rather than fixed.
#
# The invariant underneath was that Mission 8 USES the vocabulary rather than
# inventing one for itself. So: the vocabulary stays closed, the parser still
# rejects a key it does not list, and Mission 8 authors only approved types.
grep -Fq 'The set is closed.' packages/shared-types/src/mission-steps.ts \
  || fail "the step vocabulary is no longer declared closed; Mission 8 relies on authoring within a fixed set"

grep -Fq 'the vocabulary is closed at ${MISSION_STEP_TYPES.join(", ")}' packages/shared-types/src/mission-steps.ts \
  || fail "an unapproved step type no longer fails validation; the closed vocabulary would be advisory"

grep -Fq 'STEP_CONTENT_KEYS' packages/shared-types/src/curriculum-document.ts \
  || fail "the parser no longer holds a per-type key list, so an unknown authored field would pass unchecked"

# Read from Mission 8's own block, so a type introduced anywhere else in the
# course cannot satisfy this and a type introduced HERE cannot hide.
while IFS= read -r authored; do
  case "$authored" in
    concept|diagram|command|prediction|interaction|practice|near_transfer|reference) ;;
    *) fail "Mission 8 authors the step type \"$authored\", which is not in the closed vocabulary" ;;
  esac
done < <(grep -o '"type": "[a-z_]*"' "$M8_BLOCK" | sed 's/.*: "//; s/"//')

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
# "no networking truth lives in the renderer" — Mission 8 may DESCRIBE what a
# network does and nothing in `apps/web` may COMPUTE it. That is asserted over
# every presentation source, test files excluded, in `verify-wpj-m1.sh`
# section 7, and it survives a presentation change because it reads what the
# code DOES rather than whether it moved.
#
# So this asserts the guard still exists and still covers these files, which is
# the part Mission 8's gate can meaningfully own.
grep -Fq 'networking truth entered the presentation layer' scripts/verify-wpj-m1.sh \
  || fail "the renderer-computes-nothing guard is gone; Mission 8's journey depends on the presentation staying presentation"

for computed in routingTable computeRoute nextHop calculateSubnet forwardingTable; do
  if grep -qF -e "$computed" apps/web/src/learning/topology-layout.ts \
       apps/web/src/learning/packet-journey-presentation.ts; then
    fail "networking truth entered the journey presentation: $computed"
  fi
done

echo "PASS:  8. no contract, dependency, migration or presentation change"

# ------------------------------------------------------------
# 9. Missions 1 to 7 are intact
# ------------------------------------------------------------
for earlier in 'nf-m1-what-a-network-is' 'nf-m2-inside-one-network' \
               'nf-m3-ipv4-the-second-identity' \
               'nf-m4-the-prefix-and-the-decision' \
               'nf-m5-the-default-gateway' \
               'nf-m6-routers-and-the-journey' \
               'nf-m7-testing-whether-it-works'; do
  grep -qF -e "\"stableId\": \"$earlier\"" "$DOCUMENT" \
    || fail "$earlier is no longer in the document"
done

# Mission 5 must still reason about 192.168.2.1 as an INVALID gateway rather
# than have been quietly rewritten to point forward at Mission 8.
grep -Fq 'Could PC-A' "$DOCUMENT" \
  || fail "Mission 5's reasoning about the invalid gateway is no longer in the document"

echo "PASS:  9. Missions 1 to 7 are intact"

# ------------------------------------------------------------
# 10. The decision record exists and says what was decided
# ------------------------------------------------------------
grep -Fq '## DEC-061' "$DECISIONS" \
  || fail "DEC-061 is not recorded; the final-boundary architecture decision must be written down"

for recorded in 'STAGED' 'FULLY_AUTHORED' 'wpj-missions.txt'; do
  grep -qF -e "$recorded" "$DECISIONS" \
    || fail "DEC-061 does not record '$recorded'"
done

echo "PASS: 10. DEC-061 records the final-boundary decision"

# ------------------------------------------------------------
# 11. The gate resolves through the namespace and is selected
# ------------------------------------------------------------
[ -f "scripts/verify-wpj-m8.sh" ] \
  || fail "this gate is not where the verifier namespace expects it"

grep -Fq 'scripts/verify-wpj-m8.sh' "$SELECTOR" \
  || fail "the change-relevant gate selector does not map anything to this gate"

echo "PASS: 11. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# 12. The runbook is complete and records no verdict
# ------------------------------------------------------------
grep -Fq 'NOT YET REVIEWED' "$RUNBOOK" \
  || fail "the Mission 8 runbook does not record that it is unreviewed"

for question in 'reason from evidence' 'narrow' 'confirmation' 'payoff' \
                'earned' 'demonstrated'; do
  grep -qiF -e "$question" "$RUNBOOK" \
    || fail "the Mission 8 runbook does not ask about: $question"
done

for verdict in 'PASSED' 'APPROVED' 'ACCEPTED'; do
  if grep -qF -e "$verdict" "$RUNBOOK"; then
    fail "the Mission 8 runbook records a verdict; Human UAT is the Founder's and this gate must not pre-empt it"
  fi
done

echo "PASS: 12. the runbook is complete and records no verdict"

# ------------------------------------------------------------
# The suites
# ------------------------------------------------------------
echo ""
echo "--- running the Mission 8 instructional suite ---"
npm run test --workspace @tlp/api -- networking-foundations-mission8

echo ""
echo "--- running the course architecture suite ---"
npm run test --workspace @tlp/api -- networking-foundations.test

# ------------------------------------------------------------
# Advisory signals — never fail CI
# ------------------------------------------------------------
M8_STEPS="$(grep -c '"stableId": "m8-s' "$M8_BLOCK" || true)"
M8_CONCEPTS="$(grep -c '"type": "concept"' "$M8_BLOCK" || true)"
M8_ACTIONS="$(grep -c '"actionId"' "$M8_BLOCK" || true)"
M8_STAGES="$(grep -c '"stageId"' "$M8_BLOCK" || true)"

echo ""
echo "--- advisory signals (never fail CI) ---"
echo "ADVISORY: Mission 8 authored steps:          $M8_STEPS"
echo "ADVISORY: concept steps:                     $M8_CONCEPTS"
echo "ADVISORY: journey stages:                    $M8_STAGES"
echo "ADVISORY: stopping stages:                   $STOPS"
echo "ADVISORY: repair choices offered:            $M8_ACTIONS"
echo "ADVISORY: of which resolve the fault:        $RESOLVING"
echo "ADVISORY: authoring state:                   $WPJ_AUTHORING_STATE"
echo "ADVISORY: this is the only fault in the course and the last mission."
echo "ADVISORY: whether it reads as the payoff of Networking Foundations or"
echo "ADVISORY: as the opening of a troubleshooting course is Human UAT, and"
echo "ADVISORY: so is whether the repair choices feel like reasoning rather"
echo "ADVISORY: than clicking. Neither can be counted."

echo ""
echo "=========================================================="
echo "WP-J MISSION 8 INSTRUCTION VERIFIED"
echo ""
echo "Mission 8 is authored as production curriculum that parses"
echo "through the real parser. It opens on a failed result, shows"
echo "one bounded fault at PC-A, stops before anything leaves the"
echo "machine, offers an enumerated repair only once the learner"
echo "has met the failure, and then carries the restored exchange"
echo "to PC-C and back to an authored confirmation."
echo ""
echo "The fault is the wrong default gateway Mission 5 reasoned"
echo "about and deliberately did not spend. It is explained with"
echo "Mission 5's own rule rather than by assertion, and the"
echo "stopping point is SHOWN — nothing asks the learner to find"
echo "a failure nobody has located, which stays with a later"
echo "course along with fault isolation."
echo ""
echo "Mission 8 develops no competency, authors no assessment, no"
echo "lab and no AI, and its repair produces no evidence of any"
echo "kind. The learner's choice is thinking, never a score."
echo ""
echo "Authoring the last approved mission makes the course"
echo "FULLY_AUTHORED. The staged-authoring invariant was"
echo "COMPLETED rather than retired: both states remain"
echo "implemented, the declaration is the single authority, no"
echo "positional anchor survives, and no ninth mission exists."
echo ""
echo "This gate proves AUTHORED STRUCTURE, absence and ordering."
echo "It does NOT prove:"
echo "  - that the instruction teaches well; that is Human UAT"
echo "  - that the mission reads as payoff rather than as the"
echo "    start of a troubleshooting course"
echo "  - that the repair choices feel like reasoning"
echo "  - that Networking Foundations is pedagogically complete,"
echo "    doctrine-approved, publishable or certification ready"
echo "  - anything about a browser rendering; none runs here"
echo "=========================================================="
