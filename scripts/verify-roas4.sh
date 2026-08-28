#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# ROAS-4 — Router-on-a-Stick is ready for Founder browser UAT.
#
# ROAS-3 built the learner surface and closed on the limitation that decides
# everything: the curriculum is not published anywhere, so the course honestly
# reports "not published to you yet" and no human can judge whether it teaches.
# ROAS-4 prepares the publication.
#
# This gate exists because the package's whole risk profile is about a WRITE.
# Three things must hold, and none of them is provable by reading a filename:
#
#   1. The publisher is a projection of ROAS-2, not a second curriculum. A seed
#      script carrying its own copy of the course would drift from the reviewed
#      content silently. Section 3 extracts every long authored string and fails
#      if one is restated.
#
#   2. It cannot write anywhere it should not. Section 4 proves the environment
#      decision is fail-closed in every direction, and section 5 proves the
#      command performs no direct table mutation.
#
#   3. It cannot manufacture a learner. Section 6 proves nothing here writes
#      progress, evidence or competency — and that the demonstration mission
#      still has no completion path, because no provider implements the probes.
#
# Absence checks judge COMMENT-STRIPPED code, and every scan greps a FILE rather
# than piping a variable: under `pipefail` an early match makes
# `echo "$VAR" | grep -q` return 141 from echo's SIGPIPE, which an absence check
# reads as clean. ROAS-3's gate shipped that bug and it silently weakened the
# guards until CI exposed it.
# ============================================================

PLAN="packages/shared-types/src/roas-bootstrap.ts"
PLAN_TESTS="packages/shared-types/src/roas-bootstrap.test.ts"
CONTENT="packages/shared-types/src/roas-curriculum.ts"
PUBLISHER="services/api/src/admin/publish-roas-curriculum.ts"
CURRICULUM_ADMIN="services/api/src/curriculum-admin.ts"
PRESENTATION="apps/web/src/learning/roas-course-presentation.ts"
VIEW="apps/web/src/learning/LearningView.tsx"
RUNBOOK="docs/Engineering-OS/ROAS_UAT_RUNBOOK.md"
INDEX="packages/shared-types/src/index.ts"
PROGRESS_MIGRATION="supabase/migrations/20260811000700_learning_progress_foundation.sql"

fail() { echo "GATE FAIL: $1"; exit 1; }
code_of() { grep -vE '^\s*(//|\*|/\*|#)' "$1" || true; }

for p in "$PLAN" "$PLAN_TESTS" "$CONTENT" "$PUBLISHER" "$CURRICULUM_ADMIN" \
         "$PRESENTATION" "$VIEW" "$RUNBOOK" "$INDEX" "$PROGRESS_MIGRATION"; do
  [ -f "$p" ] || fail "MISSING: $p"
done

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

PLAN_LOGIC="$SCAN_DIR/plan-logic.txt"
PUBLISHER_LOGIC="$SCAN_DIR/publisher-logic.txt"
BOOTSTRAP_ALL="$SCAN_DIR/bootstrap-all.txt"

LEARNER_LOGIC="$SCAN_DIR/learner-logic.txt"

code_of "$PLAN" > "$PLAN_LOGIC"
code_of "$PUBLISHER" > "$PUBLISHER_LOGIC"
cat "$PLAN_LOGIC" "$PUBLISHER_LOGIC" > "$BOOTSTRAP_ALL"

{
  code_of "$PRESENTATION"
  code_of "$VIEW"
} > "$LEARNER_LOGIC"

for scan in "$PLAN_LOGIC" "$PUBLISHER_LOGIC" "$BOOTSTRAP_ALL" "$LEARNER_LOGIC"; do
  [ -s "$scan" ] || fail "a scan file came out empty: $scan"
done

echo "===== ROAS-4 COMPLETION GATE ====="
echo ""

# ------------------------------------------------------------
# 1. The publication plan is derived from the authored curriculum
# ------------------------------------------------------------
for source in ROAS_MODULES ROAS_MISSIONS ROAS_COMPETENCIES \
              ROAS_COMPETENCY_PREREQUISITES ROAS_COURSE \
              ROAS_LEARNING_PATH_STABLE_ID; do
  grep -Fq -e "$source" "$PLAN" \
    || fail "the bootstrap plan does not read the authored source: $source"
