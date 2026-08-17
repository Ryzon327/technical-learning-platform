#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Wave 8 — Certificate Engine verifier.
# Batch 1 scope: CERT-001 Certificate Definition Model only.
# Later Wave 8 batches extend this script.
#
# Wave 8 is not green unless Wave 7 is still green. The Evidence Engine
# completion gate runs first, unmodified: CERT-001 depends on EVID-001, and a
# certificate model that quietly broke Evidence would be worthless. Nothing in
# this script weakens a Wave 7 guarantee.

CERT_TYPES="packages/shared-types/src/certificate-definition.ts"
CERT_TYPE_TESTS="packages/shared-types/src/certificate-definition.test.ts"
CERT_SERVICE="services/api/src/certificate-admin.ts"
CERT_SERVICE_TESTS="services/api/src/certificate-admin.test.ts"
CERT_MIGRATION="supabase/migrations/20260813000700_certificate_definition_foundation.sql"
CERT_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_1_CERTIFICATE_DEFINITION_MODEL.md"
SERVER="services/api/src/server.ts"

fail() { echo "FAIL: $1"; exit 1; }

for p in \
  "$CERT_TYPES" \
  "$CERT_TYPE_TESTS" \
  "$CERT_SERVICE" \
  "$CERT_SERVICE_TESTS" \
  "$CERT_MIGRATION" \
  "$CERT_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

# Comment-stripped views. Absence checks must judge code, not the prose that
# documents what was deliberately excluded.
CERT_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$CERT_SERVICE" || true)"
CERT_MIGRATION_CODE="$(grep -vE '^\s*--' "$CERT_MIGRATION" || true)"

# ------------------------------------------------------------
# 1. One canonical Certificate Definition model, and only one
# ------------------------------------------------------------
grep -Fq 'export interface CertificateDefinition' "$CERT_TYPES" \
  || fail "the canonical CertificateDefinition interface is missing"
grep -Fq 'export * from "./certificate-definition";' packages/shared-types/src/index.ts \
  || fail "certificate-definition is not exported from shared-types"

DUPLICATE_MODELS="$(ls packages/shared-types/src/certificate*.ts 2>/dev/null \
  | grep -v 'certificate-definition\.ts$' \
  | grep -v 'certificate-definition\.test\.ts$' || true)"
[ -z "$DUPLICATE_MODELS" ] \
  || fail "a duplicate shared Certificate model exists: $DUPLICATE_MODELS"

CERT_MIGRATIONS="$(ls supabase/migrations/*certificate*.sql 2>/dev/null | wc -l | tr -d ' ')"
[ "$CERT_MIGRATIONS" = "1" ] \
  || fail "expected exactly one certificate migration, found $CERT_MIGRATIONS"

# The empty scaffolds stay empty in Batch 1; the real architecture is
# packages/shared-types + services/api.
SCAFFOLD_FILES="$(find packages/certificate-engine content/certificates -type f 2>/dev/null || true)"
[ -z "$SCAFFOLD_FILES" ] \
  || fail "the certificate-engine/content scaffolds must stay untouched in Batch 1"

echo "PASS: certificate-definition.ts is the single canonical Certificate model"
echo "PASS: exactly one CERT-001 migration exists"
echo "PASS: the empty certificate scaffolds remain untouched"

# ------------------------------------------------------------
# 2. Normalized model — three tables, no JSON blobs
# ------------------------------------------------------------
for table in \
  certificate_definitions \
  certificate_definition_competencies \
  certificate_definition_evidence_policies; do
  grep -Fq "create table if not exists public.$table" "$CERT_MIGRATION" \
    || fail "table $table is missing"
  grep -Fq "alter table public.$table enable row level security" "$CERT_MIGRATION" \
    || fail "RLS is not enabled on $table"
done

if echo "$CERT_MIGRATION_CODE" | grep -qE '\bjsonb?\b'; then
  fail "structured certificate requirements must not be stored as JSON blobs"
fi

grep -Fq 'unique (stable_id, version)' "$CERT_MIGRATION" \
  || fail "unique (stable_id, version) is missing"
grep -Fq 'competency_stable_id text not null' "$CERT_MIGRATION" \
  || fail "the pinned competency stable id column is missing"
grep -Fq 'competency_version integer not null' "$CERT_MIGRATION" \
  || fail "the pinned competency version column is missing"

echo "PASS: the CERT-001 model is normalized across three tables"
echo "PASS: stable_id + version identity is unique"

