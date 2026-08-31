import type {
  CreateCompetencyInput,
  CreateCourseInput,
  CreateMissionInput,
  CreateModuleInput,
  CurriculumPublicationState,
  CurriculumValidationIssue,
  CurriculumValidationResult,
  MissionCompetencyRelationship,
  MissionStep,
  MissionStepReadOutcome
} from "@tlp/shared-types";
import {
  AppError,
  collectMissionStepAssetReferences,
  findUnresolvedAssetReferences,
  isMissionCompetencyRelationship,
  resolvePersistedMissionSteps,
  validateMissionStep
} from "@tlp/shared-types";
import { readMissionAssets } from "./curriculum-quality";
import { createServerSupabaseClient } from "./supabase";
import { buildLearningPathQualityReport } from "./curriculum-quality";

interface AuthoringContext {
  actorUserId: string;
}

interface NodeRecord {
  id: string;
  stableId: string;
  version: number;
  title: string;
  publicationState: CurriculumPublicationState;
}

function normalizeStableId(value: string): string {
  const stableId = value.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(stableId)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message:
        "Stable ID must be 3-120 lowercase characters using letters, numbers, dot, underscore, or hyphen",
      retryable: false
    });
  }

  return stableId;
}

function normalizeTitle(value: string): string {
  const title = value.trim();

  if (!title) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Title is required",
      retryable: false
    });
  }

  return title;
}

function normalizePosition(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Position must be a non-negative integer",
      retryable: false
    });
  }

  return value;
}

async function nextVersionFor(
  table: string,
  stableId: string
): Promise<number> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(table)
    .select("version")
    .eq("stable_id", stableId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to inspect curriculum versions",
      retryable: true
    });
  }

  return Number(data?.version ?? 0) + 1;
}

/**
 * Refuse to write content belonging to a mission that is not a draft.
 *
 * ## Why this exists
 *
 * `mission_steps`, `curriculum_assets` and `mission_competencies` carry no
 * publication state of their own — they are readable exactly when their owning
 * mission is published. That is the right model for reading, and it leaves a gap
 * for writing: the upserts that author them name only `mission_id`, so nothing
 * in the statement prevents writing content into a published mission.
 *
 * An importer plans against state it read earlier. If a mission is a draft at
 * plan time and is published before the content write lands, the write would
 * silently modify published curriculum — the one invariant this area exists to
 * protect.
 *
 * ## What this is, and what it honestly is not
 *
 * A guard at the write boundary, immediately before the statement rather than
 * once at the start of a long run. It closes the window that matters in
 * practice: a publication happening between planning and execution, which may be
 * seconds or minutes apart.
 *
 * It is **not** atomic. A publication landing between this check and the upsert
 * microseconds later would still slip through. Closing that completely would
 * need the predicate inside the write, which PostgREST cannot express for a
 * child table, or a database function — and WP-G is not authorized to introduce
 * one. The residual is recorded rather than papered over.
 */
async function assertMissionIsDraft(missionId: string): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("missions")
    .select("id,publication_state")
    .eq("id", missionId)
    .maybeSingle();

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to confirm the owning mission's publication state",
      retryable: true
    });
  }

  if (!data) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "The owning mission was not found",
      retryable: false
    });
  }

  if (data.publication_state !== "draft") {
    throw new AppError({
      code: "CONFLICT",
      message:
        "Only content belonging to a draft mission can be authored; the owning mission is no longer a draft",
      retryable: false
    });
  }
}

/**
 * The same guard, exported for the sibling authoring module.
 *
 * `curriculum-quality.ts` owns `addMissionAsset` and needs the identical check.
 * One implementation rather than two, so the rule cannot drift between the
 * operations that write a mission's steps and the ones that write its assets.
 */
export async function assertMissionIsDraftForAuthoring(
  missionId: string
): Promise<void> {
  return assertMissionIsDraft(missionId);
}

export function isValidPublicationTransition(
  from: CurriculumPublicationState,
  to: CurriculumPublicationState
): boolean {
  if (from === to) return true;
  if (from === "draft" && (to === "review" || to === "retired")) return true;
  if (
    from === "review" &&
    (to === "draft" || to === "published" || to === "retired")
  ) {
    return true;
  }
  if (from === "published" && to === "retired") return true;
  if (from === "retired" && to === "draft") return true;

  return false;
}

