#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "services/api/src/container-runtime.ts"
  "services/api/src/container-runtime.test.ts"
  "services/api/src/container-lab-provider.ts"
  "services/api/src/container-lab-provider.test.ts"
  "supabase/migrations/20260812001400_container_runtime_hardening.sql"
)

for path in "${required[@]}"; do
  [ -e "$path" ] || {
    echo "MISSING: $path"
    exit 1
  }
done

grep -Fq 'TLP_CONTAINER_PROVIDER_ENABLED' \
  services/api/src/container-runtime.ts || {
  echo "FAIL: explicit Container Provider enablement missing"
  exit 1
}

grep -Fq 'TLP_CONTAINER_ALLOWED_IMAGES' \
  services/api/src/container-runtime.ts || {
  echo "FAIL: image allowlist configuration missing"
  exit 1
}

grep -Fq 'Container lab images must declare a non-root default user' \
  services/api/src/container-runtime.ts || {
  echo "FAIL: non-root image requirement missing"
  exit 1
}

grep -Fq '"--network",' services/api/src/container-runtime.ts || {
  echo "FAIL: explicit network isolation flag missing"
  exit 1
}

grep -Fq '"none",' services/api/src/container-runtime.ts || {
  echo "FAIL: network-none baseline missing"
  exit 1
}

grep -Fq '"--read-only",' services/api/src/container-runtime.ts || {
  echo "FAIL: read-only root filesystem missing"
  exit 1
}

grep -Fq '"--cap-drop",' services/api/src/container-runtime.ts || {
  echo "FAIL: Linux capability drop missing"
  exit 1
}

grep -Fq '"ALL",' services/api/src/container-runtime.ts || {
  echo "FAIL: drop-all Linux capability baseline missing"
  exit 1
}

grep -Fq 'no-new-privileges' \
  services/api/src/container-runtime.ts || {
  echo "FAIL: no-new-privileges baseline missing"
  exit 1
}

grep -Fq 'dockerSocketMounted' \
  services/api/src/container-runtime.ts || {
  echo "FAIL: runtime socket mount detection missing"
  exit 1
}

grep -Fq 'Refusing to operate on an unmanaged container' \
  services/api/src/container-runtime.ts || {
  echo "FAIL: managed-container ownership boundary missing"
  exit 1
}

grep -Fq 'validation probe is not registered' \
  services/api/src/container-lab-provider.ts || {
  echo "FAIL: arbitrary validation probe rejection missing"
  exit 1
}

grep -Fq 'enabledByDefault' \
  supabase/migrations/20260812001400_container_runtime_hardening.sql || {
  echo "FAIL: persistent disabled-by-default metadata missing"
  exit 1
}

grep -Fq "'enabledByDefault', false" \
  supabase/migrations/20260812001400_container_runtime_hardening.sql || {
  echo "FAIL: Container Provider must remain disabled by default"
  exit 1
}

if grep -R -nEi 'proxmox|pve' \
  services/api/src/container-runtime.ts \
  services/api/src/container-lab-provider.ts; then
  echo "FAIL: Proxmox coupling introduced in Container Provider"
  exit 1
fi

if grep -R -nEi 'openai|anthropic|ollama|ai gateway|AIGW' \
  services/api/src/container-runtime.ts \
  services/api/src/container-lab-provider.ts; then
  echo "FAIL: AI dependency detected in Container Provider authority path"
  exit 1
fi

echo "PASS: Container Provider runtime requires explicit enablement"
echo "PASS: Container images require explicit allowlisting"
echo "PASS: Container images must declare a non-root user"
echo "PASS: runtime enforces network-none, read-only rootfs, dropped capabilities, and no-new-privileges"
echo "PASS: runtime detects forbidden container-engine socket mounts"
echo "PASS: lifecycle operations are restricted to TLP-managed container names/labels"
echo "PASS: Container Provider rejects unregistered validation probes"
echo "PASS: Container Provider remains disabled by default"
echo "PASS: no Proxmox coupling introduced"
echo "PASS: AI is not part of container lifecycle or validation authority"

bash scripts/ci-toolchain.sh typecheck test build security smoke

echo "Wave 6 Batch 7 verification passed."