# ------------------------------------------------------------
# 3. Expiration policy — nullable, 1..600, declarative only
# ------------------------------------------------------------
grep -Fq 'expiration_months >= 1 and expiration_months <= 600' "$CERT_MIGRATION" \
  || fail "the 1-600 month expiration window is not enforced"
if echo "$CERT_MIGRATION_CODE" | grep -qE 'expiration_months[[:space:]]+integer[[:space:]]+not[[:space:]]+null'; then
  fail "expiration_months must be nullable; null means no expiration"
fi
grep -Fq 'CERTIFICATE_EXPIRATION_MIN_MONTHS = 1' "$CERT_TYPES" \
  || fail "the minimum expiration constant is missing"
grep -Fq 'CERTIFICATE_EXPIRATION_MAX_MONTHS = 600' "$CERT_TYPES" \
  || fail "the maximum expiration constant is missing"

# Declarative only: no expiry computation, scheduler or revalidation model.
if echo "$CERT_SERVICE_CODE$CERT_MIGRATION_CODE" \
  | grep -qEi 'expiresAt|expires_at|expiry|calculateExpir|revalidation|setInterval|setTimeout|cron|pg_cron'; then
  fail "expirationMonths must be declarative; no expiry calculation or scheduler is permitted in CERT-001"
fi

echo "PASS: expirationMonths is nullable, bounded 1-600, and declarative only"

# ------------------------------------------------------------
# 4. Verification policy — declarative only, no CERT-005 behaviour
# ------------------------------------------------------------
grep -Fq 'verification_permitted boolean not null' "$CERT_MIGRATION" \
  || fail "verification_permitted is missing"
grep -Fq 'verificationPermitted' "$CERT_TYPES" \
  || fail "verificationPermitted is missing from the shared model"

if echo "$CERT_SERVICE_CODE$CERT_MIGRATION_CODE" \
  | grep -qEi 'verification_id|verificationId|verificationCode|verificationUrl|verificationReference|gen_random_bytes|randomBytes|randomUUID'; then
  fail "CERT-001 must not mint verification identifiers; CERT-005 owns verification"
fi

if grep -qE 'pathname === "/verify|pathname\.match\([^)]*\\/verify|/certificates/verify' "$SERVER"; then
  fail "a certificate verification route exists; CERT-005 is not in scope"
fi

echo "PASS: verificationPermitted is a declarative boolean with no CERT-005 behaviour"

# ------------------------------------------------------------
# 5. Published material immutability — TypeScript and SQL agree
# ------------------------------------------------------------
grep -Fq 'CERTIFICATE_DEFINITION_MATERIAL_FIELDS' "$CERT_TYPES" \
  || fail "the material field set is missing from the shared model"
grep -Fq 'guard_certificate_definition_material_freeze' "$CERT_MIGRATION" \
  || fail "the published-definition freeze trigger is missing"
grep -Fq "Published Certificate Definition versions are materially immutable" "$CERT_MIGRATION" \
  || fail "the freeze trigger does not raise on material change"

# Every material scalar field in TypeScript must be frozen in SQL.
for pair in \
  "stableId:stable_id" \
  "version:version" \
  "issuer:issuer" \
  "effectiveAt:effective_at" \
  "expirationMonths:expiration_months" \
  "verificationPermitted:verification_permitted"; do
  ts_field="${pair%%:*}"
  sql_column="${pair##*:}"

  grep -Fq "\"$ts_field\"" "$CERT_TYPES" \
    || fail "material field $ts_field is missing from the TypeScript field set"
  grep -Fq "new.$sql_column is distinct from old.$sql_column" "$CERT_MIGRATION" \
    || fail "material field $ts_field is not frozen by the SQL trigger (column $sql_column)"
done

# The two collection fields are frozen by the requirement-row trigger instead.
grep -Fq 'guard_certificate_definition_requirement_freeze' "$CERT_MIGRATION" \
  || fail "the requirement-row freeze trigger is missing"
grep -Fq 'before insert or update or delete on public.certificate_definition_competencies' "$CERT_MIGRATION" \
  || fail "competency requirement rows are not frozen"
grep -Fq 'before insert or update or delete on public.certificate_definition_evidence_policies' "$CERT_MIGRATION" \
  || fail "evidence policy rows are not frozen"

