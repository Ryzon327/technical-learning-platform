import { describe, expect, it } from "vitest";
import { normalizeNoteSearchQuery, normalizeSearchLimit } from "@tlp/shared-types";

describe("private note retrieval API contracts", () => {
  it("keeps search bounded", () => {
    expect(normalizeSearchLimit(1000)).toBe(100);
  });

  it("normalizes technical search queries", () => {
    expect(normalizeNoteSearchQuery("  show   interfaces ")).toBe("show interfaces");
  });
});
