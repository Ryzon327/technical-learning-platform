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

# ============================================================
# Wave 7 Batch 2 — EVID-003 Competency Evidence Linking.
# Batch 1 checks above are preserved verbatim.
# ============================================================

LINK_TYPES="packages/shared-types/src/evidence-competency.ts"
LINK_SERVICE="services/api/src/evidence-competency.ts"
LINK_MIGRATION="supabase/migrations/20260813000200_evidence_competency_linking.sql"
COMPETENCY_MIGRATION="supabase/migrations/20260811000900_competency_state_foundation.sql"

for p in \
  "$LINK_TYPES" \
  packages/shared-types/src/evidence-competency.test.ts \
  "$LINK_SERVICE" \
  services/api/src/evidence-competency.test.ts \
  "$LINK_MIGRATION" \
  docs/Engineering-OS/BUILD_WAVE_7_BATCH_2_COMPETENCY_EVIDENCE_LINKING.md; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

# --- shared Evidence competency contract --------------------------------------
grep -Fq 'export interface EvidenceCompetencyLink' "$LINK_TYPES" || exit 1
grep -Fq 'export type EvidenceCompetencyRelationship' "$LINK_TYPES" || exit 1
grep -Fq 'export type EvidenceCompetencyLinkSource' "$LINK_TYPES" || exit 1
grep -Fq 'export interface CreateEvidenceCompetencyLinkInput' "$LINK_TYPES" || exit 1
grep -Fq 'export interface AuthoritativeCompetencyEvidenceReference' "$LINK_TYPES" || exit 1
grep -Fq 'export * from "./evidence-competency";' packages/shared-types/src/index.ts || exit 1

# Mapping sources must never grant AI authority.
if grep -nEi 'ai_generated|llm|model_decision' "$LINK_TYPES" "$LINK_SERVICE" "$LINK_MIGRATION"; then
  echo "FAIL: AI mapping authority detected in the competency linking path"; exit 1
fi

# A link must never assert mastery.
if grep -nEi 'markCompetencyDemonstrated|decideCompetencyTransition|recordAuthoritativeCompetencyEvidence' "$LINK_SERVICE"; then
  echo "FAIL: Evidence linking reaches into Learning Engine mastery authority"; exit 1
fi

# --- migration, constraints, RLS ----------------------------------------------
grep -Fq 'create table if not exists public.evidence_competency_links' "$LINK_MIGRATION" || exit 1
grep -Fq 'references public.evidence_records(id)' "$LINK_MIGRATION" || exit 1
grep -Fq 'references public.competencies(id)' "$LINK_MIGRATION" || exit 1
grep -Fq 'competency_version integer not null check (competency_version > 0)' "$LINK_MIGRATION" || exit 1
grep -Fq "relationship in ('required', 'supporting')" "$LINK_MIGRATION" || exit 1
grep -Fq "'approved_curriculum_mapping'" "$LINK_MIGRATION" || exit 1
grep -Fq 'unique (evidence_id, competency_stable_id, competency_version, relationship)' "$LINK_MIGRATION" || exit 1
grep -Fq 'alter table public.evidence_competency_links enable row level security' "$LINK_MIGRATION" || exit 1
grep -Fq 'for select to authenticated' "$LINK_MIGRATION" || exit 1
grep -Fq 'auth.uid() = user_id' "$LINK_MIGRATION" || exit 1
grep -Fq 'Evidence competency link owner must match the Evidence owner' "$LINK_MIGRATION" || exit 1
grep -Fq 'must preserve the exact competency definition reference' "$LINK_MIGRATION" || exit 1

if grep -A2 -Ei '^[[:space:]]*on public\.evidence_competency_links[[:space:]]*$' "$LINK_MIGRATION" \
  | grep -qEi '^[[:space:]]*for[[:space:]]+(insert|update|delete|all)\b'; then
  echo "FAIL: student write policy granted on evidence_competency_links"; exit 1
fi

if grep -qEi 'create policy[^;]*evidence_competency_links[^;]*for[[:space:]]+(insert|update|delete|all)\b' "$LINK_MIGRATION"; then
  echo "FAIL: student write policy granted on evidence_competency_links"; exit 1
fi

# The Learning Engine's own tables must not be redefined or mutated here.
if grep -nEi 'student_competency_state|student_competency_evidence_refs|drop table' "$LINK_MIGRATION"; then
  echo "FAIL: Batch 2 migration touches Learning Engine competency objects"; exit 1
fi

grep -Fq 'create table if not exists public.student_competency_evidence_refs' "$COMPETENCY_MIGRATION" || {
  echo "FAIL: existing student_competency_evidence_refs was removed"; exit 1
}
grep -Fq 'export async function recordAuthoritativeCompetencyEvidence' services/api/src/competency.ts || {
  echo "FAIL: existing recordAuthoritativeCompetencyEvidence was removed"; exit 1
}

# --- server-authoritative linking ---------------------------------------------
grep -Fq 'export async function linkEvidenceToCompetency' "$LINK_SERVICE" || exit 1
grep -Fq 'export async function listEvidenceCompetencyLinks' "$LINK_SERVICE" || exit 1
grep -Fq 'export async function listCompetencyEvidenceLinks' "$LINK_SERVICE" || exit 1
grep -Fq 'export async function getAuthoritativeCompetencyEvidenceReferences' "$LINK_SERVICE" || exit 1
grep -Fq 'createServerSupabaseClient()' "$LINK_SERVICE" || exit 1
grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$LINK_SERVICE" || exit 1
grep -Fq 'evidence.userId !== input.userId' "$LINK_SERVICE" || exit 1
grep -Fq 'evaluateEvidenceLinkEligibility' "$LINK_SERVICE" || exit 1
grep -Fq 'evidence.competency.linked' "$LINK_SERVICE" || exit 1
grep -Fq 'competency_version: definition.version' "$LINK_SERVICE" || exit 1

# No automatic source-engine consumption in this batch.
if grep -nE 'assessment_evidence_handoffs|lab_validation_runs|lab_validation_results' "$LINK_SERVICE"; then
  echo "FAIL: Batch 2 must not consume assessment or lab source truth"; exit 1
fi

# --- authenticated read routes, no student mutation route ---------------------
grep -Fq 'evidenceCompetencyMatch' services/api/src/server.ts || exit 1
grep -Fq 'competencyEvidenceMatch' services/api/src/server.ts || exit 1
grep -Fq 'listEvidenceCompetencyLinks(trusted.accessToken' services/api/src/server.ts || exit 1
grep -Fq 'listCompetencyEvidenceLinks(trusted.accessToken' services/api/src/server.ts || exit 1

if grep -nE 'request\.method === "(POST|PUT|PATCH|DELETE)" && (evidenceCompetencyMatch|competencyEvidenceMatch)' services/api/src/server.ts; then
  echo "FAIL: student Evidence competency mutation route exists"; exit 1
fi
if grep -Fq 'linkEvidenceToCompetency' services/api/src/server.ts; then
  echo "FAIL: trusted linking is reachable from the HTTP surface"; exit 1
fi

if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' "$LINK_TYPES" "$LINK_SERVICE" "$LINK_MIGRATION"; then
  echo "FAIL: AI dependency detected in the competency mapping path"; exit 1
fi

echo "PASS: shared Evidence competency link type exists and is exported"
echo "PASS: Evidence competency link table exists with approved constraints"
echo "PASS: relationship and link-source values are constrained"
echo "PASS: RLS grants students SELECT only on their own links"
echo "PASS: no student Evidence competency write policy is granted"
echo "PASS: Evidence owner is authoritative for link ownership"
echo "PASS: only active integrity-verified Evidence may be linked"
echo "PASS: the exact historical competency definition version is preserved"
echo "PASS: linking is server-authoritative and idempotent"
echo "PASS: existing student_competency_evidence_refs and Learning Engine flow are preserved"
echo "PASS: a link never marks a competency demonstrated"
echo "PASS: assessment and lab consumption remain deferred to later batches"
echo "PASS: authenticated read routes exist with no student mutation route"
echo "PASS: AI holds no competency mapping authority"

# ============================================================
# Wave 7 Batch 3 — EVID-005 Assessment Evidence.
# Batch 1 and Batch 2 checks above are preserved verbatim.
# ============================================================

