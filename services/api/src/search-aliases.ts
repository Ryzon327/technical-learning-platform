import { readFileSync } from "node:fs";
import {
  MAX_CURRICULUM_QUERY_VARIANTS,
  buildCurriculumQueryVariants,
  normalizeTerminalPunctuation,
  type CurriculumQueryVariant
} from "@tlp/shared-types";

/**
 * WP-005 — the reviewed acronym alias data set, and the matching rules it needs.
 *
 * ## The data is data
 *
 * Alias groups live in `services/api/data/search-acronym-aliases.json`, a
 * checked-in, reviewable file. Extending the set is a data change: add a group
 * or a member there. Nothing here names a term. The file is read on the server
 * only; the browser never receives it and performs no matching.
 *
 * ## Equivalence
 *
 * Every member of a group is equivalent to every other member, in both
 * directions. When the WHOLE query (ignoring case, terminal punctuation and a
 * trailing plural or possessive) is a member of a group, the other members are
 * searched too. A query that merely CONTAINS a member is not widened by this
 * set; that keeps "ARP cache" from becoming every page about address
 * resolution. SEARCH-005A's own curated relationship and its token-based
 * detection run first and are unchanged.
 *
 * ## Matching rules
 *
 *   acronym term     whole words only, case-insensitive, with an optional
 *                    plural "s" — so `ARP` matches "ARP", "arp" and "ARPs", and
 *                    never "sharp". A possessive ("ARP's") already ends the word
 *                    at the apostrophe.
 *   any other term   the existing escaped, case-insensitive substring match,
 *                    which already finds a phrase with a plural or possessive
 *                    ending ("Address Resolution Protocols").
 *
 * An acronym term is a data member with no space and at least two capital
 * letters. Its database pattern is built from the DATA member, never from the
 * learner's text, and only after the member is proved to be letters and digits
 * alone — so no learner input can reach a regular expression.
 *
 * No AI. No index. No database extension.
 */

export interface SearchAliasGroup {
  members: readonly string[];
  source: string;
}

export interface SearchAliasDataSet {
  dataSet: string;
  version: number;
  groups: readonly SearchAliasGroup[];
}

export const SEARCH_ALIAS_DATA_FILE = new URL(
  "../data/search-acronym-aliases.json",
  import.meta.url
);

/**
 * A group may hold at most three members, so the learner's query plus every
 * other member of its group always fits within SEARCH-005A's variant cap even
 * when a normalized variant is also present.
 */
export const MAX_SEARCH_ALIAS_GROUP_MEMBERS = MAX_CURRICULUM_QUERY_VARIANTS - 1;

/** Letters and digits, single spaces or hyphens between words. */
const MEMBER_SHAPE = /^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/;

/** The only shape an acronym pattern is ever built from. */
const ACRONYM_SHAPE = /^[A-Za-z0-9]+$/;

function memberKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** True for a data member that matches as a whole word. */
export function isAcronymTerm(member: string): boolean {
  return ACRONYM_SHAPE.test(member) && (member.match(/[A-Z]/g) ?? []).length >= 2;
}

export type SearchAliasValidation =
  | { valid: true; dataSet: SearchAliasDataSet }
  | { valid: false; errors: string[] };

/**
 * Validates the whole data set. Every rule is objective; every failure names
 * the group it came from.
 */
