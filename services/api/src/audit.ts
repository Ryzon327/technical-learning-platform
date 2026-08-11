import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditOutcome } from "@tlp/shared-types";
import { log } from "./logger";

interface AuditInput {
  eventType: string;
  outcome: AuditOutcome;
  actorId?: string;
  correlationId?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export function createAuditEvent(input: AuditInput): AuditEvent {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    eventType: input.eventType,
    outcome: input.outcome,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}

export function writeAuditEvent(input: AuditInput): AuditEvent {
  const event = createAuditEvent(input);

  log("info", "Audit event", {
    correlationId: event.correlationId,
    event: "audit.event",
    metadata: {
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      eventType: event.eventType,
      outcome: event.outcome,
      ...(event.actorId ? { actorId: event.actorId } : {}),
      ...(event.correlationId ? { correlationId: event.correlationId } : {}),
      ...(event.targetType ? { targetType: event.targetType } : {}),
      ...(event.targetId ? { targetId: event.targetId } : {}),
      ...(event.metadata ? { metadata: event.metadata } : {})
    }
  });

  return event;
}
