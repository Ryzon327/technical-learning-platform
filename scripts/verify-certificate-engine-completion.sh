#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# Certificate Engine completion gate — Build Wave 8.
#
# This gate is deliberately NOT a copy of scripts/verify-wave8.sh. That script
# proves each batch's implementation. This one asks the different question the
# completion review must answer:
#
#   "Does the implemented Certificate Engine satisfy the approved Wave 8 MVP as
#    a complete subsystem?"
#
# It therefore checks the Feature Registry itself, the governance record, the
# cross-feature authority boundaries no single batch owns, and the engine-wide
# security boundaries — and only then defers to the per-batch verifier.
#
# Per FEATURE_REGISTRY_SPEC.md section 9.11, a Feature is complete when its
# approved ACCEPTANCE CRITERIA pass, together with tests, security,
# accessibility, documentation and recorded Founder approval. Section 9.3
# "Scope" states included and excluded behaviour; it is a boundary statement,
# not the completion bar. This gate is built to that rule.
#
# Absence checks judge COMMENT-STRIPPED code. Certificate sources document
# precisely what they exclude, so a naive full-text scan would flag a module's
# own exclusion notes as violations — a false positive this engine produced
# repeatedly during Wave 8.
# ============================================================

REGISTRY="docs/Feature-Registry/Certificate-Engine"
SEQUENCE="docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md"
REVIEW="docs/Engineering-OS/BUILD_WAVE_8_CERTIFICATE_ENGINE_COMPLETION_REVIEW.md"
STATUS="docs/Project/CURRENT_BUILD_STATUS.md"
LEDGER="docs/Project/DECISION_LEDGER.md"

fail() { echo "GATE FAIL: $1"; exit 1; }

# Comment-stripped view of a TypeScript source.
code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }

# ------------------------------------------------------------
# 1. CERT-001 through CERT-009 exist and are Founder approved
# ------------------------------------------------------------
[ -f "$REGISTRY/CERTIFICATE_ENGINE_FEATURES.md" ] \
  || fail "Certificate Engine feature index is missing"

for id in 001 002 003 004 005 006 007 008 009; do
  spec="$(find "$REGISTRY" -maxdepth 1 -name "CERT-${id}_*.md" | head -1)"
  [ -n "$spec" ] || fail "CERT-${id} specification is missing from the Feature Registry"

  # FEATURE_REGISTRY_SPEC.md section 14: approval is the recorded Founder
  # decision that the Feature should exist.
  grep -Fq '[x] Approved' "$spec" || fail "CERT-${id} does not record Founder approval"

  # Section 8: a Feature past approval carries a lifecycle state.
  grep -Eq '^\*\*Lifecycle Status:\*\* (Approved|Specified|Planned|Building|Testing|Review|Production)' "$spec" \
    || fail "CERT-${id} has no lifecycle state at or beyond Approved"

  # Section 9.10: observable acceptance criteria, which 9.11 makes the bar.
  grep -Fq '# 12. Acceptance Criteria' "$spec" \
    || grep -Fq '# 13. Acceptance Criteria' "$spec" \
    || grep -Fq '# 14. Acceptance Criteria' "$spec" \
    || fail "CERT-${id} has no Acceptance Criteria section"
  grep -Fq 'Definition of Done' "$spec" || fail "CERT-${id} has no Definition of Done"
done

# Each approved Feature must have a build document recording how it was met.
for doc in \
  BUILD_WAVE_8_BATCH_1_CERTIFICATE_DEFINITION_MODEL \
  BUILD_WAVE_8_BATCH_2_CERTIFICATE_ELIGIBILITY_RULES \
  BUILD_WAVE_8_BATCH_3_STUDENT_ELIGIBILITY_UI \
  BUILD_WAVE_8_BATCH_4_DETERMINISTIC_CERTIFICATE_ISSUANCE \
  BUILD_WAVE_8_BATCH_5_CERTIFICATE_RECORD_AND_LIFECYCLE \
  BUILD_WAVE_8_BATCH_6_CERTIFICATE_VERIFICATION \
  BUILD_WAVE_8_BATCH_7_STUDENT_CERTIFICATE_PORTFOLIO \
  BUILD_WAVE_8_BATCH_8_CERTIFICATE_EXPORT_AND_SHARING \
  BUILD_WAVE_8_BATCH_9_CERTIFICATE_REVOCATION_AND_CORRECTION \
  BUILD_WAVE_8_BATCH_10_CERTIFICATE_BRANDING_AND_PRESENTATION; do
  [ -f "docs/Engineering-OS/${doc}.md" ] || fail "missing build document ${doc}.md"
