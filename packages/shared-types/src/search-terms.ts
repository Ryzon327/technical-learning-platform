import {
  orderCurriculumSearchResults,
  type CurriculumSearchResults
} from "./curriculum-search";
import type { SearchDocument } from "./search-document";

/**
 * SEARCH-005A — Technical Query Normalization and Curated Aliases.
 *
 * The deterministic query-side rules that let a learner find content when they
 * type an approved acronym or add trailing sentence punctuation, **without ever
 * damaging the technical string they meant**.
 *
 * ## What this owns
 *
 * Terminal-punctuation normalization, the curated alias vocabulary, bounded
 * variant generation, match classification, and exact-before-adjusted
 * match-class tiering.
 *
 * ## What this is NOT
 *
 * **Match-class tiering is not relevance ranking.** Tiering groups results by
 * HOW they matched — exact, then normalized, then alias — and inside each group
 * preserves SEARCH-002's existing neutral deterministic order untouched. There
 * is no numeric value anywhere in this module: no score, weight, boost,
 * freshness, competency, context, popularity or click history. SEARCH-008 owns
 * relevance ordering and remains unimplemented.
 *
 * SEARCH-005B owns free-form typo recovery and also remains unimplemented:
 * there is no edit distance, no spelling-variant generation, no trigram, no
 * database extension and no `typo` match kind. SEARCH-005 is NOT complete while
 * SEARCH-005B is outstanding.
 *
 * ## The vocabulary requires zero database access
 *
 * `CURATED_CURRICULUM_TERM_ALIASES` is static, curated, reviewable data. It is
 * never derived from hidden curriculum, unauthorized records, private notes,
 * another learner's content, candidate rows or search history. That is the
 * structural reason adjustment metadata cannot leak: it is computable from the
 * learner's own query and this table alone, with no read of any kind.
 *
 * Pure module: no I/O, no clock, no randomness, no AI.
 */

export const SEARCH_TERM_MODEL_VERSION = "search-terms-v1";

/**
 * Technical strings whose representation must survive normalization exactly.
 *
 * SEARCH-005 section 8. Held as data so the tests and the verifier assert the
 * preservation directly rather than trusting prose.
 *
 * These are preservation cases, NOT alias mappings. No alternate form of any of
 * them is manufactured.
 */
export const PROTECTED_TECHNICAL_TERMS: readonly string[] = [
  "Get-ADUser",
  "kubectl",
  "index=botsv3",
  "terraform plan",
  "show vlan brief",
  "Terraform",
  "Proxmox",
  "Splunk",
  "PowerShell"
];

/**
 * Sentence punctuation that may be stripped from the ENDS of a whole query.
 *
 * Deliberately tiny. Every character that carries technical meaning — `=`, `-`,
 * `_`, `/`, `.` and anything embedded in a command, path, argument or
 * configuration syntax — is absent and must stay absent.
 */
export const REMOVABLE_TERMINAL_PUNCTUATION: readonly string[] = [
  "?",
  "!",
  ",",
  ";",
  ":"
];

/** Quote characters stripped only when they surround the entire query. */
const PAIRED_QUOTES: readonly [string, string][] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"]
];

/**
 * One curated alias relationship.
 *
 * Bidirectional as a VOCABULARY relationship. Whether a given side may be
 * emitted as a retrieval pattern is a separate safety question — see
 * `MIN_ALIAS_RETRIEVAL_LENGTH`.
 */
export interface CurriculumTermAlias {
  canonical: string;
  alias: string;
  /** Where repository authority attests this relationship. */
  authority: string;
}

/**
 * The curated alias vocabulary. Exactly one entry.
 *
 * SEARCH-005 section 2 writes the relationship verbatim as "AD / Active
 * Directory"; that slash IS the attestation. Nothing else in the repository
 * attests an expansion, so nothing else is listed.
 *
 * A one-entry dictionary is the correct outcome, not an unfinished one. The
 * repository seeds no curriculum content, so there is no corpus from which
 * terminology could be derived, and padding this table with well-known industry
 * expansions would be importing general knowledge that no product authority has
 * approved. Adding a reviewed entry later is an append — no redesign.
 */
