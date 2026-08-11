import type {
  CurriculumPublicationState,
  CurriculumValidationIssue,
  CurriculumValidationResult
} from "@tlp/shared-types";
import { AppError } from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";

type NodeType =
  | "learning_path"
  | "course"
  | "module"
  | "mission"
  | "competency";

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

interface CreateLearningPathInput {
  stableId: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
}

interface UpdateLearningPathInput {
  title?: string;
  description?: string | null;
  estimatedMinutes?: number | null;
}

function normalizeStableId(value: string): string {
  const stableId = value.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(stableId)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Stable ID must be 3-120 lowercase characters using letters, numbers, dot, underscore, or hyphen",
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
  input: CreateLearningPathInput
): Promise<NodeRecord> {
  const supabase = createServerSupabaseClient();
  const stableId = normalizeStableId(input.stableId);
  const title = normalizeTitle(input.title);

  const { data: existing, error: existingError } = await supabase
    .from("learning_paths")
    .select("version")
    .eq("stable_id", stableId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to inspect curriculum versions",
      retryable: true
    });
  }

  const nextVersion = Number(existing?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("learning_paths")
    .insert({
      stable_id: stableId,
      version: nextVersion,
      title,
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
  input: UpdateLearningPathInput
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

  if (input.title !== undefined) {
    patch.title = normalizeTitle(input.title);
  }

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
  }

  const { data, error } = await supabase
    .from("learning_paths")
    .update({ publication_state: to })
    .eq("id", learningPathId)
    .select("id,stable_id,version,title,publication_state")
    .single();

  if (error || !data) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to transition curriculum publication state",
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
      message: "Curriculum state changed but publication audit recording failed",
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
