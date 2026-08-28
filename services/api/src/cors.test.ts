import { describe, expect, it } from "vitest";
import {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  DEVELOPMENT_WEB_ORIGIN,
  resolveAllowedOrigins,
  resolveCors
} from "./cors";

/**
 * API-CORS-1 — the browser origin boundary.
 *
 * These assertions are deliberately adversarial. The failure modes that matter
 * are not "CORS did not work" — that is loud and obvious the moment a browser
 * touches it. They are the quiet ones: a wildcard that makes every origin
 * readable, a reflected `Origin` that makes the allowlist decorative, a
 * localhost default that follows the code into production, or a preflight that
 * demands the very token the browser will not send until the preflight
 * succeeds.
 */

const DEV_ALLOWLIST = [DEVELOPMENT_WEB_ORIGIN];
const HOSTILE = "https://attacker.example.com";

describe("API-CORS-1 allowlist resolution", () => {
  it("defaults development to the Vite dev origin", () => {
    expect(resolveAllowedOrigins(undefined, "development")).toEqual([
      DEVELOPMENT_WEB_ORIGIN
    ]);
  });

  it("defaults test to the same origin, so the suite matches development", () => {
    expect(resolveAllowedOrigins(undefined, "test")).toEqual([
      DEVELOPMENT_WEB_ORIGIN
    ]);
  });

  // J — the requirement that production must not silently inherit localhost.
  it("PRODUCTION never inherits the localhost development default", () => {
    for (const unset of [undefined, "", "   ", ",", " , , "]) {
      const resolved = resolveAllowedOrigins(unset, "production");
      expect(resolved).toEqual([]);
      expect(resolved).not.toContain(DEVELOPMENT_WEB_ORIGIN);
    }
  });

  it("production allows exactly what is configured and nothing more", () => {
    expect(
      resolveAllowedOrigins("https://app.example.com", "production")
    ).toEqual(["https://app.example.com"]);
  });

  it("parses a comma-separated list, trimming and dropping blanks", () => {
    expect(
      resolveAllowedOrigins(
        " https://a.example.com , ,https://b.example.com ",
        "production"
      )
    ).toEqual(["https://a.example.com", "https://b.example.com"]);
  });

  it("lets an explicit configuration override the development default", () => {
    expect(
      resolveAllowedOrigins("http://localhost:4173", "development")
    ).toEqual(["http://localhost:4173"]);
  });
});

describe("API-CORS-1 approved origin", () => {
  // A — the approved development origin receives permission.
  it("grants the approved origin a readable response", () => {
    const decision = resolveCors(
      { origin: DEVELOPMENT_WEB_ORIGIN, method: "GET" },
      DEV_ALLOWLIST
    );

    expect(decision.originAllowed).toBe(true);
    expect(decision.headers["access-control-allow-origin"]).toBe(
      DEVELOPMENT_WEB_ORIGIN
    );
  });

  it("marks the response as varying by Origin so caches cannot cross-serve", () => {
    const decision = resolveCors(
      { origin: DEVELOPMENT_WEB_ORIGIN, method: "GET" },
      DEV_ALLOWLIST
    );

    expect(decision.headers.vary).toBe("Origin");
  });

  // H — a wildcard must be impossible for authenticated requests.
  it("NEVER emits a wildcard origin", () => {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const decision = resolveCors(
        { origin: DEVELOPMENT_WEB_ORIGIN, method },
        DEV_ALLOWLIST
      );
      expect(decision.headers["access-control-allow-origin"]).not.toBe("*");
    }
  });

  // Credentials — verified as unnecessary, so deliberately absent.
  it("never enables credentialed CORS, because the client sends no cookies", () => {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const decision = resolveCors(
        { origin: DEVELOPMENT_WEB_ORIGIN, method },
        DEV_ALLOWLIST
      );
      expect(
        decision.headers["access-control-allow-credentials"]
      ).toBeUndefined();
    }
  });
});

describe("API-CORS-1 preflight", () => {
  const preflight = resolveCors(
    { origin: DEVELOPMENT_WEB_ORIGIN, method: "OPTIONS" },
    DEV_ALLOWLIST
  );

  // B — a preflight is identified without reference to any token.
  it("recognises a preflight, and the decision needs no bearer token", () => {
    expect(preflight.isPreflight).toBe(true);
    expect(preflight.originAllowed).toBe(true);
    // resolveCors takes only an origin and a method. There is no parameter
    // through which a credential could influence the outcome.
  });

  // C + G — advertise only what the application needs.
  it("advertises exactly GET, POST and OPTIONS", () => {
    const methods = preflight.headers["access-control-allow-methods"];
    expect(methods).toBe("GET, POST, OPTIONS");

    for (const forbidden of ["PUT", "PATCH", "DELETE", "HEAD", "TRACE"]) {
      expect(methods).not.toContain(forbidden);
    }
  });

  // D + E — the two non-safelisted headers the client actually sends.
  it("permits authorization and content-type, and nothing else", () => {
    const headers = preflight.headers["access-control-allow-headers"];
    expect(headers).toBe("authorization, content-type");
    expect(headers).toContain("authorization");
    expect(headers).toContain("content-type");
    expect(headers).not.toContain("*");
    expect(headers).not.toContain("cookie");
  });

  it("caches the preflight for a bounded time", () => {
    expect(Number(preflight.headers["access-control-max-age"])).toBeGreaterThan(0);
    expect(Number(preflight.headers["access-control-max-age"])).toBeLessThanOrEqual(
      86400
    );
  });

  it("does not advertise methods or headers on a normal request", () => {
    const normal = resolveCors(
      { origin: DEVELOPMENT_WEB_ORIGIN, method: "GET" },
      DEV_ALLOWLIST
    );

    expect(normal.isPreflight).toBe(false);
    expect(normal.headers["access-control-allow-methods"]).toBeUndefined();
    expect(normal.headers["access-control-allow-headers"]).toBeUndefined();
  });

  // F + M — a preflight from a disallowed origin is refused permission.
  it("refuses a preflight from a disallowed origin", () => {
    const decision = resolveCors(
      { origin: HOSTILE, method: "OPTIONS" },
      DEV_ALLOWLIST
    );

    expect(decision.isPreflight).toBe(true);
    expect(decision.originAllowed).toBe(false);
    expect(decision.headers).toEqual({});
  });
});

