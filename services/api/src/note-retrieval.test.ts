import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTE_SEARCH_FORBIDDEN_FIELDS,
  NOTE_SEARCH_FORBIDDEN_REQUEST_FIELDS,
  describeCurriculumResultGroup,
  describeNoteResultGroup,
  describeNoteSearchCount,
  describeNoteSearchUnavailable,
  normalizeNoteSearchQuery,
  normalizeSearchLimit
} from "@tlp/shared-types";

/**
 * SEARCH-006 — Personal Notes Search Integration.
 *
 * The client factory is mocked using the CERT-005 precedent, and the mock
 * models WHAT ROW LEVEL SECURITY RETURNS TO EACH CALLER: a caller's access
 * token selects which note rows the source exposes, exactly as
 * `auth.uid() = user_id` does in PostgreSQL.
 *
 * SCOPE OF THIS EVIDENCE, stated honestly:
 *
 *   Layer 1 — caller-scoped/mock proof. Student A cannot reach Student B's note
 *   through this service, because the caller-scoped source never yields it.
 *   Layer 2 — structural proof. No service-role client, no caller-supplied
 *   identity, no owner predicate, no shared index or cache.
 *
 * **NOT proven here: live PostgreSQL RLS.** The repository has no live database
 * harness. That the policy itself is correctly enforced by PostgreSQL remains a
 * real-environment/integration requirement under the pre-MVP and DEC-047
 * governance. Nothing below should be read as a live-RLS claim.
 *
 * The mock deliberately does NOT hand an unauthorized row to downstream code
 * and expect it to be filtered: the design has exactly one ownership mechanism,
 * and inventing a second one in a test would misrepresent the architecture.
 */
vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

const service = readFileSync(
  new URL("./note-retrieval.ts", import.meta.url),
  "utf8"
);
const serviceCode = service
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !/^\s*\/\//.test(line))
  .join("\n");

const server = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

// The slice must start BEFORE the pathname so the method guard is included:
// the source reads `if (request.method === "GET" && pathname === ...)`.
const notesRoute = server.slice(
  server.indexOf('pathname === "/notes/search"') - 40,
  server.indexOf('pathname === "/notes/search"') + 900
);

/** Only the notes-search function, so bookmark writers are not misread. */
const noteSearchCode = serviceCode.slice(
  serviceCode.indexOf("export async function searchStudentNotes"),
  serviceCode.indexOf("function bookmarkFrom")
);

const STUDENT_A = "student-a-access-token";
const STUDENT_B = "student-b-access-token";

const NOTE_A = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "My VLAN revision",
  body: "Remember to run show vlan brief before the exam.",
  pinned: false,
  updated_at: "2026-08-01T10:00:00.000Z"
};

/** Student B's note carries a phrase that exists nowhere else. */
const NOTE_B = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Zarquon migration plan",
  body: "The zarquonimplosion checklist for my own migration.",
  pinned: false,
  updated_at: "2026-08-02T10:00:00.000Z"
};

/**
 * A caller-scoped source stand-in.
 *
 * `visibleTo` models the row level security outcome: the rows PostgreSQL would
 * return to THIS caller and no others. A note absent from a caller's set is not
 * filtered downstream — it is never returned at all.
 */
function callerScopedClient(visibleTo: Record<string, unknown[]>) {
  const tokens: string[] = [];
  const tables: string[] = [];
  const orPatterns: string[] = [];

  const factory = (token: string) => {
    tokens.push(token);
    const rows = visibleTo[token] ?? [];

    const literalTerms = (pattern: string): string[] =>
      [...pattern.matchAll(/ilike\.%(.*?)%(?:,|$)/g)]
        .map((match) => (match[1] ?? "").replace(/\\([\\%_])/g, "$1"))
        .filter((term) => term !== "");

    const build = (name: string) => {
      tables.push(name);
      let pattern = "";
      const builder: Record<string, unknown> = {};
      const resolve = () => {
        if (name !== "student_notes") {
          return Promise.resolve({ data: [], error: null });
        }
        const terms = literalTerms(pattern);
        const matched = terms.length
          ? rows.filter((row) => {
              const record = row as { title?: string; body?: string };
              const hay =
                `${record.title ?? ""} ${record.body ?? ""}`.toLowerCase();
              return terms.some((term) => hay.includes(term.toLowerCase()));
            })
          : rows;
        return Promise.resolve({ data: matched, error: null });
      };

      builder.select = () => builder;
      builder.order = () => builder;
      builder.eq = () => builder;
      builder.in = () => builder;
      builder.or = (value: string) => {
        pattern = value;
        orPatterns.push(value);
        return builder;
      };
      // The real service chains `.or(...)` AFTER `.limit(...)`, so limit must
      // return the builder. The query resolves only when awaited.
      builder.limit = () => builder;
      builder.then = (onFulfilled: (value: unknown) => unknown) =>
        resolve().then(onFulfilled);
      return builder;
    };

    return { from: build };
  };

  return { factory, tokens, tables, orPatterns };
}

