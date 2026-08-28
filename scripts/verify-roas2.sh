#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# ROAS-2 — the Router-on-a-Stick connected curriculum.
#
# ROAS-1 built the Founder-guarded authoring surface and closed with an explicit
# limitation: "that a Router-on-a-Stick lab exists (no curriculum is authored
# yet)". LEARN-008 section 8.1 item 4 records the same gap from the Learning
# Engine's side — reuse cannot be demonstrated until the experiences that reuse
# each other are authored. This gate proves that content now exists, is
# coherent, is publishable by the EXISTING code paths, and is reusable by a
# later course.
#
# The invariant most at risk is competency IDENTITY. If a competency is scoped
# to this course, Linux/Windows/Security must either duplicate it or reference a
# networking course by name — both defeat DEC-049. Section 6 below therefore
# proves domain scoping from three independent directions: the authored data,
# the validator that rejects the alternative, and the test that exercises it.
#
# Absence checks judge COMMENT-STRIPPED code. Provider-neutrality checks
# deliberately judge the RAW file, because in a content module the prose IS the
# artifact and a provider name would leak through learner-facing strings.
# ============================================================

CONTENT="packages/shared-types/src/roas-curriculum.ts"
CONTENT_TESTS="packages/shared-types/src/roas-curriculum.test.ts"
INDEX="packages/shared-types/src/index.ts"
LAB_ADMIN="services/api/src/lab-admin.ts"
CURRICULUM_ADMIN="services/api/src/curriculum-admin.ts"

fail() { echo "GATE FAIL: $1"; exit 1; }
code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }

for p in "$CONTENT" "$CONTENT_TESTS" "$INDEX" "$LAB_ADMIN" "$CURRICULUM_ADMIN"; do
  [ -e "$p" ] || fail "MISSING: $p"
done

CONTENT_CODE="$(code_of "$CONTENT")"

echo "===== ROAS-2 COMPLETION GATE ====="
echo ""

# ------------------------------------------------------------
# 1. The course exists in the intended curriculum representation
# ------------------------------------------------------------
grep -Fq 'export const ROAS_COURSE' "$CONTENT" \
  || fail "the Router-on-a-Stick course is not authored"
grep -Fq '"router-on-a-stick"' "$CONTENT" \
  || fail "the course stable id is missing"
grep -Fq 'ROAS_LEARNING_PATH_STABLE_ID = "connected-learning-mvp"' "$CONTENT" \
  || fail "the course is not attached to the approved connected-learning path"

# It must reuse the Curriculum Engine's shape, not invent a parallel one.
for concept in RoasCourseNode RoasModuleNode RoasMissionNode RoasMissionCompetencyLink; do
  grep -Fq "export interface $concept" "$CONTENT" \
    || fail "the curriculum representation is missing: $concept"
done

# Curriculum identity must satisfy the grammar curriculum-admin.ts enforces.
grep -Fq '/^[a-z0-9][a-z0-9._-]{2,119}$/' "$CONTENT" \
  || fail "the content does not validate against the curriculum stable-id grammar"
grep -Fq '/^[a-z0-9][a-z0-9._-]{2,119}$/' "$CURRICULUM_ADMIN" \
  || fail "the curriculum stable-id grammar changed in curriculum-admin.ts; the pin above is stale"

# The module must be reachable from the package surface.
grep -Fq 'export * from "./roas-curriculum";' "$INDEX" \
  || fail "the curriculum content is not exported from shared-types"

echo "PASS:  1. the Router-on-a-Stick course exists in the curriculum representation"

# ------------------------------------------------------------
# 2. The mission progression is coherent
# ------------------------------------------------------------
MODULE_COUNT="$(grep -c 'stableId: "ros-mod' "$CONTENT" || true)"
[ "$MODULE_COUNT" = "4" ] \
  || fail "expected 4 modules; found $MODULE_COUNT"

MISSION_COUNT="$(grep -c 'stableId: "ros-m[0-9]' "$CONTENT" || true)"
[ "$MISSION_COUNT" = "7" ] \
  || fail "expected the approved 7-mission progression; found $MISSION_COUNT"

# The approved progression, in order. A reordering must fail here.
MISSION_ORDER="$(grep -oE 'stableId: "ros-m[0-9][a-z0-9-]*"' "$CONTENT" \
  | sed 's/stableId: //' | tr -d '"' | tr '\n' ' ')"
