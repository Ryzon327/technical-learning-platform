#!/usr/bin/env bash

# ============================================================
# UAT-ENV-1 — one supported way to configure and start the local UAT stack.
#
# ## Execution contract
#
#     bash scripts/uat-env.sh check [api|publish|all]
#     bash scripts/uat-env.sh run [--purpose api|publish] <command...>
#
# **Execute it. Never source it.** The guard below refuses a sourced invocation
# before anything else happens, and the reason is not stylistic.
#
# `BASH_SOURCE` is a bash array. zsh does not define it. Sourcing this file from
# a zsh terminal ignores the shebang, so `${BASH_SOURCE[0]}` errored under
# `set -u`, expanded to empty, `dirname ""` returned `.`, and the root
# resolution `cd "$(dirname …)/.."` therefore resolved to the PARENT of the
# repository. Every check then ran against the wrong directory and reported
# absent files that were present. Worse, because it was sourced, it left the
# Founder's interactive shell cd'd into that parent with `set -euo pipefail`
# applied — so the next failing command would have closed their terminal.
#
# The guard runs BEFORE `set -euo pipefail` precisely so a sourced invocation
# cannot alter the caller's shell options on its way out.
#
# ## Why purposes exist
#
# The previous version hard-required every known variable for every invocation,
# and `run` aborted before `exec` if any check failed. Starting the learner API
# therefore demanded the publication service-role key and the bootstrap actor
# UUID — neither of which any learner route uses. The learner path resolves
# identity through `resolveTrustedRequestIdentity` and then uses only
# user-scoped clients; `createServerSupabaseClient` appears zero times in
# curriculum.ts, learning-progress.ts, learning-navigation.ts,
# learning-guidance.ts and auth-context.ts.
#
# So requirements are now scoped to what the command being run actually needs.
# Publication keeps its stronger requirements; it does not lend them to the API.
#
# ## What it never does
#
# **It never prints a value.** Every line is a variable name, a verdict and a
# purpose label. The one exception is `APP_ENV`, and only when it holds one of
# its two valid enum values — an unrecognised value is reported as unrecognised
# rather than echoed. The service-role credential is classified by reading its
# `role` claim in a subprocess that prints a single word; the key, its payload
# and its length never reach stdout, a log or an error message.
#
# It stores nothing, writes nothing, creates no env file, and contacts no
# network. The authoritative publication guard remains
# `resolveBootstrapEnvironment`; this is the earlier, friendlier check.
# ============================================================

# ------------------------------------------------------------
# Source guard — must precede `set`, and must not touch the caller.
# ------------------------------------------------------------
# `${BASH_SOURCE+x}` is used rather than `${BASH_SOURCE[0]}` so this test is
# itself safe in a shell where the array does not exist and `set -u` may be on.
if [ -z "${BASH_SOURCE+x}" ] || [ "${BASH_SOURCE[0]}" != "$0" ]; then
  echo "scripts/uat-env.sh must be executed with bash; do not source it." >&2
  echo "" >&2
  echo "  Use:     bash scripts/uat-env.sh check" >&2
  echo "           bash scripts/uat-env.sh run npm run dev:api" >&2
  echo "  Not:     source scripts/uat-env.sh" >&2
  echo "" >&2
  echo "Sourcing would run this in your own shell, where BASH_SOURCE may not" >&2
  echo "exist. Nothing was changed: your working directory and shell options" >&2
  echo "are untouched." >&2
  # `return` succeeds when sourced; the `exit` is the executed-path fallback.
  return 1 2>/dev/null || exit 1
fi

set -euo pipefail

# ------------------------------------------------------------
# Repository root
# ------------------------------------------------------------
# The guard above proves bash is executing this, so BASH_SOURCE is real. The
# assertion after it is what makes a wrong answer loud instead of silent: the
# previous failure mode was resolving to the parent directory and carrying on.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -f "$ROOT/package.json" ] || [ ! -f "$ROOT/scripts/uat-env.sh" ]; then
  echo "scripts/uat-env.sh could not locate the repository root." >&2
  echo "Refusing to continue rather than checking the wrong directory." >&2
  exit 1
