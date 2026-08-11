#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "===== SECURITY BASELINE SCAN ====="

# Runtime environment files must never be committed.
if git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '(^|/)\.env\.example$' >/tmp/tlp_env_files 2>/dev/null; then
  echo "FAIL: committed environment file detected:"
  cat /tmp/tlp_env_files
  exit 1
fi

echo "PASS: no committed runtime .env files"

python3 - <<'PY'
from pathlib import Path
import re
import subprocess
import sys

excluded_prefixes = (
    "docs/",
    ".github/",
)

excluded_files = {
    "package-lock.json",
}

tracked = subprocess.check_output(
    ["git", "ls-files"],
    text=True
).splitlines()

patterns = [
    (
        "private key",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")
    ),
    (
        "AWS access key",
        re.compile(r"\bAKIA[0-9A-Z]{16}\b")
    ),
    (
        "API secret",
        re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")
    ),
    (
        "hardcoded protected environment credential",
        re.compile(
            r"""(?ix)
            \b(
                SUPABASE_SERVICE_ROLE_KEY|
                ANTHROPIC_API_KEY|
                OPENAI_API_KEY
            )\b
            \s*[:=]\s*
            ["']
            [^"']{16,}
            ["']
            """
        )
    ),
]

matches = []

for name in tracked:
    if name in excluded_files or name.startswith(excluded_prefixes):
        continue

    path = Path(name)

    try:
        text = path.read_text(errors="ignore")
    except Exception:
        continue

    for line_number, line in enumerate(text.splitlines(), start=1):
        for label, pattern in patterns:
            if pattern.search(line):
                matches.append(
                    f"{name}:{line_number}: possible {label}: {line.strip()}"
                )

if matches:
    print("FAIL: possible committed secret detected:")
    for match in matches:
        print(match)
    sys.exit(1)

print("PASS: no obvious hardcoded credential patterns detected")
PY

npm audit --audit-level=high

echo "PASS: npm audit has no high/critical findings"
echo "Security baseline scan complete."
