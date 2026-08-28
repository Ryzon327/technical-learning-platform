#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# CI-HARDEN-1 — change-relevant gate selection.
#
# Reads changed file paths on stdin (one per line) and prints the verifier
# scripts that own them, one per line, de-duplicated and in a stable order.
#
# ## Why this exists
#
# The repository has 24 verifier scripts. Running all of them on every pull
# request would be slow and mostly irrelevant: an engine completion gate proves
# something about ITS engine, and a change that does not touch that engine
# learns nothing from it.
#
# ## Why it is a flat list and not a dependency graph
#
# Deliberately explicit. Each entry is one glob and one gate, so adding a future
# engine is a one-line change and a reader can see the whole policy at once.
# A computed graph would be harder to audit and easy to get subtly wrong.
#
# ## Runtime honesty
#
# Several gates internally defer to wave verifiers that re-run typecheck, the
# full test suite and the build:
#
#   verify-roas4.sh -> verify-roas3.sh -> verify-roas2.sh -> roas1 -> lab engine
#   verify-roas3.sh -> verify-roas2.sh -> verify-roas1.sh -> lab engine
#   verify-roas2.sh -> verify-roas1.sh -> verify-lab-engine-completion.sh
#   verify-roas1.sh -> verify-lab-engine-completion.sh -> 4 wave-6 verifiers
#   verify-search-engine-completion.sh -> verify-wave9.sh
#   verify-certificate-engine-completion.sh -> verify-wave8.sh -> wave 7
#
# So a selected gate is not free, and a lab-touching change runs the suite more
# than once. CI-HARDEN-1 does NOT restructure the verifiers to fix that; doing so
# would modify many files outside its scope. Selecting narrowly is what keeps the
# cost proportionate.
#
# ## Two ways in, one behaviour
#
# Paths may arrive on stdin (one per line) or as arguments. CI uses stdin and
# that path is unchanged. Arguments exist so a mapping can be checked without
# building a shell pipeline, which is itself an approval prompt (DEV-FLOW-2).
#
# Usage:
#   git diff --name-only origin/main...HEAD | scripts/ci-select-gates.sh
#   bash scripts/ci-select-gates.sh services/api/src/lab-admin.ts
#   npm run gate -- select services/api/src/lab-admin.ts
# ============================================================

