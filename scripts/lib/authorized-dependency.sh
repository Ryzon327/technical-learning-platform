#!/usr/bin/env bash
# ============================================================
# The dependency authorization, wired to a TRUSTED baseline.
#
# The POLICY lives in `scripts/lib/authorized-dependency-policy.mjs` as a pure
# module so `scripts/verify-dependency-policy.sh` can exercise it against
# fixtures and against real temporary git repositories. This file is the
# plumbing: it resolves the baseline, reads both sides, and reports.
#
# ## Two defects this replaced, both fail-open
#
# 1. The baseline was `git show HEAD:<path>`. That is the proposed change once
#    the branch is committed, so the check compared a file with itself and
#    authorized anything. It passed in CI *because* the change had been
#    committed.
#
# 2. Callers chose which paths were checked. A caller could simply not pass
#    `package-lock.json`, and nine gates each passed their own list.
#
# Both are gone: the baseline is the merge base with the authoritative target
# branch, and the path set is owned here.
# ============================================================

readonly AUTHORIZED_POLICY_MODULE="scripts/lib/authorized-dependency-policy.mjs"

# ------------------------------------------------------------
# The trusted base, or nothing.
# ------------------------------------------------------------
# In pull-request CI, GitHub states the base branch. Locally, the repository's
# canonical target branch is `origin/main`. A LOCAL `main` is deliberately not
# accepted: a local branch can be moved to the proposed commit, which would let
# the change under review define the baseline it is measured against.
#
# There is no fallback to HEAD, and no caller-supplied override. If no trusted
# base resolves, this fails and the gate stops.
resolve_trusted_base() {
  local base_ref=""

  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    # A pull request. The base branch is named by the PLATFORM, not by the
    # branch under review, so it is authoritative and it is also final.
    #
    # If it does not resolve, this returns failure. It must NOT fall through to
    # `origin/main` — that was the defect. In pull-request CI a broken or
    # unfetched base ref would then have silently swapped the platform's answer
    # for a different branch's, and a change targeting a release branch would
    # have been measured against main. Refusing to guess is the whole point of
    # having a trusted base.
    if git rev-parse --verify --quiet "origin/${GITHUB_BASE_REF}" >/dev/null; then
      base_ref="origin/${GITHUB_BASE_REF}"
    elif git rev-parse --verify --quiet "${GITHUB_BASE_REF}" >/dev/null; then
      base_ref="${GITHUB_BASE_REF}"
    else
      return 1
    fi
  fi

  # No pull-request context: a local feature branch, measured against the
  # repository's canonical target branch. A LOCAL `main` is still refused, so a
  # branch cannot move the baseline it is measured against.
  if [ -z "$base_ref" ] &&
     git rev-parse --verify --quiet origin/main >/dev/null; then
    base_ref="origin/main"
  fi

  [ -n "$base_ref" ] || return 1

  git merge-base HEAD "$base_ref" 2>/dev/null
}

# ------------------------------------------------------------
# The mandatory path set, owned here and derived from BOTH sides.
# ------------------------------------------------------------
# It is resolved inside the policy run below, because it needs the trusted base
# as well as the current checkout.
#
# ## Why both, and not just what exists now
#
# This used to enumerate workspaces by reading the current directory. A manifest
# DELETED on the feature branch therefore never entered the set, so deleting a
# workspace's `package.json` removed it from the policy instead of failing it —
# the one edit the check could not see. The set is now the UNION of what the
# base contained and what the checkout contains, so a path can leave the policy
# only by never having been in it.
#
# ------------------------------------------------------------