export async function createDraftLearningPath(
  _context: AuthoringContext,
  input: {
    stableId: string;
    title: string;
    description?: string;
    estimatedMinutes?: number;
  }
): Promise<NodeRecord> {
  const supabase = createServerSupabaseClient();
  const stableId = normalizeStableId(input.stableId);
  const version = await nextVersionFor("learning_paths", stableId);

  const { data, error } = await supabase
    .from("learning_paths")
    .insert({
      stable_id: stableId,
      version,
      title: normalizeTitle(input.title),
      description: input.description?.trim() || null,
      estimated_minutes: input.estimatedMinutes ?? null,
      publication_state: "draft"
    })
    .select("id,stable_id,version,title,publication_state")
    .single();

  if (error || !data) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to create curriculum draft",
      retryable: true
    });
  }

  return {
    id: data.id,
    stableId: data.stable_id,
    version: data.version,
    title: data.title,
    publicationState: data.publication_state
  };
}

export async function updateDraftLearningPath(
  _context: AuthoringContext,
  learningPathId: string,
  input: {
    title?: string;
    description?: string | null;
    estimatedMinutes?: number | null;
  }
): Promise<NodeRecord> {
  const supabase = createServerSupabaseClient();

  const { data: current, error: currentError } = await supabase
    .from("learning_paths")
    .select("id,stable_id,version,title,publication_state")
    .eq("id", learningPathId)
    .single();

  if (currentError || !current) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Learning path was not found",
      retryable: false
    });
  }

  if (current.publication_state !== "draft") {
    throw new AppError({
      code: "CONFLICT",
      message: "Only draft curriculum can be edited",
      retryable: false
    });
  }

  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) patch.title = normalizeTitle(input.title);
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.estimatedMinutes !== undefined) {
    if (input.estimatedMinutes !== null && input.estimatedMinutes < 0) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Estimated minutes cannot be negative",
        retryable: false
      });
    }
    patch.estimated_minutes = input.estimatedMinutes;
  }

  // WP-G. The publication state is part of the statement, not only of the read
  // above.
  //
  // The read/check/write shape this used to have is a check-then-act race:
  // publication is a separate operation, and between the check at line 189 and
  // the write here the path could transition to `published`. The window is small
  // and the consequence is not — published curriculum revised in place.
  //
  // Putting the predicate in the UPDATE means Postgres evaluates it against the
  // row as it exists at write time, which is the only moment that matters. A
  // path published since the read matches no row, and a zero-row result is a
  // refusal rather than a silent success.
  //
  // `maybeSingle` rather than `single`, because zero rows is now an expected
  // outcome that must be distinguished from a transport failure instead of
  // arriving as one.
  const { data, error } = await supabase
    .from("learning_paths")
    .update(patch)
    .eq("id", learningPathId)
    .eq("publication_state", "draft")
    .select("id,stable_id,version,title,publication_state")
    .maybeSingle();

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to update curriculum draft",
      retryable: true
    });
  }

  // The path exists — the read above found it — so no matching row can only mean
  // it stopped being a draft before the write arrived.
  if (!data) {
    throw new AppError({
      code: "CONFLICT",
      message: "Only draft curriculum can be edited",
      retryable: false
    });
  }

  return {
    id: data.id,
    stableId: data.stable_id,
    version: data.version,
    title: data.title,
    publicationState: data.publication_state
  };
}

/**
 * WP-G — the curriculum node tables a draft revision may target.
 *
 * A closed union rather than a string, so a table name can never arrive from
 * authored data or from a caller's variable. No learner-state table is a member
 * and none can become one by passing a different value.
 */
export const UPDATABLE_CURRICULUM_NODE_TABLES = [
  "courses",
  "learning_modules",
  "missions",
  "competencies"
] as const;

export type UpdatableCurriculumNodeTable =
  (typeof UPDATABLE_CURRICULUM_NODE_TABLES)[number];

