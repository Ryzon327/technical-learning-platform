#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Wave 7 — Evidence Engine verifier.
# Batch 1 scope: canonical Evidence Record and provenance foundation.
# Later Wave 7 batches extend this script.

EVIDENCE_TYPES="packages/shared-types/src/evidence.ts"
EVIDENCE_SERVICE="services/api/src/evidence.ts"
EVIDENCE_MIGRATION="supabase/migrations/20260813000100_evidence_foundation.sql"

for p in \
  "$EVIDENCE_TYPES" \
  packages/shared-types/src/evidence.test.ts \
  "$EVIDENCE_SERVICE" \
  services/api/src/evidence.test.ts \
  "$EVIDENCE_MIGRATION" \
  docs/Engineering-OS/BUILD_WAVE_7_BATCH_1_CANONICAL_EVIDENCE_FOUNDATION.md; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

# --- shared Evidence contract -------------------------------------------------
grep -Fq 'export interface EvidenceRecord' "$EVIDENCE_TYPES" || exit 1
grep -Fq 'export interface EvidenceProvenance' "$EVIDENCE_TYPES" || exit 1
grep -Fq 'export interface CreateCanonicalEvidenceInput' "$EVIDENCE_TYPES" || exit 1
grep -Fq 'export type EvidenceSourceType' "$EVIDENCE_TYPES" || exit 1
grep -Fq 'export type EvidenceRecordState' "$EVIDENCE_TYPES" || exit 1
grep -Fq 'export type EvidenceIntegrityState' "$EVIDENCE_TYPES" || exit 1
grep -Fq 'export * from "./evidence";' packages/shared-types/src/index.ts || exit 1

# Evidence input must never carry progress or eligibility instructions.
if grep -nEi 'markCompetencyDemonstrated|competencyDemonstrated|grantCompetency|evidenceEligible' "$EVIDENCE_TYPES" "$EVIDENCE_SERVICE"; then
  echo "FAIL: Evidence intake accepts competency advancement instructions"; exit 1
fi

# --- migration, RLS, and write-policy absence ---------------------------------
grep -Fq 'create table if not exists public.evidence_records' "$EVIDENCE_MIGRATION" || exit 1
grep -Fq 'alter table public.evidence_records enable row level security' "$EVIDENCE_MIGRATION" || exit 1
grep -Fq 'for select to authenticated' "$EVIDENCE_MIGRATION" || exit 1
grep -Fq 'auth.uid() = user_id' "$EVIDENCE_MIGRATION" || exit 1
grep -Fq 'unique (user_id, source_type, source_reference)' "$EVIDENCE_MIGRATION" || exit 1
grep -Fq 'evidence_integrity_digest' "$EVIDENCE_MIGRATION" || exit 1
grep -Fq 'source_integrity_digest' "$EVIDENCE_MIGRATION" || exit 1
grep -Fq 'Canonical Evidence provenance is immutable' "$EVIDENCE_MIGRATION" || exit 1

# A policy on evidence_records may span lines; inspect the two lines that follow
# each "on public.evidence_records" and reject any non-select policy target.
if grep -A2 -Ei '^[[:space:]]*on public\.evidence_records[[:space:]]*$' "$EVIDENCE_MIGRATION" \
  | grep -qEi '^[[:space:]]*for[[:space:]]+(insert|update|delete|all)\b'; then
  echo "FAIL: student write policy granted on evidence_records"; exit 1
fi

if grep -qEi 'create policy[^;]*evidence_records[^;]*for[[:space:]]+(insert|update|delete|all)\b' "$EVIDENCE_MIGRATION"; then
  echo "FAIL: student write policy granted on evidence_records"; exit 1
fi

# --- server-authoritative service --------------------------------------------
grep -Fq 'export async function createCanonicalEvidence' "$EVIDENCE_SERVICE" || exit 1
grep -Fq 'export async function listStudentEvidence' "$EVIDENCE_SERVICE" || exit 1
grep -Fq 'export async function getCanonicalEvidenceForStudent' "$EVIDENCE_SERVICE" || exit 1
grep -Fq 'createServerSupabaseClient()' "$EVIDENCE_SERVICE" || exit 1
grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$EVIDENCE_SERVICE" || exit 1
grep -Fq 'createHash("sha256")' "$EVIDENCE_SERVICE" || exit 1
grep -Fq 'evidence.record.created' "$EVIDENCE_SERVICE" || exit 1
grep -Fq '"CONFLICT"' "$EVIDENCE_SERVICE" || exit 1

# --- authenticated student read routes, and no student create route -----------
grep -Fq 'pathname === "/evidence"' services/api/src/server.ts || exit 1
grep -Fq 'evidenceRecordMatch' services/api/src/server.ts || exit 1
grep -Fq 'listStudentEvidence(trusted.accessToken)' services/api/src/server.ts || exit 1
grep -Fq 'getCanonicalEvidenceForStudent(trusted.accessToken' services/api/src/server.ts || exit 1

if grep -nE 'request\.method === "POST" && (pathname === "/evidence"|evidenceRecordMatch)' services/api/src/server.ts; then
  echo "FAIL: student Evidence creation route exists"; exit 1
fi
if grep -Fq 'createCanonicalEvidence' services/api/src/server.ts; then
  echo "FAIL: Evidence creation is reachable from the HTTP surface"; exit 1
fi

# --- source-engine boundaries held for later batches --------------------------
if grep -nE 'assessment_evidence_handoffs|lab_validation_runs|student_competency_evidence_refs' "$EVIDENCE_SERVICE"; then
  echo "FAIL: Batch 1 must not consume source-engine handoffs"; exit 1
fi

# --- AI must not participate in Evidence truth --------------------------------
if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' "$EVIDENCE_TYPES" "$EVIDENCE_SERVICE" "$EVIDENCE_MIGRATION"; then
  echo "FAIL: AI dependency detected in the Evidence truth path"; exit 1
fi

echo "PASS: canonical Evidence shared type exists and is exported"
echo "PASS: Evidence migration creates evidence_records with canonical constraints"
echo "PASS: RLS is enabled with a student SELECT-only policy"
echo "PASS: no student Evidence write policy is granted"
echo "PASS: Evidence provenance is immutable after creation"
echo "PASS: source integrity and Evidence integrity remain distinct digests"
echo "PASS: canonical Evidence creation is server-authoritative"
echo "PASS: idempotency is keyed on the logical source identity"
echo "PASS: integrity conflicts fail closed with CONFLICT"
echo "PASS: student read routes require authenticated identity"
echo "PASS: no student Evidence creation route exists"
echo "PASS: assessment and lab handoff consumption remain deferred"
echo "PASS: AI holds no Evidence authority"

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 7 Batch 1 verification passed."