done

grep -Fq 'export function buildRoasCurriculumBootstrapPlan' "$PLAN" \
  || fail "there is no derived bootstrap plan"
grep -Fq 'buildRoasAuthoringPlan' "$PLAN" \
  || fail "the phase split does not derive from the ROAS-2 authoring plan"

# The plan module must be inert: it computes, it does not reach anything.
PLAN_IMPORTS="$(grep -oE 'from "[^"]+"' "$PLAN" | sed 's/from //' | tr -d '"' \
  | LC_ALL=C sort -u | tr '\n' ' ')"
[ "$PLAN_IMPORTS" = "./roas-curriculum " ] \
  || fail "the bootstrap plan imports beyond the authored content: $PLAN_IMPORTS"

# Precise reach targets, not the bare word "supabase": this module names
# SUPABASE_URL in the environment decision precisely in order to refuse the
# wrong one, and a substring match would fire on the guard itself. The import
# allowlist above is the load-bearing proof; this is the second line.
for forbidden in '@supabase/supabase-js' createServerSupabaseClient \
                 'createClient(' 'fetch(' 'process.env' \
                 '.from(' '.insert(' '.rpc('; do
  if grep -qF -e "$forbidden" "$PLAN_LOGIC"; then
    fail "the bootstrap plan performs I/O or reaches a client: $forbidden"
  fi
done

grep -Fq 'export * from "./roas-bootstrap";' "$INDEX" \
  || fail "the bootstrap plan is not exported from shared-types"

echo "PASS:  1. the publication plan is derived from the ROAS-2 authored source"

# ------------------------------------------------------------
# 2. The approved shape survives into the plan
# ------------------------------------------------------------
grep -Fq 'mission.brief' "$PLAN" \
  || fail "the authored instructional brief never reaches the published mission"
grep -Fq 'link.required' "$PLAN" \
  || fail "the required-competency flag is dropped on the way to publication"
grep -Fq 'left.position - right.position' "$PLAN" \
  || fail "the plan does not order by the authored position"
grep -Fq 'estimatedMinutes' "$PLAN" \
  || fail "effort metadata is dropped; buildLearningPathQualityReport requires it"

echo "PASS:  2. authored ordering, briefs, effort and required flags survive"

# ------------------------------------------------------------
# 3. No second curriculum truth was created
# ------------------------------------------------------------
# The load-bearing check. Every authored string long enough to be content
# rather than a token must NOT appear in the plan or the publisher. A course
# pasted into a seed script fails here whatever the tests say.
DUPLICATED=0
while IFS= read -r authored; do
  [ -n "$authored" ] || continue
  # -e is required: an authored line may begin with "- ".
  if grep -Fq -e "$authored" "$BOOTSTRAP_ALL"; then
    echo "  duplicated authored content: ${authored:0:72}…"
    DUPLICATED=$((DUPLICATED + 1))
  fi
done <<EOF
$(grep -oE '"[^"]{60,}"' "$CONTENT" | sed 's/^"//' | sed 's/"$//' | LC_ALL=C sort -u)
EOF

[ "$DUPLICATED" = "0" ] \
  || fail "$DUPLICATED authored string(s) were copied into the bootstrap; it must project the ROAS-2 content, not restate it"

# Structural counts must not be pinned either.
if grep -qE '(modules|missions|competencies)\.length\s*(===|==)\s*[0-9]' "$BOOTSTRAP_ALL"; then
  fail "the bootstrap pins a curriculum count instead of publishing what is authored"
fi

# And no raw SQL seed may exist: application invariants must not be bypassed.
if [ -d supabase/seed ]; then
  fail "a supabase/seed directory exists; publication must go through the authoring operations"
fi
if grep -qiE 'insert into|create table|alter table' "$BOOTSTRAP_ALL"; then
  fail "the bootstrap contains raw SQL; it must use the existing authoring operations"
fi

echo "PASS:  3. no duplicated curriculum payload and no raw SQL seed"

