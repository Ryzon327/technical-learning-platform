#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/curriculum.ts"
  "packages/shared-types/src/curriculum-admin.ts"
  "services/api/src/curriculum.ts"
  "services/api/src/curriculum-admin.ts"
  "services/api/src/http-body.ts"
  "supabase/migrations/20260811000300_curriculum_foundation.sql"
  "supabase/migrations/20260811000400_curriculum_authoring_publication.sql"
  "supabase/migrations/20260811000500_curriculum_tree_publication.sql"
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

for symbol in createDraftCourse createDraftModule createDraftMission createDraftCompetency; do
  if ! grep -Fq "$symbol" services/api/src/server.ts; then
    echo "FAIL: curriculum authoring route missing: $symbol"
    exit 1
  fi
done

if ! grep -Fq 'curriculum_publish_learning_path_tree'   supabase/migrations/20260811000500_curriculum_tree_publication.sql; then
  echo "FAIL: full-tree publication helper is missing."
  exit 1
fi

echo "Wave 2 full curriculum authoring structure verified."

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 2 Batch 3 verification passed."
