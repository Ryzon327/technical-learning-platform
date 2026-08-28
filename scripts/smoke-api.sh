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
assert_status GET /evidence/test-evidence/corrections 401
assert_status POST /evidence/test-evidence/corrections 404 '{"action":"invalidate"}'
assert_status DELETE /evidence/test-evidence/corrections 404
assert_status GET /evidence/portfolio 401
assert_status POST /evidence/export 401 '{}'
assert_status GET /evidence/export 404
assert_status GET /verify/test-verification-id 404
assert_status GET /evidence/verify/test-verification-id 404
assert_status POST /evidence/portfolio 404 '{"competencyStableId":"x"}'
assert_status DELETE /evidence/portfolio 404
assert_status GET /admin/evidence/test-evidence/corrections 401
assert_status POST /admin/evidence/test-evidence/corrections 401 '{"action":"invalidate","reason":"unauthenticated smoke probe"}'
assert_status GET /admin/certificates/definitions 401
assert_status POST /admin/certificates/definitions 401 '{"stableId":"certdef-smoke-001"}'
assert_status GET /admin/certificates/definitions/test-definition 401
assert_status PATCH /admin/certificates/definitions/test-definition 401 '{"title":"smoke"}'
assert_status PUT /admin/certificates/definitions/test-definition/competencies 401 '{"requiredCompetencies":[]}'
assert_status PUT /admin/certificates/definitions/test-definition/evidence-policies 401 '{"evidencePolicies":[]}'
assert_status POST /admin/certificates/definitions/test-definition/validate 401
assert_status POST /admin/certificates/definitions/test-definition/transition 401 '{"to":"published"}'
assert_status POST /admin/certificates/definitions/test-definition/supersede 401 '{"supersededByDefinitionId":"test"}'
assert_status GET /certificates 401
assert_status GET /certificates/portfolio 401
assert_status GET '/certificates/portfolio?status=revoked' 401
assert_status POST /certificates/portfolio 404 '{"x":1}'
assert_status DELETE /certificates/portfolio 404
assert_status GET /admin/certificates/portfolio 404

# CERT-007 — the export is authenticated, POST only, and has no admin, public
# or share surface.
assert_status POST /certificates/export 401 '{"x":1}'
assert_status POST '/certificates/export?status=revoked' 401 '{"x":1}'
assert_status GET /certificates/export 404
assert_status DELETE /certificates/export 404
assert_status GET /admin/certificates/export 404
assert_status GET /certificates/export/public 404
assert_status GET /share/certificates 404

# CERT-008 — corrections are privileged only, and no student surface exists.
assert_status POST /admin/certificates/test-certificate/corrections 401 '{"action":"revoke","reason":"smoke test reason"}'
assert_status GET /admin/certificates/test-certificate/corrections 401
assert_status DELETE /admin/certificates/test-certificate/corrections 404
assert_status POST /certificates/test-certificate/corrections 404 '{"action":"revoke"}'
assert_status POST /certificates/revoke 404 '{"certificateId":"test"}'
assert_status POST /certificates/restore 404 '{"certificateId":"test"}'
assert_status POST /certificates/correct 404 '{"certificateId":"test"}'

# CERT-009 — presentation is authenticated, owner-only, and has no public or
# admin surface.
assert_status GET /certificates/presentation 401
assert_status GET '/certificates/presentation?status=revoked' 401
assert_status POST /certificates/presentation 404 '{"x":1}'
assert_status DELETE /certificates/presentation 404
assert_status GET /admin/certificates/presentation 404
assert_status GET /certificates/presentation/public 404

# SEARCH-002 — curriculum search is authenticated, GET only, and has no public
# or admin surface.
assert_status GET '/search/curriculum?q=vlan' 401
assert_status GET '/search/curriculum?q=vlan&limit=5' 401
assert_status POST /search/curriculum 404 '{"q":"vlan"}'
assert_status DELETE /search/curriculum 404

