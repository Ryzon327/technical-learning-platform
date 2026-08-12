#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/learning.ts"
  "packages/shared-types/src/learning-navigation.ts"
  "packages/shared-types/src/competency.ts"
  "services/api/src/learning-progress.ts"
  "services/api/src/learning-navigation.ts"
  "services/api/src/competency.ts"
  "supabase/migrations/20260811000700_learning_progress_foundation.sql"
  "supabase/migrations/20260811000800_learning_resume_prerequisites.sql"
  "supabase/migrations/20260811000900_competency_state_foundation.sql"
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

grep -Fq 'decideCompetencyTransition' packages/shared-types/src/competency.ts   || { echo "FAIL: deterministic competency transition missing."; exit 1; }

grep -Fq 'student_competency_state' supabase/migrations/20260811000900_competency_state_foundation.sql   || { echo "FAIL: competency state persistence missing."; exit 1; }

grep -Fq 'student_competency_evidence_refs' supabase/migrations/20260811000900_competency_state_foundation.sql   || { echo "FAIL: competency evidence references missing."; exit 1; }

grep -Fq 'student_competency_state_events' supabase/migrations/20260811000900_competency_state_foundation.sql   || { echo "FAIL: competency history missing."; exit 1; }

grep -Fq 'listStudentCompetencyState' services/api/src/server.ts   || { echo "FAIL: student competency route missing."; exit 1; }

echo "Wave 3 Batch 3 competency structure verified."

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 3 Batch 3 verification passed."
