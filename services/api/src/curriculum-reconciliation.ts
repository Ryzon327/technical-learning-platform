import type {
  CurriculumDocument,
  CurriculumDocumentAsset,
  CurriculumDocumentMissionCompetency,
  CurriculumDocumentPrerequisiteRule,
  MissionStep
} from "@tlp/shared-types";

/**
 * WP-G — deciding what an import would do, before it does any of it.
 *
 * ## Why this is a separate, pure module
 *
 * Architect Decision 1 requires that changed published curriculum **fails
 * loudly before mutation**. "Before mutation" is the whole requirement: a
 * conflict discovered halfway through a write pass has already changed part of
 * the course, and the REST admin layer has no transaction to undo it.
 *
 * So planning is separated from writing. The importer reads current state,
 * builds one complete plan here — nodes, instructional content and prerequisite
 * rules together — and only then writes. If that plan contains a single
 * conflict, nothing is written at all.
 *
 * The plan is a pure function over plain values, so every branch is testable
 * without a database. That matters for a rule whose failure mode is silent
 * corruption of published curriculum.
 *
 * ## The five outcomes
 *
 *   create               nothing with this identity exists
 *   reuse                it exists and the authored content matches
 *   update               it exists as a DRAFT and the authored content differs
 *   conflict             it exists as PUBLISHED and the authored content differs
 *   unsupported_removal  it exists in the database and the authored document no
 *                        longer contains it
 *
 * The last two are both terminal and are deliberately distinct. See `NodeAction`.
 *
 * ## Why removal is a refusal rather than a deletion
 *
 * Every write this package performs is a create or an upsert. WP-G holds no
 * DELETE privilege on any curriculum table and does not ask for one, so an item
 * dropped from the authored document simply cannot be removed from the database.
 *
 * Upserting only what the document contains would leave the stale row in place
 * and report success, which is the worst of the three options: the database
 * would no longer equal the authored source, and nobody would be told. Refusing
 * is the honest behaviour until a reviewed removal capability exists.
 *
 * ## What is reconciled
 *
 * Everything the importer writes, because anything it writes without planning
 * would be a mutation the safety gate never saw:
 *
 *   curriculum nodes            path, course, modules, missions, competencies
 *   mission instructional content  steps and assets
 *   mission_competencies        develops/reinforces links
 *   competency_prerequisites    competency dependency edges
 *   learning_prerequisite_rules explicit entry requirements
 *
 * ## What comparison means
 *
 * Only fields the importer would write are compared — a difference in a field
 * nobody authors is not a change to authored content, and reporting it would
 * make every import a conflict.
 *
 * Comparison is exact. Nothing is trimmed, normalized or case-folded first: the
 * parser already refused anything that needed repairing, so a difference here is
 * a real one.
 */

/* ------------------------------------------------------------------ *
 * Current state, as the importer reads it
 * ------------------------------------------------------------------ */

/** One curriculum node as it currently exists. */
export interface ExistingCurriculumNode {
  readonly id: string;
  readonly stableId: string;
  readonly version: number;
  readonly publicationState: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number | null;
  readonly estimatedMinutes: number | null;
  /**
   * The row id of the node this one belongs to, or null for a learning path.
   *
   * Carried so the plan can tell "this stable id already exists" from "this
   * stable id already exists **somewhere else in the tree**". Reusing an id
   * found under a different parent would silently reparent curriculum, and WP-G
   * has no authorized way to move a node.
   */
  readonly parentId: string | null;
}

/**
 * One stored mission-competency link.
 *
 * Identity is `(mission, competency)`; `required` and `relationship` are its
 * attributes. `linkMissionCompetency` upserts on the primary key, so both
 * attributes are revisable through the existing operation — but the pair itself
 * can only be added, never removed.
 */
export interface ExistingMissionCompetencyLink {
  readonly competencyStableId: string;
  readonly required: boolean;
  readonly relationship: string | null;
}

/**
 * A stored relationship whose competency identity could not be resolved.
 *
 * The reader translates competency row ids back to stable ids so the plan can
 * compare them against the document. When a row id resolves to nothing, the
 * relationship cannot be compared.
 *
 * Skipping it would be the dangerous choice: an unresolvable stored link is
 * indistinguishable from an absent one, so a destructive difference would vanish
 * from the plan and the import would report success while leaving the row in
 * place. The reader reports these and the plan refuses.
 */
export interface UnresolvedRelationship {
  readonly kind: "mission_competency" | "competency_prerequisite";
  /** The row id that could not be translated. */
  readonly rowId: string;
}

/**
 * A mission whose persisted instructional content could not be read.
 *
 * `readMissionSteps` and `readMissionAssets` throw on a transport failure, so
 * that case never arrives here. What does arrive is `content_error`: rows exist
 * and are structurally invalid.
 *
 * Treating that as "no stored content" would be the dangerous simplification.
 * Two things break at once. Removal detection compares the document against an
 * empty list and finds nothing missing, so a step the document dropped stays
 * invisible. And if the document authors no steps for that mission, the
 * comparison reports `reuse` — the import succeeds, reports success, and leaves
 * invalid rows in place with nobody told.
 *
 * So it is reported instead, and the plan refuses. The remedy is not an import:
 * it is inspecting or repairing the stored rows.
 */
export interface UnreadableMissionContent {
  readonly missionStableId: string;
  readonly what: "steps" | "assets";
  /** What the reader said, for diagnosis. */
  readonly detail: string;
}

/**
 * One stored competency prerequisite edge.
 *
 * The edge carries no attributes: its identity IS the relationship. So there is
 * no meaningful "update" for one, and this module does not invent one — an edge
 * is present or absent.
 */
