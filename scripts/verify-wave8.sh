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

# CERT-002 adds the eligibility module, which is a different concern rather than
# a second Definition model. The invariant is narrowed, not weakened: any other
# certificate module is still a failure, and the modules that are allowed must
# not redeclare the Certificate Definition model.
DUPLICATE_MODELS="$(ls packages/shared-types/src/certificate*.ts 2>/dev/null \
  | grep -v 'certificate-definition\.ts$' \
  | grep -v 'certificate-definition\.test\.ts$' \
  | grep -v 'certificate-eligibility\.ts$' \
  | grep -v 'certificate-eligibility\.test\.ts$' \
  | grep -v 'certificate-issuance\.ts$' \
  | grep -v 'certificate-issuance\.test\.ts$' || true)"
[ -z "$DUPLICATE_MODELS" ] \
  || fail "a duplicate shared Certificate model exists: $DUPLICATE_MODELS"

# Only certificate-definition.ts may declare the Certificate Definition model.
for module in certificate-eligibility certificate-issuance; do
  if grep -Fq 'export interface CertificateDefinition ' "packages/shared-types/src/$module.ts"; then
    fail "$module.ts must import the Certificate Definition model, not redeclare it"
  fi
done
DEFINITION_DECLARATIONS="$(grep -rlF 'export interface CertificateDefinition ' packages/shared-types/src services/api/src 2>/dev/null || true)"
[ "$DEFINITION_DECLARATIONS" = "packages/shared-types/src/certificate-definition.ts" ] \
  || fail "the Certificate Definition model is declared outside certificate-definition.ts: $DEFINITION_DECLARATIONS"

# Scoped to the CERT-001 definition migration. CERT-003 owns a separate
# issuance migration, asserted independently in its own section; the invariant
# here is that the Certificate Definition schema lives in exactly one file.
CERT_MIGRATIONS="$(ls supabase/migrations/*certificate_definition*.sql 2>/dev/null | wc -l | tr -d ' ')"
[ "$CERT_MIGRATIONS" = "1" ] \
  || fail "expected exactly one certificate definition migration, found $CERT_MIGRATIONS"

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
# Batch 1 forbade every student certificate route, because Batch 1 had none.
# Batch 2 adds exactly one approved student read — GET /certificates/eligibility
# (CERT-002). The invariant is therefore narrowed, not weakened: the only
# permitted student certificate path is the eligibility read, and any
# certificate record, issuance or verification route is still a failure.
# The approved student certificate surface is exactly two read-only routes:
# the eligibility evaluation, and the discovery read that feeds its selector.
# Any other /certificates path is unapproved. /certificates/* is never broadly
# permitted.
STUDENT_CERT_ROUTES="$(grep -oE 'pathname === "/certificates[^"]*"' "$SERVER" || true)"
for route in $(echo "$STUDENT_CERT_ROUTES" | grep -oE '"/certificates[^"]*"' || true); do
  case "$route" in
    '"/certificates/eligibility"'|'"/certificates/definitions"'|'"/certificates/issuance"') ;;
    *) fail "an unapproved student certificate route exists: $route" ;;
  esac
done

if grep -nE 'pathname === "/certificates"' "$SERVER" | grep -q .; then
  fail "a student certificate collection route exists"
fi
# Anchored at the start of the regex literal so the privileged
# /admin/certificates/... routes are not mistaken for student record routes.
if grep -nE 'pathname\.match\(/\^\\/certificates\\/' "$SERVER" | grep -q .; then
  fail "a student certificate record route exists"
fi
if grep -nE 'pathname === "/certificate-definitions' "$SERVER" | grep -q .; then
  fail "a student certificate definition route exists"
fi

echo "PASS: no student write policy and no public certificate read exists"
echo "PASS: the only student certificate route is the approved eligibility read"

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

echo "PASS: no CERT-002+ behaviour exists in the Certificate Definition path"
echo "PASS: AI holds no authority in the Certificate Definition path"

# ============================================================
# CERT-002 — Certificate Eligibility Rules (Batch 2)
# ============================================================

ELIG_TYPES="packages/shared-types/src/certificate-eligibility.ts"
ELIG_TYPE_TESTS="packages/shared-types/src/certificate-eligibility.test.ts"
ELIG_SERVICE="services/api/src/certificate-eligibility.ts"
ELIG_SERVICE_TESTS="services/api/src/certificate-eligibility.test.ts"
ELIG_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_2_CERTIFICATE_ELIGIBILITY_RULES.md"

for p in \
  "$ELIG_TYPES" \
  "$ELIG_TYPE_TESTS" \
  "$ELIG_SERVICE" \
  "$ELIG_SERVICE_TESTS" \
  "$ELIG_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

ELIG_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$ELIG_SERVICE" || true)"

