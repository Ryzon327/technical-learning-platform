#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# Search Engine completion gate — Build Wave 9.
#
# This gate is deliberately NOT a copy of scripts/verify-wave9.sh. That script
# proves each batch's implementation. This one asks the different question the
# completion review must answer:
#
#   "Can this repository truthfully claim that the Search Engine IMPLEMENTATION
#    is complete and ready to enter Founder Human UAT?"
#
# It does NOT answer "has Human UAT passed?" and must never imply that it has.
#
# It therefore checks the Feature Registry itself, the governance record, and —
# above all — the CROSS-FEATURE invariants no single batch verifier can prove in
# isolation, because each batch verifier only ever judges its own files.
#
# Per FEATURE_REGISTRY_SPEC.md section 9.11, a Feature is complete when its
# approved ACCEPTANCE CRITERIA pass, together with tests, security,
# accessibility, documentation and recorded Founder approval. Section 9.3
# "Scope" states included and excluded behaviour; it is a boundary statement,
# not the completion bar. This gate is built to that rule.
#
# ## Where this deliberately DIVERGES from the Certificate Engine gate
#
# The Wave 8 gate requires CURRENT_BUILD_STATUS.md to record the engine as
# COMPLETE and requires a completion review document. Neither exists for Search
# yet, and writing them is the SEPARATE closure step that follows this gate.
#
# So this gate inverts that check rather than copying it. It does not require the
# repository to claim Search completion; it FAILS if the repository claims more
# than is true — product acceptance, or a Human UAT that has not happened.
# Automated verification is necessary and never sufficient (DEC-047).
#
# Absence checks judge COMMENT-STRIPPED code, and where a module holds its own
# prohibitions AS DATA they judge a STRING-STRIPPED view as well. Search modules
# document precisely what they exclude, so a naive full-text scan would flag a
# module for recording what it refuses to do.
# ============================================================

REGISTRY="docs/Feature-Registry/Search-Engine"
REGISTRY_SPEC="docs/Feature-Registry/FEATURE_REGISTRY_SPEC.md"
SEQUENCE="docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md"
STATUS="docs/Project/CURRENT_BUILD_STATUS.md"
LEDGER="docs/Project/DECISION_LEDGER.md"
SERVER="services/api/src/server.ts"

fail() { echo "GATE FAIL: $1"; exit 1; }

# Comment-stripped view of a TypeScript source.
#
# Ordinary text inspection. This gate briefly stripped NUL bytes here, because
# `curriculum-search.ts` carried one in a map-key separator and BSD grep
# therefore treated the file as binary — `grep -v` yielded nothing, so every
# absence scan over it passed VACUOUSLY. That source was corrected, and the
# workaround was removed rather than left in place: section 4 now ASSERTS that
# no Search source is binary, so the defect class fails the gate instead of
# being silently tolerated by it.
code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }
# Code with double-quoted string literals removed, so a module that holds its own
# prohibition list as data is never judged by the very names it forbids.
code_no_strings() { code_of "$1" | sed 's/"[^"]*"//g'; }
# Whitespace-free code, for pinning a composition rather than a single line.
flat_of() { code_of "$1" | tr -d ' \n'; }

# The engine's source surface. Tests are excluded from absence scans: a test
# legitimately NAMES the thing it proves absent.
SHARED_SRC="packages/shared-types/src"
API_SRC="services/api/src"
WEB_SRC="apps/web/src/search"

SHARED_MODULES="search-document curriculum-search curriculum-search-filters \
search-terms search-typo search-permission search-freshness search-ranking \
search-fallback"
API_MODULES="curriculum-search search-document search-freshness note-retrieval"
WEB_MODULES="curriculum-search-service note-search-service curriculum-navigation-service"

SEARCH_SOURCES=""
for m in $SHARED_MODULES; do SEARCH_SOURCES="$SEARCH_SOURCES $SHARED_SRC/$m.ts"; done
for m in $API_MODULES; do SEARCH_SOURCES="$SEARCH_SOURCES $API_SRC/$m.ts"; done
for m in $WEB_MODULES; do SEARCH_SOURCES="$SEARCH_SOURCES $WEB_SRC/$m.ts"; done
SEARCH_VIEW="$WEB_SRC/CurriculumSearchView.tsx"

echo "===== SEARCH ENGINE COMPLETION GATE — Build Wave 9 ====="
echo ""

# ------------------------------------------------------------
# 1. SEARCH-001 through SEARCH-008 exist and are Founder approved
# ------------------------------------------------------------
[ -f "$REGISTRY/SEARCH_ENGINE_FEATURES.md" ] \
  || fail "Search Engine feature index is missing"
[ -f "$REGISTRY_SPEC" ] || fail "FEATURE_REGISTRY_SPEC.md is missing"
grep -Fq '## 9.11 Definition of Done' "$REGISTRY_SPEC" \
  || fail "the registry specification no longer defines the completion bar"

for id in 001 002 003 004 005 006 007 008; do
  spec="$(find "$REGISTRY" -maxdepth 1 -name "SEARCH-${id}_*.md" | head -1)"
  [ -n "$spec" ] || fail "SEARCH-${id} specification is missing from the Feature Registry"

  # Section 14: approval is the recorded Founder decision that the Feature exists.
  grep -Fq '[x] Approved' "$spec" || fail "SEARCH-${id} does not record Founder approval"

  # Section 8: a Feature past approval carries a lifecycle state.
  grep -Eq '^\*\*Lifecycle Status:\*\* (Approved|Specified|Planned|Building|Testing|Review|Production)' "$spec" \
    || fail "SEARCH-${id} has no lifecycle state at or beyond Approved"

  # Section 9.10: observable acceptance criteria, which 9.11 makes the bar.
  grep -Eq '^# 1[2-5]\. Acceptance Criteria' "$spec" \
    || fail "SEARCH-${id} has no Acceptance Criteria section"
  grep -Fq 'Definition of Done' "$spec" \
    || fail "SEARCH-${id} has no Definition of Done"
done

# Each approved Feature must have a build document recording how it was met.
for doc in \
  BUILD_WAVE_9_BATCH_1_SEARCH_DOCUMENT_AND_INDEX_MODEL \
  BUILD_WAVE_9_BATCH_2_CURRICULUM_SEARCH \
  BUILD_WAVE_9_BATCH_3_PERMISSION_AWARE_SEARCH \
  BUILD_WAVE_9_BATCH_4_SEARCH_FILTERS_AND_FACETS \
  BUILD_WAVE_9_BATCH_5_TECHNICAL_QUERY_NORMALIZATION \
  BUILD_WAVE_9_BATCH_6_BOUNDED_TYPO_RECOVERY \
  BUILD_WAVE_9_BATCH_7_PERSONAL_NOTES_SEARCH \
  BUILD_WAVE_9_BATCH_8_SEARCH_INDEXING_FRESHNESS \
  BUILD_WAVE_9_BATCH_9_SEARCH_RANKING_FALLBACK; do
  [ -f "docs/Engineering-OS/${doc}.md" ] || fail "missing build document ${doc}.md"
