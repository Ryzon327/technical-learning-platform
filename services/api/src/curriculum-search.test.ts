import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEARCH-002 structural boundaries plus executable search behaviour.
 *
 * The client factory is mocked using the CERT-005 precedent: whether reads go
 * through the caller's RLS-scoped client, how the query is escaped, and how
 * multiple published versions collapse cannot be proven by reading source.
 *
 * NOT proven here: real RLS isolation. Every permission claim below is a
 * query-level claim, not a live-RLS claim — the repository has no live
 * PostgreSQL harness.
 */
vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

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

const service = read("./curriculum-search.ts");
const serviceCode = stripTsComments(service);
const server = read("./server.ts");
const sharedModel = read("../../../packages/shared-types/src/curriculum-search.ts");

const searchRoute = server.slice(
  server.indexOf("// SEARCH-002 — curriculum search."),
  server.indexOf('if (request.method === "GET" && pathname === "/bookmarks")')
);

const ACCESS_TOKEN = "test-access-token";

function row(overrides: Record<string, unknown> = {}) {
  return {
    stable_id: "course.networking",
    version: 1,
    title: "Networking Basics",
    description: "Run show vlan brief to inspect VLANs.",
    publication_state: "published",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides
  };
}

/** Chainable stand-in returning per-table rows and recording the calls made. */
function clientReturning(byTable: Record<string, unknown[]>, error?: unknown) {
  const tables: string[] = [];
  const eqCalls: Array<[string, unknown]> = [];
  const orPatterns: string[] = [];
  const limits: number[] = [];
  let tokenSeen = "";

  const client = {
    from: (name: string) => {
      tables.push(name);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        eqCalls.push([column, value]);
        return builder;
      };
      builder.or = (pattern: string) => {
        orPatterns.push(pattern);
        return builder;
      };
      builder.limit = (value: number) => {
        limits.push(value);
        return Promise.resolve(
          error ? { data: null, error } : { data: byTable[name] ?? [], error: null }
        );
      };
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
    orPatterns,
    limits,
    token: () => tokenSeen
  };
}

async function search(
  byTable: Record<string, unknown[]>,
  input: Record<string, unknown> = {},
  error?: unknown
) {
  const { createUserScopedSupabaseClient } = await import("./supabase");
  const harness = clientReturning(byTable, error);
  vi.mocked(createUserScopedSupabaseClient).mockImplementation(
    harness.factory as never
  );

  const { searchCurriculum } = await import("./curriculum-search");
  const results = await searchCurriculum(ACCESS_TOKEN, {
    query: "vlan",
    ...input
  });

  return { results, harness };
}

