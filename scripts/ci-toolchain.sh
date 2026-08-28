#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# DEV-FLOW-1 — shared repository-wide toolchain step.
#
# Every wave verifier ended with the same block:
#
#   npm run typecheck
#   npm run test
#   npm run build
#   bash scripts/security-scan.sh
#   bash scripts/smoke-api.sh
#
# Those five operations are repository-wide: they say nothing about the wave
# that invoked them, and they produce an identical result no matter which
# verifier runs them. Engine completion gates defer into wave verifiers, so an
# engine-touching CI run executed that block several times over — after the
# hardened CI baseline had already run it once and passed.
#
# This script is that block, in one place, with one explicit escape hatch.
#
# ## Default behaviour is unchanged
#
# Unset -> every requested step runs, exactly as before. A developer running
# `bash scripts/verify-roas1.sh` by hand gets identical behaviour to before this
# change. That is the point: standalone verifier strength is not reduced.
#
# ## Trusted-baseline mode
#
#   TLP_CI_BASELINE_VERIFIED=1
#
# Set ONLY by the hardened workflow's change-relevant step, and only after the
# baseline steps have already succeeded in the same job. It means precisely:
# "the repository-wide toolchain has already run and passed in this job."
#
# The name is deliberate. This must never key off a generic `CI` variable: any
# CI provider sets that, and it would silently disable real verification in a
# context where nothing had actually been verified. The indicator has to be an
# explicit statement of fact by the thing that did the verifying.
#
# ## What this may and may not skip
#
# It may skip ONLY the five steps above, because the hardened baseline runs all
# five itself. It skips nothing else, and it is never invoked for a unique
# structural or engine-specific assertion — those live in the verifiers and run
# in both modes.
#
# Usage:
#   bash scripts/ci-toolchain.sh typecheck test build security smoke
#
# Steps are named explicitly by each caller so a verifier that legitimately runs
# a different subset keeps its exact behaviour.
# ============================================================

if [ "$#" -eq 0 ]; then
  echo "ci-toolchain: no steps requested" >&2
  exit 2
fi

TRUSTED="${TLP_CI_BASELINE_VERIFIED:-}"

if [ "$TRUSTED" = "1" ]; then
  echo "--- repository toolchain: SKIPPED ---"
  echo "TLP_CI_BASELINE_VERIFIED=1 — the hardened CI baseline already ran and"
  echo "passed these repository-wide steps in this job: $*"
  echo "Unique structural and engine assertions are unaffected and still run."
  exit 0
fi

echo ""
echo "--- repository verification ---"

for step in "$@"; do
  case "$step" in
    typecheck) npm run typecheck ;;
    test)      npm run test ;;
    build)     npm run build ;;
    security)  bash scripts/security-scan.sh ;;
    smoke)     bash scripts/smoke-api.sh ;;
    *)
      echo "ci-toolchain: unknown step: $step" >&2
      exit 2
      ;;
  esac
done
