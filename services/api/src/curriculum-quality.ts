import type {
  CurriculumAssetInput,
  CurriculumAssetReadOutcome,
  CurriculumAssetType,
  CurriculumEffortSummary,
  CurriculumQualityReport
} from "@tlp/shared-types";
import {
  AppError,
  isCurriculumAssetType,
  resolvePersistedCurriculumAssets,
  validateCurriculumAsset
} from "@tlp/shared-types";
import { assertMissionIsDraftForAuthoring } from "./curriculum-admin";
import { createServerSupabaseClient } from "./supabase";

/**
 * WP-D. The READ vocabulary, and deliberately the wide one.
 *
 * This helper serves the quality report, which walks rows that already exist.
 * Legacy `lab`, `assessment` and `video` rows must stay readable, so it accepts
 * the full storage vocabulary through the shared predicate.
 *
 * **New authoring does not come through here.** `addMissionAsset` validates
 * with `validateCurriculumAsset`, which uses the narrower
 * `isAuthorableCurriculumAssetType` and refuses those three types with the
 * reason another architecture owns them.
 *
 * The local `Set` this replaced was a hand-maintained second copy of the
 * vocabulary sitting beside the shared union — the arrangement by which two
 * definitions drift apart.
 */
function assetType(value: string): CurriculumAssetType {
  if (!isCurriculumAssetType(value)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid curriculum asset type",
      retryable: false
    });
  }

  return value;
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

/**
 * Author one curriculum asset on an existing mission.
 *
 * WP-D turns this from an insert nothing called into a validated authoring
 * operation. It now carries the mission-scoped `stableId` a WP-C step names,
 * and the `altText` a visual asset owes a learner.
 *
 * **Validated before the client is created.** Invalid authored content is a
 * caller error, not a dependency failure, and is reported as one whether or not
 * a database is reachable. Nothing is normalized into validity.
 *
 * **The authoring vocabulary is the narrow one.** `validateCurriculumAsset`
 * uses `isAuthorableCurriculumAssetType`, so `lab`, `assessment` and `video`
 * are refused here even though the quality reader above accepts them on
 * existing rows. That asymmetry is the point: legacy rows stay readable while
 * new content cannot claim a concept the Lab Engine or the assessment
 * architecture owns.
 *
 * Upserts on `(mission_id, stable_id)`, so re-running an authoring pass is
 * idempotent rather than creating a second copy of an asset.
 */
export async function addMissionAsset(input: CurriculumAssetInput): Promise<void> {
  const errors = validateCurriculumAsset(input);

  if (errors.length > 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: `Curriculum asset is not valid: ${errors.join("; ")}`,
      retryable: false
    });
  }

  // An asset carries no publication state of its own; it is readable exactly
  // when its owning mission is published. So the mission's state is the write
  // boundary, checked here rather than trusted from whenever the caller last
  // looked. See `assertMissionIsDraftForAuthoring`.
  await assertMissionIsDraftForAuthoring(input.missionId);

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("curriculum_assets").upsert(
    {
      mission_id: input.missionId,
      stable_id: input.stableId,
      asset_type: input.assetType,
      title: input.title,
      uri: input.uri,
      position: input.position,
      required: input.required ?? true,
      alt_text: input.altText ?? null
    },
    { onConflict: "mission_id,stable_id" }
  );

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to add curriculum asset",
      retryable: true
    });
  }
}

/**
 * Read one mission's curriculum assets.
 *
 * Narrow by design. WP-E owns learner read-path integration; this exists so
 * publication validation can resolve asset references, and so the persistence
 * contract is testable.
 *
 * The integrity check lives in `resolvePersistedCurriculumAssets`, not here.
 * Persisted rows are untrusted: every field is type-checked and nothing is
 * coerced, so a `position` of `"1"` or a `required` of `0` fails rather than
 * being repaired into something that looks authored.
 *
 * Returning the outcome rather than a bare array is what stops a caller
 * rendering a mission whose assets are partly corrupt: `assets` exists only on
 * the `available` variant.
 */
export async function readMissionAssets(
  missionId: string
): Promise<CurriculumAssetReadOutcome> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("curriculum_assets")
    .select("id,mission_id,stable_id,asset_type,title,uri,position,required,alt_text")
    .eq("mission_id", missionId)
    .order("position", { ascending: true });

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to read curriculum assets",
      retryable: true
    });
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;

  return resolvePersistedCurriculumAssets(
    rows.map((row) => ({
      id: row.id,
      missionId: row.mission_id,
      stableId: row.stable_id,
      assetType: row.asset_type,
      title: row.title,
      uri: row.uri,
      position: row.position,
      required: row.required,
      altText: row.alt_text
    }))
  );
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
