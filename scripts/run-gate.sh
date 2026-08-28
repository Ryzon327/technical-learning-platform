#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# DEV-FLOW-2 — one namespace-safe entry point for project verification.
#
# ## Why this exists
#
# Claude Code permission rules match command STRINGS by prefix. A rule whose
# prefix ends in the middle of a token — `bash scripts/` — is not reliably
# equivalent to one that ends on a whole word, and the exact semantics are not
# observable from inside this repository. DEV-FLOW-2 therefore does not bet on
# it.
#
# `npm run gate -- <name>` moves the varying part into an ARGUMENT, so the
# permission rule only has to cover `npm run gate` — three complete words. That
# matches under either interpretation, needs one rule for the whole verifier
# namespace, and never needs a new rule when a verifier is added.
#
# ## Why this is not a bash escape hatch
#
# The argument is a verifier NAME, never a path. `assert_plain_name` rejects any
# slash, dot or shell metacharacter, so the resolved target is always exactly
# `scripts/verify-<name>.sh`. There is no input that reaches another directory,
# another file type, or an arbitrary command. Permitting this entry point is
# therefore narrower than permitting `bash scripts/`, not broader.
#
# ## Why `bash` and not `./`
#
# Every caller in this repository already invokes verifiers as `bash <script>` —
# the CI workflow does, and so does every gate that defers to another. The
# execute bit is therefore not load-bearing anywhere, and `scripts/ci-toolchain.sh`
# has always been committed 0644 to prove it. Creating a verifier consequently
# requires no `chmod`, which removes that approval prompt at the source rather
# than permitting the command.
#
# Usage:
#   npm run gate -- roas1                 # runs scripts/verify-roas1.sh
#   npm run gate -- list                  # lists the verifier namespace
#   npm run gate -- select <path>...      # runs the change-relevant selector
#   bash scripts/run-gate.sh roas1        # identical, without npm
# ============================================================

usage() {
  echo "usage: npm run gate -- <verifier-name>"
  echo "       npm run gate -- list"
  echo "       npm run gate -- select <changed-path>..."
  echo ""
  echo "<verifier-name> resolves to scripts/verify-<name>.sh and nothing else."
}

# Rejects anything that is not a bare verifier name. Path separators, traversal,
# leading dashes and shell metacharacters all fail here, which is what keeps the
# resolved target inside the verifier namespace.
assert_plain_name() {
  local name="$1"

  case "$name" in
    ""|-*)
      echo "run-gate: not a verifier name: '$name'" >&2
      exit 2
      ;;
  esac

  if ! printf '%s' "$name" | grep -Eq '^[a-z0-9][a-z0-9._-]*$'; then
    echo "run-gate: not a verifier name: '$name'" >&2
    echo "run-gate: names are lowercase and contain no path separator." >&2
    exit 2
  fi

  case "$name" in
    *..*|*/*)
      echo "run-gate: path traversal is not a verifier name: '$name'" >&2
      exit 2
      ;;
  esac
}

list_gates() {
  echo "Available verifiers (npm run gate -- <name>):"
  find scripts -maxdepth 1 -type f -name 'verify-*.sh' \
    | sed 's|^scripts/verify-||' \
    | sed 's|\.sh$||' \
    | LC_ALL=C sort \
    | sed 's|^|  |'
}

if [ "$#" -eq 0 ]; then
  usage
  exit 2
fi

command_name="$1"
shift

if [ "$command_name" = "list" ]; then
  list_gates
  exit 0
fi

if [ "$command_name" = "help" ] || [ "$command_name" = "--help" ]; then
  usage
  exit 0
fi

# `select` forwards to the change-relevant selector, which accepts paths as
# arguments. This exists so a mapping can be checked without a shell pipeline.
if [ "$command_name" = "select" ]; then
  if [ "$#" -eq 0 ]; then
    echo "run-gate: select needs at least one changed path" >&2
    exit 2
  fi
  exec bash scripts/ci-select-gates.sh "$@"
fi

assert_plain_name "$command_name"

if [ "$#" -ne 0 ]; then
  echo "run-gate: a verifier takes no extra arguments: $*" >&2
  exit 2
fi

target="scripts/verify-${command_name}.sh"

if [ ! -f "$target" ]; then
  echo "run-gate: no such verifier: $target" >&2
  echo "" >&2
  list_gates >&2
  exit 2
fi

exec bash "$target"
