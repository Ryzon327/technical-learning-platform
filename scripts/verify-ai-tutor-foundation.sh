#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# AI Tutor foundation gate — Build Wave 10, Batch 1 (GitHub issue #62).
#
# This gate asks one question:
#
#   "Can this repository truthfully claim that the provider-independent AI
#    Tutor FOUNDATION exists, fails closed, and holds the deterministic
#    boundary structurally rather than by instruction?"
#
# It does NOT answer, and must never imply:
#
#   - that the AI Gateway is complete (AIGW-003, AIGW-004, AIGW-006 and
#     AIGW-010 are not implemented by this package);
#   - that any AI provider is connected or authorized;
#   - that a learner can ask the Tutor anything (there is no route);
#   - that any rendered or Human UAT has occurred.
#
# ## Why a structural gate and not only tests
#
# The non-negotiable product boundaries in issue #62 are ABSENCE claims: the
# Tutor cannot decide lab correctness, cannot grant mastery, cannot write a
# note, cannot reach a paid provider. A test proves what code does; only an
# inspection of the source proves what it does NOT contain. Both run here, and
# the unit suite runs through the repository toolchain at the end.
#
# ## Absence scans judge COMMENT-STRIPPED code
#
# Every Tutor module documents precisely what it refuses to do, and several
# hold their prohibitions AS DATA. A naive full-text scan would flag a module
# for recording the very thing it forbids, so absence checks read a
# comment-stripped view, and where a module holds a prohibition list they read
# a string-stripped view as well.
#
# Section 3 additionally ASSERTS that every source yields inspectable text: a
# file that produced no comment-stripped content would make every absence scan
# over it pass VACUOUSLY, which is a defect class this repository has already
# been bitten by once (see scripts/verify-search-engine-completion.sh §4).
# ============================================================

SHARED_SRC="packages/shared-types/src"
API_SRC="services/api/src"
SERVER="$API_SRC/server.ts"
REGISTRY="docs/Feature-Registry/AI-Gateway"
BUILD_DOC="docs/Engineering-OS/BUILD_WAVE_10_BATCH_1_AI_TUTOR_FOUNDATION.md"

SHARED_MODULES="ai-tutor-lesson-context ai-tutor-boundaries ai-tutor-privacy \
ai-tutor-grounding ai-tutor-request ai-tutor-provider ai-tutor-response"
API_MODULES="ai-tutor ai-tutor-local-provider"

fail() { echo "GATE FAIL: $1"; exit 1; }

# Comment-stripped view of a TypeScript source. Ordinary text inspection.
code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }
# Code with double-quoted string literals removed, so a module that holds its
# own prohibition list as data is never judged by the names it forbids.
code_no_strings() { code_of "$1" | sed 's/"[^"]*"//g'; }
# Whitespace-free code, for pinning a composition rather than a single line.
flat_of() { code_of "$1" | tr -d ' \n'; }

TUTOR_SOURCES=""
for m in $SHARED_MODULES; do TUTOR_SOURCES="$TUTOR_SOURCES $SHARED_SRC/$m.ts"; done
for m in $API_MODULES; do TUTOR_SOURCES="$TUTOR_SOURCES $API_SRC/$m.ts"; done

echo "===== AI TUTOR FOUNDATION GATE — Build Wave 10 / Batch 1 ====="
echo ""

# ------------------------------------------------------------
# 1. The governing AI Gateway Features exist and are Founder approved
# ------------------------------------------------------------
[ -f "$REGISTRY/AI_GATEWAY_FEATURES.md" ] \
  || fail "the AI Gateway feature index is missing"

for id in 001 002 005 006 007 008 009 011; do
  spec="$(find "$REGISTRY" -maxdepth 1 -name "AIGW-${id}_*.md" | head -1)"
  [ -n "$spec" ] || fail "AIGW-${id} specification is missing from the Feature Registry"
  grep -Fq '[x] Approved' "$spec" \
    || fail "AIGW-${id} does not record Founder approval"
done

# AIGW-011 is specified but NOT authorized for implementation. This package
# must honour its projection boundary without claiming to implement it.
AIGW_011="$(find "$REGISTRY" -maxdepth 1 -name 'AIGW-011_*.md' | head -1)"
grep -Fq 'Not authorized for implementation by WP-A' "$AIGW_011" \
  || fail "AIGW-011 no longer records that its implementation is unauthorized"

[ -f "$BUILD_DOC" ] || fail "the build document is missing: $BUILD_DOC"

echo "PASS:  1. the governing AI Gateway Features are present and approved"

# ------------------------------------------------------------
# 2. This gate claims a foundation, never a Gateway, provider or UAT
# ------------------------------------------------------------
SELF="scripts/verify-ai-tutor-foundation.sh"
BANNER="$(grep -E '^echo ' "$SELF" || true)"

for claimed in 'AI GATEWAY COMPLETE' 'PROVIDER CONNECTED' 'HUMAN UAT '"PASSED" \
               'TUTOR PRODUCT ACCEPTED' 'PRODUCTION READY' 'MVP RELEASE READY'; do
  if echo "$BANNER" | grep -qF "$claimed"; then
    fail "this gate's banner claims something it cannot prove: $claimed"
  fi