done

echo "PASS:  1. SEARCH-001 through SEARCH-008 exist, are approved, and carry acceptance criteria"

# ------------------------------------------------------------
# 2. The dependency graph is acyclic and correctly recorded
# ------------------------------------------------------------
# FEATURE_REGISTRY_SPEC.md section 12 prohibits circular dependencies. DEC-046
# corrected two classification defects; both must stay corrected.
SPEC_005="$(find "$REGISTRY" -maxdepth 1 -name 'SEARCH-005_*.md' | head -1)"
SPEC_008="$(find "$REGISTRY" -maxdepth 1 -name 'SEARCH-008_*.md' | head -1)"
depends_of() { awk '/^## Depends On/{f=1;next} /^## /{f=0} f' "$1" | grep -E '^- ' || true; }

if depends_of "$SPEC_005" | grep -qF 'SEARCH-008'; then
  fail "the SEARCH-005 to SEARCH-008 circular dependency was reintroduced"
fi
if depends_of "$SPEC_008" | grep -qF 'SEARCH-007'; then
  fail "the SEARCH-008 dependency on SEARCH-007 was reintroduced"
fi
depends_of "$SPEC_008" | grep -qF 'SEARCH-005' \
  || fail "SEARCH-008 no longer records its genuine SEARCH-005 prerequisite"

for dec in DEC-046 DEC-047 DEC-048; do
  grep -Fq "## ${dec}" "$LEDGER" \
    || fail "governing decision ${dec} is missing from the Decision Ledger"
done

echo "PASS:  2. the Search dependency graph is acyclic and its decisions are recorded"

# ------------------------------------------------------------
# 3. This gate proves IMPLEMENTATION completion, never acceptance
# ------------------------------------------------------------
# The inverse of the Wave 8 gate's governance check, and deliberately so.
# Nothing in this repository may claim a Human UAT or a product acceptance that
# has not occurred. A line that DENIES the claim is not a claim.
#
# This file is excluded from the corpus scan and checked separately below: it
# necessarily CONTAINS the phrases it forbids, and a scan that judged its own
# search pattern would fail on the day it was written.
SELF="scripts/verify-search-engine-completion.sh"
UAT_CLAIMS="$(grep -rniE 'human uat (has )?(passed|complete)|search product accepted|final product acceptance (is )?granted|mvp release ready' \
  docs/ scripts/ 2>/dev/null \
  | grep -vF "$SELF" \
  | grep -viE 'never|not |no |remains|unperformed|pending|until|before|must' || true)"
[ -z "$UAT_CLAIMS" ] \
  || fail "the repository claims a Human UAT or product acceptance that has not occurred:
$UAT_CLAIMS"

# This gate's own banner is held to the same rule. It reports implementation
# completion and must never be edited into an acceptance claim.
BANNER="$(grep -E '^echo ' "$SELF" || true)"
for claimed in 'SEARCH PRODUCT ACCEPTED' 'HUMAN UAT PASSED' \
               'PRODUCT ACCEPTANCE GRANTED' 'PRODUCTION READY' 'MVP RELEASE READY'; do
  if echo "$BANNER" | grep -qF "$claimed"; then
    fail "this gate's banner claims something it cannot prove: $claimed"
  fi
done
echo "$BANNER" | grep -qF 'FINAL SEARCH PRODUCT ACCEPTANCE NOT YET GRANTED' \
  || fail "this gate no longer states that product acceptance is withheld"
echo "$BANNER" | grep -qF 'READY FOR FOUNDER SEARCH HUMAN UAT' \
  || fail "this gate no longer states that Human UAT is the next required gate"

# DEC-047 must still require the human gate, so completion cannot quietly
# become acceptance later.
grep -Fq 'Human Acceptance Testing Is a Mandatory Release Gate' "$LEDGER" \
  || fail "DEC-047 no longer makes Human UAT a mandatory release gate"
grep -Fq 'automated Search Engine completion gate' "$SEQUENCE" \
  || fail "the roadmap no longer sequences this gate before Search UAT"

# The status document must not have been quietly advanced either. Reconciling it
# is a separate, later, authorized closure step.
if grep -Eq 'Search Engine.*\*\*COMPLETE\*\*|Build Wave 9 — Search Engine: \*\*COMPLETE\*\*' "$STATUS"; then
  fail "CURRENT_BUILD_STATUS declares the Search Engine complete before closure was authorized"
fi

echo "PASS:  3. no Human UAT or product acceptance is claimed anywhere"

# ------------------------------------------------------------
# 4. The engine implementation surface exists, and every module is tested
# ------------------------------------------------------------
for m in $SHARED_MODULES; do
  [ -f "$SHARED_SRC/$m.ts" ] || fail "shared Search model is missing: $m.ts"
  [ -f "$SHARED_SRC/$m.test.ts" ] || fail "shared Search model has no tests: $m.test.ts"
  grep -Fq "export * from \"./$m\";" "$SHARED_SRC/index.ts" \
    || fail "shared Search model is not exported: $m"
done
for m in $API_MODULES; do
  [ -f "$API_SRC/$m.ts" ] || fail "Search API service is missing: $m.ts"
  [ -f "$API_SRC/$m.test.ts" ] || fail "Search API service has no tests: $m.test.ts"
done
for m in $WEB_MODULES; do
  [ -f "$WEB_SRC/$m.ts" ] || fail "Search browser service is missing: $m.ts"
  [ -f "$WEB_SRC/$m.test.ts" ] || fail "Search browser service has no tests: $m.test.ts"
done
[ -f "$SEARCH_VIEW" ] || fail "the learner search surface is missing"

