#!/usr/bin/env bash
# Wave 6 / Batch 10 — shared structural checks for provider-aware student runtime.
#
# Sourced by:
#   scripts/verify-wave6-batch10.sh
#   scripts/verify-lab-engine-completion.sh   (patched by apply-wave6-batch10.py)
#
# Every check is structural and targeted. Deliberately NO broad text matching
# such as "AI.*validation".

# shellcheck shell=bash

W6B10_API_SRC="services/api/src"
W6B10_SHARED_TYPES="packages/shared-types/src/labs.ts"

w6b10_repo_root() {
  if [ -n "${W6B10_REPO_ROOT:-}" ]; then
    printf '%s' "$W6B10_REPO_ROOT"
    return 0
  fi
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  printf '%s' "$dir"
}

w6b10_path() {
  printf '%s/%s' "$(w6b10_repo_root)" "$1"
}

# Records failures into W6B10_FAILURES (newline separated).
W6B10_FAILURES=""
W6B10_CHECKS_RUN=0

w6b10_reset() {
  W6B10_FAILURES=""
  W6B10_CHECKS_RUN=0
}

w6b10_fail() {
  W6B10_FAILURES="${W6B10_FAILURES}${1}"$'\n'
}

w6b10_report() {
  if [ -n "$W6B10_FAILURES" ]; then
    printf '%s' "$W6B10_FAILURES"
  fi
}

# w6b10_expect_file <relpath> <label>
w6b10_expect_file() {
  W6B10_CHECKS_RUN=$((W6B10_CHECKS_RUN + 1))
  if [ ! -f "$(w6b10_path "$1")" ]; then
    w6b10_fail "MISSING FILE: $1 ($2)"
    return 1
  fi
  return 0
}

# w6b10_expect_match <relpath> <extended-regex> <label>
w6b10_expect_match() {
  W6B10_CHECKS_RUN=$((W6B10_CHECKS_RUN + 1))
  local file
  file="$(w6b10_path "$1")"
  if [ ! -f "$file" ]; then
    w6b10_fail "MISSING FILE: $1 (needed for: $3)"
    return 1
  fi
  if ! grep -Eq -- "$2" "$file"; then
    w6b10_fail "NOT WIRED: $1 does not satisfy: $3"
    return 1
  fi
  return 0
}

# w6b10_expect_absent <relpath> <extended-regex> <label>
w6b10_expect_absent() {
  W6B10_CHECKS_RUN=$((W6B10_CHECKS_RUN + 1))
  local file
  file="$(w6b10_path "$1")"
  if [ ! -f "$file" ]; then
    w6b10_fail "MISSING FILE: $1 (needed for: $3)"
    return 1
  fi
  if grep -Eq -- "$2" "$file"; then
    w6b10_fail "LEGACY PATTERN PRESENT: $1 still matches: $3"
    return 1
  fi
  return 0
}

# ------------------------------------------------------------------
# 1. Provider selection layer exists and is database-aware
# ------------------------------------------------------------------
w6b10_check_selection_layer() {
  w6b10_expect_file "$W6B10_API_SRC/lab-provider-rollout.ts" "rollout policy module"
  w6b10_expect_file "$W6B10_API_SRC/lab-provider-selection.ts" "provider selection module"

  w6b10_expect_match "$W6B10_API_SRC/lab-provider-selection.ts" \
    "chooseLabProvider" "exposes chooseLabProvider"
  w6b10_expect_match "$W6B10_API_SRC/lab-provider-selection.ts" \
    "getLabProvider" "exposes getLabProvider"
  w6b10_expect_match "$W6B10_API_SRC/lab-provider-selection.ts" \
    "resolveLabProviderForSession" "exposes resolveLabProviderForSession"
  w6b10_expect_match "$W6B10_API_SRC/lab-provider-selection.ts" \
    "lab_provider_registry" "reads the lab_provider_registry control plane"
  w6b10_expect_match "$W6B10_API_SRC/lab-provider-selection.ts" \
    "lab_session_provider_references" "reads persisted provider references"
  w6b10_expect_match "$W6B10_API_SRC/lab-provider-selection.ts" \
    "DEPENDENCY_UNAVAILABLE" "preserves DEPENDENCY_UNAVAILABLE failure contract"
}