done

echo "PASS: CERT-001 through CERT-009 exist, are Founder approved, and carry acceptance criteria"

# ------------------------------------------------------------
# 2. The governance record states completion
# ------------------------------------------------------------
[ -f "$REVIEW" ] || fail "the Wave 8 Certificate Engine completion review is missing"
grep -Fq 'satisfies the approved Wave 8 MVP' "$REVIEW" \
  || fail "the completion review does not state that the engine satisfies the approved MVP"
grep -Fq 'CERT-001' "$REVIEW" || fail "the completion review does not cover CERT-001"
grep -Fq 'CERT-009' "$REVIEW" || fail "the completion review does not cover CERT-009"

[ -f "$STATUS" ] || fail "CURRENT_BUILD_STATUS.md is missing"
grep -Fq 'Build Wave 8 — Certificate Engine: **COMPLETE**' "$STATUS" \
  || fail "CURRENT_BUILD_STATUS does not record Wave 8 as complete"
grep -Fq 'Next implementation stage: **Build Wave 9 — Search**.' "$STATUS" \
  || fail "CURRENT_BUILD_STATUS does not declare Build Wave 9 — Search as next"

echo "PASS: the completion review and build status record Wave 8 as complete"

# ------------------------------------------------------------
# 3. The engine implementation surface the approved specs require
# ------------------------------------------------------------
for module in certificate-definition certificate-eligibility certificate-issuance \
              certificate-lifecycle certificate-verification certificate-portfolio \
              certificate-export certificate-correction certificate-presentation; do
  [ -f "packages/shared-types/src/${module}.ts" ] \
    || fail "shared model is missing: ${module}.ts"
  [ -f "packages/shared-types/src/${module}.test.ts" ] \
    || fail "shared model has no tests: ${module}.test.ts"
done

for service in certificate-admin certificate-eligibility certificate-issuance \
               certificate-lifecycle certificate-verification certificate-portfolio \
               certificate-export certificate-correction certificate-presentation; do
  [ -f "services/api/src/${service}.ts" ] || fail "API service is missing: ${service}.ts"
  [ -f "services/api/src/${service}.test.ts" ] || fail "API service has no tests: ${service}.test.ts"
done

CERT_MIGRATIONS="$(ls supabase/migrations/*certificate*.sql 2>/dev/null | xargs -n1 basename | LC_ALL=C sort || true)"
EXPECTED_MIGRATIONS="20260813000700_certificate_definition_foundation.sql
20260813000800_certificate_issuance_foundation.sql
20260813000900_certificate_lifecycle_foundation.sql
20260813001000_certificate_correction_foundation.sql"
[ "$CERT_MIGRATIONS" = "$EXPECTED_MIGRATIONS" ] \
  || fail "unexpected certificate migration set:
$CERT_MIGRATIONS"

echo "PASS: the engine implementation surface required by the approved specs exists"

# ------------------------------------------------------------
# 4. CERT-004 is the sole certificate lifecycle authority
# ------------------------------------------------------------
LIFECYCLE_RESOLVERS="$(grep -rlF 'export function resolveEffectiveCertificateStatus' \
  packages/shared-types/src services/api/src 2>/dev/null || true)"
[ "$LIFECYCLE_RESOLVERS" = "packages/shared-types/src/certificate-lifecycle.ts" ] \
  || fail "certificate status is resolved outside CERT-004: $LIFECYCLE_RESOLVERS"

TRANSITION_RULES="$(grep -rlF 'export function isValidCertificateLifecycleTransition' \
  packages/shared-types/src services/api/src 2>/dev/null || true)"
[ "$TRANSITION_RULES" = "packages/shared-types/src/certificate-lifecycle.ts" ] \
  || fail "a second transition rule exists outside CERT-004: $TRANSITION_RULES"