done

echo "$BANNER" | grep -qF 'NO AI PROVIDER IS CONNECTED OR AUTHORIZED' \
  || fail "this gate no longer states that no provider is connected"
echo "$BANNER" | grep -qF 'FOUNDATION ONLY — THE AI GATEWAY IS NOT COMPLETE' \
  || fail "this gate no longer states that the Gateway is incomplete"

# The build document is held to the same honesty bar.
if grep -qiE 'uat (approved|passed|complete)|tutor is accepted|product acceptance granted|gateway is complete' "$BUILD_DOC"; then
  fail "the build document claims an acceptance or completion that has not occurred"
fi

echo "PASS:  2. nothing here claims a Gateway, a provider or an acceptance"

# ------------------------------------------------------------
# 3. The implementation surface exists, is exported, is tested, is inspectable
# ------------------------------------------------------------
for m in $SHARED_MODULES; do
  [ -f "$SHARED_SRC/$m.ts" ] || fail "shared Tutor module is missing: $m.ts"
  [ -f "$SHARED_SRC/$m.test.ts" ] || fail "shared Tutor module has no tests: $m.test.ts"
  grep -Fq "export * from \"./$m\";" "$SHARED_SRC/index.ts" \
    || fail "shared Tutor module is not exported: $m"
done

for m in $API_MODULES; do
  [ -f "$API_SRC/$m.ts" ] || fail "Tutor API module is missing: $m.ts"
  [ -f "$API_SRC/$m.test.ts" ] || fail "Tutor API module has no tests: $m.test.ts"
done

# A NUL byte makes grep treat a source as binary; `grep -v` then yields nothing
# and every absence scan over that file passes while proving nothing. Detected
# by BYTE COUNT, because a NUL cannot be passed as a shell argument.
for src in $TUTOR_SOURCES; do
  RAW_BYTES="$(wc -c < "$src" | tr -d ' ')"
  TEXT_BYTES="$(LC_ALL=C tr -d '\000' < "$src" | wc -c | tr -d ' ')"
  [ "$RAW_BYTES" = "$TEXT_BYTES" ] \
    || fail "a Tutor source contains a NUL byte and is unreadable to text scans: $src"
  [ -n "$(code_of "$src")" ] \
    || fail "a Tutor source yields no inspectable content; absence scans over it would pass vacuously: $src"
done

echo "PASS:  3. every Tutor module exists, is exported, is tested and is inspectable text"

# ------------------------------------------------------------
# 4. The contracts are VERSIONED
# ------------------------------------------------------------
grep -Fq 'export const AI_TUTOR_REQUEST_CONTRACT_VERSION = "ai-tutor-request-v1";' \
  "$SHARED_SRC/ai-tutor-request.ts" \
  || fail "the Tutor request contract is not versioned"
grep -Fq 'export const AI_TUTOR_RESPONSE_CONTRACT_VERSION = "ai-tutor-response-v1";' \
  "$SHARED_SRC/ai-tutor-response.ts" \
  || fail "the Tutor response contract is not versioned"
grep -Fq 'export const AI_TUTOR_PROVIDER_CONTRACT_VERSION = "ai-tutor-provider-v1";' \
  "$SHARED_SRC/ai-tutor-provider.ts" \
  || fail "the Tutor provider contract is not versioned"

echo "PASS:  4. the request, response and provider contracts are versioned"

# ------------------------------------------------------------
# 5. THE DETERMINISTIC BOUNDARY — structural, not instructed
# ------------------------------------------------------------
BOUND="$SHARED_SRC/ai-tutor-boundaries.ts"
RESP="$SHARED_SRC/ai-tutor-response.ts"

grep -Fq 'export const AI_TUTOR_FORBIDDEN_AUTHORITY_FIELDS' "$BOUND" \
  || fail "the authority prohibition is not held as data"
grep -Fq 'export function containsForbiddenAuthorityField' "$BOUND" \
  || fail "the authority refusal is missing"

# Exactly ONE definition of the refusal, so there is one boundary and not two
# that could drift apart.
REFUSALS="$(grep -rlF 'export function containsForbiddenAuthorityField' \
  "$SHARED_SRC" "$API_SRC" 2>/dev/null || true)"
[ "$REFUSALS" = "$BOUND" ] \
  || fail "a second authority refusal exists: $REFUSALS"

# The forbidden-field list is the ONE source of truth; the response module
# composes it rather than restating it.
grep -Fq 'containsForbiddenAuthorityField' "$RESP" \
  || fail "response normalization no longer composes the authority refusal"

# The refusal runs BEFORE any field of the provider output is read, so no part
# of an authority-claiming response is salvaged. Proven by byte offset in the
# comment-stripped source: a comment claiming the order cannot satisfy it.
RESP_FLAT="$(flat_of "$RESP")"
NORM_FLAT="$(echo "$RESP_FLAT" | grep -o 'exportfunctionnormalizeTutorProviderOutput.*' || true)"
[ -n "$NORM_FLAT" ] || fail "the response normalizer is missing"