EXPECTED_ORDER="ros-m1-understand-the-network ros-m2-build-layer2-segmentation ros-m3-build-the-trunk ros-m4-route-between-vlans ros-m5-verify-the-network ros-m6-troubleshoot-the-network ros-m7-demonstrate "
[ "$MISSION_ORDER" = "$EXPECTED_ORDER" ] \
  || fail "the approved mission progression changed:
  expected: $EXPECTED_ORDER
  actual:   $MISSION_ORDER"

# Every mission carries teaching content, not just a title.
grep -Fq 'brief:' "$CONTENT" || fail "missions carry no instructional brief"
BRIEF_COUNT="$(grep -c '    brief: \[' "$CONTENT" || true)"
[ "$BRIEF_COUNT" = "7" ] \
  || fail "$BRIEF_COUNT of 7 missions carry an instructional brief"

echo "PASS:  2. the approved 7-mission progression is present and coherent"

# ------------------------------------------------------------
# 3. The required networking competencies have stable identities
# ------------------------------------------------------------
COMPETENCIES="$(grep -oE 'stableId: "net\.[a-z0-9.-]+"' "$CONTENT" \
  | sed 's/stableId: //' | tr -d '"' | LC_ALL=C sort -u | tr '\n' ' ')"
EXPECTED_COMPETENCIES="net.access-port-membership net.connectivity-verification net.default-gateway net.fault-isolation net.inter-vlan-routing net.ip-addressing net.subnet-boundaries net.trunking-dot1q net.vlan-segmentation "
[ "$COMPETENCIES" = "$EXPECTED_COMPETENCIES" ] \
  || fail "the approved competency set changed; every addition or removal must be reviewed:
  expected: $EXPECTED_COMPETENCIES
  actual:   $COMPETENCIES"

# The approved ROAS-2 learning outcomes must each be covered.
for outcome in ip-addressing subnet-boundaries vlan-segmentation \
               access-port-membership trunking-dot1q inter-vlan-routing \
               default-gateway connectivity-verification fault-isolation; do
  grep -Fq "\"net.$outcome\"" "$CONTENT" \
    || fail "a required ROAS-2 learning outcome has no competency: $outcome"
done

echo "PASS:  3. the nine required networking competencies have stable identities"

# ------------------------------------------------------------
# 4. Missions map to competencies, and the mapping can publish
# ------------------------------------------------------------
grep -Fq 'competencies: [' "$CONTENT" \
  || fail "missions carry no competency mapping"

# The publication invariant: every mission needs a REQUIRED competency, or
# validateLearningPathForPublication raises MISSING_COMPETENCY.
grep -Fq 'mission maps to no required competency and would block publication' "$CONTENT" \
  || fail "the content does not enforce the required-competency publication invariant"
grep -Fq 'Mission must map to at least one required competency.' "$CURRICULUM_ADMIN" \
  || fail "the server-side required-competency rule changed; the content invariant above is stale"

# The mapping must use the EXISTING mission_competencies shape and nothing more.
grep -Fq 'required: boolean' "$CONTENT" \
  || fail "the mission-competency link no longer carries the approved required flag"
# LEARN-008 section 8.1 item 1: the teaches/reuses distinction needs a migration
# and separate Founder authorization. It must NOT appear here.
if echo "$CONTENT_CODE" | grep -qiE 'teaches|reuses:|reinforc[a-z]*:'; then
  fail "ROAS-2 introduced the teaches/reuses distinction, which is deferred work requiring a migration"
fi

echo "PASS:  4. every mission maps to competencies through the existing link shape"

# ------------------------------------------------------------
# 5. The demonstration connects to the ROAS-1 lab architecture
# ------------------------------------------------------------
grep -Fq 'export const ROAS_LAB_DEFINITION: LabDefinition' "$CONTENT" \
  || fail "the demonstration does not use the approved LabDefinition contract"
grep -Fq 'import { validateLabDefinition' "$CONTENT" \
  || fail "the content does not reuse the real lab validation contract"
grep -Fq 'missionStableId: "ros-m7-demonstrate"' "$CONTENT" \
  || fail "the lab is not connected to the demonstration mission"
