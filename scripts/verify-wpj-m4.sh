#!/usr/bin/env bash
#
# WP-J5 — Networking Foundations Mission 4, "The prefix, and the decision every
# host makes".
#
# ## What this gate owns
#
# `verify-wpj.sh` owns the COURSE and the staged-authoring rule. `verify-wpj-m1.sh`
# owns Module 1, `verify-wpj-m3.sh` owns Mission 3. This gate owns Mission 4.
#
# ## What makes Mission 4 different from every mission before it
#
# It is the largest, and it is the first whose subject matter is a DECISION
# rather than an observation. Two consequences follow, and both are why this
# gate exists rather than a copy of an earlier one.
#
# **The decision must stay authored.** Mission 4 teaches a machine comparing two
# addresses. The tempting implementation is to let the renderer compare them —
# and that would make the platform decide networking truth rather than present
# authored truth, which DEC-058 forbids and `verify-wph.sh` section 5 already
# asserts globally. Section 4 here holds the same line at the curriculum end:
# the conclusion is written into `deviceFacts`, and nothing derives it.
#
# **Two journeys, not one.** The mission's whole subject is that one machine
# behaves DIFFERENTLY for two destinations, and a single journey can only show a
# sequence. Section 3 asserts both exist and that the second never arrives,
# because a remote destination that got delivered would be teaching Mission 6 a
# mission and a half early.
#
# ## Why so much is delegated
#
# The same reason every gate in this family delegates: the questions worth
# asking are about PARSED structure, and answering them in shell means reading
# JSON with `grep` — a second curriculum parser wearing a disguise.
# `services/api/src/networking-foundations-mission4.test.ts` does that work
# through `parseCurriculumDocument`. What stays here is the file-level facts.
#
# ## What this gate cannot prove
#
# Whether Mission 4 teaches, and whether five new concepts in 65 minutes is
# survivable for a beginner. Both are Tier 3 human review, and the second is the
# specific risk the Founder should be looking for.

set -euo pipefail

DOCUMENT="content/curriculum/networking-foundations.json"
MISSION4_TESTS="services/api/src/networking-foundations-mission4.test.ts"
COURSE_TESTS="services/api/src/networking-foundations.test.ts"
COURSE_GATE="scripts/verify-wpj.sh"
RUNBOOK="docs/Engineering-OS/WP_J_MISSION_4_UAT_RUNBOOK.md"
LEDGER="scripts/lib/wpj-concept-ledger.txt"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-J MISSION 4 INSTRUCTIONAL GATE ====="
echo ""

for required in "$DOCUMENT" "$MISSION4_TESTS" "$COURSE_TESTS" "$COURSE_GATE" \
                "$RUNBOOK" "$LEDGER" "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done


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

M4_BLOCK="$SCAN_DIR/mission-4.json"

awk '
  /"stableId": "nf-m4-the-prefix-and-the-decision"/ { start = 1 }
  /"stableId": "nf-m5-the-default-gateway"/ { start = 0 }
  start
' "$DOCUMENT" > "$M4_BLOCK"

[ -s "$M4_BLOCK" ] \
  || fail "Mission 4 could not be located; the mission ordering this gate depends on has changed"

# ------------------------------------------------------------
# 1. Mission 4 is authored, under its approved identity
# ------------------------------------------------------------
grep -Fq '"title": "Mission 4 — The prefix, and the decision every host makes"' "$DOCUMENT" \
  || fail "Mission 4's approved title changed"

grep -Fq '"stableId": "m4-s' "$M4_BLOCK" \
  || fail "Mission 4 carries no authored step; this slice authors it"

echo "PASS:  1. Mission 4 is authored under its approved identity"

# ------------------------------------------------------------
# 2. The staged-authoring boundary moved forward, not away
# ------------------------------------------------------------
# The course gate owns the invariant. What is checked here is that the split
# still exists and sits SOMEWHERE AFTER Mission 4 — so every mission nobody has
# authored yet is protected by the same check that protected Mission 4 before
# this slice.
#
# ## Why this is not pinned to Mission 5
#
# It was, and it was wrong for the same reason the Mission 3 gate was wrong
# before it: pinning `M5_ANCHOR` present and `M4_ANCHOR` absent is true only
# while Mission 5 is the boundary, and becomes false the moment Mission 5 is
# legitimately authored and the boundary moves to Mission 6. A gate that fails
# because the course made approved progress teaches the next author to edit it
# out of the way rather than trust it — and this repository has now made that
# mistake twice, which is why the durable form is written out here.
#
# The rule is what it always meant: the split exists, and it no longer sits at
# Mission 4. Which mission it has reached is the course gate's business, and
# each mission's own gate asserts only its own edge.
if grep -Fq 'M4_ANCHOR=' "$COURSE_GATE"; then
  fail "the course gate anchors its staged-authoring split at Mission 4; Mission 4 is authored, so the boundary belongs after it"
fi

grep -Eq '^M[5678]_ANCHOR=' "$COURSE_GATE" \
  || fail "the course gate no longer anchors a staged-authoring split after Mission 4"

