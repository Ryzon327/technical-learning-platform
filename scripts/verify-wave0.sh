#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "package.json"
  "package-lock.json"
  "tsconfig.base.json"
  ".env.example"
  "apps/web/package.json"
  "apps/web/src/App.tsx"
  "packages/shared-types/src/index.ts"
  "packages/shared-types/src/errors.ts"
  "services/api/src/config.ts"
  "services/api/src/logger.ts"
  "services/api/src/health.ts"
  "supabase/migrations/20260811000100_platform_foundation.sql"
  ".github/workflows/ci.yml"
  "scripts/local-health-check.sh"
  "scripts/security-scan.sh"
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

echo "Foundation structure verified."

if [ -d node_modules ]; then
  npm run typecheck
  npm run test
  bash scripts/security-scan.sh
  echo "Typecheck, tests, and security baseline passed."
else
  echo "Dependencies are not installed yet; structural verification passed."
  echo "Run: bash scripts/bootstrap.sh"
fi
