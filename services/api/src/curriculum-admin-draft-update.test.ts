import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@tlp/shared-types";

/**
 * WP-G — the guarded draft revision.
 *
 * The rule under test cannot be proved by reading the source: the guard has to
 * be part of the UPDATE statement rather than a check performed earlier against
 * a row that could since have changed. So the Supabase client is mocked using
 * the CERT-005 / SEARCH-002 precedent and the actual filters the operation
 * issues are recorded and asserted.
 *
 * NOT proven here: real database behaviour under a genuine concurrent
 * publication. The repository has no live PostgreSQL harness, so this is a
 * query-shape claim — that the predicate is sent — not a claim about what
 * Postgres does with it. What Postgres does with `where id = $1 and
 * publication_state = 'draft'` is not in doubt; whether we send it is.
 */
vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

const ACTOR = "11111111-1111-4111-8111-111111111111";

interface Recorded {
  table: string;
  /** ("column", value) pairs, in the order the operation applied them. */
  filters: Array<[string, unknown]>;
  didUpdate: boolean;
  patch: Record<string, unknown> | null;
}

/**
 * A chainable stand-in that records what each statement filtered on.
 *
 * One record per `.from()`, so the pre-read and the guarded update are
 * distinguishable: only the second carries `didUpdate`.
 */
function clientRecording(input: {
  preRead: unknown;
  updated: unknown;
  updateError?: unknown;
}) {
  const statements: Recorded[] = [];

  const client = {
    from: (table: string) => {
      const record: Recorded = {
        table,
        filters: [],
        didUpdate: false,
        patch: null
      };
      statements.push(record);

      const builder: Record<string, unknown> = {};

      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        record.filters.push([column, value]);
        return builder;
      };
      builder.update = (patch: Record<string, unknown>) => {
        record.didUpdate = true;
        record.patch = patch;
        return builder;
      };
      const settle = () =>
        Promise.resolve(
          record.didUpdate
            ? input.updateError
              ? { data: null, error: input.updateError }
              : { data: input.updated, error: null }
            : { data: input.preRead, error: null }
        );

      // Both terminators, because the two operations differ: the pre-reads use
      // `.single()` and the guarded writes use `.maybeSingle()`, since zero rows
      // is an expected outcome there rather than an error.
      builder.maybeSingle = settle;
      builder.single = settle;

      return builder;
    }
  };

  return { client, statements };
}

async function runUpdate(input: {
  preRead: unknown;
  updated: unknown;
  updateError?: unknown;
}) {
  const { createServerSupabaseClient } = await import("./supabase");
  const harness = clientRecording(input);
  vi.mocked(createServerSupabaseClient).mockReturnValue(
    harness.client as never
  );

  const { updateDraftCurriculumNode } = await import("./curriculum-admin");

  const call = updateDraftCurriculumNode(
    { actorUserId: "11111111-1111-4111-8111-111111111111" },
    "missions",
    "mission-row-id",
    { title: "Revised title" }
  );

  return { call, harness };
}

const DRAFT_ROW = { id: "mission-row-id", publication_state: "draft" };
const UPDATED_ROW = {
  id: "mission-row-id",
  stable_id: "arch-fixture-m1",
  version: 1,
  title: "Revised title",
  publication_state: "draft"
};

