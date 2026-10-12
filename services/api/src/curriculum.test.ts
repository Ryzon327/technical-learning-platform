import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumPublicationState } from "@tlp/shared-types";

/**
 * The client factory is mocked using the CERT-005 / SEARCH-002 precedent:
 * whether the learner read goes through the caller's RLS-scoped client, which
 * filters it applies, and what it withholds cannot be proven by reading source.
 *
 * NOT proven here: real RLS isolation. Every permission claim below is a
 * query-level claim — the repository has no live PostgreSQL harness.
 */
vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

describe("curriculum service contract", () => {
  it("uses published as the student-readable state", () => {
    const state: CurriculumPublicationState = "published";
    expect(state).toBe("published");
  });
});

/* ------------------------------------------------------------------ *
 * WP-E — the learner mission instruction read path
 * ------------------------------------------------------------------ */

const ACCESS_TOKEN = "test-access-token";

const MISSION_ROW = {
  id: "44444444-4444-4444-4444-444444444444",
  stable_id: "mission.vlan-basics",
  version: 2,
  title: "Why two hosts cannot talk",
  estimated_minutes: 25,
  description: "Legacy brief describing the mission."
};

function conceptRow(position: number, text: string) {
  return {
    stable_id: `step-${position}`,
    position,
    step_type: "concept",
    payload: { type: "concept", paragraphs: [text] }
  };
}

const PREDICTION_ROW = {
  stable_id: "step-predict",
  position: 2,
  step_type: "prediction",
  payload: {
    type: "prediction",
    prompt: "What will ping report?",
    options: ["Reply", "Timeout"],
    expectedOutcome: "Timeout, because the hosts are in different VLANs."
  }
};

const DIAGRAM_ROW = {
  stable_id: "step-diagram",
  position: 3,
  step_type: "diagram",
  payload: {
    type: "diagram",
    assetStableId: "two-host-topology",
    textAlternative: "Two hosts, one switch, no router."
  }
};

const ASSET_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  mission_id: MISSION_ROW.id,
  stable_id: "two-host-topology",
  asset_type: "diagram",
  title: "Two hosts on one switch",
  uri: "https://cdn.example.test/two-host-topology.svg",
  position: 1,
  required: true,
  alt_text: "Two workstations connected to a single switch."
};

interface TableFixture {
  readonly rows?: unknown[];
  readonly single?: unknown;
  readonly error?: unknown;
}

/**
 * Chainable stand-in recording exactly which tables, filters and orderings the
 * read asked for, so the published/version constraints are asserted rather than
 * assumed.
 */
function clientReturning(byTable: Record<string, TableFixture>) {
  const tables: string[] = [];
  const eqCalls: Array<[string, unknown]> = [];
  const orders: Array<[string, unknown]> = [];
  let tokenSeen = "";

  const client = {
    from: (name: string) => {
      tables.push(name);
      const fixture = byTable[name] ?? {};

      const listResult = fixture.error
        ? { data: null, error: fixture.error }
        : { data: fixture.rows ?? [], error: null };

      // The builder is chainable AND awaitable, because the two call shapes in
      // the read differ: the mission query ends at `.maybeSingle()`, while the
      // step and asset queries are awaited straight after `.order()`.
      const builder: Record<string, unknown> = {};

      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        eqCalls.push([column, value]);
        return builder;
      };
      builder.order = (column: string, options: unknown) => {
        orders.push([column, options]);
        return builder;
      };
      builder.limit = () => builder;
      builder.maybeSingle = () =>
        Promise.resolve(
          fixture.error
            ? { data: null, error: fixture.error }
            : { data: fixture.single ?? null, error: null }
        );
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(listResult).then(resolve, reject);

      return builder;
    }
  };

  return {
    factory: (token: string) => {
      tokenSeen = token;
      return client;
    },
    tables,
    eqCalls,
    orders,
    token: () => tokenSeen
  };
}

/**
 * WP-008 — the server-side step payload reader. Records every call, and
 * exposes ONLY `rpc`: a `.from()` on the service-role client would be a table
 * read outside the one narrow function, and fails here as a TypeError.
 */
function serverReturning(steps: TableFixture | undefined) {
  const rpcCalls: Array<[string, unknown]> = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      rpcCalls.push([name, args]);
      return Promise.resolve(
        steps?.error
          ? { data: null, error: steps.error }
          : { data: steps?.rows ?? [], error: null }
      );
    }
  };
  return { factory: () => client, rpcCalls };
}

