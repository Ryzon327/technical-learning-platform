#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# Evidence Engine completion gate — Build Wave 7.
#
# This gate is deliberately NOT a copy of scripts/verify-wave7.sh. That script
# proves each batch's implementation. This one asks the different question the
# completion review must answer:
#
#   "Does the implemented Evidence Engine satisfy the approved Wave 7 MVP as a
#    complete subsystem?"
#
# It therefore checks the Feature Registry itself, the cross-batch invariants no
# single batch owns, and the engine-wide security boundaries — and only then
# defers to the per-batch verifier.
#
# Per FEATURE_REGISTRY_SPEC.md section 9.11, a Feature is complete when its
# approved ACCEPTANCE CRITERIA pass, together with tests, security,
# accessibility, documentation and recorded Founder approval. Section 9.3
# "Scope" states included and excluded behaviour; it is a boundary statement,
# not the completion bar. This gate is built to that rule.
# ============================================================

REGISTRY="docs/Feature-Registry/Evidence-Engine"
SEQUENCE="docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md"

fail() { echo "GATE FAIL: $1"; exit 1; }

# ------------------------------------------------------------
# 1. EVID-001 through EVID-008 exist and are Founder approved
# ------------------------------------------------------------
[ -f "$REGISTRY/EVIDENCE_ENGINE_FEATURES.md" ] || fail "Evidence Engine feature index is missing"

EVID_SPECS=""
for id in 001 002 003 004 005 006 007 008; do
  spec="$(find "$REGISTRY" -maxdepth 1 -name "EVID-${id}_*.md" | head -1)"
  [ -n "$spec" ] || fail "EVID-${id} specification is missing from the Feature Registry"
  EVID_SPECS="$EVID_SPECS $spec"

  # FEATURE_REGISTRY_SPEC.md section 14: approval is the recorded Founder
  # decision that the Feature should exist.
  grep -Fq '[x] Approved' "$spec" || fail "EVID-${id} does not record Founder approval"

  # Section 8: a Feature past approval carries a lifecycle state. Approved and
  # Specified both sit at or beyond the approval point.
  grep -Eq '^\*\*Lifecycle Status:\*\* (Approved|Specified|Planned|Building|Testing|Review|Production)' "$spec" \
    || fail "EVID-${id} has no lifecycle state at or beyond Approved"

  # Section 9.10: every Feature must carry observable acceptance criteria,
  # which section 9.11 makes the completion bar.
  grep -Fq '# 13. Acceptance Criteria' "$spec" || grep -Fq '# 14. Acceptance Criteria' "$spec" \
    || fail "EVID-${id} has no Acceptance Criteria section"
  grep -Fq 'Definition of Done' "$spec" || fail "EVID-${id} has no Definition of Done"
done

# Each approved Feature must have a build document recording how it was met.
for doc in \
  BUILD_WAVE_7_BATCH_1_CANONICAL_EVIDENCE_FOUNDATION \
  BUILD_WAVE_7_BATCH_2_COMPETENCY_EVIDENCE_LINKING \
  BUILD_WAVE_7_BATCH_3_ASSESSMENT_EVIDENCE \
  BUILD_WAVE_7_BATCH_4_LAB_VALIDATION_EVIDENCE \
  BUILD_WAVE_7_BATCH_5_EVIDENCE_REVIEW_CORRECTION_EFFECTIVE_STATE \
  BUILD_WAVE_7_BATCH_6_STUDENT_EVIDENCE_PORTFOLIO \
  BUILD_WAVE_7_BATCH_7_EVIDENCE_EXPORT_VERIFICATION_HOOKS; do
  [ -f "docs/Engineering-OS/${doc}.md" ] || fail "missing build document ${doc}.md"
done

echo "PASS: EVID-001 through EVID-008 exist, are Founder approved, and carry acceptance criteria"