/**
 * Revise one DRAFT curriculum node in place.
 *
 * ## Why WP-G needs this
 *
 * `createDraft*` always allocates `version = max + 1`, and reconciliation skips
 * any stable id that already exists. Together those meant an edit to authored
 * content could never reach a node that had already been created: re-running an
 * import reported "reuse" and changed nothing. For a course held as compiled
 * constants that was survivable; for curriculum authored as data it makes the
 * pipeline a one-shot.
 *
 * ## Why the publication state is in the WHERE clause
 *
 * The obvious shape — read the row, check it is a draft, then update by id — is
 * a check-then-act race. Publication is a separate operation, and between the
 * read and the write the node could transition to `published`. The window is
 * small and the consequence is not: published curriculum mutated in place,
 * which Architect Decision 1 prohibits outright.
 *
 * So the guard is part of the statement rather than a step before it. The
 * UPDATE matches on `id` **and** `publication_state = 'draft'`, so a node that
 * has been published since the read simply matches no row. Postgres evaluates
 * that predicate against the row as it exists at write time, which is the only
 * moment that matters.
 *
 * The pre-read below is kept, but only to distinguish "no such node" from
 * "not a draft" in the error. It is diagnostic; it is not the guard, and the
 * operation would still be safe without it.
 *
 * A zero-row result is therefore not "nothing to do" — it means the row was not
 * a draft when the write reached it, and it fails closed with CONFLICT.
 */
export async function updateDraftCurriculumNode(
  _context: AuthoringContext,
  table: UpdatableCurriculumNodeTable,
  nodeId: string,
  input: {
    title?: string;
    description?: string | null;
    position?: number;
    estimatedMinutes?: number | null;
  }
): Promise<NodeRecord> {
  const supabase = createServerSupabaseClient();

  const { data: current, error: currentError } = await supabase
    .from(table)
    .select("id,publication_state")
    .eq("id", nodeId)
    .maybeSingle();

  if (currentError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to inspect curriculum draft",
      retryable: true
    });
  }

  if (!current) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Curriculum node was not found",
      retryable: false
    });
  }

  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) patch.title = normalizeTitle(input.title);
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.position !== undefined) {
    patch.position = normalizePosition(input.position);
  }
  if (input.estimatedMinutes !== undefined) {
    if (input.estimatedMinutes !== null && input.estimatedMinutes < 0) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Estimated minutes cannot be negative",
        retryable: false
      });
    }
    patch.estimated_minutes = input.estimatedMinutes;
  }

  // The guard is HERE, in the statement, not in the read above.
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", nodeId)
    .eq("publication_state", "draft")
    .select("id,stable_id,version,title,publication_state")
    .maybeSingle();

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to update curriculum draft",
      retryable: true
    });
  }

  // No row matched the guarded predicate. The node exists — the read above
  // found it — so the only way to reach this is that it was not a draft when
  // the write arrived.
  if (!data) {
    throw new AppError({
      code: "CONFLICT",
      message: "Only draft curriculum can be edited",
      retryable: false
    });
  }

  return {
    id: data.id,
    stableId: data.stable_id,
    version: data.version,
    title: data.title,
    publicationState: data.publication_state
  };
}

/**
 * One explicit learning prerequisite rule as it is stored.
 *
 * `active` is carried because a rule may be deactivated without being removed,
 * and reconciliation must not report a deactivated rule as absent.
 */
export interface PersistedPrerequisiteRule {
  targetNodeType: string;
  targetStableId: string;
  requirementType: string;
  requirementStableId: string;
  explanation: string;
  active: boolean;
}

/**
 * Read the explicit prerequisite rules targeting a set of nodes.
 *
 * Exists so reconciliation can build a complete plan before writing anything,
 * and so a dry run reports create-versus-reuse from what is actually stored
 * rather than guessing. It is the justification for the SELECT verb granted by
 * `20260902000100`.
 */
