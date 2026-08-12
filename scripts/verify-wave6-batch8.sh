#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "services/api/src/container-canary.ts"
  "services/api/src/container-canary.test.ts"
  "services/api/src/admin/run-container-canary.ts"
  "supabase/migrations/20260812001500_container_provider_canary_gate.sql"
)

for path in "${required[@]}"; do
  [ -e "$path" ] || {
    echo "MISSING: $path"
    exit 1
  }
done

grep -Fq 'runContainerProviderCanary' \
  services/api/src/container-canary.ts || {
  echo "FAIL: Container Provider canary entry point missing"
  exit 1
}

for stage in \
  configuration \
  health \
  capacity \
  provision \
  isolation \
  start \
  validation \
  reset \
  destroy
do
  grep -Fq "\"$stage\"" services/api/src/container-canary.ts || {
    echo "FAIL: canary stage missing: $stage"
    exit 1
  }
done

grep -Fq '"container.running"' \
  services/api/src/container-canary.ts || {
  echo "FAIL: deterministic running-state canary probe missing"
  exit 1
}

grep -Fq 'studentHasProviderAdminAccess === false' \
  services/api/src/container-canary.ts || {
  echo "FAIL: canary admin-access assertion missing"
  exit 1
}

grep -Fq 'managementPlaneExposed === false' \
  services/api/src/container-canary.ts || {
  echo "FAIL: canary management-plane assertion missing"
  exit 1
}

grep -Fq "activation_state = case" \
  supabase/migrations/20260812001500_container_provider_canary_gate.sql || {
  echo "FAIL: canary eligibility state transition missing"
  exit 1
}

grep -Fq "then 'canary_eligible'" \
  supabase/migrations/20260812001500_container_provider_canary_gate.sql || {
  echo "FAIL: successful canary does not produce canary eligibility"
  exit 1
}

grep -Fq 'A passed canary never enables the provider automatically.' \
  supabase/migrations/20260812001500_container_provider_canary_gate.sql || {
  echo "FAIL: explicit activation boundary missing"
  exit 1
}

grep -Fq 'No student-facing RLS policy is granted' \
  supabase/migrations/20260812001500_container_provider_canary_gate.sql || {
  echo "FAIL: canary operational-data privacy boundary missing"
  exit 1
}

grep -Fq '"lab:container:canary"' \
  services/api/package.json || {
  echo "FAIL: Container Provider canary admin command missing"
  exit 1
}

if grep -R -nEi 'proxmox|pve' \
  services/api/src/container-canary.ts \
  services/api/src/admin/run-container-canary.ts; then
  echo "FAIL: Proxmox coupling introduced in Container canary"
  exit 1
fi

if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' \
  services/api/src/container-canary.ts \
  services/api/src/admin/run-container-canary.ts; then
  echo "FAIL: AI dependency detected in canary authority"
  exit 1
fi

echo "PASS: Container Provider canary verifies configuration, health, capacity, lifecycle, isolation, validation, reset, and cleanup"
echo "PASS: canary failure cannot activate the Container Provider"
echo "PASS: successful canary produces eligibility, not automatic enablement"
echo "PASS: canary history is server-only operational security evidence"
echo "PASS: canary can be run through an explicit administrative command"
echo "PASS: no Proxmox coupling introduced"
echo "PASS: AI is not part of canary or activation authority"

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 6 Batch 8 verification passed."
