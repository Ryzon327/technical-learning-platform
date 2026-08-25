import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_FRESHNESS_FORBIDDEN_FIELDS } from "@tlp/shared-types";

/**
 * SEARCH-007 — bounded reconciliation and Founder-facing freshness health.
 *
 * The client factory is mocked using the CERT-005 precedent, and the mock models
 * what row level security returns to the caller.
 *
 * SCOPE, stated honestly: this proves bounded reconciliation, bounded retry,
 * fail-closed serving, and that the report is aggregate-only. It does NOT prove
 * live PostgreSQL row level security — the repository has no live database
 * harness. Every authorization claim below is a query-level and structural
 * claim, not live-RLS proof.
 */
vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

const service = readFileSync(
  new URL("./search-freshness.ts", import.meta.url),
  "utf8"
);
const serviceCode = service
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*\/\//.test(line))
  .join("\n");

const server = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
const freshnessRoute = server.slice(
  server.indexOf('pathname === "/admin/search/freshness"') - 60,
  server.indexOf('pathname === "/admin/search/freshness"') + 900
);

const TOKEN = "founder-access-token";

function row(overrides: Record<string, unknown> = {}) {
  return {
    stable_id: "path.networking",
    version: 2,
    title: "Networking",
    description: "VLANs and routing.",
    publication_state: "published",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides
  };
}

/**
 * Models the source as row level security would present it to this caller.
 *
 * `projectRows` are what the projection read returns; `resolveRows` are what the
 * per-document resolution read returns, so a row can be made to change,
 * disappear or become unreadable between the two — the only drift window this
 * architecture has.
 */
function sourceClient(options: {
  projectRows?: Record<string, unknown[]>;
  resolveRow?: unknown | null;
  resolveError?: unknown;
  projectError?: unknown;
}) {
  const tables: string[] = [];
  const limits: number[] = [];
  const eqCalls: Array<[string, unknown]> = [];
  let resolveReads = 0;
  let tokenSeen = "";

  const factory = (token: string) => {
    tokenSeen = token;
    return {
      from: (name: string) => {
        tables.push(name);
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = (column: string, value: unknown) => {
          eqCalls.push([column, value]);
          return builder;
        };
        builder.limit = (value: number) => {
          limits.push(value);
          return Promise.resolve(
            options.projectError
              ? { data: null, error: options.projectError }
              : { data: options.projectRows?.[name] ?? [], error: null }
          );
        };
        builder.maybeSingle = () => {
          resolveReads += 1;
          return Promise.resolve(
            options.resolveError
              ? { data: null, error: options.resolveError }
              : { data: options.resolveRow ?? null, error: null }
          );
        };
        return builder;
      }
    };
  };

  return {
    factory,
    tables,
    limits,
    eqCalls,
    token: () => tokenSeen,
    resolveReads: () => resolveReads
  };
}

async function runWith(options: Parameters<typeof sourceClient>[0], limit?: unknown) {
  const { createUserScopedSupabaseClient } = await import("./supabase");
  const harness = sourceClient(options);
  vi.mocked(createUserScopedSupabaseClient).mockImplementation(
    harness.factory as never
  );

  const { projectCurriculumFreshnessDocuments, runSearchFreshnessReconciliation } =
    await import("./search-freshness");

  const documents = await projectCurriculumFreshnessDocuments(TOKEN, limit);
  const report = await runSearchFreshnessReconciliation(TOKEN, {
    documents,
    limit
  });

  return { documents, report, harness };
}

const ONE_PATH = { projectRows: { learning_paths: [row()] } };

