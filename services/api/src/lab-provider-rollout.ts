/**
 * Wave 6 / Batch 10 — Controlled Container Provider rollout policy.
 *
 * This module is intentionally PURE:
 *   - no database access
 *   - no network access
 *   - no filesystem access
 *   - no randomness of any kind in the rollout path (see the deterministic
 *     SHA-256 bucketing below)
 *   - no AI or model-inference dependencies of any kind
 *
 * It evaluates the persisted control-plane row from `public.lab_provider_registry`
 * and answers exactly one question:
 *
 *   "Is this provider permitted to be selected for a NEW lab session for this
 *    user, right now?"
 *
 * It deliberately says nothing about already-provisioned sessions. Once a
 * session exists, `lab_session_provider_references.provider_id` is authoritative
 * and rollout policy is NOT consulted again (see lab-provider-selection.ts).
 */

import { createHash } from "node:crypto";

export const MOCK_PROVIDER_ID = "mock";
export const CONTAINER_PROVIDER_ID = "container";

export const SUPPORTED_LAB_PROVIDER_IDS = [
  MOCK_PROVIDER_ID,
  CONTAINER_PROVIDER_ID,
] as const;

export type SupportedLabProviderId = (typeof SUPPORTED_LAB_PROVIDER_IDS)[number];

/** Number of deterministic buckets used by percentage rollout (0..99). */
export const ROLLOUT_BUCKET_COUNT = 100;

/**
 * Namespaced hash input prefix. Changing this value re-shuffles every user's
 * bucket, so it is treated as a stable protocol constant.
 */
export const CONTAINER_ROLLOUT_HASH_NAMESPACE = "tlp:container-rollout:";

export type LabProviderRolloutMode = "off" | "allowlist" | "percentage" | "all";

export const LAB_PROVIDER_ROLLOUT_MODES: readonly LabProviderRolloutMode[] = [
  "off",
  "allowlist",
  "percentage",
  "all",
];

/**
 * Normalized shape of a `public.lab_provider_registry` row.
 * Field names mirror the persisted columns in camelCase.
 */
export interface LabProviderRegistryRecord {
  providerId: string;
  providerType: string | null;
  enabled: boolean;
  priority: number | null;
  configuration: Record<string, unknown> | null;
  activationState: string | null;
  lastCanaryPassedAt: string | null;
  rolloutMode: string | null;
  rolloutPercentage: number | null;
  rolloutAllowedUserIds: string[];
}

export type ControlPlaneDenialReason =
  | "PROVIDER_ID_UNSUPPORTED"
  | "PROVIDER_RECORD_MISSING"
  | "PROVIDER_REGISTRY_DISABLED"
  | "PROVIDER_ACTIVATION_STATE_NOT_ENABLED"
  | "ROLLOUT_MODE_OFF"
  | "ROLLOUT_MODE_UNKNOWN"
  | "ROLLOUT_USER_ID_MISSING"
  | "ROLLOUT_USER_NOT_ALLOWLISTED"
  | "ROLLOUT_PERCENTAGE_BUCKET_EXCLUDED";

export type ControlPlaneAllowReason =
  | "CONTROL_PLANE_RECORD_ABSENT_LEGACY_PROVIDER"
  | "ROLLOUT_NOT_REQUIRED"
  | "ROLLOUT_MODE_ALL"
  | "ROLLOUT_USER_ALLOWLISTED"
  | "ROLLOUT_PERCENTAGE_BUCKET_INCLUDED";

export type ControlPlaneReason = ControlPlaneDenialReason | ControlPlaneAllowReason;

export interface ControlPlaneEvaluation {
  providerId: string;
  /** True only when a NEW session may be provisioned on this provider. */
  allowed: boolean;
  reason: ControlPlaneReason;
  mode: LabProviderRolloutMode | "unknown" | "not-required";
  /** Deterministic bucket 0..99, only populated for percentage rollout. */
  bucket: number | null;
  percentage: number;
}

export function isSupportedLabProviderId(
  providerId: unknown,
): providerId is SupportedLabProviderId {
  return (
    typeof providerId === "string" &&
    (SUPPORTED_LAB_PROVIDER_IDS as readonly string[]).includes(providerId)
  );
}

/**
 * Only the Container provider is behind the controlled rollout gate. Mock is
 * the safe fallback provider and is governed by `enabled` / `activation_state`
 * alone.
 */
export function requiresControlledRollout(providerId: string): boolean {
  return providerId === CONTAINER_PROVIDER_ID;
}

