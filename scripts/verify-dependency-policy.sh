#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================================================
# THE DEPENDENCY POLICY, PROVED TWICE OVER
#
# Nine verifiers decide "is this dependency change the one the Founder
# authorized" by calling one shared policy. This gate proves that policy in two
# independent ways, because each catches what the other cannot.
#
# ## PURE cases (A-P)
#
# Plain JSON objects in memory, fed to the policy functions. Fast, exhaustive
# about SHAPES, and they touch nothing.
#
# ## LIVE cases (1-7)
#
# Real temporary git repositories, with real commits, running the real wrapper.
# These exist because the pure cases were not enough: they could not see that
# the wrapper derived its baseline from `git show HEAD:`, which is sound while a
# branch is dirty and silently authorizes ANYTHING once the same content is
# committed. TEST 2 is that exact scenario, and it is the reason this section
# exists.
#
# Every temporary repository lives under `mktemp -d` and is removed on exit.
# Nothing here mutates this repository, reaches the network, or runs npm.
# ============================================================

fail() { echo "GATE FAIL: $1" >&2; exit 1; }

POLICY="scripts/lib/authorized-dependency-policy.mjs"
WRAPPER="scripts/lib/authorized-dependency.sh"
[ -f "$POLICY" ] || fail "the dependency policy module is missing: $POLICY"
[ -f "$WRAPPER" ] || fail "the dependency policy wrapper is missing: $WRAPPER"

echo "===== DEPENDENCY POLICY GATE ====="
echo ""
echo "--- pure policy cases ---"

node --input-type=module -e '
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  checkAuthorizedManifest,
  checkUnauthorizedManifest,
  checkLockfile,
  authorizationIsSpent,
  AUTHORIZED_LOCKFILE_SHA256
} from "./scripts/lib/authorized-dependency-policy.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));

const BASE = {
  name: "@tlp/web",
  version: "0.1.0",
  private: true,
  type: "module",
  scripts: { test: "vitest run", build: "tsc -b && vite build" },
  dependencies: { react: "^19.0.0", vite: "^6.1.0" },
  devDependencies: { eslint: "^9.17.0", vitest: "^3.0.5" }
};

const withJsdom = () => {
  const after = clone(BASE);
  after.devDependencies = { ...after.devDependencies, jsdom: "^30.0.1" };
  return after;
};

/* The REAL approved lockfile, so the whole-file pin is exercised for real. */
const APPROVED_LOCK = readFileSync("package-lock.json", "utf8");

const cases = [];
const refuse = (id, what, problems) =>
  cases.push({ id, what, ok: problems.length > 0, kind: "refused", problems });
const accept = (id, what, problems) =>
  cases.push({ id, what, ok: problems.length === 0, kind: "accepted", problems });

/* A-H: manifest shapes that must be refused. */
{ const a = withJsdom(); a.dependencies.react = "^19.9.9";
  refuse("A", "an existing production dependency version changed", checkAuthorizedManifest(BASE, a)); }
{ const a = withJsdom(); a.devDependencies.vitest = "^3.9.9";
  refuse("B", "an existing dev dependency version changed", checkAuthorizedManifest(BASE, a)); }
{ const a = withJsdom(); a.devDependencies["happy-dom"] = "^15.0.0";
  refuse("C", "happy-dom added alongside jsdom", checkAuthorizedManifest(BASE, a)); }
{ const a = withJsdom(); a.devDependencies["@testing-library/react"] = "^16.0.0";
  refuse("D", "@testing-library/react added", checkAuthorizedManifest(BASE, a)); }
{ const a = clone(BASE); a.dependencies = { ...a.dependencies, jsdom: "^30.0.1" };
  refuse("E", "jsdom moved to production dependencies", checkAuthorizedManifest(BASE, a)); }
{ const a = withJsdom(); a.scripts.test = "vitest run --coverage";
  refuse("F", "a package script changed", checkAuthorizedManifest(BASE, a)); }
{ const a = withJsdom(); a.sideEffects = false;
  refuse("G", "an unrelated top-level manifest field was added", checkAuthorizedManifest(BASE, a)); }
{ const a = withJsdom(); delete a.dependencies.vite;
  refuse("H", "an existing dependency was removed", checkAuthorizedManifest(BASE, a)); }

/* I-K: the whole-lockfile pin. Any byte differing from the approved file
   fails, which is the point of pinning the file rather than a subset.

   Each mutation is applied to the PARSED lockfile and re-serialised, so the
   cases describe a semantic tampering rather than a text substitution. */
