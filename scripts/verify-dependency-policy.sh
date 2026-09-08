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
  securityLockfileVerdict,
  AUTHORIZED_LOCKFILE_SHA256,
  SECURITY_BASE_LOCKFILE_SHA256,
  SECURITY_LOCKFILE_SHA256,
  SECURITY_VERSION_FROM,
  SECURITY_VERSION_TO,
  SECURITY_LOCK_RECORD
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

/* ------------------------------------------------------------------ *
   SEC1-SEC9: the one-time js-yaml security authorization.

   The PRE-patch lockfile is DERIVED from the approved one by putting the
   js-yaml record back to 4.3.1 — the same technique the live fixtures use for
   their base, and for the same reason: a fixture that read git would change
   meaning the moment this patch merged. SEC0 proves the derivation reproduces
   the pinned FROM digest byte for byte, so every case below starts from the
   real approved base rather than an approximation of it.
 * ------------------------------------------------------------------ */
const JS_YAML_4_3_1 = {
  version: "4.3.1",
  resolved: "https://registry.npmjs.org/js-yaml/-/js-yaml-4.3.1.tgz",
  integrity:
    "sha512-CY6crGq313MX8GkwvB7tzgp99vjQxY1++5y10/BKN/GUfHqWaOGQMNZkBvqSzsZKWk/ijwHlWzzkLulsGHhjWQ=="
};

const relock = (mutate) => {
  const lock = JSON.parse(APPROVED_LOCK);
  mutate(lock);
  return JSON.stringify(lock, null, 2) + "\n";
};

const PRE_PATCH_LOCK = relock((lock) => {
  Object.assign(lock.packages[SECURITY_LOCK_RECORD], JS_YAML_4_3_1);
});

accept("SEC0", "the derived pre-patch lockfile reproduces the pinned FROM digest",
  sha256(PRE_PATCH_LOCK) === SECURITY_BASE_LOCKFILE_SHA256
    ? [] : ["the derived pre-patch lockfile does not match SECURITY_BASE_LOCKFILE_SHA256"]);

accept("SEC1", "the exact js-yaml " + SECURITY_VERSION_FROM + " to " + SECURITY_VERSION_TO + " transition",
  checkLockfile(withJsdom(), PRE_PATCH_LOCK, APPROVED_LOCK, sha256));

refuse("SEC2", "js-yaml patched to 4.3.3 instead of the authorized version",
  checkLockfile(withJsdom(), PRE_PATCH_LOCK, relock((lock) => {
    lock.packages[SECURITY_LOCK_RECORD].version = "4.3.3";
  }), sha256));

refuse("SEC3", "js-yaml moved to an arbitrary other version",
  checkLockfile(withJsdom(), PRE_PATCH_LOCK, relock((lock) => {
    lock.packages[SECURITY_LOCK_RECORD].version = "5.0.0";
  }), sha256));

refuse("SEC4", "the exact js-yaml patch PLUS an unrelated package added",
  checkLockfile(withJsdom(), PRE_PATCH_LOCK, relock((lock) => {
    lock.packages["node_modules/left-pad"] = { version: "1.3.0", dev: true };
  }), sha256));

refuse("SEC5", "the exact js-yaml patch PLUS an unrelated package removed",
  checkLockfile(withJsdom(), PRE_PATCH_LOCK, relock((lock) => {
    const key = Object.keys(lock.packages).find(
      (name) => name.startsWith("node_modules/") && name !== SECURITY_LOCK_RECORD
    );
    delete lock.packages[key];
  }), sha256));

refuse("SEC6", "a vitest change riding on the security authorization",
  checkLockfile(withJsdom(), PRE_PATCH_LOCK, relock((lock) => {
    const key = Object.keys(lock.packages).find((name) => name.endsWith("/vitest"));
    lock.packages[key].version = "4.1.11";
  }), sha256));

refuse("SEC7", "js-yaml removed rather than patched",
  checkLockfile(withJsdom(), PRE_PATCH_LOCK, relock((lock) => {
    delete lock.packages[SECURITY_LOCK_RECORD];
  }), sha256));

/* SPENT: once the base IS the patched lockfile, the authorization is gone.
   `securityLockfileVerdict` returns null - it does not apply at all - and the
   ordinary spent refusal takes over. There is no state to reset and nothing to
   reuse. */
refuse("SEC8", "a LATER lockfile change once 4.3.2 is already in the base",
  checkLockfile(withJsdom(), APPROVED_LOCK, relock((lock) => {
    lock.packages["node_modules/left-pad"] = { version: "1.3.0", dev: true };
  }), sha256));

accept("SEC9", "the security authorization no longer APPLIES once it is spent",
  securityLockfileVerdict(APPROVED_LOCK, APPROVED_LOCK + "x", sha256) === null
    ? [] : ["a spent security authorization still claims the transition"]);

