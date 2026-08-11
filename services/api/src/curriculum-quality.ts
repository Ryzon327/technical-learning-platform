import type {
  CurriculumAssetType,
  CurriculumEffortSummary,
  CurriculumQualityReport
} from "@tlp/shared-types";
import { AppError } from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";

function assetType(value: string): CurriculumAssetType {
  const allowed = new Set([
    "article",
    "video",
    "lab",
    "assessment",
    "reference",
    "download"
  ]);

  if (!allowed.has(value)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid curriculum asset type",
      retryable: false
    });
  }

  return value as CurriculumAssetType;
}

function safeUri(value: string): string {
  const uri = value.trim();

  try {
    const parsed = new URL(uri);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("unsupported");
    }
  } catch {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Asset URI must be a valid HTTP or HTTPS URL",
      retryable: false
    });
  }

  return uri;
}

export async function addMissionAsset(input: {
  missionId: string;
  assetType: string;
  title: string;
  uri: string;
  position: number;
  required?: boolean;
}): Promise<void> {
  if (!Number.isInteger(input.position) || input.position < 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Asset position must be a non-negative integer",
      retryable: false
    });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("curriculum_assets").insert({
    mission_id: input.missionId,
    asset_type: assetType(input.assetType),
    title: input.title.trim(),
    uri: safeUri(input.uri),
    position: input.position,
    required: input.required ?? true
  });

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to add curriculum asset",
      retryable: true
    });
  }
}

export async function hasPrerequisiteCycle(): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("competency_prerequisites")
    .select("competency_id,prerequisite_competency_id");

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to inspect competency prerequisites",
      retryable: true
    });
  }

  const graph = new Map<string, string[]>();
  for (const row of data ?? []) {
    const from = String(row.competency_id);
    const to = String(row.prerequisite_competency_id);
    graph.set(from, [...(graph.get(from) ?? []), to]);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;

    visiting.add(node);
    for (const next of graph.get(node) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of graph.keys()) {
    if (visit(node)) return true;
  }

  return false;
}

export async function summarizeLearningPathEffort(
  learningPathId: string
): Promise<CurriculumEffortSummary> {
  const supabase = createServerSupabaseClient();
  const summary: CurriculumEffortSummary = {
    learningPathMinutes: 0,
    courseMinutes: {},
    moduleMinutes: {},
    missionMinutes: {}
  };

  const { data: courses, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("learning_path_id", learningPathId);

  if (courseError) throw new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message: "Unable to summarize curriculum effort",
    retryable: true
  });

  for (const course of courses ?? []) {
    let courseMinutes = 0;
    const { data: modules, error: moduleError } = await supabase
      .from("learning_modules")
      .select("id")
      .eq("course_id", course.id);

    if (moduleError) throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to summarize curriculum effort",
      retryable: true
    });

    for (const module of modules ?? []) {
      let moduleMinutes = 0;
      const { data: missions, error: missionError } = await supabase
        .from("missions")
        .select("id,estimated_minutes")
        .eq("module_id", module.id);

      if (missionError) throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Unable to summarize curriculum effort",
        retryable: true
      });

      for (const mission of missions ?? []) {
        const minutes = Number(mission.estimated_minutes ?? 0);
        summary.missionMinutes[String(mission.id)] = minutes;
        moduleMinutes += minutes;
      }

      summary.moduleMinutes[String(module.id)] = moduleMinutes;
      courseMinutes += moduleMinutes;
    }

    summary.courseMinutes[String(course.id)] = courseMinutes;
    summary.learningPathMinutes += courseMinutes;
  }

  return summary;
}

export async function buildLearningPathQualityReport(
  learningPathId: string
): Promise<CurriculumQualityReport> {
  const supabase = createServerSupabaseClient();
  const issues: string[] = [];

  const { data: courses, error } = await supabase
    .from("courses")
    .select("id,position")
    .eq("learning_path_id", learningPathId)
    .order("position");

  if (error) throw new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message: "Unable to evaluate curriculum quality",
    retryable: true
  });

  const hasCourses = (courses?.length ?? 0) > 0;
  let coursesHaveModules = true;
  let modulesHaveMissions = true;
  let missionsHaveCompetencies = true;
  let stableOrderingValid = true;
  let effortMetadataValid = true;
  let contentAssetsValid = true;

  const coursePositions = (courses ?? []).map((row) => Number(row.position));
  if (new Set(coursePositions).size !== coursePositions.length) {
    stableOrderingValid = false;
    issues.push("Course positions are not unique.");
  }

  for (const course of courses ?? []) {
    const { data: modules } = await supabase
      .from("learning_modules")
      .select("id,position")
      .eq("course_id", course.id)
      .order("position");

    if (!modules?.length) coursesHaveModules = false;

    for (const module of modules ?? []) {
      const { data: missions } = await supabase
        .from("missions")
        .select("id,position,estimated_minutes")
        .eq("module_id", module.id)
        .order("position");

      if (!missions?.length) modulesHaveMissions = false;

      for (const mission of missions ?? []) {
        const minutes = Number(mission.estimated_minutes ?? 0);
        if (!Number.isFinite(minutes) || minutes < 0) {
          effortMetadataValid = false;
        }

        const { data: links } = await supabase
          .from("mission_competencies")
          .select("competency_id")
          .eq("mission_id", mission.id)
          .eq("required", true);

        if (!links?.length) missionsHaveCompetencies = false;

        const { data: assets } = await supabase
          .from("curriculum_assets")
          .select("uri")
          .eq("mission_id", mission.id);

        for (const asset of assets ?? []) {
          try {
            safeUri(String(asset.uri));
          } catch {
            contentAssetsValid = false;
          }
        }
      }
    }
  }

  const prerequisiteGraphAcyclic = !(await hasPrerequisiteCycle());
  const effort = await summarizeLearningPathEffort(learningPathId);

  return {
    valid:
      hasCourses &&
      coursesHaveModules &&
      modulesHaveMissions &&
      missionsHaveCompetencies &&
      prerequisiteGraphAcyclic &&
      stableOrderingValid &&
      effortMetadataValid &&
      contentAssetsValid,
    checklist: {
      hasCourses,
      coursesHaveModules,
      modulesHaveMissions,
      missionsHaveCompetencies,
      prerequisiteGraphAcyclic,
      stableOrderingValid,
      effortMetadataValid,
      contentAssetsValid
    },
    issues,
    effort
  };
}
