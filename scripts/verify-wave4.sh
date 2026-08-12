#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/assessment.ts"
  "packages/shared-types/src/assessment-attempt.ts"
  "services/api/src/assessments.ts"
  "services/api/src/assessment-attempts.ts"
  "supabase/migrations/20260812000100_assessment_foundation.sql"
  "supabase/migrations/20260812000200_assessment_attempts_scoring.sql"
)

for path in "${required[@]}"; do
  [ -e "$path" ] || { echo "MISSING: $path"; exit 1; }
done

grep -Fq 'scoreAssessment' packages/shared-types/src/assessment.ts   || { echo "FAIL: deterministic scoring contract missing"; exit 1; }

grep -Fq 'assessment_attempts'   supabase/migrations/20260812000200_assessment_attempts_scoring.sql   || { echo "FAIL: persisted attempt model missing"; exit 1; }

grep -Fq 'assessment_attempt_answers'   supabase/migrations/20260812000200_assessment_attempts_scoring.sql   || { echo "FAIL: answer persistence missing"; exit 1; }

grep -Fq 'no authenticated INSERT/UPDATE policies'   supabase/migrations/20260812000200_assessment_attempts_scoring.sql   || { echo "FAIL: server-authoritative attempt mutation boundary missing"; exit 1; }

grep -Fq 'correct_option_ids'   supabase/migrations/20260812000100_assessment_foundation.sql   || { echo "FAIL: answer-key storage missing"; exit 1; }

grep -Fq 'submitAssessmentAttempt' services/api/src/server.ts   || { echo "FAIL: assessment submission route missing"; exit 1; }

grep -Fq 'saveAssessmentAnswer' services/api/src/server.ts   || { echo "FAIL: answer persistence route missing"; exit 1; }

grep -Fq 'startAssessmentAttempt' services/api/src/server.ts   || { echo "FAIL: attempt start route missing"; exit 1; }

grep -Fq 'correct_option_ids' services/api/src/assessment-attempts.ts   || { echo "FAIL: server scoring does not load authoritative answer keys"; exit 1; }

if grep -Fq 'correctOptionIds' packages/shared-types/src/assessment-attempt.ts; then
  echo "FAIL: sanitized student question contract exposes answer keys"
  exit 1
fi

echo "Wave 4 Batch 2 attempts and deterministic scoring structure verified."

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 4 Batch 2 verification passed."
