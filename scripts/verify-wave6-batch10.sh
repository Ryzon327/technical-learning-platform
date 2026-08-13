#!/usr/bin/env bash
#
# Wave 6 / Batch 10 verifier — Provider-Aware Student Runtime +
# Controlled Container Rollout Integration.
#
# Usage:
#   scripts/verify-wave6-batch10.sh [--skip-typecheck] [--skip-baseline]
#
# Exit codes:
#   0  all checks passed
#   1  one or more checks failed
#   2  environment problem (cannot run)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 2
export W6B10_REPO_ROOT="$REPO_ROOT"

SKIP_TYPECHECK=0
SKIP_BASELINE=0
for arg in "$@"; do
  case "$arg" in
    --skip-typecheck) SKIP_TYPECHECK=1 ;;
    --skip-baseline) SKIP_BASELINE=1 ;;
    -h | --help)
      sed -n '2,12p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

PASS_COUNT=0
FAIL_COUNT=0

section() { printf '\n=== %s ===\n' "$1"; }
ok() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '  PASS  %s\n' "$1"
}
bad() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf '  FAIL  %s\n' "$1"
}
note() { printf '  ....  %s\n' "$1"; }

CHECKS_LIB="$REPO_ROOT/scripts/lib/w6b10-provider-wiring-checks.sh"
if [ ! -f "$CHECKS_LIB" ]; then
  echo "FATAL: missing $CHECKS_LIB" >&2
  exit 2
fi
# shellcheck source=/dev/null
. "$CHECKS_LIB"

# ------------------------------------------------------------------
section "1. Shared provider contract"
# ------------------------------------------------------------------
w6b10_reset
w6b10_check_shared_contract
if [ -z "$W6B10_FAILURES" ]; then
  ok "LabProvider declares getIsolationStatus with the shared isolation contract"
else
  while IFS= read -r line; do [ -n "$line" ] && bad "$line"; done <<<"$(w6b10_report)"
fi

# ------------------------------------------------------------------
section "2. Provider-aware architecture"
# ------------------------------------------------------------------
w6b10_reset
w6b10_check_selection_layer
w6b10_check_lifecycle_provider_aware
w6b10_check_control_plane_registry
if [ -z "$W6B10_FAILURES" ]; then
  ok "selection layer present; runtime/operations/automation resolve persisted providers"
else
  while IFS= read -r line; do [ -n "$line" ] && bad "$line"; done <<<"$(w6b10_report)"
fi

# ------------------------------------------------------------------
section "3. Rollout policy integration"
# ------------------------------------------------------------------
w6b10_reset
w6b10_check_rollout_policy
if [ -z "$W6B10_FAILURES" ]; then
  ok "rollout_mode / rollout_percentage / rollout_allowed_user_ids / activation_state consulted"
  ok "deterministic SHA-256 bucketing, no Math.random()"
else
  while IFS= read -r line; do [ -n "$line" ] && bad "$line"; done <<<"$(w6b10_report)"
fi

# ------------------------------------------------------------------
section "4. No direct Mock-only student provisioning path"
# ------------------------------------------------------------------
w6b10_reset
w6b10_check_student_provisioning
if [ -z "$W6B10_FAILURES" ]; then
  ok "requestLabSession selects a provider; no hardcoded mockLabProvider path"
else
  while IFS= read -r line; do [ -n "$line" ] && bad "$line"; done <<<"$(w6b10_report)"
fi

# ------------------------------------------------------------------
section "5. Container default-off posture"
# ------------------------------------------------------------------
w6b10_reset
w6b10_check_container_default_off
if [ -z "$W6B10_FAILURES" ]; then
  ok "Container is not enabled by default in source or committed env samples"
else
  while IFS= read -r line; do [ -n "$line" ] && bad "$line"; done <<<"$(w6b10_report)"
fi

# ------------------------------------------------------------------
section "6. AI-independent deterministic validation"
# ------------------------------------------------------------------
w6b10_reset
w6b10_check_validation_ai_independent
if [ -z "$W6B10_FAILURES" ]; then
  ok "validation truth derives from provider probes only"
else
  while IFS= read -r line; do [ -n "$line" ] && bad "$line"; done <<<"$(w6b10_report)"
fi

# ------------------------------------------------------------------
section "7. Typecheck"
# ------------------------------------------------------------------
if [ "$SKIP_TYPECHECK" -eq 1 ]; then
  note "skipped (--skip-typecheck)"
elif [ -n "${TLP_W6B10_TYPECHECK_CMD:-}" ]; then
  if eval "$TLP_W6B10_TYPECHECK_CMD" >/tmp/w6b10-typecheck.log 2>&1; then
    ok "typecheck (custom command)"
  else
    bad "typecheck failed (see /tmp/w6b10-typecheck.log)"
  fi
