#!/usr/bin/env bash
#
# WP-NF-NT1 — the embedded near-transfer check.
#
# ## What this gate owns
#
# Two kinds of fact that a vitest suite in this repository cannot honestly
# assert.
#
# The first is MARKUP STRUCTURE. `apps/web` has no rendered-DOM harness, so
# "each question is a fieldset named by its prompt" cannot be checked by
# rendering one. It is checked by reading the component's source, which is the
# convention `verify-wpf.sh`, `verify-wph.sh` and `verify-wpi.sh` already
# follow, and it is honest about what it proves: that the markup is authored
# this way, not that a browser renders it so.
#
# The second is ARCHITECTURAL SEPARATION — that near-transfer did not quietly
# become an assessment, a packet journey, or a thing that talks to a service.
# Those are facts about which files import and mention what, which is exactly
# what a file-level gate can see and a unit test cannot.
#
# ## What this gate deliberately does NOT own
#
# Anything about parsed curriculum. Whether Mission 1's near-transfer sits
# after "Reading the topology", whether Question 1 has two correct answers,
# whether an option id resolves — all of that is asserted through the real
# parser in `services/api/src/networking-foundations-module1.test.ts`, because
# reading curriculum JSON with grep is a second parser wearing a disguise.
#
# ## Substring traps already paid for here
#
# `points` is a substring of the topology's own `endpoints`, and `attempt` is
# a substring of "attempted", which is the exact word the completion doctrine
# requires this feature to use. A sweep that cannot tell those apart is
# protecting a spelling rather than a rule, so the scans below strip comments
# first and use word boundaries.

set -euo pipefail

CONTRACT="packages/shared-types/src/near-transfer.ts"
CONTRACT_TESTS="packages/shared-types/src/near-transfer.test.ts"
PRESENTATION="apps/web/src/learning/near-transfer-presentation.ts"
PRESENTATION_TESTS="apps/web/src/learning/near-transfer-presentation.test.ts"
COMPONENT="apps/web/src/learning/NearTransferStep.tsx"
INSTRUCTION="apps/web/src/learning/MissionInstruction.tsx"
STEPS="packages/shared-types/src/mission-steps.ts"
PROJECTION="packages/shared-types/src/mission-instruction.ts"
PARSER="packages/shared-types/src/curriculum-document.ts"
LEDGER="docs/Project/DECISION_LEDGER.md"
MODEL="packages/shared-types/src/observation-model.ts"
LAYOUT="apps/web/src/learning/topology-layout.ts"
VIEW="apps/web/src/learning/TopologyView.tsx"
CONTROLS="apps/web/src/learning/roas-course-presentation.ts"
INSTRUCTION_PRESENTATION="apps/web/src/learning/mission-instruction-presentation.ts"
LEARNING_VIEW="apps/web/src/learning/LearningView.tsx"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-NF-NT1 EMBEDDED NEAR-TRANSFER GATE ====="
echo ""

for required in "$CONTRACT" "$CONTRACT_TESTS" "$PRESENTATION" \
                "$PRESENTATION_TESTS" "$COMPONENT" "$INSTRUCTION" "$STEPS" \
                "$PROJECTION" "$PARSER" "$LEDGER" "$MODEL" "$LAYOUT" "$VIEW" \
                "$CONTROLS" "$INSTRUCTION_PRESENTATION" "$LEARNING_VIEW"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

# The component with its prose stripped, so a rule reads CODE rather than the
# documentation that explains the rule.
#
# A state machine rather than a `sed` substitution, because every comment that
# matters here spans lines: the file header explaining that near-transfer
# produces no evidence, and the JSX `{/* ... */}` blocks explaining the
# scenario. A single-line substitution leaves all of that in the scan, and the
# gate then fails on its own documentation.
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
#
# `verify-wpj-m4.sh` carries the same net, for a reason this repository has
# already paid for once: a stray byte made grep treat a source file as binary,
# and every absence check below would have passed while reading zero bytes.
strip_checked() {
  strip_comments "$1" > "$2"

  if [ -s "$1" ] && [ ! -s "$2" ]; then
    fail "stripping $1 produced nothing, but the file is not empty — every absence check reading it would pass while examining no code"
  fi
}

CODE="$SCAN_DIR/component-code.tsx"
strip_checked "$COMPONENT" "$CODE"

