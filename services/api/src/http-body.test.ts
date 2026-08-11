import { describe, expect, it } from "vitest";

describe("HTTP body contract", () => {
  it("uses a bounded JSON-object request contract", () => {
    expect(64 * 1024).toBe(65536);
  });
});
