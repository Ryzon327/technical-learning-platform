#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/learning.ts"
  "packages/shared-types/src/learning.test.ts"
  "services/api/src/learning-progress.ts"
  "services/api/src/learning-progress.test.ts"
  "supabase/migrations/20260811000700_learning_progress_foundation.sql"
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

if ! grep -Fq 'student_learning_progress'   supabase/migrations/20260811000700_learning_progress_foundation.sql; then
  echo "FAIL: student learning progress table is missing."
  exit 1
fi

if ! grep -Fq 'auth.uid() = user_id'   supabase/migrations/20260811000700_learning_progress_foundation.sql; then
  echo "FAIL: student progress ownership RLS is missing."
  exit 1
fi

if ! grep -Fq 'record_mission_progress'   supabase/migrations/20260811000700_learning_progress_foundation.sql; then
  echo "FAIL: deterministic mission progress function is missing."
  exit 1
fi

if ! grep -Fq 'getLearningPathProgress' services/api/src/server.ts; then
  echo "FAIL: learning progress read route is not wired."
  exit 1
fi

if ! grep -Fq 'recordMissionProgressAction' services/api/src/server.ts; then
  echo "FAIL: learning progress write routes are not wired."
  exit 1
fi

if ! grep -Fq 'aggregateLearningPathProgress'   packages/shared-types/src/learning.ts; then
  echo "FAIL: deterministic progress aggregation is missing."
  exit 1
fi

echo "Wave 3 Batch 1 learning progress structure verified."

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 3 Batch 1 verification passed."
