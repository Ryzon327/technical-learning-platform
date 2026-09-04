#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# WP-H COMPLETION GATE — instructional interaction registry,
# observation model seam, and the teaching Packet Journey.
#
# ## What this gate is for
#
# The WP-H suites prove behaviour: what validates, what is withheld, what the
# observation model says. They cannot prove ABSENCE across the package — that
# no renderer computes forwarding, that no execution path was opened, that the
# accessible representation is the primary one rather than a second simulation.
# Those are properties of the source, and this is where they are checked.
#
# ## Deliberately not brittle
#
# Every check tests a property, not a formatting choice. Nothing here fails on
# whitespace, prop order or where a comment sits.
#
# ## Absence checks judge comment-stripped code
#
# Several comments name `eval`, `routing` and `dangerouslySetInnerHTML`
# precisely in order to say they are absent.
#
# ## No pipelines into grep
#
# Under `set -o pipefail`, `echo "$BIG" | grep -q` can return 141 when grep
# exits on an early match while echo is still writing — an absence check then
# reads a real hit as clean. Every check greps a FILE.
# ============================================================

REGISTRY="packages/shared-types/src/instruction-interaction.ts"
MODEL="packages/shared-types/src/observation-model.ts"
STEPS="packages/shared-types/src/mission-steps.ts"
PROJECTION="packages/shared-types/src/mission-instruction.ts"
DOCUMENT="packages/shared-types/src/curriculum-document.ts"
PRESENTATION="apps/web/src/learning/packet-journey-presentation.ts"
JOURNEY="apps/web/src/learning/PacketJourney.tsx"
SURFACE="apps/web/src/learning/InteractionSurface.tsx"
# WP-I correction. The drawing is part of the frontend this gate scans: a
# topology renderer is exactly where a second networking model would be written,
# so it is held to the same absence checks as everything else here.
LAYOUT="apps/web/src/learning/topology-layout.ts"
TOPOLOGY="apps/web/src/learning/TopologyView.tsx"
DEVICE="apps/web/src/learning/DeviceNode.tsx"
RENDERER="apps/web/src/learning/MissionInstruction.tsx"
STYLES="apps/web/src/styles.css"
FIXTURE="content/fixtures/curriculum-architecture-example.json"
SELECTOR="scripts/ci-select-gates.sh"
PROVIDER="packages/shared-types/src/labs.ts"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-H INSTRUCTIONAL INTERACTION GATE ====="
echo ""

for required in "$REGISTRY" "$MODEL" "$STEPS" "$PROJECTION" "$DOCUMENT" \
                "$PRESENTATION" "$JOURNEY" "$SURFACE" "$RENDERER" "$STYLES" \
                "$FIXTURE" "$SELECTOR" "$PROVIDER" "$LAYOUT" "$TOPOLOGY" \
                "$DEVICE"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

REGISTRY_LOGIC="$SCAN_DIR/registry-logic.txt"
MODEL_LOGIC="$SCAN_DIR/model-logic.txt"
PRESENTATION_LOGIC="$SCAN_DIR/presentation-logic.txt"
JOURNEY_LOGIC="$SCAN_DIR/journey-logic.txt"
SURFACE_LOGIC="$SCAN_DIR/surface-logic.txt"
LAYOUT_LOGIC="$SCAN_DIR/layout-logic.txt"
TOPOLOGY_LOGIC="$SCAN_DIR/topology-logic.txt"
DEVICE_LOGIC="$SCAN_DIR/device-logic.txt"
DRAWING_LOGIC="$SCAN_DIR/drawing-logic.txt"
FRONTEND_LOGIC="$SCAN_DIR/frontend-logic.txt"
WPH_LOGIC="$SCAN_DIR/wph-logic.txt"