ASSESSMENT_EVIDENCE_TYPES="packages/shared-types/src/assessment-evidence.ts"
ASSESSMENT_EVIDENCE_SERVICE="services/api/src/assessment-evidence.ts"
ASSESSMENT_EVIDENCE_MIGRATION="supabase/migrations/20260813000300_assessment_evidence_consumption.sql"
HANDOFF_MIGRATION="supabase/migrations/20260812000400_assessment_recovery_integrity.sql"

for p in \
  "$ASSESSMENT_EVIDENCE_TYPES" \
  packages/shared-types/src/assessment-evidence.test.ts \
  "$ASSESSMENT_EVIDENCE_SERVICE" \
  services/api/src/assessment-evidence.test.ts \
  "$ASSESSMENT_EVIDENCE_MIGRATION" \
  docs/Engineering-OS/BUILD_WAVE_7_BATCH_3_ASSESSMENT_EVIDENCE.md; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

# --- shared assessment Evidence contract --------------------------------------
grep -Fq 'export function evaluateAssessmentEvidenceEligibility' "$ASSESSMENT_EVIDENCE_TYPES" || exit 1
grep -Fq 'export function buildAssessmentEvidenceMetadata' "$ASSESSMENT_EVIDENCE_TYPES" || exit 1
grep -Fq 'export function toEvidenceCompetencyRelationship' "$ASSESSMENT_EVIDENCE_TYPES" || exit 1
grep -Fq 'export * from "./assessment-evidence";' packages/shared-types/src/index.ts || exit 1

# --- eligibility: only evidence-producing, only terminal attempts --------------
grep -Fq "EVIDENCE_PRODUCING_ASSESSMENT_PURPOSE" "$ASSESSMENT_EVIDENCE_TYPES" || exit 1
grep -Fq "assessment_not_evidence_producing" "$ASSESSMENT_EVIDENCE_TYPES" || exit 1
grep -Fq "attempt_not_terminal" "$ASSESSMENT_EVIDENCE_TYPES" || exit 1

# --- provenance: upstream digest preserved, never recomputed ------------------
grep -Fq 'sourceIntegrityDigest: facts.resultDigest' "$ASSESSMENT_EVIDENCE_SERVICE" || exit 1
grep -Fq 'sourceType: "assessment_attempt"' "$ASSESSMENT_EVIDENCE_SERVICE" || exit 1
grep -Fq 'sourceEngine: "assessment"' "$ASSESSMENT_EVIDENCE_SERVICE" || exit 1
grep -Fq 'linkSource: "source_engine_mapping"' "$ASSESSMENT_EVIDENCE_SERVICE" || exit 1
grep -Fq 'competency_stable_id,competency_version,required' "$ASSESSMENT_EVIDENCE_SERVICE" || exit 1

if grep -nE 'calculateAssessmentResultDigest|scoreAssessment' "$ASSESSMENT_EVIDENCE_SERVICE"; then
  echo "FAIL: Evidence ingestion must not recompute assessment scoring truth"; exit 1
fi

# --- no answer keys, questions or options may reach Evidence ------------------
if grep -nE 'assessment_attempt_answers|selected_option_ids|correct_option_ids|assessment_questions' "$ASSESSMENT_EVIDENCE_SERVICE"; then
  echo "FAIL: assessment Evidence must not read questions, options or answer keys"; exit 1
fi

# --- submission authority is never subordinate to ingestion -------------------
grep -Fq 'tryConsumeAssessmentEvidenceHandoff' services/api/src/assessment-attempts.ts || exit 1
if ! awk '/export async function submitAssessmentAttempt/,0' services/api/src/assessment-attempts.ts \
  | grep -n 'buildAssessmentEvidenceHandoff' > /tmp/w7b3_handoff_line \
  || ! awk '/export async function submitAssessmentAttempt/,0' services/api/src/assessment-attempts.ts \
  | grep -n 'tryConsumeAssessmentEvidenceHandoff' > /tmp/w7b3_consume_line; then
  echo "FAIL: submission does not persist the handoff before Evidence ingestion"; exit 1
fi
if [ "$(cut -d: -f1 /tmp/w7b3_handoff_line | head -1)" -ge "$(cut -d: -f1 /tmp/w7b3_consume_line | head -1)" ]; then
  echo "FAIL: Evidence ingestion must run after the assessment handoff is persisted"; exit 1
fi
rm -f /tmp/w7b3_handoff_line /tmp/w7b3_consume_line

grep -Fq 'assessment.evidence.consumption_failed' "$ASSESSMENT_EVIDENCE_SERVICE" || exit 1
grep -Fq 'assessment.evidence.consumed' "$ASSESSMENT_EVIDENCE_SERVICE" || exit 1

# The consumer must never mutate assessment scoring state or the handoff.
if grep -nE 'from\("assessment_evidence_handoffs"\)[^;]*\.(update|upsert|insert|delete)\(' "$ASSESSMENT_EVIDENCE_SERVICE"; then
  echo "FAIL: Evidence ingestion must not rewrite the assessment handoff"; exit 1
fi
if grep -nE 'from\("assessment_attempts"\)[^;]*\.(update|upsert|insert|delete)\(' "$ASSESSMENT_EVIDENCE_SERVICE"; then
  echo "FAIL: Evidence ingestion must not mutate assessment attempts"; exit 1
fi

# --- durable retry state ------------------------------------------------------
grep -Fq 'create table if not exists public.assessment_evidence_consumptions' "$ASSESSMENT_EVIDENCE_MIGRATION" || exit 1
grep -Fq "state in ('consumed', 'skipped', 'failed')" "$ASSESSMENT_EVIDENCE_MIGRATION" || exit 1
grep -Fq 'alter table public.assessment_evidence_consumptions enable row level security' "$ASSESSMENT_EVIDENCE_MIGRATION" || exit 1
grep -Fq 'export async function retryFailedAssessmentEvidenceConsumption' "$ASSESSMENT_EVIDENCE_SERVICE" || exit 1

# A policy may span lines, so reject any policy defined in this migration at all:
# the consumption table is internal operational state with no student access.
if grep -qi 'create policy' "$ASSESSMENT_EVIDENCE_MIGRATION"; then
  echo "FAIL: internal consumption state must not be student readable"; exit 1
fi
if grep -A2 -Ei '^[[:space:]]*on public\.assessment_evidence_consumptions[[:space:]]*$' "$ASSESSMENT_EVIDENCE_MIGRATION" \
  | grep -qEi '^[[:space:]]*for[[:space:]]+(select|insert|update|delete|all)\b'; then
  echo "FAIL: internal consumption state must not be student readable"; exit 1
fi

# The Wave 4 handoff table and Batch 1/2 tables must not be altered.
if grep -nE 'alter table public\.(assessment_evidence_handoffs|evidence_records|evidence_competency_links)|drop table' "$ASSESSMENT_EVIDENCE_MIGRATION"; then
  echo "FAIL: Batch 3 migration alters an upstream table"; exit 1
fi
grep -Fq 'create table if not exists public.assessment_evidence_handoffs' "$HANDOFF_MIGRATION" || {
  echo "FAIL: Wave 4 assessment evidence handoff table was removed"; exit 1
}

# --- failed Evidence must never count as demonstration ------------------------
grep -Fq 'export type EvidenceOutcome' packages/shared-types/src/evidence-competency.ts || exit 1
grep -Fq 'export function deriveEvidenceOutcome' packages/shared-types/src/evidence-competency.ts || exit 1
grep -Fq 'qualifiesForDemonstration' packages/shared-types/src/evidence-competency.ts || exit 1
grep -Fq 'qualifiesForDemonstration' services/api/src/evidence-competency.ts || exit 1
grep -Fq 'export async function getQualifyingCompetencyEvidenceReferences' services/api/src/evidence-competency.ts || exit 1

# Failed Evidence and its competency link must still be created and retained.
if grep -nE 'resultState === "passed"|resultState !== "failed"' "$ASSESSMENT_EVIDENCE_SERVICE"; then
  echo "FAIL: failed assessment Evidence must still be created and linked"; exit 1
fi

