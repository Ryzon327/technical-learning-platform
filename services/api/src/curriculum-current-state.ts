import type {
  CurriculumDocument,
  CurriculumDocumentAsset,
  MissionStep
} from "@tlp/shared-types";
import { readMissionSteps, readPrerequisiteRules } from "./curriculum-admin";
import { readMissionAssets } from "./curriculum-quality";
import type {
  CurriculumCurrentState,
  ExistingCompetencyPrerequisiteEdge,
  ExistingCurriculumNode,
  ExistingMissionCompetencyLink,
  UnreadableMissionContent,
  UnresolvedRelationship
} from "./curriculum-reconciliation";
import { createServerSupabaseClient } from "./supabase";
import { describeDatabaseError } from "./db-diagnostics";

/**
 * WP-G — everything the plan needs to know about the target database.
 *
 * ## Read-only, and complete
 *
 * Nothing here writes. Its one job is to gather a picture complete enough that
 * the plan built from it can be trusted, which means two things beyond the
 * obvious:
 *
 * **Children are read by parent, not by authored identity.** The document is
 * authoritative for the tree it describes, so the plan must be able to see a
 * stored module or mission the document no longer contains. Asking only about
 * ids the document still mentions could never surface one.
 *
 * **Prerequisite rules are read by target, not by rule identity.** Same reason:
 * a rule the document dropped is invisible to a query keyed on the rules the
 * document still has.
 *
 * ## Scoped to the current version, never to history
 *
 * Every node lookup takes the highest `version` for a stable id and every child
 * and relationship read is keyed on that row's id. Two consequences matter: an
 * older version's children never appear in the plan, and a relationship is
 * always read against the exact row being reconciled.
 *
 * ## Unresolvable identities are reported, never skipped
 *
 * Relationships are stored by row id and translated back to stable ids. When a
 * translation fails, the relationship is recorded in `unresolvedRelationships`
 * rather than dropped — a stored link that silently vanishes is
 * indistinguishable from one the document removed, and the plan would lose a
 * destructive difference. The planner refuses on any such entry.
 */

/**
 * The newest row for a stable id, or null.
 *
 * Read-only, and what makes a re-run idempotent: `curriculum-admin` allocates
 * `version = max + 1` on every create, so creating unconditionally would produce
 * a second version of the whole course on the second run.
 */
