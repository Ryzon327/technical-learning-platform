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
    'export * from "./assessment-attempt";',
    'export * from "./assessment-attempt";\n',
    'export * from "./assessment";'
)

ensure_once(
    "services/api/src/server.ts",
    'from "./assessment-attempts";',
    '''import {
  getAssessmentAttempt,
  saveAssessmentAnswer,
  startAssessmentAttempt,
  submitAssessmentAttempt
} from "./assessment-attempts";
''',
    'import { listPublishedAssessments } from "./assessments";'
)

start_route = '''    const assessmentStartMatch = pathname.match(
      /^\/assessments\/([^/]+)\/attempts$/
    );

    if (request.method === "POST" && assessmentStartMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const stableId = decodeURIComponent(assessmentStartMatch[1] ?? "");

      sendJson(response, 201, {
        attempt: await startAssessmentAttempt(
          { userId: trusted.identity.userId },
          stableId
        )
      });
      return;
    }

    const attemptMatch = pathname.match(
      /^\/assessment-attempts\/([^/]+)$/
    );

    if (request.method === "GET" && attemptMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(response, 200, {
        attempt: await getAssessmentAttempt(
          { userId: trusted.identity.userId },
          decodeURIComponent(attemptMatch[1] ?? "")
        )
      });
      return;
    }

    const answerMatch = pathname.match(
      /^\/assessment-attempts\/([^/]+)\/answers$/
    );

    if (request.method === "PUT" && answerMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);

      await saveAssessmentAnswer(
        { userId: trusted.identity.userId },
        decodeURIComponent(answerMatch[1] ?? ""),
        {
          questionStableId: String(body.questionStableId ?? ""),
          selectedOptionIds: Array.isArray(body.selectedOptionIds)
            ? body.selectedOptionIds.map((value) => String(value))
            : []
        }
      );

      sendJson(response, 200, { saved: true });
      return;
    }

    const submitMatch = pathname.match(
      /^\/assessment-attempts\/([^/]+)\/submit$/
    );

    if (request.method === "POST" && submitMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(response, 200, {
        attempt: await submitAssessmentAttempt(
          { userId: trusted.identity.userId },
          decodeURIComponent(submitMatch[1] ?? "")
        )
      });
      return;
    }

'''

ensure_once(
    "services/api/src/server.ts",
    "assessmentStartMatch",
    start_route,
    '    if (request.method === "GET" && pathname === "/assessments") {'
)
