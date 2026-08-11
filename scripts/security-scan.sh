#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "===== SECURITY BASELINE SCAN ====="

if git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '(^|/)\.env\.example$' >/tmp/tlp_env_files 2>/dev/null; then
  echo "FAIL: committed environment file detected:"
  cat /tmp/tlp_env_files
  exit 1
fi

echo "PASS: no committed runtime .env files"

tracked="$(git ls-files   ':!:package-lock.json'   ':!:docs/**'   ':!:.github/**')"

if [ -n "$tracked" ]; then
  if grep -nEi     '(-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[^[:space:]]+|ANTHROPIC_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]]+|OPENAI_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]]+)'     $tracked >/tmp/tlp_secret_matches 2>/dev/null; then
    echo "FAIL: possible committed secret detected:"
    cat /tmp/tlp_secret_matches
    exit 1
  fi
fi

echo "PASS: no obvious credential patterns detected"

npm audit --audit-level=high

echo "PASS: npm audit has no high/critical findings"
echo "Security baseline scan complete."