# ------------------------------------------------------------------
# 2. Rollout policy fields are consulted, deterministically
# ------------------------------------------------------------------
w6b10_check_rollout_policy() {
  local f="$W6B10_API_SRC/lab-provider-rollout.ts"
  w6b10_expect_match "$f" "rollout_mode|rolloutMode" "consults rollout_mode"
  w6b10_expect_match "$f" "rollout_percentage|rolloutPercentage" "consults rollout_percentage"
  w6b10_expect_match "$f" "rollout_allowed_user_ids|rolloutAllowedUserIds" \
    "consults rollout_allowed_user_ids"
  w6b10_expect_match "$f" "activation_state|activationState" "consults activation_state"
  w6b10_expect_match "$f" "createHash\(['\"]sha256['\"]\)" \
    "uses SHA-256 for deterministic bucketing"
  w6b10_expect_match "$f" "tlp:container-rollout:" "uses the namespaced hash input"
  w6b10_expect_absent "$f" "Math[[:space:]]*\.[[:space:]]*random" \
    "rollout must not use Math.random()"
  w6b10_expect_absent "$W6B10_API_SRC/lab-provider-selection.ts" \
    "Math[[:space:]]*\.[[:space:]]*random" "selection must not use Math.random()"
}

# ------------------------------------------------------------------
# 3. Student provisioning uses provider selection, not Mock directly
# ------------------------------------------------------------------
w6b10_check_student_provisioning() {
  w6b10_expect_match "$W6B10_API_SRC/lab-sessions.ts" \
    "chooseLabProvider" "student provisioning uses provider selection"
  w6b10_expect_match "$W6B10_API_SRC/lab-sessions.ts" \
    "getLabProvider|resolveLabProviderForSession" \
    "start/end resolve the persisted provider"
  w6b10_expect_absent "$W6B10_API_SRC/lab-sessions.ts" \
    "mockLabProvider[[:space:]]*\." \
    "no direct mockLabProvider calls in student provisioning"
  w6b10_expect_absent "$W6B10_API_SRC/lab-sessions.ts" \
    "providerId[[:space:]]*!==[[:space:]]*[\"']mock[\"']" \
    "no Mock-only provider guard"
}

# ------------------------------------------------------------------
# 4. Post-provisioning lifecycle resolves the persisted provider
# ------------------------------------------------------------------
w6b10_check_lifecycle_provider_aware() {
  local f
  for f in lab-runtime.ts lab-operations.ts; do
    w6b10_expect_match "$W6B10_API_SRC/$f" \
      "getLabProvider|resolveLabProviderForSession" \
      "$f resolves the persisted provider reference"
    w6b10_expect_absent "$W6B10_API_SRC/$f" \
      "mockLabProvider[[:space:]]*\." "$f has no direct mockLabProvider calls"
    w6b10_expect_absent "$W6B10_API_SRC/$f" \
      "providerId[[:space:]]*!==[[:space:]]*[\"']mock[\"']" \
      "$f has no Mock-only provider guard"
  done

  w6b10_expect_match "$W6B10_API_SRC/lab-runtime.ts" \
    "providerSessionId" "lab-runtime returns providerId and providerSessionId"
  w6b10_expect_match "$W6B10_API_SRC/lab-automation.ts" \
    "chooseLabProvider" "queued provisioning uses provider selection"
}

# ------------------------------------------------------------------
# 4b. Registry is the single control-plane-aware source of truth
# ------------------------------------------------------------------
w6b10_check_control_plane_registry() {
  local f="$W6B10_API_SRC/lab-provider-registry.ts"
  w6b10_expect_match "$f" "lab_provider_registry" "registry reads the persisted control plane"
  w6b10_expect_match "$f" "TLP_CONTAINER_PROVIDER_ENABLED" \
    "runtime enablement is a separate gate from student authorization"
  w6b10_expect_match "$f" "DEPENDENCY_UNAVAILABLE" "DEPENDENCY_UNAVAILABLE contract preserved"
  w6b10_expect_absent "$W6B10_API_SRC/lab-operations.ts" \
    "Unsupported provider for cleanup" "Container is not rejected during cleanup"
}

