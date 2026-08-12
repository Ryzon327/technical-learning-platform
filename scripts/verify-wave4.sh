#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
required=(
  "packages/shared-types/src/assessment.ts"
  "services/api/src/assessments.ts"
  "supabase/migrations/20260812000100_assessment_foundation.sql"
)
for path in "${required[@]}"; do [ -e "$path" ] || { echo "MISSING: $path"; exit 1; }; done

grep -Fq 'scoreAssessment' packages/shared-types/src/assessment.ts || { echo "FAIL: deterministic scoring contract missing"; exit 1; }
grep -Fq "evidence_producing" supabase/migrations/20260812000100_assessment_foundation.sql || { echo "FAIL: assessment purpose classification missing"; exit 1; }
grep -Fq 'correct_option_ids' supabase/migrations/20260812000100_assessment_foundation.sql || { echo "FAIL: server-authoritative answer key storage missing"; exit 1; }
grep -Fq 'listPublishedAssessments' services/api/src/server.ts || { echo "FAIL: assessment route missing"; exit 1; }

echo "Wave 4 Batch 1 deterministic assessment structure verified."
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh
echo "Wave 4 Batch 1 verification passed."
