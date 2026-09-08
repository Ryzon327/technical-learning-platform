/**
 * The one authorized dependency change, decided in one place.
 *
 * ## The defect this file was rewritten to remove
 *
 * The previous version compared the working tree against `git show HEAD:<path>`.
 * That is sound only while a branch is dirty. The moment the same content is
 * COMMITTED, HEAD *is* the proposed change, so the check compares a file with
 * itself, finds no difference, and authorizes anything - a version bump, a
 * script edit, an arbitrary lockfile. A guard that passes in CI precisely
 * because the change was committed is worse than no guard.
 *
 * The baseline is now the merge base with the authoritative target branch,
 * resolved by `resolveTrustedBase` in the wrapper. It is the old target-branch
 * state before commit, after commit, and inside pull-request CI alike.
 *
 * ## What is authorized
 *
 * Exactly one thing: adding `jsdom` at `^30.0.1` to `devDependencies` of
 * `apps/web/package.json`, together with the one exact lockfile that addition
 * produced, pinned WHOLE by SHA-256.
 *
 * The Founder authorized it so a focus handoff could be OBSERVED rather than
 * inferred. Mutation testing had shown the gap: deleting one line - the
 * `.focus()` call in `MissionInstruction`'s reveal effect - disabled both
 * instructional focus handoffs while every suite and every gate stayed green,
 * because nothing could read `document.activeElement`.
 *
 * ## Why the authorization consumes itself
 *
 * It is phrased as an ADDITION against the base. Once Mission 2 merges, jsdom
 * is in the base, there is nothing left to add, and both the manifest and the
 * lockfile must simply equal the base. A later branch that edits either for any
 * other reason is refused, with no edit to this file required.
 *
 * ## Why it cannot become an approval framework
 *
 * Nothing here is a parameter. No package name, no version, no manifest list,
 * no wildcard, no environment variable, no skip flag. A future authorization is
 * a change to THIS FILE, which wakes `verify-dependency-policy.sh` through the
 * selector and is reviewed as the policy change it is.
 */

/** The manifest that may carry the authorization, and nothing else. */
export const AUTHORIZED_MANIFEST = "apps/web/package.json";

/** The package, the block it may sit in, and the exact specification. */
export const AUTHORIZED_PACKAGE = "jsdom";
export const AUTHORIZED_BLOCK = "devDependencies";
export const AUTHORIZED_SPEC = "^30.0.1";

/**
 * The WHOLE authorized lockfile, by SHA-256 of its exact bytes.
 *
 * ## Why the whole file and not a closure subset
 *
 * An earlier version pinned only the added entries' key, version and integrity,
 * and proved the rest by walking dependency edges. That left real gaps: nothing
 * pinned an added entry's `resolved` URL, its own transitive edges, or any
 * metadata outside the three fields hashed - and the walk's own root record was
 * part of what an attacker could edit.
 *
 * For a ONE-TIME authorization there is a simpler and stronger rule available:
 * the Founder approved one specific lockfile, so accept that file and no other.
 * Every field of every record is then pinned, including ones nobody enumerated.
 *
 * This is deliberately not general. It cannot authorize a second dependency,
 * and it is not meant to - a future dependency is a future policy decision.
 */
export const AUTHORIZED_LOCKFILE_SHA256 =
  "86fe289ecf9214ff3d3a9b2cb0150cfbb6181c1b4e595725cff6e847474fe45e";

/** The workspace record in the lockfile that mirrors the manifest. */
const AUTHORIZED_LOCK_WORKSPACE = "apps/web";

/** Deep structural equality, order-independent for object keys. */
function deepEqual(left, right) {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return false;
  if (typeof left !== "object") return false;

  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return (
      left.length === right.length &&
      left.every((item, index) => deepEqual(item, right[index]))
    );
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.join(" ") !== rightKeys.join(" ")) return false;

  return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

/**
 * Whether the base already carries the authorization.
 *
 * This is the switch the whole policy turns on: before it, one specific
 * addition is permitted; after it, nothing is.
 */
export function authorizationIsSpent(baseManifest) {
  return AUTHORIZED_PACKAGE in (baseManifest?.[AUTHORIZED_BLOCK] ?? {});
}

/**
 * Every manifest EXCEPT the authorized one must be semantically identical.
 *
 * Semantically, not textually: `npm install` re-sorts dependency keys, and a
 * line-counting check reads three untouched packages as removals. A guard that
 * fires on formatting is a guard whoever hits it disables.
 */
export function checkUnauthorizedManifest(path, base, current) {
  return deepEqual(base, current)
    ? []
    : [path + " changed; no dependency change is authorized in this manifest"];
}

/**
 * The authorized manifest may differ by the one addition, and by nothing else.
 *
 * Compared as WHOLE OBJECTS. Comparing dependency name sets - which an earlier
 * version did - silently permits a version bump on an existing package, a
 * `scripts` change, or any unrelated field.
 */
