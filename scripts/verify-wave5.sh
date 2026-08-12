#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/notes.ts"
  "packages/shared-types/src/note-blocks.ts"
  "packages/shared-types/src/note-retrieval.ts"
  "services/api/src/notes.ts"
  "services/api/src/note-organization.ts"
  "services/api/src/note-retrieval.ts"
  "supabase/migrations/20260812000500_student_notes_foundation.sql"
  "supabase/migrations/20260812000600_note_blocks_tags_organization.sql"
  "supabase/migrations/20260812000700_note_retrieval_bookmarks.sql"
)

for p in "${required[@]}"; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

grep -Fq 'searchStudentNotes' services/api/src/note-retrieval.ts || { echo "FAIL: private note search missing"; exit 1; }
grep -Fq 'student_note_blocks' services/api/src/note-retrieval.ts || { echo "FAIL: block search missing"; exit 1; }
grep -Fq 'student_note_tag_assignments' services/api/src/note-retrieval.ts || { echo "FAIL: tag filtering missing"; exit 1; }
grep -Fq 'student_note_contexts' services/api/src/note-retrieval.ts || { echo "FAIL: context filtering missing"; exit 1; }
grep -Fq 'student_bookmarks' supabase/migrations/20260812000700_note_retrieval_bookmarks.sql || { echo "FAIL: bookmark model missing"; exit 1; }
grep -Fq 'enable row level security' supabase/migrations/20260812000700_note_retrieval_bookmarks.sql || { echo "FAIL: bookmark RLS missing"; exit 1; }
grep -Fq 'pathname === "/notes/search"' services/api/src/server.ts || { echo "FAIL: private note search route missing"; exit 1; }
grep -Fq 'pathname === "/bookmarks"' services/api/src/server.ts || { echo "FAIL: bookmark routes missing"; exit 1; }

echo "Wave 5 Batch 3 private retrieval, context filtering, and bookmark structure verified."
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh
echo "Wave 5 Batch 3 verification passed."
