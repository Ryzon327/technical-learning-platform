import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AppError } from "@tlp/shared-types";
import { loadRuntimeConfig, validateRuntimeConfig } from "./config";
import { getApiHealthDetails } from "./health";
import { sendJson } from "./http-utils";
import { log } from "./logger";
import { createRequestContext } from "./request-context";

const config = validateRuntimeConfig(loadRuntimeConfig());

function getCorrelationHeader(request: IncomingMessage): string | undefined {
  const value = request.headers["x-correlation-id"];

  if (Array.isArray(value)) return value[0];
  return value;
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
): void {
  const context = createRequestContext(getCorrelationHeader(request));
  const pathname = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`
  ).pathname;

  response.setHeader("x-correlation-id", context.correlationId);
  response.setHeader("x-request-id", context.requestId);

  try {
    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, getApiHealthDetails(), {
        "x-correlation-id": context.correlationId,
        "x-request-id": context.requestId
      });
      return;
    }

    if (request.method === "GET" && pathname === "/ready") {
      sendJson(
        response,
        200,
        {
          ready: true,
          service: "api",
          checkedAt: new Date().toISOString()
        },
        {
          "x-correlation-id": context.correlationId,
          "x-request-id": context.requestId
        }
      );
      return;
    }

    sendJson(
      response,
      404,
      {
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
          retryable: false,
          correlationId: context.correlationId
        }
      },
      {
        "x-correlation-id": context.correlationId,
        "x-request-id": context.requestId
      }
    );
  } catch (error) {
    const normalized =
      error instanceof AppError
        ? error
        : new AppError({
            code: "INTERNAL_ERROR",
            message: "Unexpected server error",
            retryable: false,
            correlationId: context.correlationId
          });

    log("error", "Request failed", {
      correlationId: context.correlationId,
      event: "http.request.failed",
      metadata: {
        requestId: context.requestId,
        method: request.method,
        pathname,
        error: normalized.toJSON()
      }
    });

    sendJson(
      response,
      500,
      { error: normalized.toJSON() },
      {
        "x-correlation-id": context.correlationId,
        "x-request-id": context.requestId
      }
    );
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

const server = createServer(handleRequest);

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