# Fail unless every dependency manifest and the lockfile match the trusted base,
# Fail unless every dependency manifest and the lockfile match the trusted base,
# allowing ONLY the one authorized addition while it is still available.
#
# Usage: authorized_dependency_check "<slice name>"
#
# There is deliberately no second argument. A caller names itself for the
# failure message and gets the whole policy; it cannot choose what is inspected,
# skip a path, or supply a baseline.
authorized_dependency_check() {
  local slice="$1"

  [ -f "$AUTHORIZED_POLICY_MODULE" ] || {
    echo "GATE FAIL: the dependency policy module is missing: $AUTHORIZED_POLICY_MODULE" >&2
    exit 1
  }

  local base
  if ! base="$(resolve_trusted_base)" || [ -z "$base" ]; then
    echo "GATE FAIL: $slice could not resolve a trusted comparison base." >&2
    echo "  The dependency policy compares against the merge base with the" >&2
    echo "  target branch. It will not fall back to HEAD, because HEAD is the" >&2
    echo "  proposed change once a branch is committed." >&2
    echo "  Fetch the target branch (git fetch origin main) and retry." >&2
    exit 1
  fi

  local report
  if ! report="$(AUTHORIZED_BASE="$base" node --input-type=module -e '
    import { execSync } from "node:child_process";
    import { readFileSync, existsSync, readdirSync } from "node:fs";
    import { createHash } from "node:crypto";
    import {
      AUTHORIZED_MANIFEST,
      checkAuthorizedManifest,
      checkUnauthorizedManifest,
      checkLockfile,
      VITEST_TRANSITION,
      vitestTransitionVerdict
    } from "./scripts/lib/authorized-dependency-policy.mjs";

    const base = process.env.AUTHORIZED_BASE;
    const sha256 = (value) => createHash("sha256").update(value).digest("hex");

    const atBase = (path) => {
      try {
        return execSync("git show " + base + ":" + path, {
          encoding: "utf8",
          maxBuffer: 1 << 30,
          stdio: ["ignore", "pipe", "ignore"]
        });
      } catch {
        return null;
      }
    };

    /*
      The protected set: the union of what the base contained and what the
      checkout contains.

      Workspace globs are read from BOTH sides too. A branch that removes a glob
      from `workspaces` would otherwise take every manifest under it out of
      scope along with the glob.
    */
    const workspaceGlobs = (rootText) => {
      if (rootText === null) return [];
      try {
        return JSON.parse(rootText).workspaces ?? [];
      } catch {
        return [];
      }
    };

    const dirOf = (pattern) =>
      pattern.endsWith("/*") ? pattern.slice(0, -2) : pattern;

    const paths = new Set(["package.json", "package-lock.json"]);

    // What the trusted base contained, read from git rather than from disk.
    const baseRootText = atBase("package.json");
    const baseGlobs = workspaceGlobs(baseRootText);
    let baseTree = "";
    try {
      baseTree = execSync("git ls-tree -r --name-only " + base, {
        encoding: "utf8",
        maxBuffer: 1 << 30,
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch {
      throw new Error("could not list the trusted base tree at " + base);
    }

    for (const tracked of baseTree.split("\n")) {
      if (!tracked.endsWith("/package.json")) continue;
      const parts = tracked.split("/");
      if (parts.length !== 3) continue;
      if (baseGlobs.some((pattern) => dirOf(pattern) === parts[0])) {
        paths.add(tracked);
      }
    }

    // And what the checkout contains, so a NEW workspace is caught too.
    const currentGlobs = workspaceGlobs(
      existsSync("package.json") ? readFileSync("package.json", "utf8") : null
    );

    for (const pattern of currentGlobs) {
      const dir = dirOf(pattern);
      let entries = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifest = dir + "/" + entry.name + "/package.json";
        if (existsSync(manifest)) paths.add(manifest);
      }
    }

    const problems = [];
    const baseManifestText = atBase(AUTHORIZED_MANIFEST);
    const baseManifest =
      baseManifestText === null ? {} : JSON.parse(baseManifestText);

    /*
      The one-time Vitest transition moves four files as a unit, so it is
      judged over all four BEFORE the per-file checks. When it applies, its
      verdict replaces theirs for those four paths and nothing else; when it
      does not (`null`), every path falls through to the ordinary policy.
    */
    const transitionPaths = Object.keys(VITEST_TRANSITION);
    const transitionBase = {};
    const transitionCurrent = {};
    for (const path of transitionPaths) {
      transitionBase[path] = atBase(path);
      transitionCurrent[path] = existsSync(path) ? readFileSync(path, "utf8") : null;
    }
    const vitest = vitestTransitionVerdict(transitionBase, transitionCurrent, sha256);
    if (vitest !== null) problems.push(...vitest);

    for (const path of paths) {
      if (vitest !== null && transitionPaths.includes(path)) continue;

      const baseText = atBase(path);
      const exists = existsSync(path);

      if (baseText === null && !exists) continue;

      if (baseText !== null && !exists) {
        problems.push(path + " was deleted; no dependency change is authorized");
        continue;
      }

      const currentText = readFileSync(path, "utf8");

      if (path === "package-lock.json") {
        problems.push(
          ...checkLockfile(baseManifest, baseText ?? "", currentText, sha256)
        );
        continue;
      }

      if (baseText === null) {
        problems.push(path + " is a new manifest; no new workspace is authorized");
        continue;
      }

      const before = JSON.parse(baseText);
      const after = JSON.parse(currentText);

      if (path === AUTHORIZED_MANIFEST) {
        problems.push(...checkAuthorizedManifest(before, after));
      } else {
        problems.push(...checkUnauthorizedManifest(path, before, after));
      }
    }

    process.stdout.write(problems.join("\n"));
  ' 2>&1)"; then
    echo "GATE FAIL: $slice could not evaluate the dependency policy: $report" >&2
    exit 1
  fi

  if [ -n "$report" ]; then
    echo "GATE FAIL: $slice changed a dependency manifest beyond what is authorized:" >&2
    printf '%s\n' "$report" >&2
    echo "  (compared against the merge base $base, not HEAD)" >&2
    exit 1
  fi
}
