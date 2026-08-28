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

# The complete, exact set of certificate migrations.
#
# CERT-008 narrowing: the certificate-migration guards were bare counts of 3,
# which CERT-008's approved correction migration trips. They are now pinned to
# this exact filename set, which is STRICTER than a count — a count is satisfied
# by any three files, this is satisfied by exactly these four. Every earlier
# batch still cannot add a migration.
CERTIFICATE_MIGRATIONS_EXPECTED="20260813000700_certificate_definition_foundation.sql
20260813000800_certificate_issuance_foundation.sql
20260813000900_certificate_lifecycle_foundation.sql
20260813001000_certificate_correction_foundation.sql"
certificate_migration_set() {
  ls supabase/migrations/*certificate*.sql 2>/dev/null | xargs -n1 basename | sort || true
}

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
  | grep -v 'certificate-issuance\.test\.ts$' \
  | grep -v 'certificate-lifecycle\.ts$' \
  | grep -v 'certificate-lifecycle\.test\.ts$' \
  | grep -v 'certificate-verification\.ts$' \
  | grep -v 'certificate-verification\.test\.ts$' \
  | grep -v 'certificate-portfolio\.ts$' \
  | grep -v 'certificate-portfolio\.test\.ts$' \
  | grep -v 'certificate-export\.ts$' \
  | grep -v 'certificate-export\.test\.ts$' \
  | grep -v 'certificate-correction\.ts$' \
  | grep -v 'certificate-correction\.test\.ts$' \
  | grep -v 'certificate-presentation\.ts$' \
  | grep -v 'certificate-presentation\.test\.ts$' || true)"
[ -z "$DUPLICATE_MODELS" ] \
  || fail "a duplicate shared Certificate model exists: $DUPLICATE_MODELS"

# Only certificate-definition.ts may declare the Certificate Definition model.
for module in certificate-eligibility certificate-issuance certificate-lifecycle certificate-verification certificate-portfolio certificate-export certificate-correction certificate-presentation; do
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

# CERT-005 now owns exactly one public verification route. What CERT-001 must
# still never do is mint identifiers or add verification behaviour of its own,
# which the check above already enforces. A bare /verify route remains
# forbidden, and the verification path must be the certificate one.
if grep -qE 'pathname === "/verify' "$SERVER"; then
  fail "a bare anonymous verification route exists"
fi
CERT_VERIFY_ROUTES="$(grep -cE '\^\\/certificates\\/verify' "$SERVER" || true)"
[ "$CERT_VERIFY_ROUTES" -le 1 ] \
  || fail "more than one certificate verification route exists"

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

  FREEZE_LINE="$(echo "$BODY" | grep -n "materially immutable" | head -1 | cut -d: -f1 || true)"
  DELETE_LINE="$(echo "$BODY" | grep -n "delete from public\." | head -1 | cut -d: -f1 || true)"
  LENGTH_LINE="$(echo "$BODY" | grep -n "must be the same length" | head -1 | cut -d: -f1 || true)"
  LOCK_LINE="$(echo "$BODY" | grep -n "for update" | head -1 | cut -d: -f1 || true)"

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
    '"/certificates"'|'"/certificates/eligibility"'|'"/certificates/definitions"'|'"/certificates/issuance"'|'"/certificates/portfolio"'|'"/certificates/export"'|'"/certificates/presentation"') ;;
    *) fail "an unapproved student certificate route exists: $route" ;;
  esac
done

# CERT-004 authorizes exactly one own-certificate read at /certificates. It must
# be GET only; a collection write would be a lifecycle control, which CERT-008
# owns.
if grep -nE 'request\.method === "(POST|PATCH|PUT|DELETE)" && pathname === "/certificates"' "$SERVER" | grep -q .; then
  fail "a student certificate collection write route exists"
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
# The eligibility UI in particular must not reach the public verification
# surface; CERT-005 has its own separate pre-auth view.
if echo "$UI_SERVICE_CODE$UI_VIEW_CODE" | grep -Fq 'certificates/verify/'; then
  fail "the eligibility UI must not call the public verification endpoint"
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
RPC_PUBLISHED="$(echo "$ISSUE_RPC" | grep -n "definition_state <> 'published'" | head -1 | cut -d: -f1 || true)"
RPC_SUPERSEDED="$(echo "$ISSUE_RPC" | grep -n 'definition_superseded is not null' | head -1 | cut -d: -f1 || true)"
RPC_DRIFT="$(echo "$ISSUE_RPC" | grep -n 'Authoritative Evidence changed' | head -1 | cut -d: -f1 || true)"
RPC_LOCK="$(echo "$ISSUE_RPC" | grep -n 'for update' | head -1 | cut -d: -f1 || true)"
RPC_INSERT="$(echo "$ISSUE_RPC" | grep -n 'insert into public.certificates' | head -1 | cut -d: -f1 || true)"

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
EXISTING_AT="$(echo "$ISSUE_SERVICE_CODE" | grep -n 'findExistingCertificate(userId' | head -1 | cut -d: -f1 || true)"
EVALUATE_AT="$(echo "$ISSUE_SERVICE_CODE" | grep -n 'getStudentCertificateEligibility(' | head -1 | cut -d: -f1 || true)"
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

# --- 32. no CERT-005+ behaviour in the CERT-003 path ------------------------
# Narrowed for CERT-004: lifecycle status, transition history and the pinned
# expiry are now CERT-004's approved scope, and CERT-004 owns its own migration.
# What must still never appear in the CERT-003 ISSUANCE migration is a cached
# status column or a CERT-008 workflow concept.
for forbidden in 'status text' lifecycle revoked_at \
                 revocation superseded_by_certificate presentation_metadata; do
  if echo "$ISSUE_MIGRATION_CODE" | grep -Fq "$forbidden"; then
    fail "CERT-005+ concept leaked into the CERT-003 schema: $forbidden"
  fi
done
if echo "$ISSUE_SERVICE_CODE" | grep -qiE 'revoke|expiresAt|expirationMonths|portfolio|shareLink|employer|\bpdf\b'; then
  fail "CERT-004+ behaviour leaked into the issuance service"
fi
# CERT-005 owns verification. What must remain true is that the ISSUANCE
# service implements none of it.
if echo "$ISSUE_SERVICE_CODE" | grep -Fq '/certificates/verify'; then
  fail "CERT-005 verification must not exist in the CERT-003 issuance service"
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

echo "PASS: no CERT-005+ lifecycle, verification or notification behaviour exists"
echo "PASS: issuance is audited through the existing platform mechanism"

# ============================================================
# CERT-004 — Certificate Record and Lifecycle (Batch 5)
# ============================================================

LIFE_TYPES="packages/shared-types/src/certificate-lifecycle.ts"
LIFE_TYPE_TESTS="packages/shared-types/src/certificate-lifecycle.test.ts"
LIFE_SERVICE="services/api/src/certificate-lifecycle.ts"
LIFE_SERVICE_TESTS="services/api/src/certificate-lifecycle.test.ts"
LIFE_MIGRATION="supabase/migrations/20260813000900_certificate_lifecycle_foundation.sql"
LIFE_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_5_CERTIFICATE_RECORD_AND_LIFECYCLE.md"

for p in \
  "$LIFE_TYPES" "$LIFE_TYPE_TESTS" "$LIFE_SERVICE" \
  "$LIFE_SERVICE_TESTS" "$LIFE_MIGRATION" "$LIFE_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

LIFE_TYPES_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$LIFE_TYPES" || true)"
LIFE_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$LIFE_SERVICE" || true)"
LIFE_MIGRATION_CODE="$(grep -vE '^\s*--' "$LIFE_MIGRATION" || true)"
LIFE_RPC="$(awk '/create or replace function public\.certificate_record_lifecycle_event/{cap=1} /revoke all on function public\.certificate_record_lifecycle_event/{cap=0} cap' "$LIFE_MIGRATION")"
[ -n "$LIFE_RPC" ] || fail "the certificate_record_lifecycle_event RPC was not found"

# --- 33. the approved state model, and only that ----------------------------
for status in active superseded expired revoked corrected; do
  grep -Fq "\"$status\"" "$LIFE_TYPES" || fail "lifecycle status $status is missing"
done
if echo "$LIFE_TYPES_CODE" | grep -qiE '"(pending|issued|valid|invalid|draft|archived)"'; then
  fail "CERT-004 must not invent lifecycle states"
fi

grep -Fq '["active", "superseded"]' "$LIFE_TYPES" || fail "edge active->superseded missing"
grep -Fq '["active", "revoked"]' "$LIFE_TYPES" || fail "edge active->revoked missing"
grep -Fq '["active", "corrected"]' "$LIFE_TYPES" || fail "edge active->corrected missing"
grep -Fq '["active", "expired"]' "$LIFE_TYPES" || fail "edge active->expired missing"
grep -Fq '["revoked", "active"]' "$LIFE_TYPES" || fail "edge revoked->active missing"

echo "PASS: exactly the approved lifecycle states and transitions are modelled"

# --- 34. append-only historical truth ---------------------------------------
grep -Fq 'create table if not exists public.certificate_lifecycle_events' "$LIFE_MIGRATION" \
  || fail "the lifecycle history table is missing"
grep -Fq 'guard_certificate_lifecycle_append_only' "$LIFE_MIGRATION" \
  || fail "lifecycle history is not append-only"
grep -Fq 'before update or delete on public.certificate_lifecycle_events' "$LIFE_MIGRATION" \
  || fail "lifecycle history permits update or delete"
grep -Fq 'unique (certificate_id, sequence_number)' "$LIFE_MIGRATION" \
  || fail "lifecycle history is not contiguous"
grep -Fq 'previous_status <> new_status' "$LIFE_MIGRATION" \
  || fail "a no-op lifecycle transition is permitted"

# CERT-003's issuance record must remain immutable.
grep -Fq 'guard_certificate_immutable' "$ISSUE_MIGRATION" \
  || fail "the CERT-003 certificate immutability guard is missing"
if echo "$LIFE_MIGRATION_CODE" | grep -qE 'drop trigger if exists certificates_immutable|update public\.certificates'; then
  fail "CERT-004 must not weaken CERT-003 certificate immutability"
fi

echo "PASS: lifecycle history is append-only and issuance truth stays immutable"

# --- 35. no cached status ---------------------------------------------------
if echo "$LIFE_MIGRATION_CODE" | grep -qE '\bcurrent_status\b|\blifecycle_status\b'; then
  fail "CERT-004 must not cache a mutable current status"
fi
grep -Fq 'resolveEffectiveCertificateStatus' "$LIFE_TYPES" \
  || fail "the effective status resolver is missing"
grep -Fq 'resolveEffectiveCertificateStatus' "$LIFE_SERVICE" \
  || fail "the service does not derive status at read time"
for guard in SEQUENCE_GAP PREVIOUS_STATUS_MISMATCH INVALID_TRANSITION; do
  grep -Fq "$guard" "$LIFE_TYPES" || fail "the resolver does not fail closed on $guard"
done

echo "PASS: status is derived at read time and fails closed on broken history"

# --- 36. pinned expiry ------------------------------------------------------
grep -Fq 'add column if not exists expires_at timestamptz' "$LIFE_MIGRATION" \
  || fail "the pinned expiry column is missing"
grep -Fq 'make_interval(months => definition_expiration_months)' "$LIFE_MIGRATION" \
  || fail "the expiry is not pinned from the issuance-time definition"
grep -Fq 'calculateCertificateExpiry' "$LIFE_TYPES" \
  || fail "the expiry calculation is missing"
if echo "$LIFE_SERVICE_CODE$LIFE_MIGRATION_CODE" | grep -qiE 'setInterval|setTimeout|cron|pg_cron|scheduler'; then
  fail "CERT-004 must not introduce a scheduler"
fi

echo "PASS: expiry is pinned at issuance and derived without a scheduler"

# --- 36b. the EFFECTIVE certificate_issue RPC -------------------------------
#
# CERT-004 redefines public.certificate_issue with CREATE OR REPLACE so the
# expiry can be pinned in the issuance transaction. The function PostgreSQL
# would actually execute is therefore CERT-004's, not CERT-003's.
#
# Section 30 above proves the ORIGINALLY APPROVED implementation in the
# CERT-003 migration. This section proves the EFFECTIVE REPLACEMENT preserves
# every one of those guarantees while adding pinned expiration. Both are
# required; neither replaces the other.
EFFECTIVE_ISSUE_RPC="$(awk '/create or replace function public\.certificate_issue/{cap=1} /revoke all on function public\.certificate_issue/{cap=0} cap' "$LIFE_MIGRATION")"
[ -n "$EFFECTIVE_ISSUE_RPC" ] \
  || fail "the effective certificate_issue RPC was not found in the CERT-004 migration"

# Signature: callers must not have to change.
for param in 'target_user_id uuid' 'target_definition_id uuid' \
             'new_verification_id text' 'pin_evidence_ids uuid[]' \
             'pin_states text[]' 'pin_integrity_states text[]' \
             'pin_result_states text[]' 'pin_correction_counts integer[]' \
             'snap_competency_stable_ids text[]' 'snap_competency_versions integer[]' \
             'snap_evidence_ids uuid[]' 'snap_evidence_competency_stable_ids text[]' \
             'snap_evidence_competency_versions integer[]'; do
  echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq "$param" \
    || fail "the effective issuance RPC changed its signature: missing $param"
done
echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq 'returns uuid' \
  || fail "the effective issuance RPC changed its return type"

# Presence alone would not catch an ADDED parameter, which would break callers
# just as surely as a removed one. Pin the exact arity.
EFF_SIGNATURE="$(echo "$EFFECTIVE_ISSUE_RPC" \
  | awk '/create or replace function public\.certificate_issue\(/{cap=1;next} /^\)$/{cap=0} cap')"
EFF_PARAM_COUNT="$(echo "$EFF_SIGNATURE" \
  | grep -cE '^[[:space:]]+[a-z_]+[[:space:]]+(uuid|text|integer|timestamptz)(\[\])?,?[[:space:]]*$' || true)"
[ "$EFF_PARAM_COUNT" = "13" ] \
  || fail "the effective issuance RPC takes $EFF_PARAM_COUNT parameters, expected 13"

# CERT-004's reason for replacing the function: the expiry is pinned in the
# same transaction that creates the record.
echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq 'make_interval(months => definition_expiration_months)' \
  || fail "the effective issuance RPC does not pin the expiry from the issuance-time definition"
echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq 'expires_at' \
  || fail "the effective issuance RPC does not write the pinned expiry"

# Security boundary.
echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq 'security definer' \
  || fail "the effective issuance RPC is not security definer"
echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq 'set search_path = public' \
  || fail "the effective issuance RPC has no fixed search_path"
grep -Fq 'revoke all on function public.certificate_issue' "$LIFE_MIGRATION" \
  || fail "the effective issuance RPC does not revoke execute from client roles"
if grep -Ei 'grant +execute +on +function +public\.certificate_issue' "$LIFE_MIGRATION" | grep -q .; then
  fail "the effective issuance RPC must not grant execute to any client role"
fi

# Required confirmations, and their ordering relative to the insert.
EFF_LOCK="$(echo "$EFFECTIVE_ISSUE_RPC" | grep -n 'for update' | head -1 | cut -d: -f1 || true)"
EFF_PUBLISHED="$(echo "$EFFECTIVE_ISSUE_RPC" | grep -n "definition_state <> 'published'" | head -1 | cut -d: -f1 || true)"
EFF_SUPERSEDED="$(echo "$EFFECTIVE_ISSUE_RPC" | grep -n 'definition_superseded is not null' | head -1 | cut -d: -f1 || true)"
EFF_EXISTING="$(echo "$EFFECTIVE_ISSUE_RPC" | grep -n 'return existing_certificate_id;' | head -1 | cut -d: -f1 || true)"
EFF_DRIFT="$(echo "$EFFECTIVE_ISSUE_RPC" | grep -n 'Authoritative Evidence changed' | head -1 | cut -d: -f1 || true)"
EFF_UNPINNED="$(echo "$EFFECTIVE_ISSUE_RPC" | grep -n 'references unpinned Evidence' | head -1 | cut -d: -f1 || true)"
EFF_INSERT="$(echo "$EFFECTIVE_ISSUE_RPC" | grep -n 'insert into public.certificates' | head -1 | cut -d: -f1 || true)"

for pair in "EFF_LOCK:definition lock" "EFF_PUBLISHED:published confirmation" \
            "EFF_SUPERSEDED:supersession confirmation" \
            "EFF_EXISTING:idempotent existing-certificate return" \
            "EFF_DRIFT:Evidence pin confirmation" \
            "EFF_UNPINNED:unpinned-snapshot rejection" \
            "EFF_INSERT:certificate insert"; do
  varname="${pair%%:*}"
  label="${pair##*:}"
  eval "value=\$$varname"
  [ -n "$value" ] || fail "the effective issuance RPC lost its $label"
done

for guard in EFF_LOCK EFF_PUBLISHED EFF_SUPERSEDED EFF_EXISTING EFF_DRIFT EFF_UNPINNED; do
  eval "value=\$$guard"
  [ "$value" -lt "$EFF_INSERT" ] \
    || fail "the effective issuance RPC creates a record before confirming ($guard)"
done

# All four transaction-time Evidence pins survive.
for pin in 'is distinct from pinned.state' \
           'is distinct from pinned.integrity_state' \
           'is distinct from pinned.result_state' \
           'is distinct from pinned.correction_count'; do
  echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq "$pin" \
    || fail "the effective issuance RPC dropped an Evidence pin: $pin"
done

# Exactly one certificate record, and both snapshot sets, in the same body.
EFF_INSERT_COUNT="$(echo "$EFFECTIVE_ISSUE_RPC" | grep -c 'insert into public.certificates (' || true)"
[ "$EFF_INSERT_COUNT" = "1" ] \
  || fail "the effective issuance RPC inserts $EFF_INSERT_COUNT certificate records"
echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq 'insert into public.certificate_competency_snapshots' \
  || fail "the effective issuance RPC does not create competency snapshots"
echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq 'insert into public.certificate_evidence_snapshots' \
  || fail "the effective issuance RPC does not create Evidence snapshots"

# Still a confirmer, never an evaluator.
for forbidden in previous_effective_state new_effective_state minimum_count \
                 require_positive_outcome evidence_competency_links; do
  if echo "$EFFECTIVE_ISSUE_RPC" | grep -Fq "$forbidden"; then
    fail "the effective issuance RPC re-implements eligibility: $forbidden"
  fi
done
if echo "$EFFECTIVE_ISSUE_RPC" | grep -qiE 'order by|limit 1|\blatest\b|\bnewest\b'; then
  fail "the effective issuance RPC infers a version by ordering"
fi

# The idempotency invariant is not dropped or altered by CERT-004.
grep -Fq 'unique (user_id, certificate_definition_id)' "$ISSUE_MIGRATION" \
  || fail "the CERT-003 idempotency constraint is missing"
if echo "$LIFE_MIGRATION_CODE" | grep -qiE 'drop constraint[^;]*certificates_student_definition_key|alter table public\.certificates[^;]*drop'; then
  fail "CERT-004 must not weaken the certificate idempotency constraint"
fi

echo "PASS: the effective certificate_issue RPC preserves every CERT-003 guarantee"
echo "PASS: the effective issuance RPC keeps its signature, security and idempotency"

# --- 37. student read boundary, no lifecycle control ------------------------
LIFE_ROUTE_BLOCK="$(awk "/CERT-004 — the student's own certificates/{cap=1} /pathname === \"\/certificates\/issuance\"/{cap=0} cap" "$SERVER")"
[ -n "$LIFE_ROUTE_BLOCK" ] || fail "the CERT-004 route block was not found"

echo "$LIFE_ROUTE_BLOCK" | grep -Fq 'resolveTrustedRequestIdentity(request)' \
  || fail "the certificate read route does not resolve a trusted identity"
echo "$LIFE_ROUTE_BLOCK" | grep -Fq 'trusted.identity.userId' \
  || fail "the certificate read route does not scope to the caller"
for smuggled in 'body.userId' 'body.studentId' 'searchParams.get("userId")'; do
  if echo "$LIFE_ROUTE_BLOCK" | grep -Fq "$smuggled"; then
    fail "the certificate read route accepts a client-supplied subject: $smuggled"
  fi
done

# The transition machinery exists for CERT-008 and must not be reachable.
if grep -Fq 'recordCertificateLifecycleTransition' "$SERVER"; then
  fail "CERT-004 must expose no lifecycle transition route"
fi
for surface in '/certificates/revoke' '/certificates/status' '/certificates/lifecycle'; do
  if grep -Fq "$surface" "$SERVER"; then
    fail "CERT-004 must expose no lifecycle control: $surface"
  fi
done

LIFE_POLICIES="$(grep -c '^create policy' "$LIFE_MIGRATION" || true)"
[ "$LIFE_POLICIES" = "1" ] \
  || fail "expected exactly 1 lifecycle select policy, found $LIFE_POLICIES"
if grep -A3 -Ei '^on public\.certificate_lifecycle_events' "$LIFE_MIGRATION" \
  | grep -qEi '^\s*for\s+(insert|update|delete|all)\b'; then
  fail "a student write policy is granted on lifecycle history"
fi

echo "$LIFE_RPC" | grep -Fq 'security definer' || fail "the lifecycle RPC is not security definer"
echo "$LIFE_RPC" | grep -Fq 'for update' || fail "the lifecycle RPC does not serialize transitions"
grep -Fq 'revoke all on function public.certificate_record_lifecycle_event' "$LIFE_MIGRATION" \
  || fail "the lifecycle RPC does not revoke execute from client roles"
if echo "$LIFE_MIGRATION_CODE" | grep -Fq 'grant execute'; then
  fail "CERT-004 must not grant execute on any function"
fi

echo "PASS: the certificate read is own-user only with no lifecycle control"
echo "PASS: the lifecycle RPC is privileged and grants no student execution"

# --- 38. no CERT-005+ behaviour ---------------------------------------------
for forbidden in reason actor_id replacement_certificate notification notify; do
  if echo "$LIFE_MIGRATION_CODE" | grep -Fq "$forbidden"; then
    fail "CERT-008 workflow concept leaked into CERT-004: $forbidden"
  fi
done
for forbidden in revokeCertificate correctCertificate supersedeCertificate \
                 restoreCertificate; do
  if echo "$LIFE_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "CERT-008 workflow leaked into CERT-004: $forbidden"
  fi
done
if echo "$LIFE_SERVICE_CODE" | grep -qiE 'verificationId|verification_id|portfolio|sharelink|employer|\bpdf\b|branding'; then
  fail "CERT-005+ behaviour leaked into CERT-004"
fi
if echo "$LIFE_SERVICE_CODE$LIFE_MIGRATION_CODE" | grep -qiE 'openai|anthropic|ollama|ai[-_ ]?gateway'; then
  fail "an AI dependency exists in the lifecycle path"
fi
grep -Fq 'certificate.lifecycle.transitioned' "$LIFE_SERVICE" \
  || fail "lifecycle transitions are not audited"
if echo "$LIFE_MIGRATION_CODE" | grep -Fq 'audit'; then
  fail "CERT-004 must reuse the platform audit mechanism, not create one"
fi

echo "PASS: CERT-006 through CERT-009 remain unimplemented"
echo "PASS: lifecycle transitions are audited through the existing mechanism"

# ============================================================
# CERT-005 — Certificate Verification (Batch 6)
# ============================================================

VERIFY_TYPES="packages/shared-types/src/certificate-verification.ts"
VERIFY_TYPE_TESTS="packages/shared-types/src/certificate-verification.test.ts"
VERIFY_SERVICE="services/api/src/certificate-verification.ts"
VERIFY_SERVICE_TESTS="services/api/src/certificate-verification.test.ts"
VERIFY_VIEW="apps/web/src/certificates/CertificateVerificationView.tsx"
VERIFY_WEB_SERVICE="apps/web/src/certificates/certificate-verification-service.ts"
VERIFY_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_6_CERTIFICATE_VERIFICATION.md"

for p in \
  "$VERIFY_TYPES" "$VERIFY_TYPE_TESTS" "$VERIFY_SERVICE" \
  "$VERIFY_SERVICE_TESTS" "$VERIFY_VIEW" "$VERIFY_WEB_SERVICE" "$VERIFY_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

VERIFY_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$VERIFY_SERVICE" || true)"
VERIFY_TYPES_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$VERIFY_TYPES" || true)"

# --- 39. no migration, no public policy -------------------------------------
# Scoped to certificate migrations: Wave 7's evidence_verification_references
# migration legitimately carries "verification" in its name.
if ls supabase/migrations/*certificate*verification*.sql >/dev/null 2>&1; then
  fail "CERT-005 must add no certificate verification migration"
fi
[ "$(certificate_migration_set)" = "$CERTIFICATE_MIGRATIONS_EXPECTED" ] \
  || fail "unexpected certificate migration set:
$(certificate_migration_set)"
for migration in supabase/migrations/*certificate*.sql; do
  MIG_CODE="$(grep -vE '^\s*--' "$migration" || true)"
  if echo "$MIG_CODE" | grep -qE '\bto[[:space:]]+(anon|public)\b'; then
    fail "a public or anon RLS policy exists in $migration"
  fi
done

echo "PASS: CERT-005 adds no migration and no public RLS policy"

# --- 40. exact-equality lookup only -----------------------------------------
grep -Fq '.eq("verification_id", reference)' "$VERIFY_SERVICE" \
  || fail "verification does not look up by exact reference"
for forbidden in '.like(' '.ilike(' '.filter(' '.order(' '.range(' '.textSearch(' '.limit('; do
  if echo "$VERIFY_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "verification must use exact-equality lookup only; found $forbidden"
  fi
done
grep -Fq 'isCertificateVerificationReference(reference)' "$VERIFY_SERVICE" \
  || fail "verification does not validate the reference format"

VERIFY_VALIDATE_AT="$(grep -n 'isCertificateVerificationReference(reference)' "$VERIFY_SERVICE" | head -1 | cut -d: -f1 || true)"
VERIFY_QUERY_AT="$(grep -n 'createServerSupabaseClient()' "$VERIFY_SERVICE" | head -1 | cut -d: -f1 || true)"
[ -n "$VERIFY_VALIDATE_AT" ] || fail "verification format validation is missing"
[ -n "$VERIFY_QUERY_AT" ] || fail "verification performs no lookup"
[ "$VERIFY_VALIDATE_AT" -lt "$VERIFY_QUERY_AT" ] \
  || fail "a malformed reference reaches the database before validation"

echo "PASS: verification validates the reference before any exact-equality lookup"

# --- 41. no holder identity, no Evidence ------------------------------------
for forbidden in user_id userId user_profiles display_name displayName email auth.users; do
  if echo "$VERIFY_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "public verification must not reach holder identity: $forbidden"
  fi
done
for forbidden in evidence_records evidence_competency_links \
                 evidence_correction_events evidence_verification_references \
                 certificate_evidence_snapshots; do
  if echo "$VERIFY_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "public verification must not reach Evidence: $forbidden"
  fi
done

grep -Fq 'CERTIFICATE_VERIFICATION_FORBIDDEN_FIELDS' "$VERIFY_TYPES" \
  || fail "the forbidden public field list is missing"
grep -Fq 'buildCertificateVerificationRecord' "$VERIFY_TYPES" \
  || fail "the curated payload builder is missing"

echo "PASS: public verification exposes no holder identity and no Evidence"

# --- 42. lifecycle truth is reused, never collapsed -------------------------
grep -Fq 'resolveEffectiveCertificateStatus' "$VERIFY_SERVICE" \
  || fail "verification does not reuse the CERT-004 lifecycle resolver"
if echo "$VERIFY_SERVICE_CODE$VERIFY_TYPES_CODE" | grep -qE '\bvalid:\s*(true|false)|isValid'; then
  fail "verification must not collapse lifecycle into a boolean"
fi
grep -Fq 'if (!effective.sequenceValid)' "$VERIFY_SERVICE" \
  || fail "an incoherent lifecycle history is not failed closed"
grep -Fq 'unavailable' "$VERIFY_TYPES" \
  || fail "the unavailable outcome is missing"

echo "PASS: lifecycle state is reported accurately and fails closed as unavailable"

# --- 43. read-only public surface -------------------------------------------
for write in '.insert(' '.update(' '.delete(' '.upsert(' '.rpc('; do
  if echo "$VERIFY_SERVICE_CODE" | grep -Fq "$write"; then
    fail "public verification must be read-only; found $write"
  fi
done
if echo "$VERIFY_SERVICE_CODE" | grep -qE 'writeAuditEvent|console\.log'; then
  fail "the verification reference must not be logged"
fi

VERIFY_ROUTE_BLOCK="$(awk '/CERT-005 — public certificate verification/{cap=1} /pathname === "\/ready"/{cap=0} cap' "$SERVER")"
[ -n "$VERIFY_ROUTE_BLOCK" ] || fail "the CERT-005 route block was not found"
echo "$VERIFY_ROUTE_BLOCK" | grep -Fq 'resolveTrustedRequestIdentity' \
  && fail "the public verification route must not require authentication"
echo "$VERIFY_ROUTE_BLOCK" | grep -Fq 'searchParams' \
  && fail "the public verification route must accept no query parameters"
echo "$VERIFY_ROUTE_BLOCK" | grep -Fq 'request.method === "GET"' \
  || fail "the public verification route is not GET only"

for surface in '/certificates/public' '/certificates/search' '/certificates/all'; do
  if grep -Fq "$surface" "$SERVER"; then
    fail "no public certificate listing or search may exist: $surface"
  fi
done

echo "PASS: public verification is read-only, unauthenticated and unenumerable"

# --- 44. no CERT-006+ behaviour ---------------------------------------------
if echo "$VERIFY_SERVICE_CODE" | grep -qiE 'portfolio|sharelink|share_link|download|\bpdf\b|\bqr\b|branding|employer'; then
  fail "CERT-006+ behaviour leaked into CERT-005"
fi
if echo "$VERIFY_SERVICE_CODE" | grep -qiE 'revoke|restore|replacementCertificate'; then
  fail "CERT-008 workflow leaked into CERT-005"
fi
if echo "$VERIFY_SERVICE_CODE" | grep -qE 'certificateKind|certificate_kind|course_completion'; then
  fail "CERT-005 must remain credential-kind agnostic (DEC-029 to DEC-035)"
fi
if echo "$VERIFY_SERVICE_CODE" | grep -qiE 'openai|anthropic|ollama|ai[-_ ]?gateway'; then
  fail "an AI dependency exists in the verification path"
fi

# Accessibility: status as text, never colour alone.
grep -Fq 'describeVerifiedStatus' "$VERIFY_VIEW" \
  || fail "the verification page does not render status as text"
grep -Fq 'aria-live="polite"' "$VERIFY_VIEW" \
  || fail "the verification page has no polite status region"
grep -Fq '<h1 id="verification-title">' "$VERIFY_VIEW" \
  || fail "the verification page has no semantic heading"
if grep -qiE 'className="[^"]*(green|red|amber|success-status|danger)' "$VERIFY_VIEW"; then
  fail "verification status must not be conveyed by colour"
fi
if grep -Fq 'style={{' "$VERIFY_VIEW"; then
  fail "the verification page must not encode status with inline styles"
fi

echo "PASS: CERT-006 through CERT-009 remain unimplemented in verification"
echo "PASS: the verification page is accessible and status is text"

# ============================================================
# CERT-006 — Student Certificate Portfolio (Batch 7)
# ============================================================

PORT_TYPES="packages/shared-types/src/certificate-portfolio.ts"
PORT_TYPE_TESTS="packages/shared-types/src/certificate-portfolio.test.ts"
PORT_SERVICE="services/api/src/certificate-portfolio.ts"
PORT_SERVICE_TESTS="services/api/src/certificate-portfolio.test.ts"
PORT_VIEW="apps/web/src/certificates/CertificatePortfolioView.tsx"
PORT_WEB_SERVICE="apps/web/src/certificates/certificate-portfolio-service.ts"
PORT_PRESENTATION="apps/web/src/certificates/certificate-portfolio-presentation.ts"
PORT_PRESENTATION_TESTS="apps/web/src/certificates/certificate-portfolio-presentation.test.ts"
PORT_SHELL="apps/web/src/auth/AuthenticatedApp.tsx"
PORT_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_7_STUDENT_CERTIFICATE_PORTFOLIO.md"

for p in \
  "$PORT_TYPES" "$PORT_TYPE_TESTS" "$PORT_SERVICE" "$PORT_SERVICE_TESTS" \
  "$PORT_VIEW" "$PORT_WEB_SERVICE" "$PORT_PRESENTATION" \
  "$PORT_PRESENTATION_TESTS" "$PORT_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

PORT_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$PORT_SERVICE" || true)"

# --- 45. no migration, read-only presentation -------------------------------
# CERT-008 narrowing: the guard was a bare count of 3, which CERT-008's approved
# correction migration would trip. It is now an EXACT filename set, so it is
# stricter than before — a count could be satisfied by any three files, this
# cannot. CERT-006 and CERT-007 still cannot add a migration, and no unexpected
# certificate migration can appear.
[ "$(certificate_migration_set)" = "$CERTIFICATE_MIGRATIONS_EXPECTED" ] \
  || fail "CERT-006 must add no migration; unexpected set:
$(certificate_migration_set)"

for write in '.insert(' '.update(' '.delete(' '.upsert(' '.rpc('; do
  if echo "$PORT_SERVICE_CODE" | grep -Fq "$write"; then
    fail "the portfolio must be read-only; found $write"
  fi
done

echo "PASS: CERT-006 adds no migration and performs no write"

# --- 46. owner-only access, no admin surface --------------------------------
PORT_ROUTE_BLOCK="$(awk "/CERT-006 — the learner's private certificate portfolio/{cap=1} /pathname === \"\/certificates\/portfolio\"/{print; cap=0; next} cap" "$SERVER")"
[ -n "$PORT_ROUTE_BLOCK" ] || fail "the CERT-006 route block was not found"

grep -Fq 'pathname === "/certificates/portfolio"' "$SERVER" \
  || fail "the portfolio route is missing"
grep -Fq 'getStudentCertificatePortfolio(' "$SERVER" \
  || fail "the portfolio route does not call the portfolio service"
grep -Fq 'trusted.identity.userId' "$SERVER" \
  || fail "the portfolio route does not scope to the authenticated caller"

# No client-supplied identity may select whose portfolio is read.
for smuggled in 'searchParams.get("userId")' 'searchParams.get("studentId")'; do
  if grep -Fq "$smuggled" "$SERVER"; then
    fail "a route accepts a client-supplied subject: $smuggled"
  fi
done
if echo "$PORT_SERVICE_CODE" | grep -qE 'body\.userId|body\.studentId'; then
  fail "the portfolio must not accept a client-supplied subject"
fi

grep -Fq '.eq("user_id", userId)' "$PORT_SERVICE" \
  || fail "the portfolio service does not scope its read to the caller"

if grep -Fq '/admin/certificates/portfolio' "$SERVER"; then
  fail "CERT-006 must not expose administrator portfolio access"
fi

PORTFOLIO_ROUTE_COUNT="$(grep -c 'pathname === "/certificates/portfolio"' "$SERVER" || true)"
[ "$PORTFOLIO_ROUTE_COUNT" = "1" ] \
  || fail "expected exactly one portfolio route, found $PORTFOLIO_ROUTE_COUNT"

echo "PASS: the portfolio is authenticated, owner-only and has no admin surface"

# --- 47. source-of-truth boundaries -----------------------------------------
grep -Fq 'resolveEffectiveCertificateStatus' "$PORT_SERVICE" \
  || fail "the portfolio does not reuse the CERT-004 lifecycle resolver"

for forbidden in isValidCertificateLifecycleTransition calculateCertificateExpiry \
                 evaluateCertificateEligibility getStudentCertificateEligibility \
                 issueStudentCertificate decideCertificateIssuance; do
  if echo "$PORT_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "CERT-006 must not duplicate another authority: $forbidden"
  fi
done

# CERT-004's record contract must remain unchanged.
LIFECYCLE_RECORD="$(awk '/export interface StudentCertificateRecord/{cap=1} cap{print} cap&&/^}/{exit}' packages/shared-types/src/certificate-lifecycle.ts)"
[ -n "$LIFECYCLE_RECORD" ] || fail "StudentCertificateRecord was not found"
if echo "$LIFECYCLE_RECORD" | grep -qE 'verificationId|verificationReference'; then
  fail "CERT-004 StudentCertificateRecord must not gain a verification reference"
fi

echo "PASS: CERT-006 composes presentation without duplicating any authority"
echo "PASS: the CERT-004 record contract is unchanged"

# --- 48. privacy -------------------------------------------------------------
for forbidden in user_profiles display_name email auth.users; do
  if echo "$PORT_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "the portfolio must not read private profile data: $forbidden"
  fi
done

for table in evidence_records evidence_competency_links \
             evidence_correction_events evidence_verification_references \
             certificate_evidence_snapshots; do
  if echo "$PORT_SERVICE_CODE" | grep -Fq "$table"; then
    fail "the portfolio must not read Evidence: $table"
  fi
done

for forbidden in evidenceId evidenceOutcome resultState digest score; do
  if echo "$PORT_SERVICE_CODE" | grep -Fq "$forbidden"; then
    fail "the portfolio must expose no private Evidence detail: $forbidden"
  fi
done

echo "PASS: the portfolio reads no profile data and no private Evidence detail"

# --- 49. no CERT-007+ behaviour ---------------------------------------------
if echo "$PORT_SERVICE_CODE" | grep -qiE 'sharelink|share_link|shareurl|download|\bpdf\b|\bqr\b|branding|employer'; then
  fail "CERT-007+ behaviour leaked into CERT-006"
fi
if echo "$PORT_SERVICE_CODE" | grep -qiE 'revoke|restore|replacementCertificate'; then
  fail "CERT-008 workflow leaked into CERT-006"
fi
if echo "$PORT_SERVICE_CODE" | grep -qE 'certificateKind|course_completion'; then
  fail "CERT-006 must remain credential-kind agnostic (DEC-029 to DEC-035)"
fi
if echo "$PORT_SERVICE_CODE" | grep -qiE 'openai|anthropic|ollama|ai[-_ ]?gateway'; then
  fail "an AI dependency exists in the portfolio path"
fi

# No export/share control, and no disabled placeholder standing in for one.
#
# Judged on comment-stripped code with a word-bounded search rather than on a
# single-line `>Export<` pattern: JSX routinely puts button text on its own
# line, which a tag-adjacent pattern would miss entirely.
# Whole JSX comment blocks are dropped (not just their opening line), and the
# TypeScript `export` keyword is neutralised, so only student-visible wording
# and real handlers are judged.
PORT_VIEW_CODE="$(awk '/\{\/\*/{skip=1} !skip; /\*\/\}/{skip=0}' "$PORT_VIEW" \
  | grep -vE '^\s*(//|\*|/\*)' \
  | sed -E 's/export (function|const|interface|type|default)/\1/g' || true)"