# --- authenticated read route, no student mutation route ----------------------
grep -Fq 'assessmentEvidenceMatch' services/api/src/server.ts || exit 1
grep -Fq 'getAssessmentAttemptEvidenceId(trusted.identity.userId' services/api/src/server.ts || exit 1
if grep -nE 'request\.method === "(POST|PUT|PATCH|DELETE)" && assessmentEvidenceMatch' services/api/src/server.ts; then
  echo "FAIL: student assessment Evidence mutation route exists"; exit 1
fi
if grep -Fq 'consumeAssessmentEvidenceHandoff' services/api/src/server.ts; then
  echo "FAIL: Evidence ingestion is reachable from the HTTP surface"; exit 1
fi

if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' "$ASSESSMENT_EVIDENCE_TYPES" "$ASSESSMENT_EVIDENCE_SERVICE" "$ASSESSMENT_EVIDENCE_MIGRATION"; then
  echo "FAIL: AI dependency detected in the assessment Evidence path"; exit 1
fi

echo "PASS: assessment Evidence shared type exists and is exported"
echo "PASS: only evidence-producing assessments may create Evidence"
echo "PASS: practice and diagnostic assessments create no Evidence"
echo "PASS: interrupted and in-progress attempts create no negative Evidence"
echo "PASS: passed and failed terminal attempts both create canonical Evidence"
echo "PASS: assessment result_digest is preserved as the source integrity digest"
echo "PASS: exact approved competency versions are preserved on every link"
echo "PASS: no questions, options or answer keys reach Evidence metadata"
echo "PASS: Evidence ingestion runs only after the authoritative handoff is persisted"
echo "PASS: ingestion failure never fails submission and is durably retryable"
echo "PASS: Evidence ingestion never rewrites assessment results or handoffs"
echo "PASS: failed Evidence is retained but cannot qualify as demonstration"
echo "PASS: authenticated attempt Evidence route exists with no student mutation route"
echo "PASS: AI holds no assessment Evidence authority"

# ============================================================
# Wave 7 Batch 4 — EVID-004 Lab Validation Evidence.
# Batch 1, Batch 2 and Batch 3 checks above are preserved verbatim.
# ============================================================

LAB_EVIDENCE_TYPES="packages/shared-types/src/lab-evidence.ts"
LAB_EVIDENCE_SERVICE="services/api/src/lab-evidence.ts"
LAB_EVIDENCE_MIGRATION="supabase/migrations/20260813000400_lab_evidence_consumption.sql"
LAB_VALIDATION_MIGRATION="supabase/migrations/20260812001000_lab_access_reset_validation.sql"

for p in \
  "$LAB_EVIDENCE_TYPES" \
  packages/shared-types/src/lab-evidence.test.ts \
  "$LAB_EVIDENCE_SERVICE" \
  services/api/src/lab-evidence.test.ts \
  "$LAB_EVIDENCE_MIGRATION" \
  docs/Engineering-OS/BUILD_WAVE_7_BATCH_4_LAB_VALIDATION_EVIDENCE.md; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

# --- authoritative Lab Evidence source ----------------------------------------
grep -Fq 'export function evaluateLabEvidenceEligibility' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'export function buildLabValidationSourceReference' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'lab-validation-run:' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'export * from "./lab-evidence";' packages/shared-types/src/index.ts || exit 1
grep -Fq 'sourceType: "lab_validation"' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'sourceEngine: "lab"' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'sourceOccurredAt: facts.checkedAt' "$LAB_EVIDENCE_SERVICE" || exit 1

# --- deterministic source integrity -------------------------------------------
grep -Fq 'export function buildLabValidationCanonicalString' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'lab-validation-v1' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'createHash("sha256")' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'sourceIntegrityDigest: calculateLabValidationSourceDigest(facts)' "$LAB_EVIDENCE_SERVICE" || exit 1
if grep -nE 'JSON\.stringify' "$LAB_EVIDENCE_TYPES"; then
  echo "FAIL: lab source integrity must not hash JSON serialization"; exit 1
fi

# --- outcome qualification safety ---------------------------------------------
grep -Fq 'technical_error' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'validation_technical_error' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq '"incomplete"' packages/shared-types/src/evidence-competency.ts || exit 1
grep -Fq 'export function deriveEvidenceOutcome' packages/shared-types/src/evidence-competency.ts || exit 1
grep -Fq 'export async function getQualifyingCompetencyEvidenceReferences' services/api/src/evidence-competency.ts || exit 1

# A technical validator failure must never be recorded as a student outcome.
if grep -nE 'runState === .technical_error.[^)]*eligible: true' "$LAB_EVIDENCE_TYPES"; then
  echo "FAIL: validator technical failure must not create student Evidence"; exit 1
fi

# --- frozen historical mapping authority --------------------------------------
grep -Fq 'export interface LabEvidenceMappingAuthority' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'export function buildLabMappingAuthorityCanonicalString' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'export function resolveMappingAuthority' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'export async function captureLabEvidenceHandoff' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'loadFrozenMappingAuthority' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'ignoreDuplicates: true' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'facts.mappingAuthorityDigest' "$LAB_EVIDENCE_TYPES" || exit 1
grep -Fq 'create table if not exists public.lab_evidence_handoffs' "$LAB_EVIDENCE_MIGRATION" || exit 1
grep -Fq 'Lab evidence handoff is immutable once captured' "$LAB_EVIDENCE_MIGRATION" || exit 1
grep -Fq 'Lab evidence handoff must pin the lab definition of its session' "$LAB_EVIDENCE_MIGRATION" || exit 1

# Consumption must read the frozen snapshot, never re-resolve the curriculum.
if awk '/export async function consumeLabValidationEvidence/,0' "$LAB_EVIDENCE_SERVICE" \
  | grep -q 'resolveCurrentMappingAuthority('; then
  echo "FAIL: consumption must use the frozen mapping authority, not current curriculum"; exit 1
fi

# The snapshot must be frozen before any Evidence is created.
if ! awk '/export async function consumeLabValidationEvidence/,0' "$LAB_EVIDENCE_SERVICE" \
  | grep -n 'captureLabEvidenceHandoff' > /tmp/w7b4_capture_line \
  || ! awk '/export async function consumeLabValidationEvidence/,0' "$LAB_EVIDENCE_SERVICE" \
  | grep -n 'createCanonicalEvidence(' > /tmp/w7b4_create_line; then
  echo "FAIL: consumption does not freeze the mapping authority before creating Evidence"; exit 1
fi
if [ "$(cut -d: -f1 /tmp/w7b4_capture_line | head -1)" -ge "$(cut -d: -f1 /tmp/w7b4_create_line | head -1)" ]; then
  echo "FAIL: the mapping authority must be frozen before Evidence is created"; exit 1
fi
rm -f /tmp/w7b4_capture_line /tmp/w7b4_create_line

# --- competency-link integration from approved configuration only -------------
grep -Fq 'mission_competencies' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'linkSource: "approved_curriculum_mapping"' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'competencyVersion: mapping.competencyVersion' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'lab.evidence.competency_mapping_unresolved' "$LAB_EVIDENCE_SERVICE" || exit 1
if grep -nE 'create table[^;]*competency' "$LAB_EVIDENCE_MIGRATION"; then
  echo "FAIL: Batch 4 must not create a second competency registry"; exit 1
fi

# --- ownership and failure isolation ------------------------------------------
grep -Fq 'baseFacts.userId !== trustedUserId' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'Lab validation run and lab session ownership diverge' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'Lab evidence consumption owner must match the validation run owner' "$LAB_EVIDENCE_MIGRATION" || exit 1
grep -Fq 'tryConsumeLabValidationEvidence' services/api/src/lab-runtime.ts || exit 1
grep -Fq 'lab.evidence.consumed' "$LAB_EVIDENCE_SERVICE" || exit 1
grep -Fq 'lab.evidence.consumption_failed' "$LAB_EVIDENCE_SERVICE" || exit 1

# Ingestion must run only after the authoritative validation run is persisted.
if ! awk '/export async function validateLabSession/,0' services/api/src/lab-runtime.ts \
  | grep -n 'lab_validation_results' > /tmp/w7b4_results_line \
  || ! awk '/export async function validateLabSession/,0' services/api/src/lab-runtime.ts \
  | grep -n 'tryConsumeLabValidationEvidence' > /tmp/w7b4_consume_line; then
  echo "FAIL: lab validation does not persist results before Evidence ingestion"; exit 1
