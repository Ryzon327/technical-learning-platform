#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/learning.ts"
  "packages/shared-types/src/learning-navigation.ts"
  "packages/shared-types/src/competency.ts"
  "packages/shared-types/src/learning-guidance.ts"
  "services/api/src/learning-progress.ts"
  "services/api/src/learning-navigation.ts"
  "services/api/src/competency.ts"
  "services/api/src/learning-guidance.ts"
  "supabase/migrations/20260811000700_learning_progress_foundation.sql"
  "supabase/migrations/20260811000800_learning_resume_prerequisites.sql"
  "supabase/migrations/20260811000900_competency_state_foundation.sql"
  "supabase/migrations/20260811001000_learning_history_review.sql"
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

grep -Fq 'recommendNextAction' packages/shared-types/src/learning-guidance.ts   || { echo "FAIL: recommended-next-action logic missing."; exit 1; }

grep -Fq 'student_learning_history' supabase/migrations/20260811001000_learning_history_review.sql   || { echo "FAIL: learning history persistence missing."; exit 1; }

grep -Fq 'student_review_state' supabase/migrations/20260811001000_learning_history_review.sql   || { echo "FAIL: review state persistence missing."; exit 1; }

grep -Fq 'getRecommendedNextAction' services/api/src/server.ts   || { echo "FAIL: next-action route missing."; exit 1; }

grep -Fq 'listLearningHistory' services/api/src/server.ts   || { echo "FAIL: learning-history route missing."; exit 1; }

grep -Fq 'listReviewState' services/api/src/server.ts   || { echo "FAIL: review-state route missing."; exit 1; }

echo "Wave 3 Batch 4 guidance/history/review structure verified."

bash scripts/ci-toolchain.sh typecheck test build security smoke

echo "Wave 3 Batch 4 verification passed."
