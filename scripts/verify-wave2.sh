#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/curriculum-quality.ts"
  "services/api/src/curriculum-quality.ts"
  "supabase/migrations/20260811000600_curriculum_quality_assets.sql"
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

if ! grep -Fq 'buildLearningPathQualityReport' services/api/src/curriculum-admin.ts; then
  echo "FAIL: publication quality gate is not wired."
  exit 1
fi

if ! grep -Fq 'curriculum_assets' supabase/migrations/20260811000600_curriculum_quality_assets.sql; then
  echo "FAIL: curriculum asset registry is missing."
  exit 1
fi

if ! grep -Fq 'curriculum_version_lineage' supabase/migrations/20260811000600_curriculum_quality_assets.sql; then
  echo "FAIL: curriculum version lineage is missing."
  exit 1
fi

echo "Wave 2 curriculum quality structure verified."

bash scripts/ci-toolchain.sh typecheck test build security smoke

echo "Wave 2 Batch 4 verification passed."