#
# CERT-007 narrowing: the approved export panel is MOUNTED here and implemented
# entirely in its own component. Only that exact token is exempted — every other
# export, share or download wording in this view is still a failure, and the
# view must still wire no export behaviour of its own.
#
# The exemption is by exact token rather than by relying on the word-boundary
# accident that `CertificateExportPanel` contains no standalone "export".
PORT_VIEW_EXPORT_SCAN="$(echo "$PORT_VIEW_CODE" | sed -E 's/CertificateExportPanel//g')"
if echo "$PORT_VIEW_EXPORT_SCAN" | grep -qiE '\b(export|share|download|pdf)\b'; then
  fail "CERT-006 must not render or wire an export, share or download control"
fi
grep -Fq '<CertificateExportPanel filters={filters} />' "$PORT_VIEW" \
  || fail "the approved CERT-007 export panel is not mounted in the portfolio"
if grep -qE 'createObjectURL|new Blob|\.download =' "$PORT_VIEW"; then
  fail "CERT-006 must not implement export behaviour; CERT-007 owns it"
fi
PORT_PRESENTATION_WORDS="$(grep -vE '^\s*(//|\*|/\*)' "$PORT_PRESENTATION" \
  | sed -E 's/export (function|const|interface|type|default)/\1/g' || true)"
