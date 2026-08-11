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
  local body="${4:-}"

  local args=(-sS -o /tmp/tlp-smoke-body -w "%{http_code}" -X "$method")
  if [ -n "$body" ]; then
    args+=(-H "content-type: application/json" --data "$body")
  fi

  local status
  status="$(curl "${args[@]}" "http://127.0.0.1:${PORT}${path}")"

  if [ "$status" != "$expected" ]; then
    echo "FAIL: $method $path expected $expected, got $status"
    cat /tmp/tlp-smoke-body
    cat "$LOG_FILE"
    exit 1
  fi
}

assert_status GET /auth/me 401
assert_status GET /admin/ping 401
assert_status GET /curriculum/paths 401
assert_status GET '/learning/progress?path=path.test' 401
assert_status POST /learning/missions/mission.test/start 401
assert_status POST /learning/missions/mission.test/complete 401

assert_status POST /admin/curriculum/learning-paths 401 '{"stableId":"path.test","title":"Test"}'
assert_status POST /admin/curriculum/courses 401 '{"learningPathId":"x","stableId":"course.test","title":"Test","position":0}'
assert_status POST /admin/curriculum/modules 401 '{"courseId":"x","stableId":"module.test","title":"Test","position":0}'
assert_status POST /admin/curriculum/missions 401 '{"moduleId":"x","stableId":"mission.test","title":"Test","position":0}'
assert_status POST /admin/curriculum/competencies 401 '{"stableId":"competency.test","title":"Test"}'
assert_status POST /admin/curriculum/competency-prerequisites 401 '{"competencyId":"x","prerequisiteCompetencyId":"y"}'
assert_status POST /admin/curriculum/mission-competencies 401 '{"missionId":"x","competencyId":"y"}'
assert_status POST /admin/curriculum/learning-paths/test-id/validate 401
assert_status POST /admin/curriculum/learning-paths/test-id/transition 401 '{"to":"review"}'

echo "PASS: authentication routes reject unauthenticated requests"
echo "PASS: curriculum authoring surface rejects unauthenticated requests"
echo "PASS: learning progress reads reject unauthenticated requests"
echo "PASS: learning progress writes reject unauthenticated requests"
