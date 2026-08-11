import type { IncomingMessage } from "node:http";
import { AppError } from "@tlp/shared-types";

export async function readJsonBody(
  request: IncomingMessage,
  maxBytes = 64 * 1024
): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBytes) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Request body is too large",
        retryable: false
      });
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected object");
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Request body must contain valid JSON",
      retryable: false
    });
  }
}
