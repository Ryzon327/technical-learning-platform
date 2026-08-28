#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "===== CURRICULUM ENGINE COMPLETION CHECK ====="

spec_dir="docs/Feature-Registry/Curriculum-Engine"

if [ ! -d "$spec_dir" ]; then
  echo "FAIL: Curriculum Engine feature registry directory is missing."
  exit 1
fi

mapfile_cmd=""
if command -v mapfile >/dev/null 2>&1; then
  mapfile_cmd="yes"
fi

spec_count=0
unapproved=0

while IFS= read -r spec; do
  [ -z "$spec" ] && continue
  spec_count=$((spec_count + 1))

  if ! grep -Fq -- "- [x] Approved" "$spec"; then
    echo "FAIL: Curriculum specification is not approved: $spec"
    unapproved=$((unapproved + 1))
  fi
done < <(find "$spec_dir" -maxdepth 1 -type f -name 'CURR-*.md' | LC_ALL=C sort)

if [ "$spec_count" -eq 0 ]; then
  echo "FAIL: No CURR-* feature specifications were found."
  exit 1
fi

if [ "$unapproved" -ne 0 ]; then
  exit 1
fi

required_files=(
  "packages/shared-types/src/curriculum.ts"
  "packages/shared-types/src/curriculum-admin.ts"
  "packages/shared-types/src/curriculum-quality.ts"
  "services/api/src/curriculum.ts"
  "services/api/src/curriculum-admin.ts"
  "services/api/src/curriculum-quality.ts"
  "supabase/migrations/20260811000300_curriculum_foundation.sql"
  "supabase/migrations/20260811000400_curriculum_authoring_publication.sql"
  "supabase/migrations/20260811000500_curriculum_tree_publication.sql"
  "supabase/migrations/20260811000600_curriculum_quality_assets.sql"
)

for path in "${required_files[@]}"; do
  if [ ! -f "$path" ]; then
    echo "FAIL: missing Curriculum implementation file: $path"
    exit 1
  fi
done

if ! grep -Fq "publication_state = 'published'" \
  supabase/migrations/20260811000300_curriculum_foundation.sql; then
  echo "FAIL: published-only curriculum visibility rule was not found."
  exit 1
fi

if ! grep -Fq 'requireFounderAdmin' services/api/src/server.ts; then
  echo "FAIL: Founder/admin curriculum authorization is not wired."
  exit 1
fi

if ! grep -Fq 'validateLearningPathForPublication' \
  services/api/src/curriculum-admin.ts; then
  echo "FAIL: structural publication validation is not wired."
  exit 1
fi

if ! grep -Fq 'buildLearningPathQualityReport' \
  services/api/src/curriculum-admin.ts; then
  echo "FAIL: curriculum quality publication gate is not wired."
  exit 1
fi

if ! grep -Fq 'curriculum_publish_learning_path_tree' \
  services/api/src/curriculum-admin.ts; then
  echo "FAIL: coherent full-tree publication is not wired."
  exit 1
fi

if ! grep -Fq 'curriculum_publication_events' \
  supabase/migrations/20260811000400_curriculum_authoring_publication.sql; then
  echo "FAIL: curriculum publication history is missing."
  exit 1
fi

if ! grep -Fq 'curriculum_assets' \
  supabase/migrations/20260811000600_curriculum_quality_assets.sql; then
  echo "FAIL: curriculum asset registry is missing."
  exit 1
fi

if ! grep -Fq 'curriculum_version_lineage' \
  supabase/migrations/20260811000600_curriculum_quality_assets.sql; then
  echo "FAIL: curriculum version-lineage foundation is missing."
  exit 1
fi

echo "PASS: $spec_count Curriculum feature specifications exist and are approved"
echo "PASS: required Curriculum implementation files exist"
echo "PASS: published-only student visibility is present"
echo "PASS: Founder/admin authoring authorization is wired"
echo "PASS: structural publication validation is wired"
echo "PASS: quality publication validation is wired"
echo "PASS: coherent full-tree publication is wired"
echo "PASS: publication history is present"
echo "PASS: curriculum asset registry is present"
echo "PASS: version-lineage foundation is present"

echo
echo "Running Wave 2 verification..."
bash scripts/verify-wave2.sh

echo
echo "CURRICULUM ENGINE COMPLETION CHECK PASSED"