export interface ExistingCompetencyPrerequisiteEdge {
  readonly competencyStableId: string;
  readonly prerequisiteCompetencyStableId: string;
}

/** One stored prerequisite rule, as `readPrerequisiteRules` returns it. */
export interface ExistingPrerequisiteRule {
  readonly targetNodeType: string;
  readonly targetStableId: string;
  readonly requirementType: string;
  readonly requirementStableId: string;
  readonly explanation: string;
  readonly active: boolean;
}

/** Everything the planner needs to know about the target database. */
export interface CurriculumCurrentState {
  readonly learningPath: ExistingCurriculumNode | null;
  readonly course: ExistingCurriculumNode | null;
  /** Keyed by stable id. */
  readonly modules: ReadonlyMap<string, ExistingCurriculumNode>;
  readonly missions: ReadonlyMap<string, ExistingCurriculumNode>;
  readonly competencies: ReadonlyMap<string, ExistingCurriculumNode>;
  /** Steps already authored, keyed by mission stable id. */
  readonly missionSteps: ReadonlyMap<string, readonly MissionStep[]>;
  /** Assets already authored, keyed by mission stable id. */
  readonly missionAssets: ReadonlyMap<
    string,
    readonly CurriculumDocumentAsset[]
  >;
  /**
   * Every stored course beneath the authored learning path row.
   *
   * Read by PARENT rather than by authored identity, because the question is
   * "what is in this tree that the document no longer describes" — and asking
   * only about ids the document still contains could never answer it.
   *
   * Empty when the parent does not exist yet.
   */
  readonly childCoursesOfPath: readonly ExistingCurriculumNode[];
  /** Every stored module beneath the authored course row. */
  readonly childModulesOfCourse: readonly ExistingCurriculumNode[];
  /** Every stored mission beneath each authored module row, by module stable id. */
  readonly childMissionsOfModule: ReadonlyMap<
    string,
    readonly ExistingCurriculumNode[]
  >;
  /** Stored competency links, keyed by mission stable id. */
  readonly missionCompetencyLinks: ReadonlyMap<
    string,
    readonly ExistingMissionCompetencyLink[]
  >;
  /** Stored edges among the competencies this document names. */
  readonly competencyPrerequisiteEdges: readonly ExistingCompetencyPrerequisiteEdge[];
  /** Every stored rule targeting a node named by this document. */
  readonly prerequisiteRules: readonly ExistingPrerequisiteRule[];
  /**
   * Stored relationships the reader could not translate to stable ids.
   *
   * Non-empty makes the plan unsafe. See `UnresolvedRelationship`.
   */
  readonly unresolvedRelationships: readonly UnresolvedRelationship[];
  /**
   * Missions whose stored steps or assets could not be read.
   *
   * Non-empty makes the plan unsafe. See `UnreadableMissionContent`.
   */
  readonly unreadableMissionContent: readonly UnreadableMissionContent[];
}

/**
 * What reconciliation would do about one thing.
 *
 * `conflict` and `unsupported_removal` are both refusals, and they are separate
 * values because they have different causes and different remedies:
 *
 *   conflict             the target is PUBLISHED and its authored content
 *                        changed. The remedy is a re-versioning capability,
 *                        deferred to a separately reviewed package.
 *   unsupported_removal  something exists in the database that the authored
 *                        document no longer contains. Removing it needs DELETE,
 *                        which WP-G deliberately does not have.
 *
 * Reporting the second as the first would tell an author their published
 * curriculum changed when in fact they deleted a step from a draft. Both stop
 * the import; only an accurate message tells them what to do next.
 */
export type NodeAction =
  | "create"
  | "reuse"
  | "update"
  | "conflict"
  | "unsupported_removal";

/**
 * Why a plan is unsafe.
 *
 *   published_content            the target is published and would change
 *   unsupported_removal          something exists that the document dropped
 *   unreadable_persisted_content stored content exists but could not be read,
 *                                so it cannot be compared against the document
 *
 * Three kinds rather than two because they are fixed differently. Telling an
 * author their published curriculum changed, when in fact a stored step is
 * malformed and unreadable, sends them to the wrong place entirely.
 */
export type ReconciliationConflictKind =
  | "published_content"
  | "unsupported_removal"
  | "unreadable_persisted_content";

export interface ReconciliationConflict {
  readonly kind: ReconciliationConflictKind;
  readonly message: string;
}

export type CurriculumNodeKind =
  | "learning_path"
  | "course"
  | "module"
  | "mission"
  | "competency";

export interface PlannedNode {
  readonly kind: CurriculumNodeKind;
  readonly stableId: string;
  readonly action: NodeAction;
  /** Present for reuse, update and conflict. */
  readonly existingId?: string;
  /**
   * The stored node's publication state, when one exists.
   *
   * Carried so a refusal can name the real state. Only `draft` is editable, so
   * `review` and `retired` refuse exactly as `published` does — but telling an
   * operator their curriculum "is published" when it is in review sends them
   * looking for the wrong thing.
   */
  readonly existingPublicationState?: string;
  /** Which authored fields differ. Empty unless update or conflict. */
  readonly changedFields: readonly string[];
}

/**
 * One mission's instructional content, planned as a unit.
 *
 * Steps and assets are decided per mission rather than per step because they are
 * only meaningful together: a diagram step and the asset it names must reach the
 * database in the same pass or the mission is briefly incoherent. WP-E fails a
 * whole mission when a reference does not resolve, so a partial write here would
 * surface to a learner as an unavailable mission.
 */
