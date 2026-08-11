#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/auth.ts"
  "packages/shared-types/src/audit.ts"
  "packages/shared-types/src/version.ts"
  "services/api/src/audit.ts"
  "services/api/src/version.ts"
  "services/api/src/supabase.ts"
  "apps/web/src/lib/supabase.ts"
  "supabase/migrations/20260811000200_authentication_foundation.sql"
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

echo "Wave 1 Batch 1 structure verified."

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 1 Batch 1 verification passed."