const tampered = (mutate) => {
  const lock = JSON.parse(APPROVED_LOCK);
  mutate(lock);
  return JSON.stringify(lock, null, 2) + "\n";
};

refuse("I", "a lockfile with an unrelated package added",
  checkLockfile(BASE, "{}", tampered((lock) => {
    lock.packages["node_modules/left-pad"] = { version: "1.3.0", dev: true };
  }), sha256));

refuse("J", "a lockfile with one integrity value altered",
  checkLockfile(BASE, "{}", tampered((lock) => {
    const key = Object.keys(lock.packages).find(
      (name) => typeof lock.packages[name].integrity === "string"
    );
    lock.packages[key].integrity = "sha512-tampered";
  }), sha256));

refuse("K", "a lockfile with an existing record removed",
  checkLockfile(BASE, "{}", tampered((lock) => {
    const key = Object.keys(lock.packages).find(
      (name) => name.startsWith("node_modules/")
    );
    delete lock.packages[key];
  }), sha256));

/*
  A pure parse-and-reserialise round trip, which must NOT fail.

  npm writes lockfiles as `JSON.stringify(lock, null, 2)` with a trailing
  newline, so this reproduces the approved file byte for byte. The case is here
  to prove the whole-file pin does not fire on formatting - the failure mode
  that made an earlier line-counting guard unusable - and to keep the three
  mutations above honest: each of them differs from this baseline by exactly the
  tampering it names, and nothing else.
*/
accept("K2", "an unmodified round trip still matches the pin",
  checkLockfile(BASE, "{}", tampered(() => {}), sha256));

/* L, M: the two that must pass. */
accept("L", "the exact authorized jsdom dev dependency", checkAuthorizedManifest(BASE, withJsdom()));
accept("M", "no dependency delta at all", [
  ...checkAuthorizedManifest(BASE, clone(BASE)),
  ...checkUnauthorizedManifest("package.json", BASE, clone(BASE)),
  ...checkLockfile(BASE, APPROVED_LOCK, APPROVED_LOCK, sha256)
]);

/* N, O: the authorization consumes itself once the base carries it. */
{ const committed = withJsdom(); const later = clone(committed);
  later.scripts.test = "vitest run --coverage";
  refuse("N", "an unrelated change AFTER jsdom is in the base", checkAuthorizedManifest(committed, later)); }
{ const committed = withJsdom(); const later = clone(committed);
  later.dependencies.react = "^19.9.9";
  refuse("O", "a version bump AFTER jsdom is in the base", checkAuthorizedManifest(committed, later)); }
{ refuse("O2", "any lockfile change AFTER jsdom is in the base",
    checkLockfile(withJsdom(), APPROVED_LOCK, APPROVED_LOCK + "\n", sha256)); }
{ accept("O3", "authorizationIsSpent reads the base, not the change",
    authorizationIsSpent(withJsdom()) && !authorizationIsSpent(BASE) ? [] : ["spent-detection is wrong"]); }

/* P: the pin is a real value. */
accept("P", "the approved lockfile pin is a well-formed sha256",
  /^[0-9a-f]{64}$/.test(AUTHORIZED_LOCKFILE_SHA256) ? [] : ["the pin is not a sha256"]);

let failed = 0;
for (const entry of cases) {
  if (entry.ok) {
    console.log("       ok: " + entry.id + " " + entry.kind + " - " + entry.what);
  } else {
    failed += 1;
    console.error("  CASE " + entry.id + " behaved incorrectly: " + entry.what);
    if (entry.problems.length > 0) console.error("    " + entry.problems.join("\n    "));
  }
}
if (failed > 0) {
  console.error(failed + " pure case(s) behaved incorrectly");
  process.exit(1);
}
console.log("");
console.log("       " + cases.length + " pure cases");
'

echo "PASS: the policy refuses every unauthorized shape"
echo ""
echo "--- live wrapper cases, in isolated git repositories ---"

# ------------------------------------------------------------
# The live harness.
#
# Each case builds a throwaway repository with a real base branch, a real
# feature branch, and — where the case calls for it — a real commit. The wrapper
# is sourced from THIS repository and run inside that one, so what is proved is
# the shipped code path rather than a re-implementation of it.
#
# `refs/remotes/origin/main` is created directly, because the resolver
# deliberately accepts only `origin/main` or a pull-request base ref. A local
# `main` is not accepted, precisely so a branch cannot move the baseline it is
# measured against.
# ------------------------------------------------------------
LIVE_ROOT="$(mktemp -d)"
trap 'rm -rf "$LIVE_ROOT"' EXIT

