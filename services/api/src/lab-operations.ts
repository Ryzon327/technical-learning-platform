import {
  AppError,
  canRetryLabOperation,
  nextLabOperationDelaySeconds,
  type LabIsolationAttestation,
  type LabOperationKind,
  type LabOperationRecord,
  type LabOperationState,
  type LabSessionState
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { getLabSession } from "./lab-sessions";
import { mockLabProvider } from "./mock-lab-provider";
import { createServerSupabaseClient, createUserScopedSupabaseClient } from "./supabase";

const dependency = (message: string) => new AppError({
  code: "DEPENDENCY_UNAVAILABLE",
  message,
  retryable: true
});

function mapOperation(row: Record<string, unknown>): LabOperationRecord {
  return {
    id: String(row.id),
    labSessionId: String(row.lab_session_id),
    kind: String(row.kind) as LabOperationKind,
    state: String(row.state) as LabOperationState,
    attemptCount: Number(row.attempt_count),
    ...(row.next_attempt_at ? { nextAttemptAt: String(row.next_attempt_at) } : {}),
    ...(row.last_error_code ? { lastErrorCode: String(row.last_error_code) } : {}),
    ...(row.last_error_message ? { lastErrorMessage: String(row.last_error_message) } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

async function getProviderReference(userId: string, sessionId: string) {
  const server = createServerSupabaseClient();
  const { data, error } = await server
    .from("lab_session_provider_references")
    .select("provider_id,provider_session_id")
    .eq("lab_session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw dependency("Unable to load lab provider reference");
  return data ? {
    providerId: String(data.provider_id),
    providerSessionId: String(data.provider_session_id)
  } : null;
}

export async function attestLabIsolation(
  accessToken: string,
  userId: string,
  sessionId: string
): Promise<LabIsolationAttestation> {
  const session = await getLabSession(accessToken, sessionId);
  if (!["ready", "active", "degraded"].includes(session.state)) {
    throw new AppError({
      code: "CONFLICT",
      message: "Isolation can be checked only for a provisioned lab session",
      retryable: false
    });
  }

  const ref = await getProviderReference(userId, sessionId);
  if (!ref || ref.providerId !== "mock") {
    throw dependency("Lab provider isolation state is unavailable");
  }

  const status = await mockLabProvider.getIsolationStatus(ref.providerSessionId);
  if (
    status.studentHasProviderAdminAccess ||
    status.managementPlaneExposed ||
    !status.networkIsolationEnforced ||
    !status.resourceOwnershipScoped
  ) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Lab isolation requirements are not satisfied",
      retryable: false
    });
  }

  return {
    sessionId,
    providerId: ref.providerId,
    isolationMode: "mock-isolated",
    studentHasProviderAdminAccess: false,
    managementPlaneExposed: false,
    networkIsolationEnforced: true,
    resourceOwnershipScoped: true,
    checkedAt: new Date().toISOString()
  };
}

async function createOperation(sessionId: string, userId: string, kind: LabOperationKind) {
  const server = createServerSupabaseClient();
  const { data, error } = await server
    .from("lab_operations")
    .insert({ lab_session_id: sessionId, user_id: userId, kind, state: "pending", attempt_count: 0 })
    .select("id,lab_session_id,kind,state,attempt_count,next_attempt_at,last_error_code,last_error_message,created_at,updated_at")
    .single();
  if (error || !data) throw dependency("Unable to create lab operation");
  return mapOperation(data as Record<string, unknown>);
}

async function setSessionState(userId: string, sessionId: string, state: LabSessionState, patch: Record<string, unknown> = {}) {
  const server = createServerSupabaseClient();
  const { error } = await server
    .from("lab_sessions")
    .update({ lifecycle_state: state, ...patch })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) throw dependency("Unable to update lab session");
}

export async function expireLabSession(accessToken: string, userId: string, sessionId: string): Promise<LabOperationRecord> {
  await getLabSession(accessToken, sessionId);
  const op = await createOperation(sessionId, userId, "expire");
  const now = new Date().toISOString();
  await setSessionState(userId, sessionId, "expired", { access_revoked_at: now, last_activity_at: now });
  const server = createServerSupabaseClient();
  await server.from("lab_operations").update({ state: "succeeded", attempt_count: 1 }).eq("id", op.id);
  writeAuditEvent({ eventType: "lab.session.expired", outcome: "success", actorId: userId, targetType: "lab_session", targetId: sessionId });
  return { ...op, state: "succeeded", attemptCount: 1, updatedAt: now };
}

export async function cleanupLabSessionResources(accessToken: string, userId: string, sessionId: string): Promise<LabOperationRecord> {
  const session = await getLabSession(accessToken, sessionId);
  if (session.state === "terminated") {
    const op = await createOperation(sessionId, userId, "cleanup");
    return { ...op, state: "succeeded" };
  }

  const op = await createOperation(sessionId, userId, "cleanup");
  const attemptCount = 1;
  const server = createServerSupabaseClient();
  await server.from("lab_operations").update({ state: "running", attempt_count: attemptCount }).eq("id", op.id);
  await setSessionState(userId, sessionId, "cleaning", { cleanup_state: "cleaning", access_revoked_at: new Date().toISOString() });

  try {
    const ref = await getProviderReference(userId, sessionId);
    if (ref) {
      if (ref.providerId !== "mock") throw dependency("Unsupported provider for cleanup");
      await mockLabProvider.destroy(ref.providerSessionId);
    }
    const now = new Date().toISOString();
    await setSessionState(userId, sessionId, "terminated", { cleanup_state: "complete", last_activity_at: now, failure_code: null, failure_message: null });
    await server.from("lab_operations").update({ state: "succeeded" }).eq("id", op.id);
    return { ...op, state: "succeeded", attemptCount, updatedAt: now };
  } catch (error) {
    const retryable = canRetryLabOperation(attemptCount);
    const nextAttemptAt = retryable
      ? new Date(Date.now() + nextLabOperationDelaySeconds(attemptCount) * 1000).toISOString()
      : undefined;
    await setSessionState(userId, sessionId, retryable ? "cleanup_failed" : "recovery_required", {
      cleanup_state: "failed",
      failure_code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      failure_message: retryable ? "Lab cleanup will be retried automatically." : "Lab cleanup requires operational attention."
    });
    await server.from("lab_operations").update({
      state: "failed",
      ...(nextAttemptAt ? { next_attempt_at: nextAttemptAt } : {}),
      last_error_code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      last_error_message: retryable ? "Cleanup failed; retry is scheduled." : "Cleanup failed repeatedly; recovery is required."
    }).eq("id", op.id);
    return {
      ...op,
      state: "failed",
      attemptCount,
      ...(nextAttemptAt ? { nextAttemptAt } : {}),
      updatedAt: new Date().toISOString()
    };
  }
}

export async function recoverLabSession(accessToken: string, userId: string, sessionId: string): Promise<LabOperationRecord> {
  const session = await getLabSession(accessToken, sessionId);
  if (!["cleanup_failed", "recovery_required", "degraded"].includes(session.state)) {
    throw new AppError({ code: "CONFLICT", message: "This lab session does not require recovery", retryable: false });
  }
  const op = await createOperation(sessionId, userId, "recover");
  const cleanup = await cleanupLabSessionResources(accessToken, userId, sessionId);
  const succeeded = cleanup.state === "succeeded";
  const server = createServerSupabaseClient();
  await server.from("lab_operations").update({ state: succeeded ? "succeeded" : "failed", attempt_count: 1 }).eq("id", op.id);
  return { ...op, state: succeeded ? "succeeded" : "failed", attemptCount: 1, updatedAt: new Date().toISOString() };
}

export async function listLabOperations(accessToken: string, sessionId: string): Promise<LabOperationRecord[]> {
  await getLabSession(accessToken, sessionId);
  const user = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await user
    .from("lab_operations")
    .select("id,lab_session_id,kind,state,attempt_count,next_attempt_at,last_error_code,last_error_message,created_at,updated_at")
    .eq("lab_session_id", sessionId)
    .order("created_at", { ascending: false });
  if (error) throw dependency("Unable to load lab operations");
  return (data ?? []).map((row) => mapOperation(row as Record<string, unknown>));
}

export async function processDueLabOperations(): Promise<number> {
  const server = createServerSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await server
    .from("lab_operations")
    .select("id,lab_session_id,user_id,kind,attempt_count")
    .eq("state", "failed")
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(25);
  if (error) throw dependency("Unable to load due lab operations");

  let processed = 0;
  for (const row of data ?? []) {
    if (String(row.kind) !== "cleanup") continue;
    const nextAttempt = Number(row.attempt_count) + 1;
    const retryable = canRetryLabOperation(nextAttempt);
    await server.from("lab_operations").update({
      attempt_count: nextAttempt,
      next_attempt_at: retryable
        ? new Date(Date.now() + nextLabOperationDelaySeconds(nextAttempt) * 1000).toISOString()
        : null
    }).eq("id", String(row.id));
    if (!retryable) {
      await server.from("lab_sessions").update({
        lifecycle_state: "recovery_required",
        cleanup_state: "failed",
        failure_message: "Lab cleanup requires operational attention."
      }).eq("id", String(row.lab_session_id)).eq("user_id", String(row.user_id));
    }
    processed += 1;
  }
  return processed;
}