describe("R: reconciliation classifies source state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("A: a current version resolves as current and is servable", async () => {
    const { report } = await runWith({
      ...ONE_PATH,
      resolveRow: { stable_id: "path.networking", version: 2, publication_state: "published" }
    });

    expect(report.outcomes.resolved).toBe(1);
    expect(report.servable).toBe(1);
    expect(report.healthy).toBe(true);
  });

  it("B: a version mismatch resolves stale and is not servable", async () => {
    const { report } = await runWith({
      ...ONE_PATH,
      resolveRow: { stable_id: "path.networking", version: 5, publication_state: "published" }
    });

    expect(report.outcomes.stale).toBe(1);
    expect(report.servable).toBe(0);
    expect(report.healthy).toBe(false);
  });

  it("C: a missing source cannot serve", async () => {
    const { report } = await runWith({ ...ONE_PATH, resolveRow: null });

    expect(report.outcomes.missing).toBe(1);
    expect(report.servable).toBe(0);
  });

  it("D/H: an unpublished source cannot serve", async () => {
    const { report } = await runWith({
      ...ONE_PATH,
      resolveRow: { stable_id: "path.networking", version: 2, publication_state: "retired" }
    });

    expect(report.outcomes.unpublished).toBe(1);
    expect(report.servable).toBe(0);
  });

  it("F: an unreachable source cannot serve", async () => {
    const { report } = await runWith({
      ...ONE_PATH,
      resolveError: { message: "connection terminated" }
    });

    expect(report.outcomes.unavailable).toBe(1);
    expect(report.servable).toBe(0);
    expect(report.healthy).toBe(false);
  });

  /** G: only published rows are ever projected, so publication gates entry. */
  /**
   * `eqCalls` records BOTH the projection filter and the resolver's own
   * stable_id/version lookup, so the property is that the publication filter is
   * present on every projected table — not that it is the only filter used.
   */
  it("G: projection reads published rows only", async () => {
    const { harness } = await runWith(ONE_PATH);

    const publicationFilters = harness.eqCalls.filter(
      ([column]) => column === "publication_state"
    );

    expect(publicationFilters).toHaveLength(2);
    for (const call of publicationFilters) {
      expect(call).toEqual(["publication_state", "published"]);
    }
    // No filter ever names an owner or caller identity.
    for (const [column] of harness.eqCalls) {
      expect(["publication_state", "stable_id", "version"]).toContain(column);
    }
  });

  it("E: an unreadable projection fails retryably rather than reporting healthy", async () => {
    const { createUserScopedSupabaseClient } = await import("./supabase");
    const harness = sourceClient({ projectError: { message: "denied" } });
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(
      harness.factory as never
    );

    const { projectCurriculumFreshnessDocuments } = await import(
      "./search-freshness"
    );

    await expect(
      projectCurriculumFreshnessDocuments(TOKEN)
    ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE", retryable: true });
  });
});