APPROVED_MANIFEST="$ROOT/apps/web/package.json"
APPROVED_LOCKFILE="$ROOT/package-lock.json"
BASE_MANIFEST="$LIVE_ROOT/base-manifest.json"
BASE_LOCKFILE="$LIVE_ROOT/base-lockfile.json"
BASE_REF="$(git -C "$ROOT" merge-base HEAD origin/main 2>/dev/null || true)"
[ -n "$BASE_REF" ] || fail "this repository has no origin/main to derive the live fixtures from"
git -C "$ROOT" show "$BASE_REF:apps/web/package.json" > "$BASE_MANIFEST"
git -C "$ROOT" show "$BASE_REF:package-lock.json" > "$BASE_LOCKFILE"

live_repo() {
  local name="$1" repo="$LIVE_ROOT/$1"
  mkdir -p "$repo/apps/web" "$repo/packages/shared-types" "$repo/services/api" \
           "$repo/scripts/lib"

  cp "$ROOT/package.json" "$repo/package.json"
  cp "$BASE_MANIFEST" "$repo/apps/web/package.json"
  cp "$BASE_LOCKFILE" "$repo/package-lock.json"
  cp "$ROOT/packages/shared-types/package.json" "$repo/packages/shared-types/package.json"
  cp "$ROOT/services/api/package.json" "$repo/services/api/package.json"
  cp "$ROOT/scripts/lib/authorized-dependency.sh" "$repo/scripts/lib/"
  cp "$ROOT/scripts/lib/authorized-dependency-policy.mjs" "$repo/scripts/lib/"

  git -C "$repo" init -q
  git -C "$repo" config user.email "policy@test.invalid"
  git -C "$repo" config user.name "Dependency Policy Test"
  git -C "$repo" add -A
  git -C "$repo" commit -q -m "base"
  # The trusted target branch, as a remote-tracking ref.
  git -C "$repo" update-ref refs/remotes/origin/main HEAD
  git -C "$repo" checkout -q -b feature
  echo "$repo"
}

live_commit() {
  git -C "$1" add -A
  git -C "$1" commit -q -m "feature change"
}

# Runs the real wrapper inside a fixture repo. Echoes PASS or REFUSED.
live_run() {
  local repo="$1"
  if ( cd "$repo" && \
       unset GITHUB_BASE_REF && \
       source scripts/lib/authorized-dependency.sh && \
       authorized_dependency_check "live fixture" ) >"$LIVE_ROOT/out.txt" 2>&1; then
    echo "PASS"
  else
    echo "REFUSED"
  fi
}

live_case() {
  local id="$1" expected="$2" what="$3" actual="$4"
  if [ "$actual" = "$expected" ]; then
    echo "       ok: TEST $id $expected - $what"
  else
    echo "  TEST $id expected $expected but got $actual - $what" >&2
    sed 's/^/    /' "$LIVE_ROOT/out.txt" >&2
    fail "live dependency policy case $id"
  fi
}

# TEST 1 - a hostile version change, DIRTY.
REPO="$(live_repo t1)"
node -e 'const f="'"$REPO"'/apps/web/package.json";const fs=require("fs");const d=JSON.parse(fs.readFileSync(f,"utf8"));d.dependencies.react="^19.9.9";fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");'
live_case 1 REFUSED "a hostile version change, uncommitted" "$(live_run "$REPO")"

# TEST 2 - the same change, COMMITTED. This is the case the old HEAD baseline
# authorized, and the reason the live section exists.
REPO="$(live_repo t2)"
node -e 'const f="'"$REPO"'/apps/web/package.json";const fs=require("fs");const d=JSON.parse(fs.readFileSync(f,"utf8"));d.dependencies.react="^19.9.9";fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");'
live_commit "$REPO"
live_case 2 REFUSED "the same hostile version change, COMMITTED" "$(live_run "$REPO")"

# TEST 3 - a committed script edit, with every dependency name untouched.
REPO="$(live_repo t3)"
node -e 'const f="'"$REPO"'/apps/web/package.json";const fs=require("fs");const d=JSON.parse(fs.readFileSync(f,"utf8"));d.scripts.test="vitest run --coverage";fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");'
live_commit "$REPO"
live_case 3 REFUSED "a committed package script change" "$(live_run "$REPO")"

# TEST 4 - a committed lockfile edit.
REPO="$(live_repo t4)"
node -e 'const f="'"$REPO"'/package-lock.json";const fs=require("fs");fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace("\"lockfileVersion\": 3","\"lockfileVersion\": 3, \"tampered\": true"));'
live_commit "$REPO"
live_case 4 REFUSED "a committed lockfile change" "$(live_run "$REPO")"