R_REFUSE="$(echo "$NORM_FLAT" | grep -bo 'if(containsForbiddenAuthorityField(input.raw))' | head -1 | cut -d: -f1 || true)"
R_ANSWER="$(echo "$NORM_FLAT" | grep -bo 'constanswer=boundedText(input.raw.answer' | head -1 | cut -d: -f1 || true)"
[ -n "$R_REFUSE" ] || fail "the authority refusal is missing from response normalization"
[ -n "$R_ANSWER" ] || fail "the answer extraction is missing from response normalization"
[ "$R_REFUSE" -lt "$R_ANSWER" ] \
  || fail "the authority refusal no longer precedes reading the provider's answer"

# The boundary flags are LITERAL false, so a response claiming authority does
# not compile.
for flagline in \
  'determinesLabCorrectness:false;' \
  'grantsMastery:false;' \
  'altersDeterministicScoring:false;' \
  'mutatesLearnerNotes:false;' \
  'overridesDeterministicValidation:false;' \
  'createsLearnerEvidence:false;'; do
  echo "$RESP_FLAT" | grep -Fq "$flagline" \
    || fail "a Tutor boundary flag is no longer a literal false: $flagline"
done

# The response contract must carry NO field that could express a verdict.
RESP_FIELDS="$(awk '/^export interface TutorResponse \{/{f=1;next} /^\}/{f=0} f' "$RESP" \
  | grep -oE '^\s+[a-zA-Z]+\??:' | tr -d ' ?:' | LC_ALL=C sort | tr '\n' ' ')"
for forbidden in labPassed labCorrect validationResult masteryGranted \
                 competencyAwarded score grade evidenceRecord \
                 certificateEligible noteWrite progressUpdate userId; do
  case " $RESP_FIELDS " in
    *" $forbidden "*) fail "the Tutor response gained forbidden authority state: $forbidden" ;;
  esac
done

# The Tutor cannot write a note, and it cannot claim it did.
grep -Fq 'export function tutorMayWriteLearnerNote(): false' "$BOUND" \
  || fail "the note-write refusal is missing or is no longer unconditional"
echo "$(flat_of "$BOUND")" | grep -Fq 'applied:false;' \
  || fail "a note suggestion can now claim to have been applied"
echo "$(flat_of "$BOUND")" | grep -Fq 'requiresExplicitLearnerAction:true;' \
  || fail "a note suggestion no longer requires an explicit learner action"

# No Tutor module may write anything, anywhere.
for src in $TUTOR_SOURCES; do
  if code_of "$src" | grep -qE '\.(insert|update|upsert|delete|rpc)\('; then
    fail "a Tutor module performs a write: $src"
  fi
done

echo "PASS:  5. the deterministic boundary is structural and refuses before reading"

# ------------------------------------------------------------
# 6. Untrusted or disconnected lab state is UNAVAILABLE, never guessed
# ------------------------------------------------------------
grep -Fq 'export const TUTOR_LAB_ATTESTATION_SOURCE =' "$BOUND" \
  || fail "the single deterministic attestation source is missing"
echo "$(flat_of "$BOUND")" \
  | grep -Fq 'TUTOR_LAB_ATTESTATION_SOURCE="lab_engine_deterministic_validation"asconst;' \
  || fail "the deterministic attestation source changed; exactly one source may produce an available state"

grep -Fq 'export function classifyTutorLabState(claim: unknown)' "$BOUND" \
  || fail "lab-state classification no longer treats its input as untrusted"

# Exactly ONE way to CONSTRUCT an available lab state, and it is behind the
# source check. Any other construction would be a guess.
#
# Counted on the trailing comma, which distinguishes a construction from the
# union member's declaration — the type legitimately names the state it admits
# (`availability: "available";`), and counting that would be counting the
# contract rather than the code.
AVAILABLE_SITES="$(code_of "$BOUND" | grep -c 'availability: "available",' || true)"
[ "$AVAILABLE_SITES" = "1" ] \
  || fail "lab state can be constructed as available at $AVAILABLE_SITES sites; exactly one may exist"

BOUND_FLAT="$(flat_of "$BOUND")"
B_SOURCE="$(echo "$BOUND_FLAT" | grep -bo 'if(candidate.source!==TUTOR_LAB_ATTESTATION_SOURCE)' | head -1 | cut -d: -f1 || true)"
B_AVAILABLE="$(echo "$BOUND_FLAT" | grep -bo 'availability:"available",' | head -1 | cut -d: -f1 || true)"
[ -n "$B_SOURCE" ] || fail "the attestation source check is missing"
[ -n "$B_AVAILABLE" ] || fail "the available lab state is missing"
[ "$B_SOURCE" -lt "$B_AVAILABLE" ] \
  || fail "the attestation source is checked after lab state is already available"

