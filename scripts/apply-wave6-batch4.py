from pathlib import Path

def append_once(path: str, marker: str, addition: str) -> None:
    p = Path(path)
    text = p.read_text()
    if marker not in text:
        p.write_text(text.rstrip() + "\n" + addition + "\n")
        print(f"UPDATED: {path}")

append_once("packages/shared-types/src/index.ts", 'export * from "./lab-operations";', 'export * from "./lab-operations";')
append_once("supabase/README.md", "20260812001100_lab_isolation_expiration_cleanup.sql", "- `20260812001100_lab_isolation_expiration_cleanup.sql` — bounded Lab operations, cleanup retry scheduling, operational attention view, and student-readable operation history.")

p = Path("services/api/src/server.ts")
text = p.read_text()
imp = 'import { attestLabIsolation, cleanupLabSessionResources, expireLabSession, listLabOperations, recoverLabSession } from "./lab-operations";'
if imp not in text:
    anchor = 'import { getLabAccessDelivery, listLabValidationRuns, resetLabSession, validateLabSession } from "./lab-runtime";'
    if anchor not in text:
        raise SystemExit("ERROR: lab runtime import anchor missing")
    text = text.replace(anchor, anchor + "\n" + imp, 1)

if "labSessionIsolationMatch" not in text:
    anchor = '    if (request.method === "GET" && pathname === "/lab-providers/mock/capabilities") {'
    if anchor not in text:
        raise SystemExit("ERROR: lab provider route anchor missing")
    routes = r'''    const labSessionIsolationMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/isolation$/);
    if (request.method === "GET" && labSessionIsolationMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { isolation: await attestLabIsolation(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionIsolationMatch[1] ?? "")) });
      return;
    }

    const labSessionExpireMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/expire$/);
    if (request.method === "POST" && labSessionExpireMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { operation: await expireLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionExpireMatch[1] ?? "")) });
      return;
    }

    const labSessionCleanupMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/cleanup$/);
    if (request.method === "POST" && labSessionCleanupMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { operation: await cleanupLabSessionResources(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionCleanupMatch[1] ?? "")) });
      return;
    }

    const labSessionRecoverMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/recover$/);
    if (request.method === "POST" && labSessionRecoverMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { operation: await recoverLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionRecoverMatch[1] ?? "")) });
      return;
    }

    const labSessionOperationsMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/operations$/);
    if (request.method === "GET" && labSessionOperationsMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { operations: await listLabOperations(trusted.accessToken, decodeURIComponent(labSessionOperationsMatch[1] ?? "")) });
      return;
    }

'''
    text = text.replace(anchor, routes + anchor, 1)

p.write_text(text)
print("UPDATED: services/api/src/server.ts")

p = Path("services/api/src/mock-lab-provider.ts")
text = p.read_text()
if "getIsolationStatus" not in text:
    anchor = "  async getCapacity()"
    pos = text.find(anchor)
    if pos == -1:
        raise SystemExit("ERROR: Mock Provider capacity anchor missing")
    insertion = '''  async getIsolationStatus(providerSessionId: string): Promise<{\n    studentHasProviderAdminAccess: false;\n    managementPlaneExposed: false;\n    networkIsolationEnforced: true;\n    resourceOwnershipScoped: true;\n  }> {\n    const session = this.sessions.get(providerSessionId);\n    if (!session) {\n      throw new AppError({ code: "NOT_FOUND", message: "Mock provider session not found", retryable: false });\n    }\n    return { studentHasProviderAdminAccess: false, managementPlaneExposed: false, networkIsolationEnforced: true, resourceOwnershipScoped: true };\n  }\n\n'''
    text = text[:pos] + insertion + text[pos:]
p.write_text(text)
print("UPDATED: services/api/src/mock-lab-provider.ts")
