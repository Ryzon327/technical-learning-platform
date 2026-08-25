import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTE_SEARCH_FORBIDDEN_REQUEST_FIELDS } from "@tlp/shared-types";

/**
 * SEARCH-006 — the browser's private note search contract.
 *
 * SCOPE, stated honestly: this proves the wire contract — which route is
 * called, what is and is not sent, and how the response is interpreted. It does
 * NOT render markup: `apps/web` has no DOM harness, and
 * `scripts/verify-wave7.sh` fails the build if one is added. Result-group
 * structure is asserted in the Wave 9 verifier as source assertions, and every
 * learner-facing string is unit tested in shared-types.
 *
 * It also does not prove row level security. Ownership is enforced by the
 * database; the browser never sees an unauthorized note to filter.
 */
import { searchMyNotes } from "./note-search-service";

const BASE_URL = "https://api.example.test";
const ACCESS_TOKEN = "test-access-token";

let requests: Array<{ url: string; init: RequestInit | undefined }>;

function respondWith(body: unknown, status = 200) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body)
    } as unknown as Response;
  });
}

const NOTE = {
  noteId: "11111111-1111-4111-8111-111111111111",
  title: "My VLAN revision",
  excerpt: "Remember to run show vlan brief.",
  matchedIn: ["body"],
  pinned: false,
  updatedAt: "2026-08-01T10:00:00.000Z"
};

beforeEach(() => {
  requests = [];
  vi.stubEnv("VITE_API_BASE_URL", BASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the service calls only the existing authenticated notes route", () => {
  it("uses GET /notes/search", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    await searchMyNotes(ACCESS_TOKEN, { query: "vlan" });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.startsWith(`${BASE_URL}/notes/search?`)).toBe(true);
    expect(requests[0]?.init?.method ?? "GET").toBe("GET");
  });

  /** Ruling 2: no second private-note search API. */
  it("never calls a second notes-search route", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    await searchMyNotes(ACCESS_TOKEN, { query: "vlan" });

    for (const forbidden of [
      "/search/notes",
      "/admin/notes",
      "/public/notes",
      "/notes/all"
    ]) {
      expect(requests[0]?.url).not.toContain(forbidden);
    }
  });

  it("attaches the caller's session", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    await searchMyNotes(ACCESS_TOKEN, { query: "vlan" });

    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it("refuses to send a request without a session", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    await expect(searchMyNotes("", { query: "vlan" })).rejects.toBeTruthy();
    expect(requests).toHaveLength(0);
  });
});

describe("no identity parameter is ever sent", () => {
  /**
   * The core privacy contract. A request naming an owner would be a second
   * ownership mechanism beside row level security.
   */
  it("sends no owner or learner identity", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    await searchMyNotes(ACCESS_TOKEN, { query: "vlan" });

    const url = requests[0]?.url ?? "";
    for (const forbidden of NOTE_SEARCH_FORBIDDEN_REQUEST_FIELDS) {
      expect(url).not.toContain(forbidden);
    }
    for (const forbidden of ["user_id", "owner", "student", "learner", "uid"]) {
      expect(url).not.toContain(forbidden);
    }
  });

  it("sends only the query and an optional limit", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    await searchMyNotes(ACCESS_TOKEN, { query: "vlan", limit: 5 });

    const params = [...new URL(requests[0]!.url).searchParams.keys()].sort();
    expect(params).toEqual(["limit", "q"]);
  });

  it("omits the limit when the caller supplies none", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    await searchMyNotes(ACCESS_TOKEN, { query: "vlan" });

    expect([...new URL(requests[0]!.url).searchParams.keys()]).toEqual(["q"]);
  });
});

describe("query encoding preserves technical strings", () => {
  it("sends the query unchanged", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    for (const token of ["Get-ADUser", "index=botsv3", "show vlan brief", "AD"]) {
      requests = [];
      await searchMyNotes(ACCESS_TOKEN, { query: token });

      expect(new URL(requests[0]!.url).searchParams.get("q")).toBe(token);
    }
  });

  it("adjusts nothing in the browser", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    await searchMyNotes(ACCESS_TOKEN, { query: "kubctl" });

    expect(new URL(requests[0]!.url).searchParams.get("q")).toBe("kubctl");
    expect(requests[0]?.url).not.toContain("kubectl");
  });
});

describe("response interpretation", () => {
  it("reads the learner's own note results", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [NOTE] }));

    const results = await searchMyNotes(ACCESS_TOKEN, { query: "vlan" });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("My VLAN revision");
    expect(results[0]?.noteId).toBe(NOTE.noteId);
  });

  it("treats an empty result as a result, not a failure", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    await expect(
      searchMyNotes(ACCESS_TOKEN, { query: "nothing" })
    ).resolves.toEqual([]);
  });

  it("tolerates a response with no results array", async () => {
    vi.stubGlobal("fetch", respondWith({}));

    await expect(searchMyNotes(ACCESS_TOKEN, { query: "x" })).resolves.toEqual(
      []
    );
  });

  /**
   * SEARCH-006 section 12: a failure must be distinguishable from an honest
   * empty result, so the caller can show an unavailable state rather than
   * claiming the learner has no notes.
   */
  it("surfaces a failure as an error, never as empty results", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith(
        { error: { code: "DEPENDENCY_UNAVAILABLE", message: "unavailable" } },
        503
      )
    );

    await expect(searchMyNotes(ACCESS_TOKEN, { query: "vlan" })).rejects.toBeTruthy();
  });

  it("invents no note the server did not send", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [] }));

    const results = await searchMyNotes(ACCESS_TOKEN, { query: "vlan" });

    expect(results).toEqual([]);
    expect(JSON.stringify(results)).not.toContain("noteId");
  });
});