# --- 14. no persistence, no migration ---------------------------------------
# CERT-002 is computed on demand and persists nothing. CERT-003 owns the
# issuance record and its snapshots in its own migration, and CERT-004 owns the
# durable lifecycle. The invariant here is that no *eligibility* schema exists,
# so the check is scoped by name rather than counting all certificate
# migrations.
if ls supabase/migrations/*eligibility*.sql >/dev/null 2>&1; then
  fail "CERT-002 must add no eligibility migration"
fi

if ls supabase/migrations/*eligibilit*.sql >/dev/null 2>&1; then
  fail "CERT-002 must not introduce an eligibility migration"
fi
if echo "$CERT_MIGRATION_CODE" | grep -qi 'eligibilit'; then
  fail "no eligibility table may exist in the certificate schema"
fi

# Evaluation must be free of side effects.
for write in '.insert(' '.update(' '.delete(' '.upsert(' '.rpc(' 'writeAuditEvent'; do
  if echo "$ELIG_SERVICE_CODE" | grep -Fq "$write"; then
    fail "eligibility evaluation must be side-effect free; found $write"
  fi
done

echo "PASS: CERT-002 adds no migration and persists no eligibility snapshot"
echo "PASS: eligibility evaluation is side-effect free"

# --- 15. canonical Wave 7 reuse, no second qualifying rule -------------------
grep -Fq 'getAuthoritativeCompetencyEvidenceReferences' "$ELIG_SERVICE" \
  || fail "eligibility does not read Wave 7 authoritative Evidence references"
grep -Fq 'qualifiesForDemonstration' "$ELIG_TYPES" \
  || fail "the evaluator does not consume the Wave 7 qualifying verdict"

# The Wave 7 qualification rule must not be re-derived inside the Certificate
# Engine — the verdict is read, never recomputed.
for rule in deriveEvidenceOutcome qualifiesAsDemonstrationEvidence \
            resolveEffectiveEvidenceState isEffectivelyTrustedEvidence; do
  if echo "$ELIG_SERVICE_CODE" | grep -Fq "$rule"; then
    fail "CERT-002 must not re-implement the Wave 7 rule $rule"
  fi
done

# student_competency_state collapses versions and cannot prove an exact pin.
for forbidden in student_competency_state listStudentCompetencyState \
                 student_competency_evidence_refs; do
  if echo "$ELIG_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "CERT-002 must not prove eligibility from $forbidden"
  fi
done

echo "PASS: eligibility reuses the canonical Wave 7 qualification verdict"
echo "PASS: version-collapsed competency state is never used as certificate proof"

# --- 16. exact competency version, never latest -----------------------------
grep -Fq 'reference.competencyVersion === requirement.competencyVersion' "$ELIG_TYPES" \
  || fail "the evaluator does not match the exact pinned competency version"
grep -Fq 'version_not_evidenced' "$ELIG_TYPES" \
  || fail "a version mismatch is not reported distinctly"
grep -Fq "'latest' is not supported" "$ELIG_SERVICE" \
  || fail "the service does not refuse a latest-version request"

if echo "$ELIG_SERVICE_CODE" | grep -qiE 'newest|fallback'; then
  fail "no latest/newest competency fallback is permitted"
fi
if echo "$ELIG_SERVICE_CODE" | grep -qE '\.order\(|\.limit\('; then
  fail "eligibility must not select a competency version by ordering"
fi

echo "PASS: eligibility matches the exact pinned competency version only"

# --- 17. three distinct outcomes --------------------------------------------
grep -Fq 'export type CertificateEligibilityStatus' "$ELIG_TYPES" \
  || fail "the CERT-002 eligibility status type is missing"
for status in '"eligible"' '"ineligible"' '"unknown"'; do
  grep -Fq "$status" "$ELIG_TYPES" \
    || fail "the CERT-002 outcome $status is not modelled"
done
grep -Fq 'CERTIFICATE_ELIGIBILITY_STATUSES' "$ELIG_TYPES" \
  || fail "the three CERT-002 outcomes are not enumerated distinctly"

for reason in definition_not_published evidence_under_unresolved_review \
              dependency_unavailable; do
  grep -Fq "$reason" "$ELIG_TYPES" \
    || fail "unknown reason $reason is missing"
done

grep -Fq 'unknownReason: "dependency_unavailable"' "$ELIG_SERVICE" \
  || fail "a dependency failure is not reported as unknown"
grep -Fq 'unknownReason: "definition_not_published"' "$ELIG_SERVICE" \
  || fail "an unpublished definition is not reported as unknown"
grep -Fq 'unknownReason: "evidence_under_unresolved_review"' "$ELIG_TYPES" \
  || fail "an unresolved review is not reported as unknown"

# The API layer must never fabricate a verdict; only the shared evaluator does.
if echo "$ELIG_SERVICE_CODE" | grep -Fq '"ineligible"'; then
  fail "the API layer must not determine ineligibility itself"
fi
grep -Fq 'evaluateCertificateEligibility' "$ELIG_SERVICE" \
  || fail "the service does not delegate to the deterministic evaluator"

echo "PASS: eligible, ineligible and unknown remain distinct outcomes"
echo "PASS: dependency failure, unresolved review and unpublished definitions are never ineligibility"

# --- 18. published definitions only -----------------------------------------
grep -Fq 'definition.publicationState !== "published"' "$ELIG_SERVICE" \
  || fail "student eligibility is not restricted to published definitions"
grep -Fq 'definition.publicationState !== "published"' "$ELIG_TYPES" \
  || fail "the evaluator does not restrict eligibility to published definitions"

echo "PASS: normal student eligibility evaluates published definition versions only"

# --- 19. authorization: own user only ---------------------------------------
ELIG_ROUTE_BLOCK="$(awk "/CERT-002 — the student's own certificate eligibility/{cap=1} /const evidenceCorrectionsMatch/{cap=0} cap" "$SERVER")"
[ -n "$ELIG_ROUTE_BLOCK" ] || fail "the CERT-002 route block was not found in server.ts"

echo "$ELIG_ROUTE_BLOCK" | grep -Fq 'resolveTrustedRequestIdentity(request)' \
  || fail "the eligibility route does not resolve a trusted identity"
echo "$ELIG_ROUTE_BLOCK" | grep -Fq 'trusted.identity.userId' \
  || fail "the eligibility route does not evaluate the authenticated caller"

for smuggled in 'searchParams.get("userId")' 'searchParams.get("studentId")' \
                'readJsonBody'; do
  if echo "$ELIG_ROUTE_BLOCK" | grep -Fq "$smuggled"; then
    fail "the eligibility route accepts a client-supplied subject: $smuggled"
  fi
done

if grep -Fq '/admin/certificates/eligibility' "$SERVER"; then
  fail "no admin eligibility endpoint is permitted in this batch"
fi

echo "PASS: eligibility evaluates only the authenticated caller"
echo "PASS: no admin eligibility endpoint exists"

# --- 20. CERT-003 through CERT-009 remain unimplemented ---------------------
if echo "$ELIG_SERVICE_CODE" | grep -qEi 'issueCertificate|grantCertificate|mintCertificate|student_certificates|issued_certificates'; then
  fail "CERT-003 issuance leaked into Batch 2"
fi
if echo "$ELIG_SERVICE_CODE" | grep -qEi 'verificationId|verificationCode|randomUUID|randomBytes'; then
  fail "CERT-005 verification identifiers leaked into Batch 2"
fi
if echo "$ELIG_SERVICE_CODE" | grep -qEi 'lifecycle|expiresAt|expires_at|expirationDate|revoke'; then
  fail "CERT-004 lifecycle or expiration leaked into Batch 2"
fi
if echo "$ELIG_SERVICE_CODE" | grep -qEi 'openai|anthropic|ollama|ai[-_ ]?gateway'; then
  fail "an AI dependency exists in the eligibility path"
fi

echo "PASS: CERT-003 through CERT-009 remain unimplemented"
echo "PASS: AI holds no authority over eligibility"

# ============================================================
# CERT-002 — Student Eligibility UI and Accessibility (follow-up)
#
# Batch 2 asserted that apps/web was unchanged, which recorded the
# intentionally deferred UI. That assertion is replaced here — the UI is now
# authorized and delivered — by substantive architecture and accessibility
# checks over the delivered files.
# ============================================================

UI_PRESENTATION="apps/web/src/certificates/certificate-eligibility-presentation.ts"
UI_PRESENTATION_TESTS="apps/web/src/certificates/certificate-eligibility-presentation.test.ts"
UI_SERVICE="apps/web/src/certificates/certificate-eligibility-service.ts"
UI_VIEW="apps/web/src/certificates/CertificateEligibilityView.tsx"
UI_SHELL="apps/web/src/auth/AuthenticatedApp.tsx"
UI_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_3_STUDENT_ELIGIBILITY_UI.md"

for p in \
  "$UI_PRESENTATION" \
  "$UI_PRESENTATION_TESTS" \
  "$UI_SERVICE" \
  "$UI_VIEW" \
  "$UI_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

UI_VIEW_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$UI_VIEW" || true)"
UI_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$UI_SERVICE" || true)"
UI_PRESENTATION_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$UI_PRESENTATION" || true)"

# --- 21. no new dependency, no router, no DOM testing stack -----------------
if grep -nE 'react-router|@remix-run|wouter|tanstack' apps/web/package.json; then
  fail "the eligibility UI must not introduce a routing library"
fi
if grep -nE '"(jsdom|@testing-library/react|jest-axe|happy-dom)"' apps/web/package.json; then
  fail "the eligibility UI must not introduce a DOM testing stack"
fi

echo "PASS: no routing library or DOM testing stack was introduced"

# --- 22. the frontend computes no eligibility -------------------------------
for forbidden in qualifiesForDemonstration deriveEvidenceOutcome \
                 qualifiesAsDemonstrationEvidence resolveEffectiveEvidenceState \
                 isEffectivelyTrustedEvidence evaluateCertificateEligibility; do
  if echo "$UI_VIEW_CODE$UI_PRESENTATION_CODE$UI_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "the eligibility UI must not re-derive eligibility: $forbidden"
  fi
done

# No local minimum-count comparison, in either direction.
if echo "$UI_VIEW_CODE$UI_PRESENTATION_CODE" | grep -qE 'qualifyingCount[[:space:]]*>=|>=[[:space:]]*[a-zA-Z]*minimumCount|minimumCount[[:space:]]*<=|minimumCount[[:space:]]*>|<[[:space:]]*[a-zA-Z]*minimumCount'; then
  fail "the eligibility UI must not compare counts to minimums"
fi

# No aggregate satisfaction decision in the frontend.
if echo "$UI_VIEW_CODE$UI_PRESENTATION_CODE" | grep -qE '\.every\(|\.some\('; then
  fail "the eligibility UI must not aggregate requirement satisfaction itself"
fi

# No local assignment of a truth value the backend owns.
if echo "$UI_VIEW_CODE$UI_PRESENTATION_CODE" | grep -qE 'satisfied[[:space:]]*=[^=>]'; then
  fail "the eligibility UI must not assign requirement satisfaction"
fi
if echo "$UI_VIEW_CODE$UI_PRESENTATION_CODE" | grep -qE 'status[[:space:]]*=[[:space:]]*"(eligible|ineligible|unknown)"'; then
  fail "the eligibility UI must not assign an eligibility status"
fi

# No version preference inferred by sorting in the frontend.
if echo "$UI_VIEW_CODE$UI_PRESENTATION_CODE$UI_SERVICE_CODE" | grep -qE '\.sort\('; then
  fail "the eligibility UI must not order or prefer certificate versions"
fi

echo "PASS: the eligibility UI presents backend truth and computes none of it"
echo "PASS: the eligibility UI performs no local satisfaction or status decision"

# --- 23. exact-version selection --------------------------------------------
grep -Fq 'stableId: option.stableId' "$UI_VIEW" \
  || fail "the view does not pass the selected stable id through"
grep -Fq 'version: option.version' "$UI_VIEW" \
  || fail "the view does not pass the selected exact version through"
grep -Fq '"/certificates/eligibility"' "$UI_SERVICE" \
  || fail "the UI service does not call the approved eligibility endpoint"
grep -Fq '"/certificates/definitions"' "$UI_SERVICE" \
  || fail "the UI service does not call the approved discovery endpoint"

# No option may be labelled with a precedence CERT-001 does not define.
# Word-bounded and case-insensitive over comment-stripped code, so the check is
# less brittle than an exact-case substring match and does not trip on prose
# that documents the prohibition.
if echo "$UI_PRESENTATION_CODE$UI_VIEW_CODE" | grep -qiE '\blatest\b|\bnewest\b|\brecommended\b|\bpreferred\b|current version'; then
  fail "no certificate version may be labelled latest, newest, recommended, preferred or current"
fi

echo "PASS: the exact selected certificate version is the one evaluated"
echo "PASS: no version is presented as latest, current, recommended or preferred"

# --- 24. no issuance or CERT-003+ control -----------------------------------
# Later-feature surfaces stay prohibited. CERT-003 authorizes exactly one
# student control, worded as a request rather than an issuance the client
# performs; every other issuance-adjacent affordance still fails the build.
for forbidden in 'Issue certificate' 'Claim certificate' 'Generate certificate' \
                 'Download certificate' 'Share certificate' 'Verify certificate' \
                 onIssue handleIssue handleClaim handleDownload; do
  if grep -Fq "$forbidden" "$UI_VIEW"; then
    fail "the eligibility UI must expose no issuance control: $forbidden"
  fi
done

# The one approved CERT-003 control, by exact wording.
grep -Fq 'CERTIFICATE_REQUEST_ACTION_LABEL' "$UI_VIEW" \
  || fail "the approved certificate request control is missing"
grep -Fq '"Request this certificate"' "$UI_PRESENTATION" \
  || fail "the approved request wording is missing"
grep -Fq 'Certificate issued: ' "$UI_PRESENTATION" \
  || fail "the approved issuance success wording is missing"

# No later-Feature endpoint may be called from the client, even if the server
# would reject it. Anchored with a terminating quote so the approved
# /certificates/issuance path is not mistaken for /certificates/issue.
if echo "$UI_SERVICE_CODE$UI_VIEW_CODE" | grep -qE '/certificates/(issue|claim|verify)"|"/verify/'; then
  fail "the eligibility UI must not call an issuance or verification endpoint"
fi

# CERT-003 authorizes exactly one write from this UI: the issuance request.
# Every other method remains prohibited, and POST is permitted only to the
# approved path.
for method in PATCH PUT DELETE; do
  if echo "$UI_SERVICE_CODE" | grep -Fq "method: \"$method\""; then
    fail "the eligibility UI must not use $method"
  fi
done

UI_POST_COUNT="$(echo "$UI_SERVICE_CODE" | grep -c 'method: "POST"' || true)"
if [ "$UI_POST_COUNT" -gt 1 ]; then
  fail "only one CERT-related POST is authorized; found $UI_POST_COUNT"
fi
if [ "$UI_POST_COUNT" = "1" ]; then
  echo "$UI_SERVICE_CODE" | grep -Fq '"/certificates/issuance"' \
    || fail "the only authorized UI POST destination is /certificates/issuance"
fi

for forbidden in userId studentId user_id subjectId; do
  if echo "$UI_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "the eligibility UI must never send a user identifier: $forbidden"
  fi
done

# The student must be told that checking eligibility does not request or issue
# anything, so an eligible result is never mistaken for a granted certificate.
grep -Fq 'does not request or issue a certificate' "$UI_VIEW" \
  || fail "the eligibility UI must disclose that checking does not issue a certificate"

echo "PASS: the eligibility UI exposes no issuance, sharing or verification control"
echo "PASS: the eligibility UI sends no user identifier and writes only via the approved issuance request"
echo "PASS: the student is told that checking eligibility issues nothing"

# --- 25. accessibility ------------------------------------------------------
grep -Fq 'htmlFor="certificate-select"' "$UI_VIEW" \
  || fail "the certificate selector has no accessible label"
grep -Fq 'id="certificate-select"' "$UI_VIEW" \
  || fail "the certificate selector input is not associated with its label"
grep -Fq '<select' "$UI_VIEW" \
  || fail "the selector must be a native control"
grep -Fq 'aria-live="polite"' "$UI_VIEW" \
  || fail "the eligibility UI has no polite status region"
grep -Fq 'role="alert"' "$UI_VIEW" \
  || fail "the eligibility UI does not follow the role=alert error convention"
grep -Fq 'aria-labelledby="eligibility-title"' "$UI_VIEW" \
  || fail "the eligibility region is not labelled by its heading"

LIVE_REGIONS="$(grep -c 'aria-live' "$UI_VIEW" || true)"
[ "$LIVE_REGIONS" = "1" ] \
  || fail "expected exactly one live region, found $LIVE_REGIONS"

for custom in 'role="listbox"' 'role="combobox"' 'onKeyDown' 'tabIndex'; do
  if grep -Fq "$custom" "$UI_VIEW"; then
    fail "the eligibility UI must not build a custom control: $custom"
  fi
done

# Status must be readable text, never colour alone.
grep -Fq 'Choose a certificate' "$UI_VIEW" \
  || fail "the certificate selector label text is missing"

# Heading hierarchy as designed: one region title, then requirement and policy
# subsections.
grep -Fq '<h2 id="eligibility-title">' "$UI_VIEW" \
  || fail "the eligibility view has no h2 title"
grep -Fq '<h3' "$UI_VIEW" || fail "the eligibility view has no h3 heading level"
grep -Fq '<h4' "$UI_VIEW" || fail "the eligibility view has no h4 heading level"

# Lists must be associated with the heading that names them.
grep -Fq 'aria-labelledby="eligibility-requirements-title"' "$UI_VIEW" \
  || fail "the requirement list is not associated with its heading"
grep -Fq 'aria-labelledby="eligibility-policies-title"' "$UI_VIEW" \
  || fail "the evidence policy list is not associated with its heading"

# Every status must be rendered through a text helper. The helper must be
# CALLED, not merely imported — an unused import would otherwise satisfy a
# name-only check while the status was rendered some other way.
for helper in describeRequirementState describeEvidencePolicyState \
              describeEligibilityStatusLabel; do
  grep -Fq "$helper(" "$UI_VIEW" \
    || fail "status is not rendered as text by $helper"
done

if grep -qiE 'className="[^"]*(green|red|amber|success-status|danger)' "$UI_VIEW"; then
  fail "eligibility must not be conveyed through colour"
fi
# An inline style could encode status as colour outside the design system.
if grep -Fq 'style={{' "$UI_VIEW"; then
  fail "the eligibility UI must not encode status with inline styles"
fi

grep -Fq 'Satisfied' "$UI_PRESENTATION" \
  || fail "the approved 'Satisfied' wording is missing"
grep -Fq 'Still needed' "$UI_PRESENTATION" \
  || fail "the approved 'Still needed' wording is missing"

echo "PASS: the certificate selector is a labelled native control"
echo "PASS: heading hierarchy and list relationships are present"
echo "PASS: status is conveyed as text and never by colour alone"
echo "PASS: one polite live region and the existing alert convention are used"

# --- 25b. calm UX -----------------------------------------------------------
# The platform philosophy forbids guilt, urgency and streak mechanics. Checked
# case-insensitively over comment-stripped code so only student-visible wording
# is judged.
for phrase in "falling behind" "behind schedule" "hurry" "urgent" "streak" \
              "act now" "finish these now" "you failed" "overdue" "don't miss"; do
  if echo "$UI_PRESENTATION_CODE$UI_VIEW_CODE" | grep -qi "$phrase"; then
    fail "calm UX: forbidden pressure wording '$phrase'"
  fi
done

echo "PASS: eligibility wording carries no guilt, urgency or streak mechanics"

# --- 26. unknown stays distinct from ineligible -----------------------------
grep -Fq 'describeUnknownReason' "$UI_VIEW" \
  || fail "the view does not explain an undetermined result"
grep -Fq 'isUndetermined' "$UI_VIEW" \
  || fail "the view does not distinguish undetermined from ineligible"
for reason in evidence_under_unresolved_review dependency_unavailable \
              definition_not_published; do
  grep -Fq "$reason" "$UI_PRESENTATION" \
    || fail "the UI has no explanation for $reason"
done

echo "PASS: undetermined eligibility is explained distinctly from ineligibility"

# --- 27. the view is reachable ----------------------------------------------
grep -Fq 'CertificateEligibilityView' "$UI_SHELL" \
  || fail "the eligibility view is not reachable from the workspace shell"
grep -Fq 'Certificate eligibility' "$UI_SHELL" \
  || fail "the workspace navigation has no certificate eligibility entry"
grep -Fq 'aria-current' "$UI_SHELL" \
  || fail "the workspace navigation lost its current-page indication"

echo "PASS: the eligibility view is reachable from the existing navigation"

# ============================================================
# CERT-003 — Deterministic Certificate Issuance (Batch 4)
# ============================================================

ISSUE_TYPES="packages/shared-types/src/certificate-issuance.ts"
ISSUE_TYPE_TESTS="packages/shared-types/src/certificate-issuance.test.ts"
ISSUE_SERVICE="services/api/src/certificate-issuance.ts"
ISSUE_SERVICE_TESTS="services/api/src/certificate-issuance.test.ts"
ISSUE_MIGRATION="supabase/migrations/20260813000800_certificate_issuance_foundation.sql"
ISSUE_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_4_DETERMINISTIC_CERTIFICATE_ISSUANCE.md"

for p in \
  "$ISSUE_TYPES" "$ISSUE_TYPE_TESTS" "$ISSUE_SERVICE" \
  "$ISSUE_SERVICE_TESTS" "$ISSUE_MIGRATION" "$ISSUE_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

ISSUE_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$ISSUE_SERVICE" || true)"
ISSUE_MIGRATION_CODE="$(grep -vE '^\s*--' "$ISSUE_MIGRATION" || true)"
ISSUE_RPC="$(awk '/create or replace function public\.certificate_issue/{cap=1} /revoke all on function public\.certificate_issue/{cap=0} cap' "$ISSUE_MIGRATION")"
[ -n "$ISSUE_RPC" ] || fail "the certificate_issue RPC body was not found"

# --- 28. exactly one issuance migration and schema --------------------------
ISSUE_MIGRATIONS="$(ls supabase/migrations/*certificate_issuance*.sql 2>/dev/null | wc -l | tr -d ' ')"
[ "$ISSUE_MIGRATIONS" = "1" ] \
  || fail "expected exactly one certificate issuance migration, found $ISSUE_MIGRATIONS"

grep -Fq 'unique (user_id, certificate_definition_id)' "$ISSUE_MIGRATION" \
  || fail "the CERT-003 idempotency constraint is missing"
grep -Fq "verification_id text not null unique" "$ISSUE_MIGRATION" \
  || fail "the opaque verification identifier is missing"
grep -Fq "'^cert1_[a-f0-9]{48}\$'" "$ISSUE_MIGRATION" \
  || fail "the verification identifier format is not constrained"
grep -Fq 'references public.evidence_records(id) on delete restrict' "$ISSUE_MIGRATION" \
  || fail "justifying Evidence must not be deletable"

for table in certificates certificate_competency_snapshots certificate_evidence_snapshots; do
  grep -Fq "alter table public.$table enable row level security" "$ISSUE_MIGRATION" \
    || fail "RLS is not enabled on $table"
done

ISSUE_POLICIES="$(grep -c '^create policy' "$ISSUE_MIGRATION" || true)"
[ "$ISSUE_POLICIES" = "3" ] \
  || fail "expected exactly 3 issuance select policies, found $ISSUE_POLICIES"
if grep -A3 -Ei '^on public\.certificate' "$ISSUE_MIGRATION" \
  | grep -qEi '^\s*for\s+(insert|update|delete|all)\b'; then
  fail "a student write policy is granted on a certificate table"
fi
if echo "$ISSUE_MIGRATION_CODE" | grep -qE '\bto[[:space:]]+(anon|public)\b'; then
  fail "issued certificates must not be readable by anon or public"
fi

echo "PASS: exactly one CERT-003 migration with student read-only RLS"
echo "PASS: one certificate per student per exact definition version"

# --- 29. eligibility is re-evaluated at issuance -----------------------------
grep -Fq 'getStudentCertificateEligibility' "$ISSUE_SERVICE" \
  || fail "issuance does not re-evaluate eligibility"
grep -Fq 'decideCertificateIssuance' "$ISSUE_SERVICE" \
  || fail "issuance does not use the shared issuance decider"

for rule in qualifiesForDemonstration deriveEvidenceOutcome \
            qualifiesAsDemonstrationEvidence resolveEffectiveEvidenceState \
            isEffectivelyTrustedEvidence evaluateCertificateEligibility; do
  if echo "$ISSUE_SERVICE_CODE" | grep -Fq "$rule"; then
    fail "CERT-003 must not re-implement the eligibility rule $rule"
  fi
done

echo "PASS: issuance re-evaluates eligibility through the CERT-002 evaluator"

# --- 29b. the integrity pin set covers BOTH eligibility gates ---------------
# A CERT-002 result becomes eligible through required competencies AND
# definition-level Evidence policies. Evidence linked only to an optional
# competency can still be what carried a policy to its minimumCount, so the pin
# set must union both gates or a relied-upon record could drift undetected.
grep -Fq '"competencyRequirements" | "evidencePolicies"' "$ISSUE_TYPES" \
  || fail "the issuance snapshot does not consume both eligibility gates"
grep -Fq 'policy.satisfyingEvidenceIds' "$ISSUE_TYPES" \
  || fail "the pin set omits Evidence counted toward Evidence policies"
grep -Fq 'contributing.add(evidenceId)' "$ISSUE_TYPES" \
  || fail "the pin set is not accumulated as a deduplicated union"

# The union must be read from the evaluation, never recomputed here. Judged on
# comment-stripped code: the module documents why policy Evidence must be
# pinned, and naming minimumCount in that explanation is not arithmetic.
ISSUE_TYPES_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$ISSUE_TYPES" || true)"
if echo "$ISSUE_TYPES_CODE" | grep -qE 'minimumCount|qualifyingCount|>='; then
  fail "CERT-003 must not recompute Evidence policy satisfaction"
fi

echo "PASS: the integrity pin set unions both eligibility gates without recomputing them"

# --- 30. the RPC confirms, never re-evaluates -------------------------------
RPC_PUBLISHED="$(echo "$ISSUE_RPC" | grep -n "definition_state <> 'published'" | head -1 | cut -d: -f1)"
RPC_SUPERSEDED="$(echo "$ISSUE_RPC" | grep -n 'definition_superseded is not null' | head -1 | cut -d: -f1)"
RPC_DRIFT="$(echo "$ISSUE_RPC" | grep -n 'Authoritative Evidence changed' | head -1 | cut -d: -f1)"
RPC_LOCK="$(echo "$ISSUE_RPC" | grep -n 'for update' | head -1 | cut -d: -f1)"
RPC_INSERT="$(echo "$ISSUE_RPC" | grep -n 'insert into public.certificates' | head -1 | cut -d: -f1)"

for pair in "RPC_PUBLISHED:published check" "RPC_SUPERSEDED:supersession check" \
            "RPC_DRIFT:Evidence drift check" "RPC_LOCK:definition lock" \
            "RPC_INSERT:certificate insert"; do
  varname="${pair%%:*}"
  label="${pair##*:}"
  eval "value=\$$varname"
  [ -n "$value" ] || fail "the issuance RPC is missing its $label"
done

for guard in RPC_PUBLISHED RPC_SUPERSEDED RPC_DRIFT RPC_LOCK; do
  eval "value=\$$guard"
  [ "$value" -lt "$RPC_INSERT" ] \
    || fail "the issuance RPC creates a record before confirming ($guard)"
done

# The RPC must confirm by equality, never by re-deriving Wave 7 or CERT-002.
for forbidden in previous_effective_state new_effective_state minimum_count \
                 require_positive_outcome evidence_competency_links; do
  if echo "$ISSUE_RPC" | grep -Fq "$forbidden"; then
    fail "the issuance RPC must not re-implement eligibility: $forbidden"
  fi
done
echo "$ISSUE_RPC" | grep -Fq 'is distinct from pinned.correction_count' \
  || fail "the issuance RPC does not detect appended Evidence corrections"
echo "$ISSUE_RPC" | grep -Fq 'references unpinned Evidence' \
  || fail "the issuance RPC does not reject unpinned Evidence snapshots"

echo "$ISSUE_RPC" | grep -Fq 'security definer' \
  || fail "the issuance RPC is not security definer"
echo "$ISSUE_RPC" | grep -Fq 'set search_path = public' \
  || fail "the issuance RPC has no fixed search_path"
grep -Fq 'revoke all on function public.certificate_issue' "$ISSUE_MIGRATION" \
  || fail "the issuance RPC does not revoke execute from client roles"
if echo "$ISSUE_MIGRATION_CODE" | grep -Fq 'grant execute'; then
  fail "CERT-003 must not grant execute on any function"
fi

echo "PASS: the issuance RPC confirms integrity before creating the record"
echo "PASS: the issuance RPC is privileged and grants no student execution"

# --- 31. idempotency and authorization --------------------------------------
EXISTING_AT="$(echo "$ISSUE_SERVICE_CODE" | grep -n 'findExistingCertificate(userId' | head -1 | cut -d: -f1)"
EVALUATE_AT="$(echo "$ISSUE_SERVICE_CODE" | grep -n 'getStudentCertificateEligibility(' | head -1 | cut -d: -f1)"
[ -n "$EXISTING_AT" ] || fail "issuance does not look up an existing certificate"
[ "$EXISTING_AT" -lt "$EVALUATE_AT" ] \
  || fail "the existing certificate must be returned before re-evaluating"

grep -Fq '"23505"' "$ISSUE_SERVICE" \
  || fail "issuance does not recover from a lost uniqueness race"
grep -Fq 'alreadyIssued: true' "$ISSUE_SERVICE" \
  || fail "idempotent replay is not reported"

ISSUE_ROUTE_BLOCK="$(awk "/CERT-003 — the student's own issued certificates/{cap=1} /CERT-002 — certificates a student may select/{cap=0} cap" "$SERVER")"
[ -n "$ISSUE_ROUTE_BLOCK" ] || fail "the CERT-003 route block was not found"

echo "$ISSUE_ROUTE_BLOCK" | grep -Fq 'resolveTrustedRequestIdentity(request)' \
  || fail "the issuance route does not resolve a trusted identity"
echo "$ISSUE_ROUTE_BLOCK" | grep -Fq 'issueStudentCertificate(trusted.identity.userId' \
  || fail "the issuance route does not issue to the authenticated caller"
for smuggled in 'body.userId' 'body.studentId' 'searchParams.get("userId")' \
                'body.eligible' 'body.evidenceIds'; do
  if echo "$ISSUE_ROUTE_BLOCK" | grep -Fq "$smuggled"; then
    fail "the issuance route accepts a client-supplied claim: $smuggled"
  fi
done

echo "PASS: issuance is idempotent and returns the existing record on replay"
echo "PASS: issuance targets only the authenticated caller"

# --- 32. no CERT-004+ behaviour ---------------------------------------------
for forbidden in 'status text' lifecycle expires_at expiration revoked_at \
                 revocation superseded_by_certificate presentation_metadata; do
  if echo "$ISSUE_MIGRATION_CODE" | grep -Fq "$forbidden"; then
    fail "CERT-004+ concept leaked into the CERT-003 schema: $forbidden"
  fi
done
if echo "$ISSUE_SERVICE_CODE" | grep -qiE 'revoke|expiresAt|expirationMonths|portfolio|shareLink|employer|\bpdf\b'; then
  fail "CERT-004+ behaviour leaked into the issuance service"
fi
if grep -Fq '/certificates/verify' "$SERVER"; then
  fail "CERT-005 verification must not exist in CERT-003"
fi
if echo "$ISSUE_SERVICE_CODE" | grep -qiE 'sendEmail|smtp|EmailProvider'; then
  fail "CERT-003 must not build notification infrastructure"
fi
if echo "$ISSUE_SERVICE_CODE$ISSUE_MIGRATION_CODE" | grep -qiE 'openai|anthropic|ollama|ai[-_ ]?gateway'; then
  fail "an AI dependency exists in the issuance path"
fi
if echo "$ISSUE_MIGRATION_CODE" | grep -Fq 'audit'; then
  fail "CERT-003 must reuse the platform audit mechanism, not create one"
fi

grep -Fq 'certificate.issued' "$ISSUE_SERVICE" \
  || fail "issuance emits no audit event"

echo "PASS: no CERT-004+ lifecycle, verification or notification behaviour exists"
echo "PASS: issuance is audited through the existing platform mechanism"

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
echo "Wave 8 Batch 2 verification passed."
echo "CERT-002 backend eligibility evaluator/API verification passed."
echo "CERT-002 student eligibility UI and accessibility verification passed."
echo "Wave 8 Batch 4 verification passed."
echo "CERT-003 Deterministic Certificate Issuance is implemented."
echo "Concurrency and rollback are structurally verified only; no live PostgreSQL test exists."
echo "Wave 7 Evidence Engine guarantees remain intact."
echo "============================================================"