# The verification machinery maps to itself. Editing a gate, a wave verifier or
# the shared toolchain step must run at least one real gate, or a change to the
# thing that does the checking would be merged unchecked. DEV-FLOW-1 found this
# the hard way: it modified 13 verifier scripts and originally selected none.
#
# One rule per line: "<glob> <gate script>".
#
# Globs are matched with bash pattern matching against each changed path.
# Order here is the order gates run: cheapest and most specific first.
RULES=$(
  cat <<'RULES'
supabase/config.toml|scripts/verify-db-tooling.sh
supabase/README.md|scripts/verify-db-tooling.sh
docs/Engineering-OS/DATABASE_MIGRATION_WORKFLOW.md|scripts/verify-db-tooling.sh
scripts/db-tooling-doctor.sh|scripts/verify-db-tooling.sh
scripts/verify-db-tooling.sh|scripts/verify-db-tooling.sh
docs/Engineering-OS/ROAS_UAT_RUNBOOK.md|scripts/verify-db-tooling.sh
supabase/migrations/*|scripts/verify-db-tooling.sh
packages/shared-types/src/roas-bootstrap*|scripts/verify-roas4.sh
services/api/src/admin/publish-roas-curriculum.ts|scripts/verify-roas4.sh
docs/Engineering-OS/ROAS_UAT_RUNBOOK.md|scripts/verify-roas4.sh
scripts/verify-roas4.sh|scripts/verify-roas4.sh
apps/web/src/learning/roas-course-presentation.ts|scripts/verify-roas4.sh
apps/web/src/learning/*|scripts/verify-roas3.sh
apps/web/src/auth/AuthenticatedApp.tsx|scripts/verify-roas3.sh
scripts/verify-roas3.sh|scripts/verify-roas3.sh
packages/shared-types/src/roas-curriculum*|scripts/verify-roas2.sh
scripts/verify-roas2.sh|scripts/verify-roas2.sh
services/api/src/lab-*|scripts/verify-roas1.sh
services/api/src/lab-admin*|scripts/verify-roas1.sh
packages/shared-types/src/lab*|scripts/verify-roas1.sh
scripts/verify-roas1.sh|scripts/verify-roas1.sh
scripts/verify-lab-engine-completion.sh|scripts/verify-roas1.sh
scripts/verify-wave6*.sh|scripts/verify-roas1.sh
scripts/ci-toolchain.sh|scripts/verify-roas1.sh
scripts/verify-certificate-engine-completion.sh|scripts/verify-certificate-engine-completion.sh
scripts/verify-wave8.sh|scripts/verify-certificate-engine-completion.sh
scripts/verify-wave7.sh|scripts/verify-certificate-engine-completion.sh
scripts/verify-wave9.sh|scripts/verify-search-engine-completion.sh
scripts/verify-search-engine-completion.sh|scripts/verify-search-engine-completion.sh
services/api/src/curriculum-search*|scripts/verify-search-engine-completion.sh
services/api/src/search-*|scripts/verify-search-engine-completion.sh
services/api/src/note-retrieval*|scripts/verify-search-engine-completion.sh
packages/shared-types/src/search-*|scripts/verify-search-engine-completion.sh
packages/shared-types/src/curriculum-search*|scripts/verify-search-engine-completion.sh
apps/web/src/search/*|scripts/verify-search-engine-completion.sh
services/api/src/certificate-*|scripts/verify-certificate-engine-completion.sh
packages/shared-types/src/certificate-*|scripts/verify-certificate-engine-completion.sh
apps/web/src/certificates/*|scripts/verify-certificate-engine-completion.sh
services/api/src/evidence*|scripts/verify-evidence-engine-completion.sh
packages/shared-types/src/*evidence*|scripts/verify-evidence-engine-completion.sh
apps/web/src/evidence/*|scripts/verify-evidence-engine-completion.sh
services/api/src/note*|scripts/verify-knowledge-notes-completion.sh
packages/shared-types/src/note*|scripts/verify-knowledge-notes-completion.sh
services/api/src/assessment*|scripts/verify-assessment-completion.sh
services/api/src/readiness*|scripts/verify-assessment-completion.sh
services/api/src/learning-*|scripts/verify-learning-completion.sh
services/api/src/competency*|scripts/verify-learning-completion.sh
packages/shared-types/src/learning*|scripts/verify-learning-completion.sh
services/api/src/curriculum.ts|scripts/verify-curriculum-completion.sh
services/api/src/curriculum-admin*|scripts/verify-curriculum-completion.sh
packages/shared-types/src/curriculum.ts|scripts/verify-curriculum-completion.sh
services/api/src/auth-context*|scripts/verify-authentication-completion.sh
services/api/src/authorization*|scripts/verify-authentication-completion.sh
apps/web/src/auth/*|scripts/verify-authentication-completion.sh
.claude/settings.json|scripts/verify-autonomy.sh
CLAUDE.md|scripts/verify-autonomy.sh
docs/Engineering-OS/Engineering-OS.md|scripts/verify-autonomy.sh
package.json|scripts/verify-autonomy.sh
scripts/run-gate.sh|scripts/verify-autonomy.sh
scripts/verify-autonomy.sh|scripts/verify-autonomy.sh
scripts/ci-select-gates.sh|scripts/verify-autonomy.sh
RULES
)

selected=""

# Arguments win when present; otherwise stdin is read exactly as before. Both
# feed the identical matching loop below, so the two entry points cannot drift.
read_changed_paths() {
  if [ "$#" -gt 0 ]; then
    printf '%s\n' "$@"
  else
    cat
  fi
}

while IFS= read -r changed; do
  [ -n "$changed" ] || continue

  while IFS='|' read -r glob gate; do
    [ -n "$glob" ] || continue
    # shellcheck disable=SC2254 — the glob is intentionally unquoted here.
    case "$changed" in
      $glob)
        case " $selected " in
          *" $gate "*) ;;
          *) selected="$selected $gate" ;;
        esac
        ;;
    esac
  done <<<"$RULES"
done < <(read_changed_paths "$@")

for gate in $selected; do
  # A gate that has been removed must not silently stop running.
  if [ ! -f "$gate" ]; then
    echo "ci-select-gates: mapped gate is missing: $gate" >&2
    exit 1
  fi
  echo "$gate"
done