async function searchAs(
  token: string,
  visibleTo: Record<string, unknown[]>,
  input: Record<string, unknown> = {}
) {
  const { createUserScopedSupabaseClient } = await import("./supabase");
  const harness = callerScopedClient(visibleTo);
  vi.mocked(createUserScopedSupabaseClient).mockImplementation(
    harness.factory as never
  );

  const { searchStudentNotes } = await import("./note-retrieval");
  const results = await searchStudentNotes(token, {
    query: "",
    ...input
  } as never);

  return { results, harness };
}

const BOTH = { [STUDENT_A]: [NOTE_A], [STUDENT_B]: [NOTE_B] };

describe("private note retrieval API contracts", () => {
  it("keeps search bounded", () => {
    expect(normalizeSearchLimit(1000)).toBe(100);
  });

  it("normalizes technical search queries", () => {
    expect(normalizeNoteSearchQuery("  show   interfaces ")).toBe(
      "show interfaces"
    );
  });
});

describe("N: Student A cannot reach Student B's notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("N1: a learner finds their own note", async () => {
    const { results } = await searchAs(STUDENT_A, BOTH, { query: "vlan" });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("My VLAN revision");
  });

  /**
   * The SEARCH-003 deferred criterion, closed at the caller-scoped layer.
   * `zarquonimplosion` exists only inside Student B's note.
   */
  it("N2: another learner's unique phrase returns nothing", async () => {
    const { results } = await searchAs(STUDENT_A, BOTH, {
      query: "zarquonimplosion"
    });

    expect(results).toEqual([]);
  });

  it("N3: the same phrase is available to its own owner", async () => {
    const { results } = await searchAs(STUDENT_B, BOTH, {
      query: "zarquonimplosion"
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Zarquon migration plan");
  });

  it("N4: another learner's note contributes nothing to the count", async () => {
    const { results } = await searchAs(STUDENT_A, BOTH, {
      query: "zarquonimplosion"
    });

    expect(results.length).toBe(0);
  });

  it("N5: no marker, placeholder or withheld indicator appears", async () => {
    const { results } = await searchAs(STUDENT_A, BOTH, {
      query: "zarquonimplosion"
    });
    const serialized = JSON.stringify(results);

    for (const marker of [
      "hidden",
      "withheld",
      "unauthorized",
      "otherUser",
      "denied",
      "restricted"
    ]) {
      expect(serialized.toLowerCase()).not.toContain(marker.toLowerCase());
    }
  });

  it("N6: no snippet or metadata from the other learner's note appears", async () => {
    const { results } = await searchAs(STUDENT_A, BOTH, { query: "migration" });
    const serialized = JSON.stringify(results);

    expect(serialized).not.toContain("Zarquon");
    expect(serialized).not.toContain("zarquonimplosion");
    expect(serialized).not.toContain(NOTE_B.id);
  });

  it("N7: the caller's own token selects the source scope", async () => {
    const { harness } = await searchAs(STUDENT_A, BOTH, { query: "vlan" });

    expect(harness.tokens).toContain(STUDENT_A);
    expect(harness.tokens).not.toContain(STUDENT_B);
  });

  it("N8: no owner identity reaches the learner", async () => {
    const { results } = await searchAs(STUDENT_A, BOTH, { query: "vlan" });
    const serialized = JSON.stringify(results);

    for (const forbidden of NOTE_SEARCH_FORBIDDEN_FIELDS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("N9: a note result carries only approved fields", async () => {
    const { results } = await searchAs(STUDENT_A, BOTH, { query: "vlan" });

    expect(Object.keys(results[0] ?? {}).sort()).toEqual([
      "excerpt",
      "matchedIn",
      "noteId",
      "pinned",
      "title",
      "updatedAt"
    ]);
  });

  it("N10: an honest empty result is returned when nothing matches", async () => {
    const { results } = await searchAs(STUDENT_A, BOTH, {
      query: "nothingmatchesthis"
    });

    expect(results).toEqual([]);
  });
});

describe("O: SEARCH-005 composition is static and safe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("O1: an approved static alias reaches the note query", async () => {
    const { harness } = await searchAs(STUDENT_A, BOTH, { query: "AD" });

    expect(harness.orPatterns[0]).toContain("title.ilike.%AD%");
    expect(harness.orPatterns[0]).toContain("title.ilike.%Active Directory%");
  });

  it("O2: normalization reaches the note query", async () => {
    const { harness } = await searchAs(STUDENT_A, BOTH, { query: "kubectl?" });

    expect(harness.orPatterns[0]).toContain("title.ilike.%kubectl?%");
    expect(harness.orPatterns[0]).toContain("title.ilike.%kubectl%");
  });

  /** Ruling 8: typo recovery is deliberately not composed into Notes. */
  it("O3: no typo recovery is applied to notes", async () => {
    const { harness } = await searchAs(STUDENT_A, BOTH, { query: "kubctl" });

    expect(harness.orPatterns[0]).toBe(
      "title.ilike.%kubctl%,body.ilike.%kubctl%"
    );
    expect(harness.orPatterns[0]).not.toContain("kubectl");
  });

  it("O4: the service runs no typo recovery path at all", () => {
    expect(serviceCode).not.toContain("buildCurriculumTypoRecovery");
    expect(serviceCode).toContain('variant.matchKind !== "typo"');
  });

  /**
   * The privacy invariant that matters most here: vocabulary is static, so no
   * note is read to build it and no learner's note can shape another's query.
   */
  it("O5: variants are built without reading any note", async () => {
    const { harness } = await searchAs(
      STUDENT_A,
      { [STUDENT_A]: [], [STUDENT_B]: [NOTE_B] },
      { query: "AD" }
    );

    expect(harness.orPatterns[0]).toContain("Active Directory");
    expect(harness.orPatterns[0]).not.toContain("Zarquon");
    expect(harness.orPatterns[0]).not.toContain("zarquonimplosion");
  });

  it("O6: technical strings survive into the note query", async () => {
    for (const query of ["Get-ADUser", "index=botsv3", "show vlan brief"]) {
      const { harness } = await searchAs(STUDENT_A, BOTH, { query });

      expect(harness.orPatterns[0]).toContain(`title.ilike.%${query}%`);
    }
  });

  it("O7: LIKE wildcards are escaped in every variant", async () => {
    const { harness } = await searchAs(STUDENT_A, BOTH, { query: "100% _x" });

    expect(harness.orPatterns[0]).toContain("100\\%");
    expect(harness.orPatterns[0]).toContain("\\_x");
  });
});

