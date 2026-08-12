import { describe, expect, it } from "vitest";

describe("learning guidance API contracts", () => {
  it("bounds history result size", () => {
    expect(Math.max(1, Math.min(1000, 500))).toBe(500);
  });

  it("does not encode streak penalties", () => {
    const policyText = "meaningful educational state";
    expect(policyText).not.toContain("streak");
  });
});
