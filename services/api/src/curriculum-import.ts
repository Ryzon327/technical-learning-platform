import type { CurriculumDocument } from "@tlp/shared-types";
import {
  addCompetencyPrerequisite,
  createDraftCompetency,
  createDraftCourse,
  createDraftLearningPath,
  createDraftMission,
  createDraftModule,
  linkMissionCompetency,
  transitionLearningPathState,
  updateDraftCurriculumNode,
  updateDraftLearningPath,
  upsertMissionStep,
  upsertPrerequisiteRule,
  validateLearningPathForPublication
} from "./curriculum-admin";
import { addMissionAsset } from "./curriculum-quality";
import {
  findPlannedNode,
  planCurriculumReconciliation,
  planIsSafeToExecute,
  planRequiresWrites,
  type CurriculumCurrentState,
  type CurriculumNodeKind,
  type CurriculumReconciliationPlan,
  type NodeAction
} from "./curriculum-reconciliation";

/**
 * WP-G — executing a curriculum import, exactly as planned and never otherwise.
 *
 * ## Why this is separate from the command
 *
 * `admin/publish-curriculum.ts` owns the operator interface: argv, the path
 * check, reading the file, the environment guard, printing. This owns what
 * happens to the database, and takes current state as an argument rather than
 * reading it — so every branch is exercisable with no database at all.
 *
 * The rules enforced here are the ones whose failure is silent data corruption,
 * and a rule that can only be tested against a live database is a rule nobody
 * tests.
 *
 * ## Reconciliation and publication are two acts, not one
 *
 * ROAS-4 has a single write mode, so confirming that command necessarily
 * publishes. That is coherent for a command whose whole purpose was one
 * course's first publication, but it makes `review` a state no operator can
 * ever observe.
 *
 * WP-G keeps the confirmation contract exactly as ROAS-4 proved it — dry run by
 * default, an exact-match confirmation naming the project, production refused —
 * and splits what a confirmed run *does*:
 *
 *   reconcile   write and validate DRAFT curriculum. No lifecycle change.
 *   publish     the lifecycle change, on curriculum already reconciled.
 *
 * Publishing therefore requires the operator to ask for it, rather than being
 * the automatic consequence of an import having succeeded. A path already
 * sitting in `review` is refused either way: WP-G defines no mutation behaviour
 * for review-state curriculum and does not transition it as a side effect.
 *
 * ## The plan is the authority
 *
 * Execution performs no reasoning of its own. It looks each item up by exact
 * identity and does what the plan says. There is deliberately no fallback: a
 * missing plan entry is a failure, not a create. An action the plan did not
 * describe would be a mutation the safety gate never inspected.
 *
 * ## Not atomic, and not pretending to be
 *
 * The REST admin layer offers no transaction spanning an import, and WP-G adds
 * no database procedure to manufacture one. Everything knowable is checked
 * before the first write; that is mitigation, not a guarantee.
 *
 * A mid-import failure leaves earlier writes in place. They are DRAFTS —
 * publication is a separate act that does not run — so the result is an
 * unpublished, inspectable, re-importable state rather than a half-published
 * course. Re-running converges: every write is a create-or-upsert keyed by
 * stable id. No rollback is simulated.
 */

export type ImportStatus =
  | "refused_unsafe"
  | "refused_review"
  | "dry_run"
  | "already_current"
  | "reconciled"
  | "published";

export interface ImportOutcome {
  readonly status: ImportStatus;
  readonly plan: CurriculumReconciliationPlan;
  /** Human-readable lines for the operator, in order. */
  readonly messages: readonly string[];
  /** Every mutation performed, in order. Empty for every refusal and dry run. */
  readonly writes: readonly string[];
}

/**
 * Raised when execution cannot find the plan entry for something it would write.
 *
 * Deliberately not an `AppError`: this is neither a caller mistake nor a
 * dependency failure. It means the executor and the plan disagree about what
 * exists, and the only safe response is to stop.
 */
export class MissingPlanEntryError extends Error {
  constructor(kind: string, stableId: string) {
    super(
      `No plan entry for ${kind} "${stableId}". Refusing to act on an item the safety gate never inspected.`
    );
    this.name = "MissingPlanEntryError";
  }
}

