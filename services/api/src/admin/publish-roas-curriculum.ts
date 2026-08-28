import {
  BootstrapEnvironmentError,
  buildRoasCurriculumBootstrapPlan,
  describeBootstrapPlan,
  resolveBootstrapEnvironment,
  type RoasCurriculumBootstrapPlan
} from "@tlp/shared-types";
import {
  addCompetencyPrerequisite,
  createDraftCompetency,
  createDraftCourse,
  createDraftLearningPath,
  createDraftMission,
  createDraftModule,
  linkMissionCompetency,
  transitionLearningPathState,
  validateLearningPathForPublication
} from "../curriculum-admin";
import { createServerSupabaseClient } from "../supabase";

/**
 * ROAS-4 — publish the authored Router-on-a-Stick curriculum for Founder UAT.
 *
 * ## What this is
 *
 * A Founder-invoked orchestration of operations that already exist. Every write
 * goes through `curriculum-admin.ts`, so stable-id grammar, title validation,
 * position validation, server-side version allocation, publication-state
 * transitions, publication validation and the quality report all apply exactly
 * as they would through the API. There is no direct table INSERT anywhere in
 * this file — the only direct queries are **reads**, used to find what already
 * exists so a re-run does not create a second version.
 *
 * It follows the established `services/api/src/admin/*.ts` pattern
 * (`provision-founder.ts`): a small operator command, gated on an environment
 * confirmation that must exactly match the thing being changed.
 *
 * ## What it deliberately cannot do
 *
 *  - **Write to production.** `resolveBootstrapEnvironment` rejects
 *    `APP_ENV=production` unconditionally and rejects a production-looking
 *    `SUPABASE_URL` even when `APP_ENV` disagrees. There is no override flag.
 *  - **Write by accident.** Dry run is the default. A write requires
 *    `TLP_UAT_BOOTSTRAP_CONFIRM` to equal `SUPABASE_URL` exactly, so an
 *    operator has to name the project rather than authorize "whatever is
 *    configured".
 *  - **Fabricate learner state.** It touches no progress, evidence or
 *    competency-state table. It could not if it tried: `record_mission_progress`
 *    resolves the learner from `auth.uid()`, so progress is only ever writable
 *    by an authenticated learner, never by the service role.
 *  - **Invent curriculum.** Every value comes from the ROAS-2 authored
 *    constants through `buildRoasCurriculumBootstrapPlan()`.
 *  - **Publish a lab.** No provider implements the deterministic probes, so the
 *    lab phase of the ROAS-2 plan is reported as deferred and not executed.
 */

interface ExistingNode {
  id: string;
  stableId: string;
  version: number;
  publicationState: string;
}

/** Actor recorded on authoring operations, from the operator's environment. */
function authoringActorId(): string {
  return process.env.TLP_UAT_BOOTSTRAP_ACTOR_ID?.trim() || "roas4-uat-bootstrap";
}

/**
 * Find the newest row for a stable id, or null.
 *
 * Read-only. This is what makes a re-run idempotent: `curriculum-admin`
 * allocates `version = max + 1` on every create, so calling it twice would
 * produce a second version of the whole course — two curriculum truths, which
 * is exactly what this package must not create.
 */
