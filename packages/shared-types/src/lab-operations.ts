export type LabOperationKind = "expire" | "cleanup" | "recover";
export type LabOperationState = "pending" | "running" | "succeeded" | "failed";

export interface LabOperationRecord {
  id: string;
  labSessionId: string;
  kind: LabOperationKind;
  state: LabOperationState;
  attemptCount: number;
  nextAttemptAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LabIsolationAttestation {
  sessionId: string;
  providerId: string;
  isolationMode: string;
  studentHasProviderAdminAccess: false;
  managementPlaneExposed: false;
  networkIsolationEnforced: true;
  resourceOwnershipScoped: true;
  checkedAt: string;
}

export function nextLabOperationDelaySeconds(attemptCount: number): number {
  const boundedAttempt = Math.max(1, Math.min(attemptCount, 5));
  return 30 * Math.pow(2, boundedAttempt - 1);
}

export function canRetryLabOperation(attemptCount: number): boolean {
  return attemptCount < 5;
}