/**
 * Raised when a persisted identifier a write needs cannot be resolved.
 *
 * The alternative is passing `""` to a persistence operation and letting the
 * database reject it — which relies on a foreign key existing, produces an
 * error naming a column rather than a course, and on a nullable column would
 * not be rejected at all.
 */
export class MissingPersistedIdError extends Error {
  constructor(what: string, stableId: string) {
    super(
      `No persisted identifier for ${what} "${stableId}". Refusing to write with an unresolved reference.`
    );
    this.name = "MissingPersistedIdError";
  }
}

/** A required persisted id, or a refusal before the persistence call. */
function requireId(
  value: string | undefined,
  what: string,
  stableId: string
): string {
  if (value === undefined || value.trim() === "") {
    throw new MissingPersistedIdError(what, stableId);
  }
  return value;
}

/**
 * The action the plan assigned, or a refusal.
 *
 * Absence is never interpreted. `create` is a decision the planner makes after
 * looking at current state; inferring it here would reintroduce exactly the
 * fallback that lets an unplanned write happen.
 */
function requirePlannedAction(
  plan: CurriculumReconciliationPlan,
  kind: CurriculumNodeKind,
  stableId: string
): NodeAction {
  const planned = findPlannedNode(plan, kind, stableId);
  if (!planned) throw new MissingPlanEntryError(kind, stableId);

  // `conflict` and `unsupported_removal` are refusals. The global gate should
  // have stopped the run long before here, so reaching one means the gate was
  // bypassed — worth failing loudly for rather than trusting.
  if (planned.action === "conflict" || planned.action === "unsupported_removal") {
    throw new Error(
      `Refusing to execute ${kind} "${stableId}": the plan marked it "${planned.action}", which must never reach mutation.`
    );
  }

  return planned.action;
}

function assertExecutable(
  action: NodeAction,
  what: string,
  stableId: string
): void {
  if (action === "conflict" || action === "unsupported_removal") {
    throw new Error(
      `Refusing to execute ${what} "${stableId}": the plan marked it "${action}", which must never reach mutation.`
    );
  }
}

/* ------------------------------------------------------------------ *
 * Reconciliation writes
 * ------------------------------------------------------------------ */

/**
 * Write exactly what the plan describes, as drafts. Returns the path row id.
 *
 * Performs no lifecycle transition. Publication is a separate act.
 *
 * Exported so the plan-authority rules can be exercised directly: the guarantee
 * that a missing plan entry never becomes a create is only meaningful if a test
 * can hand this a plan with an entry removed, which `importCurriculumDocument`
 * would never produce. Exporting it changes no production path — that function
 * remains the only caller, and still builds and gates the plan first.
 */
