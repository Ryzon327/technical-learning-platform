import { describe, expect, it } from "vitest";
import {
  ApiRequestError,
  buildApiUrl,
  normalizeApiError,
  resolveApiBaseUrl
} from "./api-client";

describe("base url resolution", () => {
  it("uses the VITE environment convention", () => {
    expect(
      resolveApiBaseUrl({ VITE_API_BASE_URL: "https://api.example.test" })
    ).toBe("https://api.example.test");
  });

  it("trims trailing slashes so paths join predictably", () => {
    expect(
      resolveApiBaseUrl({ VITE_API_BASE_URL: "https://api.example.test///" })
    ).toBe("https://api.example.test");
  });

  it("fails with a clear configuration error when unset", () => {
    let thrown: unknown;
    try {
      resolveApiBaseUrl({});
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown instanceof ApiRequestError).toBe(true);
    expect((thrown as ApiRequestError).code).toBe("CONFIGURATION_MISSING");
  });
});

describe("url building", () => {
  it("joins base and path without duplicating slashes", () => {
    expect(buildApiUrl("https://api.example.test/", "/evidence/portfolio")).toBe(
      "https://api.example.test/evidence/portfolio"
    );
    expect(buildApiUrl("https://api.example.test", "evidence/portfolio")).toBe(
      "https://api.example.test/evidence/portfolio"
    );
  });

  it("omits undefined and blank query values", () => {
    expect(
      buildApiUrl("https://api.example.test", "/evidence/portfolio", {
        sourceType: "lab_validation",
        competencyStableId: undefined,
        courseStableId: "   "
      })
    ).toBe("https://api.example.test/evidence/portfolio?sourceType=lab_validation");
  });

  it("encodes query values", () => {
    expect(
      buildApiUrl("https://api.example.test", "/evidence/portfolio", {
        competencyStableId: "competency.a b"
      })
    ).toContain("competency.a+b");
  });

  it("produces no query string when nothing is supplied", () => {
    expect(buildApiUrl("https://api.example.test", "/evidence/portfolio")).toBe(
      "https://api.example.test/evidence/portfolio"
    );
  });

  /**
   * Multi-select parameters are sent as a repeated key, matching what the API
   * reads with `URLSearchParams.getAll`. Joining them into one comma-separated
   * value would be ambiguous for any value containing a comma.
   */
  it("repeats an array value rather than joining it", () => {
    const url = buildApiUrl("https://api.example.test", "/search/curriculum", {
      q: "vlan",
      contentType: ["course", "mission"]
    });

    expect(new URL(url).searchParams.getAll("contentType")).toEqual([
      "course",
      "mission"
    ]);
    expect(url).not.toContain("course%2Cmission");
    expect(url).not.toContain("course,mission");
  });

  it("omits an empty array entirely", () => {
    expect(
      buildApiUrl("https://api.example.test", "/search/curriculum", {
        q: "vlan",
        contentType: []
      })
    ).toBe("https://api.example.test/search/curriculum?q=vlan");
  });

  it("drops blank entries inside an array", () => {
    const url = buildApiUrl("https://api.example.test", "/search/curriculum", {
      contentType: ["course", "   ", ""]
    });

    expect(new URL(url).searchParams.getAll("contentType")).toEqual(["course"]);
  });

  it("still sends a scalar value exactly once", () => {
    const url = buildApiUrl("https://api.example.test", "/search/curriculum", {
      q: "vlan",
      limit: 5
    });

    expect(new URL(url).searchParams.getAll("q")).toEqual(["vlan"]);
    expect(new URL(url).searchParams.getAll("limit")).toEqual(["5"]);
  });
});

describe("error normalization", () => {
  it("preserves a platform error code and message", () => {
    const error = normalizeApiError(409, {
      error: { code: "CONFLICT", message: "Already recorded", retryable: false }
    });
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("Already recorded");
    expect(error.retryable).toBe(false);
  });

  it("maps auth failures without leaking internals", () => {
    const error = normalizeApiError(401, undefined);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.status).toBe(401);
    expect(error.message).not.toContain("undefined");
  });

  it("maps not-found and server failures", () => {
    expect(normalizeApiError(404, {}).code).toBe("NOT_FOUND");
    const serverError = normalizeApiError(500, {});
    expect(serverError.code).toBe("INTERNAL_ERROR");
    expect(serverError.retryable).toBe(true);
  });

  it("accepts a flat error payload as well as a wrapped one", () => {
    expect(normalizeApiError(403, { code: "FORBIDDEN", message: "No" }).code).toBe(
      "FORBIDDEN"
    );
  });
});
