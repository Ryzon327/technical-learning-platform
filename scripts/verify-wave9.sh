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
grep -Fq 'buildCurriculumSearchResults(documents, limit)' "$CS_SERVICE" \
  || fail "the returned results are not bounded by the requested limit"

echo "PASS: query, limit and candidate over-fetch are all bounded"

# --- 17. Escaped literal matching, no later Search behaviour ----------------
# Matched on the CALL, not the import: a leftover import would otherwise satisfy
# this guard while the raw query went straight into the ILIKE pattern.
grep -Fq 'escapeCurriculumSearchPattern(query)' "$CS_SERVICE" \
  || fail "the query is not escaped before ILIKE matching"
grep -Fq "s\\\\\\\\%_" "$CS_TYPES" >/dev/null 2>&1 || true
grep -Fq 'replace(/[\\%_]/g' "$CS_TYPES" \
  || fail "the LIKE control characters are not escaped"
for forbidden in fuzzy synonym typo levenshtein soundex stemming; do
  if echo "$CS_TYPES_CODE$CS_SERVICE_CODE" | grep -qiF "$forbidden"; then
    fail "SEARCH-005 behaviour leaked into SEARCH-002: $forbidden"
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
echo "$CS_SERVICE_FLAT" \
  | grep -Fq 'returnwithCurriculumSearchFacets(buildCurriculumSearchResults(documents,limit));' \
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
for forbidden in fuzzy synonym typo levenshtein soundex stemming semantic; do
  if echo "$SF_TYPES_BARE$SF_SERVICE_BARE" | grep -qiF "$forbidden"; then
    fail "SEARCH-005 behaviour leaked into SEARCH-004: $forbidden"
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

echo "PASS: SEARCH-005 through SEARCH-008 remain unimplemented"

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
echo "Wave 9 Batch 1 through Batch 4 verification passed."
echo "SEARCH-001 Search Document and Index Model is implemented."
echo "SEARCH-002 Curriculum Search is implemented."
echo "SEARCH-003 Permission-Aware Search is implemented."
echo "SEARCH-004 Search Filters and Facets is implemented."
echo "SEARCH-005 through SEARCH-008 remain unimplemented."
echo "One authenticated search route, no cache or index, no migration, no AI."
echo "Facet counts describe the returned authorized results and nothing else."
echo "============================================================"
