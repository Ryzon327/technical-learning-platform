#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "===== KNOWLEDGE / NOTES ENGINE COMPLETION CHECK ====="

spec_dir="docs/Feature-Registry/Knowledge-Engine"
if [ ! -d "$spec_dir" ]; then
  # tolerate earlier directory naming if the repo uses it
  spec_dir="docs/Feature-Registry/Knowledge-and-Notes-Engine"
fi

if [ ! -d "$spec_dir" ]; then
  echo "FAIL: Knowledge Engine feature registry directory not found."
  exit 1
fi

spec_count=$(find "$spec_dir" -maxdepth 1 -type f -name 'KNOW-*.md' | wc -l | tr -d ' ')
if [ "$spec_count" -lt 8 ]; then
  echo "FAIL: expected at least 8 KNOW feature specifications; found $spec_count."
  exit 1
fi

unapproved=0
while IFS= read -r file; do
  if ! grep -Fq -- "- [x] Approved" "$file"; then
    echo "FAIL: Knowledge specification is not marked approved: $file"
    unapproved=1
  fi
done < <(find "$spec_dir" -maxdepth 1 -type f -name 'KNOW-*.md' | sort)

if [ "$unapproved" -ne 0 ]; then
  exit 1
fi

echo "PASS: KNOW-001 through KNOW-008 specifications exist and are approved"