# Comment-stripped source, for the absence checks below.
#
# ## Why this refuses to return nothing
#
# Every absence check in this gate asks "does this pattern appear in the code?"
# and passes when it does not. That question is only meaningful if the scan
# actually contains the code — an EMPTY scan answers "no" to every pattern and
# passes everything, while examining nothing at all.
#
# That was not hypothetical. One stray NUL byte in `topology-layout.ts` made
# grep classify the whole file as binary, so this function returned zero bytes
# and `$LAYOUT_LOGIC` was empty. Every check reading it — including "the layout
# searches the link list for a path", the single most important assertion this
# gate makes about the drawing — passed while scanning an empty file.
#
# A non-empty source that scans to nothing is therefore a GATE FAILURE, not a
# silent pass. The failure is loud and names the file, because the cause is
# always something about the file itself rather than about the checks.
code_of() {
  local source="$1"
  local scanned
  scanned="$(grep -vE '^\s*(//|\*|/\*|--)' "$source" || true)"

  if [ -s "$source" ] && [ -z "$scanned" ]; then
    fail "scanning $source produced nothing, but the file is not empty — every absence check reading it would pass while examining no code (a stray non-text byte makes grep treat a source file as binary)"
  fi

  printf '%s\n' "$scanned"
}

code_of "$REGISTRY" > "$REGISTRY_LOGIC"
code_of "$MODEL" > "$MODEL_LOGIC"
code_of "$PRESENTATION" > "$PRESENTATION_LOGIC"
code_of "$JOURNEY" > "$JOURNEY_LOGIC"
code_of "$SURFACE" > "$SURFACE_LOGIC"
code_of "$LAYOUT" > "$LAYOUT_LOGIC"
code_of "$TOPOLOGY" > "$TOPOLOGY_LOGIC"
code_of "$DEVICE" > "$DEVICE_LOGIC"

cat "$LAYOUT_LOGIC" "$TOPOLOGY_LOGIC" "$DEVICE_LOGIC" > "$DRAWING_LOGIC"
cat "$PRESENTATION_LOGIC" "$JOURNEY_LOGIC" "$SURFACE_LOGIC" "$DRAWING_LOGIC" \
  > "$FRONTEND_LOGIC"
cat "$REGISTRY_LOGIC" "$MODEL_LOGIC" "$FRONTEND_LOGIC" > "$WPH_LOGIC"

# ------------------------------------------------------------
# 1. One authoritative registry, with a closed vocabulary
# ------------------------------------------------------------
grep -Fq 'export const INTERACTION_TYPES' "$REGISTRY" \
  || fail "there is no closed interaction type vocabulary"
grep -Fq '"packet_journey"' "$REGISTRY" \
  || fail "packet_journey is not registered"
grep -Fq 'export function validateInteractionContent' "$REGISTRY" \
  || fail "there is no shared interaction validator"

# CURR-011 s7: the vocabulary and parameter contract are SHARED, and the
# application only maps an already-validated type to a component. A second
# vocabulary in the browser would be frontend-created curriculum.
if grep -qF 'INTERACTION_TYPES =' "$FRONTEND_LOGIC"; then
  fail "the frontend declares its own interaction vocabulary"
fi

echo "PASS:  1. one closed, shared interaction registry"

# ------------------------------------------------------------
# 2. Parameters are typed, never an arbitrary bag
# ------------------------------------------------------------
# DEC-054 / CURR-011 s13: an untyped payload is the escape hatch the closed
# step vocabulary exists to prevent.
if grep -qE 'InteractionParameters\s*=\s*Record<' "$REGISTRY_LOGIC"; then
  fail "interaction parameters are an untyped record"
fi
for forbidden in 'parameters: unknown' 'parameters: any' '[key: string]:'; do
  if grep -qF -e "$forbidden" "$REGISTRY_LOGIC"; then
    fail "the interaction contract admits arbitrary parameters: $forbidden"
  fi
done

# Unknown keys must be rejected, at every depth, like WP-G's document parser.
grep -Fq 'carries an unknown field' "$REGISTRY" \
  || fail "the interaction validator tolerates unknown fields"

echo "PASS:  2. interaction parameters are a typed, strictly-parsed contract"

# ------------------------------------------------------------
# 3. The step model carries the registry, and is not a second copy of it
# ------------------------------------------------------------
grep -Fq 'validateInteractionContent' "$STEPS" \
  || fail "the mission step validator does not delegate to the registry"
grep -Fq 'interactionType' "$STEPS" \
  || fail "the step model carries no registry type"

# Two identifiers doing two jobs (Architect decision 2).
grep -Fq 'interactionStableId' "$STEPS" \
  || fail "the step model lost the interaction instance identity"

