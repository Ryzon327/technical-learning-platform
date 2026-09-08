#!/usr/bin/env bash
#
# WP-J Mission 2 — "Inside one network: how a switch delivers".
#
# ## What this gate owns
#
# `verify-wpj.sh` owns the COURSE and the authoring declaration. `verify-wpj-m1.sh`
# owns MODULE 1 — the facts that are true of Missions 1 and 2 together, and the
# presentation chain both of them ride on. `verify-wpj-m3.sh` through `-m8` own
# their own missions. This gate owns MISSION 2, and nothing else.
#
# ## Why it exists at all, when a Module 1 gate already runs
#
# Because a Module-wide gate cannot tell which of its two missions a fact came
# from, and a course-wide gate cannot tell which of eight.
#
# That is not hypothetical. `verify-wpj-m1.sh` section 6g asserted Mission 2's
# simultaneous-delivery teaching with `grep -Fq '"alsoOnLinkIds"' "$DOCUMENT"`
# — over the WHOLE document. Mission 4 also authors simultaneous links, so the
# check went on reporting success for a Mission 2 that had lost the thing the
# section is named after. An audit found it green on Mission 4's data.
#
# So every content assertion below reads a Mission 2 BLOCK, extracted between
# Mission 2's stableId and Mission 3's. A fact authored in another mission
# cannot satisfy a check here, and a fact deleted from Mission 2 cannot hide
# behind one.
#
# ## What the Founder UAT repair changed, and what therefore has to be pinned
#
# Mission 2 was the mission the second Founder UAT round found hardest to
# follow. The repair is not cosmetic — it changes what the learner is asked to
# do and when — so each half of it is pinned here as an authored fact:
#
#   the journey is REQUIRED           `requiredForProgression`, so the mission's
#                                     later steps do not answer the activity's
#                                     question before the learner does it
#   d2 predicts, and does not grade   the learner cannot yet know what an
#                                     unlearned destination produces; the
#                                     observation IS the answer
#   d2 checks what was just shown     one knowledge check, AFTER the reveal,
#                                     which is the instrument that may grade
#   d3 asks nothing                   it used to carry a prediction about what
#                                     the switch had learned, asked before the
#                                     learner had been shown learning at all
#   d3 shows the Printer's copy       one moment, two places: `alsoOnLinkIds`
#                                     for the wire and `alsoAtNodeIds` for the
#                                     device, or the copy exists in the
#                                     narration and nowhere on screen
#   d4 and d5 name the REPLY          stage traffic, so the marker stops
#                                     claiming the delivery is still travelling
#                                     when what is moving is PC-B's answer
#   d7 predicts, and DOES grade       by then the learner has been shown
#                                     learning happen and can reason it out
#   a near-transfer, then a handoff   the same shape Mission 1 ends with
#
# ## Why so much is delegated
#
# The same reason every gate in this family delegates: the questions worth
# asking are about PARSED structure, and answering them in shell means reading
# JSON with `grep` — a second curriculum parser wearing a disguise.
# `services/api/src/networking-foundations-module1.test.ts` does that work
# through `parseCurriculumDocument`. What stays here is the file-level facts and
# the cross-file consistency no single suite can see.
#
# ## What this gate cannot prove
#
# Whether a beginner can now follow the two passes; whether being made to finish
# the activity before reading on feels like structure or like being blocked;
# whether the Printer's unaccepted copy reads as normal rather than as a fault.
# All three are Tier 3 human review, and all three are what the second UAT round
# was about.

set -euo pipefail

DOCUMENT="content/curriculum/networking-foundations.json"
MODULE1_TESTS="services/api/src/networking-foundations-module1.test.ts"
COURSE_TESTS="services/api/src/networking-foundations.test.ts"
MISSION4_TESTS="services/api/src/networking-foundations-mission4.test.ts"
COURSE_GATE="scripts/verify-wpj.sh"
MODULE1_GATE="scripts/verify-wpj-m1.sh"
RUNBOOK="docs/Engineering-OS/WP_J_MISSION_2_UAT_RUNBOOK.md"
LEDGER="scripts/lib/wpj-concept-ledger.txt"
SELECTOR="scripts/ci-select-gates.sh"

MODEL="packages/shared-types/src/observation-model.ts"
REGISTRY="packages/shared-types/src/instruction-interaction.ts"
LAYOUT="apps/web/src/learning/topology-layout.ts"
PRESENTATION="apps/web/src/learning/packet-journey-presentation.ts"
NEAR_TRANSFER="apps/web/src/learning/near-transfer-presentation.ts"
PROJECTION="packages/shared-types/src/mission-instruction.ts"
STEPS="packages/shared-types/src/mission-steps.ts"
INSTRUCTION="apps/web/src/learning/MissionInstruction.tsx"
INSTRUCTION_PRESENTATION="apps/web/src/learning/mission-instruction-presentation.ts"
JOURNEY="apps/web/src/learning/PacketJourney.tsx"
SURFACE="apps/web/src/learning/InteractionSurface.tsx"
NEAR_TRANSFER_STEP="apps/web/src/learning/NearTransferStep.tsx"
HARNESS="apps/web/src/uat/UatHarness.tsx"
FOCUS_SUITE="apps/web/src/learning/mission-instruction-focus.test.tsx"
PARSER="packages/shared-types/src/curriculum-document.ts"
STYLES="apps/web/src/styles.css"
VIEW="apps/web/src/learning/LearningView.tsx"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-J MISSION 2 INSTRUCTIONAL GATE ====="
echo ""

for required in "$DOCUMENT" "$MODULE1_TESTS" "$COURSE_TESTS" "$COURSE_GATE" \
                "$MODULE1_GATE" "$RUNBOOK" "$LEDGER" "$SELECTOR" \
                "$MODEL" "$REGISTRY" "$LAYOUT" "$PRESENTATION" "$NEAR_TRANSFER"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

# Blocks are written to FILES, never piped. `printf '%s' "$BLOCK" | grep -q …`
# is a pipefail race: `grep -q` exits on first match, `printf` dies of SIGPIPE
# with status 141, and the pipeline reports 141 despite matching. The repository
# has fixed that race twice and does not intend to reintroduce it.
SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

M2_BLOCK="$SCAN_DIR/mission-2.json"

awk '
  /"stableId": "nf-m2-inside-one-network"/ { start = 1 }
  /"stableId": "nf-m3-ipv4-the-second-identity"/ { start = 0 }
  start
' "$DOCUMENT" > "$M2_BLOCK"

[ -s "$M2_BLOCK" ] \
  || fail "Mission 2 could not be located between its own stable id and Mission 3's; every content check below would then be reading the wrong mission, so this gate stops rather than reporting on one"

# ------------------------------------------------------------
# Reading CODE, not the comments that describe it
# ------------------------------------------------------------
# Section 15 asserts that certain sentences are ABSENT. Those sentences are
# exactly the ones the code's own comments have to name in order to record why
# they were rejected — "Reached here" is rejected wording, and the comment
# explaining that it is rejected contains it.
#
# This repository has already paid for the reverse of that mistake: a comment
# mentioning a deleted attribute satisfied a gate's raw grep while the
# attribute itself was gone. Absence is asserted against stripped code, so
# neither direction can happen.
strip_comments() {
  awk '
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
      print out
    }
  ' "$1"
}

