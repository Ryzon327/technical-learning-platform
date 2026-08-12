import {
  AppError,
  normalizeNoteSearchQuery,
  normalizeSearchLimit,
  type BookmarkTargetType,
  type NoteSearchQuery,
  type NoteSearchResult,
  type StudentBookmark
} from "@tlp/shared-types";
import { createUserScopedSupabaseClient } from "./supabase";

const dependency = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

const bookmarkTargets = new Set<BookmarkTargetType>([
  "learning_path",
  "course",
  "module",
  "mission",
  "competency",
  "content_asset",
  "lab_definition",
  "lab_session",
  "note"
]);

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function excerpt(text: string, query: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (!query) return compact.slice(0, 220);

  const index = compact.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return compact.slice(0, 220);

  const start = Math.max(0, index - 70);
  const end = Math.min(compact.length, index + query.length + 130);
  return `${start > 0 ? "…" : ""}${compact.slice(start, end)}${end < compact.length ? "…" : ""}`;
}

export async function searchStudentNotes(
  accessToken: string,
  input: NoteSearchQuery
): Promise<NoteSearchResult[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);

  let query: string;
  try {
    query = normalizeNoteSearchQuery(input.query);
  } catch (error) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: error instanceof Error ? error.message : "Invalid search query",
      retryable: false
    });
  }

  const limit = normalizeSearchLimit(input.limit);

  let notesQuery = supabase
    .from("student_notes")
    .select("id,title,body,pinned,updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit * 4);

  if (typeof input.pinned === "boolean") {
    notesQuery = notesQuery.eq("pinned", input.pinned);
  }

  if (query) {
    const safe = escapeLike(query);
    notesQuery = notesQuery.or(`title.ilike.%${safe}%,body.ilike.%${safe}%`);
  }

  const { data: notes, error: noteError } = await notesQuery;
  if (noteError) throw dependency("Unable to search private notes");

  let allowedIds = new Set((notes ?? []).map((note) => String(note.id)));

  if (input.tagIds?.length) {
    const uniqueTags = [...new Set(input.tagIds.map(String))];
    const { data: assignments, error } = await supabase
      .from("student_note_tag_assignments")
      .select("note_id,tag_id")
      .in("tag_id", uniqueTags);

    if (error) throw dependency("Unable to filter private notes by tag");

    const matches = new Map<string, Set<string>>();
    for (const assignment of assignments ?? []) {
      const noteId = String(assignment.note_id);
      const current = matches.get(noteId) ?? new Set<string>();
      current.add(String(assignment.tag_id));
      matches.set(noteId, current);
    }

    allowedIds = new Set(
      [...allowedIds].filter((id) => matches.get(id)?.size === uniqueTags.length)
    );
  }

  if (input.contextType || input.contextStableId) {
    let contextQuery = supabase
      .from("student_note_contexts")
      .select("note_id,context_type,context_stable_id");

    if (input.contextType) {
      contextQuery = contextQuery.eq("context_type", input.contextType);
    }
    if (input.contextStableId) {
      contextQuery = contextQuery.eq("context_stable_id", input.contextStableId);
    }

    const { data: contexts, error } = await contextQuery;
    if (error) throw dependency("Unable to filter notes by learning context");

    const contextIds = new Set((contexts ?? []).map((row) => String(row.note_id)));
    allowedIds = new Set([...allowedIds].filter((id) => contextIds.has(id)));
  }

  const candidateNotes = (notes ?? []).filter((note) => allowedIds.has(String(note.id)));

  let blockMatches = new Map<string, string>();
  if (query && candidateNotes.length) {
    const ids = candidateNotes.map((note) => String(note.id));
    const safe = escapeLike(query);
    const { data: blocks, error } = await supabase
      .from("student_note_blocks")
      .select("note_id,text")
      .in("note_id", ids)
      .ilike("text", `%${safe}%`);

    if (error) throw dependency("Unable to search private technical note blocks");

    for (const block of blocks ?? []) {
      const noteId = String(block.note_id);
      if (!blockMatches.has(noteId)) {
        blockMatches.set(noteId, String(block.text ?? ""));
      }
    }
  }

  const lowered = query.toLowerCase();

  return candidateNotes
    .map((note) => {
      const title = String(note.title ?? "");
      const body = String(note.body ?? "");
      const blockText = blockMatches.get(String(note.id)) ?? "";
      const matchedIn: Array<"title" | "body" | "block"> = [];

      if (!query || title.toLowerCase().includes(lowered)) matchedIn.push("title");
      if (!query || body.toLowerCase().includes(lowered)) matchedIn.push("body");
      if (blockText) matchedIn.push("block");

      if (query && matchedIn.length === 0) return null;

      const source = blockText || body || title;

      return {
        noteId: String(note.id),
        title,
        excerpt: excerpt(source, query),
        matchedIn,
        pinned: Boolean(note.pinned),
        updatedAt: String(note.updated_at)
      } satisfies NoteSearchResult;
    })
    .filter((result): result is NoteSearchResult => result !== null)
    .slice(0, limit);
}

function bookmarkFrom(row: Record<string, unknown>): StudentBookmark {
  return {
    id: String(row.id),
    targetType: String(row.target_type) as BookmarkTargetType,
    targetStableId: String(row.target_stable_id),
    ...(row.target_version == null ? {} : { targetVersion: Number(row.target_version) }),
    ...(row.label ? { label: String(row.label) } : {}),
    createdAt: String(row.created_at)
  };
}

export async function listStudentBookmarks(
  accessToken: string
): Promise<StudentBookmark[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_bookmarks")
    .select("id,target_type,target_stable_id,target_version,label,created_at")
    .order("created_at", { ascending: false });

  if (error) throw dependency("Unable to load bookmarks");
  return (data ?? []).map((row) => bookmarkFrom(row as Record<string, unknown>));
}

export async function createStudentBookmark(
  accessToken: string,
  input: {
    targetType: BookmarkTargetType;
    targetStableId: string;
    targetVersion?: number;
    label?: string;
  }
): Promise<StudentBookmark> {
  if (!bookmarkTargets.has(input.targetType)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Unsupported bookmark target",
      retryable: false
    });
  }

  const targetStableId = String(input.targetStableId ?? "").trim();
  if (!targetStableId) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Bookmark target is required",
      retryable: false
    });
  }

  const label = input.label ? String(input.label).trim().slice(0, 160) : null;

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_bookmarks")
    .insert({
      target_type: input.targetType,
      target_stable_id: targetStableId,
      target_version: input.targetVersion ?? null,
      label
    })
    .select("id,target_type,target_stable_id,target_version,label,created_at")
    .single();

  if (error || !data) throw dependency("Unable to create bookmark");
  return bookmarkFrom(data as Record<string, unknown>);
}

export async function deleteStudentBookmark(
  accessToken: string,
  bookmarkId: string
): Promise<void> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("student_bookmarks")
    .delete()
    .eq("id", bookmarkId)
    .select("id")
    .maybeSingle();

  if (error) throw dependency("Unable to remove bookmark");
  if (!data) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Bookmark not found",
      retryable: false
    });
  }
}
