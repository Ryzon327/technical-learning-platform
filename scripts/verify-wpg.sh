#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# WP-G COMPLETION GATE — curriculum as data.
#
# ## What this gate is for
#
# The WP-G test suites prove behaviour: what the planner decides and what the
# importer writes. They cannot prove ABSENCE across the package — that no
# DELETE exists anywhere, that the publisher carries no course content, that the
# migration grants nothing broader than approved. Those are properties of the
# source, and this is where they are checked.
#
# ## Deliberately not brittle
#
# Every check tests a property, not a formatting choice. Nothing here fails on
# whitespace, prop order or where a comment sits. A gate that rejects harmless
# formatting is reverted the first time it fires.
#
# ## Absence checks judge comment-stripped code
#
# Several comments name `DELETE`, `expectedOutcome` and assessment tables
# precisely in order to say they are absent.
#
# ## No pipelines into grep
#
# Under `set -o pipefail`, `echo "$BIG" | grep -q` can return 141 when grep exits
# on an early match while echo is still writing — an absence check then reads a
# real hit as clean. Every check greps a FILE.
# ============================================================

CONTRACT="packages/shared-types/src/curriculum-document.ts"
PLANNER="services/api/src/curriculum-reconciliation.ts"
IMPORTER="services/api/src/curriculum-import.ts"
READER="services/api/src/curriculum-current-state.ts"
PATHS="services/api/src/curriculum-content-path.ts"
COMMAND="services/api/src/admin/publish-curriculum.ts"
ADMIN="services/api/src/curriculum-admin.ts"
MIGRATION="supabase/migrations/20260902000100_curriculum_authoring_privileges.sql"
FIXTURE="content/fixtures/curriculum-architecture-example.json"
SELECTOR="scripts/ci-select-gates.sh"

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

echo "===== WP-G CURRICULUM-AS-DATA GATE ====="
echo ""

for required in "$CONTRACT" "$PLANNER" "$IMPORTER" "$READER" "$PATHS" \
                "$COMMAND" "$ADMIN" "$MIGRATION" "$FIXTURE" "$SELECTOR"; do
  # `-f` and never `-x`: verifiers are invoked with `bash`, so an execute-bit
  # test would let a mode accident silently skip a gate while reporting success.
  [ -f "$required" ] || fail "missing required file: $required"
done

SCAN_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_DIR"' EXIT

WPG_LOGIC="$SCAN_DIR/wpg-logic.txt"
COMMAND_LOGIC="$SCAN_DIR/command-logic.txt"
IMPORTER_LOGIC="$SCAN_DIR/importer-logic.txt"

code_of() { grep -vE '^\s*(//|\*|/\*|--)' "$1" || true; }

code_of "$COMMAND" > "$COMMAND_LOGIC"
code_of "$IMPORTER" > "$IMPORTER_LOGIC"
cat "$COMMAND_LOGIC" "$IMPORTER_LOGIC" > "$WPG_LOGIC"
code_of "$PLANNER" >> "$WPG_LOGIC"
code_of "$READER" >> "$WPG_LOGIC"
code_of "$PATHS" >> "$WPG_LOGIC"

# ------------------------------------------------------------
# 1. Curriculum is authored as strict data, outside the bundle
# ------------------------------------------------------------
grep -Fq 'export function parseCurriculumDocument' "$CONTRACT" \
  || fail "there is no curriculum document parser"

# Unknown fields fail. DEC-056 chose JSON over YAML because silent misparse is
# the wrong failure mode for content; tolerating unknown keys would reintroduce
# it having paid for the format that avoids it.
grep -Fq 'carries an unknown field' "$CONTRACT" \
  || fail "the document parser tolerates unknown fields"

# No authoring escape hatch.
if grep -qE '"_note"|"_comment"|"metadata"' "$CONTRACT"; then
  fail "the document contract admits a free-form metadata field"
fi

echo "PASS:  1. curriculum is authored as strictly parsed data"

# ------------------------------------------------------------
# 2. The closed step vocabulary is not re-declared
# ------------------------------------------------------------
# The document contract must reuse WP-C's model rather than defining a second
# one. DEC-054 closed the vocabulary; a parallel list here would be the start of
# frontend-created curriculum vocabulary.
grep -Fq 'from "./mission-steps"' "$CONTRACT" \
  || fail "the document contract does not reuse the mission step model"
grep -Fq 'validateMissionStep' "$CONTRACT" \
  || fail "the document contract does not reuse the mission step validator"
