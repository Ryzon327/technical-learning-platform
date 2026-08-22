import { describe, expect, it } from "vitest";
import {
  SEARCH_CACHE_SECURITY_CONTRACT,
  SEARCH_PERMISSION_FORBIDDEN_FIELDS,
  SEARCH_PERMISSION_MODEL_VERSION,
  SEARCH_PERMISSION_OUTCOMES,
  collapseToObservable,
  countSurfaced,
  decideFromAuthoritativeRead,
  describeSearchPermissionUnavailable,
  maySurface,
  searchAuthorized,
  searchPermissionUnavailable,
  searchUnauthorized,
  surfaceAuthorized,
  type SearchPermissionDecision
} from "./search-permission";

describe("only an authorized decision may surface", () => {
  it("surfaces an authorized decision", () => {
    expect(maySurface(searchAuthorized())).toBe(true);
  });

  it("never surfaces an unauthorized decision", () => {
    expect(maySurface(searchUnauthorized())).toBe(false);
  });

  it("never surfaces an unavailable decision", () => {
    expect(maySurface(searchPermissionUnavailable("source read failed"))).toBe(
      false
    );
  });

  /**
   * Fail-closed by construction. `maySurface` returns true for exactly one
   * literal, so a decision shape this module does not recognise — including one
   * a future feature adds — is denied rather than allowed.
   */
  it("denies an outcome the contract does not recognise", () => {
    const future = { outcome: "partially_authorized" } as unknown as SearchPermissionDecision;

    expect(maySurface(future)).toBe(false);
    expect(collapseToObservable(future)).toBe("absent");
  });

  it("names exactly the three approved outcomes", () => {
    expect(SEARCH_PERMISSION_OUTCOMES).toEqual([
      "authorized",
      "unauthorized",
      "unavailable"
    ]);
  });

  it("stamps the model version", () => {
    expect(SEARCH_PERMISSION_MODEL_VERSION).toBe("search-permission-v1");
  });
});

describe("decisions come from the owning engine's authoritative read", () => {
  it("a found authoritative row is authorized", () => {
    expect(
      decideFromAuthoritativeRead({ readFailed: false, found: true })
    ).toEqual({ outcome: "authorized" });
  });

  it("a row the caller could not read is unauthorized", () => {
    expect(
      decideFromAuthoritativeRead({ readFailed: false, found: false })
    ).toEqual({ outcome: "unauthorized" });
  });

  it("a failed authoritative read is unavailable", () => {
    expect(
      decideFromAuthoritativeRead({ readFailed: true, found: false })
    ).toMatchObject({ outcome: "unavailable" });
  });

  it("a failed read is unavailable even if a row was somehow returned", () => {
    expect(
      decideFromAuthoritativeRead({ readFailed: true, found: true })
    ).toMatchObject({ outcome: "unavailable" });
  });
});

describe("unauthorized and missing are indistinguishable", () => {
  /**
   * The type-level collapse SEARCH-003 requires. A record that does not exist
   * and a record the caller may not read produce the SAME decision, so no
   * downstream code can branch on the difference even by accident.
   */
  it("a missing record and a forbidden record produce the same decision", () => {
    const missing = decideFromAuthoritativeRead({
      readFailed: false,
      found: false
    });
    const forbidden = decideFromAuthoritativeRead({
      readFailed: false,
      found: false
    });

    expect(missing).toEqual(forbidden);
    expect(JSON.stringify(missing)).toBe(JSON.stringify(forbidden));
  });

  it("both collapse to the same observable outcome", () => {
    expect(collapseToObservable(searchUnauthorized())).toBe("absent");
    expect(
      collapseToObservable(searchPermissionUnavailable("anything"))
    ).toBe("absent");
    expect(collapseToObservable(searchAuthorized())).toBe("visible");
  });

  it("carries no marker distinguishing withheld from nonexistent", () => {
    const decision = searchUnauthorized() as unknown as Record<string, unknown>;

    for (const forbidden of ["exists", "withheld", "hidden", "reason", "missing"]) {
      expect(decision).not.toHaveProperty(forbidden);
    }
    expect(Object.keys(decision)).toEqual(["outcome"]);
  });
});