describe("API-CORS-1 refuses everything it was not told to allow", () => {
  // F — a disallowed origin gets no permission at all.
  it("gives a disallowed origin no CORS headers", () => {
    const decision = resolveCors(
      { origin: HOSTILE, method: "GET" },
      DEV_ALLOWLIST
    );

    expect(decision.originAllowed).toBe(false);
    expect(decision.headers).toEqual({});
    expect(decision.headers["access-control-allow-origin"]).toBeUndefined();
  });

  // G — reflection must be impossible, including near-miss lookalikes.
  it("NEVER reflects an arbitrary Origin", () => {
    const lookalikes = [
      "http://localhost:5173.attacker.example.com",
      "http://localhost:51730",
      "http://localhost:517",
      "https://localhost:5173",
      "http://127.0.0.1:5173",
      "http://LOCALHOST:5173",
      "http://localhost:5173/",
      "http://localhost:5173 ",
      "null",
      "*"
    ];

    for (const origin of lookalikes) {
      const decision = resolveCors({ origin, method: "GET" }, DEV_ALLOWLIST);
      expect(decision.originAllowed).toBe(false);
      expect(decision.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  it("matches by exact equality, so a substring cannot slip through", () => {
    const decision = resolveCors(
      { origin: "http://localhost", method: "GET" },
      DEV_ALLOWLIST
    );
    expect(decision.originAllowed).toBe(false);
  });

  // J — the production matrix, end to end.
  it("PRODUCTION with no configuration allows nothing, including localhost", () => {
    const production = resolveAllowedOrigins(undefined, "production");

    for (const origin of [DEVELOPMENT_WEB_ORIGIN, HOSTILE, "http://localhost"]) {
      const decision = resolveCors({ origin, method: "GET" }, production);
      expect(decision.originAllowed).toBe(false);
      expect(decision.headers).toEqual({});
    }
  });

  it("PRODUCTION preflight from localhost is refused when unconfigured", () => {
    const production = resolveAllowedOrigins(undefined, "production");
    const decision = resolveCors(
      { origin: DEVELOPMENT_WEB_ORIGIN, method: "OPTIONS" },
      production
    );

    expect(decision.originAllowed).toBe(false);
    expect(decision.headers).toEqual({});
  });
});

describe("API-CORS-1 leaves non-browser clients alone", () => {
  // I — no Origin header must not change behaviour.
  it("adds no headers when there is no Origin", () => {
    for (const origin of [undefined, ""]) {
      const decision = resolveCors({ origin, method: "GET" }, DEV_ALLOWLIST);
      expect(decision.headers).toEqual({});
      expect(decision.originAllowed).toBe(false);
    }
  });

  it("treats a duplicated Origin as absent rather than guessing", () => {
    // server.ts collapses a repeated header to undefined before calling in.
    const decision = resolveCors(
      { origin: undefined, method: "GET" },
      DEV_ALLOWLIST
    );
    expect(decision.headers).toEqual({});
  });

  it("grants nothing when the allowlist is empty, whatever the method", () => {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const decision = resolveCors(
        { origin: DEVELOPMENT_WEB_ORIGIN, method },
        []
      );
      expect(decision.originAllowed).toBe(false);
      expect(decision.headers).toEqual({});
    }
  });
});

describe("API-CORS-1 grants no authority", () => {
  // L — CORS must not be able to authenticate or authorize anything.
  it("returns only response headers, never an identity or a permission", () => {
    const decision = resolveCors(
      { origin: DEVELOPMENT_WEB_ORIGIN, method: "GET" },
      DEV_ALLOWLIST
    );

    expect(Object.keys(decision).sort()).toEqual([
      "headers",
      "isPreflight",
      "originAllowed"
    ]);
    expect(decision).not.toHaveProperty("identity");
    expect(decision).not.toHaveProperty("authorized");
    expect(decision).not.toHaveProperty("accessToken");
  });

  it("decides identically for an allowed origin regardless of method", () => {
    // The decision cannot depend on a credential because none is available to
    // it; this pins that the only inputs are origin and method.
    const get = resolveCors(
      { origin: DEVELOPMENT_WEB_ORIGIN, method: "GET" },
      DEV_ALLOWLIST
    );
    const post = resolveCors(
      { origin: DEVELOPMENT_WEB_ORIGIN, method: "POST" },
      DEV_ALLOWLIST
    );

    expect(get.headers).toEqual(post.headers);
  });
});

describe("API-CORS-1 exported surface stays narrow", () => {
  it("advertises only the methods the web application issues", () => {
    expect([...ALLOWED_METHODS]).toEqual(["GET", "POST", "OPTIONS"]);
  });

  it("advertises only the non-safelisted headers the client sends", () => {
    expect([...ALLOWED_HEADERS]).toEqual(["authorization", "content-type"]);
  });
});
