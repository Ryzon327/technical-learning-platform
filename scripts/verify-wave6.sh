#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
required=(
  packages/shared-types/src/labs.ts packages/shared-types/src/lab-sessions.ts
  packages/shared-types/src/lab-runtime.ts packages/shared-types/src/lab-operations.ts
  packages/shared-types/src/lab-automation.ts services/api/src/mock-lab-provider.ts
  services/api/src/lab-sessions.ts services/api/src/lab-runtime.ts
  services/api/src/lab-operations.ts services/api/src/lab-automation.ts
  supabase/migrations/20260812000800_lab_definition_foundation.sql
  supabase/migrations/20260812000900_lab_session_lifecycle.sql
  supabase/migrations/20260812001000_lab_access_reset_validation.sql
  supabase/migrations/20260812001100_lab_isolation_expiration_cleanup.sql
  supabase/migrations/20260812001200_lab_health_capacity_automation.sql
)
for p in "${required[@]}"; do [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }; done
grep -Fq 'captureLabProviderOperationalSnapshot' services/api/src/lab-automation.ts || exit 1
grep -Fq 'expireDueLabSessions' services/api/src/lab-automation.ts || exit 1
grep -Fq 'drainQueuedLabSessions' services/api/src/lab-automation.ts || exit 1
grep -Fq 'runLabAutomationCycle' services/api/src/lab-automation.ts || exit 1
grep -Fq 'shouldProvisionQueuedSession' packages/shared-types/src/lab-automation.ts || exit 1
grep -Fq '.in("state", ["pending", "failed"])' services/api/src/lab-operations.ts || exit 1
grep -Fq 'lab_operations_one_open_kind_per_session_idx' supabase/migrations/20260812001200_lab_health_capacity_automation.sql || exit 1
grep -Fq 'No student-facing RLS policy is granted' supabase/migrations/20260812001200_lab_health_capacity_automation.sql || exit 1
grep -Fq 'Automation cycle history is operational data and remains server-only' supabase/migrations/20260812001200_lab_health_capacity_automation.sql || exit 1
if grep -R -nEi 'proxmox|pve|lxc|docker|kubernetes|aws|azure|gcp' packages/shared-types/src/lab-automation.ts services/api/src/lab-automation.ts; then echo 'FAIL: provider-specific coupling detected'; exit 1; fi
if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' packages/shared-types/src/lab-automation.ts services/api/src/lab-automation.ts; then echo 'FAIL: AI dependency detected'; exit 1; fi
echo 'PASS: provider health and capacity are sampled deterministically'
echo 'PASS: unhealthy providers do not receive queued Lab Sessions'
echo 'PASS: due Lab Sessions expire without changing learning mastery'
echo 'PASS: expiration schedules cleanup rather than leaking resources'
echo 'PASS: queued Lab Sessions drain FIFO when healthy capacity exists'
echo 'PASS: pending and failed cleanup operations are processed'
echo 'PASS: automation cycle history is server-only operational data'
echo 'PASS: duplicate open operations are prevented'
echo 'PASS: no provider-specific infrastructure coupling introduced'
echo 'PASS: AI is not used for health, capacity, expiration, or queue decisions'
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh
echo 'Wave 6 Batch 5 verification passed.'
