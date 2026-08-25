import {
  CURATED_CURRICULUM_TERM_ALIASES,
  PROTECTED_TECHNICAL_TERMS
} from "./search-terms";

/**
 * SEARCH-005B — Bounded Typo Recovery.
 *
 * Recovers a learner from an ordinary typing mistake **only when their query
 * returned nothing**, and only toward a term this repository already approved.
 *
 * ## Why a closed target vocabulary is the safety mechanism
 *
 * SEARCH-005 section 6 excludes "unrestricted fuzzy matching" and "correction
 * that hides exact technical terms". The protection here is not a parser that
 * tries to recognise every technical shape — it is that a correction can only
 * ever produce a term drawn from `PROTECTED_TECHNICAL_TERMS` and the curated
 * alias vocabulary. Correcting TOWARD an approved technical term is safe;
 * correcting AWAY from one is what the specification forbids, and is
 * unreachable because those terms are the only possible outputs.
 *
 * This is why `10.0.0.1`, `--namespace`, `resource_group`, `v1.29` and `443`
 * are safe: nothing within one edit of them exists in the vocabulary. The
 * explicit input exclusions below are defence in depth, not the protection.
 *
 * ## Bounds, all deliberate
 *
 * One edit. One corrected token. One recovered variant. One recovery pass, and
 * only after zero authorized results. Ambiguity is refused rather than guessed.
 * There is no progressive correction, no repeated mutation, no similarity score
 * and no candidate list.
 *
 * ## Zero database access, zero corpus
 *
 * The target vocabulary is derived from static approved data. It is never built
 * from unauthorized, hidden, draft, retired or inaccessible records, from search
 * candidates, from learner behaviour, from analytics, or from result frequency.
 * That is the structural reason a correction cannot leak: it is computable from
 * the learner's own query and a static table alone.
 *
 * ## Not this feature
 *
 * No relevance score, weight, boost, popularity, click history, behavioural,
 * semantic, AI or provider ranking. No general query or refinement suggestions
 * and no fallback navigation — SEARCH-008 owns those. No spelling provider, no
 * model, no dictionary package, no database extension.
 *
 * Pure module: no I/O, no clock, no randomness, no AI.
 */

export const SEARCH_TYPO_MODEL_VERSION = "search-typo-v1";

/** One edit. A single adjacent transposition also counts as one. */
export const TYPO_MAX_EDIT_DISTANCE = 1;

/** General minimum length of an input token eligible for recovery. */
export const TYPO_MIN_TOKEN_LENGTH = 4;

/**
 * The one approved narrow exception to the minimum length.
 *
 * A THREE-character token may recover, but only when it is entirely lowercase
 * letters and the approved target is at least `TYPO_MIN_TOKEN_LENGTH` long. It
 * exists for exactly one shape — `vln` inside `show vln brief` recovering to
 * `show vlan brief`.
 *
 * This is deliberately NOT general short-token fuzzy matching: uppercase
 * acronyms stay excluded, every other bound still applies, and the target must
 * still come from the closed vocabulary.
 */
export const TYPO_SHORT_TOKEN_LENGTH = 3;

/** At most one token in a query may be corrected. */
export const TYPO_MAX_CORRECTED_TOKENS = 1;

/** At most one recovered query variant is ever produced. */
export const TYPO_MAX_RECOVERED_VARIANTS = 1;

/**
 * Input shapes that never enter recovery.
 *
 * Recorded as data so the tests and the verifier assert the prohibition rather
 * than trusting prose.
 */
export const TYPO_EXCLUDED_INPUT_SHAPES: readonly string[] = [
  "uppercase acronym",
  "digit-bearing token",
  "key=value expression",
  "flag",
  "ip address",
  "cidr",
  "port",
  "version string"
];

/**
 * The closed set of correction targets.
 *
 * DERIVED from the already-approved vocabularies rather than restated, so a
 * target can never name something the repository has not approved, and a future
 * approved term becomes a target automatically.
 *
 * Standalone terms are collected before phrase tokens so that a term's own
 * canonical casing wins over the casing it happens to have inside a phrase —
 * `Terraform` rather than the `terraform` of `terraform plan`.
 */
export function buildTypoTargets(): string[] {
  const sources = [
    ...PROTECTED_TECHNICAL_TERMS,
    ...CURATED_CURRICULUM_TERM_ALIASES.flatMap((entry) => [
      entry.canonical,
      entry.alias
    ])
  ];

  const standalone = sources.filter((term) => !/\s/.test(term));
  const phraseTokens = sources
    .filter((term) => /\s/.test(term))
    .flatMap((term) => term.split(/\s+/));

  const targets: string[] = [];
  const seen = new Set<string>();

  for (const term of [...standalone, ...phraseTokens]) {
    const candidate = term.trim();
    if (candidate === "") continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(candidate);
  }

  return targets;
}

export const TYPO_RECOVERY_TARGETS: readonly string[] = buildTypoTargets();

/**
 * True when two strings differ by exactly one edit.
 *
 * Substitution, insertion, deletion, or one adjacent transposition. Comparison
 * is case-insensitive; identical strings return false because a correct token is
 * not a typo.
 *
 * Bounded by construction rather than by a cap on a general algorithm: this
 * cannot express a distance of two, so a distance-2 recovery is unreachable
 * even if every other bound were removed.
 */