/* POST-MERGE MAIN: no delta at all, so nothing is judged and nothing fails. */
accept("SEC10", "an unchanged post-merge main tree still passes", [
  ...checkAuthorizedManifest(withJsdom(), withJsdom()),
  ...checkUnauthorizedManifest("package.json", BASE, clone(BASE)),
  ...checkLockfile(withJsdom(), APPROVED_LOCK, APPROVED_LOCK, sha256)
]);

/* LOCKFILE ONLY: a manifest edit alongside the patch is still refused, by the
   manifest checks this authorization never touches. */
refuse("SEC11", "the exact js-yaml patch PLUS a package.json change", [
  ...checkLockfile(withJsdom(), PRE_PATCH_LOCK, APPROVED_LOCK, sha256),
  ...checkAuthorizedManifest(withJsdom(), (() => {
    const later = clone(withJsdom());
    later.dependencies.react = "^19.9.9";
    return later;
  })())
]);

accept("SEC12", "both security pins are well-formed sha256 values, and differ",
  /^[0-9a-f]{64}$/.test(SECURITY_BASE_LOCKFILE_SHA256) &&
  /^[0-9a-f]{64}$/.test(SECURITY_LOCKFILE_SHA256) &&
  SECURITY_BASE_LOCKFILE_SHA256 !== SECURITY_LOCKFILE_SHA256
    ? [] : ["the security transition is not pinned at two distinct digests"]);

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

# ------------------------------------------------------------
# The PRE-AUTHORIZATION base, DERIVED rather than read from git history.
#
# ## The failure this replaces
#
# These two files used to be read from `merge-base HEAD origin/main`. That is
# the pre-change baseline on a feature branch, and it is HEAD itself on a
# push-to-main run — so the moment Mission 2 merged, the "base" the fixtures
# were built from was the POST-authorization tree, already carrying jsdom.
#
# Every fixture below that exists to prove "the authorized addition is
# accepted" then had nothing to add. TEST 5b copied the approved manifest over
# a base that already equalled it, produced an empty delta, and `live_commit`
# aborted the whole gate on git's "nothing to commit" under `set -e`. CI run
# #170 on d24b836 failed exactly there, and TEST 5a had already stopped testing
# anything: with no delta it was passing through the "no dependency change at
# all" arm rather than the authorized-addition arm.
#
# The bug was not that `origin/main` was missing. It resolved correctly, in
# Actions and locally, and five live cases ran before the abort. The bug was
# that the fixtures' base was allowed to depend on WHERE THIS REPOSITORY
# HAPPENS TO SIT relative to the change it is describing.
#
# ## Why derivation is the right answer, not a workaround
#
# This gate proves the POLICY: given a (base, current) pair, does it reach the
# right verdict. The base is an INPUT to that question and must therefore be
# controlled, not inherited from whatever branch the gate is invoked on. The
# real merge base is still exercised on every run — by the nine production
# verifiers that call `authorized_dependency_check` against it. That coverage
# is not lost here; it was never this gate's to provide.
#
# So the base is the approved manifest and lockfile with the authorized package
# removed, using the policy's OWN constants rather than a second copy of them.
# It is identical on a feature branch, on main, after the merge, in a detached
# checkout, and in a fresh clone with no `origin/main` at all.
# ------------------------------------------------------------
node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  import {
    AUTHORIZED_PACKAGE,
    AUTHORIZED_BLOCK
  } from "./scripts/lib/authorized-dependency-policy.mjs";

  // `node -e` passes user arguments starting at argv[1]: there is no script
  // path to skip, unlike a normal `node file.mjs` invocation.
  const [approvedManifest, approvedLockfile, baseManifest, baseLockfile] =
    process.argv.slice(1);

  // The manifest, minus the one authorized dependency.
  const manifest = JSON.parse(readFileSync(approvedManifest, "utf8"));
  if (!(AUTHORIZED_PACKAGE in (manifest[AUTHORIZED_BLOCK] ?? {}))) {
    console.error(
      "the approved manifest does not carry " + AUTHORIZED_PACKAGE +
      " in " + AUTHORIZED_BLOCK + "; the derived base would be identical to it"
    );
    process.exit(1);
  }
  delete manifest[AUTHORIZED_BLOCK][AUTHORIZED_PACKAGE];
  writeFileSync(baseManifest, JSON.stringify(manifest, null, 2) + "\n");

  // The lockfile, minus the same dependency on the workspace that declares it.
  // Only the workspace record is touched: the point is a base that DIFFERS
  // from the approved lockfile in the authorized dependency, not a faithful
  // reconstruction of npm history.
  const lockfile = JSON.parse(readFileSync(approvedLockfile, "utf8"));
  let removed = false;
  for (const record of Object.values(lockfile.packages ?? {})) {
    if (AUTHORIZED_PACKAGE in (record?.[AUTHORIZED_BLOCK] ?? {})) {
      delete record[AUTHORIZED_BLOCK][AUTHORIZED_PACKAGE];
      removed = true;
    }
  }
  if (!removed) {
    console.error(
      "no lockfile workspace record declares " + AUTHORIZED_PACKAGE +
      "; the derived base lockfile would be identical to the approved one"
    );
    process.exit(1);
  }
  writeFileSync(baseLockfile, JSON.stringify(lockfile, null, 2) + "\n");
