import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEARCH-001 structural boundaries plus executable source-resolution coverage.
 *
 * The client factory is mocked using the precedent established in CERT-005:
 * whether resolution reads through the caller's own RLS-scoped client, and how
 * it behaves for a missing, unpublished or stale source, cannot be proven by
 * reading source alone.
 *
 * NOT proven here: real RLS isolation and live query behaviour. Those need a
 * live PostgreSQL harness, which this repository does not have. Every
 * permission claim below is a query-level claim, not a live-RLS claim.
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

const service = read("./search-document.ts");
const serviceCode = stripTsComments(service);
const server = read("./server.ts");
const sharedModel = read("../../../packages/shared-types/src/search-document.ts");

const ACCESS_TOKEN = "test-access-token";
const INDEXED_AT = "2026-08-20T09:00:00.000Z";

const pathRow = {
  stable_id: "path.network-foundations",
  version: 3,
  title: "Network Foundations",
  description: "Design and defend a segmented network.",
  publication_state: "published",
  updated_at: "2026-08-01T10:00:00.000Z"
};

const competencyRow = {
  stable_id: "competency.subnetting",
  version: 2,
  title: "Subnetting",
  description: "Divide a network into subnets.",
  publication_state: "published",
  updated_at: "2026-08-01T10:00:00.000Z"
};

function clientReturning(result: { data?: unknown; error?: unknown }) {
  const tables: string[] = [];
  const eqCalls: Array<[string, unknown]> = [];
  let tokenSeen = "";

  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return builder;
  };
  builder.maybeSingle = async () => result;

  const client = {
    from: (name: string) => {
      tables.push(name);
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
    token: () => tokenSeen
  };
}

async function resolveWith(
  result: { data?: unknown; error?: unknown },
  documentOverrides: Record<string, unknown> = {}
) {
  const { createUserScopedSupabaseClient } = await import("./supabase");
  const harness = clientReturning(result);
  vi.mocked(createUserScopedSupabaseClient).mockImplementation(
    harness.factory as never
  );

  const { projectLearningPathDocument, resolveSearchDocument } = await import(
    "./search-document"
  );

  const document = {
    ...projectLearningPathDocument(pathRow, INDEXED_AT)!,
    ...documentOverrides
  };

  const resolution = await resolveSearchDocument(ACCESS_TOKEN, document as never);

  return { resolution, harness, document };
}

