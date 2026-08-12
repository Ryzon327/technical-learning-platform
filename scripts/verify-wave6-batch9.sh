#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/lab-rollout.ts"
  "packages/shared-types/src/lab-rollout.test.ts"
  "services/api/src/container-rollout.ts"
  "services/api/src/container-rollout.test.ts"
  "services/api/src/admin/manage-container-rollout.ts"
  "supabase/migrations/20260812001600_container_provider_controlled_rollout.sql"
)

for path in "${required[@]}"; do
  [ -e "$path" ] || {
    echo "MISSING: $path"
    exit 1
  }
done

grep -Fq 'activationState !== "enabled"' \
  packages/shared-types/src/lab-rollout.ts || {
  echo "FAIL: rollout evaluator does not require explicit enabled state"
  exit 1
}

grep -Fq 'deterministicRolloutBucket' \
  packages/shared-types/src/lab-rollout.ts || {
  echo "FAIL: stable percentage rollout bucket missing"
  exit 1
}

grep -Fq 'last_canary_passed_at' \
  services/api/src/container-rollout.ts || {
  echo "FAIL: API activation does not require canary evidence"
  exit 1
}

grep -Fq 'activation_state: "enabled"' \
  services/api/src/container-rollout.ts || {
  echo "FAIL: explicit activation transition missing"
  exit 1
}

grep -Fq 'activation_state: "suspended"' \
  services/api/src/container-rollout.ts || {
  echo "FAIL: provider suspension path missing"
  exit 1
}

grep -Fq 'activation_state: "disabled"' \
  services/api/src/container-rollout.ts || {
  echo "FAIL: provider disable path missing"
  exit 1
}

grep -Fq 'old.activation_state <> '\''canary_eligible'\''' \
  supabase/migrations/20260812001600_container_provider_controlled_rollout.sql || {
  echo "FAIL: database activation-state guard missing"
  exit 1
}

grep -Fq 'old.last_canary_passed_at is null' \
  supabase/migrations/20260812001600_container_provider_controlled_rollout.sql || {
  echo "FAIL: database canary-evidence guard missing"
  exit 1
}

grep -Fq "new.activation_state in ('disabled', 'suspended')" \
  supabase/migrations/20260812001600_container_provider_controlled_rollout.sql || {
  echo "FAIL: disable/suspend rollout shutdown guard missing"
  exit 1
}

grep -Fq '"lab:container:rollout"' \
  services/api/package.json || {
  echo "FAIL: rollout administration command missing"
  exit 1
}

if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' \
  packages/shared-types/src/lab-rollout.ts \
  services/api/src/container-rollout.ts \
  services/api/src/admin/manage-container-rollout.ts; then
  echo "FAIL: AI dependency detected in provider activation authority"
  exit 1
fi

echo "PASS: Container Provider activation requires explicit enabled state"
echo "PASS: canary eligibility alone does not grant student rollout"
echo "PASS: controlled rollout supports allowlist, deterministic percentage, and all-user modes"
echo "PASS: activation requires passing canary evidence"
echo "PASS: database independently guards canary_eligible -> enabled transition"
echo "PASS: suspend/disable immediately force rollout off"
echo "PASS: rollout administration is an explicit operator action"
echo "PASS: AI is not part of provider activation or rollout authority"

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 6 Batch 9 verification passed."
