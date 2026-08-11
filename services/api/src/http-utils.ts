import type { ServerResponse } from "node:http";

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload).toString(),
    "cache-control": "no-store",
    ...headers
  });

  response.end(payload);
}