describe("A: SEARCH-001 owns no source truth", () => {
  it("A: writes nothing at all", () => {
    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      expect(serviceCode).not.toContain(write);
    }
  });

  it("A2: creates no index table or materialized store", () => {
    for (const forbidden of ["search_documents", "create table", "materialized"]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("A3: introduces no full-text search infrastructure", () => {
    for (const forbidden of ["tsvector", "to_tsquery", "pg_trgm", "textSearch"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("A4: adds no AI dependency", () => {
    expect(serviceCode).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway|embedding/i);
    expect(stripTsComments(sharedModel)).not.toMatch(/openai|anthropic|ollama|embedding\(/i);
  });
});

describe("B: SEARCH-002 was not implemented early", () => {
  it("B: exposes no search route", () => {
    expect(server).not.toContain('pathname === "/search"');
    expect(server).not.toContain('pathname === "/search/curriculum"');
    expect(server).not.toContain("/curriculum/search");
  });

  it("B2: the service is not imported by the router", () => {
    expect(server).not.toContain('from "./search-document"');
  });

  it("B3: performs no query, ranking, filtering or faceting", () => {
    for (const forbidden of [
      "ilike",
      "textSearch",
      "rank",
      "score",
      "facet",
      "orderBy",
      ".order(",
      ".limit("
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("B4: never enumerates curriculum", () => {
    // Every read is pinned to one stable id and one version.
    expect(serviceCode).toContain('.eq("stable_id", document.sourceRecordStableId)');
    expect(serviceCode).toContain('.eq("version", document.sourceVersion)');
    expect(serviceCode).not.toContain(".in(");
  });

  it("B5: exposes no typo tolerance or synonym expansion", () => {
    for (const forbidden of ["synonym", "typo", "fuzzy", "levenshtein", "soundex"]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("B6: builds no indexing worker, queue or schedule", () => {
    for (const forbidden of ["setInterval", "setTimeout", "cron", "queue", "worker"]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("C: authorization is source-derived", () => {
  it("C: reads through the caller's own RLS-scoped client", () => {
    expect(serviceCode).toContain("createUserScopedSupabaseClient(accessToken)");
    expect(serviceCode).not.toContain("createServerSupabaseClient");
  });

  it("C2: accepts no caller-supplied user identifier", () => {
    for (const forbidden of ["userId", "user_id", "studentId", "actorId"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("C3: never decides from the document's own access metadata", () => {
    expect(serviceCode).not.toContain("document.accessScope");
    expect(serviceCode).not.toContain("document.publicationState");
  });

  it("C4: refuses to resolve without an access token", async () => {
    const { resolveSearchDocuments } = await import("./search-document");

    await expect(resolveSearchDocuments("   ", [])).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });

  it("C5: the shared model cannot authorize from a document", () => {
    // canServeSearchDocument must take a resolution, never a document.
    expect(sharedModel).toContain(
      "export function canServeSearchDocument(resolution: SearchSourceResolution): boolean"
    );
    expect(sharedModel).not.toContain("canServeSearchDocument(document");
  });
});

describe("D: private notes never enter the shared foundation", () => {
  it("D: the indexed engine set is curriculum only", () => {
    expect(sharedModel).toContain('export const SEARCH_INDEXED_SOURCE_ENGINES = ["curriculum"] as const;');
  });

  it("D2: no note source is read anywhere", () => {
    for (const forbidden of ["student_notes", "note_id", "noteId", "searchStudentNotes"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("D3: only curriculum tables are resolvable", () => {
    expect(serviceCode).toContain('learning_path: "learning_paths"');
    expect(serviceCode).toContain('competency: "competencies"');
    expect(serviceCode).not.toContain('"student_notes"');
  });
});

describe("E: executable projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("E: projects a learning path into the contract", async () => {
    const { projectLearningPathDocument } = await import("./search-document");
    const document = projectLearningPathDocument(pathRow, INDEXED_AT)!;

    expect(document.contentType).toBe("learning_path");
    expect(document.sourceRecordStableId).toBe("path.network-foundations");
    expect(document.sourceVersion).toBe(3);
    expect(document.documentId).toBe(
      "curriculum:learning_path:path.network-foundations@3"
    );
    expect(document.sourceReference).toBe("/learning-paths/path.network-foundations");
  });

  it("E2: projects a second, differently shaped source type", async () => {
    const { projectCompetencyDocument } = await import("./search-document");
    const document = projectCompetencyDocument(competencyRow, INDEXED_AT)!;

    expect(document.contentType).toBe("competency");
    expect(document.documentId).toBe("curriculum:competency:competency.subnetting@2");
  });

  it("E3: carries no internal identifier from the source row", async () => {
    const { projectLearningPathDocument } = await import("./search-document");
    const document = projectLearningPathDocument(
      { ...pathRow, id: "11111111-1111-4111-8111-111111111111" } as never,
      INDEXED_AT
    ) as unknown as Record<string, unknown>;

    expect(document).not.toHaveProperty("id");
    expect(JSON.stringify(document)).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("E4: refuses to project a malformed source row", async () => {
    const { projectLearningPathDocument } = await import("./search-document");

    expect(projectLearningPathDocument({ ...pathRow, title: "" }, INDEXED_AT)).toBeNull();
    expect(projectLearningPathDocument({ ...pathRow, version: 0 }, INDEXED_AT)).toBeNull();
  });
});

describe("F: executable source resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("F: resolves a published, current source", async () => {
    const { resolution } = await resolveWith({
      data: { stable_id: pathRow.stable_id, version: 3, publication_state: "published" },
      error: null
    });

    expect(resolution.outcome).toBe("resolved");
  });

  it("F2: reads the source through the caller's token", async () => {
    const { harness } = await resolveWith({
      data: { stable_id: pathRow.stable_id, version: 3, publication_state: "published" },
      error: null
    });

    expect(harness.token()).toBe(ACCESS_TOKEN);
    expect(harness.tables).toEqual(["learning_paths"]);
  });

  it("F3: pins the read to one stable id and one version", async () => {
    const { harness } = await resolveWith({
      data: { stable_id: pathRow.stable_id, version: 3, publication_state: "published" },
      error: null
    });

    expect(harness.eqCalls).toEqual([
      ["stable_id", "path.network-foundations"],
      ["version", 3]
    ]);
  });

  it("F4: a row the caller cannot see is missing, never revealed", async () => {
    const { resolution } = await resolveWith({ data: null, error: null });

    expect(resolution.outcome).toBe("missing");
  });

  it("F5: an unpublished source is never servable", async () => {
    const { resolution } = await resolveWith({
      data: { stable_id: pathRow.stable_id, version: 3, publication_state: "draft" },
      error: null
    });

    expect(resolution.outcome).toBe("unpublished");
  });

  it("F6: a source that moved on is stale", async () => {
    const { resolution } = await resolveWith({
      data: { stable_id: pathRow.stable_id, version: 4, publication_state: "published" },
      error: null
    });

    expect(resolution.outcome).toBe("stale");
  });

  it("F7: a dependency failure is unavailable, never missing", async () => {
    const { resolution } = await resolveWith({
      data: null,
      error: { message: "connection terminated" }
    });

    expect(resolution.outcome).toBe("unavailable");
  });

  it("F8: a content type with no resolver is never served", async () => {
    const { resolution } = await resolveWith(
      { data: null, error: null },
      { contentType: "lab_definition" }
    );

    expect(resolution.outcome).toBe("unavailable");
  });

  it("F9: none of the unresolved outcomes may be served", async () => {
    const { canServeSearchDocument } = await import("@tlp/shared-types");

    for (const outcome of ["missing", "stale", "unpublished", "unavailable"] as const) {
      expect(canServeSearchDocument({ documentId: "d", outcome })).toBe(false);
    }
  });

  it("F10: resolves each document independently", async () => {
    const { createUserScopedSupabaseClient } = await import("./supabase");
    const harness = clientReturning({
      data: { stable_id: pathRow.stable_id, version: 3, publication_state: "published" },
      error: null
    });
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(harness.factory as never);

    const { projectLearningPathDocument, resolveSearchDocuments, summarizeResolutions } =
      await import("./search-document");

    const document = projectLearningPathDocument(pathRow, INDEXED_AT)!;
    const resolutions = await resolveSearchDocuments(ACCESS_TOKEN, [document, document]);

    expect(resolutions).toHaveLength(2);
    expect(summarizeResolutions(resolutions).resolved).toBe(2);
  });

  it("F11: summarizes outcomes so failed indexing is identifiable later", async () => {
    const { summarizeResolutions } = await import("./search-document");

    expect(
      summarizeResolutions([
        { documentId: "a", outcome: "resolved" },
        { documentId: "b", outcome: "stale" },
        { documentId: "c", outcome: "stale" }
      ])
    ).toMatchObject({ resolved: 1, stale: 2, missing: 0 });
  });
});