describe("updateDraftCurriculumNode issues a guarded statement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("38. filters the UPDATE on the node id", async () => {
    const { call, harness } = await runUpdate({
      preRead: DRAFT_ROW,
      updated: UPDATED_ROW
    });
    await call;

    const update = harness.statements.find((entry) => entry.didUpdate);
    expect(update).toBeDefined();
    expect(update?.filters).toContainEqual(["id", "mission-row-id"]);
  });

  it("39. filters the same UPDATE on publication_state draft", async () => {
    const { call, harness } = await runUpdate({
      preRead: DRAFT_ROW,
      updated: UPDATED_ROW
    });
    await call;

    const update = harness.statements.find((entry) => entry.didUpdate);
    expect(update?.filters).toContainEqual(["publication_state", "draft"]);
  });

  it("carries both guards on the write, not split across statements", async () => {
    // The pre-read may filter on id alone; the WRITE must carry both. A guard
    // that lived only on the read would be a check-then-act race.
    const { call, harness } = await runUpdate({
      preRead: DRAFT_ROW,
      updated: UPDATED_ROW
    });
    await call;

    const update = harness.statements.find((entry) => entry.didUpdate);
    const columns = update?.filters.map(([column]) => column) ?? [];

    expect(columns).toContain("id");
    expect(columns).toContain("publication_state");
  });

  it("targets the table it was given and no other", async () => {
    const { call, harness } = await runUpdate({
      preRead: DRAFT_ROW,
      updated: UPDATED_ROW
    });
    await call;

    for (const statement of harness.statements) {
      expect(statement.table).toBe("missions");
    }
  });

  it("40. fails closed with CONFLICT when the guarded UPDATE matches no row", async () => {
    // The node exists — the pre-read found it — so a zero-row update can only
    // mean it stopped being a draft before the write arrived.
    const { call } = await runUpdate({ preRead: DRAFT_ROW, updated: null });

    await expect(call).rejects.toMatchObject({
      code: "CONFLICT",
      retryable: false
    });
  });

  it("reports a missing node as NOT_FOUND rather than CONFLICT", async () => {
    const { call } = await runUpdate({ preRead: null, updated: null });

    await expect(call).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("performs no update statement when the node does not exist", async () => {
    const { call, harness } = await runUpdate({ preRead: null, updated: null });

    await expect(call).rejects.toBeInstanceOf(AppError);
    expect(harness.statements.some((entry) => entry.didUpdate)).toBe(false);
  });

  it("reports a transport failure as DEPENDENCY_UNAVAILABLE, not CONFLICT", async () => {
    // A failed write and a refused write are different facts. Reporting a
    // dependency failure as CONFLICT would tell an operator their curriculum is
    // published when the database was merely unreachable.
    const { call } = await runUpdate({
      preRead: DRAFT_ROW,
      updated: null,
      updateError: { message: "connection reset" }
    });

    await expect(call).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      retryable: true
    });
  });

  it("sends only the fields it was asked to change", async () => {
    const { call, harness } = await runUpdate({
      preRead: DRAFT_ROW,
      updated: UPDATED_ROW
    });
    await call;

    const update = harness.statements.find((entry) => entry.didUpdate);
    expect(Object.keys(update?.patch ?? {})).toEqual(["title"]);
  });

  it("validates its input before reaching the database", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    const harness = clientRecording({ preRead: DRAFT_ROW, updated: UPDATED_ROW });
    vi.mocked(createServerSupabaseClient).mockReturnValue(
      harness.client as never
    );

    const { updateDraftCurriculumNode } = await import("./curriculum-admin");

    await expect(
      updateDraftCurriculumNode(
        { actorUserId: "11111111-1111-4111-8111-111111111111" },
        "missions",
        "mission-row-id",
        { estimatedMinutes: -5 }
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // The pre-read may have happened; the WRITE must not have.
    expect(harness.statements.some((entry) => entry.didUpdate)).toBe(false);
  });
});

describe("updateDraftLearningPath is guarded the same way", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function runPathUpdate(input: {
    preRead: unknown;
    updated: unknown;
  }) {
    const { createServerSupabaseClient } = await import("./supabase");
    const harness = clientRecording(input);
    vi.mocked(createServerSupabaseClient).mockReturnValue(
      harness.client as never
    );

    const { updateDraftLearningPath } = await import("./curriculum-admin");

    const call = updateDraftLearningPath(
      { actorUserId: "11111111-1111-4111-8111-111111111111" },
      "path-row-id",
      { title: "Revised path" }
    );

    return { call, harness };
  }

  const DRAFT_PATH = {
    id: "path-row-id",
    stable_id: "arch-fixture-path",
    version: 1,
    title: "Old",
    publication_state: "draft"
  };

  it("filters its UPDATE on both the id and the draft state", async () => {
    // This operation predates WP-G and originally carried the predicate only in
    // its pre-read, which is a check-then-act race. WP-G calls it, so it is
    // hardened to the same write-boundary rule as updateDraftCurriculumNode.
    const { call, harness } = await runPathUpdate({
      preRead: DRAFT_PATH,
      updated: { ...DRAFT_PATH, title: "Revised path" }
    });
    await call;

    const update = harness.statements.find((entry) => entry.didUpdate);
    expect(update?.filters).toContainEqual(["id", "path-row-id"]);
    expect(update?.filters).toContainEqual(["publication_state", "draft"]);
  });

  it("fails closed with CONFLICT when the guarded UPDATE matches no row", async () => {
    const { call } = await runPathUpdate({
      preRead: DRAFT_PATH,
      updated: null
    });

    await expect(call).rejects.toMatchObject({
      code: "CONFLICT",
      retryable: false
    });
  });

  it("targets only learning_paths", async () => {
    const { call, harness } = await runPathUpdate({
      preRead: DRAFT_PATH,
      updated: { ...DRAFT_PATH, title: "Revised path" }
    });
    await call;

    for (const statement of harness.statements) {
      expect(statement.table).toBe("learning_paths");
    }
  });
});

