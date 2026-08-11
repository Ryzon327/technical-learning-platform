#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Technical Learning Platform — bootstrap"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 22+ is required."
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "ERROR: Node.js 22+ is required. Current: $(node --version)"
  exit 1
fi

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

npm run health
npm run verify

echo
echo "Bootstrap complete."
echo "Start the web shell with: npm run dev"
echo "Start the API with: npm run dev:api"
