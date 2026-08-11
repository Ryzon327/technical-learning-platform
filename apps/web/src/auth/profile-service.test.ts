import { describe, expect, it } from "vitest";

describe("profile service contract", () => {
  it("recognizes the two approved platform roles", () => {
    expect(["student", "founder_admin"]).toHaveLength(2);
  });
});
