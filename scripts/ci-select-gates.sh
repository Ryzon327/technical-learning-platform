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
#   verify-roas1.sh -> verify-lab-engine-completion.sh -> 4 wave-6 verifiers
#   verify-search-engine-completion.sh -> verify-wave9.sh
#   verify-certificate-engine-completion.sh -> verify-wave8.sh -> wave 7
#
# So a selected gate is not free, and a lab-touching change runs the suite more
# than once. CI-HARDEN-1 does NOT restructure the verifiers to fix that; doing so
# would modify many files outside its scope. Selecting narrowly is what keeps the
# cost proportionate.
#
# Usage:
#   git diff --name-only origin/main...HEAD | scripts/ci-select-gates.sh
# ============================================================

# One rule per line: "<glob> <gate script>".
#
# Globs are matched with bash pattern matching against each changed path.
# Order here is the order gates run: cheapest and most specific first.
RULES=$(
  cat <<'RULES'
services/api/src/lab-*|scripts/verify-roas1.sh
services/api/src/lab-admin*|scripts/verify-roas1.sh
packages/shared-types/src/lab*|scripts/verify-roas1.sh
scripts/verify-roas1.sh|scripts/verify-roas1.sh
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
RULES
)

selected=""

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
done

for gate in $selected; do
  # A gate that has been removed must not silently stop running.
  if [ ! -f "$gate" ]; then
    echo "ci-select-gates: mapped gate is missing: $gate" >&2
    exit 1
  fi
  echo "$gate"
done