# SEARCH-006 — the private notes source must never become publicly reachable.
# This proves the route is authenticated; it does NOT and cannot prove
# cross-user row level security, which needs a live database.
assert_status GET '/notes/search?q=vlan' 401
assert_status GET '/notes/search?q=vlan&limit=5' 401
assert_status POST /notes/search 404 '{"q":"vlan"}'
# DELETE matches the parameterised /notes/:id route with the id "search" and is
# authenticated and ownership-scoped, so 401 is correct. Note ids are UUIDs, so
# no real note is shadowed. What matters is that it is never reachable
# unauthenticated.
assert_status DELETE /notes/search 401
assert_status GET '/search/notes?q=vlan' 404

# ROAS-1 — Founder-guarded lab authoring must never be publicly reachable, and
# must expose no read or student-facing surface. Authentication is proven here;
# Founder-role enforcement is proven by unit tests and the ROAS-1 verifier.
assert_status POST /admin/labs/definitions 401 '{"stableId":"LABDEF-NET-001"}'
assert_status POST /admin/labs/validation-checks 401 '{"profileStableId":"LABVP-NET-001"}'
assert_status POST /admin/labs/definitions/LABDEF-NET-001/1/state 401 '{"publicationState":"review"}'
assert_status POST /admin/labs/validation-profiles/LABVP-NET-001/state 401 '{"publicationState":"review"}'
assert_status GET /admin/labs/definitions 404
assert_status GET /admin/labs/validation-checks 404
assert_status DELETE /admin/labs/definitions 404
assert_status GET /labs/definitions 404
assert_status GET /admin/labs 404

# SEARCH-008 — structured navigation fallback composes the EXISTING published
# curriculum route. SEARCH-008 adds no route of its own, so what must be proven
# is that the route it reuses is authenticated and exposes no mutation.
assert_status GET /curriculum/paths 401
assert_status POST /curriculum/paths 404 '{"stableId":"x"}'
assert_status DELETE /curriculum/paths 404
assert_status GET /search/fallback 404
assert_status GET /search/navigation 404
assert_status GET /search/ranking 404