describe("S: bounds and retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("M: the projection read is bounded", async () => {
    const { harness } = await runWith(ONE_PATH, 10);

    expect(harness.limits).toEqual([10, 10]);
  });

  it("M: an oversized request is clamped to the maximum", async () => {
    const { harness } = await runWith(ONE_PATH, 100000);

    expect(harness.limits).toEqual([100, 100]);
  });

  it("M: the reconciled set never exceeds the bound", async () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      row({ stable_id: `path.${index}` })
    );
    const { report } = await runWith(
      { projectRows: { learning_paths: many }, resolveRow: null },
      5
    );

    expect(report.examined).toBeLessThanOrEqual(5);
  });

  /** N/O: one retry only, then the failure becomes observable. */
  it("N: an unreachable source is retried exactly once", async () => {
    const { harness, report } = await runWith({
      ...ONE_PATH,
      resolveError: { message: "timeout" }
    });

    expect(harness.resolveReads()).toBe(2);
    expect(report.exhaustedRetries).toBe(1);
  });

  it("O: an exhausted retry is reported, never hidden", async () => {
    const { report } = await runWith({
      ...ONE_PATH,
      resolveError: { message: "timeout" }
    });

    expect(report.healthy).toBe(false);
    expect(report.exhaustedRetries).toBe(1);
  });

  it("N: a definitive outcome is never retried", async () => {
    const { harness } = await runWith({
      ...ONE_PATH,
      resolveRow: { stable_id: "path.networking", version: 9, publication_state: "published" }
    });

    expect(harness.resolveReads()).toBe(1);
  });

  it("P: a retry reuses the caller's own token and never widens access", async () => {
    const { harness } = await runWith({
      ...ONE_PATH,
      resolveError: { message: "timeout" }
    });

    expect(harness.token()).toBe(TOKEN);
    expect(serviceCode).not.toContain("createServerSupabaseClient");
  });

  it("L: the run is idempotent for the same source state", async () => {
    const first = await runWith({
      ...ONE_PATH,
      resolveRow: { stable_id: "path.networking", version: 2, publication_state: "published" }
    });
    const second = await runWith({
      ...ONE_PATH,
      resolveRow: { stable_id: "path.networking", version: 2, publication_state: "published" }
    });

    expect(JSON.stringify(first.report)).toBe(JSON.stringify(second.report));
  });

  it("refuses to run without an authenticated session", async () => {
    const { runSearchFreshnessReconciliation } = await import("./search-freshness");

    await expect(
      runSearchFreshnessReconciliation("  ", { documents: [] })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("T: the report exposes aggregate state only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("V: no document body, title or identifier appears", async () => {
    const { report } = await runWith({
      ...ONE_PATH,
      resolveRow: { stable_id: "path.networking", version: 2, publication_state: "published" }
    });
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("path.networking");
    expect(serialized).not.toContain("Networking");
    expect(serialized).not.toContain("VLANs");
    expect(serialized).not.toContain("curriculum:learning_path");
  });

  it("W: no hidden, unauthorized or corpus total appears", async () => {
    const { report } = await runWith(ONE_PATH);
    const serialized = JSON.stringify(report);

    for (const forbidden of SEARCH_FRESHNESS_FORBIDDEN_FIELDS) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(report).not.toHaveProperty("total");
  });

  it("T: the route is Founder-guarded", () => {
    expect(freshnessRoute).toContain("await founder(request)");
    expect(freshnessRoute).toContain('request.method === "GET"');
  });

  it("U: the route accepts no identity parameter", () => {
    for (const forbidden of ["userId", "ownerId", "studentId", "accessToken="]) {
      expect(freshnessRoute).not.toContain(forbidden);
    }
  });

  /**
   * `documents:` appears as the run INPUT, which is correct. The property under
   * test is what the route SENDS, so the response payload is pinned exactly.
   */
  it("V: the route returns the report and status text only", () => {
    const flattened = freshnessRoute.replace(/\s+/g, "");

    expect(flattened).toContain(
      "sendJson(response,200,{report,status:describeSearchFreshnessStatus(report)});"
    );
    expect(flattened).not.toContain("sendJson(response,200,{documents");
  });
});

describe("U: architectural invariants", () => {
  it("X: no persisted index, cache, worker or schedule", () => {
    for (const forbidden of [
      "search_documents",
      "materialized",
      "tsvector",
      "to_tsquery",
      "pg_trgm",
      "setinterval",
      "settimeout",
      "cron",
      "queue",
      "worker",
      "cachestore"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("X: the run writes nothing", () => {
    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      expect(serviceCode).not.toContain(write);
    }
  });

  it("Q: no note or private source is reachable", () => {
    for (const forbidden of ["student_notes", "searchStudentNotes", "note_body", "noteId"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
    expect(serviceCode).toContain("isSharedIndexEligible(document)");
  });

  it("P: no caller-supplied identity is accepted", () => {
    for (const forbidden of ["userId", "user_id", "ownerId", "studentId"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("reconciliation composes the SEARCH-001 resolver rather than duplicating it", () => {
    expect(serviceCode).toContain("resolveSearchDocument(accessToken, document)");
  });

  it("Y: no ranking or scoring behaviour exists", () => {
    for (const forbidden of ["relevance", "score", "rank", "boost", "weight"]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });
});