# The Tutor is told AVAILABILITY, never a verdict. A provider prompt carries no
# verdict, session or run reference.
PROMPT_FIELDS="$(awk '/^export interface TutorProviderPrompt \{/{f=1;next} /^\}/{f=0} f' \
  "$SHARED_SRC/ai-tutor-provider.ts" | grep -oE '^\s+[a-zA-Z]+\??:' | tr -d ' ?:' | LC_ALL=C sort | tr '\n' ' ')"
for forbidden in labPassed labValidationResult validationRunId sessionId \
                 userId correlationId requestId noteId missionVersion; do
  case " $PROMPT_FIELDS " in
    *" $forbidden "*) fail "the provider prompt gained forbidden state: $forbidden" ;;
  esac
done

echo "PASS:  6. untrusted or disconnected lab state is unavailable by construction"

# ------------------------------------------------------------
# 7. A client cannot supply lesson content, identity, authority or lab state
# ------------------------------------------------------------
REQ="$SHARED_SRC/ai-tutor-request.ts"
GRND="$SHARED_SRC/ai-tutor-grounding.ts"

grep -Fq 'export const AI_TUTOR_REQUEST_FORBIDDEN_INPUT_FIELDS' "$REQ" \
  || fail "the forbidden-input prohibition is not held as data"
grep -Fq 'export function containsForbiddenTutorInputField' "$REQ" \
  || fail "the forbidden-input refusal is missing"

# The refusal runs BEFORE any field is read, so a hostile input cannot have a
# side effect on the way to being rejected.
REQ_FLAT="$(flat_of "$REQ")"
ASSEMBLE_FLAT="$(echo "$REQ_FLAT" | grep -o 'exportfunctionassembleTutorRequest.*' || true)"
[ -n "$ASSEMBLE_FLAT" ] || fail "the request assembler is missing"

A_FORBIDDEN="$(echo "$ASSEMBLE_FLAT" | grep -bo 'if(containsForbiddenTutorInputField(input))' | head -1 | cut -d: -f1 || true)"
A_QUESTION="$(echo "$ASSEMBLE_FLAT" | grep -bo 'conststring=' | head -1 | cut -d: -f1 || true)"
A_SCREEN="$(echo "$ASSEMBLE_FLAT" | grep -bo 'constscreening=screenTutorTextsForSecrets(' | head -1 | cut -d: -f1 || true)"
A_RETURN="$(echo "$ASSEMBLE_FLAT" | grep -bo 'return{ok:true,' | head -1 | cut -d: -f1 || true)"
[ -n "$A_FORBIDDEN" ] || fail "the forbidden-input refusal is missing from assembly"
[ -n "$A_SCREEN" ] || fail "secret screening is missing from assembly"
[ -n "$A_RETURN" ] || fail "the assembled request is missing"
[ "$A_FORBIDDEN" -lt "$A_SCREEN" ] \
  || fail "the forbidden-input refusal no longer precedes secret screening"
[ "$A_SCREEN" -lt "$A_RETURN" ] \
  || fail "a request can be assembled before secret screening has run"

# The CLIENT INPUT type must carry no lab state and no authored lesson text.
INPUT_FIELDS="$(awk '/^export interface TutorRequestInput \{/{f=1;next} /^\}/{f=0} f' "$REQ" \
  | grep -oE '^\s+[a-zA-Z]+\??:' | tr -d ' ?:' | LC_ALL=C sort | tr '\n' ' ')"
for forbidden in labState labStateClaim labPassed userId privacyClass \
                 callingEngine provider model systemPrompt lessonText \
                 groundingSegments supportLevel disclosureState; do
  case " $INPUT_FIELDS " in
    *" $forbidden "*) fail "the client request input gained forbidden state: $forbidden" ;;
  esac
done

# A grounding reference may NAME content and never carry it. This is the rule
# that stops a client becoming the curriculum author.
grep -Fq 'if ("text" in ref || "title" in ref) return null;' "$GRND" \
  || fail "a grounding reference may now carry authored text or a title"

# A resolved segment that was not requested is DISCARDED, so a source cannot
# widen the context it was asked for.
grep -Fq 'const requested = resolution.segments.filter((segment) =>' "$GRND" \
  || fail "grounding no longer discards a segment that was never requested"

# Assessment and answer-revealing content is UNNAMEABLE, not filtered.
echo "$(flat_of "$GRND")" \
  | grep -Fq 'TUTOR_GROUNDING_KINDS=["lesson_text","transcript","objective","concept","glossary","reference","practice_framing"]asconst;' \
  || fail "the approved grounding vocabulary changed"
grep -Fq 'export const TUTOR_GROUNDING_EXCLUDED_KINDS' "$GRND" \
  || fail "the grounding exclusion is not held as data"
for excluded in assessment_question answer_key expected_outcome \
                expected_path authored_fault solution; do
  if echo "$(flat_of "$GRND")" | grep -o 'TUTOR_GROUNDING_KINDS=\[[^]]*\]' | grep -qF "$excluded"; then
    fail "an answer-revealing or assessment kind entered the grounding vocabulary: $excluded"
  fi