CONTRACT_CODE="$SCAN_DIR/contract-code.ts"
strip_checked "$CONTRACT" "$CONTRACT_CODE"

PRESENTATION_CODE="$SCAN_DIR/presentation-code.ts"
strip_checked "$PRESENTATION" "$PRESENTATION_CODE"

# ------------------------------------------------------------
# 1. The step type exists in the closed vocabulary
# ------------------------------------------------------------
grep -Fq '"near_transfer"' "$STEPS" \
  || fail "near_transfer is not in MISSION_STEP_TYPES; the capability is unreachable from curriculum"

grep -Fq 'near_transfer' "$PARSER" \
  || fail "the document parser has no key list for near_transfer, so every authored field would be rejected as unknown"

grep -Fq 'case "near_transfer"' "$PROJECTION" \
  || fail "the learner projection does not handle near_transfer"

grep -Fq 'case "near_transfer"' "$INSTRUCTION" \
  || fail "MissionInstruction does not render near_transfer, so an authored check would vanish from the lesson"

# ------------------------------------------------------------
# 2. The answer is split out of the question in the projection
# ------------------------------------------------------------
# The one structural thing standing between a renderer drawing a question and
# that renderer having the answer in hand. `LearnerNearTransferQuestion` has no
# answer field at all, so reading one is a compile error rather than a leak.
grep -Fq 'The question, without its answer.' "$PROJECTION" \
  || fail "the projection no longer separates the question from its answer"

# Read from stripped CODE, and matched on the field rather than the word.
#
# This was `grep -Fq 'answers' "$PROJECTION"` against the raw file, which the
# checkpoint audit found could never fail: "answers" appears in ordinary prose
# throughout that module. A guard a comment satisfies is not a guard.
PROJECTION_CODE="$SCAN_DIR/projection-code.ts"
strip_checked "$PROJECTION" "$PROJECTION_CODE"

grep -Fq 'answers: Object.fromEntries(' "$PROJECTION_CODE" \
  || fail "the projection no longer builds a separate answers map; the answer would ride along on the question"

# The component must never reach the answers directly. Its only route to one is
# `resolveQuestion`, which returns null until the learner has committed.
grep -Fq 'content.answers' "$CODE" \
  && fail "$COMPONENT reads the authored answers directly; the only permitted route is resolveQuestion, which withholds them until commitment"

grep -Fq 'resolveQuestion(content, state, answered)' "$CODE" \
  || fail "$COMPONENT no longer resolves through resolveQuestion"

# ------------------------------------------------------------
# 3. Accessibility structure
# ------------------------------------------------------------
# Structural, and each one is a thing a screen-reader user loses entirely if
# it goes. This repository has no DOM harness; reading the source is what it
# has, and saying so is better than asserting nothing.
grep -Fq '<fieldset>' "$CODE" \
  || fail "questions are no longer grouped in a fieldset, so a screen reader announces four loose controls"

grep -Fq '<legend>{question.prompt}</legend>' "$CODE" \
  || fail "the question prompt is no longer the fieldset's legend, so the group is announced without its question"

grep -Fq 'type={multiple ? "checkbox" : "radio"}' "$CODE" \
  || fail "the controls are no longer native checkboxes and radios; platform arrow and space behaviour would be lost"

grep -Fq '<label htmlFor={inputId}>' "$CODE" \
  || fail "choices are no longer bound to real labels"

grep -Fq 'aria-live="polite"' "$CODE" \
  || fail "the resolution is no longer announced, so a screen-reader learner is told nothing after answering"

grep -Fq '{resolution.verdict}' "$CODE" \
  || fail "the verdict is no longer rendered as a word; correctness would depend on colour"

grep -Fq '{content.topology.textEquivalent}' "$CODE" \
  || fail "the topology's authored text equivalent is no longer rendered, leaving the relationships in pixels only"

# ------------------------------------------------------------
# 4. It is instruction, not assessment
# ------------------------------------------------------------
# Word boundaries, and comments already stripped. `points` lives inside the
# topology's own `endpoints`, and `attempt` inside "attempted" — the word the
# completion doctrine requires. Matching either would train the next author to
# work around the gate rather than to keep the rule.
for forbidden in score scores percent percentage streak points passingPercent \
                 maxAttempts mastery evidence competencyStableId; do
  grep -qE "(^|[^A-Za-z0-9_])$forbidden([^A-Za-z0-9_]|\$)" "$CODE" \
    && fail "$COMPONENT emits \"$forbidden\"; a near-transfer check produces no score, no attempt and no evidence"