# Lifecycle and supersession must NOT be frozen, or retirement becomes
# impossible and supersession can never be recorded.
if grep -Fq 'new.publication_state is distinct from old.publication_state' "$CERT_MIGRATION"; then
  fail "freezing publication_state would make retirement impossible"
fi
if grep -Fq 'new.superseded_by_definition_id is distinct from old.superseded_by_definition_id' "$CERT_MIGRATION"; then
  fail "freezing superseded_by_definition_id would make supersession impossible"
fi

grep -Fq 'evaluateCertificateDefinitionEdit' "$CERT_SERVICE" \
  || fail "the service does not check material immutability before writing"

echo "PASS: the SQL freeze trigger and the TypeScript material field set agree"
echo "PASS: material change requires a new version; presentation stays editable"

# ------------------------------------------------------------
# 6. Exact competency version pinning, never "latest"
# ------------------------------------------------------------
grep -Fq 'guard_certificate_definition_competency_pin' "$CERT_MIGRATION" \
  || fail "the competency pin guard is missing"
grep -Fq '.eq("version", requirement.competencyVersion)' "$CERT_SERVICE" \
  || fail "required competencies are not resolved by exact version"
grep -Fq 'UNRESOLVED_COMPETENCY_VERSION' "$CERT_SERVICE" \
  || fail "an unresolvable competency version must be an explicit failure"

if echo "$CERT_SERVICE_CODE" | grep -qi 'latest'; then
  fail "a broken competency version must never be repaired with 'latest'"
fi

echo "PASS: required competencies are pinned to exact historical versions"

# ------------------------------------------------------------
# 7. Publication fails closed
# ------------------------------------------------------------
grep -Fq 'INELIGIBLE_COMPETENCY' "$CERT_SERVICE" \
  || fail "an unpublished competency must block publication"
grep -Fq 'competency.publication_state !== "published"' "$CERT_SERVICE" \
  || fail "competency publication eligibility is not checked"
grep -Fq 'Certificate Definition cannot be published until validation passes' "$CERT_SERVICE" \
  || fail "publication is not gated on validation"
grep -Fq 'isValidCertificateDefinitionTransition' "$CERT_SERVICE" \
  || fail "publication transitions are not validated"

echo "PASS: publication fails closed on invalid or ineligible competency references"

# ------------------------------------------------------------
# 8. Supersession — no self reference, no cycle, no prerequisites
# ------------------------------------------------------------
grep -Fq 'certificate_definitions_no_self_supersession' "$CERT_MIGRATION" \
  || fail "self-supersession is not blocked by a constraint"
grep -Fq 'Certificate Definition supersession would create a cycle' "$CERT_MIGRATION" \
  || fail "supersession cycles are not blocked"
grep -Fq 'validateCertificateDefinitionSupersession' "$CERT_SERVICE" \
  || fail "the service does not validate supersession"

if echo "$CERT_SERVICE_CODE$CERT_MIGRATION_CODE" | grep -qi 'prerequisite'; then
  fail "prerequisite certificates are explicitly out of scope"
fi

echo "PASS: supersession rejects self-reference and cycles; no prerequisites exist"

# ------------------------------------------------------------
# 9. Privileged authoring boundary and route/export agreement
# ------------------------------------------------------------
# Every name server.ts imports from certificate-admin must actually be exported.
IMPORT_BLOCK="$(awk '/^import \{$/{buf="";cap=1} cap{buf=buf $0 "\n"} /from "\.\/certificate-admin";/{if(cap){printf "%s", buf; cap=0}}' "$SERVER")"
[ -n "$IMPORT_BLOCK" ] || fail "server.ts does not import from ./certificate-admin"

IMPORTED_NAMES="$(echo "$IMPORT_BLOCK" | grep -oE '^\s+[a-zA-Z][a-zA-Z0-9]*,?$' | tr -d ' ,')"
[ -n "$IMPORTED_NAMES" ] || fail "no certificate-admin imports were parsed from server.ts"

for name in $IMPORTED_NAMES; do
  grep -Eq "^export (async )?function $name\b" "$CERT_SERVICE" \
    || fail "server.ts calls '$name' but certificate-admin.ts does not export it"
  grep -Fq "await $name(" "$SERVER" \
    || fail "server.ts imports '$name' but never calls it"
done

# Every certificate route is founder-guarded.
CERT_ROUTE_BLOCK="$(awk '/CERT-001 — privileged Certificate Definition authoring/{cap=1} /pathname === "\/admin\/ping"/{cap=0} cap' "$SERVER")"
[ -n "$CERT_ROUTE_BLOCK" ] || fail "the certificate route block was not found in server.ts"

