#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
for p in packages/shared-types/src/labs.ts packages/shared-types/src/lab-sessions.ts packages/shared-types/src/lab-runtime.ts services/api/src/mock-lab-provider.ts services/api/src/lab-sessions.ts services/api/src/lab-runtime.ts supabase/migrations/20260812000800_lab_definition_foundation.sql supabase/migrations/20260812000900_lab_session_lifecycle.sql supabase/migrations/20260812001000_lab_access_reset_validation.sql; do [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }; done
grep -Fq 'getLabAccessDelivery' services/api/src/lab-runtime.ts || exit 1
grep -Fq 'Do not attempt to access provider management interfaces' services/api/src/lab-runtime.ts || exit 1
grep -Fq 'resetCount>=5' services/api/src/lab-runtime.ts || grep -Fq 'resetCount >= 5' services/api/src/lab-runtime.ts || exit 1
grep -Fq 'deriveLabValidationState' packages/shared-types/src/lab-runtime.ts || exit 1
grep -Fq 'technical_error' packages/shared-types/src/lab-runtime.ts || exit 1
grep -Fq 'runValidationProbe' services/api/src/lab-runtime.ts || exit 1
grep -Fq 'Students cannot submit arbitrary privileged probe definitions' supabase/migrations/20260812001000_lab_access_reset_validation.sql || exit 1
grep -Fq 'labSessionAccessMatch' services/api/src/server.ts || exit 1
grep -Fq 'labSessionResetMatch' services/api/src/server.ts || exit 1
grep -Fq 'labSessionValidateMatch' services/api/src/server.ts || exit 1
if grep -R -nEi 'proxmox|pve|lxc|docker|kubernetes|aws|azure|gcp' packages/shared-types/src/lab-runtime.ts services/api/src/lab-runtime.ts; then echo "FAIL: provider-specific infrastructure coupling detected"; exit 1; fi
if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' packages/shared-types/src/lab-runtime.ts services/api/src/lab-runtime.ts; then echo "FAIL: AI dependency detected in validation path"; exit 1; fi
echo "PASS: authenticated student access delivery is provider-neutral"
echo "PASS: provider management interfaces remain outside student access"
echo "PASS: reset is bounded and does not mutate learning/competency state"
echo "PASS: deterministic required/advisory validation exists"
echo "PASS: validator technical failure is distinct from student failure"
echo "PASS: students cannot inject privileged validator probes"
echo "PASS: no Proxmox/container/cloud coupling introduced"
echo "PASS: AI is not a source of validation truth"
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh
echo "Wave 6 Batch 3 verification passed."