' "$APPROVED_MANIFEST" "$APPROVED_LOCKFILE" "$BASE_MANIFEST" "$BASE_LOCKFILE" \
  || fail "the pre-authorization base fixtures could not be derived"

# THE REGRESSION, asserted before a single fixture is built.
#
# `authorizationIsSpent` reads exactly this: is the authorized package present
# in the base. If it is, every "authorized addition" case below degenerates
# into "no change", which is what CI run #170 hit. This assertion fails on the
# defect and cannot be satisfied by a base read from a merged main.
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  import { authorizationIsSpent } from "./scripts/lib/authorized-dependency-policy.mjs";
  const base = JSON.parse(readFileSync(process.argv[1], "utf8"));
  if (authorizationIsSpent(base)) {
    console.error(
      "the derived fixture base already carries the authorized dependency, so " +
      "the authorized-addition cases would test nothing"
    );
    process.exit(1);
  }
' "$BASE_MANIFEST" \
  || fail "the live fixture base is not a PRE-authorization base"

cmp -s "$BASE_MANIFEST" "$APPROVED_MANIFEST" \
  && fail "the derived base manifest equals the approved one; the authorized delta is empty"
cmp -s "$BASE_LOCKFILE" "$APPROVED_LOCKFILE" \
  && fail "the derived base lockfile equals the approved one; the authorized delta is empty"

# The PRE-SECURITY-PATCH lockfile: the approved one with the js-yaml record put
# back to its vulnerable version. Derived for the same reason as the base above
# — a fixture that read git would silently change meaning once this patch
# merges — and asserted against the authorization's own FROM pin, so it is the
# real approved base rather than an approximation of it.
PRE_PATCH_LOCKFILE="$LIVE_ROOT/pre-patch-lockfile.json"
node --input-type=module -e '
  import { createHash } from "node:crypto";
  import { readFileSync, writeFileSync } from "node:fs";
  import {
    SECURITY_LOCK_RECORD,
    SECURITY_BASE_LOCKFILE_SHA256
  } from "./scripts/lib/authorized-dependency-policy.mjs";

  const [approvedLockfile, out] = process.argv.slice(1);
  const lock = JSON.parse(readFileSync(approvedLockfile, "utf8"));
  Object.assign(lock.packages[SECURITY_LOCK_RECORD], {
    version: "4.3.1",
    resolved: "https://registry.npmjs.org/js-yaml/-/js-yaml-4.3.1.tgz",
    integrity:
      "sha512-CY6crGq313MX8GkwvB7tzgp99vjQxY1++5y10/BKN/GUfHqWaOGQMNZkBvqSzsZKWk/ijwHlWzzkLulsGHhjWQ=="
  });
  const text = JSON.stringify(lock, null, 2) + "\n";
  const digest = createHash("sha256").update(text).digest("hex");
  if (digest !== SECURITY_BASE_LOCKFILE_SHA256) {
    console.error(
      "the derived pre-patch lockfile hashes to " + digest.slice(0, 12) +
      "… but the authorization pins " + SECURITY_BASE_LOCKFILE_SHA256.slice(0, 12) + "…"
    );
    process.exit(1);
  }
  writeFileSync(out, text);
' "$APPROVED_LOCKFILE" "$PRE_PATCH_LOCKFILE" \
  || fail "the pre-security-patch lockfile could not be derived"

echo "       ok: the live fixture base is a derived PRE-authorization tree"

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
  # Guarded, and the guard is the second half of the CI #170 repair.
  #
  # When the fixture's base already contained the change the case meant to
  # apply, there was nothing to commit, `git commit` returned non-zero, and
  # `set -e` killed the gate with git's "nothing to commit, working tree
  # clean" as the only clue — a fixture-construction defect wearing the
  # costume of a policy failure. A case that stages no delta is now named.
  if git -C "$1" diff --cached --quiet; then
    fail "live fixture $1 staged no change; the case constructed no delta to test"
  fi
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

