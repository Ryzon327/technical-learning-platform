#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/notes.ts"
  "packages/shared-types/src/note-blocks.ts"
  "services/api/src/notes.ts"
  "services/api/src/note-organization.ts"
  "supabase/migrations/20260812000500_student_notes_foundation.sql"
  "supabase/migrations/20260812000600_note_blocks_tags_organization.sql"
)

for p in "${required[@]}"; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

grep -Fq "'command'" supabase/migrations/20260812000600_note_blocks_tags_organization.sql || { echo "FAIL: command block missing"; exit 1; }
grep -Fq "'terminal_output'" supabase/migrations/20260812000600_note_blocks_tags_organization.sql || { echo "FAIL: terminal output block missing"; exit 1; }
grep -Fq 'student_note_tags' supabase/migrations/20260812000600_note_blocks_tags_organization.sql || { echo "FAIL: tag model missing"; exit 1; }
grep -Fq 'student_note_tag_assignments' supabase/migrations/20260812000600_note_blocks_tags_organization.sql || { echo "FAIL: tag assignment model missing"; exit 1; }
grep -Fq 'pinned boolean' supabase/migrations/20260812000600_note_blocks_tags_organization.sql || { echo "FAIL: pin state missing"; exit 1; }
grep -Fq 'createUserScopedSupabaseClient' services/api/src/note-organization.ts || { echo "FAIL: user-scoped organization API missing"; exit 1; }
grep -Fq 'noteContainsUnsafeMarkup' services/api/src/note-organization.ts || { echo "FAIL: inert content protection missing"; exit 1; }
grep -Fq 'pathname === "/note-tags"' services/api/src/server.ts || { echo "FAIL: tag routes missing"; exit 1; }
grep -Fq 'noteBlocksMatch' services/api/src/server.ts || { echo "FAIL: block routes missing"; exit 1; }
grep -Fq 'notePinnedMatch' services/api/src/server.ts || { echo "FAIL: pin route missing"; exit 1; }

echo "Wave 5 Batch 2 technical blocks and lightweight organization structure verified."
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh
echo "Wave 5 Batch 2 verification passed."
