import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  AppError,
  type CurriculumPublicationState
} from "@tlp/shared-types";
import {
  getAssessmentAttempt,
  saveAssessmentAnswer,
  startAssessmentAttempt,
  submitAssessmentAttempt
} from "./assessment-attempts";
import { listPublishedAssessments } from "./assessments";
import { getReadinessAssessmentOutcome } from "./readiness";
import { interruptAssessmentAttempt, resumeInterruptedAssessmentAttempt } from "./assessment-recovery";
import { resolveTrustedRequestIdentity } from "./auth-context";
import { requireFounderAdmin } from "./authorization";
import { loadRuntimeConfig, validateRuntimeConfig } from "./config";
import {
  addCompetencyPrerequisite,
  createDraftCompetency,
  createDraftCourse,
  createDraftLearningPath,
  createDraftMission,
  createDraftModule,
  linkMissionCompetency,
  transitionLearningPathState,
  updateDraftLearningPath,
  validateLearningPathForPublication
} from "./curriculum-admin";
import {
  getPublishedLearningPathTree,
  listPublishedLearningPaths
} from "./curriculum";
import { getApiHealthDetails } from "./health";
import {
  getRecommendedNextAction,
  listLearningHistory,
  listReviewState
} from "./learning-guidance";
import { listStudentCompetencyState } from "./competency";
import {
  getLearningPathProgress,
  recordMissionProgressAction
} from "./learning-progress";
import {
  evaluateMissionPrerequisites,
  getResumeTarget
} from "./learning-navigation";
import { readJsonBody } from "./http-body";
import { sendJson } from "./http-utils";
import { log } from "./logger";
import { createRequestContext } from "./request-context";
import { createStudentNote, deleteStudentNote, getStudentNote, listStudentNotes, updateStudentNote } from "./notes";
import { createStudentTag, deleteStudentTag, listNoteBlocks, listStudentTags, renameStudentTag, replaceNoteBlocks, replaceNoteTags, setNotePinned } from "./note-organization";
import { createStudentBookmark, deleteStudentBookmark, listStudentBookmarks, searchStudentNotes } from "./note-retrieval";
import { buildStudentNoteExport, serializeStudentNoteExport } from "./note-export";
import { mockLabProvider } from "./mock-lab-provider";
import { sendLabProviderCatalog } from "./lab-provider-routes";
import { endLabSession, getLabSession, listLabSessions, requestLabSession, startLabSession } from "./lab-sessions";
import { getLabAccessDelivery, listLabValidationRuns, resetLabSession, validateLabSession } from "./lab-runtime";
import { attestLabIsolation, cleanupLabSessionResources, expireLabSession, listLabOperations, recoverLabSession } from "./lab-operations";
import { getCanonicalEvidenceForStudent, listStudentEvidence } from "./evidence";
import { listCompetencyEvidenceLinks, listEvidenceCompetencyLinks } from "./evidence-competency";

const config = validateRuntimeConfig(loadRuntimeConfig());

function getCorrelationHeader(request: IncomingMessage): string | undefined {
  const value = request.headers["x-correlation-id"];
  if (Array.isArray(value)) return value[0];
  return value;
}

function statusCodeForError(error: AppError): number {
  switch (error.code) {
    case "VALIDATION_ERROR": return 400;
    case "UNAUTHORIZED": return 401;
    case "FORBIDDEN": return 403;
    case "NOT_FOUND": return 404;
    case "CONFLICT": return 409;
    case "RATE_LIMITED": return 429;
    case "DEPENDENCY_UNAVAILABLE": return 503;
    default: return 500;
  }
}

function asPublicationState(value: unknown): CurriculumPublicationState {
  if (
    value === "draft" ||
    value === "review" ||
    value === "published" ||
    value === "retired"
  ) return value;

  throw new AppError({
    code: "VALIDATION_ERROR",
    message: "Invalid publication state",
    retryable: false
  });
}

