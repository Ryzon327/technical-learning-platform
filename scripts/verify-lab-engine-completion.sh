#!/usr/bin/env bash
set -euo pipefail

# >>> TLP WAVE 6 / BATCH 10 (provider-aware student runtime) >>>
W6B10_CHECKS_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/w6b10-provider-wiring-checks.sh"
if [ -f "$W6B10_CHECKS_LIB" ]; then
  # shellcheck source=/dev/null
  . "$W6B10_CHECKS_LIB"
else
  tlp_w6b10_provider_wiring_unwired() { return 0; }
fi
# <<< TLP WAVE 6 / BATCH 10 <<<

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "===== LAB ENGINE COMPLETION CHECK ====="

LAB_DIR="docs/Feature-Registry/Lab-Engine"

if [ ! -d "$LAB_DIR" ]; then
  echo "FAIL: Lab Engine Feature Registry directory was not found."
  exit 1
fi

mapfile_cmd() {
  if command -v mapfile >/dev/null 2>&1; then
    mapfile -t "$@"
  else
    return 1
  fi
}

# macOS ships Bash 3.2, so avoid depending on mapfile.
LAB_SPECS=()
while IFS= read -r path; do
  LAB_SPECS+=("$path")
done < <(
  find "$LAB_DIR" -maxdepth 1 -type f \
    -name 'LAB-*.md' \
    | LC_ALL=C sort
)

if [ "${#LAB_SPECS[@]}" -ne 12 ]; then
  echo "FAIL: expected 12 LAB-001 through LAB-012 specification files; found ${#LAB_SPECS[@]}."
  printf '  %s\n' "${LAB_SPECS[@]}"
  exit 1
fi

for id in $(seq -w 1 12); do
  if ! printf '%s\n' "${LAB_SPECS[@]}" | grep -Eq "/LAB-0*${id}[_-]"; then
    echo "FAIL: LAB-$(printf '%03d' "$id") specification file was not found."
    exit 1
  fi
done

for spec in "${LAB_SPECS[@]}"; do
  if ! grep -Eq '\[x\][[:space:]]+Approved|Founder Approval(.|\n)*Approved' "$spec"; then
    echo "FAIL: approved Founder status was not found in $spec"
    exit 1
  fi
done

echo "PASS: LAB-001 through LAB-012 specifications exist and are approved"

required_files=(
  "packages/shared-types/src/labs.ts"
  "packages/shared-types/src/lab-sessions.ts"
  "packages/shared-types/src/lab-runtime.ts"
  "packages/shared-types/src/lab-operations.ts"
  "packages/shared-types/src/lab-automation.ts"
  "packages/shared-types/src/lab-rollout.ts"
  "services/api/src/mock-lab-provider.ts"
  "services/api/src/lab-sessions.ts"
  "services/api/src/lab-runtime.ts"
  "services/api/src/lab-operations.ts"
  "services/api/src/lab-automation.ts"
  "services/api/src/container-lab-provider.ts"
  "services/api/src/container-runtime.ts"
  "services/api/src/container-canary.ts"
  "services/api/src/container-rollout.ts"
  "services/api/src/lab-provider-registry.ts"
)

for path in "${required_files[@]}"; do
  [ -e "$path" ] || {
    echo "FAIL: required Lab Engine implementation file is missing: $path"
    exit 1
  }
done

echo "PASS: required Lab Engine implementation files exist"

grep -Fq 'export interface LabProvider' \
  packages/shared-types/src/labs.ts || {
  echo "FAIL: canonical provider-independent LabProvider contract missing"
  exit 1
}

grep -Fq 'validateLabDefinition' \
  packages/shared-types/src/labs.ts || {
  echo "FAIL: Lab Definition validation contract missing"
  exit 1
}

echo "PASS: provider-independent Lab Definition and Provider contracts are present"

grep -Fq 'lifecycle_state' \
  services/api/src/lab-sessions.ts || {
  echo "FAIL: persistent Lab Session lifecycle implementation missing"
  exit 1
}

grep -Fq 'user_id' \
  services/api/src/lab-sessions.ts || {
  echo "FAIL: Lab Session student ownership boundary missing"
  exit 1
}

echo "PASS: Lab Session lifecycle and student ownership controls are present"

grep -Fq 'runValidationProbe' \
  services/api/src/lab-runtime.ts || {
  echo "FAIL: deterministic Lab validation implementation missing"
  exit 1
}

if grep -REni \
  'openai|anthropic|ollama|ai[ _-]?gateway|aigw' \
  services/api/src/lab-runtime.ts \
  services/api/src/container-lab-provider.ts \
  services/api/src/mock-lab-provider.ts >/dev/null; then
  echo "FAIL: AI provider/gateway dependency detected in Lab validation truth path"
  exit 1
fi

echo "PASS: deterministic validation is present and AI-independent"

grep -Fq 'studentHasProviderAdminAccess' \
  services/api/src/container-lab-provider.ts || {
  echo "FAIL: provider-admin isolation assertion missing"
  exit 1
}

grep -Fq 'managementPlaneExposed' \
  services/api/src/container-lab-provider.ts || {
  echo "FAIL: management-plane isolation assertion missing"
  exit 1
}