export function isWithinOneEdit(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();

  if (left === right) return false;

  const lengthDelta = Math.abs(left.length - right.length);
  if (lengthDelta > TYPO_MAX_EDIT_DISTANCE) return false;

  if (left.length === right.length) {
    let differences = 0;
    let firstDifference = -1;

    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        differences += 1;
        if (firstDifference < 0) firstDifference = index;
        if (differences > 2) return false;
      }
    }

    if (differences === 1) return true;
    if (differences !== 2) return false;

    // Two differences are one edit ONLY as an adjacent transposition.
    const next = firstDifference + 1;
    return (
      next < left.length &&
      left[firstDifference] === right[next] &&
      left[next] === right[firstDifference] &&
      left.slice(next + 1) === right.slice(next + 1)
    );
  }

  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;

  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }

  return true;
}

/**
 * Whether one query token may be considered for recovery at all.
 *
 * Every exclusion protects a shape whose characters carry technical meaning. An
 * uppercase acronym is not a misspelling; a digit-bearing token is an address,
 * port, version or identifier; `=` carries configuration syntax; a leading `-`
 * is a flag.
 */
export function isTypoEligibleToken(token: string): boolean {
  if (token === "") return false;

  // Flags.
  if (token.startsWith("-")) return false;

  // Configuration syntax.
  if (token.includes("=")) return false;

  // Addresses, CIDR, ports, versions and any other digit-bearing identifier.
  if (/\d/.test(token)) return false;

  // Acronyms. `AD`, `RTO` and `IAM` are terms, not misspellings.
  if (token === token.toUpperCase() && /[A-Z]/.test(token)) return false;

  if (token.length >= TYPO_MIN_TOKEN_LENGTH) return true;

  // The narrow three-character exception: lowercase letters only.
  return (
    token.length === TYPO_SHORT_TOKEN_LENGTH && /^[a-z]+$/.test(token)
  );
}

/**
 * The single approved target for a token, or nothing.
 *
 * Returns nothing when the token is ineligible, when no target is within one
 * edit, or when MORE THAN ONE target is — ambiguity fails safely rather than
 * being resolved by array order, iteration order, popularity, frequency or any
 * other tie-break.
 */
export function findSingleTypoTarget(
  token: string,
  targets: readonly string[] = TYPO_RECOVERY_TARGETS
): string | undefined {
  if (!isTypoEligibleToken(token)) return undefined;

  // A token that IS an approved term is never a typo, however close some OTHER
  // approved term happens to be. Without this, `plan` inside `terraform plan`
  // would be "corrected" to `vlan`, corrupting an already-correct protected
  // technical term — exactly what SEARCH-005 section 6 forbids.
  const lowered = token.toLowerCase();
  if (targets.some((target) => target.toLowerCase() === lowered)) {
    return undefined;
  }

  const matches: string[] = [];

  for (const target of targets) {
    if (!isWithinOneEdit(token, target)) continue;

    // The short-token exception may only reach a full-length target.
    if (
      token.length === TYPO_SHORT_TOKEN_LENGTH &&
      target.length < TYPO_MIN_TOKEN_LENGTH
    ) {
      continue;
    }

    // Distinct casings of one term are one target, not an ambiguity.
    if (matches.some((found) => found.toLowerCase() === target.toLowerCase())) {
      continue;
    }

    matches.push(target);
    if (matches.length > 1) return undefined;
  }

  return matches[0];
}

/**
 * What a successful recovery produced. Internal until the service decides the
 * recovered query actually returned results.
 */
export interface CurriculumTypoRecovery {
  originalQuery: string;
  correctedQuery: string;
}

/**
 * Builds at most one corrected query, or nothing.
 *
 * Exactly one token may change. If two or more tokens would need correcting the
 * query is left alone, because correcting several tokens materially changes the
 * learner's intent — which SEARCH-005 section 15 forbids.
 */
export function buildCurriculumTypoRecovery(
  query: string
): CurriculumTypoRecovery | undefined {
  const original = query.trim();
  if (original === "") return undefined;

  const tokens = original.split(/\s+/);
  const corrected = [...tokens];
  let correctedCount = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const target = findSingleTypoTarget(tokens[index] ?? "");
    if (!target) continue;

    correctedCount += 1;
    if (correctedCount > TYPO_MAX_CORRECTED_TOKENS) return undefined;
    corrected[index] = target;
  }

  if (correctedCount === 0) return undefined;

  const correctedQuery = corrected.join(" ");
  if (correctedQuery.toLowerCase() === original.toLowerCase()) return undefined;

  return { originalQuery: original, correctedQuery };
}

/**
 * Fields a typo recovery must never expose to a learner.
 *
 * Held as data so the tests and the verifier assert the prohibition directly.
 */
export const SEARCH_TYPO_FORBIDDEN_FIELDS: readonly string[] = [
  "editDistance",
  "distance",
  "candidates",
  "candidateCount",
  "alternatives",
  "confidence",
  "similarity",
  "matchKind",
  "score",
  "weight"
];

/** The learner-facing sentence when the original query found nothing. */
export function describeCurriculumTypoRecovery(recovery: {
  originalQuery: string;
  correctedQuery: string;
}): string {
  return `No results for “${recovery.originalQuery}”. Showing results for “${recovery.correctedQuery}”.`;
}

/** The control returning the learner to their own words. */
export function describeCurriculumOriginalQueryAction(
  originalQuery: string
): string {
  return `Search for “${originalQuery}” instead`;
}

/** What the learner sees after choosing their original query. */
export function describeCurriculumOriginalQueryEmptyState(
  originalQuery: string
): string {
  return `No results for “${originalQuery}”.`;
}