if echo "$PORT_PRESENTATION_WORDS" | grep -qiE '\b(export|share|download|pdf|qr)\b'; then
  fail "CERT-006 presentation logic must not build an export or share affordance"
fi

echo "PASS: CERT-007 through CERT-009 remain unimplemented in the portfolio"

# --- 50. partial failure -----------------------------------------------------
grep -Fq 'unavailableEntries' "$PORT_TYPES" \
  || fail "the portfolio cannot represent an unresolved certificate"
grep -Fq 'unavailableEntries' "$PORT_SERVICE" \
  || fail "the portfolio service does not degrade a single certificate safely"
grep -Fq 'describeUnavailableEntry' "$PORT_VIEW" \
  || fail "the portfolio does not present unresolved certificates"
grep -Fq 'if (!effective.sequenceValid)' "$PORT_SERVICE" \
  || fail "an incoherent lifecycle history is not degraded safely"

echo "PASS: an unresolved certificate is represented, never dropped or fabricated"

# --- 51. accessibility and reachability -------------------------------------
grep -Fq 'describeCertificateStatus' "$PORT_VIEW" \
  || fail "portfolio status is not rendered as text"
grep -Fq 'aria-live="polite"' "$PORT_VIEW" \
  || fail "the portfolio has no polite status region"
