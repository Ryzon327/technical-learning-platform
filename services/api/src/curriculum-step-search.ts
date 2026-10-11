import {
  AppError,
  buildCurriculumMatchSnippet,
  compactCurriculumMatchText,
  decideFromAuthoritativeRead,
  type CurriculumMatchTrailEntry,
  type CurriculumQueryVariant,
  type CurriculumSearchCandidate,
  type CurriculumSearchMatchLocation,
  type SearchDocument,
  type SearchPermissionedCandidate
} from "@tlp/shared-types";
import { findFirstMatch, type RetrievalPattern } from "./search-aliases";
import type { createUserScopedSupabaseClient } from "./supabase";

/**
 * WP-005 — searching the bodies of published mission steps, and saying where a
 * result matched.
 *
 * ## What is searched
 *
 * Only the learner-visible prose fields of a step, listed in
 * `SEARCHABLE_STEP_TEXT_FIELDS`. Fields the learner projection withholds or
 * that carry answers — a prediction's expected outcome, near-transfer
 * questions and their authored answers, interaction parameters — are listed in
 * `UNSEARCHED_STEP_FIELDS` and never reach a pattern or a snippet.
 *
 * ## Matching and pagination live in PostgreSQL (Founder direction G-001)
 *
 * `supabase/migrations/20261011000100_curriculum_step_search_functions.sql`
 * defines two read-only, SECURITY INVOKER functions:
 *
 *   search_published_mission_steps   matches the decoded searchable text of
 *                                    every step of each mission's CURRENT
 *                                    published version, and returns one row per
 *                                    matching mission: its earliest matching
 *                                    step, with the mission and course
 *   published_mission_contexts       the current published version and course
 *                                    of missions found by their own record
 *
 * Both return rows in mission stable-id order and page by KEYSET: the next page
 * is "after the last stable id received", and reading stops only at an empty
 * page. A page shortened by any server row cap (PostgREST `max-rows`) therefore
 * never ends the read early and never skips a mission. The page size asked for
 * is fixed and small (`STEP_SEARCH_PAGE_SIZE`), not derived from the request.
 *
 * ## Published-only, twice
 *
 * The functions are called through the caller's own RLS-scoped client, handed
 * in by `searchCurriculum`, and run with the caller's role, so the published-
 * only policies on every curriculum table and on `mission_steps` decide what
 * they can see. Each also states the publication requirement itself. Every
 * returned row is then re-checked here: a row whose mission is not published,
 * or that names no published course, is dropped. No service-role client exists
 * on this path.
 *
 * ## What a step match becomes
 *
 * A step is content beneath a mission, not a curriculum node (DEC-054), so a
 * step match surfaces its MISSION. The mission candidate is built from the
 * mission's own published row and then flows through the identical SEARCH-003
 * surfacing, version resolution, SEARCH-004 filtering, classification and
 * SEARCH-008 ranking as every other candidate. A mission matched only through
 * its steps classifies into the last tier, so it ranks after every title,
 * description and alias match.
 *
 * ## Performance approach
 *
 * A sequential scan over the current published steps inside PostgreSQL; see
 * the migration. `curriculum-step-search.db.test.ts` measures it against a real
 * database in CI. No index or extension is added.
 *
 * Learner queries are never persisted or written anywhere. No AI.
 */

/** Learner-visible prose fields of a step payload, by payload key. */
export const SEARCHABLE_STEP_TEXT_FIELDS = [
  "title",
  "paragraphs",
  "caption",
  "textAlternative",
  "command",
  "output",
  "prompt",
  "textEquivalent",
  "framing",
  "label",
  "note"
] as const;

/**
 * Payload keys that are never searched or quoted. Answer-bearing, withheld by
 * the learner projection at some support levels, or identifiers.
 */
export const UNSEARCHED_STEP_FIELDS = [
  "expectedOutcome",
  "options",
  "questions",
  "parameters",
  "topology",
  "assessmentStableId",
  "assetStableId",
  "interactionStableId",
  "uri"
] as const;

/** The read-only database functions this module calls, and nothing else. */
export const STEP_SEARCH_FUNCTION = "search_published_mission_steps";
export const MISSION_CONTEXT_FUNCTION = "published_mission_contexts";

/**
 * Rows asked for per page. The functions cap a page at 100; Supabase's default
 * PostgREST `max-rows` is 1000. Keyset paging stays correct under any smaller
 * cap, which only costs extra pages.
 */
export const STEP_SEARCH_PAGE_SIZE = 50;

const STEP_LABEL_MAX_LENGTH = 80;