# Every Search source must be INSPECTABLE TEXT.
#
# This is not hygiene. A single NUL byte makes BSD grep treat a source as
# binary, `grep -v` then returns nothing, and every comment-stripped absence
# scan over that file — here and in the per-batch verifier — passes vacuously
# while proving nothing at all. That condition existed undetected in
# `curriculum-search.ts` through eight Wave 9 batches. A gate that cannot read a
# source must refuse to certify it.
# A NUL byte cannot be passed as a shell argument, so it is detected by BYTE
# COUNT: a file whose length is unchanged after deleting NULs contains none.
for src in $SEARCH_SOURCES "$SEARCH_VIEW" "$SHARED_SRC/note-retrieval.ts"; do
  RAW_BYTES="$(wc -c < "$src" | tr -d ' ')"
  TEXT_BYTES="$(LC_ALL=C tr -d '\000' < "$src" | wc -c | tr -d ' ')"
  [ "$RAW_BYTES" = "$TEXT_BYTES" ] \
    || fail "a Search source contains a NUL byte and is unreadable to text scans: $src"
  # Independent backstop: whatever the cause, a source that yields no
  # comment-stripped content would make every absence scan over it vacuous.
  [ -n "$(code_of "$src")" ] \
    || fail "a Search source yields no inspectable content; absence scans over it would pass vacuously: $src"
done

echo "PASS:  4. every Search module exists, is exported, is tested and is inspectable text"

# ------------------------------------------------------------
# 5. SEARCH-001 — the Search Document remains a derived, non-authoritative model
# ------------------------------------------------------------
SD="$SHARED_SRC/search-document.ts"
grep -Fq 'export interface SearchDocument' "$SD" || fail "the Search Document contract is missing"
grep -Fq 'export function buildSearchDocumentId' "$SD" || fail "stable document identity is missing"
grep -Fq '${input.sourceRecordStableId}@${input.sourceVersion}' "$SD" \
  || fail "document identity is no longer derived from stable identity and version"

# The indexed engine set is the structural boundary that keeps private content
# out of the shared model. Notes must never appear in it.
grep -Fq 'export const SEARCH_INDEXED_SOURCE_ENGINES = ["curriculum"] as const;' "$SD" \
  || fail "the indexed source engine set changed; private notes must never be indexed"
grep -Fq 'export function isSharedIndexEligible' "$SD" \
  || fail "the shared-index eligibility boundary is missing"

# A document may carry no learner identity and no authorization state, and it
# may never authorize itself.
grep -Fq 'export function canServeSearchDocument(resolution: SearchSourceResolution)' "$SD" \
  || fail "serving no longer requires an authoritative source resolution"
SD_FIELDS="$(awk '/^export interface SearchDocument \{/{f=1;next} /^\}/{f=0} f' "$SD" \
  | grep -oE '^\s+[a-zA-Z]+\??:' | tr -d ' ?:' | LC_ALL=C sort | tr '\n' ' ')"
for forbidden in userId ownerId studentId learnerId accessControl acl \
                 permissions policy roles noteId noteBody embedding; do
  case " $SD_FIELDS " in
    *" $forbidden "*) fail "the Search Document gained forbidden state: $forbidden" ;;
  esac
done
grep -Fq 'export const SEARCH_DOCUMENT_FORBIDDEN_FIELDS' "$SD" \
  || fail "the SEARCH-001 forbidden-field prohibition is not held as data"

echo "PASS:  5. SEARCH-001 remains a derived model that cannot authorize itself"

# ------------------------------------------------------------
# 6. SEARCH-002 — curriculum retrieval stays authenticated and bounded
# ------------------------------------------------------------
CS="$API_SRC/curriculum-search.ts"
CS_CODE="$(code_of "$CS")"
CS_FLAT="$(flat_of "$CS")"
CST="$SHARED_SRC/curriculum-search.ts"

grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$CS" \
  || fail "curriculum retrieval no longer reads through the caller's own client"
grep -Fq 'pathname === "/search/curriculum"' "$SERVER" \
  || fail "the approved curriculum search route is missing"

# The approved searchable vocabulary, pinned exactly.
echo "$(flat_of "$CST")" \
  | grep -Fq 'CURRICULUM_SEARCH_CONTENT_TYPES=["learning_path","course","mission","competency"]asconst;' \
  || fail "the approved searchable curriculum vocabulary changed"

# Escaping, publication constraint and the bounded over-fetch.
grep -Fq 'escapeCurriculumSearchPattern(variant.value)' "$CS" \
  || fail "retrieval patterns are no longer escaped before ILIKE matching"
CS_ESCAPES="$(echo "$CS_CODE" | grep -c 'escapeCurriculumSearchPattern(' || true)"
[ "$CS_ESCAPES" = "1" ] \
  || fail "escaping happens at $CS_ESCAPES sites; exactly one escaping path may exist"
grep -Fq '.eq("publication_state", "published")' "$CS" \
  || fail "the publication constraint was removed from curriculum retrieval"
grep -Fq '.limit(limit * 4)' "$CS" \
  || fail "the bounded candidate over-fetch is missing or became unbounded"

# The neutral deterministic order must remain available as the lower tie-break.
grep -Fq 'export function orderCurriculumSearchResults' "$CST" \
  || fail "the SEARCH-002 neutral deterministic ordering was removed"
grep -Fq 'a.sourceRecordStableId.localeCompare(b.sourceRecordStableId)' "$CST" \
  || fail "the stable-identity deterministic tie-break was removed"
# BOTH neutral orderings carry the tie-break: one over candidates, one over
# built documents. Pinning only the document one would leave candidate ordering
# non-deterministic, and it was previously provable only by test.
grep -Fq 'a.stableId.localeCompare(b.stableId)' "$CST" \
  || fail "the candidate stable-identity deterministic tie-break was removed"
# The composite version-resolution key must stay injective. It relies on the
# CLOSED content-type vocabulary, never on stable-id format: `stable_id` is
# unconstrained `text` in the schema, so a separator drawn from [a-z_] would be
# ambiguous the moment a stable id contained it.
grep -Fq 'const key = `${candidate.contentType}:${candidate.stableId}`;' "$CST" \
  || fail "the version-resolution composite key changed; its separator must stay outside [a-z_]"

echo "PASS:  6. SEARCH-002 retrieval stays authenticated, escaped, bounded and deterministic"

# ------------------------------------------------------------
# 7. SEARCH-003 — nothing reaches later processing before authorization
# ------------------------------------------------------------
# THE ENGINE-LEVEL INVARIANT. Each batch verifier only judges its own file; this
# proves the gate exists once, is the only way to a yes, and precedes everything.
SP="$SHARED_SRC/search-permission.ts"
SURFACERS="$(grep -rlF 'export function surfaceAuthorized' "$SHARED_SRC" "$API_SRC" 2>/dev/null || true)"
[ "$SURFACERS" = "$SHARED_SRC/search-permission.ts" ] \
  || fail "a second authorized-surfacing mechanism exists: $SURFACERS"