grep -Fq '"LABDEF-ROAS-001"' "$CONTENT" || fail "the lab definition identity is missing"
grep -Fq '"LABVP-ROAS-001"' "$CONTENT" || fail "the validation profile identity is missing"

# Identities must satisfy the conventions ROAS-1 enforces.
grep -Fq '/^LABDEF-[A-Z0-9][A-Z0-9-]*$/' "packages/shared-types/src/labs.ts" \
  || fail "the LABDEF identity convention changed"
grep -Fq '/^LABCHK-[A-Z0-9][A-Z0-9-]*$/' "$CONTENT" \
  || fail "the content does not enforce the LABCHK identity convention"

# The authoring plan must reach only operations that already exist, and must
# publish curriculum BEFORE the lab — transitionLabDefinitionState refuses a lab
# whose mission and competencies are not already published.
grep -Fq 'export function buildRoasAuthoringPlan' "$CONTENT" \
  || fail "no authoring plan connects this content to the existing admin operations"
for fn in createDraftLearningPath createDraftCourse createDraftModule \
          createDraftMission createDraftCompetency linkMissionCompetency \
          transitionLearningPathState createDraftLabDefinition \
          addLabValidationChecks transitionLabValidationProfileState \
          transitionLabDefinitionState; do
  grep -Fq "\"$fn\"" "$CONTENT" \
    || fail "the authoring plan omits an existing operation: $fn"
  grep -Fq "export function $fn" "$LAB_ADMIN" "$CURRICULUM_ADMIN" >/dev/null 2>&1 \
    || grep -Fq "export async function $fn" "$LAB_ADMIN" "$CURRICULUM_ADMIN" >/dev/null 2>&1 \
    || fail "the authoring plan names an operation that does not exist: $fn"
done
grep -Fq 'publishes the curriculum before the lab' "$CONTENT_TESTS" \
  || fail "the publication ordering constraint is not asserted by tests"

echo "PASS:  5. the demonstration connects to the ROAS-1 lab and validation architecture"

# ------------------------------------------------------------
# 6. Later courses can reuse the competencies — the ROAS-2 invariant
# ------------------------------------------------------------
# (a) The authored identities are domain-scoped.
if echo "$COMPETENCIES" | grep -qE '(^| )(ros|roas)[.-]'; then
  fail "a competency identity is course-scoped and could not be reused by a later course"
fi
for competency in $COMPETENCIES; do
  case "$competency" in
    net.*) ;;
    *) fail "competency is not domain-scoped: $competency" ;;
  esac
  case "$competency" in
    *router-on-a-stick*|*ros-m*|*ros-mod*)
      fail "competency identity embeds a course node: $competency" ;;
  esac
done

# (b) The validator rejects the alternative, so a future addition cannot slip in.
grep -Fq 'export const ROAS_REUSABLE_COMPETENCY_DOMAIN_PREFIXES' "$CONTENT" \
  || fail "the reuse rule is not held as data"
grep -Fq 'could not be reused by a later course' "$CONTENT" \
  || fail "the validator does not reject a course-scoped competency"
grep -Fq 'competency identity embeds a course node and is not reusable' "$CONTENT" \
  || fail "the validator does not reject a competency embedding a course node"

# (c) A test exercises reuse from a hypothetical later course.
grep -Fq 'linux-m3-verify-host-networking' "$CONTENT_TESTS" \
  || fail "no test demonstrates a later course referencing a networking competency"
grep -Fq 'without course-local duplication' "$CONTENT_TESTS" \
  || fail "cross-course reuse without duplication is not asserted"

# (d) ROAS-2 must NOT have built a cross-course engine. The substrate exists.
if echo "$CONTENT_CODE" | grep -qiE 'crossCourse|cross_course|reinforcementEngine|reuseEngine'; then
  fail "ROAS-2 introduced a cross-course competency mechanism; mission_competencies already suffices"
fi

echo "PASS:  6. competencies are domain-scoped and reusable without duplication"

# ------------------------------------------------------------
# 7. Deterministic validation remains authoritative
# ------------------------------------------------------------
CHECK_COUNT="$(grep -c 'stableId: "LABCHK-' "$CONTENT" || true)"
[ "$CHECK_COUNT" = "9" ] \
  || fail "expected 9 deterministic validation checks; found $CHECK_COUNT"