done

echo "PASS:  7. a client can name approved content but never supply it or assert authority"

# ------------------------------------------------------------
# 8. Grounding is deterministic, bounded and never fabricates a citation
# ------------------------------------------------------------
grep -Fq 'export const TUTOR_MAX_GROUNDING_SEGMENTS = 8;' "$GRND" \
  || fail "grounding selection is no longer bounded by segment count"
grep -Fq 'export const TUTOR_GROUNDING_TEXT_BUDGET = 6_000;' "$GRND" \
  || fail "grounding selection is no longer bounded by a text budget"
grep -Fq 'export const TUTOR_MAX_GROUNDING_REFS = 12;' "$GRND" \
  || fail "the requested reference set is no longer bounded"

# Deterministic ordering: precedence, requested order, stable id. No score.
grep -Fq 'return a.segmentStableId.localeCompare(b.segmentStableId);' "$GRND" \
  || fail "the deterministic stable-id tie-break was removed from grounding"
grep -Fq 'TUTOR_GROUNDING_PRECEDENCE.indexOf(a.kind)' "$GRND" \
  || fail "grounding no longer orders by the approved precedence"

# No scoring, no relevance, no embeddings, no randomness anywhere.
GRND_BARE="$(code_no_strings "$GRND")"
if echo "$GRND_BARE" | grep -qiE 'relevance|embedding|semantic|vector|cosine|similarity|boost|rankScore|Math\.random|shuffle'; then
  fail "a scoring, semantic or random mechanism entered grounding selection"
fi

# Citations are derived from SELECTED segments and nothing else.
grep -Fq 'export function buildTutorCitations' "$GRND" \
  || fail "citation derivation is missing"
grep -Fq 'export function verifyTutorCitations' "$GRND" \
  || fail "citation verification is missing"
grep -Fq 'citations: buildTutorCitations(selected)' "$GRND" \
  || fail "the selection no longer derives its citations from the selected segments"
grep -Fq 'verifyTutorCitations' "$RESP" \
  || fail "response normalization no longer verifies claimed citations"

# The grounding seam must not be coupled to any one retrieval implementation.
for src in "$GRND" "$REQ" "$RESP" "$SHARED_SRC/ai-tutor-provider.ts"; do
  if code_no_strings "$src" | grep -qE 'SearchDocument|searchCurriculum|curriculum-search|SEARCH_|supabase|createUserScoped|fetch\('; then
    fail "the Tutor foundation became coupled to a retrieval implementation or performs a read: $src"
  fi
done

echo "PASS:  8. grounding is deterministic, bounded, uncoupled and never fabricates"

# ------------------------------------------------------------
# 9. Privacy: fail closed on credentials, and never log learner prose
# ------------------------------------------------------------
PRIV="$SHARED_SRC/ai-tutor-privacy.ts"

grep -Fq 'export const TUTOR_SECRET_PATTERNS' "$PRIV" \
  || fail "deterministic secret screening is missing"
grep -Fq 'export function redactTutorText' "$PRIV" \
  || fail "the redaction seam is missing"
grep -Fq 'export const AI_TUTOR_LOG_FORBIDDEN_FIELDS' "$PRIV" \
  || fail "the log prohibition is not held as data"
grep -Fq 'export function projectTutorRequestForLog' "$PRIV" \
  || fail "the log projection is missing"

# EXACTLY ONE set of credential patterns in the package. A second set is a
# second truth, and the two would drift.
PATTERN_SETS="$(grep -rlF 'export const TUTOR_SECRET_PATTERNS' \
  "$SHARED_SRC" "$API_SRC" 2>/dev/null || true)"
[ "$PATTERN_SETS" = "$PRIV" ] \
  || fail "a second set of credential patterns exists: $PATTERN_SETS"

# The log projection is assembled field by field, never spread from a request.
PRIV_FLAT="$(flat_of "$PRIV")"
echo "$PRIV_FLAT" | grep -Fq 'contractVersion:input.request.contractVersion,' \
  || fail "the log projection no longer assembles its fields explicitly"
PROJ_BODY="$(awk '/^export function projectTutorRequestForLog/{f=1} f; /^}/{if(f)exit}' "$PRIV")"
if echo "$PROJ_BODY" | grep -qE '\.\.\.input\.request|\.\.\.request'; then
  fail "the log projection spreads the request; a field added later would leak"
fi

# The screening returns KINDS, never the matched text.
if code_no_strings "$PRIV" | grep -qE 'matched|\.exec\(|RegExp\$|match\[0\]'; then
  fail "secret screening may now return the matched credential text"
fi

# The privacy screen runs over BOTH the question and every included excerpt.
echo "$ASSEMBLE_FLAT" \
  | grep -Fq 'screenTutorTextsForSecrets([question,...noteExcerpts.map((entry)=>entry.excerpt)]);' \
  || fail "secret screening no longer covers both the question and the included excerpts"

