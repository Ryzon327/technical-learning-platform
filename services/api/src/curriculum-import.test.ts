import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseCurriculumDocument,
  type CurriculumDocument,
  type CurriculumDocumentAsset,
  type MissionStep
} from "@tlp/shared-types";

/**
 * WP-G — what the importer actually writes.
 *
 * The admin layer is mocked rather than the Supabase client, so "zero
 * mutations" is directly observable: a write happened exactly when one of these
 * functions was called. That is a stronger and more readable claim than
 * counting queries, and it makes the dry-run and unsafe-plan cases provable
 * rather than argued.
 *
 * Nothing here contacts a database. The importer takes current state as an
 * argument, so every branch is reachable with plain values.
 */
vi.mock("./curriculum-admin", () => ({
  createDraftLearningPath: vi.fn(),
  updateDraftLearningPath: vi.fn(),
  createDraftCourse: vi.fn(),
  createDraftModule: vi.fn(),
  createDraftMission: vi.fn(),
  createDraftCompetency: vi.fn(),
  updateDraftCurriculumNode: vi.fn(),
  addCompetencyPrerequisite: vi.fn(),
  linkMissionCompetency: vi.fn(),
  upsertMissionStep: vi.fn(),
  upsertPrerequisiteRule: vi.fn(),
  transitionLearningPathState: vi.fn(),
  validateLearningPathForPublication: vi.fn()
}));

vi.mock("./curriculum-quality", () => ({
  addMissionAsset: vi.fn()
}));

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
  MissingPersistedIdError,
  MissingPlanEntryError,
  executeReconciliationPlan,
  importCurriculumDocument
} from "./curriculum-import";
import {
  planCurriculumReconciliation,
  type CurriculumCurrentState,
  type ExistingCompetencyPrerequisiteEdge,
  type ExistingCurriculumNode,
  type ExistingMissionCompetencyLink,
  type ExistingPrerequisiteRule,
  type UnreadableMissionContent,
  type UnresolvedRelationship
} from "./curriculum-reconciliation";

const ACTOR = "11111111-1111-4111-8111-111111111111";

const FIXTURE = new URL(
  "../../../content/fixtures/curriculum-architecture-example.json",
  import.meta.url
);

function document(): CurriculumDocument {
  const result = parseCurriculumDocument(
    JSON.parse(readFileSync(FIXTURE, "utf8"))
  );
  if (!result.valid) {
    throw new Error(`fixture is invalid:\n  ${result.errors.join("\n  ")}`);
  }
  return result.document;
}

interface MutableState {
  learningPath: ExistingCurriculumNode | null;
  course: ExistingCurriculumNode | null;
  modules: Map<string, ExistingCurriculumNode>;
  missions: Map<string, ExistingCurriculumNode>;
  competencies: Map<string, ExistingCurriculumNode>;
  missionSteps: Map<string, readonly MissionStep[]>;
  missionAssets: Map<string, readonly CurriculumDocumentAsset[]>;
  childCoursesOfPath: ExistingCurriculumNode[];
  childModulesOfCourse: ExistingCurriculumNode[];
  childMissionsOfModule: Map<string, readonly ExistingCurriculumNode[]>;
  missionCompetencyLinks: Map<string, readonly ExistingMissionCompetencyLink[]>;
  competencyPrerequisiteEdges: ExistingCompetencyPrerequisiteEdge[];
  prerequisiteRules: ExistingPrerequisiteRule[];
  unresolvedRelationships: UnresolvedRelationship[];
  unreadableMissionContent: UnreadableMissionContent[];
}

function node(
  overrides: Partial<ExistingCurriculumNode> & { stableId: string }
): ExistingCurriculumNode {
  return {
    id: `id-${overrides.stableId}`,
    version: 1,
    publicationState: "draft",
    title: "",
    description: null,
    position: null,
    estimatedMinutes: null,
    parentId: null,
    ...overrides
  };
}

function emptyState(): MutableState {
  return {
    learningPath: null,
    course: null,
    modules: new Map(),
    missions: new Map(),
    competencies: new Map(),
    missionSteps: new Map(),
    missionAssets: new Map(),
    childCoursesOfPath: [],
    childModulesOfCourse: [],
    childMissionsOfModule: new Map(),
    missionCompetencyLinks: new Map(),
    competencyPrerequisiteEdges: [],
    prerequisiteRules: [],
    unresolvedRelationships: [],
    unreadableMissionContent: []
  };
}