async function findExisting(
  table: string,
  stableId: string
): Promise<ExistingNode | null> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from(table)
    .select("id,stable_id,version,publication_state")
    .eq("stable_id", stableId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to inspect existing ${table} "${stableId}".`);
  }

  if (!data) return null;

  return {
    id: String(data.id),
    stableId: String(data.stable_id),
    version: Number(data.version),
    publicationState: String(data.publication_state)
  };
}

async function prerequisiteExists(
  competencyId: string,
  prerequisiteCompetencyId: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("competency_prerequisites")
    .select("competency_id")
    .eq("competency_id", competencyId)
    .eq("prerequisite_competency_id", prerequisiteCompetencyId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to inspect existing competency prerequisites.");
  }

  return Boolean(data);
}

function report(action: "create" | "reuse" | "link" | "skip", what: string) {
  const label =
    action === "create"
      ? "  created "
      : action === "reuse"
        ? "  reused  "
        : action === "link"
          ? "  linked  "
          : "  skipped ";
  console.log(`${label}${what}`);
}

/** Print exactly what a write would do, and change nothing. */
function printDryRun(plan: RoasCurriculumBootstrapPlan, reason: string) {
  console.log("MODE: DRY RUN — nothing will be written.");
  console.log(reason);
  console.log("");
  console.log(`Would ensure: ${describeBootstrapPlan(plan)}`);
  console.log("");
  console.log("Operations, in the order ROAS-2 derived them:");
  for (const operation of plan.operations) {
    console.log(
      `  ${String(operation.order).padStart(3, " ")}  ${operation.adminFunction}  ${operation.subject}`
    );
  }
  console.log("");
  console.log("Deliberately NOT executed — no lab provider implements the");
  console.log("deterministic probes, so the demonstration cannot run:");
  for (const operation of plan.deferredOperations) {
    console.log(
      `  ${String(operation.order).padStart(3, " ")}  ${operation.adminFunction}  ${operation.subject}`
    );
  }
  console.log("");
  console.log("No learner progress, evidence or competency state is ever");
  console.log("written by this command, in either mode.");
}

async function execute(plan: RoasCurriculumBootstrapPlan, targetUrl: string) {
  const context = { actorUserId: authoringActorId() };

  console.log(`MODE: EXECUTE — target ${targetUrl}`);
  console.log(`Ensuring: ${describeBootstrapPlan(plan)}`);
  console.log("");

  // --- learning path -------------------------------------------------
  let path = await findExisting("learning_paths", plan.learningPath.stableId);

  if (path) {
    report("reuse", `learning path ${path.stableId} v${path.version}`);
  } else {
    const created = await createDraftLearningPath(context, {
      stableId: plan.learningPath.stableId,
      title: plan.learningPath.title,
      description: plan.learningPath.description,
      estimatedMinutes: plan.learningPath.estimatedMinutes
    });
    path = {
      id: created.id,
      stableId: created.stableId,
      version: created.version,
      publicationState: created.publicationState
    };
    report("create", `learning path ${path.stableId} v${path.version}`);
  }

  // --- course --------------------------------------------------------
  let course = await findExisting("courses", plan.course.stableId);

  if (course) {
    report("reuse", `course ${course.stableId} v${course.version}`);
  } else {
    const created = await createDraftCourse(context, {
      stableId: plan.course.stableId,
      learningPathId: path.id,
      title: plan.course.title,
      description: plan.course.description,
      position: plan.course.position,
      estimatedMinutes: plan.course.estimatedMinutes
    });
    course = {
      id: created.id,
      stableId: created.stableId,
      version: created.version,
      publicationState: created.publicationState
    };
    report("create", `course ${course.stableId} v${course.version}`);
  }

  // --- modules -------------------------------------------------------
  const moduleIds = new Map<string, string>();

  for (const module of plan.modules) {
    const existing = await findExisting("learning_modules", module.stableId);

    if (existing) {
      moduleIds.set(module.stableId, existing.id);
      report("reuse", `module ${module.stableId} v${existing.version}`);
      continue;
    }

    const created = await createDraftModule(context, {
      stableId: module.stableId,
      courseId: course.id,
      title: module.title,
      description: module.description,
      position: module.position,
      estimatedMinutes: module.estimatedMinutes
    });
    moduleIds.set(module.stableId, created.id);
    report("create", `module ${module.stableId} v${created.version}`);
  }

  // --- missions ------------------------------------------------------
  const missionIds = new Map<string, string>();

  for (const mission of plan.missions) {
    const existing = await findExisting("missions", mission.stableId);

    if (existing) {
      missionIds.set(mission.stableId, existing.id);
      report("reuse", `mission ${mission.stableId} v${existing.version}`);
      continue;
    }

    const moduleId = moduleIds.get(mission.moduleStableId);
    if (!moduleId) {
      throw new Error(
        `Mission "${mission.stableId}" names module "${mission.moduleStableId}", which is not in the plan.`
      );
    }

    const created = await createDraftMission(context, {
      stableId: mission.stableId,
      moduleId,
      title: mission.title,
      description: mission.description,
      position: mission.position,
      estimatedMinutes: mission.estimatedMinutes
    });
    missionIds.set(mission.stableId, created.id);
    report("create", `mission ${mission.stableId} v${created.version}`);
  }

  // --- competencies --------------------------------------------------
  const competencyIds = new Map<string, string>();

  for (const competency of plan.competencies) {
    const existing = await findExisting("competencies", competency.stableId);

    if (existing) {
      competencyIds.set(competency.stableId, existing.id);
      report("reuse", `competency ${competency.stableId} v${existing.version}`);
      continue;
    }

    const created = await createDraftCompetency(context, {
      stableId: competency.stableId,
      title: competency.title,
      description: competency.description
    });
    competencyIds.set(competency.stableId, created.id);
    report("create", `competency ${competency.stableId} v${created.version}`);
  }

  // --- competency prerequisites --------------------------------------
  for (const edge of plan.competencyPrerequisites) {
    const competencyId = competencyIds.get(edge.competencyStableId);
    const prerequisiteId = competencyIds.get(
      edge.prerequisiteCompetencyStableId
    );

    if (!competencyId || !prerequisiteId) {
      throw new Error(
        `Prerequisite ${edge.competencyStableId} -> ${edge.prerequisiteCompetencyStableId} names a competency not in the plan.`
      );
    }

    if (await prerequisiteExists(competencyId, prerequisiteId)) {
      report(
        "skip",
        `prerequisite ${edge.competencyStableId} requires ${edge.prerequisiteCompetencyStableId}`
      );
      continue;
    }

    await addCompetencyPrerequisite(context, competencyId, prerequisiteId);
    report(
      "link",
      `prerequisite ${edge.competencyStableId} requires ${edge.prerequisiteCompetencyStableId}`
    );
  }

  // --- mission-competency links --------------------------------------
  // `linkMissionCompetency` upserts, so this is already idempotent.
  for (const link of plan.missionCompetencyLinks) {
    const missionId = missionIds.get(link.missionStableId);
    const competencyId = competencyIds.get(link.competencyStableId);

    if (!missionId || !competencyId) {
      throw new Error(
        `Link ${link.missionStableId} -> ${link.competencyStableId} names a node not in the plan.`
      );
    }

    await linkMissionCompetency(context, missionId, competencyId, link.required);
    report(
      "link",
      `${link.missionStableId} -> ${link.competencyStableId}${link.required ? " (required)" : ""}`
    );
  }

  // --- validate ------------------------------------------------------
  console.log("");
  const validation = await validateLearningPathForPublication(path.id);

  if (!validation.valid) {
    console.error("Curriculum did not pass publication validation:");
    for (const issue of validation.issues) {
      console.error(`  ${issue.code}: ${issue.message} (${issue.stableId})`);
    }
    throw new Error(
      "Refusing to publish. Nothing was transitioned; the drafts remain for inspection."
    );
  }

  console.log("Publication validation passed.");

  // --- publish -------------------------------------------------------
  // The approved lifecycle is draft -> review -> published; there is no direct
  // draft -> published transition, and this command does not add one.
  const current = await findExisting(
    "learning_paths",
    plan.learningPath.stableId
  );

  if (current?.publicationState === "draft") {
    await transitionLearningPathState(
      context,
      path.id,
      "review",
      "ROAS-4 Founder UAT bootstrap"
    );
    report("link", "learning path moved to review");
  }

  await transitionLearningPathState(
    context,
    path.id,
    "published",
    "ROAS-4 Founder UAT bootstrap"
  );

  console.log("");
  console.log("PUBLISHED.");
  console.log(
    "curriculum_publish_learning_path_tree cascaded the course, modules,"
  );
  console.log("missions and mapped competencies to published.");
  console.log("");
  console.log("Deliberately NOT executed — no lab provider exists:");
  for (const operation of plan.deferredOperations) {
    console.log(`  ${operation.adminFunction}  ${operation.subject}`);
  }
  console.log("");
  console.log("No learner progress, evidence or competency state was written.");
  console.log("Sign in as a learner to begin; progress is recorded from the");
  console.log("learner's own session and by nothing else.");
}

async function main() {
  const plan = buildRoasCurriculumBootstrapPlan();

  const decision = resolveBootstrapEnvironment({
    ...(process.env.APP_ENV === undefined ? {} : { appEnv: process.env.APP_ENV }),
    ...(process.env.SUPABASE_URL === undefined
      ? {}
      : { supabaseUrl: process.env.SUPABASE_URL }),
    ...(process.env.TLP_UAT_BOOTSTRAP_CONFIRM === undefined
      ? {}
      : { confirmation: process.env.TLP_UAT_BOOTSTRAP_CONFIRM }),
    hasServiceRoleKey: Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    )
  });

  console.log("ROAS-4 — Router-on-a-Stick curriculum publication");
  console.log("");

  if (decision.mode === "dry_run") {
    printDryRun(plan, decision.reason);
    return;
  }

  await execute(plan, decision.targetUrl ?? "");
}

main().catch((error) => {
  if (error instanceof BootstrapEnvironmentError) {
    console.error(`REFUSED: ${error.message}`);
  } else {
    console.error(
      error instanceof Error
        ? error.message
        : "ROAS-4 curriculum publication failed."
    );
  }
  process.exitCode = 1;
});