GATES="$(grep -rlF 'export function maySurface' "$SHARED_SRC" "$API_SRC" 2>/dev/null || true)"
[ "$GATES" = "$SHARED_SRC/search-permission.ts" ] \
  || fail "a second permission gate exists: $GATES"
grep -Fq 'return decision.outcome === "authorized";' "$SP" \
  || fail "the permission gate no longer admits exactly one outcome"

# Unauthorized and unavailable must remain indistinguishable to the learner.
grep -Fq 'export function collapseToObservable' "$SP" \
  || fail "withheld and absent results are no longer indistinguishable"

grep -Fq 'const candidates = surfaceAuthorized(permissioned);' "$CS" \
  || fail "curriculum search does not surface only authorized candidates"

# EXACTLY ONE client for the whole search, original pass and recovery alike.
# A second client is a second authorization path, which is how a recovery could
# quietly widen scope without any guard on the recovery itself noticing.
CS_CLIENTS="$(echo "$CS_CODE" | grep -c 'createUserScopedSupabaseClient(' || true)"
[ "$CS_CLIENTS" = "1" ] \
  || fail "curriculum search creates $CS_CLIENTS clients; every pass must reuse the caller's own"

echo "PASS:  7. SEARCH-003 provides exactly one surfacing authority, and it fails closed"

# ------------------------------------------------------------
# 8. SEARCH-004 — filters and facets describe only returned results
# ------------------------------------------------------------
SF="$SHARED_SRC/curriculum-search-filters.ts"
echo "$(flat_of "$SF")" \
  | grep -Fq 'CURRICULUM_SEARCH_FILTER_DIMENSIONS=["contentType"]asconst;' \
  || fail "the approved filter dimension set changed"
# A filter may never select an identity.
if code_no_strings "$SF" | grep -qE 'userId|ownerId|studentId|learnerId|user_id'; then
  fail "a filter dimension accepts an identity selector"
fi
grep -Fq 'export const CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS' "$SF" \
  || fail "the hidden-total prohibition is not held as data"
# A hidden, withheld or global total must be inexpressible, not merely unused.
if code_no_strings "$SF" | grep -qE 'candidateCount|totalCount|globalTotal|hiddenCount|withheldCount|unauthorizedCount|overFetchCount'; then
  fail "a hidden or global total became expressible in the facet model"
fi
# Facets are computed from the FINAL BOUNDED AUTHORIZED result set: the facet
# call must wrap the bounding builder directly, with nothing between them.
echo "$CS_FLAT" \
  | grep -Fq 'withCurriculumSearchFacets(buildRankedCurriculumSearchResults(classified,effectiveVariants,limit))' \
  || fail "facets are not computed from the bounded returned result set"

echo "PASS:  8. SEARCH-004 filters carry no identity and facets count only returned results"

# ------------------------------------------------------------
# 9. SEARCH-005 — the complete A + B query-interpretation model
# ------------------------------------------------------------
ST="$SHARED_SRC/search-terms.ts"
TY="$SHARED_SRC/search-typo.ts"
ST_BARE="$(code_no_strings "$ST")"
TY_BARE="$(code_no_strings "$TY")"

# The original query is always variant one and is never displaced.
grep -Fq '{ value: original, matchKind: "exact" }' "$ST" \
  || fail "the learner's original query is no longer the first retrieval variant"
# Technical tokens and technical punctuation stay protected.
grep -Fq 'export const PROTECTED_TECHNICAL_TERMS' "$ST" \
  || fail "the protected technical token list is missing"
for term in 'Get-ADUser' 'kubectl' 'index=botsv3' 'terraform plan' 'show vlan brief'; do
  grep -Fq "\"$term\"" "$ST" || fail "a protected technical token was removed: $term"
done
echo "$(flat_of "$ST")" \
  | grep -Fq 'REMOVABLE_TERMINAL_PUNCTUATION:readonlystring[]=["?","!",",",";",":"];' \
  || fail "the removable punctuation set changed; technical punctuation must stay protected"

# The vocabulary is static repository data and can never be corpus-derived.
grep -Fq 'export const CURATED_CURRICULUM_TERM_ALIASES' "$ST" \
  || fail "the curated alias vocabulary is missing"
ALIAS_ENTRIES="$(grep -c 'canonical: "' "$ST" || true)"
[ "$ALIAS_ENTRIES" = "1" ] \
  || fail "the curated vocabulary holds $ALIAS_ENTRIES aliases; exactly one is approved"
grep -Fq 'export const TYPO_RECOVERY_TARGETS' "$TY" \
  || fail "the typo target vocabulary is missing"
# Neither vocabulary module may read anything at all.
for module in "$ST" "$TY"; do
  if code_no_strings "$module" | grep -qE 'supabase|createUserScoped|createServer|fetch\(|await |\.from\('; then
    fail "the query-interpretation vocabulary became corpus-derived or performs a read: $module"
  fi
done

# Expansion and recovery stay bounded.
grep -Fq 'export const MAX_CURRICULUM_QUERY_VARIANTS = 4;' "$ST" \
  || fail "alias expansion is no longer bounded"
grep -Fq 'export const TYPO_MAX_EDIT_DISTANCE = 1;' "$TY" \
  || fail "typo recovery is no longer bounded to one edit"
grep -Fq 'export const TYPO_MAX_CORRECTED_TOKENS = 1;' "$TY" \
  || fail "typo recovery may now correct more than one token"
grep -Fq 'export const TYPO_MAX_RECOVERED_VARIANTS = 1;' "$TY" \
  || fail "typo recovery may now emit more than one recovered variant"

# Recovery runs only after zero usable results, at most once, on the SAME path.
echo "$CS_FLAT" | grep -Fq 'if(classified.length===0){' \
  || fail "typo recovery is no longer gated on a zero-result outcome"
CS_PASS_DEFS="$(echo "$CS_CODE" | grep -c 'const runAuthorizedPass = async (' || true)"
CS_PASS_CALLS="$(echo "$CS_CODE" | grep -c 'await runAuthorizedPass(' || true)"
[ "$CS_PASS_DEFS" = "1" ] \
  || fail "$CS_PASS_DEFS authorized-pass implementations exist; exactly one may exist"
[ "$CS_PASS_CALLS" = "2" ] \
  || fail "the authorized pass runs $CS_PASS_CALLS times; exactly the original and one recovery are allowed"
echo "$CS_FLAT" | grep -Fq 'awaitrunAuthorizedPass([{value:recovery.correctedQuery,matchKind:"typo"}]);' \
  || fail "the recovery pass no longer runs exactly one recovered variant"