# TEST 5 - the exact approved delta, dirty and then committed.
REPO="$(live_repo t5a)"
cp "$APPROVED_MANIFEST" "$REPO/apps/web/package.json"
cp "$APPROVED_LOCKFILE" "$REPO/package-lock.json"
live_case 5a PASS "the exact approved jsdom delta, uncommitted" "$(live_run "$REPO")"

REPO="$(live_repo t5b)"
cp "$APPROVED_MANIFEST" "$REPO/apps/web/package.json"
cp "$APPROVED_LOCKFILE" "$REPO/package-lock.json"
live_commit "$REPO"
live_case 5b PASS "the exact approved jsdom delta, COMMITTED" "$(live_run "$REPO")"

# TEST 6 - the authorization is spent: the BASE already carries jsdom, and an
# unrelated later change must be refused.
REPO="$LIVE_ROOT/t6"
mkdir -p "$REPO/apps/web" "$REPO/packages/shared-types" "$REPO/services/api" "$REPO/scripts/lib"
cp "$ROOT/package.json" "$REPO/package.json"
cp "$APPROVED_MANIFEST" "$REPO/apps/web/package.json"
cp "$APPROVED_LOCKFILE" "$REPO/package-lock.json"
cp "$ROOT/packages/shared-types/package.json" "$REPO/packages/shared-types/package.json"
cp "$ROOT/services/api/package.json" "$REPO/services/api/package.json"
cp "$ROOT/scripts/lib/authorized-dependency.sh" "$REPO/scripts/lib/"
cp "$ROOT/scripts/lib/authorized-dependency-policy.mjs" "$REPO/scripts/lib/"
git -C "$REPO" init -q
git -C "$REPO" config user.email "policy@test.invalid"
git -C "$REPO" config user.name "Dependency Policy Test"
git -C "$REPO" add -A
git -C "$REPO" commit -q -m "base already carries jsdom"
git -C "$REPO" update-ref refs/remotes/origin/main HEAD
git -C "$REPO" checkout -q -b feature
node -e 'const f="'"$REPO"'/apps/web/package.json";const fs=require("fs");const d=JSON.parse(fs.readFileSync(f,"utf8"));d.scripts.test="vitest run --coverage";fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");'
live_commit "$REPO"
live_case 6 REFUSED "an unrelated change once jsdom is already in the base" "$(live_run "$REPO")"

# TEST 7 - no delta at all.
REPO="$(live_repo t7)"
live_case 7 PASS "no dependency delta" "$(live_run "$REPO")"

# TEST 8 - the pull-request base-ref path.
#
# HEAD is the hostile committed commit and `origin/main` is deliberately left
# pointing at it, so the ONLY way to resolve a correct baseline is through
# GITHUB_BASE_REF. If the resolver ignored it, this case would pass and the
# policy would be authorizing a change against itself in PR CI.
REPO="$(live_repo t8)"
git -C "$REPO" update-ref refs/remotes/origin/release HEAD
node -e 'const f="'"$REPO"'/apps/web/package.json";const fs=require("fs");const d=JSON.parse(fs.readFileSync(f,"utf8"));d.dependencies.react="^19.9.9";fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");'
live_commit "$REPO"
git -C "$REPO" update-ref refs/remotes/origin/main HEAD
# `export`, on its own line, deliberately. `VAR=x source file` scopes the
# variable to the `source` command alone, so the function would run without it —
# and this case then passes for the wrong reason, which is exactly what happened
# the first time it was written.
if ( cd "$REPO" && \
     export GITHUB_BASE_REF=release && \
     source scripts/lib/authorized-dependency.sh && \
     authorized_dependency_check "live fixture" ) >"$LIVE_ROOT/out.txt" 2>&1; then
  ACTUAL=PASS
else
  ACTUAL=REFUSED
fi
live_case 8 REFUSED "the PR base ref is used even when origin/main is the hostile commit" "$ACTUAL"

# TEST 9 - no trusted base at all must FAIL CLOSED, never fall back to HEAD.
REPO="$LIVE_ROOT/t9"
mkdir -p "$REPO/apps/web" "$REPO/scripts/lib"
cp "$ROOT/package.json" "$REPO/package.json"
cp "$BASE_MANIFEST" "$REPO/apps/web/package.json"
cp "$BASE_LOCKFILE" "$REPO/package-lock.json"
cp "$ROOT/scripts/lib/authorized-dependency.sh" "$REPO/scripts/lib/"
cp "$ROOT/scripts/lib/authorized-dependency-policy.mjs" "$REPO/scripts/lib/"
git -C "$REPO" init -q
git -C "$REPO" config user.email "policy@test.invalid"
git -C "$REPO" config user.name "Dependency Policy Test"
git -C "$REPO" add -A
git -C "$REPO" commit -q -m "no remote-tracking base exists"
live_case 9 REFUSED "no trusted base resolves, so the gate fails closed" "$(live_run "$REPO")"

