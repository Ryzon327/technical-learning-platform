/**
 * WP-I — which development UAT surface a path asks for.
 *
 * ## Why this is a pure function in its own file
 *
 * The same reason `readVerificationReferenceFromPath` is: this repository has
 * no rendered-DOM test harness, so the rule that decides whether a path
 * activates a surface has to be a total function over a string. It is then
 * testable without a browser, and `App.tsx` is left with a branch rather than
 * a regular expression.
 *
 * ## What this is NOT
 *
 * Not a router, and not the beginning of one. It recognises one exact path and
 * returns `null` for everything else, so it can never intercept a learner
 * route. The workspace still navigates with local state (`AuthenticatedApp`),
 * and WP-I adds no routing dependency.
 *
 * ## Activation is not decided here
 *
 * This says only what a path ASKS for. Whether the surface exists at all is
 * decided in `App.tsx` by `import.meta.env.DEV`, so a production build has no
 * branch to reach even if someone types the URL. Keeping the two separate is
 * deliberate: the path grammar is worth testing, and the build-mode guard is
 * worth being able to see in one place.
 */

export const UAT_TARGETS = ["instruction"] as const;

export type UatTarget = (typeof UAT_TARGETS)[number];

/**
 * Extracts the development UAT target from the current path.
 *
 * Returns `null` for every other path — including `/uat`, `/uat/`, anything
 * nested below a known target, and any path that merely begins with `/uat`.
 * The surface activates only for an exact match.
 */
export function readUatTargetFromPath(pathname: string): UatTarget | null {
  const match = pathname.match(/^\/uat\/([a-z-]+)\/?$/);
  const candidate = match?.[1];

  if (candidate === undefined) return null;

  return (UAT_TARGETS as readonly string[]).includes(candidate)
    ? (candidate as UatTarget)
    : null;
}