describe("internalReason is internal only", () => {
  it("exists only on the unavailable branch", () => {
    expect(searchAuthorized()).not.toHaveProperty("internalReason");
    expect(searchUnauthorized()).not.toHaveProperty("internalReason");
    expect(
      searchPermissionUnavailable("curriculum read failed")
    ).toHaveProperty("internalReason", "curriculum read failed");
  });

  it("is omitted entirely when no reason is supplied", () => {
    expect(searchPermissionUnavailable()).toEqual({ outcome: "unavailable" });
  });

  /**
   * The leak test: whatever a source records internally, nothing about it may
   * reach what a learner receives. `surfaceAuthorized` returns values only, and
   * an unavailable candidate contributes nothing at all.
   */
  it("never reaches a surfaced value", () => {
    const surfaced = surfaceAuthorized([
      { decision: searchAuthorized(), value: { title: "Visible" } },
      {
        decision: searchPermissionUnavailable("secret source detail"),
        value: { title: "Withheld" }
      }
    ]);

    expect(surfaced).toEqual([{ title: "Visible" }]);
    expect(JSON.stringify(surfaced)).not.toContain("secret source detail");
    expect(JSON.stringify(surfaced)).not.toContain("Withheld");
  });

  it("never reaches the learner-facing unavailable message", () => {
    const message = describeSearchPermissionUnavailable();

    expect(message).not.toContain("internalReason");
    // The message must not imply anything was withheld.
    for (const claim of ["hidden", "denied", "permission", "access", "withheld"]) {
      expect(message.toLowerCase()).not.toContain(claim);
    }
  });

  it("distinguishes a failed search from an empty one, without leaking why", () => {
    const message = describeSearchPermissionUnavailable();

    expect(message.toLowerCase()).toContain("could not be completed");
    expect(message.toLowerCase()).toContain("try again");
  });
});

describe("surfacing and counting", () => {
  const candidates = [
    { decision: searchAuthorized(), value: "a" },
    { decision: searchUnauthorized(), value: "b" },
    { decision: searchPermissionUnavailable("x"), value: "c" },
    { decision: searchAuthorized(), value: "d" }
  ];

  it("surfaces only authorized values", () => {
    expect(surfaceAuthorized(candidates)).toEqual(["a", "d"]);
  });

  it("counts only surfaced results", () => {
    expect(countSurfaced(candidates)).toBe(2);
  });

  it("a withheld candidate contributes nothing to the count", () => {
    expect(
      countSurfaced([
        { decision: searchUnauthorized(), value: "b" },
        { decision: searchPermissionUnavailable("x"), value: "c" }
      ])
    ).toBe(0);
  });

  it("drops withheld candidates silently, with no placeholder", () => {
    const surfaced = surfaceAuthorized([
      { decision: searchUnauthorized(), value: "b" }
    ]);

    expect(surfaced).toEqual([]);
    expect(JSON.stringify(surfaced)).not.toContain("b");
  });

  it("does not mutate the caller's candidates", () => {
    const snapshot = JSON.stringify(candidates);
    surfaceAuthorized(candidates);
    expect(JSON.stringify(candidates)).toBe(snapshot);
  });
});

describe("the contract carries no owning-engine policy", () => {
  it("names no source-engine authorization concept", async () => {
    const module = await import("./search-permission");
    const exported = Object.keys(module).join(" ").toLowerCase();

    for (const policy of [
      "publication",
      "published",
      "owner",
      "userid",
      "role",
      "enrollment",
      "note",
      "curriculum",
      "certificate",
      "evidence"
    ]) {
      expect(exported).not.toContain(policy);
    }
  });

  it("exports no writer or persistence helper", async () => {
    const module = await import("./search-permission");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(/^(save|persist|write|store|insert|update|delete|cache)/i);
    }
  });

  it("forbids ACL and identity fields as data", () => {
    for (const forbidden of ["userId", "ownerId", "roles", "acl", "permissions"]) {
      expect(SEARCH_PERMISSION_FORBIDDEN_FIELDS).toContain(forbidden);
    }
    for (const forbidden of ["hiddenCount", "withheldCount", "unauthorizedCount"]) {
      expect(SEARCH_PERMISSION_FORBIDDEN_FIELDS).toContain(forbidden);
    }
  });
});

describe("the cache security contract", () => {
  it("records every approved rule", () => {
    expect(SEARCH_CACHE_SECURITY_CONTRACT).toHaveLength(5);

    const joined = SEARCH_CACHE_SECURITY_CONTRACT.join(" ").toLowerCase();
    expect(joined).toContain("never become the permission authority");
    expect(joined).toContain("never cross security scopes");
    expect(joined).toContain("re-authorized against source authority");
    expect(joined).toContain("invalidate or reconcile");
    expect(joined).toContain("fail closed");
  });

  it("is a contract only — nothing here builds a cache", async () => {
    const module = await import("./search-permission");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(/(buildCache|createIndex|invalidate|materiali)/i);
    }
  });
});