# Every string that reaches a provider is redacted, as defence in depth.
PROV="$SHARED_SRC/ai-tutor-provider.ts"
grep -Fq 'question: redactTutorText(input.request.question),' "$PROV" \
  || fail "the provider prompt no longer redacts the question"
grep -Fq 'text: redactTutorText(segment.text)' "$PROV" \
  || fail "the provider prompt no longer redacts grounding text"
grep -Fq 'redactTutorText(entry.excerpt)' "$PROV" \
  || fail "the provider prompt no longer redacts a learner's included excerpt"
grep -Fq 'export function screenTutorPrompt' "$PROV" \
  || fail "the last screening gate before transmission is missing"

echo "PASS:  9. credentials fail closed, and a routine log carries no learner prose"

# ------------------------------------------------------------
# 10. Cross-learner protection has exactly ONE ownership mechanism
# ------------------------------------------------------------
SVC="$API_SRC/ai-tutor.ts"
SVC_CODE="$(code_of "$SVC")"

grep -Fq 'export function mayIncludeInTutorContext' "$REQ" \
  || fail "the single inclusion gate for learner-private content is missing"
grep -Fq 'return decision?.ownership === "owned";' "$REQ" \
  || fail "the inclusion gate no longer admits exactly one ownership outcome"

GATES="$(grep -rlF 'export function mayIncludeInTutorContext' \
  "$SHARED_SRC" "$API_SRC" 2>/dev/null || true)"
[ "$GATES" = "$REQ" ] \
  || fail "a second inclusion gate exists: $GATES"

# A note excerpt needs BOTH an explicit learner action and caller ownership.
echo "$ASSEMBLE_FLAT" | grep -Fq 'if(selection.includedByLearnerAction!==true)' \
  || fail "a note excerpt no longer requires an explicit learner action"
echo "$ASSEMBLE_FLAT" | grep -Fq 'if(!mayIncludeInTutorContext(decision))' \
  || fail "a note excerpt no longer requires caller ownership"
echo "$ASSEMBLE_FLAT" | grep -Fq 'if(!decision||decision.ownership==="unavailable")' \
  || fail "an absent ownership decision no longer fails closed"

# Ownership is decided by the caller's own client and by nothing else.
grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$SVC" \
  || fail "note ownership is no longer resolved through the caller's own client"
if echo "$SVC_CODE" | grep -qF 'createServerSupabaseClient'; then
  fail "a service-role path exists in the Tutor service"
fi
SVC_CLIENTS="$(echo "$SVC_CODE" | grep -c 'createUserScopedSupabaseClient(' || true)"
[ "$SVC_CLIENTS" = "1" ] \
  || fail "the Tutor service creates $SVC_CLIENTS clients; exactly one may exist"

# No second ownership mechanism beside the database policy.
for forbidden in user_id userId owner_id ownerId studentId learnerId; do
  if echo "$SVC_CODE" | grep -qF "$forbidden"; then
    fail "the Tutor service carries a second ownership mechanism: $forbidden"
  fi
done

echo "PASS: 10. ownership has one mechanism, and a note needs learner action plus ownership"

# ------------------------------------------------------------
# 11. Provider independence: timeout, bounded retry, no provider activated
# ------------------------------------------------------------
LOCAL="$API_SRC/ai-tutor-local-provider.ts"

grep -Fq 'export interface TutorProvider {' "$PROV" \
  || fail "the provider-neutral interface is missing"
grep -Fq 'export const TUTOR_PROVIDER_MAX_ATTEMPTS = 2;' "$PROV" \
  || fail "the retry bound was removed or widened"
grep -Fq 'export const TUTOR_PROVIDER_TIMEOUT_MS = 8_000;' "$PROV" \
  || fail "the provider timeout was removed"
grep -Fq 'export function mayRetryTutorProvider' "$PROV" \
  || fail "the retry decision is missing"

# A malformed response is NEVER retried: retrying it is a retry storm.
echo "$(flat_of "$PROV")" \
  | grep -Fq 'error==="provider_unavailable"||error==="timeout"||error==="rate_limited"' \
  || fail "the retryable-error set changed; only transient failures may be retried"

# The service enforces the timeout itself and bounds its own loop.
grep -Fq 'export async function runWithTutorTimeout' "$SVC" \
  || fail "the Tutor service no longer enforces a timeout"
grep -Fq 'while (attempts < 1 || mayRetryTutorProvider(attempts, lastError))' "$SVC" \
  || fail "the Tutor service retry loop is no longer bounded by the retry decision"
if echo "$SVC_CODE" | grep -qE 'while \(true\)|for \(;;\)'; then
  fail "an unbounded loop entered the Tutor service"
fi

# NO PROVIDER IS ACTIVATED. No SDK, no endpoint, no credential, anywhere.
ABSENCE_SCAN=""
for src in $TUTOR_SOURCES; do
  ABSENCE_SCAN="$ABSENCE_SCAN
$(code_no_strings "$src")"
done

