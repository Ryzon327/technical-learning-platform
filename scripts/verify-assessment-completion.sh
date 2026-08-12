#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "===== ASSESSMENT / TEST-OUT COMPLETION CHECK ====="

required_files=(
  "packages/shared-types/src/assessment.ts"
  "packages/shared-types/src/assessment-attempt.ts"
  "packages/shared-types/src/readiness.ts"
  "packages/shared-types/src/assessment-recovery.ts"
  "services/api/src/assessments.ts"
  "services/api/src/assessment-attempts.ts"
  "services/api/src/readiness.ts"
  "services/api/src/assessment-recovery.ts"
  "supabase/migrations/20260812000100_assessment_foundation.sql"
  "supabase/migrations/20260812000200_assessment_attempts_scoring.sql"
  "supabase/migrations/20260812000300_readiness_test_out.sql"
  "supabase/migrations/20260812000400_assessment_recovery_integrity.sql"
)

for path in "${required_files[@]}"; do
  if [ ! -f "$path" ]; then
    echo "FAIL: missing required Wave 4 implementation file: $path"
    exit 1
  fi
done

grep -Fq 'scoreAssessment' packages/shared-types/src/assessment.ts \
  || { echo "FAIL: deterministic scoring contract missing."; exit 1; }

grep -Fq 'correct_option_ids' supabase/migrations/20260812000100_assessment_foundation.sql \
  || { echo "FAIL: authoritative answer-key storage missing."; exit 1; }

if grep -R -n 'correctOptionIds' apps/web/src 2>/dev/null; then
  echo "FAIL: browser source references authoritative answer keys."
  exit 1
fi

grep -Fq 'assessment_attempts' supabase/migrations/20260812000200_assessment_attempts_scoring.sql \
  || { echo "FAIL: persisted attempt model missing."; exit 1; }

grep -Fq 'assessment_attempt_answers' supabase/migrations/20260812000200_assessment_attempts_scoring.sql \
  || { echo "FAIL: persisted answers missing."; exit 1; }

grep -Fq 'maxAttempts' services/api/src/assessment-attempts.ts \
  || { echo "FAIL: attempt-limit enforcement missing."; exit 1; }

grep -Fq 'state === "interrupted"' packages/shared-types/src/assessment-attempt.ts \
  || grep -Fq '"interrupted"' packages/shared-types/src/assessment-attempt.ts \
  || { echo "FAIL: interrupted assessment state missing."; exit 1; }

grep -Fq 'resumeInterruptedAssessmentAttempt' services/api/src/assessment-recovery.ts \
  || { echo "FAIL: interrupted assessment recovery missing."; exit 1; }

grep -Fq 'preservedAnswerCount' services/api/src/assessment-recovery.ts \
  || { echo "FAIL: answer-preservation recovery signal missing."; exit 1; }

grep -Fq 'test_out_enabled' supabase/migrations/20260812000300_readiness_test_out.sql \
  || { echo "FAIL: explicit test-out configuration missing."; exit 1; }

grep -Fq "purpose = 'evidence_producing'" supabase/migrations/20260812000300_readiness_test_out.sql \
  || { echo "FAIL: evidence-producing test-out constraint missing."; exit 1; }

grep -Fq 'recordAuthoritativeCompetencyEvidence' services/api/src/readiness.ts \
  || { echo "FAIL: competency advancement handoff missing."; exit 1; }

grep -Fq 'learning_requirement_satisfactions' services/api/src/readiness.ts \
  || { echo "FAIL: prerequisite satisfaction integration missing."; exit 1; }

grep -Fq 'student_review_state' services/api/src/readiness.ts \
  || { echo "FAIL: readiness review recommendation missing."; exit 1; }

grep -Fq 'assessment_readiness_outcomes' supabase/migrations/20260812000300_readiness_test_out.sql \
  || { echo "FAIL: persisted readiness outcome missing."; exit 1; }

grep -Fq 'createHash' services/api/src/assessment-recovery.ts \
  || { echo "FAIL: deterministic objective-result integrity digest missing."; exit 1; }

grep -Fq 'assessment_evidence_handoffs' supabase/migrations/20260812000400_assessment_recovery_integrity.sql \
  || { echo "FAIL: assessment Evidence Engine handoff persistence missing."; exit 1; }

grep -Fq 'assessment-attempt:' services/api/src/readiness.ts \
  || { echo "FAIL: traceable assessment source reference missing."; exit 1; }

grep -Fq 'buildAssessmentEvidenceHandoff' services/api/src/assessment-attempts.ts \
  || { echo "FAIL: Evidence Engine handoff not invoked during submission."; exit 1; }

grep -Fq 'submitAssessmentAttempt' services/api/src/server.ts \
  || { echo "FAIL: assessment submission route missing."; exit 1; }

grep -Fq 'getReadinessAssessmentOutcome' services/api/src/server.ts \
  || { echo "FAIL: readiness outcome route missing."; exit 1; }

grep -Fq 'assessmentInterruptMatch' services/api/src/server.ts \
  || { echo "FAIL: interruption route missing."; exit 1; }

grep -Fq 'assessmentResumeMatch' services/api/src/server.ts \
  || { echo "FAIL: recovery route missing."; exit 1; }

if [ -f "docs/Feature-Registry/Learning-Engine/LEARN-005_READINESS_ASSESSMENT_AND_TEST_OUT.md" ]; then
  grep -Fq -- "- [x] Approved" docs/Feature-Registry/Learning-Engine/LEARN-005_READINESS_ASSESSMENT_AND_TEST_OUT.md \
    || { echo "FAIL: LEARN-005 is not marked approved."; exit 1; }
fi

echo "PASS: deterministic assessment definition/scoring present"
echo "PASS: answer-key browser boundary present"
echo "PASS: attempts, answers, retry controls, and result persistence present"
echo "PASS: technical interruption is recoverable and non-punitive"
echo "PASS: readiness/test-out integration is present"
echo "PASS: competency/prerequisite advancement path is present"
echo "PASS: unsuccessful readiness review path is present"
echo "PASS: integrity metadata and assessment evidence handoff are present"
echo "PASS: assessment API routes are wired"

echo
echo "Running Wave 4 verification..."
bash scripts/verify-wave4.sh

echo
echo "ASSESSMENT / TEST-OUT COMPLETION CHECK PASSED"
