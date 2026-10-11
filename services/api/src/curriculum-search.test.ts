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

/** What one record-source read asked the database to match. */
interface RecordMatch {
  p_phrases: string[];
  p_acronyms: string[];
}

/**
 * Stand-in database returning per-table rows and recording the calls made.
 *
 * Founder direction G-005: each of the four record sources is read through
 * the SECURITY INVOKER function `search_published_curriculum_records`
 * (`curriculum-record-search.ts`), one keyset-paged read per source. The
 * stand-in models that function: phrases as case-insensitive substrings and
 * acronyms as whole words, of the title or the description, one row per
 * stable id at its highest matching version, in stable-id order. It applies
 * NO publication rule of its own, so the service's own re-check is what keeps
 * a non-published row out. Real PostgreSQL behaviour is proven in
 * `curriculum-step-search.db.test.ts`.
 *
 * `tables`, `matches` and `limits` record the FIRST page of each source read
 * (its source, its match arguments and its page size), so they keep
 * describing exactly the four record-source reads every SEARCH-002 to
 * SEARCH-008 assertion below is about; `recordCalls` records every page.
 * WP-005's step and context reads are recorded in `contextReads`, and
 * `wp005-search.test.ts` asserts them.
 */
function clientReturning(byTable: Record<string, unknown[]>, error?: unknown) {
  const tables: string[] = [];
  const matches: RecordMatch[] = [];
  const limits: number[] = [];
  const recordCalls: Array<Record<string, unknown>> = [];
  const contextReads: string[] = [];
  let tokenSeen = "";

  const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

  /**
   * Whether a row's title or description matches. Without this the stand-in
   * returns rows regardless of the query, so a pass could never produce zero
   * results and SEARCH-005B recovery could never be exercised.
   */
  const rowMatches = (candidate: Record<string, unknown>, args: Record<string, unknown>) =>
    [textOf(candidate.title), textOf(candidate.description)].some(
      (field) =>
        ((args.p_phrases as string[]) ?? []).some(
          (phrase) =>
            phrase.trim() !== "" &&
            field.toLowerCase().includes(phrase.trim().toLowerCase())
        ) ||
        ((args.p_acronyms as string[]) ?? [])
          .filter((term) => /^[A-Za-z0-9]+$/.test(term))
          .some((term) => new RegExp(`\\b${term}s?\\b`, "i").test(field))
    );

  const recordPage = (args: Record<string, unknown>): unknown[] => {
    const highest = new Map<string, Record<string, unknown>>();
    for (const candidate of (byTable[String(args.p_source)] ?? []) as Array<
      Record<string, unknown>
    >) {
      if (!rowMatches(candidate, args)) continue;
      const stableId = String(candidate.stable_id);
      const incumbent = highest.get(stableId);
      if (!incumbent || Number(candidate.version) > Number(incumbent.version)) {
        highest.set(stableId, candidate);
      }
    }
    const after = args.p_after as string | null;
    const pageSize = Math.min(Math.max(Number(args.p_page_size ?? 50), 1), 100);
    return [...highest.values()]
      .sort((a, b) => (String(a.stable_id) < String(b.stable_id) ? -1 : 1))
      .filter((candidate) => after === null || String(candidate.stable_id) > after)
      .slice(0, pageSize);
  };

  const client = {
    rpc: (name: string, args: Record<string, unknown> = {}) => {
      if (name === "search_published_curriculum_records") {
        recordCalls.push(args);
        if (args.p_after === null) {
          tables.push(String(args.p_source));
          matches.push({
            p_phrases: args.p_phrases as string[],
            p_acronyms: args.p_acronyms as string[]
          });
          limits.push(Number(args.p_page_size));
        }
        return Promise.resolve(
          error ? { data: null, error } : { data: recordPage(args), error: null }
        );
      }
      // WP-005 step-body search and mission context (`curriculum-step-search.ts`);
      // this stand-in has no steps to match.
      contextReads.push(name);
      return Promise.resolve(error ? { data: null, error } : { data: [], error: null });
    }
  };

  return {
    factory: (token: string) => {
      tokenSeen = token;
      return client;
    },
    tables,
    matches,
    limits,
    recordCalls,
    contextReads,
    token: () => tokenSeen
  };
}

