#!/usr/bin/env python3
from pathlib import Path

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")

index = ROOT / "packages/shared-types/src/index.ts"
text = index.read_text()
export_line = 'export * from "./learning";'

if export_line not in text:
    anchor = 'export * from "./curriculum-quality";'
    if anchor not in text:
        raise SystemExit("Unable to find shared-types curriculum export anchor.")
    text = text.replace(anchor, anchor + "\n" + export_line)
    index.write_text(text)
    print("UPDATED: packages/shared-types/src/index.ts")

server = ROOT / "services/api/src/server.ts"
text = server.read_text()

learning_import = (
    'import {\n'
    '  getLearningPathProgress,\n'
    '  recordMissionProgressAction\n'
    '} from "./learning-progress";\n'
)

if 'from "./learning-progress";' not in text:
    anchor = 'import { getApiHealthDetails } from "./health";\n'
    if anchor not in text:
        raise SystemExit("Unable to find API server import anchor.")
    text = text.replace(anchor, anchor + learning_import)

route_marker = '    if (request.method === "POST" && pathname === "/admin/curriculum/learning-paths") {'

if 'pathname === "/learning/progress"' not in text:
    if route_marker not in text:
        raise SystemExit("Unable to find API route insertion anchor.")

    routes = (
        '    if (request.method === "GET" && pathname === "/learning/progress") {\n'
        '      const trusted = await resolveTrustedRequestIdentity(request);\n'
        '      const pathStableId = url.searchParams.get("path") ?? "";\n\n'
        '      sendJson(\n'
        '        response,\n'
        '        200,\n'
        '        await getLearningPathProgress(\n'
        '          trusted.accessToken,\n'
        '          pathStableId\n'
        '        )\n'
        '      );\n'
        '      return;\n'
        '    }\n\n'
        '    const missionProgressMatch = pathname.match(\n'
        '      /^\\/learning\\/missions\\/([^/]+)\\/(start|complete)$/\n'
        '    );\n\n'
        '    if (request.method === "POST" && missionProgressMatch) {\n'
        '      const trusted = await resolveTrustedRequestIdentity(request);\n'
        '      const missionStableId = decodeURIComponent(\n'
        '        missionProgressMatch[1] ?? ""\n'
        '      );\n'
        '      const action = missionProgressMatch[2];\n\n'
        '      if (action !== "start" && action !== "complete") {\n'
        '        throw new AppError({\n'
        '          code: "VALIDATION_ERROR",\n'
        '          message: "Unsupported mission progress action",\n'
        '          retryable: false\n'
        '        });\n'
        '      }\n\n'
        '      sendJson(response, 200, {\n'
        '        progress: await recordMissionProgressAction(\n'
        '          trusted.accessToken,\n'
        '          missionStableId,\n'
        '          action\n'
        '        )\n'
        '      });\n'
        '      return;\n'
        '    }\n\n'
    )
    text = text.replace(route_marker, routes + route_marker)

server.write_text(text)
print("UPDATED: services/api/src/server.ts")