describe("mission content writers guard the owning mission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * A stand-in whose FIRST `from("missions")` read answers the owner check and
   * whose later statements record what was written.
   *
   * Steps, assets and competency links carry no publication state of their own,
   * so nothing in their upsert statements can express "only if the mission is a
   * draft". The guard is a read immediately before the write; these prove it
   * happens and that a non-draft owner stops the write entirely.
   */
  function clientWithOwner(publicationState: string | null) {
    const statements: Array<{ table: string; wrote: boolean }> = [];

    const client = {
      from: (table: string) => {
        const record = { table, wrote: false };
        statements.push(record);

        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.upsert = () => {
          record.wrote = true;
          return Promise.resolve({ error: null });
        };
        builder.maybeSingle = () =>
          Promise.resolve(
            publicationState === null
              ? { data: null, error: null }
              : {
                  data: { id: "mission-row", publication_state: publicationState },
                  error: null
                }
          );
        return builder;
      }
    };

    return { client, statements };
  }

  async function withOwner(publicationState: string | null) {
    const { createServerSupabaseClient } = await import("./supabase");
    const harness = clientWithOwner(publicationState);
    vi.mocked(createServerSupabaseClient).mockReturnValue(
      harness.client as never
    );
    return harness;
  }

  const step = {
    stableId: "s01-a-concept",
    position: 0,
    content: {
      type: "concept" as const,
      paragraphs: ["A network is a set of devices that can reach each other."]
    }
  };

  const asset = {
    missionId: "mission-row",
    stableId: "topology",
    assetType: "diagram" as const,
    title: "Topology",
    uri: "https://example.test/t.svg",
    position: 0,
    altText: "Two hosts on one switch."
  };

  it("writes a step when the owning mission is a draft", async () => {
    const harness = await withOwner("draft");
    const { upsertMissionStep } = await import("./curriculum-admin");

    await upsertMissionStep({ actorUserId: ACTOR }, "mission-row", step);

    expect(harness.statements.some((entry) => entry.wrote)).toBe(true);
  });

  it("refuses to write a step into a published mission", async () => {
    const harness = await withOwner("published");
    const { upsertMissionStep } = await import("./curriculum-admin");

    await expect(
      upsertMissionStep({ actorUserId: ACTOR }, "mission-row", step)
    ).rejects.toMatchObject({ code: "CONFLICT", retryable: false });

    expect(harness.statements.some((entry) => entry.wrote)).toBe(false);
  });

  it("refuses to write a step into a mission in review", async () => {
    const harness = await withOwner("review");
    const { upsertMissionStep } = await import("./curriculum-admin");

    await expect(
      upsertMissionStep({ actorUserId: ACTOR }, "mission-row", step)
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(harness.statements.some((entry) => entry.wrote)).toBe(false);
  });

  it("refuses to write an asset into a published mission", async () => {
    const harness = await withOwner("published");
    const { addMissionAsset } = await import("./curriculum-quality");

    await expect(addMissionAsset(asset)).rejects.toMatchObject({
      code: "CONFLICT"
    });

    expect(harness.statements.some((entry) => entry.wrote)).toBe(false);
  });

  it("refuses to link a competency into a published mission", async () => {
    const harness = await withOwner("published");
    const { linkMissionCompetency } = await import("./curriculum-admin");

    await expect(
      linkMissionCompetency(
        { actorUserId: ACTOR },
        "mission-row",
        "competency-row",
        true,
        "develops"
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(harness.statements.some((entry) => entry.wrote)).toBe(false);
  });

  it("reports a missing owning mission as NOT_FOUND and writes nothing", async () => {
    const harness = await withOwner(null);
    const { upsertMissionStep } = await import("./curriculum-admin");

    await expect(
      upsertMissionStep({ actorUserId: ACTOR }, "mission-row", step)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(harness.statements.some((entry) => entry.wrote)).toBe(false);
  });

  it("still rejects invalid content before consulting the database", async () => {
    // Validation precedes the owner check, so an invalid step is a caller error
    // whether or not a database is reachable.
    const harness = await withOwner("draft");
    const { upsertMissionStep } = await import("./curriculum-admin");

    await expect(
      upsertMissionStep({ actorUserId: ACTOR }, "mission-row", {
        ...step,
        content: { type: "concept" as const, paragraphs: [] }
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(harness.statements).toHaveLength(0);
  });
});

describe("the updatable table union", () => {
  it("reaches no learner-state table", async () => {
    const { UPDATABLE_CURRICULUM_NODE_TABLES } = await import(
      "./curriculum-admin"
    );

    expect([...UPDATABLE_CURRICULUM_NODE_TABLES]).toEqual([
      "courses",
      "learning_modules",
      "missions",
      "competencies"
    ]);

    for (const forbidden of [
      "student_learning_progress",
      "assessment_attempts",
      "assessment_attempt_answers",
      "student_competency_state",
      "evidence_records",
      "certificates",
      "assessment_definitions",
      "assessment_questions"
    ]) {
      expect([...UPDATABLE_CURRICULUM_NODE_TABLES]).not.toContain(forbidden);
    }
  });
});