# The document parser must admit the new keys without restating the contract.
grep -Fq 'interactionType' "$DOCUMENT" \
  || fail "the document parser rejects the registry type key"
grep -Fq 'parameters' "$DOCUMENT" \
  || fail "the document parser rejects the parameters key"
if grep -qF 'validatePacketJourneyParameters' "$DOCUMENT"; then
  fail "the document parser restates the packet journey contract"
fi

echo "PASS:  3. the step model and document parser reuse the registry"

# ------------------------------------------------------------
# 4. The observation model seam exists and is what the renderer consumes
# ------------------------------------------------------------
grep -Fq 'export interface ObservationModel' "$MODEL" \
  || fail "there is no shared ObservationModel"
grep -Fq 'ObservationSourceKind' "$MODEL" \
  || fail "the model carries no source discriminator"
grep -Fq 'unavailableObservationModel' "$MODEL" \
  || fail "there is no fail-closed unavailable model"

# CURR-011 s8: the renderer consumes the ObservationModel, never authored
# parameters directly. The presentation module is where that is enforced.
grep -Fq 'buildPacketJourneyObservationModel' "$PRESENTATION" \
  || fail "the presentation does not build the shared observation model"

# The component must not reach past the presentation into the shared builder,
# which would be a second place the model is constructed.
if grep -qF 'buildPacketJourneyObservationModel' "$JOURNEY_LOGIC"; then
  fail "the component builds its own observation model"
fi

echo "PASS:  4. the renderer consumes the shared observation model"

# ------------------------------------------------------------
# 5. No second networking truth model, anywhere
# ------------------------------------------------------------
# CURR-011 s10.1 and the Architect decision list. The visualization must never
# compute what the deterministic validator owns.
for forbidden in routingTable computeRoute nextHop calculateSubnet subnetMask \
                 netmask parseAddress inet_aton cidrToMask macLearning \
                 spanningTree arpTable resolveArp isReachable \
                 computeForwarding vlanForward; do
  if grep -qF -e "$forbidden" "$WPH_LOGIC"; then
    fail "WP-H implements networking truth: $forbidden"
  fi
done

# Bitwise arithmetic is how an address calculator is written. There is no
# legitimate reason for one in an interaction that renders authored outcomes.
if grep -qE '>>>|<<[^=]|[^&]&[^&]|\|\s*0\b' "$WPH_LOGIC"; then
  fail "WP-H performs bitwise arithmetic; addresses are authored text"
fi

echo "PASS:  5. no routing, switching, VLAN or subnet computation exists"

# ------------------------------------------------------------
# 6. Authored content stays inert
# ------------------------------------------------------------
for forbidden in dangerouslySetInnerHTML 'eval(' 'new Function' innerHTML \
                 outerHTML document.write createElement 'import(' \
                 setTimeout setInterval; do
  if grep -qF -e "$forbidden" "$WPH_LOGIC"; then
    fail "WP-H opens an execution, markup or timing path: $forbidden"
  fi
done

# The parameters carry no credential, live endpoint or provider identity (s13).
#
# Matched as FIELD names, not as substrings. A link's `endpoints` is two
# interface identifiers and is exactly the topology this interaction is for;
# an `endpoint:` would be somewhere to reach. The distinction is the colon.
for forbidden in 'credential' 'password' 'accessToken' 'endpoint:' \
                 'providerId' 'sessionId' 'apiKey' 'secret'; do
  if grep -qF -e "$forbidden" "$REGISTRY_LOGIC"; then
    fail "the interaction contract admits a field it must never carry: $forbidden"
  fi
done

# Safety is inertness, never pattern matching against code-like strings. A
# validator that rejected markup would make the platform unable to teach its
# own subject (CURR-011 s13, CURR-010 s10).
if grep -qE '(script|<[a-z]+>|onerror|javascript:).*(test\(|includes\(|match\()' "$REGISTRY_LOGIC"; then
  fail "the interaction validator pattern-matches instructional content"
fi

echo "PASS:  6. interaction content is inert and is never keyword-filtered"

