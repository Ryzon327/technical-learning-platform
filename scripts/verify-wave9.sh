#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# Build Wave 9 — Search Engine.
#
# SEARCH-001 through SEARCH-004 at this stage. This verifier evolves narrowly as
# SEARCH-005 through SEARCH-008 are implemented; it must not be widened
# speculatively.
#
# The Search Engine completion gate (scripts/verify-search-engine-completion.sh)
# belongs at Search Engine closure and does not exist yet.
#
# Absence checks judge COMMENT-STRIPPED code. These sources document precisely
# what they exclude, so a naive full-text scan would flag their own exclusion
# notes as violations.
# ============================================================

REGISTRY="docs/Feature-Registry/Search-Engine"
SEARCH_TYPES="packages/shared-types/src/search-document.ts"
SEARCH_TYPE_TESTS="packages/shared-types/src/search-document.test.ts"
SEARCH_SERVICE="services/api/src/search-document.ts"
SEARCH_SERVICE_TESTS="services/api/src/search-document.test.ts"
SEARCH_DOC="docs/Engineering-OS/BUILD_WAVE_9_BATCH_1_SEARCH_DOCUMENT_AND_INDEX_MODEL.md"
SERVER="services/api/src/server.ts"

fail() { echo "FAIL: $1"; exit 1; }
code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }
# Code with double-quoted string literals removed.
#
# Several of these modules hold their own prohibitions AS DATA — the reason
# strings in CURRICULUM_SEARCH_FILTER_DISPOSITIONS name "UUID", "draft" and
# "retired" precisely to record that those are excluded. A naive absence scan
# would flag a module for documenting what it refuses to do, so absence checks
# that could collide with a prohibition list run against this instead.
code_no_strings() { code_of "$1" | sed 's/"[^"]*"//g'; }

for p in "$SEARCH_TYPES" "$SEARCH_TYPE_TESTS" "$SEARCH_SERVICE" \
         "$SEARCH_SERVICE_TESTS" "$SEARCH_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

SEARCH_TYPES_CODE="$(code_of "$SEARCH_TYPES")"
SEARCH_SERVICE_CODE="$(code_of "$SEARCH_SERVICE")"

# ------------------------------------------------------------
# 1. SEARCH-001 exists and is approved
# ------------------------------------------------------------
SEARCH_001="$(find "$REGISTRY" -maxdepth 1 -name 'SEARCH-001_*.md' | head -1)"
[ -n "$SEARCH_001" ] || fail "SEARCH-001 specification is missing from the Feature Registry"
grep -Fq '[x] Approved' "$SEARCH_001" || fail "SEARCH-001 does not record Founder approval"
grep -Fq 'Definition of Done' "$SEARCH_001" || fail "SEARCH-001 has no Definition of Done"

echo "PASS: SEARCH-001 exists and records Founder approval"

# ------------------------------------------------------------
# 2. The Search Document contract exists
# ------------------------------------------------------------
grep -Fq 'export interface SearchDocument {' "$SEARCH_TYPES" \
  || fail "the Search Document contract is missing"
grep -Fq 'export * from "./search-document";' packages/shared-types/src/index.ts \
  || fail "the Search Document model is not exported from shared-types"

# Every field SEARCH-001 section 5 requires.
for field in modelVersion documentId sourceEngine sourceRecordStableId sourceVersion \
             contentType title searchableText keywords sourceReference \
             publicationState accessScope sourceUpdatedAt indexedAt; do
  grep -Fq "  ${field}" "$SEARCH_TYPES" \
    || fail "the Search Document is missing a required field: $field"
done

echo "PASS: the Search Document contract carries the approved field set"

# ------------------------------------------------------------
# 3. Search owns no authoritative content storage
# ------------------------------------------------------------
for write in '.insert(' '.update(' '.upsert(' '.delete(' '.rpc('; do
  if echo "$SEARCH_SERVICE_CODE" | grep -qF "$write"; then
    fail "SEARCH-001 must write no source data: $write"
  fi
done
if echo "$SEARCH_TYPES_CODE$SEARCH_SERVICE_CODE" | grep -qiE 'search_documents|create table|materialized view'; then
  fail "SEARCH-001 must not create a materialized index or table"
fi
# `|| true` is load-bearing: under `set -euo pipefail` an `ls` with no match
# fails the pipeline, the assignment fails, and every check below is skipped
# silently. That defect class was fixed 18 times in verify-wave8.sh.
SEARCH_MIGRATIONS="$(ls supabase/migrations/*search*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$SEARCH_MIGRATIONS" = "0" ] || fail "SEARCH-001 must add no migration; found $SEARCH_MIGRATIONS"
if grep -rqiE 'tsvector|to_tsquery|pg_trgm' supabase/migrations/ 2>/dev/null; then
  fail "SEARCH-001 must not introduce full-text search infrastructure"
fi

echo "PASS: Search owns no authoritative storage and added no migration"

# ------------------------------------------------------------
# 4. No shared private-notes index
# ------------------------------------------------------------
grep -Fq 'export const SEARCH_INDEXED_SOURCE_ENGINES = ["curriculum"] as const;' "$SEARCH_TYPES" \
  || fail "the indexed source engine set changed; notes must never be indexed"
# Quoted list entries are excluded: SEARCH_DOCUMENT_FORBIDDEN_FIELDS names these
# very fields in order to forbid them, and must not be read as using them.
SEARCH_NOTE_SCAN="$(printf '%s\n%s\n' "$SEARCH_TYPES_CODE" "$SEARCH_SERVICE_CODE" \
  | grep -vE '^\s*"[A-Za-z_]+",?$' || true)"
for forbidden in student_notes searchStudentNotes noteId note_body; do
  if echo "$SEARCH_NOTE_SCAN" | grep -qF "$forbidden"; then
    fail "a private note source leaked into the Search foundation: $forbidden"
  fi
done
grep -Fq 'export function isSharedIndexEligible' "$SEARCH_TYPES" \
  || fail "there is no way to keep private content out of a shared index"

echo "PASS: private notes cannot enter the shared Search foundation"

# ------------------------------------------------------------
# 5. No AI dependency in baseline Search
# ------------------------------------------------------------
if echo "$SEARCH_TYPES_CODE$SEARCH_SERVICE_CODE" | grep -qiE 'openai|anthropic|ollama|ai[-_ ]?gateway'; then
  fail "an AI dependency exists in baseline Search"
fi
if echo "$SEARCH_NOTE_SCAN" | grep -qiE '\bembedding'; then
  fail "SEARCH-001 must not require embeddings"
fi

echo "PASS: baseline Search requires no AI"

# ------------------------------------------------------------
# 6. Later Search features remain unimplemented in the SEARCH-001 module
# ------------------------------------------------------------
# NARROWED for SEARCH-002, not removed.
#
# SEARCH-001 forbade every search route because it had no learner surface.
# SEARCH-002 is the feature authorized to introduce exactly one. The boundary is
# preserved and is now EXACT: that route and no other.
SEARCH_ROUTES="$(grep -oE 'pathname === "/search[^"]*"' "$SERVER" | sort -u || true)"
[ "$SEARCH_ROUTES" = 'pathname === "/search/curriculum"' ] \
  || fail "the search route set changed; expected only the curriculum search:
$SEARCH_ROUTES"
for route in '"/search"' '"/curriculum/search"' '"/admin/search"' '"/search/public"' '"/search/notes"'; do
  if grep -Fq "pathname === $route" "$SERVER"; then
    fail "an unapproved search route exists: $route"
  fi
done

# SEARCH-001's own module still owns no surface. Only SEARCH-002's service is
# wired into the router.
if grep -Fq 'from "./search-document"' "$SERVER"; then
  fail "the SEARCH-001 module is wired into the router; it owns no surface"
fi
grep -Fq 'from "./curriculum-search"' "$SERVER" \
  || fail "the SEARCH-002 service is not wired into the router"

# No query, ranking, faceting, typo tolerance or indexing pipeline.
for forbidden in ilike textSearch synonym typo fuzzy levenshtein facet \
                 setInterval cron queue; do
  if echo "$SEARCH_SERVICE_CODE" | grep -qiF "$forbidden"; then
    fail "later Search feature behaviour leaked into SEARCH-001: $forbidden"
  fi
done
# Ranking must not exist yet. Word-bounded: "rank" would otherwise match
# ordinary words, and this file legitimately discusses what it excludes.
if echo "$SEARCH_TYPES_CODE$SEARCH_SERVICE_CODE" | grep -qiE '\b(rankResults|scoreResult|relevanceScore)\b'; then
  fail "SEARCH-008 ranking leaked into SEARCH-001"
fi

echo "PASS: no later Search behaviour leaked into the SEARCH-001 module"

# ------------------------------------------------------------
# 7. Stable identity and version discipline
# ------------------------------------------------------------
grep -Fq 'export function buildSearchDocumentId' "$SEARCH_TYPES" \
  || fail "the document identity builder is missing"
grep -Fq '${input.sourceRecordStableId}@${input.sourceVersion}' "$SEARCH_TYPES" \
  || fail "the document id is not derived from stable identity and version"
grep -Fq 'SEARCH_DOCUMENT_FORBIDDEN_FIELDS' "$SEARCH_TYPES" \
  || fail "the forbidden-field prohibition is not held as data"
grep -Fq 'SEARCH_DOCUMENT_FORBIDDEN_FIELDS' "$SEARCH_TYPE_TESTS" \
  || fail "the forbidden-field prohibition is not asserted by tests"
# Internal identifiers must be prohibited, not carried.
for internal in '"id"' '"uuid"' '"internalId"' '"sourceRecordId"'; do
  grep -Fq "$internal" "$SEARCH_TYPES" \
    || fail "an internal identifier is missing from the prohibition list: $internal"
done

echo "PASS: document identity is stable and never internal"

# ------------------------------------------------------------
# 8. Source resolution is required before serving
# ------------------------------------------------------------
grep -Fq 'export async function resolveSearchDocument' "$SEARCH_SERVICE" \
  || fail "source resolution is missing"
grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$SEARCH_SERVICE" \
  || fail "resolution does not read through the caller's own RLS-scoped client"
if echo "$SEARCH_SERVICE_CODE" | grep -qF 'createServerSupabaseClient'; then
  fail "resolution must not bypass row level security"
fi
grep -Fq 'export function isSearchDocumentStale' "$SEARCH_TYPES" \
  || fail "staleness cannot be detected"
for outcome in resolved missing stale unpublished unauthorized unavailable; do
  grep -Fq "  \"$outcome\"" "$SEARCH_TYPES" \
    || fail "a source resolution outcome is missing: $outcome"
done

echo "PASS: a document must resolve against its authoritative source"

# ------------------------------------------------------------
# 9. Authorization can never come from indexed metadata alone
# ------------------------------------------------------------
grep -Fq 'export function canServeSearchDocument(resolution: SearchSourceResolution): boolean' "$SEARCH_TYPES" \
  || fail "canServeSearchDocument must take a resolution, never a document"
if echo "$SEARCH_TYPES_CODE" | grep -qE 'canServeSearchDocument\(document'; then
  fail "a document-only authorization path exists"
fi
if echo "$SEARCH_SERVICE_CODE" | grep -qE 'document\.(accessScope|publicationState)'; then
  fail "resolution decides from the document's own access metadata"
fi
for forbidden in userId user_id studentId actorId; do
  if echo "$SEARCH_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "a caller-supplied identity reached the Search path: $forbidden"
  fi
done

echo "PASS: authorization is source-derived and never index-derived"

# ------------------------------------------------------------
# 10. No query persistence or search surveillance
# ------------------------------------------------------------
for forbidden in search_history search_queries query_log searchAnalytics; do
  if echo "$SEARCH_TYPES_CODE$SEARCH_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "learner query persistence was introduced: $forbidden"
  fi
done
if echo "$SEARCH_SERVICE_CODE" | grep -qE 'log\(.*query|console\.'; then
  fail "query text may be logged"
fi

echo "PASS: no learner query is persisted or logged"

# ============================================================
# SEARCH-002 — Curriculum Search (Batch 2)
# ============================================================

CS_TYPES="packages/shared-types/src/curriculum-search.ts"
CS_TYPE_TESTS="packages/shared-types/src/curriculum-search.test.ts"
CS_SERVICE="services/api/src/curriculum-search.ts"
CS_SERVICE_TESTS="services/api/src/curriculum-search.test.ts"
CS_VIEW="apps/web/src/search/CurriculumSearchView.tsx"
CS_WEB_SERVICE="apps/web/src/search/curriculum-search-service.ts"
CS_DOC="docs/Engineering-OS/BUILD_WAVE_9_BATCH_2_CURRICULUM_SEARCH.md"

for p in "$CS_TYPES" "$CS_TYPE_TESTS" "$CS_SERVICE" "$CS_SERVICE_TESTS" \
         "$CS_VIEW" "$CS_WEB_SERVICE" "$CS_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

CS_TYPES_CODE="$(code_of "$CS_TYPES")"
CS_SERVICE_CODE="$(code_of "$CS_SERVICE")"
CS_VIEW_CODE="$(awk '/\{\/\*/{skip=1} !skip; /\*\/\}/{skip=0}' "$CS_VIEW" \
  | grep -vE '^\s*(//|\*|/\*)' || true)"

# --- 12. The route boundary -------------------------------------------------
grep -Fq 'pathname === "/search/curriculum"' "$SERVER" \
  || fail "the approved curriculum search route is missing"
SEARCH_ROUTE_BLOCK="$(awk '/\/\/ SEARCH-002 — curriculum search\./{cap=1} cap; /pathname === "\/bookmarks"/{cap=0}' "$SERVER" || true)"
echo "$SEARCH_ROUTE_BLOCK" | grep -Fq 'resolveTrustedRequestIdentity(request)' \
  || fail "the curriculum search route does not require trusted authentication"
echo "$SEARCH_ROUTE_BLOCK" | grep -Fq 'request.method === "GET"' \
  || fail "the curriculum search route is not a GET read"
for method in POST PATCH PUT DELETE; do
  if echo "$SEARCH_ROUTE_BLOCK" | grep -Fq "request.method === \"$method\""; then
    fail "the curriculum search route accepts a mutation method: $method"
  fi
done

echo "PASS: exactly one authenticated curriculum search route exists"

# --- 13. Authorization ------------------------------------------------------
grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$CS_SERVICE" \
  || fail "curriculum search does not read through the caller's RLS-scoped client"
if echo "$CS_SERVICE_CODE" | grep -qF 'createServerSupabaseClient'; then
  fail "curriculum search must not bypass row level security"
fi
for forbidden in userId user_id studentId actorId; do
  if echo "$CS_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "a caller-supplied identity reached curriculum search: $forbidden"
  fi
done
echo "$CS_SERVICE_CODE" | grep -Fq '.eq("publication_state", "published")' \
  || fail "curriculum search does not constrain reads to published rows"

echo "PASS: curriculum search is caller-scoped and published-only"

# --- 14. Exactly four searchable types, no notes ----------------------------
grep -Fq 'learning_path: "learning_paths"' "$CS_SERVICE" || fail "learning_path is not searchable"
grep -Fq 'course: "courses"' "$CS_SERVICE" || fail "course is not searchable"
grep -Fq 'mission: "missions"' "$CS_SERVICE" || fail "mission is not searchable"
grep -Fq 'competency: "competencies"' "$CS_SERVICE" || fail "competency is not searchable"
for forbidden in learning_modules curriculum_assets lab_definitions student_notes; do
  if echo "$CS_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "an unapproved source became searchable: $forbidden"
  fi
done
grep -Fq 'export const CURRICULUM_SEARCH_CONTENT_TYPES = [' "$CS_TYPES" \
  || fail "the searchable type vocabulary is missing"

echo "PASS: exactly the four approved curriculum types are searchable"

# --- 15. Search owns no storage and writes no Curriculum truth --------------
for write in '.insert(' '.update(' '.upsert(' '.delete(' '.rpc('; do
  if echo "$CS_SERVICE_CODE" | grep -qF "$write"; then
    fail "curriculum search must write nothing: $write"
  fi
done
if echo "$CS_TYPES_CODE$CS_SERVICE_CODE" | grep -qiE 'search_documents|materialized|tsvector|to_tsquery|pg_trgm'; then
  fail "curriculum search must not create an index or FTS infrastructure"
fi
if echo "$CS_SERVICE_CODE" | grep -qiE 'setinterval|cron|queue|worker|cache'; then
  fail "curriculum search must not introduce a pipeline or cache"
fi
SEARCH_MIGRATIONS_NOW="$(ls supabase/migrations/*search*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$SEARCH_MIGRATIONS_NOW" = "0" ] || fail "SEARCH-002 must add no migration"