export async function readPrerequisiteRules(
  targetStableIds: readonly string[]
): Promise<PersistedPrerequisiteRule[]> {
  if (targetStableIds.length === 0) return [];

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_prerequisite_rules")
    .select(
      "target_node_type,target_stable_id,requirement_type,requirement_stable_id,explanation,active"
    )
    .in("target_stable_id", [...targetStableIds]);

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to read prerequisite rules",
      retryable: true
    });
  }

  return (data ?? []).map((row) => ({
    targetNodeType: String(row.target_node_type),
    targetStableId: String(row.target_stable_id),
    requirementType: String(row.requirement_type),
    requirementStableId: String(row.requirement_stable_id),
    explanation: String(row.explanation ?? ""),
    active: row.active === true
  }));
}

/**
 * Author one explicit learning prerequisite rule.
 *
 * ## Why this exists, and why it is small
 *
 * `learning_prerequisite_rules` has been read by `learning-navigation.ts` since
 * Wave 3 and written by nothing. BEGINNER-COMPLETE-1 permits required knowledge
 * to be established by an explicitly declared prerequisite, which is
 * unauthorable while the table has no writer.
 *
 * This is deliberately the smallest operation that closes that: one upsert on
 * the unique key the table already carries. It introduces no second prerequisite
 * system, no evaluation logic and no new table. DEC-055's separation survives
 * intact — `mission_competencies` still answers "what does this mission do with
 * this competency", and this answers "what must already be true before the
 * learner enters this node". Nothing here evaluates a rule;
 * `learning-navigation.ts` remains the sole evaluator and is untouched.
 *
 * `explanation` is `not null` in the schema and required here. A prerequisite
 * the learner is never told about is a barrier, not a declaration.
 *
 * It writes no progress, evidence or competency state and could not: those
 * tables are unreachable from this function, and `record_mission_progress`
 * resolves the learner from `auth.uid()` rather than from any service-role
 * caller.
 */
export async function upsertPrerequisiteRule(
  _context: AuthoringContext,
  rule: {
    targetNodeType: "course" | "module" | "mission";
    targetStableId: string;
    requirementType:
      | "content_completion"
      | "competency"
      | "readiness_assessment"
      | "equivalent_competency";
    requirementStableId: string;
    explanation: string;
  }
): Promise<void> {
  // Validated before the client is created: an unusable rule is a caller error,
  // not a dependency failure, and is reported as one whether or not a database
  // is reachable.
  const targetStableId = normalizeStableId(rule.targetStableId);
  const requirementStableId = normalizeStableId(rule.requirementStableId);
  const explanation = rule.explanation.trim();

  if (!explanation) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A prerequisite rule must explain itself to the learner",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("learning_prerequisite_rules").upsert(
    {
      target_node_type: rule.targetNodeType,
      target_stable_id: targetStableId,
      requirement_type: rule.requirementType,
      requirement_stable_id: requirementStableId,
      explanation,
      active: true
    },
    {
      onConflict:
        "target_node_type,target_stable_id,requirement_type,requirement_stable_id"
    }
  );

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to author prerequisite rule",
      retryable: true
    });
  }
}

export async function createDraftCourse(
  _context: AuthoringContext,
  input: CreateCourseInput
): Promise<NodeRecord> {
  const supabase = createServerSupabaseClient();
  const stableId = normalizeStableId(input.stableId);
  const version = await nextVersionFor("courses", stableId);

  const { data, error } = await supabase
    .from("courses")
    .insert({
      stable_id: stableId,
      version,
      learning_path_id: input.learningPathId,
      title: normalizeTitle(input.title),
      description: input.description?.trim() || null,
      position: normalizePosition(input.position),
      estimated_minutes: input.estimatedMinutes ?? null,
      publication_state: "draft"
    })
    .select("id,stable_id,version,title,publication_state")
    .single();

  if (error || !data) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to create course draft",
      retryable: true
    });
  }

  return {
    id: data.id,
    stableId: data.stable_id,
    version: data.version,
    title: data.title,
    publicationState: data.publication_state
  };
}

