#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/learning.ts"
  "packages/shared-types/src/learning-navigation.ts"
  "services/api/src/learning-progress.ts"
  "services/api/src/learning-navigation.ts"
  "supabase/migrations/20260811000700_learning_progress_foundation.sql"
  "supabase/migrations/20260811000800_learning_resume_prerequisites.sql"
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

grep -Fq 'selectResumeTarget' packages/shared-types/src/learning-navigation.ts   || { echo "FAIL: resume selection missing."; exit 1; }

grep -Fq 'evaluatePrerequisiteRules' packages/shared-types/src/learning-navigation.ts   || { echo "FAIL: prerequisite evaluation missing."; exit 1; }

grep -Fq 'learning_prerequisite_rules' supabase/migrations/20260811000800_learning_resume_prerequisites.sql   || { echo "FAIL: prerequisite rules missing."; exit 1; }

grep -Fq 'learning_requirement_satisfactions' supabase/migrations/20260811000800_learning_resume_prerequisites.sql   || { echo "FAIL: authoritative satisfaction bridge missing."; exit 1; }

grep -Fq 'Prerequisites are not yet satisfied' services/api/src/learning-progress.ts   || { echo "FAIL: mission prerequisite enforcement missing."; exit 1; }

grep -Fq 'getResumeTarget' services/api/src/server.ts   || { echo "FAIL: resume route missing."; exit 1; }

echo "Wave 3 Batch 2 resume and prerequisite structure verified."

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 3 Batch 2 verification passed."
