from pathlib import Path

def append_once(path, marker, addition):
    p=Path(path); t=p.read_text()
    if marker not in t:
        p.write_text(t.rstrip()+"\n"+addition+"\n")
        print(f"UPDATED: {path}")

append_once("packages/shared-types/src/index.ts", 'export * from "./lab-runtime";', 'export * from "./lab-runtime";')
append_once("supabase/README.md", "20260812001000_lab_access_reset_validation.sql", "- `20260812001000_lab_access_reset_validation.sql` — private access delivery support, bounded reset state, deterministic validation checks, runs, and student-readable results.")

p=Path("services/api/src/server.ts"); t=p.read_text()
imp='import { getLabAccessDelivery, listLabValidationRuns, resetLabSession, validateLabSession } from "./lab-runtime";'
if imp not in t:
    anchor='import { endLabSession, getLabSession, listLabSessions, requestLabSession, startLabSession } from "./lab-sessions";'
    if anchor not in t: raise SystemExit("ERROR: lab session import anchor missing")
    t=t.replace(anchor,anchor+"\n"+imp,1)

if "labSessionAccessMatch" not in t:
    anchor='    if (request.method === "GET" && pathname === "/lab-providers/mock/capabilities") {'
    if anchor not in t: raise SystemExit("ERROR: lab provider route anchor missing")
    routes="""    const labSessionAccessMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/access$/);
    if (request.method === "GET" && labSessionAccessMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { access: await getLabAccessDelivery(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionAccessMatch[1] ?? "")) });
      return;
    }

    const labSessionResetMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/reset$/);
    if (request.method === "POST" && labSessionResetMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { reset: await resetLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionResetMatch[1] ?? "")) });
      return;
    }

    const labSessionValidateMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/validate$/);
    if (request.method === "POST" && labSessionValidateMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { validation: await validateLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionValidateMatch[1] ?? "")) });
      return;
    }

    const labSessionValidationsMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/validations$/);
    if (request.method === "GET" && labSessionValidationsMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { validations: await listLabValidationRuns(trusted.accessToken, decodeURIComponent(labSessionValidationsMatch[1] ?? "")) });
      return;
    }

"""
    t=t.replace(anchor,routes+anchor,1)

p.write_text(t); print("UPDATED: services/api/src/server.ts")