export const CURATED_CURRICULUM_TERM_ALIASES: readonly CurriculumTermAlias[] = [
  {
    canonical: "Active Directory",
    alias: "AD",
    authority: "SEARCH-005 section 2 — “AD / Active Directory”"
  }
];

/**
 * Alias relationships attested only as acronyms, whose expansions no repository
 * authority establishes.
 *
 * Recorded so the deferral is reviewable and so a future contributor does not
 * mistake it for a judgement about technical correctness. These become eligible
 * when approved Curriculum content defines the relationship, an approved Search
 * terminology specification defines it, or the Founder approves a broader
 * vocabulary source.
 */
export const DEFERRED_TERM_ALIAS_CANDIDATES: readonly {
  alias: string;
  proposedCanonical: string;
  reason: string;
}[] = [
  {
    alias: "RTO",
    proposedCanonical: "Recovery Time Objective",
    reason:
      "The acronym is attested by SEARCH-005 section 2 and SEARCH-002 section 2, but no repository authority establishes the expanded form as an approved relationship."
  },
  {
    alias: "RPO",
    proposedCanonical: "Recovery Point Objective",
    reason:
      "The acronym is attested by SEARCH-005 section 2, but no repository authority establishes the expanded form as an approved relationship."
  },
  {
    alias: "IAM",
    proposedCanonical: "Identity and Access Management",
    reason:
      "The acronym is attested by SEARCH-005 section 2 and SEARCH-002 section 2, but no repository authority establishes the expanded form as an approved relationship."
  }
];

/**
 * The shortest alias that may become a retrieval pattern.
 *
 * SEARCH-002 matches by substring ILIKE, so a two-character pattern such as
 * `%AD%` also matches "administration", "advanced", "upload", "read" and
 * "broadcast" — and CURR-002 names "Windows administration" as a curriculum
 * domain. SEARCH-005 section 6 excludes "aggressive synonym expansion that
 * changes meaning" and section 13 requires avoiding unsafe query expansion, so
 * emitting that pattern is forbidden by the Feature's own scope.
 *
 * The relationship stays bidirectional in the vocabulary. Only its emission as
 * a retrieval pattern is gated, so a short alias becomes usable automatically if
 * an approved token-aware matching mechanism ever exists. SEARCH-005A does not
 * introduce one, and does not change SEARCH-002 matching semantics.
 */
export const MIN_ALIAS_RETRIEVAL_LENGTH = 3;

/** Maximum effective retrieval variants, INCLUDING the original query. */
export const MAX_CURRICULUM_QUERY_VARIANTS = 4;

/**
 * How a result matched. Internal ordering metadata only.
 *
 * Never learner-visible per result, never written to a `SearchDocument`. The
 * array order IS the tier order.
 *
 * `typo` was added by SEARCH-005B and is the LAST tier: a recovered match can
 * never outrank an exact, normalized or alias match. Extending this array is
 * what extends `CurriculumQueryAdjustment.adjustmentKind`, so the adjustment
 * contract gained a value without changing shape.
 */
export const CURRICULUM_MATCH_KINDS = [
  "exact",
  "normalized",
  "alias",
  "typo"
] as const;

export type CurriculumMatchKind = (typeof CURRICULUM_MATCH_KINDS)[number];

export interface CurriculumQueryVariant {
  value: string;
  matchKind: CurriculumMatchKind;
}

/**
 * Strips clearly terminal sentence punctuation and surrounding quotes.
 *
 * Ends only. Never internal. `kubectl?` becomes `kubectl`, while
 * `index=botsv3`, `Get-ADUser`, `terraform plan` and `show vlan brief` pass
 * through byte-identical.
 */
export function normalizeTerminalPunctuation(query: string): string {
  let result = query.trim();

  for (const [open, close] of PAIRED_QUOTES) {
    if (
      result.length >= 2 &&
      result.startsWith(open) &&
      result.endsWith(close)
    ) {
      result = result.slice(1, -1).trim();
    }
  }

  while (
    result.length > 0 &&
    REMOVABLE_TERMINAL_PUNCTUATION.includes(result[result.length - 1] ?? "")
  ) {
    result = result.slice(0, -1).trimEnd();
  }

  while (
    result.length > 0 &&
    REMOVABLE_TERMINAL_PUNCTUATION.includes(result[0] ?? "")
  ) {
    result = result.slice(1).trimStart();
  }

  return result;
}

