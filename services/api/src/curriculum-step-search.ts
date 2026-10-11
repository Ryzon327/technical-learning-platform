import {
  AppError,
  MISSION_STEP_TYPES,
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
import {
  buildRetrievalConditions,
  findFirstMatch,
  type RetrievalPattern
} from "./search-aliases";
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
 * ## Published-only, twice
 *
 * Reads go through the caller's own RLS-scoped client, handed in by
 * `searchCurriculum`. `mission_steps` is readable only when its owning mission
 * is published (DEC-054), and every curriculum node is readable only when
 * published. On top of that, each query states the publication requirement,
 * and every returned row is re-checked here: a step whose mission is not
 * published, or whose mission is not the highest published version, is
 * dropped. No service-role client exists on this path.
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
 * Matching runs in PostgreSQL at query time: escaped `ILIKE` for phrases and a
 * whole-word `~*` pattern for acronyms, over the JSON text fields of published
 * steps. Steps are read in deterministic pages of `limit * 4` rows until
 * `limit` distinct missions have a match in their current published version,
 * or the matches run out, so repeated or stale matches can never crowd out
 * another mission. At the current content size (two courses,
 * a few hundred steps) a sequential scan is well inside the 500 ms budget, so
 * no index, extension or migration is added. If content grows by orders of
 * magnitude, a trigram or full-text index is the next step and would need its
 * own approved migration.
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

const STEP_LABEL_MAX_LENGTH = 80;

interface StepRow {
  stable_id: string;
  position: number;
  step_type: string;
  payload: Record<string, unknown> | null;
  missions: { stable_id: string; version: number; publication_state: string } | null;
}

interface MissionRow {
  stable_id: string;
  version: number;
  title: string;
  description: string | null;
  publication_state: string;
  updated_at: string;
  learning_modules: {
    courses: { stable_id: string; title: string; publication_state: string } | null;
  } | null;
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
 * The highest published version, with its published course context, of every
 * requested mission.
 *
 * Every published version row of the requested missions is read, in
 * deterministic pages, until the rows run out. No cap is shared across
 * missions, so a mission with many versions can never crowd another out.
 * Embedded resources are inner joins, so a mission whose module or course is
 * not readable to this caller is not returned at all.
 */
async function readHighestPublishedMissions(
  supabase: ReturnType<typeof createUserScopedSupabaseClient>,
  stableIds: readonly string[]
): Promise<Map<string, MissionRow>> {
  const highest = new Map<string, MissionRow>();
  const pageSize = stableIds.length * 4;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("missions")
      .select(
        "stable_id,version,title,description,publication_state,updated_at,learning_modules!inner(courses!inner(stable_id,title,publication_state))"
      )
      .in("stable_id", stableIds)
      .eq("publication_state", "published")
      .order("stable_id", { ascending: true })
      .order("version", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw unavailable();
    const rows = (data ?? []) as unknown as MissionRow[];

    for (const row of rows) {
      if (row.publication_state !== "published") continue;
      if (!stableIds.includes(row.stable_id)) continue;
      const incumbent = highest.get(row.stable_id);
      if (!incumbent || row.version > incumbent.version) highest.set(row.stable_id, row);
    }

    if (rows.length < pageSize) return highest;
  }
}

/**
 * Finds published missions whose step text matches, and reads the published
 * course context of every mission involved.
 *
 * `patterns` and `variants` are parallel: the same approved variants, as the
 * database will match them and as this module re-checks them.
 */
export async function searchPublishedStepBodies(
  supabase: ReturnType<typeof createUserScopedSupabaseClient>,
  patterns: readonly RetrievalPattern[],
  variants: readonly CurriculumQueryVariant[],
  recordMissionStableIds: readonly string[],
  limit: number
): Promise<StepBodySearchOutcome> {
  const stepConditions = buildRetrievalConditions(
    SEARCHABLE_STEP_TEXT_FIELDS.map((field) => `payload->>${field}`),
    patterns
  );

  const highest = new Map<string, MissionRow>();
  const resolved = new Set<string>();
  const resolve = async (stableIds: readonly string[]) => {
    const fresh = [...new Set(stableIds)].filter((id) => !resolved.has(id)).sort();
    if (fresh.length === 0) return;
    for (const id of fresh) resolved.add(id);
    for (const [stableId, row] of await readHighestPublishedMissions(supabase, fresh)) {
      highest.set(stableId, row);
    }
  };
  const isCurrent = (hit: StepBodyHit): boolean => {
    const row = highest.get(hit.missionStableId);
    return (
      row !== undefined &&
      row.version === hit.missionVersion &&
      row.learning_modules?.courses?.publication_state === "published"
    );
  };

  // Deterministic pages, bounded at the distinct-mission level: reading stops
  // once `limit` missions have a match in their CURRENT published version, or
  // when the matches run out. Many matching steps in one mission, or matches in
  // a stale version, therefore cannot use up the budget of another mission.
  const pageSize = limit * 4;
  const matched: StepBodyHit[] = [];
  const eligible = new Set<string>();
  for (let offset = 0; ; offset += pageSize) {
    const { data: stepData, error: stepError } = await supabase
      .from("mission_steps")
      .select(
        "stable_id,position,step_type,payload,missions!inner(stable_id,version,publication_state)"
      )
      .eq("missions.publication_state", "published")
      .or(stepConditions)
      .order("mission_id", { ascending: true })
      .order("position", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (stepError) throw unavailable();
    const rows = (stepData ?? []) as unknown as StepRow[];

    // Re-check every row the database returned: published owner, a known step
    // type, and a real match in a searchable field.
    const pageHits: StepBodyHit[] = [];
    for (const row of rows) {
      if (row.missions?.publication_state !== "published") continue;
      if (!(MISSION_STEP_TYPES as readonly string[]).includes(row.step_type)) continue;
      if (!row.payload || typeof row.payload !== "object") continue;

      const text = stepSearchableText(row.payload);
      if (!findFirstMatch(text, variants)) continue;

      pageHits.push({
        missionStableId: String(row.missions.stable_id),
        missionVersion: Number(row.missions.version),
        stepStableId: String(row.stable_id),
        position: Number(row.position),
        stepLabel: stepLabelOf(row.payload, Number(row.position)),
        text
      });
    }

    await resolve(pageHits.map((hit) => hit.missionStableId));
    for (const hit of pageHits) {
      matched.push(hit);
      if (isCurrent(hit)) eligible.add(hit.missionStableId);
    }

    if (eligible.size >= limit || rows.length < pageSize) break;
  }

  // The course context of every mission found by its own record, for the trail.
  await resolve(recordMissionStableIds);

  const outcome: StepBodySearchOutcome = {
    candidates: [],
    hits: new Map(),
    missions: new Map()
  };

  for (const [stableId, row] of highest) {
    const course = row.learning_modules?.courses;
    outcome.missions.set(stableId, {
      stableId,
      version: Number(row.version),
      title: String(row.title),
      ...(course && course.publication_state === "published"
        ? { courseTitle: String(course.title) }
        : {})
    });
  }

  // Deterministic: the earliest matching step of the CURRENT published version.
  matched.sort(
    (a, b) =>
      a.missionStableId.localeCompare(b.missionStableId) || a.position - b.position
  );
  for (const hit of matched) {
    const row = highest.get(hit.missionStableId);
    const course = row?.learning_modules?.courses;
    if (!row || row.version !== hit.missionVersion) continue;
    if (!course || course.publication_state !== "published") continue;
    if (outcome.hits.has(hit.missionStableId)) continue;

    outcome.hits.set(hit.missionStableId, hit);
    outcome.candidates.push({
      // RLS returning the row IS the authorization; this only records it.
      decision: decideFromAuthoritativeRead({ readFailed: false, found: true }),
      value: {
        contentType: "mission",
        stableId: row.stable_id,
        version: Number(row.version),
        title: String(row.title),
        ...(row.description ? { description: row.description } : {}),
        publicationState: row.publication_state,
        updatedAt: row.updated_at
      }
    });
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
