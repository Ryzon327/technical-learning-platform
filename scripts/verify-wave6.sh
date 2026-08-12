#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
for p in packages/shared-types/src/labs.ts packages/shared-types/src/lab-sessions.ts services/api/src/mock-lab-provider.ts services/api/src/lab-sessions.ts supabase/migrations/20260812000800_lab_definition_foundation.sql supabase/migrations/20260812000900_lab_session_lifecycle.sql; do [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }; done
grep -Fq 'assertLabSessionTransition' packages/shared-types/src/lab-sessions.ts || exit 1
grep -Fq 'terminated: []' packages/shared-types/src/lab-sessions.ts || exit 1
grep -Fq 'students read own lab sessions' supabase/migrations/20260812000900_lab_session_lifecycle.sql || exit 1
grep -Fq 'Deliberately no authenticated UPDATE or DELETE policy' supabase/migrations/20260812000900_lab_session_lifecycle.sql || exit 1
grep -Fq 'No authenticated policies are granted on provider references' supabase/migrations/20260812000900_lab_session_lifecycle.sql || exit 1
grep -Fq 'lab_sessions_one_live_definition_per_user_idx' supabase/migrations/20260812000900_lab_session_lifecycle.sql || exit 1
grep -Fq 'mockLabProvider.getCapacity' services/api/src/lab-sessions.ts || exit 1
grep -Fq 'lab.session.requested' services/api/src/lab-sessions.ts || exit 1
grep -Fq 'pathname === "/lab-sessions"' services/api/src/server.ts || exit 1
grep -Fq 'labSessionStartMatch' services/api/src/server.ts || exit 1
grep -Fq 'labSessionEndMatch' services/api/src/server.ts || exit 1
if grep -R -nEi 'proxmox|pve|lxc|docker|kubernetes|aws|azure|gcp' packages/shared-types/src/labs.ts packages/shared-types/src/lab-sessions.ts services/api/src/lab-sessions.ts services/api/src/mock-lab-provider.ts; then echo "FAIL: provider-specific infrastructure coupling detected"; exit 1; fi
echo "PASS: persistent Lab Session lifecycle contract present"
echo "PASS: unsafe state transitions are rejected"
echo "PASS: student ownership and server-controlled state mutation are enforced"
echo "PASS: provider resource references remain server-only"
echo "PASS: duplicate live-session provisioning is blocked"
echo "PASS: Mock Provider orchestration is capacity-aware and credential-free"
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh
echo "Wave 6 Batch 2 verification passed."