export async function createDraftModule(
  _context: AuthoringContext,
  input: CreateModuleInput
): Promise<NodeRecord> {
  const supabase = createServerSupabaseClient();
  const stableId = normalizeStableId(input.stableId);
  const version = await nextVersionFor("learning_modules", stableId);

  const { data, error } = await supabase
    .from("learning_modules")
    .insert({
      stable_id: stableId,
      version,
      course_id: input.courseId,
      title: normalizeTitle(input.title),
      description: input.description?.trim() || null,
      position: normalizePosition(input.position),
      estimated_minutes: input.estimatedMinutes ?? null,
      publication_state: "draft"
    })
    .select("id,stable_id,version,title,publication_state")
    .single();

  if (error || !data) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to create module draft",
      retryable: true
    });
  }

  return {
    id: data.id,
    stableId: data.stable_id,
    version: data.version,
    title: data.title,
    publicationState: data.publication_state
  };
}

export async function createDraftMission(
  _context: AuthoringContext,
  input: CreateMissionInput
): Promise<NodeRecord> {
  const supabase = createServerSupabaseClient();
  const stableId = normalizeStableId(input.stableId);
  const version = await nextVersionFor("missions", stableId);

  const { data, error } = await supabase
    .from("missions")
    .insert({
      stable_id: stableId,
      version,
      module_id: input.moduleId,
      title: normalizeTitle(input.title),
      description: input.description?.trim() || null,
      position: normalizePosition(input.position),
      estimated_minutes: input.estimatedMinutes ?? null,
      publication_state: "draft"
    })
    .select("id,stable_id,version,title,publication_state")
    .single();

  if (error || !data) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to create mission draft",
      retryable: true
    });
  }

  return {
    id: data.id,
    stableId: data.stable_id,
    version: data.version,
    title: data.title,
    publicationState: data.publication_state
  };
}

export async function createDraftCompetency(
  _context: AuthoringContext,
  input: CreateCompetencyInput
): Promise<NodeRecord> {
  const supabase = createServerSupabaseClient();
  const stableId = normalizeStableId(input.stableId);
  const version = await nextVersionFor("competencies", stableId);

  const { data, error } = await supabase
    .from("competencies")
    .insert({
      stable_id: stableId,
      version,
      title: normalizeTitle(input.title),
      description: input.description?.trim() || null,
      publication_state: "draft"
    })
    .select("id,stable_id,version,title,publication_state")
    .single();

  if (error || !data) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to create competency draft",
      retryable: true
    });
  }

  return {
    id: data.id,
    stableId: data.stable_id,
    version: data.version,
    title: data.title,
    publicationState: data.publication_state
  };
}

export async function addCompetencyPrerequisite(
  _context: AuthoringContext,
  competencyId: string,
  prerequisiteCompetencyId: string
): Promise<void> {
  if (competencyId === prerequisiteCompetencyId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "A competency cannot require itself",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("competency_prerequisites")
    .insert({
      competency_id: competencyId,
      prerequisite_competency_id: prerequisiteCompetencyId
    });

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to create competency prerequisite",
      retryable: true
    });
  }
}

/**
 * Link a mission to a competency.
 *
 * WP-B / DEC-055. `relationship` is **required and has no default**: it says
 * whether this mission is accountable for teaching the competency (`develops`)
 * or is deliberately reusing one developed elsewhere (`reinforces`). A default
 * would silently classify links, which is exactly what the column exists to
 * stop — the value has to be an authoring decision.
 *
 * It is orthogonal to `required`, which stays required-versus-supporting within
 * the mission. Neither may be derived from the other.
 *
 * Prerequisites are not expressible here and never will be:
 * `learning_prerequisite_rules` owns "what must be true before this mission",
 * and a third relationship value would be a second, weaker mechanism for it.
 */
export async function linkMissionCompetency(
  _context: AuthoringContext,
  missionId: string,
  competencyId: string,
  required: boolean,
  relationship: MissionCompetencyRelationship
): Promise<void> {
  // Validated BEFORE the client is created: an unclassifiable link is a caller
  // error, not a dependency failure, and it should be reported as one whether
  // or not a database is reachable.
  if (!isMissionCompetencyRelationship(relationship)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message:
        "Mission competency relationship must be 'develops' or 'reinforces'",
      retryable: false
    });
  }

  // Same reason as `upsertMissionStep`: a link carries no publication state, so
  // the owning mission's is the boundary.
  await assertMissionIsDraft(missionId);

  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("mission_competencies")
    .upsert({
      mission_id: missionId,
      competency_id: competencyId,
      required,
      relationship
    });

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to link mission competency",
      retryable: true
    });
  }
}

