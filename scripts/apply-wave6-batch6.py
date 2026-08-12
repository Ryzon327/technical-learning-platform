from pathlib import Path

def append_once(path: str, marker: str, addition: str) -> None:
    p = Path(path)
    text = p.read_text()
    if marker not in text:
        p.write_text(text.rstrip() + "\n" + addition + "\n")
        print(f"UPDATED: {path}")

append_once("packages/shared-types/src/index.ts", 'export * from "./lab-provider";', 'export * from "./lab-provider";')
append_once("supabase/README.md", "20260812001300_lab_container_provider_foundation.sql", "- `20260812001300_lab_container_provider_foundation.sql` — provider registry and disabled-by-default Container Provider foundation.")

p = Path("services/api/src/server.ts")
text = p.read_text()
import_line = 'import { sendLabProviderCatalog } from "./lab-provider-routes";'
if import_line not in text:
    anchor = 'import { mockLabProvider } from "./mock-lab-provider";'
    if anchor not in text:
        raise SystemExit("ERROR: mock provider import anchor missing")
    text = text.replace(anchor, anchor + "\n" + import_line, 1)

if 'pathname === "/lab-providers"' not in text:
    anchor = '    if (request.method === "GET" && pathname === "/lab-providers/mock/capabilities") {'
    if anchor not in text:
        raise SystemExit("ERROR: provider route anchor missing")
    route = '''    if (request.method === "GET" && pathname === "/lab-providers") {
      await resolveTrustedRequestIdentity(request);
      await sendLabProviderCatalog(response);
      return;
    }

'''
    text = text.replace(anchor, route + anchor, 1)

p.write_text(text)
print("UPDATED: services/api/src/server.ts")
