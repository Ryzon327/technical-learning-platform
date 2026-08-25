import { buildCurriculumSourceReference } from "./curriculum-search";

/**
 * SEARCH-008 — Search Fallback.
 *
 * What a learner is shown when a search returns nothing, and what they are shown
 * when Search itself could not run. Those are two different facts and this
 * module refuses to let them collapse into one.
 *
 * ## The distinction is the whole point
 *
 * SEARCH-008 section 12 requires the platform to tell the learner search is
 * limited. A dependency failure rendered as "no results" would be a false claim
 * about the corpus: it would state that nothing matched when in truth nothing
 * was searched. `SEARCH_FALLBACK_REASONS` makes the two states separate values
 * with separate wording, so a caller cannot accidentally describe one as the
 * other.
 *
 * ## Suggestions are learner ACTIONS, never silent behaviour
 *
 * Every suggestion here names something the learner may choose to do. Nothing in
 * this module broadens a query, generates a synonym, alters a filter, re-runs a
 * search, or widens scope. SEARCH-005 owns query interpretation — normalization,
 * curated aliases and bounded typo recovery — and SEARCH-008 does not become a
 * second correction system beside it.
 *
 * ## Where the words come from
 *
 * The learner's own query, whether a filter is currently active, and static
 * application wording. That is the complete list of inputs.
 *
 * NOT from: the result corpus, any candidate row, any withheld or unauthorized
 * record, any hidden count, any private note, any other learner, any analytics,
 * or any read of any kind. That is a signature-level property — no document,
 * result, count, token or client is reachable from these parameters — which is
 * why a suggestion cannot describe something the learner was not shown.
 *
 * Pure module: no I/O, no clock, no randomness, no AI.
 */

export const SEARCH_FALLBACK_MODEL_VERSION = "search-fallback-v1";

/**
 * Why fallback guidance is being shown.
 *
 * `no_results` — Search RAN, was authorized, and honestly matched nothing.
 * `search_unavailable` — Search could NOT run. Nothing was matched or not
 * matched, and the learner must not be told otherwise.
 */
export const SEARCH_FALLBACK_REASONS = [
  "no_results",
  "search_unavailable"
] as const;

export type SearchFallbackReason = (typeof SEARCH_FALLBACK_REASONS)[number];

/**
 * The actions a learner may choose.
 *
 * Deliberately tiny, and deliberately containing no query action.
 *
 * "Return to your original wording" is ABSENT on purpose. SEARCH-005B already
 * renders that affordance for a typo recovery, and it is only meaningful when a
 * recovery actually produced results — in which case there are results and no
 * fallback is shown at all. Adding it here would duplicate a SEARCH-005 control
 * and start the second correction system the ownership boundary forbids.
 */
export const CURRICULUM_FALLBACK_ACTIONS = [
  "clear_filters",
  "browse_curriculum"
] as const;

export type CurriculumFallbackAction =
  (typeof CURRICULUM_FALLBACK_ACTIONS)[number];

export interface CurriculumFallbackSuggestion {
  action: CurriculumFallbackAction;
  label: string;
}

export interface CurriculumFallbackGuidance {
  reason: SearchFallbackReason;
  headline: string;
  suggestions: CurriculumFallbackSuggestion[];
}

/**
 * Fields fallback guidance must never carry.
 *
 * Held as data so tests and the verifier assert the prohibition directly. Each
 * one is a channel that would either describe records the learner did not
 * receive, or import vocabulary from somewhere this module may not read.
 */
export const SEARCH_FALLBACK_FORBIDDEN_FIELDS: readonly string[] = [
  "candidateCount",
  "totalCount",
  "globalTotal",
  "hiddenCount",
  "withheldCount",
  "unauthorizedCount",
  "suggestedTerms",
  "relatedQueries",
  "synonyms",
  "popularQueries",
  "noteId",
  "noteBody",
  "userId",
  "ownerId",
  "studentId",
  "learnerId",
  "score",
  "relevance"
];

/** The static heading above fallback guidance. */
export function describeCurriculumFallbackHeading(): string {
  return "What you can do next";
}

/** The honest headline for each state. Neither may be phrased as the other. */
export function describeCurriculumFallbackHeadline(
  reason: SearchFallbackReason,
  query: string
): string {
  const asked = query.replace(/\s+/g, " ").trim();

  if (reason === "search_unavailable") {
    // Says plainly that this is NOT an empty result. Section 12 requires the
    // learner be told search is limited, and a learner who reads "nothing
    // found" would draw the opposite conclusion about the curriculum.
    return "Search is unavailable right now, so nothing could be searched. This is a search problem, not an empty result.";
  }

  return asked === ""
    ? "No matching curriculum found."
    : `No matching curriculum found for “${asked}”.`;
}

