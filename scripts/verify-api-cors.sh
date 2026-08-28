#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# API-CORS-1 — the browser origin boundary.
#
# ## What the unit tests cannot prove
#
# `services/api/src/cors.test.ts` exhausts the decision logic, because that
# logic is pure. It cannot say anything about the WIRING, and the wiring is
# where the dangerous regressions live:
#
#   - moving the CORS block below the route table, so a preflight needs the
#     bearer token the browser will not send until the preflight succeeds
#   - letting `OPTIONS` fall through into a route, so a preflight executes
#     application code
#   - copying origin handling into individual routes, so the boundary stops
#     being one reviewable place
#   - writing `*`, or echoing `request.headers.origin`, either of which makes
#     the allowlist decorative
#
# None of those changes the pure functions, so none would fail a unit test.
# This gate reads the source and asserts the structure instead.
#
# `server.ts` calls `server.listen()` at module scope, so it cannot be imported
# and exercised in-process; source assertions are the honest tool here, and the
# closing banner says plainly what they do not prove.
# ============================================================

CORS="services/api/src/cors.ts"
CORS_TESTS="services/api/src/cors.test.ts"
SERVER="services/api/src/server.ts"
CONFIG="services/api/src/config.ts"
CONFIG_TESTS="services/api/src/config.test.ts"
AUTH_CONTEXT="services/api/src/auth-context.ts"
API_CLIENT="apps/web/src/lib/api-client.ts"

fail() { echo "GATE FAIL: $1"; exit 1; }
code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }

for p in "$CORS" "$CORS_TESTS" "$SERVER" "$CONFIG" "$CONFIG_TESTS" \
         "$AUTH_CONTEXT" "$API_CLIENT"; do
  [ -f "$p" ] || fail "MISSING: $p"
done

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

CORS_LOGIC="$SCAN_DIR/cors-logic.txt"
SERVER_LOGIC="$SCAN_DIR/server-logic.txt"

code_of "$CORS" > "$CORS_LOGIC"
code_of "$SERVER" > "$SERVER_LOGIC"

[ -s "$CORS_LOGIC" ] || fail "the CORS module scanned empty"
[ -s "$SERVER_LOGIC" ] || fail "the server scanned empty"

echo "===== API-CORS-1 BROWSER ORIGIN GATE ====="
echo ""

# ------------------------------------------------------------
# 1. One shared boundary, not per-route CORS
# ------------------------------------------------------------
RESOLVE_CALLS="$(grep -c 'resolveCors(' "$SERVER_LOGIC" || true)"
[ "$RESOLVE_CALLS" = "1" ] \
  || fail "resolveCors is called $RESOLVE_CALLS times in server.ts; the boundary must be exactly one place"

# No other API source may emit CORS headers of its own.
STRAY="$SCAN_DIR/stray-cors.txt"
grep -rln 'access-control-' services/api/src > "$STRAY" || true
grep -v -e "$CORS" -e "$CORS_TESTS" "$STRAY" > "$STRAY.other" || true

if [ -s "$STRAY.other" ]; then
  echo "CORS headers are emitted outside the boundary module:"
  cat "$STRAY.other"
  fail "only cors.ts may name Access-Control headers; routes must not set their own"
fi

echo "PASS:  1. CORS lives at one shared boundary and is not duplicated per route"

# ------------------------------------------------------------
# 2. Preflight is answered BEFORE any authentication
# ------------------------------------------------------------
# The ordering proof. Line numbers are compared directly, so a future edit that
# moves the CORS block below the route table fails here rather than in a browser.
#
# Scoped to the body of `handleRequest`. Helper functions defined above it — the
# `founder()` wrapper, for instance — also mention `resolveTrustedRequestIdentity`,
# and comparing against a definition rather than a call site would measure the
# wrong thing. The property that matters is the order in which the REQUEST PATH
# does these things.
# `grep -m 1`, never `grep | head -1`. Piping into `head` closes the pipe as soon
# as the first line arrives, so grep takes SIGPIPE and — under `set -o pipefail`
# — the pipeline reports failure and `set -e` kills the gate. Whether that
# happens depends on the pipe buffer, so it passes on a laptop and fails on a
# runner. `-m 1` stops grep itself and produces no early close.
HANDLER_LINE="$(grep -n -m 1 'async function handleRequest' "$SERVER" | cut -d: -f1)"
[ -n "$HANDLER_LINE" ] || fail "server.ts no longer defines handleRequest"