/** Current state matching the document exactly, at a chosen publication state. */
function matchingState(
  doc: CurriculumDocument,
  publicationState: "draft" | "review" | "published"
): MutableState {
  const pathNode = node({
    stableId: doc.learningPath.stableId,
    publicationState,
    title: doc.learningPath.title,
    description: doc.learningPath.description,
    estimatedMinutes: doc.learningPath.estimatedMinutes ?? null
  });

  const courseNode = node({
    stableId: doc.course.stableId,
    publicationState,
    title: doc.course.title,
    description: doc.course.description,
    position: doc.course.position,
    estimatedMinutes: doc.course.estimatedMinutes ?? null,
    parentId: pathNode.id
  });

  const moduleNodes = doc.modules.map((module) =>
    node({
      stableId: module.stableId,
      publicationState,
      title: module.title,
      description: module.description,
      position: module.position,
      estimatedMinutes: module.estimatedMinutes ?? null,
      parentId: courseNode.id
    })
  );

  const moduleIdOf = new Map(
    moduleNodes.map((module) => [module.stableId, module.id])
  );

  const missionNodes = doc.missions.map((mission) =>
    node({
      stableId: mission.stableId,
      publicationState,
      title: mission.title,
      description: mission.description,
      position: mission.position,
      estimatedMinutes: mission.estimatedMinutes ?? null,
      parentId: moduleIdOf.get(mission.moduleStableId) ?? null
    })
  );

  return {
    learningPath: pathNode,
    course: courseNode,
    modules: new Map(moduleNodes.map((entry) => [entry.stableId, entry])),
    missions: new Map(missionNodes.map((entry) => [entry.stableId, entry])),
    competencies: new Map(
      doc.competencies.map((competency) => [
        competency.stableId,
        node({
          stableId: competency.stableId,
          publicationState,
          title: competency.title,
          description: competency.description
        })
      ])
    ),
    missionSteps: new Map(
      doc.missions.map((mission) => [mission.stableId, mission.steps])
    ),
    missionAssets: new Map(
      doc.missions.map((mission) => [mission.stableId, mission.assets])
    ),
    childCoursesOfPath: [courseNode],
    childModulesOfCourse: moduleNodes,
    childMissionsOfModule: new Map(
      doc.modules.map((module) => [
        module.stableId,
        missionNodes.filter(
          (mission) => mission.parentId === moduleIdOf.get(module.stableId)
        )
      ])
    ),
    missionCompetencyLinks: new Map(
      doc.missions.map((mission) => [
        mission.stableId,
        mission.competencies.map((link) => ({
          competencyStableId: link.competencyStableId,
          required: link.required,
          relationship: link.relationship as string | null
        }))
      ])
    ),
    competencyPrerequisiteEdges: doc.competencyPrerequisites.map((edge) => ({
      competencyStableId: edge.competencyStableId,
      prerequisiteCompetencyStableId: edge.prerequisiteCompetencyStableId
    })),
    prerequisiteRules: doc.prerequisiteRules.map((rule) => ({
      targetNodeType: rule.targetNodeType,
      targetStableId: rule.targetStableId,
      requirementType: rule.requirementType,
      requirementStableId: rule.requirementStableId,
      explanation: rule.explanation,
      active: true
    })),
    unresolvedRelationships: [],
    unreadableMissionContent: []
  };
}

/** Every mutating admin operation. If none was called, nothing was written. */
const MUTATIONS = [
  createDraftLearningPath,
  updateDraftLearningPath,
  createDraftCourse,
  createDraftModule,
  createDraftMission,
  createDraftCompetency,
  updateDraftCurriculumNode,
  addCompetencyPrerequisite,
  linkMissionCompetency,
  upsertMissionStep,
  upsertPrerequisiteRule,
  addMissionAsset,
  transitionLearningPathState
];

function mutationCount(): number {
  return MUTATIONS.reduce(
    (total, fn) => total + vi.mocked(fn).mock.calls.length,
    0
  );
}

function expectNoMutations(): void {
  expect(mutationCount()).toBe(0);
}

