#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# WP-J / J1.5 GATE — the course-agnostic learner course projection.
#
# ## What this gate is for
#
# `curriculum-course-projection.test.ts` proves BEHAVIOUR: ordering, ordinals,
# module membership, honest absence, fail-closed refusal, source selection.
# Those are questions about values, and TypeScript answers them properly.
#
# This gate proves the ARCHITECTURE BOUNDARY the slice exists to establish —
# that curriculum structure comes from the Curriculum Engine and is not
# reconstructed, bundled or inferred in the browser. Those are properties of the
# source tree, and they are what would silently rot first: the projection would
# still pass its tests on the day someone compiled a second course into the app.
#
# ## The one-line summary of the slice
#
# The published tree was always fetched and always discarded. It is now kept.
# Check 2 is the check that says so, and is the one worth reading first.
#
# ## No pipelines into grep
#
# Under `set -o pipefail`, `echo "$BIG" | grep -q` can return 141 when grep exits
# on an early match while echo is still writing — an absence check then reads a
# real hit as clean. Every check greps a FILE.
# ============================================================

PROJECTION="apps/web/src/learning/curriculum-course-projection.ts"
PROJECTION_TEST="apps/web/src/learning/curriculum-course-projection.test.ts"
VIEW="apps/web/src/learning/LearningView.tsx"
BUNDLE="apps/web/src/learning/roas-course-content.ts"
PRESENTATION="apps/web/src/learning/roas-course-presentation.ts"
SERVICE="apps/web/src/learning/learning-service.ts"
CONTRACT="packages/shared-types/src/curriculum.ts"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-J J1.5 LEARNER COURSE PROJECTION GATE ====="
echo ""

for required in "$PROJECTION" "$PROJECTION_TEST" "$VIEW" "$BUNDLE" \
                "$PRESENTATION" "$SERVICE" "$CONTRACT" "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

PROJECTION_LOGIC="$SCAN_DIR/projection-logic.txt"
VIEW_LOGIC="$SCAN_DIR/view-logic.txt"

code_of() { grep -vE '^\s*(//|\*|/\*)' "$1" || true; }

code_of "$PROJECTION" > "$PROJECTION_LOGIC"
code_of "$VIEW" > "$VIEW_LOGIC"

# ------------------------------------------------------------
# 1. The generic projection exists, and is generic
# ------------------------------------------------------------
grep -Fq 'export function projectLearnerCourseFromPublishedTree' "$PROJECTION" \
  || fail "there is no projection from the published tree to the learner course"
grep -Fq 'export function selectLearnerCourse' "$PROJECTION" \
  || fail "there is no course source selection"
grep -Fq 'export const LEARNER_PATH_STABLE_ID' "$PROJECTION" \
  || fail "the learner path identity is not a named constant"

echo "PASS:  1. the generic projection and its selection entry point exist"

# ------------------------------------------------------------
# 2. The authoritative tree is RETAINED, not reduced away
# ------------------------------------------------------------
# The whole slice. `GET /curriculum/paths/{id}` was always called and its answer
# was always collapsed to a flat list of published mission stable ids before
# anything could read the structure inside it.
grep -Fq 'PublishedLearningPathTree | null' "$VIEW" \
  || fail "the learner surface does not retain the published curriculum tree"
grep -Fq 'setPublishedTree(tree)' "$VIEW" \
  || fail "the fetched tree is not stored"
grep -Fq 'selectLearnerCourse({ tree: publishedTree' "$VIEW" \
  || fail "the retained tree does not decide which course is rendered"

# And it is cleared on failure: a stale tree would keep projecting a course the
# server can no longer confirm is published.
grep -Fq 'setPublishedTree(null)' "$VIEW" \
  || fail "the tree is not cleared when the curriculum read fails"

echo "PASS:  2. the published tree is retained and drives the rendered course"

# ------------------------------------------------------------
# 3. Exactly one bundled course projection remains, and it is transitional
# ------------------------------------------------------------
# Router-on-a-Stick keeps its bundle because the published tree cannot yet carry
# its competency links, lab marker or practice placement. Exactly one such
# builder may exist; a second would be the duplicated curriculum truth this
# slice removes.
BUILDERS="$(grep -rlE '^export function build[A-Za-z]*LearnerCourse\(' apps/web/src | wc -l | tr -d ' ')"
[ "$BUILDERS" = "1" ] \
  || fail "$BUILDERS bundled learner-course builders exist; exactly one transitional builder is allowed"

grep -Fq 'export function buildRoasLearnerCourse' "$BUNDLE" \
  || fail "the transitional bundled builder was removed; Router-on-a-Stick would lose its competency links, lab marker and practice"

# It may be called from exactly one place in the application. Tests may call it
# freely; a second component call site would be a second course source.
VIEW_CALLS="$(grep -c 'buildRoasLearnerCourse()' "$VIEW_LOGIC" || true)"
[ "$VIEW_CALLS" = "1" ] \
  || fail "the learner surface calls the bundled builder $VIEW_CALLS times; exactly one transitional call is allowed"