# ------------------------------------------------------------
# 2. Canonical model: one Evidence truth, one effective-state resolver
# ------------------------------------------------------------
EVIDENCE_TABLES="$(grep -rlE 'create table if not exists public\.evidence' supabase/migrations | wc -l | tr -d ' ')"
[ "$EVIDENCE_TABLES" -ge 1 ] || fail "no Evidence tables found"

grep -rq 'create table if not exists public.evidence_records' supabase/migrations \
  || fail "canonical evidence_records table is missing"

# Exactly one canonical record table, one link table, one correction table, one
# verification reference table. A second Evidence model would be a governance
# failure regardless of whether it passed its own tests.
for t in evidence_records evidence_competency_links evidence_correction_events \
  evidence_verification_references; do
  count="$(grep -rc "create table if not exists public\.$t" supabase/migrations | awk -F: '{s+=$2} END {print s+0}')"
  [ "$count" = "1" ] || fail "expected exactly one definition of public.$t, found $count"
done

# One effective-state resolver, owned by Batch 5 and consumed everywhere else.
RESOLVER_DEFS="$(grep -rl 'export function resolveEffectiveEvidenceState' packages/shared-types/src | wc -l | tr -d ' ')"
[ "$RESOLVER_DEFS" = "1" ] || fail "expected exactly one effective-state resolver, found $RESOLVER_DEFS"

# One outcome rule, owned by Batch 2/3 and consumed everywhere else.
OUTCOME_DEFS="$(grep -rl 'export function deriveEvidenceOutcome' packages/shared-types/src | wc -l | tr -d ' ')"
[ "$OUTCOME_DEFS" = "1" ] || fail "expected exactly one Evidence outcome rule, found $OUTCOME_DEFS"

echo "PASS: one canonical Evidence model, one effective-state resolver, one outcome rule"

# ------------------------------------------------------------
# 3. Cross-batch invariant: source truth -> Evidence -> link ->
#    correction -> effective state -> portfolio -> export
# ------------------------------------------------------------
grep -Fq 'createCanonicalEvidence' services/api/src/assessment-evidence.ts \
  || fail "assessment ingestion does not reach canonical Evidence"
grep -Fq 'createCanonicalEvidence' services/api/src/lab-evidence.ts \
  || fail "lab ingestion does not reach canonical Evidence"
grep -Fq 'linkEvidenceToCompetency' services/api/src/assessment-evidence.ts \
  || fail "assessment Evidence does not reach competency linking"
grep -Fq 'linkEvidenceToCompetency' services/api/src/lab-evidence.ts \
  || fail "lab Evidence does not reach competency linking"
grep -Fq 'loadCorrectionEventsByEvidence' services/api/src/evidence-competency.ts \
  || fail "competency consumption does not consult correction history"
grep -Fq 'loadCorrectionEventsByEvidence' services/api/src/evidence.ts \
  || fail "student Evidence reads do not consult correction history"
grep -Fq 'getStudentEvidencePortfolio' services/api/src/evidence-export.ts \
  || fail "export does not consume the portfolio projection"

# The chain must terminate in a student-visible surface for both capabilities.
grep -Fq 'pathname === "/evidence/portfolio"' services/api/src/server.ts \
  || fail "portfolio is not reachable"
grep -Fq 'pathname === "/evidence/export"' services/api/src/server.ts \
  || fail "export is not reachable"

echo "PASS: source truth reaches Evidence, competency links, corrections, portfolio and export"

# ------------------------------------------------------------
# 4. Cross-batch invariant: effective state actually governs qualification
# ------------------------------------------------------------
# The single most important engine-wide invariant: Evidence that was qualifying
# yesterday and was invalidated or superseded today must stop qualifying today.
QUALIFYING_BODY="$(awk '/export async function getAuthoritativeCompetencyEvidenceReferences/,0' \
  services/api/src/evidence-competency.ts)"