HANDLER="$SCAN_DIR/handler.txt"
sed -n "${HANDLER_LINE},\$p" "$SERVER" > "$HANDLER"
[ -s "$HANDLER" ] || fail "the handleRequest body scanned empty"

CORS_LINE="$(grep -n -m 1 'const cors = resolveCors(' "$HANDLER" | cut -d: -f1)"
PREFLIGHT_LINE="$(grep -n -m 1 'if (cors.isPreflight)' "$HANDLER" | cut -d: -f1)"
TRY_LINE="$(grep -n -m 1 '^  try {' "$HANDLER" | cut -d: -f1)"
FIRST_AUTH_LINE="$(grep -n -m 1 'resolveTrustedRequestIdentity(request)' "$HANDLER" | cut -d: -f1)"

[ -n "$CORS_LINE" ] || fail "server.ts never resolves a CORS decision"
[ -n "$PREFLIGHT_LINE" ] || fail "server.ts never short-circuits a preflight"
[ -n "$FIRST_AUTH_LINE" ] || fail "server.ts no longer resolves a trusted identity; auth may have been removed"

[ "$CORS_LINE" -lt "$FIRST_AUTH_LINE" ] \
  || fail "CORS is resolved at line $CORS_LINE, after the first authentication at line $FIRST_AUTH_LINE"

[ "$PREFLIGHT_LINE" -lt "$FIRST_AUTH_LINE" ] \
  || fail "the preflight short-circuit at line $PREFLIGHT_LINE runs after authentication at line $FIRST_AUTH_LINE; a browser preflight would require a token it cannot send"

[ "$PREFLIGHT_LINE" -lt "$TRY_LINE" ] \
  || fail "the preflight short-circuit at line $PREFLIGHT_LINE runs inside the route table starting at line $TRY_LINE; OPTIONS must never reach a route"

# The short-circuit must actually return, or OPTIONS falls through to routing.
grep -Fq 'response.end();' "$SERVER" \
  || fail "the preflight branch does not end the response"

echo "PASS:  2. preflight is answered before authentication and never reaches a route"

# ------------------------------------------------------------
# 3. No wildcard, and no reflection
# ------------------------------------------------------------
if grep -qE '"access-control-allow-origin"\s*\]?\s*[:=]\s*"\*"' "$CORS_LOGIC"; then
  fail "a wildcard Access-Control-Allow-Origin was introduced"
fi
if grep -qF -e '"*"' "$CORS_LOGIC"; then
  fail "cors.ts contains a bare wildcard string"
fi

# The emitted origin must come from the allowlist entry, never from the request.
grep -Fq '"access-control-allow-origin": match' "$CORS_LOGIC" \
  || fail "the allowed origin is not taken from the matched allowlist entry; it may be reflecting the request"

if grep -qE '"access-control-allow-origin":\s*(origin|request\.|req\.)' "$CORS_LOGIC"; then
  fail "the request Origin is reflected back; the allowlist would be decorative"
fi

# Exact equality, not a prefix/substring/pattern match.
grep -Fq 'allowedOrigins.find((allowed) => allowed === origin)' "$CORS_LOGIC" \
  || fail "the allowlist is not matched by exact equality"

for loose in '.startsWith(' '.endsWith(' '.includes(' 'RegExp' '.test(' '.match('; do
  if grep -qF -e "$loose" "$CORS_LOGIC"; then
    fail "cors.ts uses loose origin matching: $loose"
  fi
done

echo "PASS:  3. no wildcard, no reflection, exact-equality allowlist only"

# ------------------------------------------------------------
# 4. Only the methods and headers the application actually uses
# ------------------------------------------------------------
grep -Fq 'export const ALLOWED_METHODS = ["GET", "POST", "OPTIONS"] as const;' "$CORS" \
  || fail "the advertised method set changed; it must match what the web app issues"

grep -Fq 'export const ALLOWED_HEADERS = ["authorization", "content-type"] as const;' "$CORS" \
  || fail "the advertised request-header set changed"

# Derived, not asserted: the web app must not have started using a method the
# boundary does not advertise, and must not be advertised methods it never uses.
WEB_METHODS="$SCAN_DIR/web-methods.txt"
grep -rhoE 'method: "(GET|POST|PUT|PATCH|DELETE)"' apps/web/src \
  | grep -oE '(GET|POST|PUT|PATCH|DELETE)' | LC_ALL=C sort -u > "$WEB_METHODS" || true

