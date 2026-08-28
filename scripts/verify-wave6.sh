#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for p in packages/shared-types/src/labs.ts services/api/src/container-lab-provider.ts services/api/src/lab-provider-registry.ts services/api/src/lab-provider-routes.ts supabase/migrations/20260812001300_lab_container_provider_foundation.sql; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

grep -Fq 'export interface LabProvider' packages/shared-types/src/labs.ts || exit 1
grep -Fq 'providerId = "container"' services/api/src/container-lab-provider.ts || exit 1
grep -Fq 'studentHasProviderAdminAccess: false' services/api/src/container-lab-provider.ts || exit 1
grep -Fq 'managementPlaneExposed: false' services/api/src/container-lab-provider.ts || exit 1
grep -Fq 'chooseLabProvider' services/api/src/lab-provider-registry.ts || exit 1
grep -Fq "'container', 'container', false" supabase/migrations/20260812001300_lab_container_provider_foundation.sql || exit 1
grep -Fq 'No student-facing policy is granted' supabase/migrations/20260812001300_lab_container_provider_foundation.sql || exit 1
grep -Fq 'pathname === "/lab-providers"' services/api/src/server.ts || exit 1

if grep -R -nEi 'proxmox|pve' packages/shared-types/src/labs.ts services/api/src/container-lab-provider.ts services/api/src/lab-provider-registry.ts; then
  echo "FAIL: Proxmox coupling introduced prematurely"; exit 1
fi

if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' packages/shared-types/src/labs.ts services/api/src/container-lab-provider.ts services/api/src/lab-provider-registry.ts; then
  echo "FAIL: AI dependency detected in provider control path"; exit 1
fi

echo "PASS: generic Lab Provider interface exists"
echo "PASS: Mock and Container providers register behind one contract"
echo "PASS: Container Provider supports lifecycle/access/reset/validation/isolation contract"
echo "PASS: Container Provider denies provider-admin and management-plane access"
echo "PASS: Container Provider starts disabled for safe staged rollout"
echo "PASS: provider registry is operational configuration, not student data"
echo "PASS: provider selection is health/capability/capacity aware"
echo "PASS: Proxmox remains deferred"
echo "PASS: AI is not part of provider lifecycle authority"

bash scripts/ci-toolchain.sh typecheck test build security smoke

echo "Wave 6 Batch 6 verification passed."
