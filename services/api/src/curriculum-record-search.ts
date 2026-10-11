import type { createUserScopedSupabaseClient } from "./supabase";

/**
 * WP-005 / Founder direction G-005 — matching curriculum titles and
 * descriptions in PostgreSQL.
 *
 * `supabase/migrations/20261012000100_curriculum_record_search_function.sql`
 * defines `search_published_curriculum_records`, a read-only SECURITY INVOKER
 * function. It matches the title and description of one curriculum source
 * under exactly the rules step bodies use: phrases as case-insensitive
 * substrings, approved acronyms as case-insensitive whole words. Both arrive
 * as ordinary function arguments, never as PostgREST filter syntax.
 *
 * It replaces a direct table read whose whole-word acronym travelled as an
 * `imatch` regular expression inside a PostgREST `or` filter, which returned
 * no row on the UAT project (Founder UAT, G-005).
 *
 * ## Paging
 *
 * The function returns one row per stable identity, at its highest published
 * matching version, in stable-id order, and pages by KEYSET: the next page is
 * "after the last stable id received". A page shortened by a server row cap
 * (PostgREST `max-rows`) therefore never ends the read early. Reading stops at
 * an empty page, or once `maxRows` rows are held: the bounded over-fetch
 * SEARCH-002 has always applied per source.
 *
 * ## Ranked retention
 *
 * Stable-id order is not the learner's order. When the caller passes `rankOf`,
 * the read goes on to the empty page, in pages of at most `maxRows`, and HOLDS
 * the `maxRows` best rows by that rank, then by stable id — so a title match
 * whose stable id sorts after many description matches is never cut off before
 * ranking. The bound still caps every page and what is held, never what is
 * ranked.
 *
 * ## Published-only, twice
 *
 * Called through the caller's own RLS-scoped client, so the published-only
 * policies decide what the function can see; the function also states the
 * publication requirement itself. Every returned row is re-checked here, and
 * a row that is not published is dropped. No service-role client exists on
 * this path, and nothing is written.
 */

/** The read-only database function this module calls, and nothing else. */
export const RECORD_SEARCH_FUNCTION = "search_published_curriculum_records";

/** The function's own page cap. */
export const RECORD_SEARCH_PAGE_SIZE = 100;

export interface CurriculumRecordRow {
  stable_id: string;
  version: number;
  title: string;
  description: string | null;
  publication_state: string;
  updated_at: string;
}

export interface CurriculumRecordMatchArguments {
  p_phrases: string[];
  p_acronyms: string[];
}

/** The rows read, or `readFailed` when any page could not be trusted. */
export type CurriculumRecordSearchOutcome =
  | { readFailed: false; rows: CurriculumRecordRow[] }
  | { readFailed: true; rows: [] };

const failed: CurriculumRecordSearchOutcome = { readFailed: true, rows: [] };

/**
 * A row's place in the caller's order: compared index by index, lower first.
 * Ties fall to the stable id.
 */
export type CurriculumRecordRank = (row: CurriculumRecordRow) => readonly number[];

/**
 * Up to `maxRows` published rows of one source whose title or description
 * matches: in stable-id order, or, with `rankOf`, the best `maxRows` of EVERY
 * match in rank order.
 *
 * A response with an error, or without a rows array, fails the whole read: it
 * is never taken for an empty page. A page that fails to advance the keyset is
 * refused rather than looped on.
 */
export async function searchPublishedCurriculumRecords(
  supabase: ReturnType<typeof createUserScopedSupabaseClient>,
  source: string,
  match: CurriculumRecordMatchArguments,
  maxRows: number,
  rankOf?: CurriculumRecordRank
): Promise<CurriculumRecordSearchOutcome> {
  let held: Array<{ row: CurriculumRecordRow; rank: readonly number[] }> = [];
  let after: string | null = null;
  while (rankOf || held.length < maxRows) {
    const { data, error } = await supabase.rpc(RECORD_SEARCH_FUNCTION, {
      p_source: source,
      p_phrases: match.p_phrases,
      p_acronyms: match.p_acronyms,
      p_after: after,
      p_page_size: Math.min(rankOf ? maxRows : maxRows - held.length, RECORD_SEARCH_PAGE_SIZE)
    });
    if (error || !Array.isArray(data)) return failed;
    const page = data as unknown as CurriculumRecordRow[];
    if (page.length === 0) break;

    const last = String(page[page.length - 1]?.stable_id ?? "");
    if (last === "" || last === after) return failed;
    for (const row of page) {
      if (row.publication_state !== "published") continue;
      if (rankOf) held.push({ row, rank: rankOf(row) });
      else if (held.length < maxRows) held.push({ row, rank: [] });
    }
    if (rankOf) held = held.sort(byRankThenStableId).slice(0, maxRows);
    after = last;
  }
  return { readFailed: false, rows: held.map((entry) => entry.row) };
}

function byRankThenStableId(
  a: { row: CurriculumRecordRow; rank: readonly number[] },
  b: { row: CurriculumRecordRow; rank: readonly number[] }
): number {
  const length = Math.max(a.rank.length, b.rank.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a.rank[index] ?? 0) - (b.rank[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return a.row.stable_id.localeCompare(b.row.stable_id);
}
