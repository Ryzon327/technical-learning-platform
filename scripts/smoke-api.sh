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
assert_status GET /lab-sessions 401
assert_status POST /lab-sessions 401 '{"labDefinitionStableId":"LABDEF-TEST"}'
assert_status GET /lab-sessions/test-session 401
assert_status POST /lab-sessions/test-session/start 401
assert_status POST /lab-sessions/test-session/end 401
assert_status GET /lab-sessions/test-session/access 401
assert_status POST /lab-sessions/test-session/reset 401
assert_status POST /lab-sessions/test-session/validate 401
assert_status GET /lab-sessions/test-session/validations 401
assert_status GET /lab-sessions/test-session/isolation 401
assert_status POST /lab-sessions/test-session/expire 401
assert_status POST /lab-sessions/test-session/cleanup 401
assert_status POST /lab-sessions/test-session/recover 401
assert_status GET /lab-sessions/test-session/operations 401
assert_status GET /evidence 401
assert_status GET /evidence/test-evidence 401
assert_status POST /evidence 404 '{"sourceType":"assessment_attempt"}'
assert_status GET /evidence/test-evidence/competencies 401
assert_status GET /competencies/competency.test/evidence 401
assert_status POST /evidence/test-evidence/competencies 404 '{"competencyStableId":"competency.test"}'
assert_status PATCH /evidence/test-evidence/competencies 404
assert_status DELETE /competencies/competency.test/evidence 404
assert_status GET /assessment-attempts/test-attempt/evidence 401
assert_status POST /assessment-attempts/test-attempt/evidence 404 '{"evidenceId":"test"}'
assert_status DELETE /assessment-attempts/test-attempt/evidence 404
assert_status GET /lab-sessions/test-session/evidence 401
assert_status POST /lab-sessions/test-session/evidence 404 '{"validationRunId":"test"}'
assert_status DELETE /lab-sessions/test-session/evidence 404
echo 'PASS: Wave 4 assessment routes remain protected'
echo 'PASS: Wave 3 learning routes remain protected'
echo 'PASS: Wave 5 note routes remain protected'
echo 'PASS: Wave 6 mock provider capability route rejects unauthenticated requests'
echo 'PASS: Wave 6 session request/status/start/end routes reject unauthenticated requests'
echo 'PASS: Wave 6 access/reset/validation routes reject unauthenticated requests'
echo 'PASS: Wave 6 isolation/expiration/cleanup/recovery routes reject unauthenticated requests'
echo 'PASS: Wave 7 evidence read routes reject unauthenticated requests'
echo 'PASS: Wave 7 exposes no student evidence creation route'
echo 'PASS: Wave 7 evidence competency link read routes reject unauthenticated requests'
echo 'PASS: Wave 7 exposes no student evidence competency mutation route'
echo 'PASS: Wave 7 assessment attempt evidence route rejects unauthenticated requests'
echo 'PASS: Wave 7 exposes no student assessment evidence mutation route'
echo 'PASS: Wave 7 lab session evidence route rejects unauthenticated requests'
echo 'PASS: Wave 7 exposes no student lab evidence mutation route'
