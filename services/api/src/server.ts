import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  AppError,
  type CurriculumPublicationState
} from "@tlp/shared-types";
import { resolveTrustedRequestIdentity } from "./auth-context";
import { requireFounderAdmin } from "./authorization";
import { loadRuntimeConfig, validateRuntimeConfig } from "./config";
import {
  createDraftLearningPath,
  transitionLearningPathState,
  updateDraftLearningPath,
  validateLearningPathForPublication
} from "./curriculum-admin";
import {
  getPublishedLearningPathTree,
  listPublishedLearningPaths
} from "./curriculum";
import { getApiHealthDetails } from "./health";
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
    case "VALIDATION_ERROR":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "DEPENDENCY_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}

function asPublicationState(value: unknown): CurriculumPublicationState {
  if (
    value === "draft" ||
    value === "review" ||
    value === "published" ||
    value === "retired"
  ) {
    return value;
  }

  throw new AppError({
    code: "VALIDATION_ERROR",
    message: "Invalid publication state",
    retryable: false
  });
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
      sendJson(response, 200, {
        identity: trusted.identity,
        profile: trusted.profile
      });
      return;
    }

    if (request.method === "GET" && pathname === "/curriculum/paths") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        learningPaths: await listPublishedLearningPaths(
          trusted.accessToken
        )
      });
      return;
    }

    if (
      request.method === "GET" &&
      pathname.startsWith("/curriculum/paths/")
    ) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const stableId = decodeURIComponent(
        pathname.slice("/curriculum/paths/".length)
      );

      if (!stableId) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Learning path stable ID is required",
          retryable: false
        });
      }

      sendJson(
        response,
        200,
        await getPublishedLearningPathTree(
          trusted.accessToken,
          stableId
        )
      );
      return;
    }

    if (
      request.method === "POST" &&
      pathname === "/admin/curriculum/learning-paths"
    ) {
      const trusted = requireFounderAdmin(
        await resolveTrustedRequestIdentity(request)
      );
      const body = await readJsonBody(request);

      const learningPath = await createDraftLearningPath(
        { actorUserId: trusted.identity.userId },
        {
          stableId: String(body.stableId ?? ""),
          title: String(body.title ?? ""),
          description:
            body.description === undefined
              ? undefined
              : String(body.description),
          estimatedMinutes:
            body.estimatedMinutes === undefined
              ? undefined
              : Number(body.estimatedMinutes)
        }
      );

      sendJson(response, 201, { learningPath });
      return;
    }

    const learningPathEditMatch = pathname.match(
      /^\/admin\/curriculum\/learning-paths\/([^/]+)$/
    );

    if (
      request.method === "PATCH" &&
      learningPathEditMatch
    ) {
      const trusted = requireFounderAdmin(
        await resolveTrustedRequestIdentity(request)
      );
      const body = await readJsonBody(request);
      const id = decodeURIComponent(learningPathEditMatch[1] ?? "");

      const learningPath = await updateDraftLearningPath(
        { actorUserId: trusted.identity.userId },
        id,
        {
          title:
            body.title === undefined ? undefined : String(body.title),
          description:
            body.description === undefined
              ? undefined
              : body.description === null
                ? null
                : String(body.description),
          estimatedMinutes:
            body.estimatedMinutes === undefined
              ? undefined
              : body.estimatedMinutes === null
                ? null
                : Number(body.estimatedMinutes)
        }
      );

      sendJson(response, 200, { learningPath });
      return;
    }

    const validationMatch = pathname.match(
      /^\/admin\/curriculum\/learning-paths\/([^/]+)\/validate$/
    );

    if (
      request.method === "POST" &&
      validationMatch
    ) {
      requireFounderAdmin(
        await resolveTrustedRequestIdentity(request)
      );
      const id = decodeURIComponent(validationMatch[1] ?? "");

      sendJson(
        response,
        200,
        await validateLearningPathForPublication(id)
      );
      return;
    }

    const transitionMatch = pathname.match(
      /^\/admin\/curriculum\/learning-paths\/([^/]+)\/transition$/
    );

    if (
      request.method === "POST" &&
      transitionMatch
    ) {
      const trusted = requireFounderAdmin(
        await resolveTrustedRequestIdentity(request)
      );
      const id = decodeURIComponent(transitionMatch[1] ?? "");
      const body = await readJsonBody(request);

      const learningPath = await transitionLearningPathState(
        { actorUserId: trusted.identity.userId },
        id,
        asPublicationState(body.to),
        body.reason === undefined ? undefined : String(body.reason)
      );

      sendJson(response, 200, { learningPath });
      return;
    }

    if (request.method === "GET" && pathname === "/admin/ping") {
      const trusted = requireFounderAdmin(
        await resolveTrustedRequestIdentity(request)
      );

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
        ? new AppError({
            ...error.toJSON(),
            correlationId:
              error.correlationId ?? context.correlationId
          })
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

    sendJson(response, statusCode, {
      error: normalized.toJSON()
    });
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

server.listen(config.apiPort, "127.0.0.1", () => {
  log("info", "API server started", {
    event: "api.started",
    metadata: {
      host: "127.0.0.1",
      port: config.apiPort,
      environment: config.appEnv,
      version: "0.1.0"
    }
  });
});

function shutdown(signal: string): void {
  log("info", "API server shutdown requested", {
    event: "api.shutdown.requested",
    metadata: { signal }
  });

  server.close((error) => {
    if (error) {
      log("error", "API server shutdown failed", {
        event: "api.shutdown.failed",
        metadata: { message: error.message }
      });
      process.exitCode = 1;
      return;
    }

    log("info", "API server stopped", {
      event: "api.stopped"
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
