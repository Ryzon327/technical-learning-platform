export type LabSessionState =
  | "requested" | "queued" | "provisioning" | "ready" | "active"
  | "validating" | "completed" | "cleaning" | "terminated"
  | "provisioning_failed" | "degraded" | "recovery_required"
  | "expired" | "cleanup_failed";

export type LabCleanupState =
  | "not_required" | "pending" | "cleaning" | "complete" | "failed";

export interface LabSession {
  id: string;
  labDefinitionStableId: string;
  labDefinitionVersion: number;
  providerId?: string;
  state: LabSessionState;
  stateLabel: string;
  requestedAt: string;
  readyAt?: string;
  activeAt?: string;
  lastActivityAt?: string;
  expiresAt?: string;
  validationStateReference?: string;
  cleanupState: LabCleanupState;
  failureCode?: string;
  failureMessage?: string;
  connectionMetadataReference?: string;
}

export interface RequestLabSessionInput {
  labDefinitionStableId: string;
  labDefinitionVersion?: number;
}

const transitions: Record<LabSessionState, readonly LabSessionState[]> = {
  requested: ["queued","provisioning","provisioning_failed","terminated"],
  queued: ["provisioning","expired","terminated"],
  provisioning: ["ready","provisioning_failed","recovery_required","cleaning"],
  ready: ["active","degraded","expired","cleaning"],
  active: ["validating","completed","degraded","expired","cleaning"],
  validating: ["active","completed","degraded","recovery_required","expired"],
  completed: ["cleaning","terminated"],
  cleaning: ["terminated","cleanup_failed"],
  terminated: [],
  provisioning_failed: ["provisioning","cleaning","terminated"],
  degraded: ["active","recovery_required","expired","cleaning"],
  recovery_required: ["provisioning","cleaning","terminated"],
  expired: ["cleaning","terminated"],
  cleanup_failed: ["cleaning","recovery_required"]
};

export function isLabSessionTransitionAllowed(from: LabSessionState, to: LabSessionState): boolean {
  return transitions[from].includes(to);
}

export function assertLabSessionTransition(from: LabSessionState, to: LabSessionState): void {
  if (!isLabSessionTransitionAllowed(from, to)) {
    throw new Error(`Invalid lab session transition: ${from} -> ${to}`);
  }
}

export function labSessionStateLabel(state: LabSessionState): string {
  const labels: Record<LabSessionState,string> = {
    requested:"Requested", queued:"Waiting for capacity", provisioning:"Preparing lab",
    ready:"Ready", active:"Active", validating:"Checking lab", completed:"Completed",
    cleaning:"Cleaning up", terminated:"Ended",
    provisioning_failed:"Lab preparation failed", degraded:"Lab has a problem",
    recovery_required:"Recovery required", expired:"Lab resources expired",
    cleanup_failed:"Cleanup needs attention"
  };
  return labels[state];
}