fi

cd "$ROOT"

ENV_FILE="${TLP_ENV_FILE:-.env.api}"

# The browser env file Vite loads. Overridable only so the verifier can prove,
# behaviourally, that its absence does not block API startup — the real path is
# the default and no caller in the runbook sets this.
WEB_ENV_FILE="${TLP_WEB_ENV_FILE:-apps/web/.env.local}"

usage() {
  echo "Usage:"
  echo "  bash scripts/uat-env.sh check [api|publish|all]"
  echo "  bash scripts/uat-env.sh run [--purpose api|publish] <command...>"
  echo ""
  echo "Purposes:"
  echo "  api      learner API startup (the default)"
  echo "  publish  Founder publication/admin operations"
  echo "  all      check every category, for pre-flight readiness"
  echo ""
  echo "Reads $ENV_FILE from the repository root. Override with TLP_ENV_FILE."
  echo "Never source this script; execute it with bash."
}

# ------------------------------------------------------------
# Load the env file without `eval` and without `source`.
#
# Handles `KEY=value with spaces`, quoted values, `export KEY=...`, comments and
# blank lines. Nothing is evaluated as shell, so a value containing `$(...)` or a
# stray quote is data, not code.
# ------------------------------------------------------------
load_env_file() {
  [ -f "$ENV_FILE" ] || return 0

  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | '#'*) continue ;;
      *=*) ;;
      *) continue ;;
    esac

    key="${line%%=*}"
    value="${line#*=}"

    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#export }"
    key="${key#"${key%%[![:space:]]*}"}"

    case "$value" in
      \"*\") value="${value#\"}"; value="${value%\"}" ;;
      \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac

    case "$key" in
      ''|*[!A-Za-z0-9_]*) continue ;;
    esac

    export "$key=$value"
  done < "$ENV_FILE"
}

# ------------------------------------------------------------
# Purpose model
# ------------------------------------------------------------
# core     — the learner API AND publication both need it
# api      — only the learner API needs it
# publish  — only publication/admin needs it
# browser  — only the browser needs it; never blocks a command
#
# `WILL_WRITE` mirrors the authoritative guard: publication without
# TLP_UAT_BOOTSTRAP_CONFIRM is a dry run, and a dry run legitimately needs
# neither the service-role key nor an actor. Making them fatal unconditionally
# would break the documented dry run, which is the safe step we want people to
# take first.
PURPOSE="api"
WILL_WRITE="no"

FATAL=0
ADVISORIES=0

label_for() {
  case "$1" in
    core)    echo "learner API + publication" ;;
    api)     echo "learner API" ;;
    publish) echo "publication/admin" ;;
    browser) echo "browser/frontend" ;;
  esac
}

# Is this category required by the purpose currently being checked?
required_now() {
  case "$1" in
    core)
      return 0
      ;;
    api)
      [ "$PURPOSE" = "api" ] || [ "$PURPOSE" = "all" ]
      ;;
    publish)
      if [ "$PURPOSE" = "all" ]; then return 0; fi
      [ "$PURPOSE" = "publish" ] && [ "$WILL_WRITE" = "yes" ]
      ;;
    browser)
      [ "$PURPOSE" = "all" ]
      ;;
    *)
      return 1
      ;;
  esac
}

emit() { printf '  %-4s  %-30s %-28s %s\n' "$1" "$2" "[$(label_for "$3")]" "$4"; }

ok()   { emit "PASS" "$1" "$2" "$3"; }

bad() {
  if required_now "$2"; then
    emit "FAIL" "$1" "$2" "$3"
    FATAL=$((FATAL + 1))
  else
    emit "note" "$1" "$2" "$3 — not needed for this command"
    ADVISORIES=$((ADVISORIES + 1))
  fi
}

# ------------------------------------------------------------
# Checks
# ------------------------------------------------------------