required_files=(
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

for path in "${required_files[@]}"; do
  if [ ! -f "$path" ]; then
    echo "FAIL: missing required Wave 5 implementation file: $path"
    exit 1
  fi
done

echo "PASS: required Knowledge/Notes implementation files exist"

grep -Fq 'student_notes' supabase/migrations/20260812000500_student_notes_foundation.sql \
  || { echo "FAIL: private student note model missing."; exit 1; }

grep -Fq 'enable row level security' supabase/migrations/20260812000500_student_notes_foundation.sql \
  || { echo "FAIL: note RLS missing."; exit 1; }

grep -Eq 'auth\.uid\(\)[[:space:]]*=[[:space:]]*user_id' supabase/migrations/20260812000500_student_notes_foundation.sql \
  || { echo "FAIL: note ownership policy missing."; exit 1; }

echo "PASS: private ownership and RLS are present"

grep -Fq 'student_note_blocks' supabase/migrations/20260812000600_note_blocks_tags_organization.sql \
  || { echo "FAIL: technical note blocks missing."; exit 1; }

grep -Fq "'code'" supabase/migrations/20260812000600_note_blocks_tags_organization.sql \
  || { echo "FAIL: code block type missing."; exit 1; }

grep -Fq "'command'" supabase/migrations/20260812000600_note_blocks_tags_organization.sql \
  || { echo "FAIL: command block type missing."; exit 1; }

grep -Fq "'terminal_output'" supabase/migrations/20260812000600_note_blocks_tags_organization.sql \
  || { echo "FAIL: terminal-output block type missing."; exit 1; }

if grep -R -nE 'child_process|execSync|spawnSync|(^|[^[:alnum:]_])exec\(|(^|[^[:alnum:]_])spawn\(' \
  services/api/src/notes.ts \
  services/api/src/note-organization.ts \
  services/api/src/note-retrieval.ts \
  services/api/src/note-export.ts; then
  echo "FAIL: executable command primitive detected in Notes Engine."
  exit 1
fi

echo "PASS: technical content blocks exist and remain inert data"

grep -Fq 'student_note_contexts' supabase/migrations/20260812000500_student_notes_foundation.sql \
  || { echo "FAIL: learning-context reference model missing."; exit 1; }

grep -Fq 'context_stable_id' supabase/migrations/20260812000500_student_notes_foundation.sql \
  || { echo "FAIL: stable learning-context IDs missing."; exit 1; }

echo "PASS: stable learning-context references are present"

grep -Fq 'student_note_tags' supabase/migrations/20260812000600_note_blocks_tags_organization.sql \
  || { echo "FAIL: tags missing."; exit 1; }

grep -Fq 'student_note_tag_assignments' supabase/migrations/20260812000600_note_blocks_tags_organization.sql \
  || { echo "FAIL: tag assignments missing."; exit 1; }

grep -Fq 'pinned boolean' supabase/migrations/20260812000600_note_blocks_tags_organization.sql \
  || { echo "FAIL: lightweight pin organization missing."; exit 1; }

echo "PASS: tags and lightweight organization are present"

grep -Fq 'searchStudentNotes' services/api/src/note-retrieval.ts \
  || { echo "FAIL: private notes retrieval missing."; exit 1; }

grep -Fq 'student_note_blocks' services/api/src/note-retrieval.ts \
  || { echo "FAIL: technical block retrieval missing."; exit 1; }

grep -Fq 'student_note_contexts' services/api/src/note-retrieval.ts \
  || { echo "FAIL: learning-context filtering missing."; exit 1; }

grep -Fq 'student_note_tag_assignments' services/api/src/note-retrieval.ts \
  || { echo "FAIL: tag filtering missing."; exit 1; }

echo "PASS: deterministic private notes retrieval is present"

grep -Fq 'student_bookmarks' supabase/migrations/20260812000700_note_retrieval_bookmarks.sql \
  || { echo "FAIL: bookmark persistence missing."; exit 1; }

grep -Fq 'listStudentBookmarks' services/api/src/note-retrieval.ts \
  || { echo "FAIL: bookmark retrieval missing."; exit 1; }

echo "PASS: private bookmarks/saved references are present"

grep -Fq 'buildStudentNoteExport' services/api/src/note-export.ts \
  || { echo "FAIL: note export builder missing."; exit 1; }

grep -Fq 'serializeStudentNoteExport' services/api/src/note-export.ts \
  || { echo "FAIL: note export serializer missing."; exit 1; }

grep -Fq '"markdown"' packages/shared-types/src/note-export.ts \
  || { echo "FAIL: Markdown export contract missing."; exit 1; }

grep -Fq '"json"' packages/shared-types/src/note-export.ts \
  || { echo "FAIL: JSON export contract missing."; exit 1; }

echo "PASS: private note export is present"

for file in \
  services/api/src/notes.ts \
  services/api/src/note-organization.ts \
  services/api/src/note-retrieval.ts \
  services/api/src/note-export.ts
do
  grep -Fq 'createUserScopedSupabaseClient' "$file" \
    || { echo "FAIL: user-scoped database access missing in $file"; exit 1; }
done

echo "PASS: Knowledge/Notes operations use student-scoped database access"

if grep -R -nE 'logger\.(info|warn|error|debug).*body|console\.(log|info|warn|error).*body' \
  services/api/src/notes.ts \
  services/api/src/note-organization.ts \
  services/api/src/note-retrieval.ts \
  services/api/src/note-export.ts; then
  echo "FAIL: possible intentional note-body logging detected."
  exit 1
fi

echo "PASS: no intentional note-body logging pattern detected"

if grep -R -niE 'anthropic|openai|ollama|ai gateway|AIGW' \
  packages/shared-types/src/notes.ts \
  packages/shared-types/src/note-blocks.ts \
  packages/shared-types/src/note-retrieval.ts \
  packages/shared-types/src/note-export.ts \
  services/api/src/notes.ts \
  services/api/src/note-organization.ts \
  services/api/src/note-retrieval.ts \
  services/api/src/note-export.ts; then
  echo "FAIL: direct/premature AI provider dependency detected in Notes Engine."
  exit 1
fi

echo "PASS: Notes Engine remains AI-independent"

grep -Fq 'pathname === "/notes"' services/api/src/server.ts \
  || { echo "FAIL: note CRUD routes missing."; exit 1; }

grep -Fq 'pathname === "/notes/search"' services/api/src/server.ts \
  || { echo "FAIL: note search route missing."; exit 1; }

grep -Fq 'pathname === "/bookmarks"' services/api/src/server.ts \
  || { echo "FAIL: bookmark routes missing."; exit 1; }

grep -Fq 'noteExportMatch' services/api/src/server.ts \
  || { echo "FAIL: note export route missing."; exit 1; }

echo "PASS: Knowledge/Notes API routes are wired"

echo
echo "Running Wave 5 verification..."
bash scripts/verify-wave5.sh

echo
echo "KNOWLEDGE / NOTES ENGINE COMPLETION CHECK PASSED"
