import {
  AppError,
  normalizeNoteExportFormat,
  type NoteBlock,
  type NoteExportBundle,
  type NoteExportFormat,
  type StudentBookmark,
  type StudentNoteTag
} from "@tlp/shared-types";
import { createUserScopedSupabaseClient } from "./supabase";
import { getStudentNote } from "./notes";
import { listNoteBlocks } from "./note-organization";
import { listStudentBookmarks } from "./note-retrieval";

const dependency = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

function renderBlock(block: NoteBlock): string {
  switch (block.blockType) {
    case "heading":
      return `## ${block.text}`;
    case "bulleted_list":
      return block.text
        .split("\n")
        .map((line) => `- ${line}`)
        .join("\n");
    case "numbered_list":
      return block.text
        .split("\n")
        .map((line, index) => `${index + 1}. ${line}`)
        .join("\n");
    case "checklist":
      return block.text
        .split("\n")
        .map((line) => `- [ ] ${line}`)
        .join("\n");
    case "code":
      return `\`\`\`${block.language ?? ""}\n${block.text}\n\`\`\``;
    case "command":
      return `\`\`\`sh\n${block.text}\n\`\`\``;
    case "terminal_output":
      return `\`\`\`text\n${block.text}\n\`\`\``;
    case "quote":
      return block.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "callout":
      return `> **Note:** ${block.text}`;
    default:
      return block.text;
  }
}

async function loadAssignedTags(
  accessToken: string,
  noteId: string
): Promise<StudentNoteTag[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data: assignments, error: assignmentError } = await supabase
    .from("student_note_tag_assignments")
    .select("tag_id")
    .eq("note_id", noteId);

  if (assignmentError) throw dependency("Unable to load note tag assignments");

  const tagIds = (assignments ?? []).map((row) => String(row.tag_id));
  if (!tagIds.length) return [];

  const { data: tags, error: tagError } = await supabase
    .from("student_note_tags")
    .select("id,name,created_at,updated_at")
    .in("id", tagIds)
    .order("name", { ascending: true });

  if (tagError) throw dependency("Unable to load note tags");

  return (tags ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }));
}

export async function buildStudentNoteExport(
  accessToken: string,
  noteId: string
): Promise<NoteExportBundle> {
  const [note, blocks, tags, allBookmarks] = await Promise.all([
    getStudentNote(accessToken, noteId),
    listNoteBlocks(accessToken, noteId),
    loadAssignedTags(accessToken, noteId),
    listStudentBookmarks(accessToken)
  ]);

  const bookmarks = allBookmarks.filter(
    (bookmark) =>
      bookmark.targetType === "note" &&
      bookmark.targetStableId === noteId
  );

  return {
    exportedAt: new Date().toISOString(),
    formatVersion: "1.0",
    note,
    blocks,
    tags,
    bookmarks,
    contexts: note.contexts
  };
}

export function serializeStudentNoteExport(
  bundle: NoteExportBundle,
  formatValue: unknown
): {
  format: NoteExportFormat;
  contentType: string;
  extension: string;
  body: string;
} {
  const format = normalizeNoteExportFormat(formatValue);

  if (format === "json") {
    return {
      format,
      contentType: "application/json; charset=utf-8",
      extension: "json",
      body: JSON.stringify(bundle, null, 2)
    };
  }

  const sections: string[] = [];
  sections.push(`# ${bundle.note.title || "Untitled note"}`);

  if (bundle.tags.length) {
    sections.push(`**Tags:** ${bundle.tags.map((tag) => tag.name).join(", ")}`);
  }

  if (bundle.contexts.length) {
    sections.push(
      [
        "**Learning context:**",
        ...bundle.contexts.map(
          (context) =>
            `- ${context.contextType}: ${context.stableId}${
              context.version ? ` (v${context.version})` : ""
            }`
        )
      ].join("\n")
    );
  }

  if (bundle.note.body) {
    sections.push(bundle.note.body);
  }

  if (bundle.blocks.length) {
    sections.push(bundle.blocks.map(renderBlock).join("\n\n"));
  }

  return {
    format,
    contentType: "text/markdown; charset=utf-8",
    extension: "md",
    body: `${sections.join("\n\n")}\n`
  };
}