/* ------------------------------------------------------------------ *
 * WP-C / CURR-010 — ordered instructional steps beneath a mission
 * ------------------------------------------------------------------ */

/**
 * Author one instructional step on an existing mission.
 *
 * Extends the existing curriculum authoring surface rather than adding a
 * parallel administration subsystem: same server client, same `AppError`
 * conventions, same server-authorized write path, same stable-id grammar.
 *
 * **Validated before the client is created.** Invalid instructional content is
 * a caller error, not a dependency failure, and it is reported as one whether
 * or not a database is reachable. Nothing is normalized into validity: a step
 * that does not describe what it claims to describe is refused, because
 * inventing the missing instructional meaning is exactly what a curriculum
 * writer must never do.
 *
 * Upserts on `(mission_id, stable_id)`, so re-running an authoring pass is
 * idempotent rather than creating a second copy of a step.
 */
export async function upsertMissionStep(
  _context: AuthoringContext,
  missionId: string,
  step: MissionStep
): Promise<void> {
  const errors = validateMissionStep(step);

  if (errors.length > 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: `Mission step is not valid instructional content: ${errors.join("; ")}`,
      retryable: false
    });
  }

  if (!missionId.trim()) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Mission step must belong to a mission",
      retryable: false
    });
  }

  // The owning mission must still be a draft. Steps carry no publication state
  // of their own, so without this an upsert would write into published
  // curriculum whenever the mission was published after the caller last looked.
  await assertMissionIsDraft(missionId);

  const supabase = createServerSupabaseClient();

  // `content.type` is the discriminator in the application model and
  // `step_type` is the closed vocabulary in the database. They are written from
  // the SAME value here, which is what makes them agree on the write path;
  // `readMissionSteps` re-checks that they still agree on the read path rather
  // than assuming this was the only writer that ever ran.
  const { error } = await supabase
    .from("mission_steps")
    .upsert(
      {
        mission_id: missionId,
        stable_id: step.stableId,
        position: step.position,
        step_type: step.content.type,
        payload: step.content
      },
      { onConflict: "mission_id,stable_id" }
    );

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to author mission step",
      retryable: true
    });
  }
}

/**
 * Read one mission's authored steps.
 *
 * Narrow by design. WP-E owns learner read-path integration; this exists so
 * publication validation and authoring can see what was written, and so the
 * persistence contract is testable.
 *
 * The integrity check lives in `resolvePersistedMissionSteps`, not here: the
 * persisted `step_type` column and the payload's own `type` are two
 * representations of one fact, and a disagreement between them is resolved by
 * failing rather than by picking a winner. Keeping that decision in a pure
 * shared function means it is testable without a database and cannot drift
 * between callers.
 *
 * Returning the outcome rather than a bare array is what stops a caller
 * rendering a partial mission: `steps` exists only on the `available` variant.
 */
export async function readMissionSteps(
  missionId: string
): Promise<MissionStepReadOutcome> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("mission_steps")
    .select("stable_id,position,step_type,payload")
    .eq("mission_id", missionId)
    .order("position", { ascending: true });

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to read mission steps",
      retryable: true
    });
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;

  return resolvePersistedMissionSteps(
    rows.map((row) => ({
      stableId: row.stable_id,
      position: row.position,
      stepType: row.step_type,
      payload: row.payload
    }))
  );
}