/** The G-005 record-search migration, for the statements the service relies on. */
const recordSearchMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20261012000100_curriculum_record_search_function.sql",
    import.meta.url
  ),
  "utf8"
)
  .replace(/--.*$/gm, "")
  .replace(/\s+/g, " ");

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
  /**
   * NARROWED FOR SEARCH-005B, not weakened. Bounded typo recovery against a
   * closed approved vocabulary is now the approved deliverable, so `typo` is no
   * longer forbidden. Every UNBOUNDED matching technique still is — and the
   * list grew to cover the mechanisms SEARCH-005B deliberately did not use.
   */
  it("D: no fuzzy or unbounded similarity behaviour", () => {
    for (const forbidden of [
      "fuzzy",
      "synonym",
      "levenshtein",
      "damerau",
      "soundex",
      "stemming",
      "semantic",
      "trgm",
      "spelling",
      "similarity"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  /**
   * Faceting was forbidden here under SEARCH-002 and is the approved SEARCH-004
   * deliverable, so it is no longer listed.
   *
   * NARROWED FOR SEARCH-008, not weakened. Deterministic ranking is now the
   * approved deliverable and the service composes its builder, so the bare
   * substring `rank` can no longer be prohibited — it appears in the approved
   * builder's own name.
   *
   * Everything ruling 3 actually prohibits is still forbidden, and the list GREW
   * to name the specific scoring forms that must never appear. A ranking that
   * scores, weights or boosts would still fail here; the approved lexicographic
   * comparator carries no such term.
   */
  it("D2: no numeric relevance, scoring or weighting", () => {
    for (const forbidden of [
      "relevance",
      "score",
      "boost",
      "weight",
      "rankscore",
      "ranking configuration",
      "popularity",
      "engagement",
      "clickhistory"
    ]) {
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

  /**
   * MOVED FOR G-005, not weakened. The publication constraint is no longer a
   * PostgREST `.eq` on a table read: the record-search function states it for
   * every source, and the service re-checks every row it returns. Both halves
   * are proven here, and no read carries a caller-chosen publication input.
   */
  it("E4: constrains every read to published rows", async () => {
    const { results, harness } = await search({
      courses: [
        row(),
        row({ stable_id: "course.draft", publication_state: "draft" }),
        row({ stable_id: "course.retired", publication_state: "retired" })
      ]
    });

    expect(harness.recordCalls.length).toBeGreaterThanOrEqual(4);
    for (const call of harness.recordCalls) {
      expect(Object.keys(call).sort()).toEqual([
        "p_acronyms",
        "p_after",
        "p_page_size",
        "p_phrases",
        "p_source"
      ]);
    }
    expect(results.results.map((entry) => entry.sourceRecordStableId)).toEqual([
      "course.networking"
    ]);
    for (const [table, alias] of [
      ["learning_paths", "lp"],
      ["courses", "c"],
      ["missions", "m"],
      ["competencies", "k"]
    ]) {
      expect(recordSearchMigration).toContain(
        `from public.${table} as ${alias} where p_source = '${table}' and ${alias}.publication_state = 'published'`
      );
    }
  });

  /**
   * NARROWED FOR WP-005, not weakened. `vlan` is now an approved acronym, so it
   * expands; the exact match arguments are pinned on a plain term instead.
   * MOVED FOR G-005: the read is a database function, so what it matches is
   * proven in its SQL — the title and the description, separately, and no
   * other column.
   */
  it("E5: matches title and description only", async () => {
    const plain = await search({}, { query: "inspect" });

    expect(plain.harness.matches).toHaveLength(4);
    for (const match of plain.harness.matches) {
      expect(match).toEqual({ p_phrases: ["inspect"], p_acronyms: [] });
    }

    for (const condition of [
      "strpos(lower(r.record_title), n.needle) > 0",
      "strpos(lower(coalesce(r.record_description, '')), n.needle) > 0",
      "r.record_title ~* w.pattern",
      "coalesce(r.record_description, '') ~* w.pattern"
    ]) {
      expect(recordSearchMigration).toContain(condition);
    }
    const matched = recordSearchMigration.slice(
      recordSearchMigration.indexOf("matched as ("),
      recordSearchMigration.indexOf("select mt.record_id")
    );
    expect(
      [...new Set(matched.match(/r\.record_[a-z_]+/g))].sort()
    ).toEqual(["r.record_description", "r.record_id", "r.record_title", "r.record_version"]);
  });

  /**
   * MOVED FOR G-005. Phrases are matched by `strpos`, which has no wildcard,
   * so `%` and `_` reach the database as the learner typed them and match
   * only themselves. Proven against real PostgreSQL in
   * `curriculum-step-search.db.test.ts`.
   */
  it("E6: escapes wildcard characters before matching", async () => {
    const { results, harness } = await search(
      {
        courses: [
          row({ stable_id: "course.literal", title: "Scoring 100% _x" }),
          row({ stable_id: "course.wild", title: "Scoring 1000 xx" })
        ]
      },
      { query: "100% _x" }
    );

    expect(harness.matches[0]?.p_phrases).toEqual(["100% _x"]);
    expect(results.results.map((entry) => entry.sourceRecordStableId)).toEqual([
      "course.literal"
    ]);
    expect(recordSearchMigration).not.toMatch(/\blike\b|\bilike\b/i);
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

  /** WP-005 adds `matchLocations` beside the results, and nothing else. */
  it("E15: the response carries exactly results, count, facets and match locations", async () => {
    const { results } = await search({ courses: [row()] }, { query: "inspect" });

    expect(Object.keys(results).sort()).toEqual([
      "count",
      "facets",
      "matchLocations",
      "results"
    ]);
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

/**
 * SEARCH-004 — filters and facets.
 *
 * The security claim under test is narrow and provable: filtering runs on the
 * already-authorized result set, so it cannot change which sources are read,
 * and facets count the documents actually returned, so no count can describe a
 * record the caller did not receive.
 */
describe("F: SEARCH-004 content-type filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  const everyType = {
    learning_paths: [row({ stable_id: "path.a" })],
    courses: [row({ stable_id: "course.a" }), row({ stable_id: "course.b" })],
    missions: [row({ stable_id: "mission.a" })],
    competencies: [row({ stable_id: "competency.a" })]
  };

  /**
   * Everything about a response that a filter can affect. `indexedAt` is a
   * wall-clock stamp taken per request, so comparing whole responses across two
   * searches would compare the clock rather than the filter.
   */
  function shape(results: {
    results: { documentId: string }[];
    count: number;
    facets?: unknown;
  }) {
    return {
      documentIds: results.results.map((entry) => entry.documentId),
      count: results.count,
      facets: results.facets
    };
  }

  it("F1: no filter preserves the unfiltered result set", async () => {
    const unfiltered = await search(everyType);
    const absent = await search(everyType, { contentTypes: undefined });
    const empty = await search(everyType, { contentTypes: [] });

    expect(unfiltered.results.count).toBe(5);
    expect(shape(absent.results)).toEqual(shape(unfiltered.results));
    expect(shape(empty.results)).toEqual(shape(unfiltered.results));
  });

  it("F2: narrows to a single content type", async () => {
    const { results } = await search(everyType, { contentTypes: ["course"] });

    expect(results.count).toBe(2);
    expect(
      new Set(results.results.map((entry) => entry.contentType))
    ).toEqual(new Set(["course"]));
  });

  it("F3: combines several content types", async () => {
    const { results } = await search(everyType, {
      contentTypes: ["mission", "course"]
    });

    expect(results.results.map((entry) => entry.contentType)).toEqual([
      "course",
      "course",
      "mission"
    ]);
  });

  it("F4: selecting all four is the same as no filter", async () => {
    const all = await search(everyType, {
      contentTypes: ["learning_path", "course", "mission", "competency"]
    });
    const none = await search(everyType);

    expect(shape(all.results)).toEqual(shape(none.results));
  });

  it("F5: normalizes duplicate values", async () => {
    const duplicated = await search(everyType, {
      contentTypes: ["course", "course", "course"]
    });
    const once = await search(everyType, { contentTypes: ["course"] });

    expect(shape(duplicated.results)).toEqual(shape(once.results));
  });

  it("F6: request order does not change the response", async () => {
    const forward = await search(everyType, {
      contentTypes: ["course", "mission"]
    });
    const reversed = await search(everyType, {
      contentTypes: ["mission", "course"]
    });

    expect(shape(forward.results)).toEqual(shape(reversed.results));
  });

  it("F7: an empty repeated value is ignored, not treated as a filter", async () => {
    const withEmpty = await search(everyType, { contentTypes: [""] });
    const none = await search(everyType);

    expect(shape(withEmpty.results)).toEqual(shape(none.results));
  });

  it("F8: rejects an unknown value before any read", async () => {
    const { createUserScopedSupabaseClient } = await import("./supabase");
    vi.mocked(createUserScopedSupabaseClient).mockClear();

    const { searchCurriculum } = await import("./curriculum-search");

    await expect(
      searchCurriculum(ACCESS_TOKEN, {
        query: "vlan",
        contentTypes: ["everything"]
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createUserScopedSupabaseClient).not.toHaveBeenCalled();
  });

  /**
   * Each of these names a source SEARCH-004 must not make searchable, or a
   * dimension it must not expose. Rejecting rather than ignoring means a client
   * cannot probe for them by watching which values change the result set.
   */
  it("F9: rejects an unsearchable source, a publication state and a scope", async () => {
    const { searchCurriculum } = await import("./curriculum-search");

    for (const rejected of [
      "module",
      "learning_module",
      "lab",
      "lab_definition",
      "note",
      "draft",
      "review",
      "retired",
      "published",
      "private",
      "shared",
      "11111111-1111-4111-8111-111111111111"
    ]) {
      await expect(
        searchCurriculum(ACCESS_TOKEN, {
          query: "vlan",
          contentTypes: [rejected]
        })
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });

  it("F10: rejects one bad value inside an otherwise valid selection", async () => {
    const { searchCurriculum } = await import("./curriculum-search");

    await expect(
      searchCurriculum(ACCESS_TOKEN, {
        query: "vlan",
        contentTypes: ["course", "lab"]
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  /**
   * The filter is not an authorization step. Every source is read exactly as an
   * unfiltered search reads it, so no filter value can change which rows the
   * caller's row level security was asked to authorize.
   */
  it("F11: filtering does not change which sources are read", async () => {
    const filtered = await search(everyType, { contentTypes: ["course"] });
    const unfiltered = await search(everyType);

    expect(filtered.harness.tables).toEqual(unfiltered.harness.tables);
    expect(filtered.harness.recordCalls).toEqual(unfiltered.harness.recordCalls);
    expect(filtered.harness.limits).toEqual(unfiltered.harness.limits);
    expect(filtered.harness.matches).toEqual(unfiltered.harness.matches);
  });

  it("F12: filtering never reorders the surviving results", async () => {
    const unfiltered = await search(everyType);
    const filtered = await search(everyType, {
      contentTypes: ["learning_path", "competency"]
    });

    const expected = unfiltered.results.results
      .filter((entry) =>
        ["learning_path", "competency"].includes(entry.contentType)
      )
      .map((entry) => entry.documentId);

    expect(filtered.results.results.map((entry) => entry.documentId)).toEqual(
      expected
    );
  });

  it("F13: filtering can only ever remove results", async () => {
    const unfiltered = await search(everyType);
    const filtered = await search(everyType, { contentTypes: ["mission"] });

    expect(filtered.results.count).toBeLessThanOrEqual(
      unfiltered.results.count
    );
    const visible = new Set(
      unfiltered.results.results.map((entry) => entry.documentId)
    );
    for (const entry of filtered.results.results) {
      expect(visible.has(entry.documentId)).toBe(true);
    }
  });
});

describe("G: SEARCH-004 facet counts describe the returned results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  const everyType = {
    learning_paths: [row({ stable_id: "path.a" })],
    courses: [row({ stable_id: "course.a" }), row({ stable_id: "course.b" })],
    missions: [row({ stable_id: "mission.a" })],
    competencies: [row({ stable_id: "competency.a" })]
  };

  it("G1: counts each returned content type", async () => {
    const { results } = await search(everyType);

    expect(results.facets?.contentTypes).toEqual([
      { value: "learning_path", label: "Learning path", count: 1 },
      { value: "course", label: "Course", count: 2 },
      { value: "mission", label: "Mission", count: 1 },
      { value: "competency", label: "Competency", count: 1 }
    ]);
  });

  it("G2: facet counts sum exactly to the response count", async () => {
    for (const contentTypes of [
      undefined,
      ["course"],
      ["course", "mission"],
      ["learning_path", "course", "mission", "competency"]
    ]) {
      const { results } = await search(
        everyType,
        contentTypes ? { contentTypes } : {}
      );

      const total = (results.facets?.contentTypes ?? []).reduce(
        (sum, facet) => sum + facet.count,
        0
      );

      expect(total).toBe(results.count);
      expect(results.count).toBe(results.results.length);
    }
  });

  it("G3: facets describe the filtered results, not the wider set", async () => {
    const { results } = await search(everyType, { contentTypes: ["course"] });

    expect(results.facets?.contentTypes).toEqual([
      { value: "course", label: "Course", count: 2 }
    ]);
  });

  /**
   * The hidden-record test. The bounded over-fetch reads up to `limit * 4` rows
   * per type; only `limit` are returned. If a facet count ever exceeded the
   * returned results it would be describing the candidate window — records the
   * learner did not receive.
   */
  it("G4: the bounded over-fetch window never reaches a facet count", async () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      row({ stable_id: `course.${index}` })
    );

    const { results, harness } = await search({ courses: rows }, { limit: 5 });

    expect(harness.limits).toEqual([20, 20, 20, 20]);
    expect(results.count).toBe(5);
    expect(results.facets?.contentTypes).toEqual([
      { value: "course", label: "Course", count: 5 }
    ]);
  });

  /**
   * An older published version is dropped by read resolution before faceting,
   * so it contributes to no count — the facet sees one document, not two rows.
   */
  it("G5: a collapsed older version does not raise a count", async () => {
    const { results } = await search({
      courses: [
        row({ stable_id: "course.example", version: 1 }),
        row({ stable_id: "course.example", version: 2 })
      ]
    });

    expect(results.count).toBe(1);
    expect(results.facets?.contentTypes).toEqual([
      { value: "course", label: "Course", count: 1 }
    ]);
  });

  it("G6: an empty result set produces empty facets, not a zero for each type", async () => {
    const { results } = await search({});

    expect(results.count).toBe(0);
    expect(results.facets).toEqual({ contentTypes: [] });
  });

  it("G7: omits a type with no returned result rather than reporting zero", async () => {
    const { results } = await search({ courses: [row()] });

    expect(results.facets?.contentTypes.map((facet) => facet.value)).toEqual([
      "course"
    ]);
  });

  it("G8: a facet value is always an approved content type", async () => {
    const { results } = await search(everyType);

    for (const facet of results.facets?.contentTypes ?? []) {
      expect(["learning_path", "course", "mission", "competency"]).toContain(
        facet.value
      );
      expect(Object.keys(facet).sort()).toEqual(["count", "label", "value"]);
    }
  });

  it("G9: exposes no hidden, global or candidate total", async () => {
    const { results } = await search(everyType, { limit: 2 });
    const serialized = JSON.stringify(results);

    for (const forbidden of [
      "candidateCount",
      "totalCount",
      "globalTotal",
      "hiddenCount",
      "unauthorizedCount",
      "withheldCount",
      "overFetchCount",
      "corpusTotal",
      "matchedTotal"
    ]) {
      expect(results).not.toHaveProperty(forbidden);
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("G10: no facet count exceeds the requested limit", async () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      row({ stable_id: `course.${index}` })
    );

    const { results } = await search({ courses: rows }, { limit: 3 });

    for (const facet of results.facets?.contentTypes ?? []) {
      expect(facet.count).toBeLessThanOrEqual(3);
    }
  });

  it("G11: facets carry no internal identifier", async () => {
    const { results } = await search({
      courses: [row({ id: "11111111-1111-4111-8111-111111111111" })]
    });

    expect(JSON.stringify(results.facets)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
  });

  it("G12: the route reads repeated contentType values", () => {
    expect(searchRoute).toContain('url.searchParams.getAll("contentType")');
  });

  it("G13: the route accepts no other filter input", () => {
    for (const forbidden of [
      '"filters"',
      '"filter"',
      '"facet"',
      '"publicationState"',
      '"accessScope"',
      '"tag"',
      '"learningPath"'
    ]) {
      expect(searchRoute).not.toContain(forbidden);
    }
    expect(searchRoute).not.toContain("JSON.parse");
  });
});

/**
 * SEARCH-005A — technical query normalization and curated aliases.
 *
 * The security claims under test: expansion changes which authorized rows match
 * but never which rows are authorized, every variant is escaped, retrieval stays
 * at one read per source, and classification runs only on already-authorized
 * text.
 */
describe("H: SEARCH-005A query normalization and aliases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  const adRows = {
    courses: [
      row({
        stable_id: "course.zz",
        title: "AD Basics",
        description: "Learn the fundamentals."
      }),
      row({
        stable_id: "course.aa",
        title: "Active Directory Deep Dive",
        description: "Domain services."
      })
    ]
  };

  /**
   * WP-005: `vlan` became an approved acronym and is no longer a query with no
   * adjustment, so the plain-term case uses a word from the same row.
   */
  it("H1: a query with no adjustment behaves exactly as SEARCH-002 did", async () => {
    const { results, harness } = await search(
      { courses: [row()] },
      { query: "inspect" }
    );

    expect(harness.matches[0]).toEqual({ p_phrases: ["inspect"], p_acronyms: [] });
    expect(results).not.toHaveProperty("queryAdjustment");
  });

  /**
   * NARROWED FOR WP-005, not weakened. The acronym is now matched as a WHOLE
   * WORD (`\y` boundaries, optional plural) instead of as the substring `%AD%`,
   * which also matched "address" and "advanced". The canonical term is still
   * added to the same single read. G-005: both reach the database function as
   * arguments, the acronym as a whole word and never as a phrase.
   */
  it("H2: an approved acronym adds its canonical term to the same read", async () => {
    const { harness } = await search({}, { query: "AD" });

    expect(harness.matches[0]).toEqual({
      p_phrases: ["Active Directory"],
      p_acronyms: ["AD"]
    });
    expect(recordSearchMigration).toContain(
      "select '\\y' || acronym.value || 's?\\y' as pattern"
    );
  });

  /**
   * Broadening must not multiply source queries. One read per searchable type,
   * with the bounded over-fetch unchanged.
   */
  it("H3: expansion never adds a source query or changes the over-fetch", async () => {
    const plain = await search({}, { query: "vlan", limit: 5 });
    const expanded = await search({}, { query: "AD", limit: 5 });

    expect(expanded.harness.tables).toEqual(plain.harness.tables);
    expect(expanded.harness.tables).toHaveLength(4);
    expect(expanded.harness.limits).toEqual([20, 20, 20, 20]);
    expect(expanded.harness.recordCalls).toHaveLength(plain.harness.recordCalls.length);
  });

  /** MOVED FOR G-005: see E6. Every variant reaches `strpos` literally. */
  it("H4: every variant is escaped before matching", async () => {
    const { results, harness } = await search(
      {
        courses: [
          row({ stable_id: "course.literal", title: "Scoring 100% _x" }),
          row({ stable_id: "course.wild", title: "Scoring 1000 xx" })
        ]
      },
      { query: "100% _x" }
    );

    for (const match of harness.matches) {
      expect(match.p_phrases).toEqual(["100% _x"]);
    }
    expect(results.results.map((entry) => entry.sourceRecordStableId)).toEqual([
      "course.literal"
    ]);
  });

  it("H5: a trailing question mark adds a normalized variant", async () => {
    const { harness, results } = await search({}, { query: "kubectl?" });

    expect(harness.matches[0]).toEqual({
      p_phrases: ["kubectl?", "kubectl"],
      p_acronyms: []
    });
    expect(results.queryAdjustment).toMatchObject({
      adjustmentKind: "normalized"
    });
  });

  /**
   * The substring pathology this rule exists to prevent. A two-character alias
   * would match "administration", "advanced", "upload", "read" and "broadcast".
   */
  /**
   * NARROWED FOR WP-005, not weakened. WP-005 requires `AD` and `Active
   * Directory` to return the same results, so the canonical term now DOES
   * reach the short alias — but only through the approved whole-word pattern.
   * The substring pathology this test exists to prevent is still forbidden.
   */
  it("H6: the canonical term never emits the short alias as a substring pattern", async () => {
    const { harness } = await search({}, { query: "Active Directory" });

    expect(harness.matches[0]).toEqual({
      p_phrases: ["Active Directory"],
      p_acronyms: ["AD"]
    });
    expect(harness.matches[0]?.p_phrases).not.toContain("AD");
  });

  it("H7: a protected technical token never triggers the acronym", async () => {
    for (const query of ["Get-ADUser", "ADD", "upload"]) {
      const { harness } = await search({}, { query });

      expect(harness.matches[0]?.p_phrases).not.toContain("Active Directory");
      expect(harness.matches[0]?.p_acronyms).toEqual([]);
    }
  });

  it("H8: protected technical tokens reach the source unchanged", async () => {
    for (const query of [
      "Get-ADUser",
      "index=botsv3",
      "terraform plan",
      "show vlan brief"
    ]) {
      const { harness } = await search({}, { query });

      expect(harness.matches[0]?.p_phrases[0]).toBe(query);
    }
  });

  /**
   * Founder direction G-006 supersedes "exact matches are tiered above alias
   * matches" for an approved alias group: AD and Active Directory are one
   * concept, so neither form's title match outranks the other's, the neutral
   * order decides, and both queries return the identical order.
   */
  it("H9: AD and Active Directory title matches rank in the neutral order, identically for both forms", async () => {
    for (const query of ["AD", "Active Directory"]) {
      const { results } = await search(adRows, { query });

      expect(
        results.results.map((entry) => entry.sourceRecordStableId),
        query
      ).toEqual(["course.aa", "course.zz"]);
    }
  });

  it("H10: ranking runs before the bound, so a title match is not truncated for a description match", async () => {
    // course.a0 matches only in its description and sorts FIRST neutrally; a
    // bound applied before ranking would return it.
    const withDescription = {
      courses: [
        ...adRows.courses,
        row({
          stable_id: "course.a0",
          title: "Domain services",
          description: "Runs on Active Directory."
        })
      ]
    };
    for (const query of ["AD", "Active Directory"]) {
      const { results } = await search(withDescription, { query, limit: 1 });

      expect(
        results.results.map((entry) => entry.sourceRecordStableId),
        query
      ).toEqual(["course.aa"]);
    }
  });

  it("H11: reports the adjustment without exposing internals", async () => {
    const { results } = await search(adRows, { query: "AD" });

    expect(results.queryAdjustment).toEqual({
      originalQuery: "AD",
      effectiveQuery: "Active Directory",
      adjustmentKind: "alias"
    });

    const serialized = JSON.stringify(results.queryAdjustment);
    for (const forbidden of [
      "ilike",
      "pattern",
      "variant",
      "editDistance",
      "candidateCount",
      "matchKind",
      "%"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("H12: no result carries a match kind", async () => {
    const { results } = await search(adRows, { query: "AD" });

    expect(JSON.stringify(results.results)).not.toContain("matchKind");
    for (const entry of results.results) {
      expect(entry).not.toHaveProperty("matchKind");
    }
  });

  it("H13: the response carries results, count, facets and the adjustment", async () => {
    const { results } = await search(adRows, { query: "AD" });

    // WP-005 adds `matchLocations`, beside the results and outside them.
    expect(Object.keys(results).sort()).toEqual([
      "count",
      "facets",
      "matchLocations",
      "queryAdjustment",
      "results"
    ]);
  });

  it("H14: facet counts still sum to the response count after tiering", async () => {
    const { results } = await search(adRows, { query: "AD" });

    const total = (results.facets?.contentTypes ?? []).reduce(
      (sum, facet) => sum + facet.count,
      0
    );

    expect(total).toBe(results.count);
    expect(results.count).toBe(results.results.length);
  });

  it("H15: exposes no hidden or candidate total", async () => {
    const { results } = await search(adRows, { query: "AD", limit: 1 });
    const serialized = JSON.stringify(results);

    for (const forbidden of [
      "candidateCount",
      "totalCount",
      "hiddenCount",
      "withheldCount",
      "overFetchCount"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("H16: expansion does not change which sources are authorized", async () => {
    const plain = await search(adRows, { query: "vlan" });
    const expanded = await search(adRows, { query: "AD" });

    expect(expanded.harness.tables).toEqual(plain.harness.tables);
    for (const call of [...plain.harness.recordCalls, ...expanded.harness.recordCalls]) {
      expect(Object.keys(call).sort()).toEqual([
        "p_acronyms",
        "p_after",
        "p_page_size",
        "p_phrases",
        "p_source"
      ]);
    }
  });

  it("H17: no SEARCH-005B typo behaviour reaches the source", async () => {
    const { harness } = await search({}, { query: "kubctl" });

    expect(harness.matches[0]).toEqual({ p_phrases: ["kubctl"], p_acronyms: [] });
  });
});

/**
 * SEARCH-005B — bounded typo recovery.
 *
 * The security claims: recovery runs ONLY on zero authorized results, uses the
 * same RLS-scoped client and the same authorization boundaries, and can happen
 * at most once.
 */
describe("I: SEARCH-005B bounded typo recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  const kubectlRow = row({
    stable_id: "course.k8s",
    title: "kubectl Fundamentals",
    description: "Operate clusters."
  });

  it("I1: does not run when the original query already has results", async () => {
    // WP-005: `vlan` now carries an alias adjustment, so a plain word from the
    // same row proves the absence of any adjustment.
    const { results, harness } = await search(
      { courses: [row()] },
      { query: "inspect" }
    );

    // Exactly one pass: four source reads, not eight.
    expect(harness.tables).toHaveLength(4);
    expect(results.count).toBe(1);
    expect(results).not.toHaveProperty("queryAdjustment");
  });

  /**
   * Even a typo-SHAPED query must not trigger recovery if it already matched
   * something the learner is authorized to see. Recovery is for empty results,
   * not for queries that merely look misspelled.
   */
  it("I2: does not run when a typo-shaped query already has results", async () => {
    const { harness, results } = await search(
      {
        courses: [
          row({ stable_id: "course.typo", title: "kubctl troubleshooting" })
        ]
      },
      { query: "kubctl" }
    );

    expect(results.count).toBe(1);
    expect(harness.tables).toHaveLength(4);
    expect(harness.matches).toHaveLength(4);
    expect(results).not.toHaveProperty("queryAdjustment");
  });

  it("I3: recovers only after zero authorized results", async () => {
    const { results, harness } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl" }
    );

    // Two passes: the original found nothing, recovery found the row.
    expect(harness.tables).toHaveLength(8);
    expect(results.count).toBe(1);
    expect(results.results[0]?.title).toBe("kubectl Fundamentals");
  });

  it("I4: the original query is always attempted first", async () => {
    const { harness } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl" }
    );

    expect(harness.matches[0]).toEqual({ p_phrases: ["kubctl"], p_acronyms: [] });
    expect(harness.matches[4]).toEqual({ p_phrases: ["kubectl"], p_acronyms: [] });
  });

  it("I5: at most one recovery pass occurs", async () => {
    const { harness } = await search({}, { query: "kubctl" });

    // Original pass plus at most one recovery pass — never a third.
    expect(harness.tables).toHaveLength(8);
  });

  it("I6: reports the recovery without exposing internals", async () => {
    const { results } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl" }
    );

    expect(results.queryAdjustment).toEqual({
      originalQuery: "kubctl",
      effectiveQuery: "kubectl",
      adjustmentKind: "typo"
    });

    const serialized = JSON.stringify(results.queryAdjustment);
    for (const forbidden of [
      "editDistance",
      "distance",
      "candidate",
      "confidence",
      "similarity",
      "matchKind",
      "ilike",
      "%"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("I7: says nothing when recovery also finds nothing", async () => {
    const { results } = await search({}, { query: "kubctl" });

    expect(results.count).toBe(0);
    expect(results).not.toHaveProperty("queryAdjustment");
  });

  it("I8: never recovers a protected technical term", async () => {
    for (const query of [
      "Get-ADUser",
      "kubectl",
      "index=botsv3",
      "terraform plan",
      "show vlan brief"
    ]) {
      const { harness } = await search({}, { query });

      // Four reads only: the original pass, with no recovery attempted.
      expect(harness.tables).toHaveLength(4);
    }
  });

  it("I9: never recovers technical syntax", async () => {
    for (const query of [
      "index=botsv",
      "10.0.0.1",
      "10.0.0.0/24",
      "443",
      "v1.29",
      "--namespace",
      "resource_group",
      "AD",
      "RTO",
      "IAM"
    ]) {
      const { harness } = await search({}, { query });

      expect(harness.tables).toHaveLength(4);
    }
  });

  it("I10: recovery reads through the caller's own token", async () => {
    const { harness } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl" }
    );

    expect(harness.token()).toBe(ACCESS_TOKEN);
  });

  it("I11: the recovery pass keeps every authorization constraint", async () => {
    const { harness } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl" }
    );

    // Published-only enforced on all eight reads, not just the first four: every
    // read goes through the same record-search function (whose SQL states the
    // publication requirement, E4) with the same arguments and nothing else.
    expect(harness.tables).toHaveLength(8);
    expect(harness.tables.slice(4)).toEqual(harness.tables.slice(0, 4));
    for (const call of harness.recordCalls) {
      expect(Object.keys(call).sort()).toEqual([
        "p_acronyms",
        "p_after",
        "p_page_size",
        "p_phrases",
        "p_source"
      ]);
    }
  });

  it("I11b: the recovery pass still drops a non-published row", async () => {
    const { results } = await search(
      {
        courses: [
          row({
            stable_id: "course.k8s-draft",
            title: "kubectl drafts",
            publication_state: "draft"
          })
        ]
      },
      { query: "kubctl" }
    );

    expect(results.count).toBe(0);
    expect(JSON.stringify(results)).not.toContain("course.k8s-draft");
  });

  it("I12: the recovery pass keeps the bounded over-fetch", async () => {
    const { harness } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl", limit: 5 }
    );

    expect(harness.limits).toEqual([20, 20, 20, 20, 20, 20, 20, 20]);
  });

  it("I13: SEARCH-004 filtering still applies to recovered results", async () => {
    const { results } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl", contentTypes: ["mission"] }
    );

    expect(results.count).toBe(0);
    expect(results).not.toHaveProperty("queryAdjustment");
  });

  it("I14: facets describe only the recovered surfaced results", async () => {
    const { results } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl" }
    );

    expect(results.facets?.contentTypes).toEqual([
      { value: "course", label: "Course", count: 1 }
    ]);
    const total = (results.facets?.contentTypes ?? []).reduce(
      (sum, facet) => sum + facet.count,
      0
    );
    expect(total).toBe(results.count);
  });

  it("I15: the failed original pass leaks no count", async () => {
    const { results } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl" }
    );
    const serialized = JSON.stringify(results);

    for (const forbidden of [
      "candidateCount",
      "totalCount",
      "hiddenCount",
      "withheldCount",
      "overFetchCount",
      "alternativeCount",
      "recoveryCount"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("I16: no result carries a match kind", async () => {
    const { results } = await search(
      { courses: [kubectlRow] },
      { query: "kubctl" }
    );

    expect(JSON.stringify(results.results)).not.toContain("matchKind");
  });

  it("I17: a two-token typo is not recovered", async () => {
    const { harness } = await search({}, { query: "kubctl terrafom" });

    expect(harness.tables).toHaveLength(4);
  });

  it("I18: an ambiguous candidate is not recovered", async () => {
    const { harness } = await search({}, { query: "blan" });

    expect(harness.tables).toHaveLength(4);
  });

  it("I19: a distance-two typo is not recovered", async () => {
    const { harness } = await search({}, { query: "kbctl" });

    expect(harness.tables).toHaveLength(4);
  });

  it("I20: recovery is deterministic", async () => {
    const first = await search({ courses: [kubectlRow] }, { query: "kubctl" });
    const second = await search({ courses: [kubectlRow] }, { query: "kubctl" });

    expect(first.results.queryAdjustment).toEqual(
      second.results.queryAdjustment
    );
    expect(first.harness.matches).toEqual(second.harness.matches);
  });
});

/**
 * SEARCH-008 — Search Result Ranking and Fallback, in the service.
 *
 * The shared comparator is unit tested in `packages/shared-types`. What can only
 * be proven here is WHERE it runs: downstream of the caller's RLS-scoped read,
 * the SEARCH-003 decision, version resolution and SEARCH-004 filtering, and
 * upstream of the requested limit and the facet computation.
 */
describe("J: SEARCH-008 ranking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  /** A description-only match that sorts FIRST under the neutral order. */
  const descriptionMatch = row({
    stable_id: "course.aaa",
    title: "Networking Basics",
    description: "Run show vlan brief to inspect VLANs."
  });

  /** A whole-title match that sorts LAST under the neutral order. */
  const titleMatch = row({
    stable_id: "course.zzz",
    title: "vlan",
    description: "Segmentation."
  });

  it("J1: a whole-title match outranks a description-only match", async () => {
    const { results } = await search(
      { courses: [descriptionMatch, titleMatch] },
      { query: "vlan" }
    );

    expect(results.results.map((result) => result.title)).toEqual([
      "vlan",
      "Networking Basics"
    ]);
  });

  it("J2: the neutral order still decides when the title precision ties", async () => {
    const { results } = await search(
      {
        courses: [
          row({ stable_id: "course.zulu", title: "vlan" }),
          row({ stable_id: "course.alpha", title: "vlan" })
        ]
      },
      { query: "vlan" }
    );

    expect(
      results.results.map((result) => result.sourceRecordStableId)
    ).toEqual(["course.alpha", "course.zulu"]);
  });

  /**
   * The reason ranking cannot be a post-limit step. Under the neutral order the
   * description match arrives first, so bounding before ranking would return it
   * and silently discard the exact title match.
   */
  it("J3: ranking runs BEFORE the requested limit", async () => {
    const { results } = await search(
      { courses: [descriptionMatch, titleMatch] },
      { query: "vlan", limit: 1 }
    );

    expect(results.count).toBe(1);
    expect(results.results[0]?.title).toBe("vlan");
  });

  it("J4: the approved ranking builder bounds the returned results", () => {
    expect(serviceCode).toContain(
      "buildRankedCurriculumSearchResults(classified, effectiveVariants, limit)"
    );
    expect(serviceCode).not.toContain("buildTieredCurriculumSearchResults");
  });

  /** Ruling 8: ranking may only ever see what SEARCH-003 already surfaced. */
  it("J5: ranking is composed after authorization in the service", () => {
    const authorized = serviceCode.lastIndexOf("surfaceAuthorized(permissioned)");
    const filtered = serviceCode.lastIndexOf("applyCurriculumSearchFilter(");
    const ranked = serviceCode.indexOf("buildRankedCurriculumSearchResults(");

    expect(authorized).toBeGreaterThan(-1);
    expect(ranked).toBeGreaterThan(filtered);
    expect(filtered).toBeGreaterThan(authorized);
  });

  it("J6: ranking receives no identity, token or client", () => {
    const call = serviceCode.slice(
      serviceCode.indexOf("buildRankedCurriculumSearchResults("),
      serviceCode.indexOf("buildRankedCurriculumSearchResults(") + 200
    );

    for (const forbidden of [
      "accessToken",
      "supabase",
      "userId",
      "ownerId",
      "studentId",
      "learnerId"
    ]) {
      expect(call).not.toContain(forbidden);
    }
  });

  it("J7: a filtered-out type cannot be resurrected by ranking", async () => {
    const { results } = await search(
      {
        courses: [titleMatch],
        competencies: [row({ stable_id: "comp.vlan", title: "vlan" })]
      },
      { query: "vlan", contentTypes: ["competency"] }
    );

    expect(results.results.map((result) => result.contentType)).toEqual([
      "competency"
    ]);
  });

  it("J8: facets still count exactly the ranked, bounded result set", async () => {
    const { results } = await search(
      { courses: [descriptionMatch, titleMatch] },
      { query: "vlan", limit: 1 }
    );

    const total = (results.facets?.contentTypes ?? []).reduce(
      (sum, facet) => sum + facet.count,
      0
    );

    expect(total).toBe(results.count);
    expect(total).toBe(1);
  });

  it("J9: the response shape is unchanged", async () => {
    const { results } = await search(
      { courses: [titleMatch] },
      { query: "vlan" }
    );

    // WP-005: `vlan` is an approved acronym (alias adjustment) and results now
    // carry their match locations. Neither key carries a ranking internal,
    // which the loop below still proves over the whole serialized response.
    expect(Object.keys(results).sort()).toEqual([
      "count",
      "facets",
      "matchLocations",
      "queryAdjustment",
      "results"
    ]);
    for (const forbidden of [
      "ranking",
      "rankedBy",
      "titlePrecision",
      "matchKind",
      "score",
      "relevance",
      "candidateCount",
      "hiddenCount"
    ]) {
      expect(JSON.stringify(results)).not.toContain(forbidden);
    }
  });

  /**
   * A recovered result is ranked against the query that actually FOUND it, not
   * against the learner's misspelling — otherwise every recovered result would
   * collapse into the weakest precision class.
   */
  it("J10: a recovery pass ranks against the recovered variants", async () => {
    const { results } = await search(
      {
        courses: [
          row({
            stable_id: "course.aaa",
            title: "Container operations",
            description: "Covers kubectl in depth."
          }),
          row({
            stable_id: "course.zzz",
            title: "kubectl",
            description: "Reference."
          })
        ]
      },
      { query: "kubctl" }
    );

    expect(results.queryAdjustment?.adjustmentKind).toBe("typo");
    expect(results.results.map((result) => result.title)).toEqual([
      "kubectl",
      "Container operations"
    ]);
  });

  it("J11: ranking introduces no service-role path and no note source", () => {
    expect(serviceCode).not.toContain("createServerSupabaseClient");
    for (const forbidden of [
      "student_notes",
      "searchStudentNotes",
      "noteId",
      "note_body"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("J12: ranking introduces no numeric relevance and no behavioural signal", () => {
    for (const forbidden of [
      "relevance",
      "boost",
      "popularity",
      "engagement",
      "clickHistory",
      "scoreResult",
      "weighting",
      "embedding",
      "semantic"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("J13: ranking does not change how many source reads occur", async () => {
    const { harness } = await search(
      { courses: [descriptionMatch, titleMatch] },
      { query: "vlan" }
    );

    expect(harness.tables).toHaveLength(4);
    expect(harness.limits.every((value) => value === 100)).toBe(true);
  });
});
