import type { NoteBlock, StudentNoteTag } from "./note-blocks";
import type { NoteContextReference, StudentNote } from "./notes";
import type { StudentBookmark } from "./note-retrieval";

export type NoteExportFormat = "markdown" | "json";

export interface NoteExportBundle {
  exportedAt: string;
  formatVersion: "1.0";
  note: StudentNote;
  blocks: NoteBlock[];
  tags: StudentNoteTag[];
  bookmarks: StudentBookmark[];
  contexts: NoteContextReference[];
}

export function normalizeNoteExportFormat(value: unknown): NoteExportFormat {
  return value === "json" ? "json" : "markdown";
}