# ------------------------------------------------------------
# 4. The environment guard fails closed
# ------------------------------------------------------------
grep -Fq 'export function resolveBootstrapEnvironment' "$PLAN" \
  || fail "there is no environment decision at all"

# Production is refused unconditionally — and the refusal must not be reachable
# past a confirmation, which is why it is the first branch.
grep -Fq 'appEnv === "production"' "$PLAN" \
  || fail "production is not explicitly rejected"
grep -Fq 'there is no override' "$PLAN" \
  || fail "the production refusal no longer states that it cannot be overridden"

# An unrecognised environment must be refused, not assumed safe.
grep -Fq 'appEnv !== "development" && appEnv !== "test"' "$PLAN" \
  || fail "an unrecognised APP_ENV is not refused"

# Hostname evidence is a second barrier behind the env var.
grep -Fq 'export function looksLikeProductionTarget' "$PLAN" \
  || fail "a production-looking target is not detected independently of APP_ENV"

# Dry run must be the default: a write needs a confirmation naming the target.
grep -Fq 'mode: "dry_run"' "$PLAN" \
  || fail "there is no dry-run mode"
grep -Fq 'confirmation !== requiredConfirmationFor(supabaseUrl)' "$PLAN" \
  || fail "the confirmation is not required to name the target exactly"

# There must be no force/override path anywhere.
for override in '--force' 'FORCE' 'ALLOW_PRODUCTION' 'skipGuard' 'bypass'; do
  if grep -qF -e "$override" "$BOOTSTRAP_ALL"; then
    fail "an override path exists that could reach a refused environment: $override"
  fi
done

# The publisher must actually consult the guard before doing anything.
grep -Fq 'resolveBootstrapEnvironment' "$PUBLISHER" \
  || fail "the publisher does not consult the environment guard"
grep -Fq 'if (decision.mode === "dry_run")' "$PUBLISHER" \
  || fail "the publisher does not honour dry-run mode"

echo "PASS:  4. the environment guard fails closed and production is unreachable"

# ------------------------------------------------------------
# 5. Publication goes through the existing authoring operations
# ------------------------------------------------------------
for operation in createDraftLearningPath createDraftCourse createDraftModule \
                 createDraftMission createDraftCompetency \
                 addCompetencyPrerequisite linkMissionCompetency \
                 validateLearningPathForPublication \
                 transitionLearningPathState; do
  grep -Fq -e "$operation" "$PUBLISHER" \
    || fail "the publisher does not use the existing authoring operation: $operation"
  grep -Fq "export async function $operation" "$CURRICULUM_ADMIN" \
    || grep -Fq "export function $operation" "$CURRICULUM_ADMIN" \
    || fail "the publisher names an operation that does not exist: $operation"
done

# Writes must go through those operations, never direct table mutation. Reads
# are permitted and necessary — that is how a re-run finds what already exists.
for mutation in '.insert(' '.upsert(' '.update(' '.delete('; do
  if grep -qF -e "$mutation" "$PUBLISHER_LOGIC"; then
    fail "the publisher mutates a table directly instead of using the authoring operations: $mutation"
  fi
done

# Publication must respect the approved lifecycle rather than inventing a jump.
grep -Fq '"review"' "$PUBLISHER" \
  || fail "the publisher skips the review state; draft -> published is not a valid transition"
grep -Fq '"published"' "$PUBLISHER" \
  || fail "the publisher never publishes"

# Validation must gate the publish, and must stop it when it fails.
grep -Fq 'if (!validation.valid)' "$PUBLISHER" \
  || fail "the publisher does not stop when publication validation fails"
grep -Fq 'Refusing to publish' "$PUBLISHER" \
  || fail "a failed validation does not refuse the publication"

echo "PASS:  5. publication uses the guarded authoring operations and lifecycle"

# ------------------------------------------------------------
# 6. Nothing fabricates a learner
# ------------------------------------------------------------
# No progress, evidence or competency-state write may exist anywhere here.
for fabricated in student_learning_progress record_mission_progress \
                  evidence_records student_competency_state \
                  lab_validation_runs certificates \
                  competency_demonstrated awardCompetency; do
  if grep -qF -e "$fabricated" "$BOOTSTRAP_ALL"; then
    fail "the bootstrap reaches learner state it must never write: $fabricated"
  fi
