import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  AppError,
  type CurriculumPublicationState
} from "@tlp/shared-types";
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

    if (request.method === "GET" && pathname === "/auth/me") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { identity: trusted.identity, profile: trusted.profile });
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