grep -Fq '<h2 id="portfolio-certificates-title">' "$PORT_VIEW" \
  || fail "the portfolio has no semantic heading"
grep -Fq 'htmlFor="certificate-status-filter"' "$PORT_VIEW" \
  || fail "the portfolio status filter has no accessible label"
grep -Fq 'htmlFor="certificate-definition-filter"' "$PORT_VIEW" \
  || fail "the portfolio certificate filter has no accessible label"
grep -Fq '<select' "$PORT_VIEW" \
  || fail "the portfolio filters must be native controls"
for custom in 'role="listbox"' 'role="combobox"' 'onKeyDown' 'tabIndex'; do
  if grep -Fq "$custom" "$PORT_VIEW"; then
    fail "the portfolio must not build a custom control: $custom"
  fi
done
if grep -qiE 'className="[^"]*(green|red|amber|success-status|danger)' "$PORT_VIEW"; then
  fail "portfolio status must not be conveyed by colour"
fi
if grep -Fq 'style={{' "$PORT_VIEW"; then
  fail "the portfolio must not encode status with inline styles"
fi

# --- 51b. one certificate can be focused, and its detail is real ------------
#
# CERT-006 section 5 requires a certificate detail presentation. That does not
# require a route, but it does require that a learner can focus ONE owned
# certificate and read its meaningful detail.
grep -Fq '{describePortfolioDetailToggle(entry, isSelected)}' "$PORT_VIEW" \
  || fail "the portfolio has no per-certificate detail control"
