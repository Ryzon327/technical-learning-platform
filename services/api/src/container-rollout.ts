import {
  AppError,
  evaluateLabProviderRollout,
  type LabProviderActivationState,
  type LabProviderRolloutDecision,
  type LabProviderRolloutMode,
  type LabProviderRolloutPolicy
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { createServerSupabaseClient } from "./supabase";

interface ProviderRegistryRow {
  provider_id: string;
  enabled: boolean;
  activation_state: LabProviderActivationState;
  rollout_mode: LabProviderRolloutMode;
  rollout_percentage: number;
  rollout_allowed_user_ids: string[] | null;
  updated_at: string;
  last_canary_passed_at: string | null;
}

function dependency(message: string): AppError {
  return new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });
}

function mapPolicy(
  row: ProviderRegistryRow
): LabProviderRolloutPolicy {
  return {
    providerId: row.provider_id,
    activationState: row.activation_state,
    rolloutMode: row.rollout_mode,
    rolloutPercentage: row.rollout_percentage,
    allowedUserIds: row.rollout_allowed_user_ids ?? [],
    updatedAt: row.updated_at
  };
}

export async function getContainerProviderRolloutPolicy(): Promise<LabProviderRolloutPolicy> {
  const server = createServerSupabaseClient();

  const { data, error } = await server
    .from("lab_provider_registry")
    .select(
      "provider_id,enabled,activation_state,rollout_mode,rollout_percentage,rollout_allowed_user_ids,updated_at,last_canary_passed_at"
    )
    .eq("provider_id", "container")
    .maybeSingle();

  if (error) {
    throw dependency("Unable to load Container Provider rollout policy");
  }

  if (!data) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Container Provider registry entry was not found",
      retryable: false
    });
  }

  return mapPolicy(data as ProviderRegistryRow);
}

export async function evaluateContainerProviderRollout(
  userId: string
): Promise<LabProviderRolloutDecision> {
  const policy = await getContainerProviderRolloutPolicy();
  return evaluateLabProviderRollout(policy, userId);
}

export async function activateContainerProvider(input: {
  actorUserId: string;
  rolloutMode: LabProviderRolloutMode;
  rolloutPercentage?: number;
  allowedUserIds?: string[];
}): Promise<LabProviderRolloutPolicy> {
  const server = createServerSupabaseClient();

  const { data: current, error: currentError } = await server
    .from("lab_provider_registry")
    .select(
      "provider_id,enabled,activation_state,rollout_mode,rollout_percentage,rollout_allowed_user_ids,updated_at,last_canary_passed_at"
    )
    .eq("provider_id", "container")
    .maybeSingle();

  if (currentError) {
    throw dependency("Unable to load Container Provider activation state");
  }

  if (!current) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Container Provider registry entry was not found",
      retryable: false
    });
  }

  const row = current as ProviderRegistryRow;

  if (
    row.activation_state !== "canary_eligible" &&
    row.activation_state !== "enabled"
  ) {
    throw new AppError({
      code: "FORBIDDEN",
      message:
        "Container Provider cannot be activated until a passing canary establishes eligibility",
      retryable: false
    });
  }

  if (!row.last_canary_passed_at) {
    throw new AppError({
      code: "FORBIDDEN",
      message:
        "Container Provider activation requires recorded passing canary evidence",
      retryable: false
    });
  }

  const rolloutPercentage =
    input.rolloutMode === "percentage"
      ? Math.max(
          0,
          Math.min(
            100,
            Math.trunc(input.rolloutPercentage ?? 0)
          )
        )
      : input.rolloutMode === "all"
        ? 100
        : 0;

  const allowedUserIds =
    input.rolloutMode === "allowlist"
      ? [...new Set(input.allowedUserIds ?? [])]
      : [];

  if (
    input.rolloutMode === "allowlist" &&
    allowedUserIds.length === 0
  ) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message:
        "Allowlist rollout requires at least one explicit user ID",
      retryable: false
    });
  }

  if (
    input.rolloutMode === "percentage" &&
    rolloutPercentage === 0
  ) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message:
        "Percentage rollout requires a value between 1 and 100",
      retryable: false
    });
  }

  const { data: updated, error: updateError } = await server
    .from("lab_provider_registry")
    .update({
      enabled: true,
      activation_state: "enabled",
      rollout_mode: input.rolloutMode,
      rollout_percentage: rolloutPercentage,
      rollout_allowed_user_ids: allowedUserIds
    })
    .eq("provider_id", "container")
    .select(
      "provider_id,enabled,activation_state,rollout_mode,rollout_percentage,rollout_allowed_user_ids,updated_at,last_canary_passed_at"
    )
    .single();

  if (updateError) {
    throw dependency("Unable to activate Container Provider");
  }

  writeAuditEvent({
    eventType: "lab.provider.container.activated",
    outcome: "success",
    actorId: input.actorUserId,
    targetType: "lab_provider",
    targetId: "container",
    metadata: {
      rolloutMode: input.rolloutMode,
      rolloutPercentage,
      allowlistSize: allowedUserIds.length
    }
  });

  return mapPolicy(updated as ProviderRegistryRow);
}

export async function suspendContainerProvider(input: {
  actorUserId: string;
  reason: string;
}): Promise<LabProviderRolloutPolicy> {
  if (!input.reason.trim()) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Suspension reason is required",
      retryable: false
    });
  }

  const server = createServerSupabaseClient();

  const { data, error } = await server
    .from("lab_provider_registry")
    .update({
      enabled: false,
      activation_state: "suspended",
      rollout_mode: "off",
      rollout_percentage: 0,
      rollout_allowed_user_ids: []
    })
    .eq("provider_id", "container")
    .select(
      "provider_id,enabled,activation_state,rollout_mode,rollout_percentage,rollout_allowed_user_ids,updated_at,last_canary_passed_at"
    )
    .single();

  if (error) {
    throw dependency("Unable to suspend Container Provider");
  }

  writeAuditEvent({
    eventType: "lab.provider.container.suspended",
    outcome: "success",
    actorId: input.actorUserId,
    targetType: "lab_provider",
    targetId: "container",
    metadata: {
      reason: input.reason.trim()
    }
  });

  return mapPolicy(data as ProviderRegistryRow);
}

export async function disableContainerProvider(input: {
  actorUserId: string;
  reason: string;
}): Promise<LabProviderRolloutPolicy> {
  if (!input.reason.trim()) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Disable reason is required",
      retryable: false
    });
  }

  const server = createServerSupabaseClient();

  const { data, error } = await server
    .from("lab_provider_registry")
    .update({
      enabled: false,
      activation_state: "disabled",
      rollout_mode: "off",
      rollout_percentage: 0,
      rollout_allowed_user_ids: []
    })
    .eq("provider_id", "container")
    .select(
      "provider_id,enabled,activation_state,rollout_mode,rollout_percentage,rollout_allowed_user_ids,updated_at,last_canary_passed_at"
    )
    .single();

  if (error) {
    throw dependency("Unable to disable Container Provider");
  }

  writeAuditEvent({
    eventType: "lab.provider.container.disabled",
    outcome: "success",
    actorId: input.actorUserId,
    targetType: "lab_provider",
    targetId: "container",
    metadata: {
      reason: input.reason.trim()
    }
  });

  return mapPolicy(data as ProviderRegistryRow);
}