# Only CERT-004's own migration may write lifecycle history.
for migration in supabase/migrations/*certificate*.sql; do
  case "$migration" in
    *certificate_lifecycle_foundation.sql) continue ;;
  esac
  if grep -vE '^\s*--' "$migration" \
    | grep -qE '(insert|update|delete)[[:space:]]+(into[[:space:]]+|from[[:space:]]+)?public\.certificate_lifecycle_events'; then
    fail "a migration outside CERT-004 writes lifecycle history: $migration"
  fi
done

# No cached status column anywhere: status is derived at read time.
if grep -vE '^\s*--' supabase/migrations/*certificate*.sql \
  | grep -qE 'current_status|cached_status|status_cache'; then
  fail "a cached certificate status column exists; CERT-004 derives status at read time"
fi

echo "PASS: CERT-004 remains the sole certificate lifecycle authority"

# ------------------------------------------------------------
# 5. CERT-005 is the sole public verification authority
# ------------------------------------------------------------
PUBLIC_BUILDERS="$(grep -rlF 'export function buildCertificateVerificationRecord' \
  packages/shared-types/src services/api/src 2>/dev/null || true)"
[ "$PUBLIC_BUILDERS" = "packages/shared-types/src/certificate-verification.ts" ] \
  || fail "a second public verification payload builder exists: $PUBLIC_BUILDERS"

grep -Fq 'CERTIFICATE_VERIFICATION_FORBIDDEN_FIELDS' \
  packages/shared-types/src/certificate-verification.ts \
  || fail "CERT-005 no longer holds its forbidden-field list as data"

# Exactly one public certificate route may exist. The route is a regex literal
# with escaped separators, so it is matched in that form.
grep -Fq '/^\/certificates\/verify\/([^/]+)$/' services/api/src/server.ts \
  || fail "the CERT-005 public verification route is missing or changed shape"
# Anchored at the start of the path so /admin/certificates/... cannot match:
# the only non-admin path-parameter certificate route is CERT-005 verification.
PUBLIC_CERT_ROUTES="$(grep -oE '\^\\/certificates\\/[a-z-]+\\/' services/api/src/server.ts | LC_ALL=C sort -u || true)"
[ "$PUBLIC_CERT_ROUTES" = '^\/certificates\/verify\/' ] \
  || fail "the public certificate route set changed: $PUBLIC_CERT_ROUTES"

echo "PASS: CERT-005 remains the sole public verification authority"

# ------------------------------------------------------------
# 6. Holder identity never reaches a public or exported surface
# ------------------------------------------------------------
# CERT-009 owns the owner-only display name. No other certificate service may
# read learner identity, and CERT-005 and CERT-007 must not carry it at all.
for guarded in certificate-verification certificate-export certificate-portfolio \
               certificate-issuance certificate-lifecycle certificate-correction; do
  if code_of "services/api/src/${guarded}.ts" | grep -qE 'user_profiles|display_name'; then
    fail "holder identity is read outside CERT-009: ${guarded}.ts"
  fi
done

code_of "services/api/src/certificate-presentation.ts" | grep -qF 'display_name' \
  || fail "CERT-009 no longer reads the owner's display name"
code_of "services/api/src/certificate-presentation.ts" | grep -qF '.eq("user_id", userId)' \
  || fail "the CERT-009 display name read is not scoped to the caller"

# The holder name must remain presentation data, not issuance truth.
grep -qi 'not historical issuance truth' packages/shared-types/src/certificate-presentation.ts \
  || fail "CERT-009 no longer records that the holder name is presentation data"
if grep -vE '^\s*--' supabase/migrations/*certificate*.sql | grep -qE 'display_name|holder_name'; then
  fail "a holder name was snapshotted into certificate schema; that is issuance truth"
fi

echo "PASS: holder identity is owner-only and never public, exported or frozen"

# ------------------------------------------------------------
# 7. Later features compose earlier truth rather than redefine it
# ------------------------------------------------------------
# CERT-007 export and CERT-009 presentation must build on CERT-006, not re-read
# certificates; neither may resolve status itself.
for composer in certificate-export certificate-presentation; do
  code="$(code_of "services/api/src/${composer}.ts")"
  echo "$code" | grep -qF 'getStudentCertificatePortfolio' \
    || fail "${composer}.ts does not compose the CERT-006 portfolio"
  echo "$code" | grep -qF 'resolveEffectiveCertificateStatus' \
    && fail "${composer}.ts resolves lifecycle status itself" || true
  for write in '.insert(' '.update(' '.upsert(' '.delete(' '.rpc('; do
    if echo "$code" | grep -qF "$write"; then
      fail "${composer}.ts writes certificate data: $write"
    fi
  done
done

# CERT-008 owns the correction workflow and must delegate the transition.
grep -Fq 'public.certificate_record_lifecycle_event(' \
  supabase/migrations/20260813001000_certificate_correction_foundation.sql \
  || fail "CERT-008 no longer delegates its transition to CERT-004"
code_of "services/api/src/certificate-correction.ts" | grep -qE 'certificate_lifecycle_events' \
  && fail "CERT-008 writes lifecycle history itself" || true

echo "PASS: later certificate features compose earlier truth and never redefine it"

# ------------------------------------------------------------
# 8. Exactly one verification mechanism, and no second token
# ------------------------------------------------------------
MINTERS="$(grep -rlF "cert1_" packages/shared-types/src services/api/src 2>/dev/null \
  | grep -v '\.test\.ts$' || true)"
for minter in $MINTERS; do
  case "$minter" in
    packages/shared-types/src/certificate-issuance.ts) ;;
    packages/shared-types/src/certificate-verification.ts) ;;
    services/api/src/certificate-issuance.ts) ;;
    *) fail "an unexpected module handles the verification reference: $minter" ;;
  esac
done

# Quoted prohibition-list entries are excluded: those lists exist to forbid the
# very names they contain.
CERT_SOURCES="$(ls packages/shared-types/src/certificate-*.ts services/api/src/certificate-*.ts \
  | grep -v '\.test\.ts$' || true)"
if [ -n "$CERT_SOURCES" ]; then
  TOKEN_SCAN="$(cat $CERT_SOURCES | grep -vE '^\s*(//|\*|/\*)' | grep -vE '^\s*"[A-Za-z_]+",?$' || true)"
  if echo "$TOKEN_SCAN" | grep -qE 'shareToken|verificationToken|share_link|shareUrl'; then
    fail "a second verification or share token mechanism exists"
  fi
fi

echo "PASS: one verification mechanism exists and no second token was introduced"

# ------------------------------------------------------------
# 9. AI holds no authority over deterministic certificate truth
# ------------------------------------------------------------
AI_SCAN_TARGETS="$(ls packages/shared-types/src/certificate-*.ts \
  services/api/src/certificate-*.ts supabase/migrations/*certificate*.sql 2>/dev/null \
  | grep -v '\.test\.ts$' || true)"
if [ -n "$AI_SCAN_TARGETS" ] && grep -nEi 'openai|anthropic|ollama|ai[-_ ]?gateway' $AI_SCAN_TARGETS; then
  fail "an AI dependency exists in the certificate truth path"
fi

echo "PASS: AI holds no authority anywhere in the certificate truth path"

# ------------------------------------------------------------
# 10. The verification infrastructure the engine depends on
# ------------------------------------------------------------
# Presence, not the execute bit: every caller runs these as `bash <script>`, so
# executability proves nothing about whether they work (DEV-FLOW-2).
[ -f scripts/verify-wave8.sh ] || fail "the Wave 8 per-batch verifier is missing"
[ -f scripts/smoke-api.sh ] || fail "the API smoke script is missing"
grep -Fq '/certificates/verify/' scripts/smoke-api.sh \
  || fail "smoke coverage for public verification is missing"
grep -Fq '/certificates/presentation' scripts/smoke-api.sh \
  || fail "smoke coverage for the CERT-009 presentation route is missing"

# The credential decisions governing this engine must remain recorded.
[ -f "$LEDGER" ] || fail "the Decision Ledger is missing"
for dec in DEC-029 DEC-034 DEC-036 DEC-038 DEC-039 DEC-041 DEC-043 DEC-044 DEC-045; do
  grep -Fq "## ${dec}" "$LEDGER" || fail "governing decision ${dec} is missing from the Decision Ledger"
done

echo "PASS: the engine's verification infrastructure and governing decisions exist"

# ------------------------------------------------------------
# 11. Next approved wave, read only from the roadmap sequence
# ------------------------------------------------------------
[ -f "$SEQUENCE" ] || fail "MVP implementation sequence is missing"
grep -Fq 'Build Wave 9 — Search' "$SEQUENCE" \
  || fail "the roadmap sequence does not declare Build Wave 9 — Search"

echo "PASS: the roadmap sequence declares Build Wave 9 — Search as the next wave"

# ------------------------------------------------------------
# 12. The per-batch verifier and the repository toolchain
# ------------------------------------------------------------
bash scripts/verify-wave8.sh

echo ""
echo "============================================================"
echo "Certificate Engine completion gate PASSED."
echo "Build Wave 8 — Certificate Engine satisfies the approved MVP."
echo "The CERT-008 correction migration is committed but NOT executed."
echo "Next approved implementation wave: Build Wave 9 — Search."
echo "============================================================"