check_app_env() {
  case "${APP_ENV:-}" in
    # Reporting the value is safe here and only here: it is a two-value enum,
    # not a credential, and an unrecognised value is never echoed back.
    development | test) ok APP_ENV core "set to $APP_ENV" ;;
    production) bad APP_ENV core "production is refused by the publication guard" ;;
    '') bad APP_ENV core "not set; must be development or test" ;;
    *) bad APP_ENV core "unrecognised; must be development or test" ;;
  esac
}

check_supabase_url() {
  local url="${SUPABASE_URL:-}"

  if [ -z "$url" ]; then
    bad SUPABASE_URL core "not set"
    return
  fi

  # The exact defect behind the earlier HTTP 500: present, but not a URL.
  # `createClient` throws a plain Error for this, which the API reported as
  # "Unexpected server error".
  case "$url" in
    http://* | https://*) ok SUPABASE_URL core "valid http(s) URL shape" ;;
    postgres://* | postgresql://*)
      bad SUPABASE_URL core "this is the database connection string, not the project URL"
      ;;
    *) bad SUPABASE_URL core "present but not an http(s) URL" ;;
  esac
}

check_anon_key() {
  if [ -n "${SUPABASE_ANON_KEY:-}" ]; then
    ok SUPABASE_ANON_KEY api "SET"
  else
    bad SUPABASE_ANON_KEY api "UNSET"
  fi
}

# Classify the service-role credential by its role claim.
#
# The subprocess prints exactly one word. The credential reaches it through the
# environment it already lives in and never appears in an argument, an error or
# this script's output.
check_service_role_key() {
  local verdict
  verdict="$(node -e '
    const classify = () => {
      const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
      if (raw === "") return "absent";
      if (raw.startsWith("sb_publishable_")) return "publishable";
      if (raw.startsWith("sb_secret_")) return "ok";
      const parts = raw.split(".");
      if (parts.length !== 3) return "unrecognised";
      try {
        const b = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = b.padEnd(b.length + ((4 - (b.length % 4)) % 4), "=");
        const role = JSON.parse(Buffer.from(padded, "base64").toString("utf8")).role;
        if (role === "service_role") return "ok";
        if (role === "anon") return "anon";
        return "wrong-role";
      } catch { return "unreadable"; }
    };
    process.stdout.write(classify());
  ')"

  case "$verdict" in
    ok) ok SUPABASE_SERVICE_ROLE_KEY publish "service-role credential" ;;
    absent) bad SUPABASE_SERVICE_ROLE_KEY publish "UNSET" ;;
    anon)
      # Always fatal regardless of purpose: a wrong credential in this slot is
      # an error to correct, never something to proceed past.
      emit "FAIL" SUPABASE_SERVICE_ROLE_KEY publish \
        "this is the anon key; anon holds no curriculum privileges"
      FATAL=$((FATAL + 1))
      ;;
    publishable)
      emit "FAIL" SUPABASE_SERVICE_ROLE_KEY publish "this is the publishable browser key"
      FATAL=$((FATAL + 1))
      ;;
    wrong-role)
      emit "FAIL" SUPABASE_SERVICE_ROLE_KEY publish "JWT role claim is not service_role"
      FATAL=$((FATAL + 1))
      ;;
    unreadable)
      emit "FAIL" SUPABASE_SERVICE_ROLE_KEY publish "JWT payload could not be read"
      FATAL=$((FATAL + 1))
      ;;
    *)
      emit "FAIL" SUPABASE_SERVICE_ROLE_KEY publish "not a recognised Supabase key format"
      FATAL=$((FATAL + 1))
      ;;
  esac

  # The single most common paste error, caught without reading either value.
  if [ -n "${SUPABASE_ANON_KEY:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    if [ "$SUPABASE_ANON_KEY" = "$SUPABASE_SERVICE_ROLE_KEY" ]; then
      emit "FAIL" SUPABASE_SERVICE_ROLE_KEY publish "identical to SUPABASE_ANON_KEY"
      FATAL=$((FATAL + 1))
    fi
  fi
}

