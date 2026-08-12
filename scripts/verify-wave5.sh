#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required=(
  "packages/shared-types/src/notes.ts"
  "packages/shared-types/src/note-blocks.ts"
  "packages/shared-types/src/note-retrieval.ts"
  "packages/shared-types/src/note-export.ts"
  "services/api/src/notes.ts"
  "services/api/src/note-organization.ts"
  "services/api/src/note-retrieval.ts"
  "services/api/src/note-export.ts"
  "supabase/migrations/20260812000500_student_notes_foundation.sql"
  "supabase/migrations/20260812000600_note_blocks_tags_organization.sql"
  "supabase/migrations/20260812000700_note_retrieval_bookmarks.sql"
)

for p in "${required[@]}"; do
  [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }
done

grep -Fq 'buildStudentNoteExport' services/api/src/note-export.ts || { echo "FAIL: note export builder missing"; exit 1; }
grep -Fq 'serializeStudentNoteExport' services/api/src/note-export.ts || { echo "FAIL: note export serializer missing"; exit 1; }
grep -Fq 'noteExportMatch' services/api/src/server.ts || { echo "FAIL: note export route missing"; exit 1; }

# Privacy and ownership hardening.
grep -Fq 'auth.uid()=user_id' supabase/migrations/20260812000500_student_notes_foundation.sql || grep -Fq 'auth.uid() = user_id' supabase/migrations/20260812000500_student_notes_foundation.sql || {
  echo "FAIL: note ownership RLS missing"
  exit 1
}

grep -Fq 'createUserScopedSupabaseClient' services/api/src/notes.ts || { echo "FAIL: notes not user-scoped"; exit 1; }
grep -Fq 'createUserScopedSupabaseClient' services/api/src/note-organization.ts || { echo "FAIL: note organization not user-scoped"; exit 1; }
grep -Fq 'createUserScopedSupabaseClient' services/api/src/note-retrieval.ts || { echo "FAIL: note retrieval not user-scoped"; exit 1; }
grep -Fq 'createUserScopedSupabaseClient' services/api/src/note-export.ts || { echo "FAIL: note export not user-scoped"; exit 1; }

# AI boundary: notes remain functional without any AI provider dependency.
if grep -R -nE 'anthropic|openai|ollama|ai gateway|AIGW'   packages/shared-types/src/notes.ts   packages/shared-types/src/note-blocks.ts   packages/shared-types/src/note-retrieval.ts   packages/shared-types/src/note-export.ts   services/api/src/notes.ts   services/api/src/note-organization.ts   services/api/src/note-retrieval.ts   services/api/src/note-export.ts; then
  echo "FAIL: Wave 5 notes path contains premature AI dependency"
  exit 1
fi

# Note bodies must not be intentionally sent to application logging.
if grep -R -nE 'logger\.(info|warn|error|debug).*body|console\.(log|info|warn|error).*body'   services/api/src/notes.ts   services/api/src/note-organization.ts   services/api/src/note-retrieval.ts   services/api/src/note-export.ts; then
  echo "FAIL: possible note body logging detected"
  exit 1
fi

# Stored command/code/output is data, not an execution primitive.
if grep -R -nE 'child_process|execSync|spawnSync|\bexec\(|\bspawn\('   services/api/src/notes.ts   services/api/src/note-organization.ts   services/api/src/note-retrieval.ts   services/api/src/note-export.ts; then
  echo "FAIL: executable command path detected in Notes engine"
  exit 1
fi

echo "PASS: note export is private and user-scoped"
echo "PASS: note CRUD/retrieval/organization paths preserve user ownership"
echo "PASS: notes have no premature AI dependency"
echo "PASS: no intentional note-body logging pattern detected"
echo "PASS: command/code/output remains inert data"

npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh

echo "Wave 5 Batch 4 verification passed."