done

for forbidden in score percentage passingPercent maxAttempts mastery \
                 competencyStableId attemptId; do
  grep -qE "(^|[^A-Za-z0-9_])$forbidden([^A-Za-z0-9_]|\$)" "$CONTRACT_CODE" \
    && fail "$CONTRACT declares \"$forbidden\"; the near-transfer contract must have nowhere to record a result"
done

# ------------------------------------------------------------
# 5. It reaches no service and consults no model
# ------------------------------------------------------------
# Correctness is authored truth compared in one function. If any of these
# appear, something is being asked instead of being read.
for forbidden in 'fetch(' 'useEffect' 'apiClient' 'await ' 'AIProvider' \
                 'generate' 'completion('; do
  grep -Fq "$forbidden" "$CODE" \
    && fail "$COMPONENT contains \"$forbidden\"; answering a near-transfer check must reach nothing and record nothing"
done

grep -Fq 'isNearTransferAnswerCorrect' "$PRESENTATION_CODE" \
  || fail "the browser no longer decides correctness through the shared authored rule"

# ------------------------------------------------------------
# 6. The static topology is not a packet journey
# ------------------------------------------------------------
# The ruling was explicit: do not fabricate a journey to obtain a diagram. The
# existing layout is reused with an observation model that has no stages, so
# no device is current, no wire is traversed and no marker is drawn.
grep -Fq 'buildTopologyLayout' "$PRESENTATION_CODE" \
  || fail "the static topology no longer reuses the existing layout; a second topology renderer is a second answer to what a network looks like"

grep -Fq 'stages: []' "$PRESENTATION_CODE" \
  || fail "the static topology's observation model declares stages; a near-transfer scenario is a network at rest, not a journey with the motion removed"

grep -Fq 'currentStageId: null' "$PRESENTATION_CODE" \
  || fail "the static topology names a current stage"

grep -Fq 'consequence: null' "$PRESENTATION_CODE" \
  || fail "the static topology carries a consequence, which only a journey can have"

for forbidden in 'PacketJourney' 'packet_journey' 'InteractionSurface'; do
  grep -Fq "$forbidden" "$PRESENTATION_CODE" \
    && fail "$PRESENTATION references \"$forbidden\"; near-transfer must not be built on packet-journey architecture"
done

# ------------------------------------------------------------
# 7. It is not PracticeCheckPanel
# ------------------------------------------------------------
# The architectural ruling in the work package. Practice carries a standing,
# separately verified promise about what it does not do; near-transfer must not
# be able to change that promise by sharing its surface.
for forbidden in 'PracticeCheckPanel' 'AssessmentDefinition' 'assessmentStableId'; do
  grep -Fq "$forbidden" "$CODE" \
    && fail "$COMPONENT reaches into \"$forbidden\"; near-transfer is Curriculum Instruction and practice is not"
done

# ------------------------------------------------------------
# 8. Whatever follows a check waits for it
# ------------------------------------------------------------
# ATTEMPTED, never passed. The rule counts commitments, so a learner who was
# wrong every time reaches the handoff exactly as one who was right does. If
# this ever becomes a threshold, the threshold is the defect.
grep -Fq 'visibleInstructionSteps' "$INSTRUCTION" \
  || fail "MissionInstruction renders every step regardless of the near-transfer check, so a mission's closing handoff would answer the activity's question before the learner attempted it"

grep -Fq 'ATTEMPTED, not passed' "$PRESENTATION" \
  || fail "the completion rule no longer records that it counts attempts rather than correct answers"

# ------------------------------------------------------------
# 9. The decision is recorded
# ------------------------------------------------------------
grep -Fq 'WP-NF-NT1' "$LEDGER" \
  || fail "the decision ledger does not record the eighth step type"

# ------------------------------------------------------------
# 10. WP-NF-NT1B — a network past the edge of the drawing
# ------------------------------------------------------------
# The defect: Mission 1's near-transfer asked which device connects the local
# network to another network, and the only thing that answered it was a
# sentence. A sighted beginner had to read prose to find a topology fact.
grep -Fq 'ObservationExternalNetwork' "$MODEL" \
  || fail "the observation model can no longer carry a network past the edge of the drawing; the fact would return to prose only"

grep -Fq 'externalNetworks' "$LAYOUT" \
  || fail "the layout no longer places a network past the edge of the drawing"

