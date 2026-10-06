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
  "5718e12047ca39436a505d42a4112e6430aa406cbe506356bfb0341157b5f58f";

/** The workspace record in the lockfile that mirrors the manifest. */
const AUTHORIZED_LOCK_WORKSPACE = "apps/web";

/* ------------------------------------------------------------------ *
 * THE SECURITY AUTHORIZATION — separate, narrower, and one-time.
 *
 * ## What it is for
 *
 * GHSA-2883-xcg3-v3hh rates `js-yaml` 4.0.0–4.3.1 HIGH. The repository reaches
 * it transitively and dev-only:
 *
 *   @tlp/web → eslint ^9.17.0 → @eslint/eslintrc → js-yaml ^4.3.0
 *
 * 4.3.2 is the fix and it already satisfies `^4.3.0`, so the remedy is a
 * LOCKFILE-ONLY re-resolution. No manifest declares js-yaml, no range moves,
 * and nothing reaches production.
 *
 * ## Why it cannot ride on the jsdom authorization
 *
 * It must not, and it cannot. The jsdom authorization is SPENT — jsdom is in
 * the base since Mission 2 merged — so `checkLockfile` refuses every lockfile
 * delta from here on. That refusal is correct and stays: it is what stops an
 * unreviewed dependency riding in behind an approved one. A security patch is
 * a second Founder decision, so it gets a second authorization, written down
 * separately, rather than a hole in the first.
 *
 * ## Why it is a TRANSITION and not a permission
 *
 * Both ends are pinned by SHA-256 over the whole file:
 *
 *   from  the lockfile as approved when Mission 2 merged
 *   to    the lockfile with exactly the js-yaml 4.3.1 → 4.3.2 record changed
 *
 * Pinning the FROM end is what makes it one-time. The moment this patch merges,
 * the base lockfile is the `to` file, the `from` digest no longer matches, and
 * this authorization stops applying to anything — it cannot be reused for a
 * later change, and there is no state to reset. Pinning the TO end is what
 * makes it exact: 4.3.3, any 5.x, a removal, a promotion to a direct
 * dependency, an extra package, a removed package, or any unrelated record
 * moving all produce a different digest and are refused.
 *
 * A whole-file digest is used rather than an enumerated delta for the reason
 * recorded above `AUTHORIZED_LOCKFILE_SHA256`: it pins every field of every
 * record, including ones nobody thought to enumerate.
 *
 * ## What it deliberately does NOT authorize
 *
 * Any manifest change. The manifest checks are untouched and, with the jsdom
 * authorization spent, already refuse every edit to every protected manifest.
 * This authorization adds nothing there and could not, because it never looks
 * at a manifest.
 * ------------------------------------------------------------------ */

/** Human-readable identity of the one authorized security transition. */
export const SECURITY_ADVISORY = "GHSA-2883-xcg3-v3hh";
export const SECURITY_PACKAGE = "js-yaml";
export const SECURITY_LOCK_RECORD = "node_modules/js-yaml";
export const SECURITY_VERSION_FROM = "4.3.1";
export const SECURITY_VERSION_TO = "4.3.2";

/** The lockfile this transition starts FROM. Pinning it makes it one-time. */
export const SECURITY_BASE_LOCKFILE_SHA256 =
  "86fe289ecf9214ff3d3a9b2cb0150cfbb6181c1b4e595725cff6e847474fe45e";

/** The lockfile this transition ends AT, and no other. */
export const SECURITY_LOCKFILE_SHA256 =
  "5718e12047ca39436a505d42a4112e6430aa406cbe506356bfb0341157b5f58f";

/**
 * The verdict of the security authorization, or `null` when it does not apply.
 *
 * `null` means "this is not that transition" — the caller then falls through to
 * the ordinary policy, which refuses whatever it is. It is never a pass.
 *
 * Returns `[]` only when the base is exactly the approved pre-patch lockfile
 * AND the current tree is exactly the approved post-patch lockfile. Anything
 * else that starts from the right base returns a problem, so a change that
 * claims this transition and is not it fails loudly rather than falling
 * through to a message about jsdom.
 */
export function securityLockfileVerdict(baseLockText, currentLockText, sha256) {
  if (sha256(baseLockText) !== SECURITY_BASE_LOCKFILE_SHA256) return null;

  const digest = sha256(currentLockText);
  if (digest === SECURITY_LOCKFILE_SHA256) return [];

  return [
    "package-lock.json changed from the base this security authorization" +
      " covers, but not into the approved result (sha256 " +
      digest.slice(0, 12) +
      "… where " +
      SECURITY_LOCKFILE_SHA256.slice(0, 12) +
      "… is authorized). The only authorized change is " +
      SECURITY_PACKAGE +
      " " +
      SECURITY_VERSION_FROM +
      " to " +
      SECURITY_VERSION_TO +
      " in " +
      SECURITY_LOCK_RECORD +
      " for " +
      SECURITY_ADVISORY +
      ", with every other record byte-identical"
  ];
}