export function checkAuthorizedManifest(base, current) {
  const problems = [];
  const baseDev = base?.[AUTHORIZED_BLOCK] ?? {};
  const currentDev = current?.[AUTHORIZED_BLOCK] ?? {};

  if (authorizationIsSpent(base)) {
    return deepEqual(base, current)
      ? []
      : [
          AUTHORIZED_MANIFEST +
            " changed, and the " +
            AUTHORIZED_PACKAGE +
            " authorization is already spent in the base; no further change to" +
            " this manifest is authorized"
        ];
  }

  if (deepEqual(base, current)) return [];

  if (!(AUTHORIZED_PACKAGE in currentDev)) {
    problems.push(
      AUTHORIZED_MANIFEST +
        " changed by something other than adding " +
        AUTHORIZED_PACKAGE
    );
  } else if (currentDev[AUTHORIZED_PACKAGE] !== AUTHORIZED_SPEC) {
    problems.push(
      AUTHORIZED_PACKAGE +
        " is specified as " +
        JSON.stringify(currentDev[AUTHORIZED_PACKAGE]) +
        "; only " +
        JSON.stringify(AUTHORIZED_SPEC) +
        " is authorized"
    );
  }

  // Everything else must be untouched. Rebuild `current` with the one
  // authorized addition removed and require deep equality: that catches a
  // version bump, a scripts edit, a new top-level field, a removal, a
  // substitution and a second addition, without enumerating any of them.
  const withoutAuthorized = { ...current };
  const devWithout = { ...currentDev };
  delete devWithout[AUTHORIZED_PACKAGE];

  if (Object.keys(devWithout).length === 0 && !(AUTHORIZED_BLOCK in base)) {
    delete withoutAuthorized[AUTHORIZED_BLOCK];
  } else {
    withoutAuthorized[AUTHORIZED_BLOCK] = devWithout;
  }

  if (!deepEqual(base, withoutAuthorized)) {
    problems.push(
      AUTHORIZED_MANIFEST +
        " carries a semantic change beyond adding " +
        AUTHORIZED_PACKAGE +
        "; every other field must be identical to the base"
    );
  }

  if (AUTHORIZED_PACKAGE in (current?.dependencies ?? {})) {
    problems.push(
      AUTHORIZED_PACKAGE +
        " is a PRODUCTION dependency; a DOM shim would be shipped to the browser"
    );
  }

  return problems;
}

/**
 * The lockfile is pinned WHOLE, and which pin applies depends on the base.
 *
 * `baseLockText` and `currentLockText` are exact bytes; `baseManifest` decides
 * whether the one-time authorization is still available.
 */
export function checkLockfile(
  baseManifest,
  baseLockText,
  currentLockText,
  sha256
) {
  if (baseLockText === currentLockText) return [];

  if (authorizationIsSpent(baseManifest)) {
    return [
      "package-lock.json changed, and the " +
        AUTHORIZED_PACKAGE +
        " authorization is already spent in the base; no dependency change is" +
        " authorized"
    ];
  }

  const digest = sha256(currentLockText);
  if (digest !== AUTHORIZED_LOCKFILE_SHA256) {
    return [
      "package-lock.json does not match the one Founder-approved lockfile" +
        " (sha256 " +
        digest.slice(0, 12) +
        "… where " +
        AUTHORIZED_LOCKFILE_SHA256.slice(0, 12) +
        "… is authorized); every field of every record is pinned, so a" +
        " version, an integrity hash, a resolved URL or any unrelated package" +
        " fails here"
    ];
  }

  // The approved lockfile is the approved lockfile, so its shape needs no
  // further argument. One cross-check remains worth making: that it really is
  // the lockfile for the approved manifest change rather than a file that
  // merely hashes correctly in isolation.
  const problems = [];
  let current;
  try {
    current = JSON.parse(currentLockText);
  } catch {
    return ["package-lock.json is not valid JSON"];
  }

  const workspace = current?.packages?.[AUTHORIZED_LOCK_WORKSPACE];
  if (
    workspace === undefined ||
    workspace?.[AUTHORIZED_BLOCK]?.[AUTHORIZED_PACKAGE] !== AUTHORIZED_SPEC
  ) {
    problems.push(
      "the approved lockfile does not record " +
        AUTHORIZED_PACKAGE +
        " as a dev dependency of " +
        AUTHORIZED_LOCK_WORKSPACE
    );
  }

  if (AUTHORIZED_PACKAGE in (workspace?.dependencies ?? {})) {
    problems.push(
      AUTHORIZED_PACKAGE +
        " is recorded as a PRODUCTION dependency in the lockfile"
    );
  }

  return problems;
}
