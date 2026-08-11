import { randomUUID } from "node:crypto";

export interface RequestContext {
  correlationId: string;
  requestId: string;
  startedAt: number;
}

export function createRequestContext(
  incomingCorrelationId?: string | null
): RequestContext {
  const correlationId =
    incomingCorrelationId?.trim() || randomUUID();

  return {
    correlationId,
    requestId: randomUUID(),
    startedAt: Date.now()
  };
}
