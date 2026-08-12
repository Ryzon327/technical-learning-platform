export type LabAutomationHealthState = "healthy" | "degraded" | "unavailable";

export interface LabProviderOperationalSnapshot {
  providerId: string;
  healthState: LabAutomationHealthState;
  healthDetail?: string;
  capacityAvailable: boolean;
  activeSessions: number;
  maximumSessions: number;
  checkedAt: string;
}

export interface LabAutomationCycleResult {
  startedAt: string;
  completedAt: string;
  providerId: string;
  healthState: LabAutomationHealthState;
  capacityAvailable: boolean;
  sessionsExpired: number;
  queuedSessionsProvisioned: number;
  queuedSessionsFailed: number;
  cleanupOperationsProcessed: number;
}

export function shouldProvisionQueuedSession(
  healthState: LabAutomationHealthState,
  capacityAvailable: boolean
): boolean {
  return healthState === "healthy" && capacityAvailable;
}