echo "PASS:  3. one transitional bundled builder, one call site"

# ------------------------------------------------------------
# 4. No second course is compiled into the browser
# ------------------------------------------------------------
# Networking Foundations is source-only curriculum. Its identities or authored
# strings appearing in application source would mean a second curriculum truth
# had been bundled — the exact outcome this slice exists to prevent.
#
# Test sources are excluded deliberately: the projection's own tests ASSERT
# these strings are absent, so the strings appear there by design.
while IFS= read -r source; do
  [ -n "$source" ] || continue
  case "$source" in *.test.ts|*.test.tsx) continue ;; esac

  for bundled in 'networking-foundations' 'nf-mod' 'nf-m1-' 'nf-m2-'; do
    if grep -qF -e "$bundled" "$source"; then
      fail "a Networking Foundations identity is compiled into $source; curriculum belongs to the Curriculum Engine"
    fi
  done
done <<EOF
$(find apps/web/src -name '*.ts' -o -name '*.tsx')
EOF

echo "PASS:  4. no second course tree is bundled into the application"

# ------------------------------------------------------------
# 5. The projection knows no course
# ------------------------------------------------------------
# It may import the shared presentation TYPES and the one brief parser from the
# transitional module — D3 forbids a second brief parser — but it must reach no
# authored course content.
if grep -qF 'ROAS_' "$PROJECTION_LOGIC"; then
  fail "the generic projection reads Router-on-a-Stick authored constants"
fi

for forbidden in 'router-on-a-stick' 'ros-m' 'ros-mod' 'networking-foundations' \
                 'nf-mod' 'net.' 'VLAN' 'IPv4'; do
  if grep -qF -e "$forbidden" "$PROJECTION_LOGIC"; then
    fail "the generic projection names a specific course: $forbidden"
  fi
done

grep -Fq 'parseMissionBrief' "$PROJECTION" \
  || fail "the projection does not reuse the existing brief parser"

echo "PASS:  5. the projection names no course and reuses the one brief parser"

# ------------------------------------------------------------
# 6. The projection is not a data-access boundary
# ------------------------------------------------------------
for forbidden in '@supabase/supabase-js' createClient getBrowserSupabaseClient \
                 apiRequest 'fetch(' accessToken Authorization Bearer; do
  if grep -qF -e "$forbidden" "$PROJECTION_LOGIC"; then
    fail "the projection reaches the network or holds a credential: $forbidden"
  fi
done

echo "PASS:  6. the projection performs no data access"

# ------------------------------------------------------------
# 7. The projection holds no learner, progression or evidence authority
# ------------------------------------------------------------
# It supplies curriculum STRUCTURE. Everything about the learner is owned by the
# Learning Engine and joined to a course by stable id elsewhere. One learner fact
# decided here would be a second answer to a question the server owns.
for forbidden in LearningPathProgressSummary RecommendedNextAction \
                 LearningResumeTarget LearningProgressState \
                 recordMissionProgress competencyStableId evidence \
                 not_started in_progress competency_demonstrated; do
  if grep -qF -e "$forbidden" "$PROJECTION_LOGIC"; then
    fail "the projection decides learner or progression state: $forbidden"
  fi
done

echo "PASS:  7. no learner, progression or evidence authority in the projection"

# ------------------------------------------------------------
# 8. Structure comes from the shared curriculum contract
# ------------------------------------------------------------
grep -Fq 'from "@tlp/shared-types"' "$PROJECTION" \
  || fail "the projection does not consume the shared curriculum contract"
grep -Fq 'PublishedLearningPathTree' "$PROJECTION" \
  || fail "the projection does not read the published curriculum tree"
grep -Fq 'export interface PublishedLearningPathTree' "$CONTRACT" \
  || fail "the shared published-tree contract was removed"

# Ordering is the curriculum's own statement, never a naming convention.
grep -Fq 'left.position - right.position' "$PROJECTION" \
  || fail "the projection does not order by the authoritative position"

echo "PASS:  8. structure and ordering come from authoritative curriculum"

# ------------------------------------------------------------
# 9. Stable ids are identity; database row ids are not
# ------------------------------------------------------------
grep -Fq 'stableId' "$PROJECTION" \
  || fail "the projection does not use stable ids"

# `id` and `moduleId` are database row identities carried by the contract. The
# projection must read neither into the learner model.
if grep -qE '\b(published|module|mission|course)\.id\b' "$PROJECTION_LOGIC"; then
  fail "the projection reads a database row id into learner-facing structure"
fi
if grep -qE '\bmoduleId\b|\bcourseId\b|\blearningPathId\b' "$PROJECTION_LOGIC"; then
  fail "the projection derives membership from row ids rather than from nesting"
fi

echo "PASS:  9. stable ids drive selection; row ids do not enter the model"