async function readInstruction(byTable: Record<string, TableFixture>) {
  const { createServerSupabaseClient, createUserScopedSupabaseClient } =
    await import("./supabase");
  const harness = clientReturning(byTable);
  vi.mocked(createUserScopedSupabaseClient).mockImplementation(
    harness.factory as never
  );
  const server = serverReturning(byTable.mission_steps);
  vi.mocked(createServerSupabaseClient).mockImplementation(
    server.factory as never
  );

  const { getLearnerMissionInstruction } = await import("./curriculum");
  const result = await getLearnerMissionInstruction(
    ACCESS_TOKEN,
    "mission.vlan-basics"
  );

  return { result, harness, server };
}

function published(
  stepRows: unknown[] = [],
  assetRows: unknown[] = []
): Record<string, TableFixture> {
  return {
    missions: { single: MISSION_ROW },
    mission_steps: { rows: stepRows },
    curriculum_assets: { rows: assetRows }
  };
}

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function stripTsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

describe("getLearnerMissionInstruction — authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads through the caller's user-scoped client", async () => {
    const { harness } = await readInstruction(published());

    const { createUserScopedSupabaseClient } = await import("./supabase");
    expect(vi.mocked(createUserScopedSupabaseClient)).toHaveBeenCalledWith(
      ACCESS_TOKEN
    );
    expect(harness.token()).toBe(ACCESS_TOKEN);
  });

  /*
    WP-008 replaced "never constructs the service-role client". A learner's
    role can no longer read `mission_steps.payload`, so the payloads of the
    resolved mission are read server-side. The tests below pin how narrow
    that is: one function, one mission id, after the learner's own client
    resolved a published mission, and never a table read.
  */
  it("uses the service-role client only for the step payload function, with the resolved mission id", async () => {
    const { server } = await readInstruction(published([conceptRow(1, "A.")]));

    const { createServerSupabaseClient } = await import("./supabase");
    expect(vi.mocked(createServerSupabaseClient)).toHaveBeenCalledTimes(1);
    expect(server.rpcCalls).toEqual([
      ["published_mission_step_payloads", { p_mission_id: MISSION_ROW.id }]
    ]);
  });

  it("reads missions and assets through the learner's client, and never mission_steps", async () => {
    const { harness } = await readInstruction(
      published([DIAGRAM_ROW], [ASSET_ROW])
    );

    expect(harness.tables).toEqual(["missions", "curriculum_assets"]);
  });

  it("never constructs the service-role client when no published mission resolves", async () => {
    await expect(
      readInstruction({ missions: { single: null } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { createServerSupabaseClient } = await import("./supabase");
    expect(vi.mocked(createServerSupabaseClient)).not.toHaveBeenCalled();
  });

  it("never constructs the service-role client when the mission query fails", async () => {
    await expect(
      readInstruction({ missions: { error: { message: "boom" } } })
    ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });

    const { createServerSupabaseClient } = await import("./supabase");
    expect(vi.mocked(createServerSupabaseClient)).not.toHaveBeenCalled();
  });

  it("raises DEPENDENCY_UNAVAILABLE when the step payload read fails", async () => {
    await expect(
      readInstruction({
        missions: { single: MISSION_ROW },
        mission_steps: { error: { message: "boom" } }
      })
    ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  });

  it("filters the mission to publication_state published", async () => {
    const { harness } = await readInstruction(published());

    expect(harness.eqCalls).toContainEqual([
      "publication_state",
      "published"
    ]);
  });

  it("resolves the highest published version of the stable id", async () => {
    const { harness, result } = await readInstruction(published());

    expect(harness.eqCalls).toContainEqual([
      "stable_id",
      "mission.vlan-basics"
    ]);
    expect(harness.orders).toContainEqual(["version", { ascending: false }]);
    expect(result.mission.version).toBe(2);
  });

  it("scopes steps and assets to the resolved mission row", async () => {
    // Needs a mission that reaches BOTH queries: with no authored steps the
    // legacy-brief branch returns before assets are ever read.
    const { harness, server } = await readInstruction(
      published([DIAGRAM_ROW], [ASSET_ROW])
    );

    // Assets on the learner's client, steps through the payload function.
    const missionScoped = harness.eqCalls.filter(
      ([column]) => column === "mission_id"
    );
    expect(missionScoped).toEqual([["mission_id", MISSION_ROW.id]]);
    expect(server.rpcCalls.map(([, args]) => args)).toEqual([
      { p_mission_id: MISSION_ROW.id }
    ]);
  });

  it("raises NOT_FOUND when no published mission matches", async () => {
    await expect(
      readInstruction({ missions: { single: null } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("raises DEPENDENCY_UNAVAILABLE when the mission query fails", async () => {
    await expect(
      readInstruction({ missions: { error: { message: "boom" } } })
    ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  });

  it("does not call the service-role step and asset readers", () => {
    const source = stripTsComments(read("./curriculum.ts"));

    expect(source).not.toContain("readMissionSteps");
    expect(source).not.toContain("readMissionAssets");
  });

  it("constructs the service-role client in exactly one place, which calls only the payload function", () => {
    const source = stripTsComments(read("./curriculum.ts"));

    // The import, and one call.
    expect(source.match(/createServerSupabaseClient/g)).toHaveLength(2);
    expect(source).toContain(
      "return createServerSupabaseClient().rpc(STEP_PAYLOAD_FUNCTION, {"
    );
    expect(source).toContain(
      'export const STEP_PAYLOAD_FUNCTION = "published_mission_step_payloads";'
    );
  });
});

describe("getLearnerMissionInstruction — what a learner receives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns available instruction in authored order", async () => {
    const { result } = await readInstruction(
      published([conceptRow(2, "Second."), conceptRow(1, "First.")])
    );

    expect(result.instruction.state).toBe("available");
    if (result.instruction.state !== "available") return;
    expect(result.instruction.steps.map((step) => step.position)).toEqual([
      1, 2
    ]);
  });

  it("withholds expectedOutcome from the serialised response", async () => {
    const { result } = await readInstruction(
      published([conceptRow(1, "Intro."), PREDICTION_ROW])
    );

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("expectedOutcome");
    expect(serialised).not.toContain("different VLANs");
  });

  it("returns only the assets the steps reference", async () => {
    const unreferenced = {
      ...ASSET_ROW,
      id: "33333333-3333-3333-3333-333333333333",
      stable_id: "unused-diagram",
      position: 2
    };

    const { result } = await readInstruction(
      published([DIAGRAM_ROW], [ASSET_ROW, unreferenced])
    );

    if (result.instruction.state !== "available") {
      throw new Error(`expected available, received ${result.instruction.state}`);
    }
    expect(result.instruction.assets.map((asset) => asset.stableId)).toEqual([
      "two-host-topology"
    ]);
  });

  it("carries an asset's alt text through unchanged", async () => {
    const { result } = await readInstruction(
      published([DIAGRAM_ROW], [ASSET_ROW])
    );

    if (result.instruction.state !== "available") {
      throw new Error(`expected available, received ${result.instruction.state}`);
    }
    expect(result.instruction.assets[0]?.altText).toBe(
      "Two workstations connected to a single switch."
    );
  });

  it("omits internal asset identity from the response", async () => {
    const { result } = await readInstruction(
      published([DIAGRAM_ROW], [ASSET_ROW])
    );

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain(ASSET_ROW.id);
    expect(serialised).not.toContain(MISSION_ROW.id);
  });

  it("falls back to the legacy brief when no steps are authored", async () => {
    const { result } = await readInstruction(published([]));

    expect(result.instruction).toEqual({
      state: "legacy_brief",
      description: "Legacy brief describing the mission."
    });
  });

  it("never returns the legacy brief alongside authored steps", async () => {
    const { result } = await readInstruction(published([conceptRow(1, "A.")]));

    expect(result.instruction.state).toBe("available");
    expect("description" in result.instruction).toBe(false);
  });

  it("reports content_error for a malformed persisted step", async () => {
    const { result } = await readInstruction(
      published([
        { ...conceptRow(1, "A."), payload: { type: "concept", paragraphs: 7 } }
      ])
    );

    expect(result.instruction).toEqual({ state: "content_error" });
  });

  it("reports content_error when step_type and payload.type disagree", async () => {
    const { result } = await readInstruction(
      published([{ ...conceptRow(1, "A."), step_type: "command" }])
    );

    expect(result.instruction).toEqual({ state: "content_error" });
  });

  it("reports content_error when a referenced asset is missing", async () => {
    const { result } = await readInstruction(published([DIAGRAM_ROW], []));

    expect(result.instruction).toEqual({ state: "content_error" });
  });

  it("reports content_error for a malformed persisted asset", async () => {
    const { result } = await readInstruction(
      published([DIAGRAM_ROW], [{ ...ASSET_ROW, title: 42 }])
    );

    expect(result.instruction).toEqual({ state: "content_error" });
  });

  it("leaks no validation diagnostics on content_error", async () => {
    const { result } = await readInstruction(
      published([
        { ...conceptRow(1, "A."), payload: { type: "concept", paragraphs: 7 } }
      ])
    );

    expect(Object.keys(result.instruction)).toEqual(["state"]);
    expect(JSON.stringify(result)).not.toContain("paragraphs");
  });

  it("still identifies the mission when its content is unusable", async () => {
    const { result } = await readInstruction(published([DIAGRAM_ROW], []));

    expect(result.mission).toEqual({
      stableId: "mission.vlan-basics",
      version: 2,
      title: "Why two hosts cannot talk",
      estimatedMinutes: 25
    });
  });

  it("omits estimatedMinutes when the mission has none", async () => {
    const { result } = await readInstruction({
      missions: { single: { ...MISSION_ROW, estimated_minutes: null } },
      mission_steps: { rows: [] },
      curriculum_assets: { rows: [] }
    });

    expect("estimatedMinutes" in result.mission).toBe(false);
  });

  it("does not disclose the mission row id", async () => {
    const { result } = await readInstruction(published());

    expect("id" in result.mission).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * WP-008 — near-transfer answers are judged on the server (DEC-074)
 * ------------------------------------------------------------------ */

const NEAR_TRANSFER_ROW = {
  stable_id: "step-transfer",
  position: 4,
  step_type: "near_transfer",
  payload: {
    type: "near_transfer",
    title: "Try a different network",
    questions: [
      {
        questionStableId: "q-one",
        type: "single_choice",
        prompt: "Which device joins two networks?",
        options: [
          { optionId: "router", text: "The router" },
          { optionId: "switch", text: "The switch" }
        ],
        correctOptionIds: ["router"],
        explanation: "Only the router uniquewithheldexplanation joins networks."
      },
      {
        questionStableId: "q-two",
        type: "multiple_choice",
        prompt: "Which two are hosts?",
        options: [
          { optionId: "pc", text: "The PC" },
          { optionId: "printer", text: "The printer" },
          { optionId: "hub", text: "The hub" }
        ],
        correctOptionIds: ["pc", "printer"],
        explanation: "Both uniquesecondexplanation end devices."
      }
    ]
  }
};

async function checkAnswer(
  byTable: Record<string, TableFixture>,
  request: {
    stepStableId: string;
    questionStableId: string;
    selectedOptionIds: readonly string[];
  }
) {
  const { createServerSupabaseClient, createUserScopedSupabaseClient } =
    await import("./supabase");
  const harness = clientReturning(byTable);
  vi.mocked(createUserScopedSupabaseClient).mockImplementation(
    harness.factory as never
  );
  const server = serverReturning(byTable.mission_steps);
  vi.mocked(createServerSupabaseClient).mockImplementation(
    server.factory as never
  );

  const { checkLearnerNearTransferAnswer } = await import("./curriculum");
  const result = await checkLearnerNearTransferAnswer(
    ACCESS_TOKEN,
    "mission.vlan-basics",
    request
  );
  return { result, harness, server };
}

describe("getLearnerMissionInstruction — no near-transfer answer in the response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the questions and options, and no answer field or value", async () => {
    const { result } = await readInstruction(
      published([conceptRow(1, "Intro."), NEAR_TRANSFER_ROW])
    );

    if (result.instruction.state !== "available") {
      throw new Error(`expected available, received ${result.instruction.state}`);
    }
    const step = result.instruction.steps.find(
      (candidate) => candidate.content.type === "near_transfer"
    );
    if (step?.content.type !== "near_transfer") throw new Error("no step");
    expect(step.content.questions.map((q) => q.questionStableId)).toEqual([
      "q-one",
      "q-two"
    ]);

    const serialised = JSON.stringify(result);
    for (const field of ["answers", "correctOptionIds", "explanation"]) {
      expect(serialised).not.toContain(`"${field}"`);
    }
    expect(serialised).not.toContain("uniquewithheldexplanation");
    expect(serialised).not.toContain("uniquesecondexplanation");
  });
});

describe("checkLearnerNearTransferAnswer — the server-side verdict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const transfer = () => published([conceptRow(1, "Intro."), NEAR_TRANSFER_ROW]);

  it("passes a correct answer, with the explanation and no expected answer", async () => {
    const { result } = await checkAnswer(transfer(), {
      stepStableId: "step-transfer",
      questionStableId: "q-one",
      selectedOptionIds: ["router"]
    });

    expect(result).toEqual({
      correct: true,
      expectedOptionIds: [],
      explanation: "Only the router uniquewithheldexplanation joins networks."
    });
  });

  it("fails a wrong answer, and returns the expected answer only then", async () => {
    const { result } = await checkAnswer(transfer(), {
      stepStableId: "step-transfer",
      questionStableId: "q-one",
      selectedOptionIds: ["switch"]
    });

    expect(result).toEqual({
      correct: false,
      expectedOptionIds: ["router"],
      explanation: "Only the router uniquewithheldexplanation joins networks."
    });
  });

  it("uses exact set equality for a multiple-choice question", async () => {
    const ask = (selectedOptionIds: string[]) =>
      checkAnswer(transfer(), {
        stepStableId: "step-transfer",
        questionStableId: "q-two",
        selectedOptionIds
      }).then(({ result }) => result.correct);

    expect(await ask(["printer", "pc"])).toBe(true);
    expect(await ask(["pc"])).toBe(false);
    expect(await ask(["pc", "printer", "hub"])).toBe(false);
  });

  it("returns only the verdict and learner-safe feedback for the one question asked", async () => {
    const { result } = await checkAnswer(transfer(), {
      stepStableId: "step-transfer",
      questionStableId: "q-one",
      selectedOptionIds: ["switch"]
    });

    expect(Object.keys(result).sort()).toEqual([
      "correct",
      "expectedOptionIds",
      "explanation"
    ]);
    // Nothing about the OTHER question crosses with it.
    expect(JSON.stringify(result)).not.toContain("uniquesecondexplanation");
    expect(JSON.stringify(result)).not.toContain("printer");
  });

  it("resolves the mission through the learner's client before the payload function", async () => {
    const { harness, server } = await checkAnswer(transfer(), {
      stepStableId: "step-transfer",
      questionStableId: "q-one",
      selectedOptionIds: ["router"]
    });

    const { createUserScopedSupabaseClient } = await import("./supabase");
    expect(vi.mocked(createUserScopedSupabaseClient)).toHaveBeenCalledWith(
      ACCESS_TOKEN
    );
    expect(harness.tables).toEqual(["missions"]);
    expect(harness.eqCalls).toContainEqual(["publication_state", "published"]);
    expect(server.rpcCalls).toEqual([
      ["published_mission_step_payloads", { p_mission_id: MISSION_ROW.id }]
    ]);
  });

  it("never reaches the service role for a mission that does not resolve as published", async () => {
    await expect(
      checkAnswer(
        { missions: { single: null } },
        {
          stepStableId: "step-transfer",
          questionStableId: "q-one",
          selectedOptionIds: ["router"]
        }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { createServerSupabaseClient } = await import("./supabase");
    expect(vi.mocked(createServerSupabaseClient)).not.toHaveBeenCalled();
  });

  for (const [name, request] of [
    ["an unknown step", { stepStableId: "nope", questionStableId: "q-one" }],
    ["a step that is not a near-transfer", { stepStableId: "step-1", questionStableId: "q-one" }],
    ["an unknown question", { stepStableId: "step-transfer", questionStableId: "nope" }]
  ] as const) {
    it(`refuses ${name} as NOT_FOUND`, async () => {
      await expect(
        checkAnswer(transfer(), { ...request, selectedOptionIds: ["router"] })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  }

  it("refuses an option the question does not offer, rather than judging it", async () => {
    await expect(
      checkAnswer(transfer(), {
        stepStableId: "step-transfer",
        questionStableId: "q-one",
        selectedOptionIds: ["router", "pc"]
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a mission whose content is unusable as NOT_FOUND", async () => {
    await expect(
      checkAnswer(
        published([{ ...NEAR_TRANSFER_ROW, payload: { type: "near_transfer" } }]),
        {
          stepStableId: "step-transfer",
          questionStableId: "q-one",
          selectedOptionIds: ["router"]
        }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("writes nothing: the service-role client exposes only the payload function", () => {
    const source = stripTsComments(read("./curriculum.ts"));
    const check = source.slice(
      source.indexOf("export async function checkLearnerNearTransferAnswer"),
      source.indexOf("async function readPublishedMissionSteps")
    );

    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      expect(check).not.toContain(write);
    }
  });
});

describe("parseNearTransferCheckRequest — shape only", () => {
  it("accepts a well-formed request", async () => {
    const { parseNearTransferCheckRequest } = await import("./curriculum");
    expect(
      parseNearTransferCheckRequest({
        stepStableId: "s",
        questionStableId: "q",
        selectedOptionIds: ["a", "b"]
      })
    ).toEqual({ stepStableId: "s", questionStableId: "q", selectedOptionIds: ["a", "b"] });
  });

  for (const [name, body] of [
    ["no step", { questionStableId: "q", selectedOptionIds: ["a"] }],
    ["no question", { stepStableId: "s", selectedOptionIds: ["a"] }],
    ["no selection", { stepStableId: "s", questionStableId: "q" }],
    ["an empty selection", { stepStableId: "s", questionStableId: "q", selectedOptionIds: [] }],
    ["a non-string option", { stepStableId: "s", questionStableId: "q", selectedOptionIds: [1] }],
    ["a selection that is not a list", { stepStableId: "s", questionStableId: "q", selectedOptionIds: "a" }],
    [
      "an oversized selection",
      { stepStableId: "s", questionStableId: "q", selectedOptionIds: Array.from({ length: 51 }, (_, i) => `o${i}`) }
    ]
  ] as const) {
    it(`refuses ${name}`, async () => {
      const { parseNearTransferCheckRequest } = await import("./curriculum");
      expect(() =>
        parseNearTransferCheckRequest(body as Record<string, unknown>)
      ).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
    });
  }
});

describe("the near-transfer check route is authenticated before anything is read", () => {
  const server = stripTsComments(read("./server.ts"));
  const start = server.indexOf("const nearTransferCheckMatch");
  const handler = server.slice(start, server.indexOf("return;", start));

  it("registers the route", () => {
    expect(start).toBeGreaterThan(-1);
    expect(handler).toContain(
      "/^\\/learning\\/missions\\/([^/]+)\\/near-transfer\\/check$/"
    );
  });

  it("resolves a trusted identity before reading the body or calling the check", () => {
    const guard = handler.indexOf("resolveTrustedRequestIdentity");
    const body = handler.indexOf("readJsonBody(");
    const call = handler.indexOf("checkLearnerNearTransferAnswer(");

    expect(guard).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(guard);
    expect(call).toBeGreaterThan(guard);
  });

  it("validates the body and passes the caller's own access token", () => {
    expect(handler).toContain("parseNearTransferCheckRequest(body)");
    expect(handler).toContain("trusted.accessToken");
    expect(handler).not.toContain("SERVICE_ROLE");
  });

  it("accepts POST only", () => {
    expect(handler).toContain('request.method === "POST"');
  });
});

describe("the instruction route is authenticated before anything is read", () => {
  const server = stripTsComments(read("./server.ts"));

  const handler = server.slice(
    server.indexOf("const missionInstructionMatch"),
    server.indexOf("const missionProgressMatch")
  );

  it("registers the route", () => {
    expect(handler).toContain(
      "/^\\/learning\\/missions\\/([^/]+)\\/instruction$/"
    );
  });

  it("resolves a trusted identity before calling the read", () => {
    const guard = handler.indexOf("resolveTrustedRequestIdentity");
    const call = handler.indexOf("getLearnerMissionInstruction(");

    expect(guard).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(guard);
  });

  it("passes the caller's own access token, never a service credential", () => {
    expect(handler).toContain("trusted.accessToken");
    expect(handler).not.toContain("SERVICE_ROLE");
  });

  it("accepts GET only", () => {
    expect(handler).toContain('request.method === "GET"');
  });
});
