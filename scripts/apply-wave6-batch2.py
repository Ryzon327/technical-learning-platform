from pathlib import Path

def append_once(path, marker, addition):
    p=Path(path); t=p.read_text()
    if marker not in t:
        p.write_text(t.rstrip()+"\n"+addition+"\n")
        print(f"UPDATED: {path}")

append_once("packages/shared-types/src/index.ts", 'export * from "./lab-sessions";', 'export * from "./lab-sessions";')
append_once("supabase/README.md", "20260812000900_lab_session_lifecycle.sql", '- `20260812000900_lab_session_lifecycle.sql` — student-owned Lab Session lifecycle, server-only provider references, expiration metadata, cleanup state, and state-integrity controls.')

p=Path("services/api/src/server.ts")
t=p.read_text()
imp='import { endLabSession, getLabSession, listLabSessions, requestLabSession, startLabSession } from "./lab-sessions";'
if imp not in t:
    anchor='import { mockLabProvider } from "./mock-lab-provider";'
    if anchor not in t:
        raise SystemExit("ERROR: mock lab provider import anchor missing")
    t=t.replace(anchor,anchor+"\n"+imp,1)

if 'pathname === "/lab-sessions"' not in t:
    anchor='    if (request.method === "GET" && pathname === "/lab-providers/mock/capabilities") {'
    if anchor not in t:
        raise SystemExit("ERROR: lab provider route anchor missing")
    routes = """    if (request.method === "GET" && pathname === "/lab-sessions") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { sessions: await listLabSessions(trusted.accessToken) });
      return;
    }

    if (request.method === "POST" && pathname === "/lab-sessions") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, { session: await requestLabSession(trusted.accessToken, trusted.identity.userId, { labDefinitionStableId: String(body.labDefinitionStableId ?? ""), ...(body.labDefinitionVersion === undefined ? {} : { labDefinitionVersion: Number(body.labDefinitionVersion) }) }) });
      return;
    }

    const labSessionMatch = pathname.match(/^\\/lab-sessions\\/([^/]+)$/);
    if (request.method === "GET" && labSessionMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { session: await getLabSession(trusted.accessToken, decodeURIComponent(labSessionMatch[1] ?? "")) });
      return;
    }

    const labSessionStartMatch = pathname.match(/^\\/lab-sessions\\/([^/]+)\\/start$/);
    if (request.method === "POST" && labSessionStartMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { session: await startLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionStartMatch[1] ?? "")) });
      return;
    }

    const labSessionEndMatch = pathname.match(/^\\/lab-sessions\\/([^/]+)\\/end$/);
    if (request.method === "POST" && labSessionEndMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { session: await endLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionEndMatch[1] ?? "")) });
      return;
    }

"""
    t=t.replace(anchor,routes+anchor,1)

p.write_text(t)
print("UPDATED: services/api/src/server.ts")
