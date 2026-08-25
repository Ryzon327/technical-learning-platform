import {
  orderCurriculumSearchResults,
  type CurriculumSearchResults
} from "./curriculum-search";
import type { SearchDocument } from "./search-document";
import {
  containsTokenSequence,
  CURRICULUM_MATCH_KINDS,
  type ClassifiedSearchDocument,
  type CurriculumMatchKind,
  type CurriculumQueryVariant
} from "./search-terms";

/**
 * SEARCH-008 — Search Result Ranking.
 *
 * The deterministic baseline ordering a learner receives, expressed as a
 * lexicographic comparator over NAMED VOCABULARIES.
 *
 * ## What this owns
 *
 * Exactly one new ranking signal: **title precision** — whether the learner's
 * search appears as the whole title, as a contiguous token sequence in the
 * title, as a substring of the title, or only in the description.
 *
 * Everything else in the order already existed and is COMPOSED here, never
 * re-derived:
 *
 *   R1  SEARCH-005 match class      exact → normalized → alias → typo
 *   R2  SEARCH-008 title precision  whole → token → substring → description
 *   R3  SEARCH-002 content type     learning_path → course → mission → competency
 *   R4  SEARCH-002 stable id        total-order tie-break
 *
 * R1 dominates R2 by ruling: a result that matched the learner's ACTUAL words
 * must never be displaced by one that only matched after the query was adjusted,
 * however precisely it matches. R3 and R4 arrive together as SEARCH-002's
 * existing neutral order, which is applied FIRST and survives untouched wherever
 * R1 and R2 tie.
 *
 * ## There is no score
 *
 * No relevance value, no numeric weighting, no boost, no confidence, no point
 * total, no arithmetic beyond subtracting two vocabulary indices — the same
 * comparator shape SEARCH-005A already uses. `SEARCH_RANKING_FORBIDDEN_SIGNALS`
 * records the prohibition as data so tests and the verifier assert it directly
 * rather than trusting this prose.
 *
 * ## What can never influence the order
 *
 * Learner identity, learner progress, current Course or Mission context,
 * competency references, popularity, click history, engagement, analytics,
 * private behaviour, private note content, source freshness, or any read of any
 * kind. This module's inputs are the documents the caller has ALREADY been
 * authorized to receive and the caller's OWN query variants — nothing else is
 * reachable from its signature.
 *
 * ## Ordering is not a permission decision
 *
 * Ranking runs strictly after SEARCH-003 surfacing, version resolution and
 * SEARCH-004 filtering. It can reorder what a learner receives; it can never
 * add to it, and a withheld record is not in its input at all.
 *
 * Pure module: no I/O, no clock, no randomness, no AI.
 */

export const SEARCH_RANKING_MODEL_VERSION = "search-ranking-v1";

/**
 * How precisely a result's TITLE carries the learner's search.
 *
 * Array order IS the precedence order. SEARCH-008 section 5 names "Exact title
 * match" and "exact technical token match" as the first two baseline signals;
 * this vocabulary is those two, plus the two weaker cases needed to make the
 * classification total.
 *
 * `description_only` is LAST and is also the fallback for anything that cannot
 * be classified, so nothing reaches the top of a list by failing to classify.
 */
export const CURRICULUM_TITLE_PRECISIONS = [
  "whole_title",
  "title_token",
  "title_substring",
  "description_only"
] as const;

export type CurriculumTitlePrecision =
  (typeof CURRICULUM_TITLE_PRECISIONS)[number];

/**
 * Signals that must never influence this ordering.
 *
 * Held as data so the prohibition is asserted rather than described. Every entry
 * is a term the approved rulings placed outside SEARCH-008's baseline: section 6
 * excludes engagement-maximizing ranking and ranking based on student
 * surveillance, section 9 requires that private behaviour data not be needed,
 * and DEC-046 reserved numeric relevance to a decision that has now declined it.
 */
export const SEARCH_RANKING_FORBIDDEN_SIGNALS: readonly string[] = [
  "relevanceScore",
  "rankScore",
  "score",
  "boost",
  "weight",
  "weighting",
  "popularity",
  "clickHistory",
  "engagement",
  "analytics",
  "learnerProgress",
  "userId",
  "ownerId",
  "studentId",
  "learnerId",
  "sourceUpdatedAt",
  "freshness",
  "noteBody",
  "noteId",
  "embedding",
  "semantic",
  "vector"
];

/**
 * The last title precision in the vocabulary.
 *
 * Read from the vocabulary rather than restated, so extending the array cannot
 * silently leave an unclassifiable result ranked first.
 */
function weakestTitlePrecision(): CurriculumTitlePrecision {
  return CURRICULUM_TITLE_PRECISIONS[
    CURRICULUM_TITLE_PRECISIONS.length - 1
  ] as CurriculumTitlePrecision;
}

/** The last SEARCH-005 match class, for the same reason. */
function weakestMatchKind(): CurriculumMatchKind {
  return CURRICULUM_MATCH_KINDS[
    CURRICULUM_MATCH_KINDS.length - 1
  ] as CurriculumMatchKind;
}