grep -Fq 'layout.externalNetworks.map' "$VIEW" \
  || fail "$VIEW no longer draws the declared external networks"

# It must never become a device. Everything that reasons about traffic
# iterates `devices` and `links`, and a network in either could acquire journey
# state, be arrived at, or be offered as an answer to "which device…".
grep -Fq '"network"' "$MODEL" \
  && fail "a network past the edge became a node ROLE; it is not a device, and a device category is where it would start being drawn as one"

grep -Fq 'also has a line to' "$LAYOUT" \
  || fail "the arrangement description no longer states the external connection, so the picture would carry a relationship the words do not"

# ------------------------------------------------------------
# 11. WP-NF-NT1B — required instruction gates completion
# ------------------------------------------------------------
# The other half of the same defect: the lesson withheld its closing steps and
# the separate completion control did not, so the required activity could be
# skipped outright.
grep -Fq 'RequiredInstructionState' "$INSTRUCTION_PRESENTATION" \
  || fail "the generic required-instruction state is gone"

grep -Fq 'requiredInstruction' "$CONTROLS" \
  || fail "the mission completion control no longer reads whether required inline instruction is outstanding; a learner could mark a mission complete without doing it"

grep -Fq 'onRequiredInstructionChange' "$INSTRUCTION" \
  || fail "the lesson no longer reports its required-instruction state upward"

grep -Fq 'onRequiredInstructionChange' "$LEARNING_VIEW" \
  || fail "the learning view no longer connects the lesson's state to the completion control"

# NEVER PASSED. If correctness ever becomes a threshold, the threshold is the
# defect: a learner who answered every question wrongly has done the work and
# finishes exactly as anyone else does.
grep -Fq 'ATTEMPTED, not passed' "$PRESENTATION" \
  || fail "the completion rule no longer records that correctness is not what it counts"

grep -Fq 'Finish all required activities before marking this mission complete.' \
     "$INSTRUCTION_PRESENTATION" \
  || fail "the exact approved explanation is gone; correctness is not the gate and the wording must not imply it is"

# Eligibility waits for the activity to be FINISHED, not merely answered
# (Architect ruling). No gate greps these identifiers otherwise, and the two
# predicates differ by one word — which is exactly the kind of choice mutation
# testing has already caught drifting in this feature twice.
grep -Fq 'return isSettled(' "$PRESENTATION_CODE" \
  || fail "requiredNearTransfer no longer reads isSettled; completion would become available while the final feedback is still on screen"

grep -Fq 'return isComplete(' "$PRESENTATION_CODE" \
  || fail "attemptedNearTransfer no longer reads isComplete; the \"answer the questions above\" notice would key on the wrong state"

# And the two must not be collapsed back into one. The notice asks whether
# anything is UNANSWERED; eligibility asks whether the activity is FINISHED.
# A notice that delegated to the eligibility predicate would fire for a
# learner who had answered everything and was reading the last explanation.
grep -Fq 'return attemptedNearTransfer(blocking, states) === false;' "$PRESENTATION_CODE" \
  || fail "the notice no longer reads the attempted predicate directly; delegating to requiredNearTransfer would restore the stale \"answer the questions above\" under the final feedback"

# The lesson's own "answer the questions" notice is about UNANSWERED
# questions, and not about steps that happen to be hidden. Those were the same
# flag until Founder video UAT: after committing the last answer the learner
# read a verdict, an explanation and a Finish button, and underneath them a
# sentence telling them to answer the questions they had just answered.
#
# Asserted here because `MissionInstruction.tsx` has no rendered-DOM harness,
# so nothing else can fail when the component is wired back to the length
# comparison. Mutation testing found exactly that hole.
INSTRUCTION_CODE="$SCAN_DIR/mission-instruction-code.tsx"
strip_checked "$INSTRUCTION" "$INSTRUCTION_CODE"

grep -Fq 'hasUnattemptedInstruction(steps, nearTransfer)' "$INSTRUCTION_CODE" \
  || fail "MissionInstruction no longer asks whether questions are UNANSWERED before showing the notice; a stale \"answer the questions above\" would return under the final feedback"

grep -Fq 'visible.length < steps.length' "$INSTRUCTION_CODE" \
  && fail "the notice is gated on steps being hidden again; hidden covers both unanswered questions and feedback still on screen, and only the first is something a learner can act on"

