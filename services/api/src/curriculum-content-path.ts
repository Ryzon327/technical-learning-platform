import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * WP-G — which files the publication command will accept.
 *
 * ## Why a path check is a security control here
 *
 * The command takes a path from an operator and reads curriculum from it. Two
 * things must never happen: reading a file outside the repository, and
 * publishing an architecture fixture into the learner catalog.
 *
 * Architect Decision 3 asks for an explicit production location or explicit
 * fixture rejection rather than reliance on naming convention. This module does
 * both, and the document itself carries a third check (`documentKind`), so a
 * fixture would have to defeat all three to reach a learner.
 *
 * ## Why containment is computed, not string-matched
 *
 * `startsWith("content/curriculum")` also accepts `content/curriculum-scratch`
 * and `content/curriculumX`, which are different directories. Every check below
 * resolves both paths first and then asks `path.relative` whether the result
 * stays inside — a question about the path structure rather than about its
 * spelling.
 */

/** The only directory a production curriculum document may be read from. */
export const PRODUCTION_CONTENT_ROOT = "content/curriculum";

/**
 * Architecture fixtures. Permanently retained, never publishable.
 *
 * Held as its own constant and refused explicitly rather than merely being
 * outside the production root, so that widening the production root later
 * cannot silently make fixtures publishable.
 */
export const FIXTURE_CONTENT_ROOT = "content/fixtures";

export type ContentPathDecision =
  | {
      readonly allowed: true;
      readonly absolutePath: string;
      readonly relativePath: string;
    }
  | { readonly allowed: false; readonly reason: string };

/** Whether `candidate` resolves to a location inside `root`. */
function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Decide whether a path may be published from.
 *
 * Returns a decision rather than throwing, so the caller reports it the same way
 * it reports every other refusal and a test can enumerate the reasons.
 *
 * The order matters: traversal is rejected before anything else, because a path
 * that escapes the repository should never be reported in terms of which
 * content directory it is or is not in.
 */
export function resolveProductionContentPath(
  repositoryRoot: string,
  candidate: string
): ContentPathDecision {
  const root = resolve(repositoryRoot);
  const absolutePath = resolve(root, candidate);

  if (!isInside(root, absolutePath)) {
    return {
      allowed: false,
      reason:
        "The curriculum document must live inside the repository. Refusing a path that resolves outside it."
    };
  }

  const relativePath = relative(root, absolutePath);

  if (isInside(resolve(root, FIXTURE_CONTENT_ROOT), absolutePath)) {
    return {
      allowed: false,
      reason: `"${relativePath}" is an architecture fixture. Fixtures exercise the curriculum contract and are never published to the learner catalog.`
    };
  }

  if (!isInside(resolve(root, PRODUCTION_CONTENT_ROOT), absolutePath)) {
    return {
      allowed: false,
      reason: `Production curriculum is read only from ${PRODUCTION_CONTENT_ROOT}/. Refusing "${relativePath}".`
    };
  }

  if (!absolutePath.endsWith(".json")) {
    return {
      allowed: false,
      reason: `A curriculum document is JSON. Refusing "${relativePath}".`
    };
  }

  // Everything above reasons about the path STRING. `resolve` and `relative`
  // never consult the filesystem, so a symlink at
  // `content/curriculum/course.json` pointing anywhere at all — elsewhere in the
  // repository, or off it entirely — satisfies every check so far.
  //
  // So containment is asked a second time, of where the read would actually
  // land. Both sides are realpathed: the repository itself may sit behind a
  // link, and on macOS `/tmp` is a symlink to `/private/tmp`, which would
  // otherwise make every check fail there for the wrong reason.
  let realRoot: string;
  let realTarget: string;

  try {
    realRoot = realpathSync(root);
    realTarget = realpathSync(absolutePath);
  } catch {
    // A missing file, a broken link, or a path that cannot be resolved. Failing
    // closed here also means the publisher never calls readFileSync on
    // something it could not first locate.
    return {
      allowed: false,
      reason: `"${relativePath}" could not be resolved on disk. Refusing rather than guessing where it points.`
    };
  }

  if (
    !isInside(realRoot, realTarget) ||
    !isInside(resolve(realRoot, PRODUCTION_CONTENT_ROOT), realTarget) ||
    isInside(resolve(realRoot, FIXTURE_CONTENT_ROOT), realTarget)
  ) {
    return {
      allowed: false,
      reason: `"${relativePath}" resolves through a link to a file outside ${PRODUCTION_CONTENT_ROOT}/. Refusing: the approved location must be where the content actually is, not only where the path spells it.`
    };
  }

  return { allowed: true, absolutePath, relativePath };
}
