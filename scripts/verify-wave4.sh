#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/assessment.ts"
  "packages/shared-types/src/assessment-attempt.ts"
  "packages/shared-types/src/readiness.ts"
  "services/api/src/assessments.ts"
  "services/api/src/assessment-attempts.ts"
  "services/api/src/readiness.ts"
  "supabase/migrations/20260812000100_assessment_foundation.sql"
  "supabase/migrations/20260812000200_assessment_attempts_scoring.sql"
  "supabase/migrations/20260812000300_readiness_test_out.sql"
)

for path in "${required[@]}"; do
  [ -e "$path" ] || { echo "MISSING: $path"; exit 1; }
done

grep -Fq 'test_out_enabled' supabase/migrations/20260812000300_readiness_test_out.sql || { echo "FAIL: test-out config missing"; exit 1; }
grep -Fq "purpose = 'evidence_producing'" supabase/migrations/20260812000300_readiness_test_out.sql || { echo "FAIL: evidence-producing constraint missing"; exit 1; }
grep -Fq 'assessment_readiness_outcomes' supabase/migrations/20260812000300_readiness_test_out.sql || { echo "FAIL: readiness outcomes missing"; exit 1; }
grep -Fq 'recordAuthoritativeCompetencyEvidence' services/api/src/readiness.ts || { echo "FAIL: competency handoff missing"; exit 1; }
grep -Fq 'learning_requirement_satisfactions' services/api/src/readiness.ts || { echo "FAIL: prerequisite handoff missing"; exit 1; }
grep -Fq 'student_review_state' services/api/src/readiness.ts || { echo "FAIL: review recommendation missing"; exit 1; }
grep -Fq 'assessment-attempt:' services/api/src/readiness.ts || { echo "FAIL: source reference missing"; exit 1; }
grep -Fq 'processReadinessAssessmentOutcome' services/api/src/assessment-attempts.ts || { echo "FAIL: submit integration missing"; exit 1; }
grep -Fq 'getReadinessAssessmentOutcome' services/api/src/server.ts || { echo "FAIL: readiness API route missing"; exit 1; }

echo "Wave 4 Batch 3 readiness/test-out structure verified."
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh
echo "Wave 4 Batch 3 verification passed."
