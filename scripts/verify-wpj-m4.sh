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
# 2. This mission is declared authored, and owns its own instruction
# ------------------------------------------------------------
# This section used to assert that the course gate's staged-authoring anchor
# had moved past Mission 4 and that some LATER anchor still existed. That was
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
# Mission 4 as authored, and Mission 4's steps appear under Mission 4
# and nowhere else. Both are true in either authoring state, and neither goes
# stale when a later slice lands. Whether the course as a whole is STAGED or
# FULLY_AUTHORED is the course gate's business, and it is the only place that
# decides it.
source scripts/lib/wpj-mission-authority.sh
wpj_mission_authority_load

wpj_require_authored 'nf-m4-the-prefix-and-the-decision' 'verify-wpj-m4.sh'

grep -Fq 'wpj_mission_authority_load' "$COURSE_GATE" \
  || fail "the course gate no longer reads the mission authority declaration; nothing would then constrain which missions may carry instruction"

MISSION_STEP_OWNERSHIP="$SCAN_DIR/m4-step-ownership.txt"
grep -o '"stableId": "m[0-9]*-s[^"]*"' "$DOCUMENT" > "$MISSION_STEP_OWNERSHIP" || true

M4_OWN_STEPS="$(grep -c '"stableId": "m4-s' "$MISSION_STEP_OWNERSHIP" || true)"
M4_BLOCK_STEPS="$(grep -c '"stableId": "m4-s' "$M4_BLOCK" || true)"

[ "$M4_OWN_STEPS" = "$M4_BLOCK_STEPS" ] \
  || fail "$M4_OWN_STEPS Mission 4 steps exist in the document but only $M4_BLOCK_STEPS sit inside Mission 4; instruction may not migrate between missions"

echo "PASS:  2. Mission 4 is declared authored and owns its own instruction"

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
#
# The line filter it used to be — drop any line starting with `//`, `*`, `/*`
# or `--` — assumed every block comment puts an asterisk on its continuation
# lines. This repository's explanatory blocks mostly do not, so the BODY of a
# `/* ... */` reached the scan while its opening line did not.
#
# That is not theoretical. The Founder UAT repair added a comment recording
# that the confirmation "used to be prefixed \"Fixed.\"" — an accurate note
# about a string that was REMOVED — and the filter passed the word `prefix`
# straight through to a rule about subnet arithmetic. The only ways to pass
# were to delete a true comment or to weaken the rule, which is exactly the
# outcome the paragraph above says this helper exists to prevent.
#
# So it is a real comment stripper now: a state machine that removes `/* … */`
# across lines and `// …` to end of line, and leaves code.
code_of() {
  local source="$1"
  local scanned

  scanned="$(awk '
    {
      line = $0
      out = ""
      while (length(line) > 0) {
        if (inblock) {
          end = index(line, "*/")
          if (end == 0) { line = ""; break }
          line = substr(line, end + 2)
          inblock = 0
          continue
        }
        start = index(line, "/*")
        eol = index(line, "//")
        if (eol > 0 && (start == 0 || eol < start)) {
          out = out substr(line, 1, eol - 1)
          line = ""
          break
        }
        if (start == 0) { out = out line; line = ""; break }
        out = out substr(line, 1, start - 1)
        line = substr(line, start + 2)
        inblock = 1
      }
      if (length(out) > 0) print out
    }
  ' "$source" || true)"

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
source scripts/lib/authorized-dependency.sh
authorized_dependency_check "the Mission 4 slice"

if [ -d supabase/migrations ] && ! git diff --quiet HEAD -- supabase/migrations 2>/dev/null; then
  fail "this slice changed a migration; Mission 4 authors curriculum only"
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
# that Mission 4 USES the contract rather than bending it — and specifically
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
# asserts what its own mission actually relies on. Mission 4 authors
# exploratory predictions — the learner cannot yet reason the answer out, the
# observation IS the answer, and marking the guess would punish them for doing
# what was asked. None of its predictions may carry a correct option.
grep -Fq 'const PREDICTION_KEYS = ["prompt", "options"] as const;' packages/shared-types/src/instruction-interaction.ts \
  || fail "correctOption became REQUIRED on a prediction; Mission 4 relies on a prediction staying ungradeable"

# The per-mission half of this — that Mission 4 authors no GRADED prediction —
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
# The invariant underneath was that Mission 4 USES the vocabulary rather than
# inventing one for itself. So: the vocabulary stays closed, and Mission 4
# authors only types inside it.
grep -Fq 'The set is closed.' packages/shared-types/src/mission-steps.ts \
  || fail "the step vocabulary is no longer declared closed; Mission 4 relies on authoring within a fixed set"

grep -Fq 'the vocabulary is closed at ${MISSION_STEP_TYPES.join(", ")}' packages/shared-types/src/mission-steps.ts \
  || fail "an unapproved step type no longer fails validation; the closed vocabulary would be advisory"

# Read from Mission 4's own block, so a type introduced anywhere else in the
# course cannot satisfy this and a type introduced HERE cannot hide.
while IFS= read -r authored; do
  case "$authored" in
    concept|diagram|command|prediction|interaction|practice|near_transfer|reference) ;;
    *) fail "Mission 4 authors the step type \"$authored\", which is not in the closed vocabulary" ;;
  esac
done < <(grep -o '"type": "[a-z_]*"' "$M4_BLOCK" | sed 's/.*: "//; s/"//')

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

The course is fully authored (DEC-061), so this gate no
longer asserts anything about an unauthored tail. It asserts
that Mission 4 is declared authored and that every Mission 4
step sits inside Mission 4 and nowhere else.

This gate proves AUTHORED STRUCTURE, absence and ordering.
It does NOT prove:
  - that the instruction teaches well; that is Human UAT
  - that its cognitive load is survivable for a beginner,
    which is the specific risk in this mission
  - anything about a browser rendering; none runs here
==========================================================
SUMMARY