elif command -v npm >/dev/null 2>&1 && grep -q '"typecheck"' package.json 2>/dev/null; then
  if npm run --silent typecheck >/tmp/w6b10-typecheck.log 2>&1; then
    ok "npm run typecheck"
  else
    bad "npm run typecheck failed (see /tmp/w6b10-typecheck.log)"
  fi
elif npx --no-install tsc --version >/dev/null 2>&1; then
  if npx --no-install tsc --noEmit >/tmp/w6b10-typecheck.log 2>&1; then
    ok "tsc --noEmit"
  else
    bad "tsc --noEmit failed (see /tmp/w6b10-typecheck.log)"
  fi
else
  note "no typecheck command available; set TLP_W6B10_TYPECHECK_CMD to enable"
fi

# ------------------------------------------------------------------
section "8. Batch 10 tests"
# ------------------------------------------------------------------
TEST_FILES=(
  tests/wave6-batch10/lab-provider-rollout.w6b10.test.ts
  tests/wave6-batch10/lab-provider-selection.w6b10.test.ts
  tests/wave6-batch10/lab-session-lifecycle.w6b10.test.ts
  tests/wave6-batch10/lab-integration-wiring.w6b10.test.ts
)

missing_test=0
for f in "${TEST_FILES[@]}"; do
  [ -f "$f" ] || {
    bad "missing test file: $f"
    missing_test=1
  }
done

run_tests() {
  if [ -n "${TLP_W6B10_TEST_CMD:-}" ]; then
    note "using TLP_W6B10_TEST_CMD"
    eval "$TLP_W6B10_TEST_CMD"
    return $?
  fi

  if npx --no-install tsx --version >/dev/null 2>&1; then
    note "runner: tsx --test"
    npx --no-install tsx --test "${TEST_FILES[@]}"
    return $?
  fi

  if npx --no-install tsc --version >/dev/null 2>&1; then
    note "runner: tsc build + node --test"
    rm -rf .w6b10-testbuild
    npx --no-install tsc \
      --outDir .w6b10-testbuild \
      --rootDir . \
      --target es2022 \
      --module commonjs \
      --moduleResolution node \
      --skipLibCheck \
      --noEmitOnError false \
      services/api/src/lab-provider-rollout.ts \
      services/api/src/lab-provider-selection.ts \
      "${TEST_FILES[@]}" >/tmp/w6b10-testbuild.log 2>&1
    if [ ! -d .w6b10-testbuild/tests/wave6-batch10 ]; then
      echo "test build produced no output (see /tmp/w6b10-testbuild.log)" >&2
      return 1
    fi
    node --test .w6b10-testbuild/tests/wave6-batch10/*.test.js
    local rc=$?
    rm -rf .w6b10-testbuild
    return $rc
  fi

  echo "no usable TypeScript test runner found" >&2
  return 2
}

if [ "$missing_test" -eq 0 ]; then
  if run_tests >/tmp/w6b10-tests.log 2>&1; then
    ok "Batch 10 tests passed ($(grep -cE '^ok ' /tmp/w6b10-tests.log 2>/dev/null || echo '?') assertions/cases)"
  else
    bad "Batch 10 tests failed (see /tmp/w6b10-tests.log)"
    tail -n 25 /tmp/w6b10-tests.log | sed 's/^/        /'
  fi
fi

# ------------------------------------------------------------------
section "9. Existing Wave 6 baseline"
# ------------------------------------------------------------------
BASELINE="$REPO_ROOT/scripts/verify-lab-engine-completion.sh"
if [ "$SKIP_BASELINE" -eq 1 ]; then
  note "skipped (--skip-baseline)"
elif [ ! -f "$BASELINE" ]; then
  bad "missing scripts/verify-lab-engine-completion.sh"
else
  if grep -q "tlp_w6b10_provider_wiring_unwired" "$BASELINE"; then
    ok "completion verifier is aware of the Batch 10 provider wiring"
  else
    bad "completion verifier was not updated by apply-wave6-batch10.py"
  fi
  if bash "$BASELINE" >/tmp/w6b10-baseline.log 2>&1; then
    ok "scripts/verify-lab-engine-completion.sh passed"
  else
    bad "scripts/verify-lab-engine-completion.sh failed (see /tmp/w6b10-baseline.log)"
    tail -n 25 /tmp/w6b10-baseline.log | sed 's/^/        /'
  fi
  if grep -q "GAP: controlled Container Provider rollout is not wired" /tmp/w6b10-baseline.log 2>/dev/null; then
    bad "completion verifier still reports the controlled-rollout wiring gap"
  else
    ok "controlled-rollout wiring gap is no longer reported"
  fi
fi

# ------------------------------------------------------------------
printf '\n============================================\n'
printf 'Wave 6 / Batch 10 verification: %d passed, %d failed\n' "$PASS_COUNT" "$FAIL_COUNT"
printf '============================================\n'

[ "$FAIL_COUNT" -eq 0 ]