while IFS= read -r used; do
  [ -n "$used" ] || continue
  grep -Fq -e "\"$used\"" "$CORS" \
    || fail "the web app issues $used but the CORS boundary does not advertise it"
done < "$WEB_METHODS"

for unused in PUT PATCH DELETE; do
  if grep -Fq -e "$unused" "$WEB_METHODS"; then
    continue
  fi
  if grep -qE "ALLOWED_METHODS = \[[^]]*$unused" "$CORS"; then
    fail "$unused is advertised but the web application never issues it"
  fi
done

echo "PASS:  4. advertised methods and headers match what the application uses"

# ------------------------------------------------------------
# 5. Credentialed CORS stays off
# ------------------------------------------------------------
if grep -qF -e 'access-control-allow-credentials' "$CORS_LOGIC"; then
  fail "credentialed CORS was enabled; the client is bearer-token based and sends no cookies"
fi

# Verified rather than assumed: the client must still not opt into credentials.
if grep -qE 'credentials:\s*"(include|same-origin)"' "$API_CLIENT"; then
  fail "the web client now sends credentials; the CORS decision above must be revisited"
fi

echo "PASS:  5. credentialed cookie CORS is off, and the client still sends none"

# ------------------------------------------------------------
# 6. Production fails closed
# ------------------------------------------------------------
grep -Fq 'if (appEnv === "production") {' "$CORS_LOGIC" \
  || fail "cors.ts has no production branch; the localhost default could be inherited"

grep -Fq 'return [];' "$CORS_LOGIC" \
  || fail "the production branch does not return an empty allowlist"

# The development default must be unreachable from production. The production
# check has to come BEFORE the fallback, or an unconfigured production
# environment would fall through to localhost.
PROD_LINE="$(grep -n -m 1 'if (appEnv === "production")' "$CORS" | cut -d: -f1)"
FALLBACK_LINE="$(grep -n -m 1 'return \[DEVELOPMENT_WEB_ORIGIN\];' "$CORS" | cut -d: -f1)"

[ -n "$PROD_LINE" ] || fail "no production branch found"
[ -n "$FALLBACK_LINE" ] || fail "no development fallback found"
[ "$PROD_LINE" -lt "$FALLBACK_LINE" ] \
  || fail "the development fallback at line $FALLBACK_LINE precedes the production check at line $PROD_LINE; production would inherit localhost"

grep -Fq 'allowedWebOrigins' "$CONFIG" \
  || fail "runtime configuration does not carry the allowlist"
grep -Fq 'resolveAllowedOrigins(env.API_ALLOWED_ORIGINS, appEnv)' "$CONFIG" \
  || fail "the allowlist is not resolved from configuration"

echo "PASS:  6. production fails closed and cannot inherit the localhost default"

# ------------------------------------------------------------
# 7. The boundary grants no authority, and auth is unchanged
# ------------------------------------------------------------
# cors.ts must stay pure: it may import types only.
CORS_IMPORTS="$(grep -oE 'from "[^"]+"' "$CORS" | sed 's/from //' | tr -d '"' \
  | LC_ALL=C sort -u | tr '\n' ' ')"
[ "$CORS_IMPORTS" = "@tlp/shared-types " ] \
  || fail "cors.ts imports beyond the shared types: $CORS_IMPORTS"

for forbidden in createServerSupabaseClient createUserScopedSupabaseClient \
                 resolveTrustedRequestIdentity requireFounderAdmin \
                 'fetch(' 'process.env' accessToken; do
  if grep -qF -e "$forbidden" "$CORS_LOGIC"; then
    fail "the CORS boundary reaches authentication or I/O: $forbidden"
  fi
done

# The existing authentication path must be intact.
grep -Fq 'export function extractBearerToken' "$AUTH_CONTEXT" \
  || fail "bearer token extraction was removed from auth-context"
grep -Fq 'export async function resolveTrustedRequestIdentity' "$AUTH_CONTEXT" \
  || fail "trusted identity resolution was removed from auth-context"
grep -Fq 'supabase.auth.getUser(accessToken)' "$AUTH_CONTEXT" \
  || fail "the access token is no longer verified against Supabase Auth"
