#!/usr/bin/env python3
from pathlib import Path

def add_after(path, anchor, line):
    p = Path(path)
    t = p.read_text()
    if line in t:
        print(f"UNCHANGED: {path}")
        return
    if anchor not in t:
        raise SystemExit(f"Anchor missing in {path}: {anchor}")
    p.write_text(t.replace(anchor, anchor + "\n" + line, 1))
    print(f"UPDATED: {path}")

add_after("packages/shared-types/src/index.ts", 'export * from "./readiness";', 'export * from "./assessment-recovery";')

p = Path("services/api/src/assessment-attempts.ts")
t = p.read_text()
imp = 'import { buildAssessmentEvidenceHandoff } from "./assessment-recovery";'
anchor = 'import { processReadinessAssessmentOutcome } from "./readiness";'
if imp not in t:
    if anchor not in t: raise SystemExit("Readiness import anchor missing.")
    t = t.replace(anchor, anchor + "\n" + imp, 1)
call = "  await buildAssessmentEvidenceHandoff(\n    { userId: student.userId },\n    attemptId\n  );\n\n"
if "await buildAssessmentEvidenceHandoff(" not in t:
    anchor2 = "  await processReadinessAssessmentOutcome(\n    { userId: student.userId },\n    attemptId\n  );\n\n"
    if anchor2 not in t: raise SystemExit("Readiness submit anchor missing.")
    t = t.replace(anchor2, anchor2 + call, 1)
p.write_text(t)
print("UPDATED: services/api/src/assessment-attempts.ts")

p = Path("services/api/src/server.ts")
t = p.read_text()
impblock = 'import { interruptAssessmentAttempt, resumeInterruptedAssessmentAttempt } from "./assessment-recovery";'
anchor = 'import { getReadinessAssessmentOutcome } from "./readiness";'
if impblock not in t:
    if anchor not in t: raise SystemExit("Server readiness import anchor missing.")
    t = t.replace(anchor, anchor + "\n" + impblock, 1)
if "assessmentInterruptMatch" not in t:
    routes = "    const assessmentInterruptMatch = pathname.match(new RegExp(\"^/assessment-attempts/([^/]+)/interrupt$\"));\n\n    if (request.method === \"POST\" && assessmentInterruptMatch) {\n      const trusted = await resolveTrustedRequestIdentity(request);\n      const body = await readJsonBody(request);\n      sendJson(response, 200, { recovery: await interruptAssessmentAttempt({ userId: trusted.identity.userId }, decodeURIComponent(assessmentInterruptMatch[1] ?? \"\"), String(body.reason ?? \"unknown\")) });\n      return;\n    }\n\n    const assessmentResumeMatch = pathname.match(new RegExp(\"^/assessment-attempts/([^/]+)/resume$\"));\n\n    if (request.method === \"POST\" && assessmentResumeMatch) {\n      const trusted = await resolveTrustedRequestIdentity(request);\n      sendJson(response, 200, { recovery: await resumeInterruptedAssessmentAttempt({ userId: trusted.identity.userId }, decodeURIComponent(assessmentResumeMatch[1] ?? \"\")) });\n      return;\n    }\n\n"
    anchor2 = '    const readinessOutcomeMatch = pathname.match('
    if anchor2 not in t: raise SystemExit("Readiness route anchor missing.")
    t = t.replace(anchor2, routes + anchor2, 1)
p.write_text(t)
print("UPDATED: services/api/src/server.ts")