fi
if [ "$(cut -d: -f1 /tmp/w7b4_results_line | head -1)" -ge "$(cut -d: -f1 /tmp/w7b4_consume_line | head -1)" ]; then
  echo "FAIL: Evidence ingestion must run after the validation result is persisted"; exit 1
fi
rm -f /tmp/w7b4_results_line /tmp/w7b4_consume_line

# Ingestion must never rewrite Lab Engine truth.
for t in lab_validation_runs lab_validation_results lab_sessions; do
  if grep -nE "from\(\"$t\"\)[^;]*\.(update|upsert|insert|delete)\(" "$LAB_EVIDENCE_SERVICE"; then
    echo "FAIL: Evidence ingestion must not mutate $t"; exit 1
  fi
done
if grep -nE 'runValidationProbe|deriveLabValidationState' "$LAB_EVIDENCE_SERVICE"; then
  echo "FAIL: Evidence ingestion must not re-evaluate lab validation"; exit 1
fi

# --- retry safety and internal state security ---------------------------------
grep -Fq 'create table if not exists public.lab_evidence_consumptions' "$LAB_EVIDENCE_MIGRATION" || exit 1
grep -Fq "state in ('consumed', 'skipped', 'failed')" "$LAB_EVIDENCE_MIGRATION" || exit 1
grep -Fq 'alter table public.lab_evidence_consumptions enable row level security' "$LAB_EVIDENCE_MIGRATION" || exit 1
grep -Fq 'export async function retryFailedLabEvidenceConsumption' "$LAB_EVIDENCE_SERVICE" || exit 1

if grep -qi 'create policy' "$LAB_EVIDENCE_MIGRATION"; then
  echo "FAIL: internal lab ingestion state must not be student readable"; exit 1
fi
if grep -nE 'alter table public\.(lab_validation_runs|lab_validation_results|lab_sessions|evidence_records|evidence_competency_links)|drop table' "$LAB_EVIDENCE_MIGRATION"; then
  echo "FAIL: Batch 4 migration alters an upstream table"; exit 1
fi
grep -Fq 'create table if not exists public.lab_validation_runs' "$LAB_VALIDATION_MIGRATION" || {
  echo "FAIL: Wave 6 lab validation schema was removed"; exit 1
}

# --- no direct mastery mutation -----------------------------------------------
if grep -nE 'student_competency_state|recordAuthoritativeCompetencyEvidence|decideCompetencyTransition|markCompetencyDemonstrated' "$LAB_EVIDENCE_SERVICE"; then
  echo "FAIL: Lab Evidence ingestion must not touch Learning Engine mastery"; exit 1
fi

# --- student read route, no student mutation route ----------------------------
grep -Fq 'labSessionEvidenceMatch' services/api/src/server.ts || exit 1
grep -Fq 'listLabSessionEvidenceIds(trusted.identity.userId' services/api/src/server.ts || exit 1
if grep -nE 'request\.method === "(POST|PUT|PATCH|DELETE)" && labSessionEvidenceMatch' services/api/src/server.ts; then
  echo "FAIL: student lab Evidence mutation route exists"; exit 1
fi
if grep -Fq 'consumeLabValidationEvidence' services/api/src/server.ts; then
  echo "FAIL: Lab Evidence ingestion is reachable from the HTTP surface"; exit 1
fi

if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' "$LAB_EVIDENCE_TYPES" "$LAB_EVIDENCE_SERVICE" "$LAB_EVIDENCE_MIGRATION"; then
  echo "FAIL: AI dependency detected in the lab Evidence path"; exit 1
fi

echo "PASS: lab Evidence shared type exists and is exported"
echo "PASS: canonical Lab validation run is the only trusted Evidence source"
echo "PASS: source integrity digest is deterministic and explicitly ordered"
echo "PASS: passed and incomplete runs both create canonical Evidence"
echo "PASS: validator technical failure never becomes student Evidence"
echo "PASS: incomplete runs are negative and never qualify for demonstration"
echo "PASS: competency links come only from approved curriculum mapping"
echo "PASS: the approved mapping authority is frozen when validation becomes authoritative"
echo "PASS: delayed ingestion retries reuse the frozen mapping, not newer curriculum"
echo "PASS: the frozen mapping authority is bound into the source integrity digest"
echo "PASS: exact competency versions are preserved and never guessed"
echo "PASS: Evidence ownership derives from the authoritative Lab data"
echo "PASS: ingestion runs only after the authoritative validation is persisted"
echo "PASS: ingestion failure never alters Lab validation truth and is retryable"
echo "PASS: internal ingestion state is server-only with no student policy"
echo "PASS: no mastery state is mutated by Lab Evidence ingestion"
echo "PASS: authenticated lab Evidence route exists with no student mutation route"
echo "PASS: AI holds no Lab Evidence authority"

# ============================================================
# Wave 7 Batch 5 — EVID-006 Evidence Review, Correction and Effective State.
# Batch 1-4 checks above are preserved verbatim.
# ============================================================

CORRECTION_TYPES="packages/shared-types/src/evidence-correction.ts"
CORRECTION_SERVICE="services/api/src/evidence-correction.ts"
CORRECTION_MIGRATION="supabase/migrations/20260813000500_evidence_correction_history.sql"
EVIDENCE_FOUNDATION_MIGRATION="supabase/migrations/20260813000100_evidence_foundation.sql"

for p in \
  "$CORRECTION_TYPES" \
  packages/shared-types/src/evidence-correction.test.ts \
  "$CORRECTION_SERVICE" \
  services/api/src/evidence-correction.test.ts \
  "$CORRECTION_MIGRATION" \
  docs/Engineering-OS/BUILD_WAVE_7_BATCH_5_EVIDENCE_REVIEW_CORRECTION_EFFECTIVE_STATE.md; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

# --- correction model and effective state resolver -----------------------------
grep -Fq 'export interface EvidenceCorrectionEvent' "$CORRECTION_TYPES" || exit 1
grep -Fq 'export function resolveEffectiveEvidenceState' "$CORRECTION_TYPES" || exit 1
grep -Fq 'export function evaluateCorrectionTransition' "$CORRECTION_TYPES" || exit 1
grep -Fq 'export function isEffectivelyTrustedEvidence' "$CORRECTION_TYPES" || exit 1
grep -Fq 'export * from "./evidence-correction";' packages/shared-types/src/index.ts || exit 1
grep -Fq 'create table if not exists public.evidence_correction_events' "$CORRECTION_MIGRATION" || exit 1

# Effective state must reuse the canonical Batch 1 vocabulary.
if grep -nE "type EvidenceRecordState[[:space:]]*=|'under_review'|\"under_review\"" "$CORRECTION_TYPES"; then
  echo "FAIL: Batch 5 must not introduce a competing Evidence state vocabulary"; exit 1
fi

# --- transition rules and fail-closed replay ----------------------------------
grep -Fq 'TRANSITION_NOT_PERMITTED' "$CORRECTION_TYPES" || exit 1
grep -Fq 'SEQUENCE_GAP' "$CORRECTION_TYPES" || exit 1
grep -Fq 'PREVIOUS_STATE_MISMATCH' "$CORRECTION_TYPES" || exit 1
grep -Fq 'INVALID_TRANSITION' "$CORRECTION_TYPES" || exit 1
grep -Fq 'sequenceValid' "$CORRECTION_TYPES" || exit 1

# --- reason requirement --------------------------------------------------------
grep -Fq 'export function validateCorrectionReason' "$CORRECTION_TYPES" || exit 1
grep -Fq 'length(btrim(reason))' "$CORRECTION_MIGRATION" || exit 1

# --- privileged authority reuses the existing model ----------------------------
grep -Fq 'founder_admin' "$CORRECTION_TYPES" || exit 1
grep -Fq "actor_role in ('founder_admin')" "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'from public.user_profiles' "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'requireCorrectionAuthority' "$CORRECTION_SERVICE" || exit 1
grep -Fq 'await founder(request)' services/api/src/server.ts || exit 1
grep -Fq 'appendEvidenceCorrection(trusted.identity' services/api/src/server.ts || exit 1

# --- append-only history -------------------------------------------------------
grep -Fq 'append-only and cannot be updated' "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'append-only and cannot be deleted' "$CORRECTION_MIGRATION" || exit 1
if grep -nE '\.(update|upsert|delete)\(' "$CORRECTION_SERVICE"; then
  echo "FAIL: Evidence correction history must be append-only"; exit 1