# The match-class order is the engine's ordering vocabulary.
echo "$(flat_of "$ST")" \
  | grep -Fq 'CURRICULUM_MATCH_KINDS=["exact","normalized","alias","typo"]asconst;' \
  || fail "the approved match-class order changed"

# Adjustment metadata stays minimal.
grep -Fq 'export const SEARCH_TERM_FORBIDDEN_FIELDS' "$ST" \
  || fail "the adjustment prohibition is not held as data"
if echo "$ST_BARE$TY_BARE" | grep -qiE 'fuzzy|levenshtein|damerau|soundex|stemming|semantic|trgm|similarity|embedding'; then
  fail "an unbounded or semantic matching mechanism entered query interpretation"
fi

echo "PASS:  9. SEARCH-005 normalization, aliases and typo recovery stay static and bounded"

# ------------------------------------------------------------
# 10. SEARCH-006 — private notes stay private and stay separate
# ------------------------------------------------------------
NR="$API_SRC/note-retrieval.ts"
NR_CODE="$(code_of "$NR")"

grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$NR" \
  || fail "note retrieval no longer reads through the caller's own client"
# Ownership has exactly ONE mechanism: the database policy. A request may never
# name an owner, and the service may never filter by one.
for forbidden in user_id userId ownerId owner_id studentId learnerId; do
  if echo "$NR_CODE" | grep -qF "$forbidden"; then
    fail "note retrieval carries a second ownership mechanism: $forbidden"
  fi
done
grep -Fq 'export const NOTE_SEARCH_FORBIDDEN_REQUEST_FIELDS' "$SHARED_SRC/note-retrieval.ts" \
  || fail "the note request prohibition is not held as data"

# Note content may never become shared vocabulary, and note search may not
# compose the typo mechanism whose trigger is a cross-source policy question.
grep -Fq 'variant.matchKind !== "typo"' "$NR" \
  || fail "note search now composes typo recovery, which SEARCH-006 did not establish"

# Notes must not appear in any shared or curriculum Search module.
for src in "$SHARED_SRC/search-document.ts" "$SHARED_SRC/curriculum-search.ts" \
           "$SHARED_SRC/curriculum-search-filters.ts" "$SHARED_SRC/search-ranking.ts" \
           "$SHARED_SRC/search-fallback.ts" "$SHARED_SRC/search-freshness.ts" \
           "$API_SRC/curriculum-search.ts" "$API_SRC/search-freshness.ts"; do
  if code_no_strings "$src" | grep -qE 'student_notes|searchStudentNotes|noteId|note_body|noteBody'; then
    fail "a private note source entered a shared Search module: $src"
  fi
done

# The two sources are searched independently and grouped separately, and a note
# failure is never rendered as an empty note set.
grep -Fq 'Promise.allSettled' "$SEARCH_VIEW" \
  || fail "curriculum and note search are no longer settled independently"
grep -Fq 'describeNoteSearchUnavailable()' "$SEARCH_VIEW" \
  || fail "a failed note search has no honest unavailable state"
grep -Fq 'describeNoteResultGroup()' "$SEARCH_VIEW" \
  || fail "private note results are no longer labelled as a separate group"
grep -Fq 'describeCurriculumResultGroup()' "$SEARCH_VIEW" \
  || fail "curriculum results are no longer labelled as a separate group"

echo "PASS: 10. SEARCH-006 notes stay caller-owned, separately grouped and out of shared Search"

# ------------------------------------------------------------
# 11. SEARCH-007 — freshness is servability infrastructure, not ranking
# ------------------------------------------------------------
FR="$SHARED_SRC/search-freshness.ts"
FRS="$API_SRC/search-freshness.ts"

grep -Fq 'export function isSearchDocumentStale' "$SD" \
  || fail "staleness detection was removed"
grep -Fq 'sourceUpdatedAt: string;' "$SD" \
  || fail "the source freshness timestamp was removed from the document contract"
grep -Fq 'export const SEARCH_RECONCILIATION_MAX_DOCUMENTS' "$FR" \
  || fail "reconciliation is no longer bounded"
grep -Fq 'export const SEARCH_RECONCILIATION_MAX_ATTEMPTS = 2;' "$FR" \
  || fail "the bounded retry was removed or widened"
grep -Fq 'isSharedIndexEligible(document)' "$FRS" \
  || fail "private or non-shared content is no longer excluded from reconciliation"
grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$FRS" \
  || fail "reconciliation no longer reads as the caller"
# Retry must never widen access.
FR_CLIENTS="$(code_of "$FRS" | grep -c 'createUserScopedSupabaseClient(' || true)"
[ "$FR_CLIENTS" = "1" ] \
  || fail "the freshness path creates $FR_CLIENTS clients; retry must reuse the caller's own"

# Freshness must not have become a ranking engine.
if code_no_strings "$FR" | grep -qiE 'relevance|rankResults|scoreResult|boost|weighting|popularity'; then
  fail "the freshness pipeline acquired ranking behaviour"
fi

echo "PASS: 11. SEARCH-007 freshness stays bounded servability infrastructure"

# ------------------------------------------------------------
# 12. SEARCH-008 — the exact ranking precedence
# ------------------------------------------------------------
RK="$SHARED_SRC/search-ranking.ts"
RK_BARE="$(code_no_strings "$RK")"
RK_FLAT="$(flat_of "$RK")"

# R1 then R2, in that order and no other.
echo "$RK_FLAT" \
  | grep -Fq 'constmatchDelta=matchTierOf(a)-matchTierOf(b);if(matchDelta!==0)returnmatchDelta;returntitleTierOf(a)-titleTierOf(b);' \
  || fail "the ranking comparator changed; match class must dominate title precision"
# R2's vocabulary.
echo "$RK_FLAT" \
  | grep -Fq 'CURRICULUM_TITLE_PRECISIONS=["whole_title","title_token","title_substring","description_only"]asconst;' \
  || fail "the approved title-precision order changed"
# R3 and R4 are composed from SEARCH-002, never re-derived.
grep -Fq 'orderCurriculumSearchResults' "$RK" \
  || fail "ranking no longer composes the SEARCH-002 neutral order and stable-id tie-break"
grep -Fq 'CURRICULUM_MATCH_KINDS' "$RK" \
  || fail "ranking no longer composes the SEARCH-005 match classes"
echo "$(flat_of "$CST")" \
  | grep -Fq 'CURRICULUM_SEARCH_CONTENT_TYPES.indexOf(a.contentType' \
  || fail "the content-type neutral ordering was removed from SEARCH-002"