export interface PlannedMissionContent {
  readonly missionStableId: string;
  readonly action: NodeAction;
  readonly changedFields: readonly string[];
}

export interface PlannedPrerequisiteRule {
  readonly targetNodeType: string;
  readonly targetStableId: string;
  readonly requirementStableId: string;
  readonly action: NodeAction;
  readonly changedFields: readonly string[];
}

/** One mission's competency links, planned as a unit. */
export interface PlannedMissionCompetencyLinks {
  readonly missionStableId: string;
  readonly action: NodeAction;
  readonly changedFields: readonly string[];
}

/** The competency prerequisite edges, planned as a unit. */
export interface PlannedCompetencyPrerequisites {
  readonly action: NodeAction;
  /** Edges to insert. Empty unless the action is create. */
  readonly toCreate: readonly ExistingCompetencyPrerequisiteEdge[];
  readonly changedFields: readonly string[];
}

export interface CurriculumReconciliationPlan {
  readonly nodes: readonly PlannedNode[];
  readonly missionContent: readonly PlannedMissionContent[];
  readonly missionCompetencyLinks: readonly PlannedMissionCompetencyLinks[];
  readonly competencyPrerequisites: PlannedCompetencyPrerequisites;
  readonly prerequisiteRules: readonly PlannedPrerequisiteRule[];
  /**
   * Every reason this plan may not run, from every section, each carrying why.
   *
   * Non-empty means the import writes nothing. All five sections report here
   * rather than each keeping its own list, because the safety gate inspects one
   * list: a refusal living outside the list the gate reads would not be a
   * complete plan before mutation.
   */
  readonly conflicts: readonly ReconciliationConflict[];
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * The four-column identity of a prerequisite rule, as an unambiguous key.
 *
 * `JSON.stringify` of the tuple rather than a joined string. A separator
 * character is only safe while no authored value can contain it, which is a
 * property of today's stable-id grammar rather than of this function — and a
 * key that silently collides would merge two distinct rules into one and hide a
 * conflict. JSON escaping removes the question entirely.
 */
/**
 * The identity of a planned node: its kind and its stable id together.
 *
 * A stable id alone is not an identity. The document validator forbids reusing
 * one across node kinds *within a document*, but the plan is also consulted by
 * an executor that looks entries up by name, and a lookup keyed on the id alone
 * would silently match the wrong kind if that rule ever relaxed. Keying on both
 * costs nothing and removes the question.
 */
export function plannedNodeKey(
  kind: CurriculumNodeKind,
  stableId: string
): string {
  return JSON.stringify([kind, stableId]);
}

/**
 * Look one node's planned action up by kind and stable id.
 *
 * Returns `undefined` when the plan has no entry, and the executor must treat
 * that as a failure rather than as a default. An action the plan does not
 * contain is a write the safety gate never inspected.
 */
export function findPlannedNode(
  plan: CurriculumReconciliationPlan,
  kind: CurriculumNodeKind,
  stableId: string
): PlannedNode | undefined {
  return plan.nodes.find(
    (node) => node.kind === kind && node.stableId === stableId
  );
}

/** Identities present in `stored` that `authored` no longer contains. */
function missingFrom(
  stored: readonly string[],
  authored: readonly string[]
): string[] {
  const present = new Set(authored);
  return [...new Set(stored)].filter((id) => !present.has(id)).sort();
}

/** The identity of a competency prerequisite edge. */
function edgeKey(edge: {
  competencyStableId: string;
  prerequisiteCompetencyStableId: string;
}): string {
  return JSON.stringify([
    edge.competencyStableId,
    edge.prerequisiteCompetencyStableId
  ]);
}

/**
 * Canonical form of a mission's authored competency links, for equality only.
 *
 * Sorted by competency so reordering the authored array is not a change. Both
 * attributes travel with the identity, so a changed `required` or
 * `relationship` still differs.
 */
function canonicalLinks(
  links: readonly CurriculumDocumentMissionCompetency[]
): string {
  return JSON.stringify(
    [...links]
      .sort((left, right) =>
        left.competencyStableId.localeCompare(right.competencyStableId)
      )
      .map((link) => [link.competencyStableId, link.required, link.relationship])
  );
}

/** The same canonical form, for links as they are stored. */
function canonicalStoredLinks(
  links: readonly ExistingMissionCompetencyLink[]
): string {
  return JSON.stringify(
    [...links]
      .sort((left, right) =>
        left.competencyStableId.localeCompare(right.competencyStableId)
      )
      .map((link) => [link.competencyStableId, link.required, link.relationship])
  );
}

function prerequisiteKey(rule: {
  targetNodeType: string;
  targetStableId: string;
  requirementType: string;
  requirementStableId: string;
}): string {
  return JSON.stringify([
    rule.targetNodeType,
    rule.targetStableId,
    rule.requirementType,
    rule.requirementStableId
  ]);
}

/* ------------------------------------------------------------------ *
 * Comparison
 * ------------------------------------------------------------------ */

/**
 * `null` and `undefined` both mean "no value" across this boundary.
 *
 * The database stores an absent description as `null`; an author omits the key
 * entirely. Treating those as different would make every optional field a
 * permanent conflict.
 */
function sameOptional(
  authored: string | number | undefined,
  stored: string | number | null
): boolean {
  if (authored === undefined) return stored === null;
  return authored === stored;
}

function diffNodeFields(
  authored: {
    title: string;
    description: string;
    position?: number;
    estimatedMinutes?: number;
  },
  existing: ExistingCurriculumNode,
  comparePosition: boolean
): string[] {
  const changed: string[] = [];

  if (authored.title !== existing.title) changed.push("title");
  if (authored.description !== (existing.description ?? "")) {
    changed.push("description");
  }
  if (
    comparePosition &&
    authored.position !== undefined &&
    authored.position !== existing.position
  ) {
    changed.push("position");
  }
  if (!sameOptional(authored.estimatedMinutes, existing.estimatedMinutes)) {
    changed.push("estimatedMinutes");
  }

  return changed;
}

/**
 * Decide one node's action.
 *
 * The ordering is the decision:
 *
 *   1. a node that does not exist is created — but creating a child beneath a
 *      PUBLISHED parent changes published curriculum, so that is a conflict;
 *   2. a node whose parent has changed would be a reparenting, which WP-G
 *      cannot perform;
 *   3. no difference means reuse, including under a published parent — a rerun
 *      that changes nothing must be a no-op, never an error;
 *   4. only then does publication state choose between a safe draft revision
 *      and a refusal.
 *
 * `parent` is the node this one would belong to. `null` means there is no parent
 * to consider, which is true only of the learning path.
 */
function planNode(
  kind: CurriculumNodeKind,
  stableId: string,
  authored: {
    title: string;
    description: string;
    position?: number;
    estimatedMinutes?: number;
  },
  existing: ExistingCurriculumNode | null | undefined,
  comparePosition: boolean,
  parent: ExistingCurriculumNode | null
): PlannedNode {
  if (!existing) {
    // A new child beneath a published parent is not an ordinary create. The
    // parent's published tree gains a node, so what a learner can reach changes
    // even though the child itself is new. Publication immutability is the
    // controlling reason, so it is reported as a published-content conflict.
    if (parent && parent.publicationState !== "draft") {
      return {
        kind,
        stableId,
        action: "conflict",
        changedFields: ["parent is published"]
      };
    }

    return { kind, stableId, action: "create", changedFields: [] };
  }

  // The same stable id, but somewhere else in the tree. Reusing it would move
  // curriculum silently; WP-G has no authorized reparenting operation, and none
  // of its write paths sets a parent on an existing row.
  if (parent && existing.parentId !== null && existing.parentId !== parent.id) {
    return {
      kind,
      stableId,
      action: "unsupported_removal",
      existingId: existing.id,
      changedFields: ["parent"]
    };
  }

  const changedFields = diffNodeFields(authored, existing, comparePosition);

  if (changedFields.length === 0) {
    return {
      kind,
      stableId,
      action: "reuse",
      existingId: existing.id,
      changedFields: []
    };
  }

  // Only `draft` is editable. `review` and `retired` refuse for the same reason
  // `published` does: `updateDraftCurriculumNode` matches on
  // `publication_state = 'draft'` and would find no row. WP-G invents no
  // mutation behaviour for review-state curriculum; it refuses.
  return {
    kind,
    stableId,
    action: existing.publicationState === "draft" ? "update" : "conflict",
    existingId: existing.id,
    existingPublicationState: existing.publicationState,
    changedFields
  };
}

/**
 * Stored children of a parent that the authored document no longer contains.
 *
 * The document is authoritative for the tree it describes, so a stored child
 * absent from it must not silently remain. WP-G cannot remove one, so this
 * reports them and the caller refuses.
 */
function orphanedChildren(
  stored: readonly ExistingCurriculumNode[],
  authoredStableIds: readonly string[]
): ExistingCurriculumNode[] {
  const authored = new Set(authoredStableIds);
  return stored.filter((child) => !authored.has(child.stableId));
}

/* ------------------------------------------------------------------ *
 * Instructional content
 * ------------------------------------------------------------------ */

/**
 * Canonical form of a mission's steps, for equality only.
 *
 * The fields the importer writes — identity, position and the whole payload.
 * The payload is the discriminated content object the parser already validated,
 * so structural equality of that value is exactly equality of what would be
 * stored in `mission_steps.payload`.
 *
 * Sorted by stable id first, so reordering the authored array without changing
 * any position is not a change. Position travels inside each entry, so a
 * genuine reordering still differs.
 */
function canonicalSteps(steps: readonly MissionStep[]): string {
  return JSON.stringify(
    [...steps]
      .sort((left, right) => left.stableId.localeCompare(right.stableId))
      .map((step) => ({
        stableId: step.stableId,
        position: step.position,
        content: step.content
      }))
  );
}

function canonicalAssets(assets: readonly CurriculumDocumentAsset[]): string {
  return JSON.stringify(
    [...assets]
      .sort((left, right) => left.stableId.localeCompare(right.stableId))
      .map((asset) => ({
        stableId: asset.stableId,
        assetType: asset.assetType,
        title: asset.title,
        uri: asset.uri,
        position: asset.position,
        required: asset.required ?? null,
        altText: asset.altText ?? null
      }))
  );
}

/* ------------------------------------------------------------------ *
 * Prerequisite rules
 * ------------------------------------------------------------------ */

/**
 * Which authored fields of a prerequisite rule differ from what is stored.
 *
 * ## Why every one of these is treated as learner-affecting
 *
 * `learning_prerequisite_rules` carries no `publication_state`, and it would be
 * easy to conclude from that alone that revising a rule is not a change to
 * published curriculum. It is not a safe conclusion, and the evaluator shows
 * why:
 *
 *   active              a WHERE filter in `learning-navigation.ts` — rules are
 *                       selected with `.eq("active", true)`. Flipping it removes
 *                       the gate outright, so a learner who was blocked becomes
 *                       allowed. This is the most consequential field of the
 *                       four and the one with no visible trace.
 *   requirementType     decides how satisfaction is computed —
 *                       `content_completion` is checked against learner progress
 *                       and everything else against authoritative satisfactions
 *                       (`evaluatePrerequisiteRules`). Changing it changes who
 *                       may enter.
 *   requirementStableId names the thing that must be satisfied. Changing it
 *                       changes who may enter.
 *   explanation         does NOT affect `allowed`. It is carried verbatim into
 *                       each requirement and shown to the learner, so it is
 *                       published learner-facing text even though it gates
 *                       nothing.
 *
 * The first three are entry-affecting and the fourth is not, but WP-G does not
 * split them. Architect Decision: prefer the conservative fail-closed rule for a
 * published target. Allowing "harmless" wording edits under published curriculum
 * would be a back door around published-content immutability, opened for the
 * one field whose consequences are easiest to argue are small.
 */
function diffPrerequisiteFields(
  authored: CurriculumDocumentPrerequisiteRule,
  existing: ExistingPrerequisiteRule
): string[] {
  const changed: string[] = [];

  if (authored.explanation !== existing.explanation) {
    changed.push("explanation");
  }

  // The authored document always asserts an active rule; the importer's upsert
  // writes `active: true`. A stored rule that has been deactivated therefore
  // differs, and re-activating a gate beneath published curriculum is exactly
  // the change this must not make silently.
  if (!existing.active) changed.push("active");

  return changed;
}

/**
 * The publication state governing a prerequisite rule.
 *
 * A rule has no publication state of its own, so it borrows the one belonging to
 * the node it gates. That is the correct boundary: the rule's whole effect is on
 * entry to that node, so if the node is published the rule is part of the
 * published learner experience regardless of which table it lives in.
 *
 * A target absent from current state is being created as a draft in this same
 * import, so its rules are safe to write. Returning `"draft"` for that case is
 * not an assumption about the database — the node plan in the same pass is what
 * creates it.
 */
function targetPublicationState(
  rule: CurriculumDocumentPrerequisiteRule,
  current: CurriculumCurrentState
): string {
  const node =
    rule.targetNodeType === "course"
      ? current.course
      : rule.targetNodeType === "module"
        ? current.modules.get(rule.targetStableId)
        : current.missions.get(rule.targetStableId);

  if (!node) return "draft";
  if (rule.targetNodeType === "course" && node.stableId !== rule.targetStableId) {
    // The document names a course other than the one currently stored under
    // this path. Treated as absent rather than matched by position.
    return "draft";
  }

  return node.publicationState;
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

/**
 * Plan an import without performing any part of it.
 *
 * Pure: reads no database, writes nothing, has no side effect. That is what
 * allows the importer to build the whole plan, inspect it for conflicts, and
 * abort having touched nothing.
 */
export function planCurriculumReconciliation(
  document: CurriculumDocument,
  current: CurriculumCurrentState
): CurriculumReconciliationPlan {
  const nodes: PlannedNode[] = [];
  const conflicts: ReconciliationConflict[] = [];

  // Every refusing action must reach `conflicts`, not only `conflict`. An
  // action that stopped the import without appearing in the list the safety
  // gate reads would make the plan silently unsafe-but-executable.
  const record = (node: PlannedNode) => {
    nodes.push(node);

    if (node.action === "conflict") {
      conflicts.push({
        kind: "published_content",
        message: node.changedFields.includes("parent is published")
          ? `${node.kind} "${node.stableId}" would be created beneath published curriculum, which changes what a learner can reach`
          : `${node.kind} "${node.stableId}" is in publication state "${node.existingPublicationState ?? "unknown"}" and its authored ${node.changedFields.join(", ")} changed. Only draft curriculum is editable.`
      });
      return;
    }

    if (node.action === "unsupported_removal") {
      conflicts.push({
        kind: "unsupported_removal",
        message: node.changedFields.includes("parent")
          ? `${node.kind} "${node.stableId}" already exists beneath a different parent. Moving curriculum is outside WP-G and needs a separately reviewed capability.`
          : `${node.kind} "${node.stableId}" cannot be reconciled without removing existing curriculum, which is outside WP-G.`
      });
    }
  };

  // A learning path carries no position; the other four do.
  record(
    planNode(
      "learning_path",
      document.learningPath.stableId,
      {
        title: document.learningPath.title,
        description: document.learningPath.description,
        ...(document.learningPath.estimatedMinutes === undefined
          ? {}
          : { estimatedMinutes: document.learningPath.estimatedMinutes })
      },
      current.learningPath,
      false,
      null
    )
  );

  record(
    planNode(
      "course",
      document.course.stableId,
      {
        title: document.course.title,
        description: document.course.description,
        position: document.course.position,
        ...(document.course.estimatedMinutes === undefined
          ? {}
          : { estimatedMinutes: document.course.estimatedMinutes })
      },
      current.course,
      true,
      current.learningPath
    )
  );

  for (const module of document.modules) {
    record(
      planNode(
        "module",
        module.stableId,
        {
          title: module.title,
          description: module.description,
          position: module.position,
          ...(module.estimatedMinutes === undefined
            ? {}
            : { estimatedMinutes: module.estimatedMinutes })
        },
        current.modules.get(module.stableId),
        true,
        current.course
      )
    );
  }

  for (const mission of document.missions) {
    record(
      planNode(
        "mission",
        mission.stableId,
        {
          title: mission.title,
          description: mission.description,
          position: mission.position,
          ...(mission.estimatedMinutes === undefined
            ? {}
            : { estimatedMinutes: mission.estimatedMinutes })
        },
        current.missions.get(mission.stableId),
        true,
        current.modules.get(mission.moduleStableId) ?? null
      )
    );
  }

  for (const competency of document.competencies) {
    // A competency belongs to no parent node: it is referenced by missions
    // rather than contained by one, so there is no ownership to compare.
    record(
      planNode(
        "competency",
        competency.stableId,
        { title: competency.title, description: competency.description },
        current.competencies.get(competency.stableId),
        false,
        null
      )
    );
  }

  // --- stored children the document no longer describes -------------------
  //
  // The document is authoritative for the tree it describes, so a stored child
  // absent from it must not silently remain. WP-G cannot remove one.
  //
  // Which reason governs depends on the parent: beneath a PUBLISHED parent the
  // controlling fact is that published curriculum would change, and beneath a
  // draft it is that removal is unrepresentable. Reporting the right one is what
  // tells an author whether to restore the entry or to seek a re-versioning
  // capability.
  const orphanScopes: ReadonlyArray<{
    kind: CurriculumNodeKind;
    parent: ExistingCurriculumNode | null;
    stored: readonly ExistingCurriculumNode[];
    authored: readonly string[];
  }> = [
    {
      kind: "course",
      parent: current.learningPath,
      stored: current.childCoursesOfPath,
      authored: [document.course.stableId]
    },
    {
      kind: "module",
      parent: current.course,
      stored: current.childModulesOfCourse,
      authored: document.modules.map((module) => module.stableId)
    },
    ...document.modules.map((module) => ({
      kind: "mission" as const,
      parent: current.modules.get(module.stableId) ?? null,
      stored: current.childMissionsOfModule.get(module.stableId) ?? [],
      authored: document.missions
        .filter((mission) => mission.moduleStableId === module.stableId)
        .map((mission) => mission.stableId)
    }))
  ];

  for (const scope of orphanScopes) {
    for (const orphan of orphanedChildren(scope.stored, scope.authored)) {
      const parentPublished =
        scope.parent !== null && scope.parent.publicationState !== "draft";

      nodes.push({
        kind: scope.kind,
        stableId: orphan.stableId,
        action: parentPublished ? "conflict" : "unsupported_removal",
        existingId: orphan.id,
        changedFields: ["absent from the document"]
      });

      conflicts.push(
        parentPublished
          ? {
              kind: "published_content",
              message: `${scope.kind} "${orphan.stableId}" exists beneath published curriculum and the document no longer contains it. Published curriculum is not revised in place.`
            }
          : {
              kind: "unsupported_removal",
              message: `${scope.kind} "${orphan.stableId}" exists in the database and the document no longer contains it. Removing curriculum is outside WP-G and needs a separately reviewed capability.`
            }
      );
    }
  }

  // --- instructional content -------------------------------------------
  const missionContent: PlannedMissionContent[] = [];

  for (const mission of document.missions) {
    const existingMission = current.missions.get(mission.stableId);
    const storedSteps = current.missionSteps.get(mission.stableId) ?? [];
    const storedAssets = current.missionAssets.get(mission.stableId) ?? [];

    const changedFields: string[] = [];

    if (canonicalSteps(mission.steps) !== canonicalSteps(storedSteps)) {
      changedFields.push("steps");
    }
    if (canonicalAssets(mission.assets) !== canonicalAssets(storedAssets)) {
      changedFields.push("assets");
    }

    // Removal, checked separately from "changed" because the remedy differs.
    // The importer only ever upserts what the document contains, so a stored
    // item the document has dropped would survive the import and the database
    // would quietly stop matching the authored source.
    const removedSteps = missingFrom(
      storedSteps.map((step) => step.stableId),
      mission.steps.map((step) => step.stableId)
    );
    const removedAssets = missingFrom(
      storedAssets.map((asset) => asset.stableId),
      mission.assets.map((asset) => asset.stableId)
    );

    if (changedFields.length === 0) {
      missionContent.push({
        missionStableId: mission.stableId,
        action: "reuse",
        changedFields: []
      });
      continue;
    }

    // A mission that does not exist yet is created as a draft in this same
    // pass, so its content is written alongside it and is never a conflict.
    if (!existingMission) {
      missionContent.push({
        missionStableId: mission.stableId,
        action: "create",
        changedFields
      });
      continue;
    }

    // Steps and assets have no publication state of their own — they are
    // readable exactly when their owning mission is published. So the MISSION's
    // state decides whether changing them is a safe draft revision or a change
    // to published curriculum.
    // Published first: a published mission may not change at all, which
    // already covers the removal case and is the stronger statement to make.
    if (existingMission.publicationState !== "draft") {
      missionContent.push({
        missionStableId: mission.stableId,
        action: "conflict",
        changedFields
      });
      conflicts.push({
        kind: "published_content",
        message: `mission "${mission.stableId}" is published and its authored ${changedFields.join(", ")} changed`
      });
      continue;
    }

    if (removedSteps.length > 0 || removedAssets.length > 0) {
      const removed = [
        ...removedSteps.map((id) => `step "${id}"`),
        ...removedAssets.map((id) => `asset "${id}"`)
      ];

      missionContent.push({
        missionStableId: mission.stableId,
        action: "unsupported_removal",
        changedFields
      });
      conflicts.push({
        kind: "unsupported_removal",
        message: `mission "${mission.stableId}" no longer authors ${removed.join(", ")}, which exists in the database. Removing curriculum content is outside WP-G and needs a separately reviewed capability.`
      });
      continue;
    }

    missionContent.push({
      missionStableId: mission.stableId,
      action: "update",
      changedFields
    });
  }

  // --- mission competency links -----------------------------------------
  //
  // `linkMissionCompetency` upserts on the `(mission_id, competency_id)`
  // primary key, so an identical re-run is idempotent and a changed `required`
  // or `relationship` is revisable in place. What it cannot do is remove a link,
  // so an unauthored stored link is refused rather than left behind.
  const missionCompetencyLinks: PlannedMissionCompetencyLinks[] = [];

  for (const mission of document.missions) {
    const existingMission = current.missions.get(mission.stableId);
    const stored = current.missionCompetencyLinks.get(mission.stableId) ?? [];

    const changed =
      canonicalLinks(mission.competencies) !== canonicalStoredLinks(stored);

    if (!changed) {
      missionCompetencyLinks.push({
        missionStableId: mission.stableId,
        action: "reuse",
        changedFields: []
      });
      continue;
    }

    if (!existingMission) {
      missionCompetencyLinks.push({
        missionStableId: mission.stableId,
        action: "create",
        changedFields: ["competencies"]
      });
      continue;
    }

    if (existingMission.publicationState !== "draft") {
      missionCompetencyLinks.push({
        missionStableId: mission.stableId,
        action: "conflict",
        changedFields: ["competencies"]
      });
      conflicts.push({
        kind: "published_content",
        message: `mission "${mission.stableId}" is published and its authored competency links changed`
      });
      continue;
    }

    const removed = missingFrom(
      stored.map((link) => link.competencyStableId),
      mission.competencies.map((link) => link.competencyStableId)
    );

    if (removed.length > 0) {
      missionCompetencyLinks.push({
        missionStableId: mission.stableId,
        action: "unsupported_removal",
        changedFields: ["competencies"]
      });
      conflicts.push({
        kind: "unsupported_removal",
        message: `mission "${mission.stableId}" no longer links competency ${removed.map((id) => `"${id}"`).join(", ")}, which exists in the database. Removing a competency link is outside WP-G and needs a separately reviewed capability.`
      });
      continue;
    }

    missionCompetencyLinks.push({
      missionStableId: mission.stableId,
      action: "update",
      changedFields: ["competencies"]
    });
  }

  // --- competency prerequisite edges -------------------------------------
  //
  // `addCompetencyPrerequisite` is a plain INSERT against a primary key of
  // `(competency_id, prerequisite_competency_id)`, so re-inserting an existing
  // edge raises a unique violation rather than being idempotent. The existing
  // ROAS publisher works around that by pre-checking; this plan does the same
  // by deciding which edges are genuinely new BEFORE any write.
  //
  // An edge carries no attributes — its identity is the whole relationship — so
  // there is no "update" here, and none is invented.
  const authoredEdges = document.competencyPrerequisites.map((edge) => ({
    competencyStableId: edge.competencyStableId,
    prerequisiteCompetencyStableId: edge.prerequisiteCompetencyStableId
  }));

  const storedEdgeKeys = new Set(
    current.competencyPrerequisiteEdges.map((edge) => edgeKey(edge))
  );
  const authoredEdgeKeys = new Set(authoredEdges.map((edge) => edgeKey(edge)));

  const newEdges = authoredEdges.filter(
    (edge) => !storedEdgeKeys.has(edgeKey(edge))
  );
  const orphanedEdges = current.competencyPrerequisiteEdges.filter(
    (edge) => !authoredEdgeKeys.has(edgeKey(edge))
  );

  // The dependent competency is the one whose acquisition the edge gates, so
  // its publication state is the boundary.
  const publishedDependents = newEdges.filter(
    (edge) =>
      current.competencies.get(edge.competencyStableId)?.publicationState ===
      "published"
  );

  let competencyPrerequisites: PlannedCompetencyPrerequisites;

  if (orphanedEdges.length > 0) {
    competencyPrerequisites = {
      action: "unsupported_removal",
      toCreate: [],
      changedFields: ["competencyPrerequisites"]
    };
    conflicts.push({
      kind: "unsupported_removal",
      message: `the document no longer authors competency prerequisite ${orphanedEdges
        .map(
          (edge) =>
            `"${edge.competencyStableId}" <- "${edge.prerequisiteCompetencyStableId}"`
        )
        .join(", ")}, which exists in the database. Removing a prerequisite edge is outside WP-G and needs a separately reviewed capability.`
    });
  } else if (publishedDependents.length > 0) {
    competencyPrerequisites = {
      action: "conflict",
      toCreate: [],
      changedFields: ["competencyPrerequisites"]
    };
    conflicts.push({
      kind: "published_content",
      message: `competency ${publishedDependents
        .map((edge) => `"${edge.competencyStableId}"`)
        .join(", ")} is published and would gain a new prerequisite`
    });
  } else if (newEdges.length > 0) {
    competencyPrerequisites = {
      action: "create",
      toCreate: newEdges,
      changedFields: ["competencyPrerequisites"]
    };
  } else {
    competencyPrerequisites = {
      action: "reuse",
      toCreate: [],
      changedFields: []
    };
  }

  // --- explicit prerequisite rules --------------------------------------
  const stored = new Map(
    current.prerequisiteRules.map((rule) => [prerequisiteKey(rule), rule])
  );

  const prerequisiteRules: PlannedPrerequisiteRule[] = [];

  for (const rule of document.prerequisiteRules) {
    const existing = stored.get(prerequisiteKey(rule));
    const published = targetPublicationState(rule, current) !== "draft";

    const base = {
      targetNodeType: rule.targetNodeType,
      targetStableId: rule.targetStableId,
      requirementStableId: rule.requirementStableId
    };

    if (!existing) {
      // A rule absent from a PUBLISHED target would add a gate the published
      // learner experience does not currently have. That is a change to
      // published curriculum even though the rule's own table is unversioned.
      if (published) {
        prerequisiteRules.push({
          ...base,
          action: "conflict",
          changedFields: ["rule"]
        });
        conflicts.push({
          kind: "published_content",
          message: `prerequisite rule for published ${rule.targetNodeType} "${rule.targetStableId}" requiring "${rule.requirementStableId}" does not exist and would be added`
        });
        continue;
      }

      prerequisiteRules.push({ ...base, action: "create", changedFields: [] });
      continue;
    }

    const changedFields = diffPrerequisiteFields(rule, existing);

    if (changedFields.length === 0) {
      prerequisiteRules.push({ ...base, action: "reuse", changedFields: [] });
      continue;
    }

    if (published) {
      prerequisiteRules.push({ ...base, action: "conflict", changedFields });
      conflicts.push({
        kind: "published_content",
        message: `prerequisite rule for published ${rule.targetNodeType} "${rule.targetStableId}" requiring "${rule.requirementStableId}" changed its authored ${changedFields.join(", ")}`
      });
      continue;
    }

    prerequisiteRules.push({ ...base, action: "update", changedFields });
  }

  // A stored rule the document no longer authors cannot be removed either. The
  // approved operation upserts, and deactivating one would itself be a mutation
  // of a gate the document has stopped describing.
  const authoredRuleKeys = new Set(
    document.prerequisiteRules.map((rule) => prerequisiteKey(rule))
  );

  for (const rule of current.prerequisiteRules) {
    if (authoredRuleKeys.has(prerequisiteKey(rule))) continue;

    prerequisiteRules.push({
      targetNodeType: rule.targetNodeType,
      targetStableId: rule.targetStableId,
      requirementStableId: rule.requirementStableId,
      action: "unsupported_removal",
      changedFields: ["rule"]
    });
    conflicts.push({
      kind: "unsupported_removal",
      message: `the document no longer authors the prerequisite rule for ${rule.targetNodeType} "${rule.targetStableId}" requiring "${rule.requirementStableId}", which exists in the database. Removing a prerequisite rule is outside WP-G and needs a separately reviewed capability.`
    });
  }

  // A stored relationship the reader could not identify makes the whole plan
  // untrustworthy: it may be a link the document dropped, and treating it as
  // absent would hide a destructive difference. Refuse rather than compare
  // against an incomplete picture.
  for (const unresolved of current.unresolvedRelationships) {
    conflicts.push({
      kind: "unreadable_persisted_content",
      message: `a stored ${unresolved.kind.replace("_", " ")} relationship references competency row ${unresolved.rowId}, whose identity could not be resolved. Refusing rather than planning against an incomplete view of what exists.`
    });
  }

  // Stored instructional content that exists but could not be read. Comparing
  // the document against an empty list would report `reuse` and leave the
  // invalid rows in place, reporting success.
  for (const unreadable of current.unreadableMissionContent) {
    conflicts.push({
      kind: "unreadable_persisted_content",
      message: `mission "${unreadable.missionStableId}" has persisted ${unreadable.what} that could not be read: ${unreadable.detail}. Refusing: an import cannot reconcile against content it cannot compare, and treating it as absent would leave it in place silently.`
    });
  }

  return {
    nodes,
    missionContent,
    missionCompetencyLinks,
    competencyPrerequisites,
    prerequisiteRules,
    conflicts
  };
}

/**
 * Whether this plan may proceed to write anything at all.
 *
 * The authoritative pre-mutation gate. One question over one list: every
 * section — nodes, instructional content, competency links, prerequisite edges
 * and explicit rules — reports into `plan.conflicts`, so there is no category
 * this can miss. That is the property making "complete plan before mutation"
 * true rather than merely intended.
 *
 * It is deliberately independent of `planRequiresWrites`. A plan can require
 * writes and be unsafe, and in that case nothing may be written: the caller
 * must consult this first, and being unsafe is never overridden by having work
 * to do.
 */
export function planIsSafeToExecute(
  plan: CurriculumReconciliationPlan
): boolean {
  return plan.conflicts.length === 0;
}

/**
 * Whether executing this plan would change anything, for dry-run reporting.
 *
 * Covers every collection the importer writes. A section omitted here would be
 * a write the dry run never mentioned — the importer must have no write
 * behaviour absent from the plan.
 *
 * Answering true says nothing about safety. See `planIsSafeToExecute`.
 */
export function planRequiresWrites(
  plan: CurriculumReconciliationPlan
): boolean {
  return (
    plan.nodes.some((node) => node.action !== "reuse") ||
    plan.missionContent.some((entry) => entry.action !== "reuse") ||
    plan.missionCompetencyLinks.some((entry) => entry.action !== "reuse") ||
    plan.competencyPrerequisites.action !== "reuse" ||
    plan.prerequisiteRules.some((entry) => entry.action !== "reuse")
  );
}

/**
 * The refusals in this plan of one kind.
 *
 * Exists so a caller can report published-content immutability separately from
 * unsupported removal. They stop the import for different reasons and an author
 * fixes them differently, so collapsing them into one message would send people
 * looking for a change to published curriculum they never made.
 */
export function planConflictsByKind(
  plan: CurriculumReconciliationPlan,
  kind: ReconciliationConflictKind
): readonly ReconciliationConflict[] {
  return plan.conflicts.filter((conflict) => conflict.kind === kind);
}