ROUTE_COUNT="$(echo "$CERT_ROUTE_BLOCK" | grep -c 'request.method ===' || true)"
GUARD_COUNT="$(echo "$CERT_ROUTE_BLOCK" | grep -c 'await founder(request)' || true)"
[ "$ROUTE_COUNT" = "$GUARD_COUNT" ] \
  || fail "certificate routes ($ROUTE_COUNT) and founder guards ($GUARD_COUNT) disagree"
[ "$ROUTE_COUNT" -ge 9 ] \
  || fail "expected at least 9 privileged certificate routes, found $ROUTE_COUNT"

if echo "$CERT_ROUTE_BLOCK" | grep -Fq 'resolveTrustedRequestIdentity(request)'; then
  fail "a certificate route uses the bare student identity path"
fi

grep -Fq 'createServerSupabaseClient()' "$CERT_SERVICE" \
  || fail "certificate authoring must use the server-authoritative client"
if grep -Fq 'createUserScopedSupabaseClient' "$CERT_SERVICE"; then
  fail "certificate authoring must not use the user-scoped client"
fi
grep -Fq 'writeAuditEvent' "$CERT_SERVICE" || fail "certificate authoring is not audited"

echo "PASS: server.ts route names exactly match certificate-admin exports"
echo "PASS: every certificate route is founder-admin guarded and audited"

# ------------------------------------------------------------
# 9b. Atomic requirement replacement
#
# Replacing a requirement set is DELETE + INSERT. As two PostgREST calls those
# are two transactions, and a failure between them would leave the definition
# requiring nothing. Both statements must live inside one database function.
# ------------------------------------------------------------
for fn in \
  certificate_definition_replace_competencies \
  certificate_definition_replace_evidence_policies; do
  grep -Fq "create or replace function public.$fn" "$CERT_MIGRATION" \
    || fail "the atomic replacement function $fn is missing"
  grep -Fq "$fn" "$CERT_SERVICE" \
    || fail "the service does not call $fn"

  # Privileged-RPC convention: security definer, fixed search_path, and
  # execute revoked from every client role.
  grep -Fq "revoke all on function public.$fn" "$CERT_MIGRATION" \
    || fail "$fn does not revoke execute from client roles"
  if grep -Fq "grant execute on function public.$fn" "$CERT_MIGRATION"; then
    fail "$fn must not grant execute; no student execution permission is permitted"
  fi
done

if echo "$CERT_MIGRATION_CODE" | grep -Fq "grant execute"; then
  fail "CERT-001 must not grant execute on any function"
fi

# The service must not issue its own DELETE against a requirement table, which
# would reintroduce the two-transaction failure window.
if echo "$CERT_SERVICE_CODE" | grep -Fq ".delete()"; then
  fail "certificate authoring must not delete requirement rows outside the atomic function"
fi

# Inside each function, the freeze check and the length guard must precede the
# destructive statement.
for fn in \
  certificate_definition_replace_competencies \
  certificate_definition_replace_evidence_policies; do
  BODY="$(awk "/create or replace function public\.$fn/{cap=1} /revoke all on function public\.$fn/{cap=0} cap" "$CERT_MIGRATION")"
  [ -n "$BODY" ] || fail "could not isolate the body of $fn"

  FREEZE_LINE="$(echo "$BODY" | grep -n "materially immutable" | head -1 | cut -d: -f1)"
  DELETE_LINE="$(echo "$BODY" | grep -n "delete from public\." | head -1 | cut -d: -f1)"
  LENGTH_LINE="$(echo "$BODY" | grep -n "must be the same length" | head -1 | cut -d: -f1)"
  LOCK_LINE="$(echo "$BODY" | grep -n "for update" | head -1 | cut -d: -f1)"

  [ -n "$FREEZE_LINE" ] || fail "$fn does not enforce the published freeze"
  [ -n "$DELETE_LINE" ] || fail "$fn performs no delete"
  [ -n "$LENGTH_LINE" ] || fail "$fn does not validate input array lengths"
  [ -n "$LOCK_LINE" ] || fail "$fn does not lock the parent definition row"

  [ "$FREEZE_LINE" -lt "$DELETE_LINE" ] \
    || fail "$fn deletes before enforcing the published freeze"
  [ "$LENGTH_LINE" -lt "$DELETE_LINE" ] \
    || fail "$fn deletes before validating its input"
  [ "$LOCK_LINE" -lt "$DELETE_LINE" ] \
    || fail "$fn deletes before locking the parent definition"

  echo "$BODY" | grep -Fq "insert into public.certificate_definition" \
    || fail "$fn does not insert the replacement rows in the same transaction"
