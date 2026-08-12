import {
  AppError,
  normalizeBlockText,
  normalizeTagName,
  noteContainsUnsafeMarkup,
  type NoteBlock,
  type NoteBlockType,
  type StudentNoteTag,
  type UpsertNoteBlockInput
} from "@tlp/shared-types";
import { createUserScopedSupabaseClient } from "./supabase";

const allowedBlockTypes = new Set<NoteBlockType>([
  "paragraph",
  "heading",
  "bulleted_list",
  "numbered_list",
  "checklist",
  "code",
  "command",
  "terminal_output",
  "quote",
  "callout",
  "link",
  "table"
]);

const dependency = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

function blockFrom(row: Record<string, unknown>): NoteBlock {
  return {
    id: String(row.id),
    noteId: String(row.note_id),
    blockType: String(row.block_type) as NoteBlockType,
    position: Number(row.position),
    text: String(row.text ?? ""),
    ...(row.language ? { language: String(row.language) } : {}),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function tagFrom(row: Record<string, unknown>): StudentNoteTag {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function validateBlock(input: UpsertNoteBlockInput): UpsertNoteBlockInput {
  if (!allowedBlockTypes.has(input.blockType)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Unsupported note block type",
      retryable: false
    });
  }

  if (!Number.isInteger(input.position) || input.position < 0) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Note block position must be a non-negative integer",
      retryable: false
    });
  }

  let text: string;
  try {
    text = normalizeBlockText(input.text);
  } catch (error) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "Invalid note block",
      retryable: false
    });
  }

  if (noteContainsUnsafeMarkup(text)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Note block contains unsafe active markup",
      retryable: false
    });
  }

  return {
    ...input,
    text,
    language: input.language ? String(input.language).trim().slice(0, 40) : undefined,
    metadata: input.metadata ?? {}
  };
}

export async function listNoteBlocks(
  accessToken: string,
  noteId: string
): Promise<NoteBlock[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_note_blocks")
    .select("id,note_id,block_type,position,text,language,metadata,created_at,updated_at")
    .eq("note_id", noteId)
    .order("position", { ascending: true });

  if (error) throw dependency("Unable to load note blocks");
  return (data ?? []).map((row) => blockFrom(row as Record<string, unknown>));
}

export async function replaceNoteBlocks(
  accessToken: string,
  noteId: string,
  inputs: UpsertNoteBlockInput[]
): Promise<NoteBlock[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const blocks = inputs.map(validateBlock);

  const { data: ownedNote, error: noteError } = await supabase
    .from("student_notes")
    .select("id")
    .eq("id", noteId)
    .maybeSingle();

  if (noteError) throw dependency("Unable to verify note ownership");
  if (!ownedNote) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Note not found",
      retryable: false
    });
  }

  const { error: deleteError } = await supabase
    .from("student_note_blocks")
    .delete()
    .eq("note_id", noteId);

  if (deleteError) throw dependency("Unable to replace note blocks");

  if (blocks.length) {
    const { error: insertError } = await supabase
      .from("student_note_blocks")
      .insert(
        blocks.map((block) => ({
          ...(block.id ? { id: block.id } : {}),
          note_id: noteId,
          block_type: block.blockType,
          position: block.position,
          text: block.text,
          language: block.language ?? null,
          metadata: block.metadata ?? {}
        }))
      );

    if (insertError) throw dependency("Unable to replace note blocks");
  }

  return listNoteBlocks(accessToken, noteId);
}

export async function listStudentTags(
  accessToken: string
): Promise<StudentNoteTag[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_note_tags")
    .select("id,name,created_at,updated_at")
    .order("name", { ascending: true });

  if (error) throw dependency("Unable to load note tags");
  return (data ?? []).map((row) => tagFrom(row as Record<string, unknown>));
}

export async function createStudentTag(
  accessToken: string,
  nameValue: unknown
): Promise<StudentNoteTag> {
  let name: string;
  try {
    name = normalizeTagName(nameValue);
  } catch (error) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "Invalid tag name",
      retryable: false
    });
  }

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_note_tags")
    .insert({ name })
    .select("id,name,created_at,updated_at")
    .single();

  if (error || !data) throw dependency("Unable to create tag");
  return tagFrom(data as Record<string, unknown>);
}

export async function renameStudentTag(
  accessToken: string,
  tagId: string,
  nameValue: unknown
): Promise<StudentNoteTag> {
  let name: string;
  try {
    name = normalizeTagName(nameValue);
  } catch (error) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "Invalid tag name",
      retryable: false
    });
  }

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_note_tags")
    .update({ name })
    .eq("id", tagId)
    .select("id,name,created_at,updated_at")
    .maybeSingle();

  if (error) throw dependency("Unable to rename tag");
  if (!data) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Tag not found",
      retryable: false
    });
  }

  return tagFrom(data as Record<string, unknown>);
}

export async function deleteStudentTag(
  accessToken: string,
  tagId: string
): Promise<void> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_note_tags")
    .delete()
    .eq("id", tagId)
    .select("id")
    .maybeSingle();

  if (error) throw dependency("Unable to delete tag");
  if (!data) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Tag not found",
      retryable: false
    });
  }
}

export async function replaceNoteTags(
  accessToken: string,
  noteId: string,
  tagIds: string[]
): Promise<string[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data: note, error: noteError } = await supabase
    .from("student_notes")
    .select("id")
    .eq("id", noteId)
    .maybeSingle();

  if (noteError) throw dependency("Unable to verify note ownership");
  if (!note) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Note not found",
      retryable: false
    });
  }

  const uniqueTagIds = [...new Set(tagIds.map(String))];

  if (uniqueTagIds.length) {
    const { data: ownedTags, error: tagError } = await supabase
      .from("student_note_tags")
      .select("id")
      .in("id", uniqueTagIds);

    if (tagError) throw dependency("Unable to verify tag ownership");
    if ((ownedTags ?? []).length !== uniqueTagIds.length) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "One or more note tags are unavailable",
        retryable: false
      });
    }
  }

  const { error: deleteError } = await supabase
    .from("student_note_tag_assignments")
    .delete()
    .eq("note_id", noteId);

  if (deleteError) throw dependency("Unable to update note tags");

  if (uniqueTagIds.length) {
    const { error: insertError } = await supabase
      .from("student_note_tag_assignments")
      .insert(uniqueTagIds.map((tagId) => ({ note_id: noteId, tag_id: tagId })));

    if (insertError) throw dependency("Unable to update note tags");
  }

  return uniqueTagIds;
}

export async function setNotePinned(
  accessToken: string,
  noteId: string,
  pinned: boolean
): Promise<boolean> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_notes")
    .update({ pinned })
    .eq("id", noteId)
    .select("pinned")
    .maybeSingle();

  if (error) throw dependency("Unable to update note pin");
  if (!data) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Note not found",
      retryable: false
    });
  }

  return Boolean(data.pinned);
}