check_actor_id() {
  local actor="${TLP_UAT_BOOTSTRAP_ACTOR_ID:-}"

  if [ -z "$actor" ]; then
    bad TLP_UAT_BOOTSTRAP_ACTOR_ID publish "UNSET"
    return
  fi

  # curriculum_publication_events.actor_user_id is uuid references auth.users.
  # The value is matched, never printed.
  if [[ "$actor" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    ok TLP_UAT_BOOTSTRAP_ACTOR_ID publish "SET, valid UUID shape"
  else
    emit "FAIL" TLP_UAT_BOOTSTRAP_ACTOR_ID publish "SET, but not a UUID"
    FATAL=$((FATAL + 1))
  fi
}

check_confirmation() {
  if [ -n "${TLP_UAT_BOOTSTRAP_CONFIRM:-}" ]; then
    ok TLP_UAT_BOOTSTRAP_CONFIRM publish "SET — this invocation intends to WRITE"
  else
    emit "note" TLP_UAT_BOOTSTRAP_CONFIRM publish "UNSET — publication would be a dry run"
  fi
}

check_browser_env() {
  if [ -f "$WEB_ENV_FILE" ]; then
    ok "$WEB_ENV_FILE" browser "present"
  else
    bad "$WEB_ENV_FILE" browser "missing; the browser reads VITE_* from this file"
  fi
}

run_checks() {
  echo "UAT-ENV-1 — configuration check"
  echo ""
  echo "  purpose:  $PURPOSE"

  if [ -f "$ENV_FILE" ]; then
    echo "  env file: $ENV_FILE"
  else
    echo "  env file: $ENV_FILE not found — checking the exported environment only"
  fi
  echo ""

  check_app_env
  check_supabase_url
  check_anon_key
  check_service_role_key
  check_actor_id
  check_confirmation
  check_browser_env

  echo ""

  if [ "$FATAL" -eq 0 ]; then
    if [ "$ADVISORIES" -gt 0 ]; then
      echo "Ready for purpose '$PURPOSE'. $ADVISORIES item(s) noted but not required."
    else
      echo "Ready for purpose '$PURPOSE'."
    fi
    echo "No configuration value was printed."
    return 0
  fi

  echo "$FATAL problem(s) block purpose '$PURPOSE'. No configuration value was printed."
  return 1
}

# Infer what the command about to run actually needs.
infer_purpose() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      *publish-roas-curriculum* | *admin:publish*) echo "publish"; return ;;
    esac
  done
  echo "api"
}

valid_purpose() {
  case "$1" in
    api | publish | all) return 0 ;;
    *) return 1 ;;
  esac
}

COMMAND="${1:-check}"

case "$COMMAND" in
  check)
    shift || true
    if [ "$#" -gt 0 ]; then
      valid_purpose "$1" || { echo "unknown purpose: $1" >&2; usage; exit 2; }
      PURPOSE="$1"
    fi
    load_env_file
    if [ -n "${TLP_UAT_BOOTSTRAP_CONFIRM:-}" ]; then WILL_WRITE="yes"; fi
    run_checks
    ;;

  run)
    shift
    if [ "${1:-}" = "--purpose" ]; then
      shift
      valid_purpose "${1:-}" || { echo "unknown purpose: ${1:-}" >&2; usage; exit 2; }
      PURPOSE="$1"
      shift
    fi

    [ "$#" -gt 0 ] || { usage; exit 2; }

    load_env_file

    if [ "$PURPOSE" = "api" ]; then
      PURPOSE="$(infer_purpose "$@")"
    fi

    if [ -n "${TLP_UAT_BOOTSTRAP_CONFIRM:-}" ]; then WILL_WRITE="yes"; fi

    if ! run_checks; then
      echo ""
      echo "Refusing to start. Nothing was executed." >&2
      exit 1
    fi

    echo ""
    echo "Running: $*"
    echo ""
    exec "$@"
    ;;

  -h | --help | help)
    usage
    ;;

  *)
    usage
    exit 2
    ;;
esac