grep -Fq 'hasUnattemptedInstruction' "$PRESENTATION_CODE" \
  || fail "the notice predicate is gone from the presentation module; inline in the component it cannot be tested"

for forbidden in 'Pass the questions' 'get the questions correct' \
                 'Answer them correctly'; do
  grep -Fq "$forbidden" "$INSTRUCTION_PRESENTATION" \
    && fail "the completion explanation says \"$forbidden\"; correctness is not the gate"
done

# The completion path must stay generic. It may know that required inline
# instruction is outstanding; it may not know what the activity was.
CONTROLS_CODE="$SCAN_DIR/controls-code.ts"
strip_checked "$CONTROLS" "$CONTROLS_CODE"

for forbidden in 'near_transfer' 'NearTransfer' 'Laptop-A' 'Switch-2' \
                 'Router-2' 'questionStableId' 'nf-m1'; do
  grep -Fq "$forbidden" "$CONTROLS_CODE" \
    && fail "$CONTROLS knows about \"$forbidden\"; the completion control is told a state and never what the instruction was"
done

# And it must not have acquired the authority it is deliberately without.
for forbidden in 'AssessmentAttempt' 'recordAttempt' 'evidence' 'competency' \
                 'passingPercent' 'mastery'; do
  grep -qiE "(^|[^A-Za-z0-9_])$forbidden([^A-Za-z0-9_]|\$)" "$CONTROLS_CODE" \
    && fail "$CONTROLS references \"$forbidden\"; instructional completion creates no attempt, no evidence and no competency state"
done

# ------------------------------------------------------------
# 12. Founder video UAT — the near-transfer controls
# ------------------------------------------------------------
# These rendered as default browser buttons in an otherwise styled
# application. They now carry the instructional surface's own primary control
# classes. Presentation only: still native <button> elements, so type,
# disabled state, keyboard operation and the shared focus ring are the
# platform's and are untouched.
STYLES="apps/web/src/styles.css"
[ -f "$STYLES" ] || fail "missing required file: $STYLES"

for control in 'near-transfer-submit' 'near-transfer-advance'; do
  grep -Fq "$control" "$CODE" \
    || fail "$COMPONENT no longer applies the $control class; the controls would fall back to browser defaults"
  grep -Fq ".$control" "$STYLES" \
    || fail "$STYLES declares no rule for .$control; the class would style nothing"
done

# Native controls, not div-buttons. The class is a paint job and may never
# become a substitute for the element.
grep -Fq 'type="submit"' "$CODE" \
  || fail "the commit control is no longer a submit button"
grep -Fq 'type="button"' "$CODE" \
  || fail "the advance control is no longer a native button"
grep -Fq 'disabled={!canCommit(' "$CODE" \
  || fail "the commit control no longer carries a real disabled state"

# The wording is the Architect's and is not this gate's to change.
for label in 'Submit answer' 'Next question' 'Finish' 'Select all that apply.'; do
  grep -Fq "$label" "$PRESENTATION" "$CODE" \
    || fail "the approved control wording \"$label\" is gone"
done

# ------------------------------------------------------------
# 13. Founder video UAT — the question counter
# ------------------------------------------------------------
# It counted commitments, so submitting advanced the number while that same
# answer's feedback was still the only thing on screen. It now reads the same
# active question the rest of the activity is built from, and disappears when
# there is no question to count.
grep -Fq 'activeQuestionIndex(step, state)' "$PRESENTATION_CODE" \
  || fail "describeProgress no longer reads the active question; the counter can disagree with the screen again"

grep -Fq 'progress !== null' "$CODE" \
  || fail "$COMPONENT renders the counter unconditionally; an orphaned count would sit above the mission handoff after Finish"

# ------------------------------------------------------------
# 14. The suites that own the parsed content actually run
# ------------------------------------------------------------
echo "--- the generic contract ---"
npm --prefix packages/shared-types run test -- src/near-transfer.test.ts

echo ""
echo "--- the presentation rules ---"
npm --prefix apps/web run test -- src/learning/near-transfer-presentation.test.ts

echo ""
echo "--- the drawing, and what gates completion ---"
npm --prefix apps/web run test -- src/learning/topology-layout src/learning/mission-instruction-presentation src/learning/roas-course-presentation

echo ""
echo "GATE PASS: WP-NF-NT1 embedded near-transfer, with WP-NF-NT1B completion and topology"