/** Whitespace-separated tokens, lowercased for comparison only. */
function tokensOf(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== "");
}

/**
 * True when the query's tokens contain the phrase's tokens contiguously.
 *
 * TOKEN-BASED, never substring. This is what stops `Get-ADUser` and `ADD` from
 * being read as the acronym `AD`: those are single tokens that are not equal to
 * `ad`, and no substring comparison is ever performed here.
 */
export function containsTokenSequence(query: string, phrase: string): boolean {
  const haystack = tokensOf(query);
  const needle = tokensOf(phrase);

  if (needle.length === 0 || needle.length > haystack.length) return false;

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }

  return false;
}

/**
 * Builds the bounded, deterministic set of retrieval variants for a query.
 *
 * Priority, which is also the tier order:
 *
 *   1. the ORIGINAL query — always variant 1, never displaced
 *   2. the terminal-punctuation-normalized query, if it materially differs
 *   3. approved aliases, in vocabulary declaration order
 *
 * Duplicates collapse before the cap. Overflow truncates by declaration order —
 * never sampled, never randomized. Token order in the query cannot change the
 * variant set. There is no combinatorial or Cartesian expansion: each alias
 * contributes at most one variant, built from the ORIGINAL query rather than
 * from another variant, so variants can never compound.
 *
 * The cap is a maximum, not a target. With today's one-entry vocabulary a real
 * query produces one or two variants.
 */
export function buildCurriculumQueryVariants(
  query: string
): CurriculumQueryVariant[] {
  const original = query.trim();
  if (original === "") return [];

  const variants: CurriculumQueryVariant[] = [
    { value: original, matchKind: "exact" }
  ];

  const seen = new Set<string>([original.toLowerCase()]);

  const add = (value: string, matchKind: CurriculumMatchKind): void => {
    const candidate = value.trim();
    if (candidate === "") return;
    if (candidate.length < MIN_ALIAS_RETRIEVAL_LENGTH && matchKind === "alias") {
      return;
    }
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    if (variants.length >= MAX_CURRICULUM_QUERY_VARIANTS) return;
    seen.add(key);
    variants.push({ value: candidate, matchKind });
  };

  add(normalizeTerminalPunctuation(original), "normalized");

  // Alias detection runs against the punctuation-normalized form so that a
  // trailing "?" cannot hide an approved acronym, but every emitted variant is
  // the vocabulary's own term rather than a rewrite of the learner's query.
  const detectionSource = normalizeTerminalPunctuation(original);

  for (const entry of CURATED_CURRICULUM_TERM_ALIASES) {
    if (containsTokenSequence(detectionSource, entry.alias)) {
      add(entry.canonical, "alias");
    }
    if (containsTokenSequence(detectionSource, entry.canonical)) {
      add(entry.alias, "alias");
    }
  }

  return variants;
}

/**
 * Classifies how one already-authorized result matched.
 *
 * Returns the HIGHEST-priority variant that appears in the text, so a result
 * that satisfies both the exact query and an alias is exact. An unclassifiable
 * result falls to the LAST tier rather than the first, so nothing can reach the
 * top of the list by failing to classify.
 *
 * Runs on results that are already authorized, already permission-checked and
 * already version-resolved. It reads only text the caller may already see.
 */
export function classifyCurriculumMatch(
  text: string,
  variants: readonly CurriculumQueryVariant[]
): CurriculumMatchKind {
  const haystack = text.toLowerCase();

  for (const kind of CURRICULUM_MATCH_KINDS) {
    for (const variant of variants) {
      if (variant.matchKind !== kind) continue;
      if (haystack.includes(variant.value.toLowerCase())) return kind;
    }
  }

  return CURRICULUM_MATCH_KINDS[CURRICULUM_MATCH_KINDS.length - 1] as CurriculumMatchKind;
}

export interface ClassifiedSearchDocument {
  document: SearchDocument;
  matchKind: CurriculumMatchKind;
}