# ------------------------------------------------------------
# 7. Withholding is server-side and structural
# ------------------------------------------------------------
grep -Fq 'withholdsEntireInteraction' "$PROJECTION" \
  || fail "the projection does not apply whole-interaction withholding"
grep -Fq 'withholdsAnswerRevealingContent' "$PROJECTION" \
  || fail "the projection does not apply answer-revealing withholding"

# The client must not decide what may be SEEN. A protected-level comparison in
# the browser would be a control the browser still holds.
#
# WP-I correction, and the distinction is the whole point of this check:
#
#   SEQUENCING  — how much a learner is asked to do before the next authored
#                 observation. The client owns it over content the server has
#                 already authorised and already sent (CURR-011 s7, DEC-059,
#                 Architect decision 11), and it is what makes SHOW ME, HELP ME
#                 and ASK ME three different experiences rather than one.
#   ENFORCEMENT — deciding what may be sent at all. Server-side, always.
#
# So the three levels that withhold NOTHING may be named in the frontend, and
# the two that protect content may not. That is not a weakening: at a protected
# level the answer-bearing fields are absent from the payload, so there is
# nothing in the browser for any branch to reveal. Naming one there could only
# ever be an attempt to enforce, which is what this refuses.
for forbidden in withholdsEntireInteraction withholdsAnswerRevealingContent \
                 'prove_it' 'challenge_me'; do
  if grep -qF -e "$forbidden" "$FRONTEND_LOGIC"; then
    fail "the frontend enforces a support level: $forbidden"
  fi
done

# And the sequencing decision must be an ALLOWLIST with a strict default, so
# that adding a protected level to the shared contract can never loosen the
# client by falling through to the permissive arm.
grep -Fq 'export function resolveSequencing' "$PRESENTATION" \
  || fail "there is no single place where sequencing is decided"
grep -Fq 'return "commit_first"' "$PRESENTATION" \
  || fail "sequencing has no strict default arm"

# Answer-revealing authored fields must never reach a learner type.
for forbidden in expectedOptionIndex correctOption answerKey isCorrect; do
  if grep -qF -e "$forbidden" "$WPH_LOGIC"; then
    fail "an answer key exists in the interaction contract: $forbidden"
  fi
done

# --- 7b. Answer-BEARING content is withheld, not merely undrawn -------
#
# The architecture-review correction. Every authored action names whether it
# resolves the fault (`resolvesFault`) and what it produces (`observation`),
# and the confirmation states the conclusion. Forwarding those and relying on
# the interface not to draw them is not withholding: the response is readable.
#
# So both must be CONDITIONAL in the projection, and OPTIONAL on the learner
# type — absence is the mechanism.
grep -Fq 'withhold ? {} : { actions:' "$PROJECTION" \
  || fail "the projection forwards authored remediation unconditionally"
grep -Fq 'withhold ? {} : { confirmation:' "$PROJECTION" \
  || fail "the projection forwards the authored conclusion unconditionally"

grep -Fq 'readonly actions?:' "$REGISTRY" \
  || fail "the learner parameter type cannot express withheld remediation"
grep -Fq 'readonly confirmation?:' "$REGISTRY" \
  || fail "the learner parameter type cannot express a withheld conclusion"

# The answer key must not be reachable from the browser at all, so the
# frontend can neither read it nor rebuild a consequence from it.
if grep -qF 'resolvesFault' "$FRONTEND_LOGIC"; then
  fail "the frontend reads the authored answer key"
fi

# Nor may it reconstruct one. A locally-derived "was that right" is the same
# leak by another route.
for forbidden in 'isCorrectAction' 'wasCorrect' 'checkAnswer' 'guessOutcome' \
                 'inferOutcome' 'deriveConsequence'; do
  if grep -qF -e "$forbidden" "$FRONTEND_LOGIC"; then
    fail "the frontend reconstructs a withheld answer: $forbidden"
  fi
done

echo "PASS:  7. support levels are enforced server-side, by absence"
echo "PASS:  7b. answer-bearing content is absent from the response, not undrawn"