# A non-empty file that strips to NOTHING is a failure, never a silent pass.
strip_checked() {
  strip_comments "$1" > "$2"

  if [ -s "$1" ] && [ ! -s "$2" ]; then
    fail "stripping $1 produced nothing, but the file is not empty — every absence check reading it would pass while examining no code"
  fi
}

PRESENTATION_CODE="$SCAN_DIR/presentation-code.ts"
strip_checked "$PRESENTATION" "$PRESENTATION_CODE"

LAYOUT_CODE="$SCAN_DIR/layout-code.ts"
strip_checked "$LAYOUT" "$LAYOUT_CODE"

# ------------------------------------------------------------
# 1. Mission 2 is authored, under its approved identity
# ------------------------------------------------------------
grep -Fq '"title": "Mission 2 — Inside one network: how a switch delivers"' "$M2_BLOCK" \
  || fail "Mission 2's approved title changed; the learner would be told a different mission is in front of them"

grep -Fq '"moduleStableId": "nf-mod1-one-network"' "$M2_BLOCK" \
  || fail "Mission 2 left Module 1; the learner would meet it outside the module whose prerequisites it depends on"

grep -Fq '"stableId": "m2-s' "$M2_BLOCK" \
  || fail "Mission 2 carries no authored step; the learner would open the mission and find nothing to do"

source scripts/lib/wpj-mission-authority.sh
wpj_mission_authority_load

wpj_require_authored 'nf-m2-inside-one-network' 'verify-wpj-m2.sh'

grep -Fq 'wpj_mission_authority_load' "$COURSE_GATE" \
  || fail "the course gate no longer reads the mission authority declaration; nothing would then constrain which missions may carry instruction"

# Mission 2's steps sit inside Mission 2 and nowhere else. Instruction that
# migrated to another mission would still parse, and the learner would meet
# Mission 2's teaching somewhere it makes no sense.
STEP_OWNERSHIP="$SCAN_DIR/m2-step-ownership.txt"
grep -o '"stableId": "m[0-9]*-s[^"]*"' "$DOCUMENT" > "$STEP_OWNERSHIP" || true

M2_OWN_STEPS="$(grep -c '"stableId": "m2-s' "$STEP_OWNERSHIP" || true)"
M2_BLOCK_STEPS="$(grep -c '"stableId": "m2-s' "$M2_BLOCK" || true)"

[ "$M2_OWN_STEPS" = "$M2_BLOCK_STEPS" ] \
  || fail "$M2_OWN_STEPS Mission 2 steps exist in the document but only $M2_BLOCK_STEPS sit inside Mission 2; a learner would meet part of this mission's teaching in a mission that has not set it up"

echo "PASS:  1. Mission 2 is authored under its approved identity and owns its own instruction"

# ------------------------------------------------------------
# 2. One journey, and the learner has to do it
# ------------------------------------------------------------
JOURNEYS="$(grep -c '"interactionStableId"' "$M2_BLOCK" || true)"
[ "$JOURNEYS" = "1" ] \
  || fail "Mission 2 authors $JOURNEYS journeys; the whole mission is ONE delivery compared with a LATER delivery between the same two hosts, and splitting it removes the comparison the learner is meant to make"

grep -Fq '"interactionStableId": "nf-pj2-local-delivery"' "$M2_BLOCK" \
  || fail "Mission 2's journey lost its approved interaction identity; learner progress recorded against the old id would no longer resolve"

grep -Fq '"sourceKind": "authored_teaching"' "$M2_BLOCK" \
  || fail "Mission 2's journey no longer declares authored teaching; the learner would not be told this is a simulation rather than their own network"

# ## The progression requirement
#
# Founder UAT round 2: the steps after the activity explain what the activity
# shows. On screen from the start, they answer the question before the learner
# has watched anything, and the walkthrough becomes optional reading.
#
# `requiredForProgression` is what holds them back. It is authored — a
# renderer deciding for itself which steps are worth requiring would be
# writing pedagogy.
grep -Fq '"requiredForProgression": true' "$M2_BLOCK" \
  || fail "Mission 2's journey is no longer required before the later steps; the steps that explain the activity would sit on screen answering it, and a learner could reach the summary without ever watching a delivery"

REQUIRED_COUNT="$(grep -c '"requiredForProgression"' "$M2_BLOCK" || true)"
[ "$REQUIRED_COUNT" = "1" ] \
  || fail "Mission 2 declares $REQUIRED_COUNT progression requirements; exactly one step — the journey — may hold the lesson back, and a second would leave the learner blocked twice with no way to tell which"

echo "PASS:  2. one journey, declared authored teaching, and required before the lesson goes on"

# ------------------------------------------------------------
# 3. The traffic is named as ONE delivery, and the reply is named separately
# ------------------------------------------------------------
# Founder UAT round 2: the marker went on being described as the outbound
# delivery while what was actually moving was PC-B's answer. Whether the reply
# is a different thing travelling the other way is a NETWORKING fact, so it is
# authored per stage rather than worked out from which way the marker points.
grep -Fq '"label": "one local-network delivery"' "$M2_BLOCK" \
  || fail "the journey no longer names what is moving as one local-network delivery; the copies on the first pass would read as separate messages rather than as copies of one"

grep -Fq '"startActionLabel": "Send the delivery to PC-B"' "$M2_BLOCK" \
  || fail "the start control no longer says what the learner is about to send; the first thing they are asked to do would not say what it does"

# The stage-level traffic, on exactly the two stages that carry the reply.
REPLY_TRAFFIC="$(grep -c '"label": "PC-B'"'"'s reply"' "$M2_BLOCK" || true)"
[ "$REPLY_TRAFFIC" = "2" ] \
  || fail "$REPLY_TRAFFIC of 2 return stages name PC-B's reply as what is moving; on a stage that does not, the learner watches the reply travel while being told the original delivery is still in flight"

for reply_stage in 'd4-pc-b-replies' 'd5-reply-reaches-pc-a'; do
  grep -Fq "\"stageId\": \"$reply_stage\"" "$M2_BLOCK" \
    || fail "the return leg lost a stage: $reply_stage — the learner would never see the reply that is the whole reason Switch-1 learns where PC-B is"
done

echo "PASS:  3. the delivery and the reply are each named as what is moving"

# ------------------------------------------------------------
# 4. d2 predicts and does not grade; d2's knowledge check does grade
# ------------------------------------------------------------
#
# THE AUTHORITATIVE INSTRUMENT PLACEMENT, stated once, here.
#
#   d2-switch-sends-copies   exploratory prediction, NO correctOption, NO
#                            explanation; then, after the reveal, exactly one
#                            knowledge check: m2-d2-source-learning.
#   d3-copies-arrive         no prediction, no knowledge check.
#   d7-switch-sends-once     graded prediction, with its authored
#                            correctOption and explanation.
#
# A later independent review prompt summarised this incorrectly, placing the
# knowledge check on d3. It is recorded here, and asserted in sections 4, 5 and
# 6 below, so that a review summary can never be mistaken for the authoring.
#
# DEC-063 keeps the two instruments apart, and Mission 2 is the clearest case
# in the course. At d2 the learner has never been shown what a switch does with
# a destination it has no record of — the observation IS the answer, and marking
# the guess would punish them for doing exactly what was asked. The knowledge
# check comes after the reveal and asks about what is already on screen, which
# is the instrument that may carry a right answer.
D2_BLOCK="$SCAN_DIR/stage-d2.json"
awk '
  /"stageId": "d2-switch-sends-copies"/ { start = 1 }
  /"stageId": "d3-copies-arrive"/ { start = 0 }
  start
