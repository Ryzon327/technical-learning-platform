#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "===== LOCAL HEALTH CHECK ====="

required_commands=(node npm git)
for cmd in "${required_commands[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "FAIL: required command missing: $cmd"
    exit 1
  fi
done

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "FAIL: Node.js 22+ required. Current: $(node --version)"
  exit 1
fi

echo "PASS: Node $(node --version)"
echo "PASS: npm $(npm --version)"
echo "PASS: git $(git --version)"

if [ ! -f package-lock.json ]; then
  echo "FAIL: package-lock.json is required for reproducible CI."
  exit 1
fi

echo "PASS: package-lock.json present"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "WARN: tracked working tree changes exist."
else
  echo "PASS: tracked working tree clean"
fi

echo "Local health check complete."