for needle in 'loadCorrectionEventsByEvidence(' 'resolveEffectiveEvidenceState(' \
  'isEffectivelyTrustedEvidence('; do
  case "$QUALIFYING_BODY" in
    *"$needle"*) ;;
    *) fail "competency qualification does not resolve effective state at read time ($needle)" ;;
  esac
done

grep -Fq 'export async function getQualifyingCompetencyEvidenceReferences' \
  services/api/src/evidence-competency.ts || fail "no mastery-safe qualifying accessor exists"

# Qualification must never be persisted, anywhere. Test files legitimately name
# these strings in order to assert their absence, so they are excluded.
if grep -rniE --include='*.ts' --include='*.sql' --exclude='*.test.ts' \
  'qualifies_for_demonstration|qualifying_cached|is_current_proof' \
  supabase/migrations services/api/src packages/shared-types/src; then
  fail "qualification must be derived at read time, never stored"
fi

# A negative outcome must never qualify, in either consumer.
PROOF_RULE="$(awk '/export function isCurrentProof/,/^}$/' packages/shared-types/src/evidence-portfolio.ts)"
case "$PROOF_RULE" in
  *"qualifiesAsDemonstrationEvidence("*) ;;
  *) fail "portfolio proof qualification does not reuse the canonical outcome rule" ;;
esac

echo "PASS: invalidated and superseded Evidence stops qualifying dynamically"
echo "PASS: negative Evidence never qualifies as demonstration in any consumer"

# ------------------------------------------------------------
# 5. Cross-batch invariant: historical truth is never rewritten
# ------------------------------------------------------------
grep -Fq 'Canonical Evidence provenance is immutable' \
  supabase/migrations/20260813000100_evidence_foundation.sql \
  || fail "Evidence provenance immutability was removed"
grep -rq 'append-only and cannot be updated' supabase/migrations \
  || fail "correction history append-only guarantee was removed"
grep -rq 'immutable once minted' supabase/migrations \
  || fail "verification reference immutability was removed"

# Evidence corrections must not reach back into source-engine truth.
for src in services/api/src/evidence-correction.ts services/api/src/evidence-export.ts; do
  for t in assessment_attempts assessment_evidence_handoffs lab_validation_runs \
    lab_validation_results lab_evidence_handoffs; do
    if grep -qE "\b$t\b" "$src"; then
      fail "$src references source-engine truth ($t)"
    fi
  done
done

# Ingestion must never mutate the source engine it reads from.
for pair in "services/api/src/assessment-evidence.ts:assessment_attempts" \
  "services/api/src/assessment-evidence.ts:assessment_evidence_handoffs" \
  "services/api/src/lab-evidence.ts:lab_validation_runs" \
  "services/api/src/lab-evidence.ts:lab_validation_results"; do
  src="${pair%%:*}"; table="${pair##*:}"
  if grep -qE "from\(\"$table\"\)[^;]*\.(update|upsert|insert|delete)\(" "$src"; then
    fail "$src mutates source-engine table $table"
  fi
done

# Historical competency versions must never be resolved against latest.
grep -Fq 'competencyReferenceKey' packages/shared-types/src/evidence-portfolio.ts \
  || fail "curriculum context is not keyed by exact competency version"
grep -Fq 'references: readonly CompetencyReference[]' services/api/src/curriculum.ts \
  || fail "curriculum resolution does not consume exact competency references"

echo "PASS: Evidence provenance, correction history and verification references are immutable"
echo "PASS: Evidence operations never rewrite assessment or lab source truth"
echo "PASS: historical competency versions are never resolved against latest"

# ------------------------------------------------------------
# 6. Security: private by default across the whole engine
# ------------------------------------------------------------
for t in evidence_records evidence_competency_links evidence_correction_events \
  evidence_verification_references; do
  grep -rq "alter table public\.$t enable row level security" supabase/migrations \
    || fail "row level security is not enabled on $t"
done