grep -Fq 'UNAUTHORED_SLICE' "$COURSE_GATE" \
  || fail "the course gate no longer splits authored from unauthored missions"

echo "PASS:  2. the staged-authoring boundary sits after Mission 4, not away"

# ------------------------------------------------------------
# 3. Two journeys, and the remote one does not arrive
# ------------------------------------------------------------
# Counted by `interactionStableId`, which appears exactly once per authored
# journey. `interactionType` would double-count: the registry key is written
# both on the step and inside its parameters, so two journeys read as four.
JOURNEYS="$(grep -c '"interactionStableId"' "$M4_BLOCK" || true)"
[ "$JOURNEYS" = "2" ] \
  || fail "Mission 4 authors $JOURNEYS packet journeys; its subject is one machine behaving differently for two destinations, which needs two"

for journey in 'nf-pj4-local-destination' 'nf-pj4-remote-destination'; do
  grep -Fq "$journey" "$M4_BLOCK" \
    || fail "Mission 4 no longer authors the journey: $journey"
done

# The remote destination exists as a device and is never arrived at. Checked in
# the suite over parsed stages; what is checked here is that the device the
# journey is addressed to is still authored, so the destination is a real place
# the learner can inspect rather than an abstraction.
grep -Fq '"nodeId": "pc-c"' "$M4_BLOCK" \
  || fail "the remote destination is no longer a device the learner can inspect"

echo "PASS:  3. two journeys are authored, and the remote destination is a real device"

# ------------------------------------------------------------
# 4. The decision is authored, never computed
# ------------------------------------------------------------
# Mission 4 is the first mission whose subject is a comparison, and the
# renderer must not perform it. The conclusion is written into the observation
# model as an authored fact; a curriculum that stopped stating it would be a
# curriculum expecting something else to work it out.
grep -Fq '"Is the destination in it"' "$M4_BLOCK" \
  || fail "Mission 4 no longer states the local/remote conclusion as an authored fact"

# Matched as IDENTIFIER shapes, never as English.
#
# This check first read `calculate` and `computed` as bare words, and failed on
# the sentence "You are not being asked to calculate anything" — which is not a
# defect but one of the most on-message lines in the mission, since the approved
# scope is explicitly conceptual rather than arithmetic. A rule that fires on
# good prose teaches the next author to reword the curriculum around the gate,
# which is precisely backwards.
#
# What the curriculum genuinely must not contain is a field or hook implying
# something will be worked out at runtime. Those are identifiers, and an
# identifier cannot be mistaken for a sentence.
for computed in '"calculate"' '"computed"' 'subnetCalculator' 'toBinary' \
                'netmaskOf' 'computeLocal' 'isSameNetwork'; do
  if grep -qF -e "$computed" "$M4_BLOCK"; then
    fail "Mission 4 names machinery implying a networking value is computed rather than authored: $computed"
  fi
done

echo "PASS:  4. the local/remote decision is authored, never computed"

# ------------------------------------------------------------
# 5. No runtime networking logic entered the application
# ------------------------------------------------------------
# The presentation may not acquire the ability to decide any of this. WP-H
# section 5 asserts the same thing globally; asserted here too because Mission 4
# is the slice where the temptation actually arrives.
# Scanned as CODE, never as prose.
#
# These files carry comments that name the very things they must not do —
# "no subnet arithmetic or address parsing", "a group is not a subnet, a VLAN, a
# broadcast domain". Those sentences are the strongest evidence the files are
# correct, and a raw scan fails on them, which would leave the next author
# deleting an accurate comment to satisfy a gate.
#
# `code_of` is the same helper `verify-wph.sh` uses, and it carries the same
# guard: a non-empty source that scans to NOTHING is a failure rather than a
# silent pass, because a stray non-text byte once made grep treat a source file
# as binary and every absence check below would have passed while reading zero
# bytes.
code_of() {
  local source="$1"
  local scanned
  scanned="$(grep -vE '^\s*(//|\*|/\*|--)' "$source" || true)"

  if [ -s "$source" ] && [ -z "$scanned" ]; then
    fail "scanning $source produced nothing, but the file is not empty — every absence check reading it would pass while examining no code"
  fi

  printf '%s\n' "$scanned"
}

for source in apps/web/src/learning/topology-layout.ts \
              apps/web/src/learning/packet-journey-presentation.ts; do
  [ -f "$source" ] || fail "missing presentation source: $source"

  SOURCE_LOGIC="$SCAN_DIR/$(basename "$source").code"
  code_of "$source" > "$SOURCE_LOGIC"

  for logic in 'prefix' 'netmask' 'subnet' 'sameNetwork' 'isLocal' 'broadcast'; do
    if grep -qiF -e "$logic" "$SOURCE_LOGIC"; then
      fail "$source acquired networking logic: $logic"
    fi
  done
done

echo "PASS:  5. the presentation computes no addressing or delivery decision"

# ------------------------------------------------------------
# 6. The ledger still orders what Mission 4 teaches
# ------------------------------------------------------------
for concept in 'prefix length' 'network portion and host portion' \
               'same network or remote network' 'ARP' 'broadcast'; do
  grep -Eq "^[0-9]+\|nf-m4-the-prefix-and-the-decision\|$concept\|" "$LEDGER" \
    || fail "the ledger no longer places '$concept' at Mission 4"