if echo "$ABSENCE_SCAN" | grep -qiE 'openai|anthropic|ollama|cohere|mistralai|langchain|llamaindex|huggingface|vertexai|bedrock'; then
  fail "an AI provider SDK or endpoint entered the Tutor foundation"
fi
if echo "$ABSENCE_SCAN" | grep -qE 'fetch\(|https?://|XMLHttpRequest|WebSocket|node:http|undici|axios'; then
  fail "a network call or provider endpoint entered the Tutor foundation"
fi
if echo "$ABSENCE_SCAN" | grep -qE 'process\.env|API_KEY|apiKey *=|getSecret|loadRuntimeConfig'; then
  fail "the Tutor foundation reads an environment value or a credential"
fi

# No dependency was added for the Tutor.
for forbidden in openai anthropic ollama cohere mistralai langchain \
                 llamaindex huggingface; do
  if grep -qi "\"$forbidden" package.json packages/shared-types/package.json \
       services/api/package.json apps/web/package.json; then
    fail "an AI provider dependency was added: $forbidden"
  fi
done

# No migration. This work package expects NONE.
TUTOR_MIGRATIONS="$(ls supabase/migrations/*tutor*.sql supabase/migrations/*ai_*.sql \
  supabase/migrations/*ai-*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$TUTOR_MIGRATIONS" = "0" ] || fail "an AI Tutor database migration exists"

echo "PASS: 11. the provider is neutral, bounded, local-only and unactivated"

# ------------------------------------------------------------
# 12. No learner-facing surface and no route
# ------------------------------------------------------------
# The accepted Lovable lesson workspace remains the canonical learner-facing
# surface. This package represents the lesson interaction as a CONTRACT and
# recreates no part of that UI.
for path in '/tutor' '/ai' '/ai-tutor' '/learning/tutor' '/tutor/ask'; do
  if grep -qF "pathname === \"$path\"" "$SERVER"; then
    fail "the Tutor foundation added an HTTP route: $path"
  fi
done
if grep -qE 'ai-tutor|runTutorTurn' "$SERVER"; then
  fail "the API server now reaches the Tutor foundation"
fi

# No learner-facing component was created or modified.
TUTOR_UI="$(find apps/web/src -iname '*tutor*' 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$TUTOR_UI" = "0" ] \
  || fail "a learner-facing Tutor component exists; the Lovable workspace must not be recreated"
for src in $TUTOR_SOURCES; do
  case "$src" in
    *.tsx) fail "a Tutor module is a component: $src" ;;
  esac
  if code_no_strings "$src" | grep -qE 'React|useState|useEffect|jsx|className|document\.|window\.'; then
    fail "a Tutor module acquired rendering or DOM behaviour: $src"
  fi
done

echo "PASS: 12. no route, no component and no recreated learner-facing surface"

# ------------------------------------------------------------
# 13. Accessibility and pedagogy support
# ------------------------------------------------------------
LESSON="$SHARED_SRC/ai-tutor-lesson-context.ts"
LESSON_FLAT="$(flat_of "$LESSON")"

# Concise by default, deeper only on request.
echo "$LESSON_FLAT" | grep -Fq 'TUTOR_EXPLANATION_DEPTHS=["concise","standard","deeper"]asconst;' \
  || fail "the approved explanation-depth vocabulary changed"
echo "$LESSON_FLAT" | grep -Fq 'TUTOR_LANGUAGE_REGISTERS=["default","plain_language"]asconst;' \
  || fail "the approved language-register vocabulary changed"
echo "$LESSON_FLAT" | grep -Fq 'explanationDepth:"concise",' \
  || fail "the default Tutor answer is no longer concise"

# The learner stays in the lesson, and state is preserved by construction.
echo "$LESSON_FLAT" | grep -Fq 'TUTOR_PANEL_PLACEMENT="in_lesson_workspace"asconst;' \
  || fail "the Tutor placement changed; it must open inside the lesson workspace"
echo "$LESSON_FLAT" | grep -Fq 'learnerStatePreserved:true;' \
  || fail "a Tutor session can now discard learner state"
echo "$LESSON_FLAT" | grep -Fq 'navigationRequired:false;' \
  || fail "a Tutor session can now require navigating away from the lesson"

# Keyboard and screen-reader contracts are literal, not advisory.
echo "$LESSON_FLAT" | grep -Fq 'keyboardReachable:true;' \
  || fail "the keyboard-reachability contract is no longer a literal true"
echo "$LESSON_FLAT" | grep -Fq 'colorIsNotTheOnlySignal:true;' \
  || fail "the no-colour-alone contract is no longer a literal true"
grep -Fq 'screenReaderAnnouncement: string;' "$LESSON" \
  || fail "the screen-reader announcement contract is missing"
grep -Fq 'export const TUTOR_RENDERING_RULES' "$LESSON" \
  || fail "the rendering rules are not held as data"

# No pressure mechanic, and the prohibition is data.
grep -Fq 'export const TUTOR_FORBIDDEN_PEDAGOGY_MECHANICS' "$LESSON" \
  || fail "the pedagogy prohibition is not held as data"