export async function executeReconciliationPlan(
  document: CurriculumDocument,
  current: CurriculumCurrentState,
  plan: CurriculumReconciliationPlan,
  actorUserId: string,
  writes: string[]
): Promise<string> {
  const context = { actorUserId };

  // --- learning path ---------------------------------------------------
  let pathId = current.learningPath?.id;
  const pathAction = requirePlannedAction(
    plan,
    "learning_path",
    document.learningPath.stableId
  );

  if (pathAction === "create") {
    const created = await createDraftLearningPath(context, {
      stableId: document.learningPath.stableId,
      title: document.learningPath.title,
      description: document.learningPath.description,
      ...(document.learningPath.estimatedMinutes === undefined
        ? {}
        : { estimatedMinutes: document.learningPath.estimatedMinutes })
    });
    pathId = created.id;
    writes.push(`create learning_path ${created.stableId}`);
  } else if (pathAction === "update") {
    await updateDraftLearningPath(
      context,
      requireId(pathId, "learning path", document.learningPath.stableId),
      {
        title: document.learningPath.title,
        description: document.learningPath.description,
        estimatedMinutes: document.learningPath.estimatedMinutes ?? null
      }
    );
    writes.push(`update learning_path ${document.learningPath.stableId}`);
  }

  const resolvedPathId = requireId(
    pathId,
    "learning path",
    document.learningPath.stableId
  );

  // --- course ----------------------------------------------------------
  let courseId = current.course?.id;
  const courseAction = requirePlannedAction(
    plan,
    "course",
    document.course.stableId
  );

  if (courseAction === "create") {
    const created = await createDraftCourse(context, {
      stableId: document.course.stableId,
      learningPathId: resolvedPathId,
      title: document.course.title,
      description: document.course.description,
      position: document.course.position,
      ...(document.course.estimatedMinutes === undefined
        ? {}
        : { estimatedMinutes: document.course.estimatedMinutes })
    });
    courseId = created.id;
    writes.push(`create course ${created.stableId}`);
  } else if (courseAction === "update") {
    await updateDraftCurriculumNode(
      context,
      "courses",
      requireId(courseId, "course", document.course.stableId),
      {
        title: document.course.title,
        description: document.course.description,
        position: document.course.position,
        estimatedMinutes: document.course.estimatedMinutes ?? null
      }
    );
    writes.push(`update course ${document.course.stableId}`);
  }

  const resolvedCourseId = requireId(
    courseId,
    "course",
    document.course.stableId
  );

  // --- modules ---------------------------------------------------------
  const moduleIds = new Map<string, string>();

  for (const module of document.modules) {
    const action = requirePlannedAction(plan, "module", module.stableId);
    const existing = current.modules.get(module.stableId);

    if (action === "create") {
      const created = await createDraftModule(context, {
        stableId: module.stableId,
        courseId: resolvedCourseId,
        title: module.title,
        description: module.description,
        position: module.position,
        ...(module.estimatedMinutes === undefined
          ? {}
          : { estimatedMinutes: module.estimatedMinutes })
      });
      moduleIds.set(module.stableId, created.id);
      writes.push(`create module ${created.stableId}`);
      continue;
    }

    const moduleId = requireId(existing?.id, "module", module.stableId);
    moduleIds.set(module.stableId, moduleId);

    if (action === "update") {
      await updateDraftCurriculumNode(context, "learning_modules", moduleId, {
        title: module.title,
        description: module.description,
        position: module.position,
        estimatedMinutes: module.estimatedMinutes ?? null
      });
      writes.push(`update module ${module.stableId}`);
    }
  }

  // --- missions --------------------------------------------------------
  const missionIds = new Map<string, string>();

  for (const mission of document.missions) {
    const action = requirePlannedAction(plan, "mission", mission.stableId);
    const existing = current.missions.get(mission.stableId);

    if (action === "create") {
      const created = await createDraftMission(context, {
        stableId: mission.stableId,
        moduleId: requireId(
          moduleIds.get(mission.moduleStableId),
          "parent module",
          mission.moduleStableId
        ),
        title: mission.title,
        description: mission.description,
        position: mission.position,
        ...(mission.estimatedMinutes === undefined
          ? {}
          : { estimatedMinutes: mission.estimatedMinutes })
      });
      missionIds.set(mission.stableId, created.id);
      writes.push(`create mission ${created.stableId}`);
      continue;
    }

    const missionId = requireId(existing?.id, "mission", mission.stableId);
    missionIds.set(mission.stableId, missionId);

    if (action === "update") {
      await updateDraftCurriculumNode(context, "missions", missionId, {
        title: mission.title,
        description: mission.description,
        position: mission.position,
        estimatedMinutes: mission.estimatedMinutes ?? null
      });
      writes.push(`update mission ${mission.stableId}`);
    }
  }

  // --- competencies ----------------------------------------------------
  const competencyIds = new Map<string, string>();

  for (const competency of document.competencies) {
    const action = requirePlannedAction(
      plan,
      "competency",
      competency.stableId
    );
    const existing = current.competencies.get(competency.stableId);

    if (action === "create") {
      const created = await createDraftCompetency(context, {
        stableId: competency.stableId,
        title: competency.title,
        description: competency.description
      });
      competencyIds.set(competency.stableId, created.id);
      writes.push(`create competency ${created.stableId}`);
      continue;
    }

    const competencyId = requireId(
      existing?.id,
      "competency",
      competency.stableId
    );
    competencyIds.set(competency.stableId, competencyId);

    if (action === "update") {
      await updateDraftCurriculumNode(context, "competencies", competencyId, {
        title: competency.title,
        description: competency.description
      });
      writes.push(`update competency ${competency.stableId}`);
    }
  }

  // --- competency prerequisite edges -------------------------------------
  // Exactly the edges the plan identified as new. `addCompetencyPrerequisite`
  // is a plain INSERT against a primary key, so re-inserting an existing edge
  // raises a unique violation instead of being idempotent.
  if (plan.competencyPrerequisites.action === "create") {
    for (const edge of plan.competencyPrerequisites.toCreate) {
      await addCompetencyPrerequisite(
        context,
        requireId(
          competencyIds.get(edge.competencyStableId),
          "competency",
          edge.competencyStableId
        ),
        requireId(
          competencyIds.get(edge.prerequisiteCompetencyStableId),
          "prerequisite competency",
          edge.prerequisiteCompetencyStableId
        )
      );
      writes.push(
        `create competency_prerequisite ${edge.competencyStableId} <- ${edge.prerequisiteCompetencyStableId}`
      );
    }
  }

  // --- mission competency links -----------------------------------------
  for (const mission of document.missions) {
    const planned = plan.missionCompetencyLinks.find(
      (entry) => entry.missionStableId === mission.stableId
    );

    if (!planned) {
      throw new MissingPlanEntryError(
        "mission_competency_links",
        mission.stableId
      );
    }

    assertExecutable(planned.action, "competency links", mission.stableId);
    if (planned.action === "reuse") continue;

    const missionId = requireId(
      missionIds.get(mission.stableId),
      "mission",
      mission.stableId
    );

    for (const link of mission.competencies) {
      await linkMissionCompetency(
        context,
        missionId,
        requireId(
          competencyIds.get(link.competencyStableId),
          "competency",
          link.competencyStableId
        ),
        link.required,
        link.relationship
      );
    }

    writes.push(`${planned.action} competency_links ${mission.stableId}`);
  }

  // --- instructional content --------------------------------------------
  // Assets before steps: a diagram step names an asset and publication
  // validation resolves that reference, so writing the reference first would
  // leave a window in which the mission is structurally unpublishable.
  for (const mission of document.missions) {
    const planned = plan.missionContent.find(
      (entry) => entry.missionStableId === mission.stableId
    );

    if (!planned) {
      throw new MissingPlanEntryError("mission_content", mission.stableId);
    }

    assertExecutable(planned.action, "content", mission.stableId);
    if (planned.action === "reuse") continue;

    const missionId = requireId(
      missionIds.get(mission.stableId),
      "mission",
      mission.stableId
    );

    for (const asset of mission.assets) {
      await addMissionAsset({
        missionId,
        stableId: asset.stableId,
        assetType: asset.assetType as never,
        title: asset.title,
        uri: asset.uri,
        position: asset.position,
        ...(asset.required === undefined ? {} : { required: asset.required }),
        ...(asset.altText === undefined ? {} : { altText: asset.altText })
      });
    }

    for (const step of mission.steps) {
      await upsertMissionStep(context, missionId, step);
    }

    writes.push(`${planned.action} content ${mission.stableId}`);
  }

  // --- explicit prerequisite rules ---------------------------------------
  for (const rule of document.prerequisiteRules) {
    const planned = plan.prerequisiteRules.find(
      (entry) =>
        entry.targetStableId === rule.targetStableId &&
        entry.requirementStableId === rule.requirementStableId
    );

    if (!planned) {
      throw new MissingPlanEntryError("prerequisite_rule", rule.targetStableId);
    }

    assertExecutable(planned.action, "prerequisite rule", rule.targetStableId);
    if (planned.action === "reuse") continue;

    await upsertPrerequisiteRule(context, rule);
    writes.push(
      `${planned.action} prerequisite_rule ${rule.targetStableId} <- ${rule.requirementStableId}`
    );
  }

  return resolvedPathId;
}