# Ranking bounds LAST.
RK_NEUTRAL_AT="$(echo "$RK_FLAT" | grep -bo 'constneutral=orderCurriculumSearchResults' | head -1 | cut -d: -f1 || true)"
RK_SORT_AT="$(echo "$RK_FLAT" | grep -bo 'constranked=\[...neutral\].sort' | head -1 | cut -d: -f1 || true)"
RK_SLICE_AT="$(echo "$RK_FLAT" | grep -bo 'constbounded=ranked.slice(0,limit);' | head -1 | cut -d: -f1 || true)"
[ -n "$RK_NEUTRAL_AT" ] || fail "the neutral ordering pre-pass is missing from ranking"
[ -n "$RK_SORT_AT" ] || fail "the ranking sort is missing"
[ -n "$RK_SLICE_AT" ] || fail "the ranking bound is missing"
[ "$RK_NEUTRAL_AT" -lt "$RK_SORT_AT" ] || fail "the neutral order no longer precedes ranking"
[ "$RK_SORT_AT" -lt "$RK_SLICE_AT" ] \
  || fail "the requested limit is applied before ranking; the best match could be truncated"

# No forbidden ranking signal, no numeric relevance, no randomness, no identity.
grep -Fq 'export const SEARCH_RANKING_FORBIDDEN_SIGNALS' "$RK" \
  || fail "the forbidden-ranking-signal prohibition is not held as data"
if echo "$RK_BARE" | grep -qiE 'relevance|boost|popularity|engagement|clickH|scoreOf|weightOf|sourceUpdatedAt|freshness|embedding|semantic|vector|learnerProgress'; then
  fail "a prohibited ranking signal entered the SEARCH-008 comparator"
fi
if echo "$RK_BARE" | grep -qE '\* *[0-9]+\.[0-9]|Math\.(pow|log|sqrt|exp|random)|shuffle'; then
  fail "numeric scoring or randomness entered the SEARCH-008 comparator"
fi
if echo "$RK_BARE" | grep -qE 'accessToken|supabase|userId|ownerId|studentId|learnerId'; then
  fail "an identity or client reached the SEARCH-008 comparator"
fi

echo "PASS: 12. SEARCH-008 ranking is deterministic, unscored and bounds only after ordering"

# ------------------------------------------------------------
# 13. SEARCH-008 — fallback keeps failure and emptiness apart
# ------------------------------------------------------------
FB="$SHARED_SRC/search-fallback.ts"
FB_BARE="$(code_no_strings "$FB")"
NAV="$WEB_SRC/curriculum-navigation-service.ts"
NAV_CODE="$(code_of "$NAV")"
VIEW_CODE="$(awk '/\{\/\*/{skip=1} !skip; /\*\/\}/{skip=0}' "$SEARCH_VIEW" | grep -vE '^\s*(//|\*|/\*)' || true)"
VIEW_FLAT="$(echo "$VIEW_CODE" | tr -d ' \n')"

echo "$(flat_of "$FB")" \
  | grep -Fq 'SEARCH_FALLBACK_REASONS=["no_results","search_unavailable"]asconst;' \
  || fail "the approved fallback reason vocabulary changed"
grep -Fq 'This is a search problem, not an empty result.' "$FB" \
  || fail "the degraded state no longer denies being an empty result"
echo "$VIEW_FLAT" \
  | grep -Fq 'constfallbackReason:SearchFallbackReason|undefined=degraded?"search_unavailable":results&&!error&&results.count===0?"no_results":undefined;' \
  || fail "the fallback state machine changed; failure and emptiness must stay distinct"
VIEW_DEGRADED="$(echo "$VIEW_CODE" | grep -c 'setDegraded(true)' || true)"
[ "$VIEW_DEGRADED" = "1" ] \
  || fail "the degraded state is set at $VIEW_DEGRADED sites; exactly one may exist"

# Fallback must not become a second query-interpretation engine, must not read
# anything, and must not carry a hidden channel.
echo "$(flat_of "$FB")" \
  | grep -Fq 'exportfunctionbuildCurriculumFallbackGuidance(input:{reason:SearchFallbackReason;query:string;filterActive:boolean;}):CurriculumFallbackGuidance{' \
  || fail "the fallback guidance signature changed; it must accept no result, count or client"
if echo "$FB_BARE" | grep -qiE 'synonym|alias|typo|levenshtein|editDistance|broaden|expandQuery|didYouMean|stemming|trgm|semantic|embedding'; then
  fail "a second query-interpretation mechanism entered SEARCH-008 fallback"
fi
if echo "$FB_BARE" | grep -qE 'hiddenCount|withheldCount|candidateCount|unauthorizedCount|noteId|noteBody|analytics|supabase|fetch\('; then
  fail "a hidden, private or read channel entered fallback guidance"
fi
grep -Fq 'export const SEARCH_FALLBACK_FORBIDDEN_FIELDS' "$FB" \
  || fail "the fallback prohibition is not held as data"

# The fallback surface performs no search and alters no filter by itself.
FALLBACK_BLOCK="$(awk '/fallbackGuidance && !showingOriginal/{cap=1} cap; /^      \)\}$/{if(cap)exit}' "$SEARCH_VIEW" || true)"
for forbidden in 'runSearch(' 'setContentTypes(' 'searchCurriculum(' 'searchMyNotes('; do
  if echo "$FALLBACK_BLOCK" | grep -qF "$forbidden"; then
    fail "the fallback surface performs a search or filter change itself: $forbidden"
  fi
done
if echo "$VIEW_CODE" | grep -qE '^\s*clearFilters\(\);'; then
  fail "filters are relaxed automatically rather than by the learner"
fi

# Structured navigation reuses the existing authenticated route, as the caller.
grep -Fq '>(accessToken, "/curriculum/paths", {' "$NAV" \
  || fail "structured navigation no longer reads as the caller through the existing route"
NAV_PATHS="$(echo "$NAV_CODE" | grep -oE '"/[a-z/-]+"' | LC_ALL=C sort -u | tr '\n' ' ')"
[ "$NAV_PATHS" = '"/curriculum/paths" ' ] \
  || fail "structured navigation reaches an unapproved route: $NAV_PATHS"
if echo "$NAV_CODE" | grep -qE 'userId|ownerId|studentId|learnerId|createServerSupabaseClient|fetch\(|Authorization'; then
  fail "structured navigation carries an identity, privileged path or its own transport"
fi
grep -Fq 'describeCurriculumNavigationUnavailable()' "$SEARCH_VIEW" \
  || fail "a failed navigation read is not distinguished from an empty curriculum"