' "$M2_BLOCK" > "$D2_BLOCK"

[ -s "$D2_BLOCK" ] \
  || fail "the flooding stage d2-switch-sends-copies is gone; the learner would never see what a switch does with a destination it has no record of, which is the mission's first teaching moment"

grep -Fq '"prediction"' "$D2_BLOCK" \
  || fail "d2 no longer asks the learner to predict; they would watch the flood instead of committing to a guess first, and the method DEC-058 requires is PREDICT then OBSERVE"

# The prediction's own block, so a knowledge check's answer key — which is
# supposed to be there — cannot satisfy or fail a rule about the prediction.
D2_PREDICTION="$SCAN_DIR/d2-prediction.json"
awk '
  /"prediction": \{/ { start = 1 }
  start && /"deviceFacts"/ { start = 0 }
  start
' "$D2_BLOCK" > "$D2_PREDICTION"

[ -s "$D2_PREDICTION" ] \
  || fail "d2's prediction could not be located; this gate stops rather than reporting on a prediction it cannot read"

if grep -Fq '"correctOption"' "$D2_PREDICTION"; then
  fail "d2's prediction acquired an answer key; the learner is asked what a switch does before they have ever been shown it, so marking that guess tells them they were wrong for doing what the step asked"
fi

# And no reason either. An explanation on an ungraded prediction is an answer
# key in prose: it tells the learner what they should have guessed, at the one
# moment in the mission where guessing wrong is the intended experience.
if grep -Fq '"explanation"' "$D2_PREDICTION"; then
  fail "d2's prediction acquired an explanation; an exploratory prediction that explains itself has graded the learner in prose, before they have been shown anything to reason from"
fi

grep -Fq '"checkId": "m2-d2-source-learning"' "$D2_BLOCK" \
  || fail "d2 lost its knowledge check m2-d2-source-learning; nothing would then ask the learner WHY Switch-1 can record PC-A, and the learning half of the mission would be narrated at them rather than checked"

D2_CHECKS="$(grep -c '"checkId"' "$D2_BLOCK" || true)"
[ "$D2_CHECKS" = "1" ] \
  || fail "d2 authors $D2_CHECKS knowledge checks; exactly one is approved, and a second at the same stopping point would ask the learner to answer twice before the journey moves"

grep -Fq '"correctOption": "Because the delivery arrived on port 1 with PC-A as its source"' "$D2_BLOCK" \
  || fail "d2's knowledge check no longer names its authored answer; the learner would be told nothing, or told something else, about why a switch can record where PC-A is"

echo "PASS:  4. d2 predicts ungraded, and its knowledge check carries the authored answer"

# ------------------------------------------------------------
# 5. d3 asks nothing, and shows the copy in two places
# ------------------------------------------------------------
D3_BLOCK="$SCAN_DIR/stage-d3.json"
awk '
  /"stageId": "d3-copies-arrive"/ { start = 1 }
  /"stageId": "d4-pc-b-replies"/ { start = 0 }
  start
' "$M2_BLOCK" > "$D3_BLOCK"

[ -s "$D3_BLOCK" ] \
  || fail "the arrival stage d3-copies-arrive is gone; the learner would never see the copies land, and the flood would have no consequence"

# The removed prediction. It asked what Switch-1 had learned BEFORE the learner
# had been shown a switch learning anything, so it was a guess dressed as
# reasoning. The same question now sits on d2 as a knowledge check, after the
# evidence.
if grep -Fq '"prediction"' "$D3_BLOCK"; then
  fail "d3 asks a prediction again; it would ask what Switch-1 has learned before the learner has been shown learning happen at all, which is the defect the d2 knowledge check replaced"
fi

# And no knowledge check. An independent review summary once described the
# source-learning check as belonging to d3; it does not, and never did. d2 is
# where the flood is REVEALED, so d2 is where a question about the reveal can
# be answered from what is on screen. Moving it to d3 would ask the learner
# about a moment they had already left. This rule exists so that ambiguity
# cannot quietly become a change.
if grep -Fq '"checkId"' "$D3_BLOCK"; then
  fail "d3 acquired a knowledge check; the source-learning check belongs to d2, immediately after the flood is revealed, and asking at d3 would question a moment the learner has already moved past"
fi

grep -Fq '"link-printer"' "$D3_BLOCK" \
  || fail "d3 no longer names the Printer's connection as busy at the same moment; the second copy would exist in the narration and nowhere in the picture"

grep -Fq '"alsoAtNodeIds"' "$D3_BLOCK" \
  || fail "d3 no longer names the Printer as a place the traffic also is; the copy would light a wire that ends at a device showing no sign of having received anything"

grep -Fq '"printer"' "$D3_BLOCK" \
  || fail "d3's simultaneous arrival does not name the Printer; the device that has to visibly not accept the copy would not be marked"

echo "PASS:  5. d3 asks nothing and shows the simultaneous copy on both the wire and the device"

# ------------------------------------------------------------
# 6. d7 predicts, and DOES grade, with a reason
# ------------------------------------------------------------
D7_BLOCK="$SCAN_DIR/stage-d7.json"
awk '
  /"stageId": "d7-switch-sends-once"/ { start = 1 }
  /"stageId": "d8-pc-b-receives"/ { start = 0 }
  start
' "$M2_BLOCK" > "$D7_BLOCK"

[ -s "$D7_BLOCK" ] \
  || fail "the second-pass stage d7-switch-sends-once is gone; the comparison the whole mission is built on would have only one half"

grep -Fq '"correctOption": "Send it through port 2 only"' "$D7_BLOCK" \
  || fail "d7's prediction no longer carries its authored answer; by this point the learner HAS been shown the switch learn, so leaving them to infer from the animation whether they were right is the defect Founder UAT reported"

grep -Fq '"explanation"' "$D7_BLOCK" \
  || fail "d7's prediction gives a verdict with no reason; a learner told \"Not quite\" and nothing else is no better off than before they answered"

echo "PASS:  6. d7's prediction is graded and explains its answer"

# ------------------------------------------------------------
# 7. The near-transfer check, and the handoff that waits behind it
# ------------------------------------------------------------
# The same shape Mission 1 ends with: apply the idea on a network the learner
# has never seen, then be told what comes next. The handoff answers the
# activity's own question, so it must come after it — the ordering is what
# stops the closing paragraph giving the answers away.
grep -Fq '"stableId": "m2-s8-try-a-different-switch"' "$M2_BLOCK" \
  || fail "Mission 2 authors no near-transfer check; the learner would leave having watched one switch and never applied the idea to another, which is the difference between recognising and knowing"

for question in 'm2-nt-q1-unknown-destination' 'm2-nt-q2-source-learning' \
                'm2-nt-q3-camera-copy' 'm2-nt-q4-known-destination'; do
  grep -Fq "\"questionStableId\": \"$question\"" "$M2_BLOCK" \
    || fail "the near-transfer check lost a question: $question — the four cover flooding, learning, the unintended copy and the learned delivery, and dropping one leaves a part of the mission never applied"
done

NT_QUESTIONS="$(grep -c '"questionStableId"' "$M2_BLOCK" || true)"
[ "$NT_QUESTIONS" = "4" ] \
  || fail "the near-transfer check asks $NT_QUESTIONS questions; exactly four are approved, and an unapproved fifth is curriculum no architect authored"

grep -Fq '"stableId": "m2-s9-what-comes-next"' "$M2_BLOCK" \
  || fail "Mission 2 does not hand off to Mission 3; the learner would finish the activity and be told nothing about what they had just proven or where it leads"

# The handoff is LAST. Anywhere earlier and it sits on screen summarising the
# mission while the learner is still doing it.
LAST_STEP="$(grep -o '"stableId": "m2-s[^"]*"' "$M2_BLOCK" | tail -1)"
[ "$LAST_STEP" = '"stableId": "m2-s9-what-comes-next"' ] \
  || fail "Mission 2's last authored step is $LAST_STEP; the handoff must come last, or it summarises the mission to a learner who has not finished it"

echo "PASS:  7. the near-transfer check asks its four questions, and the handoff comes last"

# ------------------------------------------------------------
# 8. No fault, no evidence, no scoring, no certification, no lab
# ------------------------------------------------------------
# Doctrine §23.2 and DEC-060: instructional interaction cannot manufacture
# competency. Mission 2 is a teaching walkthrough. A learner answering its
# knowledge check or its four questions is finding out whether they understood,
# and nothing anywhere records that they did.
for forbidden in '"fault"' 'stopsAtStageId' 'resolvesFault' '"outcome": "stops"' \
                 'assessmentStableId' 'assetStableId' 'live_lab' \
                 'competencyEvidence' 'mastery' 'graded' 'certification' \
                 'CompTIA' 'Security+'; do
  if grep -qF -e "$forbidden" "$M2_BLOCK"; then
    fail "Mission 2 acquired evidence, scoring, certification or fault machinery: $forbidden — a learner would be told a teaching walkthrough had judged them"
  fi
done

# The empty action list is the positive half: no remediation is offered,
# because nothing breaks.
grep -Fq '"actions": []' "$M2_BLOCK" \
  || fail "Mission 2's journey no longer authors an empty action list; a repair control would appear in a mission where nothing has gone wrong"

# The step vocabulary stays closed, and Mission 2 authors only types inside it.
# Read from Mission 2's own block, so a type introduced anywhere else in the
# course cannot satisfy this and a type introduced HERE cannot hide.
grep -Fq 'The set is closed.' packages/shared-types/src/mission-steps.ts \
  || fail "the step vocabulary is no longer declared closed; Mission 2 relies on authoring within a fixed set, and an invented type would render as nothing at all"

# ## Why this reads the type UNDER `"content"` rather than every `"type"` key
#
# The sibling gates scan `grep -o '"type": "[a-z_]*"'` over their mission block,
# which is correct for a mission whose only typed objects are steps. Mission 2
# authors a near-transfer check, and a near-transfer QUESTION carries a `type`
# of its own — `single_choice`, `multiple_choice` — so the blanket scan reports
# a question format as an unapproved step type.
#
# Raising the case list to admit `single_choice` would be worse than useless: it
# would then accept a STEP of type `single_choice`, which is the exact thing the
# closed vocabulary exists to refuse. So the extraction is narrowed to the type
# that sits directly under a `"content"` object, which is the only place a step
# type is ever written.
while IFS= read -r authored; do
  [ -n "$authored" ] || continue
  case "$authored" in
    concept|diagram|command|prediction|interaction|practice|near_transfer|reference) ;;
    *) fail "Mission 2 authors the step type \"$authored\", which is not in the closed vocabulary; the learner would reach a step the renderer has no case for" ;;
  esac