describe("P: structural ownership boundary", () => {
  it("P1: reads only through the caller-scoped client", () => {
    expect(serviceCode).toContain("createUserScopedSupabaseClient(accessToken)");
    expect(serviceCode).not.toContain("createServerSupabaseClient");
  });

  it("P2: builds no owner predicate of its own", () => {
    for (const forbidden of ["user_id", "userId", "ownerId", "studentId", "learnerId"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("P3: the route requires trusted authentication", () => {
    expect(notesRoute).toContain("resolveTrustedRequestIdentity(request)");
    expect(notesRoute).toContain("trusted.accessToken");
  });

  it("P4: the route accepts no identity parameter", () => {
    for (const forbidden of NOTE_SEARCH_FORBIDDEN_REQUEST_FIELDS) {
      expect(notesRoute).not.toContain(forbidden);
    }
  });

  it("P5: the route is a GET read only", () => {
    expect(notesRoute).toContain('request.method === "GET"');
  });

  it("P6: no public or admin notes-search route exists", () => {
    for (const forbidden of [
      '"/search/notes"',
      '"/admin/notes/search"',
      '"/public/notes"'
    ]) {
      expect(server).not.toContain(forbidden);
    }
  });

  it("P7: notes are never written by search", () => {
    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      expect(noteSearchCode).not.toContain(write);
    }
  });

  it("P8: no index, cache, queue or worker exists", () => {
    for (const forbidden of [
      "materialized",
      "cache",
      "tsvector",
      "pg_trgm",
      "setinterval",
      "cron",
      "queue",
      "worker"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("Q: learner-facing wording", () => {
  it("Q1: names the two result groups plainly", () => {
    expect(describeCurriculumResultGroup()).toBe("Curriculum");
    expect(describeNoteResultGroup()).toBe("My notes");
  });

  it("Q2: exposes no internal engine name", () => {
    const wording = [
      describeCurriculumResultGroup(),
      describeNoteResultGroup(),
      describeNoteSearchCount(2),
      describeNoteSearchUnavailable()
    ]
      .join(" ")
      .toLowerCase();

    for (const internal of [
      "knowledge engine",
      "notes engine",
      "sourceengine",
      "student_notes",
      "rls",
      "supabase"
    ]) {
      expect(wording).not.toContain(internal);
    }
  });

  it("Q3: counts only the learner's own returned notes", () => {
    expect(describeNoteSearchCount(0)).toBe("No matching notes.");
    expect(describeNoteSearchCount(1)).toBe("1 note.");
    expect(describeNoteSearchCount(3)).toBe("3 notes.");
  });

  /** A failure must never be reported as "you have no notes". */
  it("Q4: an unavailable notes search is not reported as empty", () => {
    const message = describeNoteSearchUnavailable().toLowerCase();

    expect(message).toContain("could not be searched");
    expect(message).not.toContain("no matching notes");
    expect(message).not.toContain("no notes");
  });

  it("Q5: the unavailable message leaks no diagnostics", () => {
    const message = describeNoteSearchUnavailable().toLowerCase();

    for (const leak of ["permission", "denied", "unauthorized", "error", "policy"]) {
      expect(message).not.toContain(leak);
    }
  });
});