done

echo "PASS: requirement replacement is atomic in a single database transaction"
echo "PASS: replacement validates and freezes before any destructive statement"
echo "PASS: replacement functions grant no student execution permission"

# ------------------------------------------------------------
# 10. No student write surface, no public read
# ------------------------------------------------------------
POLICY_COUNT="$(grep -c '^create policy' "$CERT_MIGRATION" || true)"
[ "$POLICY_COUNT" = "3" ] \
  || fail "expected exactly 3 select policies, found $POLICY_COUNT"

if grep -A3 -Ei '^on public\.certificate_definition' "$CERT_MIGRATION" \
  | grep -qEi '^\s*for\s+(insert|update|delete|all)\b'; then
  fail "a student write policy is granted on a certificate table"
fi
if grep -qEi 'create policy[^;]*certificate_definition[^;]*for[[:space:]]+(insert|update|delete|all)\b' "$CERT_MIGRATION"; then
  fail "a student write policy is granted on a certificate table"
fi
if echo "$CERT_MIGRATION_CODE" | grep -qE '\bto[[:space:]]+(anon|public)\b'; then
  fail "certificate definitions must not be readable by anon or public"
fi
grep -Fq "using (publication_state = 'published')" "$CERT_MIGRATION" \
  || fail "students must only be able to read published definitions"

# No non-admin certificate route may exist at all.
if grep -nE 'pathname === "/(?!admin)[^"]*certificate' "$SERVER" 2>/dev/null | grep -q .; then
  fail "a non-admin certificate route exists"
fi
if grep -nE 'pathname === "/certificates?' "$SERVER" | grep -q .; then
  fail "a student certificate route exists"
fi

echo "PASS: no student write policy and no public certificate read exists"
echo "PASS: no student-facing certificate route exists"

# ------------------------------------------------------------
# 11. CERT-002 through CERT-009 remain unimplemented
# ------------------------------------------------------------
if echo "$CERT_SERVICE_CODE" \
  | grep -qEi 'evaluateEligibility|isEligible|checkEligibility|eligibilityResult|qualifies'; then
  fail "CERT-002 eligibility evaluation leaked into Batch 1"
fi
if echo "$CERT_SERVICE_CODE" \
  | grep -qEi 'issueCertificate|grantCertificate|mintCertificate|issuedCertificate'; then
  fail "CERT-003 issuance leaked into Batch 1"
fi
if echo "$CERT_MIGRATION_CODE" \
  | grep -qEi 'student_certificates|issued_certificates|certificate_records|auth\.users'; then
  fail "a student certificate record leaked into Batch 1"
fi
if echo "$CERT_SERVICE_CODE" | grep -qEi 'revoke|revocation'; then
  fail "CERT-008 revocation leaked into Batch 1"
fi
if echo "$CERT_SERVICE_CODE" | grep -qEi 'portfolio|shareToken|share_link|employer|\bpdf\b|branding'; then
  fail "CERT-006/007/009 behaviour leaked into Batch 1"
fi
if echo "$CERT_SERVICE_CODE$CERT_MIGRATION_CODE" \
  | grep -qEi 'openai|anthropic|ollama|ai[-_ ]?gateway'; then
  fail "an AI dependency exists in the Certificate Definition path"
fi

echo "PASS: CERT-002 through CERT-009 remain unimplemented"
echo "PASS: AI holds no authority in the Certificate Definition path"

# ------------------------------------------------------------
# 12. Wave 7 must still be green before Wave 8 counts as green
# ------------------------------------------------------------
echo ""
echo "--- Wave 7 Evidence Engine completion gate ---"
bash scripts/verify-evidence-engine-completion.sh

# ------------------------------------------------------------
# 13. Repository toolchain
# ------------------------------------------------------------
echo ""
echo "--- repository verification ---"
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo ""
echo "============================================================"
echo "Wave 8 Batch 1 verification passed."
echo "CERT-001 Certificate Definition Model is implemented."
echo "Wave 7 Evidence Engine guarantees remain intact."
echo "============================================================"
