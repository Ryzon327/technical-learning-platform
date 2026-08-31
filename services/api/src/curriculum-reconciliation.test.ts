import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseCurriculumDocument,
  type CurriculumDocument,
  type CurriculumDocumentAsset,
  type MissionStep
} from "@tlp/shared-types";
import {
  findPlannedNode,
  planConflictsByKind,
  planCurriculumReconciliation,
  planIsSafeToExecute,
  planRequiresWrites,
  plannedNodeKey,
  type CurriculumCurrentState,
  type ExistingCompetencyPrerequisiteEdge,
  type ExistingCurriculumNode,
  type ExistingMissionCompetencyLink,
  type ExistingPrerequisiteRule,
  type UnreadableMissionContent,
  type UnresolvedRelationship
} from "./curriculum-reconciliation";

/**
 * A mutable view of current state.
 *
 * `CurriculumCurrentState` exposes `ReadonlyMap` so the planner cannot alter
 * what it was given. Tests need to mutate a baseline to build each case, so they
 * hold the maps as `Map` and pass them where a `ReadonlyMap` is expected —
 * which is exactly the direction that assignment is allowed to go.
 */
interface MutableCurrentState {
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

/**
 * WP-G — the pre-mutation plan.
 *
 * Every case here is decided without a database, which is the point: the rule
 * these tests protect is that changed published curriculum is refused BEFORE
 * anything is written, and a rule that can only be exercised against a live
 * database is a rule nobody exercises.
 */

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

/** A stored node matching an authored one exactly. */
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

function emptyState(): MutableCurrentState {
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

/**
 * Current state that matches the document exactly, at a chosen publication
 * state. This is the "identical content" baseline every conflict test mutates.
 */
function matchingState(
  doc: CurriculumDocument,
  publicationState: "draft" | "published"
): MutableCurrentState {
  // Parents are wired with the real row ids the `node` helper generates, so a
  // hierarchy test can move a child by changing its parentId and have the
  // planner actually notice.
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
    modules: new Map(
      moduleNodes.map((module) => [module.stableId, module])
    ),
    missions: new Map(
      missionNodes.map((mission) => [mission.stableId, mission])
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

function actionFor(
  plan: ReturnType<typeof planCurriculumReconciliation>,
  stableId: string
): string {
  const found = plan.nodes.find((entry) => entry.stableId === stableId);
  if (!found) throw new Error(`no planned node for ${stableId}`);
  return found.action;
}

/* ------------------------------------------------------------------ *
 * Nodes
 * ------------------------------------------------------------------ */

describe("node reconciliation", () => {
  it("plans creates when nothing exists", () => {
    const plan = planCurriculumReconciliation(document(), emptyState());

    expect(plan.nodes.every((entry) => entry.action === "create")).toBe(true);
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("reuses identical draft content without mutating it", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(doc, matchingState(doc, "draft"));

    expect(plan.nodes.every((entry) => entry.action === "reuse")).toBe(true);
    expect(planRequiresWrites(plan)).toBe(false);
  });

  it("reuses identical PUBLISHED content, so a rerun is idempotent", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(
      doc,
      matchingState(doc, "published")
    );

    expect(plan.nodes.every((entry) => entry.action === "reuse")).toBe(true);
    expect(plan.conflicts).toEqual([]);
    expect(planIsSafeToExecute(plan)).toBe(true);
    expect(planRequiresWrites(plan)).toBe(false);
  });

  it("updates a changed DRAFT node", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const stored = state.modules.get(doc.modules[0]!.stableId)!;
    state.modules.set(stored.stableId, { ...stored, title: "Renamed" });

    const plan = planCurriculumReconciliation(doc, state);

    expect(actionFor(plan, stored.stableId)).toBe("update");
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("conflicts on a changed PUBLISHED node and names the field", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const stored = state.modules.get(doc.modules[0]!.stableId)!;
    state.modules.set(stored.stableId, { ...stored, title: "Renamed" });

    const plan = planCurriculumReconciliation(doc, state);

    expect(actionFor(plan, stored.stableId)).toBe("conflict");
    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(plan.conflicts[0]?.kind).toBe("published_content");
    // The message names the actual state rather than assuming "published", so
    // a review-state refusal does not send an operator looking for the wrong
    // thing.
    expect(plan.conflicts[0]?.message).toContain('state "published"');
    expect(plan.conflicts[0]?.message).toContain("title");
  });

  it("treats an absent optional field and a null column as the same", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const competency = doc.competencies[0]!;
    const stored = state.competencies.get(competency.stableId)!;
    state.competencies.set(competency.stableId, {
      ...stored,
      estimatedMinutes: null
    });

    const plan = planCurriculumReconciliation(doc, state);

    expect(actionFor(plan, competency.stableId)).toBe("reuse");
  });
});

/* ------------------------------------------------------------------ *
 * Instructional content
 * ------------------------------------------------------------------ */

describe("mission content reconciliation", () => {
  function contentAction(
    plan: ReturnType<typeof planCurriculumReconciliation>,
    missionStableId: string
  ): string {
    const found = plan.missionContent.find(
      (entry) => entry.missionStableId === missionStableId
    );
    if (!found) throw new Error(`no planned content for ${missionStableId}`);
    return found.action;
  }

  it("reuses identical steps and assets", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(
      doc,
      matchingState(doc, "published")
    );

    expect(
      plan.missionContent.every((entry) => entry.action === "reuse")
    ).toBe(true);
  });

  it("is insensitive to the order of the stored arrays", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const mission = doc.missions[0]!;
    state.missionSteps.set(mission.stableId, [...mission.steps].reverse());

    const plan = planCurriculumReconciliation(doc, state);

    expect(contentAction(plan, mission.stableId)).toBe("reuse");
  });

  it("updates changed steps beneath a DRAFT mission", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    state.missionSteps.set(mission.stableId, mission.steps.slice(1));

    const plan = planCurriculumReconciliation(doc, state);

    expect(contentAction(plan, mission.stableId)).toBe("update");
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("conflicts on changed steps beneath a PUBLISHED mission", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const mission = doc.missions[0]!;
    state.missionSteps.set(mission.stableId, mission.steps.slice(1));

    const plan = planCurriculumReconciliation(doc, state);

    expect(contentAction(plan, mission.stableId)).toBe("conflict");
    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(plan.conflicts.some((entry) => entry.message.includes("steps"))).toBe(true);
  });

  it("conflicts on changed assets beneath a PUBLISHED mission", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const mission = doc.missions[0]!;
    state.missionAssets.set(mission.stableId, []);

    const plan = planCurriculumReconciliation(doc, state);

    expect(contentAction(plan, mission.stableId)).toBe("conflict");
    expect(plan.conflicts.some((entry) => entry.message.includes("assets"))).toBe(true);
  });

  it("plans content as a create when the mission itself is new", () => {
    // Beneath a DRAFT module. A new mission under a PUBLISHED module is a
    // published-content conflict; that case is covered separately below.
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    state.missions.delete(mission.stableId);
    state.missionSteps.delete(mission.stableId);
    state.missionAssets.delete(mission.stableId);
    state.missionCompetencyLinks.delete(mission.stableId);
    state.childMissionsOfModule.set(mission.moduleStableId, []);

    const plan = planCurriculumReconciliation(doc, state);

    expect(contentAction(plan, mission.stableId)).toBe("create");
    expect(planIsSafeToExecute(plan)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Hierarchy
 *
 * The document is authoritative for the tree it describes. Two failures live
 * here that comparing node fields alone can never see: a child the document has
 * dropped, and a child that exists under a different parent.
 * ------------------------------------------------------------------ */

describe("hierarchy reconciliation", () => {
  it("refuses a stored module the document no longer contains", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    state.childModulesOfCourse = [
      ...state.childModulesOfCourse,
      node({
        stableId: "arch-fixture-mod-retired",
        parentId: state.course?.id ?? null
      })
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(
      planConflictsByKind(plan, "unsupported_removal").some((entry) =>
        entry.message.includes("arch-fixture-mod-retired")
      )
    ).toBe(true);
  });

  it("refuses a stored mission the document no longer contains", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const module = doc.modules[0]!;
    state.childMissionsOfModule.set(module.stableId, [
      ...(state.childMissionsOfModule.get(module.stableId) ?? []),
      node({
        stableId: "arch-fixture-m-retired",
        parentId: state.modules.get(module.stableId)?.id ?? null
      })
    ]);

    const plan = planCurriculumReconciliation(doc, state);

    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(
      planConflictsByKind(plan, "unsupported_removal").some((entry) =>
        entry.message.includes("arch-fixture-m-retired")
      )
    ).toBe(true);
  });

  it("reports a dropped child beneath published curriculum as immutability", () => {
    // Both reasons are true; publication immutability is the controlling one
    // and is what the author has to act on.
    const doc = document();
    const state = matchingState(doc, "published");
    state.childModulesOfCourse = [
      ...state.childModulesOfCourse,
      node({
        stableId: "arch-fixture-mod-retired",
        publicationState: "published",
        parentId: state.course?.id ?? null
      })
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(
      planConflictsByKind(plan, "published_content").some((entry) =>
        entry.message.includes("arch-fixture-mod-retired")
      )
    ).toBe(true);
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("refuses a node found beneath a different parent", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    const stored = state.missions.get(mission.stableId)!;
    state.missions.set(mission.stableId, {
      ...stored,
      parentId: "some-other-module-row"
    });

    const plan = planCurriculumReconciliation(doc, state);

    expect(
      plan.nodes.find(
        (entry) => entry.kind === "mission" && entry.stableId === mission.stableId
      )?.action
    ).toBe("unsupported_removal");
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("conflicts on a new module beneath a published course", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const module = doc.modules[1]!;
    state.modules.delete(module.stableId);
    state.childModulesOfCourse = state.childModulesOfCourse.filter(
      (entry) => entry.stableId !== module.stableId
    );

    const plan = planCurriculumReconciliation(doc, state);

    expect(
      plan.nodes.find(
        (entry) => entry.kind === "module" && entry.stableId === module.stableId
      )?.action
    ).toBe("conflict");
    expect(planConflictsByKind(plan, "published_content").length).toBeGreaterThan(
      0
    );
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("conflicts on a new mission beneath a published module", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const mission = doc.missions[0]!;
    state.missions.delete(mission.stableId);
    state.missionSteps.delete(mission.stableId);
    state.missionAssets.delete(mission.stableId);
    state.missionCompetencyLinks.delete(mission.stableId);
    state.childMissionsOfModule.set(mission.moduleStableId, []);

    const plan = planCurriculumReconciliation(doc, state);

    expect(
      plan.nodes.find(
        (entry) =>
          entry.kind === "mission" && entry.stableId === mission.stableId
      )?.action
    ).toBe("conflict");
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("still creates a whole tree when nothing exists at all", () => {
    // The published-parent rule must not block a first import, where there is
    // no parent to be published.
    const doc = document();
    const plan = planCurriculumReconciliation(doc, emptyState());

    expect(plan.nodes.every((entry) => entry.action === "create")).toBe(true);
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("fails closed when a stored relationship identity cannot be resolved", () => {
    // An unresolvable stored link is indistinguishable from an absent one, so
    // treating it as absent would make a destructive difference vanish from the
    // plan while the import reported success.
    const doc = document();
    const state = matchingState(doc, "draft");
    state.unresolvedRelationships = [
      { kind: "mission_competency", rowId: "competency-row-9f2" }
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(
      plan.conflicts.some((entry) =>
        entry.message.includes("competency-row-9f2")
      )
    ).toBe(true);
  });

  it("fails closed when stored mission steps could not be read", () => {
    // `content_error` means rows EXIST and cannot be compared. Recording that
    // as an empty list would make removal detection blind, and would let an
    // import report success while leaving invalid rows in place.
    const doc = document();
    const state = matchingState(doc, "draft");
    state.unreadableMissionContent = [
      {
        missionStableId: doc.missions[0]!.stableId,
        what: "steps",
        detail: "step-broken: paragraphs must be an array"
      }
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(
      planConflictsByKind(plan, "unreadable_persisted_content")[0]?.message
    ).toContain("step-broken");
  });

  it("fails closed when stored mission assets could not be read", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    state.unreadableMissionContent = [
      {
        missionStableId: doc.missions[0]!.stableId,
        what: "assets",
        detail: "fixture-topology: alt text is required"
      }
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("refuses unreadable content even when the document authors none", () => {
    // The dangerous case: an empty authored list compared against a falsely
    // empty stored list reports `reuse`, and the invalid rows survive silently.
    const doc = document();
    const mission = doc.missions[1]!;
    const state = matchingState(doc, "draft");
    state.missionSteps.set(mission.stableId, []);
    state.unreadableMissionContent = [
      {
        missionStableId: mission.stableId,
        what: "steps",
        detail: "unreadable"
      }
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("reports unreadable content as its own kind, not as removal or immutability", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    state.unreadableMissionContent = [
      { missionStableId: doc.missions[0]!.stableId, what: "steps", detail: "x" }
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(planConflictsByKind(plan, "published_content")).toEqual([]);
    expect(planConflictsByKind(plan, "unsupported_removal")).toEqual([]);
    expect(
      planConflictsByKind(plan, "unreadable_persisted_content").length
    ).toBeGreaterThan(0);
  });

  it("reports an unresolved relationship as unreadable, not as removal", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    state.unresolvedRelationships = [
      { kind: "mission_competency", rowId: "competency-row-9f2" }
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(planConflictsByKind(plan, "unsupported_removal")).toEqual([]);
    expect(
      planConflictsByKind(plan, "unreadable_persisted_content").length
    ).toBeGreaterThan(0);
  });

  it("plans node identity by kind and stable id together", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(doc, matchingState(doc, "draft"));

    expect(
      findPlannedNode(plan, "module", doc.modules[0]!.stableId)?.kind
    ).toBe("module");
    // The same id asked about as a different kind is not the same entry.
    expect(
      findPlannedNode(plan, "mission", doc.modules[0]!.stableId)
    ).toBeUndefined();
    expect(plannedNodeKey("module", "x")).not.toBe(plannedNodeKey("mission", "x"));
  });
});

/* ------------------------------------------------------------------ *
 * Unsupported destructive reconciliation
 *
 * WP-G holds no DELETE privilege on any curriculum table. Anything the
 * database contains that the authored document has dropped therefore cannot be
 * removed — and upserting only what the document contains would leave the stale
 * row behind while reporting success. These prove the refusal, and prove it is
 * reported as a removal limitation rather than as a published-content conflict.
 * ------------------------------------------------------------------ */

describe("removal is refused rather than performed", () => {
  function removalConflicts(plan: ReturnType<typeof planCurriculumReconciliation>) {
    return planConflictsByKind(plan, "unsupported_removal");
  }

  it("15. refuses a stored step the document no longer authors", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    // The database has an extra step; the document dropped it.
    state.missionSteps.set(mission.stableId, [
      ...mission.steps,
      { ...mission.steps[0]!, stableId: "step-retired", position: 99 }
    ]);

    const plan = planCurriculumReconciliation(doc, state);

    expect(
      plan.missionContent.find(
        (entry) => entry.missionStableId === mission.stableId
      )?.action
    ).toBe("unsupported_removal");
    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(removalConflicts(plan)[0]?.message).toContain("step-retired");
    expect(removalConflicts(plan)[0]?.message).toContain("outside WP-G");
  });

  it("16. refuses a stored asset the document no longer authors", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    state.missionAssets.set(mission.stableId, [
      ...mission.assets,
      { ...mission.assets[0]!, stableId: "asset-retired", position: 99 }
    ]);

    const plan = planCurriculumReconciliation(doc, state);

    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(removalConflicts(plan)[0]?.message).toContain("asset-retired");
  });

  it("reports removal as a removal, not as a published-content conflict", () => {
    // The two refusals have different causes and different remedies. Calling a
    // dropped draft step a published-content change would send an author
    // looking for a change they never made.
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    state.missionSteps.set(mission.stableId, [
      ...mission.steps,
      { ...mission.steps[0]!, stableId: "step-retired", position: 99 }
    ]);

    const plan = planCurriculumReconciliation(doc, state);

    expect(planConflictsByKind(plan, "published_content")).toEqual([]);
    expect(removalConflicts(plan).length).toBeGreaterThan(0);
  });

  it("21. refuses a stored competency link the document no longer authors", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    state.missionCompetencyLinks.set(mission.stableId, [
      ...(state.missionCompetencyLinks.get(mission.stableId) ?? []),
      {
        competencyStableId: "arch.fixture-secondary",
        required: false,
        relationship: "reinforces"
      }
    ]);

    const plan = planCurriculumReconciliation(doc, state);

    expect(
      plan.missionCompetencyLinks.find(
        (entry) => entry.missionStableId === mission.stableId
      )?.action
    ).toBe("unsupported_removal");
    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(removalConflicts(plan)[0]?.message).toContain(
      "arch.fixture-secondary"
    );
  });

  it("25. refuses a stored prerequisite edge the document no longer authors", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    state.competencyPrerequisiteEdges = [
      ...state.competencyPrerequisiteEdges,
      {
        competencyStableId: "arch.fixture-primary",
        prerequisiteCompetencyStableId: "arch.fixture-secondary"
      }
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(plan.competencyPrerequisites.action).toBe("unsupported_removal");
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("refuses a stored explicit rule the document no longer authors", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    state.prerequisiteRules = [
      ...state.prerequisiteRules,
      {
        targetNodeType: "mission",
        targetStableId: "arch-fixture-m2-reuse",
        requirementType: "competency",
        requirementStableId: "arch.fixture-primary",
        explanation: "A rule the document dropped.",
        active: true
      }
    ];

    const plan = planCurriculumReconciliation(doc, state);

    expect(
      plan.prerequisiteRules.some(
        (entry) => entry.action === "unsupported_removal"
      )
    ).toBe(true);
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("5/48. resolves removal by refusing, never by deleting", () => {
    // The plan vocabulary has no delete action, so there is nothing for an
    // executor to interpret as one.
    const doc = document();
    const state = matchingState(doc, "draft");
    state.competencyPrerequisiteEdges = [
      ...state.competencyPrerequisiteEdges,
      {
        competencyStableId: "arch.fixture-primary",
        prerequisiteCompetencyStableId: "arch.fixture-secondary"
      }
    ];

    const plan = planCurriculumReconciliation(doc, state);
    const actions = [
      ...plan.nodes.map((entry) => entry.action),
      ...plan.missionContent.map((entry) => entry.action),
      ...plan.missionCompetencyLinks.map((entry) => entry.action),
      plan.competencyPrerequisites.action,
      ...plan.prerequisiteRules.map((entry) => entry.action)
    ];

    for (const action of actions) {
      expect(["create", "reuse", "update", "conflict", "unsupported_removal"]).toContain(
        action
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * Mission competency relationships
 * ------------------------------------------------------------------ */

describe("mission competency links", () => {
  function linkAction(
    plan: ReturnType<typeof planCurriculumReconciliation>,
    missionStableId: string
  ): string {
    const found = plan.missionCompetencyLinks.find(
      (entry) => entry.missionStableId === missionStableId
    );
    if (!found) throw new Error(`no planned links for ${missionStableId}`);
    return found.action;
  }

  it("18. reuses identical relationships", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(doc, matchingState(doc, "draft"));

    expect(
      plan.missionCompetencyLinks.every((entry) => entry.action === "reuse")
    ).toBe(true);
    expect(planRequiresWrites(plan)).toBe(false);
  });

  it("19. creates relationships for a new mission", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(doc, emptyState());

    expect(
      plan.missionCompetencyLinks.every((entry) => entry.action === "create")
    ).toBe(true);
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("20. updates a changed relationship attribute under a draft mission", () => {
    // `linkMissionCompetency` upserts on (mission, competency), so `required`
    // and `relationship` are revisable through the existing operation.
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    state.missionCompetencyLinks.set(
      mission.stableId,
      (state.missionCompetencyLinks.get(mission.stableId) ?? []).map((link) => ({
        ...link,
        required: !link.required
      }))
    );

    const plan = planCurriculumReconciliation(doc, state);

    expect(linkAction(plan, mission.stableId)).toBe("update");
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("detects a changed relationship value, not only a changed set", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const mission = doc.missions[0]!;
    state.missionCompetencyLinks.set(
      mission.stableId,
      (state.missionCompetencyLinks.get(mission.stableId) ?? []).map((link) => ({
        ...link,
        relationship: "reinforces"
      }))
    );

    const plan = planCurriculumReconciliation(doc, state);

    expect(linkAction(plan, mission.stableId)).toBe("update");
  });

  it("22. conflicts when a published mission's relationships change", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const mission = doc.missions[0]!;
    state.missionCompetencyLinks.set(
      mission.stableId,
      (state.missionCompetencyLinks.get(mission.stableId) ?? []).map((link) => ({
        ...link,
        required: !link.required
      }))
    );

    const plan = planCurriculumReconciliation(doc, state);

    expect(linkAction(plan, mission.stableId)).toBe("conflict");
    expect(planConflictsByKind(plan, "published_content").length).toBeGreaterThan(
      0
    );
  });
});

/* ------------------------------------------------------------------ *
 * Competency prerequisite edges
 * ------------------------------------------------------------------ */

describe("competency prerequisite edges", () => {
  it("23. reuses an identical edge and plans no insert", () => {
    // `addCompetencyPrerequisite` is a plain INSERT: re-inserting an existing
    // edge raises a unique violation. Planning it as reuse with an empty
    // toCreate is what keeps a rerun from erroring.
    const doc = document();
    const plan = planCurriculumReconciliation(doc, matchingState(doc, "draft"));

    expect(plan.competencyPrerequisites.action).toBe("reuse");
    expect(plan.competencyPrerequisites.toCreate).toEqual([]);
    expect(planRequiresWrites(plan)).toBe(false);
  });

  it("24. creates a genuinely new edge beneath draft competencies", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    state.competencyPrerequisiteEdges = [];

    const plan = planCurriculumReconciliation(doc, state);

    expect(plan.competencyPrerequisites.action).toBe("create");
    expect(plan.competencyPrerequisites.toCreate).toHaveLength(
      doc.competencyPrerequisites.length
    );
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("26. conflicts when a published competency would gain a prerequisite", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    state.competencyPrerequisiteEdges = [];

    const plan = planCurriculumReconciliation(doc, state);

    expect(plan.competencyPrerequisites.action).toBe("conflict");
    expect(plan.competencyPrerequisites.toCreate).toEqual([]);
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("plans no update, because an edge has no attributes to revise", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(doc, matchingState(doc, "draft"));

    expect(plan.competencyPrerequisites.action).not.toBe("update");
  });
});

/* ------------------------------------------------------------------ *
 * Prerequisite rules
 * ------------------------------------------------------------------ */

describe("prerequisite rule reconciliation", () => {
  function ruleAction(
    plan: ReturnType<typeof planCurriculumReconciliation>
  ): string {
    const found = plan.prerequisiteRules[0];
    if (!found) throw new Error("no planned prerequisite rule");
    return found.action;
  }

  it("1. creates a missing rule when the target is a draft", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const next = { ...state, prerequisiteRules: [] as ExistingPrerequisiteRule[] };

    const plan = planCurriculumReconciliation(doc, next);

    expect(ruleAction(plan)).toBe("create");
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("2. reuses an identical rule when the target is a draft", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(doc, matchingState(doc, "draft"));

    expect(ruleAction(plan)).toBe("reuse");
    expect(planRequiresWrites(plan)).toBe(false);
  });

  it("3. updates a changed rule when the target is a draft", () => {
    const doc = document();
    const state = matchingState(doc, "draft");
    const next = {
      ...state,
      prerequisiteRules: state.prerequisiteRules.map((rule) => ({
        ...rule,
        explanation: "Different wording."
      }))
    };

    const plan = planCurriculumReconciliation(doc, next);

    expect(ruleAction(plan)).toBe("update");
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("4. reuses an identical rule when the target is published", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(
      doc,
      matchingState(doc, "published")
    );

    expect(ruleAction(plan)).toBe("reuse");
    expect(planIsSafeToExecute(plan)).toBe(true);
  });

  it("5. conflicts on a NEW rule when the target is published", () => {
    // Adding a gate beneath published curriculum changes who may enter it.
    const doc = document();
    const state = matchingState(doc, "published");
    const next = { ...state, prerequisiteRules: [] as ExistingPrerequisiteRule[] };

    const plan = planCurriculumReconciliation(doc, next);

    expect(ruleAction(plan)).toBe("conflict");
    expect(planIsSafeToExecute(plan)).toBe(false);
    expect(
      plan.conflicts.some((entry) => entry.message.includes("would be added"))
    ).toBe(true);
  });

  it("6. conflicts on a changed rule when the target is published", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const next = {
      ...state,
      prerequisiteRules: state.prerequisiteRules.map((rule) => ({
        ...rule,
        explanation: "Different wording."
      }))
    };

    const plan = planCurriculumReconciliation(doc, next);

    expect(ruleAction(plan)).toBe("conflict");
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("6b. conflicts on reactivating a deactivated rule under published curriculum", () => {
    // `active` is a WHERE filter in learning-navigation.ts, so flipping it
    // changes whether the gate applies at all.
    const doc = document();
    const state = matchingState(doc, "published");
    const next = {
      ...state,
      prerequisiteRules: state.prerequisiteRules.map((rule) => ({
        ...rule,
        active: false
      }))
    };

    const plan = planCurriculumReconciliation(doc, next);

    expect(ruleAction(plan)).toBe("conflict");
    expect(
      plan.conflicts.some((entry) => entry.message.includes("active"))
    ).toBe(true);
  });

  it("7. a prerequisite conflict alone makes the plan unsafe", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const next = { ...state, prerequisiteRules: [] as ExistingPrerequisiteRule[] };

    const plan = planCurriculumReconciliation(doc, next);

    // Nothing else conflicts: every node and every mission's content matches.
    expect(plan.nodes.every((entry) => entry.action === "reuse")).toBe(true);
    expect(
      plan.missionContent.every((entry) => entry.action === "reuse")
    ).toBe(true);

    // The prerequisite conflict is nonetheless inside the plan the gate reads.
    expect(plan.conflicts.length).toBeGreaterThan(0);
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("8. every conflict category lands in the one list the gate inspects", () => {
    const doc = document();
    const state = matchingState(doc, "published");
    const module = doc.modules[0]!;
    const mission = doc.missions[0]!;

    const stored = state.modules.get(module.stableId)!;
    state.modules.set(module.stableId, { ...stored, title: "Renamed" });
    state.missionSteps.set(mission.stableId, []);

    const plan = planCurriculumReconciliation(doc, {
      ...state,
      prerequisiteRules: []
    });

    const kinds = {
      node: plan.nodes.some((entry) => entry.action === "conflict"),
      content: plan.missionContent.some((entry) => entry.action === "conflict"),
      prerequisite: plan.prerequisiteRules.some(
        (entry) => entry.action === "conflict"
      )
    };

    expect(kinds).toEqual({ node: true, content: true, prerequisite: true });
    expect(plan.conflicts.length).toBeGreaterThanOrEqual(3);
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("34. every collection the importer writes participates in the plan", () => {
    // A section absent from the plan would be a write the safety gate never
    // inspected, which is the one thing "complete plan before mutation" must
    // rule out.
    const doc = document();
    const plan = planCurriculumReconciliation(doc, matchingState(doc, "draft"));

    expect(Object.keys(plan).sort()).toEqual([
      "competencyPrerequisites",
      "conflicts",
      "missionCompetencyLinks",
      "missionContent",
      "nodes",
      "prerequisiteRules"
    ]);
  });

  it("35. an unsafe plan is unsafe regardless of having work to do", () => {
    // planRequiresWrites and planIsSafeToExecute answer different questions.
    // Being unsafe is never overridden by having writes to perform.
    const doc = document();
    const state = matchingState(doc, "published");
    const mission = doc.missions[0]!;
    state.missionSteps.set(mission.stableId, mission.steps.slice(1));

    const plan = planCurriculumReconciliation(doc, state);

    expect(planRequiresWrites(plan)).toBe(true);
    expect(planIsSafeToExecute(plan)).toBe(false);
  });

  it("37. an identical complete rerun requires no writes at all", () => {
    const doc = document();

    for (const state of ["draft", "published"] as const) {
      const plan = planCurriculumReconciliation(doc, matchingState(doc, state));
      expect(planIsSafeToExecute(plan)).toBe(true);
      expect(planRequiresWrites(plan)).toBe(false);
    }
  });

  it("9. rule identity cannot collide through delimiter-bearing values", () => {
    // Two rules that a naive joined key would merge into one. If they collided,
    // the second would be reported as an existing rule and its conflict hidden.
    const doc = document();
    const state = matchingState(doc, "draft");

    const crafted: CurriculumDocument = {
      ...doc,
      prerequisiteRules: [
        {
          targetNodeType: "mission",
          targetStableId: "a.b",
          requirementType: "content_completion",
          requirementStableId: "c.d",
          explanation: "First rule."
        },
        {
          targetNodeType: "mission",
          targetStableId: "a",
          requirementType: "content_completion",
          requirementStableId: "b.c.d",
          explanation: "Second rule."
        }
      ]
    };

    const plan = planCurriculumReconciliation(crafted, {
      ...state,
      missions: new Map(),
      prerequisiteRules: [
        {
          targetNodeType: "mission",
          targetStableId: "a.b",
          requirementType: "content_completion",
          requirementStableId: "c.d",
          explanation: "First rule.",
          active: true
        }
      ]
    });

    // The first matches the stored rule; the second is genuinely absent. A
    // colliding key would have reported both as reuse.
    expect(plan.prerequisiteRules.map((entry) => entry.action)).toEqual([
      "reuse",
      "create"
    ]);
  });

  it("10. introduces no prerequisite versioning or new identity fields", () => {
    const doc = document();
    const plan = planCurriculumReconciliation(doc, matchingState(doc, "draft"));
    const planned = plan.prerequisiteRules[0]!;

    expect(Object.keys(planned).sort()).toEqual([
      "action",
      "changedFields",
      "requirementStableId",
      "targetNodeType",
      "targetStableId"
    ]);
    expect("version" in planned).toBe(false);
    expect("publicationState" in planned).toBe(false);
  });

  it("borrows the target node's publication state, not the rule's own", () => {
    // The rule table has no publication_state. The protection boundary is the
    // node the rule gates, because that is where its effect lands.
    const doc = document();
    const rule = doc.prerequisiteRules[0]!;

    const draftTarget = matchingState(doc, "draft");
    const publishedTarget = matchingState(doc, "published");

    const mutated = (state: CurriculumCurrentState) => ({
      ...state,
      prerequisiteRules: state.prerequisiteRules.map((entry) => ({
        ...entry,
        explanation: "Changed."
      }))
    });

    expect(rule.targetNodeType).toBe("mission");
    expect(
      planCurriculumReconciliation(doc, mutated(draftTarget))
        .prerequisiteRules[0]?.action
    ).toBe("update");
    expect(
      planCurriculumReconciliation(doc, mutated(publishedTarget))
        .prerequisiteRules[0]?.action
    ).toBe("conflict");
  });
});
