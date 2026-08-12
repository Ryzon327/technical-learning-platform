#!/usr/bin/env python3
from pathlib import Path
ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")

p = ROOT / "packages/shared-types/src/index.ts"
t = p.read_text()
if 'export * from "./note-retrieval";' not in t:
    anchor = 'export * from "./note-blocks";'
    if anchor not in t: raise SystemExit("note-blocks export anchor missing")
    p.write_text(t.replace(anchor, anchor + '\nexport * from "./note-retrieval";', 1))
    print("UPDATED: packages/shared-types/src/index.ts")

p = ROOT / "services/api/src/server.ts"
t = p.read_text()
import_line = 'import { createStudentBookmark, deleteStudentBookmark, listStudentBookmarks, searchStudentNotes } from "./note-retrieval";\n'
import_anchor = 'import { createStudentTag, deleteStudentTag, listNoteBlocks, listStudentTags, renameStudentTag, replaceNoteBlocks, replaceNoteTags, setNotePinned } from "./note-organization";\n'
if import_line not in t:
    if import_anchor not in t: raise SystemExit("note organization import anchor missing")
    t = t.replace(import_anchor, import_anchor + import_line, 1)

if 'pathname === "/notes/search"' not in t:
    anchor = '    if (request.method === "GET" && pathname === "/note-tags") {'
    if anchor not in t: raise SystemExit("note-tags route anchor missing")
    route_lines = [
        '    if (request.method === "GET" && pathname === "/notes/search") {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      const tagIds = url.searchParams.getAll("tagId");',
        '      const pinnedValue = url.searchParams.get("pinned");',
        '      sendJson(response, 200, { results: await searchStudentNotes(trusted.accessToken, { query: url.searchParams.get("q") ?? "", tagIds, contextType: url.searchParams.get("contextType") ?? undefined, contextStableId: url.searchParams.get("contextStableId") ?? undefined, pinned: pinnedValue == null ? undefined : pinnedValue === "true", limit: Number(url.searchParams.get("limit") ?? 25) }) });',
        '      return;',
        '    }',
        '',
        '    if (request.method === "GET" && pathname === "/bookmarks") {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      sendJson(response, 200, { bookmarks: await listStudentBookmarks(trusted.accessToken) });',
        '      return;',
        '    }',
        '    if (request.method === "POST" && pathname === "/bookmarks") {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      const body = await readJsonBody(request);',
        '      sendJson(response, 201, { bookmark: await createStudentBookmark(trusted.accessToken, body) });',
        '      return;',
        '    }',
        '    const bookmarkMatch = pathname.match(/^\\/bookmarks\\/([^/]+)$/);',
        '    if (request.method === "DELETE" && bookmarkMatch) {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      await deleteStudentBookmark(trusted.accessToken, decodeURIComponent(bookmarkMatch[1] ?? ""));',
        '      sendJson(response, 200, { deleted: true });',
        '      return;',
        '    }',
        '',
    ]
    routes = "\n".join(route_lines) + "\n"
    t = t.replace(anchor, routes + anchor, 1)
p.write_text(t)
print("UPDATED: services/api/src/server.ts")

p = ROOT / "supabase/README.md"
t = p.read_text()
line = "- `20260812000700_note_retrieval_bookmarks.sql` — private note retrieval indexes and student-owned bookmarks."
if "20260812000700_note_retrieval_bookmarks.sql" not in t:
    p.write_text(t.rstrip() + "\n" + line + "\n")
    print("UPDATED: supabase/README.md")
