import type {
  Course,
  CurriculumPublicationState,
  LearningModule,
  LearningPath,
  Mission,
  PublishedLearningPathTree,
  CompetencyCurriculumContext,
  CompetencyReference,
  LearnerMissionInstructionResponse,
  LearnerMissionSummary
} from "@tlp/shared-types";
import {
  AppError,
  assembleLearnerInstruction,
  competencyReferenceKey,
  resolvePersistedCurriculumAssets,
  resolvePersistedMissionSteps
} from "@tlp/shared-types";
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

/**
 * WP-E — one published mission's instructional content, for a learner.
 *
 * ## Why this lives here and not in curriculum-admin.ts
 *
 * This module is the **user-scoped** curriculum reader. Every query below runs
 * through `createUserScopedSupabaseClient`, so Row-Level Security applies to
 * the caller's own session and remains one of the two learner boundaries.
 *
 * `readMissionSteps` and `readMissionAssets` already exist, and this
 * deliberately does NOT call them. They live in `curriculum-admin.ts` and
 * `curriculum-quality.ts`, which use `createServerSupabaseClient` — the service
 * role, which bypasses RLS. They are authoring and publication-validation
 * tools. Reusing them for a learner read would quietly make the explicit
 * publication filter below the only barrier, and would put the service role on
 * a path a learner can trigger.
 *
 * The pure resolvers ARE reused: `resolvePersistedMissionSteps`,
 * `resolvePersistedCurriculumAssets` and `assembleLearnerInstruction` carry
 * every structural rule WP-C and WP-D established. Only the data access
 * differs, which is exactly the part that must.
 *
 * ## Two layers, as everywhere else in this module
 *
 * RLS narrows rows to published curriculum; the explicit
 * `.eq("publication_state", "published")` states the same requirement in the
 * query. Neither is redundant: the first survives a route mistake, the second
 * survives a policy mistake.
 *
 * ## Version resolution is the existing pattern, unchanged
 *
 * Highest published `version` for the `stable_id`, exactly as
 * `getPublishedLearningPathTree` resolves a path. Steps and assets are then
 * read by that mission's internal `id`, so they belong to the resolved version
 * and inherit its publication. No step or asset versioning is introduced.
 *
 * ## What a failure means
 *
 * A mission that is absent, unpublished or unreachable raises `NOT_FOUND` —
 * the same answer for all three, so an unpublished mission is not
 * distinguishable from one that does not exist. Malformed authored content is
 * NOT a transport failure: it is a fact about the mission, reported as
 * `content_error` inside a successful response, carrying no diagnostic detail.
 */
export async function getLearnerMissionInstruction(
  accessToken: string,
  missionStableId: string
): Promise<LearnerMissionInstructionResponse> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data: missionRow, error: missionError } = await supabase
    .from("missions")
    .select("id,stable_id,version,title,estimated_minutes,description")
    .eq("stable_id", missionStableId)
    .eq("publication_state", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (missionError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Published curriculum is unavailable",
      retryable: true
    });
  }

  if (!missionRow) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Mission not found",
      retryable: false
    });
  }

  const mission: LearnerMissionSummary = {
    stableId: String(missionRow.stable_id),
    version: Number(missionRow.version),
    title: String(missionRow.title),
    ...(missionRow.estimated_minutes == null
      ? {}
      : { estimatedMinutes: Number(missionRow.estimated_minutes) })
  };

  const { data: stepRows, error: stepError } = await supabase
    .from("mission_steps")
    .select("stable_id,position,step_type,payload")
    .eq("mission_id", String(missionRow.id))
    .order("position", { ascending: true });

  if (stepError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Mission instruction is unavailable",
      retryable: true
    });
  }

  const stepOutcome = resolvePersistedMissionSteps(
    ((stepRows ?? []) as unknown as Array<Record<string, unknown>>).map(
      (row) => ({
        stableId: row.stable_id,
        position: row.position,
        stepType: row.step_type,
        payload: row.payload
      })
    )
  );

  // The approved legacy fallback: zero authored steps, so the brief applies.
  // Deliberately never combined with structured steps — the response type makes
  // the two mutually exclusive, so there is no state in which a learner is
  // shown a description AND authored instruction as competing sources.
  if (stepOutcome.state === "legacy_brief") {
    return {
      mission,
      instruction: {
        state: "legacy_brief",
        description: String(missionRow.description ?? "")
      }
    };
  }

  // Structurally invalid authored content. No detail crosses the boundary:
  // `stepOutcome.errors` names fields, values and validators, which is
  // authoring and operational information rather than a learner's.
  if (stepOutcome.state === "content_error") {
    return { mission, instruction: { state: "content_error" } };
  }

  const { data: assetRows, error: assetError } = await supabase
    .from("curriculum_assets")
    .select(
      "id,mission_id,stable_id,asset_type,title,uri,position,required,alt_text"
    )
    .eq("mission_id", String(missionRow.id))
    .order("position", { ascending: true });

  if (assetError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Mission instruction is unavailable",
      retryable: true
    });
  }

  const assetOutcome = resolvePersistedCurriculumAssets(
    ((assetRows ?? []) as unknown as Array<Record<string, unknown>>).map(
      (row) => ({
        id: row.id,
        missionId: row.mission_id,
        stableId: row.stable_id,
        assetType: row.asset_type,
        title: row.title,
        uri: row.uri,
        position: row.position,
        required: row.required,
        altText: row.alt_text
      })
    )
  );

  if (assetOutcome.state === "content_error") {
    return { mission, instruction: { state: "content_error" } };
  }

  // Ordering, reference collection, resolution and the referenced-only rule all
  // live in the shared assembler, so they are identical wherever applied and
  // testable without a database.
  return {
    mission,
    instruction: assembleLearnerInstruction(
      stepOutcome.steps,
      assetOutcome.assets
    )
  };
}

