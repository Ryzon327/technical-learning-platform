#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${API_PORT:-3001}"
LOG_FILE="/tmp/tlp-api-smoke.log"
HEALTH_FILE="/tmp/tlp-api-health.json"
READY_FILE="/tmp/tlp-api-ready.json"

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

if ! curl -fsS   -H "x-correlation-id: smoke-correlation"   "http://127.0.0.1:${PORT}/health" >"$HEALTH_FILE"; then
  echo "FAIL: /health request failed."
  cat "$LOG_FILE"
  exit 1
fi

node - "$READY_FILE" "$HEALTH_FILE" <<'NODE'
const fs = require("fs");
const [readyPath, healthPath] = process.argv.slice(2);
const ready = JSON.parse(fs.readFileSync(readyPath, "utf8"));
const health = JSON.parse(fs.readFileSync(healthPath, "utf8"));

if (ready.ready !== true) {
  throw new Error("Readiness payload did not report ready=true");
}

if (health.state !== "healthy" || health.service !== "api") {
  throw new Error("Health payload did not report healthy API state");
}
NODE

echo "PASS: /ready"
echo "PASS: /health"
echo "PASS: API runtime started and responded successfully"
