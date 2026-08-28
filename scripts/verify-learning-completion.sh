#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "===== LEARNING ENGINE COMPLETION CHECK ====="

spec_dir="docs/Feature-Registry/Learning-Engine"

if [ ! -d "$spec_dir" ]; then
  echo "FAIL: Learning Engine feature registry directory is missing."
  exit 1
fi

spec_count=0
unapproved=0

while IFS= read -r spec; do
  [ -z "$spec" ] && continue
  spec_count=$((spec_count + 1))
  if ! grep -Fq -- "- [x] Approved" "$spec"; then
    echo "FAIL: Learning specification is not approved: $spec"
    unapproved=$((unapproved + 1))
  fi
done < <(find "$spec_dir" -maxdepth 1 -type f -name 'LEARN-*.md' | LC_ALL=C sort)

if [ "$spec_count" -ne 8 ]; then
  echo "FAIL: Expected 8 LEARN feature specifications; found $spec_count."
  exit 1
fi

if [ "$unapproved" -ne 0 ]; then
  exit 1
fi

required_files=(
  "packages/shared-types/src/learning.ts"
  "packages/shared-types/src/learning-navigation.ts"
  "packages/shared-types/src/competency.ts"
  "packages/shared-types/src/learning-guidance.ts"
  "services/api/src/learning-progress.ts"
  "services/api/src/learning-navigation.ts"
  "services/api/src/competency.ts"
  "services/api/src/learning-guidance.ts"
  "supabase/migrations/20260811000700_learning_progress_foundation.sql"
  "supabase/migrations/20260811000800_learning_resume_prerequisites.sql"
  "supabase/migrations/20260811000900_competency_state_foundation.sql"
  "supabase/migrations/20260811001000_learning_history_review.sql"
)

for path in "${required_files[@]}"; do
  if [ ! -f "$path" ]; then
    echo "FAIL: missing Learning Engine implementation file: $path"
    exit 1
  fi
done

grep -Fq 'auth.uid() = user_id' supabase/migrations/20260811000700_learning_progress_foundation.sql \
  || { echo "FAIL: student progress ownership RLS is missing."; exit 1; }

grep -Fq 'record_mission_progress' supabase/migrations/20260811000700_learning_progress_foundation.sql \
  || { echo "FAIL: deterministic mission progress transition function is missing."; exit 1; }

grep -Fq 'selectResumeTarget' packages/shared-types/src/learning-navigation.ts \
  || { echo "FAIL: deterministic resume selection is missing."; exit 1; }

grep -Fq 'evaluatePrerequisiteRules' packages/shared-types/src/learning-navigation.ts \
  || { echo "FAIL: deterministic prerequisite evaluation is missing."; exit 1; }

grep -Fq 'learning_requirement_satisfactions' supabase/migrations/20260811000800_learning_resume_prerequisites.sql \
  || { echo "FAIL: readiness/competency authoritative integration bridge is missing."; exit 1; }

grep -Fq 'decideCompetencyTransition' packages/shared-types/src/competency.ts \
  || { echo "FAIL: deterministic competency advancement is missing."; exit 1; }

grep -Fq 'student_competency_state_events' supabase/migrations/20260811000900_competency_state_foundation.sql \
  || { echo "FAIL: competency transition history is missing."; exit 1; }

grep -Fq 'recommendNextAction' packages/shared-types/src/learning-guidance.ts \
  || { echo "FAIL: deterministic next-action logic is missing."; exit 1; }

grep -Fq 'student_learning_history' supabase/migrations/20260811001000_learning_history_review.sql \
  || { echo "FAIL: learning history persistence is missing."; exit 1; }

grep -Fq 'student_review_state' supabase/migrations/20260811001000_learning_history_review.sql \
  || { echo "FAIL: review/reinforcement state persistence is missing."; exit 1; }

grep -Fq 'getLearningPathProgress' services/api/src/server.ts \
  || { echo "FAIL: progress route is not wired."; exit 1; }

grep -Fq 'getResumeTarget' services/api/src/server.ts \
  || { echo "FAIL: resume route is not wired."; exit 1; }

grep -Fq 'evaluateMissionPrerequisites' services/api/src/server.ts \
  || { echo "FAIL: prerequisite route is not wired."; exit 1; }

grep -Fq 'listStudentCompetencyState' services/api/src/server.ts \
  || { echo "FAIL: competency route is not wired."; exit 1; }

grep -Fq 'getRecommendedNextAction' services/api/src/server.ts \
  || { echo "FAIL: next-action route is not wired."; exit 1; }

grep -Fq 'listLearningHistory' services/api/src/server.ts \
  || { echo "FAIL: learning history route is not wired."; exit 1; }

grep -Fq 'listReviewState' services/api/src/server.ts \
  || { echo "FAIL: review state route is not wired."; exit 1; }

grep -Fq 'LEARN-005' docs/Engineering-OS/BUILD_WAVE_3_LEARNING_ENGINE_COMPLETION_REVIEW.md \
  || { echo "FAIL: LEARN-005 assessment/test-out boundary is not documented."; exit 1; }

echo "PASS: all 8 Learning Engine specifications exist and are approved"
echo "PASS: required Learning Engine implementation files exist"
echo "PASS: progress ownership and deterministic transition controls are present"
echo "PASS: resume and prerequisite logic are present"
echo "PASS: readiness/test-out authoritative integration boundary is present"
echo "PASS: competency advancement and transition history are present"
echo "PASS: next-action, learning-history, and review-state features are present"
echo "PASS: Learning API routes are wired"
echo "PASS: LEARN-005 boundary is documented"

echo
echo "Running Wave 3 verification..."
bash scripts/verify-wave3.sh

echo
echo "LEARNING ENGINE COMPLETION CHECK PASSED"
