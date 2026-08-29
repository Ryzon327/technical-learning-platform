#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# ROAS-1 — Founder-guarded Lab Definition and validation authoring.
#
# The Lab Engine shipped `lab_definitions` and `lab_validation_checks` in Wave 6
# with a publication state and a read policy, but no write path existed anywhere
# in the repository. LAB-001 section 14 states the Founder can define a lab,
# connect it to a Mission and competencies, and version it — none of which was
# reachable through any governed mechanism.
#
# This gate proves the authoring surface exists, is Founder-guarded, performs no
# provider work, and introduced no migration, provider or AI dependency.
#
# It does NOT re-verify the Lab Engine; `verify-lab-engine-completion.sh` owns
# that, and this script defers to it last so a regression there fails here too.
#
# Absence checks judge COMMENT-STRIPPED code, and where a module holds its own
# prohibitions AS DATA they judge a STRING-STRIPPED view as well.
# ============================================================

LAB_ADMIN="services/api/src/lab-admin.ts"
LAB_ADMIN_TESTS="services/api/src/lab-admin.test.ts"
SERVER="services/api/src/server.ts"
SMOKE="scripts/smoke-api.sh"
LAB_REGISTRY="docs/Feature-Registry/Lab-Engine"

fail() { echo "GATE FAIL: $1"; exit 1; }
code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }
code_no_strings() { code_of "$1" | sed 's/"[^"]*"//g'; }

for p in "$LAB_ADMIN" "$LAB_ADMIN_TESTS" "$SERVER" "$SMOKE"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

ADMIN_CODE="$(code_of "$LAB_ADMIN")"
ADMIN_BARE="$(code_no_strings "$LAB_ADMIN")"
SERVER_CODE="$(code_of "$SERVER")"

echo "===== ROAS-1 COMPLETION GATE ====="
echo ""

# ------------------------------------------------------------
# 1. The contract this closes
# ------------------------------------------------------------
LAB_001="$(find "$LAB_REGISTRY" -maxdepth 1 -name 'LAB-001_*.md' | head -1)"
[ -n "$LAB_001" ] || fail "LAB-001 specification is missing from the Feature Registry"
grep -Fq '[x] Approved' "$LAB_001" || fail "LAB-001 does not record Founder approval"
# The acceptance criterion this work makes reachable must still be recorded.
grep -Fq 'Connect a lab to a Mission and competencies' "$LAB_001" \
  || fail "LAB-001 no longer records the Founder authoring acceptance criterion"
# LAB-001 section 8: capabilities, never providers.
grep -Fq 'A Lab Definition should specify capabilities rather than providers' "$LAB_001" \
  || fail "LAB-001 no longer records the provider-neutrality rule"

echo "PASS:  1. LAB-001 is approved and still requires Founder lab authoring"

# ------------------------------------------------------------
# 2. The authoring surface exists
# ------------------------------------------------------------
for fn in createDraftLabDefinition addLabValidationChecks \
          transitionLabDefinitionState transitionLabValidationProfileState \
          isValidLabPublicationTransition; do
  grep -Fq "export function $fn" "$LAB_ADMIN" \
    || grep -Fq "export async function $fn" "$LAB_ADMIN" \
    || fail "the authoring surface is missing: $fn"
done

for route in '"/admin/labs/definitions"' '"/admin/labs/validation-checks"'; do
  grep -Fq "$route" "$SERVER" || fail "an approved authoring route is missing: $route"
done
grep -Fq 'admin\/labs\/definitions\/([^/]+)\/([0-9]+)\/state' "$SERVER" \
  || fail "the lab definition state route is missing"
grep -Fq 'admin\/labs\/validation-profiles\/([^/]+)\/state' "$SERVER" \
  || fail "the validation profile state route is missing"

echo "PASS:  2. the approved authoring surface and its four routes exist"

# ------------------------------------------------------------
# 3. Founder authorization is enforced on every authoring route
# ------------------------------------------------------------
# The whole authoring block is extracted and every route inside it must reach
# the Founder guard. Counting guards repo-wide would not prove THESE routes are
# guarded, so the block is isolated first.
LAB_BLOCK="$(awk '/ROAS-1 — Founder-guarded Lab Definition/{c=1} c; /pathname === "\/admin\/curriculum\/learning-paths"/{if(c)exit}' "$SERVER")"
[ -n "$LAB_BLOCK" ] || fail "the lab authoring route block could not be located"

LAB_ROUTE_COUNT="$(echo "$LAB_BLOCK" | grep -c 'request.method === "POST"' || true)"
LAB_GUARD_COUNT="$(echo "$LAB_BLOCK" | grep -c 'await founder(request)' || true)"
[ "$LAB_ROUTE_COUNT" = "5" ] \
  || fail "the lab authoring block contains $LAB_ROUTE_COUNT POST routes; 4 authoring routes plus the following curriculum route are expected"