echo "PASS: curriculum search owns no storage and writes no Curriculum truth"

# --- 16. Bounded query, limit and candidate over-fetch ----------------------
grep -Fq 'export const CURRICULUM_SEARCH_QUERY_MAX_LENGTH = 200;' "$CS_TYPES" \
  || fail "the query length bound is missing"
grep -Fq 'export const CURRICULUM_SEARCH_MAX_LIMIT = 100;' "$CS_TYPES" \
  || fail "the result limit bound is missing"
# Matched on the CALL, not the import, in both cases below: a leftover import
# would otherwise satisfy these guards while the bound was gone.
grep -Fq 'validateCurriculumSearchQuery(input.query)' "$CS_SERVICE" \
  || fail "the service does not validate the query"
grep -Fq 'normalizeCurriculumSearchLimit(input.limit)' "$CS_SERVICE" \
  || fail "the service does not bound the result limit"
# The candidate over-fetch exists so version collapse cannot starve results.
# It must remain bounded and must never become unbounded.
grep -Fq '.limit(limit * 4)' "$CS_SERVICE" \
  || fail "the candidate over-fetch is missing or no longer bounded"
# NARROWED FOR SEARCH-005A, then for SEARCH-008. The bound is unchanged; the
# function applying it moved twice, because match-class tiering and then title
# precision must run between neutral ordering and the limit slice, or an exact
# match could be truncated in favour of a weaker one. Re-pinned just as strictly
# on the new call, INCLUDING the limit argument.
grep -Fq 'buildRankedCurriculumSearchResults(classified, effectiveVariants, limit)' "$CS_SERVICE" \
  || fail "the returned results are not bounded by the requested limit"
# The approved ranking builder must COMPOSE the SEARCH-005 match classes and the
# SEARCH-002 neutral order rather than re-deriving either of them.
grep -Fq 'CURRICULUM_MATCH_KINDS' packages/shared-types/src/search-ranking.ts \
  || fail "ranking does not reuse the SEARCH-005 match-class vocabulary"
grep -Fq 'orderCurriculumSearchResults' packages/shared-types/src/search-ranking.ts \
  || fail "ranking does not reuse the SEARCH-002 neutral deterministic ordering"

echo "PASS: query, limit and candidate over-fetch are all bounded"

# --- 17. Escaped literal matching, no later Search behaviour ----------------
# Matched on the CALL, not the import: a leftover import would otherwise satisfy
# this guard while the raw query went straight into the ILIKE pattern.
# NARROWED FOR SEARCH-005A. SEARCH-002 escaped one pattern; SEARCH-005A escapes
# EVERY approved variant, so the guard follows the escaping to its new call site
# and additionally proves no unescaped value can reach the matcher.
grep -Fq 'escapeCurriculumSearchPattern(variant.value)' "$CS_SERVICE" \
  || fail "the retrieval variants are not escaped before ILIKE matching"
ESCAPE_CALLS="$(echo "$CS_SERVICE_CODE" | grep -c 'escapeCurriculumSearchPattern(' || true)"
[ "$ESCAPE_CALLS" = "1" ] \
  || fail "escaping happens at $ESCAPE_CALLS call sites; exactly one escaping path may exist"
echo "$CS_SERVICE_CODE" | tr -d ' \n' | grep -Fq '.or(matchConditions)' \
  || fail "the matcher no longer consumes the escaped variant patterns"
if echo "$CS_SERVICE_CODE" | grep -qE '\.or\(`[^`]*\$\{query\}'; then
  fail "an unescaped raw query reaches the ILIKE matcher"
fi
grep -Fq "s\\\\\\\\%_" "$CS_TYPES" >/dev/null 2>&1 || true
grep -Fq 'replace(/[\\%_]/g' "$CS_TYPES" \
  || fail "the LIKE control characters are not escaped"
# NARROWED FOR SEARCH-005B, not weakened. Bounded typo recovery against a closed
# approved vocabulary is now the approved deliverable, so `typo` is no longer
# forbidden here. Every UNBOUNDED matching technique still is, and the list grew
# to name the mechanisms SEARCH-005B deliberately did not use.
for forbidden in fuzzy synonym levenshtein damerau soundex stemming semantic \
                 trgm spelling similarity; do
  if echo "$CS_TYPES_CODE$CS_SERVICE_CODE" | grep -qiF "$forbidden"; then
    fail "unbounded matching leaked into Curriculum Search: $forbidden"
  fi
done
for forbidden in relevance boost popularity rankResults scoreResult; do
  if echo "$CS_TYPES_CODE$CS_SERVICE_CODE" | grep -qiF "$forbidden"; then
    fail "SEARCH-008 ranking leaked into SEARCH-002: $forbidden"
  fi
done
# `facet` was forbidden here while SEARCH-004 was unimplemented. Faceting is now
# the approved SEARCH-004 deliverable and is verified by sections 28-37 below;
# everything SEARCH-008 owns is still forbidden by the two loops above.
if echo "$CS_TYPES_CODE$CS_SERVICE_CODE$CS_VIEW_CODE" | grep -qiE 'openai|anthropic|ollama|embedding'; then
  fail "an AI dependency leaked into Curriculum Search"
fi

echo "PASS: matching is escaped and literal, with no later Search behaviour"

# --- 18. Read resolution, not supersession ---------------------------------
grep -Fq 'export function selectHighestPublishedVersion' "$CS_TYPES" \
  || fail "the highest-published-version read resolution is missing"
# Matched on the CALL, not the import: a leftover import would otherwise satisfy
# this guard while every published version reached the learner.
grep -Fq 'selectHighestPublishedVersion(candidates)' "$CS_SERVICE" \
  || fail "the service does not collapse multiple published versions"
# Search must never claim Curriculum lifecycle authority.
for forbidden in supersede retire canonicalVersion determineCurrentTruth resolveLifecycle; do
  if echo "$CS_TYPES_CODE$CS_SERVICE_CODE" | grep -qiF "$forbidden"; then
    fail "SEARCH-002 asserted Curriculum lifecycle authority: $forbidden"
  fi
done

echo "PASS: version collapse is read resolution and asserts no supersession"

# --- 19. Result contract and privacy ---------------------------------------
grep -Fq 'export interface CurriculumSearchResults {' "$CS_TYPES" \
  || fail "the result contract is missing"
for forbidden in totalCount resultSources hiddenCount cursor offset; do
  if echo "$CS_TYPES_CODE$CS_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "a hidden total or pagination contract exists: $forbidden"
  fi
done
if echo "$CS_SERVICE_CODE" | grep -qE 'search_history|query_log|console\.'; then
  fail "a learner query may be persisted or logged"
fi

echo "PASS: count means returned results, with no hidden total and no query logging"

# --- 20. Accessible learner surface ----------------------------------------
grep -Fq 'htmlFor="curriculum-search-query"' "$CS_VIEW" \
  || fail "the search input has no associated label"
grep -Fq '<form' "$CS_VIEW" || fail "the search surface is not a semantic form"
grep -Fq 'type="submit"' "$CS_VIEW" || fail "the search form has no submit control"
grep -Fq 'aria-live="polite"' "$CS_VIEW" || fail "the result count is not announced"
grep -Fq 'describeCurriculumSearchCount' "$CS_VIEW" \
  || fail "the returned result count is not exposed"
grep -Fq 'describeCurriculumContentType' "$CS_VIEW" \
  || fail "the content type is not expressed in text"
grep -Fq 'role="alert"' "$CS_VIEW" || fail "search failure is not announced"
for custom in 'role="listbox"' 'role="combobox"' 'onKeyDown' 'tabIndex'; do
  if grep -Fq "$custom" "$CS_VIEW"; then
    fail "the search surface must not build a custom control: $custom"
  fi
done
if grep -qiE 'className="[^"]*\b(green|red|amber|danger)\b' "$CS_VIEW"; then
  fail "search status must not be conveyed by colour"
fi
grep -Fq 'CurriculumSearchView' apps/web/src/auth/AuthenticatedApp.tsx \
  || fail "curriculum search is not reachable from the workspace"

echo "PASS: the learner search surface is accessible and reachable"

# ============================================================
# SEARCH-003 — Permission-Aware Search (Batch 3)
# ============================================================

SP_TYPES="packages/shared-types/src/search-permission.ts"
SP_TYPE_TESTS="packages/shared-types/src/search-permission.test.ts"
SP_DOC="docs/Engineering-OS/BUILD_WAVE_9_BATCH_3_PERMISSION_AWARE_SEARCH.md"

for p in "$SP_TYPES" "$SP_TYPE_TESTS" "$SP_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

SP_TYPES_CODE="$(code_of "$SP_TYPES")"
# Quoted single-token lines are the prohibition lists themselves, which name the
# very fields they exist to forbid.
SP_SCAN="$(echo "$SP_TYPES_CODE" | grep -vE '^\s*"[A-Za-z_]+",?$' || true)"

# --- 21. The permission contract exists and is exhaustive -------------------
grep -Fq 'export type SearchPermissionDecision =' "$SP_TYPES" \
  || fail "the permission decision contract is missing"
grep -Fq 'export const SEARCH_PERMISSION_OUTCOMES = [' "$SP_TYPES" \
  || fail "the permission outcome vocabulary is missing"
for outcome in authorized unauthorized unavailable; do
  grep -Fq "  \"$outcome\"" "$SP_TYPES" \
    || fail "a permission outcome is missing: $outcome"
done
# Discriminated union, not a boolean: `unavailable` must be impossible to
# collapse into true/false by accident.
grep -Fq '{ outcome: "authorized" }' "$SP_TYPES" \
  || fail "the permission contract is not a discriminated union"
# The EXACT signature is pinned, not just the name. A second parameter would let
# access metadata become a bypass — `maySurface(decision, accessScope)` — while
# the original return line survived untouched. That mutation was caught by
# nothing until this check pinned the signature.
grep -Fq 'export function maySurface(decision: SearchPermissionDecision): boolean {' "$SP_TYPES" \
  || fail "maySurface does not take exactly one permission decision"
grep -Fq 'return decision.outcome === "authorized";' "$SP_TYPES" \
  || fail "maySurface does not fail closed to authorized only"
# The gate must be a single expression: no early return may precede it.
MAY_SURFACE_BODY="$(awk '/^export function maySurface\(/{cap=1} cap; /^}/{if(cap) exit}' "$SP_TYPES" || true)"
MAY_SURFACE_RETURNS="$(echo "$MAY_SURFACE_BODY" | grep -c 'return ' || true)"
[ "$MAY_SURFACE_RETURNS" = "1" ] \
  || fail "maySurface has more than one return path; it must be a single gate"

echo "PASS: the permission contract is exhaustive and fails closed"

# --- 22. Unauthorized and missing collapse ----------------------------------
grep -Fq 'export function decideFromAuthoritativeRead' "$SP_TYPES" \
  || fail "decisions are not derived from an authoritative read"
grep -Fq 'return input.found ? searchAuthorized() : searchUnauthorized();' "$SP_TYPES" \
  || fail "a not-found row no longer collapses into unauthorized"
grep -Fq 'export function collapseToObservable' "$SP_TYPES" \
  || fail "there is no observable collapse for withheld results"
# No learner-observable "missing" outcome may exist.
if echo "$SP_SCAN" | grep -qE '"(missing|withheld|hidden|denied)"'; then
  fail "a learner-observable withheld state was introduced"
fi

echo "PASS: unauthorized and missing are observably indistinguishable"

# --- 23. internalReason is internal only ------------------------------------
grep -Fq 'internalReason' "$SP_TYPES" \
  || fail "the internal diagnostic reason is missing"
# It may live only on the unavailable branch.
grep -Fq '| { outcome: "unavailable"; internalReason?: string };' "$SP_TYPES" \
  || fail "internalReason is not confined to the unavailable branch"
# It must never reach a document, a response or the learner.
# Judged on comment-stripped code: these files legitimately document that
# internalReason must stay out of them, and a prose match is not a leak.
for leaked in "$SEARCH_TYPES" "$CS_TYPES" "$CS_SERVICE" "$CS_VIEW" "$CS_WEB_SERVICE"; do
  if code_of "$leaked" | grep -Fq 'internalReason'; then
    fail "internalReason leaked into a learner-facing path: $leaked"
  fi
done

echo "PASS: internalReason is internal-only and reaches no learner surface"

# --- 24. Search owns no authorization policy --------------------------------
# The contract must not know what any owning engine's policy means.
for policy in publication_state published user_id auth.uid role enrollment note_ owner_id; do
  if echo "$SP_SCAN" | grep -qF "$policy"; then
    fail "owning-engine authorization policy leaked into Search: $policy"
  fi
done
grep -Fq 'SEARCH_PERMISSION_FORBIDDEN_FIELDS' "$SP_TYPES" \
  || fail "the ACL/identity prohibition list is not held as data"
