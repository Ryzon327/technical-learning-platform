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

/**
 * SEARCH-006 — Personal Notes Search Integration.
 *
 * The pure pieces of composing a learner's own private notes into the Search
 * experience. Authorization is NOT here and never will be: the Knowledge and
 * Notes Engine's row level security decides which note rows a caller can read,
 * and Search composes that result rather than re-deciding it.
 *
 * ## Why notes stay out of the shared Search Document
 *
 * SEARCH-006 section 8: private note content "must not be placed into a broadly
 * shared index that relies only on filters for safety." Notes therefore keep
 * their own `NoteSearchResult` contract, `SEARCH_INDEXED_SOURCE_ENGINES` still
 * names only `curriculum`, and private note search is live source-authoritative
 * query composition rather than indexing.
 *
 * ## Vocabulary is never learned from private content
 *
 * Query variants come from SEARCH-005's static, repository-approved
 * normalization and alias vocabulary and from nothing else. One learner's note
 * text can never influence another learner's query interpretation, because note
 * text is never read when variants are built.
 *
 * SEARCH-005B typo recovery is deliberately NOT composed here: its trigger is a
 * zero-result condition, which becomes ambiguous once Search reads two
 * independent sources. That is a cross-source policy decision this Feature does
 * not need and must not establish.
 */

/** The learner-facing name for each Search result group. */
export function describeCurriculumResultGroup(): string {
  return "Curriculum";
}

export function describeNoteResultGroup(): string {
  return "My notes";
}

/** Count wording for the learner's own notes. Never a corpus total. */
export function describeNoteSearchCount(count: number): string {
  if (count === 0) return "No matching notes.";
  return count === 1 ? "1 note." : `${count} notes.`;
}

/**
 * The honest message when the notes source itself failed.
 *
 * SEARCH-006 section 12 requires curriculum search stay available and that a
 * failure never be reported as a successful empty result. This says the search
 * could not run — it never claims the learner has no notes — and points at the
 * workspace where those notes remain reachable.
 */
export function describeNoteSearchUnavailable(): string {
  return "Your notes could not be searched right now. They are unchanged and still available in your notes workspace.";
}

/**
 * Fields a note search result must never carry to a learner.
 *
 * Held as data so tests and the verifier assert the prohibition directly. A
 * note result exposes only what its own owner may already see.
 */
export const NOTE_SEARCH_FORBIDDEN_FIELDS: readonly string[] = [
  "userId",
  "user_id",
  "ownerId",
  "owner_id",
  "studentId",
  "learnerId",
  "acl",
  "permissions",
  "policy",
  "hiddenCount",
  "withheldCount",
  "unauthorizedCount",
  "otherUserCount"
];

/**
 * Request fields that must never select whose notes are searched.
 *
 * Identity comes from the authenticated session alone. Accepting any of these
 * would create a second ownership mechanism beside row level security.
 */
export const NOTE_SEARCH_FORBIDDEN_REQUEST_FIELDS: readonly string[] = [
  "userId",
  "ownerId",
  "studentId",
  "learnerId"
];
