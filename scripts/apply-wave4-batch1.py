#!/usr/bin/env python3
from pathlib import Path


def ensure_once(path: str, needle: str, insertion: str, anchor: str) -> None:
    p = Path(path)
    text = p.read_text()
    if needle in text:
        print(f"UNCHANGED: {path}")
        return
    if anchor not in text:
        raise SystemExit(f"Anchor not found in {path}: {anchor!r}")
    p.write_text(text.replace(anchor, insertion + anchor, 1))
    print(f"UPDATED: {path}")

ensure_once(
    "packages/shared-types/src/index.ts",
    'export * from "./assessment";',
    'export * from "./assessment";\n',
    'export * from "./errors";'
)

ensure_once(
    "services/api/src/server.ts",
    'from "./assessments";',
    'import { listPublishedAssessments } from "./assessments";\n',
    'import { resolveTrustedRequestIdentity } from "./auth-context";'
)

route = '''    if (request.method === "GET" && pathname === "/assessments") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        assessments: await listPublishedAssessments(trusted.accessToken)
      });
      return;
    }

'''
ensure_once(
    "services/api/src/server.ts",
    'pathname === "/assessments"',
    route,
    '    if (request.method === "GET" && pathname === "/curriculum/paths") {'
)