# Every check must be machine-settleable and explained to the learner.
PROBE_COUNT="$(grep -c '    probeId: "' "$CONTENT" || true)"
EXPLANATION_COUNT="$(grep -c '    explanation:' "$CONTENT" || true)"
[ "$PROBE_COUNT" = "$CHECK_COUNT" ] \
  || fail "$PROBE_COUNT of $CHECK_COUNT checks name a deterministic probe"
[ "$EXPLANATION_COUNT" = "$CHECK_COUNT" ] \
  || fail "$EXPLANATION_COUNT of $CHECK_COUNT checks carry a learner explanation"

# A profile with no required check could be "passed" without demonstrating
# anything, and transitionLabDefinitionState refuses to publish it.
REQUIRED_CHECKS="$(grep -c '    required: true,' "$CONTENT" || true)"
[ "$REQUIRED_CHECKS" -ge "1" ] \
  || fail "the validation profile carries no required check and could not be published"
grep -Fq 'the validation profile has no required check and could not be published' "$CONTENT" \
  || fail "the content does not enforce the required-check publication invariant"

# Content is authored as draft. Nothing here may arrive in a learner's path
# without passing through the Founder-guarded publication transition.
grep -Fq 'publicationState: "draft"' "$CONTENT" \
  || fail "the lab definition is not authored as draft"
if echo "$CONTENT_CODE" | grep -qF 'publicationState: "published"'; then
  fail "the curriculum content authors a published state directly"
fi

# Knowledge checks must never become a second route to a competency claim.
KC_COUNT="$(echo "$CONTENT_CODE" | grep -c '^    purpose: "practice",$' || true)"
[ "$KC_COUNT" = "3" ] \
  || fail "expected 3 practice knowledge checks; found $KC_COUNT"
if echo "$CONTENT_CODE" | grep -q 'purpose: "evidence_producing"'; then
  fail "a knowledge check is evidence-producing and would bypass deterministic validation"
fi
grep -Fq 'must be practice-purpose so it cannot substitute for deterministic validation' "$CONTENT" \
  || fail "the validator does not prevent a knowledge check substituting for the lab"
grep -Fq 'knowledge check must not map to a competency' "$CONTENT" \
  || fail "a knowledge check could map to a competency and manufacture a claim"

# Content authors conditions; it never records an outcome.
if echo "$CONTENT_CODE" | grep -qE '\bpassed:|\bscore:|competencyState|awardCompetency'; then
  fail "the curriculum content records a competency outcome"
fi

echo "PASS:  7. deterministic validation remains the sole authority for lab success"

# ------------------------------------------------------------
# 8. No provider-specific infrastructure leaks into curriculum
# ------------------------------------------------------------
# The RAW file is scanned: in a content module the learner-facing prose is the
# artifact, so a provider name in a mission brief is exactly the leak that
# matters. ROAS-1 holds the same list as data and is pinned below.
for token in proxmox pve hypervisor esxi vsphere vcenter qemu kvm libvirt \
             docker podman containerd aws azure gcp node-r620; do
  if grep -qiF "$token" "$CONTENT"; then
    fail "a provider-specific token entered the curriculum content: $token"
  fi
done

# The list above must remain the same list ROAS-1 enforces.
for token in proxmox hypervisor esxi vsphere qemu kvm libvirt docker podman aws azure; do
  grep -Fq "\"$token\"" "$LAB_ADMIN" \
    || fail "ROAS-1's provider prohibition list changed; this gate's list is stale: $token"
done

# Capabilities must describe requirements. LAB-001 section 8.
grep -Fq '"isolated-network"' "$CONTENT" \
  || fail "lab capabilities do not describe a network requirement"
if echo "$CONTENT_CODE" | grep -qiE 'providerId|chooseLabProvider|lab-provider'; then
  fail "the curriculum content reaches provider selection"
fi

echo "PASS:  8. no provider-specific infrastructure leaks into the curriculum"

# ------------------------------------------------------------
# 9. No AI may manufacture competency
# ------------------------------------------------------------
if grep -qiE 'openai|anthropic|ollama|ai[ _-]?gateway|aigw|llm|embedding|gpt' "$CONTENT"; then
  fail "an AI dependency entered the curriculum content"
