#!/usr/bin/env python3
from pathlib import Path

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")

p = ROOT / "packages/shared-types/src/index.ts"
t = p.read_text()
if 'export * from "./note-export";' not in t:
    anchor = 'export * from "./note-retrieval";'
    if anchor not in t:
        raise SystemExit("note-retrieval export anchor missing")
    p.write_text(t.replace(anchor, anchor + '\nexport * from "./note-export";', 1))
    print("UPDATED: packages/shared-types/src/index.ts")

p = ROOT / "services/api/src/server.ts"
t = p.read_text()

import_line = 'import { buildStudentNoteExport, serializeStudentNoteExport } from "./note-export";\n'
import_anchor = 'import { createStudentBookmark, deleteStudentBookmark, listStudentBookmarks, searchStudentNotes } from "./note-retrieval";\n'

if import_line not in t:
    if import_anchor not in t:
        raise SystemExit("note retrieval import anchor missing")
    t = t.replace(import_anchor, import_anchor + import_line, 1)

if "noteExportMatch" not in t:
    anchor = '    if (request.method === "GET" && pathname === "/notes/search") {'
    if anchor not in t:
        raise SystemExit("notes search route anchor missing")

    routes = '''    const noteExportMatch = pathname.match(/^\\/notes\\/([^/]+)\\/export$/);

    if (request.method === "GET" && noteExportMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const noteId = decodeURIComponent(noteExportMatch[1] ?? "");
      const bundle = await buildStudentNoteExport(trusted.accessToken, noteId);
      const serialized = serializeStudentNoteExport(
        bundle,
        url.searchParams.get("format")
      );

      response.statusCode = 200;
      response.setHeader("content-type", serialized.contentType);
      response.setHeader(
        "content-disposition",
        `attachment; filename="note-${noteId}.${serialized.extension}"`
      );
      response.end(serialized.body);
      return;
    }

'''
    t = t.replace(anchor, routes + anchor, 1)

p.write_text(t)
print("UPDATED: services/api/src/server.ts")

p = ROOT / "supabase/README.md"
t = p.read_text()
line = "- Wave 5 Batch 4 adds private note export and closure hardening without adding new persistent tables."
if line not in t:
    p.write_text(t.rstrip() + "\n" + line + "\n")
    print("UPDATED: supabase/README.md")
