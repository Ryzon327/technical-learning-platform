#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/auth.ts"
  "services/api/src/auth-context.ts"
  "services/api/src/authorization.ts"
  "services/api/src/admin/provision-founder.ts"
  "apps/web/src/auth/mfa-service.ts"
  "apps/web/src/auth/FounderMfaGate.tsx"
  "apps/web/src/auth/AuthProvider.tsx"
  "supabase/migrations/20260811000200_authentication_foundation.sql"
)

for path in "${required[@]}"; do
  if [ ! -e "$path" ]; then
    echo "MISSING: $path"
    exit 1
  fi
done

echo "Wave 1 authentication structure verified."

bash scripts/ci-toolchain.sh typecheck test build security smoke

echo "Wave 1 Batch 4 verification passed."