fi
if grep -qiE 'openai|anthropic|ollama|ai[ _-]?gateway|llm|embedding' "$CONTENT_TESTS"; then
  fail "an AI dependency entered the curriculum tests"
fi
# The content module must reach no service, client or network at all.
#
# The import allowlist is the load-bearing guard: a module that imports only
# sibling shared-types files cannot reach Supabase, the filesystem or the
# network no matter what it contains. The string scan below is a second,
# independent line — `.from(` alone makes every PostgREST mutation unreachable,
# since a Supabase insert, update or delete must be chained off it.
CONTENT_IMPORTS="$(grep -oE 'from "[^"]+"' "$CONTENT" | sed 's/from //' | tr -d '"' \
  | LC_ALL=C sort -u | tr '\n' ' ')"
[ "$CONTENT_IMPORTS" = "./assessment ./labs " ] \
  || fail "the curriculum content imports outside shared-types: $CONTENT_IMPORTS"

for forbidden in supabase createServerSupabaseClient createUserScopedSupabaseClient \
                 'fetch(' 'process.env' '.from(' '.insert(' '.rpc(' 'require('; do
  if echo "$CONTENT_CODE" | grep -qF "$forbidden"; then
    fail "the curriculum content performs I/O or reaches a client: $forbidden"
  fi
done
grep -Fq 'No AI participates in any' "$CONTENT" \
  || fail "the content no longer records the AI authority boundary"

echo "PASS:  9. no AI component can manufacture competency"

# ------------------------------------------------------------
# 10. No unrelated MVP scope was introduced
# ------------------------------------------------------------
# ROAS-2 authors content. It adds NO migration; the Wave 2 curriculum schema and
# the Wave 6 lab schema already represent everything above. The pinned count is
# the guarantee, following the ROAS-1 precedent.
MIGRATION_COUNT="$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
[ "$MIGRATION_COUNT" = "36" ] \
  || fail "the migration set changed: $MIGRATION_COUNT migrations (36 expected)"
ROAS2_MIGRATIONS="$(ls supabase/migrations/*roas*.sql supabase/migrations/*curriculum_content*.sql \
  2>/dev/null | wc -l | tr -d ' ' || true)"
[ "$ROAS2_MIGRATIONS" = "0" ] || fail "ROAS-2 added a migration"

# No new route, and no new table.
if echo "$CONTENT_CODE" | grep -qE '/admin/[a-z-]+"|pathname ==='; then
  fail "the curriculum content declares a route"
fi

# Only the approved next course is authored. Linux, Windows, Security and the
# Integrated Challenge are later work and must not appear as authored content.
for later in '"linux-' '"windows-' '"security-' '"integrated-'; do
  if echo "$CONTENT_CODE" | grep -qF "stableId: $later"; then
    fail "ROAS-2 authored content for a later course: $later"
  fi
done

# The learner UI is not ROAS-2's scope.
#
# This was originally asserted as "the branch changes no file under apps/web".
# That was true of ROAS-2's own pull request and became wrong the moment ROAS-3
# was authorized to build the learner surface: a BRANCH-scoped assertion cannot
# survive the next package, and left unchanged it would have meant "nobody may
# ever build the learner UI".
#
# The durable form asserts the property of the ARTIFACT instead. What "the UI is
# out of scope" actually protects is that the authored curriculum is data and
# validators carrying no presentation — so it stays renderable by any surface,
# and a change to a component can never change what the course says. That is
# also strictly more than the diff check proved: a React import inside the
# content module would have passed it.
for presentation in 'react' 'jsx' 'useState' 'useEffect' 'className' \
                    'document.' 'window.' 'render('; do
  if echo "$CONTENT_CODE" | grep -qiF -e "$presentation"; then
    fail "the authored curriculum carries presentation, which belongs to the learner surface: $presentation"
  fi
done
if grep -qiF -e 'react' "$CONTENT_TESTS"; then
  fail "the ROAS-2 tests depend on a rendering library"
fi

# And the content must be validated by real tests, not merely declared.
grep -Fq 'validateRoasCurriculum()' "$CONTENT_TESTS" \
  || fail "the content is never validated by a test"