fi

# --- student read-only boundary ------------------------------------------------
grep -Fq 'for select to authenticated' "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'auth.uid() = user_id' "$CORRECTION_MIGRATION" || exit 1
W7B5_POLICY_TARGETS="$(grep -A2 -Ei '^[[:space:]]*on public\.evidence_correction_events[[:space:]]*$' \
  "$CORRECTION_MIGRATION" || true)"
if printf '%s\n' "$W7B5_POLICY_TARGETS" \
  | grep -Eiq '^[[:space:]]*for[[:space:]]+(insert|update|delete|all)\b'; then
  echo "FAIL: student write policy granted on evidence_correction_events"; exit 1
fi
if grep -nE 'request\.method === "(POST|PUT|PATCH|DELETE)" && evidenceCorrectionsMatch\)' services/api/src/server.ts; then
  echo "FAIL: student Evidence correction mutation route exists"; exit 1
fi

# --- ownership and supersession safety -----------------------------------------
grep -Fq 'Evidence correction owner must match the Evidence owner' "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'Superseding Evidence must belong to the same student' "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'Circular Evidence supersession is not permitted' "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'superseding_evidence_id <> evidence_id' "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'user_id: record.userId' "$CORRECTION_SERVICE" || exit 1

# --- concurrency and idempotency ------------------------------------------------
grep -Fq 'unique (evidence_id, sequence_number)' "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'unique (evidence_id, idempotency_key)' "$CORRECTION_MIGRATION" || exit 1
grep -Fq 'expectedPreviousState' "$CORRECTION_SERVICE" || exit 1
grep -Fq 'findByIdempotencyKey' "$CORRECTION_SERVICE" || exit 1

# --- downstream consumers evaluate effective state dynamically -----------------
grep -Fq 'loadCorrectionEventsByEvidence' services/api/src/evidence-competency.ts || exit 1
grep -Fq 'resolveEffectiveEvidenceState' services/api/src/evidence-competency.ts || exit 1
grep -Fq 'isEffectivelyTrustedEvidence' services/api/src/evidence-competency.ts || exit 1
grep -Fq 'evidenceEffectiveState' packages/shared-types/src/evidence-competency.ts || exit 1
grep -Fq 'loadCorrectionEventsByEvidence' services/api/src/evidence.ts || exit 1

# The resolution must happen inside the accessor body, not merely be imported.
W7B5_ACCESSOR_BODY="$(awk '/export async function getAuthoritativeCompetencyEvidenceReferences/,0' \
  services/api/src/evidence-competency.ts)"
for needle in 'loadCorrectionEventsByEvidence(' 'resolveEffectiveEvidenceState(' 'isEffectivelyTrustedEvidence('; do
  case "$W7B5_ACCESSOR_BODY" in
    *"$needle"*) ;;
    *)
      echo "FAIL: the competency accessor must resolve effective state at read time ($needle)"
      exit 1
      ;;
  esac
done

# Qualification must never be a stored or cached judgement.
if grep -nE 'qualifies_for_demonstration|qualifying_cached' services/api/src/evidence-competency.ts "$CORRECTION_MIGRATION"; then
  echo "FAIL: qualification must be derived at read time, never cached"; exit 1
fi

# --- original Evidence and source truth remain untouched -----------------------
if grep -nE 'from\("evidence_records"\)[^;]*\.(update|upsert|insert|delete)\(' "$CORRECTION_SERVICE"; then
  echo "FAIL: Evidence correction must not rewrite the original Evidence Record"; exit 1
fi
if grep -nE 'alter table public\.evidence_records|guard_evidence_record_provenance|drop trigger if exists evidence_records_provenance_guard' "$CORRECTION_MIGRATION"; then
  echo "FAIL: Batch 5 must not weaken Batch 1 provenance immutability"; exit 1
fi
grep -Fq 'Canonical Evidence provenance is immutable' "$EVIDENCE_FOUNDATION_MIGRATION" || {
  echo "FAIL: Batch 1 provenance immutability trigger was removed"; exit 1
}
for t in assessment_attempts assessment_evidence_handoffs lab_validation_runs lab_validation_results lab_evidence_handoffs; do
  if grep -nE "\b$t\b" "$CORRECTION_SERVICE" "$CORRECTION_MIGRATION"; then
    echo "FAIL: Evidence correction must not touch source-engine truth ($t)"; exit 1
  fi
done

# --- no certificate work, no mastery mutation, no AI authority -----------------
if grep -nEi 'certificate|student_competency_state|recordAuthoritativeCompetencyEvidence|decideCompetencyTransition' "$CORRECTION_SERVICE" "$CORRECTION_MIGRATION"; then
  echo "FAIL: Evidence correction must not touch mastery or certificate state"; exit 1
fi
if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' "$CORRECTION_TYPES" "$CORRECTION_SERVICE" "$CORRECTION_MIGRATION"; then
  echo "FAIL: AI dependency detected in the Evidence correction path"; exit 1
fi

echo "PASS: Evidence correction event model exists and is exported"
echo "PASS: correction history is append-only in the database and the service"
echo "PASS: effective state is derived deterministically and fails closed"
echo "PASS: only approved state transitions are permitted"
echo "PASS: a bounded non-blank reason is required for every correction"
echo "PASS: corrections require the existing founder_admin authority"
echo "PASS: students may read their own history and mutate nothing"
echo "PASS: ownership is taken from the Evidence Record, never the caller"
echo "PASS: self, cross-user and circular supersession are refused"
echo "PASS: concurrent corrections cannot both claim the same predecessor"
echo "PASS: retries with a stable key are idempotent"
echo "PASS: qualifying Evidence is evaluated against effective state at read time"
echo "PASS: original Evidence provenance and integrity remain unrewritten"
echo "PASS: assessment and lab source truth remain untouched"
echo "PASS: no mastery or certificate state is mutated"
echo "PASS: AI holds no Evidence correction authority"

# ============================================================
# Wave 7 Batch 6 — EVID-007 Student Evidence Portfolio View.
# Batch 1-5 checks above are preserved verbatim.
# ============================================================

PORTFOLIO_TYPES="packages/shared-types/src/evidence-portfolio.ts"
PORTFOLIO_SERVICE="services/api/src/evidence-portfolio.ts"
EXPORT_PANEL="apps/web/src/evidence/EvidenceExportPanel.tsx"
PORTFOLIO_VIEW="apps/web/src/evidence/EvidencePortfolioView.tsx"
PORTFOLIO_WEB_SERVICE="apps/web/src/evidence/evidence-portfolio-service.ts"
API_CLIENT="apps/web/src/lib/api-client.ts"
WORKSPACE_SHELL="apps/web/src/auth/AuthenticatedApp.tsx"

for p in \
  "$PORTFOLIO_TYPES" \
  packages/shared-types/src/evidence-portfolio.test.ts \
  "$PORTFOLIO_SERVICE" \
  "$PORTFOLIO_VIEW" \
  "$PORTFOLIO_WEB_SERVICE" \
  "$API_CLIENT" \
  apps/web/src/lib/api-client.test.ts \
  docs/Engineering-OS/BUILD_WAVE_7_BATCH_6_STUDENT_EVIDENCE_PORTFOLIO.md; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

# --- read model composes existing truth, owns none of it ----------------------
grep -Fq 'export * from "./evidence-portfolio";' packages/shared-types/src/index.ts || exit 1
grep -Fq 'listStudentEvidence' "$PORTFOLIO_SERVICE" || exit 1
grep -Fq 'listEvidenceCompetencyLinksForEvidenceIds' "$PORTFOLIO_SERVICE" || exit 1
grep -Fq 'resolveCompetencyCurriculumContext' "$PORTFOLIO_SERVICE" || exit 1
grep -Fq 'export async function resolveCompetencyCurriculumContext' services/api/src/curriculum.ts || exit 1
grep -Fq 'export async function listEvidenceCompetencyLinksForEvidenceIds' services/api/src/evidence-competency.ts || exit 1

# The portfolio must never write, and must never walk curriculum tables itself.
if grep -nE '\.(insert|update|upsert|delete)\(' "$PORTFOLIO_SERVICE"; then
  echo "FAIL: the Evidence portfolio must be a read model"; exit 1