grep -Fq 'createUserScopedSupabaseClient(accessToken)' "$AUTH_CONTEXT" \
  || fail "the user-scoped client was removed; RLS would stop applying"

# The route table must still authenticate. A CORS change must never reduce this.
AUTH_CALLS="$(grep -c 'resolveTrustedRequestIdentity(request)' "$SERVER" || true)"
[ "$AUTH_CALLS" -ge "30" ] \
  || fail "only $AUTH_CALLS authenticated routes remain in server.ts; authentication may have been weakened"

echo "PASS:  7. the boundary is pure, and authentication and RLS are untouched"

# ------------------------------------------------------------
# 8. No dependency, no migration, no scope expansion
# ------------------------------------------------------------
CHANGED_LOCK="$(git diff --name-only origin/main...HEAD -- package-lock.json 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_LOCK" = "0" ] \
  || fail "the lockfile changed; no dependency change is authorized"

for cors_package in '"cors"' '"@fastify/cors"' '"koa-cors"' '"@koa/cors"'; do
  if grep -qF -e "$cors_package" services/api/package.json package.json; then
    fail "a CORS dependency was introduced: $cors_package"
  fi
done

MIGRATION_COUNT="$(find supabase/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
[ "$MIGRATION_COUNT" = "37" ] \
  || fail "the migration set changed: $MIGRATION_COUNT migrations (37 expected)"

CHANGED_MIGRATIONS="$(git diff --name-only origin/main...HEAD -- supabase/migrations 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_MIGRATIONS" = "0" ] \
  || fail "API-CORS-1 changed $CHANGED_MIGRATIONS migration file(s); none is authorized"

echo "PASS:  8. no dependency, no migration, no scope expansion"

# ------------------------------------------------------------
# 9. The gate participates in the DEV-FLOW-2 workflow
# ------------------------------------------------------------
grep -Fq 'target="scripts/verify-${command_name}.sh"' scripts/run-gate.sh \
  || fail "run-gate.sh no longer resolves a bare verifier name"

for owned in services/api/src/cors.ts scripts/verify-api-cors.sh; do
  SELECTED="$(bash scripts/ci-select-gates.sh "$owned")"
  case "$SELECTED" in
    *scripts/verify-api-cors.sh*) ;;
    *) fail "$owned does not select this gate; it selected: $SELECTED" ;;
  esac
done

echo "PASS:  9. the gate resolves through the verifier namespace and owns its paths"

# ------------------------------------------------------------
# 10. The security tests exist and are exercised
# ------------------------------------------------------------
for required in 'never inherits the localhost' 'NEVER reflects an arbitrary Origin' \
                'NEVER emits a wildcard origin' 'never enables credentialed CORS' \
                'needs no bearer token'; do
  grep -Fq -e "$required" "$CORS_TESTS" \
    || fail "the security test suite lost a required case: $required"
done

echo ""
if [ "${TLP_CI_BASELINE_VERIFIED:-}" = "1" ]; then
  echo "--- API-CORS-1 tests: SKIPPED ---"
  echo "TLP_CI_BASELINE_VERIFIED=1 — the hardened CI baseline already ran the"
  echo "full API suite, which includes cors.test.ts and config.test.ts."
else
  echo "--- running the API-CORS-1 security tests ---"
  npm run test --workspace @tlp/api -- cors config
fi

echo ""
echo "============================================================"
echo "API-CORS-1 BROWSER ORIGIN BOUNDARY VERIFIED"
echo "CORS is applied once, above the route table and above every"
echo "authentication call, so a preflight is answered without a"
echo "bearer token and never reaches a route. The allowed origin is"
echo "taken from an exact-match allowlist, never from the request,"
echo "and never a wildcard. Production resolves to an empty"
echo "allowlist unless explicitly configured. Only GET, POST and"
echo "OPTIONS are advertised, with authorization and content-type."
echo "Credentialed CORS is off. Authentication, authorization and"
echo "RLS are untouched."
echo ""
echo "This gate proves SOURCE STRUCTURE and pure logic. It does NOT prove:"
echo "  - that a real browser preflight now succeeds"
echo "  - anything about the running server; server.ts binds a port at"
echo "    import and cannot be exercised in-process here"
echo "Browser confirmation is Human UAT and remains outstanding."
echo "============================================================"