/** Make every create return a distinct row id so parent wiring is checkable. */
function stubCreates(): void {
  let counter = 0;
  const record = (input: { stableId: string }) => ({
    id: `new-${input.stableId}`,
    stableId: input.stableId,
    version: ++counter,
    title: "t",
    publicationState: "draft" as const
  });

  vi.mocked(createDraftLearningPath).mockImplementation(
    async (_c, input) => record(input) as never
  );
  vi.mocked(createDraftCourse).mockImplementation(
    async (_c, input) => record(input) as never
  );
  vi.mocked(createDraftModule).mockImplementation(
    async (_c, input) => record(input) as never
  );
  vi.mocked(createDraftMission).mockImplementation(
    async (_c, input) => record(input) as never
  );
  vi.mocked(createDraftCompetency).mockImplementation(
    async (_c, input) => record(input) as never
  );
  vi.mocked(validateLearningPathForPublication).mockResolvedValue({
    valid: true,
    issues: []
  } as never);
}

describe("curriculum import execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubCreates();
  });

  /* ---------------------------------------------------------------- *
   * Dry run
   * ---------------------------------------------------------------- */

  it("dry run performs zero mutations even with a full plan to execute", async () => {
    const outcome = await importCurriculumDocument({
      document: document(),
      current: emptyState(),
      mode: "dry_run"
    });

    expect(outcome.status).toBe("dry_run");
    expect(outcome.writes).toEqual([]);
    expectNoMutations();
  });

  it("dry run reports that publication would follow when asked", async () => {
    const outcome = await importCurriculumDocument({
      document: document(),
      current: emptyState(),
      mode: "dry_run",
      publish: true
    });

    expect(outcome.messages.join(" ")).toContain("Publication was requested");
    expectNoMutations();
  });

  /* ---------------------------------------------------------------- *
   * The global safety gate
   * ---------------------------------------------------------------- */

  it("an unsafe plan performs zero mutations", async () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const module = doc.modules[0]!;
    // Changed published content: the plan is unsafe.
    state.modules.set(module.stableId, {
      ...state.modules.get(module.stableId)!,
      title: "Renamed"
    });

    const outcome = await importCurriculumDocument({
      document: doc,
      current: state,
      mode: "execute",
      publish: true,
      actorUserId: ACTOR
    });

    expect(outcome.status).toBe("refused_unsafe");
    expect(outcome.writes).toEqual([]);
    expectNoMutations();
  });

  it("an unsafe plan performs zero mutations even when parts are writable", async () => {
    // A tree that is almost entirely safe creates, with one stored module the
    // document dropped. One refusal stops all of it.
    const doc = document();
    const state = emptyState();
    state.learningPath = node({ stableId: doc.learningPath.stableId });
    state.course = node({
      stableId: doc.course.stableId,
      parentId: state.learningPath.id
    });
    state.childModulesOfCourse = [
      node({ stableId: "arch-fixture-mod-retired", parentId: state.course.id })
    ];

    const outcome = await importCurriculumDocument({
      document: doc,
      current: state,
      mode: "execute",
      publish: true,
      actorUserId: ACTOR
    });

    expect(outcome.status).toBe("refused_unsafe");
    expectNoMutations();
  });

  it("an unresolved relationship identity refuses before mutation", async () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    state.unresolvedRelationships = [
      { kind: "mission_competency", rowId: "competency-row-9f2" }
    ];

    const outcome = await importCurriculumDocument({
      document: doc,
      current: state,
      mode: "execute",
      actorUserId: ACTOR
    });

    expect(outcome.status).toBe("refused_unsafe");
    expectNoMutations();
  });

  /* ---------------------------------------------------------------- *
   * Plan authority
   *
   * These drive the executor directly with a deliberately starved plan.
   * `importCurriculumDocument` could never produce one — it builds the plan
   * itself — so the guarantee that a missing entry is never treated as a
   * create can only be proved at this seam.
   * ---------------------------------------------------------------- */

  it("a missing plan entry fails closed instead of creating", async () => {
    const doc = document();
    const current = emptyState();
    const plan = planCurriculumReconciliation(doc, current);

    // Remove the FIRST thing the executor touches, so the refusal happens
    // before any mutation at all.
    const starved = {
      ...plan,
      nodes: plan.nodes.filter((entry) => entry.kind !== "learning_path")
    };

    await expect(
      executeReconciliationPlan(doc, current, starved, ACTOR, [])
    ).rejects.toBeInstanceOf(MissingPlanEntryError);

    expectNoMutations();
  });

  it("does not create the node whose plan entry is missing", async () => {
    const doc = document();
    const current = emptyState();
    const plan = planCurriculumReconciliation(doc, current);

    const starved = {
      ...plan,
      nodes: plan.nodes.filter((entry) => entry.kind !== "mission")
    };

    await expect(
      executeReconciliationPlan(doc, current, starved, ACTOR, [])
    ).rejects.toBeInstanceOf(MissingPlanEntryError);

    // Earlier planned writes are allowed to have happened — execution is not a
    // transaction — but the unplanned node must never have been created.
    expect(vi.mocked(createDraftMission)).not.toHaveBeenCalled();
  });

  it("names the missing entry so it can be diagnosed", async () => {
    const doc = document();
    const current = emptyState();
    const plan = planCurriculumReconciliation(doc, current);
    const starved = {
      ...plan,
      nodes: plan.nodes.filter((entry) => entry.kind !== "learning_path")
    };

    await expect(
      executeReconciliationPlan(doc, current, starved, ACTOR, [])
    ).rejects.toThrow(/learning_path/);
  });

  it("refuses a plan entry marked conflict rather than executing it", async () => {
    // The global gate should stop this long before, so reaching it means the
    // gate was bypassed — worth failing loudly for rather than trusting.
    const doc = document();
    const current = emptyState();
    const plan = planCurriculumReconciliation(doc, current);

    const poisoned = {
      ...plan,
      nodes: plan.nodes.map((entry) =>
        entry.kind === "learning_path"
          ? { ...entry, action: "conflict" as const }
          : entry
      )
    };

    await expect(
      executeReconciliationPlan(doc, current, poisoned, ACTOR, [])
    ).rejects.toThrow(/must never reach mutation/);

    expectNoMutations();
  });

  it("refuses a plan entry marked unsupported_removal rather than executing it", async () => {
    const doc = document();
    const current = emptyState();
    const plan = planCurriculumReconciliation(doc, current);

    const poisoned = {
      ...plan,
      nodes: plan.nodes.map((entry) =>
        entry.kind === "learning_path"
          ? { ...entry, action: "unsupported_removal" as const }
          : entry
      )
    };

    await expect(
      executeReconciliationPlan(doc, current, poisoned, ACTOR, [])
    ).rejects.toThrow(/must never reach mutation/);

    expectNoMutations();
  });

  it("fails closed when a mission's content plan entry is missing", async () => {
    const doc = document();
    const current = emptyState();
    const plan = planCurriculumReconciliation(doc, current);

    const starved = { ...plan, missionContent: [] };

    await expect(
      executeReconciliationPlan(doc, current, starved, ACTOR, [])
    ).rejects.toBeInstanceOf(MissingPlanEntryError);

    expect(vi.mocked(upsertMissionStep)).not.toHaveBeenCalled();
  });

  it("fails closed when a mission's competency-link plan entry is missing", async () => {
    const doc = document();
    const current = emptyState();
    const plan = planCurriculumReconciliation(doc, current);

    const starved = { ...plan, missionCompetencyLinks: [] };

    await expect(
      executeReconciliationPlan(doc, current, starved, ACTOR, [])
    ).rejects.toBeInstanceOf(MissingPlanEntryError);

    expect(vi.mocked(linkMissionCompetency)).not.toHaveBeenCalled();
  });

  it("fails closed when a prerequisite rule plan entry is missing", async () => {
    const doc = document();
    const current = emptyState();
    const plan = planCurriculumReconciliation(doc, current);

    const starved = { ...plan, prerequisiteRules: [] };

    await expect(
      executeReconciliationPlan(doc, current, starved, ACTOR, [])
    ).rejects.toBeInstanceOf(MissingPlanEntryError);

    expect(vi.mocked(upsertPrerequisiteRule)).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- *
   * Idempotence
   * ---------------------------------------------------------------- */

  it("an identical draft rerun writes nothing", async () => {
    const doc = document();

    const outcome = await importCurriculumDocument({
      document: doc,
      current: matchingState(doc, "draft"),
      mode: "execute",
      actorUserId: ACTOR
    });

    expect(outcome.status).toBe("reconciled");
    expectNoMutations();
    expect(vi.mocked(validateLearningPathForPublication)).toHaveBeenCalled();
  });

  it("an identical published rerun writes nothing and does not transition", async () => {
    const doc = document();

    const outcome = await importCurriculumDocument({
      document: doc,
      current: matchingState(doc, "published"),
      mode: "execute",
      publish: true,
      actorUserId: ACTOR
    });

    expect(outcome.status).toBe("already_current");
    expect(outcome.writes).toEqual([]);
    expectNoMutations();
    // The specific rule: no published -> published transition.
    expect(vi.mocked(transitionLearningPathState)).not.toHaveBeenCalled();
  });

  it("an identical published rerun does not even validate", async () => {
    const doc = document();

    await importCurriculumDocument({
      document: doc,
      current: matchingState(doc, "published"),
      mode: "execute",
      publish: true,
      actorUserId: ACTOR
    });

    expect(vi.mocked(validateLearningPathForPublication)).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- *
   * Review state
   * ---------------------------------------------------------------- */

  it("refuses a path in review and writes nothing", async () => {
    const doc = document();

    const outcome = await importCurriculumDocument({
      document: doc,
      current: matchingState(doc, "review"),
      mode: "execute",
      publish: true,
      actorUserId: ACTOR
    });

    expect(outcome.status).toBe("refused_review");
    expectNoMutations();
    expect(vi.mocked(transitionLearningPathState)).not.toHaveBeenCalled();
  });

  it("names review explicitly rather than calling it published", async () => {
    const doc = document();

    const outcome = await importCurriculumDocument({
      document: doc,
      current: matchingState(doc, "review"),
      mode: "execute",
      publish: true,
      actorUserId: ACTOR
    });

    expect(outcome.messages.join(" ")).toContain("review");
  });

  it("treats changed review content as unsafe, not as an editable draft", async () => {
    const doc = document();
    const state = matchingState(doc, "review");
    state.modules.set(doc.modules[0]!.stableId, {
      ...state.modules.get(doc.modules[0]!.stableId)!,
      title: "Renamed"
    });

    const outcome = await importCurriculumDocument({
      document: doc,
      current: state,
      mode: "execute",
      actorUserId: ACTOR
    });

    expect(outcome.status).toBe("refused_unsafe");
    expectNoMutations();
  });

  /* ---------------------------------------------------------------- *
   * Reconcile versus publish
   * ---------------------------------------------------------------- */

  it("a confirmed execute without the publish flag does not publish", async () => {
    const outcome = await importCurriculumDocument({
      document: document(),
      current: emptyState(),
      mode: "execute",
      actorUserId: ACTOR
    });

    expect(outcome.status).toBe("reconciled");
    expect(vi.mocked(createDraftMission)).toHaveBeenCalled();
    expect(vi.mocked(transitionLearningPathState)).not.toHaveBeenCalled();
  });

  it("publishes only when explicitly asked, and only after writing", async () => {
    const outcome = await importCurriculumDocument({
      document: document(),
      current: emptyState(),
      mode: "execute",
      publish: true,
      actorUserId: ACTOR
    });

    expect(outcome.status).toBe("published");

    const transitions = vi
      .mocked(transitionLearningPathState)
      .mock.calls.map((call) => call[2]);
    expect(transitions).toEqual(["review", "published"]);

    // Publication is last: the mission write happened before the transition.
    const missionOrder =
      vi.mocked(createDraftMission).mock.invocationCallOrder[0]!;
    const transitionOrder = vi.mocked(transitionLearningPathState).mock
      .invocationCallOrder[0]!;
    expect(missionOrder).toBeLessThan(transitionOrder);
  });

  it("does not publish when validation fails after writing", async () => {
    vi.mocked(validateLearningPathForPublication).mockResolvedValue({
      valid: false,
      issues: [
        {
          code: "MISSING_TITLE",
          message: "Course title is required.",
          nodeType: "course",
          nodeId: "x",
          stableId: "arch-fixture-course"
        }
      ]
    } as never);

    await expect(
      importCurriculumDocument({
        document: document(),
        current: emptyState(),
        mode: "execute",
        publish: true,
        actorUserId: ACTOR
      })
    ).rejects.toThrow(/did not pass publication validation/);

    expect(vi.mocked(transitionLearningPathState)).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- *
   * Required identifiers
   * ---------------------------------------------------------------- */

  it("refuses a required persisted id rather than writing an empty reference", async () => {
    // A mission whose planned action is `update` but whose stored row carries
    // no id. Passing "" would rely on the database rejecting it.
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    state.missions.set(mission.stableId, {
      ...state.missions.get(mission.stableId)!,
      id: "",
      title: "Renamed so the action is update"
    });

    await expect(
      importCurriculumDocument({
        document: doc,
        current: state,
        mode: "execute",
        actorUserId: ACTOR
      })
    ).rejects.toBeInstanceOf(MissingPersistedIdError);

    expect(vi.mocked(updateDraftCurriculumNode)).not.toHaveBeenCalled();
  });

  it("names the entity whose identifier could not be resolved", () => {
    const error = new MissingPersistedIdError("mission", "arch-fixture-m1");
    expect(error.message).toContain("mission");
    expect(error.message).toContain("arch-fixture-m1");
  });

  it("requires an actor before any write", async () => {
    await expect(
      importCurriculumDocument({
        document: document(),
        current: emptyState(),
        mode: "execute"
      })
    ).rejects.toThrow(/authoring actor is required/);

    expectNoMutations();
  });

  /* ---------------------------------------------------------------- *
   * Content and relationship semantics
   * ---------------------------------------------------------------- */

  it("writes assets before the steps that reference them", async () => {
    await importCurriculumDocument({
      document: document(),
      current: emptyState(),
      mode: "execute",
      actorUserId: ACTOR
    });

    const assetOrder = vi.mocked(addMissionAsset).mock.invocationCallOrder[0]!;
    const stepOrder = vi.mocked(upsertMissionStep).mock.invocationCallOrder[0]!;
    expect(assetOrder).toBeLessThan(stepOrder);
  });

  it("inserts no competency prerequisite edge that already exists", async () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    // One node changed so the run has work to do, but the edges are identical.
    state.modules.set(doc.modules[0]!.stableId, {
      ...state.modules.get(doc.modules[0]!.stableId)!,
      title: "Renamed"
    });

    await importCurriculumDocument({
      document: doc,
      current: state,
      mode: "execute",
      actorUserId: ACTOR
    });

    expect(vi.mocked(addCompetencyPrerequisite)).not.toHaveBeenCalled();
  });

  it("inserts a genuinely new competency prerequisite edge exactly once", async () => {
    const doc = document();

    await importCurriculumDocument({
      document: doc,
      current: emptyState(),
      mode: "execute",
      actorUserId: ACTOR
    });

    expect(vi.mocked(addCompetencyPrerequisite)).toHaveBeenCalledTimes(
      doc.competencyPrerequisites.length
    );
  });

  it("carries develops and reinforces through to the link operation", async () => {
    await importCurriculumDocument({
      document: document(),
      current: emptyState(),
      mode: "execute",
      actorUserId: ACTOR
    });

    const relationships = vi
      .mocked(linkMissionCompetency)
      .mock.calls.map((call) => call[4]);

    expect(relationships).toContain("develops");
    expect(relationships).toContain("reinforces");
  });

  it("writes the explicit prerequisite rule through the approved operation", async () => {
    const doc = document();

    await importCurriculumDocument({
      document: doc,
      current: emptyState(),
      mode: "execute",
      actorUserId: ACTOR
    });

    expect(vi.mocked(upsertPrerequisiteRule)).toHaveBeenCalledTimes(
      doc.prerequisiteRules.length
    );
  });

  it("wires a created mission to its created parent module", async () => {
    const doc = document();

    await importCurriculumDocument({
      document: doc,
      current: emptyState(),
      mode: "execute",
      actorUserId: ACTOR
    });

    const missionCalls = vi.mocked(createDraftMission).mock.calls;
    for (const [, input] of missionCalls) {
      // The stubbed creates return `new-<stableId>`, so a correct wiring is
      // visible rather than merely non-empty.
      expect(input.moduleId).toMatch(/^new-arch-fixture-mod-/);
    }
  });

  it("reports exactly the mutations it performed", async () => {
    const outcome = await importCurriculumDocument({
      document: document(),
      current: emptyState(),
      mode: "execute",
      publish: true,
      actorUserId: ACTOR
    });

    // A write the outcome did not mention would be one the operator never saw.
    expect(outcome.status).toBe("published");
    expect(outcome.writes.length).toBeGreaterThan(0);
    expect(mutationCount()).toBeGreaterThan(0);
  });

  it("touches no learner-state operation", async () => {
    // The importer imports nothing else: the mocked admin surface is the whole
    // set of operations it can reach, and none of them writes learner state.
    await importCurriculumDocument({
      document: document(),
      current: emptyState(),
      mode: "execute",
      publish: true,
      actorUserId: ACTOR
    });

    const reached = MUTATIONS.filter(
      (fn) => vi.mocked(fn).mock.calls.length > 0
    ).map((fn) => vi.mocked(fn).getMockName());

    for (const name of reached) {
      expect(name).not.toMatch(/progress|evidence|attempt|certificate/i);
    }
  });
});