grep -Fq 'describeCurriculumNavigationEmpty()' "$SEARCH_VIEW" \
  || fail "an empty curriculum is not distinguished from a failed navigation read"

echo "PASS: 13. SEARCH-008 fallback stays honest, bounded and learner-driven"

# ------------------------------------------------------------
# 14. THE CROSS-FEATURE ORDER — the invariant no batch owns
# ------------------------------------------------------------
# Proven by byte offset in the comment-stripped service, so a comment claiming
# the order cannot satisfy it.
#
# Offsets are taken WITHIN the region that actually executes in sequence — the
# authorized pass and everything after it. Comparing against `searchOneType`
# would compare a helper's DEFINITION position, not its execution position, and
# would prove nothing.

# (a) The read itself: the caller's own client is created once and handed to the
#     helper, and the publication constraint precedes the match.
grep -Fq 'const supabase = createUserScopedSupabaseClient(accessToken);' "$CS" \
  || fail "the caller-scoped client is not created once in the search entry point"
grep -Fq 'searchOneType(supabase, contentType, patterns, limit)' "$CS" \
  || fail "retrieval does not receive the caller's own client"
READ_FLAT="$(echo "$CS_FLAT" | grep -o 'asyncfunctionsearchOneType.*construnAuthorizedPass' || true)"
[ -n "$READ_FLAT" ] || fail "the retrieval helper is missing"
R_PUBLISHED="$(echo "$READ_FLAT" | grep -bo '.eq("publication_state","published")' | head -1 | cut -d: -f1 || true)"
R_MATCH="$(echo "$READ_FLAT" | grep -bo '.or(matchConditions)' | head -1 | cut -d: -f1 || true)"
R_DECIDE="$(echo "$READ_FLAT" | grep -bo 'decideFromAuthoritativeRead(' | head -1 | cut -d: -f1 || true)"
[ -n "$R_PUBLISHED" ] && [ -n "$R_MATCH" ] && [ -n "$R_DECIDE" ] \
  || fail "a required retrieval step is missing from the authorized read"
[ "$R_PUBLISHED" -lt "$R_MATCH" ] \
  || fail "the publication constraint no longer precedes the match"
[ "$R_MATCH" -lt "$R_DECIDE" ] \
  || fail "the permission decision no longer follows the authoritative read"

# (b) The sequential pipeline, from the authorized pass onward.
PIPE_FLAT="$(echo "$CS_FLAT" | grep -o 'construnAuthorizedPass.*' || true)"
[ -n "$PIPE_FLAT" ] || fail "the authorized pass is missing"
at() { echo "$PIPE_FLAT" | grep -bo "$1" | head -1 | cut -d: -f1 || true; }

O_SURFACE="$(at 'constcandidates=surfaceAuthorized(permissioned);')"
O_VERSION="$(at 'constselected=selectHighestPublishedVersion(candidates);')"
O_FILTER="$(at 'constfiltered=applyCurriculumSearchFilter(selected,filter);')"
O_CLASSIFY="$(at 'matchKind:classifyCurriculumMatch(')"
O_RANK="$(at 'buildRankedCurriculumSearchResults(classified,effectiveVariants,limit)')"

for step in O_SURFACE O_VERSION O_FILTER O_CLASSIFY O_RANK; do
  eval "value=\$$step"
  [ -n "$value" ] || fail "a required Search pipeline step is missing: $step"
done

[ "$O_SURFACE"    -lt "$O_VERSION"   ] || fail "version resolution does not follow authorization"
[ "$O_VERSION"    -lt "$O_FILTER"    ] || fail "SEARCH-004 filtering does not follow version resolution"
[ "$O_FILTER"     -lt "$O_CLASSIFY"  ] || fail "SEARCH-005 classification does not follow filtering"
[ "$O_CLASSIFY"   -lt "$O_RANK"      ] || fail "SEARCH-008 ranking does not follow classification"

# (c) Bounding and faceting are the LAST two steps, and they are proven by
#     COMPOSITION rather than by offset: the facet call WRAPS the bounding
#     builder, so it necessarily receives the ranked, bounded set and nothing
#     else. An offset comparison would be wrong here — a wrapping call opens
#     before the value it wraps.
echo "$PIPE_FLAT" \
  | grep -Fq 'withCurriculumSearchFacets(buildRankedCurriculumSearchResults(classified,effectiveVariants,limit))' \
  || fail "facets are not computed directly from the ranked, bounded result set"
echo "$PIPE_FLAT" \
  | grep -Fq 'returnwithCurriculumQueryAdjustment(withCurriculumSearchFacets(' \
  || fail "the query adjustment is no longer attached outside the facet computation"
grep -Fq 'const bounded = ranked.slice(0, limit);' "$RK" \
  || fail "the requested limit is no longer applied after ranking"

# Classification, and therefore ranking, iterates the FILTERED, surfaced set.
grep -Fq 'for (const entry of filtered) {' "$CS" \
  || fail "match classification no longer iterates the authorized, filtered set"
# Nothing unauthorized or raw may be handed to ranking.
if echo "$CS_CODE" | grep -qE 'buildRankedCurriculumSearchResults\([^)]*(permissioned|accessToken|supabase|data)'; then
  fail "an unauthorized or raw value reached the ranking call"
fi

echo "PASS: 14. the full Search pipeline order holds: authorize, filter, classify, rank, bound"

# ------------------------------------------------------------
# 15. The learner-visible response boundary
# ------------------------------------------------------------
# Every Search module holds its prohibitions as data. The engine gate asserts the
# lists exist, are asserted by tests, and that no member appears in real code.
for pair in \
  "$SHARED_SRC/search-document.ts:SEARCH_DOCUMENT_FORBIDDEN_FIELDS" \
  "$SHARED_SRC/search-permission.ts:SEARCH_PERMISSION_FORBIDDEN_FIELDS" \
  "$SHARED_SRC/curriculum-search-filters.ts:CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS" \
  "$SHARED_SRC/search-terms.ts:SEARCH_TERM_FORBIDDEN_FIELDS" \
  "$SHARED_SRC/search-typo.ts:SEARCH_TYPO_FORBIDDEN_FIELDS" \
  "$SHARED_SRC/search-freshness.ts:SEARCH_FRESHNESS_FORBIDDEN_FIELDS" \
  "$SHARED_SRC/search-ranking.ts:SEARCH_RANKING_FORBIDDEN_SIGNALS" \
  "$SHARED_SRC/search-fallback.ts:SEARCH_FALLBACK_FORBIDDEN_FIELDS" \
  "$SHARED_SRC/note-retrieval.ts:NOTE_SEARCH_FORBIDDEN_REQUEST_FIELDS"; do
  file="${pair%%:*}"; name="${pair##*:}"
  grep -Fq "export const $name" "$file" \
    || fail "a Search prohibition list is missing: $name"
  # Asserted by SOME test, not necessarily the sibling one. A request-shape
  # prohibition legitimately belongs where requests are made, not beside the
  # constant, and pinning the sibling file would force the wrong home for it.
  ASSERTED="$(grep -rl "$name" "$SHARED_SRC" "$API_SRC" "$WEB_SRC" 2>/dev/null \
    | grep '\.test\.ts$' || true)"
  [ -n "$ASSERTED" ] \
    || fail "a Search prohibition list is not asserted by any test: $name"
