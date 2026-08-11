#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${API_PORT:-3001}"
LOG_FILE="/tmp/tlp-api-smoke.log"
HEALTH_FILE="/tmp/tlp-api-health.json"
READY_FILE="/tmp/tlp-api-ready.json"
AUTH_FILE="/tmp/tlp-api-auth.json"
ADMIN_FILE="/tmp/tlp-api-admin.json"

cleanup() {
  if [ -n "${API_PID:-}" ] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "===== API SMOKE TEST ====="

APP_ENV=test API_PORT="$PORT" npm run start --workspace @tlp/api >"$LOG_FILE" 2>&1 &
API_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/ready" >"$READY_FILE" 2>/dev/null; then
    break
  fi

  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "FAIL: API process exited before readiness."
    cat "$LOG_FILE"
    exit 1
  fi

  sleep 0.25
done

if ! curl -fsS "http://127.0.0.1:${PORT}/ready" >"$READY_FILE"; then
  echo "FAIL: /ready did not become available."
  cat "$LOG_FILE"
  exit 1
fi

if ! curl -fsS \
  -H "x-correlation-id: smoke-correlation" \
  "http://127.0.0.1:${PORT}/health" >"$HEALTH_FILE"; then
  echo "FAIL: /health request failed."
  cat "$LOG_FILE"
  exit 1
fi

AUTH_STATUS="$(
  curl -sS \
    -o "$AUTH_FILE" \
    -w "%{http_code}" \
    "http://127.0.0.1:${PORT}/auth/me"
)"

if [ "$AUTH_STATUS" != "401" ]; then
  echo "FAIL: protected /auth/me should return 401 without a token; got $AUTH_STATUS."
  cat "$AUTH_FILE"
  cat "$LOG_FILE"
  exit 1
fi

ADMIN_STATUS="$(
  curl -sS \
    -o "$ADMIN_FILE" \
    -w "%{http_code}" \
    "http://127.0.0.1:${PORT}/admin/ping"
)"

if [ "$ADMIN_STATUS" != "401" ]; then
  echo "FAIL: protected /admin/ping should return 401 without a token; got $ADMIN_STATUS."
  cat "$ADMIN_FILE"
  cat "$LOG_FILE"
  exit 1
fi

node - "$READY_FILE" "$HEALTH_FILE" "$AUTH_FILE" "$ADMIN_FILE" <<'NODE'
const fs = require("fs");
const [readyPath, healthPath, authPath, adminPath] = process.argv.slice(2);
const ready = JSON.parse(fs.readFileSync(readyPath, "utf8"));
const health = JSON.parse(fs.readFileSync(healthPath, "utf8"));
const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
const admin = JSON.parse(fs.readFileSync(adminPath, "utf8"));

if (ready.ready !== true) {
  throw new Error("Readiness payload did not report ready=true");
}

if (health.state !== "healthy" || health.service !== "api") {
  throw new Error("Health payload did not report healthy API state");
}

if (auth?.error?.code !== "UNAUTHORIZED") {
  throw new Error("Protected endpoint did not return normalized UNAUTHORIZED");
}

if (admin?.error?.code !== "UNAUTHORIZED") {
  throw new Error("Admin endpoint did not return normalized UNAUTHORIZED");
}
NODE

echo "PASS: /ready"
echo "PASS: /health"
echo "PASS: /auth/me rejects unauthenticated requests"
echo "PASS: /admin/ping rejects unauthenticated requests"
echo "PASS: API runtime started and responded successfully"
