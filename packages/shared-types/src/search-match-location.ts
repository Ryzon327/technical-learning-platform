import type { CurriculumSearchResults } from "./curriculum-search";
import type { SearchDocument } from "./search-document";

/**
 * WP-005 — where a curriculum search result matched.
 *
 * A learner who searches for a concept should see WHERE it was found: the
 * course, the mission and, when the match came from lesson text, the step —
 * with a short snippet in which the matched words are marked.
 *
 * ## This is response data, not Search Document state
 *
 * DEC-046 keeps per-query match state out of `SearchDocument`, which remains
 * source-derived. A location is per-query (the snippet depends on what was
 * searched), so it travels beside the results in `matchLocations`, keyed by
 * `documentId`, and never inside a document.
 *
 * ## What it never carries
 *
 * No internal identifier, no match class, no ranking value, no learner
 * identity, and no text from a field the learner projection withholds. The
 * server builds every location from records the caller was already authorized
 * to read; this module only describes the shape and words it.
 *
 * Pure module: no I/O, no clock, no randomness, no AI. Matching happens on the
 * server — nothing here decides whether anything matched.
 */

/** Where in the result the match was found. */
export const CURRICULUM_MATCH_FOUND_IN = ["title", "description", "step"] as const;

export type CurriculumMatchFoundIn = (typeof CURRICULUM_MATCH_FOUND_IN)[number];

/** One level of the course → mission → step trail. */
export interface CurriculumMatchTrailEntry {
  kind: "learning_path" | "course" | "mission" | "competency" | "step";
  title: string;
}

/**
 * A short snippet split around one matched passage, so a renderer can mark the
 * match with semantic markup rather than colour, and never has to locate it.
 */
export interface CurriculumMatchSnippet {
  before: string;
  match: string;
  after: string;
}

export interface CurriculumSearchMatchLocation {
  documentId: string;
  foundIn: CurriculumMatchFoundIn;
  trail: CurriculumMatchTrailEntry[];
  snippet?: CurriculumMatchSnippet;
}

/** The result set with its locations attached. Absent when there are none. */
export interface CurriculumLocatedSearchResults extends CurriculumSearchResults {
  matchLocations?: CurriculumSearchMatchLocation[];
}

/** Characters of context kept on each side of a match. */
export const CURRICULUM_MATCH_SNIPPET_BEFORE = 60;
export const CURRICULUM_MATCH_SNIPPET_AFTER = 100;

/** Collapses whitespace, which is the coordinate space snippet offsets use. */
export function compactCurriculumMatchText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Splits already-compacted text around one match.
 *
 * The caller says where the match is; this only cuts. Text outside the window
 * is replaced by an ellipsis so the snippet stays short.
 */
export function buildCurriculumMatchSnippet(
  text: string,
  start: number,
  length: number
): CurriculumMatchSnippet {
  const from = Math.max(0, start - CURRICULUM_MATCH_SNIPPET_BEFORE);
  const end = start + length;
  const to = Math.min(text.length, end + CURRICULUM_MATCH_SNIPPET_AFTER);

  return {
    before: `${from > 0 ? "…" : ""}${text.slice(from, start)}`,
    match: text.slice(start, end),
    after: `${text.slice(end, to)}${to < text.length ? "…" : ""}`
  };
}

/**
 * Attaches the location of each RETURNED result, in result order.
 *
 * Reads only the documents in `results`, so a location can never describe a
 * record the learner did not receive. The key is omitted when no returned
 * result has a location.
 */
export function withCurriculumMatchLocations<T extends CurriculumSearchResults>(
  results: T,
  located: readonly {
    document: SearchDocument;
    location?: CurriculumSearchMatchLocation;
  }[]
): T & CurriculumLocatedSearchResults {
  const byDocument = new Map<string, CurriculumSearchMatchLocation>();
  for (const entry of located) {
    if (entry.location) byDocument.set(entry.document.documentId, entry.location);
  }

  const matchLocations = results.results
    .map((document) => byDocument.get(document.documentId))
    .filter(
      (location): location is CurriculumSearchMatchLocation =>
        location !== undefined
    );

  return {
    ...results,
    ...(matchLocations.length > 0 ? { matchLocations } : {})
  };
}

/** The word for one trail level. Text, never an icon or colour. */
export function describeCurriculumMatchTrailKind(
  kind: CurriculumMatchTrailEntry["kind"]
): string {
  switch (kind) {
    case "learning_path":
      return "Learning path";
    case "course":
      return "Course";
    case "mission":
      return "Mission";
    case "competency":
      return "Competency";
    default:
      return "Step";
  }
}

/** "Course: X › Mission: Y › Step: Z" — the trail as one plain sentence. */
export function describeCurriculumMatchTrail(
  trail: readonly CurriculumMatchTrailEntry[]
): string {
  return trail
    .map((entry) => `${describeCurriculumMatchTrailKind(entry.kind)}: ${entry.title}`)
    .join(" › ");
}

/** The lead-in naming where the match was found. */
export function describeCurriculumMatchFoundIn(foundIn: CurriculumMatchFoundIn): string {
  switch (foundIn) {
    case "title":
      return "Matched in the title";
    case "description":
      return "Matched in the description";
    default:
      return "Matched in lesson text";
  }
}