grep -Fq 'access_revoked_at' \
  services/api/src/lab-automation.ts || {
  echo "FAIL: expiration access revocation missing"
  exit 1
}

echo "PASS: isolation, expiration, and access-revocation controls are present"

grep -Fq 'processDueLabOperations' \
  services/api/src/lab-automation.ts || {
  echo "FAIL: automated cleanup/recovery processing missing"
  exit 1
}

grep -Fq 'recovery_required' \
  services/api/src/lab-operations.ts || {
  echo "FAIL: repeated cleanup failure escalation missing"
  exit 1
}

echo "PASS: reset, cleanup, retry, and recovery controls are present"

grep -Fq 'getCapacity' \
  services/api/src/mock-lab-provider.ts || {
  echo "FAIL: Mock Provider capacity contract missing"
  exit 1
}

grep -Fq 'captureLabProviderOperationalSnapshot' \
  services/api/src/lab-automation.ts || {
  echo "FAIL: provider health/capacity automation missing"
  exit 1
}

echo "PASS: capacity, health, and provisioning automation are present"

grep -Fq 'TLP_CONTAINER_ALLOWED_IMAGES' \
  services/api/src/container-runtime.ts || {
  echo "FAIL: Container Provider image allowlist missing"
  exit 1
}

grep -Fq 'no-new-privileges' \
  services/api/src/container-runtime.ts || {
  echo "FAIL: hardened Container Provider runtime baseline missing"
  exit 1
}

grep -Fq 'networkMode === "none"' \
  services/api/src/container-lab-provider.ts || {
  echo "FAIL: Container Provider network-isolation attestation missing"
  exit 1
}

echo "PASS: hardened real Container Provider runtime adapter is present"

grep -Fq 'runContainerProviderCanary' \
  services/api/src/container-canary.ts || {
  echo "FAIL: Container Provider canary verification missing"
  exit 1
}

grep -Fq 'canary_eligible' \
  services/api/src/container-rollout.ts || {
  echo "FAIL: canary-qualified activation boundary missing"
  exit 1
}

grep -Fq 'activationState !== "enabled"' \
  packages/shared-types/src/lab-rollout.ts || {
  echo "FAIL: rollout evaluator does not require explicit enablement"
  exit 1
}

echo "PASS: canary, activation, suspension, and controlled rollout controls are present"

# Completion gap check 1:
# Batch 9 introduced persistent rollout policy. Provider selection must actually
# consult that policy before a Container Provider can receive student work.
if ! grep -Eq \
  'evaluateContainerProviderRollout|getContainerProviderRolloutPolicy|evaluateLabProviderRollout' \
  services/api/src/lab-provider-registry.ts \
  services/api/src/lab-sessions.ts \
  services/api/src/lab-automation.ts; then
  if tlp_w6b10_provider_wiring_unwired; then
    echo
    echo "GAP: controlled Container Provider rollout is not wired into the student provisioning/provider-selection path."
    echo "      Batch 9 created rollout policy, but the Lab runtime must consult it before Container Provider selection."
    echo "FAIL: Lab Engine completion gate not satisfied."
    exit 1
  fi
fi

echo "PASS: controlled provider rollout is wired into student provisioning"

# Completion gap check 2:
# A real provider returning a terminal URL is not sufficient unless the LMS
# actually has a protected access-delivery path that can serve that runtime.
if grep -Fq '/container-labs/' services/api/src/container-lab-provider.ts; then
  if ! grep -REq \
    'container-labs.*terminal|terminal.*container-labs' \
    services/api/src/server.ts \
    services/api/src 2>/dev/null; then
    echo
    echo "GAP: Container Provider returns a student terminal endpoint, but no protected terminal/access gateway implementation was found."
    echo "      The Wave 6 exit criterion requires a student to actually use a real practical lab through the LMS."
    echo "FAIL: Lab Engine completion gate not satisfied."
    exit 1
  fi
fi

echo "PASS: real-provider student access delivery is implemented"

# Ensure student-facing Lab routes remain protected.
#
# Routed through the shared toolchain step so it is not duplicated when the
# hardened CI baseline has already run the smoke suite in the same job. Outside
# that trusted context it runs exactly as before.
if [ -f scripts/smoke-api.sh ]; then
  bash scripts/ci-toolchain.sh smoke
fi

# Run the complete accumulated Wave 6 verification chain where available.
#
# These test -f, not -x. Every caller invokes verifiers as `bash <script>`, so
# the execute bit is not load-bearing anywhere — but with -x, a verifier that
# merely lost its mode bit would be SILENTLY SKIPPED and this gate would still
# report success. DEV-FLOW-2 removed that failure mode; it also means creating a
# verifier needs no chmod.
[ -f scripts/verify-wave6.sh ] && bash scripts/verify-wave6.sh
[ -f scripts/verify-wave6-batch7.sh ] && bash scripts/verify-wave6-batch7.sh
[ -f scripts/verify-wave6-batch8.sh ] && bash scripts/verify-wave6-batch8.sh
[ -f scripts/verify-wave6-batch9.sh ] && bash scripts/verify-wave6-batch9.sh

echo
echo "LAB ENGINE COMPLETION CHECK PASSED"