/* ------------------------------------------------------------------ *
 * THE SECOND SECURITY AUTHORIZATION — brace-expansion, also one-time.
 *
 * Founder directive `tlp-delivery-first-2026-10-02` authorizes exactly the
 * remedy recorded in BUILD_WAVE_9_SEARCH_ENGINE_COMPLETION_REVIEW.md section
 * 4.1.1, and nothing wider.
 *
 * GHSA-6j4f-fj2g-mc7p and GHSA-qhr7-859c-m2p7 (high) and GHSA-q2hr-2g5m-vwhr
 * (medium) cover `brace-expansion` below 1.1.21 on the 1.x line. The
 * repository reaches it transitively and dev-only:
 *
 *   @tlp/web → eslint ^9.17.0 → minimatch ^3.1.5 → brace-expansion ^1.1.7
 *
 * 1.1.21 satisfies `^1.1.7`, so the remedy is again LOCKFILE-ONLY: one record,
 * three fields (`version`, `resolved`, `integrity`), no range moved.
 *
 * It is a separate transition rather than an edit to the js-yaml one, for the
 * same reason the js-yaml one is separate from jsdom: each Founder decision is
 * written down on its own. Its FROM end is the js-yaml transition's TO end —
 * the lockfile main carries once that patch merged — so the js-yaml
 * authorization is already spent and stays exactly as it was.
 *
 * Same shape, same guarantees: both ends pinned by SHA-256 over the whole
 * file, `null` unless the base is exactly the FROM file, and therefore unusable
 * the moment it merges. No manifest is authorized.
 * ------------------------------------------------------------------ */

/** Human-readable identity of the brace-expansion transition. */
export const BRACE_DIRECTIVE = "tlp-delivery-first-2026-10-02";
export const BRACE_ADVISORIES = [
  "GHSA-6j4f-fj2g-mc7p",
  "GHSA-qhr7-859c-m2p7",
  "GHSA-q2hr-2g5m-vwhr"
];
export const BRACE_PACKAGE = "brace-expansion";
export const BRACE_LOCK_RECORD = "node_modules/brace-expansion";
export const BRACE_VERSION_FROM = "1.1.18";
export const BRACE_VERSION_TO = "1.1.21";

/** The lockfile this transition starts FROM: the js-yaml transition's result. */
export const BRACE_BASE_LOCKFILE_SHA256 =
  "5718e12047ca39436a505d42a4112e6430aa406cbe506356bfb0341157b5f58f";

/** The lockfile this transition ends AT, and no other. */
export const BRACE_LOCKFILE_SHA256 =
  "ae794bd905a31b2b969bcc27c48bea06909442496f2508428b6fc5939e62bdd5";

/**
 * The verdict of the brace-expansion authorization, or `null` when it does
 * not apply. Same contract as `securityLockfileVerdict`.
 */
export function braceLockfileVerdict(baseLockText, currentLockText, sha256) {
  if (sha256(baseLockText) !== BRACE_BASE_LOCKFILE_SHA256) return null;

  const digest = sha256(currentLockText);
  if (digest === BRACE_LOCKFILE_SHA256) return [];

  return [
    "package-lock.json changed from the base the brace-expansion authorization" +
      " covers, but not into the approved result (sha256 " +
      digest.slice(0, 12) +
      "… where " +
      BRACE_LOCKFILE_SHA256.slice(0, 12) +
      "… is authorized). The only authorized change is " +
      BRACE_PACKAGE +
      " " +
      BRACE_VERSION_FROM +
      " to " +
      BRACE_VERSION_TO +
      " in " +
      BRACE_LOCK_RECORD +
      " for " +
      BRACE_ADVISORIES.join(", ") +
      " (" +
      BRACE_DIRECTIVE +
      "), with every other record byte-identical"
  ];
}

/* ------------------------------------------------------------------ *
 * THE THIRD SECURITY AUTHORIZATION — Vitest 3 to 4, one-time, issue #65.
 *
 * Founder-approved under DEPENDENCY-SECURITY-REMEDIATION-1 (issue #65).
 *
 * Advisories, all dev-only:
 *
 *   GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr (critical) — `tinypool` <=2.1.1
 *     @tlp/* → vitest ^3.0.5 → tinypool ^1.1.1
 *   GHSA-82fw-gwwq-j7x9 (moderate) — `@vitest/mocker` <4.1.11
 *     @tlp/* → vitest ^3.0.5 → @vitest/mocker 3.2.7
 *   GHSA-68fv-2mgg-jv7q (high) — `source-map-js` <1.2.2
 *     @tlp/web → vite → postcss → source-map-js ^1.2.1
 *     @tlp/web → jsdom → css-tree → source-map-js ^1.2.0
 *
 * ## Why this one moves manifests when the first two did not
 *
 * `source-map-js` is lockfile-only (1.2.2 satisfies both ranges). `tinypool`
 * is not: every Vitest 3.x release declares `tinypool ^1.1.1`, no 1.x is
 * patched, and forcing 2.x under Vitest 3 with an override would run the test
 * runner's worker pool on a major its authors never shipped. Vitest 4.1.11
 * removes tinypool entirely and is the first release outside the mocker
 * advisory, so the smallest sound remedy is `vitest` `^3.0.5` → `^4.1.11` in
 * the three workspace manifests that declare it, and nothing else.
 *
 * ## Why it is judged as ONE transition over four files
 *
 * A manifest bump without its lockfile, or a lockfile without its manifests, is
 * not the approved change. So the four files are pinned together: each at its
 * FROM digest in the base and its TO digest in the change. If any one of them
 * moves, all four must land exactly. The root manifest is not in the set and
 * stays under the ordinary refusal.
 *
 * Same guarantees as the two before it: `null` unless the base is exactly the
 * FROM tree, so it is spent the moment it merges, and no parameter widens it.
 * Its lockfile FROM digest is the brace-expansion TO digest, so both earlier
 * authorizations are already spent and stay exactly as they were.
 * ------------------------------------------------------------------ */