interface StepMatchRow {
  mission_stable_id: string;
  mission_version: number;
  mission_title: string;
  mission_description: string | null;
  mission_publication_state: string;
  mission_updated_at: string;
  course_title: string | null;
  step_stable_id: string;
  step_position: number;
  step_payload: Record<string, unknown> | null;
}

interface MissionContextRow {
  mission_stable_id: string;
  mission_version: number;
  mission_title: string;
  course_title: string | null;
}

/** One published step that matched, ready to be shown as a location. */
export interface StepBodyHit {
  missionStableId: string;
  missionVersion: number;
  stepStableId: string;
  position: number;
  stepLabel: string;
  text: string;
}

/** The published context of one mission: its course, for the trail. */
export interface MissionContext {
  stableId: string;
  version: number;
  title: string;
  courseTitle?: string;
}

export interface StepBodySearchOutcome {
  /** Mission candidates for missions matched in step text. */
  candidates: SearchPermissionedCandidate<CurriculumSearchCandidate>[];
  /** The first matching step of each such mission, keyed by mission stable id. */
  hits: Map<string, StepBodyHit>;
  /** Course context for every mission read, keyed by mission stable id. */
  missions: Map<string, MissionContext>;
}

const unavailable = () =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message: "Curriculum search is unavailable",
    retryable: true
  });

/** The searchable prose of one step, in field order, as one compact string. */
export function stepSearchableText(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const field of SEARCHABLE_STEP_TEXT_FIELDS) {
    const value = payload[field];
    if (typeof value === "string") parts.push(value);
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === "string") parts.push(item);
    }
  }
  return compactCurriculumMatchText(parts.join(" "));
}

/**
 * The step-search function's matching arguments.
 *
 * `patterns` and `variants` are parallel. A whole-word pattern contributes its
 * validated acronym DATA member; every other variant contributes its own
 * trimmed, unescaped text, which the function matches as a plain substring.
 */
export function buildStepSearchArguments(
  patterns: readonly RetrievalPattern[],
  variants: readonly CurriculumQueryVariant[]
): { p_phrases: string[]; p_acronyms: string[] } {
  const phrases: string[] = [];
  const acronyms: string[] = [];
  patterns.forEach((pattern, index) => {
    if (pattern.mode === "word") {
      if (!acronyms.includes(pattern.term)) acronyms.push(pattern.term);
      return;
    }
    // Matching is case-insensitive, so phrases differing only in case are one.
    const value = variants[index]?.value.trim() ?? "";
    const key = value.toLowerCase();
    if (value !== "" && !phrases.some((phrase) => phrase.toLowerCase() === key)) {
      phrases.push(value);
    }
  });
  return { p_phrases: phrases, p_acronyms: acronyms };
}

/** A learner-readable name for a step: its own title or label, else its number. */
export function stepLabelOf(payload: Record<string, unknown>, position: number): string {
  for (const field of ["title", "label"]) {
    const value = payload[field];
    if (typeof value === "string" && value.trim() !== "") {
      const compact = compactCurriculumMatchText(value);
      return compact.length > STEP_LABEL_MAX_LENGTH
        ? `${compact.slice(0, STEP_LABEL_MAX_LENGTH)}…`
        : compact;
    }
  }
  return `Step ${position + 1}`;
}

/**
 * Every row of one keyset-paged function, in stable-id order.
 *
 * Reads until a page comes back empty. A short page is NOT treated as the end,
 * because a server row cap can shorten any page. A page that fails to advance
 * the cursor is refused rather than looped on. Ordering itself is the
 * database's collation order, so it is never re-compared here.
 */
async function readAllPages<Row extends { mission_stable_id: string }>(
  supabase: ReturnType<typeof createUserScopedSupabaseClient>,
  fn: string,
  args: Record<string, unknown>
): Promise<Row[]> {
  const rows: Row[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await supabase.rpc(fn, {
      ...args,
      p_after: after,
      p_page_size: STEP_SEARCH_PAGE_SIZE
    });
    if (error) throw unavailable();
    const page = (data ?? []) as unknown as Row[];
    if (page.length === 0) return rows;

    const last = String(page[page.length - 1]?.mission_stable_id ?? "");
    if (last === "" || last === after) throw unavailable();
    rows.push(...page);
    after = last;
  }
}

/**
 * Finds published missions whose step text matches, and reads the published
 * course context of every mission involved.
 *
 * `patterns` and `variants` are parallel: the same approved variants, as the
 * database matches them and as the snippet locates them.
 */
