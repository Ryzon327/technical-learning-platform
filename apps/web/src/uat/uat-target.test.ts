import { describe, expect, it } from "vitest";
import { UAT_TARGETS, readUatTargetFromPath } from "./uat-target";

/**
 * WP-I — the UAT path grammar.
 *
 * The surface must activate for exactly one path and for nothing else. A path
 * reader that were even slightly loose would let a development surface
 * intercept a learner route.
 */

describe("the UAT surface activates for one exact path", () => {
  it("recognises the instruction target", () => {
    expect(readUatTargetFromPath("/uat/instruction")).toBe("instruction");
  });

  it("tolerates a trailing slash", () => {
    expect(readUatTargetFromPath("/uat/instruction/")).toBe("instruction");
  });

  it("lists the recognised targets", () => {
    expect([...UAT_TARGETS]).toEqual(["instruction"]);
  });
});

describe("the UAT surface never intercepts another route", () => {
  for (const pathname of [
    "/",
    "/uat",
    "/uat/",
    "/uat/unknown",
    "/uat/instruction/extra",
    "/uatinstruction",
    "/learning",
    "/verify/abc123",
    "/UAT/instruction",
    "/x/uat/instruction",
    ""
  ]) {
    it(`returns null for ${pathname === "" ? "(empty)" : pathname}`, () => {
      expect(readUatTargetFromPath(pathname)).toBeNull();
    });
  }
});