/**
 * Orders by match class, then bounds — SEARCH-005A's only ordering change.
 *
 * SEARCH-002's neutral deterministic order is applied FIRST and preserved
 * WITHIN each tier: the tier pass is a stable sort keyed solely on the tier
 * index, so two results in the same tier keep exactly the order SEARCH-002
 * gave them. With every result in one tier the output is byte-identical to
 * SEARCH-002.
 *
 * Tiering happens BEFORE the limit is applied, so an exact match cannot be
 * truncated away in favour of an alias match.
 *
 * There is no numeric value here. The comparator subtracts two vocabulary
 * indices; it consults no score, weight, boost, freshness, competency, context,
 * popularity or history. This is match-class tiering, not SEARCH-008 ranking.
 */
export function buildTieredCurriculumSearchResults(
  classified: readonly ClassifiedSearchDocument[],
  limit: number
): CurriculumSearchResults {
  const kindOf = new Map<string, CurriculumMatchKind>();
  for (const entry of classified) {
    kindOf.set(entry.document.documentId, entry.matchKind);
  }

  const neutral = orderCurriculumSearchResults(
    classified.map((entry) => entry.document)
  );

  const tierOf = (document: SearchDocument): number =>
    CURRICULUM_MATCH_KINDS.indexOf(
      kindOf.get(document.documentId) ?? "alias"
    );

  const tiered = [...neutral].sort((a, b) => tierOf(a) - tierOf(b));
  const bounded = tiered.slice(0, limit);

  return { results: bounded, count: bounded.length };
}

/**
 * What the learner is told about an adjustment.
 *
 * Deliberately minimal. `effectiveQuery` names the single meaningful adjustment,
 * never the internal variant array. There is no retrieval pattern, ILIKE
 * pattern, variant priority, candidate count, hidden alternative, edit distance,
 * ranking internal or diagnostic anywhere in this shape.
 */
export interface CurriculumQueryAdjustment {
  originalQuery: string;
  effectiveQuery: string;
  adjustmentKind: Exclude<CurriculumMatchKind, "exact">;
}

/**
 * Describes the one meaningful adjustment, or nothing.
 *
 * An alias adjustment outranks a punctuation adjustment because it is the one a
 * learner would recognise. When nothing meaningful changed — the common case —
 * this returns undefined and the response carries no adjustment at all.
 */
export function buildCurriculumQueryAdjustment(
  originalQuery: string,
  variants: readonly CurriculumQueryVariant[]
): CurriculumQueryAdjustment | undefined {
  const alias = variants.find((variant) => variant.matchKind === "alias");
  if (alias) {
    return {
      originalQuery,
      effectiveQuery: alias.value,
      adjustmentKind: "alias"
    };
  }

  const normalized = variants.find(
    (variant) => variant.matchKind === "normalized"
  );
  if (normalized) {
    return {
      originalQuery,
      effectiveQuery: normalized.value,
      adjustmentKind: "normalized"
    };
  }

  return undefined;
}

/** The learner-facing sentence. Names both terms and claims nothing else. */
export function describeCurriculumQueryAdjustment(
  adjustment: CurriculumQueryAdjustment
): string {
  return `Searching for “${adjustment.originalQuery}” and “${adjustment.effectiveQuery}”.`;
}

/**
 * The learner-facing result set, with the optional adjustment attached.
 *
 * `count` keeps its SEARCH-002 meaning and no new total joins it.
 */
export interface CurriculumAdjustedSearchResults extends CurriculumSearchResults {
  queryAdjustment?: CurriculumQueryAdjustment;
}

/** Attaches the adjustment, omitting it entirely when there is none. */
export function withCurriculumQueryAdjustment<T extends CurriculumSearchResults>(
  results: T,
  adjustment: CurriculumQueryAdjustment | undefined
): T & CurriculumAdjustedSearchResults {
  return {
    ...results,
    ...(adjustment ? { queryAdjustment: adjustment } : {})
  };
}

/**
 * Fields that must never appear in query-adjustment metadata.
 *
 * Held as data so the tests and the verifier assert the prohibition directly.
 */
export const SEARCH_TERM_FORBIDDEN_FIELDS: readonly string[] = [
  "editDistance",
  "variants",
  "patterns",
  "ilikePattern",
  "candidateCount",
  "hiddenAlternatives",
  "matchKind",
  "score",
  "weight"
];
