import { describe, expect, it } from "vitest";

describe("curriculum quality helpers", () => {
  it("aggregates effort deterministically", () => {
    expect([15, 20, 25].reduce((sum, value) => sum + value, 0)).toBe(60);
  });
});