async function founder(request: IncomingMessage) {
  return requireFounderAdmin(await resolveTrustedRequestIdentity(request));
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const context = createRequestContext(getCorrelationHeader(request));
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`
  );
  const pathname = url.pathname;

  response.setHeader("x-correlation-id", context.correlationId);
  response.setHeader("x-request-id", context.requestId);

  try {
    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, getApiHealthDetails());
      return;
    }

    if (request.method === "GET" && pathname === "/ready") {
      sendJson(response, 200, {
        ready: true,
        service: "api",
        checkedAt: new Date().toISOString()
      });
      return;
    }

    if (request.method === "GET" && pathname === "/lab-sessions") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { sessions: await listLabSessions(trusted.accessToken) });
      return;
    }

    if (request.method === "POST" && pathname === "/lab-sessions") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, { session: await requestLabSession(trusted.accessToken, trusted.identity.userId, { labDefinitionStableId: String(body.labDefinitionStableId ?? ""), ...(body.labDefinitionVersion === undefined ? {} : { labDefinitionVersion: Number(body.labDefinitionVersion) }) }) });
      return;
    }

    const labSessionMatch = pathname.match(/^\/lab-sessions\/([^/]+)$/);
    if (request.method === "GET" && labSessionMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { session: await getLabSession(trusted.accessToken, decodeURIComponent(labSessionMatch[1] ?? "")) });
      return;
    }

    const labSessionStartMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/start$/);
    if (request.method === "POST" && labSessionStartMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { session: await startLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionStartMatch[1] ?? "")) });
      return;
    }

    const labSessionEndMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/end$/);
    if (request.method === "POST" && labSessionEndMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { session: await endLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionEndMatch[1] ?? "")) });
      return;
    }

    const labSessionAccessMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/access$/);
    if (request.method === "GET" && labSessionAccessMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { access: await getLabAccessDelivery(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionAccessMatch[1] ?? "")) });
      return;
    }

    const labSessionResetMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/reset$/);
    if (request.method === "POST" && labSessionResetMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { reset: await resetLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionResetMatch[1] ?? "")) });
      return;
    }

    const labSessionValidateMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/validate$/);
    if (request.method === "POST" && labSessionValidateMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { validation: await validateLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionValidateMatch[1] ?? "")) });
      return;
    }

    const labSessionValidationsMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/validations$/);
    if (request.method === "GET" && labSessionValidationsMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { validations: await listLabValidationRuns(trusted.accessToken, decodeURIComponent(labSessionValidationsMatch[1] ?? "")) });
      return;
    }

    const labSessionIsolationMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/isolation$/);
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

    if (request.method === "GET" && pathname === "/lab-providers") {
      await resolveTrustedRequestIdentity(request);
      await sendLabProviderCatalog(response);
      return;
    }

    if (request.method === "GET" && pathname === "/lab-providers/mock/capabilities") {
      await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { capabilities: await mockLabProvider.getCapabilities(), capacity: await mockLabProvider.getCapacity() });
      return;
    }

    if (request.method === "GET" && pathname === "/evidence") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { evidence: await listStudentEvidence(trusted.accessToken) });
      return;
    }

    const evidenceCompetencyMatch = pathname.match(/^\/evidence\/([^/]+)\/competencies$/);
    if (request.method === "GET" && evidenceCompetencyMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { competencies: await listEvidenceCompetencyLinks(trusted.accessToken, decodeURIComponent(evidenceCompetencyMatch[1] ?? "")) });
      return;
    }

    const competencyEvidenceMatch = pathname.match(/^\/competencies\/([^/]+)\/evidence$/);
    if (request.method === "GET" && competencyEvidenceMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { evidence: await listCompetencyEvidenceLinks(trusted.accessToken, decodeURIComponent(competencyEvidenceMatch[1] ?? "")) });
      return;
    }

    const evidenceRecordMatch = pathname.match(/^\/evidence\/([^/]+)$/);
    if (request.method === "GET" && evidenceRecordMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { evidence: await getCanonicalEvidenceForStudent(trusted.accessToken, decodeURIComponent(evidenceRecordMatch[1] ?? "")) });
      return;
    }

    const noteExportMatch = pathname.match(/^\/notes\/([^/]+)\/export$/);

    if (request.method === "GET" && noteExportMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const noteId = decodeURIComponent(noteExportMatch[1] ?? "");
      const bundle = await buildStudentNoteExport(trusted.accessToken, noteId);
      const serialized = serializeStudentNoteExport(
        bundle,
        url.searchParams.get("format")
      );

      response.statusCode = 200;
      response.setHeader("content-type", serialized.contentType);
      response.setHeader(
        "content-disposition",
        `attachment; filename="note-${noteId}.${serialized.extension}"`
      );
      response.end(serialized.body);
      return;
    }

    if (request.method === "GET" && pathname === "/notes/search") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const tagIds = url.searchParams.getAll("tagId");
      const pinnedValue = url.searchParams.get("pinned");
      sendJson(response, 200, { results: await searchStudentNotes(trusted.accessToken, { query: url.searchParams.get("q") ?? "", tagIds, contextType: url.searchParams.get("contextType") ?? undefined, contextStableId: url.searchParams.get("contextStableId") ?? undefined, pinned: pinnedValue == null ? undefined : pinnedValue === "true", limit: Number(url.searchParams.get("limit") ?? 25) }) });
      return;
    }

    if (request.method === "GET" && pathname === "/bookmarks") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { bookmarks: await listStudentBookmarks(trusted.accessToken) });
      return;
    }
    if (request.method === "POST" && pathname === "/bookmarks") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        bookmark: await createStudentBookmark(trusted.accessToken, {
          targetType: String(body.targetType) as import("@tlp/shared-types").BookmarkTargetType,
          targetStableId: String(body.targetStableId ?? ""),
          ...(body.targetVersion === undefined
            ? {}
            : { targetVersion: Number(body.targetVersion) }),
          ...(body.label === undefined
            ? {}
            : { label: String(body.label) })
        })
      });
      return;
    }
    const bookmarkMatch = pathname.match(/^\/bookmarks\/([^/]+)$/);
    if (request.method === "DELETE" && bookmarkMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      await deleteStudentBookmark(trusted.accessToken, decodeURIComponent(bookmarkMatch[1] ?? ""));
      sendJson(response, 200, { deleted: true });
      return;
    }

    if (request.method === "GET" && pathname === "/note-tags") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { tags: await listStudentTags(trusted.accessToken) });
      return;
    }

    if (request.method === "POST" && pathname === "/note-tags") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, { tag: await createStudentTag(trusted.accessToken, body.name) });
      return;
    }

    const noteTagMatch = pathname.match(/^\/note-tags\/([^/]+)$/);
    if (request.method === "PUT" && noteTagMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { tag: await renameStudentTag(trusted.accessToken, decodeURIComponent(noteTagMatch[1] ?? ""), body.name) });
      return;
    }
    if (request.method === "DELETE" && noteTagMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      await deleteStudentTag(trusted.accessToken, decodeURIComponent(noteTagMatch[1] ?? ""));
      sendJson(response, 200, { deleted: true });
      return;
    }

    const noteBlocksMatch = pathname.match(/^\/notes\/([^/]+)\/blocks$/);
    if (request.method === "GET" && noteBlocksMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { blocks: await listNoteBlocks(trusted.accessToken, decodeURIComponent(noteBlocksMatch[1] ?? "")) });
      return;
    }
    if (request.method === "PUT" && noteBlocksMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { blocks: await replaceNoteBlocks(trusted.accessToken, decodeURIComponent(noteBlocksMatch[1] ?? ""), Array.isArray(body.blocks) ? body.blocks : []) });
      return;
    }

    const noteTagsMatch = pathname.match(/^\/notes\/([^/]+)\/tags$/);
    if (request.method === "PUT" && noteTagsMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { tagIds: await replaceNoteTags(trusted.accessToken, decodeURIComponent(noteTagsMatch[1] ?? ""), Array.isArray(body.tagIds) ? body.tagIds : []) });
      return;
    }

    const notePinnedMatch = pathname.match(/^\/notes\/([^/]+)\/pinned$/);
    if (request.method === "PUT" && notePinnedMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { pinned: await setNotePinned(trusted.accessToken, decodeURIComponent(notePinnedMatch[1] ?? ""), Boolean(body.pinned)) });
      return;
    }

    if (request.method === "GET" && pathname === "/notes") { const trusted=await resolveTrustedRequestIdentity(request); sendJson(response,200,{notes:await listStudentNotes(trusted.accessToken)}); return; }
    if (request.method === "POST" && pathname === "/notes") { const trusted=await resolveTrustedRequestIdentity(request); const body=await readJsonBody(request); sendJson(response,201,{note:await createStudentNote(trusted.accessToken,body)}); return; }
    const noteMatch = pathname.match(/^\/notes\/([^/]+)$/);
    if (request.method === "GET" && noteMatch) { const trusted=await resolveTrustedRequestIdentity(request); sendJson(response,200,{note:await getStudentNote(trusted.accessToken,decodeURIComponent(noteMatch[1]??""))}); return; }
    if (request.method === "PUT" && noteMatch) { const trusted=await resolveTrustedRequestIdentity(request); const body=await readJsonBody(request); sendJson(response,200,{note:await updateStudentNote(trusted.accessToken,decodeURIComponent(noteMatch[1]??""),body)}); return; }
    if (request.method === "DELETE" && noteMatch) { const trusted=await resolveTrustedRequestIdentity(request); await deleteStudentNote(trusted.accessToken,decodeURIComponent(noteMatch[1]??"")); sendJson(response,200,{deleted:true}); return; }

    if (request.method === "GET" && pathname === "/auth/me") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { identity: trusted.identity, profile: trusted.profile });
      return;
    }

    const assessmentStartMatch = pathname.match(
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

    const assessmentInterruptMatch = pathname.match(new RegExp("^/assessment-attempts/([^/]+)/interrupt$"));

    if (request.method === "POST" && assessmentInterruptMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { recovery: await interruptAssessmentAttempt({ userId: trusted.identity.userId }, decodeURIComponent(assessmentInterruptMatch[1] ?? ""), String(body.reason ?? "unknown")) });
      return;
    }

    const assessmentResumeMatch = pathname.match(new RegExp("^/assessment-attempts/([^/]+)/resume$"));

    if (request.method === "POST" && assessmentResumeMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { recovery: await resumeInterruptedAssessmentAttempt({ userId: trusted.identity.userId }, decodeURIComponent(assessmentResumeMatch[1] ?? "")) });
      return;
    }

    const readinessOutcomeMatch = pathname.match(
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

    if (request.method === "GET" && pathname === "/assessments") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        assessments: await listPublishedAssessments(trusted.accessToken)
      });
      return;
    }

    if (request.method === "GET" && pathname === "/curriculum/paths") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        learningPaths: await listPublishedLearningPaths(trusted.accessToken)
      });
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/curriculum/paths/")) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const stableId = decodeURIComponent(pathname.slice("/curriculum/paths/".length));
      sendJson(response, 200, await getPublishedLearningPathTree(trusted.accessToken, stableId));
      return;
    }

    if (request.method === "GET" && pathname === "/learning/next-action") {
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

    if (request.method === "GET" && pathname === "/learning/competencies") {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(
        response,
        200,
        await listStudentCompetencyState(trusted.accessToken)
      );
      return;
    }

    if (request.method === "GET" && pathname === "/learning/resume") {
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

    if (request.method === "GET" && pathname === "/learning/progress") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const pathStableId = url.searchParams.get("path") ?? "";

      sendJson(
        response,
        200,
        await getLearningPathProgress(
          trusted.accessToken,
          pathStableId
        )
      );
      return;
    }

    const missionProgressMatch = pathname.match(
      /^\/learning\/missions\/([^/]+)\/(start|complete)$/
    );

    if (request.method === "POST" && missionProgressMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const missionStableId = decodeURIComponent(
        missionProgressMatch[1] ?? ""
      );
      const action = missionProgressMatch[2];

      if (action !== "start" && action !== "complete") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Unsupported mission progress action",
          retryable: false
        });
      }

      sendJson(response, 200, {
        progress: await recordMissionProgressAction(
          trusted.accessToken,
          missionStableId,
          action
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/learning-paths") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        learningPath: await createDraftLearningPath(
          { actorUserId: trusted.identity.userId },
          {
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/courses") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        course: await createDraftCourse(
          { actorUserId: trusted.identity.userId },
          {
            learningPathId: String(body.learningPathId ?? ""),
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description),
            position: Number(body.position),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/modules") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        module: await createDraftModule(
          { actorUserId: trusted.identity.userId },
          {
            courseId: String(body.courseId ?? ""),
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description),
            position: Number(body.position),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/missions") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        mission: await createDraftMission(
          { actorUserId: trusted.identity.userId },
          {
            moduleId: String(body.moduleId ?? ""),
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description),
            position: Number(body.position),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/competencies") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        competency: await createDraftCompetency(
          { actorUserId: trusted.identity.userId },
          {
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/competency-prerequisites") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      await addCompetencyPrerequisite(
        { actorUserId: trusted.identity.userId },
        String(body.competencyId ?? ""),
        String(body.prerequisiteCompetencyId ?? "")
      );
      sendJson(response, 201, { created: true });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/mission-competencies") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      await linkMissionCompetency(
        { actorUserId: trusted.identity.userId },
        String(body.missionId ?? ""),
        String(body.competencyId ?? ""),
        body.required === undefined ? true : Boolean(body.required)
      );
      sendJson(response, 201, { linked: true });
      return;
    }

    const edit = pathname.match(/^\/admin\/curriculum\/learning-paths\/([^/]+)$/);
    if (request.method === "PATCH" && edit) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        learningPath: await updateDraftLearningPath(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(edit[1] ?? ""),
          {
            title: body.title === undefined ? undefined : String(body.title),
            description: body.description === undefined ? undefined : body.description === null ? null : String(body.description),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : body.estimatedMinutes === null ? null : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    const validate = pathname.match(/^\/admin\/curriculum\/learning-paths\/([^/]+)\/validate$/);
    if (request.method === "POST" && validate) {
      await founder(request);
      sendJson(response, 200, await validateLearningPathForPublication(decodeURIComponent(validate[1] ?? "")));
      return;
    }

    const transition = pathname.match(/^\/admin\/curriculum\/learning-paths\/([^/]+)\/transition$/);
    if (request.method === "POST" && transition) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        learningPath: await transitionLearningPathState(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(transition[1] ?? ""),
          asPublicationState(body.to),
          body.reason === undefined ? undefined : String(body.reason)
        )
      });
      return;
    }

    if (request.method === "GET" && pathname === "/admin/ping") {
      const trusted = await founder(request);
      sendJson(response, 200, {
        authorized: true,
        role: trusted.identity.role,
        mfaVerified: trusted.identity.mfaVerified
      });
      return;
    }

    throw new AppError({
      code: "NOT_FOUND",
      message: "Route not found",
      retryable: false,
      correlationId: context.correlationId
    });
  } catch (error) {
    const normalized =
      error instanceof AppError
        ? new AppError({ ...error.toJSON(), correlationId: error.correlationId ?? context.correlationId })
        : new AppError({
            code: "INTERNAL_ERROR",
            message: "Unexpected server error",
            retryable: false,
            correlationId: context.correlationId
          });

    const statusCode = statusCodeForError(normalized);
    log(statusCode >= 500 ? "error" : "warn", "Request failed", {
      correlationId: context.correlationId,
      event: "http.request.failed",
      metadata: {
        requestId: context.requestId,
        method: request.method,
        pathname,
        statusCode,
        error: normalized.toJSON()
      }
    });

    sendJson(response, statusCode, { error: normalized.toJSON() });
  } finally {
    log("info", "Request completed", {
      correlationId: context.correlationId,
      event: "http.request.completed",
      metadata: {
        requestId: context.requestId,
        method: request.method,
        pathname,
        durationMs: Date.now() - context.startedAt,
        statusCode: response.statusCode
      }
    });
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(config.apiPort, "127.0.0.1");

function shutdown() {
  server.close();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
