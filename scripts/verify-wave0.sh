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
  "services/api/src/request-context.ts"
  "services/api/src/server.ts"
  "services/api/tsconfig.build.json"
  "supabase/migrations/20260811000100_platform_foundation.sql"
  ".github/workflows/ci.yml"
  "scripts/local-health-check.sh"
  "scripts/security-scan.sh"
  "scripts/smoke-api.sh"
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
  npm run build
  bash scripts/security-scan.sh
  bash scripts/smoke-api.sh
  echo "Typecheck, tests, build, security baseline, and API smoke test passed."
else
  echo "Dependencies are not installed yet; structural verification passed."
  echo "Run: bash scripts/bootstrap.sh"
fi