# ------------------------------------------------------------
# 8. Teaching mode produces no evidence
# ------------------------------------------------------------
# DEC-058: authored simulation produces no competency evidence. The guarantee
# is structural — there is no field, and no writer.
#
# Matched on implementation signals only: a competency FIELD, an evidence
# writer, or a table. The words "competency" and "evidence" also appear in the
# learner-facing notice that TELLS a learner this is not recorded, and failing
# on that would punish the code for making the guarantee visible — the same
# reasoning verify-wpg.sh applies to its re-versioning check.
for forbidden in competencyStableId competencyId evidenceId awardCompetency \
                 student_competency_state evidence_records recordProgress \
                 recordMissionProgress assessment_attempts createEvidence; do
  if grep -qF -e "$forbidden" "$WPH_LOGIC"; then
    fail "WP-H reaches competency or evidence: $forbidden"
  fi
done

# No field on the interaction contract may carry a verdict either.
#
# Matched with the field colon. "underscore" contains "score", and a bare
# substring check would fail the stable-id grammar message for saying which
# characters an identifier may use.
for forbidden in 'score:' 'passed:' 'grade:' 'mark:'; do
  if grep -qF -e "$forbidden" "$REGISTRY_LOGIC"; then
    fail "the interaction contract carries a verdict field: $forbidden"
  fi
done

echo "PASS:  8. no interaction can produce competency or evidence"

# ------------------------------------------------------------
# 9. Live mode is a seam, not an implementation
# ------------------------------------------------------------
grep -Fq 'live_lab' "$MODEL" \
  || fail "the source discriminator has no live seam"
grep -Fq 'WP-K' "$REGISTRY" \
  || fail "a live interaction is not refused with its reason"

# No provider contact of any kind, and no LabProvider change.
for forbidden in LabProvider runValidationProbe getConnection provision \
                 lab_sessions labProvider; do
  if grep -qF -e "$forbidden" "$WPH_LOGIC"; then
    fail "WP-H reaches the Lab Engine: $forbidden"
  fi
done

# The provider contract must still carry exactly its approved methods.
grep -Fq 'runValidationProbe(sessionId: string, probeId: string)' "$PROVIDER" \
  || fail "the LabProvider validation probe signature changed"
if grep -qE 'getObservations|readState|observe\(' "$PROVIDER"; then
  fail "WP-H extended the LabProvider contract; that is WP-K's decision"
fi

echo "PASS:  9. live mode is declared, refused, and unimplemented"

# ------------------------------------------------------------
# 10. AI is nowhere near interaction truth
# ------------------------------------------------------------
for forbidden in 'aiGateway' 'AIProvider' 'generateExplanation' \
                 'openai' 'anthropic' 'completion' 'llm'; do
  if grep -qF -e "$forbidden" "$WPH_LOGIC"; then
    fail "WP-H involves AI in interaction truth: $forbidden"
  fi
done

echo "PASS: 10. AI is absent from the interaction path"

# ------------------------------------------------------------
# 11. The accessible representation is the primary one
# ------------------------------------------------------------
# CURR-011 s14: the learner performs the task, not merely reads about it.
grep -Fq 'aria-live' "$JOURNEY" \
  || fail "meaningful progression is not announced"
grep -Fq '<fieldset' "$JOURNEY" \
  || fail "the prediction is not a grouped, labelled control"
grep -Fq '<legend' "$JOURNEY" \
  || fail "the prediction group carries no accessible name"

# Every learner action is a real control. `<div onClick>` is not operable by
# keyboard and is not announced as a control. Checked across the drawing too:
# a topology is precisely where a clickable non-control is likely to appear.
for scanned in "$JOURNEY_LOGIC" "$DRAWING_LOGIC"; do
  if grep -qE '<(div|span|li|p|g|rect|circle|path)[^>]*onClick' "$scanned"; then
    fail "a learner action is not a real semantic control"
  fi
done

BUTTONS="$(grep -c '<button' "$JOURNEY_LOGIC" || true)"
[ "$BUTTONS" -ge 4 ] \
  || fail "only $BUTTONS button(s) found; advance, commit, remediate and reset must all be operable"

# A disabled control reads as a broken feature and gives a keyboard user
# something to land on that does nothing. WP-H renders a control or omits it.
if grep -qE '<button[^>]*disabled' "$JOURNEY_LOGIC"; then
  fail "the interaction offers a disabled control"
fi

