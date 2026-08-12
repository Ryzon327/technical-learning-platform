export interface NoteSearchQuery {
  query?: string;
  tagIds?: string[];
  contextType?: string;
  contextStableId?: string;
  pinned?: boolean;
  limit?: number;
}

export interface NoteSearchResult {
  noteId: string;
  title: string;
  excerpt: string;
  matchedIn: Array<"title" | "body" | "block">;
  pinned: boolean;
  updatedAt: string;
}

export type BookmarkTargetType =
  | "learning_path"
  | "course"
  | "module"
  | "mission"
  | "competency"
  | "content_asset"
  | "lab_definition"
  | "lab_session"
  | "note";

export interface StudentBookmark {
  id: string;
  targetType: BookmarkTargetType;
  targetStableId: string;
  targetVersion?: number;
  label?: string;
  createdAt: string;
}

export function normalizeNoteSearchQuery(value: unknown): string {
  const query = String(value ?? "").trim().replace(/\s+/g, " ");
  if (query.length > 200) {
    throw new Error("Search query must be 200 characters or fewer");
  }
  return query;
}

export function normalizeSearchLimit(value: unknown): number {
  const parsed = Number(value ?? 25);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}