grep -Fq 'validateLabDefinition(ROAS_LAB_DEFINITION)' "$CONTENT_TESTS" \
  || fail "the lab definition is never validated by the real validator in a test"
grep -Fq 'validateAssessmentDefinition(assessment)' "$CONTENT_TESTS" \
  || fail "knowledge checks are never validated by the real validator in a test"

echo "PASS: 10. no unrelated MVP scope, migration, route or later course was introduced"

# ------------------------------------------------------------
# 11. This gate is reachable the DEV-FLOW-2 way
# ------------------------------------------------------------
# DEV-FLOW-2 landed after ROAS-2 was authored. Two things must hold for this
# gate to participate in the current workflow rather than only in CI.
#
# (a) It resolves through the verifier namespace. `npm run gate -- roas2` maps a
#     bare name onto `scripts/verify-<name>.sh`, which is why adding a verifier
#     needs no new permission rule. Pin the resolution so a change to run-gate.sh
#     that broke it would be caught here and not only by the autonomy gate.
grep -Fq 'target="scripts/verify-${command_name}.sh"' scripts/run-gate.sh \
  || fail "run-gate.sh no longer resolves a bare verifier name; npm run gate -- roas2 would break"
[ -f "scripts/verify-roas2.sh" ] \
  || fail "scripts/verify-roas2.sh is not where the namespace entry point resolves it"
# The execute bit is deliberately NOT tested here. scripts/verify-autonomy.sh
# owns that invariant repository-wide, and its scan would flag the search
# pattern itself if this gate carried a duplicate copy of it.

# (b) ROAS-2's own paths select this gate. Without this the curriculum could be
#     merged unchecked — the DEV-FLOW-1 failure, in ROAS-2's shape.
for roas2_path in packages/shared-types/src/roas-curriculum.ts \
                  packages/shared-types/src/roas-curriculum.test.ts \
                  scripts/verify-roas2.sh; do
  SELECTED="$(bash scripts/ci-select-gates.sh "$roas2_path")"
  case "$SELECTED" in
    scripts/verify-roas2.sh*) ;;
    *) fail "$roas2_path does not select this gate; it selected: $SELECTED" ;;
  esac
done

echo "PASS: 11. the gate resolves through the verifier namespace and owns its paths"

# ------------------------------------------------------------
# 12. The content must actually validate, and ROAS-1 must remain green
# ------------------------------------------------------------
echo ""
# Honours the DEV-FLOW-1 trusted-baseline convention. `roas-curriculum.test.ts`
# is part of the shared-types suite, so when the hardened CI baseline has
# already run and passed the full suite in this job, re-running it here proves
# nothing new. Outside that context it runs exactly as it would standalone.
if [ "${TLP_CI_BASELINE_VERIFIED:-}" = "1" ]; then
  echo "--- ROAS-2 content tests: SKIPPED ---"
  echo "TLP_CI_BASELINE_VERIFIED=1 — the hardened CI baseline already ran the"
  echo "full shared-types suite, which includes roas-curriculum.test.ts."
else
  echo "--- running the ROAS-2 content tests ---"
  npm run test --workspace @tlp/shared-types -- roas-curriculum
fi

echo ""
echo "--- deferring to the ROAS-1 authoring gate ---"
bash scripts/verify-roas1.sh

echo ""
echo "============================================================"
echo "ROAS-2 CONNECTED CURRICULUM VERIFIED"
echo "The Router-on-a-Stick course exists: 4 modules, 7 missions,"
echo "9 domain-scoped networking competencies, 3 practice knowledge"
echo "checks, and a 9-check deterministic lab demonstration."
echo "Competency identity is domain-scoped, so Linux, Windows and"
echo "Security can reuse it without course-local duplication."
echo "Deterministic validation remains the sole authority for lab"
echo "success. No migration, no route, no provider, no AI."
echo ""
echo "This gate proves AUTHORED CONTENT only. It does NOT prove:"
echo "  - that the content has been written to any database"
echo "  - live PostgreSQL or RLS behaviour (no live database harness)"
echo "  - any learner-facing experience. ROAS-3 builds the learner course"
echo "    surface; scripts/verify-roas3.sh owns that, and neither gate"
echo "    publishes anything or runs a lab."
echo "  - instructional quality, which is a Founder judgement"
echo "============================================================"