# TEST 10 - a PLATFORM base ref that does not resolve must FAIL CLOSED.
#
# `origin/main` is left VALID but pointing at the hostile commit, and that is
# what makes this case discriminating. Written the obvious way - with
# origin/main still at the true base - the fallback produces the correct answer
# by luck and the test passes whether or not the defect is present. It was
# written that way first, and a mutation restoring the fallback did not fail it.
#
# Here the two paths disagree: failing closed REFUSES, while falling back to
# origin/main resolves a merge base of HEAD, sees no delta, and PASSES. The
# defect was that a pull request targeting a release branch could be measured
# against main the moment its base ref was unfetched or misspelled.
REPO="$(live_repo t10)"
node -e 'const f="'"$REPO"'/apps/web/package.json";const fs=require("fs");const d=JSON.parse(fs.readFileSync(f,"utf8"));d.dependencies.react="^19.9.9";fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");'
live_commit "$REPO"
git -C "$REPO" update-ref refs/remotes/origin/main HEAD
if ( cd "$REPO" && \
     export GITHUB_BASE_REF=no-such-base-ref && \
     source scripts/lib/authorized-dependency.sh && \
     authorized_dependency_check "live fixture" ) >"$LIVE_ROOT/out.txt" 2>&1; then
  ACTUAL=PASS
else
  ACTUAL=REFUSED
fi
live_case 10 REFUSED "an unresolvable PR base ref fails closed instead of using origin/main" "$ACTUAL"

# TEST 11 - deleting a workspace manifest must be REFUSED.
#
# The protected set used to be discovered by asking which manifests exist in the
# checkout, so deleting one removed it from the policy rather than failing it.
# It is now the union of the base tree and the checkout, and a manifest can
# leave the policy only by never having been in it.
REPO="$(live_repo t11)"
rm -f "$REPO/packages/shared-types/package.json"
live_commit "$REPO"
live_case 11 REFUSED "deleting a workspace manifest present in the base" "$(live_run "$REPO")"

# TEST 12 - and the same for the manifest that carries the authorization.
REPO="$(live_repo t12)"
rm -f "$REPO/apps/web/package.json"
live_commit "$REPO"
live_case 12 REFUSED "deleting the manifest that carries the authorization" "$(live_run "$REPO")"

# TEST 13 - a branch cannot narrow the policy by dropping a workspace glob.
#
# The globs are read from BOTH sides for this reason: removing `packages/*` from
# the root manifest would otherwise take every manifest beneath it out of scope
# along with the glob.
REPO="$(live_repo t13)"
node -e 'const f="'"$REPO"'/package.json";const fs=require("fs");const d=JSON.parse(fs.readFileSync(f,"utf8"));d.workspaces=d.workspaces.filter((w)=>!w.startsWith("packages"));fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");'
live_commit "$REPO"
live_case 13 REFUSED "dropping a workspace glob from the root manifest" "$(live_run "$REPO")"

echo ""
echo "PASS: the live wrapper resolves a trusted base and holds after commit"

# And the live repository state itself satisfies the policy.
source scripts/lib/authorized-dependency.sh
authorized_dependency_check "the dependency policy gate"

echo "PASS: the live repository state satisfies the authorized-dependency policy"

echo ""
echo "=========================================================="
echo "DEPENDENCY POLICY VERIFIED"
echo ""
echo "One dependency is authorized: jsdom, dev-only, in the web"
echo "workspace, at one exact specification, with one exact"
echo "lockfile pinned whole by SHA-256."
echo ""
echo "The baseline is the merge base with the target branch, so"
echo "the same unauthorized change is refused while dirty AND"
echo "after it is committed. There is no fallback to HEAD, no"
echo "caller-supplied base, and no way for a caller to omit a"
echo "protected path."
echo ""
echo "The authorization is an ADDITION against that base, so it"
echo "spends itself: once Mission 2 merges, jsdom is in the base"
echo "and no further manifest or lockfile change is authorized."
echo ""
echo "This gate proves the POLICY. It does not prove that any"
echo "dependency is safe to trust; npm audit and human review"
echo "own that."
echo "=========================================================="
