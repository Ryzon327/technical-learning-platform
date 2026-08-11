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
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

if ! grep -Fq 'requireFounderAdmin' services/api/src/server.ts; then
  echo "FAIL: curriculum authoring is not protected by Founder/admin authorization."
  exit 1
fi

if ! grep -Fq 'curriculum_publication_events' \
  supabase/migrations/20260811000400_curriculum_authoring_publication.sql; then
  echo "FAIL: curriculum publication audit table is missing."
  exit 1
fi

echo "Wave 2 curriculum authoring structure verified."

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 2 Batch 2 verification passed."