async function findExisting(
  table: string,
  stableId: string,
  parentColumn: string | null
): Promise<ExistingCurriculumNode | null> {
  const supabase = createServerSupabaseClient();
  const columns = [
    "id",
    "stable_id",
    "version",
    "publication_state",
    "title",
    "description",
    "position",
    "estimated_minutes",
    ...(parentColumn ? [parentColumn] : [])
  ].join(",");

  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("stable_id", stableId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to inspect existing ${table} "${stableId}": ${describeDatabaseError(error)}`
    );
  }

  if (!data) return null;

  // Through `unknown`: the select list is assembled at runtime, so the client's
  // types cannot describe the returned row shape.
  return toNode(data as unknown as Record<string, unknown>, parentColumn);
}

function toNode(
  row: Record<string, unknown>,
  parentColumn: string | null
): ExistingCurriculumNode {
  const parent = parentColumn ? row[parentColumn] : null;

  return {
    id: String(row.id),
    stableId: String(row.stable_id),
    version: Number(row.version),
    publicationState: String(row.publication_state),
    title: String(row.title ?? ""),
    description: row.description == null ? null : String(row.description),
    position: row.position == null ? null : Number(row.position),
    estimatedMinutes:
      row.estimated_minutes == null ? null : Number(row.estimated_minutes),
    parentId: parent == null ? null : String(parent)
  };
}

/** Every stored child of one parent row. */
async function readChildren(
  table: string,
  parentColumn: string,
  parentId: string
): Promise<ExistingCurriculumNode[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(table)
    .select(
      `id,stable_id,version,publication_state,title,description,position,estimated_minutes,${parentColumn}`
    )
    .eq(parentColumn, parentId);

  if (error) {
    throw new Error(
      `Unable to read ${table} beneath ${parentId}: ${describeDatabaseError(error)}`
    );
  }

  return (data ?? []).map((row) =>
    toNode(row as unknown as Record<string, unknown>, parentColumn)
  );
}

/** Resolve competency row ids to stable ids. */
async function resolveCompetencyStableIds(
  ids: readonly string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("competencies")
    .select("id,stable_id")
    .in("id", [...ids]);

  if (error) {
    throw new Error(
      `Unable to resolve competency identities: ${describeDatabaseError(error)}`
    );
  }

  return new Map(
    (data ?? []).map((row) => [String(row.id), String(row.stable_id)])
  );
}

export async function readCurrentCurriculumState(
  document: CurriculumDocument
): Promise<CurriculumCurrentState> {
  const supabase = createServerSupabaseClient();
  const unresolvedRelationships: UnresolvedRelationship[] = [];
  const unreadableMissionContent: UnreadableMissionContent[] = [];

  const learningPath = await findExisting(
    "learning_paths",
    document.learningPath.stableId,
    null
  );
  const course = await findExisting(
    "courses",
    document.course.stableId,
    "learning_path_id"
  );

  const modules = new Map<string, ExistingCurriculumNode>();
  for (const module of document.modules) {
    const existing = await findExisting(
      "learning_modules",
      module.stableId,
      "course_id"
    );
    if (existing) modules.set(module.stableId, existing);
  }

  const missions = new Map<string, ExistingCurriculumNode>();
  const missionSteps = new Map<string, readonly MissionStep[]>();
  const missionAssets = new Map<string, readonly CurriculumDocumentAsset[]>();

  for (const mission of document.missions) {
    const existing = await findExisting("missions", mission.stableId, "module_id");
    if (!existing) continue;

    missions.set(mission.stableId, existing);

    // `readMissionSteps` THROWS on a transport failure, so an unreadable
    // database never reaches this branch. What can reach it is `content_error`:
    // rows exist and are structurally invalid.
    //
    // The distinction is the whole point. `legacy_brief` means there genuinely
    // are no steps, and an empty list is the truth. `content_error` means there
    // are steps and they cannot be compared — recording that as an empty list
    // would make removal detection blind and would let an import report success
    // while leaving invalid rows in place.
    const steps = await readMissionSteps(existing.id);

    if (steps.state === "content_error") {
      unreadableMissionContent.push({
        missionStableId: mission.stableId,
        what: "steps",
        detail: steps.errors.join("; ")
      });
    }

    missionSteps.set(
      mission.stableId,
      steps.state === "available" ? steps.steps : []
    );

    const assets = await readMissionAssets(existing.id);

    if (assets.state === "content_error") {
      unreadableMissionContent.push({
        missionStableId: mission.stableId,
        what: "assets",
        detail: assets.errors.join("; ")
      });
    }

    missionAssets.set(
      mission.stableId,
      assets.state === "available"
        ? assets.assets.flatMap((asset) =>
            asset.stableId === undefined
              ? []
              : [
                  {
                    stableId: asset.stableId,
                    assetType: asset.assetType,
                    title: asset.title,
                    uri: asset.uri,
                    position: asset.position,
                    required: asset.required,
                    ...(asset.altText === undefined
                      ? {}
                      : { altText: asset.altText })
                  }
                ]
          )
        : []
    );
  }

  const competencies = new Map<string, ExistingCurriculumNode>();
  for (const competency of document.competencies) {
    const existing = await findExisting(
      "competencies",
      competency.stableId,
      null
    );
    if (existing) competencies.set(competency.stableId, existing);
  }

  // --- stored children, by parent ---------------------------------------
  const childCoursesOfPath = learningPath
    ? await readChildren("courses", "learning_path_id", learningPath.id)
    : [];
  const childModulesOfCourse = course
    ? await readChildren("learning_modules", "course_id", course.id)
    : [];

  const childMissionsOfModule = new Map<
    string,
    readonly ExistingCurriculumNode[]
  >();
  for (const [stableId, module] of modules) {
    childMissionsOfModule.set(
      stableId,
      await readChildren("missions", "module_id", module.id)
    );
  }

  // --- mission competency links ------------------------------------------
  const missionCompetencyLinks = new Map<
    string,
    readonly ExistingMissionCompetencyLink[]
  >();
  const missionRowIds = [...missions.values()].map((node) => node.id);

  if (missionRowIds.length > 0) {
    const { data, error } = await supabase
      .from("mission_competencies")
      .select("mission_id,competency_id,required,relationship")
      .in("mission_id", missionRowIds);

    if (error) {
      throw new Error(
        `Unable to read mission competency links: ${describeDatabaseError(error)}`
      );
    }

    const rows = data ?? [];
    const stableIdOf = await resolveCompetencyStableIds([
      ...new Set(rows.map((row) => String(row.competency_id)))
    ]);
    const missionStableIdOf = new Map(
      [...missions.entries()].map(([stableId, node]) => [node.id, stableId])
    );

    for (const stableId of missions.keys()) {
      missionCompetencyLinks.set(stableId, []);
    }

    for (const row of rows) {
      const missionStableId = missionStableIdOf.get(String(row.mission_id));
      const competencyStableId = stableIdOf.get(String(row.competency_id));

      if (!competencyStableId) {
        unresolvedRelationships.push({
          kind: "mission_competency",
          rowId: String(row.competency_id)
        });
        continue;
      }

      if (!missionStableId) continue;

      missionCompetencyLinks.set(missionStableId, [
        ...(missionCompetencyLinks.get(missionStableId) ?? []),
        {
          competencyStableId,
          required: row.required === true,
          relationship: row.relationship == null ? null : String(row.relationship)
        }
      ]);
    }
  }

  // --- competency prerequisite edges --------------------------------------
  const competencyPrerequisiteEdges: ExistingCompetencyPrerequisiteEdge[] = [];
  const competencyRowIds = [...competencies.values()].map((node) => node.id);

  if (competencyRowIds.length > 0) {
    const { data, error } = await supabase
      .from("competency_prerequisites")
      .select("competency_id,prerequisite_competency_id")
      .in("competency_id", competencyRowIds);

    if (error) {
      throw new Error(
        `Unable to read competency prerequisites: ${describeDatabaseError(error)}`
      );
    }

    const rows = data ?? [];
    const stableIdOf = await resolveCompetencyStableIds([
      ...new Set(
        rows.flatMap((row) => [
          String(row.competency_id),
          String(row.prerequisite_competency_id)
        ])
      )
    ]);

    for (const row of rows) {
      const competencyStableId = stableIdOf.get(String(row.competency_id));
      const prerequisiteCompetencyStableId = stableIdOf.get(
        String(row.prerequisite_competency_id)
      );

      if (!competencyStableId || !prerequisiteCompetencyStableId) {
        unresolvedRelationships.push({
          kind: "competency_prerequisite",
          rowId: String(
            competencyStableId
              ? row.prerequisite_competency_id
              : row.competency_id
          )
        });
        continue;
      }

      competencyPrerequisiteEdges.push({
        competencyStableId,
        prerequisiteCompetencyStableId
      });
    }
  }

  // Rules are read by TARGET, so a rule the document dropped is still visible.
  const prerequisiteRules = await readPrerequisiteRules([
    document.course.stableId,
    ...document.modules.map((module) => module.stableId),
    ...document.missions.map((mission) => mission.stableId)
  ]);

  return {
    learningPath,
    course,
    modules,
    missions,
    competencies,
    missionSteps,
    missionAssets,
    childCoursesOfPath,
    childModulesOfCourse,
    childMissionsOfModule,
    missionCompetencyLinks,
    competencyPrerequisiteEdges,
    prerequisiteRules,
    unresolvedRelationships,
    unreadableMissionContent
  };
}
