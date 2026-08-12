import { describe, expect, it } from "vitest";
import { serializeStudentNoteExport } from "./note-export";

describe("note export serialization", () => {
  const bundle = {
    exportedAt: "2026-08-12T00:00:00.000Z",
    formatVersion: "1.0" as const,
    note: {
      id: "note-1",
      title: "Routing",
      body: "OSPF notes",
      contexts: [],
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z"
    },
    blocks: [],
    tags: [],
    bookmarks: [],
    contexts: []
  };

  it("exports readable markdown", () => {
    const result = serializeStudentNoteExport(bundle, "markdown");
    expect(result.contentType).toContain("text/markdown");
    expect(result.body).toContain("# Routing");
    expect(result.body).toContain("OSPF notes");
  });

  it("exports structured JSON", () => {
    const result = serializeStudentNoteExport(bundle, "json");
    expect(JSON.parse(result.body).note.id).toBe("note-1");
  });
});