grep -Fq 'validateCurriculumAsset' "$CONTRACT" \
  || fail "the document contract does not reuse the curriculum asset validator"

echo "PASS:  2. the approved step and asset contracts are reused, not restated"

# ------------------------------------------------------------
# 3. The publisher is generic and carries no course content
# ------------------------------------------------------------
# DEC-056: "The publication command must never contain course content. It reads
# a file path."
for forbidden in ROAS_MISSIONS ROAS_MODULES ROAS_COMPETENCIES ROAS_COURSE \
                 ROAS_KNOWLEDGE_CHECKS buildRoasCurriculumBootstrapPlan; do
  if grep -qF -e "$forbidden" "$WPG_LOGIC"; then
    fail "WP-G reaches for compiled ROAS curriculum: $forbidden"
  fi
done

grep -Fq 'resolveProductionContentPath' "$COMMAND" \
  || fail "the command does not resolve its input through the content path check"

echo "PASS:  3. the publisher reads a document and contains no curriculum"

# ------------------------------------------------------------
# 4. Fixtures cannot be published
# ------------------------------------------------------------
# Three independent refusals. Two are path-based and one travels inside the
# document, so a fixture copied into the production directory is still refused.
grep -Fq 'PRODUCTION_CONTENT_ROOT' "$PATHS" \
  || fail "there is no production content root"
grep -Fq 'FIXTURE_CONTENT_ROOT' "$PATHS" \
  || fail "the fixture root is not refused explicitly"
grep -Fq 'realpathSync' "$PATHS" \
  || fail "the path check does not follow symlinks; a link could leave the content root"
grep -Fq 'isPublishableDocumentKind' "$COMMAND" \
  || fail "the command does not refuse a non-production document kind"

grep -Fq '"documentKind": "architecture_fixture"' "$FIXTURE" \
  || fail "the architecture fixture is not marked as a fixture"

echo "PASS:  4. an architecture fixture cannot reach the learner catalog"

# ------------------------------------------------------------
# 5. Complete plan before mutation
# ------------------------------------------------------------
grep -Fq 'planIsSafeToExecute' "$IMPORTER" \
  || fail "the importer does not consult the global safety gate"
grep -Fq 'findPlannedNode' "$IMPORTER" \
  || fail "the importer does not look actions up in the plan"
grep -Fq 'MissingPlanEntryError' "$IMPORTER" \
  || fail "a missing plan entry is not a failure"

# The fallback this package exists to prevent.
if grep -qE '\?\?\s*"create"' "$IMPORTER_LOGIC"; then
  fail "the importer defaults a missing plan entry to create"
fi

# Every write category must be planned.
for section in missionContent missionCompetencyLinks competencyPrerequisites \
               prerequisiteRules; do
  grep -Fq "$section" "$PLANNER" \
    || fail "the plan does not cover $section"
  grep -Fq "$section" "$IMPORTER" \
    || fail "the importer writes $section without consulting the plan"
done

echo "PASS:  5. every write is planned and gated before mutation"

# ------------------------------------------------------------
# 6. Refusals are distinguished and never execute
# ------------------------------------------------------------
grep -Fq 'unsupported_removal' "$PLANNER" \
  || fail "unsupported destructive reconciliation is not modelled"
grep -Fq 'published_content' "$PLANNER" \
  || fail "published-content conflicts are not modelled"
grep -Fq 'must never reach mutation' "$IMPORTER" \
  || fail "the importer does not refuse a conflicting plan entry"

echo "PASS:  6. published-content and removal refusals are distinct and terminal"

# ------------------------------------------------------------
# 7. No DELETE, anywhere
# ------------------------------------------------------------
# WP-G creates and updates. Removal is refused during planning, never performed.
for forbidden in '.delete(' 'DELETE FROM' 'delete from'; do
  if grep -qF -e "$forbidden" "$WPG_LOGIC"; then
    fail "WP-G performs a delete: $forbidden"
  fi
done

if grep -qiE 'grant[[:space:]]+[^;]*delete' "$MIGRATION"; then
  fail "the WP-G migration grants DELETE"
fi

echo "PASS:  7. no delete operation and no delete grant"

# ------------------------------------------------------------
# 8. The migration grants exactly the approved verbs
# ------------------------------------------------------------
python3 - "$MIGRATION" <<'PYTHON'
import re
import sys

path = sys.argv[1]
text = "\n".join(line.split("--", 1)[0] for line in open(path, encoding="utf-8"))