done

# The structural reason it cannot: progress resolves the learner from auth.uid(),
# so the service role has no path to write it. Pin that the migration still
# says so, or the argument above would quietly become false.
grep -Fq 'auth.uid()' "$PROGRESS_MIGRATION" \
  || fail "record_mission_progress no longer resolves the learner from auth.uid(); progress could become seedable"

# The lab phase must be deferred, not executed.
grep -Fq 'ROAS_LAB_PHASE_KINDS' "$PLAN" \
  || fail "the lab phase is not identified at all"
grep -Fq 'deferredOperations' "$PLAN" \
  || fail "deferred lab operations are not reported"
for labOperation in createDraftLabDefinition addLabValidationChecks \
                    transitionLabValidationProfileState \
                    transitionLabDefinitionState; do
  if grep -qF -e "$labOperation(" "$PUBLISHER_LOGIC"; then
    fail "the publisher executes a lab operation; no provider implements the probes: $labOperation"
  fi
done

echo "PASS:  6. no learner progress, evidence, competency or lab is fabricated"

# ------------------------------------------------------------
# 7. The demonstration mission still has no completion path
# ------------------------------------------------------------
# The strongest form of the lab rule. Even on a fully published, fully reachable
# course, the learner must not be offered a way to complete the mission the
# deterministic validator owns.
grep -Fq 'if (mission.isDemonstration) return false;' "$PRESENTATION" \
  || fail "the demonstration mission can record progress; that is a simulated lab pass"
grep -Fq 'mission?.isDemonstration' "$PRESENTATION" \
  || fail "the learner is not told why the demonstration cannot be completed"
grep -Fq 'not available yet' "$PRESENTATION" \
  || fail "the course implies a lab environment exists"

# The view must pass the mission itself, or the rule above never applies.
grep -Fq 'publishedMissionStableIds,
            selectedMission' "$VIEW" \
  || fail "the view does not pass the mission to the progress-control decision"

# And nothing may offer a substitute completion. Comment-stripped: the rule
# above is allowed to explain in prose that a simulated pass is forbidden.
for simulated in 'simulate' 'markLabPassed' 'fakePass' 'Complete lab' \
                 'Pass lab' 'mockValidation'; do
  if grep -qiF -e "$simulated" "$LEARNER_LOGIC"; then
    fail "a simulated lab completion was introduced: $simulated"
  fi
done

echo "PASS:  7. the demonstration mission remains honestly uncompletable"

# ------------------------------------------------------------
# 8. Idempotency is designed, not hoped for
# ------------------------------------------------------------
# curriculum-admin allocates version = max + 1 on every create, so a re-run
# without existence checks would produce a second version of the whole course.
grep -Fq 'async function findExisting' "$PUBLISHER" \
  || fail "the publisher has no existence check; a re-run would create a second version"
grep -Fq 'nextVersionFor' "$CURRICULUM_ADMIN" \
  || fail "curriculum-admin no longer versions on create; the idempotency reasoning above is stale"

# Every versioned node type must actually consult it. Asserting only that the
# helper exists is not enough: a mutation that bypassed the lookup for one table
# survived that weaker check, because the helper was still defined and still
# used elsewhere. Each table is named at a call site here instead.
for versioned in learning_paths courses learning_modules missions competencies; do
  grep -Fq -e "findExisting(\"$versioned\"" "$PUBLISHER" \
    || fail "no existence check before creating $versioned; a re-run would create a second version of it"
done
grep -Fq 'prerequisiteExists' "$PUBLISHER" \
  || fail "competency prerequisites are not checked before insert; a re-run would fail"
grep -Fq 'report("reuse"' "$PUBLISHER" \
  || fail "a re-run does not report what it reused"

echo "PASS:  8. re-running reuses existing nodes instead of re-versioning"

# ------------------------------------------------------------
# 9. Nothing was executed, and no scope was expanded
# ------------------------------------------------------------
MIGRATION_COUNT="$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
[ "$MIGRATION_COUNT" = "36" ] \
  || fail "the migration set changed: $MIGRATION_COUNT migrations (36 expected)"

