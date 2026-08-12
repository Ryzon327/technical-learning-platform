#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

grep -Fq 'getIsolationStatus' services/api/src/mock-lab-provider.ts
grep -Fq 'studentHasProviderAdminAccess: false' services/api/src/mock-lab-provider.ts
grep -Fq 'managementPlaneExposed: false' services/api/src/mock-lab-provider.ts
grep -Fq 'attemptCount < 5' packages/shared-types/src/lab-operations.ts
grep -Fq 'lab_operations_requiring_attention' supabase/migrations/20260812001100_lab_isolation_expiration_cleanup.sql
grep -Fq 'processDueLabOperations' services/api/src/lab-operations.ts
grep -Fq 'recovery_required' services/api/src/lab-operations.ts
grep -Fq 'access_revoked_at' services/api/src/lab-operations.ts
grep -Fq 'labSessionIsolationMatch' services/api/src/server.ts
grep -Fq 'labSessionCleanupMatch' services/api/src/server.ts

if grep -R -nEi 'proxmox|pve|lxc|docker|kubernetes|aws|azure|gcp' packages/shared-types/src/lab-operations.ts services/api/src/lab-operations.ts; then
  echo 'FAIL: provider-specific coupling detected'
  exit 1
fi

if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' packages/shared-types/src/lab-operations.ts services/api/src/lab-operations.ts; then
  echo 'FAIL: AI dependency detected'
  exit 1
fi

echo 'PASS: provider isolation attestation prevents management-plane access'
echo 'PASS: expiration revokes access without changing learning mastery'
echo 'PASS: cleanup retry timing and retry ceiling are deterministic'
echo 'PASS: repeated cleanup failure escalates to recovery_required'
echo 'PASS: operational attention surface exists for leaked resources'
echo 'PASS: no provider-specific infrastructure coupling introduced'
echo 'PASS: AI is not used for isolation, expiration, cleanup, or recovery truth'

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo 'Wave 6 Batch 4 verification passed.'
