import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRICULUM_NAVIGATION_MAX_ENTRIES } from "@tlp/shared-types";

/**
 * SEARCH-008 — the browser's structured-navigation contract.
 *
 * SCOPE, stated honestly: this proves the wire contract — which route is called,
 * what is and is not sent, and how the response is interpreted. It does NOT
 * render markup: `apps/web` has no DOM harness, and `scripts/verify-wave7.sh`
 * fails the build if one is added. The rendered fallback structure is asserted
 * in the Wave 9 verifier as source assertions, and every learner-facing string
 * is unit tested in shared-types.
 *
 * It also does not prove row level security. Publication and visibility are
 * enforced by the database and by the Curriculum Engine's existing read; the
 * browser never sees an unpublished path to filter.
 */
import { listCurriculumNavigation } from "./curriculum-navigation-service";

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

const PATH = {
  id: "11111111-1111-4111-8111-111111111111",
  stableId: "networking-fundamentals",
  version: 3,
  title: "Networking fundamentals",
  description: "Switching, routing and VLANs.",
  publicationState: "published",
  estimatedMinutes: 240
};

beforeEach(() => {
  requests = [];
  vi.stubEnv("VITE_API_BASE_URL", BASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the service calls only the existing authenticated curriculum route", () => {
  it("uses GET /curriculum/paths", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    await listCurriculumNavigation(ACCESS_TOKEN);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(`${BASE_URL}/curriculum/paths`);
    expect(requests[0]?.init?.method ?? "GET").toBe("GET");
  });

  /** Ruling 5: no second curriculum-navigation mechanism. */
  it("never calls a second or privileged navigation route", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    await listCurriculumNavigation(ACCESS_TOKEN);

    for (const forbidden of [
      "/search/curriculum",
      "/admin/curriculum",
      "/public/curriculum",
      "/curriculum/all",
      "/curriculum/paths/"
    ]) {
      expect(requests[0]?.url).not.toContain(forbidden);
    }
  });

  it("attaches the caller's own session", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    await listCurriculumNavigation(ACCESS_TOKEN);

    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it("refuses to send a request without a session", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    await expect(listCurriculumNavigation("")).rejects.toBeTruthy();
    expect(requests).toHaveLength(0);
  });

  it("sends no request body and performs no mutation", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    await listCurriculumNavigation(ACCESS_TOKEN);

    expect(requests[0]?.init?.body).toBeUndefined();
  });
});

describe("no identity or selector is ever sent", () => {
  /**
   * A request naming a learner would be a second ownership mechanism beside the
   * database policy that already decides what this caller may read.
   */
  it("sends no owner, student or learner identity", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    await listCurriculumNavigation(ACCESS_TOKEN);

    const url = requests[0]?.url ?? "";
    for (const forbidden of [
      "userId",
      "user_id",
      "ownerId",
      "owner_id",
      "studentId",
      "learnerId",
      "uid",
      "role"
    ]) {
      expect(url).not.toContain(forbidden);
    }
  });

  it("sends no query parameter at all", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    await listCurriculumNavigation(ACCESS_TOKEN);

    expect(requests[0]?.url).not.toContain("?");
  });

  it("sends no publication-state selector", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    await listCurriculumNavigation(ACCESS_TOKEN);

    const url = requests[0]?.url ?? "";
    for (const forbidden of ["publication", "draft", "retired", "state="]) {
      expect(url).not.toContain(forbidden);
    }
  });
});

describe("response interpretation", () => {
  it("projects a path into a navigation entry", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [PATH] }));

    const entries = await listCurriculumNavigation(ACCESS_TOKEN);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.stableId).toBe("networking-fundamentals");
    expect(entries[0]?.title).toBe("Networking fundamentals");
    expect(entries[0]?.reference).toBe(
      "/learning-paths/networking-fundamentals"
    );
  });

  /** The internal database identifier must not reach the Search surface. */
  it("drops the internal identifier and every unapproved field", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [PATH] }));

    const entries = await listCurriculumNavigation(ACCESS_TOKEN);

    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(PATH.id);
    expect(serialized).not.toContain("estimatedMinutes");
    expect(serialized).not.toContain("publicationState");
    expect(serialized).not.toContain("version");
  });

  it("bounds what it returns", async () => {
    const many = Array.from({ length: 80 }, (_, index) => ({
      stableId: `path-${index}`,
      title: `Path ${index}`
    }));
    vi.stubGlobal("fetch", respondWith({ learningPaths: many }));

    const entries = await listCurriculumNavigation(ACCESS_TOKEN);

    expect(entries).toHaveLength(CURRICULUM_NAVIGATION_MAX_ENTRIES);
  });

  it("treats an empty curriculum as a result, not a failure", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    await expect(listCurriculumNavigation(ACCESS_TOKEN)).resolves.toEqual([]);
  });

  it("tolerates a response with no learningPaths array", async () => {
    vi.stubGlobal("fetch", respondWith({}));

    await expect(listCurriculumNavigation(ACCESS_TOKEN)).resolves.toEqual([]);
  });

  /**
   * Ruling 7 at the transport layer: a failed read must stay a failure so the
   * caller can say "could not be loaded" rather than "there is no curriculum".
   */
  it("surfaces a failure as an error, never as an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith(
        { error: { code: "DEPENDENCY_UNAVAILABLE", message: "unavailable" } },
        503
      )
    );

    await expect(listCurriculumNavigation(ACCESS_TOKEN)).rejects.toBeTruthy();
  });

  it("surfaces an authorization failure as an error", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith({ error: { code: "UNAUTHORIZED", message: "denied" } }, 401)
    );

    await expect(listCurriculumNavigation(ACCESS_TOKEN)).rejects.toBeTruthy();
  });

  it("invents no path the server did not send", async () => {
    vi.stubGlobal("fetch", respondWith({ learningPaths: [] }));

    const entries = await listCurriculumNavigation(ACCESS_TOKEN);

    expect(entries).toEqual([]);
    expect(JSON.stringify(entries)).not.toContain("stableId");
  });
});