done

# The learner surface must never render an internal ordering or permission value.
for forbidden in matchKind titlePrecision relevance rankScore editDistance \
                 candidateCount hiddenCount withheldCount unauthorizedCount \
                 overFetchCount acl permissions ownerId learnerId; do
  if grep -qF "$forbidden" "$SEARCH_VIEW"; then
    fail "an internal Search value reached the learner surface: $forbidden"
  fi
done

# The browser sends no identity on any Search request.
for svc in "$WEB_SRC/curriculum-search-service.ts" "$WEB_SRC/note-search-service.ts" "$NAV"; do
  if code_of "$svc" | grep -qE 'userId|user_id|ownerId|studentId|learnerId'; then
    fail "a Search browser service sends an identity selector: $svc"
  fi
done

echo "PASS: 15. no identity, permission internal or hidden total reaches a learner response"

# ------------------------------------------------------------
# 16. Engine-wide architectural absence proofs
# ------------------------------------------------------------
# ONE authorization model across every Search path: the caller's own client.
for src in $SEARCH_SOURCES; do
  if code_of "$src" | grep -qF 'createServerSupabaseClient'; then
    fail "a service-role Search path exists: $src"
  fi
done

# No unapproved retrieval, ranking or infrastructure technology anywhere.
ABSENCE_SCAN=""
for src in $SEARCH_SOURCES; do
  ABSENCE_SCAN="$ABSENCE_SCAN
$(code_no_strings "$src")"
done
if echo "$ABSENCE_SCAN" | grep -qiE 'elasticsearch|opensearch|algolia|meilisearch|pinecone|weaviate|qdrant|vectorStore|embedding|openai|anthropic|ollama'; then
  fail "an external search provider, vector store or AI dependency entered Search"
fi
if echo "$ABSENCE_SCAN" | grep -qiE 'setInterval|setTimeout|cron|bullmq|scheduler|backgroundWorker|localStorage|sessionStorage|indexedDB'; then
  fail "a background worker, scheduler or client-side store entered Search"
fi
if echo "$ABSENCE_SCAN" | grep -qiE 'tsvector|to_tsquery|pg_trgm|materialized view|search_documents'; then
  fail "a persisted or full-text search index entered Search"
fi

# No Search migration, and the migration set is unchanged in count.
SEARCH_MIGRATIONS="$(ls supabase/migrations/*search*.sql supabase/migrations/*rank*.sql \
  supabase/migrations/*facet*.sql supabase/migrations/*index*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$SEARCH_MIGRATIONS" = "0" ] || fail "a Search-specific database migration exists"

# No dependency was added for Search.
for forbidden in elasticsearch opensearch algolia meilisearch redis \
                 pinecone weaviate qdrant openai anthropic ollama; do
  if grep -qi "\"$forbidden" package.json packages/shared-types/package.json \
       services/api/package.json apps/web/package.json; then
    fail "a Search provider or AI dependency was added: $forbidden"
  fi
done

# The Search route census. Exactly one learner curriculum route, one private
# notes route, one Founder route — and the reused Curriculum navigation route.
SEARCH_ROUTES="$(grep -oE 'pathname === "/(search|notes/search|admin/search)[a-z/-]*"' "$SERVER" \
  | LC_ALL=C sort -u | tr '\n' ' ')"
[ "$SEARCH_ROUTES" = 'pathname === "/admin/search/freshness" pathname === "/notes/search" pathname === "/search/curriculum" ' ] \
  || fail "the Search route set changed: $SEARCH_ROUTES"
grep -Fq 'pathname === "/curriculum/paths"' "$SERVER" \
  || fail "the existing published-paths route structured navigation reuses is missing"
grep -Fq 'await founder(request)' "$SERVER" \
  || fail "the Founder freshness route lost its privileged guard"

echo "PASS: 16. Search acquired no provider, AI, index, worker, migration or extra route"

# ------------------------------------------------------------
# 17. The verification infrastructure this engine depends on
# ------------------------------------------------------------
[ -f scripts/verify-wave9.sh ] || fail "the Wave 9 per-batch verifier is missing"
[ -f scripts/smoke-api.sh ] || fail "the API smoke script is missing"
for route in '/search/curriculum' '/notes/search' '/admin/search/freshness' '/curriculum/paths'; do
  grep -Fq "$route" scripts/smoke-api.sh \
    || fail "smoke coverage is missing for a Search-reachable route: $route"
done

echo "PASS: 17. the engine's verification infrastructure exists and covers every Search route"

# ------------------------------------------------------------
# 18. Defer to the per-batch verifier, which runs the toolchain
# ------------------------------------------------------------
echo ""
echo "--- deferring to the Wave 9 per-batch verifier ---"
bash scripts/verify-wave9.sh

echo ""
echo "============================================================"
echo "SEARCH ENGINE IMPLEMENTATION COMPLETION VERIFIED"
echo "SEARCH-001 THROUGH SEARCH-008 VERIFIED"
echo "READY FOR FOUNDER SEARCH HUMAN UAT"
echo "FINAL SEARCH PRODUCT ACCEPTANCE NOT YET GRANTED"
echo "============================================================"
echo ""
echo "This gate proves IMPLEMENTATION completion only. It does NOT prove:"
echo "  - browser-rendered usability or rendered accessibility"
echo "    (apps/web has no DOM harness; every accessibility claim is structural)"
echo "  - real PostgreSQL row level security enforcement"
echo "    (there is no live database harness; authorization evidence is"
echo "     query-level and structural, never live-database proof)"
echo "  - Founder acceptance or Human UAT of any kind (DEC-047)"
echo "  - production readiness"
echo ""
echo "Automated verification is necessary and never sufficient."
echo "The CERT-008 correction migration remains committed but NOT executed."
echo "============================================================"