CHANGED_MIGRATIONS="$(git diff --name-only origin/main...HEAD -- supabase 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_MIGRATIONS" = "0" ] \
  || fail "ROAS-4 changed $CHANGED_MIGRATIONS files under supabase/; no schema change is authorized"

CHANGED_LOCK="$(git diff --name-only origin/main...HEAD -- package-lock.json 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
[ "$CHANGED_LOCK" = "0" ] \
  || fail "ROAS-4 changed the lockfile; no dependency change is authorized"

# No secret may be committed, and the command must read credentials from the
# environment rather than carrying one.
if grep -qE 'eyJ[A-Za-z0-9_-]{20,}|service_role_key\s*=\s*"' "$BOOTSTRAP_ALL"; then
  fail "a credential appears to be embedded in the bootstrap"
fi

# The runbook must be honest about what is still required.
grep -Fq 'Needs your Supabase project' "$RUNBOOK" \
  || fail "the runbook does not state that a Supabase project is still required"
grep -Fq 'Prepared, not executed' "$RUNBOOK" \
  || fail "the runbook does not state that nothing was executed"

echo "PASS:  9. no migration, dependency, secret or executed write"

# ------------------------------------------------------------
# 10. The gate participates in the DEV-FLOW-2 workflow
# ------------------------------------------------------------
grep -Fq 'target="scripts/verify-${command_name}.sh"' scripts/run-gate.sh \
  || fail "run-gate.sh no longer resolves a bare verifier name; npm run gate -- roas4 would break"

for roas4_path in packages/shared-types/src/roas-bootstrap.ts \
                  services/api/src/admin/publish-roas-curriculum.ts \
                  scripts/verify-roas4.sh; do
  SELECTED="$(bash scripts/ci-select-gates.sh "$roas4_path")"
  case "$SELECTED" in
    *scripts/verify-roas4.sh*) ;;
    *) fail "$roas4_path does not select this gate; it selected: $SELECTED" ;;
  esac
done

echo "PASS: 10. the gate resolves through the verifier namespace and owns its paths"

# ------------------------------------------------------------
# 11. Tests, and the ROAS-3 learner surface remains green
# ------------------------------------------------------------
grep -Fq 'ROAS_MISSIONS' "$PLAN_TESTS" \
  || fail "the bootstrap tests do not compare against the authored curriculum"
grep -Fq 'BootstrapEnvironmentError' "$PLAN_TESTS" \
  || fail "the environment guard is never exercised by a test"

echo ""
if [ "${TLP_CI_BASELINE_VERIFIED:-}" = "1" ]; then
  echo "--- ROAS-4 tests: SKIPPED ---"
  echo "TLP_CI_BASELINE_VERIFIED=1 — the hardened CI baseline already ran the"
  echo "full shared-types suite, which includes roas-bootstrap.test.ts."
else
  echo "--- running the ROAS-4 bootstrap tests ---"
  npm run test --workspace @tlp/shared-types -- roas-bootstrap
fi

echo ""
echo "--- deferring to the ROAS-3 learner surface gate ---"
bash scripts/verify-roas3.sh

echo ""
echo "============================================================"
echo "ROAS-4 FOUNDER UAT READINESS VERIFIED"
echo "The Router-on-a-Stick curriculum can be published through the"
echo "existing curriculum authoring operations by an explicit Founder"
echo "command. The plan is projected from the ROAS-2 authored source,"
echo "so no second curriculum truth exists. The command dry-runs by"
echo "default, refuses production unconditionally, requires a"
echo "confirmation naming the target project, and reuses existing"
echo "nodes on a re-run. It writes no progress, evidence, competency"
echo "or lab, and the demonstration mission remains uncompletable."
echo ""
echo "This gate proves READINESS only. It does NOT prove:"
echo "  - that anything has been published; nothing was executed"
echo "  - live PostgreSQL or RLS behaviour, still never exercised"
echo "  - that a lab exists; no provider implements the probes"
echo "  - instructional quality, which is a Founder judgement"
echo "============================================================"