done < <(awk '
  /"content": \{/ { want = 1; next }
  want && match($0, /"type": "[a-z_]+"/) {
    value = substr($0, RSTART, RLENGTH)
    sub(/.*: "/, "", value)
    sub(/"$/, "", value)
    print value
    want = 0
  }
' "$M2_BLOCK")

# And the scan actually found something. An awk pattern that silently matched
# nothing would turn a closed vocabulary into no check at all.
CONTENT_TYPES="$(awk '
  /"content": \{/ { want = 1; next }
  want && /"type": "[a-z_]+"/ { count += 1; want = 0 }
  END { print count + 0 }
' "$M2_BLOCK")"

[ "$CONTENT_TYPES" = "$M2_BLOCK_STEPS" ] \
  || fail "the step-type scan found $CONTENT_TYPES typed step contents for $M2_BLOCK_STEPS authored steps; the closed-vocabulary check would be reading something other than Mission 2's steps"

echo "PASS:  8. Mission 2 produces no evidence, authors no fault, and stays inside the vocabulary"

# ------------------------------------------------------------
# 9. The contracts Mission 2 depends on exist and stay generic
# ------------------------------------------------------------
# Mission 2 is the only mission that needs a stage to say "this is happening in
# two places at once" and "what is moving now is the reply". Both are authored
# facts, and both are exactly the switching calculation that must never appear
# in code — a renderer that worked out which ports are eligible, or which way
# the traffic is going, would be a second networking engine.
grep -Fq 'readonly alsoOnLinkIds?: readonly string[];' "$REGISTRY" \
  || fail "an authored stage can no longer name simultaneous links; the flood would draw as a serial path and the learner would watch the copies arrive one after another"
grep -Fq 'readonly alsoOnLinkIds?: readonly string[];' "$MODEL" \
  || fail "the observation model cannot say several links were busy at once; the authored fact would be dropped between the parser and the picture"

grep -Fq 'alsoAtNodeIds' "$REGISTRY" \
  || fail "an authored stage can no longer name further devices the traffic reached; the Printer's copy would light a wire and mark no device"
grep -Fq 'alsoAtNodeIds' "$MODEL" \
  || fail "the observation model cannot carry further devices at a stage; d3's second arrival would be dropped in projection"

grep -Fq 'requiredForProgression' packages/shared-types/src/mission-steps.ts \
  || fail "an interaction step can no longer be declared required; Mission 2's later steps would answer the activity before the learner does it"

# The field names stay GENERIC. A name that encoded networking meaning would be
# the model making the claim the author is supposed to make, and would license a
# renderer to act on it.
for networking in 'floodedLinkIds' 'forwardingPorts' 'egressPorts' \
                  'switchPorts' 'broadcastLinks' 'macTable' 'floodPorts' \
                  'learnedNodeIds' 'copyNodeIds'; do
  if grep -qF -e "$networking" "$MODEL" "$REGISTRY" "$LAYOUT" "$PRESENTATION"; then
    fail "a contract field encodes switching semantics: $networking — the model would be asserting a networking fact the author is responsible for, and the next consumer would read it as permission to compute one"
  fi
done

# And nothing works it out. These are the calculations that would turn the
# renderer into a second networking engine.
for calculated in 'eligiblePorts' 'otherPorts' 'excludeIngress' 'ingressPort' \
                  'learnedFrom' 'lookupPort' 'forwardTo' 'macLearning' \
                  'floodFrame'; do
  if grep -qF -e "$calculated" "$LAYOUT" "$PRESENTATION"; then
    fail "the renderer computes switching behaviour: $calculated — the picture would start disagreeing with the curriculum the moment an author wrote something it did not predict"
  fi
done

# The presentation READS both authored facts rather than reconstructing them.
grep -Fq 'alsoOnLinkIds' "$LAYOUT" \
  || fail "the layout ignores authored simultaneous links; the copies would not be drawn"
grep -Fq 'alsoAtNodeIds' "$LAYOUT" \
  || fail "the layout ignores the further devices a stage reached; the Printer would show nothing when its copy arrives"
grep -Fq 'alsoAtNodeIds' "$PRESENTATION" \
  || fail "device inspection ignores the further devices a stage reached; selecting the Printer at d3 would say it was not involved while its copy was arriving"

echo "PASS:  9. the simultaneity, reply and progression contracts exist, stay generic and are consumed"

# ------------------------------------------------------------
# 10. The ledger orders Mission 2's six concepts
# ------------------------------------------------------------
# The ledger is the teach-before-use audit source. If it and the curriculum
# disagree about what Mission 2 teaches, the audit stops being able to catch
# anything — a later mission could use a term Mission 2 no longer introduces and
# every check would still report success.
for concept in 'local delivery' 'frame' 'MAC address' \
               'switch learning and forwarding' 'unknown-destination flooding' \
               'MAC address table'; do
  grep -Eq "^[0-9]+\|nf-m2-inside-one-network\|$concept\|" "$LEDGER" \
    || fail "the ledger no longer places '$concept' at Mission 2; the teach-before-use audit and the curriculum would disagree about what the learner has been given"
done

M2_LEDGER_ROWS="$(grep -c '|nf-m2-inside-one-network|' "$LEDGER" || true)"
[ "$M2_LEDGER_ROWS" = "6" ] \
  || fail "the ledger gives Mission 2 $M2_LEDGER_ROWS concepts; exactly six are authorized, and a seventh would be a concept the mission claims to teach without an approved place in the sequence"

# `broadcast` is NOT one of them. Mission 2 shows a switch copying a delivery
# out of its other ports because it has no record of the destination — that is
# flooding. A broadcast is deliberately addressed to every machine and needs an
# address the learner does not have until Mission 4.
if grep -Eq "^[0-9]+\|nf-m2-inside-one-network\|broadcast\|" "$LEDGER"; then
  fail "the ledger places 'broadcast' at Mission 2; the learner would be recorded as having been taught a behaviour this mission does not show, and Mission 4 would be free to assume it"
fi

echo "PASS: 10. the ledger orders Mission 2's six concepts and defers broadcast"

# ------------------------------------------------------------
# 11. Every other mission is intact
# ------------------------------------------------------------
# A Mission 2 repair that deleted a neighbouring mission would still pass every
# check above. This asserts each one is still THERE, with steps.
#
# ## The touch boundary, as it actually stands
#
# Mission 2 remains this work package's owner. Missions 3 and 4 received a
# BOUNDED terminology and continuity repair, because Mission 2 now teaches the
# term MAC address and leaving the downstream missions on "factory identity"
# would have left an immediate contradiction two missions later. Mission 4's
# learner-facing text and interface labels changed; Mission 3's changes are
# comments and documentation only. Neither is reopened as an independent
# instructional work package, and Missions 5 to 8 are untouched.
#
# This loop is therefore deliberately an EXISTENCE check and not an
# intactness check. It cannot assert byte-identity for Missions 3 and 4,
# because those two legitimately changed; Mission 4's own continuity is
# asserted by the suite this gate now runs.
for other in 'nf-m1-what-a-network-is' \
             'nf-m3-ipv4-the-second-identity' \
             'nf-m4-the-prefix-and-the-decision' \
             'nf-m5-the-default-gateway' \
             'nf-m6-routers-and-the-journey' \
             'nf-m7-testing-whether-it-works' \
             'nf-m8-when-it-does-not-work'; do
  grep -Fq "\"stableId\": \"$other\"" "$DOCUMENT" \
    || fail "$other is no longer in the document; a learner part-way through the course would lose a mission this repair had no authority to remove"

  MISSION_NUMBER="${other#nf-m}"
  MISSION_NUMBER="${MISSION_NUMBER%%-*}"
  grep -Fq "\"stableId\": \"m${MISSION_NUMBER}-s" "$DOCUMENT" \
    || fail "$other has lost its authored steps; the learner would reach it and find nothing to do"
done

# Mission 1 still ends the way Mission 2 opens. Mission 2's first step assumes
# the learner can already read a small network and name its devices.
grep -Fq '"stableId": "m1-s7-try-a-different-network"' "$DOCUMENT" \
  || fail "Mission 1's near-transfer check is gone; Mission 2 states that reading a small network is its prerequisite, and nothing would have asked the learner to prove it"

echo "PASS: 11. every other mission is still present, with its authored steps"

# ------------------------------------------------------------
# 12. No dependency, migration or publication side effect
# ------------------------------------------------------------
# One authoritative dependency policy, and this gate does not restate it.
#
# The rule is "no UNREVIEWED dependency", not "no dependency". This gate held
# its own inline version of that, compared as name sets, which would have
# accepted a version bump on an existing package or an unrelated field change.
# The shared policy compares whole objects and pins the lockfile closure by
# hash; `scripts/verify-dependency-policy.sh` proves it against sixteen hostile
# shapes, including the two that matter most here — an unrelated change made
# AFTER jsdom is already committed, which must not become a standing permission.
source scripts/lib/authorized-dependency.sh
authorized_dependency_check "the Mission 2 slice"

if grep -rn --include=*.ts --include=*.tsx "from \"jsdom\"\|require(\"jsdom\")" apps/web/src services/api/src packages 2>/dev/null; then
  fail "application source imports jsdom; it is a test environment and must never be reachable from shipped code"
fi

if [ -d supabase/migrations ] && ! git diff --quiet HEAD -- supabase/migrations 2>/dev/null; then
  fail "this slice changed a migration; the Mission 2 repair authors curriculum and presentation only, and a migration is a Founder-gated action"
fi

# Authoring is not publishing.
for operational in 'publishCurriculum' 'importCurriculum' 'service_role' \
                   'supabase db' 'LabProvider' 'deployTo'; do
  if grep -qF -e "$operational" "$DOCUMENT"; then
    fail "the curriculum document names an operational identifier: $operational"
  fi
done

# The other course stays pinned. Nothing in Networking Foundations has any
# reason to edit Router-on-a-Stick.
if ! git diff --quiet HEAD -- packages/shared-types/src/roas-curriculum.ts 2>/dev/null; then
  fail "this slice changed another course: packages/shared-types/src/roas-curriculum.ts"
fi

echo "PASS: 12. no dependency, migration, publication or other-course side effect"

# ------------------------------------------------------------
# 13. The gate resolves through the namespace and owns its paths
# ------------------------------------------------------------
[ -f "scripts/verify-wpj-m2.sh" ] \
  || fail "this gate is not at the path the verifier namespace resolves"

grep -Fq 'scripts/verify-wpj-m2.sh' "$SELECTOR" \
  || fail "the change-relevant selector maps nothing to this gate; every rule above would be unreachable in CI"

# Every path this gate makes an assertion about must select it. A gate that
# checks a file it is not woken for is a gate that passes forever.
for owned in "$DOCUMENT" "$MODULE1_TESTS" "$LEDGER" "$LAYOUT" \
             "$PRESENTATION" "$NEAR_TRANSFER" "$REGISTRY" "$MODEL" \
             "$COURSE_TESTS" "$PROJECTION" "$INSTRUCTION" "$VIEW" "$STEPS" \
             "$INSTRUCTION_PRESENTATION" "$JOURNEY" "$SURFACE" "$PARSER" \
             "$NEAR_TRANSFER_STEP" "$STYLES" "$HARNESS" "$MISSION4_TESTS" \
             "$FOCUS_SUITE"; do
  SELECTED="$(bash "$SELECTOR" "$owned")"
  case "
$SELECTED
" in
    *"
scripts/verify-wpj-m2.sh
"*) ;;
    *) fail "$owned does not select this gate; a change breaking one of the rules above would merge without this gate ever running. It selected: $SELECTED" ;;
  esac
done

# The behavioural focus suite exists and this gate runs it.
#
# Same reasoning as the Mission 4 delegation below: a gate that stops running a
# suite stops being protected by it silently. Anchored so the guard cannot
# satisfy itself from its own source line.
[ -f "$FOCUS_SUITE" ] \
  || fail "the DOM focus behaviour suite is gone; the only check that observes focus moving would be absent and the greps above would be all that is left"

grep -Fq '@vitest-environment jsdom' "$FOCUS_SUITE" \
  || fail "the focus suite no longer declares a DOM environment; it would run in node, where document does not exist, and its assertions could not execute"

grep -Fq 'document.activeElement' "$FOCUS_SUITE" \
  || fail "the focus suite no longer reads document.activeElement; it would be asserting something other than where focus actually is"

grep -Eq '^npm run test .*mission-instruction-focus' "scripts/verify-wpj-m2.sh" \
  || fail "this gate no longer runs the DOM focus behaviour suite; deleting the production focus move would pass this gate again"

# The Mission 4 continuity DEPENDENCY, asserted rather than assumed.
#
# Also found by mutation: deleting the delegation line and reintroducing
# "factory identity" into Mission 4 left this gate green. The suite that
# catches the stale model is Mission 4's, and a gate that stops running a suite
# stops being protected by it silently — there is no failure to notice.
[ -f "$MISSION4_TESTS" ] \
  || fail "the Mission 4 continuity suite is gone; nothing would notice the substitute vocabulary returning to the mission whose model Mission 2 corrected"

grep -Fq 'factory identity' "$MISSION4_TESTS" \
  || fail "the Mission 4 continuity suite no longer names the substitute vocabulary it exists to refuse; the guard would pass while the retreat it was written for came back"

# The RUN LINE, matched by an anchored pattern.
#
# Two earlier attempts failed, both by matching text that was not the
# delegation. Grepping the bare suite name matched the `MISSION4_TESTS`
# variable above; grepping the vitest filter argument matched the guard's own
# source line. Anchoring at the start of a line separates the command from
# every mention of it, including this one, which begins with `grep`.
#
# A gate asserting something about its own text is unusual and is used
# deliberately here, in the same shape section 13 already uses to check that
# the selector names this gate: the invariant is about the gate's wiring, and
# there is nowhere else for it to live.
grep -Eq '^npm run test .*networking-foundations-mission4' "scripts/verify-wpj-m2.sh" \
  || fail "this gate no longer runs the Mission 4 continuity suite; the bounded repair Mission 2 forced would be unprotected from the gate that forced it"

echo "PASS: 13. the gate resolves through the verifier namespace and owns its paths"

# ------------------------------------------------------------
# 14. The Founder has something to review, and no verdict is recorded
# ------------------------------------------------------------
grep -Fq 'Mission 2' "$RUNBOOK" \
  || fail "the runbook does not cover Mission 2"

RUNBOOK_PROSE="$SCAN_DIR/runbook-prose.txt"
tr '\n' ' ' < "$RUNBOOK" | tr -s ' ' > "$RUNBOOK_PROSE"

for question in 'progression' 'knowledge check' 'Printer' 'near-transfer' \
                'keyboard' 'reduced motion'; do
  grep -Fqi -e "$question" "$RUNBOOK_PROSE" \
    || fail "the runbook does not tell the Founder to exercise: $question"
done

for verdict in 'UAT PASSED' 'UAT PASS' 'ACCEPTED' 'APPROVED BY FOUNDER'; do
  if grep -qF -e "$verdict" "$RUNBOOK"; then
    fail "the runbook records a Founder verdict: $verdict — Human UAT is the Founder's, and this gate must not pre-empt it"
  fi
done

echo "PASS: 14. the runbook is complete and records no verdict"

# ------------------------------------------------------------
# 15. The Founder-UAT reconciliation rulings hold
# ------------------------------------------------------------
# Everything in this section was ruled on after a rendered review of Mission 2.
# Each rule pins a SENTENCE the Founder read or a state a learner could reach,
# and none of them is provable from a passing suite alone.

# --- the announcement names authored connections, not composed far ends ---
#
# Phase B appended "Also active at this moment: <device> <interface>, ...",
# which nobody authored and which reads as a list of destinations. The ruling
# replaced it with the links' own authored labels.
grep -Fq 'At the same time: ' "$PRESENTATION" \
  || fail "the announcement no longer names the other connections that were busy; a learner watching three copies leave at once would hear about one"

if grep -qF 'Also active at this moment' "$PRESENTATION_CODE"; then
  fail "the rejected announcement frame is back in the presentation; the Founder ruled it out because it reads as a list of destinations rather than of connections"
fi

# The INVARIANT, not a call spelling: the sentence carries the link's own
# authored label. Pinning `return [link.label];` pinned one way of writing that
# and failed on an equivalent rewrite, which is a gate testing its own history.
grep -Fq '[link.label]' "$PRESENTATION_CODE" \
  || fail "the announcement composes its own description of a busy connection instead of using the label the author wrote; renaming a link in the curriculum would stop renaming it in the sentence"

# Deliberately NOT paired with a ban on composing a device label and an
# interface label anywhere in this file. The arrival sentence does exactly
# that, legitimately and by Founder ruling — "arrived from PC-A on Port 1" —
# and a rule broad enough to catch the rejected shape catches the approved one
# too. What the simultaneity clause emits is pinned exactly, by string, in
# `packet-journey-presentation.test.ts`.

# --- a simultaneous participant is called one, in both surfaces ---
#
# The card and the inspector describe the same device at the same moment, so
# they must not disagree. "Passed through" is a claim about transit, and the
# Printer passes nothing on.
grep -Fq 'Participating in this step.' "$PRESENTATION" \
  || fail "device inspection no longer names a simultaneous participant; the Printer at d3 would be described with a word about transit or arrival"
grep -Fq 'Participating in this step' "$LAYOUT" \
  || fail "the topology card no longer names a simultaneous participant; the card and the inspector would say different things about the Printer at the same moment"

# And the word chosen is not an arrival word. "Reached here" was the first
# attempt and the Founder rejected it: a simultaneous participant is the one
# thing that is NOT a destination.
for arrival in 'Reached here' 'Arrived at this step' 'Delivered in this step' \
               'Received here'; do
  if grep -qF -e "$arrival" "$LAYOUT_CODE" "$PRESENTATION_CODE"; then
    fail "a simultaneous participant is described as an arrival: $arrival — the learner would read a copy the Printer never accepted as a delivery"
  fi
done

# --- required instruction fails CLOSED across a mission change ---
#
# The held state outlives the lesson that reported it. Untagged, the previous
# mission's "none" authorised completion of the next mission for the whole
# instruction fetch — the window is a network round trip, not a frame.
grep -Fq 'resolveReportedRequiredInstruction' "$INSTRUCTION_PRESENTATION" \
  || fail "the required-instruction report is no longer scoped to a mission; a mission with no required activity would authorise completing the next one"

# Completion authority asks the REQUEST, not the display.
#
# `selectInstructionSource` answers a display question, and during a fetch it
# correctly answers "the bundled brief". Reading that same answer as completion
# authority meant a brief standing in for a lesson that had not arrived also
# said "this mission has no required activity" — and Mark as complete was live
# for the whole round trip.
grep -Fq 'expectsStructuredInstruction' "$INSTRUCTION_PRESENTATION" \
  || fail "nothing distinguishes a mission whose structured lesson is still owed from one that genuinely has none; the bundled fallback would be completion authority again"
grep -Fq 'expectsStructuredInstruction' "$VIEW" \
  || fail "the learning view decides completion from the displayed source kind again, which cannot tell a pending lesson from a step-less one"

# And a report is only honoured for the rendering that produced it.
grep -Fq 'reported.generation === current.generation' "$INSTRUCTION_PRESENTATION" \
  || fail "a required-instruction report is honoured without checking WHICH rendering produced it; settling a mission, leaving it and returning would let the previous visit's word authorise completing a lesson that has not begun"
grep -Fq 'instructionGeneration' "$VIEW" \
  || fail "the view no longer tracks which rendering of a lesson is on screen, so a stale report cannot be told from a current one"
grep -Fq 'instructionGeneration' "$INSTRUCTION" \
  || fail "the lesson no longer echoes back the rendering it belongs to; its report would be indistinguishable from an earlier visit's"
grep -Fq 'resolveReportedRequiredInstruction' "$VIEW" \
  || fail "the learning view reads the reported required-instruction state directly again, which is the fail-open read this gate exists to prevent"
grep -Fq 'onRequiredInstructionChange?.(' "$INSTRUCTION" \
  || fail "the lesson no longer reports its required-instruction state at all; nothing would hold Mark as complete closed"
grep -Fq 'missionStableId,' "$INSTRUCTION" \
  || fail "the lesson reports its required-instruction state without saying which mission it belongs to; the holder cannot tell it from the previous lesson's"

# --- finishing a required activity hands focus to what it revealed ---
#
# STRUCTURAL, and no longer the only thing standing here.
#
# The greps below prove the WIRING SHAPE exists: a step is reachable for the
# handoff, both settle paths ask which step they revealed, and the destination
# is a named function this repository unit-tests. They are cheap and they fail
# early, which is what they are for.
#
# The AUTHORITATIVE check is now behavioural.
# `apps/web/src/learning/mission-instruction-focus.test.tsx` mounts
# `MissionInstruction` in jsdom, drives both Finish controls through the real
# components, and reads `document.activeElement`. It is run by this gate below.
# A mutation that deletes the focus move fails there, on both paths
# independently, with the actual wrong element named.
#
# What neither proves: that the handoff is USABLE. jsdom is not a browser and
# runs no assistive technology, so announcement, focus visibility and whether
# the movement helps a learner remain Human UAT.
#
# Finish unmounts the button that was pressed. Until this existed the focus it
# held fell to document.body: a keyboard learner was returned to the top of the
# page and a screen-reader learner was told nothing about the steps that had
# just appeared.
grep -Fq 'stepRefs' "$INSTRUCTION" \
  || fail "no step is reachable for the reveal handoff; finishing a required activity would drop focus to the document body"

# THE CALL ITSELF, and not merely the names around it.
#
# Found by mutation: deleting this one line left every suite in the repository
# green and this gate green too. `stepRefs`, `setRevealTarget`,
# `nextInstructionStepId` and `revealedByNearTransfer` all survived, because
# each of them still appears — the map is still populated, the target is still
# computed, and nothing ever moves the focus. Both handoffs were dead and
# nothing said so.
#
# This does not make the handoff behaviourally proved; see the limit recorded
# above. It closes the one hole a mutation demonstrated.
grep -Fq 'stepRefs.current.get(revealTarget)?.focus()' "$INSTRUCTION" \
  || fail "the reveal effect no longer moves focus; both Finish controls would unmount while holding it and a keyboard learner would be returned to the top of the page, with every test in the repository still green"
# Rebased after a mutation MISS. `grep 'setRevealTarget'` matched the useState
# declaration and the effect's own reset, so deleting the CALL in the settle
# handler left this gate green with the handoff broken. The destination is now
# a named function this repository can unit-test, and the assertion is that the
# lesson actually asks it.
grep -Fq 'nextInstructionStepId(steps, step.stableId)' "$INSTRUCTION" \
  || fail "finishing a required activity no longer asks which step it revealed, so focus falls to the document body and a keyboard learner is returned to the top of the page"
grep -Fq 'export function nextInstructionStepId' "$NEAR_TRANSFER" \
  || fail "the reveal destination is no longer a testable function; the handoff would be wiring nothing can reach"

# BOTH Finish controls, not one. Mission 2 has an interaction that settles by
# its own Finish and a near-transfer that settles by acknowledging the last
# question's feedback, and until B.2 only the first carried the learner to what
# their press revealed.
grep -Fq 'export function revealedByNearTransfer' "$NEAR_TRANSFER" \
  || fail "nothing detects the moment a near-transfer settles, so its Finish cannot hand focus on"
grep -Fq 'revealedByNearTransfer(step, before, after)' "$INSTRUCTION" \
  || fail "the near-transfer's Finish no longer hands focus to the step it revealed; a keyboard learner is returned to the top of the page and a screen-reader learner is told nothing"

# --- the UAT harness mounts the same lesson, with the same contract ---
#
# The harness is how the Architect and Founder see this mission before it is
# published, so a harness that drifted from the learner view would be reviewing
# something the learner never receives. It renders the SAME component, and the
# Mission 2 repair added a prop that component now requires.
grep -Fq '<MissionInstruction' "$HARNESS" \
  || fail "the UAT harness no longer mounts the lesson component the learner view mounts; rendered review would be looking at a different surface than the product"
grep -Fq 'instructionGeneration' "$HARNESS" \
  || fail "the UAT harness does not pass the lesson's rendering identity; it would either fail to compile or drift from the contract the learner view satisfies"

# --- a required activity the learner could never see is refused ---
#
# PROVE IT withholds a teaching-mode interaction entirely. A step that both
# waits for settlement and is withheld is a mission nobody can complete.
# The projection carries both contracts Mission 2 introduced. Dropping either
# would leave the authored fact in the document and absent from the lesson.
grep -Fq 'requiredForProgression' "$PROJECTION" \
  || fail "the learner projection drops the progression gate; the document would declare the activity required and the lesson would not wait"
grep -Fq 'alsoAtNodeIds' "$PROJECTION" \
  || fail "the learner projection drops the devices a stage also involves; d3's copy would light a wire and mark no device"

grep -Fq 'withholdsEntireInteraction' "$STEPS" \
  || fail "publication accepts a required interaction that is withheld entirely at its support level; the mission would be uncompletable and nothing would say so"

echo "PASS: 15. the Founder-UAT reconciliation rulings hold"

# ------------------------------------------------------------
# The suites that own the parsed content and the presentation
# ------------------------------------------------------------
echo ""
echo "--- running the Module 1 instructional suite (Mission 2's parsed content) ---"
npm run test --workspace @tlp/api -- networking-foundations-module1

echo ""
echo "--- running the course architecture suite ---"
npm run test --workspace @tlp/api -- networking-foundations.test

echo ""
echo "--- running the interaction and step contract suites ---"
npm run test --workspace @tlp/shared-types -- instruction-interaction mission-steps observation-model mission-instruction

# The parser that accepts Mission 2's authored stage traffic, simultaneous
# participants and progression gate. A key dropped from its whitelist rejects
# the mission at publication, and nothing above would say so.
echo ""
echo "--- running the curriculum document parser suite ---"
npm run test --workspace @tlp/api -- curriculum-document

# ## Why the journey presentation suite runs HERE
#
# `verify-wpj-m1.sh` runs the topology geometry suite and not this one. That was
# a real gap: Mission 2 is the only mission whose teaching depends on the
# ANNOUNCEMENT and the marker — one moment on several links, a device that
# receives a copy it does not accept, and a reply that has to stop being
# described as the outbound delivery. All of that lives in
# `packet-journey-presentation.ts`, and none of it is geometry.
echo ""
echo "--- running the journey presentation suite ---"
npm run test --workspace @tlp/web -- src/learning/packet-journey-presentation

echo ""
echo "--- running the topology geometry and near-transfer suites ---"
npm run test --workspace @tlp/web -- src/learning/topology-layout src/learning/near-transfer-presentation

# Completion authority. Mission 2 is the first mission whose journey holds the
# lesson back, so it is the first whose "Mark as complete" depends on a lesson
# reporting its own state — and the first that can be completed early if that
# report is read from the wrong instance.
# ## Why a MISSION 4 suite runs from the Mission 2 gate
#
# Mission 2 teaches the term MAC address, and CURR-009 section 12 holds that a
# term, once earned, is used rather than replaced by an invented substitute.
# Correcting Mission 2's model therefore forced a bounded repair in Mission 4,
# which had retreated to "factory identity" and "hardware identity".
#
# That makes Mission 4's continuity a DEPENDENCY of this repair, not a
# neighbouring mission's business. If the substitute vocabulary comes back, the
# gate that owns the sentence it contradicts should be the one that fails.
#
# The focused SUITE is run, not `verify-wpj-m4.sh`. Nesting a whole gate is an
# established shape in the ROAS and engine-completion families and is used by
# none of the WP-J mission gates, which delegate targeted suites instead. This
# follows the family it belongs to, and it does not duplicate Mission 4's own
# gate logic.
# The behavioural focus suite. This is the check that made the structural
# greps in section 15 secondary rather than sufficient: it observes
# `document.activeElement` after a real click, which nothing in this
# repository could do before jsdom was authorized.
echo ""
echo "--- running the DOM focus behaviour suite ---"
npm run test --workspace @tlp/web -- src/learning/mission-instruction-focus

echo ""
echo "--- running the Mission 4 MAC continuity suite ---"
npm run test --workspace @tlp/api -- networking-foundations-mission4

echo ""
echo "--- running the completion-authority suites ---"
npm run test --workspace @tlp/web -- src/learning/mission-instruction-presentation src/learning/roas-course-presentation

# ------------------------------------------------------------
# Advisory signals. These never fail CI.
# ------------------------------------------------------------
M2_STEPS="$(grep -c '"stableId": "m2-s' "$M2_BLOCK" || true)"
M2_STAGES="$(grep -c '"stageId"' "$M2_BLOCK" || true)"
M2_PREDICTIONS="$(grep -c '"prediction": {' "$M2_BLOCK" || true)"
M2_CHECKS="$(grep -c '"checkId"' "$M2_BLOCK" || true)"
M2_SIMULTANEOUS="$(grep -c '"alsoOnLinkIds"' "$M2_BLOCK" || true)"

echo ""
echo "--- advisory signals (never fail CI) ---"
printf 'ADVISORY: Mission 2 authored steps:          %s\n' "$M2_STEPS"
printf 'ADVISORY: journey stages:                    %s\n' "$M2_STAGES"
printf 'ADVISORY: learner predictions:               %s\n' "$M2_PREDICTIONS"
printf 'ADVISORY: knowledge checks:                  %s\n' "$M2_CHECKS"
printf 'ADVISORY: stages with simultaneous links:    %s\n' "$M2_SIMULTANEOUS"
printf 'ADVISORY: near-transfer questions:           %s\n' "$NT_QUESTIONS"
echo "ADVISORY: this is the mission the second Founder UAT round found hardest"
echo "ADVISORY: to follow. Whether the two passes now read as one comparison,"
echo "ADVISORY: whether being made to finish the activity feels like structure"
echo "ADVISORY: rather than being blocked, and whether the Printer's refused"
echo "ADVISORY: copy reads as normal rather than as a fault, are all Human UAT."
echo "ADVISORY: none of them can be counted."

cat <<'SUMMARY'

==========================================================
WP-J MISSION 2 INSTRUCTION VERIFIED

Mission 2 is authored as production curriculum that parses
through the real parser. One journey carries a local delivery
from PC-A to PC-B, a reply back, and a later delivery between
the same two hosts, and the learner must finish it before the
steps that explain it appear.

The prediction that asks what an unlearned destination
produces carries no answer key, because the learner cannot yet
know. The knowledge check that follows the reveal does carry
one, because by then they have been shown. The prediction on
the second pass carries one too, with a reason.

The Printer's refused copy is authored in two places — the
connection it crossed and the device it reached — so the
learner sees one moment in two places rather than a wire
lighting up toward a device showing nothing. The reply names
itself as what is moving, so the marker stops claiming the
original delivery is still in flight.

Every content assertion above reads a Mission 2 BLOCK. A fact
authored in another mission cannot satisfy any of them, which
is the defect this gate was created to stop repeating.

Mission 2 remains this work package's owner. Missions 3 and 4
carry a BOUNDED terminology repair, because Mission 2 now
teaches MAC address and leaving the next two missions on
"factory identity" would contradict it two missions later.
Mission 4's continuity suite runs from this gate for that
reason. Neither mission is reopened as its own work package,
and Missions 5 to 8 are untouched.

This gate proves AUTHORED STRUCTURE, absence and ordering.
It does NOT prove:
  - that the instruction teaches well; that is Human UAT
  - that the two passes read as one comparison
  - that being required to finish the activity feels like
    structure rather than an obstacle
  - that the refused copy reads as normal rather than broken
  - that either focus handoff is USABLE. That focus MOVES is
    now proved behaviourally: the DOM suite mounts the lesson
    in jsdom, drives both Finish controls through the real
    components and reads `document.activeElement`. jsdom is
    not a browser and runs no assistive technology, so
    announcement, focus visibility and whether the movement
    helps a learner remain Human UAT.
  - anything about a real browser rendering; none runs here
==========================================================
SUMMARY