done

# And what it must still leave alone.
grep -Eq "^[0-9]+\|nf-m5-the-default-gateway\|default gateway\|" "$LEDGER" \
  || fail "the ledger no longer orders 'default gateway' after Mission 4"
grep -Eq "^[0-9]+\|nf-m6-routers-and-the-journey\|routing\|" "$LEDGER" \
  || fail "the ledger no longer orders 'routing' after Mission 4"

echo "PASS:  6. the ledger orders Mission 4's concepts here and the rest afterwards"

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
  fail "this slice changed a migration; Mission 4 authors curriculum only"
fi

for contract in packages/shared-types/src/instruction-interaction.ts \
                packages/shared-types/src/mission-steps.ts \
                packages/shared-types/src/observation-model.ts; do
  if ! git diff --quiet HEAD -- "$contract" 2>/dev/null; then
    fail "this slice changed a contract; Mission 4 uses the existing one: $contract"
  fi
done

if ! git diff --quiet HEAD -- packages/shared-types/src/roas-curriculum.ts 2>/dev/null; then
  fail "this slice modified Router-on-a-Stick"
fi

echo "PASS:  7. no contract, dependency, migration or Router-on-a-Stick change"

# ------------------------------------------------------------
# 8. Earlier missions are intact
# ------------------------------------------------------------
for earlier in 'm1-s' 'm2-s' 'm3-s'; do
  grep -Fq "\"stableId\": \"$earlier" "$DOCUMENT" \
    || fail "an earlier mission's authored steps are gone: $earlier"
done

echo "PASS:  8. Missions 1 to 3 are intact"

# ------------------------------------------------------------
# 9. The gate is reachable the way every other gate is
# ------------------------------------------------------------
[ -f "scripts/verify-wpj-m4.sh" ] \
  || fail "this gate is not at the path the verifier namespace resolves"

grep -Fq 'verify-wpj-m4.sh' "$SELECTOR" \
  || fail "the change-relevant selector does not map anything to this gate"

echo "PASS:  9. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# 10. The Founder has something to review
# ------------------------------------------------------------
grep -Fq 'Mission 4' "$RUNBOOK" \
  || fail "the runbook does not cover Mission 4"

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
echo "--- running the Mission 4 instructional suite ---"
npm run test --workspace @tlp/api -- networking-foundations-mission4

echo ""
echo "--- running the course architecture suite ---"
npm run test --workspace @tlp/api -- networking-foundations.test

# ------------------------------------------------------------
# Advisory signals. These never fail CI.
# ------------------------------------------------------------
STEPS="$(grep -c '"stableId": "m4-s' "$M4_BLOCK" || true)"
STAGES="$(grep -c '"stageId"' "$M4_BLOCK" || true)"
PREDICTIONS="$(grep -c '"prediction"' "$M4_BLOCK" || true)"
CONCEPTS="$(grep -c '"type": "concept"' "$M4_BLOCK" || true)"

echo ""
echo "--- advisory signals (never fail CI) ---"
printf 'ADVISORY: Mission 4 authored steps:          %s\n' "$STEPS"
printf 'ADVISORY: concept steps:                     %s\n' "$CONCEPTS"
printf 'ADVISORY: journeys:                          2\n'
printf 'ADVISORY: journey stages:                    %s\n' "$STAGES"
printf 'ADVISORY: learner predictions:               %s\n' "$PREDICTIONS"
echo "ADVISORY: terms Mission 4 introduces:        prefix length, network"
echo "ADVISORY:                                    portion, host portion,"
echo "ADVISORY:                                    ARP, broadcast"
echo "ADVISORY: this is the largest mission in the course. Whether five new"
echo "ADVISORY: concepts arrive as a causal chain or as a list is Human UAT,"
echo "ADVISORY: and it is the specific thing this slice should be judged on."

cat <<'SUMMARY'

==========================================================
WP-J MISSION 4 INSTRUCTION VERIFIED

Mission 4 is authored as production curriculum that parses
through the real parser. It shows one machine reaching a
destination inside its own group and then outside it, in two
separate journeys, and names the prefix length, both address
portions, ARP and broadcast only after the learner has
watched what each of them explains.

The local and remote conclusions are authored facts in the
observation model. Neither the curriculum nor the renderer
computes whether two addresses share a network.

The remote journey never arrives, Router-1 is named as the
device Mission 1 introduced and never as a role, and no
Mission 5 vocabulary reaches the learner — so the mission
still ends on the question Mission 5 exists to answer.

The staged-authoring boundary sits after Mission 4 and moves
only when a slice is approved to author the next mission, so
every mission nobody has authored yet stays prohibited.

This gate proves AUTHORED STRUCTURE, absence and ordering.
It does NOT prove:
  - that the instruction teaches well; that is Human UAT
  - that its cognitive load is survivable for a beginner,
    which is the specific risk in this mission
  - anything about a browser rendering; none runs here
==========================================================
SUMMARY
