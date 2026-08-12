#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
for p in packages/shared-types/src/notes.ts services/api/src/notes.ts supabase/migrations/20260812000500_student_notes_foundation.sql; do [ -e "$p" ] || { echo "MISSING: $p"; exit 1; }; done
grep -Fq 'enable row level security' supabase/migrations/20260812000500_student_notes_foundation.sql || exit 1
grep -Fq 'auth.uid()=user_id' supabase/migrations/20260812000500_student_notes_foundation.sql || exit 1
grep -Fq 'student_note_contexts' supabase/migrations/20260812000500_student_notes_foundation.sql || exit 1
grep -Fq 'noteContainsUnsafeMarkup' services/api/src/notes.ts || exit 1
grep -Fq 'createUserScopedSupabaseClient' services/api/src/notes.ts || exit 1
grep -Fq 'pathname === "/notes"' services/api/src/server.ts || exit 1
echo "Wave 5 Batch 1 private notes foundation structure verified."
npm run typecheck
npm run test
npm run build
bash scripts/security-scan.sh
bash scripts/smoke-api.sh
echo "Wave 5 Batch 1 verification passed."