export function validateSearchAliasDataSet(raw: unknown): SearchAliasValidation {
  const errors: string[] = [];
  const record = raw as Partial<SearchAliasDataSet> | null;

  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["the alias data set is not an object"] };
  }
  if (typeof record.dataSet !== "string" || record.dataSet.trim() === "") {
    errors.push("dataSet must be a non-empty string");
  }
  if (!Number.isInteger(record.version) || (record.version ?? 0) < 1) {
    errors.push("version must be a positive integer");
  }
  if (!Array.isArray(record.groups) || record.groups.length === 0) {
    errors.push("groups must be a non-empty array");
    return { valid: false, errors };
  }

  const seen = new Map<string, number>();
  record.groups.forEach((group, index) => {
    const label = `group ${index + 1}`;
    if (!group || typeof group !== "object") {
      errors.push(`${label} is not an object`);
      return;
    }
    if (typeof group.source !== "string" || group.source.trim() === "") {
      errors.push(`${label} has no source`);
    }
    if (!Array.isArray(group.members)) {
      errors.push(`${label} has no members array`);
      return;
    }
    if (group.members.length < 2) {
      errors.push(`${label} needs at least two members`);
    }
    if (group.members.length > MAX_SEARCH_ALIAS_GROUP_MEMBERS) {
      errors.push(
        `${label} has ${group.members.length} members; at most ${MAX_SEARCH_ALIAS_GROUP_MEMBERS} are allowed`
      );
    }
    for (const member of group.members) {
      if (typeof member !== "string" || !MEMBER_SHAPE.test(member)) {
        errors.push(`${label} has a member outside the allowed shape: ${String(member)}`);
        continue;
      }
      const key = memberKey(member);
      const owner = seen.get(key);
      if (owner !== undefined) {
        errors.push(
          `${label} repeats "${member}", already a member of group ${owner + 1}`
        );
        continue;
      }
      seen.set(key, index);
    }
  });

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, dataSet: record as SearchAliasDataSet };
}

/** Reads and validates a data file. An invalid file is refused, never trimmed. */
export function loadSearchAliasDataSet(
  file: URL | string = SEARCH_ALIAS_DATA_FILE
): SearchAliasDataSet {
  const outcome = validateSearchAliasDataSet(
    JSON.parse(readFileSync(file, "utf8"))
  );
  if (!outcome.valid) {
    throw new Error(
      `The search alias data set is invalid: ${outcome.errors.join("; ")}`
    );
  }
  return outcome.dataSet;
}

let approvedDataSet: SearchAliasDataSet | undefined;

/** The checked-in data set, read once per process. */
export function approvedSearchAliasGroups(): readonly SearchAliasGroup[] {
  approvedDataSet ??= loadSearchAliasDataSet();
  return approvedDataSet.groups;
}

/**
 * The group whose member IS the whole query, if any.
 *
 * Tolerates terminal punctuation, case, and one trailing plural or possessive,
 * so "arp", "ARP?", "ARPs" and "ARP's" all resolve to the ARP group.
 */
