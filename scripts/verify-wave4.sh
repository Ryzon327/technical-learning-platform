#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/assessment-recovery.ts"
  "services/api/src/assessment-recovery.ts"
  "supabase/migrations/20260812000400_assessment_recovery_integrity.sql"
)

for path in "${required[@]}"; do
  [ -e "$path" ] || { echo "MISSING: $path"; exit 1; }
done

grep -Fq 'resumeInterruptedAssessmentAttempt' services/api/src/assessment-recovery.ts || { echo "FAIL: interruption recovery missing"; exit 1; }
grep -Fq 'preservedAnswerCount' services/api/src/assessment-recovery.ts || { echo "FAIL: preserved-answer signal missing"; exit 1; }
grep -Fq 'createHash' services/api/src/assessment-recovery.ts || { echo "FAIL: result digest missing"; exit 1; }
grep -Fq 'assessment_evidence_handoffs' supabase/migrations/20260812000400_assessment_recovery_integrity.sql || { echo "FAIL: evidence handoff persistence missing"; exit 1; }
grep -Fq 'buildAssessmentEvidenceHandoff' services/api/src/assessment-attempts.ts || { echo "FAIL: evidence handoff not invoked"; exit 1; }
grep -Fq 'assessmentInterruptMatch' services/api/src/server.ts || { echo "FAIL: interruption route missing"; exit 1; }
grep -Fq 'assessmentResumeMatch' services/api/src/server.ts || { echo "FAIL: resume route missing"; exit 1; }

if grep -R -n 'correctOptionIds' apps/web/src 2>/dev/null; then
  echo "FAIL: browser source references answer keys"
  exit 1
fi

echo "Wave 4 Batch 4 recovery/integrity/handoff structure verified."
bash scripts/ci-toolchain.sh typecheck test build security smoke
echo "Wave 4 Batch 4 verification passed."