export async function validateLearningPathForPublication(
  learningPathId: string
): Promise<CurriculumValidationResult> {
  const supabase = createServerSupabaseClient();
  const issues: CurriculumValidationIssue[] = [];

  const { data: path, error: pathError } = await supabase
    .from("learning_paths")
    .select("id,stable_id,title,publication_state")
    .eq("id", learningPathId)
    .single();

  if (pathError || !path) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Learning path was not found",
      retryable: false
    });
  }

  if (!String(path.title ?? "").trim()) {
    issues.push({
      code: "MISSING_TITLE",
      message: "Learning path title is required.",
      nodeType: "learning_path",
      nodeId: path.id,
      stableId: path.stable_id
    });
  }

  const { data: courses, error: courseError } = await supabase
    .from("courses")
    .select("id,stable_id,title,position,publication_state")
    .eq("learning_path_id", learningPathId)
    .order("position");

  if (courseError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to validate learning path",
      retryable: true
    });
  }

  if (!courses || courses.length === 0) {
    issues.push({
      code: "EMPTY_LEARNING_PATH",
      message: "Learning path must contain at least one course.",
      nodeType: "learning_path",
      nodeId: path.id,
      stableId: path.stable_id
    });
  }

  for (const course of courses ?? []) {
    if (!String(course.title ?? "").trim()) {
      issues.push({
        code: "MISSING_TITLE",
        message: "Course title is required.",
        nodeType: "course",
        nodeId: course.id,
        stableId: course.stable_id
      });
    }

    const { data: modules, error: moduleError } = await supabase
      .from("learning_modules")
      .select("id,stable_id,title,position,publication_state")
      .eq("course_id", course.id)
      .order("position");

    if (moduleError) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Unable to validate course modules",
        retryable: true
      });
    }

    if (!modules || modules.length === 0) {
      issues.push({
        code: "EMPTY_COURSE",
        message: "Course must contain at least one module.",
        nodeType: "course",
        nodeId: course.id,
        stableId: course.stable_id
      });
    }

    for (const module of modules ?? []) {
      if (!String(module.title ?? "").trim()) {
        issues.push({
          code: "MISSING_TITLE",
          message: "Module title is required.",
          nodeType: "module",
          nodeId: module.id,
          stableId: module.stable_id
        });
      }

      const { data: missions, error: missionError } = await supabase
        .from("missions")
        .select("id,stable_id,title,position,publication_state")
        .eq("module_id", module.id)
        .order("position");

      if (missionError) {
        throw new AppError({
          code: "DEPENDENCY_UNAVAILABLE",
          message: "Unable to validate module missions",
          retryable: true
        });
      }

      if (!missions || missions.length === 0) {
        issues.push({
          code: "EMPTY_MODULE",
          message: "Module must contain at least one mission.",
          nodeType: "module",
          nodeId: module.id,
          stableId: module.stable_id
        });
      }

      for (const mission of missions ?? []) {
        if (!String(mission.title ?? "").trim()) {
          issues.push({
            code: "MISSING_TITLE",
            message: "Mission title is required.",
            nodeType: "mission",
            nodeId: mission.id,
            stableId: mission.stable_id
          });
        }

        const { data: links, error: linkError } = await supabase
          .from("mission_competencies")
          .select("competency_id,required")
          .eq("mission_id", mission.id)
          .eq("required", true);

        if (linkError) {
          throw new AppError({
            code: "DEPENDENCY_UNAVAILABLE",
            message: "Unable to validate mission competencies",
            retryable: true
          });
        }

        if (!links || links.length === 0) {
          issues.push({
            code: "MISSING_COMPETENCY",
            message:
              "Mission must map to at least one required competency.",
            nodeType: "mission",
            nodeId: mission.id,
            stableId: mission.stable_id
          });
        }

        // WP-C / CURR-010 section 13.1 — publication is the primary defence.
        //
        // Invalid instructional content keeps the curriculum in draft. A
        // mission with NO steps is not an issue: CURR-010 section 13.4 permits
        // it to keep rendering from `mission.description` during the
        // transition, which is why `readMissionSteps` reports that case as
        // `legacy_brief` rather than as an error.
        const stepOutcome = await readMissionSteps(String(mission.id));

        if (stepOutcome.state === "content_error") {
          issues.push({
            code: "INVALID_MISSION_STEPS",
            message: `Mission instructional steps are not valid: ${stepOutcome.errors.join("; ")}`,
            nodeType: "mission",
            nodeId: mission.id,
            stableId: mission.stable_id
          });
        }

        // WP-D — asset references must resolve before publication.
        //
        // WP-C could only check that `diagram.assetStableId` and
        // `reference.assetStableId` LOOK like stable ids; nothing existed to
        // resolve them against. Now they do, so a step naming an asset that is
        // not authored on its mission blocks publication rather than becoming
        // a missing diagram a learner discovers.
        //
        // Only reached when the steps themselves are valid: an unresolved
        // reference on already-invalid content is noise, and the first issue is
        // the one to fix.
        const assetOutcome = await readMissionAssets(String(mission.id));

        if (assetOutcome.state === "content_error") {
          issues.push({
            code: "INVALID_CURRICULUM_ASSET",
            message: `Mission curriculum assets are not valid: ${assetOutcome.errors.join("; ")}`,
            nodeType: "mission",
            nodeId: mission.id,
            stableId: mission.stable_id
          });
        } else if (stepOutcome.state === "available") {
          const unresolved = findUnresolvedAssetReferences(
            collectMissionStepAssetReferences(stepOutcome.steps),
            assetOutcome.assets.flatMap((asset) =>
              asset.stableId === undefined ? [] : [asset.stableId]
            )
          );

          if (unresolved.length > 0) {
            issues.push({
              code: "UNRESOLVED_ASSET_REFERENCE",
              message: `Mission instructional steps reference curriculum assets that do not exist on this mission: ${unresolved.join(", ")}`,
              nodeType: "mission",
              nodeId: mission.id,
              stableId: mission.stable_id
            });
          }
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

export async function transitionLearningPathState(
  context: AuthoringContext,
  learningPathId: string,
  to: CurriculumPublicationState,
  reason?: string
): Promise<NodeRecord> {
  const supabase = createServerSupabaseClient();

  const { data: current, error: currentError } = await supabase
    .from("learning_paths")
    .select("id,stable_id,version,title,publication_state")
    .eq("id", learningPathId)
    .single();

  if (currentError || !current) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Learning path was not found",
      retryable: false
    });
  }

  const from = current.publication_state as CurriculumPublicationState;

  if (!isValidPublicationTransition(from, to)) {
    throw new AppError({
      code: "CONFLICT",
      message: `Invalid curriculum transition from ${from} to ${to}`,
      retryable: false
    });
  }

  if (to === "published") {
    const validation = await validateLearningPathForPublication(
      learningPathId
    );

    if (!validation.valid) {
      throw new AppError({
        code: "CONFLICT",
        message: "Curriculum cannot be published until validation passes",
        retryable: false,
        details: {
          issues: validation.issues
        }
      });
    }

    const quality = await buildLearningPathQualityReport(
      learningPathId
    );

    if (!quality.valid) {
      throw new AppError({
        code: "CONFLICT",
        message: "Curriculum cannot be published until quality checks pass",
        retryable: false,
        details: {
          issues: quality.issues,
          checklist: quality.checklist
        }
      });
    }

    const { error: descendantsError } = await supabase.rpc(
      "curriculum_publish_learning_path_tree",
      {
        target_learning_path_id: learningPathId
      }
    );

    if (descendantsError) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Unable to publish curriculum descendants",
        retryable: true
      });
    }
  } else {
    const { error } = await supabase
      .from("learning_paths")
      .update({ publication_state: to })
      .eq("id", learningPathId);

    if (error) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Unable to transition curriculum publication state",
        retryable: true
      });
    }
  }

  const { data, error } = await supabase
    .from("learning_paths")
    .select("id,stable_id,version,title,publication_state")
    .eq("id", learningPathId)
    .single();

  if (error || !data) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to load transitioned curriculum",
      retryable: true
    });
  }

  const { error: eventError } = await supabase
    .from("curriculum_publication_events")
    .insert({
      node_type: "learning_path",
      node_id: learningPathId,
      stable_id: data.stable_id,
      version: data.version,
      from_state: from,
      to_state: to,
      actor_user_id: context.actorUserId,
      reason: reason?.trim() || null
    });

  if (eventError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Publication audit recording failed",
      retryable: false
    });
  }

  return {
    id: data.id,
    stableId: data.stable_id,
    version: data.version,
    title: data.title,
    publicationState: data.publication_state
  };
}
