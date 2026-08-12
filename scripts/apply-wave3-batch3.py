#!/usr/bin/env python3
from pathlib import Path

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")

index = ROOT / "packages/shared-types/src/index.ts"
text = index.read_text()
export_line = 'export * from "./competency";'
if export_line not in text:
    anchor = 'export * from "./learning-navigation";'
    if anchor not in text:
        raise SystemExit("Unable to find learning-navigation export anchor.")
    index.write_text(text.replace(anchor, anchor + "\n" + export_line))
    print("UPDATED: packages/shared-types/src/index.ts")

server = ROOT / "services/api/src/server.ts"
text = server.read_text()

import_line = 'import { listStudentCompetencyState } from "./competency";\n'
if 'from "./competency";' not in text:
    anchor = 'import { getApiHealthDetails } from "./health";\n'
    if anchor not in text:
        raise SystemExit("Unable to find API import anchor.")
    text = text.replace(anchor, anchor + import_line)

route_anchor = '    if (request.method === "GET" && pathname === "/learning/resume") {'
if 'pathname === "/learning/competencies"' not in text:
    if route_anchor not in text:
        raise SystemExit("Unable to find Learning route anchor.")
    route = '''    if (request.method === "GET" && pathname === "/learning/competencies") {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(
        response,
        200,
        await listStudentCompetencyState(trusted.accessToken)
      );
      return;
    }

'''
    text = text.replace(route_anchor, route + route_anchor)

server.write_text(text)
print("UPDATED: services/api/src/server.ts")
