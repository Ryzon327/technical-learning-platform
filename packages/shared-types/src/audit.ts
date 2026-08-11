export type AuditOutcome = "success" | "failure" | "denied";

export interface AuditEvent {
  eventId: string;
  occurredAt: string;
  eventType: string;
  actorId?: string;
  correlationId?: string;
  outcome: AuditOutcome;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}