[ "$LAB_GUARD_COUNT" = "4" ] \
  || fail "$LAB_GUARD_COUNT of the lab authoring routes reach the Founder guard; all 4 must"

# No authoring route may fall back to a plain authenticated identity.
if echo "$LAB_BLOCK" | grep -q 'resolveTrustedRequestIdentity(request)'; then
  fail "a lab authoring route accepts a plain authenticated identity"
fi
# The guard itself must still be the Founder admin check.
grep -Fq 'requireFounderAdmin(await resolveTrustedRequestIdentity(request))' "$SERVER" \
  || fail "the Founder guard no longer requires founder admin authorization"
# Authoring must refuse to act without an actor.
grep -Fq 'An authoring actor is required' "$LAB_ADMIN" \
  || fail "authoring does not fail closed when no actor is supplied"

echo "PASS:  3. every authoring route is Founder-guarded and fails closed"

# ------------------------------------------------------------
# 4. Authoring performs NO provider work
# ------------------------------------------------------------
for forbidden in lab-provider-registry lab-provider-selection mock-lab-provider \
                 container-lab-provider container-runtime lab-sessions lab-runtime; do
  if echo "$ADMIN_CODE" | grep -qF "$forbidden"; then
    fail "the authoring module reaches infrastructure: $forbidden"
  fi
done
for forbidden in 'provision(' '.start(' '.stop(' '.destroy(' '.reset(' \
                 runValidationProbe chooseLabProvider getLabProvider getConnection; do
  if echo "$ADMIN_CODE" | grep -qF "$forbidden"; then
    fail "authoring performs a provider operation: $forbidden"
  fi
done

echo "PASS:  4. authoring writes metadata only and starts no lab"

# ------------------------------------------------------------
# 5. Provider neutrality is enforced as data, not prose
# ------------------------------------------------------------
grep -Fq 'export const PROVIDER_SPECIFIC_CAPABILITY_TOKENS' "$LAB_ADMIN" \
  || fail "the provider-neutrality prohibition is not held as data"
grep -Fq 'PROVIDER_SPECIFIC_CAPABILITY_TOKENS' "$LAB_ADMIN_TESTS" \
  || fail "the provider-neutrality prohibition is not asserted by tests"
for token in proxmox hypervisor esxi vsphere qemu kvm libvirt docker podman aws azure; do
  grep -Fq "\"$token\"" "$LAB_ADMIN" \
    || fail "a provider token is missing from the prohibition list: $token"
done
grep -Fq 'assertProviderNeutralCapabilities' "$LAB_ADMIN" \
  || fail "capabilities are not checked for provider names"
# The prohibition must run on create AND on publish.
NEUTRALITY_CALLS="$(echo "$ADMIN_CODE" | grep -c 'assertProviderNeutralCapabilities(' || true)"
[ "$NEUTRALITY_CALLS" -ge "3" ] \
  || fail "provider neutrality is enforced at $NEUTRALITY_CALLS sites; definition and publication must both check"
# Prose and the prohibition list are excluded, so this judges real code.
if echo "$ADMIN_BARE" | grep -qiE 'proxmox|hypervisor|esxi|vsphere|libvirt|containerd'; then
  fail "a provider-specific concept entered the authoring implementation"
fi

echo "PASS:  5. lab metadata cannot name a provider"

# ------------------------------------------------------------
# 6. Publication is gated on reality
# ------------------------------------------------------------
grep -Fq 'validateLabDefinition(candidate)' "$LAB_ADMIN" \
  || fail "authoring does not reuse the LAB-001 definition validation contract"
VALIDATION_CALLS="$(echo "$ADMIN_CODE" | grep -c 'validateLabDefinition(' || true)"
[ "$VALIDATION_CALLS" = "2" ] \
  || fail "definition validation runs at $VALIDATION_CALLS sites; creation and publication must both validate"
# A lab must never be authored straight into a learner's path.
grep -Fq 'publication_state: "draft"' "$LAB_ADMIN" \
  || fail "authoring does not create in draft"
if echo "$ADMIN_CODE" | grep -qF 'publication_state: "published"'; then
  fail "authoring writes a published state directly"
fi
# Review is where the Founder looks; draft may never jump to published.
grep -Fq 'if (from === "draft" && (to === "review" || to === "retired")) return true;' "$LAB_ADMIN" \
  || fail "the lab publication lifecycle changed; draft must not reach published directly"
# Curriculum references and a required check must resolve before publishing.
grep -Fq 'publishedCurriculumExists("missions"' "$LAB_ADMIN" \
  || fail "publication does not confirm the mission is published"
grep -Fq 'publishedCurriculumExists("competencies"' "$LAB_ADMIN" \
  || fail "publication does not confirm competencies are published"
grep -Fq 'without a published required validation check' "$LAB_ADMIN" \
  || fail "a lab may be published with no required validation check"

echo "PASS:  6. publication requires valid definitions, published curriculum and a required check"

