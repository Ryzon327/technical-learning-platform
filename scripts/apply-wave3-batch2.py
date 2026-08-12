#!/usr/bin/env python3
from pathlib import Path

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")

index = ROOT / "packages/shared-types/src/index.ts"
text = index.read_text()
export_line = 'export * from "./learning-navigation";'
if export_line not in text:
    anchor = 'export * from "./learning";'
    if anchor not in text:
        raise SystemExit("Unable to find Learning export anchor.")
    index.write_text(text.replace(anchor, anchor + "\n" + export_line))
    print("UPDATED: packages/shared-types/src/index.ts")

progress = ROOT / "services/api/src/learning-progress.ts"
text = progress.read_text()
nav_import = 'import { evaluateMissionPrerequisites } from "./learning-navigation";'
if nav_import not in text:
    anchor = 'import { createUserScopedSupabaseClient } from "./supabase";'
    if anchor not in text:
        raise SystemExit("Unable to find learning-progress import anchor.")
    text = text.replace(anchor, anchor + "\n" + nav_import)

guard_anchor = '''  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase.rpc(
    "record_mission_progress",
'''
if 'Prerequisites are not yet satisfied' not in text:
    if guard_anchor not in text:
        raise SystemExit("Unable to find learning progress RPC anchor.")
    guard = '''  const prerequisiteEvaluation =
    await evaluateMissionPrerequisites(accessToken, stableId);

  if (prerequisiteEvaluation.state === "temporarily_unavailable") {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: prerequisiteEvaluation.explanation,
      retryable: true
    });
  }

  if (!prerequisiteEvaluation.allowed) {
    throw new AppError({
      code: "CONFLICT",
      message: "Prerequisites are not yet satisfied",
      retryable: false,
      details: { prerequisiteEvaluation }
    });
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase.rpc(
    "record_mission_progress",
'''
    text = text.replace(guard_anchor, guard)

progress.write_text(text)
print("UPDATED: services/api/src/learning-progress.ts")

server = ROOT / "services/api/src/server.ts"
text = server.read_text()
nav_import_block = '''import {
  evaluateMissionPrerequisites,
  getResumeTarget
} from "./learning-navigation";
'''
if 'from "./learning-navigation";' not in text:
    anchor = '} from "./learning-progress";\n'
    if anchor not in text:
        raise SystemExit("Unable to find Learning server import anchor.")
    text = text.replace(anchor, anchor + nav_import_block)

route_anchor = '    if (request.method === "GET" && pathname === "/learning/progress") {'
if 'pathname === "/learning/resume"' not in text:
    if route_anchor not in text:
        raise SystemExit("Unable to find Learning route anchor.")
    routes = '''    if (request.method === "GET" && pathname === "/learning/resume") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const pathStableId = url.searchParams.get("path") ?? "";
      sendJson(
        response,
        200,
        await getResumeTarget(trusted.accessToken, pathStableId)
      );
      return;
    }

    const missionAccessMatch = pathname.match(
      /^\/learning\/missions\/([^/]+)\/access$/
    );

    if (request.method === "GET" && missionAccessMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const missionStableId = decodeURIComponent(
        missionAccessMatch[1] ?? ""
      );

      sendJson(
        response,
        200,
        await evaluateMissionPrerequisites(
          trusted.accessToken,
          missionStableId
        )
      );
      return;
    }

'''
    text = text.replace(route_anchor, routes + route_anchor)

server.write_text(text)
print("UPDATED: services/api/src/server.ts")