/**
 * Classifies how precisely one already-authorized result's title carries the
 * search.
 *
 * Returns the STRONGEST precision any approved variant achieves, so a title that
 * is both an exact match for one variant and a loose substring match for another
 * is judged by the exact one.
 *
 * Token comparison reuses SEARCH-005's `containsTokenSequence`. That is
 * deliberate and load-bearing: it is token-based rather than substring-based,
 * which is what makes `terraform plan` rank above `Terraform planning` instead
 * of tying with it, and what keeps `Get-ADUser` from being read as the acronym
 * `AD`. SEARCH-008 does not implement a second matching rule.
 *
 * Reads only the title and the caller's own query variants. No description text
 * is read here — description matching is the ABSENCE of a title match, which is
 * exactly what the weakest class means.
 */
export function classifyCurriculumTitlePrecision(
  title: string,
  variants: readonly CurriculumQueryVariant[]
): CurriculumTitlePrecision {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  const lowered = normalizedTitle.toLowerCase();

  let best = weakestTitlePrecision();
  let bestIndex = CURRICULUM_TITLE_PRECISIONS.indexOf(best);

  for (const variant of variants) {
    const value = variant.value.replace(/\s+/g, " ").trim();
    if (value === "") continue;

    let precision: CurriculumTitlePrecision;
    if (lowered === value.toLowerCase()) {
      precision = "whole_title";
    } else if (containsTokenSequence(normalizedTitle, value)) {
      precision = "title_token";
    } else if (lowered.includes(value.toLowerCase())) {
      precision = "title_substring";
    } else {
      continue;
    }

    const index = CURRICULUM_TITLE_PRECISIONS.indexOf(precision);
    if (index < bestIndex) {
      best = precision;
      bestIndex = index;
    }
  }

  return best;
}

/**
 * There is deliberately NO per-result precision label in this module.
 *
 * Ruling 3 forbids exposing per-result ranking diagnostics to a learner, and a
 * "why this ranked here" string would be exactly that. The single learner-facing
 * explanation below describes the RULE, never an individual result.
 */

/**
 * The learner-facing explanation of the order.
 *
 * SEARCH-008 section 10 requires the ordering to be understandable WITHOUT
 * visual-only indicators, and section 15 requires ranking to be explainable.
 * This is ordinary text: no colour, no icon, no hover, no animation, and no
 * per-result annotation.
 *
 * It also states what the order does NOT depend on, because section 8's
 * commitment — relevance to the learner's query rather than what keeps them
 * clicking — is only meaningful to a learner if it is said.
 */
export function describeCurriculumRankingOrder(): string {
  return (
    "Results are ordered by how closely they match what you typed: " +
    "closest wording first, then title matches, then description matches. " +
    "The order never depends on popularity, on other learners, or on anything you have done before."
  );
}

/**
 * Orders and bounds the learner's results.
 *
 * ## Order of operations, which is the security property
 *
 *   1. SEARCH-002's neutral deterministic order is applied FIRST and gives the
 *      total order that survives every tie (R3 then R4)
 *   2. one stable sort applies R1 then R2
 *   3. only THEN is the requested limit applied
 *
 * Bounding last is essential rather than incidental. If the limit were applied
 * before ranking, a whole-title exact match could be truncated away in favour of
 * a description-only match that happened to sort earlier neutrally — the learner
 * would lose the single most relevant result to an implementation detail.
 *
 * ## Determinism
 *
 * The neutral pre-pass is a total order over the input, and the ranking sort is
 * stable, so the same documents in any input order produce byte-identical
 * output. There is no randomness, no clock and no iteration-order dependence.
 *
 * `variants` are the caller's OWN approved query variants for the pass that
 * produced these results — including a SEARCH-005B recovery pass, so a recovered
 * result is ranked against the query that actually found it. They are static
 * repository vocabulary plus the learner's own words; no candidate, note or
 * unauthorized record contributes to them.
 *
 * Takes no identity, no token, no client and no request context. That is a
 * signature-level guarantee that learner identity cannot become a ranking input.
 */
export function buildRankedCurriculumSearchResults(
  classified: readonly ClassifiedSearchDocument[],
  variants: readonly CurriculumQueryVariant[],
  limit: number
): CurriculumSearchResults {
  const kindOf = new Map<string, CurriculumMatchKind>();
  for (const entry of classified) {
    kindOf.set(entry.document.documentId, entry.matchKind);
  }

  const neutral = orderCurriculumSearchResults(
    classified.map((entry) => entry.document)
  );

  const matchTierOf = (document: SearchDocument): number =>
    CURRICULUM_MATCH_KINDS.indexOf(
      kindOf.get(document.documentId) ?? weakestMatchKind()
    );

  const titleTierOf = (document: SearchDocument): number =>
    CURRICULUM_TITLE_PRECISIONS.indexOf(
      classifyCurriculumTitlePrecision(document.title, variants)
    );

  const ranked = [...neutral].sort((a, b) => {
    const matchDelta = matchTierOf(a) - matchTierOf(b);
    if (matchDelta !== 0) return matchDelta;
    return titleTierOf(a) - titleTierOf(b);
  });

  const bounded = ranked.slice(0, limit);

  return { results: bounded, count: bounded.length };
}
