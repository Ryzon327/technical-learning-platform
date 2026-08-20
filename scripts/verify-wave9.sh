#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# Build Wave 9 — Search Engine.
#
# SEARCH-001 ONLY at this stage. This verifier evolves narrowly as SEARCH-002
# through SEARCH-008 are implemented; it must not be widened speculatively.
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
# 6. SEARCH-002 through SEARCH-008 remain unimplemented
# ------------------------------------------------------------
# No search route: SEARCH-001's acceptance criteria are all "Platform can ...".
for route in '"/search"' '"/search/curriculum"' '"/curriculum/search"'; do
  if grep -Fq "pathname === $route" "$SERVER"; then
    fail "SEARCH-002 search route leaked into SEARCH-001: $route"
  fi
done
if grep -Fq 'from "./search-document"' "$SERVER"; then
  fail "the Search service is wired into the router; SEARCH-002 owns the surface"
fi

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

echo "PASS: SEARCH-002 through SEARCH-008 remain unimplemented"

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
echo "Wave 9 Batch 1 verification passed."
echo "SEARCH-001 Search Document and Index Model is implemented."
echo "SEARCH-002 through SEARCH-008 remain unimplemented."
echo "No search route, no materialized index, no migration, no AI dependency."
echo "============================================================"