export function findSearchAliasGroup(
  query: string,
  groups: readonly SearchAliasGroup[] = approvedSearchAliasGroups()
): SearchAliasGroup | undefined {
  const written = normalizeTerminalPunctuation(query).replace(/\s+/g, " ").trim();
  if (written === "") return undefined;

  const exact = groupWithMember(memberKey(written), groups);
  if (exact) return exact;

  // A trailing plural or possessive is dropped only when what remains is still
  // recognisably the same term: an acronym still WRITTEN in capitals ("ARPs",
  // "ARP's"), or a member that is not an acronym ("default gateways"). That
  // keeps an everyday word such as "ads" from resolving to the acronym AD.
  for (const stripped of [written.replace(/['’]s$/, ""), written.replace(/s$/, "")]) {
    if (stripped === written || stripped === "") continue;
    const group = groupWithMember(memberKey(stripped), groups);
    if (!group) continue;
    const member = group.members.find((entry) => memberKey(entry) === memberKey(stripped));
    if (member && (!isAcronymTerm(member) || isAcronymTerm(stripped))) return group;
  }
  return undefined;
}

function groupWithMember(
  key: string,
  groups: readonly SearchAliasGroup[]
): SearchAliasGroup | undefined {
  return groups.find((group) =>
    group.members.some((member) => memberKey(member) === key)
  );
}

/**
 * The retrieval variants for a query: SEARCH-005A's variants first, unchanged,
 * then every other member of the query's alias group, in data order, under the
 * same cap and the same case-insensitive de-duplication.
 */
export function buildAliasAwareQueryVariants(
  query: string,
  groups: readonly SearchAliasGroup[] = approvedSearchAliasGroups()
): CurriculumQueryVariant[] {
  const variants = buildCurriculumQueryVariants(query);
  if (variants.length === 0) return variants;

  const group = findSearchAliasGroup(query, groups);
  if (!group) return variants;

  const seen = new Set(variants.map((variant) => memberKey(variant.value)));
  for (const member of group.members) {
    if (variants.length >= MAX_CURRICULUM_QUERY_VARIANTS) break;
    const key = memberKey(member);
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({ value: member, matchKind: "alias" });
  }
  return variants;
}

/**
 * The acronym data member a variant value names, if it names one.
 *
 * Returns the DATA spelling, which is what any pattern is built from.
 */
export function acronymTermOf(
  value: string,
  groups: readonly SearchAliasGroup[] = approvedSearchAliasGroups()
): string | undefined {
  const key = memberKey(value);
  for (const group of groups) {
    for (const member of group.members) {
      if (memberKey(member) === key && isAcronymTerm(member)) return member;
    }
  }
  return undefined;
}

/**
 * How one variant reaches the database.
 *
 * `substring` carries a value the caller has ALREADY escaped for LIKE.
 * `word` carries a validated acronym data member.
 */
export type RetrievalPattern =
  | { mode: "substring"; value: string }
  | { mode: "word"; term: string };

export function toRetrievalPattern(
  variant: CurriculumQueryVariant,
  escapedValue: string,
  groups: readonly SearchAliasGroup[] = approvedSearchAliasGroups()
): RetrievalPattern {
  const term = acronymTermOf(variant.value, groups);
  return term ? { mode: "word", term } : { mode: "substring", value: escapedValue };
}

/**
 * The PostgreSQL (ARE) whole-word pattern for an acronym: `\y` is a word
 * boundary, and `s?` tolerates a plural. Refuses anything but letters and
 * digits, so the pattern can carry no regular-expression syntax of its own and
 * no PostgREST reserved character.
 */
export function wordPatternFor(term: string): string {
  if (!ACRONYM_SHAPE.test(term)) {
    throw new Error("Only a letters-and-digits acronym may become a word pattern");
  }
  return `\\y${term}s?\\y`;
}

/** One PostgREST `or` condition per column per pattern. */
export function buildRetrievalConditions(
  columns: readonly string[],
  patterns: readonly RetrievalPattern[]
): string {
  return patterns
    .flatMap((pattern) =>
      columns.map((column) =>
        pattern.mode === "word"
          ? `${column}.imatch.${wordPatternFor(pattern.term)}`
          : `${column}.ilike.%${pattern.value}%`
      )
    )
    .join(",");
}

export interface TextMatch {
  start: number;
  length: number;
}

/**
 * Where one variant first matches `text`, under exactly the rule its database
 * pattern used. Runs only on text the caller was already authorized to read.
 */
export function findVariantMatch(
  text: string,
  variant: CurriculumQueryVariant,
  groups: readonly SearchAliasGroup[] = approvedSearchAliasGroups()
): TextMatch | undefined {
  const term = acronymTermOf(variant.value, groups);
  if (term) {
    const found = new RegExp(`\\b${term}s?\\b`, "i").exec(text);
    return found ? { start: found.index, length: found[0].length } : undefined;
  }

  const needle = variant.value.trim().toLowerCase();
  if (needle === "") return undefined;
  const start = text.toLowerCase().indexOf(needle);
  return start < 0 ? undefined : { start, length: needle.length };
}

/** The variants that actually occur in `text`, in their original order. */
export function variantsFoundIn(
  text: string,
  variants: readonly CurriculumQueryVariant[],
  groups: readonly SearchAliasGroup[] = approvedSearchAliasGroups()
): CurriculumQueryVariant[] {
  return variants.filter((variant) => findVariantMatch(text, variant, groups));
}

/** The earliest match of any variant; the longer one wins a tie. */
export function findFirstMatch(
  text: string,
  variants: readonly CurriculumQueryVariant[],
  groups: readonly SearchAliasGroup[] = approvedSearchAliasGroups()
): TextMatch | undefined {
  let best: TextMatch | undefined;
  for (const variant of variants) {
    const found = findVariantMatch(text, variant, groups);
    if (!found) continue;
    if (
      !best ||
      found.start < best.start ||
      (found.start === best.start && found.length > best.length)
    ) {
      best = found;
    }
  }
  return best;
}
