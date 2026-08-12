#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
required=(packages/shared-types/src/labs.ts services/api/src/mock-lab-provider.ts supabase/migrations/20260812000800_lab_definition_foundation.sql)
for p in "${required[@]}"; do [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }; done
grep -Fq 'export interface LabProvider' packages/shared-types/src/labs.ts || { echo 'FAIL: provider contract missing'; exit 1; }
grep -Fq 'validateLabDefinition' packages/shared-types/src/labs.ts || { echo 'FAIL: definition validation missing'; exit 1; }
grep -Fq 'class MockLabProvider' services/api/src/mock-lab-provider.ts || { echo 'FAIL: mock provider missing'; exit 1; }
if grep -R -nE 'proxmox|@aws-sdk|dockerode|podman' packages/shared-types/src/labs.ts services/api/src/mock-lab-provider.ts; then echo 'FAIL: provider-specific dependency leaked into Wave 6 foundation'; exit 1; fi
if grep -R -nE 'password|api[_-]?key|secret|token' services/api/src/mock-lab-provider.ts; then echo 'FAIL: mock provider appears to require credentials'; exit 1; fi
echo 'PASS: provider-independent lab definition contract present'
echo 'PASS: provider interface and deterministic Mock Provider present'
echo 'PASS: no Proxmox/container/cloud SDK coupling in foundation'
echo 'PASS: Mock Provider requires no infrastructure credentials'
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh
echo 'Wave 6 Batch 1 verification passed.'
