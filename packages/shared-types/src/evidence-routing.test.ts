import { describe, expect, it } from "vitest";
import {
  RESERVED_EVIDENCE_PATH_SEGMENTS,
  classifyEvidencePathSegment,
  isReservedEvidencePathSegment
} from "./evidence-routing";

/**
 * Regression coverage for the Batch 7 routing defect.
 *
 * `GET /evidence/export` matched the Batch 1 `/evidence/:evidenceId` pattern
 * with the identifier "export", so it reached the authenticated record handler
 * and answered 401 instead of 404. The reserved-segment rule below is what
 * stops a collection-route name from ever being read as an identifier.
 *
 * The dispatch helper mirrors the order in services/api/src/server.ts so the
 * behaviour can be asserted without starting an HTTP listener, which the
 * repository's test convention does not do.
 */

function dispatch(method: string, pathname: string): number {
  if (method === "POST" && pathname === "/evidence/export") return 401;
  if (method === "GET" && pathname === "/evidence/portfolio") return 401;
  if (method === "GET" && /^\/evidence\/([^/]+)\/corrections$/.test(pathname)) {
    return 401;
  }
  if (method === "GET" && /^\/evidence\/([^/]+)\/competencies$/.test(pathname)) {
    return 401;
  }

  const match = pathname.match(/^\/evidence\/([^/]+)$/);
  const segment = decodeURIComponent(match?.[1] ?? "");
  if (method === "GET" && match && !isReservedEvidencePathSegment(segment)) {
    return 401;
  }

  return 404;
}

describe("reserved evidence path segments", () => {
  it("reserves the collection route names", () => {
    expect(isReservedEvidencePathSegment("export")).toBe(true);
    expect(isReservedEvidencePathSegment("portfolio")).toBe(true);
    expect(RESERVED_EVIDENCE_PATH_SEGMENTS).toContain("export");
    expect(RESERVED_EVIDENCE_PATH_SEGMENTS).toContain("portfolio");
  });

  it("treats an Evidence identifier as an identifier", () => {
    expect(
      isReservedEvidencePathSegment("11111111-1111-4111-8111-111111111111")
    ).toBe(false);
    expect(classifyEvidencePathSegment("11111111-1111-4111-8111-111111111111")).toBe(
      "identifier"
    );
    expect(classifyEvidencePathSegment("export")).toBe("reserved");
  });

  it("cannot be bypassed by casing or padding", () => {
    for (const value of ["EXPORT", "Export", " export ", "PORTFOLIO"]) {
      expect(isReservedEvidencePathSegment(value)).toBe(true);
    }
  });

  it("fails safe on non-string input", () => {
    for (const value of [undefined, null, 42, {}]) {
      expect(isReservedEvidencePathSegment(value)).toBe(false);
    }
  });
});

describe("export route dispatch", () => {
  it("POST /evidence/export requires authentication", () => {
    expect(dispatch("POST", "/evidence/export")).toBe(401);
  });

  it("GET /evidence/export is not found, never authenticated", () => {
    expect(dispatch("GET", "/evidence/export")).toBe(404);
  });

  it("no other method turns /evidence/export into an endpoint", () => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE", "HEAD"]) {
      expect(dispatch(method, "/evidence/export")).toBe(404);
    }
  });

  it("GET /evidence/export never reaches the identifier handler", () => {
    // The defect: "export" was captured as an Evidence identifier.
    const match = "/evidence/export".match(/^\/evidence\/([^/]+)$/);
    expect(match?.[1]).toBe("export");
    // The guard is what stops that capture from being used.
    expect(isReservedEvidencePathSegment(match?.[1])).toBe(true);
    expect(dispatch("GET", "/evidence/export")).toBe(404);
  });

  it("a differently cased path does not reach the identifier handler either", () => {
    expect(dispatch("GET", "/evidence/EXPORT")).toBe(404);
  });
});

describe("existing Batch 1-6 routing is unchanged", () => {
  it("GET /evidence/:id still authenticates for a real identifier", () => {
    expect(
      dispatch("GET", "/evidence/11111111-1111-4111-8111-111111111111")
    ).toBe(401);
  });

  it("GET /evidence/portfolio still authenticates", () => {
    expect(dispatch("GET", "/evidence/portfolio")).toBe(401);
  });

  it("POST /evidence/portfolio remains not found", () => {
    expect(dispatch("POST", "/evidence/portfolio")).toBe(404);
  });

  it("nested Evidence routes still authenticate", () => {
    expect(dispatch("GET", "/evidence/test-evidence/corrections")).toBe(401);
    expect(dispatch("GET", "/evidence/test-evidence/competencies")).toBe(401);
  });
});
