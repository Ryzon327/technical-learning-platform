#!/usr/bin/env python3
from pathlib import Path
ROOT=Path("/Users/demetrius/Projects/technical-learning-platform")
p=ROOT/"packages/shared-types/src/index.ts";t=p.read_text()
if 'export * from "./notes";' not in t:
 t=t.replace('export * from "./assessment";','export * from "./assessment";\nexport * from "./notes";',1);p.write_text(t);print("UPDATED: packages/shared-types/src/index.ts")
p=ROOT/"services/api/src/server.ts";t=p.read_text()
imp='import { createStudentNote, deleteStudentNote, getStudentNote, listStudentNotes, updateStudentNote } from "./notes";\n'
anchor='import { createRequestContext } from "./request-context";\n'
if imp not in t:
 if anchor not in t: raise SystemExit("server import anchor missing")
 t=t.replace(anchor,anchor+imp,1)
marker='    const noteMatch = pathname.match(/^\\/notes\\/([^/]+)$/);'
if marker not in t:
 anchor='    if (request.method === "GET" && pathname === "/auth/me") {'
 route='''    if (request.method === "GET" && pathname === "/notes") { const trusted=await resolveTrustedRequestIdentity(request); sendJson(response,200,{notes:await listStudentNotes(trusted.accessToken)}); return; }
    if (request.method === "POST" && pathname === "/notes") { const trusted=await resolveTrustedRequestIdentity(request); const body=await readJsonBody(request); sendJson(response,201,{note:await createStudentNote(trusted.accessToken,body)}); return; }
    const noteMatch = pathname.match(/^\\/notes\\/([^/]+)$/);
    if (request.method === "GET" && noteMatch) { const trusted=await resolveTrustedRequestIdentity(request); sendJson(response,200,{note:await getStudentNote(trusted.accessToken,decodeURIComponent(noteMatch[1]??""))}); return; }
    if (request.method === "PUT" && noteMatch) { const trusted=await resolveTrustedRequestIdentity(request); const body=await readJsonBody(request); sendJson(response,200,{note:await updateStudentNote(trusted.accessToken,decodeURIComponent(noteMatch[1]??""),body)}); return; }
    if (request.method === "DELETE" && noteMatch) { const trusted=await resolveTrustedRequestIdentity(request); await deleteStudentNote(trusted.accessToken,decodeURIComponent(noteMatch[1]??"")); sendJson(response,200,{deleted:true}); return; }

'''
 if anchor not in t: raise SystemExit("server route anchor missing")
 t=t.replace(anchor,route+anchor,1)
p.write_text(t);print("UPDATED: services/api/src/server.ts")
p=ROOT/"supabase/README.md";t=p.read_text()
if "20260812000500_student_notes_foundation.sql" not in t:
 p.write_text(t.rstrip()+"\n- `20260812000500_student_notes_foundation.sql` — private student notes and stable learning-context references with RLS ownership.\n");print("UPDATED: supabase/README.md")