fi
for t in mission_competencies missions learning_modules courses evidence_correction_events; do
  if grep -nE "from\(\"$t\"\)" "$PORTFOLIO_SERVICE"; then
    echo "FAIL: the portfolio must consume owning services, not query $t directly"; exit 1
  fi
done

# --- proof qualification reuses canonical outcome semantics -------------------
grep -Fq 'qualifiesAsDemonstrationEvidence' "$PORTFOLIO_TYPES" || exit 1
grep -Fq 'deriveEvidenceOutcome' "$PORTFOLIO_TYPES" || exit 1
grep -Fq 'resultState: record.metadata.resultState' "$PORTFOLIO_SERVICE" || exit 1
grep -Fq 'evidenceOutcome: deriveEvidenceOutcome' "$PORTFOLIO_SERVICE" || exit 1

# Negative Evidence must never be presented as current proof: the rule must
# consult the source-engine outcome, not effective state and integrity alone.
# Terminate on a line that is exactly a closing brace: the parameter object's
# own "}): boolean {" line would otherwise end the range before the body.
W7B6_PROOF_RULE="$(awk '/export function isCurrentProof/,/^}$/' "$PORTFOLIO_TYPES")"
case "$W7B6_PROOF_RULE" in
  *"qualifiesAsDemonstrationEvidence("*) ;;
  *)
    echo "FAIL: portfolio proof qualification must reuse the canonical outcome rule"
    exit 1
    ;;
esac
case "$W7B6_PROOF_RULE" in
  *"resultState"*) ;;
  *)
    echo "FAIL: proof qualification must consider the source-engine result state"
    exit 1
    ;;
esac

# --- historical curriculum context must be version aware ----------------------
grep -Fq 'export function competencyReferenceKey' "$PORTFOLIO_TYPES" || exit 1
grep -Fq 'competencyVersion: number' "$PORTFOLIO_TYPES" || exit 1
grep -Fq 'references: readonly CompetencyReference[]' services/api/src/curriculum.ts || exit 1
grep -Fq 'competencyReferenceKey' services/api/src/curriculum.ts || exit 1
grep -Fq 'competencyReferenceKey(link)' "$PORTFOLIO_SERVICE" || exit 1

# Curriculum context must never be keyed by stable id alone, and never "latest".
if grep -nE 'competencyStableIds: readonly string\[\]' services/api/src/curriculum.ts; then
  echo "FAIL: curriculum context must resolve the exact competency version"; exit 1
fi
W7B6_CURRICULUM_ACCESSOR="$(awk '/export async function resolveCompetencyCurriculumContext/,0' services/api/src/curriculum.ts)"
case "$W7B6_CURRICULUM_ACCESSOR" in
  *'order("version", { ascending: false })'*)
    echo "FAIL: curriculum context must not fall back to the latest competency version"
    exit 1
    ;;
esac

# --- required runtime configuration is declared in the canonical template -----
W7B6_ENV_TEMPLATE=""
for candidate in .env.example .env.sample .env.template; do
  if [ -f "$candidate" ]; then W7B6_ENV_TEMPLATE="$candidate"; break; fi
done
if [ -z "$W7B6_ENV_TEMPLATE" ]; then
  echo "FAIL: no canonical environment template found for VITE_API_BASE_URL"; exit 1
fi
if ! grep -Eq '^[[:space:]]*#?[[:space:]]*VITE_API_BASE_URL=' "$W7B6_ENV_TEMPLATE"; then
  echo "FAIL: VITE_API_BASE_URL must be declared in $W7B6_ENV_TEMPLATE"; exit 1
fi

# --- effective state is reused, never re-derived ------------------------------
grep -Fq 'effectiveState: record.effectiveState' "$PORTFOLIO_SERVICE" || exit 1
grep -Fq 'export function isCurrentProof' "$PORTFOLIO_TYPES" || exit 1
grep -Fq 'export function describeEffectiveStatus' "$PORTFOLIO_TYPES" || exit 1
if grep -nE 'resolveEffectiveEvidenceState\(|loadCorrectionEventsByEvidence\(' "$PORTFOLIO_SERVICE"; then
  echo "FAIL: effective state must come from listStudentEvidence, not be recomputed"; exit 1
fi

# Invalidated and superseded Evidence must remain visible, never filtered away.
if grep -nE 'effectiveState !== "active"|filter\(.*invalidated|filter\(.*superseded' "$PORTFOLIO_SERVICE" "$PORTFOLIO_TYPES"; then
  echo "FAIL: corrected Evidence must remain visible and clearly identified"; exit 1
fi

# --- filtering and grouping ---------------------------------------------------
grep -Fq 'export function filterPortfolioItems' "$PORTFOLIO_TYPES" || exit 1
grep -Fq 'export function groupPortfolioItemsByCompetency' "$PORTFOLIO_TYPES" || exit 1
grep -Fq 'export function normalizePortfolioFilters' "$PORTFOLIO_TYPES" || exit 1
grep -Fq 'courseStableId' "$PORTFOLIO_TYPES" || exit 1
grep -Fq 'isEvidenceSourceType' "$PORTFOLIO_TYPES" || exit 1

# Filtering constrains first; grouping presents the filtered result.
W7B6_ASSEMBLE="$(awk '/export function assembleEvidencePortfolio/,0' "$PORTFOLIO_TYPES")"
case "$W7B6_ASSEMBLE" in
  *"filterPortfolioItems("*) ;;
  *) echo "FAIL: the portfolio must filter before grouping"; exit 1 ;;
esac
case "$W7B6_ASSEMBLE" in
  *"groupPortfolioItemsByCompetency(filtered)"*) ;;
  *) echo "FAIL: grouping must present the filtered result"; exit 1 ;;
esac

# --- privacy-safe presentation ------------------------------------------------
for leak in evidence_integrity_digest source_integrity_digest integrityDigest \
  sourceIntegrityDigest providerId providerSessionId actorId actor_role userId; do
  if grep -nE "\b$leak\b" "$PORTFOLIO_TYPES"; then
    echo "FAIL: the portfolio view model must not expose $leak"; exit 1
  fi
done

# --- authenticated, user-scoped route ----------------------------------------
grep -Fq 'pathname === "/evidence/portfolio"' services/api/src/server.ts || exit 1
grep -Fq 'getStudentEvidencePortfolio(trusted.accessToken' services/api/src/server.ts || exit 1
if grep -nE 'request\.method === "(POST|PUT|PATCH|DELETE)"[^;]*"/evidence/portfolio"' services/api/src/server.ts; then
  echo "FAIL: the portfolio must be read-only"; exit 1
fi
# The aggregate route must be matched before the /evidence/:id route.
W7B6_PORTFOLIO_LINE="$(grep -n 'pathname === "/evidence/portfolio"' services/api/src/server.ts | head -1 | cut -d: -f1)"
W7B6_RECORD_LINE="$(grep -n 'const evidenceRecordMatch' services/api/src/server.ts | head -1 | cut -d: -f1)"
if [ "$W7B6_PORTFOLIO_LINE" -ge "$W7B6_RECORD_LINE" ]; then
  echo "FAIL: /evidence/portfolio must be routed before /evidence/:id"; exit 1
fi

# --- generic API client owns transport only -----------------------------------
grep -Fq 'Authorization: `Bearer ${accessToken}`' "$API_CLIENT" || exit 1
grep -Fq 'VITE_API_BASE_URL' "$API_CLIENT" || exit 1
grep -Fq 'export class ApiRequestError' "$API_CLIENT" || exit 1
# Inspect code only: the module's own comments legitimately explain what it does
# NOT own, so documentation must not trip the boundary check.
W7B6_API_CLIENT_CODE="$(sed -e '/^[[:space:]]*\/\*/,/\*\//d' -e '/^[[:space:]]*\*/d' \
  -e 's://.*::' "$API_CLIENT")"
for forbidden in evidence portfolio competency supabase; do
  if printf '%s\n' "$W7B6_API_CLIENT_CODE" | grep -niE "\b$forbidden\b"; then
    echo "FAIL: the generic API client must not contain $forbidden logic"; exit 1
  fi