# The approved WP-G contract, verb by verb:
#   courses / learning_modules / missions / competencies
#       UPDATE  updateDraftCurriculumNode — revising a draft
#   learning_prerequisite_rules
#       SELECT  readPrerequisiteRules — complete plan before mutation
#       INSERT  upsertPrerequisiteRule — the new-rule half
#       UPDATE  upsertPrerequisiteRule — INSERT ... ON CONFLICT DO UPDATE
EXPECTED = {
    "courses": {"update"},
    "learning_modules": {"update"},
    "missions": {"update"},
    "competencies": {"update"},
    "learning_prerequisite_rules": {"select", "insert", "update"},
}

found = {}
for verbs, table in re.findall(
    r"grant\s+([a-z, ]+?)\s+on\s+public\.([a-z_]+)\s+to\s+service_role", text, re.I
):
    key = table.strip()
    found.setdefault(key, set()).update(
        v.strip().lower() for v in verbs.split(",") if v.strip()
    )

if found != EXPECTED:
    print("FAIL: 8. the WP-G migration does not grant exactly the approved verbs", file=sys.stderr)
    print(f"  expected: {EXPECTED}", file=sys.stderr)
    print(f"  found:    {found}", file=sys.stderr)
    sys.exit(1)

for forbidden in ["all tables in schema", "alter default privileges", "grant all"]:
    if forbidden in text.lower():
        print(f"FAIL: 8. the migration contains a blanket grant: {forbidden}", file=sys.stderr)
        sys.exit(1)

# Matched as a GRANT target, not as a substring: `insert into
# public.platform_schema_version` contains "to public" and is not a grant.
for role in ["anon", "authenticated", "public"]:
    if re.search(rf"grant\s+[^;]*?\bto\s+{role}\b", text, re.I | re.S):
        print(f"FAIL: 8. the migration widens a learner-facing role: {role}", file=sys.stderr)
        sys.exit(1)
PYTHON

echo "PASS:  8. the migration grants exactly the approved narrow verbs"

# ------------------------------------------------------------
# 9. The guarded draft update stays draft-scoped
# ------------------------------------------------------------
# The predicate must be part of the UPDATE statement, not only of a preceding
# read. A read/check/write is a check-then-act race, and the consequence is
# published curriculum revised in place.
grep -Fq '.eq("publication_state", "draft")' "$ADMIN" \
  || fail "no guarded update carries the draft predicate on the statement"

GUARDED="$(grep -c '.eq("publication_state", "draft")' "$ADMIN")"
[ "$GUARDED" -ge 2 ] \
  || fail "only $GUARDED guarded update(s) found; both node and learning-path updates must be guarded"

echo "PASS:  9. draft revision is guarded at the write boundary"

# ------------------------------------------------------------
# 9b. Mission content writers guard their owning mission
# ------------------------------------------------------------
# Steps, assets and competency links carry no publication state of their own, so
# nothing in their upsert statements prevents writing into a published mission.
# The guard is a read immediately before the write. It is not atomic — closing
# that fully needs a predicate inside the write, which PostgREST cannot express
# for a child table — and the residual is recorded rather than claimed away.
grep -Fq 'async function assertMissionIsDraft' "$ADMIN" \
  || fail "there is no owner-state guard for mission content writers"

for guarded in upsertMissionStep linkMissionCompetency; do
  BODY="$(sed -n "/export async function ${guarded}/,/^}/p" "$ADMIN")"
  case "$BODY" in
    *assertMissionIsDraft*) ;;
    *) fail "$guarded does not confirm the owning mission is a draft" ;;
  esac
done

grep -Fq 'assertMissionIsDraftForAuthoring' services/api/src/curriculum-quality.ts \
  || fail "addMissionAsset does not confirm the owning mission is a draft"

echo "PASS:  9b. mission content writers refuse a non-draft owning mission"

# ------------------------------------------------------------
# 9c. Unreadable persisted content fails closed
# ------------------------------------------------------------
# `content_error` means rows EXIST and cannot be compared. Recording that as an
# empty list would blind removal detection and let an import report success
# while leaving invalid rows in place.
grep -Fq 'unreadable_persisted_content' "$PLANNER" \
  || fail "unreadable persisted content is not a distinct refusal"
grep -Fq 'unreadableMissionContent' "$READER" \
  || fail "the reader does not report content it could not read"

