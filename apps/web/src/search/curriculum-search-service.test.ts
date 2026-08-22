import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEARCH-002 — learner-facing search service contract.
 *
 * Executable coverage of what the browser layer actually does: which route it
 * calls, how the query and limit are encoded, that the caller's session is
 * attached, and how the response is interpreted.
 *
 * SCOPE OF THIS FILE, stated honestly: the rendered view cannot be exercised
 * here. `apps/web` has no DOM harness, and `scripts/verify-wave7.sh` fails the
 * build if `jsdom`, `@testing-library/react` or `jest-axe` is added to this
 * workspace. Rendering assertions therefore live in the Wave 9 verifier as
 * source assertions, and every string and decision the view renders is unit
 * tested in `packages/shared-types/src/curriculum-search.test.ts`. Nothing here
 * pretends to prove markup.
 */
import { searchCurriculum } from "./curriculum-search-service";

const BASE_URL = "https://api.example.test";
const ACCESS_TOKEN = "test-access-token";

let requests: Array<{ url: string; init: RequestInit | undefined }>;

/**
 * Matches the real client contract: `apiRequest` reads `response.text()` and
 * parses it itself, so the stub must serialize rather than hand back an object.
 */
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

beforeEach(() => {
  requests = [];
  vi.stubEnv("VITE_API_BASE_URL", BASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the service calls only the approved curriculum search route", () => {
  it("uses GET /search/curriculum", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    await searchCurriculum(ACCESS_TOKEN, { query: "vlan" });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.startsWith(`${BASE_URL}/search/curriculum?`)).toBe(
      true
    );
    expect(requests[0]?.init?.method ?? "GET").toBe("GET");
  });

  it("never calls a public, admin or notes search route", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    await searchCurriculum(ACCESS_TOKEN, { query: "vlan" });

    for (const forbidden of [
      "/admin/search",
      "/search/public",
      "/search/notes",
      "/notes/search",
      "/curriculum/search"
    ]) {
      expect(requests[0]?.url).not.toContain(forbidden);
    }
  });

  it("attaches the caller's session and sends no identity of its own", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    await searchCurriculum(ACCESS_TOKEN, { query: "vlan" });

    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

    for (const forbidden of ["userId", "user_id", "studentId"]) {
      expect(requests[0]?.url).not.toContain(forbidden);
    }
  });
});

describe("query encoding", () => {
  it("encodes the query as q", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    await searchCurriculum(ACCESS_TOKEN, { query: "vlan" });

    expect(requests[0]?.url).toContain("q=vlan");
  });

  it("percent-encodes characters that would break the URL", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    await searchCurriculum(ACCESS_TOKEN, { query: "index=botsv3 & 100%" });

    const url = requests[0]?.url ?? "";
    // The raw characters must not appear unencoded in the query string.
    expect(url).toContain("q=index%3Dbotsv3");
    expect(url).toContain("%26");
    expect(url).toContain("%25");
  });

  it("preserves technical tokens through encoding and decoding", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    for (const token of [
      "Get-ADUser",
      "kubectl",
      "terraform plan",
      "show vlan brief"
    ]) {
      requests = [];
      await searchCurriculum(ACCESS_TOKEN, { query: token });

      const sent = new URL(requests[0]!.url).searchParams.get("q");
      expect(sent).toBe(token);
    }
  });
});

describe("limit handling", () => {
  it("omits the limit when the caller does not supply one", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    await searchCurriculum(ACCESS_TOKEN, { query: "vlan" });

    expect(requests[0]?.url).not.toContain("limit=");
  });

  it("sends a supplied limit", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    await searchCurriculum(ACCESS_TOKEN, { query: "vlan", limit: 5 });

    expect(new URL(requests[0]!.url).searchParams.get("limit")).toBe("5");
  });

  /**
   * The bound is server-authoritative. The browser may ask for more, and the
   * server clamps it — the contract is not enforced by trusting the client.
   */
  it("does not rely on the browser to enforce the maximum", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    await searchCurriculum(ACCESS_TOKEN, { query: "vlan", limit: 5000 });

    expect(new URL(requests[0]!.url).searchParams.get("limit")).toBe("5000");
  });
});

describe("response interpretation", () => {
  const document = {
    modelVersion: "search-document-v1",
    documentId: "curriculum:course:course.networking@2",
    sourceEngine: "curriculum",
    sourceRecordStableId: "course.networking",
    sourceVersion: 2,
    contentType: "course",
    title: "Networking Basics",
    searchableText: "Run show vlan brief to inspect VLANs.",
    keywords: [],
    sourceReference: "/courses/course.networking",
    publicationState: "published",
    accessScope: "shared",
    sourceUpdatedAt: "2026-08-01T10:00:00.000Z",
    indexedAt: "2026-08-21T09:00:00.000Z"
  };

  it("reads results and count from the response", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [document], count: 1 }));

    const outcome = await searchCurriculum(ACCESS_TOKEN, { query: "vlan" });

    expect(outcome.count).toBe(1);
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]?.title).toBe("Networking Basics");
  });

  it("carries the authoritative destination through unchanged", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [document], count: 1 }));

    const outcome = await searchCurriculum(ACCESS_TOKEN, { query: "vlan" });

    expect(outcome.results[0]?.sourceReference).toBe("/courses/course.networking");
  });

  it("preserves the source representation of the snippet", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith({
        results: [
          { ...document, searchableText: "Use Get-ADUser -Filter * to list." }
        ],
        count: 1
      })
    );

    const outcome = await searchCurriculum(ACCESS_TOKEN, { query: "get-aduser" });

    expect(outcome.results[0]?.searchableText).toContain("Get-ADUser");
  });

  it("treats an empty result set as a result, not a failure", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    const outcome = await searchCurriculum(ACCESS_TOKEN, { query: "nothing" });

    expect(outcome.results).toEqual([]);
    expect(outcome.count).toBe(0);
  });

  it("surfaces a server failure as an error rather than empty results", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith(
        { error: { code: "DEPENDENCY_UNAVAILABLE", message: "unavailable" } },
        503
      )
    );

    await expect(
      searchCurriculum(ACCESS_TOKEN, { query: "vlan" })
    ).rejects.toBeTruthy();
  });

  it("refuses to send a request without a session", async () => {
    vi.stubGlobal("fetch", respondWith({ results: [], count: 0 }));

    await expect(searchCurriculum("", { query: "vlan" })).rejects.toBeTruthy();
    expect(requests).toHaveLength(0);
  });
});
