from pathlib import Path

def append_once(path, marker, addition):
    p=Path(path); t=p.read_text()
    if marker not in t:
        p.write_text(t.rstrip()+"\n"+addition+"\n"); print(f"UPDATED: {path}")

append_once("packages/shared-types/src/index.ts", 'export * from "./labs";', 'export * from "./labs";')
append_once("supabase/README.md", '20260812000800_lab_definition_foundation.sql', '- `20260812000800_lab_definition_foundation.sql` — provider-independent Lab Definition foundation; student reads are limited to published definitions and no student write policy is granted.')

p=Path("services/api/src/server.ts"); t=p.read_text()
imp='import { mockLabProvider } from "./mock-lab-provider";'
if imp not in t:
    anchor='import { buildStudentNoteExport, serializeStudentNoteExport } from "./note-export";'
    if anchor not in t: raise SystemExit("ERROR: server import anchor missing")
    t=t.replace(anchor,anchor+"\n"+imp,1)
route='''    if (request.method === "GET" && pathname === "/lab-providers/mock/capabilities") {
      await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { capabilities: await mockLabProvider.getCapabilities(), capacity: await mockLabProvider.getCapacity() });
      return;
    }

'''
if 'pathname === "/lab-providers/mock/capabilities"' not in t:
    anchor='    const noteExportMatch = pathname.match(/^\\/notes\\/([^/]+)\\/export$/);'
    if anchor not in t: raise SystemExit("ERROR: server route anchor missing")
    t=t.replace(anchor,route+anchor,1)
p.write_text(t); print("UPDATED: services/api/src/server.ts")