if grep -qE 'state === "available" \? [a-z.]+ : \[\]' "$READER"; then
  # The mapping itself is fine — `legacy_brief` genuinely means no steps — but
  # it must be accompanied by the content_error report above.
  grep -Fq 'state === "content_error"' "$READER" \
    || fail "the reader collapses an unreadable content state into an empty one"
fi

echo "PASS:  9c. unreadable persisted content is reported, not treated as absent"

# ------------------------------------------------------------
# 10. No assessment publication, no learner state, no re-versioning
# ------------------------------------------------------------
for forbidden in assessment_definitions assessment_questions \
                 student_learning_progress assessment_attempts \
                 student_competency_state evidence_records; do
  if grep -qF -e "$forbidden" "$WPG_LOGIC"; then
    fail "WP-G reaches a table it must not: $forbidden"
  fi
done

# Re-versioning is deferred. `createDraft*` allocates a version server-side;
# WP-G must not drive a second version deliberately.
#
# Matched on implementation signals only — a function that allocates a version,
# or version arithmetic. The words "re-versioning" also appear in the refusal
# messages that TELL an operator this is out of scope, and failing on those
# would punish the code for explaining itself.
if grep -qE 'nextVersionFor|version\s*\+\s*1|version:\s*[a-z]+\.version\s*\+' "$WPG_LOGIC"; then
  fail "WP-G implements automatic re-versioning, which is deferred"
fi

echo "PASS: 10. no assessment publication, learner-state write or re-versioning"

# ------------------------------------------------------------
# 11. Curriculum stays inert
# ------------------------------------------------------------
for forbidden in dangerouslySetInnerHTML 'eval(' 'new Function' innerHTML; do
  if grep -qF -e "$forbidden" "$WPG_LOGIC"; then
    fail "WP-G opens an execution or markup path: $forbidden"
  fi
done

echo "PASS: 11. authored curriculum remains inert data"

# ------------------------------------------------------------
# 12. Publication is explicit and separate from reconciliation
# ------------------------------------------------------------
# The PROPERTY, not the word. `grep 'publish'` would match a comment and prove
# nothing; this asserts the branch that returns without publishing when the
# operator did not ask.
grep -Fq 'if (!input.publish)' "$IMPORTER" \
  || fail "publication is not gated on an explicit request"
grep -Fq '"reconciled"' "$IMPORTER" \
  || fail "reconciliation is not a distinct outcome from publication"
grep -Fq '"already_current"' "$IMPORTER" \
  || fail "an identical rerun has no zero-write outcome"
grep -Fq '"refused_review"' "$IMPORTER" \
  || fail "review-state curriculum is not refused explicitly"

# The confirmation contract is reused, not reimplemented.
grep -Fq 'resolveBootstrapEnvironment' "$COMMAND" \
  || fail "the command does not reuse the proven environment guard"

# CI must not publish.
if grep -rlq 'admin:publish-curriculum' .github/workflows 2>/dev/null; then
  fail "a workflow invokes the publication command; publication is Founder-controlled"
fi

echo "PASS: 12. publication is explicit, separate, and never automated"

# ------------------------------------------------------------
# 13. The gate resolves through the verifier namespace
# ------------------------------------------------------------
[ -f scripts/verify-wpg.sh ] \
  || fail "this gate is not resolvable as scripts/verify-wpg.sh"

grep -Fq 'scripts/verify-wpg.sh' "$SELECTOR" \
  || fail "the gate is not registered in change-relevant gate selection"

echo "PASS: 13. the gate resolves through the verifier namespace and is selected"

# ------------------------------------------------------------
# WP-G tests
# ------------------------------------------------------------
echo ""
echo "--- running the WP-G suites ---"
npm run test --workspace @tlp/api -- curriculum-document curriculum-content-path curriculum-command-args curriculum-reconciliation curriculum-import curriculum-admin-draft-update

echo ""
echo "=========================================================="
echo "WP-G CURRICULUM-AS-DATA VERIFIED"
echo ""
echo "Curriculum is authored as strictly parsed JSON outside the"
echo "application bundle, reusing the approved step and asset"
echo "contracts rather than restating them. Every write is planned"
echo "and gated before mutation; published curriculum is never"
echo "revised in place and removal is refused rather than"
echo "performed. Reconciliation and publication are separate acts."
echo ""
echo "This gate proves SOURCE STRUCTURE and pure logic. It does NOT prove:"
echo "  - that any import has been run against a real database"
echo "  - that the WP-G migration has been applied; it has not"
echo "  - anything about instructional quality, which is Human UAT"
echo "=========================================================="