grep -Fq 'onClick={() => onSelect(entry.certificateId)}' "$PORT_VIEW" \
  || fail "the portfolio detail control focuses no certificate"
grep -Fq '<button' "$PORT_VIEW" \
  || fail "the portfolio detail control must be a native button"
grep -Fq 'aria-expanded={isSelected}' "$PORT_VIEW" \
  || fail "the portfolio detail control does not expose its expanded state"
grep -Fq 'aria-controls={detailId}' "$PORT_VIEW" \
  || fail "the portfolio detail control does not own a detail region"
grep -Fq 'hidden={!isSelected}' "$PORT_VIEW" \
  || fail "the portfolio detail region is not toggled by selection"

# The detail a learner must actually be able to read.
for detail in '<dt>Issuer</dt>' '<dt>Issued</dt>' '<dt>Valid until</dt>' \
  '<dt>Certificate version</dt>' 'describeCertificateStatus' \
  'explainCertificateStatus' 'Competencies this represents'; do
  grep -Fq "$detail" "$PORT_VIEW" \
    || fail "the certificate detail presentation is missing: $detail"
done
grep -Fq '{competency.title} (version {competency.version})' "$PORT_VIEW" \
  || fail "the pinned competency title and version are not both presented"

# Focus is in-page state, never a second router.
grep -Fq 'selectPortfolioCertificate' "$PORT_VIEW" \
  || fail "certificate focus is not owned by the pure presentation module"
grep -Fq 'resolvePortfolioSelection' "$PORT_VIEW" \
  || fail "a filtered-away certificate can remain focused"
if grep -qE 'pushState|replaceState|window\.location|useNavigate|createBrowserRouter' \
  "$PORT_VIEW" "$PORT_PRESENTATION"; then
  fail "CERT-006 must not introduce routing to focus a certificate"
fi

# The verification action reaches CERT-005 and duplicates none of its logic.
grep -Fq 'buildCertificateVerificationHref(entry.verificationReference)' "$PORT_VIEW" \
  || fail "the portfolio does not offer this certificate's verification action"
grep -Fq 'readVerificationReferenceFromPath' "$PORT_PRESENTATION_TESTS" \
  || fail "the verification link is not proven against CERT-005's own path reader"
PORT_PRESENTATION_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$PORT_PRESENTATION" || true)"
if echo "$PORT_PRESENTATION_CODE" | grep -qiE 'fetch\(|verifyCertificate|holder|revoke'; then
  fail "CERT-005 verification logic is duplicated in the portfolio presentation"
fi

echo "PASS: one owned certificate can be focused and read in detail"
echo "PASS: the verification action reaches CERT-005 without duplicating it"

grep -Fq 'CertificatePortfolioView' "$PORT_SHELL" \
  || fail "the portfolio is not reachable from the workspace shell"
grep -Fq 'certificate-portfolio' "$PORT_SHELL" \
  || fail "the workspace navigation has no certificates destination"
grep -Fq 'aria-current' "$PORT_SHELL" \
  || fail "the workspace navigation lost its current-page indication"

echo "PASS: the portfolio is accessible with labelled native filters"
echo "PASS: the portfolio is reachable from the authenticated workspace"

# ============================================================
# CERT-007 — Certificate Export and Sharing (Batch 8)
# ============================================================

EXPORT_TYPES="packages/shared-types/src/certificate-export.ts"
EXPORT_TYPE_TESTS="packages/shared-types/src/certificate-export.test.ts"
EXPORT_SERVICE="services/api/src/certificate-export.ts"
EXPORT_SERVICE_TESTS="services/api/src/certificate-export.test.ts"
EXPORT_PANEL="apps/web/src/certificates/CertificateExportPanel.tsx"
EXPORT_WEB_SERVICE="apps/web/src/certificates/certificate-export-service.ts"
EXPORT_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_8_CERTIFICATE_EXPORT_AND_SHARING.md"

for p in \
  "$EXPORT_TYPES" "$EXPORT_TYPE_TESTS" "$EXPORT_SERVICE" \
  "$EXPORT_SERVICE_TESTS" "$EXPORT_PANEL" "$EXPORT_WEB_SERVICE" "$EXPORT_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

EXPORT_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$EXPORT_SERVICE" || true)"
EXPORT_TYPES_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$EXPORT_TYPES" || true)"

# --- 52. no migration, no new dependency ------------------------------------
# Same exact-set narrowing as the CERT-006 section: CERT-007 still adds no
# migration, and the set is pinned by name rather than counted.
[ "$(certificate_migration_set)" = "$CERTIFICATE_MIGRATIONS_EXPECTED" ] \
  || fail "CERT-007 must add no migration; unexpected set:
$(certificate_migration_set)"
if grep -rqE 'certificate_correction|applyCertificateCorrection' \
  "$EXPORT_TYPES" "$EXPORT_SERVICE" "$EXPORT_PANEL" "$EXPORT_WEB_SERVICE"; then
  fail "CERT-008 correction workflow leaked into CERT-007"