/** The label for one learner action. Static wording, never generated. */
export function describeCurriculumFallbackAction(
  action: CurriculumFallbackAction
): string {
  return action === "clear_filters"
    ? "Clear the active filters and search again."
    : "Browse the published learning paths.";
}

/**
 * Builds the guidance for one fallback state.
 *
 * `clear_filters` is offered ONLY when a filter is actually active and the
 * search genuinely ran. Offering it after a dependency failure would imply the
 * learner's filters caused the failure, and offering it when no filter is set
 * would be advice about something that is not there.
 *
 * The suggestion is an OFFER. This function changes no filter, and the returned
 * value carries no instruction to change one — the learner chooses.
 */
export function buildCurriculumFallbackGuidance(input: {
  reason: SearchFallbackReason;
  query: string;
  filterActive: boolean;
}): CurriculumFallbackGuidance {
  const suggestions: CurriculumFallbackSuggestion[] = [];

  if (input.reason === "no_results" && input.filterActive) {
    suggestions.push({
      action: "clear_filters",
      label: describeCurriculumFallbackAction("clear_filters")
    });
  }

  suggestions.push({
    action: "browse_curriculum",
    label: describeCurriculumFallbackAction("browse_curriculum")
  });

  return {
    reason: input.reason,
    headline: describeCurriculumFallbackHeadline(input.reason, input.query),
    suggestions
  };
}

/**
 * The largest number of navigation entries shown.
 *
 * Bounded for the same reason every other Search output is: an unbounded render
 * is an unbounded promise about a corpus whose size nobody has measured.
 */
export const CURRICULUM_NAVIGATION_MAX_ENTRIES = 20;

/**
 * One structured-navigation destination.
 *
 * Assembled by EXPLICIT ASSIGNMENT below rather than by spreading a source row,
 * so an internal database identifier on the input cannot ride along into the
 * Search surface. This mirrors the discipline `buildSearchDocument` applies to
 * SEARCH-001 documents.
 */
export interface CurriculumNavigationEntry {
  stableId: string;
  title: string;
  description?: string;
  reference: string;
}

/**
 * Projects already-authorized published learning paths into navigation entries.
 *
 * ## This is presentation, not authorization
 *
 * The input has already been read through the caller's own RLS-scoped client by
 * the Curriculum Engine's existing published-paths read. This function makes no
 * access decision, applies no ownership rule and cannot add an entry the caller
 * was not already given. Dropping an entry with no stable identity or title is
 * defence in depth, not a policy.
 *
 * The destination reuses SEARCH-002's `buildCurriculumSourceReference`, so a
 * learner arriving through fallback navigation lands on exactly the same
 * authoritative route a search result would have taken them to. SEARCH-008
 * section 13 requires source-of-truth links to be preserved.
 */
export function buildCurriculumNavigationEntries(
  paths: readonly {
    stableId: string;
    title: string;
    description?: string;
  }[]
): CurriculumNavigationEntry[] {
  const entries: CurriculumNavigationEntry[] = [];

  for (const path of paths) {
    if (entries.length >= CURRICULUM_NAVIGATION_MAX_ENTRIES) break;

    const stableId = String(path.stableId ?? "").trim();
    const title = String(path.title ?? "").trim();
    if (!stableId || !title) continue;

    const description = String(path.description ?? "")
      .replace(/\s+/g, " ")
      .trim();

    entries.push({
      stableId,
      title,
      ...(description ? { description } : {}),
      reference: buildCurriculumSourceReference("learning_path", stableId)
    });
  }

  return entries;
}

/** Heading for the navigation section. */
export function describeCurriculumNavigationHeading(): string {
  return "Browse published curriculum";
}

/**
 * Why the navigation section is present, in the learner's terms.
 *
 * Section 12 requires structured navigation to remain available during
 * degradation, and the wording differs by reason so the panel never implies the
 * failed search returned nothing.
 */
export function describeCurriculumNavigationIntro(
  reason: SearchFallbackReason
): string {
  return reason === "search_unavailable"
    ? "You can still browse published learning paths while search is unavailable."
    : "You can browse published learning paths instead.";
}

/**
 * The honest message when the navigation read itself fails.
 *
 * A failed read is a failure. It must never render as an empty list, which
 * would claim the platform has no published curriculum.
 */
export function describeCurriculumNavigationUnavailable(): string {
  return "Published learning paths could not be loaded right now. Your learning content is unaffected.";
}

/** Shown while the navigation read is in flight, so the panel is never blank. */
export function describeCurriculumNavigationLoading(): string {
  return "Loading published learning paths…";
}

/** The honest message when the caller genuinely has no published paths. */
export function describeCurriculumNavigationEmpty(): string {
  return "No published learning paths are available to you yet.";
}
