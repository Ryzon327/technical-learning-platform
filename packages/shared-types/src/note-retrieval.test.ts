import { describe, expect, it } from "vitest";
import { normalizeNoteSearchQuery, normalizeSearchLimit } from "./note-retrieval";

describe("note retrieval contracts", () => {
  it("normalizes whitespace-only search noise", () => {
    expect(normalizeNoteSearchQuery("  active   directory  ")).toBe("active directory");
  });

  it("bounds private search result limits", () => {
    expect(normalizeSearchLimit(500)).toBe(100);
    expect(normalizeSearchLimit(0)).toBe(1);
  });
});