# ------------------------------------------------------------
# 10. Fail-closed, with no substitution
# ------------------------------------------------------------
grep -Fq 'course_not_published' "$PROJECTION" \
  || fail "an unknown course has no honest unavailable state"
grep -Fq 'no_published_missions' "$PROJECTION" \
  || fail "a course with no published missions has no honest unavailable state"

# The refusal that matters: a course that cannot be projected must not silently
# become a different course.
grep -Fq 'projection.kind === "available" ? projection.course : null' "$PROJECTION" \
  || fail "an unprojectable course falls back to another course instead of refusing"

grep -Fq 'course === null' "$VIEW" \
  || fail "the learner surface does not handle an unprojectable course"

echo "PASS: 10. unavailable curriculum refuses rather than substituting"

# ------------------------------------------------------------
# 11. Server-owned learner state is untouched
# ------------------------------------------------------------
# The slice changes where course STRUCTURE comes from and nothing else.
for owned in loadLearningPathProgress loadResumeTarget \
             loadRecommendedNextAction recordMissionProgress \
             loadMissionInstruction loadPublishedLearningPath; do
  grep -Fq -e "$owned" "$SERVICE" \
    || fail "a server-owned learner contract was removed: $owned"
done

grep -Fq 'resolveContinueTarget' "$VIEW" \
  || fail "server-owned next-action handling was removed from the learner surface"
grep -Fq 'collectPublishedMissionStableIds' "$VIEW" \
  || fail "publication-based availability was removed from the learner surface"

echo "PASS: 11. progress, resume, next action and availability are unchanged"

# ------------------------------------------------------------
# 12. No migration, publication, deployment or dependency behaviour
# ------------------------------------------------------------
# Matched on OPERATIONAL identifiers, not on the word "publish".
#
# A substring rule fired here on `PublishedLearningPathTree` and on
# `course_not_published` — publication STATE is exactly what this projection is
# supposed to read, and a gate that forbids the word would forbid the contract.
# The prohibited thing is publication BEHAVIOUR: a command, an import, a
# privileged client, a deployment.
for forbidden in publishCurriculum importCurriculum reconcile \
                 createServerSupabaseClient service_role \
                 'admin:publish' 'supabase db' deployTo; do
  if grep -qF -e "$forbidden" "$PROJECTION_LOGIC"; then
    fail "the projection introduces operational behaviour: $forbidden"
  fi
done

shasum -a 256 -c scripts/migration-baseline.sha256 --quiet \
  || fail "a migration this slice was written against was modified"

MIGRATION_COUNT="$(find supabase/migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
[ "$MIGRATION_COUNT" = "43" ] \
  || fail "the repository carries $MIGRATION_COUNT migrations; J1.5 adds none to 43"

for manifest in package.json apps/web/package.json \
                packages/shared-types/package.json services/api/package.json; do
  git diff --quiet HEAD -- "$manifest" 2>/dev/null \
    || fail "J1.5 changed a dependency manifest: $manifest"
done

echo "PASS: 12. no migration, publication, deployment or dependency change"

# ------------------------------------------------------------
# 13. The gate resolves through the verifier namespace
# ------------------------------------------------------------
[ -f scripts/verify-wpj15.sh ] \
  || fail "this gate is not resolvable as scripts/verify-wpj15.sh"

grep -Fq 'scripts/verify-wpj15.sh' "$SELECTOR" \
  || fail "the gate is not registered in change-relevant gate selection"
grep -Fq 'apps/web/src/learning/curriculum-course-projection*|scripts/verify-wpj15.sh' "$SELECTOR" \
  || fail "a projection change does not select this gate"

echo "PASS: 13. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# J1.5 suites
# ------------------------------------------------------------
echo ""
echo "--- running the J1.5 projection suite ---"
npm run test --workspace @tlp/web -- src/learning/curriculum-course-projection

echo ""
echo "--- running the learner surface suites this slice touches ---"
npm run test --workspace @tlp/web -- src/learning/roas-course-content src/learning/roas-course-presentation src/learning/roas-practice

echo ""
echo "=========================================================="
echo "WP-J J1.5 LEARNER COURSE PROJECTION VERIFIED"
echo ""
echo "The published curriculum tree is retained rather than"
echo "reduced to mission ids, and decides which course the"
echo "learner reads. The projection is deterministic, names no"
echo "course, reaches no network, and decides nothing about the"
echo "learner. Router-on-a-Stick keeps its transitional bundle."
echo "A course that cannot be projected refuses rather than"
echo "substituting another."
echo ""
echo "This gate proves SOURCE STRUCTURE and pure logic."
echo "It does NOT prove:"
echo "  - that any curriculum has been published to a database"
echo "  - that the five pending migrations have been applied"
echo "  - that a learner has navigated a non-bundled course"
echo "  - anything about instructional quality, which is Human UAT"
echo "=========================================================="
