import { describe, expect, it } from "vitest";
import { normalizeNoteExportFormat } from "./note-export";

describe("note export contracts", () => {
  it("defaults to markdown", () => {
    expect(normalizeNoteExportFormat(undefined)).toBe("markdown");
  });

  it("allows structured JSON export", () => {
    expect(normalizeNoteExportFormat("json")).toBe("json");
  });
});