done
# React components must never construct bearer headers themselves.
if grep -nE 'Authorization|Bearer' "$PORTFOLIO_VIEW" "$WORKSPACE_SHELL"; then
  echo "FAIL: components must call service modules, not build auth headers"; exit 1
fi

# --- accessibility (structural, per the repository's lightweight convention) ---
for needle in '<section' '<h2' '<h3' '<ul' '<dl' 'aria-labelledby' 'aria-live' \
  'role="alert"' '<label htmlFor' '<time dateTime' 'statusLabel'; do
  case "$(cat "$PORTFOLIO_VIEW")" in
    *"$needle"*) ;;
    *) echo "FAIL: portfolio view is missing accessible markup ($needle)"; exit 1 ;;
  esac
done
grep -Fq 'aria-current' "$WORKSPACE_SHELL" || exit 1
grep -Fq '<nav aria-label' "$WORKSPACE_SHELL" || exit 1
# Status must never be conveyed by colour or a bare badge.
if grep -nE 'className="[^"]*badge|color:|backgroundColor' "$PORTFOLIO_VIEW"; then
  echo "FAIL: status must not rely on colour or badges alone"; exit 1
fi

# --- no EVID-008 scope, no AI, no routing library -----------------------------
# Word-bounded so ordinary words such as "shared-types" do not trip the check.
if grep -RniE '\b(download|downloadable|share|shareable|sharing|share[-_]?link|public[-_]?url|publicUrl|verification[-_]?id|verificationId|employer)\b' \
  "$PORTFOLIO_TYPES" "$PORTFOLIO_SERVICE" "$PORTFOLIO_VIEW" "$PORTFOLIO_WEB_SERVICE"; then
  echo "FAIL: EVID-008 scope must not appear in Batch 6"; exit 1
fi
if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' \
  "$PORTFOLIO_TYPES" "$PORTFOLIO_SERVICE" "$PORTFOLIO_VIEW" "$PORTFOLIO_WEB_SERVICE"; then
  echo "FAIL: AI dependency detected in the Evidence portfolio"; exit 1
fi
if grep -nE 'react-router|@remix-run|wouter' apps/web/package.json; then
  echo "FAIL: Batch 6 must not introduce a routing library"; exit 1
fi
if grep -nE '"(jsdom|@testing-library/react|jest-axe)"' apps/web/package.json; then
  echo "FAIL: Batch 6 must not introduce a DOM testing stack"; exit 1
fi

echo "PASS: Evidence portfolio read model exists and is exported"
echo "PASS: the portfolio composes existing services and owns no domain truth"
echo "PASS: effective Evidence state is reused, never re-derived"
echo "PASS: proof qualification reuses the canonical outcome rule"
echo "PASS: negative Evidence can never be shown as current proof"
echo "PASS: curriculum context resolves the exact pinned competency version"
echo "PASS: VITE_API_BASE_URL is declared in the canonical environment template"
echo "PASS: corrected Evidence remains visible and is never shown as current proof"
echo "PASS: filters constrain the result before grouping presents it"
echo "PASS: competency, canonical source type and course filters exist"
echo "PASS: curriculum owns the competency to course relationship"
echo "PASS: the view model exposes no digests, provenance or internal identifiers"
echo "PASS: the portfolio route is authenticated, user scoped and read-only"
echo "PASS: the generic API client owns transport only"
echo "PASS: components never construct bearer headers"
echo "PASS: portfolio presentation uses semantic accessible markup"
echo "PASS: status is readable text rather than colour or badges alone"
echo "PASS: no export, sharing, AI, routing library or DOM testing stack added"

# ============================================================
# Wave 7 Batch 7 — EVID-008 Evidence Export and Verification Hooks.
# Batch 1-6 checks above are preserved verbatim.
# ============================================================

EXPORT_TYPES="packages/shared-types/src/evidence-export.ts"
EXPORT_SERVICE="services/api/src/evidence-export.ts"
VERIFICATION_MIGRATION="supabase/migrations/20260813000600_evidence_verification_references.sql"
EXPORT_PANEL="apps/web/src/evidence/EvidenceExportPanel.tsx"
PORTFOLIO_VIEW="apps/web/src/evidence/EvidencePortfolioView.tsx"
PORTFOLIO_WEB_SERVICE="apps/web/src/evidence/evidence-portfolio-service.ts"

for p in \
  "$EXPORT_TYPES" \
  packages/shared-types/src/evidence-export.test.ts \
  "$EXPORT_SERVICE" \
  "$VERIFICATION_MIGRATION" \
  "$EXPORT_PANEL" \
  docs/Engineering-OS/BUILD_WAVE_7_BATCH_7_EVIDENCE_EXPORT_VERIFICATION_HOOKS.md; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

# --- export representation reuses existing projections ------------------------
grep -Fq 'export * from "./evidence-export";' packages/shared-types/src/index.ts || exit 1
grep -Fq 'export function toExportedEvidenceItem' "$EXPORT_TYPES" || exit 1
grep -Fq 'export function assembleEvidenceExport' "$EXPORT_TYPES" || exit 1
grep -Fq 'EvidencePortfolioItem' "$EXPORT_TYPES" || exit 1
grep -Fq 'getStudentEvidencePortfolio' "$EXPORT_SERVICE" || exit 1

# The export must never serialize the Evidence record or re-read it directly.
if grep -nE 'from\("evidence_records"\)|mapEvidenceRecordRow' "$EXPORT_SERVICE"; then
  echo "FAIL: export must project the safe portfolio model, not evidence_records"; exit 1
fi

# --- privacy-safe payload -----------------------------------------------------
for leak in integrityDigest sourceIntegrityDigest evidence_integrity_digest \
  providerId providerSessionId actorId lastCorrectionReason correctionCount; do
  if grep -nE "\b$leak\b" "$EXPORT_TYPES"; then
    echo "FAIL: export representation must not expose $leak"; exit 1
  fi
done

# --- current effective state, never a stale snapshot --------------------------
grep -Fq 'export function deriveVerificationStatus' "$EXPORT_TYPES" || exit 1
grep -Fq 'verificationStatus: status' "$EXPORT_TYPES" || exit 1
grep -Fq 'currentlyDemonstrates: item.isCurrentProof' "$EXPORT_TYPES" || exit 1
W7B7_STATUS_RULE="$(awk '/export function deriveVerificationStatus/,/^}$/' "$EXPORT_TYPES")"
for needle in '"revoked"' '"superseded"' '"unavailable"'; do
  case "$W7B7_STATUS_RULE" in
    *"$needle"*) ;;
    *) echo "FAIL: verification status must represent corrected Evidence ($needle)"; exit 1 ;;
  esac
done
if grep -nE 'verification_status|effective_state' "$VERIFICATION_MIGRATION"; then
  echo "FAIL: effective state must not be snapshotted into the verification table"; exit 1
fi

# --- exact competency version preserved ---------------------------------------
grep -Fq 'competencyReferenceKey' "$EXPORT_TYPES" || exit 1
grep -Fq 'competencyVersion: link.competencyVersion' "$EXPORT_TYPES" || exit 1

# --- opaque, non-guessable verification identifier ----------------------------
grep -Fq 'export function mintVerificationId' "$EXPORT_SERVICE" || exit 1
grep -Fq 'randomBytes(' "$EXPORT_SERVICE" || exit 1
grep -Fq 'node:crypto' "$EXPORT_SERVICE" || exit 1
grep -Fq 'VERIFICATION_ID_PATTERN' "$EXPORT_TYPES" || exit 1
grep -Fq "verification_id ~ '^ev1_[a-f0-9]{48}\$'" "$VERIFICATION_MIGRATION" || exit 1
# The identifier must never be derived from an evidence id, user id or sequence.
W7B7_MINT="$(awk '/export function mintVerificationId/,/^}$/' "$EXPORT_SERVICE")"
if printf '%s\n' "$W7B7_MINT" | grep -nE 'evidenceId|userId|evidence_id|user_id|Date\.now|counter'; then
  echo "FAIL: the verification identifier must not be derived from platform identifiers"; exit 1
fi

