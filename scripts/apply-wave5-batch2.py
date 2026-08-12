#!/usr/bin/env python3
from pathlib import Path
ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")

p = ROOT / "packages/shared-types/src/index.ts"
t = p.read_text()
if 'export * from "./note-blocks";' not in t:
    anchor = 'export * from "./notes";'
    if anchor not in t: raise SystemExit("notes export anchor missing")
    p.write_text(t.replace(anchor, anchor + '\nexport * from "./note-blocks";', 1))
    print("UPDATED: packages/shared-types/src/index.ts")

p = ROOT / "services/api/src/server.ts"
t = p.read_text()
import_line = 'import { createStudentTag, deleteStudentTag, listNoteBlocks, listStudentTags, renameStudentTag, replaceNoteBlocks, replaceNoteTags, setNotePinned } from "./note-organization";\n'
import_anchor = 'import { createStudentNote, deleteStudentNote, getStudentNote, listStudentNotes, updateStudentNote } from "./notes";\n'
if import_line not in t:
    if import_anchor not in t: raise SystemExit("notes import anchor missing")
    t = t.replace(import_anchor, import_anchor + import_line, 1)

if 'pathname === "/note-tags"' not in t:
    anchor = '    if (request.method === "GET" && pathname === "/notes") {'
    if anchor not in t: raise SystemExit("notes route anchor missing")
    route_lines = [
        '    if (request.method === "GET" && pathname === "/note-tags") {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      sendJson(response, 200, { tags: await listStudentTags(trusted.accessToken) });',
        '      return;',
        '    }',
        '',
        '    if (request.method === "POST" && pathname === "/note-tags") {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      const body = await readJsonBody(request);',
        '      sendJson(response, 201, { tag: await createStudentTag(trusted.accessToken, body.name) });',
        '      return;',
        '    }',
        '',
        '    const noteTagMatch = pathname.match(/^\\/note-tags\\/([^/]+)$/);',
        '    if (request.method === "PUT" && noteTagMatch) {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      const body = await readJsonBody(request);',
        '      sendJson(response, 200, { tag: await renameStudentTag(trusted.accessToken, decodeURIComponent(noteTagMatch[1] ?? ""), body.name) });',
        '      return;',
        '    }',
        '    if (request.method === "DELETE" && noteTagMatch) {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      await deleteStudentTag(trusted.accessToken, decodeURIComponent(noteTagMatch[1] ?? ""));',
        '      sendJson(response, 200, { deleted: true });',
        '      return;',
        '    }',
        '',
        '    const noteBlocksMatch = pathname.match(/^\\/notes\\/([^/]+)\\/blocks$/);',
        '    if (request.method === "GET" && noteBlocksMatch) {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      sendJson(response, 200, { blocks: await listNoteBlocks(trusted.accessToken, decodeURIComponent(noteBlocksMatch[1] ?? "")) });',
        '      return;',
        '    }',
        '    if (request.method === "PUT" && noteBlocksMatch) {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      const body = await readJsonBody(request);',
        '      sendJson(response, 200, { blocks: await replaceNoteBlocks(trusted.accessToken, decodeURIComponent(noteBlocksMatch[1] ?? ""), Array.isArray(body.blocks) ? body.blocks : []) });',
        '      return;',
        '    }',
        '',
        '    const noteTagsMatch = pathname.match(/^\\/notes\\/([^/]+)\\/tags$/);',
        '    if (request.method === "PUT" && noteTagsMatch) {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      const body = await readJsonBody(request);',
        '      sendJson(response, 200, { tagIds: await replaceNoteTags(trusted.accessToken, decodeURIComponent(noteTagsMatch[1] ?? ""), Array.isArray(body.tagIds) ? body.tagIds : []) });',
        '      return;',
        '    }',
        '',
        '    const notePinnedMatch = pathname.match(/^\\/notes\\/([^/]+)\\/pinned$/);',
        '    if (request.method === "PUT" && notePinnedMatch) {',
        '      const trusted = await resolveTrustedRequestIdentity(request);',
        '      const body = await readJsonBody(request);',
        '      sendJson(response, 200, { pinned: await setNotePinned(trusted.accessToken, decodeURIComponent(notePinnedMatch[1] ?? ""), Boolean(body.pinned)) });',
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
line = "- `20260812000600_note_blocks_tags_organization.sql` — technical note blocks, lightweight tags, assignments, and pinned notes."
if "20260812000600_note_blocks_tags_organization.sql" not in t:
    p.write_text(t.rstrip() + "\n" + line + "\n")
    print("UPDATED: supabase/README.md")