export async function searchPublishedStepBodies(
  supabase: ReturnType<typeof createUserScopedSupabaseClient>,
  patterns: readonly RetrievalPattern[],
  variants: readonly CurriculumQueryVariant[],
  recordMissionStableIds: readonly string[]
): Promise<StepBodySearchOutcome> {
  const outcome: StepBodySearchOutcome = {
    candidates: [],
    hits: new Map(),
    missions: new Map()
  };

  const stepRows = await readAllPages<StepMatchRow>(
    supabase,
    STEP_SEARCH_FUNCTION,
    buildStepSearchArguments(patterns, variants)
  );

  // Re-check every row the database returned: a published mission with a
  // published course, and a payload object. The first row per mission wins.
  for (const row of stepRows) {
    if (row.mission_publication_state !== "published") continue;
    if (typeof row.course_title !== "string") continue;
    if (!row.step_payload || typeof row.step_payload !== "object") continue;

    const stableId = String(row.mission_stable_id);
    if (outcome.hits.has(stableId)) continue;

    const position = Number(row.step_position);
    outcome.missions.set(stableId, {
      stableId,
      version: Number(row.mission_version),
      title: String(row.mission_title),
      courseTitle: row.course_title
    });
    outcome.hits.set(stableId, {
      missionStableId: stableId,
      missionVersion: Number(row.mission_version),
      stepStableId: String(row.step_stable_id),
      position,
      stepLabel: stepLabelOf(row.step_payload, position),
      text: stepSearchableText(row.step_payload)
    });
    outcome.candidates.push({
      // RLS returning the row IS the authorization; this only records it.
      decision: decideFromAuthoritativeRead({ readFailed: false, found: true }),
      value: {
        contentType: "mission",
        stableId,
        version: Number(row.mission_version),
        title: String(row.mission_title),
        ...(row.mission_description ? { description: row.mission_description } : {}),
        publicationState: row.mission_publication_state,
        updatedAt: row.mission_updated_at
      }
    });
  }

  // The course context of every mission found by its own record, for the trail.
  const unresolved = [...new Set(recordMissionStableIds)]
    .filter((stableId) => !outcome.missions.has(stableId))
    .sort();
  if (unresolved.length > 0) {
    const contextRows = await readAllPages<MissionContextRow>(
      supabase,
      MISSION_CONTEXT_FUNCTION,
      { p_stable_ids: unresolved }
    );
    for (const row of contextRows) {
      const stableId = String(row.mission_stable_id);
      if (!unresolved.includes(stableId) || outcome.missions.has(stableId)) continue;
      outcome.missions.set(stableId, {
        stableId,
        version: Number(row.mission_version),
        title: String(row.mission_title),
        ...(typeof row.course_title === "string" ? { courseTitle: row.course_title } : {})
      });
    }
  }

  return outcome;
}

/**
 * Where one authorized, surfaced result matched.
 *
 * A mission whose own title and description do not match, but one of whose
 * steps does, is located in that step. Everything else is located in its own
 * title, or failing that its description.
 */
export function locateCurriculumMatch(
  candidate: CurriculumSearchCandidate,
  document: SearchDocument,
  variants: readonly CurriculumQueryVariant[],
  steps: StepBodySearchOutcome | undefined
): CurriculumSearchMatchLocation {
  const title = compactCurriculumMatchText(candidate.title);
  const description = compactCurriculumMatchText(candidate.description ?? "");
  const titleMatch = findFirstMatch(title, variants);
  const descriptionMatch = titleMatch ? undefined : findFirstMatch(description, variants);

  const self: CurriculumMatchTrailEntry = {
    kind: candidate.contentType,
    title: candidate.title
  };
  const context =
    candidate.contentType === "mission"
      ? steps?.missions.get(candidate.stableId)
      : undefined;
  const trail: CurriculumMatchTrailEntry[] = [
    ...(context?.courseTitle ? [{ kind: "course" as const, title: context.courseTitle }] : []),
    self
  ];

  const hit =
    candidate.contentType === "mission" ? steps?.hits.get(candidate.stableId) : undefined;

  if (!titleMatch && !descriptionMatch && hit && hit.missionVersion === candidate.version) {
    const stepMatch = findFirstMatch(hit.text, variants);
    return {
      documentId: document.documentId,
      foundIn: "step",
      trail: [...trail, { kind: "step", title: hit.stepLabel }],
      ...(stepMatch
        ? { snippet: buildCurriculumMatchSnippet(hit.text, stepMatch.start, stepMatch.length) }
        : {})
    };
  }

  if (descriptionMatch) {
    return {
      documentId: document.documentId,
      foundIn: "description",
      trail,
      snippet: buildCurriculumMatchSnippet(
        description,
        descriptionMatch.start,
        descriptionMatch.length
      )
    };
  }

  return {
    documentId: document.documentId,
    foundIn: "title",
    trail,
    ...(titleMatch
      ? { snippet: buildCurriculumMatchSnippet(title, titleMatch.start, titleMatch.length) }
      : {})
  };
}
