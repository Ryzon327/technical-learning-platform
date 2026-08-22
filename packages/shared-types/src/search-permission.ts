/**
 * SEARCH-003 — Permission-Aware Search.
 *
 * The generic permission-result contract Search composes, and nothing else.
 *
 * ## Search is not an authorization system
 *
 * SEARCH-003 section 1: "Search filtering is defense-in-depth; authoritative
 * access checks remain with the owning Engine." Section 4: search must expand
 * "without becoming a parallel authorization system."
 *
 * This module therefore contains NO policy. It does not know what publication
 * state means, who owns a note, what a role is, or how enrollment works. It
 * only carries a decision an owning Engine already made, and refuses to surface
 * anything that is not an explicit `authorized`.
 *
 * Every searchable source in this repository is authorized by row level
 * security — either `publication_state = 'published'` or
 * `auth.uid() = user_id`. For those sources an unreadable row never becomes a
 * candidate at all, and this contract simply records that fact in a form later
 * sources can share.
 *
 * ## Why a discriminated union rather than a boolean
 *
 * `unavailable` must never collapse into `true` or `false` by accident. A
 * boolean would let "we could not determine access" be read as "denied" in one
 * place and "allowed" in another. The union makes the third state impossible to
 * ignore, and `maySurface` is the only way to reach a yes.
 *
 * Pure module: no I/O, no clock, no randomness, no AI.
 */

export const SEARCH_PERMISSION_MODEL_VERSION = "search-permission-v1";

export const SEARCH_PERMISSION_OUTCOMES = [
  "authorized",
  "unauthorized",
  "unavailable"
] as const;

export type SearchPermissionOutcome =
  (typeof SEARCH_PERMISSION_OUTCOMES)[number];

/**
 * A decision made by the owning Engine, carried by Search.
 *
 * `unavailable` may carry an internal reason for diagnostics. That reason is
 * never learner-visible: SEARCH-003 section 9 forbids revealing the existence
 * of records outside the caller's scope, and a reason string is exactly the
 * kind of metadata that would.
 */
export type SearchPermissionDecision =
  | { outcome: "authorized" }
  | { outcome: "unauthorized" }
  | { outcome: "unavailable"; internalReason?: string };

export function searchAuthorized(): SearchPermissionDecision {
  return { outcome: "authorized" };
}

export function searchUnauthorized(): SearchPermissionDecision {
  return { outcome: "unauthorized" };
}

export function searchPermissionUnavailable(
  internalReason?: string
): SearchPermissionDecision {
  return {
    outcome: "unavailable",
    ...(internalReason ? { internalReason } : {})
  };
}

/**
 * The single gate. Only an explicit `authorized` may be surfaced.
 *
 * Fail-closed by construction: this returns true for exactly one outcome, so a
 * new outcome added later defaults to denied rather than allowed.
 */
export function maySurface(decision: SearchPermissionDecision): boolean {
  return decision.outcome === "authorized";
}

/**
 * What the learner observes.
 *
 * `unauthorized` and `unavailable` both collapse to `absent` — identical to a
 * record that simply does not exist. SEARCH-003 section 2 requires that a user
 * cannot discover another student's notes, private evidence, admin-only
 * curriculum, unpublished content or restricted labs; discovering that
 * something was *withheld* is itself that discovery.
 */
export type SearchObservableOutcome = "visible" | "absent";

export function collapseToObservable(
  decision: SearchPermissionDecision
): SearchObservableOutcome {
  return maySurface(decision) ? "visible" : "absent";
}

/**
 * Turns an owning Engine's authoritative read into a decision.
 *
 * This is the shape every RLS-backed source has: the read either failed, or it
 * returned the row, or it did not. It contains no policy — the Engine's row
 * level security already decided what "found" means for that caller.
 *
 * A row that was not found is reported as `unauthorized` rather than a distinct
 * "missing" state, precisely so the two are indistinguishable downstream.
 */
export function decideFromAuthoritativeRead(input: {
  readFailed: boolean;
  found: boolean;
  internalReason?: string;
}): SearchPermissionDecision {
  if (input.readFailed) {
    return searchPermissionUnavailable(input.internalReason);
  }
  return input.found ? searchAuthorized() : searchUnauthorized();
}

/** One candidate paired with the decision an owning Engine made about it. */
export interface SearchPermissionedCandidate<T> {
  decision: SearchPermissionDecision;
  value: T;
}

/**
 * Keeps only what may be surfaced.
 *
 * Everything else is dropped silently — no placeholder, no marker, no count of
 * what was removed.
 */
export function surfaceAuthorized<T>(
  candidates: readonly SearchPermissionedCandidate<T>[]
): T[] {
  return candidates
    .filter((candidate) => maySurface(candidate.decision))
    .map((candidate) => candidate.value);
}

/**
 * The count a learner may see: authorized results actually surfaced.
 *
 * Never the candidate count, never the withheld count, never a global total.
 */
export function countSurfaced<T>(
  candidates: readonly SearchPermissionedCandidate<T>[]
): number {
  return surfaceAuthorized(candidates).length;
}

/**
 * Fields a Search permission decision must never carry, and which must never
 * enter a Search Document.
 *
 * Held as data so tests and the verifier assert the prohibition directly.
 * Search composes decisions; it does not store the inputs to them.
 */
export const SEARCH_PERMISSION_FORBIDDEN_FIELDS: readonly string[] = [
  "userId",
  "user_id",
  "ownerId",
  "owner_id",
  "roleId",
  "roles",
  "acl",
  "aclEntries",
  "permissions",
  "policy",
  "grants",
  "hiddenCount",
  "withheldCount",
  "unauthorizedCount"
];

/**
 * The learner-facing message when Search itself could not be completed.
 *
 * Distinguishes "Search could not safely determine results" from "nothing
 * matched", without implying that anything was withheld.
 */
export function describeSearchPermissionUnavailable(): string {
  return "Search could not be completed right now. Please try again in a moment.";
}

/**
 * The security contract any future Search cache or materialized index must
 * satisfy (SEARCH-007 owns building one; SEARCH-003 owns these rules).
 *
 * Recorded as data so it is reviewable and testable rather than folklore. No
 * cache or index exists today, and SEARCH-003 builds none.
 */
export const SEARCH_CACHE_SECURITY_CONTRACT: readonly string[] = [
  "A cache or index must never become the permission authority.",
  "Cache entries must never cross security scopes or users.",
  "A cached or indexed candidate must be re-authorized against source authority before being served.",
  "An authorization change must invalidate or reconcile affected derived data.",
  "Stale permission metadata must fail closed."
];
