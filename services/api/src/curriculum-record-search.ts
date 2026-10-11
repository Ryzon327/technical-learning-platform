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
 * Up to `maxRows` published rows of one source whose title or description
 * matches, in stable-id order.
 *
 * A response with an error, or without a rows array, fails the whole read: it
 * is never taken for an empty page. A page that fails to advance the keyset is
 * refused rather than looped on.
 */
export async function searchPublishedCurriculumRecords(
  supabase: ReturnType<typeof createUserScopedSupabaseClient>,
  source: string,
  match: CurriculumRecordMatchArguments,
  maxRows: number
): Promise<CurriculumRecordSearchOutcome> {
  const rows: CurriculumRecordRow[] = [];
  let after: string | null = null;
  while (rows.length < maxRows) {
    const { data, error } = await supabase.rpc(RECORD_SEARCH_FUNCTION, {
      p_source: source,
      p_phrases: match.p_phrases,
      p_acronyms: match.p_acronyms,
      p_after: after,
      p_page_size: Math.min(maxRows - rows.length, RECORD_SEARCH_PAGE_SIZE)
    });
    if (error || !Array.isArray(data)) return failed;
    const page = data as unknown as CurriculumRecordRow[];
    if (page.length === 0) break;

    const last = String(page[page.length - 1]?.stable_id ?? "");
    if (last === "" || last === after) return failed;
    for (const row of page) {
      if (row.publication_state !== "published") continue;
      if (rows.length < maxRows) rows.push(row);
    }
    after = last;
  }
  return { readFailed: false, rows };
}
