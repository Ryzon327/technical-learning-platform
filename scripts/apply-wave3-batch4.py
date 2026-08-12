#!/usr/bin/env python3
from pathlib import Path

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")

index = ROOT / "packages/shared-types/src/index.ts"
text = index.read_text()
export_line = 'export * from "./learning-guidance";'
if export_line not in text:
    anchor = 'export * from "./competency";'
    if anchor not in text:
        raise SystemExit("Unable to find competency export anchor.")
    index.write_text(text.replace(anchor, anchor + "\n" + export_line))
    print("UPDATED: packages/shared-types/src/index.ts")

server = ROOT / "services/api/src/server.ts"
text = server.read_text()

import_block = '''import {
  getRecommendedNextAction,
  listLearningHistory,
  listReviewState
} from "./learning-guidance";
'''

if 'from "./learning-guidance";' not in text:
    anchor = 'import { getApiHealthDetails } from "./health";\n'
    if anchor not in text:
        raise SystemExit("Unable to find API import anchor.")
    text = text.replace(anchor, anchor + import_block)

route_anchor = '    if (request.method === "GET" && pathname === "/learning/competencies") {'
if 'pathname === "/learning/next-action"' not in text:
    if route_anchor not in text:
        raise SystemExit("Unable to find Learning guidance route anchor.")

    routes = '''    if (request.method === "GET" && pathname === "/learning/next-action") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const pathStableId = url.searchParams.get("path") ?? "";

      sendJson(
        response,
        200,
        await getRecommendedNextAction(
          trusted.accessToken,
          pathStableId
        )
      );
      return;
    }

    if (request.method === "GET" && pathname === "/learning/history") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const requestedLimit = Number(url.searchParams.get("limit") ?? "100");

      sendJson(
        response,
        200,
        await listLearningHistory(
          trusted.accessToken,
          Number.isFinite(requestedLimit) ? requestedLimit : 100
        )
      );
      return;
    }

    if (request.method === "GET" && pathname === "/learning/review") {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(
        response,
        200,
        await listReviewState(trusted.accessToken)
      );
      return;
    }

'''
    text = text.replace(route_anchor, routes + route_anchor)

server.write_text(text)
print("UPDATED: services/api/src/server.ts")