# ------------------------------------------------------------------
# 5. Shared provider contract declares isolation status
# ------------------------------------------------------------------
w6b10_check_shared_contract() {
  w6b10_expect_match "$W6B10_SHARED_TYPES" \
    "LabProviderIsolationStatus" "shared provider isolation contract exists"
  w6b10_expect_match "$W6B10_SHARED_TYPES" \
    "getIsolationStatus" "LabProvider declares getIsolationStatus"
  w6b10_expect_match "$W6B10_SHARED_TYPES" \
    "studentHasProviderAdminAccess" "isolation contract keeps admin-access assertion"
  w6b10_expect_match "$W6B10_SHARED_TYPES" \
    "managementPlaneExposed" "isolation contract keeps management-plane assertion"
  w6b10_expect_match "$W6B10_SHARED_TYPES" \
    "networkIsolationEnforced" "isolation contract keeps network-isolation assertion"
  w6b10_expect_match "$W6B10_SHARED_TYPES" \
    "resourceOwnershipScoped" "isolation contract keeps ownership-scoping assertion"
}

# ------------------------------------------------------------------
# 6. Container remains disabled by default
# ------------------------------------------------------------------
w6b10_check_container_default_off() {
  W6B10_CHECKS_RUN=$((W6B10_CHECKS_RUN + 1))
  local root offender
  root="$(w6b10_repo_root)"

  # No TypeScript source may hardcode the Container provider as enabled.
  offender="$(grep -RIl --include='*.ts' -E "CONTAINER_PROVIDER_ID|['\"]container['\"]" \
    "$root/$W6B10_API_SRC" 2>/dev/null || true)"
  local file
  for file in $offender; do
    if grep -Eq "providerId:[[:space:]]*['\"]container['\"],?[[:space:]]*$" "$file" &&
      grep -A3 -E "providerId:[[:space:]]*['\"]container['\"]" "$file" |
      grep -Eq "enabled:[[:space:]]*true"; then
      w6b10_fail "CONTAINER DEFAULT-ON: ${file#"$root"/} hardcodes container enabled: true"
    fi
  done

  # Runtime enablement flag must not default to true in committed env samples.
  local env_file
  for env_file in .env.example .env.sample .env.defaults; do
    if [ -f "$root/$env_file" ] &&
      grep -Eq "^[[:space:]]*TLP_CONTAINER_PROVIDER_ENABLED[[:space:]]*=[[:space:]]*true" \
        "$root/$env_file"; then
      w6b10_fail "CONTAINER DEFAULT-ON: $env_file enables the Container runtime by default"
    fi
  done
}

# ------------------------------------------------------------------
# 7. Deterministic validation stays AI-independent
# ------------------------------------------------------------------
w6b10_check_validation_ai_independent() {
  local pattern='@anthropic-ai|from[[:space:]]+["'"'"']openai|require\(["'"'"']openai|ollama|ai-gateway|aiGateway'
  local f
  for f in lab-runtime.ts lab-provider-rollout.ts lab-provider-selection.ts; do
    if [ -f "$(w6b10_path "$W6B10_API_SRC/$f")" ]; then
      w6b10_expect_absent "$W6B10_API_SRC/$f" "$pattern" \
        "$f must not depend on an AI provider"
    fi
  done

  if [ -f "$(w6b10_path "$W6B10_API_SRC/lab-runtime.ts")" ]; then
    w6b10_expect_match "$W6B10_API_SRC/lab-runtime.ts" \
      "runValidationProbe" "validation uses the deterministic provider probe"
  fi
}

# ------------------------------------------------------------------
# Aggregate
# ------------------------------------------------------------------
w6b10_run_all_checks() {
  w6b10_reset
  w6b10_check_shared_contract
  w6b10_check_selection_layer
  w6b10_check_rollout_policy
  w6b10_check_student_provisioning
  w6b10_check_lifecycle_provider_aware
  w6b10_check_control_plane_registry
  w6b10_check_container_default_off
  w6b10_check_validation_ai_independent
  [ -z "$W6B10_FAILURES" ]
}

# Returns 0 (true) when the controlled Container rollout is NOT yet wired into
# the student provisioning / provider-selection path. Used to guard the legacy
# gap message in scripts/verify-lab-engine-completion.sh.
tlp_w6b10_provider_wiring_unwired() {
  w6b10_reset
  w6b10_check_selection_layer
  w6b10_check_rollout_policy
  w6b10_check_student_provisioning
  w6b10_check_lifecycle_provider_aware
  w6b10_check_control_plane_registry
  [ -n "$W6B10_FAILURES" ]
}