for mechanic in streak timer countdown leaderboard; do
  grep -Fq "\"$mechanic\"" "$LESSON" \
    || fail "a prohibited pedagogy mechanic was removed from the prohibition list: $mechanic"
done

# Accessibility must not become dependent on the Tutor.
grep -Fq 'export const TUTOR_OPTIONALITY_CONTRACT' "$LESSON" \
  || fail "the Tutor optionality contract is missing"
grep -Fq 'Accessibility and narration of authored content never depend on the Tutor.' "$LESSON" \
  || fail "the contract no longer states that accessibility is independent of the Tutor"

# The deterministic hand-off a learner can actually act on.
grep -Fq '"run_deterministic_validation"' "$RESP" \
  || fail "the deterministic hand-off action was removed from the response vocabulary"

echo "PASS: 13. concise-by-default, plain language, keyboard and screen-reader contracts hold"

# ------------------------------------------------------------
# 14. Every prohibition list is asserted by a test
# ------------------------------------------------------------
for pair in \
  "$BOUND:AI_TUTOR_AUTHORITY_PROHIBITIONS" \
  "$BOUND:AI_TUTOR_FORBIDDEN_AUTHORITY_FIELDS" \
  "$REQ:AI_TUTOR_REQUEST_FORBIDDEN_INPUT_FIELDS" \
  "$PROV:AI_TUTOR_PROVIDER_PROMPT_FORBIDDEN_FIELDS" \
  "$RESP:AI_TUTOR_RESPONSE_FORBIDDEN_FIELDS" \
  "$PRIV:AI_TUTOR_LOG_FORBIDDEN_FIELDS" \
  "$PRIV:AI_TUTOR_FORBIDDEN_PROVIDER_ENV" \
  "$GRND:TUTOR_GROUNDING_EXCLUDED_KINDS" \
  "$LESSON:AI_TUTOR_LESSON_FORBIDDEN_FIELDS" \
  "$LESSON:TUTOR_FORBIDDEN_PEDAGOGY_MECHANICS"; do
  file="${pair%%:*}"; name="${pair##*:}"
  grep -Fq "export const $name" "$file" \
    || fail "a Tutor prohibition list is missing: $name"
  ASSERTED="$(grep -rl "$name" "$SHARED_SRC" "$API_SRC" 2>/dev/null \
    | grep '\.test\.ts$' || true)"
  [ -n "$ASSERTED" ] \
    || fail "a Tutor prohibition list is not asserted by any test: $name"
done

echo "PASS: 14. every Tutor prohibition list is held as data and asserted by a test"

# ------------------------------------------------------------
# 15. The gate owns its own paths in the change-relevant selector
# ------------------------------------------------------------
# A gate that checks a file it is not woken for is a gate that passes forever.
SELECTOR="scripts/ci-select-gates.sh"
for path in \
  "packages/shared-types/src/ai-tutor-lesson-context.ts" \
  "packages/shared-types/src/ai-tutor-boundaries.ts" \
  "packages/shared-types/src/ai-tutor-request.ts" \
  "packages/shared-types/src/index.ts" \
  "services/api/src/ai-tutor.ts" \
  "services/api/src/ai-tutor-local-provider.ts" \
  "$BUILD_DOC" \
  "$SELF"; do
  bash "$SELECTOR" "$path" | grep -Fq "$SELF" \
    || fail "a path this gate reads does not select it: $path"
done

echo "PASS: 15. every path this gate judges wakes this gate"

# ------------------------------------------------------------
# 16. The repository toolchain
# ------------------------------------------------------------
echo ""
bash scripts/ci-toolchain.sh typecheck test build security

echo ""
echo "============================================================"
echo "AI TUTOR FOUNDATION VERIFIED"
echo "FOUNDATION ONLY — THE AI GATEWAY IS NOT COMPLETE"
echo "NO AI PROVIDER IS CONNECTED OR AUTHORIZED"
echo "============================================================"
echo ""
echo "This gate proves the FOUNDATION only. It does NOT prove:"
echo "  - that any AI provider works, is reachable, or is authorized"
echo "    (the only implementation is a deterministic in-process fixture;"
echo "     AIGW-010 external adapters remain unimplemented and unauthorized)"
echo "  - that the AI Gateway is complete"
echo "    (AIGW-003 routing, AIGW-004 cost controls and AIGW-006 provider"
echo "     health and fallback are not implemented by this package)"
echo "  - real PostgreSQL row level security enforcement"
echo "    (there is no live database harness; the note-ownership evidence is"
echo "     caller-scoped, query-level and structural, never live-database proof)"
echo "  - rendered accessibility of any Tutor surface"
echo "    (this package renders nothing; the rendering CONTRACT is asserted,"
echo "     and focus quality, announcements and contrast remain rendered-review"
echo "     claims against the Lovable workspace)"
echo "  - pedagogical quality of any answer"
echo "  - Founder acceptance or Human UAT of any kind (DEC-047)"
echo ""
echo "Automated verification is necessary and never sufficient."
echo "============================================================"