/** Human-readable identity of the Vitest transition. */
export const VITEST_DIRECTIVE = "DEPENDENCY-SECURITY-REMEDIATION-1 (issue #65)";
export const VITEST_ADVISORIES = [
  "GHSA-5gmw-xhrv-c9v3",
  "GHSA-85c8-ppgw-ccpr",
  "GHSA-82fw-gwwq-j7x9",
  "GHSA-68fv-2mgg-jv7q"
];
export const VITEST_SPEC_FROM = "^3.0.5";
export const VITEST_SPEC_TO = "^4.1.11";

/** Every file the transition moves, each pinned at both ends by SHA-256. */
export const VITEST_TRANSITION = {
  "package-lock.json": {
    from: "ae794bd905a31b2b969bcc27c48bea06909442496f2508428b6fc5939e62bdd5",
    to: "e2faa947132a77121ec7753b0482da184c6ec881f57d903ce42faa57a9d23ea8"
  },
  "apps/web/package.json": {
    from: "b7b8c5134b65cc41aec351870075b108f3640df12d0f052654a72fee8b0f23d1",
    to: "534294daa8799ce61c3c268899df042d68a9dfb1188db7d1f2ff8bebd3ced712"
  },
  "packages/shared-types/package.json": {
    from: "352b5aa1fcce1af6e315a1e2abae4bf54cf19c6d08afa54560e29374eaa15277",
    to: "aa0a60924393fca2ee14b5a2c5890b0dcbc427daba539f47fea24288ef26f1b8"
  },
  "services/api/package.json": {
    from: "7874b3483d72fc1e657030e3b6366f38749abd8064f7a544c56e887e201e10a1",
    to: "28060c6513280362d277e5059004ee407df59a7d9ab557be184f2e7e7402ff97"
  }
};

/**
 * The verdict of the Vitest authorization, or `null` when it does not apply.
 *
 * `baseTexts` and `currentTexts` map each path in `VITEST_TRANSITION` to its
 * exact bytes, or `null` where the file is absent.
 *
 * `null` unless EVERY base file is at its FROM digest and at least one current
 * file differs from its base. The caller then falls through to the ordinary
 * per-file policy, which refuses whatever it is. It is never a pass.
 *
 * Returns `[]` only when every current file is at its TO digest.
 */
export function vitestTransitionVerdict(baseTexts, currentTexts, sha256) {
  const paths = Object.keys(VITEST_TRANSITION);

  for (const path of paths) {
    const base = baseTexts[path];
    if (base === null || base === undefined) return null;
    if (sha256(base) !== VITEST_TRANSITION[path].from) return null;
  }

  if (paths.every((path) => currentTexts[path] === baseTexts[path])) {
    return null;
  }

  const problems = [];
  for (const path of paths) {
    const current = currentTexts[path];
    if (current === null || current === undefined) {
      problems.push(
        path +
          " was deleted; the " +
          VITEST_DIRECTIVE +
          " transition moves it, it does not remove it"
      );
      continue;
    }
    const digest = sha256(current);
    if (digest !== VITEST_TRANSITION[path].to) {
      problems.push(
        path +
          " is not the approved result of the vitest " +
          VITEST_SPEC_FROM +
          " to " +
          VITEST_SPEC_TO +
          " transition (sha256 " +
          digest.slice(0, 12) +
          "… where " +
          VITEST_TRANSITION[path].to.slice(0, 12) +
          "… is authorized) for " +
          VITEST_ADVISORIES.join(", ") +
          " (" +
          VITEST_DIRECTIVE +
          "); the four files move together, exactly, or not at all"
      );
    }
  }
  return problems;
}

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

  // The one-time SECURITY transition, judged on its own pinned endpoints.
  //
  // Checked before the spent refusal because the jsdom authorization IS spent
  // and would otherwise refuse the security patch it knows nothing about. It
  // cannot widen anything: it returns `null` unless the base is exactly the
  // approved pre-patch lockfile, and once this patch merges no base will ever
  // hash to that again.
  const security = securityLockfileVerdict(baseLockText, currentLockText, sha256);
  if (security !== null) return security;

  // The brace-expansion transition, on the same terms. Its FROM digest is the
  // js-yaml TO digest, so at most one of the two can ever apply to a base.
  const brace = braceLockfileVerdict(baseLockText, currentLockText, sha256);
  if (brace !== null) return brace;

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