describe("A: Curriculum remains authoritative", () => {
  it("A: writes nothing", () => {
    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      expect(serviceCode).not.toContain(write);
    }
  });

  it("A2: creates no index, cache or materialized store", () => {
    for (const forbidden of [
      "search_documents",
      "materialized",
      "cache",
      "tsvector",
      "to_tsquery",
      "pg_trgm"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  /**
   * Targets lifecycle VERBS and actual mutations. The column name alone is not
   * a violation — `publication_state` legitimately appears as a row type field
   * and as a read constraint; writing it would be the violation, and A already
   * proves no write path exists.
   */
  it("A3: never mutates publication state or asserts lifecycle", () => {
    for (const forbidden of ["retire", "supersede", "lineage", "publish("]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
    expect(serviceCode).not.toMatch(/\.(update|upsert)\([^)]*publication_state/);
  });

  it("A4: builds no indexing worker, queue or schedule", () => {
    for (const forbidden of ["setinterval", "settimeout", "cron", "queue", "worker"]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("B: authorization", () => {
  it("B: reads through the caller's RLS-scoped client only", () => {
    expect(serviceCode).toContain("createUserScopedSupabaseClient(accessToken)");
    expect(serviceCode).not.toContain("createServerSupabaseClient");
  });

  it("B2: accepts no caller-supplied identity", () => {
    for (const forbidden of ["userId", "user_id", "studentId", "actorId"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("B3: the route requires trusted authentication", () => {
    expect(searchRoute).toContain("resolveTrustedRequestIdentity(request)");
    expect(searchRoute).toContain("trusted.accessToken");
  });

  it("B4: the route is a GET read only", () => {
    expect(searchRoute).toContain('request.method === "GET"');
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(searchRoute).not.toContain(`request.method === "${method}"`);
    }
  });

  it("B5: no public or admin search route exists", () => {
    for (const forbidden of [
      '"/admin/search"',
      '"/search/public"',
      '"/public/search"'
    ]) {
      expect(server).not.toContain(forbidden);
    }
  });

  it("B6: refuses to search without an access token", async () => {
    const { searchCurriculum } = await import("./curriculum-search");

    await expect(
      searchCurriculum("  ", { query: "vlan" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("C: exactly four curriculum types, no notes", () => {
  it("C: searches exactly the four approved tables", () => {
    const tables = (serviceCode.match(/: "([a-z_]+)"/g) ?? [])
      .map((entry) => entry.replace(/[:"\s]/g, ""))
      .filter((entry) =>
        ["learning_paths", "courses", "missions", "competencies"].includes(entry)
      );

    expect(new Set(tables)).toEqual(
      new Set(["learning_paths", "courses", "missions", "competencies"])
    );
  });

  it("C2: never searches modules, assets or labs", () => {
    for (const forbidden of [
      "learning_modules",
      "curriculum_assets",
      "lab_definitions"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("C3: never touches a note source", () => {
    for (const forbidden of ["student_notes", "searchStudentNotes", "noteId"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });
});

describe("D: later Search features are not implemented", () => {
  it("D: no fuzzy, synonym or typo behaviour", () => {
    for (const forbidden of ["fuzzy", "synonym", "typo", "levenshtein", "soundex"]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("D2: no ranking, scoring or faceting", () => {
    for (const forbidden of ["relevance", "score", "facet", "boost", "weight"]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("D3: no AI or embeddings", () => {
    expect(serviceCode).not.toMatch(/openai|anthropic|ollama|embedding/i);
  });

  it("D4: no query persistence or logging", () => {
    for (const forbidden of ["search_history", "query_log", "console.", "log("]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("D5: no pagination cursor or global total", () => {
    for (const forbidden of ["cursor", "offset", "totalCount", "resultSources"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });
});

describe("E: executable search behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("E: returns published curriculum matching the query", async () => {
    const { results } = await search({ courses: [row()] });

    expect(results.count).toBe(1);
    expect(results.results[0]?.title).toBe("Networking Basics");
    expect(results.results[0]?.contentType).toBe("course");
  });

  it("E2: reads through the caller's token", async () => {
    const { harness } = await search({ courses: [row()] });

    expect(harness.token()).toBe(ACCESS_TOKEN);
  });

  it("E3: queries exactly the four approved tables", async () => {
    const { harness } = await search({});

    expect(harness.tables).toEqual([
      "learning_paths",
      "courses",
      "missions",
      "competencies"
    ]);
  });

  it("E4: constrains every read to published rows", async () => {
    const { harness } = await search({});

    expect(harness.eqCalls).toEqual([
      ["publication_state", "published"],
      ["publication_state", "published"],
      ["publication_state", "published"],
      ["publication_state", "published"]
    ]);
  });

  it("E5: matches title and description only", async () => {
    const { harness } = await search({});

    for (const pattern of harness.orPatterns) {
      expect(pattern).toBe("title.ilike.%vlan%,description.ilike.%vlan%");
    }
  });

  it("E6: escapes wildcard characters before matching", async () => {
    const { harness } = await search({}, { query: "100% _x" });

    expect(harness.orPatterns[0]).toContain("100\\%");
    expect(harness.orPatterns[0]).toContain("\\_x");
  });

  it("E7: bounds the candidate over-fetch and the returned results", async () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      row({ stable_id: `course.${index}`, version: 1 })
    );

    const { results, harness } = await search({ courses: rows }, { limit: 5 });

    // Over-fetch is bounded at limit * 4 per type, never unbounded.
    expect(harness.limits).toEqual([20, 20, 20, 20]);
    // The learner still receives no more than the requested limit.
    expect(results.results).toHaveLength(5);
    expect(results.count).toBe(5);
  });

  it("E8: collapses multiple published versions to the highest", async () => {
    const { results } = await search({
      courses: [
        row({ stable_id: "course.example", version: 1 }),
        row({ stable_id: "course.example", version: 2 })
      ]
    });

    expect(results.count).toBe(1);
    expect(results.results[0]?.sourceVersion).toBe(2);
    expect(results.results[0]?.documentId).toBe(
      "curriculum:course:course.example@2"
    );
  });

  it("E9: orders results neutrally across types", async () => {
    const { results } = await search({
      learning_paths: [row({ stable_id: "path.a" })],
      courses: [row({ stable_id: "course.a" })],
      missions: [row({ stable_id: "mission.a" })],
      competencies: [row({ stable_id: "competency.a" })]
    });

    expect(results.results.map((entry) => entry.contentType)).toEqual([
      "learning_path",
      "course",
      "mission",
      "competency"
    ]);
  });

  it("E10: never returns an internal identifier", async () => {
    const { results } = await search({
      courses: [row({ id: "11111111-1111-4111-8111-111111111111" })]
    });

    expect(JSON.stringify(results)).not.toContain(
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("E11: refuses an empty query before any read", async () => {
    const { createUserScopedSupabaseClient } = await import("./supabase");
    vi.mocked(createUserScopedSupabaseClient).mockClear();

    const { searchCurriculum } = await import("./curriculum-search");

    await expect(
      searchCurriculum(ACCESS_TOKEN, { query: "   " })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createUserScopedSupabaseClient).not.toHaveBeenCalled();
  });

  it("E12: refuses an over-long query before any read", async () => {
    const { createUserScopedSupabaseClient } = await import("./supabase");
    vi.mocked(createUserScopedSupabaseClient).mockClear();

    const { searchCurriculum } = await import("./curriculum-search");

    await expect(
      searchCurriculum(ACCESS_TOKEN, { query: "x".repeat(201) })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createUserScopedSupabaseClient).not.toHaveBeenCalled();
  });

  it("E13: a dependency failure is retryable, never an empty result", async () => {
    await expect(
      search({}, {}, { message: "connection terminated" })
    ).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      retryable: true
    });
  });

  it("E14: an honest empty result set is distinguishable from a failure", async () => {
    const { results } = await search({});

    expect(results.results).toEqual([]);
    expect(results.count).toBe(0);
  });

  it("E15: the response carries exactly results and count", async () => {
    const { results } = await search({ courses: [row()] });

    expect(Object.keys(results).sort()).toEqual(["count", "results"]);
  });

  it("E16: preserves the source text representation in the snippet", async () => {
    const { results } = await search(
      {
        courses: [
          row({
            title: "PowerShell",
            description: "Use Get-ADUser -Filter * to list accounts."
          })
        ]
      },
      { query: "get-aduser" }
    );

    expect(results.results[0]?.searchableText).toContain("Get-ADUser");
  });
});