# No ACL or role schema may be introduced anywhere.
if ls supabase/migrations/*acl*.sql supabase/migrations/*role*.sql \
     supabase/migrations/*permission*.sql >/dev/null 2>&1; then
  fail "SEARCH-003 must not introduce ACL, role or permission schema"
fi

echo "PASS: Search composes decisions and owns no authorization policy"

# --- 25. SearchDocument never becomes an ACL document -----------------------
for forbidden in userId user_id ownerId owner_id roleId roles acl aclEntries \
                 permissions grants hiddenCount withheldCount; do
  if echo "$SEARCH_TYPES_CODE" | grep -vE '^\s*"[A-Za-z_]+",?$' | grep -qF "$forbidden"; then
    fail "an ACL or identity field entered SearchDocument: $forbidden"
  fi
done
# The SEARCH-001 invariant must still hold.
grep -Fq 'export function canServeSearchDocument(resolution: SearchSourceResolution): boolean' "$SEARCH_TYPES" \
  || fail "canServeSearchDocument no longer requires a source resolution"

echo "PASS: SearchDocument carries no ACL, identity or permission fields"

# --- 26. Curriculum Search adopted the contract without a second system -----
grep -Fq 'surfaceAuthorized(permissioned)' "$CS_SERVICE" \
  || fail "curriculum search does not surface only authorized candidates"
grep -Fq 'decideFromAuthoritativeRead' "$CS_SERVICE" \
  || fail "curriculum search does not derive decisions from its authoritative read"
# Adoption must not have introduced a duplicate authorization layer.
if echo "$CS_SERVICE_CODE" | grep -qE 'auth\.uid|user_id ===|role ===|isOwner|hasPermission'; then
  fail "a second authorization layer was created in curriculum search"
fi
# The SEARCH-002 guarantees must be intact.
grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$CS_SERVICE" \
  || fail "curriculum search stopped using the caller's RLS-scoped client"
if echo "$CS_SERVICE_CODE" | grep -qF 'createServerSupabaseClient'; then
  fail "a service-role client entered a Search path"
fi
for forbidden in userId user_id studentId actorId; do
  if echo "$CS_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "a caller-supplied identity drives Search authorization: $forbidden"
  fi
done
for write in '.insert(' '.update(' '.upsert(' '.delete(' '.rpc('; do
  if echo "$CS_SERVICE_CODE" | grep -qF "$write"; then
    fail "Search writes source authorization or content state: $write"
  fi
done

echo "PASS: curriculum search adopted the contract with no second authorization system"

# --- 27. No cache, no index, no early notes ---------------------------------
grep -Fq 'export const SEARCH_CACHE_SECURITY_CONTRACT' "$SP_TYPES" \
  || fail "the cache security contract is missing"
grep -Fq 're-authorized against source authority' "$SP_TYPES" \
  || fail "the cache contract omits source re-authorization"
# The contract is architecture only; nothing may build one.
if echo "$SP_SCAN$CS_SERVICE_CODE" | grep -qiE 'new Map\(\)\.set|cacheStore|permissionCache|materiali|setInterval|cron|queue'; then
  fail "SEARCH-003 must not build a cache, index or worker"
fi
# SEARCH-006 must not arrive early.
for forbidden in student_notes searchStudentNotes noteId note_body; do
  if echo "$SP_SCAN$CS_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "notes were implemented early: $forbidden"
  fi
done

echo "PASS: no cache or index exists and notes remain unimplemented"

# ============================================================
# SEARCH-004 — Search Filters and Facets (Batch 4)
# ============================================================

SF_TYPES="packages/shared-types/src/curriculum-search-filters.ts"
SF_TYPE_TESTS="packages/shared-types/src/curriculum-search-filters.test.ts"
SF_WEB_TESTS="apps/web/src/search/curriculum-search-service.test.ts"
SF_API_CLIENT="apps/web/src/lib/api-client.ts"
SF_DOC="docs/Engineering-OS/BUILD_WAVE_9_BATCH_4_SEARCH_FILTERS_AND_FACETS.md"

for p in "$SF_TYPES" "$SF_TYPE_TESTS" "$SF_WEB_TESTS" "$SF_API_CLIENT" "$SF_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

SF_TYPES_CODE="$(code_of "$SF_TYPES")"
SF_TYPES_BARE="$(code_no_strings "$SF_TYPES")"
SF_SERVICE_BARE="$(code_no_strings "$CS_SERVICE")"
# The service composition with all whitespace removed, so a guard can pin an
# expression that legitimately spans several lines.
CS_SERVICE_FLAT="$(echo "$CS_SERVICE_CODE" | tr -d ' \n')"

# --- 28. SEARCH-004 exists and is approved ----------------------------------
SEARCH_004="$(find "$REGISTRY" -maxdepth 1 -name 'SEARCH-004_*.md' | head -1)"
[ -n "$SEARCH_004" ] || fail "SEARCH-004 specification is missing from the Feature Registry"
grep -Fq '[x] Approved' "$SEARCH_004" || fail "SEARCH-004 does not record Founder approval"
grep -Fq 'export * from "./curriculum-search-filters";' packages/shared-types/src/index.ts \
  || fail "the filter model is not exported from shared-types"

echo "PASS: SEARCH-004 exists and records Founder approval"

# --- 29. Exactly one filter dimension, over exactly the searchable types -----
grep -Fq 'export const CURRICULUM_SEARCH_FILTER_DIMENSIONS = ["contentType"] as const;' "$SF_TYPES" \
  || fail "SEARCH-004 must expose exactly one filter dimension: contentType"
# DERIVED from the searchable set, never restated. A restated list could name a
# type search cannot return, or drift from the set SEARCH-002 actually reads.
echo "$SF_TYPES_CODE" | tr -d ' \n' \
  | grep -Fq 'CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES=CURRICULUM_SEARCH_CONTENT_TYPES;' \
  || fail "the filter vocabulary is not derived from the searchable content types"
# No second vocabulary may be declared in this module.
if echo "$SF_TYPES_CODE" | grep -qE '^\s*"(learning_path|course|mission|competency)"'; then
  fail "the filter module declares its own content-type vocabulary"
fi

echo "PASS: one filter dimension, derived from exactly the four searchable types"

# --- 30. No unsupported filter dimension is exposed -------------------------
# Each of these is recorded as deferred, not applicable or not exposed. None may
# become a filter, a facet or a request parameter.
for forbidden in learningPathStableId courseStableId moduleStableId missionStableId \
                 competencyStableId tagId labId noteId publicationStateFilter \
                 accessScopeFilter; do
  if echo "$SF_TYPES_BARE$SF_SERVICE_BARE" | grep -qF "$forbidden"; then
    fail "an unapproved filter dimension was exposed: $forbidden"
  fi
done
# The route accepts the approved parameter and nothing else.
echo "$SEARCH_ROUTE_BLOCK" | grep -Fq 'url.searchParams.getAll("contentType")' \
  || fail "the route does not read repeated contentType values"
for forbidden in 'JSON.parse' '"filters"' '"filter"' '"publicationState"' \
                 '"accessScope"' '"tag"' '"learningPath"' '"sort"' '"order"'; do
  if echo "$SEARCH_ROUTE_BLOCK" | grep -Fq "$forbidden"; then
    fail "the search route accepts an unapproved filter input: $forbidden"
  fi
done
# No internal identifier may become a filter or facet value.
if echo "$SF_TYPES_BARE" | grep -qiE 'uuid|\.id\b|internalId'; then
  fail "an internal identifier reached the filter or facet model"
fi

echo "PASS: no hierarchy, tag, lab, scope, publication-state or UUID filter exists"

# --- 31. Filtering runs AFTER authorization, never before -------------------
# Pinned on the CALL, matched against the flattened service because the call
# wraps across lines. The import line ends in a comma, not "(", so a leftover
# import cannot satisfy this guard while the validation was gone.
echo "$CS_SERVICE_FLAT" \
  | grep -Fq 'validateCurriculumSearchContentTypeFilter(input.contentTypes)' \
  || fail "the service does not validate the content-type filter"
grep -Fq 'applyCurriculumSearchFilter(selected, filter)' "$CS_SERVICE" \
  || fail "the service does not apply the filter to the resolved result set"
# EXACTLY ONCE, and only to the resolved set. Pinning the position of the first
# call is not enough on its own: an ADDITIONAL application against the
# permissioned or pre-resolution candidate list would sit earlier in the
# pipeline and still leave the pinned call in place. Counting the call sites
# closes that, and naming the forbidden arguments makes the failure legible.
FILTER_CALLS="$(echo "$CS_SERVICE_CODE" | grep -c 'applyCurriculumSearchFilter(' || true)"
[ "$FILTER_CALLS" = "1" ] \
  || fail "the content-type filter is applied $FILTER_CALLS times; it may be applied exactly once, to the resolved result set"
for premature in 'applyCurriculumSearchFilter(permissioned' 'applyCurriculumSearchFilter(candidates' \
                 'applyCurriculumSearchFilter(documents'; do
  if echo "$CS_SERVICE_CODE" | grep -Fq "$premature"; then
    fail "the filter is applied before authorization or version resolution: $premature"
  fi
done
# ORDER IS THE SECURITY PROPERTY. Row level security, then the SEARCH-003
# decision, then version resolution, and only then the filter. A filter that ran
# earlier could influence which rows were authorized.
SURFACE_LINE="$(grep -n 'surfaceAuthorized(permissioned)' "$CS_SERVICE" | head -1 | cut -d: -f1)"
RESOLVE_LINE="$(grep -n 'selectHighestPublishedVersion(candidates)' "$CS_SERVICE" | head -1 | cut -d: -f1)"
FILTER_LINE="$(grep -n 'applyCurriculumSearchFilter(selected, filter)' "$CS_SERVICE" | head -1 | cut -d: -f1)"
[ -n "$SURFACE_LINE" ] && [ -n "$RESOLVE_LINE" ] && [ -n "$FILTER_LINE" ] \
  || fail "the authorization, resolution and filter steps are not all present"
[ "$SURFACE_LINE" -lt "$RESOLVE_LINE" ] \
  || fail "version resolution runs before SEARCH-003 surfacing"
[ "$RESOLVE_LINE" -lt "$FILTER_LINE" ] \
  || fail "the SEARCH-004 filter runs before version resolution or authorization"
# The filter must not become an authorization decision of its own.
if echo "$SF_TYPES_BARE" | grep -qiE 'authoriz|permission|maySurface|accessToken|supabase'; then
  fail "the filter model reaches into authorization"
fi

echo "PASS: filtering runs strictly after authorization and cannot influence it"

# --- 32. Facets are computed from the returned authorized results only ------
grep -Fq 'export function buildCurriculumSearchFacets' "$SF_TYPES" \
  || fail "the facet builder is missing"
# Pinned on the exact composition: facets are built from the BOUNDED, ORDERED
# result set the learner receives. Anything else — the candidate list, the
# permissioned list, the over-fetch window — would be a hidden-record channel.
# NARROWED FOR SEARCH-005A, then for SEARCH-008. The SECURITY PROPERTY IS
# UNCHANGED: facets are still computed from the final bounded authorized result
# set, and the facet call still wraps the bounding builder DIRECTLY with nothing
# between them. Only the builder that produces that set changed, and the
# adjustment wrapper is still attached outside the facet call so it cannot
# influence any count.
echo "$CS_SERVICE_FLAT" \
  | grep -Fq 'withCurriculumSearchFacets(buildRankedCurriculumSearchResults(classified,effectiveVariants,limit))' \
  || fail "facets are not computed from the bounded returned result set"
# Only the approved vocabulary may become a facet value.
grep -Fq 'if (!isCurriculumSearchContentType(contentType)) continue;' "$SF_TYPES" \
  || fail "the facet builder does not restrict values to the approved vocabulary"
# A type with no returned result is omitted, never reported as zero.
grep -Fq '(counts.get(contentType) ?? 0) > 0' "$SF_TYPES" \
  || fail "the facet builder reports a type with no returned result"
# Section 11: a facet failure omits facets and preserves the search.
grep -Fq 'export function buildCurriculumSearchFacetsSafely' "$SF_TYPES" \
  || fail "facet failure does not degrade safely"
grep -Fq 'withCurriculumSearchFacets' "$CS_SERVICE" \
  || fail "the service does not attach facets through the safe path"

echo "PASS: facets count only the returned authorized results"

# --- 33. No hidden, global or over-fetch total is expressible ---------------
grep -Fq 'export const CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS' "$SF_TYPES" \
  || fail "the forbidden-total prohibition is not held as data"
for forbidden in candidateCount totalCount globalTotal hiddenCount \
                 unauthorizedCount withheldCount overFetchCount; do
  grep -Fq "\"$forbidden\"" "$SF_TYPES" \
    || fail "a hidden total is missing from the prohibition list: $forbidden"
  # Prose and the prohibition list itself are excluded, so this judges real code.
  if echo "$SF_TYPES_BARE$SF_SERVICE_BARE" | grep -qF "$forbidden"; then
    fail "a hidden or global total entered the response: $forbidden"
  fi
done
grep -Fq 'CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS' "$SF_TYPE_TESTS" \
  || fail "the forbidden-total prohibition is not asserted by tests"
# The sum invariant must exist and be asserted.
grep -Fq 'export function curriculumSearchFacetCountsMatchResults' "$SF_TYPES" \
  || fail "the facet-count invariant is missing"
grep -Fq 'curriculumSearchFacetCountsMatchResults' "$SF_TYPE_TESTS" \
  || fail "the facet-count invariant is not asserted by tests"
grep -Fq 'expect(total).toBe(results.count);' "$CS_SERVICE_TESTS" \
  || fail "the service tests do not assert that facet counts sum to the response count"

echo "PASS: facet counts sum to the returned count, with no hidden or global total"

# --- 34. Hidden-content leakage is covered by executable tests --------------
grep -Fq 'the bounded over-fetch window never reaches a facet count' "$CS_SERVICE_TESTS" \
  || fail "no test proves the over-fetch window cannot reach a facet count"
grep -Fq 'a collapsed older version does not raise a count' "$CS_SERVICE_TESTS" \
  || fail "no test proves a resolved-away version cannot raise a facet count"
grep -Fq 'filtering does not change which sources are read' "$CS_SERVICE_TESTS" \
  || fail "no test proves the filter cannot influence which sources are read"
grep -Fq 'a withheld candidate cannot raise a count' "$SF_TYPE_TESTS" \
  || fail "no test proves a withheld candidate cannot raise a facet count"

echo "PASS: hidden-content leakage is covered by executable tests"

# --- 35. SearchDocument gained nothing -------------------------------------
if echo "$SEARCH_TYPES_CODE" | grep -qiE 'facet|filterValue|hierarchyLabel|parentTitle'; then
  fail "SEARCH-004 expanded the SEARCH-001 Search Document contract"
fi
if echo "$SF_TYPES_BARE" | grep -qiE 'acl|roleId|ownerId|userId'; then
  fail "identity or ACL metadata entered the filter model"
fi

echo "PASS: SEARCH-001's Search Document contract is unchanged"

# --- 36. Accessible native filter controls ----------------------------------
grep -Fq '<fieldset>' "$CS_VIEW" || fail "the filters are not grouped in a fieldset"
grep -Fq '<legend>' "$CS_VIEW" || fail "the filter group has no legend"
grep -Fq 'type="checkbox"' "$CS_VIEW" || fail "the filters are not native checkboxes"
grep -Fq 'htmlFor={inputId}' "$CS_VIEW" || fail "a filter control has no associated label"
grep -Fq 'describeCurriculumSearchClearFilters' "$CS_VIEW" \
  || fail "there is no clear-all control"
grep -Fq 'type="button"' "$CS_VIEW" || fail "the clear control is not a real button"
# Counts must be words, and must never claim a platform-wide total.
grep -Fq 'describeCurriculumSearchFacetCount' "$CS_VIEW" \
  || fail "facet counts are not expressed in text"
grep -Fq 'in these results' "$SF_TYPES" \
  || fail "facet count wording does not scope the count to the returned results"
if echo "$SF_TYPES_CODE" | grep -qiE 'in the platform|found overall|in total|available overall'; then
  fail "facet wording implies a corpus-wide total"
fi
for custom in 'role="checkbox"' 'role="listbox"' 'draggable' 'onDragStart' 'onKeyDown'; do
  if grep -Fq "$custom" "$CS_VIEW"; then
    fail "the filter surface must not build a custom or drag control: $custom"
  fi
done

echo "PASS: filters are accessible native controls with text counts"

# --- 37. SEARCH-005 through SEARCH-008 remain unimplemented -----------------
# NARROWED FOR SEARCH-005B on the same basis as section 17.
for forbidden in fuzzy synonym levenshtein damerau soundex stemming semantic \
                 trgm spelling similarity; do
  if echo "$SF_TYPES_BARE$SF_SERVICE_BARE" | grep -qiF "$forbidden"; then
    fail "unbounded matching leaked into SEARCH-004: $forbidden"
  fi
done
for forbidden in relevance boost popularity rankResults scoreResult weighting; do
  if echo "$SF_TYPES_BARE$SF_SERVICE_BARE" | grep -qiF "$forbidden"; then
    fail "SEARCH-008 ranking leaked into SEARCH-004: $forbidden"
  fi
done
for forbidden in student_notes searchStudentNotes noteId note_body; do
  if echo "$SF_TYPES_BARE$SF_SERVICE_BARE" | grep -qF "$forbidden"; then
    fail "SEARCH-006 notes leaked into SEARCH-004: $forbidden"
  fi
done
if echo "$SF_TYPES_BARE$SF_SERVICE_BARE" | grep -qiE 'materiali|tsvector|to_tsquery|pg_trgm|setInterval|cron|queue|facetCache'; then
  fail "SEARCH-007 indexing or caching leaked into SEARCH-004"
fi
if echo "$SF_TYPES_BARE" | grep -qiE 'openai|anthropic|ollama|embedding'; then
  fail "an AI dependency entered the filter model"
fi
# No migration and no dependency.
SEARCH_MIGRATIONS_AFTER="$(ls supabase/migrations/*search*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$SEARCH_MIGRATIONS_AFTER" = "0" ] || fail "SEARCH-004 must add no migration"
FILTER_MIGRATIONS="$(ls supabase/migrations/*facet*.sql supabase/migrations/*filter*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$FILTER_MIGRATIONS" = "0" ] || fail "SEARCH-004 must add no filter or facet migration"

echo "PASS: no later Search behaviour leaked into SEARCH-004"

# ============================================================
# SEARCH-005A — Technical Query Normalization and Curated Aliases (Batch 5)
# ============================================================

ST_TYPES="packages/shared-types/src/search-terms.ts"
ST_TYPE_TESTS="packages/shared-types/src/search-terms.test.ts"
ST_DOC="docs/Engineering-OS/BUILD_WAVE_9_BATCH_5_TECHNICAL_QUERY_NORMALIZATION.md"

for p in "$ST_TYPES" "$ST_TYPE_TESTS" "$ST_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

ST_TYPES_CODE="$(code_of "$ST_TYPES")"
ST_TYPES_BARE="$(code_no_strings "$ST_TYPES")"

# --- 38. SEARCH-005 exists, is approved, and its dependency defect is fixed ---
SEARCH_005="$(find "$REGISTRY" -maxdepth 1 -name 'SEARCH-005_*.md' | head -1)"
[ -n "$SEARCH_005" ] || fail "SEARCH-005 specification is missing from the Feature Registry"
grep -Fq '[x] Approved' "$SEARCH_005" || fail "SEARCH-005 does not record Founder approval"
grep -Fq 'export * from "./search-terms";' packages/shared-types/src/index.ts \
  || fail "the search-terms model is not exported from shared-types"
# DEC-046: the prohibited cycle must stay resolved.
SEARCH_005_DEPENDS="$(awk '/^## Depends On/{f=1;next} /^## /{f=0} f' "$SEARCH_005" | grep -E '^- ' || true)"
if echo "$SEARCH_005_DEPENDS" | grep -qF 'SEARCH-008'; then
  fail "the SEARCH-005 to SEARCH-008 circular dependency was reintroduced"
fi

echo "PASS: SEARCH-005 is approved and free of the SEARCH-008 dependency cycle"

# --- 39. The curated vocabulary is small, attested and static ----------------
grep -Fq 'export const CURATED_CURRICULUM_TERM_ALIASES' "$ST_TYPES" \
  || fail "the curated alias vocabulary is missing"
# Counts VALUES, not the interface field declaration: `canonical: string;` in
# CurriculumTermAlias is a type, not an alias entry.
ALIAS_ENTRIES="$(grep -c 'canonical: "' "$ST_TYPES" || true)"
[ "$ALIAS_ENTRIES" = "1" ] \
  || fail "the curated vocabulary holds $ALIAS_ENTRIES aliases; exactly one is approved for SEARCH-005A"
grep -Fq 'canonical: "Active Directory"' "$ST_TYPES" \
  || fail "the approved Active Directory alias is missing"
# Deferred expansions must NOT be live vocabulary.
for deferred in 'canonical: "Recovery Time Objective"' 'canonical: "Recovery Point Objective"' \
                'canonical: "Identity and Access Management"'; do
  if grep -Fq "$deferred" "$ST_TYPES"; then
    fail "a deferred expansion entered the curated vocabulary: $deferred"
  fi
done
grep -Fq 'export const DEFERRED_TERM_ALIAS_CANDIDATES' "$ST_TYPES" \
  || fail "the deferred alias candidates are not recorded"
# ZERO DATABASE ACCESS. The vocabulary is why adjustment metadata cannot leak.
if echo "$ST_TYPES_BARE" | grep -qiE 'supabase|createUserScoped|createServer|accessToken|\.from\(|select\(|await|async|fetch\('; then
  fail "the alias vocabulary acquired a database or network dependency"
fi
# EXPORT ALLOW-LIST. A dependency scan alone is NOT sufficient: a function that
# ACCEPTS candidate rows as an argument rather than fetching them itself needs no
# client, no await and no import, yet would let corpus-derived vocabulary in.
# Pinning the exact export surface means any new way to produce vocabulary — or
# to leak per-query state — has to pass through this review checkpoint.
ST_EXPORTS="$(grep -oE '^export (const|function|interface|type) [A-Za-z_]+' "$ST_TYPES" \
  | awk '{print $3}' | sort | tr '\n' ' ')"
ST_EXPECTED="buildCurriculumQueryAdjustment buildCurriculumQueryVariants buildTieredCurriculumSearchResults ClassifiedSearchDocument classifyCurriculumMatch containsTokenSequence CURATED_CURRICULUM_TERM_ALIASES CURRICULUM_MATCH_KINDS CurriculumAdjustedSearchResults CurriculumMatchKind CurriculumQueryAdjustment CurriculumQueryVariant CurriculumTermAlias DEFERRED_TERM_ALIAS_CANDIDATES describeCurriculumQueryAdjustment MAX_CURRICULUM_QUERY_VARIANTS MIN_ALIAS_RETRIEVAL_LENGTH normalizeTerminalPunctuation PROTECTED_TECHNICAL_TERMS REMOVABLE_TERMINAL_PUNCTUATION SEARCH_TERM_FORBIDDEN_FIELDS SEARCH_TERM_MODEL_VERSION withCurriculumQueryAdjustment "
[ "$ST_EXPORTS" = "$ST_EXPECTED" ] \
  || fail "the search-terms export surface changed; every addition must be reviewed:
  expected: $ST_EXPECTED
  actual:   $ST_EXPORTS"
# The vocabulary must be a compile-time constant fed only by its own literal.
grep -Fq 'for (const entry of CURATED_CURRICULUM_TERM_ALIASES) {' "$ST_TYPES" \
  || fail "variant generation no longer reads the curated constant directly"

echo "PASS: the alias vocabulary is one attested entry and needs no database"

# --- 40. Normalization preserves technical representation -------------------
grep -Fq 'export const PROTECTED_TECHNICAL_TERMS' "$ST_TYPES" \
  || fail "the protected technical terms are not held as data"
for term in 'Get-ADUser' 'kubectl' 'index=botsv3' 'terraform plan' 'show vlan brief'; do
  grep -Fq "\"$term\"" "$ST_TYPES" \
    || fail "a SEARCH-005 section 8 protected term is missing: $term"
done
grep -Fq 'export const REMOVABLE_TERMINAL_PUNCTUATION' "$ST_TYPES" \
  || fail "the removable punctuation set is not held as data"
# Technical punctuation must never be removable.
for technical in '"="' '"-"' '"_"' '"/"' '"."'; do
  if echo "$ST_TYPES_CODE" | sed -n '/REMOVABLE_TERMINAL_PUNCTUATION/,/\]/p' | grep -qF "$technical"; then
    fail "technical punctuation became removable: $technical"
  fi
done
grep -Fq 'PROTECTED_TECHNICAL_TERMS' "$ST_TYPE_TESTS" \
  || fail "the protected terms are not asserted by tests"

echo "PASS: technical tokens and punctuation survive normalization"

# --- 41. Expansion is bounded, deterministic and token-based ----------------
grep -Fq 'export const MAX_CURRICULUM_QUERY_VARIANTS = 4;' "$ST_TYPES" \
  || fail "the variant cap is missing or is not 4"
grep -Fq 'export const MIN_ALIAS_RETRIEVAL_LENGTH = 3;' "$ST_TYPES" \
  || fail "the short-alias retrieval guard is missing"
grep -Fq 'if (variants.length >= MAX_CURRICULUM_QUERY_VARIANTS) return;' "$ST_TYPES" \
  || fail "the variant cap is not enforced"
# The original query must be variant 1, unconditionally.
echo "$ST_TYPES_CODE" | tr -d ' \n' \
  | grep -Fq '{value:original,matchKind:"exact"}' \
  || fail "the original query is not retained as the first retrieval variant"
# Alias detection must be token-based; substring detection would read the
# acronym inside Get-ADUser, ADD, upload, read and broadcast.
grep -Fq 'export function containsTokenSequence' "$ST_TYPES" \
  || fail "token-based alias detection is missing"
# BOTH detection call sites pinned. Substring detection would read the acronym
# inside Get-ADUser, ADD, upload, read and broadcast. Classification may still
# use substring matching — that is a different step, on already-authorized text.
for detection in 'containsTokenSequence(detectionSource, entry.alias)' \
                 'containsTokenSequence(detectionSource, entry.canonical)'; do
  grep -Fq "$detection" "$ST_TYPES" \
    || fail "alias detection is not token-based: $detection"
done
if echo "$ST_TYPES_BARE" | grep -qE 'detectionSource[^;]*\.includes\('; then
  fail "alias detection uses substring matching instead of tokens"
fi
if echo "$ST_TYPES_BARE" | grep -qiE 'Math\.random|shuffle'; then
  fail "variant generation is random"
fi
# NO COMBINATORIAL EXPANSION. The vocabulary may be traversed exactly once — the
# declaration plus one loop. A nested traversal would let aliases compound into a
# Cartesian product, which the cap alone would not prevent from being meaningless.
VOCAB_USES="$(echo "$ST_TYPES_CODE" | grep -c 'CURATED_CURRICULUM_TERM_ALIASES' || true)"
[ "$VOCAB_USES" = "2" ] \
  || fail "the alias vocabulary is referenced $VOCAB_USES times; exactly one declaration and one traversal are allowed"
# Each variant is a vocabulary term, never a constructed combination of terms.
if echo "$ST_TYPES_CODE" | grep -qE 'add\(`'; then
  fail "a retrieval variant is built by combining terms rather than using one"
fi
grep -Fq 'add(entry.canonical, "alias");' "$ST_TYPES" \
  || fail "the canonical expansion is missing"
grep -Fq 'add(entry.alias, "alias");' "$ST_TYPES" \
  || fail "the alias side of the relationship is missing"

echo "PASS: variant expansion is capped at 4, deterministic and token-based"

# --- 42. Match-class tiering is NOT relevance ranking -----------------------
# NARROWED FOR SEARCH-005B. `typo` is now an approved match class and is
# DELIBERATELY LAST: a recovered match can never outrank an exact, normalized or
# alias match. The vocabulary is re-pinned exactly, so a fifth kind still fails.
echo "$ST_TYPES_CODE" | tr -d ' \n' \
  | grep -Fq 'CURRICULUM_MATCH_KINDS=["exact","normalized","alias","typo"]asconst;' \
  || fail "the approved match-kind vocabulary changed"
ST_LAST_KIND="$(echo "$ST_TYPES_CODE" | tr -d ' \n' \
  | grep -oE 'CURRICULUM_MATCH_KINDS=\[[^]]*\]' | grep -oE '"[a-z]+"\]$' || true)"
[ "$ST_LAST_KIND" = '"typo"]' ] \
  || fail "typo is not the last match class; a recovered match must never outrank an exact one"
# Tiering must reuse SEARCH-002 neutral ordering, not replace it.
grep -Fq 'orderCurriculumSearchResults' "$ST_TYPES" \
  || fail "tiering does not reuse the existing neutral deterministic ordering"
grep -Fq 'tierOf(a) - tierOf(b)' "$ST_TYPES" \
  || fail "the tier comparator changed; it must subtract vocabulary indices only"
# NO NUMERIC RANKING ANYWHERE. This is the SEARCH-008 boundary.
if echo "$ST_TYPES_BARE" | grep -qiE 'relevance|boost|popularity|freshness|clickH|engagement|scoreOf|weightOf|\* *[0-9]+\.[0-9]'; then
  fail "SEARCH-008 relevance ranking leaked into SEARCH-005A"
fi
if echo "$ST_TYPES_BARE" | grep -qE 'sourceUpdatedAt|competency|missionStableId|courseStableId'; then
  fail "a SEARCH-008 ranking signal entered SEARCH-005A tiering"
fi

echo "PASS: match-class tiering introduces no relevance ranking"

# --- 43. Adjustment metadata leaks nothing ----------------------------------
grep -Fq 'export interface CurriculumQueryAdjustment' "$ST_TYPES" \
  || fail "the query-adjustment contract is missing"
grep -Fq 'export const SEARCH_TERM_FORBIDDEN_FIELDS' "$ST_TYPES" \
  || fail "the adjustment prohibition is not held as data"
for forbidden in editDistance variants patterns candidateCount hiddenAlternatives matchKind; do
  grep -Fq "\"$forbidden\"" "$ST_TYPES" \
    || fail "an internal field is missing from the adjustment prohibition list: $forbidden"
done
# EXACTLY three fields and nothing else.
#
# A flattened substring pin is NOT enough: inserting a field BEFORE the pinned
# text leaves the pinned substring intact, so the guard would prove an expected
# line survived while permitting a leak beside it. The interface body is
# extracted and its fields counted instead.
ST_ADJ_BODY="$(awk '/^export interface CurriculumQueryAdjustment \{/{f=1;next} f&&/^\}/{f=0} f' "$ST_TYPES")"
# Field NAMES only — the leak scan must not read a type annotation. Checking
# text would flag `adjustmentKind: Exclude<CurriculumMatchKind, "exact">` for
# containing "MatchKind", which is the annotation, not a leaked field.
ST_ADJ_NAMES="$(echo "$ST_ADJ_BODY" | grep -oE '^[[:space:]]+[A-Za-z_]+' \
  | tr -d ' ' | sort | tr '\n' ' ')"
[ "$ST_ADJ_NAMES" = "adjustmentKind effectiveQuery originalQuery " ] \
  || fail "the adjustment contract fields changed; exactly three are approved:
  expected: adjustmentKind effectiveQuery originalQuery
  actual:   $ST_ADJ_NAMES"
for required in 'originalQuery: string;' 'effectiveQuery: string;' \
                'adjustmentKind: Exclude<CurriculumMatchKind, "exact">;'; do
  echo "$ST_ADJ_BODY" | grep -Fq "$required" \
    || fail "the adjustment contract is missing an approved field: $required"
done

# No per-result match kind may reach a learner or a Search Document.
if echo "$SEARCH_TYPES_CODE" | grep -qiE 'matchKind|adjustmentKind|effectiveQuery|originalQuery|typo|corrected|recovery'; then
  fail "SEARCH-005 per-query state entered the SEARCH-001 Search Document"
fi
if grep -Fq 'matchKind' "$CS_VIEW"; then
  fail "a per-result match kind reached the learner surface"
fi
grep -Fq 'describeCurriculumQueryAdjustment' "$CS_VIEW" \
  || fail "the learner is never told the query was adjusted"

# CLASSIFICATION RUNS EXACTLY ONCE, AND ONLY AFTER AUTHORIZATION.
#
# Pinning the correct call site is NOT enough on its own: an ADDITIONAL earlier
# classification against the permissioned or pre-resolution list would sit before
# SEARCH-003 surfacing and still leave the correct call in place. Counting the
# call sites closes that, and naming the forbidden arguments makes it legible.
CLASSIFY_CALLS="$(echo "$CS_SERVICE_CODE" | grep -c 'classifyCurriculumMatch(' || true)"
[ "$CLASSIFY_CALLS" = "1" ] \
  || fail "match classification runs at $CLASSIFY_CALLS call sites; exactly one is allowed, after authorization"
for premature in 'classifyCurriculumMatch(permissioned' 'classifyCurriculumMatch(candidates' \
                 'classifyCurriculumMatch(selected' 'classifyCurriculumMatch(c.value' \
                 'classifyCurriculumMatch(row'; do
  if echo "$CS_SERVICE_CODE" | grep -Fq "$premature"; then
    fail "match classification runs before authorization or filtering: $premature"
  fi
done
ST_SURFACE_LINE="$(grep -n 'surfaceAuthorized(permissioned)' "$CS_SERVICE" | head -1 | cut -d: -f1)"
ST_CLASSIFY_LINE="$(grep -n 'classifyCurriculumMatch(' "$CS_SERVICE" | head -1 | cut -d: -f1)"
[ -n "$ST_SURFACE_LINE" ] && [ -n "$ST_CLASSIFY_LINE" ] \
  || fail "the surfacing and classification steps are not both present"
[ "$ST_SURFACE_LINE" -lt "$ST_CLASSIFY_LINE" ] \
  || fail "match classification runs before SEARCH-003 surfacing"

echo "PASS: adjustment metadata exposes no internal detail"

# --- 44. No API mode, no SEARCH-005B, no migration, no dependency -----------
# Ruling 3: the original query is always variant 1, so no undo mode exists.
for forbidden in 'exact=' 'literal=' 'disableAliases' 'mode=exact' '"exact"' '"literal"'; do
  if echo "$SEARCH_ROUTE_BLOCK" | grep -Fq "$forbidden"; then
    fail "an adjustment-suppression API mode was added: $forbidden"
  fi
done
if grep -Fq 'searchParams' "$ST_TYPES"; then
  fail "the pure term model reaches into request parsing"
fi
for forbidden in levenshtein damerau soundex trgm pg_trgm fuzzy spelling; do
  if echo "$ST_TYPES_BARE$CS_SERVICE_CODE" | grep -qiF "$forbidden"; then
    fail "SEARCH-005B behaviour leaked into SEARCH-005A: $forbidden"
  fi
done
# Named text-search extensions only. A bare `create extension` scan is a false
# positive: `pgcrypto` is a pre-existing Wave 1 platform foundation extension and
# has nothing to do with Search.
if grep -rqiE 'pg_trgm|fuzzystrmatch|unaccent|pg_search' supabase/migrations/ 2>/dev/null; then
  fail "SEARCH-005A must add no text-matching database extension"
fi
TERM_MIGRATIONS="$(ls supabase/migrations/*alias*.sql supabase/migrations/*term*.sql supabase/migrations/*normali*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$TERM_MIGRATIONS" = "0" ] || fail "SEARCH-005A must add no migration"

echo "PASS: SEARCH-005A added no suppression mode, migration or extension"

# ============================================================
# SEARCH-005B — Bounded Typo Recovery (Batch 6)
# ============================================================

TY_TYPES="packages/shared-types/src/search-typo.ts"
TY_TYPE_TESTS="packages/shared-types/src/search-typo.test.ts"
TY_DOC="docs/Engineering-OS/BUILD_WAVE_9_BATCH_6_BOUNDED_TYPO_RECOVERY.md"

for p in "$TY_TYPES" "$TY_TYPE_TESTS" "$TY_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

TY_TYPES_CODE="$(code_of "$TY_TYPES")"
TY_TYPES_BARE="$(code_no_strings "$TY_TYPES")"

# --- 45. The target vocabulary is closed, derived and needs no database ------
grep -Fq 'export * from "./search-typo";' packages/shared-types/src/index.ts \
  || fail "the typo model is not exported from shared-types"
# DERIVED from already-approved vocabulary, never restated.
grep -Fq '...PROTECTED_TECHNICAL_TERMS,' "$TY_TYPES" \
  || fail "typo targets are not derived from the approved protected terms"
grep -Fq 'CURATED_CURRICULUM_TERM_ALIASES.flatMap' "$TY_TYPES" \
  || fail "typo targets are not derived from the curated alias vocabulary"
# No second vocabulary may be declared here.
if echo "$TY_TYPES_CODE" | grep -qE '^\s*"(kubectl|Terraform|Proxmox|Splunk|PowerShell|Active Directory)"'; then
  fail "the typo module declares its own target vocabulary"
fi
# ZERO DATABASE ACCESS, ZERO CORPUS. This is why a correction cannot leak.
if echo "$TY_TYPES_BARE" | grep -qiE 'supabase|createUserScoped|createServer|accessToken|\.from\(|await|async|fetch\(|rows|candidateRow|document'; then
  fail "the typo vocabulary acquired a database, corpus or network dependency"
fi
# EXPORT ALLOW-LIST. A dependency scan alone is insufficient: a function that
# ACCEPTS candidate rows needs no client, no await and no import.
TY_EXPORTS="$(grep -oE '^export (const|function|interface|type) [A-Za-z_]+' "$TY_TYPES" \
  | awk '{print $3}' | sort | tr '\n' ' ')"
TY_EXPECTED="buildCurriculumTypoRecovery buildTypoTargets CurriculumTypoRecovery describeCurriculumOriginalQueryAction describeCurriculumOriginalQueryEmptyState describeCurriculumTypoRecovery findSingleTypoTarget isTypoEligibleToken isWithinOneEdit SEARCH_TYPO_FORBIDDEN_FIELDS SEARCH_TYPO_MODEL_VERSION TYPO_EXCLUDED_INPUT_SHAPES TYPO_MAX_CORRECTED_TOKENS TYPO_MAX_EDIT_DISTANCE TYPO_MAX_RECOVERED_VARIANTS TYPO_MIN_TOKEN_LENGTH TYPO_RECOVERY_TARGETS TYPO_SHORT_TOKEN_LENGTH "
[ "$TY_EXPORTS" = "$TY_EXPECTED" ] \
  || fail "the search-typo export surface changed; every addition must be reviewed:
  expected: $TY_EXPECTED
  actual:   $TY_EXPORTS"

echo "PASS: typo targets are a closed derived vocabulary needing no database"

# --- 46. Every bound is pinned ---------------------------------------------
grep -Fq 'export const TYPO_MAX_EDIT_DISTANCE = 1;' "$TY_TYPES" \
  || fail "the edit-distance bound is missing or is not 1"
grep -Fq 'export const TYPO_MIN_TOKEN_LENGTH = 4;' "$TY_TYPES" \
  || fail "the minimum token length is missing or is not 4"
grep -Fq 'export const TYPO_SHORT_TOKEN_LENGTH = 3;' "$TY_TYPES" \
  || fail "the narrow short-token exception is missing or is not 3"
grep -Fq 'export const TYPO_MAX_CORRECTED_TOKENS = 1;' "$TY_TYPES" \
  || fail "the corrected-token bound is missing or is not 1"
grep -Fq 'export const TYPO_MAX_RECOVERED_VARIANTS = 1;' "$TY_TYPES" \
  || fail "the recovered-variant bound is missing or is not 1"
grep -Fq 'if (correctedCount > TYPO_MAX_CORRECTED_TOKENS) return undefined;' "$TY_TYPES" \
  || fail "the corrected-token bound is not enforced"
# The three-character exception must NOT become general short-token matching.
# EVERY input exclusion pinned individually. These protect shapes whose
# characters carry technical meaning, and each removal must fail on its own.
grep -Fq 'if (token.startsWith("-")) return false;' "$TY_TYPES" \
  || fail "flags are no longer excluded from typo recovery"
grep -Fq 'if (token.includes("=")) return false;' "$TY_TYPES" \
  || fail "key=value expressions are no longer excluded from typo recovery"
grep -Fq 'if (/\d/.test(token)) return false;' "$TY_TYPES" \
  || fail "digit-bearing tokens (IP, CIDR, port, version) are no longer excluded"
grep -Fq 'if (token === token.toUpperCase() && /[A-Z]/.test(token)) return false;' "$TY_TYPES" \
  || fail "uppercase acronyms are no longer excluded from typo recovery"
grep -Fq 'if (token.length >= TYPO_MIN_TOKEN_LENGTH) return true;' "$TY_TYPES" \
  || fail "the minimum token length is not enforced against the bound"
grep -Fq 'token.length === TYPO_SHORT_TOKEN_LENGTH && /^[a-z]+$/.test(token)' "$TY_TYPES" \
  || fail "the short-token exception is no longer restricted to lowercase letters"
grep -Fq 'target.length < TYPO_MIN_TOKEN_LENGTH' "$TY_TYPES" \
  || fail "the short-token exception may reach an under-length target"
# Ambiguity fails safely, never by iteration order.
grep -Fq 'if (matches.length > 1) return undefined;' "$TY_TYPES" \
  || fail "an ambiguous correction is resolved instead of refused"
if echo "$TY_TYPES_BARE" | grep -qiE 'matches\[0\] \|\||sort\(|frequency|popularity|first\(\)'; then
  fail "an ambiguous candidate is resolved by ordering or frequency"
fi
# A token that IS an approved term is never corrected.
grep -Fq 'targets.some((target) => target.toLowerCase() === lowered)' "$TY_TYPES" \
  || fail "an already-correct approved term can be corrected into another"

echo "PASS: edit distance, token length, correction and variant counts are bounded"

# --- 47. Recovery runs ONLY after zero authorized results -------------------
grep -Fq 'if (classified.length === 0) {' "$CS_SERVICE" \
  || fail "typo recovery is not gated on an empty authorized result set"
RECOVERY_CALLS="$(echo "$CS_SERVICE_CODE" | grep -c 'buildCurriculumTypoRecovery(' || true)"
[ "$RECOVERY_CALLS" = "1" ] \
  || fail "typo recovery is built at $RECOVERY_CALLS call sites; exactly one is allowed"
# ORDER: the gate must come after the first pass, never before it.
TY_PASS_LINE="$(grep -n 'let classified = await runAuthorizedPass(variants);' "$CS_SERVICE" | head -1 | cut -d: -f1)"
TY_GATE_LINE="$(grep -n 'if (classified.length === 0) {' "$CS_SERVICE" | head -1 | cut -d: -f1)"
[ -n "$TY_PASS_LINE" ] && [ -n "$TY_GATE_LINE" ] \
  || fail "the original pass and the recovery gate are not both present"
[ "$TY_PASS_LINE" -lt "$TY_GATE_LINE" ] \
  || fail "typo recovery is evaluated before the original query pass"

echo "PASS: typo recovery runs only after zero authorized results"

# --- 48. Recovery reuses the identical authorized pipeline ------------------
grep -Fq 'const runAuthorizedPass = async (' "$CS_SERVICE" \
  || fail "the shared authorized pass is missing"
PASS_DEFS="$(echo "$CS_SERVICE_CODE" | grep -c 'const runAuthorizedPass = async (' || true)"
[ "$PASS_DEFS" = "1" ] \
  || fail "the authorized pass is defined $PASS_DEFS times; exactly one definition may exist"
PASS_CALLS="$(echo "$CS_SERVICE_CODE" | grep -c 'await runAuthorizedPass(' || true)"
[ "$PASS_CALLS" = "2" ] \
  || fail "the authorized pass runs $PASS_CALLS times; exactly the original and one recovery are allowed"
# The recovery pass may not acquire its own client or authorization path.
if echo "$CS_SERVICE_CODE" | grep -qF 'createServerSupabaseClient'; then
  fail "a service-role client entered the recovery path"
fi
CLIENT_CALLS="$(echo "$CS_SERVICE_CODE" | grep -c 'createUserScopedSupabaseClient(' || true)"
[ "$CLIENT_CALLS" = "1" ] \
  || fail "the search creates $CLIENT_CALLS clients; recovery must reuse the caller's own"

echo "PASS: recovery reuses one authorized pipeline and one caller-scoped client"

# --- 49. Recovery leaks nothing --------------------------------------------
grep -Fq 'export const SEARCH_TYPO_FORBIDDEN_FIELDS' "$TY_TYPES" \
  || fail "the typo prohibition is not held as data"
for forbidden in editDistance distance candidates candidateCount alternatives \
                 confidence similarity; do
  grep -Fq "\"$forbidden\"" "$TY_TYPES" \
    || fail "an internal field is missing from the typo prohibition list: $forbidden"
done
# Prose and the prohibition list itself are excluded, so this judges real code.
TY_SERVICE_BARE="$(code_no_strings "$CS_SERVICE")"
for leaked in editDistance candidateCount confidence similarity; do
  if echo "$TY_SERVICE_BARE" | grep -qF "$leaked"; then
    fail "a typo internal entered the response: $leaked"
  fi
done
# The adjustment contract shape is UNCHANGED — still exactly three fields.
grep -Fq 'CurriculumTypoRecovery' "$TY_TYPE_TESTS" \
  || fail "the recovery contract is not asserted by tests"
# EXACTLY two fields. A substring pin would survive a field inserted BEFORE it,
# so the interface body is extracted and its field NAMES compared — text
# matching would also misread a type annotation.
TY_REC_BODY="$(awk '/^export interface CurriculumTypoRecovery \{/{f=1;next} f&&/^\}/{f=0} f' "$TY_TYPES")"
TY_REC_NAMES="$(echo "$TY_REC_BODY" | grep -oE '^[[:space:]]+[A-Za-z_]+' | tr -d ' ' | sort | tr '\n' ' ')"
[ "$TY_REC_NAMES" = "correctedQuery originalQuery " ] \
  || fail "the recovery contract fields changed; exactly two are approved:
  expected: correctedQuery originalQuery
  actual:   $TY_REC_NAMES"
# ONE recovered variant reaches retrieval, never a list.
echo "$CS_SERVICE_CODE" | tr -d ' \n' \
  | grep -Fq 'awaitrunAuthorizedPass([{value:recovery.correctedQuery,matchKind:"typo"}]);' \
  || fail "the recovery pass no longer runs exactly one recovered variant"
if grep -Fq 'matchKind' "$CS_VIEW"; then
  fail "a per-result match kind reached the learner surface"
fi

echo "PASS: typo recovery exposes no algorithm internal"

# --- 50. Return-to-original is not a general search mode -------------------
# Ruling 9: the affordance needs no request, because recovery only runs when the
# server already executed the original query and it returned nothing.
for forbidden in 'mode=' 'searchMode' 'disableTypo' 'disableAliases' 'fuzzy=' \
                 '"exact"' '"literal"' 'noTypo' 'skipRecovery'; do
  if echo "$SEARCH_ROUTE_BLOCK" | grep -Fq "$forbidden"; then
    fail "a general search mode was added to the route: $forbidden"
  fi
done
ROUTE_PARAMS="$(echo "$SEARCH_ROUTE_BLOCK" | grep -oE 'searchParams\.(get|getAll)\("[a-zA-Z]+"\)' | sort -u | tr '\n' ' ')"
[ "$ROUTE_PARAMS" = 'searchParams.get("limit") searchParams.get("q") searchParams.getAll("contentType") ' ] \
  || fail "the search route accepts an unapproved parameter set: $ROUTE_PARAMS"
grep -Fq 'describeCurriculumOriginalQueryAction' "$CS_VIEW" \
  || fail "the learner cannot return to their original query"
grep -Fq 'describeCurriculumOriginalQueryEmptyState' "$CS_VIEW" \
  || fail "returning to the original query shows no honest empty state"

echo "PASS: returning to the original query added no API mode"

# --- 51. SEARCH-005B added no infrastructure -------------------------------
for forbidden in levenshtein damerau soundex trgm pg_trgm spelling embedding \
                 openai anthropic ollama; do
  if echo "$TY_TYPES_BARE" | grep -qiF "$forbidden"; then
    fail "an unapproved matching mechanism or AI dependency entered SEARCH-005B: $forbidden"
  fi
done
if grep -rqiE 'pg_trgm|fuzzystrmatch|unaccent|pg_search' supabase/migrations/ 2>/dev/null; then
  fail "SEARCH-005B must add no text-matching database extension"
fi
TYPO_MIGRATIONS="$(ls supabase/migrations/*typo*.sql supabase/migrations/*spell*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$TYPO_MIGRATIONS" = "0" ] || fail "SEARCH-005B must add no migration"
for dependency in fuse.js fastest-levenshtein leven didyoumean natural; do
  if grep -Fq "\"$dependency\"" package.json apps/web/package.json packages/shared-types/package.json services/api/package.json 2>/dev/null; then
    fail "a typo-correction dependency was added: $dependency"
  fi
done

echo "PASS: SEARCH-005B added no extension, migration, dependency or AI"

# ============================================================
# SEARCH-006 — Personal Notes Search Integration (Batch 7)
# ============================================================

NOTE_TYPES="packages/shared-types/src/note-retrieval.ts"
NOTE_SERVICE="services/api/src/note-retrieval.ts"
NOTE_SERVICE_TESTS="services/api/src/note-retrieval.test.ts"
NOTE_WEB="apps/web/src/search/note-search-service.ts"
NOTE_WEB_TESTS="apps/web/src/search/note-search-service.test.ts"
NOTE_DOC="docs/Engineering-OS/BUILD_WAVE_9_BATCH_7_PERSONAL_NOTES_SEARCH.md"

for p in "$NOTE_TYPES" "$NOTE_SERVICE" "$NOTE_SERVICE_TESTS" "$NOTE_WEB" \
         "$NOTE_WEB_TESTS" "$NOTE_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

NOTE_SERVICE_CODE="$(code_of "$NOTE_SERVICE")"
NOTE_TYPES_BARE="$(code_no_strings "$NOTE_TYPES")"
NOTE_WEB_CODE="$(code_of "$NOTE_WEB")"

# --- 52. SEARCH-006 exists and reuses the Notes authority -------------------
SEARCH_006="$(find "$REGISTRY" -maxdepth 1 -name 'SEARCH-006_*.md' | head -1)"
[ -n "$SEARCH_006" ] || fail "SEARCH-006 specification is missing from the Feature Registry"
grep -Fq '[x] Approved' "$SEARCH_006" || fail "SEARCH-006 does not record Founder approval"
# ONE private-notes search authority. A second would be a parallel ownership
# system beside row level security.
grep -Fq 'export async function searchStudentNotes' "$NOTE_SERVICE" \
  || fail "the existing notes-search authority is missing"
# Test files are excluded: a test may legitimately NAME the implementation in a
# source-slice bound without being a second implementation of it.
NOTE_SEARCH_IMPLS="$(grep -rlF --include='*.ts' --exclude='*.test.ts' 'export async function searchStudentNotes' services/api/src/ | wc -l | tr -d ' ' || true)"
[ "$NOTE_SEARCH_IMPLS" = "1" ] \
  || fail "$NOTE_SEARCH_IMPLS private-notes search implementations exist; exactly one is allowed"
grep -Fq 'pathname === "/notes/search"' "$SERVER" \
  || fail "the authenticated notes-search route is missing"
for forbidden in '"/search/notes"' '"/admin/notes/search"' '"/public/notes"'; do
  if grep -Fq "pathname === $forbidden" "$SERVER"; then
    fail "a second or public notes-search route exists: $forbidden"
  fi
done

echo "PASS: one private notes-search authority, reused rather than duplicated"

# --- 53. Ownership stays with the database ---------------------------------
grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$NOTE_SERVICE" \
  || fail "notes search does not read through the caller's RLS-scoped client"
if echo "$NOTE_SERVICE_CODE" | grep -qF 'createServerSupabaseClient'; then
  fail "a service-role client entered the private notes path"
fi
# NO SECOND OWNERSHIP MECHANISM. The service must not build an owner predicate,
# because that could drift from the policy that actually protects the rows.
for forbidden in user_id userId ownerId studentId learnerId; do
  if echo "$NOTE_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "notes search built its own owner predicate: $forbidden"
  fi
done
# The route may never accept an identity naming whose notes to search.
# The route spans several lines: the method/path guard, then the trusted
# identity resolution, then the call. Capture the whole block, not one line.
NOTES_ROUTE_BLOCK="$(awk '/pathname === "\/notes\/search"/{c=6} c&&c-->0' "$SERVER" || true)"
for forbidden in userId ownerId studentId learnerId; do
  if echo "$NOTES_ROUTE_BLOCK" | grep -qF "$forbidden"; then
    fail "the notes-search route accepts a caller-supplied identity: $forbidden"
  fi
done
echo "$NOTES_ROUTE_BLOCK" | grep -Fq 'resolveTrustedRequestIdentity(request)' \
  || fail "the notes-search route does not require trusted authentication"
grep -Fq 'NOTE_SEARCH_FORBIDDEN_REQUEST_FIELDS' "$NOTE_TYPES" \
  || fail "the forbidden identity-parameter prohibition is not held as data"

echo "PASS: note ownership is decided by the database and nothing else"

# --- 54. Private notes stay out of the shared Search foundation ------------
grep -Fq 'export const SEARCH_INDEXED_SOURCE_ENGINES = ["curriculum"] as const;' "$SEARCH_TYPES" \
  || fail "notes were added to the indexed source engine set"
if echo "$NOTE_SERVICE_CODE" | grep -qiE 'SearchDocument|buildSearchDocument|search_documents'; then
  fail "private notes entered the shared Search Document model"
fi
if echo "$NOTE_SERVICE_CODE" | grep -qiE 'materialized|tsvector|to_tsquery|pg_trgm|setInterval|cron|queue|worker|cacheStore|noteIndex'; then
  fail "SEARCH-007 infrastructure or a private-note cache entered SEARCH-006"
fi
NOTE_MIGRATIONS="$(ls supabase/migrations/*note*search*.sql supabase/migrations/*note*index*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$NOTE_MIGRATIONS" = "0" ] || fail "SEARCH-006 must add no migration"
grep -Fq 'NOTE_SEARCH_FORBIDDEN_FIELDS' "$NOTE_TYPES" \
  || fail "the forbidden note-result field prohibition is not held as data"
for forbidden in hiddenCount withheldCount unauthorizedCount otherUserCount; do
  grep -Fq "\"$forbidden\"" "$NOTE_TYPES" \
    || fail "a hidden count is missing from the note prohibition list: $forbidden"
  if echo "$NOTE_TYPES_BARE" | grep -qF "$forbidden"; then
    fail "a hidden count entered the note result contract: $forbidden"
  fi
done

echo "PASS: private notes stay out of shared indexing, caching and totals"

# --- 55. Vocabulary is static; notes never teach the query -----------------
# SEARCH-005 normalization and approved aliases compose; SEARCH-005B typo
# recovery deliberately does not (Founder ruling: its zero-result trigger is a
# cross-source policy this Feature must not establish).
grep -Fq 'buildCurriculumQueryVariants' "$NOTE_SERVICE" \
  || fail "notes search does not compose the approved static query variants"
grep -Fq 'variant.matchKind !== "typo"' "$NOTE_SERVICE" \
  || fail "SEARCH-005B typo recovery is no longer excluded from notes"
if echo "$NOTE_SERVICE_CODE" | grep -qF 'buildCurriculumTypoRecovery'; then
  fail "SEARCH-005B typo recovery was composed into private notes search"
fi
# Vocabulary must never be learned from note content.
if echo "$NOTE_SERVICE_CODE" | grep -qiE 'alias.*=.*note|note.*\.push\(.*alias|vocabulary|dictionaryFrom|learnFrom'; then
  fail "note content was used to build query vocabulary"
fi
# Every variant must be escaped before it reaches ILIKE.
grep -Fq 'escapeLike(variant)' "$NOTE_SERVICE" \
  || fail "note query variants are not escaped before ILIKE matching"

echo "PASS: note query vocabulary is static and never learned from note content"

# --- 56. Two labelled groups, independent failure --------------------------
# Pinned on the HEADINGS, not merely on the label functions appearing somewhere:
# the label is also used on each result card, so a bare presence check survives
# a heading being renamed to something that no longer distinguishes the group.
# BOTH note-group headings (results and unavailable) must carry the label. A
# presence check passes while one of two identical headings is renamed, so the
# count is the property that actually holds.
NOTE_GROUP_LABELLED="$(grep -cF '<h3 id="note-results-heading">{describeNoteResultGroup()}</h3>' "$CS_VIEW" || true)"
[ "$NOTE_GROUP_LABELLED" = "2" ] \
  || fail "expected both note-group headings to be labelled with the learner-facing name; found $NOTE_GROUP_LABELLED"
grep -Fq '<h3 id="curriculum-results-heading">' "$CS_VIEW" \
  || fail "the curriculum result group heading is missing"
grep -Fq 'describeCurriculumResultGroup()' "$CS_VIEW" \
  || fail "the curriculum result group is not labelled"
NOTE_GROUP_HEADINGS="$(grep -c 'id="note-results-heading"' "$CS_VIEW" || true)"
[ "$NOTE_GROUP_HEADINGS" = "2" ] \
  || fail "expected exactly two note-group headings (results and unavailable); found $NOTE_GROUP_HEADINGS"
grep -Fq 'Promise.allSettled' "$CS_VIEW" \
  || fail "the two sources are not settled independently; one failure could erase the other"
grep -Fq 'describeNoteSearchUnavailable' "$CS_VIEW" \
  || fail "a failed notes search has no honest unavailable state"
# A failure must never be rendered as a successful empty result.
grep -Fq 'could not be searched' "$NOTE_TYPES" \
  || fail "the notes-unavailable wording no longer distinguishes failure from empty"
# No internal engine name may reach the learner.
if echo "$NOTE_TYPES_BARE" | grep -qiE 'sourceEngine|student_notes|supabase|rls'; then
  fail "an internal name entered the learner-facing note wording"
fi
# Notes must not join the curriculum facet contract.
if echo "$CS_VIEW_CODE" | grep -qF 'contentTypes: notes'; then
  fail "notes joined the SEARCH-004 curriculum facet"
fi
grep -Fq 'searchMyNotes' "$NOTE_WEB" \
  || fail "the browser notes-search service is missing"
if echo "$NOTE_WEB_CODE" | grep -qiE 'userId|ownerId|studentId|learnerId'; then
  fail "the browser notes service sends a caller-supplied identity"
fi

echo "PASS: curriculum and notes are labelled, independent result groups"

# ============================================================
# SEARCH-007 — Indexing and Freshness Pipeline (Batch 8)
# ============================================================

FR_TYPES="packages/shared-types/src/search-freshness.ts"
FR_TYPE_TESTS="packages/shared-types/src/search-freshness.test.ts"
FR_SERVICE="services/api/src/search-freshness.ts"
FR_SERVICE_TESTS="services/api/src/search-freshness.test.ts"
FR_DOC="docs/Engineering-OS/BUILD_WAVE_9_BATCH_8_SEARCH_INDEXING_FRESHNESS.md"

for p in "$FR_TYPES" "$FR_TYPE_TESTS" "$FR_SERVICE" "$FR_SERVICE_TESTS" "$FR_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

FR_TYPES_CODE="$(code_of "$FR_TYPES")"
FR_TYPES_BARE="$(code_no_strings "$FR_TYPES")"
FR_SERVICE_CODE="$(code_of "$FR_SERVICE")"
FR_SERVICE_BARE="$(code_no_strings "$FR_SERVICE")"
FR_ROUTE_BLOCK="$(awk '/pathname === "\/admin\/search\/freshness"/{c=18} c&&c-->0' "$SERVER" || true)"

# --- 57. SEARCH-007 exists and stays source-authoritative -------------------
SEARCH_007="$(find "$REGISTRY" -maxdepth 1 -name 'SEARCH-007_*.md' | head -1)"
[ -n "$SEARCH_007" ] || fail "SEARCH-007 specification is missing from the Feature Registry"
grep -Fq '[x] Approved' "$SEARCH_007" || fail "SEARCH-007 does not record Founder approval"
grep -Fq 'export * from "./search-freshness";' packages/shared-types/src/index.ts \
  || fail "the freshness model is not exported from shared-types"
# Reconciliation COMPOSES the SEARCH-001 resolver; it never reimplements one.
grep -Fq 'resolveSearchDocument(accessToken, document)' "$FR_SERVICE" \
  || fail "reconciliation does not compose the SEARCH-001 source resolver"
# A document may never authorize itself: serving is decided from a RESOLUTION.
grep -Fq 'canServeSearchDocument(resolution)' "$FR_TYPES" \
  || fail "serving is no longer decided from a source resolution"

echo "PASS: SEARCH-007 is approved and remains source-authoritative"

# --- 58. NO PERSISTED INDEX WAS INTRODUCED ----------------------------------
# The central architectural ruling: SEARCH-007 adds reconciliation and health,
# never a second stored representation.
# Scans STRING-BEARING code, not the string-stripped form: a table name is a
# string literal, so stripping strings would hide exactly the mutation that
# introduces one. These modules carry no prohibition prose naming a table.
if echo "$FR_TYPES_CODE$FR_SERVICE_CODE" | grep -qiE 'search_documents|search_index|create table|materialized|tsvector|to_tsquery|pg_trgm|elasticsearch|opensearch|algolia|meilisearch|redis|vectorStore'; then
  fail "SEARCH-007 introduced a persisted index or external search provider"
fi
if grep -rqiE 'tsvector|to_tsquery|pg_trgm|create materialized view' supabase/migrations/ 2>/dev/null; then
  fail "a full-text or materialized search index entered the migrations"
fi
FRESHNESS_MIGRATIONS="$(ls supabase/migrations/*search*.sql supabase/migrations/*index*.sql supabase/migrations/*freshness*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$FRESHNESS_MIGRATIONS" = "0" ] || fail "SEARCH-007 must add no migration"
# No worker, queue, scheduler, cron or trigger.
if echo "$FR_TYPES_BARE$FR_SERVICE_BARE" | grep -qiE 'setInterval|setTimeout|cron|queue|worker|scheduler|schedule\(|webhook'; then
  fail "SEARCH-007 introduced background processing infrastructure"
fi
# The run writes nothing at all.
for write in '.insert(' '.update(' '.upsert(' '.delete(' '.rpc('; do
  if echo "$FR_SERVICE_CODE" | grep -qF "$write"; then
    fail "the reconciliation run writes to a source: $write"
  fi
done
# No new dependency may appear for search infrastructure.
for dependency in elasticsearch "@elastic" opensearch algolia meilisearch ioredis "@upstash"; do
  if grep -Fq "\"$dependency" package.json services/api/package.json packages/shared-types/package.json apps/web/package.json 2>/dev/null; then
    fail "a search-provider dependency was added: $dependency"
  fi
done

echo "PASS: no persisted index, provider, worker, migration or dependency exists"

# --- 59. Reconciliation and retry are explicitly bounded --------------------
grep -Fq 'export const SEARCH_RECONCILIATION_MAX_DOCUMENTS = 100;' "$FR_TYPES" \
  || fail "the reconciliation document bound is missing or is not 100"
grep -Fq 'export const SEARCH_RECONCILIATION_MAX_ATTEMPTS = 2;' "$FR_TYPES" \
  || fail "the retry attempt bound is missing or is not 2"
# The bound must be ENFORCED, not merely declared.
grep -Fq 'Math.min(' "$FR_TYPES" \
  || fail "the reconciliation limit is not clamped"
grep -Fq 'input.documents.slice(0, limit)' "$FR_SERVICE" \
  || fail "the reconciliation run is not bounded before any read"
grep -Fq 'attempt < SEARCH_RECONCILIATION_MAX_ATTEMPTS' "$FR_SERVICE" \
  || fail "the retry loop is not bounded by the approved attempt limit"
# No unbounded or recursive retry.
if echo "$FR_SERVICE_BARE" | grep -qE 'while *\(true\)|for *\( *; *; *\)'; then
  fail "an unbounded retry loop exists"
fi
if echo "$FR_SERVICE_BARE" | grep -qE 'reconcileSearchDocument\([^)]*\).*reconcileSearchDocument'; then
  fail "retry is recursive rather than bounded"
fi
RECONCILE_DEFS="$(echo "$FR_SERVICE_CODE" | grep -c 'export async function reconcileSearchDocument' || true)"
[ "$RECONCILE_DEFS" = "1" ] \
  || fail "expected exactly one reconciliation entry point; found $RECONCILE_DEFS"
# Only a transient unreachable source may be retried.
grep -Fq 'export const SEARCH_RETRYABLE_OUTCOMES: readonly SearchSourceOutcome[] = [' "$FR_TYPES" \
  || fail "the retryable-outcome set is not held as data"
FR_RETRYABLE="$(echo "$FR_TYPES_CODE" | tr -d ' \n' | grep -oE 'SEARCH_RETRYABLE_OUTCOMES:readonlySearchSourceOutcome\[\]=\[[^]]*\]' || true)"
[ "$FR_RETRYABLE" = 'SEARCH_RETRYABLE_OUTCOMES:readonlySearchSourceOutcome[]=["unavailable"]' ] \
  || fail "the retryable-outcome set changed; only a transient unavailable source may retry"

echo "PASS: reconciliation and retry are explicitly and enforceably bounded"

# --- 60. Non-current source can never serve --------------------------------
# Fail closed: only `resolved` may serve, and an unknown version is stale.
grep -Fq 'return resolution.outcome === "resolved";' "$SEARCH_TYPES" \
  || fail "serving is no longer restricted to a resolved source"
grep -Fq 'if (currentSourceVersion === null || currentSourceVersion === undefined) return true;' "$SEARCH_TYPES" \
  || fail "an unknown source version no longer fails closed as stale"
# The version comparison itself, not merely the unknown-version guard.
grep -Fq 'return document.sourceVersion !== currentSourceVersion;' "$SEARCH_TYPES" \
  || fail "the sourceVersion stale comparison was removed"
# Only published rows may ever be projected into a run.
grep -Fq '.eq("publication_state", "published")' "$FR_SERVICE" \
  || fail "reconciliation no longer restricts projection to published rows"
grep -Fq 'export function isFreshEnoughToServe' "$FR_TYPES" \
  || fail "the freshness serving gate is missing"
# The health verdict must treat stale and unreachable as needing attention.
grep -Fq 'outcomes.stale === 0 && outcomes.unavailable === 0 && exhaustedRetries === 0' "$FR_TYPES" \
  || fail "the health verdict no longer accounts for stale, unreachable or exhausted state"
# Every outcome has an accessible label, so no raw code is rendered.
grep -Fq 'export function describeFreshnessOutcomeLabel' "$FR_TYPES" \
  || fail "operational outcomes have no accessible text labels"

echo "PASS: stale, missing, unpublished, unauthorized and unreachable all fail closed"

# --- 61. Health output is aggregate-only ------------------------------------
grep -Fq 'export const SEARCH_FRESHNESS_FORBIDDEN_FIELDS' "$FR_TYPES" \
  || fail "the freshness output prohibition is not held as data"
for forbidden in documents documentIds titles snippets records userId ownerId query hiddenCount; do
  grep -Fq "\"$forbidden\"" "$FR_TYPES" \
    || fail "a record-bearing field is missing from the freshness prohibition list: $forbidden"
done
# The report shape is pinned by FIELD NAMES, so a leak cannot be added beside it.
FR_REPORT_BODY="$(awk '/^export interface SearchFreshnessReport \{/{f=1;next} f&&/^\}/{f=0} f' "$FR_TYPES")"
FR_REPORT_FIELDS="$(echo "$FR_REPORT_BODY" | grep -oE '^[[:space:]]+[A-Za-z_]+' | tr -d ' ' | sort | tr '\n' ' ')"
[ "$FR_REPORT_FIELDS" = "examined exhaustedRetries healthy modelVersion outcomes servable unservable " ] \
  || fail "the freshness report fields changed; only aggregate state is approved:
  actual: $FR_REPORT_FIELDS"
# The route returns the report and status text and nothing else.
echo "$FR_ROUTE_BLOCK" | tr -d ' \n' \
  | grep -Fq 'sendJson(response,200,{report,status:describeSearchFreshnessStatus(report)});' \
  || fail "the freshness route no longer returns aggregate report and status only"

echo "PASS: freshness health exposes aggregate state and no records"

# --- 62. The freshness route is founder-guarded and read-only --------------
grep -Fq 'pathname === "/admin/search/freshness"' "$SERVER" \
  || fail "the founder freshness route is missing"
echo "$FR_ROUTE_BLOCK" | grep -Fq 'await founder(request)' \
  || fail "the freshness route is not founder-guarded"
echo "$FR_ROUTE_BLOCK" | grep -Fq 'request.method === "GET"' \
  || fail "the freshness route is not a GET read"
for method in POST PUT PATCH DELETE; do
  if echo "$FR_ROUTE_BLOCK" | grep -Fq "request.method === \"$method\""; then
    fail "the freshness route accepts a mutation method: $method"
  fi
done
for forbidden in userId ownerId studentId learnerId accessToken=; do
  if echo "$FR_ROUTE_BLOCK" | grep -Fq "$forbidden"; then
    fail "the freshness route accepts a caller-supplied identity: $forbidden"
  fi
done
# No service-role client anywhere in the Search freshness path.
if echo "$FR_SERVICE_CODE" | grep -qF 'createServerSupabaseClient'; then
  fail "a service-role client entered the Search freshness path"
fi
FR_CLIENTS="$(echo "$FR_SERVICE_CODE" | grep -c 'createUserScopedSupabaseClient(' || true)"
[ "$FR_CLIENTS" = "1" ] \
  || fail "the freshness path creates $FR_CLIENTS clients; exactly one caller-scoped client is allowed"

echo "PASS: the freshness route is founder-guarded, read-only and caller-scoped"

# --- 63. Private content and SEARCH-008 stay out ---------------------------
grep -Fq 'export const SEARCH_INDEXED_SOURCE_ENGINES = ["curriculum"] as const;' "$SEARCH_TYPES" \
  || fail "the indexed source engine set changed; notes must never be indexed"
grep -Fq 'isSharedIndexEligible(document)' "$FR_SERVICE" \
  || fail "private or non-shared content is no longer excluded from reconciliation"
for forbidden in student_notes searchStudentNotes noteId note_body; do
  if echo "$FR_TYPES_BARE$FR_SERVICE_BARE" | grep -qF "$forbidden"; then
    fail "a private note source entered SEARCH-007: $forbidden"
  fi
done
for forbidden in relevance boost popularity rankResults scoreResult weighting; do
  if echo "$FR_TYPES_BARE$FR_SERVICE_BARE" | grep -qiF "$forbidden"; then
    fail "SEARCH-008 ranking leaked into SEARCH-007: $forbidden"
  fi
done

echo "PASS: private notes stay excluded and SEARCH-008 ranking remains absent"

# ============================================================
# SEARCH-008 — Search Result Ranking and Fallback (Batch 9)
# ============================================================

RK_TYPES="packages/shared-types/src/search-ranking.ts"
RK_TYPE_TESTS="packages/shared-types/src/search-ranking.test.ts"
FB_TYPES="packages/shared-types/src/search-fallback.ts"
FB_TYPE_TESTS="packages/shared-types/src/search-fallback.test.ts"
NAV_SERVICE="apps/web/src/search/curriculum-navigation-service.ts"
NAV_TESTS="apps/web/src/search/curriculum-navigation-service.test.ts"
RK_DOC="docs/Engineering-OS/BUILD_WAVE_9_BATCH_9_SEARCH_RANKING_FALLBACK.md"

for p in "$RK_TYPES" "$RK_TYPE_TESTS" "$FB_TYPES" "$FB_TYPE_TESTS" \
         "$NAV_SERVICE" "$NAV_TESTS" "$RK_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

RK_TYPES_CODE="$(code_of "$RK_TYPES")"
RK_TYPES_BARE="$(code_no_strings "$RK_TYPES")"
RK_TYPES_FLAT="$(echo "$RK_TYPES_CODE" | tr -d ' \n')"
FB_TYPES_CODE="$(code_of "$FB_TYPES")"
FB_TYPES_BARE="$(code_no_strings "$FB_TYPES")"
NAV_CODE="$(code_of "$NAV_SERVICE")"
RK_VIEW_FLAT="$(echo "$CS_VIEW_CODE" | tr -d ' \n')"

# --- 64. SEARCH-008 exists, is approved, and is wired in --------------------
SEARCH_008="$(find "$REGISTRY" -maxdepth 1 -name 'SEARCH-008_*.md' | head -1)"
[ -n "$SEARCH_008" ] || fail "SEARCH-008 specification is missing from the Feature Registry"
grep -Fq '[x] Approved' "$SEARCH_008" || fail "SEARCH-008 does not record Founder approval"
# DEC-046: SEARCH-008 must not depend on the indexing pipeline.
SEARCH_008_DEPENDS="$(awk '/^## Depends On/{f=1;next} /^## /{f=0} f' "$SEARCH_008" | grep -E '^- ' || true)"
if echo "$SEARCH_008_DEPENDS" | grep -qF 'SEARCH-007'; then
  fail "the SEARCH-008 dependency on SEARCH-007 was reintroduced"
fi
echo "$SEARCH_008_DEPENDS" | grep -qF 'SEARCH-005' \
  || fail "SEARCH-008 no longer records its genuine SEARCH-005 prerequisite"
grep -Fq 'export * from "./search-ranking";' packages/shared-types/src/index.ts \
  || fail "the ranking model is not exported from shared-types"
grep -Fq 'export * from "./search-fallback";' packages/shared-types/src/index.ts \
  || fail "the fallback model is not exported from shared-types"

echo "PASS: SEARCH-008 is approved, dependency-correct and wired in"

# --- 65. The approved precedence, pinned exactly ----------------------------
echo "$RK_TYPES_FLAT" \
  | grep -Fq 'CURRICULUM_TITLE_PRECISIONS=["whole_title","title_token","title_substring","description_only"]asconst;' \
  || fail "the approved title-precision vocabulary changed"
# description_only must stay LAST: an unclassifiable result must never reach the
# top of a list by failing to classify.
RK_LAST_PRECISION="$(echo "$RK_TYPES_FLAT" \
  | grep -oE 'CURRICULUM_TITLE_PRECISIONS=\[[^]]*\]' | grep -oE '"[a-z_]+"\]$' || true)"
[ "$RK_LAST_PRECISION" = '"description_only"]' ] \
  || fail "description_only is not the weakest title precision"
# The comparator itself. R1 MUST be evaluated before R2, or a query-adjusted
# result could displace one that matched the learner's actual words.
echo "$RK_TYPES_FLAT" \
  | grep -Fq 'constmatchDelta=matchTierOf(a)-matchTierOf(b);if(matchDelta!==0)returnmatchDelta;returntitleTierOf(a)-titleTierOf(b);' \
  || fail "the ranking comparator changed; match class must dominate title precision"
# Every precision branch must exist, in the approved strength order.
RK_BRANCHES="$(echo "$RK_TYPES_CODE" | grep -oE 'precision = "[a-z_]+"' | tr '\n' ' ')"
[ "$RK_BRANCHES" = 'precision = "whole_title" precision = "title_token" precision = "title_substring" ' ] \
  || fail "the title-precision classification branches changed: $RK_BRANCHES"
# Token comparison must REUSE SEARCH-005 rather than implement a second rule.
grep -Fq 'containsTokenSequence(normalizedTitle, value)' "$RK_TYPES" \
  || fail "title token matching no longer reuses the SEARCH-005 token comparison"

echo "PASS: the approved ranking precedence is pinned exactly"

# --- 66. Ranking runs before the limit, and is deterministic ----------------
grep -Fq 'const bounded = ranked.slice(0, limit);' "$RK_TYPES" \
  || fail "the ranked results are not bounded by the requested limit"
RK_SORT_AT="$(echo "$RK_TYPES_FLAT" | grep -bo 'constranked=\[...neutral\].sort' | head -1 | cut -d: -f1 || true)"
RK_SLICE_AT="$(echo "$RK_TYPES_FLAT" | grep -bo 'constbounded=ranked.slice(0,limit);' | head -1 | cut -d: -f1 || true)"
[ -n "$RK_SORT_AT" ] || fail "the ranking sort is missing"
[ -n "$RK_SLICE_AT" ] || fail "the ranking bound is missing"
[ "$RK_SORT_AT" -lt "$RK_SLICE_AT" ] \
  || fail "the limit is applied before ranking; an exact title match could be truncated"
# The neutral SEARCH-002 order must be established BEFORE the ranking sort, so a
# tie always falls back to the existing total order rather than input order.
RK_NEUTRAL_AT="$(echo "$RK_TYPES_FLAT" | grep -bo 'constneutral=orderCurriculumSearchResults' | head -1 | cut -d: -f1 || true)"
[ -n "$RK_NEUTRAL_AT" ] || fail "the neutral pre-pass is missing"
[ "$RK_NEUTRAL_AT" -lt "$RK_SORT_AT" ] \
  || fail "the neutral order no longer precedes ranking"
# No randomness anywhere.
if echo "$RK_TYPES_BARE" | grep -qiE 'math\.random|shuffle|randomize|crypto\.getRandom'; then
  fail "randomness entered the ranking order"
fi

echo "PASS: ranking is deterministic and bounds only after ordering"

# --- 67. No numeric relevance and no forbidden ranking signal ---------------
grep -Fq 'export const SEARCH_RANKING_FORBIDDEN_SIGNALS' "$RK_TYPES" \
  || fail "the forbidden-ranking-signal prohibition is not held as data"
grep -Fq 'SEARCH_RANKING_FORBIDDEN_SIGNALS' "$RK_TYPE_TESTS" \
  || fail "the forbidden-ranking-signal prohibition is not asserted by tests"
for forbidden in relevanceScore rankScore boost popularity clickHistory \
                 engagement analytics learnerProgress sourceUpdatedAt \
                 freshness embedding vector; do
  grep -Fq "\"$forbidden\"" "$RK_TYPES" \
    || fail "a forbidden ranking signal is missing from the prohibition list: $forbidden"
done
# Prose and the prohibition list are excluded, so this judges real code.
if echo "$RK_TYPES_BARE" | grep -qiE 'relevance|boost|popularity|engagement|clickH|scoreOf|weightOf|sourceUpdatedAt|freshness|embedding|semantic|vector'; then
  fail "a prohibited ranking signal entered the SEARCH-008 comparator"
fi
# Ruling 3: a lexicographic named-rule comparator, never arithmetic on values.
if echo "$RK_TYPES_BARE" | grep -qE '\* *[0-9]+\.[0-9]|\*\* *[0-9]|Math\.(pow|log|sqrt|exp)'; then
  fail "numeric scoring arithmetic entered the SEARCH-008 comparator"
fi
# Ruling 6: no note source may reach ranking.
for forbidden in student_notes searchStudentNotes noteId note_body; do
  if echo "$RK_TYPES_BARE" | grep -qF "$forbidden"; then
    fail "a private note source entered SEARCH-008 ranking: $forbidden"
  fi
done
# Ruling 8: no identity, no client, no read.
for forbidden in accessToken supabase createUserScopedSupabaseClient \
                 createServerSupabaseClient userId ownerId studentId learnerId; do
  if echo "$RK_TYPES_BARE" | grep -qF "$forbidden"; then
    fail "an identity or client reached the SEARCH-008 comparator: $forbidden"
  fi
done
# The signature admits exactly the three approved parameters.
echo "$RK_TYPES_FLAT" \
  | grep -Fq 'exportfunctionbuildRankedCurriculumSearchResults(classified:readonlyClassifiedSearchDocument[],variants:readonlyCurriculumQueryVariant[],limit:number):CurriculumSearchResults{' \
  || fail "the ranking signature changed; it must accept only classified results, variants and the limit"

echo "PASS: ranking carries no score, identity, behaviour or freshness signal"

# --- 68. Ranking is composed strictly after authorization -------------------
grep -Fq 'const candidates = surfaceAuthorized(permissioned);' "$CS_SERVICE" \
  || fail "the SEARCH-003 surfacing gate is missing from the search pass"
CS_AUTH_AT="$(echo "$CS_SERVICE_FLAT" | grep -bo 'constcandidates=surfaceAuthorized(permissioned);' | head -1 | cut -d: -f1 || true)"
CS_FILTER_AT="$(echo "$CS_SERVICE_FLAT" | grep -bo 'constfiltered=applyCurriculumSearchFilter(selected,filter);' | head -1 | cut -d: -f1 || true)"
CS_RANK_AT="$(echo "$CS_SERVICE_FLAT" | grep -bo 'buildRankedCurriculumSearchResults(classified,effectiveVariants,limit)' | head -1 | cut -d: -f1 || true)"
[ -n "$CS_AUTH_AT" ] || fail "the authorization gate is missing"
[ -n "$CS_FILTER_AT" ] || fail "the SEARCH-004 filter step is missing"
[ -n "$CS_RANK_AT" ] || fail "the SEARCH-008 ranking step is missing"
[ "$CS_AUTH_AT" -lt "$CS_FILTER_AT" ] \
  || fail "filtering no longer runs after authorization"
[ "$CS_FILTER_AT" -lt "$CS_RANK_AT" ] \
  || fail "ranking no longer runs after authorization and filtering"
# Ranking must receive the classified, authorized value and nothing else.
if echo "$CS_SERVICE_CODE" | grep -qE 'buildRankedCurriculumSearchResults\([^)]*(permissioned|accessToken|supabase|data)'; then
  fail "an unauthorized or raw value reached the ranking call"
fi
# Classification — and therefore ranking — must iterate the FILTERED, surfaced
# set. Iterating the permissioned list instead would let a candidate the caller
# was never entitled to see enter a tier, a count and the response.
grep -Fq 'for (const entry of filtered) {' "$CS_SERVICE" \
  || fail "match classification no longer iterates the authorized, filtered set"

echo "PASS: ranking runs only on authorized, filtered, classified results"

# --- 69. Fallback keeps failure and emptiness apart -------------------------
echo "$(echo "$FB_TYPES_CODE" | tr -d ' \n')" \
  | grep -Fq 'SEARCH_FALLBACK_REASONS=["no_results","search_unavailable"]asconst;' \
  || fail "the approved fallback reason vocabulary changed"
grep -Fq 'export function describeCurriculumFallbackHeadline' "$FB_TYPES" \
  || fail "the fallback headline is missing"
# The degraded headline must say it is NOT an empty result.
grep -Fq 'This is a search problem, not an empty result.' "$FB_TYPES" \
  || fail "the degraded state no longer denies being an empty result"
# The view must derive the two states from DIFFERENT facts and never conflate
# them. Pinned exactly: degradation comes from a rejected request, emptiness
# from a successful response whose RETURNED count is zero.
echo "$RK_VIEW_FLAT" \
  | grep -Fq 'constfallbackReason:SearchFallbackReason|undefined=degraded?"search_unavailable":results&&!error&&results.count===0?"no_results":undefined;' \
  || fail "the fallback state machine changed; failure and emptiness must stay distinct"
grep -Fq 'setDegraded(true);' "$CS_VIEW" \
  || fail "the degraded state is never entered"
CS_DEGRADED_SET="$(echo "$CS_VIEW_CODE" | grep -c 'setDegraded(true)' || true)"
[ "$CS_DEGRADED_SET" = "1" ] \
  || fail "the degraded state is set at $CS_DEGRADED_SET sites; exactly one may exist"
# A validation error is neither state.
grep -Fq 'setDegraded(false);' "$CS_VIEW" \
  || fail "the degraded state is never cleared"

echo "PASS: a failed search is never rendered as an empty result"

# --- 70. Suggestions are bounded learner actions ----------------------------
echo "$(echo "$FB_TYPES_CODE" | tr -d ' \n')" \
  | grep -Fq 'CURRICULUM_FALLBACK_ACTIONS=["clear_filters","browse_curriculum"]asconst;' \
  || fail "the approved fallback action vocabulary changed"
grep -Fq 'export const SEARCH_FALLBACK_FORBIDDEN_FIELDS' "$FB_TYPES" \
  || fail "the fallback prohibition is not held as data"
grep -Fq 'SEARCH_FALLBACK_FORBIDDEN_FIELDS' "$FB_TYPE_TESTS" \
  || fail "the fallback prohibition is not asserted by tests"
for forbidden in candidateCount totalCount globalTotal hiddenCount \
                 withheldCount unauthorizedCount suggestedTerms \
                 relatedQueries synonyms noteId noteBody userId ownerId; do
  grep -Fq "\"$forbidden\"" "$FB_TYPES" \
    || fail "a forbidden field is missing from the fallback prohibition list: $forbidden"
  if echo "$FB_TYPES_BARE" | grep -qF "$forbidden"; then
    fail "a forbidden channel entered fallback guidance: $forbidden"
  fi
done
# Ruling 5: SEARCH-008 must not become a second query-interpretation engine.
if echo "$FB_TYPES_BARE" | grep -qiE 'synonym|alias|typo|levenshtein|editDistance|broaden|expandQuery|didYouMean|stemming|trgm|semantic|embedding'; then
  fail "a second query-interpretation mechanism entered SEARCH-008 fallback"
fi
# The guidance function may read nothing but its three declared inputs.
echo "$(echo "$FB_TYPES_CODE" | tr -d ' \n')" \
  | grep -Fq 'exportfunctionbuildCurriculumFallbackGuidance(input:{reason:SearchFallbackReason;query:string;filterActive:boolean;}):CurriculumFallbackGuidance{' \
  || fail "the fallback guidance signature changed; it must accept no result, count or client"
# Ruling 5: the fallback must never alter a filter or re-run a search itself.
CS_FALLBACK_BLOCK="$(awk '/fallbackGuidance && !showingOriginal/{cap=1} cap; /^      \)\}$/{if(cap)exit}' "$CS_VIEW" || true)"
for forbidden in 'runSearch(' 'setContentTypes(' 'searchCurriculum(' 'searchMyNotes('; do
  if echo "$CS_FALLBACK_BLOCK" | grep -qF "$forbidden"; then
    fail "the fallback surface performs a search or filter change itself: $forbidden"
  fi
done
if echo "$CS_VIEW_CODE" | grep -qE '^\s*clearFilters\(\);'; then
  fail "filters are cleared automatically rather than by the learner"
fi

echo "PASS: fallback suggestions are learner actions with no hidden channel"

# --- 71. Structured navigation reuses the existing authorized route ---------
grep -Fq '"/curriculum/paths"' "$NAV_SERVICE" \
  || fail "the navigation fallback does not use the existing published-paths route"
# Counts CALL sites, not the import: a leftover import would otherwise satisfy
# this guard while a second request was added beside it.
NAV_ROUTES="$(echo "$NAV_CODE" | grep -c 'apiRequest<' || true)"
[ "$NAV_ROUTES" = "1" ] \
  || fail "the navigation service makes $NAV_ROUTES requests; exactly one may exist"
NAV_PATHS="$(echo "$NAV_CODE" | grep -oE '"/[a-z/-]+"' | sort -u | tr '\n' ' ')"
[ "$NAV_PATHS" = '"/curriculum/paths" ' ] \
  || fail "the navigation service reaches an unapproved route: $NAV_PATHS"
grep -Fq 'buildCurriculumNavigationEntries(payload.learningPaths ?? [])' "$NAV_SERVICE" \
  || fail "the navigation response is not projected through the approved builder"
# The read must go out as the CALLER. An anonymous or substituted token would be
# a second authorization path beside the session the learner actually holds.
grep -Fq '>(accessToken, "/curriculum/paths", {' "$NAV_SERVICE" \
  || fail "the navigation read no longer goes through the caller's own session"
# SEARCH-008 adds NO route. The server must gain nothing.
for forbidden in '/search/ranking' '/search/fallback' '/search/navigation' \
                 '/curriculum/browse' '/admin/search/ranking'; do
  if grep -qF "$forbidden" "$SERVER"; then
    fail "SEARCH-008 added an API route: $forbidden"
  fi
done
# No identity selector, no service role, no direct transport.
for forbidden in userId user_id ownerId owner_id studentId learnerId \
                 createServerSupabaseClient; do
  if echo "$NAV_CODE" | grep -qF "$forbidden"; then
    fail "the navigation service carries an identity or privileged path: $forbidden"
  fi
done
if echo "$NAV_CODE" | grep -qE 'fetch\(|XMLHttpRequest|Authorization'; then
  fail "the navigation service builds its own transport or auth header"
fi
# The projection must not carry an internal identifier.
grep -Fq 'export function buildCurriculumNavigationEntries' "$FB_TYPES" \
  || fail "the navigation projection is missing"
grep -Fq 'reference: buildCurriculumSourceReference("learning_path", stableId)' "$FB_TYPES" \
  || fail "navigation no longer preserves the SEARCH-002 source-of-truth link"
if echo "$FB_TYPES_BARE" | grep -qE '\.\.\.path|Object\.assign\(|JSON\.parse'; then
  fail "the navigation projection copies source fields wholesale"
fi
grep -Fq 'export const CURRICULUM_NAVIGATION_MAX_ENTRIES' "$FB_TYPES" \
  || fail "the navigation list is unbounded"
# A failed navigation read must stay a failure.
grep -Fq 'export function describeCurriculumNavigationUnavailable' "$FB_TYPES" \
  || fail "a failed navigation read has no honest message"
grep -Fq 'describeCurriculumNavigationUnavailable()' "$CS_VIEW" \
  || fail "the view never renders the navigation failure state"
grep -Fq 'describeCurriculumNavigationEmpty()' "$CS_VIEW" \
  || fail "the view never distinguishes an empty curriculum from a failed read"
echo "$RK_VIEW_FLAT" | grep -Fq 'setEntries(null);setUnavailable(true);' \
  || fail "a failed navigation read is not kept distinct from an empty list"

echo "PASS: navigation reuses one authenticated route and leaks no identity"

# --- 72. The learner surface: ordered, explained, and leak-free ------------
# Order now carries meaning, so the list is ORDERED markup.
echo "$RK_VIEW_FLAT" \
  | grep -Fq '<olaria-labelledby="curriculum-results-heading">{results.results.map(' \
  || fail "ranked curriculum results are not rendered as an ordered list of the returned results"
grep -Fq 'describeCurriculumRankingOrder()' "$CS_VIEW" \
  || fail "the ordering rule is not explained to the learner in text"
# Ruling 3: no per-result ranking diagnostic may reach the learner.
for forbidden in matchKind titlePrecision relevance rankScore scoreOf \
                 CURRICULUM_TITLE_PRECISIONS SEARCH_RANKING_FORBIDDEN_SIGNALS; do
  if grep -qF "$forbidden" "$CS_VIEW"; then
    fail "an internal ranking value reached the learner surface: $forbidden"
  fi
done
# Ruling 6: the two sources stay separately grouped and are never interleaved.
if echo "$RK_VIEW_FLAT" | grep -qE '<olaria-labelledby="curriculum-results-heading">[^<]*notes'; then
  fail "private notes were interleaved into ranked curriculum results"
fi
# Section 10: text, never colour, icon, hover or animation alone.
if grep -qiE 'onMouseOver|onMouseEnter|animation:|@keyframes|title="rank' "$CS_VIEW"; then
  fail "ordering or fallback meaning depends on hover or animation"
fi
if grep -qiE 'className="[^"]*\b(green|red|amber|danger)\b' "$CS_VIEW"; then
  fail "colour became a status signal on the search surface"
fi

echo "PASS: ranked results are ordered markup with a text explanation and no internals"

# --- 73. SEARCH-008 adds no migration, dependency, provider or AI -----------
SEARCH_008_MIGRATIONS="$(ls supabase/migrations/*rank*.sql supabase/migrations/*fallback*.sql supabase/migrations/*search*.sql 2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$SEARCH_008_MIGRATIONS" = "0" ] || fail "SEARCH-008 must add no migration"
for forbidden in elasticsearch opensearch algolia meilisearch redis \
                 pinecone weaviate qdrant openai anthropic ollama; do
  if grep -qi "$forbidden" package.json packages/shared-types/package.json \
       services/api/package.json apps/web/package.json; then
    fail "SEARCH-008 introduced a search provider or AI dependency: $forbidden"
  fi
done
if echo "$RK_TYPES_BARE$FB_TYPES_BARE$NAV_CODE" | grep -qiE 'openai|anthropic|ollama|embedding|vectorStore|setInterval|cron|queue|localStorage|sessionStorage|indexedDB'; then
  fail "AI, scheduling, caching or client storage entered SEARCH-008"
fi
grep -Fq 'SEARCH-008' "$RK_DOC" \
  || fail "the Batch 9 implementation document does not record SEARCH-008"
grep -Fq '12.1' "$RK_DOC" \
  || fail "the Batch 9 document does not record the approved section 12.1 interpretation"

echo "PASS: SEARCH-008 adds no migration, provider, dependency, cache or AI"

# ------------------------------------------------------------
# 11. Repository toolchain
# ------------------------------------------------------------
echo ""
echo "--- repository verification ---"
npm run typecheck
npm test
npm run build
bash scripts/security-scan.sh

echo ""
echo "============================================================"
echo "Wave 9 Batch 1 through Batch 9 verification passed."
echo "SEARCH-001 Search Document and Index Model is implemented."
echo "SEARCH-002 Curriculum Search is implemented."
echo "SEARCH-003 Permission-Aware Search is implemented."
echo "SEARCH-004 Search Filters and Facets is implemented."
echo "SEARCH-005A Technical Query Normalization and Curated Aliases is implemented."
echo "SEARCH-005B Bounded Typo Recovery is implemented."
echo "SEARCH-006 Personal Notes Search Integration is implemented."
echo "SEARCH-007 Indexing and Freshness Pipeline is implemented."
echo "SEARCH-008 Search Result Ranking and Fallback is implemented."
echo "One authenticated search route, no cache or index, no migration, no AI."
echo "Facet counts describe the returned authorized results and nothing else."
echo "Ranking is deterministic, carries no score, and runs only after authorization."
echo "A failed search is never presented as an empty result."
echo "The Search Engine completion gate does not exist yet; Search is NOT complete."
echo "============================================================"