# ------------------------------------------------------------
# TESTS 14-17 - the one-time js-yaml security authorization, live.
#
# These fixtures model MAIN AFTER MISSION 2 MERGED: the base manifest carries
# jsdom, so the jsdom authorization is spent and every ordinary lockfile change
# is refused. The only thing that may pass is the exact pinned transition.
# ------------------------------------------------------------
security_repo() {
  local name="$1" repo="$LIVE_ROOT/$1"
  mkdir -p "$repo/apps/web" "$repo/packages/shared-types" "$repo/services/api" \
           "$repo/scripts/lib"

  cp "$ROOT/package.json" "$repo/package.json"
  # The APPROVED manifest, so jsdom is in the base and its authorization is
  # spent — exactly the state that made the security patch need its own.
  cp "$APPROVED_MANIFEST" "$repo/apps/web/package.json"
  cp "$PRE_PATCH_LOCKFILE" "$repo/package-lock.json"
  cp "$ROOT/packages/shared-types/package.json" "$repo/packages/shared-types/package.json"
  cp "$ROOT/services/api/package.json" "$repo/services/api/package.json"
  cp "$ROOT/scripts/lib/authorized-dependency.sh" "$repo/scripts/lib/"
  cp "$ROOT/scripts/lib/authorized-dependency-policy.mjs" "$repo/scripts/lib/"

  git -C "$repo" init -q
  git -C "$repo" config user.email "policy@test.invalid"
  git -C "$repo" config user.name "Dependency Policy Test"
  git -C "$repo" add -A
  git -C "$repo" commit -q -m "main after the jsdom authorization merged"
  git -C "$repo" update-ref refs/remotes/origin/main HEAD
  git -C "$repo" checkout -q -b feature
  echo "$repo"
}

# TEST 14 - the exact transition, DIRTY.
REPO="$(security_repo t14)"
cp "$APPROVED_LOCKFILE" "$REPO/package-lock.json"
live_case 14 PASS "the exact js-yaml security patch, uncommitted" "$(live_run "$REPO")"

# TEST 15 - the exact transition, COMMITTED. The half that matters after merge.
REPO="$(security_repo t15)"
cp "$APPROVED_LOCKFILE" "$REPO/package-lock.json"
live_commit "$REPO"
live_case 15 PASS "the exact js-yaml security patch, COMMITTED" "$(live_run "$REPO")"

# TEST 16 - a DIFFERENT js-yaml version must not ride the authorization.
REPO="$(security_repo t16)"
node -e 'const f="'"$REPO"'/package-lock.json";const fs=require("fs");const d=JSON.parse(fs.readFileSync(f,"utf8"));d.packages["node_modules/js-yaml"].version="4.3.3";fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");'
live_commit "$REPO"
live_case 16 REFUSED "a js-yaml version other than the authorized one" "$(live_run "$REPO")"

# TEST 17 - the base ALREADY carries 4.3.2: the authorization is spent and a
# later lockfile change cannot reuse it.
REPO="$LIVE_ROOT/t17"
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
git -C "$REPO" commit -q -m "main after the security patch merged"
git -C "$REPO" update-ref refs/remotes/origin/main HEAD
git -C "$REPO" checkout -q -b feature
# Unchanged first: a post-merge main has no delta and must PASS.
live_case 17a PASS "an unchanged post-merge main tree" "$(live_run "$REPO")"
# Then a later change, which must NOT be able to reuse the spent authorization.
node -e 'const f="'"$REPO"'/package-lock.json";const fs=require("fs");const d=JSON.parse(fs.readFileSync(f,"utf8"));d.packages["node_modules/left-pad"]={version:"1.3.0",dev:true};fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n");'
live_commit "$REPO"
live_case 17b REFUSED "a later lockfile change once the patch is in the base" "$(live_run "$REPO")"

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
echo "IN PRODUCTION the baseline is the merge base with the target"
echo "branch, so the same unauthorized change is refused while"
echo "dirty AND after it is committed. There is no fallback to"
echo "HEAD, no caller-supplied base, and no way for a caller to"
echo "omit a protected path."
echo ""
echo "THESE FIXTURES do not read that merge base. Their baseline"
echo "is DERIVED — the approved files with the authorized change"
echo "removed — so the same cases are exercised identically on a"
echo "feature branch, on main, in a detached checkout, and after"
echo "an authorization has already merged."
echo ""
echo "A second, narrower authorization covers one security patch:"
echo "js-yaml 4.3.1 to 4.3.2 for GHSA-2883-xcg3-v3hh, lockfile"
echo "only, pinned at BOTH ends by SHA-256. Pinning the FROM end"
echo "is what makes it one-time: once it merges, no base hashes to"
echo "it again and it can never be reused."
echo ""
echo "The authorization is an ADDITION against that base, so it"
echo "spends itself: once Mission 2 merges, jsdom is in the base"
echo "and no further manifest or lockfile change is authorized."
echo ""
echo "This gate proves the POLICY. It does not prove that any"
echo "dependency is safe to trust; npm audit and human review"
echo "own that."
echo "=========================================================="
