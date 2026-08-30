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
  isMissionCompetencyRelationship,
  resolvePersistedMissionSteps,
  validateMissionStep
} from "@tlp/shared-types";
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

  const { data, error } = await supabase
    .from("learning_paths")
    .update(patch)
    .eq("id", learningPathId)
    .select("id,stable_id,version,title,publication_state")
    .single();

  if (error || !data) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to update curriculum draft",
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
