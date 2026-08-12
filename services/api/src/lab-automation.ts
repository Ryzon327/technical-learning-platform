import {
  AppError,
  shouldProvisionQueuedSession,
  type LabAutomationCycleResult,
  type LabDefinition,
  type LabProviderOperationalSnapshot
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { processDueLabOperations } from "./lab-operations";
import { mockLabProvider } from "./mock-lab-provider";
import { createServerSupabaseClient } from "./supabase";

const dependency = (message: string) =>
  new AppError({ code: "DEPENDENCY_UNAVAILABLE", message, retryable: true });

function mapDefinition(row: Record<string, unknown>): LabDefinition {
  return {
    stableId: String(row.stable_id), version: Number(row.version), name: String(row.name),
    description: String(row.description ?? ""), missionStableId: String(row.mission_stable_id),
    competencyStableIds: Array.isArray(row.competency_stable_ids) ? row.competency_stable_ids.map(String) : [],
    requiredCapabilities: Array.isArray(row.required_capabilities) ? row.required_capabilities.map(String) : [],
    resources: Array.isArray(row.resources) ? row.resources as LabDefinition["resources"] : [],
    accessMethods: Array.isArray(row.access_methods) ? row.access_methods as LabDefinition["accessMethods"] : [],
    estimatedDurationMinutes: Number(row.estimated_duration_minutes), sessionLimitMinutes: Number(row.session_limit_minutes),
    validationProfileStableId: String(row.validation_profile_stable_id),
    resetStrategy: String(row.reset_strategy) as LabDefinition["resetStrategy"],
    safety: row.safety as LabDefinition["safety"], accessibility: row.accessibility as LabDefinition["accessibility"],
    dataPersistencePolicy: String(row.data_persistence_policy) as LabDefinition["dataPersistencePolicy"],
    publicationState: String(row.publication_state) as LabDefinition["publicationState"]
  };
}

export async function captureLabProviderOperationalSnapshot(): Promise<LabProviderOperationalSnapshot> {
  const checkedAt = new Date().toISOString();
  const server = createServerSupabaseClient();
  try {
    const [health, capacity] = await Promise.all([mockLabProvider.getHealth(), mockLabProvider.getCapacity()]);
    const snapshot: LabProviderOperationalSnapshot = {
      providerId: mockLabProvider.providerId, healthState: health.state,
      ...(health.detail ? { healthDetail: health.detail } : {}),
      capacityAvailable: capacity.available, activeSessions: capacity.activeSessions,
      maximumSessions: capacity.maximumSessions, checkedAt
    };
    const { error } = await server.from("lab_provider_operational_snapshots").insert({
      provider_id: snapshot.providerId, health_state: snapshot.healthState,
      health_detail: snapshot.healthDetail ?? null, capacity_available: snapshot.capacityAvailable,
      active_sessions: snapshot.activeSessions, maximum_sessions: snapshot.maximumSessions, checked_at: checkedAt
    });
    if (error) throw dependency("Unable to persist lab provider operational snapshot");
    return snapshot;
  } catch (error) {
    const snapshot: LabProviderOperationalSnapshot = {
      providerId: mockLabProvider.providerId, healthState: "unavailable",
      healthDetail: error instanceof Error ? error.message : "Provider status unavailable",
      capacityAvailable: false, activeSessions: 0, maximumSessions: 0, checkedAt
    };
    await server.from("lab_provider_operational_snapshots").insert({
      provider_id: snapshot.providerId, health_state: snapshot.healthState,
      health_detail: snapshot.healthDetail ?? null, capacity_available: false,
      active_sessions: 0, maximum_sessions: 0, checked_at: checkedAt
    });
    return snapshot;
  }
}

export async function expireDueLabSessions(): Promise<number> {
  const server = createServerSupabaseClient();
  const now = new Date().toISOString();
  const { data: sessions, error } = await server.from("lab_sessions")
    .select("id,user_id,lifecycle_state")
    .in("lifecycle_state", ["queued","provisioning","ready","active","validating","completed","degraded"])
    .lte("expires_at", now).order("expires_at", { ascending: true }).limit(50);
  if (error) throw dependency("Unable to load expiring lab sessions");
  let expired = 0;
  for (const row of sessions ?? []) {
    const sessionId = String(row.id); const userId = String(row.user_id);
    const { data: changed, error: updateError } = await server.from("lab_sessions")
      .update({ lifecycle_state: "expired", access_revoked_at: now, last_activity_at: now })
      .eq("id", sessionId).eq("user_id", userId).eq("lifecycle_state", String(row.lifecycle_state))
      .select("id").maybeSingle();
    if (updateError) throw dependency("Unable to expire lab session");
    if (!changed) continue;
    const { error: opError } = await server.from("lab_operations").insert({
      lab_session_id: sessionId, user_id: userId, kind: "cleanup", state: "pending",
      attempt_count: 0, next_attempt_at: now
    });
    if (opError && opError.code !== "23505") throw dependency("Unable to schedule cleanup for expired lab session");
    writeAuditEvent({ eventType: "lab.session.auto_expired", outcome: "success", actorId: userId, targetType: "lab_session", targetId: sessionId });
    expired += 1;
  }
  return expired;
}

async function loadQueuedDefinition(stableId: string, version: number): Promise<LabDefinition> {
  const server = createServerSupabaseClient();
  const { data, error } = await server.from("lab_definitions")
    .select("stable_id,version,name,description,mission_stable_id,competency_stable_ids,required_capabilities,resources,access_methods,estimated_duration_minutes,session_limit_minutes,validation_profile_stable_id,reset_strategy,safety,accessibility,data_persistence_policy,publication_state")
    .eq("stable_id", stableId).eq("version", version).eq("publication_state", "published").maybeSingle();
  if (error) throw dependency("Unable to load queued lab definition");
  if (!data) throw new AppError({ code: "NOT_FOUND", message: "Queued lab definition is no longer published", retryable: false });
  return mapDefinition(data as Record<string, unknown>);
}

export async function drainQueuedLabSessions(snapshot: LabProviderOperationalSnapshot): Promise<{ provisioned: number; failed: number }> {
  if (!shouldProvisionQueuedSession(snapshot.healthState, snapshot.capacityAvailable)) return { provisioned: 0, failed: 0 };
  const server = createServerSupabaseClient();
  const { data: queued, error } = await server.from("lab_sessions")
    .select("id,user_id,lab_definition_stable_id,lab_definition_version,requested_at")
    .eq("lifecycle_state", "queued").order("requested_at", { ascending: true }).limit(25);
  if (error) throw dependency("Unable to load queued lab sessions");
  let provisioned = 0; let failed = 0;
  for (const row of queued ?? []) {
    const capacity = await mockLabProvider.getCapacity();
    const health = await mockLabProvider.getHealth();
    if (!shouldProvisionQueuedSession(health.state, capacity.available)) break;
    const sessionId = String(row.id); const userId = String(row.user_id);
    const { data: claimed, error: claimError } = await server.from("lab_sessions")
      .update({ lifecycle_state: "provisioning", provider_id: mockLabProvider.providerId, cleanup_state: "pending" })
      .eq("id", sessionId).eq("user_id", userId).eq("lifecycle_state", "queued").select("id").maybeSingle();
    if (claimError) throw dependency("Unable to claim queued lab session");
    if (!claimed) continue;
    try {
      const definition = await loadQueuedDefinition(String(row.lab_definition_stable_id), Number(row.lab_definition_version));
      const providerSession = await mockLabProvider.provision({ definition, userId });
      const { error: refError } = await server.from("lab_session_provider_references").upsert({
        lab_session_id: sessionId, user_id: userId, provider_id: providerSession.providerId,
        provider_session_id: providerSession.providerSessionId
      }, { onConflict: "lab_session_id" });
      if (refError) throw dependency("Unable to persist queued provider reference");
      const readyAt = new Date().toISOString();
      const { error: readyError } = await server.from("lab_sessions").update({
        lifecycle_state: "ready", ready_at: readyAt, last_activity_at: readyAt,
        failure_code: null, failure_message: null
      }).eq("id", sessionId).eq("user_id", userId).eq("lifecycle_state", "provisioning");
      if (readyError) throw dependency("Unable to mark queued lab ready");
      writeAuditEvent({ eventType: "lab.session.queue_provisioned", outcome: "success", actorId: userId, targetType: "lab_session", targetId: sessionId });
      provisioned += 1;
    } catch (error) {
      await server.from("lab_sessions").update({
        lifecycle_state: "provisioning_failed",
        failure_code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
        failure_message: "The queued lab could not be prepared. It can be retried without learning penalty."
      }).eq("id", sessionId).eq("user_id", userId);
      writeAuditEvent({ eventType: "lab.session.queue_provisioning_failed", outcome: "failure", actorId: userId, targetType: "lab_session", targetId: sessionId });
      failed += 1;
    }
  }
  return { provisioned, failed };
}

export async function runLabAutomationCycle(): Promise<LabAutomationCycleResult> {
  const startedAt = new Date().toISOString();
  const snapshot = await captureLabProviderOperationalSnapshot();
  const sessionsExpired = await expireDueLabSessions();
  const cleanupOperationsProcessed = await processDueLabOperations();
  const queue = await drainQueuedLabSessions(snapshot);
  const completedAt = new Date().toISOString();
  const result: LabAutomationCycleResult = {
    startedAt, completedAt, providerId: snapshot.providerId,
    healthState: snapshot.healthState, capacityAvailable: snapshot.capacityAvailable,
    sessionsExpired, queuedSessionsProvisioned: queue.provisioned,
    queuedSessionsFailed: queue.failed, cleanupOperationsProcessed
  };
  const server = createServerSupabaseClient();
  const { error } = await server.from("lab_automation_cycles").insert({
    started_at: result.startedAt, completed_at: result.completedAt,
    provider_id: result.providerId, health_state: result.healthState,
    capacity_available: result.capacityAvailable, sessions_expired: result.sessionsExpired,
    queued_sessions_provisioned: result.queuedSessionsProvisioned,
    queued_sessions_failed: result.queuedSessionsFailed,
    cleanup_operations_processed: result.cleanupOperationsProcessed
  });
  if (error) throw dependency("Unable to persist lab automation cycle");
  return result;
}
