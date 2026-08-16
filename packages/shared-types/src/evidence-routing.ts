/**
 * Wave 7 / Batch 7 — reserved Evidence path segments.
 *
 * The Evidence surface exposes both a single-identifier route
 * (`/evidence/:evidenceId`) and sibling collection routes under the same
 * prefix (`/evidence/portfolio`, `/evidence/export`). A single-segment path
 * therefore matches the identifier pattern even when the segment is a reserved
 * route name, which would silently treat "export" as an Evidence identifier and
 * authenticate a request that has no matching route.
 *
 * These names are reserved: they can never be an Evidence identifier, which is
 * always a UUID. Declaring them once means a method that a collection route
 * does not support falls through to the standard route-not-found behaviour
 * rather than being answered by the identifier route.
 *
 * Pure module: no I/O, no randomness, no AI.
 */

export const RESERVED_EVIDENCE_PATH_SEGMENTS: readonly string[] = [
  "portfolio",
  "export"
];

/**
 * True when a single path segment under `/evidence/` names a collection route
 * rather than an Evidence identifier.
 *
 * Case-insensitive and whitespace-tolerant so a differently-cased request
 * cannot slip past the guard and reach the identifier route.
 */
export function isReservedEvidencePathSegment(segment: unknown): boolean {
  if (typeof segment !== "string") {
    return false;
  }
  return RESERVED_EVIDENCE_PATH_SEGMENTS.includes(segment.trim().toLowerCase());
}

/**
 * How a single segment under `/evidence/` should be interpreted.
 *
 * `reserved` means the segment names a collection route; if no handler claimed
 * it for this method, the request must be answered as not found rather than
 * treated as an identifier lookup.
 */
export type EvidencePathSegmentKind = "reserved" | "identifier";

export function classifyEvidencePathSegment(
  segment: unknown
): EvidencePathSegmentKind {
  return isReservedEvidencePathSegment(segment) ? "reserved" : "identifier";
}