/**
 * Wave 7 / Batch 6 — canonical competency to curriculum/course relationship.
 *
 * The Curriculum layer owns this traversal:
 *
 *   competencies -> mission_competencies -> missions -> learning_modules -> courses
 *
 * Consumers such as the Evidence Portfolio must call this rather than walking
 * curriculum tables themselves, so there is one authoritative implementation of
 * the relationship. Read-only and student-scoped through RLS.
 *
 * A competency with no published curriculum placement is simply absent from the
 * returned map; callers degrade to showing the competency without course
 * context rather than failing.
 */
export async function resolveCompetencyCurriculumContext(
  accessToken: string,
  references: readonly CompetencyReference[]
): Promise<Map<string, CompetencyCurriculumContext>> {
  const resolved = new Map<string, CompetencyCurriculumContext>();
  if (references.length === 0) {
    return resolved;
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  // Keyed by stableId@version: two versions of one competency may be mapped to
  // different missions, and historical Evidence must keep the context of the
  // exact version it was linked against. "Latest" is never used.
  const wanted = new Set(references.map((r) => competencyReferenceKey(r)));
  const uniqueStableIds = [
    ...new Set(references.map((r) => r.competencyStableId))
  ];

  const { data: competencyRows, error: competencyError } = await supabase
    .from("competencies")
    .select("id,stable_id,version")
    .in("stable_id", uniqueStableIds);

  if (competencyError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Published curriculum is unavailable",
      retryable: true
    });
  }

  const competencies = (competencyRows ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  if (competencies.length === 0) {
    return resolved;
  }

  // Only the exact versions that were asked for.
  const referenceByCompetencyId = new Map<string, CompetencyReference>();
  for (const row of competencies) {
    const reference: CompetencyReference = {
      competencyStableId: String(row.stable_id),
      competencyVersion: Number(row.version)
    };
    if (wanted.has(competencyReferenceKey(reference))) {
      referenceByCompetencyId.set(String(row.id), reference);
    }
  }

  if (referenceByCompetencyId.size === 0) {
    return resolved;
  }

  const { data: mappingRows, error: mappingError } = await supabase
    .from("mission_competencies")
    .select("mission_id,competency_id")
    .in("competency_id", [...referenceByCompetencyId.keys()]);

  if (mappingError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Published curriculum is unavailable",
      retryable: true
    });
  }

  const mappings = (mappingRows ?? []) as unknown as Array<Record<string, unknown>>;
  if (mappings.length === 0) {
    return resolved;
  }

  const { data: missionRows, error: missionError } = await supabase
    .from("missions")
    .select("id,stable_id,module_id,publication_state")
    .in("id", mappings.map((row) => String(row.mission_id)));

  if (missionError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Published curriculum is unavailable",
      retryable: true
    });
  }

  const missions = ((missionRows ?? []) as unknown as Array<Record<string, unknown>>)
    .filter((row) => row.publication_state === "published");
  if (missions.length === 0) {
    return resolved;
  }

  const missionById = new Map<string, Record<string, unknown>>(
    missions.map((row) => [String(row.id), row] as const)
  );

  const { data: moduleRows, error: moduleError } = await supabase
    .from("learning_modules")
    .select("id,stable_id,course_id")
    .in("id", missions.map((row) => String(row.module_id)));

  if (moduleError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Published curriculum is unavailable",
      retryable: true
    });
  }

  const modules = (moduleRows ?? []) as unknown as Array<Record<string, unknown>>;
  const moduleById = new Map<string, Record<string, unknown>>(
    modules.map((row) => [String(row.id), row] as const)
  );

  const { data: courseRows, error: courseError } = await supabase
    .from("courses")
    .select("id,stable_id,title")
    .in("id", modules.map((row) => String(row.course_id)));

  if (courseError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Published curriculum is unavailable",
      retryable: true
    });
  }

  const courseById = new Map<string, Record<string, unknown>>(
    ((courseRows ?? []) as unknown as Array<Record<string, unknown>>).map(
      (row) => [String(row.id), row] as const
    )
  );

  for (const mapping of mappings) {
    const reference = referenceByCompetencyId.get(String(mapping.competency_id));
    if (!reference) continue;

    const key = competencyReferenceKey(reference);
    if (resolved.has(key)) continue;

    const mission = missionById.get(String(mapping.mission_id));
    if (!mission) continue;

    const module = moduleById.get(String(mission.module_id));
    const course = module ? courseById.get(String(module.course_id)) : undefined;

    resolved.set(key, {
      competencyStableId: reference.competencyStableId,
      competencyVersion: reference.competencyVersion,
      ...(course ? { courseStableId: String(course.stable_id) } : {}),
      ...(course ? { courseTitle: String(course.title) } : {}),
      ...(module ? { moduleStableId: String(module.stable_id) } : {}),
      missionStableId: String(mission.stable_id)
    });
  }

  return resolved;
}
