#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "package.json"
  "tsconfig.base.json"
  ".env.example"
  "apps/web/package.json"
  "apps/web/src/App.tsx"
  "packages/shared-types/src/index.ts"
  "services/api/src/health.ts"
  "supabase/migrations"
  ".github/workflows/ci.yml"
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
  echo "Typecheck and tests passed."
else
  echo "Dependencies are not installed yet; structural verification passed."
  echo "Run: bash scripts/bootstrap.sh"
fi
