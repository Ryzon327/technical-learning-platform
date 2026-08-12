#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${API_PORT:-3001}"
LOG_FILE="/tmp/tlp-api-smoke.log"

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
  if curl -fsS "http://127.0.0.1:${PORT}/ready" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

assert_status() {
  local method="$1"
  local path="$2"
  local expected="$3"
  local status
  status="$(curl -sS -o /tmp/tlp-smoke-body -w "%{http_code}" -X "$method"     "http://127.0.0.1:${PORT}${path}")"

  if [ "$status" != "$expected" ]; then
    echo "FAIL: $method $path expected $expected, got $status"
    cat /tmp/tlp-smoke-body
    cat "$LOG_FILE"
    exit 1
  fi
}

assert_status GET /auth/me 401
assert_status GET '/learning/progress?path=path.test' 401
assert_status GET '/learning/resume?path=path.test' 401
assert_status GET /learning/missions/mission.test/access 401
assert_status GET /learning/competencies 401
assert_status POST /learning/missions/mission.test/start 401
assert_status POST /learning/missions/mission.test/complete 401
assert_status GET /admin/ping 401

echo "PASS: learning progress/resume/prerequisite routes reject unauthenticated requests"
echo "PASS: competency state route rejects unauthenticated requests"