/* ------------------------------------------------------------------ *
 * The import
 * ------------------------------------------------------------------ */

export interface ImportRequest {
  readonly document: CurriculumDocument;
  readonly current: CurriculumCurrentState;
  readonly mode: "dry_run" | "execute";
  /**
   * Whether the operator explicitly asked to publish.
   *
   * Separate from `mode` because confirming a write is not the same as asking
   * for curriculum to go live. A confirmed run without this reconciles drafts
   * and validates them, and stops.
   */
  readonly publish?: boolean;
  /** Required to execute; the audit trail needs a real account. */
  readonly actorUserId?: string;
}

/**
 * Reconcile, gate, and — only if permitted and asked — write and publish.
 *
 * `current` is a parameter rather than something this reads, which keeps the
 * whole decision tree testable without a database.
 */
export async function importCurriculumDocument(
  input: ImportRequest
): Promise<ImportOutcome> {
  const { document, current, mode } = input;
  const plan = planCurriculumReconciliation(document, current);
  const messages: string[] = [];
  const writes: string[] = [];

  // The safety gate, before anything else. `planRequiresWrites` is not
  // consulted here and never overrides it: a plan can have work to do and still
  // be unsafe, and in that case it does none of it.
  if (!planIsSafeToExecute(plan)) {
    messages.push("Refusing to import. Nothing was written.");
    return { status: "refused_unsafe", plan, messages, writes };
  }

  const pathState = current.learningPath?.publicationState;

  // An identical rerun against published curriculum is a complete no-op,
  // lifecycle included. Transitioning published -> published would append a
  // publication event recording a change that did not happen, which makes the
  // audit trail less true rather than more complete.
  if (!planRequiresWrites(plan) && pathState === "published") {
    messages.push(
      "Already current. The published curriculum matches the document; no writes and no lifecycle transition were performed."
    );
    return { status: "already_current", plan, messages, writes };
  }

  if (mode === "dry_run") {
    messages.push(
      planRequiresWrites(plan)
        ? "Dry run. The plan above would be executed."
        : "Dry run. Nothing would change; the document matches what is stored."
    );
    if (input.publish) {
      messages.push(
        "Publication was requested and would follow a successful reconciliation."
      );
    }
    return { status: "dry_run", plan, messages, writes };
  }

  // WP-G defines no mutation behaviour for a path already in review. The
  // transition review -> published is legal, but performing it because a
  // content command reached its end would publish curriculum on the strength of
  // an operator having run an import — a lifecycle decision they did not make.
  if (pathState === "review") {
    messages.push(
      'The learning path is in publication state "review". WP-G neither edits review-state curriculum nor transitions it as a side effect of an import. Resolve the review state explicitly first.'
    );
    return { status: "refused_review", plan, messages, writes };
  }

  if (!input.actorUserId) {
    throw new Error(
      "An authoring actor is required to execute an import; publication events must be attributable."
    );
  }

  const pathId = await executeReconciliationPlan(
    document,
    current,
    plan,
    input.actorUserId,
    writes
  );

  // Validation AFTER the writes and BEFORE any lifecycle change: the server's
  // own check runs against what was actually stored, not against the document.
  const validation = await validateLearningPathForPublication(pathId);

  if (!validation.valid) {
    const issues = validation.issues
      .map((issue) => `${issue.code}: ${issue.message} (${issue.stableId})`)
      .join("; ");
    throw new Error(
      `Curriculum did not pass publication validation: ${issues}. Nothing was transitioned; the drafts written remain for inspection.`
    );
  }

  messages.push("Reconciled and validated as draft curriculum.");

  if (!input.publish) {
    messages.push(
      "Not published. Publication is a separate explicit action; re-run with the publish flag when the draft has been reviewed."
    );
    messages.push(
      "No learner progress, evidence or competency state was written."
    );
    return { status: "reconciled", plan, messages, writes };
  }

  // Publication is last, and only because it was asked for. The approved
  // lifecycle is draft -> review -> published; there is no direct
  // draft -> published transition and this adds none.
  const context = { actorUserId: input.actorUserId };

  await transitionLearningPathState(
    context,
    pathId,
    "review",
    "WP-G curriculum document publication"
  );
  await transitionLearningPathState(
    context,
    pathId,
    "published",
    "WP-G curriculum document publication"
  );

  writes.push("transition learning_path draft -> review -> published");
  messages.push("PUBLISHED.");
  messages.push(
    "Steps and assets inherit publication from their owning mission and needed no transition."
  );
  messages.push("No learner progress, evidence or competency state was written.");

  return { status: "published", plan, messages, writes };
}