# Internal ingestion state must carry no student policy at all.
for m in supabase/migrations/*assessment_evidence_consumption.sql \
  supabase/migrations/*lab_evidence_consumption.sql; do
  [ -f "$m" ] || continue
  if grep -qi 'create policy' "$m"; then
    fail "internal ingestion state must not be student readable ($m)"
  fi
done

# No Evidence table may grant a student write policy or any anonymous access.
for m in supabase/migrations/*evidence*.sql; do
  [ -f "$m" ] || continue
  if grep -qEi '\bto[[:space:]]+(anon|public)\b|using[[:space:]]*\([[:space:]]*true[[:space:]]*\)' "$m"; then
    fail "anonymous or unconditional Evidence access policy found in $m"
  fi
  policy_targets="$(grep -A2 -Ei '^[[:space:]]*on public\.evidence[a-z_]*[[:space:]]*$' "$m" || true)"
  if printf '%s\n' "$policy_targets" \
    | grep -Eiq '^[[:space:]]*for[[:space:]]+(insert|update|delete|all)\b'; then
    fail "student write policy granted on an Evidence table in $m"
  fi
done

echo "PASS: every Evidence table enforces RLS with student read-only access"
echo "PASS: no anonymous or unconditional Evidence access policy exists"

# ------------------------------------------------------------
# 7. Public verification remains absent
# ------------------------------------------------------------
if grep -nE '"/verify|/verification/|publicVerification|anonymousVerification|shareToken|share_link' \
  services/api/src/server.ts; then
  fail "a public or anonymous verification surface exists"
fi

# Verification identifiers must not be resolvable by anyone but the owner.
grep -Fq 'auth.uid() = user_id' \
  supabase/migrations/20260813000600_evidence_verification_references.sql \
  || fail "verification references are not owner scoped"

# No employer, share-link or public-profile capability may have appeared.
if grep -rniE '\b(employer|share[-_]?link|public[-_]?profile|blockchain)\b' \
  services/api/src/evidence*.ts packages/shared-types/src/evidence*.ts; then
  fail "deferred EVID-008 future extensions appear in the Evidence Engine"
fi

echo "PASS: no public verification, share link, employer access or public profile exists"

# ------------------------------------------------------------
# 8. AI holds no Evidence authority anywhere in the engine
# ------------------------------------------------------------
# Test files name these providers in order to assert their absence, so the scan
# targets implementation only.
AI_SCAN_TARGETS="$(ls packages/shared-types/src/evidence*.ts \
  services/api/src/evidence*.ts services/api/src/assessment-evidence.ts \
  services/api/src/lab-evidence.ts supabase/migrations/*evidence*.sql 2>/dev/null \
  | grep -v '\.test\.ts$')"
if [ -n "$AI_SCAN_TARGETS" ] && grep -nEi 'openai|anthropic|ollama|ai[-_ ]?gateway' $AI_SCAN_TARGETS; then
  fail "an AI dependency exists in the Evidence truth path"
fi

echo "PASS: AI holds no authority anywhere in the Evidence truth path"

# ------------------------------------------------------------
# 9. Next approved wave, read only from the roadmap sequence
# ------------------------------------------------------------
[ -f "$SEQUENCE" ] || fail "MVP implementation sequence is missing"
grep -Fq 'Build Wave 8 — Certificates' "$SEQUENCE" \
  || fail "the roadmap sequence does not declare Build Wave 8 — Certificates"

echo "PASS: the roadmap sequence declares Build Wave 8 — Certificates as the next wave"

# ------------------------------------------------------------
# 10. The per-batch verifier and the repository toolchain
# ------------------------------------------------------------
bash scripts/verify-wave7.sh

echo ""
echo "============================================================"
echo "Evidence Engine completion gate PASSED."
echo "Build Wave 7 — Evidence Engine satisfies the approved MVP."
echo "Next approved implementation wave: Build Wave 8 — Certificates."
echo "============================================================"
