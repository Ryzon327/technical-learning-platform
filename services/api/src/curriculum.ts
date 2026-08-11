import type {
  Course,
  CurriculumPublicationState,
  LearningModule,
  LearningPath,
  Mission,
  PublishedLearningPathTree
} from "@tlp/shared-types";
import { AppError } from "@tlp/shared-types";
import { createUserScopedSupabaseClient } from "./supabase";

function publicationState(value: unknown): CurriculumPublicationState {
  if (
    value === "draft" ||
    value === "review" ||
    value === "published" ||
    value === "retired"
  ) {
    return value;
  }

  throw new AppError({
    code: "INTERNAL_ERROR",
    message: "Invalid curriculum publication state",
    retryable: false
  });
}

function mapPath(row: Record<string, unknown>): LearningPath {
  return {
    id: String(row.id),
    stableId: String(row.stable_id),
    version: Number(row.version),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    publicationState: publicationState(row.publication_state),
    estimatedMinutes:
      row.estimated_minutes === null || row.estimated_minutes === undefined
        ? undefined
        : Number(row.estimated_minutes)
  };
}

function mapCourse(row: Record<string, unknown>): Course {
  return {
    id: String(row.id),
    stableId: String(row.stable_id),
    version: Number(row.version),
    learningPathId: String(row.learning_path_id),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    position: Number(row.position),
    publicationState: publicationState(row.publication_state),
    estimatedMinutes:
      row.estimated_minutes === null || row.estimated_minutes === undefined
        ? undefined
        : Number(row.estimated_minutes)
  };
}

function mapModule(row: Record<string, unknown>): LearningModule {
  return {
    id: String(row.id),
    stableId: String(row.stable_id),
    version: Number(row.version),
    courseId: String(row.course_id),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    position: Number(row.position),
    publicationState: publicationState(row.publication_state),
    estimatedMinutes:
      row.estimated_minutes === null || row.estimated_minutes === undefined
        ? undefined
        : Number(row.estimated_minutes)
  };
}

function mapMission(row: Record<string, unknown>): Mission {
  return {
    id: String(row.id),
    stableId: String(row.stable_id),
    version: Number(row.version),
    moduleId: String(row.module_id),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    position: Number(row.position),
    publicationState: publicationState(row.publication_state),
    estimatedMinutes:
      row.estimated_minutes === null || row.estimated_minutes === undefined
        ? undefined
        : Number(row.estimated_minutes)
  };
}

export async function listPublishedLearningPaths(
  accessToken: string
): Promise<LearningPath[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from("learning_paths")
    .select(
      "id,stable_id,version,title,description,publication_state,estimated_minutes"
    )
    .eq("publication_state", "published")
    .order("title");

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Published curriculum is unavailable",
      retryable: true
    });
  }

  return (data ?? []).map((row) => mapPath(row));
}

export async function getPublishedLearningPathTree(
  accessToken: string,
  stableId: string
): Promise<PublishedLearningPathTree> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data: pathRow, error: pathError } = await supabase
    .from("learning_paths")
    .select(
      "id,stable_id,version,title,description,publication_state,estimated_minutes"
    )
    .eq("stable_id", stableId)
    .eq("publication_state", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pathError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Published curriculum is unavailable",
      retryable: true
    });
  }

  if (!pathRow) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Learning path not found",
      retryable: false
    });
  }

  const learningPath = mapPath(pathRow);

  const { data: courseRows, error: courseError } = await supabase
    .from("courses")
    .select(
      "id,stable_id,version,learning_path_id,title,description,position,publication_state,estimated_minutes"
    )
    .eq("learning_path_id", learningPath.id)
    .eq("publication_state", "published")
    .order("position");

  if (courseError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Published curriculum is unavailable",
      retryable: true
    });
  }

  const courses = await Promise.all(
    (courseRows ?? []).map(async (courseRow) => {
      const course = mapCourse(courseRow);

      const { data: moduleRows, error: moduleError } = await supabase
        .from("learning_modules")
        .select(
          "id,stable_id,version,course_id,title,description,position,publication_state,estimated_minutes"
        )
        .eq("course_id", course.id)
        .eq("publication_state", "published")
        .order("position");

      if (moduleError) {
        throw new AppError({
          code: "DEPENDENCY_UNAVAILABLE",
          message: "Published curriculum is unavailable",
          retryable: true
        });
      }

      const modules = await Promise.all(
        (moduleRows ?? []).map(async (moduleRow) => {
          const module = mapModule(moduleRow);

          const { data: missionRows, error: missionError } = await supabase
            .from("missions")
            .select(
              "id,stable_id,version,module_id,title,description,position,publication_state,estimated_minutes"
            )
            .eq("module_id", module.id)
            .eq("publication_state", "published")
            .order("position");

          if (missionError) {
            throw new AppError({
              code: "DEPENDENCY_UNAVAILABLE",
              message: "Published curriculum is unavailable",
              retryable: true
            });
          }

          return {
            ...module,
            missions: (missionRows ?? []).map((row) => mapMission(row))
          };
        })
      );

      return {
        ...course,
        modules
      };
    })
  );

  return {
    learningPath,
    courses
  };
}