fi
if ls supabase/migrations/*share*.sql >/dev/null 2>&1; then
  fail "CERT-007 must not create a share-link schema"
fi
for manifest in apps/web/package.json services/api/package.json packages/shared-types/package.json; do
  if grep -qiE '"(pdfkit|jspdf|puppeteer|playwright|qrcode|handlebars|ejs|pug)"' "$manifest"; then
    fail "CERT-007 must not introduce a document or template dependency: $manifest"
  fi
done

echo "PASS: CERT-007 adds no migration, no share schema and no new dependency"

# --- 53. owner-only, no public or admin surface -----------------------------
grep -Fq 'trusted.identity.userId' "$SERVER" \
  || fail "the export route does not use the trusted identity"
if grep -qE '/admin/certificates/export|/certificates/export/public|/share/' "$SERVER"; then
  fail "CERT-007 must expose no admin, public or share route"
fi
if echo "$EXPORT_SERVICE_CODE" | grep -qE 'createUserScopedSupabaseClient|service_role'; then
  fail "CERT-007 must not widen the certificate access path"
fi
grep -Fq 'export async function exportStudentCertificates' "$EXPORT_SERVICE" \
  || fail "the export service entry point is missing"

echo "PASS: the export is owner-only with no public or admin surface"

# --- 54. source-of-truth boundaries -----------------------------------------
grep -Fq 'getStudentCertificatePortfolio' "$EXPORT_SERVICE" \
  || fail "CERT-007 must compose the CERT-006 portfolio rather than re-reading"
for forbidden in '.from(' '.select(' '.insert(' '.update(' '.delete(' '.rpc('; do
  if echo "$EXPORT_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "CERT-007 must own no query or write of its own: $forbidden"
  fi
done
if echo "$EXPORT_SERVICE_CODE" | grep -qF 'resolveEffectiveCertificateStatus'; then
  fail "CERT-007 must not resolve lifecycle status; CERT-004 owns it"
fi
grep -Fq 'export function isCurrentlyValidForExport' "$EXPORT_TYPES" \
  || fail "current validity has no single fail-closed rule"
grep -Fq 'return status === "active";' "$EXPORT_TYPES" \
  || fail "current validity must fail closed to active only"

echo "PASS: CERT-007 owns no certificate truth and writes nothing"

# --- 55. privacy: the approved field list only ------------------------------
grep -Fq 'CERTIFICATE_EXPORT_FORBIDDEN_FIELDS' "$EXPORT_TYPES" \
  || fail "the export prohibition list is not held as data"
grep -Fq 'CERTIFICATE_EXPORT_FORBIDDEN_FIELDS' "$EXPORT_TYPE_TESTS" \
  || fail "the export prohibition list is not asserted by tests"
for forbidden in 'holderName' 'displayName' 'user_profiles' 'certificateId:' 'userId:'; do
  if echo "$EXPORT_TYPES_CODE" | grep -qF "$forbidden"; then
    case "$forbidden" in
      'holderName'|'displayName')
        # Permitted only inside the forbidden-field list itself.
        if echo "$EXPORT_TYPES_CODE" | grep -F "$forbidden" | grep -qvE '^\s*"'; then
          fail "CERT-007 must not carry holder identity: $forbidden"
        fi
        ;;
      *) fail "CERT-007 must not carry an internal identifier: $forbidden" ;;
    esac
  fi
done
if echo "$EXPORT_SERVICE_CODE" | grep -qiE 'user_profiles|holderName|displayName'; then
  fail "CERT-007 must not read or carry the student's identity"
fi

echo "PASS: the export carries the approved fields and no identity"

# --- 56. no CERT-008 or CERT-009 behaviour ----------------------------------
if echo "$EXPORT_SERVICE_CODE" | grep -qiE 'revoke|restore|replacementCertificate'; then
  fail "CERT-008 workflow leaked into CERT-007"
fi
# Judged on code, not commentary, and not on the prohibition list itself: this
# batch's sources name the excluded CERT-009 fields precisely in order to
# forbid them, so a naive scan would flag the exclusion notes.
BRANDING_SCAN="$(cat "$EXPORT_TYPES" "$EXPORT_SERVICE" "$EXPORT_PANEL" \
  | grep -vE '^\s*(//|\*|/\*)' \
  | grep -vE '^\s*"[A-Za-z_]+",?$' || true)"
if echo "$BRANDING_SCAN" | grep -qiE 'logo|brandAsset|typography|fontFamily|<img|data:image'; then
  fail "CERT-009 branding leaked into CERT-007"
fi
if echo "$EXPORT_SERVICE_CODE" | grep -qiE 'openai|anthropic|ollama|ai[-_ ]?gateway'; then
  fail "an AI dependency exists in the export path"
fi

echo "PASS: CERT-008 and CERT-009 remain unimplemented in the export"

# --- 57. sharing is designed, never minted ----------------------------------
grep -Fq 'CERTIFICATE_SHARE_PAYLOAD_VERSION' "$EXPORT_TYPES" \
  || fail "the share payload model is missing"
grep -Fq 'export function toCertificateSharePayload' "$EXPORT_TYPES" \
  || fail "the share payload builder is missing"
# Designed only: nothing may resolve, serve or mint a share link.
if grep -rqE 'toCertificateSharePayload' "$EXPORT_SERVICE" "$SERVER" "$EXPORT_PANEL" "$EXPORT_WEB_SERVICE"; then
  fail "the share payload must be designed, not resolved by anything"
fi
for forbidden in 'shareToken' 'share_link' 'shareUrl' 'randomBytes'; do
  if echo "$EXPORT_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "CERT-007 must mint no share link: $forbidden"
  fi
  if grep -qF "$forbidden" "$EXPORT_PANEL" "$EXPORT_WEB_SERVICE"; then
    fail "CERT-007 must mint no share link in the frontend: $forbidden"
  fi
done

echo "PASS: the share model is designed and nothing mints a link"

# --- 58. portable format and accessibility ----------------------------------
grep -Fq 'export type CertificateExportFormat = "json" | "markdown";' "$EXPORT_TYPES" \
  || fail "the approved portable formats are not exactly json and markdown"
grep -Fq 'export function serializeCertificateExport' "$EXPORT_TYPES" \
  || fail "the export cannot be serialized to a portable format"
grep -Fq 'export function buildCertificateExportDownload' "$EXPORT_TYPES" \
  || fail "the download bundle is not built by the tested pure module"
# The artifact must be text, never image-only (CERT-007 section 9).
if grep -qiE 'canvas|toDataURL|image/png|image/jpeg' "$EXPORT_TYPES" "$EXPORT_PANEL"; then
  fail "the exported artifact must not be image-based"
fi

grep -Fq 'aria-live="polite"' "$EXPORT_PANEL" \
  || fail "the export panel has no polite status region"
grep -Fq 'role="alert"' "$EXPORT_PANEL" \
  || fail "the export panel reports failure without an alert"
grep -Fq '<h3 id="certificate-export-title">' "$EXPORT_PANEL" \
  || fail "the export panel has no semantic heading"
grep -Fq 'htmlFor="certificate-export-format"' "$EXPORT_PANEL" \
  || fail "the export format control has no accessible label"
grep -Fq '<caption>' "$EXPORT_PANEL" \
  || fail "the exported table has no caption"
grep -Fq 'scope="col"' "$EXPORT_PANEL" \
  || fail "the exported table has no column scopes"
grep -Fq 'describeCertificateExportContents' "$EXPORT_PANEL" \
  || fail "the student is not told what the export contains"
for custom in 'role="listbox"' 'role="combobox"' 'onKeyDown' 'tabIndex'; do
  if grep -Fq "$custom" "$EXPORT_PANEL"; then
    fail "the export panel must not build a custom control: $custom"
  fi
done
if grep -qiE 'className="[^"]*(green|red|amber|success-status|danger)' "$EXPORT_PANEL"; then
  fail "export status must not be conveyed by colour"
fi

echo "PASS: the export is text, portable and accessible"

# --- 59. failure behaviour and partial results ------------------------------
grep -Fq 'unavailableCertificates' "$EXPORT_TYPES" \
  || fail "the export cannot represent a certificate it could not include"
grep -Fq 'unavailableCertificates' "$EXPORT_SERVICE" \
  || fail "the export service drops certificates it cannot resolve"
grep -Fq 'describeUnavailableEntry' "$EXPORT_SERVICE" \
  || fail "an unexportable certificate is described inconsistently"
grep -Fq 'VALIDATION_ERROR' "$EXPORT_SERVICE" \
  || fail "the export accepts a blank identifier"

echo "PASS: an unexportable certificate is listed, never fabricated or dropped"

# ============================================================
# CERT-008 — Certificate Revocation and Correction (Batch 9)
# ============================================================

CORR_TYPES="packages/shared-types/src/certificate-correction.ts"
CORR_TYPE_TESTS="packages/shared-types/src/certificate-correction.test.ts"
CORR_SERVICE="services/api/src/certificate-correction.ts"
CORR_SERVICE_TESTS="services/api/src/certificate-correction.test.ts"
CORR_MIGRATION="supabase/migrations/20260813001000_certificate_correction_foundation.sql"
CORR_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_9_CERTIFICATE_REVOCATION_AND_CORRECTION.md"

for p in \
  "$CORR_TYPES" "$CORR_TYPE_TESTS" "$CORR_SERVICE" "$CORR_SERVICE_TESTS" \
  "$CORR_MIGRATION" "$CORR_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

CORR_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$CORR_SERVICE" || true)"
CORR_MIGRATION_CODE="$(grep -vE '^\s*--' "$CORR_MIGRATION" || true)"
CORR_POLICY_BLOCK="$(awk '/^create policy/{cap=1} /^create index/{cap=0} cap' "$CORR_MIGRATION" || true)"

# --- 60. CERT-004 remains the sole lifecycle authority ----------------------
grep -Fq 'public.certificate_record_lifecycle_event(' "$CORR_MIGRATION" \
  || fail "CERT-008 does not delegate the transition to CERT-004"
if echo "$CORR_SERVICE_CODE" | grep -qE 'certificate_lifecycle_events|certificate_record_lifecycle_event'; then
  fail "CERT-008 must not write lifecycle history itself"
fi
for forbidden in isValidCertificateLifecycleTransition resolveEffectiveCertificateStatus; do
  if echo "$CORR_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "CERT-008 must not evaluate lifecycle legality: $forbidden"
  fi
done
if echo "$CORR_MIGRATION_CODE" | grep -qF "transition is not permitted"; then
  fail "CERT-008 must not restate CERT-004 transition rules"
fi
# The load-bearing check: CERT-008 must reach lifecycle history ONLY through
# CERT-004's RPC. A direct insert would bypass CERT-004's edge guard, its
# contiguity rule and its serialization — the exact bypass this batch exists to
# make impossible. Reading the recorded event and the foreign key are permitted.
if echo "$CORR_MIGRATION_CODE" \
  | grep -qE '(insert|update|delete)[[:space:]]+(into[[:space:]]+|from[[:space:]]+)?public\.certificate_lifecycle_events'; then
  fail "CERT-008 must not write lifecycle history directly; CERT-004 owns it"
fi
if echo "$CORR_MIGRATION_CODE" \
  | grep -qE '(insert|update|delete)[[:space:]]+(into[[:space:]]+|from[[:space:]]+)?public\.certificates\b'; then
  fail "CERT-008 must not write certificate records; CERT-003 owns issuance"
fi
if echo "$CORR_MIGRATION_CODE" | grep -qE 'alter table public\.(certificates|certificate_lifecycle_events)'; then
  fail "CERT-008 must not alter CERT-003 or CERT-004 tables"
fi

# CERT-004's own migration must remain free of CERT-008 workflow concepts. This
# is the ORIGINAL protection, unchanged and still scoped to the CERT-004 file.
for forbidden in reason actor_id replacement_certificate notification notify; do
  if echo "$LIFE_MIGRATION_CODE" | grep -Fq "$forbidden"; then
    fail "CERT-008 workflow concept leaked into CERT-004: $forbidden"
  fi
done
grep -Fq 'revoke all on function public.certificate_record_lifecycle_event' "$LIFE_MIGRATION" \
  || fail "the CERT-004 lifecycle RPC lost its grant revocation"

echo "PASS: CERT-004 remains the sole lifecycle authority"

# --- 61. privileged authorization only --------------------------------------
grep -Fq 'revoke all on function public.certificate_apply_correction(' "$CORR_MIGRATION" \
  || fail "the correction RPC does not revoke execute from client roles"
echo "$CORR_MIGRATION_CODE" | grep -Fq 'security definer' \
  || fail "the correction RPC is not security definer"
echo "$CORR_MIGRATION_CODE" | grep -Fq 'set search_path = public' \
  || fail "the correction RPC has no fixed search_path"
echo "$CORR_MIGRATION_CODE" | grep -Fq 'for update' \
  || fail "the correction RPC does not serialize concurrent corrections"
if echo "$CORR_MIGRATION_CODE" | grep -Fq 'grant execute'; then
  fail "CERT-008 must not grant execute on any function"
fi

CORR_POLICIES="$(grep -c '^create policy' "$CORR_MIGRATION" || true)"
[ "$CORR_POLICIES" = "1" ] \
  || fail "expected exactly 1 correction policy, found $CORR_POLICIES"
echo "$CORR_POLICY_BLOCK" | grep -Fq 'for select to authenticated' \
  || fail "the correction read policy is not authenticated-select"
for write in 'for insert' 'for update' 'for delete' 'for all' 'to anon' 'to public'; do
  if echo "$CORR_POLICY_BLOCK" | grep -Fq "$write"; then
    fail "a forbidden correction policy grant exists: $write"
  fi
done

# No student-facing lifecycle control may exist.
for surface in '/certificates/revoke' '/certificates/restore' '/certificates/correct' \
               '/certificates/corrections'; do
  if grep -Fq "\"$surface\"" "$SERVER"; then
    fail "CERT-008 must expose no student lifecycle control: $surface"
  fi
done
grep -Fq '/^\/admin\/certificates\/([^/]+)\/corrections$/' "$SERVER" \
  || fail "the privileged correction route is missing"

echo "PASS: corrections are privileged, serialized and student-unreachable"

# --- 62. a reason is mandatory ----------------------------------------------
echo "$CORR_MIGRATION_CODE" | grep -Fq 'reason text not null check' \
  || fail "the database permits a reasonless correction"
echo "$CORR_MIGRATION_CODE" | grep -Fq 'length(btrim(reason)) >= 8' \
  || fail "the reason has no minimum length"
echo "$CORR_MIGRATION_CODE" | grep -Fq 'A certificate correction requires a reason' \
  || fail "the correction RPC does not require a reason"
grep -Fq 'validateCertificateCorrectionReason' "$CORR_SERVICE" \
  || fail "the service accepts a correction without validating the reason"

echo "PASS: a correction can never be recorded without a reason"

# --- 63. append-only history, no deletion -----------------------------------
echo "$CORR_MIGRATION_CODE" | grep -Fq 'before update or delete on public.certificate_correction_events' \
  || fail "correction history is not append-only"
echo "$CORR_MIGRATION_CODE" | grep -Fq 'append-only and cannot be updated' \
  || fail "correction history permits update"
echo "$CORR_MIGRATION_CODE" | grep -Fq 'append-only and cannot be deleted' \
  || fail "correction history permits delete"
echo "$CORR_MIGRATION_CODE" | grep -Fq 'lifecycle_event_id uuid not null unique' \
  || fail "a correction is not bound to exactly one lifecycle event"
if echo "$CORR_SERVICE_CODE" | grep -qE '\.delete\(|\.update\('; then
  fail "CERT-008 must never delete or rewrite certificate history"
fi
echo "$CORR_MIGRATION_CODE" | grep -Fq 'constraint certificate_correction_events_idempotency_key' \
  || fail "a retried correction is not collapsed"

echo "PASS: correction history is append-only and issuance is preserved"

# --- 64. no duplicated downstream propagation -------------------------------
for forbidden in verifyCertificate getStudentCertificatePortfolio \
                 exportStudentCertificates verification_id; do
  if echo "$CORR_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "CERT-008 must not reach into a downstream reader: $forbidden"
  fi
done
for forbidden in propagation propagated current_status cached_status; do
  if echo "$CORR_MIGRATION_CODE" | grep -qF "$forbidden"; then
    fail "CERT-008 must not cache or flag status: $forbidden"
  fi
done
grep -Fq 'resolveEffectiveCertificateStatus' "$VERIFY_SERVICE" \
  || fail "CERT-005 stopped deriving status from CERT-004"
grep -Fq 'resolveEffectiveCertificateStatus' "$PORT_SERVICE" \
  || fail "CERT-006 stopped deriving status from CERT-004"

echo "PASS: downstream readers still derive status from CERT-004"

# --- 65. audit and AI boundary ----------------------------------------------
grep -Fq 'writeAuditEvent' "$CORR_SERVICE" \
  || fail "a privileged correction is not audited"
grep -Fq 'certificate.correction.applied' "$CORR_SERVICE" \
  || fail "the correction audit event is not named"
if echo "$CORR_SERVICE_CODE" | grep -qiE 'openai|anthropic|ollama|ai[-_ ]?gateway'; then
  fail "an AI dependency exists in the correction path"
fi
if echo "$CORR_MIGRATION_CODE" | grep -qiE 'openai|anthropic|ollama'; then
  fail "an AI dependency exists in the correction migration"
fi

echo "PASS: every privileged correction is audited with no AI in the path"

# --- 66. no arbitrary deletion, no hidden revocation ------------------------
if echo "$CORR_MIGRATION_CODE" | grep -qE 'delete from public\.(certificates|certificate_lifecycle_events|certificate_correction_events)'; then
  fail "CERT-008 must never delete certificate data"
fi
grep -Fq 'export function toStudentCertificateCorrection' "$CORR_TYPES" \
  || fail "the student-facing correction projection is missing"
grep -Fq 'CERTIFICATE_CORRECTION_STUDENT_FORBIDDEN_FIELDS' "$CORR_TYPES" \
  || fail "the student projection prohibition list is not held as data"
grep -Fq 'CERTIFICATE_CORRECTION_STUDENT_FORBIDDEN_FIELDS' "$CORR_TYPE_TESTS" \
  || fail "the student projection prohibition is not asserted by tests"
# A revocation is never hidden: the student is told, in words, what happened.
grep -Fq 'export function explainCertificateCorrection' "$CORR_TYPES" \
  || fail "a student is given no explanation of a status change"

echo "PASS: nothing is deleted and no revocation is hidden from the student"

# ============================================================
# CERT-009 — Certificate Branding and Presentation (Batch 10)
# ============================================================

PRES_TYPES="packages/shared-types/src/certificate-presentation.ts"
PRES_TYPE_TESTS="packages/shared-types/src/certificate-presentation.test.ts"
PRES_SERVICE="services/api/src/certificate-presentation.ts"
PRES_SERVICE_TESTS="services/api/src/certificate-presentation.test.ts"
PRES_VIEW="apps/web/src/certificates/CertificatePresentationView.tsx"
PRES_WEB_SERVICE="apps/web/src/certificates/certificate-presentation-service.ts"
PRES_STYLES="apps/web/src/styles.css"
PRES_DOC="docs/Engineering-OS/BUILD_WAVE_8_BATCH_10_CERTIFICATE_BRANDING_AND_PRESENTATION.md"

for p in \
  "$PRES_TYPES" "$PRES_TYPE_TESTS" "$PRES_SERVICE" "$PRES_SERVICE_TESTS" \
  "$PRES_VIEW" "$PRES_WEB_SERVICE" "$PRES_STYLES" "$PRES_DOC"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

PRES_TYPES_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$PRES_TYPES" || true)"
PRES_SERVICE_CODE="$(grep -vE '^\s*(//|\*|/\*)' "$PRES_SERVICE" || true)"
PRES_VIEW_CODE="$(awk '/\{\/\*/{skip=1} !skip; /\*\/\}/{skip=0}' "$PRES_VIEW" \
  | grep -vE '^\s*(//|\*|/\*)' || true)"

# --- 67. no migration, no schema, no dependency -----------------------------
[ "$(certificate_migration_set)" = "$CERTIFICATE_MIGRATIONS_EXPECTED" ] \
  || fail "CERT-009 must add no migration; unexpected set:
$(certificate_migration_set)"
for manifest in apps/web/package.json services/api/package.json packages/shared-types/package.json; do
  if grep -qiE '"(pdfkit|jspdf|puppeteer|playwright|qrcode|qr-image|html2canvas|handlebars|ejs|pug)"' "$manifest"; then
    fail "CERT-009 must not introduce a rendering dependency: $manifest"
  fi
done

echo "PASS: CERT-009 adds no migration, no schema and no rendering dependency"

# --- 68. presentation owns no credential truth ------------------------------
grep -Fq 'getStudentCertificatePortfolio' "$PRES_SERVICE" \
  || fail "CERT-009 must compose the CERT-006 portfolio rather than re-reading"
for forbidden in resolveEffectiveCertificateStatus evaluateCertificateEligibility \
                 issueStudentCertificate applyCertificateCorrection \
                 isValidCertificateLifecycleTransition; do
  if echo "$PRES_SERVICE_CODE" | grep -qF "$forbidden"; then
    fail "CERT-009 must not calculate credential truth: $forbidden"
  fi
done
# It may read only the two presentation concerns it owns.
PRES_READS="$(echo "$PRES_SERVICE_CODE" | grep -oE '\.from\("[a-z_]+"\)' | sort -u || true)"
EXPECTED_PRES_READS='.from("certificate_definitions")
.from("user_profiles")'
[ "$PRES_READS" = "$EXPECTED_PRES_READS" ] \
  || fail "CERT-009 reads outside its presentation concerns:
$PRES_READS"
for write in '.insert(' '.update(' '.upsert(' '.delete(' '.rpc('; do
  if echo "$PRES_SERVICE_CODE" | grep -qF "$write"; then
    fail "CERT-009 must write nothing: $write"
  fi
done
grep -Fq 'export function presentationPreservesTruth' "$PRES_TYPES" \
  || fail "there is no way to prove presentation preserves truth"
grep -Fq 'presentationPreservesTruth' "$PRES_TYPE_TESTS" \
  || fail "presentation truth preservation is not asserted by tests"

echo "PASS: presentation composes existing authorities and alters no truth"

# --- 69. holder identity stays owner-only -----------------------------------
grep -Fq 'display_name' "$PRES_SERVICE" \
  || fail "the owner's display name is not read by CERT-009"
grep -Fq '.eq("user_id", userId)' "$PRES_SERVICE" \
  || fail "the display name read is not scoped to the caller"
# The identity boundary CERT-005 and CERT-007 established must hold.
# Judged on comment-stripped code: these services document precisely that they
# never touch user_profiles, so a full-text scan would flag their own exclusion
# notes as violations.
for guarded in "$VERIFY_SERVICE" "$EXPORT_SERVICE" "$PORT_SERVICE"; do
  if grep -vE '^\s*(//|\*|/\*)' "$guarded" | grep -qE 'display_name|user_profiles'; then
    fail "holder identity leaked into a non-CERT-009 service: $guarded"
  fi
done
if grep -qE 'holderName|displayName|display_name' "$VERIFY_TYPES" "$EXPORT_TYPES"; then
  # Permitted only inside a forbidden-field list, never as a carried field.
  if grep -E 'holderName|displayName|display_name' "$VERIFY_TYPES" "$EXPORT_TYPES" \
    | grep -qvE '^\S+:\s*"'; then
    fail "holder identity became a public or exported field"
  fi
fi

echo "PASS: the holder name is owner-only and never public or exported"

# --- 70. no PDF, no QR, no second token, no binary asset --------------------
if echo "$PRES_TYPES_CODE$PRES_SERVICE_CODE$PRES_VIEW_CODE" \
  | grep -qiE '\bpdf\b|\bqr\b|canvas|toDataURL|jsPDF|data:image|<img'; then
  fail "CERT-009 must not generate a PDF, a QR image or an image credential"
fi
# Quoted list entries are excluded: the prohibition list itself names these
# fields in order to forbid them, and must not be read as using them.
PRES_TOKEN_SCAN="$(printf '%s\n%s\n' "$PRES_TYPES_CODE" "$PRES_SERVICE_CODE" \
  | grep -vE '^\s*"[A-Za-z_]+",?$' || true)"
if echo "$PRES_TOKEN_SCAN" | grep -qE 'randomBytes|shareToken|verificationToken'; then
  fail "CERT-009 must not mint a second verification token"
fi
# Matched on the CALL with the certificate's own reference, not the import: a
# leftover import must not satisfy this while the link points somewhere else.
grep -Fq 'href={buildCertificateVerificationHref(' "$PRES_VIEW" \
  || fail "the presentation does not link to the official CERT-005 verification"
grep -Fq 'certificate.verificationReference' "$PRES_VIEW" \
  || fail "the verification link does not use the certificate's own reference"
if echo "$PRES_TOKEN_SCAN" | grep -qE 'logoUrl|brandAssetId|accreditationSeal|storage\.'; then
  fail "CERT-009 must not introduce a binary brand asset or seal"
fi

echo "PASS: no PDF, no QR image, no second token and no binary brand asset"

# --- 71. accessible, printable, never image-only ----------------------------
grep -Fq '@media print' "$PRES_STYLES" \
  || fail "no browser-native print treatment exists"
grep -Fq 'attr(href)' "$PRES_STYLES" \
  || fail "the verification destination would be lost when printed"
if grep -qE 'background-image|url\(|content: *"" *;' "$PRES_STYLES"; then
  fail "the credential must not rely on an image"
fi
grep -Fq 'statusLabel' "$PRES_VIEW" \
  || fail "certificate status is not rendered as text"
grep -Fq 'logoTextAlternative' "$PRES_VIEW" \
  || fail "the brand mark has no text alternative"
grep -Fq 'aria-live="polite"' "$PRES_VIEW" \
  || fail "the presentation has no polite status region"
grep -Fq 'role="alert"' "$PRES_VIEW" \
  || fail "the presentation reports failure without an alert"
for custom in 'role="listbox"' 'role="combobox"' 'onKeyDown' 'tabIndex'; do
  if grep -Fq "$custom" "$PRES_VIEW"; then
    fail "the presentation must not build a custom control: $custom"
  fi
done
# Word-bounded: "credential" contains "red", so an unbounded scan would flag
# every credential class in this view as a colour signal.
if grep -qiE 'className="[^"]*\b(green|red|amber|success-status|danger)\b' "$PRES_VIEW"; then
  fail "credential validity must not be conveyed by colour"
fi

echo "PASS: the credential is accessible text and prints natively"

# --- 72. graceful fallback, and revoked is never hidden ---------------------
grep -Fq 'export function buildFallbackCertificatePresentation' "$PRES_TYPES" \
  || fail "there is no accessible fallback presentation"
# Matched on the CALL, not the import: an unused import would otherwise satisfy
# this guard while the fallback was never actually reached.
grep -Fq 'buildFallbackCertificatePresentation(entry, holderName)' "$PRES_SERVICE" \
  || fail "the service never falls back when brand metadata is missing"
grep -Fq 'isFallback' "$PRES_VIEW" \
  || fail "the learner is not told when a simpler presentation was used"
grep -Fq 'presentAsCurrentlyValid' "$PRES_VIEW" \
  || fail "the presentation does not distinguish a non-current certificate"
if echo "$PRES_TYPES_CODE" | grep -qE 'status *= *"active"|status: *"active"'; then
  fail "CERT-009 must never assign a status"
fi

echo "PASS: presentation degrades gracefully and never hides a revoked status"

# ------------------------------------------------------------
# 12. Wave 7 must still be green before Wave 8 counts as green
# ------------------------------------------------------------
echo ""
echo "--- Wave 7 Evidence Engine completion gate ---"
bash scripts/verify-evidence-engine-completion.sh

# ------------------------------------------------------------
# 13. Repository toolchain
# ------------------------------------------------------------
bash scripts/ci-toolchain.sh typecheck test build security smoke

echo ""
echo "============================================================"
echo "Wave 8 Batch 1 verification passed."
echo "CERT-001 Certificate Definition Model is implemented."
echo "Wave 8 Batch 2 verification passed."
echo "CERT-002 backend eligibility evaluator/API verification passed."
echo "CERT-002 student eligibility UI and accessibility verification passed."
echo "Wave 8 Batch 4 verification passed."
echo "CERT-003 Deterministic Certificate Issuance is implemented."
echo "Wave 8 Batch 5 verification passed."
echo "CERT-004 Certificate Record and Lifecycle is implemented."
echo "Wave 8 Batch 6 verification passed."
echo "CERT-005 Certificate Verification is implemented."
echo "Wave 8 Batch 7 verification passed."
echo "CERT-006 Student Certificate Portfolio is implemented."
echo "Concurrency and rollback are structurally verified only; no live PostgreSQL test exists."
echo "Wave 7 Evidence Engine guarantees remain intact."
echo "============================================================"
