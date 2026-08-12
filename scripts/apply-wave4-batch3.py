#!/usr/bin/env python3
from pathlib import Path

def update(path, transform):
    p = Path(path)
    text = p.read_text()
    new = transform(text)
    if new == text:
        print(f"UNCHANGED: {path}")
    else:
        p.write_text(new)
        print(f"UPDATED: {path}")

def shared(text):
    line = 'export * from "./readiness";'
    if line in text: return text
    anchor = 'export * from "./assessment-attempt";'
    if anchor not in text: raise SystemExit("Shared export anchor missing.")
    return text.replace(anchor, anchor + "\\n" + line, 1)

update("packages/shared-types/src/index.ts", shared)

def assessments(text):
    if "testOutEnabled" in text: return text
    text = text.replace("maxAttempts?: number;", "maxAttempts?: number;\\n  testOutEnabled: boolean;", 1)
    text = text.replace('"stable_id,version,title,purpose,passing_percent,max_attempts"', '"stable_id,version,title,purpose,passing_percent,max_attempts,test_out_enabled"', 1)
    text = text.replace(
        "maxAttempts: row.max_attempts == null ? undefined : Number(row.max_attempts)",
        "maxAttempts: row.max_attempts == null ? undefined : Number(row.max_attempts), testOutEnabled: Boolean(row.test_out_enabled)",
        1
    )
    return text

update("services/api/src/assessments.ts", assessments)

def attempts(text):
    imp = 'import { processReadinessAssessmentOutcome } from "./readiness";'
    if imp not in text:
        anchor = 'import { createServerSupabaseClient } from "./supabase";'
        if anchor not in text: raise SystemExit("Attempt import anchor missing.")
        text = text.replace(anchor, anchor + "\\n" + imp, 1)

    call = '''  await processReadinessAssessmentOutcome(
    { userId: student.userId },
    attemptId
  );

'''
    if "await processReadinessAssessmentOutcome(" not in text:
        anchor = "  return getAssessmentAttempt(student, attemptId);\\n"
        pos = text.rfind(anchor)
        if pos < 0: raise SystemExit("Attempt submit anchor missing.")
        text = text[:pos] + call + text[pos:]
    return text

update("services/api/src/assessment-attempts.ts", attempts)

def server(text):
    imp = 'import { getReadinessAssessmentOutcome } from "./readiness";\\n'
    if 'from "./readiness";' not in text:
        anchor = 'import { listPublishedAssessments } from "./assessments";'
        if anchor not in text: raise SystemExit("Server assessment import anchor missing.")
        text = text.replace(anchor, anchor + "\\n" + imp, 1)

    if "readinessOutcomeMatch" in text: return text

    route = '''    const readinessOutcomeMatch = pathname.match(
      new RegExp("^/assessment-attempts/([^/]+)/readiness-outcome$")
    );

    if (request.method === "GET" && readinessOutcomeMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        outcome: await getReadinessAssessmentOutcome(
          { userId: trusted.identity.userId },
          decodeURIComponent(readinessOutcomeMatch[1] ?? "")
        )
      });
      return;
    }

'''
    anchor = '    const attemptMatch = pathname.match('
    if anchor not in text: raise SystemExit("Server attempt route anchor missing.")
    return text.replace(anchor, route + anchor, 1)

update("services/api/src/server.ts", server)