# SEARCH-007 — the Founder freshness/health route must never be public.
assert_status GET /admin/search/freshness 401
assert_status GET '/admin/search/freshness?limit=5' 401
assert_status POST /admin/search/freshness 404 '{}'
assert_status DELETE /admin/search/freshness 404
assert_status GET /admin/search 404
assert_status GET /search 404
assert_status GET '/search/notes?q=x' 404
assert_status POST /certificates 404 '{"x":1}'
assert_status DELETE /certificates 404
assert_status GET /certificates/test-certificate 404
assert_status POST /certificates 404 '{"certificateDefinitionId":"test"}'
assert_status GET /certificate-definitions 404
# CERT-005: the route now exists and is deliberately unauthenticated, so unlike
# every other route here it reaches the data layer. The smoke environment has no
# database configured, so a well-formed reference returns 503 "temporarily
# unavailable" — which is exactly the CERT-005 section 12 requirement that a
# dependency failure must never be reported as invalid or not-found.
#
# A malformed reference is still 400, because format is rejected before any
# lookup is attempted.
#
# SCOPE OF THIS ASSERTION: it proves the dependency-unavailable path only.
# The "well-formed but unknown reference -> 404" behaviour is a separate
# CERT-005 requirement and is covered by executable tests in
# services/api/src/certificate-verification.test.ts (describe "Z"), which mock
# the data client to distinguish a healthy-but-empty lookup from a failing one.
# No database is faked here.
assert_status GET /certificates/verify/cert1_00000000000000000000000000000000000000000000000a 503
assert_status GET /certificates/verify/test-verification-id 400
assert_status GET /verify/certificate/test-verification-id 404
assert_status POST /certificates/verify/cert1_00000000000000000000000000000000000000000000000a 404
assert_status DELETE /certificates/verify/cert1_00000000000000000000000000000000000000000000000a 404
assert_status GET /certificates/public 404
assert_status GET /certificates/search 404
assert_status GET '/certificates/eligibility?stableId=certdef-smoke-001&version=1' 401
assert_status GET '/certificates/eligibility' 401
assert_status POST /certificates/eligibility 404 '{"stableId":"certdef-smoke-001"}'
assert_status DELETE /certificates/eligibility 404
assert_status GET /admin/certificates/eligibility 404
assert_status GET /certificates/definitions 401
assert_status POST /certificates/definitions 404 '{"stableId":"certdef-smoke-001"}'
assert_status PATCH /certificates/definitions 404 '{"title":"smoke"}'
assert_status DELETE /certificates/definitions 404
assert_status POST /certificates/issuance 401 '{"stableId":"certdef-smoke-001","version":1}'
assert_status GET /certificates/issuance 404
assert_status PATCH /certificates/issuance 404 '{"stableId":"certdef-smoke-001"}'
assert_status DELETE /certificates/issuance 404
assert_status POST /certificates/issue 404 '{"stableId":"certdef-smoke-001"}'
assert_status POST /certificates/claim 404 '{"stableId":"certdef-smoke-001"}'
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
echo 'PASS: Wave 7 evidence correction history read rejects unauthenticated requests'
echo 'PASS: Wave 7 exposes no student evidence correction mutation route'
echo 'PASS: Wave 7 privileged evidence correction routes reject unauthenticated access'
echo 'PASS: Wave 7 evidence portfolio rejects unauthenticated requests'
echo 'PASS: Wave 7 evidence portfolio exposes no student mutation route'
echo 'PASS: Wave 7 evidence export rejects unauthenticated requests'
echo 'PASS: Wave 7 exposes no anonymous evidence verification route'
echo 'PASS: Wave 8 privileged certificate definition routes reject unauthenticated access'
echo 'PASS: Wave 8 exposes no student certificate route'
echo 'PASS: Wave 8 exposes no certificate issuance route'
echo 'PASS: Wave 8 exposes no certificate verification route'
echo 'PASS: CERT-002 eligibility read rejects unauthenticated requests'
echo 'PASS: CERT-002 eligibility exposes no mutation route'
echo 'PASS: CERT-002 exposes no admin eligibility endpoint'
echo 'PASS: CERT-002 certificate discovery rejects unauthenticated requests'
echo 'PASS: CERT-002 certificate discovery exposes no mutation route'
echo 'PASS: CERT-003 issuance rejects unauthenticated requests'
echo 'PASS: CERT-003 issuance exposes no read or mutation alternative'
echo 'PASS: CERT-003 exposes no issue/claim/verify route'
echo 'PASS: CERT-004 own-certificate read rejects unauthenticated requests'
echo 'PASS: CERT-004 exposes no certificate mutation route'
echo 'PASS: CERT-005 public verification is reachable without authentication and fails closed as unavailable'
echo 'PASS: CERT-005 rejects a malformed verification reference before any lookup'
echo 'PASS: CERT-005 exposes no verification mutation, listing or search route'
echo 'PASS: CERT-006 private portfolio rejects unauthenticated requests'
echo 'PASS: CERT-006 exposes no portfolio mutation or admin route'
echo 'PASS: CERT-007 certificate export rejects unauthenticated requests'
echo 'PASS: CERT-007 exposes no admin, public or share export route'
echo 'PASS: CERT-008 corrections require privileged authentication'
echo 'PASS: CERT-008 exposes no student revoke, restore or correct route'
echo 'PASS: CERT-009 presentation requires authentication'
echo 'PASS: CERT-009 exposes no public or admin presentation route'
echo 'PASS: SEARCH-007 freshness health requires founder authentication'
echo 'PASS: SEARCH-007 exposes no public or mutating freshness route'
echo 'PASS: SEARCH-006 private notes search requires authentication'
echo 'PASS: SEARCH-006 exposes no second or public notes-search route'
echo 'PASS: SEARCH-002 curriculum search requires authentication'
echo 'PASS: SEARCH-002 exposes no public or admin search route'
echo 'PASS: ROAS-1 lab authoring requires authentication and exposes no public surface'
echo 'PASS: ROAS-1 exposes no student-facing or read-only lab authoring route'
echo 'PASS: SEARCH-008 navigation fallback reuses the authenticated curriculum route'
echo 'PASS: SEARCH-008 adds no ranking, fallback or navigation route'