# Hover must never be the only way to reach information.
for scanned in "$JOURNEY_LOGIC" "$DRAWING_LOGIC"; do
  if grep -qF 'onMouseOver' "$scanned"; then
    fail "the interaction requires hover"
  fi
done

# The decorative layer must be hidden from assistive technology, so it can
# never be the only carrier of a fact.
#
# WP-I moved that layer out of the component and into the topology view, which
# is where the SVG now lives. The PROPERTY is unchanged and is checked where it
# now applies, rather than pinned to the file that used to hold it.
grep -Fq 'aria-hidden="true"' "$TOPOLOGY" \
  || fail "the decorative visual layer is not hidden from assistive technology"

# The consequence must be words, not colour. `outcomeLabel` is that text.
grep -Fq 'outcomeLabel' "$JOURNEY" \
  || fail "a stage outcome is not stated in words"

# The authored text account survives, and is never AI-generated.
grep -Fq 'textTrace' "$JOURNEY" \
  || fail "the required text trace is not rendered"

echo "PASS: 11. the accessible representation is primary and operable"

# ------------------------------------------------------------
# 11b. The drawing is an addition, never a second model (WP-I)
# ------------------------------------------------------------
# A topology renderer is the single most likely place for a second networking
# model to appear, and the most likely place for a control to stop being a
# control. Both are checked here.

# Every SVG in the interaction lives in the topology view, and it is hidden.
# An SVG anywhere else could carry a fact the text does not.
for scanned in "$PRESENTATION_LOGIC" "$JOURNEY_LOGIC" "$SURFACE_LOGIC" \
               "$DEVICE_LOGIC" "$LAYOUT_LOGIC"; do
  if grep -qF '<svg' "$scanned"; then
    fail "a drawn layer exists outside the topology view"
  fi
done

# Devices are native controls. The whole accessibility strategy rests on this:
# what a learner operates is a button, and what a learner reads is text.
grep -Fq '<button' "$DEVICE" \
  || fail "a topology device is not a real button"

if grep -qE 'tabIndex' "$DRAWING_LOGIC"; then
  fail "the drawing imitates a control with tabIndex instead of using one"
fi

if grep -qE '<button[^>]*disabled' "$DRAWING_LOGIC"; then
  fail "the drawing offers a disabled control"
fi

# The layout consumes the shared observation model and nothing else. Reading
# authored parameters directly would bypass the seam CURR-011 s8 requires.
grep -Fq 'ObservationModel' "$LAYOUT" \
  || fail "the topology layout does not consume the shared observation model"

if grep -qF 'buildPacketJourneyObservationModel' "$DRAWING_LOGIC"; then
  fail "the drawing builds its own observation model"
fi

if grep -qE 'PacketJourneyParameters|parameters\.' "$DRAWING_LOGIC"; then
  fail "the drawing reads authored parameters instead of the observation model"
fi

# The traversed link is CARRIED, never worked out. A search of the link list
# for one joining two consecutive stages is forwarding inference, and it is
# also wrong on a topology with two links between the same pair of devices.
grep -Fq 'viaLinkId' "$MODEL" \
  || fail "the observation model carries no traversed link"
grep -Fq 'viaLinkId' "$LAYOUT" \
  || fail "the topology layout does not read the traversed link"
grep -Fq 'names a link that is not declared' "$REGISTRY" \
  || fail "a traversed link is not cross-referenced at authoring time"

if grep -qE 'links\.(find|filter|some)\([^)]*(atNodeId|previous|prior)' \
     "$LAYOUT_LOGIC"; then
  fail "the layout searches the link list for a path instead of reading one"
fi

# Failure is loud. A picture missing one device still looks finished, and a
# learner reasons from what they can see.
grep -Fq 'describeTopologyUnavailable' "$LAYOUT" \
  || fail "an unresolvable topology has no honest unavailable state"
grep -Fq 'state: "unavailable"' "$LAYOUT" \
  || fail "the topology layout cannot refuse to draw"

echo "PASS: 11b. the drawing adds a control surface and no second model"

