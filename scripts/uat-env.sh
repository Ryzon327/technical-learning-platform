#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# DB-SERVICE-ROLE-1 — one supported way to configure the API for local UAT.
#
# ## The problem this replaces
#
# The runbook used to say "copy .env.example to .env.local and fill it in".
# Real Founder UAT proved that does not work, for three separate reasons:
#
#   1. **The API loads no env file at all.** It runs under `tsx`, which has no
#      dotenv support, and nothing in `services/api` calls `dotenv` or
#      `--env-file`. Those variables reached `process.env` only if the operator
#      exported them by hand.
#   2. **Vite reads a different file.** `apps/web/vite.config.ts` sets no
#      `envDir`, so the browser's `VITE_*` values come from
#      `apps/web/.env.local` — not the repository root. The browser therefore
#      worked while the API was unconfigured, which is exactly why the first
#      failure looked like a code bug.
#   3. **Sourcing an env file in zsh breaks.** `source apps/web/.env.local`
#      fails the moment a value contains a space, and silently mangles quoted
#      values. It was never a safe instruction.
#
# ## What this does instead
#
# One file, one command, no shell choreography:
#
#     bash scripts/uat-env.sh check
#     bash scripts/uat-env.sh run npm run dev:api
#     bash scripts/uat-env.sh run npm run admin:publish-roas-curriculum
#
# `check` validates the configuration contract and prints a verdict per
# variable. `run` loads the file, validates, and execs the command with the
# environment in place.
#
# ## What it never does
#
# **It never prints a value.** Every line of output is a variable name and a
# verdict. The service-role key is classified by reading its `role` claim in a
# subprocess that prints one word; the key, its payload and its length never
# reach stdout, a log or an error message.
#
# It stores nothing, writes nothing, and contacts no network. The authoritative
# guard remains `resolveBootstrapEnvironment` in the publication command — this
# is the earlier, friendlier check that catches the same mistakes before a
# command starts.
# ============================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${TLP_ENV_FILE:-.env.api}"

usage() {
  echo "Usage:"
  echo "  bash scripts/uat-env.sh check              validate configuration"
  echo "  bash scripts/uat-env.sh run <command...>   run a command with it loaded"
  echo ""
  echo "Reads $ENV_FILE from the repository root. Override with TLP_ENV_FILE."
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

FAILURES=0

pass() { printf '  PASS  %s — %s\n' "$1" "$2"; }
fail() { printf '  FAIL  %s — %s\n' "$1" "$2"; FAILURES=$((FAILURES + 1)); }
note() { printf '  note  %s — %s\n' "$1" "$2"; }

check_app_env() {
  case "${APP_ENV:-}" in
    development | test) pass APP_ENV "$APP_ENV" ;;
    production) fail APP_ENV "production is refused by the publication guard" ;;
    '') fail APP_ENV "not set; must be development or test" ;;
    *) fail APP_ENV "unrecognised; must be development or test" ;;
  esac
}

check_supabase_url() {
  local url="${SUPABASE_URL:-}"

  if [ -z "$url" ]; then
    fail SUPABASE_URL "not set"
    return
  fi

  # The exact defect behind the earlier HTTP 500: present, but not a URL.
  # `createClient` throws a plain Error for this, which the API reported as
  # "Unexpected server error".
  case "$url" in
    http://* | https://*) pass SUPABASE_URL "valid http(s) URL shape" ;;
    postgres://* | postgresql://*)
      fail SUPABASE_URL "this is the database connection string, not the project URL"
      ;;
    *) fail SUPABASE_URL "present but not an http(s) URL" ;;
  esac
}

check_anon_key() {
  if [ -n "${SUPABASE_ANON_KEY:-}" ]; then
    pass SUPABASE_ANON_KEY "set"
  else
    fail SUPABASE_ANON_KEY "not set"
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
    ok) pass SUPABASE_SERVICE_ROLE_KEY "service-role credential" ;;
    absent) fail SUPABASE_SERVICE_ROLE_KEY "not set" ;;
    anon)
      fail SUPABASE_SERVICE_ROLE_KEY "this is the anon key; anon holds no curriculum privileges"
      ;;
    publishable)
      fail SUPABASE_SERVICE_ROLE_KEY "this is the publishable browser key"
      ;;
    wrong-role)
      fail SUPABASE_SERVICE_ROLE_KEY "JWT role claim is not service_role"
      ;;
    unreadable) fail SUPABASE_SERVICE_ROLE_KEY "JWT payload could not be read" ;;
    *) fail SUPABASE_SERVICE_ROLE_KEY "not a recognised Supabase key format" ;;
  esac

  # The single most common paste error, caught without reading either value.
  if [ -n "${SUPABASE_ANON_KEY:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    if [ "$SUPABASE_ANON_KEY" = "$SUPABASE_SERVICE_ROLE_KEY" ]; then
      fail SUPABASE_SERVICE_ROLE_KEY "identical to SUPABASE_ANON_KEY"
    fi
  fi
}

check_actor_id() {
  local actor="${TLP_UAT_BOOTSTRAP_ACTOR_ID:-}"

  if [ -z "$actor" ]; then
    note TLP_UAT_BOOTSTRAP_ACTOR_ID "not set — required only to publish"
    return
  fi

  # curriculum_publication_events.actor_user_id is uuid references auth.users.
  if [[ "$actor" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    pass TLP_UAT_BOOTSTRAP_ACTOR_ID "valid UUID"
  else
    fail TLP_UAT_BOOTSTRAP_ACTOR_ID "must be the UUID of an existing account"
  fi
}

check_browser_env() {
  if [ -f "apps/web/.env.local" ]; then
    pass "apps/web/.env.local" "present (Vite reads VITE_* from here, not the root)"
  else
    fail "apps/web/.env.local" "missing; the browser reads VITE_* from this file"
  fi
}

run_checks() {
  echo "DB-SERVICE-ROLE-1 — UAT configuration check"
  echo ""

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
  check_browser_env

  echo ""
  if [ "$FAILURES" -eq 0 ]; then
    echo "Configuration contract satisfied. No value was printed."
    return 0
  fi

  echo "$FAILURES problem(s) found. No value was printed."
  return 1
}

COMMAND="${1:-check}"

case "$COMMAND" in
  check)
    load_env_file
    run_checks
    ;;
  run)
    shift
    [ "$#" -gt 0 ] || { usage; exit 2; }
    load_env_file
    run_checks
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
