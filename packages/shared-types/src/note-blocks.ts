export type NoteBlockType =
  | "paragraph"
  | "heading"
  | "bulleted_list"
  | "numbered_list"
  | "checklist"
  | "code"
  | "command"
  | "terminal_output"
  | "quote"
  | "callout"
  | "link"
  | "table";

export interface NoteBlock {
  id: string;
  noteId: string;
  blockType: NoteBlockType;
  position: number;
  text: string;
  language?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertNoteBlockInput {
  id?: string;
  blockType: NoteBlockType;
  position: number;
  text: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface StudentNoteTag {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export function normalizeTagName(value: unknown): string {
  const tag = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!tag) throw new Error("Tag name is required");
  if (tag.length > 50) throw new Error("Tag name must be 50 characters or fewer");
  if (/[<>]/.test(tag)) throw new Error("Tag name contains unsupported markup");
  return tag;
}

export function normalizeBlockText(value: unknown): string {
  const text = String(value ?? "");
  if (text.length > 100_000) throw new Error("Note block is too large");
  return text;
}