# ------------------------------------------------------------
# 7. Deterministic validation semantics are preserved
# ------------------------------------------------------------
# Authoring records WHICH probe answers a check. It never decides the answer.
if echo "$ADMIN_BARE" | grep -qE '\bpassed\b|probeResult|runProbe'; then
  fail "authoring computes or stores a validation outcome"
fi
grep -Fq 'probe_id: requireText(' "$LAB_ADMIN" \
  || fail "the probe identifier is not captured verbatim"
# LAB-008 section 8: required/advisory and a learner-facing explanation.
grep -Fq 'explanation: requireText(' "$LAB_ADMIN" \
  || fail "a validation check may be authored without a learner-facing explanation"
grep -Fq 'record.required === undefined ? true : Boolean(record.required)' "$LAB_ADMIN" \
  || fail "a validation check no longer defaults to required"

echo "PASS:  7. authoring records probes and explanations, never outcomes"

# ------------------------------------------------------------
# 8. No new persistence surface, migration, dependency or AI
# ------------------------------------------------------------
LITERAL_TABLES="$(echo "$ADMIN_CODE" | grep -oE '\.from\("[a-z_]+"\)' | LC_ALL=C sort -u | tr '\n' ' ')"
[ "$LITERAL_TABLES" = '.from("lab_definitions") .from("lab_validation_checks") ' ] \
  || fail "authoring writes an unexpected table: $LITERAL_TABLES"
grep -Fq 'table: "missions" | "competencies"' "$LAB_ADMIN" \
  || fail "the curriculum reference read is not restricted to a closed table union"
for forbidden in '.delete(' '.rpc(' 'drop table' 'truncate'; do
  if echo "$ADMIN_CODE" | grep -qiF "$forbidden"; then
    fail "authoring performs a destructive operation: $forbidden"
  fi
done
if echo "$ADMIN_BARE" | grep -qiE 'openai|anthropic|ollama|embedding'; then
  fail "an AI dependency entered lab authoring"
fi
# ROAS-1 adds NO migration. The Wave 6 schema already represents everything.
#
# The COUNT is the guarantee. A name-pattern scan was tried first and produced a
# false positive by matching the pre-existing curriculum authoring migration —
# a pinned count cannot be fooled that way.
# Asserted as an artifact property, not a count. See verify-roas4.sh section 9
# for the full reasoning: a hardcoded count cannot detect a migration being
# EDITED, only added or removed, and it fails on every later authorized
# migration. The checksum baseline is strictly stronger on both counts.
shasum -a 256 -c scripts/migration-baseline.sha256 --quiet \
  || fail "a migration this package was written against was modified"

MIGRATION_COUNT="$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
[ "$MIGRATION_COUNT" -ge 37 ] \
  || fail "migrations were removed: $MIGRATION_COUNT present, at least 37 required"
ROAS_MIGRATIONS="$(ls supabase/migrations/*lab_admin*.sql supabase/migrations/*roas*.sql \
  2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$ROAS_MIGRATIONS" = "0" ] || fail "ROAS-1 added a migration"

echo "PASS:  8. no new table, migration, destructive path or AI dependency"

# ------------------------------------------------------------
# 9. Tests and smoke coverage exist
# ------------------------------------------------------------
for assertion in 'await founder(request)' 'PROVIDER_SPECIFIC_CAPABILITY_TOKENS' \
                 'isValidLabPublicationTransition' 'NOT_FOUND'; do
  grep -Fq "$assertion" "$LAB_ADMIN_TESTS" \
    || fail "a required ROAS-1 test assertion is missing: $assertion"
done
for route in '/admin/labs/definitions' '/admin/labs/validation-checks' \
             '/admin/labs/validation-profiles'; do
  grep -Fq "$route" "$SMOKE" \
    || fail "smoke coverage is missing for an authoring route: $route"
done

echo "PASS:  9. ROAS-1 tests and smoke coverage exist"

# ------------------------------------------------------------
# 10. The Lab Engine itself must remain green
# ------------------------------------------------------------
echo ""
echo "--- deferring to the Lab Engine completion gate ---"
bash scripts/verify-lab-engine-completion.sh

echo ""
echo "============================================================"
echo "ROAS-1 AUTHORING VERIFIED"
echo "Founder-guarded Lab Definition and validation authoring exists."
echo "Authoring is metadata only: no provider is selected, started or validated."
echo "No migration, no provider dependency, no AI."
echo "The Lab Engine completion gate remains green."
echo ""
echo "This gate proves AUTHORING only. It does NOT prove:"
echo "  - that any lab or curriculum has been written to a database."
echo "    ROAS-2 authors the Router-on-a-Stick content in the repository;"
echo "    scripts/verify-roas2.sh owns that, and neither gate writes anything."
echo "  - live PostgreSQL or RLS behaviour (no live database harness exists)"
echo "  - any learner-facing experience (the learner UI is not built)"
echo "============================================================"