export function normalizeRolloutMode(
  value: unknown,
): LabProviderRolloutMode | "unknown" {
  if (typeof value !== "string") {
    return "unknown";
  }
  const normalized = value.trim().toLowerCase();
  return (LAB_PROVIDER_ROLLOUT_MODES as readonly string[]).includes(normalized)
    ? (normalized as LabProviderRolloutMode)
    : "unknown";
}

/** Clamps any persisted value into an integer percentage 0..100. Fails low. */
export function normalizeRolloutPercentage(value: unknown): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric <= 0) {
    return 0;
  }
  if (numeric >= ROLLOUT_BUCKET_COUNT) {
    return ROLLOUT_BUCKET_COUNT;
  }
  return Math.floor(numeric);
}

export function normalizeAllowedUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      seen.add(entry.trim());
    }
  }
  return [...seen];
}

/**
 * Deterministic, stable bucketing.
 *
 * SHA-256 over a namespaced user identifier, first 32 bits of the digest taken
 * big-endian and reduced modulo 100. The same user always maps to the same
 * bucket for the lifetime of the namespace constant. No randomness, no
 * persisted assignment.
 */
export function computeRolloutBucket(
  userId: string,
  namespace: string = CONTAINER_ROLLOUT_HASH_NAMESPACE,
): number {
  const digest = createHash("sha256").update(`${namespace}${userId}`).digest();
  const b0 = digest[0] ?? 0;
  const b1 = digest[1] ?? 0;
  const b2 = digest[2] ?? 0;
  const b3 = digest[3] ?? 0;
  const value = ((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3;
  return (value >>> 0) % ROLLOUT_BUCKET_COUNT;
}

/** `true` when the user's deterministic bucket falls inside the rollout. */
export function isUserInRolloutPercentage(
  userId: string,
  percentage: unknown,
  namespace: string = CONTAINER_ROLLOUT_HASH_NAMESPACE,
): boolean {
  const normalized = normalizeRolloutPercentage(percentage);
  if (normalized <= 0 || typeof userId !== "string" || userId.length === 0) {
    return false;
  }
  return computeRolloutBucket(userId, namespace) < normalized;
}

function isActivationStateEnabled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "enabled";
}

function deny(
  providerId: string,
  reason: ControlPlaneDenialReason,
  mode: ControlPlaneEvaluation["mode"],
  percentage: number,
  bucket: number | null = null,
): ControlPlaneEvaluation {
  return { providerId, allowed: false, reason, mode, bucket, percentage };
}

function allow(
  providerId: string,
  reason: ControlPlaneAllowReason,
  mode: ControlPlaneEvaluation["mode"],
  percentage: number,
  bucket: number | null = null,
): ControlPlaneEvaluation {
  return { providerId, allowed: true, reason, mode, bucket, percentage };
}

export interface ControlPlaneEvaluationOptions {
  /**
   * When true, a missing registry row denies selection. Defaults to `true` for
   * providers behind controlled rollout (Container) so the control plane fails
   * closed, and `false` for legacy/default providers (Mock) which must keep
   * working even if the registry table has no row for them.
   */
  requireRecord?: boolean;
  namespace?: string;
}

/**
 * Evaluates whether a provider may be selected for a NEW session for `userId`.
 *
 * This is the single place where the persisted rollout policy is interpreted.
 */
export function evaluateProviderControlPlane(
  providerId: string,
  record: LabProviderRegistryRecord | null | undefined,
  userId: string,
  options: ControlPlaneEvaluationOptions = {},
): ControlPlaneEvaluation {
  const gated = requiresControlledRollout(providerId);
  const requireRecord = options.requireRecord ?? gated;
  const namespace = options.namespace ?? CONTAINER_ROLLOUT_HASH_NAMESPACE;

  if (!isSupportedLabProviderId(providerId)) {
    return deny(String(providerId), "PROVIDER_ID_UNSUPPORTED", "unknown", 0);
  }

  if (!record) {
    return requireRecord
      ? deny(providerId, "PROVIDER_RECORD_MISSING", "unknown", 0)
      : allow(
          providerId,
          "CONTROL_PLANE_RECORD_ABSENT_LEGACY_PROVIDER",
          "not-required",
          0,
        );
  }

  const percentage = normalizeRolloutPercentage(record.rolloutPercentage);
  const mode = normalizeRolloutMode(record.rolloutMode);

  if (record.enabled !== true) {
    return deny(providerId, "PROVIDER_REGISTRY_DISABLED", mode, percentage);
  }

  const activationState = record.activationState ?? null;
  const activationOk = gated
    ? isActivationStateEnabled(activationState)
    : activationState === null ||
      activationState.trim() === "" ||
      isActivationStateEnabled(activationState);

  if (!activationOk) {
    return deny(
      providerId,
      "PROVIDER_ACTIVATION_STATE_NOT_ENABLED",
      mode,
      percentage,
    );
  }

  if (!gated) {
    return allow(providerId, "ROLLOUT_NOT_REQUIRED", "not-required", percentage);
  }

  switch (mode) {
    case "off":
      return deny(providerId, "ROLLOUT_MODE_OFF", mode, percentage);

    case "all":
      return allow(providerId, "ROLLOUT_MODE_ALL", mode, percentage);

    case "allowlist": {
      if (typeof userId !== "string" || userId.trim().length === 0) {
        return deny(providerId, "ROLLOUT_USER_ID_MISSING", mode, percentage);
      }
      const allowlist = normalizeAllowedUserIds(record.rolloutAllowedUserIds);
      return allowlist.includes(userId.trim())
        ? allow(providerId, "ROLLOUT_USER_ALLOWLISTED", mode, percentage)
        : deny(providerId, "ROLLOUT_USER_NOT_ALLOWLISTED", mode, percentage);
    }

    case "percentage": {
      if (typeof userId !== "string" || userId.trim().length === 0) {
        return deny(providerId, "ROLLOUT_USER_ID_MISSING", mode, percentage);
      }
      const bucket = computeRolloutBucket(userId.trim(), namespace);
      return bucket < percentage
        ? allow(
            providerId,
            "ROLLOUT_PERCENTAGE_BUCKET_INCLUDED",
            mode,
            percentage,
            bucket,
          )
        : deny(
            providerId,
            "ROLLOUT_PERCENTAGE_BUCKET_EXCLUDED",
            mode,
            percentage,
            bucket,
          );
    }

    default:
      // Unknown / unparseable persisted mode fails closed.
      return deny(providerId, "ROLLOUT_MODE_UNKNOWN", "unknown", percentage);
  }
}

/** Convenience wrapper used by the Container-specific call sites. */
export function evaluateContainerRollout(
  record: LabProviderRegistryRecord | null | undefined,
  userId: string,
  options: ControlPlaneEvaluationOptions = {},
): ControlPlaneEvaluation {
  return evaluateProviderControlPlane(
    CONTAINER_PROVIDER_ID,
    record,
    userId,
    options,
  );
}

function readField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) {
      return row[key];
    }
  }
  return undefined;
}

function toNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

/**
 * Maps a raw `lab_provider_registry` row (snake_case from SQL, or camelCase
 * from an ORM) into the normalized record shape.
 */
export function mapLabProviderRegistryRow(
  row: Record<string, unknown>,
): LabProviderRegistryRecord {
  const priorityRaw = readField(row, "priority");
  const priority =
    typeof priorityRaw === "number"
      ? priorityRaw
      : typeof priorityRaw === "string" && priorityRaw.trim() !== ""
        ? Number(priorityRaw)
        : null;

  const configurationRaw = readField(row, "configuration");
  let configuration: Record<string, unknown> | null = null;
  if (configurationRaw && typeof configurationRaw === "object") {
    configuration = configurationRaw as Record<string, unknown>;
  } else if (typeof configurationRaw === "string") {
    try {
      const parsed: unknown = JSON.parse(configurationRaw);
      configuration =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
    } catch {
      configuration = null;
    }
  }

  return {
    providerId: String(readField(row, "provider_id", "providerId") ?? ""),
    providerType: toNullableString(readField(row, "provider_type", "providerType")),
    enabled: readField(row, "enabled") === true,
    priority: priority !== null && Number.isFinite(priority) ? priority : null,
    configuration,
    activationState: toNullableString(
      readField(row, "activation_state", "activationState"),
    ),
    lastCanaryPassedAt: toNullableString(
      readField(row, "last_canary_passed_at", "lastCanaryPassedAt"),
    ),
    rolloutMode: toNullableString(readField(row, "rollout_mode", "rolloutMode")),
    rolloutPercentage: normalizeRolloutPercentage(
      readField(row, "rollout_percentage", "rolloutPercentage"),
    ),
    rolloutAllowedUserIds: normalizeAllowedUserIds(
      readField(row, "rollout_allowed_user_ids", "rolloutAllowedUserIds"),
    ),
  };
}