# ------------------------------------------------------------
# 11c. Display facts are carried, never recognised (WP-I final)
# ------------------------------------------------------------
# Which facts appear on a compact device face is an AUTHORING decision carried
# through the observation model. A renderer that instead recognised them by
# name — matching a label against "VLAN", "Mode" or "Encapsulation" — would be
# networking knowledge in the presentation layer, would work for exactly one
# subject, and is the first step towards a renderer that understands what a
# VLAN is.
grep -Fq 'readonly prominent?: boolean' "$MODEL" \
  || fail "the observation model carries no display-emphasis metadata"
grep -Fq 'readonly prominent?: boolean' "$REGISTRY" \
  || fail "the authored contract carries no display-emphasis metadata"
grep -Fq 'prominent must be true or false' "$REGISTRY" \
  || fail "the display-emphasis flag is not strictly validated"
grep -Fq 'attribute.prominent === true' "$LAYOUT" \
  || fail "the layout does not select display facts by the carried flag"

# The networking vocabulary must appear nowhere in the drawing's logic. These
# are the exact labels the fixture authors, and finding one here would mean a
# renderer had started recognising them.
for forbidden in '"VLAN"' "'VLAN'" '"Mode"' '"Encapsulation"' '"trunk"' \
                 '"access"' '"Allowed VLANs"'; do
  if grep -qF -e "$forbidden" "$FRONTEND_LOGIC"; then
    fail "the presentation recognises a networking label by name: $forbidden"
  fi
done

echo "PASS: 11c. display facts are carried by flag, never matched by name"

# ------------------------------------------------------------
# 11d. The journey may not be clicked past its stop (WP-I final)
# ------------------------------------------------------------
# The fixture now authors stages BEYOND the fault, so that a repaired journey
# visibly reaches its destination. That makes this load-bearing: without it a
# learner could advance straight past the failure they came to diagnose.
#
# Whether the journey still stops is read from the OBSERVATION MODEL, never
# from the authored outcome directly — the authored outcome describes the
# journey while the fault is present, and only the model accounts for an
# applied remediation.
grep -Fq 'model.consequence?.state === "stopped"' "$PRESENTATION" \
  || fail "the journey can be advanced past an authored stop"

# And the reveal gate must not learn which action repairs what. That is
# answer-bearing, and is not sent at every support level.
if grep -qF 'resolvesFault' "$PRESENTATION_LOGIC"; then
  fail "the reveal gate reads the authored answer key"
fi

echo "PASS: 11d. an authored stop halts the reveal until the model says otherwise"

# ------------------------------------------------------------
# 12. Reduced motion preserves information and operation
# ------------------------------------------------------------
grep -Fq 'prefers-reduced-motion' "$STYLES" \
  || fail "there is no reduced-motion support"

# Parity is structural: no JavaScript branch may depend on motion, so a
# reduced-motion learner cannot be handed different content or fewer controls.
for forbidden in prefersReducedMotion matchMedia reducedMotion; do
  if grep -qF -e "$forbidden" "$FRONTEND_LOGIC"; then
    fail "a code path branches on motion preference: $forbidden"
  fi
done

echo "PASS: 12. reduced motion is CSS-only, so information and actions are identical"

# ------------------------------------------------------------
# 13. Failure is closed at every layer
# ------------------------------------------------------------
grep -Fq 'describeUnsupportedInteraction' "$SURFACE" \
  || fail "an unsupported interaction has no honest failure state"
grep -Fq 'describeWithheldInteraction' "$SURFACE" \
  || fail "a withheld interaction has no honest state"

# CURR-011 s16: never fall back to raw payload output.
if grep -qE 'JSON.stringify\(.*(parameters|content|payload)' "$FRONTEND_LOGIC"; then
  fail "the frontend can dump an authored payload to the learner"
fi

echo "PASS: 13. unsupported and withheld interactions fail closed"

# ------------------------------------------------------------
# 14. The renderer mapping is a switch, not a dynamic lookup
# ------------------------------------------------------------
grep -Fq 'case "packet_journey":' "$SURFACE" \
  || fail "the renderer mapping does not handle the registered type"

# A dynamic lookup by string is how a plugin framework starts, and it turns a
# missing renderer into a runtime surprise instead of a compile error.
if grep -qE '\[(interactionType|content\.interactionType)\]' "$SURFACE_LOGIC"; then
  fail "the renderer mapping is a dynamic lookup rather than a switch"
