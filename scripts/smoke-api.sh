#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
PORT="${API_PORT:-3001}"; LOG_FILE="/tmp/tlp-api-smoke.log"
cleanup(){ if [ -n "${API_PID:-}" ] && kill -0 "$API_PID" 2>/dev/null; then kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; fi; }; trap cleanup EXIT
APP_ENV=test API_PORT="$PORT" npm run start --workspace @tlp/api >"$LOG_FILE" 2>&1 & API_PID=$!
for _ in $(seq 1 30); do if curl -fsS "http://127.0.0.1:${PORT}/ready" >/dev/null 2>&1; then break; fi; sleep 0.25; done
assert_status(){ local method="$1" path="$2" expected="$3" body="${4:-}"; local args=(-sS -o /tmp/tlp-smoke-body -w "%{http_code}" -X "$method"); if [ -n "$body" ]; then args+=(-H "content-type: application/json" --data "$body"); fi; local status; status="$(curl "${args[@]}" "http://127.0.0.1:${PORT}${path}")"; [ "$status" = "$expected" ] || { echo "FAIL: $method $path expected $expected got $status"; cat "$LOG_FILE"; exit 1; }; }
assert_status GET /assessments 401
assert_status GET '/learning/progress?path=path.test' 401
assert_status GET /notes 401
assert_status GET /lab-providers/mock/capabilities 401
echo 'PASS: Wave 4 assessment routes remain protected'
echo 'PASS: Wave 3 learning routes remain protected'
echo 'PASS: Wave 5 note routes remain protected'
echo 'PASS: Wave 6 mock provider capability route rejects unauthenticated requests'