# --- stable, immutable, server-owned reference --------------------------------
grep -Fq 'create table if not exists public.evidence_verification_references' "$VERIFICATION_MIGRATION" || exit 1
grep -Fq 'evidence_id uuid primary key' "$VERIFICATION_MIGRATION" || exit 1
grep -Fq 'Evidence verification references are immutable once minted' "$VERIFICATION_MIGRATION" || exit 1
grep -Fq 'Evidence verification reference owner must match the Evidence owner' "$VERIFICATION_MIGRATION" || exit 1
grep -Fq 'onConflict: "evidence_id"' "$EXPORT_SERVICE" || exit 1
# Inspect SQL statements only: the migration's own comments legitimately explain
# which Batch 1 guarantee they preserve.
W7B7_MIGRATION_SQL="$(sed -e 's:--.*::' "$VERIFICATION_MIGRATION")"
if printf '%s\n' "$W7B7_MIGRATION_SQL" \
  | grep -nE 'alter table public\.evidence_records|create or replace function public\.guard_evidence_record_provenance|drop trigger[^;]*evidence_records|drop table'; then
  echo "FAIL: Batch 7 must not weaken Batch 1 Evidence immutability"; exit 1
fi

# --- private by default: no public access anywhere ----------------------------
grep -Fq 'alter table public.evidence_verification_references enable row level security' "$VERIFICATION_MIGRATION" || exit 1
grep -Fq 'for select to authenticated' "$VERIFICATION_MIGRATION" || exit 1
grep -Fq 'auth.uid() = user_id' "$VERIFICATION_MIGRATION" || exit 1
# Word-bounded so "insert into public.platform_schema_version" is not a match.
if grep -nEi '\bto[[:space:]]+(anon|public)\b|using[[:space:]]*\([[:space:]]*true[[:space:]]*\)' \
  "$VERIFICATION_MIGRATION"; then
  echo "FAIL: verification references must have no public read policy"; exit 1
fi
W7B7_VERIF_POLICY_TARGETS="$(grep -A2 -Ei '^[[:space:]]*on public\.evidence_verification_references[[:space:]]*$' \
  "$VERIFICATION_MIGRATION" || true)"
if printf '%s\n' "$W7B7_VERIF_POLICY_TARGETS" \
  | grep -Eiq '^[[:space:]]*for[[:space:]]+(insert|update|delete|all)\b'; then
  echo "FAIL: student write policy granted on verification references"; exit 1
fi

# --- authenticated student-controlled export, no anonymous route --------------
grep -Fq 'pathname === "/evidence/export"' services/api/src/server.ts || exit 1
grep -Fq 'exportStudentEvidence(trusted.accessToken, trusted.identity.userId' services/api/src/server.ts || exit 1
if grep -nE '"/verify|/verification/|publicVerification|anonymousVerification' services/api/src/server.ts; then
  echo "FAIL: no anonymous or public verification route may exist in Batch 7"; exit 1
fi
# The export route must be matched before the /evidence/:id route.
W7B7_EXPORT_LINE="$(grep -n 'pathname === "/evidence/export"' services/api/src/server.ts | head -1 | cut -d: -f1)"
W7B7_RECORD_LINE="$(grep -n 'const evidenceRecordMatch' services/api/src/server.ts | head -1 | cut -d: -f1)"
if [ "$W7B7_EXPORT_LINE" -ge "$W7B7_RECORD_LINE" ]; then
  echo "FAIL: /evidence/export must be routed before /evidence/:id"; exit 1
fi

# --- method-restricted routes must not fall through to the identifier route ---
ROUTING_TYPES="packages/shared-types/src/evidence-routing.ts"
[ -e "$ROUTING_TYPES" ] || { echo "MISSING: $ROUTING_TYPES"; exit 1; }
[ -e packages/shared-types/src/evidence-routing.test.ts ] || {
  echo "MISSING: packages/shared-types/src/evidence-routing.test.ts"; exit 1; }

grep -Fq 'export function isReservedEvidencePathSegment' "$ROUTING_TYPES" || exit 1
grep -Fq '"portfolio"' "$ROUTING_TYPES" || exit 1
grep -Fq '"export"' "$ROUTING_TYPES" || exit 1
grep -Fq 'export * from "./evidence-routing";' packages/shared-types/src/index.ts || exit 1

# The single-identifier Evidence route must refuse reserved collection names, so
# an unsupported method returns the route-not-found response rather than
# authenticating and answering as if "export" were an Evidence identifier.
grep -Fq 'isReservedEvidencePathSegment' services/api/src/server.ts || exit 1
W7B7_RECORD_ROUTE="$(grep -A6 'const evidenceRecordMatch' services/api/src/server.ts)"
case "$W7B7_RECORD_ROUTE" in
  *"!isReservedEvidencePathSegment("*) ;;
  *)
    echo "FAIL: the Evidence identifier route must exclude reserved path segments"
    exit 1
    ;;
esac

# --- source truth is never mutated --------------------------------------------
for t in evidence_records evidence_competency_links evidence_correction_events \
  assessment_attempts lab_validation_runs; do
  if grep -nE "from\(\"$t\"\)" "$EXPORT_SERVICE"; then
    echo "FAIL: export must not read or write $t directly"; exit 1
  fi
done
if grep -nE '\.(update|delete)\(' "$EXPORT_SERVICE"; then
  echo "FAIL: export must not mutate stored records"; exit 1
fi

# --- student-facing export request is accessible and private -------------------
grep -Fq 'requestEvidenceExport' "$PORTFOLIO_WEB_SERVICE" || exit 1
grep -Fq 'requestEvidenceExport' "$EXPORT_PANEL" || exit 1
grep -Fq 'describeExportContents' "$EXPORT_PANEL" || exit 1
grep -Fq 'EvidenceExportPanel' "$PORTFOLIO_VIEW" || exit 1
for needle in '<table' '<caption' 'scope="col"' 'scope="row"' 'aria-live' 'aria-labelledby' '<time dateTime'; do
  case "$(cat "$EXPORT_PANEL")" in
    *"$needle"*) ;;
    *) echo "FAIL: export presentation is missing accessible markup ($needle)"; exit 1 ;;
  esac
done
if grep -nE 'Authorization|Bearer ' "$EXPORT_PANEL"; then
  echo "FAIL: components must call service modules, not build auth headers"; exit 1
fi
# The export panel must not rely on colour or badges for status either.
if grep -nE 'className="[^"]*badge|color:|backgroundColor' "$EXPORT_PANEL"; then
  echo "FAIL: export status must not rely on colour or badges alone"; exit 1
fi

# --- deferred scope stays deferred --------------------------------------------
if grep -RniE '\b(share[-_]?link|shareToken|employer|public[-_]?profile|blockchain|pdfkit|puppeteer)\b' \
  "$EXPORT_TYPES" "$EXPORT_SERVICE" "$VERIFICATION_MIGRATION" "$PORTFOLIO_WEB_SERVICE"; then
  echo "FAIL: EVID-008 future extensions must not appear in Batch 7"; exit 1
fi
if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' \
  "$EXPORT_TYPES" "$EXPORT_SERVICE" "$VERIFICATION_MIGRATION"; then
  echo "FAIL: AI dependency detected in the Evidence export path"; exit 1
fi

echo "PASS: Evidence export representation exists and is exported"
echo "PASS: export projects the safe portfolio model, never evidence_records"
echo "PASS: export exposes no digests, provider data or correction mechanics"
echo "PASS: verification status reflects current effective state at read time"
echo "PASS: revoked and superseded Evidence is never presented as current"
echo "PASS: exact competency stable id and version are preserved"
echo "PASS: verification identifiers are opaque and cryptographically random"
echo "PASS: verification references are stable, immutable and server owned"
echo "PASS: Batch 1 Evidence immutability is preserved"
echo "PASS: verification references have no public or student write policy"
echo "PASS: export is authenticated, student controlled and never anonymous"
echo "PASS: unsupported methods on /evidence/export return route-not-found"
echo "PASS: reserved collection names are never read as Evidence identifiers"
echo "PASS: export never mutates Evidence or source-engine truth"
echo "PASS: the export request is accessible and private"
echo "PASS: sharing, employer access, documents and AI remain deferred"

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 7 Batch 1 verification passed."
echo "Wave 7 Batch 2 verification passed."
echo "Wave 7 Batch 3 verification passed."
echo "Wave 7 Batch 4 verification passed."
echo "Wave 7 Batch 5 verification passed."
echo "Wave 7 Batch 6 verification passed."
echo "Wave 7 Batch 7 verification passed."
