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
  | grep -v 'certificate-eligibility\.test\.ts$' || true)"
[ -z "$DUPLICATE_MODELS" ] \
  || fail "a duplicate shared Certificate model exists: $DUPLICATE_MODELS"

# Only certificate-definition.ts may declare the Certificate Definition model.
if grep -Fq 'export interface CertificateDefinition ' packages/shared-types/src/certificate-eligibility.ts; then
  fail "certificate-eligibility.ts must import the Certificate Definition model, not redeclare it"
fi
DEFINITION_DECLARATIONS="$(grep -rlF 'export interface CertificateDefinition ' packages/shared-types/src services/api/src 2>/dev/null || true)"
[ "$DEFINITION_DECLARATIONS" = "packages/shared-types/src/certificate-definition.ts" ] \
  || fail "the Certificate Definition model is declared outside certificate-definition.ts: $DEFINITION_DECLARATIONS"

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
# Batch 1 forbade every student certificate route, because Batch 1 had none.
# Batch 2 adds exactly one approved student read — GET /certificates/eligibility
# (CERT-002). The invariant is therefore narrowed, not weakened: the only
# permitted student certificate path is the eligibility read, and any
# certificate record, issuance or verification route is still a failure.
STUDENT_CERT_ROUTES="$(grep -oE 'pathname === "/certificates[^"]*"' "$SERVER" || true)"
for route in $(echo "$STUDENT_CERT_ROUTES" | grep -oE '"/certificates[^"]*"' || true); do
  [ "$route" = '"/certificates/eligibility"' ] \
    || fail "an unapproved student certificate route exists: $route"
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
# CERT-002 is computed on demand. CERT-003 owns issuance snapshots and CERT-004
# owns the durable Certificate Record.
CERT_MIGRATION_COUNT="$(ls supabase/migrations/*certificate*.sql 2>/dev/null | wc -l | tr -d ' ')"
[ "$CERT_MIGRATION_COUNT" = "1" ] \
  || fail "CERT-002 must add no migration; found $CERT_MIGRATION_COUNT certificate migrations"

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

# No React or UI file was added in this batch.
if git status --porcelain apps/web 2>/dev/null | grep -q .; then
  fail "Batch 2 defers frontend UI; apps/web must be unchanged"
fi

echo "PASS: CERT-003 through CERT-009 remain unimplemented"
echo "PASS: AI holds no authority over eligibility"
echo "PASS: frontend UI remains deferred and apps/web is unchanged"

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
echo "Student eligibility UI/accessibility remains pending before CERT-002 closure."
echo "Wave 7 Evidence Engine guarantees remain intact."
echo "============================================================"