fi

echo "PASS: 14. the renderer mapping is static and exhaustive"

# ------------------------------------------------------------
# 15. No migration, dependency or provider change
# ------------------------------------------------------------
# The mission_steps payload is already jsonb constrained to an object, so the
# typed parameters persist with no schema change (Architect decision 1).
NEW_MIGRATIONS="$(find supabase/migrations -name '2026090[3-9]*' -o -name '20261*' 2>/dev/null | wc -l | tr -d ' ')"
[ "$NEW_MIGRATIONS" = "0" ] \
  || fail "WP-H added $NEW_MIGRATIONS migration(s); none is expected"

for manifest in package.json apps/web/package.json \
                packages/shared-types/package.json services/api/package.json; do
  if git diff --quiet HEAD -- "$manifest" 2>/dev/null; then
    :
  else
    fail "WP-H changed a dependency manifest: $manifest"
  fi
done

echo "PASS: 15. no migration and no dependency change"

# ------------------------------------------------------------
# 16. The fixture exercises the contract and stays unpublishable
# ------------------------------------------------------------
grep -Fq '"interactionType": "packet_journey"' "$FIXTURE" \
  || fail "the architecture fixture does not exercise the registered type"
grep -Fq '"sourceKind": "authored_teaching"' "$FIXTURE" \
  || fail "the fixture interaction declares no authored source"
grep -Fq '"documentKind": "architecture_fixture"' "$FIXTURE" \
  || fail "the architecture fixture is no longer marked as a fixture"

# WP-J owns production networking curriculum. WP-H authors none.
#
# This asserted zero documents until WP-J/J1 authored Networking Foundations.
# It is now pinned to the approved SET rather than to a count, which is the same
# guarantee expressed against the current baseline: WP-H still cannot author
# curriculum, and an unreviewed course still fails here. Relaxing it to "one or
# more" would have been the weakening; naming the file is not.
PRODUCTION_DOCS="$(find content -name '*.json' -not -path 'content/fixtures/*' 2>/dev/null \
  | LC_ALL=C sort | tr '\n' ' ')"
[ "$PRODUCTION_DOCS" = "content/curriculum/networking-foundations.json " ] \
  || fail "unexpected production curriculum documents: ${PRODUCTION_DOCS:-none}. WP-H authors none, and a new course is WP-J's to approve."

echo "PASS: 16. the fixture exercises the contract and publishes nowhere"

# ------------------------------------------------------------
# 17. The gate resolves through the verifier namespace
# ------------------------------------------------------------
[ -f scripts/verify-wph.sh ] \
  || fail "this gate is not resolvable as scripts/verify-wph.sh"

grep -Fq 'scripts/verify-wph.sh' "$SELECTOR" \
  || fail "the gate is not registered in change-relevant gate selection"

echo "PASS: 17. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# WP-H tests
# ------------------------------------------------------------
echo ""
echo "--- running the WP-H shared contract suites ---"
npm run test --workspace @tlp/shared-types -- instruction-interaction observation-model mission-steps mission-instruction

echo ""
echo "--- running the WP-H presentation suite ---"
npm run test --workspace @tlp/web -- src/learning/packet-journey-presentation

echo ""
echo "--- running the WP-H publication suite ---"
npm run test --workspace @tlp/api -- curriculum-document

echo ""
echo "=========================================================="
echo "WP-H INSTRUCTIONAL INTERACTION VERIFIED"
echo ""
echo "One closed interaction registry owns the type vocabulary and"
echo "the typed parameter contract. The renderer consumes a shared"
echo "ObservationModel and computes no networking truth. Support"
echo "levels are enforced server-side by absence; teaching mode"
echo "produces no evidence. The accessible representation is the"
echo "primary one, and reduced motion drops only movement."
echo ""
echo "This gate proves SOURCE STRUCTURE and pure logic. It does NOT prove:"
echo "  - that any interaction has been rendered in a browser"
echo "  - accessible operation with a real screen reader; that is WP-I UAT"
echo "  - anything about instructional quality, which is Human UAT"
echo "  - any live-lab behaviour; live mode is a declared seam only"
echo "=========================================================="
